// Seluruh perubahan status kontrak dari list "Aktivitas Kontrak", untuk laporan dan perkiraan antrean.
// Hanya baris berjenis Status; komentar dan perubahan data tidak ikut diambil.
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { graphSemua } from "../lib/graph";
import type { EventStatus } from "../lib/laporan";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.aktivitas}/items`;

interface ItemGraph {
  id: string;
  createdDateTime: string;
  fields: Record<string, unknown>;
}

const teks = (v: unknown) => (typeof v === "string" ? v : "");

// Laporan dan perkiraan antrean sering dibuka bergantian, jadi hasilnya disimpan semenit.
const UMUR_CACHE_MS = 60_000;
let cache: { waktu: number; janji: Promise<EventStatus[]> } | null = null;

export function kosongkanCacheRiwayat() {
  cache = null;
}

/** Semua event perubahan status, urut dari yang paling lama. */
export function ambilSemuaEventStatus(): Promise<EventStatus[]> {
  if (cache && Date.now() - cache.waktu < UMUR_CACHE_MS) return cache.janji;
  const janji = graphSemua<ItemGraph>(
    `${ITEMS}?$expand=fields($select=Title,KontrakId,StatusDari,StatusKe,OlehNama)&$top=999&$filter=fields/Title eq 'Status'`,
    { headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" } },
  ).then((items) =>
    items
      .map<EventStatus>((it) => ({
        id: Number(it.id),
        kontrakId: Number(it.fields.KontrakId),
        statusDari: teks(it.fields.StatusDari),
        statusKe: teks(it.fields.StatusKe),
        waktu: it.createdDateTime,
        olehNama: teks(it.fields.OlehNama),
      }))
      .filter((e) => Number.isFinite(e.kontrakId) && e.statusKe !== "")
      .sort((a, b) => a.waktu.localeCompare(b.waktu) || a.id - b.id),
  );
  cache = { waktu: Date.now(), janji };
  // Gagal jangan disimpan: percobaan berikutnya harus benar-benar mengulang.
  janji.catch(() => {
    if (cache?.janji === janji) cache = null;
  });
  return janji;
}
