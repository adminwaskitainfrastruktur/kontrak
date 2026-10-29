// Uji matriks kewenangan dan bukti persetujuan (K01 tahap 1): lib/kewenangan.ts dan kuncinya di lib/pengaturan.ts.
// Jalankan: npx --yes tsx scripts/uji-kewenangan.ts
import assert from "node:assert/strict";
import { register } from "node:module";

// src/config.ts membaca import.meta.env milik Vite, yang tidak ada di Node. Kait ini menggantinya dengan objek kosong.
const kait = `export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const K = await import("../src/lib/kewenangan");
const P = await import("../src/lib/pengaturan");

let nomor = 0;
function kasus(nama: string, fn: () => void) {
  fn();
  nomor++;
  console.log(`  ok ${String(nomor).padStart(2, "0")}  ${nama}`);
}

const M = K.MATRIKS_KEWENANGAN_BAWAAN;
const FORMAT = (ymd: string) => ymd;

console.log("lib/kewenangan: validasi matriks");

kasus("matriks bawaan sah dan jenjang terakhir tanpa batas atas", () => {
  const h = K.validasiMatriksKewenangan(JSON.parse(JSON.stringify(M)));
  assert.equal(h.ok, true);
  assert.equal(M[M.length - 1]!.sampai, null);
});

kasus("validasi: bukan daftar, kosong, dan terlalu banyak", () => {
  assert.equal(K.validasiMatriksKewenangan("x").ok, false);
  assert.equal(K.validasiMatriksKewenangan([]).ok, false);
  const banyak = Array.from({ length: 9 }, (_, i) => ({ sampai: i < 8 ? (i + 1) * 100 : null, penyetuju: "A", penandatangan: "B" }));
  assert.equal(K.validasiMatriksKewenangan(banyak).ok, false);
});

kasus("validasi: batas atas harus naik, bulat positif, dan hanya jenjang terakhir tanpa batas", () => {
  const j = (sampai: unknown) => ({ sampai, penyetuju: "A", penandatangan: "B" });
  assert.equal(K.validasiMatriksKewenangan([j(100), j(100), j(null)]).ok, false);
  assert.equal(K.validasiMatriksKewenangan([j(200), j(100), j(null)]).ok, false);
  assert.equal(K.validasiMatriksKewenangan([j(0), j(null)]).ok, false);
  assert.equal(K.validasiMatriksKewenangan([j(1.5), j(null)]).ok, false);
  assert.equal(K.validasiMatriksKewenangan([j("100"), j(null)]).ok, false);
  assert.equal(K.validasiMatriksKewenangan([j(null), j(null)]).ok, false, "tanpa batas hanya di jenjang terakhir");
  assert.equal(K.validasiMatriksKewenangan([j(100), j(200)]).ok, false, "jenjang terakhir wajib tanpa batas atas");
  assert.equal(K.validasiMatriksKewenangan([j(null)]).ok, true, "satu jenjang untuk semua nilai");
});

kasus("validasi: penyetuju dan penandatangan wajib, dirapikan, dan dibatasi panjangnya", () => {
  const h = K.validasiMatriksKewenangan([{ sampai: null, penyetuju: "  Direktur   Utama ", penandatangan: " Direktur Utama" }]);
  assert.equal(h.ok, true);
  if (h.ok) assert.equal(h.nilai[0]!.penyetuju, "Direktur Utama");
  assert.equal(K.validasiMatriksKewenangan([{ sampai: null, penyetuju: " ", penandatangan: "B" }]).ok, false);
  assert.equal(K.validasiMatriksKewenangan([{ sampai: null, penyetuju: "A", penandatangan: "" }]).ok, false);
  assert.equal(K.validasiMatriksKewenangan([{ sampai: null, penyetuju: "A".repeat(121), penandatangan: "B" }]).ok, false);
});

console.log("lib/kewenangan: rujukan");

kasus("rujukan: batas atas termasuk, nilai di atasnya naik satu jenjang", () => {
  const indeks = (n: number) => {
    const x = K.rujukanKewenangan(n, "IDR", M);
    assert.equal(x.ada, true);
    return x.ada ? x.indeks : -1;
  };
  assert.equal(indeks(1_000_000_000), 0);
  assert.equal(indeks(1_000_000_001), 1);
  assert.equal(indeks(10_000_000_000), 1);
  const besar = K.rujukanKewenangan(50_000_000_001, "IDR", M);
  assert.equal(besar.ada && besar.jenjang.penyetuju, "Rapat Direksi");
  assert.equal(indeks(0), 0);
});

kasus("rujukan: nilai negatif dihitung mutlaknya; tanpa nilai dan valas tidak punya rujukan", () => {
  const neg = K.rujukanKewenangan(-5_000_000_000, "IDR", M);
  assert.equal(neg.ada && neg.indeks, 1);
  const tanpa = K.rujukanKewenangan(null, "IDR", M);
  assert.equal(tanpa.ada, false);
  if (!tanpa.ada) assert.equal(tanpa.alasan, "tanpa-nilai");
  const valas = K.rujukanKewenangan(1000, "USD", M);
  assert.equal(valas.ada, false);
  if (!valas.ada) assert.equal(valas.alasan, "valas");
  assert.equal(K.rujukanKewenangan(Number.NaN, "IDR", M).ada, false);
});

kasus("rujukan: matriks satu jenjang melayani semua nilai", () => {
  const satu = [{ sampai: null, penyetuju: "A", penandatangan: "B" }];
  const r = K.rujukanKewenangan(9e12, "IDR", satu);
  assert.equal(r.ada && r.indeks, 0);
});

kasus("nilai acuan: kontrak biasa memakai nilainya; addendum memakai nilai efektif induk", () => {
  assert.equal(K.nilaiAcuanKewenangan({ nilai: 500, status: "Review Legal", kontrakIndukId: null }, null), 500);
  assert.equal(K.nilaiAcuanKewenangan({ nilai: 200, status: "Review Legal", kontrakIndukId: 1 }, 900), 1100, "belum berlaku: induk + selisih");
  assert.equal(K.nilaiAcuanKewenangan({ nilai: 200, status: "Aktif", kontrakIndukId: 1 }, 900), 900, "sudah berlaku: sudah ada di nilai efektif induk");
  assert.equal(K.nilaiAcuanKewenangan({ nilai: -300, status: "Review Legal", kontrakIndukId: 1 }, null), 300, "induk tak diketahui: mutlak selisih");
  assert.equal(K.nilaiAcuanKewenangan({ nilai: null, status: "Review Legal", kontrakIndukId: 1 }, null), null);
});

kasus("teks rentang jenjang terbaca jelas", () => {
  assert.equal(K.teksRentangJenjang(M, 0), "Sampai Rp1.000.000.000");
  assert.equal(K.teksRentangJenjang(M, 1), "Rp1.000.000.001 sampai Rp10.000.000.000");
  assert.equal(K.teksRentangJenjang(M, M.length - 1), "Di atas Rp50.000.000.000");
  assert.equal(K.teksRentangJenjang([{ sampai: null, penyetuju: "A", penandatangan: "B" }], 0), "Semua nilai");
  assert.equal(K.teksRentangJenjang(M, 99), "-");
});

console.log("lib/kewenangan: bukti persetujuan");

const HARI = "2026-10-05";
const sah = { ...K.persetujuanKosong("Kepala Divisi"), nomor: "MEMO-12/2026", penyetuju: "Budi", tanggal: HARI };

kasus("validasi persetujuan: isian sah lolos, jabatan bawaan terisi", () => {
  assert.equal(K.persetujuanKosong("Direktur").jabatan, "Direktur");
  assert.equal(K.validasiPersetujuan(sah, { hari: HARI, adaBerkas: false }), null);
});

kasus("validasi persetujuan: nama, tanggal, dan bukti (nomor atau berkas) wajib", () => {
  const o = { hari: HARI, adaBerkas: false };
  assert.match(K.validasiPersetujuan({ ...sah, penyetuju: " " }, o) ?? "", /nama penyetuju/);
  assert.match(K.validasiPersetujuan({ ...sah, tanggal: null }, o) ?? "", /tanggal/);
  assert.match(K.validasiPersetujuan({ ...sah, nomor: "" }, o) ?? "", /nomor memo/);
  assert.equal(K.validasiPersetujuan({ ...sah, nomor: "" }, { hari: HARI, adaBerkas: true }), null, "berkas bukti cukup tanpa nomor");
});

kasus("validasi persetujuan: tanggal masa depan dan teks terlalu panjang ditolak", () => {
  const o = { hari: HARI, adaBerkas: false };
  assert.match(K.validasiPersetujuan({ ...sah, tanggal: "2026-10-06" }, o) ?? "", /setelah hari ini/);
  assert.notEqual(K.validasiPersetujuan({ ...sah, penyetuju: "x".repeat(121) }, o), null);
  assert.notEqual(K.validasiPersetujuan({ ...sah, jabatan: "x".repeat(121) }, o), null);
  assert.notEqual(K.validasiPersetujuan({ ...sah, nomor: "x".repeat(151) }, o), null);
  assert.notEqual(K.validasiPersetujuan({ ...sah, catatan: "x".repeat(1001) }, o), null);
});

kasus("tambah dan hapus persetujuan: versi 1, id sama menimpa, daftar lama tidak berubah", () => {
  const a = { id: "a", penyetuju: "Budi", tanggal: "2026-09-01" };
  const lama = { versi: 1, items: [a] };
  const baru = K.tambahPersetujuan(lama, { id: "b", penyetuju: "Sari", tanggal: "2026-10-01" });
  assert.equal(baru.versi, 1);
  assert.equal(baru.items.length, 2);
  assert.equal(lama.items.length, 1, "tidak mengubah masukan");
  assert.equal(K.tambahPersetujuan(baru, { id: "b", penyetuju: "Sari K." }).items.find((x) => x.id === "b")?.penyetuju, "Sari K.");
  assert.equal(K.tambahPersetujuan(null, a).items.length, 1);
  assert.deepEqual(K.hapusPersetujuan(baru, "a").items.map((x) => x.id), ["b"]);
  assert.deepEqual(K.hapusPersetujuan(null, "a").items, []);
});

kasus("daftar persetujuan: urut tanggal terbaru dulu, baris rusak dibuang", () => {
  const p = {
    versi: 1,
    items: [
      { id: "1", penyetuju: "A", tanggal: "2026-08-01" },
      { id: "2", penyetuju: "B", tanggal: "2026-09-01" },
      { id: "3", penyetuju: "  " },
      null as never,
      { id: "4", penyetuju: "D", tanggal: "2026-09-01", dicatat: "2026-09-02T01:00:00Z" },
    ],
  };
  assert.deepEqual(K.daftarPersetujuan(p).map((x) => x.id), ["4", "2", "1"]);
  assert.deepEqual(K.daftarPersetujuan(null), []);
  assert.deepEqual(K.daftarPersetujuan({ versi: 1, items: "rusak" as never }), []);
});

kasus("teks persetujuan: satu kalimat dengan jabatan, tanggal, nomor, dan berkas", () => {
  const t = K.teksPersetujuan({ penyetuju: "Budi", jabatan: "Direktur", tanggal: "2026-10-01", bukti: "MEMO-1", dokumen: "memo.pdf" }, FORMAT);
  assert.equal(t, "Disetujui Budi (Direktur), tanggal 2026-10-01, nomor MEMO-1, berkas memo.pdf.");
  assert.equal(K.teksPersetujuan({ penyetuju: "Budi" }, FORMAT), "Disetujui Budi.");
});

console.log("lib/pengaturan: kunci matriksKewenangan");

kasus("kunci terdaftar, bawaan sah, dan tidak dibaca flow", () => {
  assert.ok(P.DAFTAR_KUNCI.includes("matriksKewenangan"));
  assert.deepEqual(P.PEMBACA_FLOW.matriksKewenangan, []);
  assert.deepEqual(P.PENGATURAN_BAWAAN.matriksKewenangan, [...M]);
  assert.equal(P.validasiNilai("matriksKewenangan", P.PENGATURAN_BAWAAN.matriksKewenangan).ok, true);
});

kasus("baris SharePoint: nilai sah dipakai, nilai rusak jatuh ke bawaan dan dilaporkan", () => {
  const sahJson = JSON.stringify([
    { sampai: 5_000_000, penyetuju: "Kadiv", penandatangan: "Kadiv" },
    { sampai: null, penyetuju: "Direksi", penandatangan: "Dirut" },
  ]);
  const h = P.bacaPengaturan([{ kunci: "matriksKewenangan", nilaiJson: sahJson }]);
  assert.equal(h.pengaturan.matriksKewenangan[0]!.sampai, 5_000_000);
  assert.ok(h.tersimpan.includes("matriksKewenangan"));
  const rusak = P.bacaPengaturan([{ kunci: "matriksKewenangan", nilaiJson: '[{"sampai":5,"penyetuju":"A","penandatangan":"B"}]' }]);
  assert.deepEqual(rusak.pengaturan.matriksKewenangan, [...M]);
  assert.equal(rusak.rusak[0]?.kunci, "matriksKewenangan");
});

kasus("formulir: bolak-balik sama, batas atas ditulis dengan titik, galat per baris", () => {
  const f = P.keForm(P.pengaturanBawaan());
  assert.equal(f.matriks.length, M.length);
  assert.equal(f.matriks[M.length - 1]!.sampai, "");
  const hasil = P.dariForm(f);
  assert.equal(hasil.ok, true);
  if (hasil.ok) assert.deepEqual(hasil.nilai.matriksKewenangan, [...M]);

  const titik = P.matriksDariForm([
    { sampai: "2.500.000.000", penyetuju: "A", penandatangan: "B" },
    { sampai: "", penyetuju: "C", penandatangan: "D" },
  ]);
  assert.equal(titik.ok && titik.nilai[0]!.sampai, 2_500_000_000);
  const huruf = P.matriksDariForm([
    { sampai: "banyak", penyetuju: "A", penandatangan: "B" },
    { sampai: "", penyetuju: "C", penandatangan: "D" },
  ]);
  assert.equal(huruf.ok, false);
  const kosongBaris = P.dariForm({ ...f, matriks: [{ sampai: "", penyetuju: "", penandatangan: "" }] });
  assert.equal(kosongBaris.ok, false);
  if (!kosongBaris.ok) assert.ok(kosongBaris.galat.matriks);
});

kasus("samaNilai: matriks yang sama isinya tidak dianggap perubahan, yang berbeda dianggap", () => {
  const salinan = JSON.parse(JSON.stringify(M));
  assert.equal(P.samaNilai(salinan, M), true);
  salinan[0].penyetuju = "Lain";
  assert.equal(P.samaNilai(salinan, M), false);
  assert.ok(!P.kunciBerubahDariBawaan(P.pengaturanBawaan()).includes("matriksKewenangan"));
});

console.log(`\nSemua ${nomor} kasus lulus.`);
