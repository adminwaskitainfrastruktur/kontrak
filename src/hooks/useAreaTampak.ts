// Area layar yang benar-benar terlihat saat papan ketik layar (ponsel dan tablet) terbuka.
// 100dvh tidak mengecil karena papan ketik: di iOS Safari dan Chrome Android terbaru, kolom jawaban di dasar
// layar penuh (chat pengajuan) tertutup papan ketik. Hook ini mengembalikan tinggi dan posisi atas area
// yang terlihat (visualViewport) selama papan ketik terbuka, dan null selain itu (layar biasa, desktop,
// peramban tanpa visualViewport, atau pengguna sedang mencubit-zoom), sehingga tata letak CSS biasa tetap berlaku.
import { useEffect, useState } from "react";

export interface AreaTampak {
  tinggi: number;
  atas: number;
}

/** Selisih minimal (px) antara tinggi jendela dan area terlihat agar dianggap papan ketik (bukan bilah alamat yang menyusut). */
const AMBANG_PAPAN_KETIK = 120;

export function useAreaTampak(aktif = true): AreaTampak | null {
  const [area, setArea] = useState<AreaTampak | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!aktif || !vv) {
      setArea(null);
      return;
    }
    const baca = () => {
      const terbuka = window.innerHeight - vv.height > AMBANG_PAPAN_KETIK && vv.scale <= 1.01;
      setArea((lama) => {
        if (!terbuka) return null;
        const tinggi = Math.round(vv.height);
        const atas = Math.round(vv.offsetTop);
        return lama && lama.tinggi === tinggi && lama.atas === atas ? lama : { tinggi, atas };
      });
    };
    baca();
    vv.addEventListener("resize", baca);
    vv.addEventListener("scroll", baca);
    return () => {
      vv.removeEventListener("resize", baca);
      vv.removeEventListener("scroll", baca);
    };
  }, [aktif]);
  return area;
}
