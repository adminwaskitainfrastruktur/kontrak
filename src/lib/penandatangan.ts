// Aturan murni tanda tangan digital kontrak (meniru alur dokumen bertanda tangan di aplikasi stok):
// siapa boleh menandatangani, status dihitung dari data (bukan dari kolom yang bisa basi), urutan giliran,
// tahapan untuk garis waktu, dan validasi daftar penandatangan. Tanpa DOM, tanpa jaringan: teruji di Node
// (scripts/uji-penandatangan.ts).
//
// Model: satu "permintaan tanda tangan" per kontrak berisi satu dokumen (dikunci dengan SHA-256) dan N
// penandatangan. Penandatangan internal menandatangani sendiri dengan akun Microsoft-nya; penandatangan
// "pihak luar" (mitra) tidak punya akun, jadi Legal mencatat tanda tangannya dari berkas yang diterima.
// Kontrak yang ditandatangani basah dapat diselesaikan dengan mengunggah pindaian PDF.

export const DOMAIN_INTERNAL = "waskitainfrastruktur.co.id";

export const STATUS_TTD = ["Menunggu", "Sebagian", "Selesai", "Ditolak", "Dibatalkan"] as const;
export type StatusTtd = (typeof STATUS_TTD)[number];

export type SumberTtd = "coret" | "unggah" | "tersimpan" | "dicatat";

export interface Penandatangan {
  /** Kunci stabil ("p1", "p2", …); tidak berubah walau urutan diubah. */
  id: string;
  nama: string;
  jabatan: string;
  /** Kedudukan di kontrak, mis. "Pihak Pertama" atau "Direktur Utama". */
  peran: string;
  /** Email akun untuk penandatangan internal; boleh kosong untuk pihak luar. */
  email: string;
  /** Pihak luar (mitra): tanda tangannya dicatat Legal, bukan dibubuhkan sendiri. */
  luar?: boolean;
  waktu?: string;
  /** Nama yang tercatat saat menandatangani. */
  oleh?: string;
  /** ID berkas PNG tanda tangan di library (subfolder TTD kontrak). */
  berkasTtd?: string;
  sumber?: SumberTtd;
  /** SHA-256 dari "sidik dokumen | email | waktu | sidik PNG": mengikat tanda tangan ke dokumen. */
  jejak?: string;
  /** Untuk pihak luar: Legal yang mencatatnya. */
  dicatatOleh?: string;
}

export interface DokumenTtd {
  id: string;
  nama: string;
  ukuran: number;
  sha256: string;
}

export interface Akhiran {
  waktu: string;
  oleh: string;
  alasan: string;
}

export interface IsiPermintaan {
  v: 1;
  /** Judul dan mitra kontrak saat permintaan dibuat, supaya daftar tidak perlu memuat kontraknya satu per satu. */
  judul?: string;
  mitra?: string;
  dokumen: DokumenTtd;
  /** true: penandatangan harus berurutan sesuai daftar; false: boleh bersamaan. */
  berurutan: boolean;
  penandatangan: Penandatangan[];
  /** ID berkas pindaian PDF (tanda tangan basah) bila ada. */
  berkasScan?: string;
  /** ID berkas PDF final bertanda tangan bila sudah dibuat. */
  berkasPdf?: string;
  waktuSelesai?: string;
  tolak?: Akhiran & { oleh: string };
  batal?: Akhiran;
}

export interface PermintaanTtd {
  itemId: number;
  kontrakId: number;
  nomor: string;
  isi: IsiPermintaan;
  dibuatOleh: string;
  dibuatEmail: string;
  waktuDibuat: string;
}

export const huruf = (v: unknown): string => String(v ?? "").trim().toLowerCase();

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailSah = (e: string): boolean => POLA_EMAIL.test(e.trim());
export const emailInternal = (e: string): boolean => huruf(e).endsWith(`@${DOMAIN_INTERNAL}`) && emailSah(e);

export const sudahTtd = (p: Pick<Penandatangan, "waktu">): boolean => !!p.waktu;

/** Status dihitung dari isi, bukan dibaca dari kolom Status yang bisa basi. */
export function statusPermintaan(isi: IsiPermintaan | null | undefined): StatusTtd {
  if (!isi) return "Menunggu";
  if (isi.batal) return "Dibatalkan";
  if (isi.tolak) return "Ditolak";
  const daftar = isi.penandatangan;
  if (isi.berkasScan || (daftar.length > 0 && daftar.every(sudahTtd))) return "Selesai";
  if (daftar.some(sudahTtd)) return "Sebagian";
  return "Menunggu";
}

export const masihBerjalan = (isi: IsiPermintaan): boolean => {
  const s = statusPermintaan(isi);
  return s === "Menunggu" || s === "Sebagian";
};

/** Penandatangan yang belum menandatangani dan sedang ditunggu (semuanya bila bersamaan, satu bila berurutan). */
export function sedangGiliran(isi: IsiPermintaan): Penandatangan[] {
  if (!masihBerjalan(isi)) return [];
  const belum = isi.penandatangan.filter((p) => !sudahTtd(p));
  return isi.berurutan ? belum.slice(0, 1) : belum;
}

/** Penandatangan yang belum menandatangani (termasuk yang belum gilirannya). */
export const pihakMenunggu = (isi: IsiPermintaan): Penandatangan[] => (masihBerjalan(isi) ? isi.penandatangan.filter((p) => !sudahTtd(p)) : []);

/** Langkah milik `email` pada permintaan ini (bisa lebih dari satu bila orangnya sama). */
export function langkahMilik(isi: IsiPermintaan, email: string): Penandatangan[] {
  const e = huruf(email);
  if (!e) return [];
  return isi.penandatangan.filter((p) => !p.luar && huruf(p.email) === e);
}

export interface PelakuTtd {
  email: string;
  /** Admin atau Legal. */
  legal: boolean;
}

export type AksiTtd = "lihat" | "ttd" | "catat-luar" | "tolak" | "batal" | "scan" | "ingatkan" | "buat";

/**
 * Hak aksi. `ttd` berlaku untuk langkah milik akun ini yang sedang gilirannya; `catat-luar` untuk Legal pada
 * pihak luar yang sedang gilirannya. Menolak berarti menyatakan dokumen tidak benar: hanya penandatangan
 * internal yang terlibat, selama belum selesai. Membatalkan: Legal atau pembuat permintaan.
 */
export function bolehAksi(p: PermintaanTtd | null, aksi: AksiTtd, pelaku: PelakuTtd): boolean {
  if (aksi === "buat") return pelaku.legal && (!p || !masihBerjalan(p.isi));
  if (!p) return false;
  const milik = langkahMilik(p.isi, pelaku.email);
  const berjalan = masihBerjalan(p.isi);
  const giliran = new Set(sedangGiliran(p.isi).map((x) => x.id));
  switch (aksi) {
    case "lihat":
      return pelaku.legal || milik.length > 0 || huruf(p.dibuatEmail) === huruf(pelaku.email);
    case "ttd":
      return berjalan && milik.some((m) => giliran.has(m.id));
    case "catat-luar":
      return berjalan && pelaku.legal && p.isi.penandatangan.some((x) => x.luar && giliran.has(x.id));
    case "tolak":
      return berjalan && milik.length > 0;
    case "batal":
      return berjalan && (pelaku.legal || huruf(p.dibuatEmail) === huruf(pelaku.email));
    case "scan":
    case "ingatkan":
      return berjalan && pelaku.legal;
    default:
      return false;
  }
}

/** Langkah yang akan ditandatangani akun ini sekarang (yang pertama dalam daftar). */
export function langkahUntukSaya(p: PermintaanTtd, email: string): Penandatangan | null {
  const giliran = new Set(sedangGiliran(p.isi).map((x) => x.id));
  return langkahMilik(p.isi, email).find((m) => giliran.has(m.id)) ?? null;
}

/** Permintaan yang sedang menunggu tanda tangan `email` (untuk halaman "Tanda Tangan Saya" dan lencana menu). */
export function menungguSaya(daftar: readonly PermintaanTtd[], email: string): PermintaanTtd[] {
  return daftar.filter((p) => langkahUntukSaya(p, email) != null);
}

export interface RingkasTtd {
  selesai: number;
  total: number;
  teks: string;
}

export function ringkasPermintaan(isi: IsiPermintaan): RingkasTtd {
  const total = isi.penandatangan.length;
  const selesai = isi.berkasScan ? total : isi.penandatangan.filter(sudahTtd).length;
  return { selesai, total, teks: `${selesai} dari ${total} sudah menandatangani` };
}

export interface LangkahWaktu {
  kunci: string;
  label: string;
  waktu: string | null;
  oleh: string;
  selesai: boolean;
  akhir?: boolean;
  bahaya?: boolean;
}

/** Tahapan untuk garis waktu: dibuat, tiap penandatangan, lalu selesai / ditolak / dibatalkan. */
export function tahapan(p: PermintaanTtd): LangkahWaktu[] {
  const langkah: LangkahWaktu[] = [{ kunci: "dibuat", label: "Permintaan dibuat", waktu: p.waktuDibuat || null, oleh: p.dibuatOleh, selesai: true }];
  for (const x of p.isi.penandatangan) {
    langkah.push({
      kunci: x.id,
      label: `${x.nama} menandatangani`,
      waktu: x.waktu ?? null,
      oleh: x.luar && x.dicatatOleh ? `dicatat ${x.dicatatOleh}` : (x.oleh ?? ""),
      selesai: sudahTtd(x),
    });
  }
  const s = statusPermintaan(p.isi);
  if (s === "Dibatalkan" && p.isi.batal) langkah.push({ kunci: "batal", label: "Dibatalkan", waktu: p.isi.batal.waktu, oleh: p.isi.batal.oleh, selesai: true, akhir: true, bahaya: true });
  else if (s === "Ditolak" && p.isi.tolak) langkah.push({ kunci: "tolak", label: "Ditolak", waktu: p.isi.tolak.waktu, oleh: p.isi.tolak.oleh, selesai: true, akhir: true, bahaya: true });
  else {
    const basah = !!p.isi.berkasScan && !p.isi.penandatangan.every(sudahTtd);
    langkah.push({ kunci: "selesai", label: basah ? "Selesai (tanda tangan basah)" : "Selesai", waktu: s === "Selesai" ? (p.isi.waktuSelesai ?? null) : null, oleh: "", selesai: s === "Selesai", akhir: true });
  }
  return langkah;
}

// --- Validasi daftar penandatangan ---------------------------------------------------------------------

export interface MasukanPenandatangan {
  nama: string;
  jabatan: string;
  peran: string;
  email: string;
  luar: boolean;
}

export const BATAS_PENANDATANGAN = 12;

/** Daftar pesan galat (kosong bila sah). Penandatangan internal wajib beralamat email kantor yang sah. */
export function periksaPenandatangan(daftar: readonly MasukanPenandatangan[]): string[] {
  const galat: string[] = [];
  if (daftar.length === 0) galat.push("Tambahkan minimal satu penandatangan.");
  if (daftar.length > BATAS_PENANDATANGAN) galat.push(`Paling banyak ${BATAS_PENANDATANGAN} penandatangan.`);
  daftar.forEach((d, i) => {
    const n = i + 1;
    if (!d.nama.trim()) galat.push(`Penandatangan ${n}: nama wajib diisi.`);
    if (!d.luar) {
      if (!emailInternal(d.email)) galat.push(`Penandatangan ${n}: email harus akun @${DOMAIN_INTERNAL} supaya bisa masuk dan menandatangani.`);
    } else if (d.email.trim() && !emailSah(d.email)) {
      galat.push(`Penandatangan ${n}: format email tidak sah.`);
    }
  });
  const sama = new Set<string>();
  for (const d of daftar) {
    const kunci = d.luar ? "" : huruf(d.email);
    if (kunci && sama.has(`${kunci}|${huruf(d.peran)}`)) galat.push(`${d.nama || d.email} tercantum dua kali dengan kedudukan yang sama.`);
    if (kunci) sama.add(`${kunci}|${huruf(d.peran)}`);
  }
  return galat;
}

/** Ubah masukan formulir menjadi daftar penandatangan dengan ID stabil. */
export function susunPenandatangan(masukan: readonly MasukanPenandatangan[]): Penandatangan[] {
  return masukan.map((m, i) => ({
    id: `p${i + 1}`,
    nama: m.nama.trim(),
    jabatan: m.jabatan.trim(),
    peran: m.peran.trim() || `Penandatangan ${i + 1}`,
    email: huruf(m.email),
    ...(m.luar ? { luar: true } : {}),
  }));
}

/** Bagian yang diikat ke jejak tiap tanda tangan. */
export const bahanJejak = (sidikDokumen: string, email: string, waktu: string, sidikPng: string): string =>
  [sidikDokumen, huruf(email), waktu, sidikPng].join("|");

/** Berkas PNG dan PDF dipakai bersama; nama berkas aman tanpa spasi. */
export const namaBerkasTtd = (nomor: string, id: string, cap: string): string => `ttd-${nomor.replace(/[^A-Za-z0-9-]/g, "")}-${id}-${cap}.png`;

/** Cap waktu ringkas untuk nama berkas, mis. 20261016093015. */
export const capWaktu = (iso: string): string => iso.replace(/\D/g, "").slice(0, 14);
