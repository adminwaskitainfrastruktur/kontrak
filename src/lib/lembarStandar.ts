// Isi STANDAR AWAL Lembar Hasil Review Legal: kriteria risiko, pilihan kesimpulan, pokok-pokok kontrak per jenis,
// daftar periksa kepatuhan regulasi beserta dasar hukumnya, dan usulan syarat sebelum tanda tangan.
//
// Semua isi di sini disusun dari riset praktik review kontrak di Indonesia dan internasional, BUKAN keputusan resmi
// Legal WKI. Di UI selalu bertanda "Standar awal" dan perlu disahkan Legal. Dasar hukum yang ditulis dari ingatan
// (bukan dari teks yang dibuka langsung) ditandai `perluVerifikasi`. Setiap fungsi menerima `override` supaya daftarnya
// bisa diganti tanpa mengubah logika, sama seperti lib/syarat.ts.
//
// Murni (tanpa React, tanpa jaringan), diuji di scripts/uji-lembar-review.ts.
import { JENIS_ADDENDUM, JENIS_MOU, type JenisKontrak } from "./types";

// --- Tingkat risiko dan status temuan -----------------------------------------------------

export const TINGKAT_RISIKO = ["Rendah", "Sedang", "Tinggi"] as const;
export type TingkatRisiko = (typeof TINGKAT_RISIKO)[number];

/** Skala tiga tingkat (Merah/Amber/Hijau di praktik internasional; wajib diubah, dinegosiasikan, dapat diterima). */
export const KRITERIA_RISIKO: Record<TingkatRisiko, { arti: string; tindakan: string }> = {
  Tinggi: {
    arti: "Tidak dapat diterima: melanggar hukum atau batas kewenangan, atau merugikan WKI secara material (mis. tanggung jawab tanpa batas, denda atau jaminan tidak sepadan dengan kontrak induk).",
    tindakan: "Wajib diubah sebelum tanda tangan.",
  },
  Sedang: {
    arti: "Dapat dinegosiasikan: ada celah yang bisa merugikan tetapi tidak fatal, atau perlu keputusan bisnis.",
    tindakan: "Usulkan perubahan. Bila ditolak, catat risikonya untuk penandatangan.",
  },
  Rendah: {
    arti: "Soal redaksi atau administrasi yang tidak mengubah pembagian risiko.",
    tindakan: "Dapat diterima atau cukup dipantau.",
  },
};

export const STATUS_TEMUAN = ["Terbuka", "Dinegosiasikan", "Diterima", "Ditolak"] as const;
export type StatusTemuan = (typeof STATUS_TEMUAN)[number];

export const KETERANGAN_STATUS_TEMUAN: Record<StatusTemuan, string> = {
  Terbuka: "Baru dicatat, belum dibahas dengan pihak lain.",
  Dinegosiasikan: "Sedang dibahas dengan mitra atau pengaju.",
  Diterima: "Usulan perbaikan disepakati, atau risikonya diterima secara sadar.",
  Ditolak: "Usulan ditolak pihak lain dan belum ada titik temu.",
};

// --- Kesimpulan ----------------------------------------------------------------------------

export const KODE_KESIMPULAN = ["layak", "layak-catatan", "revisi", "tidak"] as const;
export type KodeKesimpulan = (typeof KODE_KESIMPULAN)[number];

export interface DefKesimpulan {
  kode: KodeKesimpulan;
  label: string;
  /** Penjelasan untuk Legal di pilihan kesimpulan. */
  arti: string;
  /** Kalimat ramah yang dibaca pengaju di Ruang Pengguna. */
  untukPengaju: string;
  nada: "sukses" | "peringatan" | "bahaya";
  /** Kesimpulan ini membuka jalan ke Lanjut ke Tanda Tangan tanpa peringatan. */
  lanjutTtd: boolean;
  /** Langkah alur yang biasanya menyusul. */
  langkah: string;
}

export const DAFTAR_KESIMPULAN: readonly DefKesimpulan[] = [
  {
    kode: "layak",
    label: "Layak ditandatangani",
    arti: "Tidak ada temuan yang belum beres. Kontrak boleh lanjut ke tanda tangan.",
    untukPengaju: "Legal menilai kontrak ini layak ditandatangani. Prosesnya berlanjut ke tahap tanda tangan.",
    nada: "sukses",
    lanjutTtd: true,
    langkah: "Lanjut ke Tanda Tangan",
  },
  {
    kode: "layak-catatan",
    label: "Layak dengan catatan",
    arti: "Boleh ditandatangani setelah syarat dipenuhi, atau dengan risiko yang diterima secara sadar dan dicatat untuk penandatangan.",
    untukPengaju: "Legal menilai kontrak ini layak ditandatangani dengan beberapa catatan. Mohon baca catatan dari Legal di bawah.",
    nada: "peringatan",
    lanjutTtd: true,
    langkah: "Lanjut ke Tanda Tangan setelah syarat dipenuhi",
  },
  {
    kode: "revisi",
    label: "Perlu revisi",
    arti: "Masih ada temuan yang harus diperbaiki. Kembalikan ke pengaju, lalu review lagi setelah draft baru masuk.",
    untukPengaju: "Legal meminta perbaikan sebelum kontrak bisa dilanjutkan. Lihat poin revisi dan catatan dari Legal.",
    nada: "peringatan",
    lanjutTtd: false,
    langkah: "Minta Revisi",
  },
  {
    kode: "tidak",
    label: "Tidak disarankan",
    arti: "Risiko tidak dapat diterima dan perbaikan ditolak. Eskalasikan ke pimpinan Legal atau Manajemen Risiko, atau tolak pengajuan.",
    untukPengaju: "Legal belum dapat merekomendasikan kontrak ini untuk ditandatangani. Silakan hubungi PIC Legal untuk penjelasannya.",
    nada: "bahaya",
    lanjutTtd: false,
    langkah: "Eskalasi atau Tolak",
  },
];

export const defKesimpulan = (kode: KodeKesimpulan | ""): DefKesimpulan | null => DAFTAR_KESIMPULAN.find((d) => d.kode === kode) ?? null;
/** Makin besar makin ketat. Dipakai membandingkan kesimpulan Legal dengan saran dari temuan. */
export const urutanKesimpulan = (kode: KodeKesimpulan): number => KODE_KESIMPULAN.indexOf(kode);

// --- Pokok-pokok kontrak -------------------------------------------------------------------

export interface DefPokok {
  id: string;
  label: string;
  petunjuk: string;
}

export type OverridePokok = Partial<Record<JenisKontrak | "semua", DefPokok[]>>;

const P_LINGKUP: DefPokok = { id: "lingkup", label: "Objek dan lingkup", petunjuk: "Apa yang diperjanjikan, batas pekerjaan atau barang, dan dasar penunjukan." };
const P_NILAI: DefPokok = { id: "nilai", label: "Nilai dan cara pembayaran", petunjuk: "Nilai, lumsum atau harga satuan, sudah atau belum PPN, uang muka, dan termin pembayaran." };
const P_JANGKA: DefPokok = { id: "jangka", label: "Jangka waktu", petunjuk: "Tanggal mulai dan berakhir, perpanjangan, dan masa pemeliharaan bila ada." };
const P_JAMINAN: DefPokok = { id: "jaminan", label: "Jaminan dan retensi", petunjuk: "Jaminan uang muka, pelaksanaan, pemeliharaan, nilai, penerbit, masa berlaku, dan retensi." };
const P_DENDA: DefPokok = { id: "denda", label: "Denda dan batasnya", petunjuk: "Tarif denda keterlambatan dan batas maksimumnya." };
const P_SENGKETA: DefPokok = { id: "sengketa", label: "Hukum dan penyelesaian sengketa", petunjuk: "Hukum yang berlaku, urutan musyawarah, mediasi, arbitrase atau pengadilan, dan domisili." };
const P_LAIN: DefPokok = { id: "lain", label: "Hal penting lain", petunjuk: "Pajak dan meterai, keadaan kahar, pemutusan, kerahasiaan, atau hal lain yang perlu dibaca penandatangan." };

/** Pokok kontrak menurut jenis. Pokok yang tidak relevan (mis. jaminan untuk NDA) tidak ditampilkan. */
export function daftarPokok(jenis: JenisKontrak, override?: OverridePokok): DefPokok[] {
  const ganti = override?.[jenis] ?? override?.semua;
  if (ganti) return ganti.map((p) => ({ ...p }));
  switch (jenis) {
    case "Pengadaan Barang":
      return [
        P_LINGKUP,
        { id: "spek", label: "Spesifikasi, penyerahan, dan garansi", petunjuk: "Spesifikasi dan standar mutu, tempat dan jadwal penyerahan, peralihan risiko, pemeriksaan barang, dan garansi." },
        P_NILAI,
        P_JANGKA,
        P_JAMINAN,
        P_DENDA,
        P_SENGKETA,
        P_LAIN,
      ];
    case "Pengadaan Jasa":
      return [
        P_LINGKUP,
        { id: "personel", label: "Subkontrak, tenaga kerja, dan K3", petunjuk: "Aturan subkontrak, tenaga kerja bersertifikat, K3, dan asuransi bila pekerjaan di lapangan." },
        P_NILAI,
        P_JANGKA,
        P_JAMINAN,
        P_DENDA,
        P_SENGKETA,
        P_LAIN,
      ];
    case "Sewa":
      return [
        { ...P_LINGKUP, label: "Objek sewa" },
        { id: "pemeliharaan", label: "Pemeliharaan dan pengembalian", petunjuk: "Kondisi saat diserahkan, siapa yang memelihara, penggantian bila rusak, dan pengembalian objek." },
        { ...P_NILAI, label: "Harga sewa dan cara pembayaran" },
        P_JANGKA,
        { ...P_JAMINAN, label: "Uang jaminan sewa" },
        P_DENDA,
        P_SENGKETA,
        P_LAIN,
      ];
    case "Kerja Sama":
      return [
        P_LINGKUP,
        { id: "peran", label: "Peran dan pembagian hasil", petunjuk: "Pembagian peran, hak, kewajiban, pembiayaan, dan pembagian hasil atau kerugian." },
        P_NILAI,
        P_JANGKA,
        P_JAMINAN,
        P_DENDA,
        P_SENGKETA,
        P_LAIN,
      ];
    case JENIS_MOU:
      return [
        { ...P_LINGKUP, label: "Maksud dan tujuan" },
        { id: "sifat", label: "Sifat mengikat dan tindak lanjut", petunjuk: "Pasal mana yang mengikat dan mana yang hanya niat bekerja sama, serta kontrak pelaksana yang akan menyusul." },
        P_JANGKA,
        P_SENGKETA,
        P_LAIN,
      ];
    case "Kerahasiaan (NDA)":
      return [
        { id: "rahasia", label: "Informasi rahasia dan tujuan penggunaan", petunjuk: "Definisi informasi rahasia, pengecualian, dan untuk tujuan apa boleh dipakai." },
        { ...P_JANGKA, label: "Jangka waktu dan masa kerahasiaan", petunjuk: "Masa berlaku dan berapa lama kerahasiaan terus berlaku setelah berakhir." },
        { ...P_DENDA, label: "Sanksi pelanggaran", petunjuk: "Ganti rugi, pengembalian atau pemusnahan dokumen bila rahasia bocor." },
        P_SENGKETA,
        P_LAIN,
      ];
    case JENIS_ADDENDUM:
      return [
        { id: "pasal", label: "Pasal yang diubah dan alasannya", petunjuk: "Rujukan kontrak induk, pasal dan ayat yang diubah, serta alasannya." },
        { ...P_NILAI, label: "Dampak ke nilai dan pembayaran", petunjuk: "Nilai baru atau selisihnya, dan perubahan termin." },
        { ...P_JANGKA, label: "Dampak ke jangka waktu", petunjuk: "Tanggal berakhir baru dan tidak ada celah waktu." },
        { ...P_JAMINAN, label: "Dampak ke jaminan", petunjuk: "Jaminan diperpanjang atau disesuaikan agar tetap mencakup masa dan nilai baru." },
        { id: "lain", label: "Ketentuan lain", petunjuk: "Pernyataan bahwa ketentuan kontrak induk yang tidak diubah tetap berlaku." },
      ];
    default:
      return [P_LINGKUP, P_NILAI, P_JANGKA, P_JAMINAN, P_DENDA, P_SENGKETA, P_LAIN];
  }
}

// --- Daftar periksa kepatuhan regulasi -----------------------------------------------------

export const HASIL_KEPATUHAN = ["sesuai", "tidak-sesuai", "tidak-relevan"] as const;
export type HasilKepatuhan = (typeof HASIL_KEPATUHAN)[number];
export const LABEL_HASIL_KEPATUHAN: Record<HasilKepatuhan, string> = {
  sesuai: "Sesuai",
  "tidak-sesuai": "Tidak sesuai",
  "tidak-relevan": "Tidak relevan",
};

export interface DefKepatuhan {
  id: string;
  label: string;
  /** Dasar hukum atau acuan, ditulis seperti di sumbernya. */
  dasar: string;
  /** Hal yang dicek. */
  petunjuk: string;
  /** Jenis kontrak yang memuat butir ini. Kosong = semua jenis. */
  untuk?: readonly JenisKontrak[];
  /** Dasar hukum atau angkanya dari ingatan atau cuplikan, belum dibaca dari teks resminya. */
  perluVerifikasi?: boolean;
}

export type OverrideKepatuhan = Partial<Record<JenisKontrak | "semua", DefKepatuhan[]>>;

const NILAI_BIASA: readonly JenisKontrak[] = ["Pengadaan Barang", "Pengadaan Jasa", "Sewa", "Kerja Sama", JENIS_ADDENDUM, "Lainnya"];

/** Butir periksa kepatuhan. Standar awal dari riset; belum disahkan Legal WKI. */
export const KEPATUHAN_DASAR: readonly DefKepatuhan[] = [
  { id: "syarat-sah", label: "Syarat sah perjanjian", dasar: "Pasal 1320 KUHPerdata", petunjuk: "Kesepakatan, kecakapan atau kewenangan, hal tertentu, dan sebab yang halal. Penandatangan sesuai anggaran dasar atau surat kuasa." },
  {
    id: "wanprestasi",
    label: "Wanprestasi, somasi, dan pemutusan",
    dasar: "Pasal 1243, 1266, dan 1267 KUHPerdata",
    petunjuk: "Ganti rugi didahului somasi. Cek pengesampingan Pasal 1266-1267 bila pemutusan tanpa putusan pengadilan.",
    untuk: NILAI_BIASA,
    perluVerifikasi: true,
  },
  {
    id: "bahasa",
    label: "Bahasa Indonesia",
    dasar: "Pasal 31 UU 24/2009; Perpres 63/2019; SEMA 3/2023",
    petunjuk: "Perjanjian dengan pihak Indonesia memakai bahasa Indonesia. Dengan pihak asing: dua bahasa, dan tetapkan versi Indonesia yang berlaku.",
    perluVerifikasi: true,
  },
  {
    id: "meterai",
    label: "Bea meterai",
    dasar: "UU 10/2020 tentang Bea Meterai (PP 86/2021 dan PMK 134/2021 untuk e-meterai)",
    petunjuk: "Surat perjanjian bermeterai Rp10.000. Siapa yang menanggung meterai, dan e-meterai untuk dokumen elektronik.",
    perluVerifikasi: true,
  },
  { id: "kewenangan", label: "Kewenangan dan persetujuan internal", dasar: "Anggaran dasar; matriks batas kewenangan WKI", petunjuk: "Penandatangan berwenang untuk nilai ini dan persetujuan internal tercatat (lihat panel Persetujuan internal)." },
  {
    id: "muatan-konstruksi",
    label: "Muatan minimal kontrak kerja konstruksi",
    dasar: "Pasal 47 ayat (1) UU 2/2017 jo PP 22/2020 dan PP 14/2021; Pasal 49 untuk subkontrak",
    petunjuk:
      "Para pihak, lingkup dan nilai, jangka waktu, masa pertanggungan, hak dan kewajiban, tenaga kerja bersertifikat, pembayaran dan jaminan, wanprestasi, sengketa, pemutusan, keadaan memaksa, kegagalan bangunan, K3, pelindungan pihak ketiga, lingkungan. Isi Tidak relevan bila bukan jasa konstruksi.",
    untuk: ["Pengadaan Jasa", "Kerja Sama", JENIS_ADDENDUM],
  },
  {
    id: "kualifikasi-mitra",
    label: "Kualifikasi mitra (SBU dan SKK)",
    dasar: "UU 2/2017 dan PP 22/2020",
    petunjuk: "Klasifikasi SBU sesuai objek pekerjaan dan tenaga kerja bersertifikat. Isi Tidak relevan bila bukan jasa konstruksi.",
    untuk: ["Pengadaan Jasa"],
    perluVerifikasi: true,
  },
  {
    id: "pajak",
    label: "Pajak",
    dasar: "UU PPN; PPh Pasal 4 ayat (2) jasa konstruksi (PP 9/2022: 1,75%, 2,65%, 4%); PPh 23 untuk sewa dan jasa tertentu",
    petunjuk: "Harga sudah atau belum PPN, siapa pemungutnya, faktur pajak. Konfirmasikan tarif dan status pemungut WKI ke tim pajak.",
    untuk: NILAI_BIASA,
    perluVerifikasi: true,
  },
  {
    id: "data-pribadi",
    label: "Pelindungan data pribadi",
    dasar: "UU 27/2022 tentang Pelindungan Data Pribadi",
    petunjuk: "Bila mitra memproses data pribadi: peran pengendali dan prosesor, tujuan, keamanan, pemberitahuan kegagalan, dan penghapusan.",
    untuk: ["Pengadaan Jasa", "Sewa", "Kerja Sama", "Kerahasiaan (NDA)", "Lainnya"],
  },
  {
    id: "kerahasiaan-hki",
    label: "Kerahasiaan dan hak kekayaan intelektual",
    dasar: "Kesepakatan para pihak; UU 28/2014 tentang Hak Cipta",
    petunjuk: "Informasi rahasia dan pengecualiannya, serta kepemilikan HKI atas hasil kerja.",
    untuk: ["Pengadaan Jasa", "Kerja Sama", JENIS_MOU, "Kerahasiaan (NDA)"],
    perluVerifikasi: true,
  },
  {
    id: "sengketa",
    label: "Penyelesaian sengketa",
    dasar: "UU 30/1999 tentang Arbitrase dan APS; UU 2/2017 untuk kontrak konstruksi",
    petunjuk: "Klausul arbitrase tertulis dengan nama lembaga (BANI atau lain), tempat, bahasa, dan jumlah arbiter. Jenjang musyawarah, mediasi, lalu arbitrase atau pengadilan. Selaras dengan kontrak induk.",
    perluVerifikasi: true,
  },
  {
    id: "back-to-back",
    label: "Selaras dengan kontrak induk (back-to-back)",
    dasar: "Prinsip back-to-back dengan kontrak pemberi kerja",
    petunjuk:
      "Lingkup, spesifikasi, dan jadwal tidak lebih longgar. Denda dan jaminan cukup menutup yang diterima WKI. Batas waktu klaim lebih pendek. Pembayaran bila pemberi kerja terlambat. Larangan subkontrak lanjutan.",
    untuk: ["Pengadaan Barang", "Pengadaan Jasa", "Kerja Sama", JENIS_ADDENDUM],
  },
  {
    id: "patokan-pengadaan",
    label: "Patokan pengadaan (jaminan, retensi, denda)",
    dasar: "Perpres 16/2018 jo 12/2021 (lihat konsolidasi dengan Perpres 46/2025) sebagai patokan; BUMN dan anak usahanya memakai pedoman pengadaan sendiri",
    petunjuk: "Lazimnya jaminan pelaksanaan 5%, retensi atau jaminan pemeliharaan 5%, denda keterlambatan 1/1000 per hari. Uang muka dan masa pemeliharaan minimal dari ingatan, verifikasi.",
    untuk: ["Pengadaan Barang", "Pengadaan Jasa", JENIS_ADDENDUM],
    perluVerifikasi: true,
  },
  {
    id: "tata-kelola-bumn",
    label: "Tata kelola BUMN",
    dasar: "PER-2/MBU/03/2023 (status berlaku sesudah perubahan UU BUMN 2025 perlu dicek)",
    petunjuk: "Perjanjian kerja sama memuat imbalan, cara dan waktu pembayaran atau penyerahan, hak dan kewajiban, wanprestasi dan sanksi. Cek penerapannya ke anak usaha pada pedoman internal terbaru.",
    untuk: ["Kerja Sama", JENIS_MOU],
    perluVerifikasi: true,
  },
  { id: "sifat-mou", label: "Sifat mengikat MoU", dasar: "Pasal 1338 KUHPerdata", petunjuk: "Jelas bagian yang mengikat (kerahasiaan, sengketa) dan yang hanya niat. Pelaksanaan diatur kontrak tersendiri.", untuk: [JENIS_MOU] },
  {
    id: "objek-sewa",
    label: "Objek dan hak atas objek sewa",
    dasar: "Pasal 1548 dst KUHPerdata (sewa-menyewa)",
    petunjuk: "Pemberi sewa berhak atas objek, kondisi saat diserahkan, pemeliharaan, dan pengembalian.",
    untuk: ["Sewa"],
    perluVerifikasi: true,
  },
  {
    id: "dasar-addendum",
    label: "Dasar dan dampak addendum",
    dasar: "Pasal 1338 KUHPerdata; kontrak induk",
    petunjuk: "Rujukan kontrak induk tepat, pasal yang diubah, dampak ke jaminan dan kewenangan penandatangan untuk nilai baru, ketentuan lain tetap berlaku.",
    untuk: [JENIS_ADDENDUM],
  },
];

/** Butir kepatuhan untuk satu jenis kontrak, mengikuti urutan KEPATUHAN_DASAR. */
export function daftarKepatuhan(jenis: JenisKontrak, override?: OverrideKepatuhan): DefKepatuhan[] {
  const ganti = override?.[jenis] ?? override?.semua;
  if (ganti) return ganti.map((b) => ({ ...b }));
  return KEPATUHAN_DASAR.filter((b) => !b.untuk || b.untuk.includes(jenis)).map((b) => ({ ...b }));
}

// --- Syarat sebelum tanda tangan -----------------------------------------------------------

/** Usulan syarat yang lazim (chip di formulir). Legal bebas menulis sendiri. */
export const USULAN_SYARAT_TTD: readonly string[] = [
  "Jaminan pelaksanaan atau uang muka sudah diterima dan diverifikasi ke penerbitnya.",
  "Meterai atau e-meterai dibubuhkan pada dokumen.",
  "Paraf di setiap halaman oleh para pihak.",
  "Semua lampiran lengkap dan sama dengan draft final.",
  "Surat kuasa asli atau bukti kewenangan penandatangan diterima.",
  "Persetujuan internal sesuai matriks kewenangan sudah dicatat.",
];

/** Kolom paraf berjenjang di lembar cetak (disusun, diperiksa, disetujui). Standar awal dari praktik tata naskah. */
export const JENJANG_PARAF: readonly { id: string; label: string }[] = [
  { id: "disusun", label: "Disusun" },
  { id: "diperiksa", label: "Diperiksa" },
  { id: "disetujui", label: "Disetujui" },
];
