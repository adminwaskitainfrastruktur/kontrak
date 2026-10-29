// Antrean kerja Legal (U01, U03, U05A): urutan kerja, preset filter, dan parameter URL Daftar Kontrak.
//
// Prinsip:
//   - Angka di ubin, lonceng, dan chip harus sama dengan isi daftar saat diklik. Karena itu penghitung
//     chip (hitungPreset) dan penyaring daftar (saringKerja) memakai fungsi cocok yang sama.
//   - Status Diajukan SELALU diurutkan dengan antreanLegal (lib/antrean) supaya nomor antrean yang
//     dilihat pengaju sama dengan urutan kerja Legal. Target dari pengaju hanya penanda, bukan kunci
//     urut utama antrean, agar pengaju tidak bisa melompati antrean dengan mengisi target dekat.
//   - "Lewat masa berlaku" dipisah dari "Akan berakhir", dan keduanya memakai tanggal berakhir efektif
//     (memperhitungkan addendum aktif). Addendum tidak tampil sendiri: masa berlakunya ikut induk.
//   - Kontrak dengan perpanjangan otomatis tidak masuk "Akan berakhir" (U34): yang perlu diputuskan
//     adalah batas pemberitahuannya, dan itu tampil di kelompok "Diperpanjang otomatis" (lib/masa).
//   - Ubin KPI dashboard membuka daftar dengan parameter yang menghasilkan angka sama persis (U01):
//     "Sedang diproses" = ?tahap=proses, "Kontrak aktif" = ?status=Aktif&addendum=tanpa.
//
// Modul ini murni; "hari ini" dan "sekarang" bisa diberikan pemanggil supaya teruji.
import { adalahAddendum, ringkasAddendum } from "./addendum";
import { butuhTindakan, bisaLihat } from "./alur";
import { antreanLegal } from "./antrean";
import { hariIni as hariIniJakarta } from "./format";
import { MENUNGGU_PENGAJU, levelSla, type LevelSla } from "./sla";
import { MATA_UANG, PRIORITAS, STATUS_PROSES, type Kontrak, type Prioritas, type Sesi, type Ymd } from "./types";

// --- Parameter URL ---------------------------------------------------------------------

export const PARAM_KERJA = ["tindakan", "pic", "prioritas", "berakhir", "urut", "sla", "tahap", "addendum"] as const;
export type ParamKerja = (typeof PARAM_KERJA)[number];

export const DAFTAR_URUT_KERJA = ["kerja", "target", "umur", "prioritas", "masuk", "terbaru"] as const;
export type UrutKerja = (typeof DAFTAR_URUT_KERJA)[number];

export const LABEL_URUT_KERJA: Record<UrutKerja, string> = {
  kerja: "Urutan kerja",
  target: "Target terdekat",
  umur: "Paling lama di tahap",
  prioritas: "Prioritas",
  masuk: "Paling awal masuk",
  terbaru: "Terbaru",
};

/** sla=lewat: tahap milik Legal melewati SLA; sla=hampir: mendekati SLA; sla=target: lewat target selesai. */
export type FilterSla = "lewat" | "hampir" | "target";

/** tahap=proses: Diajukan sampai Proses Tanda Tangan; tahap=selesai: sudah selesai diproses (Aktif, Berakhir, Ditolak, Dibatalkan). */
export type TahapDaftar = "proses" | "selesai";

export interface FilterKerja {
  /** ?tindakan=saya: hanya yang menunggu tindakan pengguna ini (sama dengan butuhTindakan). */
  tindakan: boolean;
  /** ?pic=kosong | saya | <email>. */
  pic: string | null;
  /** ?prioritas=Mendesak,Tinggi */
  prioritas: Prioritas[];
  /**
   * ?berakhir=90 (akan berakhir dalam N hari, tanpa perpanjangan otomatis), ?berakhir=lewat (lewat masa
   * berlaku), atau ?berakhir=berlaku (Aktif dan masa berlakunya belum lewat, sama dengan komitmen di Laporan).
   */
  berakhir: number | "lewat" | "berlaku" | null;
  urut: UrutKerja | null;
  sla: FilterSla | null;
  /** ?tahap=proses | selesai. Hanya ada bila dipasang di URL. */
  tahap?: TahapDaftar;
  /** ?addendum=tanpa: hanya kontrak induk, addendum disembunyikan. Hanya ada bila dipasang di URL. */
  addendum?: "tanpa";
}

export const FILTER_KERJA_KOSONG: Readonly<FilterKerja> = Object.freeze({ tindakan: false, pic: null, prioritas: [], berakhir: null, urut: null, sla: null });

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Baca filter kerja dari URL. Nilai yang tidak dikenal diabaikan (bukan galat). */
export function bacaFilterKerja(params: URLSearchParams): FilterKerja {
  const pic = (params.get("pic") ?? "").trim().toLowerCase();
  const prioritas = (params.get("prioritas") ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .map((x) => PRIORITAS.find((p) => p.toLowerCase() === x))
    .filter((x): x is Prioritas => !!x);
  const b = (params.get("berakhir") ?? "").trim().toLowerCase();
  const nHari = Number(b);
  const urut = (params.get("urut") ?? "").trim().toLowerCase();
  const sla = (params.get("sla") ?? "").trim().toLowerCase();
  const tahap = (params.get("tahap") ?? "").trim().toLowerCase();
  const addendum = (params.get("addendum") ?? "").trim().toLowerCase();
  return {
    tindakan: (params.get("tindakan") ?? "").trim().toLowerCase() === "saya",
    pic: pic === "kosong" || pic === "saya" || POLA_EMAIL.test(pic) ? pic : null,
    prioritas: PRIORITAS.filter((x) => prioritas.includes(x)),
    berakhir: b === "lewat" || b === "berlaku" ? b : b && Number.isInteger(nHari) && nHari > 0 && nHari <= 3650 ? nHari : null,
    urut: (DAFTAR_URUT_KERJA as readonly string[]).includes(urut) ? (urut as UrutKerja) : null,
    sla: sla === "lewat" || sla === "hampir" || sla === "target" ? sla : null,
    // Dua penyaring tambahan hanya muncul bila ada di URL, supaya bentuk filter lama tidak berubah.
    ...(tahap === "proses" || tahap === "selesai" ? { tahap } : {}),
    ...(addendum === "tanpa" ? { addendum } : {}),
  };
}

/**
 * Tulis filter kerja ke URL. Parameter lain di `dasar` (q, status, jenis, divisi, ...) dipertahankan;
 * semua parameter kerja ditulis ulang. Urutan prioritas mengikuti urutan baku supaya URL stabil.
 */
export function tulisFilterKerja(f: Partial<FilterKerja>, dasar: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const p = new URLSearchParams(dasar);
  for (const k of PARAM_KERJA) p.delete(k);
  if (f.tindakan) p.set("tindakan", "saya");
  if (f.pic) p.set("pic", f.pic.trim().toLowerCase());
  if (f.prioritas?.length) p.set("prioritas", PRIORITAS.filter((x) => f.prioritas!.includes(x)).join(","));
  if (f.berakhir != null) p.set("berakhir", String(f.berakhir));
  if (f.urut) p.set("urut", f.urut);
  if (f.sla) p.set("sla", f.sla);
  if (f.tahap) p.set("tahap", f.tahap);
  if (f.addendum) p.set("addendum", f.addendum);
  return p;
}

export function filterKerjaKosong(f: FilterKerja): boolean {
  return !f.tindakan && !f.pic && f.prioritas.length === 0 && f.berakhir == null && !f.sla && !f.tahap && !f.addendum;
}

// --- Pencocokan ------------------------------------------------------------------------

export interface KonteksKerja {
  sesi: Sesi;
  /** Semua kontrak (dipakai untuk tanggal berakhir efektif dari addendum). */
  semua: readonly Kontrak[];
  /** "Hari ini" (YYYY-MM-DD, Jakarta). Bawaan: hari ini menurut lib/format. */
  hariIni?: Ymd;
  /** Waktu sekarang (ms) untuk umur tahap. */
  sekarang?: number;
  /** Level SLA per kontrak. Bawaan: levelSla dari lib/sla; isi dengan levelSlaPengaturan agar angka dari Pengaturan dipakai. */
  level?: (k: Kontrak) => LevelSla;
}

/** Selisih hari kalender b - a untuk dua tanggal YYYY-MM-DD. */
export function selisihYmd(a: Ymd, b: Ymd): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Tanggal berakhir efektif: dihitung dari addendum aktif bila datanya ada, jatuh ke kolom BerakhirEfektif lalu TanggalBerakhir. */
export function tanggalBerakhirEfektif(k: Kontrak, semua: readonly Kontrak[]): Ymd | null {
  if (adalahAddendum(k)) return k.tanggalBerakhir;
  const hitung = ringkasAddendum(k, semua as Kontrak[]).berakhirEfektif;
  return hitung ?? k.berakhirEfektif ?? k.tanggalBerakhir;
}

/** Peta id -> tanggal berakhir efektif untuk kontrak Aktif non-addendum, dihitung sekali per daftar. */
export function petaBerakhirEfektif(semua: readonly Kontrak[]): Map<number, Ymd | null> {
  const peta = new Map<number, Ymd | null>();
  for (const k of semua) if (k.status === "Aktif" && !adalahAddendum(k)) peta.set(k.id, tanggalBerakhirEfektif(k, semua));
  return peta;
}

/** Kontrak Aktif non-addendum yang tanggal berakhir efektifnya sudah lewat. */
export function lewatMasaBerlaku(k: Kontrak, efektif: Ymd | null, hariIni: Ymd): boolean {
  return k.status === "Aktif" && !adalahAddendum(k) && !!efektif && selisihYmd(hariIni, efektif) < 0;
}

/**
 * Kontrak Aktif non-addendum yang berakhir dalam 0..hari dari hari ini (yang sudah lewat TIDAK termasuk).
 * Kontrak dengan perpanjangan otomatis tidak dihitung (U34): ia tidak "berakhir" kecuali diberi tahu, jadi
 * tampil di kelompok "Diperpanjang otomatis" dengan batas keputusannya (lib/masa), bukan di sini.
 */
export function akanBerakhir(k: Kontrak, efektif: Ymd | null, hariIni: Ymd, hari: number): boolean {
  if (k.status !== "Aktif" || adalahAddendum(k) || !efektif || k.perpanjanganOtomatis) return false;
  const sisa = selisihYmd(hariIni, efektif);
  return sisa >= 0 && sisa <= hari;
}

/** Kontrak Aktif non-addendum yang masa berlaku efektifnya belum lewat (atau tanpa tanggal berakhir). */
export function masihBerlakuPada(k: Kontrak, efektif: Ymd | null, hariIni: Ymd): boolean {
  return k.status === "Aktif" && !adalahAddendum(k) && (!efektif || selisihYmd(hariIni, efektif) >= 0);
}

/** Lewat target selesai yang diisi pengaju, hanya untuk kontrak yang masih diproses. */
export function lewatTargetPada(k: Kontrak, hariIni: Ymd): boolean {
  return !!k.targetSelesai && STATUS_PROSES.includes(k.status) && selisihYmd(hariIni, k.targetSelesai) < 0;
}

interface KonteksSiap {
  sesi: Sesi;
  hariIni: Ymd;
  efektif: Map<number, Ymd | null>;
  level: (k: Kontrak) => LevelSla;
}

function siapkan(ctx: KonteksKerja): KonteksSiap {
  const sekarang = ctx.sekarang;
  return {
    sesi: ctx.sesi,
    hariIni: ctx.hariIni ?? hariIniJakarta(),
    efektif: petaBerakhirEfektif(ctx.semua),
    level: ctx.level ?? ((k) => levelSla(k, sekarang)),
  };
}

function cocokPic(k: Kontrak, pic: string, sesi: Sesi): boolean {
  const e = k.picLegalEmail.trim().toLowerCase();
  if (pic === "kosong") return !e && STATUS_PROSES.includes(k.status);
  if (pic === "saya") return e === sesi.email.toLowerCase();
  return e === pic;
}

/**
 * Cakupan ?tahap= dan ?addendum=tanpa saja. Dipakai juga untuk angka chip status di Daftar Kontrak, supaya chip
 * "Semua" sama dengan jumlah baris (dan dengan ubin KPI yang membukanya).
 */
export function dalamCakupan(k: Kontrak, f: Pick<FilterKerja, "tahap" | "addendum">): boolean {
  if (f.tahap && STATUS_PROSES.includes(k.status) !== (f.tahap === "proses")) return false;
  return !(f.addendum === "tanpa" && adalahAddendum(k));
}

function cocok(k: Kontrak, f: FilterKerja, c: KonteksSiap): boolean {
  if (f.tindakan && !butuhTindakan(k, c.sesi)) return false;
  if (f.pic && !cocokPic(k, f.pic, c.sesi)) return false;
  if (f.prioritas.length && !f.prioritas.includes(k.prioritas)) return false;
  if (!dalamCakupan(k, f)) return false;
  if (f.berakhir === "lewat" && !lewatMasaBerlaku(k, c.efektif.get(k.id) ?? null, c.hariIni)) return false;
  if (f.berakhir === "berlaku" && !masihBerlakuPada(k, c.efektif.get(k.id) ?? null, c.hariIni)) return false;
  if (typeof f.berakhir === "number" && !akanBerakhir(k, c.efektif.get(k.id) ?? null, c.hariIni, f.berakhir)) return false;
  if (f.sla === "target" && !lewatTargetPada(k, c.hariIni)) return false;
  if (f.sla === "lewat" || f.sla === "hampir") {
    // Tahap yang menunggu pengaju (Perlu Revisi) bukan kinerja Legal, jadi tidak pernah masuk "lewat SLA".
    if (MENUNGGU_PENGAJU.includes(k.status)) return false;
    const lv = c.level(k);
    if (f.sla === "lewat" ? lv !== "lewat" : lv !== "hampir") return false;
  }
  return true;
}

/** Satu kontrak cocok dengan filter kerja (tanpa memeriksa hak lihat). */
export function cocokFilterKerja(k: Kontrak, f: FilterKerja, ctx: KonteksKerja): boolean {
  return cocok(k, f, siapkan(ctx));
}

// --- Urutan ------------------------------------------------------------------------------

const BOBOT_PRIORITAS: Record<Prioritas, number> = { Mendesak: 0, Tinggi: 1, Normal: 2 };
const sejak = (k: Kontrak) => k.statusSejak ?? k.tanggalDiajukan ?? k.dibuat;
const masuk = (k: Kontrak) => k.tanggalDiajukan ?? k.dibuat;

function grupKerja(k: Kontrak): number {
  if (k.status === "Diajukan") return 0;
  if (k.status === "Review Legal" || k.status === "Proses Tanda Tangan") return 1;
  if (k.status === "Perlu Revisi") return 2;
  return 3;
}

/** 0 lewat target, 1 target dalam 7 hari, 2 lainnya. */
function ember(k: Kontrak, hariIni: Ymd): number {
  if (!k.targetSelesai) return 2;
  const sisa = selisihYmd(hariIni, k.targetSelesai);
  return sisa < 0 ? 0 : sisa <= 7 ? 1 : 2;
}

/**
 * Urutan kerja Legal:
 *   1. Diajukan, persis urutan antreanLegal (prioritas lalu waktu pengajuan).
 *   2. Review Legal dan Proses Tanda Tangan: lewat target dulu, lalu target dalam 7 hari, lalu sisanya;
 *      di dalamnya prioritas, tanggal target terdekat, lalu yang paling lama di tahapnya.
 *   3. Perlu Revisi (menunggu pengaju), dengan kunci yang sama.
 *   4. Status lain (Aktif, Berakhir, ...), terbaru di atas.
 * Kontrak yang tidak boleh dilihat sesi dibuang.
 */
export function urutKerjaLegal(kontrak: readonly Kontrak[], sesi: Sesi, opsi: { hariIni?: Ymd } = {}): Kontrak[] {
  const hariIni = opsi.hariIni ?? hariIniJakarta();
  const terlihat = kontrak.filter((k) => bisaLihat(k, sesi));
  const antre = antreanLegal(terlihat);
  const sisa = terlihat
    .filter((k) => k.status !== "Diajukan")
    .sort((a, b) => {
      const ga = grupKerja(a);
      const gb = grupKerja(b);
      if (ga !== gb) return ga - gb;
      if (ga === 3) return b.dibuat.localeCompare(a.dibuat) || b.id - a.id;
      return (
        ember(a, hariIni) - ember(b, hariIni) ||
        BOBOT_PRIORITAS[a.prioritas] - BOBOT_PRIORITAS[b.prioritas] ||
        (a.targetSelesai ?? "9999").localeCompare(b.targetSelesai ?? "9999") ||
        sejak(a).localeCompare(sejak(b)) ||
        a.id - b.id
      );
    });
  return [...antre, ...sisa];
}

/** Urutkan menurut ?urut. `null` membiarkan urutan masukan (urutan kolom tabel yang berlaku). */
export function urutkanKerja(kontrak: readonly Kontrak[], urut: UrutKerja | null, ctx: KonteksKerja): Kontrak[] {
  const daftar = [...kontrak];
  switch (urut) {
    case null:
      return daftar;
    case "kerja":
      return urutKerjaLegal(daftar, ctx.sesi, { hariIni: ctx.hariIni });
    case "target":
      return daftar.sort((a, b) => (a.targetSelesai ?? "9999").localeCompare(b.targetSelesai ?? "9999") || BOBOT_PRIORITAS[a.prioritas] - BOBOT_PRIORITAS[b.prioritas] || a.id - b.id);
    case "umur":
      return daftar.sort((a, b) => sejak(a).localeCompare(sejak(b)) || a.id - b.id);
    case "prioritas":
      return daftar.sort((a, b) => BOBOT_PRIORITAS[a.prioritas] - BOBOT_PRIORITAS[b.prioritas] || masuk(a).localeCompare(masuk(b)) || a.id - b.id);
    case "masuk":
      return daftar.sort((a, b) => masuk(a).localeCompare(masuk(b)) || a.id - b.id);
    case "terbaru":
      return daftar.sort((a, b) => b.dibuat.localeCompare(a.dibuat) || b.id - a.id);
  }
}

/** Saring (hak lihat + filter kerja) lalu urutkan menurut ?urut. */
export function saringKerja(kontrak: readonly Kontrak[], f: FilterKerja, ctx: KonteksKerja): Kontrak[] {
  const c = siapkan(ctx);
  const hasil = kontrak.filter((k) => bisaLihat(k, ctx.sesi) && cocok(k, f, c));
  return urutkanKerja(hasil, f.urut, { ...ctx, hariIni: c.hariIni });
}

// --- Preset (chip di Daftar Kontrak) ---------------------------------------------------

export const ID_PRESET = ["antrean-saya", "tanpa-pic", "lewat-target", "akan-berakhir", "lewat-masa"] as const;
export type IdPreset = (typeof ID_PRESET)[number];
/**
 * Semua chip di Daftar Kontrak: preset kerja ditambah "Selesai" (U18, untuk arsip). "Selesai" sengaja tidak
 * dimasukkan ke ID_PRESET supaya pemakai lama yang memetakan setiap IdPreset (mis. ikon Ctrl+K) tetap utuh.
 */
export const ID_PRESET_DAFTAR = [...ID_PRESET, "selesai"] as const;
export type IdPresetDaftar = (typeof ID_PRESET_DAFTAR)[number];

export interface PresetKerja<Id extends IdPresetDaftar = IdPreset> {
  id: Id;
  label: string;
  /** Kalimat untuk title/tooltip chip dan teks kosong. */
  keterangan: string;
  /** Parameter URL yang dipasang chip ini. */
  param: Partial<Record<ParamKerja, string>>;
  nada: "netral" | "peringatan" | "bahaya";
  /** Teks saat hasilnya kosong, hangat dan tidak kaku. */
  kosong: string;
}

export const HARI_AKAN_BERAKHIR = 90;

export const PRESET_KERJA: readonly PresetKerja[] = [
  { id: "antrean-saya", label: "Antrean saya", keterangan: "Pengajuan baru, review, dan tanda tangan yang Anda pegang atau yang belum ber-PIC.", param: { tindakan: "saya", urut: "kerja" }, nada: "netral", kosong: "Antrean Anda bersih. Saat ada pengajuan baru, ia muncul di sini." },
  { id: "tanpa-pic", label: "Belum ada PIC", keterangan: "Kontrak yang masih diproses tetapi belum punya PIC Legal.", param: { pic: "kosong", urut: "kerja" }, nada: "peringatan", kosong: "Semua kontrak yang berjalan sudah punya PIC." },
  { id: "lewat-target", label: "Lewat target", keterangan: "Kontrak yang masih diproses dan sudah melewati target selesai dari pengaju.", param: { sla: "target", urut: "target" }, nada: "bahaya", kosong: "Tidak ada yang lewat target. Pertahankan ritmenya." },
  { id: "akan-berakhir", label: `Akan berakhir ${HARI_AKAN_BERAKHIR} hari`, keterangan: `Kontrak aktif yang berakhir dalam ${HARI_AKAN_BERAKHIR} hari ke depan, sudah memperhitungkan addendum.`, param: { berakhir: String(HARI_AKAN_BERAKHIR) }, nada: "peringatan", kosong: `Tidak ada kontrak aktif yang berakhir dalam ${HARI_AKAN_BERAKHIR} hari.` },
  { id: "lewat-masa", label: "Lewat masa berlaku", keterangan: "Kontrak berstatus Aktif yang tanggal berakhir efektifnya sudah lewat dan perlu ditutup atau diperpanjang.", param: { berakhir: "lewat" }, nada: "bahaya", kosong: "Tidak ada kontrak aktif yang lewat masa berlaku." },
];

/** Preset "Selesai" (U18): kontrak yang sudah selesai diproses, bahan paket arsip ZIP di halaman detail. */
export const PRESET_SELESAI: PresetKerja<"selesai"> = {
  id: "selesai",
  label: "Selesai",
  keterangan: "Kontrak yang sudah selesai diproses: Aktif, Berakhir, Ditolak, atau Dibatalkan. Paket arsip ZIP bisa diunduh dari halaman detailnya.",
  param: { tahap: "selesai", urut: "terbaru" },
  nada: "netral",
  kosong: "Belum ada kontrak yang selesai diproses.",
};

/** Urutan chip di Daftar Kontrak. */
export const PRESET_DAFTAR: readonly PresetKerja<IdPresetDaftar>[] = [...PRESET_KERJA, PRESET_SELESAI];

export function presetById(id: IdPresetDaftar): PresetKerja<IdPresetDaftar> {
  return PRESET_DAFTAR.find((p) => p.id === id)!;
}

/** Filter kerja dari sebuah preset. */
export function filterPreset(id: IdPresetDaftar): FilterKerja {
  return bacaFilterKerja(new URLSearchParams(presetById(id).param as Record<string, string>));
}

/** Query string preset, mis. "?tindakan=saya&urut=kerja", untuk ubin KPI, lonceng, dan Ctrl+K. */
export function kueriPreset(id: IdPresetDaftar): string {
  return `?${new URLSearchParams(presetById(id).param as Record<string, string>).toString()}`;
}

/** Preset yang aktif menurut URL: semua parameter penyaringnya (selain urut) sama persis. */
export function presetAktif(params: URLSearchParams): IdPresetDaftar | null {
  for (const p of PRESET_DAFTAR) {
    const kunci = (Object.keys(p.param) as ParamKerja[]).filter((k) => k !== "urut");
    const lainKosong = PARAM_KERJA.filter((k) => k !== "urut" && !kunci.includes(k)).every((k) => !params.get(k));
    if (lainKosong && kunci.every((k) => (params.get(k) ?? "").toLowerCase() === p.param[k])) return p.id;
  }
  return null;
}

/**
 * Klik chip: bila preset itu sedang aktif, lepaskan; bila tidak, ganti filter kerja dengan preset itu.
 * Parameter lain (q, jenis, divisi) dipertahankan. Parameter status dilepas karena preset sudah
 * menentukan statusnya sendiri; kalau dibiarkan, angka chip dan isi daftar bisa berbeda.
 */
export function alihPreset(params: URLSearchParams, id: IdPresetDaftar): URLSearchParams {
  const p = new URLSearchParams(params);
  for (const k of PARAM_KERJA) p.delete(k);
  p.delete("status");
  if (presetAktif(params) === id) return p;
  for (const [k, v] of Object.entries(presetById(id).param)) if (v) p.set(k, v);
  return p;
}

/** Jumlah per preset, dihitung dengan pencocok yang sama dengan daftar (setelah hak lihat). */
export function hitungPreset(kontrak: readonly Kontrak[], ctx: KonteksKerja): Record<IdPresetDaftar, number> {
  const c = siapkan(ctx);
  const filter = Object.fromEntries(ID_PRESET_DAFTAR.map((id) => [id, filterPreset(id)])) as Record<IdPresetDaftar, FilterKerja>;
  const hasil = Object.fromEntries(ID_PRESET_DAFTAR.map((id) => [id, 0])) as Record<IdPresetDaftar, number>;
  for (const k of kontrak) {
    if (!bisaLihat(k, ctx.sesi)) continue;
    for (const id of ID_PRESET_DAFTAR) if (cocok(k, filter[id], c)) hasil[id]++;
  }
  return hasil;
}

/** Ringkasan filter aktif dalam kalimat, untuk judul daftar dan pembaca layar. */
export function ringkasFilterKerja(f: FilterKerja, namaPic?: (email: string) => string): string[] {
  const bagian: string[] = [];
  if (f.tindakan) bagian.push("menunggu tindakan Anda");
  if (f.pic === "kosong") bagian.push("belum ada PIC");
  else if (f.pic === "saya") bagian.push("PIC: Anda");
  else if (f.pic) bagian.push(`PIC: ${namaPic?.(f.pic) ?? f.pic}`);
  if (f.prioritas.length) bagian.push(`prioritas ${f.prioritas.join(" atau ")}`);
  if (f.tahap === "proses") bagian.push("sedang diproses");
  else if (f.tahap === "selesai") bagian.push("selesai diproses");
  if (f.addendum === "tanpa") bagian.push("tanpa addendum");
  if (f.berakhir === "lewat") bagian.push("lewat masa berlaku");
  else if (f.berakhir === "berlaku") bagian.push("masih berlaku");
  else if (f.berakhir != null) bagian.push(`berakhir dalam ${f.berakhir} hari`);
  if (f.sla === "target") bagian.push("lewat target");
  else if (f.sla === "lewat") bagian.push("melewati SLA tahap");
  else if (f.sla === "hampir") bagian.push("mendekati SLA tahap");
  return bagian;
}

// --- Pencarian, proyek, dan urutan nilai (U12, U29A) -----------------------------------------

/**
 * Pencarian bebas di Daftar Kontrak: judul, nomor pengajuan/kontrak, mitra, pengaju, PIC, kode proyek,
 * dan nomor referensi PR/PO/SPK (boleh berisi beberapa nomor dipisah koma; cukup cocok sebagian).
 */
export function cocokCari(k: Kontrak, q: string): boolean {
  const kata = q.trim().toLowerCase();
  if (!kata) return true;
  return [k.judul, k.nomorPengajuan, k.nomorKontrak, k.mitra, k.pengajuNama, k.picLegalNama, k.kodeProyek, k.nomorReferensi].some((v) => (v ?? "").toLowerCase().includes(kata));
}

/**
 * ?periksa=mata-uang di Daftar Kontrak: hanya addendum yang mata uangnya berbeda dari induknya (U29A,
 * lib/addendum addendumBedaMataUang). Bukan filter kerja; tautannya dipakai peringatan di dashboard.
 */
export const PERIKSA_MATA_UANG = "mata-uang";

/** Nilai ?proyek= untuk kontrak yang kolom proyeknya kosong. */
export const PROYEK_TANPA = "tanpa";
/** Label pilihan "tanpa proyek" di isian filter (datalist). */
export const LABEL_TANPA_PROYEK = "Tanpa proyek";

const rapiProyek = (v: string) => v.trim().replace(/\s+/g, " ");

/** Kode proyek yang ada (unik tanpa membedakan huruf besar, dirapikan), urut abjad, untuk datalist. */
export function daftarProyek(kontrak: readonly Kontrak[]): string[] {
  const peta = new Map<string, string>();
  for (const k of kontrak) {
    const v = rapiProyek(k.kodeProyek ?? "");
    if (v && !peta.has(v.toLowerCase())) peta.set(v.toLowerCase(), v);
  }
  return [...peta.values()].sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
}

/**
 * Saring menurut ?proyek=. "tanpa" = kolom proyek kosong. Bila nilainya sama persis (tanpa membedakan huruf
 * besar) dengan proyek yang ada, hanya proyek itu yang cocok (P-01 tidak ikut memuat P-010); bila tidak,
 * dicocokkan sebagian supaya mengetik "tol" langsung menyaring.
 */
export function saringProyek<T extends Pick<Kontrak, "kodeProyek">>(kontrak: readonly T[], proyek: string): T[] {
  const cari = rapiProyek(proyek).toLowerCase();
  if (!cari) return [...kontrak];
  if (cari === PROYEK_TANPA || cari === LABEL_TANPA_PROYEK.toLowerCase()) return kontrak.filter((k) => !rapiProyek(k.kodeProyek ?? ""));
  const nilai = (k: T) => rapiProyek(k.kodeProyek ?? "").toLowerCase();
  const persis = kontrak.some((k) => nilai(k) === cari);
  return kontrak.filter((k) => (persis ? nilai(k) === cari : nilai(k).includes(cari)));
}

/**
 * Pembanding kolom Nilai (U29A): dikelompokkan per mata uang dengan urutan tetap IDR, USD, EUR, SGD, lalu
 * nilai naik atau turun di dalam kelompoknya. Kontrak tanpa nilai selalu di akhir. Rp 5 juta tidak pernah
 * lagi terselip di antara USD 300 ribu hanya karena angkanya lebih besar.
 */
export function bandingNilai(a: Pick<Kontrak, "nilai" | "mataUang">, b: Pick<Kontrak, "nilai" | "mataUang">, arah: "asc" | "desc"): number {
  if (a.nilai == null || b.nilai == null) return a.nilai == null ? (b.nilai == null ? 0 : 1) : -1;
  const ia = MATA_UANG.indexOf(a.mataUang);
  const ib = MATA_UANG.indexOf(b.mataUang);
  if (ia !== ib) return (ia < 0 ? MATA_UANG.length : ia) - (ib < 0 ? MATA_UANG.length : ib);
  return (a.nilai - b.nilai) * (arah === "asc" ? 1 : -1);
}

// --- Syarat "Tandai Berakhir" massal (U04) -------------------------------------------------

/** Addendum berstatus Aktif milik sebuah kontrak induk: ikut diakhiri bersama induknya. */
export function addendumAktifInduk(induk: Pick<Kontrak, "id">, semua: readonly Kontrak[]): Kontrak[] {
  return semua.filter((x) => x.kontrakIndukId === induk.id && adalahAddendum(x) && x.status === "Aktif").sort((a, b) => (a.urutanAddendum ?? 0) - (b.urutanAddendum ?? 0));
}

/** null bila kontrak boleh ditandai Berakhir secara massal; selain itu alasan singkatnya. */
export function alasanTakBisaDiakhiri(k: Kontrak, semua: readonly Kontrak[], hariIni: Ymd): string | null {
  if (adalahAddendum(k)) return "addendum ikut berakhir bersama induknya";
  if (k.status !== "Aktif") return `berstatus ${k.status}`;
  const efektif = tanggalBerakhirEfektif(k, semua);
  if (!efektif) return "belum punya tanggal berakhir";
  if (selisihYmd(hariIni, efektif) >= 0) return "masa berlakunya belum lewat";
  return null;
}

/** Semua terpilih harus Aktif, bukan addendum, dan sudah lewat masa berlaku efektifnya. */
export function bisaAkhiriMassal(terpilih: readonly Kontrak[], semua: readonly Kontrak[], hariIni: Ymd): { boleh: boolean; alasan: string } {
  if (terpilih.length === 0) return { boleh: false, alasan: "Belum ada kontrak yang dipilih." };
  for (const k of terpilih) {
    const a = alasanTakBisaDiakhiri(k, semua, hariIni);
    if (a) return { boleh: false, alasan: `${k.nomorKontrak || k.nomorPengajuan} ${a}. Tandai Berakhir massal hanya untuk kontrak Aktif yang lewat masa berlaku.` };
  }
  return { boleh: true, alasan: "" };
}

// --- Daftar terakhir (untuk tombol kembali di halaman detail) ---------------------------

/** Kunci sessionStorage berisi alamat daftar terakhir, mis. "/kontrak?tindakan=saya&urut=kerja". */
export const KUNCI_DAFTAR_TERAKHIR = "kontrak-daftar-terakhir";

/**
 * Alamat Daftar Kontrak terakhir beserta filternya, supaya tombol kembali di detail bisa memulihkan
 * filter. Selalu jatuh ke "/kontrak" bila tidak ada atau penyimpanan diblokir.
 */
export function alamatDaftarTerakhir(): string {
  try {
    const v = sessionStorage.getItem(KUNCI_DAFTAR_TERAKHIR);
    return v && (v === "/kontrak" || v.startsWith("/kontrak?")) ? v : "/kontrak";
  } catch {
    return "/kontrak";
  }
}

export function simpanDaftarTerakhir(kueri: string) {
  try {
    sessionStorage.setItem(KUNCI_DAFTAR_TERAKHIR, kueri ? `/kontrak?${kueri}` : "/kontrak");
  } catch {
    /* penyimpanan diblokir: tombol kembali jatuh ke /kontrak */
  }
}
