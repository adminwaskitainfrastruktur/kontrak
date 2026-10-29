// Aturan jaminan (bank garansi, surety bond): sisa hari, level pengingat, dan peringatan.
//
// Murni dan tanpa jaringan; tidak mengimpor lib/format supaya bisa diuji lewat tsx. Semua fungsi
// menerima `hari` (YYYY-MM-DD, zona Jakarta).
//
// Peringatan selalu KUNING dan tidak memblokir apa pun: aplikasi mencatat dan mengingatkan,
// keputusan tetap di Legal. Hanya satu kolom catatan risiko; denda dan sebaran risiko ditunda.
import { akhirKontrak, filterTanggalTepat, hariWib, selisihYmd, tambahYmd } from "./masa";
import { JENIS_ADDENDUM, JENIS_MOU, type Jaminan, type JenisJaminan, type Kontrak, type MataUang, type StatusJaminan, type Ymd } from "./types";

/** Ambang pengingat flow harian, dalam hari sebelum jaminan berakhir. */
export const AMBANG_JAMINAN = [30, 14, 7] as const;

export type LevelJaminan = "aman" | "30" | "14" | "7" | "lewat" | "selesai" | "tanpa-tanggal";

/**
 * Status yang sebenarnya berlaku: jaminan berstatus Aktif yang tanggal berakhirnya sudah lewat dianggap
 * Kedaluwarsa tanpa menunggu Legal mengubah statusnya. Pada tanggal berakhirnya sendiri jaminan masih berlaku.
 */
export function statusEfektif(j: Jaminan, hari: Ymd = hariWib()): StatusJaminan {
  if (j.status === "Aktif" && j.tanggalBerakhir && j.tanggalBerakhir < hari) return "Kedaluwarsa";
  return j.status;
}

export const jaminanBerlaku = (j: Jaminan, hari: Ymd = hariWib()) => statusEfektif(j, hari) === "Aktif";

/** Sisa hari sampai berakhir (negatif bila lewat), null bila tidak ada tanggal. */
export function sisaHariJaminan(j: Jaminan, hari: Ymd = hariWib()): number | null {
  return j.tanggalBerakhir ? selisihYmd(hari, j.tanggalBerakhir) : null;
}

export function levelJaminan(j: Jaminan, hari: Ymd = hariWib()): LevelJaminan {
  const st = statusEfektif(j, hari);
  if (st === "Kedaluwarsa") return "lewat";
  if (st !== "Aktif") return "selesai";
  const sisa = sisaHariJaminan(j, hari);
  if (sisa == null) return "tanpa-tanggal";
  if (sisa <= 7) return "7";
  if (sisa <= 14) return "14";
  if (sisa <= 30) return "30";
  return "aman";
}

/** Kalimat pendek untuk lencana: "12 hari lagi", "Berakhir hari ini", "Lewat 3 hari", "Dikembalikan". */
export function teksSisaJaminan(j: Jaminan, hari: Ymd = hariWib()): string {
  const st = statusEfektif(j, hari);
  const sisa = sisaHariJaminan(j, hari);
  if (st === "Dicairkan" || st === "Dikembalikan") return st;
  if (st === "Kedaluwarsa") return sisa != null && sisa < 0 ? `Lewat ${-sisa} hari` : "Kedaluwarsa";
  if (sisa == null) return "Tanpa tanggal";
  if (sisa === 0) return "Berakhir hari ini";
  return `${sisa} hari lagi`;
}

// --- Peringatan -------------------------------------------------------------------

export type KodePeringatanJaminan = "tanpa-pelaksanaan" | "pendek" | "perlu-diperbarui";

export interface PeringatanJaminan {
  kode: KodePeringatanJaminan;
  /** Selalu kuning: tidak pernah merah dan tidak pernah memblokir. */
  nada: "kuning";
  teks: string;
}

const tgl = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const teksTanggal = (ymd: Ymd) => tgl.format(new Date(`${ymd}T00:00:00Z`));

export const adalahJasa = (k: Pick<Kontrak, "jenis">) => k.jenis === "Pengadaan Jasa";

/** Jaminan pelaksanaan yang berlaku (belum dicairkan, dikembalikan, atau kedaluwarsa). */
export const pelaksanaanBerlaku = (daftar: readonly Jaminan[], hari: Ymd = hariWib()) => daftar.filter((j) => j.jenis === "Jaminan Pelaksanaan" && jaminanBerlaku(j, hari));

/** Peringatan nonblokir saat Legal mengaktifkan kontrak Pengadaan Jasa yang belum punya jaminan pelaksanaan yang berlaku. */
export function peringatanAktivasi(k: Pick<Kontrak, "jenis">, daftar: readonly Jaminan[], hari: Ymd = hariWib()): PeringatanJaminan | null {
  if (!adalahJasa(k) || pelaksanaanBerlaku(daftar, hari).length > 0) return null;
  return {
    kode: "tanpa-pelaksanaan",
    nada: "kuning",
    teks: "Kontrak Pengadaan Jasa ini belum punya jaminan pelaksanaan yang berlaku. Anda tetap bisa melanjutkan; sebaiknya catat jaminannya di panel Jaminan.",
  };
}

/**
 * Peringatan jaminan untuk satu kontrak Aktif.
 *   pendek           = jaminan pelaksanaan berakhir SEBELUM kontrak berakhir (kuning, bukan merah)
 *   perlu-diperbarui = sama, tetapi penyebabnya addendum perpanjangan yang melewati masa jaminan
 *   tanpa-pelaksanaan = Pengadaan Jasa tanpa jaminan pelaksanaan sama sekali
 * Jaminan pelaksanaan yang sudah dikembalikan atau dicairkan tidak dihitung sebagai penutup masa kontrak.
 */
export function peringatanKontrak(k: Kontrak, daftar: readonly Jaminan[], semua: readonly Kontrak[] = [], hari: Ymd = hariWib()): PeringatanJaminan[] {
  if (k.status !== "Aktif" || k.jenis === JENIS_ADDENDUM || k.jenis === JENIS_MOU) return [];
  const hasil: PeringatanJaminan[] = [];
  const pelaksanaan = daftar.filter((j) => j.jenis === "Jaminan Pelaksanaan");
  const penutup = pelaksanaan.filter((j) => j.status === "Aktif" || j.status === "Kedaluwarsa");

  if (adalahJasa(k) && pelaksanaan.length === 0) {
    const p = peringatanAktivasi(k, daftar, hari);
    if (p) hasil.push(p);
  }

  const akhir = akhirKontrak(k, semua);
  const ujung = penutup.reduce<Ymd | null>((m, j) => (j.tanggalBerakhir && (!m || j.tanggalBerakhir > m) ? j.tanggalBerakhir : m), null);
  if (akhir && ujung && ujung < akhir) {
    const asli = k.tanggalBerakhir;
    const karenaAddendum = !!asli && akhir > asli && ujung >= asli;
    hasil.push(
      karenaAddendum
        ? {
            kode: "perlu-diperbarui",
            nada: "kuning",
            teks: `Addendum memperpanjang kontrak sampai ${teksTanggal(akhir)}, tetapi jaminan pelaksanaan hanya berlaku sampai ${teksTanggal(ujung)}. Jaminannya perlu diperbarui.`,
          }
        : {
            kode: "pendek",
            nada: "kuning",
            teks: `Jaminan pelaksanaan berakhir ${teksTanggal(ujung)}, lebih awal daripada kontrak yang berakhir ${teksTanggal(akhir)}.`,
          },
    );
  }
  return hasil;
}

/** Peringatan pendek/perlu-diperbarui untuk semua kontrak Aktif, per ID kontrak. Untuk halaman register. */
export function peringatanSemua(semua: readonly Kontrak[], jaminan: readonly Jaminan[], hari: Ymd = hariWib()): Map<number, PeringatanJaminan[]> {
  const perKontrak = new Map<number, Jaminan[]>();
  for (const j of jaminan) {
    if (j.kontrakId == null) continue;
    const l = perKontrak.get(j.kontrakId) ?? [];
    l.push(j);
    perKontrak.set(j.kontrakId, l);
  }
  const hasil = new Map<number, PeringatanJaminan[]>();
  for (const k of semua) {
    const p = peringatanKontrak(k, perKontrak.get(k.id) ?? [], semua, hari).filter((x) => x.kode !== "tanpa-pelaksanaan");
    if (p.length) hasil.set(k.id, p);
  }
  return hasil;
}

/** Panel jaminan relevan untuk kontrak yang membawa uang atau pekerjaan; NDA, MoU, dan addendum tidak. */
export function panelJaminanRelevan(k: Pick<Kontrak, "jenis" | "status">): boolean {
  if (k.jenis === JENIS_MOU || k.jenis === JENIS_ADDENDUM || k.jenis === "Kerahasiaan (NDA)") return false;
  return k.status !== "Ditolak" && k.status !== "Dibatalkan";
}

// --- Ringkasan, penyaringan, urutan --------------------------------------------------

export interface RingkasanJaminan {
  total: number;
  aktif: number;
  /** Aktif dan berakhir dalam 0 sampai 30 hari. */
  berakhir30: number;
  kedaluwarsa: number;
  /** Jaminan aktif yang paling cepat berakhir (belum lewat). */
  terdekat: Jaminan | null;
  /** Jumlah nilai jaminan aktif per mata uang (tidak dicampur). */
  nilaiAktif: Partial<Record<MataUang, number>>;
}

export function ringkasJaminan(daftar: readonly Jaminan[], hari: Ymd = hariWib()): RingkasanJaminan {
  const r: RingkasanJaminan = { total: daftar.length, aktif: 0, berakhir30: 0, kedaluwarsa: 0, terdekat: null, nilaiAktif: {} };
  for (const j of daftar) {
    const st = statusEfektif(j, hari);
    if (st === "Kedaluwarsa") r.kedaluwarsa++;
    if (st !== "Aktif") continue;
    r.aktif++;
    if (j.nilai != null) r.nilaiAktif[j.mataUang] = (r.nilaiAktif[j.mataUang] ?? 0) + j.nilai;
    const sisa = sisaHariJaminan(j, hari);
    if (sisa != null && sisa <= 30) r.berakhir30++;
    if (sisa != null && (r.terdekat == null || sisa < (sisaHariJaminan(r.terdekat, hari) ?? Infinity))) r.terdekat = j;
  }
  return r;
}

export interface SaringanJaminan {
  jenis?: JenisJaminan | "";
  /** Status efektif: jaminan Aktif yang sudah lewat tanggal muncul sebagai Kedaluwarsa. */
  status?: StatusJaminan | "";
  /** 30 atau 60: hanya yang masih aktif dan berakhir dalam sekian hari. 0 atau kosong berarti tanpa batas. */
  segeraHari?: number;
  kontrakId?: number | null;
  /** Cocokkan nomor, penerbit, atau catatan (huruf besar-kecil diabaikan). */
  cari?: string;
}

export function saringJaminan(daftar: readonly Jaminan[], f: SaringanJaminan, hari: Ymd = hariWib()): Jaminan[] {
  const kata = f.cari?.trim().toLowerCase();
  return daftar.filter((j) => {
    if (f.jenis && j.jenis !== f.jenis) return false;
    if (f.status && statusEfektif(j, hari) !== f.status) return false;
    if (f.kontrakId != null && j.kontrakId !== f.kontrakId) return false;
    if (f.segeraHari) {
      const sisa = sisaHariJaminan(j, hari);
      if (!jaminanBerlaku(j, hari) || sisa == null || sisa > f.segeraHari) return false;
    }
    if (kata && ![j.nomor, j.penerbit, j.catatan].some((v) => v.toLowerCase().includes(kata))) return false;
    return true;
  });
}

/** Kedaluwarsa dan paling mendesak di atas, lalu yang aktif menurut tanggal berakhir, yang sudah selesai di bawah. */
export function urutkanJaminan(daftar: readonly Jaminan[], hari: Ymd = hariWib()): Jaminan[] {
  const peringkat = (j: Jaminan) => {
    const st = statusEfektif(j, hari);
    return st === "Kedaluwarsa" ? 0 : st === "Aktif" ? 1 : 2;
  };
  return [...daftar].sort((a, b) => peringkat(a) - peringkat(b) || (a.tanggalBerakhir ?? "9999").localeCompare(b.tanggalBerakhir ?? "9999") || a.id - b.id);
}

// --- Ekspor CSV -------------------------------------------------------------------

/** Sel berawalan = + - @ (juga tab dan CR) bisa dibaca Excel sebagai rumus, jadi diberi tanda petik di depan. */
export function sanitasiSel(teks: string): string {
  return /^[=+\-@\t\r]/.test(teks) ? `'${teks}` : teks;
}

function sel(v: string | number | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  const aman = sanitasiSel(v);
  return /[;"\r\n]/.test(aman) ? `"${aman.replace(/"/g, '""')}"` : aman;
}

type RujukanKontrak = Pick<Kontrak, "id" | "judul" | "nomorPengajuan" | "nomorKontrak" | "mitra">;

/**
 * CSV dengan pemisah titik koma (Excel berlokal Indonesia membukanya langsung per kolom). Tanpa BOM:
 * penambahan BOM untuk unduhan dilakukan di pemanggil.
 */
export function jaminanKeCsv(daftar: readonly Jaminan[], kontrak: ReadonlyMap<number, RujukanKontrak>, hari: Ymd = hariWib()): string {
  const kepala = ["Nomor Jaminan", "Jenis", "Penerbit", "Nilai", "Mata Uang", "Tanggal Terbit", "Tanggal Berakhir", "Sisa Hari", "Status", "Nomor Pengajuan", "Nomor Kontrak", "Judul Kontrak", "Mitra", "Catatan Risiko"];
  const baris = daftar.map((j) => {
    const k = j.kontrakId != null ? kontrak.get(j.kontrakId) : undefined;
    return [j.nomor, j.jenis, j.penerbit, j.nilai, j.mataUang, j.tanggalTerbit, j.tanggalBerakhir, sisaHariJaminan(j, hari), statusEfektif(j, hari), k?.nomorPengajuan, k?.nomorKontrak, k?.judul, k?.mitra, j.catatan].map(sel).join(";");
  });
  return [kepala.map(sel).join(";"), ...baris].join("\r\n");
}

// --- Flow pengingat -----------------------------------------------------------------

/**
 * Filter OData jaminan Aktif yang berakhir tepat `ambang` hari lagi dari `hari` (30, 14, atau 7).
 * Dipakai flow harian pada list "Jaminan Kontrak". Kolom: StatusJaminan, TanggalBerakhirJaminan, KontrakId, Title (nomor).
 */
export function filterJaminanAmbang(ambang: number, hari: Ymd = hariWib()): string {
  return `fields/StatusJaminan eq 'Aktif' and ${filterTanggalTepat("TanggalBerakhirJaminan", tambahYmd(hari, ambang))}`;
}
