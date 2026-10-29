// Pengaturan aplikasi (K05). Disimpan di list "Pengaturan Kontrak": satu baris per kunci, Title = kunci,
// NilaiJson = nilai dalam JSON. Power Automate membaca baris yang sama, jadi nama kunci dan bentuk JSON-nya
// adalah kontrak antara aplikasi dan flow: jangan diganti tanpa mengubah flow.
//
// Modul ini murni. Nilai rusak atau di luar batas selalu jatuh ke bawaan di kode, sehingga list yang kosong,
// terhapus, atau diisi tangan dengan salah tidak pernah menghentikan aplikasi.

import { bacaNilai } from "./format";
import { SLA_HARI } from "./slaBawaan";
import { rentangTungguTahap, umurTahapHari, type LevelSla, type RentangTunggu } from "./sla";
import { MATRIKS_KEWENANGAN_BAWAAN, validasiMatriksKewenangan, type JenjangKewenangan } from "./kewenangan";
import { FORMAT_PENOMORAN_BAWAAN, validasiFormatPenomoranKetat, type FormatPenomoran } from "./penomoran";
import { JENIS_KONTRAK, type JenisKontrak, type Kontrak, type Status } from "./types";

/** Status yang punya batas SLA (tahap yang masih berjalan). */
export const STATUS_SLA = ["Diajukan", "Review Legal", "Perlu Revisi", "Proses Tanda Tangan"] as const satisfies readonly Status[];
export type StatusSla = (typeof STATUS_SLA)[number];

export interface AmbangEskalasi {
  /** Pengajuan berstatus Diajukan tanpa PIC lebih lama dari ini (hari) masuk blok "Perlu perhatian". */
  diajukanTanpaPicHari: number;
  /** Perlu Revisi yang tidak disentuh pengaju lebih lama dari ini (hari) ditagih. */
  revisiMenggantungHari: number;
}

export interface Pengaturan {
  /** H-sekian sebelum kontrak berakhir saat pengingat dikirim. Urut menurun, 0 = hari H. */
  hariPeringatan: number[];
  /** Batas lama tiap tahap, dalam hari. */
  sla: Record<StatusSla, number>;
  /** true: SLA dihitung dengan hari kerja (lihat `hariKerja`), false: hari kalender. */
  slaPakaiHariKerja: boolean;
  /** Hari kerja: 0 = Minggu ... 6 = Sabtu. */
  hariKerja: number[];
  /**
   * Alamat grup atau shared mailbox Legal. Bila diisi, MENGGANTIKAN daftar anggota untuk semua email tim Legal (aplikasi
   * dan flow terjadwal). Kosong = kirim ke tiap Legal dan Admin aktif.
   */
  alamatGrupLegal: string;
  /** Keterangan pengirim email (akun layanan atau shared mailbox yang dipakai flow). Hanya informasi. */
  pengirimEmail: string;
  /** Tautan channel Teams Legal (opsional, untuk kartu Teams). */
  tautanTeams: string;
  ambangEskalasi: AmbangEskalasi;
  /** H-sekian sebelum jaminan berakhir saat pengingat dikirim. */
  jaminanPeringatan: number[];
  /**
   * Format nomor kontrak resmi (U20): pola, kode per jenis, panjang nomor urut. Hanya dipakai aplikasi (usulan
   * nomor dan peringatan format saat aktivasi), tidak dibaca flow. Bawaannya standar awal sampai Legal memutuskan.
   */
  formatPenomoran: FormatPenomoran;
  /**
   * Matriks kewenangan sederhana (K01 tahap 1): rentang nilai IDR -> penyetuju dan penandatangan. Hanya dipakai
   * aplikasi sebagai rujukan di modal Lanjut ke Tanda Tangan; bukan kontrol keras. Bawaannya standar awal.
   */
  matriksKewenangan: JenjangKewenangan[];
}

export type KunciPengaturan = keyof Pengaturan;

export const DAFTAR_KUNCI: readonly KunciPengaturan[] = [
  "hariPeringatan",
  "sla",
  "slaPakaiHariKerja",
  "hariKerja",
  "alamatGrupLegal",
  "pengirimEmail",
  "tautanTeams",
  "ambangEskalasi",
  "jaminanPeringatan",
  "formatPenomoran",
  "matriksKewenangan",
];

/**
 * Flow Power Automate yang membaca tiap kunci (sesuai power-automate/alur/*.mjs). Kosong berarti hanya aplikasi
 * yang memakainya. Dipakai halaman Pengaturan supaya keterangannya sesuai kenyataan.
 */
export const PEMBACA_FLOW: Readonly<Record<KunciPengaturan, readonly string[]>> = {
  hariPeringatan: ["Pengingat harian", "Laporan bulanan"],
  jaminanPeringatan: ["Pengingat harian"],
  sla: ["Agenda pagi"],
  slaPakaiHariKerja: ["Agenda pagi"],
  hariKerja: ["Agenda pagi"],
  ambangEskalasi: ["Agenda pagi"],
  alamatGrupLegal: ["Pengingat harian", "Agenda pagi", "Laporan bulanan"],
  pengirimEmail: [],
  tautanTeams: [],
  formatPenomoran: [],
  matriksKewenangan: [],
};

/** Nama flow yang membaca salah satu kunci ini, tanpa duplikat. */
export function flowPembaca(kunci: readonly KunciPengaturan[]): string[] {
  return [...new Set(kunci.flatMap((k) => PEMBACA_FLOW[k]))];
}

function slaBawaan(): Record<StatusSla, number> {
  const hasil = {} as Record<StatusSla, number>;
  for (const s of STATUS_SLA) hasil[s] = SLA_HARI[s] ?? 7;
  return hasil;
}

export const PENGATURAN_BAWAAN: Readonly<Pengaturan> = Object.freeze({
  hariPeringatan: [90, 60, 30, 7, 0],
  sla: slaBawaan(),
  slaPakaiHariKerja: false,
  hariKerja: [1, 2, 3, 4, 5],
  alamatGrupLegal: "",
  pengirimEmail: "",
  tautanTeams: "",
  ambangEskalasi: { diajukanTanpaPicHari: 2, revisiMenggantungHari: 7 },
  jaminanPeringatan: [30, 14, 7],
  formatPenomoran: FORMAT_PENOMORAN_BAWAAN as FormatPenomoran,
  matriksKewenangan: MATRIKS_KEWENANGAN_BAWAAN as JenjangKewenangan[],
});

/** Salinan dalam bawaan, supaya pemanggil bebas mengubahnya. */
export function pengaturanBawaan(): Pengaturan {
  return JSON.parse(JSON.stringify(PENGATURAN_BAWAAN)) as Pengaturan;
}

export const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;

// --- Validasi --------------------------------------------------------------------------

export type Hasil<T> = { ok: true; nilai: T } | { ok: false; galat: string };

const ok = <T>(nilai: T): Hasil<T> => ({ ok: true, nilai });
const gagal = <T>(galat: string): Hasil<T> => ({ ok: false, galat });

const bulat = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const POLA_EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

/** Daftar hari: bilangan bulat dalam [min, maks], tanpa duplikat, diurutkan menurun. */
export function validasiDaftarHari(v: unknown, o: { min?: number; maks: number; minJumlah?: number; maksJumlah?: number }): Hasil<number[]> {
  const min = o.min ?? 0;
  if (!Array.isArray(v)) return gagal("Harus berupa daftar angka.");
  if (v.some((x) => !bulat(x))) return gagal("Hanya angka bulat yang diterima.");
  const angka = v as number[];
  const luar = angka.find((x) => x < min || x > o.maks);
  if (luar !== undefined) return gagal(`Angka ${luar} di luar batas ${min} sampai ${o.maks}.`);
  const unik = [...new Set(angka)].sort((a, b) => b - a);
  if (unik.length < (o.minJumlah ?? 1)) return gagal("Isi minimal satu angka.");
  if (unik.length > (o.maksJumlah ?? 10)) return gagal(`Paling banyak ${o.maksJumlah ?? 10} angka.`);
  return ok(unik);
}

/** Bilangan bulat dalam [min, maks]. */
export function validasiAngka(v: unknown, min: number, maks: number): Hasil<number> {
  if (!bulat(v)) return gagal("Harus angka bulat.");
  if (v < min || v > maks) return gagal(`Isi antara ${min} dan ${maks}.`);
  return ok(v);
}

export function validasiEmailOpsional(v: unknown): Hasil<string> {
  if (typeof v !== "string") return gagal("Harus berupa teks.");
  const t = v.trim().toLowerCase();
  if (!t) return ok("");
  return POLA_EMAIL.test(t) ? ok(t) : gagal("Format email belum benar, contoh: legal@waskitainfrastruktur.co.id.");
}

export function validasiTautanOpsional(v: unknown): Hasil<string> {
  if (typeof v !== "string") return gagal("Harus berupa teks.");
  const t = v.trim();
  if (!t) return ok("");
  try {
    const u = new URL(t);
    return u.protocol === "https:" ? ok(t) : gagal("Tautan harus diawali https://.");
  } catch {
    return gagal("Tautan belum valid.");
  }
}

/** Validasi dan normalkan nilai satu kunci. Dipakai saat membaca dari SharePoint dan saat menyimpan. */
export function validasiNilai<K extends KunciPengaturan>(kunci: K, v: unknown): Hasil<Pengaturan[K]> {
  const hasil = validasiApaAdanya(kunci, v);
  return hasil as Hasil<Pengaturan[K]>;
}

function validasiApaAdanya(kunci: KunciPengaturan, v: unknown): Hasil<unknown> {
  switch (kunci) {
    case "hariPeringatan":
      return validasiDaftarHari(v, { maks: 730 });
    case "jaminanPeringatan":
      return validasiDaftarHari(v, { maks: 365 });
    case "hariKerja": {
      const h = validasiDaftarHari(v, { maks: 6, maksJumlah: 7 });
      return h.ok ? ok([...h.nilai].sort((a, b) => a - b)) : h;
    }
    case "slaPakaiHariKerja":
      return typeof v === "boolean" ? ok(v) : gagal("Harus ya atau tidak.");
    case "alamatGrupLegal":
      return validasiEmailOpsional(v);
    case "pengirimEmail": {
      if (typeof v !== "string") return gagal("Harus berupa teks.");
      const t = v.trim();
      return t.length > 200 ? gagal("Paling panjang 200 karakter.") : ok(t);
    }
    case "tautanTeams":
      return validasiTautanOpsional(v);
    case "sla": {
      if (!v || typeof v !== "object" || Array.isArray(v)) return gagal("Harus berupa objek per status.");
      const sumber = v as Record<string, unknown>;
      const hasil = {} as Record<StatusSla, number>;
      for (const s of STATUS_SLA) {
        // Status yang tidak diisi memakai bawaan; status yang diisi salah membuat seluruh nilai ditolak.
        if (sumber[s] === undefined) {
          hasil[s] = PENGATURAN_BAWAAN.sla[s];
          continue;
        }
        const a = validasiAngka(sumber[s], 1, 90);
        if (!a.ok) return gagal(`${s}: ${a.galat}`);
        hasil[s] = a.nilai;
      }
      return ok(hasil);
    }
    case "ambangEskalasi": {
      if (!v || typeof v !== "object" || Array.isArray(v)) return gagal("Harus berupa objek.");
      const o = v as Record<string, unknown>;
      const a = validasiAngka(o.diajukanTanpaPicHari ?? PENGATURAN_BAWAAN.ambangEskalasi.diajukanTanpaPicHari, 1, 60);
      if (!a.ok) return gagal(`Pengajuan tanpa PIC: ${a.galat}`);
      const b = validasiAngka(o.revisiMenggantungHari ?? PENGATURAN_BAWAAN.ambangEskalasi.revisiMenggantungHari, 1, 90);
      if (!b.ok) return gagal(`Revisi menggantung: ${b.galat}`);
      return ok({ diajukanTanpaPicHari: a.nilai, revisiMenggantungHari: b.nilai });
    }
    case "formatPenomoran":
      return validasiFormatPenomoranKetat(v);
    case "matriksKewenangan":
      return validasiMatriksKewenangan(v);
  }
}

// --- Membaca baris SharePoint ------------------------------------------------------------

export interface BarisPengaturan {
  kunci: string;
  nilaiJson: string;
}

export interface HasilBaca {
  pengaturan: Pengaturan;
  /** Kunci yang nilainya diambil dari SharePoint. */
  tersimpan: KunciPengaturan[];
  /** Kunci yang barisnya ada tetapi rusak, beserta alasannya. Nilainya jatuh ke bawaan. */
  rusak: { kunci: KunciPengaturan; galat: string }[];
}

const adalahKunci = (k: string): k is KunciPengaturan => (DAFTAR_KUNCI as readonly string[]).includes(k);

/** Baca semua baris dengan rinci: mana yang tersimpan, mana yang rusak. Kunci tak dikenal diabaikan. */
export function bacaPengaturan(baris: readonly BarisPengaturan[]): HasilBaca {
  const pengaturan = pengaturanBawaan();
  const tersimpan: KunciPengaturan[] = [];
  const rusak: HasilBaca["rusak"] = [];
  for (const b of baris ?? []) {
    const kunci = typeof b?.kunci === "string" ? b.kunci.trim() : "";
    if (!adalahKunci(kunci)) continue;
    let mentah: unknown;
    try {
      mentah = JSON.parse(typeof b.nilaiJson === "string" ? b.nilaiJson : "");
    } catch {
      rusak.push({ kunci, galat: "NilaiJson bukan JSON yang sah." });
      continue;
    }
    const h = validasiNilai(kunci, mentah);
    if (!h.ok) {
      rusak.push({ kunci, galat: h.galat });
      continue;
    }
    (pengaturan as unknown as Record<string, unknown>)[kunci] = h.nilai;
    if (!tersimpan.includes(kunci)) tersimpan.push(kunci);
  }
  return { pengaturan, tersimpan, rusak };
}

/** Baris SharePoint -> Pengaturan. Tidak pernah melempar galat. */
export function parsePengaturan(baris: readonly BarisPengaturan[]): Pengaturan {
  return bacaPengaturan(baris).pengaturan;
}

/** Salinan dengan kunci objek berurutan, supaya dua objek yang isinya sama selalu menghasilkan JSON yang sama. */
function urutKunci(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(urutKunci);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, urutKunci(o[k])]),
    );
  }
  return v;
}

/**
 * Nilai sama menurut isinya. Urutan kunci objek diabaikan: nilai hasil validasi (mis. formatPenomoran) bisa
 * berbeda urutan kuncinya dari bawaan walau isinya sama, dan itu tidak boleh dianggap perubahan.
 */
export function samaNilai(a: unknown, b: unknown): boolean {
  return JSON.stringify(urutKunci(a)) === JSON.stringify(urutKunci(b));
}

/** Kunci yang nilainya berbeda dari bawaan. */
export function kunciBerubahDariBawaan(p: Pengaturan): KunciPengaturan[] {
  return DAFTAR_KUNCI.filter((k) => !samaNilai(p[k], PENGATURAN_BAWAAN[k]));
}

// --- Formulir ------------------------------------------------------------------------------

/** "90, 60, 30" atau "90 60 30" -> [90, 60, 30]. Teks kosong -> []. */
export function bacaDaftarHariTeks(teks: string): Hasil<number[]> {
  const bagian = teks
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const angka: number[] = [];
  for (const b of bagian) {
    if (!/^-?\d+$/.test(b)) return gagal(`"${b}" bukan angka.`);
    angka.push(Number(b));
  }
  return ok(angka);
}

export const teksDaftarHari = (d: readonly number[]) => d.join(", ");

/** Nilai formulir: semua angka masih teks supaya pengguna bebas mengetik. */
export interface FormPengaturan {
  hariPeringatan: string;
  jaminanPeringatan: string;
  sla: Record<StatusSla, string>;
  slaPakaiHariKerja: boolean;
  hariKerja: number[];
  alamatGrupLegal: string;
  pengirimEmail: string;
  tautanTeams: string;
  diajukanTanpaPicHari: string;
  revisiMenggantungHari: string;
  formatPola: string;
  formatPolaAddendum: string;
  formatPanjangUrut: string;
  formatResetTahunan: boolean;
  formatKode: Record<JenisKontrak, string>;
  /** Satu baris per jenjang matriks kewenangan; `sampai` kosong = tanpa batas atas (jenjang terakhir). */
  matriks: BarisMatriksForm[];
}

export interface BarisMatriksForm {
  /** Batas atas dalam rupiah, ditulis bebas ("1.000.000.000"). */
  sampai: string;
  penyetuju: string;
  penandatangan: string;
}

export type GalatForm = Partial<Record<keyof FormPengaturan | `sla.${StatusSla}`, string>>;

/** Isian formulir yang dipegang kunci formatPenomoran (untuk tombol "Bawaan" per kartu). */
export const ISIAN_FORMAT_PENOMORAN = ["formatPola", "formatPolaAddendum", "formatPanjangUrut", "formatResetTahunan", "formatKode"] as const satisfies readonly (keyof FormPengaturan)[];

export function keForm(p: Pengaturan): FormPengaturan {
  const sla = {} as Record<StatusSla, string>;
  for (const s of STATUS_SLA) sla[s] = String(p.sla[s]);
  return {
    hariPeringatan: teksDaftarHari(p.hariPeringatan),
    jaminanPeringatan: teksDaftarHari(p.jaminanPeringatan),
    sla,
    slaPakaiHariKerja: p.slaPakaiHariKerja,
    hariKerja: [...p.hariKerja],
    alamatGrupLegal: p.alamatGrupLegal,
    pengirimEmail: p.pengirimEmail,
    tautanTeams: p.tautanTeams,
    diajukanTanpaPicHari: String(p.ambangEskalasi.diajukanTanpaPicHari),
    revisiMenggantungHari: String(p.ambangEskalasi.revisiMenggantungHari),
    formatPola: p.formatPenomoran.pola,
    formatPolaAddendum: p.formatPenomoran.polaAddendum,
    formatPanjangUrut: String(p.formatPenomoran.panjangUrut),
    formatResetTahunan: p.formatPenomoran.resetTahunan,
    formatKode: Object.fromEntries(JENIS_KONTRAK.map((j) => [j, p.formatPenomoran.kodeJenis[j] ?? ""])) as Record<JenisKontrak, string>,
    matriks: p.matriksKewenangan.map((j) => ({ sampai: j.sampai == null ? "" : String(j.sampai), penyetuju: j.penyetuju, penandatangan: j.penandatangan })),
  };
}

/** Isian format penomoran -> FormatPenomoran tervalidasi, atau pesan galat untuk isian yang salah. */
export function formatDariForm(f: FormPengaturan): { ok: true; nilai: FormatPenomoran } | { ok: false; isian: keyof FormPengaturan; galat: string } {
  const panjang = keAngka(f.formatPanjangUrut);
  if (panjang === undefined || typeof panjang !== "number" || Number.isNaN(panjang)) return { ok: false, isian: "formatPanjangUrut", galat: "Isi angka 1 sampai 8." };
  const kodeJenis: Partial<Record<JenisKontrak, string>> = {};
  for (const j of JENIS_KONTRAK) {
    const t = f.formatKode[j]?.trim();
    if (t) kodeJenis[j] = t;
  }
  const h = validasiFormatPenomoranKetat({ pola: f.formatPola, polaAddendum: f.formatPolaAddendum, panjangUrut: panjang, resetTahunan: f.formatResetTahunan, kodeJenis });
  if (h.ok) return h;
  const isian: keyof FormPengaturan = /addendum/i.test(h.galat) ? "formatPolaAddendum" : /^Kode/.test(h.galat) ? "formatKode" : /Panjang/.test(h.galat) ? "formatPanjangUrut" : "formatPola";
  return { ok: false, isian, galat: h.galat };
}

const keAngka = (t: string): unknown => (/^\s*-?\d+\s*$/.test(t) ? Number(t) : t.trim() === "" ? undefined : NaN);

/** Baris matriks formulir -> matriks tervalidasi, atau pesan galat. Batas atas boleh ditulis dengan titik pemisah. */
export function matriksDariForm(baris: readonly BarisMatriksForm[]): Hasil<JenjangKewenangan[]> {
  const mentah: unknown[] = [];
  for (const [i, b] of baris.entries()) {
    const t = b.sampai.trim();
    if (!t) {
      mentah.push({ sampai: null, penyetuju: b.penyetuju, penandatangan: b.penandatangan });
      continue;
    }
    const angka = bacaNilai(t);
    if (angka == null || !Number.isFinite(angka)) return gagal(`Jenjang ${i + 1}: batas atas "${t}" belum terbaca sebagai angka rupiah.`);
    mentah.push({ sampai: angka, penyetuju: b.penyetuju, penandatangan: b.penandatangan });
  }
  return validasiMatriksKewenangan(mentah);
}

/** Formulir -> Pengaturan tervalidasi, atau daftar galat per isian. */
export function dariForm(f: FormPengaturan): { ok: true; nilai: Pengaturan } | { ok: false; galat: GalatForm } {
  const galat: GalatForm = {};
  const nilai = pengaturanBawaan();

  const daftar = (isian: "hariPeringatan" | "jaminanPeringatan") => {
    const t = bacaDaftarHariTeks(f[isian]);
    if (!t.ok) return void (galat[isian] = t.galat);
    const h = validasiNilai(isian, t.nilai);
    if (h.ok) nilai[isian] = h.nilai;
    else galat[isian] = h.galat;
  };
  daftar("hariPeringatan");
  daftar("jaminanPeringatan");

  for (const s of STATUS_SLA) {
    const a = validasiAngka(keAngka(f.sla[s]), 1, 90);
    if (a.ok) nilai.sla[s] = a.nilai;
    else galat[`sla.${s}`] = f.sla[s].trim() === "" ? "Wajib diisi." : a.galat;
  }

  nilai.slaPakaiHariKerja = f.slaPakaiHariKerja;
  const hk = validasiNilai("hariKerja", f.hariKerja);
  if (hk.ok) nilai.hariKerja = hk.nilai;
  else galat.hariKerja = f.hariKerja.length === 0 ? "Pilih minimal satu hari kerja." : hk.galat;

  const surel = validasiEmailOpsional(f.alamatGrupLegal);
  if (surel.ok) nilai.alamatGrupLegal = surel.nilai;
  else galat.alamatGrupLegal = surel.galat;

  const pengirim = validasiNilai("pengirimEmail", f.pengirimEmail);
  if (pengirim.ok) nilai.pengirimEmail = pengirim.nilai;
  else galat.pengirimEmail = pengirim.galat;

  const teams = validasiTautanOpsional(f.tautanTeams);
  if (teams.ok) nilai.tautanTeams = teams.nilai;
  else galat.tautanTeams = teams.galat;

  const a = validasiAngka(keAngka(f.diajukanTanpaPicHari), 1, 60);
  if (a.ok) nilai.ambangEskalasi.diajukanTanpaPicHari = a.nilai;
  else galat.diajukanTanpaPicHari = a.galat;
  const b = validasiAngka(keAngka(f.revisiMenggantungHari), 1, 90);
  if (b.ok) nilai.ambangEskalasi.revisiMenggantungHari = b.nilai;
  else galat.revisiMenggantungHari = b.galat;

  const fmt = formatDariForm(f);
  if (fmt.ok) nilai.formatPenomoran = fmt.nilai;
  else galat[fmt.isian] = fmt.galat;

  const mtx = matriksDariForm(f.matriks);
  if (mtx.ok) nilai.matriksKewenangan = mtx.nilai;
  else galat.matriks = mtx.galat;

  return Object.keys(galat).length ? { ok: false, galat } : { ok: true, nilai };
}

/** Ringkasan nilai untuk log dan tampilan "Bawaan: ...". */
export function ringkasNilai(kunci: KunciPengaturan, v: unknown): string {
  if (kunci === "hariKerja" && Array.isArray(v)) return v.map((h) => NAMA_HARI[h as number] ?? h).join(", ");
  if (kunci === "slaPakaiHariKerja") return v ? "Hari kerja" : "Hari kalender";
  if (Array.isArray(v)) return v.join(", ");
  if (kunci === "sla" && v && typeof v === "object") return STATUS_SLA.map((s) => `${s} ${(v as Record<string, number>)[s]}`).join(" · ");
  if (kunci === "ambangEskalasi" && v && typeof v === "object") {
    const o = v as AmbangEskalasi;
    return `tanpa PIC ${o.diajukanTanpaPicHari} hari · revisi ${o.revisiMenggantungHari} hari`;
  }
  if (kunci === "formatPenomoran" && v && typeof v === "object") {
    const o = v as FormatPenomoran;
    return `${o.pola} · urut ${o.panjangUrut} digit · ${o.resetTahunan ? "mulai ulang tiap tahun" : "berlanjut"} · addendum ${o.polaAddendum}`;
  }
  if (kunci === "matriksKewenangan" && Array.isArray(v)) return `${v.length} jenjang nilai`;
  return typeof v === "string" ? v || "(kosong)" : JSON.stringify(v);
}

// --- Pemakaian ---------------------------------------------------------------------------

const HARI_MS = 86_400_000;

/** Hari dalam zona Jakarta (0 = Minggu) untuk sebuah waktu epoch. */
function hariJakarta(ms: number): number {
  return new Date(ms + 7 * 3_600_000).getUTCDay();
}

/**
 * Jumlah hari kerja (pecahan) antara dua waktu, dihitung dalam zona Jakarta. Bagian hari yang jatuh
 * pada hari libur mingguan tidak dihitung.
 */
export function hitungHariKerja(dari: number, sampai: number, hariKerja: readonly number[]): number {
  if (!(sampai > dari) || hariKerja.length === 0) return 0;
  const OFFSET = 7 * 3_600_000;
  let total = 0;
  let t = dari;
  while (t < sampai) {
    // Batas tengah malam Jakarta berikutnya.
    const tengahMalam = Math.floor((t + OFFSET) / HARI_MS) * HARI_MS + HARI_MS - OFFSET;
    const ujung = Math.min(tengahMalam, sampai);
    if (hariKerja.includes(hariJakarta(t))) total += (ujung - t) / HARI_MS;
    t = ujung;
  }
  return total;
}

/**
 * Masa menunggu unit lain di tahap sekarang (K03) dalam satuan Pengaturan: hari kalender, atau hari kerja bila
 * SLA memakai hari kerja.
 */
export function potonganTungguPengaturan(k: Kontrak, p: Pengaturan, sekarang: number = Date.now(), tunggu: readonly RentangTunggu[] = []): number {
  const rentang = rentangTungguTahap(k, tunggu, sekarang);
  return rentang.reduce((n, [a, b]) => n + (p.slaPakaiHariKerja ? hitungHariKerja(a, b, p.hariKerja) : (b - a) / HARI_MS), 0);
}

/**
 * Umur tahap menurut pengaturan: hari kalender atau hari kerja. `tunggu` (permintaan masukan unit lain, K03)
 * dikurangkan untuk tahap milik Legal, jadi waktu menunggu unit lain tidak dihitung sebagai kinerja Legal.
 */
export function umurTahapPengaturan(k: Kontrak, p: Pengaturan, sekarang: number = Date.now(), tunggu: readonly RentangTunggu[] = []): number | null {
  const kalender = umurTahapHari(k, sekarang);
  if (kalender == null) return null;
  const kotor = p.slaPakaiHariKerja ? hitungHariKerja(sekarang - kalender * HARI_MS, sekarang, p.hariKerja) : kalender;
  return tunggu.length ? Math.max(0, kotor - potonganTungguPengaturan(k, p, sekarang, tunggu)) : kotor;
}

export function batasSla(p: Pengaturan, status: Status): number | null {
  return (STATUS_SLA as readonly Status[]).includes(status) ? p.sla[status as StatusSla] : null;
}

/** Padanan levelSla di lib/sla.ts, tetapi dengan angka dari Pengaturan. `tunggu`: lihat umurTahapPengaturan. */
export function levelSlaPengaturan(k: Kontrak, p: Pengaturan, sekarang: number = Date.now(), tunggu: readonly RentangTunggu[] = []): LevelSla {
  const batas = batasSla(p, k.status);
  const umur = umurTahapPengaturan(k, p, sekarang, tunggu);
  if (batas == null || umur == null) return "tidak-berlaku";
  if (umur > batas) return "lewat";
  if (umur > batas * 0.7) return "hampir";
  return "aman";
}

/** Ambang "akan berakhir" di dashboard: angka terbesar dari hariPeringatan. */
export function horizonPeringatan(p: Pengaturan): number {
  return Math.max(0, ...p.hariPeringatan);
}

// Pengaturan terakhir yang dimuat, untuk modul yang tidak bisa memakai hook (mis. lib/sla).
// Diisi oleh PengaturanProvider; sebelum itu berisi bawaan.
let aktif: Pengaturan = pengaturanBawaan();

export function pasangPengaturanAktif(p: Pengaturan): void {
  aktif = p;
}

export function pengaturanAktif(): Pengaturan {
  return aktif;
}
