// Matriks kewenangan dan pencatatan persetujuan internal (K01 tahap 1).
//
// Matriks sederhana per rentang nilai (hanya IDR): siapa yang menyetujui dan siapa yang menandatangani. Nilainya
// STANDAR AWAL sampai matriks resmi WKI ditetapkan; Admin bisa mengubahnya di Pengaturan (kunci matriksKewenangan).
// Aplikasi hanya MENAMPILKAN rujukan dan MENCATAT bukti persetujuan (memo, nama, tanggal, dokumen). Ini pencatatan,
// bukan kontrol keras: tidak ada langkah yang diblokir bila persetujuan belum dicatat. Persetujuan sungguhan lewat
// Power Automate Approvals (tahap 2) belum dibuat.
//
// Modul ini murni sehingga teruji lewat scripts/uji-kewenangan.ts.
import type { Kontrak, MataUang, Persetujuan, Ymd } from "./types";

export interface JenjangKewenangan {
  /** Batas atas nilai kontrak dalam IDR (termasuk). null = tanpa batas atas (jenjang terakhir). */
  sampai: number | null;
  penyetuju: string;
  penandatangan: string;
}

/** Standar awal (belum resmi). Ganti lewat Pengaturan setelah matriks kewenangan WKI ditetapkan. */
export const MATRIKS_KEWENANGAN_BAWAAN: readonly JenjangKewenangan[] = Object.freeze([
  { sampai: 1_000_000_000, penyetuju: "Kepala Divisi pengaju", penandatangan: "Kepala Divisi pengaju" },
  { sampai: 10_000_000_000, penyetuju: "Direktur bidang terkait", penandatangan: "Direktur bidang terkait" },
  { sampai: 50_000_000_000, penyetuju: "Direktur Utama", penandatangan: "Direktur Utama" },
  { sampai: null, penyetuju: "Rapat Direksi", penandatangan: "Direktur Utama" },
]);

export const MAKS_JENJANG = 8;
const MAKS_TEKS = 120;

type Hasil<T> = { ok: true; nilai: T } | { ok: false; galat: string };

/**
 * Validasi matriks dari Pengaturan atau formulir: 1-8 jenjang, batas atas bilangan bulat positif yang naik, hanya
 * jenjang terakhir tanpa batas atas (supaya semua nilai tercakup), penyetuju dan penandatangan wajib.
 */
export function validasiMatriksKewenangan(v: unknown): Hasil<JenjangKewenangan[]> {
  if (!Array.isArray(v)) return { ok: false, galat: "Harus berupa daftar jenjang." };
  if (v.length === 0) return { ok: false, galat: "Isi minimal satu jenjang." };
  if (v.length > MAKS_JENJANG) return { ok: false, galat: `Paling banyak ${MAKS_JENJANG} jenjang.` };
  const hasil: JenjangKewenangan[] = [];
  for (const [i, x] of v.entries()) {
    const ke = `Jenjang ${i + 1}`;
    if (!x || typeof x !== "object") return { ok: false, galat: `${ke}: isian tidak terbaca.` };
    const o = x as Record<string, unknown>;
    const penyetuju = typeof o.penyetuju === "string" ? o.penyetuju.replace(/\s+/g, " ").trim() : "";
    const penandatangan = typeof o.penandatangan === "string" ? o.penandatangan.replace(/\s+/g, " ").trim() : "";
    if (!penyetuju) return { ok: false, galat: `${ke}: isi siapa penyetujunya.` };
    if (!penandatangan) return { ok: false, galat: `${ke}: isi siapa penandatangannya.` };
    if (penyetuju.length > MAKS_TEKS || penandatangan.length > MAKS_TEKS) return { ok: false, galat: `${ke}: teks paling panjang ${MAKS_TEKS} karakter.` };
    const terakhir = i === v.length - 1;
    const sampai = o.sampai;
    if (sampai == null) {
      if (!terakhir) return { ok: false, galat: `${ke}: hanya jenjang terakhir yang boleh tanpa batas atas.` };
    } else if (typeof sampai !== "number" || !Number.isInteger(sampai) || sampai <= 0) {
      return { ok: false, galat: `${ke}: batas atas harus angka rupiah bulat lebih dari 0.` };
    } else if (terakhir) {
      return { ok: false, galat: "Kosongkan batas atas jenjang terakhir supaya nilai di atasnya ikut tercakup." };
    }
    const sebelum = hasil[hasil.length - 1];
    if (sebelum && typeof sampai === "number" && sebelum.sampai != null && sampai <= sebelum.sampai) {
      return { ok: false, galat: `${ke}: batas atas harus lebih besar dari jenjang sebelumnya.` };
    }
    hasil.push({ sampai: (sampai as number | null | undefined) ?? null, penyetuju, penandatangan });
  }
  return { ok: true, nilai: hasil };
}

export type HasilRujukan =
  | { ada: true; jenjang: JenjangKewenangan; indeks: number; dari: number; nilai: number }
  | { ada: false; alasan: "tanpa-nilai" | "valas"; pesan: string };

/** Jenjang untuk sebuah nilai IDR: jenjang pertama yang batas atasnya >= nilai (nilai negatif dihitung mutlaknya). */
export function rujukanKewenangan(nilai: number | null, mataUang: MataUang, matriks: readonly JenjangKewenangan[]): HasilRujukan {
  if (mataUang !== "IDR") return { ada: false, alasan: "valas", pesan: `Matriks hanya untuk kontrak rupiah. Kontrak ${mataUang} ditentukan rujukannya secara manual.` };
  if (nilai == null || !Number.isFinite(nilai)) return { ada: false, alasan: "tanpa-nilai", pesan: "Kontrak ini tanpa nilai, jadi rujukan kewenangan ditentukan secara manual." };
  const n = Math.abs(nilai);
  const indeks = matriks.findIndex((j) => j.sampai == null || n <= j.sampai);
  const i = indeks < 0 ? matriks.length - 1 : indeks;
  const jenjang = matriks[i];
  if (!jenjang) return { ada: false, alasan: "tanpa-nilai", pesan: "Matriks kewenangan belum diisi." };
  const dari = i === 0 ? 0 : (matriks[i - 1]!.sampai ?? 0) + 1;
  return { ada: true, jenjang, indeks: i, dari, nilai: n };
}

/**
 * Nilai acuan kewenangan. Kontrak biasa: nilainya. Addendum: nilai efektif induk (sudah termasuk addendum yang
 * berlaku) ditambah selisih addendum ini bila belum berlaku, supaya jenjangnya mengikuti nilai kontrak sesudah diubah.
 */
export function nilaiAcuanKewenangan(k: Pick<Kontrak, "nilai" | "status" | "kontrakIndukId">, nilaiEfektifInduk: number | null | undefined): number | null {
  if (k.kontrakIndukId == null) return k.nilai;
  if (nilaiEfektifInduk == null) return k.nilai == null ? null : Math.abs(k.nilai);
  return nilaiEfektifInduk + (k.status === "Aktif" ? 0 : (k.nilai ?? 0));
}

/** "s.d. Rp1.000.000.000", "Rp1.000.000.001 s.d. Rp10.000.000.000", "di atas Rp50.000.000.000". */
export function teksRentangJenjang(matriks: readonly JenjangKewenangan[], i: number): string {
  const rp = (n: number) => `Rp${new Intl.NumberFormat("id-ID").format(n)}`;
  const j = matriks[i];
  if (!j) return "-";
  const sebelum = i > 0 ? matriks[i - 1]!.sampai : null;
  if (j.sampai == null) return sebelum == null ? "Semua nilai" : `Di atas ${rp(sebelum)}`;
  return sebelum == null ? `Sampai ${rp(j.sampai)}` : `${rp(sebelum + 1)} sampai ${rp(j.sampai)}`;
}

// --- Bukti persetujuan -----------------------------------------------------------------------

export type ItemPersetujuan = Persetujuan["items"][number];

export interface IsianPersetujuan {
  /** Nomor memo, nota dinas, atau surat persetujuan. */
  nomor: string;
  penyetuju: string;
  jabatan: string;
  tanggal: Ymd | null;
  catatan: string;
}

export function persetujuanKosong(jabatan = ""): IsianPersetujuan {
  return { nomor: "", penyetuju: "", jabatan, tanggal: null, catatan: "" };
}

/** Pesan galat pertama untuk formulir, atau null bila sah. Bukti wajib: nomor memo atau berkas. */
export function validasiPersetujuan(p: IsianPersetujuan, o: { hari: Ymd; adaBerkas: boolean }): string | null {
  if (!p.penyetuju.trim()) return "Isi nama penyetuju.";
  if (p.penyetuju.trim().length > MAKS_TEKS) return `Nama penyetuju paling panjang ${MAKS_TEKS} karakter.`;
  if (p.jabatan.trim().length > MAKS_TEKS) return `Jabatan paling panjang ${MAKS_TEKS} karakter.`;
  if (!p.tanggal) return "Isi tanggal persetujuan.";
  if (p.tanggal > o.hari) return "Tanggal persetujuan tidak boleh setelah hari ini.";
  if (!p.nomor.trim() && !o.adaBerkas) return "Isi nomor memo atau surat, atau lampirkan berkas buktinya.";
  if (p.nomor.trim().length > 150) return "Nomor memo paling panjang 150 karakter.";
  if (p.catatan.trim().length > 1000) return "Catatan paling panjang 1.000 karakter.";
  return null;
}

/** Tambahkan satu catatan persetujuan ke data kolom Persetujuan (versi 1). */
export function tambahPersetujuan(lama: Persetujuan | null, item: ItemPersetujuan): Persetujuan {
  const items = Array.isArray(lama?.items) ? lama.items.filter((x) => x && typeof x === "object" && x.id !== item.id) : [];
  return { versi: 1, items: [...items, item] };
}

export function hapusPersetujuan(lama: Persetujuan | null, id: string): Persetujuan {
  return { versi: 1, items: (lama?.items ?? []).filter((x) => x.id !== id) };
}

/** Daftar persetujuan yang sah dibaca, terbaru (tanggal) dulu. */
export function daftarPersetujuan(p: Persetujuan | null | undefined): ItemPersetujuan[] {
  const items = Array.isArray(p?.items) ? p.items : [];
  return items
    .filter((x): x is ItemPersetujuan => !!x && typeof x === "object" && typeof x.penyetuju === "string" && !!x.penyetuju.trim())
    .sort((a, b) => (b.tanggal ?? "").localeCompare(a.tanggal ?? "") || (b.dicatat ?? "").localeCompare(a.dicatat ?? ""));
}

/** Kalimat satu baris untuk riwayat Aktivitas dan catatan Lanjut ke Tanda Tangan. */
export function teksPersetujuan(x: Pick<ItemPersetujuan, "penyetuju" | "jabatan" | "tanggal" | "bukti" | "dokumen">, formatTanggal: (ymd: string) => string): string {
  const siapa = x.jabatan?.trim() ? `${x.penyetuju.trim()} (${x.jabatan.trim()})` : x.penyetuju.trim();
  const bagian = [`Disetujui ${siapa}`, x.tanggal ? `tanggal ${formatTanggal(x.tanggal)}` : "", x.bukti?.trim() ? `nomor ${x.bukti.trim()}` : "", x.dokumen?.trim() ? `berkas ${x.dokumen.trim()}` : ""];
  return `${bagian.filter(Boolean).join(", ")}.`;
}
