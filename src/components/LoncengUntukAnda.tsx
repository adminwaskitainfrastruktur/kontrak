// Lonceng Ruang Admin untuk Legal dan Admin (U26): panel "Untuk Anda" berisi pengajuan baru, kontrak
// yang ditugaskan kepada Anda, serta perubahan status, komentar, sebutan, dokumen, dan pengingat pada
// kontrak yang Anda pegang. Datanya dari PantauProvider (diperbarui tiap 2,5 menit, saat tab kembali
// dilihat, dan setelah aksi tulis). Angka merah = kabar yang belum dibaca; jumlah kontrak yang
// menunggu tindakan ditampilkan di baris teratas panel dan membuka preset "Antrean saya".
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ArrowLeftRight, ArrowRight, AtSign, Bell, BellRing, FileText, Inbox, MessageSquare, UserCheck } from "lucide-react";
import { usePantau } from "../context/PantauContext";
import { kueriPreset } from "../lib/filterKerja";
import { formatJam, formatRelatif } from "../lib/format";
import { EASE_KELUAR, pegas, pegasLembut } from "../lib/gerak";
import type { JenisKabar, Kabar } from "../lib/kabar";
import { useLapisan } from "../lib/lapisan";
import { cx } from "./ui";

const IKON_JENIS: Record<JenisKabar, typeof Bell> = {
  baru: Inbox,
  tugas: UserCheck,
  alih: ArrowLeftRight,
  status: Activity,
  komentar: MessageSquare,
  sebut: AtSign,
  dokumen: FileText,
  pengingat: BellRing,
};

const WARNA_NADA: Record<Kabar["nada"], string> = {
  info: "bg-info-soft text-info",
  sukses: "bg-success-soft text-success",
  peringatan: "bg-accent-soft text-accent-ink",
  bahaya: "bg-danger-soft text-danger",
};

/** Angka kecil di pojok tombol lonceng. */
export function LencanaAngka({ n }: { n: number }) {
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.span key="lencana" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={pegasLembut} className="denyut absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-danger-on" aria-hidden="true">
          {n > 99 ? "99+" : n}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** Kalimat ringkas untuk label tombol dan pengumuman pembaca layar. */
export function teksLoncengAdmin(baru: number, menunggu: number): string {
  const a = baru ? `${baru} kabar baru untuk Anda` : "Tidak ada kabar baru";
  const b = menunggu ? `${menunggu} kontrak menunggu tindakan Anda` : "antrean Anda bersih";
  return `${a}, ${b}`;
}

export default function LoncengUntukAnda() {
  const { untukAnda, belumDibacaUntukAnda, tandaiDibacaUntukAnda, menungguSaya, terakhir } = usePantau();
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const idPanel = useId();
  // Kabar ditandai dibaca saat panel ditutup, supaya yang baru tetap tebal selama panel terbuka.
  const tutup = useCallback(() => {
    setBuka(false);
    tandaiDibacaUntukAnda();
  }, [tandaiDibacaUntukAnda]);
  useLapisan(buka, tutup);

  // Klik atau sentuhan di luar panel menutupnya.
  useEffect(() => {
    if (!buka) return;
    const klikLuar = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) tutup();
    };
    window.addEventListener("pointerdown", klikLuar);
    return () => window.removeEventListener("pointerdown", klikLuar);
  }, [buka, tutup]);

  const n = belumDibacaUntukAnda;
  const menunggu = menungguSaya.length;
  const label = teksLoncengAdmin(n, menunggu);

  return (
    <div ref={ref} className="max-sm:static sm:relative">
      <motion.button
        whileTap={{ scale: 0.92 }}
        transition={pegas}
        onClick={() => (buka ? tutup() : setBuka(true))}
        className={cx("relative grid h-11 w-11 place-items-center rounded-xl transition-colors hover:bg-raised hover:text-ink", buka ? "bg-raised text-ink" : "text-muted")}
        aria-label={label}
        aria-expanded={buka}
        aria-controls={idPanel}
      >
        <motion.span animate={n ? { rotate: [0, -14, 12, -8, 6, 0] } : { rotate: 0 }} transition={{ duration: 0.8, repeat: n ? Infinity : 0, repeatDelay: 4 }}>
          <Bell className="h-5 w-5" aria-hidden="true" />
        </motion.span>
        <LencanaAngka n={n} />
      </motion.button>
      <span className="sr-only" role="status" aria-atomic="true">
        {n ? `${n} kabar baru untuk Anda` : ""}
      </span>

      <AnimatePresence>
        {buka && (
          <motion.div
            id={idPanel}
            role="region"
            aria-label="Untuk Anda"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.12 } }}
            transition={pegasLembut}
            style={{ transformOrigin: "top right" }}
            // Ponsel: selebar bilah atas (wadahnya statis); sm ke atas: menggantung di bawah lonceng.
            className="maks-h-panel absolute inset-x-0 top-full z-40 mt-2 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop sm:left-auto sm:right-0 sm:w-[24rem]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="font-bold">Untuk Anda</p>
                <p className="text-xs text-muted">{terakhir ? `Diperbarui pukul ${formatJam(terakhir.toISOString())} · tiap 2,5 menit` : "Diperbarui tiap 2,5 menit"}</p>
              </div>
              {n > 0 && (
                <button type="button" onClick={tandaiDibacaUntukAnda} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-semibold text-brand transition-colors hover:text-brand-strong">
                  Tandai dibaca
                </button>
              )}
            </div>

            <Link to={`/kontrak${kueriPreset("antrean-saya")}`} onClick={tutup} className="group flex min-h-11 items-center gap-3 border-b border-line bg-raised px-4 py-3 transition-colors hover:bg-brand-soft sm:px-5">
              <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl", menunggu ? "bg-brand text-brand-on" : "bg-surface text-muted")}>
                <Inbox className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold">{menunggu ? `${menunggu} kontrak menunggu tindakan Anda` : "Antrean Anda bersih"}</span>
                <span className="block text-xs text-muted">Pengajuan baru, review, dan tanda tangan yang Anda pegang</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>

            <DaftarUntukAnda kabar={untukAnda.slice(0, 15)} onPilih={tutup} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DaftarUntukAnda({ kabar, onPilih }: { kabar: Kabar[]; onPilih: () => void }) {
  if (kabar.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted">Belum ada kabar baru. Pengajuan baru, penugasan, serta komentar dan dokumen pada kontrak yang Anda pegang akan muncul di sini.</p>;
  }
  return (
    <ul className="scroll-halus max-h-[min(22rem,60vh)] divide-y divide-line overflow-y-auto">
      {kabar.map((b, i) => {
        const Ikon = IKON_JENIS[b.jenis ?? "status"];
        return (
          <motion.li key={b.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.3, ease: EASE_KELUAR }}>
            <Link to={`/kontrak/${b.kontrakId}`} onClick={onPilih} className="group flex gap-3 px-4 py-3 transition-colors hover:bg-raised sm:px-5">
              <span className={cx("relative mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", WARNA_NADA[b.nada])}>
                <Ikon className="h-4 w-4" aria-hidden="true" />
                {!b.dibaca && <span className="denyut absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface" aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block truncate text-sm", b.dibaca ? "font-medium" : "font-bold")}>
                  {!b.dibaca && <span className="sr-only">Baru: </span>}
                  {b.judul}
                </span>
                <span className="block break-words text-sm text-muted">{b.teks}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  <span className="font-mono">{b.nomor}</span> · {formatRelatif(b.waktu)}
                </span>
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            </Link>
          </motion.li>
        );
      })}
    </ul>
  );
}
