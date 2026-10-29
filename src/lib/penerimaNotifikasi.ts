// Siapa menerima email untuk setiap kejadian (U23a). Modul murni: tanpa jaringan dan tanpa React, sehingga
// aturannya teruji tabel di scripts/uji-notifikasi.ts. services/notifikasi.ts memakainya untuk mengantrikan email.
//
// Aturan:
//   - Pelaku tidak dikirimi pemberitahuan atas aksinya sendiri. Satu-satunya pengecualian adalah tanda terima
//     pengajuan baru ("Konfirmasi Pengaju"), yang memang ditujukan ke orang yang baru mengajukan.
//   - Pemantau tidak menerima email apa pun; pengguna terdaftar yang dinonaktifkan juga tidak.
//   - Akun kantor yang tidak terdaftar (masuk otomatis sebagai Pengaju tanpa divisi) tetap menerima email.
//   - Hanya alamat domain kantor yang dipakai (flow Kirim email juga menolak alamat di luar domain).
//   - Pengajuan baru ke tim Legal: Legal dan Admin aktif. Bila Pengaturan berisi alamat grup Legal, grup itu
//     MENGGANTIKAN daftar anggota (sama dengan flow terjadwal), supaya anggota grup tidak menerima dua salinan.
//   - Perubahan status oleh Legal (termasuk Perlu Revisi dan Ditolak) ke pengaju. Aksi pengaju (kirim ulang,
//     batal) ke PIC Legal, atau ke tim Legal bila belum ada PIC. Bila aksi pengaju dijalankan orang lain
//     (mis. Admin membatalkan atas nama pengaju), pengaju ikut diberi tahu.
//   - Penugasan: PIC baru dan PIC lama (bila dialihkan) sama-sama diberi tahu.
import type { Pelaku } from "./alur";
import type { Peran, Status } from "./types";

export interface OrangNotif {
  email: string;
  nama: string;
}

/** Bagian data kontrak yang dibutuhkan aturan penerima. */
export interface KontrakNotif {
  pengajuEmail: string;
  picLegalEmail: string;
}

export type KejadianNotif =
  | { jenis: "pengajuan-baru"; k: KontrakNotif }
  /** `k` adalah kontrak SESUDAH perubahan; `oleh` dari aturan alur (AksiStatus.oleh). */
  | { jenis: "status"; k: KontrakNotif; dari: Status; ke: Status; oleh: Pelaku }
  | { jenis: "penugasan"; k: KontrakNotif; picLama: OrangNotif | null; picBaru: OrangNotif };

export interface PenggunaNotif {
  email: string;
  peran: Peran;
  aktif: boolean;
}

export interface KonteksNotif {
  /** Email orang yang menjalankan aksi. */
  pelakuEmail: string;
  /** Isi list Pengguna Kontrak, atau null bila gagal dimuat (alamat perorangan tetap dipakai, tim Legal tidak). */
  pengguna: readonly PenggunaNotif[] | null;
  /** Alamat grup Legal dari Pengaturan; kosong bila tidak diisi. */
  alamatGrupLegal: string;
  /** Domain kantor, mis. waskitainfrastruktur.co.id. */
  domain: string;
}

/** Penerima per templat email. Setiap daftar sudah bersih: huruf kecil, unik, tanpa pelaku. */
export interface PaketPenerima {
  /** Templat untuk tim Legal (pengajuan baru, atau aksi pengaju). */
  legal: string[];
  /** Templat untuk pengaju (konfirmasi, atau perubahan status). */
  pengaju: string[];
  /** "Ditugaskan kepada Anda". */
  picBaru: string[];
  /** "Dialihkan dari Anda". */
  picLama: string[];
  /** true bila tim Legal perlu dikabari tetapi alamatnya tidak bisa ditentukan (pengguna gagal dimuat, grup kosong). */
  timLegalTakDiketahui: boolean;
}

const POLA_EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

export const rapikanEmail = (e: string | null | undefined): string => (e ?? "").trim().toLowerCase();

/** Alamat berada di domain kantor (termasuk subdomainnya). */
export function diDomain(email: string, domain: string): boolean {
  const e = rapikanEmail(email);
  const d = domain.trim().toLowerCase().replace(/^@/, "");
  if (!d || !POLA_EMAIL.test(e)) return false;
  const host = e.slice(e.lastIndexOf("@") + 1);
  return host === d || host.endsWith(`.${d}`);
}

/**
 * Boleh menerima email aplikasi: alamat domain kantor, dan bila terdaftar di list Pengguna, harus aktif dan
 * bukan Pemantau. Akun kantor yang tidak terdaftar tetap boleh (masuk otomatis sebagai Pengaju).
 */
export function bolehMenerima(email: string, konteks: Pick<KonteksNotif, "pengguna" | "domain">): boolean {
  const e = rapikanEmail(email);
  if (!diDomain(e, konteks.domain)) return false;
  const terdaftar = konteks.pengguna?.find((p) => rapikanEmail(p.email) === e);
  if (!terdaftar) return true;
  return terdaftar.aktif && terdaftar.peran !== "Pemantau";
}

/** Rapikan daftar penerima: huruf kecil, unik, lolos bolehMenerima, dan tanpa alamat di `kecuali`. */
export function saringPenerima(daftar: readonly (string | null | undefined)[], konteks: Pick<KonteksNotif, "pengguna" | "domain">, kecuali: readonly string[] = []): string[] {
  const abaikan = new Set(kecuali.map(rapikanEmail).filter(Boolean));
  const hasil: string[] = [];
  for (const mentah of daftar) {
    const e = rapikanEmail(mentah);
    if (!e || abaikan.has(e) || hasil.includes(e)) continue;
    if (bolehMenerima(e, konteks)) hasil.push(e);
  }
  return hasil;
}

/**
 * Alamat tim Legal: alamat grup bila diisi (menggantikan anggota), selain itu Legal dan Admin yang aktif.
 * `null` bila tidak bisa ditentukan (list Pengguna gagal dimuat dan grup kosong).
 */
export function alamatTimLegal(konteks: KonteksNotif, kecuali: readonly string[] = []): string[] | null {
  const grup = rapikanEmail(konteks.alamatGrupLegal);
  if (grup) return saringPenerima([grup], { pengguna: null, domain: konteks.domain }, kecuali);
  if (!konteks.pengguna) return null;
  const anggota = konteks.pengguna.filter((p) => p.aktif && (p.peran === "Legal" || p.peran === "Admin")).map((p) => p.email);
  return saringPenerima(anggota, konteks, kecuali);
}

/** Penerima setiap templat untuk satu kejadian. */
export function penerimaNotifikasi(kejadian: KejadianNotif, konteks: KonteksNotif): PaketPenerima {
  const pelaku = rapikanEmail(konteks.pelakuEmail);
  const hasil: PaketPenerima = { legal: [], pengaju: [], picBaru: [], picLama: [], timLegalTakDiketahui: false };
  const tim = (kecuali: string[]) => {
    const t = alamatTimLegal(konteks, kecuali);
    if (t == null) hasil.timLegalTakDiketahui = true;
    return t ?? [];
  };

  switch (kejadian.jenis) {
    case "pengajuan-baru": {
      const pengaju = rapikanEmail(kejadian.k.pengajuEmail);
      hasil.legal = tim([pelaku, pengaju]);
      // Tanda terima selalu ke pengajunya, walau ia sendiri pelakunya.
      hasil.pengaju = saringPenerima([pengaju], konteks);
      return hasil;
    }
    case "status": {
      const pengaju = rapikanEmail(kejadian.k.pengajuEmail);
      const pic = rapikanEmail(kejadian.k.picLegalEmail);
      if (kejadian.oleh === "pengaju") {
        hasil.legal = pic ? saringPenerima([pic], konteks, [pelaku]) : tim([pelaku, pengaju]);
        // Aksi pengaju yang dijalankan orang lain (Admin, rekan sedivisi): pengaju tetap perlu tahu.
        hasil.pengaju = saringPenerima([pengaju], konteks, [pelaku]);
      } else {
        hasil.pengaju = saringPenerima([pengaju], konteks, [pelaku]);
      }
      return hasil;
    }
    case "penugasan": {
      const baru = rapikanEmail(kejadian.picBaru.email);
      const lama = rapikanEmail(kejadian.picLama?.email);
      hasil.picBaru = saringPenerima([baru], konteks, [pelaku]);
      if (lama && lama !== baru) hasil.picLama = saringPenerima([lama], konteks, [pelaku]);
      return hasil;
    }
  }
}
