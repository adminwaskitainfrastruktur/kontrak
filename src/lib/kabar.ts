// Pemberitahuan Ruang Pengguna, dihitung di browser. Posisi antrean dan status kontrak milik pengguna
// dibandingkan dengan keadaan terakhir yang pernah dilihatnya (disimpan di localStorage per akun).
// Tidak ada server, jadi kabar baru muncul saat aplikasi dibuka atau saat pembaruan otomatis tiap menit.

import { posisiAntrean } from "./antrean";
import type { Kontrak, Status } from "./types";

export interface Jejak {
  status: Status;
  posisi: number | null;
}

export type NadaKabar = "info" | "sukses" | "peringatan" | "bahaya";

/** Jenis kabar di lonceng Ruang Admin ("Untuk Anda"); kabar Ruang Pengguna tidak memakainya. */
export type JenisKabar = "baru" | "tugas" | "alih" | "status" | "komentar" | "sebut" | "dokumen" | "pengingat";

export interface Kabar {
  id: string;
  kontrakId: number;
  judul: string;
  nomor: string;
  teks: string;
  nada: NadaKabar;
  waktu: string;
  dibaca: boolean;
  jenis?: JenisKabar;
}

export interface Simpanan {
  jejak: Record<string, Jejak>;
  kabar: Kabar[];
}

export const MAKS_KABAR = 30;

const kunci = (email: string) => `kontrak-pantau:${email}`;

export function bacaSimpanan(email: string): Simpanan | null {
  try {
    const teks = localStorage.getItem(kunci(email));
    return teks ? (JSON.parse(teks) as Simpanan) : null;
  } catch {
    return null;
  }
}

export function tulisSimpanan(email: string, s: Simpanan) {
  try {
    localStorage.setItem(kunci(email), JSON.stringify(s));
  } catch {
    /* penyimpanan penuh atau diblokir: kabar tetap tampil, hanya tidak diingat */
  }
}

export function buatJejak(milik: Kontrak[], antrean: Kontrak[]): Record<string, Jejak> {
  return Object.fromEntries(milik.map((k) => [String(k.id), { status: k.status, posisi: posisiAntrean(k, antrean) }]));
}

function kabarStatus(k: Kontrak, dari: Status, posisi: number | null): { teks: string; nada: NadaKabar } {
  switch (k.status) {
    case "Diajukan":
      return { teks: posisi ? `Kembali masuk antrean Legal, urutan ke-${posisi}.` : "Kembali masuk antrean Legal.", nada: "info" };
    case "Review Legal":
      if (dari === "Diajukan") return { teks: `Giliran Anda tiba: mulai direview ${k.picLegalNama || "Legal"}.`, nada: "info" };
      if (dari === "Perlu Revisi") return { teks: "Revisi Anda diterima dan kembali direview Legal.", nada: "info" };
      return { teks: "Dikembalikan ke tahap review Legal.", nada: "info" };
    case "Perlu Revisi":
      return { teks: "Legal meminta revisi. Buka kontrak untuk membaca catatannya.", nada: "peringatan" };
    case "Proses Tanda Tangan":
      return { teks: "Review selesai, sekarang masuk proses tanda tangan.", nada: "info" };
    case "Aktif":
      return { teks: "Selesai: kontrak sudah ditandatangani dan berlaku.", nada: "sukses" };
    case "Berakhir":
      return { teks: "Masa berlaku kontrak sudah berakhir.", nada: "info" };
    case "Ditolak":
      return { teks: "Selesai: pengajuan ditolak Legal. Alasannya ada di riwayat.", nada: "bahaya" };
    case "Dibatalkan":
      return { teks: "Pengajuan dibatalkan.", nada: "info" };
  }
}

/**
 * Kabar baru sejak jejak terakhir. Kunjungan pertama (belum ada jejak) tidak menghasilkan kabar,
 * supaya pengguna tidak dibanjiri riwayat lama. Posisi antrean yang turun (karena ada pengajuan
 * mendesak di depannya) tidak dikabarkan; posisinya tetap terlihat di halaman Monitoring.
 */
export function bandingkan(lama: Record<string, Jejak> | null, milik: Kontrak[], antrean: Kontrak[], waktu: string): Kabar[] {
  if (!lama) return [];
  const hasil: Kabar[] = [];
  for (const k of milik) {
    const posisi = posisiAntrean(k, antrean);
    const dulu = lama[String(k.id)];
    let isi: { teks: string; nada: NadaKabar } | null = null;
    if (!dulu) {
      if (posisi) isi = { teks: `Masuk antrean Legal di urutan ke-${posisi}.`, nada: "info" };
    } else if (dulu.status !== k.status) {
      isi = kabarStatus(k, dulu.status, posisi);
    } else if (posisi != null && dulu.posisi != null && posisi < dulu.posisi) {
      isi = posisi === 1 ? { teks: "Naik ke urutan pertama: berikutnya direview Legal.", nada: "sukses" } : { teks: `Antrean bergerak: naik ke urutan ke-${posisi} (sebelumnya ke-${dulu.posisi}).`, nada: "info" };
    }
    if (isi) hasil.push({ id: `${k.id}-${k.status}-${posisi ?? "x"}-${waktu}`, kontrakId: k.id, judul: k.judul, nomor: k.nomorPengajuan, ...isi, waktu, dibaca: false });
  }
  return hasil;
}
