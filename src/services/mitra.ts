// List "Mitra Kontrak": data induk mitra (nama resmi, NPWP, penandatangan).
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { graph, graphSemua } from "../lib/graph";
import type { Mitra, MitraInput } from "../lib/types";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.mitra}/items`;

interface ItemGraph {
  id: string;
  fields: Record<string, unknown>;
}

const teks = (v: unknown) => (typeof v === "string" ? v : "");

function dariItem(it: ItemGraph): Mitra {
  const f = it.fields;
  return {
    id: Number(it.id),
    nama: teks(f.Title),
    npwp: teks(f.Npwp),
    alamat: teks(f.Alamat),
    penandatangan: teks(f.Penandatangan),
    jabatan: teks(f.Jabatan),
    email: teks(f.EmailKontak),
    telepon: teks(f.TeleponKontak),
    namaLain: teks(f.NamaLain)
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean),
    aktif: f.Aktif !== false,
    terverifikasi: f.Terverifikasi === true,
  };
}

function keFields(m: Partial<MitraInput>): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (m.nama !== undefined) f.Title = m.nama.trim();
  if (m.npwp !== undefined) f.Npwp = m.npwp.trim();
  if (m.alamat !== undefined) f.Alamat = m.alamat.trim();
  if (m.penandatangan !== undefined) f.Penandatangan = m.penandatangan.trim();
  if (m.jabatan !== undefined) f.Jabatan = m.jabatan.trim();
  if (m.email !== undefined) f.EmailKontak = m.email.trim();
  if (m.telepon !== undefined) f.TeleponKontak = m.telepon.trim();
  if (m.namaLain !== undefined) f.NamaLain = m.namaLain.map((x) => x.trim()).filter(Boolean).join("\n");
  if (m.aktif !== undefined) f.Aktif = m.aktif;
  if (m.terverifikasi !== undefined) f.Terverifikasi = m.terverifikasi;
  return f;
}

// Daftar mitra kecil dan dipakai berulang (chat, formulir, halaman Mitra), jadi disimpan singkat.
let cache: { waktu: number; janji: Promise<Mitra[]> } | null = null;

export function kosongkanCacheMitra() {
  cache = null;
}

export function ambilSemuaMitra(): Promise<Mitra[]> {
  if (cache && Date.now() - cache.waktu < 30_000) return cache.janji;
  const janji = graphSemua<ItemGraph>(`${ITEMS}?$expand=fields&$top=999`).then((items) => items.map(dariItem).sort((a, b) => a.nama.localeCompare(b.nama, "id")));
  cache = { waktu: Date.now(), janji };
  janji.catch(() => {
    if (cache?.janji === janji) cache = null;
  });
  return janji;
}

export async function tambahMitra(m: MitraInput): Promise<Mitra> {
  kosongkanCacheMitra();
  const it = await graph<ItemGraph>(ITEMS, { method: "POST", json: { fields: keFields(m) } });
  return dariItem(it);
}

export async function ubahMitra(id: number, m: Partial<MitraInput>): Promise<void> {
  kosongkanCacheMitra();
  await graph(`${ITEMS}/${id}/fields`, { method: "PATCH", json: keFields(m) });
}
