// Standar awal untuk dokumen wajib, daftar periksa review klausul, dan sub-tahap tanda tangan.
//
// Semua isi di sini adalah DAFTAR AWAL yang disusun dari praktik umum kontrak konstruksi dan pengadaan
// di Indonesia, bukan keputusan resmi Legal. Di UI selalu diberi tanda "Standar awal, dapat disesuaikan
// Legal". Setiap fungsi menerima parameter `override` (objek biasa, mudah disimpan sebagai JSON di list
// Pengaturan Kontrak) supaya nanti daftarnya bisa diganti tanpa mengubah kode.
//
// Modul ini murni (tanpa React, tanpa jaringan) sehingga bisa diuji dengan scripts/uji-syarat.ts.

import { adalahLegal } from "./alur";
import {
  JENIS_ADDENDUM,
  JENIS_MOU,
  STATUS_PROSES,
  type ChecklistReview,
  type ItemChecklist,
  type JenisDokumen,
  type JenisKontrak,
  type JenisPerubahan,
  type Kontrak,
  type Sesi,
} from "./types";

// --- Dokumen wajib -----------------------------------------------------------------

export interface SlotDokumen {
  jenis: JenisDokumen;
  /** Nama pendek di daftar, mis. "Legalitas mitra". */
  label: string;
  /** Kalimat bantu untuk pengaju: dokumen apa persisnya. */
  petunjuk: string;
  /** Isi dokumen, dipakai di teks permintaan: "akta, NIB, NPWP". */
  rincian?: string;
}

export interface SyaratJenis {
  /** Harus ada sebelum review bisa berjalan lancar. */
  wajib: SlotDokumen[];
  /** Hanya bila situasinya mengharuskan: ditampilkan sebagai "bila ada", tidak dihitung kurang. */
  bersyarat: SlotDokumen[];
}

/** Pengganti daftar bawaan per jenis kontrak, dalam bentuk JSON sederhana. Jenis yang tidak disebut memakai bawaan. */
export type OverrideSyarat = Partial<Record<JenisKontrak, { wajib?: JenisDokumen[]; bersyarat?: JenisDokumen[] }>>;

const SLOT_DASAR: Record<JenisDokumen, Omit<SlotDokumen, "jenis">> = {
  "Dokumen Pendukung": { label: "Dokumen pendukung", petunjuk: "Dokumen lain yang menjelaskan kebutuhan atau dasar pengajuan." },
  "Draft Kontrak": { label: "Draft kontrak", petunjuk: "Draft yang akan direview Legal. Format Word (.docx) lebih mudah dikoreksi." },
  "Kontrak Ditandatangani": { label: "Kontrak bertanda tangan", petunjuk: "Salinan kontrak yang sudah ditandatangani semua pihak." },
  Penawaran: { label: "Penawaran / SPH", petunjuk: "Surat penawaran atau SPH dari mitra.", rincian: "penawaran atau SPH" },
  "SPK / PO": { label: "SPK / PO", petunjuk: "Surat perintah kerja atau purchase order yang menjadi dasar pengadaan." },
  BAST: { label: "BAST", petunjuk: "Berita acara serah terima pekerjaan atau barang." },
  "Legalitas Mitra": { label: "Legalitas mitra", petunjuk: "Akta pendirian beserta perubahannya, NIB, dan NPWP mitra.", rincian: "akta, NIB, NPWP" },
  "Surat Kuasa": { label: "Surat kuasa", petunjuk: "Dibutuhkan bila penandatangan mitra bukan pengurus yang tercantum di akta." },
  "Jaminan / Bank Garansi": { label: "Jaminan / bank garansi", petunjuk: "Dibutuhkan bila disyaratkan dalam dokumen pengadaan." },
  "BA Negosiasi": { label: "BA Negosiasi", petunjuk: "Berita acara negosiasi harga dan ketentuan." },
  "Bukti Persetujuan": { label: "Bukti persetujuan internal", petunjuk: "Memo atau persetujuan atasan yang relevan." },
  "Draft Final": { label: "Draft final", petunjuk: "Draft yang sudah disepakati dan siap ditandatangani." },
  "Lembar Review Legal": { label: "Lembar review Legal", petunjuk: "Hasil review internal Legal. Dibuat Legal, bukan diunggah pengaju." },
  Lainnya: { label: "Dokumen lain", petunjuk: "Dokumen lain yang relevan." },
};

function slot(jenis: JenisDokumen, ubah?: Partial<Omit<SlotDokumen, "jenis">>): SlotDokumen {
  return { jenis, ...SLOT_DASAR[jenis], ...ubah };
}

const WAJIB_PENGADAAN = (): SlotDokumen[] => [slot("Penawaran"), slot("BA Negosiasi"), slot("Legalitas Mitra"), slot("SPK / PO")];

/** Peta jenis kontrak ke dokumen wajib. Daftar awal; Legal dapat menggantinya lewat `override`. */
export const PETA_DOKUMEN: Record<JenisKontrak, SyaratJenis> = {
  "Pengadaan Barang": {
    wajib: WAJIB_PENGADAAN(),
    bersyarat: [slot("Draft Kontrak", { petunjuk: "Bila kontrak dibuat terpisah dari SPK / PO." }), slot("Surat Kuasa"), slot("Jaminan / Bank Garansi")],
  },
  "Pengadaan Jasa": {
    wajib: WAJIB_PENGADAAN(),
    bersyarat: [
      slot("Draft Kontrak", { petunjuk: "Bila kontrak dibuat terpisah dari SPK / PO." }),
      slot("Surat Kuasa"),
      slot("Jaminan / Bank Garansi"),
      slot("Dokumen Pendukung", { label: "KAK / lingkup pekerjaan", petunjuk: "Kerangka acuan kerja atau uraian lingkup jasa, bila ada." }),
    ],
  },
  Sewa: {
    wajib: [
      slot("Legalitas Mitra", { petunjuk: "Identitas pemilik atau penyewa: akta, NIB, NPWP, atau KTP bila perorangan." }),
      slot("Dokumen Pendukung", { label: "Bukti kepemilikan objek sewa", petunjuk: "Sertifikat, bukti hak, atau dokumen kepemilikan objek yang disewa." }),
      slot("Draft Kontrak"),
    ],
    bersyarat: [slot("Surat Kuasa"), slot("BA Negosiasi")],
  },
  "Kerja Sama": {
    wajib: [slot("Legalitas Mitra"), slot("Draft Kontrak")],
    bersyarat: [slot("Surat Kuasa"), slot("BA Negosiasi"), slot("Dokumen Pendukung", { label: "Proposal / rencana kerja sama", petunjuk: "Uraian singkat rencana kerja sama, bila ada." })],
  },
  "MoU / Nota Kesepahaman": {
    wajib: [slot("Legalitas Mitra"), slot("Draft Kontrak", { label: "Draft MoU" })],
    bersyarat: [slot("Surat Kuasa"), slot("Dokumen Pendukung")],
  },
  "Kerahasiaan (NDA)": {
    wajib: [slot("Legalitas Mitra"), slot("Draft Kontrak", { label: "Draft NDA" })],
    bersyarat: [slot("Surat Kuasa")],
  },
  "Addendum / Amandemen": {
    wajib: [
      slot("Dokumen Pendukung", { label: "Dasar perubahan", petunjuk: "Surat permintaan, berita acara, atau dokumen lain yang menjadi dasar perubahan." }),
      slot("Draft Kontrak", { label: "Draft addendum" }),
    ],
    bersyarat: [
      slot("Legalitas Mitra", { petunjuk: "Hanya bila ada perubahan pengurus atau data mitra." }),
      slot("Jaminan / Bank Garansi", { petunjuk: "Bila addendum memperpanjang waktu atau menambah nilai, jaminan biasanya ikut diperbarui." }),
      slot("Bukti Persetujuan"),
      slot("Surat Kuasa"),
    ],
  },
  Lainnya: {
    wajib: [slot("Draft Kontrak")],
    bersyarat: [slot("Legalitas Mitra"), slot("Dokumen Pendukung")],
  },
};

/** Satu jenis dokumen boleh dipenuhi oleh jenis lain yang lebih lanjut tahapnya. */
const PEMENUH: Partial<Record<JenisDokumen, JenisDokumen[]>> = {
  "Draft Kontrak": ["Draft Final", "Kontrak Ditandatangani"],
  "Draft Final": ["Kontrak Ditandatangani"],
};

/** Jenis dokumen yang dihitung memenuhi slot `jenis` (dirinya sendiri dan penggantinya). */
export function jenisPemenuh(jenis: JenisDokumen): JenisDokumen[] {
  return [jenis, ...(PEMENUH[jenis] ?? [])];
}

/** Daftar slot untuk sebuah jenis kontrak, dengan `override` bila ada. Jenis tak dikenal jatuh ke "Lainnya". */
export function syaratDokumen(jenisKontrak: JenisKontrak, override?: OverrideSyarat): SyaratJenis {
  const dasar = PETA_DOKUMEN[jenisKontrak] ?? PETA_DOKUMEN.Lainnya;
  const o = override?.[jenisKontrak];
  const sama = (daftar: SlotDokumen[], jenis: JenisDokumen) => daftar.find((s) => s.jenis === jenis) ?? slot(jenis);
  const pilih = (diganti: JenisDokumen[] | undefined, bawaan: SlotDokumen[], lain: SlotDokumen[]): SlotDokumen[] => {
    if (!diganti) return bawaan;
    const unik = [...new Set(diganti)];
    return unik.map((j) => sama([...bawaan, ...lain], j));
  };
  const wajib = pilih(o?.wajib, dasar.wajib, dasar.bersyarat);
  const bersyarat = pilih(o?.bersyarat, dasar.bersyarat, dasar.wajib).filter((s) => !wajib.some((w) => w.jenis === s.jenis));
  return { wajib, bersyarat };
}

export interface HasilKelengkapan {
  /** Jenis dokumen wajib untuk kontrak ini. */
  wajib: JenisDokumen[];
  /** Dari yang wajib, yang sudah ada. */
  ada: JenisDokumen[];
  /** Dari yang wajib, yang belum ada. */
  kurang: JenisDokumen[];
  /** Dokumen "bila ada": tidak pernah dihitung kurang. */
  bersyarat: JenisDokumen[];
}

/**
 * Bandingkan dokumen wajib dengan jenis dokumen yang sudah diunggah. `dokumenAda` boleh memuat "" (berkas
 * yang jenisnya belum diisi): tidak dihitung memenuhi apa pun.
 */
export function kekuranganDokumen(jenisKontrak: JenisKontrak, dokumenAda: readonly (JenisDokumen | "")[], override?: OverrideSyarat): HasilKelengkapan {
  const syarat = syaratDokumen(jenisKontrak, override);
  const ada = new Set(dokumenAda.filter((j): j is JenisDokumen => j !== ""));
  const terpenuhi = (j: JenisDokumen) => jenisPemenuh(j).some((x) => ada.has(x));
  const wajib = syarat.wajib.map((s) => s.jenis);
  return {
    wajib,
    ada: wajib.filter(terpenuhi),
    kurang: wajib.filter((j) => !terpenuhi(j)),
    bersyarat: syarat.bersyarat.map((s) => s.jenis),
  };
}

export interface RingkasKelengkapan {
  teks: string;
  persen: number;
  lengkap: boolean;
}

/** "3 dari 4 wajib". Tanpa dokumen wajib dianggap lengkap. */
export function ringkasKelengkapan(h: Pick<HasilKelengkapan, "wajib" | "ada">): RingkasKelengkapan {
  const total = h.wajib.length;
  if (total === 0) return { teks: "Tidak ada dokumen wajib", persen: 100, lengkap: true };
  return { teks: `${h.ada.length} dari ${total} wajib`, persen: Math.round((h.ada.length / total) * 100), lengkap: h.ada.length === total };
}

function namaSlot(j: JenisDokumen, jenisKontrak?: JenisKontrak, override?: OverrideSyarat): string {
  const syarat = jenisKontrak ? syaratDokumen(jenisKontrak, override) : null;
  const s = syarat ? [...syarat.wajib, ...syarat.bersyarat].find((x) => x.jenis === j) : undefined;
  const dasar = s ?? slot(j);
  return dasar.rincian ? `${dasar.label} (${dasar.rincian})` : dasar.label;
}

/**
 * Teks siap pakai untuk catatan Minta Revisi. Berbentuk daftar bernomor supaya pengaju melihatnya sebagai
 * poin di KartuRevisi (lihat uraiPoin di lib/revisi.ts). Kosong bila tidak ada yang kurang.
 */
export function teksMohonLengkapi(kurang: readonly JenisDokumen[], jenisKontrak?: JenisKontrak, override?: OverrideSyarat): string {
  if (kurang.length === 0) return "";
  const baris = kurang.map((j, i) => `${i + 1}. ${namaSlot(j, jenisKontrak, override)}`);
  return `Mohon lengkapi dokumen berikut ya:\n${baris.join("\n")}`;
}

/** Kalimat untuk catatan aktivitas ketika pengaju memilih "sisanya menyusul". */
export function teksSusulan(kurang: readonly JenisDokumen[], jenisKontrak?: JenisKontrak, override?: OverrideSyarat): string {
  if (kurang.length === 0) return "";
  return `Dokumen berikut akan menyusul: ${kurang.map((j) => namaSlot(j, jenisKontrak, override)).join(", ")}.`;
}

/**
 * Folder templat Legal di library Berkas Kontrak (U13). Standar awal: subfolder "_Templat" yang diisi Legal
 * dengan templat kontrak dan surat. Cukup satu tautan, tanpa daftar templat di aplikasi.
 */
export const FOLDER_TEMPLAT_LEGAL = "_Templat";

export function urlTemplatLegal(urlLibrary: string, folder: string = FOLDER_TEMPLAT_LEGAL): string {
  return `${urlLibrary.replace(/\/+$/, "")}/${encodeURIComponent(folder)}`;
}

/** Peringatan lunak di modal "Lanjut ke Tanda Tangan": dokumen wajib yang belum ada. Kosong bila lengkap. */
export function peringatanDokumenSebelumTtd(jenisKontrak: JenisKontrak, dokumenAda: readonly (JenisDokumen | "")[], override?: OverrideSyarat): string {
  const { kurang } = kekuranganDokumen(jenisKontrak, dokumenAda, override);
  if (kurang.length === 0) return "";
  return `Dokumen wajib yang belum ada: ${kurang.map((j) => namaSlot(j, jenisKontrak, override)).join(", ")}. Anda tetap bisa lanjut; ini hanya pengingat supaya arsipnya lengkap.`;
}

/** Panel kelengkapan relevan selama kontrak masih diproses. */
export function tampilkanPanelSyarat(k: Pick<Kontrak, "status">): boolean {
  return STATUS_PROSES.includes(k.status);
}

// --- Checklist review klausul --------------------------------------------------------

export interface ButirStandar {
  id: string;
  label: string;
  /** Hal yang perlu dicermati Legal pada butir ini. */
  petunjuk: string;
}

/** Pengganti daftar butir. Kunci "semua" mengganti dasar semua jenis; kunci jenis mengganti seluruh daftar jenis itu. */
export type OverrideReview = Partial<Record<JenisKontrak | "semua", ButirStandar[]>>;

export const VERSI_CHECKLIST = 1;

export const BUTIR_DASAR: readonly ButirStandar[] = [
  { id: "para-pihak", label: "Para pihak dan kewenangan", petunjuk: "Nama dan bentuk badan hukum sesuai akta; penandatangan berwenang (akta, surat kuasa, atau SK)." },
  { id: "objek-lingkup", label: "Objek dan lingkup", petunjuk: "Objek, spesifikasi, dan batas pekerjaan atau barang tertulis jelas dan tidak multitafsir." },
  { id: "nilai-pembayaran", label: "Nilai dan cara pembayaran", petunjuk: "Nilai, mata uang, termin, syarat tagihan, dan rekening pembayaran konsisten dengan data pengajuan." },
  { id: "jangka-waktu", label: "Jangka waktu dan perpanjangan", petunjuk: "Tanggal mulai dan berakhir, mekanisme perpanjangan, serta masa pemberitahuan bila ada." },
  { id: "jaminan", label: "Jaminan", petunjuk: "Jenis jaminan (pelaksanaan, uang muka, pemeliharaan), nilai, masa berlaku, dan penerbitnya." },
  { id: "denda", label: "Denda dan keterlambatan", petunjuk: "Tarif, batas maksimum, dan cara penghitungan denda wajar serta seimbang." },
  { id: "force-majeure", label: "Force majeure", petunjuk: "Daftar peristiwa, kewajiban memberi tahu, dan akibatnya terhadap waktu dan pembayaran." },
  { id: "sengketa", label: "Penyelesaian sengketa dan yurisdiksi", petunjuk: "Urutan musyawarah, mediasi, arbitrase atau pengadilan, dan domisili hukum yang disepakati." },
  { id: "pajak-meterai", label: "Pajak dan meterai", petunjuk: "Pihak yang menanggung pajak, kewajiban faktur pajak, dan bea meterai atau e-meterai." },
  { id: "kerahasiaan", label: "Kerahasiaan", petunjuk: "Ruang lingkup informasi rahasia, pengecualian, dan masa berlakunya." },
  { id: "pengakhiran", label: "Pengakhiran", petunjuk: "Sebab pemutusan, masa pemberitahuan, penyelesaian hak dan kewajiban saat berakhir." },
  { id: "hukum", label: "Hukum yang berlaku", petunjuk: "Hukum Republik Indonesia dan bahasa kontrak yang berlaku bila ada versi lain." },
];

type KonteksReview = Pick<Kontrak, "jenis"> & { jenisPerubahan?: readonly JenisPerubahan[] };

const ubahButir = (daftar: ButirStandar[], id: string, ganti: Partial<Omit<ButirStandar, "id">>) => daftar.map((b) => (b.id === id ? { ...b, ...ganti } : b));
const buangButir = (daftar: ButirStandar[], ...ids: string[]) => daftar.filter((b) => !ids.includes(b.id));
const sisipSetelah = (daftar: ButirStandar[], setelah: string, butir: ButirStandar) => {
  const i = daftar.findIndex((b) => b.id === setelah);
  const hasil = [...daftar];
  hasil.splice(i < 0 ? hasil.length : i + 1, 0, butir);
  return hasil;
};

function butirAddendum(jenisPerubahan: readonly JenisPerubahan[] | undefined): ButirStandar[] {
  const dasar = (id: string, ganti?: Partial<Omit<ButirStandar, "id">>): ButirStandar => ({ ...BUTIR_DASAR.find((b) => b.id === id)!, ...ganti });
  const dipilih = jenisPerubahan ?? [];
  // Tanpa keterangan jenis perubahan, periksa semua aspek yang lazim berubah.
  const ada = (j: JenisPerubahan) => dipilih.length === 0 || dipilih.includes(j);
  const daftar: ButirStandar[] = [
    { id: "pasal-diubah", label: "Pasal yang diubah", petunjuk: "Pasal dan ayat yang diubah disebut tepat, rumusan lama dan baru jelas, tanpa bertabrakan dengan pasal lain." },
    dasar("para-pihak"),
  ];
  if (ada("Perubahan Lingkup")) daftar.push(dasar("objek-lingkup", { petunjuk: "Perubahan objek atau lingkup tertulis jelas, termasuk dampaknya pada nilai dan waktu." }));
  if (ada("Perubahan Nilai")) daftar.push(dasar("nilai-pembayaran", { label: "Nilai dan pembayaran setelah perubahan", petunjuk: "Nilai baru, selisih terhadap nilai awal, dan perubahan termin sudah sesuai." }));
  if (ada("Perpanjangan Waktu")) daftar.push(dasar("jangka-waktu", { label: "Jangka waktu baru", petunjuk: "Tanggal berakhir baru, dan tidak ada celah waktu antara masa lama dan baru." }));
  if (ada("Perpanjangan Waktu") || ada("Perubahan Nilai")) daftar.push(dasar("jaminan", { petunjuk: "Jaminan diperpanjang atau disesuaikan agar tetap mencakup masa dan nilai yang baru." }));
  daftar.push(dasar("pajak-meterai"));
  daftar.push({ id: "ketentuan-lain", label: "Ketentuan lain tetap berlaku", petunjuk: "Ada pernyataan bahwa ketentuan kontrak induk yang tidak diubah tetap berlaku penuh." });
  return daftar;
}

/** Butir checklist standar menurut jenis kontrak (dan, untuk addendum, menurut apa yang diubah). */
export function daftarChecklistReview(konteks: KonteksReview, override?: OverrideReview): ButirStandar[] {
  const penuh = override?.[konteks.jenis];
  if (penuh) return penuh.map((b) => ({ ...b }));
  if (konteks.jenis === JENIS_ADDENDUM && !override?.semua) return butirAddendum(konteks.jenisPerubahan);

  let d: ButirStandar[] = (override?.semua ?? BUTIR_DASAR).map((b) => ({ ...b }));
  switch (konteks.jenis) {
    case "Pengadaan Barang":
      d = ubahButir(d, "objek-lingkup", { label: "Spesifikasi, jumlah, dan penyerahan barang", petunjuk: "Spesifikasi, jumlah, tempat dan jadwal penyerahan, serta cara pemeriksaan barang." });
      d = sisipSetelah(d, "denda", { id: "garansi-bast", label: "Garansi dan serah terima (BAST)", petunjuk: "Masa garansi, tanggung jawab cacat, dan syarat berita acara serah terima." });
      break;
    case "Pengadaan Jasa":
      d = ubahButir(d, "objek-lingkup", { label: "Lingkup, keluaran, dan serah terima jasa", petunjuk: "Lingkup jasa, keluaran yang diserahkan, dan syarat berita acara serah terima." });
      d = sisipSetelah(d, "denda", { id: "subkontrak", label: "Subkontrak dan tenaga kerja", petunjuk: "Aturan subkontrak, tanggung jawab atas tenaga kerja, serta K3 bila pekerjaan di lapangan." });
      break;
    case "Sewa":
      d = ubahButir(d, "objek-lingkup", { label: "Objek sewa, kondisi, dan pemeliharaan", petunjuk: "Identitas objek, kondisi saat diserahkan, penggunaan, dan siapa yang memelihara." });
      d = ubahButir(d, "nilai-pembayaran", { label: "Harga sewa dan cara pembayaran", petunjuk: "Harga sewa, jadwal pembayaran, dan penyesuaian harga bila masa sewa panjang." });
      d = ubahButir(d, "jaminan", { label: "Uang jaminan sewa", petunjuk: "Besar uang jaminan, syarat pengembalian, dan potongan yang diperbolehkan." });
      d = ubahButir(d, "denda", { label: "Denda keterlambatan pembayaran dan pengosongan", petunjuk: "Tarif denda keterlambatan bayar dan keterlambatan menyerahkan kembali objek." });
      break;
    case "Kerja Sama":
      d = ubahButir(d, "objek-lingkup", { label: "Peran, hak, dan hasil kerja sama", petunjuk: "Pembagian peran, hak, kewajiban, serta pembagian hasil atau kepemilikan hasil kerja sama." });
      d = ubahButir(d, "nilai-pembayaran", { label: "Pembiayaan dan pembagian hasil", petunjuk: "Siapa yang membiayai, skema bagi hasil atau imbal jasa, dan cara perhitungannya." });
      break;
    case JENIS_MOU:
      d = buangButir(d, "nilai-pembayaran", "jaminan", "denda");
      d = ubahButir(d, "objek-lingkup", { label: "Maksud, tujuan, dan ruang lingkup kerja sama", petunjuk: "Tujuan kerja sama dan batas bidang yang disepakati." });
      d = sisipSetelah(d, "objek-lingkup", { id: "sifat-mengikat", label: "Sifat mengikat dan tidak mengikat", petunjuk: "Jelas pasal mana yang mengikat (kerahasiaan, sengketa) dan mana yang hanya niat bekerja sama." });
      d = sisipSetelah(d, "jangka-waktu", { id: "tindak-lanjut", label: "Tindak lanjut ke kontrak pelaksana", petunjuk: "MoU menyebut bahwa pelaksanaan diatur dalam kontrak tersendiri dan tidak langsung menimbulkan kewajiban nilai." });
      break;
    case "Kerahasiaan (NDA)":
      d = buangButir(d, "nilai-pembayaran", "jaminan", "force-majeure");
      d = ubahButir(d, "objek-lingkup", { label: "Definisi informasi rahasia dan tujuan penggunaan", petunjuk: "Informasi apa yang dilindungi, untuk tujuan apa boleh dipakai, dan siapa yang boleh menerimanya." });
      d = ubahButir(d, "denda", { label: "Sanksi pelanggaran kerahasiaan", petunjuk: "Ganti rugi atau sanksi bila rahasia bocor, dan kewajiban mengembalikan atau memusnahkan dokumen." });
      d = ubahButir(d, "kerahasiaan", { petunjuk: "Masa kewajiban menjaga rahasia, termasuk setelah NDA berakhir, dan pengecualiannya." });
      break;
    default:
      break;
  }
  return d;
}

/**
 * Gabungkan butir standar dengan isian yang sudah tersimpan (cocok lewat id). Butir tersimpan yang tidak lagi
 * ada di standar tetap dibawa bila sudah dicentang atau punya catatan, supaya jejak Legal tidak hilang.
 */
export function susunChecklistReview(konteks: KonteksReview, tersimpan: ChecklistReview | null | undefined, override?: OverrideReview): ItemChecklist[] {
  const standar = daftarChecklistReview(konteks, override);
  const simpan = new Map((tersimpan?.items ?? []).map((i) => [i.id, i]));
  const hasil: ItemChecklist[] = standar.map((b) => {
    const s = simpan.get(b.id);
    return {
      id: b.id,
      label: b.label,
      selesai: s?.selesai === true,
      ...(s?.catatan ? { catatan: s.catatan } : {}),
      ...(s?.oleh ? { oleh: s.oleh } : {}),
      ...(s?.waktu ? { waktu: s.waktu } : {}),
    };
  });
  const dikenal = new Set(standar.map((b) => b.id));
  const yatim = (tersimpan?.items ?? []).filter((i) => !dikenal.has(i.id) && (i.selesai || i.catatan));
  return [...hasil, ...yatim];
}

export interface KemajuanChecklist {
  selesai: number;
  total: number;
  persen: number;
}

export function kemajuanChecklist(items: readonly Pick<ItemChecklist, "selesai">[]): KemajuanChecklist {
  const total = items.length;
  const selesai = items.filter((i) => i.selesai).length;
  return { selesai, total, persen: total === 0 ? 0 : Math.round((selesai / total) * 100) };
}

const potong = (teks: string, maks: number) => (teks.length <= maks ? teks : `${teks.slice(0, Math.max(0, maks - 1)).trimEnd()}…`);

/**
 * Ringkasan satu paragraf untuk catatan aktivitas saat "Lanjut ke Tanda Tangan". Dipotong di `maks` karakter
 * karena kolom Pesan di SharePoint bisa saja teks satu baris.
 */
export function ringkasSebelumTtd(checklist: ChecklistReview | null | undefined, maks = 240): string {
  const items = checklist?.items ?? [];
  if (items.length === 0) return "Checklist review klausul belum diisi.";
  const { selesai, total } = kemajuanChecklist(items);
  const belum = items.filter((i) => !i.selesai).map((i) => i.label);
  const catatan = items.filter((i) => i.catatan?.trim()).map((i) => `${i.label}: ${i.catatan!.trim()}`);
  let teks = `Checklist review klausul: ${selesai} dari ${total} butir selesai.`;
  if (belum.length) teks += ` Belum: ${belum.join(", ")}.`;
  if (catatan.length) teks += ` Catatan: ${catatan.join("; ")}.`;
  return potong(teks, maks);
}

/** Peringatan lunak (bukan blokir) bila checklist belum lengkap. null bila lengkap. */
export function peringatanChecklist(checklist: ChecklistReview | null | undefined): string | null {
  const items = checklist?.items ?? [];
  if (items.length === 0 || items.every((i) => !i.selesai)) {
    return "Checklist review klausul belum dicentang sama sekali. Anda tetap bisa lanjut, ini hanya pengingat.";
  }
  const belum = items.filter((i) => !i.selesai).map((i) => i.label);
  if (belum.length === 0) return null;
  const contoh = belum.slice(0, 3).join(", ");
  const sisa = belum.length > 3 ? ` dan ${belum.length - 3} lainnya` : "";
  return `Masih ada ${belum.length} butir review yang belum dicentang: ${contoh}${sisa}. Anda tetap bisa lanjut, ini hanya pengingat.`;
}

/** Checklist boleh diubah Legal selama kontrak masih di tahap Review Legal. */
export function bolehUbahChecklistReview(k: Pick<Kontrak, "status">, sesi: Sesi): boolean {
  return adalahLegal(sesi) && k.status === "Review Legal";
}

/** Tampilkan checklist bila review sudah berjalan atau sudah ada isinya. */
export function tampilkanChecklistReview(k: Pick<Kontrak, "status" | "checklistReview">): boolean {
  if (k.status === "Review Legal" || k.status === "Proses Tanda Tangan") return true;
  if (k.status === "Diajukan" || k.status === "Ditolak" || k.status === "Dibatalkan") return false;
  return (k.checklistReview?.items ?? []).some((i) => i.selesai);
}

// --- Sub-tahap tanda tangan ----------------------------------------------------------

export interface TahapTtd {
  id: string;
  label: string;
  petunjuk: string;
  /** Langkah yang berarti pihak menandatangani; dipakai untuk menentukan tanggal tanda tangan terakhir. */
  penandatanganan?: boolean;
}

export interface OverrideTtd {
  tahap?: TahapTtd[];
}

export const TAHAP_TTD_BAWAAN: readonly TahapTtd[] = [
  { id: "draft-mitra", label: "Draft final dikirim ke mitra", petunjuk: "Draft yang sudah disepakati dikirim ke mitra untuk ditandatangani." },
  { id: "paraf", label: "Paraf", petunjuk: "Paraf para pihak di setiap halaman, bila dipersyaratkan." },
  { id: "ttd-mitra", label: "TTD mitra", petunjuk: "Mitra sudah menandatangani, basah atau elektronik.", penandatanganan: true },
  { id: "ttd-direksi", label: "TTD direksi", petunjuk: "Direksi atau pejabat berwenang WKI sudah menandatangani.", penandatanganan: true },
  { id: "meterai", label: "Meterai atau e-meterai", petunjuk: "Meterai ditempel atau e-meterai dibubuhkan pada dokumen yang wajib bermeterai." },
  { id: "arsip-asli", label: "Asli diarsipkan", petunjuk: "Dokumen asli disimpan di arsip dan salinan bertanda tangan diunggah." },
];

export function daftarTahapTtd(override?: OverrideTtd): TahapTtd[] {
  return (override?.tahap ?? TAHAP_TTD_BAWAAN).map((t) => ({ ...t }));
}

/**
 * Checklist lengkap sebuah kontrak (butir standar yang belum tersimpan ikut dihitung "belum"), dibungkus
 * sebagai ChecklistReview. Pakai ini, bukan k.checklistReview mentah, untuk ringkasan "8 dari 12 butir".
 */
export function checklistReviewKontrak(k: Pick<Kontrak, "jenis" | "jenisPerubahan" | "checklistReview">, override?: OverrideReview): ChecklistReview {
  return { versi: VERSI_CHECKLIST, items: susunChecklistReview(k, k.checklistReview, override) };
}
