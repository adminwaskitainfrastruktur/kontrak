// Langkah opsional di chat pengajuan: pengaju mengunggah draf kontraknya, aplikasi membaca dan menyarankan
// isian (judul, jenis, mitra, nilai, masa berlaku). Pengguna memilih sendiri isian mana yang dipakai; tidak ada
// yang terisi diam-diam. Isi dokumen dibaca di peramban dan tidak dikirim ke mana pun.
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { AlertTriangle, Check, FileUp, Loader2, Paperclip, ShieldCheck, Sparkles, X } from "lucide-react";
import { Lencana, Tombol, cx } from "./ui";
import { pegasLembut } from "../lib/gerak";
import { acak } from "../lib/kata";
import { ekstrakTeks, GalatEkstrak } from "../lib/ekstrak";
import { LABEL_BIDANG, pindaiDraf, teksSaran, type BidangSaran, type DataPembanding, type RincianSaran, type SaranIsian } from "../lib/pemindai";
import type { Keyakinan } from "../lib/parserID";

/** Urutan tampil; mata uang ikut nilai sehingga tidak ditampilkan terpisah. */
const URUTAN: readonly BidangSaran[] = ["judul", "jenis", "mitra", "nilai", "tanggalMulai", "tanggalBerakhir"];

const LABEL_YAKIN: Record<Keyakinan, { teks: string; nada: "sukses" | "netral" | "peringatan" }> = {
  tinggi: { teks: "Yakin", nada: "sukses" },
  sedang: { teks: "Cukup yakin", nada: "netral" },
  rendah: { teks: "Perlu dicek", nada: "peringatan" },
};

const KALIMAT_TEMU = [
  "Ini yang saya temukan di dokumen. Centang yang mau dipakai, sisanya saya tanyakan seperti biasa.",
  "Sudah saya baca. Pilih isian yang benar, nanti saya lewati pertanyaannya.",
  "Beberapa data sudah ketemu. Periksa sebentar ya, lalu pakai yang cocok.",
] as const;

type Keadaan =
  | { t: "awal" }
  | { t: "membaca"; nama: string; persen: number }
  | { t: "pilih"; berkas: File; saran: Partial<SaranIsian>; rincian: Partial<Record<BidangSaran, RincianSaran>>; pesanBaca: string; kalimat: string }
  | { t: "kosong"; berkas: File | null; pesan: string; bisaLampir: boolean };

export interface PropsUnggahCerdas {
  /** Dipanggil saat pengguna memilih "Pakai". `saran` hanya berisi isian yang dicentang; bisa kosong (lampirkan saja). */
  onSaran: (saran: Partial<SaranIsian>, berkas: File) => void;
  /** Data yang sudah terisi di chat (mis. jenis dari tautan addendum), dipakai menentukan relevansi nilai MoU. */
  pembanding?: DataPembanding;
  nonaktif?: boolean;
  className?: string;
}

export function UnggahCerdas({ onSaran, pembanding, nonaktif, className }: PropsUnggahCerdas) {
  const [k, setK] = useState<Keadaan>({ t: "awal" });
  const [pilihan, setPilihan] = useState<Set<BidangSaran>>(new Set());
  const urutan = useRef(0);
  const masukan = useRef<HTMLInputElement>(null);

  const baca = async (berkas: File) => {
    const ke = ++urutan.current;
    setK({ t: "membaca", nama: berkas.name, persen: 0 });
    try {
      const ekstrak = await ekstrakTeks(berkas, { onProgres: (persen) => ke === urutan.current && setK({ t: "membaca", nama: berkas.name, persen }) });
      if (ke !== urutan.current) return;
      if (!ekstrak.terbaca) {
        setK({ t: "kosong", berkas, pesan: `${ekstrak.pesan} Berkasnya tetap bisa dilampirkan ke pengajuan.`, bisaLampir: true });
        return;
      }
      const hasil = pindaiDraf(ekstrak.teks, pembanding ? { jenis: pembanding.jenis } : null);
      const ada = URUTAN.filter((b) => hasil.saranIsian[b] !== undefined);
      if (!ada.length) {
        setK({ t: "kosong", berkas, pesan: "Dokumennya terbaca, tetapi saya tidak menemukan judul, mitra, nilai, atau tanggal yang cukup jelas. Kita isi bersama lewat pertanyaan ya.", bisaLampir: true });
        return;
      }
      setPilihan(new Set(ada.filter((b) => hasil.rincianSaran[b]?.keyakinan !== "rendah")));
      setK({ t: "pilih", berkas, saran: hasil.saranIsian, rincian: hasil.rincianSaran, pesanBaca: [ekstrak.pesan, hasil.keterbacaan.tingkat !== "baik" ? hasil.keterbacaan.pesan : ""].filter(Boolean).join(" "), kalimat: acak(KALIMAT_TEMU) });
    } catch (err) {
      if (ke !== urutan.current) return;
      setK({ t: "kosong", berkas: null, pesan: err instanceof GalatEkstrak ? err.message : "Dokumen ini gagal dibaca di peramban.", bisaLampir: false });
    }
  };

  const batal = () => {
    urutan.current++;
    setK({ t: "awal" });
  };

  const pakai = () => {
    if (k.t !== "pilih") return;
    const hasil: Partial<SaranIsian> = {};
    for (const b of pilihan) Object.assign(hasil, { [b]: k.saran[b] });
    if (pilihan.has("nilai") && k.saran.mataUang) hasil.mataUang = k.saran.mataUang;
    onSaran(hasil, k.berkas);
    setK({ t: "awal" });
  };

  const ubah = (b: BidangSaran) =>
    setPilihan((s) => {
      const baru = new Set(s);
      if (baru.has(b)) baru.delete(b);
      else baru.add(b);
      return baru;
    });

  const daftar = useMemo(() => (k.t === "pilih" ? URUTAN.filter((b) => k.saran[b] !== undefined) : []), [k]);

  return (
    <MotionConfig reducedMotion="user">
      <div className={cx("min-w-0", className)}>
        <input
          ref={masukan}
          type="file" aria-label="Pilih berkas untuk diunggah"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void baca(f);
          }}
        />
        <AnimatePresence mode="wait" initial={false}>
          {k.t === "awal" && (
            <motion.div key="awal" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={pegasLembut}>
              <button
                type="button"
                disabled={nonaktif}
                onClick={() => masukan.current?.click()}
                className="group flex min-h-11 w-full items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-4 py-3 text-left text-sm transition-colors hover:border-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand transition-colors group-hover:bg-surface" aria-hidden="true">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Punya draf kontraknya? Unggah, saya isi otomatis</span>
                  <span className="block text-xs text-muted">PDF atau Word. Dibaca di peramban Anda saja, tidak dikirim ke mana pun.</span>
                </span>
                <FileUp className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              </button>
            </motion.div>
          )}

          {k.t === "membaca" && (
            <motion.div key="membaca" role="status" aria-live="polite" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={pegasLembut} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">Membaca {k.nama}</span>
                <span className="text-xs text-muted">{k.persen ? `${k.persen}% selesai` : "Sebentar ya…"}</span>
              </span>
              <Tombol kecil varian="hantu" onClick={batal}>
                Batal
              </Tombol>
            </motion.div>
          )}

          {k.t === "kosong" && (
            <motion.div key="kosong" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={pegasLembut} className="rounded-2xl bg-accent-soft p-4 text-sm text-accent-ink" role="alert">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p className="min-w-0 flex-1">{k.pesan}</p>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Tombol kecil varian="hantu" onClick={batal} ikon={<X className="h-4 w-4" />}>
                  Tutup
                </Tombol>
                {k.bisaLampir && k.berkas && (
                  <Tombol
                    kecil
                    varian="kedua"
                    ikon={<Paperclip className="h-4 w-4" />}
                    onClick={() => {
                      onSaran({}, k.berkas!);
                      setK({ t: "awal" });
                    }}
                  >
                    Lampirkan saja
                  </Tombol>
                )}
              </div>
            </motion.div>
          )}

          {k.t === "pilih" && (
            <motion.section key="pilih" aria-labelledby="judul-unggah-cerdas" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={pegasLembut} className="kartu overflow-hidden">
              <div className="border-b border-line px-4 py-3">
                <h3 id="judul-unggah-cerdas" className="flex items-center gap-2 text-sm font-bold">
                  <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" /> Saran dari {k.berkas.name}
                </h3>
                <p className="mt-0.5 text-xs text-muted">{k.kalimat}</p>
                {k.pesanBaca && <p className="mt-1 text-xs text-accent-ink">{k.pesanBaca}</p>}
              </div>
              <fieldset>
                <legend className="sr-only">Isian yang akan dipakai</legend>
                <ul className="divide-y divide-line">
                  {daftar.map((b) => {
                    const r = k.rincian[b];
                    const aktif = pilihan.has(b);
                    const nilai = k.saran[b]!;
                    return (
                      <li key={b}>
                        <label className={cx("flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-raised", aktif && "bg-brand-soft")}>
                          <input type="checkbox" checked={aktif} onChange={() => ubah(b)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--wh-brand)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft" />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted">{LABEL_BIDANG[b]}</span>
                              {r && <Lencana nada={LABEL_YAKIN[r.keyakinan].nada}>{LABEL_YAKIN[r.keyakinan].teks}</Lencana>}
                            </span>
                            <span className="mt-0.5 block break-words text-sm font-semibold">{teksSaran(b, nilai, k.saran.mataUang)}</span>
                            {r?.catatan && <span className="mt-0.5 block text-xs text-accent-ink">{r.catatan}</span>}
                            {r?.sumber && <span className="mt-1 line-clamp-2 break-words text-xs italic text-muted">{r.sumber}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
              <div className="flex flex-col gap-2 border-t border-line bg-raised px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-1.5 text-xs text-muted">
                  <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Saran otomatis, bukan nasihat hukum. Berkas ikut dilampirkan.
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Tombol kecil varian="hantu" onClick={batal}>
                    Batal
                  </Tombol>
                  <Tombol kecil onClick={pakai} ikon={<Check className="h-4 w-4" />}>
                    {pilihan.size ? `Pakai ${pilihan.size} isian` : "Lampirkan saja"}
                  </Tombol>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
