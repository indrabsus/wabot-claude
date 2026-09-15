const { normalizeNomor, isValidPhone } = require("./phoneUtils")

const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "081380837591"
const SESSION_TIMEOUT_MS = 15 * 60 * 1000 // 15 menit batas inaktivitas sesi

const TRIGGER_WORDS = [
  "assalamualaikum",
  "assalamu'alaikum",
  "asalamualaikum",
  "halo",
  "hallo",
  "hai",
  "hi",
]

const RESET_WORDS = ["batal", "cancel", "reset", "ulang"]

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
4. Umum

(Ketik 'batal' kapan saja untuk membatalkan)`

// Menyimpan progres percakapan tiap nomor (in-memory, hilang saat proses di-restart)
const sessions = new Map()

// Bersihkan sesi yang kedaluwarsa secara berkala setiap 10 menit
setInterval(() => {
  const now = Date.now()
  for (const [jid, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TIMEOUT_MS) {
      sessions.delete(jid)
    }
  }
}, 10 * 60 * 1000).unref()

function isTrigger(text) {
  const normalized = text.toLowerCase().trim()
  return TRIGGER_WORDS.some((word) => normalized === word || normalized.startsWith(word + " ") || normalized.startsWith(word + ","))
}

async function reply(sock, remoteJid, text) {
  console.log(`Balasan bot ke ${remoteJid.replace("@s.whatsapp.net", "")}: ${text.split("\n")[0]}${text.includes("\n") ? " ..." : ""}`)
  await sock.sendMessage(remoteJid, { text })
}

async function handleIncomingMessage({ sock, remoteJid, text }) {
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()

  // Fitur batal/reset sesi kapan saja
  if (RESET_WORDS.includes(lower)) {
    if (sessions.has(remoteJid)) {
      sessions.delete(remoteJid)
      await reply(sock, remoteJid, "Percakapan telah dibatalkan. Kirim 'halo' jika ingin memulai kembali.")
      return
    }
  }

  // Cek masa aktif sesi (TTL)
  let session = sessions.get(remoteJid)
  if (session && Date.now() - session.updatedAt > SESSION_TIMEOUT_MS) {
    sessions.delete(remoteJid)
    session = null
  }

  // Jika user mengetik kata trigger (halo, assalamualaikum, dll)
  if (isTrigger(trimmed)) {
    sessions.set(remoteJid, { step: "MENU", updatedAt: Date.now() })
    await reply(sock, remoteJid, WELCOME_MESSAGE)
    return
  }

  // Jika belum ada sesi dan bukan trigger, abaikan
  if (!session) {
    return
  }

  // Perbarui waktu aktivitas sesi
  session.updatedAt = Date.now()

  if (session.step === "MENU") {
    const role = ROLE_MAP[trimmed]

    if (!role) {
      await reply(sock, remoteJid, "Pilihan tidak valid. Silakan ketik angka 1-4 sesuai menu di atas atau ketik 'batal' untuk berhenti.")
      return
    }

    session.role = role
    session.step = "NAME"
    await reply(sock, remoteJid, "Silakan tuliskan nama Anda:")
    return
  }

  if (session.step === "NAME") {
    const nama = trimmed

    // Validasi nama: minimal 2 karakter, maksimal 100 karakter, dan harus mengandung huruf
    if (!nama || nama.length < 2 || nama.length > 100 || !/[a-zA-Z]/.test(nama)) {
      await reply(sock, remoteJid, "Nama tidak valid. Pastikan menuliskan nama Anda dengan benar (minimal 2 huruf):")
      return
    }

    session.nama = nama
    session.step = "PHONE"
    await reply(sock, remoteJid, `Terima kasih ${session.nama}. Silakan tuliskan nomor HP Anda:`)
    return
  }

  if (session.step === "PHONE") {
    const nomor = trimmed

    if (!isValidPhone(nomor)) {
      await reply(sock, remoteJid, "Format nomor HP tidak valid. Contoh: 081234567890. Silakan tulis ulang:")
      return
    }

    session.noHp = nomor
    session.step = "FEEDBACK"
    await reply(sock, remoteJid, "Silakan tuliskan kritik dan saran Anda:")
    return
  }

  if (session.step === "FEEDBACK") {
    const feedback = trimmed

    if (!feedback || feedback.length < 3) {
      await reply(sock, remoteJid, "Isi kritik dan saran terlalu pendek. Silakan tuliskan kritik dan saran Anda:")
      return
    }

    session.kritikSaran = feedback

    const laporan = `Kritik & Saran Baru - SMK Sangkuriang 1 Cimahi

Nama: ${session.nama}
Sebagai: ${session.role}
No. HP: ${session.noHp}
No. WhatsApp Pengirim: ${remoteJid.replace("@s.whatsapp.net", "")}

Kritik & Saran:
${session.kritikSaran}`

    const adminNormalized = normalizeNomor(ADMIN_NUMBER)
    if (adminNormalized) {
      const adminJid = `${adminNormalized}@s.whatsapp.net`
      try {
        await reply(sock, adminJid, laporan)
      } catch (error) {
        console.error("Gagal mengirim laporan ke admin:", error)
      }
    } else {
      console.error("Nomor ADMIN_NUMBER belum diisi atau formatnya tidak valid.")
    }

    await reply(sock, remoteJid, "Terima kasih, kritik dan saran Anda sudah kami terima.")
    sessions.delete(remoteJid)
  }
}

module.exports = { handleIncomingMessage }
