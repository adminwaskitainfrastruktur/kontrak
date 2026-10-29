// Umur tahap dan SLA. Setiap perubahan status mengisi kolom StatusSejak, jadi umur tahap = sekarang - StatusSejak.
// Batas SLA diatur Admin di halaman Pengaturan; SLA_HARI (lib/slaBawaan) hanya nilai bawaannya.
//
// Urutan impor di bawah penting: SLA_HARI diekspor ulang lebih dulu dari modul tanpa dependensi, baru
// lib/pengaturan (yang mengimpor balik berkas ini) dimuat. pengaturanAktif() hanya dipanggil di dalam fungsi.
export { SLA_HARI } from "./slaBawaan";
import { levelSlaPengaturan, pengaturanAktif } from "./pengaturan";
import { selisihHari } from "./format";
import type { Kontrak, Status } from "./types";

/** Status yang menunggu pengaju (bukan Legal). Umurnya tidak dihitung sebagai kinerja Legal. */
export const MENUNGGU_PENGAJU: readonly Status[] = ["Perlu Revisi"];

/**
 * Tahap milik Legal yang umurnya DIKURANGI selama ada permintaan masukan unit lain yang masih menunggu (K03):
 * waktu menunggu Keuangan, Pajak, Teknik, atau K3 bukan kinerja Legal.
 */
export const MENUNGGU_UNIT_LAIN: readonly Status[] = ["Diajukan", "Review Legal", "Proses Tanda Tangan"];

/** Satu masa menunggu unit lain: dari permintaan dikirim sampai dijawab/dibatalkan (null = masih menunggu). */
export interface RentangTunggu {
  mulai: string;
  selesai: string | null;
}

/**
 * Masa menunggu yang jatuh di tahap sekarang, dipotong ke [sejak, sekarang] dan digabung bila tumpang tindih,
 * dalam milidetik epoch. Kosong bila status bukan MENUNGGU_UNIT_LAIN atau tanpa StatusSejak.
 */
export function rentangTungguTahap(k: Kontrak, rentang: readonly RentangTunggu[], sekarang: number = Date.now()): [number, number][] {
  if (!MENUNGGU_UNIT_LAIN.includes(k.status)) return [];
  const dasar = k.statusSejak ?? (k.status === "Diajukan" ? k.tanggalDiajukan : null);
  const sejak = dasar ? Date.parse(dasar) : NaN;
  if (!Number.isFinite(sejak)) return [];
  const potong = rentang
    .map((r): [number, number] => {
      const a = Date.parse(r.mulai);
      const b = r.selesai ? Date.parse(r.selesai) : sekarang;
      return [Math.max(a, sejak), Math.min(Number.isFinite(b) ? b : sekarang, sekarang)];
    })
    .filter(([a, b]) => Number.isFinite(a) && b > a)
    .sort((x, y) => x[0] - y[0]);
  const gabung: [number, number][] = [];
  for (const [a, b] of potong) {
    const akhir = gabung[gabung.length - 1];
    if (akhir && a <= akhir[1]) akhir[1] = Math.max(akhir[1], b);
    else gabung.push([a, b]);
  }
  return gabung;
}

/** Lama menunggu unit lain di tahap sekarang, dalam hari kalender (pecahan). */
export function potonganTungguHari(k: Kontrak, rentang: readonly RentangTunggu[], sekarang: number = Date.now()): number {
  return rentangTungguTahap(k, rentang, sekarang).reduce((n, [a, b]) => n + (b - a) / 86_400_000, 0);
}

/** Umur tahap dikurangi masa menunggu unit lain (hari kalender). null bila belum ada StatusSejak. */
export function umurTahapBersih(k: Kontrak, rentang: readonly RentangTunggu[], sekarang: number = Date.now()): number | null {
  const umur = umurTahapHari(k, sekarang);
  return umur == null ? null : Math.max(0, umur - potonganTungguHari(k, rentang, sekarang));
}

export type LevelSla = "aman" | "hampir" | "lewat" | "tidak-berlaku";

/** Umur tahap dalam hari (pecahan). null bila belum ada StatusSejak. */
export function umurTahapHari(k: Kontrak, sekarang: number = Date.now()): number | null {
  const dasar = k.statusSejak ?? (k.status === "Diajukan" ? k.tanggalDiajukan : null);
  if (!dasar) return null;
  return Math.max(0, (sekarang - Date.parse(dasar)) / 86_400_000);
}

/**
 * Level SLA dengan angka Pengaturan yang sedang aktif (bawaan selama Pengaturan belum dimuat).
 * Komponen React sebaiknya memakai usePengaturan() + levelSlaPengaturan supaya ikut dirender ulang.
 */
export function levelSla(k: Kontrak, sekarang: number = Date.now(), tunggu: readonly RentangTunggu[] = []): LevelSla {
  return levelSlaPengaturan(k, pengaturanAktif(), sekarang, tunggu);
}

/** Sudah lewat target selesai review yang diisi pengaju (hanya untuk kontrak yang masih diproses). */
export function lewatTarget(k: Kontrak): boolean {
  if (!k.targetSelesai) return false;
  if (k.status !== "Diajukan" && k.status !== "Review Legal" && k.status !== "Proses Tanda Tangan" && k.status !== "Perlu Revisi") return false;
  return selisihHari(k.targetSelesai) < 0;
}

/** Sisa hari ke target selesai (negatif bila lewat), null bila tidak ada target. */
export function sisaKeTarget(k: Kontrak): number | null {
  return k.targetSelesai ? selisihHari(k.targetSelesai) : null;
}
