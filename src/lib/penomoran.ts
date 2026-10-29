// Usulan nomor kontrak resmi dan pencegahan nomor ganda (U20).
//
// Format nomor resmi adalah keputusan Legal, jadi di sini semuanya konfigurasi: pola, kode per jenis,
// panjang nomor urut, dan apakah urutan dimulai ulang tiap tahun. Bawaannya sengaja sederhana
// ({kode}/{tahun}/{urut}) supaya mudah diganti tanpa mengubah kode.
//
// Usulan nomor dihitung dari nomor yang sudah ada (tanpa list penghitung): nomor urut terbesar yang cocok
// dengan pola untuk kode dan tahun yang sama, ditambah satu. Karena itu dua Legal yang mengaktifkan kontrak
// pada detik yang sama bisa mendapat usulan yang sama; pengaman kerasnya adalah "Enforce unique values" di
// kolom NomorKontrak dan cekNomorGanda setelah kosongkanCacheKontrak.
//
// Modul ini murni: tanggal acuan selalu bisa diberikan pemanggil supaya teruji.
import { JENIS_ADDENDUM, JENIS_KONTRAK, type JenisKontrak, type Kontrak, type Ymd } from "./types";

export interface FormatPenomoran {
  /**
   * Pola nomor. Penanda yang dikenal: {kode}, {urut}, {tahun}, {tahun2}, {bulan}, {romawi}, {divisi}.
   * {urut} wajib ada (kalau tidak, usulan tidak bisa dihitung).
   */
  pola: string;
  /** Kode per jenis kontrak. Jenis yang tidak diisi memakai kode "Lainnya". */
  kodeJenis: Partial<Record<JenisKontrak, string>>;
  /** Jumlah digit nomor urut (dipad nol di depan). */
  panjangUrut: number;
  /** true: nomor urut dimulai dari 1 setiap tahun. false: berlanjut sepanjang masa per kode. */
  resetTahunan: boolean;
  /** Pola nomor addendum. Penanda: {induk} (nomor kontrak induk) dan {urutan}. */
  polaAddendum: string;
}

export const FORMAT_PENOMORAN_BAWAAN: Readonly<FormatPenomoran> = Object.freeze({
  pola: "{kode}/{tahun}/{urut}",
  kodeJenis: Object.freeze({
    "Pengadaan Barang": "PB",
    "Pengadaan Jasa": "PJ",
    Sewa: "SW",
    "Kerja Sama": "KS",
    "MoU / Nota Kesepahaman": "MOU",
    "Kerahasiaan (NDA)": "NDA",
    "Addendum / Amandemen": "ADD",
    Lainnya: "LN",
  }),
  panjangUrut: 3,
  resetTahunan: true,
  polaAddendum: "{induk}/ADD-{urutan}",
});

const ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"] as const;

export function kodeJenis(jenis: JenisKontrak, format: FormatPenomoran = FORMAT_PENOMORAN_BAWAAN): string {
  const k = format.kodeJenis[jenis]?.trim();
  if (k) return k;
  return format.kodeJenis.Lainnya?.trim() || "LN";
}

/** Bandingkan nomor tanpa peduli huruf besar-kecil dan spasi berlebih. */
export function normalNomor(nomor: string): string {
  return nomor.trim().replace(/\s+/g, " ").toUpperCase();
}

function escapeRegex(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Acuan {
  kode: string;
  tahun: number;
  bulan: number;
  divisi: string;
}

/** Isi pola dengan nilai nyata. */
function isiPola(pola: string, a: Acuan, urut: string): string {
  return pola
    .replace(/\{kode\}/g, a.kode)
    .replace(/\{tahun\}/g, String(a.tahun))
    .replace(/\{tahun2\}/g, String(a.tahun).slice(-2))
    .replace(/\{bulan\}/g, String(a.bulan).padStart(2, "0"))
    .replace(/\{romawi\}/g, ROMAWI[a.bulan - 1] ?? "")
    .replace(/\{divisi\}/g, a.divisi)
    .replace(/\{urut\}/g, urut);
}

/**
 * Regex yang mengenali nomor dari pola. Kode dan tahun dikunci (bila `kunci` diisi) supaya nomor urut
 * dihitung per kode dan per tahun; bulan dan divisi dibebaskan karena tidak memengaruhi urutan.
 */
function regexPola(pola: string, kunci: { kode?: string; tahun?: number }): RegExp {
  const bagian = pola.split(/(\{[a-z0-9]+\})/i);
  let urutDitemukan = false;
  const isi = bagian
    .map((b) => {
      switch (b) {
        case "{kode}":
          return kunci.kode != null ? escapeRegex(kunci.kode) : "[A-Za-z0-9-]+";
        case "{tahun}":
          return kunci.tahun != null ? String(kunci.tahun) : "\\d{4}";
        case "{tahun2}":
          return kunci.tahun != null ? String(kunci.tahun).slice(-2) : "\\d{2}";
        case "{bulan}":
          return "\\d{2}";
        case "{romawi}":
          return "[IVX]+";
        case "{divisi}":
          return "[A-Za-z0-9-]+";
        case "{urut}":
          if (urutDitemukan) return "\\d+";
          urutDitemukan = true;
          return "(\\d+)";
        default:
          return escapeRegex(b);
      }
    })
    .join("");
  return new RegExp(`^${isi}$`, "i");
}

function acuanDari(ymd: Ymd): { tahun: number; bulan: number } {
  const [t, b] = ymd.split("-").map(Number);
  return { tahun: t || new Date().getFullYear(), bulan: b && b >= 1 && b <= 12 ? b : 1 };
}

/** Nomor urut terbesar yang sudah dipakai untuk kode (dan tahun, bila reset tahunan) yang sama. */
export function urutTerbesar(semua: readonly Pick<Kontrak, "id" | "nomorKontrak">[], format: FormatPenomoran, kunci: { kode: string; tahun: number }, kecualiId?: number): number {
  const re = regexPola(format.pola, format.resetTahunan ? kunci : { kode: kunci.kode });
  let maks = 0;
  for (const k of semua) {
    if (k.id === kecualiId || !k.nomorKontrak) continue;
    const m = re.exec(k.nomorKontrak.trim());
    if (m?.[1]) maks = Math.max(maks, Number(m[1]));
  }
  return maks;
}

/** Nomor addendum dari nomor induk dan urutannya, mis. "PB/2026/007/ADD-2". */
export function nomorAddendum(nomorInduk: string, urutan: number, format: FormatPenomoran = FORMAT_PENOMORAN_BAWAAN): string {
  return format.polaAddendum.replace(/\{induk\}/g, nomorInduk.trim()).replace(/\{urutan\}/g, String(urutan));
}

export interface UsulanNomor {
  /** Nomor yang diusulkan. Kosong bila tidak bisa dihitung (lihat `alasan`). */
  nomor: string;
  /** Nomor urut yang dipakai (null untuk addendum atau bila gagal). */
  urut: number | null;
  /** Penjelasan singkat dari mana usulan berasal, untuk ditampilkan di bawah isian. */
  alasan: string;
}

/**
 * Usulan nomor kontrak resmi untuk `k`. `tanggal` (YYYY-MM-DD) menentukan tahun dan bulan; bawaannya
 * tanggal tanda tangan kontrak, lalu `hariIni`.
 */
export function usulanNomorKontrak(
  k: Pick<Kontrak, "id" | "jenis" | "divisi" | "kontrakIndukId" | "urutanAddendum" | "tanggalTandaTangan">,
  semua: readonly Kontrak[],
  format: FormatPenomoran = FORMAT_PENOMORAN_BAWAAN,
  opsi: { tanggal?: Ymd | null; hariIni?: Ymd } = {},
): UsulanNomor {
  if (k.jenis === JENIS_ADDENDUM && k.kontrakIndukId != null) {
    const induk = semua.find((x) => x.id === k.kontrakIndukId);
    if (!induk) return { nomor: "", urut: null, alasan: "Kontrak induk tidak ditemukan, jadi nomor addendum belum bisa diusulkan." };
    if (!induk.nomorKontrak.trim()) return { nomor: "", urut: null, alasan: `Kontrak induk ${induk.nomorPengajuan} belum punya nomor resmi. Isi nomor induk lebih dulu.` };
    const urutan = k.urutanAddendum ?? 1 + semua.filter((x) => x.kontrakIndukId === induk.id && x.id !== k.id && x.status !== "Ditolak" && x.status !== "Dibatalkan").length;
    return { nomor: nomorAddendum(induk.nomorKontrak, urutan, format), urut: null, alasan: `Addendum ke-${urutan} dari ${induk.nomorKontrak.trim()}.` };
  }

  if (!format.pola.includes("{urut}")) return { nomor: "", urut: null, alasan: "Pola nomor belum memuat {urut}, jadi nomor berikutnya tidak bisa dihitung." };

  const ymd = opsi.tanggal ?? k.tanggalTandaTangan ?? opsi.hariIni ?? new Date().toISOString().slice(0, 10);
  const { tahun, bulan } = acuanDari(ymd);
  const kode = kodeJenis(k.jenis, format);
  const maks = urutTerbesar(semua, format, { kode, tahun }, k.id);
  const urut = maks + 1;
  const nomor = isiPola(format.pola, { kode, tahun, bulan, divisi: k.divisi }, String(urut).padStart(Math.max(1, format.panjangUrut), "0"));
  const alasan = maks === 0 ? `Nomor pertama untuk kode ${kode}${format.resetTahunan ? ` tahun ${tahun}` : ""}.` : `Melanjutkan nomor terakhir ${kode} (urut ${maks})${format.resetTahunan ? ` tahun ${tahun}` : ""}.`;
  return { nomor, urut, alasan };
}

/** Kontrak lain yang sudah memakai nomor yang sama (tanpa peduli huruf besar-kecil dan spasi). */
export function cekNomorGanda(nomor: string, semua: readonly Kontrak[], kecualiId?: number | null): Kontrak[] {
  const n = normalNomor(nomor);
  if (!n) return [];
  return semua.filter((k) => k.id !== kecualiId && k.nomorKontrak && normalNomor(k.nomorKontrak) === n);
}

/**
 * Peringatan format yang lunak: tidak pernah memblokir, karena nomor lama atau nomor dari mitra bisa
 * saja berbeda pola. Kosong berarti tidak ada catatan.
 */
export function peringatanFormatNomor(
  nomor: string,
  k: Pick<Kontrak, "jenis" | "kontrakIndukId">,
  format: FormatPenomoran = FORMAT_PENOMORAN_BAWAAN,
  opsi: { nomorInduk?: string; hariIni?: Ymd } = {},
): string[] {
  const t = nomor.trim();
  if (!t) return [];
  const catatan: string[] = [];
  if (/\s{2,}/.test(nomor) || nomor !== t) catatan.push("Ada spasi berlebih di nomor; akan dirapikan saat disimpan.");
  if (/[^A-Za-z0-9/.\-_ ]/.test(t)) catatan.push("Nomor memuat karakter yang tidak biasa (selain huruf, angka, / . - _).");
  if (/\/\/|--/.test(t)) catatan.push("Ada pemisah ganda (// atau --), mungkin salah ketik.");

  if (k.jenis === JENIS_ADDENDUM && k.kontrakIndukId != null) {
    if (opsi.nomorInduk && !normalNomor(t).startsWith(normalNomor(opsi.nomorInduk))) {
      catatan.push(`Nomor addendum biasanya diawali nomor induk (${opsi.nomorInduk.trim()}).`);
    }
    return catatan;
  }

  if (!regexPola(format.pola, {}).test(t)) {
    catatan.push(`Nomor tidak mengikuti pola ${format.pola}. Tidak apa-apa bila memang nomor lama atau nomor dari mitra.`);
    return catatan;
  }
  const kode = kodeJenis(k.jenis, format);
  if (format.pola.includes("{kode}") && !regexPola(format.pola, { kode }).test(t)) {
    catatan.push(`Kode jenis tidak cocok: untuk ${k.jenis} biasanya ${kode}.`);
  }
  const tahunIni = Number((opsi.hariIni ?? new Date().toISOString().slice(0, 10)).slice(0, 4));
  const m = /\b(19|20)\d{2}\b/.exec(t);
  if (format.pola.includes("{tahun}") && m && Math.abs(Number(m[0]) - tahunIni) > 1) {
    catatan.push(`Tahun di nomor (${m[0]}) jauh dari tahun berjalan.`);
  }
  return catatan;
}

/** Pesan galat yang jelas bila SharePoint menolak karena nilai unik (Enforce unique values) bentrok. */
export function adalahGalatNomorUnik(err: unknown): boolean {
  const teks = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return /unique|duplicate|sudah ada|nilai unik/i.test(teks);
}

export const PESAN_NOMOR_GANDA = "Nomor kontrak ini sudah dipakai kontrak lain. Usulan nomor sudah dihitung ulang; periksa lalu simpan lagi.";

/** Penanda yang dikenal di pola nomor kontrak dan pola addendum. */
export const PENANDA_POLA = ["{kode}", "{urut}", "{tahun}", "{tahun2}", "{bulan}", "{romawi}", "{divisi}"] as const;
export const PENANDA_POLA_ADDENDUM = ["{induk}", "{urutan}"] as const;
const POLA_KODE = /^[A-Za-z0-9-]{1,12}$/;

function penandaAsing(pola: string, dikenal: readonly string[]): string[] {
  return (pola.match(/\{[^{}]*\}/g) ?? []).filter((p) => !dikenal.includes(p));
}

/**
 * Validasi ketat untuk nilai yang disimpan Admin di Pengaturan (kunci "formatPenomoran", U20). Berbeda dengan
 * validasiFormatPenomoran yang memaafkan, fungsi ini menolak dengan pesan yang jelas supaya Admin tahu apa yang
 * salah; nilai di SharePoint yang ditolak jatuh ke FORMAT_PENOMORAN_BAWAAN.
 */
export function validasiFormatPenomoranKetat(v: unknown): { ok: true; nilai: FormatPenomoran } | { ok: false; galat: string } {
  const gagal = (galat: string) => ({ ok: false as const, galat });
  if (typeof v !== "object" || v === null || Array.isArray(v)) return gagal("Format penomoran harus berupa objek.");
  const o = v as Record<string, unknown>;
  const pola = typeof o.pola === "string" ? o.pola.trim() : "";
  if (!pola) return gagal("Pola nomor wajib diisi.");
  if (pola.length > 80) return gagal("Pola nomor paling panjang 80 karakter.");
  if ((pola.match(/\{urut\}/g) ?? []).length !== 1) return gagal("Pola nomor wajib memuat {urut} tepat satu kali.");
  const asing = penandaAsing(pola, PENANDA_POLA);
  if (asing.length) return gagal(`Penanda ${asing.join(", ")} tidak dikenal. Yang bisa dipakai: ${PENANDA_POLA.join(" ")}.`);

  const polaAddendum = typeof o.polaAddendum === "string" ? o.polaAddendum.trim() : FORMAT_PENOMORAN_BAWAAN.polaAddendum;
  if (!polaAddendum.includes("{induk}") || !polaAddendum.includes("{urutan}")) return gagal("Pola addendum wajib memuat {induk} dan {urutan}.");
  const asingAdd = penandaAsing(polaAddendum, PENANDA_POLA_ADDENDUM);
  if (asingAdd.length) return gagal(`Penanda ${asingAdd.join(", ")} tidak dikenal di pola addendum.`);
  if (polaAddendum.length > 80) return gagal("Pola addendum paling panjang 80 karakter.");

  const panjang = o.panjangUrut ?? FORMAT_PENOMORAN_BAWAAN.panjangUrut;
  if (typeof panjang !== "number" || !Number.isInteger(panjang) || panjang < 1 || panjang > 8) return gagal("Panjang nomor urut harus angka 1 sampai 8.");
  if (o.resetTahunan !== undefined && typeof o.resetTahunan !== "boolean") return gagal("Pilihan mulai ulang tiap tahun harus ya atau tidak.");

  const kode: Partial<Record<JenisKontrak, string>> = { ...FORMAT_PENOMORAN_BAWAAN.kodeJenis };
  if (o.kodeJenis !== undefined) {
    if (typeof o.kodeJenis !== "object" || o.kodeJenis === null || Array.isArray(o.kodeJenis)) return gagal("Kode jenis harus berupa objek per jenis kontrak.");
    for (const j of JENIS_KONTRAK) {
      const x = (o.kodeJenis as Record<string, unknown>)[j];
      if (x === undefined) continue;
      if (typeof x !== "string" || !POLA_KODE.test(x.trim())) return gagal(`Kode ${j}: 1-12 huruf, angka, atau tanda hubung.`);
      kode[j] = x.trim();
    }
  }
  // Urutan kunci sama dengan FORMAT_PENOMORAN_BAWAAN supaya JSON yang disimpan mudah dibandingkan.
  return { ok: true, nilai: { pola, kodeJenis: kode, panjangUrut: panjang, resetTahunan: o.resetTahunan !== false, polaAddendum } };
}

/** Validasi konfigurasi format yang memaafkan: bagian yang salah diganti bawaan (untuk data dari luar). */
export function validasiFormatPenomoran(v: unknown): { ok: true; nilai: FormatPenomoran } | { ok: false; galat: string } {
  if (typeof v !== "object" || v === null) return { ok: false, galat: "Format penomoran harus berupa objek." };
  const o = v as Record<string, unknown>;
  const pola = typeof o.pola === "string" ? o.pola.trim() : "";
  if (!pola.includes("{urut}")) return { ok: false, galat: "Pola wajib memuat {urut}." };
  const polaAddendum = typeof o.polaAddendum === "string" && o.polaAddendum.includes("{induk}") ? o.polaAddendum.trim() : FORMAT_PENOMORAN_BAWAAN.polaAddendum;
  const panjang = typeof o.panjangUrut === "number" && Number.isInteger(o.panjangUrut) && o.panjangUrut >= 1 && o.panjangUrut <= 8 ? o.panjangUrut : FORMAT_PENOMORAN_BAWAAN.panjangUrut;
  const kode: Partial<Record<JenisKontrak, string>> = { ...FORMAT_PENOMORAN_BAWAAN.kodeJenis };
  if (typeof o.kodeJenis === "object" && o.kodeJenis !== null) {
    for (const j of JENIS_KONTRAK) {
      const x = (o.kodeJenis as Record<string, unknown>)[j];
      if (typeof x === "string" && /^[A-Za-z0-9-]{1,12}$/.test(x.trim())) kode[j] = x.trim();
    }
  }
  // Urutan kunci sama dengan FORMAT_PENOMORAN_BAWAAN supaya JSON yang disimpan mudah dibandingkan.
  return { ok: true, nilai: { pola, kodeJenis: kode, panjangUrut: panjang, resetTahunan: o.resetTahunan !== false, polaAddendum } };
}
