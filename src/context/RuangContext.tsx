// Dua ruang aplikasi:
//   Ruang Admin    (Admin, Legal, Pemantau): dashboard, semua kontrak, pengguna. Alamat di bawah "/".
//   Ruang Pengguna (semua yang boleh mengajukan): ajukan kontrak dan pantau pengajuan sendiri. Alamat di bawah "/saya".
// Pengaju hanya punya Ruang Pengguna; rute Ruang Admin tidak didaftarkan untuknya sama sekali (lihat App.tsx).
// Admin dan Legal bisa berpindah ke Ruang Pengguna lewat tombol tukar ruang di sidebar.
//
// Halaman yang dipakai kedua ruang (detail, chat, formulir) membuat tautan lewat useRuang(), supaya tetap
// berada di ruang yang sama.
import { createContext, useContext, type ReactNode } from "react";
import { bisaAjukan } from "../lib/alur";
import { PARAM_SALIN } from "../lib/serupa";
import type { Sesi } from "../lib/types";

export type Ruang = "admin" | "pengguna";

export const DASAR_PENGGUNA = "/saya";

export function bolehRuangAdmin(sesi: Sesi): boolean {
  return sesi.peran !== "Pengaju";
}

export function bolehRuangPengguna(sesi: Sesi): boolean {
  return bisaAjukan(sesi);
}

export function ruangDariAlamat(pathname: string): Ruang {
  return pathname === DASAR_PENGGUNA || pathname.startsWith(`${DASAR_PENGGUNA}/`) ? "pengguna" : "admin";
}

export interface Rute {
  beranda: string;
  ajukan: string;
  formulir: string;
  detail: (id: number) => string;
  ubah: (id: number) => string;
  ajukanAddendum: (idInduk: number) => string;
  ajukanTurunan: (idMou: number) => string;
  /** Pengajuan baru yang diisi awal dari kontrak lain (jenis, mitra, mata uang). */
  ajukanSerupa: (idSumber: number) => string;
  /** Halaman tanda tangan digital: daftar (tanpa id) atau satu kontrak. */
  tandaTangan: (idKontrak?: number) => string;
}

const RUTE: Record<Ruang, Rute> = {
  admin: {
    beranda: "/",
    ajukan: "/kontrak/baru",
    formulir: "/kontrak/baru/formulir",
    detail: (id) => `/kontrak/${id}`,
    ubah: (id) => `/kontrak/${id}/ubah`,
    ajukanAddendum: (id) => `/kontrak/baru?induk=${id}`,
    ajukanTurunan: (id) => `/kontrak/baru?mou=${id}`,
    ajukanSerupa: (id) => `/kontrak/baru?${PARAM_SALIN}=${id}`,
    tandaTangan: (id) => (id == null ? "/tanda-tangan" : `/tanda-tangan/${id}`),
  },
  pengguna: {
    beranda: DASAR_PENGGUNA,
    ajukan: `${DASAR_PENGGUNA}/ajukan`,
    formulir: `${DASAR_PENGGUNA}/ajukan/formulir`,
    detail: (id) => `${DASAR_PENGGUNA}/kontrak/${id}`,
    ubah: (id) => `${DASAR_PENGGUNA}/kontrak/${id}/ubah`,
    ajukanAddendum: (id) => `${DASAR_PENGGUNA}/ajukan?induk=${id}`,
    ajukanTurunan: (id) => `${DASAR_PENGGUNA}/ajukan?mou=${id}`,
    ajukanSerupa: (id) => `${DASAR_PENGGUNA}/ajukan?${PARAM_SALIN}=${id}`,
    tandaTangan: (id) => (id == null ? `${DASAR_PENGGUNA}/tanda-tangan` : `${DASAR_PENGGUNA}/tanda-tangan/${id}`),
  },
};

const RuangContext = createContext<Ruang>("admin");

export function RuangProvider({ ruang, children }: { ruang: Ruang; children: ReactNode }) {
  return <RuangContext.Provider value={ruang}>{children}</RuangContext.Provider>;
}

export function useRuang(): { ruang: Ruang; ke: Rute } {
  const ruang = useContext(RuangContext);
  return { ruang, ke: RUTE[ruang] };
}
