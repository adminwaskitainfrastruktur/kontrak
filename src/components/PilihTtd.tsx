// Pemilih tanda tangan: pakai yang tersimpan, coret di layar, atau unggah gambar/foto. Meniru aplikasi stok.
// "Simpan sebagai TTD tersimpan" sengaja TIDAK dicentang secara bawaan: gambar tanda tangan tersimpan di
// library SharePoint kontrak, jadi menyimpannya harus pilihan sadar pemiliknya.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { rapikanGambarTtd, urlDariPng } from "../lib/gambarTtd";
import { formatMasukRingkas } from "../lib/format";
import type { SumberTtd } from "../lib/penandatangan";
import type { TtdTersimpan } from "../services/tandaTangan";
import PadTandaTangan, { type PadTandaTanganRef } from "./PadTandaTangan";
import { Segmen, Tombol } from "./ui";

type Mode = "tersimpan" | "coret" | "unggah";

export interface PilihanTtd {
  png: Uint8Array | null;
  simpan: boolean;
  sumber: Exclude<SumberTtd, "dicatat">;
}

export interface PilihTtdRef {
  ambil: () => Promise<PilihanTtd>;
}

interface Props {
  tersimpan?: TtdTersimpan | null;
  disabled?: boolean;
  bolehSimpan?: boolean;
  onHapusTersimpan?: () => void | Promise<void>;
  /** Dipanggil saat ada atau tidaknya tanda tangan yang siap dipakai berubah (untuk mengaktifkan tombol). */
  onSiap?: (siap: boolean) => void;
}

const PilihTtd = forwardRef<PilihTtdRef, Props>(function PilihTtd({ tersimpan, disabled, bolehSimpan = true, onHapusTersimpan, onSiap }, ref) {
  const [mode, setMode] = useState<Mode>(tersimpan ? "tersimpan" : "coret");
  const [unggahan, setUnggahan] = useState<Uint8Array | null>(null);
  const [galat, setGalat] = useState("");
  const [simpan, setSimpan] = useState(false);
  const [coretAda, setCoretAda] = useState(false);
  const pad = useRef<PadTandaTanganRef>(null);
  const inputBerkas = useRef<HTMLInputElement>(null);
  const urlTersimpan = useMemo(() => (tersimpan ? urlDariPng(tersimpan.bytes) : ""), [tersimpan]);
  const urlUnggahan = useMemo(() => (unggahan ? urlDariPng(unggahan) : ""), [unggahan]);
  useEffect(() => () => { if (urlTersimpan) URL.revokeObjectURL(urlTersimpan); }, [urlTersimpan]);
  useEffect(() => () => { if (urlUnggahan) URL.revokeObjectURL(urlUnggahan); }, [urlUnggahan]);
  useEffect(() => {
    if (tersimpan) setMode("tersimpan");
    else setMode((m) => (m === "tersimpan" ? "coret" : m));
  }, [tersimpan]);

  const siap = mode === "tersimpan" ? !!tersimpan : mode === "unggah" ? !!unggahan : coretAda;
  useEffect(() => onSiap?.(siap), [siap, onSiap]);

  const pilihBerkas = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setGalat("");
    try {
      const png = await rapikanGambarTtd(f);
      if (!png) throw new Error("Tidak ada coretan yang terbaca di gambar itu. Pakai foto tanda tangan di kertas putih.");
      setUnggahan(png);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Gambar tidak bisa dibaca.");
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      ambil: async () => {
        if (mode === "tersimpan") return { png: tersimpan?.bytes ?? null, simpan: false, sumber: "tersimpan" };
        if (mode === "unggah") return { png: unggahan, simpan, sumber: "unggah" };
        return { png: pad.current?.kosong() ? null : ((await pad.current?.png()) ?? null), simpan, sumber: "coret" };
      },
    }),
    [mode, tersimpan, unggahan, simpan],
  );

  const pilihan: { nilai: Mode; label: string }[] = [
    ...(tersimpan ? [{ nilai: "tersimpan" as const, label: "TTD tersimpan" }] : []),
    { nilai: "coret", label: "Coret di layar" },
    { nilai: "unggah", label: "Unggah foto" },
  ];

  return (
    <div className="space-y-3">
      <Segmen nilai={mode} pilihan={pilihan} onUbah={setMode} id="cara-ttd" label="Cara membubuhkan tanda tangan" />

      {mode === "tersimpan" && tersimpan && (
        <div className="rounded-xl border border-line bg-white p-3">
          <img src={urlTersimpan} alt="Tanda tangan tersimpan Anda" className="mx-auto max-h-36 w-auto max-w-full object-contain" />
          <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>Tersimpan {formatMasukRingkas(tersimpan.waktu)}</span>
            {onHapusTersimpan && (
              <button type="button" onClick={() => void onHapusTersimpan()} disabled={disabled} className="inline-flex items-center gap-1 font-semibold text-danger hover:underline disabled:opacity-60">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Hapus TTD tersimpan
              </button>
            )}
          </p>
        </div>
      )}

      {mode === "coret" && <PadTandaTangan ref={pad} disabled={disabled} onUbah={setCoretAda} />}

      {mode === "unggah" && (
        <div className="rounded-xl border border-dashed border-line bg-white p-4 text-center">
          {unggahan ? <img src={urlUnggahan} alt="Tanda tangan yang diunggah" className="mx-auto max-h-36 w-auto max-w-full object-contain" /> : <p className="text-sm text-slate-500">Belum ada gambar.</p>}
          <Tombol type="button" varian="kedua" className="mt-3" ikon={<ImagePlus className="h-4 w-4" />} onClick={() => inputBerkas.current?.click()} disabled={disabled}>
            {unggahan ? "Ganti gambar" : "Pilih gambar tanda tangan"}
          </Tombol>
          <input ref={inputBerkas} type="file" accept="image/png,image/jpeg" onChange={(e) => void pilihBerkas(e)} disabled={disabled} hidden />
          <p className="mt-2 text-xs text-slate-500">Latar putih dibuang otomatis, jadi foto tanda tangan di kertas putih pun bisa.</p>
        </div>
      )}

      {galat && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {galat}
        </p>
      )}

      {bolehSimpan && mode !== "tersimpan" && (
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--wh-brand)]" checked={simpan} onChange={(e) => setSimpan(e.target.checked)} disabled={disabled} />
          <span>
            <span className="font-semibold">Simpan sebagai TTD tersimpan</span>
            <span className="block text-xs text-muted">Dipakai lagi di dokumen berikutnya. Gambar disimpan di library SharePoint kontrak; hapus kapan saja dari sini.</span>
          </span>
        </label>
      )}
    </div>
  );
});

export default PilihTtd;
