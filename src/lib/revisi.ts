// Permintaan revisi yang terstruktur (U06): poin dari catatan Minta Revisi, apa yang berubah sejak
// revisi diminta, dan chip templat poin untuk modal Minta Revisi.
//
// Murni (tanpa React, tanpa jaringan) supaya bisa diuji dengan scripts/uji-syarat.ts.

import type { Aktivitas, Dokumen, Kontrak } from "./types";

export const STATUS_REVISI = "Perlu Revisi";

export interface PermintaanRevisi {
  /** Aktivitas Status ke Perlu Revisi yang menjadi sumbernya. */
  aktivitasId: number;
  waktu: string;
  olehNama: string;
  olehEmail: string;
  /** Catatan apa adanya. */
  catatan: string;
  uraian: UraianPoin;
}

/** Catatan Status ke Perlu Revisi yang paling baru. null bila kontrak belum pernah diminta revisi. */
export function permintaanRevisiTerakhir(aktivitas: readonly Aktivitas[]): PermintaanRevisi | null {
  let terbaru: Aktivitas | null = null;
  for (const a of aktivitas) {
    if (a.jenis !== "Status" || a.statusKe !== STATUS_REVISI) continue;
    if (!terbaru || a.waktu > terbaru.waktu) terbaru = a;
  }
  if (!terbaru) return null;
  return {
    aktivitasId: terbaru.id,
    waktu: terbaru.waktu,
    olehNama: terbaru.olehNama,
    olehEmail: terbaru.olehEmail,
    catatan: terbaru.pesan,
    uraian: uraiPoin(terbaru.pesan),
  };
}

/** Kiriman ulang pertama setelah revisi diminta (Status dari Perlu Revisi ke Review Legal). */
export function kirimUlangSetelah(aktivitas: readonly Aktivitas[], waktu: string): Aktivitas | null {
  const cocok = aktivitas
    .filter((a) => a.jenis === "Status" && a.statusDari === STATUS_REVISI && a.statusKe === "Review Legal" && a.waktu > waktu)
    .sort((a, b) => a.waktu.localeCompare(b.waktu));
  return cocok[0] ?? null;
}

// --- Uraian poin ---------------------------------------------------------------------

export interface UraianPoin {
  /** Kalimat pembuka sebelum daftar, mis. "Mohon lengkapi dokumen berikut ya:". */
  pengantar: string;
  poin: string[];
  /** true bila catatan tidak berbentuk daftar dan dikembalikan utuh sebagai satu poin. */
  bebas: boolean;
}

// "1." "1)" "(1)" "a." "-" "•" "*" "–" di awal baris.
const PENANDA = /^\s*(?:\(?\d{1,2}[.)]|\(?[a-zA-Z][.)](?=\s)|[-•*–])\s+/;
const bersihkan = (t: string) => t.replace(/\s+/g, " ").trim();

/** Pecah "1. abc 2. def 3. ghi" dalam satu baris. Hanya bila nomornya berurutan mulai dari 1. */
function pecahSebaris(baris: string): string[] | null {
  const posisi: number[] = [];
  const re = /(^|\s)(\d{1,2})[.)]\s+/g;
  let m: RegExpExecArray | null;
  let harap = 1;
  while ((m = re.exec(baris))) {
    if (Number(m[2]) !== harap) continue;
    posisi.push(m.index + m[1]!.length);
    harap++;
  }
  if (posisi.length < 2) return null;
  const pengantar = baris.slice(0, posisi[0]).trim();
  const bagian = posisi.map((p, i) => bersihkan(baris.slice(p, posisi[i + 1] ?? baris.length).replace(PENANDA, "")).replace(/[;,]$/, ""));
  return [pengantar, ...bagian];
}

/**
 * Pecah catatan Minta Revisi menjadi poin. Urutan pertimbangan:
 * 1) baris berpenanda (angka, huruf, atau bulatan): tiap penanda memulai poin baru, baris tanpa penanda
 *    sesudahnya disambung ke poin sebelumnya kecuali dipisah baris kosong; teks sebelum penanda pertama
 *    menjadi pengantar;
 * 2) satu baris berisi "1. ... 2. ...";
 * 3) beberapa baris tanpa penanda: tiap baris satu poin;
 * 4) cadangan: seluruh teks sebagai satu poin bebas.
 */
export function uraiPoin(teks: string | null | undefined): UraianPoin {
  const mentah = (teks ?? "").replace(/\r\n?/g, "\n").trim();
  if (!mentah) return { pengantar: "", poin: [], bebas: true };
  const baris = mentah.split("\n");

  if (baris.some((b) => PENANDA.test(b))) {
    const pengantar: string[] = [];
    const poin: string[] = [];
    let mulai = false;
    let jedaKosong = false;
    for (const b of baris) {
      if (!b.trim()) {
        jedaKosong = true;
        continue;
      }
      if (PENANDA.test(b)) {
        mulai = true;
        poin.push(bersihkan(b.replace(PENANDA, "")));
      } else if (!mulai) {
        pengantar.push(bersihkan(b));
      } else if (jedaKosong) {
        poin.push(bersihkan(b));
      } else {
        poin[poin.length - 1] = bersihkan(`${poin[poin.length - 1]} ${b}`);
      }
      jedaKosong = false;
    }
    return { pengantar: pengantar.join(" "), poin: poin.filter(Boolean), bebas: false };
  }

  const isi = baris.map(bersihkan).filter(Boolean);
  if (isi.length === 1) {
    const sebaris = pecahSebaris(isi[0]!);
    if (sebaris) {
      const [pengantar, ...poin] = sebaris;
      return { pengantar: pengantar ?? "", poin: poin.filter(Boolean), bebas: false };
    }
    return { pengantar: "", poin: [isi[0]!], bebas: true };
  }
  // Baris pertama yang berakhir titik dua adalah pengantar, bukan poin.
  if (isi[0]!.endsWith(":")) return { pengantar: isi[0]!, poin: isi.slice(1), bebas: false };
  return { pengantar: "", poin: isi, bebas: false };
}

// --- Templat poin ---------------------------------------------------------------------

export interface TemplatPoin {
  id: string;
  /** Teks chip, pendek. */
  label: string;
  /** Kalimat yang dimasukkan ke catatan. */
  teks: string;
}

/** Chip siap pakai di modal Minta Revisi. Standar awal; Legal dapat mengganti lewat `override`. */
export const TEMPLAT_POIN: readonly TemplatPoin[] = [
  { id: "legalitas", label: "Lengkapi legalitas", teks: "Lengkapi dokumen legalitas mitra (akta pendirian dan perubahannya, NIB, NPWP)." },
  { id: "kuasa", label: "Surat kuasa", teks: "Lampirkan surat kuasa karena penandatangan mitra bukan pengurus yang tercantum di akta." },
  { id: "pembayaran", label: "Klausul pembayaran", teks: "Perbaiki klausul pembayaran: termin, syarat tagihan, dan rekening tujuan perlu diperjelas." },
  { id: "lingkup", label: "Lingkup pekerjaan", teks: "Perjelas objek dan lingkup pekerjaan supaya tidak multitafsir." },
  { id: "jangka", label: "Jangka waktu", teks: "Sesuaikan jangka waktu dan tanggal berakhir dengan dokumen pengadaan." },
  { id: "nilai", label: "Nilai tidak cocok", teks: "Nilai kontrak di draft berbeda dengan penawaran atau BA negosiasi; mohon diselaraskan." },
  { id: "jaminan", label: "Jaminan", teks: "Lampirkan jaminan atau bank garansi sesuai yang disyaratkan, lengkap dengan masa berlakunya." },
  { id: "denda", label: "Denda", teks: "Atur ulang klausul denda keterlambatan: tarif dan batas maksimumnya." },
  { id: "identitas", label: "Identitas mitra", teks: "Perbaiki identitas mitra (nama badan hukum, alamat, penandatangan, jabatan) agar sesuai akta." },
  { id: "format", label: "Draft format Word", teks: "Unggah ulang draft dalam format Word (.docx) supaya bisa dikoreksi langsung." },
];

export function daftarTemplatPoin(override?: readonly TemplatPoin[]): TemplatPoin[] {
  return (override ?? TEMPLAT_POIN).map((t) => ({ ...t }));
}

/**
 * Tambahkan satu poin ke catatan yang sedang diketik, dengan nomor berikutnya. Teks bebas yang sudah ada
 * dibiarkan sebagai pengantar. Poin yang sama persis tidak ditambahkan dua kali.
 */
export function tambahPoin(catatan: string, teksPoin: string): string {
  const baru = teksPoin.trim();
  if (!baru) return catatan;
  const sekarang = catatan.replace(/\s+$/, "");
  if (!sekarang) return `1. ${baru}`;
  const u = uraiPoin(sekarang);
  if (!u.bebas && u.poin.some((p) => p === bersihkan(baru))) return catatan;
  const bernomor = sekarang.split("\n").filter((b) => /^\s*\d{1,2}[.)]\s+/.test(b)).length;
  return `${sekarang}\n${bernomor + 1}. ${baru}`;
}

// --- Tanggapan pengaju -----------------------------------------------------------------

export interface TanggapanPoin {
  sudah: boolean;
  teks?: string;
}

/** Catatan opsional untuk aksi Kirim Ulang, disusun dari tanggapan per poin. Kosong bila tidak ada isinya. */
export function teksTanggapan(poin: readonly string[], tanggapan: Readonly<Record<number, TanggapanPoin>>): string {
  const baris: string[] = [];
  poin.forEach((p, i) => {
    const t = tanggapan[i];
    if (!t || (!t.sudah && !t.teks?.trim())) return;
    const status = t.sudah ? "sudah" : "belum";
    const isi = t.teks?.trim() ? ` (${t.teks.trim()})` : "";
    baris.push(`${i + 1}. ${potongLabel(p)}: ${status}${isi}`);
  });
  return baris.length ? `Tanggapan atas poin revisi:\n${baris.join("\n")}` : "";
}

function potongLabel(p: string, maks = 60): string {
  return p.length <= maks ? p : `${p.slice(0, maks - 1).trimEnd()}…`;
}

// --- Sejak revisi diminta --------------------------------------------------------------

export interface SejakRevisi {
  sejak: string | null;
  dokumenBaru: Dokumen[];
  /** Nama kolom yang diubah lewat formulir sejak revisi diminta (unik, urut kemunculan). */
  kolomDiubah: string[];
  komentar: number;
  /** Kalimat siap tampil, mis. ["2 dokumen baru: a.docx, b.pdf", "Data diubah: Nilai, Tanggal berakhir"]. */
  ringkasan: string[];
  adaDokumenBaru: boolean;
  adaPerubahan: boolean;
}

/**
 * Apa yang terjadi sejak revisi terakhir diminta: dokumen yang diunggah atau diperbarui sesudahnya, kolom
 * yang diubah, dan komentar. Bila belum pernah diminta revisi, semuanya kosong.
 */
export function sejakRevisi(dokumen: readonly Dokumen[], aktivitas: readonly Aktivitas[], permintaan: PermintaanRevisi | null = permintaanRevisiTerakhir(aktivitas)): SejakRevisi {
  if (!permintaan) return { sejak: null, dokumenBaru: [], kolomDiubah: [], komentar: 0, ringkasan: [], adaDokumenBaru: false, adaPerubahan: false };
  const t = Date.parse(permintaan.waktu);
  const sesudah = (iso: string) => Date.parse(iso) > t;

  const dokumenBaru = dokumen.filter((d) => sesudah(d.diubah)).sort((a, b) => b.diubah.localeCompare(a.diubah));
  const kolom: string[] = [];
  let komentar = 0;
  for (const a of [...aktivitas].sort((x, y) => x.waktu.localeCompare(y.waktu))) {
    if (!sesudah(a.waktu)) continue;
    if (a.jenis === "Perubahan") for (const d of a.detail) if (d.kolom && !kolom.includes(d.kolom)) kolom.push(d.kolom);
    if (a.jenis === "Komentar") komentar++;
  }

  const ringkasan: string[] = [];
  if (dokumenBaru.length) {
    const nama = dokumenBaru.slice(0, 3).map((d) => d.nama);
    const sisa = dokumenBaru.length > 3 ? ` dan ${dokumenBaru.length - 3} lainnya` : "";
    ringkasan.push(`${dokumenBaru.length} dokumen baru: ${nama.join(", ")}${sisa}`);
  }
  if (kolom.length) ringkasan.push(`Data diubah: ${kolom.join(", ")}`);
  if (komentar) ringkasan.push(`${komentar} komentar baru`);

  return {
    sejak: permintaan.waktu,
    dokumenBaru,
    kolomDiubah: kolom,
    komentar,
    ringkasan,
    adaDokumenBaru: dokumenBaru.length > 0,
    adaPerubahan: dokumenBaru.length > 0 || kolom.length > 0,
  };
}

/** Kartu revisi tampil penuh saat status Perlu Revisi. */
export function tampilkanKartuRevisi(k: Pick<Kontrak, "status">): boolean {
  return k.status === STATUS_REVISI;
}

/**
 * Untuk Legal: kontrak yang baru dikirim ulang (Review Legal, dan kiriman ulang terjadi setelah revisi
 * terakhir) layak diberi ringkasan "yang berubah sejak revisi diminta".
 */
export function baruDikirimUlang(k: Pick<Kontrak, "status">, aktivitas: readonly Aktivitas[]): boolean {
  if (k.status !== "Review Legal") return false;
  const p = permintaanRevisiTerakhir(aktivitas);
  return !!p && !!kirimUlangSetelah(aktivitas, p.waktu);
}

/** Kunci localStorage untuk tanggapan per poin; terikat ke permintaan revisi tertentu. */
export const kunciTanggapan = (kontrakId: number, aktivitasId: number) => `kontrak-wki:tanggapan-revisi:${kontrakId}:${aktivitasId}`;
