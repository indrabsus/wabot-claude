const path = require("path")
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys")
const { Boom } = require("@hapi/boom")
const qrcodeTerminal = require("qrcode-terminal")
const qrcode = require("qrcode")
const pino = require("pino")

const { handleIncomingMessage } = require("./conversationFlow")
const { normalizeNomor } = require("./phoneUtils")

const AUTH_FOLDER = path.join(__dirname, "..", "auth_session")
const QR_IMAGE_PATH = path.join(__dirname, "..", "qr.png")
const MAX_CHAT_LOG = 50

let sock = null
let waStatus = "not_ready"
const chatLog = []

function getStatus() {
  return waStatus
}

function getChats() {
  return chatLog
}

function pushChatLog(entry) {
  chatLog.unshift(entry)
  if (chatLog.length > MAX_CHAT_LOG) chatLog.length = MAX_CHAT_LOG
}

async function startWhatsapp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER)

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log("Scan QR berikut dengan WhatsApp Anda:")
      qrcodeTerminal.generate(qr, { small: true })
      qrcode
        .toFile(QR_IMAGE_PATH, qr, { width: 400 })
        .then(() => console.log(`QR juga disimpan sebagai gambar: ${QR_IMAGE_PATH}`))
        .catch((error) => console.error("Gagal menyimpan QR sebagai gambar:", error))
    }

    if (connection === "open") {
      waStatus = "ready"
      console.log("WhatsApp bot terhubung (ready).")
    }

    if (connection === "connecting") {
      waStatus = "not_ready"
    }

    if (connection === "close") {
      waStatus = "not_ready"
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut

      console.log(
        "Koneksi WhatsApp terputus.",
        shouldReconnect ? "Mencoba menyambung ulang..." : "Sesi logout, silakan hapus folder auth_session lalu scan ulang QR."
      )

      if (shouldReconnect) {
        startWhatsapp()
      }
    }
  })

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue

      const remoteJid = msg.key.remoteJid
      if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") continue

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        ""

      if (!text.trim()) continue

      console.log(`Pesan masuk dari ${remoteJid.replace("@s.whatsapp.net", "")}: ${text}`)

      pushChatLog({
        nomor: remoteJid.replace("@s.whatsapp.net", ""),
        pesan: text,
        waktu: new Date().toISOString(),
      })

      try {
        await handleIncomingMessage({ sock, remoteJid, text: text.trim() })
      } catch (error) {
        console.error("Gagal memproses pesan masuk:", error)
      }
    }
  })

  return sock
}

async function sendMessage(nomor, pesan) {
  if (!sock || waStatus !== "ready") {
    throw new Error("WhatsApp belum terhubung.")
  }

  const nomorNormalized = normalizeNomor(nomor)
  if (!nomorNormalized) {
    throw new Error("Nomor tujuan tidak valid.")
  }

  const jid = `${nomorNormalized}@s.whatsapp.net`
  await sock.sendMessage(jid, { text: pesan })

  return true
}

module.exports = {
  startWhatsapp,
  sendMessage,
  getStatus,
  getChats,
  normalizeNomor,
}
