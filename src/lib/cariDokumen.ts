// Grup "Dokumen" di palet Ctrl+K (U17): bagian murni (tanpa jaringan) supaya bisa diuji.
//
// - Kueri KQL untuk Microsoft Search dibatasi ke library "Berkas Kontrak" (path:"...").
// - Berkas dipetakan ke kontrak lewat folder pertamanya di library, yaitu <Nomor Pengajuan>.
//   Berkas yang tidak terpetakan (folder lain, _Templat, akar library) dibuang.
// - Ringkasan sorotan dari Search ("<c0>kata</c0> ... <ddd/>") diurai menjadi potongan teks biasa,
//   tidak pernah dirender sebagai HTML.
// Panggilan jaringannya ada di lib/pencarianDokumen.ts.
import type { Kontrak } from "./types";

export const MIN_HURUF_DOKUMEN = 3;
export const JEDA_CARI_DOKUMEN_MS = 400;
export const MAKS_HASIL_DOKUMEN = 6;

export interface HitDokumen {
  id: string;
  nama: string;
  webUrl: string;
  /** Ringkasan mentah dari Search, berisi penanda <c0> dan <ddd/>. */
  ringkasan: string;
  diubah: string | null;
}

export interface PotonganSorotan {
  teks: string;
  sorot: boolean;
}

export interface HasilDokumen extends HitDokumen {
  kontrak: Kontrak;
  sorotan: PotonganSorotan[];
  /** Kata kunci ditemukan di nama berkas (diutamakan di atas temuan isi). */
  cocokNama: boolean;
}

/** Kata kunci aman untuk KQL: huruf kecil (AND/OR/NOT tidak lagi operator), tanpa tanda kutip, kurung, titik dua. */
export function kataKunciDokumen(teks: string): string[] {
  return teks
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_.-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
    .filter(Boolean);
}

/**
 * Kueri KQL untuk Microsoft Search, atau null bila terlalu pendek. Kata terakhir diberi * supaya
 * "draft kon" sudah menemukan "Draft Kontrak.docx" selagi mengetik.
 */
export function kueriDokumen(teks: string, urlLibrary: string): string | null {
  const kata = kataKunciDokumen(teks);
  if (kata.join("").length < MIN_HURUF_DOKUMEN) return null;
  const terakhir = kata.length - 1;
  const bagian = kata.map((k, i) => (i === terakhir && k.length >= MIN_HURUF_DOKUMEN ? `${k}*` : k));
  return `${bagian.join(" ")} path:"${urlLibrary.replace(/\/+$/, "")}"`;
}

const ENTITAS: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Ubah entitas HTML umum menjadi karakternya (teks tetap teks, tidak ada HTML yang dirender). */
export function uraiEntitas(t: string): string {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (asli, kode: string) => {
    if (kode[0] === "#") {
      const n = kode[1] === "x" || kode[1] === "X" ? parseInt(kode.slice(2), 16) : parseInt(kode.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : asli;
    }
    return ENTITAS[kode.toLowerCase()] ?? asli;
  });
}

/** Urai ringkasan sorotan Search menjadi potongan teks; <c0> = disorot, <ddd/> = elipsis, tag lain dibuang. */
export function uraiSorotan(ringkasan: string): PotonganSorotan[] {
  const hasil: PotonganSorotan[] = [];
  const tambah = (teksMentah: string, sorot: boolean) => {
    const teks = uraiEntitas(teksMentah.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ");
    if (!teks) return;
    const akhir = hasil[hasil.length - 1];
    if (akhir && akhir.sorot === sorot) akhir.teks += teks;
    else hasil.push({ teks, sorot });
  };
  const sumber = (ringkasan ?? "").replace(/<ddd\s*\/?>/gi, " … ");
  const pola = /<c0>([\s\S]*?)<\/c0>/gi;
  let pos = 0;
  for (let m = pola.exec(sumber); m; m = pola.exec(sumber)) {
    tambah(sumber.slice(pos, m.index), false);
    tambah(m[1] ?? "", true);
    pos = m.index + m[0].length;
  }
  tambah(sumber.slice(pos), false);
  // Rapikan spasi di ujung keseluruhan ringkasan.
  if (hasil[0]) hasil[0].teks = hasil[0].teks.replace(/^\s+/, "");
  const ujung = hasil[hasil.length - 1];
  if (ujung) ujung.teks = ujung.teks.replace(/\s+$/, "");
  return hasil.filter((p) => p.teks);
}

/**
 * Folder pertama berkas di bawah library (= nomor pengajuan), atau null bila berkas di luar library,
 * langsung di akar library, atau alamatnya tidak terbaca.
 */
export function folderDariWebUrl(webUrl: string, urlLibrary: string): string | null {
  let u: URL;
  let lib: URL;
  try {
    u = new URL(webUrl);
    lib = new URL(urlLibrary);
  } catch {
    return null;
  }
  if (u.host.toLowerCase() !== lib.host.toLowerCase()) return null;
  let jalur: string;
  let dasar: string;
  try {
    jalur = decodeURIComponent(u.pathname);
    dasar = `${decodeURIComponent(lib.pathname).replace(/\/+$/, "")}/`;
  } catch {
    return null;
  }
  if (!jalur.toLowerCase().startsWith(dasar.toLowerCase())) return null;
  const bagian = jalur.slice(dasar.length).split("/").filter(Boolean);
  // Minimal <folder>/<berkas>; berkas langsung di akar library tidak milik kontrak mana pun.
  if (bagian.length < 2) return null;
  return bagian[0]!.trim() || null;
}

/**
 * Petakan hasil Search ke kontrak yang boleh dilihat. Yang tidak terpetakan atau tidak boleh dilihat
 * dibuang; berkas yang namanya memuat kata kunci diletakkan di atas temuan isi, urutan relevansi
 * Search dipertahankan di dalam tiap kelompok.
 */
export function petakanDokumen(
  hits: readonly HitDokumen[],
  kontrak: readonly Kontrak[],
  o: { urlLibrary: string; boleh: (k: Kontrak) => boolean; teks: string; maks?: number; tanpaLembar?: boolean },
): HasilDokumen[] {
  const perNomor = new Map(kontrak.filter((k) => k.nomorPengajuan).map((k) => [k.nomorPengajuan.trim().toLowerCase(), k]));
  const kata = kataKunciDokumen(o.teks).filter((k) => k.length >= 2);
  const sudah = new Set<string>();
  const hasil: (HasilDokumen & { i: number })[] = [];
  hits.forEach((h, i) => {
    const kunci = h.webUrl || h.id;
    if (!kunci || sudah.has(kunci)) return;
    const folder = folderDariWebUrl(h.webUrl, o.urlLibrary);
    const k = folder ? perNomor.get(folder.toLowerCase()) : undefined;
    if (!k || !o.boleh(k)) return;
    // Salinan Lembar Review Legal adalah dokumen internal: tidak boleh muncul (nama maupun cuplikan isinya) di Ruang Pengguna.
    if (o.tanpaLembar && /^lembar review legal\b/i.test(h.nama.trim())) return;
    sudah.add(kunci);
    const nama = h.nama.toLowerCase();
    hasil.push({ ...h, kontrak: k, sorotan: uraiSorotan(h.ringkasan), cocokNama: kata.some((x) => nama.includes(x)), i });
  });
  return hasil
    .sort((a, b) => Number(b.cocokNama) - Number(a.cocokNama) || a.i - b.i)
    .slice(0, o.maks ?? MAKS_HASIL_DOKUMEN)
    .map(({ i: _i, ...h }) => h);
}
