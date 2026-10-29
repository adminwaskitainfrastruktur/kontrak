// Area unggah di modal "Tandai Sudah Ditandatangani" (U19). Kontrak tidak boleh Aktif tanpa salinan
// bertanda tangan: komponen ini memastikan ada dokumen PDF berjenis "Kontrak Ditandatangani", memberi tahu
// modal lewat onSiap, dan menyerahkan webUrl-nya untuk kolom KontrakFinal. Admin boleh melewati dengan
// alasan tertulis; Legal hanya diberi peringatan dan tidak bisa melewati.
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { CircleCheck, CloudUpload, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useMuat } from "../hooks/useMuat";
import { catatAktivitas } from "../services/aktivitas";
import { ambilDokumen, ubahJenisDokumen, unggahDokumen } from "../services/dokumen";
import { pesanError } from "../lib/graph";
import { bolehJadiKontrakFinal, dokumenFinalTerbaru, kepalaPdfValid, teksUkuran, validasiBerkas } from "../lib/jenisBerkas";
import type { Dokumen, JenisDokumen, Kontrak } from "../lib/types";
import { pegas } from "../lib/gerak";
import { IkonBerkas } from "./UnggahDokumen";
import { Isian, KotakError, Kerangka, cx } from "./ui";

const JENIS_FINAL: JenisDokumen = "Kontrak Ditandatangani";
/** Alasan melewati harus cukup jelas untuk dibaca auditor. */
export const MIN_ALASAN_LEWATI = 15;

export interface BerkasFinal {
  id: string;
  nama: string;
  webUrl: string;
}

export interface PropsUnggahAktivasi {
  kontrak: Kontrak;
  /**
   * Dipanggil setiap kali keadaan berubah. `siap` true bila ada kontrak bertanda tangan, atau Admin
   * melewati dengan alasan yang cukup. `final` = berkas untuk kolom KontrakFinal (null bila dilewati).
   */
  onSiap: (siap: boolean, final: BerkasFinal | null) => void;
  /** Dipanggil setelah berkas baru berhasil diunggah (mis. untuk memuat ulang panel dokumen). */
  onUnggah?: (berkas: BerkasFinal) => void;
  /** Admin melewati unggah: alasan (sudah dirapikan) atau null bila batal melewati. Catat di aktivitas aksi. */
  onLewati?: (alasan: string | null) => void;
  /** Daftar dokumen yang sudah dimuat induk; bila kosong komponen memuat sendiri. */
  dokumen?: readonly Dokumen[] | null;
}

export default function UnggahAktivasi({ kontrak: k, onSiap, onUnggah, onLewati, dokumen }: PropsUnggahAktivasi) {
  const { sesi } = useSesi();
  const idInput = useId();
  const q = useMuat(() => (dokumen ? Promise.resolve([...dokumen]) : ambilDokumen(k.nomorPengajuan)), [k.nomorPengajuan, dokumen]);
  const [baru, setBaru] = useState<BerkasFinal | null>(null);
  const [persen, setPersen] = useState<number | null>(null);
  const [galat, setGalat] = useState("");
  const [seret, setSeret] = useState(false);
  const [lewati, setLewati] = useState(false);
  const [alasan, setAlasan] = useState("");
  const admin = sesi.peran === "Admin";

  const ada = dokumenFinalTerbaru(q.data ?? []);
  const final: BerkasFinal | null = baru ?? (ada ? { id: ada.id, nama: ada.nama, webUrl: ada.webUrl } : null);
  const alasanCukup = admin && lewati && alasan.trim().length >= MIN_ALASAN_LEWATI;
  const siap = !!final || alasanCukup;

  // Callback induk bisa berganti tiap render; simpan di ref agar efek hanya bereaksi pada keadaan.
  const cb = useRef({ onSiap, onLewati });
  cb.current = { onSiap, onLewati };
  useEffect(() => {
    cb.current.onSiap(siap, final);
  }, [siap, final?.id, final?.webUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    cb.current.onLewati?.(!final && alasanCukup ? alasan.trim() : null);
  }, [alasanCukup, alasan, !!final]); // eslint-disable-line react-hooks/exhaustive-deps

  const unggah = async (file: File) => {
    setGalat("");
    if (!bolehJadiKontrakFinal(file.name)) return setGalat("Kontrak bertanda tangan harus berupa PDF (hasil pindai atau tanda tangan elektronik).");
    const alasanTolak = validasiBerkas(file.name, file.size);
    if (alasanTolak) return setGalat(alasanTolak);
    if (!kepalaPdfValid(await file.slice(0, 5).text())) return setGalat(`"${file.name}" berakhiran .pdf tetapi isinya bukan PDF. Ekspor ulang ke PDF lalu coba lagi.`);

    setPersen(0);
    try {
      const h = await unggahDokumen(k, file, JENIS_FINAL, setPersen);
      let berjenis = h.metadataTersimpan;
      if (!berjenis) berjenis = await ubahJenisDokumen(h.id, JENIS_FINAL).then(() => true, () => false);
      if (!berjenis) toast.warning("Berkas tersimpan, tetapi jenisnya belum tercatat", { description: 'Tandai jenisnya "Kontrak Ditandatangani" lewat panel Dokumen setelah ini.' });
      await catatAktivitas({ kontrakId: k.id, jenis: "Dokumen", pesan: `Mengunggah kontrak bertanda tangan "${h.nama}".` }, sesi).catch(() =>
        toast.warning("Unggahan tidak tercatat di riwayat."),
      );
      const berkas = { id: h.id, nama: h.nama, webUrl: h.webUrl };
      setBaru(berkas);
      setLewati(false);
      toast.success("Kontrak bertanda tangan sudah tersimpan");
      onUnggah?.(berkas);
    } catch (err) {
      setGalat(pesanError(err));
    } finally {
      setPersen(null);
    }
  };

  const pilih = (files: FileList | File[] | null) => {
    const f = files ? Array.from(files)[0] : undefined;
    if (f) void unggah(f);
  };

  if (q.loading && !q.data) {
    return (
      <div className="space-y-2" role="status" aria-label="Memeriksa dokumen bertanda tangan">
        <Kerangka className="h-4 w-48" />
        <Kerangka className="h-20 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="label !mb-0">
          Kontrak bertanda tangan<span className="ml-0.5 text-danger">*</span>
        </span>
        {q.error ? (
          <button type="button" onClick={() => void q.muatUlang()} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-strong">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Periksa lagi
          </button>
        ) : null}
      </div>

      {q.error && !final ? <KotakError error={q.error} ulangi={() => void q.muatUlang()} /> : null}

      <AnimatePresence mode="popLayout" initial={false}>
        {final ? (
          <motion.div key="ada" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={pegas} className="flex items-center gap-3 rounded-2xl border border-line bg-success-soft p-3" role="status">
            <CircleCheck className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            <IkonBerkas nama={final.nama} kecil />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" title={final.nama}>
                {final.nama}
              </p>
              <p className="text-xs text-muted">{baru ? "Baru diunggah · akan disimpan sebagai Kontrak final" : "Sudah ada di folder · akan disimpan sebagai Kontrak final"}</p>
            </div>
            <a href={final.webUrl} target="_blank" rel="noreferrer" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" title="Buka di SharePoint">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Buka {final.nama} di SharePoint</span>
            </a>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSeret(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSeret(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setSeret(false);
          pilih(e.dataTransfer.files);
        }}
        className={cx("rounded-2xl border-2 border-dashed transition-colors focus-within:border-brand", seret ? "border-brand bg-brand-soft" : "border-line", persen != null && "pointer-events-none opacity-70")}
      >
        <label htmlFor={idInput} className={cx("flex cursor-pointer items-center gap-3", final ? "px-3.5 py-2.5" : "px-4 py-4")}>
          <span className={cx("grid shrink-0 place-items-center rounded-xl bg-brand-soft text-brand", final ? "h-8 w-8" : "h-10 w-10")} aria-hidden="true">
            <CloudUpload className={final ? "h-4 w-4" : "h-5 w-5"} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">
              {persen != null ? `Mengunggah… ${persen}%` : seret ? "Lepaskan PDF di sini" : final ? "Ganti dengan berkas yang lebih baru" : "Unggah PDF kontrak bertanda tangan"}
            </span>
            {!final && <span className="block text-xs text-muted">Seret ke sini atau klik untuk memilih. Hanya PDF, maksimal {teksUkuran(100 * 1024 * 1024)}.</span>}
          </span>
          <input
            id={idInput}
            type="file" aria-label="Pilih berkas untuk diunggah"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={persen != null}
            onChange={(e) => {
              pilih(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {persen != null && (
          <div className="mx-4 mb-3 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={persen} aria-valuemin={0} aria-valuemax={100} aria-label="Kemajuan unggah">
            <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${persen}%` }} transition={{ duration: 0.2 }} />
          </div>
        )}
      </div>

      {galat && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{galat}</p>}

      {!final && !admin && (
        <p className="flex items-start gap-2 rounded-2xl bg-danger-soft px-3.5 py-3 text-xs text-danger">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Kontrak belum bisa diaktifkan tanpa salinan bertanda tangan. Bila berkasnya masih di pihak mitra, tunda aktivasi dulu, atau minta Admin mengaktifkan dengan alasan tertulis.
          </span>
        </p>
      )}

      {!final && admin && (
        <div className="rounded-2xl border border-line bg-raised px-3.5 py-3">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--wh-danger)]" checked={lewati} onChange={(e) => setLewati(e.target.checked)} />
            <span>
              <span className="font-semibold">Aktifkan tanpa salinan bertanda tangan</span>
              <span className="block text-xs text-muted">Khusus Admin. Alasan tercatat di riwayat dan kolom Kontrak final dibiarkan kosong.</span>
            </span>
          </label>
          <AnimatePresence initial={false}>
            {lewati && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <Isian label="Alasan melewati" wajib className="mt-3" bantuan={alasan.trim().length < MIN_ALASAN_LEWATI ? `Minimal ${MIN_ALASAN_LEWATI} karakter (${alasan.trim().length}/${MIN_ALASAN_LEWATI}).` : "Alasan cukup jelas. Terima kasih."}>
                  <textarea className="input min-h-[80px]" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. berkas asli masih di mitra, dikirim menyusul paling lambat 10 Oktober" />
                </Isian>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
