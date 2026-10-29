// Panel jaminan (bank garansi, surety bond) di detail kontrak (U32).
// Legal/Admin di Ruang Admin menambah dan mengubah; pengaju dan Pemantau hanya melihat.
// Peringatan selalu kuning dan tidak memblokir apa pun.
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Landmark, Pencil, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { useMuat } from "../hooks/useMuat";
import { adalahLegal } from "../lib/alur";
import { bacaNilai, formatTanggal, formatUang } from "../lib/format";
import { pesanError } from "../lib/graph";
import { adalahJasa, levelJaminan, panelJaminanRelevan, peringatanAktivasi, peringatanKontrak, ringkasJaminan, statusEfektif, teksSisaJaminan, urutkanJaminan, type LevelJaminan, type PeringatanJaminan } from "../lib/jaminan";
import { hariWib } from "../lib/masa";
import { JENIS_JAMINAN, MATA_UANG, STATUS_JAMINAN, type Jaminan, type JaminanInput, type Kontrak, type Ymd } from "../lib/types";
import { catatAktivitas } from "../services/aktivitas";
import { ambilJaminanKontrak, tambahJaminan, ubahJaminan } from "../services/jaminan";
import { AksiModal, Isian, Kosong, KotakError, Lencana, Modal, Tombol, cx } from "./ui";

// --- Lencana dan peringatan (dipakai juga halaman register) ---------------------------

const NADA_LEVEL: Record<LevelJaminan, "netral" | "peringatan" | "bahaya" | "sukses"> = {
  aman: "sukses",
  "30": "peringatan",
  "14": "peringatan",
  "7": "bahaya",
  lewat: "bahaya",
  selesai: "netral",
  "tanpa-tanggal": "netral",
};

/** Lencana sisa hari jaminan: hijau aman, kuning 30/14 hari, merah 7 hari dan lewat. */
export function LencanaSisaJaminan({ j, hari = hariWib() }: { j: Jaminan; hari?: Ymd }) {
  return <Lencana nada={NADA_LEVEL[levelJaminan(j, hari)]}>{teksSisaJaminan(j, hari)}</Lencana>;
}

/** Kotak peringatan kuning. Kuning dipakai sengaja: catatan untuk Legal, bukan galat. */
export function KotakPeringatanJaminan({ peringatan, className }: { peringatan: readonly PeringatanJaminan[]; className?: string }) {
  if (peringatan.length === 0) return null;
  return (
    <div role="note" className={cx("space-y-2", className)}>
      {peringatan.map((p) => (
        <p key={p.kode} className="flex items-start gap-2.5 rounded-2xl border border-accent bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{p.teks}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Peringatan nonblokir untuk modal aktivasi ("Tandai Sudah Ditandatangani"): muncul bila kontrak
 * Pengadaan Jasa belum punya jaminan pelaksanaan yang berlaku. Diam saat memuat atau gagal memuat,
 * supaya tidak pernah menghalangi aktivasi.
 */
export function PeringatanAktivasiJaminan({ k }: { k: Kontrak }) {
  const jasa = adalahJasa(k);
  const { data } = useMuat(() => (jasa ? ambilJaminanKontrak(k.id) : Promise.resolve<Jaminan[]>([])), [k.id, jasa]);
  if (!jasa || !data) return null;
  const p = peringatanAktivasi(k, data);
  return p ? <KotakPeringatanJaminan peringatan={[p]} className="mt-4" /> : null;
}

// --- Panel di detail kontrak -------------------------------------------------------

export function PanelJaminan({ k, semua }: { k: Kontrak; semua: Kontrak[] }) {
  const { sesi } = useSesi();
  const { ruang } = useRuang();
  const q = useMuat(() => ambilJaminanKontrak(k.id), [k.id]);
  const [form, setForm] = useState<Jaminan | "baru" | null>(null);
  const bolehUbah = ruang === "admin" && adalahLegal(sesi) && k.status !== "Dibatalkan";
  const hari = hariWib();

  const daftar = useMemo(() => urutkanJaminan(q.data ?? [], hari), [q.data, hari]);
  const ringkas = useMemo(() => ringkasJaminan(daftar, hari), [daftar, hari]);
  const peringatan = useMemo(() => peringatanKontrak(k, daftar, semua, hari), [k, daftar, semua, hari]);

  if (!panelJaminanRelevan(k) && daftar.length === 0) return null;

  return (
    <section className="kartu overflow-hidden" aria-labelledby={`jaminan-${k.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 sm:px-6 py-4">
        <div className="min-w-0">
          <h2 id={`jaminan-${k.id}`} className="flex items-center gap-2 font-bold">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Jaminan
            {daftar.length > 0 && <span className="angka rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-muted">{daftar.length}</span>}
          </h2>
          <p className="text-xs text-muted">
            {ringkas.aktif > 0
              ? ringkas.berakhir30 > 0
                ? `${ringkas.aktif} jaminan berlaku, ${ringkas.berakhir30} di antaranya berakhir dalam 30 hari.`
                : `${ringkas.aktif} jaminan berlaku. Pengingat dikirim 30, 14, dan 7 hari sebelum berakhir.`
              : "Bank garansi atau surety bond yang melekat pada kontrak ini."}
          </p>
        </div>
        {bolehUbah && (
          <Tombol kecil ikon={<Plus className="h-4 w-4" />} onClick={() => setForm("baru")}>
            Catat jaminan
          </Tombol>
        )}
      </div>

      {peringatan.length > 0 && <KotakPeringatanJaminan peringatan={peringatan} className="border-b border-line px-5 sm:px-6 py-4" />}

      {q.loading && !q.data ? (
        <div className="space-y-3 px-5 sm:px-6 py-5" role="status" aria-label="Memuat jaminan">
          {[0, 1].map((i) => (
            <div key={i} className="kilau h-14 rounded-xl" aria-hidden="true" />
          ))}
        </div>
      ) : q.error ? (
        <div className="p-5">
          <KotakError error={q.error} ulangi={q.muatUlang} />
        </div>
      ) : daftar.length === 0 ? (
        <Kosong
          judul="Belum ada jaminan tercatat"
          teks={bolehUbah ? "Catat nomor, penerbit, dan masa berlakunya supaya pengingat bisa jalan sebelum jaminan habis." : "Legal akan mencatat jaminan di sini bila kontrak ini memerlukannya."}
          ikon={<ShieldCheck className="h-6 w-6" />}
        />
      ) : (
        <ul className="divide-y divide-line">
          {daftar.map((j) => (
            <BarisJaminan key={j.id} j={j} hari={hari} onUbah={bolehUbah ? () => setForm(j) : undefined} />
          ))}
        </ul>
      )}

      {form && (
        <ModalJaminan
          k={k}
          awal={form === "baru" ? null : form}
          onTutup={() => setForm(null)}
          onTersimpan={async () => {
            setForm(null);
            await q.muatUlang();
          }}
        />
      )}
    </section>
  );
}

function BarisJaminan({ j, hari, onUbah }: { j: Jaminan; hari: Ymd; onUbah?: () => void }) {
  const st = statusEfektif(j, hari);
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 sm:px-6 py-4">
      <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", st === "Aktif" ? "bg-brand-soft text-brand-strong" : "bg-raised text-muted")} aria-hidden="true">
        <Landmark className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{j.jenis}</span>
          <span className="break-all font-mono text-xs text-muted">{j.nomor || "tanpa nomor"}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {j.penerbit || "Penerbit belum diisi"}
          {j.nilai != null && <span className="angka"> · {formatUang(j.nilai, j.mataUang)}</span>}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
          {formatTanggal(j.tanggalTerbit)} sampai {formatTanggal(j.tanggalBerakhir)}
        </p>
        {j.catatan && (
          <p className="mt-2 rounded-xl bg-raised px-3 py-2 text-xs">
            <span className="font-semibold">Catatan risiko:</span> {j.catatan}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {st !== "Aktif" && st !== "Kedaluwarsa" ? <Lencana>{st}</Lencana> : <LencanaSisaJaminan j={j} hari={hari} />}
        {onUbah && (
          <button type="button" onClick={onUbah} className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-raised hover:text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label={`Ubah jaminan ${j.nomor || j.jenis}`}>
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
}

// --- Formulir ------------------------------------------------------------------------

type IsianJaminan = Omit<JaminanInput, "nilai" | "kontrakId"> & { nilaiTeks: string };

function isianAwal(j: Jaminan | null): IsianJaminan {
  return {
    nomor: j?.nomor ?? "",
    jenis: j?.jenis ?? "Jaminan Pelaksanaan",
    penerbit: j?.penerbit ?? "",
    nilaiTeks: j?.nilai != null ? String(j.nilai).replace(".", ",") : "",
    mataUang: j?.mataUang ?? "IDR",
    tanggalTerbit: j?.tanggalTerbit ?? null,
    tanggalBerakhir: j?.tanggalBerakhir ?? null,
    status: j?.status ?? "Aktif",
    catatan: j?.catatan ?? "",
  };
}

function ModalJaminan({ k, awal, onTutup, onTersimpan }: { k: Kontrak; awal: Jaminan | null; onTutup: () => void; onTersimpan: () => Promise<void> }) {
  const { sesi } = useSesi();
  const [d, setD] = useState<IsianJaminan>(() => isianAwal(awal));
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");
  const set = <K extends keyof IsianJaminan>(kunci: K, nilai: IsianJaminan[K]) => setD((x) => ({ ...x, [kunci]: nilai }));

  const simpan = async () => {
    setGalat("");
    if (!d.nomor.trim()) return setGalat("Nomor jaminan wajib diisi.");
    if (!d.tanggalBerakhir) return setGalat("Tanggal berakhir wajib diisi supaya pengingat bisa berjalan.");
    if (d.tanggalTerbit && d.tanggalBerakhir < d.tanggalTerbit) return setGalat("Tanggal berakhir tidak boleh sebelum tanggal terbit.");
    const nilai = bacaNilai(d.nilaiTeks);
    if (nilai != null && (Number.isNaN(nilai) || nilai < 0)) return setGalat("Nilai jaminan belum terbaca. Contoh: 1.250.000.000");

    const data: JaminanInput = {
      nomor: d.nomor,
      jenis: d.jenis,
      penerbit: d.penerbit,
      nilai,
      mataUang: d.mataUang,
      tanggalTerbit: d.tanggalTerbit,
      tanggalBerakhir: d.tanggalBerakhir,
      status: d.status,
      catatan: d.catatan.trim(),
      kontrakId: k.id,
    };
    setMenyimpan(true);
    try {
      if (awal) await ubahJaminan(awal.id, data);
      else await tambahJaminan(data);
    } catch (err) {
      setGalat(pesanError(err));
      setMenyimpan(false);
      return;
    }
    toast.success(awal ? "Perubahan jaminan tersimpan." : "Jaminan tercatat. Pengingat akan menyusul sebelum masa berlakunya habis.");
    const pesan = awal
      ? `Jaminan ${data.nomor} (${data.jenis}) diperbarui${awal.status !== data.status ? `: status ${awal.status} menjadi ${data.status}` : ""}.`
      : `Jaminan ${data.nomor} (${data.jenis}) dicatat, berlaku sampai ${formatTanggal(data.tanggalBerakhir)}.`;
    await catatAktivitas({ kontrakId: k.id, jenis: "Perubahan", pesan }, sesi).catch(() => toast.warning("Jaminan tersimpan, tetapi riwayatnya belum tercatat."));
    await onTersimpan();
  };

  return (
    <Modal judul={awal ? "Ubah jaminan" : "Catat jaminan"} onTutup={onTutup} lebar="max-w-2xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <Isian label="Jenis jaminan" wajib>
          <select className="input" value={d.jenis} onChange={(e) => set("jenis", e.target.value as IsianJaminan["jenis"])}>
            {JENIS_JAMINAN.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Isian>
        <Isian label="Nomor jaminan" wajib>
          <input className="input font-mono" value={d.nomor} onChange={(e) => set("nomor", e.target.value)} autoFocus />
        </Isian>
        <Isian label="Penerbit (bank atau asuransi)" className="sm:col-span-2">
          <input className="input" value={d.penerbit} onChange={(e) => set("penerbit", e.target.value)} placeholder="Mis. Bank Mandiri KCP Cawang" />
        </Isian>
        <Isian label="Nilai jaminan">
          <input className="input angka" inputMode="decimal" value={d.nilaiTeks} onChange={(e) => set("nilaiTeks", e.target.value)} placeholder="0" />
        </Isian>
        <Isian label="Mata uang">
          <select className="input" value={d.mataUang} onChange={(e) => set("mataUang", e.target.value as IsianJaminan["mataUang"])}>
            {MATA_UANG.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Isian>
        <Isian label="Tanggal terbit">
          <input type="date" className="input" value={d.tanggalTerbit ?? ""} onChange={(e) => set("tanggalTerbit", e.target.value || null)} />
        </Isian>
        <Isian label="Tanggal berakhir" wajib>
          <input type="date" className="input" value={d.tanggalBerakhir ?? ""} onChange={(e) => set("tanggalBerakhir", e.target.value || null)} />
        </Isian>
        <Isian label="Status" className="sm:col-span-2" bantuan="Jaminan Aktif yang lewat tanggal berakhir otomatis tampil sebagai Kedaluwarsa.">
          <select className="input" value={d.status} onChange={(e) => set("status", e.target.value as IsianJaminan["status"])}>
            {STATUS_JAMINAN.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Isian>
        <Isian label="Catatan risiko (opsional)" className="sm:col-span-2">
          <textarea className="input min-h-[84px]" value={d.catatan} onChange={(e) => set("catatan", e.target.value)} placeholder="Mis. penerbit belum terdaftar OJK, klausul pencairan bersyarat." />
        </Isian>
      </div>

      {galat && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {galat}
        </p>
      )}

      <AksiModal>
        <Tombol varian="kedua" onClick={onTutup} disabled={menyimpan}>
          Batal
        </Tombol>
        <Tombol memuat={menyimpan} onClick={simpan}>
          {awal ? "Simpan perubahan" : "Catat jaminan"}
        </Tombol>
      </AksiModal>
    </Modal>
  );
}
