// Bahan halaman Jejak Audit (U31): baris list Aktivitas Kontrak dan Log Admin dalam satu periode.
//
// Aktivitas disaring di SharePoint lewat kolom Created, satu kueri untuk semua kontrak. Bila list sudah besar dan
// Created belum diindeks, SharePoint bisa menolak kueri itu; halaman lalu meminta memilih satu kontrak, yang
// disaring lewat KontrakId (sudah diindeks). Log Admin kecil dan menurut izin list hanya terbaca Admin dan Legal,
// jadi galatnya dilaporkan terpisah tanpa menggagalkan bagian Aktivitas.
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { GraphError, graphSemua } from "../lib/graph";
import { batasPeriodeUtc, dariAktivitas, dariLogAdmin, type EntriJejak } from "../lib/jejakAudit";
import type { Kontrak, Ymd } from "../lib/types";

const ITEMS_AKTIVITAS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.aktivitas}/items`;
const ITEMS_LOG = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.logAdmin}/items`;
const PREFER = { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" };
const KOLOM_AKTIVITAS = "Title,KontrakId,Pesan,StatusDari,StatusKe,OlehEmail,OlehNama,Detail";

interface ItemGraph {
  id: string;
  createdDateTime: string;
  /** Pembuat menurut SharePoint, bukan teks yang ditulis aplikasi. */
  createdBy?: { user?: { displayName?: string; email?: string } };
  fields: Record<string, unknown>;
}

const teks = (v: unknown) => (typeof v === "string" ? v : "");

export interface HasilJejak {
  entri: EntriJejak[];
  /** Galat sumber Aktivitas; null bila berhasil. */
  galatAktivitas: unknown;
  /** Galat Log Admin (mis. 403 karena izin list); null bila berhasil atau tidak dimuat. */
  galatLog: unknown;
  /** Kueri per periode ditolak SharePoint (list besar, Created belum diindeks): pilih satu kontrak. */
  perluPilihKontrak: boolean;
}

export interface PermintaanJejak {
  dari: Ymd;
  sampai: Ymd;
  /** Bila diisi, seluruh riwayat satu kontrak ini (lewat KontrakId yang diindeks), lalu disaring periode di klien. */
  kontrakId?: number | null;
  /** Daftar kontrak untuk nomor dan judul. */
  kontrak: readonly Kontrak[];
}

/** Galat sesi dan jaringan selalu diteruskan: ditangani seperti permintaan lain (pita sesi, pesan luring). */
function galatUmum(err: unknown): boolean {
  return err instanceof GraphError && (err.perluLogin || err.jaringan);
}

async function muatAktivitas(filter: string): Promise<ItemGraph[]> {
  const muat = (expand: string) => graphSemua<ItemGraph>(`${ITEMS_AKTIVITAS}?$expand=${expand}&$top=999&$filter=${filter}`, { headers: PREFER });
  try {
    return await muat(`fields($select=${KOLOM_AKTIVITAS})`);
  } catch (err) {
    // 400 bisa karena $select (kolom belum ada); ulangi sekali dengan semua kolom.
    if (!(err instanceof GraphError && err.status === 400)) throw err;
    return muat("fields");
  }
}

export async function ambilJejak(p: PermintaanJejak): Promise<HasilJejak> {
  const { mulai, akhir } = batasPeriodeUtc(p);
  const filterWaktu = `fields/Created ge '${mulai}' and fields/Created lt '${akhir}'`;
  const peta = new Map(p.kontrak.map((k) => [k.id, { nomor: k.nomorPengajuan, judul: k.judul, nomorKontrak: k.nomorKontrak }]));

  const entri: EntriJejak[] = [];
  let galatAktivitas: unknown = null;
  let perluPilihKontrak = false;

  const [akt, log] = await Promise.allSettled([
    muatAktivitas(p.kontrakId != null ? `fields/KontrakId eq ${p.kontrakId}` : filterWaktu),
    graphSemua<ItemGraph>(`${ITEMS_LOG}?$expand=fields&$top=999&$filter=${filterWaktu}`, { headers: PREFER }),
  ]);

  if (akt.status === "fulfilled") {
    for (const it of akt.value) {
      const f = it.fields;
      const kontrakId = Number(f.KontrakId);
      const e = dariAktivitas(
        {
          id: Number(it.id),
          kontrakId,
          jenis: teks(f.Title),
          pesan: teks(f.Pesan),
          statusDari: teks(f.StatusDari),
          statusKe: teks(f.StatusKe),
          olehNama: teks(f.OlehNama),
          olehEmail: teks(f.OlehEmail),
          dibuatOleh: it.createdBy?.user?.displayName ?? "",
          dibuatOlehEmail: it.createdBy?.user?.email ?? "",
          waktu: it.createdDateTime,
          detail: f.Detail,
        },
        peta.get(kontrakId),
      );
      if (e) entri.push(e);
    }
  } else {
    if (galatUmum(akt.reason)) throw akt.reason;
    galatAktivitas = akt.reason;
    // Kueri per periode yang ditolak (bukan 403/404) hampir selalu karena batas list view tanpa indeks Created.
    perluPilihKontrak = p.kontrakId == null && !(akt.reason instanceof GraphError && (akt.reason.status === 403 || akt.reason.status === 404));
  }

  let galatLog: unknown = null;
  if (log.status === "fulfilled") {
    for (const it of log.value) {
      const f = it.fields;
      entri.push(
        dariLogAdmin({
          id: Number(it.id),
          aksi: teks(f.Title),
          sasaran: teks(f.Sasaran),
          pelakuTeks: teks(f.Pelaku),
          dibuatOleh: it.createdBy?.user?.displayName ?? "",
          dibuatOlehEmail: it.createdBy?.user?.email ?? "",
          waktu: it.createdDateTime,
          detail: teks(f.DetailLog),
        }),
      );
    }
  } else {
    if (galatUmum(log.reason)) throw log.reason;
    galatLog = log.reason;
  }

  return { entri, galatAktivitas, galatLog, perluPilihKontrak };
}
