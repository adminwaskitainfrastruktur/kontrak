// Uji lib/jenisBerkas.ts dan lib/arsip.ts. Jalankan: npx --yes tsx scripts/uji-dokumen.ts
import assert from "node:assert/strict";
import {
  bolehHapusDokumen,
  bolehJadiKontrakFinal,
  dokumenFinalTerbaru,
  ekstensiDari,
  hitungSyarat,
  izinDokumen,
  izinUbahJenis,
  kelompokkanDokumen,
  kepalaPdfValid,
  modePratinjau,
  namaBerkasAman,
  nomorInternalVersi,
  pilihanJenisUntuk,
  sepadanEkstensi,
  tampilanBerkas,
  tebakJenis,
  teksVersi,
  tokenKata,
  urlVersiLama,
  validasiBerkas,
} from "../src/lib/jenisBerkas";
import { buatPaketArsip, folderJenis, namaPaketArsip, periksaBatasArsip, riwayatTeks, ringkasanCsv, selCsv, susunJalurZip } from "../src/lib/arsip";
import type { Aktivitas, Dokumen, Kontrak, Sesi } from "../src/lib/types";

let nomor = 0;
const kasus = async (nama: string, fn: () => void | Promise<void>) => {
  await fn();
  nomor++;
  console.log(`ok ${nomor} - ${nama}`);
};

function kontrak(sebagian: Partial<Kontrak> = {}): Kontrak {
  return {
    id: 7,
    judul: "Pengadaan Beton Ready Mix",
    nomorPengajuan: "PGJ-2026-0012",
    nomorKontrak: "",
    jenis: "Pengadaan Barang",
    divisi: "SCM",
    mitra: "PT Beton Jaya",
    nilai: 1_500_000_000,
    mataUang: "IDR",
    tanggalMulai: "2026-10-01",
    tanggalBerakhir: "2027-09-30",
    status: "Review Legal",
    prioritas: "Normal",
    deskripsi: "",
    targetSelesai: null,
    pengajuEmail: "andi@waskitainfrastruktur.co.id",
    pengajuNama: "Andi",
    picLegalEmail: "",
    picLegalNama: "",
    tanggalDiajukan: null,
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
    dibuat: "2026-09-30T02:00:00Z",
    diubah: "2026-10-01T02:00:00Z",
    webUrl: "",
    ...sebagian,
  };
}

const sesi = (peran: Sesi["peran"], email = "x@waskitainfrastruktur.co.id", divisi: Sesi["divisi"] = "Legal"): Sesi => ({ email, nama: peran, peran, divisi, penggunaId: 1 });
const admin = sesi("Admin");
const legal = sesi("Legal");
const pengaju = sesi("Pengaju", "andi@waskitainfrastruktur.co.id", "SCM");
const pengajuLain = sesi("Pengaju", "budi@waskitainfrastruktur.co.id", "Pengadaan");
const pemantau = sesi("Pemantau");

function dok(id: string, nama: string, jenis: Dokumen["jenis"], diubah: string, ukuran = 1000): Dokumen {
  return { id, nama, jenis, diubah, ukuran, webUrl: `https://x/${id}`, unduhUrl: null, diubahOleh: "Sari" };
}

async function main() {
  // --- Ekstensi dan tampilan -----------------------------------------------------
  await kasus("ekstensi dikenali tanpa peduli huruf besar, berkas tanpa ekstensi atau dot-file kosong", () => {
    assert.equal(ekstensiDari("Draft.Final.PDF"), "pdf");
    assert.equal(ekstensiDari("README"), "");
    assert.equal(ekstensiDari(".env"), "");
    assert.equal(ekstensiDari("akhir."), "");
  });

  await kasus("ikon dan kelompok per ekstensi", () => {
    assert.equal(tampilanBerkas("a.pdf").kelompok, "pdf");
    assert.equal(tampilanBerkas("a.DOC").kelompok, "docx");
    assert.equal(tampilanBerkas("a.xlsx").ikon, "FileSpreadsheet");
    assert.equal(tampilanBerkas("foto.JPEG").kelompok, "gambar");
    assert.equal(tampilanBerkas("arsip.7z").kelompok, "zip");
    assert.equal(tampilanBerkas("gambar.dwg").kelompok, "lainnya");
    // Warna hanya token tanpa pengubah opasitas.
    for (const n of ["a.pdf", "a.docx", "a.xlsx", "a.png", "a.zip", "a.dwg"]) assert.ok(!tampilanBerkas(n).kelas.includes("/"), n);
  });

  // --- Tebakan jenis ---------------------------------------------------------------
  await kasus("token memisah camelCase, angka, dan tanda baca", () => {
    assert.deepEqual(tokenKata("BAST_Tahap2-final.pdf"), ["bast", "tahap", "2", "final"]);
    assert.deepEqual(tokenKata("SuratKuasaDirektur.docx"), ["surat", "kuasa", "direktur"]);
    assert.deepEqual(tokenKata("SPHBetonJaya.pdf"), ["sph", "beton", "jaya"]);
  });

  await kasus("tebakan aman untuk jenis umum", () => {
    assert.equal(tebakJenis("BAST_Tahap2.pdf"), "BAST");
    assert.equal(tebakJenis("Berita Acara Serah Terima.pdf"), "BAST");
    assert.equal(tebakJenis("SPH PT Beton Jaya.pdf"), "Penawaran");
    assert.equal(tebakJenis("Surat Penawaran Harga.pdf"), "Penawaran");
    assert.equal(tebakJenis("PO-2026-001.pdf"), "SPK / PO");
    assert.equal(tebakJenis("SPK Pekerjaan Galian.docx"), "SPK / PO");
    assert.equal(tebakJenis("BA Negosiasi Harga.pdf"), "BA Negosiasi");
    assert.equal(tebakJenis("Akta Pendirian.pdf"), "Legalitas Mitra");
    assert.equal(tebakJenis("NIB_dan_NPWP.pdf"), "Legalitas Mitra");
    assert.equal(tebakJenis("Surat Kuasa Direksi.pdf"), "Surat Kuasa");
    assert.equal(tebakJenis("Bank Garansi Pelaksanaan.pdf"), "Jaminan / Bank Garansi");
    assert.equal(tebakJenis("Draft Kontrak v2.docx"), "Draft Kontrak");
    assert.equal(tebakJenis("draft_final_kontrak.docx"), "Draft Final");
  });

  await kasus("TIDAK PERNAH menebak Kontrak Ditandatangani dari final, signed, ttd", () => {
    for (const n of ["Kontrak FINAL.pdf", "kontrak_signed.pdf", "Kontrak TTD lengkap.pdf", "Kontrak ditandatangani.pdf", "final-signed-v3.pdf", "Signed.pdf"]) {
      assert.notEqual(tebakJenis(n), "Kontrak Ditandatangani", n);
    }
    assert.equal(tebakJenis("Kontrak FINAL.pdf"), null);
  });

  await kasus("tebakan memakai kata utuh, bukan potongan kata", () => {
    // "po" di dalam "Laporan" atau "Proposal" bukan PO; "bast" di dalam "Sebastian" bukan BAST.
    assert.equal(tebakJenis("Laporan Proyek.pdf"), null);
    assert.equal(tebakJenis("Proposal Teknis.pdf"), null);
    assert.equal(tebakJenis("Foto Sebastian.jpg"), null);
    assert.equal(tebakJenis("Jaminanku.pdf"), null);
    assert.equal(tebakJenis(""), null);
  });

  // --- Batas ukuran dan tipe -------------------------------------------------------
  await kasus("validasi berkas: tipe berbahaya, format asing, kosong, terlalu besar", () => {
    assert.equal(validasiBerkas("draft.pdf", 2_000_000), null);
    assert.match(validasiBerkas("setup.exe", 10)!, /tidak diizinkan/);
    assert.match(validasiBerkas("halaman.html", 10)!, /tidak diizinkan/);
    assert.match(validasiBerkas("data.xyz", 10)!, /belum didukung/);
    assert.match(validasiBerkas("tanpa", 10)!, /ekstensi/);
    assert.match(validasiBerkas("kosong.pdf", 0)!, /kosong/);
    assert.match(validasiBerkas("besar.pdf", 101 * 1024 * 1024)!, /melebihi batas/);
    assert.equal(validasiBerkas("pas.pdf", 100 * 1024 * 1024), null);
  });

  await kasus("nama berkas aman untuk SharePoint", () => {
    assert.equal(namaBerkasAman('Kontrak: "Final"?.pdf'), "Kontrak- -Final--.pdf");
    assert.equal(namaBerkasAman("~$draft.docx"), "draft.docx");
    assert.equal(namaBerkasAman("  spasi   ganda .pdf. "), "spasi ganda .pdf");
    assert.equal(namaBerkasAman("..."), "berkas");
    const panjang = namaBerkasAman(`${"a".repeat(300)}.docx`);
    assert.equal(panjang.length, 150);
    assert.ok(panjang.endsWith(".docx"));
  });

  await kasus("versi baru harus seformat dan kepala PDF dikenali", () => {
    assert.ok(sepadanEkstensi("Draft.docx", "Draft revisi.DOCX"));
    assert.ok(!sepadanEkstensi("Draft.docx", "Draft.pdf"));
    assert.ok(kepalaPdfValid("%PDF-"));
    assert.ok(!kepalaPdfValid("PK\u0003\u0004"));
    assert.ok(bolehJadiKontrakFinal("Kontrak TTD.PDF"));
    assert.ok(!bolehJadiKontrakFinal("Kontrak TTD.docx"));
  });

  // --- Pratinjau -------------------------------------------------------------------
  await kasus("mode pratinjau: PDF dan gambar di laci, Office/besar/iOS ke tab baru", () => {
    assert.equal(modePratinjau("a.pdf", 1_000_000).mode, "pdf");
    assert.equal(modePratinjau("a.png", 1_000_000).mode, "gambar");
    assert.equal(modePratinjau("a.docx", 1_000).mode, "tab");
    assert.equal(modePratinjau("a.pdf", 26 * 1024 * 1024).mode, "tab");
    assert.equal(modePratinjau("a.pdf", 1_000, { ios: true }).mode, "tab");
    assert.equal(modePratinjau("a.jpg", 1_000, { ios: true }).mode, "gambar");
    assert.equal(modePratinjau("a.heic", 1_000).mode, "tab");
  });

  // --- Pengelompokan dan syarat ---------------------------------------------------------
  await kasus("kelompok per jenis berurutan, lencana Terbaru hanya bila lebih dari satu, jenis kosong paling bawah", () => {
    const g = kelompokkanDokumen([
      dok("1", "Draft v1.docx", "Draft Kontrak", "2026-09-01T00:00:00Z"),
      dok("2", "SPH.pdf", "Penawaran", "2026-09-02T00:00:00Z"),
      dok("3", "Draft v2.docx", "Draft Kontrak", "2026-09-05T00:00:00Z"),
      dok("4", "scan.pdf", "", "2026-09-06T00:00:00Z"),
      dok("5", "aneh.pdf", "Bukan Jenis" as Dokumen["jenis"], "2026-09-06T00:00:00Z"),
    ]);
    assert.deepEqual(
      g.map((x) => x.jenis),
      ["Draft Kontrak", "Penawaran", ""],
    );
    assert.equal(g[0]!.terbaruId, "3");
    assert.equal(g[0]!.dokumen[0]!.id, "3");
    assert.equal(g[1]!.terbaruId, null);
    assert.deepEqual(g[2]!.dokumen.map((d) => d.id).sort(), ["4", "5"]);
    assert.deepEqual(kelompokkanDokumen([]), []);
  });

  await kasus("hitung syarat: unik, urutan syarat, jenis kosong diabaikan", () => {
    const h = hitungSyarat(["Penawaran", "Legalitas Mitra", "Penawaran", "Draft Kontrak"], ["Draft Kontrak", "", "BAST"]);
    assert.deepEqual(h.terpenuhi, ["Draft Kontrak"]);
    assert.deepEqual(h.kurang, ["Penawaran", "Legalitas Mitra"]);
    assert.deepEqual(hitungSyarat([], ["BAST"]), { terpenuhi: [], kurang: [] });
  });

  // --- Hak --------------------------------------------------------------------------------
  await kasus("Kontrak Ditandatangani pada kontrak Aktif hanya boleh dihapus Admin", () => {
    const aktif = kontrak({ status: "Aktif" });
    assert.equal(bolehHapusDokumen(aktif, "Kontrak Ditandatangani", admin).boleh, true);
    assert.equal(bolehHapusDokumen(aktif, "Kontrak Ditandatangani", legal).boleh, false);
    assert.equal(bolehHapusDokumen(aktif, "Kontrak Ditandatangani", pengaju).boleh, false);
    assert.equal(bolehHapusDokumen(kontrak({ status: "Proses Tanda Tangan" }), "Kontrak Ditandatangani", legal).boleh, true);
    assert.equal(bolehHapusDokumen(aktif, "Draft Kontrak", legal).boleh, true);
  });

  await kasus("pengaju hanya mengubah saat Diajukan/Perlu Revisi, pengaju lain dan Pemantau ditolak", () => {
    assert.equal(bolehHapusDokumen(kontrak({ status: "Perlu Revisi" }), "Penawaran", pengaju).boleh, true);
    assert.equal(bolehHapusDokumen(kontrak({ status: "Review Legal" }), "Penawaran", pengaju).boleh, false);
    assert.equal(bolehHapusDokumen(kontrak({ status: "Diajukan" }), "Penawaran", pengajuLain).boleh, false);
    assert.equal(bolehHapusDokumen(kontrak({ status: "Diajukan" }), "Penawaran", pemantau).boleh, false);
    assert.equal(bolehHapusDokumen(kontrak({ status: "Dibatalkan" }), "Penawaran", admin).boleh, false);
    // Versi baru: pengaju boleh selama kontrak diproses.
    assert.equal(izinDokumen(kontrak({ status: "Review Legal" }), "Draft Kontrak", "versi", pengaju).boleh, true);
    assert.equal(izinDokumen(kontrak({ status: "Aktif" }), "Draft Kontrak", "versi", pengaju).boleh, false);
  });

  await kasus("ubah jenis memeriksa jenis asal dan tujuan; pengaju tidak bisa memilih Kontrak Ditandatangani", () => {
    const k = kontrak({ status: "Diajukan" });
    assert.equal(izinUbahJenis(k, "", "Penawaran", pengaju).boleh, true);
    assert.equal(izinUbahJenis(k, "Penawaran", "Kontrak Ditandatangani", pengaju).boleh, false);
    assert.equal(izinUbahJenis(kontrak({ status: "Aktif" }), "Kontrak Ditandatangani", "Lainnya", legal).boleh, false);
    assert.equal(izinUbahJenis(kontrak({ status: "Aktif" }), "Lainnya", "Kontrak Ditandatangani", legal).boleh, false);
    assert.ok(!pilihanJenisUntuk(pengaju).includes("Kontrak Ditandatangani"));
    assert.ok(pilihanJenisUntuk(legal).includes("Kontrak Ditandatangani"));
  });

  // --- Versi ------------------------------------------------------------------------------
  await kasus("label versi ke nomor _vti_history dan teks tampilan", () => {
    assert.equal(nomorInternalVersi("1.0"), 512);
    assert.equal(nomorInternalVersi("3.0"), 1536);
    assert.equal(nomorInternalVersi("2.1"), 1025);
    assert.equal(nomorInternalVersi("abc"), null);
    assert.equal(nomorInternalVersi("1.600"), null);
    assert.equal(teksVersi("3.0"), "v3");
    assert.equal(teksVersi("2.1"), "v2.1");
    assert.equal(teksVersi("aneh"), "aneh");
  });

  await kasus("alamat versi lama disusun dari site, library, folder, dan nama yang dienkode", () => {
    const site = "https://waskitainfra.sharepoint.com/sites/KontrakWKI";
    assert.equal(
      urlVersiLama(site, `${site}/BerkasKontrak`, "PGJ-2026-0012", "Draft #1.docx", "2.0"),
      `${site}/_vti_history/1024/BerkasKontrak/PGJ-2026-0012/Draft%20%231.docx`,
    );
    assert.equal(urlVersiLama(site, "https://lain.sharepoint.com/X", "f", "n.pdf", "1.0"), null);
    assert.equal(urlVersiLama(site, `${site}/BerkasKontrak`, "f", "n.pdf", "x"), null);
    assert.equal(urlVersiLama(site, site, "f", "n.pdf", "1.0"), null);
  });

  await kasus("dokumen final terbaru hanya dari jenis Kontrak Ditandatangani", () => {
    const daftar = [
      dok("a", "Kontrak final.pdf", "Draft Final", "2026-10-05T00:00:00Z"),
      dok("b", "TTD lama.pdf", "Kontrak Ditandatangani", "2026-10-01T00:00:00Z"),
      dok("c", "TTD baru.pdf", "Kontrak Ditandatangani", "2026-10-03T00:00:00Z"),
    ];
    assert.equal(dokumenFinalTerbaru(daftar)?.id, "c");
    assert.equal(dokumenFinalTerbaru(daftar.slice(0, 1)), null);
    assert.equal(dokumenFinalTerbaru([]), null);
  });

  // --- Arsip ------------------------------------------------------------------------------
  await kasus("sel CSV mengutip dan menetralkan rumus", () => {
    assert.equal(selCsv('Kata "kutip"'), '"Kata ""kutip"""');
    assert.equal(selCsv("=HYPERLINK(1)"), `"'=HYPERLINK(1)"`);
    assert.equal(selCsv("-5"), `"'-5"`);
    assert.equal(selCsv(null), '""');
    assert.equal(selCsv(1500), '"1500"');
  });

  await kasus("jalur ZIP per jenis, garis miring diganti, nama kembar diberi nomor", () => {
    assert.equal(folderJenis("SPK / PO"), "SPK - PO");
    assert.equal(folderJenis(""), "Jenis belum diisi");
    const j = susunJalurZip([
      dok("1", "PO.pdf", "SPK / PO", "2026-01-01T00:00:00Z"),
      dok("2", "po.pdf", "SPK / PO", "2026-01-02T00:00:00Z"),
      dok("3", "PO.pdf", "SPK / PO", "2026-01-03T00:00:00Z"),
      dok("4", "README", "", "2026-01-03T00:00:00Z"),
    ]);
    assert.equal(j.get("1"), "dokumen/SPK - PO/PO.pdf");
    assert.equal(j.get("2"), "dokumen/SPK - PO/po (2).pdf");
    assert.equal(j.get("3"), "dokumen/SPK - PO/PO (3).pdf");
    assert.equal(j.get("4"), "dokumen/Jenis belum diisi/README");
  });

  await kasus("ringkasan CSV memuat identitas dan status tiap dokumen, riwayat urut dari yang terlama", () => {
    const k = kontrak({ nomorKontrak: "WKI/2026/001" });
    const d = [dok("1", "SPH.pdf", "Penawaran", "2026-09-01T03:00:00Z"), dok("2", "rusak.pdf", "", "2026-09-02T03:00:00Z")];
    const csv = ringkasanCsv(k, d, susunJalurZip(d), new Map([["2", "HTTP 404"]]), new Date("2026-10-02T07:00:00Z"));
    assert.ok(csv.startsWith("﻿"));
    assert.ok(csv.includes('"Nomor Kontrak";"WKI/2026/001"'));
    assert.ok(csv.includes('"dokumen/Penawaran/SPH.pdf";"Termasuk"'));
    assert.ok(csv.includes('"Tidak ikut: HTTP 404"'));
    const akt: Aktivitas[] = [
      { id: 2, kontrakId: 7, jenis: "Status", pesan: "Lanjut", statusDari: "Diajukan", statusKe: "Review Legal", olehEmail: "", olehNama: "Sari", waktu: "2026-09-03T03:00:00Z", detail: [], disebut: [] },
      { id: 1, kontrakId: 7, jenis: "Dibuat", pesan: "Pengajuan dibuat", statusDari: "", statusKe: "", olehEmail: "", olehNama: "Andi", waktu: "2026-09-01T03:00:00Z", detail: [{ kolom: "Nilai", dari: "", ke: "1500" }], disebut: [] },
    ];
    const t = riwayatTeks(k, akt);
    assert.ok(t.indexOf("Dibuat oleh Andi") < t.indexOf("Status oleh Sari"));
    assert.ok(t.includes("Diajukan -> Review Legal"));
    assert.ok(t.includes("- Nilai: (kosong) -> 1500"));
    assert.ok(riwayatTeks(k, []).includes("Belum ada aktivitas"));
  });

  await kasus("batas paket dan nama berkas paket", () => {
    assert.equal(periksaBatasArsip([{ ukuran: 100 }], 100), null);
    assert.match(periksaBatasArsip([{ ukuran: 60 }, { ukuran: 50 }], 100)!, /melebihi batas/);
    assert.equal(namaPaketArsip({ nomorPengajuan: "PGJ/2026/12" }, new Date("2026-10-02T20:00:00Z")), "Arsip PGJ-2026-12 2026-10-03.zip");
  });

  await kasus("paket ZIP dibuat dengan jszip, dokumen gagal dilewati dan dilaporkan", async () => {
    const d = [dok("1", "SPH.pdf", "Penawaran", "2026-09-01T03:00:00Z"), dok("2", "rusak.pdf", "Lainnya", "2026-09-02T03:00:00Z")];
    const progres: number[] = [];
    const hasil = await buatPaketArsip(kontrak(), d, [], (p) => progres.push(p.persen), {
      unduh: async (x) => {
        if (x.id === "2") throw new Error("HTTP 404");
        return new Blob(["%PDF-1.7 isi"], { type: "application/pdf" });
      },
      sekarang: new Date("2026-10-02T03:00:00Z"),
    });
    assert.equal(hasil.namaBerkas, "Arsip PGJ-2026-0012 2026-10-02.zip");
    assert.deepEqual(hasil.dilewati, [{ nama: "rusak.pdf", alasan: "HTTP 404" }]);
    assert.ok(hasil.blob.size > 0);
    assert.ok(progres.length >= 3 && progres[progres.length - 1]! >= 85);
    const { default: JSZip } = await import("jszip");
    const isi = await JSZip.loadAsync(await hasil.blob.arrayBuffer());
    assert.deepEqual(Object.keys(isi.files).filter((n) => !isi.files[n]!.dir).sort(), ["dokumen/Penawaran/SPH.pdf", "ringkasan.csv", "riwayat.txt"]);
    assert.equal(await isi.file("dokumen/Penawaran/SPH.pdf")!.async("string"), "%PDF-1.7 isi");
  });

  await kasus("paket ditolak bila melewati batas atau semua dokumen gagal", async () => {
    await assert.rejects(buatPaketArsip(kontrak(), [dok("1", "a.pdf", "Lainnya", "2026-01-01T00:00:00Z", 500)], [], undefined, { batas: 100 }), /melebihi batas/);
    await assert.rejects(
      buatPaketArsip(kontrak(), [dok("1", "a.pdf", "Lainnya", "2026-01-01T00:00:00Z")], [], undefined, {
        unduh: async () => {
          throw new Error("jaringan putus");
        },
      }),
      /Tidak satu pun/,
    );
  });

  console.log(`\n${nomor} kasus lulus.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
