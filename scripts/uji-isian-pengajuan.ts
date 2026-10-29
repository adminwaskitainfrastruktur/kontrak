// Uji lib/isianPengajuan.ts dan lib/waktuPengajuan.ts (chat dan formulir pengajuan, kartu Ruang Pengguna).
// Jalankan: npx --yes tsx scripts/uji-isian-pengajuan.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { Kontrak } from "../src/lib/types";

// src/config.ts membaca import.meta.env milik Vite, yang tidak ada di Node. Kait ini menggantinya dengan objek kosong.
const kait = `export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const I = await import("../src/lib/isianPengajuan");
const S = await import("../src/lib/serupa");
const W = await import("../src/lib/waktuPengajuan");

let nomor = 0;
async function kasus(nama: string, fn: () => void | Promise<void>) {
  await fn();
  nomor++;
  console.log(`  ok ${String(nomor).padStart(2, "0")}  ${nama}`);
}

const SEKARANG = Date.parse("2026-10-03T10:00:00+07:00");
const jamLalu = (j: number) => new Date(SEKARANG - j * 3_600_000).toISOString();

function k(p: Partial<Kontrak> & { id: number }): Kontrak {
  return {
    judul: `Kontrak ${p.id}`,
    nomorPengajuan: `KTR-2026-${String(p.id).padStart(4, "0")}`,
    nomorKontrak: "",
    jenis: "Pengadaan Barang",
    divisi: "SCM",
    mitra: "PT Maju Jaya",
    nilai: 1_000_000,
    mataUang: "IDR",
    tanggalMulai: "2026-01-01",
    tanggalBerakhir: "2026-12-31",
    status: "Aktif",
    prioritas: "Normal",
    deskripsi: "",
    targetSelesai: null,
    pengajuEmail: "budi@wki.co.id",
    pengajuNama: "Budi",
    picLegalEmail: "",
    picLegalNama: "",
    tanggalDiajukan: jamLalu(24 * 5),
    tanggalTandaTangan: null,
    kontrakIndukId: null,
    mouAcuanId: null,
    jenisPerubahan: [],
    urutanAddendum: null,
    statusSejak: null,
    berakhirEfektif: null,
    checklistReview: null,
    checklistTtd: null,
    kodeProyek: "",
    nomorReferensi: "",
    costCenter: "",
    mitraId: 7,
    kontrakFinal: "",
    perpanjanganOtomatis: false,
    masaPemberitahuanHari: null,
    modeBerakhir: "",
    adaSengketa: false,
    plafon: null,
    persetujuan: null,
    salinDari: null,
    npwpMitra: "",
    alamatMitra: "",
    penandatanganMitra: "",
    jabatanMitra: "",
    dasarKewenangan: "",
    dibuat: p.tanggalDiajukan ?? jamLalu(24 * 5),
    diubah: jamLalu(1),
    webUrl: "",
    ...p,
  };
}

console.log("lib/isianPengajuan: proyek dan referensi");

await kasus("rapikanProyek: spasi dirapikan, variasi 'kantor pusat' / 'bukan proyek' disamakan", () => {
  assert.equal(I.rapikanProyek("  TOL-X   2026 "), "TOL-X 2026");
  assert.equal(I.rapikanProyek("kantor PUSAT"), I.PROYEK_KANTOR_PUSAT);
  assert.equal(I.rapikanProyek(I.LABEL_KANTOR_PUSAT), I.PROYEK_KANTOR_PUSAT);
  assert.equal(I.rapikanProyek("Bukan proyek"), I.PROYEK_KANTOR_PUSAT);
  assert.equal(I.rapikanProyek("   "), "");
  assert.ok(I.adalahKantorPusat("kantor pusat"));
  assert.ok(!I.adalahKantorPusat("Kantor Pusat Cabang Medan"));
});

await kasus("rapikanReferensi: pisah koma/titik koma/baris baru, ganda dibuang tanpa beda huruf", () => {
  assert.equal(I.rapikanReferensi(" PO-1 ,po-1; PR  22\nSPK/03 ,, "), "PO-1, PR 22, SPK/03");
  assert.equal(I.rapikanReferensi(""), "");
});

await kasus("saranProyek: Kantor Pusat paling atas, kode unik dari kontrak terlihat, tanpa duplikat Kantor Pusat", () => {
  const s = I.saranProyek([k({ id: 1, kodeProyek: "TOL-B" }), k({ id: 2, kodeProyek: "tol-b" }), k({ id: 3, kodeProyek: "Kantor Pusat" }), k({ id: 4, kodeProyek: "BND-A" })]);
  assert.deepEqual(s, ["Kantor Pusat", "BND-A", "TOL-B"]);
});

await kasus("proyekTerakhir: milik pengaju saja, terbaru dulu, unik, tanpa Kantor Pusat, dibatasi", () => {
  const daftar = [
    k({ id: 1, kodeProyek: "TOL-A", dibuat: jamLalu(90) }),
    k({ id: 2, kodeProyek: "tol-a ", dibuat: jamLalu(10) }),
    k({ id: 3, kodeProyek: "Kantor Pusat", dibuat: jamLalu(5) }),
    k({ id: 4, kodeProyek: "BND-B", dibuat: jamLalu(20) }),
    k({ id: 5, kodeProyek: "PRY-LAIN", pengajuEmail: "sari@wki.co.id", dibuat: jamLalu(1) }),
    k({ id: 6, kodeProyek: "", dibuat: jamLalu(2) }),
    k({ id: 7, kodeProyek: "JLN-C", dibuat: jamLalu(30) }),
    k({ id: 8, kodeProyek: "JLN-D", dibuat: jamLalu(40) }),
  ];
  assert.deepEqual(I.proyekTerakhir(daftar, " Budi@WKI.co.id "), ["tol-a", "BND-B", "JLN-C"]);
  assert.deepEqual(I.proyekTerakhir(daftar, "x@wki.co.id"), []);
});

await kasus("teksProyekReferensi: menyusul, kantor pusat, proyek dengan referensi", () => {
  assert.equal(I.teksProyekReferensi({ kodeProyek: "", nomorReferensi: "" }), "Menyusul");
  assert.equal(I.teksProyekReferensi({ kodeProyek: "kantor pusat", nomorReferensi: "" }), "Kantor pusat · referensi menyusul");
  assert.equal(I.teksProyekReferensi({ kodeProyek: "TOL-X", nomorReferensi: "po-1, PO-1, PO-2" }), "Proyek TOL-X · Ref. po-1, PO-2");
  assert.equal(I.teksProyekReferensi({ kodeProyek: "", nomorReferensi: "PO-9" }), "Proyek menyusul · Ref. PO-9");
});

console.log("lib/isianPengajuan: pewarisan dan mata uang");

await kasus("warisanAcuan: mitra selalu, divisi bila boleh, mata uang hanya addendum, proyek/referensi hanya ke isian kosong", () => {
  const induk = k({ id: 10, mataUang: "USD", divisi: "Pengadaan", kodeProyek: "TOL-X", nomorReferensi: "PO-1" });
  const w = I.warisanAcuan(induk, { kodeProyek: "", nomorReferensi: "" }, { divisi: true, addendum: true });
  assert.deepEqual(w, { mitra: "PT Maju Jaya", mitraId: 7, divisi: "Pengadaan", mataUang: "USD", kodeProyek: "TOL-X", nomorReferensi: "PO-1" });
  const tanpaDivisi = I.warisanAcuan(induk, { kodeProyek: "PRY-SENDIRI", nomorReferensi: "" }, { divisi: false, addendum: false });
  assert.ok(!("divisi" in tanpaDivisi) && !("mataUang" in tanpaDivisi));
  assert.ok(!("kodeProyek" in tanpaDivisi), "ketikan pengaju sendiri tidak ditimpa");
  assert.equal(tanpaDivisi.nomorReferensi, "PO-1");
});

await kasus("warisanAcuan: berganti acuan mengganti (atau mengosongkan) isian warisan acuan lama, ketikan sendiri tetap", () => {
  const lama = k({ id: 10, kodeProyek: "TOL-X", nomorReferensi: "PO-1" });
  const baru = k({ id: 11, kodeProyek: "BND-A", nomorReferensi: "" });
  const w = I.warisanAcuan(baru, { kodeProyek: "TOL-X", nomorReferensi: "PO-1" }, { divisi: false, addendum: true, acuanLama: lama });
  assert.equal(w.kodeProyek, "BND-A");
  assert.equal(w.nomorReferensi, "", "referensi warisan acuan lama tidak tertinggal");
  const sendiri = I.warisanAcuan(baru, { kodeProyek: "TOL-X", nomorReferensi: "PO-SENDIRI" }, { divisi: false, addendum: true, acuanLama: lama });
  assert.ok(!("nomorReferensi" in sendiri), "ketikan sendiri tidak dikosongkan");
  const kosong = I.warisanAcuan(baru, { kodeProyek: "", nomorReferensi: "" }, { divisi: false, addendum: false });
  assert.ok(!("nomorReferensi" in kosong), "acuan tanpa referensi tidak menyentuh isian kosong");
});

await kasus("mataUangTerkunci: hanya addendum dengan induk yang diketahui", () => {
  assert.equal(I.mataUangTerkunci("Addendum / Amandemen", { mataUang: "EUR" }), "EUR");
  assert.equal(I.mataUangTerkunci("Addendum / Amandemen", null), null);
  assert.equal(I.mataUangTerkunci("Sewa", { mataUang: "EUR" }), null);
});

await kasus("catatanMataUangAddendum: addendum ini beda, addendum lama beda, dan yang sama tidak dicatat", () => {
  const induk = k({ id: 1, mataUang: "IDR", nomorKontrak: "PB/2026/001" });
  const addSama = k({ id: 2, jenis: "Addendum / Amandemen", kontrakIndukId: 1, mataUang: "IDR", urutanAddendum: 1 });
  const addBeda = k({ id: 3, jenis: "Addendum / Amandemen", kontrakIndukId: 1, mataUang: "USD", urutanAddendum: 2, nomorKontrak: "PB/2026/001/ADD-2" });
  const addBatal = k({ id: 4, jenis: "Addendum / Amandemen", kontrakIndukId: 1, mataUang: "SGD", status: "Dibatalkan" });
  const semua = [induk, addSama, addBeda, addBatal];
  assert.deepEqual(I.catatanMataUangAddendum(induk, [induk, addSama]), []);
  const c = I.catatanMataUangAddendum(induk, semua, { mataUangKini: "USD", kecualiId: 3 });
  assert.equal(c.length, 1);
  assert.match(c[0]!, /\(USD\) berbeda dari kontrak induk \(IDR\)/);
  const lama = I.catatanMataUangAddendum(induk, semua);
  assert.equal(lama.length, 1);
  assert.match(lama[0]!, /PB\/2026\/001\/ADD-2 \(USD\)/);
  assert.ok(!/SGD/.test(lama[0]!), "addendum yang dibatalkan tidak dihitung");
});

console.log("lib/isianPengajuan: galat per isian");

const isianDasar = { judul: "Sewa Crane Proyek Tol", jenis: "Sewa" as const, mitra: "PT Abc", nilai: "1.250.000", plafon: "", tanggalMulai: "2026-01-01", tanggalBerakhir: "2026-12-31", kontrakIndukId: null };

await kasus("periksaIsianForm: isian lengkap tanpa galat; galat judul, mitra, nilai, tanggal, induk", () => {
  assert.deepEqual(I.periksaIsianForm(isianDasar), {});
  const g = I.periksaIsianForm({ ...isianDasar, judul: " Abc ", mitra: " ", nilai: "12a", tanggalBerakhir: "2025-12-31", jenis: "Addendum / Amandemen" });
  assert.match(g.judul!, /minimal 5/);
  assert.match(g.mitra!, /wajib/);
  assert.match(g.nilai!, /belum terbaca/);
  assert.match(g.tanggalBerakhir!, /sebelum tanggal mulai/);
  assert.match(g.kontrakIndukId!, /kontrak induk/);
  assert.equal(I.periksaIsianForm({ ...isianDasar, judul: "" }).judul, "Judul kontrak wajib diisi.");
  assert.equal(I.periksaIsianForm({ ...isianDasar, judul: "NDA" }, { judulLama: "NDA" }).judul, undefined, "judul lama pendek yang tidak diubah tetap boleh disimpan");
  assert.ok(I.periksaIsianForm({ ...isianDasar, judul: "NDA" }, { judulLama: "NDA PT X" }).judul);
});

await kasus("periksaIsianForm: nilai negatif hanya untuk addendum, plafon hanya diperiksa untuk Legal", () => {
  assert.ok(I.periksaIsianForm({ ...isianDasar, nilai: "-5.000" }).nilai);
  assert.equal(I.periksaIsianForm({ ...isianDasar, jenis: "Addendum / Amandemen", kontrakIndukId: 4, nilai: "-5.000" }).nilai, undefined);
  assert.equal(I.periksaIsianForm({ ...isianDasar, plafon: "abc" }).plafon, undefined);
  assert.ok(I.periksaIsianForm({ ...isianDasar, plafon: "abc" }, { isianLegal: true }).plafon);
});

await kasus("periksaIsianForm: nomor ganda dan pernyataan dokumen menyusul; galatPertama mengikuti urutan formulir", () => {
  const g = I.periksaIsianForm({ ...isianDasar, judul: "" }, { nomorGanda: [{ nomorPengajuan: "KTR-2026-0002" }], kurangWajib: 2, susulan: false });
  assert.match(g.nomorKontrak!, /KTR-2026-0002/);
  assert.match(g.susulan!, /menyusul/);
  assert.equal(I.galatPertama(g), "judul");
  assert.equal(I.galatPertama({ susulan: "x", nomorKontrak: "y" }), "nomorKontrak");
  assert.equal(I.galatPertama({}), null);
  assert.equal(I.periksaIsianForm(isianDasar, { kurangWajib: 2, susulan: true }).susulan, undefined);
});

console.log("lib/serupa (proyek)");

await kasus("Ajukan serupa: kode proyek ikut sebagai bahan (tetap ditanyakan), nomor referensi tidak disalin", () => {
  const sesi = { email: "budi@wki.co.id", nama: "Budi", peran: "Pengaju" as const, divisi: "SCM" as const, penggunaId: 9 };
  const h = S.dariKontrak(k({ id: 5, kodeProyek: " TOL-X ", nomorReferensi: "PO-9" }), { semua: [], sesi, tahun: 2026 })!;
  assert.equal(h.data.kodeProyek, "TOL-X");
  assert.ok(!("nomorReferensi" in h.data));
  assert.ok(!h.terjawab.includes("proyek" as never));
});

console.log("lib/waktuPengajuan");

await kasus("masih diproses: umur hari kalender dari tanggal diajukan; tahap hanya bila status sudah berganti", () => {
  const baru = W.waktuPengajuan(k({ id: 1, status: "Diajukan", tanggalDiajukan: jamLalu(2), statusSejak: jamLalu(2) }), SEKARANG);
  assert.equal(baru.umurHari, 0);
  assert.equal(baru.teksUmur, "Diajukan hari ini");
  assert.equal(baru.teksTahap, null, "masih di tahap awal: tidak mengulang baris Masuk");
  const review = W.waktuPengajuan(k({ id: 2, status: "Review Legal", tanggalDiajukan: "2026-09-21T02:00:00Z", statusSejak: jamLalu(50) }), SEKARANG);
  assert.equal(review.umurHari, 12);
  assert.equal(review.teksUmur, "Umur pengajuan 12 hari");
  assert.match(review.teksTahap!, /^Di tahap ini sejak 1 Okt 2026 \(2 hari 2 jam\)$/);
  assert.equal(review.selesai, false);
});

await kasus("hari kalender Jakarta: diajukan 23.30 WIB kemarin dihitung 1 hari", () => {
  const w = W.waktuPengajuan(k({ id: 3, status: "Diajukan", tanggalDiajukan: "2026-10-02T16:30:00Z", statusSejak: null }), Date.parse("2026-10-03T01:00:00+07:00"));
  assert.equal(w.umurHari, 1);
});

await kasus("selesai (Aktif, Ditolak): tanpa umur, teks status sejak; StatusSejak kosong atau rusak aman", () => {
  const aktif = W.waktuPengajuan(k({ id: 4, status: "Aktif", statusSejak: "2026-10-01T03:00:00Z" }), SEKARANG);
  assert.equal(aktif.selesai, true);
  assert.equal(aktif.umurHari, null);
  assert.equal(aktif.teksTahap, "Aktif sejak 1 Okt 2026");
  const tolak = W.waktuPengajuan(k({ id: 5, status: "Ditolak", statusSejak: null }), SEKARANG);
  assert.equal(tolak.teksTahap, null);
  const rusak = W.waktuPengajuan(k({ id: 6, status: "Review Legal", statusSejak: "bukan tanggal" }), SEKARANG);
  assert.equal(rusak.teksTahap, null);
  const tanpaTanggal = W.waktuPengajuan(k({ id: 7, status: "Diajukan", tanggalDiajukan: null, dibuat: jamLalu(30) }), SEKARANG);
  assert.equal(tanpaTanggal.masuk, jamLalu(30), "cadangan memakai Created");
});

console.log(`\nSemua ${nomor} kasus lulus.`);
