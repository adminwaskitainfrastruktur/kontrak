// Angka menjadi kata (dan sebaliknya) dalam Bahasa Indonesia, untuk nilai kontrak di draf perjanjian.
// Murni dan tanpa dependensi: boleh diuji lewat Node.
//
// Aturan yang dijaga:
//  - "seratus", "seribu", "sebelas", "sepuluh" memakai bentuk khusus; ribu satu-satunya skala yang boleh "se-"
//    ("seribu"), sedangkan "satu juta", "satu miliar", "satu triliun" tetap memakai "satu" (gaya dokumen hukum).
//  - sen ditulis setelah rupiah: "... rupiah lima puluh sen".

const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"] as const;

const SKALA: { nilai: bigint; kata: string }[] = [
  { nilai: 1_000_000_000_000n, kata: "triliun" },
  { nilai: 1_000_000_000n, kata: "miliar" },
  { nilai: 1_000_000n, kata: "juta" },
  { nilai: 1_000n, kata: "ribu" },
];

/** Batas atas yang didukung: kurang dari 1.000 triliun. */
const BATAS = 1_000_000_000_000_000n;

/** 0..999 menjadi kata; kosong untuk 0. */
function tigaDigit(n: number): string {
  const bagian: string[] = [];
  const ratus = Math.floor(n / 100);
  const sisa = n % 100;
  if (ratus === 1) bagian.push("seratus");
  else if (ratus > 1) bagian.push(`${SATUAN[ratus]} ratus`);
  if (sisa === 0) {
    // tidak ada
  } else if (sisa < 10) bagian.push(SATUAN[sisa]!);
  else if (sisa === 10) bagian.push("sepuluh");
  else if (sisa === 11) bagian.push("sebelas");
  else if (sisa < 20) bagian.push(`${SATUAN[sisa - 10]} belas`);
  else {
    const puluh = Math.floor(sisa / 10);
    const satu = sisa % 10;
    bagian.push(`${SATUAN[puluh]} puluh`);
    if (satu) bagian.push(SATUAN[satu]!);
  }
  return bagian.join(" ");
}

function kataBulat(n: bigint): string {
  if (n === 0n) return "nol";
  if (n < 0n || n >= BATAS) throw new RangeError("Angka di luar jangkauan terbilang (maksimal 999 triliun).");
  const bagian: string[] = [];
  let sisa = n;
  for (const { nilai, kata } of SKALA) {
    const grup = Number(sisa / nilai);
    sisa %= nilai;
    if (grup === 0) continue;
    bagian.push(kata === "ribu" && grup === 1 ? "seribu" : `${tigaDigit(grup)} ${kata}`);
  }
  if (sisa > 0n) bagian.push(tigaDigit(Number(sisa)));
  return bagian.join(" ");
}

/** Pecah angka atau string menjadi bagian bulat dan sen (0..99), dengan pembulatan ke sen. */
function pecah(nilai: number | string): { negatif: boolean; bulat: bigint; sen: number } {
  let teks: string;
  if (typeof nilai === "number") {
    if (!Number.isFinite(nilai)) throw new RangeError("Angka tidak valid.");
    if (Math.abs(nilai) >= 1e15) throw new RangeError("Angka di luar jangkauan terbilang (maksimal 999 triliun).");
    // Dibulatkan lewat toFixed supaya 0.1 + 0.2 tidak menghasilkan sen aneh.
    teks = nilai.toFixed(2);
  } else {
    teks = nilai.trim();
  }
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(teks);
  if (!m) throw new RangeError(`Angka tidak valid: "${String(nilai)}"`);
  const desimal = (m[3] ?? "").padEnd(3, "0");
  let sen = Number(desimal.slice(0, 2));
  let bulat = BigInt(m[2]!);
  if (Number(desimal[2]) >= 5) sen += 1;
  if (sen >= 100) {
    sen -= 100;
    bulat += 1n;
  }
  const negatif = m[1] === "-" && (bulat > 0n || sen > 0);
  return { negatif, bulat, sen };
}

/** 1250 -> "seribu dua ratus lima puluh". Bilangan bulat tanpa kata mata uang. */
export function terbilangAngka(n: number | string): string {
  const { negatif, bulat } = pecah(n);
  return (negatif ? "minus " : "") + kataBulat(bulat);
}

/**
 * "1.250.000.000" -> "satu miliar dua ratus lima puluh juta rupiah".
 * Desimal dibaca sebagai sen: 1500.5 -> "seribu lima ratus rupiah lima puluh sen".
 * `mataUang` memberi nama satuan di belakang; kode lain dari IDR dieja namanya.
 */
export function terbilangRupiah(nilai: number | string, mataUang: string = "IDR"): string {
  const { negatif, bulat, sen } = pecah(nilai);
  const satuan = SATUAN_UANG[mataUang] ?? { utama: mataUang, kecil: "sen" };
  const bagian = [kataBulat(bulat), satuan.utama];
  if (sen > 0) bagian.push(kataBulat(BigInt(sen)), satuan.kecil);
  return (negatif ? "minus " : "") + bagian.join(" ");
}

const SATUAN_UANG: Record<string, { utama: string; kecil: string }> = {
  IDR: { utama: "rupiah", kecil: "sen" },
  USD: { utama: "dolar Amerika Serikat", kecil: "sen" },
  EUR: { utama: "euro", kecil: "sen" },
  SGD: { utama: "dolar Singapura", kecil: "sen" },
};

// --- Tanggal -----------------------------------------------------------------

export const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"] as const;
export const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;

function urai(ymd: string): { t: number; b: number; h: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new RangeError(`Tanggal harus berformat YYYY-MM-DD: "${ymd}"`);
  const h = Number(m[1]);
  const b = Number(m[2]);
  const t = Number(m[3]);
  const uji = new Date(Date.UTC(h, b - 1, t));
  if (uji.getUTCFullYear() !== h || uji.getUTCMonth() !== b - 1 || uji.getUTCDate() !== t) throw new RangeError(`Tanggal tidak ada di kalender: "${ymd}"`);
  return { t, b, h };
}

/** "2026-10-02" -> "2 Oktober 2026" */
export function tanggalPanjang(ymd: string): string {
  const { t, b, h } = urai(ymd);
  return `${t} ${NAMA_BULAN[b - 1]} ${h}`;
}

/** "2026-10-02" -> "Jumat" (hari menurut kalender, tanpa zona waktu). */
export function namaHari(ymd: string): string {
  const { t, b, h } = urai(ymd);
  return NAMA_HARI[new Date(Date.UTC(h, b - 1, t)).getUTCDay()]!;
}

/**
 * "2026-10-02" -> "dua bulan Oktober tahun dua ribu dua puluh enam".
 * Dengan `lengkap`: "hari Jumat, tanggal dua bulan Oktober tahun dua ribu dua puluh enam".
 */
export function terbilangTanggal(ymd: string, lengkap = false): string {
  const { t, b, h } = urai(ymd);
  const inti = `${kataBulat(BigInt(t))} bulan ${NAMA_BULAN[b - 1]} tahun ${kataBulat(BigInt(h))}`;
  return lengkap ? `hari ${namaHari(ymd)}, tanggal ${inti}` : inti;
}

// --- Kata menjadi angka --------------------------------------------------------

const KATA_SATUAN: Record<string, number> = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9 };
const KATA_SKALA: Record<string, number> = { ribu: 1e3, juta: 1e6, miliar: 1e9, milyar: 1e9, triliun: 1e12 };
const KATA_ABAIKAN = new Set(["dan", "rp", "idr"]);

/**
 * Kebalikan terbilang: "tujuh puluh lima juta rupiah" -> 75000000. Bagian setelah kata "rupiah" (sen) tidak dihitung.
 * Mengembalikan null bila ada kata yang tidak dikenal atau tidak ada angka sama sekali. Dipakai untuk mencocokkan
 * angka dengan tulisan huruf di dokumen ("Rp 75.000.000 (tujuh puluh lima juta rupiah)").
 */
export function bacaTerbilang(teks: string): number | null {
  const token = teks
    .toLowerCase()
    .replace(/[(),.;:]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let total = 0;
  let bagian = 0;
  let terakhir = 0; // satuan terakhir yang menunggu "puluh/belas/ratus"
  let adaAngka = false;
  for (const t of token) {
    if (t === "rupiah") break;
    if (KATA_ABAIKAN.has(t)) continue;
    adaAngka = true;
    if (t === "nol") continue;
    if (t in KATA_SATUAN) {
      terakhir = KATA_SATUAN[t]!;
      bagian += terakhir;
    } else if (t === "sepuluh") bagian += 10;
    else if (t === "sebelas") bagian += 11;
    else if (t === "seratus") bagian += 100;
    else if (t === "seribu") {
      total += 1000;
      terakhir = 0;
    }
    else if (t === "puluh" || t === "belas" || t === "ratus") {
      if (!terakhir) return null;
      bagian += t === "puluh" ? terakhir * 9 : t === "belas" ? 10 : terakhir * 99;
      terakhir = 0;
    } else if (t in KATA_SKALA) {
      total += (bagian || 1) * KATA_SKALA[t]!;
      bagian = 0;
      terakhir = 0;
    } else return null;
  }
  if (!adaAngka) return null;
  return total + bagian;
}
