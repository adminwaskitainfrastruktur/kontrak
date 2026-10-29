// Lembar Hasil Review Legal: model data, logika murni, dan sambungannya ke alur kontrak.
//
// Nama "Lembar Hasil Review Legal" dipilih karena paling netral dan lazim di korporasi Indonesia. Istilah lain
// ("Telaah Hukum", "Kajian Hukum", memo atau nota dinas) lebih khas instansi pemerintah dan BUMD. Format resmi Legal
// WKI belum diketahui, jadi susunannya mengikuti riset dan semua daftarnya bertanda "standar awal" (lib/lembarStandar).
//
// Satu lembar = satu PUTARAN review. Setelah revisi dikirim ulang, Legal membuka putaran baru; putaran lama tetap
// tersimpan sebagai riwayat. Disimpan sebagai JSON berversi di kolom LembarReview pada list Kontrak, bersama ringkasan
// kecil HasilReview yang boleh dibaca pengaju (hanya kesimpulan dan catatan untuknya, tanpa penilaian risiko internal).
//
// Bagian yang sudah ada datanya (identitas, pihak, dokumen, kelengkapan, checklist, pindai, revisi) TIDAK diketik ulang:
// susunDataOtomatis menyusunnya dari data yang sudah ada dan membekukannya saat lembar difinalkan.
//
// Modul ini murni (tanpa React, tanpa jaringan) dan teruji lewat scripts/uji-lembar-review.ts.
import { adalahLegal } from "./alur";
import { URUTAN_JENIS } from "./jenisBerkas";
import type { HasilPindai } from "./pemindai";
import { kirimUlangSetelah, permintaanRevisiTerakhir, sejakRevisi } from "./revisi";
import { checklistReviewKontrak, kekuranganDokumen, kemajuanChecklist, ringkasKelengkapan } from "./syarat";
import { tanggalPanjang } from "./terbilang";
import type { Aktivitas, Dokumen, JenisDokumen, Kontrak, MataUang, Sesi, Ymd } from "./types";
import {
  KODE_KESIMPULAN,
  STATUS_TEMUAN,
  TINGKAT_RISIKO,
  HASIL_KEPATUHAN,
  daftarKepatuhan,
  daftarPokok,
  defKesimpulan,
  urutanKesimpulan,
  type HasilKepatuhan,
  type KodeKesimpulan,
  type OverrideKepatuhan,
  type OverridePokok,
  type StatusTemuan,
  type TingkatRisiko,
} from "./lembarStandar";

export const VERSI_LEMBAR = 1;
/** Jenis dokumen salinan lembar di library Berkas Kontrak (nilai pilihan kolom JenisDokumen). */
export const JENIS_LEMBAR: JenisDokumen = "Lembar Review Legal";
/** Kolom teks beberapa baris SharePoint memuat sekitar 63.999 karakter; sisakan ruang untuk karakter escape. */
export const BATAS_JSON_LEMBAR = 58_000;
export const MAKS_TEMUAN = 60;
export const MAKS_SYARAT = 20;

export const BATAS_TEKS = { pasal: 120, isu: 1500, usulan: 1500, tanggapan: 800, pokok: 1800, catatan: 2000, syarat: 300, kepatuhan: 600, nama: 120 } as const;

// --- Tipe ------------------------------------------------------------------------------------

export interface TemuanReview {
  id: string;
  /** Nomor atau judul pasal, mis. "Pasal 12 (Denda)". */
  pasal: string;
  /** Rumusan di draf dan isu hukumnya. */
  isu: string;
  risiko: TingkatRisiko;
  /** Usulan perbaikan atau redaksi. */
  usulan: string;
  status: StatusTemuan;
  /** Tanggapan pihak lain atau hasil pembahasan. */
  tanggapan: string;
  /** Poin ini dipakai mengisi permintaan revisi (dibaca pengaju). */
  revisi: boolean;
  /** Nomor putaran asal bila temuan dibawa dari putaran sebelumnya. */
  dariPutaran?: number;
}

export interface ButirKepatuhan {
  id: string;
  label: string;
  dasar: string;
  hasil: HasilKepatuhan | "";
  catatan: string;
  perluVerifikasi?: boolean;
}

export interface SyaratTtd {
  id: string;
  teks: string;
  selesai: boolean;
}

export interface PersetujuanLembar {
  nama: string;
  jabatan: string;
  tanggal: Ymd | "";
  keputusan: "Disetujui" | "Dikembalikan";
  catatan: string;
  dicatat: string;
  oleh: string;
}

export interface BerkasReview {
  nama: string;
  jenis: string;
  /** "v3" bila versinya terbaca dari SharePoint, kosong bila tidak. */
  versi: string;
  diubah: string;
  ukuran: number;
}

export interface RingkasPindai {
  nama: string;
  waktu: string;
  terbaca: boolean;
  /** Hanya klausul yang lazim untuk jenis kontrak ini. */
  klausul: { nama: string; ada: boolean }[];
  /** Jumlah bagian yang tampaknya masih kosong di draf. */
  penanda: number;
  /** Selisih terhadap data pengajuan, satu kalimat tiap selisih. */
  selisih: string[];
}

/** Data yang diambil otomatis dari sistem. Dibekukan di putaran saat difinalkan. */
export interface DataOtomatis {
  dibuat: string;
  identitas: {
    nomorPengajuan: string;
    nomorKontrak: string;
    judul: string;
    jenis: string;
    divisi: string;
    pengaju: string;
    picLegal: string;
    prioritas: string;
    diajukan: string;
    nomorReferensi: string;
    kodeProyek: string;
    induk: string;
  };
  pihak: { mitra: string; npwp: string; alamat: string; penandatangan: string; jabatan: string; dasarKewenangan: string; lain: { nama: string; peran: string }[] };
  dokumen: BerkasReview[];
  kelengkapan: { teks: string; lengkap: boolean; ada: string[]; kurang: string[] };
  checklist: { selesai: number; total: number; belum: string[]; catatan: string[] };
  pindai: RingkasPindai | null;
  revisi: { waktu: string; oleh: string; poin: string[]; kirimUlang: string | null; sejak: string[] } | null;
}

export interface PutaranReview {
  id: string;
  nomor: number;
  /** Naik tiap disimpan; dipakai mendeteksi dua Legal yang menyunting bersamaan. */
  rev: number;
  status: "draf" | "final";
  dibuat: string;
  diubah: string;
  olehNama: string;
  olehEmail: string;
  tanggalReview: Ymd | "";
  pokok: Record<string, string>;
  temuan: TemuanReview[];
  kepatuhan: ButirKepatuhan[];
  syarat: SyaratTtd[];
  kesimpulan: KodeKesimpulan | "";
  /** Catatan internal untuk pejabat penandatangan (tidak dibaca pengaju). */
  catatanPenandatangan: string;
  /** Catatan yang ditujukan kepada pengaju (dibaca pengaju bila putaran final). */
  catatanPengaju: string;
  persetujuan?: PersetujuanLembar;
  final?: { waktu: string; oleh: string; data: DataOtomatis };
  /** Hasil pindai draf terbaru yang diambil Legal selama putaran ini masih draf; dibekukan ke data otomatis saat final. */
  pindai?: RingkasPindai;
  /** `rev`: nomor rev putaran yang sudah tercakup salinan ini; salinan usang bila putaran berubah sesudahnya. */
  salinan?: { nama: string; waktu: string; oleh: string; rev: number; webUrl?: string };
  /** true bila isinya dipangkas agar kolom tidak melebihi batas SharePoint (putaran lama). */
  dipangkas?: boolean;
}

export interface LembarReview {
  versi: number;
  putaran: PutaranReview[];
}

/** Ringkasan kecil yang dibaca pengaju (kolom HasilReview). Tanpa risiko, temuan, atau catatan internal. */
export interface HasilReviewPengaju {
  v: number;
  putaran: number;
  kesimpulan: KodeKesimpulan;
  tanggal: Ymd | "";
  /** ISO saat difinalkan. */
  waktu: string;
  oleh: string;
  catatan: string;
}

// --- Penguraian dan pembungkusan -------------------------------------------------------------

const adalahObjek = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, maks = 5000): string => (typeof v === "string" ? v.slice(0, maks) : "");
const angka = (v: unknown, cadangan = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : cadangan);
const pilih = <T extends string>(v: unknown, daftar: readonly T[]): T | null => (typeof v === "string" && (daftar as readonly string[]).includes(v) ? (v as T) : null);
const ymd = (v: unknown): Ymd | "" => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export function idBaru(awalan: string): string {
  return `${awalan}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

function uraiTemuan(v: unknown): TemuanReview | null {
  if (!adalahObjek(v)) return null;
  return {
    id: str(v.id, 40) || idBaru("t"),
    pasal: str(v.pasal, BATAS_TEKS.pasal),
    isu: str(v.isu, BATAS_TEKS.isu),
    risiko: pilih(v.risiko, TINGKAT_RISIKO) ?? "Sedang",
    usulan: str(v.usulan, BATAS_TEKS.usulan),
    status: pilih(v.status, STATUS_TEMUAN) ?? "Terbuka",
    tanggapan: str(v.tanggapan, BATAS_TEKS.tanggapan),
    revisi: v.revisi === true,
    ...(typeof v.dariPutaran === "number" ? { dariPutaran: v.dariPutaran } : {}),
  };
}

function uraiKepatuhan(v: unknown): ButirKepatuhan | null {
  if (!adalahObjek(v)) return null;
  const id = str(v.id, 60);
  if (!id) return null;
  return {
    id,
    label: str(v.label, 200),
    dasar: str(v.dasar, 400),
    hasil: pilih(v.hasil, HASIL_KEPATUHAN) ?? "",
    catatan: str(v.catatan, BATAS_TEKS.kepatuhan),
    ...(v.perluVerifikasi === true ? { perluVerifikasi: true } : {}),
  };
}

function uraiPindai(v: unknown): RingkasPindai | null {
  if (!adalahObjek(v)) return null;
  return {
    nama: str(v.nama, 300),
    waktu: str(v.waktu, 40),
    terbaca: v.terbaca === true,
    klausul: (Array.isArray(v.klausul) ? v.klausul : []).filter(adalahObjek).map((k) => ({ nama: str(k.nama, 100), ada: k.ada === true })),
    penanda: angka(v.penanda),
    selisih: (Array.isArray(v.selisih) ? v.selisih : []).filter((y): y is string => typeof y === "string"),
  };
}

function uraiData(v: unknown): DataOtomatis | null {
  if (!adalahObjek(v) || !adalahObjek(v.identitas) || !adalahObjek(v.pihak)) return null;
  const daftarStr = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []);
  const i = v.identitas;
  const p = v.pihak;
  const kel = adalahObjek(v.kelengkapan) ? v.kelengkapan : {};
  const cek = adalahObjek(v.checklist) ? v.checklist : {};
  return {
    dibuat: str(v.dibuat, 40),
    identitas: {
      nomorPengajuan: str(i.nomorPengajuan, 60),
      nomorKontrak: str(i.nomorKontrak, 120),
      judul: str(i.judul, 400),
      jenis: str(i.jenis, 80),
      divisi: str(i.divisi, 40),
      pengaju: str(i.pengaju, 200),
      picLegal: str(i.picLegal, 200),
      prioritas: str(i.prioritas, 40),
      diajukan: str(i.diajukan, 60),
      nomorReferensi: str(i.nomorReferensi, 250),
      kodeProyek: str(i.kodeProyek, 120),
      induk: str(i.induk, 400),
    },
    pihak: {
      mitra: str(p.mitra, 300),
      npwp: str(p.npwp, 60),
      alamat: str(p.alamat, 500),
      penandatangan: str(p.penandatangan, 200),
      jabatan: str(p.jabatan, 200),
      dasarKewenangan: str(p.dasarKewenangan, 400),
      lain: (Array.isArray(p.lain) ? p.lain : []).filter(adalahObjek).map((x) => ({ nama: str(x.nama, 200), peran: str(x.peran, 100) })),
    },
    dokumen: (Array.isArray(v.dokumen) ? v.dokumen : []).filter(adalahObjek).map((d) => ({ nama: str(d.nama, 300), jenis: str(d.jenis, 60), versi: str(d.versi, 20), diubah: str(d.diubah, 40), ukuran: angka(d.ukuran) })),
    kelengkapan: { teks: str(kel.teks, 100), lengkap: kel.lengkap === true, ada: daftarStr(kel.ada), kurang: daftarStr(kel.kurang) },
    checklist: { selesai: angka(cek.selesai), total: angka(cek.total), belum: daftarStr(cek.belum), catatan: daftarStr(cek.catatan) },
    pindai: uraiPindai(v.pindai),
    revisi: adalahObjek(v.revisi)
      ? { waktu: str(v.revisi.waktu, 40), oleh: str(v.revisi.oleh, 200), poin: daftarStr(v.revisi.poin), kirimUlang: typeof v.revisi.kirimUlang === "string" ? v.revisi.kirimUlang : null, sejak: daftarStr(v.revisi.sejak) }
      : null,
  };
}

export function uraiPutaran(v: unknown): PutaranReview | null {
  if (!adalahObjek(v)) return null;
  const nomor = Math.max(1, Math.floor(angka(v.nomor, 1)));
  const pokok: Record<string, string> = {};
  if (adalahObjek(v.pokok)) for (const [k, x] of Object.entries(v.pokok)) if (typeof x === "string") pokok[k.slice(0, 40)] = x.slice(0, BATAS_TEKS.pokok);
  const per = adalahObjek(v.persetujuan) ? v.persetujuan : null;
  const fin = adalahObjek(v.final) ? v.final : null;
  const data = fin ? uraiData(fin.data) : null;
  const salinan = adalahObjek(v.salinan) ? v.salinan : null;
  return {
    id: str(v.id, 40) || `p${nomor}`,
    nomor,
    rev: Math.max(0, Math.floor(angka(v.rev))),
    status: v.status === "final" && fin && data ? "final" : "draf",
    dibuat: str(v.dibuat, 40),
    diubah: str(v.diubah, 40) || str(v.dibuat, 40),
    olehNama: str(v.olehNama, BATAS_TEKS.nama),
    olehEmail: str(v.olehEmail, 200),
    tanggalReview: ymd(v.tanggalReview),
    pokok,
    temuan: (Array.isArray(v.temuan) ? v.temuan : []).map(uraiTemuan).filter((t): t is TemuanReview => t != null).slice(0, MAKS_TEMUAN),
    kepatuhan: (Array.isArray(v.kepatuhan) ? v.kepatuhan : []).map(uraiKepatuhan).filter((b): b is ButirKepatuhan => b != null),
    syarat: (Array.isArray(v.syarat) ? v.syarat : [])
      .filter(adalahObjek)
      .map((s) => ({ id: str(s.id, 40) || idBaru("s"), teks: str(s.teks, BATAS_TEKS.syarat), selesai: s.selesai === true }))
      .filter((s) => s.teks.trim())
      .slice(0, MAKS_SYARAT),
    kesimpulan: pilih(v.kesimpulan, KODE_KESIMPULAN) ?? "",
    catatanPenandatangan: str(v.catatanPenandatangan, BATAS_TEKS.catatan),
    catatanPengaju: str(v.catatanPengaju, BATAS_TEKS.catatan),
    ...(per && str(per.nama).trim()
      ? {
          persetujuan: {
            nama: str(per.nama, BATAS_TEKS.nama),
            jabatan: str(per.jabatan, BATAS_TEKS.nama),
            tanggal: ymd(per.tanggal),
            keputusan: per.keputusan === "Dikembalikan" ? ("Dikembalikan" as const) : ("Disetujui" as const),
            catatan: str(per.catatan, 600),
            dicatat: str(per.dicatat, 40),
            oleh: str(per.oleh, 200),
          },
        }
      : {}),
    ...(fin && data ? { final: { waktu: str(fin.waktu, 40), oleh: str(fin.oleh, 200), data } } : {}),
    ...(uraiPindai(v.pindai) ? { pindai: uraiPindai(v.pindai)! } : {}),
    ...(salinan && str(salinan.nama).trim() ? { salinan: { nama: str(salinan.nama, 300), waktu: str(salinan.waktu, 40), oleh: str(salinan.oleh, 200), rev: Math.max(0, Math.floor(angka(salinan.rev))), ...(typeof salinan.webUrl === "string" ? { webUrl: salinan.webUrl.slice(0, 600) } : {}) } } : {}),
    ...(v.dipangkas === true ? { dipangkas: true } : {}),
  };
}

/** Isi kolom LembarReview (teks JSON atau objek) menjadi LembarReview. null bila kosong atau rusak. Tidak pernah melempar. */
export function uraiLembar(v: unknown): LembarReview | null {
  let j: unknown = v;
  if (typeof v === "string") {
    if (!v.trim()) return null;
    try {
      j = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!adalahObjek(j) || !Array.isArray(j.putaran)) return null;
  const putaran = j.putaran.map(uraiPutaran).filter((p): p is PutaranReview => p != null).sort((a, b) => a.nomor - b.nomor);
  return putaran.length ? { versi: VERSI_LEMBAR, putaran } : null;
}

export const putaranTerakhir = (l: LembarReview | null | undefined): PutaranReview | null => l?.putaran[l.putaran.length - 1] ?? null;

export function putaranFinalTerakhir(l: LembarReview | null | undefined): PutaranReview | null {
  for (let i = (l?.putaran.length ?? 0) - 1; i >= 0; i--) if (l!.putaran[i]!.status === "final") return l!.putaran[i]!;
  return null;
}

/** Padatkan putaran lama yang sudah final: buang bagian yang bisa dibuka lagi dari salinan .docx-nya. */
function padatkan(p: PutaranReview): PutaranReview {
  const { final, pindai: _pindai, ...sisa } = p;
  return {
    ...sisa,
    pokok: {},
    kepatuhan: [],
    syarat: [],
    temuan: p.temuan.map((t) => ({ ...t, isu: t.isu.slice(0, 140), usulan: "", tanggapan: "", revisi: false })),
    catatanPenandatangan: p.catatanPenandatangan.slice(0, 300),
    ...(final ? { final: { ...final, data: { ...final.data, dokumen: [], pindai: null, revisi: null } } } : {}),
    dipangkas: true,
  };
}

export interface HasilPangkas {
  lembar: LembarReview;
  /** false bila tetap melebihi batas walau putaran lama sudah dipadatkan: lembar tidak boleh disimpan. */
  muat: boolean;
  /** Nomor putaran yang dipadatkan pada pemangkasan ini. */
  dipadatkan: number[];
}

/** Pastikan JSON lembar muat di kolom SharePoint. Putaran final paling lama dipadatkan lebih dulu; putaran terakhir tidak disentuh. */
export function pangkasLembar(lembar: LembarReview, maks: number = BATAS_JSON_LEMBAR): HasilPangkas {
  let sekarang = lembar;
  const dipadatkan: number[] = [];
  for (;;) {
    if (JSON.stringify(sekarang).length <= maks) return { lembar: sekarang, muat: true, dipadatkan };
    const i = sekarang.putaran.findIndex((p, idx) => idx < sekarang.putaran.length - 1 && p.status === "final" && !p.dipangkas);
    if (i < 0) return { lembar: sekarang, muat: false, dipadatkan };
    dipadatkan.push(sekarang.putaran[i]!.nomor);
    sekarang = { ...sekarang, putaran: sekarang.putaran.map((p, idx) => (idx === i ? padatkan(p) : p)) };
  }
}

export function bungkusLembar(l: LembarReview): string {
  return JSON.stringify({ ...l, versi: VERSI_LEMBAR });
}

// --- Ringkasan untuk pengaju ----------------------------------------------------------------

/** Ringkasan yang boleh dibaca pengaju dari sebuah putaran. null bila putarannya belum final atau belum ada kesimpulan. */
export function ringkasUntukPengaju(p: PutaranReview): HasilReviewPengaju | null {
  if (p.status !== "final" || !p.kesimpulan || !p.final) return null;
  return { v: 1, putaran: p.nomor, kesimpulan: p.kesimpulan, tanggal: p.tanggalReview, waktu: p.final.waktu, oleh: p.olehNama, catatan: p.catatanPengaju.trim().slice(0, BATAS_TEKS.catatan) };
}

export function uraiHasilPengaju(v: unknown): HasilReviewPengaju | null {
  let j: unknown = v;
  if (typeof v === "string") {
    if (!v.trim()) return null;
    try {
      j = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!adalahObjek(j)) return null;
  const kesimpulan = pilih(j.kesimpulan, KODE_KESIMPULAN);
  if (!kesimpulan) return null;
  return { v: 1, putaran: Math.max(1, Math.floor(angka(j.putaran, 1))), kesimpulan, tanggal: ymd(j.tanggal), waktu: str(j.waktu, 40), oleh: str(j.oleh, BATAS_TEKS.nama), catatan: str(j.catatan, BATAS_TEKS.catatan) };
}

export function bungkusHasilPengaju(h: HasilReviewPengaju | null): string | null {
  return h ? JSON.stringify(h) : null;
}

/**
 * Apakah kartu hasil review tampil di Ruang Pengguna. Selama kontrak masih Review Legal, hasil lama hanya tampil bila
 * dibuat sesudah tahap ini dimulai (kalau tidak, kesimpulan "Perlu revisi" lama menyesatkan setelah kirim ulang).
 */
export function tampilkanHasilUntukPengaju(h: HasilReviewPengaju | null, k: Pick<Kontrak, "status" | "statusSejak">): boolean {
  if (!h) return false;
  // Hanya selama review berjalan: setelah kontrak aktif atau ditutup, hasil review tidak lagi relevan bagi pengaju.
  if (k.status === "Review Legal") return !!k.statusSejak && !!h.waktu && h.waktu >= k.statusSejak;
  return k.status === "Perlu Revisi" || k.status === "Proses Tanda Tangan";
}

// --- Hak dan tampilan -----------------------------------------------------------------------

/** Lembar dan salinannya adalah dokumen internal Legal: tidak untuk Ruang Pengguna dan tidak untuk Pengaju. */
export const bolehLihatLembar = (sesi: Pick<Sesi, "peran">, ruang: "admin" | "pengguna"): boolean => ruang === "admin" && sesi.peran !== "Pengaju";
export const bolehUbahLembar = (k: Pick<Kontrak, "status">, sesi: Sesi): boolean => adalahLegal(sesi) && k.status === "Review Legal";
/** Persetujuan kepala Legal dicatat sesudah lembar final, termasuk saat kontrak sudah di Proses Tanda Tangan. */
export const bolehCatatPersetujuanLembar = (k: Pick<Kontrak, "status">, sesi: Sesi): boolean => adalahLegal(sesi) && (k.status === "Review Legal" || k.status === "Proses Tanda Tangan");

/** Panel lembar tampil selama Review Legal (supaya Legal bisa memulainya) dan sesudahnya selama sudah ada lembar. Kontrak lama tanpa lembar tidak dibebani panel kosong. */
export const tampilkanPanelLembar = (k: Pick<Kontrak, "status">, lembar: LembarReview | null | undefined): boolean => k.status === "Review Legal" || (lembar?.putaran.length ?? 0) > 0;

/** Berkas salinan lembar (jenis atau namanya) disembunyikan dari daftar dokumen Ruang Pengguna dan hitungan revisi. */
export function adalahBerkasLembar(d: Pick<Dokumen, "jenis" | "nama">): boolean {
  return d.jenis === JENIS_LEMBAR || /^lembar review legal\b/i.test(d.nama.trim());
}

/** "Lembar Review Legal P2 KTR-2026-0012 - Judul.docx"; karakter yang ditolak SharePoint dibuang. */
export function namaBerkasLembar(k: Pick<Kontrak, "nomorPengajuan" | "judul">, putaran: number): string {
  const judul = k.judul
    .replace(/["*:<>?/\\|#%~&{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/[.\s]+$/, "");
  const nomor = k.nomorPengajuan.trim().replace(/["*:<>?/\\|#%~&{}]/g, "-");
  return `Lembar Review Legal P${Math.max(1, Math.floor(putaran))}${nomor ? ` ${nomor}` : ""}${judul ? ` - ${judul}` : ""}.docx`;
}

// --- Membuat dan mengubah putaran -----------------------------------------------------------

const kepadatan = (teks: string): string => teks.replace(/\s+/g, " ").trim();
const rapikanUang = (n: number, mataUang: MataUang): string => new Intl.NumberFormat("id-ID", { style: "currency", currency: mataUang, maximumFractionDigits: mataUang === "IDR" ? 0 : 2 }).format(n);

/** Isian awal pokok kontrak dari data pengajuan. Legal memeriksa dan melengkapinya; bagian yang tidak diketahui dibiarkan kosong. */
export function pokokAwal(k: Pick<Kontrak, "jenis" | "deskripsi" | "nilai" | "mataUang" | "tanggalMulai" | "tanggalBerakhir" | "jenisPerubahan">, override?: OverridePokok): Record<string, string> {
  const hasil: Record<string, string> = {};
  const ada = new Set(daftarPokok(k.jenis, override).map((p) => p.id));
  const lingkup = kepadatan(k.deskripsi).slice(0, 600);
  if (lingkup && ada.has("lingkup")) hasil.lingkup = lingkup;
  if (k.nilai != null && ada.has("nilai")) hasil.nilai = `Nilai ${rapikanUang(k.nilai, k.mataUang)} (menurut data pengajuan; periksa kebenarannya di draf).`;
  if (ada.has("jangka") && (k.tanggalMulai || k.tanggalBerakhir)) {
    hasil.jangka = `${k.tanggalMulai ? tanggalPanjang(k.tanggalMulai) : "?"} s.d. ${k.tanggalBerakhir ? tanggalPanjang(k.tanggalBerakhir) : "?"} (menurut data pengajuan).`;
  }
  return hasil;
}

/** Gabungkan butir kepatuhan standar dengan isian tersimpan (cocok lewat id). Butir tersimpan yang sudah tidak standar dibawa bila terisi. */
export function susunKepatuhan(jenis: Kontrak["jenis"], tersimpan: readonly ButirKepatuhan[] | undefined, override?: OverrideKepatuhan): ButirKepatuhan[] {
  const standar = daftarKepatuhan(jenis, override);
  const simpan = new Map((tersimpan ?? []).map((b) => [b.id, b]));
  const hasil: ButirKepatuhan[] = standar.map((b) => {
    const s = simpan.get(b.id);
    return { id: b.id, label: b.label, dasar: b.dasar, hasil: s?.hasil ?? "", catatan: s?.catatan ?? "", ...(b.perluVerifikasi ? { perluVerifikasi: true } : {}) };
  });
  const dikenal = new Set(standar.map((b) => b.id));
  return [...hasil, ...(tersimpan ?? []).filter((b) => !dikenal.has(b.id) && (b.hasil || b.catatan))];
}

export function temuanKosong(): TemuanReview {
  return { id: idBaru("t"), pasal: "", isu: "", risiko: "Sedang", usulan: "", status: "Terbuka", tanggapan: "", revisi: true };
}

export function syaratKosong(teks = ""): SyaratTtd {
  return { id: idBaru("s"), teks, selesai: false };
}

export interface Pengulas {
  nama: string;
  email: string;
}

/**
 * Putaran baru (draf). Isian dibawa dari putaran sebelumnya supaya Legal tidak mengetik ulang: pokok, kepatuhan,
 * temuan yang belum diterima, dan syarat yang belum selesai. Kesimpulan dan catatan dikosongkan.
 */
export function putaranBaru(
  k: Pick<Kontrak, "jenis" | "deskripsi" | "nilai" | "mataUang" | "tanggalMulai" | "tanggalBerakhir" | "jenisPerubahan">,
  lembar: LembarReview | null,
  pengulas: Pengulas,
  sekarang: string,
  hari: Ymd,
): PutaranReview {
  const sebelum = putaranTerakhir(lembar);
  const nomor = (sebelum?.nomor ?? 0) + 1;
  return {
    id: `p${nomor}`,
    nomor,
    rev: 0,
    status: "draf",
    dibuat: sekarang,
    diubah: sekarang,
    olehNama: pengulas.nama,
    olehEmail: pengulas.email,
    tanggalReview: hari,
    pokok: sebelum && Object.keys(sebelum.pokok).length ? { ...sebelum.pokok } : pokokAwal(k),
    temuan: (sebelum?.temuan ?? []).filter((t) => t.status !== "Diterima").map((t) => ({ ...t, dariPutaran: t.dariPutaran ?? sebelum!.nomor })),
    kepatuhan: susunKepatuhan(k.jenis, sebelum?.kepatuhan),
    syarat: (sebelum?.syarat ?? []).filter((s) => !s.selesai).map((s) => ({ ...s })),
    kesimpulan: "",
    catatanPenandatangan: "",
    catatanPengaju: "",
  };
}

/** Pangkas dan rapikan isian sebelum disimpan: baris temuan yang kosong dibuang, teks dipotong sesuai batas. */
export function rapikanPutaran(p: PutaranReview): PutaranReview {
  const potong = (t: string, maks: number) => t.replace(/\r\n?/g, "\n").trim().slice(0, maks);
  const pokok: Record<string, string> = {};
  for (const [id, isi] of Object.entries(p.pokok)) {
    const t = potong(isi, BATAS_TEKS.pokok);
    if (t) pokok[id] = t;
  }
  return {
    ...p,
    pokok,
    temuan: p.temuan
      .map((t) => ({ ...t, pasal: potong(t.pasal, BATAS_TEKS.pasal), isu: potong(t.isu, BATAS_TEKS.isu), usulan: potong(t.usulan, BATAS_TEKS.usulan), tanggapan: potong(t.tanggapan, BATAS_TEKS.tanggapan) }))
      .filter((t) => t.pasal || t.isu || t.usulan || t.tanggapan)
      .slice(0, MAKS_TEMUAN),
    kepatuhan: p.kepatuhan.map((b) => ({ ...b, catatan: potong(b.catatan, BATAS_TEKS.kepatuhan) })),
    syarat: p.syarat.map((s) => ({ ...s, teks: potong(s.teks, BATAS_TEKS.syarat) })).filter((s) => s.teks).slice(0, MAKS_SYARAT),
    catatanPenandatangan: potong(p.catatanPenandatangan, BATAS_TEKS.catatan),
    catatanPengaju: potong(p.catatanPengaju, BATAS_TEKS.catatan),
  };
}

/** Ganti satu putaran (cocok lewat id) dengan yang baru dan naikkan rev. Putaran tidak ditemukan: ditambahkan di akhir. */
export function simpanPutaran(lembar: LembarReview | null, p: PutaranReview, sekarang: string): LembarReview {
  const baru = { ...rapikanPutaran(p), rev: p.rev + 1, diubah: sekarang };
  const daftar = lembar?.putaran ?? [];
  const ada = daftar.some((x) => x.id === p.id);
  return { versi: VERSI_LEMBAR, putaran: (ada ? daftar.map((x) => (x.id === p.id ? baru : x)) : [...daftar, baru]).sort((a, b) => a.nomor - b.nomor) };
}

// --- Ringkasan temuan, risiko, dan saran kesimpulan -------------------------------------------

export interface RingkasTemuan {
  total: number;
  perRisiko: Record<TingkatRisiko, number>;
  perStatus: Record<StatusTemuan, number>;
  /** Belum Diterima. */
  belumSelesai: number;
}

export function ringkasTemuan(temuan: readonly TemuanReview[]): RingkasTemuan {
  const perRisiko = { Rendah: 0, Sedang: 0, Tinggi: 0 } as Record<TingkatRisiko, number>;
  const perStatus = { Terbuka: 0, Dinegosiasikan: 0, Diterima: 0, Ditolak: 0 } as Record<StatusTemuan, number>;
  for (const t of temuan) {
    perRisiko[t.risiko]++;
    perStatus[t.status]++;
  }
  return { total: temuan.length, perRisiko, perStatus, belumSelesai: temuan.filter((t) => t.status !== "Diterima").length };
}

export interface RisikoKeseluruhan {
  /** Risiko tertinggi dari temuan yang belum diterima ("Rendah" bila tidak ada). */
  sisa: TingkatRisiko;
  /** Risiko tertinggi dari semua temuan, termasuk yang sudah diterima. Kosong bila belum ada temuan. */
  tertinggi: TingkatRisiko | null;
  ringkas: string;
}

const peringkatRisiko = (r: TingkatRisiko) => TINGKAT_RISIKO.indexOf(r);

export function risikoKeseluruhan(temuan: readonly TemuanReview[]): RisikoKeseluruhan {
  const tertinggi = temuan.reduce<TingkatRisiko | null>((m, t) => (m == null || peringkatRisiko(t.risiko) > peringkatRisiko(m) ? t.risiko : m), null);
  const sisaDaftar = temuan.filter((t) => t.status !== "Diterima");
  const sisa = sisaDaftar.reduce<TingkatRisiko>((m, t) => (peringkatRisiko(t.risiko) > peringkatRisiko(m) ? t.risiko : m), "Rendah");
  const ringkas =
    temuan.length === 0
      ? "Belum ada temuan dicatat."
      : sisaDaftar.length === 0
        ? `Semua ${temuan.length} temuan sudah diterima. Risiko tertinggi yang pernah ditemukan: ${tertinggi}.`
        : `Risiko sisa ${sisa} dari ${sisaDaftar.length} temuan yang belum diterima. Risiko tertinggi yang ditemukan: ${tertinggi}.`;
  return { sisa, tertinggi, ringkas };
}

export interface MasukanSaran {
  temuan: readonly TemuanReview[];
  kepatuhan: readonly ButirKepatuhan[];
  syarat: readonly SyaratTtd[];
  /** Dokumen wajib sudah lengkap? Tidak diketahui = tidak dipertimbangkan. */
  dokumenLengkap?: boolean;
}

export interface SaranKesimpulan {
  kode: KodeKesimpulan;
  alasan: string[];
}

/**
 * Saran kesimpulan dari isi lembar. Hanya SARAN: keputusan tetap pada Legal.
 * - Temuan Tinggi yang ditolak pihak lain: Tidak disarankan.
 * - Temuan Tinggi atau Sedang yang masih terbuka atau dinegosiasikan, atau kepatuhan Tidak sesuai: Perlu revisi.
 * - Temuan Sedang yang diterima atau ditolak (risiko diterima sadar), syarat sebelum tanda tangan yang belum selesai, atau dokumen
 *   wajib yang belum lengkap: Layak dengan catatan.
 * - Selain itu: Layak ditandatangani.
 */
export function sarankanKesimpulan(m: MasukanSaran): SaranKesimpulan {
  const buka = (t: TemuanReview) => t.status === "Terbuka" || t.status === "Dinegosiasikan";
  const tinggiTolak = m.temuan.filter((t) => t.risiko === "Tinggi" && t.status === "Ditolak");
  const wajibUbah = m.temuan.filter((t) => (t.risiko === "Tinggi" || t.risiko === "Sedang") && buka(t));
  const tidakSesuai = m.kepatuhan.filter((b) => b.hasil === "tidak-sesuai");
  if (tinggiTolak.length) return { kode: "tidak", alasan: [`${tinggiTolak.length} temuan berisiko tinggi ditolak pihak lain.`] };
  if (wajibUbah.length || tidakSesuai.length) {
    const alasan: string[] = [];
    if (wajibUbah.length) alasan.push(`${wajibUbah.length} temuan berisiko tinggi atau sedang belum beres.`);
    if (tidakSesuai.length) alasan.push(`${tidakSesuai.length} butir kepatuhan regulasi tidak sesuai.`);
    return { kode: "revisi", alasan };
  }
  const alasan: string[] = [];
  const sedangDiterima = m.temuan.filter((t) => t.risiko === "Sedang" && (t.status === "Diterima" || t.status === "Ditolak"));
  const syaratBuka = m.syarat.filter((s) => !s.selesai);
  if (sedangDiterima.length) alasan.push(`${sedangDiterima.length} temuan risiko sedang diterima dengan catatan.`);
  if (syaratBuka.length) alasan.push(`${syaratBuka.length} syarat sebelum tanda tangan belum selesai.`);
  if (m.dokumenLengkap === false) alasan.push("Dokumen wajib belum lengkap.");
  if (alasan.length) return { kode: "layak-catatan", alasan };
  return { kode: "layak", alasan: m.temuan.length === 0 ? ["Belum ada temuan dicatat."] : ["Semua temuan sudah beres."] };
}

// --- Temuan menjadi poin revisi ---------------------------------------------------------------

/** Temuan yang ditandai untuk permintaan revisi dan belum diterima. */
export const temuanUntukRevisi = (temuan: readonly TemuanReview[]): TemuanReview[] => temuan.filter((t) => t.revisi && t.status !== "Diterima" && (t.isu.trim() || t.usulan.trim()));

/**
 * Satu poin revisi per temuan, dalam satu baris: "Pasal 5 (Denda): usulan". Usulan didahulukan; bila kosong dipakai
 * rumusan isunya. Tingkat risiko dan tanggapan internal TIDAK ikut, karena poin ini dibaca pengaju.
 */
export function poinRevisiDariTemuan(temuan: readonly TemuanReview[]): string[] {
  return temuanUntukRevisi(temuan).map((t) => {
    const isi = kepadatan(t.usulan || t.isu);
    return t.pasal.trim() ? `${kepadatan(t.pasal)}: ${isi}` : isi;
  });
}

/** Teks siap pakai untuk modal Minta Revisi (daftar bernomor, dibaca KartuRevisi sebagai poin). Kosong bila tidak ada. */
export function teksRevisiDariTemuan(temuan: readonly TemuanReview[]): string {
  const poin = poinRevisiDariTemuan(temuan);
  return poin.length ? `Mohon perbaiki hal berikut ya:\n${poin.map((p, i) => `${i + 1}. ${p}`).join("\n")}` : "";
}

// --- Finalisasi -------------------------------------------------------------------------------

export interface HasilCekFinal {
  /** Harus diperbaiki sebelum bisa difinalkan. */
  galat: string[];
  /** Pengingat; lembar tetap bisa difinalkan. */
  peringatan: string[];
}

export function cekFinalisasi(p: PutaranReview, data?: Pick<DataOtomatis, "kelengkapan" | "checklist"> | null): HasilCekFinal {
  const galat: string[] = [];
  const peringatan: string[] = [];
  if (!p.kesimpulan) galat.push("Pilih kesimpulan review.");
  if (!p.tanggalReview) galat.push("Isi tanggal review.");
  p.temuan.forEach((t, i) => {
    if (!t.isu.trim()) galat.push(`Temuan ke-${i + 1}${t.pasal.trim() ? ` (${t.pasal.trim()})` : ""} belum punya rumusan atau isu.`);
  });

  const saran = sarankanKesimpulan({ temuan: p.temuan, kepatuhan: p.kepatuhan, syarat: p.syarat, dokumenLengkap: data?.kelengkapan.lengkap });
  if (p.kesimpulan && urutanKesimpulan(saran.kode) > urutanKesimpulan(p.kesimpulan)) {
    peringatan.push(`Dari isi lembar, kesimpulan yang masuk akal adalah "${defKesimpulan(saran.kode)?.label}" (${saran.alasan.map((a) => a.replace(/\.$/, "")).join("; ")}). Kesimpulan Anda lebih longgar; pastikan alasannya tertulis di catatan untuk penandatangan.`);
  }
  if ((p.kesimpulan === "revisi" || p.kesimpulan === "tidak") && !p.catatanPengaju.trim() && poinRevisiDariTemuan(p.temuan).length === 0) {
    peringatan.push("Belum ada catatan untuk pengaju dan belum ada temuan yang ditandai untuk permintaan revisi. Pengaju tidak akan tahu apa yang perlu diperbaiki.");
  }
  if (p.kesimpulan === "layak-catatan" && !p.catatanPenandatangan.trim() && p.syarat.length === 0) {
    peringatan.push("Kesimpulan 'Layak dengan catatan' belum disertai catatan untuk penandatangan atau syarat sebelum tanda tangan.");
  }
  if (p.kepatuhan.length > 0 && p.kepatuhan.every((b) => !b.hasil)) peringatan.push("Daftar periksa kepatuhan regulasi belum diisi.");
  if (Object.keys(p.pokok).length === 0) peringatan.push("Pokok-pokok kontrak belum diisi.");
  if (data && !data.kelengkapan.lengkap) peringatan.push(`Dokumen wajib belum lengkap: ${data.kelengkapan.kurang.join(", ")}.`);
  if (data && data.checklist.total > 0 && data.checklist.selesai < data.checklist.total) peringatan.push(`Checklist review klausul baru ${data.checklist.selesai} dari ${data.checklist.total} butir.`);
  return { galat, peringatan };
}

export function finalkanPutaran(p: PutaranReview, data: DataOtomatis, oleh: string, sekarang: string): PutaranReview {
  const rapi = rapikanPutaran(p);
  return { ...rapi, status: "final", rev: p.rev + 1, diubah: sekarang, final: { waktu: sekarang, oleh, data } };
}

/** Buka lagi putaran final untuk disunting. Persetujuan kepala Legal gugur karena isinya berubah; riwayat salinan dipertahankan. */
export function bukaKembaliPutaran(p: PutaranReview, sekarang: string): PutaranReview {
  const { final: _final, persetujuan: _persetujuan, ...sisa } = p;
  return { ...sisa, status: "draf", rev: p.rev + 1, diubah: sekarang };
}

export function catatPersetujuanLembar(p: PutaranReview, isi: Omit<PersetujuanLembar, "dicatat" | "oleh">, oleh: string, sekarang: string): PutaranReview {
  return { ...p, rev: p.rev + 1, diubah: sekarang, persetujuan: { ...isi, nama: isi.nama.trim().slice(0, BATAS_TEKS.nama), jabatan: isi.jabatan.trim().slice(0, BATAS_TEKS.nama), catatan: isi.catatan.trim().slice(0, 600), dicatat: sekarang, oleh } };
}

export function hapusPersetujuanLembar(p: PutaranReview, sekarang: string): PutaranReview {
  const { persetujuan: _persetujuan, ...sisa } = p;
  return { ...sisa, rev: p.rev + 1, diubah: sekarang };
}

/** Salinan di library sudah usang bila lembar diubah sesudahnya. */
export const salinanUsang = (p: PutaranReview): boolean => !!p.salinan && p.rev > p.salinan.rev;

// --- Data otomatis ----------------------------------------------------------------------------

export interface MasukanDataOtomatis {
  kontrak: Kontrak;
  /** Dokumen kontrak, sudah tanpa berkas salinan lembar. */
  dokumen: readonly Dokumen[];
  aktivitas: readonly Aktivitas[];
  induk?: Pick<Kontrak, "judul" | "nomorKontrak" | "nomorPengajuan"> | null;
  /** id dokumen -> "v3", untuk draft yang versinya sempat dibaca. */
  versi?: Readonly<Record<string, string>>;
  pindai?: RingkasPindai | null;
  sekarang: string;
}

const MAKS_BERKAS = 30;

/** Susun bagian lembar yang diambil otomatis dari data yang sudah ada di sistem. Murni: tidak mengubah masukan. */
export function susunDataOtomatis(m: MasukanDataOtomatis): DataOtomatis {
  const k = m.kontrak;
  const urutan = (j: string) => {
    const i = URUTAN_JENIS.indexOf(j as JenisDokumen);
    return i < 0 ? 999 : i;
  };
  const dokumen: BerkasReview[] = [...m.dokumen]
    .sort((a, b) => urutan(a.jenis) - urutan(b.jenis) || b.diubah.localeCompare(a.diubah))
    .slice(0, MAKS_BERKAS)
    .map((d) => ({ nama: d.nama, jenis: d.jenis || "Jenis belum diisi", versi: m.versi?.[d.id] ?? "", diubah: d.diubah, ukuran: d.ukuran }));

  const kel = kekuranganDokumen(k.jenis, m.dokumen.map((d) => d.jenis));
  const ringkasKel = ringkasKelengkapan(kel);
  const cek = checklistReviewKontrak(k);
  const { selesai, total } = kemajuanChecklist(cek.items);

  const permintaan = permintaanRevisiTerakhir(m.aktivitas);
  const kirimUlang = permintaan ? kirimUlangSetelah(m.aktivitas, permintaan.waktu) : null;
  const sejak = permintaan ? sejakRevisi(m.dokumen, m.aktivitas, permintaan).ringkasan : [];

  return {
    dibuat: m.sekarang,
    identitas: {
      nomorPengajuan: k.nomorPengajuan,
      nomorKontrak: k.nomorKontrak,
      judul: k.judul,
      jenis: k.jenis,
      divisi: k.divisi,
      pengaju: k.pengajuNama || k.pengajuEmail,
      picLegal: k.picLegalNama || k.picLegalEmail,
      prioritas: k.prioritas,
      diajukan: k.tanggalDiajukan ?? k.dibuat,
      nomorReferensi: k.nomorReferensi,
      kodeProyek: k.kodeProyek,
      induk: m.induk ? `${m.induk.nomorKontrak || m.induk.nomorPengajuan} - ${m.induk.judul}` : "",
    },
    pihak: {
      mitra: k.mitra,
      npwp: k.npwpMitra,
      alamat: k.alamatMitra,
      penandatangan: k.penandatanganMitra,
      jabatan: k.jabatanMitra,
      dasarKewenangan: k.dasarKewenangan,
      lain: k.pihakLain.map((p) => ({ nama: p.nama, peran: p.peran })),
    },
    dokumen,
    kelengkapan: { teks: ringkasKel.teks, lengkap: ringkasKel.lengkap, ada: kel.ada.map(String), kurang: kel.kurang.map(String) },
    checklist: {
      selesai,
      total,
      belum: cek.items.filter((i) => !i.selesai).map((i) => i.label),
      catatan: cek.items.filter((i) => i.catatan?.trim()).map((i) => `${i.label}: ${i.catatan!.trim()}`),
    },
    pindai: m.pindai ?? null,
    revisi: permintaan ? { waktu: permintaan.waktu, oleh: permintaan.olehNama, poin: permintaan.uraian.poin, kirimUlang: kirimUlang?.waktu ?? null, sejak } : null,
  };
}

/** Ringkasan hasil pindai draf untuk disimpan di lembar. Hanya klausul yang lazim untuk jenis kontrak ini. */
export function ringkasHasilPindai(h: HasilPindai, nama: string, waktu: string): RingkasPindai {
  return {
    nama,
    waktu,
    terbaca: h.keterbacaan.tingkat !== "buruk",
    klausul: h.klausul.filter((x) => x.relevan).map((x) => ({ nama: x.nama, ada: x.ada })),
    penanda: h.penandaKosong.length,
    selisih: h.selisih.filter((s) => s.tingkat === "beda").map((s) => `${s.label}: dokumen ${s.di_dokumen}, pengajuan ${s.di_pengajuan}`),
  };
}

// --- Sambungan ke alur: Lanjut ke Tanda Tangan --------------------------------------------------

export interface PeringatanLembar {
  nada: "peringatan" | "info" | "sukses";
  teks: string;
  rinci: string[];
}

/**
 * Peringatan LUNAK di modal Lanjut ke Tanda Tangan (tidak pernah memblokir). null bila lembarnya tidak bisa diperiksa
 * (mis. kolom belum ada), supaya modal tidak menampilkan peringatan yang menyesatkan.
 */
export function peringatanLembarSebelumTtd(lembar: LembarReview | null | undefined): PeringatanLembar | null {
  const akhir = putaranTerakhir(lembar);
  if (!akhir) return { nada: "peringatan", teks: "Belum ada Lembar Hasil Review Legal. Anda tetap bisa lanjut; lembar membantu penandatangan memahami hasil review.", rinci: [] };
  const final = putaranFinalTerakhir(lembar);
  if (!final) return { nada: "peringatan", teks: `Lembar Hasil Review Legal putaran ${akhir.nomor} masih berupa draf dan belum difinalkan. Anda tetap bisa lanjut.`, rinci: [] };
  const rinci: string[] = [];
  const def = defKesimpulan(final.kesimpulan);
  const pernahLebihBaru = akhir.nomor > final.nomor;
  if (pernahLebihBaru) rinci.push(`Putaran ${akhir.nomor} masih draf; yang dibaca di sini putaran ${final.nomor}.`);
  if (!def?.lanjutTtd) {
    return { nada: "peringatan", teks: `Kesimpulan lembar putaran ${final.nomor} adalah "${def?.label ?? "belum ada"}", bukan layak ditandatangani. Pastikan drafnya sudah diperbaiki, atau buat putaran baru. Anda tetap bisa lanjut.`, rinci };
  }
  const syaratBuka = final.syarat.filter((s) => !s.selesai);
  if (final.kesimpulan === "layak-catatan" && syaratBuka.length) {
    rinci.push(...syaratBuka.map((s) => `Syarat belum selesai: ${s.teks}`));
    return { nada: "info", teks: `Lembar putaran ${final.nomor}: ${def.label}. Ada ${syaratBuka.length} syarat sebelum tanda tangan yang belum ditandai selesai.`, rinci };
  }
  if (!final.persetujuan) rinci.push("Persetujuan kepala Legal belum dicatat (opsional).");
  return { nada: "sukses", teks: `Lembar putaran ${final.nomor}: ${def.label}.`, rinci };
}

/** Satu kalimat untuk catatan aktivitas saat Lanjut ke Tanda Tangan. */
export function ringkasLembarUntukCatatan(lembar: LembarReview | null | undefined): string {
  const final = putaranFinalTerakhir(lembar);
  if (!final) return "Lembar Hasil Review Legal belum difinalkan.";
  const r = ringkasTemuan(final.temuan);
  const syaratBuka = final.syarat.filter((s) => !s.selesai).length;
  const bagian = [`${r.total} temuan${r.total ? `, ${r.belumSelesai} belum diterima` : ""}`, ...(syaratBuka ? [`${syaratBuka} syarat belum selesai`] : [])];
  return `Lembar Hasil Review Legal putaran ${final.nomor}: ${defKesimpulan(final.kesimpulan)?.label ?? "-"} (${bagian.join("; ")}).`;
}

/** Ringkasan pengaju yang berlaku sekarang: dari putaran final terakhir. null bila belum ada lembar yang difinalkan. */
export function hasilPengajuTerkini(lembar: LembarReview | null | undefined): HasilReviewPengaju | null {
  const final = putaranFinalTerakhir(lembar);
  return final ? ringkasUntukPengaju(final) : null;
}
