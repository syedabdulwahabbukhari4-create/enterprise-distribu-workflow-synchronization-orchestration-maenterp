import express from "express";
import fs from "fs";
import pino from "pino";
import {
makeWASocket,
useMultiFileAuthState,
delay,
makeCacheableSignalKeyStore,
Browsers,
jidNormalizedUser,
fetchLatestBaileysVersion,
DisconnectReason
} from "@whiskeysockets/baileys";

import pn from "awesome-phonenumber";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

/* =========================
   SESSION GENERATOR
========================= */

async function generateShortSession(credsPath) {
try {

const credsData = fs.readFileSync(credsPath, "utf-8");
const base64Creds = Buffer.from(credsData).toString("base64");

return {
sessionId: "ABDUL-MD~",
encodedData: base64Creds
};

} catch (error) {

console.error("Session Generate Error:", error);
return null;

}
}

/* =========================
   DELETE TEMP SESSION
========================= */

function rm(path) {

try {

if (fs.existsSync(path)) {
fs.rmSync(path, {
recursive: true,
force: true
});
}

} catch (e) {

console.log("Delete Error:", e);

}
}

/* =========================
   MAIN ROUTE
========================= */

router.get("/", async (req, res) => {

let num = (req.query.number || "").replace(/[^0-9]/g, "");

if (!num) {
return res.status(400).json({
success: false,
message: "Number required"
});
}

const phone = pn("+" + num);

if (!phone.isValid()) {
return res.status(400).json({
success: false,
message: "Invalid number"
});
}

num = phone.getNumber("e164").replace("+", "");

const dir = "./session_" + num;

rm(dir);

async function startPairing() {

const {
state,
saveCreds
} = await useMultiFileAuthState(dir);

const { version } = await fetchLatestBaileysVersion();

const sock = makeWASocket({

version,

logger: pino({
level: "silent"
}),

printQRInTerminal: false,

browser: Browsers.windows("Firefox"),

markOnlineOnConnect: false,

auth: {
creds: state.creds,
keys: makeCacheableSignalKeyStore(
state.keys,
pino({ level: "silent" })
)
}

});

/* SAVE CREDS */

sock.ev.on("creds.update", saveCreds);

/* CONNECTION UPDATE */

sock.ev.on("connection.update", async ({
connection,
lastDisconnect
}) => {

if (connection === "open") {

try {

await delay(5000);

const credsPath = join(dir, "creds.json");

if (!fs.existsSync(credsPath)) {
throw new Error("creds.json not found");
}

const sessionInfo = await generateShortSession(credsPath);

if (!sessionInfo) {
throw new Error("Session generation failed");
}

const jid = jidNormalizedUser(
num + "@s.whatsapp.net"
);

const completeSession =
`${sessionInfo.sessionId}${sessionInfo.encodedData}`;

/* =========================
   SEND SESSION
========================= */

await sock.sendMessage(jid, {
text: completeSession
});

await delay(2000);

/* =========================
   VCARD
========================= */

const fakeQuoted = {

key: {
fromMe: false,
participant: "0@s.whatsapp.net",
remoteJid: "status@broadcast"
},

message: {
contactMessage: {
displayName: "SYED MD",
vcard: `BEGIN:VCARD
VERSION:3.0
FN:SYED MD
ORG:SYED MD;
TEL;type=CELL;type=VOICE;waid=923000000000:+923000000000
END:VCARD`
}
}

};

/* =========================
   CAPTION
========================= */

const caption = `
╭━━〔 SYED MD 〕━━╮
┃ ✦ OWNER    : 👑 SYED
┃ ✦ BAILEYS  : 🤖 Multi Device
┃ ✦ TYPE     : 💻 NodeJs
┃ ✦ PLATFORM : 🚀 Heroku
┃ ✦ MODE     : ⚙️ Public
┃ ✦ PREFIX   : 🔣 [ . ]
┃ ✦ VERSION  : 🏷️ 8.0.0
╰━━━━━━━━━━━━━━━╯

✨ SESSION CONNECTED SUCCESSFULLY ✨`;

/* =========================
   SEND IMAGE
========================= */

await sock.sendMessage(
jid,
{
image: {
url: "https://raw.githubusercontent.com/syedabdulwahabbukhari4-create/enterprise-distribu-workflow-synchronization-orchestration-maenterp/main/units/bot_image.jpg"
},

caption,

contextInfo: {
mentionedJid: [jid],
forwardingScore: 999,
isForwarded: true
}
},
{
quoted: fakeQuoted
}
);

/* CLEANUP */

await delay(3000);

rm(dir);

console.log("Session Sent Successfully");

} catch (err) {

console.error("PAIR ERROR:", err);

try {

const jid = jidNormalizedUser(
num + "@s.whatsapp.net"
);

await sock.sendMessage(jid, {
text: "❌ Error generating session. Please try again."
});

} catch {}

rm(dir);

}
}

/* CONNECTION CLOSE */

if (connection === "close") {

const reason =
lastDisconnect?.error?.output?.statusCode;

console.log("Connection Closed:", reason);

if (
reason !== DisconnectReason.loggedOut
) {

setTimeout(() => {
startPairing();
}, 3000);

}
}

});

/* REQUEST PAIR */

if (!sock.authState.creds.registered) {

await delay(3000);

try {

let code =
await sock.requestPairingCode(num);

code =
code?.match(/.{1,4}/g)?.join("-") || code;

if (!res.headersSent) {

res.status(200).json({
success: true,
code,
message: "Pairing code generated"
});

}

} catch (err) {

console.error("PAIR CODE ERROR:", err);

if (!res.headersSent) {

res.status(500).json({
success: false,
message: "Failed to generate pairing code"
});

}

rm(dir);

}

}

}

startPairing();

});

/* =========================
   SAFETY
========================= */

process.on("uncaughtException", (err) => {

console.error("UNCAUGHT EXCEPTION:", err);

});

process.on("unhandledRejection", (err) => {

console.error("UNHANDLED REJECTION:", err);

});

export default router;
