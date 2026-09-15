const { normalizeNomor, isValidPhone } = require("./phoneUtils")

const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "081380837591"
const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 menit batas inaktivitas sesi
const KONSEL_AI_URL = (process.env.KONSEL_AI_URL || "http://localhost:3000").replace(/\/$/, "")

const TRIGGER_WORDS = [
  "assalamualaikum",
  "assalamu'alaikum",
  "asalamualaikum",
  "halo",
  "hallo",
  "hai",
  "hi",
  "menu",
  "p",
]

const BK_TRIGGER_WORDS = ["bk", "konsel", "konseling", "konsel.ai", "curhat"]

const RESET_WORDS = ["batal", "cancel", "reset", "ulang"]

const ROLE_MAP = {
  1: "Guru",
  2: "Siswa",
  3: "Orang Tua",
  4: "Umum",
}

const WELCOME_MESSAGE = `Selamat Datang di SMK Sangkuriang 1 Cimahi 👋
Silakan pilih nomor untuk melanjutkan:

1. Guru (Kritik & Saran)
2. Siswa (Kritik & Saran)
3. Orang Tua (Kritik & Saran)
4. Umum (Kritik & Saran)
5. Konsel.AI (Bimbingan Konseling Siswa) 🧠💬

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

function isBkTrigger(text) {
  const normalized = text.toLowerCase().trim()
  return BK_TRIGGER_WORDS.some((word) => normalized === word || normalized.startsWith(word + " "))
}

async function reply(sock, remoteJid, text) {
  console.log(`Balasan bot ke ${remoteJid.replace("@s.whatsapp.net", "")}: ${text.split("\n")[0]}${text.includes("\n") ? " ..." : ""}`)
  await sock.sendMessage(remoteJid, { text })
}

async function handleIncomingMessage({ sock, remoteJid, text }) {
  const trimmed = text.trim()
  const lower = trimmed.toLowerCase()

  // Shortcut langsung ke Konsel.AI jika mengetik 'bk', 'konsel', 'curhat'
  if (isBkTrigger(trimmed)) {
    sessions.set(remoteJid, {
      step: "BK_AUTH_USERNAME",
      updatedAt: Date.now(),
    })
    await reply(
      sock,
      remoteJid,
      `🧠 *Selamat Datang di Konsel.AI - Bimbingan Konseling*\nSMK Sangkuriang 1 Cimahi\n\nLayanan konseling digital rahasia, nyaman, dan siap mendengarkan cerita kamu.\n\nSilakan masukkan *Username* akun Sakuci kamu:\n_(Ketik 'batal' untuk kembali)_`
    )
    return
  }

  // Fitur batal/reset sesi kapan saja
  if (RESET_WORDS.includes(lower)) {
    const activeSession = sessions.get(remoteJid)
    if (activeSession) {
      // Jika sedang dalam sesi konseling BK, panggil API end
      if (activeSession.step === "BK_CHATTING" && activeSession.sessionId) {
        try {
          await fetch(`${KONSEL_AI_URL}/api/bot/end`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: activeSession.sessionId }),
          })
        } catch (_) {}
      }
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

  // =========================================================================
  // ALUR BIMBINGAN KONSELING (KONSEL.AI)
  // =========================================================================

  // 1. Sedang aktif mengobrol dengan AI Konselor
  if (session && session.step === "BK_CHATTING") {
    session.updatedAt = Date.now()

    // Cek perintah selesai
    if (["selesai", "keluar", "stop", "sudah", "bye"].includes(lower)) {
      try {
        await fetch(`${KONSEL_AI_URL}/api/bot/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.sessionId }),
        })
      } catch (err) {
        console.error("Gagal menutup sesi konseling di server:", err?.message)
      }

      sessions.delete(remoteJid)
      await reply(
        sock,
        remoteJid,
        "Sesi konseling telah diakhiri. Terima kasih sudah bercerita di Konsel.AI 🙏\nTetap semangat, jaga kesehatan mentalmu, dan jangan ragu datang ke ruang BK jika butuh teman bicara secara langsung.\n\nKetik *halo* untuk kembali ke menu utama."
      )
      return
    }

    // Kirim pesan siswa ke server Konsel.AI
    try {
      const res = await fetch(`${KONSEL_AI_URL}/api/bot/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          studentId: session.student?.id,
          message: trimmed,
        }),
      })

      const data = await res.json()
      if (data.success && data.reply) {
        await reply(sock, remoteJid, data.reply)
      } else {
        await reply(
          sock,
          remoteJid,
          data.message || "Maaf, terjadi kendala saat memproses jawaban AI. Silakan coba ketik lagi pesanmu."
        )
      }
    } catch (err) {
      console.error("Error panggil Konsel.AI chat:", err?.message)
      await reply(
        sock,
        remoteJid,
        "⚠️ Maaf, server Konsel.AI sedang tidak dapat dihubungi. Silakan coba beberapa saat lagi atau hubungi Guru BK."
      )
    }
    return
  }

  // 2. Input Username
  if (session && session.step === "BK_AUTH_USERNAME") {
    session.updatedAt = Date.now()
    session.bkUsername = trimmed
    session.step = "BK_AUTH_PASSWORD"
    await reply(
      sock,
      remoteJid,
      `Username: *${trimmed}*\n\nSekarang masukkan *kata sandi* (password) akun Sakuci kamu:\n_(Ketik 'batal' untuk membatalkan)_`
    )
    return
  }

  // 3. Input Password & Validasi ke Backend
  if (session && session.step === "BK_AUTH_PASSWORD") {
    session.updatedAt = Date.now()
    const password = trimmed
    const username = session.bkUsername
    const studentPhone = remoteJid.replace("@s.whatsapp.net", "")

    try {
      const res = await fetch(`${KONSEL_AI_URL}/api/bot/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          phone: studentPhone,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        sessions.delete(remoteJid)
        await reply(
          sock,
          remoteJid,
          `${data.message || "❌ Login ditolak. Username atau kata sandi tidak sesuai."}\n\nKetik *5* untuk mencoba lagi, atau ketik *halo* untuk ke menu utama.`
        )
        return
      }

      // Berhasil autentikasi!
      session.step = "BK_CHATTING"
      session.sessionId = data.sessionId
      session.student = data.student

      await reply(
        sock,
        remoteJid,
        `${data.message}\n\n📌 *Petunjuk:* Kamu bisa langsung curhat apa saja di sini dengan santai dan rahasia.\nKetik *selesai* atau *keluar* kapan saja jika ingin mengakhiri sesi konseling.`
      )
    } catch (err) {
      console.error("Error panggil Konsel.AI auth:", err?.message)
      sessions.delete(remoteJid)
      await reply(
        sock,
        remoteJid,
        "⚠️ Gagal menghubungkan ke server Konsel.AI. Pastikan aplikasi Konsel.AI di server aktif."
      )
    }
    return
  }

  // =========================================================================
  // ALUR MENU UTAMA & FORM KRITIK SARAN
  // =========================================================================

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
    // Menu 5: Konsel.AI
    if (trimmed === "5" || lower === "konsel" || lower === "bk") {
      session.step = "BK_AUTH_USERNAME"
      await reply(
        sock,
        remoteJid,
        `🧠 *Selamat Datang di Konsel.AI - Bimbingan Konseling*\nSMK Sangkuriang 1 Cimahi\n\nLayanan konseling digital rahasia, nyaman, dan siap mendengarkan cerita kamu.\n\nSilakan masukkan *Username* akun Sakuci kamu:\n_(Ketik 'batal' untuk kembali)_`
      )
      return
    }

    const role = ROLE_MAP[trimmed]

    if (!role) {
      await reply(
        sock,
        remoteJid,
        "Pilihan tidak valid. Silakan ketik angka 1-5 sesuai menu di atas atau ketik 'batal' untuk berhenti."
      )
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

    await reply(sock, remoteJid, "Terima kasih, kritik dan saran Anda sudah kami terima.\n\nKetik 'halo' untuk kembali ke menu utama.")
    sessions.delete(remoteJid)
  }
}

module.exports = { handleIncomingMessage }
