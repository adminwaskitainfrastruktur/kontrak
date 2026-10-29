// Isi dokumen Lembar Hasil Review Legal: satu susunan blok dipakai tiga keluaran, yaitu pratinjau dan cetak (PDF) di
// peramban (components/DokumenLembar) dan berkas .docx (buatLembarDocx). Dengan begitu isinya pasti sama di semuanya.
//
// susunDokumenLembar murni (tanpa React, tanpa jaringan). Pustaka `docx` baru dimuat saat buatLembarDocx dipanggil,
// dengan pola yang sama seperti lib/templateDocx.ts.
import { defKesimpulan, JENJANG_PARAF, KRITERIA_RISIKO, LABEL_HASIL_KEPATUHAN, TINGKAT_RISIKO, daftarPokok } from "./lembarStandar";
import { ringkasTemuan, risikoKeseluruhan, type DataOtomatis, type PutaranReview } from "./lembarReview";
import { PENAFIAN } from "./pemindai";
import { tanggalPanjang } from "./terbilang";
import type { JenisKontrak } from "./types";

export const NAMA_PERUSAHAAN = "PT Waskita Karya Infrastruktur";
export const JUDUL_LEMBAR = "Lembar Hasil Review Legal";
export const CATATAN_STANDAR_AWAL = "Susunan, kriteria risiko, dan daftar kepatuhan di lembar ini adalah standar awal dari riset praktik review kontrak dan belum disahkan Legal WKI.";
export const MIME_DOCX_LEMBAR = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type BlokLembar =
  | { tipe: "kop"; judul: string; sub: string[]; tanda?: string }
  | { tipe: "bagian"; teks: string }
  | { tipe: "kv"; baris: { label: string; isi: string }[] }
  | { tipe: "paragraf"; teks: string; kecil?: boolean }
  | { tipe: "daftar"; butir: string[] }
  | { tipe: "tabel"; kolom: string[]; lebar: number[]; baris: string[][]; kosong: string }
  | { tipe: "ttd"; kolom: { judul: string; nama: string; keterangan: string }[] };

// --- Pemformat kecil (tanpa lib/format supaya modul ini bisa diuji di Node) --------------------

const fmtYmdJakarta = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });

/** Tanggal ISO atau YYYY-MM-DD menjadi "2 Oktober 2026". Kosong atau tak terbaca: "-". */
export function tanggalLembar(v: string | null | undefined): string {
  if (!v) return "-";
  try {
    const ymd = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fmtYmdJakarta.format(new Date(v));
    return tanggalPanjang(ymd);
  } catch {
    return "-";
  }
}

function ukuranLembar(byte: number): string {
  if (byte >= 1024 * 1024) return `${(byte / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(byte / 1024))} KB`;
}

const atau = (t: string | null | undefined, cadangan = "-") => (t && t.trim() ? t.trim() : cadangan);

// --- Susunan blok -------------------------------------------------------------------------------

export interface OpsiDokumen {
  /** Tanggal cetak (ISO); bawaannya sekarang. */
  dicetak?: string;
}

/**
 * Susun seluruh isi lembar. `data` adalah data otomatis: yang sudah dibekukan di putaran final, atau yang terbaru
 * untuk putaran yang masih draf.
 */
export function susunDokumenLembar(p: PutaranReview, data: DataOtomatis, opsi: OpsiDokumen = {}): BlokLembar[] {
  const blok: BlokLembar[] = [];
  const d = data;
  const i = d.identitas;
  const jenis = i.jenis as JenisKontrak;
  const final = p.status === "final";
  const def = defKesimpulan(p.kesimpulan);
  const r = ringkasTemuan(p.temuan);
  const risiko = risikoKeseluruhan(p.temuan);

  blok.push({
    tipe: "kop",
    judul: JUDUL_LEMBAR.toUpperCase(),
    sub: [NAMA_PERUSAHAAN, `Putaran review ke-${p.nomor} · ${i.nomorPengajuan}`],
    tanda: final ? undefined : "DRAF, belum difinalkan",
  });

  blok.push({ tipe: "bagian", teks: "A. Identitas kontrak" });
  blok.push({
    tipe: "kv",
    baris: [
      { label: "Nomor pengajuan", isi: i.nomorPengajuan },
      ...(i.nomorKontrak ? [{ label: "Nomor kontrak", isi: i.nomorKontrak }] : []),
      { label: "Judul", isi: atau(i.judul) },
      { label: "Jenis kontrak", isi: atau(i.jenis) },
      { label: "Unit pengaju", isi: `Divisi ${atau(i.divisi)} · ${atau(i.pengaju)}` },
      { label: "Diajukan", isi: tanggalLembar(i.diajukan) },
      ...(i.nomorReferensi || i.kodeProyek ? [{ label: "Referensi dan proyek", isi: [i.nomorReferensi, i.kodeProyek].filter(Boolean).join(" · ") }] : []),
      ...(i.induk ? [{ label: "Kontrak induk", isi: i.induk }] : []),
      { label: "Prioritas", isi: atau(i.prioritas) },
      { label: "Tanggal review", isi: tanggalLembar(p.tanggalReview) },
      { label: "Pengulas Legal", isi: atau(p.olehNama || i.picLegal) },
    ],
  });

  blok.push({ tipe: "bagian", teks: "B. Para pihak" });
  const pihak = d.pihak;
  blok.push({
    tipe: "kv",
    baris: [
      { label: "Pihak pertama", isi: NAMA_PERUSAHAAN },
      { label: "Pihak kedua (mitra)", isi: atau(pihak.mitra) },
      { label: "NPWP mitra", isi: atau(pihak.npwp) },
      { label: "Alamat mitra", isi: atau(pihak.alamat) },
      { label: "Penandatangan mitra", isi: [pihak.penandatangan, pihak.jabatan].filter(Boolean).join(", ") || "-" },
      { label: "Dasar kewenangan", isi: atau(pihak.dasarKewenangan) },
      ...(pihak.lain.length ? [{ label: "Pihak lain", isi: pihak.lain.map((x) => `${x.nama}${x.peran ? ` (${x.peran})` : ""}`).join("; ") }] : []),
    ],
  });

  blok.push({ tipe: "bagian", teks: "C. Dokumen yang direview" });
  blok.push({
    tipe: "tabel",
    kolom: ["No", "Nama berkas", "Jenis", "Versi", "Terakhir diubah", "Ukuran"],
    lebar: [5, 38, 17, 8, 19, 13],
    baris: d.dokumen.map((x, n) => [String(n + 1), x.nama, x.jenis, atau(x.versi), tanggalLembar(x.diubah), ukuranLembar(x.ukuran)]),
    kosong: "Belum ada dokumen yang diunggah.",
  });
  blok.push({
    tipe: "paragraf",
    teks: d.kelengkapan.lengkap
      ? `Kelengkapan dokumen wajib: ${d.kelengkapan.teks}. Semua dokumen wajib sudah ada.`
      : `Kelengkapan dokumen wajib: ${d.kelengkapan.teks}. Belum ada: ${d.kelengkapan.kurang.join(", ")}.`,
  });

  blok.push({ tipe: "bagian", teks: "D. Pokok-pokok kontrak" });
  blok.push({ tipe: "kv", baris: daftarPokok(jenis).map((x) => ({ label: x.label, isi: atau(p.pokok[x.id]) })) });

  blok.push({ tipe: "bagian", teks: "E. Hasil pemeriksaan otomatis" });
  const cek = d.checklist;
  blok.push({ tipe: "paragraf", teks: cek.total ? `Checklist review klausul: ${cek.selesai} dari ${cek.total} butir selesai.` : "Checklist review klausul belum tersedia." });
  if (cek.belum.length) blok.push({ tipe: "paragraf", teks: `Butir yang belum selesai: ${cek.belum.join("; ")}.`, kecil: true });
  if (cek.catatan.length) blok.push({ tipe: "daftar", butir: cek.catatan });
  if (d.pindai) {
    const relevan = d.pindai.klausul.length;
    const ada = d.pindai.klausul.filter((x) => x.ada).length;
    const hilang = d.pindai.klausul.filter((x) => !x.ada).map((x) => x.nama);
    blok.push({
      tipe: "paragraf",
      teks: d.pindai.terbaca
        ? `Pindai draf "${d.pindai.nama}" (${tanggalLembar(d.pindai.waktu)}): ${ada} dari ${relevan} klausul inti terdeteksi${hilang.length ? `; belum terdeteksi: ${hilang.join(", ")}` : ""}. Bagian yang tampaknya masih kosong: ${d.pindai.penanda}.${d.pindai.selisih.length ? ` Selisih dengan pengajuan: ${d.pindai.selisih.join("; ")}.` : ""}`
        : `Pindai draf "${d.pindai.nama}" (${tanggalLembar(d.pindai.waktu)}): teks draf belum terbaca, jadi tidak ada hasil.`,
    });
    blok.push({ tipe: "paragraf", teks: PENAFIAN, kecil: true });
  } else {
    blok.push({ tipe: "paragraf", teks: "Draf belum dipindai otomatis." });
  }
  if (d.revisi) {
    blok.push({ tipe: "paragraf", teks: `Permintaan revisi sebelumnya: ${tanggalLembar(d.revisi.waktu)}, oleh ${atau(d.revisi.oleh)}.${d.revisi.kirimUlang ? ` Dikirim ulang ${tanggalLembar(d.revisi.kirimUlang)}.` : " Belum dikirim ulang."}` });
    if (d.revisi.poin.length) blok.push({ tipe: "daftar", butir: d.revisi.poin });
    if (d.revisi.sejak.length) blok.push({ tipe: "paragraf", teks: `Sejak revisi diminta: ${d.revisi.sejak.join("; ")}.`, kecil: true });
  }

  blok.push({ tipe: "bagian", teks: "F. Temuan per pasal" });
  blok.push({
    tipe: "tabel",
    kolom: ["No", "Pasal", "Rumusan dan isu", "Risiko", "Usulan perbaikan", "Status"],
    lebar: [5, 12, 29, 9, 31, 14],
    baris: p.temuan.map((t, n) => [String(n + 1), atau(t.pasal), t.isu, t.risiko, [t.usulan, t.tanggapan ? `Tanggapan: ${t.tanggapan}` : ""].filter(Boolean).join("\n") || "-", t.status]),
    kosong: "Tidak ada temuan dicatat.",
  });
  blok.push({
    tipe: "paragraf",
    teks: r.total
      ? `Ringkasan: ${r.total} temuan (${TINGKAT_RISIKO.slice().reverse().map((x) => `${r.perRisiko[x]} ${x.toLowerCase()}`).join(", ")}); ${r.belumSelesai} belum diterima. ${risiko.ringkas}`
      : risiko.ringkas,
  });
  blok.push({
    tipe: "paragraf",
    teks: `Kriteria risiko (standar awal). ${TINGKAT_RISIKO.slice().reverse().map((x) => `${x}: ${KRITERIA_RISIKO[x].arti} ${KRITERIA_RISIKO[x].tindakan}`).join(" ")}`,
    kecil: true,
  });

  blok.push({ tipe: "bagian", teks: "G. Kepatuhan regulasi" });
  blok.push({
    tipe: "tabel",
    kolom: ["No", "Butir", "Dasar hukum", "Hasil", "Catatan"],
    lebar: [5, 25, 30, 12, 28],
    baris: p.kepatuhan.map((b, n) => [String(n + 1), b.label, `${b.dasar}${b.perluVerifikasi ? " *" : ""}`, b.hasil ? LABEL_HASIL_KEPATUHAN[b.hasil] : "Belum diperiksa", atau(b.catatan)]),
    kosong: "Daftar kepatuhan tidak tersedia.",
  });
  blok.push({
    tipe: "paragraf",
    teks: `Daftar ini standar awal dari riset dan belum disahkan Legal WKI. Tanda * berarti dasar hukum atau angkanya perlu diverifikasi Legal terhadap teks resminya.`,
    kecil: true,
  });

  blok.push({ tipe: "bagian", teks: "H. Kesimpulan dan rekomendasi" });
  blok.push({
    tipe: "kv",
    baris: [
      { label: "Kesimpulan", isi: def ? `${def.label.toUpperCase()}` : "Belum ditetapkan" },
      ...(def ? [{ label: "Arti", isi: def.arti }] : []),
      { label: "Risiko keseluruhan", isi: p.temuan.length ? `Risiko sisa ${risiko.sisa}; tertinggi ${risiko.tertinggi}` : "Belum ada temuan" },
      { label: "Catatan untuk penandatangan", isi: atau(p.catatanPenandatangan) },
      { label: "Catatan untuk pengaju", isi: atau(p.catatanPengaju) },
    ],
  });
  blok.push({ tipe: "paragraf", teks: "Syarat sebelum tanda tangan:" });
  blok.push(p.syarat.length ? { tipe: "daftar", butir: p.syarat.map((s) => `${s.selesai ? "[x]" : "[  ]"} ${s.teks}`) } : { tipe: "paragraf", teks: "Tidak ada syarat tambahan." });

  blok.push({ tipe: "bagian", teks: "I. Pengesahan" });
  const per = p.persetujuan;
  blok.push({
    tipe: "ttd",
    kolom: JENJANG_PARAF.map((j) => {
      if (j.id === "disusun") return { judul: j.label, nama: atau(p.olehNama, "(nama pengulas)"), keterangan: `Legal · ${tanggalLembar(p.tanggalReview)}` };
      if (j.id === "disetujui" && per) return { judul: j.label, nama: per.nama, keterangan: `${per.jabatan || "Kepala Legal"} · ${per.keputusan}${per.tanggal ? ` · ${tanggalLembar(per.tanggal)}` : ""}` };
      return { judul: j.label, nama: "(nama dan jabatan)", keterangan: "Tanggal:" };
    }),
  });
  if (per?.catatan) blok.push({ tipe: "paragraf", teks: `Catatan persetujuan: ${per.catatan}`, kecil: true });
  blok.push({
    tipe: "paragraf",
    teks: `${final ? `Difinalkan ${tanggalLembar(p.final?.waktu)} oleh ${atau(p.final?.oleh)}.` : "Lembar ini masih draf dan dapat berubah."} Dicetak dari aplikasi WiCon pada ${tanggalLembar(opsi.dicetak ?? new Date().toISOString())}. ${CATATAN_STANDAR_AWAL}`,
    kecil: true,
  });
  return blok;
}

/** Seluruh teks blok digabung, untuk pengujian dan pencarian cepat. */
export function teksBlokLembar(blok: readonly BlokLembar[]): string {
  const hasil: string[] = [];
  for (const b of blok) {
    switch (b.tipe) {
      case "kop":
        hasil.push(b.judul, ...b.sub, ...(b.tanda ? [b.tanda] : []));
        break;
      case "bagian":
        hasil.push(b.teks);
        break;
      case "kv":
        for (const x of b.baris) hasil.push(`${x.label}: ${x.isi}`);
        break;
      case "paragraf":
        hasil.push(b.teks);
        break;
      case "daftar":
        hasil.push(...b.butir);
        break;
      case "tabel":
        hasil.push(b.kolom.join(" | "), ...(b.baris.length ? b.baris.map((r) => r.join(" | ")) : [b.kosong]));
        break;
      case "ttd":
        for (const x of b.kolom) hasil.push(`${x.judul}: ${x.nama} ${x.keterangan}`);
        break;
    }
  }
  return hasil.join("\n");
}

// --- Render ke .docx -----------------------------------------------------------------------------

const FONT = "Calibri";
const LEBAR_TEKS = 9638; // A4 dengan margin 2 cm kiri-kanan, dalam twip
const WARNA_GARIS = "9CA3AF";
const WARNA_KEPALA = "E5E7EB";

/** Rakit blok menjadi berkas .docx (A4 potret). Pustaka `docx` dimuat dinamis; fungsi yang sama jalan di skrip uji Node. */
export async function buatLembarDocx(blok: readonly BlokLembar[], judulBerkas: string): Promise<Blob> {
  const docx = await import("docx");
  const { AlignmentType, BorderStyle, Document, Footer, Header, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } = docx;

  const garis = { style: BorderStyle.SINGLE, size: 4, color: WARNA_GARIS };
  const batas = { top: garis, bottom: garis, left: garis, right: garis };
  const tanpaBatas = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const tanpa = { top: tanpaBatas, bottom: tanpaBatas, left: tanpaBatas, right: tanpaBatas };

  const baris = (teks: string, opsi: { tebal?: boolean; kecil?: boolean; tengah?: boolean; miring?: boolean } = {}) =>
    teks.split("\n").map(
      (b) =>
        new Paragraph({
          alignment: opsi.tengah ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { after: 40 },
          children: [new TextRun({ text: b, bold: opsi.tebal, italics: opsi.miring, size: opsi.kecil ? 17 : 19 })],
        }),
    );

  const sel = (teks: string, lebarPersen: number, opsi: { kepala?: boolean; tebal?: boolean } = {}) =>
    new TableCell({
      width: { size: Math.round((LEBAR_TEKS * lebarPersen) / 100), type: WidthType.DXA },
      borders: batas,
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 50, bottom: 50, left: 80, right: 80 },
      shading: opsi.kepala ? { type: ShadingType.CLEAR, fill: WARNA_KEPALA, color: "auto" } : undefined,
      children: baris(teks || " ", { tebal: opsi.kepala || opsi.tebal, kecil: true }),
    });

  const isi: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  for (const b of blok) {
    switch (b.tipe) {
      case "kop":
        isi.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: b.judul, bold: true, size: 30 })] }));
        for (const s of b.sub) isi.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: s, size: 20 })] }));
        if (b.tanda) isi.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, children: [new TextRun({ text: b.tanda, bold: true, size: 20, highlight: "yellow" })] }));
        break;
      case "bagian":
        isi.push(new Paragraph({ spacing: { before: 260, after: 90 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1E3A8A", space: 2 } }, children: [new TextRun({ text: b.teks, bold: true, size: 22, color: "1E3A8A" })] }));
        break;
      case "paragraf":
        isi.push(...baris(b.teks, { kecil: b.kecil, miring: b.kecil }));
        break;
      case "daftar":
        for (const x of b.butir) isi.push(new Paragraph({ spacing: { after: 30 }, indent: { left: 360, hanging: 240 }, children: [new TextRun({ text: `• ${x}`, size: 19 })] }));
        break;
      case "kv":
        isi.push(
          new Table({
            width: { size: LEBAR_TEKS, type: WidthType.DXA },
            columnWidths: [Math.round(LEBAR_TEKS * 0.3), Math.round(LEBAR_TEKS * 0.7)],
            rows: b.baris.map((x) => new TableRow({ cantSplit: true, children: [sel(x.label, 30, { kepala: true }), sel(x.isi, 70)] })),
          }),
        );
        break;
      case "tabel": {
        if (b.baris.length === 0) {
          isi.push(...baris(b.kosong, { miring: true }));
          break;
        }
        isi.push(
          new Table({
            width: { size: LEBAR_TEKS, type: WidthType.DXA },
            columnWidths: b.lebar.map((l) => Math.round((LEBAR_TEKS * l) / 100)),
            rows: [
              new TableRow({ tableHeader: true, cantSplit: true, children: b.kolom.map((k, n) => sel(k, b.lebar[n]!, { kepala: true })) }),
              ...b.baris.map((r) => new TableRow({ cantSplit: true, children: r.map((c, n) => sel(c, b.lebar[n]!)) })),
            ],
          }),
        );
        break;
      }
      case "ttd": {
        const lebar = Math.round(100 / b.kolom.length);
        const kolom = (x: { judul: string; nama: string; keterangan: string }) =>
          new TableCell({
            width: { size: Math.round((LEBAR_TEKS * lebar) / 100), type: WidthType.DXA },
            borders: tanpa,
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
            children: [
              ...baris(x.judul, { tebal: true, tengah: true }),
              new Paragraph({ spacing: { before: 700, after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "6B7280", space: 1 } }, children: [] }),
              ...baris(x.nama, { tebal: true, tengah: true, kecil: true }),
              ...baris(x.keterangan, { tengah: true, kecil: true }),
            ],
          });
        isi.push(new Paragraph({ spacing: { before: 120 }, children: [] }));
        isi.push(
          new Table({
            width: { size: LEBAR_TEKS, type: WidthType.DXA },
            columnWidths: b.kolom.map(() => Math.round((LEBAR_TEKS * lebar) / 100)),
            rows: [new TableRow({ cantSplit: true, children: b.kolom.map(kolom) })],
          }),
        );
        break;
      }
    }
  }

  const doc = new Document({
    creator: "WiCon",
    title: judulBerkas,
    description: `${JUDUL_LEMBAR}. ${CATATAN_STANDAR_AWAL}`,
    styles: { default: { document: { run: { font: FONT, size: 19 }, paragraph: { spacing: { line: 252 } } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${JUDUL_LEMBAR} · Rahasia, hanya untuk internal Legal`, size: 16, color: "6B7280" })] })] }) },
        footers: {
          default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ size: 16, color: "6B7280", children: ["Halaman ", PageNumber.CURRENT, " dari ", PageNumber.TOTAL_PAGES] })] })] }),
        },
        children: isi,
      },
    ],
  });
  const buf = await Packer.toArrayBuffer(doc);
  return new Blob([buf], { type: MIME_DOCX_LEMBAR });
}
