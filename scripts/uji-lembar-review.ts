// Uji Lembar Hasil Review Legal: lib/lembarStandar.ts, lib/lembarReview.ts, lib/lembarDokumen.ts.
// Jalankan: npx --yes tsx scripts/uji-lembar-review.ts
import assert from "node:assert/strict";
import {
  BATAS_JSON_LEMBAR,
  JENIS_LEMBAR,
  MAKS_TEMUAN,
  adalahBerkasLembar,
  bolehCatatPersetujuanLembar,
  bolehLihatLembar,
  bolehUbahLembar,
  bukaKembaliPutaran,
  bungkusHasilPengaju,
  bungkusLembar,
  catatPersetujuanLembar,
  cekFinalisasi,
  finalkanPutaran,
  namaBerkasLembar,
  pangkasLembar,
  peringatanLembarSebelumTtd,
  poinRevisiDariTemuan,
  pokokAwal,
  putaranBaru,
  putaranFinalTerakhir,
  putaranTerakhir,
  rapikanPutaran,
  ringkasHasilPindai,
  ringkasLembarUntukCatatan,
  ringkasTemuan,
  ringkasUntukPengaju,
  risikoKeseluruhan,
  salinanUsang,
  sarankanKesimpulan,
  simpanPutaran,
  susunDataOtomatis,
  susunKepatuhan,
  tampilkanHasilUntukPengaju,
  tampilkanPanelLembar,
  temuanKosong,
  teksRevisiDariTemuan,
  uraiHasilPengaju,
  uraiLembar,
  type LembarReview,
  type PutaranReview,
  type TemuanReview,
} from "../src/lib/lembarReview";
import { DAFTAR_KESIMPULAN, KEPATUHAN_DASAR, KODE_KESIMPULAN, KRITERIA_RISIKO, TINGKAT_RISIKO, USULAN_SYARAT_TTD, daftarKepatuhan, daftarPokok, defKesimpulan } from "../src/lib/lembarStandar";
import { buatLembarDocx, susunDokumenLembar, teksBlokLembar } from "../src/lib/lembarDokumen";
import { JENIS_DOKUMEN, JENIS_KONTRAK, type Aktivitas, type Dokumen, type Kontrak, type Sesi } from "../src/lib/types";
import { izinDokumen, pilihanJenisUntuk } from "../src/lib/jenisBerkas";
import { kekuranganDokumen } from "../src/lib/syarat";

let nomor = 0;
const kasus = (nama: string, fn: () => void | Promise<void>) => {
  const hasil = fn();
  if (hasil instanceof Promise) return hasil.then(() => console.log(`ok ${++nomor} - ${nama}`));
  console.log(`ok ${++nomor} - ${nama}`);
};

const legal: Sesi = { email: "legal@wki.co.id", nama: "Rina Legal", peran: "Legal", divisi: "Legal", penggunaId: 1 };
const pemantau: Sesi = { email: "pantau@wki.co.id", nama: "Doni", peran: "Pemantau", divisi: "Legal", penggunaId: 3 };
const pengaju: Sesi = { email: "scm@wki.co.id", nama: "Budi SCM", peran: "Pengaju", divisi: "SCM", penggunaId: 2 };

function kontrak(sebagian: Partial<Kontrak> = {}): Kontrak {
  return {
    id: 7,
    judul: "Pengadaan Besi Beton Proyek Tol",
    nomorPengajuan: "KTR-2026-0007",
    nomorKontrak: "",
    jenis: "Pengadaan Barang",
    divisi: "SCM",
    mitra: "PT Baja Nusantara",
    nilai: 1_250_000_000,
    mataUang: "IDR",
    tanggalMulai: "2026-11-01",
    tanggalBerakhir: "2027-04-30",
    status: "Review Legal",
    prioritas: "Normal",
    deskripsi: "Pengadaan besi beton  untuk\nproyek tol seksi 3.",
    targetSelesai: null,
    pengajuEmail: "scm@wki.co.id",
    pengajuNama: "Budi SCM",
    picLegalEmail: "legal@wki.co.id",
    picLegalNama: "Rina Legal",
    tanggalDiajukan: "2026-10-01T02:00:00Z",
    tanggalTandaTangan: null,
    kontrakIndukId: null,
    mouAcuanId: null,
    jenisPerubahan: [],
    urutanAddendum: null,
    statusSejak: "2026-10-03T02:00:00Z",
    berakhirEfektif: null,
    checklistReview: null,
    checklistTtd: null,
    kodeProyek: "TOL-03",
    nomorReferensi: "PO-123",
    costCenter: "",
    mitraId: null,
    kontrakFinal: "",
    perpanjanganOtomatis: false,
    masaPemberitahuanHari: null,
    modeBerakhir: "",
    tanggalDiakhiri: null,
    adaSengketa: false,
    plafon: null,
    persetujuan: null,
    salinDari: null,
    npwpMitra: "01.234.567.8-901.000",
    alamatMitra: "Jl. Industri 1, Bekasi",
    penandatanganMitra: "Agus",
    jabatanMitra: "Direktur",
    dasarKewenangan: "Akta No. 5",
    pihakLain: [{ nama: "Bank Mandiri", peran: "Penjamin" }],
    dibuat: "2026-10-01T02:00:00Z",
    diubah: "2026-10-03T02:00:00Z",
    webUrl: "",
    ...sebagian,
  };
}

const dok = (nama: string, jenis: Dokumen["jenis"], diubah = "2026-10-02T03:00:00Z"): Dokumen => ({ id: nama, nama, jenis, ukuran: 2048, webUrl: "", unduhUrl: null, diubah, diubahOleh: "Budi" });
let seq = 0;
const akt = (s: Partial<Aktivitas>): Aktivitas => ({ id: ++seq, kontrakId: 7, jenis: "Komentar", pesan: "", statusDari: "", statusKe: "", olehEmail: "", olehNama: "", waktu: "2026-10-01T03:00:00Z", detail: [], disebut: [], ...s });

const SEKARANG = "2026-10-05T04:00:00Z";
const HARI = "2026-10-05";
const pengulas = { nama: "Rina Legal", email: "legal@wki.co.id" };
const temuan = (s: Partial<TemuanReview> = {}): TemuanReview => ({ ...temuanKosong(), pasal: "Pasal 5", isu: "Denda tanpa batas", usulan: "Batasi denda 5%", ...s });

console.log("lembarStandar");

kasus("setiap jenis kontrak punya pokok, kepatuhan, dan id unik", () => {
  for (const j of JENIS_KONTRAK) {
    const pokok = daftarPokok(j);
    assert.ok(pokok.length >= 4, j);
    assert.equal(new Set(pokok.map((p) => p.id)).size, pokok.length, `${j}: id pokok ganda`);
    const kep = daftarKepatuhan(j);
    assert.ok(kep.length >= 4, `${j}: ${kep.length}`);
    assert.equal(new Set(kep.map((b) => b.id)).size, kep.length, `${j}: id kepatuhan ganda`);
    for (const b of kep) assert.ok(b.dasar.length > 5 && b.label && b.petunjuk, `${j}/${b.id}`);
  }
  assert.equal(new Set(KEPATUHAN_DASAR.map((b) => b.id)).size, KEPATUHAN_DASAR.length);
});

kasus("daftar kepatuhan menyesuaikan jenis kontrak", () => {
  const ids = (j: (typeof JENIS_KONTRAK)[number]) => daftarKepatuhan(j).map((b) => b.id);
  assert.ok(ids("Pengadaan Jasa").includes("muatan-konstruksi"));
  assert.ok(!ids("Kerahasiaan (NDA)").includes("muatan-konstruksi"));
  assert.ok(ids("MoU / Nota Kesepahaman").includes("sifat-mou"));
  assert.ok(!ids("Pengadaan Barang").includes("sifat-mou"));
  assert.ok(ids("Addendum / Amandemen").includes("dasar-addendum"));
  assert.ok(ids("Sewa").includes("objek-sewa"));
  // Semua jenis memuat syarat sah, bahasa, meterai.
  for (const j of JENIS_KONTRAK) for (const wajib of ["syarat-sah", "bahasa", "meterai"]) assert.ok(ids(j).includes(wajib), `${j}:${wajib}`);
});

kasus("override mengganti daftar; pokok MoU dan NDA tanpa jaminan", () => {
  assert.deepEqual(daftarKepatuhan("Sewa", { Sewa: [{ id: "x", label: "X", dasar: "Dasar X", petunjuk: "p" }] }).map((b) => b.id), ["x"]);
  assert.ok(!daftarPokok("MoU / Nota Kesepahaman").some((p) => p.id === "jaminan" || p.id === "nilai"));
  assert.ok(!daftarPokok("Kerahasiaan (NDA)").some((p) => p.id === "jaminan"));
  assert.deepEqual(daftarPokok("Sewa", { semua: [{ id: "a", label: "A", petunjuk: "p" }] }).map((p) => p.id), ["a"]);
});

kasus("empat kesimpulan berurutan, tiap kesimpulan punya kalimat untuk pengaju tanpa istilah risiko", () => {
  assert.deepEqual([...KODE_KESIMPULAN], ["layak", "layak-catatan", "revisi", "tidak"]);
  assert.equal(DAFTAR_KESIMPULAN.length, 4);
  for (const d of DAFTAR_KESIMPULAN) {
    assert.ok(d.untukPengaju.length > 20);
    assert.ok(!/risiko|temuan/i.test(d.untukPengaju), d.kode);
  }
  assert.equal(defKesimpulan("revisi")?.langkah, "Minta Revisi");
  assert.equal(defKesimpulan(""), null);
  assert.deepEqual([...TINGKAT_RISIKO], ["Rendah", "Sedang", "Tinggi"]);
  for (const t of TINGKAT_RISIKO) assert.ok(KRITERIA_RISIKO[t].arti && KRITERIA_RISIKO[t].tindakan);
  assert.ok(USULAN_SYARAT_TTD.length >= 4);
});

kasus("jenis dokumen baru terdaftar dan hanya Legal yang boleh memakainya", () => {
  assert.ok((JENIS_DOKUMEN as readonly string[]).includes(JENIS_LEMBAR));
  assert.ok(!pilihanJenisUntuk(pengaju).includes(JENIS_LEMBAR));
  assert.ok(pilihanJenisUntuk(legal).includes(JENIS_LEMBAR));
  const k = kontrak({ status: "Diajukan" });
  assert.equal(izinDokumen(k, JENIS_LEMBAR, "hapus", pengaju).boleh, false);
  assert.equal(izinDokumen(k, JENIS_LEMBAR, "hapus", legal).boleh, true);
});

console.log("lembarReview: penguraian");

kasus("uraiLembar menolak teks kosong, rusak, dan bentuk salah tanpa melempar", () => {
  assert.equal(uraiLembar(null), null);
  assert.equal(uraiLembar(""), null);
  assert.equal(uraiLembar("{rusak"), null);
  assert.equal(uraiLembar("[]"), null);
  assert.equal(uraiLembar('{"putaran":"x"}'), null);
  assert.equal(uraiLembar({ putaran: [] }), null);
});

kasus("uraiLembar menambal isian yang hilang dan membuang nilai tak sah", () => {
  const l = uraiLembar({ putaran: [{ nomor: 2, status: "final", temuan: [{ isu: "x", risiko: "Mengerikan", status: "Aneh" }, null, "salah"], kesimpulan: "entah", tanggalReview: "kemarin", pokok: { lingkup: "a", angka: 5 } }] });
  assert.ok(l);
  const p = l!.putaran[0]!;
  assert.equal(p.nomor, 2);
  assert.equal(p.status, "draf", "final tanpa data beku dianggap draf");
  assert.equal(p.temuan.length, 1);
  assert.equal(p.temuan[0]!.risiko, "Sedang");
  assert.equal(p.temuan[0]!.status, "Terbuka");
  assert.equal(p.kesimpulan, "");
  assert.equal(p.tanggalReview, "");
  assert.deepEqual(p.pokok, { lingkup: "a" });
});

kasus("bungkusLembar lalu uraiLembar mengembalikan isi yang sama", () => {
  const p = simpanPutaran(null, { ...putaranBaru(kontrak(), null, pengulas, SEKARANG, HARI), temuan: [temuan()], kesimpulan: "revisi", catatanPengaju: "Mohon diperbaiki." }, SEKARANG);
  const l = uraiLembar(bungkusLembar(p));
  assert.deepEqual(l, p);
});

console.log("lembarReview: putaran");

kasus("putaran pertama: nomor 1, pokok terisi dari data pengajuan, kepatuhan sesuai jenis", () => {
  const p = putaranBaru(kontrak(), null, pengulas, SEKARANG, HARI);
  assert.equal(p.nomor, 1);
  assert.equal(p.status, "draf");
  assert.equal(p.tanggalReview, HARI);
  assert.equal(p.pokok.lingkup, "Pengadaan besi beton untuk proyek tol seksi 3.");
  assert.match(p.pokok.nilai!, /1\.250\.000\.000/);
  assert.match(p.pokok.jangka!, /1 November 2026 s\.d\. 30 April 2027/);
  assert.deepEqual(p.kepatuhan.map((b) => b.id), daftarKepatuhan("Pengadaan Barang").map((b) => b.id));
  assert.ok(p.kepatuhan.every((b) => b.hasil === ""));
  assert.equal(p.kesimpulan, "");
});

kasus("pokokAwal tidak mengisi nilai untuk MoU dan tidak mengarang yang tidak diketahui", () => {
  const h = pokokAwal({ ...kontrak({ jenis: "MoU / Nota Kesepahaman", nilai: null, tanggalMulai: null, tanggalBerakhir: null, deskripsi: "" }) });
  assert.deepEqual(h, {});
  const h2 = pokokAwal(kontrak({ jenis: "MoU / Nota Kesepahaman", nilai: 5 }));
  assert.equal(h2.nilai, undefined);
});

kasus("putaran berikutnya membawa temuan yang belum diterima, syarat yang belum selesai, dan isian kepatuhan", () => {
  const k = kontrak();
  const p1 = putaranBaru(k, null, pengulas, SEKARANG, HARI);
  p1.temuan = [temuan({ id: "a", status: "Diterima" }), temuan({ id: "b", status: "Dinegosiasikan" }), temuan({ id: "c", status: "Ditolak", risiko: "Tinggi" })];
  p1.syarat = [
    { id: "s1", teks: "Meterai", selesai: true },
    { id: "s2", teks: "Paraf", selesai: false },
  ];
  p1.kepatuhan[0] = { ...p1.kepatuhan[0]!, hasil: "sesuai", catatan: "OK" };
  const l = simpanPutaran(null, p1, SEKARANG);
  const p2 = putaranBaru(k, l, pengulas, SEKARANG, "2026-10-12");
  assert.equal(p2.nomor, 2);
  assert.deepEqual(p2.temuan.map((t) => t.id), ["b", "c"]);
  assert.ok(p2.temuan.every((t) => t.dariPutaran === 1));
  assert.deepEqual(p2.syarat.map((s) => s.id), ["s2"]);
  assert.equal(p2.kepatuhan[0]!.hasil, "sesuai");
  assert.equal(p2.kepatuhan[0]!.catatan, "OK");
  assert.equal(p2.kesimpulan, "");
  assert.equal(p2.catatanPengaju, "");
});

kasus("susunKepatuhan membawa butir lama yang terisi walau sudah tidak standar", () => {
  const hasil = susunKepatuhan("Pengadaan Barang", [
    { id: "lama", label: "Butir lama", dasar: "d", hasil: "sesuai", catatan: "" },
    { id: "kosong", label: "Kosong", dasar: "d", hasil: "", catatan: "" },
  ]);
  assert.ok(hasil.some((b) => b.id === "lama"));
  assert.ok(!hasil.some((b) => b.id === "kosong"));
});

kasus("rapikanPutaran membuang baris temuan kosong, memotong teks, dan membatasi jumlah", () => {
  const p = putaranBaru(kontrak(), null, pengulas, SEKARANG, HARI);
  p.temuan = [temuanKosong(), temuan({ isu: "x".repeat(5000) }), ...Array.from({ length: 80 }, () => temuan())];
  p.pokok = { lingkup: "  isi  ", jaminan: "   " };
  const r = rapikanPutaran(p);
  assert.equal(r.temuan.length, MAKS_TEMUAN);
  assert.equal(r.temuan[0]!.isu.length, 1500);
  assert.deepEqual(r.pokok, { lingkup: "isi" });
});

kasus("simpanPutaran menaikkan rev, mengganti putaran yang sama, dan menjaga urutan", () => {
  const k = kontrak();
  const p1 = putaranBaru(k, null, pengulas, SEKARANG, HARI);
  const l1 = simpanPutaran(null, p1, SEKARANG);
  assert.equal(l1.putaran[0]!.rev, 1);
  const l2 = simpanPutaran(l1, { ...l1.putaran[0]!, catatanPengaju: "baru" }, "2026-10-05T05:00:00Z");
  assert.equal(l2.putaran.length, 1);
  assert.equal(l2.putaran[0]!.rev, 2);
  assert.equal(l2.putaran[0]!.catatanPengaju, "baru");
  assert.equal(l2.putaran[0]!.diubah, "2026-10-05T05:00:00Z");
});

kasus("hasil pindai ikut tersimpan di putaran draf, dibekukan saat final, dan dibuang saat dipadatkan", () => {
  const pindai = { nama: "Draft v2.docx", waktu: SEKARANG, terbaca: true, klausul: [{ nama: "Denda", ada: false }, { nama: "Hukum", ada: true }], penanda: 2, selisih: ["Nilai: dokumen Rp 1, pengajuan Rp 2"] };
  const p = { ...putaranBaru(kontrak(), null, pengulas, SEKARANG, HARI), pindai };
  const l = uraiLembar(bungkusLembar(simpanPutaran(null, p, SEKARANG)));
  assert.deepEqual(l!.putaran[0]!.pindai, pindai);
  const data = susunDataOtomatis({ kontrak: kontrak(), dokumen: [], aktivitas: [], pindai: l!.putaran[0]!.pindai, sekarang: SEKARANG });
  assert.deepEqual(data.pindai, pindai);
  const rusak = uraiLembar({ putaran: [{ nomor: 1, pindai: "bukan objek" }] });
  assert.equal(rusak!.putaran[0]!.pindai, undefined);
  const final = finalkanPutaran({ ...putaranLengkap(), pindai }, data, "Rina", SEKARANG);
  const dua = pangkasLembar(
    { versi: 1, putaran: [final, { ...putaranBaru(kontrak(), null, pengulas, SEKARANG, HARI), id: "p2", nomor: 2, catatanPengaju: "z".repeat(53_000) }] },
    BATAS_JSON_LEMBAR,
  );
  assert.equal(dua.muat, true);
  assert.equal(dua.lembar.putaran[0]!.dipangkas, true);
  assert.equal(dua.lembar.putaran[0]!.pindai, undefined);
});

console.log("lembarReview: ringkasan dan saran");

kasus("ringkasTemuan dan risikoKeseluruhan memakai risiko sisa dari temuan yang belum diterima", () => {
  const t = [temuan({ risiko: "Tinggi", status: "Diterima" }), temuan({ risiko: "Sedang", status: "Dinegosiasikan" }), temuan({ risiko: "Rendah", status: "Terbuka" })];
  const r = ringkasTemuan(t);
  assert.equal(r.total, 3);
  assert.equal(r.belumSelesai, 2);
  assert.deepEqual(r.perRisiko, { Rendah: 1, Sedang: 1, Tinggi: 1 });
  const k = risikoKeseluruhan(t);
  assert.equal(k.sisa, "Sedang");
  assert.equal(k.tertinggi, "Tinggi");
  assert.equal(risikoKeseluruhan([]).tertinggi, null);
  assert.equal(risikoKeseluruhan([]).sisa, "Rendah");
  assert.equal(risikoKeseluruhan([temuan({ risiko: "Tinggi", status: "Diterima" })]).sisa, "Rendah");
});

kasus("sarankanKesimpulan mengikuti aturan temuan, kepatuhan, syarat, dan kelengkapan", () => {
  const dasar = { temuan: [] as TemuanReview[], kepatuhan: [], syarat: [] };
  assert.equal(sarankanKesimpulan(dasar).kode, "layak");
  assert.equal(sarankanKesimpulan({ ...dasar, temuan: [temuan({ risiko: "Tinggi", status: "Ditolak" })] }).kode, "tidak");
  assert.equal(sarankanKesimpulan({ ...dasar, temuan: [temuan({ risiko: "Tinggi", status: "Terbuka" })] }).kode, "revisi");
  assert.equal(sarankanKesimpulan({ ...dasar, temuan: [temuan({ risiko: "Sedang", status: "Dinegosiasikan" })] }).kode, "revisi");
  assert.equal(sarankanKesimpulan({ ...dasar, temuan: [temuan({ risiko: "Sedang", status: "Ditolak" })] }).kode, "layak-catatan");
  assert.equal(sarankanKesimpulan({ ...dasar, temuan: [temuan({ risiko: "Sedang", status: "Diterima" })] }).kode, "layak-catatan");
  assert.equal(sarankanKesimpulan({ ...dasar, temuan: [temuan({ risiko: "Rendah", status: "Terbuka" })] }).kode, "layak");
  assert.equal(sarankanKesimpulan({ ...dasar, temuan: [temuan({ risiko: "Tinggi", status: "Diterima" })] }).kode, "layak");
  assert.equal(sarankanKesimpulan({ ...dasar, syarat: [{ id: "1", teks: "x", selesai: false }] }).kode, "layak-catatan");
  assert.equal(sarankanKesimpulan({ ...dasar, syarat: [{ id: "1", teks: "x", selesai: true }] }).kode, "layak");
  assert.equal(sarankanKesimpulan({ ...dasar, dokumenLengkap: false }).kode, "layak-catatan");
  assert.equal(sarankanKesimpulan({ ...dasar, kepatuhan: [{ id: "a", label: "A", dasar: "d", hasil: "tidak-sesuai", catatan: "" }] }).kode, "revisi");
  assert.ok(sarankanKesimpulan({ ...dasar, temuan: [temuan({ risiko: "Tinggi", status: "Ditolak" })] }).alasan.length > 0);
});

console.log("lembarReview: temuan menjadi poin revisi");

kasus("poin revisi memakai usulan, lalu isu, dan tidak membocorkan risiko atau tanggapan internal", () => {
  const t = [
    temuan({ pasal: "Pasal 5 (Denda)", usulan: "Batasi denda maksimum 5% dari nilai kontrak.", isu: "isu internal rahasia", tanggapan: "mitra ngotot", risiko: "Tinggi" }),
    temuan({ pasal: "", usulan: "", isu: "Alamat mitra tidak sesuai akta", risiko: "Rendah" }),
    temuan({ pasal: "Pasal 9", usulan: "diterima", status: "Diterima" }),
    temuan({ pasal: "Pasal 11", usulan: "tidak ditandai", revisi: false }),
  ];
  const poin = poinRevisiDariTemuan(t);
  assert.deepEqual(poin, ["Pasal 5 (Denda): Batasi denda maksimum 5% dari nilai kontrak.", "Alamat mitra tidak sesuai akta"]);
  const teks = teksRevisiDariTemuan(t);
  assert.match(teks, /^Mohon perbaiki hal berikut ya:\n1\. Pasal 5/);
  assert.ok(!/Tinggi|Rendah|rahasia|ngotot/.test(teks));
  assert.equal(teksRevisiDariTemuan([]), "");
});

console.log("lembarReview: finalisasi");

function putaranLengkap(s: Partial<PutaranReview> = {}): PutaranReview {
  const p = putaranBaru(kontrak(), null, pengulas, SEKARANG, HARI);
  return { ...p, temuan: [temuan({ status: "Diterima" })], kesimpulan: "layak", ...s };
}
const DATA = susunDataOtomatis({ kontrak: kontrak(), dokumen: [dok("Draft v1.docx", "Draft Kontrak"), dok("Penawaran.pdf", "Penawaran")], aktivitas: [], sekarang: SEKARANG });

kasus("cekFinalisasi: kesimpulan, tanggal, dan isu wajib", () => {
  const p = putaranLengkap({ kesimpulan: "", tanggalReview: "", temuan: [temuan({ isu: "", pasal: "Pasal 3" })] });
  const h = cekFinalisasi(p, DATA);
  assert.equal(h.galat.length, 3);
  assert.ok(h.galat.some((g) => /kesimpulan/i.test(g)));
  assert.ok(h.galat.some((g) => /Pasal 3/.test(g)));
});

kasus("cekFinalisasi: peringatan bila kesimpulan lebih longgar dari saran, dan bila catatan penting kosong", () => {
  const longgar = cekFinalisasi(putaranLengkap({ kesimpulan: "layak", temuan: [temuan({ risiko: "Tinggi", status: "Terbuka" })] }), DATA);
  assert.equal(longgar.galat.length, 0);
  assert.ok(longgar.peringatan.some((x) => /Perlu revisi/.test(x)));
  const tanpaCatatan = cekFinalisasi(putaranLengkap({ kesimpulan: "revisi", temuan: [temuan({ revisi: false, status: "Terbuka" })], catatanPengaju: "" }), DATA);
  assert.ok(tanpaCatatan.peringatan.some((x) => /pengaju/.test(x)));
  const catatan = cekFinalisasi(putaranLengkap({ kesimpulan: "layak-catatan", temuan: [], syarat: [], catatanPenandatangan: "" }), DATA);
  assert.ok(catatan.peringatan.some((x) => /penandatangan/.test(x)));
  const aman = cekFinalisasi(putaranLengkap({ kesimpulan: "layak", temuan: [temuan({ risiko: "Rendah", status: "Diterima" })], pokok: { lingkup: "a" }, kepatuhan: [{ id: "a", label: "A", dasar: "d", hasil: "sesuai", catatan: "" }] }), { ...DATA, kelengkapan: { ...DATA.kelengkapan, lengkap: true, kurang: [] }, checklist: { selesai: 1, total: 1, belum: [], catatan: [] } });
  assert.deepEqual(aman.peringatan, []);
});

kasus("cekFinalisasi menyebut dokumen wajib yang kurang dan checklist yang belum lengkap", () => {
  const h = cekFinalisasi(putaranLengkap(), DATA);
  assert.ok(h.peringatan.some((x) => /Dokumen wajib belum lengkap/.test(x)));
  assert.ok(h.peringatan.some((x) => /Checklist/.test(x)));
});

kasus("finalkanPutaran membekukan data otomatis; bukaKembali melepas finalisasi dan persetujuan", () => {
  const p = putaranLengkap({ catatanPengaju: "  Silakan lanjut.  " });
  const f = finalkanPutaran(p, DATA, "Rina Legal", SEKARANG);
  assert.equal(f.status, "final");
  assert.equal(f.final?.data.identitas.nomorPengajuan, "KTR-2026-0007");
  assert.equal(f.catatanPengaju, "Silakan lanjut.");
  const setuju = catatPersetujuanLembar(f, { nama: " Pak Kepala ", jabatan: "Kepala Legal", tanggal: HARI, keputusan: "Disetujui", catatan: "" }, "Rina Legal", SEKARANG);
  assert.equal(setuju.persetujuan?.nama, "Pak Kepala");
  const buka = bukaKembaliPutaran(setuju, "2026-10-06T01:00:00Z");
  assert.equal(buka.status, "draf");
  assert.equal(buka.final, undefined);
  assert.equal(buka.persetujuan, undefined);
  assert.ok(buka.rev > setuju.rev);
});

kasus("salinan usang bila lembar diubah sesudah disimpan", () => {
  const p = putaranLengkap({ rev: 3, salinan: { nama: "x.docx", waktu: "2026-10-05T04:30:00Z", oleh: "Rina", rev: 3 } });
  assert.equal(salinanUsang(p), false);
  assert.equal(salinanUsang({ ...p, rev: 4 }), true);
  const lama = uraiLembar({ putaran: [{ nomor: 1, rev: 2, salinan: { nama: "x.docx", waktu: "2026-10-05T04:30:00Z" } }] });
  assert.equal(salinanUsang(lama!.putaran[0]!), true, "salinan tanpa rev dianggap usang");
  assert.equal(salinanUsang(putaranLengkap()), false);
});

console.log("lembarReview: pemangkasan");

kasus("pangkasLembar memadatkan putaran final tertua dulu dan tidak menyentuh putaran terakhir", () => {
  const besar = (n: number, jumlah: number): PutaranReview => {
    const p = putaranBaru(kontrak(), null, pengulas, SEKARANG, HARI);
    return { ...p, id: `p${n}`, nomor: n, temuan: Array.from({ length: jumlah }, () => temuan({ isu: "x".repeat(900), usulan: "y".repeat(900) })), kesimpulan: "layak" };
  };
  let l: LembarReview = { versi: 1, putaran: [] };
  for (const n of [1, 2, 3]) l = { ...l, putaran: [...l.putaran, finalkanPutaran(besar(n, 25), DATA, "Rina", SEKARANG)] };
  l = { ...l, putaran: [...l.putaran, besar(4, 10)] };
  assert.ok(JSON.stringify(l).length > BATAS_JSON_LEMBAR);
  const h = pangkasLembar(l);
  assert.equal(h.muat, true);
  assert.ok(h.dipadatkan.length >= 1);
  assert.equal(h.dipadatkan[0], 1, "yang tertua lebih dulu");
  assert.ok(h.lembar.putaran[0]!.dipangkas);
  assert.equal(h.lembar.putaran[3]!.dipangkas, undefined);
  assert.equal(h.lembar.putaran[0]!.temuan.length, 25, "temuan tetap tercatat walau dipadatkan");
  assert.ok(JSON.stringify(h.lembar).length <= BATAS_JSON_LEMBAR);
});

kasus("pangkasLembar: putaran terakhir yang terlalu besar tidak boleh disimpan", () => {
  const p = { ...putaranBaru(kontrak(), null, pengulas, SEKARANG, HARI), catatanPengaju: "z".repeat(70_000) };
  const h = pangkasLembar({ versi: 1, putaran: [p] });
  assert.equal(h.muat, false);
});

kasus("lembar kecil lolos tanpa pemangkasan", () => {
  const h = pangkasLembar(simpanPutaran(null, putaranLengkap(), SEKARANG));
  assert.equal(h.muat, true);
  assert.deepEqual(h.dipadatkan, []);
});

console.log("lembarReview: untuk pengaju");

kasus("ringkasan pengaju hanya ada untuk putaran final dan tidak memuat isi internal", () => {
  const draf = putaranLengkap();
  assert.equal(ringkasUntukPengaju(draf), null);
  const f = finalkanPutaran(
    putaranLengkap({ kesimpulan: "layak-catatan", catatanPengaju: "Mohon siapkan jaminan.", catatanPenandatangan: "RAHASIA-INTERNAL", temuan: [temuan({ isu: "ISU-INTERNAL", risiko: "Tinggi", status: "Ditolak" })] }),
    DATA,
    "Rina Legal",
    SEKARANG,
  );
  const r = ringkasUntukPengaju(f)!;
  assert.equal(r.kesimpulan, "layak-catatan");
  assert.equal(r.catatan, "Mohon siapkan jaminan.");
  assert.equal(r.putaran, 1);
  const json = bungkusHasilPengaju(r)!;
  assert.ok(!/RAHASIA-INTERNAL|ISU-INTERNAL|Tinggi|temuan/i.test(json));
  assert.deepEqual(uraiHasilPengaju(json), r);
  assert.equal(bungkusHasilPengaju(null), null);
});

kasus("uraiHasilPengaju tahan data rusak", () => {
  assert.equal(uraiHasilPengaju(null), null);
  assert.equal(uraiHasilPengaju("{x"), null);
  assert.equal(uraiHasilPengaju({ kesimpulan: "asal" }), null);
});

kasus("tampilkanHasilUntukPengaju: hasil lama disembunyikan saat Review Legal baru dimulai", () => {
  const h = uraiHasilPengaju({ kesimpulan: "revisi", putaran: 1, waktu: "2026-10-02T03:00:00Z", tanggal: "2026-10-02", oleh: "Rina", catatan: "Perbaiki" })!;
  assert.equal(tampilkanHasilUntukPengaju(null, { status: "Perlu Revisi", statusSejak: null }), false);
  assert.equal(tampilkanHasilUntukPengaju(h, { status: "Perlu Revisi", statusSejak: "2026-10-02T03:00:01Z" }), true);
  assert.equal(tampilkanHasilUntukPengaju(h, { status: "Review Legal", statusSejak: "2026-10-04T00:00:00Z" }), false, "sudah dikirim ulang");
  assert.equal(tampilkanHasilUntukPengaju(h, { status: "Review Legal", statusSejak: "2026-10-02T00:00:00Z" }), true);
  assert.equal(tampilkanHasilUntukPengaju(h, { status: "Diajukan", statusSejak: null }), false);
  assert.equal(tampilkanHasilUntukPengaju(h, { status: "Proses Tanda Tangan", statusSejak: null }), true);
  assert.equal(tampilkanHasilUntukPengaju(h, { status: "Aktif", statusSejak: null }), false);
  assert.equal(tampilkanHasilUntukPengaju(h, { status: "Ditolak", statusSejak: null }), false);
});

kasus("hak akses: lembar internal Legal, Pemantau hanya melihat, pengaju tidak pernah", () => {
  assert.equal(bolehLihatLembar(legal, "admin"), true);
  assert.equal(bolehLihatLembar(pemantau, "admin"), true);
  assert.equal(bolehLihatLembar(pengaju, "admin"), false);
  assert.equal(bolehLihatLembar(legal, "pengguna"), false, "Legal di Ruang Pengguna tidak melihat lembar");
  assert.equal(bolehUbahLembar({ status: "Review Legal" }, legal), true);
  assert.equal(bolehUbahLembar({ status: "Review Legal" }, pemantau), false);
  assert.equal(bolehUbahLembar({ status: "Proses Tanda Tangan" }, legal), false);
  assert.equal(bolehCatatPersetujuanLembar({ status: "Proses Tanda Tangan" }, legal), true);
  assert.equal(bolehCatatPersetujuanLembar({ status: "Aktif" }, legal), false);
  assert.equal(bolehCatatPersetujuanLembar({ status: "Review Legal" }, pemantau), false);
  assert.equal(tampilkanPanelLembar({ status: "Diajukan" }, null), false);
  assert.equal(tampilkanPanelLembar({ status: "Review Legal" }, null), true);
  assert.equal(tampilkanPanelLembar({ status: "Aktif" }, null), false, "kontrak lama tanpa lembar tidak dibebani panel kosong");
  assert.equal(tampilkanPanelLembar({ status: "Perlu Revisi" }, null), false);
  assert.equal(tampilkanPanelLembar({ status: "Ditolak" }, simpanPutaran(null, putaranLengkap(), SEKARANG)), true);
});

kasus("berkas salinan lembar dikenali lewat jenis atau nama, dan nama berkas aman", () => {
  assert.equal(adalahBerkasLembar({ jenis: JENIS_LEMBAR, nama: "apa saja.docx" }), true);
  assert.equal(adalahBerkasLembar({ jenis: "", nama: "Lembar Review Legal P1 KTR-2026-0007.docx" }), true);
  assert.equal(adalahBerkasLembar({ jenis: "Draft Kontrak", nama: "Draft v1.docx" }), false);
  const nama = namaBerkasLembar({ nomorPengajuan: "KTR-2026-0007", judul: 'Besi "Beton": Tol/3?' }, 2);
  assert.equal(nama, "Lembar Review Legal P2 KTR-2026-0007 - Besi Beton Tol 3.docx");
  assert.ok(!/["*:<>?/\\|#%]/.test(nama));
  assert.equal(adalahBerkasLembar({ jenis: "", nama }), true);
});

console.log("lembarReview: sambungan ke alur");

kasus("peringatan Lanjut ke Tanda Tangan bersifat lunak untuk semua keadaan", () => {
  assert.equal(peringatanLembarSebelumTtd(null)?.nada, "peringatan");
  assert.match(peringatanLembarSebelumTtd(null)!.teks, /Belum ada Lembar/);

  const draf = simpanPutaran(null, putaranLengkap(), SEKARANG);
  assert.match(peringatanLembarSebelumTtd(draf)!.teks, /draf/);

  const revisi = { versi: 1, putaran: [finalkanPutaran(putaranLengkap({ kesimpulan: "revisi" }), DATA, "Rina", SEKARANG)] };
  const pRevisi = peringatanLembarSebelumTtd(revisi)!;
  assert.equal(pRevisi.nada, "peringatan");
  assert.match(pRevisi.teks, /Perlu revisi/);
  assert.match(pRevisi.teks, /tetap bisa lanjut/);

  const tidak = { versi: 1, putaran: [finalkanPutaran(putaranLengkap({ kesimpulan: "tidak" }), DATA, "Rina", SEKARANG)] };
  assert.equal(peringatanLembarSebelumTtd(tidak)!.nada, "peringatan");

  const layak = { versi: 1, putaran: [finalkanPutaran(putaranLengkap({ kesimpulan: "layak" }), DATA, "Rina", SEKARANG)] };
  assert.equal(peringatanLembarSebelumTtd(layak)!.nada, "sukses");

  const bersyarat = { versi: 1, putaran: [finalkanPutaran(putaranLengkap({ kesimpulan: "layak-catatan", syarat: [{ id: "a", teks: "Terima jaminan", selesai: false }] }), DATA, "Rina", SEKARANG)] };
  const pb = peringatanLembarSebelumTtd(bersyarat)!;
  assert.equal(pb.nada, "info");
  assert.ok(pb.rinci.some((r) => /Terima jaminan/.test(r)));

  // Putaran baru berupa draf setelah putaran final: yang dibaca tetap putaran final, dengan catatan.
  const campur = { versi: 1, putaran: [...layak.putaran, { ...putaranLengkap(), id: "p2", nomor: 2 }] };
  assert.ok(peringatanLembarSebelumTtd(campur)!.rinci.some((r) => /masih draf/.test(r)));
});

kasus("ringkasLembarUntukCatatan satu kalimat", () => {
  assert.match(ringkasLembarUntukCatatan(null), /belum difinalkan/);
  const l = { versi: 1, putaran: [finalkanPutaran(putaranLengkap({ kesimpulan: "layak-catatan", syarat: [{ id: "a", teks: "x", selesai: false }], temuan: [temuan({ status: "Terbuka" })] }), DATA, "Rina", SEKARANG)] };
  const t = ringkasLembarUntukCatatan(l);
  assert.match(t, /putaran 1: Layak dengan catatan/);
  assert.match(t, /1 temuan, 1 belum diterima/);
  assert.match(t, /1 syarat belum selesai/);
  assert.ok(!t.includes("\n"));
  assert.equal(putaranFinalTerakhir(l)?.nomor, 1);
  assert.equal(putaranTerakhir(l)?.nomor, 1);
});

console.log("lembarReview: data otomatis");

kasus("susunDataOtomatis mengambil identitas, pihak, dokumen, kelengkapan, checklist, dan revisi", () => {
  const k = kontrak({ checklistReview: { versi: 1, items: [{ id: "para-pihak", label: "Para pihak dan kewenangan", selesai: true }] } });
  const aktivitas = [
    akt({ jenis: "Status", statusDari: "Review Legal", statusKe: "Perlu Revisi", pesan: "Mohon lengkapi:\n1. Akta\n2. NPWP", olehNama: "Rina Legal", waktu: "2026-10-02T03:00:00Z" }),
    akt({ jenis: "Status", statusDari: "Perlu Revisi", statusKe: "Review Legal", waktu: "2026-10-03T02:00:00Z" }),
  ];
  const dokumen = [dok("Penawaran.pdf", "Penawaran"), dok("Draft v2.docx", "Draft Kontrak", "2026-10-04T03:00:00Z"), dok("Draft v1.docx", "Draft Kontrak", "2026-10-02T03:00:00Z")];
  const d = susunDataOtomatis({ kontrak: k, dokumen, aktivitas, versi: { "Draft v2.docx": "v3" }, induk: { judul: "Induk", nomorKontrak: "K-1", nomorPengajuan: "KTR-1" }, sekarang: SEKARANG });
  assert.equal(d.identitas.nomorPengajuan, "KTR-2026-0007");
  assert.equal(d.identitas.pengaju, "Budi SCM");
  assert.equal(d.identitas.induk, "K-1 - Induk");
  assert.equal(d.pihak.mitra, "PT Baja Nusantara");
  assert.deepEqual(d.pihak.lain, [{ nama: "Bank Mandiri", peran: "Penjamin" }]);
  assert.equal(d.dokumen[0]!.nama, "Draft v2.docx", "draft terbaru lebih dulu");
  assert.equal(d.dokumen[0]!.versi, "v3");
  assert.equal(d.dokumen[1]!.nama, "Draft v1.docx");
  assert.equal(d.kelengkapan.lengkap, false);
  const kurang = kekuranganDokumen("Pengadaan Barang", dokumen.map((x) => x.jenis)).kurang;
  assert.deepEqual(d.kelengkapan.kurang, kurang.map(String));
  assert.equal(d.checklist.selesai, 1);
  assert.ok(d.checklist.total > 1);
  assert.ok(d.checklist.belum.length === d.checklist.total - 1);
  assert.equal(d.revisi?.oleh, "Rina Legal");
  assert.deepEqual(d.revisi?.poin, ["Akta", "NPWP"]);
  assert.equal(d.revisi?.kirimUlang, "2026-10-03T02:00:00Z");
  assert.equal(d.pindai, null);
});

kasus("susunDataOtomatis tidak mengubah masukan dan tahan data minim", () => {
  const dokumen: Dokumen[] = [];
  const k = kontrak({ pihakLain: [], mitra: "" });
  const salinan = JSON.stringify([k, dokumen]);
  const d = susunDataOtomatis({ kontrak: k, dokumen, aktivitas: [], sekarang: SEKARANG });
  assert.equal(JSON.stringify([k, dokumen]), salinan);
  assert.equal(d.revisi, null);
  assert.deepEqual(d.dokumen, []);
});

kasus("ringkasHasilPindai hanya memuat klausul relevan dan selisih yang beda", () => {
  const r = ringkasHasilPindai(
    {
      klausul: [
        { id: "a", nama: "Denda", ada: false, kutipan: "", relevan: true, keyakinan: "sedang", bantuan: "" },
        { id: "b", nama: "Jaminan", ada: true, kutipan: "", relevan: false, keyakinan: "sedang", bantuan: "" },
        { id: "c", nama: "Hukum", ada: true, kutipan: "", relevan: true, keyakinan: "tinggi", bantuan: "" },
      ],
      selisih: [
        { bidang: "nilai", label: "Nilai", tingkat: "beda", di_dokumen: "Rp 1", di_pengajuan: "Rp 2" },
        { bidang: "mitra", label: "Mitra", tingkat: "cocok", di_dokumen: "A", di_pengajuan: "A" },
      ],
      saranIsian: {},
      rincianSaran: {},
      keterbacaan: { tingkat: "baik", pesan: "", skor: 1 },
      penandaKosong: [{ jenis: "titik", teks: "....", cuplikan: "", posisi: 1 }],
      catatan: [],
      penafian: "p",
    } as never,
    "Draft v2.docx",
    SEKARANG,
  );
  assert.deepEqual(r.klausul, [
    { nama: "Denda", ada: false },
    { nama: "Hukum", ada: true },
  ]);
  assert.equal(r.penanda, 1);
  assert.deepEqual(r.selisih, ["Nilai: dokumen Rp 1, pengajuan Rp 2"]);
  assert.equal(r.terbaca, true);
});

console.log("lembarDokumen");

const putaranFinal = (): PutaranReview => {
  const p = putaranLengkap({
    kesimpulan: "layak-catatan",
    pokok: { lingkup: "Besi beton", nilai: "Rp 1,25 miliar" },
    temuan: [temuan({ pasal: "Pasal 5 (Denda)", isu: "Denda tanpa batas", usulan: "Batasi 5%", risiko: "Tinggi", status: "Dinegosiasikan", tanggapan: "Mitra setuju 7%" }), temuan({ pasal: "Pasal 9", isu: "Redaksi", risiko: "Rendah", status: "Diterima" })],
    syarat: [
      { id: "s1", teks: "Jaminan pelaksanaan diterima", selesai: false },
      { id: "s2", teks: "Meterai", selesai: true },
    ],
    catatanPenandatangan: "Denda 7% diterima sadar.",
    catatanPengaju: "Mohon siapkan jaminan.",
  });
  return finalkanPutaran(p, DATA, "Rina Legal", SEKARANG);
};

kasus("susunDokumenLembar memuat semua bagian A sampai I dan isi utamanya", () => {
  const p = putaranFinal();
  const teks = teksBlokLembar(susunDokumenLembar(p, p.final!.data, { dicetak: SEKARANG }));
  for (const h of ["A. Identitas kontrak", "B. Para pihak", "C. Dokumen yang direview", "D. Pokok-pokok kontrak", "E. Hasil pemeriksaan otomatis", "F. Temuan per pasal", "G. Kepatuhan regulasi", "H. Kesimpulan dan rekomendasi", "I. Pengesahan"]) {
    assert.ok(teks.includes(h), h);
  }
  assert.match(teks, /LEMBAR HASIL REVIEW LEGAL/);
  assert.match(teks, /PT Baja Nusantara/);
  assert.match(teks, /Draft v1\.docx/);
  assert.match(teks, /Pasal 5 \(Denda\)/);
  assert.match(teks, /Tanggapan: Mitra setuju 7%/);
  assert.match(teks, /LAYAK DENGAN CATATAN/);
  assert.match(teks, /\[  \] Jaminan pelaksanaan diterima/);
  assert.match(teks, /\[x\] Meterai/);
  assert.match(teks, /Disusun/);
  assert.match(teks, /Diperiksa/);
  assert.match(teks, /Disetujui/);
  assert.match(teks, /standar awal/i);
  assert.ok(!/undefined|NaN|\[object/.test(teks));
  assert.ok(!/DRAF, belum difinalkan/.test(teks));
});

kasus("lembar draf bertanda DRAF dan lembar kosong tetap rapi", () => {
  const p = putaranBaru(kontrak(), null, pengulas, SEKARANG, HARI);
  const teks = teksBlokLembar(susunDokumenLembar(p, DATA, { dicetak: SEKARANG }));
  assert.match(teks, /DRAF, belum difinalkan/);
  assert.match(teks, /Tidak ada temuan dicatat/);
  assert.match(teks, /Belum ditetapkan/);
  assert.match(teks, /Tidak ada syarat tambahan/);
  assert.match(teks, /Belum diperiksa/);
  assert.ok(!/undefined|NaN|\[object/.test(teks));
});

kasus("persetujuan kepala Legal tampil di kolom Disetujui", () => {
  const p = catatPersetujuanLembar(putaranFinal(), { nama: "Pak Hendra", jabatan: "Kepala Divisi Legal", tanggal: "2026-10-06", keputusan: "Disetujui", catatan: "Setuju dengan catatan" }, "Rina", SEKARANG);
  const teks = teksBlokLembar(susunDokumenLembar(p, p.final!.data, { dicetak: SEKARANG }));
  assert.match(teks, /Pak Hendra/);
  assert.match(teks, /Kepala Divisi Legal/);
  assert.match(teks, /6 Oktober 2026/);
  assert.match(teks, /Setuju dengan catatan/);
});

await kasus("buatLembarDocx menghasilkan berkas .docx yang valid dan memuat isi lembar", async () => {
  const p = putaranFinal();
  const blok = susunDokumenLembar(p, p.final!.data, { dicetak: SEKARANG });
  const blob = await buatLembarDocx(blok, "Lembar Review Legal P1");
  assert.ok(blob.size > 2000);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(bytes[0]!, bytes[1]!), "PK", "docx adalah zip");
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")!.async("string");
  assert.ok(xml.includes("LEMBAR HASIL REVIEW LEGAL"));
  assert.ok(xml.includes("Pasal 5 (Denda)"));
  assert.ok(xml.includes("PT Baja Nusantara"));
  assert.ok(xml.includes("Jaminan pelaksanaan diterima"));
});

await kasus("buatLembarDocx tahan lembar draf yang kosong", async () => {
  const p = putaranBaru(kontrak({ jenis: "Kerahasiaan (NDA)", nilai: null }), null, pengulas, SEKARANG, HARI);
  const blob = await buatLembarDocx(susunDokumenLembar(p, DATA, { dicetak: SEKARANG }), "Lembar");
  assert.ok(blob.size > 2000);
});

console.log(`\nSemua ${nomor} uji lulus.`);
