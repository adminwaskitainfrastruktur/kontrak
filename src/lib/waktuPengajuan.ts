// Waktu pengajuan untuk kartu Ruang Pengguna (U03A). Menggantikan "Diperbarui ..." yang menyesatkan:
// kolom Modified ikut berubah karena hal teknis (sinkron masa berlaku, catatan TTD), jadi pengaju mengira
// ada kemajuan padahal tidak. Yang ditampilkan:
//   - Masuk: kapan pengajuan diterima (TanggalDiajukan, cadangannya Created);
//   - Di tahap ini sejak: kapan status sekarang dimulai (StatusSejak), hanya bila statusnya sudah berganti
//     sejak diajukan supaya tidak mengulang baris "Masuk";
//   - Umur pengajuan: hari kalender (Jakarta) sejak diajukan, hanya selama masih diproses (belum Aktif
//     atau status akhir lain).
// Murni: `sekarang` selalu bisa diberikan pemanggil supaya teruji.
import { formatTanggal, keYmd, lamaSejak } from "./format";
import { STATUS_PROSES, type Kontrak } from "./types";

export interface WaktuPengajuan {
  /** ISO waktu masuk. */
  masuk: string;
  /** Hari kalender sejak masuk (0 = hari ini). null bila proses Legal sudah selesai. */
  umurHari: number | null;
  /** "Umur pengajuan 12 hari" / "Diajukan hari ini". null bila proses Legal sudah selesai. */
  teksUmur: string | null;
  /** ISO awal status sekarang, atau null bila tidak diketahui atau sama dengan waktu masuk. */
  sejakTahap: string | null;
  /** "Di tahap ini sejak 2 Okt 2026 (3 hari)" atau, bila sudah selesai, "Aktif sejak 2 Okt 2026". */
  teksTahap: string | null;
  selesai: boolean;
}

/** Selisih hari kalender Jakarta antara dua waktu (b - a). */
function selisihHariKalender(a: string, b: number): number {
  const ya = keYmd(a);
  const yb = keYmd(new Date(b).toISOString());
  if (!ya || !yb) return 0;
  return Math.max(0, Math.round((Date.parse(`${yb}T00:00:00Z`) - Date.parse(`${ya}T00:00:00Z`)) / 86_400_000));
}

/** Toleransi beda StatusSejak dengan waktu masuk yang dianggap "belum berganti tahap". */
const TOLERANSI_MS = 2 * 60_000;

export function waktuPengajuan(k: Pick<Kontrak, "status" | "tanggalDiajukan" | "dibuat" | "statusSejak">, sekarang: number = Date.now()): WaktuPengajuan {
  const masuk = k.tanggalDiajukan ?? k.dibuat;
  // Selesai dari sisi pengaju: proses Legal sudah berakhir (Aktif, Berakhir, Ditolak, Dibatalkan).
  const selesai = !STATUS_PROSES.includes(k.status);
  const sejak = k.statusSejak && !Number.isNaN(Date.parse(k.statusSejak)) ? k.statusSejak : null;
  const berganti = sejak != null && Math.abs(Date.parse(sejak) - Date.parse(masuk)) > TOLERANSI_MS;

  if (selesai) {
    return {
      masuk,
      umurHari: null,
      teksUmur: null,
      sejakTahap: sejak,
      teksTahap: sejak ? `${k.status} sejak ${formatTanggal(keYmd(sejak))}` : null,
      selesai,
    };
  }

  const umurHari = selisihHariKalender(masuk, sekarang);
  return {
    masuk,
    umurHari,
    teksUmur: umurHari === 0 ? "Diajukan hari ini" : `Umur pengajuan ${umurHari} hari`,
    sejakTahap: berganti ? sejak : null,
    teksTahap: berganti && sejak ? `Di tahap ini sejak ${formatTanggal(keYmd(sejak))} (${lamaSejak(sejak, sekarang)})` : null,
    selesai,
  };
}
