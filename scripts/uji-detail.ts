// Uji halaman Detail kontrak, aksi status, dan jejak audit:
//   lib/alur.ts (U04 Aktifkan Kembali, U38 pesanKonflik), lib/kasus.ts (K02 tahap 2), lib/jejakAudit.ts (U31),
//   lib/masa.ts (U24 BerakhirEfektif), lib/penomoran.ts dan lib/pengaturan.ts (U20 format dari Pengaturan),
//   lib/ttd.ts (U21 cara tanda tangan dan sidik draft final), lib/syarat.ts (U13), serta layanan dengan Graph
//   tiruan: services/kontrak.ts (jalankanAksi, sinkronkanBerakhirEfektif, rekonsiliasi), services/kasus.ts,
//   services/jejakAudit.ts, dan services/dokumen.ts (penjaga redline).
// Jalankan: npx --yes tsx scripts/uji-detail.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { AksiStatus } from "../src/lib/alur";
import type { Kontrak, Sesi } from "../src/lib/types";

// src/config.ts membaca import.meta.env milik Vite (diganti objek kosong), dan src/lib/graph.ts diganti tiruan
// yang meneruskan panggilan ke globalThis.__graf, supaya layanan bisa diuji tanpa jaringan dan MSAL.
const tiruanGraph = `
export class GraphError extends Error {
  constructor(message, status, kode) { super(message); this.status = status; this.kode = kode; }
  get perluLogin() { return this.kode === "perlu_login"; }
  get jaringan() { return this.kode === "jaringan"; }
}
export function pasangMsal() {}
export function msalTerpasang() { return null; }
export function pesanError(err) { return err instanceof Error ? err.message : String(err); }
export function graph(path, opsi) { return globalThis.__graf.graph(path, opsi); }
export function graphSemua(path, opsi) { return globalThis.__graf.graphSemua(path, opsi); }
export function graphBlob(path, opsi) { return globalThis.__graf.graph(path, opsi); }
`;
const kait = `export async function load(url, ctx, next) {
  if (url.includes("/src/lib/graph.ts")) return { format: "module", shortCircuit: true, source: ${JSON.stringify(tiruanGraph)} };
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

interface OpsiGraf {
  method?: string;
  json?: unknown;
}
interface Graf {
  graph: (path: string, opsi?: OpsiGraf) => Promise<unknown>;
  graphSemua: (path: string, opsi?: unknown) => Promise<unknown[]>;
}
const g = globalThis as unknown as { __graf: Graf };
g.__graf = {
  graph: async () => {
    throw new Error("graph belum disiapkan");
  },
  graphSemua: async () => {
    throw new Error("graphSemua belum disiapkan");
  },
};

const Alur = await import("../src/lib/alur");
const Kas = await import("../src/lib/kasus");
const J = await import("../src/lib/jejakAudit");
const M = await import("../src/lib/masa");
const No = await import("../src/lib/penomoran");
const Pg = await import("../src/lib/pengaturan");
const T = await import("../src/lib/ttd");
const Sy = await import("../src/lib/syarat");
const F = await import("../src/lib/format");
const G = await import("../src/lib/graph");
const { LIST_ID } = await import("../src/config");

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
    tanggalDiakhiri: null,
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

const rina: Sesi = { email: "rina@waskitainfrastruktur.co.id", nama: "Rina", peran: "Legal", divisi: "Legal", penggunaId: 1 };
const admin: Sesi = { email: "adi@waskitainfrastruktur.co.id", nama: "Adi", peran: "Admin", divisi: "Legal", penggunaId: 2 };
const pantau: Sesi = { email: "pantau@waskitainfrastruktur.co.id", nama: "Pantau", peran: "Pemantau", divisi: null, penggunaId: 3 };
const budi: Sesi = { email: "a@waskitainfrastruktur.co.id", nama: "A", peran: "Pengaju", divisi: "SCM", penggunaId: 4 };

// --- lib/alur ----------------------------------------------------------------------------------------

console.log("lib/alur");

await kasus("Aktifkan Kembali: hanya Admin, hanya dari status akhir, tujuan dari riwayat bila masuk akal", () => {
  assert.equal(Alur.tujuanPemulihan("Berakhir"), "Aktif");
  assert.equal(Alur.tujuanPemulihan("Ditolak"), "Review Legal");
  assert.equal(Alur.tujuanPemulihan("Ditolak", "Diajukan"), "Diajukan");
  assert.equal(Alur.tujuanPemulihan("Dibatalkan"), "Diajukan");
  assert.equal(Alur.tujuanPemulihan("Dibatalkan", "Perlu Revisi"), "Perlu Revisi");
  // Status sebelum yang tidak masuk akal (mis. Ditolak dari Aktif) jatuh ke bawaan.
  assert.equal(Alur.tujuanPemulihan("Ditolak", "Aktif"), "Review Legal");
  assert.equal(Alur.tujuanPemulihan("Aktif"), null);

  const ditolak = kontrak({ status: "Ditolak" });
  assert.deepEqual(Alur.aksiPemulihan(ditolak, rina), [], "Legal tidak bisa");
  assert.deepEqual(Alur.aksiPemulihan(ditolak, pantau), []);
  const [a] = Alur.aksiPemulihan(ditolak, admin);
  assert.ok(a);
  assert.equal(a.id, "aktifkan-kembali");
  assert.equal(a.ke, "Review Legal");
  assert.equal(a.wajibCatatan, true);
  assert.equal(a.hanyaAdmin, true);
  assert.deepEqual(Alur.aksiPemulihan(kontrak({ status: "Aktif" }), admin), []);
  // Aksi balik tidak masuk ALUR, jadi glosarium dan aksiTersedia tetap menganggap status akhir sebagai akhir.
  assert.deepEqual(Alur.aksiTersedia(kontrak({ status: "Berakhir" }), admin), []);
});

await kasus("Tandai Berakhir meminta mode dan tanggal efektif (butuhPenutupan)", () => {
  const aktif = kontrak({ status: "Aktif" });
  const akhiri = Alur.aksiTersedia(aktif, rina).find((x) => x.id === "akhiri");
  assert.ok(akhiri?.butuhPenutupan);
});

await kasus("pesanKonflik: status berubah selalu konflik; PIC hanya untuk aksi Legal", () => {
  const dilihat = kontrak({ status: "Review Legal", picLegalEmail: "rina@waskitainfrastruktur.co.id", picLegalNama: "Rina" });
  assert.equal(Alur.pesanKonflik(dilihat, { ...dilihat }), null);
  assert.match(Alur.pesanKonflik(dilihat, { ...dilihat, status: "Perlu Revisi" }) ?? "", /baru saja berubah menjadi Perlu Revisi/);
  const piclain = { ...dilihat, picLegalEmail: "dina@waskitainfrastruktur.co.id", picLegalNama: "Dina" };
  assert.equal(Alur.pesanKonflik(dilihat, piclain), null, "aksi pengaju tidak peduli PIC");
  assert.match(Alur.pesanKonflik(dilihat, piclain, { cekPic: true }) ?? "", /PIC .+ menjadi Dina/);
  assert.match(Alur.pesanKonflik(dilihat, { ...dilihat, picLegalEmail: "", picLegalNama: "" }, { cekPic: true }) ?? "", /dilepas/);
  // Beda huruf besar-kecil atau spasi bukan perubahan.
  assert.equal(Alur.pesanKonflik(dilihat, { ...dilihat, picLegalEmail: " RINA@waskitainfrastruktur.co.id" }, { cekPic: true }), null);
});

await kasus("akun tanpa divisi hanya pengaju kontrak buatannya sendiri", () => {
  const tanpaDivisi: Sesi = { ...budi, email: "baru@waskitainfrastruktur.co.id", divisi: null, terdaftar: false };
  const milikLain = kontrak({ divisi: "SCM" });
  assert.equal(Alur.bisaLihat(milikLain, tanpaDivisi), false);
  assert.equal(Alur.bisaLihat(kontrak({ pengajuEmail: "baru@waskitainfrastruktur.co.id" }), tanpaDivisi), true);
  assert.equal(Alur.bisaLihat(milikLain, budi), true, "Pengaju terdaftar SCM melihat divisinya");
});

// --- lib/kasus --------------------------------------------------------------------------------------

console.log("lib/kasus");

await kasus("validasiKasus dan rapikanKasus", () => {
  const dasar = Kas.kasusKosong("2026-10-03");
  assert.match(Kas.validasiKasus(dasar) ?? "", /Judul kasus wajib/);
  const isi = { ...dasar, judul: "  SP1 keterlambatan  ", jenis: "Peringatan" as const };
  assert.equal(Kas.validasiKasus(isi), null);
  assert.match(Kas.validasiKasus({ ...isi, batasTindakLanjut: "2026-10-01" }) ?? "", /Batas tindak lanjut/);
  assert.match(Kas.validasiKasus({ ...isi, tanggal: null }) ?? "", /Tanggal kejadian/);
  assert.match(Kas.validasiKasus({ ...isi, jenis: "Gugatan" as never }) ?? "", /Pilih jenis/);
  const r = Kas.rapikanKasus({ ...isi, uraian: " a ", tanggalSelesai: "2026-10-02" }, "2026-10-03");
  assert.equal(r.judul, "SP1 keterlambatan");
  assert.equal(r.uraian, "a");
  assert.equal(r.tanggalSelesai, null, "tanggal selesai hanya untuk kasus Selesai");
  assert.equal(Kas.rapikanKasus({ ...isi, status: "Selesai" }, "2026-10-03").tanggalSelesai, "2026-10-03");
});

await kasus("flag sengketa, lewat batas, urutan, dan ringkasan", () => {
  const daftar = [
    { id: 1, jenis: "Peringatan" as const, status: "Terbuka" as const, tanggal: "2026-09-01", batasTindakLanjut: "2026-09-20" },
    { id: 2, jenis: "Sengketa" as const, status: "Selesai" as const, tanggal: "2026-08-01", batasTindakLanjut: null },
    { id: 3, jenis: "Somasi" as const, status: "Terbuka" as const, tanggal: "2026-09-10", batasTindakLanjut: "2026-10-10" },
  ];
  assert.equal(Kas.adaSengketaTerbuka(daftar), false, "Sengketa yang selesai tidak memicu lencana");
  assert.equal(Kas.adaSengketaTerbuka([...daftar, { id: 4, jenis: "Sengketa", status: "Terbuka", tanggal: null, batasTindakLanjut: null }]), true);
  assert.equal(Kas.adaSengketaTerbuka(daftar, ["Somasi"]), true, "pemicu bisa diatur");
  assert.equal(Kas.lewatBatas(daftar[0]!, "2026-10-03"), true);
  assert.equal(Kas.lewatBatas(daftar[2]!, "2026-10-03"), false);
  assert.deepEqual(
    Kas.urutkanKasus(daftar).map((x) => x.id),
    [1, 3, 2],
  );
  assert.deepEqual(Kas.ringkasKasus(daftar, "2026-10-03"), { total: 3, terbuka: 2, lewat: 1 });
});

// --- lib/jejakAudit ---------------------------------------------------------------------------------

console.log("lib/jejakAudit");

await kasus("Detail: bentuk lama (larik) dan berversi {v, ubah} sama-sama terbaca; rusak = kosong", () => {
  const ubah = [{ kolom: "nilai", dari: "Rp 1", ke: "Rp 2" }];
  assert.deepEqual(J.uraiDetail(JSON.stringify(ubah)), ubah);
  assert.deepEqual(J.uraiDetail(J.bungkusDetail(ubah)), ubah);
  assert.deepEqual(JSON.parse(J.bungkusDetail(ubah)), { v: J.VERSI_DETAIL, ubah });
  assert.deepEqual(J.uraiDetail("{rusak"), []);
  assert.deepEqual(J.uraiDetail(""), []);
  assert.deepEqual(J.uraiDetail(null), []);
  assert.deepEqual(J.uraiDetail([{ kolom: "", dari: "a", ke: "b" }, { kolom: "x", dari: 1, ke: true }]), [{ kolom: "x", dari: "1", ke: "Ya" }]);
});

await kasus("DetailLog Log Admin: {v,ubah}, {dari,ke} atas nama sasaran, dan teks bebas", () => {
  assert.deepEqual(J.uraiDetailLog(JSON.stringify({ v: 1, diperiksa: 4, ubah: [{ kolom: "peran", dari: "Pengaju", ke: "Legal" }] }), "x"), [{ kolom: "peran", dari: "Pengaju", ke: "Legal" }]);
  assert.deepEqual(J.uraiDetailLog(JSON.stringify({ dari: [90, 30], ke: [60] }), "hariPeringatan"), [{ kolom: "hariPeringatan", dari: "90, 30", ke: "60" }]);
  assert.deepEqual(J.uraiDetailLog("catatan manual", "x"), [{ kolom: "catatan", dari: "", ke: "catatan manual" }]);
  assert.deepEqual(J.uraiDetailLog("  ", "x"), []);
});

await kasus("dariAktivitas: hanya status dan baris ber-Detail; pelaku dari createdBy", () => {
  const dasar = {
    id: 9,
    kontrakId: 5,
    jenis: "Komentar",
    pesan: "halo",
    statusDari: "",
    statusKe: "",
    olehNama: "Nama Tulisan",
    olehEmail: "tulis@x.id",
    dibuatOleh: "",
    dibuatOlehEmail: "",
    waktu: "2026-10-01T03:00:00Z",
    detail: "",
  };
  assert.equal(J.dariAktivitas(dasar), null, "komentar tanpa rincian bukan bahan audit");
  const status = J.dariAktivitas({ ...dasar, jenis: "Status", statusDari: "Proses Tanda Tangan", statusKe: "Aktif", dibuatOleh: "Rina SP", dibuatOlehEmail: "Rina@x.id", detail: JSON.stringify([{ kolom: "nomor kontrak", dari: "-", ke: "PJ/2026/001" }]) }, { nomor: "KTR-2026-0005", judul: "Sewa alat", nomorKontrak: "PJ/2026/001" });
  assert.ok(status);
  assert.equal(status.pelaku, "Rina SP");
  assert.equal(status.pelakuEmail, "rina@x.id");
  assert.equal(status.sasaran, "KTR-2026-0005");
  assert.equal(status.nomorKontrak, "PJ/2026/001");
  assert.deepEqual(status.rincian[0], { kolom: "status", dari: "Proses Tanda Tangan", ke: "Aktif" });
  assert.equal(status.rincian.length, 2);
  // Tanpa createdBy (mis. data lama): jatuh ke nama yang ditulis aplikasi.
  assert.equal(J.dariAktivitas({ ...dasar, jenis: "Perubahan", detail: J.bungkusDetail([{ kolom: "judul", dari: "a", ke: "b" }]) })?.pelaku, "Nama Tulisan");
});

await kasus("dariLogAdmin: pelaku dari createdBy, cadangan dari teks 'Nama <email>'", () => {
  const l = { id: 3, aksi: "Ubah peran pengguna", sasaran: "budi@x.id", pelakuTeks: "Adi <adi@x.id>", dibuatOleh: "", dibuatOlehEmail: "", waktu: "2026-10-01T03:00:00Z", detail: JSON.stringify({ v: 1, ubah: [{ kolom: "peran", dari: "Pengaju", ke: "Legal" }] }) };
  const e = J.dariLogAdmin(l);
  assert.equal(e.id, "log-3");
  assert.equal(e.sumber, "Admin");
  assert.equal(e.pelaku, "Adi");
  assert.equal(e.pelakuEmail, "adi@x.id");
  assert.equal(J.dariLogAdmin({ ...l, dibuatOleh: "Adi Saputra", dibuatOlehEmail: "ADI@x.id" }).pelaku, "Adi Saputra");
});

await kasus("periode: rentang inklusif zona Jakarta dan batas UTC untuk filter Created", () => {
  assert.deepEqual(J.rentangPeriode("7", "2026-10-03"), { dari: "2026-09-27", sampai: "2026-10-03" });
  assert.deepEqual(J.rentangPeriode("tahun", "2026-10-03"), { dari: "2026-01-01", sampai: "2026-10-03" });
  assert.deepEqual(J.rentangPeriode("semua", "2026-10-03"), { dari: J.AWAL_RIWAYAT, sampai: "2026-10-03" });
  assert.deepEqual(J.rentangPeriode("kustom", "2026-10-03", { dari: "2026-10-05", sampai: "2026-10-01" }), { dari: "2026-10-01", sampai: "2026-10-05" }, "tertukar dibalik");
  assert.deepEqual(J.batasPeriodeUtc({ dari: "2026-10-01", sampai: "2026-10-03" }), { mulai: "2026-09-30T17:00:00.000Z", akhir: "2026-10-03T17:00:00.000Z" });
  // 23.30 WIB tanggal 3 masih tanggal 3 di Jakarta.
  assert.equal(J.ymdJakarta("2026-10-03T16:30:00Z"), "2026-10-03");
  assert.equal(J.ymdJakarta("2026-10-03T17:00:00Z"), "2026-10-04");
  assert.equal(J.waktuWib("2026-10-03T07:05:00Z"), "2026-10-03 14:05");
});

await kasus("saringJejak, daftarPelaku, dan CSV aman dari rumus", () => {
  const e = (id: string, waktu: string, sumber: "Kontrak" | "Admin", pelaku: string, sasaran: string, rincian = [{ kolom: "nilai", dari: "1", ke: "2" }]) => ({
    id,
    sumber,
    waktu,
    pelaku,
    pelakuEmail: `${pelaku.toLowerCase()}@x.id`,
    aksi: "Perubahan",
    sasaran,
    kontrakId: sumber === "Kontrak" ? 1 : null,
    judul: sumber === "Kontrak" ? "Sewa crane" : "",
    nomorKontrak: sumber === "Kontrak" ? "SW/2026/004" : "",
    pesan: "=HYPERLINK(\"x\")",
    rincian,
  });
  const semua = [
    e("akt-1", "2026-10-02T03:00:00Z", "Kontrak", "Rina", "KTR-2026-0001"),
    e("log-1", "2026-10-03T03:00:00Z", "Admin", "Adi", "hariPeringatan"),
    e("akt-2", "2026-09-01T03:00:00Z", "Kontrak", "Dina", "KTR-2026-0002"),
  ];
  const f = { dari: "2026-10-01", sampai: "2026-10-03", sumber: "semua" as const, kontrak: "", pelaku: "" };
  assert.deepEqual(J.saringJejak(semua, f).map((x) => x.id), ["log-1", "akt-1"], "di luar periode tersaring, terbaru dulu");
  assert.deepEqual(J.saringJejak(semua, { ...f, sumber: "Admin" }).map((x) => x.id), ["log-1"]);
  assert.deepEqual(J.saringJejak(semua, { ...f, kontrak: "sw/2026/004" }).map((x) => x.id), ["akt-1"], "cari nomor kontrak resmi");
  assert.deepEqual(J.saringJejak(semua, { ...f, kontrak: "crane" }).map((x) => x.id), ["akt-1"], "cari judul");
  assert.deepEqual(J.saringJejak(semua, { ...f, pelaku: "ADI@x.id" }).map((x) => x.id), ["log-1"]);
  assert.deepEqual(J.daftarPelaku(semua).map((p) => `${p.nama}:${p.jumlah}`), ["Adi:1", "Dina:1", "Rina:1"]);

  const csv = J.susunCsvJejak([{ ...semua[0]!, rincian: [{ kolom: "nilai", dari: "1", ke: "2" }, { kolom: "-judul", dari: "a", ke: "+b" }] }, { ...semua[1]!, rincian: [] }]);
  const baris = csv.split("\r\n");
  assert.equal(baris.length, 4, "kepala + 2 baris rincian + 1 baris tanpa rincian");
  assert.equal(baris[0], J.KOLOM_CSV_JEJAK.map((k) => `"${k}"`).join(";"));
  assert.ok(baris[1]!.includes(`"'=HYPERLINK(""x"")"`), "pesan berawalan = diloloskan");
  assert.ok(baris[2]!.includes(`"'-judul"`) && baris[2]!.includes(`"'+b"`));
  assert.ok(baris[2]!.endsWith(`;""`), "pesan hanya di baris rincian pertama");
});

await kasus("bedaPengguna untuk Log Admin dan akses halaman", () => {
  const lama = { nama: "Budi", email: "budi@x.id", divisi: "SCM" as const, peran: "Pengaju" as const, aktif: true };
  assert.deepEqual(J.bedaPengguna(lama, { ...lama, peran: "Legal", aktif: false }), [
    { kolom: "peran", dari: "Pengaju", ke: "Legal" },
    { kolom: "aktif", dari: "Ya", ke: "Tidak" },
  ]);
  assert.deepEqual(J.bedaPengguna(lama, lama), []);
  assert.equal(J.bedaPengguna(null, lama).length, 5, "pengguna baru: semua kolom terisi dicatat");
  assert.equal(J.bolehLihatJejak(admin), true);
  assert.equal(J.bolehLihatJejak(pantau), true);
  assert.equal(J.bolehLihatJejak(rina), false);
  assert.equal(J.bolehLihatJejak(budi), false);
});

// --- lib/masa, lib/penomoran, lib/pengaturan ---------------------------------------------------------

console.log("lib/masa, lib/penomoran, lib/pengaturan");

await kasus("BerakhirEfektif seharusnya dan selisih untuk rekonsiliasi", () => {
  const induk = kontrak({ status: "Aktif", tanggalBerakhir: "2026-12-31", berakhirEfektif: "2026-12-31" });
  const add = kontrak({ status: "Aktif", jenis: "Addendum / Amandemen", kontrakIndukId: induk.id, tanggalBerakhir: "2027-06-30" });
  const addBatal = kontrak({ status: "Dibatalkan", jenis: "Addendum / Amandemen", kontrakIndukId: induk.id, tanggalBerakhir: "2028-01-01" });
  const kosong = kontrak({ status: "Aktif", tanggalBerakhir: "2026-11-30", berakhirEfektif: null });
  const rapi = kontrak({ status: "Aktif", tanggalBerakhir: "2026-11-30", berakhirEfektif: "2026-11-30" });
  const berakhir = kontrak({ status: "Berakhir", tanggalBerakhir: "2026-01-01", berakhirEfektif: null });
  const semua = [induk, add, addBatal, kosong, rapi, berakhir];
  assert.equal(M.berakhirEfektifSeharusnya(induk, semua), "2027-06-30");
  assert.deepEqual(
    M.selisihBerakhirEfektif(semua).map((s) => `${s.id}:${s.dari}->${s.ke}`),
    [`${induk.id}:2026-12-31->2027-06-30`, `${kosong.id}:null->2026-11-30`],
    "addendum, kontrak Berakhir, dan yang sudah rapi tidak disentuh",
  );
});

await kasus("format penomoran ketat: pesan jelas, nilai sah dinormalkan", () => {
  const ok = No.validasiFormatPenomoranKetat({ pola: " {kode}/WKI/{romawi}/{tahun}/{urut} ", panjangUrut: 4, kodeJenis: { Sewa: "SWA" } });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.nilai.pola, "{kode}/WKI/{romawi}/{tahun}/{urut}");
    assert.equal(ok.nilai.kodeJenis.Sewa, "SWA");
    assert.equal(ok.nilai.kodeJenis["Pengadaan Jasa"], "PJ", "kode lain tetap bawaan");
    assert.equal(ok.nilai.polaAddendum, No.FORMAT_PENOMORAN_BAWAAN.polaAddendum);
    const u = No.usulanNomorKontrak(kontrak({ jenis: "Sewa" }), [], ok.nilai, { tanggal: "2026-10-03" });
    assert.equal(u.nomor, "SWA/WKI/X/2026/0001");
  }
  const gagal = (v: unknown) => {
    const h = No.validasiFormatPenomoranKetat(v);
    assert.equal(h.ok, false);
    return h.ok ? "" : h.galat;
  };
  assert.match(gagal({ pola: "{kode}/{tahun}" }), /\{urut\} tepat satu kali/);
  assert.match(gagal({ pola: "{urut}/{urut}" }), /tepat satu kali/);
  assert.match(gagal({ pola: "{kode}/{nomor}/{urut}" }), /\{nomor\} tidak dikenal/);
  assert.match(gagal({ pola: "{urut}", polaAddendum: "ADD-{urutan}" }), /\{induk\}/);
  assert.match(gagal({ pola: "{urut}", panjangUrut: 0 }), /1 sampai 8/);
  assert.match(gagal({ pola: "{urut}", kodeJenis: { Sewa: "S W" } }), /Kode Sewa/);
  assert.match(gagal(null), /objek/);
});

await kasus("Pengaturan formatPenomoran: tervalidasi saat dibaca, formulir bolak-balik, bawaan tidak dianggap berubah", () => {
  const bawaan = Pg.pengaturanBawaan();
  // Nilai hasil formulir yang isinya sama dengan bawaan tidak boleh membuat bilah simpan muncul.
  const dariForm = Pg.dariForm(Pg.keForm(bawaan));
  assert.ok(dariForm.ok);
  if (dariForm.ok) {
    assert.ok(Pg.samaNilai(dariForm.nilai.formatPenomoran, bawaan.formatPenomoran), "urutan kunci tidak dianggap perubahan");
    assert.deepEqual(
      Pg.DAFTAR_KUNCI.filter((k) => !Pg.samaNilai(dariForm.nilai[k], bawaan[k])),
      [],
    );
  }
  assert.ok(Pg.samaNilai({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }));
  assert.ok(!Pg.samaNilai({ a: [1, 2] }, { a: [2, 1] }), "urutan larik tetap berarti");

  const form = { ...Pg.keForm(bawaan), formatPola: "{kode}/{urut}", formatPanjangUrut: "x" };
  const h = Pg.dariForm(form);
  assert.ok(!h.ok);
  if (!h.ok) assert.match(h.galat.formatPanjangUrut ?? "", /1 sampai 8/);
  const h2 = Pg.formatDariForm({ ...Pg.keForm(bawaan), formatPolaAddendum: "{urutan}" });
  assert.ok(!h2.ok && h2.isian === "formatPolaAddendum");

  const baca = Pg.bacaPengaturan([
    { kunci: "formatPenomoran", nilaiJson: JSON.stringify({ pola: "{tahun}-{urut}", panjangUrut: 5 }) },
  ]);
  assert.equal(baca.pengaturan.formatPenomoran.pola, "{tahun}-{urut}");
  assert.deepEqual(baca.tersimpan, ["formatPenomoran"]);
  const rusak = Pg.bacaPengaturan([{ kunci: "formatPenomoran", nilaiJson: JSON.stringify({ pola: "{tahun}" }) }]);
  assert.equal(rusak.rusak[0]?.kunci, "formatPenomoran");
  assert.deepEqual(rusak.pengaturan.formatPenomoran, bawaan.formatPenomoran, "nilai rusak jatuh ke bawaan");
});

await kasus("PEMBACA_FLOW mencakup semua kunci dan sesuai laporan flow", () => {
  for (const k of Pg.DAFTAR_KUNCI) assert.ok(Array.isArray(Pg.PEMBACA_FLOW[k]), k);
  assert.deepEqual(Pg.flowPembaca(["formatPenomoran", "pengirimEmail", "tautanTeams"]), []);
  assert.deepEqual(Pg.flowPembaca(["hariPeringatan", "jaminanPeringatan"]), ["Pengingat harian", "Laporan bulanan"]);
  assert.deepEqual(Pg.flowPembaca(["sla"]), ["Agenda pagi"]);
});

// --- lib/ttd dan lib/syarat ------------------------------------------------------------------------------

console.log("lib/ttd, lib/syarat");

await kasus("cara tanda tangan dan draft final ikut tersimpan saat langkah diubah", () => {
  const jejak = { dokumenId: "d1", nama: "Draft final.docx", ukuran: 2048, sha256: "ab".repeat(32), waktu: "2026-10-01T03:00:00Z", oleh: "Rina" };
  const c1 = T.aturCaraTtd(null, "tte");
  assert.equal(c1.cara, "tte");
  assert.ok(c1.items.length > 0);
  const c2 = T.aturDraftFinal(c1, jejak);
  assert.equal(c2.cara, "tte");
  assert.deepEqual(c2.draftFinal, jejak);
  // Menyimpan satu langkah (bungkusTtd dengan data lama) tidak membuang cara dan sidik.
  const langkah = T.ubahLangkah(T.susunTtd(c2), c2.items[0]!.id, { selesai: true }, "Rina", new Date("2026-10-02T03:00:00Z"));
  const c3 = T.bungkusTtd(langkah, c2);
  assert.equal(c3.cara, "tte");
  assert.equal(c3.draftFinal?.sha256, jejak.sha256);
  assert.equal(T.aturCaraTtd(c3, null).cara, undefined, "null mengosongkan cara");
  assert.equal(T.labelCaraTtd("e-meterai"), "TTE + e-meterai");
  assert.equal(T.labelCaraTtd(null), "Belum dipilih");
});

await kasus("SHA-256 dengan Web Crypto dan teks riwayat draft final", async () => {
  const abc = await T.hitungSha256(new TextEncoder().encode("abc"));
  assert.equal(abc, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(await T.hitungSha256(new ArrayBuffer(0)), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(T.ringkasSha256(abc), "ba78 16bf … 15ad");
  assert.match(T.teksDraftFinal({ nama: "Draft.docx", ukuran: 1536, sha256: abc }), /^Draft final yang disepakati: "Draft\.docx" \(.+\), SHA-256 ba7816bf.+15ad\.$/);
  assert.match(T.teksDraftFinal({ nama: "Draft.docx", ukuran: 1536, sha256: "" }, "Berkas terlalu besar"), /belum bisa dihitung: Berkas terlalu besar\.$/);
});

await kasus("peringatan lunak dokumen wajib sebelum tanda tangan dan tautan Templat Legal", () => {
  const { wajib } = Sy.kekuranganDokumen("Pengadaan Jasa", []);
  assert.ok(wajib.length > 0);
  const p = Sy.peringatanDokumenSebelumTtd("Pengadaan Jasa", []);
  assert.match(p, /^Dokumen wajib yang belum ada: .+Anda tetap bisa lanjut/);
  assert.equal(Sy.peringatanDokumenSebelumTtd("Pengadaan Jasa", wajib), "");
  assert.equal(Sy.urlTemplatLegal("https://x.sharepoint.com/sites/K/BerkasKontrak/"), "https://x.sharepoint.com/sites/K/BerkasKontrak/_Templat");
  assert.equal(Sy.urlTemplatLegal("https://x/B", "Templat Legal"), "https://x/B/Templat%20Legal");
});

// --- Layanan dengan Graph tiruan -----------------------------------------------------------------------------

console.log("services (Graph tiruan)");

type Fields = Record<string, unknown>;
const toko = new Map<number, Fields>();
const tulisan: { path: string; metode: string; json: unknown }[] = [];
let tolak: ((path: string, metode: string, json: unknown) => Error | null) | null = null;
let semuaLain: (path: string) => unknown[] = () => [];
let idBaru = 5000;

const itemGraph = (id: number, f: Fields) => ({
  id: String(id),
  createdDateTime: "2026-09-01T03:00:00Z",
  lastModifiedDateTime: "2026-09-20T03:00:00Z",
  webUrl: "",
  fields: { ...f },
});

g.__graf.graph = async (path, opsi) => {
  const metode = opsi?.method ?? "GET";
  const galat = tolak?.(path, metode, opsi?.json);
  if (galat) throw galat;
  if (metode !== "GET") tulisan.push({ path, metode, json: opsi?.json });
  const m = new RegExp(`lists/${LIST_ID.kontrak}/items/(\\d+)`).exec(path);
  if (m) {
    const id = Number(m[1]);
    const f = toko.get(id);
    if (!f) throw new G.GraphError("Item not found", 404);
    if (metode === "PATCH") {
      Object.assign(f, opsi?.json as Fields);
      return {};
    }
    return itemGraph(id, f);
  }
  if (metode === "POST") return { id: String(++idBaru), fields: (opsi?.json as { fields?: Fields })?.fields ?? {} };
  return {};
};
g.__graf.graphSemua = async (path) => {
  if (path.includes(`lists/${LIST_ID.kontrak}/items`)) return [...toko].map(([id, f]) => itemGraph(id, f));
  return semuaLain(path);
};

const K = await import("../src/services/kontrak");
const Kasus = await import("../src/services/kasus");
const SJ = await import("../src/services/jejakAudit");
const D = await import("../src/services/dokumen");

/** Simpan kontrak ke toko tiruan dalam bentuk kolom SharePoint, lalu kembalikan bentuk aplikasinya. */
async function simpan(f: Fields & { id: number }): Promise<Kontrak> {
  const { id, ...isi } = f;
  toko.set(id, { Title: `Kontrak ${id}`, NomorPengajuan: `KTR-2026-${String(id).padStart(4, "0")}`, JenisKontrak: "Pengadaan Jasa", Status: "Diajukan", PengajuEmail: budi.email, MataUang: "IDR", ...isi });
  K.kosongkanCacheKontrak();
  return K.ambilKontrak(id);
}
const aksi = (k: Kontrak, sesi: Sesi, id: string): AksiStatus => {
  const a = [...Alur.aksiTersedia(k, sesi), ...Alur.aksiPemulihan(k, sesi)].find((x) => x.id === id);
  assert.ok(a, `aksi ${id} tersedia`);
  return a;
};
const patchKontrak = (id: number) => tulisan.filter((t) => t.metode === "PATCH" && t.path.includes(`lists/${LIST_ID.kontrak}/items/${id}/`));
const aktivitasStatus = () => tulisan.filter((t) => t.metode === "POST" && t.path.includes(LIST_ID.aktivitas)).map((t) => (t.json as { fields: Fields }).fields);
const reset = () => {
  tulisan.length = 0;
  tolak = null;
  semuaLain = () => [];
};
const asliWarn = console.warn;
console.warn = () => undefined;

await kasus("jalankanAksi: status berubah sejak dilihat -> GalatKonflik tanpa menulis apa pun", async () => {
  reset();
  const k = await simpan({ id: 1, Status: "Review Legal", PicLegalEmail: rina.email, PicLegalNama: "Rina" });
  toko.get(1)!.Status = "Perlu Revisi";
  await assert.rejects(K.jalankanAksi(k, aksi(k, rina, "lanjut-ttd"), "", {}, rina), (e: unknown) => e instanceof K.GalatKonflik && /Perlu Revisi/.test(e.message) && e.segar.status === "Perlu Revisi");
  assert.equal(tulisan.length, 0);
});

await kasus("jalankanAksi: PIC berubah membatalkan aksi Legal, tidak aksi pengaju", async () => {
  reset();
  const k = await simpan({ id: 2, Status: "Diajukan", PicLegalEmail: "", PicLegalNama: "" });
  toko.get(2)!.PicLegalEmail = "dina@waskitainfrastruktur.co.id";
  toko.get(2)!.PicLegalNama = "Dina";
  await assert.rejects(K.jalankanAksi(k, aksi(k, rina, "mulai-review"), "", {}, rina), /PIC .+ Dina/);
  const h = await K.jalankanAksi(k, aksi(k, budi, "batal"), "Salah ajukan", {}, budi);
  assert.equal(h.kontrak.status, "Dibatalkan");
  assert.equal(toko.get(2)!.Status, "Dibatalkan");
});

await kasus("aktivasi: nomor ganda dari data segar -> GalatNomorGanda sebelum PATCH", async () => {
  reset();
  await simpan({ id: 3, Status: "Aktif", NomorKontrak: "PJ/2026/001" });
  const k = await simpan({ id: 4, Status: "Proses Tanda Tangan", PicLegalEmail: rina.email, PicLegalNama: "Rina" });
  await assert.rejects(
    K.jalankanAksi(k, aksi(k, rina, "aktifkan"), "", { nomorKontrak: " pj/2026/001 ", tanggalTandaTangan: "2026-10-01", tanggalMulai: "2026-10-01", tanggalBerakhir: "2027-09-30" }, rina),
    (e: unknown) => e instanceof K.GalatNomorGanda && e.ganda.length === 1 && e.semua.length >= 2,
  );
  assert.equal(patchKontrak(4).length, 0);
});

await kasus("aktivasi: Detail lama-ke-baru untuk nomor, tanggal, nilai final, dan referensi; BerakhirEfektif terisi", async () => {
  reset();
  const k = await simpan({ id: 5, Status: "Proses Tanda Tangan", PicLegalEmail: rina.email, PicLegalNama: "Rina", NilaiKontrak: 1_000_000, TanggalMulai: F.dariYmd("2026-10-01"), TanggalBerakhir: F.dariYmd("2027-03-31") });
  const h = await K.jalankanAksi(
    k,
    aksi(k, rina, "aktifkan"),
    "Sudah TTD",
    { nomorKontrak: "PJ/2026/002", tanggalTandaTangan: "2026-10-02", tanggalMulai: "2026-10-01", tanggalBerakhir: "2027-09-30", nilai: 1_250_000, nomorReferensi: "PO-77" },
    rina,
  );
  assert.deepEqual(h.peringatan, []);
  const f = toko.get(5)!;
  assert.equal(f.Status, "Aktif");
  assert.equal(f.NomorKontrak, "PJ/2026/002");
  assert.equal(f.NilaiKontrak, 1_250_000);
  assert.equal(f.NomorReferensi, "PO-77");
  assert.equal(F.keYmd(String(f.BerakhirEfektif)), "2027-09-30");
  const [akt] = aktivitasStatus();
  assert.equal(akt!.StatusDari, "Proses Tanda Tangan");
  assert.equal(akt!.StatusKe, "Aktif");
  const detail = J.uraiDetail(akt!.Detail);
  const kolom = Object.fromEntries(detail.map((d) => [d.kolom, `${d.dari} -> ${d.ke}`]));
  assert.equal(kolom["nomor kontrak"], "- -> PJ/2026/002");
  assert.match(kolom["nilai"] ?? "", /^Rp\s?1\.000\.000 -> Rp\s?1\.250\.000$/);
  assert.match(kolom["tanggal tanda tangan"] ?? "", /^- -> 2 Okt/);
  assert.match(kolom["tanggal berakhir"] ?? "", /31 Mar 2027 -> 30 Sep 2027/);
  assert.equal(kolom["nomor referensi"], "- -> PO-77");
  assert.equal(kolom["tanggal mulai"], undefined, "kolom yang tidak berubah tidak dicatat");
});

await kasus("Tandai Berakhir: mode dan tanggal efektif ditulis terpisah; gagal = peringatan, status tetap berubah", async () => {
  reset();
  const k = await simpan({ id: 6, Status: "Aktif", TanggalBerakhir: F.dariYmd("2026-12-31"), BerakhirEfektif: F.dariYmd("2026-12-31"), PicLegalEmail: rina.email, PicLegalNama: "Rina" });
  const h = await K.jalankanAksi(k, aksi(k, rina, "akhiri"), "Wanprestasi", {}, rina, { penutupan: { mode: "Diputus", tanggal: "2026-10-03" } });
  assert.deepEqual(h.peringatan, []);
  assert.equal(toko.get(6)!.Status, "Berakhir");
  assert.equal(toko.get(6)!.ModeBerakhir, "Diputus");
  assert.equal(F.keYmd(String(toko.get(6)!.TanggalDiakhiri)), "2026-10-03");
  const p = patchKontrak(6);
  assert.ok(p.length >= 2 && !("ModeBerakhir" in (p[0]!.json as Fields)), "kolom pelengkap tidak ikut PATCH status");
  const detail = J.uraiDetail(aktivitasStatus()[0]!.Detail);
  assert.ok(detail.some((d) => d.kolom === K.LABEL_MODE_BERAKHIR && d.ke === "Diputus"));

  reset();
  const k2 = await simpan({ id: 7, Status: "Aktif", PicLegalEmail: rina.email, PicLegalNama: "Rina" });
  tolak = (path, metode, json) => (metode === "PATCH" && json && typeof json === "object" && "ModeBerakhir" in json ? new G.GraphError("Field 'ModeBerakhir' is not recognized", 400) : null);
  const h2 = await K.jalankanAksi(k2, aksi(k2, rina, "akhiri"), "", {}, rina, { penutupan: { mode: "Selesai Normal", tanggal: "2026-10-03" } });
  assert.equal(toko.get(7)!.Status, "Berakhir");
  assert.match(h2.peringatan.join(" "), /ModeBerakhir dan TanggalDiakhiri/);
});

await kasus("Aktifkan Kembali dari Berakhir: mode dikosongkan, status Aktif, email status ikut diantrikan", async () => {
  reset();
  const k = await simpan({ id: 8, Status: "Berakhir", ModeBerakhir: "Diputus", TanggalDiakhiri: F.dariYmd("2026-10-01"), TanggalBerakhir: F.dariYmd("2027-01-31") });
  const a = aksi(k, admin, "aktifkan-kembali");
  assert.equal(a.ke, "Aktif");
  await K.jalankanAksi(k, a, "Salah tutup", {}, admin);
  const f = toko.get(8)!;
  assert.equal(f.Status, "Aktif");
  assert.equal(f.ModeBerakhir, null);
  assert.equal(f.TanggalDiakhiri, null);
  assert.equal(F.keYmd(String(f.BerakhirEfektif)), "2027-01-31");
  const akt = aktivitasStatus()[0]!;
  assert.equal(akt.Pesan, "Salah tutup");
  assert.equal(akt.StatusDari, "Berakhir");
  const email = tulisan.find((t) => t.metode === "POST" && t.path.includes(LIST_ID.notifikasi));
  assert.ok(email, "pengaju diberi tahu lewat kotak keluar");
  assert.equal((email!.json as { fields: Fields }).fields.Penerima, budi.email);
});

await kasus("sinkronkanBerakhirEfektif: addendum Aktif memperpanjang induk; ubahKontrak tanggal berakhir ikut menyinkronkan", async () => {
  reset();
  const induk = await simpan({ id: 10, Status: "Aktif", TanggalBerakhir: F.dariYmd("2026-12-31"), BerakhirEfektif: F.dariYmd("2026-12-31"), PicLegalEmail: rina.email, PicLegalNama: "Rina" });
  const add = await simpan({ id: 11, Status: "Proses Tanda Tangan", JenisKontrak: "Addendum / Amandemen", KontrakIndukId: 10, UrutanAddendum: 1, TanggalBerakhir: F.dariYmd("2027-06-30"), PicLegalEmail: rina.email, PicLegalNama: "Rina" });
  await K.jalankanAksi(add, aksi(add, rina, "aktifkan"), "", { nomorKontrak: "PJ/2026/010/ADD-1", tanggalTandaTangan: "2026-10-02", tanggalBerakhir: "2027-06-30" }, rina);
  assert.equal(F.keYmd(String(toko.get(10)!.BerakhirEfektif)), "2027-06-30");
  assert.equal(toko.get(11)!.BerakhirEfektif, undefined, "addendum sendiri tidak diberi BerakhirEfektif");

  // Tanpa perubahan: tidak menulis.
  reset();
  const h = await K.sinkronkanBerakhirEfektif(11);
  assert.deepEqual(h, { indukId: 10, dari: "2027-06-30", ke: "2027-06-30", berubah: false });
  assert.equal(patchKontrak(10).length, 0);

  // Legal memundurkan tanggal berakhir addendum Aktif lewat formulir: induk ikut.
  reset();
  K.kosongkanCacheKontrak();
  const addSegar = await K.ambilKontrak(11);
  await K.ubahKontrak(addSegar, { tanggalBerakhir: "2027-03-31" }, rina);
  assert.equal(F.keYmd(String(toko.get(10)!.BerakhirEfektif)), "2027-03-31");
  void induk;
});

await kasus("rekonsiliasi: hanya kontrak Aktif yang selisih, progres dilaporkan, gagal tidak menghentikan sisanya", async () => {
  toko.clear();
  reset();
  await simpan({ id: 20, Status: "Aktif", TanggalBerakhir: F.dariYmd("2026-11-30") });
  await simpan({ id: 21, Status: "Aktif", TanggalBerakhir: F.dariYmd("2026-12-31"), BerakhirEfektif: F.dariYmd("2026-12-31") });
  await simpan({ id: 22, Status: "Aktif", TanggalBerakhir: F.dariYmd("2027-01-31"), BerakhirEfektif: F.dariYmd("2026-01-31") });
  await simpan({ id: 23, Status: "Berakhir", TanggalBerakhir: F.dariYmd("2026-01-31") });
  const p = await K.periksaBerakhirEfektif();
  assert.equal(p.diperiksa, 3);
  assert.deepEqual(p.selisih.map((s) => s.id).sort(), [20, 22]);
  tolak = (path, metode) => (metode === "PATCH" && path.includes("/items/22/") ? new G.GraphError("Terkunci", 423) : null);
  const progres: string[] = [];
  const h = await K.rekonsiliasiBerakhirEfektif((s, t) => progres.push(`${s}/${t}`));
  assert.deepEqual(h.diperbaiki.map((s) => s.id), [20]);
  assert.equal(h.gagal.length, 1);
  assert.match(h.gagal[0]!.pesan, /Terkunci/);
  assert.deepEqual(progres, ["0/2", "1/2", "2/2"]);
  assert.equal(F.keYmd(String(toko.get(20)!.BerakhirEfektif)), "2026-11-30");
});

await kasus("services/kasus: flag AdaSengketa hanya ditulis bila berubah; galat izin dibuat ramah", async () => {
  reset();
  const k = await simpan({ id: 30, Status: "Aktif", AdaSengketa: false });
  const kasusTersimpan: Fields[] = [];
  semuaLain = (path) => (path.includes(LIST_ID.kasus) ? kasusTersimpan.map((f, i) => ({ id: String(i + 1), createdDateTime: "", lastModifiedDateTime: "", fields: f })) : []);
  const isi = { ...Kas.kasusKosong("2026-10-03"), judul: "Gugatan wanprestasi", jenis: "Sengketa" as const };
  const asliGraph = g.__graf.graph;
  g.__graf.graph = async (path, opsi) => {
    if (path.includes(LIST_ID.kasus) && opsi?.method === "POST") kasusTersimpan.push((opsi.json as { fields: Fields }).fields);
    return asliGraph(path, opsi);
  };
  const h = await Kasus.simpanKasus(k, isi);
  assert.deepEqual(h, { adaSengketa: true, flagTersimpan: true });
  assert.equal(toko.get(30)!.AdaSengketa, true);
  assert.equal(kasusTersimpan[0]!.KontrakId, 30);
  assert.equal(kasusTersimpan[0]!.JenisKasus, "Sengketa");

  reset();
  semuaLain = (path) => (path.includes(LIST_ID.kasus) ? kasusTersimpan.map((f, i) => ({ id: String(i + 1), createdDateTime: "", lastModifiedDateTime: "", fields: f })) : []);
  const h2 = await Kasus.samakanFlagSengketa({ id: 30, adaSengketa: true });
  assert.equal(h2.flagTersimpan, true);
  assert.equal(patchKontrak(30).length, 0, "tidak menulis bila sudah sama");
  g.__graf.graph = asliGraph;

  semuaLain = () => {
    throw new G.GraphError("Access denied", 403);
  };
  await assert.rejects(Kasus.ambilKasus(30), /belum diberi akses ke list Kasus Kontrak/);
});

await kasus("services/jejakAudit: filter Created per periode, KontrakId per kontrak, Log Admin 403 tidak menggagalkan", async () => {
  reset();
  const jalur: string[] = [];
  const kontrakX = kontrak({ id: 40, nomorPengajuan: "KTR-2026-0040", judul: "Sewa crane", nomorKontrak: "SW/2026/004" });
  semuaLain = (path) => {
    jalur.push(path);
    if (path.includes(LIST_ID.logAdmin)) throw new G.GraphError("Access denied", 403);
    return [
      { id: "1", createdDateTime: "2026-10-02T03:00:00Z", createdBy: { user: { displayName: "Rina SP", email: "rina@waskitainfrastruktur.co.id" } }, fields: { Title: "Status", KontrakId: 40, StatusDari: "Proses Tanda Tangan", StatusKe: "Aktif", OlehNama: "Rina", Pesan: "" } },
      { id: "2", createdDateTime: "2026-10-02T04:00:00Z", fields: { Title: "Komentar", KontrakId: 40, Pesan: "halo", OlehNama: "Budi" } },
    ];
  };
  const h = await SJ.ambilJejak({ dari: "2026-10-01", sampai: "2026-10-03", kontrak: [kontrakX] });
  assert.match(decodeURIComponent(jalur[0]!), /fields\/Created ge '2026-09-30T17:00:00\.000Z' and fields\/Created lt '2026-10-03T17:00:00\.000Z'/);
  assert.equal(h.entri.length, 1, "komentar bukan bahan audit");
  assert.equal(h.entri[0]!.pelaku, "Rina SP");
  assert.equal(h.entri[0]!.nomorKontrak, "SW/2026/004");
  assert.ok(h.galatLog instanceof G.GraphError && h.galatLog.status === 403);
  assert.equal(h.perluPilihKontrak, false);

  jalur.length = 0;
  await SJ.ambilJejak({ dari: "2026-10-01", sampai: "2026-10-03", kontrak: [kontrakX], kontrakId: 40 });
  assert.ok(jalur.some((p) => p.includes(LIST_ID.aktivitas) && p.includes("fields/KontrakId eq 40")));

  // List besar tanpa indeks Created: kueri ditolak (500), halaman diminta memilih satu kontrak.
  semuaLain = (path) => {
    if (path.includes(LIST_ID.aktivitas)) throw new G.GraphError("The attempted operation is prohibited because it exceeds the list view threshold.", 500);
    return [];
  };
  const h3 = await SJ.ambilJejak({ dari: "2026-10-01", sampai: "2026-10-03", kontrak: [] });
  assert.equal(h3.perluPilihKontrak, true);
  // Galat sesi tetap dilempar supaya pita Masuk ulang yang menanganinya.
  semuaLain = () => {
    throw new G.GraphError("Sesi berakhir", 401, "perlu_login");
  };
  await assert.rejects(SJ.ambilJejak({ dari: "2026-10-01", sampai: "2026-10-03", kontrak: [] }), /Sesi berakhir/);
});

await kasus("services/dokumen: redline ditolak sebelum unggah bila ekstensinya beda dengan dokumen tujuan", async () => {
  reset();
  const k = kontrak({ id: 50 });
  const berkas = new File([new Uint8Array([1, 2, 3])], "Redline.pdf", { type: "application/pdf" });
  await assert.rejects(D.unggahRedline(k, berkas, { id: "d1", nama: "Draft.docx" }, rina), /berbeda jenis berkas/);
  assert.equal(tulisan.length, 0);
});

console.warn = asliWarn;
console.log(`\nSemua ${nomor} kasus lulus.`);
