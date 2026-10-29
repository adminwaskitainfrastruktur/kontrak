// Beban kerja tim Legal dan saran PIC (U02, permintaan "PIC otomatis berdasarkan beban kerja").
//
// Beban = kontrak berstatus Review Legal dan Proses Tanda Tangan yang dipegang seseorang sebagai PIC.
// Diajukan dan Perlu Revisi tidak dihitung: yang pertama belum disentuh, yang kedua sedang di tangan pengaju.
// Saran PIC hanya usulan; keputusan tetap di tangan Legal yang menugaskan.
import { STATUS_PROSES, type Kontrak, type Pengguna, type Peran } from "./types";

/** Status yang dihitung sebagai beban aktif seorang PIC. */
export const STATUS_BEBAN = ["Review Legal", "Proses Tanda Tangan"] as const;

export interface BebanStaf {
  email: string;
  nama: string;
  peran: Peran | null;
  /** false bila orang ini memegang kontrak tetapi tidak lagi terdaftar sebagai staf Legal aktif. */
  aktif: boolean;
  review: number;
  ttd: number;
  /** review + ttd */
  total: number;
  /** Kontrak beban (Review + TTD) yang paling lama berada di tahapnya. */
  terlama: Kontrak | null;
  /** Semua kontrak yang masih diproses dan dipegang orang ini (termasuk Diajukan dan Perlu Revisi), untuk alih massal. */
  dipegang: Kontrak[];
}

/** Staf yang bisa ditugasi: Legal aktif, dan Admin yang berada di divisi Legal. */
export function adalahStafLegal(p: Pick<Pengguna, "peran" | "divisi" | "aktif">): boolean {
  return p.aktif && (p.peran === "Legal" || (p.peran === "Admin" && p.divisi === "Legal"));
}

const sejak = (k: Kontrak) => k.statusSejak ?? k.tanggalDiajukan ?? k.dibuat;

/** Kontrak yang masih diproses dan dipegang `email` (untuk "Alihkan semua"). */
export function kontrakDipegang(email: string, kontrak: readonly Kontrak[]): Kontrak[] {
  const e = email.trim().toLowerCase();
  if (!e) return [];
  return kontrak.filter((k) => STATUS_PROSES.includes(k.status) && k.picLegalEmail.trim().toLowerCase() === e).sort((a, b) => sejak(a).localeCompare(sejak(b)));
}

/**
 * Beban per staf Legal aktif. Orang yang masih memegang kontrak tetapi sudah nonaktif ikut ditampilkan
 * (aktif: false) supaya kontraknya bisa dialihkan. Urutan: beban terberat di atas.
 */
export function bebanTim(pengguna: readonly Pengguna[], kontrak: readonly Kontrak[]): BebanStaf[] {
  const peta = new Map<string, BebanStaf>();
  const baru = (email: string, nama: string, peran: Peran | null, aktif: boolean): BebanStaf => ({ email, nama, peran, aktif, review: 0, ttd: 0, total: 0, terlama: null, dipegang: [] });

  for (const p of pengguna) {
    if (!adalahStafLegal(p)) continue;
    const e = p.email.trim().toLowerCase();
    if (e) peta.set(e, baru(e, p.nama || e, p.peran, true));
  }

  for (const k of kontrak) {
    if (!STATUS_PROSES.includes(k.status)) continue;
    const e = k.picLegalEmail.trim().toLowerCase();
    if (!e) continue;
    let b = peta.get(e);
    if (!b) {
      const p = pengguna.find((x) => x.email.trim().toLowerCase() === e);
      b = baru(e, p?.nama || k.picLegalNama || e, p?.peran ?? null, false);
      peta.set(e, b);
    }
    b.dipegang.push(k);
    if (k.status === "Review Legal") b.review++;
    else if (k.status === "Proses Tanda Tangan") b.ttd++;
    else continue;
    b.total++;
    if (!b.terlama || sejak(k) < sejak(b.terlama)) b.terlama = k;
  }

  for (const b of peta.values()) b.dipegang.sort((a, c) => sejak(a).localeCompare(sejak(c)));
  return [...peta.values()].sort((a, b) => Number(b.aktif) - Number(a.aktif) || b.total - a.total || a.nama.localeCompare(b.nama, "id"));
}

export interface SaranPic {
  staf: BebanStaf;
  /** Kalimat penjelasan, mis. "Beban Rina paling ringan: 1 review, 0 tanda tangan." */
  alasan: string;
}

function teksBeban(b: Pick<BebanStaf, "review" | "ttd">): string {
  return `${b.review} review, ${b.ttd} tanda tangan`;
}

/**
 * Usulkan staf dengan beban terendah. Seri dipecah dengan jumlah tanda tangan (lebih sedikit lebih
 * ringan), lalu nama. Diri sendiri (`sesiEmail`) hanya diusulkan bila bebannya benar-benar paling
 * ringan, tidak sekadar seri, supaya tombol "Tugaskan" tidak diam-diam menjadi "ambil sendiri".
 * `kecuali` mengeluarkan PIC sekarang (alih tugas tidak boleh mengusulkan orang yang sama).
 */
export function saranPic(beban: readonly BebanStaf[], opsi: { sesiEmail?: string; kecuali?: readonly string[] } = {}): SaranPic | null {
  const kecuali = new Set((opsi.kecuali ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
  const saya = opsi.sesiEmail?.trim().toLowerCase() ?? "";
  const calon = beban.filter((b) => b.aktif && !kecuali.has(b.email)).sort((a, b) => a.total - b.total || a.ttd - b.ttd || a.nama.localeCompare(b.nama, "id"));
  if (calon.length === 0) return null;

  const lain = calon.filter((b) => b.email !== saya);
  const diri = calon.find((b) => b.email === saya);
  if (lain.length === 0) {
    return diri ? { staf: diri, alasan: "Hanya Anda staf Legal aktif yang tersedia saat ini." } : null;
  }
  const terbaikLain = lain[0]!;
  if (diri && diri.total < terbaikLain.total) {
    return { staf: diri, alasan: `Beban Anda paling ringan (${teksBeban(diri)}); staf lain paling sedikit memegang ${terbaikLain.total}.` };
  }
  const seri = lain.filter((b) => b.total === terbaikLain.total).length;
  const alasan =
    terbaikLain.total === 0
      ? `${terbaikLain.nama} sedang tidak memegang review maupun tanda tangan.`
      : seri > 1
        ? `${terbaikLain.nama} termasuk yang paling ringan (${teksBeban(terbaikLain)}), dengan tanda tangan paling sedikit.`
        : `Beban ${terbaikLain.nama} paling ringan: ${teksBeban(terbaikLain)}.`;
  return { staf: terbaikLain, alasan };
}

/** Ringkasan satu baris untuk menu "Tugaskan ke...": "3 review · 1 TTD" atau "Kosong". */
export function labelBeban(b: Pick<BebanStaf, "review" | "ttd">): string {
  if (b.review === 0 && b.ttd === 0) return "Kosong";
  const bagian = [b.review > 0 && `${b.review} review`, b.ttd > 0 && `${b.ttd} TTD`].filter(Boolean);
  return bagian.join(" · ");
}

/** Detail aktivitas Penugasan, lama ke baru. */
export function detailPenugasan(lama: { email: string; nama: string }, baru: { email: string; nama: string }) {
  const tampil = (p: { email: string; nama: string }) => (p.email ? `${p.nama || p.email} <${p.email}>` : "(belum ada)");
  return [{ kolom: "PIC Legal", dari: tampil(lama), ke: tampil(baru) }];
}

/** Pesan aktivitas penugasan yang mudah dibaca di riwayat. */
export function pesanPenugasan(lama: { email: string; nama: string }, baru: { nama: string }, alasan: string, olehNama: string): string {
  const inti = lama.email ? `PIC Legal dialihkan dari ${lama.nama || lama.email} ke ${baru.nama} oleh ${olehNama}.` : `${baru.nama} ditugaskan sebagai PIC Legal oleh ${olehNama}.`;
  return alasan.trim() ? `${inti} Alasan: ${alasan.trim()}` : inti;
}

export interface HasilBertahap<T> {
  berhasil: T[];
  gagal: { item: T; galat: unknown }[];
}

/**
 * Jalankan `kerja` untuk setiap item dengan paling banyak `konkurensi` sekaligus (bukan Graph $batch:
 * setiap item memanggil fungsi service yang sama seperti aksi tunggal). Satu kegagalan tidak menghentikan
 * yang lain; `kemajuan` dipanggil setiap item selesai.
 */
export async function jalankanBertahap<T>(
  daftar: readonly T[],
  kerja: (item: T) => Promise<unknown>,
  opsi: { konkurensi?: number; kemajuan?: (selesai: number, total: number) => void } = {},
): Promise<HasilBertahap<T>> {
  const n = Math.max(1, Math.min(opsi.konkurensi ?? 3, daftar.length || 1));
  const hasil: HasilBertahap<T> = { berhasil: [], gagal: [] };
  let berikut = 0;
  let selesai = 0;
  const pekerja = async () => {
    while (berikut < daftar.length) {
      const item = daftar[berikut++]!;
      try {
        await kerja(item);
        hasil.berhasil.push(item);
      } catch (galat) {
        hasil.gagal.push({ item, galat });
      }
      selesai++;
      opsi.kemajuan?.(selesai, daftar.length);
    }
  };
  await Promise.all(Array.from({ length: n }, pekerja));
  return hasil;
}
