// Kartu peringatan lunak di ringkasan chat: "sepertinya ini sudah pernah diajukan". Tidak pernah memblokir.
// Pengajuan yang tidak boleh dilihat sesi hanya disebut jumlahnya, tanpa judul, nomor, atau divisinya.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CopyCheck, ExternalLink, GitBranchPlus, Send } from "lucide-react";
import { useRuang } from "../context/RuangContext";
import { useSesi } from "../context/SesiContext";
import { adaTemuan, cariPengajuanGanda, type DrafPengajuan, type HasilGanda, type TawaranAddendum } from "../lib/duplikat";
import { EASE_KELUAR, pegasLembut } from "../lib/gerak";
import type { Kontrak } from "../lib/types";
import { LencanaStatus, Tombol } from "./ui";

function teksSisa(t: TawaranAddendum): string {
  if (t.sisaHari == null) return "";
  if (t.sisaHari < 0) return `sudah lewat ${-t.sisaHari} hari`;
  if (t.sisaHari === 0) return "berakhir hari ini";
  return `berakhir ${t.sisaHari} hari lagi`;
}

function judulKartu(h: HasilGanda): string {
  const ganda = h.terlihat.length + h.tersembunyi;
  if (ganda > 1) return `Ada ${ganda} pengajuan serupa yang masih diproses`;
  if (ganda === 1) return "Sepertinya ini sudah pernah diajukan";
  return "Mungkin ini cukup lewat addendum?";
}

/** Hitung temuan untuk draf. Dipisah dari kartu supaya pemanggil bisa tahu ada-tidaknya temuan lebih dulu. */
export function useTemuanGanda(draf: DrafPengajuan, semuaKontrak: readonly Kontrak[] | null | undefined): HasilGanda | null {
  const { sesi } = useSesi();
  const { judul, mitra, jenis, kontrakIndukId } = draf;
  return useMemo(() => {
    if (!semuaKontrak) return null;
    const h = cariPengajuanGanda({ judul, mitra, jenis, kontrakIndukId }, semuaKontrak, sesi);
    return adaTemuan(h) ? h : null;
  }, [judul, mitra, jenis, kontrakIndukId, semuaKontrak, sesi]);
}

export function PeringatanGanda({
  draf,
  semuaKontrak,
  onTetapAjukan,
  onAjukanAddendum,
}: {
  draf: DrafPengajuan;
  semuaKontrak: readonly Kontrak[] | null | undefined;
  /** Dipanggil saat pengguna memilih tetap mengajukan. Kartu lalu menciut menjadi satu baris. */
  onTetapAjukan?: () => void;
  /** Bawaan: pindah ke chat addendum untuk induk itu (draf sekarang ditinggalkan). */
  onAjukanAddendum?: (induk: Kontrak) => void;
}) {
  const navigate = useNavigate();
  const { ke } = useRuang();
  const temuan = useTemuanGanda(draf, semuaKontrak);
  const [diabaikan, setDiabaikan] = useState(false);

  if (!temuan) return null;
  const { terlihat, tersembunyi, tawaran } = temuan;
  const pertama = terlihat[0];

  return (
    <AnimatePresence mode="wait" initial={false}>
      {diabaikan ? (
        <motion.p key="ciut" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: EASE_KELUAR }} className="flex items-center gap-2 text-xs text-muted" role="status">
          <CopyCheck className="h-3.5 w-3.5" aria-hidden="true" /> Oke, pengajuan ini tetap dikirim sebagai pengajuan baru.
        </motion.p>
      ) : (
        <motion.section
          key="kartu"
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
          transition={pegasLembut}
          role="note"
          aria-labelledby="peringatan-ganda-judul"
          className="rounded-[22px] border border-accent bg-accent-soft p-4 text-accent-ink sm:p-5"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-accent-on" aria-hidden="true">
              <CopyCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 id="peringatan-ganda-judul" className="font-bold">
                {judulKartu(temuan)}
              </h3>
              <p className="mt-0.5 text-sm opacity-90">
                {terlihat.length + tersembunyi > 0
                  ? "Dengan mitra yang sama dan judul yang mirip. Kalau memang pekerjaan berbeda, silakan lanjutkan saja."
                  : "Ada kontrak berjalan dengan mitra yang sama. Perpanjangan atau perubahan biasanya cukup lewat addendum."}
              </p>
            </div>
          </div>

          {terlihat.length > 0 && (
            <ul className="mt-3 space-y-2">
              {terlihat.slice(0, 3).map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-surface px-3.5 py-2.5 text-ink">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" title={k.judul}>
                      {k.judul}
                    </p>
                    <p className="truncate text-xs text-muted">
                      <span className="font-mono">{k.nomorPengajuan}</span> · {k.pengajuNama || "pengaju"}
                    </p>
                  </div>
                  <LencanaStatus status={k.status} />
                </li>
              ))}
            </ul>
          )}

          {tersembunyi > 0 && (
            <p className="mt-3 rounded-xl bg-surface px-3.5 py-2.5 text-sm text-ink">
              {tersembunyi === 1 ? "Ada pengajuan serupa" : `Ada ${tersembunyi} pengajuan serupa`} yang sedang diproses Legal. Bila ragu, tanyakan dulu ke Legal sebelum mengirim.
            </p>
          )}

          {tawaran.length > 0 && (
            <ul className="mt-3 space-y-2">
              {tawaran.map((t) => (
                <li key={t.induk.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-surface px-3.5 py-2.5 text-ink">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" title={t.induk.judul}>
                      {t.induk.judul}
                    </p>
                    <p className="truncate text-xs text-muted">
                      <span className="font-mono">{t.induk.nomorKontrak || t.induk.nomorPengajuan}</span>
                      {teksSisa(t) && ` · ${teksSisa(t)}`}
                    </p>
                  </div>
                  <Tombol kecil varian="kedua" ikon={<GitBranchPlus className="h-4 w-4" />} onClick={() => (onAjukanAddendum ? onAjukanAddendum(t.induk) : navigate(ke.ajukanAddendum(t.induk.id)))}>
                    Jadikan addendum
                  </Tombol>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Tombol
              kecil
              ikon={<Send className="h-4 w-4" />}
              onClick={() => {
                setDiabaikan(true);
                onTetapAjukan?.();
              }}
            >
              Tetap ajukan
            </Tombol>
            {pertama && (
              // Tab baru supaya draf di chat tidak hilang.
              <Link
                to={ke.detail(pertama.id)}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand hover:bg-raised [@media(pointer:coarse)]:min-h-11"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Lihat yang sudah ada
                <span className="sr-only">(membuka tab baru)</span>
              </Link>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
