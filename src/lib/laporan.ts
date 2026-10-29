// Laporan layanan Legal: berapa lama kontrak berada di tiap tahap, berapa putaran revisi, dan kontrak mana yang mengendap.
// Semua dihitung di klien dari riwayat perubahan status (list Aktivitas), tanpa kolom turunan yang bisa basi.
//
// Aturan baca:
//   - Satu "interval" = satu kunjungan kontrak di satu tahap, dari masuk sampai keluar. Tahap yang masih berjalan tidak
//     dihitung (belum selesai), tetapi muncul di daftar mengendap.
//   - Awal tahap Diajukan diambil dari TanggalDiajukan kontrak, karena baris riwayat Status baru ada setelah status berubah.
//   - Hari kerja = Senin sampai Jumat menurut kalender Jakarta, dihitung pecahan per jam. Hari libur nasional tidak dikurangi.
//   - Statistik tidak ditampilkan (null) bila sampelnya kurang dari MIN_SAMPEL: median dari dua angka menyesatkan.
//   - Perlu Revisi = menunggu pengaju, jadi waktunya dipisah dari waktu Legal.
import { MENUNGGU_PENGAJU, SLA_HARI, umurTahapHari } from "./sla";
import { DAFTAR_STATUS, STATUS_PROSES, type Kontrak, type Status, type Ymd } from "./types";

// --- Tipe -----------------------------------------------------------------------

/** Satu baris riwayat perubahan status (Aktivitas berjenis Status). */
export interface EventStatus {
  id: number;
  kontrakId: number;
  statusDari: string;
  statusKe: string;
  /** ISO. */
  waktu: string;
  olehNama: string;
}

/** Bagian kontrak yang dibutuhkan untuk menghitung awal tahap Diajukan. */
export type KontrakDasar = Pick<Kontrak, "id" | "tanggalDiajukan" | "dibuat">;

export interface Interval {
  kontrakId: number;
  tahap: Status;
  /** Milidetik epoch. */
  mulai: number;
  selesai: number;
  /** Status tujuan saat tahap ini berakhir. */
  ke: Status;
}

export interface Ukuran {
  median: number;
  p90: number;
}

export interface StatistikDurasi {
  sampel: number;
  kalender: Ukuran;
  kerja: Ukuran;
}

/** `statistik` null bila sampel kurang dari MIN_SAMPEL; `sampel` tetap diisi supaya bisa ditampilkan. */
export interface HasilDurasi {
  sampel: number;
  statistik: StatistikDurasi | null;
}

export interface DurasiTahap extends HasilDurasi {
  tahap: Status;
}

export type PresetPeriode = "bulan-ini" | "3-bulan" | "tahun-ini" | "kustom";

export interface Periode {
  dari: Ymd;
  /** Termasuk hari ini. */
  sampai: Ymd;
  label: string;
}

export interface WaktuLegalPengaju {
  /** Antre + review + tanda tangan, dijumlahkan per kontrak. */
  legal: HasilDurasi;
  /** Menunggu revisi dari pengaju, dijumlahkan per kontrak. */
  pengaju: HasilDurasi;
}

export interface RingkasRevisi {
  kontrakDicakup: number;
  denganRevisi: number;
  /** null bila kontrak yang dicakup kurang dari MIN_SAMPEL. */
  rataRata: number | null;
  /** putaran 3 berarti "3 atau lebih". */
  distribusi: { putaran: number; jumlah: number }[];
  terbanyak: { kontrakId: number; putaran: number }[];
}

export interface Mengendap {
  kontrak: Kontrak;
  umurHari: number;
  batasHari: number;
  lewatHari: number;
  menunggu: "Legal" | "Pengaju";
}

export interface TitikBulan {
  /** "2026-10" */
  kunci: string;
  /** "Okt 2026" */
  label: string;
  diajukan: number;
  selesai: number;
}

export interface Laporan {
  periode: Periode;
  kontrakMasuk: number;
  kontrakSelesai: number;
  tahap: DurasiTahap[];
  /** Dari diajukan sampai berlaku (Aktif), untuk kontrak yang berlakunya jatuh di periode. */
  siklus: HasilDurasi;
  legalVsPengaju: WaktuLegalPengaju;
  revisi: RingkasRevisi;
  mengendap: Mengendap[];
  bulanan: TitikBulan[];
  /** Jumlah interval tahap yang dipakai di periode ini. */
  sampelTahap: number;
  dataTipis: boolean;
}

// --- Konstanta ---------------------------------------------------------------------

export const MIN_SAMPEL = 3;
/** Di bawah jumlah interval ini laporan diberi catatan "datanya masih tipis". */
export const DATA_TIPIS_DI_BAWAH = 10;
/** Tahap yang punya durasi bermakna. Aktif dan Berakhir adalah keadaan, bukan tahap kerja. */
export const TAHAP_LAPORAN: readonly Status[] = ["Diajukan", "Review Legal", "Perlu Revisi", "Proses Tanda Tangan"];
/** Status yang berarti kontrak sudah mendapat hasil dari Legal. */
export const STATUS_HASIL: readonly string[] = ["Aktif", "Ditolak", "Dibatalkan"];

const OFFSET_WIB_MS = 7 * 3_600_000;
export const HARI_MS = 86_400_000;
const MAKS_BULAN_GRAFIK = 36;

const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const adalahStatus = (s: string): s is Status => (DAFTAR_STATUS as readonly string[]).includes(s);

// --- Waktu (kalender Jakarta, UTC+7 tanpa DST) ------------------------------------------

/** Tanggal Jakarta dari milidetik epoch. */
export const ymdWib = (ms: number): Ymd => new Date(ms + OFFSET_WIB_MS).toISOString().slice(0, 10);

/** Milidetik epoch untuk tengah malam Jakarta pada tanggal itu. */
export const awalHariWib = (ymd: Ymd): number => Date.parse(`${ymd}T00:00:00Z`) - OFFSET_WIB_MS;

export const kunciBulan = (ms: number): string => ymdWib(ms).slice(0, 7);

export function labelBulan(kunci: string, panjang = false): string {
  const [t, b] = kunci.split("-");
  const nama = (panjang ? BULAN_PANJANG : BULAN_PENDEK)[Number(b) - 1] ?? kunci;
  return `${nama} ${t}`;
}

/**
 * Hari kerja (Senin-Jumat, Jakarta) di antara dua waktu, pecahan per jam. Akhir pekan dihitung nol,
 * jadi kontrak yang masuk Jumat malam dan direview Senin pagi hanya terhitung beberapa jam.
 */
export function hariKerjaAntara(mulai: number, akhir: number): number {
  if (!(akhir > mulai)) return 0;
  let total = 0;
  const hariAkhir = Math.floor((akhir + OFFSET_WIB_MS) / HARI_MS);
  for (let hari = Math.floor((mulai + OFFSET_WIB_MS) / HARI_MS); hari <= hariAkhir; hari++) {
    // 1 Januari 1970 hari Kamis; 0 = Minggu.
    const pekan = (((hari + 4) % 7) + 7) % 7;
    if (pekan === 0 || pekan === 6) continue;
    const buka = hari * HARI_MS - OFFSET_WIB_MS;
    const lo = Math.max(mulai, buka);
    const hi = Math.min(akhir, buka + HARI_MS);
    if (hi > lo) total += (hi - lo) / HARI_MS;
  }
  return total;
}

// --- Periode ------------------------------------------------------------------------------

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** null bila periode kustom belum lengkap atau terbalik. */
export function periodeDari(preset: PresetPeriode, sekarang: number, kustom?: { dari: string; sampai: string }): Periode | null {
  const hariIni = ymdWib(sekarang);
  const [t, b] = hariIni.split("-").map(Number) as [number, number];
  const awalBulan = (tahun: number, bulan: number): Ymd => {
    const d = new Date(Date.UTC(tahun, bulan - 1, 1));
    return d.toISOString().slice(0, 10);
  };
  switch (preset) {
    case "bulan-ini":
      return { dari: awalBulan(t, b), sampai: hariIni, label: labelBulan(`${t}-${String(b).padStart(2, "0")}`, true) };
    case "3-bulan": {
      const dari = awalBulan(t, b - 2);
      return { dari, sampai: hariIni, label: `${labelBulan(dari.slice(0, 7))} sampai ${labelBulan(hariIni.slice(0, 7))}` };
    }
    case "tahun-ini":
      return { dari: `${t}-01-01`, sampai: hariIni, label: `Tahun ${t}` };
    case "kustom": {
      if (!kustom || !YMD.test(kustom.dari) || !YMD.test(kustom.sampai) || kustom.dari > kustom.sampai) return null;
      return { dari: kustom.dari, sampai: kustom.sampai, label: `${kustom.dari} sampai ${kustom.sampai}` };
    }
  }
}

/** Waktu (ms) jatuh di dalam periode, kedua ujung termasuk menurut tanggal Jakarta. */
export function dalamPeriode(ms: number, p: Periode): boolean {
  return ms >= awalHariWib(p.dari) && ms < awalHariWib(p.sampai) + HARI_MS;
}

const waktuMs = (iso: string) => Date.parse(iso);

/** Kapan kontrak masuk: tanggal diajukan, atau tanggal dibuat bila belum terisi. */
export function waktuMasuk(k: KontrakDasar): number {
  const a = Date.parse(k.tanggalDiajukan ?? k.dibuat);
  return Number.isNaN(a) ? Date.parse(k.dibuat) : a;
}

// --- Statistik -------------------------------------------------------------------------------

const urut = (a: readonly number[]) => [...a].sort((x, y) => x - y);

export function median(a: readonly number[]): number {
  if (a.length === 0) return NaN;
  const s = urut(a);
  const t = s.length >> 1;
  return s.length % 2 ? s[t]! : (s[t - 1]! + s[t]!) / 2;
}

/** Persentil dengan peringkat terdekat: "90% kontrak selesai dalam angka ini atau lebih cepat". */
export function persentil(a: readonly number[], p: number): number {
  if (a.length === 0) return NaN;
  const s = urut(a);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]!;
}

function statistikDari(kalender: number[], kerja: number[]): HasilDurasi {
  const sampel = kalender.length;
  if (sampel < MIN_SAMPEL) return { sampel, statistik: null };
  return {
    sampel,
    statistik: {
      sampel,
      kalender: { median: median(kalender), p90: persentil(kalender, 0.9) },
      kerja: { median: median(kerja), p90: persentil(kerja, 0.9) },
    },
  };
}

// --- Interval tahap ------------------------------------------------------------------------------

/**
 * Susun interval tahap dari riwayat status. Bila `kontrak` diberikan, tahap Diajukan dimulai dari tanggal
 * diajukan. Event yang tidak nyambung (tahap asal tidak sama dengan tahap sebelumnya, misalnya ada baris
 * riwayat yang hilang) tidak menghasilkan interval, supaya durasinya tidak salah dikaitkan.
 */
export function bangunInterval(event: readonly EventStatus[], kontrak: readonly KontrakDasar[] = []): Interval[] {
  const perKontrak = new Map<number, EventStatus[]>();
  for (const e of event) {
    const d = perKontrak.get(e.kontrakId);
    if (d) d.push(e);
    else perKontrak.set(e.kontrakId, [e]);
  }
  const awalDiajukan = new Map<number, number>();
  for (const k of kontrak) {
    const t = waktuMasuk(k);
    if (!Number.isNaN(t)) awalDiajukan.set(k.id, t);
  }

  const hasil: Interval[] = [];
  for (const [kontrakId, daftar] of perKontrak) {
    daftar.sort((a, b) => waktuMs(a.waktu) - waktuMs(b.waktu) || a.id - b.id);
    let tahap: Status | null = null;
    let mulai: number | null = null;
    const awal = awalDiajukan.get(kontrakId);
    if (awal != null) {
      tahap = "Diajukan";
      mulai = awal;
    }
    for (const e of daftar) {
      const t = waktuMs(e.waktu);
      if (Number.isNaN(t) || !adalahStatus(e.statusKe)) continue;
      if (tahap && mulai != null && t >= mulai && (!e.statusDari || e.statusDari === tahap)) {
        hasil.push({ kontrakId, tahap, mulai, selesai: t, ke: e.statusKe });
      }
      tahap = e.statusKe;
      mulai = t;
    }
  }
  return hasil;
}

const selesaiDalam = (iv: Interval, periode?: Periode | null) => !periode || dalamPeriode(iv.selesai, periode);

/** Durasi per tahap kerja, dihitung dari interval yang berakhir di dalam periode. */
export function hitungDurasiTahap(interval: readonly Interval[], periode?: Periode | null): DurasiTahap[] {
  return TAHAP_LAPORAN.map((tahap) => {
    const ada = interval.filter((iv) => iv.tahap === tahap && selesaiDalam(iv, periode));
    return {
      tahap,
      ...statistikDari(
        ada.map((iv) => (iv.selesai - iv.mulai) / HARI_MS),
        ada.map((iv) => hariKerjaAntara(iv.mulai, iv.selesai)),
      ),
    };
  });
}

/** Waktu Legal dipisah dari waktu pengaju, dijumlahkan per kontrak lalu diringkas. */
export function hitungWaktuLegalPengaju(interval: readonly Interval[], periode?: Periode | null): WaktuLegalPengaju {
  const legal = new Map<number, { kal: number; ker: number }>();
  const pengaju = new Map<number, { kal: number; ker: number }>();
  for (const iv of interval) {
    if (!TAHAP_LAPORAN.includes(iv.tahap) || !selesaiDalam(iv, periode)) continue;
    const sasaran = MENUNGGU_PENGAJU.includes(iv.tahap) ? pengaju : legal;
    const sekarang = sasaran.get(iv.kontrakId) ?? { kal: 0, ker: 0 };
    sekarang.kal += (iv.selesai - iv.mulai) / HARI_MS;
    sekarang.ker += hariKerjaAntara(iv.mulai, iv.selesai);
    sasaran.set(iv.kontrakId, sekarang);
  }
  const ringkas = (m: Map<number, { kal: number; ker: number }>) => statistikDari([...m.values()].map((v) => v.kal), [...m.values()].map((v) => v.ker));
  return { legal: ringkas(legal), pengaju: ringkas(pengaju) };
}

// --- Revisi -----------------------------------------------------------------------------------------

/** Berapa kali tiap kontrak masuk Perlu Revisi. */
export function putaranRevisiPerKontrak(event: readonly EventStatus[]): Map<number, number> {
  const hasil = new Map<number, number>();
  for (const e of event) {
    if (e.statusKe === "Perlu Revisi") hasil.set(e.kontrakId, (hasil.get(e.kontrakId) ?? 0) + 1);
  }
  return hasil;
}

/** Ringkasan putaran revisi untuk sekelompok kontrak (biasanya yang diajukan di periode terpilih). */
export function ringkasRevisi(kontrak: readonly KontrakDasar[], event: readonly EventStatus[]): RingkasRevisi {
  const per = putaranRevisiPerKontrak(event);
  const putaran = kontrak.map((k) => ({ kontrakId: k.id, putaran: per.get(k.id) ?? 0 }));
  const distribusi = [0, 1, 2, 3].map((p) => ({ putaran: p, jumlah: putaran.filter((x) => (p === 3 ? x.putaran >= 3 : x.putaran === p)).length }));
  const total = putaran.reduce((n, x) => n + x.putaran, 0);
  return {
    kontrakDicakup: kontrak.length,
    denganRevisi: putaran.filter((x) => x.putaran > 0).length,
    rataRata: kontrak.length >= MIN_SAMPEL ? total / kontrak.length : null,
    distribusi,
    terbanyak: putaran
      .filter((x) => x.putaran > 0)
      .sort((a, b) => b.putaran - a.putaran || b.kontrakId - a.kontrakId)
      .slice(0, 5),
  };
}

// --- Mengendap -----------------------------------------------------------------------------------------

/** Kontrak yang umur tahapnya sekarang melewati batas SLA, yang paling lewat di atas. */
export function kontrakMengendap(kontrak: readonly Kontrak[], sekarang: number): Mengendap[] {
  const hasil: Mengendap[] = [];
  for (const k of kontrak) {
    if (!STATUS_PROSES.includes(k.status)) continue;
    const batas = SLA_HARI[k.status];
    const umur = umurTahapHari(k, sekarang);
    if (batas == null || umur == null || umur <= batas) continue;
    hasil.push({ kontrak: k, umurHari: umur, batasHari: batas, lewatHari: umur - batas, menunggu: MENUNGGU_PENGAJU.includes(k.status) ? "Pengaju" : "Legal" });
  }
  return hasil.sort((a, b) => b.lewatHari - a.lewatHari || a.kontrak.id - b.kontrak.id);
}

// --- Deret bulanan dan siklus ------------------------------------------------------------------------------

/** Event pertama tiap kontrak yang berarti sudah ada hasil (Aktif, Ditolak, atau Dibatalkan). */
function eventHasilPertama(event: readonly EventStatus[]): Map<number, { waktu: number; ke: string }> {
  const hasil = new Map<number, { waktu: number; ke: string }>();
  for (const e of event) {
    if (!STATUS_HASIL.includes(e.statusKe)) continue;
    const t = waktuMs(e.waktu);
    if (Number.isNaN(t)) continue;
    const ada = hasil.get(e.kontrakId);
    if (!ada || t < ada.waktu) hasil.set(e.kontrakId, { waktu: t, ke: e.statusKe });
  }
  return hasil;
}

export function deretBulanan(kontrak: readonly KontrakDasar[], event: readonly EventStatus[], periode: Periode): TitikBulan[] {
  const kunci: string[] = [];
  let [t, b] = periode.dari.split("-").map(Number) as [number, number];
  const [tAkhir, bAkhir] = periode.sampai.split("-").map(Number) as [number, number];
  while (t < tAkhir || (t === tAkhir && b <= bAkhir)) {
    kunci.push(`${t}-${String(b).padStart(2, "0")}`);
    if (++b > 12) {
      b = 1;
      t++;
    }
  }
  const titik = new Map<string, TitikBulan>(kunci.slice(-MAKS_BULAN_GRAFIK).map((k) => [k, { kunci: k, label: labelBulan(k), diajukan: 0, selesai: 0 }]));
  for (const k of kontrak) {
    const ms = waktuMasuk(k);
    if (Number.isNaN(ms) || !dalamPeriode(ms, periode)) continue;
    const p = titik.get(kunciBulan(ms));
    if (p) p.diajukan++;
  }
  const dikenal = new Set(kontrak.map((k) => k.id));
  for (const [id, h] of eventHasilPertama(event)) {
    if (!dikenal.has(id) || !dalamPeriode(h.waktu, periode)) continue;
    const p = titik.get(kunciBulan(h.waktu));
    if (p) p.selesai++;
  }
  return [...titik.values()];
}

/** Dari diajukan sampai berlaku, untuk kontrak yang berlakunya jatuh di periode. Ditolak dan dibatalkan tidak ikut. */
export function hitungSiklusTotal(kontrak: readonly KontrakDasar[], event: readonly EventStatus[], periode?: Periode | null): HasilDurasi {
  const awal = new Map(kontrak.map((k) => [k.id, waktuMasuk(k)]));
  const kal: number[] = [];
  const ker: number[] = [];
  for (const [id, h] of eventHasilPertama(event)) {
    const mulai = awal.get(id);
    if (h.ke !== "Aktif" || mulai == null || Number.isNaN(mulai) || h.waktu < mulai) continue;
    if (periode && !dalamPeriode(h.waktu, periode)) continue;
    kal.push((h.waktu - mulai) / HARI_MS);
    ker.push(hariKerjaAntara(mulai, h.waktu));
  }
  return statistikDari(kal, ker);
}

// --- Susun laporan ---------------------------------------------------------------------------------------------

export function susunLaporan(kontrak: readonly Kontrak[], event: readonly EventStatus[], periode: Periode, sekarang: number): Laporan {
  const interval = bangunInterval(event, kontrak);
  const masuk = kontrak.filter((k) => dalamPeriode(waktuMasuk(k), periode));
  const hasil = eventHasilPertama(event);
  const dikenal = new Set(kontrak.map((k) => k.id));
  const selesai = [...hasil].filter(([id, h]) => dikenal.has(id) && dalamPeriode(h.waktu, periode)).length;
  const sampelTahap = interval.filter((iv) => TAHAP_LAPORAN.includes(iv.tahap) && dalamPeriode(iv.selesai, periode)).length;
  return {
    periode,
    kontrakMasuk: masuk.length,
    kontrakSelesai: selesai,
    tahap: hitungDurasiTahap(interval, periode),
    siklus: hitungSiklusTotal(kontrak, event, periode),
    legalVsPengaju: hitungWaktuLegalPengaju(interval, periode),
    revisi: ringkasRevisi(masuk, event),
    mengendap: kontrakMengendap(kontrak, sekarang),
    bulanan: deretBulanan(kontrak, event, periode),
    sampelTahap,
    dataTipis: sampelTahap < DATA_TIPIS_DI_BAWAH,
  };
}
