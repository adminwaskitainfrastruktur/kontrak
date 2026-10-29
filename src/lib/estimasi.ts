// Perkiraan kapan pengajuan di antrean selesai direview, dari riwayat status 90 hari terakhir.
//
// Dua bagian dijumlahkan, keduanya dalam hari kerja (Senin-Jumat, Jakarta):
//   1. Menunggu giliran: laju Legal memulai review (jumlah perpindahan Diajukan -> Review Legal per hari kerja)
//      dikali posisi. Median lama menunggu per kontrak tidak dipakai langsung karena tidak peka posisi:
//      kontrak di urutan ke-9 pasti menunggu lebih lama daripada median.
//   2. Lama review: median (batas bawah) dan P75 (batas atas) durasi Review Legal sampai Proses Tanda Tangan.
// Batas atas menunggu diberi kelonggaran 50% karena laju harian naik-turun.
//
// Ini perkiraan, bukan janji: teksnya selalu memakai kata "perkiraan", dan bila datanya kurang dari
// MIN_SAMPEL_ESTIMASI kita jujur bahwa belum cukup data.
import { HARI_MS, bangunInterval, hariKerjaAntara, median, persentil, ymdWib, type EventStatus } from "./laporan";
import type { Ymd } from "./types";

export const JENDELA_ESTIMASI_HARI = 90;
export const MIN_SAMPEL_ESTIMASI = 5;
const KELONGGARAN_ANTRE = 1.5;

export interface PerkiraanAntrean {
  teks: string;
  /** Hari kerja dari sekarang sampai review selesai (masuk tanda tangan). null bila data belum cukup. */
  hariMin: number | null;
  hariMaks: number | null;
  /** Jumlah data yang mendasari perkiraan (yang paling sedikit di antara dua bagian). */
  sampel: number;
  /** Hari kerja sampai review dimulai. null bila data belum cukup. */
  mulaiReview: { hariMin: number; hariMaks: number } | null;
  /** Perkiraan tanggal (Jakarta) review selesai, untuk email. */
  tanggalMin: Ymd | null;
  tanggalMaks: Ymd | null;
}

/** Tanggal Jakarta setelah `n` hari kerja dari `mulai` (pecahan dibulatkan ke atas, akhir pekan dilewati). */
export function tambahHariKerja(mulai: number, n: number): Ymd {
  let sisa = Math.max(0, Math.ceil(n));
  let hari = Date.parse(`${ymdWib(mulai)}T00:00:00Z`);
  while (sisa > 0) {
    hari += HARI_MS;
    const pekan = new Date(hari).getUTCDay();
    if (pekan !== 0 && pekan !== 6) sisa--;
  }
  return new Date(hari).toISOString().slice(0, 10);
}

const fmtTanggal = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", timeZone: "UTC" });
const teksTanggal = (ymd: Ymd) => fmtTanggal.format(new Date(`${ymd}T00:00:00Z`));

function teksRentang(min: number, maks: number): string {
  return min === maks ? `sekitar ${min} hari kerja` : `sekitar ${min} sampai ${maks} hari kerja`;
}

/**
 * Perkiraan selesai antrean untuk pengajuan di `posisi` (1 = berikutnya direview).
 * `event` boleh berisi seluruh riwayat; yang dipakai hanya 90 hari terakhir sebelum `sekarang`.
 */
export function perkiraanSelesaiAntrean(posisi: number, event: readonly EventStatus[], sekarang: number): PerkiraanAntrean {
  const batasAwal = sekarang - JENDELA_ESTIMASI_HARI * HARI_MS;
  const dalamJendela = (ms: number) => ms >= batasAwal && ms <= sekarang;

  const mulaiReview = event.filter((e) => e.statusDari === "Diajukan" && e.statusKe === "Review Legal" && dalamJendela(Date.parse(e.waktu)));
  const review = bangunInterval(event)
    .filter((iv) => iv.tahap === "Review Legal" && iv.ke === "Proses Tanda Tangan" && dalamJendela(iv.selesai))
    .map((iv) => hariKerjaAntara(iv.mulai, iv.selesai));

  const sampel = Math.min(mulaiReview.length, review.length);
  const kosong: PerkiraanAntrean = {
    teks: "Kami belum cukup data untuk memperkirakan kapan review selesai. Posisi antrean tetap diperbarui otomatis.",
    hariMin: null,
    hariMaks: null,
    sampel,
    mulaiReview: null,
    tanggalMin: null,
    tanggalMaks: null,
  };
  if (!Number.isFinite(posisi) || posisi < 1 || sampel < MIN_SAMPEL_ESTIMASI) return kosong;

  // Aplikasi yang belum berumur 90 hari: laju dihitung sejak event pertama, supaya tidak tampak lambat.
  const pertama = event.reduce((m, e) => {
    const t = Date.parse(e.waktu);
    return Number.isNaN(t) ? m : Math.min(m, t);
  }, sekarang);
  const hariAmatan = hariKerjaAntara(Math.max(batasAwal, Math.min(pertama, sekarang - HARI_MS)), sekarang);
  if (!(hariAmatan > 0)) return kosong;
  const laju = mulaiReview.length / hariAmatan;

  const antre = posisi / laju;
  const antreMin = Math.max(0, Math.round(antre));
  const antreMaks = Math.max(antreMin, Math.ceil(antre * KELONGGARAN_ANTRE));
  const hariMin = Math.max(1, Math.round(antre + median(review)));
  const hariMaks = Math.max(hariMin, Math.ceil(antre * KELONGGARAN_ANTRE + persentil(review, 0.75)));
  const tanggalMin = tambahHariKerja(sekarang, hariMin);
  const tanggalMaks = tambahHariKerja(sekarang, hariMaks);

  const mulai =
    antreMaks === 0
      ? "review bisa dimulai hari ini"
      : antreMin === 0
        ? `review dimulai hari ini atau dalam ${antreMaks} hari kerja`
        : `review dimulai dalam ${teksRentang(antreMin, antreMaks)}`;
  const selesai = tanggalMin === tanggalMaks ? `selesai sekitar ${teksTanggal(tanggalMin)}` : `selesai antara ${teksTanggal(tanggalMin)} dan ${teksTanggal(tanggalMaks)}`;
  return {
    teks: `Perkiraan kami, ${mulai} dan ${selesai}. Dihitung dari ${sampel} pengajuan dalam ${JENDELA_ESTIMASI_HARI} hari terakhir, jadi bisa bergeser.`,
    hariMin,
    hariMaks,
    sampel,
    mulaiReview: { hariMin: antreMin, hariMaks: antreMaks },
    tanggalMin,
    tanggalMaks,
  };
}
