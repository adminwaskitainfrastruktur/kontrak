// Uji lonceng "Untuk Anda" Ruang Admin (U26): lib/kabarAdmin.ts.
// Jalankan: npx --yes tsx scripts/uji-untuk-anda.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { Kontrak, Sesi } from "../src/lib/types";
import type { AktivitasRingkas, SimpananAdmin } from "../src/lib/kabarAdmin";

// src/config.ts membaca import.meta.env milik Vite, yang tidak ada di Node. Kait ini menggantinya dengan objek kosong.
const kait = `export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const KA = await import("../src/lib/kabarAdmin");

let nomor = 0;
async function kasus(nama: string, fn: () => void | Promise<void>) {
  await fn();
  nomor++;
  console.log(`  ok ${String(nomor).padStart(2, "0")}  ${nama}`);
}

const SEKARANG = Date.parse("2026-10-03T10:00:00+07:00");
const menitLalu = (m: number) => new Date(SEKARANG - m * 60_000).toISOString();
const WAKTU = new Date(SEKARANG).toISOString();

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
    tanggalMulai: null,
    tanggalBerakhir: null,
    status: "Diajukan",
    prioritas: "Normal",
    deskripsi: "",
    targetSelesai: null,
    pengajuEmail: "budi@wki.co.id",
    pengajuNama: "Budi",
    picLegalEmail: "",
    picLegalNama: "",
    tanggalDiajukan: menitLalu(600),
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
    dibuat: p.tanggalDiajukan ?? menitLalu(600),
    diubah: menitLalu(60),
    webUrl: "",
    ...p,
  };
}

const rina: Sesi = { email: "rina@wki.co.id", nama: "Rina", peran: "Legal", divisi: "Legal", penggunaId: 1 };
const RINA = "rina@wki.co.id";

function simpanan(kontrak: Kontrak[], o: Partial<SimpananAdmin> = {}): SimpananAdmin {
  return { waktu: menitLalu(30), jejak: KA.buatJejakAdmin(kontrak, rina), kabar: [], aktivitasId: 100, aktivitasSejak: menitLalu(30), ...o };
}

function akt(p: Partial<AktivitasRingkas> & { id: number; kontrakId: number }): AktivitasRingkas {
  return { jenis: "Komentar", pesan: "Mohon dicek", olehEmail: "budi@wki.co.id", olehNama: "Budi", waktu: menitLalu(5), disebut: [], ...p };
}

console.log("lib/kabarAdmin");

await kasus("kunjungan pertama (belum ada simpanan) tidak membanjiri kabar", () => {
  assert.deepEqual(KA.bandingkanAdmin(null, [k({ id: 1, tanggalDiajukan: menitLalu(1) })], rina, { waktu: WAKTU, aktivitas: null }), []);
});

await kasus("jejak hanya untuk kontrak yang diproses atau dipegang saya", () => {
  const jejak = KA.buatJejakAdmin([k({ id: 1 }), k({ id: 2, status: "Aktif" }), k({ id: 3, status: "Aktif", picLegalEmail: "RINA@wki.co.id" }), k({ id: 4, status: "Ditolak", picLegalEmail: "agus@wki.co.id" })], rina);
  assert.deepEqual(Object.keys(jejak).sort(), ["1", "3"]);
  assert.equal(jejak["3"]!.pic, RINA);
});

await kasus("pengajuan baru tanpa PIC = 'baru'; langsung ke saya = 'tugas'; pengajuan sendiri dan yang lama tidak", () => {
  const lama = simpanan([]);
  const kontrak = [
    k({ id: 1, tanggalDiajukan: menitLalu(10) }),
    k({ id: 2, tanggalDiajukan: menitLalu(10), picLegalEmail: RINA }),
    k({ id: 3, tanggalDiajukan: menitLalu(10), pengajuEmail: RINA }),
    k({ id: 4, tanggalDiajukan: menitLalu(600) }),
    k({ id: 5, tanggalDiajukan: menitLalu(10), picLegalEmail: "agus@wki.co.id" }),
  ];
  const kabar = KA.bandingkanAdmin(lama, kontrak, rina, { waktu: WAKTU, aktivitas: [] });
  assert.deepEqual(kabar.map((x) => `${x.kontrakId}:${x.jenis}`).sort(), ["1:baru", "2:tugas"]);
  assert.match(kabar.find((x) => x.kontrakId === 1)!.teks, /Pengajuan baru dari Budi \(SCM\)/);
});

await kasus("ditugaskan kepada saya dan dialihkan dari saya oleh orang lain", () => {
  const awal = [k({ id: 1, status: "Review Legal", picLegalEmail: "agus@wki.co.id" }), k({ id: 2, status: "Review Legal", picLegalEmail: RINA })];
  const lama = simpanan(awal);
  const kini = [k({ id: 1, status: "Review Legal", picLegalEmail: RINA }), k({ id: 2, status: "Review Legal", picLegalEmail: "agus@wki.co.id", picLegalNama: "Agus" })];
  const kabar = KA.bandingkanAdmin(lama, kini, rina, { waktu: WAKTU, aktivitas: [] });
  assert.deepEqual(kabar.map((x) => `${x.kontrakId}:${x.jenis}`).sort(), ["1:tugas", "2:alih"]);
  assert.match(kabar.find((x) => x.jenis === "alih")!.teks, /Dialihkan dari Anda ke Agus/);
});

await kasus("perubahan status kontrak yang saya pegang oleh orang lain; tidak untuk kontrak orang lain", () => {
  const awal = [k({ id: 1, status: "Perlu Revisi", picLegalEmail: RINA }), k({ id: 2, status: "Perlu Revisi", picLegalEmail: "agus@wki.co.id" })];
  const lama = simpanan(awal);
  const kini = [k({ id: 1, status: "Review Legal", picLegalEmail: RINA }), k({ id: 2, status: "Review Legal", picLegalEmail: "agus@wki.co.id" })];
  const kabar = KA.bandingkanAdmin(lama, kini, rina, { waktu: WAKTU, aktivitas: [] });
  assert.equal(kabar.length, 1);
  assert.equal(kabar[0]!.jenis, "status");
  assert.match(kabar[0]!.teks, /mengirim ulang revisi/);
});

await kasus("perubahan oleh diri sendiri disaring: lewat aktivitas saya, atau tulisSendiri bila umpan tidak tersedia", () => {
  const awal = [k({ id: 1, status: "Review Legal", picLegalEmail: RINA })];
  const lama = simpanan(awal);
  const kini = [k({ id: 1, status: "Proses Tanda Tangan", picLegalEmail: RINA })];
  const olehSaya = [akt({ id: 101, kontrakId: 1, jenis: "Status", olehEmail: RINA })];
  assert.deepEqual(KA.bandingkanAdmin(lama, kini, rina, { waktu: WAKTU, aktivitas: olehSaya }), []);
  assert.deepEqual(KA.bandingkanAdmin(lama, kini, rina, { waktu: WAKTU, aktivitas: null, tulisSendiri: true }), []);
  // Umpan tidak tersedia dan bukan aksi di tab ini: dianggap perubahan orang lain.
  assert.equal(KA.bandingkanAdmin(lama, kini, rina, { waktu: WAKTU, aktivitas: null }).length, 1);
});

await kasus("komentar, sebutan, dokumen, dan pengingat dari umpan aktivitas", () => {
  const kontrak = [k({ id: 1, status: "Review Legal", picLegalEmail: RINA }), k({ id: 2, status: "Review Legal", picLegalEmail: "agus@wki.co.id" })];
  const lama = simpanan(kontrak);
  const aktivitas = [
    akt({ id: 101, kontrakId: 1, jenis: "Komentar", pesan: "Draft  sudah\nsaya revisi" }),
    akt({ id: 102, kontrakId: 2, jenis: "Komentar", pesan: "@Rina tolong bantu", disebut: [RINA] }),
    akt({ id: 103, kontrakId: 1, jenis: "Dokumen", pesan: "Mengunggah Draft Kontrak v2.docx" }),
    akt({ id: 104, kontrakId: 1, jenis: "Pengingat", pesan: "Mohon kabar" }),
    akt({ id: 105, kontrakId: 2, jenis: "Komentar", pesan: "Untuk Agus saja" }),
    akt({ id: 106, kontrakId: 1, jenis: "Komentar", pesan: "Komentar saya sendiri", olehEmail: RINA }),
    akt({ id: 99, kontrakId: 1, jenis: "Komentar", pesan: "Sudah pernah diperiksa" }),
  ];
  const kabar = KA.bandingkanAdmin(lama, kontrak, rina, { waktu: WAKTU, aktivitas });
  assert.deepEqual(kabar.map((x) => `${x.kontrakId}:${x.jenis}`).sort(), ["1:dokumen", "1:komentar", "1:pengingat", "2:sebut"]);
  assert.match(kabar.find((x) => x.jenis === "komentar")!.teks, /Budi berkomentar: “Draft sudah saya revisi”/);
});

await kasus("gabungKabar: tanpa duplikat id, terbaru dulu, dibatasi jumlahnya", () => {
  const dasar = { kontrakId: 1, judul: "A", nomor: "N", teks: "t", nada: "info" as const, dibaca: false };
  const lama = [{ ...dasar, id: "a", waktu: menitLalu(30) }, { ...dasar, id: "b", waktu: menitLalu(20) }];
  const baru = [{ ...dasar, id: "b", waktu: menitLalu(20) }, { ...dasar, id: "c", waktu: menitLalu(1) }];
  assert.deepEqual(KA.gabungKabar(baru, lama).map((x) => x.id), ["c", "b", "a"]);
  assert.deepEqual(KA.gabungKabar(baru, lama, 2).map((x) => x.id), ["c", "b"]);
});

await kasus("aktivitasIdTerakhir: maksimum lama dan umpan; umpan kosong mempertahankan nilai lama", () => {
  assert.equal(KA.aktivitasIdTerakhir(100, [akt({ id: 120, kontrakId: 1 }), akt({ id: 105, kontrakId: 1 })]), 120);
  assert.equal(KA.aktivitasIdTerakhir(100, []), 100);
  assert.equal(KA.aktivitasIdTerakhir(null, null), null);
  assert.equal(KA.aktivitasIdTerakhir(null, [akt({ id: 7, kontrakId: 1 })]), 7);
});

console.log(`\nSemua ${nomor} kasus lulus.`);
