// Ekspor daftar kontrak ke Excel (ExcelJS, dimuat hanya saat tombol ditekan) dan CSV.
//
// Buku Excel berisi:
//   - Kontrak   : satu baris per kontrak induk. Nilai awal dan "Selisih Addendum" dipisah; Nilai Efektif berupa rumus.
//   - Addendum  : semua addendum dari kontrak yang diekspor, dengan nomor induknya.
//   - Ringkasan : rumus COUNTIFS/SUMIFS hidup ke lembar Kontrak, jadi tetap benar bila baris disaring atau diubah.
//   - Layanan dan Riwayat Status: hanya bila laporan dan riwayatnya diberikan (tombol "Laporan bulan ini").
//
// Keamanan: teks dari pengguna yang diawali = + - @ (juga tab dan carriage return) diberi apostrof di depan,
// supaya tidak dijalankan sebagai rumus saat berkas dibuka (CSV injection). Angka tidak disentuh.
import type { Workbook, Worksheet } from "exceljs";
import { adalahAddendum, bedaMataUang, ringkasAddendum } from "./addendum";
import { urlKontrak } from "./emailKit";
import { STATUS_HASIL, dalamPeriode, waktuMasuk, type EventStatus, type Laporan, type Periode } from "./laporan";
import { umurTahapHari } from "./sla";
import { DAFTAR_STATUS, DIVISI_PENGAJU, MATA_UANG, STATUS_PROSES, type Kontrak, type MataUang, type Ymd } from "./types";

// --- Sanitasi dan format dasar --------------------------------------------------------------

const AWALAN_BAHAYA = /^[=+\-@\t\r]/;

/** Teks yang bisa dibaca sebagai rumus oleh Excel diberi apostrof di depan. */
export function amankanTeks(v: string): string {
  return AWALAN_BAHAYA.test(v) ? `'${v}` : v;
}

const OFFSET_WIB_MS = 7 * 3_600_000;

/**
 * Excel tidak mengenal zona waktu: yang tersimpan adalah angka jam dinding. ExcelJS menulis Date menurut
 * komponen UTC-nya, jadi waktu digeser +7 jam agar sel menampilkan jam WIB.
 */
export function tanggalJamWib(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms + OFFSET_WIB_MS);
}

export function tanggalExcel(ymd: Ymd | null | undefined): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return new Date(`${ymd}T00:00:00Z`);
}

const dua = (n: number) => String(n).padStart(2, "0");
const teksTanggalId = (d: Date) => `${dua(d.getUTCDate())}/${dua(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
const teksTanggalJamId = (d: Date) => `${teksTanggalId(d)} ${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())}`;

const FORMAT_TANGGAL = "dd/mm/yyyy";
const FORMAT_WAKTU = "dd/mm/yyyy hh:mm";
const formatAngka = (m: MataUang | "" | null) => (m === "IDR" || !m ? "#,##0" : "#,##0.00");

// --- Baris kontrak -------------------------------------------------------------------------

export interface BarisKontrakEkspor {
  nomorPengajuan: string;
  nomorKontrak: string;
  judul: string;
  jenis: string;
  divisi: string;
  mitra: string;
  mataUang: MataUang;
  /** Nilai awal kontrak (tanpa addendum). */
  nilai: number | null;
  /** Jumlah selisih nilai dari addendum aktif; null bila tidak ada addendum yang mengubah nilai. */
  selisihAddendum: number | null;
  nilaiEfektif: number | null;
  berakhirEfektif: Ymd | null;
  status: string;
  picLegal: string;
  pengaju: string;
  /** ISO, ditampilkan dalam WIB. */
  masuk: string | null;
  /** Hari di status sekarang, hanya untuk kontrak yang masih diproses. */
  umurTahapHari: number | null;
  targetSelesai: Ymd | null;
  kodeProyek: string;
  nomorReferensi: string;
  tautan: string;
  /** Tautan berkas kontrak bertanda tangan (kolom KontrakFinal); kosong bila belum ada atau bukan https. */
  kontrakFinal: string;
  /** Mode berakhir (K02), kosong bila belum diisi. */
  modeBerakhir: string;
}

export function barisKontrakEkspor(k: Kontrak, semua: Kontrak[], sekarang: number): BarisKontrakEkspor {
  const r = ringkasAddendum(k, semua);
  const selisih = r.nilaiBerubah ? r.aktif.filter((a) => a.nilai != null && a.mataUang === k.mataUang).reduce((n, a) => n + (a.nilai ?? 0), 0) : null;
  const umur = STATUS_PROSES.includes(k.status) ? umurTahapHari(k, sekarang) : null;
  return {
    nomorPengajuan: k.nomorPengajuan,
    nomorKontrak: k.nomorKontrak,
    judul: k.judul,
    jenis: k.jenis,
    divisi: k.divisi,
    mitra: k.mitra,
    mataUang: k.mataUang,
    nilai: k.nilai,
    selisihAddendum: selisih,
    nilaiEfektif: r.nilaiEfektif,
    berakhirEfektif: r.berakhirEfektif,
    status: k.status,
    picLegal: k.picLegalNama,
    pengaju: k.pengajuNama,
    masuk: k.tanggalDiajukan ?? k.dibuat,
    umurTahapHari: umur == null ? null : Math.round(umur * 10) / 10,
    targetSelesai: k.targetSelesai,
    kodeProyek: k.kodeProyek,
    nomorReferensi: k.nomorReferensi,
    tautan: urlKontrak(k.id, "legal"),
    kontrakFinal: tautanAman(k.kontrakFinal),
    modeBerakhir: k.modeBerakhir ?? "",
  };
}

/** Hanya tautan https yang diekspor sebagai hyperlink; selain itu dikosongkan (bukan dijalankan). */
export function tautanAman(url: string | null | undefined): string {
  const v = (url ?? "").trim();
  // eslint-disable-next-line no-control-regex
  return /^https:\/\/[^"<>\u0000-\u001f]+$/i.test(v) ? v.replace(/ /g, "%20") : "";
}

type JenisKolom = "teks" | "uang" | "angka" | "tanggal" | "waktu" | "tautan";

interface Kolom<T> {
  judul: string;
  lebar: number;
  jenis: JenisKolom;
  ambil: (b: T) => string | number | null;
  /** Teks sel untuk kolom tautan di Excel (bawaan "Buka"). CSV selalu berisi alamatnya. */
  teksTautan?: string;
}

export const KOLOM_KONTRAK: readonly Kolom<BarisKontrakEkspor>[] = [
  { judul: "Nomor Pengajuan", lebar: 18, jenis: "teks", ambil: (b) => b.nomorPengajuan },
  { judul: "Nomor Kontrak", lebar: 22, jenis: "teks", ambil: (b) => b.nomorKontrak },
  { judul: "Judul", lebar: 44, jenis: "teks", ambil: (b) => b.judul },
  { judul: "Jenis", lebar: 22, jenis: "teks", ambil: (b) => b.jenis },
  { judul: "Divisi", lebar: 12, jenis: "teks", ambil: (b) => b.divisi },
  { judul: "Mitra", lebar: 30, jenis: "teks", ambil: (b) => b.mitra },
  { judul: "Mata Uang", lebar: 10, jenis: "teks", ambil: (b) => b.mataUang },
  { judul: "Nilai Kontrak", lebar: 18, jenis: "uang", ambil: (b) => b.nilai },
  { judul: "Selisih Addendum", lebar: 18, jenis: "uang", ambil: (b) => b.selisihAddendum },
  { judul: "Nilai Efektif", lebar: 18, jenis: "uang", ambil: (b) => b.nilaiEfektif },
  { judul: "Berakhir Efektif", lebar: 15, jenis: "tanggal", ambil: (b) => b.berakhirEfektif },
  { judul: "Status", lebar: 20, jenis: "teks", ambil: (b) => b.status },
  { judul: "PIC Legal", lebar: 22, jenis: "teks", ambil: (b) => b.picLegal },
  { judul: "Pengaju", lebar: 22, jenis: "teks", ambil: (b) => b.pengaju },
  { judul: "Masuk (WIB)", lebar: 17, jenis: "waktu", ambil: (b) => b.masuk },
  { judul: "Umur Tahap (hari)", lebar: 12, jenis: "angka", ambil: (b) => b.umurTahapHari },
  { judul: "Target Selesai", lebar: 15, jenis: "tanggal", ambil: (b) => b.targetSelesai },
  { judul: "Kode Proyek", lebar: 14, jenis: "teks", ambil: (b) => b.kodeProyek },
  { judul: "Nomor Referensi", lebar: 18, jenis: "teks", ambil: (b) => b.nomorReferensi },
  { judul: "Tautan", lebar: 12, jenis: "tautan", ambil: (b) => b.tautan },
  // Kolom baru ditambahkan di belakang supaya letak kolom lama (dan rumus Ringkasan) tidak bergeser.
  { judul: "Kontrak Final", lebar: 14, jenis: "tautan", ambil: (b) => b.kontrakFinal, teksTautan: "Unduh" },
  { judul: "Mode Berakhir", lebar: 20, jenis: "teks", ambil: (b) => b.modeBerakhir },
];

/** Huruf kolom Excel (1 = A). */
export function hurufKolom(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

const indeksKolom = (judul: string) => KOLOM_KONTRAK.findIndex((k) => k.judul === judul) + 1;
const KOL = {
  divisi: hurufKolom(indeksKolom("Divisi")),
  mataUang: hurufKolom(indeksKolom("Mata Uang")),
  nilai: hurufKolom(indeksKolom("Nilai Kontrak")),
  selisih: hurufKolom(indeksKolom("Selisih Addendum")),
  efektif: hurufKolom(indeksKolom("Nilai Efektif")),
  status: hurufKolom(indeksKolom("Status")),
};

/** Kontrak induk yang diekspor (addendum dipindah ke lembarnya sendiri), urut nomor pengajuan. */
export function pisahkanAddendum(kontrak: Kontrak[], semua: Kontrak[]): { induk: Kontrak[]; addendum: Kontrak[] } {
  const induk = kontrak.filter((k) => !adalahAddendum(k));
  const idInduk = new Set(induk.map((k) => k.id));
  const addendum = new Map<number, Kontrak>();
  for (const k of kontrak) if (adalahAddendum(k)) addendum.set(k.id, k);
  for (const k of semua) if (adalahAddendum(k) && idInduk.has(k.kontrakIndukId!)) addendum.set(k.id, k);
  const urutNomor = (a: Kontrak, b: Kontrak) => a.nomorPengajuan.localeCompare(b.nomorPengajuan) || a.id - b.id;
  return { induk: [...induk].sort(urutNomor), addendum: [...addendum.values()].sort((a, b) => (a.kontrakIndukId ?? 0) - (b.kontrakIndukId ?? 0) || (a.urutanAddendum ?? 0) - (b.urutanAddendum ?? 0) || a.id - b.id) };
}

/**
 * Kontrak untuk "Laporan bulan ini" (atau periode lain): yang masuk di periode, yang mendapat hasil
 * (aktif, ditolak, dibatalkan) di periode, dan yang masih diproses saat ini.
 */
export function kontrakUntukPeriode(semua: Kontrak[], event: readonly EventStatus[], periode: Periode): Kontrak[] {
  const selesai = new Set(event.filter((e) => STATUS_HASIL.includes(e.statusKe) && dalamPeriode(Date.parse(e.waktu), periode)).map((e) => e.kontrakId));
  return semua.filter((k) => dalamPeriode(waktuMasuk(k), periode) || selesai.has(k.id) || STATUS_PROSES.includes(k.status));
}

// --- CSV ----------------------------------------------------------------------------------------

function selCsv(jenis: JenisKolom, v: string | number | null): string {
  let teks = "";
  if (v != null && v !== "") {
    if (typeof v === "number") teks = String(v).replace(".", ",");
    else if (jenis === "tanggal") teks = tanggalExcel(v) ? teksTanggalId(tanggalExcel(v)!) : amankanTeks(v);
    else if (jenis === "waktu") teks = tanggalJamWib(v) ? teksTanggalJamId(tanggalJamWib(v)!) : amankanTeks(v);
    else teks = amankanTeks(v);
  }
  return `"${teks.replace(/"/g, '""')}"`;
}

/** Isi CSV (pemisah ";" dan koma desimal, sesuai Excel berbahasa Indonesia), tanpa BOM. */
export function susunCsv(kontrak: Kontrak[], semua: Kontrak[], sekarang: number = Date.now()): string {
  const baris = kontrak.map((k) => barisKontrakEkspor(k, semua, sekarang));
  return [KOLOM_KONTRAK.map((k) => selCsv("teks", k.judul)).join(";"), ...baris.map((b) => KOLOM_KONTRAK.map((k) => selCsv(k.jenis, k.ambil(b))).join(";"))].join("\r\n");
}

// --- Unduh -------------------------------------------------------------------------------------------

export function unduhBlob(blob: Blob, namaBerkas: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: namaBerkas, rel: "noopener" });
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Dicabut setelah peramban sempat memulai unduhan; mencabut seketika bisa membatalkannya di beberapa peramban.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const stempel = (sekarang: number) => new Date(sekarang + OFFSET_WIB_MS).toISOString().slice(0, 16).replace("T", "-").replace(":", "");

export function eksporKontrakCsv(kontrak: Kontrak[], semua: Kontrak[], opsi: { namaBerkas?: string; sekarang?: number } = {}) {
  const sekarang = opsi.sekarang ?? Date.now();
  const isi = susunCsv(kontrak, semua, sekarang);
  // BOM supaya Excel membaca UTF-8 dengan benar.
  unduhBlob(new Blob(["﻿" + isi], { type: "text/csv;charset=utf-8" }), `${opsi.namaBerkas ?? `kontrak-wki-${stempel(sekarang)}`}.csv`);
}

// --- Excel -----------------------------------------------------------------------------------------------

export interface OpsiEksporExcel {
  /** Tanpa ekstensi. */
  namaBerkas?: string;
  /** Keterangan cakupan di lembar Ringkasan, mis. "Status: Aktif · Divisi: SCM" atau "Oktober 2026". */
  cakupan?: string;
  sekarang?: number;
  /** Bila diisi, lembar Layanan ditambahkan. */
  laporan?: Laporan;
  /** Bila diisi, lembar Riwayat Status ditambahkan (hanya kontrak yang diekspor). */
  riwayat?: readonly EventStatus[];
}

const WARNA_KEPALA = "FF0B1F3A";
const WARNA_KEPALA_TEKS = "FFFFFFFF";
const WARNA_SUBJUDUL = "FFDCF3F0";

function gayaKepala(ws: Worksheet, baris: number, jumlahKolom: number) {
  const r = ws.getRow(baris);
  for (let c = 1; c <= jumlahKolom; c++) {
    const sel = r.getCell(c);
    sel.font = { bold: true, color: { argb: WARNA_KEPALA_TEKS } };
    sel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WARNA_KEPALA } };
    sel.alignment = { vertical: "middle", wrapText: true };
  }
  r.height = 30;
}

function isiSel<T>(ws: Worksheet, baris: number, kol: number, k: Kolom<T>, v: string | number | null, mataUang: MataUang | null) {
  const sel = ws.getRow(baris).getCell(kol);
  if (v == null || v === "") return;
  switch (k.jenis) {
    case "uang":
      sel.value = typeof v === "number" ? v : null;
      sel.numFmt = formatAngka(mataUang);
      return;
    case "angka":
      sel.value = typeof v === "number" ? v : null;
      sel.numFmt = "0.0";
      return;
    case "tanggal": {
      const d = typeof v === "string" ? tanggalExcel(v) : null;
      sel.value = d ?? amankanTeks(String(v));
      if (d) sel.numFmt = FORMAT_TANGGAL;
      return;
    }
    case "waktu": {
      const d = typeof v === "string" ? tanggalJamWib(v) : null;
      sel.value = d ?? amankanTeks(String(v));
      if (d) sel.numFmt = FORMAT_WAKTU;
      return;
    }
    case "tautan":
      sel.value = { text: k.teksTautan ?? "Buka", hyperlink: String(v) };
      sel.font = { color: { argb: "FF0A7F79" }, underline: true };
      return;
    default:
      sel.value = typeof v === "number" ? v : amankanTeks(v);
  }
}

function lembarTabel<T>(wb: Workbook, nama: string, kolom: readonly Kolom<T>[], baris: readonly T[], mataUang: (b: T) => MataUang | null): Worksheet {
  const ws = wb.addWorksheet(nama, { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
  ws.columns = kolom.map((k) => ({ header: k.judul, width: k.lebar }));
  gayaKepala(ws, 1, kolom.length);
  baris.forEach((b, i) => {
    kolom.forEach((k, j) => isiSel(ws, i + 2, j + 1, k, k.ambil(b), mataUang(b)));
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, baris.length + 1), column: kolom.length } };
  return ws;
}

interface BarisAddendumEkspor {
  nomorPengajuan: string;
  nomorInduk: string;
  judulInduk: string;
  ke: number | null;
  judul: string;
  perubahan: string;
  mataUang: MataUang;
  selisih: number | null;
  berakhirBaru: Ymd | null;
  status: string;
  masuk: string | null;
  tautan: string;
  /** Peringatan, mis. mata uang berbeda dari induk (U29A). */
  catatan: string;
}

const KOLOM_ADDENDUM: readonly Kolom<BarisAddendumEkspor>[] = [
  { judul: "Nomor Pengajuan", lebar: 18, jenis: "teks", ambil: (b) => b.nomorPengajuan },
  { judul: "Nomor Pengajuan Induk", lebar: 20, jenis: "teks", ambil: (b) => b.nomorInduk },
  { judul: "Judul Kontrak Induk", lebar: 40, jenis: "teks", ambil: (b) => b.judulInduk },
  { judul: "Addendum ke-", lebar: 10, jenis: "angka", ambil: (b) => b.ke },
  { judul: "Judul Addendum", lebar: 40, jenis: "teks", ambil: (b) => b.judul },
  { judul: "Jenis Perubahan", lebar: 30, jenis: "teks", ambil: (b) => b.perubahan },
  { judul: "Mata Uang", lebar: 10, jenis: "teks", ambil: (b) => b.mataUang },
  { judul: "Selisih Nilai", lebar: 18, jenis: "uang", ambil: (b) => b.selisih },
  { judul: "Berakhir Baru", lebar: 15, jenis: "tanggal", ambil: (b) => b.berakhirBaru },
  { judul: "Status", lebar: 20, jenis: "teks", ambil: (b) => b.status },
  { judul: "Masuk (WIB)", lebar: 17, jenis: "waktu", ambil: (b) => b.masuk },
  { judul: "Tautan", lebar: 12, jenis: "tautan", ambil: (b) => b.tautan },
  { judul: "Catatan", lebar: 44, jenis: "teks", ambil: (b) => b.catatan },
];

function barisAddendum(a: Kontrak, semua: Kontrak[]): BarisAddendumEkspor {
  const induk = semua.find((k) => k.id === a.kontrakIndukId);
  return {
    nomorPengajuan: a.nomorPengajuan,
    nomorInduk: induk?.nomorPengajuan ?? "",
    judulInduk: induk?.judul ?? "",
    ke: a.urutanAddendum,
    judul: a.judul,
    perubahan: a.jenisPerubahan.join(", "),
    mataUang: a.mataUang,
    selisih: a.nilai,
    berakhirBaru: a.tanggalBerakhir,
    status: a.status,
    masuk: a.tanggalDiajukan ?? a.dibuat,
    tautan: urlKontrak(a.id, "legal"),
    catatan: bedaMataUang(a, induk) ? `Mata uang berbeda dari induk (${induk!.mataUang}); selisihnya tidak dijumlahkan ke nilai efektif.` : "",
  };
}

function lembarRingkasan(wb: Workbook, jumlahBaris: number, cakupan: string, sekarang: number) {
  const ws = wb.addWorksheet("Ringkasan");
  const akhir = Math.max(2, jumlahBaris + 1);
  const rentang = (huruf: string) => `'Kontrak'!$${huruf}$2:$${huruf}$${akhir}`;
  ws.columns = [{ width: 28 }, { width: 14 }, ...MATA_UANG.map(() => ({ width: 20 }))];

  ws.getCell("A1").value = "Ringkasan WiCon";
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.getCell("A2").value = "Diekspor (WIB)";
  ws.getCell("B2").value = new Date(sekarang + OFFSET_WIB_MS);
  ws.getCell("B2").numFmt = FORMAT_WAKTU;
  ws.getCell("A3").value = "Cakupan";
  ws.getCell("B3").value = amankanTeks(cakupan || "Semua kontrak yang tampil saat diekspor");
  ws.getCell("A4").value = "Jumlah kontrak";
  ws.getCell("B4").value = { formula: `COUNTA(${rentang("A")})`, result: jumlahBaris };
  ws.getCell("A5").value = "Angka di bawah dihitung ulang otomatis dari lembar Kontrak. Nilai tidak dikonversi antarmata uang.";
  ws.getCell("A5").font = { italic: true, color: { argb: "FF56687A" } };
  for (const c of ["A2", "A3", "A4"]) ws.getCell(c).font = { bold: true };

  let r = 7;
  const kepalaTabel = (judul: string) => {
    ws.getRow(r).values = [judul, "Jumlah", ...MATA_UANG.map((m) => `Nilai efektif ${m}`)];
    gayaKepala(ws, r, 2 + MATA_UANG.length);
    r++;
  };
  const sumifs = (syarat: string) => MATA_UANG.map((m) => ({ formula: `SUMIFS(${rentang(KOL.efektif)},${rentang(KOL.mataUang)},"${m}"${syarat})` }));

  kepalaTabel("Per status");
  for (const s of DAFTAR_STATUS) {
    const syarat = `,${rentang(KOL.status)},"${s}"`;
    ws.getRow(r).values = [s, { formula: `COUNTIFS(${rentang(KOL.status)},"${s}")` }, ...sumifs(syarat)];
    r++;
  }
  r++;
  ws.getRow(r).getCell(1).value = "Per divisi (status Aktif)";
  ws.getRow(r).getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: WARNA_SUBJUDUL } };
  ws.getRow(r).getCell(1).font = { bold: true };
  r++;
  kepalaTabel("Divisi");
  for (const d of DIVISI_PENGAJU) {
    const syarat = `,${rentang(KOL.divisi)},"${d}",${rentang(KOL.status)},"Aktif"`;
    ws.getRow(r).values = [d, { formula: `COUNTIFS(${rentang(KOL.divisi)},"${d}",${rentang(KOL.status)},"Aktif")` }, ...sumifs(syarat)];
    r++;
  }
  for (let i = 8; i < r; i++) for (let c = 3; c <= 2 + MATA_UANG.length; c++) ws.getRow(i).getCell(c).numFmt = formatAngka(MATA_UANG[c - 3]!);
  ws.views = [{ state: "frozen", ySplit: 0, xSplit: 1 }];
}

function lembarLayanan(wb: Workbook, lap: Laporan) {
  const ws = wb.addWorksheet("Layanan");
  ws.columns = [{ width: 30 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  ws.getCell("A1").value = `Laporan layanan Legal · ${lap.periode.label}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = lap.dataTipis
    ? `Datanya masih tipis (${lap.sampelTahap} tahap selesai). Angka di bawah sebaiknya dibaca sebagai gambaran awal.`
    : `${lap.sampelTahap} tahap selesai di periode ini. Statistik dikosongkan bila sampelnya kurang dari 3.`;
  ws.getCell("A2").font = { italic: true };
  ws.getRow(4).values = ["Tahap", "Sampel", "Median (hari)", "P90 (hari)", "Median (hari kerja)", "P90 (hari kerja)"];
  gayaKepala(ws, 4, 6);
  let r = 5;
  const tulis = (label: string, h: { sampel: number; statistik: { kalender: { median: number; p90: number }; kerja: { median: number; p90: number } } | null }) => {
    const s = h.statistik;
    ws.getRow(r).values = [label, h.sampel, s?.kalender.median ?? "sampel kurang", s?.kalender.p90 ?? "", s?.kerja.median ?? "", s?.kerja.p90 ?? ""];
    for (let c = 3; c <= 6; c++) ws.getRow(r).getCell(c).numFmt = "0.0";
    r++;
  };
  for (const t of lap.tahap) tulis(t.tahap, t);
  tulis("Siklus total (diajukan sampai aktif)", lap.siklus);
  tulis("Waktu di Legal per kontrak", lap.legalVsPengaju.legal);
  tulis("Waktu menunggu pengaju per kontrak", lap.legalVsPengaju.pengaju);
  r++;
  ws.getRow(r++).values = ["Kontrak masuk", lap.kontrakMasuk];
  ws.getRow(r++).values = ["Kontrak mendapat hasil", lap.kontrakSelesai];
  ws.getRow(r++).values = ["Kontrak dengan revisi", lap.revisi.denganRevisi];
  ws.getRow(r++).values = ["Rata-rata putaran revisi", lap.revisi.rataRata ?? "sampel kurang"];
  ws.getRow(r++).values = ["Kontrak mengendap saat ini", lap.mengendap.length];
  if (lap.mengendap.length) {
    r++;
    ws.getRow(r).values = ["Mengendap", "Lewat (hari)", "Status", "Menunggu", "Umur (hari)", "Batas (hari)"];
    gayaKepala(ws, r, 6);
    r++;
    for (const m of lap.mengendap) {
      ws.getRow(r).values = [amankanTeks(`${m.kontrak.nomorPengajuan} ${m.kontrak.judul}`), Math.round(m.lewatHari * 10) / 10, m.kontrak.status, m.menunggu, Math.round(m.umurHari * 10) / 10, m.batasHari];
      r++;
    }
  }
}

interface BarisRiwayat {
  waktu: string;
  nomor: string;
  judul: string;
  dari: string;
  ke: string;
  oleh: string;
}

const KOLOM_RIWAYAT: readonly Kolom<BarisRiwayat>[] = [
  { judul: "Waktu (WIB)", lebar: 17, jenis: "waktu", ambil: (b) => b.waktu },
  { judul: "Nomor Pengajuan", lebar: 18, jenis: "teks", ambil: (b) => b.nomor },
  { judul: "Judul", lebar: 40, jenis: "teks", ambil: (b) => b.judul },
  { judul: "Dari", lebar: 20, jenis: "teks", ambil: (b) => b.dari },
  { judul: "Ke", lebar: 20, jenis: "teks", ambil: (b) => b.ke },
  { judul: "Oleh", lebar: 24, jenis: "teks", ambil: (b) => b.oleh },
];

/** Susun buku kerja tanpa mengunduh (dipakai juga oleh skrip uji). */
export async function susunBukuKontrak(kontrak: Kontrak[], semua: Kontrak[], opsi: OpsiEksporExcel = {}): Promise<Workbook> {
  const mod = await import("exceljs");
  const Buku = mod.Workbook ?? (mod as unknown as { default: typeof mod }).default.Workbook;
  const sekarang = opsi.sekarang ?? Date.now();
  const wb = new Buku();
  wb.creator = "WiCon";
  wb.created = new Date(sekarang);

  const { induk, addendum } = pisahkanAddendum(kontrak, semua);
  const baris = induk.map((k) => barisKontrakEkspor(k, semua, sekarang));
  const ws = lembarTabel(wb, "Kontrak", KOLOM_KONTRAK, baris, (b) => b.mataUang);
  // Nilai Efektif sebagai rumus hidup: ikut berubah bila nilai atau selisih disunting di Excel.
  baris.forEach((b, i) => {
    const r = i + 2;
    if (b.nilai == null && b.selisihAddendum == null) return;
    const sel = ws.getCell(`${KOL.efektif}${r}`);
    sel.value = { formula: `N(${KOL.nilai}${r})+N(${KOL.selisih}${r})`, result: b.nilaiEfektif ?? 0 };
    sel.numFmt = formatAngka(b.mataUang);
  });

  lembarTabel(wb, "Addendum", KOLOM_ADDENDUM, addendum.map((a) => barisAddendum(a, semua)), (b) => b.mataUang);
  lembarRingkasan(wb, baris.length, opsi.cakupan ?? "", sekarang);
  if (opsi.laporan) lembarLayanan(wb, opsi.laporan);
  if (opsi.riwayat) {
    const peta = new Map(semua.map((k) => [k.id, k]));
    const diekspor = new Set(kontrak.map((k) => k.id));
    const barisRiwayat = opsi.riwayat
      .filter((e) => diekspor.has(e.kontrakId))
      .map<BarisRiwayat>((e) => ({ waktu: e.waktu, nomor: peta.get(e.kontrakId)?.nomorPengajuan ?? "", judul: peta.get(e.kontrakId)?.judul ?? "", dari: e.statusDari, ke: e.statusKe, oleh: e.olehNama }));
    lembarTabel(wb, "Riwayat Status", KOLOM_RIWAYAT, barisRiwayat, () => null);
  }
  // Ringkasan dibuka pertama: itu yang biasanya dibaca direksi.
  const ringkasan = wb.getWorksheet("Ringkasan");
  if (ringkasan) wb.views = [{ x: 0, y: 0, width: 12000, height: 8000, firstSheet: 0, activeTab: ringkasan.id - 1, visibility: "visible" }];
  return wb;
}

export async function eksporKontrakExcel(kontrak: Kontrak[], semua: Kontrak[], opsi: OpsiEksporExcel = {}): Promise<void> {
  const sekarang = opsi.sekarang ?? Date.now();
  const wb = await susunBukuKontrak(kontrak, semua, { ...opsi, sekarang });
  const buffer = await wb.xlsx.writeBuffer();
  unduhBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${opsi.namaBerkas ?? `kontrak-wki-${stempel(sekarang)}`}.xlsx`);
}
