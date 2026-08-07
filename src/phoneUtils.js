// Samakan dengan normalizeNoHp di SPP-Next: 0xxxx -> 62xxxx, buang + dan spasi
function normalizeNomor(value) {
  if (!value) return ""
  let hasil = String(value).replace(/[+\s-]/g, "")
  if (hasil.startsWith("0")) {
    hasil = "62" + hasil.slice(1)
  }
  return hasil
}

module.exports = { normalizeNomor }
