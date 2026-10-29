// Tumpukan lapisan yang sedang terbuka: modal, palet Ctrl+K, panel lonceng, menu, glosarium.
//
// - Escape hanya menutup lapisan paling atas (modal di atas modal tidak ikut tertutup semua).
// - Lapisan bersifat modal (jebakFokus) menahan Tab/Shift+Tab di dalamnya; elemen bertanda
//   [data-lepas-jebakan] (pita sesi) tetap bisa dicapai supaya tombol Masuk ulang tidak terkunci.
// - Saat lapisan modal ditutup, fokus kembali ke elemen yang membukanya.
// Satu pendengar keydown di window untuk semua lapisan, dipasang saat lapisan pertama dibuka.
import { useEffect, useRef, type RefObject } from "react";

interface Lapisan {
  id: number;
  tutup: () => void;
  /** Wadah untuk perangkap fokus; null bila lapisan tidak menjebak fokus (popover). */
  wadah: RefObject<HTMLElement | null> | null;
}

const tumpukan: Lapisan[] = [];
let nomor = 0;
let terpasang = false;

export function lapisanTeratas(): Lapisan | undefined {
  return tumpukan[tumpukan.length - 1];
}

export function jumlahLapisan(): number {
  return tumpukan.length;
}

/** Daftarkan lapisan baru di puncak tumpukan. Kembalian: fungsi untuk melepasnya. */
export function daftarkanLapisan(l: Omit<Lapisan, "id">): () => void {
  const id = ++nomor;
  tumpukan.push({ ...l, id });
  pasangPendengar();
  return () => {
    const i = tumpukan.findIndex((x) => x.id === id);
    if (i >= 0) tumpukan.splice(i, 1);
  };
}

/** Tangani Escape untuk lapisan teratas. Dipisah supaya bisa diuji tanpa DOM. */
export function tekanEscape(): boolean {
  const atas = lapisanTeratas();
  if (!atas) return false;
  atas.tutup();
  return true;
}

const FOKUSABEL =
  'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

export function elemenFokusabel(wadah: HTMLElement): HTMLElement[] {
  return Array.from(wadah.querySelectorAll<HTMLElement>(FOKUSABEL)).filter((el) => el.getClientRects().length > 0 && !el.closest("[inert],[aria-hidden='true']"));
}

function jebakTab(e: KeyboardEvent, wadah: HTMLElement) {
  const luar = Array.from(document.querySelectorAll<HTMLElement>("[data-lepas-jebakan]")).flatMap(elemenFokusabel);
  const daftar = [...elemenFokusabel(wadah), ...luar.filter((el) => !wadah.contains(el))];
  e.preventDefault();
  if (daftar.length === 0) {
    wadah.focus();
    return;
  }
  const i = daftar.indexOf(document.activeElement as HTMLElement);
  const berikut = i === -1 ? (e.shiftKey ? daftar.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + daftar.length) % daftar.length;
  daftar[berikut]!.focus();
}

function tekanTombol(e: KeyboardEvent) {
  const atas = lapisanTeratas();
  // Komponen di dalam lapisan (mis. saran @mention) yang sudah menangani Escape memanggil preventDefault.
  if (!atas || e.defaultPrevented || e.isComposing) return;
  if (e.key === "Escape") {
    e.preventDefault();
    tekanEscape();
  } else if (e.key === "Tab" && atas.wadah?.current) {
    jebakTab(e, atas.wadah.current);
  }
}

function pasangPendengar() {
  if (terpasang || typeof window === "undefined") return;
  terpasang = true;
  window.addEventListener("keydown", tekanTombol);
}

/**
 * Daftarkan komponen sebagai lapisan selama `aktif`.
 * - `tutup` dipanggil saat Escape ditekan dan lapisan ini paling atas.
 * - `wadah` + `jebakFokus`: fokus dipindah ke dalam (elemen [data-fokus-awal], atau wadah itu sendiri
 *   bila belum ada yang terfokus di dalamnya), Tab ditahan di dalam, lalu fokus kembali ke pemicu
 *   saat ditutup. Wadah sebaiknya diberi tabIndex={-1}.
 */
export function useLapisan(aktif: boolean, tutup: () => void, opsi: { wadah?: RefObject<HTMLElement | null>; jebakFokus?: boolean } = {}) {
  const refTutup = useRef(tutup);
  useEffect(() => {
    refTutup.current = tutup;
  });
  const { wadah, jebakFokus = false } = opsi;

  // Pemicu dicatat saat render pertama lapisan aktif, SEBELUM isinya dipasang: autoFocus di dalam modal
  // sudah memindahkan fokus ketika efek berjalan, jadi document.activeElement di efek bukan lagi pemicunya.
  const pemicuAwal = useRef<HTMLElement | null>(null);
  const aktifTadi = useRef(false);
  if (aktif && !aktifTadi.current && typeof document !== "undefined") {
    pemicuAwal.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  }
  aktifTadi.current = aktif;

  // Pengembalian fokus ditunda satu giliran. StrictMode (mode dev) melepas lalu memasang ulang efek seketika;
  // pemasangan ulang itu membatalkan pengembalian yang tertunda, jadi fokus autoFocus di dalam modal tidak
  // sempat terlempar ke tombol pemicu.
  const tundaKembali = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!aktif) return;
    const pasangUlang = tundaKembali.current != null;
    if (tundaKembali.current != null) {
      clearTimeout(tundaKembali.current);
      tundaKembali.current = null;
    }
    const pemicu = jebakFokus ? pemicuAwal.current : null;
    const lepas = daftarkanLapisan({ tutup: () => refTutup.current(), wadah: jebakFokus ? (wadah ?? null) : null });
    const el = wadah?.current;
    if (!pasangUlang && jebakFokus && el && !el.contains(document.activeElement)) {
      (el.querySelector<HTMLElement>("[data-fokus-awal]") ?? el).focus({ preventScroll: true });
    }
    return () => {
      lepas();
      if (!pemicu) return;
      tundaKembali.current = setTimeout(() => {
        tundaKembali.current = null;
        if (!pemicu.isConnected) return;
        const kini = document.activeElement;
        // Kembalikan fokus hanya bila fokus masih di lapisan ini (atau hilang ke body), jangan merebut fokus yang sudah dipindah pengguna.
        if (!kini || kini === document.body || wadah?.current?.contains(kini)) pemicu.focus({ preventScroll: true });
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktif]);
}
