// Samakan dengan normalizeNoHp di SPP-Next: 0xxxx / 8xxxx -> 62xxxx, buang semua karakter non-digit
function normalizeNomor(value) {
  if (!value) return ""
  let hasil = String(value).replace(/\D/g, "")
  if (hasil.startsWith("0")) {
    hasil = "62" + hasil.slice(1)
  } else if (hasil.startsWith("8")) {
    hasil = "62" + hasil
  }
  return hasil
}

// Validasi nomor HP: memastikan panjang wajar (10-15 digit) dan bukan angka berulang
function isValidPhone(value) {
  if (!value) return false
  const clean = String(value).replace(/\D/g, "")
  if (clean.length < 10 || clean.length > 15) return false
  // Cegah nomor yang seluruh digitnya sama (misal 0000000000)
  if (/^(\d)\1+$/.test(clean)) return false
  return true
}

module.exports = { normalizeNomor, isValidPhone }
