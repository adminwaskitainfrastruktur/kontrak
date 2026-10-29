# WiCon di Microsoft Teams

Folder ini berisi paket aplikasi pribadi (personal app) Teams. Aplikasi tetap web yang sama di
https://wicon.waskitainfrastruktur.co.id, hanya ditampilkan sebagai tab di Teams.

| Tab | Alamat | Untuk |
| --- | --- | --- |
| Monitoring | `/?teams=1#/saya` | Ruang Pengguna: kontrak milik pengaju (Pengadaan, SCM) |
| Dashboard Legal | `/?teams=1#/` | Ruang Admin: tim Legal dan admin |

Parameter `?teams=1` memberi tahu aplikasi bahwa ia sedang dibuka di Teams, supaya halaman masuk
memakai cara login yang cocok untuk Teams (lihat "Cara login di Teams").

## Isi folder

| Berkas | Keterangan |
| --- | --- |
| `manifest.json` | Manifest Teams (skema 1.19). Ubah di sini lalu buat ulang paket. |
| `buat-paket.mjs` | Menggambar ikon, memeriksa manifest, dan membuat zip. |
| `color.png`, `outline.png` | Ikon hasil skrip (192x192 berwarna, 32x32 garis putih transparan). |
| `KontrakWKI-Teams.zip` | Paket yang diunggah ke Teams. |

## Membuat paket

```bash
node teams/buat-paket.mjs
```

Skrip berhenti dengan pesan jelas bila manifest belum valid, misalnya `webApplicationInfo.id`
tidak sama dengan `VITE_MSAL_CLIENT_ID` di `.env.production`. Setiap kali manifest diubah, naikkan
`version` (misalnya 1.0.0 menjadi 1.0.1) supaya Teams mau menerima pembaruan.

## Persiapan sekali saja

1. **Header server.** `public/.htaccess` sudah tidak mengirim `X-Frame-Options` dan memakai CSP
   `frame-ancestors` yang mengizinkan Teams dan Microsoft 365. Pastikan build terbaru (`dist/`,
   termasuk `.htaccess` dan `teams-auth.html`) sudah diunggah. Bila server memasang
   `X-Frame-Options` dari konfigurasi lain (vhost, reverse proxy, Cloudflare), hapus juga di sana;
   tanpa itu tab Teams hanya menampilkan halaman kosong atau "konten ditolak".
2. **Redirect URI di Azure.** Di app registration `f536a53d-8a16-45cf-9acf-d8c77212b605`
   (Microsoft Entra ID > App registrations > Authentication > platform *Single-page application*),
   tambahkan:
   - `https://wicon.waskitainfrastruktur.co.id/teams-auth.html`
   - `http://localhost:8080/teams-auth.html` (untuk uji lokal)

   Tanpa ini, jendela login Teams menampilkan galat AADSTS50011.
3. **(Opsional) Application ID URI.** `webApplicationInfo` di manifest menunjuk
   `api://wicon.waskitainfrastruktur.co.id/<client id>` sebagai cadangan untuk SSO Teams di masa
   depan. Saat ini aplikasi tidak memakai SSO Teams, jadi URI ini tidak wajib dibuat. Bila nanti
   ingin SSO Teams penuh, isi *Expose an API* dengan URI tersebut, tambahkan scope
   `access_as_user`, dan otorisasi klien Teams (`1fec8e78-bce4-4aaf-ab1b-5451cc387264` dan
   `5e3ce6c0-2b1f-4285-8d4b-75ee78787346`).

## Memasang di Teams

### A. Untuk seluruh perusahaan (disarankan): Teams Admin Center

1. Buka https://admin.teams.microsoft.com > **Teams apps > Manage apps**.
2. Klik **Upload new app** > **Upload**, pilih `teams/KontrakWKI-Teams.zip`.
3. Buka aplikasi **WiCon**, pastikan statusnya **Allowed**.
4. (Opsional) **Teams apps > Setup policies** > Global: tambahkan WiCon ke **Installed apps**
   dan **Pinned apps** agar muncul otomatis di bilah kiri semua pengguna (atau buat kebijakan
   khusus untuk grup Legal, SCM, Pengadaan).
5. Perubahan kebijakan bisa butuh beberapa jam sampai terlihat di klien Teams.

Untuk memperbarui: buka aplikasi yang sama di Manage apps > **Upload file** dan pilih zip baru
(dengan `version` yang lebih tinggi).

### B. Uji coba pribadi: sideload

Hanya bisa bila kebijakan tenant mengizinkan *Upload custom apps*.

1. Di Teams, buka **Apps** > **Manage your apps** > **Upload an app**.
2. Pilih **Upload a custom app**, lalu `teams/KontrakWKI-Teams.zip`.
3. Klik **Add**. Tab Monitoring dan Dashboard Legal muncul di aplikasi WiCon.

## Cara login di Teams

Aplikasi tidak memakai Teams JS SDK. Halaman masuk mendeteksi Teams (parameter `?teams=1`, user
agent Teams, atau iframe dari domain Teams/Microsoft 365) lalu:

1. Tombol **Lanjutkan dengan Microsoft 365** membuka jendela kecil `teams-auth.html`. Jendela itu
   memakai MSAL `loginRedirect` ke Microsoft, kembali ke `teams-auth.html`, memberi kabar ke tab
   Teams (BroadcastChannel dan `window.opener`), lalu menutup diri.
2. Cache MSAL (localStorage) ikut terbaca oleh tab Teams, sehingga aplikasi terbuka tanpa muat ulang.
3. Bila jendela diblokir atau sesinya terpisah, halaman menampilkan **Buka di browser** (membuka
   aplikasi di tab peramban biasa pada halaman yang sama) dan **Muat ulang tab ini**.

Di luar Teams, login tetap memakai popup seperti biasa.

## Batasan yang diketahui

- **Teams versi web (teams.microsoft.com / teams.cloud.microsoft).** Peramban modern memisahkan
  penyimpanan iframe pihak ketiga dari penyimpanan jendela biasa. Login di jendela terpisah bisa
  berhasil tetapi tab Teams tidak melihat sesinya. Pengguna akan diarahkan ke **Buka di browser**.
  Chrome/Edge dengan cookie pihak ketiga diblokir juga membuat SSO diam-diam gagal, sehingga
  pengguna perlu klik tombol masuk.
- **Teams desktop.** Tergantung versi klien, `window.open` bisa dibuka di peramban bawaan sistem,
  bukan jendela Teams. Bila itu terjadi, sesi login tersimpan di peramban, bukan di Teams; gunakan
  aplikasi dari peramban, atau muat ulang tab setelah login bila Teams berbagi penyimpanan.
- **Teams seluler.** Belum diuji. Tab akan terbuka, tetapi login di jendela terpisah kemungkinan
  besar tidak didukung; gunakan **Buka di browser**.
- **Sesi berakhir.** Token diperbarui diam-diam selama sesi Microsoft 365 masih ada. Bila gagal
  (biasanya setelah beberapa jam di Teams web), halaman masuk muncul lagi.
- **Tanpa SSO Teams.** Pengguna tetap melihat layar masuk Microsoft sekali. SSO Teams penuh butuh
  Teams JS SDK (`@microsoft/teams-js`) dan Application ID URI; belum dipasang agar tidak menambah
  dependensi.
- **Pratinjau PDF dan worker pdf.js** membutuhkan CSP `frame-src blob:` dan `worker-src 'self' blob:`
  (sudah ada di `.htaccess`) serta `.mjs` dilayani sebagai JavaScript.
- **Tema Teams** (gelap/terang/kontras tinggi) tidak diikuti otomatis; aplikasi memakai pilihan
  temanya sendiri.
- `developer.privacyUrl` dan `termsOfUseUrl` masih menunjuk beranda aplikasi. Ganti bila ada
  halaman kebijakan resmi, lalu buat ulang paket.
