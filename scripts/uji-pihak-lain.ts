// Uji "Pihak lain dan perannya" (U11): lib/pihakLain.ts.
// Jalankan: npx --yes tsx scripts/uji-pihak-lain.ts
import assert from "node:assert/strict";
import * as P from "../src/lib/pihakLain";

let nomor = 0;
function kasus(nama: string, fn: () => void) {
  fn();
  nomor++;
  console.log(`  ok ${String(nomor).padStart(2, "0")}  ${nama}`);
}

console.log("lib/pihakLain");

kasus("urai: bentuk berversi, larik lama, kosong, dan JSON rusak", () => {
  assert.deepEqual(P.uraiPihakLain('{"v":1,"pihak":[{"nama":" PT  Bank ABC ","peran":"Penjamin"}]}'), [{ nama: "PT Bank ABC", peran: "Penjamin" }]);
  assert.deepEqual(P.uraiPihakLain([{ nama: "PT X", peran: "" }]), [{ nama: "PT X", peran: "" }]);
  assert.deepEqual(P.uraiPihakLain(""), []);
  assert.deepEqual(P.uraiPihakLain(null), []);
  assert.deepEqual(P.uraiPihakLain("{rusak"), []);
  assert.deepEqual(P.uraiPihakLain('[{"peran":"tanpa nama"}, 5, null]'), []);
});

kasus("urai: dibatasi paling banyak 10 pihak", () => {
  const banyak = Array.from({ length: 15 }, (_, i) => ({ nama: `PT ${i}`, peran: "" }));
  assert.equal(P.uraiPihakLain(banyak).length, P.MAKS_PIHAK_LAIN);
});

kasus("bungkus: baris kosong dibuang, daftar kosong menjadi teks kosong, bolak-balik sama", () => {
  const d = [
    { nama: "PT A", peran: "Penjamin" },
    { nama: "  ", peran: "" },
  ];
  const t = P.bungkusPihakLain(d);
  assert.deepEqual(JSON.parse(t), { v: 1, pihak: [{ nama: "PT A", peran: "Penjamin" }] });
  assert.deepEqual(P.uraiPihakLain(t), [{ nama: "PT A", peran: "Penjamin" }]);
  assert.equal(P.bungkusPihakLain([{ nama: "", peran: "" }]), "");
});

kasus("validasi: peran tanpa nama, nama ganda (tanpa beda huruf besar), dan terlalu banyak", () => {
  assert.equal(P.validasiPihakLain([{ nama: "PT A", peran: "Penjamin" }, { nama: "", peran: "" }]), null);
  assert.match(P.validasiPihakLain([{ nama: "", peran: "Penjamin" }]) ?? "", /peran tanpa nama/);
  assert.match(P.validasiPihakLain([{ nama: "PT A", peran: "" }, { nama: "pt  a", peran: "KSO" }]) ?? "", /dua kali/);
  const banyak = Array.from({ length: 11 }, (_, i) => ({ nama: `PT ${i}`, peran: "" }));
  assert.match(P.validasiPihakLain(banyak) ?? "", /Paling banyak 10/);
});

kasus("teks untuk riwayat dan perbandingan perubahan", () => {
  assert.equal(P.teksPihakLain([{ nama: "PT A", peran: "Penjamin" }, { nama: "PT B", peran: "" }]), "PT A (Penjamin); PT B");
  assert.equal(P.teksPihakLain([]), "-");
  assert.equal(P.samaPihakLain([{ nama: "PT A ", peran: "Penjamin" }], [{ nama: "PT A", peran: " Penjamin" }]), true);
  assert.equal(P.samaPihakLain([{ nama: "PT A", peran: "Penjamin" }], [{ nama: "PT A", peran: "KSO" }]), false);
});

console.log(`\nSemua ${nomor} kasus lulus.`);
