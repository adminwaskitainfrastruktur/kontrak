// Pembungkus tabel lebar: menggulir ke samping di dalam kartunya dan menampilkan pudaran di tepi kiri/kanan
// selama masih ada kolom di luar layar, supaya pengguna tahu tabelnya bisa digeser. Pudaran hanya dekorasi
// (tidak menangkap sentuhan) dan hilang sendiri saat gulir sudah di ujung.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";

const pudar = (arah: "kanan" | "kiri") => ({
  background: `linear-gradient(to ${arah === "kanan" ? "left" : "right"}, color-mix(in srgb, var(--wh-ink) 22%, transparent), transparent)`,
});

export default function WadahGulir({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ada, setAda] = useState({ kiri: false, kanan: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const hitung = () => {
      const kiri = el.scrollLeft > 4;
      const kanan = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setAda((l) => (l.kiri === kiri && l.kanan === kanan ? l : { kiri, kanan }));
    };
    hitung();
    el.addEventListener("scroll", hitung, { passive: true });
    const pantau = typeof ResizeObserver !== "undefined" ? new ResizeObserver(hitung) : null;
    pantau?.observe(el);
    if (el.firstElementChild) pantau?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", hitung);
      pantau?.disconnect();
    };
  }, []);

  return (
    <div className={cx("kartu relative overflow-hidden", className)}>
      <div ref={ref} className="overflow-x-auto">
        {children}
      </div>
      <span aria-hidden="true" style={pudar("kiri")} className={cx("pointer-events-none absolute inset-y-0 left-0 z-10 w-10 transition-opacity duration-200", ada.kiri ? "opacity-100" : "opacity-0")} />
      <span aria-hidden="true" style={pudar("kanan")} className={cx("pointer-events-none absolute inset-y-0 right-0 z-10 w-10 transition-opacity duration-200", ada.kanan ? "opacity-100" : "opacity-0")} />
    </div>
  );
}
