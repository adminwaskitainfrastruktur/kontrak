// Kabar "Untuk Anda" di lonceng Ruang Admin (Legal dan Admin), dihitung di browser tanpa server.
//
// Sumbernya dua:
// 1. Daftar kontrak dibandingkan dengan jejak terakhir yang pernah dilihat (localStorage per akun):
//    pengajuan baru di antrean, kontrak yang ditugaskan ke saya atau dialihkan dari saya, dan
//    perubahan status kontrak yang saya pegang (PIC).
// 2. Umpan aktivitas terbaru (list Aktivitas, bila kueri Created bisa dipakai): komentar, sebutan
//    @saya, dokumen baru, dan pengingat pada kontrak yang saya pegang.
// Perubahan oleh diri sendiri disaring: aktivitas dengan OlehEmail = saya, dan perubahan kontrak
// yang punya aktivitas saya sejak pemeriksaan terakhir. Bila umpan aktivitas tidak tersedia,
// penyegaran yang dipicu aksi tulis di tab ini dianggap perubahan sendiri (tulisSendiri).
import { bisaLihat } from "./alur";
import { STATUS_PROSES, type JenisAktivitas, type Kontrak, type Sesi, type Status } from "./types";
import type { JenisKabar, Kabar, NadaKabar } from "./kabar";

export interface JejakAdmin {
  status: Status;
  /** Email PIC Legal (huruf kecil), kosong bila belum ada. */
  pic: string;
}

export interface SimpananAdmin {
  /** Kapan jejak terakhir diambil (ISO). */
  waktu: string;
  jejak: Record<string, JejakAdmin>;
  kabar: Kabar[];
  /** ID aktivitas terbesar yang sudah diperiksa; ID item SharePoint selalu naik. */
  aktivitasId: number | null;
  /** Waktu pemeriksaan aktivitas terakhir (ISO), batas bawah kueri berikutnya. */
  aktivitasSejak: string | null;
}

/** Aktivitas seperlunya untuk kabar (tanpa Detail). */
export interface AktivitasRingkas {
  id: number;
  kontrakId: number;
  jenis: JenisAktivitas;
  pesan: string;
  olehEmail: string;
  olehNama: string;
  waktu: string;
  disebut: string[];
}

export const MAKS_KABAR_ADMIN = 30;
/** Selisih jam perangkat dan server yang masih ditoleransi saat menilai "pengajuan baru". */
const TOLERANSI_MS = 5 * 60_000;

const kunci = (email: string) => `kontrak-untuk-anda:${email}`;
/** Kunci localStorage, untuk menyelaraskan tab lain lewat event "storage". */
export const kunciSimpananAdmin = kunci;

export function bacaSimpananAdmin(email: string): SimpananAdmin | null {
  try {
    const teks = localStorage.getItem(kunci(email));
    return teks ? (JSON.parse(teks) as SimpananAdmin) : null;
  } catch {
    return null;
  }
}

export function tulisSimpananAdmin(email: string, s: SimpananAdmin) {
  try {
    localStorage.setItem(kunci(email), JSON.stringify(s));
  } catch {
    /* penyimpanan penuh atau diblokir: kabar tetap tampil, hanya tidak diingat */
  }
}

const picDari = (k: Kontrak) => k.picLegalEmail.trim().toLowerCase();

/** Jejak hanya untuk kontrak yang masih diproses atau dipegang saya, supaya simpanan tetap kecil. */
export function buatJejakAdmin(kontrak: readonly Kontrak[], sesi: Sesi): Record<string, JejakAdmin> {
  const saya = sesi.email.toLowerCase();
  const hasil: Record<string, JejakAdmin> = {};
  for (const k of kontrak) {
    const pic = picDari(k);
    if (STATUS_PROSES.includes(k.status) || pic === saya) hasil[String(k.id)] = { status: k.status, pic };
  }
  return hasil;
}

function teksStatus(k: Kontrak, dari: Status): { teks: string; nada: NadaKabar } {
  if (k.status === "Review Legal" && dari === "Perlu Revisi") return { teks: "Pengaju mengirim ulang revisi. Kembali ke Review Legal.", nada: "peringatan" };
  if (k.status === "Dibatalkan") return { teks: "Pengajuan dibatalkan oleh pengaju.", nada: "bahaya" };
  if (k.status === "Aktif") return { teks: "Kontrak sudah aktif.", nada: "sukses" };
  if (k.status === "Ditolak") return { teks: "Pengajuan ditolak.", nada: "bahaya" };
  if (k.status === "Berakhir") return { teks: "Kontrak ditandai berakhir.", nada: "info" };
  return { teks: `Status berubah dari ${dari} ke ${k.status}.`, nada: "info" };
}

function potong(t: string, maks = 110): string {
  const satu = t.replace(/\s+/g, " ").trim();
  return satu.length > maks ? `${satu.slice(0, maks - 1).trimEnd()}…` : satu;
}

/**
 * Kabar baru sejak simpanan terakhir. Kunjungan pertama (belum ada simpanan) tidak menghasilkan
 * kabar supaya tidak membanjiri. `aktivitas` = null berarti umpan aktivitas tidak tersedia.
 */
export function bandingkanAdmin(
  lama: SimpananAdmin | null,
  kontrak: readonly Kontrak[],
  sesi: Sesi,
  o: { waktu: string; aktivitas: readonly AktivitasRingkas[] | null; tulisSendiri?: boolean },
): Kabar[] {
  if (!lama) return [];
  const saya = sesi.email.toLowerCase();
  const terlihat = kontrak.filter((k) => bisaLihat(k, sesi));
  const perId = new Map(terlihat.map((k) => [k.id, k]));
  const hasil: Kabar[] = [];
  const tambah = (k: Kontrak, jenis: JenisKabar, teks: string, nada: NadaKabar, waktu: string, kunciUnik: string) =>
    hasil.push({ id: `${k.id}-${jenis}-${kunciUnik}`, kontrakId: k.id, judul: k.judul, nomor: k.nomorPengajuan, teks, nada, waktu, dibaca: false, jenis });

  // Kontrak yang punya aktivitas saya sejak pemeriksaan terakhir: perubahannya dianggap buatan sendiri.
  const aktivitasBaru = (o.aktivitas ?? []).filter((a) => lama.aktivitasId == null || a.id > lama.aktivitasId);
  const disentuhSaya = new Set(aktivitasBaru.filter((a) => a.olehEmail.toLowerCase() === saya).map((a) => a.kontrakId));
  const olehSaya = (id: number) => (o.aktivitas ? disentuhSaya.has(id) : Boolean(o.tulisSendiri));
  const batasBaru = Date.parse(lama.waktu) - TOLERANSI_MS;

  for (const k of terlihat) {
    const dulu = lama.jejak[String(k.id)];
    const pic = picDari(k);
    const kunciWaktu = o.waktu;
    if (!dulu) {
      const baru = k.status === "Diajukan" && Date.parse(k.tanggalDiajukan ?? k.dibuat) >= batasBaru && k.pengajuEmail.toLowerCase() !== saya;
      if (baru && pic === saya) tambah(k, "tugas", `Pengajuan baru dari ${k.pengajuNama || "pengaju"} (${k.divisi}), langsung ditugaskan kepada Anda.`, "peringatan", o.waktu, kunciWaktu);
      else if (baru && !pic) tambah(k, "baru", `Pengajuan baru dari ${k.pengajuNama || "pengaju"} (${k.divisi}) masuk antrean.`, "info", o.waktu, kunciWaktu);
      else if (!baru && pic === saya && STATUS_PROSES.includes(k.status) && !olehSaya(k.id)) tambah(k, "tugas", `Ditugaskan kepada Anda (tahap ${k.status}).`, "peringatan", o.waktu, kunciWaktu);
      continue;
    }
    if (olehSaya(k.id)) continue;
    if (dulu.pic !== pic) {
      if (pic === saya) tambah(k, "tugas", `Ditugaskan kepada Anda (tahap ${k.status}).`, "peringatan", o.waktu, kunciWaktu);
      else if (dulu.pic === saya) tambah(k, "alih", pic ? `Dialihkan dari Anda ke ${k.picLegalNama || pic}.` : "Anda tidak lagi menjadi PIC kontrak ini.", "info", o.waktu, kunciWaktu);
    }
    if (dulu.status !== k.status && pic === saya) {
      const s = teksStatus(k, dulu.status);
      tambah(k, "status", s.teks, s.nada, o.waktu, `${k.status}-${kunciWaktu}`);
    }
  }

  for (const a of aktivitasBaru) {
    if (a.olehEmail.toLowerCase() === saya) continue;
    const k = perId.get(a.kontrakId);
    if (!k) continue;
    const pegang = picDari(k) === saya;
    const disebut = a.disebut.includes(saya);
    const oleh = a.olehNama || a.olehEmail || "Seseorang";
    const kunciA = `a${a.id}`;
    if (a.jenis === "Komentar" && disebut) tambah(k, "sebut", `${oleh} menyebut Anda: “${potong(a.pesan)}”`, "peringatan", a.waktu, kunciA);
    else if (a.jenis === "Komentar" && pegang) tambah(k, "komentar", `${oleh} berkomentar: “${potong(a.pesan)}”`, "info", a.waktu, kunciA);
    else if (a.jenis === "Dokumen" && pegang) tambah(k, "dokumen", `${oleh}: ${potong(a.pesan)}`, "info", a.waktu, kunciA);
    else if (a.jenis === "Pengingat" && (disebut || pegang)) tambah(k, "pengingat", `Pengingat dari ${oleh}: ${potong(a.pesan)}`, "peringatan", a.waktu, kunciA);
  }

  return hasil.sort((x, y) => y.waktu.localeCompare(x.waktu));
}

/** Gabungkan kabar baru ke daftar lama (tanpa duplikat id), terbaru lebih dulu, dibatasi jumlahnya. */
export function gabungKabar(baru: readonly Kabar[], lama: readonly Kabar[], maks = MAKS_KABAR_ADMIN): Kabar[] {
  const ada = new Set<string>();
  const hasil: Kabar[] = [];
  for (const k of [...baru, ...lama].sort((x, y) => y.waktu.localeCompare(x.waktu))) {
    if (ada.has(k.id)) continue;
    ada.add(k.id);
    hasil.push(k);
  }
  return hasil.slice(0, maks);
}

/** ID aktivitas terbesar yang pernah diperiksa, setelah memperhitungkan umpan terbaru. */
export function aktivitasIdTerakhir(lama: number | null, aktivitas: readonly AktivitasRingkas[] | null): number | null {
  if (!aktivitas?.length) return lama;
  return Math.max(lama ?? 0, ...aktivitas.map((a) => a.id));
}
