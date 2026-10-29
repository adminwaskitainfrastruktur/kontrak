// "Pihak lain dan perannya" (U11): pihak di luar WKI dan mitra utama yang ikut dalam kontrak, mis. penjamin,
// anggota KSO, pemberi kerja, atau subkontraktor yang disebut. Disimpan per kontrak sebagai JSON di satu kolom
// teks (PihakLain), karena jumlahnya kecil dan hanya dibaca di halaman detail.
//
// Modul ini murni sehingga teruji lewat scripts/uji-pihak-lain.ts.

export interface PihakLain {
  nama: string;
  peran: string;
}

/** Usulan peran (standar awal, bisa diketik bebas). */
export const PERAN_PIHAK_USULAN = ["Penjamin", "Anggota KSO / konsorsium", "Pemberi kerja", "Subkontraktor", "Pemberi kuasa", "Penerima kuasa", "Pihak terkait"] as const;

export const MAKS_PIHAK_LAIN = 10;
const MAKS_NAMA = 150;
const MAKS_PERAN = 80;

const teks = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** Isi kolom PihakLain (JSON {v, pihak} atau larik) -> daftar yang rapi. Tidak pernah melempar. */
export function uraiPihakLain(v: unknown): PihakLain[] {
  let j: unknown = v;
  if (typeof v === "string") {
    if (!v.trim()) return [];
    try {
      j = JSON.parse(v);
    } catch {
      return [];
    }
  }
  const daftar = Array.isArray(j) ? j : j && typeof j === "object" && Array.isArray((j as { pihak?: unknown }).pihak) ? (j as { pihak: unknown[] }).pihak : [];
  return daftar
    .map((x) => (x && typeof x === "object" ? { nama: teks((x as PihakLain).nama).slice(0, MAKS_NAMA), peran: teks((x as PihakLain).peran).slice(0, MAKS_PERAN) } : null))
    .filter((x): x is PihakLain => !!x && !!x.nama)
    .slice(0, MAKS_PIHAK_LAIN);
}

/** Daftar -> teks JSON berversi untuk disimpan; daftar kosong menjadi teks kosong. */
export function bungkusPihakLain(daftar: readonly PihakLain[]): string {
  const rapi = rapikanPihakLain(daftar);
  return rapi.length ? JSON.stringify({ v: 1, pihak: rapi }) : "";
}

/** Buang baris kosong dan rapikan spasi. Baris yang hanya berisi peran (tanpa nama) dibuang. */
export function rapikanPihakLain(daftar: readonly PihakLain[]): PihakLain[] {
  return daftar.map((p) => ({ nama: teks(p.nama), peran: teks(p.peran) })).filter((p) => p.nama);
}

/** Pesan galat pertama untuk formulir, atau null bila sah. */
export function validasiPihakLain(daftar: readonly PihakLain[]): string | null {
  const rapi = rapikanPihakLain(daftar);
  if (daftar.some((p) => !teks(p.nama) && teks(p.peran))) return "Ada peran tanpa nama pihak. Isi namanya atau hapus barisnya.";
  if (rapi.length > MAKS_PIHAK_LAIN) return `Paling banyak ${MAKS_PIHAK_LAIN} pihak.`;
  const panjang = rapi.find((p) => p.nama.length > MAKS_NAMA || p.peran.length > MAKS_PERAN);
  if (panjang) return `Nama paling panjang ${MAKS_NAMA} karakter dan peran ${MAKS_PERAN} karakter.`;
  const kunci = rapi.map((p) => p.nama.toLowerCase());
  const ganda = kunci.find((x, i) => kunci.indexOf(x) !== i);
  if (ganda) return `"${rapi[kunci.indexOf(ganda)]!.nama}" tercantum dua kali.`;
  return null;
}

/** "PT A (Penjamin); PT B" untuk riwayat dan ringkasan. */
export function teksPihakLain(daftar: readonly PihakLain[]): string {
  const rapi = rapikanPihakLain(daftar);
  return rapi.length ? rapi.map((p) => (p.peran ? `${p.nama} (${p.peran})` : p.nama)).join("; ") : "-";
}

export function samaPihakLain(a: readonly PihakLain[], b: readonly PihakLain[]): boolean {
  return bungkusPihakLain(a) === bungkusPihakLain(b);
}
