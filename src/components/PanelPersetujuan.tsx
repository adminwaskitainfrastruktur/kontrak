// Persetujuan internal dan rujukan kewenangan (K01 tahap 1), khusus Ruang Admin.
//
// Dua hal: (1) rujukan siapa yang menyetujui dan menandatangani menurut nilai kontrak, dari matriks sederhana di
// Pengaturan (standar awal, hanya rupiah); (2) pencatatan bukti persetujuan (nomor memo, nama penyetuju, tanggal, dan
// berkas "Bukti Persetujuan"). Ini PENCATATAN, bukan kontrol keras: tidak ada langkah yang diblokir bila persetujuan
// belum dicatat. Persetujuan lewat Power Automate Approvals (tahap 2) belum dibuat.
//
// Legal/Admin mencatat; Pemantau hanya melihat. Pemanggil wajib menyembunyikannya dari Ruang Pengguna.
import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, Paperclip, Plus, Scale, Trash2, Upload, X } from "lucide-react";
import { usePengaturan } from "../context/PengaturanContext";
import { useSesi } from "../context/SesiContext";
import { adalahAddendum, ringkasAddendum } from "../lib/addendum";
import { formatRelatif, formatTanggal, formatUang, hariIni } from "../lib/format";
import { EASE_KELUAR } from "../lib/gerak";
import { pesanError } from "../lib/graph";
import { teksUkuran, validasiBerkas } from "../lib/jenisBerkas";
import { daftarPersetujuan, nilaiAcuanKewenangan, persetujuanKosong, rujukanKewenangan, teksRentangJenjang, validasiPersetujuan, type IsianPersetujuan, type ItemPersetujuan } from "../lib/kewenangan";
import { PENGATURAN_BAWAAN, samaNilai } from "../lib/pengaturan";
import type { Kontrak, Persetujuan } from "../lib/types";
import { umpanBalik } from "../lib/umpanBalik";
import { unggahDokumen } from "../services/dokumen";
import { catatPersetujuan, hapusCatatanPersetujuan } from "../services/kontrak";
import { AksiModal, Isian, Lencana, Modal, Tombol, cx } from "./ui";

/** Matriks dari Pengaturan, dan apakah masih bawaan kode (ditandai "standar awal"). */
function useMatriks() {
  const { pengaturan } = usePengaturan();
  const matriks = pengaturan.matriksKewenangan;
  return { matriks, standarAwal: samaNilai(matriks, PENGATURAN_BAWAAN.matriksKewenangan) };
}

/** Rujukan untuk satu kontrak: jenjang menurut nilai (addendum: nilai efektif induk ditambah selisihnya). */
function useRujukan(k: Kontrak, induk: Kontrak | null, semua: readonly Kontrak[]) {
  const { matriks, standarAwal } = useMatriks();
  const efektifInduk = adalahAddendum(k) && induk ? ringkasAddendum(induk, semua).nilaiEfektif : null;
  const acuan = nilaiAcuanKewenangan(k, efektifInduk);
  return { matriks, standarAwal, rujukan: rujukanKewenangan(acuan, k.mataUang, matriks) };
}

/**
 * Rujukan kewenangan untuk satu kontrak, dan seluruh jenjang di bawah "Lihat semua jenjang". `ringkas` (modal Lanjut
 * ke Tanda Tangan) tidak menampilkan daftar seluruh jenjang.
 */
export function RujukanKewenangan({ k, induk, semua, ringkas }: { k: Kontrak; induk: Kontrak | null; semua: readonly Kontrak[]; ringkas?: boolean }) {
  const { matriks, standarAwal, rujukan: r } = useRujukan(k, induk, semua);
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-raised p-3.5 text-sm">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
        <Scale className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> Rujukan kewenangan
        {standarAwal && <Lencana nada="peringatan">Standar awal</Lencana>}
      </p>
      {r.ada ? (
        <>
          <p className="mt-1.5 text-xs text-muted">
            Menurut nilai {adalahAddendum(k) && induk ? "kontrak sesudah addendum ini" : "kontrak"} <span className="angka font-semibold text-ink">{formatUang(r.nilai, k.mataUang)}</span> ({teksRentangJenjang(matriks, r.indeks).toLowerCase()}).
          </p>
          <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-muted">Penyetuju</dt>
              <dd className="break-words font-semibold">{r.jenjang.penyetuju}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted">Penandatangan</dt>
              <dd className="break-words font-semibold">{r.jenjang.penandatangan}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="mt-1.5 text-xs text-muted">{r.pesan}</p>
      )}
      {!ringkas && (
        <details className="mt-2 text-xs">
          <summary className="min-h-8 cursor-pointer select-none py-1 font-semibold text-brand hover:text-brand-strong [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:py-2.5">Lihat semua jenjang</summary>
          <ol className="mt-1 space-y-1.5">
            {matriks.map((j, i) => (
              <li key={i} className={cx("rounded-xl px-3 py-2", r.ada && r.indeks === i ? "bg-brand-soft text-brand-strong" : "bg-surface text-muted")}>
                <p className="font-semibold">{teksRentangJenjang(matriks, i)}</p>
                <p className="break-words">
                  Penyetuju: {j.penyetuju}. Penandatangan: {j.penandatangan}.
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
      <p className="mt-2 text-xs text-muted">
        Ini rujukan dan pencatatan saja, bukan kontrol keras: proses tidak ditahan bila persetujuan belum dicatat.
        {standarAwal ? " Matriks resmi WKI belum ditetapkan; Admin bisa menyesuaikannya di Pengaturan." : ""}
      </p>
    </div>
  );
}

export default function PanelPersetujuan({
  k,
  induk,
  semua,
  bolehCatat,
  onBerubah,
  onDokumenBerubah,
}: {
  k: Kontrak;
  induk: Kontrak | null;
  semua: readonly Kontrak[];
  /** Legal/Admin di Ruang Admin. Pemantau hanya melihat. */
  bolehCatat: boolean;
  onBerubah: (p: Persetujuan) => void;
  onDokumenBerubah: () => void;
}) {
  const { sesi } = useSesi();
  const kurangiGerak = useReducedMotion();
  const [form, setForm] = useState(false);
  const [sibukHapus, setSibukHapus] = useState<string | null>(null);
  const daftar = useMemo(() => daftarPersetujuan(k.persetujuan), [k.persetujuan]);

  const hapus = async (id: string) => {
    setSibukHapus(id);
    try {
      const h = await hapusCatatanPersetujuan(k, id, sesi);
      if (h.tersimpan) {
        onBerubah(h.persetujuan);
        umpanBalik.berhasil("Catatan persetujuan dihapus.", { teks: "Berkas buktinya tetap ada di daftar dokumen." });
      }
      for (const p of h.peringatan) umpanBalik.peringatan(p, { durasi: 10_000 });
    } catch (err) {
      umpanBalik.gagal(err, "Catatan belum terhapus");
    } finally {
      setSibukHapus(null);
    }
  };

  return (
    <section className="kartu overflow-hidden" aria-labelledby={`persetujuan-${k.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={`persetujuan-${k.id}`} className="flex flex-wrap items-center gap-2 font-bold">
            <BadgeCheck className="h-4 w-4 text-brand" aria-hidden="true" /> Persetujuan internal
            {daftar.length > 0 && <span className="angka rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-muted">{daftar.length}</span>}
          </h2>
          <p className="mt-0.5 text-xs text-muted">Catat memo atau persetujuan atasan sebelum tanda tangan, beserta berkasnya. Pencatatan saja, bukan kontrol keras.</p>
        </div>
        {bolehCatat && (
          <Tombol kecil ikon={<Plus className="h-4 w-4" />} onClick={() => setForm(true)}>
            Catat persetujuan
          </Tombol>
        )}
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        <RujukanKewenangan k={k} induk={induk} semua={semua} />
        {daftar.length === 0 ? (
          <p className="text-sm text-muted">{bolehCatat ? "Belum ada bukti persetujuan yang dicatat. Anda tetap bisa melanjutkan proses; catat buktinya supaya arsipnya lengkap." : "Belum ada bukti persetujuan yang dicatat."}</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            <AnimatePresence initial={false}>
              {daftar.map((x) => (
                <motion.li key={x.id} layout={!kurangiGerak} initial={kurangiGerak ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE_KELUAR }} className="min-w-0 px-4 py-3">
                  <BarisPersetujuan x={x} bolehHapus={bolehCatat} sibuk={sibukHapus === x.id} onHapus={() => void hapus(x.id)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {form && (
        <FormCatat
          k={k}
          induk={induk}
          semua={semua}
          onTutup={() => setForm(false)}
          onTersimpan={(p) => {
            setForm(false);
            onBerubah(p);
            onDokumenBerubah();
          }}
        />
      )}
    </section>
  );
}

function BarisPersetujuan({ x, bolehHapus, sibuk, onHapus }: { x: ItemPersetujuan; bolehHapus: boolean; sibuk: boolean; onHapus: () => void }) {
  const [yakin, setYakin] = useState(false);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-semibold">
          {x.penyetuju}
          {x.jabatan ? <span className="font-normal text-muted"> · {x.jabatan}</span> : null}
        </p>
        {x.tanggal && <Lencana>{formatTanggal(x.tanggal)}</Lencana>}
      </div>
      <dl className="mt-1 space-y-0.5 text-xs text-muted">
        {x.bukti && (
          <div className="flex flex-wrap gap-x-1.5">
            <dt>Nomor memo atau surat:</dt>
            <dd className="break-all font-mono text-ink">{x.bukti}</dd>
          </div>
        )}
        {x.dokumen && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5">
            <dt className="inline-flex items-center gap-1">
              <Paperclip className="h-3 w-3" aria-hidden="true" /> Berkas:
            </dt>
            <dd className="min-w-0 break-all text-ink">{x.dokumen}</dd>
          </div>
        )}
        {x.catatan && <p className="whitespace-pre-wrap break-words text-ink">{x.catatan}</p>}
        {x.dicatat && (
          <p>
            Dicatat {x.oleh ? `oleh ${x.oleh} ` : ""}
            {formatRelatif(x.dicatat)}
          </p>
        )}
      </dl>
      {bolehHapus && (
        <div className="mt-1.5">
          {yakin ? (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Konfirmasi hapus catatan persetujuan">
              <span className="text-xs text-muted">Hapus catatan ini?</span>
              <Tombol
                kecil
                varian="bahaya"
                memuat={sibuk}
                onClick={() => {
                  setYakin(false);
                  onHapus();
                }}
              >
                Ya, hapus
              </Tombol>
              <Tombol kecil varian="hantu" disabled={sibuk} onClick={() => setYakin(false)}>
                Batal
              </Tombol>
            </div>
          ) : (
            <Tombol kecil varian="hantu" ikon={<Trash2 className="h-3.5 w-3.5" />} disabled={sibuk} onClick={() => setYakin(true)} aria-label={`Hapus catatan persetujuan ${x.penyetuju}`}>
              Hapus
            </Tombol>
          )}
        </div>
      )}
    </div>
  );
}

function FormCatat({ k, induk, semua, onTutup, onTersimpan }: { k: Kontrak; induk: Kontrak | null; semua: readonly Kontrak[]; onTutup: () => void; onTersimpan: (p: Persetujuan) => void }) {
  const { sesi } = useSesi();
  const { rujukan } = useRujukan(k, induk, semua);
  const idBerkas = useId();
  // Jabatan awal mengikuti jenjang menurut matriks; bisa diganti.
  const [isi, setIsi] = useState<IsianPersetujuan>(() => ({ ...persetujuanKosong(rujukan.ada ? rujukan.jenjang.penyetuju : ""), tanggal: hariIni() }));
  const [berkas, setBerkas] = useState<File | null>(null);
  const [galat, setGalat] = useState("");
  const [langkah, setLangkah] = useState("");
  const [persen, setPersen] = useState<number | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const ubah = <T extends keyof IsianPersetujuan>(kunci: T, nilai: IsianPersetujuan[T]) => setIsi((v) => ({ ...v, [kunci]: nilai }));

  const pilihBerkas = (f: File | null) => {
    if (!f) return setBerkas(null);
    const tolak = validasiBerkas(f.name, f.size);
    if (tolak) return setGalat(tolak);
    setGalat("");
    setBerkas(f);
  };

  const simpan = async () => {
    const g = validasiPersetujuan(isi, { hari: hariIni(), adaBerkas: !!berkas });
    if (g) return setGalat(g);
    setGalat("");
    setMenyimpan(true);
    try {
      // Berkas diunggah lebih dulu: bila gagal, tidak ada catatan yang menunjuk berkas yang tidak ada.
      let namaBerkas: string | null = null;
      let metadataGagal = false;
      if (berkas) {
        setLangkah("Mengunggah berkas bukti…");
        const h = await unggahDokumen(k, berkas, "Bukti Persetujuan", setPersen);
        namaBerkas = h.nama;
        metadataGagal = !h.metadataTersimpan;
      }
      setLangkah("Menyimpan catatan…");
      const h = await catatPersetujuan(k, isi, namaBerkas, sesi);
      umpanBalik.berhasil("Persetujuan tercatat.", { teks: "Ini pencatatan; proses kontrak tidak berubah." });
      if (metadataGagal) umpanBalik.peringatan("Berkas terunggah, tetapi jenisnya belum tercatat. Atur jenisnya dari daftar dokumen.", { durasi: 10_000 });
      for (const p of h.peringatan) umpanBalik.peringatan(p, { durasi: 10_000 });
      onTersimpan(h.persetujuan);
    } catch (err) {
      setGalat(pesanError(err));
      setMenyimpan(false);
      setPersen(null);
    } finally {
      setLangkah("");
    }
  };

  return (
    <Modal judul="Catat persetujuan internal" onTutup={onTutup} lebar="max-w-xl">
      <p className="text-sm text-muted">Catat bukti bahwa atasan sudah menyetujui. Aplikasi hanya menyimpan catatannya; tidak ada langkah yang ditahan.</p>
      {rujukan.ada && (
        <p className="mt-2 rounded-xl bg-raised px-3 py-2 text-xs text-muted">
          Rujukan matriks: penyetuju <strong className="text-ink">{rujukan.jenjang.penyetuju}</strong>.
        </p>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Isian label="Nama penyetuju" wajib>
          <input className="input" value={isi.penyetuju} maxLength={120} autoFocus autoComplete="off" onChange={(e) => ubah("penyetuju", e.target.value)} />
        </Isian>
        <Isian label="Jabatan">
          <input className="input" value={isi.jabatan} maxLength={120} autoComplete="off" onChange={(e) => ubah("jabatan", e.target.value)} />
        </Isian>
        <Isian label="Tanggal persetujuan" wajib>
          <input type="date" className="input" value={isi.tanggal ?? ""} max={hariIni()} onChange={(e) => ubah("tanggal", e.target.value || null)} />
        </Isian>
        <Isian label="Nomor memo atau surat" bantuan="Wajib bila tidak melampirkan berkas.">
          <input className="input font-mono" value={isi.nomor} maxLength={150} autoComplete="off" onChange={(e) => ubah("nomor", e.target.value)} />
        </Isian>
      </div>

      <fieldset className="mt-4 min-w-0 rounded-2xl border border-line p-3.5">
        <legend className="px-1 text-sm font-semibold">Berkas bukti (opsional)</legend>
        <p className="text-xs text-muted">Memo, nota dinas, atau tangkapan layar persetujuan. Disimpan di dokumen kontrak dengan jenis Bukti Persetujuan.</p>
        {berkas ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-raised px-3 py-2">
            <Paperclip className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={berkas.name}>
              {berkas.name}
            </span>
            <span className="shrink-0 text-xs text-muted">{teksUkuran(berkas.size)}</span>
            <button type="button" disabled={menyimpan} onClick={() => setBerkas(null)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink disabled:opacity-50" aria-label={`Batalkan lampiran ${berkas.name}`}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <label htmlFor={idBerkas} className="mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line px-3 py-2 text-sm font-semibold text-brand transition-colors focus-within:border-brand hover:border-brand">
            <Upload className="h-4 w-4" aria-hidden="true" /> Pilih berkas bukti
            <input
              id={idBerkas}
              type="file" aria-label="Pilih berkas untuk diunggah"
              className="sr-only"
              onChange={(e) => {
                pilihBerkas(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
        )}
        {persen != null && (
          <p className="mt-2 text-xs text-muted" role="status">
            Mengunggah… {persen}%
          </p>
        )}
      </fieldset>

      <Isian label="Catatan (opsional)" className="mt-4">
        <textarea className="input min-h-[80px]" value={isi.catatan} maxLength={1000} onChange={(e) => ubah("catatan", e.target.value)} />
      </Isian>

      {galat && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {galat}
        </p>
      )}
      {langkah && (
        <p className="mt-3 text-xs text-muted" role="status" aria-live="polite">
          {langkah}
        </p>
      )}
      <AksiModal>
        <Tombol varian="kedua" onClick={onTutup} disabled={menyimpan}>
          Batal
        </Tombol>
        <Tombol memuat={menyimpan} onClick={() => void simpan()}>
          Catat persetujuan
        </Tombol>
      </AksiModal>
    </Modal>
  );
}
