// Uji Daftar Kontrak, Dashboard, ekspor, dan pemuatan data:
//   lib/filterKerja.ts (U01 ubin = daftar, U18 preset Selesai, U12 proyek dan pencarian, U29A urutan nilai, U34),
//   lib/addendum.ts (U05A perpanjangan diproses, U29A mata uang addendum berbeda),
//   lib/ekspor.ts (U19 Kontrak Final, K02 Mode Berakhir), dan
//   services/kontrak.ts bagian pemuatan daftar (U39: $select bersama, cache bersama, kabar pengosongan).
// Jalankan: npx --yes tsx scripts/uji-daftar.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { Kontrak, Sesi } from "../src/lib/types";

// src/config.ts membaca import.meta.env milik Vite (diganti objek kosong), dan src/lib/graph.ts diganti tiruan
// yang meneruskan panggilan ke globalThis.__graf, supaya services/kontrak.ts bisa diuji tanpa jaringan dan MSAL.
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
`;
const kait = `export async function load(url, ctx, next) {
  if (url.includes("/src/lib/graph.ts")) return { format: "module", shortCircuit: true, source: ${JSON.stringify(tiruanGraph)} };
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

interface Graf {
  graph: (path: string, opsi?: unknown) => Promise<unknown>;
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

const F = await import("../src/lib/filterKerja");
const A = await import("../src/lib/addendum");
const X = await import("../src/lib/ekspor");
const P = await import("../src/lib/portofolio");
const M = await import("../src/lib/masa");

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

const HARI_INI = "2026-10-03";
const SEKARANG = Date.parse("2026-10-03T03:00:00Z");
const rina: Sesi = { email: "rina@wki.co.id", nama: "Rina", peran: "Legal", divisi: "Legal", penggunaId: 1 };
const pantau: Sesi = { email: "pantau@wki.co.id", nama: "Pantau", peran: "Pemantau", divisi: null, penggunaId: 3 };
const ADD = "Addendum / Amandemen" as const;

// Data campuran: proses, aktif induk dan addendum, lewat masa, perpanjangan otomatis, status akhir.
const induk = kontrak({ id: 1, status: "Aktif", nilai: 1_000_000_000, tanggalBerakhir: "2026-12-31", kodeProyek: "TOL-X" });
const addProses = kontrak({ id: 2, jenis: ADD, kontrakIndukId: 1, urutanAddendum: 1, status: "Review Legal", jenisPerubahan: ["Perpanjangan Waktu"], tanggalBerakhir: "2027-06-30" });
const addAktif = kontrak({ id: 3, jenis: ADD, kontrakIndukId: 4, urutanAddendum: 1, status: "Aktif", nilai: 50_000_000, jenisPerubahan: ["Perubahan Nilai"] });
const induk2 = kontrak({ id: 4, status: "Aktif", nilai: 200_000_000, tanggalBerakhir: "2027-03-01", kodeProyek: "P-01" });
const otomatis = kontrak({ id: 5, status: "Aktif", nilai: 10_000, mataUang: "USD", tanggalBerakhir: "2026-11-15", perpanjanganOtomatis: true, masaPemberitahuanHari: 30, kodeProyek: "P-010" });
const lewat = kontrak({ id: 6, status: "Aktif", nilai: 70_000_000, tanggalBerakhir: "2026-09-01" });
const diajukan = kontrak({ id: 7, status: "Diajukan", nomorReferensi: "PO-123, SPK-9" });
const revisi = kontrak({ id: 8, status: "Perlu Revisi" });
const berakhir = kontrak({ id: 9, status: "Berakhir", tanggalBerakhir: "2026-01-01", modeBerakhir: "Diputus" });
const ditolak = kontrak({ id: 10, status: "Ditolak" });
const tanpaAkhir = kontrak({ id: 11, status: "Aktif", nilai: null });
const addBedaMu = kontrak({ id: 12, jenis: ADD, kontrakIndukId: 4, urutanAddendum: 2, status: "Aktif", nilai: 1_000, mataUang: "USD", jenisPerubahan: ["Perubahan Nilai"] });
const addBedaDitolak = kontrak({ id: 13, jenis: ADD, kontrakIndukId: 4, urutanAddendum: 3, status: "Ditolak", nilai: 9, mataUang: "EUR" });
const data = [induk, addProses, addAktif, induk2, otomatis, lewat, diajukan, revisi, berakhir, ditolak, tanpaAkhir, addBedaMu, addBedaDitolak];
const ctx = (sesi: Sesi = rina) => ({ sesi, semua: data, hariIni: HARI_INI, sekarang: SEKARANG });
const ids = (xs: readonly Kontrak[]) => xs.map((x) => x.id).sort((a, b) => a - b);
const kosong = () => ({ ...F.FILTER_KERJA_KOSONG, prioritas: [] });

// --- filterKerja: parameter baru ------------------------------------------------------------

console.log("lib/filterKerja");

await kasus("tahap, addendum, dan berakhir=berlaku bolak-balik lewat URL; bentuk lama tidak berubah", () => {
  const f = F.bacaFilterKerja(new URLSearchParams("tahap=Proses&addendum=TANPA&berakhir=berlaku&q=x"));
  assert.equal(f.tahap, "proses");
  assert.equal(f.addendum, "tanpa");
  assert.equal(f.berakhir, "berlaku");
  assert.deepEqual(F.bacaFilterKerja(F.tulisFilterKerja(f)), f);
  assert.equal(F.tulisFilterKerja(f, new URLSearchParams("q=x&status=Aktif")).get("q"), "x", "parameter lain dipertahankan");
  // Tanpa parameter baru: objeknya persis bentuk lama (tanpa kunci tahap/addendum).
  assert.deepEqual(F.bacaFilterKerja(new URLSearchParams("")), F.FILTER_KERJA_KOSONG);
  assert.deepEqual(Object.keys(F.bacaFilterKerja(new URLSearchParams("tahap=aneh&addendum=ya"))).sort(), Object.keys(F.FILTER_KERJA_KOSONG).sort());
  assert.ok(!F.filterKerjaKosong(f));
  assert.deepEqual(F.ringkasFilterKerja(f), ["sedang diproses", "tanpa addendum", "masih berlaku"]);
});

await kasus("U01: ubin 'Sedang diproses' dan 'Kontrak aktif' sama persis dengan daftar yang dibukanya", () => {
  for (const sesi of [rina, pantau]) {
    const proses = F.saringKerja(data, { ...kosong(), tahap: "proses" }, ctx(sesi));
    assert.deepEqual(ids(proses), [2, 7, 8], "Diajukan sampai Proses Tanda Tangan, termasuk addendum yang diproses");
    // Ubin "Kontrak aktif" = ?status=Aktif&addendum=tanpa: Daftar menyaring addendum=tanpa lalu status Aktif.
    const daftarAktif = F.saringKerja(data, F.bacaFilterKerja(new URLSearchParams("status=Aktif&addendum=tanpa")), ctx(sesi)).filter((k) => k.status === "Aktif");
    const ubinAktif = data.filter((k) => k.status === "Aktif" && !A.adalahAddendum(k));
    assert.deepEqual(ids(daftarAktif), ids(ubinAktif));
    assert.deepEqual(ids(daftarAktif), [1, 4, 5, 6, 11]);
    // Chip "Semua" di Daftar Kontrak dihitung dengan cakupan yang sama, jadi angkanya sama dengan ubin.
    assert.equal(data.filter((k) => F.dalamCakupan(k, { tahap: "proses" })).length, proses.length);
    assert.equal(data.filter((k) => k.status === "Aktif" && F.dalamCakupan(k, { addendum: "tanpa" })).length, ubinAktif.length);
    assert.equal(data.filter((k) => F.dalamCakupan(k, {})).length, data.length, "tanpa cakupan: semua");
  }
});

await kasus("U34: 'Akan berakhir' tanpa perpanjangan otomatis; kelompok otomatis memakai batas keputusan lib/masa", () => {
  const akan = F.saringKerja(data, F.filterPreset("akan-berakhir"), ctx());
  assert.deepEqual(ids(akan), [1], "kontrak 5 (otomatis, 43 hari lagi) tidak masuk");
  assert.equal(F.akanBerakhir(otomatis, "2026-11-15", HARI_INI, 90), false);
  assert.equal(F.akanBerakhir({ ...otomatis, perpanjanganOtomatis: false }, "2026-11-15", HARI_INI, 90), true);
  const g = M.kelompokMasa(data, HARI_INI, 90);
  const j = g.otomatis.find((x) => x.kontrak.id === 5);
  assert.ok(j, "kontrak otomatis tampil di kelompok Diperpanjang otomatis");
  assert.equal(j!.batas, "2026-10-16");
  assert.equal(j!.sisaBatas, 13);
  // Lewat masa berlaku tetap terpisah dan sama dengan baris terpisah di kartu nilai.
  const lewatMasa = F.saringKerja(data, F.filterPreset("lewat-masa"), ctx());
  assert.deepEqual(ids(lewatMasa), [6]);
  const pf = P.susunPortofolio(data, SEKARANG);
  assert.equal(pf.lewatMasa.jumlahKontrak, lewatMasa.length);
  assert.deepEqual(pf.lewatMasa.nilai, [{ mataUang: "IDR", total: 70_000_000, jumlah: 1 }]);
  // ?berakhir=berlaku = komitmen aktif di kartu nilai.
  const berlaku = F.saringKerja(data, { ...kosong(), berakhir: "berlaku" }, ctx());
  assert.deepEqual(ids(berlaku), [1, 4, 5, 11]);
  assert.equal(berlaku.length, pf.komitmen.jumlahKontrak);
});

await kasus("U18: preset Selesai (Aktif, Berakhir, Ditolak, Dibatalkan); ID_PRESET lama tetap lima", () => {
  assert.deepEqual([...F.ID_PRESET], ["antrean-saya", "tanpa-pic", "lewat-target", "akan-berakhir", "lewat-masa"]);
  assert.equal(F.PRESET_KERJA.length, 5);
  assert.deepEqual(
    F.PRESET_DAFTAR.map((p) => p.id),
    [...F.ID_PRESET, "selesai"],
  );
  assert.equal(F.kueriPreset("selesai"), "?tahap=selesai&urut=terbaru");
  const selesai = F.saringKerja(data, F.filterPreset("selesai"), ctx());
  assert.deepEqual(ids(selesai), [1, 3, 4, 5, 6, 9, 10, 11, 12, 13]);
  assert.equal(selesai[0]!.id, 13, "urut terbaru: id terbesar lebih dulu bila dibuat bersamaan");
  const h = F.hitungPreset(data, ctx());
  for (const id of F.ID_PRESET_DAFTAR) assert.equal(h[id], F.saringKerja(data, F.filterPreset(id), ctx()).length, id);
  const p1 = F.alihPreset(new URLSearchParams("q=tol&status=Aktif"), "selesai");
  assert.equal(p1.get("status"), null);
  assert.equal(p1.get("q"), "tol");
  assert.equal(F.presetAktif(p1), "selesai");
  assert.equal(F.presetAktif(F.alihPreset(p1, "selesai")), null);
  assert.equal(F.presetAktif(new URLSearchParams("tahap=selesai&addendum=tanpa")), null, "kombinasi bukan preset");
  assert.equal(F.presetById("selesai").label, "Selesai");
});

// --- Pencarian, proyek, dan urutan nilai ----------------------------------------------------

await kasus("U12: pencarian mencakup kode proyek dan nomor referensi PR/PO/SPK", () => {
  assert.ok(F.cocokCari(diajukan, "spk-9"));
  assert.ok(F.cocokCari(diajukan, " PO-123 "));
  assert.ok(F.cocokCari(induk, "tol-x"));
  assert.ok(F.cocokCari(induk, ""));
  assert.ok(!F.cocokCari(induk, "po-123"));
});

await kasus("U12: datalist proyek unik dan rapi; filter 'Tanpa proyek', sama persis, dan sebagian", () => {
  const daftar = [kontrak({ kodeProyek: "P-01" }), kontrak({ kodeProyek: " p-01 " }), kontrak({ kodeProyek: "P-010" }), kontrak({ kodeProyek: "Tol  Kayu" }), kontrak({ kodeProyek: "" }), kontrak({ kodeProyek: "P-2" })];
  assert.deepEqual(F.daftarProyek(daftar), ["P-01", "P-2", "P-010", "Tol Kayu"]);
  assert.equal(F.saringProyek(daftar, F.PROYEK_TANPA).length, 1);
  assert.equal(F.saringProyek(daftar, F.LABEL_TANPA_PROYEK).length, 1, "label datalist dikenali");
  assert.deepEqual(F.saringProyek(daftar, "P-01").map((k) => k.kodeProyek.trim().toLowerCase()), ["p-01", "p-01"], "P-01 tidak ikut memuat P-010");
  assert.equal(F.saringProyek(daftar, "tol").length, 1);
  assert.equal(F.saringProyek(daftar, "  ").length, daftar.length);
  assert.deepEqual(ids(F.saringProyek(data, "P-01")), [4]);
});

await kasus("U29A: kolom Nilai dikelompokkan per mata uang, kosong selalu di akhir", () => {
  const n = (nilai: number | null, mataUang: Kontrak["mataUang"]) => kontrak({ nilai, mataUang });
  const daftar = [n(5_000_000, "IDR"), n(300_000, "USD"), n(1_000_000_000, "IDR"), n(null, "IDR"), n(10, "EUR"), n(5, "USD")];
  const teks = (arah: "asc" | "desc") =>
    [...daftar]
      .sort((a, b) => F.bandingNilai(a, b, arah))
      .map((k) => (k.nilai == null ? "-" : `${k.mataUang} ${k.nilai}`))
      .join(", ");
  assert.equal(teks("asc"), "IDR 5000000, IDR 1000000000, USD 5, USD 300000, EUR 10, -");
  assert.equal(teks("desc"), "IDR 1000000000, IDR 5000000, USD 300000, USD 5, EUR 10, -");
});

// --- addendum ---------------------------------------------------------------------------------

console.log("lib/addendum");

await kasus("U05A: addendum perpanjangan yang masih diproses ditandai pada induknya", () => {
  assert.ok(A.memperpanjang({ jenisPerubahan: ["Perpanjangan Waktu"], tanggalBerakhir: null }, "2026-12-31"));
  assert.ok(A.memperpanjang({ jenisPerubahan: [], tanggalBerakhir: "2027-01-01" }, "2026-12-31"), "data lama tanpa jenis perubahan");
  assert.ok(!A.memperpanjang({ jenisPerubahan: [], tanggalBerakhir: "2026-12-01" }, "2026-12-31"));
  assert.ok(!A.memperpanjang({ jenisPerubahan: ["Perubahan Nilai"], tanggalBerakhir: "2027-01-01" }, "2026-12-31"));
  const peta = A.petaPerpanjanganDiproses(data);
  assert.deepEqual([...peta.keys()], [1]);
  assert.deepEqual(ids(peta.get(1)!), [2]);
  // Setelah berlaku, lencananya hilang dan masa berlaku efektif induk bertambah.
  const berlaku = data.map((k) => (k.id === 2 ? { ...k, status: "Aktif" as const } : k));
  assert.equal(A.petaPerpanjanganDiproses(berlaku).size, 0);
  assert.equal(A.ringkasAddendum(induk, berlaku).berakhirEfektif, "2027-06-30");
  assert.equal(A.petaPerpanjanganDiproses(data.map((k) => (k.id === 2 ? { ...k, status: "Ditolak" as const } : k))).size, 0);
});

await kasus("U29A: addendum bermata uang beda terdeteksi; nilai efektif induk tetap seperti sebelumnya", () => {
  assert.deepEqual(ids(A.addendumBedaMataUang(data)), [12], "yang Ditolak tidak diperingatkan");
  const peta = A.petaBedaMataUang(data);
  assert.deepEqual([...peta.keys()], [4]);
  assert.ok(A.bedaMataUang(addBedaMu, induk2));
  assert.ok(!A.bedaMataUang(addAktif, induk2));
  assert.ok(!A.bedaMataUang(addAktif, null));
  const r = A.ringkasAddendum(induk2, data);
  assert.equal(r.nilaiEfektif, 250_000_000, "USD 1.000 tidak dijumlahkan ke Rupiah");
  assert.deepEqual(ids(r.bedaMataUang), [12]);
  assert.equal(r.perpanjanganBerjalan.length, 0);
});

// --- ekspor -------------------------------------------------------------------------------------

console.log("lib/ekspor");

await kasus("U19/K02: kolom Kontrak Final (tautan aman) dan Mode Berakhir di CSV, letak kolom lama tetap", () => {
  const judul = X.KOLOM_KONTRAK.map((k) => k.judul);
  assert.equal(judul.indexOf("Nilai Efektif"), 9, "rumus Ringkasan memakai letak kolom lama");
  assert.equal(judul.indexOf("Status"), 11);
  assert.deepEqual(judul.slice(-2), ["Kontrak Final", "Mode Berakhir"]);
  assert.ok(judul.includes("Kode Proyek") && judul.includes("Nomor Referensi"));
  assert.equal(X.tautanAman("https://wki.sharepoint.com/sites/x/Kontrak Final.pdf"), "https://wki.sharepoint.com/sites/x/Kontrak%20Final.pdf");
  assert.equal(X.tautanAman("javascript:alert(1)"), "");
  assert.equal(X.tautanAman("http://contoh.id/a.pdf"), "", "hanya https");
  assert.equal(X.tautanAman('=HYPERLINK("https://x")'), "");
  assert.equal(X.tautanAman('https://x.id/"><script>'), "");
  const final = kontrak({ status: "Berakhir", kontrakFinal: "https://wki.sharepoint.com/a.pdf", modeBerakhir: "Selesai Normal", kodeProyek: "=SUM(A1)", nomorReferensi: "PO-1" });
  const csv = X.susunCsv([final], [final], SEKARANG).split("\r\n");
  const sel = csv[1]!.split(";");
  assert.equal(sel[judul.indexOf("Kontrak Final")], '"https://wki.sharepoint.com/a.pdf"');
  assert.equal(sel[judul.indexOf("Mode Berakhir")], '"Selesai Normal"');
  assert.equal(sel[judul.indexOf("Kode Proyek")], `"'=SUM(A1)"`, "kode proyek berawalan = diloloskan");
  assert.equal(sel[judul.indexOf("Nomor Referensi")], '"PO-1"');
  const kosongan = X.susunCsv([kontrak({})], [], SEKARANG).split("\r\n")[1]!.split(";");
  assert.equal(kosongan[judul.indexOf("Kontrak Final")], '""');
  assert.equal(kosongan[judul.indexOf("Mode Berakhir")], '""');
});

await kasus("Excel: Kontrak Final berupa tautan 'Unduh'; catatan mata uang berbeda di lembar Addendum", async () => {
  const final = kontrak({ id: 50, status: "Aktif", kontrakFinal: "https://wki.sharepoint.com/a.pdf", modeBerakhir: "" });
  const wb = await X.susunBukuKontrak([final, induk2], [final, ...data], { sekarang: SEKARANG });
  const ws = wb.getWorksheet("Kontrak")!;
  const kol = X.KOLOM_KONTRAK.findIndex((k) => k.judul === "Kontrak Final") + 1;
  const baris = [2, 3].find((r) => ws.getRow(r).getCell(1).value === final.nomorPengajuan)!;
  assert.deepEqual(ws.getRow(baris).getCell(kol).value, { text: "Unduh", hyperlink: "https://wki.sharepoint.com/a.pdf" });
  const add = wb.getWorksheet("Addendum")!;
  const kolCatatan = add.getRow(1).values as unknown[];
  const iCatatan = kolCatatan.indexOf("Catatan");
  const catatan = [2, 3, 4, 5].map((r) => String(add.getRow(r).getCell(iCatatan).value ?? "")).filter(Boolean);
  assert.equal(catatan.length, 2, "addendum USD dan EUR (yang ditolak pun dicatat di lembar Addendum)");
  assert.match(catatan[0]!, /Mata uang berbeda dari induk \(IDR\)/);
});

// --- services/kontrak: pemuatan daftar ------------------------------------------------------------

console.log("services/kontrak (pemuatan daftar)");

const G = await import("../src/lib/graph");
const K = await import("../src/services/kontrak");
const LG = await import("../src/lib/langgananKontrak");

interface Panggilan {
  path: string;
  selesai: (items: unknown[]) => void;
  gagal: (err: unknown) => void;
}
const antre: Panggilan[] = [];
g.__graf.graphSemua = (path) =>
  new Promise((selesai, gagal) => {
    antre.push({ path, selesai, gagal });
  });
const tunggu = () => new Promise((r) => setTimeout(r, 0));
const item = (id: number, fields: Record<string, unknown>) => ({ id: String(id), createdDateTime: `2026-09-0${id}T03:00:00Z`, lastModifiedDateTime: "2026-09-20T03:00:00Z", webUrl: `https://x/${id}`, fields });

let jam = SEKARANG;
const asliNow = Date.now;
Date.now = () => jam;

await kasus("arsip: kontrak yang diarsipkan tidak ikut daftar kerja, tetapi muncul di daftar arsip", async () => {
  K.kosongkanCacheKontrak();
  const kerja = K.ambilSemuaKontrak();
  assert.equal(antre.length, 1);
  assert.match(antre[0]!.path, /Diarsipkan/, "kolom Diarsipkan ikut dimuat");
  antre.shift()!.selesai([item(1, { Title: "Aktif biasa", Status: "Aktif" }), item(2, { Title: "Sudah diarsipkan", Status: "Berakhir", Diarsipkan: true }), item(3, { Title: "Kolom kosong", Status: "Diajukan", Diarsipkan: null })]);
  assert.deepEqual((await kerja).map((k) => k.judul).sort(), ["Aktif biasa", "Kolom kosong"], "arsip tidak masuk daftar kerja; kolom kosong dianggap tidak diarsipkan");
  const arsip = await K.ambilKontrakArsip();
  assert.deepEqual(arsip.map((k) => k.judul), ["Sudah diarsipkan"]);
  assert.equal(arsip[0]!.diarsipkan, true);
  K.kosongkanCacheKontrak();
});

await kasus("U39: daftar memakai $select dari konstanta bersama (tanpa kolom JSON detail), permintaan kembar digabung", async () => {
  const a = K.ambilSemuaKontrak();
  const b = K.ambilSemuaKontrak();
  assert.equal(antre.length, 1, "dua pemanggil, satu permintaan");
  const path = antre[0]!.path;
  assert.match(path, /\$expand=fields\(\$select=Diarsipkan,Title,NomorPengajuan,/);
  assert.match(path, /KontrakFinal/);
  assert.match(path, /ModeBerakhir/);
  assert.match(path, /KodeProyek,NomorReferensi/);
  assert.doesNotMatch(path, /ChecklistReview|Persetujuan/);
  assert.match(path, /&\$top=999$/);
  antre.shift()!.selesai([item(1, { Title: "Lama", Status: "Aktif", NilaiKontrak: 5, MataUang: "USD", ModeBerakhir: "Diputus", KontrakFinal: "https://f" }), item(2, { Title: "Baru" })]);
  const [x, y] = await Promise.all([a, b]);
  assert.equal(x, y);
  assert.deepEqual(
    x.map((k) => k.id),
    [2, 1],
    "terbaru dulu",
  );
  const k1 = x[1]!;
  assert.equal(k1.judul, "Lama");
  assert.equal(k1.nilai, 5);
  assert.equal(k1.mataUang, "USD");
  assert.equal(k1.modeBerakhir, "Diputus");
  assert.equal(k1.kontrakFinal, "https://f");
  assert.equal(k1.checklistReview, null);
  assert.equal(k1.persetujuan, null);
  assert.equal(x[0]!.status, "Diajukan", "nilai bawaan tetap sama dengan sebelumnya");
});

await kasus("U39: cache bersama 90 detik; cuplikan untuk useSyncExternalStore stabil dan ikut diperbarui", async () => {
  let kabar = 0;
  const lepas = K.langgananKontrak(() => kabar++);
  const c1 = K.cuplikanKontrak();
  assert.equal(c1.data?.length, 2);
  assert.equal(c1.memuat, false);
  assert.equal(K.cuplikanKontrak(), c1, "objek sama selama tidak berubah");
  jam += 60_000;
  await K.ambilSemuaKontrak();
  assert.equal(antre.length, 0, "masih segar, tidak mengunduh ulang");
  jam += 31_000;
  const p = K.ambilSemuaKontrak();
  assert.equal(antre.length, 1, "basi setelah 90 detik");
  assert.equal(K.cuplikanKontrak().memuat, true);
  assert.equal(K.cuplikanKontrak().data?.length, 2, "data lama tetap tampil selama memuat");
  antre.shift()!.selesai([item(3, { Title: "Tiga" })]);
  await p;
  assert.equal(K.cuplikanKontrak().data?.length, 1);
  assert.equal(K.cuplikanKontrak().waktu, jam);
  assert.ok(kabar >= 2, "pelanggan dikabari saat memuat dan saat data tiba");
  lepas();
});

await kasus("Pengosongan cache dikabarkan ke lib/langgananKontrak; hasil permintaan sebelum penulisan dibuang", async () => {
  let kabar = 0;
  const lepas = LG.dengarCacheKontrak(() => kabar++);
  // Permintaan berjalan, lalu terjadi penulisan: hasil lamanya tidak boleh mengisi cache.
  jam += 100_000;
  const lama = K.ambilSemuaKontrak();
  assert.equal(antre.length, 1);
  K.kosongkanCacheKontrak();
  assert.equal(kabar, 1, "penulisan dikabarkan");
  const baru = K.ambilSemuaKontrak();
  assert.equal(antre.length, 2, "permintaan baru setelah penulisan");
  antre[0]!.selesai([item(4, { Title: "Basi" })]);
  await lama;
  await tunggu();
  assert.notEqual(K.cuplikanKontrak().data?.[0]?.judul, "Basi");
  assert.equal(K.cuplikanKontrak().memuat, true, "masih menunggu permintaan baru");
  antre[1]!.selesai([item(5, { Title: "Segar" })]);
  await baru;
  antre.length = 0;
  assert.equal(K.cuplikanKontrak().data?.[0]?.judul, "Segar");
  // Penyegaran biasa dan penyegaran milik pendengar sendiri tidak dikabarkan sebagai penulisan.
  const s = K.segarkanKontrak();
  assert.equal(antre.length, 1);
  antre.shift()!.selesai([item(5, { Title: "Segar" })]);
  await s;
  LG.tanpaKabar(() => K.kosongkanCacheKontrak());
  assert.equal(kabar, 1);
  lepas();
});

await kasus("Galat tidak disimpan sebagai data; percobaan berikutnya benar-benar mengulang", async () => {
  const p = K.ambilSemuaKontrak();
  antre.shift()!.gagal(new G.GraphError("Server sibuk", 503));
  await assert.rejects(p, /Server sibuk/);
  await tunggu();
  assert.equal((K.cuplikanKontrak().error as Error).message, "Server sibuk");
  assert.equal(K.cuplikanKontrak().data?.[0]?.judul, "Segar", "data terakhir tetap ada");
  const q = K.ambilSemuaKontrak();
  assert.equal(antre.length, 1);
  antre.shift()!.selesai([]);
  await q;
  assert.equal(K.cuplikanKontrak().error, null);
});

await kasus("Graph menolak $select (400): diulang sekali dengan $expand=fields dan diingat untuk sesi ini", async () => {
  K.kosongkanCacheKontrak();
  const p = K.ambilSemuaKontrak();
  const asliWarn = console.warn;
  console.warn = () => undefined;
  antre.shift()!.gagal(new G.GraphError("Column 'ModeBerakhir' does not exist", 400));
  await tunggu();
  assert.equal(antre.length, 1, "diulang tanpa $select");
  assert.match(antre[0]!.path, /\?\$expand=fields&\$top=999$/);
  antre.shift()!.selesai([item(6, { Title: "Tanpa select", ChecklistReview: "{}" })]);
  const hasil = await p;
  console.warn = asliWarn;
  assert.equal(hasil[0]!.judul, "Tanpa select");
  K.kosongkanCacheKontrak();
  const q = K.ambilSemuaKontrak();
  assert.match(antre[0]!.path, /\?\$expand=fields&\$top=999$/, "tidak mencoba $select lagi");
  antre.shift()!.selesai([]);
  await q;
});

await kasus("Detail memuat kolom JSON (ChecklistReview, Persetujuan) dan Deskripsi", async () => {
  let jalur = "";
  g.__graf.graph = async (path) => {
    jalur = path;
    return item(7, { Title: "Detail", Deskripsi: "Lingkup", Persetujuan: JSON.stringify({ versi: 1, items: [] }) });
  };
  const k = await K.ambilKontrak(7);
  assert.equal(k.deskripsi, "Lingkup");
  assert.deepEqual(k.persetujuan, { versi: 1, items: [] });
  // $select sudah ditolak di kasus sebelumnya untuk sesi ini, jadi detail pun memakai $expand=fields.
  assert.match(jalur, /items\/7\?\$expand=fields$/);
});

Date.now = asliNow;
console.log(`\nSemua ${nomor} kasus lulus.`);
