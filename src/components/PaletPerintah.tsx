// Palet perintah (Ctrl+K): lompat ke halaman, antrean kerja, kontrak, atau dokumen dengan mengetik.
//
// Aksesibilitas (U40): pola combobox. Fokus tetap di kotak isian (role=combobox), pilihan aktif
// ditunjuk lewat aria-activedescendant ke role=option di dalam role=listbox yang dikelompokkan
// (role=group). Escape menutup palet saja (tumpukan lapisan), Tab tertahan di dalam dialog, dan fokus
// kembali ke pemicu saat ditutup.
//
// Kontrak dicari dari judul, nomor, mitra, nomor referensi PR/PO/SPK, dan kode proyek (U12). Grup
// "Dokumen" (U17) mencari nama dan isi berkas lewat Microsoft Search setelah 3 huruf dan jeda 400 ms;
// bila Search ditolak, grup itu tidak tampil.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, AlarmClock, Archive, ArrowLeftRight, BarChart3, Building2, CalendarX2, CornerDownLeft, FileSearch, FileText, History, Inbox, Landmark, LayoutDashboard, Loader2, Mail, MessageSquarePlus, PieChart, Search, Settings2, Timer, UserX, Users, X } from "lucide-react";
import { URL_LIBRARY_BERKAS } from "../config";
import { useSesi } from "../context/SesiContext";
import { usePantau } from "../context/PantauContext";
import { usePengaturan } from "../context/PengaturanContext";
import { DASAR_PENGGUNA, bolehRuangAdmin, bolehRuangPengguna, useRuang } from "../context/RuangContext";
import { ambilSemuaKontrak } from "../services/kontrak";
import { adalahLegal, bisaAjukan, bisaLihat } from "../lib/alur";
import { JEDA_CARI_DOKUMEN_MS, MIN_HURUF_DOKUMEN, petakanDokumen, type HitDokumen, type PotonganSorotan } from "../lib/cariDokumen";
import { cariKontrakPalet, keteranganCocok } from "../lib/cariPalet";
import { PRESET_DAFTAR, hitungPreset, kueriPreset, type IdPresetDaftar } from "../lib/filterKerja";
import { formatMasukRingkas } from "../lib/format";
import { useLapisan } from "../lib/lapisan";
import { bolehLihatJejak } from "../lib/jejakAudit";
import { levelSlaPengaturan } from "../lib/pengaturan";
import { cariDokumen, pencarianDokumenTersedia } from "../lib/pencarianDokumen";
import type { Kontrak, Status } from "../lib/types";
import { pegas, pegasLembut } from "../lib/gerak";
import { LencanaStatus, MotionLapisan, cx, useKunciGulir } from "./ui";

/**
 * Area layar yang benar-benar terlihat (visualViewport). Saat papan ketik layar di ponsel muncul, tinggi ini
 * mengecil, jadi palet dan daftar hasilnya tidak tertutup papan ketik. Null bila peramban tidak mendukung.
 */
function useAreaTampak(aktif: boolean): { atas: number; tinggi: number } | null {
  const [area, setArea] = useState<{ atas: number; tinggi: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!aktif || !vv) {
      setArea(null);
      return;
    }
    const baca = () => setArea({ atas: Math.round(vv.offsetTop), tinggi: Math.round(vv.height) });
    baca();
    vv.addEventListener("resize", baca);
    vv.addEventListener("scroll", baca);
    return () => {
      vv.removeEventListener("resize", baca);
      vv.removeEventListener("scroll", baca);
    };
  }, [aktif]);
  return area;
}

type Grup = "Halaman" | "Antrean kerja" | "Kontrak" | "Dokumen";

interface Entri {
  id: string;
  grup: Grup;
  judul: string;
  sub?: string;
  ikon: ReactNode;
  ke: string;
  status?: Status;
  /** Kata tambahan yang ikut dicocokkan selain judul (mis. "pic" untuk "Belum ada PIC"). */
  kata?: string;
  /** Grup Dokumen: potongan ringkasan isi dengan bagian yang disorot. */
  sorotan?: PotonganSorotan[];
  /** Grup Dokumen: alamat berkas di SharePoint (Shift+Enter membukanya di tab baru). */
  webUrl?: string;
}

const IKON_PRESET: Record<IdPresetDaftar, ReactNode> = {
  "antrean-saya": <Inbox className="h-4 w-4" />,
  "tanpa-pic": <UserX className="h-4 w-4" />,
  "lewat-target": <Timer className="h-4 w-4" />,
  "akan-berakhir": <AlarmClock className="h-4 w-4" />,
  "lewat-masa": <CalendarX2 className="h-4 w-4" />,
  selesai: <Archive className="h-4 w-4" />,
};

/** Kata tambahan per preset yang ikut dicocokkan (mis. "arsip" menemukan preset Selesai). */
const KATA_PRESET: Partial<Record<IdPresetDaftar, string>> = { selesai: "arsip zip" };

type KeadaanDokumen = { status: "diam" } | { status: "memuat" } | { status: "siap"; teks: string; hits: HitDokumen[] } | { status: "mati" };

/**
 * Hasil mentah grup Dokumen untuk kata kunci `q`, setelah jeda dan minimal 3 huruf. Permintaan lama
 * dibatalkan setiap kali kata kunci berubah atau palet ditutup. Pemetaan ke kontrak dilakukan saat
 * render, jadi pembaruan daftar kontrak tidak memicu pencarian ulang.
 */
function useCariDokumen(buka: boolean, q: string): KeadaanDokumen {
  const [keadaan, setKeadaan] = useState<KeadaanDokumen>({ status: "diam" });
  const teks = q.trim();
  const cukup = teks.replace(/\s+/g, "").length >= MIN_HURUF_DOKUMEN;

  useEffect(() => {
    if (!buka || !cukup) {
      setKeadaan({ status: "diam" });
      return;
    }
    if (!pencarianDokumenTersedia()) {
      setKeadaan({ status: "mati" });
      return;
    }
    const batal = new AbortController();
    setKeadaan({ status: "memuat" });
    const t = window.setTimeout(() => {
      cariDokumen(teks, batal.signal).then(
        (hits) => {
          if (batal.signal.aborted) return;
          setKeadaan(hits == null ? { status: "mati" } : { status: "siap", teks, hits });
        },
        () => undefined, // dibatalkan
      );
    }, JEDA_CARI_DOKUMEN_MS);
    return () => {
      window.clearTimeout(t);
      batal.abort();
    };
  }, [buka, teks, cukup]);

  return keadaan;
}

function TeksSorotan({ potongan }: { potongan: PotonganSorotan[] }) {
  return (
    <>
      {potongan.map((p, i) =>
        p.sorot ? (
          <mark key={i} className="rounded bg-accent-soft px-0.5 font-semibold text-accent-ink">
            {p.teks}
          </mark>
        ) : (
          <span key={i}>{p.teks}</span>
        ),
      )}
    </>
  );
}

export default function PaletPerintah({ buka, onTutup }: { buka: boolean; onTutup: () => void }) {
  const { sesi } = useSesi();
  const { ruang, ke } = useRuang();
  const { pengaturan } = usePengaturan();
  const { semua: data } = usePantau();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [aktif, setAktif] = useState(0);
  const refDialog = useRef<HTMLDivElement>(null);
  const refDaftar = useRef<HTMLDivElement>(null);
  const idDasar = useId().replace(/:/g, "");
  const idDaftar = `${idDasar}-hasil`;
  const idOpsi = (i: number) => `${idDasar}-opsi-${i}`;
  const area = useAreaTampak(buka);
  useKunciGulir(buka);

  // Escape menutup palet saja; Tab tertahan di dalam; fokus kembali ke pemicu saat ditutup.
  useLapisan(buka, onTutup, { wadah: refDialog, jebakFokus: true });

  // Daftar kontrak dari cache bersama; saat dibuka, ambil yang baru bila cache sudah basi.
  useEffect(() => {
    if (!buka) return;
    setQ("");
    setAktif(0);
    void ambilSemuaKontrak().catch(() => undefined);
  }, [buka]);

  // Ruang Pengguna hanya mencari pengajuan milik sendiri; Ruang Admin mengikuti hak lihat.
  const boleh = useMemo(() => (ruang === "pengguna" ? (k: Kontrak) => k.pengajuEmail.toLowerCase() === sesi.email : (k: Kontrak) => bisaLihat(k, sesi)), [ruang, sesi]);
  const dokumen = useCariDokumen(buka, q);

  const hasil = useMemo<Entri[]>(() => {
    const halaman: Entri[] = [];
    if (ruang === "pengguna") {
      halaman.push({ id: "h-pantau", grup: "Halaman", judul: "Monitoring", sub: "Antrean dan status pengajuan Anda", ikon: <Activity className="h-4 w-4" />, ke: DASAR_PENGGUNA });
    } else {
      halaman.push({ id: "h-dash", grup: "Halaman", judul: "Dashboard", sub: "Ringkasan dan grafik", ikon: <LayoutDashboard className="h-4 w-4" />, ke: "/" });
      halaman.push({ id: "h-daftar", grup: "Halaman", judul: "Daftar Kontrak", sub: "Semua kontrak", ikon: <FileText className="h-4 w-4" />, ke: "/kontrak" });
    }
    if (bisaAjukan(sesi)) halaman.push({ id: "h-baru", grup: "Halaman", judul: "Ajukan Kontrak", sub: "Mulai pengajuan lewat chat", ikon: <MessageSquarePlus className="h-4 w-4" />, ke: ke.ajukan });
    if (ruang === "admin") {
      halaman.push({ id: "h-laporan", grup: "Halaman", judul: "Laporan", sub: "Kinerja layanan Legal", ikon: <BarChart3 className="h-4 w-4" />, ke: "/laporan" });
      halaman.push({ id: "h-portofolio", grup: "Halaman", judul: "Portofolio", sub: "Laporan nilai dan sebaran kontrak", ikon: <PieChart className="h-4 w-4" />, ke: "/laporan?tab=portofolio" });
      halaman.push({ id: "h-jaminan", grup: "Halaman", judul: "Register jaminan", sub: "Bank garansi dan jaminan pelaksanaan", ikon: <Landmark className="h-4 w-4" />, ke: "/jaminan", kata: "garansi" });
      if (adalahLegal(sesi)) {
        halaman.push({ id: "h-mitra", grup: "Halaman", judul: "Mitra", sub: "Data mitra dan riwayat kontraknya", ikon: <Building2 className="h-4 w-4" />, ke: "/mitra", kata: "vendor rekanan" });
        halaman.push({ id: "h-notif", grup: "Halaman", judul: "Notifikasi", sub: "Kotak keluar email dan pratinjau", ikon: <Mail className="h-4 w-4" />, ke: "/notifikasi", kata: "email" });
      }
      if (bolehLihatJejak(sesi)) {
        halaman.push({ id: "h-jejak", grup: "Halaman", judul: "Jejak Audit", sub: "Riwayat perubahan kontrak, pengaturan, dan pengguna", ikon: <History className="h-4 w-4" />, ke: "/jejak-audit", kata: "audit log riwayat" });
      }
      if (sesi.peran === "Admin") {
        halaman.push({ id: "h-atur", grup: "Halaman", judul: "Pengaturan", sub: "SLA, pengingat, dan alamat email", ikon: <Settings2 className="h-4 w-4" />, ke: "/pengaturan", kata: "sla" });
        halaman.push({ id: "h-user", grup: "Halaman", judul: "Pengguna", sub: "Kelola akses", ikon: <Users className="h-4 w-4" />, ke: "/pengguna" });
      }
    }
    if (bolehRuangAdmin(sesi) && bolehRuangPengguna(sesi)) {
      halaman.push(ruang === "admin" ? { id: "h-ruang", grup: "Halaman", judul: "Ruang Pengguna", sub: "Pindah ruang", ikon: <ArrowLeftRight className="h-4 w-4" />, ke: DASAR_PENGGUNA } : { id: "h-ruang", grup: "Halaman", judul: "Ruang Admin", sub: "Pindah ruang", ikon: <ArrowLeftRight className="h-4 w-4" />, ke: "/" });
    }

    const kata = q.trim().toLowerCase();
    const cocok = (e: Entri) => !kata || `${e.judul} ${e.kata ?? ""}`.toLowerCase().includes(kata);

    // Preset kerja Legal (termasuk "Selesai" untuk arsip): lompat langsung ke daftar yang sudah tersaring,
    // lengkap dengan jumlahnya.
    const antrean: Entri[] = [];
    if (ruang === "admin" && adalahLegal(sesi)) {
      const semua = data ?? [];
      const jumlah = data ? hitungPreset(semua, { sesi, semua, level: (k) => levelSlaPengaturan(k, pengaturan) }) : null;
      for (const p of PRESET_DAFTAR) {
        const n = jumlah?.[p.id];
        antrean.push({ id: `p-${p.id}`, grup: "Antrean kerja", judul: p.label, sub: n == null ? p.keterangan : `${n} kontrak · ${p.keterangan}`, ikon: IKON_PRESET[p.id], ke: `/kontrak${kueriPreset(p.id)}`, kata: `antrean preset filter ${KATA_PRESET[p.id] ?? ""}` });
      }
    }

    const kontrak = cariKontrakPalet((data ?? []).filter(boleh), kata, kata ? 8 : 5).map<Entri>(({ k, cocok: c }) => {
      const tambahan = keteranganCocok(c);
      return {
        id: `k-${k.id}`,
        grup: "Kontrak",
        judul: k.judul,
        sub: tambahan ? `${k.nomorPengajuan} · ${tambahan} · ${k.mitra || "-"}` : `${k.nomorPengajuan} · ${k.mitra || "-"} · masuk ${formatMasukRingkas(k.dibuat)} WIB`,
        ikon: <FileText className="h-4 w-4" />,
        ke: ke.detail(k.id),
        status: k.status,
      };
    });

    // Dokumen hanya untuk kata kunci yang sama dengan yang sedang tampil (hasil lama tidak dicampur).
    const berkas: Entri[] =
      kata && dokumen.status === "siap" && dokumen.teks.toLowerCase() === kata
        ? petakanDokumen(dokumen.hits, data ?? [], { urlLibrary: URL_LIBRARY_BERKAS, boleh, teks: dokumen.teks, tanpaLembar: ruang === "pengguna" || sesi.peran === "Pengaju" }).map((d) => ({
            id: `d-${d.id}`,
            grup: "Dokumen",
            judul: d.nama,
            sub: `${d.kontrak.nomorPengajuan} · ${d.kontrak.judul}`,
            ikon: <FileSearch className="h-4 w-4" />,
            ke: ke.detail(d.kontrak.id),
            sorotan: d.sorotan,
            webUrl: d.webUrl,
          }))
        : [];

    // Tanpa kata kunci, antrean kerja ditaruh di atas: itu yang paling sering dicari Legal.
    const cocokHalaman = halaman.filter(cocok);
    const cocokAntrean = antrean.filter(cocok);
    return kata ? [...cocokHalaman, ...cocokAntrean, ...kontrak, ...berkas] : [...cocokAntrean, ...cocokHalaman, ...kontrak];
  }, [q, data, sesi, ruang, ke, pengaturan, boleh, dokumen]);

  // Kelompokkan untuk role=group; indeks global tetap dipakai untuk navigasi panah.
  const grup = useMemo(() => {
    const daftar: { nama: Grup; entri: { e: Entri; i: number }[] }[] = [];
    hasil.forEach((e, i) => {
      const akhir = daftar[daftar.length - 1];
      if (akhir && akhir.nama === e.grup) akhir.entri.push({ e, i });
      else daftar.push({ nama: e.grup, entri: [{ e, i }] });
    });
    return daftar;
  }, [hasil]);

  useEffect(() => setAktif(0), [q]);
  // Hasil dokumen yang datang belakangan bisa memendekkan/memanjangkan daftar: jaga indeks tetap sah.
  useEffect(() => setAktif((i) => Math.min(i, Math.max(0, hasil.length - 1))), [hasil.length]);

  useEffect(() => {
    if (!buka) return;
    refDaftar.current?.querySelector<HTMLElement>(`[data-i="${aktif}"]`)?.scrollIntoView({ block: "nearest" });
  }, [aktif, buka]);

  const pilih = (e: Entri, tabBaru = false) => {
    if (tabBaru && e.webUrl) {
      window.open(e.webUrl, "_blank", "noopener,noreferrer");
      return;
    }
    onTutup();
    navigate(e.ke);
  };

  const tekanTombol = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAktif((i) => (hasil.length ? (i + 1) % hasil.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAktif((i) => (hasil.length ? (i - 1 + hasil.length) % hasil.length : 0));
    } else if (e.key === "Enter" && hasil[aktif]) {
      e.preventDefault();
      pilih(hasil[aktif]!, e.shiftKey);
    }
  };

  const terpilih = hasil[aktif];
  const kataAda = q.trim().length > 0;
  const mencariDokumen = kataAda && dokumen.status === "memuat";
  const adaDokumen = hasil.some((e) => e.grup === "Dokumen");

  return (
    <AnimatePresence>
      {buka && (
        <MotionLapisan
          className="fixed inset-x-0 z-[60] flex items-start justify-center px-3 pt-3 sm:px-4 sm:pt-[min(12vh,6rem)]"
          // Mengikuti area yang terlihat (di atas papan ketik layar); tanpa visualViewport memenuhi layar.
          style={area ? { top: area.atas, height: area.tinggi, ["--tinggi-tampak" as string]: `${area.tinggi}px` } : { top: 0, bottom: 0 }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.14 } }} transition={{ duration: 0.18 }}>
          <div className="latar-modal absolute inset-0" onPointerDown={onTutup} aria-hidden="true" />
          <motion.div
            ref={refDialog}
            role="dialog"
            aria-modal="true"
            aria-label="Pencarian cepat"
            tabIndex={-1}
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.12 } }}
            transition={pegasLembut}
            className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-surface shadow-pop outline-none"
          >
            <div className="flex items-center gap-2 border-b border-line pl-4 pr-2 sm:gap-3 sm:pl-5 sm:pr-4">
              <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
              <input
                data-fokus-awal
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={tekanTombol}
                placeholder={ruang === "pengguna" ? "Cari pengajuan, nomor, atau dokumen…" : "Cari kontrak, nomor PO, proyek, atau dokumen…"}
                role="combobox"
                aria-label="Cari halaman, kontrak, atau dokumen"
                aria-expanded={hasil.length > 0}
                aria-controls={idDaftar}
                aria-autocomplete="list"
                aria-activedescendant={terpilih ? idOpsi(aktif) : undefined}
                autoComplete="off"
                spellCheck={false}
                className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
              />
              {mencariDokumen && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden="true" />}
              <kbd className="hidden rounded-md border border-line bg-raised px-1.5 py-0.5 text-[11px] font-semibold text-muted sm:inline">Esc</kbd>
              <button type="button" onClick={onTutup} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-ink sm:hidden" aria-label="Tutup pencarian">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Jumlah hasil dibacakan pembaca layar; daftar sendiri tidak memindahkan fokus. */}
            <p className="sr-only" role="status" aria-live="polite">
              {kataAda ? (hasil.length ? `${hasil.length} hasil` : "Tidak ada hasil") : ""}
              {mencariDokumen ? ". Mencari di dokumen…" : ""}
            </p>

            <div ref={refDaftar} id={idDaftar} role="listbox" aria-label="Hasil pencarian" className="scroll-halus maks-h-palet overflow-y-auto overscroll-contain p-2">
              {grup.map((g) => {
                const idJudul = `${idDasar}-grup-${g.nama.replace(/\s+/g, "-").toLowerCase()}`;
                return (
                  <div key={g.nama} role="group" aria-labelledby={idJudul}>
                    <p id={idJudul} aria-hidden="true" className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      {g.nama}
                    </p>
                    {g.entri.map(({ e, i }) => (
                      <div
                        key={e.id}
                        id={idOpsi(i)}
                        role="option"
                        aria-selected={i === aktif}
                        data-i={i}
                        onMouseMove={() => i !== aktif && setAktif(i)}
                        // Fokus tetap di kotak isian.
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={(ev) => pilih(e, ev.shiftKey || ev.ctrlKey || ev.metaKey)}
                        className="relative flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                      >
                        {i === aktif && <motion.span layoutId="palet-aktif" transition={pegas} className="absolute inset-0 rounded-xl bg-brand-soft" aria-hidden="true" />}
                        <span className={cx("relative grid h-9 w-9 shrink-0 place-items-center rounded-lg", i === aktif ? "bg-brand text-brand-on" : "bg-raised text-muted")} aria-hidden="true">
                          {e.ikon}
                        </span>
                        <span className="relative min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{e.judul}</span>
                          {e.sub && <span className="block truncate text-xs text-muted">{e.sub}</span>}
                          {e.sorotan && e.sorotan.length > 0 && (
                            <span className="mt-0.5 line-clamp-2 text-xs text-muted">
                              <TeksSorotan potongan={e.sorotan} />
                            </span>
                          )}
                        </span>
                        {e.status && (
                          <span className="relative hidden sm:block">
                            <LencanaStatus status={e.status} />
                          </span>
                        )}
                        {i === aktif && <CornerDownLeft className="relative hidden h-4 w-4 shrink-0 text-brand sm:block" aria-hidden="true" />}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            {hasil.length === 0 && (
              <p className="teks-panjang px-4 pb-8 pt-2 text-center text-sm text-muted">
                {mencariDokumen ? "Mencari di dokumen…" : `Tidak ada hasil untuk “${q}”. Coba nomor pengajuan, nomor PO/SPK, kode proyek, atau nama mitra.`}
              </p>
            )}
            {adaDokumen && <p className="border-t border-line px-5 py-2 text-[11px] leading-relaxed text-muted">Isi dokumen dicari lewat indeks Microsoft 365: berkas baru bisa perlu beberapa menit untuk muncul, dan PDF hasil pindai hanya ditemukan dari namanya.</p>}

            <div className="hidden items-center gap-4 border-t border-line bg-raised px-5 py-2.5 text-xs text-muted sm:flex">
              <span>
                <kbd className="font-semibold">↑↓</kbd> pilih
              </span>
              <span>
                <kbd className="font-semibold">Enter</kbd> buka
              </span>
              {terpilih?.webUrl && (
                <span>
                  <kbd className="font-semibold">Shift Enter</kbd> buka berkas
                </span>
              )}
              <span className="ml-auto">
                <kbd className="font-semibold">Ctrl K</kbd> kapan saja
              </span>
            </div>
          </motion.div>
        </MotionLapisan>
      )}
    </AnimatePresence>
  );
}
