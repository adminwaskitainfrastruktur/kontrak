// Pengurai teks dokumen perjanjian berbahasa Indonesia: nilai rupiah, tanggal, jangka waktu, nama pihak (komparisi),
// nomor perjanjian, judul, dan jenis. Murni dan tanpa dependensi (hanya tipe), jadi bisa diuji lewat Node.
//
// Prinsip: setiap hasil membawa tingkat keyakinan dan potongan teks sumbernya, supaya manusia bisa memeriksa. Parser
// ini sengaja berbasis aturan dan konservatif; ia memberi SARAN, tidak pernah memutuskan.
import { bacaTerbilang } from "./terbilang";
import type { JenisKontrak, MataUang, Ymd } from "./types";

export type Keyakinan = "tinggi" | "sedang" | "rendah";

export interface Temuan<T> {
  nilai: T;
  keyakinan: Keyakinan;
  /** Potongan teks asli di sekitar temuan, sudah dirapikan menjadi satu baris. */
  sumber: string;
  /** Indeks awal temuan pada teks masukan. */
  posisi: number;
  catatan?: string;
}

// --- Alat bantu teks -------------------------------------------------------------

/** Rapikan keluaran ekstraksi: spasi tak putus, tab, spasi ganda, baris kosong berlebih. Baris baru dipertahankan. */
export function rapikanTeks(teks: string): string {
  return teks
    .replace(/\r\n?/g, "\n")
    .replace(/[   \t]/g, " ")
    .replace(/[​-‍﻿­]/g, "")
    .replace(/[ ]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Semua spasi dan baris baru menjadi satu spasi: dasar pencocokan pola yang melintasi baris. */
export function ratakan(teks: string): string {
  return teks.replace(/\s+/g, " ").trim();
}

/** Potongan teks di sekitar [awal, akhir) untuk ditampilkan sebagai bukti. */
export function potongan(teks: string, awal: number, akhir: number, lebar = 40): string {
  const a = Math.max(0, awal - lebar);
  const b = Math.min(teks.length, akhir + lebar);
  const isi = ratakan(teks.slice(a, b));
  return `${a > 0 ? "…" : ""}${isi}${b < teks.length ? "…" : ""}`;
}

/** Teks tepat sebelum `posisi`, untuk membaca konteks (kata kunci di depan sebuah angka atau tanggal). */
export function konteksSebelum(teks: string, posisi: number, lebar = 80): string {
  return ratakan(teks.slice(Math.max(0, posisi - lebar), posisi));
}

const naik = (k: Keyakinan): Keyakinan => (k === "rendah" ? "sedang" : "tinggi");
const turun = (k: Keyakinan): Keyakinan => (k === "tinggi" ? "sedang" : "rendah");

function tumpangTindih(a: [number, number], b: [number, number]) {
  return a[0] < b[1] && b[0] < a[1];
}

// --- Nilai rupiah ---------------------------------------------------------------

const SKALA_UANG: Record<string, number> = { triliun: 1e12, miliar: 1e9, milyar: 1e9, juta: 1e6, jt: 1e6, ribu: 1e3 };

const MATA_UANG_AWALAN: Record<string, MataUang> = { rp: "IDR", idr: "IDR", usd: "USD", "us$": "USD", eur: "EUR", sgd: "SGD", "s$": "SGD" };

/**
 * Baca angka berformat Indonesia atau Inggris: "1.250.000.000", "1.250.000,50", "1,25", "1,000,000.50", "75000000".
 * Mengembalikan null bila bentuknya tidak masuk akal. `pasti` false bila pemisahnya bisa dibaca dua cara.
 */
export function bacaAngkaCampur(mentah: string): { nilai: number; pasti: boolean } | null {
  const s = mentah.replace(/[.,]+$/, "");
  let m: RegExpExecArray | null;
  if (/^\d+$/.test(s)) return { nilai: Number(s), pasti: true };
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return { nilai: Number(s.replace(/\./g, "").replace(",", ".")), pasti: true };
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return { nilai: Number(s.replace(/,/g, "")), pasti: !/^\d{1,3},\d{3}$/.test(s) };
  if ((m = /^(\d+),(\d+)$/.exec(s))) return { nilai: Number(`${m[1]}.${m[2]}`), pasti: true };
  if ((m = /^(\d+)\.(\d+)$/.exec(s))) return { nilai: Number(`${m[1]}.${m[2]}`), pasti: false };
  return null;
}

const bulatkan = (n: number) => Math.round(n * 100) / 100;

export interface NilaiUang {
  nilai: number;
  mataUang: MataUang;
}

const POLA_UANG_AWALAN = /\b(Rp\.?|IDR|USD|US\$|EUR|SGD|S\$)\s*(\d[\d.,]*)(?:\s*(triliun|miliar|milyar|juta|jt|ribu)\b)?/gi;
const POLA_UANG_AKHIRAN = /(?<![\d.,])(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d{4,})\s*(?:,-\s*)?(triliun|miliar|milyar|juta|ribu)?\s*rupiah\b/gi;

function terbilangSesudah(teks: string, akhir: number): { angka: number | null; panjang: number } {
  const m = /^\s*(?:,?-)?\s*\(\s*([^()]{3,200}?)\s*\)/.exec(teks.slice(akhir, akhir + 260));
  if (!m) return { angka: null, panjang: 0 };
  return { angka: bacaTerbilang(m[1]!), panjang: m[0].length };
}

function terbilangSebelum(teks: string, awal: number): number | null {
  const m = /((?:[A-Za-z]+\s+){1,24}rupiah)\s*\(\s*$/i.exec(teks.slice(Math.max(0, awal - 260), awal));
  return m ? bacaTerbilang(m[1]!) : null;
}

/**
 * Cari semua nilai uang: "Rp 1.250.000.000,-", "Rp1,25 miliar", "Rp. 75.000.000 (tujuh puluh lima juta rupiah)",
 * "USD 10,000.50", "75.000.000 rupiah". Bila ada tulisan huruf di dekatnya, angka dan huruf dicocokkan:
 * cocok menaikkan keyakinan, berbeda menurunkannya dan diberi catatan.
 */
export function urailNilaiRupiah(teks: string): Temuan<NilaiUang>[] {
  const hasil: Temuan<NilaiUang>[] = [];
  const rentang: [number, number][] = [];

  const tambah = (awal: number, akhir: number, nilai: number, mataUang: MataUang, dasar: Keyakinan, pasti: boolean, jenisSkala: boolean) => {
    const bulat = jenisSkala || mataUang === "IDR" ? bulatkan(nilai) : bulatkan(nilai);
    const sesudah = terbilangSesudah(teks, akhir);
    const sebelum = sesudah.angka == null ? terbilangSebelum(teks, awal) : null;
    const huruf = sesudah.angka ?? sebelum;
    let keyakinan = pasti ? dasar : turun(dasar);
    let catatan: string | undefined;
    if (huruf != null) {
      if (Math.floor(bulat) === huruf) keyakinan = "tinggi";
      else {
        keyakinan = "rendah";
        catatan = `Angka (${bulat}) berbeda dengan tulisan huruf (${huruf}). Periksa dokumennya.`;
      }
    }
    hasil.push({ nilai: { nilai: bulat, mataUang }, keyakinan, sumber: potongan(teks, awal, akhir + sesudah.panjang), posisi: awal, catatan });
    rentang.push([awal, akhir + sesudah.panjang]);
  };

  for (const m of teks.matchAll(POLA_UANG_AWALAN)) {
    const angka = bacaAngkaCampur(m[2]!);
    if (!angka || !Number.isFinite(angka.nilai)) continue;
    const kunci = m[1]!.toLowerCase().replace(/\.$/, "");
    const skala = m[3] ? SKALA_UANG[m[3].toLowerCase()]! : 1;
    // Bentuk "Rp 1.000 juta" dibaca ribuan; "Rp 1,5 miliar" dibaca desimal: aturan bacaAngkaCampur sudah mengurusnya.
    tambah(m.index!, m.index! + m[0].length, angka.nilai * skala, MATA_UANG_AWALAN[kunci] ?? "IDR", "sedang", angka.pasti || !!m[3], !!m[3]);
  }
  for (const m of teks.matchAll(POLA_UANG_AKHIRAN)) {
    const span: [number, number] = [m.index!, m.index! + m[0].length];
    if (rentang.some((r) => tumpangTindih(r, span))) continue;
    const angka = bacaAngkaCampur(m[1]!);
    if (!angka || !Number.isFinite(angka.nilai)) continue;
    const skala = m[2] ? SKALA_UANG[m[2].toLowerCase()]! : 1;
    tambah(span[0], span[1], angka.nilai * skala, "IDR", "sedang", angka.pasti, !!m[2]);
  }
  return hasil.sort((a, b) => a.posisi - b.posisi);
}

// --- Tanggal --------------------------------------------------------------------

const BULAN_KE: Record<string, number> = {
  januari: 1, jan: 1, january: 1,
  februari: 2, pebruari: 2, feb: 2, february: 2,
  maret: 3, mar: 3, march: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, jun: 6, june: 6,
  juli: 7, jul: 7, july: 7,
  agustus: 8, agu: 8, agt: 8, ags: 8, agust: 8, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, october: 10, oct: 10,
  november: 11, nopember: 11, nov: 11,
  desember: 12, des: 12, december: 12, dec: 12,
};

const POLA_BULAN = Object.keys(BULAN_KE)
  .sort((a, b) => b.length - a.length)
  .join("|");

const POLA_TGL_NAMA = new RegExp(
  `(?<![\\d.,/])(\\d{1,2})(?:\\s*\\(\\s*[A-Za-z ]{2,30}\\s*\\))?[\\s\\-/.]+(?:bulan\\s+)?(${POLA_BULAN})(?![A-Za-z])\\.?,?[\\s\\-/.]+(?:tahun\\s+)?((?:19|20)\\d{2})(?!\\d)`,
  "gi",
);
const POLA_TGL_ANGKA = /(?<![\d.,/-])(\d{1,2})[-/.](\d{1,2})[-/.]((?:19|20)\d{2})(?![\d])/g;
const POLA_TGL_ISO = /(?<![\d-])((?:19|20)\d{2})-(\d{2})-(\d{2})(?![\d])/g;

/** Validasi tanggal kalender lalu kembalikan "YYYY-MM-DD", atau null. */
export function buatYmd(tahun: number, bulan: number, hari: number): Ymd | null {
  const d = new Date(Date.UTC(tahun, bulan - 1, hari));
  if (d.getUTCFullYear() !== tahun || d.getUTCMonth() !== bulan - 1 || d.getUTCDate() !== hari) return null;
  return `${String(tahun).padStart(4, "0")}-${String(bulan).padStart(2, "0")}-${String(hari).padStart(2, "0")}`;
}

/**
 * Cari tanggal: "2 Oktober 2026", "02 Okt 2026", "tanggal 2 (dua) bulan Oktober tahun 2026", "02-10-2026", "2026-10-02".
 * Tanggal angka dibaca hari-bulan-tahun; bila ambigu keyakinannya sedang, bila bulan-hari terbalik rendah.
 */
export function urailTanggal(teks: string): Temuan<Ymd>[] {
  const hasil: Temuan<Ymd>[] = [];
  const rentang: [number, number][] = [];
  const catat = (m: RegExpMatchArray, ymd: Ymd | null, keyakinan: Keyakinan, catatan?: string) => {
    if (!ymd) return;
    const span: [number, number] = [m.index!, m.index! + m[0].length];
    if (rentang.some((r) => tumpangTindih(r, span))) return;
    rentang.push(span);
    hasil.push({ nilai: ymd, keyakinan, sumber: potongan(teks, span[0], span[1]), posisi: span[0], catatan });
  };

  for (const m of teks.matchAll(POLA_TGL_NAMA)) catat(m, buatYmd(Number(m[3]), BULAN_KE[m[2]!.toLowerCase()]!, Number(m[1])), "tinggi");
  for (const m of teks.matchAll(POLA_TGL_ISO)) catat(m, buatYmd(Number(m[1]), Number(m[2]), Number(m[3])), "tinggi");
  for (const m of teks.matchAll(POLA_TGL_ANGKA)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const tahun = Number(m[3]);
    if (b <= 12) catat(m, buatYmd(tahun, b, a), a > 12 ? "tinggi" : "sedang", a > 12 ? undefined : "Dibaca hari-bulan-tahun.");
    else if (a <= 12) catat(m, buatYmd(tahun, a, b), "rendah", "Urutannya tampak bulan-hari-tahun; periksa dokumen.");
  }
  return hasil.sort((x, y) => x.posisi - y.posisi);
}

// --- Jangka waktu -----------------------------------------------------------------

export type SatuanJangka = "hari" | "minggu" | "bulan" | "tahun";

export interface JangkaWaktu {
  jumlah: number;
  satuan: SatuanJangka;
  /** false untuk "hari kerja": tidak bisa dihitung menjadi tanggal tanpa kalender libur. */
  kalender: boolean;
}

const POLA_JANGKA = new RegExp(
  `(?<![\\d.,/])(\\d{1,4})\\s*(?:\\(\\s*([A-Za-z\\s]{2,60}?)\\s*\\))?\\s*(hari(?:\\s+(?:kalender|kerja))?|minggu|pekan|bulan(?:\\s+kalender)?|tahun)\\b(?!\\s*(?:19|20)\\d{2})(?!\\s+(?:${POLA_BULAN})(?![A-Za-z]))`,
  "gi",
);

const KATA_ANGKA = "satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|seratus|puluh|belas|ratus|seribu|ribu";
const POLA_JANGKA_HURUF = new RegExp(`\\b((?:${KATA_ANGKA})(?:\\s+(?:${KATA_ANGKA}))*)\\s+(hari(?:\\s+(?:kalender|kerja))?|minggu|pekan|bulan(?:\\s+kalender)?|tahun)\\b`, "gi");

function satuanDari(kata: string): { satuan: SatuanJangka; kalender: boolean } {
  const k = kata.toLowerCase();
  const kalender = !k.includes("kerja");
  if (k.startsWith("hari")) return { satuan: "hari", kalender };
  if (k.startsWith("bulan")) return { satuan: "bulan", kalender };
  if (k === "tahun") return { satuan: "tahun", kalender };
  return { satuan: "minggu", kalender };
}

/** Konteks "jangka waktu ..." di depan angka menentukan keyakinan; angka lain ("dalam 14 hari kerja") berkeyakinan rendah. */
function keyakinanJangka(teks: string, posisi: number): Keyakinan {
  const depan = konteksSebelum(teks, posisi, 90);
  if (/jangka\s+waktu|masa\s+(?:berlaku|kontrak|perjanjian|sewa|pelaksanaan|kerja\s*sama)|berlaku\s+(?:selama|untuk)/i.test(depan)) return "tinggi";
  if (/(?:selama|lamanya|periode)\s*$/i.test(depan)) return "sedang";
  return "rendah";
}

/** "12 (dua belas) bulan", "selama 2 tahun", "180 hari kalender", "dua belas bulan". */
export function urailJangkaWaktu(teks: string): Temuan<JangkaWaktu>[] {
  const hasil: Temuan<JangkaWaktu>[] = [];
  const rentang: [number, number][] = [];

  for (const m of teks.matchAll(POLA_JANGKA)) {
    const jumlah = Number(m[1]);
    if (!jumlah) continue;
    const span: [number, number] = [m.index!, m.index! + m[0].length];
    rentang.push(span);
    let keyakinan = keyakinanJangka(teks, span[0]);
    let catatan: string | undefined;
    if (m[2]) {
      const huruf = bacaTerbilang(m[2]);
      if (huruf != null && huruf !== jumlah) {
        keyakinan = turun(keyakinan);
        catatan = `Angka (${jumlah}) berbeda dengan tulisan huruf (${huruf}).`;
      } else if (huruf === jumlah) keyakinan = naik(keyakinan);
    }
    hasil.push({ nilai: { jumlah, ...satuanDari(m[3]!) }, keyakinan, sumber: potongan(teks, span[0], span[1], 50), posisi: span[0], catatan });
  }
  for (const m of teks.matchAll(POLA_JANGKA_HURUF)) {
    const span: [number, number] = [m.index!, m.index! + m[0].length];
    if (rentang.some((r) => tumpangTindih(r, span))) continue;
    const jumlah = bacaTerbilang(m[1]!);
    if (!jumlah) continue;
    hasil.push({ nilai: { jumlah, ...satuanDari(m[2]!) }, keyakinan: turun(keyakinanJangka(teks, span[0])), sumber: potongan(teks, span[0], span[1], 50), posisi: span[0] });
  }
  return hasil.sort((a, b) => a.posisi - b.posisi);
}

function tambahBulan(ymd: Ymd, bulan: number): Ymd {
  const [t, b, h] = ymd.split("-").map(Number) as [number, number, number];
  const awal = new Date(Date.UTC(t, b - 1 + bulan, 1));
  const hariTerakhir = new Date(Date.UTC(awal.getUTCFullYear(), awal.getUTCMonth() + 1, 0)).getUTCDate();
  awal.setUTCDate(Math.min(h, hariTerakhir));
  return awal.toISOString().slice(0, 10);
}

function tambahHariYmd(ymd: Ymd, n: number): Ymd {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Tanggal berakhir bila kontrak dimulai `mulai` dan berjalan selama `jangka` (hari mulai ikut dihitung):
 * 1 Jan 2027 + 12 bulan -> 31 Des 2027. Null untuk "hari kerja".
 */
export function hitungBerakhir(mulai: Ymd, jangka: JangkaWaktu): Ymd | null {
  if (!jangka.kalender || !/^\d{4}-\d{2}-\d{2}$/.test(mulai)) return null;
  const { jumlah, satuan } = jangka;
  if (satuan === "bulan") return tambahHariYmd(tambahBulan(mulai, jumlah), -1);
  if (satuan === "tahun") return tambahHariYmd(tambahBulan(mulai, jumlah * 12), -1);
  return tambahHariYmd(mulai, (satuan === "minggu" ? jumlah * 7 : jumlah) - 1);
}

// --- Nama pihak (komparisi) ---------------------------------------------------------

export interface Pihak {
  nama: string;
  bentuk: string;
  /** Sebutan di perjanjian, mis. "PIHAK PERTAMA" atau "Penyedia". */
  peran?: string;
  wakil?: string;
  jabatan?: string;
  /** Pihak ini adalah PT Waskita Karya Infrastruktur sendiri. */
  adalahWki: boolean;
}

const BADAN = "PT|CV|Perum|Perumda|Koperasi|Yayasan|Firma|UD";
const TOKEN_NAMA = "[\\p{Lu}\\d&][\\p{L}\\p{N}&'’\\-.]*";
const POLA_PIHAK = new RegExp(`(?<![\\p{L}])(${BADAN})\\.?\\s+(${TOKEN_NAMA}(?:\\s+(?:${TOKEN_NAMA}|\\((?:Persero|Tbk)\\)|Tbk\\.?)){0,7})`, "gu");
const KATA_POTONG = /\s+(?:selanjutnya|berkedudukan|beralamat|berkantor|berdomisili|diwakili|dalam|yang|untuk|serta|telah|adalah|sebagai|berdasarkan|bertindak|berbadan|dan|atau|dengan|antara)\b.*$/i;

/** Samakan penulisan nama untuk perbandingan: tanpa badan usaha, tanda baca, dan kata penjelas. */
export function normalisasiNama(nama: string): string {
  return nama
    .toLowerCase()
    .replace(/\((?:persero|tbk)\)/g, " ")
    .replace(/\b(?:pt|cv|ud|perum|perumda|koperasi|yayasan|firma|tbk|persero)\b\.?/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dua nama dianggap sama bila setelah dinormalisasi identik, saling memuat, atau token-nya hampir seluruhnya sama. */
export function samaNama(a: string, b: string): boolean {
  const x = normalisasiNama(a);
  const y = normalisasiNama(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [pendek, panjang] = x.length <= y.length ? [x, y] : [y, x];
  if (pendek.length >= 4 && ` ${panjang} `.includes(` ${pendek} `)) return true;
  const tx = new Set(x.split(" "));
  const ty = new Set(y.split(" "));
  const sama = [...tx].filter((t) => ty.has(t)).length;
  return sama / Math.min(tx.size, ty.size) >= 0.75 && Math.min(tx.size, ty.size) >= 2;
}

const POLA_WKI = /waskita\s+karya\s+infra|waskita\s+infra/i;

/**
 * Cari pihak yang disebut di komparisi: "PT ABC, berkedudukan di ..., diwakili oleh ...". Hasil berurutan menurut
 * kemunculan pertama; nama yang sama hanya dihitung sekali. Orang perseorangan tidak diurai.
 */
export function urailPihak(teks: string): Temuan<Pihak>[] {
  const mentah: { bentuk: string; nama: string; awal: number; akhir: number }[] = [];
  for (const m of teks.matchAll(POLA_PIHAK)) {
    const nama = m[2]!.replace(KATA_POTONG, "").replace(/[.,'’\-\s]+$/, "").trim();
    if (nama.replace(/[^\p{L}]/gu, "").length < 2) continue;
    mentah.push({ bentuk: m[1]!.toUpperCase(), nama, awal: m.index!, akhir: m.index! + m[0].length });
  }

  const hasil: Temuan<Pihak>[] = [];
  const terlihat = new Set<string>();
  mentah.forEach((p, i) => {
    const kunci = normalisasiNama(p.nama);
    if (!kunci || terlihat.has(kunci)) return;
    terlihat.add(kunci);

    const batas = mentah.slice(i + 1).find((q) => normalisasiNama(q.nama) !== kunci)?.awal ?? teks.length;
    const jendela = teks.slice(p.akhir, Math.min(batas, p.akhir + 700));
    const komparisi = /berkedudukan|beralamat|berkantor|berdomisili|diwakili|selanjutnya\s+(?:disebut|dalam)/i.test(teks.slice(p.akhir, p.akhir + 260));

    const peranM = /selanjutnya\s+(?:disebut|dalam\s+(?:perjanjian|kontrak)\s+ini\s+disebut|akan\s+disebut)\s*(?:sebagai\s*)?[“"'‘”]*\s*([A-Za-z][A-Za-z ]{2,38}?)\s*[”"'’)]/i.exec(jendela);
    const wakilM = /diwakili\s+oleh\s+(?:Bapak\s+|Ibu\s+|Sdr\.?\s+|Saudara\s+|Saudari\s+)?([^,;]{3,60}?)\s*,\s*(?:selaku|sebagai|dalam\s+(?:kedudukan|jabatan)(?:nya)?\s+(?:selaku|sebagai)|jabatan)\s+([^,;.]{3,70})/i.exec(jendela);

    hasil.push({
      nilai: { nama: p.nama, bentuk: p.bentuk, peran: peranM?.[1]?.trim(), wakil: wakilM?.[1]?.trim(), jabatan: wakilM?.[2]?.trim(), adalahWki: POLA_WKI.test(p.nama) },
      keyakinan: komparisi ? "tinggi" : p.awal < Math.max(1500, teks.length * 0.15) ? "sedang" : "rendah",
      sumber: potongan(teks, p.awal, Math.min(p.akhir + 90, teks.length), 10),
      posisi: p.awal,
    });
  });
  return hasil;
}

// --- Nomor perjanjian ---------------------------------------------------------------

const POLA_NOMOR_BERAWALAN = /\b(?:Nomor|No\.?)(?:\s+(?:Perjanjian|Kontrak|SPK|PO|Addendum))?\s*[:.]?\s*([A-Z0-9][A-Za-z0-9.\-_]*(?:\s?\/\s?[A-Za-z0-9.\-_]+){1,8})/g;
const POLA_NOMOR_KODE = /\b(?:Nomor|No\.)(?:\s+(?:Perjanjian|Kontrak|SPK|PO))?\s*[:.]?\s*([A-Z]{2,6}[-.]\d{2,}[A-Za-z0-9\-.]*)/g;
const POLA_NOMOR_BEBAS = /(?<![\w/])(\d{1,4}\s?\/\s?[A-Z][A-Za-z0-9.\-]*(?:\s?\/\s?[A-Za-z0-9.\-]+){1,6})/g;

/** "Nomor: 012/PKS/WKI/X/2026" -> "012/PKS/WKI/X/2026". Spasi di sekitar garis miring dibuang. */
export function urailNomorPerjanjian(teks: string): Temuan<string>[] {
  const hasil: Temuan<string>[] = [];
  const lihat = new Set<string>();
  const simpan = (m: RegExpMatchArray, keyakinan: Keyakinan) => {
    const nilai = m[1]!.replace(/\s*\/\s*/g, "/").replace(/[.\-_/]+$/, "");
    if (!/\d/.test(nilai) || lihat.has(nilai)) return;
    lihat.add(nilai);
    hasil.push({ nilai, keyakinan, sumber: potongan(teks, m.index!, m.index! + m[0].length, 20), posisi: m.index! });
  };
  for (const m of teks.matchAll(POLA_NOMOR_BERAWALAN)) simpan(m, (m[1]!.match(/\//g)?.length ?? 0) >= 2 ? "tinggi" : "sedang");
  for (const m of teks.matchAll(POLA_NOMOR_KODE)) simpan(m, "sedang");
  if (!hasil.length) for (const m of teks.slice(0, 1500).matchAll(POLA_NOMOR_BEBAS)) simpan(m, "rendah");
  return hasil.sort((a, b) => a.posisi - b.posisi);
}

// --- Judul dan jenis ------------------------------------------------------------------

const KECIL = new Set(["dan", "di", "ke", "dari", "untuk", "tentang", "atas", "pada", "serta", "dengan", "yang", "dalam", "of", "the"]);
const SINGKATAN = new Set(["PT", "CV", "UD", "SPK", "PO", "WKI", "NDA", "MOU", "BUMN", "KSO", "KSM", "BOT", "RUPS", "II", "III", "IV", "VI", "VII", "VIII", "IX"]);

/** "PERJANJIAN PENGADAAN BESI BETON" -> "Perjanjian Pengadaan Besi Beton"; singkatan seperti PT dan WKI tetap kapital. */
export function kapitalJudul(teks: string): string {
  return teks
    .split(/(\s+)/)
    .map((k, i) => {
      if (!k.trim()) return k;
      if (k !== k.toUpperCase() || !/[A-Z]/.test(k)) return k;
      const murni = k.replace(/[^A-Z]/g, "");
      if (SINGKATAN.has(murni) || (murni.length <= 4 && !/[AIUEO]/.test(murni))) return k;
      const kecil = k.toLowerCase();
      return i > 0 && KECIL.has(kecil) ? kecil : kecil.replace(/^(\W*)(\p{L})/u, (_, p: string, h: string) => p + h.toUpperCase());
    })
    .join("");
}

const POLA_JUDUL_KAPITAL = /\b(PERJANJIAN|KONTRAK|SURAT PERJANJIAN|NOTA KESEPAHAMAN|MEMORANDUM OF UNDERSTANDING|ADDENDUM|AMANDEMEN)((?:\s+[A-Z0-9][A-Z0-9&.,\-/()]*(?![a-z])){0,18})/;
const POLA_JUDUL_BIASA = /^\s*((?:Perjanjian|Kontrak|Surat Perjanjian|Nota Kesepahaman|Addendum|Amandemen)\b[^\n]{0,140})/m;

/** Judul dokumen dari kepala surat: baris kapital "PERJANJIAN ... TENTANG ..." diutamakan. */
export function urailJudul(teks: string): Temuan<string> | null {
  const kepala = teks.slice(0, 2500);
  const m = POLA_JUDUL_KAPITAL.exec(kepala);
  if (m) {
    let isi = `${m[1]}${m[2]}`;
    isi = isi.replace(/\s+(?:NOMOR|NO\.?|ANTARA|DIBUAT|PADA HARI)\b.*$/s, "");
    isi = ratakan(isi).replace(/[\s,.\-/]+$/, "");
    if (isi.length >= 8) return { nilai: kapitalJudul(isi), keyakinan: "sedang", sumber: potongan(kepala, m.index, m.index + m[0].length, 0), posisi: m.index };
  }
  const b = POLA_JUDUL_BIASA.exec(kepala);
  if (b) {
    const isi = ratakan(b[1]!).replace(/\s+(?:Nomor|No\.?)\b.*$/, "").replace(/[\s,.\-/:]+$/, "");
    if (isi.length >= 8) return { nilai: isi, keyakinan: "rendah", sumber: potongan(kepala, b.index, b.index + b[0].length, 0), posisi: b.index };
  }
  return null;
}

const ATURAN_JENIS: { jenis: JenisKontrak; pola: RegExp }[] = [
  { jenis: "Addendum / Amandemen", pola: /\baddendum\b|\bamandemen\b|\bamendment\b/i },
  { jenis: "MoU / Nota Kesepahaman", pola: /nota\s+kesepahaman|memorandum\s+of\s+understanding|\bmou\b/i },
  { jenis: "Kerahasiaan (NDA)", pola: /kerahasiaan|non-?disclosure|\bnda\b|confidentiality/i },
  { jenis: "Sewa", pola: /\bsewa\b|menyewa|penyewaan|\blease\b/i },
  { jenis: "Kerja Sama", pola: /kerja\s*sama|kerjasama|\bkso\b|kemitraan|cooperation/i },
  { jenis: "Pengadaan Barang", pola: /jual\s+beli|pengadaan\s+barang|pembelian|penyediaan\s+barang|\bsupply\b|pasokan/i },
  { jenis: "Pengadaan Jasa", pola: /\bjasa\b|pemborongan|pelaksanaan\s+pekerjaan|konstruksi|konsultan|subkontrak|pekerjaan/i },
];

/** Tebak jenis kontrak dari judul (lebih dipercaya) atau, bila tak ada, dari kepala dokumen. */
export function urailJenis(teks: string): Temuan<JenisKontrak> | null {
  const judul = urailJudul(teks);
  const sumber = judul ? judul.nilai : teks.slice(0, 900);
  const cocok = ATURAN_JENIS.filter((a) => a.pola.test(sumber));
  if (!cocok.length) return null;
  const pertama = cocok[0]!;
  const keyakinan: Keyakinan = judul ? (cocok.length === 1 ? "tinggi" : "sedang") : "rendah";
  return {
    nilai: pertama.jenis,
    keyakinan,
    sumber: judul ? judul.sumber : potongan(teks, 0, Math.min(120, teks.length), 0),
    posisi: judul?.posisi ?? 0,
    catatan: cocok.length > 1 ? `Judul memuat petunjuk lebih dari satu jenis (${cocok.map((c) => c.jenis).join(", ")}).` : undefined,
  };
}
