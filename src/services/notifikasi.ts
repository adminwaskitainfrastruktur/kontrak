// Kotak keluar email. Aplikasi hanya menulis satu baris ke list "Notifikasi Kontrak" per email;
// flow Power Automate "WiCon · Kirim email dari kotak keluar" mengirimnya lewat Outlook dan
// mengubah StatusKirim menjadi Terkirim (atau Gagal beserta alasannya).
//
// Siapa mendapat email apa ditentukan fungsi murni penerimaNotifikasi (lib/penerimaNotifikasi, teruji di
// scripts/uji-notifikasi.ts). Kegagalan mengantrikan email tidak pernah menggagalkan aksi utama (mengajukan,
// mengubah status): setiap email dicoba ulang untuk galat sementara, lalu yang tetap gagal dilaporkan sebagai
// peringatan supaya pemanggil bisa menampilkan toast.
import { DOMAIN_KANTOR, GRAPH_SITE_ID, LIST_ID } from "../config";
import { graph, graphSemua } from "../lib/graph";
import { galatSementara, ulangiPenulisan } from "../lib/cobaUlang";
import { antreanLegal, posisiAntrean } from "../lib/antrean";
import {
  emailAntreanBergerak,
  emailDialihkan,
  emailDitugaskan,
  emailKonfirmasiPengaju,
  emailPengajuanBaruLegal,
  emailStatusBerubah,
  type DokumenPengajuan,
} from "../lib/email";
import { perkiraanSelesaiAntrean, type PerkiraanAntrean } from "../lib/estimasi";
import type { EventStatus } from "../lib/laporan";
import { pengaturanAktif } from "../lib/pengaturan";
import { penerimaNotifikasi, saringPenerima, type KonteksNotif, type OrangNotif, type PenggunaNotif } from "../lib/penerimaNotifikasi";
import type { Pelaku } from "../lib/alur";
import type { EmailKeluar, Kontrak, Sesi, Status } from "../lib/types";
import { emailSenyapKontrak } from "./senyap";
import { ambilSemuaPengguna } from "./pengguna";
import { ambilSemuaEventStatus } from "./riwayatStatus";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.notifikasi}/items`;

/** Antrikan satu email. Penerima kosong atau duplikat dirapikan di sini. */
export async function antrikanEmail(e: EmailKeluar): Promise<void> {
  const rapi = (daftar: string[] = []) => [...new Set(daftar.map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+$/.test(x)))];
  // Penerima yang membisukan kontrak ini tidak dikirimi email tentangnya (services/senyap.ts).
  const senyap = e.kontrakId != null ? await emailSenyapKontrak(e.kontrakId) : new Set<string>();
  const penerima = rapi(e.penerima).filter((x) => !senyap.has(x));
  if (penerima.length === 0) return;
  const cc = rapi(e.cc).filter((x) => !penerima.includes(x) && !senyap.has(x));
  await graph(ITEMS, {
    method: "POST",
    json: {
      fields: {
        Title: e.subjek.slice(0, 250),
        Penerima: penerima.join(";"),
        Cc: cc.join(";"),
        IsiHtml: e.html,
        JenisNotif: e.jenis,
        KontrakId: e.kontrakId ?? null,
        StatusKirim: "Antri",
      },
    },
  });
}

/** antrikanEmail dengan coba ulang untuk galat yang hampir pasti belum diproses (luring, 429, 503). */
export function antrikanTangguh(e: EmailKeluar): Promise<void> {
  return ulangiPenulisan(() => antrikanEmail(e), { bolehUlang: (err) => galatSementara(err, "email") });
}

/** Hasil mengabari: berapa email masuk antrean, dan peringatan untuk email yang tidak bisa diantrikan. */
export interface HasilKabar {
  terantri: number;
  peringatan: string[];
}

/** Pengumpul hasil: setiap email dicoba sendiri-sendiri, satu kegagalan tidak menahan email lain. */
function pengumpul() {
  let terantri = 0;
  let gagal = 0;
  const peringatan: string[] = [];
  return {
    async kirim(e: EmailKeluar): Promise<void> {
      if (e.penerima.length === 0) return;
      try {
        await antrikanTangguh(e);
        terantri++;
      } catch (err) {
        gagal++;
        console.warn("Email gagal diantrikan:", e.subjek, err);
      }
    },
    catat(p: string) {
      if (!peringatan.includes(p)) peringatan.push(p);
    },
    hasil(): HasilKabar {
      const semua = [...peringatan];
      if (gagal > 0) semua.unshift(`${gagal} email pemberitahuan belum masuk antrean kirim. Coba lagi nanti, atau sampaikan lewat komentar di halaman kontrak.`);
      return { terantri, peringatan: semua };
    },
  };
}

// Daftar pengguna untuk aturan penerima, disimpan sebentar supaya aksi beruntun tidak memuatnya berulang.
const UMUR_PENGGUNA_MS = 120_000;
let cachePengguna: { waktu: number; data: PenggunaNotif[] } | null = null;

async function penggunaUntukNotif(): Promise<PenggunaNotif[] | null> {
  if (cachePengguna && Date.now() - cachePengguna.waktu < UMUR_PENGGUNA_MS) return cachePengguna.data;
  try {
    const data = (await ambilSemuaPengguna()).map((p) => ({ email: p.email, peran: p.peran, aktif: p.aktif }));
    cachePengguna = { waktu: Date.now(), data };
    return data;
  } catch (err) {
    console.warn("Daftar pengguna gagal dimuat untuk penerima email:", err);
    return null;
  }
}

/** Konteks aturan penerima untuk pelaku ini: daftar pengguna, alamat grup Legal, dan domain kantor. */
export async function konteksNotif(pelakuEmail: string): Promise<KonteksNotif> {
  return { pelakuEmail, pengguna: await penggunaUntukNotif(), alamatGrupLegal: pengaturanAktif().alamatGrupLegal, domain: DOMAIN_KANTOR };
}

const PESAN_TIM_TAK_DIKETAHUI = "Email untuk tim Legal belum terkirim karena daftar pengguna tidak terbaca dan alamat grup Legal belum diisi di Pengaturan.";

/**
 * Riwayat status untuk perkiraan antrean. Galat apa pun (list belum ada, izin, jaringan) menghasilkan null,
 * sehingga email tetap terkirim, hanya tanpa perkiraan.
 */
async function muatRiwayatPerkiraan(): Promise<readonly EventStatus[] | null> {
  try {
    return await ambilSemuaEventStatus().catch(() => null);
  } catch {
    return null;
  }
}

function perkiraanUntuk(posisi: number | null, riwayat: readonly EventStatus[] | null): PerkiraanAntrean | null {
  if (posisi == null || !riwayat) return null;
  try {
    return perkiraanSelesaiAntrean(posisi, riwayat, Date.now());
  } catch {
    return null;
  }
}

/** Gabungkan kontrak yang baru ditulis ke daftar dari server (yang mungkin belum memuatnya). */
function denganKontrak(semua: readonly Kontrak[], k: Kontrak): Kontrak[] {
  return semua.some((x) => x.id === k.id) ? semua.map((x) => (x.id === k.id ? k : x)) : [...semua, k];
}

/**
 * Pengajuan baru: kabar ke tim Legal (menyebut dokumen yang terunggah) dan tanda terima dengan posisi antrean ke
 * pengaju. Dipanggil SESUDAH unggahan selesai (lihat selesaikanPengajuan di services/kontrak).
 */
export async function kabarkanPengajuanBaru(k: Kontrak, semua: readonly Kontrak[], sesi: Pick<Sesi, "email">, dokumen?: DokumenPengajuan | null): Promise<HasilKabar> {
  const kumpul = pengumpul();
  const antrean = antreanLegal(denganKontrak(semua, k));
  const penerima = penerimaNotifikasi({ jenis: "pengajuan-baru", k }, await konteksNotif(sesi.email));
  if (penerima.timLegalTakDiketahui) kumpul.catat(PESAN_TIM_TAK_DIKETAHUI);

  const untukLegal = emailPengajuanBaruLegal(k, antrean, dokumen);
  await kumpul.kirim({ penerima: penerima.legal, subjek: untukLegal.subjek, html: untukLegal.html, jenis: "Pengajuan Baru", kontrakId: k.id });

  if (penerima.pengaju.length) {
    const riwayat = await muatRiwayatPerkiraan();
    const posisi = posisiAntrean(k, antrean) ?? antrean.length;
    const untukPengaju = emailKonfirmasiPengaju(k, antrean, perkiraanUntuk(posisi, riwayat));
    await kumpul.kirim({ penerima: penerima.pengaju, subjek: untukPengaju.subjek, html: untukPengaju.html, jenis: "Konfirmasi Pengaju", kontrakId: k.id });
  }
  return kumpul.hasil();
}

/**
 * Status berubah. `oleh` berasal dari aturan alur (AksiStatus.oleh): aksi Legal mengabari pengaju, aksi pengaju
 * (kirim ulang, batal) mengabari PIC Legal atau tim Legal. Pengaju yang antreannya maju ikut diberi tahu.
 * `k` adalah kontrak SESUDAH perubahan.
 */
export async function kabarkanPerubahanStatus(k: Kontrak, dari: Status, catatan: string, sesi: Pick<Sesi, "email" | "nama">, semua: readonly Kontrak[], oleh: Pelaku): Promise<HasilKabar> {
  const kumpul = pengumpul();
  const sesudah = denganKontrak(semua, k);
  const antreanSesudah = antreanLegal(sesudah);
  const konteks = await konteksNotif(sesi.email);
  const penerima = penerimaNotifikasi({ jenis: "status", k, dari, ke: k.status, oleh }, konteks);
  if (penerima.timLegalTakDiketahui) kumpul.catat(PESAN_TIM_TAK_DIKETAHUI);

  if (penerima.legal.length) {
    const m = emailStatusBerubah(k, dari, catatan, sesi.nama, antreanSesudah, "legal");
    await kumpul.kirim({ penerima: penerima.legal, subjek: m.subjek, html: m.html, jenis: "Status Berubah", kontrakId: k.id });
  }
  if (penerima.pengaju.length) {
    const m = emailStatusBerubah(k, dari, catatan, sesi.nama, antreanSesudah, "pengaju");
    const jenis = k.status === "Perlu Revisi" ? "Perlu Revisi" : k.status === "Aktif" || k.status === "Ditolak" ? "Selesai" : "Status Berubah";
    await kumpul.kirim({ penerima: penerima.pengaju, subjek: m.subjek, html: m.html, jenis, kontrakId: k.id });
  }

  // Antrean bergerak: kontrak ini keluar dari antrean, jadi yang di belakangnya maju satu urutan.
  if (dari === "Diajukan" && k.status !== "Diajukan") {
    const sebelum = antreanLegal(sesudah.map((x) => (x.id === k.id ? { ...k, status: "Diajukan" as Status } : x)));
    // Satu pengaju mendapat paling banyak satu email, untuk pengajuannya yang paling depan. Pelaku dilewati.
    const sudah = new Set<string>([k.pengajuEmail.toLowerCase(), sesi.email.toLowerCase()]);
    let riwayat: readonly EventStatus[] | null | undefined;
    for (const j of antreanSesudah.slice(0, 8)) {
      const email = j.pengajuEmail.toLowerCase();
      if (sudah.has(email)) continue;
      const lama = posisiAntrean(j, sebelum);
      const baru = posisiAntrean(j, antreanSesudah);
      if (lama == null || baru == null || baru >= lama) continue;
      sudah.add(email);
      const tujuan = saringPenerima([email], konteks);
      if (!tujuan.length) continue;
      // Riwayat dimuat sekali, hanya bila memang ada email antrean yang dikirim.
      if (riwayat === undefined) riwayat = await muatRiwayatPerkiraan();
      const m = emailAntreanBergerak(j, lama, baru, antreanSesudah, perkiraanUntuk(baru, riwayat));
      await kumpul.kirim({ penerima: tujuan, subjek: m.subjek, html: m.html, jenis: "Antrean Bergerak", kontrakId: j.id });
    }
  }
  return kumpul.hasil();
}

/**
 * Penugasan PIC: PIC baru menerima "Ditugaskan kepada Anda", PIC lama (bila dialihkan) menerima "Dialihkan".
 * Orang yang menugaskan tidak dikirimi email atas aksinya sendiri. `k` adalah kontrak SESUDAH penugasan.
 */
export async function kabarkanPenugasan(k: Kontrak, picLama: OrangNotif | null, sesi: Pick<Sesi, "email" | "nama">, alasan = ""): Promise<HasilKabar> {
  const kumpul = pengumpul();
  const picBaru: OrangNotif = { email: k.picLegalEmail, nama: k.picLegalNama || k.picLegalEmail };
  if (!picBaru.email.trim()) return kumpul.hasil();
  const penerima = penerimaNotifikasi({ jenis: "penugasan", k, picLama, picBaru }, await konteksNotif(sesi.email));
  const namaLama = picLama?.email.trim() ? picLama.nama || picLama.email : "";
  if (penerima.picBaru.length) {
    const m = emailDitugaskan(k, sesi.nama, alasan, namaLama);
    await kumpul.kirim({ penerima: penerima.picBaru, subjek: m.subjek, html: m.html, jenis: "Status Berubah", kontrakId: k.id });
  }
  if (penerima.picLama.length) {
    const m = emailDialihkan(k, sesi.nama, picBaru.nama, alasan);
    await kumpul.kirim({ penerima: penerima.picLama, subjek: m.subjek, html: m.html, jenis: "Status Berubah", kontrakId: k.id });
  }
  return kumpul.hasil();
}

// --- Kotak keluar (halaman Notifikasi) ---------------------------------------------------------

export const STATUS_KIRIM = ["Antri", "Terkirim", "Gagal"] as const;
export type StatusKirim = (typeof STATUS_KIRIM)[number];

/** Satu baris kotak keluar, tanpa isi HTML (diambil terpisah lewat ambilIsiEmail agar daftar tetap ringan). */
export interface EmailTerantri {
  id: number;
  subjek: string;
  penerima: string[];
  cc: string[];
  jenis: string;
  kontrakId: number | null;
  status: StatusKirim;
  dibuat: string;
  dikirimPada: string | null;
  galat: string;
}

interface ItemNotifGraph {
  id: string;
  createdDateTime: string;
  fields: Record<string, unknown>;
}

const teksNotif = (v: unknown) => (typeof v === "string" ? v : "");
const daftarAlamat = (v: unknown) =>
  teksNotif(v)
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);

function keEmailTerantri(it: ItemNotifGraph): EmailTerantri {
  const f = it.fields;
  const status = teksNotif(f.StatusKirim);
  const idKontrak = Number(f.KontrakId);
  return {
    id: Number(it.id),
    subjek: teksNotif(f.Title),
    penerima: daftarAlamat(f.Penerima),
    cc: daftarAlamat(f.Cc),
    jenis: teksNotif(f.JenisNotif) || "Lainnya",
    kontrakId: f.KontrakId != null && Number.isFinite(idKontrak) && idKontrak > 0 ? idKontrak : null,
    status: (STATUS_KIRIM as readonly string[]).includes(status) ? (status as StatusKirim) : "Antri",
    dibuat: it.createdDateTime,
    dikirimPada: teksNotif(f.DikirimPada) || null,
    galat: teksNotif(f.Galat),
  };
}

const PILIH_KOTAK = "fields($select=Title,Penerima,Cc,JenisNotif,KontrakId,StatusKirim,DikirimPada,Galat)";

/** Email terbaru di kotak keluar, paling baru dulu. */
export async function ambilKotakKeluar(limit = 100): Promise<EmailTerantri[]> {
  const top = Math.max(1, Math.min(500, Math.floor(limit)));
  let items: ItemNotifGraph[];
  try {
    // Kolom Created terindeks bawaan SharePoint, jadi pengurutan di server aman untuk list besar.
    const r = await graph<{ value: ItemNotifGraph[] }>(`${ITEMS}?$expand=${PILIH_KOTAK}&$orderby=fields/Created desc&$top=${top}`, {
      headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" },
    });
    items = r.value;
  } catch {
    // Sebagian tenant menolak $orderby pada list item; ambil semua lalu urutkan di peramban.
    items = await graphSemua<ItemNotifGraph>(`${ITEMS}?$expand=${PILIH_KOTAK}&$top=999`);
  }
  return items
    .map(keEmailTerantri)
    .sort((a, b) => b.dibuat.localeCompare(a.dibuat))
    .slice(0, top);
}

/** Isi HTML satu email di kotak keluar, untuk dilihat ulang. */
export async function ambilIsiEmail(id: number): Promise<string> {
  const it = await graph<{ fields: Record<string, unknown> }>(`${ITEMS}/${id}?$expand=fields($select=IsiHtml)`);
  return teksNotif(it.fields.IsiHtml);
}
