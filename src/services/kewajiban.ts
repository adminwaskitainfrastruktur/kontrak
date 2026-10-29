// List "Kewajiban Kontrak": tonggak ringan setelah kontrak Aktif (BAST, retensi, laporan berkala, pembaruan jaminan).
// Tanpa persen dan tanpa nominal: aturan dan tipenya ada di lib/masa.ts.
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { dariYmd, keYmd } from "../lib/format";
import { graph, graphSemua } from "../lib/graph";
import { STATUS_KEWAJIBAN, TIPE_KEWAJIBAN, type Kewajiban, type KewajibanInput, type StatusKewajiban, type TipeKewajiban } from "../lib/masa";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.kewajiban}/items`;

interface ItemGraph {
  id: string;
  fields: Record<string, unknown>;
}

const teks = (v: unknown) => (typeof v === "string" ? v : "");

/** Kolom Hyperlink SharePoint datang sebagai { Url, Description }; kolom teks biasa sebagai string. */
function bacaTautan(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "Url" in v && typeof (v as { Url: unknown }).Url === "string") return (v as { Url: string }).Url;
  return "";
}

function dariItem(it: ItemGraph): Kewajiban {
  const f = it.fields;
  const tipe = teks(f.TipeKewajiban);
  const status = teks(f.StatusKewajiban);
  return {
    id: Number(it.id),
    judul: teks(f.Title),
    kontrakId: typeof f.KontrakId === "number" ? f.KontrakId : null,
    tipe: (TIPE_KEWAJIBAN as readonly string[]).includes(tipe) ? (tipe as TipeKewajiban) : "Lainnya",
    jatuhTempo: keYmd(teks(f.JatuhTempo)),
    picEmail: teks(f.PicEmail),
    status: (STATUS_KEWAJIBAN as readonly string[]).includes(status) ? (status as StatusKewajiban) : "Terbuka",
    buktiUrl: bacaTautan(f.BuktiUrl),
    catatan: teks(f.CatatanKewajiban),
  };
}

function keFields(w: Partial<KewajibanInput>): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (w.judul !== undefined) f.Title = w.judul.trim();
  if (w.kontrakId !== undefined) f.KontrakId = w.kontrakId;
  if (w.tipe !== undefined) f.TipeKewajiban = w.tipe;
  if (w.jatuhTempo !== undefined) f.JatuhTempo = dariYmd(w.jatuhTempo);
  if (w.picEmail !== undefined) f.PicEmail = w.picEmail.trim().toLowerCase();
  if (w.status !== undefined) f.StatusKewajiban = w.status;
  if (w.buktiUrl !== undefined) f.BuktiUrl = w.buktiUrl.trim();
  if (w.catatan !== undefined) f.CatatanKewajiban = w.catatan;
  return f;
}

const urutJatuhTempo = (a: Kewajiban, b: Kewajiban) => (a.jatuhTempo ?? "9999").localeCompare(b.jatuhTempo ?? "9999") || a.id - b.id;

/** Kewajiban satu kontrak. KontrakId perlu diindeks di list supaya filter ini tetap andal. */
export async function ambilKewajibanKontrak(kontrakId: number): Promise<Kewajiban[]> {
  const items = await graphSemua<ItemGraph>(`${ITEMS}?$expand=fields&$top=999&$filter=fields/KontrakId eq ${kontrakId}`, {
    headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" },
  });
  return items.map(dariItem).sort(urutJatuhTempo);
}

export async function ambilSemuaKewajiban(): Promise<Kewajiban[]> {
  const items = await graphSemua<ItemGraph>(`${ITEMS}?$expand=fields&$top=999`);
  return items.map(dariItem).sort(urutJatuhTempo);
}

export async function tambahKewajiban(w: KewajibanInput): Promise<Kewajiban> {
  return dariItem(await graph<ItemGraph>(ITEMS, { method: "POST", json: { fields: keFields(w) } }));
}

export async function ubahKewajiban(id: number, w: Partial<KewajibanInput>): Promise<void> {
  await graph(`${ITEMS}/${id}/fields`, { method: "PATCH", json: keFields(w) });
}

/** "Tandai selesai": boleh oleh Legal dan pengaju kontrak; bukti (tautan BAST dsb.) opsional. */
export async function selesaikanKewajiban(id: number, buktiUrl: string, catatan?: string): Promise<void> {
  await ubahKewajiban(id, { status: "Selesai", buktiUrl, ...(catatan !== undefined ? { catatan } : {}) });
}
