// Permintaan masukan unit lain (K03): Legal meminta pendapat Keuangan, Pajak, Teknik, K3, dan sebagainya
// tentang satu kontrak, lewat email, tanpa memberi unit itu akses ke site. Datanya di list "Permintaan Masukan"
// (LIST_ID.masukan). Unit menjawab lewat email ke Legal; Legal mencatat jawabannya di aplikasi (penulisan balik
// otomatis lewat flow belum dibuat).
//
// Selama ada permintaan yang menunggu, umur tahap Legal dikurangi (lib/sla MENUNGGU_UNIT_LAIN), jadi waktu
// menunggu unit lain terpisah dari SLA Legal.
//
// Modul ini murni (tanpa jaringan, tanpa React) sehingga teruji lewat scripts/uji-masukan.ts.
import type { RentangTunggu } from "./sla";
import type { Ymd } from "./types";

/** Nilai kolom Choice StatusMasukan. "Terlambat" juga dihitung di klien (Menunggu yang lewat tenggat). */
export const STATUS_MASUKAN = ["Menunggu", "Dijawab", "Terlambat", "Dibatalkan"] as const;
export type StatusMasukan = (typeof STATUS_MASUKAN)[number];

/** Usulan unit (standar awal; bisa diketik bebas). */
export const UNIT_USULAN = ["Keuangan", "Pajak", "Akuntansi", "Teknik", "K3", "Pengadaan", "SCM", "Manajemen Risiko"] as const;

/** Tenggat bawaan saat membuat permintaan: hari kalender dari hari ini (standar awal). */
export const TENGGAT_BAWAAN_HARI = 3;

export interface PermintaanMasukan {
  id: number;
  kontrakId: number;
  unit: string;
  emailPenerima: string;
  namaPenerima: string;
  pertanyaan: string;
  tenggat: Ymd | null;
  /** Status tersimpan. Pakai statusTampil() untuk menampilkan (menghitung Terlambat). */
  status: StatusMasukan;
  jawaban: string;
  /** Nama orang di unit yang menjawab (diisi Legal). */
  dijawabOleh: string;
  /** Kapan dijawab atau dibatalkan (ISO). */
  selesaiPada: string | null;
  /** Tautan berkas yang dibagikan per-berkas ke penerima (opsional). */
  tautanBerkas: string;
  dibuat: string;
  dibuatOleh: string;
  diubah: string;
  diubahOleh: string;
}

export interface MasukanBaru {
  unit: string;
  emailPenerima: string;
  namaPenerima: string;
  pertanyaan: string;
  tenggat: Ymd | null;
  tautanBerkas: string;
}

export interface JawabanMasukan {
  jawaban: string;
  dijawabOleh: string;
  /** Tanggal jawaban diterima; kosong = hari ini. */
  tanggal: Ymd | null;
}

const POLA_EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

/** Permintaan masih menunggu jawaban (termasuk yang sudah ditandai Terlambat). */
export const masihMenunggu = (m: Pick<PermintaanMasukan, "status">) => m.status === "Menunggu" || m.status === "Terlambat";

/** Status untuk ditampilkan: Menunggu yang tenggatnya sudah lewat menjadi Terlambat. */
export function statusTampil(m: Pick<PermintaanMasukan, "status" | "tenggat">, hari: Ymd): StatusMasukan {
  if (m.status === "Menunggu" && m.tenggat && m.tenggat < hari) return "Terlambat";
  return m.status;
}

export function masukanKosong(tenggat: Ymd | null): MasukanBaru {
  return { unit: "", emailPenerima: "", namaPenerima: "", pertanyaan: "", tenggat, tautanBerkas: "" };
}

/** Pesan galat pertama yang perlu dibetulkan, atau null bila sah. Penerima wajib alamat domain kantor. */
export function validasiMasukan(m: MasukanBaru, o: { domain: string; hari: Ymd }): string | null {
  if (!m.unit.trim()) return "Isi unit yang dimintai masukan, mis. Keuangan atau Pajak.";
  if (m.unit.trim().length > 80) return "Nama unit paling panjang 80 karakter.";
  const email = m.emailPenerima.trim().toLowerCase();
  if (!email) return "Isi email penerima di unit tersebut.";
  if (!POLA_EMAIL.test(email)) return "Format email penerima belum benar.";
  const domain = o.domain.trim().toLowerCase();
  const host = email.slice(email.lastIndexOf("@") + 1);
  if (domain && host !== domain && !host.endsWith(`.${domain}`)) return `Email penerima harus alamat kantor (@${domain}).`;
  if (m.pertanyaan.trim().length < 10) return "Tuliskan pertanyaannya, minimal satu kalimat.";
  if (m.pertanyaan.trim().length > 2000) return "Pertanyaan paling panjang 2.000 karakter.";
  if (!m.tenggat) return "Isi tenggat jawaban.";
  if (m.tenggat < o.hari) return "Tenggat tidak boleh sebelum hari ini.";
  const tautan = m.tautanBerkas.trim();
  if (tautan) {
    try {
      if (new URL(tautan).protocol !== "https:") return "Tautan berkas harus diawali https://.";
    } catch {
      return "Tautan berkas belum valid. Salin tautan berbagi dari SharePoint atau OneDrive.";
    }
  }
  return null;
}

export function rapikanMasukan(m: MasukanBaru): MasukanBaru {
  return {
    unit: m.unit.replace(/\s+/g, " ").trim(),
    emailPenerima: m.emailPenerima.trim().toLowerCase(),
    namaPenerima: m.namaPenerima.replace(/\s+/g, " ").trim(),
    pertanyaan: m.pertanyaan.trim(),
    tenggat: m.tenggat,
    tautanBerkas: m.tautanBerkas.trim(),
  };
}

export function validasiJawaban(j: JawabanMasukan, hari: Ymd): string | null {
  if (j.jawaban.trim().length < 3) return "Tuliskan ringkasan jawabannya.";
  if (j.jawaban.trim().length > 4000) return "Jawaban paling panjang 4.000 karakter.";
  if (j.tanggal && j.tanggal > hari) return "Tanggal jawaban tidak boleh setelah hari ini.";
  return null;
}

/** Masa menunggu setiap permintaan, untuk pengurang umur tahap di lib/sla. Permintaan yang dibatalkan ikut dihitung sampai dibatalkan. */
export function rentangTungguMasukan(daftar: readonly Pick<PermintaanMasukan, "status" | "dibuat" | "selesaiPada">[]): RentangTunggu[] {
  return daftar.filter((m) => m.dibuat).map((m) => ({ mulai: m.dibuat, selesai: masihMenunggu(m) ? null : (m.selesaiPada ?? m.dibuat) }));
}

/** Menunggu dulu (tenggat terdekat), lalu yang selesai (terbaru dulu). */
export function urutkanMasukan<T extends Pick<PermintaanMasukan, "id" | "status" | "tenggat" | "dibuat">>(daftar: readonly T[]): T[] {
  return [...daftar].sort((a, b) => {
    const ma = masihMenunggu(a);
    const mb = masihMenunggu(b);
    if (ma !== mb) return ma ? -1 : 1;
    if (ma) {
      const ta = a.tenggat ?? "9999-12-31";
      const tb = b.tenggat ?? "9999-12-31";
      if (ta !== tb) return ta.localeCompare(tb);
    }
    return b.dibuat.localeCompare(a.dibuat) || b.id - a.id;
  });
}

export function ringkasMasukan(daftar: readonly Pick<PermintaanMasukan, "status" | "tenggat">[], hari: Ymd): { total: number; menunggu: number; terlambat: number; dijawab: number } {
  return {
    total: daftar.length,
    menunggu: daftar.filter(masihMenunggu).length,
    terlambat: daftar.filter((m) => statusTampil(m, hari) === "Terlambat").length,
    dijawab: daftar.filter((m) => m.status === "Dijawab").length,
  };
}
