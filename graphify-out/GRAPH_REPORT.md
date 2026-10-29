# Graph Report - Kontrak  (2026-10-16)

## Corpus Check
- 234 files · ~348,811 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3142 nodes · 10682 edges · 143 communities (136 shown, 7 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 188 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- teams.ts (74)
- masukan.ts (73)
- filterKerja.ts (69)
- kontrak.ts (59)
- parserID.ts (48)
- Antrean.tsx (48)
- ChatAjukan.tsx (48)
- Layout.tsx (47)
- emailKit.ts (45)
- DetailKontrak.tsx (44)
- beban.ts (43)
- laporan.ts (42)
- isianPengajuan.ts (41)
- masa.ts (40)
- jejakAudit.ts (40)
- uji-flow.ts (39)
- ekstrak.ts (39)
- notifikasi.ts (38)
- arsip.ts (37)
- templateDocx.ts (37)
- jenisBerkas.ts (36)
- pemindai.ts (36)
- ekspor.ts (36)
- ttd.ts (34)
- buat-paket.mjs (33)
- pengaturan.ts (33)
- draf.ts (32)
- jaminan.ts (32)
- lembarReview.ts (32)
- pengaturan.mjs (31)
- LencanaSla.tsx (31)
- syarat.ts (31)
- umum.mjs (30)
- manifest.json (30)
- uji-daftar.ts (30)
- graph.ts (30)
- Laporan.tsx (30)
- mention.ts (29)
- revisi.ts (29)
- PanelPihak.tsx (29)
- portofolio.ts (29)
- jaminan.ts (28)
- kewenangan.ts (28)
- Dashboard.tsx (27)
- kelolaKontrak.ts (27)
- lembarReview.ts (27)
- types.ts (26)
- syarat.ts (26)
- masa.ts (25)
- uji-detail.ts (24)
- PanelLembarReview.tsx (24)
- format.ts (24)
- mitra.ts (24)
- pengaturan.ts (24)
- dokumen.ts (23)
- ics.ts (22)
- tsconfig.json (22)
- lembarStandar.ts (22)
- lembarDokumen.ts (22)
- Notifikasi.tsx (22)
- duplikat.ts (21)
- useSenyap.ts (21)
- pengingat.mjs (20)
- uji-lembar-review.ts (20)
- App.tsx (20)
- AksiMassal.tsx (20)
- ui.tsx (20)
- mitra.ts (20)
- mitra.ts (20)
- Pengaturan.tsx (20)
- cariDokumen.ts (19)
- saranChecklist.ts (19)
- terbilang.ts (19)
- penomoran.ts (19)
- laporan.mjs (18)
- PanelKewajiban.tsx (18)
- lapisan.ts (18)
- LembarEditor.tsx (18)
- package.json (17)
- package.json (17)
- agenda.mjs (17)
- mou.ts (17)
- uji-pengaturan.ts (16)
- PanelDokumenBaru.tsx (16)
- serupa.ts (16)
- alur.ts (16)
- uji-flow.ts (15)
- SesiContext.tsx (15)
- kabarAdmin.ts (15)
- uji-kewenangan.ts (13)
- buat-solusi.mjs (12)
- uji-pengajuan.ts (12)
- peramban.ts (12)
- Jaminan.tsx (12)
- jejakAudit.ts (12)
- periksa.mjs (11)
- uji-akses.ts (11)
- uji-notifikasi.ts (11)
- PratinjauDokumen.tsx (11)
- umpanBalik.ts (10)
- uji-mitra.ts (9)
- uji-untuk-anda.ts (9)
- GrafikDashboard.tsx (9)
- kabarAdmin.ts (9)
- cariPalet.ts (9)
- pengaturan.ts (9)
- kabar.ts (9)
- package.json (8)
- uji-laporan.ts (7)
- uji-masukan.ts (7)
- uji-senyap.ts (7)
- aktivitasTerbaru.ts (7)
- portofolio.ts (7)
- uji-flow.ts (6)
- uji-isian-pengajuan.ts (6)
- package.json (5)
- peramban.js (5)
- vite-env.d.ts (3)
- package.json (2)
- package.json (2)
- package.json (2)
- package.json (2)
- package.json (2)
- estimasi.ts
- Runbook keamanan WiCon
- SaranMitra.tsx
- msal.ts
- WiCon di Microsoft Teams
- Riset: formulir hasil review Legal
- Ymd
- Peta jalan perbaikan Kontrak WKI
- cobaUlang.ts
- dataAgenda
- PanelMasukan
- Global Rules
- GrafikLaporan.tsx
- Notifikasi email (Outlook lewat Power Automate)
- useMuatSesi
- lucide-react

## God Nodes (most connected - your core abstractions)
1. `cx()` - 184 edges
2. `Kontrak` - 151 edges
3. `useSesi()` - 129 edges
4. `pesanError()` - 80 edges
5. `useRuang()` - 73 edges
6. `Ymd` - 73 edges
7. `formatTanggal()` - 72 edges
8. `adalahLegal()` - 66 edges
9. `IsiForm()` - 62 edges
10. `useMuat()` - 59 edges

## Surprising Connections (you probably didn't know these)
- `useSenyap()` --indirect_call--> `lepas()`  [INFERRED]
  src/hooks/useSenyap.ts → public/peramban.js
- `PantauProvider()` --indirect_call--> `simpan()`  [INFERRED]
  src/context/PantauContext.tsx → scripts/uji-detail.ts
- `kasus()` --indirect_call--> `nomor()`  [INFERRED]
  scripts/uji-isian-pengajuan.ts → src/components/LencanaDaftar.tsx
- `kasus()` --indirect_call--> `nomor()`  [INFERRED]
  scripts/uji-masukan.ts → src/components/LencanaDaftar.tsx
- `dariForm()` --indirect_call--> `isian()`  [INFERRED]
  src/lib/pengaturan.ts → scripts/uji-masukan.ts

## Import Cycles
- None detected.

## Communities (143 total, 7 thin omitted)

### Community 0 - "teams.ts (74)"
Cohesion: 0.19
Nodes (15): alamatDiBrowser(), bacaSesi(), dalamIframe(), dalamTeams(), HasilMasukJendela, jalankanJendelaMasuk(), kabari(), PesanMasuk (+7 more)

### Community 1 - "masukan.ts (73)"
Cohesion: 0.14
Nodes (29): FormKasus(), ItemKasus(), NADA_JENIS, PanelKasus(), adaSengketaTerbuka(), JENIS_KASUS, JENIS_MEMICU_SENGKETA, JenisKasus (+21 more)

### Community 2 - "filterKerja.ts (69)"
Cohesion: 0.08
Nodes (41): alihPreset(), bandingNilai(), BOBOT_PRIORITAS, cocok(), cocokFilterKerja(), cocokPic(), DAFTAR_URUT_KERJA, daftarProyek() (+33 more)

### Community 3 - "kontrak.ts (59)"
Cohesion: 0.08
Nodes (32): Remah(), berakhirEfektifSeharusnya(), selisihBerakhirEfektif, ChecklistTtd, ModeBerakhir, Persetujuan, ambilDenganPilihan(), angka() (+24 more)

### Community 4 - "parserID.ts (48)"
Cohesion: 0.08
Nodes (40): jangka1(), nilai1(), tgl1(), useDaring(), ATURAN_JENIS, bacaAngkaCampur(), buatYmd(), BULAN_KE (+32 more)

### Community 5 - "Antrean.tsx (48)"
Cohesion: 0.12
Nodes (32): ChipTtdRingkas(), DaftarKabar(), gayaRingkas(), IKON_LANGKAH, JalurAntrean(), keteranganTtd(), KontrakTtd, LegendaAntrean() (+24 more)

### Community 6 - "ChatAjukan.tsx (48)"
Cohesion: 0.05
Nodes (51): BerkasAntre, AreaTampak, useAreaTampak(), adalahDivisiPengaju(), bacaDivisiTerakhir(), divisiAwalPengajuan(), HasilAkses, kunciDivisi() (+43 more)

### Community 7 - "Layout.tsx (47)"
Cohesion: 0.07
Nodes (53): AplikasiMasuk(), bacaTanggapan(), KartuRevisi(), PetaTanggapan, tulisTanggapan(), adaDrafDiPerangkat(), GrupMenu, halamanMasuk (+45 more)

### Community 8 - "emailKit.ts (45)"
Cohesion: 0.05
Nodes (116): barisSenyap, email(), g, Panggilan, tulis, kabariYangDisebut(), KotakDiskusi(), bisaKomentar() (+108 more)

### Community 9 - "DetailKontrak.tsx (44)"
Cohesion: 0.07
Nodes (51): GrafikKalender(), KartuHasilReview(), KelompokMasa(), RujukanKewenangan(), BerkasFinal, TAHAP, fmtHariPanjang, fmtJam (+43 more)

### Community 10 - "beban.ts (43)"
Cohesion: 0.06
Nodes (84): GalatKirim(), KartuBeban(), BAWAAN_PENGINGAT, PanelIngatkan(), PropsKotakDiskusi, TeksDiskusi(), ModalHapus(), DialogArsip() (+76 more)

### Community 11 - "laporan.ts (42)"
Cohesion: 0.13
Nodes (30): kontrakUntukPeriode(), adalahStatus(), awalHariWib(), bangunInterval(), BULAN_PANJANG, BULAN_PENDEK, dalamPeriode(), deretBulanan() (+22 more)

### Community 12 - "isianPengajuan.ts (41)"
Cohesion: 0.11
Nodes (45): nama(), rapikanMitra(), useDataSaranMitra(), useCegahTutup(), ingatDivisiTerakhir(), konteksDraf(), teksLampirkanUlang(), validasiUlangDraf() (+37 more)

### Community 13 - "masa.ts (40)"
Cohesion: 0.20
Nodes (17): Fakta(), FormKlausul(), LABEL_TAHAP, NADA_TAHAP, PanelMasa(), panelMasaRelevan(), RingkasanMasa(), teksSisa() (+9 more)

### Community 14 - "jejakAudit.ts (40)"
Cohesion: 0.11
Nodes (26): AktivitasMentah, amankan(), bedaPengguna(), dariLogAdmin(), DataPengguna, fmtWaktuJakarta, fmtYmdJakarta, KOLOM_CSV_JEJAK (+18 more)

### Community 15 - "uji-flow.ts (39)"
Cohesion: 0.07
Nodes (27): Aksi, BULAN, BULAN_PENDEK, CONTOH, dua(), Email, formatWaktu(), FUNGSI (+19 more)

### Community 16 - "ekstrak.ts (39)"
Cohesion: 0.11
Nodes (23): bisaDipindai(), ModalBuatDraf(), ModalPindai(), NADA_SELISIH, PanelDraf(), PenandaKosongPindai(), STATUS_PANEL, Tahap (+15 more)

### Community 17 - "notifikasi.ts (38)"
Cohesion: 0.10
Nodes (28): buat(), legal, cuplikan(), Keadaan, langganan(), muatPermintaanTtd(), pendengar, useTtdSaya() (+20 more)

### Community 18 - "arsip.ts (37)"
Cohesion: 0.07
Nodes (67): jszip, jszip, admin, dok(), kasus(), kontrak(), legal, main() (+59 more)

### Community 19 - "templateDocx.ts (37)"
Cohesion: 0.13
Nodes (35): atau(), bersih(), Blok, buatDrafDocx(), daftarPasal(), fmtAngka, keYmdWib(), konsiderans() (+27 more)

### Community 20 - "jenisBerkas.ts (36)"
Cohesion: 0.13
Nodes (26): FormJawaban(), FormMinta(), KonfirmasiBatal(), JawabanMasukan, masukanKosong(), PermintaanMasukan, rapikanMasukan(), STATUS_MASUKAN (+18 more)

### Community 21 - "pemindai.ts (36)"
Cohesion: 0.13
Nodes (31): DATA, konteksSebelum(), normalisasiNama(), potongan(), ratakan(), samaNama(), Temuan, urailJenis() (+23 more)

### Community 22 - "ekspor.ts (36)"
Cohesion: 0.12
Nodes (32): amankanTeks(), barisAddendum(), barisKontrakEkspor, BarisRiwayat, dua(), eksporKontrakCsv(), eksporKontrakExcel(), formatAngka() (+24 more)

### Community 23 - "ttd.ts (34)"
Cohesion: 0.10
Nodes (42): legal, pengaju, DialogSetuju(), ChipTtd(), FormLangkah(), PanelTtd(), PropsPanelTtd, hariIni() (+34 more)

### Community 24 - "buat-paket.mjs (33)"
Cohesion: 0.08
Nodes (30): IsianPihakLain(), v(), AKAR, bacaEnvProduksi(), crc32(), dalamPoligon(), diGaris(), DOKUMEN (+22 more)

### Community 25 - "pengaturan.ts (33)"
Cohesion: 0.27
Nodes (16): validasiMatriksKewenangan(), bacaDaftarHariTeks(), bulat(), dariForm(), formatDariForm(), gagal(), keAngka(), matriksDariForm() (+8 more)

### Community 26 - "draf.ts (32)"
Cohesion: 0.14
Nodes (29): BannerDraf(), DrafPengajuan, EkstraDraf, judulDraf(), PropsBannerDraf, useDrafPengajuan(), bacaDraf(), bersihkanData() (+21 more)

### Community 27 - "jaminan.ts (32)"
Cohesion: 0.15
Nodes (26): BarisJaminan(), LencanaSisaJaminan(), PanelJaminan(), AMBANG_JAMINAN, jaminanBerlaku(), jaminanKeCsv(), KodePeringatanJaminan, levelJaminan (+18 more)

### Community 28 - "lembarReview.ts (32)"
Cohesion: 0.10
Nodes (37): BagianKesimpulan(), DialogFinal(), URUTAN_JENIS, adalahObjek(), angka(), BerkasReview, ButirKepatuhan, cekFinalisasi() (+29 more)

### Community 29 - "pengaturan.mjs (31)"
Cohesion: 0.12
Nodes (28): aksiHariKerja(), aksiModeUji(), aksiPengaturan(), aksiTimLegal(), ambangEskalasi(), BAWAAN, bilaAda(), daftarAngkaPolos() (+20 more)

### Community 30 - "LencanaSla.tsx (31)"
Cohesion: 0.13
Nodes (28): infoSla, judulUmur(), KATA_LEVEL, Nada, nadaTarget(), Pil(), PropsLencanaSla, SlaKompak() (+20 more)

### Community 31 - "syarat.ts (31)"
Cohesion: 0.11
Nodes (34): PropsPanelDokumen, PanelSyarat(), PenghitungSyarat(), PropsPanelSyarat, salin(), PropsUnggahDokumen, KelompokDokumen, buangButir() (+26 more)

### Community 32 - "umum.mjs (30)"
Cohesion: 0.11
Nodes (19): barisTombol(), filterAkhirSesudah(), httpSharePoint(), kerangka(), kirimEmail(), kondisi(), lencana(), LIST (+11 more)

### Community 33 - "manifest.json (30)"
Cohesion: 0.07
Nodes (29): identity, wicon.waskitainfrastruktur.co.id, accentColor, description, full, short, developer, name (+21 more)

### Community 34 - "uji-daftar.ts (30)"
Cohesion: 0.07
Nodes (22): ADD, addAktif, addBedaDitolak, addBedaMu, addProses, antre, berakhir, data (+14 more)

### Community 35 - "graph.ts (30)"
Cohesion: 0.18
Nodes (23): galatSementara(), ulangiPenulisan(), bungkusDetail(), DetailBerversi, DetailPerubahan, AktivitasBaru, catatAktivitas(), ItemGraph (+15 more)

### Community 36 - "Laporan.tsx (30)"
Cohesion: 0.08
Nodes (34): GrafikTunda(), useSetelahTampil(), AngkaHidup(), useDaftarKontrak(), tulisFilterKerja(), Mengendap, PresetPeriode, BlokDurasi() (+26 more)

### Community 37 - "mention.ts (29)"
Cohesion: 0.16
Nodes (21): buatPng(), crc32(), dasar(), isiContoh(), potong(), A4, ABU, Alat (+13 more)

### Community 38 - "revisi.ts (29)"
Cohesion: 0.13
Nodes (22): PropsKartuRevisi, MuatDokumen, PropsPanelLembar, PropsUnggahAktivasi, MasukanDataOtomatis, baruDikirimUlang(), bersihkan(), daftarTemplatPoin() (+14 more)

### Community 39 - "PanelPihak.tsx (29)"
Cohesion: 0.19
Nodes (23): Data(), FormPihak(), masterUntuk(), PanelPihak(), salinKomparisi(), salinTeks(), useMasterMitra(), formatNpwp() (+15 more)

### Community 40 - "portofolio.ts (29)"
Cohesion: 0.12
Nodes (20): pasangPenyimpanan(), UnggahCerdas(), BarisAddendumEkspor, IsianWarisan, NilaiUang, RingkasanPlafon, bandingBaris(), BarisAgregat (+12 more)

### Community 41 - "jaminan.ts (28)"
Cohesion: 0.17
Nodes (20): isianAwal(), IsianJaminan, KotakPeringatanJaminan(), ModalJaminan(), NADA_LEVEL, PeringatanAktivasiJaminan(), adalahJasa(), peringatanAktivasi() (+12 more)

### Community 42 - "kewenangan.ts (28)"
Cohesion: 0.16
Nodes (17): FormCatat(), useRujukan(), hapusPersetujuan(), Hasil, HasilRujukan, IsianPersetujuan, ItemPersetujuan, MATRIKS_KEWENANGAN_BAWAAN (+9 more)

### Community 43 - "Dashboard.tsx (27)"
Cohesion: 0.07
Nodes (44): LencanaMataUangBeda(), LencanaModeBerakhir(), LencanaPerpanjangan(), NADA_MODE, LencanaSla(), useMatriks(), WARNA_STATUS_GRAFIK, usePengaturan() (+36 more)

### Community 44 - "kelolaKontrak.ts (27)"
Cohesion: 0.14
Nodes (25): ambilToken(), galatJaringan(), galatSesi(), graph(), pesanGagal(), kabarkanPerluLogin(), alasanSah(), arsipkanKontrak() (+17 more)

### Community 45 - "lembarReview.ts (27)"
Cohesion: 0.11
Nodes (28): MuatLembar, buatLembarDocx(), bungkusHasilPengaju(), bungkusLembar(), hasilPengajuTerkini(), LembarReview, namaBerkasLembar(), padatkan() (+20 more)

### Community 46 - "types.ts (26)"
Cohesion: 0.27
Nodes (9): Divisi, aksiLogPengguna(), catatPerubahanPengguna(), FormPengguna(), ItemGraph, keFields(), PenggunaInput, tambahPengguna() (+1 more)

### Community 47 - "syarat.ts (26)"
Cohesion: 0.19
Nodes (19): bisaDipindai(), ChecklistReviewPanel(), PeringatanReview(), PropsChecklist, TahapPindai, pilihDraftTerbaru(), ringkasSaran(), checklistReviewKontrak() (+11 more)

### Community 48 - "masa.ts (25)"
Cohesion: 0.14
Nodes (22): ModalKewajiban(), AMBANG_PENGINGAT, BOBOT_LEVEL, fmtYmd, Kewajiban, KewajibanInput, RingkasanKewajiban, STATUS_KEWAJIBAN (+14 more)

### Community 49 - "uji-detail.ts (24)"
Cohesion: 0.10
Nodes (13): admin, budi, Fields, g, Graf, OpsiGraf, pantau, rina (+5 more)

### Community 50 - "PanelLembarReview.tsx (24)"
Cohesion: 0.17
Nodes (21): bacaLokal(), BilahAksi(), hapusLokal(), kunciLokal(), PanelLembarReview(), PeringatanLembarTtd(), salin(), Sibuk (+13 more)

### Community 51 - "format.ts (24)"
Cohesion: 0.13
Nodes (20): KALIMAT_TEMU, Keadaan, LABEL_YAKIN, PropsUnggahCerdas, URUTAN, bacaDocx(), bacaPdf(), cekBerkasEkstrak() (+12 more)

### Community 52 - "mitra.ts (24)"
Cohesion: 0.30
Nodes (11): MitraInput, FormMitra(), ImporMitra(), ambilSemuaMitra(), dariItem(), ItemGraph, keFields(), kosongkanCacheMitra() (+3 more)

### Community 53 - "pengaturan.ts (24)"
Cohesion: 0.16
Nodes (20): BAWAAN, NilaiPengaturan, PengaturanContext, PengaturanProvider(), BarisPengaturan, HasilBaca, KunciPengaturan, pasangPengaturanAktif() (+12 more)

### Community 54 - "dokumen.ts (23)"
Cohesion: 0.11
Nodes (22): GraphError, DriveItem, galatTerkunci(), hapusDokumen(), HasilRedline, HasilUnggah, HasilUnggahBanyak, ITEM_KONTRAK() (+14 more)

### Community 55 - "ics.ts (22)"
Cohesion: 0.22
Nodes (13): RFC-5545, buatIcs(), enkoder, escapeIcs(), hashTeks(), lipatBaris(), opsiIcsBerakhir(), pemicuAlarm() (+5 more)

### Community 56 - "tsconfig.json (22)"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2020, src, vite/client, compilerOptions, isolatedModules, jsx (+13 more)

### Community 57 - "lembarStandar.ts (22)"
Cohesion: 0.09
Nodes (22): Addendum, Ajukan lewat chat, Akses, Alur dan peran, Arsip dan hapus kontrak, Azure (Microsoft Entra ID), Belum ada (tahap berikutnya), Deploy ke wicon.waskitainfrastruktur.co.id (+14 more)

### Community 58 - "lembarDokumen.ts (22)"
Cohesion: 0.07
Nodes (50): Bagian(), BagianKepatuhan(), ChipRisiko(), KartuTemuan(), KEPATUHAN_PETUNJUK, LembarEditor(), NADA_RISIKO, PropsLembarEditor (+42 more)

### Community 59 - "Notifikasi.tsx (22)"
Cohesion: 0.08
Nodes (33): DokumenLembar(), TampilanCetakLembar(), TukarRuang(), BagianOtomatis(), DaftarUntukAnda(), BarisDokumen(), ItemMasukan(), BarisPersetujuan() (+25 more)

### Community 60 - "duplikat.ts (21)"
Cohesion: 0.20
Nodes (16): judulKartu(), PeringatanGanda(), teksSisa(), useTemuanGanda(), adaTemuan(), akhirBerlaku(), cariPengajuanGanda(), DrafPengajuan (+8 more)

### Community 61 - "useSenyap.ts (21)"
Cohesion: 0.22
Nodes (13): cuplikan(), Keadaan, KOSONG, langganan(), muat(), pendengar, ubah(), useSenyap() (+5 more)

### Community 62 - "pengingat.mjs (20)"
Cohesion: 0.11
Nodes (16): { akhir: AKHIR, adaMasa: ADA_MASA, masa: MASA, otomatis: OTOMATIS, sisaAkhir: SISA_AKHIR, pakaiBatas: PAKAI_BATAS }, aturanItem, aturanKontrak(), [awalTombolAddendum, akhirTombolAddendum], blokJaminan, blokKewajiban, blokKontrak, emailJaminan (+8 more)

### Community 63 - "uji-lembar-review.ts (20)"
Cohesion: 0.09
Nodes (26): DATA, kontrak(), legal, pemantau, pengaju, pengulas, putaranFinal(), putaranLengkap() (+18 more)

### Community 64 - "App.tsx (20)"
Cohesion: 0.09
Nodes (17): Arsip, ChatAjukan, DaftarKontrak, Dashboard, DetailKontrak, DetailTandaTangan, FormKontrak, Jaminan (+9 more)

### Community 65 - "AksiMassal.tsx (20)"
Cohesion: 0.13
Nodes (34): akhiriSatu(), AksiMassal(), DaftarNomor(), ModalAkhiriMassal(), ModalPicMassal(), MODE_MASSAL, nomorTampil(), PropsAksiMassal (+26 more)

### Community 66 - "ui.tsx (20)"
Cohesion: 0.10
Nodes (15): B, berkas, berkasId, crc32(), daftar, dokumen, emailTerantri, g (+7 more)

### Community 67 - "mitra.ts (20)"
Cohesion: 0.20
Nodes (14): legal, master, pengajuScm, adalahAktif(), cariMitraPersis(), cariMitraSerupa(), kontrakDenganMitra(), kunciMaster() (+6 more)

### Community 68 - "mitra.ts (20)"
Cohesion: 0.21
Nodes (20): akhirKontrak(), BADAN_UTAMA, badanDari(), bedaSatuHuruf(), HasilNpwp, jaccardToleran(), KATA_PENGHUBUNG, kelompokNamaKontrak (+12 more)

### Community 69 - "Pengaturan.tsx (20)"
Cohesion: 0.10
Nodes (24): BarisMatriksForm, DAFTAR_KUNCI, flowPembaca(), GalatForm, keForm(), NAMA_HARI, PENGATURAN_BAWAAN, pengaturanBawaan() (+16 more)

### Community 70 - "cariDokumen.ts (19)"
Cohesion: 0.15
Nodes (17): beton, kasus(), nda, sewa, useCariDokumen(), ENTITAS, folderDariWebUrl(), HasilDokumen (+9 more)

### Community 71 - "saranChecklist.ts (19)"
Cohesion: 0.15
Nodes (16): DRAF_LENGKAP, id, jenisPenanda(), pembanding, BidangSaran, deteksiPenandaKosong(), HasilPindai, BIDANG_BUTIR (+8 more)

### Community 72 - "terbilang.ts (19)"
Cohesion: 0.19
Nodes (17): ruangTanggal(), KATA_SATUAN, KATA_SKALA, kataBulat(), NAMA_BULAN, NAMA_HARI, namaHari(), pecah() (+9 more)

### Community 73 - "penomoran.ts (19)"
Cohesion: 0.17
Nodes (16): Acuan, acuanDari(), escapeRegex(), FORMAT_PENOMORAN_BAWAAN, isiPola(), kodeJenis(), nomorAddendum(), PENANDA_POLA (+8 more)

### Community 74 - "laporan.mjs (18)"
Cohesion: 0.12
Nodes (16): kosong(), barisKontrak(), barisStatus, kosong(), saringStatus, STATUS, td(), WARNA_STATUS (+8 more)

### Community 75 - "PanelKewajiban.tsx (18)"
Cohesion: 0.22
Nodes (18): BarPlafon(), addendumBedaMataUang(), bedaMataUang(), berakhirEfektif(), hidup(), judulUsulanAddendum(), kelompokPerInduk(), memperpanjang() (+10 more)

### Community 76 - "lapisan.ts (18)"
Cohesion: 0.11
Nodes (25): ButirMenu, Dialog, MenuDokumen(), PanelDokumenBaru(), TombolArsip(), adalahIos(), bukaTab(), caraPratinjau() (+17 more)

### Community 77 - "LembarEditor.tsx (18)"
Cohesion: 0.18
Nodes (14): addendum(), kontrak(), teksLevel(), filterJaminanAmbang(), awalHariIso(), filterKewajibanJatuhTempo(), filterTanggalTepat(), levelKewajiban (+6 more)

### Community 78 - "package.json (17)"
Cohesion: 0.12
Nodes (17): autoprefixer, devDependencies, autoprefixer, postcss, tailwindcss, @types/react, @types/react-dom, typescript (+9 more)

### Community 79 - "package.json (17)"
Cohesion: 0.12
Nodes (17): @azure/msal-browser, @azure/msal-react, docx, exceljs, dependencies, @azure/msal-browser, @azure/msal-react, docx (+9 more)

### Community 80 - "agenda.mjs (17)"
Cohesion: 0.15
Nodes (14): barisPerhatian(), emailPribadi, emailTim, kerangkaPerhatian, [p1, sisa1], [p2, sisa2], [p3, p4], tautanKontrak() (+6 more)

### Community 81 - "mou.ts (17)"
Cohesion: 0.13
Nodes (44): AmbilPicDariTautan(), PanelRiwayatMitra(), PanelTandaTangan(), Item(), useRuang(), terapkanPermintaan(), indeksTahap(), formatMasuk() (+36 more)

### Community 82 - "uji-pengaturan.ts (16)"
Cohesion: 0.12
Nodes (10): admin, andi, budi, budiS, citra, legal, nonaktif, pantau (+2 more)

### Community 83 - "PanelDokumenBaru.tsx (16)"
Cohesion: 0.11
Nodes (11): data, draf, k, PropsKartuBeban, Props, HasilPenugasan, PihakLain, Kontrak (+3 more)

### Community 84 - "serupa.ts (16)"
Cohesion: 0.26
Nodes (13): bisaAjukan(), bisaAjukanAddendum(), bisaLihat(), bisaAjukanSerupa(), dariKontrak(), DataAwalSerupa, divisiDariSesi(), pesanDisalinDari() (+5 more)

### Community 85 - "alur.ts (16)"
Cohesion: 0.11
Nodes (31): CaraBukti, DOKUMEN_TIPE, IKON_TIPE, ModalSelesai(), NADA_LEVEL, PanelKewajiban(), tautanAman(), USULAN (+23 more)

### Community 86 - "uji-flow.ts (15)"
Cohesion: 0.34
Nodes (15): adalahAngka(), akses(), bandingkan(), bulat(), gagal(), hitung(), jalankanFlow(), Nilai (+7 more)

### Community 87 - "SesiContext.tsx (15)"
Cohesion: 0.22
Nodes (10): ADMIN_BAWAAN, LIST_ID, AlasanTanpaAkses, ISI, TanpaAkses(), tautanMintaAkses(), ambilSemuaEventStatus(), ItemGraph (+2 more)

### Community 88 - "kabarAdmin.ts (15)"
Cohesion: 0.22
Nodes (16): PantauContext, PantauProvider(), bacaSimpanan(), buatJejak(), kunci(), tulisSimpanan(), aktivitasIdTerakhir(), bacaSimpananAdmin() (+8 more)

### Community 89 - "uji-kewenangan.ts (13)"
Cohesion: 0.15
Nodes (9): kasus(), kasus(), sah, kasus(), kasus(), kasus(), kasus(), kasus() (+1 more)

### Community 90 - "buat-solusi.mjs (12)"
Cohesion: 0.20
Nodes (7): semuaAlur, alur, dipakai, rujukan, wfXml(), xmlEsc(), zip

### Community 91 - "uji-pengajuan.ts (12)"
Cohesion: 0.20
Nodes (10): budi, dataMasa, hariLalu(), jamLalu(), k(), kontrakBeban, pengguna, rina (+2 more)

### Community 92 - "peramban.ts (12)"
Cohesion: 0.30
Nodes (8): kasus(), PeringatanPeramban(), sudahDiabaikan(), ambilJalur(), FITUR_PENTING, HasilPeriksaPeramban, periksaPeramban(), pesanPeramban

### Community 93 - "Jaminan.tsx (12)"
Cohesion: 0.22
Nodes (13): HasilMasukUlang, jalankan(), masukUlang(), masukLewatJendela(), PitaSesi(), msalTerpasang(), dengarPerluLogin(), dengarSesiPulih() (+5 more)

### Community 94 - "jejakAudit.ts (12)"
Cohesion: 0.29
Nodes (11): graphSemua(), batasPeriodeUtc(), dariAktivitas(), EntriJejak, ambilJejak(), galatUmum(), HasilJejak, ItemGraph (+3 more)

### Community 95 - "periksa.mjs (11)"
Cohesion: 0.22
Nodes (5): daftarAksi(), FUNGSI, RUJUK_AKSI, TANPA_ARGUMEN, aksi()

### Community 96 - "uji-akses.ts (11)"
Cohesion: 0.17
Nodes (11): andi, milikAndi, milikBudiScm, pengguna, rina, sari, tentukan(), A (+3 more)

### Community 97 - "uji-notifikasi.ts (11)"
Cohesion: 0.24
Nodes (9): Baris, em(), KejadianNotif, kon(), konteks(), KonteksNotif, Kontrak, PENGGUNA (+1 more)

### Community 98 - "PratinjauDokumen.tsx (11)"
Cohesion: 0.16
Nodes (23): capWaktu(), namaBerkasTtd(), hitungSha256(), EmailKeluar, PanelTandaiSaya(), cariBerkasJalur(), graphBlob(), hapusBerkasId() (+15 more)

### Community 99 - "umpanBalik.ts (10)"
Cohesion: 0.42
Nodes (9): berhasil(), gagal(), info(), keSonner(), nada(), NadaUmpanBalik, OpsiUmpanBalik, peringatan() (+1 more)

### Community 100 - "uji-mitra.ts (9)"
Cohesion: 0.22
Nodes (17): pesanKonflik(), dariYmd(), kabarkanCacheKontrakKosong(), cekNomorGanda(), normalNomor(), KartuRekonsiliasi(), batalkanCache(), jalankanAksi() (+9 more)

### Community 101 - "uji-untuk-anda.ts (9)"
Cohesion: 0.31
Nodes (8): akt(), k(), kasus(), menitLalu(), rina, SEKARANG, simpanan(), WAKTU

### Community 102 - "GrafikDashboard.tsx (9)"
Cohesion: 0.15
Nodes (11): GAYA_TOOLTIP, bandingkan(), Jejak, JenisKabar, kabarStatus(), NadaKabar, Simpanan, JejakAdmin (+3 more)

### Community 103 - "kabarAdmin.ts (9)"
Cohesion: 0.36
Nodes (8): NilaiPantau, Kabar, bandingkanAdmin(), buatJejakAdmin(), picDari(), potong(), SimpananAdmin, teksStatus()

### Community 104 - "cariPalet.ts (9)"
Cohesion: 0.39
Nodes (8): AlasanCocok, cariKontrakPalet(), cocokKontrakPalet(), CocokPalet, kecil(), nilaiSkor(), pecahReferensi(), rapat()

### Community 105 - "pengaturan.ts (9)"
Cohesion: 0.12
Nodes (21): DataTautan, IsianDiperiksa, JenjangKewenangan, DefKepatuhan, DefKlausul, adalahKunci(), aktif, AmbangEskalasi (+13 more)

### Community 106 - "kabar.ts (9)"
Cohesion: 0.18
Nodes (12): PadTandaTangan, PadTandaTanganRef, Titik, Mode, PilihanTtd, PilihTtd, PilihTtdRef, Props (+4 more)

### Community 107 - "package.json (8)"
Cohesion: 0.25
Nodes (7): description, engines, node, name, private, type, version

### Community 108 - "uji-laporan.ts (7)"
Cohesion: 0.22
Nodes (6): ev(), riwayatLancar(), SEKARANG, OpsiEksporExcel, EventStatus, Laporan

### Community 109 - "uji-masukan.ts (7)"
Cohesion: 0.29
Nodes (5): isian(), kasus(), Kontrak, PermintaanMasukan, sekarang

### Community 110 - "uji-senyap.ts (7)"
Cohesion: 0.13
Nodes (15): SaringanJaminan, CARA_TTD, DAFTAR_DIVISI, DAFTAR_PERAN, JaminanInput, JejakDraftFinal, JENIS_AKTIVITAS, JENIS_JAMINAN (+7 more)

### Community 111 - "aktivitasTerbaru.ts (7)"
Cohesion: 0.38
Nodes (5): ambilAktivitasSejak(), ItemGraph, teks(), AktivitasRingkas, JenisAktivitas

### Community 112 - "portofolio.ts (7)"
Cohesion: 0.15
Nodes (12): Additional Forbidden Patterns, Anti-Patterns (Do NOT Use), Buttons, Cards, Component Specs, Design System Master File, Inputs, Modals (+4 more)

### Community 113 - "uji-flow.ts (6)"
Cohesion: 0.33
Nodes (7): adalahObj(), cocokOData(), evaluasi(), hitungMurni(), keJs(), nilaiFlow(), uraiEkspresi()

### Community 114 - "uji-isian-pengajuan.ts (6)"
Cohesion: 0.40
Nodes (5): isianDasar, jamLalu(), k(), kasus(), SEKARANG

### Community 115 - "package.json (5)"
Cohesion: 0.40
Nodes (5): scripts, build, dev, preview, typecheck

### Community 116 - "peramban.js (5)"
Cohesion: 0.50
Nodes (3): buat(), lepas(), tampilkan()

### Community 126 - "estimasi.ts"
Cohesion: 0.28
Nodes (12): fmtTanggal, perkiraanSelesaiAntrean(), tambahHariKerja(), teksRentang(), teksTanggal(), hariKerjaAntara(), hitungDurasiTahap(), hitungSiklusTotal() (+4 more)

### Community 127 - "Runbook keamanan WiCon"
Cohesion: 0.17
Nodes (12): 0. Akses untuk semua akun domain (keputusan 3 Okt 2026), 1. Uji dulu dengan akun contoh, 2. Grup SharePoint, 3. Tingkat izin "Tambah Saja", 4. Izin per list, 5. Riwayat versi, 6. Retensi (admin Microsoft 365), 7. Azure (Microsoft Entra ID) (+4 more)

### Community 128 - "SaranMitra.tsx"
Cohesion: 0.24
Nodes (10): ChipSaranMitra(), DatalistMitra(), DataSaranMitra, keteranganSaran(), PetunjukMitraMirip(), Kandidat, RingkasanMitra, SaranNamaMitra (+2 more)

### Community 129 - "msal.ts"
Cohesion: 0.29
Nodes (8): dalamJendelaAuth(), loginRequest, msalConfig, SCOPE_GRAPH, ssoRequest, pasangMsal(), msal, mulai()

### Community 130 - "WiCon di Microsoft Teams"
Cohesion: 0.22
Nodes (9): A. Untuk seluruh perusahaan (disarankan): Teams Admin Center, B. Uji coba pribadi: sideload, Batasan yang diketahui, Cara login di Teams, Isi folder, Memasang di Teams, Membuat paket, Persiapan sekali saja (+1 more)

### Community 131 - "Riset: formulir hasil review Legal"
Cohesion: 0.25
Nodes (8): Bedanya dengan dokumen lain, Daftar periksa regulasi (standar awal), Isi yang lazim, Kesimpulan akhir dan hubungannya dengan alur aplikasi, Riset: formulir hasil review Legal, Singkatnya: formulir ini apa?, Skala risiko yang paling umum, Sumber utama

### Community 132 - "Ymd"
Cohesion: 0.25
Nodes (8): RingkasanAddendum, OpsiIcs, FilterJejak, PersetujuanLembar, MasukanBaru, Ymd, PermintaanJejak, HasilSinkron

### Community 133 - "Peta jalan perbaikan Kontrak WKI"
Cohesion: 0.29
Nodes (7): Keputusan yang dibutuhkan, Peta jalan perbaikan Kontrak WKI, Tahap 1 - Fondasi, perbaikan angka, dan cap waktu masuk, Tahap 2 - Notifikasi Outlook, antrean, dan pengingat terjadwal, Tahap 3 - Dokumen, revisi, dan pengajuan, Tahap 4 - Siklus kontrak, tata kelola, laporan, dan otomasi lanjutan, Tidak disarankan

### Community 134 - "cobaUlang.ts"
Cohesion: 0.43
Nodes (6): bacaRetryAfter(), bolehCobaUlang(), GalatBerstatus, jedaCobaUlang(), METODE_AMAN_SIBUK, tidur()

### Community 135 - "dataAgenda"
Cohesion: 0.53
Nodes (6): barisPengaturan(), dataAgenda(), dataPengingat(), kontrakSp(), pengguna(), tglSp()

### Community 136 - "PanelMasukan"
Cohesion: 0.47
Nodes (6): PanelMasukan(), teksLama(), masihMenunggu(), rentangTungguMasukan(), ringkasMasukan(), urutkanMasukan()

### Community 137 - "Global Rules"
Cohesion: 0.40
Nodes (5): Color Palette, Global Rules, Shadow Depths, Spacing Variables, Typography

### Community 139 - "GrafikLaporan.tsx"
Cohesion: 0.40
Nodes (3): GAYA_TOOLTIP, TitikKalender, TitikBulan

### Community 140 - "Notifikasi email (Outlook lewat Power Automate)"
Cohesion: 0.67
Nodes (3): Flow, Mode uji email, Notifikasi email (Outlook lewat Power Automate)

### Community 141 - "useMuatSesi"
Cohesion: 1.00
Nodes (3): useMuatSesi(), adalahEmailKantor(), tentukanAkses()

## Knowledge Gaps
- **713 isolated node(s):** `name`, `version`, `private`, `description`, `type` (+708 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Kontrak` connect `PanelDokumenBaru.tsx (16)` to `SaranMitra.tsx`, `masukan.ts (73)`, `filterKerja.ts (69)`, `kontrak.ts (59)`, `Ymd`, `Antrean.tsx (48)`, `ChatAjukan.tsx (48)`, `Layout.tsx (47)`, `emailKit.ts (45)`, `DetailKontrak.tsx (44)`, `beban.ts (43)`, `laporan.ts (42)`, `isianPengajuan.ts (41)`, `masa.ts (40)`, `ekstrak.ts (39)`, `arsip.ts (37)`, `templateDocx.ts (37)`, `jenisBerkas.ts (36)`, `pemindai.ts (36)`, `ekspor.ts (36)`, `ttd.ts (34)`, `draf.ts (32)`, `jaminan.ts (32)`, `lembarReview.ts (32)`, `LencanaSla.tsx (31)`, `syarat.ts (31)`, `uji-daftar.ts (30)`, `Laporan.tsx (30)`, `revisi.ts (29)`, `PanelPihak.tsx (29)`, `portofolio.ts (29)`, `jaminan.ts (28)`, `kewenangan.ts (28)`, `Dashboard.tsx (27)`, `kelolaKontrak.ts (27)`, `lembarReview.ts (27)`, `syarat.ts (26)`, `masa.ts (25)`, `uji-detail.ts (24)`, `PanelLembarReview.tsx (24)`, `dokumen.ts (23)`, `ics.ts (22)`, `lembarDokumen.ts (22)`, `Notifikasi.tsx (22)`, `duplikat.ts (21)`, `uji-lembar-review.ts (20)`, `AksiMassal.tsx (20)`, `mitra.ts (20)`, `mitra.ts (20)`, `cariDokumen.ts (19)`, `penomoran.ts (19)`, `PanelKewajiban.tsx (18)`, `lapisan.ts (18)`, `LembarEditor.tsx (18)`, `mou.ts (17)`, `uji-pengaturan.ts (16)`, `serupa.ts (16)`, `alur.ts (16)`, `kabarAdmin.ts (15)`, `uji-pengajuan.ts (12)`, `jejakAudit.ts (12)`, `uji-akses.ts (11)`, `PratinjauDokumen.tsx (11)`, `uji-untuk-anda.ts (9)`, `GrafikDashboard.tsx (9)`, `kabarAdmin.ts (9)`, `cariPalet.ts (9)`, `pengaturan.ts (9)`, `uji-laporan.ts (7)`, `uji-senyap.ts (7)`, `uji-isian-pengajuan.ts (6)`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Why does `nama()` connect `isianPengajuan.ts (41)` to `AksiMassal.tsx (20)`, `laporan.mjs (18)`, `syarat.ts (26)`, `ekstrak.ts (39)`, `uji-flow.ts (6)`, `PanelLembarReview.tsx (24)`, `mou.ts (17)`, `mitra.ts (24)`, `uji-flow.ts (15)`, `periksa.mjs (11)`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `cx()` connect `Notifikasi.tsx (22)` to `SaranMitra.tsx`, `masukan.ts (73)`, `filterKerja.ts (69)`, `kontrak.ts (59)`, `teams.ts (74)`, `Antrean.tsx (48)`, `ChatAjukan.tsx (48)`, `Layout.tsx (47)`, `emailKit.ts (45)`, `DetailKontrak.tsx (44)`, `beban.ts (43)`, `isianPengajuan.ts (41)`, `masa.ts (40)`, `ekstrak.ts (39)`, `arsip.ts (37)`, `ttd.ts (34)`, `draf.ts (32)`, `jaminan.ts (32)`, `lembarReview.ts (32)`, `LencanaSla.tsx (31)`, `syarat.ts (31)`, `Laporan.tsx (30)`, `PanelPihak.tsx (29)`, `portofolio.ts (29)`, `jaminan.ts (28)`, `Dashboard.tsx (27)`, `syarat.ts (26)`, `PanelLembarReview.tsx (24)`, `format.ts (24)`, `mitra.ts (24)`, `lembarDokumen.ts (22)`, `AksiMassal.tsx (20)`, `Pengaturan.tsx (20)`, `PanelKewajiban.tsx (18)`, `lapisan.ts (18)`, `mou.ts (17)`, `alur.ts (16)`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _713 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `masukan.ts (73)` be split into smaller, more focused modules?**
  _Cohesion score 0.1431451612903226 - nodes in this community are weakly interconnected._
- **Should `filterKerja.ts (69)` be split into smaller, more focused modules?**
  _Cohesion score 0.07549361207897794 - nodes in this community are weakly interconnected._
- **Should `kontrak.ts (59)` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._