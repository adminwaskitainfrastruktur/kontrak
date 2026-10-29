// Aturan coba ulang permintaan Microsoft Graph yang aman, dipakai graph().
//
// - 429 (terlalu banyak permintaan): boleh diulang untuk semua metode, karena permintaan ditolak
//   sebelum diproses.
// - 503/504 (layanan sibuk / gerbang kehabisan waktu): hanya GET, PATCH, DELETE. POST tidak,
//   karena server bisa saja sudah membuat item sebelum gerbang menyerah; mengulang bisa menggandakan
//   kontrak, komentar, atau email.
// - Maksimal 3 kali. Jeda mengikuti header Retry-After bila ada (detik atau tanggal HTTP); bila
//   server meminta menunggu lebih lama dari batas, permintaan tidak diulang dan galatnya ditampilkan
//   supaya tab tidak tampak menggantung.

export const MAKS_COBA_ULANG = 3;
/** Jeda terlama yang mau ditunggu tanpa memberi tahu pengguna. */
export const JEDA_MAKS_MS = 30_000;
const JEDA_DASAR_MS = 1_000;

const METODE_AMAN_SIBUK = new Set(["GET", "HEAD", "PATCH", "DELETE"]);

/** Nilai header Retry-After dalam milidetik, atau null bila kosong/tidak terbaca. */
export function bacaRetryAfter(nilai: string | null | undefined, sekarang: number = Date.now()): number | null {
  if (!nilai) return null;
  const t = nilai.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 1000);
  const waktu = Date.parse(t);
  if (Number.isNaN(waktu)) return null;
  return Math.max(0, waktu - sekarang);
}

export function bolehCobaUlang(metode: string, status: number): boolean {
  if (status === 429) return true;
  if (status === 503 || status === 504) return METODE_AMAN_SIBUK.has(metode.toUpperCase());
  return false;
}

/**
 * Jeda (ms) sebelum mengulang, atau null bila tidak boleh/tidak perlu diulang.
 * `percobaan` = berapa kali permintaan ini sudah diulang (0 untuk kegagalan pertama).
 * Tanpa Retry-After, jeda naik berlipat: 1 detik, 2 detik, 4 detik.
 */
export function jedaCobaUlang(o: { metode: string; status: number; percobaan: number; retryAfter?: string | null; sekarang?: number }): number | null {
  if (o.percobaan >= MAKS_COBA_ULANG) return null;
  if (!bolehCobaUlang(o.metode, o.status)) return null;
  const diminta = bacaRetryAfter(o.retryAfter, o.sekarang);
  if (diminta != null) return diminta > JEDA_MAKS_MS ? null : diminta;
  return Math.min(JEDA_DASAR_MS * 2 ** o.percobaan, JEDA_MAKS_MS);
}

/** Tunggu `ms`, berhenti lebih awal bila `signal` dibatalkan. */
export function tidur(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((selesai, gagal) => {
    if (signal?.aborted) {
      gagal(signal.reason ?? new DOMException("Dibatalkan", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", batal);
      selesai();
    }, ms);
    function batal() {
      clearTimeout(t);
      gagal(signal?.reason ?? new DOMException("Dibatalkan", "AbortError"));
    }
    signal?.addEventListener("abort", batal, { once: true });
  });
}

// --- Coba ulang penulisan pelengkap (U23a) ---------------------------------------------------
//
// graph() sendiri tidak mengulang POST yang gagal 5xx (bisa menggandakan item). Untuk penulisan PELENGKAP
// (catatan riwayat dan antrean email) aturannya sedikit lebih longgar, karena kehilangan catatan lebih buruk
// daripada sesekali tercatat dua kali. Email lebih hati-hati: hanya diulang bila permintaan hampir pasti belum
// diproses (luring, 429, 503), supaya penerima tidak mendapat dua email.

/** Berapa kali penulisan pelengkap dicoba seluruhnya (1 percobaan awal + 2 ulangan). */
export const KALI_COBA_PENULISAN = 3;
const JEDA_PENULISAN_MS = 800;

/** Bentuk galat yang dibaca di sini (GraphError tanpa mengimpor lib/graph, supaya modul ini tetap murni). */
interface GalatBerstatus {
  status?: unknown;
  kode?: unknown;
}

/**
 * Galat sementara yang layak diulang untuk penulisan pelengkap. `catatan`: riwayat aktivitas (5xx ikut diulang);
 * `email`: antrean email (hanya luring, 429, 503). Galat sesi, izin, dan data tidak pernah diulang.
 */
export function galatSementara(err: unknown, jenis: "catatan" | "email"): boolean {
  if (!err || typeof err !== "object") return false;
  const g = err as GalatBerstatus;
  if (g.kode === "perlu_login") return false;
  if (g.kode === "jaringan") return true;
  const status = typeof g.status === "number" ? g.status : null;
  if (status == null) return false;
  if (status === 429 || status === 503) return true;
  return jenis === "catatan" && (status === 500 || status === 502 || status === 504);
}

/**
 * Jalankan `kerja` sampai berhasil, paling banyak `kali` percobaan, dengan jeda naik (0,8 detik lalu 1,6 detik).
 * Galat yang tidak lolos `bolehUlang` langsung dilempar. Galat terakhir dilempar bila semua percobaan gagal.
 */
export async function ulangiPenulisan<T>(kerja: () => Promise<T>, o: { bolehUlang: (err: unknown) => boolean; kali?: number; jedaMs?: number; tunggu?: (ms: number) => Promise<void> }): Promise<T> {
  const kali = Math.max(1, o.kali ?? KALI_COBA_PENULISAN);
  const jeda = o.jedaMs ?? JEDA_PENULISAN_MS;
  const tunggu = o.tunggu ?? ((ms: number) => tidur(ms));
  for (let ke = 1; ; ke++) {
    try {
      return await kerja();
    } catch (err) {
      if (ke >= kali || !o.bolehUlang(err)) throw err;
      await tunggu(jeda * 2 ** (ke - 1));
    }
  }
}
