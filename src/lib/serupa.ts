// "Ajukan serupa" (U09): membuat pengajuan baru dengan data awal dari kontrak sebelumnya.
//
// Yang disalin sengaja sedikit, supaya pengajuan baru tidak membawa data basi:
//   - jenis, mitra (nama dan tautan master), mata uang, dan MoU acuan bila MoU itu masih Aktif;
//   - divisi diambil dari sesi pengaju sekarang, bukan dari kontrak lama (akun tanpa divisi tetap ditanya);
//   - prioritas TIDAK disalin (kembali Normal): urgensi kontrak lama bukan urgensi kontrak baru;
//   - deskripsi dan kode proyek diisi sebagai bahan, tetapi langkahnya tetap ditanyakan supaya pengaju
//     meninjaunya (nomor PR/PO/SPK tidak disalin: tiap kontrak punya referensinya sendiri);
//   - judul lama hanya menjadi usulan (tahun di dalamnya diperbarui), langkah judul tetap ditanyakan.
// Nilai, tanggal, target, nomor, PIC, dan dokumen tidak pernah disalin. Addendum tidak bisa disalin:
// addendum selalu diajukan dari kontrak induknya.
import { adalahAddendum } from "./addendum";
import { bisaAjukan, bisaLihat } from "./alur";
import { DIVISI_PENGAJU, JENIS_ADDENDUM, JENIS_MOU, type DivisiPengaju, type JenisKontrak, type Kontrak, type KontrakInput, type Sesi } from "./types";

/** Parameter URL untuk halaman pengajuan: /kontrak/baru?salin=12 atau /saya/ajukan?salin=12. */
export const PARAM_SALIN = "salin";

/** Data awal pengajuan serupa. Kolom lain dibiarkan pada nilai bawaan halaman pengajuan. */
export type DataAwalSerupa = Pick<KontrakInput, "jenis" | "mitra" | "mitraId" | "mataUang" | "mouAcuanId" | "divisi" | "salinDari" | "deskripsi" | "prioritas" | "kodeProyek">;

export interface HasilSerupa {
  data: DataAwalSerupa;
  /** Usulan judul (judul lama dengan tahun diperbarui). Langkah judul tetap ditanyakan. */
  usulanJudul: string;
  /** Langkah chat yang boleh dianggap terjawab. Judul, proyek, dan deskripsi sengaja tidak termasuk. */
  terjawab: ("jenis" | "mitra" | "divisi" | "acuan")[];
  /** Penjelasan singkat untuk pengaju tentang apa yang disalin dan apa yang tidak. */
  catatan: string[];
  sumber: { id: number; nomor: string; judul: string };
}

/** Tombol "Ajukan serupa" hanya untuk kontrak non-addendum yang boleh dilihat, oleh peran yang boleh mengajukan. */
export function bisaAjukanSerupa(k: Kontrak, sesi: Sesi): boolean {
  return k.jenis !== JENIS_ADDENDUM && !adalahAddendum(k) && bisaAjukan(sesi) && bisaLihat(k, sesi);
}

/** Baca ?salin= dari URL. null bila kosong atau bukan bilangan bulat positif. */
export function bacaParamSalin(params: URLSearchParams): number | null {
  const n = Number(params.get(PARAM_SALIN));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Ganti tahun lama di judul (2020-2099) dengan tahun berjalan, mis. "Sewa Crane 2025" menjadi "Sewa Crane 2026". */
export function usulanJudulSerupa(judul: string, tahun: number = new Date().getFullYear()): string {
  const t = judul.trim();
  return t.replace(/\b(20\d{2})\b/g, (m) => (Number(m) < tahun ? String(tahun) : m));
}

/** Divisi sesi bila termasuk divisi pengaju; akun tanpa divisi (masuk otomatis) memakai `cadangan`. */
function divisiDariSesi(sesi: Sesi, cadangan: DivisiPengaju): DivisiPengaju {
  return sesi.divisi != null && (DIVISI_PENGAJU as readonly string[]).includes(sesi.divisi) ? (sesi.divisi as DivisiPengaju) : cadangan;
}

/**
 * Data awal pengajuan baru dari kontrak `k`. `semua` dipakai untuk memeriksa apakah MoU acuan masih
 * Aktif. Mengembalikan null bila kontrak tidak boleh disalin (addendum atau tidak terlihat oleh sesi).
 */
export function dariKontrak(k: Kontrak, opsi: { semua: readonly Kontrak[]; sesi: Sesi; tahun?: number }): HasilSerupa | null {
  const { semua, sesi } = opsi;
  if (!bisaAjukanSerupa(k, sesi)) return null;

  const jenis: JenisKontrak = k.jenis;
  const catatan: string[] = [];
  let mouAcuanId: number | null = null;
  if (k.mouAcuanId != null && jenis !== JENIS_MOU) {
    const mou = semua.find((x) => x.id === k.mouAcuanId);
    if (mou && mou.jenis === JENIS_MOU && mou.status === "Aktif" && bisaLihat(mou, sesi)) mouAcuanId = mou.id;
    else catatan.push("MoU acuan kontrak lama sudah tidak berlaku, jadi tidak ikut disalin.");
  }

  const divisi = divisiDariSesi(sesi, k.divisi);
  // Akun tanpa divisi tetap ditanya divisinya; divisi kontrak lama hanya menjadi pilihan awal.
  const terjawab: HasilSerupa["terjawab"] = sesi.divisi == null ? ["jenis"] : ["jenis", "divisi"];
  if (k.mitra.trim()) terjawab.push("mitra");
  if (mouAcuanId != null) terjawab.push("acuan");

  catatan.unshift("Jenis, mitra, dan mata uang sudah disalin. Nilai, tanggal, prioritas, dan dokumen diisi baru.");
  if (k.deskripsi.trim()) catatan.push("Deskripsi lama sudah diisikan sebagai bahan; mohon disesuaikan.");

  return {
    data: {
      jenis,
      mitra: k.mitra,
      mitraId: k.mitraId,
      mataUang: k.mataUang,
      mouAcuanId,
      divisi,
      salinDari: k.id,
      deskripsi: k.deskripsi,
      prioritas: "Normal",
      kodeProyek: (k.kodeProyek ?? "").trim(),
    },
    usulanJudul: usulanJudulSerupa(k.judul, opsi.tahun),
    terjawab,
    catatan,
    sumber: { id: k.id, nomor: k.nomorPengajuan, judul: k.judul },
  };
}

/** Pesan aktivitas di kontrak baru, mis. "Disalin dari KTR-2026-0012 (Sewa Crane 2025)." */
export function pesanDisalinDari(sumber: Pick<Kontrak, "nomorPengajuan" | "judul">): string {
  const nomor = sumber.nomorPengajuan || "kontrak sebelumnya";
  return sumber.judul.trim() ? `Disalin dari ${nomor} (${sumber.judul.trim()}).` : `Disalin dari ${nomor}.`;
}

/** Kalimat pembuka chat saat pengajuan dimulai dari "Ajukan serupa". */
export function sapaanSerupa(h: HasilSerupa): string {
  return `Kita mulai dari ${h.sumber.nomor} ya. Jenis, mitra, dan mata uangnya sudah saya isikan; tinggal judul, nilai, dan tanggal yang baru.`;
}
