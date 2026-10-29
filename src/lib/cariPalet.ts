// Pencocokan kontrak di palet Ctrl+K: judul, nomor pengajuan/kontrak, mitra, nomor referensi pengadaan
// (PR/PO/SPK, boleh lebih dari satu dipisah koma) dan kode proyek (U12). Logika murni supaya bisa diuji.
//
// Nomor referensi dan proyek juga dicocokkan dalam bentuk "rapat" (tanpa spasi, tanda hubung, garis
// miring, titik), jadi "po4500123" menemukan "PO-4500/123" dan sebaliknya.
import type { Kontrak } from "./types";

export type AlasanCocok = "nomor" | "judul" | "mitra" | "referensi" | "proyek";

export interface CocokPalet {
  lewat: AlasanCocok;
  /** Nilai yang cocok (mis. satu nomor PO dari beberapa), untuk ditampilkan di baris hasil. */
  nilai: string;
  /** 0 = sama persis, 1 = diawali kata kunci, 2 = memuat kata kunci. Makin kecil makin di atas. */
  skor: number;
}

const kecil = (t: string) => t.trim().toLowerCase();
/** Huruf dan angka saja, huruf kecil: pembanding nomor yang ditulis dengan pemisah berbeda. */
export const rapat = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Pecah kolom NomorReferensi ("PR-12, PO-4500123; SPK 7") menjadi nomor satuan. */
export function pecahReferensi(nilai: string): string[] {
  return nilai
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function nilaiSkor(nilai: string, kata: string, pakaiRapat: boolean): number | null {
  const v = kecil(nilai);
  if (!v) return null;
  if (v === kata) return 0;
  if (v.startsWith(kata)) return 1;
  if (v.includes(kata)) return 2;
  if (!pakaiRapat) return null;
  const r = rapat(kata);
  if (r.length < 3) return null;
  const vr = rapat(v);
  if (vr === r) return 0;
  if (vr.startsWith(r)) return 1;
  if (vr.includes(r)) return 2;
  return null;
}

/**
 * Cocokkan satu kontrak dengan kata kunci palet. null bila tidak cocok. Kata kunci kosong selalu
 * cocok sebagai "judul" (daftar terbaru tanpa saringan).
 */
export function cocokKontrakPalet(k: Kontrak, kataMentah: string): CocokPalet | null {
  const kata = kecil(kataMentah);
  if (!kata) return { lewat: "judul", nilai: k.judul, skor: 2 };
  const kandidat: CocokPalet[] = [];
  const coba = (lewat: AlasanCocok, nilai: string, pakaiRapat = false) => {
    const skor = nilaiSkor(nilai, kata, pakaiRapat);
    if (skor != null) kandidat.push({ lewat, nilai: nilai.trim(), skor });
  };
  coba("nomor", k.nomorPengajuan, true);
  coba("nomor", k.nomorKontrak, true);
  for (const ref of pecahReferensi(k.nomorReferensi ?? "")) coba("referensi", ref, true);
  coba("proyek", k.kodeProyek ?? "", true);
  coba("judul", k.judul);
  coba("mitra", k.mitra);
  if (!kandidat.length) return null;
  // Skor terbaik; bila seri, urutan di atas (nomor, referensi, proyek, judul, mitra) yang menang.
  return kandidat.reduce((a, b) => (b.skor < a.skor ? b : a));
}

/** Saring dan urutkan kontrak untuk palet: yang paling cocok dulu, lalu urutan asal (terbaru). */
export function cariKontrakPalet(kontrak: readonly Kontrak[], kata: string, maks: number): { k: Kontrak; cocok: CocokPalet }[] {
  const hasil: { k: Kontrak; cocok: CocokPalet; i: number }[] = [];
  kontrak.forEach((k, i) => {
    const cocok = cocokKontrakPalet(k, kata);
    if (cocok) hasil.push({ k, cocok, i });
  });
  return hasil
    .sort((a, b) => a.cocok.skor - b.cocok.skor || a.i - b.i)
    .slice(0, maks)
    .map(({ k, cocok }) => ({ k, cocok }));
}

/** Keterangan tambahan di baris hasil bila yang cocok bukan judul (mis. "PO-4500123", "Proyek Tol Kayu Agung"). */
export function keteranganCocok(c: CocokPalet): string | null {
  if (c.lewat === "referensi") return `Ref. ${c.nilai}`;
  if (c.lewat === "proyek") return `Proyek ${c.nilai}`;
  return null;
}
