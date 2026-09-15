require("dotenv").config()

const { createServer } = require("./src/server")
const { startWhatsapp } = require("./src/whatsapp")

const PORT = process.env.PORT || 3001

// Tangani unhandled rejection dan exception agar proses tidak mati mendadak
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason)
})

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error)
})

async function main() {
  await startWhatsapp()

  const app = createServer()
  const server = app.listen(PORT, () => {
    console.log(`Server WA bot berjalan di http://localhost:${PORT}`)
  })

  const shutdown = () => {
    console.log("\nMenutup server bot WhatsApp...")
    server.close(() => {
      console.log("Server HTTP ditutup.")
      process.exit(0)
    })
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main().catch((error) => {
  console.error("Gagal menjalankan bot:", error)
  process.exit(1)
})
