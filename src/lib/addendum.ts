// Aturan addendum. Addendum adalah kontrak tersendiri (punya nomor pengajuan, alur review, dan
// dokumennya sendiri) yang menaut ke kontrak induk lewat KontrakIndukId.
//
// Angka "efektif" pada kontrak induk dihitung dari addendum yang SUDAH BERLAKU (status Aktif):
//   - Masa berlaku efektif = tanggal berakhir paling akhir di antara induk dan addendum aktif.
//   - Nilai efektif        = nilai induk + jumlah nilai addendum aktif (semua dalam mata uang yang sama).
// Nilai pada addendum dipahami sebagai SELISIH terhadap induk: positif untuk tambahan, negatif
// untuk pengurangan, kosong bila addendum tidak mengubah nilai.
//
// Addendum yang mata uangnya berbeda dari induk (data lama, sebelum mata uang dikunci) TIDAK ikut
// nilai efektif. Supaya tidak hilang diam-diam, addendum seperti itu dikumpulkan di `bedaMataUang`
// dan ditandai di daftar serta dashboard (U29A).
import { STATUS_PROSES, JENIS_ADDENDUM, type Kontrak, type Ymd } from "./types";

export interface RingkasanAddendum {
  /** Semua addendum kontrak ini, diurutkan ke-1, ke-2, ... */
  daftar: Kontrak[];
  aktif: Kontrak[];
  /** Addendum yang masih diproses (belum berlaku). */
  berjalan: Kontrak[];
  berakhirEfektif: Ymd | null;
  nilaiEfektif: number | null;
  /** Masa berlaku efektif lebih lama daripada tanggal berakhir induk. */
  diperpanjang: boolean;
  /** Ada addendum aktif yang mengubah nilai. */
  nilaiBerubah: boolean;
  /** Addendum yang masih diproses dan memperpanjang masa berlaku (U05A). */
  perpanjanganBerjalan: Kontrak[];
  /** Addendum aktif atau diproses yang mata uangnya berbeda dari induk: nilainya tidak dijumlahkan. */
  bedaMataUang: Kontrak[];
}

export const adalahAddendum = (k: Kontrak) => k.jenis === JENIS_ADDENDUM && k.kontrakIndukId != null;

/** Addendum yang masih "hidup": berlaku atau sedang diproses (bukan Ditolak, Dibatalkan, atau Berakhir). */
const hidup = (a: Kontrak) => a.status === "Aktif" || STATUS_PROSES.includes(a.status);

/**
 * Addendum ini memperpanjang masa berlaku: berjenis "Perpanjangan Waktu", atau (data lama tanpa jenis
 * perubahan) mengusulkan tanggal berakhir yang lebih akhir daripada masa berlaku induk saat ini.
 */
export function memperpanjang(a: Pick<Kontrak, "jenisPerubahan" | "tanggalBerakhir">, akhirInduk: Ymd | null): boolean {
  if (a.jenisPerubahan.includes("Perpanjangan Waktu")) return true;
  return a.jenisPerubahan.length === 0 && !!a.tanggalBerakhir && !!akhirInduk && a.tanggalBerakhir > akhirInduk;
}

/** Mata uang addendum berbeda dari induknya. */
export function bedaMataUang(a: Pick<Kontrak, "mataUang">, induk: Pick<Kontrak, "mataUang"> | null | undefined): boolean {
  return !!induk && a.mataUang !== induk.mataUang;
}

export function ringkasAddendum(induk: Kontrak, semua: readonly Kontrak[]): RingkasanAddendum {
  const daftar = semua
    .filter((x) => x.kontrakIndukId === induk.id && x.jenis === JENIS_ADDENDUM)
    .sort((a, b) => (a.urutanAddendum ?? 0) - (b.urutanAddendum ?? 0) || a.dibuat.localeCompare(b.dibuat));
  const aktif = daftar.filter((x) => x.status === "Aktif");
  const berjalan = daftar.filter((x) => STATUS_PROSES.includes(x.status));

  let berakhirEfektif = induk.tanggalBerakhir;
  for (const a of aktif) {
    if (a.tanggalBerakhir && (!berakhirEfektif || a.tanggalBerakhir > berakhirEfektif)) berakhirEfektif = a.tanggalBerakhir;
  }

  const penyesuai = aktif.filter((a) => a.nilai != null && a.mataUang === induk.mataUang);
  const nilaiEfektif = induk.nilai == null && penyesuai.length === 0 ? null : (induk.nilai ?? 0) + penyesuai.reduce((n, a) => n + (a.nilai ?? 0), 0);

  return {
    daftar,
    aktif,
    berjalan,
    berakhirEfektif,
    nilaiEfektif,
    diperpanjang: !!berakhirEfektif && !!induk.tanggalBerakhir && berakhirEfektif > induk.tanggalBerakhir,
    nilaiBerubah: penyesuai.length > 0,
    perpanjanganBerjalan: berjalan.filter((a) => memperpanjang(a, berakhirEfektif)),
    bedaMataUang: daftar.filter((a) => hidup(a) && bedaMataUang(a, induk)),
  };
}

/** Tanggal berakhir yang berlaku sekarang (memperhitungkan addendum aktif). */
export function berakhirEfektif(k: Kontrak, semua: readonly Kontrak[]): Ymd | null {
  return adalahAddendum(k) ? k.tanggalBerakhir : ringkasAddendum(k, semua).berakhirEfektif;
}

/** Judul usulan untuk addendum baru, mis. "Addendum ke-2 Sewa Alat Berat Proyek Tol X". */
export function judulUsulanAddendum(induk: Kontrak, semua: readonly Kontrak[]): string {
  const ke = ringkasAddendum(induk, semua).daftar.filter((a) => a.status !== "Ditolak" && a.status !== "Dibatalkan").length + 1;
  return `Addendum ke-${ke} ${induk.judul}`;
}

// --- Peta untuk daftar dan dashboard (dihitung sekali per data, bukan per baris) ---------------------

/** Addendum dikelompokkan per kontrak induk dalam satu lintasan. */
function kelompokPerInduk(semua: readonly Kontrak[]): Map<number, Kontrak[]> {
  const peta = new Map<number, Kontrak[]>();
  for (const a of semua) {
    if (!adalahAddendum(a)) continue;
    const isi = peta.get(a.kontrakIndukId!);
    if (isi) isi.push(a);
    else peta.set(a.kontrakIndukId!, [a]);
  }
  return peta;
}

/**
 * id induk -> addendum perpanjangan yang sedang diproses (Diajukan, Review Legal, Perlu Revisi, atau
 * Proses Tanda Tangan). Dipakai lencana "Perpanjangan diproses" di daftar dan dashboard (U05A), supaya
 * kontrak yang sebenarnya sedang diperpanjang tidak dikira terlupa.
 */
export function petaPerpanjanganDiproses(semua: readonly Kontrak[]): Map<number, Kontrak[]> {
  const hasil = new Map<number, Kontrak[]>();
  const indukPer = new Map(semua.map((k) => [k.id, k]));
  for (const [indukId, addendum] of kelompokPerInduk(semua)) {
    if (!addendum.some((a) => STATUS_PROSES.includes(a.status))) continue;
    const induk = indukPer.get(indukId);
    if (!induk) continue;
    const berjalan = ringkasAddendum(induk, semua).perpanjanganBerjalan;
    if (berjalan.length) hasil.set(indukId, berjalan);
  }
  return hasil;
}

/**
 * Semua addendum aktif atau diproses yang mata uangnya berbeda dari induknya, urut induk lalu urutan addendum.
 * Nilainya tidak dijumlahkan ke nilai efektif induk. Dipakai untuk peringatan di daftar, dashboard, dan
 * formulir/chat addendum (mata uang addendum dikunci sama dengan induk).
 */
export function addendumBedaMataUang(semua: readonly Kontrak[]): Kontrak[] {
  const indukPer = new Map(semua.map((k) => [k.id, k]));
  return semua
    .filter((a) => adalahAddendum(a) && hidup(a) && bedaMataUang(a, indukPer.get(a.kontrakIndukId!)))
    .sort((a, b) => a.kontrakIndukId! - b.kontrakIndukId! || (a.urutanAddendum ?? 0) - (b.urutanAddendum ?? 0) || a.id - b.id);
}

/** id induk -> addendum yang mata uangnya berbeda (lihat addendumBedaMataUang). */
export function petaBedaMataUang(semua: readonly Kontrak[]): Map<number, Kontrak[]> {
  const hasil = new Map<number, Kontrak[]>();
  for (const a of addendumBedaMataUang(semua)) {
    const isi = hasil.get(a.kontrakIndukId!);
    if (isi) isi.push(a);
    else hasil.set(a.kontrakIndukId!, [a]);
  }
  return hasil;
}
