// Uji aturan tanda tangan digital kontrak: lib/penandatangan.ts (status, giliran, hak aksi, validasi).
// Jalankan: npx --yes tsx scripts/uji-penandatangan.ts
import assert from "node:assert/strict";
import {
  bahanJejak, bolehAksi, langkahUntukSaya, menungguSaya, periksaPenandatangan, ringkasPermintaan, sedangGiliran,
  statusPermintaan, susunPenandatangan, tahapan, type PermintaanTtd, type MasukanPenandatangan,
} from "../src/lib/penandatangan";

let n = 0;
const ok = (nama: string, fn: () => void) => { fn(); n++; console.log(`  ok  ${nama}`); };

const orang = (nama: string, email: string, luar = false): MasukanPenandatangan => ({ nama, jabatan: "J", peran: `Peran ${nama}`, email, luar });
const buat = (berurutan: boolean, m: MasukanPenandatangan[]): PermintaanTtd => ({
  itemId: 1, kontrakId: 7, nomor: "KTR-2026-0007", dibuatOleh: "Legal A", dibuatEmail: "legal@waskitainfrastruktur.co.id", waktuDibuat: "2026-10-16T01:00:00Z",
  isi: { v: 1, dokumen: { id: "d", nama: "k.pdf", ukuran: 1, sha256: "ab" }, berurutan, penandatangan: susunPenandatangan(m) },
});
const tandai = (p: PermintaanTtd, id: string): PermintaanTtd => ({
  ...p, isi: { ...p.isi, penandatangan: p.isi.penandatangan.map((x) => (x.id === id ? { ...x, waktu: "2026-10-16T02:00:00Z", oleh: x.nama } : x)) },
});

const A = "a@waskitainfrastruktur.co.id", B = "b@waskitainfrastruktur.co.id";
const legal = { email: "legal@waskitainfrastruktur.co.id", legal: true };

console.log("status");
ok("menunggu → sebagian → selesai", () => {
  let p = buat(false, [orang("A", A), orang("B", B)]);
  assert.equal(statusPermintaan(p.isi), "Menunggu");
  p = tandai(p, "p1");
  assert.equal(statusPermintaan(p.isi), "Sebagian");
  p = tandai(p, "p2");
  assert.equal(statusPermintaan(p.isi), "Selesai");
  assert.equal(ringkasPermintaan(p.isi).teks, "2 dari 2 sudah menandatangani");
});
ok("pindaian basah menyelesaikan; batal/tolak menang", () => {
  const p = buat(false, [orang("A", A)]);
  assert.equal(statusPermintaan({ ...p.isi, berkasScan: "x" }), "Selesai");
  assert.equal(statusPermintaan({ ...p.isi, tolak: { waktu: "t", oleh: "A", alasan: "salah" } }), "Ditolak");
  assert.equal(statusPermintaan({ ...p.isi, tolak: { waktu: "t", oleh: "A", alasan: "s" }, batal: { waktu: "t", oleh: "L", alasan: "x" } }), "Dibatalkan");
  assert.equal(statusPermintaan({ ...p.isi, berkasScan: "x", batal: { waktu: "t", oleh: "L", alasan: "x" } }), "Dibatalkan");
});
ok("daftar kosong tidak pernah selesai", () => {
  const p = buat(false, []);
  assert.equal(statusPermintaan(p.isi), "Menunggu");
});

console.log("giliran");
ok("bersamaan: semua yang belum; berurutan: satu per satu", () => {
  const sama = buat(false, [orang("A", A), orang("B", B)]);
  assert.deepEqual(sedangGiliran(sama.isi).map((x) => x.id), ["p1", "p2"]);
  const urut = buat(true, [orang("A", A), orang("B", B)]);
  assert.deepEqual(sedangGiliran(urut.isi).map((x) => x.id), ["p1"]);
  assert.deepEqual(sedangGiliran(tandai(urut, "p1").isi).map((x) => x.id), ["p2"]);
  assert.deepEqual(sedangGiliran(tandai(tandai(urut, "p1"), "p2").isi), []);
});

console.log("hak aksi");
ok("hanya pemilik langkah yang sedang gilirannya boleh ttd", () => {
  const urut = buat(true, [orang("A", A), orang("B", B)]);
  assert.equal(bolehAksi(urut, "ttd", { email: A, legal: false }), true);
  assert.equal(bolehAksi(urut, "ttd", { email: B, legal: false }), false, "B belum gilirannya");
  assert.equal(bolehAksi(urut, "ttd", { email: "x@waskitainfrastruktur.co.id", legal: false }), false);
  assert.equal(bolehAksi(urut, "ttd", { email: A.toUpperCase(), legal: false }), true, "email tidak peka huruf");
  assert.equal(bolehAksi(tandai(urut, "p1"), "ttd", { email: A, legal: false }), false, "sudah menandatangani");
  assert.equal(bolehAksi(tandai(urut, "p1"), "ttd", { email: B, legal: false }), true);
  assert.equal(bolehAksi(urut, "ttd", legal), false, "Legal tidak menandatangani atas nama orang lain");
});
ok("tolak: pihak terlibat saja; batal/scan/ingatkan: Legal", () => {
  const p = buat(false, [orang("A", A), orang("B", B)]);
  assert.equal(bolehAksi(p, "tolak", { email: B, legal: false }), true);
  assert.equal(bolehAksi(p, "tolak", legal), false);
  assert.equal(bolehAksi(p, "batal", legal), true);
  assert.equal(bolehAksi(p, "batal", { email: p.dibuatEmail, legal: false }), true);
  assert.equal(bolehAksi(p, "batal", { email: A, legal: false }), false);
  assert.equal(bolehAksi(p, "scan", legal), true);
  assert.equal(bolehAksi(p, "scan", { email: A, legal: false }), false);
  assert.equal(bolehAksi(p, "ingatkan", { email: A, legal: false }), false);
  const selesai = tandai(tandai(p, "p1"), "p2");
  for (const a of ["ttd", "tolak", "batal", "scan", "ingatkan"] as const) assert.equal(bolehAksi(selesai, a, legal), false, a);
});
ok("lihat: Legal, penandatangan, pembuat; orang lain tidak", () => {
  const p = buat(false, [orang("A", A)]);
  assert.equal(bolehAksi(p, "lihat", legal), true);
  assert.equal(bolehAksi(p, "lihat", { email: A, legal: false }), true);
  assert.equal(bolehAksi(p, "lihat", { email: "z@waskitainfrastruktur.co.id", legal: false }), false);
});
ok("buat: Legal, hanya bila tidak ada permintaan berjalan", () => {
  assert.equal(bolehAksi(null, "buat", legal), true);
  assert.equal(bolehAksi(null, "buat", { email: A, legal: false }), false);
  const p = buat(false, [orang("A", A)]);
  assert.equal(bolehAksi(p, "buat", legal), false);
  assert.equal(bolehAksi({ ...p, isi: { ...p.isi, tolak: { waktu: "t", oleh: "A", alasan: "salah" } } }, "buat", legal), true);
});
ok("pihak luar: Legal mencatat, bukan menandatangani sendiri", () => {
  const p = buat(false, [orang("Mitra", "", true), orang("A", A)]);
  assert.equal(bolehAksi(p, "catat-luar", legal), true);
  assert.equal(bolehAksi(p, "catat-luar", { email: A, legal: false }), false);
  assert.equal(bolehAksi(p, "ttd", { email: "", legal: false }), false);
  const urut = buat(true, [orang("A", A), orang("Mitra", "", true)]);
  assert.equal(bolehAksi(urut, "catat-luar", legal), false, "belum giliran mitra");
  assert.equal(bolehAksi(tandai(urut, "p1"), "catat-luar", legal), true);
});
ok("menungguSaya dan langkahUntukSaya", () => {
  const p1 = buat(false, [orang("A", A)]);
  const p2 = { ...buat(true, [orang("B", B), orang("A", A)]), kontrakId: 8 };
  assert.deepEqual(menungguSaya([p1, p2], A).map((p) => p.kontrakId), [7]);
  assert.equal(langkahUntukSaya(p1, A)?.id, "p1");
  assert.equal(langkahUntukSaya(p2, A), null);
});

console.log("tahapan");
ok("garis waktu berisi pembuat, penandatangan, dan akhir", () => {
  const p = tandai(buat(false, [orang("A", A), orang("B", B)]), "p1");
  const t = tahapan(p);
  assert.deepEqual(t.map((x) => x.kunci), ["dibuat", "p1", "p2", "selesai"]);
  assert.deepEqual(t.map((x) => x.selesai), [true, true, false, false]);
  const tolak = tahapan({ ...p, isi: { ...p.isi, tolak: { waktu: "t", oleh: "B", alasan: "x" } } });
  assert.equal(tolak.at(-1)?.kunci, "tolak");
  assert.equal(tolak.at(-1)?.bahaya, true);
  const basah = tahapan({ ...p, isi: { ...p.isi, berkasScan: "x", waktuSelesai: "t" } });
  assert.equal(basah.at(-1)?.label, "Selesai (tanda tangan basah)");
});

console.log("validasi");
ok("internal wajib email kantor; luar boleh tanpa email", () => {
  assert.deepEqual(periksaPenandatangan([orang("A", A), orang("M", "", true)]), []);
  assert.equal(periksaPenandatangan([]).length, 1);
  assert.match(periksaPenandatangan([orang("A", "a@gmail.com")])[0]!, /@waskitainfrastruktur\.co\.id/);
  assert.match(periksaPenandatangan([orang("", A)])[0]!, /nama wajib/);
  assert.match(periksaPenandatangan([orang("M", "bukan-email", true)])[0]!, /format email/);
});
ok("orang yang sama dengan kedudukan sama ditolak; kedudukan beda boleh", () => {
  const a1 = orang("A", A), a2 = { ...orang("A", A), peran: "Peran Lain" };
  assert.deepEqual(periksaPenandatangan([a1, a2]), []);
  assert.equal(periksaPenandatangan([a1, { ...a1 }]).length, 1);
  assert.equal(periksaPenandatangan(Array.from({ length: 13 }, (_, i) => orang(`N${i}`, `n${i}@waskitainfrastruktur.co.id`))).length, 1);
});
ok("susunPenandatangan: ID stabil, email huruf kecil, peran bawaan", () => {
  const d = susunPenandatangan([{ ...orang("A", "A@WaskitaInfrastruktur.co.id"), peran: " " }, orang("M", "", true)]);
  assert.equal(d[0]!.id, "p1");
  assert.equal(d[0]!.email, A);
  assert.equal(d[0]!.peran, "Penandatangan 1");
  assert.equal(d[1]!.luar, true);
  assert.equal("luar" in d[0]!, false);
});
ok("bahanJejak menormalkan email", () => {
  assert.equal(bahanJejak("h", "A@X.id", "t", "s"), "h|a@x.id|t|s");
});

console.log(`\n${n} uji lulus`);
