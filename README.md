# WiCon (Contract Management & Dashboard)

**WiCon** (Waskita Infrastruktur Contract Management & Dashboard) adalah sistem kontrak internal untuk Legal, SCM, dan Pengadaan, PT Waskita Karya Infrastruktur. Alamatnya https://wicon.waskitainfrastruktur.co.id. Nama "Kontrak WKI" masih dipakai untuk nama teknis: situs SharePoint `KontrakWKI`, list `Kontrak`, dan solusi Power Automate `KontrakWKI`.
React + TypeScript (Vite), login Microsoft (MSAL), dan data disimpan di SharePoint lewat Microsoft Graph.
Polanya sama dengan aplikasi IT Asset Management (`Inventory_Stock_WK/stok`), jadi tidak ada backend atau database sendiri.

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:8080 (port dipatok, harus sama dengan Redirect URI di Azure)
npm run build      # typecheck + build ke dist/
```

## Penyimpanan (site SharePoint Kontrak WKI)

https://waskitainfra.sharepoint.com/sites/KontrakWKI

| List / library | Isi |
|---|---|
| **Kontrak** | Satu item per kontrak: judul, jenis, divisi, mitra, nilai, tanggal, status, pengaju, PIC Legal, nomor kontrak |
| **Aktivitas Kontrak** | Riwayat per kontrak (kolom `KontrakId`): perubahan status beserta catatan, komentar, unggahan, perubahan data |
| **Pengguna Kontrak** | Siapa yang boleh masuk, beserta divisi (Legal/SCM/Pengadaan/IT) dan peran (Admin/Legal/Pengaju/Pemantau) |
| **Berkas Kontrak** (library dokumen) | File kontrak di folder `<Nomor Pengajuan>/`. Tiap file punya metadata ID Kontrak, Nomor Pengajuan, dan Jenis Dokumen. Kolom **Folder Dokumen** di list Kontrak menaut ke foldernya. |
| **Notifikasi Kontrak** | Kotak keluar email: aplikasi menulis satu baris per email (Penerima, Cc, IsiHtml, JenisNotif, KontrakId), flow Power Automate mengirimnya lewat Outlook lalu mengisi StatusKirim (Terkirim/Gagal), DikirimPada, dan Galat |
| **Pengaturan Kontrak** | Satu baris per kunci (`Title`) dengan nilai JSON di `NilaiJson`: SLA, hari pengingat, ambang eskalasi, alamat email, dan `emailUji` (mode uji). Dibaca aplikasi dan flow. |
| **Mitra Kontrak** | Data mitra (nama, nama lain, NPWP, alamat, penandatangan, jabatan, terverifikasi) untuk saran isian dan pencegah mitra ganda |
| **Jaminan Kontrak** | Register jaminan/bank garansi per kontrak (jenis, penerbit, nilai, masa berlaku, status) beserta tanggal pengingat terakhir |
| **Kewajiban Kontrak** | Kewajiban setelah tanda tangan (pembayaran, laporan, serah terima) dengan tenggat dan penanggung jawab |
| **Log Admin** | Jejak perubahan Pengaturan: siapa, kapan, dari nilai apa ke nilai apa |
| **Kasus Kontrak** | Register peringatan, somasi, sengketa, pemutusan, dan klaim per kontrak (khusus Legal/Admin); kasus Sengketa yang masih terbuka menyalakan flag `AdaSengketa` di Kontrak |
| **Tanda Tangan Kontrak** | Satu baris per permintaan tanda tangan digital (`KontrakId`, `StatusTtd`, `Isi` JSON berisi dokumen terkunci SHA-256, daftar penandatangan, bukti, dan alasan tolak/batal). Bukti PNG dan PDF final ada di library Berkas Kontrak |
| **Permintaan Masukan** | Permintaan pendapat unit lain (Keuangan, Pajak, Teknik, K3, dst.) lewat email, dicatat Legal; waktu menunggu jawaban tidak dihitung ke SLA Legal |

ID site dan ID list ada di [src/config.ts](src/config.ts). Pilihan kolom Choice (status, jenis, dan lainnya) ada di
[src/lib/types.ts](src/lib/types.ts) dan harus sama dengan pengaturan kolom di SharePoint.

## Ajukan lewat chat

`/kontrak/baru` adalah percakapan bertahap (skrip pertanyaan, bukan AI, tanpa API key): judul, jenis, kontrak induk
(khusus addendum), mitra, divisi (khusus Legal/Admin), nilai, masa berlaku, target review, prioritas, deskripsi, dokumen.
Di akhir ada ringkasan yang bisa diubah per bagian sebelum diajukan. Formulir klasik tetap ada di `/kontrak/baru/formulir`
dan dipakai untuk mengubah kontrak. Langkahnya ada di [src/pages/ChatAjukan.tsx](src/pages/ChatAjukan.tsx).

## Addendum

Addendum adalah kontrak tersendiri (nomor pengajuan, alur review, dan dokumennya sendiri) yang menaut ke kontrak induknya lewat `KontrakIndukId`.

- Diajukan dari tombol **Ajukan addendum** di kontrak induk (`/kontrak/baru?induk=ID`): mitra dan divisi terisi otomatis, judul diusulkan ("Addendum ke-N …"), dan tanggal mulai diusulkan sehari setelah masa berlaku induk.
- Hanya kontrak **Aktif** yang bisa diberi addendum. Urutannya (ke-1, ke-2, …) dihitung otomatis; addendum yang ditolak/dibatalkan tidak dihitung.
- Addendum mencatat **apa yang diubah** (perpanjangan waktu, nilai, lingkup, ketentuan, lainnya; boleh lebih dari satu).
- Nilai pada addendum adalah **selisih** terhadap induk (positif = tambahan, negatif = pengurangan, kosong = tidak berubah).
- Setelah addendum berlaku (Aktif), kontrak induk menghitung **masa berlaku efektif** (tanggal berakhir paling akhir) dan **nilai efektif** (induk + selisih addendum aktif). Dashboard memakai angka efektif ini, jadi kontrak yang sudah diperpanjang tidak lagi ditandai "akan berakhir".
- Riwayat kontrak induk ikut mencatat pengajuan dan status addendumnya. Rumusnya ada di [src/lib/addendum.ts](src/lib/addendum.ts).
- Kolom SharePoint: `JenisPerubahan` (pilihan ganda), `UrutanAddendum`, `KontrakIndukId`.

## MoU (nota kesepahaman)

MoU adalah perjanjian **tanpa nilai kontrak**: mengikat para pihak untuk bekerja sama, sedangkan nilai dan pekerjaannya muncul di kontrak pelaksana.

- Jenis kontrak "MoU / Nota Kesepahaman": pertanyaan dan kolom nilai disembunyikan, ditampilkan sebagai **Tanpa nilai**. Masa berlaku, PIC Legal, dokumen, dan alur review tetap sama, dan MoU bisa diperpanjang dengan addendum.
- **Kontrak turunan**: dari MoU yang Aktif, tombol **Ajukan kontrak turunan** (`/kontrak/baru?mou=ID`) membuka chat dengan mitra dan divisi terisi. Kontrak turunan menaut ke MoU lewat `MouAcuanId`; halaman MoU menampilkan daftar turunannya, dan halaman kontrak turunan menampilkan MoU dasarnya. Kontrak baru yang bukan turunan juga bisa memilih MoU dasarnya di chat (langkah "Dasar MoU", hanya muncul bila ada MoU aktif).
- Aturannya ada di [src/lib/mou.ts](src/lib/mou.ts). Kolom SharePoint: `MouAcuanId`.

## Alur dan peran

Aturannya ada di [src/lib/alur.ts](src/lib/alur.ts):

```
Diajukan → Review Legal ⇄ Perlu Revisi → Proses Tanda Tangan → Aktif → Berakhir
   └→ Ditolak (Legal) / Dibatalkan (pengaju)
```

- **Pengaju** (SCM/Pengadaan): hanya Ruang Pengguna. Mengajukan kontrak, memantau pengajuannya, merevisi saat statusnya *Diajukan* atau *Perlu Revisi*.
- **Legal**: melihat semua kontrak, memproses review dan status, mengisi nomor kontrak dan tanggal tanda tangan.
- **Admin**: semua akses Legal, ditambah mengelola pengguna.
- **Pemantau**: hanya melihat.

Hak akses di atas dijaga oleh tampilan aplikasi. Batas kerasnya adalah keanggotaan site SharePoint: setiap pengguna
harus menjadi **Member** site Kontrak WKI, dan anggota site secara teknis bisa mengubah list langsung dari SharePoint.
Langkah mengetatkan izin per list (riwayat tambah-saja, Pengguna dan Pengaturan hanya-baca, versioning, retensi) ada di
[docs/KEAMANAN.md](docs/KEAMANAN.md).

Email di `VITE_ADMIN_EMAILS` selalu dianggap Admin, walaupun belum ada di list Pengguna Kontrak.

## Ruang Admin dan Ruang Pengguna

Aplikasi dibagi dua ruang ([src/context/RuangContext.tsx](src/context/RuangContext.tsx)):

| Ruang | Alamat | Siapa | Menu |
|---|---|---|---|
| **Ruang Admin** | `#/`, `#/kontrak…`, `#/laporan`, `#/jaminan`, `#/mitra`, `#/notifikasi`, `#/pengaturan`, `#/pengguna` | Admin, Legal, Pemantau | Dashboard, Daftar Kontrak, Ajukan Kontrak; Data: Laporan, Jaminan, Mitra; Sistem: Notifikasi, Pengaturan, Pengguna (Admin) |
| **Ruang Pengguna** | `#/saya…` | Pengaju, juga Admin dan Legal | Monitoring, Ajukan Kontrak |

- Pengaju tidak bisa membuka Ruang Admin: rutenya tidak didaftarkan untuknya. Tautan lama `#/kontrak/ID` dialihkan ke `#/saya/kontrak/ID`.
- Admin dan Legal berpindah ruang lewat tombol **Admin | Pengguna** di sidebar (atau menu akun, atau Ctrl+K). Di Ruang Pengguna mereka melihat kontrak seperti pengaju: tanpa tombol pemrosesan Legal.
- **Monitoring** hanya menampilkan kontrak yang diajukan sendiri, dengan status ringkas:
  - **Antri**: *Diajukan*, menunggu giliran review.
  - **Proses**: *Review Legal*, *Perlu Revisi*, *Proses Tanda Tangan*.
  - **Selesai**: *Aktif*, *Berakhir*, *Ditolak*, *Dibatalkan*.
- **Antrean Legal**: semua kontrak berstatus *Diajukan*, diurutkan menurut prioritas (Mendesak, Tinggi, Normal), lalu waktu pengajuan ([src/lib/antrean.ts](src/lib/antrean.ts)). Pengaju melihat posisinya ("urutan ke-3, 2 pengajuan di depan Anda") tanpa melihat isi pengajuan orang lain. Dashboard Legal menampilkan nomor antrean yang sama, jadi urutan kerja Legal dan yang dilihat pengaju selalu cocok.
- **Waktu masuk**: setiap kontrak menampilkan hari, tanggal, dan jam pengajuan dalam WIB ("Kamis, 2 Oktober 2026 · 14.22 WIB") di Monitoring, Daftar Kontrak (kolom Masuk), detail, dan email.
- **Kabar** (lonceng): dihitung di browser dengan membandingkan status dan posisi antrean terakhir yang pernah dilihat (localStorage per akun) ([src/lib/kabar.ts](src/lib/kabar.ts)). Data diperbarui otomatis tiap menit selama halaman terbuka. Saat aplikasi tertutup, pemberitahuan datang lewat email (bagian berikut).

## Notifikasi email (Outlook lewat Power Automate)

Browser tidak mengirim email sendiri. Aplikasi menulis email yang sudah jadi (HTML) ke list **Notifikasi Kontrak**,
lalu flow Power Automate mengirimnya lewat Outlook ([src/services/notifikasi.ts](src/services/notifikasi.ts)).

| Kejadian | Penerima | Isi |
|---|---|---|
| Pengajuan baru | Tim Legal (atau alamat grup Legal di Pengaturan) | Ringkasan kontrak, posisi di antrean, tabel antrean saat ini |
| Pengajuan baru | Pengaju | Konfirmasi, nomor pengajuan, waktu masuk, posisi antrean, dan perkiraan giliran |
| Status berubah | Pengaju, atau Legal bila pengaju yang mengirim revisi/membatalkan | Status lama dan baru, catatan Legal, pelacak tahap |
| Antrean bergerak | Pengaju yang masih antri | Posisi baru setelah pengajuan di depannya diambil Legal |
| PIC ditugaskan | PIC Legal | Kontrak yang ditugaskan beserta tautannya |

Template email ada di [src/lib/email.ts](src/lib/email.ts) dan [src/lib/emailKit.ts](src/lib/emailKit.ts): tabel
dan inline style, lebar 640 px, tombol VML, tanpa gambar luar, sehingga tampil rapi di Outlook desktop, Outlook web,
dan ponsel. Admin bisa melihat kotak keluar dan status kirimnya di halaman **Notifikasi**.

### Flow

Semua flow ada dalam satu solusi Power Automate yang dibangun dari kode di [power-automate/](power-automate/):

```bash
node power-automate/periksa.mjs               # memeriksa ekspresi sebelum membuat paket
node power-automate/buat-solusi.mjs 1.0.0.7   # hasil: power-automate/KontrakWKI.zip (nomor versi harus naik)
```

Impor di make.powerapps.com, Solutions, Import solution. ID flow dikunci di kode, jadi impor ulang memperbarui flow
yang ada, bukan membuat flow ganda. Setelah impor, aktifkan flow dari halaman objek solusi (pilih satu baris, Turn on).

| Flow | Pemicu | Tugas |
|---|---|---|
| Kirim email dari kotak keluar | Baris baru di Notifikasi Kontrak | Kirim lewat Outlook, tandai Terkirim/Gagal |
| Agenda pagi tim Legal | Senin–Jumat 07.30 WIB | Antrean, yang sedang ditangani, dan yang perlu perhatian, ke Admin dan Legal |
| Pengingat harian | Setiap hari 07.00 WIB | Kontrak akan berakhir (H-90/60/30/7/0), jaminan akan berakhir, kewajiban jatuh tempo |
| Laporan bulanan | Tanggal 1, 07.00 WIB | Rekap bulan lalu ke Admin, Legal, dan Pemantau |
| Pengawas perubahan status | Item Kontrak diubah | Bila status berubah di luar alur (mis. diubah langsung di SharePoint), catat di riwayat dan beri tahu Admin |

Angka hari pengingat, SLA, dan alamat grup Legal dibaca flow dari list Pengaturan Kontrak, jadi cukup diubah di
halaman **Pengaturan**.

### Mode uji email

Selama mode uji menyala, semua email **terjadwal** (agenda pagi, pengingat, laporan, peringatan Pengawas) hanya
dikirim ke satu alamat dengan subjek berawalan `[UJI]`. Email pengajuan dan perubahan status tidak ikut dialihkan.
Nyalakan atau matikan dari kartu **Mode uji email** di halaman Pengaturan (tersimpan sebagai baris `emailUji` di list
Pengaturan Kontrak, dan setiap perubahan tercatat di Log Admin). Matikan saat aplikasi mulai dipakai semua orang.

## Fitur kerja Legal

- **Dashboard**: ringkasan yang butuh tindakan, alur kontrak per tahap, beban tim per PIC, batas keputusan, masa berlaku, dan SLA per tahap (kolom `StatusSejak`; batasnya diatur di Pengaturan).
- **Daftar Kontrak**: chip preset (antrean saya, belum ada PIC, lewat target, akan berakhir, lewat masa berlaku), kolom Masuk, aksi massal, ekspor CSV dan Excel.
- **Detail**: tugaskan PIC, checklist review (12 butir) dan checklist tanda tangan, kelengkapan dokumen wajib per jenis kontrak, diskusi dengan sebutan `@nama`, kartu revisi (apa yang berubah sejak putaran sebelumnya), panel jaminan, kewajiban, masa berlaku, para pihak dan dasar kewenangan, arsip ZIP satu klik, ajukan serupa, dan berkas kalender (.ics).
- **Dokumen**: pratinjau PDF dan Word di aplikasi, unggah cerdas (mengenali jenis dokumen dari nama dan isinya), ekstraksi isian dari PDF/Word, pemindai klausul wajib, dan draf kontrak .docx dari templat. Semuanya berjalan di browser tanpa layanan AI berbayar (pdf.js, mammoth, docx, exceljs, jszip; dimuat saat dibutuhkan).
- **Laporan**: untuk rentang tanggal pilihan: waktu per tahap, waktu di tangan Legal dibanding menunggu pengaju, masuk dan selesai per bulan, putaran revisi, dan pengajuan yang mengendap. Bisa diekspor ke Excel.
- **Mitra** dan **Jaminan**: data mitra dengan pencegah mitra ganda, register jaminan dengan pengingat otomatis.

Uji logika tanpa browser: `npx --yes tsx scripts/uji-<nama>.ts` (dokumen, ekstrak, jaminan, laporan, mitra, pengajuan, pengaturan, syarat, terbilang).

Usulan dan keputusan yang masih terbuka ada di [docs/PETA-JALAN.md](docs/PETA-JALAN.md).

## Lembar Hasil Review Legal

Formulir yang diisi Legal setelah mereview draf, di halaman detail kontrak (Ruang Admin). Riset di [docs/RISET-LEMBAR-REVIEW.md](docs/RISET-LEMBAR-REVIEW.md).

- Satu **putaran** per review (draf, lalu final). Terisi otomatis dari data yang sudah ada (para pihak, dokumen yang direview, kelengkapan dokumen, checklist review, hasil pemindai klausul), jadi Legal hanya mengisi pokok kontrak, **temuan per pasal** (tingkat risiko rendah/sedang/tinggi, usulan, status), **kepatuhan regulasi**, dan **kesimpulan** (dapat ditandatangani, dengan catatan, perlu revisi, tidak direkomendasikan).
- Temuan bisa langsung menjadi poin di modal Minta Revisi. Lanjut ke Tanda Tangan memberi peringatan bila belum ada lembar final atau kesimpulannya bukan layak.
- Keluaran: unduh **.docx**, atau **Pratinjau cetak** untuk disimpan sebagai PDF (membuka dialog cetak bawaan browser), lengkap dengan kolom paraf. Salinannya bisa disimpan ke library Berkas Kontrak (jenis "Lembar Review Legal", tidak terlihat pengaju).
- Pengaju hanya melihat kesimpulan dan catatan yang ditujukan kepadanya (kolom `HasilReview`), bukan penilaian risiko internal.
- Isinya (skala risiko, 17 butir kepatuhan regulasi, daftar klausul) adalah **standar awal** yang perlu disahkan Legal. Butir bertanda `*` harus diverifikasi ke peraturan terbaru.
- Disimpan sebagai JSON berversi di kolom `LembarReview` list Kontrak.

## Senyap (mute) notifikasi per kontrak

Tombol **Bisukan** di bagian atas halaman detail (semua peran, kedua ruang) membisukan notifikasi satu kontrak untuk pengguna itu saja. Pilihannya disimpan di list **Senyap Kontrak** (satu baris per email dan kontrak), jadi ikut ke perangkat mana pun.

- **Disaring:** email dari aplikasi tentang kontrak itu (pengajuan baru, status berubah, revisi, penugasan, dst.) tidak dikirim ke yang membisukan, dan kabar di lonceng serta toast kontrak itu disembunyikan. Status kontrak tetap terlihat di aplikasi, dan kabar muncul lagi bila senyapnya dibatalkan.
- **Belum disaring:** email dari flow terjadwal (agenda pagi, pengingat masa berlaku dan jaminan, laporan bulanan). Flow itu mengirim ke tim, bukan per orang.
- Daftar Kontrak menandai kontrak yang dibisukan dengan lencana **Senyap**.
- Bila list gagal dibaca, semua notifikasi tetap dikirim seperti biasa (lebih baik terkirim daripada hilang).

## Tanda tangan digital

Meniru alur dokumen bertanda tangan di aplikasi stok (Pengadaan Barang): penandatangan menandatangani langsung di WiCon dengan akun Microsoft perusahaannya. Halamannya **Tanda Tangan** di sidebar (lencana angka = menunggu tanda tangan Anda) dan panel ringkas di detail kontrak.

1. **Legal meminta tanda tangan** untuk kontrak berstatus *Proses Tanda Tangan*: memilih dokumen PDF/Word (Draft Final didahulukan), menambah penandatangan (internal dengan email kantor, atau **pihak luar** seperti mitra), dan memilih **berurutan** atau bersamaan. Isi dokumen dikunci dengan sidik **SHA-256**.
2. **Penandatangan dikabari lewat email** (kotak keluar yang sama), membuka halaman tanda tangan, membaca dokumen, lalu membubuhkan tanda tangan dengan **coret di layar** (mouse, jari, stylus), **unggah foto/gambar** (latar putih dibuang otomatis), atau **TTD tersimpan**. Menyimpan TTD itu pilihan sadar, tidak dicentang bawaan, dan bisa dihapus dari halaman yang sama.
3. **Bukti**: PNG tanda tangan disimpan di `Berkas Kontrak/<Nomor>/TTD/` *sebelum* status berubah, lengkap dengan waktu dan jejak SHA-256 (dokumen, email, waktu, gambar). Sebelum menandatangani, isi dokumen dibaca ulang; bila berbeda dari yang dikunci, tanda tangan ditolak.
4. **Pihak luar** tidak punya akun: Legal mencatat tanda tangannya dari gambar yang diterima (namanya tercatat sebagai pencatat). Dokumen yang ditandatangani basah bisa diselesaikan dengan **unggah pindaian PDF**.
5. **Selesai**: PDF final dibuat di peramban (pdf-lib), yaitu halaman asli (bila dokumennya PDF) ditambah **Halaman Pengesahan**, lalu disimpan di dokumen kontrak dengan jenis *Kontrak Ditandatangani* dan dikirim ke semua pihak. Bila pembuatan PDF gagal, tanda tangan tetap sah dan Legal bisa membuatnya ulang.
6. **Tolak, batalkan, ingatkan**: penandatangan boleh menolak (alasan wajib, permintaan ditutup), Legal atau pembuat boleh membatalkan, Legal mengirim pengingat ke yang sedang giliran.

Batasan yang perlu diketahui: ini berupa gambar tanda tangan yang diikat ke dokumen dan akun, **bukan tanda tangan elektronik tersertifikasi** dan tidak menggantikan e-meterai bila dipersyaratkan (dinyatakan juga di Halaman Pengesahan). Hak aksi dijaga oleh aplikasi; izin SharePoint tetap batas kerasnya (lihat [docs/KEAMANAN.md](docs/KEAMANAN.md)). Aturan ada di [src/lib/penandatangan.ts](src/lib/penandatangan.ts), PDF di [src/lib/pdfTtd.ts](src/lib/pdfTtd.ts), layanan di [src/services/tandaTangan.ts](src/services/tandaTangan.ts); ujinya `scripts/uji-penandatangan.ts`, `uji-pdf-ttd.ts`, dan `uji-tanda-tangan.ts`.

## Arsip dan hapus kontrak

Kontrak tidak punya tombol "hapus" biasa karena ia arsip hukum. Ada dua jalur, keduanya di panel **Kelola kontrak** pada halaman detail (Ruang Admin):

- **Arsipkan** (Admin dan Legal, alasan wajib): kolom `Diarsipkan` di list Kontrak menjadi ya. Kontrak keluar dari daftar, dashboard, antrean, laporan, jaminan, dan flow email (agenda, pengingat, laporan bulanan), tetapi dokumen dan riwayatnya utuh. Daftarnya ada di menu **Data > Arsip**, tempat Admin dan Legal juga bisa **Memulihkan**. Pemantau hanya melihat.
- **Hapus permanen** (hanya Admin): menghapus item Kontrak, folder dokumennya, dan baris terkait di list Aktivitas, Jaminan, Kewajiban, Kasus, dan Permintaan Masukan. Dialog menampilkan dulu apa saja yang ikut terhapus, meminta alasan (min. 10 karakter) dan mengetik ulang nomor pengajuan. Jejaknya (nomor, judul, status, alasan, jumlah yang terhapus) ditulis ke **Log Admin lebih dulu**; bila log gagal, tidak ada yang dihapus. Ditolak bila kontrak punya addendum atau kontrak turunan. Semua yang dihapus masuk **Recycle Bin SharePoint selama 93 hari** dan masih bisa dipulihkan dari sana. Antrean email lama di list Notifikasi tidak ikut dihapus.

Kolom SharePoint yang dibutuhkan: `Diarsipkan` (Yes/No, bawaan No) di list Kontrak. Filter flow memakai `Diarsipkan ne 1`, yang juga mengikutkan baris yang kolomnya masih kosong.

## Fitur Legal lainnya

- **Persetujuan internal**: rujukan penyetuju dan penandatangan menurut nilai kontrak (matriks kewenangan standar awal, diatur Admin di Pengaturan) dan pencatatan bukti persetujuan. Hanya pencatatan, bukan kontrol keras.
- **Kasus** (peringatan, somasi, sengketa, pemutusan, klaim) dan **Masukan unit lain** dicatat di panel detail, khusus Legal/Admin.
- **Jejak Audit** (Admin dan Pemantau): perubahan lama-ke-baru dari Aktivitas dan Log Admin, dengan filter dan ekspor CSV.
- **Rekonsiliasi masa berlaku** (Pengaturan, Admin): mengisi `BerakhirEfektif` bagi kontrak Aktif yang masih kosong. Jalankan **sebelum** mematikan mode uji email, supaya kontrak lama tidak memicu email "masa berlaku lewat" bersamaan.
- **Aksi Admin "Aktifkan kembali"** untuk kontrak Berakhir, Ditolak, atau Dibatalkan (catatan wajib).
- **Pencarian dokumen** dari Ctrl+K (Microsoft Search). Bila Graph menolak (403), grup Dokumen disembunyikan; perlu admin consent `Files.Read.All` atau `Sites.Read.All` dari admin Microsoft 365.

## Akses

Semua akun `@waskitainfrastruktur.co.id` boleh masuk. Akun yang tidak terdaftar di list Pengguna Kontrak otomatis menjadi **Pengaju tanpa divisi** (Ruang Pengguna saja, hanya pengajuannya sendiri). Daftarkan hanya Admin, Legal, Pemantau, Pengaju yang perlu melihat kontrak satu divisi, atau orang yang perlu dinonaktifkan. Akun di luar domain tetap ditolak. Syarat di SharePoint: lihat [docs/KEAMANAN.md](docs/KEAMANAN.md), langkah 0.

## Microsoft Teams

Paket aplikasi pribadi Teams (tab Monitoring dan Dashboard Legal) ada di [teams/](teams/README.md). Unggah
`teams/KontrakWKI-Teams.zip` lewat Teams admin center (atau Apps, Manage your apps, Upload an app). Login di Teams
memakai `teams-auth.html`, yang Redirect URI-nya harus terdaftar di Azure (lihat bagian Azure).

## Azure (Microsoft Entra ID)

Saat ini `.env.development` **sementara** memakai app registration aplikasi IT Asset Management. Untuk app registration sendiri:

1. Buat app registration baru, misalnya "WiCon", untuk single tenant.
2. Authentication: tambahkan platform **Single-page application**, dengan Redirect URI `http://localhost:8080`, `https://wicon.waskitainfrastruktur.co.id`, dan untuk Teams `https://wicon.waskitainfrastruktur.co.id/teams-auth.html` serta `http://localhost:8080/teams-auth.html`.
3. API permissions (Delegated, Microsoft Graph): `User.Read` dan `Sites.ReadWrite.All`. Minta admin consent kalau diperlukan.
4. Ganti `VITE_MSAL_CLIENT_ID` di `.env.development` dan `.env.production`. Tidak perlu client secret.

## Tampilan

- Halaman login mengikuti Portal Waskita (foto kantor, judul besar, tombol Microsoft 365, mode terang/gelap). Foto dipakai
  langsung dari `portal.waskitainfrastruktur.co.id`; kalau gagal dimuat, panel kiri memakai gradasi teal.
  Tambahkan `?sso=off` pada URL (`http://localhost:8080/?sso=off`) untuk melihat halaman login walaupun sesi Microsoft aktif.
- Token warna Waskita Horizon di [src/styles.css](src/styles.css), font Plus Jakarta Sans (isi), EB Garamond (judul), Geist (login).
- Library: framer-motion (gerak), recharts (grafik dashboard), sonner (notifikasi), lucide-react (ikon).
- Pedoman desain (hasil ui-ux-pro-max) ada di [design-system/kontrak-wki/MASTER.md](design-system/kontrak-wki/MASTER.md).
  Paletnya bernuansa landing page (biru navy); aplikasi ini sengaja tetap memakai teal Waskita agar senada dengan aplikasi IT.

## Peta kode (graphify)

`graphify-out/` berisi graf pengetahuan kode ini: `graph.html` (interaktif), `GRAPH_REPORT.md`, dan vault Obsidian di
`graphify-out/obsidian/` (buka folder itu sebagai vault di Obsidian). Perbarui setelah mengubah kode dengan `/graphify . --update --obsidian`.

## Responsif

Diuji pada lebar 390 px (ponsel), 768 px (tablet), 1024 px, 1366 px (laptop), dan monitor besar (huruf dasar naik otomatis ke 17-20 px pada layar ≥ 1600 px, lebar sidebar dan konten ikut karena memakai satuan rem).

- Ponsel: menu jadi laci geser, daftar kontrak dan pengguna jadi kartu, pratinjau chat jadi lembar dari bawah (tombol mata).
- Tablet dan laptop kecil: sidebar otomatis diciutkan (pilihan pengguna diingat).
- Chat mengisi layar di samping sidebar; pratinjau di sisi kanan muncul mulai lebar 1280 px.

## Deploy ke wicon.waskitainfrastruktur.co.id

Hosting Hostinger (File Manager: folder dokumen subdomain `wicon`, biasanya `public_html/wicon`). Buat dulu subdomain `wicon` di hPanel dan atur DNS/Cloudflare-nya.

```bash
npm run build      # hasil di dist/ (termasuk .htaccess dan tema.js dari public/)
```

Unggah **isi** `dist/` ke folder subdomain tadi: `index.html`, `.htaccess`, `tema.js`, `peramban.js`, berkas logo dan ikon (`logo-wicon.png`, `wicon-mark.png`, `favicon-*.png`, `apple-touch-icon.png`, `icon-*.png`), `teams-auth.html`, dan folder `assets/`.

- Urutan: folder `assets/` dulu, lalu berkas lain, **`index.html` paling akhir**, supaya tidak ada pengguna yang mendapat `index.html` baru yang menunjuk aset yang belum terunggah.
- Paket siap unggah (isi `dist/` dalam satu zip) ada di `rilis/`. Cara cepat: unggah zip ke folder subdomain `wicon` di File Manager lalu Extract di sana. Bila ingin lebih aman, Extract ke folder sementara, pindahkan `assets/` dulu dan `index.html` terakhir.
- Berkas di `assets/` bernama hash. Biarkan berkas lama beberapa hari setelah rilis (tab yang masih terbuka bisa memuat potongan halaman lama), baru hapus.
- Setelah rilis, buka situsnya dengan Ctrl+F5 dan cek konsol browser tidak berisi pelanggaran CSP.

`public/.htaccess` mengatur: HTTPS paksa, fallback ke `index.html`, gzip, cache setahun untuk `assets/` (index.html tidak di-cache), header keamanan termasuk **Content-Security-Policy**, dan memblokir dotfile. CSP hanya mengizinkan Microsoft Graph, login Microsoft, SharePoint, Google Fonts, dan foto portal. Bila menambah layanan luar, tambahkan juga ke CSP. `frame-src` wajib memuat `'self'`, kalau tidak login otomatis (SSO) gagal. Jangan menambah `Cross-Origin-Opener-Policy: same-origin` karena popup login Microsoft butuh `window.opener`.

Uji build lokal dengan header yang sama: `npm run build && npm run preview` (port 8080, header diambil dari `.htaccess`).

Di Azure, Redirect URI platform **SPA** harus memuat `https://wicon.waskitainfrastruktur.co.id` (dan `http://localhost:8080` untuk pengembangan).

## Belum ada (tahap berikutnya)

- Format nomor kontrak resmi Legal: penomoran otomatis sudah ada ([src/lib/penomoran.ts](src/lib/penomoran.ts)), formatnya menunggu keputusan Legal.
- Pengirim email bersama (shared mailbox) dan co-owner flow; lihat [docs/KEAMANAN.md](docs/KEAMANAN.md).
- Pengetatan izin SharePoint per list, dikerjakan Owner site sesuai runbook.
