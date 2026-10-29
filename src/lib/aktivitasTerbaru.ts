// Umpan aktivitas terbaru untuk lonceng "Untuk Anda" (U26): satu kueri ke list Aktivitas untuk
// semua kontrak sekaligus, disaring kolom Created. Bila kolom Created belum diindeks dan list sudah
// besar, SharePoint bisa menolak kueri ini; umpan lalu dimatikan untuk sesi ini dan lonceng tetap
// bekerja dari perbandingan daftar kontrak saja (bertahap, sesuai peta jalan).
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { GraphError, graphSemua } from "./graph";
import type { AktivitasRingkas } from "./kabarAdmin";
import type { JenisAktivitas } from "./types";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.aktivitas}/items`;
/** Paling jauh ke belakang yang diperiksa, supaya kunjungan setelah cuti panjang tidak memuat ribuan baris. */
const MAKS_MUNDUR_MS = 3 * 24 * 3_600_000;
/** Mundur sedikit dari pemeriksaan terakhir untuk selisih jam perangkat dan server; duplikat disaring lewat ID. */
const TUMPANG_MS = 5 * 60_000;

interface ItemGraph {
  id: string;
  createdDateTime: string;
  fields: Record<string, unknown>;
}

const teks = (v: unknown) => (typeof v === "string" ? v : "");

let tersedia = true;
/** false setelah Graph menolak $select (mis. kolom Disebut belum dibuat): ulangi dengan semua kolom. */
let pakaiSelect = true;

/** Umpan aktivitas masih bisa dipakai di sesi ini? */
export function umpanAktivitasTersedia(): boolean {
  return tersedia;
}

/**
 * Aktivitas sejak `sejak` (ISO). Kembalian null bila umpan tidak tersedia (kueri ditolak);
 * galat sesi dan jaringan tetap dilempar supaya ditangani seperti permintaan lain.
 */
export async function ambilAktivitasSejak(sejak: string, sekarang: number = Date.now()): Promise<AktivitasRingkas[] | null> {
  if (!tersedia) return null;
  const batas = new Date(Math.max(Date.parse(sejak) - TUMPANG_MS, sekarang - MAKS_MUNDUR_MS)).toISOString();
  const pilih = "Title,KontrakId,Pesan,OlehEmail,OlehNama,Disebut";
  const muat = (expand: string) =>
    graphSemua<ItemGraph>(`${ITEMS}?$expand=${expand}&$top=200&$filter=fields/Created ge '${batas}'`, {
      headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" },
    });
  try {
    let items: ItemGraph[];
    try {
      items = await muat(pakaiSelect ? `fields($select=${pilih})` : "fields");
    } catch (err) {
      // 400 karena $select (kolom opsional seperti Disebut belum ada): coba sekali tanpa $select.
      if (!(pakaiSelect && err instanceof GraphError && err.status === 400)) throw err;
      pakaiSelect = false;
      items = await muat("fields");
    }
    return items.map((it) => ({
      id: Number(it.id),
      kontrakId: Number(it.fields.KontrakId),
      jenis: (teks(it.fields.Title) || "Komentar") as JenisAktivitas,
      pesan: teks(it.fields.Pesan),
      olehEmail: teks(it.fields.OlehEmail).toLowerCase(),
      olehNama: teks(it.fields.OlehNama),
      waktu: it.createdDateTime,
      disebut: teks(it.fields.Disebut)
        .split(/[;,]/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    }));
  } catch (err) {
    if (err instanceof GraphError && (err.perluLogin || err.jaringan)) throw err;
    // 400/500 dari kueri Created yang tidak diindeks, atau kolom yang belum ada: matikan dengan tenang.
    tersedia = false;
    console.warn("[Untuk Anda] Umpan aktivitas dimatikan untuk sesi ini:", err);
    return null;
  }
}
