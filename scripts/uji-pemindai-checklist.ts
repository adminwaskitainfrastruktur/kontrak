// Uji penanda kosong (lib/pemindai) dan saran checklist dari hasil pindai (lib/saranChecklist), K06 tahap 2.
// Jalankan: npx --yes tsx scripts/uji-pemindai-checklist.ts
import assert from "node:assert/strict";
import { BUTIR_DASAR } from "../src/lib/syarat";
import { deteksiPenandaKosong, pindaiDraf, ringkasPindai } from "../src/lib/pemindai";
import { PETA_BUTIR_KLAUSUL, pilihDraftTerbaru, ringkasSaran, saranChecklist } from "../src/lib/saranChecklist";

let nomor = 0;
function kasus(nama: string, fn: () => void) {
  fn();
  nomor++;
  console.log(`  ok ${String(nomor).padStart(2, "0")}  ${nama}`);
}

const jenisPenanda = (t: string) => deteksiPenandaKosong(t).map((p) => `${p.jenis}:${p.teks}`);

console.log("lib/pemindai: penanda kosong");

kasus("titik-titik berderet, garis bawah, dan ellipsis dikenali; titik biasa tidak", () => {
  assert.deepEqual(jenisPenanda("Nomor: ...."), ["titik:...."]);
  assert.deepEqual(jenisPenanda("Denda sebesar ........ % per hari"), ["titik:........"]);
  assert.deepEqual(jenisPenanda("Tanggal ______ bulan"), ["titik:______"]);
  assert.deepEqual(jenisPenanda("Alamat ……"), ["titik:……"]);
  assert.deepEqual(jenisPenanda("Lihat Pasal 3... dan seterusnya"), [], "tiga titik adalah elipsis biasa");
  assert.deepEqual(jenisPenanda("Selesai. Berikutnya. Lalu."), []);
});

kasus("titik penuntun daftar isi (nomor halaman di ujung baris) tidak dihitung", () => {
  assert.deepEqual(jenisPenanda("Pasal 1 Para Pihak ........ 3\nPasal 2 Ruang Lingkup ........ 4"), []);
  assert.equal(jenisPenanda("Pasal 1 Para Pihak ........ 3\nNomor kontrak ........\nIsi").length, 1);
});

kasus("kotak kosong, [ISI: ...] dari templat aplikasi, dan {...}", () => {
  assert.deepEqual(jenisPenanda("Disetujui [ ] ya [   ] tidak"), ["kotak:[ ]", "kotak:[   ]"]);
  assert.deepEqual(jenisPenanda("Forum sengketa: [ISI: forum sengketa]"), ["isi:[ISI: forum sengketa]"], "titik atau isi di dalam penanda tidak dihitung ganda");
  assert.deepEqual(jenisPenanda("Nama {nama mitra} dan {...}"), ["kurung-kurawal:{nama mitra}", "kurung-kurawal:{...}"]);
  assert.deepEqual(jenisPenanda("Centang [x] ini"), [], "kotak yang sudah diisi bukan penanda");
});

kasus("XXX dikenali, tetapi angka Romawi pasal ke-30 tidak", () => {
  assert.deepEqual(jenisPenanda("Nomor: XXX/2026"), ["huruf-x:XXX"]);
  assert.deepEqual(jenisPenanda("Nama PT XXXX"), ["huruf-x:XXXX"]);
  assert.deepEqual(jenisPenanda("Pasal XXX tentang denda"), []);
  assert.deepEqual(jenisPenanda("Bab XXX"), []);
  assert.deepEqual(jenisPenanda("Boxxxer dan MAXXX"), [], "hanya kata utuh");
});

kasus("urut dari awal dokumen, membawa cuplikan, dan dibatasi jumlahnya", () => {
  const t = "Mulai XXX lalu ....  kemudian [ ] akhir";
  const h = deteksiPenandaKosong(t);
  assert.deepEqual(h.map((p) => p.teks), ["XXX", "....", "[ ]"]);
  assert.ok(h[0]!.posisi < h[1]!.posisi);
  assert.match(h[1]!.cuplikan, /lalu/);
  assert.ok(deteksiPenandaKosong("....\n".repeat(500)).length <= 200);
  assert.deepEqual(deteksiPenandaKosong(""), []);
});

// --- Sampel draf ----------------------------------------------------------------------------------

const KALIMAT = "Para pihak sepakat melaksanakan seluruh kewajiban dalam perjanjian ini dengan itikad baik dan penuh tanggung jawab sesuai ketentuan yang berlaku.";
const pasal = (judul: string, isi = KALIMAT) => `${judul}\n${isi}\n${isi}\n`;

const DRAF_LENGKAP = [
  "PERJANJIAN PENGADAAN JASA",
  "Yang bertanda tangan di bawah ini, PT Waskita Karya Infrastruktur dan PT Maju Jaya, selanjutnya disebut Para Pihak.",
  pasal("Pasal 1 Ruang Lingkup Pekerjaan"),
  pasal("Pasal 2 Nilai Kontrak", "Nilai Kontrak sebesar Rp 1.250.000.000,- (satu miliar dua ratus lima puluh juta rupiah) sudah termasuk PPN. " + KALIMAT),
  pasal("Pasal 3 Cara Pembayaran"),
  pasal("Pasal 4 Jangka Waktu", "Jangka waktu pelaksanaan terhitung sejak tanggal 1 Januari 2026 sampai dengan tanggal 31 Desember 2026. " + KALIMAT),
  pasal("Pasal 5 Jaminan Pelaksanaan"),
  pasal("Pasal 6 Denda Keterlambatan"),
  pasal("Pasal 7 Keadaan Kahar"),
  pasal("Pasal 8 Penyelesaian Perselisihan"),
  pasal("Pasal 9 Hukum yang Berlaku"),
  pasal("Pasal 10 Kerahasiaan"),
  pasal("Pasal 11 Pengakhiran Perjanjian"),
  pasal("Pasal 12 Meterai", "Perjanjian ini ditandatangani di atas meterai yang cukup. " + KALIMAT),
].join("\n");

const id = BUTIR_DASAR.map((b) => b.id);
const pembanding = { judul: "Jasa Konsultan", mitra: "PT Maju Jaya", nilai: 1_250_000_000, mataUang: "IDR" as const, tanggalMulai: "2026-01-01", tanggalBerakhir: "2026-12-31", jenis: "Pengadaan Jasa" as const };

console.log("lib/pemindai: hasil pindai membawa penanda kosong");

kasus("draf lengkap tanpa bagian kosong: penandaKosong kosong dan ringkasan tidak menyebutnya", () => {
  const h = pindaiDraf(DRAF_LENGKAP, pembanding);
  assert.deepEqual(h.penandaKosong, []);
  assert.doesNotMatch(ringkasPindai(h), /masih kosong/);
});

kasus("draf dengan bagian kosong: terdeteksi dan disebut di ringkasan", () => {
  const h = pindaiDraf(DRAF_LENGKAP + "\nNomor kontrak: ....\nPenandatangan: XXX\n", pembanding);
  assert.equal(h.penandaKosong.length, 2);
  assert.match(ringkasPindai(h), /masih kosong: 2/);
});

console.log("lib/saranChecklist");

kasus("peta butir hanya menunjuk butir standar dan klausul yang ada", () => {
  const butir = new Set(BUTIR_DASAR.map((b) => b.id));
  for (const k of Object.keys(PETA_BUTIR_KLAUSUL)) assert.ok(butir.has(k), `butir ${k} tidak ada di checklist standar`);
  const h = pindaiDraf(DRAF_LENGKAP, pembanding);
  const klausul = new Set(h.klausul.map((x) => x.id));
  for (const daftar of Object.values(PETA_BUTIR_KLAUSUL)) for (const x of daftar) assert.ok(klausul.has(x), `klausul ${x} tidak ada di pemindai`);
});

kasus("draf lengkap dan cocok dengan pengajuan: semua butir bersaran dan hanya centang", () => {
  const s = saranChecklist(pindaiDraf(DRAF_LENGKAP, pembanding), id);
  assert.equal(s.length, Object.keys(PETA_BUTIR_KLAUSUL).length);
  assert.ok(s.every((x) => x.jenis === "centang"), JSON.stringify(s.filter((x) => x.jenis !== "centang")));
  assert.equal(ringkasSaran(s), `${s.length} saran centang`);
});

kasus("klausul yang tidak ditemukan ditandai, bukan dicentang", () => {
  const tanpaDenda = DRAF_LENGKAP.replace(pasal("Pasal 6 Denda Keterlambatan"), "");
  const s = saranChecklist(pindaiDraf(tanpaDenda, pembanding), id);
  const denda = s.find((x) => x.id === "denda")!;
  assert.equal(denda.jenis, "tandai");
  assert.match(denda.alasan, /belum terdeteksi/);
  assert.equal(s.find((x) => x.id === "sengketa")!.jenis, "centang");
});

kasus("selisih nilai, mitra, dan tanggal terhadap pengajuan ditandai pada butir terkait", () => {
  const s = saranChecklist(pindaiDraf(DRAF_LENGKAP, { ...pembanding, nilai: 900_000_000, mitra: "PT Lain Sekali", tanggalBerakhir: "2027-06-30" }), id);
  const per = (b: string) => s.find((x) => x.id === b)!;
  assert.equal(per("nilai-pembayaran").jenis, "tandai");
  assert.match(per("nilai-pembayaran").alasan, /berbeda dengan pengajuan/);
  assert.equal(per("para-pihak").jenis, "tandai");
  assert.equal(per("jangka-waktu").jenis, "tandai");
  assert.equal(per("denda").jenis, "centang");
});

kasus("bagian kosong di sekitar klausul menggagalkan saran centang untuk butir itu", () => {
  const dendaKosong = DRAF_LENGKAP.replace("Pasal 6 Denda Keterlambatan\n", "Pasal 6 Denda Keterlambatan ..... % per hari\n");
  const s = saranChecklist(pindaiDraf(dendaKosong, pembanding), id);
  const denda = s.find((x) => x.id === "denda")!;
  assert.equal(denda.jenis, "tandai");
  assert.match(denda.alasan, /bagian kosong/);
});

kasus("klausul yang tidak lazim untuk jenis kontrak dilewati (NDA tanpa nilai dan jaminan)", () => {
  const nda = DRAF_LENGKAP.replace("PERJANJIAN PENGADAAN JASA", "PERJANJIAN KERAHASIAAN");
  const h = pindaiDraf(nda, { ...pembanding, jenis: "Kerahasiaan (NDA)" });
  const s = saranChecklist(h, id);
  assert.equal(s.find((x) => x.id === "nilai-pembayaran"), undefined);
  assert.equal(s.find((x) => x.id === "jaminan"), undefined);
  assert.ok(s.find((x) => x.id === "kerahasiaan"));
});

kasus("butir tanpa padanan klausul dan butir di luar checklist kontrak tidak diberi saran", () => {
  const s = saranChecklist(pindaiDraf(DRAF_LENGKAP, pembanding), ["pasal-diubah", "subkontrak", "denda", "tidak-dikenal"]);
  assert.deepEqual(s.map((x) => x.id), ["denda"]);
});

kasus("teks nyaris tidak terbaca tidak menghasilkan saran apa pun", () => {
  assert.deepEqual(saranChecklist(pindaiDraf("Halaman 1", pembanding), id), []);
});

kasus("teks hanya terbaca sebagian: klausul yang hilang diberi peringatan baca ulang", () => {
  const sebagian = [
    "PERJANJIAN",
    "Yang bertanda tangan di bawah ini para pihak sepakat dengan perjanjian ini.",
    "Pasal 1 Ruang Lingkup",
    "Pihak yang satu dan pihak yang lain untuk pekerjaan ini dengan ketentuan yang ada.",
    "Dibuat dan ditandatangani oleh para pihak pada tanggal tersebut di atas dalam keadaan sehat.",
  ].join("\n").repeat(3);
  const h = pindaiDraf(sebagian, null);
  assert.equal(h.keterbacaan.tingkat, "sebagian");
  const hilang = saranChecklist(h, id).find((x) => x.jenis === "tandai" && /belum terdeteksi/.test(x.alasan));
  assert.ok(hilang, "butir yang klausulnya hilang tetap ditandai");
  assert.match(hilang!.alasan, /terbaca sebagian/);
});

kasus("ringkasan saran: campuran, kosong, dan hanya tandai", () => {
  assert.equal(ringkasSaran([]), "Belum ada saran untuk butir checklist.");
  assert.equal(ringkasSaran([{ id: "a", jenis: "centang", alasan: "" }, { id: "b", jenis: "tandai", alasan: "" }, { id: "c", jenis: "tandai", alasan: "" }]), "1 saran centang, 2 perlu dicek");
  assert.equal(ringkasSaran([{ id: "b", jenis: "tandai", alasan: "" }]), "1 perlu dicek");
});

kasus("draf terbaru: Draft Kontrak atau Draft Final yang terbaru dan bisa dibaca", () => {
  const bisa = (n: string) => /\.(pdf|docx)$/i.test(n);
  const d = (jenis: string, nama: string, diubah: string) => ({ jenis: jenis as never, nama, diubah });
  const daftar = [
    d("Draft Kontrak", "draft v1.docx", "2026-09-01T00:00:00Z"),
    d("Draft Final", "final.pdf", "2026-09-10T00:00:00Z"),
    d("Draft Kontrak", "draft v2.docx", "2026-09-05T00:00:00Z"),
    d("Dokumen Pendukung", "lain.docx", "2026-09-20T00:00:00Z"),
    d("Draft Kontrak", "catatan.txt", "2026-09-30T00:00:00Z"),
  ];
  assert.equal(pilihDraftTerbaru(daftar, bisa)?.nama, "final.pdf");
  assert.equal(pilihDraftTerbaru(daftar.slice(0, 1), bisa)?.nama, "draft v1.docx");
  assert.equal(pilihDraftTerbaru(daftar.slice(3), bisa), null, "bukan draf, atau tidak bisa dibaca");
  assert.equal(pilihDraftTerbaru([], bisa), null);
});

console.log(`\nSemua ${nomor} kasus lulus.`);
