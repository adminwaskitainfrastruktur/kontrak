// Aturan isian pengajuan yang dipakai bersama chat (ChatAjukan) dan formulir (FormKontrak).
// Murni (tanpa React dan jaringan) supaya teruji di scripts/uji-isian-pengajuan.ts.
//
//   - Proyek dan nomor referensi PR/PO/SPK (U12): perapian, pilihan "Kantor pusat / bukan proyek",
//     dan saran kode proyek dari kontrak yang boleh dilihat pengaju.
//   - Pewarisan dari kontrak induk atau MoU/payung (U10, U12, U29A): mitra, divisi, proyek, referensi,
//     dan mata uang addendum yang dikunci sama dengan induk.
//   - Galat per isian formulir (U40), termasuk nomor kontrak ganda (U20) dan pernyataan
//     "sisanya menyusul" untuk dokumen wajib (U13).
import { addendumBedaMataUang } from "./addendum";
import { daftarProyek } from "./filterKerja";
import { bacaNilai } from "./format";
import { JENIS_ADDENDUM, type JenisKontrak, type Kontrak, type MataUang } from "./types";

// --- Proyek dan nomor referensi --------------------------------------------------------------

/**
 * Nilai kolom KodeProyek untuk kontrak kantor pusat / bukan proyek. Standar awal: disimpan sebagai teks
 * tetap supaya bisa dibedakan dari "belum diisi" (kolom kosong = "Tanpa proyek" di filter Daftar).
 */
export const PROYEK_KANTOR_PUSAT = "Kantor Pusat";
/** Label pilihan di chat dan formulir. */
export const LABEL_KANTOR_PUSAT = "Kantor pusat / bukan proyek";

const rapiSpasi = (v: string) => v.trim().replace(/\s+/g, " ");

/** Rapikan kode proyek. Tulisan "kantor pusat" atau "bukan proyek" (huruf apa pun) disamakan ke PROYEK_KANTOR_PUSAT. */
export function rapikanProyek(teks: string): string {
  const v = rapiSpasi(teks);
  if (!v) return "";
  const kecil = v.toLowerCase();
  if (kecil === PROYEK_KANTOR_PUSAT.toLowerCase() || kecil === LABEL_KANTOR_PUSAT.toLowerCase() || kecil === "bukan proyek" || kecil === "kantor pusat/bukan proyek") return PROYEK_KANTOR_PUSAT;
  return v;
}

export const adalahKantorPusat = (kodeProyek: string) => rapikanProyek(kodeProyek) === PROYEK_KANTOR_PUSAT;

/**
 * Rapikan nomor referensi PR/PO/SPK: dipisah koma (titik koma dan baris baru juga diterima), spasi
 * dirapikan, nomor yang sama (tanpa membedakan huruf besar) hanya sekali. Hasilnya "PO-1, PO-2".
 */
export function rapikanReferensi(teks: string): string {
  const lihat = new Set<string>();
  const hasil: string[] = [];
  for (const bagian of teks.split(/[,;\n]+/)) {
    const v = rapiSpasi(bagian);
    if (!v || lihat.has(v.toLowerCase())) continue;
    lihat.add(v.toLowerCase());
    hasil.push(v);
  }
  return hasil.join(", ");
}

/**
 * Saran kode proyek untuk datalist: kode yang sudah dipakai di kontrak yang boleh dilihat pengaju
 * (pemanggil yang menyaring dengan bisaLihat), ditambah "Kantor Pusat" di urutan pertama.
 */
export function saranProyek(kontrakTerlihat: readonly Kontrak[]): string[] {
  return [PROYEK_KANTOR_PUSAT, ...daftarProyek(kontrakTerlihat).filter((p) => p.toLowerCase() !== PROYEK_KANTOR_PUSAT.toLowerCase())];
}

/**
 * Kode proyek yang terakhir dipakai pengaju ini (terbaru dulu, unik tanpa membedakan huruf besar, tanpa
 * Kantor Pusat yang sudah punya tombol sendiri), untuk tombol cepat di chat.
 */
export function proyekTerakhir(kontrak: readonly Pick<Kontrak, "kodeProyek" | "pengajuEmail" | "dibuat">[], email: string, batas = 3): string[] {
  const e = email.trim().toLowerCase();
  const lihat = new Set<string>();
  const hasil: string[] = [];
  for (const k of [...kontrak].filter((x) => x.pengajuEmail.toLowerCase() === e).sort((a, b) => b.dibuat.localeCompare(a.dibuat))) {
    const p = rapikanProyek(k.kodeProyek);
    if (!p || p === PROYEK_KANTOR_PUSAT || lihat.has(p.toLowerCase())) continue;
    lihat.add(p.toLowerCase());
    hasil.push(p);
    if (hasil.length >= batas) break;
  }
  return hasil;
}

/** Ringkasan satu baris untuk ringkasan chat: "TOL-X · PO-1, PO-2", "Kantor pusat · referensi menyusul", "Menyusul". */
export function teksProyekReferensi(d: { kodeProyek: string; nomorReferensi: string }): string {
  const proyek = rapikanProyek(d.kodeProyek);
  const ref = rapikanReferensi(d.nomorReferensi);
  if (!proyek && !ref) return "Menyusul";
  const bagianProyek = !proyek ? "Proyek menyusul" : proyek === PROYEK_KANTOR_PUSAT ? "Kantor pusat" : `Proyek ${proyek}`;
  return `${bagianProyek} · ${ref ? `Ref. ${ref}` : "referensi menyusul"}`;
}

// --- Pewarisan dari induk / MoU --------------------------------------------------------------

/** Kontrak acuan: induk addendum, atau MoU/payung untuk kontrak turunan. */
export type Acuan = Pick<Kontrak, "mitra" | "mitraId" | "divisi" | "mataUang" | "kodeProyek" | "nomorReferensi">;

export interface IsianWarisan {
  mitra: string;
  mitraId: number | null;
  divisi?: Kontrak["divisi"];
  mataUang?: MataUang;
  kodeProyek?: string;
  nomorReferensi?: string;
}

/**
 * Isian yang diwarisi dari acuan yang baru dipilih. Mitra selalu ikut (sama seperti sebelumnya); divisi hanya
 * bila pengaju boleh memilih divisi; mata uang hanya untuk addendum (dikunci sama dengan induk).
 * Proyek dan referensi hanya mengisi isian yang masih kosong atau yang isinya warisan dari acuan sebelumnya
 * (`acuanLama`), jadi ketikan pengaju sendiri tidak pernah tertimpa diam-diam.
 */
export function warisanAcuan(
  acuan: Acuan,
  kini: { kodeProyek: string; nomorReferensi: string },
  opsi: { divisi: boolean; addendum: boolean; acuanLama?: Pick<Acuan, "kodeProyek" | "nomorReferensi"> | null },
): IsianWarisan {
  const hasil: IsianWarisan = { mitra: acuan.mitra, mitraId: acuan.mitraId };
  if (opsi.divisi) hasil.divisi = acuan.divisi;
  if (opsi.addendum) hasil.mataUang = acuan.mataUang;
  // Isian kosong diisi dari acuan; isian yang sama dengan warisan acuan lama diganti (boleh menjadi kosong,
  // supaya proyek acuan lama tidak tertinggal). Isian ketikan pengaju sendiri dibiarkan.
  const isi = (nilaiKini: string, nilaiLama: string | undefined, nilaiBaru: string): string | undefined => {
    if (!nilaiKini.trim()) return nilaiBaru || undefined;
    const warisanLama = nilaiLama != null && nilaiLama.trim() !== "" && nilaiKini.trim() === nilaiLama.trim();
    return warisanLama ? nilaiBaru : undefined;
  };
  const proyek = isi(kini.kodeProyek, opsi.acuanLama?.kodeProyek, rapikanProyek(acuan.kodeProyek));
  if (proyek !== undefined) hasil.kodeProyek = proyek;
  const ref = isi(kini.nomorReferensi, opsi.acuanLama?.nomorReferensi, rapikanReferensi(acuan.nomorReferensi));
  if (ref !== undefined) hasil.nomorReferensi = ref;
  return hasil;
}

// --- Mata uang addendum (U29A) ---------------------------------------------------------------

/** Mata uang yang wajib dipakai: sama dengan induk untuk addendum yang induknya diketahui; selain itu bebas (null). */
export function mataUangTerkunci(jenis: JenisKontrak, induk: Pick<Kontrak, "mataUang"> | null | undefined): MataUang | null {
  return jenis === JENIS_ADDENDUM && induk ? induk.mataUang : null;
}

/**
 * Peringatan mata uang untuk addendum dari `induk`:
 *   - addendum ini sendiri (data lama) memakai mata uang berbeda dari induk;
 *   - addendum lain dari induk yang sama memakai mata uang berbeda (nilainya tidak ikut dijumlahkan).
 * Kosong bila semuanya sama.
 */
export function catatanMataUangAddendum(induk: Kontrak, semua: readonly Kontrak[], opsi: { mataUangKini?: MataUang | null; kecualiId?: number | null } = {}): string[] {
  const catatan: string[] = [];
  if (opsi.mataUangKini && opsi.mataUangKini !== induk.mataUang) {
    catatan.push(`Mata uang addendum ini (${opsi.mataUangKini}) berbeda dari kontrak induk (${induk.mataUang}), jadi nilainya tidak ikut dijumlahkan ke nilai induk. Samakan dengan induk bila tidak ada alasan khusus.`);
  }
  const lain = addendumBedaMataUang(semua).filter((a) => a.kontrakIndukId === induk.id && a.id !== opsi.kecualiId);
  if (lain.length) {
    const daftar = lain.map((a) => `${a.nomorKontrak || a.nomorPengajuan} (${a.mataUang})`).join(", ");
    catatan.push(`${lain.length === 1 ? "Addendum lama" : `${lain.length} addendum lama`} dari kontrak ini memakai mata uang berbeda: ${daftar}. Nilainya tidak ikut dijumlahkan; Legal akan merapikannya.`);
  }
  return catatan;
}

// --- Galat per isian formulir (U40) ----------------------------------------------------------

export type KunciGalatForm = "judul" | "mitra" | "nilai" | "plafon" | "tanggalBerakhir" | "kontrakIndukId" | "nomorKontrak" | "susulan";
export type GalatForm = Partial<Record<KunciGalatForm, string>>;

/** Urutan isian di formulir; dipakai untuk memfokuskan galat pertama. */
export const URUTAN_GALAT_FORM: readonly KunciGalatForm[] = ["judul", "kontrakIndukId", "mitra", "nilai", "tanggalBerakhir", "nomorKontrak", "plafon", "susulan"];

export interface IsianDiperiksa {
  judul: string;
  jenis: JenisKontrak;
  mitra: string;
  /** Teks nilai seperti yang diketik. */
  nilai: string;
  plafon: string;
  tanggalMulai: string | null;
  tanggalBerakhir: string | null;
  kontrakIndukId: number | null;
}

/**
 * Periksa isian formulir pengajuan/ubah. Pesannya ramah dan menjelaskan cara memperbaiki.
 * `nomorGanda` berisi kontrak lain yang sudah memakai nomor kontrak yang diketik (cekNomorGanda).
 * `kurangWajib` > 0 dan `susulan` false berarti pengaju belum menyatakan dokumen wajib menyusul.
 * `judulLama` (formulir ubah): judul yang tidak diubah tidak terkena batas panjang minimal.
 */
export function periksaIsianForm(
  f: IsianDiperiksa,
  opsi: { isianLegal?: boolean; nomorGanda?: readonly Pick<Kontrak, "nomorPengajuan">[]; kurangWajib?: number; susulan?: boolean; judulLama?: string } = {},
): GalatForm {
  const g: GalatForm = {};
  const judul = f.judul.trim();
  if (!judul) g.judul = "Judul kontrak wajib diisi.";
  // Batas 5 karakter sama dengan chat; judul lama yang tidak diubah tidak diperiksa supaya data lama tetap bisa disimpan.
  else if (judul.length < 5 && judul !== (opsi.judulLama ?? "").trim()) g.judul = "Judulnya masih terlalu singkat. Tuliskan minimal 5 karakter.";
  if (f.mitra.trim().length < 2) g.mitra = "Nama mitra atau vendor wajib diisi.";
  if (f.jenis === JENIS_ADDENDUM && !f.kontrakIndukId) g.kontrakIndukId = "Pilih kontrak induk yang diubah oleh addendum ini.";
  const nilai = bacaNilai(f.nilai);
  if (nilai != null && Number.isNaN(nilai)) g.nilai = "Nilainya belum terbaca. Tulis angka saja, contoh 1.250.000.000.";
  else if (nilai != null && nilai < 0 && f.jenis !== JENIS_ADDENDUM) g.nilai = "Nilai kontrak tidak boleh negatif. Tanda minus hanya untuk pengurangan nilai di addendum.";
  if (opsi.isianLegal) {
    const plafon = bacaNilai(f.plafon);
    if (plafon != null && (Number.isNaN(plafon) || plafon < 0)) g.plafon = "Plafon belum terbaca. Tulis angka saja, atau kosongkan bila bukan kontrak payung.";
  }
  if (f.tanggalMulai && f.tanggalBerakhir && f.tanggalBerakhir < f.tanggalMulai) g.tanggalBerakhir = "Tanggal berakhir tidak boleh sebelum tanggal mulai.";
  if (opsi.nomorGanda?.length) g.nomorKontrak = `Nomor ini sudah dipakai ${opsi.nomorGanda.map((k) => k.nomorPengajuan).join(", ")}. Ganti dengan nomor lain.`;
  if ((opsi.kurangWajib ?? 0) > 0 && !opsi.susulan) g.susulan = "Lampirkan dokumen wajibnya, atau centang pernyataan bahwa dokumen itu akan menyusul.";
  return g;
}

/** Kunci galat pertama menurut urutan isian di formulir, atau null bila tidak ada galat. */
export function galatPertama(g: GalatForm): KunciGalatForm | null {
  return URUTAN_GALAT_FORM.find((k) => g[k]) ?? null;
}
