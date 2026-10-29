// Panel Legal di detail kontrak: buat draf .docx dari templat (K04) dan pindai dokumen (K06).
// Semua pemrosesan dokumen terjadi di peramban; yang dikirim ke SharePoint hanya berkas draf yang diunggah Legal.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ClipboardCopy, Download, FilePen, FileText, HardDrive, Info, Loader2, MinusCircle, RotateCcw, ScanSearch, ShieldAlert, Upload, XCircle } from "lucide-react";
import { AksiModal, Kosong, KotakError, Lencana, Memuat, Modal, Tombol, cx } from "./ui";
import { useSesi } from "../context/SesiContext";
import { useMuat } from "../hooks/useMuat";
import { adalahLegal } from "../lib/alur";
import { EASE_KELUAR, pegasLembut } from "../lib/gerak";
import { pesanError } from "../lib/graph";
import { formatTanggal, formatUkuran } from "../lib/format";
import { acak } from "../lib/kata";
import { BATAS_UKURAN_EKSTRAK, ekstrakTeks, jenisBerkasDari, type HasilEkstrak } from "../lib/ekstrak";
import { LABEL_PENANDA, pindaiDraf, ringkasPindai, type DataPembanding, type HasilPindai, type TingkatSelisih } from "../lib/pemindai";
import { buatDrafDocx, daftarPenanda, dataDrafDari, JENIS_DRAF, jenisDrafDari, MIME_DOCX, namaBerkasDraf, susunDraf, versiDrafBerikut, type JenisDraf } from "../lib/templateDocx";
import { terbilangRupiah } from "../lib/terbilang";
import { ambilBerkasDokumen, ambilDokumen, unggahDokumen } from "../services/dokumen";
import { catatAktivitas } from "../services/aktivitas";
import type { Dokumen, Kontrak, Status } from "../lib/types";

/** Pindai berguna sepanjang review sampai tanda tangan; membuat draf hanya saat Review Legal. */
const STATUS_PANEL: readonly Status[] = ["Review Legal", "Perlu Revisi", "Proses Tanda Tangan"];

const bisaDipindai = (nama: string) => {
  const j = jenisBerkasDari(nama);
  return j === "pdf" || j === "docx";
};

function unduhBlob(blob: Blob, nama: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function PanelDraf({ k, induk, onBerubah }: { k: Kontrak; induk?: Kontrak | null; onBerubah?: () => void }) {
  const { sesi } = useSesi();
  const boleh = adalahLegal(sesi) && STATUS_PANEL.includes(k.status);
  const dokumenQ = useMuat<Dokumen[]>(() => (boleh ? ambilDokumen(k.nomorPengajuan) : Promise.resolve([])), [boleh, k.nomorPengajuan]);
  const [modal, setModal] = useState<"draf" | "pindai" | null>(null);

  if (!boleh) return null;
  const bolehDraf = k.status === "Review Legal";
  const versi = versiDrafBerikut((dokumenQ.data ?? []).map((d) => d.nama));

  return (
    <MotionConfig reducedMotion="user">
      <section className="kartu overflow-hidden" aria-labelledby="judul-panel-draf">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h2 id="judul-panel-draf" className="flex items-center gap-2 font-bold">
            <FilePen className="h-4 w-4" aria-hidden="true" /> Draf &amp; pemindai
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
            <HardDrive className="h-3.5 w-3.5" aria-hidden="true" /> Diproses di peramban
          </span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <Ubin
            ikon={<FileText className="h-5 w-5" />}
            judul="Buat draf dari templat"
            teks="Komparisi, nilai beserta terbilang, dan jangka waktu terisi dari data pengajuan. Yang belum diketahui disorot kuning."
            aksi={
              <Tombol kecil onClick={() => setModal("draf")} disabled={!bolehDraf} ikon={<FilePen className="h-4 w-4" />}>
                Buat draf v{versi}
              </Tombol>
            }
            catatan={bolehDraf ? undefined : "Tersedia saat status Review Legal."}
          />
          <Ubin
            ikon={<ScanSearch className="h-5 w-5" />}
            judul="Pindai dokumen"
            teks="Cek klausul inti, lalu bandingkan nilai, mitra, dan tanggal di dokumen dengan data pengajuan."
            aksi={
              <Tombol kecil varian="kedua" onClick={() => setModal("pindai")} ikon={<ScanSearch className="h-4 w-4" />}>
                Pindai
              </Tombol>
            }
          />
        </div>
      </section>

      {modal === "draf" && (
        <ModalBuatDraf
          k={k}
          induk={induk ?? null}
          versi={versi}
          onTutup={() => setModal(null)}
          onTerunggah={() => {
            void dokumenQ.muatUlang();
            onBerubah?.();
          }}
        />
      )}
      {modal === "pindai" && <ModalPindai k={k} q={dokumenQ} onTutup={() => setModal(null)} />}
    </MotionConfig>
  );
}

function Ubin({ ikon, judul, teks, aksi, catatan }: { ikon: ReactNode; judul: string; teks: string; aksi: ReactNode; catatan?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-line bg-raised p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
          {ikon}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{judul}</p>
          <p className="mt-0.5 text-sm text-muted">{teks}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {aksi}
        {catatan && <span className="text-xs text-muted">{catatan}</span>}
      </div>
    </div>
  );
}

// --- Buat draf ---------------------------------------------------------------------------

function ModalBuatDraf({ k, induk, versi, onTutup, onTerunggah }: { k: Kontrak; induk: Kontrak | null; versi: number; onTutup: () => void; onTerunggah: () => void }) {
  const { sesi } = useSesi();
  const [jenis, setJenis] = useState<JenisDraf>(() => jenisDrafDari(k.jenis));
  const [proses, setProses] = useState<"" | "unduh" | "unggah">("");
  const [progres, setProgres] = useState(0);
  const [galat, setGalat] = useState("");

  const data = useMemo(() => dataDrafDari(k, induk), [k, induk]);
  const penanda = useMemo(() => daftarPenanda(susunDraf(jenis, data)), [jenis, data]);
  const nama = namaBerkasDraf(k, versi);

  const tanpaNilai = jenis === "MoU" || jenis === "NDA";
  const terbilang = (() => {
    if (k.nilai == null) return "";
    try {
      return terbilangRupiah(Math.abs(k.nilai), k.mataUang);
    } catch {
      return "";
    }
  })();

  const rakit = async () => {
    setGalat("");
    return buatDrafDocx(jenis, data);
  };

  const unduh = async () => {
    setProses("unduh");
    try {
      unduhBlob(await rakit(), nama);
      toast.success(acak(["Draf sudah diunduh. Lengkapi bagian yang disorot kuning ya.", "Draf siap di folder unduhan Anda."]));
    } catch (err) {
      setGalat(`Draf gagal disusun: ${pesanError(err)}`);
    } finally {
      setProses("");
    }
  };

  const unggah = async () => {
    setProses("unggah");
    setProgres(0);
    try {
      const blob = await rakit();
      const berkas = new File([blob], nama, { type: MIME_DOCX });
      await unggahDokumen(k, berkas, "Draft Kontrak", setProgres);
      // Riwayat hanya pelengkap: berkasnya sudah aman di folder kontrak walau pencatatan gagal.
      try {
        await catatAktivitas({ kontrakId: k.id, jenis: "Dokumen", pesan: `Membuat ${nama} dari templat ${jenis} (draf awal, ${penanda.length} bagian perlu dilengkapi).` }, sesi);
      } catch {
        toast.warning("Draf tersimpan, tetapi riwayatnya belum tercatat.");
      }
      toast.success(acak([`${nama} tersimpan di dokumen kontrak.`, `Beres, ${nama} sudah masuk folder kontrak.`]));
      onTerunggah();
      onTutup();
    } catch (err) {
      setGalat(`Draf belum terunggah: ${pesanError(err)}`);
    } finally {
      setProses("");
    }
  };

  const baris: { label: string; nilai: ReactNode; ada: boolean }[] = [
    { label: "Mitra", nilai: k.mitra || "Belum diisi", ada: !!k.mitra },
    ...(tanpaNilai
      ? []
      : [
          {
            label: "Nilai",
            nilai: k.nilai != null ? (
              <>
                <span className="angka">{new Intl.NumberFormat("id-ID").format(Math.abs(k.nilai))}</span> {k.mataUang}
                {terbilang && <span className="block text-xs text-muted">({terbilang})</span>}
              </>
            ) : (
              "Belum diisi"
            ),
            ada: k.nilai != null,
          },
        ]),
    { label: "Masa berlaku", nilai: k.tanggalMulai && k.tanggalBerakhir ? `${formatTanggal(k.tanggalMulai)} s.d. ${formatTanggal(k.tanggalBerakhir)}` : "Belum lengkap", ada: !!(k.tanggalMulai && k.tanggalBerakhir) },
    { label: "Identitas mitra", nilai: [k.alamatMitra, k.npwpMitra, k.penandatanganMitra].filter(Boolean).length ? "Sebagian atau seluruhnya terisi" : "Belum diisi", ada: !!(k.alamatMitra && k.npwpMitra && k.penandatanganMitra) },
    ...(jenis === "Addendum" ? [{ label: "Kontrak induk", nilai: induk ? induk.nomorKontrak || induk.nomorPengajuan : "Tidak ditemukan", ada: !!induk }] : []),
  ];

  return (
    <Modal judul="Buat draf dari templat" onTutup={onTutup} lebar="max-w-xl">
      <div className="space-y-5">
        <label className="block">
          <span className="label">Templat</span>
          <select className="input" value={jenis} onChange={(e) => setJenis(e.target.value as JenisDraf)} disabled={!!proses}>
            {JENIS_DRAF.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
          {jenis !== jenisDrafDari(k.jenis) && <span className="mt-1 block text-xs text-accent-ink">Berbeda dari jenis pengajuan ({k.jenis}).</span>}
        </label>

        <div>
          <p className="label">Yang terisi otomatis</p>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {baris.map((b) => (
              <li key={b.label} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                {b.ada ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Terisi" /> : <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-label="Akan menjadi penanda kosong" />}
                <span className="w-28 shrink-0 text-muted">{b.label}</span>
                <span className="min-w-0 flex-1 break-words">{b.nilai}</span>
              </li>
            ))}
          </ul>
        </div>

        <details className="rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [@media(pointer:coarse)]:-my-1 [@media(pointer:coarse)]:py-2">
            {penanda.length} bagian bertanda [ISI] perlu dilengkapi Legal
          </summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {penanda.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>

        <p className="flex items-start gap-2 text-xs text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Draf diberi catatan kepala “DRAF AWAL, wajib ditinjau Legal sebelum digunakan”. Klausul yang butuh keputusan (denda, jaminan, forum sengketa) sengaja dibiarkan kosong. Disimpan sebagai <strong className="break-all">{nama}</strong>.
          </span>
        </p>

        <div aria-live="polite" className="min-h-0">
          {proses === "unggah" && (
            <div className="rounded-xl bg-brand-soft px-4 py-2 text-xs font-medium text-brand-strong">
              Mengunggah draf… {progres}%
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface">
                <motion.div className="h-full bg-brand" initial={{ width: 0 }} animate={{ width: `${progres}%` }} transition={{ duration: 0.3, ease: EASE_KELUAR }} />
              </div>
            </div>
          )}
          {galat && (
            <p role="alert" className="rounded-xl bg-danger-soft px-4 py-2 text-sm text-danger">
              {galat}
            </p>
          )}
        </div>

        <AksiModal className="!mt-5">
          <Tombol varian="kedua" onClick={() => void unduh()} memuat={proses === "unduh"} disabled={!!proses} ikon={<Download className="h-4 w-4" />}>
            Unduh saja
          </Tombol>
          <Tombol onClick={() => void unggah()} memuat={proses === "unggah"} disabled={!!proses} ikon={<Upload className="h-4 w-4" />}>
            Buat &amp; simpan v{versi}
          </Tombol>
        </AksiModal>
      </div>
    </Modal>
  );
}

// --- Pindai -------------------------------------------------------------------------------

type Tahap = { t: "pilih" } | { t: "membaca"; nama: string; persen: number } | { t: "hasil"; nama: string; ekstrak: HasilEkstrak; hasil: HasilPindai | null } | { t: "galat"; pesan: string };

function ModalPindai({ k, q, onTutup }: { k: Kontrak; q: ReturnType<typeof useMuat<Dokumen[]>>; onTutup: () => void }) {
  const [tahap, setTahap] = useState<Tahap>({ t: "pilih" });
  const [dipilih, setDipilih] = useState<string>("");
  const urutan = useRef(0);

  const kandidat = useMemo(() => (q.data ?? []).filter((d) => bisaDipindai(d.nama)), [q.data]);
  const pembanding: DataPembanding = { judul: k.judul, mitra: k.mitra, nilai: k.nilai, mataUang: k.mataUang, tanggalMulai: k.tanggalMulai, tanggalBerakhir: k.tanggalBerakhir, jenis: k.jenis };

  const pindai = async (ambil: () => Promise<File>, nama: string) => {
    const ke = ++urutan.current;
    setTahap({ t: "membaca", nama, persen: 0 });
    try {
      const berkas = await ambil();
      const ekstrak = await ekstrakTeks(berkas, { onProgres: (persen) => ke === urutan.current && setTahap({ t: "membaca", nama, persen }) });
      if (ke !== urutan.current) return;
      setTahap({ t: "hasil", nama, ekstrak, hasil: ekstrak.terbaca ? pindaiDraf(ekstrak.teks, pembanding) : null });
    } catch (err) {
      if (ke === urutan.current) setTahap({ t: "galat", pesan: pesanError(err) });
    }
  };

  const pindaiTersimpan = (d: Dokumen) =>
    void pindai(async () => {
      if (d.ukuran > BATAS_UKURAN_EKSTRAK) throw new Error("Dokumen ini melebihi batas baca 30 MB.");
      return ambilBerkasDokumen(k.nomorPengajuan, d);
    }, d.nama);

  return (
    <Modal judul="Pindai dokumen" onTutup={onTutup} lebar="max-w-3xl">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tahap.t} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }} transition={pegasLembut}>
          {tahap.t === "pilih" && (
            <div className="space-y-4">
              <fieldset>
                <legend className="label">Dokumen di kontrak ini</legend>
                {q.loading && !q.data ? (
                  <Memuat teks="Memuat dokumen…" />
                ) : q.error ? (
                  <KotakError error={q.error} ulangi={q.muatUlang} />
                ) : !kandidat.length ? (
                  <Kosong judul="Belum ada PDF atau Word" teks="Pilih berkas dari perangkat di bawah, atau unggah draf ke panel Dokumen dulu." ikon={<FileText className="h-6 w-6" />} />
                ) : (
                  <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-2xl border border-line">
                    {kandidat.map((d) => (
                      <li key={d.id}>
                        <label className={cx("flex cursor-pointer items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-raised", dipilih === d.id && "bg-brand-soft")}>
                          <input type="radio" name="dokumen-pindai" value={d.id} checked={dipilih === d.id} onChange={() => setDipilih(d.id)} className="h-4 w-4 accent-[var(--wh-brand)]" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{d.nama}</span>
                            <span className="text-xs text-muted">
                              {d.jenis || "Tanpa jenis"} · {formatUkuran(d.ukuran)}
                            </span>
                          </span>
                          {d.ukuran > BATAS_UKURAN_EKSTRAK && <Lencana nada="peringatan">Di atas 30 MB</Lencana>}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition-colors hover:border-brand hover:bg-raised focus-within:ring-4 focus-within:ring-brand-soft [@media(pointer:coarse)]:min-h-11">
                  <HardDrive className="h-4 w-4" aria-hidden="true" /> Pilih berkas dari perangkat
                  <input
                    type="file" aria-label="Pilih berkas untuk diunggah"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void pindai(async () => f, f.name);
                    }}
                  />
                </label>
                <Tombol
                  disabled={!dipilih}
                  onClick={() => {
                    const d = kandidat.find((x) => x.id === dipilih);
                    if (d) pindaiTersimpan(d);
                  }}
                  ikon={<ScanSearch className="h-4 w-4" />}
                >
                  Pindai dokumen terpilih
                </Tombol>
              </div>
              <p className="flex items-start gap-2 text-xs text-muted">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Isi dokumen dibaca di peramban ini saja dan tidak dikirim ke layanan mana pun. PDF hasil pindai (gambar) belum bisa dibaca.
              </p>
            </div>
          )}

          {tahap.t === "membaca" && (
            <div className="flex flex-col items-center gap-3 py-12 text-center" role="status" aria-live="polite">
              <Loader2 className="h-7 w-7 animate-spin text-brand" aria-hidden="true" />
              <p className="font-semibold">Membaca {tahap.nama}</p>
              <p className="text-sm text-muted">{tahap.persen ? `${tahap.persen}% halaman terbaca` : "Menyiapkan pembaca dokumen…"}</p>
            </div>
          )}

          {tahap.t === "galat" && (
            <div className="space-y-4">
              <KotakError error={new Error(tahap.pesan)} />
              <Tombol varian="kedua" onClick={() => setTahap({ t: "pilih" })} ikon={<RotateCcw className="h-4 w-4" />}>
                Pilih dokumen lain
              </Tombol>
            </div>
          )}

          {tahap.t === "hasil" && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="teks-panjang min-w-0 text-sm text-muted">
                  Hasil untuk <span className="font-semibold text-ink">{tahap.nama}</span>
                </p>
                <div className="flex gap-2">
                  {tahap.hasil && (
                    <Tombol
                      kecil
                      varian="hantu"
                      ikon={<ClipboardCopy className="h-4 w-4" />}
                      onClick={async () => {
                        // navigator.clipboard tidak ada di halaman tanpa HTTPS atau di peramban lama: tangkap galatnya, jangan biarkan tombol diam.
                        try {
                          await navigator.clipboard.writeText(ringkasPindai(tahap.hasil!, tahap.nama));
                          toast.success("Ringkasan disalin.");
                        } catch {
                          toast.error("Peramban belum mengizinkan menyalin. Coba lagi, atau pilih teksnya lalu salin manual.");
                        }
                      }}
                    >
                      Salin ringkasan
                    </Tombol>
                  )}
                  <Tombol kecil varian="kedua" onClick={() => setTahap({ t: "pilih" })} ikon={<RotateCcw className="h-4 w-4" />}>
                    Pindai lainnya
                  </Tombol>
                </div>
              </div>
              {tahap.hasil ? (
                <TampilanHasilPindai hasil={tahap.hasil} ekstrak={tahap.ekstrak} />
              ) : (
                <div className="flex items-start gap-3 rounded-2xl bg-accent-soft p-4 text-sm text-accent-ink">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">Dokumen ini tidak bisa saya baca</p>
                    <p className="mt-0.5">{tahap.ekstrak.pesan}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}

// --- Tampilan hasil (dipakai ulang) ---------------------------------------------------------------

const NADA_SELISIH: Record<TingkatSelisih, { nada: "sukses" | "peringatan" | "bahaya"; teks: string }> = {
  cocok: { nada: "sukses", teks: "Cocok" },
  periksa: { nada: "peringatan", teks: "Periksa" },
  beda: { nada: "bahaya", teks: "Berbeda" },
};

const WARNA_BACA = { baik: "bg-success-soft text-success", sebagian: "bg-accent-soft text-accent-ink", buruk: "bg-danger-soft text-danger" } as const;

const TAMPIL_PENANDA = 8;

/** Bagian dokumen yang tampaknya belum diisi ("....", "[ ]", "XXX", "{...}"), dengan potongan kalimatnya. */
export function PenandaKosongPindai({ penanda }: { penanda: HasilPindai["penandaKosong"] }) {
  const [semua, setSemua] = useState(false);
  if (penanda.length === 0) return null;
  const tampil = semua ? penanda : penanda.slice(0, TAMPIL_PENANDA);
  return (
    <section aria-labelledby="judul-penanda-kosong">
      <h3 id="judul-penanda-kosong" className="label flex flex-wrap items-center gap-2">
        Bagian yang tampaknya masih kosong <span className="angka rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">{penanda.length}</span>
      </h3>
      <ul className="space-y-1.5">
        {tampil.map((p, i) => (
          <li key={`${p.posisi}-${i}`} className="rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-ink">
            <p className="font-semibold">{LABEL_PENANDA[p.jenis]}</p>
            <p className="mt-0.5 break-words">{p.cuplikan}</p>
          </li>
        ))}
      </ul>
      {penanda.length > TAMPIL_PENANDA && (
        <button type="button" onClick={() => setSemua((v) => !v)} aria-expanded={semua} className="mt-1 min-h-8 text-xs font-semibold text-brand hover:text-brand-strong [@media(pointer:coarse)]:min-h-11">
          {semua ? "Tampilkan lebih sedikit" : `Tampilkan semua ${penanda.length}`}
        </button>
      )}
    </section>
  );
}

/** Hasil pemindaian: keterbacaan, selisih terhadap pengajuan, klausul inti, catatan, dan penafian. */
export function TampilanHasilPindai({ hasil, ekstrak }: { hasil: HasilPindai; ekstrak?: Pick<HasilEkstrak, "pesan" | "halaman" | "jenisBerkas"> }) {
  const relevan = hasil.klausul.filter((x) => x.relevan);
  const ada = relevan.filter((x) => x.ada).length;
  return (
    <div className="space-y-5">
      <div className={cx("flex items-start gap-3 rounded-2xl p-4 text-sm", WARNA_BACA[hasil.keterbacaan.tingkat])}>
        <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold">
            Keterbacaan {hasil.keterbacaan.tingkat} · {hasil.keterbacaan.kata.toLocaleString("id-ID")} kata
            {ekstrak ? ` · ${ekstrak.halaman} halaman ${ekstrak.jenisBerkas.toUpperCase()}` : ""}
          </p>
          <p className="mt-0.5 opacity-90">{[hasil.keterbacaan.pesan, ekstrak?.pesan].filter(Boolean).join(" ")}</p>
        </div>
      </div>

      {hasil.selisih.length > 0 && (
        <section aria-labelledby="judul-selisih">
          <h3 id="judul-selisih" className="label">
            Dokumen dibanding data pengajuan
          </h3>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {hasil.selisih.map((s) => (
              <li key={s.bidang} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                <span className="font-semibold">{s.label}</span>
                <span className="min-w-0 break-words">
                  <span className="text-xs text-muted sm:hidden">Dokumen: </span>
                  {s.di_dokumen}
                </span>
                <span className="min-w-0 break-words text-muted">
                  <span className="text-xs sm:hidden">Pengajuan: </span>
                  {s.di_pengajuan}
                </span>
                <span className="justify-self-start sm:justify-self-end">
                  <Lencana nada={NADA_SELISIH[s.tingkat].nada}>{NADA_SELISIH[s.tingkat].teks}</Lencana>
                </span>
                {s.keterangan && <span className="text-xs text-muted sm:col-span-4">{s.keterangan}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-1 hidden text-xs text-muted sm:block">Kolom kedua dari dokumen, kolom ketiga dari pengajuan.</p>
        </section>
      )}

      <section aria-labelledby="judul-klausul">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 id="judul-klausul" className="label !mb-0">
            Klausul inti
          </h3>
          <span className="text-xs font-semibold text-muted">
            {ada}/{relevan.length} terdeteksi
          </span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {hasil.klausul.map((x, i) => (
            <motion.li key={x.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.025, 0.3), duration: 0.28, ease: EASE_KELUAR }} className="min-w-0">
              <details className={cx("group rounded-xl border px-3 py-2.5 text-sm", x.ada ? "border-line bg-surface" : x.relevan ? "border-danger-soft bg-danger-soft" : "border-line bg-raised")}>
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [@media(pointer:coarse)]:-my-2.5 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:py-2">
                  {x.ada ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <XCircle className={cx("h-4 w-4 shrink-0", x.relevan ? "text-danger" : "text-muted")} aria-hidden="true" />
                  )}
                  <span className={cx("min-w-0 flex-1 font-medium", !x.ada && !x.relevan && "text-muted")}>{x.nama}</span>
                  <span className="sr-only">{x.ada ? "terdeteksi" : x.relevan ? "belum terdeteksi" : "tidak lazim untuk jenis ini"}</span>
                  {!x.ada && !x.relevan && <span className="text-[11px] text-muted">tidak lazim</span>}
                  {x.ada && x.keyakinan !== "tinggi" && <span className="text-[11px] text-muted">disebut sekilas</span>}
                </summary>
                <p className="mt-2 break-words text-xs text-muted">{x.ada ? `“${x.kutipan}”` : x.bantuan}</p>
              </details>
            </motion.li>
          ))}
        </ul>
      </section>

      <PenandaKosongPindai penanda={hasil.penandaKosong} />

      {hasil.catatan.length > 0 && (
        <section aria-labelledby="judul-catatan-pindai">
          <h3 id="judul-catatan-pindai" className="label">
            Perlu dicek
          </h3>
          <ul className="space-y-1.5">
            {hasil.catatan.map((c) => (
              <li key={c} className="flex items-start gap-2 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-ink">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{c}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="flex items-start gap-2 border-t border-line pt-4 text-xs text-muted">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {hasil.penafian}
      </p>
    </div>
  );
}
