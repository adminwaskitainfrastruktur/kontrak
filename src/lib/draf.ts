// Draf pengajuan yang belum dikirim (U08), untuk chat dan formulir.
//
// Prinsip:
//   - Yang disimpan hanya metadata isian. Lampiran TIDAK pernah disimpan isinya, hanya namanya, supaya
//     dokumen rahasia tidak tertinggal di PC bersama. Saat draf dilanjutkan, pengaju diingatkan untuk
//     melampirkan ulang.
//   - Satu draf per (email, ruang, sumber). Kunci memuat email supaya akun lain di PC yang sama tidak
//     melihat draf orang lain.
//   - Kedaluwarsa 7 hari, dihapus saat keluar akun, dan dihapus segera setelah buatKontrak berhasil.
//   - Tidak ada status "Draf" di SharePoint: draf hanya hidup di peramban ini.
//
// Bagian atas modul ini murni (bisa diuji di Node). Bagian bawah menyentuh localStorage, selalu dalam
// try/catch karena localStorage bisa dimatikan, penuh, atau tidak ada (mode privat, kebijakan peramban).
import { adalahAddendum } from "./addendum";
import { bisaLihat } from "./alur";
import { JENIS_ADDENDUM, JENIS_MOU, type JenisKontrak, type Kontrak, type Sesi } from "./types";
import { adalahPayung } from "./plafon";

export const AWALAN_DRAF = "kontrak-draf";
export const VERSI_DRAF = 1;
export const TTL_DRAF_MS = 7 * 86_400_000;
export const JEDA_SIMPAN_MS = 800;

export type SumberDraf = "chat" | "formulir";
export type RuangDraf = "admin" | "pengguna";

/** Isi draf yang tersimpan. `data` sudah dibersihkan dari berkas dan nilai yang tidak bisa jadi JSON. */
export interface Draf<T> {
  versi: number;
  sumber: SumberDraf;
  /** ISO, kapan terakhir disimpan. */
  disimpan: string;
  /**
   * Asal halaman pengajuan, mis. "induk:12", "mou:4", "salin:9", atau "" untuk pengajuan biasa.
   * Draf addendum tidak ditawarkan di halaman pengajuan kontrak biasa, dan sebaliknya.
   */
  konteks: string;
  data: T;
  /** Langkah chat yang sudah terjawab (kosong untuk formulir). */
  terjawab: string[];
  /** Nama lampiran yang pernah dipilih. Isinya tidak disimpan: harus dilampirkan ulang. */
  berkas: string[];
}

// --- Murni ---------------------------------------------------------------------------

/** Kunci localStorage: kontrak-draf:v1:<ruang>:<sumber>:<email>. */
export function kunciDraf(email: string, ruang: RuangDraf, sumber: SumberDraf): string {
  return `${AWALAN_DRAF}:v${VERSI_DRAF}:${ruang}:${sumber}:${email.trim().toLowerCase()}`;
}

/** Konteks halaman pengajuan dari parameter URL (?induk, ?mou, ?salin). */
export function konteksDraf(p: { induk?: number | null; mou?: number | null; salin?: number | null }): string {
  if (p.induk) return `induk:${p.induk}`;
  if (p.mou) return `mou:${p.mou}`;
  if (p.salin) return `salin:${p.salin}`;
  return "";
}

interface MiripBerkas {
  name: string;
  size: number;
}

function miripBerkas(v: unknown): v is MiripBerkas {
  if (typeof v !== "object" || v === null) return false;
  if (typeof Blob !== "undefined" && v instanceof Blob) return true;
  const o = v as Record<string, unknown>;
  return typeof o.name === "string" && typeof o.size === "number" && typeof o.arrayBuffer === "function";
}

/**
 * Salinan data yang aman disimpan: berkas (File/Blob) dibuang dan namanya dikumpulkan, Set menjadi
 * array, fungsi dan nilai aneh dibuang. Objek bersarang ikut dibersihkan.
 */
export function bersihkanData<T>(data: T): { data: T; berkas: string[] } {
  const berkas: string[] = [];
  const bersih = (v: unknown, kedalaman: number): unknown => {
    if (v === null || typeof v === "string" || typeof v === "boolean") return v;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (miripBerkas(v)) {
      if ("name" in v && typeof v.name === "string" && v.name) berkas.push(v.name);
      return undefined;
    }
    if (kedalaman > 6) return undefined;
    if (v instanceof Set) return bersih([...v], kedalaman + 1);
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
    if (Array.isArray(v)) return v.map((x) => bersih(x, kedalaman + 1)).filter((x) => x !== undefined);
    if (typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const b = bersih(x, kedalaman + 1);
        if (b !== undefined) o[k] = b;
      }
      return o;
    }
    return undefined;
  };
  return { data: bersih(data, 0) as T, berkas: unik(berkas) };
}

function unik(daftar: string[]): string[] {
  return [...new Set(daftar.map((x) => x.trim()).filter(Boolean))];
}

/** Susun draf siap simpan. Nama berkas dari `berkas` digabung dengan berkas yang ditemukan di dalam `data`. */
export function bungkusDraf<T>(
  isi: { sumber: SumberDraf; data: T; terjawab?: Iterable<string>; berkas?: readonly (string | MiripBerkas)[]; konteks?: string },
  sekarang: number = Date.now(),
): Draf<T> {
  const { data, berkas } = bersihkanData(isi.data);
  const dariLuar = (isi.berkas ?? []).map((b) => (typeof b === "string" ? b : b.name));
  return {
    versi: VERSI_DRAF,
    sumber: isi.sumber,
    disimpan: new Date(sekarang).toISOString(),
    konteks: isi.konteks ?? "",
    data,
    terjawab: unik([...(isi.terjawab ?? [])]),
    berkas: unik([...dariLuar, ...berkas]),
  };
}

/** Draf yang layak disimpan: ada langkah terjawab atau ada isian teks utama. Draf kosong tidak disimpan. */
export function drafBermakna(data: unknown, terjawab: Iterable<string> = []): boolean {
  if ([...terjawab].length > 0) return true;
  if (typeof data !== "object" || data === null) return false;
  const o = data as Record<string, unknown>;
  return ["judul", "mitra", "deskripsi", "nilai"].some((k) => (typeof o[k] === "string" ? (o[k] as string).trim() !== "" : typeof o[k] === "number"));
}

export function kedaluwarsa(d: Pick<Draf<unknown>, "disimpan">, sekarang: number = Date.now(), ttl: number = TTL_DRAF_MS): boolean {
  const t = Date.parse(d.disimpan);
  return !Number.isFinite(t) || sekarang - t > ttl || t - sekarang > 60_000;
}

/** Urai teks dari localStorage. null bila rusak, versi lain, atau kedaluwarsa. */
export function uraiDraf<T>(teks: string | null, sekarang: number = Date.now(), ttl: number = TTL_DRAF_MS): Draf<T> | null {
  if (!teks) return null;
  let j: unknown;
  try {
    j = JSON.parse(teks);
  } catch {
    return null;
  }
  if (typeof j !== "object" || j === null) return null;
  const d = j as Partial<Draf<T>>;
  if (d.versi !== VERSI_DRAF) return null;
  if (d.sumber !== "chat" && d.sumber !== "formulir") return null;
  if (typeof d.disimpan !== "string" || typeof d.data !== "object" || d.data === null) return null;
  const draf: Draf<T> = {
    versi: d.versi,
    sumber: d.sumber,
    disimpan: d.disimpan,
    konteks: typeof d.konteks === "string" ? d.konteks : "",
    data: d.data as T,
    terjawab: Array.isArray(d.terjawab) ? d.terjawab.filter((x): x is string => typeof x === "string") : [],
    berkas: Array.isArray(d.berkas) ? d.berkas.filter((x): x is string => typeof x === "string") : [],
  };
  return kedaluwarsa(draf, sekarang, ttl) ? null : draf;
}

/** Draf hanya ditawarkan di halaman dengan konteks yang sama (addendum ke induk yang sama, dst.). */
export function drafCocok(d: Pick<Draf<unknown>, "konteks">, konteks: string): boolean {
  return d.konteks === konteks;
}

/** "baru saja", "5 menit lalu", "2 jam lalu", "kemarin", "3 hari lalu". */
export function teksUmurDraf(disimpan: string, sekarang: number = Date.now()): string {
  const menit = Math.max(0, Math.floor((sekarang - Date.parse(disimpan)) / 60_000));
  if (!Number.isFinite(menit) || menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  return hari === 1 ? "kemarin" : `${hari} hari lalu`;
}

/** Kalimat pengingat lampiran, kosong bila draf tidak punya lampiran. */
export function teksLampirkanUlang(berkas: readonly string[]): string {
  if (berkas.length === 0) return "";
  if (berkas.length === 1) return `Lampirkan ulang “${berkas[0]}”: isi berkas tidak ikut tersimpan di draf.`;
  const tampil = berkas.slice(0, 3).map((b) => `“${b}”`).join(", ");
  const sisa = berkas.length > 3 ? ` dan ${berkas.length - 3} lainnya` : "";
  return `Lampirkan ulang ${berkas.length} berkas (${tampil}${sisa}): isi berkas tidak ikut tersimpan di draf.`;
}

/** Bagian data yang bergantung pada kontrak lain dan perlu dicek ulang saat draf dilanjutkan. */
export interface DataTautan {
  jenis: JenisKontrak;
  kontrakIndukId: number | null;
  mouAcuanId: number | null;
}

export interface HasilValidasiDraf<T> {
  data: T;
  /** Langkah chat yang harus ditanyakan ulang karena tautannya dilepas. */
  tanyaUlang: ("induk" | "acuan")[];
  /** Penjelasan untuk pengguna, satu kalimat per tautan yang dilepas. */
  catatan: string[];
}

/**
 * Cek ulang kontrak induk dan MoU acuan saat draf dilanjutkan. Sejak draf disimpan, induk bisa saja
 * sudah berakhir dan MoU bisa sudah tidak berlaku, atau pengguna tidak lagi berhak melihatnya.
 */
export function validasiUlangDraf<T extends DataTautan>(data: T, semua: readonly Kontrak[], sesi: Sesi): HasilValidasiDraf<T> {
  let hasil: T = { ...data };
  const tanyaUlang: ("induk" | "acuan")[] = [];
  const catatan: string[] = [];

  if (hasil.kontrakIndukId != null) {
    const induk = semua.find((k) => k.id === hasil.kontrakIndukId);
    const sah = !!induk && induk.status === "Aktif" && !adalahAddendum(induk) && bisaLihat(induk, sesi);
    if (!sah || hasil.jenis !== JENIS_ADDENDUM) {
      hasil = { ...hasil, kontrakIndukId: null };
      if (hasil.jenis === JENIS_ADDENDUM) {
        tanyaUlang.push("induk");
        catatan.push(induk ? `Kontrak induk ${induk.nomorKontrak || induk.nomorPengajuan} sekarang berstatus ${induk.status}, jadi perlu dipilih ulang.` : "Kontrak induk di draf sudah tidak ditemukan, jadi perlu dipilih ulang.");
      }
    }
  }

  if (hasil.mouAcuanId != null) {
    const mou = semua.find((k) => k.id === hasil.mouAcuanId);
    // Acuan turunan bisa MoU atau kontrak payung berplafon (lib/plafon adalahPayung).
    const sah = !!mou && adalahPayung(mou) && mou.status === "Aktif" && bisaLihat(mou, sesi);
    const bolehAcuan = hasil.jenis !== JENIS_ADDENDUM && hasil.jenis !== JENIS_MOU;
    if (!sah || !bolehAcuan) {
      hasil = { ...hasil, mouAcuanId: null };
      if (bolehAcuan) {
        tanyaUlang.push("acuan");
        catatan.push(mou ? `MoU acuan “${mou.judul}” sudah tidak berlaku (${mou.status}), tautannya dilepas.` : "MoU acuan di draf sudah tidak ditemukan, tautannya dilepas.");
      }
    }
  }

  return { data: hasil, tanyaUlang, catatan };
}

// --- localStorage ----------------------------------------------------------------------

function penyimpanan(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Simpan draf. Mengembalikan false bila penyimpanan tidak tersedia atau penuh. */
export function simpanDraf<T>(kunci: string, draf: Draf<T>): boolean {
  try {
    const s = penyimpanan();
    if (!s) return false;
    s.setItem(kunci, JSON.stringify(draf));
    return true;
  } catch {
    return false;
  }
}

/** Baca draf. Draf rusak atau kedaluwarsa langsung dihapus dan dianggap tidak ada. */
export function bacaDraf<T>(kunci: string, sekarang: number = Date.now()): Draf<T> | null {
  try {
    const s = penyimpanan();
    if (!s) return null;
    const teks = s.getItem(kunci);
    const d = uraiDraf<T>(teks, sekarang);
    if (!d && teks != null) s.removeItem(kunci);
    return d;
  } catch {
    return null;
  }
}

export function hapusDraf(kunci: string): void {
  try {
    penyimpanan()?.removeItem(kunci);
  } catch {
    /* penyimpanan tidak tersedia: tidak ada yang perlu dihapus */
  }
}

function semuaKunciDraf(s: Storage): string[] {
  const kunci: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith(`${AWALAN_DRAF}:`)) kunci.push(k);
  }
  return kunci;
}

/** Hapus semua draf milik satu email (dipanggil saat keluar akun). */
export function hapusDrafPengguna(email: string): void {
  try {
    const s = penyimpanan();
    if (!s) return;
    const akhiran = `:${email.trim().toLowerCase()}`;
    for (const k of semuaKunciDraf(s)) if (k.endsWith(akhiran)) s.removeItem(k);
  } catch {
    /* diabaikan */
  }
}

/** Buang draf kedaluwarsa atau rusak milik siapa pun. Aman dipanggil sekali saat aplikasi dibuka. */
export function bersihkanDrafKedaluwarsa(sekarang: number = Date.now()): number {
  let dibuang = 0;
  try {
    const s = penyimpanan();
    if (!s) return 0;
    for (const k of semuaKunciDraf(s)) {
      if (!uraiDraf(s.getItem(k), sekarang)) {
        s.removeItem(k);
        dibuang++;
      }
    }
  } catch {
    /* diabaikan */
  }
  return dibuang;
}

export interface PenyimpanTunda<T> {
  /** Jadwalkan simpan setelah jeda; pemanggilan berikutnya menggeser jadwal. */
  jadwalkan: (draf: Draf<T> | null) => void;
  /** Simpan yang masih tertunda sekarang juga (mis. saat halaman ditutup). */
  segera: () => void;
  /** Batalkan simpan yang tertunda (mis. setelah pengajuan terkirim). */
  batal: () => void;
}

/**
 * Penyimpan dengan debounce. `null` berarti hapus draf (mis. isian dikosongkan). Penyimpan memakai
 * fungsi simpan/hapus yang bisa diganti, supaya perilaku jedanya bisa diuji tanpa localStorage.
 */
export function buatPenyimpanTunda<T>(
  kunci: string,
  jeda: number = JEDA_SIMPAN_MS,
  aksi: { simpan: (k: string, d: Draf<T>) => unknown; hapus: (k: string) => unknown } = { simpan: simpanDraf, hapus: hapusDraf },
): PenyimpanTunda<T> {
  let pewaktu: ReturnType<typeof setTimeout> | null = null;
  let tertunda: { draf: Draf<T> | null } | null = null;
  const tulis = () => {
    pewaktu = null;
    if (!tertunda) return;
    const { draf } = tertunda;
    tertunda = null;
    if (draf) aksi.simpan(kunci, draf);
    else aksi.hapus(kunci);
  };
  return {
    jadwalkan(draf) {
      tertunda = { draf };
      if (pewaktu) clearTimeout(pewaktu);
      pewaktu = setTimeout(tulis, jeda);
    },
    segera() {
      if (pewaktu) clearTimeout(pewaktu);
      tulis();
    },
    batal() {
      if (pewaktu) clearTimeout(pewaktu);
      pewaktu = null;
      tertunda = null;
    },
  };
}
