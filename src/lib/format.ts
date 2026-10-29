import { ZONA_WAKTU } from "../config";
import type { MataUang, Ymd } from "./types";

// --- Tanggal ---------------------------------------------------------------
// Kolom tanggal (DateOnly) SharePoint disimpan sebagai tengah malam di zona
// waktu site (Jakarta), lalu dikirim Graph dalam UTC, mis. 1 Okt 2026 menjadi
// "2026-09-30T17:00:00Z". Jadi tanggal selalu dibaca dan ditulis dalam zona
// Jakarta, bukan dengan memotong string ISO.

const fmtYmd = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_WAKTU,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Nilai tanggal dari Graph -> "YYYY-MM-DD" (Jakarta). */
export function keYmd(iso: string | null | undefined): Ymd | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : fmtYmd.format(d);
}

/** "YYYY-MM-DD" -> nilai untuk kolom tanggal SharePoint (tengah malam Jakarta). */
export function dariYmd(ymd: Ymd | null | undefined): string | null {
  if (!ymd) return null;
  return new Date(`${ymd}T00:00:00+07:00`).toISOString();
}

export function hariIni(): Ymd {
  return fmtYmd.format(new Date());
}

/** Jumlah hari dari hari ini ke `ymd` (negatif jika sudah lewat). */
export function selisihHari(ymd: Ymd): number {
  const ms = Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${hariIni()}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

const fmtTanggal = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtWaktu = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONA_WAKTU,
});

export function formatTanggal(ymd: Ymd | null | undefined): string {
  if (!ymd) return "-";
  return fmtTanggal.format(new Date(`${ymd}T00:00:00Z`));
}

export function formatWaktu(iso: string | null | undefined): string {
  if (!iso) return "-";
  return fmtWaktu.format(new Date(iso));
}

const fmtHariPanjang = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: ZONA_WAKTU });
const fmtJam = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONA_WAKTU });

/** "14.22 WIB" */
export function formatJam(iso: string | null | undefined): string {
  if (!iso) return "-";
  return `${fmtJam.format(new Date(iso))} WIB`;
}

/** Kapan kontrak masuk, lengkap: "Kamis, 2 Oktober 2026 · 14.22 WIB". */
export function formatMasuk(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${fmtHariPanjang.format(d)} · ${fmtJam.format(d)} WIB`;
}

/** Versi pendek untuk tabel dan kartu: "2 Okt 2026, 14.22". */
export function formatMasukRingkas(iso: string | null | undefined): string {
  if (!iso) return "-";
  return fmtWaktu.format(new Date(iso)).replace(/\./g, ".");
}

const fmtRelatif = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

export function formatRelatif(iso: string): string {
  const detik = Math.round((Date.parse(iso) - Date.now()) / 1000);
  const abs = Math.abs(detik);
  if (abs < 60) return "baru saja";
  if (abs < 3600) return fmtRelatif.format(Math.round(detik / 60), "minute");
  if (abs < 86_400) return fmtRelatif.format(Math.round(detik / 3600), "hour");
  if (abs < 86_400 * 30) return fmtRelatif.format(Math.round(detik / 86_400), "day");
  return formatWaktu(iso);
}

/** Lama berlalu sejak `iso`, dalam bahasa sehari-hari: "3 jam", "2 hari 4 jam", "baru saja". */
export function lamaSejak(iso: string | null | undefined, sampai: number = Date.now()): string {
  if (!iso) return "-";
  const menit = Math.max(0, Math.round((sampai - Date.parse(iso)) / 60_000));
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam`;
  const hari = Math.floor(jam / 24);
  const sisa = jam % 24;
  return sisa && hari < 7 ? `${hari} hari ${sisa} jam` : `${hari} hari`;
}

/** "12 hari lagi", "hari ini", "lewat 3 hari". */
export function sisaHari(ymd: Ymd): string {
  const n = selisihHari(ymd);
  if (n === 0) return "berakhir hari ini";
  if (n > 0) return `${n} hari lagi`;
  return `lewat ${-n} hari`;
}

// --- Angka ------------------------------------------------------------------

export function formatUang(nilai: number | null | undefined, mataUang: MataUang = "IDR"): string {
  if (nilai == null) return "-";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: mataUang,
    maximumFractionDigits: mataUang === "IDR" ? 0 : 2,
  }).format(nilai);
}

export function formatUangRingkas(nilai: number): string {
  return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(nilai);
}

export function formatUkuran(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 ** 2) return `${(byte / 1024).toFixed(0)} KB`;
  return `${(byte / 1024 ** 2).toFixed(1)} MB`;
}

export function inisial(nama: string): string {
  return nama
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((k) => k[0]!.toUpperCase())
    .join("");
}

/** "1.250.000,50" atau "1250000.5" -> 1250000.5 */
export function bacaNilai(teks: string): number | null {
  const bersih = teks.replace(/\s/g, "");
  if (!bersih) return null;
  const normal = /,\d{1,2}$/.test(bersih) ? bersih.replace(/\./g, "").replace(",", ".") : bersih.replace(/[.,](?=\d{3}(\D|$))/g, "");
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}

/** Tanggal `n` hari setelah `ymd` (default hari ini), tetap dalam format YYYY-MM-DD. */
export function tambahHari(n: number, ymd: Ymd = hariIni()): Ymd {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
