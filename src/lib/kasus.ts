// Register kasus kontrak (K02 tahap 2): peringatan ke mitra, somasi, sengketa, pemutusan, dan klaim.
//
// Data disimpan di list "Kasus Kontrak" (LIST_ID.kasus), khusus Legal/Admin: tidak pernah ditampilkan di Ruang
// Pengguna dan tidak dicatat ke list Aktivitas (yang terbaca pengaju). Supaya lencana "Ada sengketa" tidak perlu
// memuat list Kasus, aplikasi memelihara flag AdaSengketa di item Kontrak setiap kali kasus disimpan.
//
// Modul ini murni (tanpa jaringan, tanpa React) sehingga teruji lewat scripts/uji-detail.ts.
import type { Ymd } from "./types";

export const JENIS_KASUS = ["Peringatan", "Somasi", "Sengketa", "Pemutusan", "Klaim", "Lainnya"] as const;
export type JenisKasus = (typeof JENIS_KASUS)[number];

export const STATUS_KASUS = ["Terbuka", "Selesai"] as const;
export type StatusKasus = (typeof STATUS_KASUS)[number];

/** Penjelasan tiap jenis, untuk pilihan di formulir. Standar awal; dapat disesuaikan Legal. */
export const KETERANGAN_JENIS_KASUS: Record<JenisKasus, string> = {
  Peringatan: "Surat peringatan atau teguran ke mitra (SP1, SP2, dan seterusnya).",
  Somasi: "Teguran hukum resmi sebelum langkah hukum.",
  Sengketa: "Perselisihan yang dibawa ke mediasi, arbitrase, atau pengadilan.",
  Pemutusan: "Proses pemutusan kontrak oleh salah satu pihak.",
  Klaim: "Tuntutan ganti rugi, denda, atau pencairan jaminan.",
  Lainnya: "Catatan hukum lain yang perlu dilacak.",
};

/**
 * Jenis kasus yang membuat kontrak berlencana "Ada sengketa" selama kasusnya terbuka. Standar awal: hanya
 * Sengketa; Legal bisa menambah Somasi atau Klaim bila ingin lencananya lebih peka.
 */
export const JENIS_MEMICU_SENGKETA: readonly JenisKasus[] = ["Sengketa"];

export interface Kasus {
  id: number;
  kontrakId: number;
  judul: string;
  jenis: JenisKasus;
  status: StatusKasus;
  /** Tanggal kejadian atau surat. */
  tanggal: Ymd | null;
  uraian: string;
  tindakLanjut: string;
  /** Tenggat tindak lanjut, mis. batas jawaban somasi. */
  batasTindakLanjut: Ymd | null;
  tanggalSelesai: Ymd | null;
  dibuat: string;
  dibuatOleh: string;
  diubah: string;
  diubahOleh: string;
}

export type KasusInput = Pick<Kasus, "judul" | "jenis" | "status" | "tanggal" | "uraian" | "tindakLanjut" | "batasTindakLanjut" | "tanggalSelesai">;

export function kasusKosong(hari: Ymd): KasusInput {
  return { judul: "", jenis: "Peringatan", status: "Terbuka", tanggal: hari, uraian: "", tindakLanjut: "", batasTindakLanjut: null, tanggalSelesai: null };
}

/** Pesan galat pertama yang perlu dibetulkan di formulir, atau null bila sah. */
export function validasiKasus(k: KasusInput): string | null {
  if (!k.judul.trim()) return "Judul kasus wajib diisi, mis. \"SP1 keterlambatan pekerjaan\".";
  if (k.judul.trim().length > 200) return "Judul paling panjang 200 karakter.";
  if (!(JENIS_KASUS as readonly string[]).includes(k.jenis)) return "Pilih jenis kasus.";
  if (!(STATUS_KASUS as readonly string[]).includes(k.status)) return "Pilih status kasus.";
  if (!k.tanggal) return "Tanggal kejadian atau surat wajib diisi.";
  if (k.batasTindakLanjut && k.batasTindakLanjut < k.tanggal) return "Batas tindak lanjut tidak boleh sebelum tanggal kasus.";
  if (k.status === "Selesai" && k.tanggalSelesai && k.tanggalSelesai < k.tanggal) return "Tanggal selesai tidak boleh sebelum tanggal kasus.";
  return null;
}

/** Rapikan isian sebelum disimpan: teks dipangkas, tanggal selesai hanya untuk kasus Selesai. */
export function rapikanKasus(k: KasusInput, hari: Ymd): KasusInput {
  const selesai = k.status === "Selesai";
  return {
    ...k,
    judul: k.judul.trim(),
    uraian: k.uraian.trim(),
    tindakLanjut: k.tindakLanjut.trim(),
    tanggalSelesai: selesai ? (k.tanggalSelesai ?? hari) : null,
  };
}

/** Kontrak perlu berlencana "Ada sengketa": ada kasus terbuka berjenis pemicu. */
export function adaSengketaTerbuka(daftar: readonly Pick<Kasus, "jenis" | "status">[], pemicu: readonly JenisKasus[] = JENIS_MEMICU_SENGKETA): boolean {
  return daftar.some((k) => k.status === "Terbuka" && pemicu.includes(k.jenis));
}

/** Kasus terbuka yang tenggat tindak lanjutnya sudah lewat. */
export function lewatBatas(k: Pick<Kasus, "status" | "batasTindakLanjut">, hari: Ymd): boolean {
  return k.status === "Terbuka" && !!k.batasTindakLanjut && k.batasTindakLanjut < hari;
}

/** Terbuka di atas (tenggat terdekat dulu), lalu yang selesai; dalam kelompok, tanggal terbaru dulu. */
export function urutkanKasus<T extends Pick<Kasus, "id" | "status" | "tanggal" | "batasTindakLanjut">>(daftar: readonly T[]): T[] {
  return [...daftar].sort((a, b) => {
    if (a.status !== b.status) return a.status === "Terbuka" ? -1 : 1;
    if (a.status === "Terbuka") {
      const ta = a.batasTindakLanjut ?? "9999-12-31";
      const tb = b.batasTindakLanjut ?? "9999-12-31";
      if (ta !== tb) return ta.localeCompare(tb);
    }
    return (b.tanggal ?? "").localeCompare(a.tanggal ?? "") || b.id - a.id;
  });
}

export function ringkasKasus(daftar: readonly Pick<Kasus, "status" | "batasTindakLanjut">[], hari: Ymd): { total: number; terbuka: number; lewat: number } {
  return {
    total: daftar.length,
    terbuka: daftar.filter((k) => k.status === "Terbuka").length,
    lewat: daftar.filter((k) => lewatBatas(k, hari)).length,
  };
}
