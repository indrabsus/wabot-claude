const { normalizeNomor } = require("./phoneUtils")

const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "081380837591"

const TRIGGER_WORDS = [
  "assalamualaikum",
  "assalamu'alaikum",
  "asalamualaikum",
  "halo",
  "hallo",
  "hai",
  "hi",
]

const ROLE_MAP = {
  1: "Guru",
  2: "Siswa",
  3: "Orang Tua",
  4: "Umum",
}

const WELCOME_MESSAGE = `Selamat Datang di SMK Sangkuriang 1 Cimahi
Silakan pilih nomor untuk melanjutkan, anda sebagai apa?

1. Guru
2. Siswa
3. Orang Tua
4. Umum`

// Menyimpan progres percakapan tiap nomor (in-memory, hilang saat proses di-restart)
const sessions = new Map()

function isTrigger(text) {
  const normalized = text.toLowerCase().trim()
  return TRIGGER_WORDS.some((word) => normalized === word || normalized.startsWith(word + " ") || normalized.startsWith(word + ","))
}

async function reply(sock, remoteJid, text) {
  console.log(`Balasan bot ke ${remoteJid.replace("@s.whatsapp.net", "")}: ${text.split("\n")[0]}${text.includes("\n") ? " ..." : ""}`)
  await sock.sendMessage(remoteJid, { text })
}

async function handleIncomingMessage({ sock, remoteJid, text }) {
  const session = sessions.get(remoteJid)

  if (!session) {
    if (isTrigger(text)) {
      sessions.set(remoteJid, { step: "MENU" })
      await reply(sock, remoteJid, WELCOME_MESSAGE)
    }
    return
  }

  if (session.step === "MENU") {
    const role = ROLE_MAP[text.trim()]

    if (!role) {
      await reply(sock, remoteJid, "Pilihan tidak valid. Silakan ketik angka 1-4 sesuai menu di atas.")
      return
    }

    session.role = role
    session.step = "PHONE"
    await reply(sock, remoteJid, "Silakan tuliskan nomor HP Anda:")
    return
  }

  if (session.step === "PHONE") {
    const nomor = text.trim()

    if (!/^[0-9+\-\s]{8,15}$/.test(nomor)) {
      await reply(sock, remoteJid, "Format nomor HP tidak valid. Contoh: 081234567890. Silakan tulis ulang:")
      return
    }

    session.noHp = nomor
    session.step = "FEEDBACK"
    await reply(sock, remoteJid, "Terima kasih. Silakan tuliskan kritik dan saran Anda:")
    return
  }

  if (session.step === "FEEDBACK") {
    session.kritikSaran = text.trim()

    const laporan = `Kritik & Saran Baru - SMK Sangkuriang 1 Cimahi

Sebagai: ${session.role}
No. HP: ${session.noHp}
No. WhatsApp Pengirim: ${remoteJid.replace("@s.whatsapp.net", "")}

Kritik & Saran:
${session.kritikSaran}`

    const adminJid = `${normalizeNomor(ADMIN_NUMBER)}@s.whatsapp.net`

    try {
      await reply(sock, adminJid, laporan)
    } catch (error) {
      console.error("Gagal mengirim laporan ke admin:", error)
    }

    await reply(sock, remoteJid, "Terima kasih, kritik dan saran Anda sudah kami terima.")

    sessions.delete(remoteJid)
  }
}

module.exports = { handleIncomingMessage }
