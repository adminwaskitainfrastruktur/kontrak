// Uji lib/draf.ts, lib/serupa.ts, lib/penomoran.ts, lib/beban.ts, dan lib/filterKerja.ts.
// Jalankan: npx --yes tsx scripts/uji-pengajuan.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { Kontrak, Pengguna, Sesi } from "../src/lib/types";

// src/config.ts membaca import.meta.env milik Vite, yang tidak ada di Node. Kait ini menggantinya dengan objek kosong.
const kait = `export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const D = await import("../src/lib/draf");
const S = await import("../src/lib/serupa");
const N = await import("../src/lib/penomoran");
const B = await import("../src/lib/beban");
const F = await import("../src/lib/filterKerja");
const A = await import("../src/lib/antrean");

let nomor = 0;
async function kasus(nama: string, fn: () => void | Promise<void>) {
  await fn();
  nomor++;
  console.log(`  ok ${String(nomor).padStart(2, "0")}  ${nama}`);
}

// --- Data uji --------------------------------------------------------------------------------

const HARI_INI = "2026-10-03";
const SEKARANG = Date.parse("2026-10-03T10:00:00+07:00");
const jamLalu = (j: number) => new Date(SEKARANG - j * 3_600_000).toISOString();
const hariLalu = (h: number) => jamLalu(h * 24);

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
    status: "Diajukan",
    prioritas: "Normal",
    deskripsi: "",
    targetSelesai: null,
    pengajuEmail: "budi@wki.co.id",
    pengajuNama: "Budi",
    picLegalEmail: "",
    picLegalNama: "",
    tanggalDiajukan: hariLalu(5),
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
    dibuat: p.tanggalDiajukan ?? hariLalu(5),
    diubah: hariLalu(1),
    webUrl: "",
    ...p,
  };
}

const rina: Sesi = { email: "rina@wki.co.id", nama: "Rina", peran: "Legal", divisi: "Legal", penggunaId: 1 };
const budi: Sesi = { email: "budi@wki.co.id", nama: "Budi", peran: "Pengaju", divisi: "SCM", penggunaId: 9 };
const sari: Sesi = { email: "sari@wki.co.id", nama: "Sari", peran: "Pengaju", divisi: "Pengadaan", penggunaId: 10 };

const pengguna: Pengguna[] = [
  { id: 1, nama: "Rina", email: "rina@wki.co.id", divisi: "Legal", peran: "Legal", aktif: true },
  { id: 2, nama: "Agus", email: "agus@wki.co.id", divisi: "Legal", peran: "Legal", aktif: true },
  { id: 3, nama: "Dewi", email: "dewi@wki.co.id", divisi: "Legal", peran: "Admin", aktif: true },
  { id: 4, nama: "Tono", email: "tono@wki.co.id", divisi: "IT", peran: "Admin", aktif: true },
  { id: 5, nama: "Lama", email: "lama@wki.co.id", divisi: "Legal", peran: "Legal", aktif: false },
  { id: 9, nama: "Budi", email: "budi@wki.co.id", divisi: "SCM", peran: "Pengaju", aktif: true },
];

console.log("lib/draf");

await kasus("kunciDraf: email dikecilkan, memuat ruang dan sumber; konteks dari URL", () => {
  assert.equal(D.kunciDraf("  Budi@WKI.co.id ", "pengguna", "chat"), "kontrak-draf:v1:pengguna:chat:budi@wki.co.id");
  assert.notEqual(D.kunciDraf("a@b.c", "admin", "chat"), D.kunciDraf("a@b.c", "pengguna", "chat"));
  assert.equal(D.konteksDraf({ induk: 12 }), "induk:12");
  assert.equal(D.konteksDraf({ mou: 4, salin: 9 }), "mou:4");
  assert.equal(D.konteksDraf({}), "");
  assert.ok(D.drafCocok({ konteks: "induk:12" }, "induk:12"));
  assert.ok(!D.drafCocok({ konteks: "induk:12" }, ""));
});

await kasus("bersihkanData: berkas dibuang (nama dikumpulkan), Set jadi array, NaN jadi null, fungsi dibuang", () => {
  const berkas = { name: "draft.docx", size: 10, arrayBuffer: async () => new ArrayBuffer(0) };
  const { data, berkas: nama } = D.bersihkanData({ judul: "A", lampiran: [berkas, berkas], terpilih: new Set(["x", "y"]), nilai: NaN, fn: () => 1, dalam: { file: berkas, ok: true } });
  assert.deepEqual(data, { judul: "A", lampiran: [], terpilih: ["x", "y"], nilai: null, dalam: { ok: true } });
  assert.deepEqual(nama, ["draft.docx"]);
});

await kasus("bungkusDraf + uraiDraf: bolak-balik, rusak/versi lain/kedaluwarsa/masa depan ditolak", () => {
  const d = D.bungkusDraf({ sumber: "chat", data: { judul: "Sewa Crane" }, terjawab: ["jenis", "jenis", "judul"], berkas: ["a.pdf", { name: "b.pdf", size: 1 }], konteks: "induk:3" }, SEKARANG);
  assert.deepEqual(d.terjawab, ["jenis", "judul"]);
  assert.deepEqual(d.berkas, ["a.pdf", "b.pdf"]);
  const balik = D.uraiDraf<{ judul: string }>(JSON.stringify(d), SEKARANG + 3_600_000);
  assert.equal(balik?.data.judul, "Sewa Crane");
  assert.equal(balik?.konteks, "induk:3");
  assert.equal(D.uraiDraf("{rusak", SEKARANG), null);
  assert.equal(D.uraiDraf(null, SEKARANG), null);
  assert.equal(D.uraiDraf(JSON.stringify({ ...d, versi: 99 }), SEKARANG), null);
  assert.equal(D.uraiDraf(JSON.stringify(d), SEKARANG + 8 * 86_400_000), null, "lewat 7 hari");
  assert.ok(D.uraiDraf(JSON.stringify(d), SEKARANG + 7 * 86_400_000 - 1), "tepat sebelum 7 hari masih berlaku");
  assert.equal(D.uraiDraf(JSON.stringify(d), SEKARANG - 5 * 60_000), null, "disimpan di masa depan (jam PC mundur)");
});

await kasus("drafBermakna, teksUmurDraf, teksLampirkanUlang", () => {
  assert.equal(D.drafBermakna({ judul: "   " }), false);
  assert.equal(D.drafBermakna({}), false);
  assert.equal(D.drafBermakna(null), false);
  assert.equal(D.drafBermakna({ nilai: 0 }), true);
  assert.equal(D.drafBermakna({}, ["jenis"]), true);
  assert.equal(D.teksUmurDraf(new Date(SEKARANG - 30_000).toISOString(), SEKARANG), "baru saja");
  assert.equal(D.teksUmurDraf(jamLalu(2), SEKARANG), "2 jam lalu");
  assert.equal(D.teksUmurDraf(jamLalu(25), SEKARANG), "kemarin");
  assert.equal(D.teksUmurDraf(hariLalu(3), SEKARANG), "3 hari lalu");
  assert.equal(D.teksLampirkanUlang([]), "");
  assert.match(D.teksLampirkanUlang(["a.pdf"]), /Lampirkan ulang “a\.pdf”/);
  assert.match(D.teksLampirkanUlang(["1", "2", "3", "4", "5"]), /5 berkas .* dan 2 lainnya/);
});

await kasus("validasiUlangDraf: induk berakhir, MoU tidak aktif, dan induk divisi lain dilepas", () => {
  const induk = k({ id: 1, status: "Berakhir" });
  const mou = k({ id: 2, jenis: "MoU / Nota Kesepahaman", status: "Aktif", divisi: "Pengadaan", pengajuEmail: "x@wki.co.id" });
  const mouLama = k({ id: 3, jenis: "MoU / Nota Kesepahaman", status: "Berakhir" });
  const semua = [induk, mou, mouLama];
  const a = D.validasiUlangDraf({ jenis: "Addendum / Amandemen", kontrakIndukId: 1, mouAcuanId: null }, semua, budi);
  assert.equal(a.data.kontrakIndukId, null);
  assert.deepEqual(a.tanyaUlang, ["induk"]);
  assert.match(a.catatan[0]!, /Berakhir/);
  const b = D.validasiUlangDraf({ jenis: "Sewa", kontrakIndukId: null, mouAcuanId: 3 }, semua, budi);
  assert.equal(b.data.mouAcuanId, null);
  assert.deepEqual(b.tanyaUlang, ["acuan"]);
  const c = D.validasiUlangDraf({ jenis: "Sewa", kontrakIndukId: null, mouAcuanId: 2 }, semua, budi);
  assert.equal(c.data.mouAcuanId, null, "MoU divisi Pengadaan tidak terlihat oleh pengaju SCM");
  const d = D.validasiUlangDraf({ jenis: "Sewa", kontrakIndukId: null, mouAcuanId: 2 }, semua, sari);
  assert.equal(d.data.mouAcuanId, 2);
  assert.deepEqual(d.tanyaUlang, []);
});

await kasus("buatPenyimpanTunda: debounce menulis sekali dengan isi terakhir; null menghapus; batal tidak menulis", async () => {
  const log: string[] = [];
  const p = D.buatPenyimpanTunda<{ judul: string }>("kunci", 15, { simpan: (_k, d) => log.push(`simpan:${d.data.judul}`), hapus: () => log.push("hapus") });
  const draf = (j: string) => D.bungkusDraf({ sumber: "formulir", data: { judul: j } }, SEKARANG);
  p.jadwalkan(draf("a"));
  p.jadwalkan(draf("ab"));
  p.jadwalkan(draf("abc"));
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(log, ["simpan:abc"]);
  p.jadwalkan(null);
  p.segera();
  assert.deepEqual(log, ["simpan:abc", "hapus"]);
  p.jadwalkan(draf("x"));
  p.batal();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(log.length, 2);
  p.segera();
  assert.equal(log.length, 2, "segera tanpa yang tertunda tidak menulis apa pun");
});

console.log("lib/serupa");

await kasus("dariKontrak: hanya jenis, mitra, mata uang, MoU aktif; divisi dari sesi; prioritas Normal", () => {
  const mou = k({ id: 2, jenis: "MoU / Nota Kesepahaman", status: "Aktif" });
  const lama = k({ id: 5, judul: "Sewa Crane 2025", jenis: "Sewa", mataUang: "USD", prioritas: "Mendesak", mouAcuanId: 2, deskripsi: "Crane 50 ton", nilai: 9, divisi: "SCM" });
  const h = S.dariKontrak(lama, { semua: [mou, lama], sesi: budi, tahun: 2026 })!;
  assert.equal(h.data.jenis, "Sewa");
  assert.equal(h.data.mataUang, "USD");
  assert.equal(h.data.prioritas, "Normal");
  assert.equal(h.data.mouAcuanId, 2);
  assert.equal(h.data.salinDari, 5);
  assert.equal(h.data.deskripsi, "Crane 50 ton");
  assert.equal(h.usulanJudul, "Sewa Crane 2026");
  assert.ok(!("nilai" in h.data));
  assert.ok(h.terjawab.includes("acuan") && !h.terjawab.includes("judul" as never));
  const legalSalin = S.dariKontrak(lama, { semua: [mou, lama], sesi: { ...rina, divisi: "IT" }, tahun: 2026 })!;
  assert.equal(legalSalin.data.divisi, "SCM", "divisi sesi di luar daftar pengaju jatuh ke divisi kontrak lama");
});

await kasus("dariKontrak: MoU berakhir tidak disalin, addendum dan kontrak tak terlihat ditolak; param dan pesan", () => {
  const mouLama = k({ id: 2, jenis: "MoU / Nota Kesepahaman", status: "Berakhir" });
  const lama = k({ id: 5, mouAcuanId: 2 });
  const h = S.dariKontrak(lama, { semua: [mouLama, lama], sesi: budi })!;
  assert.equal(h.data.mouAcuanId, null);
  assert.ok(h.catatan.some((c) => /MoU acuan/.test(c)));
  assert.equal(S.dariKontrak(k({ id: 6, jenis: "Addendum / Amandemen", kontrakIndukId: 5 }), { semua: [], sesi: budi }), null);
  assert.equal(S.dariKontrak(k({ id: 7, divisi: "Pengadaan", pengajuEmail: "x@wki.co.id" }), { semua: [], sesi: budi }), null);
  assert.equal(S.dariKontrak(lama, { semua: [], sesi: { ...rina, peran: "Pemantau" } }), null);
  assert.equal(S.bacaParamSalin(new URLSearchParams("salin=12")), 12);
  assert.equal(S.bacaParamSalin(new URLSearchParams("salin=0")), null);
  assert.equal(S.bacaParamSalin(new URLSearchParams("salin=abc")), null);
  assert.equal(S.usulanJudulSerupa("Sewa 2027", 2026), "Sewa 2027", "tahun depan tidak dimundurkan");
  assert.equal(S.pesanDisalinDari({ nomorPengajuan: "KTR-2026-0005", judul: "Sewa" }), "Disalin dari KTR-2026-0005 (Sewa).");
});

console.log("lib/penomoran");

await kasus("usulanNomorKontrak: nomor pertama, lanjut maks+1 per kode dan tahun, abaikan kode/tahun lain", () => {
  const baru = k({ id: 50, jenis: "Pengadaan Barang", status: "Proses Tanda Tangan" });
  assert.equal(N.usulanNomorKontrak(baru, [baru], undefined, { hariIni: HARI_INI }).nomor, "PB/2026/001");
  const semua = [baru, k({ id: 1, nomorKontrak: "PB/2026/007" }), k({ id: 2, nomorKontrak: "pb/2026/012" }), k({ id: 3, nomorKontrak: "PJ/2026/090" }), k({ id: 4, nomorKontrak: "PB/2025/300" }), k({ id: 5, nomorKontrak: "nomor bebas 999" })];
  const u = N.usulanNomorKontrak(baru, semua, undefined, { hariIni: HARI_INI });
  assert.equal(u.nomor, "PB/2026/013");
  assert.equal(u.urut, 13);
  assert.match(u.alasan, /urut 12/);
  assert.equal(N.usulanNomorKontrak({ ...baru, tanggalTandaTangan: "2025-12-30" }, semua).nomor, "PB/2025/301", "tahun ikut tanggal tanda tangan");
  const tanpaReset = { ...N.FORMAT_PENOMORAN_BAWAAN, resetTahunan: false };
  assert.equal(N.usulanNomorKontrak(baru, semua, tanpaReset, { hariIni: HARI_INI }).nomor, "PB/2026/301");
  assert.equal(N.usulanNomorKontrak({ ...baru, id: 1 }, semua, undefined, { hariIni: HARI_INI }).nomor, "PB/2026/013", "nomor milik kontrak itu sendiri dikecualikan dari hitungan");
});

await kasus("usulanNomorKontrak: pola kustom (regex aman, romawi, tahun2, divisi) dan pola tanpa {urut}", () => {
  const f = { ...N.FORMAT_PENOMORAN_BAWAAN, pola: "WKI.{kode}-{urut}/{divisi}/{romawi}/{tahun2}", panjangUrut: 4 };
  const baru = k({ id: 9, jenis: "Sewa", divisi: "Pengadaan" });
  const semua = [baru, k({ id: 1, jenis: "Sewa", nomorKontrak: "WKI.SW-0041/SCM/IX/26" }), k({ id: 2, nomorKontrak: "WKIXSW-9999/SCM/IX/26" })];
  assert.equal(N.usulanNomorKontrak(baru, semua, f, { tanggal: "2026-10-03" }).nomor, "WKI.SW-0042/Pengadaan/X/26");
  const rusak = N.usulanNomorKontrak(baru, semua, { ...f, pola: "{kode}/{tahun}" });
  assert.equal(rusak.nomor, "");
  assert.match(rusak.alasan, /\{urut\}/);
});

await kasus("nomor addendum dari induk; induk tanpa nomor memberi alasan", () => {
  const induk = k({ id: 1, status: "Aktif", nomorKontrak: "PB/2026/007" });
  const add1 = k({ id: 2, jenis: "Addendum / Amandemen", kontrakIndukId: 1, urutanAddendum: 1, status: "Aktif" });
  const add2 = k({ id: 3, jenis: "Addendum / Amandemen", kontrakIndukId: 1, urutanAddendum: null, status: "Proses Tanda Tangan" });
  assert.equal(N.usulanNomorKontrak(add2, [induk, add1, add2]).nomor, "PB/2026/007/ADD-2");
  assert.equal(N.usulanNomorKontrak(add1, [induk, add1]).nomor, "PB/2026/007/ADD-1");
  const tanpa = N.usulanNomorKontrak(add2, [{ ...induk, nomorKontrak: "" }, add2]);
  assert.equal(tanpa.nomor, "");
  assert.match(tanpa.alasan, /belum punya nomor resmi/);
  assert.equal(N.nomorAddendum(" A/1 ", 3), "A/1/ADD-3");
});

await kasus("cekNomorGanda dan peringatanFormatNomor", () => {
  const semua = [k({ id: 1, nomorKontrak: "PB/2026/007" }), k({ id: 2, nomorKontrak: "" })];
  assert.equal(N.cekNomorGanda(" pb/2026/007 ", semua).length, 1);
  assert.equal(N.cekNomorGanda("PB/2026/007", semua, 1).length, 0, "kontrak itu sendiri dikecualikan");
  assert.equal(N.cekNomorGanda("   ", semua).length, 0);
  const pb = { jenis: "Pengadaan Barang" as const, kontrakIndukId: null };
  assert.deepEqual(N.peringatanFormatNomor("PB/2026/008", pb, undefined, { hariIni: HARI_INI }), []);
  assert.deepEqual(N.peringatanFormatNomor("", pb), []);
  assert.ok(N.peringatanFormatNomor("PJ/2026/008", pb, undefined, { hariIni: HARI_INI }).some((x) => /Kode jenis/.test(x)));
  assert.ok(N.peringatanFormatNomor("PB/2019/008", pb, undefined, { hariIni: HARI_INI }).some((x) => /jauh/.test(x)));
  assert.ok(N.peringatanFormatNomor("012/LEG-WKI//2026", pb).some((x) => /pola/.test(x)));
  assert.ok(N.peringatanFormatNomor("PB/2026/008 ", pb, undefined, { hariIni: HARI_INI }).some((x) => /spasi/.test(x)));
  const add = { jenis: "Addendum / Amandemen" as const, kontrakIndukId: 1 };
  assert.ok(N.peringatanFormatNomor("XX/1", add, undefined, { nomorInduk: "PB/2026/007" }).some((x) => /diawali nomor induk/.test(x)));
  assert.ok(N.adalahGalatNomorUnik(new Error("The list item could not be added or updated because duplicate values were found")));
  assert.ok(!N.adalahGalatNomorUnik(new Error("Akses ditolak")));
});

await kasus("validasiFormatPenomoran: tolak tanpa {urut}, kode aneh diabaikan", () => {
  assert.equal(N.validasiFormatPenomoran({ pola: "{kode}/{tahun}" }).ok, false);
  assert.equal(N.validasiFormatPenomoran(null).ok, false);
  const v = N.validasiFormatPenomoran({ pola: " {urut}/{kode} ", kodeJenis: { Sewa: "SWA", Lainnya: "salah kode!" }, panjangUrut: 99 });
  assert.ok(v.ok);
  if (v.ok) {
    assert.equal(v.nilai.pola, "{urut}/{kode}");
    assert.equal(v.nilai.kodeJenis.Sewa, "SWA");
    assert.equal(v.nilai.kodeJenis.Lainnya, "LN");
    assert.equal(v.nilai.panjangUrut, 3);
    assert.equal(v.nilai.resetTahunan, true);
  }
});

console.log("lib/beban");

const kontrakBeban = [
  k({ id: 1, status: "Review Legal", picLegalEmail: "Rina@wki.co.id", statusSejak: hariLalu(3) }),
  k({ id: 2, status: "Proses Tanda Tangan", picLegalEmail: "rina@wki.co.id", statusSejak: hariLalu(9) }),
  k({ id: 3, status: "Review Legal", picLegalEmail: "agus@wki.co.id", statusSejak: hariLalu(1) }),
  k({ id: 4, status: "Perlu Revisi", picLegalEmail: "agus@wki.co.id" }),
  k({ id: 5, status: "Aktif", picLegalEmail: "agus@wki.co.id" }),
  k({ id: 6, status: "Review Legal", picLegalEmail: "lama@wki.co.id", picLegalNama: "Lama" }),
  k({ id: 7, status: "Diajukan" }),
];

await kasus("bebanTim: hanya Review/TTD dihitung, staf nonaktif yang masih memegang ikut tampil, Admin IT dan Pengaju tidak", () => {
  const b = B.bebanTim(pengguna, kontrakBeban);
  const peta = new Map(b.map((x) => [x.email, x]));
  assert.deepEqual([...peta.keys()].sort(), ["agus@wki.co.id", "dewi@wki.co.id", "lama@wki.co.id", "rina@wki.co.id"]);
  assert.equal(peta.get("rina@wki.co.id")!.total, 2);
  assert.equal(peta.get("rina@wki.co.id")!.terlama!.id, 2);
  assert.equal(peta.get("agus@wki.co.id")!.total, 1, "Perlu Revisi dan Aktif tidak dihitung");
  assert.equal(peta.get("agus@wki.co.id")!.dipegang.length, 2, "tetapi Perlu Revisi ikut dialihkan saat alih semua");
  assert.equal(peta.get("lama@wki.co.id")!.aktif, false);
  assert.equal(peta.get("dewi@wki.co.id")!.total, 0);
  assert.equal(b[b.length - 1]!.email, "lama@wki.co.id", "staf nonaktif di bawah");
  assert.equal(B.labelBeban(peta.get("rina@wki.co.id")!), "1 review · 1 TTD");
  assert.equal(B.labelBeban(peta.get("dewi@wki.co.id")!), "Kosong");
  assert.deepEqual(B.kontrakDipegang("AGUS@wki.co.id", kontrakBeban).map((x) => x.id).sort(), [3, 4]);
  assert.deepEqual(B.kontrakDipegang("", kontrakBeban), []);
});

await kasus("saranPic: terendah; seri dengan diri sendiri memilih orang lain; diri sendiri hanya bila paling ringan", () => {
  const b = B.bebanTim(pengguna, kontrakBeban);
  const s1 = B.saranPic(b, { sesiEmail: "rina@wki.co.id" })!;
  assert.equal(s1.staf.email, "dewi@wki.co.id");
  assert.match(s1.alasan, /tidak memegang/);
  const s2 = B.saranPic(b, { sesiEmail: "dewi@wki.co.id" })!;
  assert.equal(s2.staf.email, "dewi@wki.co.id", "Dewi benar-benar paling ringan (0 vs 1)");
  assert.match(s2.alasan, /Beban Anda paling ringan/);
  const seri = B.bebanTim(pengguna, [...kontrakBeban, k({ id: 8, status: "Review Legal", picLegalEmail: "dewi@wki.co.id" })]);
  const s3 = B.saranPic(seri, { sesiEmail: "dewi@wki.co.id" })!;
  assert.equal(s3.staf.email, "agus@wki.co.id", "seri 1-1: orang lain didahulukan daripada diri sendiri");
  const s4 = B.saranPic(b, { kecuali: ["dewi@wki.co.id"] })!;
  assert.equal(s4.staf.email, "agus@wki.co.id", "PIC sekarang tidak diusulkan lagi");
  assert.equal(B.saranPic(b.filter((x) => x.email === "rina@wki.co.id"), { sesiEmail: "rina@wki.co.id" })!.alasan, "Hanya Anda staf Legal aktif yang tersedia saat ini.");
  assert.equal(B.saranPic([], {}), null);
  assert.equal(B.saranPic(b.filter((x) => !x.aktif)), null, "staf nonaktif tidak pernah diusulkan");
});

await kasus("pesan dan detail penugasan lama ke baru", () => {
  assert.equal(B.pesanPenugasan({ email: "", nama: "" }, { nama: "Agus" }, "", "Rina"), "Agus ditugaskan sebagai PIC Legal oleh Rina.");
  assert.equal(B.pesanPenugasan({ email: "a@x", nama: "Agus" }, { nama: "Dewi" }, " cuti ", "Rina"), "PIC Legal dialihkan dari Agus ke Dewi oleh Rina. Alasan: cuti");
  assert.deepEqual(B.detailPenugasan({ email: "", nama: "" }, { email: "d@x", nama: "Dewi" }), [{ kolom: "PIC Legal", dari: "(belum ada)", ke: "Dewi <d@x>" }]);
});

await kasus("jalankanBertahap: paling banyak 3 bersamaan, galat tidak menghentikan yang lain, kemajuan terhitung", async () => {
  let jalan = 0;
  let puncak = 0;
  const kemajuan: number[] = [];
  const h = await B.jalankanBertahap(
    [1, 2, 3, 4, 5, 6, 7],
    async (n) => {
      jalan++;
      puncak = Math.max(puncak, jalan);
      await new Promise((r) => setTimeout(r, 5 + (n % 3) * 3));
      jalan--;
      if (n % 3 === 0) throw new Error(`gagal ${n}`);
    },
    { konkurensi: 3, kemajuan: (s) => kemajuan.push(s) },
  );
  assert.equal(puncak, 3);
  assert.deepEqual(h.berhasil.sort(), [1, 2, 4, 5, 7]);
  assert.deepEqual(h.gagal.map((g) => g.item).sort(), [3, 6]);
  assert.deepEqual(kemajuan, [1, 2, 3, 4, 5, 6, 7]);
  const kosong = await B.jalankanBertahap([], async () => undefined);
  assert.deepEqual(kosong, { berhasil: [], gagal: [] });
});

console.log("lib/filterKerja");

const ctxRina = (semua: Kontrak[]) => ({ sesi: rina, semua, hariIni: HARI_INI, sekarang: SEKARANG });

await kasus("urutKerjaLegal: Diajukan persis antreanLegal, lalu Review/TTD menurut target-prioritas-umur, lalu Perlu Revisi, lalu lainnya", () => {
  const data = [
    k({ id: 1, status: "Diajukan", prioritas: "Normal", tanggalDiajukan: hariLalu(4), targetSelesai: "2026-10-01" }),
    k({ id: 2, status: "Diajukan", prioritas: "Mendesak", tanggalDiajukan: hariLalu(1) }),
    k({ id: 3, status: "Diajukan", prioritas: "Normal", tanggalDiajukan: hariLalu(6) }),
    k({ id: 4, status: "Review Legal", prioritas: "Normal", targetSelesai: "2026-10-01", statusSejak: hariLalu(1) }),
    k({ id: 5, status: "Review Legal", prioritas: "Mendesak", statusSejak: hariLalu(1) }),
    k({ id: 6, status: "Proses Tanda Tangan", prioritas: "Normal", statusSejak: hariLalu(10) }),
    k({ id: 7, status: "Review Legal", prioritas: "Tinggi", targetSelesai: "2026-10-08", statusSejak: hariLalu(2) }),
    k({ id: 8, status: "Perlu Revisi", prioritas: "Mendesak" }),
    k({ id: 9, status: "Aktif" }),
    k({ id: 10, status: "Review Legal", divisi: "Pengadaan", pengajuEmail: "x@wki.co.id" }),
  ];
  const urut = F.urutKerjaLegal(data, rina, { hariIni: HARI_INI }).map((x) => x.id);
  assert.deepEqual(urut.slice(0, 3), A.antreanLegal(data).map((x) => x.id), "nomor antrean pengaju tidak berubah");
  assert.deepEqual(urut.slice(0, 3), [2, 3, 1], "target dekat tidak melompati antrean Diajukan");
  assert.deepEqual(urut.slice(3), [4, 7, 5, 6, 10, 8, 9]);
  const pengaju = F.urutKerjaLegal(data, budi, { hariIni: HARI_INI });
  assert.ok(!pengaju.some((x) => x.id === 10), "kontrak divisi lain tidak terlihat oleh pengaju");
});

await kasus("bacaFilterKerja/tulisFilterKerja: bolak-balik, nilai aneh diabaikan, parameter lain dipertahankan", () => {
  const f = F.bacaFilterKerja(new URLSearchParams("tindakan=saya&pic=AGUS@wki.co.id&prioritas=mendesak,Tinggi,aneh,tinggi&berakhir=90&urut=kerja&sla=target&q=crane"));
  assert.deepEqual(f, { tindakan: true, pic: "agus@wki.co.id", prioritas: ["Tinggi", "Mendesak"], berakhir: 90, urut: "kerja", sla: "target" });
  const p = F.tulisFilterKerja(f, new URLSearchParams("q=crane&status=Aktif&pic=lama"));
  assert.equal(p.get("q"), "crane");
  assert.equal(p.get("status"), "Aktif");
  assert.equal(p.get("prioritas"), "Tinggi,Mendesak", "urutan baku (urutan PRIORITAS) supaya URL stabil");
  assert.deepEqual(F.bacaFilterKerja(p), f);
  const aneh = F.bacaFilterKerja(new URLSearchParams("tindakan=ya&pic=bukan-email&berakhir=-5&urut=acak&sla=merah"));
  assert.deepEqual(aneh, { tindakan: false, pic: null, prioritas: [], berakhir: null, urut: null, sla: null });
  assert.ok(F.filterKerjaKosong(aneh));
  assert.equal(F.bacaFilterKerja(new URLSearchParams("berakhir=lewat")).berakhir, "lewat");
  assert.equal(F.tulisFilterKerja({}).toString(), "");
});

const dataMasa = [
  k({ id: 1, status: "Aktif", tanggalBerakhir: "2026-09-30" }), // lewat 3 hari
  k({ id: 2, status: "Aktif", tanggalBerakhir: "2026-08-01" }), // induk lewat, tetapi diperpanjang addendum aktif
  k({ id: 3, jenis: "Addendum / Amandemen", kontrakIndukId: 2, status: "Aktif", tanggalBerakhir: "2026-11-30" }),
  k({ id: 4, status: "Aktif", tanggalBerakhir: HARI_INI }), // berakhir hari ini: masih "akan berakhir", bukan lewat
  k({ id: 5, status: "Aktif", tanggalBerakhir: "2027-01-01" }), // tepat 90 hari
  k({ id: 6, status: "Aktif", tanggalBerakhir: "2027-01-02" }), // 91 hari
  k({ id: 7, status: "Berakhir", tanggalBerakhir: "2026-01-01" }),
  k({ id: 8, status: "Aktif", tanggalBerakhir: null }),
];

await kasus("Lewat masa berlaku terpisah dari Akan berakhir, memakai berakhir efektif dari addendum (tepi 0 dan 90 hari)", () => {
  const ctx = ctxRina(dataMasa);
  const lewat = F.saringKerja(dataMasa, F.filterPreset("lewat-masa"), ctx).map((x) => x.id);
  const akan = F.saringKerja(dataMasa, F.filterPreset("akan-berakhir"), ctx).map((x) => x.id).sort();
  assert.deepEqual(lewat, [1]);
  assert.deepEqual(akan, [2, 4, 5], "induk 2 diperpanjang addendum sampai 30 Nov; addendum 3 tidak tampil sendiri");
  assert.equal(F.tanggalBerakhirEfektif(dataMasa[1]!, dataMasa), "2026-11-30");
  assert.equal(F.tanggalBerakhirEfektif(dataMasa[2]!, dataMasa), "2026-11-30");
});

await kasus("hitungPreset sama persis dengan panjang saringKerja untuk setiap preset (angka chip = isi daftar)", () => {
  const data = [
    ...dataMasa,
    k({ id: 20, status: "Diajukan" }),
    k({ id: 21, status: "Diajukan", picLegalEmail: "agus@wki.co.id" }),
    k({ id: 22, status: "Review Legal", picLegalEmail: "rina@wki.co.id", targetSelesai: "2026-10-01" }),
    k({ id: 23, status: "Review Legal", targetSelesai: "2026-10-10" }),
    k({ id: 24, status: "Perlu Revisi", targetSelesai: "2026-09-01" }),
    k({ id: 25, status: "Aktif", targetSelesai: "2026-09-01", tanggalBerakhir: "2027-06-01" }),
  ];
  for (const sesi of [rina, budi]) {
    const ctx = { sesi, semua: data, hariIni: HARI_INI, sekarang: SEKARANG };
    const hitung = F.hitungPreset(data, ctx);
    for (const id of F.ID_PRESET) assert.equal(hitung[id], F.saringKerja(data, F.filterPreset(id), ctx).length, `${sesi.nama}:${id}`);
  }
  const h = F.hitungPreset(data, ctxRina(data));
  assert.equal(h["tanpa-pic"], 3, "20, 23, 24: kontrak Aktif tanpa PIC tidak dihitung");
  assert.equal(h["lewat-target"], 2, "22 dan 24; kontrak Aktif dengan target lama tidak dihitung");
  assert.equal(h["antrean-saya"], 3, "20 dan 23 (tanpa PIC), 22 (milik Rina); 21 sudah ditugaskan ke Agus sehingga tidak dihitung (lib/alur butuhTindakan)");
});

await kasus("sla=lewat hanya tahap milik Legal (Perlu Revisi tidak pernah merah); sla=hampir; level bisa ditimpa", () => {
  const data = [
    k({ id: 1, status: "Review Legal", statusSejak: hariLalu(10) }),
    k({ id: 2, status: "Perlu Revisi", statusSejak: hariLalu(30) }),
    k({ id: 3, status: "Review Legal", statusSejak: hariLalu(6) }),
    k({ id: 4, status: "Review Legal", statusSejak: hariLalu(1) }),
    k({ id: 5, status: "Aktif", statusSejak: hariLalu(100) }),
  ];
  const ctx = ctxRina(data);
  assert.deepEqual(F.saringKerja(data, { ...F.FILTER_KERJA_KOSONG, sla: "lewat" }, ctx).map((x) => x.id), [1]);
  assert.deepEqual(F.saringKerja(data, { ...F.FILTER_KERJA_KOSONG, sla: "hampir" }, ctx).map((x) => x.id), [3]);
  const ketat = F.saringKerja(data, { ...F.FILTER_KERJA_KOSONG, sla: "lewat" }, { ...ctx, level: (x: Kontrak) => (x.status === "Aktif" ? "tidak-berlaku" : "lewat") });
  assert.deepEqual(ketat.map((x) => x.id), [1, 3, 4], "level dari Pengaturan dipakai, Perlu Revisi tetap dikecualikan");
});

await kasus("presetAktif dan alihPreset: pasang, lepas, buang status, pertahankan q; kueriPreset", () => {
  const awal = new URLSearchParams("q=crane&status=Aktif&pic=kosong");
  const p1 = F.alihPreset(awal, "lewat-masa");
  assert.equal(p1.get("berakhir"), "lewat");
  assert.equal(p1.get("pic"), null);
  assert.equal(p1.get("status"), null);
  assert.equal(p1.get("q"), "crane");
  assert.equal(F.presetAktif(p1), "lewat-masa");
  const p2 = F.alihPreset(p1, "lewat-masa");
  assert.equal(F.presetAktif(p2), null);
  assert.equal(p2.get("q"), "crane");
  assert.equal(F.presetAktif(new URLSearchParams("tindakan=saya")), "antrean-saya", "urut tidak wajib untuk mengenali preset");
  assert.equal(F.presetAktif(new URLSearchParams("tindakan=saya&pic=kosong")), null, "kombinasi bukan preset");
  assert.equal(F.kueriPreset("tanpa-pic"), "?pic=kosong&urut=kerja");
  assert.deepEqual(F.ringkasFilterKerja(F.filterPreset("akan-berakhir")), ["berakhir dalam 90 hari"]);
});

await kasus("filter pic=saya/email/kosong dan prioritas; urutkanKerja menurut ?urut", () => {
  const data = [
    k({ id: 1, status: "Review Legal", picLegalEmail: "RINA@wki.co.id", prioritas: "Tinggi", tanggalDiajukan: hariLalu(2), targetSelesai: "2026-10-20" }),
    k({ id: 2, status: "Review Legal", picLegalEmail: "agus@wki.co.id", prioritas: "Mendesak", tanggalDiajukan: hariLalu(9), targetSelesai: "2026-10-05" }),
    k({ id: 3, status: "Diajukan", prioritas: "Normal", tanggalDiajukan: hariLalu(1) }),
  ];
  const ctx = ctxRina(data);
  const ids = (f: Partial<typeof F.FILTER_KERJA_KOSONG>) => F.saringKerja(data, { ...F.FILTER_KERJA_KOSONG, ...f }, ctx).map((x) => x.id);
  assert.deepEqual(ids({ pic: "saya" }), [1]);
  assert.deepEqual(ids({ pic: "agus@wki.co.id" }), [2]);
  assert.deepEqual(ids({ pic: "kosong" }), [3]);
  assert.deepEqual(ids({ prioritas: ["Mendesak", "Tinggi"] }), [1, 2]);
  assert.deepEqual(ids({ urut: "masuk" }), [2, 1, 3]);
  assert.deepEqual(ids({ urut: "target" }), [2, 1, 3]);
  assert.deepEqual(ids({ urut: "prioritas" }), [2, 1, 3]);
  assert.deepEqual(ids({ urut: "terbaru" }), [3, 1, 2]);
});

await kasus("bisaAkhiriMassal: hanya Aktif non-addendum yang lewat masa berlaku; addendum Aktif induk ikut", () => {
  const [lewat, diperpanjang, add, hariIniBerakhir] = dataMasa;
  assert.deepEqual(F.bisaAkhiriMassal([lewat!], dataMasa, HARI_INI), { boleh: true, alasan: "" });
  assert.equal(F.bisaAkhiriMassal([], dataMasa, HARI_INI).boleh, false);
  assert.match(F.bisaAkhiriMassal([lewat!, add!], dataMasa, HARI_INI).alasan, /addendum ikut berakhir/);
  assert.match(F.bisaAkhiriMassal([diperpanjang!], dataMasa, HARI_INI).alasan, /belum lewat/);
  assert.match(F.bisaAkhiriMassal([hariIniBerakhir!], dataMasa, HARI_INI).alasan, /belum lewat/, "berakhir hari ini belum lewat");
  assert.match(F.bisaAkhiriMassal([dataMasa[6]!], dataMasa, HARI_INI).alasan, /berstatus Berakhir/);
  assert.match(F.bisaAkhiriMassal([dataMasa[7]!], dataMasa, HARI_INI).alasan, /belum punya tanggal/);
  const induk = k({ id: 30, status: "Aktif", tanggalBerakhir: "2026-01-01" });
  const a1 = k({ id: 31, jenis: "Addendum / Amandemen", kontrakIndukId: 30, status: "Aktif", urutanAddendum: 2, tanggalBerakhir: "2026-06-01" });
  const a2 = k({ id: 32, jenis: "Addendum / Amandemen", kontrakIndukId: 30, status: "Aktif", urutanAddendum: 1, tanggalBerakhir: "2026-03-01" });
  const a3 = k({ id: 33, jenis: "Addendum / Amandemen", kontrakIndukId: 30, status: "Dibatalkan", urutanAddendum: 3 });
  assert.deepEqual(F.addendumAktifInduk(induk, [induk, a1, a2, a3]).map((x) => x.id), [32, 31]);
  assert.equal(F.bisaAkhiriMassal([induk], [induk, a1, a2, a3], HARI_INI).boleh, true, "efektif 1 Jun 2026 sudah lewat");
});

console.log(`\nSemua ${nomor} kasus lulus.`);
