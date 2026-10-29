// Uji lib/pengaturan.ts, lib/ics.ts, dan lib/mention.ts. Jalankan: npx --yes tsx scripts/uji-pengaturan.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { Aktivitas, Kontrak, Pengguna } from "../src/lib/types";

// src/config.ts membaca import.meta.env milik Vite, yang tidak ada di Node. Kait ini menggantinya dengan objek kosong.
const kait = `export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const P = await import("../src/lib/pengaturan");
const I = await import("../src/lib/ics");
const M = await import("../src/lib/mention");

let nomor = 0;
function kasus(nama: string, fn: () => void) {
  fn();
  nomor++;
  console.log(`ok ${nomor} - ${nama}`);
}

function kontrak(s: Partial<Kontrak> = {}): Kontrak {
  return {
    id: 12, judul: "Sewa Alat Berat", nomorPengajuan: "PK-2026-012", nomorKontrak: "", jenis: "Sewa", divisi: "SCM", mitra: "PT Maju, Tbk", nilai: 1_000_000,
    mataUang: "IDR", tanggalMulai: "2026-01-01", tanggalBerakhir: "2026-12-31", status: "Diajukan", prioritas: "Normal", deskripsi: "", targetSelesai: null,
    pengajuEmail: "andi@wki.co.id", pengajuNama: "Andi", picLegalEmail: "", picLegalNama: "", tanggalDiajukan: "2026-10-01T02:00:00Z", tanggalTandaTangan: null,
    kontrakIndukId: null, mouAcuanId: null, jenisPerubahan: [], urutanAddendum: null, statusSejak: null, berakhirEfektif: null, checklistReview: null,
    checklistTtd: null, kodeProyek: "", nomorReferensi: "", costCenter: "", mitraId: null, kontrakFinal: "", perpanjanganOtomatis: false,
    masaPemberitahuanHari: null, modeBerakhir: "", adaSengketa: false, plafon: null, persetujuan: null, salinDari: null, npwpMitra: "", alamatMitra: "",
    penandatanganMitra: "", jabatanMitra: "", dasarKewenangan: "", dibuat: "2026-10-01T02:00:00Z", diubah: "2026-10-01T02:00:00Z", webUrl: "",
    ...s,
  };
}

let idP = 1;
const orang = (nama: string, email: string, peran: Pengguna["peran"], divisi: Pengguna["divisi"], aktif = true): Pengguna => ({ id: idP++, nama, email, peran, divisi, aktif });

// --- lib/pengaturan -------------------------------------------------------------------------

kasus("bawaan sesuai spesifikasi", () => {
  const b = P.pengaturanBawaan();
  assert.deepEqual(b.hariPeringatan, [90, 60, 30, 7, 0]);
  assert.deepEqual(b.jaminanPeringatan, [30, 14, 7]);
  assert.equal(b.sla["Review Legal"], 7);
  assert.equal(b.sla.Diajukan, 2);
  assert.equal(b.alamatGrupLegal, "");
});

kasus("pengaturanBawaan menghasilkan salinan, bukan rujukan", () => {
  const a = P.pengaturanBawaan();
  a.hariPeringatan.push(5);
  a.sla.Diajukan = 99;
  assert.deepEqual(P.pengaturanBawaan().hariPeringatan, [90, 60, 30, 7, 0]);
  assert.equal(P.PENGATURAN_BAWAAN.sla.Diajukan, 2);
});

kasus("parsePengaturan: list kosong dan masukan aneh jatuh ke bawaan", () => {
  assert.deepEqual(P.parsePengaturan([]), P.pengaturanBawaan());
  // @ts-expect-error menguji masukan null dari luar
  assert.deepEqual(P.parsePengaturan(null), P.pengaturanBawaan());
  assert.deepEqual(P.parsePengaturan([{ kunci: "tidakDikenal", nilaiJson: "1" }]), P.pengaturanBawaan());
});

kasus("parsePengaturan: JSON rusak dan nilai di luar batas jatuh ke bawaan, sisanya tetap terbaca", () => {
  const h = P.bacaPengaturan([
    { kunci: "hariPeringatan", nilaiJson: "[90, 60," },
    { kunci: "jaminanPeringatan", nilaiJson: "[400]" },
    { kunci: "alamatGrupLegal", nilaiJson: JSON.stringify(" Legal@WKI.co.id ") },
    { kunci: "sla", nilaiJson: JSON.stringify({ "Review Legal": "tujuh" }) },
  ]);
  assert.deepEqual(h.pengaturan.hariPeringatan, [90, 60, 30, 7, 0]);
  assert.deepEqual(h.pengaturan.jaminanPeringatan, [30, 14, 7]);
  assert.equal(h.pengaturan.alamatGrupLegal, "legal@wki.co.id");
  assert.equal(h.pengaturan.sla["Review Legal"], 7);
  assert.deepEqual(h.tersimpan, ["alamatGrupLegal"]);
  assert.deepEqual(h.rusak.map((r) => r.kunci).sort(), ["hariPeringatan", "jaminanPeringatan", "sla"]);
});

kasus("parsePengaturan: daftar hari dinormalkan (unik, menurun) dan SLA sebagian memakai bawaan", () => {
  const p = P.parsePengaturan([
    { kunci: " hariPeringatan ", nilaiJson: "[7, 30, 0, 30, 60]" },
    { kunci: "sla", nilaiJson: JSON.stringify({ "Review Legal": 10, Asing: 3 }) },
    { kunci: "hariKerja", nilaiJson: "[5, 1, 3]" },
  ]);
  assert.deepEqual(p.hariPeringatan, [60, 30, 7, 0]);
  assert.equal(p.sla["Review Legal"], 10);
  assert.equal(p.sla["Perlu Revisi"], 5);
  assert.deepEqual(p.hariKerja, [1, 3, 5]);
});

kasus("validasiNilai menolak tipe salah dan angka pecahan", () => {
  assert.equal(P.validasiNilai("hariPeringatan", "90,60").ok, false);
  assert.equal(P.validasiNilai("hariPeringatan", [1.5]).ok, false);
  assert.equal(P.validasiNilai("hariPeringatan", []).ok, false);
  assert.equal(P.validasiNilai("slaPakaiHariKerja", "ya").ok, false);
  assert.equal(P.validasiNilai("hariKerja", [7]).ok, false);
  assert.equal(P.validasiNilai("tautanTeams", "http://teams.microsoft.com/x").ok, false);
  assert.equal(P.validasiNilai("tautanTeams", "").ok, true);
  assert.equal(P.validasiNilai("alamatGrupLegal", "bukan-email").ok, false);
  assert.equal(P.validasiNilai("pengirimEmail", "x".repeat(201)).ok, false);
  assert.equal(P.validasiNilai("ambangEskalasi", { diajukanTanpaPicHari: 0 }).ok, false);
});

kasus("formulir: keForm lalu dariForm kembali ke nilai yang sama", () => {
  const b = P.pengaturanBawaan();
  const h = P.dariForm(P.keForm(b));
  assert.ok(h.ok);
  if (h.ok) assert.deepEqual(h.nilai, b);
});

kasus("formulir: galat per isian", () => {
  const f = P.keForm(P.pengaturanBawaan());
  f.hariPeringatan = "90, enam puluh";
  f.sla["Review Legal"] = "";
  f.sla.Diajukan = "100";
  f.hariKerja = [];
  f.alamatGrupLegal = "legal@";
  f.diajukanTanpaPicHari = "1.5";
  const h = P.dariForm(f);
  assert.equal(h.ok, false);
  if (!h.ok) {
    assert.ok(h.galat.hariPeringatan);
    assert.equal(h.galat["sla.Review Legal"], "Wajib diisi.");
    assert.ok(h.galat["sla.Diajukan"]);
    assert.equal(h.galat.hariKerja, "Pilih minimal satu hari kerja.");
    assert.ok(h.galat.alamatGrupLegal);
    assert.ok(h.galat.diajukanTanpaPicHari);
    assert.equal(h.galat.jaminanPeringatan, undefined);
  }
});

kasus("bacaDaftarHariTeks menerima koma, spasi, titik koma; kosong jadi []", () => {
  const a = P.bacaDaftarHariTeks("90, 60;30  7 0");
  assert.ok(a.ok);
  if (a.ok) assert.deepEqual(a.nilai, [90, 60, 30, 7, 0]);
  const b = P.bacaDaftarHariTeks("  ");
  assert.ok(b.ok && b.nilai.length === 0);
  assert.equal(P.bacaDaftarHariTeks("H-30").ok, false);
});

kasus("hitungHariKerja: akhir pekan tidak dihitung (zona Jakarta)", () => {
  // Jumat 2 Okt 2026 00.00 WIB sampai Senin 5 Okt 2026 00.00 WIB: hanya Jumat yang dihitung.
  const jumat = Date.parse("2026-10-02T00:00:00+07:00");
  const senin = Date.parse("2026-10-05T00:00:00+07:00");
  assert.equal(P.hitungHariKerja(jumat, senin, [1, 2, 3, 4, 5]), 1);
  assert.equal(P.hitungHariKerja(jumat, senin, [0, 1, 2, 3, 4, 5, 6]), 3);
  assert.equal(P.hitungHariKerja(senin, jumat, [1, 2, 3, 4, 5]), 0);
  // Setengah hari Sabtu tidak dihitung, setengah hari Senin dihitung.
  assert.equal(P.hitungHariKerja(Date.parse("2026-10-03T12:00:00+07:00"), Date.parse("2026-10-05T12:00:00+07:00"), [1, 2, 3, 4, 5]), 0.5);
});

kasus("levelSlaPengaturan: angka dari pengaturan dan mode hari kerja", () => {
  const k = kontrak({ status: "Review Legal", statusSejak: "2026-10-02T00:00:00+07:00" });
  const senin = Date.parse("2026-10-05T00:00:00+07:00");
  const p = P.pengaturanBawaan();
  p.sla["Review Legal"] = 2;
  assert.equal(P.levelSlaPengaturan(k, p, senin), "lewat");
  p.slaPakaiHariKerja = true;
  assert.equal(P.levelSlaPengaturan(k, p, senin), "aman");
  assert.equal(P.levelSlaPengaturan(kontrak({ status: "Aktif" }), p, senin), "tidak-berlaku");
  assert.equal(P.horizonPeringatan(p), 90);
});

kasus("ringkasNilai dan kunciBerubahDariBawaan", () => {
  assert.equal(P.ringkasNilai("hariKerja", [1, 5]), "Senin, Jumat");
  assert.equal(P.ringkasNilai("slaPakaiHariKerja", false), "Hari kalender");
  assert.equal(P.ringkasNilai("alamatGrupLegal", ""), "(kosong)");
  const p = P.pengaturanBawaan();
  assert.deepEqual(P.kunciBerubahDariBawaan(p), []);
  p.tautanTeams = "https://teams.microsoft.com/l/channel/x";
  assert.deepEqual(P.kunciBerubahDariBawaan(p), ["tautanTeams"]);
});

kasus("pengaturanAktif bisa dipasang dan dibaca", () => {
  const p = P.pengaturanBawaan();
  p.hariPeringatan = [45];
  P.pasangPengaturanAktif(p);
  assert.deepEqual(P.pengaturanAktif().hariPeringatan, [45]);
  P.pasangPengaturanAktif(P.pengaturanBawaan());
});

// --- lib/ics -----------------------------------------------------------------------------------

const sekarang = new Date("2026-10-02T03:04:05.678Z");

kasus("ics: struktur VCALENDAR acara seharian, CRLF, DTEND hari berikutnya", () => {
  const t = I.buatIcs({ judul: "Kontrak berakhir", tanggal: "2026-12-31", sekarang, uid: I.uidKontrak(12) });
  assert.ok(t.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(t.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(t), "semua baris baru harus CRLF");
  assert.ok(t.includes("DTSTART;VALUE=DATE:20261231\r\n"));
  assert.ok(t.includes("DTEND;VALUE=DATE:20270101\r\n"), "lintas tahun");
  assert.ok(t.includes("DTSTAMP:20261002T030405Z\r\n"));
  assert.ok(t.includes("UID:kontrak-12-berakhir@wicon.waskitainfrastruktur.co.id\r\n"));
});

kasus("ics: UID stabil untuk kontrak yang sama, berbeda untuk kontrak lain", () => {
  const a = I.opsiIcsBerakhir(kontrak({ id: 7 }))!;
  const b = I.opsiIcsBerakhir(kontrak({ id: 7, tanggalBerakhir: "2027-06-30" }))!;
  const c = I.opsiIcsBerakhir(kontrak({ id: 8 }))!;
  assert.equal(a.uid, b.uid);
  assert.notEqual(a.uid, c.uid);
  // Tanpa uid: diturunkan dari judul dan tanggal, tetap deterministik.
  const u1 = /UID:(.+)\r\n/.exec(I.buatIcs({ judul: "X", tanggal: "2026-01-01", sekarang }))![1];
  const u2 = /UID:(.+)\r\n/.exec(I.buatIcs({ judul: "X", tanggal: "2026-01-01", sekarang: new Date() }))![1];
  assert.equal(u1, u2);
});

kasus("ics: escape koma, titik koma, garis miring terbalik, dan baris baru", () => {
  assert.equal(I.escapeIcs("a,b;c\\d\ne\r\nf"), "a\\,b\\;c\\\\d\\ne\\nf");
  const t = I.buatIcs({ judul: "PT Maju, Tbk; sewa", tanggal: "2026-01-01", sekarang });
  assert.ok(t.includes("SUMMARY:PT Maju\\, Tbk\\; sewa\r\n"));
});

kasus("ics: lipat baris 75 oktet, termasuk karakter multi-byte", () => {
  const panjang = "Ä".repeat(100) + "x".repeat(100);
  const t = I.buatIcs({ judul: panjang, tanggal: "2026-01-01", sekarang, deskripsi: "é".repeat(300) });
  const enc = new TextEncoder();
  for (const baris of t.split("\r\n")) assert.ok(enc.encode(baris).length <= 75, `terlalu panjang: ${baris.length}`);
  // Membuka lipatan mengembalikan teks asli.
  const terbuka = t.replace(/\r\n /g, "");
  assert.ok(terbuka.includes(`SUMMARY:${panjang}\r\n`));
  assert.equal(I.lipatBaris("pendek"), "pendek");
});

kasus("ics: VALARM urut dari H terbesar, pemicu jam 09.00, duplikat dan negatif dibuang", () => {
  const t = I.buatIcs({ judul: "X", tanggal: "2026-03-10", sekarang, alarmHari: [7, 30, 0, 7, -1] });
  const pemicu = [...t.matchAll(/TRIGGER:(.+)\r\n/g)].map((m) => m[1]);
  assert.deepEqual(pemicu, ["-P29DT15H", "-P6DT15H", "PT9H"]);
  assert.equal(t.split("BEGIN:VALARM").length - 1, 3);
  assert.equal(I.pemicuAlarm(1), "-PT15H");
  assert.ok(!I.buatIcs({ judul: "X", tanggal: "2026-03-10", sekarang }).includes("VALARM"));
});

kasus("ics: tanggal tidak sah ditolak; tautan masuk URL dan deskripsi", () => {
  assert.throws(() => I.buatIcs({ judul: "X", tanggal: "31-12-2026" }));
  assert.throws(() => I.buatIcs({ judul: "X", tanggal: "2026-13-45" }));
  const t = I.buatIcs({ judul: "X", tanggal: "2026-01-01", sekarang, tautan: "https://wicon.waskitainfrastruktur.co.id/#/kontrak/1" }).replace(/\r\n /g, "");
  assert.ok(t.includes("URL:https://wicon.waskitainfrastruktur.co.id/#/kontrak/1\r\n"));
  assert.ok(t.includes("DESCRIPTION:Buka di WiCon: https://wicon.waskitainfrastruktur.co.id/#/kontrak/1"));
});

kasus("ics: opsiIcsBerakhir memakai berakhirEfektif, null tanpa tanggal; nama berkas aman", () => {
  assert.equal(I.opsiIcsBerakhir(kontrak({ tanggalBerakhir: null })), null);
  const o = I.opsiIcsBerakhir(kontrak({ berakhirEfektif: "2027-03-31", perpanjanganOtomatis: true, masaPemberitahuanHari: 60 }))!;
  assert.equal(o.tanggal, "2027-03-31");
  assert.ok(o.deskripsi!.includes("60 hari"));
  assert.equal(I.namaBerkasIcs("Kontrak berakhir: Sewa Alat (PK/12)"), "kontrak-berakhir-sewa-alat-pk-12.ics");
  assert.equal(I.namaBerkasIcs("!!!"), "acara.ics");
});

// --- lib/mention -------------------------------------------------------------------------------

const legal = orang("Sari Legal", "sari@wki.co.id", "Legal", "Legal");
const admin = orang("Agus Admin", "agus@wki.co.id", "Admin", "IT");
const andi = orang("Andi", "andi@wki.co.id", "Pengaju", "Pengadaan");
const budi = orang("Budi", "budi@wki.co.id", "Pengaju", "SCM");
const budiS = orang("Budi Santoso", "budis@wki.co.id", "Pengaju", "SCM");
const citra = orang("Citra", "citra@wki.co.id", "Pengaju", "Pengadaan");
const pantau = orang("Pemantau", "pantau@wki.co.id", "Pemantau", "IT");
const nonaktif = orang("Dodi", "dodi@wki.co.id", "Legal", "Legal", false);
const semua = [legal, admin, andi, budi, budiS, citra, pantau, nonaktif];

kasus("kandidatSebut: hanya yang berhak melihat, tanpa Pemantau, nonaktif, dan diri sendiri", () => {
  // Kontrak divisi SCM dibuat Andi (Pengadaan).
  const k = kontrak({ divisi: "SCM", pengajuEmail: "andi@wki.co.id" });
  const nama = M.kandidatSebut(k, semua, "sari@wki.co.id").map((p) => p.nama);
  assert.deepEqual(nama, ["Agus Admin", "Andi", "Budi", "Budi Santoso"]);
  assert.ok(!nama.includes("Citra"), "Pengaju divisi lain yang bukan pembuat tidak boleh muncul");
});

kasus("saringKandidat: awal nama, awal kata, lalu email; tanpa beda huruf besar dan aksen", () => {
  const k = M.kandidatSebut(kontrak(), semua, "");
  assert.deepEqual(M.saringKandidat(k, "bu").map((p) => p.nama), ["Budi", "Budi Santoso"]);
  assert.deepEqual(M.saringKandidat(k, "sant").map((p) => p.nama), ["Budi Santoso"]);
  assert.deepEqual(M.saringKandidat(k, "BUDIS").map((p) => p.nama), ["Budi Santoso"]);
  assert.deepEqual(M.saringKandidat(k, "zzz"), []);
  assert.equal(M.saringKandidat(k, "", 2).length, 2);
});

kasus("cariPemicu: @ di awal atau setelah spasi, bukan di tengah email", () => {
  assert.deepEqual(M.cariPemicu("@bu", 3), { awal: 0, kueri: "bu" });
  assert.deepEqual(M.cariPemicu("halo @", 6), { awal: 5, kueri: "" });
  assert.deepEqual(M.cariPemicu("halo @Budi San", 14), { awal: 5, kueri: "Budi San" });
  assert.equal(M.cariPemicu("kirim ke andi@wki", 17), null);
  assert.equal(M.cariPemicu("@a b c d e", 10), null);
  assert.equal(M.cariPemicu("@budi\nlanjut", 12), null);
  assert.equal(M.cariPemicu("tanpa", 5), null);
});

kasus("sisipkanSebut mengganti ketikan dengan nama lengkap dan memindah kursor", () => {
  const teks = "Tolong @bu cek ya";
  const pem = M.cariPemicu(teks, 10)!;
  const h = M.sisipkanSebut(teks, pem, budiS);
  assert.equal(h.teks, "Tolong @Budi Santoso cek ya");
  assert.equal(h.kursor, "Tolong @Budi Santoso ".length);
});

kasus("ekstrakDisebut: nama terpanjang menang, batas kata dijaga, unik", () => {
  const k = [budi, budiS, legal];
  assert.deepEqual(M.ekstrakDisebut("@Budi Santoso tolong cek", k), ["budis@wki.co.id"]);
  assert.deepEqual(M.ekstrakDisebut("@budi dan @Budi Santoso, juga @Sari Legal. @budi lagi", k).sort(), ["budi@wki.co.id", "budis@wki.co.id", "sari@wki.co.id"]);
  assert.deepEqual(M.ekstrakDisebut("@Budiman bukan Budi", k), []);
  assert.deepEqual(M.ekstrakDisebut("email budi@wki.co.id", k), []);
});

kasus("pecahSebutan menandai potongan sebutan untuk disorot", () => {
  const p = M.pecahSebutan("Hai @Budi Santoso dan @Sari Legal!", ["Budi", "Budi Santoso", "Sari Legal"]);
  assert.deepEqual(p, [
    { teks: "Hai ", sebut: false },
    { teks: "@Budi Santoso", sebut: true },
    { teks: " dan ", sebut: false },
    { teks: "@Sari Legal", sebut: true },
    { teks: "!", sebut: false },
  ]);
  assert.deepEqual(M.pecahSebutan("", ["x"]), []);
});

const sesiDari = (p: Pengguna) => M.sesiSemu(p);

kasus("aturanIngatkan: Legal di Perlu Revisi, pengaju di Diajukan/Review Legal, selain itu tidak ada", () => {
  assert.equal(M.aturanIngatkan(kontrak({ status: "Perlu Revisi" }), sesiDari(legal))?.arah, "legal-ke-pengaju");
  assert.equal(M.aturanIngatkan(kontrak({ status: "Review Legal" }), sesiDari(legal)), null);
  assert.equal(M.aturanIngatkan(kontrak({ status: "Review Legal" }), sesiDari(andi))?.label, "Tanyakan progres");
  assert.equal(M.aturanIngatkan(kontrak({ status: "Diajukan", divisi: "SCM" }), sesiDari(budi))?.arah, "pengaju-ke-legal");
  assert.equal(M.aturanIngatkan(kontrak({ status: "Diajukan", divisi: "SCM" }), sesiDari(citra)), null);
  assert.equal(M.aturanIngatkan(kontrak({ status: "Aktif" }), sesiDari(andi)), null);
  assert.equal(M.aturanIngatkan(kontrak({ status: "Perlu Revisi" }), sesiDari(pantau)), null);
});

kasus("penerimaIngatkan: diturunkan otomatis dan tidak pernah ke pengirimnya sendiri", () => {
  const keLegal = M.aturanIngatkan(kontrak({ status: "Review Legal" }), sesiDari(andi))!;
  assert.deepEqual(M.penerimaIngatkan(kontrak({ picLegalEmail: "Sari@wki.co.id" }), keLegal, semua, "andi@wki.co.id"), ["sari@wki.co.id"]);
  assert.deepEqual(M.penerimaIngatkan(kontrak(), keLegal, semua, "andi@wki.co.id"), ["sari@wki.co.id", "agus@wki.co.id"]);
  const kePengaju = M.aturanIngatkan(kontrak({ status: "Perlu Revisi" }), sesiDari(legal))!;
  assert.deepEqual(M.penerimaIngatkan(kontrak(), kePengaju, semua, "sari@wki.co.id"), ["andi@wki.co.id"]);
  assert.deepEqual(M.penerimaIngatkan(kontrak({ pengajuEmail: "sari@wki.co.id" }), kePengaju, semua, "sari@wki.co.id"), []);
});

const akt = (jenis: Aktivitas["jenis"], waktu: string): Aktivitas => ({ id: 1, kontrakId: 12, jenis, pesan: "", statusDari: "", statusKe: "", olehEmail: "", olehNama: "", waktu, detail: [], disebut: [] });

kasus("jedaIngatkan: sekali per 24 jam per kontrak, dihitung dari Pengingat terakhir", () => {
  const kini = Date.parse("2026-10-02T10:00:00Z");
  assert.equal(M.jedaIngatkan([], kini).boleh, true);
  assert.equal(M.jedaIngatkan([akt("Komentar", "2026-10-02T09:00:00Z")], kini).boleh, true);
  const j = M.jedaIngatkan([akt("Pengingat", "2026-10-01T08:00:00Z"), akt("Pengingat", "2026-10-02T09:00:00Z")], kini);
  assert.equal(j.boleh, false);
  assert.equal(j.bolehLagi, Date.parse("2026-10-03T09:00:00Z"));
  assert.equal(M.jedaIngatkan([akt("Pengingat", "2026-10-01T10:00:00Z")], kini).boleh, true, "tepat 24 jam sudah boleh");
});

kasus("email sebutan dan pengingat: subjek jelas, isi di-escape, tautan ke ruang yang benar", () => {
  const k = kontrak({ judul: "Sewa <Crane>" });
  const s = M.emailSebutan(k, "Sari", "Cek pasal 5 <b>ya</b>", "pengaju");
  assert.ok(s.subjek.includes("Sari menyebut Anda"));
  assert.ok(s.html.includes("&lt;b&gt;ya&lt;/b&gt;"));
  assert.ok(!s.html.includes("<b>ya</b>"));
  assert.ok(s.html.includes("/#/saya/kontrak/12"));
  const keLegal = M.aturanIngatkan(kontrak({ status: "Review Legal" }), sesiDari(andi))!;
  const e = M.emailPengingat(k, "Andi", keLegal, "");
  assert.ok(e.subjek.startsWith("[WiCon] Menanyakan progres"));
  assert.ok(e.html.includes("/#/kontrak/12"));
  assert.equal(M.ruangPenerima(andi), "pengaju");
  assert.equal(M.ruangPenerima(legal), "legal");
});

console.log(`\n${nomor} kasus lulus.`);
