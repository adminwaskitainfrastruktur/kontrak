// Pelacak proses tanda tangan per langkah (U21). Legal mencatat tiap sub-tahap dengan tanggal dan catatan,
// atau menandainya tidak berlaku. Pengaju melihat posisinya ("menunggu TTD mitra sejak 3 Okt") tanpa
// catatan internal. Sebelum menulis, kontrak dibaca ulang supaya dua Legal tidak saling menimpa.
import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Ban, Check, Clock, Fingerprint, PenLine, RotateCcw, Signature, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { formatTanggal, hariIni } from "../lib/format";
import { EASE_KELUAR } from "../lib/gerak";
import { pesanError } from "../lib/graph";
import {
  INFO_CARA_TTD,
  aturCaraTtd,
  bungkusTtd,
  daftarTahapTtd,
  hitungTtd,
  labelCaraTtd,
  langkahBerikutnya,
  posisiTtd,
  ringkasSha256,
  ringkasTtd,
  susunTtd,
  ubahLangkah,
  type ItemTtd,
  type OverrideTtd,
  type PerubahanLangkah,
} from "../lib/ttd";
import { teksUkuran } from "../lib/jenisBerkas";
import { CARA_TTD, type CaraTtd, type Kontrak, type Ymd } from "../lib/types";
import { catatAktivitas } from "../services/aktivitas";
import { ambilKontrak, simpanChecklistTtd } from "../services/kontrak";
import { BilahKemajuan, TandaStandarAwal } from "./PanelSyarat";
import { Lencana, Tombol, cx } from "./ui";

interface PropsPanelTtd {
  kontrak: Kontrak;
  /** Biasanya bolehUbahTtd(k, sesi) dari lib/ttd. */
  bolehUbah: boolean;
  /** Dipanggil setelah tersimpan, dengan kontrak yang sudah memuat ChecklistTtd terbaru. */
  onBerubah?: (k: Kontrak) => void;
  override?: OverrideTtd;
}

export default function PanelTtd({ kontrak: k, bolehUbah, onBerubah, override }: PropsPanelTtd) {
  const { sesi } = useSesi();
  const { ruang } = useRuang();
  const internal = ruang === "admin";
  const kurangiGerak = useReducedMotion();

  const [items, setItems] = useState<ItemTtd[]>(() => susunTtd(k.checklistTtd, override));
  const [menyimpan, setMenyimpan] = useState<string | null>(null);
  const [sunting, setSunting] = useState<string | null>(null);
  const [cara, setCara] = useState<CaraTtd | null>(k.checklistTtd?.cara ?? null);

  const kunciData = JSON.stringify(k.checklistTtd ?? null);
  useEffect(() => {
    if (!menyimpan) {
      setItems(susunTtd(k.checklistTtd, override));
      setCara(k.checklistTtd?.cara ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k.id, kunciData, override]);

  const petunjuk = new Map(daftarTahapTtd(override).map((t) => [t.id, t.petunjuk]));
  const hitung = hitungTtd(items);
  const posisi = posisiTtd(items);
  const berikut = langkahBerikutnya(items);
  const persen = hitung.total === 0 ? 100 : Math.round((hitung.selesai / hitung.total) * 100);
  const judulId = `ttd-${k.id}`;

  const ubah = async (item: ItemTtd, p: PerubahanLangkah) => {
    const sebelum = items;
    const sekarang = new Date();
    setItems((d) => ubahLangkah(d, item.id, p, sesi.nama, sekarang));
    setMenyimpan(item.id);
    try {
      const terbaru = await ambilKontrak(k.id);
      const baru = ubahLangkah(susunTtd(terbaru.checklistTtd, override), item.id, p, sesi.nama, sekarang);
      const c = bungkusTtd(baru, terbaru.checklistTtd);
      await simpanChecklistTtd(terbaru, c);
      setItems(baru);
      setSunting(null);
      onBerubah?.({ ...terbaru, checklistTtd: c });
      const hasil = baru.find((i) => i.id === item.id);
      if (p.selesai !== undefined || p.tidakBerlaku !== undefined) {
        const keterangan = hasil?.tidakBerlaku ? "ditandai tidak berlaku" : hasil?.selesai ? `selesai${hasil.tanggal ? ` (${formatTanggal(hasil.tanggal)})` : ""}` : "dibuka kembali";
        // Riwayat hanya pelengkap: langkahnya sudah tersimpan walau ini gagal.
        await catatAktivitas({ kontrakId: k.id, jenis: "Perubahan", pesan: `Tanda tangan: ${item.label} ${keterangan}. ${ringkasTtd({ checklistTtd: c }, override).teks}.` }, sesi).catch(() =>
          toast.warning("Langkah tersimpan, tetapi riwayatnya belum tercatat."),
        );
      }
    } catch (err) {
      setItems(sebelum);
      toast.error(`Langkah tanda tangan belum tersimpan: ${pesanError(err)}`);
    } finally {
      setMenyimpan(null);
    }
  };

  /** Cara tanda tangan (U21): disimpan di ChecklistTtd yang dibaca ulang dulu, lalu dicatat lama-ke-baru. */
  const ubahCara = async (baru: CaraTtd) => {
    if (baru === cara) return;
    const sebelum = cara;
    setCara(baru);
    setMenyimpan("cara");
    try {
      const terbaru = await ambilKontrak(k.id);
      const c = aturCaraTtd(terbaru.checklistTtd, baru, override);
      await simpanChecklistTtd(terbaru, c);
      onBerubah?.({ ...terbaru, checklistTtd: c });
      await catatAktivitas(
        { kontrakId: k.id, jenis: "Perubahan", pesan: `Cara tanda tangan: ${labelCaraTtd(baru)}.`, detail: [{ kolom: "cara tanda tangan", dari: terbaru.checklistTtd?.cara ? labelCaraTtd(terbaru.checklistTtd.cara) : "-", ke: labelCaraTtd(baru) }] },
        sesi,
      ).catch(() => toast.warning("Cara tanda tangan tersimpan, tetapi riwayatnya belum tercatat."));
    } catch (err) {
      setCara(sebelum);
      toast.error(`Cara tanda tangan belum tersimpan: ${pesanError(err)}`);
    } finally {
      setMenyimpan(null);
    }
  };
  const jejakDraft = k.checklistTtd?.draftFinal;

  const kalimatPosisi = posisi
    ? `Menunggu ${posisi.langkah.label.charAt(0).toLowerCase()}${posisi.langkah.label.slice(1)}${posisi.sejak ? ` sejak ${formatTanggal(posisi.sejak)}` : ""}`
    : hitung.total > 0
      ? "Semua langkah tanda tangan sudah beres."
      : "Tidak ada langkah yang berlaku.";

  return (
    <section className="kartu overflow-hidden" aria-labelledby={judulId}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id={judulId} className="flex items-center gap-2 font-bold">
            <Signature className="h-4 w-4 text-brand" aria-hidden="true" /> Proses tanda tangan
            <Lencana nada={hitung.total > 0 && hitung.selesai === hitung.total ? "sukses" : "netral"}>{ringkasTtd({ checklistTtd: bungkusTtd(items) }, override).teks}</Lencana>
          </h2>
          <p className="mt-0.5 text-xs text-muted" aria-live="polite">
            {kalimatPosisi}
          </p>
        </div>
        {internal && <TandaStandarAwal />}
      </div>

      {/* Pengaju hanya melihat cara tanda tangan bila Legal sudah memilihnya; "belum dipilih" tidak berguna baginya. */}
      {(bolehUbah || cara || (internal && jejakDraft)) && (
        <div className="space-y-3 border-b border-line px-5 py-4">
          {bolehUbah ? (
            <PilihCaraTtd nilai={cara} onUbah={(c) => void ubahCara(c)} sibuk={menyimpan === "cara"} />
          ) : (
            <p className="text-sm">
              <span className="text-muted">Cara tanda tangan:</span> <span className="font-semibold">{labelCaraTtd(cara)}</span>
            </p>
          )}
          {internal && jejakDraft && (
            <p className="flex min-w-0 items-start gap-2 text-xs text-muted" title={jejakDraft.sha256 ? `SHA-256 ${jejakDraft.sha256}` : undefined}>
              <Fingerprint className="mt-px h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
              <span className="min-w-0 break-words">
                Draft final: <span className="font-semibold text-ink">{jejakDraft.nama}</span> ({teksUkuran(jejakDraft.ukuran)})
                {jejakDraft.sha256 ? (
                  <>
                    {" "}
                    · SHA-256 <span className="font-mono">{ringkasSha256(jejakDraft.sha256)}</span>
                  </>
                ) : (
                  " · sidik belum tercatat"
                )}
              </span>
            </p>
          )}
        </div>
      )}

      <div className="px-5 pt-4">
        <BilahKemajuan persen={persen} nada={persen === 100 ? "success" : "brand"} label={`Tanda tangan ${hitung.selesai} dari ${hitung.total} langkah`} />
      </div>

      <ol className="relative px-5 py-4" aria-label="Langkah tanda tangan">
        {items.map((i, idx) => {
          const kini = berikut?.id === i.id;
          const terakhir = idx === items.length - 1;
          const sibuk = menyimpan === i.id;
          return (
            <motion.li
              key={i.id}
              initial={kurangiGerak ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_KELUAR, delay: kurangiGerak ? 0 : idx * 0.04 }}
              className="relative flex gap-3 pb-4 last:pb-0"
              aria-current={kini ? "step" : undefined}
            >
              {!terakhir && <span className={cx("absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5", i.selesai ? "bg-brand" : "bg-line")} aria-hidden="true" />}
              <span
                className={cx(
                  "relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold",
                  i.selesai && "border-brand bg-brand text-brand-on",
                  i.tidakBerlaku && "border-line bg-raised text-muted",
                  kini && "border-accent bg-accent-soft text-accent-ink",
                  !i.selesai && !i.tidakBerlaku && !kini && "border-line bg-surface text-muted",
                )}
                aria-hidden="true"
              >
                {i.selesai ? <Check className="h-4 w-4" strokeWidth={3} /> : i.tidakBerlaku ? <Ban className="h-3.5 w-3.5" /> : kini ? <Clock className="h-3.5 w-3.5" /> : idx + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className={cx("text-sm font-semibold", i.tidakBerlaku && "text-muted line-through decoration-1")}>{i.label}</p>
                  <span className="sr-only">{i.selesai ? "selesai" : i.tidakBerlaku ? "tidak berlaku" : kini ? "langkah sekarang" : "belum"}</span>
                  {i.selesai && i.tanggal && <span className="text-xs text-muted">{formatTanggal(i.tanggal)}</span>}
                  {i.tidakBerlaku && <span className="text-xs text-muted">tidak berlaku</span>}
                </div>
                {internal && !i.selesai && !i.tidakBerlaku && <p className="mt-0.5 text-xs text-muted">{petunjuk.get(i.id)}</p>}
                {internal && i.catatan && <p className="mt-1 break-words text-xs text-ink">{i.catatan}</p>}
                {internal && i.selesai && i.oleh && <p className="mt-0.5 text-[11px] text-muted">Dicatat {i.oleh}</p>}

                {bolehUbah && (
                  <AnimatePresence initial={false} mode="wait">
                    {sunting === i.id ? (
                      <motion.div key="sunting" initial={kurangiGerak ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <FormLangkah item={i} sibuk={sibuk} onBatal={() => setSunting(null)} onSimpan={(p) => void ubah(i, p)} />
                      </motion.div>
                    ) : (
                      <motion.div key="aksi" initial={false} className="mt-2 flex flex-wrap gap-1.5">
                        {!i.selesai && !i.tidakBerlaku && (
                          <Tombol kecil varian={kini ? "utama" : "kedua"} memuat={sibuk} ikon={<Check className="h-3.5 w-3.5" />} onClick={() => void ubah(i, { selesai: true, tanggal: hariIni() })}>
                            Selesai hari ini
                          </Tombol>
                        )}
                        {!i.tidakBerlaku && (
                          <Tombol kecil varian="hantu" disabled={sibuk} ikon={<PenLine className="h-3.5 w-3.5" />} onClick={() => setSunting(i.id)}>
                            {i.selesai ? "Ubah tanggal atau catatan" : "Pilih tanggal"}
                          </Tombol>
                        )}
                        {i.selesai && (
                          <Tombol kecil varian="hantu" disabled={sibuk} ikon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => void ubah(i, { selesai: false })}>
                            Batalkan
                          </Tombol>
                        )}
                        {!i.selesai && (
                          <Tombol kecil varian="hantu" disabled={sibuk} ikon={i.tidakBerlaku ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />} onClick={() => void ubah(i, { tidakBerlaku: !i.tidakBerlaku })}>
                            {i.tidakBerlaku ? "Berlakukan lagi" : "Tidak berlaku"}
                          </Tombol>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}

function FormLangkah({ item, sibuk, onSimpan, onBatal }: { item: ItemTtd; sibuk: boolean; onSimpan: (p: PerubahanLangkah) => void; onBatal: () => void }) {
  const [tanggal, setTanggal] = useState<Ymd>(item.tanggal ?? hariIni());
  const [catatan, setCatatan] = useState(item.catatan ?? "");
  const idTanggal = `tgl-${item.id}`;
  const idCatatan = `cat-${item.id}`;
  return (
    <form
      className="mt-2 grid gap-2 rounded-xl border border-line bg-raised p-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]"
      onSubmit={(e) => {
        e.preventDefault();
        onSimpan(item.selesai ? { tanggal: tanggal || null, catatan } : { selesai: true, tanggal: tanggal || null, catatan });
      }}
    >
      <div className="min-w-0">
        <label htmlFor={idTanggal} className="label">
          Tanggal
        </label>
        <input id={idTanggal} type="date" className="input !py-2 !text-xs" value={tanggal} max={hariIni()} onChange={(e) => setTanggal(e.target.value)} />
      </div>
      <div className="min-w-0">
        <label htmlFor={idCatatan} className="label">
          Catatan (opsional)
        </label>
        <input id={idCatatan} className="input !py-2 !text-xs" value={catatan} maxLength={200} placeholder="mis. TTD basah, dikirim via kurir" onChange={(e) => setCatatan(e.target.value)} />
      </div>
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
        <Tombol kecil varian="hantu" type="button" onClick={onBatal} disabled={sibuk}>
          Batal
        </Tombol>
        <Tombol kecil type="submit" memuat={sibuk}>
          {item.selesai ? "Simpan" : "Tandai selesai"}
        </Tombol>
      </div>
    </form>
  );
}

/** Chip "TTD 3/5" untuk kartu, tabel, dan antrean. Hanya tampil saat Proses Tanda Tangan. */
export function ChipTtd({ kontrak: k, override, className }: { kontrak: Pick<Kontrak, "status" | "checklistTtd">; override?: OverrideTtd; className?: string }) {
  if (k.status !== "Proses Tanda Tangan") return null;
  const r = ringkasTtd(k, override);
  return (
    <span
      className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", r.lengkap ? "bg-success-soft text-success" : "bg-brand-soft text-brand-strong", className)}
      title={`Langkah tanda tangan: ${r.selesai} dari ${r.total} selesai`}
    >
      <Signature className="h-3 w-3" aria-hidden="true" />
      <span className="angka">{r.teks}</span>
    </span>
  );
}

/**
 * Pilihan cara tanda tangan (U21) sebagai grup radio. Dipakai di panel ini dan di modal "Lanjut ke Tanda Tangan".
 * Tiap pilihan setinggi minimal 44 px supaya mudah disentuh.
 */
export function PilihCaraTtd({ nilai, onUbah, sibuk, judul = "Cara tanda tangan" }: { nilai: CaraTtd | null; onUbah: (c: CaraTtd) => void; sibuk?: boolean; judul?: string }) {
  const idJudul = useId();
  return (
    <div className="min-w-0">
      <p id={idJudul} className="label">
        {judul}
      </p>
      <div role="radiogroup" aria-labelledby={idJudul} aria-busy={sibuk || undefined} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {CARA_TTD.map((c) => {
          const pilih = nilai === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={pilih}
              disabled={sibuk}
              title={INFO_CARA_TTD[c].petunjuk}
              onClick={() => onUbah(c)}
              className={cx(
                "min-h-11 rounded-xl border px-2.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:opacity-60",
                pilih ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface text-muted hover:text-ink",
              )}
            >
              {INFO_CARA_TTD[c].label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-muted">{nilai ? INFO_CARA_TTD[nilai].petunjuk : "Belum dipilih. Pilih supaya laporan bisa membedakan TTD basah dan elektronik."}</p>
    </div>
  );
}
