// List "Jaminan Kontrak": register bank garansi dan surety bond per kontrak.
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { dariYmd, keYmd } from "../lib/format";
import { graph, graphSemua } from "../lib/graph";
import type { Jaminan, JaminanInput } from "../lib/types";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.jaminan}/items`;

interface ItemGraph {
  id: string;
  fields: Record<string, unknown>;
}

const teks = (v: unknown) => (typeof v === "string" ? v : "");

function dariItem(it: ItemGraph): Jaminan {
  const f = it.fields;
  return {
    id: Number(it.id),
    nomor: teks(f.Title),
    kontrakId: typeof f.KontrakId === "number" ? f.KontrakId : null,
    jenis: (teks(f.JenisJaminan) || "Lainnya") as Jaminan["jenis"],
    penerbit: teks(f.Penerbit),
    nilai: typeof f.NilaiJaminan === "number" ? f.NilaiJaminan : null,
    mataUang: (teks(f.MataUangJaminan) || "IDR") as Jaminan["mataUang"],
    tanggalTerbit: keYmd(teks(f.TanggalTerbit)),
    tanggalBerakhir: keYmd(teks(f.TanggalBerakhirJaminan)),
    status: (teks(f.StatusJaminan) || "Aktif") as Jaminan["status"],
    catatan: teks(f.CatatanJaminan),
  };
}

function keFields(j: Partial<JaminanInput>): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (j.nomor !== undefined) f.Title = j.nomor.trim();
  if (j.kontrakId !== undefined) f.KontrakId = j.kontrakId;
  if (j.jenis !== undefined) f.JenisJaminan = j.jenis;
  if (j.penerbit !== undefined) f.Penerbit = j.penerbit.trim();
  if (j.nilai !== undefined) f.NilaiJaminan = j.nilai;
  if (j.mataUang !== undefined) f.MataUangJaminan = j.mataUang;
  if (j.tanggalTerbit !== undefined) f.TanggalTerbit = dariYmd(j.tanggalTerbit);
  if (j.tanggalBerakhir !== undefined) f.TanggalBerakhirJaminan = dariYmd(j.tanggalBerakhir);
  if (j.status !== undefined) f.StatusJaminan = j.status;
  if (j.catatan !== undefined) f.CatatanJaminan = j.catatan;
  return f;
}

const urutBerakhir = (a: Jaminan, b: Jaminan) => (a.tanggalBerakhir ?? "9999").localeCompare(b.tanggalBerakhir ?? "9999") || a.id - b.id;

export async function ambilSemuaJaminan(): Promise<Jaminan[]> {
  const items = await graphSemua<ItemGraph>(`${ITEMS}?$expand=fields&$top=999`);
  return items.map(dariItem).sort(urutBerakhir);
}

/** Jaminan satu kontrak. KontrakId perlu diindeks di list supaya filter ini tetap andal saat list membesar. */
export async function ambilJaminanKontrak(kontrakId: number): Promise<Jaminan[]> {
  const items = await graphSemua<ItemGraph>(`${ITEMS}?$expand=fields&$top=999&$filter=fields/KontrakId eq ${kontrakId}`, {
    headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" },
  });
  return items.map(dariItem).sort(urutBerakhir);
}

export async function tambahJaminan(j: JaminanInput): Promise<Jaminan> {
  return dariItem(await graph<ItemGraph>(ITEMS, { method: "POST", json: { fields: keFields(j) } }));
}

export async function ubahJaminan(id: number, j: Partial<JaminanInput>): Promise<void> {
  await graph(`${ITEMS}/${id}/fields`, { method: "PATCH", json: keFields(j) });
}
