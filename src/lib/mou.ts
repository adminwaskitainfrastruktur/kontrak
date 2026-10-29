// Aturan MoU (Memorandum of Understanding / Nota Kesepahaman).
//
// MoU adalah perjanjian yang tidak bernilai: ia mengikat para pihak untuk bekerja sama, sedangkan nilai
// dan rincian pekerjaan baru muncul di kontrak pelaksananya. Karena itu:
//   - MoU tidak punya nilai kontrak (pertanyaan dan kolom nilai disembunyikan, ditampilkan "Tanpa nilai").
//   - MoU tetap punya masa berlaku, PIC Legal, dokumen, dan bisa diperpanjang lewat addendum.
//   - Kontrak pelaksana (kontrak turunan) diajukan terpisah dan menaut ke MoU lewat MouAcuanId.
import { formatUang } from "./format";
import { JENIS_ADDENDUM, JENIS_MOU, type Kontrak } from "./types";

export const adalahMou = (k: Pick<Kontrak, "jenis">) => k.jenis === JENIS_MOU;

/** Kontrak turunan sebuah MoU (bukan addendum), terbaru di atas. */
export function turunanMou(mou: Kontrak, semua: Kontrak[]): Kontrak[] {
  return semua.filter((k) => k.mouAcuanId === mou.id && k.jenis !== JENIS_ADDENDUM).sort((a, b) => b.dibuat.localeCompare(a.dibuat));
}

/** MoU yang bisa dijadikan dasar kontrak turunan: yang sedang berlaku (Aktif). */
export const daftarMouAktif = (semua: Kontrak[]) => semua.filter((k) => adalahMou(k) && k.status === "Aktif");

/** Teks nilai yang sesuai jenisnya: MoU "Tanpa nilai", addendum tanpa selisih "Tidak mengubah nilai". */
export function teksNilai(k: Kontrak): string {
  if (k.nilai == null) {
    if (adalahMou(k)) return "Tanpa nilai";
    if (k.jenis === JENIS_ADDENDUM) return "Tidak mengubah nilai";
  }
  return formatUang(k.nilai, k.mataUang);
}
