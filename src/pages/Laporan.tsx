// Halaman Laporan (Ruang Admin): kinerja layanan Legal dan portofolio nilai kontrak.
// Semua angka dihitung di klien dari list Kontrak dan riwayat status; tidak ada kolom turunan.
import { lazy, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { AlarmClock, BarChart3, CalendarClock, CalendarRange, Clock3, FileSpreadsheet, Gauge, Info, Layers, RefreshCcw, Repeat2, Scale, Timer, Users2, Wallet } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { useMuat } from "../hooks/useMuat";
import { useDaftarKontrak } from "../hooks/useDaftarKontrak";
import { ambilSemuaEventStatus, kosongkanCacheRiwayat } from "../services/riwayatStatus";
import { DATA_TIPIS_DI_BAWAH, MIN_SAMPEL, periodeDari, susunLaporan, type DurasiTahap, type HasilDurasi, type Mengendap, type PresetPeriode } from "../lib/laporan";
import { susunPortofolio, type BarisAgregat, type NilaiMataUang } from "../lib/portofolio";
import { eksporKontrakExcel, kontrakUntukPeriode } from "../lib/ekspor";
import { kueriPreset, tulisFilterKerja } from "../lib/filterKerja";
import { formatUang, formatUangRingkas, formatWaktu } from "../lib/format";
import { EASE_KELUAR } from "../lib/gerak";
import { acak } from "../lib/kata";
import type { Kontrak, MataUang, Status } from "../lib/types";
import { AngkaHidup, Isian, Item, KepalaHalaman, KerangkaHalaman, Kontainer, KotakError, Kosong, Lencana, LencanaStatus, Segmen, Tombol, cx } from "../components/ui";
import { GrafikTunda } from "../components/GrafikTunda";

// Grafik (recharts) dimuat malas setelah ubin angka tampil; chunk "grafik" tidak ikut diunduh bersama halaman (U39).
const GrafikBulanan = lazy(() => import("../components/GrafikLaporan").then((m) => ({ default: m.GrafikBulanan })));
const GrafikKalender = lazy(() => import("../components/GrafikLaporan").then((m) => ({ default: m.GrafikKalender })));

type Tab = "layanan" | "portofolio";
type Satuan = "kerja" | "kalender";

const PILIHAN_PERIODE: { nilai: PresetPeriode; label: string }[] = [
  { nilai: "bulan-ini", label: "Bulan ini" },
  { nilai: "3-bulan", label: "3 bulan" },
  { nilai: "tahun-ini", label: "Tahun ini" },
  { nilai: "kustom", label: "Kustom" },
];

const KETERANGAN_TAHAP: Partial<Record<Status, string>> = {
  Diajukan: "Menunggu giliran di antrean",
  "Review Legal": "Ditelaah Legal",
  "Perlu Revisi": "Menunggu revisi dari pengaju",
  "Proses Tanda Tangan": "Tanda tangan para pihak",
};

const WARNA_TAHAP: Partial<Record<Status, string>> = {
  Diajukan: "var(--wh-ink-muted)",
  "Review Legal": "var(--wh-info)",
  "Perlu Revisi": "var(--wh-accent)",
  "Proses Tanda Tangan": "var(--wh-brand)",
};

const SIMBOL: Record<MataUang, string> = { IDR: "Rp", USD: "USD", EUR: "EUR", SGD: "SGD" };

const fmtDesimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** "6 jam", "2,5 hari", "2,5 hari kerja". */
function teksHari(n: number, satuan: Satuan): string {
  if (n < 1) return `${Math.max(1, Math.round(n * 24))} jam`;
  return `${fmtDesimal.format(n)} ${satuan === "kerja" ? "hari kerja" : "hari"}`;
}

const uangRingkas = (n: number, m: MataUang) => `${SIMBOL[m]} ${formatUangRingkas(n)}`;

// Tautan portofolio ke Daftar Kontrak memakai cakupan yang sama dengan angkanya (kontrak induk yang masih berlaku),
// supaya jumlah baris di daftar sama dengan jumlah yang tertulis di kartu.
const keBerlaku = (lain: Record<string, string> = {}) => `/kontrak?${tulisFilterKerja({ berakhir: "berlaku" }, new URLSearchParams(lain)).toString()}`;

export default function Laporan() {
  const { sesi } = useSesi();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "portofolio" ? "portofolio" : "layanan";
  const [preset, setPreset] = useState<PresetPeriode>("bulan-ini");
  const [kustom, setKustom] = useState({ dari: "", sampai: "" });
  const [mengekspor, setMengekspor] = useState<"" | "periode" | "bulan">("");

  // Kontrak dari cache bersama (U39); riwayat status dimuat terpisah karena hanya dipakai halaman ini.
  const kontrakQ = useDaftarKontrak();
  const eventQ = useMuat(ambilSemuaEventStatus, []);
  const data = useMemo(() => (kontrakQ.data && eventQ.data ? { kontrak: kontrakQ.data, event: eventQ.data, waktu: kontrakQ.waktu || Date.now() } : null), [kontrakQ.data, kontrakQ.waktu, eventQ.data]);
  const loading = kontrakQ.loading || eventQ.loading;
  const error = kontrakQ.error ?? eventQ.error;
  const muatUlang = async () => {
    await Promise.all([kontrakQ.muatUlang(), eventQ.muatUlang()]);
  };

  const periode = useMemo(() => (data ? periodeDari(preset, data.waktu, kustom) : null), [data, preset, kustom]);
  const laporan = useMemo(() => (data && periode ? susunLaporan(data.kontrak, data.event, periode, data.waktu) : null), [data, periode]);
  const portofolio = useMemo(() => (data ? susunPortofolio(data.kontrak, data.waktu) : null), [data]);
  const sapaan = useMemo(() => acak(["Angka-angka ini dihitung langsung dari riwayat status, tanpa rekap manual.", "Lihat di tahap mana kontrak paling lama tertahan, lalu bawa ke rapat.", "Semua dihitung dari data terbaru di SharePoint."]), []);

  if (sesi.peran === "Pengaju") {
    return <Kosong judul="Halaman ini khusus tim Legal" teks="Laporan dan portofolio hanya tersedia di Ruang Admin." />;
  }
  if (loading && !data) return <KerangkaHalaman />;
  if (error != null && !data) return <KotakError error={error} ulangi={() => void muatUlang()} />;
  if (!data || !portofolio) return null;

  const gantiTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    if (t === "layanan") p.delete("tab");
    else p.set("tab", t);
    setParams(p, { replace: true });
  };

  const segarkan = () => {
    kosongkanCacheRiwayat();
    void muatUlang();
  };

  async function ekspor(jenis: "periode" | "bulan") {
    if (!data) return;
    const p = jenis === "bulan" ? periodeDari("bulan-ini", data.waktu) : periode;
    if (!p) {
      toast.error("Lengkapi dulu tanggal periode kustomnya.");
      return;
    }
    if (jenis === "bulan") setPreset("bulan-ini");
    setMengekspor(jenis);
    try {
      const lap = susunLaporan(data.kontrak, data.event, p, data.waktu);
      const kontrak = kontrakUntukPeriode(data.kontrak, data.event, p);
      await eksporKontrakExcel(kontrak, data.kontrak, {
        namaBerkas: `laporan-kontrak-wki-${p.dari}-sd-${p.sampai}`,
        cakupan: `${p.label}: kontrak yang masuk, mendapat hasil, atau masih diproses`,
        sekarang: data.waktu,
        laporan: lap,
        riwayat: data.event,
      });
      toast.success(acak(["Berkas Excel siap, cek folder unduhan Anda.", "Laporan sudah diunduh. Siap dibawa ke rapat.", "Beres, berkas Excel sudah tersimpan."]));
    } catch (err) {
      toast.error("Berkas Excel belum berhasil dibuat. Coba sekali lagi.", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setMengekspor("");
    }
  }

  return (
    <div className="min-w-0">
      <KepalaHalaman
        judul="Laporan"
        sub={
          <>
            {sapaan} <span className="whitespace-nowrap">Data per {formatWaktu(new Date(data.waktu).toISOString())}.</span>
          </>
        }
        aksi={
          <>
            <Tombol varian="hantu" kecil className="min-h-[44px]" ikon={<RefreshCcw className={cx("h-4 w-4", loading && "animate-spin")} />} onClick={segarkan} disabled={loading}>
              Segarkan
            </Tombol>
            <Tombol varian="kedua" ikon={<CalendarClock className="h-4 w-4" />} memuat={mengekspor === "bulan"} disabled={!!mengekspor} onClick={() => void ekspor("bulan")}>
              Laporan bulan ini
            </Tombol>
            <Tombol ikon={<FileSpreadsheet className="h-4 w-4" />} memuat={mengekspor === "periode"} disabled={!!mengekspor || !periode} onClick={() => void ekspor("periode")}>
              Ekspor Excel
            </Tombol>
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-full overflow-x-auto">
          <Segmen
            id="tab-laporan"
            label="Jenis laporan"
            nilai={tab}
            onUbah={gantiTab}
            pilihan={[
              { nilai: "layanan", label: "Laporan Layanan", ikon: <Gauge className="h-4 w-4" aria-hidden="true" /> },
              { nilai: "portofolio", label: "Portofolio", ikon: <Wallet className="h-4 w-4" aria-hidden="true" /> },
            ]}
          />
        </div>
        {tab === "layanan" && (
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
            <div className="max-w-full overflow-x-auto">
              <Segmen id="periode-laporan" label="Periode laporan" nilai={preset} onUbah={setPreset} pilihan={PILIHAN_PERIODE} />
            </div>
            {preset === "kustom" && (
              <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                <Isian label="Dari">
                  <input type="date" className="input" value={kustom.dari} max={kustom.sampai || undefined} onChange={(e) => setKustom((k) => ({ ...k, dari: e.target.value }))} />
                </Isian>
                <Isian label="Sampai">
                  <input type="date" className="input" value={kustom.sampai} min={kustom.dari || undefined} onChange={(e) => setKustom((k) => ({ ...k, sampai: e.target.value }))} />
                </Isian>
              </div>
            )}
          </div>
        )}
      </div>

      {error != null && (
        <div className="mb-4">
          <KotakError error={error} ulangi={segarkan} />
        </div>
      )}

      {tab === "layanan" ? (
        laporan ? (
          <TabLayanan laporan={laporan} kontrak={data.kontrak} />
        ) : (
          <section className="kartu">
            <Kosong ikon={<CalendarRange className="h-6 w-6" />} judul="Pilih rentang tanggalnya dulu" teks="Isi tanggal mulai dan akhir. Tanggal akhir tidak boleh sebelum tanggal mulai." />
          </section>
        )
      ) : (
        <TabPortofolio portofolio={portofolio} kontrak={data.kontrak} />
      )}
    </div>
  );
}

// --- Bagian bersama -----------------------------------------------------------------------------------

function Kartu({ judul, ikon, sub, kanan, children, className, id }: { judul: string; ikon?: ReactNode; sub?: ReactNode; kanan?: ReactNode; children: ReactNode; className?: string; id: string }) {
  return (
    <section className={cx("kartu h-full min-w-0 p-5 sm:p-6", className)} aria-labelledby={id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="flex items-center gap-2 text-lg font-bold">
            {ikon && (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
                {ikon}
              </span>
            )}
            {judul}
          </h2>
          {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
        </div>
        {kanan}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Sampel({ n }: { n: number }) {
  return (
    <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", n < MIN_SAMPEL ? "bg-accent-soft text-accent-ink" : "bg-raised text-muted")}>
      n = {n}
    </span>
  );
}

function Ubin({ label, nilai, keterangan, ikon, nada = "brand" }: { label: string; nilai: ReactNode; keterangan: ReactNode; ikon: ReactNode; nada?: "brand" | "info" | "accent" | "danger" }) {
  const warna = { brand: "bg-brand-soft text-brand", info: "bg-info-soft text-info", accent: "bg-accent-soft text-accent-ink", danger: "bg-danger-soft text-danger" }[nada];
  return (
    <Item className="min-w-0">
      <div className="kartu h-full p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-muted">{label}</p>
          <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", warna)} aria-hidden="true">
            {ikon}
          </span>
        </div>
        <p className="mt-3 text-3xl font-extrabold leading-none tracking-tight sm:text-4xl">{nilai}</p>
        <div className="mt-2 text-xs text-muted">{keterangan}</div>
      </div>
    </Item>
  );
}

function Batang({ persen, warna, label }: { persen: number; warna: string; label?: string }) {
  return (
    <span className="block h-2 overflow-hidden rounded-full bg-raised" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <motion.span className="block h-full rounded-full" style={{ background: warna }} initial={{ width: 0 }} animate={{ width: `${Math.max(persen > 0 ? 3 : 0, Math.min(100, persen))}%` }} transition={{ duration: 0.8, ease: EASE_KELUAR }} />
    </span>
  );
}

// --- Tab Laporan Layanan --------------------------------------------------------------------------------

function TabLayanan({ laporan, kontrak }: { laporan: NonNullable<ReturnType<typeof susunLaporan>>; kontrak: Kontrak[] }) {
  const [satuan, setSatuan] = useState<Satuan>("kerja");
  const { ke } = useRuang();
  const peta = useMemo(() => new Map(kontrak.map((k) => [k.id, k])), [kontrak]);
  const siklus = laporan.siklus.statistik;

  return (
    <Kontainer className="grid grid-cols-12 gap-4 lg:gap-5" jeda={0.05}>
      {laporan.dataTipis && (
        <Item className="col-span-12">
          <p className="flex items-start gap-2 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-ink" role="note">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Datanya masih tipis untuk {laporan.periode.label.toLowerCase()}: baru {laporan.sampelTahap} tahap yang selesai (idealnya {DATA_TIPIS_DI_BAWAH} atau lebih). Angka di bawah sebaiknya dibaca sebagai gambaran awal. Statistik dengan sampel di bawah {MIN_SAMPEL} sengaja tidak ditampilkan.
            </span>
          </p>
        </Item>
      )}

      <div className="col-span-12 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
        <Ubin label="Kontrak masuk" ikon={<Layers className="h-5 w-5" />} nilai={<AngkaHidup nilai={laporan.kontrakMasuk} />} keterangan={laporan.periode.label} />
        <Ubin label="Mendapat hasil" nada="info" ikon={<BarChart3 className="h-5 w-5" />} nilai={<AngkaHidup nilai={laporan.kontrakSelesai} />} keterangan="Aktif, ditolak, atau dibatalkan" />
        <Ubin
          label="Siklus median"
          nada="accent"
          ikon={<Timer className="h-5 w-5" />}
          nilai={siklus ? <span className="angka">{fmtDesimal.format(satuan === "kerja" ? siklus.kerja.median : siklus.kalender.median)}</span> : <span className="text-muted">-</span>}
          keterangan={
            <span className="flex flex-wrap items-center gap-1.5">
              {siklus ? `${satuan === "kerja" ? "hari kerja" : "hari"}, diajukan sampai aktif` : "Sampel belum cukup"} <Sampel n={laporan.siklus.sampel} />
            </span>
          }
        />
        <Ubin label="Mengendap sekarang" nada="danger" ikon={<AlarmClock className="h-5 w-5" />} nilai={<AngkaHidup nilai={laporan.mengendap.length} />} keterangan="Melewati batas SLA tahapnya" />
      </div>

      <Item className="col-span-12 min-w-0 lg:col-span-7">
        <Kartu
          id="judul-tahap"
          judul="Waktu per tahap"
          ikon={<Clock3 className="h-4 w-4" />}
          sub="Median dan P90 dari tahap yang selesai di periode ini. P90 artinya 9 dari 10 kontrak selesai secepat itu atau lebih cepat."
          kanan={<Segmen id="satuan-hari" label="Satuan hari" nilai={satuan} onUbah={setSatuan} pilihan={[{ nilai: "kerja", label: "Hari kerja" }, { nilai: "kalender", label: "Kalender" }]} />}
        >
          <DaftarTahap tahap={laporan.tahap} satuan={satuan} />
        </Kartu>
      </Item>

      <Item className="col-span-12 min-w-0 lg:col-span-5">
        <Kartu id="judul-legal-pengaju" judul="Waktu Legal dan pengaju" ikon={<Scale className="h-4 w-4" />} sub="Dijumlahkan per kontrak. Perlu Revisi dihitung sebagai waktu menunggu pengaju, bukan kinerja Legal.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <BlokDurasi judul="Di tangan Legal" keterangan="Antre, review, dan tanda tangan" hasil={laporan.legalVsPengaju.legal} satuan={satuan} warna="var(--wh-brand)" />
            <BlokDurasi judul="Menunggu pengaju" keterangan="Selama status Perlu Revisi" hasil={laporan.legalVsPengaju.pengaju} satuan={satuan} warna="var(--wh-accent)" />
          </div>
        </Kartu>
      </Item>

      <Item className="col-span-12 min-w-0 lg:col-span-8">
        <Kartu id="judul-bulanan" judul="Masuk dan selesai per bulan" ikon={<BarChart3 className="h-4 w-4" />} sub="Selesai = pertama kali mendapat hasil: aktif, ditolak, atau dibatalkan.">
          {laporan.bulanan.every((b) => b.diajukan === 0 && b.selesai === 0) ? (
            <Kosong judul="Belum ada pergerakan" teks="Belum ada kontrak yang masuk atau selesai di periode ini." />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted" aria-hidden="true">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--wh-brand)" }} /> Diajukan
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--wh-accent)" }} /> Selesai
                </span>
              </div>
              <div className="h-64" aria-hidden="true">
                <GrafikTunda>
                  <GrafikBulanan data={laporan.bulanan} />
                </GrafikTunda>
              </div>
              <table className="sr-only">
                <caption>Jumlah kontrak diajukan dan selesai per bulan, {laporan.periode.label}</caption>
                <thead>
                  <tr>
                    <th scope="col">Bulan</th>
                    <th scope="col">Diajukan</th>
                    <th scope="col">Selesai</th>
                  </tr>
                </thead>
                <tbody>
                  {laporan.bulanan.map((b) => (
                    <tr key={b.kunci}>
                      <th scope="row">{b.label}</th>
                      <td>{b.diajukan}</td>
                      <td>{b.selesai}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Kartu>
      </Item>

      <Item className="col-span-12 min-w-0 lg:col-span-4">
        <Kartu id="judul-revisi" judul="Putaran revisi" ikon={<Repeat2 className="h-4 w-4" />} sub={`Untuk ${laporan.revisi.kontrakDicakup} kontrak yang masuk di periode ini.`}>
          {laporan.revisi.kontrakDicakup === 0 ? (
            <Kosong judul="Belum ada kontrak masuk" teks="Putaran revisi muncul setelah ada pengajuan di periode ini." />
          ) : (
            <>
              <div className="flex items-end gap-3">
                <p className="judul text-4xl leading-none">{laporan.revisi.rataRata == null ? <span className="text-muted">-</span> : fmtDesimal.format(laporan.revisi.rataRata)}</p>
                <p className="pb-1 text-sm text-muted">
                  rata-rata putaran per kontrak <Sampel n={laporan.revisi.kontrakDicakup} />
                </p>
              </div>
              {laporan.revisi.rataRata == null && <p className="mt-2 text-xs text-muted">Rata-rata ditampilkan setelah ada minimal {MIN_SAMPEL} kontrak.</p>}
              <ul className="mt-5 space-y-2.5">
                {laporan.revisi.distribusi.map((d) => (
                  <li key={d.putaran} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-3 text-sm">
                    <span className="text-muted">{d.putaran === 0 ? "Tanpa revisi" : d.putaran === 3 ? "3 kali atau lebih" : `${d.putaran} kali`}</span>
                    <Batang persen={(d.jumlah / Math.max(1, laporan.revisi.kontrakDicakup)) * 100} warna={d.putaran === 0 ? "var(--wh-success)" : d.putaran >= 2 ? "var(--wh-danger)" : "var(--wh-accent)"} />
                    <span className="angka text-right font-bold">{d.jumlah}</span>
                  </li>
                ))}
              </ul>
              {laporan.revisi.terbanyak.length > 0 && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Paling sering direvisi</p>
                  <ul className="mt-2 space-y-1">
                    {laporan.revisi.terbanyak.map((t) => {
                      const k = peta.get(t.kontrakId);
                      return (
                        <li key={t.kontrakId}>
                          <Link to={ke.detail(t.kontrakId)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-raised focus-visible:bg-raised [@media(pointer:coarse)]:min-h-11" title={k?.judul}>
                            <span className="min-w-0 flex-1 truncate">{k ? k.judul : `Kontrak #${t.kontrakId}`}</span>
                            <Lencana nada={t.putaran >= 2 ? "bahaya" : "peringatan"}>{t.putaran}x</Lencana>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </Kartu>
      </Item>

      <Item className="col-span-12 min-w-0">
        <DaftarMengendap mengendap={laporan.mengendap} />
      </Item>
    </Kontainer>
  );
}

function DaftarTahap({ tahap, satuan }: { tahap: DurasiTahap[]; satuan: Satuan }) {
  const ukuran = (t: DurasiTahap) => (t.statistik ? t.statistik[satuan] : null);
  const maks = Math.max(1, ...tahap.map((t) => ukuran(t)?.p90 ?? 0));
  return (
    <ul className="space-y-4">
      {tahap.map((t) => {
        const u = ukuran(t);
        return (
          <li key={t.tahap} className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 font-semibold">
                {t.tahap} <span className="text-xs font-normal text-muted">· {KETERANGAN_TAHAP[t.tahap]}</span>
              </p>
              <p className="flex items-center gap-2 text-sm">
                {u ? (
                  <>
                    <span>
                      median <strong className="angka">{teksHari(u.median, satuan)}</strong>
                    </span>
                    <span className="text-muted">P90 {teksHari(u.p90, satuan)}</span>
                  </>
                ) : (
                  <span className="text-muted">Sampel belum cukup</span>
                )}
                <Sampel n={t.sampel} />
              </p>
            </div>
            <div className="relative mt-2">
              {u ? (
                <>
                  <Batang persen={(u.p90 / maks) * 100} warna="var(--wh-line)" />
                  <span className="absolute inset-0">
                    <Batang persen={(u.median / maks) * 100} warna={WARNA_TAHAP[t.tahap] ?? "var(--wh-brand)"} label={`${t.tahap}: median ${teksHari(u.median, satuan)}, P90 ${teksHari(u.p90, satuan)}, dari ${t.sampel} sampel`} />
                  </span>
                </>
              ) : (
                <span className="block h-2 rounded-full border border-dashed border-line" aria-hidden="true" />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function BlokDurasi({ judul, keterangan, hasil, satuan, warna }: { judul: string; keterangan: string; hasil: HasilDurasi; satuan: Satuan; warna: string }) {
  const u = hasil.statistik?.[satuan];
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: warna }} aria-hidden="true" />
          {judul}
        </p>
        <Sampel n={hasil.sampel} />
      </div>
      <p className="mt-3 text-2xl font-extrabold leading-none">{u ? teksHari(u.median, satuan) : <span className="text-muted">-</span>}</p>
      <p className="mt-1 text-xs text-muted">{u ? `median · P90 ${teksHari(u.p90, satuan)}` : hasil.sampel === 0 ? "Belum ada data di periode ini" : `Butuh minimal ${MIN_SAMPEL} kontrak`}</p>
      <p className="mt-2 text-xs text-muted">{keterangan}</p>
    </div>
  );
}

function DaftarMengendap({ mengendap }: { mengendap: Mengendap[] }) {
  const { ke } = useRuang();
  return (
    <section className="kartu min-w-0 overflow-hidden" aria-labelledby="judul-mengendap">
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pb-3 pt-5 sm:px-6">
        <div>
          <h2 id="judul-mengendap" className="flex items-center gap-2 text-lg font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-danger-soft text-danger" aria-hidden="true">
              <AlarmClock className="h-4 w-4" />
            </span>
            Kontrak mengendap
          </h2>
          <p className="mt-1 text-sm text-muted">Kondisi saat ini, tidak terpengaruh filter periode. Yang paling lama lewat batas di atas.</p>
        </div>
        {mengendap.length > 0 && <Lencana nada="bahaya">{mengendap.length} kontrak</Lencana>}
      </div>
      {mengendap.length === 0 ? (
        <Kosong judul="Tidak ada yang mengendap" teks={acak(["Semua kontrak masih dalam batas waktu wajar tahapnya.", "Bersih! Tidak ada kontrak yang melewati batas SLA."])} />
      ) : (
        <>
          <ul className="divide-y divide-line md:hidden">
            {mengendap.map((m) => (
              <li key={m.kontrak.id}>
                <Link to={ke.detail(m.kontrak.id)} className="block px-5 py-4 transition-colors hover:bg-raised focus-visible:bg-raised">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="teks-panjang font-semibold">{m.kontrak.judul}</p>
                      <p className="text-xs text-muted">{m.kontrak.nomorPengajuan}</p>
                    </div>
                    <Lencana nada="bahaya">lewat {fmtDesimal.format(m.lewatHari)} hari</Lencana>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <LencanaStatus status={m.kontrak.status} />
                    <span>Menunggu {m.menunggu === "Legal" ? m.kontrak.picLegalNama || "Legal" : "pengaju"}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="tabel w-full text-sm">
              <thead>
                <tr>
                  <th scope="col">Kontrak</th>
                  <th scope="col">Status</th>
                  <th scope="col">Menunggu</th>
                  <th scope="col" className="text-right">
                    Umur tahap
                  </th>
                  <th scope="col" className="text-right">
                    Batas
                  </th>
                  <th scope="col" className="text-right">
                    Lewat
                  </th>
                </tr>
              </thead>
              <tbody>
                {mengendap.map((m) => (
                  <tr key={m.kontrak.id}>
                    <td className="max-w-[22rem]">
                      <Link to={ke.detail(m.kontrak.id)} className="block truncate font-semibold hover:text-brand focus-visible:text-brand" title={m.kontrak.judul}>
                        {m.kontrak.judul}
                      </Link>
                      <span className="text-xs text-muted">{m.kontrak.nomorPengajuan}</span>
                    </td>
                    <td>
                      <LencanaStatus status={m.kontrak.status} />
                    </td>
                    <td>{m.menunggu === "Legal" ? m.kontrak.picLegalNama || "Legal (belum ada PIC)" : `Pengaju · ${m.kontrak.pengajuNama || m.kontrak.divisi}`}</td>
                    <td className="angka text-right">{fmtDesimal.format(m.umurHari)} hari</td>
                    <td className="angka text-right text-muted">{m.batasHari} hari</td>
                    <td className="text-right">
                      <Lencana nada="bahaya">{fmtDesimal.format(m.lewatHari)} hari</Lencana>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

// --- Tab Portofolio ------------------------------------------------------------------------------------------

function DaftarNilai({ nilai, kosong = "-" }: { nilai: NilaiMataUang[]; kosong?: string }) {
  if (!nilai.length) return <span className="text-muted">{kosong}</span>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {nilai.map((n) => (
        <span key={n.mataUang} className="angka whitespace-nowrap" title={formatUang(n.total, n.mataUang)}>
          {uangRingkas(n.total, n.mataUang)}
        </span>
      ))}
    </span>
  );
}

function TabPortofolio({ portofolio: pf, kontrak }: { portofolio: ReturnType<typeof susunPortofolio>; kontrak: Kontrak[] }) {
  const [pilihMu, setPilihMu] = useState<MataUang | null>(null);
  const mu: MataUang = pilihMu && pf.mataUangAda.includes(pilihMu) ? pilihMu : (pf.mataUangAda[0] ?? "IDR");
  const totalMu = (b: BarisAgregat) => b.nilai.find((n) => n.mataUang === mu)?.total ?? 0;
  const kalender = pf.kalenderBerakhir.map((b) => ({ ...b, nilaiMu: b.nilai.find((n) => n.mataUang === mu)?.total ?? 0 }));
  const adaKontrak = kontrak.length > 0;

  if (!adaKontrak) {
    return (
      <section className="kartu">
        <Kosong ikon={<Wallet className="h-6 w-6" />} judul="Portofolio masih kosong" teks="Angka portofolio muncul setelah ada kontrak yang berlaku." />
      </section>
    );
  }

  return (
    <Kontainer className="grid grid-cols-12 gap-4 lg:gap-5" jeda={0.05}>
      <Item className="col-span-12 min-w-0 lg:col-span-5">
        <section className="hero-bg relative h-full overflow-hidden rounded-[28px] p-6 text-hero-on shadow-pop sm:p-7" aria-labelledby="judul-komitmen">
          <div className="titik-halus pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
          <div className="relative">
            <h2 id="judul-komitmen" className="text-sm font-semibold opacity-90">
              Komitmen kontrak aktif
            </h2>
            {pf.komitmen.nilai.length === 0 ? (
              <p className="judul mt-3 text-3xl">Belum ada nilai</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {pf.komitmen.nilai.map((n) => (
                  <li key={n.mataUang} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="judul text-3xl sm:text-4xl">
                      <span className="align-top text-lg opacity-80">{SIMBOL[n.mataUang]} </span>
                      <AngkaHidup nilai={Math.round(n.total)} format={formatUangRingkas} />
                    </span>
                    <span className="text-xs opacity-80">{n.jumlah} kontrak</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-sm leading-relaxed opacity-90">
              {pf.komitmen.jumlahKontrak} kontrak berlaku, sudah termasuk addendum aktif. Mata uang ditampilkan terpisah tanpa konversi kurs.
              {pf.komitmen.tanpaNilai > 0 && ` ${pf.komitmen.tanpaNilai} kontrak tanpa nilai (misalnya MoU) dihitung jumlahnya saja.`}
            </p>
            {pf.lewatMasa.jumlahKontrak > 0 && (
              <Link to={`/kontrak${kueriPreset("lewat-masa")}`} className="mt-4 flex min-h-[44px] items-start gap-2 rounded-xl bg-accent-soft px-3 py-2 text-xs font-semibold text-accent-ink">
                <AlarmClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {pf.lewatMasa.jumlahKontrak} kontrak berstatus Aktif sudah lewat masa berlakunya dan tidak dihitung
                  {pf.lewatMasa.nilai.length > 0 && <> ({pf.lewatMasa.nilai.map((n) => uangRingkas(n.total, n.mataUang)).join(", ")})</>}. Perlu ditutup?
                </span>
              </Link>
            )}
          </div>
        </section>
      </Item>

      <Item className="col-span-12 min-w-0 lg:col-span-7">
        <Kartu id="judul-pipeline" judul="Pipeline di Legal" ikon={<Layers className="h-4 w-4" />} sub="Nilai yang diajukan dan masih diproses, dari antrean sampai tanda tangan.">
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {pf.pipeline.map((t) => (
              <li key={t.status} className="min-w-0">
                <Link to={`/kontrak?${tulisFilterKerja({ addendum: "tanpa" }, new URLSearchParams({ status: t.status })).toString()}`} className="block h-full rounded-2xl border border-line bg-raised p-4 transition-colors hover:border-brand hover:bg-surface focus-visible:border-brand">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase leading-tight tracking-wide text-muted">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: WARNA_TAHAP[t.status] }} aria-hidden="true" />
                    <span className="min-w-0 break-words">{t.status}</span>
                  </span>
                  <span className="mt-2 block text-2xl font-extrabold leading-none">{t.jumlahKontrak}</span>
                  <span className="mt-2 block text-xs">
                    <DaftarNilai nilai={t.nilai} kosong={t.jumlahKontrak ? "tanpa nilai" : "-"} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-sm">
            <span className="font-semibold">Total pipeline</span>
            <DaftarNilai nilai={pf.pipelineTotal.nilai} />
            {pf.addendumBerjalan.jumlahKontrak > 0 && (
              <span className="text-xs text-muted">
                + {pf.addendumBerjalan.jumlahKontrak} addendum diproses
                {pf.addendumBerjalan.nilai.length > 0 && <> (selisih {pf.addendumBerjalan.nilai.map((n) => `${n.total > 0 ? "+" : ""}${uangRingkas(n.total, n.mataUang)}`).join(", ")})</>}
              </span>
            )}
          </div>
        </Kartu>
      </Item>

      {pf.mataUangAda.length > 1 && (
        <Item className="col-span-12 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">Grafik di bawah dalam mata uang:</p>
          <Segmen id="mata-uang-portofolio" label="Mata uang grafik" nilai={mu} onUbah={setPilihMu} pilihan={pf.mataUangAda.map((m) => ({ nilai: m, label: m }))} />
        </Item>
      )}

      <Item className="col-span-12 min-w-0 lg:col-span-6">
        <Kartu id="judul-divisi" judul="Per divisi" ikon={<Users2 className="h-4 w-4" />} sub={`Kontrak aktif, nilai dalam ${mu}. Ketuk untuk membuka daftarnya.`}>
          <DaftarBatang baris={pf.perDivisi} total={totalMu} mu={mu} tautan={(b) => keBerlaku({ divisi: b.kunci })} />
        </Kartu>
      </Item>

      <Item className="col-span-12 min-w-0 lg:col-span-6">
        <Kartu id="judul-jenis" judul="Per jenis" ikon={<Layers className="h-4 w-4" />} sub={`Kontrak aktif, nilai dalam ${mu}.`}>
          <DaftarBatang baris={pf.perJenis} total={totalMu} mu={mu} tautan={(b) => keBerlaku({ jenis: b.kunci })} />
        </Kartu>
      </Item>

      <Item className="col-span-12 min-w-0 lg:col-span-5">
        <Kartu id="judul-mitra" judul="10 mitra teratas" ikon={<Wallet className="h-4 w-4" />} sub={`Menurut nilai efektif kontrak aktif dalam ${mu}.`}>
          {pf.mitraTeratas[mu]?.length ? (
            <ol className="space-y-1">
              {pf.mitraTeratas[mu]!.map((m, i) => (
                <li key={m.kunci}>
                  <Link to={keBerlaku({ q: m.label })} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-raised focus-visible:bg-raised">
                    <span className="angka text-xs font-bold text-muted">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold" title={m.label}>{m.label}</span>
                      <span className="block text-xs text-muted">{m.jumlahKontrak} kontrak</span>
                    </span>
                    <span className="angka whitespace-nowrap font-bold" title={formatUang(totalMu(m), mu)}>
                      {uangRingkas(totalMu(m), mu)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <Kosong judul="Belum ada mitra bernilai" teks={`Belum ada kontrak aktif bernilai ${mu}.`} />
          )}
        </Kartu>
      </Item>

      <Item className="col-span-12 min-w-0 lg:col-span-7">
        <Kartu id="judul-kalender" judul="Kapan nilai kontrak berakhir" ikon={<CalendarClock className="h-4 w-4" />} sub={`12 bulan ke depan, menurut masa berlaku efektif. Batang = nilai ${mu}.`}>
          {kalender.every((b) => b.jumlahKontrak === 0) ? (
            <Kosong judul="Tidak ada yang berakhir" teks="Tidak ada kontrak aktif yang berakhir dalam 12 bulan ke depan." />
          ) : (
            <>
              <div className="h-56" aria-hidden="true">
                <GrafikTunda>
                  <GrafikKalender data={kalender} mu={mu} />
                </GrafikTunda>
              </div>
              <table className="sr-only">
                <caption>Kontrak aktif yang berakhir per bulan, 12 bulan ke depan</caption>
                <thead>
                  <tr>
                    <th scope="col">Bulan</th>
                    <th scope="col">Jumlah kontrak</th>
                    <th scope="col">Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {kalender.map((b) => (
                    <tr key={b.kunci}>
                      <th scope="row">{b.label}</th>
                      <td>{b.jumlahKontrak}</td>
                      <td>{b.nilai.length ? b.nilai.map((n) => formatUang(n.total, n.mataUang)).join(", ") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Jumlah kontrak berakhir per bulan">
                {kalender
                  .filter((b) => b.jumlahKontrak > 0)
                  .map((b) => (
                    <li key={b.kunci} className="rounded-full bg-raised px-2.5 py-1">
                      <span className="font-semibold">{b.label}</span> <span className="text-muted">· {b.jumlahKontrak} kontrak</span>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </Kartu>
      </Item>
    </Kontainer>
  );
}

function DaftarBatang({ baris, total, mu, tautan }: { baris: BarisAgregat[]; total: (b: BarisAgregat) => number; mu: MataUang; tautan: (b: BarisAgregat) => string }) {
  if (!baris.length) return <Kosong judul="Belum ada kontrak aktif" />;
  const urut = [...baris].sort((a, b) => total(b) - total(a) || b.jumlahKontrak - a.jumlahKontrak);
  const maks = Math.max(1, ...urut.map(total));
  return (
    <ul className="space-y-1">
      {urut.map((b) => {
        const n = total(b);
        return (
          <li key={b.kunci}>
            <Link to={tautan(b)} className="block rounded-xl px-2 py-2 transition-colors hover:bg-raised focus-visible:bg-raised">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-semibold" title={b.label}>{b.label}</span>
                <span className="angka whitespace-nowrap font-bold" title={formatUang(n, mu)}>
                  {n ? uangRingkas(n, mu) : <span className="font-normal text-muted">-</span>}
                </span>
              </span>
              <span className="mt-1.5 block">
                <Batang persen={(n / maks) * 100} warna="var(--wh-brand)" />
              </span>
              <span className="mt-1 block text-xs text-muted">
                {b.jumlahKontrak} kontrak
                {b.tanpaNilai > 0 && ` · ${b.tanpaNilai} tanpa nilai`}
                {b.nilai.filter((x) => x.mataUang !== mu).length > 0 && ` · juga ${b.nilai.filter((x) => x.mataUang !== mu).map((x) => uangRingkas(x.total, x.mataUang)).join(", ")}`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

