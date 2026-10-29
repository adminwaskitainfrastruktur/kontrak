// Peringatan pengajuan ganda dan tawaran addendum. Murni (tanpa jaringan dan DOM), diuji di scripts/uji-mitra.ts.
//
// Peringatannya LUNAK: hanya menanyakan "sudah pernah diajukan?", tidak pernah memblokir. Penyebab
// terbanyak pengajuan ganda adalah kirim ulang karena koneksi lambat atau lupa sudah mengajukan.
//
// Kerahasiaan: pengaju tidak boleh tahu isi pengajuan divisi lain. Kontrak yang tidak boleh dilihat sesi
// hanya dihitung ("ada pengajuan serupa yang sedang diproses"), tidak pernah dikembalikan sebagai objek.
//
// Berkas ini sengaja tidak mengimpor lib/format agar bisa dijalankan di Node.

import { adalahAddendum } from "./addendum";
import { bisaAjukanAddendum, bisaLihat } from "./alur";
import { kunciMitra } from "./mitra";
import { JENIS_ADDENDUM, STATUS_PROSES, type Kontrak, type Sesi, type Ymd } from "./types";

/** Kontrak Aktif yang berakhir dalam sekian hari ditawari addendum. Sama dengan HARI_PERINGATAN di config. */
export const HARI_TAWARAN_ADDENDUM = 90;
/** Kontrak Aktif yang tanggal berakhirnya baru lewat sekian hari masih ditawari (status sering telat diperbarui). */
export const HARI_TOLERANSI_LEWAT = 30;
/** Judul dianggap mirip bila skor kemiripannya mencapai ini. */
export const SKOR_JUDUL_MIRIP = 0.6;

export interface DrafPengajuan {
  judul: string;
  mitra: string;
  jenis?: string;
  /** Sudah dipilih sebagai addendum atas kontrak ini: tidak perlu ditawari addendum lagi. */
  kontrakIndukId?: number | null;
}

export interface TawaranAddendum {
  induk: Kontrak;
  /** "judul": judul draf menyebut perpanjangan/addendum. "segera-berakhir": kontrak ini berakhir dalam 90 hari. */
  alasan: ("judul" | "segera-berakhir")[];
  /** Hari ke tanggal berakhir yang berlaku (negatif bila sudah lewat), null bila tidak ada tanggal. */
  sisaHari: number | null;
}

export interface HasilGanda {
  /** Pengajuan serupa yang masih diproses dan BOLEH dilihat sesi ini, paling mirip dulu. */
  terlihat: Kontrak[];
  /** Jumlah pengajuan serupa yang tidak boleh dilihat sesi ini (hanya angkanya yang boleh ditampilkan). */
  tersembunyi: number;
  tawaran: TawaranAddendum[];
}

export const adaTemuan = (h: HasilGanda) => h.terlihat.length > 0 || h.tersembunyi > 0 || h.tawaran.length > 0;

// --- Judul ---------------------------------------------------------------------------------

const KATA_UMUM = new Set(["dan", "untuk", "di", "pada", "dengan", "yang", "atau", "ke", "dari", "the", "of", "kontrak", "perjanjian", "tahun"]);

export function tokenJudul(judul: string): string[] {
  return judul
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((t) => t.length > 0 && !KATA_UMUM.has(t));
}

/** Kemiripan dua judul, 0 sampai 1. Kata pembeda (angka, nama barang, tahun) ikut diperhitungkan. */
export function kemiripanJudul(a: string, b: string): number {
  const ta = new Set(tokenJudul(a));
  const tb = new Set(tokenJudul(b));
  if (!ta.size || !tb.size) return 0;
  const irisan = [...ta].filter((t) => tb.has(t)).length;
  const jaccard = irisan / (ta.size + tb.size - irisan);
  // Judul pendek yang "tertelan" judul panjang (mis. tambahan kata "Proyek Tol X") tetap dianggap mirip.
  const tumpang = Math.min(ta.size, tb.size) >= 3 ? (irisan / Math.min(ta.size, tb.size)) * 0.9 : 0;
  const skor = Math.max(jaccard, tumpang);
  // Angka yang berbeda (tahun, termin, nomor paket) biasanya menandai pekerjaan yang berbeda pula.
  const angkaA = [...ta].filter((t) => /^\d+$/.test(t));
  const angkaB = [...tb].filter((t) => /^\d+$/.test(t));
  const angkaBentrok = angkaA.length > 0 && angkaB.length > 0 && !angkaA.some((t) => tb.has(t));
  return angkaBentrok ? skor * 0.7 : skor;
}

/** Judul menyebut perpanjangan, addendum, atau amandemen. */
export const judulMenyebutPerubahan = (judul: string) => /\b(perpanjang\w*|addendum|adendum|amandemen|amendment|renewal)\b/i.test(judul);

// --- Tanggal ----------------------------------------------------------------------------------

const fmtYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
export const hariIniJakarta = (): Ymd => fmtYmd.format(new Date());

const selisih = (ymd: Ymd, hari: Ymd) => Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${hari}T00:00:00Z`)) / 86_400_000);

function akhirBerlaku(k: Kontrak): Ymd | null {
  return k.berakhirEfektif ?? k.tanggalBerakhir;
}

// --- Pencarian -------------------------------------------------------------------------------------

/**
 * Cari pengajuan ganda dan tawaran addendum untuk draf yang akan dikirim.
 * `hari` (YYYY-MM-DD, Jakarta) hanya untuk pengujian.
 */
export function cariPengajuanGanda(draf: DrafPengajuan, semuaKontrak: readonly Kontrak[], sesi: Sesi, hari: Ymd = hariIniJakarta()): HasilGanda {
  const kosong: HasilGanda = { terlihat: [], tersembunyi: 0, tawaran: [] };
  const kunci = kunciMitra(draf.mitra);
  if (!kunci) return kosong;
  const sama = semuaKontrak.filter((k) => kunciMitra(k.mitra) === kunci);

  // 1) Pengajuan serupa yang masih diproses.
  const serupa = sama
    .filter((k) => STATUS_PROSES.includes(k.status))
    .map((k) => ({ k, skor: kemiripanJudul(draf.judul, k.judul) }))
    .filter((x) => x.skor >= SKOR_JUDUL_MIRIP)
    .sort((a, b) => b.skor - a.skor || b.k.dibuat.localeCompare(a.k.dibuat));
  const terlihat = serupa.filter((x) => bisaLihat(x.k, sesi)).map((x) => x.k);

  // 2) Tawaran addendum: hanya untuk draf yang belum berupa addendum.
  let tawaran: TawaranAddendum[] = [];
  const sudahAddendum = draf.jenis === JENIS_ADDENDUM || draf.kontrakIndukId != null;
  if (!sudahAddendum) {
    const menyebut = judulMenyebutPerubahan(draf.judul);
    tawaran = sama
      .filter((k) => k.status === "Aktif" && !adalahAddendum(k) && bisaAjukanAddendum(k, sesi))
      .map((k) => {
        const akhir = akhirBerlaku(k);
        const sisa = akhir ? selisih(akhir, hari) : null;
        const segera = sisa != null && sisa <= HARI_TAWARAN_ADDENDUM && sisa >= -HARI_TOLERANSI_LEWAT;
        const alasan: TawaranAddendum["alasan"] = [...(menyebut ? (["judul"] as const) : []), ...(segera ? (["segera-berakhir"] as const) : [])];
        return { induk: k, alasan, sisaHari: sisa, skor: kemiripanJudul(draf.judul, k.judul) };
      })
      .filter((x) => x.alasan.length > 0)
      .sort((a, b) => b.skor - a.skor || (a.sisaHari ?? 9999) - (b.sisaHari ?? 9999))
      .slice(0, 3)
      .map(({ induk, alasan, sisaHari }) => ({ induk, alasan, sisaHari }));
  }

  return { terlihat, tersembunyi: serupa.length - terlihat.length, tawaran };
}
