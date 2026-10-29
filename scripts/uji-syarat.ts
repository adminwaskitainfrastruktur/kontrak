// Uji lib/syarat.ts, lib/ttd.ts, dan lib/revisi.ts. Jalankan: npx --yes tsx scripts/uji-syarat.ts
import assert from "node:assert/strict";
import {
  BUTIR_DASAR,
  PETA_DOKUMEN,
  daftarChecklistReview,
  daftarTahapTtd,
  jenisPemenuh,
  kekuranganDokumen,
  kemajuanChecklist,
  peringatanChecklist,
  ringkasKelengkapan,
  ringkasSebelumTtd,
  susunChecklistReview,
  syaratDokumen,
  tampilkanChecklistReview,
  teksMohonLengkapi,
  teksSusulan,
  bolehUbahChecklistReview,
  checklistReviewKontrak,
} from "../src/lib/syarat";
import { bolehUbahTtd, bungkusTtd, hitungTtd, langkahBerikutnya, posisiTtd, ringkasTtd, susunTtd, tampilkanPanelTtd, tanggalTtdTerakhir, ubahLangkah, type ItemTtd } from "../src/lib/ttd";
import {
  TEMPLAT_POIN,
  baruDikirimUlang,
  daftarTemplatPoin,
  kirimUlangSetelah,
  permintaanRevisiTerakhir,
  sejakRevisi,
  tambahPoin,
  tampilkanKartuRevisi,
  teksTanggapan,
  uraiPoin,
} from "../src/lib/revisi";
import { JENIS_DOKUMEN, JENIS_KONTRAK, type Aktivitas, type Dokumen, type Sesi } from "../src/lib/types";

let nomor = 0;
const kasus = (nama: string, fn: () => void) => {
  fn();
  nomor++;
  console.log(`ok ${nomor} - ${nama}`);
};

const legal: Sesi = { email: "legal@wki.co.id", nama: "Rina Legal", peran: "Legal", divisi: "Legal", penggunaId: 1 };
const pengaju: Sesi = { email: "scm@wki.co.id", nama: "Budi SCM", peran: "Pengaju", divisi: "SCM", penggunaId: 2 };

let seqAkt = 0;
function akt(sebagian: Partial<Aktivitas>): Aktivitas {
  seqAkt++;
  return { id: seqAkt, kontrakId: 7, jenis: "Komentar", pesan: "", statusDari: "", statusKe: "", olehEmail: "", olehNama: "", waktu: "2026-10-01T03:00:00Z", detail: [], disebut: [], ...sebagian };
}
function dok(nama: string, diubah: string, jenis: Dokumen["jenis"] = "Dokumen Pendukung"): Dokumen {
  return { id: nama, nama, jenis, ukuran: 1000, webUrl: "", unduhUrl: null, diubah, diubahOleh: "Budi" };
}

// --- syarat: dokumen wajib -------------------------------------------------------------

kasus("setiap jenis kontrak punya minimal satu dokumen wajib dan slot berjenis sah", () => {
  for (const j of JENIS_KONTRAK) {
    const s = PETA_DOKUMEN[j];
    assert.ok(s.wajib.length >= 1, j);
    for (const slot of [...s.wajib, ...s.bersyarat]) assert.ok(JENIS_DOKUMEN.includes(slot.jenis), `${j}: ${slot.jenis}`);
    const jenisWajib = s.wajib.map((x) => x.jenis);
    assert.equal(new Set(jenisWajib).size, jenisWajib.length, `${j}: slot wajib ganda`);
  }
});

kasus("pengadaan barang: 4 wajib, kurang dihitung dengan benar", () => {
  const h = kekuranganDokumen("Pengadaan Barang", ["Penawaran", "Legalitas Mitra", "Lainnya"]);
  assert.deepEqual(h.wajib, ["Penawaran", "BA Negosiasi", "Legalitas Mitra", "SPK / PO"]);
  assert.deepEqual(h.ada, ["Penawaran", "Legalitas Mitra"]);
  assert.deepEqual(h.kurang, ["BA Negosiasi", "SPK / PO"]);
  assert.equal(ringkasKelengkapan(h).teks, "2 dari 4 wajib");
  assert.equal(ringkasKelengkapan(h).persen, 50);
});

kasus("berkas tanpa jenis tidak memenuhi apa pun; daftar kosong berarti semua kurang", () => {
  const h = kekuranganDokumen("Kerahasiaan (NDA)", ["", ""]);
  assert.deepEqual(h.ada, []);
  assert.deepEqual(h.kurang, ["Legalitas Mitra", "Draft Kontrak"]);
});

kasus("Draft Final dan Kontrak Ditandatangani memenuhi slot Draft Kontrak", () => {
  assert.deepEqual(jenisPemenuh("Draft Kontrak"), ["Draft Kontrak", "Draft Final", "Kontrak Ditandatangani"]);
  const h = kekuranganDokumen("MoU / Nota Kesepahaman", ["Legalitas Mitra", "Kontrak Ditandatangani"]);
  assert.deepEqual(h.kurang, []);
  assert.equal(ringkasKelengkapan(h).lengkap, true);
});

kasus("override mengganti daftar wajib dan membuang ganda; bersyarat tidak tumpang tindih dengan wajib", () => {
  const s = syaratDokumen("Sewa", { Sewa: { wajib: ["Legalitas Mitra", "Legalitas Mitra", "Surat Kuasa"] } });
  assert.deepEqual(s.wajib.map((x) => x.jenis), ["Legalitas Mitra", "Surat Kuasa"]);
  assert.ok(!s.bersyarat.some((x) => x.jenis === "Surat Kuasa"));
  // Label khusus dari bawaan tetap dibawa.
  assert.match(s.wajib[0]!.petunjuk, /pemilik/);
  // Jenis lain tidak terpengaruh.
  assert.equal(syaratDokumen("Pengadaan Barang", { Sewa: { wajib: [] } }).wajib.length, 4);
});

kasus("override wajib kosong berarti tanpa dokumen wajib dan dianggap lengkap", () => {
  const h = kekuranganDokumen("Lainnya", [], { Lainnya: { wajib: [] } });
  assert.deepEqual(h.wajib, []);
  assert.deepEqual(ringkasKelengkapan(h), { teks: "Tidak ada dokumen wajib", persen: 100, lengkap: true });
});

kasus("teksMohonLengkapi bernomor dan memakai rincian; kosong bila tidak kurang", () => {
  assert.equal(teksMohonLengkapi([]), "");
  const t = teksMohonLengkapi(["Legalitas Mitra", "BA Negosiasi"], "Pengadaan Jasa");
  assert.equal(t, "Mohon lengkapi dokumen berikut ya:\n1. Legalitas mitra (akta, NIB, NPWP)\n2. BA Negosiasi");
  assert.equal(teksSusulan(["SPK / PO"]), "Dokumen berikut akan menyusul: SPK / PO.");
  // Label khusus jenis: draft MoU.
  assert.match(teksMohonLengkapi(["Draft Kontrak"], "MoU / Nota Kesepahaman"), /Draft MoU/);
});

kasus("teksMohonLengkapi dapat diurai kembali menjadi poin oleh uraiPoin", () => {
  const u = uraiPoin(teksMohonLengkapi(["Penawaran", "SPK / PO"], "Pengadaan Barang"));
  assert.equal(u.pengantar, "Mohon lengkapi dokumen berikut ya:");
  assert.deepEqual(u.poin, ["Penawaran / SPH (penawaran atau SPH)", "SPK / PO"]);
});

// --- syarat: checklist review ----------------------------------------------------------

kasus("checklist dasar berisi 12 butir; NDA tanpa pembayaran, MoU tanpa nilai", () => {
  assert.equal(BUTIR_DASAR.length, 12);
  assert.equal(daftarChecklistReview({ jenis: "Lainnya" }).length, 12);
  const nda = daftarChecklistReview({ jenis: "Kerahasiaan (NDA)" }).map((b) => b.id);
  assert.ok(!nda.includes("nilai-pembayaran") && !nda.includes("jaminan"));
  assert.ok(nda.includes("kerahasiaan"));
  const mou = daftarChecklistReview({ jenis: "MoU / Nota Kesepahaman" }).map((b) => b.id);
  assert.ok(!mou.includes("nilai-pembayaran") && mou.includes("sifat-mengikat") && mou.includes("tindak-lanjut"));
  const barang = daftarChecklistReview({ jenis: "Pengadaan Barang" }).map((b) => b.id);
  assert.equal(barang[barang.indexOf("denda") + 1], "garansi-bast");
});

kasus("addendum fokus pada yang diubah", () => {
  const waktu = daftarChecklistReview({ jenis: "Addendum / Amandemen", jenisPerubahan: ["Perpanjangan Waktu"] }).map((b) => b.id);
  assert.deepEqual(waktu, ["pasal-diubah", "para-pihak", "jangka-waktu", "jaminan", "pajak-meterai", "ketentuan-lain"]);
  const semua = daftarChecklistReview({ jenis: "Addendum / Amandemen", jenisPerubahan: [] }).map((b) => b.id);
  assert.ok(semua.includes("objek-lingkup") && semua.includes("nilai-pembayaran") && semua.includes("jangka-waktu"));
});

kasus("override review: per jenis mengganti seluruhnya, 'semua' mengganti dasar", () => {
  const khusus = [{ id: "x", label: "Butir X", petunjuk: "" }];
  assert.deepEqual(daftarChecklistReview({ jenis: "Sewa" }, { Sewa: khusus }).map((b) => b.id), ["x"]);
  const dasar = [{ id: "nilai-pembayaran", label: "Nilai", petunjuk: "" }, { id: "y", label: "Y", petunjuk: "" }];
  assert.deepEqual(daftarChecklistReview({ jenis: "Kerahasiaan (NDA)" }, { semua: dasar }).map((b) => b.id), ["y"]);
});

kasus("susunChecklistReview menggabung isian tersimpan dan menjaga butir yatim yang sudah dicentang", () => {
  const items = susunChecklistReview(
    { jenis: "Lainnya" },
    {
      versi: 1,
      items: [
        { id: "para-pihak", label: "lama", selesai: true, catatan: "Cek SK direksi", oleh: "Rina", waktu: "2026-10-01T02:00:00Z" },
        { id: "hapus", label: "Butir lama", selesai: true },
        { id: "kosong", label: "Butir lama kosong", selesai: false },
      ],
    },
  );
  assert.equal(items.length, 13);
  assert.equal(items[0]!.label, "Para pihak dan kewenangan");
  assert.equal(items[0]!.catatan, "Cek SK direksi");
  assert.equal(items[items.length - 1]!.id, "hapus");
  assert.deepEqual(kemajuanChecklist(items), { selesai: 2, total: 13, persen: 15 });
  assert.deepEqual(kemajuanChecklist([]), { selesai: 0, total: 0, persen: 0 });
});

kasus("ringkasSebelumTtd dan peringatanChecklist bersifat lunak dan terpotong", () => {
  assert.equal(ringkasSebelumTtd(null), "Checklist review klausul belum diisi.");
  const c = { versi: 1, items: [{ id: "a", label: "A", selesai: true, catatan: "ok" }, { id: "b", label: "B", selesai: false }] };
  assert.equal(ringkasSebelumTtd(c), "Checklist review klausul: 1 dari 2 butir selesai. Belum: B. Catatan: A: ok.");
  assert.ok(ringkasSebelumTtd({ versi: 1, items: Array.from({ length: 30 }, (_, i) => ({ id: `${i}`, label: `Butir panjang nomor ${i}`, selesai: false })) }, 80).length <= 80);
  assert.match(peringatanChecklist(c)!, /1 butir/);
  assert.equal(peringatanChecklist({ versi: 1, items: [{ id: "a", label: "A", selesai: true }] }), null);
  assert.match(peringatanChecklist(null)!, /belum dicentang sama sekali/);
});

kasus("hak ubah dan tampil checklist review", () => {
  assert.equal(bolehUbahChecklistReview({ status: "Review Legal" }, legal), true);
  assert.equal(bolehUbahChecklistReview({ status: "Review Legal" }, pengaju), false);
  assert.equal(bolehUbahChecklistReview({ status: "Proses Tanda Tangan" }, legal), false);
  assert.equal(tampilkanChecklistReview({ status: "Diajukan", checklistReview: null }), false);
  assert.equal(tampilkanChecklistReview({ status: "Aktif", checklistReview: { versi: 1, items: [{ id: "a", label: "A", selesai: true }] } }), true);
  assert.equal(tampilkanChecklistReview({ status: "Aktif", checklistReview: null }), false);
});

// --- ttd ---------------------------------------------------------------------------------

kasus("TTD tanpa data: 6 langkah standar, semuanya belum", () => {
  assert.equal(daftarTahapTtd().length, 6);
  assert.deepEqual(ringkasTtd({ checklistTtd: null }), { selesai: 0, total: 6, teks: "TTD 0/6", lengkap: false });
  assert.equal(langkahBerikutnya(susunTtd(null))!.id, "draft-mitra");
});

kasus("ubahLangkah: selesai memberi tanggal Jakarta, tidak berlaku mengurangi total", () => {
  const sekarang = new Date("2026-10-02T20:00:00Z"); // 3 Okt pukul 03.00 WIB
  let items = susunTtd(null);
  items = ubahLangkah(items, "draft-mitra", { selesai: true }, "Rina", sekarang);
  assert.equal(items[0]!.tanggal, "2026-10-03");
  assert.equal(items[0]!.oleh, "Rina");
  items = ubahLangkah(items, "paraf", { tidakBerlaku: true }, "Rina", sekarang);
  assert.deepEqual(hitungTtd(items), { selesai: 1, total: 5, tidakBerlaku: 1 });
  assert.equal(ringkasTtd({ checklistTtd: bungkusTtd(items) }).teks, "TTD 1/5");
  assert.equal(langkahBerikutnya(items)!.id, "ttd-mitra");
  const pos = posisiTtd(items)!;
  assert.equal(pos.langkah.id, "ttd-mitra");
  assert.equal(pos.sejak, "2026-10-03");
});

kasus("ubahLangkah: selesai dan tidak berlaku saling meniadakan; batal menghapus jejak; catatan kosong dihapus", () => {
  const t = new Date("2026-10-01T05:00:00Z");
  let items: ItemTtd[] = susunTtd(null);
  items = ubahLangkah(items, "meterai", { selesai: true, tanggal: "2026-09-30", catatan: "  e-meterai  " }, "Rina", t);
  assert.equal(items[4]!.tanggal, "2026-09-30");
  assert.equal(items[4]!.catatan, "e-meterai");
  items = ubahLangkah(items, "meterai", { tidakBerlaku: true }, "Rina", t);
  assert.equal(items[4]!.selesai, false);
  assert.equal(items[4]!.tanggal, undefined);
  assert.equal(items[4]!.oleh, undefined);
  items = ubahLangkah(items, "meterai", { selesai: true }, "Rina", t);
  assert.equal(items[4]!.tidakBerlaku, undefined);
  assert.equal(items[4]!.tanggal, "2026-10-01");
  items = ubahLangkah(items, "meterai", { catatan: "  " }, "Rina", t);
  assert.equal(items[4]!.catatan, undefined);
  // Koreksi tanggal pada langkah yang sudah selesai.
  items = ubahLangkah(items, "meterai", { tanggal: "2026-09-29" }, "Rina", t);
  assert.equal(items[4]!.tanggal, "2026-09-29");
  // Tanggal pada langkah yang belum selesai diabaikan.
  items = ubahLangkah(items, "paraf", { tanggal: "2026-09-29" }, "Rina", t);
  assert.equal(items[1]!.tanggal, undefined);
});

kasus("tanggalTtdTerakhir hanya menghitung langkah penandatanganan", () => {
  const t = new Date("2026-10-01T05:00:00Z");
  let items = susunTtd(null);
  assert.equal(tanggalTtdTerakhir(bungkusTtd(items)), null);
  items = ubahLangkah(items, "arsip-asli", { selesai: true, tanggal: "2026-10-20" }, "Rina", t);
  assert.equal(tanggalTtdTerakhir(bungkusTtd(items)), null);
  items = ubahLangkah(items, "ttd-mitra", { selesai: true, tanggal: "2026-10-05" }, "Rina", t);
  items = ubahLangkah(items, "ttd-direksi", { selesai: true, tanggal: "2026-10-09" }, "Rina", t);
  assert.equal(tanggalTtdTerakhir(bungkusTtd(items)), "2026-10-09");
  items = ubahLangkah(items, "ttd-direksi", { tidakBerlaku: true }, "Rina", t);
  assert.equal(tanggalTtdTerakhir(bungkusTtd(items)), "2026-10-05");
});

kasus("susunTtd memakai override dan menjaga langkah yatim yang selesai; lengkap bila semua berlaku selesai", () => {
  const override = { tahap: [{ id: "a", label: "A", petunjuk: "" }, { id: "b", label: "B", petunjuk: "", penandatanganan: true }] };
  const tersimpan = { versi: 1, items: [{ id: "a", label: "A", selesai: true }, { id: "lama", label: "Lama", selesai: true }, { id: "b", label: "B", selesai: false, tidakBerlaku: true } as ItemTtd] };
  const items = susunTtd(tersimpan, override);
  assert.deepEqual(items.map((i) => i.id), ["a", "b", "lama"]);
  const r = ringkasTtd({ checklistTtd: tersimpan }, override);
  assert.deepEqual([r.selesai, r.total, r.lengkap], [2, 2, true]);
  assert.equal(posisiTtd(items), null);
  assert.equal(ringkasTtd({ checklistTtd: null }, { tahap: [] }).teks, "TTD tanpa langkah");
});

kasus("hak ubah dan tampil panel TTD", () => {
  assert.equal(bolehUbahTtd({ status: "Proses Tanda Tangan" }, legal), true);
  assert.equal(bolehUbahTtd({ status: "Proses Tanda Tangan" }, pengaju), false);
  assert.equal(bolehUbahTtd({ status: "Aktif" }, legal), false);
  assert.equal(tampilkanPanelTtd({ status: "Proses Tanda Tangan", checklistTtd: null }), true);
  assert.equal(tampilkanPanelTtd({ status: "Aktif", checklistTtd: null }), false);
  assert.equal(tampilkanPanelTtd({ status: "Aktif", checklistTtd: { versi: 1, items: [{ id: "a", label: "A", selesai: true }] } }), true);
  assert.equal(tampilkanPanelTtd({ status: "Review Legal", checklistTtd: null }), false);
});

// --- revisi -------------------------------------------------------------------------------

kasus("uraiPoin: daftar bernomor, pengantar, sambungan baris, dan penutup setelah baris kosong", () => {
  const u = uraiPoin("Mohon diperbaiki:\n1. Lengkapi akta\n   beserta perubahannya\n2) Perbaiki termin\n\nTerima kasih");
  assert.equal(u.pengantar, "Mohon diperbaiki:");
  assert.deepEqual(u.poin, ["Lengkapi akta beserta perubahannya", "Perbaiki termin", "Terima kasih"]);
  assert.equal(u.bebas, false);
});

kasus("uraiPoin: bulatan, huruf, dan baris biasa", () => {
  assert.deepEqual(uraiPoin("- satu\n• dua\n* tiga").poin, ["satu", "dua", "tiga"]);
  assert.deepEqual(uraiPoin("a. satu\nb) dua").poin, ["satu", "dua"]);
  assert.deepEqual(uraiPoin("Lengkapi NIB\nPerbaiki nilai").poin, ["Lengkapi NIB", "Perbaiki nilai"]);
  assert.deepEqual(uraiPoin("Catatan:\nLengkapi NIB\nPerbaiki nilai"), { pengantar: "Catatan:", poin: ["Lengkapi NIB", "Perbaiki nilai"], bebas: false });
});

kasus("uraiPoin: sebaris bernomor dan cadangan teks bebas", () => {
  assert.deepEqual(uraiPoin("Tolong: 1. lengkapi NIB; 2. perbaiki nilai Rp 1.500.000 3. unggah docx"), {
    pengantar: "Tolong:",
    poin: ["lengkapi NIB", "perbaiki nilai Rp 1.500.000", "unggah docx"],
    bebas: false,
  });
  assert.deepEqual(uraiPoin("Nilai di draft 1.500.000 tidak cocok dengan BA."), { pengantar: "", poin: ["Nilai di draft 1.500.000 tidak cocok dengan BA."], bebas: true });
  assert.deepEqual(uraiPoin(""), { pengantar: "", poin: [], bebas: true });
  assert.deepEqual(uraiPoin(null), { pengantar: "", poin: [], bebas: true });
  assert.deepEqual(uraiPoin("\r\n  1. a\r\n2. b  ").poin, ["a", "b"]);
});

kasus("permintaanRevisiTerakhir memilih yang terbaru dan mengabaikan non-Status", () => {
  const daftar = [
    akt({ jenis: "Status", statusKe: "Perlu Revisi", pesan: "1. lama", waktu: "2026-09-20T01:00:00Z" }),
    akt({ jenis: "Komentar", statusKe: "Perlu Revisi", pesan: "bukan", waktu: "2026-09-30T01:00:00Z" }),
    akt({ jenis: "Status", statusKe: "Perlu Revisi", pesan: "1. baru\n2. lagi", waktu: "2026-09-25T01:00:00Z", olehNama: "Rina" }),
  ];
  const p = permintaanRevisiTerakhir(daftar)!;
  assert.equal(p.olehNama, "Rina");
  assert.deepEqual(p.uraian.poin, ["baru", "lagi"]);
  assert.equal(permintaanRevisiTerakhir([]), null);
});

kasus("sejakRevisi: dokumen baru, kolom diubah, komentar; dan baruDikirimUlang", () => {
  const minta = akt({ jenis: "Status", statusDari: "Review Legal", statusKe: "Perlu Revisi", pesan: "1. a", waktu: "2026-10-01T02:00:00Z" });
  const daftar = [
    minta,
    akt({ jenis: "Perubahan", waktu: "2026-10-01T05:00:00Z", detail: [{ kolom: "Nilai", dari: "1", ke: "2" }, { kolom: "Mitra", dari: "a", ke: "b" }] }),
    akt({ jenis: "Perubahan", waktu: "2026-10-01T06:00:00Z", detail: [{ kolom: "Nilai", dari: "2", ke: "3" }] }),
    akt({ jenis: "Perubahan", waktu: "2026-09-30T06:00:00Z", detail: [{ kolom: "Judul", dari: "", ke: "x" }] }),
    akt({ jenis: "Komentar", waktu: "2026-10-01T07:00:00Z" }),
  ];
  const dokumen = [dok("lama.pdf", "2026-09-29T00:00:00Z"), dok("a.docx", "2026-10-01T03:00:00Z"), dok("b.pdf", "2026-10-01T04:00:00Z")];
  const s = sejakRevisi(dokumen, daftar);
  assert.deepEqual(s.dokumenBaru.map((d) => d.nama), ["b.pdf", "a.docx"]);
  assert.deepEqual(s.kolomDiubah, ["Nilai", "Mitra"]);
  assert.equal(s.komentar, 1);
  assert.deepEqual(s.ringkasan, ["2 dokumen baru: b.pdf, a.docx", "Data diubah: Nilai, Mitra", "1 komentar baru"]);
  assert.equal(sejakRevisi(dokumen, []).adaPerubahan, false);
  assert.equal(sejakRevisi([], daftar).adaDokumenBaru, false);

  assert.equal(baruDikirimUlang({ status: "Review Legal" }, daftar), false);
  const ulang = akt({ jenis: "Status", statusDari: "Perlu Revisi", statusKe: "Review Legal", waktu: "2026-10-02T01:00:00Z" });
  assert.equal(kirimUlangSetelah([...daftar, ulang], minta.waktu)!.id, ulang.id);
  assert.equal(baruDikirimUlang({ status: "Review Legal" }, [...daftar, ulang]), true);
  assert.equal(baruDikirimUlang({ status: "Perlu Revisi" }, [...daftar, ulang]), false);
  assert.equal(tampilkanKartuRevisi({ status: "Perlu Revisi" }), true);
  assert.equal(tampilkanKartuRevisi({ status: "Review Legal" }), false);
});

kasus("tambahPoin menomori lanjut, tidak menggandakan, dan menjaga teks bebas", () => {
  assert.equal(tambahPoin("", "Lengkapi NIB"), "1. Lengkapi NIB");
  assert.equal(tambahPoin("1. Lengkapi NIB", "Perbaiki nilai"), "1. Lengkapi NIB\n2. Perbaiki nilai");
  assert.equal(tambahPoin("1. Lengkapi NIB\n", "Lengkapi NIB"), "1. Lengkapi NIB\n");
  assert.equal(tambahPoin("Mohon dicek ya", "Perbaiki nilai"), "Mohon dicek ya\n1. Perbaiki nilai");
  assert.equal(tambahPoin("x", "   "), "x");
  const dariMohon = tambahPoin(teksMohonLengkapi(["Penawaran", "SPK / PO"]), TEMPLAT_POIN[2]!.teks);
  assert.match(dariMohon, /\n3\. Perbaiki klausul pembayaran/);
});

kasus("templat poin unik dan teksTanggapan hanya memuat poin yang ditanggapi", () => {
  const ids = TEMPLAT_POIN.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(TEMPLAT_POIN.length >= 6);
  assert.deepEqual(daftarTemplatPoin([{ id: "x", label: "X", teks: "Teks X" }]).map((t) => t.id), ["x"]);
  assert.equal(teksTanggapan(["a", "b"], {}), "");
  assert.equal(teksTanggapan(["Lengkapi NIB", "Perbaiki nilai", "c"], { 0: { sudah: true }, 1: { sudah: false, teks: "menunggu mitra" }, 2: { sudah: false, teks: " " } }), "Tanggapan atas poin revisi:\n1. Lengkapi NIB: sudah\n2. Perbaiki nilai: belum (menunggu mitra)");
});

kasus("checklistReviewKontrak menghitung butir standar yang belum tersimpan", () => {
  const c = checklistReviewKontrak({ jenis: "Sewa", jenisPerubahan: [], checklistReview: { versi: 1, items: [{ id: "hukum", label: "x", selesai: true }] } });
  assert.equal(c.items.length, 12);
  assert.match(ringkasSebelumTtd(c), /^Checklist review klausul: 1 dari 12 butir selesai\./);
});

console.log(`\nSelesai: ${nomor} kasus lulus.`);
