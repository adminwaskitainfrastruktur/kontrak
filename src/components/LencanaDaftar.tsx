// Lencana kecil untuk baris Daftar Kontrak dan kartu Dashboard:
//   - Perpanjangan diproses (U05A): kontrak induk punya addendum perpanjangan waktu yang masih diproses.
//   - Mata uang addendum berbeda (U29A): nilai addendum itu tidak ikut nilai efektif induk.
//   - Mode berakhir (K02): cara kontrak ditutup, bila sudah dicatat Legal.
import { CalendarPlus, Coins, Flag } from "lucide-react";
import type { Kontrak, ModeBerakhir } from "../lib/types";
import { cx } from "./ui";

const nomor = (k: Kontrak) => k.nomorKontrak || k.nomorPengajuan;
const dasar = "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold";

/** "Perpanjangan diproses" untuk kontrak induk yang addendum perpanjangannya belum berlaku. */
export function LencanaPerpanjangan({ addendum, className }: { addendum: readonly Kontrak[] | undefined; className?: string }) {
  if (!addendum?.length) return null;
  const rincian = addendum.map((a) => `Addendum ke-${a.urutanAddendum ?? "?"} (${a.nomorPengajuan}): ${a.status}`).join("; ");
  return (
    <span className={cx(dasar, "bg-info-soft text-info", className)} title={`Addendum perpanjangan sedang diproses. ${rincian}.`}>
      <CalendarPlus className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">Addendum </span>Perpanjangan diproses
      <span className="sr-only">: {rincian}</span>
    </span>
  );
}

/**
 * Peringatan mata uang addendum. Pada kontrak induk: `addendum` berisi addendum yang mata uangnya berbeda.
 * Pada addendum itu sendiri: berikan `induk` dan addendum-nya.
 */
export function LencanaMataUangBeda({ addendum, induk, className }: { addendum: readonly Kontrak[] | undefined; induk?: Kontrak | null; className?: string }) {
  if (!addendum?.length) return null;
  const judul = induk
    ? `Mata uang addendum (${addendum[0]!.mataUang}) berbeda dari kontrak induk ${nomor(induk)} (${induk.mataUang}). Selisih nilainya tidak dijumlahkan ke nilai efektif induk.`
    : `${addendum.length} addendum bermata uang berbeda dari kontrak ini (${addendum.map((a) => `${a.nomorPengajuan} ${a.mataUang}`).join(", ")}). Selisih nilainya tidak dijumlahkan ke nilai efektif.`;
  return (
    <span className={cx(dasar, "bg-accent-soft text-accent-ink", className)} title={judul}>
      <Coins className="h-3 w-3" aria-hidden="true" /> {induk ? "Mata uang beda induk" : "Mata uang addendum beda"}
    </span>
  );
}

const NADA_MODE: Record<ModeBerakhir, string> = {
  "Selesai Normal": "bg-success-soft text-success",
  "Tidak Diperpanjang": "bg-raised text-muted",
  "Dibatalkan Bersama": "bg-raised text-muted",
  Diputus: "bg-danger-soft text-danger",
  Sengketa: "bg-danger-soft text-danger",
};

/** Cara kontrak berakhir (K02). Tidak tampil bila belum diisi. */
export function LencanaModeBerakhir({ mode, className }: { mode: Kontrak["modeBerakhir"] | null | undefined; className?: string }) {
  if (!mode) return null;
  return (
    <span className={cx(dasar, NADA_MODE[mode] ?? "bg-raised text-muted", className)} title={`Mode berakhir: ${mode}`}>
      <Flag className="h-3 w-3" aria-hidden="true" /> {mode}
    </span>
  );
}
