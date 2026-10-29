// Masa berlaku, batas keputusan, dan perpanjangan otomatis (U34), plus bar plafon kontrak payung (U35).
//   PanelMasa      : di detail kontrak. Legal mengisi klausul perpanjangan otomatis dan masa pemberitahuan.
//   RingkasanMasa  : dua kelompok terpisah, "Diperpanjang otomatis" dan "Akan berakhir", untuk dashboard Legal.
//   BarPlafon      : pemakaian plafon kontrak payung. Hanya angka agregat, aman ditampilkan ke pengaju.
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CalendarClock, Gauge, Hourglass, Pencil, Repeat } from "lucide-react";
import { toast } from "sonner";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { adalahLegal, bisaLihat } from "../lib/alur";
import { adalahAddendum } from "../lib/addendum";
import { formatTanggal, formatUang } from "../lib/format";
import { EASE_KELUAR } from "../lib/gerak";
import { pesanError } from "../lib/graph";
import { bacaMasaPemberitahuan, hariWib, jendelaMasa, kelompokMasa, klausulBelumDiisi, akhirKontrak, batasKeputusan, type JendelaMasa, type TahapMasa } from "../lib/masa";
import { ringkasPlafon } from "../lib/plafon";
import { STATUS_FINAL, type Kontrak } from "../lib/types";
import { ubahKontrak } from "../services/kontrak";
import { Lencana, Tombol, cx } from "./ui";

const LABEL_TAHAP: Record<TahapMasa, string> = {
  mendatang: "Masih lama",
  mendekat: "Mendekat",
  mendesak: "Segera putuskan",
  "lewat-batas": "Lewat batas pemberitahuan",
  berakhir: "Lewat masa berlaku",
};

const NADA_TAHAP: Record<TahapMasa, "netral" | "peringatan" | "bahaya"> = {
  mendatang: "netral",
  mendekat: "peringatan",
  mendesak: "bahaya",
  "lewat-batas": "bahaya",
  berakhir: "bahaya",
};

export function LencanaTahapMasa({ j }: { j: JendelaMasa }) {
  return <Lencana nada={NADA_TAHAP[j.tahap]}>{LABEL_TAHAP[j.tahap]}</Lencana>;
}

function teksSisa(n: number): string {
  if (n === 0) return "hari ini";
  return n > 0 ? `${n} hari lagi` : `lewat ${-n} hari`;
}

// --- Panel di detail kontrak ---------------------------------------------------------

/** Kapan dipasang: kontrak non-addendum yang belum Ditolak/Dibatalkan. Legal bisa mengisi sejak tahap tanda tangan. */
export const panelMasaRelevan = (k: Kontrak) => !adalahAddendum(k) && k.status !== "Ditolak" && k.status !== "Dibatalkan";

export function PanelMasa({ k, semua, onBerubah }: { k: Kontrak; semua: Kontrak[]; onBerubah?: () => Promise<void> | void }) {
  const { sesi } = useSesi();
  const { ruang } = useRuang();
  const [ubah, setUbah] = useState(false);
  const legal = adalahLegal(sesi);
  const bolehUbah = ruang === "admin" && legal && !STATUS_FINAL.includes(k.status);
  const hari = hariWib();

  const akhir = akhirKontrak(k, semua);
  const batas = batasKeputusan(k, semua);
  const jendela = useMemo(() => (k.status === "Aktif" ? jendelaMasa(k, semua, hari) : null), [k, semua, hari]);
  const belumDiisi = klausulBelumDiisi(k);

  if (!panelMasaRelevan(k)) return null;

  let kalimat: string;
  if (!akhir) kalimat = "Tanggal berakhir belum diisi, jadi batas keputusan belum bisa dihitung.";
  else if (belumDiisi) kalimat = legal ? "Masa pemberitahuan belum dicatat. Isi 0 bila kontrak ini memang tidak mengaturnya." : "Klausul masa pemberitahuan belum dicatat Legal.";
  else if (k.perpanjanganOtomatis && batas) kalimat = `Kontrak ini diperpanjang otomatis kecuali diberi tahu paling lambat ${formatTanggal(batas)}.`;
  else if (batas && k.masaPemberitahuanHari) kalimat = `Keputusan memperpanjang atau mengakhiri perlu disampaikan paling lambat ${formatTanggal(batas)} (${k.masaPemberitahuanHari} hari sebelum berakhir).`;
  else kalimat = k.perpanjanganOtomatis ? "Diperpanjang otomatis tanpa masa pemberitahuan." : "Tidak ada masa pemberitahuan; kontrak berakhir pada tanggalnya.";

  return (
    <section className="kartu overflow-hidden" aria-labelledby={`masa-${k.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 sm:px-6 py-4">
        <div className="min-w-0">
          <h2 id={`masa-${k.id}`} className="flex flex-wrap items-center gap-2 font-bold">
            <Hourglass className="h-4 w-4" aria-hidden="true" /> Masa dan batas keputusan
            {jendela && jendela.tahap !== "mendatang" && <LencanaTahapMasa j={jendela} />}
            {belumDiisi && legal && <Lencana nada="peringatan">Klausul belum diisi</Lencana>}
          </h2>
          <p className="text-xs text-muted">{kalimat}</p>
        </div>
        {bolehUbah && !ubah && (
          <Tombol kecil varian="kedua" ikon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setUbah(true)}>
            {belumDiisi ? "Isi klausul" : "Ubah klausul"}
          </Tombol>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-4 px-5 sm:px-6 py-5 sm:grid-cols-3">
        <Fakta ikon={<CalendarClock className="h-4 w-4" />} label="Berakhir efektif" nilai={formatTanggal(akhir)} sub={jendela ? teksSisa(jendela.sisaAkhir) : undefined} />
        <Fakta
          ikon={<AlertTriangle className="h-4 w-4" />}
          label="Batas keputusan"
          nilai={batas ? formatTanggal(batas) : belumDiisi ? "Belum diisi" : "-"}
          sub={jendela?.sisaBatas != null ? teksSisa(jendela.sisaBatas) : k.masaPemberitahuanHari != null ? `${k.masaPemberitahuanHari} hari sebelum berakhir` : undefined}
          sorot={jendela != null && (jendela.tahap === "mendesak" || jendela.tahap === "lewat-batas")}
        />
        <Fakta ikon={<Repeat className="h-4 w-4" />} label="Perpanjangan otomatis" nilai={k.perpanjanganOtomatis ? "Ya" : "Tidak"} />
      </dl>

      {ubah && <FormKlausul k={k} onBatal={() => setUbah(false)} onTersimpan={async () => {
        setUbah(false);
        await onBerubah?.();
      }} />}
    </section>
  );
}

function Fakta({ ikon, label, nilai, sub, sorot }: { ikon: ReactNode; label: string; nilai: string; sub?: string; sorot?: boolean }) {
  return (
    <div className={cx("min-w-0 rounded-2xl px-4 py-3", sorot ? "bg-accent-soft text-accent-ink" : "bg-raised")}>
      <dt className={cx("flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", sorot ? "" : "text-muted")}>
        <span aria-hidden="true">{ikon}</span>
        {label}
      </dt>
      <dd className="mt-1 font-bold">{nilai}</dd>
      {sub && <dd className={cx("text-xs", sorot ? "" : "text-muted")}>{sub}</dd>}
    </div>
  );
}

function FormKlausul({ k, onBatal, onTersimpan }: { k: Kontrak; onBatal: () => void; onTersimpan: () => Promise<void> }) {
  const { sesi } = useSesi();
  const [otomatis, setOtomatis] = useState(k.perpanjanganOtomatis);
  const [hariTeks, setHariTeks] = useState(k.masaPemberitahuanHari != null ? String(k.masaPemberitahuanHari) : "");
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");
  const idHari = `masa-hari-${k.id}`;
  const idOtomatis = `masa-otomatis-${k.id}`;

  const simpan = async () => {
    const baca = bacaMasaPemberitahuan(hariTeks);
    if (baca.galat) return setGalat(baca.galat);
    setGalat("");
    setMenyimpan(true);
    let peringatan: string[];
    try {
      peringatan = await ubahKontrak(k, { perpanjanganOtomatis: otomatis, masaPemberitahuanHari: baca.nilai }, sesi);
    } catch (err) {
      setGalat(pesanError(err));
      setMenyimpan(false);
      return;
    }
    toast.success(baca.nilai == null ? "Tersimpan. Masa pemberitahuan masih kosong." : "Klausul tersimpan. Batas keputusan sudah dihitung ulang.");
    for (const p of peringatan) toast.warning(p);
    await onTersimpan();
  };

  return (
    <div className="border-t border-line bg-raised px-5 sm:px-6 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={idHari} className="label">
            Masa pemberitahuan (hari)
          </label>
          <input id={idHari} className="input angka" inputMode="numeric" autoComplete="off" value={hariTeks} onChange={(e) => setHariTeks(e.target.value)} placeholder="Mis. 30" aria-describedby={`${idHari}-bantuan`} />
          <span id={`${idHari}-bantuan`} className="mt-1 block text-xs text-muted">
            Kosongkan bila belum dicek; isi 0 bila tidak ada klausulnya.
          </span>
        </div>
        <div className="flex items-start gap-3 sm:pt-6">
          <input id={idOtomatis} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--wh-brand)]" checked={otomatis} onChange={(e) => setOtomatis(e.target.checked)} />
          <label htmlFor={idOtomatis} className="cursor-pointer text-sm [@media(pointer:coarse)]:py-1.5">
            <span className="font-semibold">Diperpanjang otomatis</span>
            <span className="block text-xs text-muted">Berlaku lagi dengan sendirinya bila tidak ada pemberitahuan sebelum batas.</span>
          </label>
        </div>
      </div>
      {galat && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {galat}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Tombol kecil varian="kedua" onClick={onBatal} disabled={menyimpan}>
          Batal
        </Tombol>
        <Tombol kecil memuat={menyimpan} onClick={simpan}>
          Simpan klausul
        </Tombol>
      </div>
    </div>
  );
}

// --- Ringkasan untuk dashboard -------------------------------------------------------

/**
 * Dua kelompok terpisah: kontrak yang diperpanjang otomatis (perlu keputusan sebelum batas) dan yang akan berakhir.
 * `semua` = SEMUA kontrak (untuk menghitung addendum); yang ditampilkan disaring bisaLihat.
 */
export function RingkasanMasa({ semua, maks = 5 }: { semua: Kontrak[]; maks?: number }) {
  const { sesi } = useSesi();
  const hari = hariWib();
  const g = useMemo(() => kelompokMasa(semua, hari), [semua, hari]);
  const lihat = (j: JendelaMasa) => bisaLihat(j.kontrak, sesi);
  const otomatis = g.otomatis.filter(lihat);
  const berakhir = g.akanBerakhir.filter(lihat);
  const belum = adalahLegal(sesi) ? g.belumDiisi.filter((k) => bisaLihat(k, sesi)).length : 0;

  return (
    <section className="kartu overflow-hidden" aria-label="Masa berlaku kontrak">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 sm:px-6 py-4">
        <h2 className="flex items-center gap-2 font-bold">
          <Hourglass className="h-4 w-4" aria-hidden="true" /> Batas keputusan
        </h2>
        {belum > 0 && <Lencana nada="peringatan">{belum} klausul belum diisi</Lencana>}
      </div>
      <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0">
        <KelompokMasa judul="Diperpanjang otomatis" kosong="Tidak ada perpanjangan otomatis yang mendekati batas." daftar={otomatis} maks={maks} ikon={<Repeat className="h-4 w-4" aria-hidden="true" />} />
        <KelompokMasa judul="Akan berakhir" kosong="Belum ada kontrak yang mendekati akhir masa berlaku." daftar={berakhir} maks={maks} ikon={<CalendarClock className="h-4 w-4" aria-hidden="true" />} />
      </div>
    </section>
  );
}

function KelompokMasa({ judul, kosong, daftar, maks, ikon }: { judul: string; kosong: string; daftar: JendelaMasa[]; maks: number; ikon: ReactNode }) {
  const { ke } = useRuang();
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 px-5 sm:px-6 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">
        {ikon} {judul}
        <span className="angka rounded-full bg-raised px-2 py-0.5">{daftar.length}</span>
      </p>
      {daftar.length === 0 ? (
        <p className="px-5 sm:px-6 py-4 text-sm text-muted">{kosong}</p>
      ) : (
        <ul className="py-2">
          {daftar.slice(0, maks).map((j) => (
            <li key={j.kontrak.id}>
              <Link to={ke.detail(j.kontrak.id)} className="group flex items-center gap-3 px-5 sm:px-6 py-2.5 transition-colors hover:bg-raised">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold transition-colors group-hover:text-brand" title={j.kontrak.judul}>{j.kontrak.judul}</p>
                  <p className="truncate text-xs text-muted">
                    {j.batas ? `Batas ${formatTanggal(j.batas)}` : `Berakhir ${formatTanggal(j.akhir)}`}
                    {j.belumDiisi && " · klausul belum diisi"}
                  </p>
                </div>
                <LencanaTahapMasa j={j} />
              </Link>
            </li>
          ))}
          {daftar.length > maks && <li className="px-5 sm:px-6 py-2 text-xs text-muted">dan {daftar.length - maks} lainnya</li>}
        </ul>
      )}
    </div>
  );
}

// --- Bar plafon kontrak payung (U35) -------------------------------------------------------

/**
 * Pemakaian plafon kontrak payung. `semua` HARUS seluruh kontrak tanpa filter bisaLihat, supaya angkanya benar;
 * yang tampil hanya agregat dan jumlah, tanpa judul atau isi kontrak turunan.
 */
export function BarPlafon({ payung, semua, className }: { payung: Kontrak; semua: Kontrak[]; className?: string }) {
  const r = useMemo(() => ringkasPlafon(payung, semua), [payung, semua]);
  const kurangiGerak = useReducedMotion();
  const uang = (n: number) => formatUang(n, r.mataUang);

  if (r.plafon == null) {
    return (
      <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-raised px-4 py-3 text-sm", className)}>
        <Gauge className="h-4 w-4 text-muted" aria-hidden="true" />
        <span className="font-semibold">Tanpa plafon</span>
        <span className="text-muted">
          {r.jumlahTurunan} turunan berjalan, total <span className="angka">{uang(r.terpakai)}</span>
        </span>
      </div>
    );
  }

  const persen = r.persen ?? 0;
  const lebarTotal = Math.min(100, persen);
  const lebarProses = r.plafon > 0 ? Math.min(lebarTotal, (r.dalamProses / r.plafon) * 100) : 0;
  const lebarAktif = Math.max(0, lebarTotal - lebarProses);
  const lewat = persen > 100;
  const masuk = (lebar: number, tunda: number) => ({
    initial: kurangiGerak ? false : { width: 0 },
    animate: { width: `${lebar}%` },
    transition: { duration: 0.8, ease: EASE_KELUAR, delay: tunda },
  });

  return (
    <div className={cx("space-y-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="h-4 w-4 text-muted" aria-hidden="true" /> Pemakaian plafon
        </p>
        <p className={cx("angka text-sm font-bold", lewat ? "text-accent-ink" : "text-ink")}>{persen}%</p>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-label="Pemakaian plafon" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, persen)} aria-valuetext={`${persen}% dari plafon ${uang(r.plafon)}`}>
        <motion.div className={cx("h-full", lewat ? "bg-accent" : "bg-brand")} {...masuk(lebarAktif, 0.1)} />
        <motion.div className={cx("h-full", lewat ? "bg-accent-soft" : "bg-brand-soft")} {...masuk(lebarProses, 0.3)} />
      </div>
      <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-muted">Terpakai</dt>
          <dd className="angka truncate font-semibold">{uang(r.terpakai)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">{r.sisa != null && r.sisa < 0 ? "Melebihi" : "Sisa"}</dt>
          <dd className={cx("angka truncate font-semibold", r.sisa != null && r.sisa < 0 && "text-accent-ink")}>{uang(Math.abs(r.sisa ?? 0))}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">Plafon</dt>
          <dd className="angka truncate font-semibold">{uang(r.plafon)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted">
        Dari {r.jumlahTurunan} kontrak turunan{r.dalamProses > 0 && <>; <span className="angka">{uang(r.dalamProses)}</span> masih diproses (bagian terang)</>}
        {r.jumlahMataUangLain > 0 && `; ${r.jumlahMataUangLain} bermata uang lain tidak dijumlahkan`}.
      </p>
      {r.peringatan.length > 0 && (
        <div role="note" className="space-y-2">
          {r.peringatan.map((p) => (
            <p key={p.kode} className="flex items-start gap-2 rounded-xl border border-accent bg-accent-soft px-3 py-2 text-xs text-accent-ink">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{p.teks}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
