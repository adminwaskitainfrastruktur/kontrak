// Kartu "Kelengkapan dokumen" di detail kontrak (U13): dokumen wajib menurut jenis kontrak dibandingkan
// dengan berkas yang sudah diunggah. Nadanya membantu, bukan menghukum: slot yang belum ada berwarna kuning,
// tidak merah, dan tidak ada yang diblokir.
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, CircleDashed, ClipboardCopy, FileCheck, Info, Upload } from "lucide-react";
import { toast } from "sonner";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { adalahLegal } from "../lib/alur";
import { EASE_KELUAR } from "../lib/gerak";
import { jenisPemenuh, kekuranganDokumen, ringkasKelengkapan, syaratDokumen, teksMohonLengkapi, type OverrideSyarat, type SlotDokumen } from "../lib/syarat";
import type { Dokumen, JenisDokumen, JenisKontrak, Kontrak } from "../lib/types";
import { Kerangka, Lencana, Tombol, cx } from "./ui";

/** Tanda kecil bahwa daftar ini disusun sebagai awal dan bisa diganti Legal. Dipakai panel lain juga. */
export function TandaStandarAwal({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info", className)} title="Daftar ini disusun dari praktik umum kontrak konstruksi dan pengadaan. Tim Legal dapat menyesuaikannya.">
      <Info className="h-3 w-3" aria-hidden="true" />
      Standar awal, dapat disesuaikan Legal
    </span>
  );
}

/** Bilah kemajuan tipis. Tanpa animasi lebar bila pengguna meminta gerak dikurangi. */
export function BilahKemajuan({ persen, nada = "brand", label }: { persen: number; nada?: "brand" | "accent" | "success"; label: string }) {
  const kurangiGerak = useReducedMotion();
  const warna = { brand: "bg-brand", accent: "bg-accent", success: "bg-success" }[nada];
  const nilai = Math.max(0, Math.min(100, Math.round(persen)));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={nilai} className="h-2 w-full overflow-hidden rounded-full bg-raised">
      <motion.div
        className={cx("h-full rounded-full", warna)}
        initial={kurangiGerak ? false : { width: 0 }}
        animate={{ width: `${nilai}%` }}
        transition={kurangiGerak ? { duration: 0 } : { duration: 0.7, ease: EASE_KELUAR }}
      />
    </div>
  );
}

async function salin(teks: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(teks);
    return true;
  } catch {
    // Cadangan untuk peramban yang menolak Clipboard API (mis. bukan konteks aman).
    const area = document.createElement("textarea");
    area.value = teks;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

interface PropsPanelSyarat {
  kontrak: Kontrak;
  /** Dari services/dokumen (ambilDokumen). null saat masih dimuat. */
  dokumen: Dokumen[] | null;
  bolehUnggah: boolean;
  /** Dipanggil saat pengguna menekan "Unggah" pada slot; jenis slot ikut dikirim untuk memilih jenis berkas. */
  onUnggah?: (jenis?: JenisDokumen) => void;
  /** Bila diisi, tombol "Mohon lengkapi" juga mengisi catatan Minta Revisi (selain menyalin ke clipboard). */
  onMohonLengkapi?: (teks: string) => void;
  override?: OverrideSyarat;
}

export default function PanelSyarat({ kontrak: k, dokumen, bolehUnggah, onUnggah, onMohonLengkapi, override }: PropsPanelSyarat) {
  const { sesi } = useSesi();
  const { ruang } = useRuang();
  const legal = adalahLegal(sesi) && ruang === "admin";
  const [disalin, setDisalin] = useState(false);

  const syarat = useMemo(() => syaratDokumen(k.jenis, override), [k.jenis, override]);
  const hasil = useMemo(() => kekuranganDokumen(k.jenis, (dokumen ?? []).map((d) => d.jenis), override), [k.jenis, dokumen, override]);
  const ringkas = ringkasKelengkapan(hasil);
  const judulId = `syarat-${k.id}`;

  const mohonLengkapi = async () => {
    const teks = teksMohonLengkapi(hasil.kurang, k.jenis, override);
    if (!teks) return;
    onMohonLengkapi?.(teks);
    const ok = await salin(teks);
    if (ok) {
      setDisalin(true);
      window.setTimeout(() => setDisalin(false), 2400);
      toast.success(onMohonLengkapi ? "Daftar dokumen sudah disalin dan dimasukkan ke catatan revisi." : "Daftar dokumen yang kurang sudah disalin. Tinggal tempel di catatan Minta Revisi.");
    } else if (!onMohonLengkapi) {
      toast.error("Clipboard tidak bisa diakses. Coba salin manual dari daftar di bawah, ya.");
    }
  };

  const namaBerkas = (slot: SlotDokumen) => (dokumen ?? []).filter((d) => d.jenis !== "" && jenisPemenuh(slot.jenis).includes(d.jenis)).map((d) => d.nama);

  return (
    <section className="kartu overflow-hidden" aria-labelledby={judulId}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id={judulId} className="flex items-center gap-2 font-bold">
            <FileCheck className="h-4 w-4 text-brand" aria-hidden="true" /> Kelengkapan dokumen
          </h2>
          <p className="mt-0.5 text-xs text-muted">Untuk {k.jenis.toLowerCase()}, berkas berikut membantu Legal mereview lebih cepat.</p>
        </div>
        <TandaStandarAwal />
      </div>

      <div className="px-5 pb-2 pt-4">
        {dokumen == null ? (
          <div className="space-y-3" role="status" aria-label="Memuat kelengkapan dokumen">
            <Kerangka className="h-4 w-32" />
            <Kerangka className="h-2 w-full rounded-full" />
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold">
                <span className="angka text-lg">{ringkas.teks}</span>
              </p>
              <p className="text-xs text-muted">{ringkas.lengkap ? "Lengkap, terima kasih!" : hasil.kurang.length === 1 ? "Tinggal satu lagi" : `${hasil.kurang.length} belum ada`}</p>
            </div>
            <BilahKemajuan persen={ringkas.persen} nada={ringkas.lengkap ? "success" : "accent"} label={`Kelengkapan dokumen wajib: ${ringkas.teks}`} />
          </>
        )}
      </div>

      {dokumen != null && (
        <ul className="divide-y divide-line" aria-label="Dokumen wajib">
          {syarat.wajib.map((slot) => {
            const ada = hasil.ada.includes(slot.jenis);
            const berkas = namaBerkas(slot);
            return (
              <li key={slot.jenis} className="flex items-start gap-3 px-5 py-3">
                {ada ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {slot.label}
                    {ada ? <span className="sr-only">(sudah ada)</span> : <Lencana nada="peringatan">belum ada</Lencana>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{ada && berkas.length ? <span className="break-words">{berkas.join(", ")}</span> : slot.petunjuk}</p>
                </div>
                {!ada && bolehUnggah && onUnggah && (
                  <Tombol kecil varian="kedua" ikon={<Upload className="h-3.5 w-3.5" />} onClick={() => onUnggah(slot.jenis)} aria-label={`Unggah ${slot.label}`}>
                    Unggah
                  </Tombol>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dokumen != null && syarat.bersyarat.length > 0 && (
        <details className="group border-t border-line">
          <summary className="cursor-pointer list-none px-5 py-3 text-xs font-semibold text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden="true">
              ›
            </span>
            Bila diperlukan ({syarat.bersyarat.length})
          </summary>
          <ul className="space-y-2 px-5 pb-4">
            {syarat.bersyarat.map((slot) => {
              const ada = namaBerkas(slot).length > 0;
              return (
                <li key={slot.jenis} className="flex items-start gap-2 text-xs">
                  {ada ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line" aria-hidden="true" />}
                  <span className="min-w-0">
                    <span className="font-semibold text-ink">{slot.label}</span>
                    <span className="text-muted">: {slot.petunjuk}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {legal && dokumen != null && hasil.kurang.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-raised px-5 py-3">
          <p className="text-xs text-muted">Perlu minta pengaju melengkapi? Daftar yang kurang bisa langsung dipakai sebagai catatan revisi.</p>
          <Tombol kecil varian="kedua" ikon={<ClipboardCopy className="h-3.5 w-3.5" />} onClick={() => void mohonLengkapi()}>
            {disalin ? "Tersalin" : "Mohon lengkapi"}
          </Tombol>
        </div>
      )}
    </section>
  );
}

/**
 * Penghitung ringkas untuk chat dan formulir pengajuan: "2 dari 4 wajib" beserta slot yang masih kurang.
 * `jenisAda` adalah jenis berkas yang sudah dipilih pengguna (belum tentu sudah terunggah).
 */
export function PenghitungSyarat({ jenisKontrak, jenisAda, override, className }: { jenisKontrak: JenisKontrak; jenisAda: readonly (JenisDokumen | "")[]; override?: OverrideSyarat; className?: string }) {
  const syarat = useMemo(() => syaratDokumen(jenisKontrak, override), [jenisKontrak, override]);
  const hasil = useMemo(() => kekuranganDokumen(jenisKontrak, jenisAda, override), [jenisKontrak, jenisAda, override]);
  const ringkas = ringkasKelengkapan(hasil);
  if (hasil.wajib.length === 0) return null;
  return (
    <div className={cx("rounded-2xl border border-line bg-surface p-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">
          Dokumen wajib: <span className="angka">{ringkas.teks}</span>
        </p>
        {ringkas.lengkap && <Lencana nada="sukses">Lengkap</Lencana>}
      </div>
      <BilahKemajuan persen={ringkas.persen} nada={ringkas.lengkap ? "success" : "accent"} label={`Dokumen wajib: ${ringkas.teks}`} />
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Slot dokumen wajib">
        {syarat.wajib.map((s) => {
          const ada = hasil.ada.includes(s.jenis);
          return (
            <li key={s.jenis} title={s.petunjuk} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", ada ? "bg-success-soft text-success" : "bg-accent-soft text-accent-ink")}>
              {ada ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <CircleDashed className="h-3 w-3" aria-hidden="true" />}
              {s.label}
              <span className="sr-only">{ada ? "(sudah)" : "(belum)"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
