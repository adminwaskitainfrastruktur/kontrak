// Uji lib/jaminan.ts, lib/masa.ts, dan lib/plafon.ts. Jalankan: npx --yes tsx scripts/uji-jaminan.ts
import assert from "node:assert/strict";
import {
  filterJaminanAmbang,
  jaminanKeCsv,
  levelJaminan,
  panelJaminanRelevan,
  peringatanAktivasi,
  peringatanKontrak,
  peringatanSemua,
  ringkasJaminan,
  sanitasiSel,
  saringJaminan,
  sisaHariJaminan,
  statusEfektif,
  teksSisaJaminan,
  urutkanJaminan,
} from "../src/lib/jaminan";
import {
  akhirKontrak,
  bacaMasaPemberitahuan,
  batasKeputusan,
  filterKewajibanJatuhTempo,
  filterTanggalTepat,
  hariWib,
  jendelaMasa,
  kelompokMasa,
  klausulBelumDiisi,
  levelKewajiban,
  pengingatMasa,
  ringkasKewajiban,
  selisihYmd,
  siapDitutup,
  tambahYmd,
  terlambat,
  urutkanKewajiban,
  type Kewajiban,
} from "../src/lib/masa";
import { adalahPayung, peringatanTurunanBaru, ringkasPlafon, turunanPayung } from "../src/lib/plafon";
import type { Jaminan, Kontrak } from "../src/lib/types";

let nomor = 0;
const kasus = (nama: string, fn: () => void) => {
  fn();
  nomor++;
  console.log(`ok ${nomor} - ${nama}`);
};

const HARI = "2026-10-02";

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
    tanggalMulai: "2026-01-01",
    tanggalBerakhir: "2027-06-30",
    status: "Aktif",
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
    dibuat: "2026-09-10T03:00:00Z",
    diubah: "2026-09-20T03:00:00Z",
    webUrl: "",
    ...sebagian,
  };
}

const addendum = (induk: Kontrak, sebagian: Partial<Kontrak>) =>
  kontrak({ jenis: "Addendum / Amandemen", kontrakIndukId: induk.id, jenisPerubahan: ["Perpanjangan Waktu"], tanggalMulai: null, tanggalBerakhir: null, ...sebagian });

let seqJ = 0;
function jaminan(sebagian: Partial<Jaminan>): Jaminan {
  seqJ++;
  return {
    id: seqJ,
    nomor: `BG-${seqJ}`,
    kontrakId: null,
    jenis: "Jaminan Pelaksanaan",
    penerbit: "Bank Contoh",
    nilai: 1_000_000,
    mataUang: "IDR",
    tanggalTerbit: "2026-01-01",
    tanggalBerakhir: "2027-06-30",
    status: "Aktif",
    catatan: "",
    ...sebagian,
  };
}

let seqW = 0;
function kewajiban(sebagian: Partial<Kewajiban>): Kewajiban {
  seqW++;
  return { id: seqW, judul: `Kewajiban ${seqW}`, kontrakId: 1, tipe: "BAST", jatuhTempo: "2026-10-10", picEmail: "", status: "Terbuka", buktiUrl: "", catatan: "", ...sebagian };
}

// --- Tanggal -------------------------------------------------------------------

kasus("hariWib memakai zona Jakarta (UTC+7) di pergantian hari", () => {
  assert.equal(hariWib(new Date("2026-10-01T16:59:00Z")), "2026-10-01");
  assert.equal(hariWib(new Date("2026-10-01T17:00:00Z")), "2026-10-02");
});

kasus("tambahYmd dan selisihYmd melintasi bulan dan tahun kabisat", () => {
  assert.equal(tambahYmd("2028-02-28", 1), "2028-02-29");
  assert.equal(tambahYmd("2027-02-28", 1), "2027-03-01");
  assert.equal(tambahYmd("2026-01-05", -10), "2025-12-26");
  assert.equal(selisihYmd("2026-10-02", "2026-11-01"), 30);
  assert.equal(selisihYmd("2026-11-01", "2026-10-02"), -30);
});

kasus("filterTanggalTepat memakai rentang tengah malam Jakarta", () => {
  assert.equal(filterTanggalTepat("JatuhTempo", "2026-11-01"), "fields/JatuhTempo ge '2026-10-31T17:00:00.000Z' and fields/JatuhTempo lt '2026-11-01T17:00:00.000Z'");
});

// --- Jaminan -------------------------------------------------------------------

kasus("statusEfektif: Aktif lewat tanggal menjadi Kedaluwarsa; pada tanggalnya masih Aktif", () => {
  assert.equal(statusEfektif(jaminan({ tanggalBerakhir: "2026-10-01" }), HARI), "Kedaluwarsa");
  assert.equal(statusEfektif(jaminan({ tanggalBerakhir: HARI }), HARI), "Aktif");
  assert.equal(statusEfektif(jaminan({ tanggalBerakhir: "2026-10-01", status: "Dikembalikan" }), HARI), "Dikembalikan");
  assert.equal(statusEfektif(jaminan({ tanggalBerakhir: null }), HARI), "Aktif");
});

kasus("levelJaminan pada setiap ambang 30/14/7 dan tepinya", () => {
  const lv = (n: number) => levelJaminan(jaminan({ tanggalBerakhir: tambahYmd(HARI, n) }), HARI);
  assert.equal(lv(31), "aman");
  assert.equal(lv(30), "30");
  assert.equal(lv(15), "30");
  assert.equal(lv(14), "14");
  assert.equal(lv(8), "14");
  assert.equal(lv(7), "7");
  assert.equal(lv(0), "7");
  assert.equal(lv(-1), "lewat");
  assert.equal(levelJaminan(jaminan({ status: "Dicairkan" }), HARI), "selesai");
  assert.equal(levelJaminan(jaminan({ tanggalBerakhir: null }), HARI), "tanpa-tanggal");
});

kasus("sisaHariJaminan dan teksSisaJaminan", () => {
  assert.equal(sisaHariJaminan(jaminan({ tanggalBerakhir: "2026-10-14" }), HARI), 12);
  assert.equal(sisaHariJaminan(jaminan({ tanggalBerakhir: null }), HARI), null);
  assert.equal(teksSisaJaminan(jaminan({ tanggalBerakhir: "2026-10-14" }), HARI), "12 hari lagi");
  assert.equal(teksSisaJaminan(jaminan({ tanggalBerakhir: HARI }), HARI), "Berakhir hari ini");
  assert.equal(teksSisaJaminan(jaminan({ tanggalBerakhir: "2026-09-29" }), HARI), "Lewat 3 hari");
  assert.equal(teksSisaJaminan(jaminan({ status: "Dikembalikan" }), HARI), "Dikembalikan");
});

kasus("peringatanAktivasi: hanya Pengadaan Jasa tanpa jaminan pelaksanaan yang berlaku, selalu kuning", () => {
  const jasa = kontrak({ jenis: "Pengadaan Jasa" });
  const p = peringatanAktivasi(jasa, [], HARI);
  assert.ok(p);
  assert.equal(p.nada, "kuning");
  assert.equal(p.kode, "tanpa-pelaksanaan");
  assert.equal(peringatanAktivasi(jasa, [jaminan({})], HARI), null);
  // Jaminan pelaksanaan yang sudah lewat tidak dihitung berlaku.
  assert.ok(peringatanAktivasi(jasa, [jaminan({ tanggalBerakhir: "2026-01-31" })], HARI));
  // Jaminan jenis lain tidak menggantikan jaminan pelaksanaan.
  assert.ok(peringatanAktivasi(jasa, [jaminan({ jenis: "Jaminan Uang Muka" })], HARI));
  assert.equal(peringatanAktivasi(kontrak({ jenis: "Pengadaan Barang" }), [], HARI), null);
});

kasus("peringatanKontrak: jaminan pelaksanaan berakhir sebelum kontrak -> pendek (kuning)", () => {
  const k = kontrak({ tanggalBerakhir: "2027-06-30" });
  const p = peringatanKontrak(k, [jaminan({ kontrakId: k.id, tanggalBerakhir: "2027-03-31" })], [k], HARI);
  assert.equal(p.length, 1);
  assert.equal(p[0]!.kode, "pendek");
  assert.equal(p[0]!.nada, "kuning");
  // Sama panjang: tidak ada peringatan.
  assert.deepEqual(peringatanKontrak(k, [jaminan({ kontrakId: k.id, tanggalBerakhir: "2027-06-30" })], [k], HARI), []);
  // Jaminan kedua yang menutup masa kontrak membuat peringatan hilang.
  assert.deepEqual(peringatanKontrak(k, [jaminan({ tanggalBerakhir: "2027-03-31" }), jaminan({ tanggalBerakhir: "2027-07-31" })], [k], HARI), []);
});

kasus("peringatanKontrak: addendum perpanjangan melewati masa jaminan -> perlu-diperbarui", () => {
  const induk = kontrak({ tanggalBerakhir: "2027-01-31" });
  const a = addendum(induk, { status: "Aktif", tanggalBerakhir: "2027-12-31" });
  const semua = [induk, a];
  assert.equal(akhirKontrak(induk, semua), "2027-12-31");
  const p = peringatanKontrak(induk, [jaminan({ tanggalBerakhir: "2027-01-31" })], semua, HARI);
  assert.equal(p.length, 1);
  assert.equal(p[0]!.kode, "perlu-diperbarui");
  // Addendum yang masih diproses belum memperpanjang apa pun.
  const proses = addendum(induk, { status: "Review Legal", tanggalBerakhir: "2027-12-31" });
  assert.deepEqual(peringatanKontrak(induk, [jaminan({ tanggalBerakhir: "2027-01-31" })], [induk, proses], HARI), []);
});

kasus("peringatanKontrak: tepi (bukan Aktif, MoU, jaminan dikembalikan)", () => {
  assert.deepEqual(peringatanKontrak(kontrak({ status: "Review Legal" }), [], [], HARI), []);
  assert.deepEqual(peringatanKontrak(kontrak({ jenis: "MoU / Nota Kesepahaman" }), [], [], HARI), []);
  // Hanya ada jaminan pelaksanaan yang sudah dikembalikan: tidak dianggap "tanpa jaminan", juga tidak "pendek".
  const k = kontrak({});
  assert.deepEqual(peringatanKontrak(k, [jaminan({ status: "Dikembalikan", tanggalBerakhir: "2026-05-01" })], [k], HARI), []);
  // Pengadaan Jasa aktif tanpa jaminan sama sekali.
  assert.equal(peringatanKontrak(k, [], [k], HARI)[0]!.kode, "tanpa-pelaksanaan");
});

kasus("peringatanSemua mengelompokkan per kontrak dan membuang tanpa-pelaksanaan", () => {
  const k1 = kontrak({});
  const k2 = kontrak({});
  const m = peringatanSemua([k1, k2], [jaminan({ kontrakId: k1.id, tanggalBerakhir: "2027-01-01" })], HARI);
  assert.equal(m.size, 1);
  assert.equal(m.get(k1.id)![0]!.kode, "pendek");
  assert.equal(m.has(k2.id), false);
});

kasus("panelJaminanRelevan", () => {
  assert.equal(panelJaminanRelevan(kontrak({})), true);
  assert.equal(panelJaminanRelevan(kontrak({ jenis: "Kerahasiaan (NDA)" })), false);
  assert.equal(panelJaminanRelevan(kontrak({ jenis: "MoU / Nota Kesepahaman" })), false);
  assert.equal(panelJaminanRelevan(kontrak({ status: "Ditolak" })), false);
});

kasus("ringkasJaminan: hitungan, nilai per mata uang, terdekat", () => {
  const daftar = [
    jaminan({ tanggalBerakhir: "2026-10-20", nilai: 100 }),
    jaminan({ tanggalBerakhir: "2027-01-01", nilai: 50, mataUang: "USD" }),
    jaminan({ tanggalBerakhir: "2026-09-01" }),
    jaminan({ status: "Dikembalikan" }),
    jaminan({ tanggalBerakhir: HARI, nilai: 10 }),
  ];
  const r = ringkasJaminan(daftar, HARI);
  assert.equal(r.total, 5);
  assert.equal(r.aktif, 3);
  assert.equal(r.berakhir30, 2);
  assert.equal(r.kedaluwarsa, 1);
  assert.deepEqual(r.nilaiAktif, { IDR: 110, USD: 50 });
  assert.equal(r.terdekat?.tanggalBerakhir, HARI);
  assert.deepEqual(ringkasJaminan([], HARI), { total: 0, aktif: 0, berakhir30: 0, kedaluwarsa: 0, terdekat: null, nilaiAktif: {} });
});

kasus("saringJaminan: segera 30/60, status efektif, kontrak, cari", () => {
  const a = jaminan({ tanggalBerakhir: tambahYmd(HARI, 20), kontrakId: 7, penerbit: "Bank Mandiri" });
  const b = jaminan({ tanggalBerakhir: tambahYmd(HARI, 45), jenis: "Jaminan Uang Muka" });
  const c = jaminan({ tanggalBerakhir: tambahYmd(HARI, -2) });
  const daftar = [a, b, c];
  assert.deepEqual(saringJaminan(daftar, { segeraHari: 30 }, HARI), [a]);
  assert.deepEqual(saringJaminan(daftar, { segeraHari: 60 }, HARI), [a, b]);
  assert.deepEqual(saringJaminan(daftar, { status: "Kedaluwarsa" }, HARI), [c]);
  assert.deepEqual(saringJaminan(daftar, { status: "Aktif" }, HARI), [a, b]);
  assert.deepEqual(saringJaminan(daftar, { kontrakId: 7 }, HARI), [a]);
  assert.deepEqual(saringJaminan(daftar, { cari: "  mandiri " }, HARI), [a]);
  assert.deepEqual(saringJaminan(daftar, { jenis: "Jaminan Uang Muka" }, HARI), [b]);
  assert.equal(saringJaminan(daftar, {}, HARI).length, 3);
});

kasus("urutkanJaminan: kedaluwarsa, lalu aktif menurut tanggal, lalu yang selesai", () => {
  const selesai = jaminan({ status: "Dikembalikan", tanggalBerakhir: "2026-01-01" });
  const lewat = jaminan({ tanggalBerakhir: "2026-09-01" });
  const jauh = jaminan({ tanggalBerakhir: "2027-09-01" });
  const dekat = jaminan({ tanggalBerakhir: "2026-11-01" });
  assert.deepEqual(urutkanJaminan([selesai, jauh, dekat, lewat], HARI).map((j) => j.id), [lewat.id, dekat.id, jauh.id, selesai.id]);
});

kasus("sanitasiSel dan jaminanKeCsv (pemisah titik koma, rumus dinetralkan)", () => {
  assert.equal(sanitasiSel("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(sanitasiSel("-5"), "'-5");
  assert.equal(sanitasiSel("@x"), "'@x");
  assert.equal(sanitasiSel("Bank"), "Bank");
  const k = kontrak({ judul: 'Sewa "Crane"; Tahap 1' });
  const csv = jaminanKeCsv([jaminan({ kontrakId: k.id, nomor: "=HYPERLINK()", catatan: "baris1\nbaris2" })], new Map([[k.id, k]]), HARI);
  const baris = csv.split("\r\n");
  assert.equal(baris[0]!.split(";").length, 14);
  assert.ok(baris[1]!.startsWith("'=HYPERLINK();Jaminan Pelaksanaan;"));
  assert.ok(csv.includes('"Sewa ""Crane""; Tahap 1"'));
  assert.ok(csv.includes('"baris1\nbaris2"'));
});

kasus("filterJaminanAmbang untuk flow pengingat 30/14/7", () => {
  assert.equal(
    filterJaminanAmbang(30, HARI),
    "fields/StatusJaminan eq 'Aktif' and fields/TanggalBerakhirJaminan ge '2026-10-31T17:00:00.000Z' and fields/TanggalBerakhirJaminan lt '2026-11-01T17:00:00.000Z'",
  );
  assert.ok(filterJaminanAmbang(7, HARI).includes("'2026-10-08T17:00:00.000Z'"));
});

// --- Masa (U34) -----------------------------------------------------------------

kasus("klausulBelumDiisi: null ditandai, 0 tidak, addendum tidak dihitung", () => {
  const induk = kontrak({});
  assert.equal(klausulBelumDiisi(induk), true);
  assert.equal(klausulBelumDiisi(kontrak({ masaPemberitahuanHari: 0 })), false);
  assert.equal(klausulBelumDiisi(addendum(induk, {})), false);
});

kasus("batasKeputusan dari berakhir efektif (termasuk addendum aktif)", () => {
  const k = kontrak({ tanggalBerakhir: "2026-12-31", masaPemberitahuanHari: 30 });
  assert.equal(batasKeputusan(k, [k]), "2026-12-01");
  const a = addendum(k, { status: "Aktif", tanggalBerakhir: "2027-03-31" });
  assert.equal(batasKeputusan(k, [k, a]), "2027-03-01");
  // Tanpa daftar: memakai kolom BerakhirEfektif bila ada.
  assert.equal(batasKeputusan({ ...k, berakhirEfektif: "2027-01-31" }), "2027-01-01");
  assert.equal(batasKeputusan(kontrak({ masaPemberitahuanHari: null })), null);
  assert.equal(batasKeputusan(kontrak({ tanggalBerakhir: null, masaPemberitahuanHari: 30 })), null);
});

kasus("jendelaMasa: tahap mendatang, mendekat, mendesak, lewat-batas, berakhir", () => {
  const tahap = (akhir: number, masa: number | null) => {
    const k = kontrak({ tanggalBerakhir: tambahYmd(HARI, akhir), masaPemberitahuanHari: masa });
    return jendelaMasa(k, [k], HARI)!.tahap;
  };
  assert.equal(tahap(200, 30), "mendatang");
  assert.equal(tahap(120, 30), "mendekat");
  assert.equal(tahap(44, 30), "mendesak");
  assert.equal(tahap(20, 30), "lewat-batas");
  assert.equal(tahap(-1, 30), "berakhir");
  assert.equal(tahap(10, null), "mendesak");
  assert.equal(tahap(100, null), "mendatang");
  assert.equal(jendelaMasa(kontrak({ tanggalBerakhir: null }), [], HARI), null);
});

kasus("kelompokMasa memisahkan diperpanjang otomatis dari akan berakhir", () => {
  const oto = kontrak({ tanggalBerakhir: tambahYmd(HARI, 60), masaPemberitahuanHari: 30, perpanjanganOtomatis: true });
  const habis = kontrak({ tanggalBerakhir: tambahYmd(HARI, 40), masaPemberitahuanHari: 0 });
  const jauh = kontrak({ tanggalBerakhir: tambahYmd(HARI, 400) });
  const draft = kontrak({ status: "Review Legal", tanggalBerakhir: tambahYmd(HARI, 10) });
  const g = kelompokMasa([oto, habis, jauh, draft], HARI);
  assert.deepEqual(g.otomatis.map((j) => j.kontrak.id), [oto.id]);
  assert.deepEqual(g.akanBerakhir.map((j) => j.kontrak.id), [habis.id]);
  assert.equal(g.mendatang, 1);
  assert.deepEqual(g.belumDiisi.map((k) => k.id), [jauh.id]);
});

kasus("pengingatMasa hanya tepat di ambang 30/14/7 hari ke batas keputusan", () => {
  const k30 = kontrak({ tanggalBerakhir: tambahYmd(HARI, 60), masaPemberitahuanHari: 30 });
  const k7 = kontrak({ tanggalBerakhir: tambahYmd(HARI, 37), masaPemberitahuanHari: 30 });
  const k8 = kontrak({ tanggalBerakhir: tambahYmd(HARI, 38), masaPemberitahuanHari: 30 });
  const tanpa = kontrak({ tanggalBerakhir: tambahYmd(HARI, 30) });
  const h = pengingatMasa([k30, k7, k8, tanpa], HARI);
  assert.deepEqual(h.map((x) => [x.jendela.kontrak.id, x.ambang]), [[k7.id, 7], [k30.id, 30]]);
});

kasus("bacaMasaPemberitahuan", () => {
  assert.deepEqual(bacaMasaPemberitahuan(""), { nilai: null, galat: null });
  assert.deepEqual(bacaMasaPemberitahuan(" 30 "), { nilai: 30, galat: null });
  assert.deepEqual(bacaMasaPemberitahuan("0"), { nilai: 0, galat: null });
  assert.ok(bacaMasaPemberitahuan("-1").galat);
  assert.ok(bacaMasaPemberitahuan("2,5").galat);
  assert.ok(bacaMasaPemberitahuan("731").galat);
  assert.deepEqual(bacaMasaPemberitahuan("730"), { nilai: 730, galat: null });
});

// --- Kewajiban (U33) ------------------------------------------------------------

kasus("terlambat dan levelKewajiban", () => {
  assert.equal(terlambat(kewajiban({ jatuhTempo: "2026-10-01" }), HARI), true);
  assert.equal(terlambat(kewajiban({ jatuhTempo: HARI }), HARI), false);
  assert.equal(terlambat(kewajiban({ jatuhTempo: "2026-10-01", status: "Selesai" }), HARI), false);
  assert.equal(terlambat(kewajiban({ jatuhTempo: null }), HARI), false);
  assert.equal(levelKewajiban(kewajiban({ jatuhTempo: "2026-10-09" }), HARI), "segera");
  assert.equal(levelKewajiban(kewajiban({ jatuhTempo: "2026-10-10" }), HARI), "terbuka");
  assert.equal(levelKewajiban(kewajiban({ status: "Dibatalkan" }), HARI), "batal");
});

kasus("ringkasKewajiban dan urutkanKewajiban", () => {
  const a = kewajiban({ jatuhTempo: "2026-09-01" });
  const b = kewajiban({ jatuhTempo: "2026-10-05" });
  const c = kewajiban({ jatuhTempo: "2026-12-01" });
  const d = kewajiban({ status: "Selesai", jatuhTempo: "2026-08-01" });
  const e = kewajiban({ status: "Dibatalkan" });
  assert.deepEqual(ringkasKewajiban([a, b, c, d, e], HARI), { total: 5, terbuka: 3, terlambat: 1, segera: 1, selesai: 1, dibatalkan: 1 });
  assert.deepEqual(urutkanKewajiban([e, d, c, b, a], HARI).map((w) => w.id), [a.id, b.id, c.id, d.id, e.id]);
});

kasus("siapDitutup hanya petunjuk: semua selesai dan kontrak mendekati akhir", () => {
  const k = kontrak({ tanggalBerakhir: tambahYmd(HARI, 30) });
  const selesai = [kewajiban({ status: "Selesai" }), kewajiban({ status: "Dibatalkan" })];
  assert.equal(siapDitutup(k, [k], selesai, HARI), true);
  assert.equal(siapDitutup(k, [k], [...selesai, kewajiban({})], HARI), false);
  assert.equal(siapDitutup(k, [k], [], HARI), false);
  assert.equal(siapDitutup(k, [k], [kewajiban({ status: "Dibatalkan" })], HARI), false);
  const jauh = kontrak({ tanggalBerakhir: tambahYmd(HARI, 200) });
  assert.equal(siapDitutup(jauh, [jauh], selesai, HARI), false);
  assert.equal(siapDitutup({ ...k, status: "Berakhir" }, [k], selesai, HARI), false);
});

kasus("filterKewajibanJatuhTempo", () => {
  assert.equal(filterKewajibanJatuhTempo("2026-10-02"), "fields/StatusKewajiban eq 'Terbuka' and fields/JatuhTempo ge '2026-10-01T17:00:00.000Z' and fields/JatuhTempo lt '2026-10-02T17:00:00.000Z'");
});

// --- Plafon (U35) ---------------------------------------------------------------

kasus("adalahPayung: MoU atau kontrak berplafon, bukan addendum", () => {
  assert.equal(adalahPayung(kontrak({ jenis: "MoU / Nota Kesepahaman" })), true);
  assert.equal(adalahPayung(kontrak({ jenis: "Pengadaan Barang", plafon: 1_000 })), true);
  assert.equal(adalahPayung(kontrak({ jenis: "Pengadaan Barang", plafon: 0 })), true);
  assert.equal(adalahPayung(kontrak({ jenis: "Pengadaan Barang" })), false);
  const induk = kontrak({});
  assert.equal(adalahPayung(addendum(induk, { plafon: 5 })), false);
});

kasus("ringkasPlafon: terpakai, sisa, persen, mata uang lain, addendum, status gugur", () => {
  const p = kontrak({ jenis: "Pengadaan Barang", plafon: 1_000, tanggalMulai: "2026-01-01", tanggalBerakhir: "2026-12-31" });
  const t1 = kontrak({ mouAcuanId: p.id, nilai: 400, tanggalMulai: "2026-02-01", tanggalBerakhir: "2026-06-30" });
  const t1a = addendum(t1, { status: "Aktif", nilai: 100, jenisPerubahan: ["Perubahan Nilai"] });
  const t2 = kontrak({ mouAcuanId: p.id, nilai: 300, status: "Review Legal", tanggalMulai: "2026-03-01", tanggalBerakhir: "2026-09-30" });
  const t3 = kontrak({ mouAcuanId: p.id, nilai: 9_999, status: "Ditolak" });
  const t4 = kontrak({ mouAcuanId: p.id, nilai: 50, mataUang: "USD", tanggalMulai: "2026-03-01", tanggalBerakhir: "2026-09-30" });
  const semua = [p, t1, t1a, t2, t3, t4];
  assert.equal(turunanPayung(p, semua).length, 4);
  const r = ringkasPlafon(p, semua);
  assert.equal(r.terpakai, 800);
  assert.equal(r.dalamProses, 300);
  assert.equal(r.sisa, 200);
  assert.equal(r.persen, 80);
  assert.equal(r.jumlahTurunan, 3);
  assert.equal(r.jumlahMataUangLain, 1);
  assert.deepEqual(r.peringatan, []);
});

kasus("ringkasPlafon: peringatan lunak melebihi plafon dan di luar masa payung", () => {
  const p = kontrak({ jenis: "Pengadaan Barang", plafon: 500, tanggalMulai: "2026-01-01", tanggalBerakhir: "2026-12-31" });
  const t1 = kontrak({ mouAcuanId: p.id, nilai: 400, tanggalMulai: "2026-02-01", tanggalBerakhir: "2026-06-30" });
  const t2 = kontrak({ mouAcuanId: p.id, nilai: 300, tanggalMulai: "2026-06-01", tanggalBerakhir: "2027-03-31" });
  const r = ringkasPlafon(p, [p, t1, t2]);
  assert.equal(r.sisa, -200);
  assert.equal(r.persen, 140);
  assert.deepEqual(r.peringatan.map((x) => x.kode), ["melebihi", "di-luar-masa"]);
  assert.ok(r.peringatan.every((x) => x.nada === "kuning"));
  assert.deepEqual(r.diLuarMasaIds, [t2.id]);
  // Teks peringatan tidak memuat judul kontrak turunan (pengaju hanya melihat agregat).
  assert.ok(r.peringatan.every((x) => !x.teks.includes("Kontrak contoh")));
});

kasus("ringkasPlafon: MoU tanpa plafon dan plafon nol", () => {
  const mou = kontrak({ jenis: "MoU / Nota Kesepahaman" });
  const t = kontrak({ mouAcuanId: mou.id, nilai: 250 });
  const r = ringkasPlafon(mou, [mou, t]);
  assert.equal(r.plafon, null);
  assert.equal(r.sisa, null);
  assert.equal(r.persen, null);
  assert.equal(r.terpakai, 250);
  const nol = kontrak({ jenis: "Pengadaan Barang", plafon: 0 });
  assert.equal(ringkasPlafon(nol, [nol]).persen, null);
});

kasus("peringatanTurunanBaru mengecualikan turunan itu sendiri", () => {
  const p = kontrak({ jenis: "Pengadaan Barang", plafon: 1_000, tanggalMulai: "2026-01-01", tanggalBerakhir: "2026-12-31" });
  const t1 = kontrak({ mouAcuanId: p.id, nilai: 700 });
  const semua = [p, t1];
  assert.equal(peringatanTurunanBaru(p, semua, { nilai: 400, mataUang: "IDR", tanggalMulai: "2026-02-01", tanggalBerakhir: "2026-03-01" }).length, 1);
  assert.deepEqual(peringatanTurunanBaru(p, semua, { nilai: 900, mataUang: "IDR", tanggalMulai: "2026-02-01", tanggalBerakhir: "2026-03-01" }, t1.id), []);
  assert.deepEqual(peringatanTurunanBaru(p, semua, { nilai: 400, mataUang: "USD", tanggalMulai: "2026-02-01", tanggalBerakhir: "2026-03-01" }), []);
  assert.equal(peringatanTurunanBaru(p, semua, { nilai: null, mataUang: "IDR", tanggalMulai: "2025-12-01", tanggalBerakhir: null }).length, 1);
});

console.log(`\n${nomor} kasus lulus.`);
