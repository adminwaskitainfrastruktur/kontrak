// Masa, batas keputusan, dan tonggak setelah kontrak Aktif (U34 dan U33).
//
// Modul ini murni: tidak memanggil jaringan dan TIDAK mengimpor lib/format (yang menarik config.ts
// dan import.meta.env), supaya bisa diuji langsung lewat tsx. Semua fungsi tanggal menerima `hari`
// (YYYY-MM-DD, zona Jakarta) sebagai argumen supaya hasilnya bisa diuji dan konsisten dalam satu render.
//
// Dua gagasan utama:
//   Batas keputusan = tanggal berakhir efektif dikurangi masa pemberitahuan. Lewat tanggal itu,
//   kontrak sewa atau jasa tidak bisa lagi dihentikan atau dinegosiasikan (atau, bila ada klausul
//   perpanjangan otomatis, sudah terlanjur diperpanjang).
//   Kewajiban = tonggak ringan setelah Aktif (BAST, retensi, laporan berkala, pembaruan jaminan).
//   Tanpa persen dan tanpa nominal otomatis: aplikasi ini bukan sistem keuangan.
import { adalahAddendum, ringkasAddendum } from "./addendum";
import type { Kontrak, Ymd } from "./types";

// --- Tanggal ----------------------------------------------------------------------

const ZONA = "Asia/Jakarta";
const fmtYmd = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });

/** Hari ini dalam zona Jakarta, format YYYY-MM-DD. */
export function hariWib(d: Date = new Date()): Ymd {
  return fmtYmd.format(d);
}

/** Tanggal `n` hari setelah `ymd` (n boleh negatif). */
export function tambahYmd(ymd: Ymd, n: number): Ymd {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Jumlah hari dari `dari` ke `ke` (positif bila `ke` lebih akhir). */
export function selisihYmd(dari: Ymd, ke: Ymd): number {
  return Math.round((Date.parse(`${ke}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86_400_000);
}

/** Tengah malam Jakarta pada `ymd`, sebagai ISO UTC: cara SharePoint menyimpan kolom tanggal-saja. */
export function awalHariIso(ymd: Ymd): string {
  return new Date(`${ymd}T00:00:00+07:00`).toISOString();
}

/**
 * Potongan filter OData untuk kolom tanggal-saja yang jatuh TEPAT pada `ymd`. Dipakai flow pengingat.
 * Memakai rentang [awal hari, awal hari berikutnya) karena nilai tersimpan bergeser menurut zona waktu site.
 * Contoh: fields/TanggalBerakhirJaminan ge '2026-10-31T17:00:00.000Z' and fields/TanggalBerakhirJaminan lt '2026-11-01T17:00:00.000Z'
 */
export function filterTanggalTepat(kolom: string, ymd: Ymd): string {
  return `fields/${kolom} ge '${awalHariIso(ymd)}' and fields/${kolom} lt '${awalHariIso(tambahYmd(ymd, 1))}'`;
}

// --- Akhir kontrak dan batas keputusan (U34) ---------------------------------------

export const HORIZON_MASA_HARI = 90;
/** Ambang pengingat flow harian: sisa hari ke batas keputusan (atau ke berakhir) yang memicu email. */
export const AMBANG_PENGINGAT = [30, 14, 7] as const;
export const MASA_PEMBERITAHUAN_MAKS = 730;

/**
 * Tanggal berakhir yang berlaku sekarang. Bila daftar `semua` diberikan, dihitung langsung dari addendum
 * yang Aktif (lebih segar daripada kolom); bila tidak, memakai kolom BerakhirEfektif lalu TanggalBerakhir.
 */
export function akhirKontrak(k: Kontrak, semua: readonly Kontrak[] = []): Ymd | null {
  if (adalahAddendum(k)) return k.tanggalBerakhir;
  if (semua.length > 0) return ringkasAddendum(k, semua as Kontrak[]).berakhirEfektif ?? k.berakhirEfektif ?? k.tanggalBerakhir;
  return k.berakhirEfektif ?? k.tanggalBerakhir;
}

// --- Kolom BerakhirEfektif (U24) ---------------------------------------------------
//
// BerakhirEfektif dibaca flow pengingat. Nilainya selalu dihitung dari satu rumus (tanggal berakhir induk dan
// addendum yang Aktif) oleh sinkronkanBerakhirEfektif di services/kontrak.ts, dari semua jalur yang bisa
// mengubahnya, dan bisa dirapikan massal lewat tombol "Rekonsiliasi masa berlaku" di Pengaturan.

/** Nilai BerakhirEfektif yang seharusnya untuk kontrak induk. */
export function berakhirEfektifSeharusnya(induk: Kontrak, semua: readonly Kontrak[]): Ymd | null {
  return ringkasAddendum(induk, semua).berakhirEfektif;
}

export interface SelisihBerakhirEfektif {
  id: number;
  nomor: string;
  dari: Ymd | null;
  ke: Ymd | null;
}

/** Kontrak Aktif (bukan addendum) yang kolom BerakhirEfektif-nya kosong atau berbeda dari seharusnya. */
export function selisihBerakhirEfektif(semua: readonly Kontrak[]): SelisihBerakhirEfektif[] {
  const hasil: SelisihBerakhirEfektif[] = [];
  for (const k of semua) {
    if (k.status !== "Aktif" || adalahAddendum(k)) continue;
    const ke = berakhirEfektifSeharusnya(k, semua);
    const dari = k.berakhirEfektif ?? null;
    if (ke !== dari && ke != null) hasil.push({ id: k.id, nomor: k.nomorKontrak || k.nomorPengajuan, dari, ke });
  }
  return hasil;
}

/** Tanggal terakhir untuk memutuskan (memberi tahu, menegosiasikan, memutus). null bila masa pemberitahuan belum diisi. */
export function batasKeputusan(k: Kontrak, semua: readonly Kontrak[] = []): Ymd | null {
  const akhir = akhirKontrak(k, semua);
  if (!akhir || k.masaPemberitahuanHari == null) return null;
  return tambahYmd(akhir, -k.masaPemberitahuanHari);
}

/**
 * Klausul masa pemberitahuan belum dicatat Legal. Isi 0 bila kontrak memang tidak punya klausul itu,
 * supaya tidak lagi ditandai. Addendum mewarisi dari induknya, jadi tidak dihitung.
 */
export function klausulBelumDiisi(k: Kontrak): boolean {
  return !adalahAddendum(k) && k.masaPemberitahuanHari == null;
}

export type TahapMasa = "mendatang" | "mendekat" | "mendesak" | "lewat-batas" | "berakhir";

export interface JendelaMasa {
  kontrak: Kontrak;
  akhir: Ymd;
  batas: Ymd | null;
  sisaAkhir: number;
  sisaBatas: number | null;
  tahap: TahapMasa;
  otomatis: boolean;
  belumDiisi: boolean;
}

const BATAS_MENDESAK = 14;

/**
 * Jendela keputusan satu kontrak. Titik acuannya batas keputusan (bila ada), kalau tidak tanggal berakhir.
 *   berakhir     = tanggal berakhir sudah lewat tetapi kontrak masih berstatus Aktif
 *   lewat-batas  = batas keputusan sudah lewat, kontrak belum berakhir
 *   mendesak     = acuan 14 hari lagi atau kurang (termasuk hari ini)
 *   mendekat     = acuan dalam `horizon` hari
 *   mendatang    = masih jauh
 */
export function jendelaMasa(k: Kontrak, semua: readonly Kontrak[], hari: Ymd = hariWib(), horizon: number = HORIZON_MASA_HARI): JendelaMasa | null {
  const akhir = akhirKontrak(k, semua);
  if (!akhir) return null;
  const batas = batasKeputusan(k, semua);
  const sisaAkhir = selisihYmd(hari, akhir);
  const sisaBatas = batas ? selisihYmd(hari, batas) : null;
  const acuan = sisaBatas ?? sisaAkhir;
  let tahap: TahapMasa;
  if (sisaAkhir < 0) tahap = "berakhir";
  else if (sisaBatas != null && sisaBatas < 0) tahap = "lewat-batas";
  else if (acuan <= BATAS_MENDESAK) tahap = "mendesak";
  else if (acuan <= horizon) tahap = "mendekat";
  else tahap = "mendatang";
  return { kontrak: k, akhir, batas, sisaAkhir, sisaBatas, tahap, otomatis: k.perpanjanganOtomatis, belumDiisi: klausulBelumDiisi(k) };
}

export interface KelompokMasa {
  /** Aktif, perpanjangan otomatis, dan batas keputusannya dekat atau lewat. Terpisah dari "Akan berakhir". */
  otomatis: JendelaMasa[];
  /** Aktif tanpa perpanjangan otomatis yang akan atau sudah melewati masa berlakunya. */
  akanBerakhir: JendelaMasa[];
  /** Semua kontrak Aktif yang klausul masa pemberitahuannya belum dicatat. */
  belumDiisi: Kontrak[];
  /** Kontrak Aktif dengan tanggal berakhir yang masih jauh. */
  mendatang: number;
}

const urutAcuan = (a: JendelaMasa, b: JendelaMasa) => (a.sisaBatas ?? a.sisaAkhir) - (b.sisaBatas ?? b.sisaAkhir) || a.kontrak.id - b.kontrak.id;

export function kelompokMasa(semua: readonly Kontrak[], hari: Ymd = hariWib(), horizon: number = HORIZON_MASA_HARI): KelompokMasa {
  const aktif = semua.filter((k) => k.status === "Aktif" && !adalahAddendum(k));
  const jendela = aktif.map((k) => jendelaMasa(k, semua, hari, horizon)).filter((j): j is JendelaMasa => j != null);
  const dekat = jendela.filter((j) => j.tahap !== "mendatang");
  return {
    otomatis: dekat.filter((j) => j.otomatis).sort(urutAcuan),
    akanBerakhir: dekat.filter((j) => !j.otomatis).sort(urutAcuan),
    belumDiisi: aktif.filter(klausulBelumDiisi).sort((a, b) => (akhirKontrak(a, semua) ?? "9999").localeCompare(akhirKontrak(b, semua) ?? "9999")),
    mendatang: jendela.length - dekat.length,
  };
}

export interface PengingatMasa {
  jendela: JendelaMasa;
  ambang: number;
}

/**
 * Kontrak yang tepat berada di ambang pengingat (30, 14, atau 7 hari ke batas keputusan) pada `hari`.
 * Cerminan logika flow harian: flow memanggil aturan yang sama lewat kolom BerakhirEfektif dan MasaPemberitahuanHari.
 */
export function pengingatMasa(semua: readonly Kontrak[], hari: Ymd = hariWib(), ambang: readonly number[] = AMBANG_PENGINGAT): PengingatMasa[] {
  const hasil: PengingatMasa[] = [];
  for (const k of semua) {
    if (k.status !== "Aktif" || adalahAddendum(k)) continue;
    const j = jendelaMasa(k, semua, hari);
    if (j?.sisaBatas != null && ambang.includes(j.sisaBatas)) hasil.push({ jendela: j, ambang: j.sisaBatas });
  }
  return hasil.sort((a, b) => a.ambang - b.ambang || a.jendela.kontrak.id - b.jendela.kontrak.id);
}

/** Validasi isian masa pemberitahuan dari formulir: kosong berarti belum diisi, selain itu bilangan bulat 0 sampai batas. */
export function bacaMasaPemberitahuan(teks: string): { nilai: number | null; galat: string | null } {
  const bersih = teks.trim();
  if (!bersih) return { nilai: null, galat: null };
  if (!/^\d+$/.test(bersih)) return { nilai: null, galat: "Isi dengan bilangan bulat hari, misalnya 30 atau 60." };
  const n = Number(bersih);
  if (n > MASA_PEMBERITAHUAN_MAKS) return { nilai: null, galat: `Paling lama ${MASA_PEMBERITAHUAN_MAKS} hari.` };
  return { nilai: n, galat: null };
}

// --- Kewajiban setelah Aktif (U33) --------------------------------------------------

export const TIPE_KEWAJIBAN = ["BAST", "Retensi", "Laporan Berkala", "Pembayaran Termin", "Pembaruan Jaminan", "Lainnya"] as const;
export type TipeKewajiban = (typeof TIPE_KEWAJIBAN)[number];
/** Pilihan di formulir. "Pembayaran Termin" tetap terbaca dari list, tetapi aplikasi ini tidak menyediakan templat termin. */
export const TIPE_KEWAJIBAN_BARU: readonly TipeKewajiban[] = ["BAST", "Retensi", "Laporan Berkala", "Pembaruan Jaminan", "Lainnya"];

export const STATUS_KEWAJIBAN = ["Terbuka", "Selesai", "Dibatalkan"] as const;
export type StatusKewajiban = (typeof STATUS_KEWAJIBAN)[number];

export interface Kewajiban {
  id: number;
  judul: string;
  kontrakId: number | null;
  tipe: TipeKewajiban;
  jatuhTempo: Ymd | null;
  picEmail: string;
  status: StatusKewajiban;
  buktiUrl: string;
  catatan: string;
}

export type KewajibanInput = Omit<Kewajiban, "id">;

export type LevelKewajiban = "terlambat" | "segera" | "terbuka" | "selesai" | "batal";
export const HARI_SEGERA_KEWAJIBAN = 7;

/** "Terlambat" dihitung di klien: masih Terbuka dan jatuh tempo sebelum hari ini. */
export function terlambat(w: Kewajiban, hari: Ymd = hariWib()): boolean {
  return w.status === "Terbuka" && w.jatuhTempo != null && w.jatuhTempo < hari;
}

export function levelKewajiban(w: Kewajiban, hari: Ymd = hariWib()): LevelKewajiban {
  if (w.status === "Selesai") return "selesai";
  if (w.status === "Dibatalkan") return "batal";
  if (terlambat(w, hari)) return "terlambat";
  if (w.jatuhTempo && selisihYmd(hari, w.jatuhTempo) <= HARI_SEGERA_KEWAJIBAN) return "segera";
  return "terbuka";
}

const BOBOT_LEVEL: Record<LevelKewajiban, number> = { terlambat: 0, segera: 1, terbuka: 2, selesai: 3, batal: 4 };

/** Terlambat dulu, lalu yang paling dekat jatuh tempo, lalu yang sudah selesai. */
export function urutkanKewajiban(daftar: readonly Kewajiban[], hari: Ymd = hariWib()): Kewajiban[] {
  return [...daftar].sort((a, b) => {
    const la = BOBOT_LEVEL[levelKewajiban(a, hari)];
    const lb = BOBOT_LEVEL[levelKewajiban(b, hari)];
    return la - lb || (a.jatuhTempo ?? "9999").localeCompare(b.jatuhTempo ?? "9999") || a.id - b.id;
  });
}

export interface RingkasanKewajiban {
  total: number;
  terbuka: number;
  terlambat: number;
  segera: number;
  selesai: number;
  dibatalkan: number;
}

export function ringkasKewajiban(daftar: readonly Kewajiban[], hari: Ymd = hariWib()): RingkasanKewajiban {
  const r: RingkasanKewajiban = { total: daftar.length, terbuka: 0, terlambat: 0, segera: 0, selesai: 0, dibatalkan: 0 };
  for (const w of daftar) {
    const l = levelKewajiban(w, hari);
    if (l === "selesai") r.selesai++;
    else if (l === "batal") r.dibatalkan++;
    else {
      r.terbuka++;
      if (l === "terlambat") r.terlambat++;
      if (l === "segera") r.segera++;
    }
  }
  return r;
}

export const HARI_SIAP_DITUTUP = 60;

/**
 * Petunjuk "Siap ditutup": kontrak Aktif, ada kewajiban yang tercatat dan semuanya selesai (atau dibatalkan),
 * dan tanggal berakhirnya sudah dekat (dalam `ambang` hari) atau lewat. Hanya petunjuk, tidak mengubah apa pun.
 */
export function siapDitutup(k: Kontrak, semua: readonly Kontrak[], daftar: readonly Kewajiban[], hari: Ymd = hariWib(), ambang: number = HARI_SIAP_DITUTUP): boolean {
  if (k.status !== "Aktif") return false;
  const r = ringkasKewajiban(daftar, hari);
  if (r.selesai === 0 || r.terbuka > 0) return false;
  const akhir = akhirKontrak(k, semua);
  return akhir != null && selisihYmd(hari, akhir) <= ambang;
}

/** Filter OData kewajiban Terbuka yang jatuh tempo tepat pada `ymd` (untuk flow pengingat). */
export function filterKewajibanJatuhTempo(ymd: Ymd): string {
  return `fields/StatusKewajiban eq 'Terbuka' and ${filterTanggalTepat("JatuhTempo", ymd)}`;
}
