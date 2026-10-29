// Komponen Ruang Pengguna: lencana status ringkas (Antri/Proses/Selesai), pelacak tiga langkah,
// dan jalur antrean Legal yang menunjukkan berapa pengajuan di depan milik pengguna. Saat Proses Tanda
// Tangan, pelacak dan kartu menampilkan chip "TTD n/m" dan langkah yang sedang ditunggu (U21, lib/ttd).
import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Ban, BadgeCheck, Hourglass, Scale, Signature, XCircle } from "lucide-react";
import { useRuang } from "../context/RuangContext";
import { formatRelatif, formatTanggal } from "../lib/format";
import { EASE_KELUAR, pegas, pegasLembut } from "../lib/gerak";
import { DAFTAR_STATUS_RINGKAS, keteranganRingkas, selesaiBerhasil, statusRingkas, type StatusRingkas } from "../lib/antrean";
import type { Kabar } from "../lib/kabar";
import { posisiTtd, ringkasTtd, susunTtd } from "../lib/ttd";
import type { Kontrak } from "../lib/types";
import { cx } from "./ui";

// --- Lencana ----------------------------------------------------------------

function gayaRingkas(k: Kontrak): { pil: string; titik: string } {
  const r = statusRingkas(k.status);
  if (r === "Antri") return { pil: "bg-accent-soft text-accent-ink", titik: "bg-accent" };
  if (r === "Proses") return k.status === "Perlu Revisi" ? { pil: "bg-accent-soft text-accent-ink", titik: "bg-accent" } : { pil: "bg-info-soft text-info", titik: "bg-info" };
  if (selesaiBerhasil(k.status)) return { pil: "bg-success-soft text-success", titik: "bg-success" };
  if (k.status === "Ditolak") return { pil: "bg-danger-soft text-danger", titik: "bg-danger" };
  return { pil: "bg-raised text-muted", titik: "bg-line" };
}

export function LencanaRingkas({ k, besar }: { k: Kontrak; besar?: boolean }) {
  const r = statusRingkas(k.status);
  const g = gayaRingkas(k);
  return (
    <motion.span key={k.status} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={pegas} className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-bold", besar ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-1 text-xs", g.pil)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", g.titik, r !== "Selesai" && "denyut")} aria-hidden="true" />
      {r}
    </motion.span>
  );
}

// --- Tanda tangan (U21) ------------------------------------------------------

type KontrakTtd = Pick<Kontrak, "status" | "checklistTtd">;

/** Chip "TTD 3/5" untuk Ruang Pengguna. Hanya tampil saat Proses Tanda Tangan. */
export function ChipTtdRingkas({ k, className }: { k: KontrakTtd; className?: string }) {
  if (k.status !== "Proses Tanda Tangan") return null;
  const r = ringkasTtd(k);
  return (
    <span
      className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", r.lengkap ? "bg-success-soft text-success" : "bg-brand-soft text-brand-strong", className)}
      title={`Langkah tanda tangan: ${r.selesai} dari ${r.total} selesai`}
    >
      <Signature className="h-3 w-3" aria-hidden="true" />
      <span className="angka">{r.teks}</span>
      <span className="sr-only">{`, ${r.selesai} dari ${r.total} langkah tanda tangan selesai`}</span>
    </span>
  );
}

/** Kalimat posisi tanda tangan untuk pengaju: langkah yang ditunggu dan sejak kapan. null di luar Proses Tanda Tangan. */
export function keteranganTtd(k: KontrakTtd): string | null {
  if (k.status !== "Proses Tanda Tangan") return null;
  const posisi = posisiTtd(susunTtd(k.checklistTtd));
  if (!posisi) return "Semua langkah tanda tangan selesai; menunggu Legal mengaktifkan kontrak.";
  return `Menunggu: ${posisi.langkah.label}${posisi.sejak ? `, sejak ${formatTanggal(posisi.sejak)}` : ""}`;
}

// --- Pelacak tiga langkah ------------------------------------------------------

const IKON_LANGKAH = { Antri: Hourglass, Proses: Scale, Selesai: BadgeCheck } as const;

export function PelacakRingkas({ k, besar }: { k: Kontrak; besar?: boolean }) {
  const r = statusRingkas(k.status);
  const kini = DAFTAR_STATUS_RINGKAS.indexOf(r);
  const gagal = k.status === "Ditolak" || k.status === "Dibatalkan";
  const ukuran = besar ? "h-11 w-11" : "h-8 w-8";
  const ikon = besar ? "h-5 w-5" : "h-4 w-4";
  const ttd = k.status === "Proses Tanda Tangan" ? ringkasTtd(k) : null;
  return (
    <div>
      <ol className="relative grid grid-cols-3" aria-label={`Status: ${r}. ${keteranganRingkas(k)}${ttd ? `, ${ttd.selesai} dari ${ttd.total} langkah tanda tangan selesai` : ""}.`}>
        <div className={cx("absolute left-[16.66%] right-[16.66%] rounded-full bg-line", besar ? "top-[1.3rem] h-1" : "top-[0.95rem] h-[3px]")} aria-hidden="true">
          <motion.div className={cx("h-full rounded-full", gagal ? "bg-gradient-to-r from-brand to-danger" : "bg-gradient-to-r from-brand to-success")} initial={{ width: 0 }} animate={{ width: `${(kini / 2) * 100}%` }} transition={{ duration: 0.9, ease: EASE_KELUAR, delay: 0.2 }} />
        </div>
        {DAFTAR_STATUS_RINGKAS.map((l, i) => {
          const lewat = i < kini || (i === kini && r === "Selesai");
          const sekarang = i === kini && r !== "Selesai";
          const Ikon = l === "Selesai" && gagal ? (k.status === "Ditolak" ? XCircle : Ban) : IKON_LANGKAH[l];
          const warna = lewat ? (l === "Selesai" && gagal ? (k.status === "Ditolak" ? "bg-danger text-white" : "bg-muted text-white") : "bg-brand text-brand-on") : sekarang ? (k.status === "Perlu Revisi" ? "denyut bg-accent text-accent-on" : "denyut bg-accent text-accent-on") : "bg-raised text-muted";
          return (
            <li key={l} className="relative flex flex-col items-center text-center" aria-current={sekarang || (lewat && i === kini) ? "step" : undefined}>
              <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...pegas, delay: 0.1 + i * 0.08 }} className={cx("relative z-10 grid place-items-center rounded-full border-2 border-surface shadow-card", ukuran, warna)}>
                <Ikon className={ikon} aria-hidden="true" />
              </motion.span>
              <span className={cx("mt-1.5 font-bold", besar ? "text-sm" : "text-xs", lewat || sekarang ? "text-ink" : "text-muted")}>{l === "Selesai" && gagal ? k.status : l}</span>
              {l === "Proses" && ttd && (
                <span aria-hidden="true">
                  <ChipTtdRingkas k={k} className="mt-1" />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// --- Jalur antrean ----------------------------------------------------------

type Slot = { jenis: "kontrak"; k: Kontrak; posisi: number } | { jenis: "celah"; jumlah: number; kunci: string };

const BATAS_SLOT = 14;

/** Slot yang ditampilkan: sejumlah antrean terdepan, ditambah semua milik pengguna; sisanya diringkas. */
function susunSlot(antrean: Kontrak[], milikIds: Set<number>): Slot[] {
  const tampil = new Set<number>();
  for (let i = 0; i < Math.min(antrean.length, BATAS_SLOT); i++) tampil.add(i);
  antrean.forEach((k, i) => milikIds.has(k.id) && tampil.add(i));
  const urut = [...tampil].sort((a, b) => a - b);
  const hasil: Slot[] = [];
  let sebelum = -1;
  for (const i of urut) {
    if (i - sebelum > 1) hasil.push({ jenis: "celah", jumlah: i - sebelum - 1, kunci: `c-${i}` });
    hasil.push({ jenis: "kontrak", k: antrean[i]!, posisi: i + 1 });
    sebelum = i;
  }
  if (antrean.length - 1 > sebelum) hasil.push({ jenis: "celah", jumlah: antrean.length - 1 - sebelum, kunci: "c-akhir" });
  return hasil;
}

export function JalurAntrean({ antrean, milik, ditangani, labelSorot = "Anda" }: { antrean: Kontrak[]; milik: Kontrak[]; ditangani: number; labelSorot?: string }) {
  const milikIds = useMemo(() => new Set(milik.map((k) => k.id)), [milik]);
  const slot = useMemo(() => susunSlot(antrean, milikIds), [antrean, milikIds]);

  return (
    <>
      {/* Digulir di dalam wadahnya sendiri (tidak melebarkan halaman); bisa difokus supaya papan ketik bisa menggulirnya. */}
      <div className="scroll-halus -mx-1 overflow-x-auto px-1 pb-2" role="region" aria-label="Jalur antrean Legal, bisa digeser ke samping" tabIndex={0}>
        <ol className="flex min-w-max items-end gap-2" aria-label="Urutan antrean Legal">
        {/* Loket Legal di depan antrean */}
        <li className="mr-2 flex flex-col items-center gap-1.5">
          <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-navy text-white shadow-pop">
            <Scale className="h-6 w-6" aria-hidden="true" />
            {ditangani > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-info px-1 text-[10px] font-bold text-white">{ditangani}</span>}
          </span>
          <span className="text-xs font-semibold text-muted">Legal</span>
        </li>
        {slot.map((s, i) => {
          if (s.jenis === "celah") {
            return (
              <li key={s.kunci} className="flex h-[4.5rem] items-center px-1 text-xs font-semibold text-muted" aria-label={`${s.jumlah} pengajuan lain`}>
                <span className="rounded-full bg-raised px-2 py-1">+{s.jumlah}</span>
              </li>
            );
          }
          const saya = milikIds.has(s.k.id);
          return (
            <Fragment key={s.k.id}>
              <motion.li
                layout
                initial={{ opacity: 0, x: 14, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ ...pegasLembut, delay: Math.min(i, 14) * 0.035 }}
                className="flex flex-col items-center gap-1.5"
                title={saya ? `${s.k.judul} (${s.k.nomorPengajuan})` : `Pengajuan lain · prioritas ${s.k.prioritas} · diajukan ${formatRelatif(s.k.tanggalDiajukan ?? s.k.dibuat)}`}
              >
                <span
                  className={cx(
                    "relative grid place-items-center rounded-xl text-sm font-extrabold tabular-nums transition-colors",
                    saya ? "denyut h-14 w-12 bg-gradient-to-br from-brand to-brand-strong text-brand-on shadow-pop ring-2 ring-brand ring-offset-2 ring-offset-surface" : "h-12 w-10 border border-line bg-raised text-muted",
                    !saya && s.posisi === 1 && "border-accent text-accent-ink",
                  )}
                >
                  {s.posisi}
                  {s.k.prioritas !== "Normal" && <span className={cx("absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-surface", s.k.prioritas === "Mendesak" ? "bg-danger" : "bg-accent")} aria-hidden="true" />}
                </span>
                <span className={cx("text-xs font-bold", saya ? "text-brand" : "text-transparent")} aria-hidden={!saya}>
                  {saya ? labelSorot : "·"}
                </span>
              </motion.li>
            </Fragment>
          );
        })}
        {antrean.length === 0 && <li className="flex h-14 items-center rounded-2xl border border-dashed border-line px-4 text-sm text-muted">Antrean kosong</li>}
        </ol>
      </div>
      {slot.length > 6 && <p className="text-xs text-muted sm:hidden">Geser ke samping untuk melihat seluruh antrean.</p>}
    </>
  );
}

/** Legenda kecil di bawah jalur antrean. */
export function LegendaAntrean() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-brand" aria-hidden="true" /> Pengajuan Anda
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border border-line bg-raised" aria-hidden="true" /> Pengajuan lain
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-danger" aria-hidden="true" /> Mendesak
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" /> Prioritas tinggi
      </li>
    </ul>
  );
}

// --- Kabar ------------------------------------------------------------------

const WARNA_KABAR: Record<Kabar["nada"], string> = {
  info: "bg-info",
  sukses: "bg-success",
  peringatan: "bg-accent",
  bahaya: "bg-danger",
};

/** Daftar kabar, dipakai di halaman Monitoring dan di lonceng bilah atas. */
export function DaftarKabar({ kabar, onPilih }: { kabar: Kabar[]; onPilih?: () => void }) {
  const { ke } = useRuang();
  if (kabar.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted">Belum ada kabar. Anda akan diberi tahu saat antrean bergerak atau status pengajuan berubah.</p>;
  }
  return (
    <ul className="scroll-halus max-h-[22rem] divide-y divide-line overflow-y-auto">
      {kabar.map((b, i) => (
        <motion.li key={b.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.3, ease: EASE_KELUAR }}>
          <Link to={ke.detail(b.kontrakId)} onClick={onPilih} className="group flex gap-3 px-5 py-3 transition-colors hover:bg-raised">
            <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", WARNA_KABAR[b.nada], !b.dibaca && "denyut")} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className={cx("block truncate text-sm", b.dibaca ? "font-medium" : "font-bold")} title={b.judul}>
                {b.judul}
              </span>
              <span className="block break-words text-sm text-muted">{b.teks}</span>
              <span className="mt-0.5 block text-xs text-muted">
                <span className="break-all font-mono">{b.nomor}</span> · {formatRelatif(b.waktu)}
              </span>
            </span>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
          </Link>
        </motion.li>
      ))}
    </ul>
  );
}

export type { StatusRingkas };
