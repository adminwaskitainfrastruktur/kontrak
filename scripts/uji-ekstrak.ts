// Uji lib/parserID.ts, lib/pemindai.ts, lib/ekstrak.ts (bagian murni + DOCX), dan lib/templateDocx.ts.
// Jalankan: npx --yes tsx scripts/uji-ekstrak.ts
// Tidak menyentuh jaringan. PDF tidak diuji di sini (pdf.js butuh worker peramban); uji PDF dilakukan manual.
import assert from "node:assert/strict";
import {
  bacaAngkaCampur,
  hitungBerakhir,
  kapitalJudul,
  samaNama,
  urailJangkaWaktu,
  urailJenis,
  urailJudul,
  urailNilaiRupiah,
  urailNomorPerjanjian,
  urailPihak,
  urailTanggal,
} from "../src/lib/parserID";
import { judulRingkas, KLAUSUL_INTI, pilihNilai, pindaiDraf, pindaiKlausul, ringkasPindai } from "../src/lib/pemindai";
import { BATAS_UKURAN_EKSTRAK, cekBerkasEkstrak, ekstrakTeks, GalatEkstrak, jenisBerkasDari, nilaiKeterbacaan } from "../src/lib/ekstrak";
import { buatDrafDocx, daftarPenanda, JENIS_DRAF, jenisDrafDari, lamaBerlaku, namaBerkasDraf, susunDraf, teksDraf, versiDrafBerikut, type DataDraf } from "../src/lib/templateDocx";

let n = 0;
const uji = async (nama: string, fn: () => void | Promise<void>) => {
  await fn();
  n++;
  console.log(`ok  ${nama}`);
};

const nilai1 = (t: string) => urailNilaiRupiah(t)[0];
const tgl1 = (t: string) => urailTanggal(t)[0];
const jangka1 = (t: string) => urailJangkaWaktu(t)[0];

// --- Sampel nyata: nilai rupiah ---------------------------------------------------------------

await uji("01 nilai: Rp 1.250.000.000,- dengan terbilang -> tinggi", () => {
  const t = nilai1("Nilai Kontrak sebesar Rp 1.250.000.000,- (satu miliar dua ratus lima puluh juta rupiah) sudah termasuk PPN.")!;
  assert.deepEqual(t.nilai, { nilai: 1_250_000_000, mataUang: "IDR" });
  assert.equal(t.keyakinan, "tinggi");
  assert.match(t.sumber, /1\.250\.000\.000/);
});
await uji("02 nilai: Rp1,25 miliar", () => assert.equal(nilai1("dengan nilai Rp1,25 miliar")!.nilai.nilai, 1_250_000_000));
await uji("03 nilai: Rp. 75.000.000 (tujuh puluh lima juta rupiah)", () => {
  const t = nilai1("sebesar Rp. 75.000.000 (tujuh puluh lima juta rupiah)")!;
  assert.equal(t.nilai.nilai, 75_000_000);
  assert.equal(t.keyakinan, "tinggi");
});
await uji("04 nilai: angka dan huruf berbeda -> rendah dengan catatan", () => {
  const t = nilai1("sebesar Rp 80.000.000 (delapan juta rupiah)")!;
  assert.equal(t.keyakinan, "rendah");
  assert.match(t.catatan ?? "", /berbeda/);
});
await uji("05 nilai: USD 10,000.50 berformat Inggris", () => assert.deepEqual(nilai1("senilai USD 10,000.50")!.nilai, { nilai: 10_000.5, mataUang: "USD" }));
await uji("06 nilai: akhiran 'rupiah' tanpa Rp", () => assert.equal(nilai1("biaya sebesar 500.000.000 rupiah")!.nilai.nilai, 500_000_000));
await uji("07 nilai: desimal sen Rp 12.500.000,50", () => assert.equal(nilai1("Harga sewa Rp 12.500.000,50 per bulan")!.nilai.nilai, 12_500_000.5));
await uji("08 nilai: Rp 3 juta dan IDR 2.500.000.000", () => {
  assert.equal(nilai1("Rp 3 juta")!.nilai.nilai, 3_000_000);
  assert.equal(nilai1("IDR 2.500.000.000")!.nilai.nilai, 2_500_000_000);
});
await uji("09 nilai: bacaAngkaCampur bentuk ambigu", () => {
  assert.deepEqual(bacaAngkaCampur("1.250.000"), { nilai: 1_250_000, pasti: true });
  assert.equal(bacaAngkaCampur("1,000")!.pasti, false);
  assert.equal(bacaAngkaCampur("abc"), null);
});

// --- Sampel nyata: tanggal ------------------------------------------------------------------------

await uji("10 tanggal: 2 Oktober 2026", () => assert.equal(tgl1("ditandatangani pada 2 Oktober 2026")!.nilai, "2026-10-02"));
await uji("11 tanggal: 02-10-2026 dibaca hari-bulan-tahun (sedang)", () => {
  const t = tgl1("tanggal 02-10-2026")!;
  assert.equal(t.nilai, "2026-10-02");
  assert.equal(t.keyakinan, "sedang");
});
await uji("12 tanggal: 'tanggal 2 (dua) bulan Oktober tahun 2026'", () => assert.equal(tgl1("tanggal 2 (dua) bulan Oktober tahun 2026")!.nilai, "2026-10-02"));
await uji("13 tanggal: singkatan dan ejaan lama (Jan, Nopember, Pebruari)", () => {
  assert.equal(tgl1("1 Jan 2027")!.nilai, "2027-01-01");
  assert.equal(tgl1("Jakarta, 17 Nopember 2026")!.nilai, "2026-11-17");
  assert.equal(tgl1("28 Pebruari 2027")!.nilai, "2027-02-28");
});
await uji("14 tanggal: 31/12/2027 dan ISO", () => {
  assert.equal(tgl1("s.d. 31/12/2027")!.nilai, "2027-12-31");
  assert.equal(tgl1("2026-10-02")!.nilai, "2026-10-02");
});
await uji("15 tanggal tepi: 30 Februari ditolak, 10-13-2026 dibalik dengan keyakinan rendah", () => {
  assert.equal(urailTanggal("30 Februari 2026").length, 0);
  const t = tgl1("10-13-2026")!;
  assert.equal(t.nilai, "2026-10-13");
  assert.equal(t.keyakinan, "rendah");
});

// --- Sampel nyata: jangka waktu --------------------------------------------------------------------

await uji("16 jangka: 12 (dua belas) bulan setelah 'jangka waktu' -> tinggi", () => {
  const j = jangka1("Jangka waktu Perjanjian ini adalah 12 (dua belas) bulan")!;
  assert.deepEqual(j.nilai, { jumlah: 12, satuan: "bulan", kalender: true });
  assert.equal(j.keyakinan, "tinggi");
});
await uji("17 jangka: selama 2 tahun", () => assert.deepEqual(jangka1("berlaku selama 2 tahun")!.nilai, { jumlah: 2, satuan: "tahun", kalender: true }));
await uji("18 jangka: 14 hari kerja bukan kalender", () => assert.equal(jangka1("dibayar dalam 14 hari kerja")!.nilai.kalender, false));
await uji("19 jangka: 180 (seratus delapan puluh) hari kalender dan tulisan huruf saja", () => {
  assert.equal(jangka1("berlaku selama 180 (seratus delapan puluh) hari kalender")!.nilai.jumlah, 180);
  assert.equal(jangka1("jangka waktu dua belas bulan")!.nilai.jumlah, 12);
});
await uji("20 jangka tepi: angka dan huruf berbeda diberi catatan", () => assert.match(jangka1("jangka waktu 12 (tiga belas) bulan")!.catatan ?? "", /berbeda/));
await uji("21 hitungBerakhir: 1 Jan + 12 bulan = 31 Des; 31 Jan + 1 bulan = 27 Feb; hari kerja null", () => {
  assert.equal(hitungBerakhir("2027-01-01", { jumlah: 12, satuan: "bulan", kalender: true }), "2027-12-31");
  assert.equal(hitungBerakhir("2027-01-31", { jumlah: 1, satuan: "bulan", kalender: true }), "2027-02-27");
  assert.equal(hitungBerakhir("2027-01-01", { jumlah: 5, satuan: "hari", kalender: false }), null);
});

// --- Sampel nyata: pihak, nomor, judul, jenis -------------------------------------------------------

const KOMPARISI = `PT Waskita Karya Infrastruktur, berkedudukan di Jakarta Timur, diwakili oleh Bapak Budi Santoso, selaku Direktur Operasi, selanjutnya disebut "PIHAK PERTAMA"; dan
PT Beton Jaya Abadi, berkedudukan di Bekasi, diwakili oleh Ibu Sari Dewi, selaku Direktur Utama, selanjutnya disebut "PIHAK KEDUA".`;

await uji("22 pihak: komparisi dua PT dengan wakil, jabatan, peran", () => {
  const p = urailPihak(KOMPARISI);
  assert.equal(p.length, 2);
  assert.equal(p[0]!.nilai.adalahWki, true);
  assert.equal(p[1]!.nilai.nama, "Beton Jaya Abadi");
  assert.equal(p[1]!.nilai.wakil, "Sari Dewi");
  assert.equal(p[1]!.nilai.jabatan, "Direktur Utama");
  assert.equal(p[1]!.nilai.peran, "PIHAK KEDUA");
  assert.equal(p[1]!.keyakinan, "tinggi");
});
await uji("23 pihak: CV. dengan titik, nama berulang dihitung sekali", () => {
  const p = urailPihak("CV. Maju Bersama, beralamat di Bandung. Selanjutnya CV Maju Bersama wajib ...");
  assert.equal(p.length, 1);
  assert.equal(p[0]!.nilai.bentuk, "CV");
});
await uji("24 samaNama: abaikan PT, Tbk, (Persero), tanda baca", () => {
  assert.ok(samaNama("PT Beton Jaya Abadi", "Beton Jaya Abadi, PT"));
  assert.ok(samaNama("PT Semen Indonesia (Persero) Tbk", "Semen Indonesia"));
  assert.ok(!samaNama("PT Beton Jaya", "PT Baja Perkasa"));
});
await uji("25 nomor perjanjian: berbagai bentuk", () => {
  assert.equal(urailNomorPerjanjian("Nomor: 012/PKS/WKI/X/2026")[0]!.nilai, "012/PKS/WKI/X/2026");
  assert.equal(urailNomorPerjanjian("No. 45 / SPK / WKI-PROC / 2026")[0]!.nilai, "45/SPK/WKI-PROC/2026");
  assert.equal(urailNomorPerjanjian("No. SPK-2026-0045 tanggal")[0]!.nilai, "SPK-2026-0045");
});
await uji("26 judul: kapital menjadi judul, NOMOR dipotong", () => {
  assert.equal(urailJudul("PERJANJIAN PENGADAAN BESI BETON\nNOMOR: 1/2/3\nANTARA")!.nilai, "Perjanjian Pengadaan Besi Beton");
  assert.equal(kapitalJudul("SEWA ALAT DAN PT WKI"), "Sewa Alat dan PT WKI");
});
await uji("27 jenis dari judul: Sewa, Addendum, MoU (ambigu -> sedang), NDA", () => {
  assert.equal(urailJenis("PERJANJIAN SEWA ALAT BERAT EXCAVATOR\nNomor: 1/SW/2026")!.nilai, "Sewa");
  assert.equal(urailJenis("ADDENDUM KE-1 ATAS PERJANJIAN PENGADAAN")!.nilai, "Addendum / Amandemen");
  const mou = urailJenis("NOTA KESEPAHAMAN TENTANG KERJA SAMA")!;
  assert.equal(mou.nilai, "MoU / Nota Kesepahaman");
  assert.equal(mou.keyakinan, "sedang");
  assert.equal(urailJenis("PERJANJIAN KERAHASIAAN INFORMASI")!.nilai, "Kerahasiaan (NDA)");
});

// --- Pemindai ---------------------------------------------------------------------------------

const DRAF_SAMPEL = `PERJANJIAN PENGADAAN BARANG
TENTANG PENGADAAN BETON READY MIX PROYEK TOL X
Nomor: 077/PB/WKI/X/2026

Pada hari ini, Jumat, tanggal 2 Oktober 2026, yang bertanda tangan di bawah ini:
${KOMPARISI}

Pasal 1
RUANG LINGKUP
PIHAK KEDUA menyediakan beton ready mix untuk proyek.
Pasal 2
NILAI KONTRAK
Nilai Kontrak adalah sebesar Rp 2.400.000.000,- (dua miliar empat ratus juta rupiah) termasuk PPN.
Jaminan pelaksanaan sebesar Rp 120.000.000 (seratus dua puluh juta rupiah).
Denda keterlambatan Rp 2.400.000 per hari.
Pasal 3
JANGKA WAKTU
Perjanjian ini berlaku terhitung sejak tanggal 1 November 2026 sampai dengan tanggal 31 Oktober 2027.
Pasal 4
CARA PEMBAYARAN
Pembayaran dilakukan bulanan.
Pasal 5
PENYELESAIAN PERSELISIHAN
Diselesaikan secara musyawarah.
Dibuat dalam rangkap dua bermeterai cukup.`;

await uji("28 pindai: saran nilai mengabaikan jaminan dan denda", () => {
  const h = pindaiDraf(DRAF_SAMPEL);
  assert.equal(h.saranIsian.nilai, 2_400_000_000);
  assert.equal(h.saranIsian.mataUang, "IDR");
  assert.equal(h.rincianSaran.nilai!.keyakinan, "tinggi");
});
await uji("29 pindai: mitra bukan WKI, tanggal mulai/berakhir, jenis, judul ringkas", () => {
  const h = pindaiDraf(DRAF_SAMPEL);
  assert.equal(h.saranIsian.mitra, "PT Beton Jaya Abadi");
  assert.equal(h.saranIsian.tanggalMulai, "2026-11-01");
  assert.equal(h.saranIsian.tanggalBerakhir, "2027-10-31");
  assert.equal(h.saranIsian.jenis, "Pengadaan Barang");
  assert.equal(h.saranIsian.judul, "Pengadaan Beton Ready Mix Proyek Tol X");
});
await uji("30 pindai: klausul ada dan hilang, relevansi per jenis", () => {
  const h = pindaiDraf(DRAF_SAMPEL);
  const k = Object.fromEntries(h.klausul.map((x) => [x.id, x]));
  for (const id of ["para-pihak", "objek", "nilai", "jangka-waktu", "pembayaran", "jaminan", "denda", "sengketa", "meterai"]) assert.ok(k[id]!.ada, `${id} harus ada`);
  for (const id of ["force-majeure", "hukum", "kerahasiaan", "pengakhiran"]) assert.ok(!k[id]!.ada, `${id} harus tidak ada`);
  assert.equal(k["jangka-waktu"]!.keyakinan, "tinggi");
  assert.equal(h.klausul.length, KLAUSUL_INTI.length);
  const nda = pindaiKlausul("PERJANJIAN KERAHASIAAN", "Kerahasiaan (NDA)");
  assert.equal(nda.find((x) => x.id === "pembayaran")!.relevan, false);
});
await uji("31 pindai: selisih terhadap pengajuan (cocok, beda, periksa)", () => {
  const h = pindaiDraf(DRAF_SAMPEL, { mitra: "Beton Jaya Abadi", nilai: 2_500_000_000, mataUang: "IDR", tanggalMulai: "2026-11-01", tanggalBerakhir: null, jenis: "Pengadaan Barang" });
  const s = Object.fromEntries(h.selisih.map((x) => [x.bidang, x]));
  assert.equal(s.mitra!.tingkat, "cocok");
  assert.equal(s.nilai!.tingkat, "beda");
  assert.equal(s.tanggalMulai!.tingkat, "cocok");
  assert.equal(s.tanggalBerakhir!.tingkat, "periksa");
  assert.equal(s.tanggalBerakhir!.di_pengajuan, "Belum diisi");
  assert.equal(s.jenis!.tingkat, "cocok");
});
await uji("32 pindai: tidak menimpa data pengajuan dan tanpa pembanding selisih kosong", () => {
  const data = { mitra: "PT Lain", nilai: 1 };
  const salinan = JSON.stringify(data);
  pindaiDraf(DRAF_SAMPEL, data);
  assert.equal(JSON.stringify(data), salinan);
  assert.equal(pindaiDraf(DRAF_SAMPEL).selisih.length, 0);
});
await uji("33 pindai: MoU tidak menyarankan nilai; tanggal berakhir dihitung dari jangka", () => {
  const h = pindaiDraf("NOTA KESEPAHAMAN\nBiaya sebesar Rp 5.000.000 ditanggung masing-masing.\nJangka waktu Nota Kesepahaman ini 12 (dua belas) bulan terhitung sejak tanggal 1 Januari 2027.", { jenis: "MoU / Nota Kesepahaman" });
  assert.equal(h.saranIsian.nilai, undefined);
  assert.equal(h.saranIsian.tanggalMulai, "2027-01-01");
  assert.equal(h.saranIsian.tanggalBerakhir, "2027-12-31");
  assert.equal(h.rincianSaran.tanggalBerakhir!.keyakinan, "rendah");
});
await uji("34 pindai tepi: teks kosong -> keterbacaan buruk, tidak ada saran, penafian ada", () => {
  const h = pindaiDraf("");
  assert.equal(h.keterbacaan.tingkat, "buruk");
  assert.deepEqual(h.saranIsian, {});
  assert.ok(h.klausul.every((k) => !k.ada));
  assert.match(h.penafian, /bukan nasihat hukum/);
  assert.match(ringkasPindai(h), /0\/13 klausul/);
});
await uji("35 pilihNilai: nilai kecil atau hanya denda tidak dipilih", () => {
  const teks = "denda keterlambatan sebesar Rp 500 per hari";
  assert.equal(pilihNilai(teks, urailNilaiRupiah(teks)), null);
  assert.equal(judulRingkas("Perjanjian Sewa tentang Alat Berat"), "Alat Berat");
});
await uji("36 pindai: catatan angka vs huruf yang berbeda dilaporkan", () => {
  const h = pindaiDraf("Nilai Kontrak sebesar Rp 80.000.000 (delapan juta rupiah).");
  assert.ok(h.catatan.some((c) => /berbeda/.test(c)));
});

// --- Ekstraksi (bagian murni) ------------------------------------------------------------------

await uji("37 ekstrak: jenis berkas dan penolakan", () => {
  assert.equal(jenisBerkasDari("Draf.PDF"), "pdf");
  assert.equal(jenisBerkasDari("draf.docx"), "docx");
  assert.equal(jenisBerkasDari("x.bin", "application/pdf"), "pdf");
  assert.match(cekBerkasEkstrak("lama.doc", 100)!, /\.doc/);
  assert.match(cekBerkasEkstrak("foto.jpg", 100)!, /PDF dan Word/);
  assert.match(cekBerkasEkstrak("besar.pdf", BATAS_UKURAN_EKSTRAK + 1)!, /30 MB/);
  assert.match(cekBerkasEkstrak("kosong.pdf", 0)!, /kosong/);
  assert.equal(cekBerkasEkstrak("ok.pdf", 1000), null);
});
await uji("38 ekstrak: keterbacaan pindaian, font tersandi, normal", () => {
  assert.equal(nilaiKeterbacaan("", 3).terbaca, false);
  assert.equal(nilaiKeterbacaan("Hal 1", 10).terbaca, false);
  assert.equal(nilaiKeterbacaan(" ab", 1).terbaca, false);
  assert.equal(nilaiKeterbacaan("Perjanjian ini dibuat oleh para pihak. ".repeat(40), 1).terbaca, true);
});
await uji("39 ekstrak: berkas ditolak melempar GalatEkstrak", async () => {
  await assert.rejects(ekstrakTeks(new File(["x"], "gambar.png")), GalatEkstrak);
  await assert.rejects(ekstrakTeks(new File(["bukan zip"], "rusak.docx")), GalatEkstrak);
});
await uji("40 ekstrak: teks polos .txt terbaca", async () => {
  const h = await ekstrakTeks(new File([DRAF_SAMPEL], "draf.txt", { type: "text/plain" }));
  assert.equal(h.terbaca, true);
  assert.equal(h.jenisBerkas, "teks");
  assert.match(h.teks, /Beton Jaya Abadi/);
});

// --- Templat draf .docx -------------------------------------------------------------------------

const DATA: DataDraf = {
  judul: "Pengadaan Besi Beton Proyek Tol Kayuagung",
  nomorPengajuan: "KTR-2026-0012",
  mitra: "PT Beton Jaya Abadi",
  alamatMitra: "Jl. Raya Bekasi No. 5, Bekasi",
  nilai: 1_250_000_000,
  mataUang: "IDR",
  tanggalMulai: "2027-01-01",
  tanggalBerakhir: "2027-12-31",
  dibuatPada: "2026-10-02T00:00:00Z",
};

await uji("41 templat: nama berkas dan versi", () => {
  assert.equal(namaBerkasDraf({ nomorPengajuan: "KTR-2026-0012", judul: 'Sewa "Alat" Berat: Tol/X' }, 2), "Draft v2 KTR-2026-0012 - Sewa Alat Berat Tol X.docx");
  assert.equal(versiDrafBerikut(["Draft v1 KTR.docx", "draft v3 lama.docx", "Penawaran.pdf"]), 4);
  assert.equal(versiDrafBerikut([]), 1);
  assert.equal(jenisDrafDari("Lainnya"), "Pengadaan Jasa");
  assert.equal(jenisDrafDari("Kerahasiaan (NDA)"), "NDA");
});
await uji("42 templat: lama berlaku rapi (tahun, bulan, hari)", () => {
  assert.deepEqual(lamaBerlaku("2027-01-01", "2027-12-31"), { jumlah: 1, satuan: "tahun", kalender: true });
  assert.deepEqual(lamaBerlaku("2027-01-01", "2027-06-30"), { jumlah: 6, satuan: "bulan", kalender: true });
  assert.deepEqual(lamaBerlaku("2027-01-01", "2027-01-10"), { jumlah: 10, satuan: "hari", kalender: true });
  assert.equal(lamaBerlaku("2027-02-01", "2027-01-01"), null);
});
await uji("43 templat: setiap jenis memuat catatan draf, terbilang, penanda, tanda tangan", () => {
  for (const j of JENIS_DRAF) {
    const blok = susunDraf(j, { ...DATA, jenisPerubahan: ["Perpanjangan Waktu", "Perubahan Nilai"], induk: { judul: "Perjanjian Induk", nomor: "001/PB/2026" } });
    const teks = teksDraf(blok);
    assert.match(teks, /DRAF AWAL, wajib ditinjau Legal sebelum digunakan/, j);
    assert.match(teks, /PIHAK KEDUA/, j);
    assert.ok(blok.some((b) => b.tipe === "ttd"), j);
    assert.ok(daftarPenanda(blok).length > 3, j);
    assert.match(teks, /hukum Negara Republik Indonesia/, j);
    if (j !== "MoU" && j !== "NDA") assert.match(teks, /satu miliar dua ratus lima puluh juta rupiah/, j);
  }
});
await uji("44 templat: data kosong menjadi penanda, bukan 'undefined'", () => {
  const teks = teksDraf(susunDraf("Pengadaan Jasa", {}));
  assert.ok(!/undefined|null|NaN/.test(teks));
  assert.match(teks, /\[ISI: nama mitra\]/);
  assert.match(teks, /\[ISI: nilai dalam angka\]/);
});
await uji("45 templat: addendum menyebut induk dan arah perubahan nilai", () => {
  const teks = teksDraf(susunDraf("Addendum", { ...DATA, nilai: -50_000_000, urutanAddendum: 2, jenisPerubahan: ["Perubahan Nilai"], induk: { judul: "Perjanjian Pengadaan", nomor: "001/PB/2026", tanggal: "2026-01-05" } }));
  assert.match(teks, /ADDENDUM KE-2/);
  assert.match(teks, /001\/PB\/2026/);
  assert.match(teks, /berkurang sebesar Rp50\.000\.000 \(lima puluh juta rupiah\)/);
});
await uji("46 templat bolak-balik: .docx -> ekstrak (mammoth) -> pindai cocok dengan data", async () => {
  const blob = await buatDrafDocx("Pengadaan Barang", DATA);
  assert.ok(blob.size > 5000);
  const h = await ekstrakTeks(new File([blob], "draf.docx", { type: blob.type }));
  assert.equal(h.terbaca, true);
  assert.equal(h.jenisBerkas, "docx");
  const p = pindaiDraf(h.teks, { mitra: DATA.mitra, nilai: DATA.nilai, mataUang: "IDR", tanggalMulai: DATA.tanggalMulai, tanggalBerakhir: DATA.tanggalBerakhir, jenis: "Pengadaan Barang" });
  assert.ok(p.klausul.every((k) => k.ada), "draf templat harus memuat semua klausul inti");
  assert.ok(p.selisih.every((s) => s.tingkat === "cocok"), JSON.stringify(p.selisih));
});

console.log(`\n${n} uji lulus`);
