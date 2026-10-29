// Panel kewajiban dan tonggak setelah kontrak Aktif (U33): BAST, retensi, laporan berkala, pembaruan jaminan.
// Legal/Admin di Ruang Admin mencatat dan mengubah; "Tandai selesai" boleh oleh Legal dan pengaju kontrak.
// "Terlambat" dihitung di klien. Sengaja tanpa persen, nominal, atau templat termin pembayaran.
import { useMemo, useState } from "react";
import { CalendarCheck2, CheckCircle2, ClipboardList, ExternalLink, FileCheck2, FileUp, Flag, Link2, Pencil, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { useMuat } from "../hooks/useMuat";
import { adalahLegal, adalahPengajuKontrak } from "../lib/alur";
import { formatTanggal } from "../lib/format";
import { pesanError } from "../lib/graph";
import {
  STATUS_KEWAJIBAN,
  TIPE_KEWAJIBAN_BARU,
  akhirKontrak,
  hariWib,
  levelKewajiban,
  ringkasKewajiban,
  selisihYmd,
  siapDitutup,
  urutkanKewajiban,
  type Kewajiban,
  type KewajibanInput,
  type LevelKewajiban,
  type TipeKewajiban,
} from "../lib/masa";
import type { JenisDokumen, Kontrak, Ymd } from "../lib/types";
import { catatAktivitas } from "../services/aktivitas";
import { unggahDokumen, urlFolderKontrak } from "../services/dokumen";
import { ambilKewajibanKontrak, selesaikanKewajiban, tambahKewajiban, ubahKewajiban } from "../services/kewajiban";
import { AksiModal, Isian, Kosong, KotakError, Lencana, Modal, Segmen, Tombol, cx } from "./ui";

/** Hanya tautan http(s) yang dirender sebagai href, supaya isi list tidak bisa menyisipkan javascript:. */
export const tautanAman = (u: string) => /^https?:\/\/\S+$/i.test(u.trim());

const IKON_TIPE: Record<TipeKewajiban, typeof Flag> = {
  BAST: FileCheck2,
  Retensi: CalendarCheck2,
  "Laporan Berkala": ClipboardList,
  "Pembayaran Termin": Flag,
  "Pembaruan Jaminan": ShieldCheck,
  Lainnya: Flag,
};

const DOKUMEN_TIPE: Partial<Record<TipeKewajiban, JenisDokumen>> = {
  BAST: "BAST",
  "Pembaruan Jaminan": "Jaminan / Bank Garansi",
};

const NADA_LEVEL: Record<LevelKewajiban, "netral" | "peringatan" | "bahaya" | "sukses"> = {
  terlambat: "bahaya",
  segera: "peringatan",
  terbuka: "netral",
  selesai: "sukses",
  batal: "netral",
};

function teksLevel(w: Kewajiban, hari: Ymd): string {
  const l = levelKewajiban(w, hari);
  if (l === "selesai") return "Selesai";
  if (l === "batal") return "Dibatalkan";
  if (!w.jatuhTempo) return "Tanpa tenggat";
  const n = selisihYmd(hari, w.jatuhTempo);
  if (n < 0) return `Terlambat ${-n} hari`;
  if (n === 0) return "Jatuh tempo hari ini";
  return `${n} hari lagi`;
}

/** Usulan cepat saat daftar masih kosong. Judul hanya usulan; Legal bisa mengubahnya di formulir. */
const USULAN: { tipe: TipeKewajiban; judul: string }[] = [
  { tipe: "BAST", judul: "Serah terima pekerjaan (BAST)" },
  { tipe: "Retensi", judul: "Akhir masa retensi / pemeliharaan" },
  { tipe: "Laporan Berkala", judul: "Laporan kemajuan berkala" },
  { tipe: "Pembaruan Jaminan", judul: "Perpanjang jaminan pelaksanaan" },
];

export function PanelKewajiban({ k, semua }: { k: Kontrak; semua: Kontrak[] }) {
  const { sesi } = useSesi();
  const { ruang } = useRuang();
  const aktif = k.status === "Aktif";
  const q = useMuat(() => (aktif ? ambilKewajibanKontrak(k.id) : Promise.resolve<Kewajiban[]>([])), [k.id, aktif]);
  const [form, setForm] = useState<{ awal: Kewajiban | null; usulan?: { tipe: TipeKewajiban; judul: string } } | null>(null);
  const [diselesaikan, setDiselesaikan] = useState<Kewajiban | null>(null);
  const hari = hariWib();

  const bolehKelola = ruang === "admin" && adalahLegal(sesi);
  const bolehSelesaikan = adalahLegal(sesi) || adalahPengajuKontrak(k, sesi);

  const daftar = useMemo(() => urutkanKewajiban(q.data ?? [], hari), [q.data, hari]);
  const ringkas = useMemo(() => ringkasKewajiban(daftar, hari), [daftar, hari]);
  const siap = useMemo(() => siapDitutup(k, semua, daftar, hari), [k, semua, daftar, hari]);

  if (!aktif) return null;

  const akhir = akhirKontrak(k, semua);

  return (
    <section className="kartu overflow-hidden" aria-labelledby={`kewajiban-${k.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 sm:px-6 py-4">
        <div className="min-w-0">
          <h2 id={`kewajiban-${k.id}`} className="flex flex-wrap items-center gap-2 font-bold">
            <ClipboardList className="h-4 w-4" aria-hidden="true" /> Kewajiban berjalan
            {ringkas.terlambat > 0 && <Lencana nada="bahaya">{ringkas.terlambat} terlambat</Lencana>}
            {ringkas.segera > 0 && <Lencana nada="peringatan">{ringkas.segera} minggu ini</Lencana>}
          </h2>
          <p className="text-xs text-muted">
            {ringkas.total === 0
              ? "Tonggak setelah kontrak berlaku: serah terima, retensi, laporan, pembaruan jaminan."
              : ringkas.terbuka === 0
                ? "Semua kewajiban sudah beres. Mantap."
                : `${ringkas.selesai} dari ${ringkas.total - ringkas.dibatalkan} sudah selesai.`}
          </p>
        </div>
        {bolehKelola && (
          <Tombol kecil ikon={<Plus className="h-4 w-4" />} onClick={() => setForm({ awal: null })}>
            Tambah kewajiban
          </Tombol>
        )}
      </div>

      {siap && (
        <div className="flex items-start gap-3 border-b border-line bg-success-soft px-5 sm:px-6 py-4 text-success" role="note">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="font-bold">Siap ditutup</p>
            <p className="text-ink">
              Semua kewajiban sudah selesai dan kontrak berakhir {akhir ? formatTanggal(akhir) : "sebentar lagi"}.{" "}
              {adalahLegal(sesi) ? "Bila tidak ada perpanjangan, kontrak ini bisa ditandai Berakhir." : "Legal akan menutup kontrak ini bila tidak ada perpanjangan."} Ini hanya petunjuk.
            </p>
          </div>
        </div>
      )}

      {q.loading && !q.data ? (
        <div className="space-y-3 px-5 sm:px-6 py-5" role="status" aria-label="Memuat kewajiban">
          {[0, 1, 2].map((i) => (
            <div key={i} className="kilau h-12 rounded-xl" aria-hidden="true" />
          ))}
        </div>
      ) : q.error ? (
        <div className="p-5">
          <KotakError error={q.error} ulangi={q.muatUlang} />
        </div>
      ) : daftar.length === 0 ? (
        <Kosong
          judul="Belum ada kewajiban tercatat"
          teks={bolehKelola ? "Mulai dari yang umum di bawah ini, atau tambahkan sendiri." : "Legal akan mencatat tonggak seperti BAST atau retensi di sini bila diperlukan."}
          ikon={<ClipboardList className="h-6 w-6" />}
          aksi={
            bolehKelola ? (
              <div className="flex flex-wrap justify-center gap-2">
                {USULAN.map((u) => (
                  <Tombol key={u.tipe} kecil varian="kedua" ikon={<Plus className="h-3.5 w-3.5" />} onClick={() => setForm({ awal: null, usulan: u })}>
                    {u.tipe}
                  </Tombol>
                ))}
              </div>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {daftar.map((w) => {
            const Ikon = IKON_TIPE[w.tipe];
            const l = levelKewajiban(w, hari);
            const tutup = l === "selesai" || l === "batal";
            return (
              <li key={w.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 sm:px-6 py-4">
                <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", tutup ? "bg-raised text-muted" : l === "terlambat" ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-strong")} aria-hidden="true">
                  <Ikon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cx("break-words font-semibold", l === "batal" && "text-muted line-through decoration-1")}>{w.judul || w.tipe}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {w.tipe} · tenggat {formatTanggal(w.jatuhTempo)}
                    {w.picEmail && <span className="break-all"> · PIC {w.picEmail}</span>}
                  </p>
                  {w.catatan && <p className="mt-1.5 break-words text-xs">{w.catatan}</p>}
                  {w.buktiUrl && tautanAman(w.buktiUrl) && (
                    <a href={w.buktiUrl} target="_blank" rel="noopener noreferrer" className="garis-tumbuh mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brand [@media(pointer:coarse)]:min-h-11">
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Lihat bukti
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Lencana nada={NADA_LEVEL[l]}>{teksLevel(w, hari)}</Lencana>
                  {!tutup && bolehSelesaikan && (
                    <Tombol kecil varian="kedua" ikon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setDiselesaikan(w)}>
                      Tandai selesai
                    </Tombol>
                  )}
                  {bolehKelola && (
                    <button type="button" onClick={() => setForm({ awal: w })} className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-raised hover:text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label={`Ubah kewajiban ${w.judul || w.tipe}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {form && (
        <ModalKewajiban
          k={k}
          awal={form.awal}
          usulan={form.usulan}
          onTutup={() => setForm(null)}
          onTersimpan={async () => {
            setForm(null);
            await q.muatUlang();
          }}
        />
      )}
      {diselesaikan && (
        <ModalSelesai
          k={k}
          w={diselesaikan}
          onTutup={() => setDiselesaikan(null)}
          onTersimpan={async () => {
            setDiselesaikan(null);
            await q.muatUlang();
          }}
        />
      )}
    </section>
  );
}

// --- Formulir tambah / ubah (Legal) ---------------------------------------------------

function ModalKewajiban({
  k,
  awal,
  usulan,
  onTutup,
  onTersimpan,
}: {
  k: Kontrak;
  awal: Kewajiban | null;
  usulan?: { tipe: TipeKewajiban; judul: string };
  onTutup: () => void;
  onTersimpan: () => Promise<void>;
}) {
  const { sesi } = useSesi();
  const [d, setD] = useState<KewajibanInput>(() => ({
    judul: awal?.judul ?? usulan?.judul ?? "",
    kontrakId: k.id,
    tipe: awal?.tipe ?? usulan?.tipe ?? "BAST",
    jatuhTempo: awal?.jatuhTempo ?? null,
    picEmail: awal?.picEmail ?? k.pengajuEmail,
    status: awal?.status ?? "Terbuka",
    buktiUrl: awal?.buktiUrl ?? "",
    catatan: awal?.catatan ?? "",
  }));
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");
  const set = <K extends keyof KewajibanInput>(kunci: K, nilai: KewajibanInput[K]) => setD((x) => ({ ...x, [kunci]: nilai }));
  // "Pembayaran Termin" hanya tampil bila datanya memang sudah begitu; tidak ditawarkan untuk yang baru.
  const pilihanTipe: readonly TipeKewajiban[] = TIPE_KEWAJIBAN_BARU.includes(d.tipe) ? TIPE_KEWAJIBAN_BARU : [...TIPE_KEWAJIBAN_BARU, d.tipe];

  const simpan = async () => {
    setGalat("");
    if (!d.judul.trim()) return setGalat("Judul kewajiban wajib diisi.");
    if (!d.jatuhTempo) return setGalat("Isi tanggal jatuh tempo supaya keterlambatan bisa dihitung.");
    if (d.picEmail.trim() && !/^\S+@\S+\.\S+$/.test(d.picEmail.trim())) return setGalat("Email PIC belum benar.");
    if (d.buktiUrl.trim() && !tautanAman(d.buktiUrl)) return setGalat("Tautan bukti harus diawali https://");
    setMenyimpan(true);
    try {
      if (awal) await ubahKewajiban(awal.id, d);
      else await tambahKewajiban(d);
    } catch (err) {
      setGalat(pesanError(err));
      setMenyimpan(false);
      return;
    }
    toast.success(awal ? "Kewajiban diperbarui." : "Kewajiban dicatat.");
    const pesan = awal
      ? `Kewajiban "${d.judul.trim()}" diperbarui${awal.status !== d.status ? `: ${awal.status} menjadi ${d.status}` : ""}.`
      : `Kewajiban baru: ${d.judul.trim()} (${d.tipe}), jatuh tempo ${formatTanggal(d.jatuhTempo)}.`;
    await catatAktivitas({ kontrakId: k.id, jenis: "Perubahan", pesan }, sesi).catch(() => toast.warning("Kewajiban tersimpan, tetapi riwayatnya belum tercatat."));
    await onTersimpan();
  };

  return (
    <Modal judul={awal ? "Ubah kewajiban" : "Tambah kewajiban"} onTutup={onTutup} lebar="max-w-xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <Isian label="Judul" wajib className="sm:col-span-2">
          <input className="input" value={d.judul} onChange={(e) => set("judul", e.target.value)} autoFocus placeholder="Mis. BAST tahap 1" />
        </Isian>
        <Isian label="Tipe" wajib>
          <select className="input" value={d.tipe} onChange={(e) => set("tipe", e.target.value as TipeKewajiban)}>
            {pilihanTipe.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Isian>
        <Isian label="Jatuh tempo" wajib>
          <input type="date" className="input" value={d.jatuhTempo ?? ""} onChange={(e) => set("jatuhTempo", e.target.value || null)} />
        </Isian>
        <Isian label="Email PIC" className="sm:col-span-2" bantuan="Orang yang mengerjakan. Bawaan: pengaju kontrak.">
          <input type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} className="input" value={d.picEmail} onChange={(e) => set("picEmail", e.target.value)} />
        </Isian>
        {awal && (
          <Isian label="Status">
            <select className="input" value={d.status} onChange={(e) => set("status", e.target.value as KewajibanInput["status"])}>
              {STATUS_KEWAJIBAN.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Isian>
        )}
        <Isian label="Tautan bukti (opsional)" className={awal ? "" : "sm:col-span-2"}>
          <input type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} className="input" value={d.buktiUrl} onChange={(e) => set("buktiUrl", e.target.value)} placeholder="https://" />
        </Isian>
        <Isian label="Catatan (opsional)" className="sm:col-span-2">
          <textarea className="input min-h-[72px]" value={d.catatan} onChange={(e) => set("catatan", e.target.value)} />
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
          {awal ? "Simpan" : "Tambah"}
        </Tombol>
      </AksiModal>
    </Modal>
  );
}

// --- Tandai selesai (Legal dan pengaju) ---------------------------------------------------

type CaraBukti = "unggah" | "tautan";

function ModalSelesai({ k, w, onTutup, onTersimpan }: { k: Kontrak; w: Kewajiban; onTutup: () => void; onTersimpan: () => Promise<void> }) {
  const { sesi } = useSesi();
  const [cara, setCara] = useState<CaraBukti>("unggah");
  const [berkas, setBerkas] = useState<File | null>(null);
  const [tautan, setTautan] = useState(w.buktiUrl);
  const [catatan, setCatatan] = useState("");
  const [progres, setProgres] = useState<number | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");
  const jenisDok = DOKUMEN_TIPE[w.tipe] ?? "Dokumen Pendukung";
  const wajibBukti = w.tipe === "BAST";

  const simpan = async () => {
    setGalat("");
    if (cara === "tautan" && tautan.trim() && !tautanAman(tautan)) return setGalat("Tautan bukti harus diawali https://");
    if (wajibBukti && (cara === "unggah" ? !berkas : !tautan.trim())) return setGalat("Untuk BAST, sertakan berkas atau tautannya ya.");
    setMenyimpan(true);
    let bukti = cara === "tautan" ? tautan.trim() : "";
    try {
      if (cara === "unggah" && berkas) {
        setProgres(0);
        const hasil = await unggahDokumen(k, berkas, jenisDok, setProgres);
        bukti = hasil.webUrl || urlFolderKontrak(k.nomorPengajuan);
      }
      const catatanBaru = catatan.trim() ? [w.catatan, `${sesi.nama}: ${catatan.trim()}`].filter(Boolean).join("\n") : undefined;
      await selesaikanKewajiban(w.id, bukti, catatanBaru);
    } catch (err) {
      setGalat(pesanError(err));
      setMenyimpan(false);
      setProgres(null);
      return;
    }
    toast.success(`${w.judul || w.tipe} ditandai selesai.`);
    const pesan = `Kewajiban "${w.judul || w.tipe}" ditandai selesai${berkas && cara === "unggah" ? `, bukti diunggah (${berkas.name})` : bukti ? ", dengan tautan bukti" : ""}.`;
    await catatAktivitas({ kontrakId: k.id, jenis: "Perubahan", pesan }, sesi).catch(() => toast.warning("Sudah ditandai selesai, tetapi riwayatnya belum tercatat."));
    await onTersimpan();
  };

  return (
    <Modal judul="Tandai selesai" onTutup={onTutup}>
      <p className="text-sm text-muted">
        <strong className="text-ink">{w.judul || w.tipe}</strong> akan ditandai selesai. {wajibBukti ? "Lampirkan BAST yang sudah ditandatangani." : "Bukti bersifat opsional, tapi sangat membantu saat audit."}
      </p>

      <div className="mt-4">
        <Segmen
          id={`bukti-${w.id}`}
          label="Cara menyertakan bukti"
          nilai={cara}
          onUbah={setCara}
          pilihan={[
            { nilai: "unggah", label: "Unggah berkas", ikon: <FileUp className="h-4 w-4" aria-hidden="true" /> },
            { nilai: "tautan", label: "Tempel tautan", ikon: <Link2 className="h-4 w-4" aria-hidden="true" /> },
          ]}
        />
      </div>

      {cara === "unggah" ? (
        <div className="mt-4">
          <input id={`berkas-${w.id}`} type="file" aria-label="Pilih berkas untuk diunggah" className="sr-only" onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />
          <label htmlFor={`berkas-${w.id}`} className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-6 text-center transition-colors hover:border-brand hover:bg-raised">
            <FileUp className="h-6 w-6 text-brand" aria-hidden="true" />
            <span className="break-all text-sm font-semibold">{berkas ? berkas.name : "Pilih berkas"}</span>
            <span className="text-xs text-muted">Disimpan di folder kontrak {k.nomorPengajuan} sebagai {jenisDok}.</span>
          </label>
          {progres != null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={progres} aria-valuemin={0} aria-valuemax={100} aria-label="Kemajuan unggah">
              <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${progres}%` }} />
            </div>
          )}
        </div>
      ) : (
        <Isian label="Tautan bukti" className="mt-4" bantuan="Mis. tautan berkas di SharePoint atau OneDrive.">
          <input type="url" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} className="input" value={tautan} onChange={(e) => setTautan(e.target.value)} placeholder="https://" />
        </Isian>
      )}

      <Isian label="Catatan (opsional)" className="mt-4">
        <textarea className="input min-h-[72px]" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
      </Isian>

      {galat && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {galat}
        </p>
      )}

      <AksiModal>
        <Tombol varian="kedua" onClick={onTutup} disabled={menyimpan}>
          Batal
        </Tombol>
        <Tombol memuat={menyimpan} ikon={<CheckCircle2 className="h-4 w-4" />} onClick={simpan}>
          Tandai selesai
        </Tombol>
      </AksiModal>
    </Modal>
  );
}

