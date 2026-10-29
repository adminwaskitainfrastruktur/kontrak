// Aturan nama mitra, saran nama, ringkasan per mitra, dan identitas pihak untuk komparisi. Murni (tanpa
// jaringan dan tanpa DOM) supaya bisa diuji dengan scripts/uji-mitra.ts.
//
// Prinsip: lebih baik TIDAK menyarankan daripada salah menyarankan. Dua nama dianggap sama hanya bila
// kunci normalnya sama; selebihnya hanya "mirip" dan manusia yang memutuskan. Bentuk badan (PT, CV, UD,
// Tbk, ...) selalu ikut dibedakan: "PT ABC" dan "CV ABC" adalah dua badan hukum yang berbeda.
//
// Berkas ini sengaja tidak mengimpor lib/format (yang menyeret config Vite) supaya bisa dijalankan di Node.

import type { Kontrak, Mitra, MataUang, Ymd } from "./types";
import { JENIS_ADDENDUM, MATA_UANG } from "./types";

// --- Normalisasi nama ---------------------------------------------------------------

/** Bentuk badan usaha. Salah satunya menjadi "badan" sebuah nama dan ikut membedakan dua nama. */
const BADAN_UTAMA = new Set(["pt", "cv", "ud", "pd", "fa", "firma", "koperasi", "yayasan", "perum"]);
/** Penanda tambahan di belakang badan. Ikut membedakan, tetapi tidak seberat badan utama. */
const PENANDA = new Set(["tbk", "persero"]);
const KATA_PENGHUBUNG = new Set(["dan", "the", "of"]);

/**
 * Bentuk baku nama mitra untuk dibandingkan: huruf kecil, tanpa aksen dan tanda baca, spasi tunggal.
 * "PT. ABC" dan "PT ABC" sama; "PT ABC" dan "CV ABC" TIDAK sama.
 */
export function kunciMitra(nama: string): string {
  let t = nama
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  t = t
    .replace(/\bperseroan\s+terbatas\b/g, "pt")
    .replace(/\bcommanditaire\s+vennootschap\b/g, "cv")
    .replace(/\bp\s*\.\s*t\b\.?/g, "pt")
    .replace(/\bc\s*\.\s*v\b\.?/g, "cv")
    .replace(/\bt\s*\.\s*b\s*\.\s*k\b\.?/g, "tbk")
    .replace(/&/g, " dan ");
  return t.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const pecah = (kunci: string) => (kunci ? kunci.split(" ") : []);

/** Kata penentu nama, tanpa badan, penanda, dan kata penghubung. */
function tokenInti(kunci: string): string[] {
  return pecah(kunci).filter((t) => !BADAN_UTAMA.has(t) && !PENANDA.has(t) && !KATA_PENGHUBUNG.has(t));
}

function badanDari(kunci: string): string {
  return pecah(kunci).find((t) => BADAN_UTAMA.has(t)) ?? "";
}

function penandaDari(kunci: string): string {
  return pecah(kunci)
    .filter((t) => PENANDA.has(t))
    .sort()
    .join(" ");
}

function bedaSatuHuruf(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [pendek, panjang] = a.length < b.length ? [a, b] : [b, a];
  return pendek.slice(i) === panjang.slice(i + 1);
}

/** Dua kata dianggap sama bila persis, atau salah ketik satu huruf pada kata panjang (>= 6 huruf). */
function samaKata(a: string, b: string): 0 | 0.85 | 1 {
  if (a === b) return 1;
  if (a.length >= 6 && b.length >= 6 && a[0] === b[0] && /^\p{L}+$/u.test(a) && /^\p{L}+$/u.test(b) && bedaSatuHuruf(a, b)) return 0.85;
  return 0;
}

function jaccardToleran(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sisa = [...b];
  let jumlah = 0;
  let pasangan = 0;
  for (const kata of a) {
    let ke = sisa.findIndex((x) => x === kata);
    let bobot: number = 1;
    if (ke < 0) {
      ke = sisa.findIndex((x) => samaKata(kata, x) > 0);
      bobot = 0.85;
    }
    if (ke < 0) continue;
    sisa.splice(ke, 1);
    jumlah += bobot;
    pasangan++;
  }
  return jumlah / (a.length + b.length - pasangan);
}

/** Kemiripan dua nama mitra, 0 sampai 1. 1 hanya bila kunci normalnya sama. */
export function kemiripanNama(a: string, b: string): number {
  const ka = kunciMitra(a);
  const kb = kunciMitra(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const ia = tokenInti(ka);
  const ib = tokenInti(kb);
  if (!ia.length || !ib.length) return 0;

  let skor = jaccardToleran(ia, ib);
  // Kata yang sama tetapi urutannya terbalik biasanya perusahaan lain.
  if (skor === 1 && ia.join(" ") !== ib.join(" ")) skor = 0.7;

  const badanA = badanDari(ka);
  const badanB = badanDari(kb);
  if (badanA && badanB && badanA !== badanB) skor *= 0.5;
  else if (badanA !== badanB) skor *= 0.92;
  if (penandaDari(ka) !== penandaDari(kb)) skor *= 0.92;
  return Math.min(0.99, Math.max(0, skor));
}

// --- Saran nama --------------------------------------------------------------------------

export const MAKS_SARAN = 3;
/** Skor terendah agar sebuah nama layak disarankan. */
export const SKOR_MIN_SARAN = 0.75;

export interface SaranNamaMitra {
  nama: string;
  /** Terisi bila saran berasal dari master Mitra (mitraId bisa diambil dari sini). */
  mitra: Mitra | null;
  sumber: "master" | "kontrak";
  skor: number;
  alasan: "persis" | "awalan" | "mirip";
  /** Jumlah kontrak yang memakai mitra ini. */
  pemakaian: number;
  /** Nama lain di master yang cocok dengan ketikan, bila bukan nama resminya. */
  via: string | null;
}

function tanpaBadanDepan(kunci: string): string {
  const t = pecah(kunci);
  return t.length > 1 && BADAN_UTAMA.has(t[0]!) ? t.slice(1).join(" ") : kunci;
}

/** Skor awalan: ketikan adalah pembuka nama kandidat (mis. "pt abc" untuk "pt abc sejahtera"). 0 bila bukan. */
function skorAwalan(kq: string, kc: string): number {
  const intiQ = tokenInti(kq);
  if (!intiQ.length || intiQ.join("").length < 3) return 0;
  const badanQ = BADAN_UTAMA.has(pecah(kq)[0] ?? "");
  const pembanding = badanQ ? kc : tanpaBadanDepan(kc);
  if (!pembanding.startsWith(kq) || pembanding === kq) return 0;
  const tepiKata = pembanding[kq.length] === " ";
  if (!tepiKata) {
    const kata = pecah(kq);
    const terakhir = kata[kata.length - 1] ?? "";
    if (terakhir.length < 3) return 0;
  }
  const dasar = tepiKata ? 0.9 : 0.8;
  return badanQ ? dasar : dasar - 0.05;
}

interface Kandidat {
  nama: string;
  alias: string[];
  mitra: Mitra | null;
  sumber: "master" | "kontrak";
  pemakaian: number;
}

function nilaiKandidat(kq: string, nama: string, c: Kandidat): { skor: number; alasan: SaranNamaMitra["alasan"]; via: string | null } | null {
  let terbaik: { skor: number; alasan: SaranNamaMitra["alasan"]; via: string | null } | null = null;
  for (const [i, n] of [c.nama, ...c.alias].entries()) {
    const kc = kunciMitra(n);
    if (!kc) continue;
    let skor: number;
    let alasan: SaranNamaMitra["alasan"];
    if (kc === kq) {
      skor = 1;
      alasan = "persis";
    } else if ((skor = skorAwalan(kq, kc)) > 0) {
      alasan = "awalan";
    } else {
      skor = kemiripanNama(nama, n);
      alasan = "mirip";
    }
    if (skor < SKOR_MIN_SARAN) continue;
    if (!terbaik || skor > terbaik.skor) terbaik = { skor, alasan, via: i === 0 ? null : n };
  }
  return terbaik;
}

/** Nama mitra yang paling sering dipakai di kontrak untuk satu kunci (seri: yang terpanjang, lalu abjad). */
function namaPopuler(hitung: Map<string, number>): string {
  return [...hitung.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0], "id"))[0]![0];
}

interface KelompokNamaKontrak {
  kunci: string;
  nama: string;
  varian: string[];
  jumlah: number;
}

/** Kelompokkan nama mitra yang tertulis di kontrak menurut kunciMitra (penulisan berbeda digabung). */
export function kelompokNamaKontrak(kontrak: readonly Kontrak[]): KelompokNamaKontrak[] {
  const peta = new Map<string, Map<string, number>>();
  for (const k of kontrak) {
    const nama = k.mitra.trim();
    const kunci = kunciMitra(nama);
    if (!kunci) continue;
    const hitung = peta.get(kunci) ?? new Map<string, number>();
    hitung.set(nama, (hitung.get(nama) ?? 0) + 1);
    peta.set(kunci, hitung);
  }
  return [...peta.entries()].map(([kunci, hitung]) => ({
    kunci,
    nama: namaPopuler(hitung),
    varian: [...hitung.keys()].sort((a, b) => (hitung.get(b)! - hitung.get(a)!) || a.localeCompare(b, "id")),
    jumlah: [...hitung.values()].reduce((n, x) => n + x, 0),
  }));
}

const adalahAktif = (m: Mitra) => m.aktif !== false;

function kunciMaster(m: Mitra): string[] {
  return [m.nama, ...m.namaLain].map(kunciMitra).filter(Boolean);
}

/** Master aktif yang namanya (atau nama lainnya) sama persis menurut kunciMitra. */
export function cariMitraPersis(nama: string, daftarMitra: readonly Mitra[]): Mitra | null {
  const kunci = kunciMitra(nama);
  if (!kunci) return null;
  return daftarMitra.find((m) => adalahAktif(m) && kunciMaster(m).includes(kunci)) ?? null;
}

/**
 * Saran nama mitra untuk teks yang sedang diketik, dari master (aktif) dan dari nama yang sudah dipakai
 * di kontrak. Maksimal 3, urut skor. Kosong bila tidak ada yang cukup yakin.
 */
export function cariMitraSerupa(nama: string, daftarMitra: readonly Mitra[], kontrak: readonly Kontrak[]): SaranNamaMitra[] {
  const kq = kunciMitra(nama);
  if (kq.length < 3 || !tokenInti(kq).length) return [];

  const kandidat: Kandidat[] = [];
  const kunciTerwakili = new Set<string>();
  const pemakaianKunci = new Map<string, number>();
  for (const k of kontrak) {
    const kunci = kunciMitra(k.mitra);
    if (kunci) pemakaianKunci.set(kunci, (pemakaianKunci.get(kunci) ?? 0) + 1);
  }

  for (const m of daftarMitra) {
    if (!adalahAktif(m)) continue;
    const kunci = kunciMaster(m);
    kunci.forEach((x) => kunciTerwakili.add(x));
    kandidat.push({
      nama: m.nama,
      alias: m.namaLain,
      mitra: m,
      sumber: "master",
      pemakaian: kunci.reduce((n, x) => n + (pemakaianKunci.get(x) ?? 0), 0),
    });
  }
  for (const g of kelompokNamaKontrak(kontrak)) {
    if (kunciTerwakili.has(g.kunci)) continue;
    kandidat.push({ nama: g.nama, alias: [], mitra: null, sumber: "kontrak", pemakaian: g.jumlah });
  }

  const hasil: SaranNamaMitra[] = [];
  for (const c of kandidat) {
    const n = nilaiKandidat(kq, nama, c);
    if (n) hasil.push({ nama: c.nama, mitra: c.mitra, sumber: c.sumber, skor: n.skor, alasan: n.alasan, pemakaian: c.pemakaian, via: n.via });
  }
  return hasil
    .sort((a, b) => b.skor - a.skor || (a.sumber === b.sumber ? 0 : a.sumber === "master" ? -1 : 1) || b.pemakaian - a.pemakaian || a.nama.localeCompare(b.nama, "id"))
    .slice(0, MAKS_SARAN);
}

/** Pilihan untuk <datalist>: nama resmi di master lebih dulu, lalu nama dari kontrak yang paling sering dipakai. */
export function opsiDatalist(daftarMitra: readonly Mitra[], kontrak: readonly Kontrak[], maks = 400): string[] {
  const keluar: string[] = [];
  const terpakai = new Set<string>();
  for (const m of daftarMitra) {
    if (!adalahAktif(m)) continue;
    const kunci = kunciMitra(m.nama);
    if (!kunci || terpakai.has(kunci)) continue;
    kunciMaster(m).forEach((x) => terpakai.add(x));
    keluar.push(m.nama);
  }
  for (const g of kelompokNamaKontrak(kontrak).sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama, "id"))) {
    if (terpakai.has(g.kunci)) continue;
    terpakai.add(g.kunci);
    keluar.push(g.nama);
  }
  return keluar.slice(0, maks);
}

// --- Impor master dari kontrak ----------------------------------------------------------

export interface UsulanImpor {
  kunci: string;
  nama: string;
  /** Penulisan yang ditemukan di kontrak (lebih dari satu bila digabung). */
  varian: string[];
  jumlah: number;
  /** Master yang namanya mirip (bukan sama), untuk diperiksa Legal sebelum menyimpan. */
  mirip: SaranNamaMitra | null;
}

/** Nama mitra unik di kontrak yang belum ada di master (nama resmi maupun nama lain), penulisan berbeda digabung. */
export function usulanImporMitra(daftarMitra: readonly Mitra[], kontrak: readonly Kontrak[]): UsulanImpor[] {
  const ada = new Set(daftarMitra.flatMap(kunciMaster));
  return kelompokNamaKontrak(kontrak)
    .filter((g) => !ada.has(g.kunci))
    .map((g) => ({
      ...g,
      mirip: cariMitraSerupa(g.nama, daftarMitra, []).find((s) => s.alasan !== "persis") ?? null,
    }))
    .sort((a, b) => b.jumlah - a.jumlah || a.nama.localeCompare(b.nama, "id"));
}

// --- Kontrak per mitra ---------------------------------------------------------------------

/** Kontrak dikelompokkan ke master: lewat MitraId bila ada, selain itu lewat kunci nama (nama resmi atau nama lain). */
export function petaKontrakPerMitra(daftarMitra: readonly Mitra[], kontrak: readonly Kontrak[]): Map<number, Kontrak[]> {
  const idAda = new Set(daftarMitra.map((m) => m.id));
  const dariKunci = new Map<string, number>();
  for (const m of daftarMitra) for (const kunci of kunciMaster(m)) if (!dariKunci.has(kunci)) dariKunci.set(kunci, m.id);
  const peta = new Map<number, Kontrak[]>(daftarMitra.map((m) => [m.id, []]));
  for (const k of kontrak) {
    const id = k.mitraId != null && idAda.has(k.mitraId) ? k.mitraId : dariKunci.get(kunciMitra(k.mitra));
    if (id != null) peta.get(id)!.push(k);
  }
  return peta;
}

/** Tanggal berakhir yang berlaku: induk memakai berakhirEfektif (sudah memperhitungkan addendum). */
function akhirKontrak(k: Kontrak): Ymd | null {
  return k.jenis === JENIS_ADDENDUM && k.kontrakIndukId != null ? k.tanggalBerakhir : (k.berakhirEfektif ?? k.tanggalBerakhir);
}

export interface RingkasanMitra {
  jumlah: number;
  aktif: number;
  berjalan: number;
  /** Nilai kontrak yang sedang Aktif, dipisah per mata uang (addendum dihitung sebagai selisih). */
  nilaiAktif: { mataUang: MataUang; nilai: number }[];
  /** Tanggal berakhir paling akhir di antara kontraknya. */
  terakhirBerakhir: Ymd | null;
}

export function ringkasMitra(kontrakMitra: readonly Kontrak[]): RingkasanMitra {
  const jumlahUang = new Map<MataUang, number>();
  let aktif = 0;
  let berjalan = 0;
  let terakhir: Ymd | null = null;
  for (const k of kontrakMitra) {
    if (k.status === "Aktif") {
      aktif++;
      if (k.nilai != null) jumlahUang.set(k.mataUang, (jumlahUang.get(k.mataUang) ?? 0) + k.nilai);
    }
    if (k.status === "Diajukan" || k.status === "Review Legal" || k.status === "Perlu Revisi" || k.status === "Proses Tanda Tangan") berjalan++;
    if (k.status === "Ditolak" || k.status === "Dibatalkan") continue;
    const akhir = akhirKontrak(k);
    if (akhir && (!terakhir || akhir > terakhir)) terakhir = akhir;
  }
  return {
    jumlah: kontrakMitra.length,
    aktif,
    berjalan,
    nilaiAktif: MATA_UANG.filter((u) => jumlahUang.has(u)).map((u) => ({ mataUang: u, nilai: jumlahUang.get(u)! })),
    terakhirBerakhir: terakhir,
  };
}

/** Kontrak LAIN dengan mitra yang sama seperti `k` (menurut MitraId atau kunci nama, termasuk nama lain di master). Terbaru dulu. */
export function kontrakDenganMitra(k: Pick<Kontrak, "id" | "mitra" | "mitraId">, semua: readonly Kontrak[], daftarMitra: readonly Mitra[]): Kontrak[] {
  const kunciSaya = kunciMitra(k.mitra);
  const master = daftarMitra.find((m) => (k.mitraId != null && m.id === k.mitraId) || (kunciSaya && kunciMaster(m).includes(kunciSaya)));
  const kunci = new Set<string>(master ? kunciMaster(master) : []);
  if (kunciSaya) kunci.add(kunciSaya);
  const idMitra = k.mitraId ?? master?.id ?? null;
  return semua
    .filter((x) => x.id !== k.id && ((idMitra != null && x.mitraId === idMitra) || kunci.has(kunciMitra(x.mitra))))
    .sort((a, b) => b.dibuat.localeCompare(a.dibuat));
}

// --- Identitas pihak ---------------------------------------------------------------------

export interface PihakKontrak {
  nama: string;
  npwp: string;
  alamat: string;
  penandatangan: string;
  jabatan: string;
  dasarKewenangan: string;
}

export const pihakDariKontrak = (k: Pick<Kontrak, "mitra" | "npwpMitra" | "alamatMitra" | "penandatanganMitra" | "jabatanMitra" | "dasarKewenangan">): PihakKontrak => ({
  nama: k.mitra,
  npwp: k.npwpMitra,
  alamat: k.alamatMitra,
  penandatangan: k.penandatanganMitra,
  jabatan: k.jabatanMitra,
  dasarKewenangan: k.dasarKewenangan,
});

export const pihakKosong = (p: PihakKontrak) => !(p.npwp.trim() || p.alamat.trim() || p.penandatangan.trim() || p.jabatan.trim() || p.dasarKewenangan.trim());

export interface HasilNpwp {
  sah: boolean;
  digit: string;
  pesan: string;
}

/** NPWP lama 15 digit atau NPWP baru 16 digit. Titik, strip, dan spasi diabaikan. Kosong dianggap sah (tidak wajib). */
export function validasiNpwp(teks: string): HasilNpwp {
  const t = teks.trim();
  if (!t) return { sah: true, digit: "", pesan: "" };
  if (!/^[\d.\-\s]+$/.test(t)) return { sah: false, digit: "", pesan: "NPWP hanya boleh berisi angka, titik, dan strip." };
  const digit = t.replace(/\D/g, "");
  if (digit.length !== 15 && digit.length !== 16) return { sah: false, digit, pesan: `NPWP harus 15 atau 16 digit (sekarang ${digit.length}).` };
  if (/^(\d)\1+$/.test(digit)) return { sah: false, digit, pesan: "NPWP tidak boleh berisi satu angka yang sama saja." };
  return { sah: true, digit, pesan: "" };
}

/** 15 digit: 01.234.567.8-901.234. 16 digit: ditulis polos. Selain itu dikembalikan apa adanya. */
export function formatNpwp(teks: string): string {
  const v = validasiNpwp(teks);
  if (!v.sah || !v.digit) return teks.trim();
  const d = v.digit;
  return d.length === 15 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}.${d[8]}-${d.slice(9, 12)}.${d.slice(12)}` : d;
}

/** Bagian komparisi yang masih kosong. */
export function kurangKomparisi(p: PihakKontrak): string[] {
  const kurang: string[] = [];
  if (!p.nama.trim()) kurang.push("nama mitra");
  if (!p.alamat.trim()) kurang.push("alamat");
  if (!p.penandatangan.trim()) kurang.push("nama penandatangan");
  if (!p.jabatan.trim()) kurang.push("jabatan");
  return kurang;
}

/**
 * Teks komparisi siap tempel ke draf perjanjian:
 * "PT ..., beralamat di ..., NPWP ..., dalam hal ini diwakili oleh ..., selaku ..., berdasarkan ...".
 * Bagian wajib yang kosong ditandai [..., belum diisi] supaya tidak terlewat saat ditempel.
 */
export function teksKomparisi(p: PihakKontrak): string {
  const bagian = [
    p.nama.trim() || "[nama mitra belum diisi]",
    `beralamat di ${p.alamat.trim() || "[alamat belum diisi]"}`,
    p.npwp.trim() ? `NPWP ${formatNpwp(p.npwp)}` : "",
    `dalam hal ini diwakili oleh ${p.penandatangan.trim() || "[nama penandatangan belum diisi]"}`,
    `selaku ${p.jabatan.trim() || "[jabatan belum diisi]"}`,
    p.dasarKewenangan.trim() ? `berdasarkan ${p.dasarKewenangan.trim()}` : "",
  ];
  return bagian.filter(Boolean).join(", ");
}

export interface UsulanIdentitas {
  pihak: PihakKontrak;
  sumber: "kontrak" | "master";
  /** Kontrak yang disalin, bila sumbernya kontrak. */
  dari: Kontrak | null;
}

/**
 * Identitas pihak yang diusulkan untuk kontrak `k`: dari kontrak TERAKHIR dengan mitra yang sama yang
 * identitasnya terisi; bila belum ada, dari master. NPWP dan alamat yang kosong di kontrak itu dilengkapi
 * dari master (data stabil); penandatangan dan jabatan tidak, karena bisa berganti. null bila tidak ada bahan.
 */
export function usulanIdentitas(k: Pick<Kontrak, "id" | "mitra" | "mitraId">, semua: readonly Kontrak[], daftarMitra: readonly Mitra[]): UsulanIdentitas | null {
  const kunciSaya = kunciMitra(k.mitra);
  const master = daftarMitra.find((m) => (k.mitraId != null && m.id === k.mitraId) || (kunciSaya && kunciMaster(m).includes(kunciSaya))) ?? null;
  const rujukan = kontrakDenganMitra(k, semua, daftarMitra).find((x) => !pihakKosong(pihakDariKontrak(x)));

  if (rujukan) {
    const p = pihakDariKontrak(rujukan);
    return {
      pihak: { ...p, nama: k.mitra, npwp: p.npwp || master?.npwp || "", alamat: p.alamat || master?.alamat || "" },
      sumber: "kontrak",
      dari: rujukan,
    };
  }
  if (master && (master.npwp || master.alamat || master.penandatangan || master.jabatan)) {
    return { pihak: { nama: k.mitra, npwp: master.npwp, alamat: master.alamat, penandatangan: master.penandatangan, jabatan: master.jabatan, dasarKewenangan: "" }, sumber: "master", dari: null };
  }
  return null;
}
