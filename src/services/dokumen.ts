// Dokumen kontrak di library SharePoint "Berkas Kontrak", satu folder per nomor
// pengajuan. Tiap file membawa metadata (ID Kontrak, Nomor Pengajuan, Jenis Dokumen)
// sehingga bisa disaring dan dicari langsung di SharePoint.
import { GRAPH_SITE_ID, LIST_ID, SITE_URL, URL_LIBRARY_BERKAS } from "../config";
import { graph, GraphError, pesanError } from "../lib/graph";
import { BATAS_UKURAN_BERKAS, bolehHapusDokumen, namaBerkasAman, sepadanEkstensi, teksUkuran, teksVersi, urlVersiLama, validasiBerkas } from "../lib/jenisBerkas";
import { adalahBerkasLembar } from "../lib/lembarReview";
import { hitungSha256 } from "../lib/ttd";
import type { Dokumen, JejakDraftFinal, JenisDokumen, Kontrak, Sesi } from "../lib/types";
import { catatAktivitas } from "./aktivitas";

const DRIVE = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.berkas}/drive`;
const ITEM_KONTRAK = (id: number) => `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.kontrak}/items/${id}/fields`;

// Graph menerima unggahan langsung sampai 4 MB; di atas itu wajib memakai
// upload session yang dikirim per potongan (kelipatan 320 KiB).
const BATAS_UNGGAH_LANGSUNG = 4 * 1024 * 1024;
const UKURAN_POTONGAN = 320 * 1024 * 16; // 5 MiB

const jalur = (...bagian: string[]) => bagian.map((b) => encodeURIComponent(b)).join("/");

interface DriveItem {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  lastModifiedDateTime: string;
  lastModifiedBy?: { user?: { displayName?: string } };
  file?: { mimeType?: string };
  listItem?: { id?: string; fields?: { JenisDokumen?: string } };
  "@microsoft.graph.downloadUrl"?: string;
}

export interface KontrakRef {
  id: number;
  nomorPengajuan: string;
}

/** Dokumen dengan rincian tambahan dari SharePoint. Tetap bisa dipakai di mana pun `Dokumen` diminta. */
export interface DokumenSP extends Dokumen {
  /** ID item list di library (untuk halaman riwayat versi SharePoint). */
  listItemId: string | null;
  tipeMime: string;
}

function keDokumen(d: DriveItem): DokumenSP {
  return {
    id: d.id,
    nama: d.name,
    ukuran: d.size,
    webUrl: d.webUrl,
    unduhUrl: d["@microsoft.graph.downloadUrl"] ?? null,
    diubah: d.lastModifiedDateTime,
    diubahOleh: d.lastModifiedBy?.user?.displayName ?? "",
    jenis: (d.listItem?.fields?.JenisDokumen ?? "") as Dokumen["jenis"],
    listItemId: d.listItem?.id ?? null,
    tipeMime: d.file?.mimeType ?? "",
  };
}

export async function ambilDokumen(nomorPengajuan: string, opsi: { sertakanLembar?: boolean } = {}): Promise<DokumenSP[]> {
  try {
    const res = await graph<{ value: DriveItem[] }>(
      `${DRIVE}/root:/${jalur(nomorPengajuan)}:/children?$top=200&$expand=listItem($expand=fields($select=JenisDokumen))`,
    );
    // Salinan Lembar Hasil Review Legal adalah dokumen internal Legal: hanya ikut bila diminta (Ruang Admin, bukan Pengaju),
    // supaya daftar dokumen, hitungan revisi, dan unduhan arsip untuk pengaju tidak pernah memuatnya.
    return res.value
      .filter((d) => d.file)
      .map(keDokumen)
      .filter((d) => opsi.sertakanLembar || !adalahBerkasLembar(d))
      .sort((a, b) => b.diubah.localeCompare(a.diubah));
  } catch (err) {
    // Folder baru dibuat saat dokumen pertama diunggah.
    if (err instanceof GraphError && err.status === 404) return [];
    throw err;
  }
}

/**
 * Isi satu dokumen sebagai File, untuk dibaca di peramban (mis. dipindai). Tautan unduhan dari daftar bisa
 * kedaluwarsa, jadi daftarnya dibaca ulang tepat sebelum mengunduh. Isinya tidak dikirim ke layanan lain.
 */
export async function ambilBerkasDokumen(nomorPengajuan: string, d: Pick<Dokumen, "id" | "nama">): Promise<File> {
  const segar = (await ambilDokumen(nomorPengajuan)).find((x) => x.id === d.id);
  if (!segar?.unduhUrl) throw new Error("Tautan unduhan dokumen ini tidak tersedia. Coba unduh manual lalu pindai dari komputer.");
  const res = await fetch(segar.unduhUrl);
  if (!res.ok) throw new Error(`Dokumen gagal diambil dari SharePoint (HTTP ${res.status}).`);
  return new File([await res.blob()], d.nama);
}

/** Alamat folder dokumen sebuah kontrak di SharePoint. */
export const urlFolderKontrak = (nomorPengajuan: string) => `${URL_LIBRARY_BERKAS}/${encodeURIComponent(nomorPengajuan)}`;

/** Halaman riwayat versi bawaan SharePoint untuk satu berkas (pulihkan, bandingkan, hapus versi). */
export const urlRiwayatVersiSharePoint = (listItemId: string) =>
  `${SITE_URL}/_layouts/15/Versions.aspx?list=${encodeURIComponent(`{${LIST_ID.berkas}}`)}&ID=${encodeURIComponent(listItemId)}`;

const sudahTertaut = new Set<number>();

/** Simpan tautan folder di kolom "Folder Dokumen" item kontrak (sekali per sesi per kontrak). */
export async function tautkanFolder(k: KontrakRef) {
  if (sudahTertaut.has(k.id)) return;
  sudahTertaut.add(k.id);
  await graph(ITEM_KONTRAK(k.id), {
    method: "PATCH",
    json: { FolderDokumen: { Url: urlFolderKontrak(k.nomorPengajuan), Description: `Folder ${k.nomorPengajuan}` } },
  }).catch(() => sudahTertaut.delete(k.id));
}

/**
 * Simpan tautan kontrak bertanda tangan di kolom KontrakFinal (dipanggil setelah aktivasi berhasil).
 * Pelengkap: tidak melempar galat, cukup melaporkan apakah tersimpan (mis. kolom belum ada di tenant).
 */
export async function simpanKontrakFinal(kontrakId: number, webUrl: string): Promise<boolean> {
  return graph(ITEM_KONTRAK(kontrakId), { method: "PATCH", json: { KontrakFinal: webUrl } }).then(
    () => true,
    () => false,
  );
}

const jeda = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Graph menolak item yang sedang dibuka untuk diedit atau di-check out dengan 423. */
function galatTerkunci(nama: string): GraphError {
  return new GraphError(
    `"${nama}" sedang dikunci di SharePoint: mungkin masih dibuka untuk diedit di Word atau di-check out seseorang. Tutup dulu berkasnya (atau minta rekan menutupnya), lalu coba lagi beberapa saat lagi.`,
    423,
  );
}

/**
 * Kirim isi berkas ke `tujuan` (path Graph tanpa akhiran): langsung bila kecil, lewat upload
 * session bila besar. `konflik` "rename" untuk berkas baru, "replace" untuk versi baru.
 */
async function kirimIsi(tujuan: string, file: File, konflik: "rename" | "replace", onProgres?: (persen: number) => void): Promise<DriveItem> {
  try {
    if (file.size <= BATAS_UNGGAH_LANGSUNG) {
      const item = await graph<DriveItem>(`${tujuan}/content${konflik === "rename" ? "?@microsoft.graph.conflictBehavior=rename" : ""}`, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      onProgres?.(100);
      return item;
    }
    const sesi = await graph<{ uploadUrl: string }>(`${tujuan}/createUploadSession`, {
      method: "POST",
      json: { item: { "@microsoft.graph.conflictBehavior": konflik } },
    });
    let akhirRes: Response | null = null;
    for (let awal = 0; awal < file.size; awal += UKURAN_POTONGAN) {
      const akhir = Math.min(awal + UKURAN_POTONGAN, file.size);
      // uploadUrl sudah membawa otorisasinya sendiri; header Authorization justru ditolak.
      akhirRes = await fetch(sesi.uploadUrl, {
        method: "PUT",
        headers: { "Content-Range": `bytes ${awal}-${akhir - 1}/${file.size}` },
        body: file.slice(awal, akhir),
      });
      if (akhirRes.status === 423) throw galatTerkunci(file.name);
      if (!akhirRes.ok) throw new GraphError(`Gagal mengunggah ${file.name} (HTTP ${akhirRes.status}).`, akhirRes.status);
      onProgres?.(Math.round((akhir / file.size) * 100));
    }
    return (await akhirRes!.json()) as DriveItem;
  } catch (err) {
    if (err instanceof GraphError && err.status === 423) throw galatTerkunci(file.name);
    throw err;
  }
}

export interface HasilUnggah {
  id: string;
  nama: string;
  webUrl: string;
  /** false bila berkas tersimpan tetapi jenis/ID kontrak gagal ditulis (muncul sebagai "Jenis belum diisi"). */
  metadataTersimpan: boolean;
}

/**
 * Unggah satu berkas; nama yang sama tidak ditimpa melainkan diberi nomor.
 * Pengisian metadata dicoba ulang sekali, dan hasilnya dilaporkan (bukan ditelan diam-diam).
 */
export async function unggahDokumen(
  k: KontrakRef,
  file: File,
  jenis: JenisDokumen = "Dokumen Pendukung",
  onProgres?: (persen: number) => void,
): Promise<HasilUnggah> {
  const nama = namaBerkasAman(file.name);
  const item = await kirimIsi(`${DRIVE}/root:/${jalur(k.nomorPengajuan, nama)}:`, file, "rename", onProgres);

  // Item list kadang belum siap tepat setelah unggah; satu kali coba ulang biasanya cukup.
  const isiMetadata = () =>
    graph(`${DRIVE}/items/${item.id}/listItem/fields`, {
      method: "PATCH",
      json: { KontrakId: k.id, NomorPengajuan: k.nomorPengajuan, JenisDokumen: jenis },
    });
  let metadataTersimpan = true;
  try {
    await isiMetadata();
  } catch {
    await jeda(1200);
    metadataTersimpan = await isiMetadata().then(
      () => true,
      () => false,
    );
  }
  await tautkanFolder(k);
  return { id: item.id, nama: item.name, webUrl: item.webUrl, metadataTersimpan };
}

export interface HasilUnggahBanyak {
  berhasil: HasilUnggah[];
  gagal: { nama: string; pesan: string }[];
  aktivitasTercatat: boolean;
}

/**
 * Unggah antrean berkas (chat, formulir, panel) berurutan, lalu catat satu aktivitas.
 * Tidak pernah melempar karena satu berkas gagal: hasil per berkas dilaporkan.
 */
export async function unggahBanyak(
  k: KontrakRef,
  berkas: readonly { file: File; jenis: JenisDokumen }[],
  sesi: Sesi,
  onProgres?: (teks: string, persen: number) => void,
): Promise<HasilUnggahBanyak> {
  const berhasil: HasilUnggah[] = [];
  const rincian: string[] = [];
  const gagal: { nama: string; pesan: string }[] = [];
  for (const [i, b] of berkas.entries()) {
    try {
      const h = await unggahDokumen(k, b.file, b.jenis, (p) => onProgres?.(`Mengunggah ${i + 1} dari ${berkas.length}: ${b.file.name}`, Math.round(((i + p / 100) / berkas.length) * 100)));
      berhasil.push(h);
      rincian.push(`${h.nama} (${b.jenis})`);
    } catch (err) {
      gagal.push({ nama: b.file.name, pesan: pesanError(err) });
    }
  }
  let aktivitasTercatat = true;
  if (berhasil.length) {
    aktivitasTercatat = await catatAktivitas({ kontrakId: k.id, jenis: "Dokumen", pesan: `Mengunggah ${rincian.join(", ")}.` }, sesi).then(
      () => true,
      () => false,
    );
  }
  return { berhasil, gagal, aktivitasTercatat };
}

/** Ganti jenis dokumen (metadata JenisDokumen). Hak diperiksa di pemanggil lewat izinUbahJenis. */
export async function ubahJenisDokumen(id: string, jenis: JenisDokumen): Promise<void> {
  await graph(`${DRIVE}/items/${id}/listItem/fields`, { method: "PATCH", json: { JenisDokumen: jenis } });
}

/**
 * Hapus dokumen (masuk Recycle Bin SharePoint, bisa dipulihkan pemilik site). Jenis dibaca segar
 * dari SharePoint supaya aturan "Kontrak Ditandatangani hanya Admin" tidak bisa dilewati data basi.
 * Alasan wajib dan dicatat di riwayat.
 */
export async function hapusDokumen(k: Kontrak, id: string, alasan: string, sesi: Sesi): Promise<{ nama: string; aktivitasTercatat: boolean }> {
  const bersih = alasan.trim();
  if (bersih.length < 5) throw new Error("Tuliskan alasan penghapusan (minimal 5 karakter).");
  const item = await graph<DriveItem>(`${DRIVE}/items/${id}?$select=id,name,size&$expand=listItem($expand=fields($select=JenisDokumen))`);
  const jenis = (item.listItem?.fields?.JenisDokumen ?? "") as JenisDokumen | "";
  const izin = bolehHapusDokumen(k, jenis, sesi);
  if (!izin.boleh) throw new Error(izin.alasan);
  try {
    await graph(`${DRIVE}/items/${id}`, { method: "DELETE" });
  } catch (err) {
    if (err instanceof GraphError && err.status === 423) throw galatTerkunci(item.name);
    throw err;
  }
  const aktivitasTercatat = await catatAktivitas(
    {
      kontrakId: k.id,
      jenis: "Dokumen",
      pesan: `Menghapus "${item.name}"${jenis ? ` (${jenis})` : ""}. Alasan: ${bersih}`,
      detail: [{ kolom: "Dokumen", dari: item.name, ke: "(dihapus)" }],
    },
    sesi,
  ).then(
    () => true,
    () => false,
  );
  return { nama: item.name, aktivitasTercatat };
}

/** downloadUrl berumur pendek (sekitar 1 jam), jadi diambil baru setiap kali tombol Unduh diklik. */
export async function ambilUnduhSegar(id: string): Promise<string> {
  const item = await graph<DriveItem>(`${DRIVE}/items/${id}?$select=id,name,content.downloadUrl`);
  const url = item["@microsoft.graph.downloadUrl"];
  if (!url) throw new GraphError("Tautan unduh tidak tersedia untuk berkas ini. Coba buka lewat SharePoint.", 404);
  return url;
}

/**
 * Isi berkas sebagai Blob. Memakai downloadUrl yang sudah terotorisasi (tanpa header Authorization):
 * /content membalas 302 ke SharePoint, dan pengalihan itu tidak bisa dibaca fetch dari peramban
 * karena CORS. Ukuran di atas `batas` ditolak sebelum diunduh.
 */
export async function graphBlob(
  id: string,
  opsi: { batas?: number; signal?: AbortSignal; onProgres?: (persen: number) => void } = {},
): Promise<Blob> {
  const item = await graph<DriveItem>(`${DRIVE}/items/${id}?$select=id,name,size,file,content.downloadUrl`);
  if (opsi.batas != null && item.size > opsi.batas) {
    throw new GraphError(`"${item.name}" berukuran ${teksUkuran(item.size)}, di atas batas ${teksUkuran(opsi.batas)}.`, 413);
  }
  const url = item["@microsoft.graph.downloadUrl"];
  if (!url) throw new GraphError(`Isi "${item.name}" tidak bisa diambil. Coba buka lewat SharePoint.`, 404);
  const res = await fetch(url, { signal: opsi.signal });
  if (!res.ok) throw new GraphError(`Gagal mengambil "${item.name}" (HTTP ${res.status}).`, res.status);
  const tipe = item.file?.mimeType || res.headers.get("Content-Type") || "application/octet-stream";
  if (!opsi.onProgres || !res.body || !item.size) {
    const blob = await res.blob();
    opsi.onProgres?.(100);
    return blob.type === tipe ? blob : new Blob([blob], { type: tipe });
  }
  const pembaca = res.body.getReader();
  // Isi respons fetch selalu ArrayBuffer biasa (bukan SharedArrayBuffer).
  const potongan: Uint8Array<ArrayBuffer>[] = [];
  let diterima = 0;
  for (;;) {
    const { done, value } = await pembaca.read();
    if (done) break;
    potongan.push(value as Uint8Array<ArrayBuffer>);
    diterima += value.byteLength;
    opsi.onProgres(Math.min(100, Math.round((diterima / item.size) * 100)));
  }
  return new Blob(potongan, { type: tipe });
}

/**
 * Unggah versi baru untuk dokumen yang sudah ada (isi ditimpa, SharePoint menyimpan versi lama
 * bila versioning library aktif). Metadata jenis tetap melekat pada item.
 */
export async function unggahVersiBaru(
  k: KontrakRef,
  dokumenId: string,
  file: File,
  onProgres?: (persen: number) => void,
): Promise<{ id: string; nama: string; webUrl: string; versi: string | null }> {
  const item = await kirimIsi(`${DRIVE}/items/${dokumenId}`, file, "replace", onProgres);
  const versi = await ambilVersi(dokumenId).then(
    (v) => v[0]?.label ?? null,
    () => null,
  );
  await tautkanFolder(k);
  return { id: item.id, nama: item.name, webUrl: item.webUrl, versi };
}

export interface HasilRedline {
  nama: string;
  webUrl: string;
  /** Label versi baru (mis. "v3") bila diunggah sebagai versi; null bila menjadi dokumen baru. */
  versi: string | null;
  /** Nama dokumen yang mendapat versi baru, atau null bila redline menjadi dokumen baru. */
  tujuan: string | null;
  aktivitasTercatat: boolean;
}

/**
 * Lampiran redline di "Minta Revisi" (U15): diunggah sebagai versi baru dokumen `tujuan` (riwayat versinya tetap
 * utuh di SharePoint), atau sebagai dokumen baru berjenis Draft Kontrak bila belum ada dokumen yang cocok.
 * Ekstensi harus sama dengan dokumen tujuan, supaya .docx tidak tertimpa isi PDF. Dicatat di riwayat.
 */
export async function unggahRedline(
  k: Kontrak,
  file: File,
  tujuan: Pick<Dokumen, "id" | "nama"> | null,
  sesi: Sesi,
  onProgres?: (persen: number) => void,
): Promise<HasilRedline> {
  const tolak = validasiBerkas(file.name, file.size);
  if (tolak) throw new Error(tolak);
  if (tujuan && !sepadanEkstensi(tujuan.nama, file.name)) {
    throw new Error(`"${file.name}" berbeda jenis berkas dengan "${tujuan.nama}". Pilih "Sebagai dokumen baru", atau unggah berkas yang sejenis.`);
  }
  let hasil: Omit<HasilRedline, "aktivitasTercatat">;
  if (tujuan) {
    const h = await unggahVersiBaru(k, tujuan.id, file, onProgres);
    hasil = { nama: h.nama, webUrl: h.webUrl, versi: h.versi ? teksVersi(h.versi) : null, tujuan: tujuan.nama };
  } else {
    const h = await unggahDokumen(k, file, "Draft Kontrak", onProgres);
    hasil = { nama: h.nama, webUrl: h.webUrl, versi: null, tujuan: null };
  }
  const pesan = hasil.tujuan
    ? `Melampirkan redline revisi sebagai versi baru${hasil.versi ? ` (${hasil.versi})` : ""} dari "${hasil.tujuan}".`
    : `Melampirkan redline revisi "${hasil.nama}" (Draft Kontrak).`;
  const aktivitasTercatat = await catatAktivitas({ kontrakId: k.id, jenis: "Dokumen", pesan }, sesi).then(
    () => true,
    () => false,
  );
  return { ...hasil, aktivitasTercatat };
}

/**
 * Sidik draft final (U21): unduh isi berkas lalu hitung SHA-256-nya di peramban. Tidak melempar: bila isi tidak
 * bisa diambil, jejak tetap dikembalikan dengan sha256 kosong beserta alasannya.
 */
export async function sidikDraftFinal(d: Pick<Dokumen, "id" | "nama" | "ukuran">, sesi: Sesi): Promise<{ jejak: JejakDraftFinal; alasan?: string }> {
  const dasar: JejakDraftFinal = { dokumenId: d.id, nama: d.nama, ukuran: d.ukuran, sha256: "", waktu: new Date().toISOString(), oleh: sesi.nama };
  try {
    const blob = await graphBlob(d.id, { batas: BATAS_UKURAN_BERKAS });
    return { jejak: { ...dasar, ukuran: blob.size || d.ukuran, sha256: await hitungSha256(await blob.arrayBuffer()) } };
  } catch (err) {
    return { jejak: dasar, alasan: pesanError(err) };
  }
}

interface VersiGraph {
  id: string;
  lastModifiedDateTime: string;
  lastModifiedBy?: { user?: { displayName?: string } };
  size?: number;
}

export interface VersiDokumen {
  /** Label SharePoint, mis. "3.0". */
  label: string;
  /** Untuk tampilan, mis. "v3". */
  teks: string;
  diubah: string;
  oleh: string;
  ukuran: number | null;
  terkini: boolean;
  /** Tautan buka/unduh versi itu, atau null bila tidak bisa disusun. */
  url: string | null;
}

/**
 * Riwayat versi dari /versions, terbaru di atas. Tanpa `berkas`, tautan versi lama tidak disusun.
 * Library tanpa versioning hanya mengembalikan satu versi (versi sekarang).
 */
export async function ambilVersi(dokumenId: string, berkas?: { folder: string; nama: string; webUrl: string }): Promise<VersiDokumen[]> {
  const res = await graph<{ value: VersiGraph[] }>(`${DRIVE}/items/${dokumenId}/versions`);
  const urut = [...res.value].sort((a, b) => b.lastModifiedDateTime.localeCompare(a.lastModifiedDateTime));
  return urut.map((v, i) => ({
    label: v.id,
    teks: teksVersi(v.id),
    diubah: v.lastModifiedDateTime,
    oleh: v.lastModifiedBy?.user?.displayName ?? "",
    ukuran: typeof v.size === "number" ? v.size : null,
    terkini: i === 0,
    url: !berkas ? null : i === 0 ? berkas.webUrl : urlVersiLama(SITE_URL, URL_LIBRARY_BERKAS, berkas.folder, berkas.nama, v.id),
  }));
}

// --- Berkas pendukung di library (bukti tanda tangan, TTD tersimpan) ---------------------------------------
// Berkas ini tidak muncul di daftar dokumen kontrak: ambilDokumen hanya membaca berkas langsung di folder
// kontrak, sedangkan bukti disimpan di subfolder "TTD" dan TTD tersimpan di folder "_TTD Tersimpan".

/** Unggah berkas ke jalur bebas di library (folder perantara dibuat otomatis). `timpa` mengganti berkas bernama sama. */
export async function unggahBerkasJalur(segmen: readonly string[], file: File, timpa = false): Promise<{ id: string; nama: string; webUrl: string }> {
  const item = await kirimIsi(`${DRIVE}/root:/${jalur(...segmen)}:`, file, timpa ? "replace" : "rename");
  return { id: item.id, nama: item.name, webUrl: item.webUrl };
}

/** ID dan ukuran berkas di jalur itu, atau null bila belum ada. */
export async function cariBerkasJalur(segmen: readonly string[]): Promise<{ id: string; nama: string; diubah: string } | null> {
  try {
    const d = await graph<DriveItem>(`${DRIVE}/root:/${jalur(...segmen)}:?$select=id,name,lastModifiedDateTime`);
    return { id: d.id, nama: d.name, diubah: d.lastModifiedDateTime };
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return null;
    throw err;
  }
}

/** Hapus satu berkas library (masuk Recycle Bin SharePoint). 404 dianggap sudah beres. */
export async function hapusBerkasId(id: string): Promise<void> {
  try {
    await graph(`${DRIVE}/items/${id}`, { method: "DELETE" });
  } catch (err) {
    if (!(err instanceof GraphError && err.status === 404)) throw err;
  }
}
