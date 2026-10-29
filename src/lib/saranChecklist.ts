// Saran untuk checklist review dari hasil pemindai draf (K06 tahap 2). Murni, tanpa jaringan.
//
// Pemindai (lib/pemindai) mencari klausul inti dan selisih terhadap data pengajuan. Modul ini menerjemahkannya ke
// butir checklist review (lib/syarat): butir mana yang AMAN DICENTANG karena klausulnya terdeteksi jelas, dan butir mana
// yang perlu DITANDAI karena klausulnya tidak ditemukan, hanya disebut sambil lalu, masih berisi bagian kosong, atau
// berbeda dari pengajuan. Semuanya saran: tidak ada yang tercentang tanpa Legal menekan tombolnya, dan butir yang tidak
// punya padanan klausul (mis. subkontrak, pasal yang diubah) selalu diperiksa manual.
import { ratakan } from "./parserID";
import { deteksiPenandaKosong, type BidangSaran, type HasilPindai, type HasilKlausul } from "./pemindai";
import type { Dokumen } from "./types";

export type JenisSaran = "centang" | "tandai";

export interface SaranButir {
  /** Id butir checklist review (lib/syarat). */
  id: string;
  jenis: JenisSaran;
  /** Alasan satu kalimat untuk ditampilkan, juga bahan catatan butir bila Legal memilih menandainya. */
  alasan: string;
}

/** Butir checklist standar -> klausul pemindai yang menjadi dasarnya (semua yang relevan harus ada). */
export const PETA_BUTIR_KLAUSUL: Readonly<Record<string, readonly string[]>> = {
  "para-pihak": ["para-pihak"],
  "objek-lingkup": ["objek"],
  "nilai-pembayaran": ["nilai", "pembayaran"],
  "jangka-waktu": ["jangka-waktu"],
  jaminan: ["jaminan"],
  denda: ["denda"],
  "force-majeure": ["force-majeure"],
  sengketa: ["sengketa"],
  "pajak-meterai": ["meterai"],
  kerahasiaan: ["kerahasiaan"],
  pengakhiran: ["pengakhiran"],
  hukum: ["hukum"],
};

/** Klausul yang lazimnya tidak berjudul pasal sendiri (komparisi, kalimat penutup), jadi disebut sambil lalu sudah wajar. */
const TANPA_JUDUL_PASAL: ReadonlySet<string> = new Set(["para-pihak", "meterai"]);

/** Selisih terhadap pengajuan yang relevan untuk satu butir. */
const BIDANG_BUTIR: Readonly<Record<string, readonly BidangSaran[]>> = {
  "para-pihak": ["mitra"],
  "nilai-pembayaran": ["nilai"],
  "jangka-waktu": ["tanggalMulai", "tanggalBerakhir"],
};

const pendek = (t: string, maks = 90) => (t.length > maks ? `${t.slice(0, maks - 1).trimEnd()}…` : t);
const daftarNama = (d: readonly string[]) => d.map((n) => `"${n}"`).join(" dan ");

/**
 * Saran per butir checklist. `idButir` adalah butir yang benar-benar ada di checklist kontrak ini (urutannya
 * dipertahankan); butir tanpa padanan klausul atau yang klausulnya tidak lazim untuk jenis kontrak dilewati.
 * Teks yang nyaris tidak terbaca tidak menghasilkan saran apa pun.
 */
export function saranChecklist(h: HasilPindai, idButir: readonly string[]): SaranButir[] {
  if (h.keterbacaan.tingkat === "buruk") return [];
  const sebagian = h.keterbacaan.tingkat === "sebagian";
  const klausul = new Map(h.klausul.map((k) => [k.id, k] as const));
  const hasil: SaranButir[] = [];

  for (const id of idButir) {
    const dasar = (PETA_BUTIR_KLAUSUL[id] ?? []).map((x) => klausul.get(x)).filter((k): k is HasilKlausul => !!k && k.relevan);
    if (dasar.length === 0) continue;

    const hilang = dasar.filter((k) => !k.ada);
    const sambilLalu = dasar.filter((k) => k.ada && k.keyakinan !== "tinggi" && !TANPA_JUDUL_PASAL.has(k.id));
    const berbeda = h.selisih.filter((s) => s.tingkat === "beda" && (BIDANG_BUTIR[id] ?? []).includes(s.bidang));
    const kosong = dasar.filter((k) => k.ada && k.kutipan && deteksiPenandaKosong(k.kutipan).length > 0);

    const alasanTandai: string[] = [];
    if (hilang.length) alasanTandai.push(`Klausul ${daftarNama(hilang.map((k) => k.nama))} belum terdeteksi di draf.${sebagian ? " Teks hanya terbaca sebagian, jadi cek dokumen aslinya." : ""}`);
    if (sambilLalu.length) alasanTandai.push(`${daftarNama(sambilLalu.map((k) => k.nama))} hanya disebut sambil lalu, belum ada pasal khusus.`);
    if (kosong.length) alasanTandai.push(`Masih ada bagian kosong di sekitar klausul ${daftarNama(kosong.map((k) => k.nama))}.`);
    for (const s of berbeda) alasanTandai.push(`${s.label} di dokumen (${s.di_dokumen}) berbeda dengan pengajuan (${s.di_pengajuan}).`);

    if (alasanTandai.length) {
      hasil.push({ id, jenis: "tandai", alasan: alasanTandai.join(" ") });
    } else {
      const contoh = dasar[0]!.kutipan;
      hasil.push({ id, jenis: "centang", alasan: `Klausul ${daftarNama(dasar.map((k) => k.nama))} terdeteksi${contoh ? `: ${pendek(ratakan(contoh))}` : "."}` });
    }
  }
  return hasil;
}

/** Ringkasan satu kalimat untuk bilah hasil: "5 saran centang, 2 perlu dicek". */
export function ringkasSaran(saran: readonly SaranButir[]): string {
  const centang = saran.filter((s) => s.jenis === "centang").length;
  const tandai = saran.length - centang;
  if (saran.length === 0) return "Belum ada saran untuk butir checklist.";
  return [centang ? `${centang} saran centang` : "", tandai ? `${tandai} perlu dicek` : ""].filter(Boolean).join(", ");
}

const URUTAN_JENIS: Partial<Record<Dokumen["jenis"], number>> = { "Draft Final": 0, "Draft Kontrak": 0 };

/**
 * Draf terbaru untuk dipindai: dokumen berjenis Draft Kontrak atau Draft Final yang bisa dibaca (PDF atau DOCX), dipilih
 * yang terakhir diubah. null bila belum ada. `bisaDibaca` menerima nama berkas.
 */
export function pilihDraftTerbaru<T extends Pick<Dokumen, "jenis" | "nama" | "diubah">>(daftar: readonly T[], bisaDibaca: (nama: string) => boolean): T | null {
  const kandidat = daftar.filter((d) => URUTAN_JENIS[d.jenis] !== undefined && bisaDibaca(d.nama));
  if (kandidat.length === 0) return null;
  return kandidat.reduce((terbaik, d) => (d.diubah > terbaik.diubah ? d : terbaik));
}
