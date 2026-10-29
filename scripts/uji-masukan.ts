// Uji permintaan masukan unit lain (K03): lib/masukan.ts, pengurang umur tahap MENUNGGU_UNIT_LAIN di lib/sla.ts
// dan lib/pengaturan.ts, serta templat email permintaan di lib/email.ts.
// Jalankan: npx --yes tsx scripts/uji-masukan.ts
import assert from "node:assert/strict";
import { register } from "node:module";

// src/config.ts membaca import.meta.env milik Vite, yang tidak ada di Node. Kait ini menggantinya dengan objek kosong.
const kait = `export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const M = await import("../src/lib/masukan");
const S = await import("../src/lib/sla");
const P = await import("../src/lib/pengaturan");
const E = await import("../src/lib/email");
type Kontrak = import("../src/lib/types").Kontrak;
type PermintaanMasukan = import("../src/lib/masukan").PermintaanMasukan;

let nomor = 0;
async function kasus(nama: string, fn: () => void | Promise<void>) {
  await fn();
  nomor++;
  console.log(`  ok ${String(nomor).padStart(2, "0")}  ${nama}`);
}

const D = "waskitainfrastruktur.co.id";
const HARI = "2026-10-05";

const isian = (o: Partial<import("../src/lib/masukan").MasukanBaru> = {}) => ({
  unit: "Keuangan",
  emailPenerima: `dewi@${D}`,
  namaPenerima: "Dewi",
  pertanyaan: "Apakah anggaran tahun ini cukup untuk nilai kontrak ini?",
  tenggat: "2026-10-08",
  tautanBerkas: "",
  ...o,
});

const permintaan = (id: number, o: Partial<PermintaanMasukan> = {}): PermintaanMasukan => ({
  id,
  kontrakId: 7,
  unit: "Pajak",
  emailPenerima: `pajak@${D}`,
  namaPenerima: "",
  pertanyaan: "PPh?",
  tenggat: "2026-10-07",
  status: "Menunggu",
  jawaban: "",
  dijawabOleh: "",
  selesaiPada: null,
  tautanBerkas: "",
  dibuat: "2026-10-03T02:00:00Z",
  dibuatOleh: "Rina",
  diubah: "2026-10-03T02:00:00Z",
  diubahOleh: "Rina",
  ...o,
});

console.log("lib/masukan");

await kasus("validasiMasukan: isian sah lolos; unit, email kantor, pertanyaan, tenggat, dan tautan diperiksa", () => {
  const o = { domain: D, hari: HARI };
  assert.equal(M.validasiMasukan(isian(), o), null);
  assert.equal(M.validasiMasukan(isian({ emailPenerima: `Dewi@Proyek.${D.toUpperCase()}` }), o), null);
  assert.match(M.validasiMasukan(isian({ unit: " " }), o) ?? "", /unit/);
  assert.match(M.validasiMasukan(isian({ emailPenerima: "" }), o) ?? "", /email penerima/);
  assert.match(M.validasiMasukan(isian({ emailPenerima: "dewi@" }), o) ?? "", /Format email/);
  assert.match(M.validasiMasukan(isian({ emailPenerima: "dewi@gmail.com" }), o) ?? "", /alamat kantor/);
  assert.match(M.validasiMasukan(isian({ pertanyaan: "Cek ya" }), o) ?? "", /minimal satu kalimat/);
  assert.match(M.validasiMasukan(isian({ tenggat: null }), o) ?? "", /tenggat/);
  assert.match(M.validasiMasukan(isian({ tenggat: "2026-10-04" }), o) ?? "", /sebelum hari ini/);
  assert.match(M.validasiMasukan(isian({ tautanBerkas: "http://contoh" }), o) ?? "", /https/);
  assert.match(M.validasiMasukan(isian({ tautanBerkas: "bukan tautan" }), o) ?? "", /belum valid/);
  assert.equal(M.validasiMasukan(isian({ tautanBerkas: "https://waskitainfra.sharepoint.com/:b:/s/x" }), o), null);
});

await kasus("rapikanMasukan: spasi dirapikan dan email huruf kecil", () => {
  const r = M.rapikanMasukan(isian({ unit: "  Manajemen   Risiko ", emailPenerima: ` DEWI@${D} `, namaPenerima: " Dewi  A " }));
  assert.equal(r.unit, "Manajemen Risiko");
  assert.equal(r.emailPenerima, `dewi@${D}`);
  assert.equal(r.namaPenerima, "Dewi A");
});

await kasus("statusTampil: Menunggu yang lewat tenggat menjadi Terlambat; status lain apa adanya", () => {
  assert.equal(M.statusTampil({ status: "Menunggu", tenggat: "2026-10-04" }, HARI), "Terlambat");
  assert.equal(M.statusTampil({ status: "Menunggu", tenggat: HARI }, HARI), "Menunggu");
  assert.equal(M.statusTampil({ status: "Menunggu", tenggat: null }, HARI), "Menunggu");
  assert.equal(M.statusTampil({ status: "Dijawab", tenggat: "2026-10-01" }, HARI), "Dijawab");
  assert.equal(M.statusTampil({ status: "Terlambat", tenggat: "2026-10-09" }, HARI), "Terlambat");
});

await kasus("validasiJawaban: ringkasan wajib dan tanggal tidak di masa depan", () => {
  assert.equal(M.validasiJawaban({ jawaban: "Anggaran cukup.", dijawabOleh: "", tanggal: HARI }, HARI), null);
  assert.match(M.validasiJawaban({ jawaban: " ", dijawabOleh: "", tanggal: null }, HARI) ?? "", /ringkasan/);
  assert.match(M.validasiJawaban({ jawaban: "Cukup.", dijawabOleh: "", tanggal: "2026-10-06" }, HARI) ?? "", /setelah hari ini/);
});

await kasus("rentangTungguMasukan: yang menunggu terbuka; dijawab dan dibatalkan tertutup di SelesaiPada", () => {
  const r = M.rentangTungguMasukan([
    permintaan(1),
    permintaan(2, { status: "Terlambat" }),
    permintaan(3, { status: "Dijawab", selesaiPada: "2026-10-04T02:00:00Z" }),
    permintaan(4, { status: "Dibatalkan", selesaiPada: null }),
  ]);
  assert.deepEqual(r, [
    { mulai: "2026-10-03T02:00:00Z", selesai: null },
    { mulai: "2026-10-03T02:00:00Z", selesai: null },
    { mulai: "2026-10-03T02:00:00Z", selesai: "2026-10-04T02:00:00Z" },
    { mulai: "2026-10-03T02:00:00Z", selesai: "2026-10-03T02:00:00Z" },
  ]);
});

await kasus("urutkan dan ringkas: menunggu (tenggat terdekat) di atas, lalu selesai terbaru", () => {
  const d = [
    permintaan(1, { status: "Dijawab", dibuat: "2026-10-01T00:00:00Z" }),
    permintaan(2, { tenggat: "2026-10-09" }),
    permintaan(3, { tenggat: "2026-10-04" }),
    permintaan(4, { status: "Dibatalkan", dibuat: "2026-10-02T00:00:00Z" }),
  ];
  assert.deepEqual(M.urutkanMasukan(d).map((x) => x.id), [3, 2, 4, 1]);
  assert.deepEqual(M.ringkasMasukan(d, HARI), { total: 4, menunggu: 2, terlambat: 1, dijawab: 1 });
});

console.log("lib/sla + lib/pengaturan: pengurang MENUNGGU_UNIT_LAIN");

const sekarang = Date.parse("2026-10-10T02:00:00Z");
const kontrak = (o: Partial<Kontrak> = {}): Kontrak => ({ id: 7, status: "Review Legal", statusSejak: "2026-10-02T02:00:00Z", tanggalDiajukan: "2026-10-01T02:00:00Z", ...o }) as Kontrak;

await kasus("tahap Legal saja yang dipotong; Perlu Revisi dan Aktif tidak", () => {
  assert.deepEqual([...S.MENUNGGU_UNIT_LAIN], ["Diajukan", "Review Legal", "Proses Tanda Tangan"]);
  const r = [{ mulai: "2026-10-03T02:00:00Z", selesai: "2026-10-05T02:00:00Z" }];
  assert.equal(S.potonganTungguHari(kontrak(), r, sekarang), 2);
  assert.equal(S.potonganTungguHari(kontrak({ status: "Perlu Revisi" }), r, sekarang), 0);
  assert.equal(S.potonganTungguHari(kontrak({ status: "Aktif" }), r, sekarang), 0);
});

await kasus("rentang dipotong ke awal tahap dan sekarang, tumpang tindih digabung, yang terbuka dihitung sampai sekarang", () => {
  const r = [
    { mulai: "2026-09-30T02:00:00Z", selesai: "2026-10-03T02:00:00Z" }, // mulai sebelum tahap: dihitung sejak 2 Okt (1 hari)
    { mulai: "2026-10-04T02:00:00Z", selesai: "2026-10-06T02:00:00Z" }, // 4-6 Okt
    { mulai: "2026-10-05T02:00:00Z", selesai: "2026-10-07T02:00:00Z" }, // tumpang tindih: digabung 4-7 Okt (3 hari)
    { mulai: "2026-10-09T02:00:00Z", selesai: null }, // masih menunggu: 9-10 Okt (1 hari)
  ];
  const rentang = S.rentangTungguTahap(kontrak(), r, sekarang);
  assert.deepEqual(
    rentang.map(([a, b]) => [new Date(a).toISOString(), new Date(b).toISOString()]),
    [
      ["2026-10-02T02:00:00.000Z", "2026-10-03T02:00:00.000Z"],
      ["2026-10-04T02:00:00.000Z", "2026-10-07T02:00:00.000Z"],
      ["2026-10-09T02:00:00.000Z", "2026-10-10T02:00:00.000Z"],
    ],
  );
  assert.equal(S.potonganTungguHari(kontrak(), r, sekarang), 5);
  // Umur kotor 8 hari (2-10 Okt), bersih 3 hari.
  assert.equal(S.umurTahapHari(kontrak(), sekarang), 8);
  assert.equal(S.umurTahapBersih(kontrak(), r, sekarang), 3);
});

await kasus("rentang rusak, sebelum tahap, atau tanpa StatusSejak diabaikan", () => {
  assert.equal(S.potonganTungguHari(kontrak(), [{ mulai: "bukan tanggal", selesai: null }], sekarang), 0);
  assert.equal(S.potonganTungguHari(kontrak(), [{ mulai: "2026-09-20T00:00:00Z", selesai: "2026-09-25T00:00:00Z" }], sekarang), 0);
  assert.equal(S.potonganTungguHari(kontrak({ statusSejak: null, status: "Review Legal" }), [{ mulai: "2026-10-03T02:00:00Z", selesai: null }], sekarang), 0);
  assert.equal(S.umurTahapBersih(kontrak({ statusSejak: null }), [], sekarang), null);
});

await kasus("levelSlaPengaturan: SLA Review Legal 7 hari lewat tanpa potongan, aman setelah dipotong", () => {
  const p = P.pengaturanBawaan();
  const r = [{ mulai: "2026-10-03T02:00:00Z", selesai: "2026-10-06T02:00:00Z" }];
  assert.equal(P.levelSlaPengaturan(kontrak(), p, sekarang), "lewat");
  assert.equal(P.umurTahapPengaturan(kontrak(), p, sekarang, r), 5);
  assert.equal(P.levelSlaPengaturan(kontrak(), p, sekarang, r), "hampir");
  assert.equal(P.levelSlaPengaturan(kontrak(), p, sekarang, [{ mulai: "2026-10-02T02:00:00Z", selesai: "2026-10-07T02:00:00Z" }]), "aman");
});

await kasus("mode hari kerja: potongan dihitung dalam hari kerja (akhir pekan tidak dikurangi dua kali)", () => {
  const p = { ...P.pengaturanBawaan(), slaPakaiHariKerja: true };
  // Tahap mulai Jumat 2 Okt 00.00 WIB, sekarang Jumat 9 Okt 00.00 WIB: 5 hari kerja (Jum, Sen-Kam).
  const k = kontrak({ statusSejak: "2026-10-01T17:00:00Z" });
  const kini = Date.parse("2026-10-08T17:00:00Z");
  assert.equal(P.umurTahapPengaturan(k, p, kini), 5);
  // Menunggu Jumat 00.00 sampai Selasa 00.00 WIB: Jumat dan Senin = 2 hari kerja.
  const r = [{ mulai: "2026-10-01T17:00:00Z", selesai: "2026-10-05T17:00:00Z" }];
  assert.equal(P.potonganTungguPengaturan(k, p, kini, r), 2);
  assert.equal(P.umurTahapPengaturan(k, p, kini, r), 3);
});

console.log("lib/email: permintaan masukan");

await kasus("email permintaan: pertanyaan, tenggat, tombol balas ke Legal, dan teks aman dari HTML", () => {
  const k = {
    ...kontrak(),
    judul: "Sewa <crane>",
    nomorPengajuan: "KTR-2026-0007",
    mitra: "PT A",
    jenis: "Sewa",
    nilai: 2_500_000_000,
    mataUang: "IDR",
    prioritas: "Normal",
  } as Kontrak;
  const m = E.emailPermintaanMasukan(k, { ...isian(), pertanyaan: "Perlakuan <PPh> pasal 23?" }, { nama: "Rina", email: `rina@${D}` });
  assert.match(m.subjek, /Mohon masukan Keuangan: Sewa <crane> \(KTR-2026-0007\)/);
  assert.ok(!m.html.includes("<crane>") && !m.html.includes("<PPh>"));
  assert.match(m.html, /Perlakuan &lt;PPh&gt; pasal 23\?/);
  assert.match(m.html, new RegExp(`mailto:rina@${D.replace(/\./g, "\\.")}\\?subject=Masukan%20Keuangan%20untuk%20KTR-2026-0007`));
  assert.match(m.html, /8 Okt 2026|8 Oktober 2026/);
  assert.ok(!m.html.includes("Buka berkas"));
  const dengan = E.emailPermintaanMasukan(k, isian({ tautanBerkas: "https://contoh.sharepoint.com/x" }), { nama: "Rina", email: `rina@${D}` });
  assert.match(dengan.html, /Buka berkas/);
});

console.log(`\nSemua ${nomor} kasus lulus.`);
