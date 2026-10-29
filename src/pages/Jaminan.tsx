// Register jaminan (U32): semua bank garansi dan surety bond lintas kontrak, untuk Ruang Admin.
// Hanya baca: jaminan dicatat dan diubah dari panel Jaminan di detail kontrak.
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, CalendarClock, Download, Landmark, RefreshCw, Search, ShieldCheck, ShieldX, X } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { useMuat } from "../hooks/useMuat";
import { bisaLihat } from "../lib/alur";
import { formatTanggal, formatUang } from "../lib/format";
import { pegas, tekan } from "../lib/gerak";
import { jaminanKeCsv, peringatanSemua, ringkasJaminan, saringJaminan, statusEfektif, urutkanJaminan, type SaringanJaminan } from "../lib/jaminan";
import { hariWib } from "../lib/masa";
import { JENIS_JAMINAN, STATUS_JAMINAN, type Jaminan as DataJaminan, type JenisJaminan, type Kontrak, type StatusJaminan } from "../lib/types";
import { ambilSemuaJaminan } from "../services/jaminan";
import { ambilSemuaKontrak } from "../services/kontrak";
import { LencanaSisaJaminan } from "../components/PanelJaminan";
import { AngkaHidup, Item, KepalaHalaman, KerangkaHalaman, Kontainer, KotakError, Kosong, Lencana, Segmen, Tombol, cx } from "../components/ui";

type Segera = "semua" | "30" | "60";

const SARINGAN_KOSONG = { jenis: "" as JenisJaminan | "", status: "" as StatusJaminan | "", segera: "semua" as Segera, kontrakId: null as number | null, cari: "" };

function unduhCsv(isi: string, nama: string) {
  // BOM supaya Excel membaca UTF-8 dengan benar (nama mitra beraksen, tanda kutip).
  const url = URL.createObjectURL(new Blob(["﻿", isi], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Jaminan() {
  const { sesi } = useSesi();
  const { ke } = useRuang();
  const q = useMuat(() => Promise.all([ambilSemuaJaminan(), ambilSemuaKontrak()]), []);
  const [f, setF] = useState(SARINGAN_KOSONG);
  const hari = hariWib();

  const semuaKontrak = useMemo(() => q.data?.[1] ?? [], [q.data]);
  const petaKontrak = useMemo(() => new Map(semuaKontrak.map((k) => [k.id, k])), [semuaKontrak]);

  // Jaminan milik kontrak yang tidak boleh dilihat disembunyikan (Ruang Admin, tetapi tetap dijaga).
  const jaminan = useMemo(() => (q.data?.[0] ?? []).filter((j) => j.kontrakId == null || (petaKontrak.has(j.kontrakId) && bisaLihat(petaKontrak.get(j.kontrakId)!, sesi))), [q.data, petaKontrak, sesi]);
  const ringkas = useMemo(() => ringkasJaminan(jaminan, hari), [jaminan, hari]);
  const peringatan = useMemo(() => peringatanSemua(semuaKontrak.filter((k) => bisaLihat(k, sesi)), jaminan, hari), [semuaKontrak, jaminan, hari, sesi]);

  const tersaring = useMemo(() => {
    const saringan: SaringanJaminan = { jenis: f.jenis, status: f.status, segeraHari: f.segera === "semua" ? 0 : Number(f.segera), kontrakId: f.kontrakId, cari: f.cari };
    return urutkanJaminan(saringJaminan(jaminan, saringan, hari), hari);
  }, [jaminan, f, hari]);

  const pilihanKontrak = useMemo(() => {
    const ids = new Set(jaminan.map((j) => j.kontrakId).filter((x): x is number => x != null));
    return [...ids].map((id) => petaKontrak.get(id)).filter((k): k is Kontrak => !!k).sort((a, b) => a.judul.localeCompare(b.judul, "id"));
  }, [jaminan, petaKontrak]);

  if (q.loading && !q.data) return <KerangkaHalaman />;
  if (q.error) return <KotakError error={q.error} ulangi={q.muatUlang} />;

  const adaSaringan = f.jenis !== "" || f.status !== "" || f.segera !== "semua" || f.kontrakId != null || f.cari.trim() !== "";
  const ekspor = () => unduhCsv(jaminanKeCsv(tersaring, petaKontrak, hari), `register-jaminan-${hari}.csv`);
  const kontrakPeringatan = [...peringatan.entries()].map(([id, p]) => ({ k: petaKontrak.get(id), p })).filter((x): x is { k: Kontrak; p: typeof x.p } => !!x.k);

  return (
    <Kontainer jeda={0.06} className="space-y-5">
      <KepalaHalaman
        judul="Register jaminan"
        sub="Bank garansi dan surety bond semua kontrak. Pencatatan dan perubahan dilakukan dari halaman detail kontrak."
        aksi={
          <>
            <Tombol varian="kedua" ikon={<RefreshCw className="h-4 w-4" />} memuat={q.loading} onClick={() => void q.muatUlang()}>
              Muat ulang
            </Tombol>
            <Tombol varian="kedua" ikon={<Download className="h-4 w-4" />} onClick={ekspor} disabled={tersaring.length === 0}>
              Ekspor CSV
            </Tombol>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <UbinRingkas label="Berlaku" nilai={ringkas.aktif} ket="Jaminan aktif yang belum lewat tanggal" ikon={<ShieldCheck className="h-5 w-5" />} warna="bg-brand" aktif={f.status === "Aktif" && f.segera === "semua"} onPilih={() => setF({ ...SARINGAN_KOSONG, status: "Aktif" })} />
        <UbinRingkas label="Berakhir ≤ 30 hari" nilai={ringkas.berakhir30} ket="Siapkan perpanjangan atau pengembalian" ikon={<CalendarClock className="h-5 w-5" />} warna="bg-accent" aktif={f.segera === "30"} onPilih={() => setF({ ...SARINGAN_KOSONG, segera: "30" })} />
        <UbinRingkas label="Kedaluwarsa" nilai={ringkas.kedaluwarsa} ket="Lewat tanggal tetapi belum ditutup" ikon={<ShieldX className="h-5 w-5" />} warna="bg-danger" aktif={f.status === "Kedaluwarsa"} onPilih={() => setF({ ...SARINGAN_KOSONG, status: "Kedaluwarsa" })} />
      </div>

      {kontrakPeringatan.length > 0 && (
        <Item>
          <section className="rounded-[22px] border border-accent bg-accent-soft p-5 text-accent-ink" aria-label="Jaminan yang perlu dicek">
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {kontrakPeringatan.length === 1 ? "Satu kontrak punya jaminan pelaksanaan yang lebih pendek dari masa kontraknya" : `${kontrakPeringatan.length} kontrak punya jaminan pelaksanaan yang lebih pendek dari masa kontraknya`}
            </p>
            <ul className="mt-3 space-y-2">
              {kontrakPeringatan.slice(0, 5).map(({ k, p }) => (
                <li key={k.id} className="min-w-0 text-sm">
                  <Link to={ke.detail(k.id)} className="garis-tumbuh font-semibold">
                    {k.judul}
                  </Link>
                  <span className="block text-xs opacity-90">{p.map((x) => x.teks).join(" ")}</span>
                </li>
              ))}
            </ul>
            {kontrakPeringatan.length > 5 && <p className="mt-2 text-xs">dan {kontrakPeringatan.length - 5} kontrak lainnya.</p>}
          </section>
        </Item>
      )}

      <Item>
        <section className="kartu overflow-hidden">
          <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">
            <label className="relative min-w-0 flex-1 basis-56">
              <span className="sr-only">Cari nomor, penerbit, atau catatan</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input type="search" enterKeyHint="search" autoComplete="off" className="input pl-9" value={f.cari} onChange={(e) => setF({ ...f, cari: e.target.value })} placeholder="Cari nomor, penerbit, catatan…" />
            </label>
            <PilihSaringan label="Jenis" nilai={f.jenis} onUbah={(v) => setF({ ...f, jenis: v as JenisJaminan | "" })} pilihan={JENIS_JAMINAN.map((x) => ({ nilai: x, label: x }))} semua="Semua jenis" />
            <PilihSaringan label="Status" nilai={f.status} onUbah={(v) => setF({ ...f, status: v as StatusJaminan | "" })} pilihan={STATUS_JAMINAN.map((x) => ({ nilai: x, label: x }))} semua="Semua status" />
            <PilihSaringan
              label="Kontrak"
              nilai={f.kontrakId == null ? "" : String(f.kontrakId)}
              onUbah={(v) => setF({ ...f, kontrakId: v ? Number(v) : null })}
              pilihan={pilihanKontrak.map((k) => ({ nilai: String(k.id), label: `${k.nomorPengajuan} · ${k.judul}` }))}
              semua="Semua kontrak"
              lebar="sm:max-w-[16rem]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Segmen
                id="jaminan-segera"
                label="Segera berakhir"
                nilai={f.segera}
                onUbah={(v) => setF({ ...f, segera: v })}
                pilihan={[
                  { nilai: "semua", label: "Semua" },
                  { nilai: "30", label: "≤ 30 hari" },
                  { nilai: "60", label: "≤ 60 hari" },
                ]}
              />
              {adaSaringan && (
                <Tombol kecil varian="hantu" ikon={<X className="h-3.5 w-3.5" />} onClick={() => setF(SARINGAN_KOSONG)}>
                  Hapus saringan
                </Tombol>
              )}
            </div>
          </div>

          <p className="px-5 pt-3 text-xs text-muted" aria-live="polite">
            {tersaring.length === jaminan.length ? `${jaminan.length} jaminan` : `${tersaring.length} dari ${jaminan.length} jaminan`}
          </p>

          {jaminan.length === 0 ? (
            <Kosong judul="Register masih kosong" teks="Jaminan dicatat Legal dari panel Jaminan di halaman detail kontrak." ikon={<ShieldCheck className="h-6 w-6" />} />
          ) : tersaring.length === 0 ? (
            <Kosong
              judul="Tidak ada yang cocok"
              teks="Coba longgarkan saringannya."
              ikon={<Search className="h-6 w-6" />}
              aksi={
                <Tombol kecil varian="kedua" onClick={() => setF(SARINGAN_KOSONG)}>
                  Tampilkan semua
                </Tombol>
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="tabel w-full min-w-[860px]">
                  <thead>
                    <tr>
                      <th scope="col">Jaminan</th>
                      <th scope="col">Kontrak</th>
                      <th scope="col">Penerbit</th>
                      <th scope="col" className="!text-right">
                        Nilai
                      </th>
                      <th scope="col">Berakhir</th>
                      <th scope="col">Sisa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tersaring.map((j) => (
                      <BarisTabel key={j.id} j={j} k={j.kontrakId != null ? petaKontrak.get(j.kontrakId) : undefined} hari={hari} />
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-line lg:hidden">
                {tersaring.map((j) => (
                  <KartuPonsel key={j.id} j={j} k={j.kontrakId != null ? petaKontrak.get(j.kontrakId) : undefined} hari={hari} />
                ))}
              </ul>
            </>
          )}
        </section>
      </Item>
    </Kontainer>
  );
}

function UbinRingkas({ label, nilai, ket, ikon, warna, aktif, onPilih }: { label: string; nilai: number; ket: string; ikon: ReactNode; warna: string; aktif: boolean; onPilih: () => void }) {
  return (
    <Item>
      <motion.button
        type="button"
        whileTap={tekan}
        transition={pegas}
        onClick={onPilih}
        aria-pressed={aktif}
        className={cx("kartu kartu-hover flex w-full items-center gap-4 p-5 text-left", aktif && "ring-2 ring-brand")}
      >
        <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-lg", warna)} aria-hidden="true">
          {ikon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-muted">{label}</span>
          <AngkaHidup nilai={nilai} className="block text-3xl font-extrabold leading-tight" />
          <span className="block truncate text-xs text-muted">{ket}</span>
        </span>
      </motion.button>
    </Item>
  );
}

function PilihSaringan({ label, nilai, onUbah, pilihan, semua, lebar }: { label: string; nilai: string; onUbah: (v: string) => void; pilihan: { nilai: string; label: string }[]; semua: string; lebar?: string }) {
  return (
    <label className={cx("block min-w-0 basis-40", lebar)}>
      <span className="label">{label}</span>
      <select className="input" value={nilai} onChange={(e) => onUbah(e.target.value)}>
        <option value="">{semua}</option>
        {pilihan.map((p) => (
          <option key={p.nilai} value={p.nilai}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TautanKontrak({ k }: { k: Kontrak | undefined }) {
  const { ke } = useRuang();
  if (!k) return <span className="text-muted">Tanpa kontrak</span>;
  return (
    <Link to={ke.detail(k.id)} className="group block min-w-0" title={k.judul}>
      <span className="teks-panjang block font-semibold transition-colors group-hover:text-brand md:truncate">{k.judul}</span>
      <span className="teks-panjang block text-xs text-muted md:truncate">
        <span className="font-mono">{k.nomorPengajuan}</span> · {k.mitra || "-"}
      </span>
    </Link>
  );
}

function LencanaJaminan({ j, hari }: { j: DataJaminan; hari: string }) {
  const st = statusEfektif(j, hari);
  return st === "Aktif" || st === "Kedaluwarsa" ? <LencanaSisaJaminan j={j} hari={hari} /> : <Lencana>{st}</Lencana>;
}

function BarisTabel({ j, k, hari }: { j: DataJaminan; k: Kontrak | undefined; hari: string }) {
  return (
    <tr className="transition-colors hover:bg-raised">
      <td className="max-w-[14rem]">
        <span className="block truncate font-semibold">{j.jenis}</span>
        <span className="block truncate font-mono text-xs text-muted">{j.nomor || "-"}</span>
      </td>
      <td className="max-w-[18rem]">
        <TautanKontrak k={k} />
      </td>
      <td className="max-w-[12rem]">
        <span className="block truncate">{j.penerbit || "-"}</span>
        {j.catatan && (
          <span className="block truncate text-xs text-accent-ink" title={j.catatan}>
            Catatan risiko
          </span>
        )}
      </td>
      <td className="angka whitespace-nowrap text-right">{formatUang(j.nilai, j.mataUang)}</td>
      <td className="whitespace-nowrap">{formatTanggal(j.tanggalBerakhir)}</td>
      <td>
        <LencanaJaminan j={j} hari={hari} />
      </td>
    </tr>
  );
}

function KartuPonsel({ j, k, hari }: { j: DataJaminan; k: Kontrak | undefined; hari: string }) {
  return (
    <li className="space-y-2 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-strong" aria-hidden="true">
            <Landmark className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="teks-panjang font-semibold">{j.jenis}</p>
            <p className="teks-panjang font-mono text-xs text-muted">{j.nomor || "-"}</p>
          </div>
        </div>
        <LencanaJaminan j={j} hari={hari} />
      </div>
      <div className="min-w-0 rounded-xl bg-raised px-3 py-2 text-sm">
        <TautanKontrak k={k} />
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span>{j.penerbit || "Penerbit -"}</span>
        <span className="angka">{formatUang(j.nilai, j.mataUang)}</span>
        <span>s.d. {formatTanggal(j.tanggalBerakhir)}</span>
      </p>
      {j.catatan && <p className="break-words text-xs text-accent-ink">Catatan risiko: {j.catatan}</p>}
    </li>
  );
}
