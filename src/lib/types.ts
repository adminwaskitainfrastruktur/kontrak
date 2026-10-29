// Pilihan di sini harus sama persis dengan pilihan kolom Choice di list
// SharePoint. Kalau menambah pilihan, tambahkan juga di pengaturan kolomnya.
import type { PihakLain } from "./pihakLain";

export const DAFTAR_STATUS = [
  "Diajukan",
  "Review Legal",
  "Perlu Revisi",
  "Proses Tanda Tangan",
  "Aktif",
  "Berakhir",
  "Ditolak",
  "Dibatalkan",
] as const;
export type Status = (typeof DAFTAR_STATUS)[number];

/** Status yang masih berjalan di Legal atau pengaju (belum selesai). */
export const STATUS_PROSES: readonly Status[] = ["Diajukan", "Review Legal", "Perlu Revisi", "Proses Tanda Tangan"];
/** Status akhir: kontrak tidak bisa diubah lagi. */
export const STATUS_FINAL: readonly Status[] = ["Berakhir", "Ditolak", "Dibatalkan"];

export const JENIS_KONTRAK = [
  "Pengadaan Barang",
  "Pengadaan Jasa",
  "Sewa",
  "Kerja Sama",
  "MoU / Nota Kesepahaman",
  "Kerahasiaan (NDA)",
  "Addendum / Amandemen",
  "Lainnya",
] as const;
export type JenisKontrak = (typeof JENIS_KONTRAK)[number];
export const JENIS_ADDENDUM: JenisKontrak = "Addendum / Amandemen";
/** MoU: perjanjian tanpa nilai kontrak. Kontrak pelaksananya diajukan terpisah dan menaut ke MoU ini. */
export const JENIS_MOU: JenisKontrak = "MoU / Nota Kesepahaman";

/** Apa yang diubah oleh sebuah addendum. Bisa lebih dari satu sekaligus. */
export const JENIS_PERUBAHAN = ["Perpanjangan Waktu", "Perubahan Nilai", "Perubahan Lingkup", "Perubahan Ketentuan", "Lainnya"] as const;
export type JenisPerubahan = (typeof JENIS_PERUBAHAN)[number];

export const DIVISI_PENGAJU = ["SCM", "Pengadaan", "Legal"] as const;
export type DivisiPengaju = (typeof DIVISI_PENGAJU)[number];

export const DAFTAR_DIVISI = ["Legal", "SCM", "Pengadaan", "IT"] as const;
export type Divisi = (typeof DAFTAR_DIVISI)[number];

export const DAFTAR_PERAN = ["Admin", "Legal", "Pengaju", "Pemantau"] as const;
export type Peran = (typeof DAFTAR_PERAN)[number];

export const KETERANGAN_PERAN: Record<Peran, string> = {
  Admin: "Semua akses Legal, ditambah mengelola pengguna",
  Legal: "Ruang Admin: melihat semua kontrak, memproses review, mengubah status",
  Pengaju: "Hanya Ruang Pengguna: mengajukan kontrak dan memantau antrean serta status pengajuannya",
  Pemantau: "Hanya melihat semua kontrak",
};

export const MATA_UANG = ["IDR", "USD", "EUR", "SGD"] as const;
export type MataUang = (typeof MATA_UANG)[number];

export const PRIORITAS = ["Normal", "Tinggi", "Mendesak"] as const;
export type Prioritas = (typeof PRIORITAS)[number];

/** Tanggal tanpa jam, format YYYY-MM-DD, dalam zona waktu Jakarta. */
export type Ymd = string;

export interface Kontrak {
  id: number;
  judul: string;
  nomorPengajuan: string;
  nomorKontrak: string;
  jenis: JenisKontrak;
  divisi: DivisiPengaju;
  mitra: string;
  nilai: number | null;
  mataUang: MataUang;
  tanggalMulai: Ymd | null;
  tanggalBerakhir: Ymd | null;
  status: Status;
  prioritas: Prioritas;
  deskripsi: string;
  targetSelesai: Ymd | null;
  pengajuEmail: string;
  pengajuNama: string;
  picLegalEmail: string;
  picLegalNama: string;
  tanggalDiajukan: string | null;
  tanggalTandaTangan: Ymd | null;
  kontrakIndukId: number | null;
  /** Untuk kontrak turunan: MoU yang menjadi dasarnya. */
  mouAcuanId: number | null;
  /** Hanya untuk addendum: apa yang diubah, dan urutan addendum pada kontrak induknya (ke-1, ke-2, ...). */
  jenisPerubahan: JenisPerubahan[];
  urutanAddendum: number | null;
  /** Kapan status sekarang dimulai (ISO). Dasar hitung umur tahap dan SLA. */
  statusSejak: string | null;
  /** Tanggal berakhir yang sudah memperhitungkan addendum aktif. Dipelihara aplikasi; dipakai flow pengingat. */
  berakhirEfektif: Ymd | null;
  checklistReview: ChecklistReview | null;
  checklistTtd: ChecklistTtd | null;
  kodeProyek: string;
  /** Nomor PR/PO/SPK atau referensi pengadaan lain. */
  nomorReferensi: string;
  costCenter: string;
  /** Kaitan ke master data Mitra (nama di kolom `mitra` tetap disimpan). */
  mitraId: number | null;
  /** Tautan ke berkas kontrak bertanda tangan di SharePoint (diisi saat aktivasi). */
  kontrakFinal: string;
  /** Catatan klausul: kontrak diperpanjang otomatis kecuali diberi tahu sebelum masa pemberitahuan. */
  perpanjanganOtomatis: boolean;
  masaPemberitahuanHari: number | null;
  /** Cara kontrak ditutup (K02), diisi Legal saat "Tandai Berakhir". */
  modeBerakhir: ModeBerakhir | "";
  /** Tanggal efektif kontrak berakhir menurut Legal (K02), bisa lebih awal dari tanggal berakhir bila diputus. */
  tanggalDiakhiri: Ymd | null;
  /** Ada kasus sengketa terbuka di list Kasus Kontrak (K02). Dipelihara aplikasi untuk lencana. */
  adaSengketa: boolean;
  /** Disembunyikan dari daftar, dashboard, antrean, dan laporan, tetapi tetap tersimpan (halaman Arsip). */
  diarsipkan: boolean;
  /** Batas nilai kontrak payung (framework). Kosong bila bukan payung berplafon. */
  plafon: number | null;
  persetujuan: Persetujuan | null;
  /** ID kontrak yang disalin untuk membuat pengajuan ini ("Ajukan serupa"). */
  salinDari: number | null;
  /** Identitas pihak lain sebagai salinan per kontrak (data komparisi), bukan rujukan master. */
  npwpMitra: string;
  alamatMitra: string;
  penandatanganMitra: string;
  jabatanMitra: string;
  dasarKewenangan: string;
  /** Pihak lain dan perannya (U11), mis. penjamin atau anggota KSO. Hanya dimuat di detail (kolom PihakLain). */
  pihakLain: PihakLain[];
  dibuat: string;
  diubah: string;
  webUrl: string;
}

/** Kolom yang bisa diisi lewat formulir. */
export type KontrakInput = Pick<
  Kontrak,
  | "judul"
  | "jenis"
  | "divisi"
  | "mitra"
  | "nilai"
  | "mataUang"
  | "tanggalMulai"
  | "tanggalBerakhir"
  | "prioritas"
  | "deskripsi"
  | "targetSelesai"
  | "kontrakIndukId"
  | "mouAcuanId"
  | "jenisPerubahan"
  | "nomorKontrak"
  | "picLegalEmail"
  | "picLegalNama"
  | "tanggalTandaTangan"
  | "kodeProyek"
  | "nomorReferensi"
  | "costCenter"
  | "mitraId"
  | "perpanjanganOtomatis"
  | "masaPemberitahuanHari"
  | "plafon"
  | "salinDari"
  | "npwpMitra"
  | "alamatMitra"
  | "penandatanganMitra"
  | "jabatanMitra"
  | "dasarKewenangan"
>;

export const MODE_BERAKHIR = ["Selesai Normal", "Tidak Diperpanjang", "Diputus", "Dibatalkan Bersama", "Sengketa"] as const;
export type ModeBerakhir = (typeof MODE_BERAKHIR)[number];

/** Pencatatan persetujuan internal (memo, nama, tanggal). Ini catatan, bukan kontrol keras. */
export interface Persetujuan {
  versi: number;
  items: {
    id: string;
    penyetuju: string;
    jabatan?: string;
    /** Tanggal persetujuan (YYYY-MM-DD). */
    tanggal?: string;
    /** Nomor memo, nota dinas, atau surat persetujuan. */
    bukti?: string;
    catatan?: string;
    /** Nama berkas "Bukti Persetujuan" yang diunggah bersamanya (di library Berkas Kontrak). */
    dokumen?: string;
    /** Waktu pencatatan (ISO) dan nama pencatatnya. */
    dicatat?: string;
    oleh?: string;
  }[];
}

export const JENIS_AKTIVITAS = ["Dibuat", "Status", "Komentar", "Dokumen", "Perubahan", "Penugasan", "Pengingat", "Arsip", "Tanda Tangan"] as const;
export type JenisAktivitas = (typeof JENIS_AKTIVITAS)[number];

export interface Aktivitas {
  id: number;
  kontrakId: number;
  jenis: JenisAktivitas;
  pesan: string;
  statusDari: string;
  statusKe: string;
  olehEmail: string;
  olehNama: string;
  waktu: string;
  /** Rincian perubahan lama ke baru (JSON), diisi untuk jenis Perubahan dan Status. */
  detail: DetailPerubahan[];
  /** Email orang yang disebut dengan @ di komentar. */
  disebut: string[];
}

export interface DetailPerubahan {
  kolom: string;
  dari: string;
  ke: string;
}

export interface Pengguna {
  id: number;
  nama: string;
  email: string;
  divisi: Divisi;
  peran: Peran;
  aktif: boolean;
}

export const JENIS_DOKUMEN = [
  "Dokumen Pendukung",
  "Draft Kontrak",
  "Kontrak Ditandatangani",
  "Penawaran",
  "SPK / PO",
  "BAST",
  "Legalitas Mitra",
  "Surat Kuasa",
  "Jaminan / Bank Garansi",
  "BA Negosiasi",
  "Bukti Persetujuan",
  "Draft Final",
  "Lembar Review Legal",
  "Lainnya",
] as const;
export type JenisDokumen = (typeof JENIS_DOKUMEN)[number];

export interface Dokumen {
  jenis: JenisDokumen | "";
  id: string;
  nama: string;
  ukuran: number;
  webUrl: string;
  unduhUrl: string | null;
  diubah: string;
  diubahOleh: string;
}

/** Pengguna yang sedang login beserta perannya di aplikasi. */
export interface Sesi {
  email: string;
  nama: string;
  peran: Peran;
  /**
   * null untuk akun kantor yang masuk otomatis tanpa terdaftar: ia hanya melihat dan mengubah
   * pengajuannya sendiri, tidak melihat kontrak divisi mana pun, dan memilih divisi tiap mengajukan.
   */
  divisi: Divisi | null;
  /** null jika belum ada di list Pengguna Kontrak (admin bawaan atau akun kantor yang masuk otomatis). */
  penggunaId: number | null;
  /** false bila masuk otomatis (akun domain kantor atau admin bawaan); kosong dianggap terdaftar. */
  terdaftar?: boolean;
}

// --- Checklist review dan tanda tangan ------------------------------------------

export interface ItemChecklist {
  id: string;
  label: string;
  selesai: boolean;
  catatan?: string;
  oleh?: string;
  waktu?: string;
}

/** Daftar periksa review klausul oleh Legal. Disimpan sebagai JSON di kolom ChecklistReview. */
export interface ChecklistReview {
  versi: number;
  items: ItemChecklist[];
}

/** Cara tanda tangan (U21). Disimpan sebagai data terstruktur, bukan catatan bebas. */
export const CARA_TTD = ["basah", "tte", "e-meterai", "campuran"] as const;
export type CaraTtd = (typeof CARA_TTD)[number];

/** Sidik draft yang disepakati saat lanjut ke tanda tangan (U21): bukti draft mana yang ditandatangani. */
export interface JejakDraftFinal {
  dokumenId: string;
  nama: string;
  ukuran: number;
  /** SHA-256 isi berkas dalam heksadesimal; kosong bila belum bisa dihitung. */
  sha256: string;
  waktu: string;
  oleh: string;
}

/** Langkah tanda tangan per pihak. Disimpan sebagai JSON di kolom ChecklistTtd. */
export interface ChecklistTtd {
  versi: number;
  items: ItemChecklist[];
  cara?: CaraTtd;
  draftFinal?: JejakDraftFinal;
}

// --- Mitra ------------------------------------------------------------------------

export interface Mitra {
  id: number;
  nama: string;
  npwp: string;
  alamat: string;
  penandatangan: string;
  jabatan: string;
  email: string;
  telepon: string;
  /** Nama lain yang pernah dipakai (singkatan, nama lama), satu per baris di SharePoint. */
  namaLain: string[];
  aktif: boolean;
  terverifikasi: boolean;
}

export type MitraInput = Omit<Mitra, "id">;

// --- Jaminan ----------------------------------------------------------------------

export const JENIS_JAMINAN = ["Jaminan Penawaran", "Jaminan Pelaksanaan", "Jaminan Uang Muka", "Jaminan Pemeliharaan", "Lainnya"] as const;
export type JenisJaminan = (typeof JENIS_JAMINAN)[number];

export const STATUS_JAMINAN = ["Aktif", "Dicairkan", "Dikembalikan", "Kedaluwarsa"] as const;
export type StatusJaminan = (typeof STATUS_JAMINAN)[number];

export interface Jaminan {
  id: number;
  nomor: string;
  kontrakId: number | null;
  jenis: JenisJaminan;
  penerbit: string;
  nilai: number | null;
  mataUang: MataUang;
  tanggalTerbit: Ymd | null;
  tanggalBerakhir: Ymd | null;
  status: StatusJaminan;
  catatan: string;
}

export type JaminanInput = Omit<Jaminan, "id">;

// --- Notifikasi (kotak keluar email) ----------------------------------------------

export const JENIS_NOTIF = ["Pengajuan Baru", "Konfirmasi Pengaju", "Status Berubah", "Antrean Bergerak", "Perlu Revisi", "Selesai", "Ringkasan", "Pengingat", "Lainnya"] as const;
export type JenisNotif = (typeof JENIS_NOTIF)[number];

export interface EmailKeluar {
  penerima: string[];
  cc?: string[];
  subjek: string;
  html: string;
  jenis: JenisNotif;
  kontrakId?: number | null;
}
