import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useMatch } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "sonner";
import { Activity, Archive, ArrowLeftRight, BarChart3, Bell, Building2, ChevronLeft, ChevronRight, FileText, History, Landmark, LayoutDashboard, LogOut, Mail, Menu, MessageSquarePlus, Moon, Search, Settings2, ShieldCheck, Signature, Sun, UserRound, Users, X } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { DASAR_PENGGUNA, RuangProvider, bolehRuangAdmin, bolehRuangPengguna, ruangDariAlamat, type Ruang } from "../context/RuangContext";
import { PantauProvider, usePantau, type ModePantau } from "../context/PantauContext";
import { useTema } from "../hooks/useTema";
import { useTtdSaya } from "../hooks/useTtdSaya";
import { labelDivisi } from "../lib/akses";
import { adalahLegal, bisaAjukan } from "../lib/alur";
import { bolehLihatJejak } from "../lib/jejakAudit";
import { AWALAN_DRAF, bersihkanDrafKedaluwarsa, hapusDrafPengguna } from "../lib/draf";
import { EASE_KELUAR, pegas, pegasLembut } from "../lib/gerak";
import { cuplikanArsip } from "../services/kontrak";
import { useLapisan } from "../lib/lapisan";
import type { Sesi } from "../lib/types";
import { DaftarKabar } from "./Antrean";
import LoncengUntukAnda, { LencanaAngka } from "./LoncengUntukAnda";
import PaletPerintah from "./PaletPerintah";
import { Avatar, Konfirmasi, MotionLapisan, cx, useKunciGulir } from "./ui";

/**
 * Transisi halaman: hanya opacity dan geser. Sengaja tanpa filter/blur: filter yang tersisa di akhir animasi
 * menjadikan wadah halaman acuan bagi elemen `fixed` di dalamnya (bilah simpan, tindakan massal, pratinjau),
 * sehingga tidak lagi menempel ke layar.
 */
const halamanMasuk = {
  awal: { opacity: 0, y: 14 },
  tampil: { opacity: 1, y: 0, transition: { duration: 0.38, ease: EASE_KELUAR } },
};

/** Ada draf pengajuan milik akun ini di perangkat? Keluar akun akan menghapusnya, jadi pengguna diberi tahu dulu. */
function adaDrafDiPerangkat(email: string): boolean {
  try {
    const akhiran = `:${email.trim().toLowerCase()}`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${AWALAN_DRAF}:`) && k.endsWith(akhiran)) return true;
    }
  } catch {
    /* penyimpanan diblokir: anggap tidak ada draf */
  }
  return false;
}

interface ItemMenu {
  /** Angka kecil di sebelah menu (mis. tanda tangan yang menunggu). */
  lencana?: number;
  ke: string;
  label: string;
  ikon: typeof FileText;
  aktif: (path: string) => boolean;
}

/** Kelompok menu sidebar. Kelompok tanpa judul tampil paling atas tanpa pemisah. */
interface GrupMenu {
  judul?: string;
  item: ItemMenu[];
}

// Lebar sidebar dalam rem, bukan px: di monitor besar ukuran huruf dasar ikut naik (lihat styles.css),
// jadi sidebar harus ikut membesar agar teks menunya tidak sesak.
const LEBAR_PENUH_REM = 16.5;
const LEBAR_RAIL_REM = 5.25;

const NAMA_RUANG: Record<Ruang, string> = { admin: "Ruang Admin", pengguna: "Ruang Pengguna" };

function useRem() {
  const baca = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const [rem, setRem] = useState(baca);
  useEffect(() => {
    const ubah = () => setRem(baca());
    window.addEventListener("resize", ubah);
    return () => window.removeEventListener("resize", ubah);
  }, []);
  return rem;
}

function useLayarLebar() {
  const [lebar, setLebar] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const ubah = () => setLebar(m.matches);
    m.addEventListener("change", ubah);
    return () => m.removeEventListener("change", ubah);
  }, []);
  return lebar;
}

function menuRuang(ruang: Ruang, sesi: Sesi, jumlahTtd = 0): GrupMenu[] {
  if (ruang === "pengguna") {
    return [
      {
        item: [
          { ke: DASAR_PENGGUNA, label: "Monitoring", ikon: Activity, aktif: (p) => p === DASAR_PENGGUNA || p.startsWith(`${DASAR_PENGGUNA}/kontrak/`) },
          { ke: `${DASAR_PENGGUNA}/ajukan`, label: "Ajukan Kontrak", ikon: MessageSquarePlus, aktif: (p) => p.startsWith(`${DASAR_PENGGUNA}/ajukan`) },
          { ke: `${DASAR_PENGGUNA}/tanda-tangan`, label: "Tanda Tangan", ikon: Signature, aktif: (p) => p.startsWith(`${DASAR_PENGGUNA}/tanda-tangan`), lencana: jumlahTtd },
        ],
      },
    ];
  }
  const legal = adalahLegal(sesi);
  const admin = sesi.peran === "Admin";
  // Menu dikelompokkan supaya tidak sesak: kerja harian di atas, lalu data rujukan, lalu urusan sistem.
  const grup: { judul?: string; item: (ItemMenu & { tampil: boolean })[] }[] = [
    {
      item: [
        { ke: "/", label: "Dashboard", ikon: LayoutDashboard, aktif: (p) => p === "/", tampil: true },
        { ke: "/kontrak", label: "Daftar Kontrak", ikon: FileText, aktif: (p) => p === "/kontrak" || /^\/kontrak\/\d+/.test(p), tampil: true },
        { ke: "/kontrak/baru", label: "Ajukan Kontrak", ikon: MessageSquarePlus, aktif: (p) => p.startsWith("/kontrak/baru"), tampil: bisaAjukan(sesi) },
        { ke: "/tanda-tangan", label: "Tanda Tangan", ikon: Signature, aktif: (p) => p.startsWith("/tanda-tangan"), tampil: true, lencana: jumlahTtd },
      ],
    },
    {
      judul: "Data",
      item: [
        { ke: "/laporan", label: "Laporan", ikon: BarChart3, aktif: (p) => p === "/laporan", tampil: true },
        { ke: "/jaminan", label: "Jaminan", ikon: Landmark, aktif: (p) => p === "/jaminan", tampil: true },
        { ke: "/mitra", label: "Mitra", ikon: Building2, aktif: (p) => p === "/mitra", tampil: legal },
        { ke: "/arsip", label: "Arsip", ikon: Archive, aktif: (p) => p === "/arsip", tampil: true },
        { ke: "/jejak-audit", label: "Jejak Audit", ikon: History, aktif: (p) => p === "/jejak-audit", tampil: bolehLihatJejak(sesi) },
      ],
    },
    {
      judul: "Sistem",
      item: [
        { ke: "/notifikasi", label: "Notifikasi", ikon: Mail, aktif: (p) => p === "/notifikasi", tampil: legal },
        { ke: "/pengaturan", label: "Pengaturan", ikon: Settings2, aktif: (p) => p === "/pengaturan", tampil: admin },
        { ke: "/pengguna", label: "Pengguna", ikon: Users, aktif: (p) => p === "/pengguna", tampil: admin },
      ],
    },
  ];
  return grup.map((g) => ({ judul: g.judul, item: g.item.filter((m) => m.tampil) })).filter((g) => g.item.length > 0);
}

/**
 * Penanda menu/ruang yang aktif. Di layar lebar ia berpindah mulus antarmenu lewat layoutId. Di laci menu ponsel
 * (statis) ia sengaja berupa span biasa: layoutId di dalam subpohon yang sedang keluar (AnimatePresence) membuat
 * animasi keluar laci tersangkut, dan laci transparan yang tertinggal menelan semua ketukan.
 */
function Penanda({ id, statis, className }: { id: string; statis?: boolean; className: string }) {
  return statis ? <span className={className} /> : <motion.span layoutId={id} transition={pegas} className={className} />;
}

/** Tombol pindah ruang, hanya untuk yang punya akses ke dua ruang (Admin dan Legal). */
function TukarRuang({ ruang, ringkas, idIndikator, statis }: { ruang: Ruang; ringkas: boolean; idIndikator: string; statis?: boolean }) {
  if (ringkas) {
    const tujuan = ruang === "admin" ? "pengguna" : "admin";
    return (
      <Link to={tujuan === "admin" ? "/" : DASAR_PENGGUNA} title={`Pindah ke ${NAMA_RUANG[tujuan]}`} aria-label={`Pindah ke ${NAMA_RUANG[tujuan]}`} className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-white/[0.08] text-white/80 transition-colors hover:bg-white/[0.14] hover:text-white">
        <ArrowLeftRight className="h-4 w-4" />
      </Link>
    );
  }
  const pilihan: { r: Ruang; label: string; ke: string; ikon: typeof FileText }[] = [
    { r: "admin", label: "Admin", ke: "/", ikon: ShieldCheck },
    { r: "pengguna", label: "Pengguna", ke: DASAR_PENGGUNA, ikon: UserRound },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.07] p-1" role="tablist" aria-label="Pilih ruang">
      {pilihan.map(({ r, label, ke, ikon: Ikon }) => {
        const aktif = r === ruang;
        return (
          <Link key={r} to={ke} role="tab" aria-selected={aktif} className={cx("relative flex min-h-10 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors [@media(pointer:coarse)]:min-h-11", aktif ? "text-navy" : "text-white/70 hover:text-white")}>
            {aktif && <Penanda id={`${idIndikator}-ruang`} statis={statis} className="absolute inset-0 rounded-xl bg-white shadow-card" />}
            <Ikon className="relative h-3.5 w-3.5" aria-hidden="true" />
            <span className="relative">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function Sidebar({ idIndikator, menu, sesi, ruang, rail, onRail, tanpaRail }: { idIndikator: string; menu: GrupMenu[]; sesi: Sesi; ruang: Ruang; rail: boolean; onRail?: () => void; tanpaRail?: boolean }) {
  const ringkas = rail && !tanpaRail;
  const { pathname } = useLocation();
  const refNav = useRef<HTMLElement>(null);
  // Di layar pendek menu bisa digulir; pastikan menu yang aktif tetap terlihat setelah berpindah halaman.
  useEffect(() => {
    refNav.current?.querySelector<HTMLElement>("[aria-current='page']")?.scrollIntoView({ block: "nearest" });
  }, [pathname]);
  const duaRuang = bolehRuangAdmin(sesi) && bolehRuangPengguna(sesi);
  return (
    <div className="hero-bg relative flex h-full flex-col overflow-hidden rounded-[28px] text-sidebar-ink shadow-pop">
      <div className="titik-halus pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
      <div className={cx("relative flex shrink-0 items-center gap-3 px-5 pb-4 pt-6", ringkas && "justify-center px-0")}>
        <motion.span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm" whileHover={{ rotate: -8, scale: 1.08 }} transition={pegas}>
          <img src="/wicon-mark.png" alt="" className="h-8 w-8" width={32} height={32} />
        </motion.span>
        <AnimatePresence initial={false}>
          {!ringkas && (
            <motion.div key="nama" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }} className="min-w-0 leading-tight">
              <p className="judul whitespace-nowrap text-2xl text-white">WiCon</p>
              <motion.p key={ruang} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 0.75, y: 0 }} transition={{ duration: 0.25 }} className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em]">
                {NAMA_RUANG[ruang]}
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {duaRuang && (
        <div className={cx("relative shrink-0 px-3 pb-2", ringkas && "px-0")}>
          <TukarRuang ruang={ruang} ringkas={ringkas} idIndikator={idIndikator} statis={tanpaRail} />
        </div>
      )}

      {/* min-h-0 + overflow-y-auto: di layar setinggi 768 px menu yang panjang digulir, profil tetap di bawah. */}
      <motion.nav ref={refNav} layoutScroll aria-label="Menu utama" className="scroll-halus relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
        {menu.map((g, gi) => (
          <div key={g.judul ?? "utama"} role="group" aria-label={g.judul} className={cx("space-y-1", gi > 0 && "mt-3")}>
            {g.judul &&
              (ringkas ? (
                <div className="mx-auto mb-2 h-px w-8 bg-white/[0.14]" aria-hidden="true" />
              ) : (
                <p className="px-4 pb-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/45" aria-hidden="true">
                  {g.judul}
                </p>
              ))}
            {g.item.map(({ ke, label, ikon: Ikon, aktif, lencana }) => {
              const isActive = aktif(pathname);
              return (
                <Link
                  key={ke}
                  to={ke}
                  title={ringkas ? label : undefined}
                  aria-label={ringkas ? (lencana ? `${label}, ${lencana} menunggu` : label) : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={cx("group relative flex min-h-11 items-center gap-3 rounded-2xl py-2.5 text-sm font-semibold transition-colors", ringkas ? "justify-center px-0" : "px-4", isActive ? "text-white" : "hover:text-white")}
                >
                  {isActive && <Penanda id={idIndikator} statis={tanpaRail} className="absolute inset-0 rounded-2xl bg-white/[0.13] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]" />}
                  {isActive && <Penanda id={`${idIndikator}-bar`} statis={tanpaRail} className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent" />}
                  {!isActive && <span className="absolute inset-0 rounded-2xl bg-white/0 transition-colors group-hover:bg-white/[0.06]" />}
                  <motion.span className="relative" whileHover={{ scale: 1.12, rotate: -4 }} transition={pegas}>
                    <Ikon className="h-5 w-5" aria-hidden="true" />
                    {ringkas && !!lencana && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-navy" aria-hidden="true" />}
                  </motion.span>
                  {!ringkas && <span className="relative truncate whitespace-nowrap">{label}</span>}
                  {!ringkas && !!lencana && (
                    <span className="relative ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold leading-none text-white" aria-label={`${lencana} menunggu`}>
                      {lencana > 99 ? "99+" : lencana}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </motion.nav>

      <div className="relative shrink-0 border-t border-white/10 p-3">
        <div className={cx("flex items-center gap-3 rounded-2xl bg-white/[0.06] p-2.5", ringkas && "justify-center bg-transparent p-0")}>
          <Avatar nama={sesi.nama} ukuran={ringkas ? 40 : 38} />
          {!ringkas && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-white">{sesi.nama}</p>
              <p className="truncate text-xs opacity-70">
                {sesi.peran} · {labelDivisi(sesi)}
              </p>
            </div>
          )}
        </div>
        {onRail && !tanpaRail && (
          <button onClick={onRail} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white [@media(pointer:coarse)]:min-h-11" aria-label={rail ? "Lebarkan menu" : "Ciutkan menu"}>
            {rail ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!rail && "Ciutkan"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Remah lokasi. Halaman kontrak memakai nomor pengajuan (mis. KTR-2026-0012), bukan ID item SharePoint. */
function Remah({ ruang }: { ruang: Ruang }) {
  const lokasi = useLocation();
  const { semua } = usePantau();
  const nomorPengajuan = useCallback(
    (id: string | undefined) => {
      const k = id ? (semua?.find((x) => String(x.id) === id) ?? cuplikanArsip().find((x) => String(x.id) === id)) : undefined;
      return k?.nomorPengajuan || `#${id ?? ""}`;
    },
    [semua],
  );
  const detail = useMatch("/kontrak/:id");
  const ubah = useMatch("/kontrak/:id/ubah");
  const detailSaya = useMatch(`${DASAR_PENGGUNA}/kontrak/:id`);
  const ubahSaya = useMatch(`${DASAR_PENGGUNA}/kontrak/:id/ubah`);
  const tandaTanganAdmin = useMatch("/tanda-tangan/:kontrakId");
  const tandaTanganSaya = useMatch(`${DASAR_PENGGUNA}/tanda-tangan/:kontrakId`);
  const bagian = useMemo<{ label: string; ke?: string }[]>(() => {
    const p = lokasi.pathname;
    if (ruang === "pengguna") {
      const pantau = { label: "Monitoring", ke: DASAR_PENGGUNA };
      if (p === DASAR_PENGGUNA) return [{ label: "Ruang Pengguna" }, { label: "Monitoring" }];
      if (p === `${DASAR_PENGGUNA}/ajukan/formulir`) return [pantau, { label: "Ajukan", ke: `${DASAR_PENGGUNA}/ajukan` }, { label: "Formulir" }];
      if (ubahSaya) return [pantau, { label: nomorPengajuan(ubahSaya.params.id), ke: `${DASAR_PENGGUNA}/kontrak/${ubahSaya.params.id}` }, { label: "Ubah" }];
      if (detailSaya) return [pantau, { label: nomorPengajuan(detailSaya.params.id) }];
      if (p === `${DASAR_PENGGUNA}/tanda-tangan`) return [{ label: "Ruang Pengguna" }, { label: "Tanda Tangan" }];
      if (tandaTanganSaya) return [{ label: "Tanda Tangan", ke: `${DASAR_PENGGUNA}/tanda-tangan` }, { label: nomorPengajuan(tandaTanganSaya.params.kontrakId) }];
      return [{ label: "Ruang Pengguna" }];
    }
    if (p === "/") return [{ label: "Dashboard" }];
    if (p === "/kontrak") return [{ label: "Kontrak" }, { label: "Daftar" }];
    if (p === "/kontrak/baru/formulir") return [{ label: "Kontrak", ke: "/kontrak" }, { label: "Ajukan", ke: "/kontrak/baru" }, { label: "Formulir" }];
    if (ubah) return [{ label: "Kontrak", ke: "/kontrak" }, { label: nomorPengajuan(ubah.params.id), ke: `/kontrak/${ubah.params.id}` }, { label: "Ubah" }];
    if (detail) return [{ label: "Kontrak", ke: "/kontrak" }, { label: nomorPengajuan(detail.params.id) }];
    if (p === "/laporan") {
      return new URLSearchParams(lokasi.search).get("tab") === "portofolio" ? [{ label: "Data" }, { label: "Laporan", ke: "/laporan" }, { label: "Portofolio" }] : [{ label: "Data" }, { label: "Laporan" }];
    }
    if (p === "/tanda-tangan") return [{ label: "Tanda Tangan" }];
    if (tandaTanganAdmin) return [{ label: "Tanda Tangan", ke: "/tanda-tangan" }, { label: nomorPengajuan(tandaTanganAdmin.params.kontrakId) }];
    if (p === "/jaminan") return [{ label: "Data" }, { label: "Jaminan" }];
    if (p === "/mitra") return [{ label: "Data" }, { label: "Mitra" }];
    if (p === "/arsip") return [{ label: "Data" }, { label: "Arsip" }];
    if (p === "/jejak-audit") return [{ label: "Data" }, { label: "Jejak Audit" }];
    if (p === "/notifikasi") return [{ label: "Sistem" }, { label: "Notifikasi" }];
    if (p === "/pengaturan") return [{ label: "Sistem" }, { label: "Pengaturan" }];
    if (p === "/pengguna") return [{ label: "Sistem" }, { label: "Pengguna" }];
    return [{ label: "WiCon" }];
  }, [lokasi.pathname, lokasi.search, ruang, detail, ubah, detailSaya, ubahSaya, nomorPengajuan]);
  return (
    <nav aria-label="Lokasi" className="flex min-w-0 items-center gap-1.5 text-sm">
      {bagian.map((b, i) => (
        // Di ponsel hanya bagian terakhir yang tampil, supaya tidak terpotong menjadi "Ruang P… > Mo…".
        <span key={i} className={cx("min-w-0 items-center gap-1.5", i < bagian.length - 1 ? "hidden sm:flex" : "flex")}>
          {i > 0 && <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted sm:block" aria-hidden="true" />}
          {b.ke ? (
            <Link to={b.ke} className="truncate text-muted transition-colors hover:text-ink">
              {b.label}
            </Link>
          ) : (
            <span className={cx("truncate", i === bagian.length - 1 ? "font-bold" : "text-muted")} aria-current={i === bagian.length - 1 ? "page" : undefined}>
              {b.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Lonceng Ruang Pengguna: kabar antrean dan status pengajuan sendiri. */
function LoncengPengguna() {
  const { kabar, belumDibaca, tandaiDibaca } = usePantau();
  const [buka, setBuka] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Kabar ditandai sudah dibaca saat panel ditutup, supaya yang baru tetap tebal selama panel terbuka.
  const tutup = useCallback(() => {
    setBuka(false);
    tandaiDibaca();
  }, [tandaiDibaca]);
  // Escape menutup panel ini saja bila ada lapisan lain (lib/lapisan).
  useLapisan(buka, tutup);

  useEffect(() => {
    if (!buka) return;
    const klikLuar = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) tutup();
    };
    window.addEventListener("pointerdown", klikLuar);
    return () => window.removeEventListener("pointerdown", klikLuar);
  }, [buka, tutup]);

  return (
    <div ref={ref} className="max-sm:static sm:relative">
      <motion.button whileTap={{ scale: 0.92 }} transition={pegas} onClick={() => (buka ? tutup() : setBuka(true))} className={cx("relative grid h-11 w-11 place-items-center rounded-xl transition-colors hover:bg-raised hover:text-ink", buka ? "bg-raised text-ink" : "text-muted")} aria-label={belumDibaca ? `${belumDibaca} kabar baru tentang pengajuan Anda` : "Kabar pengajuan"} aria-expanded={buka}>
        <motion.span animate={belumDibaca ? { rotate: [0, -14, 12, -8, 6, 0] } : { rotate: 0 }} transition={{ duration: 0.8, repeat: belumDibaca ? Infinity : 0, repeatDelay: 4 }}>
          <Bell className="h-5 w-5" aria-hidden="true" />
        </motion.span>
        <LencanaAngka n={belumDibaca} />
      </motion.button>
      <span className="sr-only" role="status" aria-atomic="true">
        {belumDibaca ? `${belumDibaca} kabar baru tentang pengajuan Anda` : ""}
      </span>
      <AnimatePresence>
        {buka && (
          // Ponsel: selebar bilah atas (wadahnya statis); sm ke atas: menggantung di bawah lonceng.
          <motion.div role="region" aria-label="Kabar pengajuan" initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.12 } }} transition={pegasLembut} style={{ transformOrigin: "top right" }} className="absolute inset-x-0 top-full z-40 mt-2 maks-h-panel flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop sm:left-auto sm:right-0 sm:w-[24rem]">
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="font-bold">Kabar pengajuan</p>
                <p className="text-xs text-muted">Antrean dan status, diperbarui tiap menit</p>
              </div>
              {belumDibaca > 0 && (
                <button type="button" onClick={tandaiDibaca} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-semibold text-brand transition-colors hover:text-brand-strong">
                  Tandai dibaca
                </button>
              )}
            </div>
            <DaftarKabar kabar={kabar.slice(0, 12)} onPilih={tutup} />
            <Link to={DASAR_PENGGUNA} onClick={tutup} className="flex min-h-11 items-center justify-center border-t border-line bg-raised px-5 py-2.5 text-center text-xs font-semibold text-brand transition-colors hover:text-brand-strong">
              Buka Monitoring
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Mode pemantauan menurut ruang yang dibuka: Ruang Pengguna memantau pengajuan sendiri (tiap menit),
 * Ruang Admin memantau kabar "Untuk Anda" bagi Legal dan Admin (tiap 2,5 menit). Pemantau hanya
 * memuat daftar sekali (untuk remah), tanpa pembaruan otomatis.
 */
function modePantau(ruang: Ruang, sesi: Sesi): ModePantau {
  if (ruang === "pengguna") return "pengguna";
  return adalahLegal(sesi) ? "admin" : null;
}

/** Judul tab: "(3) WiCon" bila ada kabar yang belum dibaca di ruang yang sedang dibuka. */
function useJudulTab(ruang: Ruang) {
  const { belumDibaca, belumDibacaUntukAnda } = usePantau();
  const { sesi } = useSesi();
  const n = ruang === "pengguna" ? belumDibaca : adalahLegal(sesi) ? belumDibacaUntukAnda : 0;
  useEffect(() => {
    document.title = n > 0 ? `(${n > 99 ? "99+" : n}) WiCon` : "WiCon";
  }, [n]);
  useEffect(
    () => () => {
      document.title = "WiCon";
    },
    [],
  );
}

export default function Layout() {
  const { sesi } = useSesi();
  const lokasi = useLocation();
  const ruang = ruangDariAlamat(lokasi.pathname);
  return (
    <RuangProvider ruang={ruang}>
      <PantauProvider mode={modePantau(ruang, sesi)}>
        <Kerangka ruang={ruang} />
      </PantauProvider>
    </RuangProvider>
  );
}

function Kerangka({ ruang }: { ruang: Ruang }) {
  const { sesi, keluar } = useSesi();
  const [gelap, gantiTema] = useTema();
  // Draf pengajuan di perangkat ini dihapus saat keluar, supaya tidak terbaca orang berikutnya.
  const keluarAkun = useCallback(() => {
    hapusDrafPengguna(sesi.email);
    keluar();
  }, [sesi.email, keluar]);
  const [tanyaKeluar, setTanyaKeluar] = useState(false);
  // Tanpa draf, keluar langsung; dengan draf, tanyakan dulu karena draf di perangkat ini ikut terhapus.
  const mintaKeluar = () => {
    setMenuAkun(false);
    if (adaDrafDiPerangkat(sesi.email)) setTanyaKeluar(true);
    else keluarAkun();
  };
  const lebar = useLayarLebar();
  const rem = useRem();
  const LEBAR_PENUH = LEBAR_PENUH_REM * rem;
  const LEBAR_RAIL = LEBAR_RAIL_REM * rem;
  // Pilihan pengguna diutamakan; bila belum pernah memilih, menu diciutkan di layar sedang
  // (tablet landscape dan laptop kecil) supaya isi halaman tetap lega.
  const [rail, setRail] = useState(() => {
    try {
      const simpan = localStorage.getItem("kontrak-rail");
      if (simpan != null) return simpan === "1";
    } catch {
      /* diabaikan */
    }
    return window.innerWidth < 1280;
  });
  const [drawer, setDrawer] = useState(false);
  const [palet, setPalet] = useState(false);
  const [menuAkun, setMenuAkun] = useState(false);
  const refAkun = useRef<HTMLDivElement>(null);
  const refDrawer = useRef<HTMLDivElement>(null);
  const lokasi = useLocation();
  const tutupDrawer = useCallback(() => setDrawer(false), []);
  const tutupMenuAkun = useCallback(() => setMenuAkun(false), []);
  // Laci menu di ponsel bersifat modal: fokus tertahan di dalamnya dan kembali ke tombol menu saat ditutup.
  useLapisan(drawer, tutupDrawer, { wadah: refDrawer, jebakFokus: true });
  useKunciGulir(drawer);
  useLapisan(menuAkun, tutupMenuAkun);
  useJudulTab(ruang);
  // Halaman chat mengisi seluruh layar di samping sidebar: tanpa bilah atas dan tanpa batas lebar.
  const chatAdmin = useMatch("/kontrak/baru");
  const chatPengguna = useMatch(`${DASAR_PENGGUNA}/ajukan`);
  const layarPenuh = chatAdmin !== null || chatPengguna !== null;

  useEffect(() => setDrawer(false), [lokasi.pathname]);
  // Draf lewat 7 hari dibuang sekali saat aplikasi dibuka.
  useEffect(() => {
    bersihkanDrafKedaluwarsa();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("kontrak-rail", rail ? "1" : "0");
    } catch {
      /* diabaikan */
    }
  }, [rail]);

  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalet((p) => !p);
      }
    };
    const klikLuar = (e: PointerEvent) => {
      if (refAkun.current && !refAkun.current.contains(e.target as Node)) setMenuAkun(false);
    };
    window.addEventListener("keydown", tekan);
    window.addEventListener("pointerdown", klikLuar);
    return () => {
      window.removeEventListener("keydown", tekan);
      window.removeEventListener("pointerdown", klikLuar);
    };
  }, []);

  const { jumlahMenunggu: jumlahTtd } = useTtdSaya(sesi.email);
  const menu = menuRuang(ruang, sesi, jumlahTtd);
  const geser = lebar ? (rail ? LEBAR_RAIL : LEBAR_PENUH) + 12 : 0;

  return (
    <div className="min-h-layar">
      <a href="#isi" className="sr-only rounded-lg bg-brand px-4 py-2 font-semibold text-brand-on focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]">
        Lewati ke konten
      </a>

      {lebar && (
        <motion.aside initial={false} animate={{ width: rail ? LEBAR_RAIL : LEBAR_PENUH }} transition={pegasLembut} className="fixed bottom-3 left-[max(0.75rem,env(safe-area-inset-left))] top-3 z-30">
          <Sidebar idIndikator="nav-desktop" menu={menu} sesi={sesi} ruang={ruang} rail={rail} onRail={() => setRail((r) => !r)} />
        </motion.aside>
      )}

      <AnimatePresence>
        {drawer && (
          <MotionLapisan ref={refDrawer} role="dialog" aria-modal="true" aria-label="Menu" tabIndex={-1} className="fixed inset-0 z-40 outline-none lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <div className="latar-modal absolute inset-0" onClick={tutupDrawer} aria-hidden="true" />
            <motion.aside className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] w-72 max-w-[calc(100vw-5rem)]" initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0, transition: { duration: 0.16 } }} transition={pegasLembut}>
              <Sidebar idIndikator="nav-drawer" menu={menu} sesi={sesi} ruang={ruang} rail={false} tanpaRail />
            </motion.aside>
            <button onClick={tutupDrawer} data-fokus-awal className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white" aria-label="Tutup menu">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </MotionLapisan>
        )}
      </AnimatePresence>

      <motion.div initial={false} animate={{ paddingLeft: geser }} transition={pegasLembut}>
        {!layarPenuh && (
          <header className="sticky top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 lg:px-8">
            {/* Ponsel 320 px: lima tombol 44 px + remah; jarak antartombol dirapatkan supaya remah tetap terbaca. */}
            <div className="kaca mx-auto flex max-w-7xl items-center gap-0.5 rounded-2xl border border-line px-1.5 py-1.5 shadow-card min-[400px]:gap-1.5 sm:gap-3 sm:px-4 sm:py-2 2xl:max-w-[94rem] 4xl:max-w-[120rem]">
              <button onClick={() => setDrawer(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-ink lg:hidden" aria-label="Buka menu" aria-expanded={drawer}>
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
              <Remah ruang={ruang} />
              <div className="flex-1" />

              <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} transition={pegas} onClick={() => setPalet(true)} className="hidden min-h-11 items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm text-muted shadow-sm transition-colors hover:border-brand lg:flex" aria-keyshortcuts="Control+K">
                <Search className="h-4 w-4" aria-hidden="true" />
                <span className="w-32 text-left lg:w-48">{ruang === "pengguna" ? "Cari pengajuan…" : "Cari kontrak atau PO…"}</span>
                <kbd className="rounded-md border border-line bg-raised px-1.5 py-0.5 text-[11px] font-semibold">Ctrl K</kbd>
              </motion.button>
              <motion.button whileTap={{ scale: 0.92 }} transition={pegas} onClick={() => setPalet(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-ink lg:hidden" aria-label="Cari">
                <Search className="h-5 w-5" aria-hidden="true" />
              </motion.button>

              {/* Lonceng: Ruang Pengguna = kabar pengajuan; Ruang Admin = "Untuk Anda" bagi Legal/Admin. Pemantau hanya melihat, tanpa lonceng. */}
              {ruang === "pengguna" ? <LoncengPengguna /> : adalahLegal(sesi) ? <LoncengUntukAnda /> : null}

              <motion.button whileTap={{ scale: 0.9 }} transition={pegas} onClick={gantiTema} className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl text-muted transition-colors hover:bg-raised hover:text-ink" aria-label={gelap ? "Ganti ke tema terang" : "Ganti ke tema gelap"}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={gelap ? "s" : "m"} initial={{ y: 14, opacity: 0, rotate: -40 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={{ y: -14, opacity: 0, rotate: 40 }} transition={{ duration: 0.2 }}>
                    {gelap ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </motion.span>
                </AnimatePresence>
              </motion.button>

              <div ref={refAkun} className="relative shrink-0">
                <motion.button whileTap={{ scale: 0.94 }} transition={pegas} onClick={() => setMenuAkun((m) => !m)} className="grid h-11 w-11 place-items-center rounded-full" aria-label="Menu akun" aria-expanded={menuAkun}>
                  <Avatar nama={sesi.nama} ukuran={40} />
                </motion.button>
                <AnimatePresence>
                  {menuAkun && (
                    <motion.div initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.12 } }} transition={pegasLembut} style={{ transformOrigin: "top right" }} className="absolute right-0 top-full z-40 mt-2 w-[min(16rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
                      <div className="flex items-center gap-3 border-b border-line p-4">
                        <Avatar nama={sesi.nama} ukuran={44} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{sesi.nama}</p>
                          <p className="truncate text-xs text-muted">{sesi.email}</p>
                          <p className="mt-0.5 text-xs font-semibold text-brand">
                            {sesi.peran} · {labelDivisi(sesi)}
                          </p>
                        </div>
                      </div>
                      {sesi.divisi == null && <p className="border-b border-line px-4 py-2.5 text-xs text-muted">Anda masuk dengan akun kantor. Anda melihat dan mengubah pengajuan Anda sendiri.</p>}
                      {bolehRuangAdmin(sesi) && bolehRuangPengguna(sesi) && (
                        <Link to={ruang === "admin" ? DASAR_PENGGUNA : "/"} onClick={() => setMenuAkun(false)} className="flex min-h-11 w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-raised">
                          <ArrowLeftRight className="h-4 w-4 text-muted" /> Pindah ke {NAMA_RUANG[ruang === "admin" ? "pengguna" : "admin"]}
                        </Link>
                      )}
                      <button onClick={mintaKeluar} className="flex min-h-11 w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-danger transition-colors hover:bg-danger-soft">
                        <LogOut className="h-4 w-4" /> Keluar
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </header>
        )}

        <main id="isi" className={layarPenuh ? "" : "mx-auto max-w-7xl px-3 pb-24 pt-6 sm:px-6 lg:px-8 lg:pt-8 2xl:max-w-[94rem] 4xl:max-w-[120rem]"}>
          <motion.div key={lokasi.pathname} variants={halamanMasuk} initial="awal" animate="tampil">
            <Outlet />
          </motion.div>
        </main>
      </motion.div>

      {tanyaKeluar && (
        <Konfirmasi
          judul="Keluar dari WiCon?"
          teks="Draf pengajuan yang belum dikirim di perangkat ini akan ikut dihapus. Pengajuan yang sudah dikirim tidak terpengaruh."
          labelYa="Keluar dan hapus draf"
          labelBatal="Tetap di sini"
          onYa={keluarAkun}
          onTutup={() => setTanyaKeluar(false)}
        />
      )}
      <PaletPerintah buka={palet} onTutup={() => setPalet(false)} />
      {/* Jarak toast mengikuti area aman layar berlekuk di ponsel. */}
      <Toaster
        theme={gelap ? "dark" : "light"}
        position="bottom-right"
        richColors
        closeButton
        mobileOffset={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))", left: "max(0.75rem, env(safe-area-inset-left))", right: "max(0.75rem, env(safe-area-inset-right))", top: "max(0.75rem, env(safe-area-inset-top))" }}
      />
    </div>
  );
}
