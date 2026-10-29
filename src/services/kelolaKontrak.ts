// Mengelola siklus akhir sebuah kontrak: arsip (disembunyikan tetapi tetap tersimpan) dan hapus permanen.
//
// Arsip: kolom Diarsipkan di list Kontrak. Kontrak yang diarsipkan keluar dari daftar kerja (lihat muatDaftar di
// services/kontrak.ts) dan muncul di halaman Arsip; bisa dipulihkan kapan saja. Dicatat di riwayat.
//
// Hapus permanen (khusus Admin): menghapus item Kontrak beserta folder dokumennya dan baris terkait di list
// Aktivitas, Jaminan, Kewajiban, Kasus, dan Masukan. Semua penghapusan lewat Graph masuk Recycle Bin SharePoint
// (93 hari), jadi masih bisa dipulihkan lewat SharePoint bila terlanjur. Jejaknya ditulis ke Log Admin LEBIH DULU;
// bila log gagal, tidak ada yang dihapus. Antrean email di list Notifikasi sengaja dibiarkan sebagai catatan kirim.
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { GraphError, graph, graphSemua } from "../lib/graph";
import type { Kontrak, Sesi } from "../lib/types";
import { catatAktivitas } from "./aktivitas";
import { catatLogAdmin } from "./pengaturan";
import { ambilKontrakArsip, ambilSemuaKontrak, kosongkanCacheKontrak } from "./kontrak";

const ITEMS_KONTRAK = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.kontrak}/items`;
const PREFER = { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" };

/** List yang barisnya menaut ke kontrak lewat kolom KontrakId, dengan nama yang tampil di layar. */
const LIST_TERKAIT = [
  { kunci: "aktivitas", label: "catatan riwayat", id: LIST_ID.aktivitas },
  { kunci: "jaminan", label: "jaminan", id: LIST_ID.jaminan },
  { kunci: "kewajiban", label: "kewajiban", id: LIST_ID.kewajiban },
  { kunci: "kasus", label: "kasus", id: LIST_ID.kasus },
  { kunci: "masukan", label: "permintaan masukan", id: LIST_ID.masukan },
] as const;

export const BATAS_ALASAN_ARSIP = 5;
export const BATAS_ALASAN_HAPUS = 10;

const urlList = (id: string) => `/sites/${GRAPH_SITE_ID}/lists/${id}/items`;
const urlFolder = (nomor: string) => `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.berkas}/drive/root:/${encodeURIComponent(nomor)}`;

// --- Arsip -----------------------------------------------------------------------------------------

export const bolehArsipkan = (sesi: Pick<Sesi, "peran">): boolean => sesi.peran === "Admin" || sesi.peran === "Legal";
export const bolehHapusPermanen = (sesi: Pick<Sesi, "peran">): boolean => sesi.peran === "Admin";

function alasanSah(alasan: string, batas: number): string {
  const bersih = alasan.trim();
  if (bersih.length < batas) throw new Error(`Tuliskan alasannya (minimal ${batas} karakter).`);
  return bersih;
}

export async function arsipkanKontrak(k: Kontrak, alasan: string, sesi: Sesi): Promise<void> {
  if (!bolehArsipkan(sesi)) throw new Error("Hanya Admin dan Legal yang bisa mengarsipkan kontrak.");
  const bersih = alasanSah(alasan, BATAS_ALASAN_ARSIP);
  await graph(`${ITEMS_KONTRAK}/${k.id}/fields`, { method: "PATCH", json: { Diarsipkan: true } });
  kosongkanCacheKontrak();
  await catatAktivitas({ kontrakId: k.id, jenis: "Arsip", pesan: `Kontrak diarsipkan. Alasan: ${bersih}` }, sesi).catch(() => undefined);
}

export async function pulihkanDariArsip(k: Kontrak, sesi: Sesi): Promise<void> {
  if (!bolehArsipkan(sesi)) throw new Error("Hanya Admin dan Legal yang bisa memulihkan kontrak dari arsip.");
  await graph(`${ITEMS_KONTRAK}/${k.id}/fields`, { method: "PATCH", json: { Diarsipkan: false } });
  kosongkanCacheKontrak();
  await catatAktivitas({ kontrakId: k.id, jenis: "Arsip", pesan: "Kontrak dipulihkan dari arsip dan kembali tampil di daftar." }, sesi).catch(() => undefined);
}

// --- Hapus permanen --------------------------------------------------------------------------------

export interface DampakHapus {
  /** Jumlah berkas di folder dokumen kontrak (0 bila folder belum ada). */
  dokumen: number;
  /** Jumlah baris per list terkait, urut seperti LIST_TERKAIT. */
  baris: { kunci: string; label: string; jumlah: number }[];
  /** Kontrak lain yang bergantung padanya (addendum, kontrak turunan MoU); selama ada, penghapusan ditolak. */
  bergantung: Pick<Kontrak, "id" | "nomorPengajuan" | "judul">[];
}

async function idBaris(listId: string, kontrakId: number): Promise<string[]> {
  const items = await graphSemua<{ id: string }>(`${urlList(listId)}?$select=id&$top=999&$filter=fields/KontrakId eq ${kontrakId}`, { headers: PREFER });
  return items.map((i) => i.id);
}

async function jumlahBerkas(nomor: string): Promise<number> {
  try {
    const res = await graph<{ value: unknown[] }>(`${urlFolder(nomor)}:/children?$top=200&$select=id`);
    return res.value.length;
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return 0;
    throw err;
  }
}

async function kontrakBergantung(k: Kontrak): Promise<DampakHapus["bergantung"]> {
  const [kerja, arsip] = await Promise.all([ambilSemuaKontrak(), ambilKontrakArsip()]);
  return [...kerja, ...arsip].filter((x) => x.id !== k.id && (x.kontrakIndukId === k.id || x.mouAcuanId === k.id)).map(({ id, nomorPengajuan, judul }) => ({ id, nomorPengajuan, judul }));
}

/** Apa saja yang akan ikut terhapus, untuk ditampilkan sebelum Admin mengonfirmasi. */
export async function hitungDampakHapus(k: Kontrak): Promise<DampakHapus> {
  const [dokumen, bergantung, ...ids] = await Promise.all([jumlahBerkas(k.nomorPengajuan), kontrakBergantung(k), ...LIST_TERKAIT.map((l) => idBaris(l.id, k.id))]);
  return { dokumen, bergantung, baris: LIST_TERKAIT.map((l, i) => ({ kunci: l.kunci, label: l.label, jumlah: ids[i]!.length })) };
}

/** Hapus daftar item list dengan paralelisme kecil supaya tidak membebani Graph. */
async function hapusBanyak(listId: string, ids: readonly string[], saatSatu: () => void) {
  for (let i = 0; i < ids.length; i += 4) {
    await Promise.all(
      ids.slice(i, i + 4).map(async (id) => {
        try {
          await graph(`${urlList(listId)}/${id}`, { method: "DELETE" });
        } catch (err) {
          if (!(err instanceof GraphError && err.status === 404)) throw err; // sudah terhapus: tidak apa-apa
        }
        saatSatu();
      }),
    );
  }
}

export interface HasilHapus {
  dokumenDihapus: boolean;
  barisDihapus: number;
}

/**
 * Hapus permanen satu kontrak. Hanya Admin. `konfirmasiNomor` harus sama dengan nomor pengajuan (ketik ulang
 * di dialog). Idempoten: bila gagal di tengah, mengulang melanjutkan sisanya.
 */
export async function hapusKontrakPermanen(
  k: Kontrak,
  alasan: string,
  konfirmasiNomor: string,
  sesi: Sesi,
  onProgres?: (selesai: number, total: number, langkah: string) => void,
): Promise<HasilHapus> {
  if (!bolehHapusPermanen(sesi)) throw new Error("Hanya Admin yang bisa menghapus kontrak secara permanen.");
  const bersih = alasanSah(alasan, BATAS_ALASAN_HAPUS);
  if (konfirmasiNomor.trim() !== k.nomorPengajuan) throw new Error(`Ketik nomor pengajuan ${k.nomorPengajuan} persis untuk mengonfirmasi.`);

  const dampak = await hitungDampakHapus(k);
  if (dampak.bergantung.length > 0) {
    const daftar = dampak.bergantung.map((x) => x.nomorPengajuan).join(", ");
    throw new Error(`Kontrak ini punya addendum atau kontrak turunan (${daftar}). Hapus atau arsipkan itu dulu, atau arsipkan kontrak ini saja.`);
  }

  // Jejak ditulis lebih dulu: tanpa catatan yang tersimpan, tidak ada yang dihapus.
  await catatLogAdmin(
    {
      aksi: "Hapus permanen kontrak",
      sasaran: k.nomorPengajuan,
      detail: {
        id: k.id,
        judul: k.judul,
        status: k.status,
        mitra: k.mitra,
        nilai: k.nilai,
        alasan: bersih,
        dihapus: { dokumen: dampak.dokumen, ...Object.fromEntries(dampak.baris.map((b) => [b.kunci, b.jumlah])) },
      },
    },
    sesi,
  );

  const idPerList = await Promise.all(LIST_TERKAIT.map((l) => idBaris(l.id, k.id)));
  const total = idPerList.reduce((a, d) => a + d.length, 0) + 2; // baris terkait + folder dokumen + item kontrak
  let selesai = 0;
  const maju = (langkah: string) => onProgres?.(++selesai, total, langkah);

  let barisDihapus = 0;
  for (let i = 0; i < LIST_TERKAIT.length; i++) {
    const l = LIST_TERKAIT[i]!;
    await hapusBanyak(l.id, idPerList[i]!, () => {
      barisDihapus++;
      maju(`Menghapus ${l.label}`);
    });
  }

  let dokumenDihapus = false;
  try {
    await graph(urlFolder(k.nomorPengajuan), { method: "DELETE" });
    dokumenDihapus = true;
  } catch (err) {
    if (!(err instanceof GraphError && err.status === 404)) throw err;
  }
  maju("Menghapus folder dokumen");

  await graph(`${ITEMS_KONTRAK}/${k.id}`, { method: "DELETE" });
  maju("Menghapus kontrak");
  kosongkanCacheKontrak();
  return { dokumenDihapus, barisDihapus };
}
