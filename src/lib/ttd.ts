// Pelacak tanda tangan per langkah (U21). Isinya disimpan di kolom ChecklistTtd (JSON) lewat
// simpanChecklistTtd. Murni dan teruji: tidak ada React dan tidak ada jaringan di sini.
//
// "Tidak berlaku" dan tanggal langkah tidak ada di tipe ItemChecklist, jadi ItemTtd menambahkannya.
// Kolom JSON menyimpan seluruh objek apa adanya, jadi dua field tambahan ikut tersimpan tanpa kolom baru.

import { adalahLegal } from "./alur";
import { teksUkuran } from "./jenisBerkas";
import { daftarTahapTtd, type OverrideTtd } from "./syarat";
import type { CaraTtd, ChecklistTtd, ItemChecklist, JejakDraftFinal, Kontrak, Sesi, Ymd } from "./types";

export { TAHAP_TTD_BAWAAN, daftarTahapTtd, type OverrideTtd, type TahapTtd } from "./syarat";

export const VERSI_TTD = 1;

// Sama dengan keYmd di lib/format.ts, ditulis ulang di sini karena format.ts menarik config.ts
// (import.meta.env) sehingga modul ini tidak bisa diuji di Node.
const fmtYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
function keYmd(iso: string | null | undefined): Ymd | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : fmtYmd.format(d);
}

export interface ItemTtd extends ItemChecklist {
  /** Langkah ini tidak diperlukan untuk kontrak ini (mis. tanpa paraf). Tidak dihitung di "TTD n/m". */
  tidakBerlaku?: boolean;
  /** Tanggal langkah terjadi (boleh berbeda dari saat dicatat). `waktu` adalah saat Legal mencatatnya. */
  tanggal?: Ymd;
}

/**
 * Gabungkan langkah standar dengan isian tersimpan (cocok lewat id). Langkah tersimpan yang tidak lagi ada di
 * standar dibawa bila sudah selesai atau ditandai tidak berlaku.
 */
export function susunTtd(tersimpan: ChecklistTtd | null | undefined, override?: OverrideTtd): ItemTtd[] {
  const standar = daftarTahapTtd(override);
  const simpan = new Map(((tersimpan?.items ?? []) as ItemTtd[]).map((i) => [i.id, i]));
  const hasil: ItemTtd[] = standar.map((t) => {
    const s = simpan.get(t.id);
    const tidakBerlaku = s?.tidakBerlaku === true;
    return {
      id: t.id,
      label: t.label,
      selesai: !tidakBerlaku && s?.selesai === true,
      ...(tidakBerlaku ? { tidakBerlaku: true } : {}),
      ...(s?.tanggal ? { tanggal: s.tanggal } : {}),
      ...(s?.catatan ? { catatan: s.catatan } : {}),
      ...(s?.oleh ? { oleh: s.oleh } : {}),
      ...(s?.waktu ? { waktu: s.waktu } : {}),
    };
  });
  const dikenal = new Set(standar.map((t) => t.id));
  const yatim = ((tersimpan?.items ?? []) as ItemTtd[]).filter((i) => !dikenal.has(i.id) && (i.selesai || i.tidakBerlaku));
  return [...hasil, ...yatim];
}

export interface HitungTtd {
  selesai: number;
  /** Jumlah langkah yang berlaku (tidak termasuk yang ditandai tidak berlaku). */
  total: number;
  tidakBerlaku: number;
}

export function hitungTtd(items: readonly ItemTtd[]): HitungTtd {
  const berlaku = items.filter((i) => !i.tidakBerlaku);
  return { selesai: berlaku.filter((i) => i.selesai).length, total: berlaku.length, tidakBerlaku: items.length - berlaku.length };
}

export interface RingkasanTtd {
  selesai: number;
  total: number;
  /** Untuk chip: "TTD 3/5". */
  teks: string;
  lengkap: boolean;
}

/** Ringkasan untuk chip di kartu dan antrean. Kontrak tanpa data TTD dihitung dari langkah standar, semuanya belum. */
export function ringkasTtd(k: Pick<Kontrak, "checklistTtd">, override?: OverrideTtd): RingkasanTtd {
  const { selesai, total } = hitungTtd(susunTtd(k.checklistTtd, override));
  return {
    selesai,
    total,
    teks: total === 0 ? "TTD tanpa langkah" : `TTD ${selesai}/${total}`,
    lengkap: total > 0 && selesai === total,
  };
}

/** Langkah berlaku pertama yang belum selesai. null bila semuanya sudah selesai atau tidak berlaku. */
export function langkahBerikutnya(items: readonly ItemTtd[]): ItemTtd | null {
  return items.find((i) => !i.tidakBerlaku && !i.selesai) ?? null;
}

const tanggalLangkah = (i: ItemTtd): Ymd | null => i.tanggal ?? keYmd(i.waktu);

/** Posisi sekarang: menunggu langkah apa, dan sejak kapan (tanggal langkah terakhir yang selesai). */
export function posisiTtd(items: readonly ItemTtd[]): { langkah: ItemTtd; sejak: Ymd | null } | null {
  const langkah = langkahBerikutnya(items);
  if (!langkah) return null;
  const tanggal = items
    .filter((i) => i.selesai && !i.tidakBerlaku)
    .map(tanggalLangkah)
    .filter((t): t is Ymd => t != null)
    .sort();
  return { langkah, sejak: tanggal[tanggal.length - 1] ?? null };
}

/**
 * Tanggal tanda tangan terakhir, untuk mengisi tanggal tanda tangan saat aktivasi. Hanya langkah yang
 * bertanda `penandatanganan` (TTD mitra, TTD direksi) yang dihitung; null bila belum ada yang selesai.
 */
export function tanggalTtdTerakhir(c: ChecklistTtd | null | undefined, override?: OverrideTtd): Ymd | null {
  const idTtd = new Set(daftarTahapTtd(override).filter((t) => t.penandatanganan).map((t) => t.id));
  const tanggal = susunTtd(c, override)
    .filter((i) => idTtd.has(i.id) && i.selesai && !i.tidakBerlaku)
    .map(tanggalLangkah)
    .filter((t): t is Ymd => t != null)
    .sort();
  return tanggal[tanggal.length - 1] ?? null;
}

export interface PerubahanLangkah {
  selesai?: boolean;
  tidakBerlaku?: boolean;
  tanggal?: Ymd | null;
  catatan?: string;
}

/**
 * Terapkan satu perubahan pada satu langkah dan kembalikan daftar baru (tidak mengubah yang lama).
 * Aturan: selesai dan tidak berlaku saling meniadakan; menandai belum selesai atau tidak berlaku
 * menghapus tanggal dan jejak siapa-kapan; menandai selesai tanpa tanggal memakai hari ini (Jakarta).
 */
export function ubahLangkah(items: readonly ItemTtd[], id: string, p: PerubahanLangkah, oleh: string, sekarang: Date = new Date()): ItemTtd[] {
  return items.map((lama) => {
    if (lama.id !== id) return lama;
    const baru: ItemTtd = { ...lama };

    if (p.tidakBerlaku === true) {
      baru.tidakBerlaku = true;
      baru.selesai = false;
    } else if (p.tidakBerlaku === false) {
      delete baru.tidakBerlaku;
    }

    if (p.selesai === true) {
      delete baru.tidakBerlaku;
      baru.selesai = true;
      baru.tanggal = p.tanggal ?? lama.tanggal ?? keYmd(sekarang.toISOString()) ?? undefined;
      baru.oleh = oleh;
      baru.waktu = sekarang.toISOString();
    } else if (p.selesai === false) {
      baru.selesai = false;
    }

    if (!baru.selesai) {
      delete baru.tanggal;
      delete baru.oleh;
      delete baru.waktu;
    } else if (p.tanggal !== undefined && p.selesai === undefined) {
      // Hanya mengoreksi tanggal pada langkah yang sudah selesai; kosong berarti kembali ke tanggal pencatatan.
      baru.tanggal = p.tanggal ?? keYmd(baru.waktu) ?? undefined;
    }

    if (p.catatan !== undefined) {
      const bersih = p.catatan.trim();
      if (bersih) baru.catatan = bersih;
      else delete baru.catatan;
    }
    if (baru.tanggal === undefined) delete baru.tanggal;
    return baru;
  });
}

/**
 * Bungkus daftar langkah menjadi nilai kolom ChecklistTtd. `lama` membawa data di luar langkah (cara tanda
 * tangan, sidik draft final) supaya tidak hilang saat satu langkah disimpan ulang.
 */
export function bungkusTtd(items: readonly ItemTtd[], lama?: Pick<ChecklistTtd, "cara" | "draftFinal"> | null): ChecklistTtd {
  return {
    versi: VERSI_TTD,
    items: [...items],
    ...(lama?.cara ? { cara: lama.cara } : {}),
    ...(lama?.draftFinal ? { draftFinal: lama.draftFinal } : {}),
  };
}

// --- Cara tanda tangan dan draft final (U21) ------------------------------------------------

/** Nama dan penjelasan tiap cara tanda tangan. Standar awal; daftar bisa disesuaikan Legal. */
export const INFO_CARA_TTD: Record<CaraTtd, { label: string; petunjuk: string }> = {
  basah: { label: "Basah", petunjuk: "Ditandatangani dengan tinta di atas kertas, lalu dipindai." },
  tte: { label: "Elektronik (TTE)", petunjuk: "Tanda tangan elektronik tersertifikasi lewat penyelenggara (PSrE)." },
  "e-meterai": { label: "TTE + e-meterai", petunjuk: "Tanda tangan elektronik dengan meterai elektronik pada dokumen." },
  campuran: { label: "Campuran", petunjuk: "Mis. mitra tanda tangan basah, WKI tanda tangan elektronik." },
};

export function labelCaraTtd(cara: CaraTtd | null | undefined): string {
  return cara ? (INFO_CARA_TTD[cara]?.label ?? cara) : "Belum dipilih";
}

/** ChecklistTtd dengan cara tanda tangan baru (null = kosongkan), langkah dan sidik draft tetap. */
export function aturCaraTtd(c: ChecklistTtd | null | undefined, cara: CaraTtd | null, override?: OverrideTtd): ChecklistTtd {
  return bungkusTtd(susunTtd(c, override), { cara: cara ?? undefined, draftFinal: c?.draftFinal });
}

/** ChecklistTtd dengan sidik draft final yang baru, langkah dan cara tetap. */
export function aturDraftFinal(c: ChecklistTtd | null | undefined, jejak: JejakDraftFinal, override?: OverrideTtd): ChecklistTtd {
  return bungkusTtd(susunTtd(c, override), { cara: c?.cara, draftFinal: jejak });
}

/** SHA-256 isi berkas dalam heksadesimal huruf kecil (Web Crypto, tersedia di peramban dan Node). */
export async function hitungSha256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const isi = data instanceof Uint8Array ? data : new Uint8Array(data);
  const hasil = await globalThis.crypto.subtle.digest("SHA-256", isi as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(hasil), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** "3f2a 9c1b … 7d40": awal dan akhir sidik untuk dibaca cepat; sidik lengkap tetap tersimpan. */
export function ringkasSha256(hex: string): string {
  const h = hex.trim().toLowerCase();
  if (h.length <= 16) return h;
  return `${h.slice(0, 4)} ${h.slice(4, 8)} … ${h.slice(-4)}`;
}

/** Kalimat riwayat untuk draft final yang disepakati: nama, ukuran, dan sidik SHA-256 lengkap. */
export function teksDraftFinal(j: Pick<JejakDraftFinal, "nama" | "ukuran" | "sha256">, alasanTanpaSidik?: string): string {
  const dasar = `Draft final yang disepakati: "${j.nama}" (${teksUkuran(j.ukuran)})`;
  return j.sha256 ? `${dasar}, SHA-256 ${j.sha256}.` : `${dasar}. Sidik SHA-256 belum bisa dihitung${alasanTanpaSidik ? `: ${alasanTanpaSidik}` : ""}.`;
}

/** Panel TTD tampil saat tanda tangan berjalan, dan sesudahnya bila sudah ada catatan langkah. */
export function tampilkanPanelTtd(k: Pick<Kontrak, "status" | "checklistTtd">): boolean {
  if (k.status === "Proses Tanda Tangan") return true;
  if (k.status === "Aktif" || k.status === "Berakhir") return (k.checklistTtd?.items ?? []).length > 0;
  return false;
}

/** Hanya Legal yang mencatat, dan hanya selama kontrak berada di Proses Tanda Tangan. */
export function bolehUbahTtd(k: Pick<Kontrak, "status">, sesi: Sesi): boolean {
  return adalahLegal(sesi) && k.status === "Proses Tanda Tangan";
}
