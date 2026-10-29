// Uji lib/terbilang.ts: npx --yes tsx scripts/uji-terbilang.ts
import assert from "node:assert/strict";
import { bacaTerbilang, namaHari, tanggalPanjang, terbilangAngka, terbilangRupiah, terbilangTanggal } from "../src/lib/terbilang";

let n = 0;
const uji = (nama: string, fn: () => void) => {
  fn();
  n++;
  console.log(`ok  ${nama}`);
};

uji("contoh spesifikasi 1.250.000.000", () => assert.equal(terbilangRupiah(1_250_000_000), "satu miliar dua ratus lima puluh juta rupiah"));
uji("nol", () => assert.equal(terbilangRupiah(0), "nol rupiah"));
uji("satu", () => assert.equal(terbilangAngka(1), "satu"));
uji("sepuluh, sebelas, belasan", () => {
  assert.equal(terbilangAngka(10), "sepuluh");
  assert.equal(terbilangAngka(11), "sebelas");
  assert.equal(terbilangAngka(12), "dua belas");
  assert.equal(terbilangAngka(19), "sembilan belas");
});
uji("puluhan", () => {
  assert.equal(terbilangAngka(20), "dua puluh");
  assert.equal(terbilangAngka(99), "sembilan puluh sembilan");
});
uji("seratus dan ratusan", () => {
  assert.equal(terbilangAngka(100), "seratus");
  assert.equal(terbilangAngka(101), "seratus satu");
  assert.equal(terbilangAngka(111), "seratus sebelas");
  assert.equal(terbilangAngka(200), "dua ratus");
  assert.equal(terbilangAngka(999), "sembilan ratus sembilan puluh sembilan");
});
uji("seribu bentuk khusus", () => {
  assert.equal(terbilangAngka(1000), "seribu");
  assert.equal(terbilangAngka(1001), "seribu satu");
  assert.equal(terbilangAngka(1100), "seribu seratus");
  assert.equal(terbilangAngka(2000), "dua ribu");
  assert.equal(terbilangAngka(11_000), "sebelas ribu");
  assert.equal(terbilangAngka(101_000), "seratus satu ribu");
});
uji("juta, miliar, triliun memakai 'satu'", () => {
  assert.equal(terbilangAngka(1_000_000), "satu juta");
  assert.equal(terbilangAngka(1_001_000), "satu juta seribu");
  assert.equal(terbilangAngka(1_000_000_000), "satu miliar");
  assert.equal(terbilangAngka(1_000_000_000_000), "satu triliun");
});
uji("sampai triliun", () => {
  assert.equal(terbilangRupiah(2_345_678_901_234), "dua triliun tiga ratus empat puluh lima miliar enam ratus tujuh puluh delapan juta sembilan ratus satu ribu dua ratus tiga puluh empat rupiah");
  assert.equal(terbilangAngka(999_999_999_999_999), "sembilan ratus sembilan puluh sembilan triliun sembilan ratus sembilan puluh sembilan miliar sembilan ratus sembilan puluh sembilan juta sembilan ratus sembilan puluh sembilan ribu sembilan ratus sembilan puluh sembilan");
});
uji("di luar jangkauan melempar", () => {
  assert.throws(() => terbilangAngka(1e15), RangeError);
  assert.throws(() => terbilangAngka(Number.NaN), RangeError);
  assert.throws(() => terbilangAngka("abc"), RangeError);
});
uji("sen", () => {
  assert.equal(terbilangRupiah(1500.5), "seribu lima ratus rupiah lima puluh sen");
  assert.equal(terbilangRupiah("75000000.25"), "tujuh puluh lima juta rupiah dua puluh lima sen");
  assert.equal(terbilangRupiah(0.5), "nol rupiah lima puluh sen");
});
uji("pembulatan sen dan limpahan ke rupiah", () => {
  assert.equal(terbilangRupiah("99.999"), "seratus rupiah");
  assert.equal(terbilangRupiah(0.1 + 0.2), "nol rupiah tiga puluh sen");
});
uji("negatif", () => {
  assert.equal(terbilangRupiah(-1000), "minus seribu rupiah");
  assert.equal(terbilangRupiah(-0.001), "nol rupiah");
});
uji("mata uang lain", () => {
  assert.equal(terbilangRupiah(25000, "USD"), "dua puluh lima ribu dolar Amerika Serikat");
  assert.equal(terbilangRupiah(10, "EUR"), "sepuluh euro");
});
uji("tanggal", () => {
  assert.equal(tanggalPanjang("2026-10-02"), "2 Oktober 2026");
  assert.equal(terbilangTanggal("2026-10-02"), "dua bulan Oktober tahun dua ribu dua puluh enam");
  assert.equal(namaHari("2026-10-02"), "Jumat");
  assert.equal(terbilangTanggal("2026-10-02", true), "hari Jumat, tanggal dua bulan Oktober tahun dua ribu dua puluh enam");
  assert.equal(terbilangTanggal("2024-02-29"), "dua puluh sembilan bulan Februari tahun dua ribu dua puluh empat");
});
uji("tanggal tidak valid melempar", () => {
  assert.throws(() => tanggalPanjang("2026-02-30"), RangeError);
  assert.throws(() => terbilangTanggal("02-10-2026"), RangeError);
});
uji("bacaTerbilang kebalikan terbilang", () => {
  for (const x of [0, 1, 10, 11, 15, 20, 99, 100, 101, 250, 999, 1000, 1001, 1100, 2000, 11_000, 101_000, 1_000_000, 1_001_000, 75_000_000, 1_250_000_000, 2_345_678_901_234]) {
    assert.equal(bacaTerbilang(terbilangRupiah(x)), x, `bolak-balik ${x}`);
  }
});
uji("bacaTerbilang dari tulisan dokumen", () => {
  assert.equal(bacaTerbilang("tujuh puluh lima juta rupiah"), 75_000_000);
  assert.equal(bacaTerbilang("Dua Belas"), 12);
  assert.equal(bacaTerbilang("seribu lima ratus rupiah lima puluh sen"), 1500);
  assert.equal(bacaTerbilang("satu miliar dua ratus lima puluh juta rupiah"), 1_250_000_000);
});
uji("bacaTerbilang menolak yang bukan angka", () => {
  assert.equal(bacaTerbilang("pembayaran tahap pertama"), null);
  assert.equal(bacaTerbilang(""), null);
  assert.equal(bacaTerbilang("puluh"), null);
});

console.log(`\n${n} kelompok uji lulus`);
