// Siapa boleh masuk dan sebagai apa. Logika murni (tanpa React dan MSAL) supaya bisa diuji.
//
// Urutan penentuan:
//   1. Terdaftar aktif di list "Pengguna Kontrak"  -> peran dan divisinya.
//   2. Terdaftar tetapi dinonaktifkan              -> tidak boleh masuk ("dinonaktifkan").
//   3. Admin bawaan (VITE_ADMIN_EMAILS)            -> Admin.
//   4. Akun @domain kantor                         -> Pengaju tanpa divisi, masuk otomatis.
//   5. Selain itu                                  -> tidak boleh masuk ("di-luar-domain").
// Pengaju tanpa divisi hanya melihat dan mengubah pengajuannya sendiri (lihat bisaLihat di lib/alur);
// divisi pengajuannya ditanyakan tiap kali mengajukan dan pilihan terakhirnya diingat di perangkat ini.
import { DIVISI_PENGAJU, type DivisiPengaju, type Pengguna, type Sesi } from "./types";

/**
 * Alasan tidak boleh masuk:
 * - "dinonaktifkan": terdaftar di list Pengguna Kontrak tetapi Aktif = tidak.
 * - "di-luar-domain": bukan akun kantor dan tidak terdaftar.
 * - "tanpa-situs": akun kantor, tetapi SharePoint menolak (403) karena belum punya akses ke situs Kontrak WKI.
 */
export type AlasanTanpaAkses = "dinonaktifkan" | "di-luar-domain" | "tanpa-situs";

export type HasilAkses = { boleh: true; sesi: Sesi } | { boleh: false; alasan: AlasanTanpaAkses };

/** Email berakhiran @domain kantor (tanpa memandang huruf besar/kecil). */
export function adalahEmailKantor(email: string, domain: string): boolean {
  const e = email.trim().toLowerCase();
  const d = domain.trim().toLowerCase().replace(/^@/, "");
  return d !== "" && e.endsWith(`@${d}`) && e.length > d.length + 1;
}

export function tentukanAkses(o: { email: string; nama: string; pengguna: readonly Pengguna[]; adminBawaan: readonly string[]; domain: string }): HasilAkses {
  const email = o.email.trim().toLowerCase();
  const nama = o.nama || email;
  if (!email) return { boleh: false, alasan: "di-luar-domain" };
  const milik = o.pengguna.filter((p) => p.email.trim().toLowerCase() === email);
  const aktif = milik.find((p) => p.aktif);
  if (aktif) {
    return { boleh: true, sesi: { email, nama: aktif.nama || nama, peran: aktif.peran, divisi: aktif.divisi, penggunaId: aktif.id, terdaftar: true } };
  }
  if (milik.length > 0) return { boleh: false, alasan: "dinonaktifkan" };
  if (o.adminBawaan.some((a) => a.trim().toLowerCase() === email)) {
    return { boleh: true, sesi: { email, nama, peran: "Admin", divisi: "IT", penggunaId: null, terdaftar: false } };
  }
  if (adalahEmailKantor(email, o.domain)) {
    return { boleh: true, sesi: { email, nama, peran: "Pengaju", divisi: null, penggunaId: null, terdaftar: false } };
  }
  return { boleh: false, alasan: "di-luar-domain" };
}

/** Akun yang masuk otomatis sebagai Pengaju tanpa divisi. */
export function pengajuTanpaDivisi(sesi: Sesi): boolean {
  return sesi.peran === "Pengaju" && sesi.divisi == null;
}

// --- Divisi pengajuan untuk akun tanpa divisi -------------------------------------------------

const kunciDivisi = (email: string) => `kontrak-divisi-terakhir:${email.toLowerCase()}`;

const adalahDivisiPengaju = (d: unknown): d is DivisiPengaju => typeof d === "string" && (DIVISI_PENGAJU as readonly string[]).includes(d);

/** Divisi yang terakhir dipilih akun ini saat mengajukan, atau null. Aman bila penyimpanan diblokir. */
export function bacaDivisiTerakhir(email: string): DivisiPengaju | null {
  try {
    const d = localStorage.getItem(kunciDivisi(email));
    return adalahDivisiPengaju(d) ? d : null;
  } catch {
    return null;
  }
}

export function ingatDivisiTerakhir(email: string, divisi: DivisiPengaju) {
  try {
    localStorage.setItem(kunciDivisi(email), divisi);
  } catch {
    /* penyimpanan penuh atau diblokir: pilihan hanya tidak diingat */
  }
}

/**
 * Divisi awal di chat dan formulir pengajuan: divisi sesi bila termasuk divisi pengaju; untuk akun
 * tanpa divisi, pilihan terakhirnya; selain itu `cadangan`.
 */
export function divisiAwalPengajuan(sesi: Sesi, cadangan: DivisiPengaju = "SCM"): DivisiPengaju {
  if (adalahDivisiPengaju(sesi.divisi)) return sesi.divisi;
  if (sesi.divisi == null) return bacaDivisiTerakhir(sesi.email) ?? cadangan;
  return cadangan;
}

/** Label divisi untuk tampilan (kartu profil, menu akun). */
export function labelDivisi(sesi: Sesi): string {
  return sesi.divisi ?? "Pengguna";
}
