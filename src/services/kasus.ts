// List "Kasus Kontrak" (K02 tahap 2), khusus Legal/Admin. Kolom yang dipakai:
//   Title (judul), KontrakId (Number, diindeks), NomorPengajuan (teks, untuk dibaca di SharePoint),
//   JenisKasus (Choice), StatusKasus (Choice), TanggalKasus, BatasTindakLanjut, TanggalSelesai (Date only),
//   Uraian, TindakLanjut (Multiple lines of text, plain).
// Riwayat perubahan memakai versioning list dan createdBy/lastModifiedBy SharePoint, BUKAN list Aktivitas,
// karena Aktivitas terbaca pengaju.
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { GraphError, graph, graphSemua } from "../lib/graph";
import { dariYmd, keYmd } from "../lib/format";
import { JENIS_KASUS, STATUS_KASUS, adaSengketaTerbuka, type Kasus, type KasusInput } from "../lib/kasus";
import type { Kontrak } from "../lib/types";
import { tulisPelengkap } from "./kontrak";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.kasus}/items`;

interface ItemGraph {
  id: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  createdBy?: { user?: { displayName?: string } };
  lastModifiedBy?: { user?: { displayName?: string } };
  fields: Record<string, unknown>;
}

const teks = (v: unknown) => (typeof v === "string" ? v : "");

function dariItem(it: ItemGraph): Kasus {
  const f = it.fields;
  const jenis = teks(f.JenisKasus);
  const status = teks(f.StatusKasus);
  return {
    id: Number(it.id),
    kontrakId: Number(f.KontrakId),
    judul: teks(f.Title),
    jenis: ((JENIS_KASUS as readonly string[]).includes(jenis) ? jenis : "Lainnya") as Kasus["jenis"],
    status: ((STATUS_KASUS as readonly string[]).includes(status) ? status : "Terbuka") as Kasus["status"],
    tanggal: keYmd(teks(f.TanggalKasus)),
    uraian: teks(f.Uraian),
    tindakLanjut: teks(f.TindakLanjut),
    batasTindakLanjut: keYmd(teks(f.BatasTindakLanjut)),
    tanggalSelesai: keYmd(teks(f.TanggalSelesai)),
    dibuat: it.createdDateTime,
    dibuatOleh: it.createdBy?.user?.displayName ?? "",
    diubah: it.lastModifiedDateTime,
    diubahOleh: it.lastModifiedBy?.user?.displayName ?? "",
  };
}

/** Galat list Kasus yang dibuat ramah: list belum dibuat atau akun tanpa izin. */
function galatRamah(err: unknown): unknown {
  if (err instanceof GraphError && (err.status === 403 || err.status === 404)) {
    return new GraphError(
      err.status === 403
        ? "Akun Anda belum diberi akses ke list Kasus Kontrak. List ini khusus Legal; minta pemilik site menambahkan izin Edit untuk grup Legal."
        : "List Kasus Kontrak belum ditemukan di site. Minta Admin membuat list dan kolomnya lebih dulu.",
      err.status,
    );
  }
  return err;
}

export async function ambilKasus(kontrakId: number): Promise<Kasus[]> {
  try {
    const items = await graphSemua<ItemGraph>(`${ITEMS}?$expand=fields&$top=999&$filter=fields/KontrakId eq ${kontrakId}`, {
      headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" },
    });
    return items.map(dariItem);
  } catch (err) {
    throw galatRamah(err);
  }
}

function keFields(k: Kontrak, d: KasusInput): Record<string, unknown> {
  return {
    Title: d.judul.slice(0, 250),
    KontrakId: k.id,
    NomorPengajuan: k.nomorPengajuan,
    JenisKasus: d.jenis,
    StatusKasus: d.status,
    TanggalKasus: dariYmd(d.tanggal),
    BatasTindakLanjut: dariYmd(d.batasTindakLanjut),
    TanggalSelesai: dariYmd(d.tanggalSelesai),
    Uraian: d.uraian,
    TindakLanjut: d.tindakLanjut,
  };
}

export interface HasilSimpanKasus {
  /** Nilai AdaSengketa sesudah disimpan. */
  adaSengketa: boolean;
  /** false bila flag AdaSengketa di Kontrak perlu diubah tetapi gagal ditulis (mis. kolom belum ada). */
  flagTersimpan: boolean;
}

/**
 * Buat (tanpa `id`) atau perbarui satu kasus, lalu samakan flag AdaSengketa di item Kontrak dengan daftar kasus
 * terbaru. Flag ditulis hanya bila nilainya berubah.
 */
export async function simpanKasus(k: Kontrak, d: KasusInput, id?: number): Promise<HasilSimpanKasus> {
  try {
    if (id != null) await graph(`${ITEMS}/${id}/fields`, { method: "PATCH", json: keFields(k, d) });
    else await graph(ITEMS, { method: "POST", json: { fields: keFields(k, d) } });
  } catch (err) {
    throw galatRamah(err);
  }
  return samakanFlagSengketa(k);
}

/** Hitung ulang AdaSengketa dari list Kasus dan tulis ke Kontrak bila berbeda. */
export async function samakanFlagSengketa(k: Pick<Kontrak, "id" | "adaSengketa">): Promise<HasilSimpanKasus> {
  const adaSengketa = adaSengketaTerbuka(await ambilKasus(k.id));
  if (adaSengketa === k.adaSengketa) return { adaSengketa, flagTersimpan: true };
  return { adaSengketa, flagTersimpan: await tulisPelengkap(k.id, { AdaSengketa: adaSengketa }) };
}
