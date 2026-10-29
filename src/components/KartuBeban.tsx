// Kartu ringkas "Beban tim" untuk Dashboard Legal (U02). Setiap baris membuka Daftar Kontrak terfilter
// ?pic=email. Legal/Admin bisa mengalihkan semua kontrak seorang staf (pengganti delegasi saat cuti).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRightLeft, ChevronRight, Sparkles, Users } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useMuat } from "../hooks/useMuat";
import { adalahLegal } from "../lib/alur";
import { bebanTim, saranPic, type BebanStaf } from "../lib/beban";
import { hitungPreset, kueriPreset } from "../lib/filterKerja";
import { lamaSejak } from "../lib/format";
import { EASE_KELUAR } from "../lib/gerak";
import type { Kontrak } from "../lib/types";
import { ambilSemuaKontrak } from "../services/kontrak";
import { ModalAlihSemua } from "./TugaskanPic";
import { Avatar, Kerangka, Kosong, KotakError, cx } from "./ui";

export interface PropsKartuBeban {
  /** Semua kontrak. Bila kosong, kartu memuat sendiri (memakai cache service). */
  semua?: Kontrak[];
  /** Alamat daftar kontrak dengan kueri, bawaan "/kontrak?pic=...". */
  keDaftar?: (kueri: string) => string;
  /** Dipanggil setelah alih massal selesai, supaya Dashboard memuat ulang. */
  onBerubah?: () => void | Promise<void>;
  className?: string;
}

const KE_DAFTAR_BAWAAN = (kueri: string) => `/kontrak${kueri}`;

export default function KartuBeban({ semua, keDaftar = KE_DAFTAR_BAWAAN, onBerubah, className }: PropsKartuBeban) {
  const { sesi, pengguna } = useSesi();
  const kurangiGerak = useReducedMotion();
  const muatan = useMuat(() => (semua ? Promise.resolve(semua) : ambilSemuaKontrak()), [semua]);
  const data = semua ?? muatan.data;
  const beban = useMemo(() => (data ? bebanTim(pengguna, data) : []), [pengguna, data]);
  const maks = Math.max(1, ...beban.map((b) => b.total));
  const totalTim = beban.reduce((n, b) => n + b.total, 0);
  // Dihitung dengan pencocok yang sama dengan chip "Belum ada PIC", supaya angkanya sama dengan daftar yang dibuka.
  const tanpaPic = useMemo(() => (data ? hitungPreset(data, { sesi, semua: data })["tanpa-pic"] : 0), [data, sesi]);
  const saran = useMemo(() => saranPic(beban, { sesiEmail: sesi.email }), [beban, sesi.email]);
  const [alih, setAlih] = useState<BebanStaf | null>(null);
  const bolehAlih = adalahLegal(sesi);

  const selesaiAlih = async () => {
    await muatan.muatUlang();
    await onBerubah?.();
  };

  return (
    <section className={cx("kartu flex min-w-0 flex-col p-5", className)} aria-labelledby="judul-beban-tim">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="judul-beban-tim" className="flex items-center gap-2 font-bold">
            <Users className="h-4 w-4 text-brand" aria-hidden="true" />
            Beban tim Legal
          </h2>
          <p className="mt-0.5 text-xs text-muted">Review dan tanda tangan yang sedang dipegang tiap staf.</p>
        </div>
        {data && (
          <span className="shrink-0 rounded-full bg-raised px-2.5 py-1 text-xs font-semibold text-muted">
            <span className="angka">{totalTim}</span> berjalan
          </span>
        )}
      </div>

      <div className="mt-4 min-w-0 flex-1">
        {!data && muatan.loading ? (
          <div className="space-y-3" role="status" aria-label="Memuat beban tim">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Kerangka className="h-8 w-8 rounded-full" />
                <Kerangka className="h-4 flex-1" />
                <Kerangka className="h-4 w-10" />
              </div>
            ))}
          </div>
        ) : !data && muatan.error ? (
          <KotakError error={muatan.error} ulangi={() => void muatan.muatUlang()} />
        ) : beban.length === 0 ? (
          <Kosong judul="Belum ada staf Legal" teks="Tambahkan pengguna berperan Legal di halaman Pengguna supaya bebannya terlihat di sini." ikon={<Users className="h-6 w-6" />} />
        ) : (
          <ul className="space-y-1">
            {beban.map((b, i) => (
              <motion.li
                key={b.email}
                initial={kurangiGerak ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32, ease: EASE_KELUAR, delay: kurangiGerak ? 0 : Math.min(i, 8) * 0.04 }}
                className="group flex min-w-0 items-center gap-1"
              >
                <Link
                  to={keDaftar(`?pic=${encodeURIComponent(b.email)}`)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label={`${b.nama}: ${b.review} review, ${b.ttd} tanda tangan${b.aktif ? "" : ", sudah tidak aktif"}. Buka daftar kontraknya.`}
                >
                  <Avatar nama={b.nama} ukuran={30} className={b.aktif ? undefined : "opacity-60 grayscale"} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold" title={b.nama}>{b.nama}</span>
                      {!b.aktif && <span className="shrink-0 rounded-full bg-danger-soft px-1.5 text-[10px] font-bold text-danger">nonaktif</span>}
                    </span>
                    <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                      <motion.span className="h-full bg-info" initial={kurangiGerak ? false : { width: 0 }} animate={{ width: `${(b.review / maks) * 100}%` }} transition={{ duration: 0.6, ease: EASE_KELUAR }} />
                      <motion.span className="h-full bg-brand" initial={kurangiGerak ? false : { width: 0 }} animate={{ width: `${(b.ttd / maks) * 100}%` }} transition={{ duration: 0.6, ease: EASE_KELUAR, delay: 0.08 }} />
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-muted">
                      {b.total === 0 ? "Sedang lowong" : `${b.review} review · ${b.ttd} TTD${b.terlama ? ` · terlama ${lamaSejak(b.terlama.statusSejak ?? b.terlama.tanggalDiajukan ?? b.terlama.dibuat)}` : ""}`}
                    </span>
                  </span>
                  <span className="angka shrink-0 text-lg font-bold">{b.total}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
                {bolehAlih && b.dipegang.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAlih(b)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                    aria-label={`Alihkan semua kontrak ${b.nama}`}
                    title={`Alihkan semua (${b.dipegang.length}) kontrak ${b.nama}`}
                  >
                    <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      {data && beban.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs text-muted">
          <p className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-info" aria-hidden="true" /> Review
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" /> Tanda tangan
            </span>
          </p>
          {saran && (
            <p className="flex items-start gap-1.5">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span>Penugasan berikutnya: {saran.alasan}</span>
            </p>
          )}
          {tanpaPic > 0 && (
            <Link to={keDaftar(kueriPreset("tanpa-pic"))} className="inline-block font-semibold text-accent-ink underline-offset-2 hover:underline">
              {tanpaPic} kontrak berjalan belum punya PIC
            </Link>
          )}
        </div>
      )}

      {alih && data && <ModalAlihSemua dari={{ email: alih.email, nama: alih.nama }} semua={data} onTutup={() => setAlih(null)} onSelesai={selesaiAlih} />}
    </section>
  );
}
