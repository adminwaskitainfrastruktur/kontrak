// Lembar Hasil Review Legal di SharePoint (lib/lembarReview): satu kolom JSON berversi pada item Kontrak.
//
// Kolom (list Kontrak):
//   LembarReview  teks beberapa baris (plain, tanpa batas 255): seluruh putaran review. Hanya dibaca Legal/Admin/Pemantau.
//   HasilReview   teks beberapa baris (plain): ringkasan kecil untuk pengaju (kesimpulan dan catatan untuknya, tanpa
//                 penilaian risiko internal). Pengaju hanya membaca kolom ini, tidak pernah LembarReview.
//
// Kolom yang belum dibuat tidak menjatuhkan halaman: membaca tanpa kolom menghasilkan "belum ada lembar", dan menulis
// melaporkan nama kolom yang perlu dibuat. Salinan .docx disimpan di library Berkas Kontrak dengan jenis "Lembar Review Legal".
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { BATAS_UKURAN_EKSTRAK, ekstrakTeks, jenisBerkasDari } from "../lib/ekstrak";
import { GraphError, graph } from "../lib/graph";
import {
  JENIS_LEMBAR,
  bungkusHasilPengaju,
  bungkusLembar,
  hasilPengajuTerkini,
  namaBerkasLembar,
  pangkasLembar,
  ringkasHasilPindai,
  simpanPutaran,
  uraiHasilPengaju,
  uraiLembar,
  type DataOtomatis,
  type HasilReviewPengaju,
  type LembarReview,
  type PutaranReview,
  type RingkasPindai,
} from "../lib/lembarReview";
import { MIME_DOCX_LEMBAR, buatLembarDocx, susunDokumenLembar } from "../lib/lembarDokumen";
import { pindaiDraf } from "../lib/pemindai";
import { pilihDraftTerbaru } from "../lib/saranChecklist";
import type { Dokumen, Kontrak, Sesi } from "../lib/types";
import { catatAktivitas } from "./aktivitas";
import { ambilBerkasDokumen, ambilDokumen, ambilVersi, unggahDokumen, unggahVersiBaru } from "./dokumen";
import { kosongkanCacheKontrak } from "./kontrak";

const FIELDS = (id: number) => `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.kontrak}/items/${id}/fields`;

/** Lembar dibaca, atau kolomnya memang belum dibuat di list Kontrak. */
export interface BacaanLembar {
  lembar: LembarReview | null;
  /** false bila Graph menolak kolom LembarReview (belum dibuat): lembar tidak bisa disimpan sebelum kolomnya ada. */
  kolomAda: boolean;
}

/** Nama kolom list Kontrak, dibaca sekali per sesi (dan diulang selama kolom LembarReview belum ada, supaya kolom yang baru dibuat langsung terdeteksi). */
let kolomDiketahui: Promise<Set<string> | null> | null = null;
function namaKolomKontrak(): Promise<Set<string> | null> {
  kolomDiketahui ??= graph<{ value: { name: string }[] }>(`/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.kontrak}/columns?$select=name&$top=500`).then(
    (r) => new Set(r.value.map((c) => c.name)),
    () => null,
  );
  return kolomDiketahui;
}

export async function bacaLembar(kontrakId: number): Promise<BacaanLembar> {
  let f: Record<string, unknown>;
  try {
    f = await graph<Record<string, unknown>>(`${FIELDS(kontrakId)}?$select=LembarReview`);
  } catch (err) {
    if (err instanceof GraphError && err.status === 400) {
      kolomDiketahui = null;
      return { lembar: null, kolomAda: false };
    }
    throw err;
  }
  if (f.LembarReview !== undefined) return { lembar: uraiLembar(f.LembarReview), kolomAda: true };
  // Kolom kosong atau tidak ada: SharePoint tidak membedakannya di sini, jadi cek daftar kolom. Daftar kolom tak terbaca = anggap ada.
  const kolom = await namaKolomKontrak();
  const ada = kolom ? kolom.has("LembarReview") : true;
  if (!ada) kolomDiketahui = null;
  return { lembar: null, kolomAda: ada };
}

/** Ringkasan untuk pengaju. Galat apa pun (kolom belum ada, jaringan) berarti "tidak ada hasil", tanpa mengganggu halaman. */
export async function bacaHasilReview(kontrakId: number): Promise<HasilReviewPengaju | null> {
  try {
    const f = await graph<Record<string, unknown>>(`${FIELDS(kontrakId)}?$select=HasilReview`);
    return uraiHasilPengaju(f.HasilReview);
  } catch {
    return null;
  }
}

/** Lembar diubah rekan sejak dibuka. `segar` berisi isi terbaru untuk ditampilkan ulang. */
export class GalatKonflikLembar extends Error {
  constructor(
    pesan: string,
    readonly segar: LembarReview | null,
  ) {
    super(pesan);
    this.name = "GalatKonflikLembar";
  }
}

export interface HasilSimpanLembar {
  lembar: LembarReview;
  /** Putaran yang baru disimpan, dengan rev dan waktu ubah terbarunya. */
  putaran: PutaranReview;
  /** false bila ringkasan untuk pengaju (kolom HasilReview) belum tersimpan, mis. kolomnya belum dibuat. */
  ringkasTersimpan: boolean;
  /** Nomor putaran lama yang dipadatkan supaya muat di kolom. */
  dipadatkan: number[];
}

/**
 * Simpan satu putaran. Lembar dibaca ulang lebih dulu supaya putaran lain tidak tertimpa, dan bila rev putaran ini di
 * server berbeda dari yang dibuka pengguna (`basisRev`; null untuk putaran baru), dilempar GalatKonflikLembar kecuali `paksa`.
 */
export async function simpanLembar(kontrakId: number, putaran: PutaranReview, basisRev: number | null, opsi: { paksa?: boolean } = {}): Promise<HasilSimpanLembar> {
  const { lembar: segar, kolomAda } = await bacaLembar(kontrakId);
  if (!kolomAda) throw new Error("Lembar belum bisa disimpan: kolom LembarReview (teks beberapa baris) belum dibuat di list Kontrak.");
  const ada = segar?.putaran.find((p) => p.id === putaran.id);
  if (!opsi.paksa && ada && ada.rev !== basisRev) {
    throw new GalatKonflikLembar(`Lembar putaran ${putaran.nomor} baru saja diubah rekan Legal${ada.olehNama ? ` (${ada.olehNama})` : ""}. Muat versi terbaru dulu supaya tidak saling menimpa.`, segar);
  }
  const gabung = simpanPutaran(segar, putaran, new Date().toISOString());
  const pangkas = pangkasLembar(gabung);
  if (!pangkas.muat) {
    throw new Error("Lembar terlalu panjang untuk disimpan di kolom SharePoint. Ringkas isian terpanjang (mis. isu atau usulan), atau simpan salinan .docx lalu kosongkan sebagian temuan yang sudah beres.");
  }
  const hasil = hasilPengajuTerkini(pangkas.lembar);

  const tulis = (f: Record<string, unknown>) => graph(FIELDS(kontrakId), { method: "PATCH", json: f });
  let ringkasTersimpan = true;
  try {
    await tulis({ LembarReview: bungkusLembar(pangkas.lembar), HasilReview: bungkusHasilPengaju(hasil) });
  } catch (err) {
    if (!(err instanceof GraphError && err.status === 400)) throw err;
    // Kolom HasilReview kemungkinan belum ada: simpan lembarnya saja.
    ringkasTersimpan = false;
    try {
      await tulis({ LembarReview: bungkusLembar(pangkas.lembar) });
    } catch (err2) {
      if (err2 instanceof GraphError && err2.status === 400) {
        throw new Error("Lembar belum bisa disimpan: Graph menolak kolom LembarReview. Pastikan kolomnya bertipe teks beberapa baris (plain, tanpa batas 255).");
      }
      throw err2;
    }
  }
  kosongkanCacheKontrak();
  const tersimpan = pangkas.lembar.putaran.find((p) => p.id === putaran.id)!;
  return { lembar: pangkas.lembar, putaran: tersimpan, ringkasTersimpan, dipadatkan: pangkas.dipadatkan };
}

/** Catatan di riwayat aktivitas; tidak pernah melempar. Isinya tanpa penilaian risiko, karena pengaju membaca riwayat. */
export async function catatRiwayatLembar(kontrakId: number, pesan: string, sesi: Sesi, jenis: "Perubahan" | "Dokumen" = "Perubahan"): Promise<boolean> {
  return catatAktivitas({ kontrakId, jenis, pesan }, sesi).then(
    () => true,
    (err) => {
      console.warn("Aktivitas lembar gagal dicatat:", err);
      return false;
    },
  );
}

// --- Data yang diambil dari sistem -------------------------------------------------------------

/** Label versi SharePoint ("3.0" menjadi "v3") draft terbaru, untuk "dokumen yang direview beserta versinya". Galat diabaikan. */
export async function bacaVersiDraft(dokumen: readonly Dokumen[], maks = 4): Promise<Record<string, string>> {
  const draft = [...dokumen]
    .filter((d) => d.jenis === "Draft Kontrak" || d.jenis === "Draft Final")
    .sort((a, b) => b.diubah.localeCompare(a.diubah))
    .slice(0, maks);
  const hasil: Record<string, string> = {};
  await Promise.all(
    draft.map(async (d) => {
      try {
        const v = await ambilVersi(d.id);
        if (v[0]) hasil[d.id] = v[0].teks;
      } catch {
        /* versi tidak terbaca (library tanpa versioning): dilewati */
      }
    }),
  );
  return hasil;
}

export interface HasilPindaiLembar {
  ringkas: RingkasPindai;
}

/** Pindai draf terbaru (PDF atau DOCX) di peramban, lalu ringkas hasilnya untuk lembar. Isi dokumen tidak keluar dari peramban. */
export async function pindaiDrafUntukLembar(
  k: Pick<Kontrak, "nomorPengajuan" | "judul" | "mitra" | "nilai" | "mataUang" | "tanggalMulai" | "tanggalBerakhir" | "jenis">,
): Promise<HasilPindaiLembar> {
  const daftar = await ambilDokumen(k.nomorPengajuan);
  const draf = pilihDraftTerbaru(daftar, (nama) => {
    const j = jenisBerkasDari(nama);
    return j === "pdf" || j === "docx";
  });
  if (!draf) throw new Error("Belum ada draf (Draft Kontrak atau Draft Final) berformat DOCX atau PDF. Unggah drafnya dulu.");
  if (draf.ukuran > BATAS_UKURAN_EKSTRAK) throw new Error(`${draf.nama} melebihi batas baca 30 MB, jadi tidak bisa dipindai.`);
  const berkas = await ambilBerkasDokumen(k.nomorPengajuan, draf);
  const ekstrak = await ekstrakTeks(berkas);
  const waktu = new Date().toISOString();
  if (!ekstrak.terbaca) {
    return { ringkas: { nama: draf.nama, waktu, terbaca: false, klausul: [], penanda: 0, selisih: [] } };
  }
  const hasil = pindaiDraf(ekstrak.teks, { judul: k.judul, mitra: k.mitra, nilai: k.nilai, mataUang: k.mataUang, tanggalMulai: k.tanggalMulai, tanggalBerakhir: k.tanggalBerakhir, jenis: k.jenis });
  return { ringkas: ringkasHasilPindai(hasil, draf.nama, waktu) };
}

// --- Salinan .docx di library Berkas Kontrak ------------------------------------------------------

export interface HasilSalinan {
  nama: string;
  webUrl: string;
  /** false bila berkas tersimpan tetapi jenisnya belum tercatat (pilihan "Lembar Review Legal" belum ada di kolom JenisDokumen). */
  jenisTercatat: boolean;
}

/** Rakit lembar menjadi .docx. Dipakai unduhan dan simpan salinan. */
export async function rakitLembarDocx(k: Pick<Kontrak, "nomorPengajuan" | "judul">, p: PutaranReview, data: DataOtomatis): Promise<{ blob: Blob; nama: string }> {
  const nama = namaBerkasLembar(k, p.nomor);
  const blob = await buatLembarDocx(susunDokumenLembar(p, data), nama.replace(/\.docx$/i, ""));
  return { blob, nama };
}

/**
 * Simpan salinan .docx ke library Berkas Kontrak sebagai dokumen berjenis "Lembar Review Legal". Salinan yang sudah ada
 * untuk putaran ini diberi versi baru (riwayat versi SharePoint menyimpan yang lama), bukan berkas ganda.
 */
export async function simpanSalinanLembar(k: Kontrak, p: PutaranReview, data: DataOtomatis, onProgres?: (persen: number) => void): Promise<HasilSalinan> {
  const { blob, nama } = await rakitLembarDocx(k, p, data);
  const berkas = new File([blob], nama, { type: MIME_DOCX_LEMBAR });
  const daftar = await ambilDokumen(k.nomorPengajuan, { sertakanLembar: true }).catch(() => [] as Dokumen[]);
  const lama = p.salinan ? daftar.find((d) => d.nama === p.salinan!.nama) : undefined;
  if (lama) {
    const h = await unggahVersiBaru(k, lama.id, berkas, onProgres);
    return { nama: h.nama, webUrl: h.webUrl, jenisTercatat: true };
  }
  const h = await unggahDokumen(k, berkas, JENIS_LEMBAR, onProgres);
  return { nama: h.nama, webUrl: h.webUrl, jenisTercatat: h.metadataTersimpan };
}
