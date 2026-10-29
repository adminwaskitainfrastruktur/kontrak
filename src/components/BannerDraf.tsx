// Banner "Ada draf pengajuan yang belum dikirim" (U08) dan hook penyimpan draf untuk chat dan formulir.
// Draf hidup di peramban ini saja (lib/draf): lampiran hanya namanya, isinya harus dilampirkan ulang.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FileClock, Paperclip, RotateCcw, Play } from "lucide-react";
import { useRuang } from "../context/RuangContext";
import { useSesi } from "../context/SesiContext";
import { bacaDraf, buatPenyimpanTunda, bungkusDraf, drafBermakna, drafCocok, hapusDraf, kunciDraf, teksLampirkanUlang, teksUmurDraf, type Draf, type SumberDraf } from "../lib/draf";
import { EASE_KELUAR } from "../lib/gerak";
import { Tombol, cx } from "./ui";

// --- Hook ---------------------------------------------------------------------------------

export interface EkstraDraf {
  /** Langkah chat yang sudah terjawab. */
  terjawab?: Iterable<string>;
  /** Lampiran yang sedang dipilih (File) atau namanya. Isinya TIDAK disimpan. */
  berkas?: readonly (string | { name: string; size: number })[];
}

export interface DrafPengajuan<T> {
  /** Draf yang ditawarkan untuk dilanjutkan (konteks sama), atau null. Tampilkan BannerDraf selama tidak null. */
  tawaran: Draf<T> | null;
  /** Simpan isian sekarang (dengan jeda). Diabaikan selama tawaran belum dijawab, supaya draf lama tidak tertimpa. */
  simpan: (data: T, ekstra?: EkstraDraf) => void;
  /** Ambil draf yang ditawarkan untuk dimuat ke halaman, lalu sembunyikan banner. */
  lanjutkan: () => Draf<T> | null;
  /** "Mulai baru": hapus draf yang ditawarkan. */
  mulaiBaru: () => void;
  /** Hapus draf dan berhenti menyimpan. Panggil SEGERA setelah buatKontrak berhasil. */
  hapus: () => void;
}

/**
 * Penyimpan draf pengajuan untuk satu halaman (chat atau formulir). Kunci memuat email dan ruang;
 * `konteks` (lihat konteksDraf) mencegah draf addendum ditawarkan di halaman pengajuan biasa.
 */
export function useDrafPengajuan<T>(opsi: { sumber: SumberDraf; konteks: string; nonaktif?: boolean }): DrafPengajuan<T> {
  const { sesi } = useSesi();
  const { ruang } = useRuang();
  const { sumber, konteks, nonaktif } = opsi;
  const kunci = useMemo(() => kunciDraf(sesi.email, ruang, sumber), [sesi.email, ruang, sumber]);
  const [tawaran, setTawaran] = useState<Draf<T> | null>(() => {
    if (nonaktif) return null;
    const d = bacaDraf<T>(kunci);
    return d && drafCocok(d, konteks) ? d : null;
  });
  const menunggu = useRef(tawaran != null);
  // Draf kosong hanya menghapus draf yang ditulis halaman ini, bukan draf konteks lain di slot yang sama.
  const pernahSimpan = useRef(false);
  // Setelah pengajuan terkirim, isian yang masih ada di layar tidak boleh menulis draf lagi.
  const terkirim = useRef(false);
  const penyimpan = useMemo(() => buatPenyimpanTunda<T>(kunci), [kunci]);

  useEffect(() => {
    const segera = () => penyimpan.segera();
    const saatTersembunyi = () => document.visibilityState === "hidden" && penyimpan.segera();
    window.addEventListener("pagehide", segera);
    document.addEventListener("visibilitychange", saatTersembunyi);
    return () => {
      window.removeEventListener("pagehide", segera);
      document.removeEventListener("visibilitychange", saatTersembunyi);
      penyimpan.segera();
    };
  }, [penyimpan]);

  const simpan = useCallback(
    (data: T, ekstra: EkstraDraf = {}) => {
      if (nonaktif || menunggu.current || terkirim.current) return;
      if (!drafBermakna(data, ekstra.terjawab ?? [])) {
        if (pernahSimpan.current) penyimpan.jadwalkan(null);
        return;
      }
      pernahSimpan.current = true;
      penyimpan.jadwalkan(bungkusDraf({ sumber, data, terjawab: ekstra.terjawab, berkas: ekstra.berkas, konteks }));
    },
    [nonaktif, penyimpan, sumber, konteks],
  );

  const lanjutkan = useCallback(() => {
    const d = tawaran;
    menunggu.current = false;
    pernahSimpan.current = d != null;
    setTawaran(null);
    return d;
  }, [tawaran]);

  const mulaiBaru = useCallback(() => {
    penyimpan.batal();
    hapusDraf(kunci);
    menunggu.current = false;
    pernahSimpan.current = false;
    setTawaran(null);
  }, [penyimpan, kunci]);

  const hapus = useCallback(() => {
    terkirim.current = true;
    mulaiBaru();
  }, [mulaiBaru]);

  return { tawaran, simpan, lanjutkan, mulaiBaru, hapus };
}

// --- Banner -------------------------------------------------------------------------------

export interface PropsBannerDraf {
  draf: Pick<Draf<unknown>, "disimpan" | "berkas" | "data"> | null;
  onLanjutkan: () => void;
  onMulaiBaru: () => void;
  /** Catatan tambahan, mis. hasil validasiUlangDraf ("Kontrak induk sudah berakhir..."). */
  catatan?: string[];
  className?: string;
}

function judulDraf(data: unknown): string {
  if (typeof data !== "object" || data === null) return "";
  const j = (data as Record<string, unknown>).judul;
  return typeof j === "string" ? j.trim() : "";
}

export default function BannerDraf({ draf, onLanjutkan, onMulaiBaru, catatan = [], className }: PropsBannerDraf) {
  const kurangiGerak = useReducedMotion();
  const [yakin, setYakin] = useState(false);
  const [sekarang, setSekarang] = useState(() => Date.now());
  const idJudul = useId();

  useEffect(() => {
    if (!draf) return;
    const t = window.setInterval(() => setSekarang(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, [draf]);

  const judul = draf ? judulDraf(draf.data) : "";
  const lampiran = draf ? teksLampirkanUlang(draf.berkas) : "";

  return (
    <AnimatePresence initial={!kurangiGerak}>
      {draf && (
        <motion.section
          key="banner-draf"
          role="region"
          aria-labelledby={idJudul}
          initial={kurangiGerak ? { opacity: 0 } : { opacity: 0, y: -10, height: 0 }}
          animate={kurangiGerak ? { opacity: 1 } : { opacity: 1, y: 0, height: "auto" }}
          exit={kurangiGerak ? { opacity: 0 } : { opacity: 0, y: -6, height: 0, transition: { duration: 0.18 } }}
          transition={{ duration: 0.36, ease: EASE_KELUAR }}
          className={cx("overflow-hidden", className)}
        >
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-accent-soft p-4 sm:flex-row sm:items-center">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-accent-ink shadow-sm" aria-hidden="true">
              <FileClock className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p id={idJudul} className="font-semibold text-ink">
                Ada draf pengajuan yang belum dikirim <span className="font-normal text-muted">(disimpan {teksUmurDraf(draf.disimpan, sekarang)})</span>
              </p>
              {judul && (
                <p className="mt-0.5 truncate text-muted" title={judul}>
                  “{judul}”
                </p>
              )}
              {lampiran && (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-accent-ink">
                  <Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {lampiran}
                </p>
              )}
              {catatan.map((c) => (
                <p key={c} className="mt-1 text-xs text-muted">
                  {c}
                </p>
              ))}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 [&>button]:flex-1 sm:[&>button]:flex-none" aria-live="polite">
              {yakin ? (
                <>
                  <span className="w-full text-xs text-muted sm:w-auto">Draf ini akan dihapus dari perangkat. Yakin?</span>
                  <Tombol kecil varian="bahaya" ikon={<RotateCcw className="h-3.5 w-3.5" />} onClick={onMulaiBaru}>
                    Ya, mulai baru
                  </Tombol>
                  <Tombol kecil varian="hantu" onClick={() => setYakin(false)}>
                    Batal
                  </Tombol>
                </>
              ) : (
                <>
                  <Tombol kecil ikon={<Play className="h-3.5 w-3.5" />} onClick={onLanjutkan}>
                    Lanjutkan
                  </Tombol>
                  <Tombol kecil varian="kedua" onClick={() => setYakin(true)}>
                    Mulai baru
                  </Tombol>
                </>
              )}
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
