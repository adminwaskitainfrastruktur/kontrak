// Halaman Jejak Audit (U31), Ruang Admin, untuk Admin dan Pemantau: siapa mengubah apa, dari nilai berapa ke
// berapa, dan kapan. Sumbernya baris riwayat kontrak (perubahan status dan baris ber-Detail lama-ke-baru) dan
// Log Admin (pengaturan, pengguna, rekonsiliasi). Hanya membaca; tidak ada tombol yang menulis.
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Download, History, Info, RefreshCw, Search, ShieldAlert, X } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { useMuat } from "../hooks/useMuat";
import { formatMasukRingkas, formatRelatif, formatTanggal, formatWaktu, hariIni } from "../lib/format";
import { EASE_KELUAR } from "../lib/gerak";
import { GraphError, pesanError } from "../lib/graph";
import { unduhBlob } from "../lib/ekspor";
import { umpanBalik } from "../lib/umpanBalik";
import {
  LABEL_PERIODE,
  PILIHAN_PERIODE,
  bolehLihatJejak,
  daftarPelaku,
  rentangPeriode,
  saringJejak,
  susunCsvJejak,
  type EntriJejak,
  type PilihanPeriode,
  type SumberJejak,
} from "../lib/jejakAudit";
import type { Kontrak, Ymd } from "../lib/types";
import { ambilSemuaKontrak } from "../services/kontrak";
import { ambilJejak } from "../services/jejakAudit";
import { KepalaHalaman, Kerangka, Kosong, KotakError, Lencana, Tombol, cx } from "../components/ui";

/** Banyak entri yang dirender sekaligus; sisanya lewat "Tampilkan lagi" supaya halaman tetap ringan. */
const PER_HALAMAN = 100;
const TANPA_KONTRAK: Kontrak[] = [];

export default function JejakAudit() {
  const { sesi } = useSesi();
  const [params, setParams] = useSearchParams();
  const kontrakId = Number(params.get("kontrak")) || null;

  // Datang dari halaman detail (?kontrak=ID): seluruh riwayat kontrak itu, tanpa batas periode.
  const [periode, setPeriode] = useState<PilihanPeriode>(() => (kontrakId ? "semua" : "30"));
  const [kustom, setKustom] = useState<{ dari: Ymd | null; sampai: Ymd | null }>({ dari: null, sampai: null });
  const [cari, setCari] = useState("");
  const [pelaku, setPelaku] = useState("");
  const [sumber, setSumber] = useState<SumberJejak | "semua">("semua");
  const [batas, setBatas] = useState(PER_HALAMAN);

  const hari = hariIni();
  const rentang = useMemo(() => rentangPeriode(periode, hari, kustom), [periode, hari, kustom]);

  const kontrakQ = useMuat(ambilSemuaKontrak, []);
  const kontrakSiap = !kontrakQ.loading || kontrakQ.data != null;
  const semuaKontrak = kontrakQ.data ?? TANPA_KONTRAK;
  const jejakQ = useMuat(
    () => (kontrakSiap ? ambilJejak({ ...rentang, kontrakId, kontrak: semuaKontrak }) : Promise.resolve(null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kontrakSiap, semuaKontrak, rentang.dari, rentang.sampai, kontrakId],
  );

  const kontrakTerpilih = kontrakId != null ? (semuaKontrak.find((k) => k.id === kontrakId) ?? null) : null;
  const entri = jejakQ.data?.entri;
  const tersaring = useMemo(() => {
    const dasar = saringJejak(entri ?? [], { ...rentang, sumber, kontrak: cari, pelaku });
    return kontrakId != null ? dasar.filter((e) => e.kontrakId === kontrakId) : dasar;
  }, [entri, rentang, sumber, cari, pelaku, kontrakId]);
  const pelakuTersedia = useMemo(() => daftarPelaku(entri ?? []), [entri]);

  // Saringan berubah: mulai lagi dari halaman pertama.
  useEffect(() => setBatas(PER_HALAMAN), [rentang.dari, rentang.sampai, sumber, cari, pelaku, kontrakId]);

  if (!bolehLihatJejak(sesi)) {
    return <Kosong judul="Halaman ini khusus Admin dan Pemantau" teks="Jejak audit memuat perubahan di semua kontrak dan pengaturan, jadi hanya Admin dan Pemantau yang bisa membukanya." ikon={<History className="h-6 w-6" />} />;
  }

  const pilihKontrak = (id: number | null) => {
    const p = new URLSearchParams(params);
    if (id == null) p.delete("kontrak");
    else p.set("kontrak", String(id));
    setParams(p, { replace: true });
    // Satu kontrak: seluruh riwayatnya. Kembali ke semua kontrak: periode wajar lagi, bukan seluruh list Aktivitas.
    setPeriode(id != null ? "semua" : "30");
    if (id != null) setCari("");
  };

  const ekspor = () => {
    const isi = susunCsvJejak(tersaring);
    const nama = kontrakTerpilih ? `jejak-audit-${kontrakTerpilih.nomorPengajuan}` : `jejak-audit-${rentang.dari}-sd-${rentang.sampai}`;
    // BOM supaya Excel membaca UTF-8 dengan benar.
    unduhBlob(new Blob([String.fromCharCode(0xfeff) + isi], { type: "text/csv;charset=utf-8" }), `${nama}.csv`);
    umpanBalik.berhasil("CSV jejak audit diunduh", { teks: `${tersaring.length} entri, satu baris per kolom yang berubah.` });
  };

  const memuatAwal = (kontrakQ.loading && !kontrakQ.data) || (jejakQ.loading && !jejakQ.data);
  const galatTotal = jejakQ.error && !jejakQ.data;

  return (
    <div className="space-y-5">
      <KepalaHalaman
        judul="Jejak Audit"
        sub="Siapa mengubah apa, dari nilai berapa ke berapa, dan kapan. Sumbernya riwayat kontrak dan Log Admin."
        aksi={
          <Tombol varian="kedua" ikon={<Download className="h-4 w-4" />} onClick={ekspor} disabled={tersaring.length === 0}>
            Ekspor CSV
          </Tombol>
        }
      />

      <BilahSaring
        periode={periode}
        onPeriode={setPeriode}
        kustom={kustom}
        onKustom={setKustom}
        rentang={rentang}
        cari={cari}
        onCari={setCari}
        pelaku={pelaku}
        onPelaku={setPelaku}
        pelakuTersedia={pelakuTersedia}
        sumber={sumber}
        onSumber={setSumber}
        kontrak={semuaKontrak}
        kontrakTerpilih={kontrakTerpilih}
        kontrakId={kontrakId}
        onPilihKontrak={pilihKontrak}
      />

      {jejakQ.data?.perluPilihKontrak && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-line bg-accent-soft p-4 text-sm text-accent-ink">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">Riwayat kontrak belum bisa disaring per tanggal</p>
            <p className="mt-0.5">
              List Aktivitas Kontrak sudah besar dan kolom Created belum diindeks, jadi SharePoint menolak kueri ini. Ketik nomor kontrak di kotak Kontrak lalu pilih &quot;Seluruh riwayatnya&quot;, atau minta pemilik
              site menambah indeks kolom Created (List settings, Indexed columns).
            </p>
          </div>
        </div>
      )}
      {jejakQ.data?.galatAktivitas != null && !jejakQ.data.perluPilihKontrak && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          Riwayat kontrak belum terbaca: {pesanError(jejakQ.data.galatAktivitas)}
        </p>
      )}
      {jejakQ.data?.galatLog != null && sumber !== "Kontrak" && kontrakId == null && <PesanLogAdmin galat={jejakQ.data.galatLog} />}

      <section className="kartu min-w-0 overflow-hidden" aria-label="Daftar jejak audit" aria-busy={jejakQ.loading}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
          <p className="min-w-0 flex-1 text-sm" aria-live="polite">
            {memuatAwal ? (
              "Memuat jejak…"
            ) : (
              <>
                <span className="angka font-semibold">{tersaring.length}</span> entri
                <span className="text-muted">
                  {" "}
                  · {formatTanggal(rentang.dari)} sampai {formatTanggal(rentang.sampai)}
                </span>
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => void Promise.all([kontrakQ.muatUlang(), jejakQ.muatUlang()])}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
            aria-label="Muat ulang jejak audit"
          >
            <RefreshCw className={cx("h-4 w-4", jejakQ.loading && "animate-spin")} aria-hidden="true" />
          </button>
        </div>

        {memuatAwal ? (
          <div className="space-y-3 p-5" role="status" aria-label="Memuat jejak audit">
            {[0, 1, 2, 3].map((i) => (
              <Kerangka key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : galatTotal ? (
          <div className="p-4">
            <KotakError error={jejakQ.error} ulangi={() => void jejakQ.muatUlang()} />
          </div>
        ) : tersaring.length === 0 ? (
          <Kosong
            judul={entri?.length ? "Tidak ada yang cocok" : "Belum ada perubahan di periode ini"}
            teks={entri?.length ? "Coba longgarkan saringan kontrak, pelaku, atau sumber." : "Perubahan status, data kontrak, PIC, pengaturan, dan pengguna akan tampil di sini."}
            ikon={<History className="h-6 w-6" />}
          />
        ) : (
          <DaftarEntri entri={tersaring.slice(0, batas)} />
        )}

        {tersaring.length > batas && (
          <div className="border-t border-line px-4 py-3 text-center sm:px-5">
            <Tombol varian="kedua" kecil className="w-full sm:w-auto" onClick={() => setBatas((b) => b + PER_HALAMAN)}>
              Tampilkan {Math.min(PER_HALAMAN, tersaring.length - batas)} lagi (dari {tersaring.length - batas} tersisa)
            </Tombol>
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Jejak ini dicatat aplikasi dan bukan bukti tahan-ubah. Pelaku diambil dari pembuat baris menurut SharePoint. Perubahan yang dibuat langsung di SharePoint terekam di riwayat versi masing-masing list.
        </span>
      </p>
    </div>
  );
}

// --- Saringan -----------------------------------------------------------------------------------

function BilahSaring({
  periode,
  onPeriode,
  kustom,
  onKustom,
  rentang,
  cari,
  onCari,
  pelaku,
  onPelaku,
  pelakuTersedia,
  sumber,
  onSumber,
  kontrak,
  kontrakTerpilih,
  kontrakId,
  onPilihKontrak,
}: {
  periode: PilihanPeriode;
  onPeriode: (p: PilihanPeriode) => void;
  kustom: { dari: Ymd | null; sampai: Ymd | null };
  onKustom: (k: { dari: Ymd | null; sampai: Ymd | null }) => void;
  rentang: { dari: Ymd; sampai: Ymd };
  cari: string;
  onCari: (v: string) => void;
  pelaku: string;
  onPelaku: (v: string) => void;
  pelakuTersedia: { email: string; nama: string; jumlah: number }[];
  sumber: SumberJejak | "semua";
  onSumber: (s: SumberJejak | "semua") => void;
  kontrak: readonly Kontrak[];
  kontrakTerpilih: Kontrak | null;
  kontrakId: number | null;
  onPilihKontrak: (id: number | null) => void;
}) {
  const idDaftar = useId();
  const idPeriode = useId();
  // Teks kontrak yang persis menunjuk satu kontrak: tawarkan memuat seluruh riwayatnya (kueri KontrakId terindeks).
  const kata = cari.trim().toLowerCase();
  const cocokPersis = kata ? kontrak.filter((k) => k.nomorPengajuan.toLowerCase() === kata || (!!k.nomorKontrak && k.nomorKontrak.toLowerCase() === kata)) : [];
  const urutNomor = useMemo(() => [...kontrak].sort((a, b) => b.id - a.id).slice(0, 400), [kontrak]);

  return (
    <section className="kartu min-w-0 space-y-4 p-4 sm:p-5" aria-label="Saringan jejak audit">
      <div className="min-w-0">
        <p id={idPeriode} className="label">
          Periode
        </p>
        <div role="group" aria-labelledby={idPeriode} className="flex flex-wrap gap-1.5">
          {PILIHAN_PERIODE.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={periode === p}
              onClick={() => onPeriode(p)}
              className={cx(
                "min-h-9 rounded-full border px-3 py-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft [@media(pointer:coarse)]:min-h-11",
                periode === p ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface text-muted hover:text-ink",
              )}
            >
              {LABEL_PERIODE[p]}
            </button>
          ))}
        </div>
        {periode === "kustom" && (
          <div className="mt-3 grid max-w-md gap-3 sm:grid-cols-2">
            <label className="min-w-0">
              <span className="label">Dari</span>
              <input type="date" className="input" value={kustom.dari ?? rentang.dari} max={kustom.sampai ?? undefined} onChange={(e) => onKustom({ ...kustom, dari: e.target.value || null })} />
            </label>
            <label className="min-w-0">
              <span className="label">Sampai</span>
              <input type="date" className="input" value={kustom.sampai ?? rentang.sampai} min={kustom.dari ?? undefined} onChange={(e) => onKustom({ ...kustom, sampai: e.target.value || null })} />
            </label>
          </div>
        )}
      </div>

      {kontrakId != null ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-raised px-3 py-2 text-sm">
          <History className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <span className="min-w-0 flex-1 break-words">
            Seluruh riwayat <span className="font-mono font-semibold">{kontrakTerpilih?.nomorPengajuan ?? `#${kontrakId}`}</span>
            {kontrakTerpilih && <span className="text-muted"> · {kontrakTerpilih.judul}</span>}
          </span>
          <Tombol kecil varian="hantu" ikon={<X className="h-3.5 w-3.5" />} onClick={() => onPilihKontrak(null)}>
            Semua kontrak
          </Tombol>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <label className="label" htmlFor={`${idDaftar}-cari`}>
              Kontrak
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                id={`${idDaftar}-cari`}
                type="search"
                enterKeyHint="search"
                className="input pl-9"
                list={idDaftar}
                value={cari}
                onChange={(e) => onCari(e.target.value)}
                placeholder="Nomor pengajuan, nomor kontrak, atau judul"
                autoComplete="off"
              />
              <datalist id={idDaftar}>
                {urutNomor.map((k) => (
                  <option key={k.id} value={k.nomorPengajuan}>
                    {k.judul}
                  </option>
                ))}
              </datalist>
            </div>
            {cocokPersis.length === 1 && (
              <button
                type="button"
                onClick={() => onPilihKontrak(cocokPersis[0]!.id)}
                className="mt-1 inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-brand hover:text-brand-strong [@media(pointer:coarse)]:min-h-11"
              >
                <History className="h-3.5 w-3.5" aria-hidden="true" /> Seluruh riwayatnya, tanpa batas periode
              </button>
            )}
          </div>
          <label className="min-w-0">
            <span className="label">Pelaku</span>
            <select className="input" value={pelaku} onChange={(e) => onPelaku(e.target.value)}>
              <option value="">Semua pelaku</option>
              {pelakuTersedia.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.nama} ({p.jumlah})
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 sm:col-span-2 lg:col-span-1">
            <span className="label">Sumber</span>
            <select className="input" value={sumber} onChange={(e) => onSumber(e.target.value as SumberJejak | "semua")}>
              <option value="semua">Semua sumber</option>
              <option value="Kontrak">Riwayat kontrak</option>
              <option value="Admin">Log Admin</option>
            </select>
          </label>
        </div>
      )}
    </section>
  );
}

function PesanLogAdmin({ galat }: { galat: unknown }) {
  const ditolak = galat instanceof GraphError && galat.status === 403;
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-raised px-4 py-3 text-sm text-muted">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        {ditolak
          ? "Log Admin tidak terbaca oleh akun Anda (izin list Log Admin hanya untuk Admin dan Legal), jadi perubahan pengaturan dan pengguna tidak tampil. Minta pemilik site memberi akses Read bila perlu."
          : `Log Admin belum terbaca: ${pesanError(galat)}. Perubahan pengaturan dan pengguna tidak tampil.`}
      </span>
    </p>
  );
}

// --- Daftar -------------------------------------------------------------------------------------

function DaftarEntri({ entri }: { entri: EntriJejak[] }) {
  const kurangiGerak = useReducedMotion();
  return (
    <>
      {/* Ponsel dan tablet: kartu bertumpuk. */}
      <ul className="divide-y divide-line lg:hidden">
        {entri.map((e, i) => (
          <motion.li
            key={e.id}
            initial={kurangiGerak ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: EASE_KELUAR, delay: kurangiGerak ? 0 : Math.min(i, 10) * 0.025 }}
            className="min-w-0 px-4 py-3.5"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <LabelAksi e={e} />
              <span className="text-xs text-muted" title={formatWaktu(e.waktu)}>
                {formatMasukRingkas(e.waktu)} WIB
              </span>
            </div>
            <div className="mt-1 min-w-0 text-sm">
              <Sasaran e={e} />
            </div>
            <p className="mt-0.5 truncate text-xs text-muted" title={e.pelakuEmail}>
              oleh <span className="font-semibold text-ink">{e.pelaku}</span>
            </p>
            <Rincian e={e} />
          </motion.li>
        ))}
      </ul>

      {/* Layar lebar: tabel. Kolom Perubahan melebar, sisanya ringkas. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="tabel w-full">
          <thead>
            <tr>
              <th scope="col" className="w-36">
                Waktu (WIB)
              </th>
              <th scope="col">Pelaku</th>
              <th scope="col">Aksi</th>
              <th scope="col">Sasaran</th>
              <th scope="col" className="min-w-[18rem]">
                Perubahan
              </th>
            </tr>
          </thead>
          <tbody>
            {entri.map((e) => (
              <tr key={e.id} className="align-top transition-colors hover:bg-raised">
                <td className="whitespace-nowrap text-sm" title={formatWaktu(e.waktu)}>
                  {formatMasukRingkas(e.waktu)}
                  <span className="block text-xs text-muted">{formatRelatif(e.waktu)}</span>
                </td>
                <td className="max-w-[12rem]">
                  <p className="truncate text-sm font-semibold">{e.pelaku}</p>
                  {e.pelakuEmail && <p className="truncate text-xs text-muted">{e.pelakuEmail}</p>}
                </td>
                <td className="whitespace-nowrap">
                  <LabelAksi e={e} />
                </td>
                <td className="max-w-[16rem] text-sm">
                  <Sasaran e={e} />
                </td>
                <td>
                  <Rincian e={e} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LabelAksi({ e }: { e: EntriJejak }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-sm font-semibold">{e.aksi}</span>
      {e.sumber === "Admin" && <Lencana nada="peringatan">Log Admin</Lencana>}
    </span>
  );
}

function Sasaran({ e }: { e: EntriJejak }) {
  const { ke } = useRuang();
  if (e.kontrakId == null) return <span className="break-all font-mono text-xs">{e.sasaran || "-"}</span>;
  return (
    <span className="block min-w-0">
      <Link to={ke.detail(e.kontrakId)} className="font-mono text-xs font-semibold text-brand hover:text-brand-strong hover:underline [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">
        {e.sasaran}
      </Link>
      {e.nomorKontrak && <span className="ml-1.5 break-all font-mono text-xs text-muted">{e.nomorKontrak}</span>}
      {e.judul && (
        <span className="teks-panjang block text-xs text-muted md:truncate" title={e.judul}>
          {e.judul}
        </span>
      )}
    </span>
  );
}

function Rincian({ e }: { e: EntriJejak }) {
  const [lengkap, setLengkap] = useState(false);
  const pesan = e.pesan.replace(/\s+/g, " ").trim();
  const panjang = pesan.length > 160;
  return (
    <div className="min-w-0">
      {e.rincian.length > 0 && (
        <dl className="mt-1.5 space-y-0.5 text-xs lg:mt-0">
          {e.rincian.map((d, j) => (
            <BarisRincian key={`${d.kolom}-${j}`} kolom={d.kolom}>
              <span className="line-through decoration-line">{d.dari || "kosong"}</span>
              <span aria-hidden="true"> → </span>
              <span className="sr-only"> menjadi </span>
              <span className="text-ink">{d.ke || "kosong"}</span>
            </BarisRincian>
          ))}
        </dl>
      )}
      {pesan && <p className={cx("mt-1 break-words text-xs text-muted", panjang && !lengkap && "line-clamp-2")}>{pesan}</p>}
      {panjang && (
        <button
          type="button"
          onClick={() => setLengkap((v) => !v)}
          className="min-h-8 text-xs font-semibold text-brand hover:text-brand-strong [@media(pointer:coarse)]:min-h-11"
          aria-expanded={lengkap}
        >
          {lengkap ? "Ringkas" : "Selengkapnya"}
        </button>
      )}
    </div>
  );
}

function BarisRincian({ kolom, children }: { kolom: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      <dt className="font-semibold">{kolom}:</dt>
      <dd className="min-w-0 break-words text-muted">{children}</dd>
    </div>
  );
}
