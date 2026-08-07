require("dotenv").config()

const { createServer } = require("./src/server")
const { startWhatsapp } = require("./src/whatsapp")

const PORT = process.env.PORT || 3001

async function main() {
  await startWhatsapp()

  const app = createServer()
  app.listen(PORT, () => {
    console.log(`Server WA bot berjalan di http://localhost:${PORT}`)
  })
}

main().catch((error) => {
  console.error("Gagal menjalankan bot:", error)
  process.exit(1)
})
