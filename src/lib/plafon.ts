// Plafon pada kontrak payung (U35): perjanjian harga satuan atau MoU yang melahirkan kontrak turunan.
//
// Payung = MoU (tanpa plafon, tetap payung) atau kontrak yang kolom Plafon-nya diisi. Kontrak turunan
// menaut lewat MouAcuanId (nama kolom tidak diubah). Perhitungan memakai SEMUA kontrak, tanpa filter
// bisaLihat, supaya pengaju melihat angka agregat yang benar; yang ditampilkan ke pengaju hanya agregat
// dan jumlah, tidak pernah isi kontrak orang lain. Peringatan bersifat lunak dan tidak memblokir.
import { adalahAddendum, ringkasAddendum } from "./addendum";
import { akhirKontrak } from "./masa";
import { JENIS_ADDENDUM, JENIS_MOU, STATUS_PROSES, type Kontrak, type MataUang } from "./types";

export const adalahPayung = (k: Kontrak): boolean => !adalahAddendum(k) && (k.jenis === JENIS_MOU || k.plafon != null);

/** Kontrak turunan sebuah payung (bukan addendum), semua status. */
export const turunanPayung = (payung: Kontrak, semua: readonly Kontrak[]): Kontrak[] => semua.filter((k) => k.mouAcuanId === payung.id && k.jenis !== JENIS_ADDENDUM);

/** Turunan yang menghabiskan plafon: yang belum Ditolak atau Dibatalkan. */
export const menghabiskanPlafon = (k: Kontrak): boolean => k.status !== "Ditolak" && k.status !== "Dibatalkan";

export interface PeringatanPlafon {
  kode: "melebihi" | "di-luar-masa";
  /** Lunak: kuning, tidak memblokir. Teks tidak memuat judul atau isi kontrak, hanya angka agregat. */
  nada: "kuning";
  teks: string;
  /** Jumlah turunan yang terkait (untuk "di-luar-masa"). */
  jumlah: number;
}

export interface RingkasanPlafon {
  plafon: number | null;
  mataUang: MataUang;
  /** Jumlah nilai efektif turunan (termasuk addendum aktifnya) yang bermata uang sama dengan payung. */
  terpakai: number;
  /** Bagian dari `terpakai` yang masih dalam proses (belum Aktif). */
  dalamProses: number;
  /** Plafon dikurangi terpakai; negatif bila melebihi. null bila payung tanpa plafon. */
  sisa: number | null;
  /** terpakai / plafon dalam persen, dibulatkan; bisa lebih dari 100. null bila tanpa plafon. */
  persen: number | null;
  /** Turunan yang dihitung (tidak Ditolak/Dibatalkan). */
  jumlahTurunan: number;
  /** Turunan bermata uang lain: tidak dijumlahkan karena tidak ada kurs. */
  jumlahMataUangLain: number;
  /** ID turunan yang masa berlakunya melewati masa berlaku payung. */
  diLuarMasaIds: number[];
  peringatan: PeringatanPlafon[];
}

function uang(n: number, mu: MataUang): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: mu, maximumFractionDigits: mu === "IDR" ? 0 : 2 }).format(n);
}

export function ringkasPlafon(payung: Kontrak, semua: readonly Kontrak[]): RingkasanPlafon {
  const dihitung = turunanPayung(payung, semua).filter(menghabiskanPlafon);
  const sama = dihitung.filter((t) => t.mataUang === payung.mataUang);
  const nilaiEfektif = (t: Kontrak) => ringkasAddendum(t, semua as Kontrak[]).nilaiEfektif ?? 0;

  const terpakai = sama.reduce((n, t) => n + nilaiEfektif(t), 0);
  const dalamProses = sama.filter((t) => STATUS_PROSES.includes(t.status)).reduce((n, t) => n + nilaiEfektif(t), 0);
  const plafon = payung.plafon;
  const sisa = plafon != null ? plafon - terpakai : null;
  const persen = plafon != null && plafon > 0 ? Math.round((terpakai / plafon) * 100) : null;

  const mulaiPayung = payung.tanggalMulai;
  const akhirPayung = akhirKontrak(payung, semua);
  const diLuarMasaIds = dihitung
    .filter((t) => {
      const akhirT = akhirKontrak(t, semua);
      return (!!t.tanggalMulai && !!mulaiPayung && t.tanggalMulai < mulaiPayung) || (!!akhirT && !!akhirPayung && akhirT > akhirPayung);
    })
    .map((t) => t.id);

  const peringatan: PeringatanPlafon[] = [];
  if (plafon != null && terpakai > plafon) {
    peringatan.push({ kode: "melebihi", nada: "kuning", jumlah: dihitung.length, teks: `Nilai kontrak turunan sudah melebihi plafon sebesar ${uang(terpakai - plafon, payung.mataUang)}.` });
  }
  if (diLuarMasaIds.length > 0) {
    const n = diLuarMasaIds.length;
    peringatan.push({ kode: "di-luar-masa", nada: "kuning", jumlah: n, teks: n === 1 ? "Ada 1 kontrak turunan yang masa berlakunya di luar masa berlaku payung." : `Ada ${n} kontrak turunan yang masa berlakunya di luar masa berlaku payung.` });
  }

  return { plafon, mataUang: payung.mataUang, terpakai, dalamProses, sisa, persen, jumlahTurunan: dihitung.length, jumlahMataUangLain: dihitung.length - sama.length, diLuarMasaIds, peringatan };
}

/**
 * Peringatan lunak untuk SATU turunan baru atau yang sedang diajukan (dipakai di chat dan formulir):
 * apakah menambah `nilai` melewati plafon payungnya, atau masa berlakunya keluar dari masa payung.
 * `turunanId` mengecualikan turunan itu sendiri dari angka terpakai bila sudah tersimpan.
 */
export function peringatanTurunanBaru(
  payung: Kontrak,
  semua: readonly Kontrak[],
  turunan: { nilai: number | null; mataUang: MataUang; tanggalMulai: string | null; tanggalBerakhir: string | null },
  turunanId?: number,
): string[] {
  const lain = turunanId == null ? semua : semua.filter((k) => k.id !== turunanId);
  const r = ringkasPlafon(payung, lain);
  const hasil: string[] = [];
  if (r.plafon != null && turunan.nilai != null && turunan.mataUang === payung.mataUang && r.terpakai + turunan.nilai > r.plafon) {
    hasil.push(`Dengan nilai ini, total turunan menjadi ${uang(r.terpakai + turunan.nilai, payung.mataUang)}, melebihi plafon ${uang(r.plafon, payung.mataUang)}.`);
  }
  const akhirPayung = akhirKontrak(payung, semua);
  if ((turunan.tanggalMulai && payung.tanggalMulai && turunan.tanggalMulai < payung.tanggalMulai) || (turunan.tanggalBerakhir && akhirPayung && turunan.tanggalBerakhir > akhirPayung)) {
    hasil.push("Masa berlaku kontrak ini keluar dari masa berlaku payungnya.");
  }
  return hasil;
}
