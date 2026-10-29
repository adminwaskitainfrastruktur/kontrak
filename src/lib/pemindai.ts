// Pemindai draf kontrak berbasis aturan (K06): klausul inti ada atau tidak, selisih dokumen terhadap data
// pengajuan, dan saran isian untuk mengisi pengajuan otomatis. Murni dan tanpa jaringan, jadi bisa diuji di Node.
//
// Semua keluaran adalah SARAN untuk dibaca manusia. Modul ini tidak menulis apa pun dan tidak pernah
// menimpa data pengajuan; pemakainya yang memutuskan isian mana yang dipakai.
import {
  hitungBerakhir,
  konteksSebelum,
  potongan,
  ratakan,
  samaNama,
  urailJangkaWaktu,
  urailJenis,
  urailJudul,
  urailNilaiRupiah,
  urailPihak,
  urailTanggal,
  type Keyakinan,
  type NilaiUang,
  type Temuan,
} from "./parserID";
import { tanggalPanjang } from "./terbilang";
import { JENIS_ADDENDUM, JENIS_MOU, type JenisKontrak, type Kontrak, type MataUang, type Ymd } from "./types";

export const PENAFIAN =
  "Hasil pemindaian otomatis berbasis pola kata, bukan nasihat hukum. Klausul bisa terlewat atau salah terbaca; keputusan tetap pada tinjauan Legal.";

// --- Klausul inti ---------------------------------------------------------------------

export interface DefKlausul {
  id: string;
  nama: string;
  /** Pola kata yang menandai klausul ini. Diuji pada teks yang sudah diratakan menjadi satu baris. */
  pola: RegExp[];
  /** Jenis kontrak yang lazimnya tidak memuat klausul ini (tidak dihitung sebagai kekurangan). */
  tidakUntuk?: readonly JenisKontrak[];
  bantuan: string;
}

const TANPA_NILAI: readonly JenisKontrak[] = [JENIS_MOU, "Kerahasiaan (NDA)"];

export const KLAUSUL_INTI: readonly DefKlausul[] = [
  { id: "para-pihak", nama: "Para pihak", pola: [/yang\s+bertanda\s+tangan\s+di\s+bawah\s+ini/i, /pihak\s+pertama/i, /para\s+pihak/i], bantuan: "Identitas dan kewenangan para pihak (komparisi)." },
  { id: "objek", nama: "Objek / ruang lingkup", pola: [/ruang\s+lingkup/i, /lingkup\s+(?:pekerjaan|kerja\s*sama)/i, /objek\s+(?:perjanjian|sewa|kontrak)/i, /obyek\s+(?:perjanjian|sewa|kontrak)/i, /maksud\s+dan\s+tujuan/i, /informasi\s+rahasia/i], bantuan: "Apa yang diperjanjikan." },
  { id: "nilai", nama: "Nilai / harga", pola: [/nilai\s+(?:kontrak|perjanjian|pekerjaan|addendum)/i, /harga\s+(?:kontrak|borongan|satuan|sewa|perjanjian|pekerjaan|barang)/i, /biaya\s+sewa/i, /total\s+harga/i], tidakUntuk: TANPA_NILAI, bantuan: "Nilai atau harga beserta mata uangnya." },
  { id: "jangka-waktu", nama: "Jangka waktu", pola: [/jangka\s+waktu/i, /masa\s+berlaku/i, /waktu\s+pelaksanaan/i, /masa\s+sewa/i], bantuan: "Kapan mulai dan berakhir." },
  { id: "pembayaran", nama: "Pembayaran", pola: [/(?:cara|tata\s+cara|mekanisme|syarat)\s+pembayaran/i, /\bpembayaran\b/i, /\btermin\b/i], tidakUntuk: TANPA_NILAI, bantuan: "Tahapan, syarat, dan cara pembayaran." },
  { id: "jaminan", nama: "Jaminan", pola: [/jaminan\s+(?:pelaksanaan|uang\s+muka|pemeliharaan|penawaran)/i, /bank\s+garansi|garansi\s+bank/i, /\bjaminan\b/i], tidakUntuk: [...TANPA_NILAI, "Kerja Sama"], bantuan: "Jaminan pelaksanaan, uang muka, atau pemeliharaan bila dipersyaratkan." },
  { id: "denda", nama: "Denda / keterlambatan", pola: [/\bdenda\b/i, /keterlambatan/i, /\bsanksi\b/i, /ganti\s+rugi/i], tidakUntuk: [JENIS_MOU], bantuan: "Akibat bila salah satu pihak terlambat atau lalai." },
  { id: "force-majeure", nama: "Keadaan kahar", pola: [/keadaan\s+kahar/i, /force\s+majeure/i, /keadaan\s+memaksa/i, /overmacht/i], bantuan: "Kejadian di luar kendali para pihak." },
  { id: "sengketa", nama: "Penyelesaian sengketa", pola: [/penyelesaian\s+(?:perselisihan|sengketa)/i, /\bperselisihan\b/i, /\barbitrase\b/i, /\bBANI\b/, /pengadilan\s+negeri/i], bantuan: "Musyawarah, arbitrase, atau pengadilan." },
  { id: "hukum", nama: "Hukum yang berlaku", pola: [/hukum\s+yang\s+berlaku/i, /tunduk\s+(?:pada|kepada)\s+hukum/i, /hukum\s+(?:negara\s+)?republik\s+indonesia/i, /domisili\s+hukum/i, /governing\s+law/i], bantuan: "Hukum yang mengatur perjanjian." },
  { id: "kerahasiaan", nama: "Kerahasiaan", pola: [/kerahasiaan/i, /\brahasia\b/i, /confidential/i], tidakUntuk: [JENIS_ADDENDUM], bantuan: "Kewajiban menjaga informasi." },
  { id: "pengakhiran", nama: "Pengakhiran", pola: [/pengakhiran/i, /pemutusan/i, /mengakhiri\s+(?:perjanjian|kontrak|nota)/i, /\bdiputus\b/i, /berakhirnya\s+(?:perjanjian|kontrak)/i], tidakUntuk: [JENIS_ADDENDUM], bantuan: "Kapan dan bagaimana perjanjian boleh diakhiri lebih awal." },
  { id: "meterai", nama: "Meterai", pola: [/\bmeterai\b/i, /\bmaterai\b/i, /bermeterai/i], bantuan: "Penandatanganan di atas meterai yang cukup." },
];

export interface HasilKlausul {
  id: string;
  nama: string;
  ada: boolean;
  /** Potongan teks tempat klausul ditemukan; kosong bila tidak ada. */
  kutipan: string;
  /** Lazim ada untuk jenis kontrak ini. Klausul yang tidak relevan tetap dilaporkan tetapi bukan kekurangan. */
  relevan: boolean;
  keyakinan: Keyakinan;
  bantuan: string;
}

/** Baris pendek berisi pola dianggap judul pasal: keyakinannya tinggi. Sebutan sambil lalu di kalimat: sedang. */
export function pindaiKlausul(teks: string, jenis?: JenisKontrak | null): HasilKlausul[] {
  const baris = teks.split("\n");
  return KLAUSUL_INTI.map((d) => {
    const relevan = !jenis || !d.tidakUntuk?.includes(jenis);
    let judul: { i: number; m: RegExpExecArray } | null = null;
    for (const pola of d.pola) {
      for (let i = 0; i < baris.length && !judul; i++) {
        const b = baris[i]!;
        if (b.length > 90) continue;
        const m = pola.exec(b);
        if (m) judul = { i, m };
      }
      if (judul) break;
    }
    if (judul) {
      const sekitar = [baris[judul.i - 1], baris[judul.i], baris[judul.i + 1]].filter(Boolean).join(" ");
      return { id: d.id, nama: d.nama, ada: true, kutipan: ratakan(sekitar).slice(0, 220), relevan, keyakinan: "tinggi" as Keyakinan, bantuan: d.bantuan };
    }
    for (const pola of d.pola) {
      const m = pola.exec(teks);
      if (m) return { id: d.id, nama: d.nama, ada: true, kutipan: potongan(teks, m.index, m.index + m[0].length, 70), relevan, keyakinan: "sedang" as Keyakinan, bantuan: d.bantuan };
    }
    return { id: d.id, nama: d.nama, ada: false, kutipan: "", relevan, keyakinan: "sedang" as Keyakinan, bantuan: d.bantuan };
  });
}

// --- Penanda kosong (K06 tahap 2) -----------------------------------------------------------

export type JenisPenanda = "isi" | "titik" | "kotak" | "huruf-x" | "kurung-kurawal";

export interface PenandaKosong {
  jenis: JenisPenanda;
  /** Teks penandanya apa adanya, mis. "...." atau "[ ]". */
  teks: string;
  /** Potongan kalimat di sekitarnya, supaya Legal tahu bagian mana yang masih kosong. */
  cuplikan: string;
  posisi: number;
}

export const LABEL_PENANDA: Record<JenisPenanda, string> = {
  isi: "Penanda [ISI: ...] dari draf templat",
  titik: "Titik-titik atau garis isian",
  kotak: "Kotak kosong [ ]",
  "huruf-x": "Huruf XXX",
  "kurung-kurawal": "Isian {...}",
};

/** Batas pengamanan untuk dokumen yang penuh titik (mis. daftar isi). */
const MAKS_PENANDA = 200;

// Angka Romawi XXX (pasal ke-30) bukan penanda kosong.
const ROMAWI_SETELAH = /(?:pasal|bab|bagian|ayat|angka|lampiran|huruf)\s*$/i;

/**
 * Bagian dokumen yang tampaknya belum diisi: "....", garis bawah berderet, "[ ]", "XXX", "{...}", dan "[ISI: ...]" dari
 * draf templat aplikasi. Titik-titik penuntun daftar isi (diikuti nomor halaman di ujung baris) tidak dihitung.
 * Murni berbasis pola: bisa salah, jadi hasilnya hanya saran untuk dibaca Legal.
 */
export function deteksiPenandaKosong(teks: string): PenandaKosong[] {
  const temuan: PenandaKosong[] = [];
  const terpakai: [number, number][] = [];
  const dalamTemuan = (a: number, b: number) => terpakai.some(([x, y]) => a >= x && b <= y);
  const tambah = (jenis: JenisPenanda, m: RegExpMatchArray) => {
    const a = m.index!;
    const b = a + m[0].length;
    if (dalamTemuan(a, b) || temuan.length >= MAKS_PENANDA) return;
    terpakai.push([a, b]);
    temuan.push({ jenis, teks: m[0].trim(), cuplikan: potongan(teks, a, b, 45), posisi: a });
  };

  for (const m of teks.matchAll(/\[\s*isi\b[^\]\n]{0,80}\]/gi)) tambah("isi", m);
  for (const m of teks.matchAll(/\[\s*\]/g)) tambah("kotak", m);
  for (const m of teks.matchAll(/\{[^{}\n]{0,60}\}/g)) tambah("kurung-kurawal", m);
  for (const m of teks.matchAll(/(?:\.\s?){4,}|…{2,}|_{4,}/g)) {
    const a = m.index!;
    const sisaBaris = teks.slice(a + m[0].length).split("\n", 1)[0]!.trim();
    const awalBaris = teks.slice(teks.lastIndexOf("\n", a - 1) + 1, a).trim();
    // Titik penuntun daftar isi: ada judul di depan dan hanya nomor halaman di belakang.
    if (awalBaris && /^(?:\d{1,3}|[ivxlcdm]{1,6})$/i.test(sisaBaris)) continue;
    tambah("titik", m);
  }
  for (const m of teks.matchAll(/\bX{3,}\b|\bx{4,}\b/g)) {
    if (ROMAWI_SETELAH.test(teks.slice(Math.max(0, m.index! - 14), m.index!))) continue;
    tambah("huruf-x", m);
  }
  return temuan.sort((a, b) => a.posisi - b.posisi);
}

// --- Memilih kandidat terbaik ---------------------------------------------------------

const BOBOT: Record<Keyakinan, number> = { tinggi: 3, sedang: 2, rendah: 1 };

const KONTEKS_NILAI_UTAMA = /(?:nilai|harga)\s+(?:kontrak|perjanjian|pekerjaan|borongan|sewa|total|keseluruhan|addendum)|total\s+(?:nilai|harga)|biaya\s+sewa|harga\s+sewa|seluruhnya\s+sebesar|adalah\s+sebesar/i;
const KONTEKS_NILAI_BUKAN = /denda|per\s*hari|perhari|per\s+bulan|jaminan|garansi|uang\s+muka|retensi|termin|tahap|angsuran|asuransi|ppn|pajak|maksimal|maksimum|paling\s+(?:banyak|sedikit)|modal|plafon|batas/i;

/** Pilih nilai kontrak dari semua angka uang di dokumen: konteks "nilai kontrak sebesar" diutamakan. */
export function pilihNilai(teks: string, kandidat: Temuan<NilaiUang>[]): Temuan<NilaiUang> | null {
  if (!kandidat.length) return null;
  const terbesar = Math.max(...kandidat.map((k) => k.nilai.nilai));
  let terbaik: { t: Temuan<NilaiUang>; skor: number } | null = null;
  for (const t of kandidat) {
    const depan = konteksSebelum(teks, t.posisi, 120);
    let skor = BOBOT[t.keyakinan];
    if (KONTEKS_NILAI_UTAMA.test(depan)) skor += 4;
    else if (/sebesar\s*$/i.test(depan)) skor += 1;
    // Hanya 60 karakter terdekat yang dipakai untuk penolak, supaya "Nilai Kontrak ... termasuk PPN" tetap lolos.
    if (KONTEKS_NILAI_BUKAN.test(konteksSebelum(teks, t.posisi, 60))) skor -= 4;
    if (t.nilai.nilai === terbesar) skor += 1;
    if (t.nilai.nilai < 1000) skor -= 3;
    if (!terbaik || skor > terbaik.skor) terbaik = { t, skor };
  }
  if (!terbaik || terbaik.skor < 2) return null;
  const { t, skor } = terbaik;
  const keyakinan: Keyakinan = skor >= 7 ? "tinggi" : skor >= 4 ? (t.keyakinan === "rendah" ? "rendah" : "sedang") : "rendah";
  return { ...t, keyakinan };
}

const KUNCI_MULAI = /(?:terhitung\s+(?:sejak|mulai)|mulai\s+berlaku|berlaku\s+(?:efektif\s+)?(?:sejak|mulai|pada)|sejak\s+tanggal|dimulai\s+(?:pada|sejak)?|tanggal\s+mulai|mulai\s+tanggal|efektif\s+(?:sejak|pada|tanggal))/gi;
const KUNCI_AKHIR = /(?:sampai\s+dengan|\bs\s?[./]\s?d\b\.?|\bhingga\b|\bberakhir\b(?:\s+pada)?|sampai\s+tanggal)/gi;

function posisiTerakhir(pola: RegExp, teks: string): number {
  let akhir = -1;
  for (const m of teks.matchAll(pola)) akhir = m.index! + m[0].length;
  return akhir;
}

export interface PilihanMasa {
  mulai: Temuan<Ymd> | null;
  berakhir: Temuan<Ymd> | null;
}

/**
 * Tanggal mulai dan berakhir dari kata kunci terdekat di depan tiap tanggal ("terhitung sejak tanggal X sampai
 * dengan tanggal Y"). Bila hanya tanggal mulai dan jangka waktu yang ada, tanggal berakhir dihitung.
 */
export function pilihMasa(teks: string, tanggal: Temuan<Ymd>[]): PilihanMasa {
  const calonMulai: Temuan<Ymd>[] = [];
  const calonAkhir: Temuan<Ymd>[] = [];
  for (const t of tanggal) {
    const depan = konteksSebelum(teks, t.posisi, 90);
    const pm = posisiTerakhir(KUNCI_MULAI, depan);
    const pa = posisiTerakhir(KUNCI_AKHIR, depan);
    if (pm < 0 && pa < 0) continue;
    (pa > pm ? calonAkhir : calonMulai).push(t);
  }
  const mulai = calonMulai[0] ?? null;
  // Tanggal berakhir yang dicari adalah pasangan tanggal mulai: yang muncul sesudahnya di teks.
  let berakhir = (mulai && calonAkhir.find((t) => t.posisi > mulai.posisi)) || calonAkhir[0] || null;
  if (mulai && berakhir && berakhir.nilai < mulai.nilai) {
    berakhir = { ...berakhir, keyakinan: "rendah", catatan: "Tanggal berakhir lebih awal dari tanggal mulai." };
  }
  if (mulai && !berakhir) {
    const jangka = urailJangkaWaktu(teks).find((j) => j.keyakinan !== "rendah" && j.nilai.kalender);
    const hitung = jangka ? hitungBerakhir(mulai.nilai, jangka.nilai) : null;
    if (jangka && hitung) berakhir = { nilai: hitung, keyakinan: "rendah", sumber: jangka.sumber, posisi: jangka.posisi, catatan: `Dihitung dari tanggal mulai ditambah ${jangka.nilai.jumlah} ${jangka.nilai.satuan}.` };
  }
  return { mulai, berakhir };
}

// --- Keterbacaan ----------------------------------------------------------------------

export type TingkatBaca = "baik" | "sebagian" | "buruk";

export interface Keterbacaan {
  tingkat: TingkatBaca;
  /** Jumlah kata yang terbaca. */
  kata: number;
  pesan: string;
}

export function nilaiBaca(teks: string): Keterbacaan {
  const kata = (teks.match(/\p{L}{2,}/gu) ?? []).length;
  if (kata < 40) return { tingkat: "buruk", kata, pesan: "Teks yang terbaca terlalu sedikit untuk dipindai. Hasil di bawah hampir pasti tidak lengkap." };
  const umum = (teks.match(/\b(?:yang|dan|dengan|dalam|pihak|ini|untuk|atau|pasal)\b/gi) ?? []).length;
  if (kata < 250 || umum / kata < 0.04)
    return { tingkat: "sebagian", kata, pesan: "Sebagian teks terbaca. Klausul yang ditandai belum ada mungkin sebenarnya ada; cek dokumen aslinya." };
  return { tingkat: "baik", kata, pesan: "Teks terbaca dengan baik." };
}

// --- Selisih terhadap pengajuan ---------------------------------------------------------

export type BidangSaran = "judul" | "mitra" | "nilai" | "mataUang" | "tanggalMulai" | "tanggalBerakhir" | "jenis";

export interface SaranIsian {
  judul: string;
  mitra: string;
  nilai: number;
  mataUang: MataUang;
  tanggalMulai: Ymd;
  tanggalBerakhir: Ymd;
  jenis: JenisKontrak;
}

export interface RincianSaran {
  keyakinan: Keyakinan;
  sumber: string;
  catatan?: string;
}

export type TingkatSelisih = "cocok" | "periksa" | "beda";

export interface Selisih {
  bidang: BidangSaran;
  label: string;
  di_dokumen: string;
  di_pengajuan: string;
  tingkat: TingkatSelisih;
  keterangan?: string;
}

/** Data pengajuan yang dibandingkan. Boleh sebagian (mis. dari state chat yang belum lengkap). */
export type DataPembanding = Partial<Pick<Kontrak, "judul" | "mitra" | "nilai" | "mataUang" | "tanggalMulai" | "tanggalBerakhir" | "jenis">>;

export const LABEL_BIDANG: Record<BidangSaran, string> = {
  judul: "Judul",
  mitra: "Mitra",
  nilai: "Nilai",
  mataUang: "Mata uang",
  tanggalMulai: "Tanggal mulai",
  tanggalBerakhir: "Tanggal berakhir",
  jenis: "Jenis kontrak",
};

const fmtAngka = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

export function teksUang(nilai: number, mataUang: MataUang = "IDR"): string {
  return `${mataUang === "IDR" ? "Rp" : `${mataUang} `}${fmtAngka.format(nilai)}`;
}

/** Tampilan nilai saran untuk manusia (tanggal panjang, uang berformat). */
export function teksSaran(bidang: BidangSaran, nilai: SaranIsian[BidangSaran], mataUang: MataUang = "IDR"): string {
  if (bidang === "nilai") return teksUang(nilai as number, mataUang);
  if (bidang === "tanggalMulai" || bidang === "tanggalBerakhir") {
    try {
      return tanggalPanjang(nilai as string);
    } catch {
      return String(nilai);
    }
  }
  return String(nilai);
}

function bandingkan(saran: Partial<SaranIsian>, rincian: Partial<Record<BidangSaran, RincianSaran>>, data: DataPembanding): Selisih[] {
  const hasil: Selisih[] = [];
  const kosong = "Belum diisi";
  const tidakKetemu = "Tidak ditemukan";
  const jenis = data.jenis ?? saran.jenis;

  if (data.mitra !== undefined) {
    const dok = saran.mitra;
    hasil.push({
      bidang: "mitra",
      label: LABEL_BIDANG.mitra,
      di_dokumen: dok ?? tidakKetemu,
      di_pengajuan: data.mitra || kosong,
      tingkat: !dok || !data.mitra ? "periksa" : samaNama(dok, data.mitra) ? "cocok" : "beda",
    });
  }
  if (data.nilai !== undefined && jenis !== JENIS_MOU) {
    const dok = saran.nilai;
    const mu = saran.mataUang ?? data.mataUang ?? "IDR";
    const tingkat: TingkatSelisih = dok == null || data.nilai == null ? "periksa" : Math.abs(dok - data.nilai) < 1 && mu === (data.mataUang ?? "IDR") ? "cocok" : "beda";
    hasil.push({
      bidang: "nilai",
      label: LABEL_BIDANG.nilai,
      di_dokumen: dok != null ? teksUang(dok, mu) : tidakKetemu,
      di_pengajuan: data.nilai != null ? teksUang(data.nilai, data.mataUang ?? "IDR") : kosong,
      tingkat,
      keterangan:
        jenis === JENIS_ADDENDUM && tingkat === "beda"
          ? "Pada addendum, nilai pengajuan adalah selisih terhadap kontrak induk; dokumen mungkin menyebut nilai total."
          : rincian.nilai?.catatan,
    });
  }
  for (const b of ["tanggalMulai", "tanggalBerakhir"] as const) {
    if (data[b] === undefined) continue;
    const dok = saran[b];
    const ajuan = data[b];
    hasil.push({
      bidang: b,
      label: LABEL_BIDANG[b],
      di_dokumen: dok ? teksSaran(b, dok) : tidakKetemu,
      di_pengajuan: ajuan ? teksSaran(b, ajuan) : kosong,
      tingkat: !dok || !ajuan ? "periksa" : dok === ajuan ? "cocok" : "beda",
      keterangan: rincian[b]?.catatan,
    });
  }
  if (data.jenis !== undefined && saran.jenis) {
    hasil.push({
      bidang: "jenis",
      label: LABEL_BIDANG.jenis,
      di_dokumen: saran.jenis,
      di_pengajuan: data.jenis ?? kosong,
      tingkat: saran.jenis === data.jenis ? "cocok" : rincian.jenis?.keyakinan === "tinggi" ? "beda" : "periksa",
    });
  }
  return hasil;
}

// --- Pintu utama ----------------------------------------------------------------------

/**
 * Judul pengajuan dari judul dokumen: bagian setelah "tentang" lebih menggambarkan isinya
 * ("Perjanjian Pengadaan Barang tentang Besi Beton" -> "Besi Beton").
 */
export function judulRingkas(judul: string): string {
  const m = /\btentang\s+(.{6,})$/i.exec(judul);
  const isi = (m ? m[1]! : judul).replace(/\s+antara\b.*$/i, "").trim();
  return isi.charAt(0).toUpperCase() + isi.slice(1);
}

export interface HasilPindai {
  klausul: HasilKlausul[];
  selisih: Selisih[];
  saranIsian: Partial<SaranIsian>;
  /** Keyakinan dan potongan sumber untuk tiap saran, supaya pengguna bisa memeriksa sebelum memakai. */
  rincianSaran: Partial<Record<BidangSaran, RincianSaran>>;
  keterbacaan: Keterbacaan;
  /** Bagian yang tampaknya belum diisi ("....", "[ ]", "XXX", "{...}"), urut dari awal dokumen. */
  penandaKosong: PenandaKosong[];
  /** Temuan internal dokumen, mis. angka dan tulisan huruf yang tidak sama. */
  catatan: string[];
  penafian: string;
}

/**
 * Pindai teks draf. `kontrak` (opsional) adalah data pengajuan pembanding; tanpa itu `selisih` kosong.
 * Fungsi ini tidak pernah mengubah `kontrak`.
 */
export function pindaiDraf(teks: string, kontrak?: DataPembanding | null): HasilPindai {
  const keterbacaan = nilaiBaca(teks);
  const saran: Partial<SaranIsian> = {};
  const rincian: Partial<Record<BidangSaran, RincianSaran>> = {};
  const catatan: string[] = [];

  const judul = urailJudul(teks);
  if (judul) {
    saran.judul = judulRingkas(judul.nilai);
    rincian.judul = { keyakinan: judul.keyakinan, sumber: judul.sumber };
  }
  const jenis = urailJenis(teks);
  if (jenis) {
    saran.jenis = jenis.nilai;
    rincian.jenis = { keyakinan: jenis.keyakinan, sumber: jenis.sumber, catatan: jenis.catatan };
  }

  const pihak = urailPihak(teks);
  const mitra = pihak.find((p) => !p.nilai.adalahWki && kontrak?.mitra && samaNama(p.nilai.nama, kontrak.mitra)) ?? pihak.find((p) => !p.nilai.adalahWki);
  if (mitra) {
    saran.mitra = `${mitra.nilai.bentuk} ${mitra.nilai.nama}`;
    rincian.mitra = { keyakinan: mitra.keyakinan, sumber: mitra.sumber };
  }

  const uang = urailNilaiRupiah(teks);
  for (const u of uang) if (u.catatan) catatan.push(`${u.catatan} (${u.sumber})`);
  const jenisAkhir = kontrak?.jenis ?? saran.jenis;
  const nilai = jenisAkhir === JENIS_MOU ? null : pilihNilai(teks, uang);
  if (nilai) {
    saran.nilai = nilai.nilai.nilai;
    saran.mataUang = nilai.nilai.mataUang;
    rincian.nilai = { keyakinan: nilai.keyakinan, sumber: nilai.sumber, catatan: nilai.catatan };
    rincian.mataUang = { keyakinan: nilai.keyakinan, sumber: nilai.sumber };
  }

  const masa = pilihMasa(teks, urailTanggal(teks));
  if (masa.mulai) {
    saran.tanggalMulai = masa.mulai.nilai;
    rincian.tanggalMulai = { keyakinan: masa.mulai.keyakinan, sumber: masa.mulai.sumber, catatan: masa.mulai.catatan };
  }
  if (masa.berakhir) {
    saran.tanggalBerakhir = masa.berakhir.nilai;
    rincian.tanggalBerakhir = { keyakinan: masa.berakhir.keyakinan, sumber: masa.berakhir.sumber, catatan: masa.berakhir.catatan };
  }
  for (const j of urailJangkaWaktu(teks)) if (j.catatan && j.keyakinan !== "rendah") catatan.push(`${j.catatan} (${j.sumber})`);

  if (keterbacaan.tingkat === "buruk") for (const r of Object.values(rincian)) r.keyakinan = "rendah";

  return {
    klausul: pindaiKlausul(teks, jenisAkhir),
    selisih: kontrak ? bandingkan(saran, rincian, kontrak) : [],
    saranIsian: saran,
    rincianSaran: rincian,
    keterbacaan,
    penandaKosong: deteksiPenandaKosong(teks),
    catatan: [...new Set(catatan)].slice(0, 8),
    penafian: PENAFIAN,
  };
}

/** Ringkasan teks biasa untuk disalin ke komentar atau catatan review. */
export function ringkasPindai(h: HasilPindai, namaBerkas = ""): string {
  const relevan = h.klausul.filter((k) => k.relevan);
  const hilang = relevan.filter((k) => !k.ada).map((k) => k.nama);
  const baris = [
    `Hasil pindai otomatis${namaBerkas ? ` ${namaBerkas}` : ""}: ${relevan.length - hilang.length}/${relevan.length} klausul inti terdeteksi.`,
    hilang.length ? `Belum terdeteksi: ${hilang.join(", ")}.` : "Semua klausul inti terdeteksi.",
    ...h.selisih.filter((s) => s.tingkat === "beda").map((s) => `${s.label} berbeda: dokumen ${s.di_dokumen}, pengajuan ${s.di_pengajuan}.`),
    ...(h.penandaKosong.length ? [`Bagian yang tampaknya masih kosong: ${h.penandaKosong.length} (mis. ${h.penandaKosong.slice(0, 3).map((p) => p.teks).join(" ")}).`] : []),
    ...h.catatan,
    `(${h.penafian})`,
  ];
  return baris.join("\n");
}
