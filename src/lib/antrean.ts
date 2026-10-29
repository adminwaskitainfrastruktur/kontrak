// Antrean Legal dan status ringkas untuk Ruang Pengguna.
//
// Pengaju tidak perlu tahu delapan status alur Legal. Di Ruang Pengguna statusnya diringkas jadi tiga:
//   Antri   = sudah diajukan, menunggu giliran direview Legal (status Diajukan)
//   Proses  = sedang ditangani: review, revisi, atau tanda tangan
//   Selesai = sudah ada hasil akhir: aktif, berakhir, ditolak, atau dibatalkan
//
// Urutan antrean: prioritas lebih dulu (Mendesak, Tinggi, Normal), lalu siapa yang mengajukan lebih awal.
// Ruang Admin memakai urutan yang sama, jadi nomor antrean yang dilihat pengaju sama dengan urutan kerja Legal.

import type { Kontrak, Prioritas, Status } from "./types";

export type StatusRingkas = "Antri" | "Proses" | "Selesai";
export const DAFTAR_STATUS_RINGKAS: readonly StatusRingkas[] = ["Antri", "Proses", "Selesai"];

export function statusRingkas(s: Status): StatusRingkas {
  if (s === "Diajukan") return "Antri";
  if (s === "Review Legal" || s === "Perlu Revisi" || s === "Proses Tanda Tangan") return "Proses";
  return "Selesai";
}

/** Hasil akhir dari kontrak yang selesai: berhasil (aktif/berakhir) atau tidak (ditolak/dibatalkan). */
export function selesaiBerhasil(s: Status): boolean {
  return s === "Aktif" || s === "Berakhir";
}

/** Kalimat pendek untuk pengaju: di mana kontraknya sekarang dan siapa yang sedang memegangnya. */
export function keteranganRingkas(k: Kontrak): string {
  switch (k.status) {
    case "Diajukan":
      return "Menunggu giliran direview Legal";
    case "Review Legal":
      return k.picLegalNama ? `Sedang direview ${k.picLegalNama}` : "Sedang direview Legal";
    case "Perlu Revisi":
      return "Legal meminta revisi dari Anda";
    case "Proses Tanda Tangan":
      return "Dalam proses tanda tangan";
    case "Aktif":
      return "Sudah ditandatangani dan berlaku";
    case "Berakhir":
      return "Masa berlakunya sudah berakhir";
    case "Ditolak":
      return "Ditolak Legal, lihat alasannya di riwayat";
    case "Dibatalkan":
      return "Pengajuan dibatalkan";
  }
}

const BOBOT_PRIORITAS: Record<Prioritas, number> = { Mendesak: 0, Tinggi: 1, Normal: 2 };

const waktuAjukan = (k: Kontrak) => k.tanggalDiajukan ?? k.dibuat;

/** Antrean Legal: pengajuan yang belum mulai direview, urut prioritas lalu waktu pengajuan. */
export function antreanLegal(semua: Kontrak[]): Kontrak[] {
  return semua
    .filter((k) => k.status === "Diajukan")
    .sort((a, b) => BOBOT_PRIORITAS[a.prioritas] - BOBOT_PRIORITAS[b.prioritas] || waktuAjukan(a).localeCompare(waktuAjukan(b)) || a.id - b.id);
}

/** Posisi kontrak di antrean (1 = berikutnya direview), atau null bila tidak sedang antri. */
export function posisiAntrean(k: Kontrak, antrean: Kontrak[]): number | null {
  const i = antrean.findIndex((x) => x.id === k.id);
  return i < 0 ? null : i + 1;
}

/** Kalimat posisi antrean untuk satu kontrak. */
export function teksPosisi(posisi: number): string {
  if (posisi === 1) return "Berikutnya direview Legal";
  const depan = posisi - 1;
  return `${depan} pengajuan di depan Anda`;
}

/** Jumlah kontrak yang sedang ditangani Legal saat ini (review dan tanda tangan). */
export function sedangDitangani(semua: Kontrak[]): number {
  return semua.filter((k) => k.status === "Review Legal" || k.status === "Proses Tanda Tangan").length;
}

/** Ringkasan posisi untuk kolom RingkasAntrean di Aktivitas (U23a): "Antrean ke-3 dari 8 di Legal". */
export function teksRingkasAntrean(k: Kontrak, antrean: Kontrak[]): string {
  const posisi = posisiAntrean(k, antrean);
  return posisi == null ? "" : `Antrean ke-${posisi} dari ${antrean.length} di Legal`;
}
