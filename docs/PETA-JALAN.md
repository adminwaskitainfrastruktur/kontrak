# Peta jalan perbaikan Kontrak WKI

Hasil analisis 2 Okt 2026: 62 usulan mentah dari 7 sudut pandang, digabung menjadi 40, lalu tiap usulan diperiksa dua kali terhadap kode (apakah masalahnya nyata, apakah layak tanpa backend). Hasil: 41 butir lolos.

Dari 41 usulan yang lolos verifikasi ganda, hampir semuanya layak dibangun di SPA tanpa backend, tetapi sebagian besar harus diperkecil: kolom turunan yang bisa basi dibuang, hak akses yang hanya dijaga UI diakui apa adanya, dan fitur yang butuh keputusan Legal dipecah bertahap. Permintaan terbaru Anda (tanggal dan jam kontrak masuk, notifikasi Outlook beserta antrean, email HTML visual, Power Automate lewat Chrome, AI gratis dulu) dijadikan poros Tahap 2, dengan Tahap 1 sebagai fondasi. Tahap 1 menyiapkan skema SharePoint, memperbaiki angka dan antrean yang tidak cocok, menambah cap tanggal-jam masuk, dan menutup celah ketahanan sesi. Tahap 2 membangun jalur email dan pengingat lewat Power Automate (bukan Mail.Send). Tahap 3 dan 4 mengerjakan mutu dokumen, revisi, siklus kontrak, tata kelola, laporan, dan otomasi lanjutan. Semua tahap berjalan tanpa biaya tambahan di luar lisensi M365 yang ada. Satu risiko rilis berulang di seluruh peta ini: kolom SharePoint baru wajib dibuat lebih dulu, karena bila kode terbit sebelum kolom ada, Graph menolak penulisan dan aksi status atau pengajuan berhenti total. Karena itu butir pertama Tahap 1 membuat semua kolom dan list sekaligus.

## Tahap 1 - Fondasi, perbaikan angka, dan cap waktu masuk

Menyiapkan skema SharePoint satu kali, membuat angka dan daftar konsisten, menampilkan kapan kontrak masuk (tanggal dan jam), dan menutup celah ketahanan. Semua butir di tahap ini tidak bergantung pada Power Automate dan menjadi dasar notifikasi di Tahap 2. Perkiraan total sekitar 26 hari kerja.

- **S0 · Persiapan skema SharePoint dan pengetatan izin (satu kali)** (Admin sistem, ±2 hari)
  - Manfaat: Semua kolom dan list baru siap sebelum kode dirilis, sehingga aksi status dan pengajuan tidak gagal, dan riwayat serta daftar pengguna tidak bisa diubah sembarangan oleh Member site.
  - Cara: Pemilik site membuat semua kolom dan list baru dalam satu sesi berdasarkan daftar yang ditulis di README: kolom Aktivitas (NomorPengajuan, JudulKontrak, Penerima, Tautan, RingkasAntrean, Mitra, Nilai, Prioritas, TargetSelesai, JumlahDokumen, Disebut), kolom Kontrak (StatusSejak, KontrakFinal, BerakhirEfektif, PengingatTerakhir, ProgresTtd, Proyek, NomorReferensi, dll.), pilihan JenisDokumen baru, serta list Pengaturan, Jaminan Kontrak, Kewajiban Kontrak, Kasus Kontrak. Lalu terapkan paket U36: putus pewarisan izin list Pengguna Kontrak (Member hanya Read), izin Tambah Saja di Aktivitas, library Berkas Kontrak tanpa hak hapus bagi Member, aktifkan versioning list Kontrak, Aktivitas, dan Pengguna, serta audit Purview. Tulis runbook di README.
  - Butuh: Akses Owner site KontrakWKI; keputusan kolom mana yang dibuat sekarang; uji dengan akun contoh tiap peran sebelum izin dikunci.
- **T1-TGL · Cap tanggal dan jam kontrak masuk (WIB) di seluruh aplikasi** (Keduanya, ±1 hari)
  - Manfaat: Legal dan pengaju langsung melihat kapan kontrak masuk dan jam berapa, tanpa membuka riwayat; dasar urutan antrean dan isi email.
  - Cara: Periksa apakah TanggalDiajukan menyimpan jam; bila hanya tanggal, pakai createdDateTime item. Tampilkan format 'Kamis, 2 Okt 2026, 14.35 WIB' di Daftar Kontrak (kolom Masuk), Detail, kartu dashboard, Ruang Pengguna, dan ekspor CSV. Buat satu fungsi format tanggal-jam WIB di lib agar email Power Automate memakai format yang sama.
  - Butuh: Tidak ada.
- **U01 · Antrean kerja yang konsisten: angka sama dengan daftar, kolom PIC/Prioritas/Target, dan chip preset Legal** (Legal, ±2.5 hari)
  - Manfaat: Angka 'Butuh tindakan' sama dengan daftar yang terbuka saat diklik, dan pengajuan Mendesak atau paling lama menunggu tidak lagi tenggelam di bawah 6 baris terbaru.
  - Cara: Tambahkan fungsi urutKerjaLegal di antrean.ts (target, prioritas, umur; status Diajukan tetap memakai antreanLegal agar nomor antrean pengaju tidak berubah). Di DaftarKontrak tambahkan parameter URL tindakan, pic, prioritas, berakhir, dan urut, kolom PIC/Prioritas/Target yang bisa diurutkan, serta chip: Antrean saya, Belum ada PIC, Lewat target, Akan berakhir 90 hari. Arahkan ubin KPI, lonceng, dan 'Semua kontrak' ke filter bernomor sama, tambah 'Lihat semua (n)', simpan URL daftar terakhir di sessionStorage, dan perluas Ctrl+K. Buang bagian untuk pengaju dan rute /antrean terpisah.
  - Butuh: Tidak ada. Jalankan ulang graphify karena peta kode lebih tua dari antrean.ts.
- **U05A · Kontrak lewat masa berlaku: pakai tanggal berakhir efektif di mana-mana dan pisahkan dari 'Akan berakhir'** (Legal, ±1.5 hari)
  - Manfaat: Kontrak yang sudah diperpanjang addendum tidak lagi tampil merah, nilai aktif tidak membengkak, dan daftar kontrak yang perlu ditutup terlihat jelas.
  - Cara: Satu helper berakhirEfektif dipakai di tabel, kartu, urutan, CSV, dan tampilan pengaju (peta id ke ringkasan dihitung sekali dengan useMemo). Dashboard memisahkan 'Lewat masa berlaku (n)' dari 'Akan berakhir 90 hari', menampilkan nilai yang lewat sebagai baris terpisah, dan menambah lencana 'addendum perpanjangan sedang diproses'. Tambah filter masa=lewat|segera. Jangan pernah mengubah status otomatis saat halaman dibuka.
  - Butuh: Tidak ada.
- **U29A · Nilai kontrak per mata uang dan kunci mata uang addendum** (Manajemen, ±2.5 hari)
  - Manfaat: Total nilai tidak lagi menghilangkan kontrak USD/EUR/SGD dan pengurutan nilai tidak menyesatkan.
  - Cara: Kartu nilai aktif menampilkan 'Rp X, USD Y, EUR Z' tanpa konversi, label 'hanya IDR' dihapus, kontrak lewat masa berlaku dikeluarkan dari angka komitmen. Mata uang addendum dikunci sama dengan induk, dengan peringatan terlihat bila addendum lama berbeda. Pengurutan kolom Nilai dikelompokkan per mata uang. Tunda konversi kurs.
  - Butuh: Tidak ada.
- **U03A · Lencana target dan umur pengajuan (tanpa kolom baru)** (Legal, ±1 hari)
  - Manfaat: Legal melihat sekilas 'sisa 4 hari' atau 'lewat 2 hari' terhadap target dan sudah berapa hari kontrak di meja.
  - Cara: Lencana target untuk status Diajukan dan Review Legal, lencana umur dari tanggalDiajukan, filter lewat=target, ubin 'Lewat target' di dashboard Legal, kolom Target dan Umur di CSV, serta ganti teks 'diperbarui' yang menyesatkan di Ruang Pengguna. Target hanya penanda, bukan kunci urut utama, agar pengaju tidak bisa melompati antrean.
  - Butuh: Tidak ada.
- **U02 · Penugasan PIC dengan konfirmasi alih, jejak lama-ke-baru, dan beban kerja tim** (Legal, ±3 hari)
  - Manfaat: Kepala Legal bisa menunjuk staf tertentu, pengambilalihan PIC tidak lagi diam-diam, dan beban kerja tiap staf terlihat.
  - Cara: Ganti 'Jadikan saya PIC' dengan menu 'Tugaskan...' berisi staf Legal aktif beserta jumlah Review/TTD yang dipegang. Bila sudah ada PIC, modal 'Alihkan dari X ke Y' dengan alasan wajib. tetapkanPic baca ulang kontrak dan batal bila PIC berubah. Jenis aktivitas baru 'Penugasan' (beri fallback ikon). butuhTindakan untuk Diajukan ber-PIC hanya berlaku bagi PIC itu. Kartu ringkas 'Beban tim' di dashboard dan filter ?pic=. Tombol 'Alihkan semua kontrak X ke Y' sebagai pengganti delegasi cuti.
  - Butuh: Tidak ada.
- **U38 · Ketahanan sesi: masuk ulang di tempat, coba ulang aman, toast, dan cek konflik** (Keduanya, ±3 hari)
  - Manfaat: Tab yang dibiarkan semalaman tidak lagi membuat catatan dan isian hilang, dan setiap aksi tulis memberi umpan balik.
  - Cara: Event perluLogin dari graph() memunculkan pita 'Sesi berakhir, Masuk ulang' (acquireTokenPopup dari klik, cadangan loginRedirect) lalu refetch halaman aktif; KotakError memakainya otomatis. Coba ulang maksimal 3 kali hanya untuk 429 dan GET/PATCH/DELETE pada 503/504 dengan Retry-After, tidak untuk POST. Toast sukses/gagal terpusat, catch di jadiPic, pita luring informatif. Pengganti If-Match: ambilKontrak segar sebelum PATCH lalu bandingkan status dan PIC.
  - Butuh: Tidak ada. Uji If-Match di tenant bila ingin dipakai.
- **U14+U13F0 · Jenis dokumen per berkas, seret-lepas di panel, dan ubah jenis atau hapus berkas** (Keduanya, ±2.5 hari)
  - Manfaat: Label dokumen bisa dipercaya, salah unggah bisa dibereskan tanpa membuka SharePoint, dan kegagalan metadata terlihat.
  - Cara: Tambahkan 4 pilihan JenisDokumen baru (Legalitas Mitra, Surat Kuasa, Jaminan / Bank Garansi, BA Negosiasi). Satu komponen antrean unggah bersama untuk chat, formulir, dan PanelDokumen dengan chip jenis per berkas dan seret-lepas. Tebakan jenis dengan pemisah kata, tidak pernah menebak 'Kontrak Ditandatangani' dari kata final. unggahDokumen coba ulang metadata sekali dan melaporkan hasilnya; lencana 'Jenis belum diisi' membuka 'Ubah jenis'. Menu Ubah jenis dan Hapus (alasan wajib, dicatat, Kontrak Ditandatangani pada kontrak Aktif hanya oleh Admin). Tahan perluasan unggah saat Aktif sampai Legal memutuskan.
  - Butuh: Pilihan Choice baru di kolom JenisDokumen (dikerjakan di S0).
- **U19 · Aktivasi terpandu: kontrak bertanda tangan wajib diunggah di modal dan tautan 'Kontrak final'** (Legal, ±2.5 hari)
  - Manfaat: Tidak ada kontrak Aktif tanpa salinan bertanda tangan, dan pengaju punya satu tombol untuk kontrak final.
  - Cara: Modal 'Tandai Sudah Ditandatangani' memuat area unggah PDF berjenis 'Kontrak Ditandatangani'; tombol aktif bila dokumen jenis itu ada (Admin bisa melewati dengan alasan, Legal diberi peringatan keras). Isian nilai final menimpa NilaiKontrak dengan catatan 'dari X ke Y' (disembunyikan untuk MoU). Simpan webUrl di kolom KontrakFinal dengan fallback bila kolom belum ada; tombol 'Unduh kontrak final' di hero dan kolom CSV.
  - Butuh: Kolom KontrakFinal (S0).
- **U20 · Usulan nomor kontrak resmi dan pencegahan nomor ganda** (Legal, ±1.5 hari)
  - Manfaat: Legal tidak perlu membuka buku agenda, nomor ganda dan salah ketik tertangkap, nomor addendum otomatis dari induk.
  - Cara: lib/penomoran.ts dengan format dan kode jenis dari Legal: usulan nomor berikutnya dari data yang ada, peringatan format lunak, cek duplikat setelah kosongkanCacheKontrak, aktifkan 'Enforce unique values' pada NomorKontrak sebagai pengaman keras dengan pesan galat jelas dan hitung ulang usulan. Nomor addendum {induk}/ADD-{urutan}; perbaiki urutan addendum menjadi maks+1. Tanpa list penghitung.
  - Butuh: Keputusan format nomor dan kode jenis dari Legal; uji perilaku nilai kosong pada kolom unik.
- **U10 · Saran nama mitra, mitra otomatis dari induk, peringatan pengajuan ganda, dan riwayat mitra untuk Legal** (Keduanya, ±3 hari)
  - Manfaat: Nama mitra seragam, pengajuan ganda akibat kirim ulang tertangkap, dan Legal melihat riwayat mitra saat review.
  - Cara: Perbaiki dulu bug: mitra dan divisi terisi otomatis saat induk atau MoU dipilih di chat dan formulir. lib/mitra.ts dengan kunciMitra (PT dan CV tetap dibedakan), datalist di formulir dan maksimal 3 chip di chat. Peringatan ganda lunak hanya di ringkasan; tawaran addendum hanya bila judul menyebut perpanjangan/addendum atau kontrak Aktif berakhir 90 hari. Panel 'Riwayat dengan mitra ini' khusus Legal.
  - Butuh: Tidak ada.

## Tahap 2 - Notifikasi Outlook, antrean, dan pengingat terjadwal

Mewujudkan permintaan inti: email Outlook berisi antrean dan tanggal-jam masuk, HTML visual yang mudah dibaca, pengingat otomatis, dan lonceng yang selalu segar, semuanya lewat Power Automate standar (gratis di lisensi M365). Perkiraan total sekitar 28 hari kerja.

- **K05 · Halaman Pengaturan lite (ambang, SLA, alamat bersama, kemudian divisi)** (Admin sistem, ±3 hari)
  - Manfaat: Ambang pengingat, angka SLA, dan alamat shared mailbox diatur satu tempat dan dibaca juga oleh Power Automate, tanpa deploy ulang.
  - Cara: List Pengaturan (Kunci, NilaiJson) dengan pemuat sekali per sesi yang jatuh ke nilai bawaan di kode bila gagal, rute /pengaturan khusus Admin dengan validasi. Isi awal: HARI_PERINGATAN (90/60/30/7/0), SLA hari kerja per tahap, shared mailbox, alamat grup Legal, tautan channel Teams. Tahap berikutnya (sekitar 3 hari): daftar divisi dengan flag aktif dan boleh mengajukan, setelah kolom divisi diubah ke teks. Tunda jenis kontrak, format nomor, mata uang, dan hari libur.
  - Butuh: List Pengaturan (S0); izin edit hanya untuk Admin.
- **U23a · Fondasi notifikasi di aplikasi: penerima, antrean, dan 'Dibuat' dicatat setelah unggahan** (Keduanya, ±2.5 hari)
  - Manfaat: Setiap kejadian punya penerima, nomor, judul, tautan, dan posisi antrean yang akurat, sehingga email langsung terkirim lengkap tanpa jeda tebakan.
  - Cara: Fungsi murni penerimaNotifikasi di alur.ts dengan uji tabel (pelaku tidak dikirimi aksinya sendiri, Pemantau tidak menerima, Diajukan ke Legal aktif, Perlu Revisi dan Ditolak ke pengaju, Penugasan ke PIC lama dan baru). catatAktivitas mengisi kolom baru termasuk RingkasAntrean ('Antrean ke-3 dari 8 di Legal', dari posisiAntrean), Nilai, Prioritas, Target, dan JumlahDokumen. Aktivitas 'Dibuat' dicatat sesudah unggah selesai di ChatAjukan dan FormKontrak. Galat pencatatan: coba ulang 2-3 kali lalu toast peringatan, tidak lagi ditelan.
  - Butuh: Kolom Aktivitas baru (S0).
- **U23b · Flow Power Automate email Outlook dengan HTML visual (dibangun lewat Chrome Anda)** (Keduanya, ±3 hari)
  - Manfaat: Legal tahu ada pengajuan baru tanpa membuka aplikasi, pengaju tahu revisi, penolakan, atau penandatanganan, dan pembaca Outlook melihat status, antrean, dan tanggal-jam masuk dalam satu tampilan jelas.
  - Cara: Satu flow 'When an item is created' pada Aktivitas dengan Switch per jenis. Validasi penerima terhadap list Pengguna Kontrak dan domain perusahaan, HTML-escape pesan dan judul, kirim dari shared mailbox/akun layanan, format jam WIB dengan convertTimeZone. Templat berbasis tabel dan inline CSS lebar 600 px (kompatibel mesin Word Outlook): kepala berwarna status, kartu nomor/judul/mitra/nilai, stepper 5 tahap berbasis tabel, blok 'Posisi antrean Anda', catatan, tombol 'Buka kontrak' berlatar solid ke /#/kontrak/{id}, plus versi teks biasa. Hasilkan definisi JSON aksi lalu tempel ke desainer; Chrome Anda dipakai untuk login dan menyambungkan koneksi. Uji dulu dengan penerima diri sendiri dan akun layanan sebagai pemilik, tambah pemilik cadangan.
  - Butuh: Chrome milik Anda dengan login M365 dan izin eksplisit untuk membuat flow; shared mailbox dengan izin Send As; cek kebijakan DLP; akun layanan anggota site.
- **U23c · Kartu Teams untuk pengajuan baru (opsional)** (Legal, ±1 hari)
  - Manfaat: Pengajuan baru langsung terlihat oleh seluruh tim Legal di channel, Mendesak menyebut @Legal.
  - Cara: Adaptive Card dengan tombol Buka dan Ambil sebagai PIC (?aksi=ambil-pic wajib konfirmasi, hanya Legal/Admin, abaikan bila PIC sudah terisi). Tunda TeamsMessageId dan balasan berurutan.
  - Butuh: Channel Teams Legal; konektor Teams standar.
- **U24 · Pengingat kontrak berakhir (H-90/60/30/7/0) memperhitungkan addendum, plus tombol kalender .ics** (Keduanya, ±4.5 hari)
  - Manfaat: Kontrak yang akan berakhir tidak terlewat, dan tanggal penting masuk ke kalender Outlook sehari-hari.
  - Cara: Tombol .ics dulu (acara seharian, UID stabil, alarm). Lalu kolom BerakhirEfektif yang dihitung ulang oleh satu fungsi sinkronkanBerakhirEfektif dari semua jalur (status addendum Aktif/Berakhir/Dibatalkan, ubah kontrak, tombol rekonsiliasi Admin). Flow harian 07.00 SE Asia Standard Time, difilter di query SharePoint, memakai kolom PengingatTerakhir agar satu hari gagal tidak menghilangkan pengingat. Tautan 'Ajukan addendum' memakai /#/saya/ajukan?induk=. Digabung dengan flow rekap harian agar penerima tidak menerima dua email berbeda.
  - Butuh: Kolom BerakhirEfektif dan PengingatTerakhir (S0); flow berjalan sebagai akun layanan.
- **U03B · StatusSejak dan SLA per tahap (setelah angka disepakati)** (Legal, ±1.5 hari)
  - Manfaat: Legal dan kepala Legal bisa menjawab 'sudah berapa lama di meja kita', dengan waktu pengaju (Perlu Revisi) dibedakan dari waktu Legal.
  - Cara: Isi StatusSejak di buatKontrak dan jalankanAksi (tidak masuk formulir), fallback untuk kontrak lama. lib/sla.ts dengan hari kerja Senin-Jumat dan angka dari Pengaturan. Merah hanya untuk tahap milik Legal; Perlu Revisi tampil kuning sebagai 'menunggu pengaju'. Filter ?sla=lewat dan kolom umur.
  - Butuh: Kolom StatusSejak dibuat sebelum rilis; kesepakatan angka SLA dari kepala Legal.
- **U25 · Agenda pagi Legal dan eskalasi sempit via email** (Legal, ±3 hari)
  - Manfaat: Legal membuka Outlook dan langsung melihat antrean hari itu; pengajuan tanpa PIC atau revisi yang menggantung ditagih otomatis.
  - Cara: Flow Senin-Jumat 07.30 WIB: satu email HTML per Legal/Admin dengan blok Diajukan tanpa PIC, review milik sendiri beserta umur, menunggu tanda tangan, dan berakhir 30 hari; jangan kirim bila kosong. Eskalasi dua aturan saja sebagai blok 'Perlu perhatian', sekali kirim per ambang. Pagination 5000. Tahap berikutnya: ringkasan Senin untuk pengaju per divisi dan kepala Legal. Tunda laporan bulanan direksi dan kolom preferensi sampai ada permintaan.
  - Butuh: U03B dan K05 (angka SLA); akun layanan pemilik flow.
- **U27 · Sebut @nama di diskusi dan tombol 'Ingatkan' lewat flow** (Keduanya, ±3 hari)
  - Manfaat: Komentar benar-benar sampai ke orang yang dimaksud, dan kontrak yang macet bisa ditagih sekali klik tanpa WhatsApp.
  - Cara: Ketik '@' memunculkan pengguna terdaftar yang berhak melihat kontrak; email disimpan di kolom Disebut dan jenis aktivitas baru 'Pengingat'. Tombol Ingatkan (Legal pada Perlu Revisi, 'Tanyakan progres' bagi pengaju) menurunkan penerima otomatis dan dibatasi sekali per 24 jam, dicek juga di flow. Dikirim lewat flow U23b tanpa Mail.Send.
  - Butuh: Kolom Disebut dan jenis Pengingat (S0); flow U23b.
- **U26 · Lonceng Legal/Admin yang segar dan panel 'Untuk Anda'** (Keduanya, ±2 hari)
  - Manfaat: Angka lonceng ikut berubah setelah aksi dan kabar komentar atau dokumen baru terlihat selama aplikasi terbuka.
  - Cara: Perluas PantauProvider ke Ruang Admin dengan panel seperti LoncengPengguna, langganan pada kosongkanCacheKontrak, polling 120-180 detik, judul tab '(3) Kontrak WKI'. Bandingkan Kontrak.diubah dan penanda localStorage dengan menyaring perubahan oleh diri sendiri; aktivitas terbaru bertahap bila Created sudah diindeks. Tanpa Notification API.
  - Butuh: Opsional indeks kolom Created di Aktivitas.
- **U37A · Penjaga transisi status dan salinan antrean minimal (via Power Automate)** (Admin sistem, ±2.5 hari)
  - Manfaat: Kontrak tidak bisa 'Aktif' tanpa Legal walau status diubah langsung di SharePoint, dan posisi antrean tetap aman bila izin diperketat nanti.
  - Cara: Flow 'When an item is modified' memeriksa transisi Status terhadap ALUR dan pengubahnya, memulihkan versi sebelumnya bila tidak sah, mencatat ke Aktivitas, memberi tahu Admin lewat Outlook. Flow kedua mengisi list salinan minimal (ID, status, prioritas, waktu masuk, divisi, tanpa mitra, nilai, deskripsi) untuk menghitung posisi antrean.
  - Butuh: Power Automate standar; akun layanan; list salinan antrean.
- **U39 · Performa: grafik malas dimuat, daftar ramping, cache bersama, animasi hemat** (Keduanya, ±3 hari)
  - Manfaat: Dashboard tampil cepat di laptop kantor dan ponsel, dan perpindahan halaman tidak mengunduh ulang seluruh list.
  - Cara: Pisahkan recharts ke manualChunks atau muat grafik dengan lazy setelah KPI. $expand=fields($select=...) tanpa Deskripsi di daftar, dengan kolom dari satu konstanta bersama dengan dariItem. Cache bersama dengan langganan (useSyncExternalStore), umur 60-120 detik, penyegaran saat tab kembali aktif, hanya di memori. Matikan animasi layout bila baris di atas 30. Tunda delta query dan $filter relasi.
  - Butuh: Uji nama kolom $select di site nyata.

## Tahap 3 - Dokumen, revisi, dan pengajuan

Mengurangi putaran revisi dan pekerjaan berulang: dokumen wajib yang jelas, revisi yang terstruktur, versi dokumen sungguhan, pengajuan yang tidak kehilangan isian, dan tanda tangan yang terlacak. Perkiraan total sekitar 29 hari kerja.

- **U13 · Dokumen wajib per jenis kontrak dan checklist saat lanjut ke tanda tangan** (Keduanya, ±4.5 hari)
  - Manfaat: Pengaju tahu sejak awal dokumen apa yang harus dilampirkan sehingga putaran 'lengkapi dokumen' berkurang, dan Legal punya jejak pemeriksaan sebelum tanda tangan.
  - Cara: src/lib/syarat.ts sebagai peta statis (bukan list SharePoint dulu) dengan fungsi kekuranganDokumen. Slot dokumen wajib dengan penghitung di chat dan formulir, satu pernyataan 'sisanya menyusul' dicatat di aktivitas, bilah '3/4 wajib' di panel. Modal Minta Revisi terisi otomatis 'Mohon lengkapi: ...', peringatan lunak di lanjut-ttd dan aktifkan. Checklist ringan di dalam modal lanjut-ttd, hasilnya ditulis sebagai teks aktivitas. Templat cukup satu tautan ke folder Templat Legal. Tanpa ikon di tabel.
  - Butuh: Isi dokumen wajib dan butir checklist disusun Legal sebelum koding; U14+U13F0 sudah selesai.
- **U06 · Permintaan revisi yang menonjol: poin terstruktur, kartu revisi, dan 'Simpan dan Kirim Ulang'** (Keduanya, ±4 hari)
  - Manfaat: Pengaju langsung melihat apa yang diminta Legal dan bisa membaca, mengunggah, serta mengirim ulang di satu kartu; Legal melihat apa yang berubah sejak revisi diminta.
  - Cara: lib/revisi.ts (permintaanRevisiTerakhir, uraiPoin dengan fallback teks bebas, sejakRevisi). Chip templat poin di modal Minta Revisi, KartuRevisi di bawah hero untuk kedua ruang, tanggapan per poin opsional dengan 'Tandai semua sudah', peringatan lunak bila tidak ada dokumen baru. Di FormKontrak, 'Simpan dan Kirim Ulang' hanya langsung bila ada dokumen baru, jika tidak kembali ke detail dengan sorotan kartu. ringkasPerubahan mencatat nilai lama ke baru. Lencana 'Terbaru' per jenis. Buang perubahan stepper.
  - Butuh: Cek tipe kolom Pesan bukan teks 255 karakter; U13 untuk slot dokumen.
- **U15 · Versi dokumen sungguhan: unggah versi baru, riwayat versi, lencana Terbaru** (Keduanya, ±3.5 hari)
  - Manfaat: Tidak ada lagi 'Draft (1).docx'; semua orang tahu draft terbaru dan siapa mengubah apa.
  - Cara: Cek versioning library. Tombol 'Unggah versi baru' per dokumen (PUT /content, upload session untuk berkas di atas 4 MB, tangani 423), panel riwayat dari /versions dengan tautan buka dan unduh, pengelompokan per jenis, aktivitas 'Draft Kontrak v3'. Lampiran redline opsional di Minta Revisi disimpan sebagai versi baru. Pembanding dua versi tidak dibangun; sediakan tautan ke riwayat versi SharePoint dan Compare di Word.
  - Butuh: Versioning library Berkas Kontrak aktif.
- **U16 · Unduhan selalu segar, ikon per ekstensi, dan laci pratinjau PDF/gambar** (Keduanya, ±2.5 hari)
  - Manfaat: Unduhan tidak gagal setelah tab lama terbuka, jenis berkas terlihat dari ikonnya, dan PDF atau gambar bisa dibaca tanpa pindah tab.
  - Cara: Tahap cepat 0,5 hari: tombol Unduh mengambil downloadUrl baru saat diklik, ikon dan lencana per ekstensi, graphBlob() di graph.ts. Laci pratinjau 2 hari: blob untuk PDF dan gambar, batas 25 MB dengan revokeObjectURL, blob: hanya di frame-src .htaccess, fallback tab baru di iOS dan untuk Office. Uji dulu /content?format=pdf di tenant; tanpa pdf.js.
  - Butuh: Perubahan CSP frame-src; uji CORS pengalihan /content.
- **U08 · Draf pengajuan otomatis dan penjaga isian (metadata saja)** (Pengaju, ±2 hari)
  - Manfaat: Muat ulang halaman, sesi habis, atau salah klik 'Mulai ulang' tidak lagi menghapus jawaban; chat tidak menahan belasan detik hanya untuk animasi.
  - Cara: lib/drafPengajuan.ts untuk chat dan formulir: localStorage per email dan ruang, debounce, TTL 7 hari, hapus saat logout, hapus segera setelah buatKontrak berhasil, validasi ulang induk/MoU. Lampiran hanya nama berkas dengan pengingat 'Lampirkan ulang'. Chat memuat Data dan terjawab lalu lanjut ke langkah berikut tanpa memutar transkrip. Konfirmasi 'Mulai ulang', tombol Masuk ulang pada galat sesi, tautan formulir juga di ponsel, jeda chat maksimal sekitar 350 ms. Tanpa Blob IndexedDB dan tanpa status Draf SharePoint.
  - Butuh: Tidak ada.
- **U09 · 'Ajukan serupa': salin dari kontrak sebelumnya** (Pengaju, ±1.5 hari)
  - Manfaat: Pengaju yang rutin mengajukan kontrak mirip tidak mengetik ulang jenis, mitra, dan deskripsi; Legal dapat tautan 'disalin dari' sebagai pembanding.
  - Cara: ke.ajukanSerupa(id) di RuangContext untuk kedua ruang. Isi otomatis hanya jenis, mitra, mata uang, MoU acuan bila masih Aktif; divisi dari sesi; prioritas tidak disalin; deskripsi diisi tetapi tetap ditanyakan; judul lama jadi usulan. Layar sukses memakai data di memori, bukan ?salin=. Sembunyikan untuk Addendum. Catat 'Disalin dari KTR-xxxx' di aktivitas Dibuat.
  - Butuh: Lebih efisien dikerjakan bersama U12.
- **U12 · Referensi pengadaan: proyek dan nomor PR/PO/SPK** (Keduanya, ±3 hari)
  - Manfaat: Kontrak bisa dicari dari nomor PO dan disaring per proyek; ekspor bisa dicocokkan dengan sistem pengadaan.
  - Cara: Dua kolom teks Proyek dan NomorReferensi (pisah koma). Proyek dengan datalist dari nilai yang ada dan pilihan 'Kantor pusat / bukan proyek'; satu langkah chat gabungan yang boleh 'menyusul'. Pewarisan dari induk di semua titik (termasuk pilihan induk di tengah chat dan formulir). Dialog finalisasi meminta NomorReferensi. Filter Proyek dengan opsi 'Tanpa proyek', pencarian, Ctrl+K, CSV (loloskan sel berawalan = + - @). Tunda cost center dan grafik per proyek.
  - Butuh: Kolom Proyek dan NomorReferensi (S0).
- **U21 · Pelacak proses tanda tangan per pihak** (Legal, ±3 hari)
  - Manfaat: Legal mencatat posisi seperti 'menunggu TTD mitra sejak 3 Okt' dan pengaju bisa melihatnya tanpa menelepon.
  - Cara: Satu kolom ProgresTtd (JSON berversi, id sub-tahap stabil) berisi cara tanda tangan, sub-tahap (draft ke mitra, paraf, TTD mitra, TTD Direksi, meterai, asli diarsipkan) yang boleh ditandai 'tidak berlaku', tanggal, catatan. Baca ulang item sebelum menulis. Stepper kecil untuk Legal, chip 'TTD n/m' di kartu dan antrean, tanggal TTD terisi dari langkah terakhir saat aktivasi. 'Draft Final' dicatat dengan nama, ukuran, dan hash SHA-256 (bukan 'terkunci'); konversi PDF hanya opsional setelah uji CORS.
  - Butuh: Kolom ProgresTtd (S0); daftar sub-tahap yang disepakati Legal.
- **U04 · Tindakan massal aman: PIC massal, Berakhir massal beralasan, dan aksi balik Admin** (Legal, ±2.5 hari)
  - Manfaat: Membagi puluhan pengajuan ke tim atau menutup kontrak kedaluwarsa tidak lagi satu per satu.
  - Cara: Kotak centang hanya di tabel desktop untuk Legal. Aksi 'Tetapkan PIC ke...' dan 'Tandai Berakhir' (hanya pada filter 'Lewat masa berlaku', non-addendum, memakai berakhirEfektif, modal konfirmasi menyebut nomor tiap kontrak, ikut mengakhiri addendum Aktif milik induk). Eksekusi memanggil ulang tetapkanPic/jalankanAksi dengan konkurensi 3-4 setelah mengosongkan cache dan memeriksa ulang aksiTersedia; progres lewat toast. Tanpa $batch. Tambah aksi Admin 'Aktifkan kembali' dengan catatan wajib.
  - Butuh: U01 dan U05A selesai.
- **U40 · Aksesibilitas dan bantuan: fokus modal, combobox Ctrl+K, kontras donat, galat per isian, glosarium status** (Keduanya, ±3 hari)
  - Manfaat: Dialog dan palet dapat dipakai dengan keyboard, grafik donat terbaca, galat formulir langsung terlihat, dan istilah status dijelaskan.
  - Cara: Perangkap fokus, fokus kembali ke pemicu, Escape per tumpukan; pola combobox di palet; warna Berakhir/Dibatalkan abu pekat (cek mode gelap); komponen Field dengan aria-invalid dan role=alert; glosarium dari ALUR lewat ikon '?' di LencanaStatus; breadcrumb nomorPengajuan; 'Minta akses' sebagai mailto atau lewat flow, tanpa menulis ke list Pengguna. Tanpa tur dan halaman Panduan penuh.
  - Butuh: Tidak ada.

## Tahap 4 - Siklus kontrak, tata kelola, laporan, dan otomasi lanjutan

Menutup risiko hukum setelah kontrak Aktif, menambah jejak audit dan persetujuan, menyediakan laporan untuk kepala Legal dan direksi, lalu mencoba otomasi gratis (draft dan pemindai). Dikerjakan berurutan sesuai kebutuhan dan kesiapan Legal; perkiraan total sekitar 56 hari kerja.

- **U34 · Perpanjangan otomatis dan batas keputusan (masa pemberitahuan)** (Legal, ±3.5 hari)
  - Manfaat: Legal tidak melewatkan batas pemberitahuan sewa atau jasa, dan kontrak auto-renew tidak memenuhi daftar 'Akan berakhir'.
  - Cara: Kolom PerpanjanganOtomatis dan MasaPemberitahuanHari, diisi Legal di dialog aktivasi atau detail, bukan di chat. lib/masa.ts murni dan diuji: batasKeputusan dari berakhirEfektif, jendela per kontrak, kelompok 'Diperpanjang otomatis' terpisah, lencana 'klausul belum diisi'. Pengingat memakai fungsi yang sama dengan flow U24.
  - Butuh: Kolom baru (S0); U24 selesai.
- **U32 · Register jaminan (bank garansi) dengan pengingat** (Keduanya, ±4 hari)
  - Manfaat: Bank garansi yang habis sebelum kontraknya selesai atau tidak diperpanjang setelah addendum terdeteksi dan diingatkan.
  - Cara: List Jaminan Kontrak, panel di detail (Legal/Admin mengisi, pengaju melihat), lib/jaminan.ts, lencana sisa hari 30 hari, peringatan KUNING bila jaminan pelaksanaan berakhir sebelum berakhirEfektif, peringatan nonblokir saat aktivasi Pengadaan Jasa. Pengingat 30/14/7 hari masuk ke flow harian yang sama. Satu kolom 'Catatan risiko' saja; tunda denda dan sebaran risiko.
  - Butuh: List Jaminan Kontrak (S0); kepastian siapa yang mengisi data jaminan.
- **U33 · Kewajiban dan tonggak setelah kontrak Aktif (BAST, retensi, pelaporan)** (Keduanya, ±4 hari)
  - Manfaat: Pengaju punya pemicu kerja setelah kontrak berjalan dan Legal tahu kapan kontrak siap ditutup.
  - Cara: List Kewajiban Kontrak (Judul, Tipe, Jatuh tempo, PIC, Status, Bukti), panel hanya untuk kontrak Aktif, 'Terlambat' dihitung di klien, kartu 'Siap ditutup' sebagai petunjuk saja, pengaju boleh unggah BAST lewat 'Tandai selesai'. Pengingat digabung ke email harian. Tanpa persen atau nominal otomatis.
  - Butuh: List Kewajiban Kontrak (S0).
- **K01 · Persetujuan internal berjenjang dan rujukan penandatangan berwenang** (Keduanya, ±3.5 hari)
  - Manfaat: Aplikasi bisa menjawab 'sudah disetujui siapa' dan 'siapa penandatangan berwenang', tanpa persetujuan lewat WhatsApp.
  - Cara: Tahap 1: modal Lanjut ke Tanda Tangan menampilkan penyetuju dan penandatangan dari matriks sederhana (konfigurasi, hanya IDR); Legal mencatat bukti persetujuan (memo, nama, tanggal) ke Aktivitas dengan jenis dokumen Bukti Persetujuan. Tahap 2: persetujuan sungguhan lewat Power Automate Approvals di Outlook/Teams tanpa peran baru. Gerbang keras diwajibkan setelah matriks divalidasi. Tegaskan di UI bahwa ini pencatatan, bukan kontrol keras.
  - Butuh: Matriks kewenangan resmi dari WKI; template email U23b.
- **K02 · Alasan penutupan dan register kasus (peringatan, sengketa, pemutusan)** (Legal, ±4.5 hari)
  - Manfaat: Laporan membedakan kontrak yang selesai normal dari yang diputus atau disengketakan, dan riwayat peringatan ke mitra tidak tersebar di email pribadi.
  - Cara: Tahap 1 (1,5 hari): ModeBerakhir dan tanggal efektif pada aksi 'Tandai Berakhir', tampil di detail, tabel, dan CSV. Tahap 2 (3 hari): list Kasus Kontrak khusus Legal/Admin dengan flag AdaSengketa di Kontrak agar lencana tidak butuh muat list Kasus; tanpa ringkasan untuk pengaju. Pertimbangkan izin unik hanya Legal untuk list Kasus.
  - Butuh: List Kasus Kontrak dan kolom ModeBerakhir (S0); keputusan izin.
- **K03 · Permintaan masukan unit lain lewat email (tanpa akses site)** (Legal, ±4.5 hari)
  - Manfaat: Masukan Keuangan, Pajak, Teknik, atau K3 melekat pada kontrak dan waktu tunggunya terpisah dari SLA Legal.
  - Cara: List Permintaan Masukan yang dicatat Legal; penerima menjawab lewat email atau Adaptive Card Power Automate yang menulis balik ke list, tanpa keanggotaan site. Berkas dibagikan per-berkas. Konstanta MENUNGGU_UNIT_LAIN mengurangi umur tahap di sla.ts, flow harian untuk pengingat dan status Terlambat.
  - Butuh: List Permintaan Masukan; flow Approvals/Adaptive Card; U03B.
- **U31 · Jejak audit lama-ke-baru dan halaman Jejak Audit** (Manajemen, ±3 hari)
  - Manfaat: Pertanyaan auditor 'diubah dari berapa ke berapa, oleh siapa, kapan' bisa dijawab, dan perubahan langsung di SharePoint tetap terekam lewat versioning.
  - Cara: Kolom Detail (JSON berversi) berisi [{kolom, dari, ke}] dengan format Rupiah dan tanggal Indonesia, dicatat oleh ubahKontrak, tetapkanPic, dan jalankanAksi (termasuk nomor dan tanggal final). Log perubahan pengguna ke list Log Admin terpisah, pelaku diambil dari createdBy SharePoint. Halaman Jejak Audit untuk Admin dan Pemantau dengan filter terindeks dan ekspor. Tunda tab Versi; akui bahwa log aplikasi bukan bukti tahan-ubah.
  - Butuh: Versioning aktif (S0); kolom Detail dan list Log Admin.
- **U28 · Halaman Laporan: waktu siklus, putaran revisi, dan kontrak mengendap** (Manajemen, ±4 hari)
  - Manfaat: Kepala Legal bisa menjawab berapa hari rata-rata review, tahap mana yang macet, dan berapa putaran revisi terjadi.
  - Cara: ambilSemuaEventStatus dengan cache sesi dan modul murni lib/laporan.ts yang menghitung durasi per tahap dari event (hari kerja, median dan P90 dengan jumlah sampel), putaran revisi, daftar mengendap, filter periode, ekspor, dan satu grafik bulanan. Tanpa kolom turunan dan tanpa migrasi.
  - Butuh: Indeks kolom Title di Aktivitas (opsional).
- **U29B · Halaman Portofolio per divisi, jenis, mitra, dan kalender berakhir** (Manajemen, ±2.5 hari)
  - Manfaat: Pimpinan melihat komitmen nilai per divisi, 10 mitra teratas, pipeline, dan kapan nilai kontrak habis.
  - Cara: lib/portofolio.ts dengan agregasi di klien, dipisah per mata uang, klik grafik membuka daftar terfilter. Setara IDR hanya sebagai perkiraan opsional dengan kurs manual setelah dicek apakah kontrak valas memang banyak.
  - Butuh: U29A selesai.
- **U30 · Ekspor Excel rapi dan laporan bulan ini** (Legal, ±3.5 hari)
  - Manfaat: Laporan bulanan ke direksi tidak lagi dirakit manual di Excel.
  - Cara: ExcelJS dimuat dinamis (bukan SheetJS). Lembar Kontrak (nilai dan berakhir efektif, kolom 'Selisih Addendum' terpisah, tautan), Addendum, dan Ringkasan berbasis rumus COUNTIFS/SUMIFS plus filter dan waktu ekspor. Sanitasi sel berawalan = + - @ juga di CSV. Tombol 'Laporan bulan ini' sebagai preset filter. Lembar Riwayat Status menyusul setelah U28.
  - Butuh: Tidak ada.
- **U35 · Plafon pada kontrak payung dan sisa plafon** (Keduanya, ±2 hari)
  - Manfaat: Legal melihat sisa plafon perjanjian harga satuan dan mendapat peringatan bila kontrak turunan melebihi plafon atau di luar masa berlaku.
  - Cara: Kolom Plafon opsional dengan helper adalahPayung (MoU tetap payung tanpa plafon), tanpa rename mouAcuanId. ringkasPlafon di lib/mou.ts, bar pemakaian di PanelTurunan, peringatan lunak di chat, hitung dari semua kontrak tanpa filter bisaLihat. Tunda widget 80%.
  - Butuh: Konfirmasi ke kepala Legal bahwa PO/SPK turunan memang dicatat di aplikasi.
- **U18 · Paket arsip ZIP per kontrak dan retensi lewat Purview** (Legal, ±2.5 hari)
  - Manfaat: Permintaan audit dijawab dengan satu klik per kontrak, dan dokumen dilindungi retensi 10 tahun tanpa risiko mengunci salah unggah.
  - Cara: Tombol ZIP hanya di detail kontrak dengan jszip dimuat dinamis, unduh berurutan lewat Graph /content, ringkasan.csv dan riwayat.txt, batas 200-300 MB dan progres. Retensi dikonfigurasi admin M365 sebagai label default library tanpa mode record; preset filter 'Selesai'. Tanpa label via PATCH dan tanpa metadata Arsip.
  - Butuh: Label retensi Purview oleh admin M365; dependensi jszip.
- **U17 · Pencarian nama berkas dan isi dokumen dari Ctrl+K** (Keduanya, ±2.5 hari)
  - Manfaat: Legal menemukan dokumen dari nama berkas atau klausul tanpa membuka SharePoint.
  - Cara: Uji satu panggilan POST /search/query dengan scope sekarang dulu. Grup 'Dokumen' di palet, debounce 400 ms, minimal 3 huruf, petakan folder ke kontrak, saring bisaLihat, buang hasil tak terpetakan, urai ringkasan sorotan tanpa innerHTML. Nama berkas diutamakan, isi sebagai bonus, dengan catatan PDF pindai dan jeda indeks.
  - Butuh: Kemungkinan Files.Read.All dengan admin consent bila Search ditolak; uji 5-10 PDF nyata.
- **U11 · Identitas pihak per kontrak (NPWP, penandatangan) dan ringkasan per mitra** (Keduanya, ±4 hari)
  - Manfaat: Legal punya data komparisi siap salin dan tidak lagi menanyakan lewat komentar; riwayat per mitra terlihat.
  - Cara: Blok identitas pihak sebagai salinan per kontrak (NPWP tervalidasi, alamat, penandatangan, jabatan, dasar kewenangan, kontak), diisi otomatis dari kontrak terakhir dengan mitra yang sama, tombol 'Salin teks komparisi', jenis dokumen 'Legalitas Mitra', satu kolom 'Pihak lain dan perannya', ringkasan per mitra di klien. Kontak perorangan dibatasi demi UU PDP. Master Mitra penuh ditunda.
  - Butuh: Kolom identitas baru; kebijakan data pribadi.
- **K04 · Pembuat draft kontrak dari templat .docx** (Legal, ±4 hari)
  - Manfaat: Identitas, nilai terbilang, dan tanggal terisi otomatis ke draft sehingga salah ketik nilai dan nama mitra berkurang.
  - Cara: Templat di subfolder _Templat library Berkas Kontrak (dikelola langsung oleh Legal), tombol 'Buat draft dari templat' saat Review Legal, docx.patchDocument dimuat dinamis, lib/terbilang.ts dengan uji unit, penanda kosong disorot kuning, unggah sebagai 'Draft ... v<n>' dengan aktivitas. Pilot satu jenis kontrak dulu; tunda klausul pilihan.
  - Butuh: Templat .docx bersih dengan penanda dari Legal; uji pada templat asli.
- **K06 · Pemindai klausul dan konsistensi draft berbasis aturan (tanpa AI berbayar)** (Legal, ±7 hari)
  - Manfaat: Legal cepat melihat klausul inti yang ada atau hilang dan selisih nilai, nama mitra, serta tanggal terhadap data pengajuan, tanpa isi dokumen keluar dari peramban.
  - Cara: Tahap 1: ekstraksi DOCX/PDF berteks di peramban (mammoth, pdfjs-dist dimuat dinamis, worker satu asal), daftar klausul sebagai konstanta, parser angka dan tanggal Indonesia yang diuji pada 20-30 sampel, hasil berupa saran dengan status keterbacaan dan penafian 'bukan nasihat hukum'. Tahap 2: tanda umum dan masuk ke checklist U13. Panggilan model AI hanya langkah opsional kelak.
  - Butuh: U13 (checklist); daftar klausul dari Legal; uji CSP worker pdf.js.

## Keputusan yang dibutuhkan

- Konfirmasi arti persetujuan Anda untuk 'no 3 dan 10': pastikan butir yang dimaksud adalah butir pada daftar keputusan sebelumnya, karena rujukan itu tidak terlihat di peta jalan ini.
- Jalur email: peta ini memakai Power Automate (shared mailbox/akun layanan), bukan Mail.Send dari browser. Putuskan alamat pengirim, pemilik flow (akun layanan berlisensi plus pemilik cadangan), dan siapa yang memberi izin Send As.
- Izin membangun flow lewat Chrome Anda: Anda perlu login M365 dan menyambungkan koneksi Outlook, SharePoint, dan Teams sendiri; sediakan juga spesifikasi flow tertulis sebagai cadangan bila otomasi browser gagal.
- Format nomor kontrak resmi dan kode per jenis, serta apakah aplikasi menjadi satu-satunya register nomor (dan nomor lama diimpor) atau buku agenda Legal tetap berjalan.
- Angka SLA per tahap (Diajukan, Review Legal, Perlu Revisi, Proses Tanda Tangan) dan siapa yang menerima eskalasi (peran Admin atau pejabat Legal tertentu).
- Siapa yang mengisi data jaminan dan kewajiban (Legal, Pengadaan, atau Keuangan), dan apakah BAST serta SPK/PO pasca-Aktif memang diarsipkan di aplikasi ini.
- Daftar dokumen wajib per jenis kontrak, butir checklist review, dan templat .docx bersih dengan penanda, semuanya disusun tim Legal sebelum fitur terkait dikoding.
- Matriks kewenangan penandatangan resmi WKI (rentang nilai, jenjang penyetuju) bila persetujuan berjenjang jadi dibangun.
- Sub-tahap tanda tangan yang berlaku di WKI (paraf, meterai atau e-Meterai, TTE atau basah) dan kebijakan Direksi soal tanda tangan elektronik.
- Tingkat kerahasiaan antar divisi: apakah SCM dan Pengadaan wajib saling tidak melihat kontrak. Bila ya, izin per item perlu diputuskan pimpinan dan antrean aman dibangun lebih dulu.
- Apakah kontrak valas cukup banyak sehingga konversi IDR (kurs manual) perlu dibangun, dan siapa yang memelihara kurs.
- Kebijakan pelonggaran hak unggah pengaju saat kontrak Aktif dan hak hapus dokumen Legal untuk 'Kontrak Ditandatangani'.
- Pakai konfigurasi Purview oleh admin M365 untuk retensi 10 tahun dan batasi izin library: perlu kesediaan admin M365 serta cek lisensi yang diperlukan.
- Pembatasan penyebutan data sensitif: apakah ringkasan kasus atau sengketa boleh terlihat pengaju (disarankan tidak), dan siapa pemilik list Kasus.
- Rilis bertahap: tentukan jendela rilis per tahap agar kolom SharePoint dibuat lebih dulu dan akun uji tiap peran tersedia untuk regresi lintas peran.

## Tidak disarankan

- U22 integrasi PSrE (Privy, PeruriSign, VIDA) dan e-Meterai: butuh backend Azure Function, kontrak dan biaya per tanda tangan, kebijakan Direksi, sekitar 22-25 hari, dan banyak mitra tetap menolak TTE. Bertentangan dengan arahan gratis dulu. Ganti dengan pencatatan metode TTD dan pelacak sub-tahap (U21).
- U37 langkah 3 (izin per item dan folder lewat flow): merusak antrean yang dihitung di klien, tidak menutup kebocoran lewat list Aktivitas, tidak menghentikan pengaju mengubah Status, ada celah waktu sebelum izin berlaku, dan membebani akun layanan. Hanya dipertimbangkan bila pimpinan mewajibkan kerahasiaan antar divisi; sementara dua langkah pertama (penjaga status dan salinan antrean) sudah masuk Tahap 2.
- Mail.Send dari browser (U27 jalur lama): scope luas, butuh admin consent pada app registration pinjaman IT, popup tambahan, dan risiko token. Seluruh pengiriman dialihkan ke Power Automate.
- U15 pembanding dua versi dan mode 'Final vs Ditandatangani': diff teks tidak melihat tabel, format, dan nomor otomatis sehingga memberi rasa aman palsu pada dokumen hukum; Legal sudah terbiasa dengan Compare di Word.
- U11 master Mitra penuh dengan status Diblokir/Terverifikasi dan gabung duplikat: verifikasi vendor adalah wewenang SCM/Pengadaan, hanya dijaga UI sehingga mudah diakali, penandatangan di master merusak komparisi historis, dan data pribadi menambah beban UU PDP. Diganti blok identitas per kontrak.
- U08 penyimpanan lampiran sebagai Blob di IndexedDB dan status 'Draf' di SharePoint: menambah risiko dokumen rahasia tertinggal di PC bersama dan mencemari alur status, KPI, dan antrean.
- U33 termin pembayaran dengan persen, nominal otomatis, dan templat termin: bersaing dengan sistem Keuangan/ERP, cepat basi, dan bentrok dengan nilai efektif addendum; cukup tonggak dan kewajiban ringan.
- U04 pakai Graph $batch dan 'Mulai Review' massal: menyalin logika jalankanAksi, rawan gagal sebagian, dan menyesatkan pengaju karena mengklaim PIC; loop berkonkurensi rendah dengan fungsi yang sudah ada cukup.
- U05 'Tandai Berakhir' massal tanpa tinjauan: status final tidak bisa dibalik dan kontrak konstruksi yang lewat tanggal sering masih berjalan; juga kemiripan nama mitra fuzzy dan indikator kelengkapan 7/9 yang hanya derau atau kosmetik.
- U26 Notification API peramban dan U39 delta query serta persistensi cache lintas sesi: nilai kecil dan hanya bekerja saat tab terbuka, sementara risikonya (data lintas divisi tertinggal di perangkat bersama) lebih besar.
- AI berbayar: tidak diperlukan; seluruh logika (templat email, pemindai klausul, ringkasan harian) berbasis aturan dan gratis. Panggilan model AI hanya ruang opsional di belakang tombol K06 bila kelak diinginkan.
- U07 (transparansi posisi dan kartu 'Pengajuan saya'): sudah tidak berlaku karena Ruang Pengguna sudah menyediakan posisi antrean, PIC, kartu pengajuan saya, dan kabar. Sisa yang nyata (sejak kapan di tahap ini dan penanda 'Menunggu saya') sudah tercakup di U01, U03, dan U05A.
