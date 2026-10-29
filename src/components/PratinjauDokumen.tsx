// Laci pratinjau PDF dan gambar (U16). Isi berkas diambil sebagai Blob lewat Graph, ditampilkan dari URL
// objek (iframe untuk PDF, img untuk gambar), lalu URL objek dilepas saat laci ditutup. Office, berkas di
// atas 25 MB, dan PDF di iPhone/iPad dibuka di tab SharePoint (lihat modePratinjau di lib/jenisBerkas).
//
// Butuh CSP: frame-src harus memuat blob: (lihat public/.htaccess).
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, ExternalLink, X } from "lucide-react";
import { graphBlob } from "../services/dokumen";
import { BATAS_PRATINJAU, modePratinjau, teksUkuran, tipeMimeGambar } from "../lib/jenisBerkas";
import type { Dokumen } from "../lib/types";
import { pegas, pegasLembut, tekan } from "../lib/gerak";
import { useLapisan } from "../lib/lapisan";
import { IkonBerkas } from "./UnggahDokumen";
import { KotakError, Memuat, MotionLapisan, Tombol, cx } from "./ui";

/** iPhone, iPad, dan iPad yang mengaku Mac (layar sentuh). */
export function adalahIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Cara pratinjau untuk dokumen ini di peramban sekarang. */
export function caraPratinjau(d: Pick<Dokumen, "nama" | "ukuran">) {
  return modePratinjau(d.nama, d.ukuran, { ios: adalahIos() });
}

const bukaTab = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

type Keadaan = { tahap: "memuat"; persen: number } | { tahap: "siap"; url: string } | { tahap: "galat"; error: unknown };

/**
 * Pasang hanya saat ada dokumen yang dipratinjau. Bila dokumen tidak cocok untuk laci, berkas dibuka
 * di tab baru dan `onTutup` langsung dipanggil (sebaiknya pemanggil memeriksa caraPratinjau lebih dulu
 * supaya tab dibuka langsung dari klik dan tidak diblokir peramban).
 */
export default function PratinjauDokumen({ dokumen, onTutup }: { dokumen: Dokumen; onTutup: () => void }) {
  const cara = caraPratinjau(dokumen);
  const [buka, setBuka] = useState(cara.mode !== "tab");
  const [keadaan, setKeadaan] = useState<Keadaan>({ tahap: "memuat", persen: 0 });
  const tutupRef = useRef<HTMLButtonElement>(null);
  const laciRef = useRef<HTMLDivElement>(null);
  const tutup = useCallback(() => setBuka(false), []);

  useEffect(() => {
    if (cara.mode !== "tab") return;
    bukaTab(dokumen.webUrl);
    onTutup();
    // Hanya saat dokumen berganti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dokumen.id]);

  // Ambil isi berkas sekali per dokumen; URL objek dilepas saat laci ditutup atau dokumen berganti.
  useEffect(() => {
    if (cara.mode === "tab") return;
    const henti = new AbortController();
    let url: string | null = null;
    setKeadaan({ tahap: "memuat", persen: 0 });
    graphBlob(dokumen.id, { batas: BATAS_PRATINJAU, signal: henti.signal, onProgres: (persen) => setKeadaan({ tahap: "memuat", persen }) })
      .then((blob) => {
        if (henti.signal.aborted) return;
        const tipe = cara.mode === "pdf" ? "application/pdf" : tipeMimeGambar(dokumen.nama);
        url = URL.createObjectURL(blob.type === tipe ? blob : new Blob([blob], { type: tipe }));
        setKeadaan({ tahap: "siap", url });
      })
      .catch((error: unknown) => {
        if (!henti.signal.aborted) setKeadaan({ tahap: "galat", error });
      });
    return () => {
      henti.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [dokumen.id, dokumen.nama, cara.mode]);

  // Escape dan jebakan fokus lewat tumpukan lapisan bersama: hanya laci ini yang tertutup, bukan juga modal atau
  // palet di bawahnya. Fokus masuk ke tombol tutup dan kembali ke pemicu saat laci tertutup.
  useLapisan(buka && cara.mode !== "tab", tutup, { wadah: laciRef, jebakFokus: true });

  if (cara.mode === "tab") return null;

  return (
    <AnimatePresence onExitComplete={onTutup}>
      {buka && (
        <MotionLapisan className="fixed inset-0 z-50 flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16 } }}>
          <div className="latar-modal absolute inset-0" onPointerDown={tutup} aria-hidden="true" />
          <motion.div
            ref={laciRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-label={`Pratinjau ${dokumen.nama}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%", transition: { duration: 0.2 } }}
            transition={pegasLembut}
            className="relative flex h-full w-full flex-col bg-surface pb-[env(safe-area-inset-bottom)] shadow-pop sm:max-w-2xl sm:rounded-l-[26px] lg:max-w-4xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
              <IkonBerkas nama={dokumen.nama} kecil />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold" title={dokumen.nama}>
                  {dokumen.nama}
                </p>
                <p className="text-xs text-muted">
                  {teksUkuran(dokumen.ukuran)}
                  {keadaan.tahap === "memuat" && ` · memuat ${keadaan.persen}%`}
                </p>
              </div>
              {keadaan.tahap === "siap" && (
                <a href={keadaan.url} download={dokumen.nama} className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-raised hover:text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" title="Unduh">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">Unduh {dokumen.nama}</span>
                </a>
              )}
              <a href={dokumen.webUrl} target="_blank" rel="noreferrer" className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-raised hover:text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" title="Buka di SharePoint">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Buka di SharePoint</span>
              </a>
              <motion.button ref={tutupRef} data-fokus-awal whileHover={{ rotate: 90 }} whileTap={tekan} transition={pegas} onClick={tutup} className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink [@media(pointer:fine)]:h-9 [@media(pointer:fine)]:w-9" aria-label="Tutup pratinjau">
                <X className="h-5 w-5" />
              </motion.button>
            </div>

            <div className={cx("relative min-h-0 flex-1 bg-raised", cara.mode === "gambar" && "overflow-auto")}>
              {keadaan.tahap === "memuat" && (
                <div className="absolute inset-0 grid place-items-center" role="status">
                  <div className="w-full max-w-xs px-6">
                    <Memuat teks="Menyiapkan pratinjau…" />
                    <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                      <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${keadaan.persen}%` }} transition={{ duration: 0.2 }} />
                    </div>
                  </div>
                </div>
              )}
              {keadaan.tahap === "galat" && (
                <div className="p-5">
                  <KotakError error={keadaan.error} />
                  <div className="mt-4 flex justify-center">
                    <Tombol varian="kedua" ikon={<ExternalLink className="h-4 w-4" />} onClick={() => bukaTab(dokumen.webUrl)}>
                      Buka di SharePoint saja
                    </Tombol>
                  </div>
                </div>
              )}
              {keadaan.tahap === "siap" &&
                (cara.mode === "pdf" ? (
                  <iframe src={keadaan.url} title={`Isi ${dokumen.nama}`} className="h-full w-full border-0" />
                ) : (
                  <div className="flex min-h-full items-center justify-center p-4">
                    <img src={keadaan.url} alt={dokumen.nama} className="max-h-full max-w-full rounded-xl object-contain shadow-card" />
                  </div>
                ))}
            </div>
          </motion.div>
        </MotionLapisan>
      )}
    </AnimatePresence>
  );
}
