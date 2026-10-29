// Pencarian nama dan isi berkas lewat Microsoft Search (POST /search/query, entityTypes driveItem) untuk
// grup "Dokumen" di palet Ctrl+K (U17). Dibatasi ke library "Berkas Kontrak" dengan KQL path:.
//
// Izin: delegated Sites.Read.All / Files.Read.All (Sites.ReadWrite.All yang sudah diminta aplikasi ikut
// mencakupnya). Bila tenant menolak (403) atau kueri tidak didukung (400), pencarian dokumen dimatikan
// untuk sesi ini tanpa mengganggu pengguna: grup Dokumen tidak tampil, pencarian kontrak tetap jalan.
// Keterbatasan: hasil mengikuti indeks Microsoft 365 (berkas baru bisa butuh beberapa menit sampai
// beberapa jam), dan PDF hasil pindai tanpa lapisan teks hanya ditemukan dari namanya.
import { URL_LIBRARY_BERKAS } from "../config";
import { GraphError, graph } from "./graph";
import { kueriDokumen, type HitDokumen } from "./cariDokumen";

interface ResponsSearch {
  value?: {
    hitsContainers?: {
      hits?: {
        hitId?: string;
        summary?: string;
        resource?: { id?: string; name?: string; webUrl?: string; lastModifiedDateTime?: string };
      }[];
    }[];
  }[];
}

/** Ambil hasil lebih banyak dari yang ditampilkan: sebagian dibuang karena tak terpetakan atau tak boleh dilihat. */
const UKURAN_HALAMAN = 25;

let tersedia = true;

/** Pencarian dokumen masih bisa dipakai di sesi ini? */
export function pencarianDokumenTersedia(): boolean {
  return tersedia;
}

/**
 * Cari berkas di library Berkas Kontrak. [] bila kata kunci terlalu pendek; null bila pencarian
 * dokumen tidak tersedia atau gagal (grup Dokumen disembunyikan). Pembatalan lewat `signal` dilempar ulang.
 */
export async function cariDokumen(teks: string, signal?: AbortSignal): Promise<HitDokumen[] | null> {
  if (!tersedia) return null;
  const kueri = kueriDokumen(teks, URL_LIBRARY_BERKAS);
  if (!kueri) return [];
  try {
    const r = await graph<ResponsSearch>("/search/query", {
      method: "POST",
      json: { requests: [{ entityTypes: ["driveItem"], query: { queryString: kueri }, from: 0, size: UKURAN_HALAMAN }] },
      signal,
    });
    const hits = r?.value?.[0]?.hitsContainers?.flatMap((c) => c.hits ?? []) ?? [];
    return hits
      .filter((h) => h.resource?.webUrl && h.resource?.name)
      .map((h) => ({
        id: h.resource?.id ?? h.hitId ?? h.resource!.webUrl!,
        nama: h.resource!.name!,
        webUrl: h.resource!.webUrl!,
        ringkasan: h.summary ?? "",
        diubah: h.resource?.lastModifiedDateTime ?? null,
      }));
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err;
    if (err instanceof GraphError && (err.status === 400 || err.status === 403 || err.status === 501)) {
      tersedia = false;
      console.info("[Ctrl+K] Pencarian dokumen dimatikan untuk sesi ini (Microsoft Search menolak permintaan):", err.status, err.message);
    } else {
      console.warn("[Ctrl+K] Pencarian dokumen gagal:", err);
    }
    return null;
  }
}
