// List "Permintaan Masukan" (K03), khusus Legal/Admin. Kolom yang dipakai:
//   Title (ringkas: unit dan nomor pengajuan), KontrakId (Number, diindeks), NomorPengajuan (teks), Unit (teks),
//   EmailPenerima (teks), NamaPenerima (teks, opsional), Pertanyaan (Multiple lines of text, plain),
//   Tenggat (Date only), StatusMasukan (Choice: Menunggu; Dijawab; Terlambat; Dibatalkan),
//   Jawaban (Multiple lines of text, plain), DijawabOleh (teks), SelesaiPada (Date and Time),
//   TautanBerkas (teks, opsional).
// Pencatat dan pengubah diambil dari createdBy/lastModifiedBy SharePoint. Isi pertanyaan dan jawaban TIDAK ditulis ke
// list Aktivitas (yang terbaca pengaju).
//
// Email permintaan diantrikan lewat kotak keluar (flow "Kirim email"). Unit menjawab lewat email ke Legal yang
// meminta, lalu Legal mencatat jawabannya di panel; penulisan balik otomatis lewat flow belum dibuat.
import { DOMAIN_KANTOR, GRAPH_SITE_ID, LIST_ID } from "../config";
import { dariYmd, hariIni, keYmd } from "../lib/format";
import { GraphError, graph, graphSemua } from "../lib/graph";
import { emailPermintaanMasukan } from "../lib/email";
import { STATUS_MASUKAN, rapikanMasukan, validasiJawaban, validasiMasukan, type JawabanMasukan, type MasukanBaru, type PermintaanMasukan, type StatusMasukan } from "../lib/masukan";
import { diDomain } from "../lib/penerimaNotifikasi";
import type { Kontrak, Sesi } from "../lib/types";
import { antrikanTangguh } from "./notifikasi";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.masukan}/items`;

interface ItemGraph {
  id: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  createdBy?: { user?: { displayName?: string } };
  lastModifiedBy?: { user?: { displayName?: string } };
  fields: Record<string, unknown>;
}

const teks = (v: unknown) => (typeof v === "string" ? v : "");

function dariItem(it: ItemGraph): PermintaanMasukan {
  const f = it.fields;
  const status = teks(f.StatusMasukan);
  return {
    id: Number(it.id),
    kontrakId: Number(f.KontrakId),
    unit: teks(f.Unit),
    emailPenerima: teks(f.EmailPenerima).trim().toLowerCase(),
    namaPenerima: teks(f.NamaPenerima),
    pertanyaan: teks(f.Pertanyaan),
    tenggat: keYmd(teks(f.Tenggat)),
    status: ((STATUS_MASUKAN as readonly string[]).includes(status) ? status : "Menunggu") as StatusMasukan,
    jawaban: teks(f.Jawaban),
    dijawabOleh: teks(f.DijawabOleh),
    selesaiPada: teks(f.SelesaiPada) || null,
    tautanBerkas: teks(f.TautanBerkas),
    dibuat: it.createdDateTime,
    dibuatOleh: it.createdBy?.user?.displayName ?? "",
    diubah: it.lastModifiedDateTime,
    diubahOleh: it.lastModifiedBy?.user?.displayName ?? "",
  };
}

/** Galat list yang dibuat ramah: list belum dibuat atau akun tanpa izin. */
function galatRamah(err: unknown): unknown {
  if (err instanceof GraphError && (err.status === 403 || err.status === 404)) {
    return new GraphError(
      err.status === 403
        ? "Akun Anda belum diberi akses ke list Permintaan Masukan. Minta pemilik site memberi izin Edit untuk grup Legal."
        : "List Permintaan Masukan belum ditemukan di site. Minta Admin membuat list dan kolomnya lebih dulu.",
      err.status,
    );
  }
  return err;
}

export async function ambilMasukan(kontrakId: number): Promise<PermintaanMasukan[]> {
  try {
    const items = await graphSemua<ItemGraph>(`${ITEMS}?$expand=fields&$top=999&$filter=fields/KontrakId eq ${kontrakId}`, {
      headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" },
    });
    return items.map(dariItem);
  } catch (err) {
    throw galatRamah(err);
  }
}

/** Kolom opsional yang boleh belum dibuat: bila Graph menolaknya (400), penulisan diulang tanpa kolom ini. */
const KOLOM_OPSIONAL = ["NamaPenerima", "TautanBerkas", "DijawabOleh"] as const;

async function tulis(path: string, method: "POST" | "PATCH", fields: Record<string, unknown>): Promise<{ id: number; tanpa: string[] }> {
  const kirim = async (f: Record<string, unknown>) => {
    const r = await graph<{ id?: string }>(path, { method, json: method === "POST" ? { fields: f } : f });
    return Number(r?.id ?? 0);
  };
  try {
    return { id: await kirim(fields), tanpa: [] };
  } catch (err) {
    const opsional = KOLOM_OPSIONAL.filter((k) => k in fields);
    if (!(err instanceof GraphError && err.status === 400) || opsional.length === 0) throw galatRamah(err);
    const inti = Object.fromEntries(Object.entries(fields).filter(([k]) => !(opsional as readonly string[]).includes(k)));
    try {
      return { id: await kirim(inti), tanpa: [...opsional] };
    } catch (err2) {
      throw galatRamah(err2);
    }
  }
}

function pesanKolomHilang(tanpa: readonly string[]): string[] {
  return tanpa.length ? [`Tersimpan tanpa kolom ${tanpa.join(", ")}. Minta Admin menambahkan kolom itu di list Permintaan Masukan.`] : [];
}

export interface HasilMasukan {
  /** false bila email permintaan belum masuk antrean kirim (permintaan tetap tercatat). */
  emailTerantri: boolean;
  peringatan: string[];
}

async function antrikanPermintaan(k: Kontrak, isi: MasukanBaru, sesi: Pick<Sesi, "email" | "nama">): Promise<boolean> {
  if (!diDomain(isi.emailPenerima, DOMAIN_KANTOR)) return false;
  const m = emailPermintaanMasukan(k, isi, { nama: sesi.nama, email: sesi.email });
  try {
    await antrikanTangguh({ penerima: [isi.emailPenerima], cc: [sesi.email], subjek: m.subjek, html: m.html, jenis: "Lainnya", kontrakId: k.id });
    return true;
  } catch (err) {
    console.warn("Email permintaan masukan gagal diantrikan:", err);
    return false;
  }
}

/** Catat permintaan baru lalu kirim emailnya ke unit (tembusan ke Legal yang meminta). */
export async function buatMasukan(k: Kontrak, isiMentah: MasukanBaru, sesi: Pick<Sesi, "email" | "nama">): Promise<HasilMasukan> {
  const isi = rapikanMasukan(isiMentah);
  const galat = validasiMasukan(isi, { domain: DOMAIN_KANTOR, hari: hariIni() });
  if (galat) throw new Error(galat);
  const h = await tulis(ITEMS, "POST", {
    Title: `Masukan ${isi.unit} · ${k.nomorPengajuan}`.slice(0, 250),
    KontrakId: k.id,
    NomorPengajuan: k.nomorPengajuan,
    Unit: isi.unit,
    EmailPenerima: isi.emailPenerima,
    Pertanyaan: isi.pertanyaan,
    Tenggat: dariYmd(isi.tenggat),
    StatusMasukan: "Menunggu" satisfies StatusMasukan,
    ...(isi.namaPenerima ? { NamaPenerima: isi.namaPenerima } : {}),
    ...(isi.tautanBerkas ? { TautanBerkas: isi.tautanBerkas } : {}),
  });
  const emailTerantri = await antrikanPermintaan(k, isi, sesi);
  return {
    emailTerantri,
    peringatan: [...pesanKolomHilang(h.tanpa), ...(emailTerantri ? [] : ["Permintaan tercatat, tetapi emailnya belum masuk antrean kirim. Coba Kirim ulang dari panel, atau hubungi unitnya langsung."])],
  };
}

/** Kirim ulang email permintaan yang masih menunggu (mis. sudah lewat tenggat). */
export async function kirimUlangMasukan(k: Kontrak, m: PermintaanMasukan, sesi: Pick<Sesi, "email" | "nama">): Promise<boolean> {
  return antrikanPermintaan(k, { unit: m.unit, emailPenerima: m.emailPenerima, namaPenerima: m.namaPenerima, pertanyaan: m.pertanyaan, tenggat: m.tenggat, tautanBerkas: m.tautanBerkas }, sesi);
}

/** Legal mencatat jawaban yang diterima lewat email. Waktu selesai = tanggal jawaban (jam sekarang bila hari ini). */
export async function catatJawabanMasukan(m: PermintaanMasukan, j: JawabanMasukan): Promise<string[]> {
  const hari = hariIni();
  const galat = validasiJawaban(j, hari);
  if (galat) throw new Error(galat);
  const selesai = !j.tanggal || j.tanggal === hari ? new Date().toISOString() : dariYmd(j.tanggal);
  const h = await tulis(`${ITEMS}/${m.id}/fields`, "PATCH", {
    StatusMasukan: "Dijawab" satisfies StatusMasukan,
    Jawaban: j.jawaban.trim(),
    SelesaiPada: selesai,
    ...(j.dijawabOleh.trim() ? { DijawabOleh: j.dijawabOleh.replace(/\s+/g, " ").trim() } : {}),
  });
  return pesanKolomHilang(h.tanpa);
}

/** Batalkan permintaan yang tidak lagi diperlukan; masa tunggunya berhenti dihitung sejak saat ini. */
export async function batalkanMasukan(m: PermintaanMasukan): Promise<void> {
  await tulis(`${ITEMS}/${m.id}/fields`, "PATCH", { StatusMasukan: "Dibatalkan" satisfies StatusMasukan, SelesaiPada: new Date().toISOString() });
}
