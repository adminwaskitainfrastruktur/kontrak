// Lencana umur tahap, SLA, dan target (U03). Warna hijau/kuning/merah HANYA untuk tahap milik Legal.
// Perlu Revisi selalu kuning bertuliskan "menunggu pengaju": waktu di tangan pengaju bukan kinerja Legal.
// Angka SLA diambil dari Pengaturan (hari kalender atau hari kerja); prop `sla` bisa menimpanya.
// Prop `tunggu` (permintaan masukan unit lain, K03) mengurangi umur tahap Legal selama menunggu jawaban unit.
import { useMemo, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, Hourglass, Target, UserRound } from "lucide-react";
import { usePengaturan } from "../context/PengaturanContext";
import { formatTanggal, formatWaktu, lamaSejak } from "../lib/format";
import { batasSla, levelSlaPengaturan, potonganTungguPengaturan, umurTahapPengaturan, type Pengaturan } from "../lib/pengaturan";
import { MENUNGGU_PENGAJU, MENUNGGU_UNIT_LAIN, sisaKeTarget, type LevelSla, type RentangTunggu } from "../lib/sla";
import { EASE_KELUAR } from "../lib/gerak";
import { STATUS_PROSES, type Kontrak, type Status } from "../lib/types";
import { cx } from "./ui";

/** Tahap yang dikerjakan Legal: hanya di sini warna SLA berlaku. */
const TAHAP_LEGAL: readonly Status[] = ["Diajukan", "Review Legal", "Proses Tanda Tangan"];

type Nada = "aman" | "hampir" | "lewat" | "tunggu" | "netral";

const WARNA: Record<Nada, { pil: string; titik: string; isi: string }> = {
  aman: { pil: "bg-success-soft text-success", titik: "bg-success", isi: "bg-success" },
  hampir: { pil: "bg-accent-soft text-accent-ink", titik: "bg-accent", isi: "bg-accent" },
  lewat: { pil: "bg-danger-soft text-danger", titik: "bg-danger", isi: "bg-danger" },
  tunggu: { pil: "bg-accent-soft text-accent-ink", titik: "bg-accent", isi: "bg-accent" },
  netral: { pil: "bg-raised text-muted", titik: "bg-muted", isi: "bg-muted" },
};

const KATA_LEVEL: Record<Exclude<LevelSla, "tidak-berlaku">, string> = {
  aman: "masih dalam batas SLA",
  hampir: "mendekati batas SLA",
  lewat: "melewati batas SLA",
};

export interface InfoSla {
  /** Kontrak sedang di tahap yang punya umur (Diajukan sampai Proses Tanda Tangan). */
  berlaku: boolean;
  nada: Nada;
  milikLegal: boolean;
  menungguPengaju: boolean;
  /** "3 hari 4 jam" */
  umurTeks: string;
  sejak: string | null;
  umurHari: number | null;
  batasHari: number | null;
  level: LevelSla;
  /** Sisa hari ke target (negatif bila lewat), null bila tanpa target atau sudah selesai. */
  sisaTarget: number | null;
  /** Masa menunggu unit lain di tahap ini (satuan Pengaturan), sudah dikurangkan dari umurHari. */
  potonganUnit: number;
  /** Ada permintaan masukan unit lain yang masih menunggu jawaban. */
  menungguUnit: boolean;
}

/** Hitung semua yang ditampilkan lencana. Diekspor untuk dipakai kartu atau ekspor CSV. */
export function infoSla(k: Kontrak, p: Pengaturan, sekarang: number = Date.now(), tunggu: readonly RentangTunggu[] = []): InfoSla {
  const sejak = k.statusSejak ?? (k.status === "Diajukan" ? k.tanggalDiajukan : null);
  const berlaku = STATUS_PROSES.includes(k.status);
  const milikLegal = TAHAP_LEGAL.includes(k.status);
  const menungguPengaju = MENUNGGU_PENGAJU.includes(k.status);
  const level = milikLegal ? levelSlaPengaturan(k, p, sekarang, tunggu) : "tidak-berlaku";
  const kenaPotongan = MENUNGGU_UNIT_LAIN.includes(k.status);
  const nada: Nada = menungguPengaju ? "tunggu" : level === "tidak-berlaku" ? "netral" : level;
  return {
    berlaku,
    nada,
    milikLegal,
    menungguPengaju,
    umurTeks: sejak ? lamaSejak(sejak, sekarang) : "-",
    sejak,
    umurHari: umurTahapPengaturan(k, p, sekarang, tunggu),
    batasHari: batasSla(p, k.status),
    level,
    sisaTarget: berlaku ? sisaKeTarget(k) : null,
    potonganUnit: kenaPotongan ? potonganTungguPengaturan(k, p, sekarang, tunggu) : 0,
    menungguUnit: kenaPotongan && tunggu.some((r) => r.selesai == null),
  };
}

function teksTarget(sisa: number): string {
  if (sisa < 0) return `Lewat target ${-sisa} hari`;
  if (sisa === 0) return "Target hari ini";
  return `Sisa ${sisa} hari`;
}

function nadaTarget(sisa: number): Nada {
  if (sisa < 0) return "lewat";
  if (sisa <= 3) return "hampir";
  return "netral";
}

function Pil({ nada, children, judul, ikon }: { nada: Nada; children: ReactNode; judul?: string; ikon?: ReactNode }) {
  const w = WARNA[nada];
  return (
    <span title={judul} className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5", w.pil)}>
      {ikon ?? <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", w.titik)} aria-hidden="true" />}
      {children}
    </span>
  );
}

export interface PropsLencanaSla {
  k: Kontrak;
  /** "kompak" untuk sel tabel dan kartu; "lengkap" untuk halaman detail. */
  varian?: "kompak" | "lengkap";
  /** Timpa angka SLA (hari) per status; bawaan dari Pengaturan. */
  sla?: Partial<Record<Status, number>>;
  /** Sembunyikan lencana target (mis. bila kolom Target sudah ada di tabel). */
  tanpaTarget?: boolean;
  /** Waktu acuan (ms); bawaan sekarang. */
  sekarang?: number;
  /** Masa menunggu masukan unit lain (K03); dikurangkan dari umur tahap Legal. */
  tunggu?: readonly RentangTunggu[];
  className?: string;
}

export default function LencanaSla({ k, varian = "kompak", sla, tanpaTarget, sekarang, tunggu, className }: PropsLencanaSla) {
  const { pengaturan } = usePengaturan();
  const p = useMemo<Pengaturan>(() => (sla ? { ...pengaturan, sla: { ...pengaturan.sla, ...sla } } : pengaturan), [pengaturan, sla]);
  const info = infoSla(k, p, sekarang, tunggu);
  if (!info.berlaku) return varian === "lengkap" ? null : <span className="text-xs text-muted">-</span>;
  return varian === "lengkap" ? <SlaLengkap k={k} info={info} pakaiHariKerja={p.slaPakaiHariKerja} tanpaTarget={tanpaTarget} className={className} /> : <SlaKompak k={k} info={info} tanpaTarget={tanpaTarget} className={className} />;
}

function judulUmur(k: Kontrak, info: InfoSla): string {
  const dasar = `${k.status} sejak ${formatWaktu(info.sejak)} (${info.umurTeks})`;
  if (info.menungguPengaju) return `${dasar}. Menunggu pengaju merevisi, tidak dihitung sebagai waktu Legal.`;
  if (info.level === "tidak-berlaku" || info.batasHari == null) return dasar;
  return `${dasar}, ${KATA_LEVEL[info.level]} ${info.batasHari} hari.`;
}

function SlaKompak({ k, info, tanpaTarget, className }: { k: Kontrak; info: InfoSla; tanpaTarget?: boolean; className?: string }) {
  const tampilTarget = !tanpaTarget && info.sisaTarget != null;
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-1", className)}>
      <Pil nada={info.nada} judul={judulUmur(k, info)}>
        {info.menungguPengaju ? `menunggu pengaju · ${info.umurTeks}` : info.umurTeks}
        <span className="sr-only">{info.menungguPengaju ? "" : info.level !== "tidak-berlaku" ? `, ${KATA_LEVEL[info.level]}` : ""}</span>
      </Pil>
      {tampilTarget && (
        <Pil nada={nadaTarget(info.sisaTarget!)} judul={`Target selesai ${formatTanggal(k.targetSelesai)}`} ikon={<Target className="h-3 w-3" aria-hidden="true" />}>
          {teksTarget(info.sisaTarget!)}
        </Pil>
      )}
    </span>
  );
}

function SlaLengkap({ k, info, pakaiHariKerja, tanpaTarget, className }: { k: Kontrak; info: InfoSla; pakaiHariKerja: boolean; tanpaTarget?: boolean; className?: string }) {
  const kurangiGerak = useReducedMotion();
  const w = WARNA[info.nada];
  const persen = info.batasHari && info.umurHari != null ? Math.min(100, Math.round((info.umurHari / info.batasHari) * 100)) : null;
  const satuan = pakaiHariKerja ? "hari kerja" : "hari";
  const kalimat = info.menungguPengaju
    ? "Bola sedang di tangan pengaju. Waktu ini tidak dihitung sebagai waktu Legal."
    : info.level === "lewat"
      ? `Sudah melewati batas ${info.batasHari} ${satuan}. Layak didahulukan.`
      : info.level === "hampir"
        ? `Mendekati batas ${info.batasHari} ${satuan}.`
        : info.level === "aman"
          ? `Masih longgar, batasnya ${info.batasHari} ${satuan}.`
          : "Tahap ini tidak punya batas SLA.";

  return (
    <div className={cx("rounded-2xl border border-line bg-surface p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {info.menungguPengaju ? <UserRound className="h-4 w-4 text-accent-ink" aria-hidden="true" /> : <Hourglass className="h-4 w-4 text-muted" aria-hidden="true" />}
          Di tahap {k.status} selama <span className="angka">{info.umurTeks}</span>
        </p>
        <Pil nada={info.nada}>{info.menungguPengaju ? "menunggu pengaju" : info.level === "tidak-berlaku" ? "tanpa SLA" : info.level === "lewat" ? "lewat SLA" : info.level === "hampir" ? "hampir SLA" : "sesuai SLA"}</Pil>
      </div>
      {persen != null && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={persen} aria-label={`Umur tahap ${persen}% dari batas SLA`}>
          <motion.div className={cx("h-full rounded-full", w.isi)} initial={kurangiGerak ? false : { width: 0 }} animate={{ width: `${persen}%` }} transition={{ duration: 0.7, ease: EASE_KELUAR }} />
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        {kalimat} <span className="whitespace-nowrap">Sejak {formatWaktu(info.sejak)}.</span>
      </p>
      {info.potonganUnit > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
          <Hourglass className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {info.menungguUnit ? "Sedang menunggu masukan unit lain. " : ""}
            Waktu menunggu unit lain ({new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(info.potonganUnit)} {satuan}) tidak dihitung ke SLA Legal.
          </span>
        </p>
      )}
      {!tanpaTarget && info.sisaTarget != null && (
        <p className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
          <Clock className="h-4 w-4 text-muted" aria-hidden="true" />
          <span>Target selesai {formatTanggal(k.targetSelesai)}</span>
          <Pil nada={nadaTarget(info.sisaTarget)}>{teksTarget(info.sisaTarget)}</Pil>
        </p>
      )}
    </div>
  );
}
