const express = require("express")
const cors = require("cors")
const { sendMessage, getStatus, getChats } = require("./whatsapp")

function apiKeyGuard(req, res, next) {
  const requiredKey = process.env.WA_API_KEY
  if (!requiredKey) return next()

  const providedKey = req.headers["x-api-key"]
  if (providedKey !== requiredKey) {
    return res.status(401).json({ message: "API key tidak valid." })
  }

  next()
}

function createServer() {
  const app = express()
  app.use(cors())
  app.use(express.json())

  // Kompatibel dengan frontend SPP-Next: apiFetch("/wa/status") -> res.data.status === "ready"
  app.get("/wa/status", (req, res) => {
    res.json({ data: { status: getStatus() } })
  })

  // Kompatibel dengan frontend SPP-Next: apiFetch("/wa/chats") -> res.data (array)
  app.get("/wa/chats", (req, res) => {
    res.json({ data: getChats() })
  })

  // Kompatibel dengan frontend SPP-Next:
  // apiFetch("/wa/kirim", { method: "POST", body: JSON.stringify({ nomor, pesan }) })
  app.post("/wa/kirim", apiKeyGuard, async (req, res) => {
    const { nomor, pesan } = req.body || {}

    if (!nomor || !pesan) {
      return res.status(400).json({ message: "nomor dan pesan wajib diisi." })
    }

    try {
      await sendMessage(nomor, pesan)
      res.json({ success: true, message: "Pesan berhasil dikirim." })
    } catch (error) {
      res.status(500).json({ message: error.message || "Gagal mengirim pesan." })
    }
  })

  return app
}

module.exports = { createServer }
