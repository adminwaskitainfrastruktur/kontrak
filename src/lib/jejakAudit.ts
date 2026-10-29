// Jejak audit (U31): "diubah dari berapa ke berapa, oleh siapa, kapan".
//
// Sumbernya dua list: Aktivitas Kontrak (baris Status dan baris ber-Detail lama-ke-baru) dan Log Admin
// (perubahan pengaturan, pengguna, rekonsiliasi). Pelaku diambil dari createdBy SharePoint, bukan dari teks
// yang ditulis aplikasi, supaya tidak bisa diisi sembarang nama. Log aplikasi tetap bukan bukti tahan-ubah;
// perubahan langsung di SharePoint terekam di riwayat versi list.
//
// Modul ini murni (tanpa jaringan, tanpa config) sehingga teruji lewat scripts/uji-detail.ts.
import type { DetailPerubahan, Pengguna, Sesi, Ymd } from "./types";

/** Halaman Jejak Audit untuk Admin dan Pemantau (hanya melihat), di Ruang Admin. */
export function bolehLihatJejak(sesi: Pick<Sesi, "peran">): boolean {
  return sesi.peran === "Admin" || sesi.peran === "Pemantau";
}

// --- Format Detail berversi ------------------------------------------------------------------
//
// Bentuk lama kolom Detail: [{kolom, dari, ke}]. Bentuk berversi: {v: 1, ubah: [{kolom, dari, ke}]}.
// Pembaca di sini menerima keduanya, jadi penulis bisa beralih ke bentuk berversi kapan saja.

export const VERSI_DETAIL = 1;

export interface DetailBerversi {
  v: number;
  ubah: DetailPerubahan[];
}

const teks = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function rapikanBaris(x: unknown): DetailPerubahan | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const kolom = teks(o.kolom).trim();
  if (!kolom) return null;
  return { kolom, dari: ringkasNilai(o.dari), ke: ringkasNilai(o.ke) };
}

/** Isi kolom Detail (teks JSON atau nilai yang sudah diurai) -> daftar perubahan. Tidak pernah melempar. */
export function uraiDetail(v: unknown): DetailPerubahan[] {
  let j: unknown = v;
  if (typeof v === "string") {
    if (!v.trim()) return [];
    try {
      j = JSON.parse(v);
    } catch {
      return [];
    }
  }
  const daftar = Array.isArray(j) ? j : j && typeof j === "object" && Array.isArray((j as DetailBerversi).ubah) ? (j as DetailBerversi).ubah : [];
  return daftar.map(rapikanBaris).filter((d): d is DetailPerubahan => d != null);
}

/** Daftar perubahan -> teks JSON berversi untuk disimpan. */
export function bungkusDetail(ubah: readonly DetailPerubahan[]): string {
  return JSON.stringify({ v: VERSI_DETAIL, ubah: [...ubah] } satisfies DetailBerversi);
}

const MAKS_NILAI = 200;

/** Nilai apa pun menjadi teks pendek yang terbaca manusia (larik digabung koma, objek ringkas). */
export function ringkasNilai(v: unknown): string {
  let t: string;
  if (v == null || v === "") t = "";
  else if (typeof v === "boolean") t = v ? "Ya" : "Tidak";
  else if (Array.isArray(v)) t = v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  else if (typeof v === "object") t = JSON.stringify(v);
  else t = String(v);
  t = t.trim();
  return t.length > MAKS_NILAI ? `${t.slice(0, MAKS_NILAI - 1)}…` : t;
}

/**
 * Isi kolom DetailLog di Log Admin -> daftar perubahan. Menerima {v, ubah}, {dari, ke} (perubahan satu kunci,
 * dicatat atas nama `sasaran`), larik lama, atau teks bebas.
 */
export function uraiDetailLog(isi: string, sasaran: string): DetailPerubahan[] {
  const t = isi.trim();
  if (!t) return [];
  let j: unknown;
  try {
    j = JSON.parse(t);
  } catch {
    return [{ kolom: "catatan", dari: "", ke: ringkasNilai(t) }];
  }
  if (Array.isArray(j) || (j && typeof j === "object" && Array.isArray((j as DetailBerversi).ubah))) return uraiDetail(j);
  if (j && typeof j === "object" && ("dari" in j || "ke" in j)) {
    const o = j as { dari?: unknown; ke?: unknown };
    return [{ kolom: sasaran || "nilai", dari: ringkasNilai(o.dari), ke: ringkasNilai(o.ke) }];
  }
  return [{ kolom: "catatan", dari: "", ke: ringkasNilai(j) }];
}

// --- Entri jejak -----------------------------------------------------------------------------

export type SumberJejak = "Kontrak" | "Admin";

export interface EntriJejak {
  /** Unik lintas sumber, mis. "akt-120" atau "log-7". */
  id: string;
  sumber: SumberJejak;
  /** ISO UTC. */
  waktu: string;
  pelaku: string;
  pelakuEmail: string;
  /** Jenis aksi: "Status", "Perubahan", "Penugasan", "Ubah pengaturan", dst. */
  aksi: string;
  /** Yang diubah: nomor pengajuan kontrak, email pengguna, atau kunci pengaturan. */
  sasaran: string;
  kontrakId: number | null;
  /** Judul kontrak untuk tampilan (kosong untuk Log Admin). */
  judul: string;
  /** Nomor kontrak resmi bila sudah ada, supaya auditor bisa mencari dengan nomor itu. */
  nomorKontrak: string;
  pesan: string;
  rincian: DetailPerubahan[];
}

/** Baris mentah list Aktivitas yang dibutuhkan jejak. */
export interface AktivitasMentah {
  id: number;
  kontrakId: number;
  jenis: string;
  pesan: string;
  statusDari: string;
  statusKe: string;
  olehNama: string;
  olehEmail: string;
  /** Pembuat menurut SharePoint (createdBy); diutamakan atas olehNama. */
  dibuatOleh: string;
  dibuatOlehEmail: string;
  waktu: string;
  detail: unknown;
}

/**
 * Aktivitas -> entri jejak, atau null bila bukan bahan audit (komentar, pengingat, dan baris tanpa rincian).
 * Perubahan status selalu masuk, dengan baris "status" lama-ke-baru di depan.
 */
export function dariAktivitas(a: AktivitasMentah, kontrak?: { nomor: string; judul: string; nomorKontrak?: string } | null): EntriJejak | null {
  const rincian = uraiDetail(a.detail);
  const status = a.jenis === "Status" && !!a.statusKe;
  if (!status && rincian.length === 0) return null;
  return {
    id: `akt-${a.id}`,
    sumber: "Kontrak",
    waktu: a.waktu,
    pelaku: a.dibuatOleh || a.olehNama || "-",
    pelakuEmail: (a.dibuatOlehEmail || a.olehEmail).toLowerCase(),
    aksi: a.jenis || "Perubahan",
    sasaran: kontrak?.nomor || `#${a.kontrakId}`,
    kontrakId: Number.isFinite(a.kontrakId) ? a.kontrakId : null,
    judul: kontrak?.judul ?? "",
    nomorKontrak: kontrak?.nomorKontrak ?? "",
    pesan: a.pesan,
    rincian: status ? [{ kolom: "status", dari: a.statusDari || "-", ke: a.statusKe }, ...rincian] : rincian,
  };
}

/** Baris mentah Log Admin. */
export interface LogAdminMentah {
  id: number;
  aksi: string;
  sasaran: string;
  pelakuTeks: string;
  dibuatOleh: string;
  dibuatOlehEmail: string;
  waktu: string;
  detail: string;
}

/** "Budi <budi@x>" -> { nama, email }. */
function pisahPelaku(t: string): { nama: string; email: string } {
  const m = /^(.*?)\s*<([^>]+)>\s*$/.exec(t.trim());
  return m ? { nama: m[1]!.trim(), email: m[2]!.trim() } : { nama: t.trim(), email: "" };
}

export function dariLogAdmin(l: LogAdminMentah): EntriJejak {
  const teksPelaku = pisahPelaku(l.pelakuTeks);
  return {
    id: `log-${l.id}`,
    sumber: "Admin",
    waktu: l.waktu,
    pelaku: l.dibuatOleh || teksPelaku.nama || "-",
    pelakuEmail: (l.dibuatOlehEmail || teksPelaku.email).toLowerCase(),
    aksi: l.aksi || "Perubahan admin",
    sasaran: l.sasaran,
    kontrakId: null,
    judul: "",
    nomorKontrak: "",
    pesan: "",
    rincian: uraiDetailLog(l.detail, l.sasaran),
  };
}

// --- Periode dan penyaringan -------------------------------------------------------------------

export const PILIHAN_PERIODE = ["7", "30", "90", "tahun", "semua", "kustom"] as const;
export type PilihanPeriode = (typeof PILIHAN_PERIODE)[number];

export const LABEL_PERIODE: Record<PilihanPeriode, string> = { "7": "7 hari", "30": "30 hari", "90": "90 hari", tahun: "Tahun ini", semua: "Sejak awal", kustom: "Pilih tanggal" };

/** Awal "Sejak awal": jauh sebelum aplikasi dipakai, jadi seluruh riwayat ikut. */
export const AWAL_RIWAYAT: Ymd = "2020-01-01";

function tambahHariYmd(ymd: Ymd, n: number): Ymd {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Rentang tanggal (inklusif, zona Jakarta) untuk sebuah pilihan periode. */
export function rentangPeriode(p: PilihanPeriode, hari: Ymd, kustom?: { dari: Ymd | null; sampai: Ymd | null }): { dari: Ymd; sampai: Ymd } {
  switch (p) {
    case "7":
    case "30":
    case "90":
      return { dari: tambahHariYmd(hari, -(Number(p) - 1)), sampai: hari };
    case "tahun":
      return { dari: `${hari.slice(0, 4)}-01-01`, sampai: hari };
    case "semua":
      return { dari: AWAL_RIWAYAT, sampai: hari };
    case "kustom": {
      const dari = kustom?.dari || tambahHariYmd(hari, -29);
      const sampai = kustom?.sampai || hari;
      return dari <= sampai ? { dari, sampai } : { dari: sampai, sampai: dari };
    }
  }
}

/**
 * Rentang tanggal Jakarta -> batas waktu UTC untuk filter kolom Created: awal hari `dari` (inklusif) sampai awal
 * hari sesudah `sampai` (eksklusif). Jakarta tetap UTC+7 sepanjang tahun, jadi cukup digeser 7 jam.
 */
export function batasPeriodeUtc(r: { dari: Ymd; sampai: Ymd }): { mulai: string; akhir: string } {
  const mulai = new Date(`${r.dari}T00:00:00+07:00`);
  const akhir = new Date(`${tambahHariYmd(r.sampai, 1)}T00:00:00+07:00`);
  return { mulai: mulai.toISOString(), akhir: akhir.toISOString() };
}

const fmtYmdJakarta = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
const fmtWaktuJakarta = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Tanggal (zona Jakarta) dari waktu ISO. */
export function ymdJakarta(iso: string): Ymd {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : fmtYmdJakarta.format(d);
}

/** "2026-10-03 14:05" (WIB), urut secara teks sehingga enak disortir di Excel. */
export function waktuWib(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : fmtWaktuJakarta.format(d).replace(", ", " ");
}

export interface FilterJejak {
  dari: Ymd;
  sampai: Ymd;
  sumber: SumberJejak | "semua";
  /** Teks bebas: nomor kontrak, judul, atau sasaran. */
  kontrak: string;
  /** Email pelaku (huruf kecil), kosong = semua. */
  pelaku: string;
}

export function saringJejak(entri: readonly EntriJejak[], f: FilterJejak): EntriJejak[] {
  const cari = f.kontrak.trim().toLowerCase();
  const pelaku = f.pelaku.trim().toLowerCase();
  return entri
    .filter((e) => {
      const tgl = ymdJakarta(e.waktu);
      if (!tgl || tgl < f.dari || tgl > f.sampai) return false;
      if (f.sumber !== "semua" && e.sumber !== f.sumber) return false;
      if (pelaku && e.pelakuEmail !== pelaku && e.pelaku.toLowerCase() !== pelaku) return false;
      if (cari && !`${e.sasaran} ${e.nomorKontrak} ${e.judul}`.toLowerCase().includes(cari)) return false;
      return true;
    })
    .sort((a, b) => b.waktu.localeCompare(a.waktu) || b.id.localeCompare(a.id));
}

/** Daftar pelaku unik untuk pilihan filter, urut nama. */
export function daftarPelaku(entri: readonly EntriJejak[]): { email: string; nama: string; jumlah: number }[] {
  const peta = new Map<string, { email: string; nama: string; jumlah: number }>();
  for (const e of entri) {
    const kunci = e.pelakuEmail || e.pelaku.toLowerCase();
    const ada = peta.get(kunci);
    if (ada) ada.jumlah++;
    else peta.set(kunci, { email: kunci, nama: e.pelaku, jumlah: 1 });
  }
  return [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

// --- Ekspor CSV --------------------------------------------------------------------------------

/** Sama dengan amankanTeks di lib/ekspor: teks berawalan = + - @ (juga tab dan CR) tidak dijalankan sebagai rumus. */
function amankan(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}
const sel = (v: string) => `"${amankan(v).replace(/"/g, '""')}"`;

export const KOLOM_CSV_JEJAK = ["Waktu (WIB)", "Sumber", "Pelaku", "Email Pelaku", "Aksi", "Sasaran", "Nomor Kontrak", "Judul Kontrak", "Kolom", "Dari", "Ke", "Pesan"] as const;

/**
 * CSV pemisah ";" (Excel berbahasa Indonesia), satu baris per kolom yang berubah; entri tanpa rincian tetap satu
 * baris. Tanpa BOM; pemanggil menambahkannya saat mengunduh.
 */
export function susunCsvJejak(entri: readonly EntriJejak[]): string {
  const baris: string[] = [KOLOM_CSV_JEJAK.map(sel).join(";")];
  for (const e of entri) {
    const dasar = [waktuWib(e.waktu), e.sumber, e.pelaku, e.pelakuEmail, e.aksi, e.sasaran, e.nomorKontrak, e.judul];
    const rincian = e.rincian.length ? e.rincian : [{ kolom: "", dari: "", ke: "" }];
    rincian.forEach((r, i) => baris.push([...dasar, r.kolom, r.dari, r.ke, i === 0 ? e.pesan.replace(/\s+/g, " ").trim() : ""].map(sel).join(";")));
  }
  return baris.join("\r\n");
}

// --- Perubahan pengguna (KelolaPengguna) --------------------------------------------------------

type DataPengguna = Pick<Pengguna, "nama" | "email" | "divisi" | "peran" | "aktif">;

/** Rincian lama-ke-baru perubahan satu pengguna untuk Log Admin. `lama` null = pengguna baru. */
export function bedaPengguna(lama: DataPengguna | null, baru: DataPengguna): DetailPerubahan[] {
  const kolom: { kunci: keyof DataPengguna; label: string }[] = [
    { kunci: "nama", label: "nama" },
    { kunci: "email", label: "email" },
    { kunci: "divisi", label: "divisi" },
    { kunci: "peran", label: "peran" },
    { kunci: "aktif", label: "aktif" },
  ];
  const hasil: DetailPerubahan[] = [];
  for (const { kunci, label } of kolom) {
    const dari = lama ? ringkasNilai(lama[kunci]) : "";
    const ke = ringkasNilai(baru[kunci]);
    if (lama && dari === ke) continue;
    if (!lama && !ke) continue;
    hasil.push({ kolom: label, dari, ke });
  }
  return hasil;
}
