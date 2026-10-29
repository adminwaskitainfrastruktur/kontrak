// Satu-satunya pintu ke list "Kontrak" di SharePoint.
import { GRAPH_SITE_ID, LIST_ID } from "../config";
import { GraphError, graph, graphSemua, pesanError } from "../lib/graph";
import { dariYmd, formatTanggal, formatUang, keYmd } from "../lib/format";
import { pesanKonflik, type AksiStatus } from "../lib/alur";
import {
  JENIS_ADDENDUM,
  type ChecklistReview,
  type ChecklistTtd,
  type DetailPerubahan,
  type Kontrak,
  type KontrakInput,
  type ModeBerakhir,
  type Persetujuan,
  type Sesi,
  type Status,
  type Ymd,
} from "../lib/types";
import { berakhirEfektifSeharusnya, selisihBerakhirEfektif, type SelisihBerakhirEfektif } from "../lib/masa";
import { cekNomorGanda, normalNomor } from "../lib/penomoran";
import { kabarkanCacheKontrakKosong } from "../lib/langgananKontrak";
import { pesanDisalinDari } from "../lib/serupa";
import { daftarPersetujuan, hapusPersetujuan, tambahPersetujuan, teksPersetujuan, type IsianPersetujuan, type ItemPersetujuan } from "../lib/kewenangan";
import { bungkusPihakLain, samaPihakLain, teksPihakLain, uraiPihakLain, type PihakLain } from "../lib/pihakLain";
import { antreanLegal, teksRingkasAntrean } from "../lib/antrean";
import type { DokumenPengajuan } from "../lib/email";
import { catatAktivitas, type RingkasAktivitas } from "./aktivitas";
import { kabarkanPengajuanBaru, kabarkanPerubahanStatus, kabarkanPenugasan } from "./notifikasi";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.kontrak}/items`;

interface ItemGraph {
  id: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  webUrl: string;
  fields: Record<string, unknown>;
}

const teks = (v: unknown) => (typeof v === "string" ? v : "");
const angka = (v: unknown) => (typeof v === "number" ? v : null);

function bacaJson<T>(v: unknown): T | null {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

// --- Kolom yang dimuat (U39) ----------------------------------------------------------------
//
// Daftar memakai $expand=fields($select=...) supaya kolom sistem SharePoint (ContentType, _UIVersionString,
// AuthorLookupId, dsb.) dan kolom JSON yang hanya dibaca di detail tidak ikut diunduh untuk ratusan item.
// dariItem HANYA boleh membaca kolom dari dua konstanta ini: tipe NamaKolom membuat tsc menolak kolom yang
// dibaca tetapi lupa dimasukkan ke $select, jadi pembacaan dan pemuatan tidak bisa berselisih.

/** Kolom untuk daftar (ambilSemuaKontrak): dipakai dashboard, daftar, antrean, palet perintah, formulir, chat. */
const KOLOM_DAFTAR = [
  "Diarsipkan",
  "Title",
  "NomorPengajuan",
  "NomorKontrak",
  "JenisKontrak",
  "DivisiPengaju",
  "NamaMitra",
  "NilaiKontrak",
  "MataUang",
  "TanggalMulai",
  "TanggalBerakhir",
  "Status",
  "Prioritas",
  "TargetSelesai",
  "PengajuEmail",
  "PengajuNama",
  "PicLegalEmail",
  "PicLegalNama",
  "TanggalDiajukan",
  "TanggalTandaTangan",
  "KontrakIndukId",
  "MouAcuanId",
  "JenisPerubahan",
  "UrutanAddendum",
  "StatusSejak",
  "BerakhirEfektif",
  "ChecklistTtd",
  "KodeProyek",
  "NomorReferensi",
  "CostCenter",
  "MitraId",
  "KontrakFinal",
  "PerpanjanganOtomatis",
  "MasaPemberitahuanHari",
  "ModeBerakhir",
  "AdaSengketa",
  "Plafon",
  "SalinDari",
  "NpwpMitra",
  "AlamatMitra",
  "PenandatanganMitra",
  "JabatanMitra",
  "DasarKewenangan",
] as const;

/**
 * Kolom yang hanya dibaca di halaman detail (ambilKontrak): JSON checklist review, catatan persetujuan (K01),
 * tanggal efektif kontrak diakhiri (K02), pihak lain beserta perannya (U11), dan Deskripsi (U39; teks panjang).
 * "Ajukan serupa" (ChatAjukan, FormKontrak) memuat kontrak sumbernya lewat ambilKontrak, jadi deskripsinya ikut. Email
 * pengajuan baru dibangun dari item hasil POST (semua kolom), bukan dari daftar.
 */
const KOLOM_DETAIL_SAJA = ["ChecklistReview", "Persetujuan", "TanggalDiakhiri", "PihakLain", "Deskripsi"] as const;

type NamaKolom = (typeof KOLOM_DAFTAR)[number] | (typeof KOLOM_DETAIL_SAJA)[number];

const PILIH_DAFTAR = `$expand=fields($select=${KOLOM_DAFTAR.join(",")})`;
const PILIH_DETAIL = `$expand=fields($select=${[...KOLOM_DAFTAR, ...KOLOM_DETAIL_SAJA].join(",")})`;

function dariItem(item: ItemGraph): Kontrak {
  const f = item.fields as Partial<Record<NamaKolom, unknown>>;
  return {
    id: Number(item.id),
    judul: teks(f.Title),
    nomorPengajuan: teks(f.NomorPengajuan),
    nomorKontrak: teks(f.NomorKontrak),
    jenis: (teks(f.JenisKontrak) || "Lainnya") as Kontrak["jenis"],
    divisi: (teks(f.DivisiPengaju) || "SCM") as Kontrak["divisi"],
    mitra: teks(f.NamaMitra),
    nilai: angka(f.NilaiKontrak),
    mataUang: (teks(f.MataUang) || "IDR") as Kontrak["mataUang"],
    tanggalMulai: keYmd(teks(f.TanggalMulai)),
    tanggalBerakhir: keYmd(teks(f.TanggalBerakhir)),
    status: (teks(f.Status) || "Diajukan") as Status,
    prioritas: (teks(f.Prioritas) || "Normal") as Kontrak["prioritas"],
    deskripsi: teks(f.Deskripsi),
    targetSelesai: keYmd(teks(f.TargetSelesai)),
    pengajuEmail: teks(f.PengajuEmail),
    pengajuNama: teks(f.PengajuNama),
    picLegalEmail: teks(f.PicLegalEmail),
    picLegalNama: teks(f.PicLegalNama),
    tanggalDiajukan: teks(f.TanggalDiajukan) || null,
    tanggalTandaTangan: keYmd(teks(f.TanggalTandaTangan)),
    kontrakIndukId: angka(f.KontrakIndukId),
    mouAcuanId: angka(f.MouAcuanId),
    jenisPerubahan: Array.isArray(f.JenisPerubahan) ? (f.JenisPerubahan as Kontrak["jenisPerubahan"]) : [],
    urutanAddendum: angka(f.UrutanAddendum),
    statusSejak: teks(f.StatusSejak) || null,
    berakhirEfektif: keYmd(teks(f.BerakhirEfektif)),
    checklistReview: bacaJson<ChecklistReview>(f.ChecklistReview),
    checklistTtd: bacaJson<ChecklistTtd>(f.ChecklistTtd),
    kodeProyek: teks(f.KodeProyek),
    nomorReferensi: teks(f.NomorReferensi),
    costCenter: teks(f.CostCenter),
    mitraId: angka(f.MitraId),
    kontrakFinal: teks(f.KontrakFinal),
    perpanjanganOtomatis: f.PerpanjanganOtomatis === true,
    masaPemberitahuanHari: angka(f.MasaPemberitahuanHari),
    modeBerakhir: teks(f.ModeBerakhir) as Kontrak["modeBerakhir"],
    tanggalDiakhiri: keYmd(teks(f.TanggalDiakhiri)),
    adaSengketa: f.AdaSengketa === true,
    plafon: angka(f.Plafon),
    diarsipkan: f.Diarsipkan === true,
    persetujuan: bacaJson<Persetujuan>(f.Persetujuan),
    salinDari: angka(f.SalinDari),
    npwpMitra: teks(f.NpwpMitra),
    alamatMitra: teks(f.AlamatMitra),
    penandatanganMitra: teks(f.PenandatanganMitra),
    jabatanMitra: teks(f.JabatanMitra),
    dasarKewenangan: teks(f.DasarKewenangan),
    pihakLain: uraiPihakLain(f.PihakLain),
    dibuat: item.createdDateTime,
    diubah: item.lastModifiedDateTime,
    webUrl: item.webUrl,
  };
}

function keFields(d: Partial<KontrakInput>): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  const set = (kolom: string, nilai: unknown) => {
    if (nilai !== undefined) f[kolom] = nilai;
  };
  set("Title", d.judul?.trim());
  set("JenisKontrak", d.jenis);
  set("DivisiPengaju", d.divisi);
  set("NamaMitra", d.mitra?.trim());
  set("NilaiKontrak", d.nilai);
  set("MataUang", d.mataUang);
  set("Prioritas", d.prioritas);
  set("Deskripsi", d.deskripsi);
  set("NomorKontrak", d.nomorKontrak?.trim());
  set("PicLegalEmail", d.picLegalEmail);
  set("PicLegalNama", d.picLegalNama);
  set("KontrakIndukId", d.kontrakIndukId);
  set("MouAcuanId", d.mouAcuanId);
  set("KodeProyek", d.kodeProyek?.trim());
  set("NomorReferensi", d.nomorReferensi?.trim());
  set("CostCenter", d.costCenter?.trim());
  set("MitraId", d.mitraId);
  set("PerpanjanganOtomatis", d.perpanjanganOtomatis);
  set("MasaPemberitahuanHari", d.masaPemberitahuanHari);
  set("Plafon", d.plafon);
  set("SalinDari", d.salinDari);
  set("NpwpMitra", d.npwpMitra?.trim());
  set("AlamatMitra", d.alamatMitra?.trim());
  set("PenandatanganMitra", d.penandatanganMitra?.trim());
  set("JabatanMitra", d.jabatanMitra?.trim());
  set("DasarKewenangan", d.dasarKewenangan?.trim());
  if (d.jenisPerubahan !== undefined) {
    // Kolom pilihan ganda SharePoint lewat Graph wajib membawa anotasi tipe koleksi.
    f.JenisPerubahan = d.jenisPerubahan;
    f["JenisPerubahan@odata.type"] = "Collection(Edm.String)";
  }
  if (d.tanggalMulai !== undefined) f.TanggalMulai = dariYmd(d.tanggalMulai);
  if (d.tanggalBerakhir !== undefined) f.TanggalBerakhir = dariYmd(d.tanggalBerakhir);
  if (d.targetSelesai !== undefined) f.TargetSelesai = dariYmd(d.targetSelesai);
  if (d.tanggalTandaTangan !== undefined) f.TanggalTandaTangan = dariYmd(d.tanggalTandaTangan);
  return f;
}

/** KTR-2026-0007: tahun pengajuan + ID item, jadi pasti unik tanpa penghitung terpisah. */
function nomorPengajuan(id: number, tanggal: string): string {
  return `KTR-${new Date(tanggal).getFullYear()}-${String(id).padStart(4, "0")}`;
}

// --- Cache bersama daftar kontrak (U39) ------------------------------------------------------
//
// Daftar kontrak dipakai banyak halaman (dashboard, daftar, palet perintah, formulir). Hasilnya disimpan di
// memori selama UMUR_CACHE_MS supaya berpindah halaman tidak mengunduh ulang seluruh list. Halaman yang
// berlangganan (hooks/useDaftarKontrak) ikut diperbarui setiap kali data baru tiba dari mana pun, termasuk
// saat tab kembali aktif setelah data basi. Hanya di memori: tidak ada salinan lintas sesi di perangkat.
//
// Setiap penulisan memanggil kosongkanCacheKontrak(): data lama tetap tampil, tetapi permintaan berikutnya
// pasti mengambil yang baru. Hasil permintaan yang dimulai SEBELUM penulisan tidak dipakai mengisi cache.
// Pengosongan itu juga dikabarkan ke lib/langgananKontrak (lonceng dan judul tab ikut dimuat ulang);
// penyegaran biasa (segarkanKontrak) tidak dikabarkan karena bukan penulisan.

/** Umur data di memori (rentang 60-120 detik di peta jalan U39). */
const UMUR_CACHE_MS = 90_000;

export interface KeadaanDaftarKontrak {
  data: Kontrak[] | null;
  /** Kapan data terakhir berhasil dimuat (ms epoch); 0 bila belum pernah. */
  waktu: number;
  /** Galat pemuatan terakhir; dikosongkan saat pemuatan berikutnya berhasil. */
  error: unknown;
  memuat: boolean;
}

let keadaan: KeadaanDaftarKontrak = { data: null, waktu: 0, error: null, memuat: false };
/** Data dianggap segar sampai waktu ini (ms). 0 = harus dimuat ulang pada permintaan berikutnya. */
let segarSampai = 0;
let janjiBerjalan: Promise<Kontrak[]> | null = null;
let generasi = 0;
const pendengar = new Set<() => void>();
/** false setelah Graph menolak $select (mis. nama kolom belum ada di tenant): jatuh ke $expand=fields biasa. */
let pakaiSelect = true;

function ubahKeadaan(baru: Partial<KeadaanDaftarKontrak>) {
  keadaan = { ...keadaan, ...baru };
  for (const fn of pendengar) fn();
}

/**
 * Ambil dengan $select; bila Graph menolaknya (400), ulangi sekali tanpa $select dan ingat untuk sesi ini.
 * dariItem tetap hanya membaca kolom yang sama, jadi hasilnya identik.
 */
async function ambilDenganPilihan<T>(muat: (pilih: string) => Promise<T>, pilih: string): Promise<T> {
  if (pakaiSelect) {
    try {
      return await muat(pilih);
    } catch (err) {
      if (!(err instanceof GraphError && err.status === 400)) throw err;
      pakaiSelect = false;
      console.warn("Graph menolak $select kolom Kontrak; memuat semua kolom untuk sesi ini.", err);
    }
  }
  return muat("$expand=fields");
}

/** Kontrak yang diarsipkan dari pemuatan terakhir; dipisahkan dari daftar kerja (lihat ambilKontrakArsip). */
let arsipTerakhir: Kontrak[] = [];

/** Arsip dari pemuatan terakhir tanpa meminta jaringan (mis. untuk remah di halaman detail kontrak arsip). */
export const cuplikanArsip = (): readonly Kontrak[] => arsipTerakhir;

function muatDaftar(): Promise<Kontrak[]> {
  return ambilDenganPilihan((pilih) => graphSemua<ItemGraph>(`${ITEMS}?${pilih}&$top=999`), PILIH_DAFTAR).then((items) => {
    const semua = items.map(dariItem).sort((a, b) => b.dibuat.localeCompare(a.dibuat));
    // Kontrak yang diarsipkan tidak ikut daftar kerja: dashboard, antrean, laporan, dan pencarian tidak melihatnya.
    arsipTerakhir = semua.filter((k) => k.diarsipkan);
    return semua.filter((k) => !k.diarsipkan);
  });
}

/** Tandai data basi dan abaikan permintaan yang sedang berjalan, tanpa mengabari pendengar penulisan. */
function batalkanCache() {
  generasi++;
  segarSampai = 0;
  janjiBerjalan = null;
}

/** Dipanggil setiap kali kontrak ditulis: permintaan berikutnya pasti mengambil data baru. */
export function kosongkanCacheKontrak() {
  batalkanCache();
  kabarkanCacheKontrakKosong();
}

export function ambilSemuaKontrak(): Promise<Kontrak[]> {
  if (keadaan.data && Date.now() < segarSampai) return Promise.resolve(keadaan.data);
  if (janjiBerjalan) return janjiBerjalan;
  const gen = generasi;
  const janji = muatDaftar();
  janjiBerjalan = janji;
  ubahKeadaan({ memuat: true });
  janji.then(
    (data) => {
      if (gen === generasi) {
        janjiBerjalan = null;
        segarSampai = Date.now() + UMUR_CACHE_MS;
        ubahKeadaan({ data, waktu: Date.now(), error: null, memuat: false });
      } else if (!janjiBerjalan) {
        ubahKeadaan({ memuat: false });
      }
    },
    // Gagal tidak disimpan sebagai data: percobaan berikutnya benar-benar mengulang.
    (error) => {
      if (janjiBerjalan === janji) janjiBerjalan = null;
      if (!janjiBerjalan) ubahKeadaan({ error, memuat: false });
    },
  );
  return janji;
}

/** Kontrak yang diarsipkan (halaman Arsip). Memakai pemuatan daftar yang sama, jadi tidak menambah permintaan. */
export async function ambilKontrakArsip(): Promise<Kontrak[]> {
  await ambilSemuaKontrak();
  return arsipTerakhir;
}

/** Paksa muat ulang (tombol Segarkan, setelah aksi massal, atau saat galat diulangi). */
export function segarkanKontrak(): Promise<Kontrak[]> {
  batalkanCache();
  return ambilSemuaKontrak();
}

/**
 * Tab kembali terlihat: muat ulang di latar bila data sudah basi. Data lama tetap tampil selama memuat.
 * Ditunda satu giliran supaya penyegaran lain pada peristiwa yang sama (lonceng di PantauProvider) lebih dulu
 * berjalan; permintaannya lalu dipakai bersama, bukan diulang.
 */
function saatTabTerlihat() {
  if (document.visibilityState !== "visible" || pendengar.size === 0 || !keadaan.data) return;
  setTimeout(() => {
    if (Date.now() >= segarSampai) void ambilSemuaKontrak().catch(() => undefined);
  }, 0);
}

/** Berlangganan perubahan daftar (untuk useSyncExternalStore). */
export function langgananKontrak(fn: () => void): () => void {
  pendengar.add(fn);
  if (pendengar.size === 1 && typeof document !== "undefined") document.addEventListener("visibilitychange", saatTabTerlihat);
  return () => {
    pendengar.delete(fn);
    if (pendengar.size === 0 && typeof document !== "undefined") document.removeEventListener("visibilitychange", saatTabTerlihat);
  };
}

/** Cuplikan keadaan daftar saat ini. Objeknya hanya berganti saat ada perubahan (aman untuk useSyncExternalStore). */
export function cuplikanKontrak(): KeadaanDaftarKontrak {
  return keadaan;
}

/** Satu kontrak lengkap untuk halaman detail, termasuk kolom yang tidak dimuat di daftar. */
export async function ambilKontrak(id: number): Promise<Kontrak> {
  return dariItem(await ambilDenganPilihan((pilih) => graph<ItemGraph>(`${ITEMS}/${id}?${pilih}`), PILIH_DETAIL));
}

// --- Penulisan pelengkap dan galat yang ramah ------------------------------------------------

/**
 * PATCH kolom pelengkap: kolom yang mungkin belum dibuat di tenant (mis. ModeBerakhir, TanggalDiakhiri,
 * AdaSengketa). Ditulis terpisah dari perubahan utama supaya kolom yang belum ada tidak menggagalkan
 * perubahan status. Tidak melempar galat; mengembalikan apakah tersimpan.
 */
export async function tulisPelengkap(id: number, fields: Record<string, unknown>): Promise<boolean> {
  if (Object.keys(fields).length === 0) return true;
  kosongkanCacheKontrak();
  return graph(`${ITEMS}/${id}/fields`, { method: "PATCH", json: fields }).then(
    () => true,
    (err) => {
      console.warn("Kolom pelengkap Kontrak belum tersimpan:", Object.keys(fields).join(", "), err);
      return false;
    },
  );
}

/** Kontrak sudah diubah orang lain sejak dibuka (U38). `segar` berisi data terbaru untuk ditampilkan ulang. */
export class GalatKonflik extends Error {
  constructor(
    pesan: string,
    readonly segar: Kontrak,
  ) {
    super(pesan);
    this.name = "GalatKonflik";
  }
}

/** Nomor kontrak sudah dipakai kontrak lain (U20). `semua` berisi daftar segar untuk menghitung ulang usulan. */
export class GalatNomorGanda extends Error {
  constructor(
    pesan: string,
    readonly ganda: Kontrak[],
    readonly semua: Kontrak[],
  ) {
    super(pesan);
    this.name = "GalatNomorGanda";
  }
}

/**
 * Pastikan nomor kontrak belum dipakai kontrak lain, dengan daftar yang dibaca ulang dari SharePoint (bukan
 * cache) supaya nomor yang baru saja dipakai rekan ikut diperiksa. Melempar GalatNomorGanda bila bentrok.
 */
export async function pastikanNomorUnik(nomor: string, kecualiId: number | null): Promise<void> {
  if (!normalNomor(nomor)) return;
  kosongkanCacheKontrak();
  const semua = await ambilSemuaKontrak();
  const ganda = cekNomorGanda(nomor, semua, kecualiId);
  if (ganda.length) {
    throw new GalatNomorGanda(`Nomor ${nomor.trim()} sudah dipakai ${ganda.map((g) => g.nomorPengajuan).join(", ")}. Ganti nomornya, lalu simpan lagi.`, ganda, semua);
  }
}

/**
 * Simpan pengajuan baru: item Kontrak dan nomor pengajuannya. Catatan "Dibuat" dan email ke Legal BELUM dikirim di
 * sini (U23a): pemanggil mengunggah dokumen lebih dulu, lalu memanggil selesaikanPengajuan supaya email Legal
 * menyebut dokumen yang benar-benar terlampir. Galat di sini berarti pengajuan belum tersimpan.
 */
export async function buatKontrak(data: KontrakInput, sesi: Sesi): Promise<Kontrak> {
  kosongkanCacheKontrak();
  const sekarang = new Date().toISOString();

  // Addendum diberi urutan pada kontrak induknya: ke-1, ke-2, dan seterusnya. Urutannya maks + 1 dari
  // addendum yang masih berlaku atau diproses, bukan jumlahnya: bila addendum ke-1 dibatalkan setelah
  // ke-2 terbit, addendum baru menjadi ke-3, tidak bentrok dengan ke-2. Data lama tanpa urutan ikut dihitung.
  let urutan: number | null = null;
  if (data.jenis === JENIS_ADDENDUM && data.kontrakIndukId != null) {
    const semuaAwal = await ambilSemuaKontrak();
    const saudara = semuaAwal.filter((x) => x.kontrakIndukId === data.kontrakIndukId && x.status !== "Ditolak" && x.status !== "Dibatalkan");
    urutan = 1 + Math.max(saudara.length, ...saudara.map((x) => x.urutanAddendum ?? 0));
    kosongkanCacheKontrak();
  }

  const item = await graph<ItemGraph>(ITEMS, {
    method: "POST",
    json: {
      fields: {
        ...keFields(data),
        ...(urutan != null ? { UrutanAddendum: urutan } : {}),
        Status: "Diajukan" satisfies Status,
        PengajuEmail: sesi.email,
        PengajuNama: sesi.nama,
        TanggalDiajukan: sekarang,
        StatusSejak: sekarang,
      },
    },
  });
  const id = Number(item.id);
  const nomor = nomorPengajuan(id, sekarang);
  await graph(`${ITEMS}/${id}/fields`, { method: "PATCH", json: { NomorPengajuan: nomor } });
  kosongkanCacheKontrak();
  return { ...dariItem(item), nomorPengajuan: nomor, urutanAddendum: urutan };
}

/** Ringkasan keadaan kontrak untuk kolom ringkasan Aktivitas (U23a). */
function ringkasUntukAktivitas(k: Kontrak, semua: readonly Kontrak[] | null, jumlahDokumen?: number): RingkasAktivitas {
  return {
    ringkasAntrean: semua ? teksRingkasAntrean(k, antreanLegal([...semua.filter((x) => x.id !== k.id), k])) : "",
    nilai: k.nilai,
    prioritas: k.prioritas,
    targetSelesai: k.targetSelesai,
    ...(jumlahDokumen !== undefined ? { jumlahDokumen } : {}),
  };
}

export interface HasilSelesaikanPengajuan {
  /** Hal yang tidak berhasil (catatan riwayat, email). Pengajuannya sendiri tetap tersimpan. */
  peringatan: string[];
  /** Daftar kontrak segar (termasuk pengajuan ini bila sudah terbaca), atau null bila gagal dimuat. */
  semua: Kontrak[] | null;
}

/**
 * Langkah penutup pengajuan baru, dipanggil SESUDAH unggahan dokumen selesai (U23a): catatan "Dibuat" (dengan
 * ringkasan antrean, nilai, prioritas, target, dan jumlah dokumen), jejak di kontrak induk, lalu email ke tim
 * Legal dan tanda terima ke pengaju. Tidak pernah melempar galat: pengajuan sudah tersimpan, jadi kegagalan di
 * sini dikembalikan sebagai peringatan untuk ditampilkan.
 */
export async function selesaikanPengajuan(baru: Kontrak, sesi: Sesi, dokumen: DokumenPengajuan): Promise<HasilSelesaikanPengajuan> {
  const peringatan: string[] = [];
  kosongkanCacheKontrak();
  const semua = await ambilSemuaKontrak().catch((err) => {
    console.warn("Daftar kontrak gagal dimuat untuk ringkasan antrean:", err);
    return null;
  });

  // "Ajukan serupa": sumbernya disebut di catatan Dibuat supaya riwayat menunjukkan asalnya.
  const sumberSalin = baru.salinDari != null ? (semua?.find((x) => x.id === baru.salinDari) ?? null) : null;
  const pesanDibuat = `${baru.urutanAddendum != null ? `Addendum ke-${baru.urutanAddendum}` : "Kontrak"} diajukan oleh ${sesi.nama}.`;
  const pesanSalin = sumberSalin ? ` ${pesanDisalinDari(sumberSalin)}` : baru.salinDari != null ? " Disalin dari kontrak sebelumnya." : "";
  const pesanDokumen = dokumen.jumlah > 0 ? ` Dokumen terlampir: ${dokumen.jumlah}.` : " Belum ada dokumen terlampir.";
  try {
    await catatAktivitas(
      { kontrakId: baru.id, jenis: "Dibuat", pesan: pesanDibuat + pesanSalin + pesanDokumen, statusKe: "Diajukan", ringkas: ringkasUntukAktivitas(baru, semua, dokumen.jumlah) },
      sesi,
    );
  } catch (err) {
    console.warn("Aktivitas Dibuat gagal dicatat:", err);
    peringatan.push("Pengajuan tersimpan, tetapi catatan pengajuannya belum masuk riwayat. Legal tetap melihatnya di antrean.");
  }
  // Jejak juga dicatat di kontrak induk supaya riwayatnya memuat seluruh perubahan.
  if (baru.kontrakIndukId != null) {
    await catatAktivitas({ kontrakId: baru.kontrakIndukId, jenis: "Perubahan", pesan: `Addendum ke-${baru.urutanAddendum ?? "?"} (${baru.nomorPengajuan}) diajukan: ${baru.judul}.` }, sesi).catch((err) => {
      console.warn("Jejak addendum di kontrak induk gagal dicatat:", err);
      peringatan.push("Jejak addendum ini belum tercatat di riwayat kontrak induknya.");
    });
  }

  try {
    const kabar = await kabarkanPengajuanBaru(baru, semua ?? [], sesi, dokumen);
    peringatan.push(...kabar.peringatan);
  } catch (err) {
    console.warn("Notifikasi pengajuan baru gagal diantrikan:", err);
    peringatan.push("Email pemberitahuan ke Legal belum terkirim. Pengajuan Anda tetap masuk antrean di aplikasi.");
  }
  return { peringatan, semua };
}

/**
 * Simpan perubahan data kontrak. Mengembalikan peringatan (mis. catatan riwayat gagal dicatat); galat dilempar
 * hanya bila perubahan itu sendiri belum tersimpan.
 */
export async function ubahKontrak(k: Kontrak, data: Partial<KontrakInput>, sesi: Sesi): Promise<string[]> {
  const fields = keFields(data);
  if (Object.keys(fields).length === 0) return [];
  // U20: nomor kontrak yang diganti diperiksa dulu terhadap data segar, sama seperti saat aktivasi.
  if (data.nomorKontrak !== undefined && normalNomor(data.nomorKontrak) && normalNomor(data.nomorKontrak) !== normalNomor(k.nomorKontrak)) {
    await pastikanNomorUnik(data.nomorKontrak, k.id);
  }
  kosongkanCacheKontrak();
  await graph(`${ITEMS}/${k.id}/fields`, { method: "PATCH", json: fields });
  const peringatan: string[] = [];
  const { pesan, detail } = ringkasPerubahan(k, data);
  await catatAktivitas({ kontrakId: k.id, jenis: "Perubahan", pesan, detail }, sesi).catch((err) => {
    console.warn("Aktivitas Perubahan gagal dicatat:", err);
    peringatan.push("Perubahan tersimpan, tetapi catatannya belum masuk riwayat.");
  });
  // U24: tanggal berakhir kontrak Aktif (atau addendum Aktif) berubah, jadi masa berlaku efektif induknya ikut.
  if (k.status === "Aktif" && data.tanggalBerakhir !== undefined && data.tanggalBerakhir !== k.tanggalBerakhir) {
    await sinkronkanBerakhirEfektif(k.kontrakIndukId ?? k.id).catch((err) => console.warn("BerakhirEfektif gagal disinkronkan:", err));
  }
  return peringatan;
}

const LABEL_KOLOM: Partial<Record<keyof KontrakInput, string>> = {
  judul: "judul",
  jenis: "jenis",
  divisi: "divisi",
  mitra: "mitra",
  nilai: "nilai",
  mataUang: "mata uang",
  tanggalMulai: "tanggal mulai",
  tanggalBerakhir: "tanggal berakhir",
  prioritas: "prioritas",
  deskripsi: "deskripsi",
  targetSelesai: "target selesai",
  kontrakIndukId: "kontrak induk",
  mouAcuanId: "MoU acuan",
  nomorKontrak: "nomor kontrak",
  picLegalEmail: "PIC Legal",
  tanggalTandaTangan: "tanggal tanda tangan",
  jenisPerubahan: "jenis perubahan",
  kodeProyek: "kode proyek",
  nomorReferensi: "nomor referensi",
  costCenter: "cost center",
  mitraId: "tautan data mitra",
  perpanjanganOtomatis: "perpanjangan otomatis",
  masaPemberitahuanHari: "masa pemberitahuan",
  plafon: "plafon",
  npwpMitra: "NPWP mitra",
  alamatMitra: "alamat mitra",
  penandatanganMitra: "penandatangan mitra",
  jabatanMitra: "jabatan penandatangan",
  dasarKewenangan: "dasar kewenangan",
};

const KOLOM_TANGGAL: readonly (keyof KontrakInput)[] = ["tanggalMulai", "tanggalBerakhir", "targetSelesai", "tanggalTandaTangan"];
const KOLOM_UANG: readonly (keyof KontrakInput)[] = ["nilai", "plafon"];
const MAKS_NILAI_DETAIL = 160;

/** Nilai yang dibandingkan: teks dirapikan, kosong disamakan, larik dibandingkan isinya. */
function nilaiBanding(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "string") return v.trim();
  return String(v);
}

/** Nilai untuk dibaca manusia di riwayat (tanggal, uang, ya/tidak), dipotong bila terlalu panjang. */
function nilaiTampil(kolom: keyof KontrakInput, v: unknown, mataUang: Kontrak["mataUang"]): string {
  if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) return "-";
  let t: string;
  if (KOLOM_TANGGAL.includes(kolom) && typeof v === "string") t = formatTanggal(v);
  else if (KOLOM_UANG.includes(kolom) && typeof v === "number") t = formatUang(v, mataUang);
  else if (kolom === "masaPemberitahuanHari" && typeof v === "number") t = `${v} hari`;
  else if (kolom === "mitraId" && typeof v === "number") t = `#${v}`;
  else if (typeof v === "boolean") t = v ? "Ya" : "Tidak";
  else if (Array.isArray(v)) t = v.join(", ");
  else t = String(v).trim();
  return t.length > MAKS_NILAI_DETAIL ? `${t.slice(0, MAKS_NILAI_DETAIL - 1)}…` : t;
}

/** Ringkasan satu kalimat dan rincian lama ke baru untuk catatan Perubahan. */
function ringkasPerubahan(lama: Kontrak, baru: Partial<KontrakInput>): { pesan: string; detail: DetailPerubahan[] } {
  const kolom = (Object.keys(baru) as (keyof KontrakInput)[]).filter(
    (k) => LABEL_KOLOM[k] && baru[k] !== undefined && nilaiBanding(baru[k]) !== nilaiBanding(lama[k]),
  );
  const mataUangBaru = baru.mataUang ?? lama.mataUang;
  const detail: DetailPerubahan[] = kolom.map((k) => ({
    kolom: LABEL_KOLOM[k] ?? k,
    dari: nilaiTampil(k, lama[k], lama.mataUang),
    ke: nilaiTampil(k, baru[k], mataUangBaru),
  }));
  return {
    pesan: detail.length ? `Mengubah ${detail.map((d) => d.kolom).join(", ")}.` : "Menyimpan data kontrak.",
    detail,
  };
}

/**
 * Tetapkan PIC Legal tanpa mengubah status. `catat: false` dipakai TugaskanPic, yang sudah mencatat
 * jejak "Penugasan" sendiri, supaya riwayat tidak berisi dua baris untuk satu penugasan.
 * `k` adalah data SEBELUM penugasan: PIC lamanya ikut diberi tahu bila kontrak dialihkan (U23a).
 * Mengembalikan peringatan (catatan atau email yang gagal); galat dilempar hanya bila PIC belum tersimpan.
 */
export async function tetapkanPic(k: Kontrak, pic: { email: string; nama: string }, sesi: Sesi, opsi?: { catat?: boolean; alasan?: string }): Promise<string[]> {
  kosongkanCacheKontrak();
  await graph(`${ITEMS}/${k.id}/fields`, {
    method: "PATCH",
    json: { PicLegalEmail: pic.email, PicLegalNama: pic.nama },
  });
  const peringatan: string[] = [];
  if (opsi?.catat !== false) {
    await catatAktivitas(
      { kontrakId: k.id, jenis: "Perubahan", pesan: `PIC Legal ditetapkan: ${pic.nama}.`, detail: [{ kolom: "PIC Legal", dari: k.picLegalNama || "-", ke: pic.nama }] },
      sesi,
    ).catch((err) => {
      console.warn("Aktivitas penetapan PIC gagal dicatat:", err);
      peringatan.push("PIC tersimpan, tetapi catatannya belum masuk riwayat.");
    });
  }
  // PIC baru dan PIC lama diberi tahu lewat email; orang yang mengambil sendiri tidak dikirimi.
  const picLama = k.picLegalEmail.trim() ? { email: k.picLegalEmail, nama: k.picLegalNama } : null;
  try {
    const kabar = await kabarkanPenugasan({ ...k, picLegalEmail: pic.email, picLegalNama: pic.nama }, picLama, sesi, opsi?.alasan ?? "");
    peringatan.push(...kabar.peringatan);
  } catch (err) {
    console.warn("Notifikasi penugasan gagal diantrikan:", err);
    peringatan.push("PIC tersimpan, tetapi email pemberitahuannya belum terkirim.");
  }
  return peringatan;
}

/** Data tambahan aksi status selain kolom formulir. */
export interface OpsiAksi {
  /** K02: cara dan tanggal efektif kontrak berakhir, untuk aksi "Tandai Berakhir". */
  penutupan?: { mode: ModeBerakhir; tanggal: Ymd };
}

export interface HasilAksi {
  /** Kontrak sesudah aksi (perkiraan dari data segar dan perubahan yang ditulis). */
  kontrak: Kontrak;
  /** Hal yang perlu diketahui pengguna walau aksinya berhasil, mis. kolom pelengkap belum tersimpan. */
  peringatan: string[];
}

/**
 * Jalankan satu aksi status. Kontrak dibaca ulang lebih dulu: bila status (atau PIC, untuk aksi Legal) sudah
 * berubah sejak dilihat, aksi dibatalkan dengan GalatKonflik (U38). Nomor kontrak baru diperiksa ganda
 * (U20). Perubahan nomor, tanggal, dan nilai final dicatat lama-ke-baru di Detail aktivitas Status (U31).
 */
export async function jalankanAksi(
  k: Kontrak,
  aksi: AksiStatus,
  catatan: string,
  dataFinal: Partial<KontrakInput>,
  sesi: Sesi,
  opsi: OpsiAksi = {},
): Promise<HasilAksi> {
  kosongkanCacheKontrak();
  const segar = await ambilKontrak(k.id);
  const konflik = pesanKonflik(k, segar, { cekPic: aksi.oleh === "legal" });
  if (konflik) throw new GalatKonflik(konflik, segar);
  if (dataFinal.nomorKontrak !== undefined && normalNomor(dataFinal.nomorKontrak) && normalNomor(dataFinal.nomorKontrak) !== normalNomor(segar.nomorKontrak)) {
    await pastikanNomorUnik(dataFinal.nomorKontrak, segar.id);
  }

  kosongkanCacheKontrak();
  const sekarang = new Date().toISOString();
  const peringatan: string[] = [];
  const fields: Record<string, unknown> = { ...keFields(dataFinal), Status: aksi.ke, StatusSejak: sekarang };
  const { detail } = ringkasPerubahan(segar, dataFinal);
  // Legal yang memulai review otomatis menjadi PIC bila belum ada.
  if (aksi.id === "mulai-review" && !segar.picLegalEmail) {
    fields.PicLegalEmail = sesi.email;
    fields.PicLegalNama = sesi.nama;
    detail.push({ kolom: "PIC Legal", dari: "-", ke: sesi.nama });
  }
  // Nilai awal; disempurnakan sinkronkanBerakhirEfektif di bawah bila ada addendum yang Aktif.
  if (aksi.ke === "Aktif" && segar.kontrakIndukId == null) fields.BerakhirEfektif = dariYmd(dataFinal.tanggalBerakhir ?? segar.tanggalBerakhir);
  await graph(`${ITEMS}/${segar.id}/fields`, { method: "PATCH", json: fields });

  // K02: mode dan tanggal berakhir (kolom pelengkap). Dibuka kembali dari Berakhir: keduanya dikosongkan.
  const pelengkap: Record<string, unknown> = {};
  if (opsi.penutupan && aksi.ke === "Berakhir") {
    pelengkap.ModeBerakhir = opsi.penutupan.mode;
    pelengkap.TanggalDiakhiri = dariYmd(opsi.penutupan.tanggal);
    detail.push({ kolom: LABEL_MODE_BERAKHIR, dari: segar.modeBerakhir || "-", ke: opsi.penutupan.mode });
    detail.push({ kolom: "tanggal diakhiri", dari: nilaiTampil("tanggalBerakhir", segar.tanggalDiakhiri, segar.mataUang), ke: formatTanggal(opsi.penutupan.tanggal) });
  } else if (segar.status === "Berakhir" && aksi.ke !== "Berakhir" && (segar.modeBerakhir || segar.tanggalDiakhiri)) {
    pelengkap.ModeBerakhir = null;
    pelengkap.TanggalDiakhiri = null;
    detail.push({ kolom: LABEL_MODE_BERAKHIR, dari: segar.modeBerakhir || "-", ke: "-" });
  }
  if (Object.keys(pelengkap).length && !(await tulisPelengkap(segar.id, pelengkap))) {
    peringatan.push(
      opsi.penutupan
        ? "Status sudah berubah, tetapi mode dan tanggal berakhir belum tersimpan. Pastikan kolom ModeBerakhir dan TanggalDiakhiri sudah dibuat di list Kontrak."
        : "Status sudah berubah, tetapi mode dan tanggal berakhir lama belum terhapus.",
    );
  }

  const baru: Kontrak = {
    ...segar,
    status: aksi.ke,
    statusSejak: sekarang,
    picLegalEmail: fields.PicLegalEmail ? String(fields.PicLegalEmail) : segar.picLegalEmail,
    picLegalNama: fields.PicLegalNama ? String(fields.PicLegalNama) : segar.picLegalNama,
    ...(dataFinal.nilai !== undefined ? { nilai: dataFinal.nilai } : {}),
  };
  // Daftar segar dipakai ringkasan antrean di catatan Status dan untuk email (antrean bergerak).
  kosongkanCacheKontrak();
  const semua = await ambilSemuaKontrak().catch((err) => {
    console.warn("Daftar kontrak gagal dimuat sesudah aksi status:", err);
    return null;
  });
  // Status sudah berubah: catatan riwayat yang tetap gagal setelah dicoba ulang menjadi peringatan, bukan galat.
  await catatAktivitas({ kontrakId: segar.id, jenis: "Status", pesan: catatan.trim(), statusDari: segar.status, statusKe: aksi.ke, detail, ringkas: ringkasUntukAktivitas(baru, semua) }, sesi).catch((err) => {
    console.warn("Aktivitas Status gagal dicatat:", err);
    peringatan.push("Status sudah berubah, tetapi catatannya belum masuk riwayat. Tambahkan komentar bila alasannya penting.");
  });

  // Masa berlaku efektif induk berubah bila kontrak (atau addendumnya) mulai atau berhenti berlaku.
  if (aksi.ke === "Aktif" || segar.status === "Aktif") {
    await sinkronkanBerakhirEfektif(segar.kontrakIndukId ?? segar.id).catch((err) => {
      console.warn("BerakhirEfektif gagal disinkronkan:", err);
      peringatan.push("Masa berlaku efektif belum diperbarui. Admin bisa merapikannya lewat Rekonsiliasi masa berlaku di Pengaturan.");
    });
  }

  // Email ke pengaju atau Legal (dan ke pengaju yang antreannya bergerak). Gagal kirim tidak menggagalkan perubahan status.
  try {
    const kabar = await kabarkanPerubahanStatus(baru, segar.status, catatan.trim(), sesi, semua ?? [], aksi.oleh);
    peringatan.push(...kabar.peringatan);
  } catch (err) {
    console.warn("Notifikasi status gagal diantrikan:", err);
    peringatan.push("Status sudah berubah, tetapi email pemberitahuannya belum terkirim.");
  }
  if (segar.kontrakIndukId != null && ["Aktif", "Ditolak", "Dibatalkan", "Berakhir"].includes(aksi.ke)) {
    const teks = aksi.ke === "Aktif" ? (segar.status === "Berakhir" ? "berlaku kembali" : "berlaku") : aksi.ke === "Berakhir" ? "berakhir" : aksi.ke.toLowerCase();
    await catatAktivitas({ kontrakId: segar.kontrakIndukId, jenis: "Perubahan", pesan: `Addendum ke-${segar.urutanAddendum ?? "?"} (${segar.nomorPengajuan}) ${teks}.` }, sesi).catch(() => undefined);
  }
  return { kontrak: baru, peringatan };
}

/** Label baris Detail untuk mode berakhir. Disembunyikan di Ruang Pengguna (lihat barisDetailInternal). */
export const LABEL_MODE_BERAKHIR = "mode berakhir";

// --- BerakhirEfektif (U24) ------------------------------------------------------------------

export interface HasilSinkron {
  indukId: number;
  dari: Ymd | null;
  ke: Ymd | null;
  berubah: boolean;
}

/**
 * Satu-satunya penulis kolom BerakhirEfektif. `id` boleh kontrak induk atau addendumnya; yang ditulis selalu
 * induknya, dari rumus yang sama dengan tampilan (tanggal berakhir induk dan addendum yang Aktif). Dipanggil
 * dari jalankanAksi (aktivasi, status addendum), ubahKontrak (tanggal berakhir kontrak Aktif), dan
 * rekonsiliasi Admin. null bila kontraknya tidak ditemukan.
 */
export async function sinkronkanBerakhirEfektif(id: number): Promise<HasilSinkron | null> {
  kosongkanCacheKontrak();
  const semua = await ambilSemuaKontrak();
  const k = semua.find((x) => x.id === id);
  const induk = k?.kontrakIndukId != null ? semua.find((x) => x.id === k.kontrakIndukId) : k;
  if (!induk) return null;
  const ke = berakhirEfektifSeharusnya(induk, semua);
  if (ke === induk.berakhirEfektif) return { indukId: induk.id, dari: induk.berakhirEfektif, ke, berubah: false };
  await graph(`${ITEMS}/${induk.id}/fields`, { method: "PATCH", json: { BerakhirEfektif: dariYmd(ke) } });
  kosongkanCacheKontrak();
  return { indukId: induk.id, dari: induk.berakhirEfektif, ke, berubah: true };
}

export interface HasilRekonsiliasi {
  diperiksa: number;
  diperbaiki: SelisihBerakhirEfektif[];
  gagal: { nomor: string; pesan: string }[];
}

/** Kontrak Aktif yang BerakhirEfektif-nya perlu dirapikan, dari data segar. Tidak menulis apa pun. */
export async function periksaBerakhirEfektif(): Promise<{ diperiksa: number; selisih: SelisihBerakhirEfektif[] }> {
  kosongkanCacheKontrak();
  const semua = await ambilSemuaKontrak();
  return { diperiksa: semua.filter((k) => k.status === "Aktif" && k.kontrakIndukId == null).length, selisih: selisihBerakhirEfektif(semua) };
}

/**
 * Rekonsiliasi Admin (U24): isi atau perbaiki BerakhirEfektif semua kontrak Aktif sekaligus, termasuk data lama
 * yang kolomnya masih kosong. Ditulis bertiga-tiga; satu kegagalan tidak menghentikan sisanya.
 */
export async function rekonsiliasiBerakhirEfektif(onProgres?: (selesai: number, total: number) => void): Promise<HasilRekonsiliasi> {
  const { diperiksa, selisih } = await periksaBerakhirEfektif();
  const diperbaiki: SelisihBerakhirEfektif[] = [];
  const gagal: HasilRekonsiliasi["gagal"] = [];
  let selesai = 0;
  onProgres?.(0, selisih.length);
  const antrean = [...selisih];
  const pekerja = async () => {
    for (let s = antrean.shift(); s; s = antrean.shift()) {
      try {
        await graph(`${ITEMS}/${s.id}/fields`, { method: "PATCH", json: { BerakhirEfektif: dariYmd(s.ke) } });
        diperbaiki.push(s);
      } catch (err) {
        gagal.push({ nomor: s.nomor, pesan: pesanError(err) });
      }
      onProgres?.(++selesai, selisih.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, selisih.length) }, pekerja));
  kosongkanCacheKontrak();
  return { diperiksa, diperbaiki, gagal };
}

/**
 * Simpan "Pihak lain dan perannya" (U11) sebagai kolom pelengkap: kolom PihakLain yang belum dibuat tidak
 * menggagalkan penyimpanan identitas lain. Perubahan dicatat lama-ke-baru di riwayat.
 */
export async function simpanPihakLain(k: Kontrak, daftar: readonly PihakLain[], sesi: Sesi): Promise<{ tersimpan: boolean; peringatan: string[] }> {
  if (samaPihakLain(k.pihakLain, daftar)) return { tersimpan: true, peringatan: [] };
  const tersimpan = await tulisPelengkap(k.id, { PihakLain: bungkusPihakLain(daftar) || null });
  if (!tersimpan) return { tersimpan, peringatan: ["Daftar pihak lain belum tersimpan. Pastikan kolom PihakLain (teks beberapa baris) sudah dibuat di list Kontrak."] };
  const peringatan: string[] = [];
  await catatAktivitas(
    { kontrakId: k.id, jenis: "Perubahan", pesan: "Mengubah pihak lain dan perannya.", detail: [{ kolom: "pihak lain", dari: teksPihakLain(k.pihakLain), ke: teksPihakLain(daftar) }] },
    sesi,
  ).catch((err) => {
    console.warn("Aktivitas pihak lain gagal dicatat:", err);
    peringatan.push("Pihak lain tersimpan, tetapi catatannya belum masuk riwayat.");
  });
  return { tersimpan, peringatan };
}

export interface HasilPersetujuan {
  /** Data Persetujuan sesudah perubahan (dasar tampilan; tidak bergantung pada kolomnya sudah ada atau belum). */
  persetujuan: Persetujuan;
  /** false bila kolom Persetujuan di list Kontrak tidak bisa ditulis; catatan di riwayat tetap dibuat. */
  tersimpan: boolean;
  peringatan: string[];
}

/** Baca Persetujuan terbaru dari SharePoint supaya catatan rekan yang baru masuk tidak tertimpa. */
async function persetujuanTerbaru(k: Kontrak): Promise<Persetujuan | null> {
  try {
    return (await ambilKontrak(k.id)).persetujuan;
  } catch {
    return k.persetujuan;
  }
}

/**
 * Catat bukti persetujuan internal (K01 tahap 1): ke kolom Persetujuan di Kontrak dan ke riwayat Aktivitas.
 * Hanya pencatatan; tidak mengubah status dan tidak menahan langkah apa pun. `dokumen` adalah nama berkas
 * "Bukti Persetujuan" yang sudah diunggah pemanggil (bila ada). Kolom yang belum dibuat tidak menggagalkan:
 * catatan di riwayat tetap dibuat dan pemanggil mendapat peringatan.
 */
export async function catatPersetujuan(k: Kontrak, isian: IsianPersetujuan, dokumen: string | null, sesi: Sesi): Promise<HasilPersetujuan> {
  const item: ItemPersetujuan = {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    penyetuju: isian.penyetuju.trim().replace(/\s+/g, " "),
    ...(isian.jabatan.trim() ? { jabatan: isian.jabatan.trim().replace(/\s+/g, " ") } : {}),
    ...(isian.tanggal ? { tanggal: isian.tanggal } : {}),
    ...(isian.nomor.trim() ? { bukti: isian.nomor.trim() } : {}),
    ...(isian.catatan.trim() ? { catatan: isian.catatan.trim() } : {}),
    ...(dokumen ? { dokumen } : {}),
    dicatat: new Date().toISOString(),
    oleh: sesi.nama,
  };
  const baru = tambahPersetujuan(await persetujuanTerbaru(k), item);
  const peringatan: string[] = [];
  const tersimpan = await tulisPelengkap(k.id, { Persetujuan: JSON.stringify(baru) });
  if (!tersimpan) peringatan.push("Persetujuan masuk riwayat, tetapi belum tersimpan di data kontrak. Pastikan kolom Persetujuan (teks beberapa baris) sudah dibuat di list Kontrak.");
  await catatAktivitas(
    { kontrakId: k.id, jenis: dokumen ? "Dokumen" : "Perubahan", pesan: `Bukti persetujuan internal dicatat. ${teksPersetujuan(item, formatTanggal)}${item.catatan ? ` Catatan: ${item.catatan}` : ""}` },
    sesi,
  ).catch((err) => {
    console.warn("Aktivitas persetujuan gagal dicatat:", err);
    peringatan.push("Persetujuan tersimpan, tetapi catatannya belum masuk riwayat.");
  });
  return { persetujuan: baru, tersimpan, peringatan };
}

/** Hapus satu catatan persetujuan yang salah ketik; tercatat di riwayat. Berkas buktinya tidak ikut terhapus. */
export async function hapusCatatanPersetujuan(k: Kontrak, id: string, sesi: Sesi): Promise<HasilPersetujuan> {
  const lama = await persetujuanTerbaru(k);
  const dihapus = daftarPersetujuan(lama).find((x) => x.id === id);
  const baru = hapusPersetujuan(lama, id);
  const peringatan: string[] = [];
  const tersimpan = await tulisPelengkap(k.id, { Persetujuan: baru.items.length ? JSON.stringify(baru) : null });
  if (!tersimpan) peringatan.push("Catatan persetujuan belum terhapus dari data kontrak. Coba lagi.");
  if (dihapus) {
    await catatAktivitas({ kontrakId: k.id, jenis: "Perubahan", pesan: `Catatan persetujuan dihapus. ${teksPersetujuan(dihapus, formatTanggal)}` }, sesi).catch((err) => {
      console.warn("Aktivitas hapus persetujuan gagal dicatat:", err);
      peringatan.push("Catatan dihapus, tetapi riwayatnya belum tercatat.");
    });
  }
  return { persetujuan: baru, tersimpan, peringatan };
}

export async function simpanChecklistReview(k: Kontrak, c: ChecklistReview): Promise<void> {
  kosongkanCacheKontrak();
  await graph(`${ITEMS}/${k.id}/fields`, { method: "PATCH", json: { ChecklistReview: JSON.stringify(c) } });
}

export async function simpanChecklistTtd(k: Kontrak, c: ChecklistTtd): Promise<void> {
  kosongkanCacheKontrak();
  await graph(`${ITEMS}/${k.id}/fields`, { method: "PATCH", json: { ChecklistTtd: JSON.stringify(c) } });
}

