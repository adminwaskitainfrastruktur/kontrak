// Paket arsip ZIP per kontrak (U18): semua dokumen di folder kontrak, ringkasan.csv, dan riwayat.txt.
// jszip dimuat dinamis supaya tidak ikut ke bundel awal. Bagian penyusun teks (CSV, riwayat, jalur ZIP)
// murni dan diuji di scripts/uji-dokumen.ts; modul ini sengaja tidak mengimpor config atau services
// di tingkat atas (services dimuat dinamis saat dipakai) agar bisa diuji di Node.
import { BATAS_PAKET_ARSIP, namaBerkasAman, teksUkuran } from "./jenisBerkas";
import type { Aktivitas, Dokumen, Kontrak } from "./types";

const ZONA = "Asia/Jakarta";

const fmtWaktu = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONA });
const fmtYmd = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: ZONA });

const waktu = (iso: string) => (iso ? `${fmtWaktu.format(new Date(iso))} WIB` : "-");

// --- Penyusun isi (murni) --------------------------------------------------------------

/** Sel CSV aman: dikutip, dan diawali petik bila bisa dibaca Excel sebagai rumus. */
export function selCsv(v: string | number | null | undefined): string {
  let t = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}

const barisCsv = (sel: (string | number | null | undefined)[]) => sel.map(selCsv).join(";");

/** Nama folder di dalam ZIP untuk satu jenis dokumen ("SPK / PO" -> "SPK - PO"). */
export function folderJenis(jenis: string): string {
  return namaBerkasAman((jenis || "Jenis belum diisi").replace(/\s*\/\s*/g, " - "));
}

/**
 * Jalur unik tiap dokumen di dalam ZIP: dokumen/<jenis>/<nama>. Nama kembar diberi akhiran
 * " (2)", " (3)" sebelum ekstensi supaya tidak saling menimpa.
 */
export function susunJalurZip<T extends Pick<Dokumen, "id" | "nama" | "jenis">>(dokumen: readonly T[]): Map<string, string> {
  const dipakai = new Set<string>();
  const hasil = new Map<string, string>();
  for (const d of dokumen) {
    const dasar = `dokumen/${folderJenis(d.jenis)}/`;
    const nama = namaBerkasAman(d.nama);
    const titik = nama.lastIndexOf(".");
    const inti = titik > 0 ? nama.slice(0, titik) : nama;
    const eks = titik > 0 ? nama.slice(titik) : "";
    let calon = `${dasar}${nama}`;
    for (let n = 2; dipakai.has(calon.toLowerCase()); n++) calon = `${dasar}${inti} (${n})${eks}`;
    dipakai.add(calon.toLowerCase());
    hasil.set(d.id, calon);
  }
  return hasil;
}

/** ringkasan.csv: identitas kontrak di atas, daftar dokumen di bawah. Pemisah ";" dan BOM untuk Excel Indonesia. */
export function ringkasanCsv(
  k: Kontrak,
  dokumen: readonly Dokumen[],
  jalurZip: ReadonlyMap<string, string>,
  gagal: ReadonlyMap<string, string>,
  dibuat: Date = new Date(),
): string {
  const identitas: [string, string | number | null][] = [
    ["Nomor Pengajuan", k.nomorPengajuan],
    ["Judul", k.judul],
    ["Nomor Kontrak", k.nomorKontrak],
    ["Jenis Kontrak", k.jenis],
    ["Mitra", k.mitra],
    ["Nilai", k.nilai],
    ["Mata Uang", k.mataUang],
    ["Status", k.status],
    ["Tanggal Mulai", k.tanggalMulai],
    ["Tanggal Berakhir", k.tanggalBerakhir],
    ["Tanggal Tanda Tangan", k.tanggalTandaTangan],
    ["Divisi Pengaju", k.divisi],
    ["Pengaju", k.pengajuNama],
    ["PIC Legal", k.picLegalNama],
    ["Kontrak Final", k.kontrakFinal],
    ["Paket dibuat", waktu(dibuat.toISOString())],
  ];
  const baris = [
    barisCsv(["Data", "Isi"]),
    ...identitas.map(([a, b]) => barisCsv([a, b])),
    "",
    barisCsv(["Nama Berkas", "Jenis Dokumen", "Ukuran (byte)", "Diubah", "Diubah Oleh", "Jalur di ZIP", "Keterangan"]),
    ...dokumen.map((d) =>
      barisCsv([d.nama, d.jenis || "Jenis belum diisi", d.ukuran, waktu(d.diubah), d.diubahOleh, gagal.has(d.id) ? "" : (jalurZip.get(d.id) ?? ""), gagal.has(d.id) ? `Tidak ikut: ${gagal.get(d.id)}` : "Termasuk"]),
    ),
  ];
  return `﻿${baris.join("\r\n")}\r\n`;
}

/** riwayat.txt: seluruh aktivitas dari yang terlama, mudah dibaca auditor tanpa aplikasi. */
export function riwayatTeks(k: Kontrak, aktivitas: readonly Aktivitas[]): string {
  const urut = [...aktivitas].sort((a, b) => a.waktu.localeCompare(b.waktu));
  const kepala = [
    `Riwayat ${k.nomorPengajuan}${k.nomorKontrak ? ` / ${k.nomorKontrak}` : ""}`,
    k.judul,
    `Mitra: ${k.mitra || "-"} | Status: ${k.status}`,
    "=".repeat(60),
    "",
  ];
  if (!urut.length) return [...kepala, "(Belum ada aktivitas tercatat.)", ""].join("\r\n");
  const isi = urut.flatMap((a) => {
    const status = a.statusDari || a.statusKe ? ` | ${a.statusDari || "-"} -> ${a.statusKe || "-"}` : "";
    const baris = [`[${waktu(a.waktu)}] ${a.jenis} oleh ${a.olehNama || a.olehEmail || "-"}${status}`];
    if (a.pesan.trim()) baris.push(...a.pesan.trim().split(/\r?\n/).map((l) => `    ${l}`));
    for (const d of a.detail) baris.push(`    - ${d.kolom}: ${d.dari || "(kosong)"} -> ${d.ke || "(kosong)"}`);
    baris.push("");
    return baris;
  });
  return [...kepala, ...isi].join("\r\n");
}

/** "Arsip PGJ-2026-0012 2026-10-02.zip" */
export function namaPaketArsip(k: Pick<Kontrak, "nomorPengajuan">, tanggal: Date = new Date()): string {
  return namaBerkasAman(`Arsip ${k.nomorPengajuan} ${fmtYmd.format(tanggal)}.zip`);
}

/** Pesan galat bila total ukuran melewati batas, atau null bila aman. */
export function periksaBatasArsip(dokumen: readonly Pick<Dokumen, "ukuran">[], batas: number = BATAS_PAKET_ARSIP): string | null {
  const total = dokumen.reduce((n, d) => n + d.ukuran, 0);
  if (total <= batas) return null;
  return `Total dokumen ${teksUkuran(total)}, melebihi batas paket ${teksUkuran(batas)} yang aman diproses di peramban. Unduh folder kontrak langsung dari SharePoint (pilih semua berkas lalu Unduh).`;
}

// Berkas Office dan PDF sudah terkompresi; mengompres ulang hanya membuang waktu dan memori.
const SUDAH_PADAT = /\.(pdf|docx|xlsx|pptx|zip|rar|7z|jpe?g|png|gif|webp|heic)$/i;

// --- Penyusun paket ---------------------------------------------------------------------

export interface ProgresArsip {
  tahap: "unduh" | "kemas";
  /** Dokumen yang sudah diproses (tahap unduh). */
  selesai: number;
  total: number;
  /** 0-100 untuk keseluruhan proses. */
  persen: number;
  teks: string;
}

export interface HasilArsip {
  blob: Blob;
  namaBerkas: string;
  /** Dokumen yang gagal diunduh (nama -> alasan); paket tetap dibuat tanpa mereka. */
  dilewati: { nama: string; alasan: string }[];
}

export type PengunduhBerkas = (d: Dokumen, signal?: AbortSignal) => Promise<Blob>;

const pengunduhBawaan: PengunduhBerkas = async (d, signal) => {
  const { graphBlob } = await import("../services/dokumen");
  return graphBlob(d.id, { signal });
};

/**
 * Unduh semua dokumen berurutan (bukan paralel, supaya tidak memicu pembatasan SharePoint), lalu
 * bungkus bersama ringkasan.csv dan riwayat.txt. Dokumen yang gagal tidak menggagalkan paket.
 */
export async function buatPaketArsip(
  k: Kontrak,
  dokumen: readonly Dokumen[],
  aktivitas: readonly Aktivitas[],
  onProgres?: (p: ProgresArsip) => void,
  opsi: { unduh?: PengunduhBerkas; signal?: AbortSignal; batas?: number; sekarang?: Date } = {},
): Promise<HasilArsip> {
  const lewat = periksaBatasArsip(dokumen, opsi.batas);
  if (lewat) throw new Error(lewat);

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const unduh = opsi.unduh ?? pengunduhBawaan;
  const jalurZip = susunJalurZip(dokumen);
  const gagal = new Map<string, string>();
  const total = dokumen.length;

  for (const [i, d] of dokumen.entries()) {
    if (opsi.signal?.aborted) throw new DOMException("Pembuatan paket dibatalkan.", "AbortError");
    onProgres?.({ tahap: "unduh", selesai: i, total, persen: Math.round((i / Math.max(total, 1)) * 85), teks: `Mengambil ${i + 1} dari ${total}: ${d.nama}` });
    try {
      const blob = await unduh(d, opsi.signal);
      // ArrayBuffer, bukan Blob: JSZip membaca Blob lewat FileReader yang tidak ada di semua lingkungan.
      zip.file(jalurZip.get(d.id)!, await blob.arrayBuffer(), {
        date: new Date(d.diubah),
        compression: SUDAH_PADAT.test(d.nama) ? "STORE" : "DEFLATE",
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      gagal.set(d.id, err instanceof Error ? err.message : String(err));
    }
  }
  if (total > 0 && gagal.size === total) {
    throw new Error(`Tidak satu pun dokumen berhasil diambil (${[...gagal.values()][0]}). Coba lagi sebentar lagi.`);
  }

  const sekarang = opsi.sekarang ?? new Date();
  zip.file("ringkasan.csv", ringkasanCsv(k, dokumen, jalurZip, gagal, sekarang));
  zip.file("riwayat.txt", `﻿${riwayatTeks(k, aktivitas)}`);

  onProgres?.({ tahap: "kemas", selesai: total, total, persen: 85, teks: "Mengemas paket ZIP…" });
  const isi = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }, (m) =>
    onProgres?.({ tahap: "kemas", selesai: total, total, persen: 85 + Math.round(m.percent * 0.15), teks: "Mengemas paket ZIP…" }),
  );
  return {
    blob: new Blob([isi], { type: "application/zip" }),
    namaBerkas: namaPaketArsip(k, sekarang),
    dilewati: dokumen.filter((d) => gagal.has(d.id)).map((d) => ({ nama: d.nama, alasan: gagal.get(d.id)! })),
  };
}

/** Picu unduhan Blob di peramban. URL objek dilepas setelah unduhan dimulai. */
export function simpanBlob(blob: Blob, namaBerkas: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: namaBerkas, rel: "noopener" });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
