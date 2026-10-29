// Portofolio kontrak: berapa nilai yang sedang mengikat perusahaan, di divisi mana, jenis apa, dengan mitra siapa,
// kapan nilai itu habis, dan berapa yang masih di jalur Legal.
//
// Aturan hitung:
//   - Dipisah per mata uang, tanpa konversi kurs. Rp, USD, EUR, dan SGD tidak pernah dijumlahkan.
//   - Nilai efektif = nilai induk + selisih addendum aktif (ringkasAddendum). Addendum bukan kontrak tersendiri.
//   - Komitmen aktif = status Aktif yang masa berlaku efektifnya belum lewat (atau tanpa tanggal berakhir).
//     Yang sudah lewat tetapi belum ditandai Berakhir dihitung terpisah, supaya angka komitmen tidak membengkak.
//   - Kontrak tanpa nilai (MoU, atau nilai belum diisi) dihitung jumlahnya, tetapi tidak ikut sebagai nilai nol.
import { adalahAddendum, ringkasAddendum } from "./addendum";
import { labelBulan, ymdWib } from "./laporan";
import { DIVISI_PENGAJU, JENIS_KONTRAK, MATA_UANG, STATUS_PROSES, type Kontrak, type MataUang, type Status, type Ymd } from "./types";

// --- Tipe ---------------------------------------------------------------------------

export interface NilaiMataUang {
  mataUang: MataUang;
  total: number;
  /** Kontrak yang punya nilai dalam mata uang ini. */
  jumlah: number;
}

export interface BarisAgregat {
  kunci: string;
  label: string;
  jumlahKontrak: number;
  /** Kontrak tanpa nilai (MoU atau belum diisi): ikut dihitung jumlahnya, tidak nilainya. */
  tanpaNilai: number;
  /** Hanya mata uang yang ada isinya, urut sesuai MATA_UANG. */
  nilai: NilaiMataUang[];
  /** ID kontrak induk di baris ini, untuk membuka daftar terfilter. */
  ids: number[];
}

export interface BarisMitra extends BarisAgregat {
  mitraId: number | null;
}

export interface BulanBerakhir {
  kunci: string;
  label: string;
  jumlahKontrak: number;
  nilai: NilaiMataUang[];
  ids: number[];
}

export interface TahapPipeline {
  status: Status;
  jumlahKontrak: number;
  tanpaNilai: number;
  nilai: NilaiMataUang[];
}

export interface Portofolio {
  hariIni: Ymd;
  /** Komitmen aktif total per mata uang. */
  komitmen: BarisAgregat;
  /** Aktif tetapi masa berlaku efektifnya sudah lewat, belum ditutup. */
  lewatMasa: BarisAgregat;
  perDivisi: BarisAgregat[];
  perJenis: BarisAgregat[];
  /** 10 mitra teratas untuk tiap mata uang yang ada. */
  mitraTeratas: Partial<Record<MataUang, BarisMitra[]>>;
  kalenderBerakhir: BulanBerakhir[];
  pipeline: TahapPipeline[];
  /** Total pipeline (Diajukan sampai Proses Tanda Tangan) per mata uang. */
  pipelineTotal: BarisAgregat;
  /** Selisih nilai dari addendum yang masih diproses, per mata uang. */
  addendumBerjalan: BarisAgregat;
  /** Mata uang yang muncul di mana pun di portofolio, urut sesuai MATA_UANG. */
  mataUangAda: MataUang[];
}

export interface KontrakEfektif {
  kontrak: Kontrak;
  nilaiEfektif: number | null;
  berakhirEfektif: Ymd | null;
}

export const JUMLAH_MITRA_TERATAS = 10;
export const BULAN_KALENDER = 12;

// --- Bantu ---------------------------------------------------------------------------

class Penjumlah {
  jumlahKontrak = 0;
  tanpaNilai = 0;
  ids: number[] = [];
  private per = new Map<MataUang, { total: number; jumlah: number }>();

  tambah(id: number, nilai: number | null, mataUang: MataUang) {
    this.jumlahKontrak++;
    this.ids.push(id);
    if (nilai == null || !Number.isFinite(nilai)) {
      this.tanpaNilai++;
      return;
    }
    const ada = this.per.get(mataUang) ?? { total: 0, jumlah: 0 };
    ada.total += nilai;
    ada.jumlah++;
    this.per.set(mataUang, ada);
  }

  nilai(): NilaiMataUang[] {
    return MATA_UANG.filter((m) => this.per.has(m)).map((m) => ({ mataUang: m, ...this.per.get(m)! }));
  }

  total(m: MataUang): number {
    return this.per.get(m)?.total ?? 0;
  }

  baris(kunci: string, label: string): BarisAgregat {
    return { kunci, label, jumlahKontrak: this.jumlahKontrak, tanpaNilai: this.tanpaNilai, nilai: this.nilai(), ids: this.ids };
  }
}

/** Urutan baris: nilai IDR terbesar, lalu mata uang lain, lalu jumlah kontrak. */
function bandingBaris(a: BarisAgregat, b: BarisAgregat): number {
  for (const m of MATA_UANG) {
    const selisih = (b.nilai.find((n) => n.mataUang === m)?.total ?? 0) - (a.nilai.find((n) => n.mataUang === m)?.total ?? 0);
    if (selisih !== 0) return selisih;
  }
  return b.jumlahKontrak - a.jumlahKontrak || a.label.localeCompare(b.label, "id");
}

/** Kunci mitra: ID master bila ada, kalau tidak nama yang dinormalkan. */
export function kunciMitraPortofolio(k: Pick<Kontrak, "mitraId" | "mitra">): string {
  if (k.mitraId != null) return `id:${k.mitraId}`;
  const nama = k.mitra.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,]/g, "");
  return nama ? `nama:${nama}` : "nama:";
}

/** Nilai dan masa berlaku efektif kontrak induk, memperhitungkan addendum aktif. */
export function kontrakEfektif(k: Kontrak, semua: Kontrak[]): KontrakEfektif {
  const r = ringkasAddendum(k, semua);
  return { kontrak: k, nilaiEfektif: r.nilaiEfektif, berakhirEfektif: r.berakhirEfektif };
}

/** Kontrak aktif yang masa berlaku efektifnya belum lewat hari ini. */
export function masihBerlaku(e: KontrakEfektif, hariIni: Ymd): boolean {
  return e.kontrak.status === "Aktif" && (!e.berakhirEfektif || e.berakhirEfektif >= hariIni);
}

/** Total per mata uang dalam satu kalimat: "Rp 1,2 M · USD 50 rb". Kosong bila tidak ada nilai. */
export function teksNilaiMataUang(nilai: readonly NilaiMataUang[], format: (n: number, m: MataUang) => string): string {
  return nilai.map((n) => format(n.total, n.mataUang)).join(" · ");
}

// --- Susun ------------------------------------------------------------------------------

export function susunPortofolio(semua: Kontrak[], sekarang: number): Portofolio {
  const hariIni = ymdWib(sekarang);
  const induk = semua.filter((k) => !adalahAddendum(k));
  const efektif = induk.map((k) => kontrakEfektif(k, semua));
  const aktif = efektif.filter((e) => masihBerlaku(e, hariIni));
  const lewat = efektif.filter((e) => e.kontrak.status === "Aktif" && !masihBerlaku(e, hariIni));

  const komitmen = new Penjumlah();
  const perDivisi = new Map<string, Penjumlah>();
  const perJenis = new Map<string, Penjumlah>();
  const perMitra = new Map<string, { p: Penjumlah; nama: string; mitraId: number | null; diubah: string }>();
  const ambil = (m: Map<string, Penjumlah>, kunci: string) => {
    let p = m.get(kunci);
    if (!p) m.set(kunci, (p = new Penjumlah()));
    return p;
  };

  for (const e of aktif) {
    const k = e.kontrak;
    komitmen.tambah(k.id, e.nilaiEfektif, k.mataUang);
    ambil(perDivisi, k.divisi).tambah(k.id, e.nilaiEfektif, k.mataUang);
    ambil(perJenis, k.jenis).tambah(k.id, e.nilaiEfektif, k.mataUang);
    const kunci = kunciMitraPortofolio(k);
    if (kunci === "nama:") continue;
    let m = perMitra.get(kunci);
    if (!m) perMitra.set(kunci, (m = { p: new Penjumlah(), nama: k.mitra.trim(), mitraId: k.mitraId, diubah: k.diubah }));
    // Nama tampilan diambil dari kontrak terbaru, karena nama mitra bisa berubah.
    if (k.diubah > m.diubah && k.mitra.trim()) {
      m.nama = k.mitra.trim();
      m.diubah = k.diubah;
    }
    m.p.tambah(k.id, e.nilaiEfektif, k.mataUang);
  }

  const lewatMasa = new Penjumlah();
  for (const e of lewat) lewatMasa.tambah(e.kontrak.id, e.nilaiEfektif, e.kontrak.mataUang);

  const urutanDivisi = [...DIVISI_PENGAJU, ...[...perDivisi.keys()].filter((d) => !(DIVISI_PENGAJU as readonly string[]).includes(d))];
  const barisDivisi = urutanDivisi.filter((d) => perDivisi.has(d)).map((d) => perDivisi.get(d)!.baris(d, d)).sort(bandingBaris);
  const urutanJenis = [...JENIS_KONTRAK, ...[...perJenis.keys()].filter((j) => !(JENIS_KONTRAK as readonly string[]).includes(j))];
  const barisJenis = urutanJenis.filter((j) => perJenis.has(j)).map((j) => perJenis.get(j)!.baris(j, j)).sort(bandingBaris);

  const mitraTeratas: Partial<Record<MataUang, BarisMitra[]>> = {};
  for (const mu of MATA_UANG) {
    const daftar = [...perMitra.entries()]
      .filter(([, m]) => m.p.total(mu) > 0)
      .map<BarisMitra>(([kunci, m]) => ({ ...m.p.baris(kunci, m.nama), mitraId: m.mitraId }))
      .sort((a, b) => (b.nilai.find((n) => n.mataUang === mu)?.total ?? 0) - (a.nilai.find((n) => n.mataUang === mu)?.total ?? 0) || a.label.localeCompare(b.label, "id"))
      .slice(0, JUMLAH_MITRA_TERATAS);
    if (daftar.length) mitraTeratas[mu] = daftar;
  }

  // Kalender: bulan ini sampai 11 bulan berikutnya, hanya yang belum lewat.
  const [t0, b0] = hariIni.split("-").map(Number) as [number, number];
  const kunciKalender = Array.from({ length: BULAN_KALENDER }, (_, i) => {
    const d = new Date(Date.UTC(t0, b0 - 1 + i, 1));
    return d.toISOString().slice(0, 7);
  });
  const kalender = new Map(kunciKalender.map((k) => [k, new Penjumlah()]));
  for (const e of aktif) {
    if (!e.berakhirEfektif) continue;
    kalender.get(e.berakhirEfektif.slice(0, 7))?.tambah(e.kontrak.id, e.nilaiEfektif, e.kontrak.mataUang);
  }
  const kalenderBerakhir = kunciKalender.map<BulanBerakhir>((k) => {
    const p = kalender.get(k)!;
    return { kunci: k, label: labelBulan(k), jumlahKontrak: p.jumlahKontrak, nilai: p.nilai(), ids: p.ids };
  });

  // Pipeline: kontrak induk yang masih di jalur Legal. Nilai yang diajukan, belum ada addendum yang berlaku.
  const pipelineTotal = new Penjumlah();
  const perTahap = new Map(STATUS_PROSES.map((s) => [s, new Penjumlah()]));
  for (const k of induk) {
    const p = perTahap.get(k.status);
    if (!p) continue;
    p.tambah(k.id, k.nilai, k.mataUang);
    pipelineTotal.tambah(k.id, k.nilai, k.mataUang);
  }
  const pipeline = STATUS_PROSES.map<TahapPipeline>((s) => {
    const p = perTahap.get(s)!;
    return { status: s, jumlahKontrak: p.jumlahKontrak, tanpaNilai: p.tanpaNilai, nilai: p.nilai() };
  });

  const addendumBerjalan = new Penjumlah();
  for (const a of semua) {
    if (adalahAddendum(a) && STATUS_PROSES.includes(a.status)) addendumBerjalan.tambah(a.id, a.nilai, a.mataUang);
  }

  const barisKomitmen = komitmen.baris("komitmen", "Komitmen aktif");
  const barisLewat = lewatMasa.baris("lewat", "Lewat masa berlaku");
  const barisPipeline = pipelineTotal.baris("pipeline", "Pipeline");
  const barisAddendum = addendumBerjalan.baris("addendum", "Addendum diproses");
  const ada = new Set<MataUang>([...barisKomitmen.nilai, ...barisLewat.nilai, ...barisPipeline.nilai, ...barisAddendum.nilai].map((n) => n.mataUang));

  return {
    hariIni,
    komitmen: barisKomitmen,
    lewatMasa: barisLewat,
    perDivisi: barisDivisi,
    perJenis: barisJenis,
    mitraTeratas,
    kalenderBerakhir,
    pipeline,
    pipelineTotal: barisPipeline,
    addendumBerjalan: barisAddendum,
    mataUangAda: MATA_UANG.filter((m) => ada.has(m)),
  };
}
