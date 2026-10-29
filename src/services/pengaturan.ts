// List "Pengaturan Kontrak" (Title = kunci, NilaiJson) dan list "Log Admin" (jejak perubahan pengaturan).
// Pengaturan dimuat sekali per sesi. Bila gagal, pemanggil (PengaturanProvider) memakai nilai bawaan.
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { graph, graphSemua } from "../lib/graph";
import { bacaPengaturan, validasiNilai, type BarisPengaturan, type HasilBaca, type KunciPengaturan, type Pengaturan } from "../lib/pengaturan";
import type { Sesi } from "../lib/types";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.pengaturan}/items`;
const ITEMS_LOG = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.logAdmin}/items`;

interface ItemGraph {
  id: string;
  lastModifiedDateTime?: string;
  fields: Record<string, unknown>;
}

const teks = (v: unknown) => (typeof v === "string" ? v : "");

export interface BarisPengaturanSp extends BarisPengaturan {
  id: number;
  diubah: string;
}

export async function ambilBarisPengaturan(): Promise<BarisPengaturanSp[]> {
  const items = await graphSemua<ItemGraph>(`${ITEMS}?$expand=fields($select=Title,NilaiJson)&$top=999`);
  return items.map((it) => ({ id: Number(it.id), kunci: teks(it.fields.Title).trim(), nilaiJson: teks(it.fields.NilaiJson), diubah: it.lastModifiedDateTime ?? "" }));
}

let cache: Promise<HasilBaca> | null = null;

export function kosongkanCachePengaturan() {
  cache = null;
}

/** Pengaturan lengkap beserta keterangan kunci mana yang tersimpan dan mana yang rusak. Disimpan sekali per sesi. */
export function ambilPengaturanRinci(): Promise<HasilBaca> {
  if (cache) return cache;
  const janji = ambilBarisPengaturan().then(bacaPengaturan);
  cache = janji;
  janji.catch(() => {
    if (cache === janji) cache = null;
  });
  return janji;
}

export async function ambilPengaturan(): Promise<Pengaturan> {
  return (await ambilPengaturanRinci()).pengaturan;
}

/** Buat atau perbarui baris satu kunci. Nilai divalidasi dulu; nilai tidak sah ditolak dengan pesan yang jelas. */
export async function simpanPengaturan<K extends KunciPengaturan>(kunci: K, nilai: Pengaturan[K]): Promise<Pengaturan[K]> {
  const h = validasiNilai(kunci, nilai);
  if (!h.ok) throw new Error(h.galat);
  const nilaiJson = JSON.stringify(h.nilai);
  // Selalu baca ulang supaya tidak membuat baris ganda bila Admin lain baru saja menyimpan kunci yang sama.
  const baris = await ambilBarisPengaturan();
  const ada = baris.filter((b) => b.kunci === kunci).sort((a, b) => a.id - b.id);
  if (ada.length) {
    await graph(`${ITEMS}/${ada[0]!.id}/fields`, { method: "PATCH", json: { NilaiJson: nilaiJson } });
  } else {
    await graph(ITEMS, { method: "POST", json: { fields: { Title: kunci, NilaiJson: nilaiJson } } });
  }
  kosongkanCachePengaturan();
  return h.nilai;
}

// --- Mode uji email --------------------------------------------------------------------------
// Baris Title = "emailUji" dibaca flow terjadwal (Agenda, Laporan, Pengingat, Pengawas): bila berisi alamat,
// semua email terjadwal dialihkan ke alamat itu dengan subjek berawalan [UJI]. Kosong berarti mode uji mati.
// Email transaksional dari kotak keluar (pengajuan baru, status berubah) tidak ikut dialihkan.

export const KUNCI_EMAIL_UJI = "emailUji";

function bacaAlamatUji(nilaiJson: string): string {
  let v: unknown = nilaiJson;
  try {
    v = JSON.parse(nilaiJson);
  } catch {
    // Diisi manual di SharePoint tanpa tanda petik: pakai apa adanya, sama seperti flow.
  }
  return typeof v === "string" ? v.replace(/"/g, "").trim() : "";
}

/** Alamat tujuan mode uji, atau string kosong bila mode uji mati. */
export async function ambilEmailUji(): Promise<string> {
  const baris = await ambilBarisPengaturan();
  const ada = baris.filter((b) => b.kunci === KUNCI_EMAIL_UJI).sort((a, b) => a.id - b.id);
  return ada.length ? bacaAlamatUji(ada[0]!.nilaiJson) : "";
}

/** Isi alamat untuk menyalakan mode uji, string kosong untuk mematikannya. Barisnya tidak pernah dihapus. */
export async function simpanEmailUji(alamat: string): Promise<void> {
  const bersih = alamat.trim();
  if (bersih && !/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(bersih)) throw new Error("Isi satu alamat email yang sah.");
  const nilaiJson = bersih ? JSON.stringify(bersih) : "";
  const baris = await ambilBarisPengaturan();
  const ada = baris.filter((b) => b.kunci === KUNCI_EMAIL_UJI).sort((a, b) => a.id - b.id);
  if (ada.length) {
    await graph(`${ITEMS}/${ada[0]!.id}/fields`, { method: "PATCH", json: { NilaiJson: nilaiJson } });
  } else {
    await graph(ITEMS, { method: "POST", json: { fields: { Title: KUNCI_EMAIL_UJI, NilaiJson: nilaiJson } } });
  }
}

// --- Log Admin -------------------------------------------------------------------------------

export interface EntriLogAdmin {
  /** Nama aksi singkat, mis. "Ubah pengaturan". */
  aksi: string;
  /** Yang diubah, mis. kunci pengaturan atau email pengguna. */
  sasaran: string;
  detail?: unknown;
}

export async function catatLogAdmin(e: EntriLogAdmin, sesi: Sesi): Promise<void> {
  await graph(ITEMS_LOG, {
    method: "POST",
    json: {
      fields: {
        Title: e.aksi.slice(0, 250),
        Pelaku: `${sesi.nama} <${sesi.email}>`.slice(0, 250),
        Sasaran: e.sasaran.slice(0, 250),
        DetailLog: e.detail === undefined ? "" : typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail),
      },
    },
  });
}
