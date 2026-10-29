// PDF final kontrak bertanda tangan: Halaman Pengesahan (pdf-lib, dibuat di peramban, tanpa layanan luar).
//
// Bila dokumen kontraknya PDF, halaman pengesahan ditambahkan di belakang halaman aslinya sehingga satu berkas
// memuat isi kontrak sekaligus tanda tangannya. Untuk dokumen lain (Word), hasilnya hanya halaman pengesahan
// yang memuat nama dan sidik SHA-256 dokumen sebagai pengikat.
//
// Murni (tanpa DOM, tanpa jaringan) agar teruji di Node: gambar tanda tangan masuk sebagai byte PNG.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { statusPermintaan, sudahTtd, type IsiPermintaan, type Penandatangan } from "./penandatangan";

export interface DataPdfTtd {
  nomorPengajuan: string;
  judul: string;
  mitra: string;
  isi: IsiPermintaan;
  /** PNG tanda tangan per ID penandatangan. */
  ttd: Record<string, Uint8Array | null | undefined>;
  urlVerifikasi: string;
  /** Isi PDF kontrak asli; bila ada, halaman pengesahan ditambahkan di belakangnya. */
  pdfAsli?: Uint8Array | null;
  /** Waktu dokumen ini dibuat (ISO), untuk keterangan "dibuat pada". */
  dibuatPada: string;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const BIRU = rgb(0.043, 0.122, 0.361);
const ABU = rgb(0.38, 0.4, 0.45);
const GARIS = rgb(0.82, 0.84, 0.88);
const HIJAU = rgb(0.09, 0.45, 0.25);

const fmtWaktu = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export const waktuWib = (iso: string | undefined | null): string => {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : `${fmtWaktu.format(d).replace(".", ":")} WIB`;
};

/** Font standar PDF hanya mengenal WinAnsi: karakter di luarnya diganti agar tidak melempar galat. */
export function amanWinAnsi(teks: string): string {
  return teks
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, "->")
    .replace(/[✓✔]/g, "v")
    .replace(/[  ]/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    // Karakter di atas Latin-1 yang tidak ada di WinAnsi.
    .replace(/[^\x20-\x7E¡-ÿ–—•…€]/g, "?");
}

/** Pecah teks menjadi baris yang muat dalam `lebar`; kata yang lebih panjang dari lebar dipotong. */
export function bungkus(teks: string, font: Pick<PDFFont, "widthOfTextAtSize">, ukuran: number, lebar: number): string[] {
  const hasil: string[] = [];
  let baris = "";
  for (const kata of amanWinAnsi(teks).split(" ").filter(Boolean)) {
    let sisa = kata;
    while (font.widthOfTextAtSize(sisa, ukuran) > lebar) {
      let potong = sisa.length - 1;
      while (potong > 1 && font.widthOfTextAtSize(sisa.slice(0, potong), ukuran) > lebar) potong--;
      if (baris) {
        hasil.push(baris);
        baris = "";
      }
      hasil.push(sisa.slice(0, potong));
      sisa = sisa.slice(potong);
    }
    const coba = baris ? `${baris} ${sisa}` : sisa;
    if (font.widthOfTextAtSize(coba, ukuran) <= lebar) baris = coba;
    else {
      hasil.push(baris);
      baris = sisa;
    }
  }
  if (baris) hasil.push(baris);
  return hasil;
}

interface Alat {
  doc: PDFDocument;
  reg: PDFFont;
  tebal: PDFFont;
}

function tulis(h: PDFPage, a: Alat, teks: string, x: number, y: number, o: { ukuran?: number; tebal?: boolean; warna?: ReturnType<typeof rgb>; lebar?: number; spasi?: number } = {}): number {
  const ukuran = o.ukuran ?? 10;
  const font = o.tebal ? a.tebal : a.reg;
  const baris = o.lebar ? bungkus(teks, font, ukuran, o.lebar) : [amanWinAnsi(teks)];
  const spasi = o.spasi ?? ukuran * 1.35;
  baris.forEach((b, i) => h.drawText(b, { x, y: y - i * spasi, size: ukuran, font, color: o.warna ?? rgb(0.1, 0.12, 0.18) }));
  return y - baris.length * spasi;
}

function kepala(h: PDFPage, a: Alat, data: DataPdfTtd, halaman: number, jumlah: number): number {
  const [lebar, tinggi] = A4;
  h.drawRectangle({ x: 0, y: tinggi - 70, width: lebar, height: 70, color: BIRU });
  tulis(h, a, "HALAMAN PENGESAHAN", MARGIN, tinggi - 36, { ukuran: 16, tebal: true, warna: rgb(1, 1, 1) });
  tulis(h, a, "Tanda tangan elektronik melalui WiCon - PT Waskita Karya Infrastruktur", MARGIN, tinggi - 54, { ukuran: 9, warna: rgb(0.8, 0.86, 0.95) });
  tulis(h, a, `${halaman}/${jumlah}`, lebar - MARGIN - 20, tinggi - 36, { ukuran: 9, warna: rgb(0.8, 0.86, 0.95) });
  let y = tinggi - 100;
  y = tulis(h, a, data.judul, MARGIN, y, { ukuran: 14, tebal: true, lebar: lebar - MARGIN * 2, warna: BIRU });
  y = tulis(h, a, `${data.nomorPengajuan}${data.mitra ? `  |  ${data.mitra}` : ""}`, MARGIN, y - 2, { ukuran: 10, warna: ABU, lebar: lebar - MARGIN * 2 });
  return y - 10;
}

function kotakTtd(h: PDFPage, a: Alat, p: Penandatangan, gambar: PDFImage | null, x: number, yAtas: number, lebar: number, tinggiKotak: number) {
  const sah = sudahTtd(p);
  h.drawRectangle({ x, y: yAtas - tinggiKotak, width: lebar, height: tinggiKotak, borderColor: sah ? HIJAU : GARIS, borderWidth: sah ? 1.2 : 0.8, color: rgb(1, 1, 1) });
  const dalam = lebar - 20;
  let y = tulis(h, a, p.peran.toUpperCase(), x + 10, yAtas - 18, { ukuran: 8, tebal: true, warna: ABU, lebar: dalam });
  const areaTinggi = 54;
  const yArea = y - 4;
  if (gambar) {
    const skala = Math.min(dalam / gambar.width, areaTinggi / gambar.height, 1.6);
    const w = gambar.width * skala;
    const t = gambar.height * skala;
    h.drawImage(gambar, { x: x + 10 + (dalam - w) / 2, y: yArea - areaTinggi + (areaTinggi - t) / 2, width: w, height: t });
  } else {
    tulis(h, a, sah ? "(gambar tanda tangan tidak tersedia)" : "belum menandatangani", x + 10, yArea - areaTinggi / 2, { ukuran: 9, warna: ABU });
  }
  y = yArea - areaTinggi - 2;
  h.drawLine({ start: { x: x + 10, y }, end: { x: x + lebar - 10, y }, thickness: 0.6, color: GARIS });
  y = tulis(h, a, p.nama, x + 10, y - 12, { ukuran: 10.5, tebal: true, lebar: dalam });
  if (p.jabatan) y = tulis(h, a, p.jabatan, x + 10, y - 1, { ukuran: 8.5, warna: ABU, lebar: dalam });
  if (sah) {
    y = tulis(h, a, `Ditandatangani ${waktuWib(p.waktu)}`, x + 10, y - 3, { ukuran: 8, warna: HIJAU, lebar: dalam });
    if (p.luar && p.dicatatOleh) y = tulis(h, a, `Pihak luar, dicatat oleh ${p.dicatatOleh}`, x + 10, y, { ukuran: 7.5, warna: ABU, lebar: dalam });
    else if (p.email) y = tulis(h, a, p.email, x + 10, y, { ukuran: 7.5, warna: ABU, lebar: dalam });
    if (p.jejak) tulis(h, a, `Jejak ${p.jejak.slice(0, 16)}...${p.jejak.slice(-6)}`, x + 10, y - 1, { ukuran: 7, warna: ABU });
  }
}

/** Buat PDF final. Mengembalikan byte PDF; melempar galat bila pdfAsli rusak. */
export async function buatPdfTtd(data: DataPdfTtd): Promise<Uint8Array> {
  const doc = data.pdfAsli ? await PDFDocument.load(data.pdfAsli, { ignoreEncryption: false }) : await PDFDocument.create();
  doc.setTitle(amanWinAnsi(`${data.nomorPengajuan} - ${data.judul} (bertanda tangan)`));
  doc.setProducer("WiCon - PT Waskita Karya Infrastruktur");
  doc.setCreator("WiCon");
  const a: Alat = { doc, reg: await doc.embedFont(StandardFonts.Helvetica), tebal: await doc.embedFont(StandardFonts.HelveticaBold) };

  const gambar = new Map<string, PDFImage | null>();
  for (const p of data.isi.penandatangan) {
    const png = sudahTtd(p) ? data.ttd[p.id] : null;
    gambar.set(p.id, png ? await doc.embedPng(png).catch(() => null) : null);
  }

  const daftar = data.isi.penandatangan;
  // Halaman pertama memuat keterangan dokumen sehingga hanya muat dua baris (4 kotak); halaman lanjutan tiga baris (6).
  const kapasitas = (h: number) => (h === 0 ? 4 : 6);
  const jumlah = daftar.length <= kapasitas(0) ? 1 : 1 + Math.ceil((daftar.length - kapasitas(0)) / kapasitas(1));
  const [lebar, tinggi] = A4;
  const kolom = (lebar - MARGIN * 2 - 14) / 2;
  const tinggiKotak = 176;

  for (let h = 0; h < jumlah; h++) {
    const halaman = doc.addPage(A4);
    let y = kepala(halaman, a, data, h + 1, jumlah);
    if (h === 0) {
      const status = statusPermintaan(data.isi);
      y = tulis(halaman, a, "Dokumen yang disahkan", MARGIN, y - 4, { ukuran: 9, tebal: true, warna: ABU });
      y = tulis(halaman, a, data.isi.dokumen.nama, MARGIN, y - 1, { ukuran: 10.5, lebar: lebar - MARGIN * 2 });
      y = tulis(halaman, a, `SHA-256: ${data.isi.dokumen.sha256 || "(tidak tersedia)"}`, MARGIN, y - 1, { ukuran: 7.5, warna: ABU, lebar: lebar - MARGIN * 2 });
      y = tulis(halaman, a, `Status: ${status}${data.isi.berurutan ? "  |  penandatanganan berurutan" : ""}`, MARGIN, y - 4, { ukuran: 9, warna: ABU });
      y -= 12;
    }
    const awal = h === 0 ? 0 : kapasitas(0) + (h - 1) * kapasitas(1);
    const irisan = daftar.slice(awal, awal + kapasitas(h));
    irisan.forEach((p, i) => {
      const x = MARGIN + (i % 2) * (kolom + 14);
      const yAtas = y - Math.floor(i / 2) * (tinggiKotak + 12);
      kotakTtd(halaman, a, p, gambar.get(p.id) ?? null, x, yAtas, kolom, tinggiKotak);
    });
    // Kaki halaman: keterangan hukum dan tautan pemeriksaan.
    const catatan =
      "Tanda tangan di halaman ini berupa gambar tanda tangan yang dibubuhkan penandatangan setelah masuk dengan akun Microsoft perusahaannya di WiCon, " +
      "lengkap dengan waktu dan jejak SHA-256 yang mengikatnya pada dokumen di atas. Ini bukan tanda tangan elektronik tersertifikasi, dan tidak menggantikan e-meterai bila dipersyaratkan.";
    let yk = 98;
    yk = tulis(halaman, a, catatan, MARGIN, yk, { ukuran: 7.5, warna: ABU, lebar: lebar - MARGIN * 2 });
    tulis(halaman, a, `Periksa di WiCon: ${data.urlVerifikasi}  |  dibuat ${waktuWib(data.dibuatPada)}`, MARGIN, Math.max(yk - 2, 36), { ukuran: 7.5, warna: BIRU, lebar: lebar - MARGIN * 2 });
    halaman.drawLine({ start: { x: MARGIN, y: 104 }, end: { x: lebar - MARGIN, y: 104 }, thickness: 0.6, color: GARIS });
  }
  void tinggi;
  return doc.save();
}
