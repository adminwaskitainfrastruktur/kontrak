// Pembuat draf perjanjian .docx dari data pengajuan (K04). Isinya dirakit dulu sebagai model murni (susunDraf)
// sehingga bisa diuji di Node, lalu dirender ke .docx dengan pustaka `docx` yang dimuat dinamis.
//
// Prinsip isi: hanya kerangka dan klausul umum yang aman. Ketentuan yang butuh keputusan Legal (besaran denda,
// forum sengketa, jaminan, termin) TIDAK dikarang, melainkan diberi penanda "[ISI: ...]" bersorot kuning.
import { hitungBerakhir, type JangkaWaktu } from "./parserID";
import { namaHari, tanggalPanjang, terbilangAngka, terbilangRupiah, terbilangTanggal } from "./terbilang";
import { JENIS_ADDENDUM, JENIS_MOU, type JenisKontrak, type Kontrak, type MataUang, type Ymd } from "./types";

const keYmdWib = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export const JENIS_DRAF = ["Pengadaan Barang", "Pengadaan Jasa", "Sewa", "Kerja Sama", "MoU", "NDA", "Addendum"] as const;
export type JenisDraf = (typeof JENIS_DRAF)[number];

export const CATATAN_DRAF = "DRAF AWAL, wajib ditinjau Legal sebelum digunakan";
export const NAMA_WKI = "PT Waskita Karya Infrastruktur";
export const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function jenisDrafDari(jenis: JenisKontrak): JenisDraf {
  switch (jenis) {
    case "Pengadaan Barang":
    case "Pengadaan Jasa":
    case "Sewa":
    case "Kerja Sama":
      return jenis;
    case JENIS_MOU:
      return "MoU";
    case "Kerahasiaan (NDA)":
      return "NDA";
    case JENIS_ADDENDUM:
      return "Addendum";
    default:
      return "Pengadaan Jasa";
  }
}

export interface DataDraf {
  judul?: string;
  nomorKontrak?: string;
  nomorPengajuan?: string;
  mitra?: string;
  alamatMitra?: string;
  npwpMitra?: string;
  penandatanganMitra?: string;
  jabatanMitra?: string;
  dasarKewenangan?: string;
  nilai?: number | null;
  mataUang?: MataUang;
  tanggalMulai?: Ymd | null;
  tanggalBerakhir?: Ymd | null;
  tanggalTtd?: Ymd | null;
  deskripsi?: string;
  kodeProyek?: string;
  /** Hanya addendum: kontrak yang diubah. */
  induk?: { judul: string; nomor: string; tanggal?: Ymd | null } | null;
  urutanAddendum?: number | null;
  jenisPerubahan?: readonly string[];
  /** Identitas WKI bila kelak disimpan di Pengaturan; kosong berarti penanda [ISI]. */
  wki?: { alamat?: string; wakil?: string; jabatan?: string; dasar?: string };
  /** ISO; default sekarang. Dipisah supaya uji deterministik. */
  dibuatPada?: string;
}

const bersih = (s: string | null | undefined) => (s ?? "").trim();

/** Data draf dari item kontrak; `induk` diisi untuk addendum. */
export function dataDrafDari(k: Kontrak, induk?: Kontrak | null): DataDraf {
  return {
    judul: k.judul,
    nomorKontrak: k.nomorKontrak,
    nomorPengajuan: k.nomorPengajuan,
    mitra: k.mitra,
    alamatMitra: k.alamatMitra,
    npwpMitra: k.npwpMitra,
    penandatanganMitra: k.penandatanganMitra,
    jabatanMitra: k.jabatanMitra,
    dasarKewenangan: k.dasarKewenangan,
    nilai: k.nilai,
    mataUang: k.mataUang,
    tanggalMulai: k.tanggalMulai,
    tanggalBerakhir: k.tanggalBerakhir,
    tanggalTtd: k.tanggalTandaTangan,
    deskripsi: k.deskripsi,
    kodeProyek: k.kodeProyek,
    induk: induk ? { judul: induk.judul, nomor: induk.nomorKontrak || induk.nomorPengajuan, tanggal: induk.tanggalTandaTangan ?? induk.tanggalMulai } : null,
    urutanAddendum: k.urutanAddendum,
    jenisPerubahan: k.jenisPerubahan,
  };
}

// --- Nama berkas dan versi -------------------------------------------------------------

/** "Draft v2 KTR-2026-0012 - Pengadaan Besi Beton.docx"; karakter yang ditolak SharePoint dibuang. */
export function namaBerkasDraf(k: Pick<Kontrak, "nomorPengajuan" | "judul">, versi: number): string {
  const judul = bersih(k.judul)
    .replace(/["*:<>?/\\|#%~&{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/[.\s]+$/, "");
  const nomor = bersih(k.nomorPengajuan).replace(/["*:<>?/\\|#%~&{}]/g, "-");
  return `Draft v${Math.max(1, Math.floor(versi))}${nomor ? ` ${nomor}` : ""}${judul ? ` - ${judul}` : ""}.docx`;
}

/** Versi berikutnya dari nama-nama dokumen yang sudah ada ("Draft v3 ..." -> 4). */
export function versiDrafBerikut(namaDokumen: readonly string[]): number {
  let maks = 0;
  for (const n of namaDokumen) {
    const m = /^draft\s*v(\d+)\b/i.exec(n.trim());
    if (m) maks = Math.max(maks, Number(m[1]));
  }
  return maks + 1;
}

// --- Model dokumen -----------------------------------------------------------------------

/** Potongan teks: biasa, tebal, atau penanda kosong yang wajib diisi Legal. */
export type Potong = string | { tebal: string } | { isi: string };

export type Blok =
  | { tipe: "catatan"; isi: Potong[] }
  | { tipe: "judul"; isi: Potong[] }
  | { tipe: "tengah"; isi: Potong[] }
  | { tipe: "paragraf"; isi: Potong[] }
  | { tipe: "butir"; tanda: string; isi: Potong[] }
  | { tipe: "pasal"; nomor: number; judul: string }
  | { tipe: "ttd"; kiri: Potong[][]; kanan: Potong[][] };

const kosong = (label: string): Potong => ({ isi: label });
const tebal = (t: string): Potong => ({ tebal: t });
const atau = (nilai: string | null | undefined, label: string): Potong => (bersih(nilai) ? bersih(nilai) : kosong(label));

export const teksPotong = (p: Potong): string => (typeof p === "string" ? p : "tebal" in p ? p.tebal : `[ISI: ${p.isi}]`);

/** Semua penanda [ISI] di draf, berurutan dan tanpa duplikat: dipakai UI untuk "n bagian perlu dilengkapi". */
export function daftarPenanda(blok: readonly Blok[]): string[] {
  const hasil: string[] = [];
  const ambil = (ps: Potong[]) => ps.forEach((p) => typeof p !== "string" && "isi" in p && !hasil.includes(p.isi) && hasil.push(p.isi));
  for (const b of blok) {
    if (b.tipe === "ttd") [...b.kiri, ...b.kanan].forEach(ambil);
    else if (b.tipe !== "pasal") ambil(b.isi);
  }
  return hasil;
}

/** Teks polos seluruh draf (untuk pratinjau dan uji). */
export function teksDraf(blok: readonly Blok[]): string {
  return blok
    .map((b) => {
      if (b.tipe === "pasal") return `Pasal ${b.nomor}\n${b.judul}`;
      if (b.tipe === "ttd") return [...b.kiri, ...b.kanan].map((r) => r.map(teksPotong).join("")).join("\n");
      if (b.tipe === "butir") return `${b.tanda} ${b.isi.map(teksPotong).join("")}`;
      return b.isi.map(teksPotong).join("");
    })
    .join("\n");
}

const fmtAngka = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

/** "Rp1.250.000.000,00 (satu miliar dua ratus lima puluh juta rupiah)" sebagai potongan; penanda bila kosong. */
function potongNilai(nilai: number | null | undefined, mataUang: MataUang = "IDR"): Potong[] {
  if (nilai == null || !Number.isFinite(nilai)) return [kosong("nilai dalam angka"), " (", kosong("nilai dalam huruf"), ")"];
  const abs = Math.abs(nilai);
  const angka = `${mataUang === "IDR" ? "Rp" : `${mataUang} `}${fmtAngka.format(abs)}`;
  return [tebal(angka), ` (${terbilangRupiah(abs, mataUang)})`];
}

const TANGGAL_KOSONG = (label: string): Potong[] => [kosong(label)];

function potongTanggal(ymd: Ymd | null | undefined, label: string): Potong[] {
  if (!ymd) return TANGGAL_KOSONG(label);
  try {
    return [tanggalPanjang(ymd)];
  } catch {
    return TANGGAL_KOSONG(label);
  }
}

/** Lama berlaku dalam bulan/tahun/hari bila tanggalnya pas; null bila tidak bisa dinyatakan rapi. */
export function lamaBerlaku(mulai: Ymd, berakhir: Ymd): JangkaWaktu | null {
  if (!(berakhir >= mulai)) return null;
  for (let b = 1; b <= 240; b++) {
    const jangka: JangkaWaktu = { jumlah: b, satuan: "bulan", kalender: true };
    const hasil = hitungBerakhir(mulai, jangka);
    if (hasil === berakhir) return b % 12 === 0 ? { jumlah: b / 12, satuan: "tahun", kalender: true } : jangka;
    if (hasil && hasil > berakhir) break;
  }
  const hari = Math.round((Date.parse(`${berakhir}T00:00:00Z`) - Date.parse(`${mulai}T00:00:00Z`)) / 86_400_000) + 1;
  return hari > 0 ? { jumlah: hari, satuan: "hari", kalender: true } : null;
}

function potongMasa(d: DataDraf, sebutan: string): Potong[] {
  const { tanggalMulai: m, tanggalBerakhir: b } = d;
  let lama: JangkaWaktu | null = null;
  try {
    lama = m && b ? lamaBerlaku(m, b) : null;
  } catch {
    lama = null;
  }
  const potLama: Potong[] = lama ? [`selama ${lama.jumlah} (${terbilangAngka(lama.jumlah)}) ${lama.satuan} `] : ["selama ", kosong("lama jangka waktu"), " "];
  return [`${sebutan} ini berlaku `, ...potLama, "terhitung sejak tanggal ", ...potongTanggal(m, "tanggal mulai"), " sampai dengan tanggal ", ...potongTanggal(b, "tanggal berakhir"), "."];
}

interface Peran {
  judul: string;
  sebutan: string;
  /** Sebutan fungsi tiap pihak, mis. Pembeli/Penyedia; kosong untuk perjanjian setara. */
  pertama?: string;
  kedua?: string;
}

const PERAN: Record<JenisDraf, Peran> = {
  "Pengadaan Barang": { judul: "PERJANJIAN PENGADAAN BARANG", sebutan: "Perjanjian", pertama: "Pembeli", kedua: "Penyedia" },
  "Pengadaan Jasa": { judul: "PERJANJIAN PENGADAAN JASA", sebutan: "Perjanjian", pertama: "Pengguna Jasa", kedua: "Penyedia Jasa" },
  Sewa: { judul: "PERJANJIAN SEWA", sebutan: "Perjanjian", pertama: "Penyewa", kedua: "Pemberi Sewa" },
  "Kerja Sama": { judul: "PERJANJIAN KERJA SAMA", sebutan: "Perjanjian" },
  MoU: { judul: "NOTA KESEPAHAMAN", sebutan: "Nota Kesepahaman" },
  NDA: { judul: "PERJANJIAN KERAHASIAAN", sebutan: "Perjanjian" },
  Addendum: { judul: "ADDENDUM", sebutan: "Addendum" },
};

type Pasal = { judul: string; ayat: Potong[][] };

// --- Pasal umum (dipakai beberapa jenis) ---------------------------------------------------

const pasalNilai = (d: DataDraf, sebutan: string, judul = "Nilai Perjanjian"): Pasal => ({
  judul,
  ayat: [
    [`${judul} adalah sebesar `, ...potongNilai(d.nilai, d.mataUang), ", ", kosong("termasuk atau tidak termasuk PPN"), "."],
    [`Rincian nilai tercantum dalam Lampiran `, kosong("nomor lampiran"), ` yang merupakan bagian tidak terpisahkan dari ${sebutan} ini.`],
  ],
});

const pasalJangka = (d: DataDraf, sebutan: string, judul = "Jangka Waktu"): Pasal => ({
  judul,
  ayat: [potongMasa(d, sebutan), [`Jangka waktu dapat diperpanjang berdasarkan kesepakatan tertulis PARA PIHAK yang dituangkan dalam addendum.`]],
});

const pasalBayar: Pasal = {
  judul: "Cara Pembayaran",
  ayat: [
    ["Pembayaran dilakukan dengan cara ", kosong("tahapan atau termin pembayaran beserta syaratnya"), "."],
    ["Tagihan diajukan oleh PIHAK KEDUA dengan melampirkan ", kosong("dokumen tagihan, mis. faktur dan berita acara"), "."],
    ["Pembayaran dilakukan melalui transfer ke rekening PIHAK KEDUA: ", kosong("nama bank, nomor rekening, atas nama"), "."],
  ],
};

const pasalJaminan: Pasal = {
  judul: "Jaminan",
  ayat: [[kosong("jenis, nilai, penerbit, dan masa berlaku jaminan bila dipersyaratkan; hapus pasal ini bila tidak ada")]],
};

const pasalDenda = (pelaksana: string): Pasal => ({
  judul: "Denda Keterlambatan",
  ayat: [
    [`Apabila ${pelaksana} terlambat memenuhi kewajibannya sesuai jangka waktu dalam Perjanjian ini, ${pelaksana} dikenakan denda sebesar `, kosong("besaran denda"), " untuk setiap hari keterlambatan, dengan batas paling banyak ", kosong("batas maksimal denda"), "."],
    ["Denda diperhitungkan dengan cara ", kosong("cara pemotongan atau pembayaran denda"), "."],
  ],
});

const pasalKahar: Pasal = {
  judul: "Keadaan Kahar",
  ayat: [
    ["Keadaan Kahar adalah keadaan di luar kehendak dan kemampuan PARA PIHAK yang tidak dapat diperkirakan sebelumnya, sehingga kewajiban dalam Perjanjian ini tidak dapat dipenuhi."],
    ["PIHAK yang mengalami Keadaan Kahar wajib memberitahukannya secara tertulis kepada PIHAK lainnya paling lambat ", kosong("jumlah hari"), " hari sejak terjadinya Keadaan Kahar."],
    ["Jenis Keadaan Kahar dan akibatnya terhadap kewajiban PARA PIHAK: ", kosong("rincian keadaan kahar dan akibatnya"), "."],
  ],
};

const pasalAkhir = (sebutan: string): Pasal => ({
  judul: "Pengakhiran",
  ayat: [
    [`${sebutan} ini dapat diakhiri sebelum jangka waktunya berakhir berdasarkan kesepakatan tertulis PARA PIHAK.`],
    ["Alasan dan tata cara pemutusan oleh salah satu PIHAK: ", kosong("alasan pemutusan, pemberitahuan, dan akibatnya"), "."],
  ],
});

const pasalRahasia = (sebutan: string): Pasal => ({
  judul: "Kerahasiaan",
  ayat: [
    [`Masing-masing PIHAK wajib menjaga kerahasiaan seluruh data dan informasi yang diperoleh sehubungan dengan ${sebutan} ini dan tidak mengungkapkannya kepada pihak ketiga tanpa persetujuan tertulis PIHAK lainnya, kecuali diwajibkan oleh peraturan perundang-undangan.`],
  ],
});

const pasalSengketa = (sebutan: string): Pasal => ({
  judul: "Penyelesaian Perselisihan",
  ayat: [
    [`Perselisihan yang timbul dari atau sehubungan dengan ${sebutan} ini diselesaikan terlebih dahulu secara musyawarah untuk mufakat.`],
    ["Apabila musyawarah tidak mencapai mufakat dalam waktu ", kosong("jumlah hari"), " hari, perselisihan diselesaikan melalui ", kosong("forum penyelesaian, mis. pengadilan negeri tertentu atau arbitrase"), "."],
  ],
});

const pasalHukum = (sebutan: string): Pasal => ({
  judul: "Hukum yang Berlaku",
  ayat: [[`${sebutan} ini tunduk pada dan ditafsirkan berdasarkan hukum Negara Republik Indonesia.`]],
});

const pasalLain = (sebutan: string): Pasal => ({
  judul: "Ketentuan Lain",
  ayat: [
    [`Setiap perubahan atas ${sebutan} ini hanya sah apabila dibuat secara tertulis dalam bentuk addendum yang ditandatangani PARA PIHAK.`],
    [`Lampiran ${sebutan} ini merupakan bagian yang tidak terpisahkan dari ${sebutan} ini, yaitu: `, kosong("daftar lampiran"), "."],
    ["Alamat korespondensi PARA PIHAK: ", kosong("alamat surat-menyurat dan surel masing-masing PIHAK"), "."],
  ],
});

const pasalPenutup = (sebutan: string): Pasal => ({
  judul: "Penutup",
  ayat: [[`${sebutan} ini dibuat dan ditandatangani oleh PARA PIHAK dalam rangkap 2 (dua) asli, masing-masing bermeterai cukup dan mempunyai kekuatan hukum yang sama.`]],
});

// --- Isi khusus per jenis -------------------------------------------------------------------

const objek = (d: DataDraf): Potong => atau(d.deskripsi || d.judul, "uraian objek perjanjian");

function konsiderans(jenis: JenisDraf, d: DataDraf): Potong[][] {
  const proyek: Potong[] = d.kodeProyek ? [` untuk proyek ${d.kodeProyek}`] : [" untuk ", kosong("proyek atau unit kerja")];
  switch (jenis) {
    case "Pengadaan Barang":
      return [
        ["bahwa PIHAK PERTAMA membutuhkan barang berupa ", objek(d), ...proyek, ";"],
        ["bahwa PIHAK KEDUA menyatakan bersedia dan mampu menyediakan barang tersebut;"],
        ["bahwa penunjukan PIHAK KEDUA didasarkan pada ", kosong("dasar penunjukan, mis. hasil proses pengadaan dan nomornya"), ";"],
      ];
    case "Pengadaan Jasa":
      return [
        ["bahwa PIHAK PERTAMA membutuhkan jasa berupa ", objek(d), ...proyek, ";"],
        ["bahwa PIHAK KEDUA menyatakan bersedia dan mampu melaksanakan pekerjaan tersebut;"],
        ["bahwa penunjukan PIHAK KEDUA didasarkan pada ", kosong("dasar penunjukan, mis. hasil proses pengadaan dan nomornya"), ";"],
      ];
    case "Sewa":
      return [
        ["bahwa PIHAK PERTAMA bermaksud menyewa ", objek(d), ...proyek, ";"],
        ["bahwa PIHAK KEDUA menyatakan sebagai pemilik atau pihak yang berhak menyewakan objek sewa tersebut;"],
      ];
    case "Kerja Sama":
      return [
        ["bahwa PARA PIHAK bermaksud bekerja sama dalam ", objek(d), ";"],
        ["bahwa kerja sama tersebut dilaksanakan dengan prinsip saling menguntungkan dan sesuai kemampuan masing-masing PIHAK;"],
      ];
    case "MoU":
      return [
        ["bahwa PARA PIHAK bermaksud menjajaki kerja sama dalam ", objek(d), ";"],
        ["bahwa untuk itu PARA PIHAK perlu menuangkan kesepahaman awal dalam Nota Kesepahaman ini;"],
      ];
    case "NDA":
      return [
        ["bahwa PARA PIHAK akan saling memberikan informasi dalam rangka ", objek(d), ";"],
        ["bahwa PARA PIHAK sepakat untuk melindungi kerahasiaan informasi tersebut;"],
      ];
    case "Addendum":
      return [
        ["bahwa PARA PIHAK telah menandatangani ", atau(d.induk?.judul, "judul perjanjian induk"), " Nomor ", atau(d.induk?.nomor, "nomor perjanjian induk"), " tanggal ", ...potongTanggal(d.induk?.tanggal, "tanggal perjanjian induk"), " (selanjutnya disebut \"Perjanjian\");"],
        ["bahwa PARA PIHAK sepakat untuk melakukan perubahan atas Perjanjian sebagaimana diatur dalam Addendum ini;"],
      ];
  }
}

function pasalAddendum(d: DataDraf): Pasal[] {
  const ayat: Potong[][] = [];
  const ubah = d.jenisPerubahan ?? [];
  if (ubah.includes("Perpanjangan Waktu"))
    ayat.push(["Ketentuan jangka waktu dalam Pasal ", kosong("nomor pasal"), " Perjanjian diubah sehingga Perjanjian berlaku sampai dengan tanggal ", ...potongTanggal(d.tanggalBerakhir, "tanggal berakhir baru"), "."]);
  if (ubah.includes("Perubahan Nilai")) {
    const arah = d.nilai != null && d.nilai < 0 ? "berkurang" : "bertambah";
    ayat.push([`Nilai Perjanjian ${arah} sebesar `, ...potongNilai(d.nilai, d.mataUang), ", sehingga nilai Perjanjian setelah perubahan menjadi ", kosong("nilai total setelah perubahan, dalam angka dan huruf"), "."]);
  }
  if (ubah.includes("Perubahan Lingkup")) ayat.push(["Ruang lingkup dalam Pasal ", kosong("nomor pasal"), " Perjanjian diubah menjadi: ", kosong("rumusan ruang lingkup baru"), "."]);
  if (ubah.includes("Perubahan Ketentuan") || ubah.includes("Lainnya")) ayat.push(["Ketentuan Pasal ", kosong("nomor pasal"), " Perjanjian diubah menjadi: ", kosong("rumusan ketentuan baru"), "."]);
  if (!ayat.length) ayat.push([kosong("rumusan perubahan")]);
  return [
    { judul: "Perubahan", ayat },
    {
      judul: "Ketentuan Lain",
      ayat: [
        ["Addendum ini berlaku sejak tanggal ", ...(d.tanggalMulai ? potongTanggal(d.tanggalMulai, "") : ["ditandatangani oleh PARA PIHAK"]), "."],
        ["Ketentuan Perjanjian yang tidak diubah dalam Addendum ini tetap berlaku dan mengikat PARA PIHAK."],
        ["Addendum ini merupakan bagian yang tidak terpisahkan dari Perjanjian."],
      ],
    },
    pasalPenutup("Addendum"),
  ];
}

function daftarPasal(jenis: JenisDraf, d: DataDraf): Pasal[] {
  const s = PERAN[jenis].sebutan;
  switch (jenis) {
    case "Pengadaan Barang":
      return [
        { judul: "Ruang Lingkup", ayat: [["PIHAK KEDUA menyediakan dan menyerahkan kepada PIHAK PERTAMA barang berupa ", objek(d), " dengan jumlah dan spesifikasi sebagaimana tercantum dalam Lampiran ", kosong("nomor lampiran spesifikasi"), "."]] },
        pasalNilai(d, s),
        pasalJangka(d, s),
        pasalBayar,
        {
          judul: "Penyerahan dan Pemeriksaan Barang",
          ayat: [
            ["PIHAK KEDUA menyerahkan barang di ", kosong("lokasi penyerahan"), " paling lambat ", kosong("waktu penyerahan"), "."],
            ["Serah terima barang dituangkan dalam berita acara serah terima yang ditandatangani PARA PIHAK."],
            ["Ketentuan pemeriksaan dan penggantian barang yang tidak sesuai spesifikasi: ", kosong("ketentuan pemeriksaan dan penggantian"), "."],
          ],
        },
        pasalJaminan,
        pasalDenda("PIHAK KEDUA"),
        pasalKahar,
        pasalAkhir(s),
        pasalRahasia(s),
        pasalSengketa(s),
        pasalHukum(s),
        pasalLain(s),
        pasalPenutup(s),
      ];
    case "Pengadaan Jasa":
      return [
        { judul: "Ruang Lingkup Pekerjaan", ayat: [["PIHAK KEDUA melaksanakan pekerjaan berupa ", objek(d), " dengan rincian sebagaimana tercantum dalam Lampiran ", kosong("nomor lampiran lingkup pekerjaan"), "."]] },
        pasalNilai(d, s),
        pasalJangka(d, s, "Jangka Waktu Pelaksanaan"),
        pasalBayar,
        {
          judul: "Hak dan Kewajiban",
          ayat: [
            ["Hak dan kewajiban PIHAK PERTAMA: ", kosong("hak dan kewajiban PIHAK PERTAMA"), "."],
            ["Hak dan kewajiban PIHAK KEDUA: ", kosong("hak dan kewajiban PIHAK KEDUA"), "."],
          ],
        },
        { judul: "Serah Terima Pekerjaan", ayat: [["Penyelesaian pekerjaan dituangkan dalam berita acara serah terima yang ditandatangani PARA PIHAK setelah ", kosong("syarat serah terima"), "."]] },
        pasalJaminan,
        pasalDenda("PIHAK KEDUA"),
        pasalKahar,
        pasalAkhir(s),
        pasalRahasia(s),
        pasalSengketa(s),
        pasalHukum(s),
        pasalLain(s),
        pasalPenutup(s),
      ];
    case "Sewa":
      return [
        { judul: "Objek Sewa", ayat: [["PIHAK KEDUA menyewakan kepada PIHAK PERTAMA ", objek(d), " dengan rincian dan kondisi sebagaimana tercantum dalam Lampiran ", kosong("nomor lampiran objek sewa"), "."]] },
        pasalNilai(d, s, "Harga Sewa"),
        pasalJangka(d, s, "Jangka Waktu Sewa"),
        pasalBayar,
        {
          judul: "Penyerahan dan Pengembalian Objek Sewa",
          ayat: [
            ["Objek sewa diserahkan di ", kosong("lokasi penyerahan"), " dan dituangkan dalam berita acara serah terima."],
            ["Pada akhir masa sewa, objek sewa dikembalikan di ", kosong("lokasi pengembalian"), " dalam kondisi ", kosong("kondisi pengembalian"), "."],
          ],
        },
        { judul: "Pemeliharaan dan Risiko", ayat: [["Pembagian tanggung jawab pemeliharaan, asuransi, dan risiko kerusakan atau kehilangan objek sewa: ", kosong("pembagian tanggung jawab"), "."]] },
        pasalDenda("PIHAK yang lalai"),
        pasalKahar,
        pasalAkhir(s),
        pasalSengketa(s),
        pasalHukum(s),
        pasalLain(s),
        pasalPenutup(s),
      ];
    case "Kerja Sama":
      return [
        { judul: "Maksud dan Tujuan", ayat: [["Perjanjian ini bertujuan untuk ", kosong("tujuan kerja sama"), "."]] },
        { judul: "Ruang Lingkup Kerja Sama", ayat: [["Ruang lingkup kerja sama meliputi ", objek(d), ", dengan rincian ", kosong("rincian ruang lingkup"), "."]] },
        {
          judul: "Hak dan Kewajiban",
          ayat: [
            ["Hak dan kewajiban PIHAK PERTAMA: ", kosong("hak dan kewajiban PIHAK PERTAMA"), "."],
            ["Hak dan kewajiban PIHAK KEDUA: ", kosong("hak dan kewajiban PIHAK KEDUA"), "."],
          ],
        },
        { judul: "Nilai dan Pembiayaan", ayat: [["Nilai kerja sama adalah sebesar ", ...potongNilai(d.nilai, d.mataUang), "."], ["Pembiayaan dan pembagian hasil kerja sama: ", kosong("skema pembiayaan dan pembagian hasil"), "."]] },
        pasalJangka(d, s),
        pasalRahasia(s),
        pasalKahar,
        pasalAkhir(s),
        pasalSengketa(s),
        pasalHukum(s),
        pasalLain(s),
        pasalPenutup(s),
      ];
    case "MoU":
      return [
        { judul: "Maksud dan Tujuan", ayat: [["Nota Kesepahaman ini dimaksudkan sebagai landasan awal bagi PARA PIHAK untuk ", kosong("tujuan kesepahaman"), "."]] },
        { judul: "Ruang Lingkup", ayat: [["Ruang lingkup Nota Kesepahaman ini meliputi ", objek(d), "."]] },
        { judul: "Pelaksanaan", ayat: [["Pelaksanaan kerja sama atas ruang lingkup tersebut akan diatur lebih lanjut dalam perjanjian tersendiri yang disepakati PARA PIHAK."]] },
        pasalJangka(d, s),
        { judul: "Biaya", ayat: [["Pengaturan biaya yang timbul dari pelaksanaan Nota Kesepahaman ini: ", kosong("pengaturan biaya, mis. ditanggung masing-masing PIHAK"), "."]] },
        { judul: "Sifat Nota Kesepahaman", ayat: [[kosong("sifat mengikat Nota Kesepahaman ini, ditetapkan oleh Legal")]] },
        pasalRahasia(s),
        pasalAkhir(s),
        pasalSengketa(s),
        pasalHukum(s),
        pasalPenutup(s),
      ];
    case "NDA":
      return [
        { judul: "Informasi Rahasia", ayat: [["Informasi Rahasia adalah setiap data dan informasi, baik tertulis maupun lisan, yang diberikan oleh satu PIHAK kepada PIHAK lainnya dan dinyatakan atau patut diduga bersifat rahasia, termasuk ", kosong("contoh jenis informasi"), "."]] },
        {
          judul: "Kewajiban Menjaga Kerahasiaan",
          ayat: [
            ["PIHAK penerima hanya menggunakan Informasi Rahasia untuk keperluan ", objek(d), "."],
            ["PIHAK penerima tidak mengungkapkan Informasi Rahasia kepada pihak ketiga tanpa persetujuan tertulis PIHAK pemberi, dan membatasi aksesnya hanya kepada personel yang memerlukannya."],
          ],
        },
        {
          judul: "Pengecualian",
          ayat: [["Kewajiban kerahasiaan tidak berlaku atas informasi yang telah menjadi milik umum bukan karena pelanggaran Perjanjian ini, telah diketahui secara sah sebelum diberikan, atau wajib diungkapkan berdasarkan peraturan perundang-undangan atau perintah instansi yang berwenang."]],
        },
        {
          judul: "Jangka Waktu",
          ayat: [potongMasa(d, s), ["Kewajiban kerahasiaan tetap berlaku selama ", kosong("lama kewajiban setelah perjanjian berakhir"), " setelah Perjanjian ini berakhir."]],
        },
        { judul: "Pengembalian Informasi", ayat: [["Atas permintaan PIHAK pemberi atau pada saat Perjanjian berakhir, PIHAK penerima mengembalikan atau memusnahkan Informasi Rahasia beserta salinannya."]] },
        { judul: "Ganti Rugi", ayat: [["Akibat pelanggaran kewajiban kerahasiaan: ", kosong("akibat dan ganti rugi atas pelanggaran"), "."]] },
        pasalSengketa(s),
        pasalHukum(s),
        pasalPenutup(s),
      ];
    case "Addendum":
      return pasalAddendum(d);
  }
}

/** Rakit seluruh isi draf sebagai blok-blok. Murni: tanggal pembuatan diambil dari `d.dibuatPada`. */
export function susunDraf(jenis: JenisDraf, d: DataDraf): Blok[] {
  const peran = PERAN[jenis];
  const s = peran.sebutan;
  const blok: Blok[] = [];
  // Tanggal dibuat dalam WIB, bukan UTC (pukul 00.00-06.59 WIB masih tanggal kemarin di UTC).
  const dibuat = d.dibuatPada ? keYmdWib(d.dibuatPada) : keYmdWib(new Date().toISOString());

  blok.push({ tipe: "catatan", isi: [tebal(CATATAN_DRAF), `. Disusun otomatis dari data pengajuan ${bersih(d.nomorPengajuan) || "-"} pada ${dibuat}. Bagian bertanda `, kosong("..."), " wajib dilengkapi atau dihapus."] });

  if (jenis === "Addendum") {
    const ke = d.urutanAddendum ? `ADDENDUM KE-${d.urutanAddendum}` : null;
    blok.push({ tipe: "judul", isi: ke ? [ke] : ["ADDENDUM KE-", kosong("urutan")] });
    blok.push({ tipe: "tengah", isi: ["ATAS ", atau(d.induk?.judul?.toUpperCase(), "judul perjanjian induk")] });
    blok.push({ tipe: "tengah", isi: ["NOMOR ", atau(d.induk?.nomor, "nomor perjanjian induk")] });
  } else {
    blok.push({ tipe: "judul", isi: [peran.judul] });
    if (bersih(d.judul)) blok.push({ tipe: "tengah", isi: [`TENTANG ${bersih(d.judul).toUpperCase()}`] });
  }
  blok.push({ tipe: "tengah", isi: [`ANTARA ${NAMA_WKI.toUpperCase()} DAN `, atau(d.mitra?.toUpperCase(), "nama mitra")] });
  blok.push({ tipe: "tengah", isi: ["Nomor: ", atau(d.nomorKontrak, `nomor ${s.toLowerCase()}`)] });

  const ttd: Potong[] = d.tanggalTtd ? ruangTanggal(d.tanggalTtd) : [kosong("hari"), ", tanggal ", kosong("tanggal penandatanganan")];
  blok.push({ tipe: "paragraf", isi: ["Pada hari ini, ", ...ttd, ", bertempat di ", kosong("kota"), ", yang bertanda tangan di bawah ini:"] });

  const w = d.wki ?? {};
  const fungsi = (f?: string) => (f ? ` atau "${f}"` : "");
  blok.push({
    tipe: "butir",
    tanda: "1.",
    isi: [
      tebal(NAMA_WKI),
      ", suatu perseroan terbatas yang didirikan berdasarkan hukum Negara Republik Indonesia, berkedudukan di ",
      atau(w.alamat, "alamat kantor WKI"),
      ", dalam hal ini diwakili oleh ",
      atau(w.wakil, "nama pejabat WKI"),
      " selaku ",
      atau(w.jabatan, "jabatan"),
      ", yang bertindak berdasarkan ",
      atau(w.dasar, "dasar kewenangan, mis. anggaran dasar atau surat kuasa"),
      `, untuk dan atas nama ${NAMA_WKI}, selanjutnya disebut "PIHAK PERTAMA"${fungsi(peran.pertama)};`,
    ],
  });
  blok.push({
    tipe: "butir",
    tanda: "2.",
    isi: [
      d.mitra ? tebal(bersih(d.mitra)) : kosong("nama mitra"),
      ", berkedudukan di ",
      atau(d.alamatMitra, "alamat mitra"),
      ", NPWP ",
      atau(d.npwpMitra, "NPWP mitra"),
      ", dalam hal ini diwakili oleh ",
      atau(d.penandatanganMitra, "nama penandatangan mitra"),
      " selaku ",
      atau(d.jabatanMitra, "jabatan penandatangan mitra"),
      ", yang bertindak berdasarkan ",
      atau(d.dasarKewenangan, "dasar kewenangan penandatangan mitra"),
      `, selanjutnya disebut "PIHAK KEDUA"${fungsi(peran.kedua)}.`,
    ],
  });
  blok.push({ tipe: "paragraf", isi: ['PIHAK PERTAMA dan PIHAK KEDUA secara bersama-sama disebut "PARA PIHAK" dan masing-masing disebut "PIHAK". PARA PIHAK terlebih dahulu menerangkan hal-hal sebagai berikut:'] });
  konsiderans(jenis, d).forEach((isi, i) => blok.push({ tipe: "butir", tanda: `${String.fromCharCode(97 + i)}.`, isi }));
  blok.push({ tipe: "paragraf", isi: [`Berdasarkan hal-hal tersebut, PARA PIHAK sepakat untuk mengikatkan diri dalam ${s} ini dengan ketentuan sebagai berikut:`] });

  daftarPasal(jenis, d).forEach((p, i) => {
    blok.push({ tipe: "pasal", nomor: i + 1, judul: p.judul });
    if (p.ayat.length === 1) blok.push({ tipe: "paragraf", isi: p.ayat[0]! });
    else p.ayat.forEach((isi, j) => blok.push({ tipe: "butir", tanda: `(${j + 1})`, isi }));
  });

  blok.push({
    tipe: "ttd",
    kiri: [[tebal("PIHAK PERTAMA")], [tebal(NAMA_WKI.toUpperCase())], [""], [""], [""], [atau(w.wakil, "nama pejabat WKI")], [atau(w.jabatan, "jabatan")]],
    kanan: [[tebal("PIHAK KEDUA")], d.mitra ? [tebal(bersih(d.mitra).toUpperCase())] : [kosong("nama mitra")], ["Meterai"], [""], [""], [atau(d.penandatanganMitra, "nama penandatangan mitra")], [atau(d.jabatanMitra, "jabatan penandatangan mitra")]],
  });
  return blok;
}

/** "Jumat, tanggal dua bulan Oktober tahun dua ribu dua puluh enam (2 Oktober 2026)". */
function ruangTanggal(ymd: Ymd): Potong[] {
  try {
    return [`${namaHari(ymd)}, tanggal ${terbilangTanggal(ymd)} (${tanggalPanjang(ymd)})`];
  } catch {
    return [kosong("hari"), ", tanggal ", kosong("tanggal penandatanganan")];
  }
}

// --- Render ke .docx --------------------------------------------------------------------

const FONT = "Times New Roman";
const UKURAN = 23; // setengah poin: 11,5 pt
const MENJOROK = 567; // 1 cm dalam twip

/** Rakit dan render draf menjadi berkas .docx. Pustaka `docx` dimuat dinamis saat dipanggil. */
export async function buatDrafDocx(jenis: JenisDraf, data: DataDraf): Promise<Blob> {
  const docx = await import("docx");
  const { AlignmentType, Document, Footer, Header, Packer, PageNumber, Paragraph, Tab, Table, TableBorders, TableCell, TableRow, TabStopType, TextRun, WidthType } = docx;

  const run = (p: Potong) => {
    if (typeof p === "string") return new TextRun({ text: p });
    if ("tebal" in p) return new TextRun({ text: p.tebal, bold: true });
    return new TextRun({ text: `[ISI: ${p.isi}]`, highlight: "yellow", bold: true });
  };

  const blok = susunDraf(jenis, data);
  const isi: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  for (const b of blok) {
    switch (b.tipe) {
      case "catatan":
        isi.push(new Paragraph({ children: b.isi.map(run), spacing: { after: 240 }, border: { left: { style: "single", size: 18, color: "B45309", space: 8 } } }));
        break;
      case "judul":
        isi.push(new Paragraph({ children: b.isi.map((p) => new TextRun({ text: teksPotong(p), bold: true, size: 28, highlight: typeof p !== "string" && "isi" in p ? "yellow" : undefined })), alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 } }));
        break;
      case "tengah":
        isi.push(new Paragraph({ children: b.isi.map((p) => (typeof p === "string" ? new TextRun({ text: p, bold: true }) : run(p))), alignment: AlignmentType.CENTER, spacing: { after: 60 } }));
        break;
      case "paragraf":
        isi.push(new Paragraph({ children: b.isi.map(run), alignment: AlignmentType.JUSTIFIED, spacing: { before: 120, after: 120 } }));
        break;
      case "butir":
        isi.push(
          new Paragraph({
            children: [new TextRun({ text: b.tanda }), new TextRun({ children: [new Tab()] }), ...b.isi.map(run)],
            alignment: AlignmentType.JUSTIFIED,
            indent: { left: MENJOROK, hanging: MENJOROK },
            tabStops: [{ type: TabStopType.LEFT, position: MENJOROK }],
            spacing: { after: 80 },
          }),
        );
        break;
      case "pasal":
        isi.push(new Paragraph({ children: [new TextRun({ text: `Pasal ${b.nomor}`, bold: true })], alignment: AlignmentType.CENTER, spacing: { before: 280 }, keepNext: true }));
        isi.push(new Paragraph({ children: [new TextRun({ text: b.judul.toUpperCase(), bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 120 }, keepNext: true }));
        break;
      case "ttd": {
        const kolom = (baris: Potong[][]) =>
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: TableBorders.NONE,
            children: baris.map((r) => new Paragraph({ children: r.map(run), alignment: AlignmentType.CENTER, spacing: { after: 40 } })),
          });
        isi.push(new Paragraph({ children: [], spacing: { before: 360 } }));
        isi.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: TableBorders.NONE, rows: [new TableRow({ children: [kolom(b.kiri), kolom(b.kanan)], cantSplit: true })] }));
        break;
      }
    }
  }

  const doc = new Document({
    creator: "WiCon",
    title: `${PERAN[jenis].judul} ${bersih(data.judul)}`.trim(),
    description: CATATAN_DRAF,
    styles: { default: { document: { run: { font: FONT, size: UKURAN }, paragraph: { spacing: { line: 276 } } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1418, bottom: 1418, left: 1701, right: 1418 } } },
        headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: CATATAN_DRAF, bold: true, size: 18, highlight: "yellow" })] })] }) },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ size: 18, children: ["Halaman ", PageNumber.CURRENT, " dari ", PageNumber.TOTAL_PAGES] })] })],
          }),
        },
        children: isi,
      },
    ],
  });
  // ArrayBuffer lalu Blob (bukan Packer.toBlob) supaya fungsi yang sama juga jalan di skrip uji Node.
  const buf = await Packer.toArrayBuffer(doc);
  return new Blob([buf], { type: MIME_DOCX });
}
