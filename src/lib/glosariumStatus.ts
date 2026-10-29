// Glosarium status untuk ikon "?" di LencanaStatus: arti tiap status dan langkah berikutnya.
// Langkah dibaca dari ALUR di lib/alur.ts (lewat aksiTersedia dengan sesi Admin, yang melihat semua
// aksi Legal dan pengaju), jadi glosarium selalu sama dengan tombol aksi yang benar-benar tersedia.
import { aksiTersedia, type Pelaku } from "./alur";
import type { Kontrak, Sesi, Status } from "./types";

export const ARTI_STATUS: Record<Status, string> = {
  Diajukan: "Pengajuan sudah masuk dan menunggu giliran direview Legal.",
  "Review Legal": "Legal sedang memeriksa draft, klausul, dan dokumen pendukung.",
  "Perlu Revisi": "Legal meminta perbaikan atau dokumen tambahan dari pengaju.",
  "Proses Tanda Tangan": "Draft final sudah disepakati dan sedang ditandatangani para pihak.",
  Aktif: "Kontrak sudah ditandatangani dan sedang berlaku.",
  Berakhir: "Masa berlaku kontrak sudah selesai, atau kontrak sudah diakhiri.",
  Ditolak: "Legal menolak pengajuan. Alasannya tercatat di riwayat kontrak.",
  Dibatalkan: "Pengajuan dibatalkan oleh pengaju. Alasannya tercatat di riwayat kontrak.",
};

export const NAMA_PELAKU: Record<Pelaku, string> = { legal: "Legal", pengaju: "Pengaju" };

export interface LangkahStatus {
  label: string;
  ke: Status;
  oleh: Pelaku;
}

const SESI_SEMUA_AKSI: Sesi = { email: "", nama: "", peran: "Admin", divisi: "IT", penggunaId: null };

/** Aksi yang bisa diambil dari status ini, sesuai ALUR. Kosong untuk status akhir. */
export function langkahBerikut(status: Status): LangkahStatus[] {
  // aksiTersedia hanya membaca status, email pengaju, dan divisi.
  const k = { status, pengajuEmail: "", divisi: "SCM" } as unknown as Kontrak;
  return aksiTersedia(k, SESI_SEMUA_AKSI).map((a) => ({ label: a.label, ke: a.ke, oleh: a.oleh }));
}

/** Kalimat ringkas untuk pembaca layar dan tooltip. */
export function teksGlosarium(status: Status): string {
  const langkah = langkahBerikut(status);
  const lanjut = langkah.length
    ? `Berikutnya: ${langkah.map((l) => `${l.label} oleh ${NAMA_PELAKU[l.oleh]}${l.ke !== status ? ` (menjadi ${l.ke})` : ""}`).join("; ")}.`
    : "Ini status akhir, tidak ada langkah lanjutan.";
  return `${status}: ${ARTI_STATUS[status]} ${lanjut}`;
}
