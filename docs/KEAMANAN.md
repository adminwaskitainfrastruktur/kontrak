# Runbook keamanan WiCon

Panduan ini untuk **Owner site KontrakWKI** dan admin Microsoft 365. Semua langkahnya mengubah izin, jadi
dikerjakan manusia, bukan aplikasi atau flow. Kerjakan berurutan, dan uji dengan akun contoh tiap peran sebelum
mengunci izin (langkah 1).

## Kenapa perlu

Hak akses di aplikasi (Pengaju hanya Ruang Pengguna, Pemantau hanya melihat, dan seterusnya) dijaga oleh tampilan.
Batas kerasnya ada di izin SharePoint. Selama setiap pengguna menjadi **Member** site dengan izin bawaan (Edit),
mereka secara teknis bisa membuka list langsung di SharePoint dan mengubah riwayat, daftar pengguna, atau status
kontrak. Flow **Pengawas perubahan status** memberi tahu Admin bila status berubah di luar alur, tetapi tidak
mencegahnya.

## 0. Akses untuk semua akun domain (keputusan 3 Okt 2026)

Semua akun `@waskitainfrastruktur.co.id` boleh masuk aplikasi. Yang tidak terdaftar di list **Pengguna Kontrak**
otomatis menjadi **Pengaju tanpa divisi**: hanya Ruang Pengguna, dan hanya melihat pengajuannya sendiri. List Pengguna
Kontrak cukup berisi Admin, Legal, Pemantau, Pengaju yang memang perlu melihat kontrak satu divisi, dan orang yang
ingin dinonaktifkan (baris dengan Aktif = tidak tetap ditolak masuk). Akun di luar domain (tamu) tetap ditolak.

Agar akun domain yang tidak terdaftar bisa memuat data, situs SharePoint harus mengizinkan mereka. Langkah (Owner
situs, sekali saja):

1. Buka https://waskitainfra.sharepoint.com/sites/KontrakWKI/_layouts/15/people.aspx?MembershipGroupId=5
   (People and Groups, **Kontrak WKI Members**).
2. **New**, **Add Users to this Group**, ketik `Everyone except external users`, pilih dari saran.
3. **Show options**, hapus centang kirim undangan email, lalu **Share**.

Bila "Everyone except external users" tidak muncul, tenant menyembunyikannya; minta admin M365 grup keamanan berisi
seluruh karyawan dan tambahkan grup itu.

**Risiko yang diterima:** pembatasan "hanya pengajuan sendiri" dijaga aplikasi. Setelah langkah ini, setiap karyawan
yang membuka situs SharePoint secara langsung bisa membaca seluruh list Kontrak (nilai, mitra, deskripsi), karena
posisi antrean dihitung di browser dari semua kontrak. Untuk membatasinya perlu backend atau izin per item, yang di
peta jalan dinilai tidak sepadan. Langkah 4 di bawah (izin per list) tetap mengurangi risiko mengubah data.

## 1. Uji dulu dengan akun contoh

Siapkan satu akun untuk tiap peran: Admin, Legal, Pengaju, Pemantau. Daftarkan Admin, Legal, dan Pemantau di list
**Pengguna Kontrak**; untuk Pengaju pakai satu akun domain yang **tidak** terdaftar (menguji akses otomatis). Lalu
dengan masing-masing akun:

- Pengaju: ajukan kontrak lewat chat, unggah dokumen, lihat posisi antrean, kirim revisi.
- Legal: mulai review, minta revisi, isi checklist, unggah draf final, tandai aktif.
- Admin: ubah Pengaturan, tambah pengguna, buka halaman Notifikasi.
- Pemantau: buka dashboard dan detail, pastikan tidak ada tombol aksi.

Ulangi pengujian yang sama setelah setiap langkah di bawah. Bila ada yang gagal dengan pesan "Akses ditolak",
izin yang baru dikunci terlalu sempit untuk peran itu.

## 2. Grup SharePoint

| Grup | Anggota | Catatan |
|---|---|---|
| **Owners** KontrakWKI | Admin aplikasi (minimal 2 orang) | Full Control. Admin perlu ini untuk mengelola Pengguna dan Pengaturan dari aplikasi. |
| **Legal Kontrak WKI** (buat baru) | Semua anggota tim Legal | Dipakai untuk izin khusus Legal di bawah. |
| **Members** KontrakWKI | Grup Microsoft 365 Kontrak WKI dan **Everyone except external users** (langkah 0) | Izin bawaan Edit dipersempit per list. |

Akun yang memiliki koneksi flow Power Automate (saat ini AdminApp) harus tetap Owner, karena flow mengubah list
Notifikasi, Kontrak, dan Aktivitas atas nama akun itu.

## 3. Tingkat izin "Tambah Saja"

Site settings, Site permissions, Permission Levels, Add a Permission Level:

- Nama: `Tambah Saja`
- Centang: **Add Items**, **View Items**, **Open Items**, **View Versions**, **View Pages**, **Open**.
- Jangan centang Edit Items dan Delete Items.

## 4. Izin per list

Untuk setiap list: List settings, Permissions for this list, **Stop Inheriting Permissions**, lalu atur seperti tabel.

| List / library | Members | Legal Kontrak WKI | Alasan |
|---|---|---|---|
| **Kontrak** | Edit (bawaan) | Edit | Pengaju membuat dan merevisi kontraknya sendiri. Status dijaga flow Pengawas. |
| **Aktivitas Kontrak** | Tambah Saja | Tambah Saja | Riwayat tidak boleh diubah atau dihapus. Aplikasi hanya menambah baris. |
| **Pengguna Kontrak** | Read | Read | Hanya Admin (Owners) yang menambah pengguna dan mengubah peran. |
| **Pengaturan Kontrak** | Read | Read | Hanya Admin yang mengubah SLA, pengingat, dan mode uji email. |
| **Log Admin** | Tanpa akses | Read | Jejak perubahan pengaturan; hanya Admin yang menulis. |
| **Notifikasi Kontrak** | Tambah Saja | Tambah Saja | Kotak keluar email. Aplikasi menambah, flow (akun Owner) yang menandai Terkirim. |
| **Berkas Kontrak** | Contribute (lihat catatan) | Edit | Pengaju mengunggah dokumen pengajuannya. |
| **Mitra Kontrak** | Read | Edit | Data mitra dikelola Legal. |
| **Jaminan Kontrak** | Read | Edit | Register jaminan dikelola Legal. |
| **Kewajiban Kontrak** | Read | Edit | Kewajiban pasca-tanda-tangan dikelola Legal. |
| **Kasus Kontrak** | Tanpa akses | Edit | Disiapkan untuk catatan sengketa, khusus Legal. Belum dipakai aplikasi. |
| **Permintaan Masukan** | Tambah Saja | Edit | Disiapkan, belum dipakai aplikasi. |

**Catatan Berkas Kontrak.** Aplikasi mengizinkan pengaju menghapus dokumennya sendiri selama pengajuan masih
Diajukan atau Perlu Revisi (dengan alasan yang tercatat di riwayat). Penghapusan lewat aplikasi masuk Recycle Bin
SharePoint (93 hari), bukan hapus permanen. Bila Legal ingin pengaju sama sekali tidak bisa menghapus, buat tingkat
izin "Contribute tanpa hapus" (Contribute minus Delete Items, Delete Versions) untuk Members. Akibatnya tombol hapus
dokumen di Ruang Pengguna akan gagal dengan pesan akses ditolak, dan pengaju perlu meminta Legal menghapusnya.

## 5. Riwayat versi

Aktifkan **Versioning settings, Create a version each time you edit an item** (simpan 50 versi atau lebih) untuk
list Kontrak, Aktivitas Kontrak, Pengguna Kontrak, Pengaturan Kontrak, dan library Berkas Kontrak. Dengan versi,
perubahan yang salah bisa dipulihkan dari Version History tanpa menebak nilai lamanya.

## 6. Retensi (admin Microsoft 365)

Kontrak termasuk arsip yang wajib disimpan lama. Minta admin M365 membuat label retensi Microsoft Purview (misalnya
10 tahun sejak dibuat) untuk library Berkas Kontrak dan list Kontrak. Cek dulu lisensi yang dibutuhkan.

## 7. Azure (Microsoft Entra ID)

Aplikasi saat ini meminjam app registration aplikasi IT Asset Management. Saat membuat app registration sendiri
("WiCon", single tenant):

1. Authentication, platform **Single-page application**. Redirect URI:
   - `https://wicon.waskitainfrastruktur.co.id`
   - `https://wicon.waskitainfrastruktur.co.id/teams-auth.html` (login di Microsoft Teams)
   - `http://localhost:8080` dan `http://localhost:8080/teams-auth.html` (pengembangan)
2. API permissions (Delegated, Microsoft Graph): `User.Read` dan `Sites.ReadWrite.All`, lalu admin consent.
   Bila admin ingin lebih sempit, `Sites.Selected` bisa dipakai, tetapi butuh pemberian akses per site oleh admin
   lewat Graph.
3. Ganti `VITE_MSAL_CLIENT_ID` di `.env.development` dan `.env.production`, ganti juga `webApplicationInfo.id`
   di `teams/manifest.json`, lalu build ulang aplikasi dan paket Teams.

Selama masih meminjam app registration lama, Redirect URI `teams-auth.html` di atas perlu ditambahkan ke app
registration itu agar tab Teams bisa login.

## 8. Power Automate

- Pemilik flow saat ini adalah akun AdminApp. Tambahkan minimal satu **co-owner** pada solusi WiCon (Power
  Apps, Solutions, WiCon, pilih flow, Share) supaya flow tidak berhenti bila akun itu dinonaktifkan.
- Email dikirim dari kotak surat pemilik koneksi Outlook. Untuk alamat pengirim bersama (misalnya
  `wicon@waskitainfrastruktur.co.id`), siapkan shared mailbox dengan izin Send As untuk akun flow, lalu ubah aksi
  kirim email ke "Send an email from a shared mailbox (V2)".
- Cek kebijakan DLP lingkungan Default: konektor SharePoint, Office 365 Outlook, dan Teams harus berada di grup
  data yang sama.

## 9. Tanda tangan digital (15 Okt 2026)

- **List baru "Tanda Tangan Kontrak"** (dibuat di site KontrakWKI, ID di `src/config.ts`) menyimpan permintaan beserta daftar penandatangan. Seperti list lain, hak "siapa boleh menandatangani" dijaga aplikasi; seorang Member site secara teknis masih bisa mengubah barisnya langsung di SharePoint. Bila izin list diperketat (bagian 4), batasi **Edit** list ini ke Legal/Admin dan biarkan Member hanya **Read**; konsekuensinya penandatangan non-Legal tidak bisa menulis tanda tangannya, jadi pengetatan penuh baru layak bila penulisan dipindah ke flow Power Automate.
- **Gambar tanda tangan** adalah data pribadi: tersimpan di library Berkas Kontrak (`<Nomor>/TTD/`) dan, bila pengguna memilihnya, di `_TTD Tersimpan/<email>.png`. Siapa pun yang punya akses baca library bisa membukanya. Karena itu menyimpan TTD tidak dicentang bawaan, dan bisa dihapus pemiliknya. Pertimbangkan membatasi akses baca folder `_TTD Tersimpan` ke Legal/Admin bila TTD tersimpan dipakai luas.
- **Integritas:** dokumen dikunci SHA-256 saat permintaan dibuat dan diperiksa ulang sebelum tiap tanda tangan; tiap tanda tangan membawa jejak SHA-256 (dokumen, email, waktu, gambar). Ini bukti pendukung, bukan tanda tangan elektronik tersertifikasi.

