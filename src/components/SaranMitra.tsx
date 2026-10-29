// Saran nama mitra dalam dua bentuk: chip untuk chat pengajuan (maksimal 3) dan <datalist> untuk formulir.
// Sumbernya master Mitra dan nama mitra di kontrak yang BOLEH dilihat sesi, supaya pengaju tidak
// mengetahui mitra dari pengajuan divisi lain lewat saran.
import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import { Building2, Check } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useMuat } from "../hooks/useMuat";
import { bisaLihat } from "../lib/alur";
import { pegas, tekan } from "../lib/gerak";
import { cariMitraPersis, cariMitraSerupa, opsiDatalist, type SaranNamaMitra } from "../lib/mitra";
import type { Kontrak, Mitra } from "../lib/types";
import { ambilSemuaKontrak } from "../services/kontrak";
import { ambilSemuaMitra } from "../services/mitra";
import { cx } from "./ui";

export interface DataSaranMitra {
  daftarMitra: Mitra[];
  /** Kontrak yang boleh dilihat sesi ini saja. */
  kontrak: Kontrak[];
  memuat: boolean;
}

/**
 * Bahan saran mitra. Saran hanya pelengkap: bila memuat gagal, hasilnya kosong dan pengajuan tetap jalan.
 * Bila halaman sudah memuat daftar kontrak, berikan lewat `kontrakAda` supaya tidak dimuat dua kali.
 */
export function useDataSaranMitra(kontrakAda?: readonly Kontrak[] | null): DataSaranMitra {
  const { sesi } = useSesi();
  const mitraQ = useMuat(() => ambilSemuaMitra().catch(() => [] as Mitra[]), []);
  const kontrakQ = useMuat(() => (kontrakAda ? Promise.resolve([...kontrakAda]) : ambilSemuaKontrak().catch(() => [] as Kontrak[])), [kontrakAda]);
  const kontrak = useMemo(() => (kontrakQ.data ?? []).filter((k) => bisaLihat(k, sesi)), [kontrakQ.data, sesi]);
  return { daftarMitra: mitraQ.data ?? [], kontrak, memuat: mitraQ.loading || kontrakQ.loading };
}

/** Nama dan MitraId yang disimpan untuk teks mitra: bila cocok persis dengan master, pakai nama resminya. */
export function rapikanMitra(nama: string, daftarMitra: readonly Mitra[]): { mitra: string; mitraId: number | null } {
  const m = cariMitraPersis(nama, daftarMitra);
  return m ? { mitra: m.nama, mitraId: m.id } : { mitra: nama.trim(), mitraId: null };
}

function keteranganSaran(s: SaranNamaMitra): string {
  if (s.via) return `dikenal juga sebagai ${s.via}`;
  if (s.sumber === "master") return s.pemakaian > 0 ? `data mitra · ${s.pemakaian} kontrak` : "data mitra";
  return `pernah dipakai di ${s.pemakaian} kontrak`;
}

/**
 * Chip saran untuk langkah mitra di chat. Tidak tampil bila tidak ada saran yang cukup yakin, atau bila
 * ketikan sudah sama persis dengan nama resmi satu-satunya saran.
 */
export function ChipSaranMitra({
  teks,
  daftarMitra,
  kontrak,
  onPilih,
  className,
}: {
  teks: string;
  daftarMitra: readonly Mitra[];
  kontrak: readonly Kontrak[];
  onPilih: (s: SaranNamaMitra) => void;
  className?: string;
}) {
  const idJudul = useId();
  const saran = useMemo(() => cariMitraSerupa(teks, daftarMitra, kontrak), [teks, daftarMitra, kontrak]);
  const sudahTepat = saran.length === 1 && saran[0]!.nama === teks.trim();
  if (saran.length === 0 || sudahTepat) return null;

  return (
    <div className={cx("space-y-1.5", className)}>
      <p className="text-xs text-muted" id={idJudul}>
        {saran.some((s) => s.alasan === "persis") ? "Sepertinya yang Anda maksud:" : "Mungkin salah satu ini?"}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={idJudul}>
        {saran.map((s, i) => (
          <motion.button
            key={`${s.sumber}-${s.nama}`}
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...pegas, delay: i * 0.04 }}
            whileHover={{ y: -2 }}
            whileTap={tekan}
            onClick={() => onPilih(s)}
            title={keteranganSaran(s)}
            className="group inline-flex max-w-full items-center gap-2 rounded-full border border-brand bg-surface px-3.5 py-1.5 text-left text-sm font-semibold text-brand transition-colors hover:bg-brand-soft [@media(pointer:coarse)]:min-h-11"
          >
            {s.sumber === "master" ? <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Check className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />}
            <span className="min-w-0 truncate">{s.nama}</span>
            <span className="hidden shrink-0 text-xs font-normal text-muted sm:inline">{keteranganSaran(s)}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/** <datalist> untuk isian mitra di formulir. Pasang `list={id}` pada <input>. */
export function DatalistMitra({ id, daftarMitra, kontrak }: { id: string; daftarMitra: readonly Mitra[]; kontrak: readonly Kontrak[] }) {
  const opsi = useMemo(() => opsiDatalist(daftarMitra, kontrak), [daftarMitra, kontrak]);
  return (
    <datalist id={id}>
      {opsi.map((n) => (
        <option key={n} value={n} />
      ))}
    </datalist>
  );
}

/** Petunjuk kecil di bawah isian mitra formulir: nama mirip yang mungkin dimaksud (bukan pengganti datalist). */
export function PetunjukMitraMirip({ teks, daftarMitra, kontrak, onPilih }: { teks: string; daftarMitra: readonly Mitra[]; kontrak: readonly Kontrak[]; onPilih: (s: SaranNamaMitra) => void }) {
  const s = useMemo(() => cariMitraSerupa(teks, daftarMitra, kontrak).find((x) => x.alasan === "mirip"), [teks, daftarMitra, kontrak]);
  if (!s || s.nama === teks.trim()) return null;
  return (
    <p className="mt-1 text-xs text-muted [@media(pointer:coarse)]:flex [@media(pointer:coarse)]:flex-wrap [@media(pointer:coarse)]:items-center [@media(pointer:coarse)]:gap-x-1" role="status">
      Maksudnya{" "}
      <button type="button" onClick={() => onPilih(s)} className="break-words text-left font-semibold text-brand underline decoration-dotted underline-offset-2 hover:text-brand-strong [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">
        {s.nama}
      </button>
      ?
    </p>
  );
}
