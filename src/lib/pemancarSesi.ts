// Kabar sesi lintas komponen tanpa context: graph() memancarkan "perlu login" saat token tidak bisa
// diperbarui diam-diam, dan masukUlang() memancarkan "sesi pulih" setelah pengguna masuk lagi.
// Pita sesi, KotakError, dan PantauProvider mendengarkan keduanya, jadi halaman tidak perlu
// meneruskan apa pun lewat props.
import { useEffect, useRef } from "react";

type Pendengar = () => void;

function buatPemancar() {
  const daftar = new Set<Pendengar>();
  return {
    dengar(fn: Pendengar): () => void {
      daftar.add(fn);
      return () => void daftar.delete(fn);
    },
    pancar() {
      // Salinan: pendengar boleh berhenti mendengar saat dipanggil.
      for (const fn of [...daftar]) {
        try {
          fn();
        } catch (err) {
          console.error(err);
        }
      }
    },
    get jumlah() {
      return daftar.size;
    },
  };
}

const perluLogin = buatPemancar();
const sesiPulih = buatPemancar();
let berakhir = false;

/** Sesi Microsoft sedang berakhir (sudah ada permintaan yang gagal karena token, belum masuk ulang). */
export function sesiSedangBerakhir(): boolean {
  return berakhir;
}

export function kabarkanPerluLogin() {
  // Puluhan permintaan bisa gagal bersamaan; cukup dikabarkan sekali sampai sesi pulih.
  if (berakhir) return;
  berakhir = true;
  perluLogin.pancar();
}

export function kabarkanSesiPulih() {
  berakhir = false;
  sesiPulih.pancar();
}

export const dengarPerluLogin = (fn: Pendengar) => perluLogin.dengar(fn);
export const dengarSesiPulih = (fn: Pendengar) => sesiPulih.dengar(fn);

/**
 * Jalankan `fn` setiap kali sesi dipulihkan (mis. muat ulang data halaman). `null` berarti tidak
 * mendengarkan. Fungsi terbaru selalu dipakai tanpa memasang ulang pendengar.
 */
export function useSaatSesiPulih(fn: (() => void) | null) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  const aktif = fn != null;
  useEffect(() => {
    if (!aktif) return;
    return dengarSesiPulih(() => ref.current?.());
  }, [aktif]);
}
