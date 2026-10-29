// Uji lib/laporan.ts, lib/portofolio.ts, lib/estimasi.ts, dan lib/ekspor.ts.
// Jalankan: npx --yes tsx scripts/uji-laporan.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { EventStatus } from "../src/lib/laporan";
import type { Kontrak } from "../src/lib/types";

// src/config.ts membaca import.meta.env milik Vite, yang tidak ada di Node. Kait ini menggantinya dengan objek kosong
// hanya untuk berkas itu, supaya modul murni yang (lewat format.ts) bergantung pada config bisa diuji apa adanya.
const kait = `export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const L = await import("../src/lib/laporan");
const P = await import("../src/lib/portofolio");
const E = await import("../src/lib/estimasi");
const X = await import("../src/lib/ekspor");

let nomor = 0;
async function kasus(nama: string, fn: () => void | Promise<void>) {
  await fn();
  nomor++;
  console.log(`ok ${nomor} - ${nama}`);
}

let seq = 100;
function kontrak(sebagian: Partial<Kontrak>): Kontrak {
  seq++;
  return {
    id: seq,
    judul: "Kontrak contoh",
    nomorPengajuan: `KTR-2026-${seq}`,
    nomorKontrak: "",
    jenis: "Pengadaan Jasa",
    divisi: "SCM",
    mitra: "PT Contoh",
    nilai: null,
    mataUang: "IDR",
    tanggalMulai: null,
    tanggalBerakhir: null,
    status: "Diajukan",
    prioritas: "Normal",
    deskripsi: "",
    targetSelesai: null,
    pengajuEmail: "a@waskitainfrastruktur.co.id",
    pengajuNama: "A",
    picLegalEmail: "",
    picLegalNama: "",
    tanggalDiajukan: "2026-09-01T03:00:00Z",
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
    mitraId: null,
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
    dibuat: "2026-09-01T03:00:00Z",
    diubah: "2026-09-20T03:00:00Z",
    webUrl: "",
    ...sebagian,
  };
}

let idEvent = 1;
const ev = (kontrakId: number, statusDari: string, statusKe: string, waktu: string): EventStatus => ({ id: idEvent++, kontrakId, statusDari, statusKe, waktu, olehNama: "Legal" });

// Jumat 2 Oktober 2026, 10.00 WIB.
const SEKARANG = Date.parse("2026-10-02T03:00:00Z");
const JAM = 3_600_000;
const HARI = 86_400_000;
const dekat = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} tidak mendekati ${b}`);

// --- laporan.ts -------------------------------------------------------------------------

await kasus("hari kerja melompati akhir pekan (Jumat 18.00 sampai Senin 09.00 WIB = 15 jam)", () => {
  const jumat = Date.parse("2026-10-02T11:00:00Z");
  const senin = Date.parse("2026-10-05T02:00:00Z");
  dekat(L.hariKerjaAntara(jumat, senin), 15 / 24);
  assert.equal(L.hariKerjaAntara(senin, jumat), 0);
  assert.equal(L.hariKerjaAntara(senin, senin), 0);
  // Sabtu ke Minggu penuh: nol.
  assert.equal(L.hariKerjaAntara(Date.parse("2026-10-02T17:00:00Z"), Date.parse("2026-10-04T16:59:00Z")), 0);
});

await kasus("median dan P90 peringkat terdekat, larik kosong menjadi NaN", () => {
  assert.equal(L.median([5, 1, 3]), 3);
  assert.equal(L.median([4, 1, 3, 2]), 2.5);
  assert.ok(Number.isNaN(L.median([])));
  assert.equal(L.persentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9);
  assert.equal(L.persentil([7], 0.9), 7);
});

await kasus("interval tahap: Diajukan dimulai dari TanggalDiajukan, event tak nyambung dilewati", () => {
  const k = kontrak({ tanggalDiajukan: "2026-09-01T03:00:00Z" });
  const daftar = [
    ev(k.id, "Diajukan", "Review Legal", "2026-09-02T03:00:00Z"),
    ev(k.id, "Review Legal", "Perlu Revisi", "2026-09-04T03:00:00Z"),
    // Baris "Perlu Revisi -> Review Legal" hilang; event berikut asalnya tidak cocok.
    ev(k.id, "Review Legal", "Proses Tanda Tangan", "2026-09-08T03:00:00Z"),
  ];
  const iv = L.bangunInterval(daftar, [k]);
  assert.deepEqual(iv.map((x) => x.tahap), ["Diajukan", "Review Legal"]);
  dekat((iv[0]!.selesai - iv[0]!.mulai) / HARI, 1);
  dekat((iv[1]!.selesai - iv[1]!.mulai) / HARI, 2);
});

await kasus("statistik tahap null bila sampel < 3, terisi bila >= 3", () => {
  const ks = [1, 2, 3].map(() => kontrak({}));
  const sedikit = L.bangunInterval([ev(ks[0]!.id, "Review Legal", "Proses Tanda Tangan", "2026-09-10T03:00:00Z")], []);
  assert.equal(L.hitungDurasiTahap(sedikit).find((t) => t.tahap === "Review Legal")!.statistik, null);

  const banyak: EventStatus[] = [];
  ks.forEach((k, i) => {
    banyak.push(ev(k.id, "Diajukan", "Review Legal", "2026-09-07T03:00:00Z"));
    banyak.push(ev(k.id, "Review Legal", "Proses Tanda Tangan", new Date(Date.parse("2026-09-07T03:00:00Z") + (i + 1) * HARI).toISOString()));
  });
  const r = L.hitungDurasiTahap(L.bangunInterval(banyak, [])).find((t) => t.tahap === "Review Legal")!;
  assert.equal(r.sampel, 3);
  assert.ok(r.statistik);
  dekat(r.statistik.kalender.median, 2);
  dekat(r.statistik.kalender.p90, 3);
  dekat(r.statistik.kerja.median, 2);
});

await kasus("putaran revisi per kontrak dan rata-rata hanya bila >= 3 kontrak", () => {
  const a = kontrak({});
  const b = kontrak({});
  const daftar = [ev(a.id, "Review Legal", "Perlu Revisi", "2026-09-02T03:00:00Z"), ev(a.id, "Perlu Revisi", "Review Legal", "2026-09-03T03:00:00Z"), ev(a.id, "Review Legal", "Perlu Revisi", "2026-09-04T03:00:00Z")];
  assert.equal(L.putaranRevisiPerKontrak(daftar).get(a.id), 2);
  const dua = L.ringkasRevisi([a, b], daftar);
  assert.equal(dua.rataRata, null);
  assert.equal(dua.denganRevisi, 1);
  const c = kontrak({});
  const tiga = L.ringkasRevisi([a, b, c], daftar);
  dekat(tiga.rataRata!, 2 / 3);
  assert.deepEqual(tiga.distribusi.map((d) => d.jumlah), [2, 0, 1, 0]);
  assert.deepEqual(tiga.terbanyak, [{ kontrakId: a.id, putaran: 2 }]);
});

await kasus("kontrak mengendap melewati SLA, Perlu Revisi = menunggu pengaju", () => {
  const lama = kontrak({ status: "Review Legal", statusSejak: new Date(SEKARANG - 10 * HARI).toISOString() });
  const baru = kontrak({ status: "Review Legal", statusSejak: new Date(SEKARANG - 2 * HARI).toISOString() });
  const revisi = kontrak({ status: "Perlu Revisi", statusSejak: new Date(SEKARANG - 6 * HARI).toISOString() });
  const aktif = kontrak({ status: "Aktif", statusSejak: new Date(SEKARANG - 100 * HARI).toISOString() });
  const m = L.kontrakMengendap([lama, baru, revisi, aktif], SEKARANG);
  assert.deepEqual(m.map((x) => x.kontrak.id), [lama.id, revisi.id]);
  dekat(m[0]!.lewatHari, 3);
  assert.equal(m[0]!.menunggu, "Legal");
  assert.equal(m[1]!.menunggu, "Pengaju");
});

await kasus("periode: bulan ini, 3 bulan melintasi tahun, tahun ini, kustom terbalik", () => {
  assert.deepEqual(L.periodeDari("bulan-ini", SEKARANG), { dari: "2026-10-01", sampai: "2026-10-02", label: "Oktober 2026" });
  const jan = Date.parse("2027-01-15T03:00:00Z");
  assert.equal(L.periodeDari("3-bulan", jan)!.dari, "2026-11-01");
  assert.equal(L.periodeDari("tahun-ini", SEKARANG)!.dari, "2026-01-01");
  assert.equal(L.periodeDari("kustom", SEKARANG, { dari: "2026-10-05", sampai: "2026-10-01" }), null);
  assert.equal(L.periodeDari("kustom", SEKARANG, { dari: "2026-10", sampai: "2026-10-01" }), null);
  assert.equal(L.periodeDari("kustom", SEKARANG), null);
});

await kasus("batas periode memakai tengah malam WIB", () => {
  const p = L.periodeDari("kustom", SEKARANG, { dari: "2026-10-01", sampai: "2026-10-01" })!;
  // 1 Okt 00.30 WIB = 30 Sep 17.30 UTC: masuk.
  assert.equal(L.dalamPeriode(Date.parse("2026-09-30T17:30:00Z"), p), true);
  // 30 Sep 23.59 WIB: tidak masuk.
  assert.equal(L.dalamPeriode(Date.parse("2026-09-30T16:59:00Z"), p), false);
  // 2 Okt 00.00 WIB: tidak masuk.
  assert.equal(L.dalamPeriode(Date.parse("2026-10-01T17:00:00Z"), p), false);
});

await kasus("deret bulanan dan susunLaporan: diajukan, selesai, dan waktu Legal terpisah dari pengaju", () => {
  const p = L.periodeDari("kustom", SEKARANG, { dari: "2026-08-01", sampai: "2026-10-02" })!;
  const a = kontrak({ tanggalDiajukan: "2026-08-10T03:00:00Z", status: "Aktif" });
  const b = kontrak({ tanggalDiajukan: "2026-09-10T03:00:00Z", status: "Review Legal", statusSejak: "2026-09-11T03:00:00Z" });
  const daftar = [
    ev(a.id, "Diajukan", "Review Legal", "2026-08-11T03:00:00Z"),
    ev(a.id, "Review Legal", "Perlu Revisi", "2026-08-12T03:00:00Z"),
    ev(a.id, "Perlu Revisi", "Review Legal", "2026-08-14T03:00:00Z"),
    ev(a.id, "Review Legal", "Proses Tanda Tangan", "2026-08-17T03:00:00Z"),
    ev(a.id, "Proses Tanda Tangan", "Aktif", "2026-09-01T03:00:00Z"),
    ev(b.id, "Diajukan", "Review Legal", "2026-09-11T03:00:00Z"),
  ];
  const bulan = L.deretBulanan([a, b], daftar, p);
  assert.deepEqual(bulan.map((x) => [x.kunci, x.diajukan, x.selesai]), [["2026-08", 1, 0], ["2026-09", 1, 1], ["2026-10", 0, 0]]);
  const lap = L.susunLaporan([a, b], daftar, p, SEKARANG);
  assert.equal(lap.kontrakMasuk, 2);
  assert.equal(lap.kontrakSelesai, 1);
  assert.equal(lap.dataTipis, true);
  // Satu kontrak saja punya waktu pengaju: statistik disembunyikan, sampel tetap dilaporkan.
  assert.equal(lap.legalVsPengaju.pengaju.sampel, 1);
  assert.equal(lap.legalVsPengaju.pengaju.statistik, null);
  assert.equal(lap.legalVsPengaju.legal.sampel, 2);
  assert.equal(lap.mengendap.map((m) => m.kontrak.id).includes(b.id), true);
});

// --- portofolio.ts ------------------------------------------------------------------------

await kasus("portofolio: per mata uang, addendum menambah nilai induk tanpa jadi kontrak, lewat masa dipisah, MoU tanpa nilai", () => {
  const induk = kontrak({ status: "Aktif", nilai: 1_000_000, tanggalBerakhir: "2026-10-20", divisi: "SCM", mitra: "PT Alfa" });
  const add = kontrak({ status: "Aktif", jenis: "Addendum / Amandemen", kontrakIndukId: induk.id, nilai: 250_000, tanggalBerakhir: "2027-03-31", urutanAddendum: 1 });
  const usd = kontrak({ status: "Aktif", nilai: 5_000, mataUang: "USD", divisi: "Pengadaan", mitra: "Beta Ltd" });
  const lewat = kontrak({ status: "Aktif", nilai: 7_000_000, tanggalBerakhir: "2026-09-01" });
  const mou = kontrak({ status: "Aktif", jenis: "MoU / Nota Kesepahaman", nilai: null, tanggalBerakhir: "2027-01-10" });
  const proses = kontrak({ status: "Review Legal", nilai: 900, mataUang: "EUR" });
  const addProses = kontrak({ status: "Diajukan", jenis: "Addendum / Amandemen", kontrakIndukId: induk.id, nilai: -100_000 });
  const pf = P.susunPortofolio([induk, add, usd, lewat, mou, proses, addProses], SEKARANG);

  assert.equal(pf.komitmen.jumlahKontrak, 3);
  assert.equal(pf.komitmen.tanpaNilai, 1);
  assert.deepEqual(pf.komitmen.nilai, [
    { mataUang: "IDR", total: 1_250_000, jumlah: 1 },
    { mataUang: "USD", total: 5_000, jumlah: 1 },
  ]);
  assert.deepEqual(pf.lewatMasa.nilai, [{ mataUang: "IDR", total: 7_000_000, jumlah: 1 }]);
  assert.equal(pf.perDivisi[0]!.kunci, "SCM");
  assert.deepEqual(pf.pipelineTotal.nilai, [{ mataUang: "EUR", total: 900, jumlah: 1 }]);
  assert.deepEqual(pf.addendumBerjalan.nilai, [{ mataUang: "IDR", total: -100_000, jumlah: 1 }]);
  assert.deepEqual(pf.mataUangAda, ["IDR", "USD", "EUR"]);
  assert.equal(pf.mitraTeratas.USD![0]!.label, "Beta Ltd");
});

await kasus("kalender berakhir 12 bulan memakai berakhir efektif, 10 mitra teratas dipotong", () => {
  const ks: Kontrak[] = [];
  for (let i = 0; i < 12; i++) ks.push(kontrak({ status: "Aktif", nilai: (i + 1) * 100, mitra: `PT Mitra ${i}`, tanggalBerakhir: "2026-11-15" }));
  const induk = kontrak({ status: "Aktif", nilai: 50, mitra: "PT Mitra 0", tanggalBerakhir: "2026-10-31" });
  const perpanjang = kontrak({ status: "Aktif", jenis: "Addendum / Amandemen", kontrakIndukId: induk.id, tanggalBerakhir: "2027-09-30" });
  const jauh = kontrak({ status: "Aktif", nilai: 1, mitra: "PT Jauh", tanggalBerakhir: "2027-10-01" });
  const pf = P.susunPortofolio([...ks, induk, perpanjang, jauh], SEKARANG);
  assert.equal(pf.kalenderBerakhir.length, 12);
  assert.equal(pf.kalenderBerakhir[0]!.kunci, "2026-10");
  assert.equal(pf.kalenderBerakhir[11]!.kunci, "2027-09");
  assert.equal(pf.kalenderBerakhir[0]!.jumlahKontrak, 0, "induk yang diperpanjang tidak lagi berakhir Oktober");
  assert.equal(pf.kalenderBerakhir[1]!.jumlahKontrak, 12);
  assert.deepEqual(pf.kalenderBerakhir[11]!.ids, [induk.id]);
  assert.equal(pf.mitraTeratas.IDR!.length, 10);
  assert.equal(pf.mitraTeratas.IDR![0]!.label, "PT Mitra 11");
  // "PT Mitra 0" punya dua kontrak dan digabung dalam satu baris.
  const nol = [...pf.mitraTeratas.IDR!].find((m) => m.label === "PT Mitra 0");
  assert.equal(nol, undefined, "PT Mitra 0 (150) tidak masuk 10 besar");
  assert.equal(P.kunciMitraPortofolio({ mitraId: null, mitra: "  PT.  Alfa, " }), P.kunciMitraPortofolio({ mitraId: null, mitra: "pt alfa" }));
});

// --- estimasi.ts ----------------------------------------------------------------------------

function riwayatLancar(jumlah: number, mulaiHariLalu: number): EventStatus[] {
  const hasil: EventStatus[] = [];
  for (let i = 0; i < jumlah; i++) {
    const id = 9000 + i;
    const awal = SEKARANG - (mulaiHariLalu - i * 2) * HARI;
    hasil.push(ev(id, "Diajukan", "Review Legal", new Date(awal).toISOString()));
    hasil.push(ev(id, "Review Legal", "Proses Tanda Tangan", new Date(awal + 3 * HARI).toISOString()));
  }
  return hasil;
}

await kasus("estimasi jujur saat sampel < 5", () => {
  const r = E.perkiraanSelesaiAntrean(2, riwayatLancar(4, 30), SEKARANG);
  assert.equal(r.hariMin, null);
  assert.equal(r.hariMaks, null);
  assert.equal(r.sampel, 4);
  assert.match(r.teks, /belum cukup data untuk memperkirakan/);
  // Event lebih tua dari 90 hari tidak dihitung.
  assert.equal(E.perkiraanSelesaiAntrean(1, riwayatLancar(20, 200).filter((e) => Date.parse(e.waktu) < SEKARANG - 95 * HARI), SEKARANG).sampel, 0);
  assert.equal(E.perkiraanSelesaiAntrean(0, riwayatLancar(20, 60), SEKARANG).hariMin, null);
});

await kasus("estimasi cukup data: rentang wajar, kata 'perkiraan', posisi belakang lebih lama", () => {
  const riwayat = riwayatLancar(20, 60);
  const depan = E.perkiraanSelesaiAntrean(1, riwayat, SEKARANG);
  const belakang = E.perkiraanSelesaiAntrean(8, riwayat, SEKARANG);
  assert.equal(depan.sampel, 20);
  assert.ok(depan.hariMin != null && depan.hariMaks != null && depan.hariMin <= depan.hariMaks);
  assert.ok(belakang.hariMin! > depan.hariMin!);
  assert.match(depan.teks, /perkiraan/i);
  assert.doesNotMatch(depan.teks, /pasti|dijamin/);
  assert.ok(depan.tanggalMin! <= depan.tanggalMaks!);
});

await kasus("tambah hari kerja melewati akhir pekan", () => {
  assert.equal(E.tambahHariKerja(SEKARANG, 1), "2026-10-05");
  assert.equal(E.tambahHariKerja(SEKARANG, 0), "2026-10-02");
  assert.equal(E.tambahHariKerja(SEKARANG, 5), "2026-10-09");
  assert.equal(E.tambahHariKerja(SEKARANG, 0.2), "2026-10-05");
});

// --- ekspor.ts --------------------------------------------------------------------------------

await kasus("sanitasi teks berawalan = + - @ tab", () => {
  assert.equal(X.amankanTeks("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
  assert.equal(X.amankanTeks("+62"), "'+62");
  assert.equal(X.amankanTeks("-cmd"), "'-cmd");
  assert.equal(X.amankanTeks("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(X.amankanTeks("\tx"), "'\tx");
  assert.equal(X.amankanTeks("PT Aman"), "PT Aman");
  assert.equal(X.amankanTeks(""), "");
});

await kasus("CSV: pemisah titik koma, kutip ganda, angka negatif tetap angka, tanggal Indonesia, jam WIB", () => {
  const induk = kontrak({ judul: '=1+1 "kutip"', mitra: "@jahat", status: "Aktif", nilai: 1000.5, mataUang: "USD", tanggalBerakhir: "2026-12-31", tanggalDiajukan: "2026-09-30T17:30:00Z" });
  const add = kontrak({ status: "Aktif", jenis: "Addendum / Amandemen", kontrakIndukId: induk.id, nilai: -200, mataUang: "USD" });
  const csv = X.susunCsv([induk], [induk, add], SEKARANG);
  const [kepala, baris] = csv.split("\r\n");
  assert.equal(kepala!.split(";").length, X.KOLOM_KONTRAK.length);
  assert.ok(baris!.includes(`"'=1+1 ""kutip"""`));
  assert.ok(baris!.includes(`"'@jahat"`));
  assert.ok(baris!.includes(`"1000,5";"-200";"800,5"`));
  assert.ok(baris!.includes(`"31/12/2026"`));
  assert.ok(baris!.includes(`"01/10/2026 00:30"`));
});

await kasus("huruf kolom Excel dan pemisahan addendum", () => {
  assert.equal(X.hurufKolom(1), "A");
  assert.equal(X.hurufKolom(26), "Z");
  assert.equal(X.hurufKolom(27), "AA");
  assert.equal(X.hurufKolom(53), "BA");
  const induk = kontrak({});
  const add = kontrak({ jenis: "Addendum / Amandemen", kontrakIndukId: induk.id });
  const lain = kontrak({ jenis: "Addendum / Amandemen", kontrakIndukId: 1 });
  const { induk: i, addendum: a } = X.pisahkanAddendum([induk], [induk, add, lain]);
  assert.deepEqual(i.map((k) => k.id), [induk.id]);
  assert.deepEqual(a.map((k) => k.id), [add.id]);
});

await kasus("kontrak untuk laporan periode: masuk, selesai di periode, atau masih diproses", () => {
  const p = L.periodeDari("bulan-ini", SEKARANG)!;
  const masuk = kontrak({ tanggalDiajukan: "2026-10-01T03:00:00Z", status: "Aktif" });
  const selesai = kontrak({ tanggalDiajukan: "2026-08-01T03:00:00Z", status: "Aktif" });
  const proses = kontrak({ tanggalDiajukan: "2026-07-01T03:00:00Z", status: "Review Legal" });
  const lama = kontrak({ tanggalDiajukan: "2026-07-01T03:00:00Z", status: "Aktif" });
  const hasil = X.kontrakUntukPeriode([masuk, selesai, proses, lama], [ev(selesai.id, "Proses Tanda Tangan", "Aktif", "2026-10-01T05:00:00Z"), ev(lama.id, "Proses Tanda Tangan", "Aktif", "2026-08-01T05:00:00Z")], p);
  assert.deepEqual(hasil.map((k) => k.id), [masuk.id, selesai.id, proses.id]);
});

await kasus("buku Excel: lembar, rumus hidup, filter, header beku, sanitasi, tautan, bisa dibaca ulang", async () => {
  const induk = kontrak({ judul: "=cmd|' /C calc'!A0", status: "Aktif", nilai: 1_000_000, divisi: "SCM", tanggalBerakhir: "2026-12-31" });
  const add = kontrak({ status: "Aktif", jenis: "Addendum / Amandemen", kontrakIndukId: induk.id, nilai: 500_000, urutanAddendum: 1 });
  const usd = kontrak({ status: "Aktif", nilai: 10, mataUang: "USD", divisi: "Pengadaan" });
  const p = L.periodeDari("bulan-ini", SEKARANG)!;
  const lap = L.susunLaporan([induk, usd], [], p, SEKARANG);
  const wb = await X.susunBukuKontrak([induk, usd, add], [induk, add, usd], { sekarang: SEKARANG, cakupan: "Uji", laporan: lap, riwayat: [ev(induk.id, "Diajukan", "Review Legal", "2026-09-02T03:00:00Z")] });
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Kontrak", "Addendum", "Ringkasan", "Layanan", "Riwayat Status"]);
  const ws = wb.getWorksheet("Kontrak")!;
  assert.equal(ws.rowCount, 3, "addendum tidak masuk lembar Kontrak");
  assert.equal(String(ws.getCell("C2").value).startsWith("'="), true);
  const efektif = ws.getCell("J2").value as { formula: string; result: number };
  assert.equal(efektif.formula, "N(H2)+N(I2)");
  assert.equal(efektif.result, 1_500_000);
  assert.equal(ws.getCell("I2").value, 500_000);
  assert.equal(ws.getCell("H3").numFmt, "#,##0.00");
  assert.deepEqual((ws.getCell("T2").value as { text: string }).text, "Buka");
  assert.ok(ws.autoFilter);
  assert.equal((ws.views[0] as { state: string; ySplit?: number }).state, "frozen");
  const ringkas = wb.getWorksheet("Ringkasan")!;
  const aktif = ringkas.getCell("B12").value as { formula: string };
  assert.equal(ringkas.getCell("A12").value, "Aktif");
  assert.equal(aktif.formula, `COUNTIFS('Kontrak'!$L$2:$L$3,"Aktif")`);
  assert.match((ringkas.getCell("C12").value as { formula: string }).formula, /^SUMIFS\('Kontrak'!\$J\$2:\$J\$3,'Kontrak'!\$G\$2:\$G\$3,"IDR"/);
  assert.equal(wb.getWorksheet("Addendum")!.getCell("B2").value, induk.nomorPengajuan);

  const buffer = await wb.xlsx.writeBuffer();
  const mod = await import("exceljs");
  const Buku = mod.Workbook ?? (mod as unknown as { default: typeof mod }).default.Workbook;
  const baca = new Buku();
  await baca.xlsx.load(buffer);
  assert.equal(baca.getWorksheet("Kontrak")!.getCell("A2").value, induk.nomorPengajuan);
});

console.log(`\nSemua ${nomor} kasus lulus.`);
