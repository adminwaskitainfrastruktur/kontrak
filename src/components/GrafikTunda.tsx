// Penunda grafik (U39). Grafik recharts dimuat lewat React.lazy (chunk "grafik" di vite.config.ts), dan
// impornya baru dimulai SETELAH halaman sempat tampil sekali, supaya ubin KPI dan daftar tidak berebut
// jaringan dan CPU dengan pustaka grafik. Selama menunggu, kerangka seukuran grafik dipasang agar tata
// letak tidak melompat.
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Kerangka, cx } from "./ui";

/** true setelah satu frame tergambar (KPI sudah tampil). */
export function useSetelahTampil(): boolean {
  const [siap, setSiap] = useState(false);
  useEffect(() => {
    let t = 0;
    const raf = requestAnimationFrame(() => {
      t = window.setTimeout(() => setSiap(true), 0);
    });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, []);
  return siap;
}

/** Bungkus grafik malas. `children` berisi komponen React.lazy; kerangka mengisi wadah induknya. */
export function GrafikTunda({ children, className }: { children: ReactNode; className?: string }) {
  const siap = useSetelahTampil();
  const kerangka = <Kerangka className={cx("h-full w-full", className ?? "rounded-2xl")} />;
  return siap ? <Suspense fallback={kerangka}>{children}</Suspense> : kerangka;
}
