// List "Aktivitas Kontrak": riwayat status, komentar, perubahan, dan dokumen.
//
// Kolom Detail ditulis sebagai JSON berversi {v, ubah: [{kolom, dari, ke}]} (U31); pembacanya (uraiDetail)
// menerima juga bentuk lama berupa larik.
//
// Kolom ringkasan (U23a): RingkasAntrean, Nilai, Prioritas, TargetSelesai, JumlahDokumen. Diisi untuk aktivitas
// Dibuat dan Status supaya flow dan laporan bisa membaca keadaan saat kejadian tanpa memuat list Kontrak. Kolom
// itu boleh belum dibuat di tenant: bila Graph menolaknya (400), aktivitas tetap dicatat tanpa kolom tersebut dan
// aplikasi berhenti mengirimnya selama sesi ini.
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { galatSementara, ulangiPenulisan } from "../lib/cobaUlang";
import { dariYmd } from "../lib/format";
import { GraphError, graph, graphSemua } from "../lib/graph";
import { bungkusDetail, uraiDetail } from "../lib/jejakAudit";
import type { Aktivitas, DetailPerubahan, JenisAktivitas, Prioritas, Sesi, Ymd } from "../lib/types";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.aktivitas}/items`;

interface ItemGraph {
  id: string;
  createdDateTime: string;
  fields: Record<string, unknown>;
}

const teks = (v: unknown) => (typeof v === "string" ? v : "");

export async function ambilAktivitas(kontrakId: number): Promise<Aktivitas[]> {
  // KontrakId diindeks di SharePoint, jadi filter ini tetap cepat saat list membesar.
  const items = await graphSemua<ItemGraph>(
    `${ITEMS}?$expand=fields&$top=999&$filter=fields/KontrakId eq ${kontrakId}`,
    { headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" } },
  );
  return items
    .map((it) => ({
      id: Number(it.id),
      kontrakId: Number(it.fields.KontrakId),
      jenis: (teks(it.fields.Title) || "Komentar") as JenisAktivitas,
      pesan: teks(it.fields.Pesan),
      statusDari: teks(it.fields.StatusDari),
      statusKe: teks(it.fields.StatusKe),
      olehEmail: teks(it.fields.OlehEmail),
      olehNama: teks(it.fields.OlehNama),
      waktu: it.createdDateTime,
      detail: uraiDetail(it.fields.Detail),
      disebut: teks(it.fields.Disebut)
        .split(/[;,]/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    }))
    // Terbaru dulu. "Dibuat" selalu paling akhir (awal riwayat): sejak U23a ia dicatat SESUDAH unggahan dokumen
    // pengajuan, jadi waktunya bisa sedikit lebih baru dari catatan "Dokumen" pertama.
    .sort((a, b) => Number(a.jenis === "Dibuat") - Number(b.jenis === "Dibuat") || b.waktu.localeCompare(a.waktu));
}

/** Keadaan kontrak saat kejadian, untuk kolom ringkasan Aktivitas (U23a). Isian kosong tidak ditulis. */
export interface RingkasAktivitas {
  /** Mis. "Antrean ke-3 dari 8 di Legal". */
  ringkasAntrean?: string;
  nilai?: number | null;
  prioritas?: Prioritas;
  targetSelesai?: Ymd | null;
  jumlahDokumen?: number | null;
}

export interface AktivitasBaru {
  kontrakId: number;
  jenis: JenisAktivitas;
  pesan: string;
  statusDari?: string;
  statusKe?: string;
  detail?: DetailPerubahan[];
  disebut?: string[];
  ringkas?: RingkasAktivitas;
}

function kolomRingkas(r: RingkasAktivitas | undefined): Record<string, unknown> {
  if (!r) return {};
  const f: Record<string, unknown> = {};
  if (r.ringkasAntrean?.trim()) f.RingkasAntrean = r.ringkasAntrean.trim().slice(0, 250);
  if (typeof r.nilai === "number" && Number.isFinite(r.nilai)) f.Nilai = r.nilai;
  if (r.prioritas) f.Prioritas = r.prioritas;
  if (r.targetSelesai) f.TargetSelesai = dariYmd(r.targetSelesai);
  if (typeof r.jumlahDokumen === "number" && r.jumlahDokumen >= 0) f.JumlahDokumen = Math.floor(r.jumlahDokumen);
  return f;
}

/** false setelah Graph menolak kolom ringkasan (belum dibuat di tenant): sisa sesi mencatat tanpa kolom itu. */
let pakaiKolomRingkas = true;

/**
 * Catat satu aktivitas. Galat sementara (luring, SharePoint sibuk) dicoba ulang sampai 3 kali sebelum dilempar,
 * jadi pemanggil cukup menampilkan peringatan bila tetap gagal.
 */
export async function catatAktivitas(a: AktivitasBaru, sesi: Pick<Sesi, "email" | "nama">): Promise<void> {
  const dasar: Record<string, unknown> = {
    Title: a.jenis,
    KontrakId: a.kontrakId,
    Pesan: a.pesan,
    StatusDari: a.statusDari ?? "",
    StatusKe: a.statusKe ?? "",
    OlehEmail: sesi.email,
    OlehNama: sesi.nama,
    ...(a.detail?.length ? { Detail: bungkusDetail(a.detail) } : {}),
    ...(a.disebut?.length ? { Disebut: a.disebut.join(";") } : {}),
  };
  const ringkas = pakaiKolomRingkas ? kolomRingkas(a.ringkas) : {};
  const kirim = (fields: Record<string, unknown>) =>
    ulangiPenulisan(() => graph(ITEMS, { method: "POST", json: { fields } }), { bolehUlang: (err) => galatSementara(err, "catatan") });

  if (Object.keys(ringkas).length === 0) {
    await kirim(dasar);
    return;
  }
  try {
    await kirim({ ...dasar, ...ringkas });
  } catch (err) {
    if (!(err instanceof GraphError && err.status === 400)) throw err;
    pakaiKolomRingkas = false;
    console.warn("Kolom ringkasan Aktivitas belum ada; aktivitas dicatat tanpa kolom itu:", Object.keys(ringkas).join(", "), err);
    await kirim(dasar);
  }
}
