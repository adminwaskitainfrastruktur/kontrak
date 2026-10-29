import { useEffect, useState } from "react";

/** Tema terang/gelap lewat kelas `dark` pada <html>. Terang adalah tema utama; pilihan gelap diingat di peramban ini. */
export function useTema() {
  const [gelap, setGelap] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", gelap);
    try {
      localStorage.setItem("kontrak-tema", gelap ? "gelap" : "terang");
    } catch {
      /* penyimpanan diblokir: tema tetap berlaku untuk sesi ini */
    }
  }, [gelap]);
  return [gelap, () => gantiMulus(setGelap)] as const;
}

/**
 * Ganti tema dengan peralihan halus. Peramban yang mendukung View Transitions (Chrome, Edge, Safari 18+) memotret
 * halaman lama dan baru lalu memudarkannya di GPU, murah di ponsel. Peramban lain memakai kelas `ganti-tema`
 * (styles.css) yang menganimasikan warna selama sekejap. Pengguna yang meminta gerak dikurangi langsung berganti.
 */
function gantiMulus(setGelap: (nilai: boolean) => void) {
  const html = document.documentElement;
  const berikut = !html.classList.contains("dark");
  const terapkan = () => {
    html.classList.toggle("dark", berikut);
    setGelap(berikut);
  };
  const kurangiGerak = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mulai = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  if (kurangiGerak) {
    terapkan();
  } else if (typeof mulai === "function") {
    mulai.call(document, terapkan);
  } else {
    html.classList.add("ganti-tema");
    terapkan();
    window.setTimeout(() => html.classList.remove("ganti-tema"), 450);
  }
}
