// Grafik halaman Laporan (recharts). Dimuat terpisah lewat React.lazy, dan recharts berada di chunk "grafik"
// (vite.config.ts), supaya ubin angka tampil lebih dulu tanpa menunggu pustaka grafik (U39).
import { useReducedMotion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatUang, formatUangRingkas } from "../lib/format";
import type { TitikBulan } from "../lib/laporan";
import type { MataUang } from "../lib/types";

const GAYA_TOOLTIP = { background: "var(--wh-surface)", border: "1px solid var(--wh-line)", borderRadius: 12, color: "var(--wh-ink)", fontSize: 13 };

/** Batang kontrak diajukan dan selesai per bulan. */
export function GrafikBulanan({ data }: { data: TitikBulan[] }) {
  const kurangiGerak = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={4}>
        <CartesianGrid vertical={false} stroke="var(--wh-line)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--wh-ink-muted)", fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--wh-ink-muted)", fontSize: 11 }} width={40} />
        <Tooltip cursor={{ fill: "var(--wh-surface-raised)" }} contentStyle={GAYA_TOOLTIP} formatter={(v: number, n: string) => [`${v} kontrak`, n === "diajukan" ? "Diajukan" : "Selesai"]} />
        <Bar dataKey="diajukan" fill="var(--wh-brand)" radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={!kurangiGerak} />
        <Bar dataKey="selesai" fill="var(--wh-accent)" radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={!kurangiGerak} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface TitikKalender {
  kunci: string;
  label: string;
  jumlahKontrak: number;
  nilaiMu: number;
}

/** Batang nilai kontrak yang berakhir per bulan, dalam satu mata uang. */
export function GrafikKalender({ data, mu }: { data: TitikKalender[]; mu: MataUang }) {
  const kurangiGerak = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--wh-line)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--wh-ink-muted)", fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--wh-ink-muted)", fontSize: 11 }} width={48} tickFormatter={(v: number) => formatUangRingkas(v)} />
        <Tooltip cursor={{ fill: "var(--wh-surface-raised)" }} contentStyle={GAYA_TOOLTIP} formatter={(v: number, _n, item) => [`${formatUang(v, mu)} · ${(item.payload as TitikKalender).jumlahKontrak} kontrak`, "Berakhir"]} />
        <Bar dataKey="nilaiMu" fill="var(--wh-info)" radius={[6, 6, 0, 0]} maxBarSize={32} isAnimationActive={!kurangiGerak} />
      </BarChart>
    </ResponsiveContainer>
  );
}
