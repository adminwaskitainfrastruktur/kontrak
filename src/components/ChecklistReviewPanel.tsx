// Daftar periksa review klausul oleh Legal (U13, permintaan user no. 3). Legal mencentang butir dan memberi
// catatan singkat; siapa dan kapan tercatat per butir. Pengaju hanya melihat butir yang sudah selesai, tanpa
// catatan internal. Tidak ada yang diblokir: lanjut ke tanda tangan tetap boleh walau belum lengkap.
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, ListChecks, MessageSquareText, ScanSearch, X } from "lucide-react";
import { toast } from "sonner";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { BATAS_UKURAN_EKSTRAK, ekstrakTeks, jenisBerkasDari } from "../lib/ekstrak";
import { formatWaktu } from "../lib/format";
import { pegas, tekan } from "../lib/gerak";
import { pesanError } from "../lib/graph";
import { PENAFIAN, pindaiDraf, type PenandaKosong } from "../lib/pemindai";
import { pilihDraftTerbaru, ringkasSaran, saranChecklist, type SaranButir } from "../lib/saranChecklist";
import {
  VERSI_CHECKLIST,
  checklistReviewKontrak,
  daftarChecklistReview,
  kemajuanChecklist,
  peringatanChecklist,
  ringkasSebelumTtd,
  susunChecklistReview,
  type OverrideReview,
} from "../lib/syarat";
import type { ChecklistReview, ItemChecklist, Kontrak } from "../lib/types";
import { ambilBerkasDokumen, ambilDokumen } from "../services/dokumen";
import { ambilKontrak, simpanChecklistReview } from "../services/kontrak";
import { PenandaKosongPindai } from "./PanelDraf";
import { BilahKemajuan, TandaStandarAwal } from "./PanelSyarat";
import { Tombol, cx } from "./ui";

const BATAS_CATATAN = 200;

/** Pindai draf terbaru: sedang membaca, ada hasil (saran per butir), atau gagal dengan pesan ramah. */
type TahapPindai =
  | { t: "diam" }
  | { t: "membaca"; nama: string; langkah: string }
  | { t: "hasil"; nama: string; saran: SaranButir[]; penanda: PenandaKosong[]; pesanBaca: string; terbaca: boolean }
  | { t: "galat"; pesan: string };

const bisaDipindai = (nama: string) => {
  const j = jenisBerkasDari(nama);
  return j === "pdf" || j === "docx";
};

interface PropsChecklist {
  kontrak: Kontrak;
  /** Biasanya bolehUbahChecklistReview(k, sesi) dari lib/syarat. */
  bolehUbah: boolean;
  /** Dipanggil setelah checklist tersimpan, dengan isi terbarunya. */
  onBerubah?: (c: ChecklistReview) => void;
  override?: OverrideReview;
}

export default function ChecklistReviewPanel({ kontrak: k, bolehUbah, onBerubah, override }: PropsChecklist) {
  const { sesi } = useSesi();
  const { ruang } = useRuang();
  const internal = ruang === "admin";
  const kurangiGerak = useReducedMotion();

  const [items, setItems] = useState<ItemChecklist[]>(() => susunChecklistReview(k, k.checklistReview, override));
  const [menyimpan, setMenyimpan] = useState<string | null>(null);
  const [bukaCatatan, setBukaCatatan] = useState<string | null>(null);

  // Ikuti data kontrak terbaru (mis. setelah halaman memuat ulang), kecuali sedang menyimpan.
  const kunciData = JSON.stringify(k.checklistReview ?? null);
  useEffect(() => {
    if (!menyimpan) setItems(susunChecklistReview(k, k.checklistReview, override));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k.id, k.jenis, kunciData, override]);

  const petunjuk = useMemo(() => new Map(daftarChecklistReview(k, override).map((b) => [b.id, b.petunjuk])), [k, override]);
  const kemajuan = kemajuanChecklist(items);
  const judulId = `review-${k.id}`;

  /** Baca ulang kontrak, terapkan satu perubahan pada butir itu saja, lalu simpan. Dua Legal tidak saling menimpa butir lain. */
  const simpanPerubahan = async (penanda: string, ubah: (daftar: ItemChecklist[]) => ItemChecklist[]): Promise<boolean> => {
    const sebelum = items;
    setItems(ubah);
    setMenyimpan(penanda);
    try {
      const terbaru = await ambilKontrak(k.id);
      const dasar = susunChecklistReview(terbaru, terbaru.checklistReview, override);
      const baru = ubah(dasar);
      const c: ChecklistReview = { versi: VERSI_CHECKLIST, items: baru };
      await simpanChecklistReview(terbaru, c);
      setItems(baru);
      onBerubah?.(c);
      return true;
    } catch (err) {
      setItems(sebelum);
      toast.error(`Checklist belum tersimpan: ${pesanError(err)}`);
      return false;
    } finally {
      setMenyimpan(null);
    }
  };
  const terapkan = (id: string, ubah: (lama: ItemChecklist) => ItemChecklist) => simpanPerubahan(id, (daftar) => daftar.map((i) => (i.id === id ? ubah(i) : i)));

  // --- Pindai draf terbaru (K06 tahap 2) -------------------------------------------------------------
  const [pindai, setPindai] = useState<TahapPindai>({ t: "diam" });
  const urutanPindai = useRef(0);
  useEffect(
    () => () => {
      urutanPindai.current += 1;
    },
    [],
  );
  const saranPer = useMemo(() => new Map((pindai.t === "hasil" ? pindai.saran : []).map((s) => [s.id, s])), [pindai]);

  const jalankanPindai = async () => {
    const ke = ++urutanPindai.current;
    const batal = () => ke !== urutanPindai.current;
    setPindai({ t: "membaca", nama: "", langkah: "Mencari draf terbaru…" });
    try {
      const daftar = await ambilDokumen(k.nomorPengajuan);
      if (batal()) return;
      const draf = pilihDraftTerbaru(daftar, bisaDipindai);
      if (!draf) {
        return setPindai({ t: "galat", pesan: "Belum ada draf (Draft Kontrak atau Draft Final) berformat DOCX atau PDF di kontrak ini. Unggah drafnya dulu, atau pindai dokumen lain lewat panel Draf dan pindai." });
      }
      if (draf.ukuran > BATAS_UKURAN_EKSTRAK) return setPindai({ t: "galat", pesan: `${draf.nama} melebihi batas baca 30 MB, jadi tidak bisa dipindai.` });
      setPindai({ t: "membaca", nama: draf.nama, langkah: `Mengambil ${draf.nama}…` });
      const berkas = await ambilBerkasDokumen(k.nomorPengajuan, draf);
      if (batal()) return;
      const ekstrak = await ekstrakTeks(berkas, { onProgres: (persen) => !batal() && setPindai({ t: "membaca", nama: draf.nama, langkah: `Membaca ${draf.nama}… ${persen}%` }) });
      if (batal()) return;
      if (!ekstrak.terbaca) return setPindai({ t: "hasil", nama: draf.nama, saran: [], penanda: [], pesanBaca: ekstrak.pesan, terbaca: false });
      const hasil = pindaiDraf(ekstrak.teks, { judul: k.judul, mitra: k.mitra, nilai: k.nilai, mataUang: k.mataUang, tanggalMulai: k.tanggalMulai, tanggalBerakhir: k.tanggalBerakhir, jenis: k.jenis });
      const saran = saranChecklist(hasil, items.map((i) => i.id));
      setPindai({ t: "hasil", nama: draf.nama, saran, penanda: hasil.penandaKosong, pesanBaca: hasil.keterbacaan.tingkat === "baik" ? "" : [hasil.keterbacaan.pesan, ekstrak.pesan].filter(Boolean).join(" "), terbaca: hasil.keterbacaan.tingkat !== "buruk" });
    } catch (err) {
      if (!batal()) setPindai({ t: "galat", pesan: pesanError(err) });
    }
  };

  /** Hapus satu saran dari tampilan setelah diterapkan. */
  const lepasSaran = (ids: readonly string[]) => setPindai((p) => (p.t === "hasil" ? { ...p, saran: p.saran.filter((s) => !ids.includes(s.id)) } : p));

  const teksJejakCentang = "Dicentang dari saran pemindai (klausul terdeteksi di draf).";
  const centangSaran = async (id: string) => {
    const waktu = new Date().toISOString();
    const ok = await terapkan(id, (lama) => {
      const { oleh: _o, waktu: _w, ...sisa } = lama;
      return { ...sisa, selesai: true, oleh: sesi.nama, waktu, catatan: lama.catatan || teksJejakCentang };
    });
    if (ok) lepasSaran([id]);
  };
  const centangSemuaSaran = async () => {
    const ids = new Set((pindai.t === "hasil" ? pindai.saran : []).filter((s) => s.jenis === "centang").map((s) => s.id));
    if (ids.size === 0) return;
    const waktu = new Date().toISOString();
    const ok = await simpanPerubahan(
      "*",
      (daftar) =>
        daftar.map((i) => {
          if (!ids.has(i.id) || i.selesai) return i;
          const { oleh: _o, waktu: _w, ...sisa } = i;
          return { ...sisa, selesai: true, oleh: sesi.nama, waktu, catatan: i.catatan || teksJejakCentang };
        }),
    );
    if (ok) {
      toast.success(`${ids.size} butir dicentang dari saran pemindai.`, { description: "Periksa kembali; pemindai berbasis pola kata dan bisa keliru." });
      lepasSaran([...ids]);
    }
  };
  const catatSaran = async (s: SaranButir) => {
    const teks = `Pemindai: ${s.alasan}`.slice(0, BATAS_CATATAN);
    // Catatan Legal yang sudah ada dipertahankan; teks pemindai ditambahkan di belakangnya.
    const ok = await terapkan(s.id, (lama) => ({ ...lama, catatan: (lama.catatan && !lama.catatan.includes(teks) ? `${lama.catatan} ${teks}` : lama.catatan || teks).slice(0, BATAS_CATATAN) }));
    if (ok) lepasSaran([s.id]);
  };

  const centang = (i: ItemChecklist) => {
    const selesai = !i.selesai;
    const waktu = new Date().toISOString();
    void terapkan(i.id, (lama) => {
      const { oleh: _o, waktu: _w, ...sisa } = lama;
      return selesai ? { ...sisa, selesai: true, oleh: sesi.nama, waktu } : { ...sisa, selesai: false };
    });
  };

  const simpanCatatan = (i: ItemChecklist, teks: string) => {
    const bersih = teks.trim().slice(0, BATAS_CATATAN);
    if (bersih === (i.catatan ?? "")) return;
    void terapkan(i.id, (lama) => {
      const { catatan: _c, ...sisa } = lama;
      return bersih ? { ...sisa, catatan: bersih } : sisa;
    });
  };

  // --- Tampilan pengaju: hanya butir selesai, tanpa catatan dan nama pemeriksa ---------------------
  if (!internal) {
    const selesai = items.filter((i) => i.selesai);
    return (
      <section className="kartu overflow-hidden" aria-labelledby={judulId}>
        <div className="border-b border-line px-5 py-4">
          <h2 id={judulId} className="flex items-center gap-2 font-bold">
            <ListChecks className="h-4 w-4 text-brand" aria-hidden="true" /> Pemeriksaan klausul oleh Legal
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {selesai.length === 0 ? "Legal baru mulai memeriksa. Butir yang sudah beres akan muncul di sini." : `${selesai.length} dari ${kemajuan.total} butir sudah diperiksa.`}
          </p>
        </div>
        {selesai.length > 0 && (
          <ul className="grid gap-x-4 gap-y-2 px-5 py-4 sm:grid-cols-2">
            {selesai.map((i) => (
              <li key={i.id} className="flex min-w-0 items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span className="min-w-0">{i.label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  // --- Tampilan Legal / Pemantau ------------------------------------------------------------------
  const peringatan = bolehUbah ? peringatanChecklist({ versi: VERSI_CHECKLIST, items }) : null;
  return (
    <section className="kartu overflow-hidden" aria-labelledby={judulId}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id={judulId} className="flex items-center gap-2 font-bold">
            <ListChecks className="h-4 w-4 text-brand" aria-hidden="true" /> Checklist review klausul
          </h2>
          <p className="mt-0.5 text-xs text-muted">{bolehUbah ? "Centang yang sudah aman. Catatan hanya terlihat oleh tim Legal." : "Hanya baca. Checklist bisa diubah selama tahap Review Legal."}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <TandaStandarAwal />
          {bolehUbah && (
            <Tombol kecil varian="kedua" ikon={<ScanSearch className="h-3.5 w-3.5" />} memuat={pindai.t === "membaca"} disabled={menyimpan != null} onClick={() => void jalankanPindai()}>
              Pindai draf terbaru
            </Tombol>
          )}
        </div>
      </div>

      {pindai.t !== "diam" && (
        <div className="border-b border-line bg-raised px-5 py-4" aria-live="polite">
          {pindai.t === "membaca" && <p className="text-sm text-muted">{pindai.langkah}</p>}
          {pindai.t === "galat" && (
            <div className="flex items-start justify-between gap-3">
              <p role="alert" className="min-w-0 break-words text-sm text-danger">
                {pindai.pesan}
              </p>
              <button type="button" onClick={() => setPindai({ t: "diam" })} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink [@media(pointer:fine)]:h-8 [@media(pointer:fine)]:w-8" aria-label="Tutup pesan">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
          {pindai.t === "hasil" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    Hasil pindai <span className="break-all">{pindai.nama}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{pindai.terbaca ? ringkasSaran(pindai.saran) : "Teks draf belum terbaca, jadi tidak ada saran."}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {pindai.saran.some((s) => s.jenis === "centang") && (
                    <Tombol kecil ikon={<Check className="h-3.5 w-3.5" />} memuat={menyimpan === "*"} disabled={menyimpan != null} onClick={() => void centangSemuaSaran()}>
                      Centang {pindai.saran.filter((s) => s.jenis === "centang").length} saran
                    </Tombol>
                  )}
                  <Tombol kecil varian="hantu" onClick={() => setPindai({ t: "diam" })}>
                    Tutup
                  </Tombol>
                </div>
              </div>
              {pindai.pesanBaca && <p className="rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-ink">{pindai.pesanBaca}</p>}
              <PenandaKosongPindai penanda={pindai.penanda} />
              <p className="text-xs text-muted">
                {PENAFIAN} Isi dokumen dibaca di peramban ini saja. Tidak ada yang tercentang sebelum Anda menekan tombolnya.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="px-5 pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="angka text-lg font-semibold">
            {kemajuan.selesai} dari {kemajuan.total} butir
          </p>
          <p className="text-xs text-muted">{kemajuan.selesai === kemajuan.total && kemajuan.total > 0 ? "Semua butir beres" : `${kemajuan.persen}%`}</p>
        </div>
        <BilahKemajuan persen={kemajuan.persen} nada={kemajuan.selesai === kemajuan.total ? "success" : "brand"} label={`Checklist review: ${kemajuan.selesai} dari ${kemajuan.total} butir`} />
      </div>

      <ul className="mt-3 divide-y divide-line" aria-label="Butir review klausul">
        {items.map((i) => {
          const sibuk = menyimpan === i.id || menyimpan === "*";
          const idCentang = `butir-${k.id}-${i.id}`;
          const terbuka = bukaCatatan === i.id;
          const saran = bolehUbah ? saranPer.get(i.id) : undefined;
          return (
            <li key={i.id} className={cx("px-5 py-3 transition-colors", i.selesai && "bg-raised")}>
              <div className="flex items-start gap-3">
                {bolehUbah ? (
                  <motion.button
                    type="button"
                    id={idCentang}
                    role="checkbox"
                    aria-checked={i.selesai}
                    aria-label={i.label}
                    disabled={sibuk}
                    whileTap={kurangiGerak ? undefined : tekan}
                    transition={pegas}
                    onClick={() => centang(i)}
                    className={cx(
                      "relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors before:absolute before:-inset-3 before:content-[''] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:opacity-60",
                      i.selesai ? "border-success bg-success text-white" : "border-line bg-surface hover:border-brand",
                    )}
                  >
                    {i.selesai && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />}
                  </motion.button>
                ) : (
                  <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2", i.selesai ? "border-success bg-success text-white" : "border-line")} aria-hidden="true">
                    {i.selesai && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <label htmlFor={bolehUbah ? idCentang : undefined} className={cx("block text-sm font-semibold", bolehUbah && "cursor-pointer [@media(pointer:coarse)]:-my-2 [@media(pointer:coarse)]:py-2")}>
                    {i.label}
                    {!bolehUbah && <span className="sr-only">{i.selesai ? " (selesai)" : " (belum)"}</span>}
                  </label>
                  {petunjuk.get(i.id) && <p className="mt-0.5 text-xs text-muted">{petunjuk.get(i.id)}</p>}
                  {i.selesai && i.oleh && (
                    <p className="mt-1 text-[11px] text-muted">
                      Diperiksa {i.oleh}
                      {i.waktu ? `, ${formatWaktu(i.waktu)}` : ""}
                    </p>
                  )}
                  {saran && !(saran.jenis === "centang" && i.selesai) && (
                    <div className={cx("mt-1.5 rounded-lg px-2.5 py-1.5 text-xs", saran.jenis === "centang" ? "bg-success-soft text-success" : "bg-accent-soft text-accent-ink")}>
                      <p className="break-words">
                        <span className="font-semibold">{saran.jenis === "centang" ? "Saran centang:" : i.selesai ? "Sudah dicentang, tetapi pemindai menandai:" : "Perlu dicek:"}</span> {saran.alasan}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {saran.jenis === "centang" ? (
                          <Tombol kecil disabled={sibuk} onClick={() => void centangSaran(i.id)}>
                            Centang butir ini
                          </Tombol>
                        ) : (
                          <Tombol kecil varian="kedua" disabled={sibuk} onClick={() => void catatSaran(saran)}>
                            Simpan sebagai catatan
                          </Tombol>
                        )}
                        <Tombol kecil varian="hantu" disabled={sibuk} onClick={() => lepasSaran([i.id])}>
                          Abaikan
                        </Tombol>
                      </div>
                    </div>
                  )}
                  {i.catatan && !terbuka && (
                    <p className="mt-1.5 rounded-lg bg-info-soft px-2.5 py-1.5 text-xs text-info">
                      <span className="font-semibold">Catatan:</span> <span className="break-words">{i.catatan}</span>
                    </p>
                  )}
                  <AnimatePresence initial={false}>
                    {terbuka && bolehUbah && (
                      <motion.div initial={kurangiGerak ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={kurangiGerak ? { opacity: 0 } : { opacity: 0, height: 0 }} className="overflow-hidden">
                        <IsianCatatan
                          awal={i.catatan ?? ""}
                          label={`Catatan untuk ${i.label}`}
                          onSimpan={(t) => {
                            simpanCatatan(i, t);
                            setBukaCatatan(null);
                          }}
                          onBatal={() => setBukaCatatan(null)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {bolehUbah && !terbuka && (
                  <button
                    type="button"
                    onClick={() => setBukaCatatan(i.id)}
                    disabled={sibuk}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                    aria-label={i.catatan ? `Ubah catatan ${i.label}` : `Tambah catatan ${i.label}`}
                    title={i.catatan ? "Ubah catatan" : "Tambah catatan"}
                  >
                    <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {peringatan && kemajuan.selesai > 0 && (
        <p className="flex items-start gap-2 border-t border-line bg-accent-soft px-5 py-3 text-xs text-accent-ink" role="note">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {peringatan}
        </p>
      )}
    </section>
  );
}

function IsianCatatan({ awal, label, onSimpan, onBatal }: { awal: string; label: string; onSimpan: (t: string) => void; onBatal: () => void }) {
  const [teks, setTeks] = useState(awal);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form
      className="mt-2 flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        onSimpan(teks);
      }}
    >
      <input
        ref={ref}
        className="input !py-2 !text-xs"
        value={teks}
        maxLength={BATAS_CATATAN}
        placeholder="mis. Denda 1‰ per hari, maks. 5%. Sudah sesuai."
        aria-label={label}
        onChange={(e) => setTeks(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onBatal())}
      />
      <div className="flex shrink-0 gap-2">
        <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-on hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-4">
          Simpan
        </button>
        <button type="button" onClick={onBatal} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-4">
          Batal
        </button>
      </div>
    </form>
  );
}

/**
 * Isi ringkas untuk modal "Lanjut ke Tanda Tangan": kemajuan checklist dan peringatan lunak bila belum lengkap.
 * Tidak memblokir apa pun. Teks aktivitasnya: ringkasSebelumTtd(checklistReviewKontrak(k)) dari lib/syarat.
 */
export function PeringatanReview({ kontrak: k, override }: { kontrak: Kontrak; override?: OverrideReview }) {
  const c = checklistReviewKontrak(k, override);
  const { selesai, total, persen } = kemajuanChecklist(c.items);
  const peringatan = peringatanChecklist(c);
  return (
    <div className={cx("rounded-2xl p-4 text-sm", peringatan ? "bg-accent-soft text-accent-ink" : "bg-success-soft text-success")} role="note">
      <p className="flex items-center gap-2 font-semibold">
        {peringatan ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
        Checklist review: {selesai} dari {total} butir
      </p>
      <div className="mt-2">
        <BilahKemajuan persen={persen} nada={peringatan ? "accent" : "success"} label={`Checklist review: ${selesai} dari ${total} butir`} />
      </div>
      <p className="mt-2 text-xs">{peringatan ?? "Semua butir sudah diperiksa. Ringkasannya akan dicatat di riwayat."}</p>
      <p className="sr-only">{ringkasSebelumTtd(c)}</p>
    </div>
  );
}
