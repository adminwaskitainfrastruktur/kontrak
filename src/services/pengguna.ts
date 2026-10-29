// List "Pengguna Kontrak": siapa boleh masuk, divisi, dan perannya.
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { graph, graphSemua } from "../lib/graph";
import type { Divisi, Pengguna, Peran } from "../lib/types";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.pengguna}/items`;

interface ItemGraph {
  id: string;
  fields: Record<string, unknown>;
}

export type PenggunaInput = Omit<Pengguna, "id">;

export async function ambilSemuaPengguna(): Promise<Pengguna[]> {
  const items = await graphSemua<ItemGraph>(`${ITEMS}?$expand=fields&$top=999`);
  return items
    .map((it) => ({
      id: Number(it.id),
      nama: String(it.fields.Title ?? ""),
      email: String(it.fields.Email ?? "").trim().toLowerCase(),
      divisi: (it.fields.Divisi ?? "SCM") as Divisi,
      peran: (it.fields.Peran ?? "Pengaju") as Peran,
      aktif: it.fields.Aktif !== false,
    }))
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

function keFields(p: PenggunaInput) {
  return {
    Title: p.nama.trim(),
    Email: p.email.trim().toLowerCase(),
    Divisi: p.divisi,
    Peran: p.peran,
    Aktif: p.aktif,
  };
}

export async function tambahPengguna(p: PenggunaInput): Promise<void> {
  await graph(ITEMS, { method: "POST", json: { fields: keFields(p) } });
}

export async function ubahPengguna(id: number, p: PenggunaInput): Promise<void> {
  await graph(`${ITEMS}/${id}/fields`, { method: "PATCH", json: keFields(p) });
}
