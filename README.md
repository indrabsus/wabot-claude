# WA Bot - SMK Sangkuriang 1 Cimahi

Bot WhatsApp otomatis (pakai [Baileys](https://github.com/WhiskeySockets/Baileys), tanpa Chromium) dengan dua fungsi:

1. **Auto-reply + form kritik & saran** lewat chat WhatsApp.
2. **API kirim pesan & cek status**, dengan kontrak endpoint yang **sama seperti backend di project SPP-Next** (`/wa/status`, `/wa/chats`, `/wa/kirim`), supaya frontend/project lain tinggal pakai `NEXT_PUBLIC_API_URL` yang menunjuk ke bot ini tanpa ubah kode.

## Alur chat

Trigger (case-insensitive): `assalamualaikum`, `asalamualaikum`, `halo`, `hai` (juga menerima beberapa variasi umum seperti `hallo`, `hi`).

1. User mengirim salah satu trigger di atas.
2. Bot balas menu:
   ```
   Selamat Datang di SMK Sangkuriang 1 Cimahi
   Silakan pilih nomor untuk melanjutkan, anda sebagai apa?

   1. Guru
   2. Siswa
   3. Orang Tua
   4. Umum
   ```
3. User membalas angka 1-4 → bot minta nomor HP.
4. User mengirim nomor HP → bot minta kritik & saran.
5. User mengirim kritik & saran → bot mengirim rekap (peran, no. HP, no. WhatsApp pengirim, isi kritik/saran) ke **nomor admin** (default `081380837591`, bisa diubah lewat `.env`), lalu membalas ucapan terima kasih ke user dan sesi selesai.

Progres percakapan disimpan di memori (per proses), didefinisikan di [`src/conversationFlow.js`](src/conversationFlow.js).

## Instalasi & menjalankan

```bash
npm install
copy .env.example .env
npm start
```

Saat pertama kali dijalankan, scan QR code yang muncul di terminal dengan WhatsApp (menu **Perangkat Tertaut**). Sesi login tersimpan di folder `auth_session/` sehingga tidak perlu scan ulang setiap restart (folder ini masuk `.gitignore` — jangan pernah di-commit, isinya kredensial sesi WhatsApp).

## Endpoint API (kompatibel dengan SPP-Next)

Base URL default: `http://localhost:3001`

### `GET /wa/status`
Cek status koneksi WhatsApp — dipakai untuk badge Online/Offline di dashboard.

```json
{ "data": { "status": "ready" } }
```
`status` bernilai `"ready"` saat terhubung, `"not_ready"` saat belum/terputus. Frontend cukup mengecek `res.data.status === "ready"` (sama seperti di SPP-Next).

### `GET /wa/chats`
Daftar pesan masuk terakhir (maks 50), untuk keperluan dashboard/log.

```json
{ "data": [{ "nomor": "6281234567890", "pesan": "halo", "waktu": "2026-08-07T02:00:00.000Z" }] }
```

### `POST /wa/kirim`
Kirim pesan WhatsApp dari project lain (Next.js, dsb).

Request:
```json
{ "nomor": "081234567890", "pesan": "Isi pesan" }
```
Nomor otomatis dinormalisasi (awalan `0` → `62`, `+`/spasi dibuang), sama seperti `normalizeNoHp` di SPP-Next.

Response sukses:
```json
{ "success": true, "message": "Pesan berhasil dikirim." }
```
Response gagal (nomor kosong, belum konek, dll) mengembalikan status HTTP non-2xx dengan `{ "message": "..." }`, sehingga langsung cocok dengan `apiFetch` di SPP-Next yang membaca `data.message`.

### Pakai di project lain
Set `NEXT_PUBLIC_API_URL` (atau env sejenis) ke alamat bot ini, lalu panggil `/wa/status`, `/wa/chats`, `/wa/kirim` persis seperti di SPP-Next — tidak perlu kode tambahan di frontend.

### Keamanan (opsional)
Isi `WA_API_KEY` di `.env` untuk mewajibkan header `x-api-key` pada `POST /wa/kirim`. Kalau dikosongkan, endpoint tersebut terbuka (cocok untuk pengembangan lokal / jaringan internal saja — jangan expose ke internet tanpa API key).

## Konfigurasi (`.env`)

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `3001` | Port HTTP server |
| `ADMIN_NUMBER` | `081380837591` | Nomor penerima laporan kritik & saran |
| `WA_API_KEY` | (kosong) | Kalau diisi, wajib dikirim lewat header `x-api-key` saat memanggil `POST /wa/kirim` |
