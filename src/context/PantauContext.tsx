// Data pemantauan bersama untuk kedua ruang, dipasang sekali di Layout supaya lonceng, judul tab,
// remah, dan halaman Monitoring memakai data yang sama.
//
// - Ruang Pengguna: kontrak milik pengguna, antrean Legal, dan kabar pengajuan (tiap menit).
// - Ruang Admin (Legal/Admin): kabar "Untuk Anda" (pengajuan baru, penugasan, status, komentar,
//   dokumen), tiap 2,5 menit. Pemantau hanya memakai daftar kontraknya, tanpa pembaruan otomatis.
// Daftar kontrak diambil dari cache bersama (hooks/useDaftarKontrak), jadi data yang dimuat halaman
// mana pun ikut menyegarkan lonceng, dan sebaliknya. Data juga diperbarui saat tab kembali dilihat,
// setelah aksi tulis di tab ini (langganan cache kontrak), setelah masuk ulang, dan saat koneksi pulih.
// Tanpa Notification API.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useSesi } from "./SesiContext";
import { useDaftarKontrak } from "../hooks/useDaftarKontrak";
import { ambilSemuaKontrak, segarkanKontrak } from "../services/kontrak";
import { adalahLegal, butuhTindakan } from "../lib/alur";
import { antreanLegal } from "../lib/antrean";
import { ambilAktivitasSejak } from "../lib/aktivitasTerbaru";
import { MAKS_KABAR, bacaSimpanan, bandingkan, buatJejak, tulisSimpanan, type Kabar } from "../lib/kabar";
import { aktivitasIdTerakhir, bacaSimpananAdmin, bandingkanAdmin, buatJejakAdmin, gabungKabar, kunciSimpananAdmin, tulisSimpananAdmin, type AktivitasRingkas } from "../lib/kabarAdmin";
import { useSenyap } from "../hooks/useSenyap";
import { dengarCacheKontrak, dengarCacheKontrakTertunda, tanpaKabar } from "../lib/langgananKontrak";
import { useSaatSesiPulih } from "../lib/pemancarSesi";
import { umpanBalik } from "../lib/umpanBalik";
import type { Kontrak } from "../lib/types";
import { DASAR_PENGGUNA } from "./RuangContext";

const SELANG_PENGGUNA_MS = 60_000;
/** Lonceng Ruang Admin: 2,5 menit (rentang 120-180 detik di peta jalan), cukup segar tanpa membebani SharePoint. */
const SELANG_ADMIN_MS = 150_000;
/** Kembali ke tab berkali-kali dalam waktu singkat tidak memicu muat ulang berulang. */
const JEDA_MIN_SEGAR_MS = 20_000;

/** "pengguna" / "admin": ruang yang sedang dipantau. null: hanya memuat daftar sekali (Pemantau). */
export type ModePantau = "pengguna" | "admin" | null;

interface NilaiPantau {
  semua: Kontrak[] | null;
  error: unknown;
  loading: boolean;
  /** Kontrak yang diajukan oleh pengguna ini, terbaru lebih dulu. */
  milik: Kontrak[];
  antrean: Kontrak[];
  kabar: Kabar[];
  belumDibaca: number;
  tandaiDibaca: () => void;
  segarkan: () => Promise<void>;
  terakhir: Date | null;
  /** Kabar "Untuk Anda" di Ruang Admin (Legal dan Admin). */
  untukAnda: Kabar[];
  belumDibacaUntukAnda: number;
  tandaiDibacaUntukAnda: () => void;
  /** Kontrak yang menunggu tindakan pengguna ini (aturan butuhTindakan). */
  menungguSaya: Kontrak[];
}

const PantauContext = createContext<NilaiPantau | null>(null);

export function usePantau(): NilaiPantau {
  const nilai = useContext(PantauContext);
  if (!nilai) throw new Error("usePantau dipakai di luar PantauProvider");
  return nilai;
}

export function PantauProvider({ mode, children }: { mode: ModePantau; children: ReactNode }) {
  const { sesi } = useSesi();
  const navigate = useNavigate();
  const q = useDaftarKontrak();
  const senyap = useSenyap(sesi.email);
  // Pembaruan efek di bawah membaca daftar senyap terkini lewat ref, supaya toast kontrak yang dibisukan tidak muncul.
  const idSenyap = useRef<ReadonlySet<number>>(new Set());
  idSenyap.current = senyap.ids();
  const [kabar, setKabar] = useState<Kabar[]>(() => bacaSimpanan(sesi.email)?.kabar ?? []);
  const [untukAnda, setUntukAnda] = useState<Kabar[]>(() => bacaSimpananAdmin(sesi.email)?.kabar ?? []);
  const [terakhir, setTerakhir] = useState<Date | null>(null);
  const legal = adalahLegal(sesi);
  const modeAdmin = mode === "admin" && legal;

  const milik = useMemo(() => (q.data ?? []).filter((k) => k.pengajuEmail.toLowerCase() === sesi.email), [q.data, sesi.email]);
  const antrean = useMemo(() => antreanLegal(q.data ?? []), [q.data]);
  const menungguSaya = useMemo(() => (q.data ?? []).filter((k) => butuhTindakan(k, sesi)), [q.data, sesi]);

  const waktuMuat = useRef(0);
  const segarkan = useCallback(async () => {
    waktuMuat.current = Date.now();
    // Tanpa kabar: penyegaran ini sendiri tidak boleh dianggap aksi tulis oleh langganan cache.
    await tanpaKabar(() => segarkanKontrak()).catch(() => undefined);
  }, []);

  // --- Ruang Pengguna: bandingkan dengan jejak terakhir, simpan, dan beri tahu ---------------------
  useEffect(() => {
    if (mode !== "pengguna" || !q.data) return;
    setTerakhir(new Date());
    const simpan = bacaSimpanan(sesi.email);
    // Jejak tetap diperbarui untuk semua kontrak; kabar kontrak yang dibisukan hanya disembunyikan saat tampil.
    const baru = bandingkan(simpan?.jejak ?? null, milik, antrean, new Date().toISOString()).filter((b) => !idSenyap.current.has(b.kontrakId));
    const daftar = [...baru, ...(simpan?.kabar ?? [])].slice(0, MAKS_KABAR);
    tulisSimpanan(sesi.email, { jejak: buatJejak(milik, antrean), kabar: daftar });
    setKabar(daftar);

    if (baru.length === 1) {
      const b = baru[0]!;
      umpanBalik.nada(b.nada, b.judul, { teks: b.teks, aksi: { label: "Buka", onClick: () => navigate(`${DASAR_PENGGUNA}/kontrak/${b.kontrakId}`) } });
    } else if (baru.length > 1) {
      umpanBalik.info(`${baru.length} kabar baru tentang pengajuan Anda`, { teks: "Buka lonceng di kanan atas untuk melihat semuanya." });
    }
  }, [mode, q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Ruang Admin: kabar "Untuk Anda" --------------------------------------------------------------
  // Aksi tulis di tab ini (langganan cache) menandai penyegaran berikutnya sebagai "perubahan sendiri"
  // bila umpan aktivitas tidak tersedia untuk memastikannya.
  const tulisSendiri = useRef(false);
  const urutAdmin = useRef(0);
  useEffect(() => {
    if (!modeAdmin || !q.data) return;
    const data = q.data;
    const urut = ++urutAdmin.current;
    const sendiri = tulisSendiri.current;
    tulisSendiri.current = false;
    void (async () => {
      const awal = bacaSimpananAdmin(sesi.email);
      let aktivitas: AktivitasRingkas[] | null = null;
      if (awal?.aktivitasSejak) {
        try {
          aktivitas = await ambilAktivitasSejak(awal.aktivitasSejak);
        } catch {
          return; // sesi/jaringan: dicoba lagi pada penyegaran berikutnya, jejak lama tetap dipakai
        }
      }
      if (urut !== urutAdmin.current) return; // data yang lebih baru sudah tiba
      setTerakhir(new Date());
      // Baca ulang setelah menunggu: tab lain atau "Tandai dibaca" mungkin sudah menulis.
      const simpan = bacaSimpananAdmin(sesi.email);
      const waktu = new Date().toISOString();
      const baru = bandingkanAdmin(simpan, data, sesi, { waktu, aktivitas, tulisSendiri: sendiri }).filter((b) => !idSenyap.current.has(b.kontrakId));
      const daftar = gabungKabar(baru, simpan?.kabar ?? []);
      tulisSimpananAdmin(sesi.email, {
        waktu,
        jejak: buatJejakAdmin(data, sesi),
        kabar: daftar,
        aktivitasId: aktivitasIdTerakhir(simpan?.aktivitasId ?? null, aktivitas),
        aktivitasSejak: waktu,
      });
      setUntukAnda(daftar);

      if (baru.length === 1) {
        const b = baru[0]!;
        umpanBalik.nada(b.nada, b.judul, { teks: b.teks, aksi: { label: "Buka", onClick: () => navigate(`/kontrak/${b.kontrakId}`) } });
      } else if (baru.length > 1) {
        umpanBalik.info(`${baru.length} kabar baru untuk Anda`, { teks: "Buka lonceng di kanan atas untuk melihat semuanya." });
      }
    })();
  }, [modeAdmin, q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab lain milik akun yang sama sudah memperbarui kabar: selaraskan tanpa memuat ulang.
  useEffect(() => {
    const kunci = kunciSimpananAdmin(sesi.email);
    const ubah = (e: StorageEvent) => {
      if (e.key === kunci) setUntukAnda(bacaSimpananAdmin(sesi.email)?.kabar ?? []);
    };
    window.addEventListener("storage", ubah);
    return () => window.removeEventListener("storage", ubah);
  }, [sesi.email]);

  // Saat berpindah ruang (bukan saat pertama dimuat), ambil data terbaru.
  const pertama = useRef(true);
  useEffect(() => {
    if (pertama.current) {
      pertama.current = false;
      return;
    }
    if (mode) void segarkan();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pembaruan otomatis selama tab terlihat, dan segera saat tab kembali dilihat atau koneksi pulih.
  useEffect(() => {
    if (!mode) return;
    const selang = modeAdmin ? SELANG_ADMIN_MS : SELANG_PENGGUNA_MS;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void segarkan();
    }, selang);
    const kembali = () => {
      if (document.visibilityState === "visible" && Date.now() - waktuMuat.current > JEDA_MIN_SEGAR_MS) void segarkan();
    };
    const daring = () => void segarkan();
    document.addEventListener("visibilitychange", kembali);
    window.addEventListener("online", daring);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", kembali);
      window.removeEventListener("online", daring);
    };
  }, [mode, modeAdmin, segarkan]);

  // Aksi tulis di tab ini mengosongkan cache kontrak: tandai segera (perubahan berikutnya buatan sendiri),
  // lalu muat ulang sesudah tulisannya selesai supaya angka lonceng dan judul tab langsung ikut berubah.
  // ambilSemuaKontrak memakai hasil halaman lain bila sudah dimuat ulang lebih dulu.
  useEffect(() => {
    const lepasTanda = dengarCacheKontrak(() => {
      tulisSendiri.current = true;
    });
    const lepasMuat = dengarCacheKontrakTertunda(() => {
      waktuMuat.current = Date.now();
      void ambilSemuaKontrak().catch(() => undefined);
    });
    return () => {
      lepasTanda();
      lepasMuat();
    };
  }, []);

  // Setelah masuk ulang, data yang gagal dimuat karena sesi habis diambil lagi.
  useSaatSesiPulih(() => void segarkan());

  const tandaiDibaca = useCallback(() => {
    setKabar((lama) => {
      if (lama.every((k) => k.dibaca)) return lama;
      const baru = lama.map((k) => ({ ...k, dibaca: true }));
      const simpan = bacaSimpanan(sesi.email);
      if (simpan) tulisSimpanan(sesi.email, { ...simpan, kabar: baru });
      return baru;
    });
  }, [sesi.email]);

  const tandaiDibacaUntukAnda = useCallback(() => {
    setUntukAnda((lama) => {
      if (lama.every((k) => k.dibaca)) return lama;
      const baru = lama.map((k) => ({ ...k, dibaca: true }));
      const simpan = bacaSimpananAdmin(sesi.email);
      if (simpan) tulisSimpananAdmin(sesi.email, { ...simpan, kabar: baru });
      return baru;
    });
  }, [sesi.email]);

  // Kabar kontrak yang dibisukan disembunyikan saat tampil (bukan dihapus), jadi muncul lagi bila senyapnya dibatalkan.
  const kabarTampil = useMemo(() => kabar.filter((k) => !senyap.dibisukan(k.kontrakId)), [kabar, senyap.dibisukan]);
  const untukAndaTampil = useMemo(() => untukAnda.filter((k) => !senyap.dibisukan(k.kontrakId)), [untukAnda, senyap.dibisukan]);

  const nilai = useMemo<NilaiPantau>(
    () => ({
      semua: q.data,
      error: q.error,
      loading: q.loading,
      milik,
      antrean,
      kabar: kabarTampil,
      belumDibaca: kabarTampil.filter((k) => !k.dibaca).length,
      tandaiDibaca,
      segarkan,
      terakhir,
      untukAnda: untukAndaTampil,
      belumDibacaUntukAnda: untukAndaTampil.filter((k) => !k.dibaca).length,
      tandaiDibacaUntukAnda,
      menungguSaya,
    }),
    [q.data, q.error, q.loading, milik, antrean, kabarTampil, tandaiDibaca, segarkan, terakhir, untukAndaTampil, tandaiDibacaUntukAnda, menungguSaya],
  );

  return <PantauContext.Provider value={nilai}>{children}</PantauContext.Provider>;
}
