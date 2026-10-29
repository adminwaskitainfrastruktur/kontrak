// Grafik Dashboard (recharts). Modul ini dimuat terpisah lewat React.lazy dan recharts berada di chunk
// "grafik" (vite.config.ts), jadi ubin KPI dan daftar tampil lebih dulu tanpa menunggu pustaka grafik (U39).
import { useReducedMotion } from "framer-motion";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { Status } from "../lib/types";

const GAYA_TOOLTIP = { background: "var(--wh-surface)", border: "1px solid var(--wh-line)", borderRadius: 12, color: "var(--wh-ink)", fontSize: 13 };

/** Area kecil jumlah pengajuan per bulan di kartu nilai. */
export function GrafikPengajuan({ data }: { data: { nama: string; jumlah: number }[] }) {
  const kurangiGerak = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="isi-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--wh-brand)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--wh-brand)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="nama" tickLine={false} axisLine={false} tick={{ fill: "var(--wh-ink-muted)", fontSize: 11 }} interval={0} padding={{ left: 20, right: 20 }} />
        <Tooltip cursor={{ stroke: "var(--wh-line)" }} contentStyle={GAYA_TOOLTIP} formatter={(v: number) => [`${v} pengajuan`, ""]} labelFormatter={(l) => `Bulan ${l}`} />
        <Area type="monotone" dataKey="jumlah" stroke="var(--wh-brand)" strokeWidth={2.5} fill="url(#isi-area)" isAnimationActive={!kurangiGerak} animationDuration={1200} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Donat komposisi status. */
export function DonatStatus({ data, warna }: { data: { status: Status; jumlah: number }[]; warna: Record<Status, string> }) {
  const kurangiGerak = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="jumlah" nameKey="status" innerRadius={50} outerRadius={74} paddingAngle={3} cornerRadius={6} stroke="none" isAnimationActive={!kurangiGerak} animationDuration={1000} animationEasing="ease-out">
          {data.map((d) => (
            <Cell key={d.status} fill={warna[d.status]} />
          ))}
        </Pie>
        <Tooltip contentStyle={GAYA_TOOLTIP} formatter={(v: number, n: string) => [`${v} kontrak`, n]} />
      </PieChart>
    </ResponsiveContainer>
  );
}
