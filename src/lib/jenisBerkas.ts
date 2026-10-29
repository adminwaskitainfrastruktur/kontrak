// Logika murni seputar berkas: ikon dan warna per ekstensi, tebakan jenis dokumen dari
// nama berkas, batas ukuran dan tipe, serta aturan siapa boleh mengubah atau menghapus
// dokumen. Sengaja tidak mengimpor config atau graph supaya bisa diuji tanpa peramban
// (scripts/uji-dokumen.ts).
import { adalahLegal, bisaUbahSebagaiPengaju, bisaUnggah } from "./alur";
import { JENIS_DOKUMEN, type Dokumen, type JenisDokumen, type Kontrak, type Sesi } from "./types";

// --- Ekstensi dan tampilan -----------------------------------------------------

export type KelompokBerkas = "pdf" | "docx" | "xlsx" | "gambar" | "zip" | "lainnya";
export type NamaIkonBerkas = "FileText" | "FileSpreadsheet" | "FileImage" | "FileArchive" | "File";

export interface TampilanBerkas {
  kelompok: KelompokBerkas;
  /** Teks pendek untuk lencana, mis. "PDF". */
  label: string;
  ikon: NamaIkonBerkas;
  /** Kelas Tailwind (token CSS) untuk petak ikon. */
  kelas: string;
}

const DAFTAR_KELOMPOK: Record<KelompokBerkas, Omit<TampilanBerkas, "kelompok">> = {
  pdf: { label: "PDF", ikon: "FileText", kelas: "bg-danger-soft text-danger" },
  docx: { label: "Word", ikon: "FileText", kelas: "bg-info-soft text-info" },
  xlsx: { label: "Excel", ikon: "FileSpreadsheet", kelas: "bg-success-soft text-success" },
  gambar: { label: "Gambar", ikon: "FileImage", kelas: "bg-accent-soft text-accent-ink" },
  zip: { label: "Arsip", ikon: "FileArchive", kelas: "bg-raised text-muted" },
  lainnya: { label: "Berkas", ikon: "File", kelas: "bg-brand-soft text-brand" },
};

const EKSTENSI_GAMBAR = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic"];
const EKSTENSI_PETA: Record<string, KelompokBerkas> = {
  pdf: "pdf",
  doc: "docx",
  docx: "docx",
  rtf: "docx",
  odt: "docx",
  xls: "xlsx",
  xlsx: "xlsx",
  csv: "xlsx",
  ods: "xlsx",
  zip: "zip",
  rar: "zip",
  "7z": "zip",
  ...Object.fromEntries(EKSTENSI_GAMBAR.map((e) => [e, "gambar" as const])),
};

/** Ekstensi huruf kecil tanpa titik; "" bila tidak ada. */
export function ekstensiDari(nama: string): string {
  const i = nama.lastIndexOf(".");
  if (i <= 0 || i === nama.length - 1) return "";
  return nama.slice(i + 1).toLowerCase();
}

export function kelompokBerkas(nama: string): KelompokBerkas {
  return EKSTENSI_PETA[ekstensiDari(nama)] ?? "lainnya";
}

export function tampilanBerkas(nama: string): TampilanBerkas {
  const kelompok = kelompokBerkas(nama);
  return { kelompok, ...DAFTAR_KELOMPOK[kelompok] };
}

/** Versi baru harus berformat sama dengan berkas aslinya, supaya nama dan isi tidak saling bertentangan. */
export function sepadanEkstensi(namaAsli: string, namaBaru: string): boolean {
  return ekstensiDari(namaAsli) === ekstensiDari(namaBaru);
}

// --- Tebakan jenis dari nama berkas ---------------------------------------------

/** Pecah nama berkas menjadi kata utuh huruf kecil: "BAST_Tahap2-final.pdf" -> bast, tahap, 2, final. */
export function tokenKata(nama: string): string[] {
  const tanpaEkstensi = nama.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  return tanpaEkstensi
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Tebakan jenis yang aman. Sengaja TIDAK PERNAH menebak "Kontrak Ditandatangani": kata final,
 * signed, ttd atau ditandatangani muncul di nama draft juga, dan salah label di sini
 * berarti kontrak Aktif tanpa salinan yang sah. Hasil null = tidak yakin, biarkan pengguna memilih.
 */
export function tebakJenis(namaBerkas: string): JenisDokumen | null {
  const kata = new Set(tokenKata(namaBerkas));
  const ada = (...cari: string[]) => cari.some((c) => kata.has(c));

  if (ada("negosiasi", "nego") && ada("ba", "berita")) return "BA Negosiasi";
  if (ada("bast") || (kata.has("serah") && kata.has("terima"))) return "BAST";
  if (ada("spk", "spmk", "po") || (kata.has("purchase") && kata.has("order")) || (kata.has("perintah") && kata.has("kerja"))) return "SPK / PO";
  if (kata.has("surat") && kata.has("kuasa")) return "Surat Kuasa";
  if (ada("jaminan", "garansi", "surety", "bg")) return "Jaminan / Bank Garansi";
  if (ada("legalitas", "akta", "nib", "npwp", "siup", "tdp", "ahu", "kemenkumham")) return "Legalitas Mitra";
  if (ada("penawaran", "sph", "quotation")) return "Penawaran";
  if (ada("draft", "draf") && ada("final")) return "Draft Final";
  if (ada("draft", "draf")) return "Draft Kontrak";
  return null;
}

// --- Batas ukuran dan tipe -------------------------------------------------------

export const BATAS_UKURAN_BERKAS = 100 * 1024 * 1024;
export const BATAS_PRATINJAU = 25 * 1024 * 1024;
export const BATAS_PAKET_ARSIP = 250 * 1024 * 1024;
export const BATAS_BERKAS_ANTREAN = 20;

const EKSTENSI_DIIZINKAN = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "rtf", "odt", "ods",
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic",
  "zip", "rar", "7z", "msg", "eml", "dwg", "dxf",
]);

const EKSTENSI_DIBLOKIR = new Set(["exe", "bat", "cmd", "com", "scr", "msi", "js", "vbs", "ps1", "jar", "dll", "lnk", "sh", "apk", "iso", "html", "htm", "svg"]);

export function teksUkuran(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 ** 2) return `${Math.round(byte / 1024)} KB`;
  if (byte < 1024 ** 3) return `${(byte / 1024 ** 2).toFixed(1)} MB`;
  return `${(byte / 1024 ** 3).toFixed(1)} GB`;
}

/** Pesan alasan berkas tidak bisa diunggah, atau null bila boleh. */
export function validasiBerkas(nama: string, ukuran: number): string | null {
  const eks = ekstensiDari(nama);
  if (!eks) return `"${nama}" tidak punya ekstensi, jadi jenis berkasnya tidak bisa dikenali.`;
  if (EKSTENSI_DIBLOKIR.has(eks)) return `Berkas .${eks} tidak diizinkan karena bisa berisi program atau skrip.`;
  if (!EKSTENSI_DIIZINKAN.has(eks)) return `Format .${eks} belum didukung. Ubah ke PDF atau berkas Office, atau kompres dalam ZIP.`;
  if (ukuran <= 0) return `"${nama}" kosong (0 byte). Periksa kembali berkasnya.`;
  if (ukuran > BATAS_UKURAN_BERKAS) return `"${nama}" berukuran ${teksUkuran(ukuran)}, melebihi batas ${teksUkuran(BATAS_UKURAN_BERKAS)} per berkas.`;
  if (nama.length > 200) return `Nama berkas terlalu panjang (${nama.length} karakter, maksimal 200). Persingkat dulu namanya.`;
  return null;
}

/** Ganti karakter yang ditolak SharePoint ("*:<>?/\| dan kendali) dan rapikan nama. */
export function namaBerkasAman(nama: string): string {
  const bersih = nama
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f"*:<>?/\\|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^~\$/, "")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  if (!bersih) return "berkas";
  if (bersih.length <= 150) return bersih;
  const eks = ekstensiDari(bersih);
  const sisa = eks ? 150 - eks.length - 1 : 150;
  return `${bersih.slice(0, sisa)}${eks ? `.${eks}` : ""}`;
}

/** Awal isi berkas PDF yang sah dimulai dengan "%PDF-". */
export function kepalaPdfValid(lima: string): boolean {
  return lima.startsWith("%PDF-");
}

// --- Pratinjau -----------------------------------------------------------------

export type ModePratinjau = "pdf" | "gambar" | "tab";

const GAMBAR_PRATINJAU = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

/** Pratinjau di laci hanya untuk PDF dan gambar kecil; selebihnya dibuka di tab SharePoint. */
export function modePratinjau(nama: string, ukuran: number, opsi: { ios?: boolean } = {}): { mode: ModePratinjau; alasan: string } {
  const eks = ekstensiDari(nama);
  const bisaPdf = eks === "pdf";
  const bisaGambar = GAMBAR_PRATINJAU.includes(eks);
  if (!bisaPdf && !bisaGambar) return { mode: "tab", alasan: "Berkas Office dan format lain paling baik dibaca di SharePoint, jadi dibuka di tab baru." };
  if (ukuran > BATAS_PRATINJAU) return { mode: "tab", alasan: `Berkas ini ${teksUkuran(ukuran)}, di atas batas pratinjau ${teksUkuran(BATAS_PRATINJAU)}. Dibuka di tab baru saja.` };
  if (bisaPdf && opsi.ios) return { mode: "tab", alasan: "Peramban iPhone dan iPad hanya menampilkan halaman pertama PDF di laci, jadi dibuka di tab baru." };
  return { mode: bisaPdf ? "pdf" : "gambar", alasan: "" };
}

export function tipeMimeGambar(nama: string): string {
  const eks = ekstensiDari(nama);
  if (eks === "jpg" || eks === "jpeg") return "image/jpeg";
  return `image/${eks}`;
}

// --- Pengelompokan dokumen --------------------------------------------------------

/** Urutan tampil per jenis: yang paling menentukan di atas. */
export const URUTAN_JENIS: readonly JenisDokumen[] = [
  "Kontrak Ditandatangani",
  "Draft Final",
  "Draft Kontrak",
  "Penawaran",
  "SPK / PO",
  "BA Negosiasi",
  "Legalitas Mitra",
  "Surat Kuasa",
  "Jaminan / Bank Garansi",
  "BAST",
  "Bukti Persetujuan",
  "Lembar Review Legal",
  "Dokumen Pendukung",
  "Lainnya",
];

export interface KelompokDokumen<T> {
  /** "" = jenis belum diisi (metadata gagal tersimpan atau berkas diunggah langsung lewat SharePoint). */
  jenis: JenisDokumen | "";
  dokumen: T[];
  /** Dokumen terbaru di kelompok. null bila kelompok hanya berisi satu dokumen (tidak perlu dibedakan). */
  terbaruId: string | null;
}

export function kelompokkanDokumen<T extends Pick<Dokumen, "id" | "jenis" | "diubah">>(daftar: readonly T[]): KelompokDokumen<T>[] {
  const peta = new Map<JenisDokumen | "", T[]>();
  for (const d of daftar) {
    const jenis = (JENIS_DOKUMEN as readonly string[]).includes(d.jenis) ? d.jenis : "";
    const isi = peta.get(jenis) ?? [];
    isi.push(d);
    peta.set(jenis, isi);
  }
  const urutan = (j: JenisDokumen | ""): number => (j === "" ? 999 : URUTAN_JENIS.indexOf(j));
  return [...peta.entries()]
    .sort((a, b) => urutan(a[0]) - urutan(b[0]))
    .map(([jenis, isi]) => {
      const dokumen = [...isi].sort((a, b) => b.diubah.localeCompare(a.diubah));
      return { jenis, dokumen, terbaruId: dokumen.length > 1 ? dokumen[0]!.id : null };
    });
}

/** Berapa jenis wajib yang sudah ada, dan apa yang masih kurang. Urutan mengikuti `syarat`. */
export function hitungSyarat(syarat: readonly JenisDokumen[], jenisAda: readonly string[]): { terpenuhi: JenisDokumen[]; kurang: JenisDokumen[] } {
  const ada = new Set(jenisAda);
  const unik = [...new Set(syarat)];
  return { terpenuhi: unik.filter((j) => ada.has(j)), kurang: unik.filter((j) => !ada.has(j)) };
}

// --- Hak mengelola dokumen ----------------------------------------------------------

export type AksiDokumen = "hapus" | "jenis" | "versi";

const JENIS_TERKUNCI: JenisDokumen = "Kontrak Ditandatangani";
/** Salinan Lembar Hasil Review Legal: dokumen internal, hanya Legal yang boleh mengelola dan memilih jenis ini. */
const JENIS_INTERNAL_LEGAL: JenisDokumen = "Lembar Review Legal";

/**
 * Siapa boleh apa pada sebuah dokumen.
 * - Legal: kapan pun kecuali kontrak Dibatalkan. Pengaju: hanya saat Diajukan atau Perlu Revisi
 *   (versi baru juga saat Review dan Tanda Tangan, sama seperti unggah biasa).
 * - "Kontrak Ditandatangani" pada kontrak Aktif atau Berakhir hanya boleh diubah Admin. Pengaju tidak
 *   pernah boleh menyentuh jenis ini.
 */
export function izinDokumen(k: Kontrak, jenis: JenisDokumen | "", aksi: AksiDokumen, sesi: Sesi): { boleh: boolean; alasan: string } {
  const tolak = (alasan: string) => ({ boleh: false, alasan });
  if (sesi.peran === "Pemantau") return tolak("Peran Pemantau hanya bisa melihat.");

  const legal = adalahLegal(sesi);
  if (jenis === JENIS_INTERNAL_LEGAL && !legal) return tolak("Lembar review hanya dikelola Legal.");
  if (jenis === JENIS_TERKUNCI) {
    if (!legal) return tolak("Kontrak bertanda tangan hanya dikelola Legal.");
    if ((k.status === "Aktif" || k.status === "Berakhir") && sesi.peran !== "Admin") {
      return tolak("Kontrak bertanda tangan pada kontrak yang sudah Aktif hanya bisa diubah Admin.");
    }
  }

  if (aksi === "versi") {
    return bisaUnggah(k, sesi) ? { boleh: true, alasan: "" } : tolak("Dokumen pada tahap ini tidak bisa diperbarui oleh Anda.");
  }
  const dasar = legal ? k.status !== "Dibatalkan" : bisaUbahSebagaiPengaju(k, sesi);
  return dasar ? { boleh: true, alasan: "" } : tolak(legal ? "Kontrak yang dibatalkan tidak bisa diubah dokumennya." : "Dokumen hanya bisa diubah saat pengajuan Diajukan atau Perlu Revisi.");
}

export const bolehHapusDokumen = (k: Kontrak, jenis: JenisDokumen | "", sesi: Sesi) => izinDokumen(k, jenis, "hapus", sesi);

/** Ubah jenis memeriksa jenis lama dan jenis tujuan. */
export function izinUbahJenis(k: Kontrak, dari: JenisDokumen | "", ke: JenisDokumen, sesi: Sesi): { boleh: boolean; alasan: string } {
  const lama = izinDokumen(k, dari, "jenis", sesi);
  if (!lama.boleh) return lama;
  return izinDokumen(k, ke, "jenis", sesi);
}

/** Pilihan jenis yang boleh dipakai pengguna ini saat mengunggah atau mengubah jenis. */
export function pilihanJenisUntuk(sesi: Sesi): JenisDokumen[] {
  const semua = [...URUTAN_JENIS];
  return adalahLegal(sesi) ? semua : semua.filter((j) => j !== JENIS_TERKUNCI && j !== JENIS_INTERNAL_LEGAL);
}

// --- Versi dokumen -------------------------------------------------------------------

/**
 * Label versi SharePoint ("3.0", "2.1") menjadi nomor internal _vti_history (mayor * 512 + minor).
 * null bila label tidak dikenali.
 */
export function nomorInternalVersi(label: string): number | null {
  const m = /^(\d+)\.(\d+)$/.exec(label.trim());
  if (!m) return null;
  const mayor = Number(m[1]);
  const minor = Number(m[2]);
  if (minor >= 512) return null;
  return mayor * 512 + minor;
}

/** "3.0" -> "v3", "2.1" -> "v2.1". Label yang tidak dikenali dikembalikan apa adanya. */
export function teksVersi(label: string): string {
  const m = /^(\d+)\.(\d+)$/.exec(label.trim());
  if (!m) return label;
  return m[2] === "0" ? `v${m[1]}` : `v${m[1]}.${m[2]}`;
}

/**
 * Alamat salinan versi lama di SharePoint: <site>/_vti_history/<nomor>/<library>/<folder>/<berkas>.
 * Peramban membukanya dengan cookie SharePoint pengguna, jadi tidak perlu token Graph.
 */
export function urlVersiLama(urlSite: string, urlLibrary: string, folder: string, nama: string, label: string): string | null {
  const nomor = nomorInternalVersi(label);
  if (nomor == null || !urlLibrary.startsWith(urlSite)) return null;
  const library = urlLibrary.slice(urlSite.length).replace(/^\/+|\/+$/g, "");
  if (!library) return null;
  return `${urlSite}/_vti_history/${nomor}/${library}/${encodeURIComponent(folder)}/${encodeURIComponent(nama)}`;
}

// --- Aktivasi -------------------------------------------------------------------------

/** Dokumen "Kontrak Ditandatangani" terbaru (dasar kolom KontrakFinal), atau null bila belum ada. */
export function dokumenFinalTerbaru<T extends Pick<Dokumen, "jenis" | "diubah">>(daftar: readonly T[]): T | null {
  let hasil: T | null = null;
  for (const d of daftar) {
    if (d.jenis !== JENIS_TERKUNCI) continue;
    if (!hasil || d.diubah > hasil.diubah) hasil = d;
  }
  return hasil;
}

/** Berkas yang boleh menjadi kontrak bertanda tangan: hanya PDF. */
export function bolehJadiKontrakFinal(nama: string): boolean {
  return ekstensiDari(nama) === "pdf";
}
