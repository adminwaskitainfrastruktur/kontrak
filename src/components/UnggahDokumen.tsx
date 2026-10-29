// Antrean unggah bersama untuk chat pengajuan, formulir, dan panel dokumen: seret-lepas, chip jenis per
// berkas (dengan tebakan dari nama), hapus dari antrean, dan hitungan dokumen wajib. Komponen terkendali:
// induk menyimpan daftar berkas dan memutuskan kapan mengunggah (lihat unggahBanyak di services/dokumen).
import { useId, useMemo, useState, type DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Check, Circle, CloudUpload, File, FileArchive, FileImage, FileSpreadsheet, FileText, Sparkles, X, type LucideIcon } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { BATAS_BERKAS_ANTREAN, BATAS_UKURAN_BERKAS, bolehJadiKontrakFinal, hitungSyarat, pilihanJenisUntuk, tampilanBerkas, tebakJenis, teksUkuran, validasiBerkas, type NamaIkonBerkas } from "../lib/jenisBerkas";
import type { JenisDokumen } from "../lib/types";
import { pegas, tekan } from "../lib/gerak";
import { cx } from "./ui";

export interface BerkasAntre {
  file: File;
  jenis: JenisDokumen;
  /** true bila jenis berasal dari tebakan nama berkas dan belum disentuh pengguna. */
  ditebak?: boolean;
}

const IKON: Record<NamaIkonBerkas, LucideIcon> = { FileText, FileSpreadsheet, FileImage, FileArchive, File };

/** Petak ikon berwarna sesuai ekstensi berkas. */
export function IkonBerkas({ nama, kecil }: { nama: string; kecil?: boolean }) {
  const t = tampilanBerkas(nama);
  const Ikon = IKON[t.ikon];
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-xl", kecil ? "h-8 w-8" : "h-10 w-10", t.kelas)} title={t.label}>
      <Ikon className={kecil ? "h-4 w-4" : "h-5 w-5"} aria-hidden="true" />
      <span className="sr-only">{t.label}</span>
    </span>
  );
}

const kunci = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

export interface PropsUnggahDokumen {
  berkas: BerkasAntre[];
  onUbah: (berkas: BerkasAntre[]) => void;
  /** Jenis dokumen wajib; menampilkan hitungan "x dari y lengkap". */
  syarat?: readonly JenisDokumen[];
  /** Jenis dokumen yang sudah ada di SharePoint, ikut dihitung untuk syarat. */
  sudahAda?: readonly (JenisDokumen | "")[];
  /** Tampilan rapat untuk gelembung chat. */
  kompak?: boolean;
  /** Jenis untuk berkas yang tidak bisa ditebak. Bawaan "Dokumen Pendukung". */
  jenisBawaan?: JenisDokumen;
  /** Batasi pilihan jenis. Bawaan: semua jenis yang boleh dipakai pengguna ini. */
  pilihanJenis?: readonly JenisDokumen[];
  /** Hanya menerima PDF (mis. kontrak bertanda tangan). */
  hanyaPdf?: boolean;
  nonaktif?: boolean;
  /** Teks bantu di area seret. */
  petunjuk?: string;
}

export default function UnggahDokumen({ berkas, onUbah, syarat, sudahAda = [], kompak, jenisBawaan = "Dokumen Pendukung", pilihanJenis, hanyaPdf, nonaktif, petunjuk }: PropsUnggahDokumen) {
  const { sesi } = useSesi();
  const idInput = useId();
  const [seret, setSeret] = useState(false);
  const pilihan = useMemo(() => {
    const dasar = pilihanJenisUntuk(sesi);
    return pilihanJenis ? dasar.filter((j) => pilihanJenis.includes(j)) : dasar;
  }, [sesi, pilihanJenis]);

  const tambah = (files: File[]) => {
    if (nonaktif || !files.length) return;
    const ditolak: string[] = [];
    const baru: BerkasAntre[] = [];
    const ada = new Set(berkas.map((b) => kunci(b.file)));
    for (const f of files) {
      if (ada.has(kunci(f))) continue;
      const alasan = hanyaPdf && !bolehJadiKontrakFinal(f.name) ? `"${f.name}" bukan PDF. Bagian ini hanya menerima PDF.` : validasiBerkas(f.name, f.size);
      if (alasan) {
        ditolak.push(alasan);
        continue;
      }
      if (berkas.length + baru.length >= BATAS_BERKAS_ANTREAN) {
        ditolak.push(`Maksimal ${BATAS_BERKAS_ANTREAN} berkas sekali unggah. Sisanya bisa ditambahkan setelah ini.`);
        break;
      }
      ada.add(kunci(f));
      const tebakan = tebakJenis(f.name);
      const jenis = tebakan && pilihan.includes(tebakan) ? tebakan : pilihan.includes(jenisBawaan) ? jenisBawaan : (pilihan[0] ?? jenisBawaan);
      baru.push({ file: f, jenis, ditebak: !!tebakan && jenis === tebakan });
    }
    if (ditolak.length) {
      toast.error(ditolak.length === 1 ? "Satu berkas tidak bisa ditambahkan" : `${ditolak.length} berkas tidak bisa ditambahkan`, { description: ditolak.slice(0, 3).join(" ") });
    }
    if (baru.length) onUbah([...berkas, ...baru]);
  };

  const ubahJenis = (i: number, jenis: JenisDokumen) => onUbah(berkas.map((b, j) => (j === i ? { ...b, jenis, ditebak: false } : b)));
  const hapus = (i: number) => onUbah(berkas.filter((_, j) => j !== i));

  const tanganiJatuh = (e: DragEvent) => {
    e.preventDefault();
    setSeret(false);
    tambah(Array.from(e.dataTransfer.files));
  };

  const hitung = syarat?.length ? hitungSyarat(syarat, [...sudahAda, ...berkas.map((b) => b.jenis)]) : null;
  const tebakanAda = berkas.some((b) => b.ditebak);

  return (
    <div className="min-w-0 space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!nonaktif) setSeret(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSeret(false);
        }}
        onDrop={tanganiJatuh}
        className={cx(
          "rounded-2xl border-2 border-dashed transition-colors focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft",
          seret ? "border-brand bg-brand-soft" : "border-line",
          nonaktif && "opacity-60",
        )}
      >
        <label
          htmlFor={idInput}
          className={cx(
            "flex cursor-pointer items-center gap-3 text-left",
            kompak ? "px-3.5 py-3" : "flex-col justify-center px-4 py-7 text-center sm:py-8",
            nonaktif && "pointer-events-none",
          )}
        >
          <motion.span animate={seret ? { y: -3, scale: 1.08 } : { y: 0, scale: 1 }} transition={pegas} className={cx("grid shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand", kompak ? "h-9 w-9" : "h-12 w-12")} aria-hidden="true">
            <CloudUpload className={kompak ? "h-4 w-4" : "h-6 w-6"} />
          </motion.span>
          <span className={cx("min-w-0", !kompak && "mt-1")}>
            <span className="block text-sm font-semibold">
              {seret ? (
                "Lepaskan di sini"
              ) : (
                <>
                  {/* Layar sentuh tidak bisa menyeret berkas: ajakannya diganti "ketuk". */}
                  <span className="[@media(pointer:coarse)]:hidden">{kompak ? "Pilih atau seret berkas" : "Seret berkas ke sini, atau klik untuk memilih"}</span>
                  <span className="hidden [@media(pointer:coarse)]:inline">Ketuk untuk memilih berkas</span>
                </>
              )}
            </span>
            <span className="block text-xs text-muted">
              {petunjuk ?? (hanyaPdf ? `Hanya PDF, maksimal ${teksUkuran(BATAS_UKURAN_BERKAS)}.` : `PDF, Word, Excel, gambar, atau ZIP. Maksimal ${teksUkuran(BATAS_UKURAN_BERKAS)} per berkas.`)}
            </span>
          </span>
          <input
            id={idInput}
            type="file" aria-label="Pilih berkas untuk diunggah"
            multiple={!hanyaPdf}
            accept={hanyaPdf ? "application/pdf,.pdf" : undefined}
            disabled={nonaktif}
            className="sr-only"
            onChange={(e) => {
              tambah(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <AnimatePresence initial={false}>
        {berkas.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface"
            aria-label="Berkas yang akan diunggah"
          >
            <AnimatePresence initial={false}>
              {berkas.map((b, i) => (
                <motion.li
                  key={kunci(b.file)}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap", kompak ? "px-3 py-2.5" : "px-3.5 py-3")}
                >
                  <IkonBerkas nama={b.file.name} kecil />
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm font-medium" title={b.file.name}>
                      {b.file.name}
                    </p>
                    <p className="text-xs text-muted">{teksUkuran(b.file.size)}</p>
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5">
                    {b.ditebak && (
                      <span className="text-accent-ink" title="Jenis ditebak dari nama berkas. Periksa sebelum mengunggah.">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">Jenis ditebak dari nama berkas.</span>
                      </span>
                    )}
                    {pilihan.length > 1 ? (
                      <select
                        value={b.jenis}
                        onChange={(e) => ubahJenis(i, e.target.value as JenisDokumen)}
                        disabled={nonaktif}
                        aria-label={`Jenis dokumen untuk ${b.file.name}`}
                        className={cx(
                          "max-w-[10rem] cursor-pointer truncate rounded-full border px-2.5 py-1 text-xs font-semibold sm:max-w-[12rem] transition-colors focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-soft",
                          b.ditebak ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-raised text-ink hover:border-brand",
                        )}
                      >
                        {pilihan.map((j) => (
                          <option key={j} value={j}>
                            {j}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="rounded-full bg-raised px-2.5 py-1 text-xs font-semibold">{b.jenis}</span>
                    )}
                    <motion.button
                      type="button"
                      whileTap={tekan}
                      onClick={() => hapus(i)}
                      disabled={nonaktif}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:bg-danger-soft focus-visible:text-danger disabled:opacity-50 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                      aria-label={`Keluarkan ${b.file.name} dari antrean`}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </motion.button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </AnimatePresence>

      {tebakanAda && !kompak && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Sparkles className="h-3.5 w-3.5 text-accent-ink" aria-hidden="true" /> Jenis bertanda kuning ditebak dari nama berkas. Ganti bila kurang tepat.
        </p>
      )}

      {hitung && (
        <div className="rounded-2xl bg-raised px-3.5 py-3" aria-live="polite">
          <p className="text-xs font-semibold">
            Dokumen wajib:{" "}
            <span className={hitung.kurang.length ? "text-ink" : "text-success"}>
              {hitung.terpenuhi.length} dari {hitung.terpenuhi.length + hitung.kurang.length} lengkap
            </span>
            {!hitung.kurang.length && " · semua sudah ada, terima kasih!"}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {[...hitung.terpenuhi.map((j) => ({ j, ok: true })), ...hitung.kurang.map((j) => ({ j, ok: false }))].map(({ j, ok }) => (
              <li key={j} className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", ok ? "bg-success-soft text-success" : "bg-surface text-muted")}>
                {ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-3 w-3" aria-hidden="true" />}
                {j}
                <span className="sr-only">{ok ? " (sudah ada)" : " (belum ada)"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
