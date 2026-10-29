// Ekstraksi teks dokumen kontrak SEPENUHNYA di peramban: DOCX lewat mammoth, PDF berteks lewat pdf.js.
// Isi dokumen tidak pernah dikirim ke server mana pun. Tidak ada OCR: PDF hasil pindai dilaporkan apa adanya.
//
// Kedua pustaka dimuat dinamis (await import) supaya tidak membebani bundel awal; keduanya hanya diunduh
// saat pengguna benar-benar memindai dokumen.
import { rapikanTeks } from "./parserID";

export type JenisBerkasTeks = "pdf" | "docx" | "teks" | "tidak-didukung";

export const BATAS_UKURAN_EKSTRAK = 30 * 1024 * 1024;
export const BATAS_HALAMAN_EKSTRAK = 80;
/** Rata-rata huruf per halaman di bawah ini dianggap tidak punya lapisan teks (hasil pindai/foto). */
const MIN_HURUF_PER_HALAMAN = 40;
/** Karakter pengganti (FFFD) dan area pakai-pribadi Unicode (E000-F8FF): gejala font PDF tersandi. */
const POLA_TERSANDI = new RegExp("["+String.fromCharCode(0xfffd)+String.fromCharCode(0xe000)+"-"+String.fromCharCode(0xf8ff)+"]", "g");

export interface HasilEkstrak {
  teks: string;
  /** Jumlah halaman yang dibaca (DOCX: perkiraan dari panjang teks, minimal 1). */
  halaman: number;
  /** Jumlah halaman dokumen sebenarnya (PDF), bisa lebih besar dari `halaman` bila dipotong. */
  halamanTotal: number;
  terbaca: boolean;
  jenisBerkas: JenisBerkasTeks;
  /** Kalimat untuk pengguna: kenapa tidak terbaca, atau catatan seperti "hanya 80 halaman pertama". */
  pesan: string;
  terpotong: boolean;
  /** 0..1, perkiraan kasar mutu lapisan teks. */
  skor: number;
}

/** Galat yang pesannya aman ditampilkan langsung ke pengguna. */
export class GalatEkstrak extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = "GalatEkstrak";
  }
}

export function jenisBerkasDari(nama: string, mime = ""): JenisBerkasTeks {
  const ext = /\.([a-z0-9]+)$/i.exec(nama)?.[1]?.toLowerCase() ?? "";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (ext === "txt" || mime === "text/plain") return "teks";
  return "tidak-didukung";
}

/** Periksa sebelum membaca: null bila boleh, atau kalimat penjelasan bila tidak. */
export function cekBerkasEkstrak(nama: string, ukuran: number, mime = ""): string | null {
  const jenis = jenisBerkasDari(nama, mime);
  if (jenis === "tidak-didukung") {
    if (/\.doc$/i.test(nama)) return "Berkas .doc (Word lama) belum bisa dibaca. Simpan ulang sebagai .docx atau PDF, lalu coba lagi.";
    return "Yang bisa saya baca hanya PDF dan Word (.docx).";
  }
  if (ukuran <= 0) return "Berkasnya kosong.";
  if (ukuran > BATAS_UKURAN_EKSTRAK) return `Berkas ini ${(ukuran / 1024 / 1024).toFixed(1)} MB, melebihi batas baca 30 MB.`;
  return null;
}

/**
 * Nilai apakah teks hasil ekstraksi layak dibaca. Dua gejala yang dicari: terlalu sedikit huruf per halaman
 * (PDF pindai tanpa lapisan teks) dan terlalu banyak karakter aneh (font tersandi sehingga teksnya acak).
 */
export function nilaiKeterbacaan(teks: string, halaman: number): { terbaca: boolean; skor: number; pesan: string } {
  const huruf = (teks.match(/\p{L}/gu) ?? []).length;
  const aneh = (teks.match(POLA_TERSANDI) ?? []).length;
  const tampak = teks.replace(/\s/g, "").length;
  const perHalaman = huruf / Math.max(1, halaman);
  if (tampak === 0) return { terbaca: false, skor: 0, pesan: "Dokumen ini tidak punya lapisan teks, kemungkinan hasil pindai atau foto. Saya tidak bisa membacanya tanpa OCR." };
  if (aneh / tampak > 0.15) return { terbaca: false, skor: 0.1, pesan: "Teks di dokumen ini tersandi (fontnya tidak standar), jadi hasil bacaannya acak. Coba ekspor ulang PDF dari Word." };
  if (perHalaman < MIN_HURUF_PER_HALAMAN)
    return { terbaca: false, skor: Math.min(0.3, perHalaman / MIN_HURUF_PER_HALAMAN), pesan: "Hampir tidak ada teks yang bisa dibaca. Sepertinya ini PDF hasil pindai; isi datanya manual saja ya." };
  // Skor kasar: kepadatan huruf per halaman (penuh pada 1.200) dikurangi porsi karakter aneh.
  const skor = Math.max(0.35, Math.min(1, perHalaman / 1200) - aneh / tampak);
  return { terbaca: true, skor: Number(skor.toFixed(2)), pesan: "" };
}

// --- Pembaca per jenis --------------------------------------------------------------

interface Mentah {
  teks: string;
  halaman: number;
  halamanTotal: number;
}

async function bacaDocx(buf: ArrayBuffer): Promise<Mentah> {
  const mod = await import("mammoth");
  const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod;
  // `arrayBuffer` dipakai versi peramban mammoth; `buffer` hanya agar skrip uji Node juga bisa memanggilnya.
  const masukan = { arrayBuffer: buf, buffer: buf };
  const hasil = await mammoth.extractRawText(masukan as { arrayBuffer: ArrayBuffer });
  const teks = hasil.value ?? "";
  // Word tidak menyimpan jumlah halaman yang bisa dipercaya; ~3.000 karakter per halaman cukup untuk keterbacaan.
  const halaman = Math.max(1, Math.round(teks.length / 3000));
  return { teks, halaman, halamanTotal: halaman };
}

interface ItemTeksPdf {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
}

async function bacaPdf(buf: ArrayBuffer, onProgres?: (persen: number) => void): Promise<Mentah> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    // `?url` membuat Vite menyalin worker ke folder aset situs ini sendiri, jadi lolos CSP script-src 'self'
    // (worker-src jatuh ke script-src) tanpa CDN dan tanpa blob:.
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  const tugas = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
  let dok: Awaited<typeof tugas.promise>;
  try {
    dok = await tugas.promise;
  } catch (err) {
    const nama = err instanceof Error ? err.name : "";
    if (nama === "PasswordException") throw new GalatEkstrak("PDF ini dilindungi kata sandi, jadi tidak bisa saya buka. Unggah versi tanpa kata sandi.");
    if (nama === "InvalidPDFException") throw new GalatEkstrak("Berkas ini bukan PDF yang utuh (mungkin rusak atau terpotong saat diunduh).");
    throw new GalatEkstrak("PDF ini gagal dibuka di peramban.");
  }
  try {
    const total = dok.numPages;
    const dibaca = Math.min(total, BATAS_HALAMAN_EKSTRAK);
    const bagian: string[] = [];
    for (let i = 1; i <= dibaca; i++) {
      const hal = await dok.getPage(i);
      const isi = await hal.getTextContent();
      let baris = "";
      let yTerakhir: number | null = null;
      const keluar: string[] = [];
      for (const it of isi.items as unknown[]) {
        const t = it as ItemTeksPdf;
        if (typeof t.str !== "string") continue;
        const y = t.transform?.[5] ?? null;
        // Pindah baris bila posisi vertikal bergeser jelas, walau pdf.js tidak menandai hasEOL.
        if (y != null && yTerakhir != null && Math.abs(y - yTerakhir) > 2 && baris.trim()) {
          keluar.push(baris);
          baris = "";
        }
        baris += t.str;
        if (t.hasEOL) {
          keluar.push(baris);
          baris = "";
        }
        if (y != null) yTerakhir = y;
      }
      if (baris.trim()) keluar.push(baris);
      bagian.push(keluar.join("\n"));
      hal.cleanup();
      onProgres?.(Math.round((i / dibaca) * 100));
    }
    return { teks: bagian.join("\n\n"), halaman: dibaca, halamanTotal: total };
  } finally {
    void dok.destroy();
  }
}

/**
 * Baca teks dari berkas PDF/DOCX/TXT di peramban. Tidak pernah melempar untuk dokumen yang sekadar tidak
 * terbaca (hasil pindai): hasilnya `terbaca: false` dengan pesan jelas. Melempar GalatEkstrak untuk berkas
 * yang ditolak (jenis, ukuran, kata sandi, rusak).
 */
export async function ekstrakTeks(file: File, opsi: { onProgres?: (persen: number) => void } = {}): Promise<HasilEkstrak> {
  const tolak = cekBerkasEkstrak(file.name, file.size, file.type);
  if (tolak) throw new GalatEkstrak(tolak);
  const jenisBerkas = jenisBerkasDari(file.name, file.type);
  const buf = await file.arrayBuffer();

  let mentah: Mentah;
  try {
    if (jenisBerkas === "pdf") mentah = await bacaPdf(buf, opsi.onProgres);
    else if (jenisBerkas === "docx") mentah = await bacaDocx(buf);
    else mentah = { teks: new TextDecoder().decode(buf), halaman: 1, halamanTotal: 1 };
  } catch (err) {
    if (err instanceof GalatEkstrak) throw err;
    throw new GalatEkstrak(jenisBerkas === "docx" ? "Berkas Word ini gagal dibaca. Pastikan formatnya .docx yang utuh." : "Berkas ini gagal dibaca di peramban.");
  }
  opsi.onProgres?.(100);

  const teks = rapikanTeks(mentah.teks);
  const nilai = nilaiKeterbacaan(teks, mentah.halaman);
  const terpotong = mentah.halamanTotal > mentah.halaman;
  const pesan = !nilai.terbaca
    ? nilai.pesan
    : terpotong
      ? `Dokumen ini ${mentah.halamanTotal} halaman; yang saya baca ${mentah.halaman} halaman pertama saja.`
      : "";
  return { teks: nilai.terbaca ? teks : "", halaman: mentah.halaman, halamanTotal: mentah.halamanTotal, terbaca: nilai.terbaca, jenisBerkas, pesan, terpotong, skor: nilai.skor };
}
