// Senyap (mute) notifikasi per kontrak, per pengguna. Disimpan di list "Senyap Kontrak": satu baris per
// (email, kontrak) dengan Title = email dan KontrakId = ID kontrak. Ada barisnya berarti dibisukan.
//
// Efeknya: email dari aplikasi tentang kontrak itu tidak dikirim ke yang membisukan (lihat antrikanEmail di
// services/notifikasi.ts), dan lonceng serta toast kabar di aplikasi menyembunyikannya. Status kontrak tetap
// terlihat di aplikasi. Flow terjadwal (agenda pagi, pengingat, laporan) belum mengenal senyap.
// Bila list belum ada atau gagal dibaca, semua notifikasi tetap berjalan seperti biasa.
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { GraphError, graph, graphSemua } from "../lib/graph";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.senyap}/items`;
const PREFER = { headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" } };

interface ItemGraph {
  id: string;
  fields: { Title?: string; KontrakId?: number };
}

/** Kontrak yang dibisukan pengguna ini: ID kontrak -> ID baris (dipakai untuk membatalkan). */
export async function ambilSenyapSaya(email: string): Promise<Map<number, string>> {
  const bersih = email.trim().toLowerCase().replace(/'/g, "''");
  const items = await graphSemua<ItemGraph>(`${ITEMS}?$expand=fields($select=Title,KontrakId)&$top=999&$filter=fields/Title eq '${bersih}'`, PREFER);
  const peta = new Map<number, string>();
  for (const it of items) if (typeof it.fields.KontrakId === "number") peta.set(it.fields.KontrakId, it.id);
  return peta;
}

/** Bisukan satu kontrak untuk pengguna ini. Mengembalikan ID barisnya. */
export async function bisukanKontrak(email: string, kontrakId: number): Promise<string> {
  const it = await graph<ItemGraph>(ITEMS, { method: "POST", json: { fields: { Title: email.trim().toLowerCase(), KontrakId: kontrakId } } });
  return it.id;
}

/** Batalkan senyap (hapus barisnya sendiri). 404 dianggap sudah beres. */
export async function bunyikanKontrak(idBaris: string): Promise<void> {
  try {
    await graph(`${ITEMS}/${idBaris}`, { method: "DELETE" });
  } catch (err) {
    if (!(err instanceof GraphError && err.status === 404)) throw err;
  }
}

/**
 * Email siapa saja yang membisukan kontrak ini, untuk menyaring penerima sebelum email diantrikan.
 * Gagal membaca berarti tidak ada yang disaring (lebih baik email terkirim daripada hilang).
 */
export async function emailSenyapKontrak(kontrakId: number): Promise<Set<string>> {
  try {
    const items = await graphSemua<ItemGraph>(`${ITEMS}?$expand=fields($select=Title,KontrakId)&$top=999&$filter=fields/KontrakId eq ${kontrakId}`, PREFER);
    return new Set(items.map((i) => (i.fields.Title ?? "").trim().toLowerCase()).filter(Boolean));
  } catch {
    return new Set();
  }
}
