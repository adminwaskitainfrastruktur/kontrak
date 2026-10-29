// Permintaan tanda tangan, dibagi lewat satu penyimpanan di memori: lencana menu, halaman daftar, dan halaman
// detail selalu sepakat. Dimuat sekali per akun, disegarkan tiap 5 menit dan saat jendela kembali aktif.
// Bila list belum bisa dibaca, hasilnya kosong (aplikasi tetap berjalan) dan galatnya tersedia di `galat`.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { menungguSaya, type PermintaanTtd } from "../lib/penandatangan";
import { ambilSemuaPermintaan } from "../services/tandaTangan";

interface Keadaan {
  semua: readonly PermintaanTtd[];
  siap: boolean;
  memuat: boolean;
  galat: unknown;
}

let keadaan: Keadaan = { semua: [], siap: false, memuat: false, galat: null };
const pendengar = new Set<() => void>();
const SEGARKAN_MS = 5 * 60 * 1000;
let terakhir = 0;

function ubah(baru: Partial<Keadaan>) {
  keadaan = { ...keadaan, ...baru };
  for (const fn of pendengar) fn();
}

export async function muatPermintaanTtd(paksa = false): Promise<void> {
  if (keadaan.memuat) return;
  if (!paksa && Date.now() - terakhir < 15_000) return;
  ubah({ memuat: true });
  try {
    const semua = await ambilSemuaPermintaan();
    terakhir = Date.now();
    ubah({ semua, siap: true, memuat: false, galat: null });
  } catch (err) {
    ubah({ siap: true, memuat: false, galat: err });
  }
}

/** Ganti satu permintaan di penyimpanan setelah diubah di layar (tanpa memuat ulang semuanya). */
export function terapkanPermintaan(p: PermintaanTtd): void {
  const lain = keadaan.semua.filter((x) => x.itemId !== p.itemId);
  ubah({ semua: [p, ...lain].sort((a, b) => b.itemId - a.itemId) });
}

const langganan = (fn: () => void) => {
  pendengar.add(fn);
  return () => void pendengar.delete(fn);
};
const cuplikan = () => keadaan;

export function useTtdSaya(email: string, aktif = true) {
  useEffect(() => {
    if (!aktif || !email) return undefined;
    void muatPermintaanTtd();
    const jam = window.setInterval(() => void muatPermintaanTtd(true), SEGARKAN_MS);
    const saatKembali = () => document.visibilityState === "visible" && void muatPermintaanTtd();
    document.addEventListener("visibilitychange", saatKembali);
    return () => {
      window.clearInterval(jam);
      document.removeEventListener("visibilitychange", saatKembali);
    };
  }, [email, aktif]);
  const k = useSyncExternalStore(langganan, cuplikan);
  const muatUlang = useCallback(() => muatPermintaanTtd(true), []);
  const menunggu = menungguSaya(k.semua, email);
  return { semua: k.semua, menunggu, jumlahMenunggu: menunggu.length, siap: k.siap, memuat: k.memuat, galat: k.galat, muatUlang };
}
