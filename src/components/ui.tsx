import { cloneElement, forwardRef, isValidElement, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as PE, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent, type HTMLMotionProps } from "framer-motion";
import { AlertCircle, AlertTriangle, CircleHelp, Inbox, Loader2, WifiOff, X } from "lucide-react";
import type { Status } from "../lib/types";
import { GraphError, pesanError } from "../lib/graph";
import { EASE_KELUAR, angkat, item, kontainer, pegas, pegasLembut, pegasMantul, tekan } from "../lib/gerak";
import { ARTI_STATUS, NAMA_PELAKU, langkahBerikut, teksGlosarium } from "../lib/glosariumStatus";
import { useLapisan } from "../lib/lapisan";
import { useSaatSesiPulih } from "../lib/pemancarSesi";
import { masukUlang } from "../auth/masukUlang";

export function cx(...kelas: (string | false | null | undefined)[]) {
  return kelas.filter(Boolean).join(" ");
}

// --- Lapisan penuh layar ---------------------------------------------------

/**
 * motion.div untuk lapisan yang menutup layar (laci menu, modal, pratinjau, palet). Begitu lapisan mulai keluar
 * (exit), ia berhenti menangkap sentuhan. Tanpa ini, bila animasi keluar tersangkut (mis. indikator layoutId di
 * dalamnya), elemen transparan satu layar penuh tertinggal dan menelan setiap ketukan: layar terasa "freeze"
 * dan baru normal setelah halaman dimuat ulang.
 */
export const MotionLapisan = forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(function MotionLapisan({ style, ...sisa }, ref) {
  const hadir = useIsPresent();
  return <motion.div ref={ref} {...sisa} style={hadir ? style : { ...style, pointerEvents: "none" }} />;
});

// --- Tombol ---------------------------------------------------------------

type Varian = "utama" | "kedua" | "bahaya" | "hantu";

const VARIAN: Record<Varian, string> = {
  utama: "kilat bg-gradient-to-b from-brand to-brand-strong text-brand-on shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_8px_18px_-8px_var(--wh-brand)]",
  kedua: "border border-line bg-surface text-ink shadow-sm hover:border-brand hover:bg-raised",
  // Tulisan memakai token on-danger (putih di mode terang, gelap pekat di mode gelap) supaya kontrasnya cukup di kedua tema.
  bahaya: "kilat bg-gradient-to-b from-danger to-danger-strong text-danger-on shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_8px_18px_-8px_var(--wh-danger)]",
  hantu: "text-muted hover:bg-raised hover:text-ink",
};

export function Tombol({
  varian = "utama",
  kecil,
  memuat,
  ikon,
  className,
  children,
  disabled,
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & { varian?: Varian; kecil?: boolean; memuat?: boolean; ikon?: ReactNode; children?: ReactNode }) {
  const mati = disabled || memuat;
  return (
    <motion.button
      whileHover={mati ? undefined : angkat}
      whileTap={mati ? undefined : tekan}
      transition={pegas}
      {...props}
      disabled={mati}
      className={cx(
        "inline-flex touch-manipulation items-center justify-center gap-2 rounded-xl font-semibold transition-[background,border-color,box-shadow,color] duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        kecil ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
        // Layar sentuh: tinggi minimal 44 px supaya mudah ditekan; tetikus tetap ringkas.
        "[@media(pointer:coarse)]:min-h-11",
        VARIAN[varian],
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {memuat ? (
          <motion.span key="muat" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} className="inline-flex">
            <Loader2 className="h-4 w-4 animate-spin" />
          </motion.span>
        ) : (
          ikon && (
            <motion.span key="ikon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-flex">
              {ikon}
            </motion.span>
          )
        )}
      </AnimatePresence>
      {children}
    </motion.button>
  );
}

// --- Avatar -----------------------------------------------------------------

const GRADASI = ["from-teal-500 to-emerald-600", "from-sky-500 to-indigo-600", "from-amber-400 to-orange-600", "from-rose-400 to-pink-600", "from-violet-500 to-purple-700", "from-cyan-500 to-blue-600"];

function hash(t: string) {
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function Avatar({ nama, ukuran = 32, className }: { nama: string; ukuran?: number; className?: string }) {
  const inisial = nama
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((k) => k[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" style={{ width: ukuran, height: ukuran, fontSize: ukuran * 0.38 }} className={cx("grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm ring-2 ring-surface", GRADASI[hash(nama) % GRADASI.length], className)}>
      {inisial || "?"}
    </span>
  );
}

// --- Lencana status ---------------------------------------------------------

const WARNA_STATUS: Record<Status, { pil: string; titik: string }> = {
  Diajukan: { pil: "bg-raised text-ink", titik: "bg-muted" },
  "Review Legal": { pil: "bg-info-soft text-info", titik: "bg-info" },
  "Perlu Revisi": { pil: "bg-accent-soft text-accent-ink", titik: "bg-accent" },
  "Proses Tanda Tangan": { pil: "bg-brand-soft text-brand-strong", titik: "bg-brand" },
  Aktif: { pil: "bg-success-soft text-success", titik: "bg-success" },
  // Status akhir memakai abu pekat (token --wh-abu*) yang lolos kontras di mode terang dan gelap.
  Berakhir: { pil: "bg-abu-soft text-abu-ink", titik: "bg-abu" },
  Ditolak: { pil: "bg-danger-soft text-danger", titik: "bg-danger" },
  Dibatalkan: { pil: "bg-abu-soft text-abu-ink line-through decoration-1", titik: "bg-abu-2" },
};

/**
 * Warna status untuk grafik (donat, batang). Berakhir dan Dibatalkan memakai abu pekat yang
 * berbeda rona supaya tetap terbedakan dan lolos kontras 3:1 terhadap kartu di kedua tema.
 */
export const WARNA_STATUS_GRAFIK: Record<Status, string> = {
  Diajukan: "var(--wh-ink-muted)",
  "Review Legal": "var(--wh-info)",
  "Perlu Revisi": "var(--wh-accent)",
  "Proses Tanda Tangan": "var(--wh-brand)",
  Aktif: "var(--wh-success)",
  Berakhir: "var(--wh-abu)",
  Ditolak: "var(--wh-danger)",
  Dibatalkan: "var(--wh-abu-2)",
};

const STATUS_HIDUP: Status[] = ["Review Legal", "Proses Tanda Tangan", "Perlu Revisi"];

/**
 * Pil status. `glosarium` menambahkan ikon "?" yang menjelaskan arti status dan langkah berikutnya
 * (dari ALUR). Jangan dipakai di dalam tautan/tombol: ikonnya sendiri sebuah tombol.
 */
export function LencanaStatus({ status, glosarium }: { status: Status; glosarium?: boolean }) {
  const w = WARNA_STATUS[status];
  const pil = (
    <motion.span key={status} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={pegasMantul} className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", w.pil)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", w.titik, STATUS_HIDUP.includes(status) && "denyut")} aria-hidden="true" />
      {status}
    </motion.span>
  );
  if (!glosarium) return pil;
  return (
    <span className="inline-flex items-center gap-1">
      {pil}
      <GlosariumStatus status={status} />
    </span>
  );
}

/** Lebar kartu glosarium (px) dan jarak minimal dari tepi layar. */
const LEBAR_GLOSARIUM = 288;
const TEPI_LAYAR = 12;

/**
 * Tombol "?" kecil dengan penjelasan status. Bisa dipakai sendiri di samping judul atau legenda.
 * Kartunya dirender di document.body dengan posisi tetap yang dijepit ke dalam layar, jadi tidak
 * terpotong wadah bergulir dan tidak membuat halaman bergeser ke samping di ponsel. Pembaca layar
 * mendapat teks yang sama lewat wilayah role=status (pola toggletip).
 */
export function GlosariumStatus({ status }: { status: Status }) {
  const [posisi, setPosisi] = useState<{ kiri: number; atas: number; lebar: number } | null>(null);
  const buka = posisi != null;
  const ref = useRef<HTMLSpanElement>(null);
  const refKartu = useRef<HTMLDivElement>(null);
  const id = useId();
  const tutup = useCallback(() => setPosisi(null), []);
  useLapisan(buka, tutup);

  const bukaKartu = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const lebar = Math.min(LEBAR_GLOSARIUM, window.innerWidth - TEPI_LAYAR * 2);
    const kiri = Math.min(Math.max(TEPI_LAYAR, r.left), window.innerWidth - TEPI_LAYAR - lebar);
    setPosisi({ kiri, atas: r.bottom + 6, lebar });
  };

  useEffect(() => {
    if (!buka) return;
    const klikLuar = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !refKartu.current?.contains(t)) tutup();
    };
    // Posisinya tetap terhadap layar: tutup saat halaman digulir atau ukurannya berubah.
    window.addEventListener("pointerdown", klikLuar);
    window.addEventListener("scroll", tutup, true);
    window.addEventListener("resize", tutup);
    return () => {
      window.removeEventListener("pointerdown", klikLuar);
      window.removeEventListener("scroll", tutup, true);
      window.removeEventListener("resize", tutup);
    };
  }, [buka, tutup]);

  const langkah = langkahBerikut(status);
  return (
    <span ref={ref} className="relative inline-flex">
      {/* Ikon 24 px, area sentuh diperluas menjadi 44 px lewat ::after. */}
      <button
        type="button"
        onClick={() => (buka ? tutup() : bukaKartu())}
        aria-expanded={buka}
        aria-controls={id}
        aria-label={`Arti status ${status}`}
        className="relative grid h-6 w-6 place-items-center rounded-full text-muted transition-colors after:absolute after:-inset-2.5 after:content-[''] hover:bg-raised hover:text-ink"
      >
        <CircleHelp className="h-4 w-4" aria-hidden="true" />
      </button>
      <span id={id} role="status" className="sr-only">
        {buka ? teksGlosarium(status) : ""}
      </span>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {posisi && (
              <motion.div
                ref={refKartu}
                aria-hidden="true"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={pegasLembut}
                style={{ left: posisi.kiri, top: posisi.atas, width: posisi.lebar }}
                className="fixed z-[70] rounded-2xl border border-line bg-surface p-4 text-left text-xs font-normal normal-case tracking-normal text-ink shadow-pop"
              >
                <p className="text-sm font-bold">{status}</p>
                <p className="mt-1 text-muted">{ARTI_STATUS[status]}</p>
                {langkah.length > 0 ? (
                  <>
                    <p className="mt-3 font-semibold">Langkah berikutnya</p>
                    <ul className="mt-1 space-y-1">
                      {langkah.map((l) => (
                        <li key={`${l.oleh}-${l.label}`} className="flex items-start gap-1.5">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                          <span>
                            <span className="font-semibold">{l.label}</span> oleh {NAMA_PELAKU[l.oleh]}
                            {l.ke !== status && <span className="text-muted"> → {l.ke}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-3 text-muted">Status akhir: tidak ada langkah lanjutan.</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </span>
  );
}

export function Lencana({ children, nada = "netral" }: { children: ReactNode; nada?: "netral" | "peringatan" | "bahaya" | "sukses" }) {
  const warna = {
    netral: "bg-raised text-muted",
    peringatan: "bg-accent-soft text-accent-ink",
    bahaya: "bg-danger-soft text-danger",
    sukses: "bg-success-soft text-success",
  }[nada];
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", warna)}>{children}</span>;
}

// --- Muncul berurutan --------------------------------------------------------

/** Wadah yang memunculkan `<Item>` di dalamnya satu per satu. */
export function Kontainer({ children, className, jeda = 0.05, tunda = 0, role, "aria-label": ariaLabel }: { children: ReactNode; className?: string; jeda?: number; tunda?: number; role?: string; "aria-label"?: string }) {
  return (
    <motion.div variants={kontainer(jeda, tunda)} initial="awal" animate="tampil" className={className} role={role} aria-label={ariaLabel}>
      {children}
    </motion.div>
  );
}

export function Item({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}

/** Pasang di elemen berkelas `sorot`: cahaya halus mengikuti pointer. */
export function useSorot() {
  return useCallback((e: PE<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, []);
}

// --- Keadaan halaman --------------------------------------------------------

export function Memuat({ teks = "Memuat data…" }: { teks?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 px-4 py-16 text-center text-sm text-muted">
      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand" aria-hidden="true" />
      {teks}
    </div>
  );
}

/**
 * Kotak galat halaman. Galat sesi (perluLogin) otomatis menawarkan "Masuk ulang" di semua halaman,
 * dan setelah sesi pulih (dari tombol ini, pita sesi, atau toast) data dimuat ulang lewat `ulangi`.
 * Galat jaringan dimuat ulang otomatis saat perangkat kembali daring.
 */
export function KotakError({ error, ulangi, onMasukUlang }: { error: unknown; ulangi?: () => void; onMasukUlang?: () => void }) {
  const perluLogin = error instanceof GraphError && error.perluLogin;
  const jaringan = error instanceof GraphError && error.jaringan;
  const tanpaIzin = error instanceof GraphError && error.status === 403;
  const [masuk, setMasuk] = useState(false);
  useSaatSesiPulih(perluLogin && ulangi ? ulangi : null);

  useEffect(() => {
    if (!jaringan || !ulangi) return;
    window.addEventListener("online", ulangi);
    return () => window.removeEventListener("online", ulangi);
  }, [jaringan, ulangi]);

  const masukLagi =
    onMasukUlang ??
    (() => {
      setMasuk(true);
      void masukUlang().finally(() => setMasuk(false));
    });

  return (
    <motion.div role="alert" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={pegasLembut} className="flex items-start gap-3 rounded-2xl border border-danger-soft bg-danger-soft p-4 text-sm text-danger">
      {jaringan ? <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{perluLogin ? "Sesi Microsoft berakhir" : jaringan ? "Koneksi terputus" : tanpaIzin ? "Akses belum diberikan" : "Terjadi kendala"}</p>
        <p className="teks-panjang mt-0.5 opacity-90">{pesanError(error)}</p>
        {perluLogin && <p className="mt-1 text-xs opacity-80">Isian di halaman ini tetap aman. Setelah masuk ulang, data dimuat ulang otomatis.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {perluLogin && (
            <Tombol kecil memuat={masuk} onClick={masukLagi}>
              Masuk ulang
            </Tombol>
          )}
          {ulangi && (
            <Tombol kecil varian="kedua" onClick={ulangi}>
              Coba lagi
            </Tombol>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function Kosong({ judul, teks, aksi, ikon }: { judul: string; teks?: string; aksi?: ReactNode; ikon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center sm:px-6 sm:py-14">
      <span className="ambang mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand" aria-hidden="true">
        {ikon ?? <Inbox className="h-6 w-6" />}
      </span>
      <p className="font-bold">{judul}</p>
      {teks && <p className="mt-1 max-w-sm text-sm text-muted">{teks}</p>}
      {aksi && <div className="mt-4 flex flex-wrap justify-center gap-2">{aksi}</div>}
    </div>
  );
}

export function KepalaHalaman({ judul, sub, aksi }: { judul: ReactNode; sub?: ReactNode; aksi?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_KELUAR }} className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 max-w-full">
        <h1 className="judul teks-panjang text-3xl sm:text-4xl">{judul}</h1>
        {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
      </div>
      {aksi && <div className="flex flex-wrap gap-2">{aksi}</div>}
    </motion.div>
  );
}

// --- Formulir ---------------------------------------------------------------

export function Isian({ label, wajib, bantuan, children, className }: { label: string; wajib?: boolean; bantuan?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="label">
        {label}
        {wajib && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {bantuan && <span className="mt-1 block text-xs text-muted">{bantuan}</span>}
    </label>
  );
}

/** Atribut aksesibilitas yang dipasang Field pada kontrol isiannya. */
export interface AriaIsian {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-required"?: true;
}

/**
 * Isian berlabel dengan bantuan dan galat per isian yang terbaca pembaca layar:
 * label terhubung lewat htmlFor, galat diberi role=alert, dan kontrolnya mendapat
 * aria-invalid serta aria-describedby (bantuan + galat).
 *
 * Kontrol bisa berupa satu elemen (atribut disisipkan otomatis):
 *   <Field label="Nomor PO" galat={galat.po}><input className="input" … /></Field>
 * atau fungsi bila kontrolnya komponen lain:
 *   <Field label="Mitra" wajib>{(aria) => <PilihMitra {...aria} />}</Field>
 */
export function Field({
  label,
  wajib,
  bantuan,
  galat,
  id,
  className,
  children,
}: {
  label: ReactNode;
  wajib?: boolean;
  bantuan?: ReactNode;
  /** Pesan galat; kosong/false berarti isian valid. */
  galat?: ReactNode;
  id?: string;
  className?: string;
  children: ReactElement | ((aria: AriaIsian) => ReactNode);
}) {
  const otomatis = useId();
  const anak = isValidElement<{ id?: string; "aria-describedby"?: string }>(children) ? children : null;
  const idIsian = id ?? anak?.props.id ?? `isian${otomatis.replace(/:/g, "")}`;
  const idBantuan = `${idIsian}-bantuan`;
  const idGalat = `${idIsian}-galat`;
  const adaGalat = galat != null && galat !== false && galat !== "";
  const jelaskan = [anak?.props["aria-describedby"], bantuan ? idBantuan : null, adaGalat ? idGalat : null].filter(Boolean).join(" ") || undefined;
  const aria: AriaIsian = {
    id: idIsian,
    ...(adaGalat ? { "aria-invalid": true as const } : {}),
    ...(jelaskan ? { "aria-describedby": jelaskan } : {}),
    ...(wajib ? { "aria-required": true as const } : {}),
  };
  const kontrol = typeof children === "function" ? children(aria) : anak ? cloneElement(anak, aria) : children;

  return (
    <div className={cx("block", className)}>
      <label htmlFor={idIsian} className="label">
        {label}
        {wajib && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {kontrol}
      {bantuan && (
        <p id={idBantuan} className="mt-1 text-xs text-muted">
          {bantuan}
        </p>
      )}
      {adaGalat && (
        <p id={idGalat} role="alert" className="mt-1 flex items-start gap-1 text-xs font-semibold text-danger">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{galat}</span>
        </p>
      )}
    </div>
  );
}

// --- Segmen (kontrol geser) ---------------------------------------------------

/**
 * Pilihan beberapa tab berbentuk pil. Di ponsel yang sempit dapat digeser mendatar di dalam wadahnya sendiri.
 * Papan ketik: panah kiri/kanan, Home, dan End berpindah pilihan (hanya tab terpilih yang masuk urutan Tab).
 */
export function Segmen<T extends string>({ nilai, pilihan, onUbah, id, label }: { nilai: T; pilihan: { nilai: T; label: string; ikon?: ReactNode }[]; onUbah: (n: T) => void; id: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const tekanTombol = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = pilihan.findIndex((p) => p.nilai === nilai);
    let ke = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") ke = (i + 1) % pilihan.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") ke = (i - 1 + pilihan.length) % pilihan.length;
    else if (e.key === "Home") ke = 0;
    else if (e.key === "End") ke = pilihan.length - 1;
    if (ke < 0) return;
    e.preventDefault();
    onUbah(pilihan[ke]!.nilai);
    ref.current?.querySelectorAll<HTMLElement>("[role='tab']")[ke]?.focus();
  };
  return (
    <div ref={ref} role="tablist" aria-label={label} onKeyDown={tekanTombol} className="scroll-halus relative inline-flex max-w-full overflow-x-auto rounded-xl border border-line bg-raised p-1">
      {pilihan.map((p) => {
        const aktif = p.nilai === nilai;
        return (
          <button key={p.nilai} role="tab" aria-selected={aktif} tabIndex={aktif ? 0 : -1} type="button" onClick={() => onUbah(p.nilai)} className={cx("relative z-10 inline-flex shrink-0 touch-manipulation items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors [@media(pointer:coarse)]:min-h-11", aktif ? "text-ink" : "text-muted hover:text-ink")}>
            {aktif && <motion.span layoutId={`segmen-${id}`} transition={pegas} className="absolute inset-0 -z-10 rounded-lg bg-surface shadow-card" />}
            {p.ikon}
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Modal ------------------------------------------------------------------

let jumlahKunci = 0;
let paddingAsli = "";

/**
 * Kunci gulir halaman selama `aktif` (modal, laci menu). Beberapa pemakai sekaligus aman: kunci baru dilepas
 * saat yang terakhir selesai. Lebar bilah gulir diganti padding supaya isi halaman tidak bergeser di desktop.
 */
export function useKunciGulir(aktif: boolean) {
  useEffect(() => {
    if (!aktif) return;
    const html = document.documentElement;
    if (jumlahKunci++ === 0) {
      const lebarGulir = window.innerWidth - html.clientWidth;
      paddingAsli = document.body.style.paddingRight;
      if (lebarGulir > 0) document.body.style.paddingRight = `calc(env(safe-area-inset-right, 0px) + ${lebarGulir}px)`;
      html.classList.add("kunci-gulir");
    }
    return () => {
      if (--jumlahKunci === 0) {
        html.classList.remove("kunci-gulir");
        document.body.style.paddingRight = paddingAsli;
      }
    };
  }, [aktif]);
}

/**
 * Dialog modal. Di ponsel tampil sebagai lembar dari bawah (judul tetap terlihat, isi bergulir di dalamnya,
 * gulir halaman di belakangnya dikunci); di layar lebar sebagai kartu di tengah. Dirender di document.body
 * supaya tidak terpengaruh transformasi/filter halaman. Fokus pindah ke dalam saat dibuka (ke elemen
 * [data-fokus-awal] atau autoFocus bila ada), Tab tertahan di dalam, Escape hanya menutup modal paling atas,
 * dan fokus kembali ke tombol pemicu. Untuk deretan tombol aksi yang selalu terlihat, pakai <AksiModal>.
 */
export function Modal({ judul, onTutup, children, lebar = "max-w-lg" }: { judul: string; onTutup: () => void; children: ReactNode; lebar?: string }) {
  const [buka, setBuka] = useState(true);
  const tutup = useCallback(() => setBuka(false), []);
  const ref = useRef<HTMLDivElement>(null);
  const idJudul = useId();
  useLapisan(buka, tutup, { wadah: ref, jebakFokus: true });
  useKunciGulir(true);

  const isi = (
    <AnimatePresence onExitComplete={onTutup}>
      {buka && (
        <MotionLapisan className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16 } }} transition={{ duration: 0.22 }}>
          {/* pointerdown (bukan mousedown): iOS Safari tidak mengirim kejadian tetikus untuk elemen yang bukan tombol. */}
          <div className="latar-modal absolute inset-0" onPointerDown={tutup} aria-hidden="true" />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={idJudul}
            tabIndex={-1}
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.14 } }}
            transition={pegasLembut}
            className={cx("maks-h-lembar relative w-full overflow-y-auto overscroll-contain rounded-t-[26px] bg-surface shadow-pop outline-none focus-visible:ring-0 sm:rounded-[26px]", lebar)}
          >
            <div className="sticky top-0 z-10 border-b border-line bg-surface">
              {/* Gagang lembar bawah: isyarat bahwa ini lembar yang bisa ditutup, hanya di ponsel. */}
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
              <div className="flex items-center justify-between gap-3 px-5 py-2 sm:px-6 sm:py-3">
                <h2 id={idJudul} className="teks-panjang min-w-0 text-lg font-bold">
                  {judul}
                </h2>
                <motion.button type="button" whileHover={{ rotate: 90 }} whileTap={tekan} transition={pegas} onClick={tutup} className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink" aria-label="Tutup">
                  <X className="h-5 w-5" aria-hidden="true" />
                </motion.button>
              </div>
            </div>
            <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">{children}</div>
          </motion.div>
        </MotionLapisan>
      )}
    </AnimatePresence>
  );
  return typeof document !== "undefined" ? createPortal(isi, document.body) : isi;
}

/**
 * Deretan tombol aksi di dasar <Modal>. Menempel di dasar lembar sehingga tombol utama selalu terlihat
 * walau isinya panjang; di ponsel tombol menumpuk selebar lembar dengan aksi utama paling atas (tulis
 * aksi utama paling akhir; urutan terbalik otomatis), di layar lebar rata kanan.
 *   <AksiModal><Tombol varian="kedua">Batal</Tombol><Tombol>Simpan</Tombol></AksiModal>
 */
export function AksiModal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("sticky bottom-0 z-10 -mx-5 -mb-5 mt-5 flex flex-col-reverse gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:-mb-6 sm:flex-row sm:flex-wrap sm:justify-end sm:px-6 sm:pb-4 [&>*]:w-full sm:[&>*]:w-auto", className)}>
      {children}
    </div>
  );
}

/**
 * Konfirmasi untuk tindakan yang tidak bisa dibatalkan. Fokus awal di tombol Batal supaya Enter yang
 * tak sengaja tidak menjalankannya. Selama `onYa` berjalan tombol menunggu; galat dari `onYa` ditampilkan
 * di dalam dialog dan dialog tetap terbuka supaya bisa dicoba lagi. Dialog menutup sendiri bila `onYa` berhasil.
 */
export function Konfirmasi({ judul, teks, labelYa, labelBatal = "Batal", bahaya = true, onYa, onTutup }: { judul: string; teks: ReactNode; labelYa: string; labelBatal?: string; bahaya?: boolean; onYa: () => void | Promise<void>; onTutup: () => void }) {
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<unknown>(null);
  const jalan = async () => {
    setMemuat(true);
    setGalat(null);
    try {
      await onYa();
      onTutup();
    } catch (err) {
      setGalat(err);
      setMemuat(false);
    }
  };
  return (
    <Modal judul={judul} onTutup={onTutup} lebar="max-w-md">
      <div className="text-sm text-muted">{teks}</div>
      {galat != null && (
        <p role="alert" className="teks-panjang mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {pesanError(galat)}
        </p>
      )}
      <AksiModal>
        <Tombol type="button" varian="kedua" data-fokus-awal onClick={onTutup} disabled={memuat}>
          {labelBatal}
        </Tombol>
        <Tombol type="button" varian={bahaya ? "bahaya" : "utama"} memuat={memuat} onClick={() => void jalan()}>
          {labelYa}
        </Tombol>
      </AksiModal>
    </Modal>
  );
}

// --- Kerangka pemuatan & angka ------------------------------------------------

export function Kerangka({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("kilau rounded-lg", className)} />;
}

export function KerangkaHalaman({ baris = 6 }: { baris?: number }) {
  return (
    <div role="status" aria-label="Memuat" className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-12">
        <Kerangka className="h-56 rounded-[22px] lg:col-span-8" />
        <Kerangka className="h-56 rounded-[22px] lg:col-span-4" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Kerangka key={i} className="h-32 rounded-[22px]" />
        ))}
      </div>
      <div className="kartu divide-y divide-line">
        {Array.from({ length: baris }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <Kerangka className="h-4 w-24" />
            <Kerangka className="h-4 flex-1" />
            <Kerangka className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Angka yang menghitung naik dengan kurva ease-out; langsung final bila gerak dikurangi. */
export function AngkaHidup({ nilai, className, format }: { nilai: number; className?: string; format?: (n: number) => string }) {
  const [tampil, setTampil] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTampil(nilai);
      return;
    }
    const mulai = performance.now();
    let raf = 0;
    const langkah = (t: number) => {
      const p = Math.min(1, (t - mulai) / 900);
      setTampil(Math.round(nilai * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(langkah);
    };
    raf = requestAnimationFrame(langkah);
    return () => cancelAnimationFrame(raf);
  }, [nilai]);
  return <span className={cx("angka", className)}>{format ? format(tampil) : tampil}</span>;
}
