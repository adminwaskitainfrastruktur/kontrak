// Uji pembuat PDF final bertanda tangan: lib/pdfTtd.ts (pdf-lib, berjalan di Node tanpa DOM).
// Jalankan: npx --yes tsx scripts/uji-pdf-ttd.ts   (menulis contoh ke scripts/.keluaran bila ada argumen --simpan)
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { amanWinAnsi, buatPdfTtd, bungkus, waktuWib, type DataPdfTtd } from "../src/lib/pdfTtd";
import { susunPenandatangan, type IsiPermintaan } from "../src/lib/penandatangan";

let n = 0;
const ok = async (nama: string, fn: () => void | Promise<void>) => { await fn(); n++; console.log(`  ok  ${nama}`); };

// PNG RGBA sederhana: coretan diagonal hitam-biru di latar transparan.
function crc32(b: Uint8Array): number {
  let c, crc = 0xffffffff;
  for (let i = 0; i < b.length; i++) {
    c = (crc ^ b[i]!) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function potong(tipe: string, isi: Uint8Array): Buffer {
  const t = Buffer.from(tipe, "ascii");
  const panjang = Buffer.alloc(4); panjang.writeUInt32BE(isi.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, isi])));
  return Buffer.concat([panjang, t, isi, crc]);
}
function buatPng(w = 240, h = 90): Uint8Array {
  const baris: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const r = Buffer.alloc(1 + w * 4);
    for (let x = 0; x < w; x++) {
      const garis = Math.abs(y - (h - (x * h) / w) - Math.sin(x / 9) * 10) < 2.4;
      if (garis) { r[1 + x * 4] = 11; r[2 + x * 4] = 31; r[3 + x * 4] = 92; r[4 + x * 4] = 255; }
    }
    baris.push(r);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), potong("IHDR", ihdr), potong("IDAT", deflateSync(Buffer.concat(baris))), potong("IEND", Buffer.alloc(0))]);
}

const isiContoh = (jumlah: number): IsiPermintaan => ({
  v: 1,
  berurutan: true,
  dokumen: { id: "d1", nama: "Perjanjian Kerja Sama - PT Contoh Mitra Sejahtera.pdf", ukuran: 1234, sha256: "a".repeat(64) },
  penandatangan: susunPenandatangan(
    Array.from({ length: jumlah }, (_, i) => ({ nama: `Penandatangan ${i + 1} dengan Nama yang Cukup Panjang`, jabatan: "Direktur Operasi dan Pengembangan Bisnis", peran: i === 0 ? "Pihak Pertama" : `Pihak ${i + 1}`, email: `p${i}@waskitainfrastruktur.co.id`, luar: i === jumlah - 1 && jumlah > 1 })),
  ).map((p, i) => (i < jumlah - 1 ? { ...p, waktu: "2026-10-16T03:20:00Z", oleh: p.nama, jejak: "f".repeat(64) } : p)),
});
const dasar = (jumlah: number, tambahan: Partial<DataPdfTtd> = {}): DataPdfTtd => {
  const isi = isiContoh(jumlah);
  return { nomorPengajuan: "KTR-2026-0007", judul: "Perjanjian Kerja Sama Pengelolaan Area Parkir dan Kawasan Komersial", mitra: "PT Contoh Mitra Sejahtera", isi, ttd: Object.fromEntries(isi.penandatangan.map((p) => [p.id, buatPng()])), urlVerifikasi: "https://wicon.waskitainfrastruktur.co.id/#/tanda-tangan/7", dibuatPada: "2026-10-16T03:30:00Z", ...tambahan };
};

console.log("teks");
await ok("amanWinAnsi mengganti karakter di luar WinAnsi", () => {
  assert.equal(amanWinAnsi("A → B ✓ “x”"), "A -> B v \"x\"");
  assert.equal(amanWinAnsi("日本"), "??");
  assert.equal(amanWinAnsi("Rp 1.000 — ok…"), "Rp 1.000 — ok…");
});
await ok("bungkus memecah baris dan kata yang kepanjangan", () => {
  const font = { widthOfTextAtSize: (t: string, s: number) => t.length * s * 0.5 };
  assert.deepEqual(bungkus("aa bb cc", font, 10, 12), ["aa", "bb", "cc"]);
  assert.deepEqual(bungkus("aa bb cc", font, 10, 100), ["aa bb cc"]);
  for (const b of bungkus("kata sangat panjang sekali tanpa spasi lain xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", font, 10, 60)) assert.ok(font.widthOfTextAtSize(b, 10) <= 60, b);
  assert.deepEqual(bungkus("", font, 10, 60), []);
});
await ok("waktuWib memakai zona Jakarta", () => {
  assert.match(waktuWib("2026-10-16T17:30:00Z"), /17 Oktober 2026/);
  assert.match(waktuWib("2026-10-16T17:30:00Z"), /00:30 WIB/);
  assert.equal(waktuWib(""), "-");
});

console.log("pdf");
await ok("halaman pengesahan berdiri sendiri (dokumen Word)", async () => {
  const bytes = await buatPdfTtd(dasar(3));
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.match(doc.getTitle() ?? "", /KTR-2026-0007/);
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), "%PDF-");
});
await ok("lebih dari empat penandatangan menambah halaman", async () => {
  assert.equal((await PDFDocument.load(await buatPdfTtd(dasar(4)))).getPageCount(), 1);
  assert.equal((await PDFDocument.load(await buatPdfTtd(dasar(5)))).getPageCount(), 2);
  assert.equal((await PDFDocument.load(await buatPdfTtd(dasar(10)))).getPageCount(), 2);
  assert.equal((await PDFDocument.load(await buatPdfTtd(dasar(11)))).getPageCount(), 3);
});
await ok("PDF asli dipertahankan, pengesahan di belakangnya", async () => {
  const asli = await PDFDocument.create();
  asli.addPage([595, 842]); asli.addPage([595, 842]); asli.addPage([595, 842]);
  const bytes = await buatPdfTtd(dasar(2, { pdfAsli: await asli.save() }));
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 4);
});
await ok("tanda tangan hilang atau PNG rusak tidak menggagalkan PDF", async () => {
  const d = dasar(2);
  d.ttd = { p1: new Uint8Array([1, 2, 3]), p2: null };
  assert.equal((await PDFDocument.load(await buatPdfTtd(d))).getPageCount(), 1);
});
await ok("teks non-Latin dan nama sangat panjang tidak melempar", async () => {
  const d = dasar(2, { judul: "Kontrak 日本 ✓ " + "panjang ".repeat(40), mitra: "PT “Ajaib” → Baru" });
  assert.equal((await PDFDocument.load(await buatPdfTtd(d))).getPageCount(), 1);
});
await ok("PDF asli yang bukan PDF ditolak dengan galat", async () => {
  await assert.rejects(buatPdfTtd(dasar(1, { pdfAsli: new Uint8Array([1, 2, 3, 4]) })));
});

if (process.argv.includes("--simpan")) {
  mkdirSync("scripts/.keluaran", { recursive: true });
  writeFileSync("scripts/.keluaran/contoh-ttd.pdf", await buatPdfTtd(dasar(7)));
  console.log("  contoh ditulis ke scripts/.keluaran/contoh-ttd.pdf");
}
console.log(`\n${n} uji lulus`);
