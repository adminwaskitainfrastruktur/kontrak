import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, ChevronsUpDown, Clock, Coins, Download, FileSpreadsheet, Filter, FolderKanban, Handshake, KanbanSquare, Layers, ListOrdered, MessageSquarePlus, RefreshCcw, Search, Table2, X } from "lucide-react";
import { toast } from "sonner";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { usePengaturan } from "../context/PengaturanContext";
import { useDaftarKontrak } from "../hooks/useDaftarKontrak";
import { adalahLegal, bisaAjukan, bisaLihat, indeksTahap } from "../lib/alur";
import { adalahAddendum, addendumBedaMataUang, petaBedaMataUang, petaPerpanjanganDiproses } from "../lib/addendum";
import { adalahMou, teksNilai } from "../lib/mou";
import { formatMasuk, formatMasukRingkas, formatTanggal, formatWaktu, selisihHari, sisaHari } from "../lib/format";
import { EASE_KELUAR, pegas, pegasLembut } from "../lib/gerak";
import { horizonPeringatan, levelSlaPengaturan } from "../lib/pengaturan";
import {
  DAFTAR_URUT_KERJA,
  LABEL_TANPA_PROYEK,
  LABEL_URUT_KERJA,
  PARAM_KERJA,
  PERIKSA_MATA_UANG,
  PRESET_DAFTAR,
  PROYEK_TANPA,
  alihPreset,
  bacaFilterKerja,
  bandingNilai,
  cocokCari,
  daftarProyek,
  dalamCakupan,
  filterKerjaKosong,
  hitungPreset,
  petaBerakhirEfektif,
  presetAktif,
  presetById,
  ringkasFilterKerja,
  saringKerja,
  saringProyek,
  simpanDaftarTerakhir,
  urutkanKerja,
  type KonteksKerja,
} from "../lib/filterKerja";
import { eksporKontrakCsv, eksporKontrakExcel } from "../lib/ekspor";
import { DAFTAR_STATUS, DIVISI_PENGAJU, JENIS_KONTRAK, STATUS_PROSES, type Kontrak, type Prioritas, type Status, type Ymd } from "../lib/types";
import LencanaSla from "../components/LencanaSla";
import AksiMassal from "../components/AksiMassal";
import { LencanaMataUangBeda, LencanaModeBerakhir, LencanaPerpanjangan } from "../components/LencanaDaftar";
import { LencanaSenyap } from "../components/TombolSenyap";
import { ChipTtd } from "../components/PanelTtd";
import { Avatar, Kerangka, KepalaHalaman, KotakError, Kosong, Lencana, LencanaStatus, Segmen, Tombol, cx } from "../components/ui";
import WadahGulir from "../components/WadahGulir";

type Kolom = "nomor" | "judul" | "jenis" | "divisi" | "masuk" | "pic" | "prioritas" | "nilai" | "target" | "umur" | "berakhir" | "status";
type Arah = "asc" | "desc";
type UrutKolom = { kolom: Kolom; arah: Arah };
type Tampilan = "tabel" | "papan";

// --- Konstanta tampilan ---------------------------------------------------------------------------

const WARNA_KOLOM: Partial<Record<Status, string>> = {
  Diajukan: "var(--wh-ink-muted)",
  "Review Legal": "var(--wh-info)",
  "Perlu Revisi": "var(--wh-accent)",
  "Proses Tanda Tangan": "var(--wh-brand)",
  Aktif: "var(--wh-success)",
};

const KOLOM_PAPAN: { status: Status; warna: string }[] = [
  { status: "Diajukan", warna: "var(--wh-ink-muted)" },
  { status: "Review Legal", warna: "var(--wh-info)" },
  { status: "Perlu Revisi", warna: "var(--wh-accent)" },
  { status: "Proses Tanda Tangan", warna: "var(--wh-brand)" },
  { status: "Aktif", warna: "var(--wh-success)" },
];

const BOBOT_PRIORITAS: Record<Prioritas, number> = { Mendesak: 0, Tinggi: 1, Normal: 2 };

/** Batas centang sekali jalan: aksi massal memuat ulang data per kontrak, jadi puluhan sekaligus terasa lambat. */
const BATAS_PILIH = 50;

/** Di atas jumlah baris ini animasi masuk dan layout per baris dimatikan supaya daftar panjang tetap ringan (U39). */
const BATAS_ANIMASI = 30;

/** Peta lencana per kontrak induk, dihitung sekali per data (bukan per baris). */
interface PetaLencana {
  /** id induk -> addendum perpanjangan yang masih diproses (U05A). */
  perpanjangan: Map<number, Kontrak[]>;
  /** id induk -> addendum bermata uang berbeda (U29A). */
  bedaMataUang: Map<number, Kontrak[]>;
  /** id addendum bermata uang berbeda -> kontrak induknya. */
  indukBeda: Map<number, Kontrak>;
}

const NADA_HITUNG = {
  netral: "bg-raised text-muted",
  peringatan: "bg-accent-soft text-accent-ink",
  bahaya: "bg-danger-soft text-danger",
} as const;

/** Kapan kontrak masuk ke Legal: waktu pengajuan, atau waktu dibuat bila belum diajukan. */
const waktuMasuk = (k: Kontrak) => k.tanggalDiajukan ?? k.dibuat;

export default function DaftarKontrak() {
  const { sesi } = useSesi();
  const { ruang, ke } = useRuang();
  const { pengaturan } = usePengaturan();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Cache bersama (U39): data dari halaman lain dipakai langsung, lalu diperbarui di latar bila sudah basi.
  const { data, error, loading, waktu, muatUlang } = useDaftarKontrak();
  const [mengekspor, setMengekspor] = useState(false);
  const [tampilan, setTampilan] = useState<Tampilan>(() => {
    try {
      return localStorage.getItem("kontrak-tampilan") === "papan" ? "papan" : "tabel";
    } catch {
      return "tabel";
    }
  });
  const gantiTampilan = (t: Tampilan) => {
    setTampilan(t);
    try {
      localStorage.setItem("kontrak-tampilan", t);
    } catch {
      /* diabaikan */
    }
  };

  // Kontrol kerja Legal (preset, centang, aksi massal) hanya di Ruang Admin dan hanya untuk Legal.
  const modeLegal = ruang === "admin" && adalahLegal(sesi);
  const horizon = horizonPeringatan(pengaturan);

  const cari = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const jenis = params.get("jenis") ?? "";
  const divisi = params.get("divisi") ?? "";
  const proyek = params.get("proyek") ?? "";
  const periksaMu = params.get("periksa") === PERIKSA_MATA_UANG;
  const kunciParams = params.toString();
  const f = useMemo(() => bacaFilterKerja(new URLSearchParams(kunciParams)), [kunciParams]);

  const setFilter = (kunci: string, nilai: string) => {
    const baru = new URLSearchParams(params);
    if (nilai) baru.set(kunci, nilai);
    else baru.delete(kunci);
    setParams(baru, { replace: true });
  };

  /**
   * Chip status menyaring di dalam cakupan "tahap" (proses/selesai dari ubin atau preset). Status di luar
   * cakupan itu melepas tahap, supaya dua penyaring tidak saling meniadakan dan daftar tidak kosong tanpa sebab.
   */
  const pilihStatus = (st: string) => {
    const baru = new URLSearchParams(params);
    if (st) baru.set("status", st);
    else baru.delete("status");
    if (st && f.tahap && STATUS_PROSES.includes(st as Status) !== (f.tahap === "proses")) baru.delete("tahap");
    setParams(baru, { replace: true });
  };

  /** Lepas filter kerja (tahap, tanpa addendum, berakhir, PIC, ...) tanpa menyentuh pencarian dan pilihan lain. */
  const lepasFilterKerja = () => {
    const baru = new URLSearchParams(params);
    for (const k of PARAM_KERJA) if (k !== "urut") baru.delete(k);
    setParams(baru, { replace: true });
  };

  // Ingat alamat daftar beserta filternya, dan lepaskan centang setiap kali filter berubah.
  const [pilih, setPilih] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    simpanDaftarTerakhir(kunciParams);
    setPilih(new Set());
  }, [kunciParams]);

  const semua = useMemo(() => data ?? [], [data]);
  const ctx = useMemo<KonteksKerja>(() => ({ sesi, semua, level: (k: Kontrak) => levelSlaPengaturan(k, pengaturan) }), [sesi, semua, pengaturan]);
  const berakhirEfektif = useMemo(() => petaBerakhirEfektif(semua), [semua]);
  const berakhirDari = useMemo(() => (k: Kontrak): Ymd | null => (berakhirEfektif.has(k.id) ? (berakhirEfektif.get(k.id) ?? null) : k.tanggalBerakhir), [berakhirEfektif]);

  // Lencana perpanjangan diproses (U05A) dan mata uang addendum berbeda (U29A), sekali per data.
  const lencana = useMemo<PetaLencana>(() => {
    const per = new Map(semua.map((k) => [k.id, k]));
    const indukBeda = new Map<number, Kontrak>();
    for (const a of addendumBedaMataUang(semua)) {
      const induk = per.get(a.kontrakIndukId!);
      if (induk) indukBeda.set(a.id, induk);
    }
    return { perpanjangan: petaPerpanjanganDiproses(semua), bedaMataUang: petaBedaMataUang(semua), indukBeda };
  }, [semua]);
  const jumlahBedaMu = useMemo(() => semua.filter((k) => lencana.indukBeda.has(k.id) && bisaLihat(k, sesi)).length, [semua, lencana, sesi]);

  // Pilihan proyek untuk datalist: kode yang ada di kontrak yang boleh dilihat.
  const opsiProyek = useMemo(() => daftarProyek(semua.filter((k) => bisaLihat(k, sesi))), [semua, sesi]);

  const tersaring = useMemo(() => {
    // Proyek disaring lebih dulu dari seluruh data, supaya "sama persis" dinilai terhadap semua kode proyek yang ada.
    const dasar = proyek ? saringProyek(semua, proyek) : semua;
    // saringKerja sudah memeriksa hak lihat; urutan diatur terpisah di bawah.
    return saringKerja(dasar, { ...f, urut: null }, ctx)
      .filter((k) => !status || k.status === status)
      .filter((k) => !jenis || k.jenis === jenis)
      .filter((k) => !divisi || k.divisi === divisi)
      .filter((k) => !periksaMu || lencana.indukBeda.has(k.id))
      .filter((k) => cocokCari(k, cari));
  }, [semua, f, ctx, cari, status, jenis, divisi, proyek, periksaMu, lencana]);

  const adaFilter = !!(cari || status || jenis || divisi || proyek || periksaMu) || !filterKerjaKosong(f);

  const [urut, setUrut] = useState<UrutKolom>({ kolom: "nomor", arah: "desc" });
  const ubahUrut = (u: UrutKolom) => {
    setUrut(u);
    // Mengurutkan lewat kepala kolom menggantikan urutan kerja dari URL.
    if (f.urut) setFilter("urut", "");
  };

  const terurut = useMemo(() => {
    if (f.urut) return urutkanKerja(tersaring, f.urut, ctx);
    // Nilai dikelompokkan per mata uang (IDR, USD, EUR, SGD), baru diurutkan angkanya di dalam kelompok (U29A).
    if (urut.kolom === "nilai") return [...tersaring].sort((a, b) => bandingNilai(a, b, urut.arah) || b.id - a.id);
    const kali = urut.arah === "asc" ? 1 : -1;
    const sekarang = Date.now();
    const nilaiKolom = (k: Kontrak): string | number => {
      switch (urut.kolom) {
        case "nomor":
          return k.nomorPengajuan;
        case "judul":
          return k.judul.toLowerCase();
        case "jenis":
          return k.jenis;
        case "divisi":
          return k.divisi;
        case "masuk":
          return waktuMasuk(k);
        case "pic":
          // Yang belum ber-PIC dikumpulkan di akhir saat urut naik.
          return k.picLegalNama.trim().toLowerCase() || "￿";
        case "prioritas":
          return BOBOT_PRIORITAS[k.prioritas];
        case "nilai":
          return 0; // ditangani bandingNilai di atas
        case "target":
          return k.targetSelesai ?? "9999";
        case "umur": {
          // Umur tahap hanya bermakna selama diproses; status lain dianggap 0.
          const sejak = STATUS_PROSES.includes(k.status) ? (k.statusSejak ?? k.tanggalDiajukan) : null;
          return sejak ? sekarang - Date.parse(sejak) : -1;
        }
        case "berakhir":
          return berakhirDari(k) ?? "9999";
        case "status":
          return DAFTAR_STATUS.indexOf(k.status);
      }
    };
    return [...tersaring].sort((a, b) => {
      const x = nilaiKolom(a);
      const y = nilaiKolom(b);
      return (x < y ? -1 : x > y ? 1 : 0) * kali || b.id - a.id;
    });
  }, [tersaring, urut, f.urut, ctx, berakhirDari]);

  // Jumlah addendum (yang masih hidup) per kontrak induk, untuk lencana pada baris dan kartu.
  const jumlahAdd = useMemo(() => {
    const m = new Map<number, number>();
    for (const k of semua) {
      if (adalahAddendum(k) && k.status !== "Ditolak" && k.status !== "Dibatalkan") m.set(k.kontrakIndukId!, (m.get(k.kontrakIndukId!) ?? 0) + 1);
    }
    return m;
  }, [semua]);

  // Angka chip status mengikuti cakupan "tanpa addendum" dan "tahap" bila dipasang (ubin KPI, preset Selesai),
  // supaya chip "Semua" sama dengan jumlah baris yang tampil dan dengan angka ubin yang diklik (U01).
  const hitungStatus = useMemo(() => {
    const cakupan = { tahap: f.tahap, addendum: f.addendum };
    const dasar = semua.filter((k) => bisaLihat(k, sesi) && dalamCakupan(k, cakupan));
    return DAFTAR_STATUS.map((st) => ({ st, n: dasar.filter((k) => k.status === st).length })).filter((x) => x.n > 0);
  }, [semua, sesi, f.addendum, f.tahap]);
  const totalDasar = hitungStatus.reduce((n, x) => n + x.n, 0);

  // Chip preset kerja Legal: angkanya dihitung dengan pencocok yang sama dengan daftar.
  const hitungKerja = useMemo(() => (modeLegal ? hitungPreset(semua, ctx) : null), [modeLegal, semua, ctx]);
  const preset = presetAktif(params);

  const namaPic = useMemo(() => {
    const m = new Map<string, string>();
    for (const k of semua) if (k.picLegalEmail && k.picLegalNama) m.set(k.picLegalEmail.trim().toLowerCase(), k.picLegalNama);
    return m;
  }, [semua]);
  const ringkasKerja = ringkasFilterKerja(f, (email) => namaPic.get(email) ?? email);
  // Preset yang chip-nya terlihat sudah menunjukkan filternya; selain itu (Pemantau, ubin KPI) tampilkan baris filter.
  const tampilBarisFilter = !filterKerjaKosong(f) && !(modeLegal && preset);

  // --- Pilihan untuk aksi massal (desktop, Legal) ---
  const terpilih = useMemo(() => terurut.filter((k) => pilih.has(k.id)), [terurut, pilih]);
  const alihPilih = (id: number) =>
    setPilih((lama) => {
      const baru = new Set(lama);
      if (baru.has(id)) baru.delete(id);
      else if (baru.size < BATAS_PILIH) baru.add(id);
      else toast.info(`Paling banyak ${BATAS_PILIH} kontrak sekali jalan, supaya prosesnya tetap cepat.`);
      return baru;
    });
  const alihSemua = () => {
    if (terpilih.length > 0) {
      setPilih(new Set());
      return;
    }
    const ambil = terurut.slice(0, BATAS_PILIH);
    setPilih(new Set(ambil.map((k) => k.id)));
    if (terurut.length > BATAS_PILIH) toast.info(`${BATAS_PILIH} kontrak teratas dipilih. Selesaikan dulu, lalu lanjutkan sisanya.`);
  };

  // --- Proyek (datalist) ---
  const proyekTampil = proyek.trim().toLowerCase() === PROYEK_TANPA ? LABEL_TANPA_PROYEK : proyek;
  const ubahProyek = (v: string) => setFilter("proyek", v.trim().toLowerCase() === LABEL_TANPA_PROYEK.toLowerCase() ? PROYEK_TANPA : v);

  // --- Ekspor ---
  const cakupan =
    [
      status && `Status: ${status}`,
      jenis && `Jenis: ${jenis}`,
      divisi && `Divisi: ${divisi}`,
      proyek.trim() && `Proyek: ${proyekTampil.trim()}`,
      cari.trim() && `Cari: "${cari.trim()}"`,
      periksaMu && "Addendum bermata uang berbeda dari induk",
      ...ringkasKerja,
    ]
      .filter(Boolean)
      .join(" · ") || "Semua kontrak yang bisa Anda lihat";
  const eksporCsv = () => {
    try {
      eksporKontrakCsv(terurut, semua);
    } catch {
      toast.error("Berkas CSV belum berhasil dibuat. Coba sekali lagi, ya.");
    }
  };
  const eksporExcel = async () => {
    setMengekspor(true);
    try {
      await eksporKontrakExcel(terurut, semua, { cakupan });
    } catch {
      toast.error("Berkas Excel belum berhasil dibuat. Coba sekali lagi, ya.");
    } finally {
      setMengekspor(false);
    }
  };

  const sub = data ? [`${tersaring.length} kontrak ditampilkan`, ...ringkasKerja].join(" · ") : undefined;
  const dataPer = waktu ? `Data per ${formatWaktu(new Date(waktu).toISOString())}` : "Segarkan data";

  return (
    <>
      <KepalaHalaman
        judul="Daftar Kontrak"
        sub={sub}
        aksi={
          <>
            <Segmen id="tampilan" label="Tampilan daftar" nilai={tampilan} onUbah={gantiTampilan} pilihan={[{ nilai: "tabel", label: "Tabel", ikon: <Table2 className="h-4 w-4" /> }, { nilai: "papan", label: "Papan", ikon: <KanbanSquare className="h-4 w-4" /> }]} />
            <Tombol varian="hantu" className="min-h-[44px] min-w-[44px] !px-3" ikon={<RefreshCcw className={cx("h-4 w-4", loading && !!data && "animate-spin")} aria-hidden="true" />} disabled={loading} onClick={() => void muatUlang()} aria-label={`Segarkan daftar. ${dataPer}`} title={dataPer} />
            <Tombol varian="kedua" className="min-h-[44px]" ikon={<Download className="h-4 w-4" />} disabled={!tersaring.length} onClick={eksporCsv} aria-label="Ekspor CSV">
              <span className="hidden sm:inline">Ekspor </span>CSV
            </Tombol>
            <Tombol varian="kedua" className="min-h-[44px]" ikon={<FileSpreadsheet className="h-4 w-4" />} memuat={mengekspor} disabled={!tersaring.length} onClick={() => void eksporExcel()} aria-label="Ekspor Excel">
              <span className="hidden sm:inline">Ekspor </span>Excel
            </Tombol>
            {bisaAjukan(sesi) && (
              <Tombol className="min-h-[44px]" ikon={<MessageSquarePlus className="h-4 w-4" />} onClick={() => navigate(ke.ajukan)}>
                Ajukan Kontrak
              </Tombol>
            )}
          </>
        }
      />

      {modeLegal && hitungKerja && (
        <div className="scroll-halus -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter kerja Legal">
          {PRESET_DAFTAR.map((p) => {
            const aktif = preset === p.id;
            const n = hitungKerja[p.id];
            return (
              <motion.button
                key={p.id}
                type="button"
                aria-pressed={aktif}
                title={p.keterangan}
                whileTap={{ scale: 0.95 }}
                transition={pegas}
                onClick={() => setParams(alihPreset(params, p.id), { replace: true })}
                className={cx("inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold transition-colors", aktif ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface text-muted hover:border-brand hover:text-ink")}
              >
                {p.label}
                <span className={cx("angka rounded-full px-1.5 text-xs", n > 0 ? NADA_HITUNG[p.nada] : "bg-raised text-muted")}>{n}</span>
              </motion.button>
            );
          })}
        </div>
      )}

      {hitungStatus.length > 0 && (
        <div className="scroll-halus -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Saring menurut status">
          {[{ st: "", n: totalDasar }, ...hitungStatus].map(({ st, n }) => {
            const aktif = status === st;
            return (
              <motion.button key={st || "semua"} type="button" aria-pressed={aktif} whileTap={{ scale: 0.95 }} transition={pegas} onClick={() => pilihStatus(st)} className={cx("relative inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors", aktif ? "border-transparent text-brand-on" : "border-line bg-surface text-muted hover:border-brand hover:text-ink")}>
                {aktif && <motion.span layoutId="chip-status" transition={pegas} className="absolute inset-0 rounded-full bg-gradient-to-b from-brand to-brand-strong shadow-[0_8px_18px_-8px_var(--wh-brand)]" />}
                <span className="relative">{st || "Semua"}</span>
                <span className={cx("angka relative rounded-full px-1.5 text-xs", aktif ? "bg-white/25" : "bg-raised")}>{n}</span>
              </motion.button>
            );
          })}
        </div>
      )}

      <div className="kartu mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <div className="relative min-w-0 sm:col-span-2 lg:col-span-4 2xl:col-span-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input type="search" className="input min-h-[44px] pl-10" placeholder="Cari judul, nomor, mitra, proyek, atau PO…" value={cari} onChange={(e) => setFilter("q", e.target.value)} aria-label="Cari kontrak: judul, nomor, mitra, nama, kode proyek, atau nomor referensi PR/PO/SPK" />
        </div>
        <select className="input min-h-[44px] min-w-0" value={jenis} onChange={(e) => setFilter("jenis", e.target.value)} aria-label="Jenis">
          <option value="">Semua jenis</option>
          {JENIS_KONTRAK.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="input min-h-[44px] min-w-0" value={divisi} onChange={(e) => setFilter("divisi", e.target.value)} aria-label="Divisi">
          <option value="">Semua divisi</option>
          {DIVISI_PENGAJU.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div className="relative min-w-0">
          <FolderKanban className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            className="input min-h-[44px] pl-10"
            list="opsi-proyek-daftar"
            placeholder="Semua proyek"
            value={proyekTampil}
            onChange={(e) => ubahProyek(e.target.value)}
            aria-label={`Saring menurut proyek. Pilih "${LABEL_TANPA_PROYEK}" untuk kontrak tanpa kode proyek.`}
            autoComplete="off"
          />
          <datalist id="opsi-proyek-daftar">
            <option value={LABEL_TANPA_PROYEK} />
            {opsiProyek.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <select className="input min-h-[44px] min-w-0" value={f.urut ?? ""} onChange={(e) => setFilter("urut", e.target.value)} aria-label="Urutkan">
          <option value="">Urutan kolom tabel</option>
          {DAFTAR_URUT_KERJA.map((u) => (
            <option key={u} value={u}>
              {LABEL_URUT_KERJA[u]}
            </option>
          ))}
        </select>
      </div>

      {periksaMu ? (
        <div role="note" className="mb-4 flex flex-wrap items-start gap-3 rounded-2xl border border-accent bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          <Coins className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Addendum bermata uang berbeda dari kontrak induknya.</span> Selisih nilainya tidak dijumlahkan ke nilai efektif induk maupun total di dashboard. Buka addendumnya untuk memeriksa apakah mata uangnya keliru.
          </p>
          <button type="button" onClick={() => setFilter("periksa", "")} className="inline-flex min-h-[44px] items-center gap-1 rounded-xl px-3 font-semibold transition-colors hover:bg-surface">
            <X className="h-4 w-4" aria-hidden="true" /> Tutup
          </button>
        </div>
      ) : (
        jumlahBedaMu > 0 && (
          <button
            type="button"
            onClick={() => setParams(new URLSearchParams({ periksa: PERIKSA_MATA_UANG }), { replace: true })}
            className="mb-4 flex min-h-[44px] w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2 text-left text-sm transition-colors hover:border-accent hover:bg-accent-soft"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-accent-ink" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {jumlahBedaMu} addendum bermata uang berbeda dari induknya, jadi nilainya tidak ikut dijumlahkan.
            </span>
            <span className="shrink-0 font-semibold text-brand-strong">Periksa</span>
          </button>
        )
      )}

      {tampilBarisFilter && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <Filter className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0 text-muted">
            Disaring: <span className="font-semibold text-ink">{ringkasKerja.join(" · ")}</span>
          </span>
          <button type="button" onClick={lepasFilterKerja} className="inline-flex min-h-[44px] items-center gap-1 rounded-xl px-2 font-semibold text-brand-strong transition-colors hover:bg-brand-soft">
            <X className="h-4 w-4" aria-hidden="true" /> Lepas filter
          </button>
        </div>
      )}

      {f.urut && tersaring.length > 0 && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
          Diurutkan menurut <span className="font-semibold text-ink">{LABEL_URUT_KERJA[f.urut]}</span>
          <button type="button" onClick={() => setFilter("urut", "")} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 font-semibold text-brand-strong transition-colors hover:bg-brand-soft">
            <X className="h-3 w-3" aria-hidden="true" /> Pakai urutan kolom
          </button>
        </p>
      )}

      {error != null && data && (
        <p role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">Data terbaru belum termuat, yang tampil adalah data terakhir.</span>
          <button type="button" onClick={() => void muatUlang()} className="inline-flex min-h-[44px] items-center rounded-lg px-2 font-semibold underline-offset-2 hover:underline">
            Coba lagi
          </button>
        </p>
      )}

      {loading && !data ? (
        <div role="status" aria-label="Memuat" className="kartu divide-y divide-line">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Kerangka className="h-10 w-10 rounded-full" />
              <Kerangka className="h-4 flex-1" />
              <Kerangka className="h-6 w-24 rounded-full" />
            </div>
          ))}
        </div>
      ) : error != null && !data ? (
        <KotakError error={error} ulangi={() => void muatUlang()} />
      ) : tersaring.length === 0 ? (
        <div className="kartu">
          {preset ? (
            <Kosong judul="Beres untuk saat ini" teks={presetById(preset).kosong} aksi={<Tombol varian="kedua" onClick={() => setParams({})}>Lihat semua kontrak</Tombol>} />
          ) : periksaMu ? (
            <Kosong judul="Mata uang addendum sudah seragam" teks="Tidak ada addendum aktif atau diproses yang mata uangnya berbeda dari induknya." aksi={<Tombol varian="kedua" onClick={() => setParams({})}>Lihat semua kontrak</Tombol>} />
          ) : adaFilter ? (
            <Kosong judul="Tidak ada kontrak yang cocok" teks="Coba ubah kata kunci atau filter." aksi={<Tombol varian="kedua" onClick={() => setParams({})}>Hapus filter</Tombol>} />
          ) : (
            <Kosong judul="Belum ada kontrak" teks="Kontrak yang diajukan akan muncul di sini." />
          )}
        </div>
      ) : (
        // Peralihan hanya memakai animasi masuk (bukan menunggu animasi keluar) supaya cepat dan tidak
        // tertahan bila tab sedang di latar belakang.
        <motion.div key={tampilan} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_KELUAR }}>
          {tampilan === "tabel" ? (
            <Tabel
              data={terurut}
              urut={f.urut ? null : urut}
              onUrut={ubahUrut}
              jumlahAdd={jumlahAdd}
              berakhirDari={berakhirDari}
              horizon={horizon}
              lencana={lencana}
              pilihan={modeLegal ? { terpilih: pilih, alih: alihPilih, alihSemua, jumlah: terpilih.length } : null}
            />
          ) : (
            <Papan data={terurut} jumlahAdd={jumlahAdd} berakhirDari={berakhirDari} horizon={horizon} lencana={lencana} />
          )}
        </motion.div>
      )}

      {modeLegal && <AksiMassal terpilih={terpilih} semua={semua} onBersihkan={() => setPilih(new Set())} onSelesai={muatUlang} />}
    </>
  );
}

// --- Tabel --------------------------------------------------------------------

interface Pilihan {
  terpilih: Set<number>;
  alih: (id: number) => void;
  alihSemua: () => void;
  /** Jumlah terpilih yang sedang tampil. */
  jumlah: number;
}

function Tabel({ data, urut, onUrut, jumlahAdd, berakhirDari, horizon, lencana, pilihan }: { data: Kontrak[]; urut: UrutKolom | null; onUrut: (u: UrutKolom) => void; jumlahAdd: Map<number, number>; berakhirDari: (k: Kontrak) => Ymd | null; horizon: number; lencana: PetaLencana; pilihan: Pilihan | null }) {
  const navigate = useNavigate();
  const { ke } = useRuang();
  const kepala = { urut, onUrut };
  const semuaTerpilih = !!pilihan && pilihan.jumlah > 0 && pilihan.jumlah >= Math.min(data.length, BATAS_PILIH);
  const sebagian = !!pilihan && pilihan.jumlah > 0 && !semuaTerpilih;
  // Daftar panjang: tanpa animasi per baris (layout dan masuk), supaya gulir dan penyaringan tetap ringan.
  const hemat = data.length > BATAS_ANIMASI;
  return (
    <>
      {/* Ponsel dan tablet: daftar kartu yang mudah disentuh dan dibaca tanpa geser ke samping (dua kolom di tablet). */}
      <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:hidden">
        {data.map((k) => (
          <Kartu key={k.id} k={k} warna={WARNA_KOLOM[k.status] ?? "var(--wh-line)"} jumlahAdd={jumlahAdd.get(k.id) ?? 0} berakhir={berakhirDari(k)} horizon={horizon} lencana={lencana} hemat={hemat} tampilStatus />
        ))}
      </div>
      <WadahGulir className="hidden lg:block">
        <table className="tabel w-full min-w-[1080px]">
          <caption className="sr-only">Daftar kontrak, dapat diurutkan menurut kolom</caption>
          <thead>
            <tr>
              {pilihan && (
                <th scope="col" className="sticky top-0 w-10">
                  {/* Label selebar 44 px supaya kotak centang mudah disentuh di tablet. */}
                  <label className="-mx-2 -my-3 grid h-11 w-11 cursor-pointer place-items-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-[var(--wh-brand)]"
                      checked={semuaTerpilih}
                      ref={(el) => {
                        if (el) el.indeterminate = sebagian;
                      }}
                      onChange={pilihan.alihSemua}
                      aria-label={pilihan.jumlah > 0 ? "Batalkan semua pilihan" : "Pilih semua yang tampil"}
                      title={data.length > BATAS_PILIH ? `Memilih ${BATAS_PILIH} kontrak teratas` : "Pilih semua yang tampil"}
                    />
                  </label>
                </th>
              )}
              <Kepala kolom="nomor" {...kepala}>Nomor</Kepala>
              <Kepala kolom="judul" {...kepala}>Kontrak</Kepala>
              <Kepala kolom="jenis" {...kepala} className="hidden xl:table-cell">Jenis</Kepala>
              <Kepala kolom="masuk" {...kepala} awal="desc">Masuk</Kepala>
              <Kepala kolom="pic" {...kepala}>PIC</Kepala>
              <Kepala kolom="prioritas" {...kepala}>Prioritas</Kepala>
              <Kepala kolom="nilai" {...kepala} kanan keterangan="Dikelompokkan per mata uang (IDR, USD, EUR, SGD), lalu menurut nilainya">Nilai</Kepala>
              <Kepala kolom="target" {...kepala}>Target</Kepala>
              <Kepala kolom="umur" {...kepala} awal="desc">Umur</Kepala>
              <Kepala kolom="berakhir" {...kepala}>Berakhir</Kepala>
              <Kepala kolom="status" {...kepala}>Status</Kepala>
            </tr>
          </thead>
          <tbody>
            {data.map((k, i) => {
              const berakhir = berakhirDari(k);
              const diperpanjang = !!berakhir && !!k.tanggalBerakhir && berakhir !== k.tanggalBerakhir;
              const sisa = k.status === "Aktif" && berakhir ? selisihHari(berakhir) : null;
              const sisaTarget = STATUS_PROSES.includes(k.status) && k.targetSelesai ? selisihHari(k.targetSelesai) : null;
              const tahap = indeksTahap(k.status);
              const dipilih = !!pilihan?.terpilih.has(k.id);
              const masuk = waktuMasuk(k);
              const kelas = cx("group cursor-pointer transition-colors hover:bg-raised", dipilih && "bg-brand-soft");
              const buka = () => navigate(ke.detail(k.id));
              const sel = (
                <>
                  {pilihan && (
                    <td className="w-10" onClick={(e) => e.stopPropagation()}>
                      <label className="-mx-2 grid h-11 w-11 cursor-pointer place-items-center">
                        <input type="checkbox" className="h-4 w-4 cursor-pointer accent-[var(--wh-brand)]" checked={dipilih} onChange={() => pilihan.alih(k.id)} aria-label={`Pilih ${k.nomorKontrak || k.nomorPengajuan}`} />
                      </label>
                    </td>
                  )}
                  <td>
                    <p className="whitespace-nowrap font-mono text-xs font-semibold">{k.nomorPengajuan}</p>
                    {k.nomorKontrak && <p className="mt-0.5 whitespace-nowrap font-mono text-xs text-muted">{k.nomorKontrak}</p>}
                    {k.kodeProyek && (
                      <p className="mt-0.5 max-w-[9rem] truncate text-[11px] text-muted" title={`Proyek ${k.kodeProyek}${k.nomorReferensi ? ` · Ref. ${k.nomorReferensi}` : ""}`}>
                        {k.kodeProyek}
                      </p>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar nama={k.mitra || k.pengajuNama || "?"} ukuran={36} className="shrink-0" />
                      <div className="min-w-0 max-w-[13rem] lg:max-w-[16rem] xl:max-w-[18rem] 2xl:max-w-[28rem]">
                        <Link to={ke.detail(k.id)} className="block truncate font-semibold transition-colors group-hover:text-brand" title={k.judul} onClick={(e) => e.stopPropagation()}>
                          {k.judul}
                        </Link>
                        <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                          <span className="truncate">
                            {k.mitra || "-"} · {k.divisi}
                            <span className="xl:hidden"> · {k.jenis}</span>
                          </span>
                          <BadgeAddendum k={k} jumlah={jumlahAdd.get(k.id) ?? 0} />
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden text-muted xl:table-cell">{k.jenis}</td>
                  <td className="whitespace-nowrap text-xs" title={`Masuk ${formatMasuk(masuk)}`}>
                    <span className="angka">{formatMasukRingkas(masuk)}</span>
                    <span className="block text-[11px] text-muted">WIB</span>
                  </td>
                  <td>
                    {k.picLegalNama ? (
                      <span className="inline-flex max-w-[9rem] items-center gap-1.5" title={k.picLegalNama}>
                        <Avatar nama={k.picLegalNama} ukuran={22} className="shrink-0" />
                        <span className="truncate text-xs font-medium">{k.picLegalNama}</span>
                      </span>
                    ) : STATUS_PROSES.includes(k.status) ? (
                      <span className="whitespace-nowrap text-xs italic text-muted">Belum ada</span>
                    ) : (
                      <span className="text-xs text-muted">-</span>
                    )}
                  </td>
                  <td>
                    <Lencana nada={k.prioritas === "Mendesak" ? "bahaya" : k.prioritas === "Tinggi" ? "peringatan" : "netral"}>{k.prioritas}</Lencana>
                  </td>
                  <td className="text-right">
                    <span className={cx("angka block whitespace-nowrap font-semibold", k.nilai == null && "font-normal text-muted")}>{teksNilai(k)}</span>
                    <LencanaMataUangBeda addendum={lencana.bedaMataUang.get(k.id)} className="mt-1" />
                    {lencana.indukBeda.has(k.id) && <LencanaMataUangBeda addendum={[k]} induk={lencana.indukBeda.get(k.id)} className="mt-1" />}
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    <span className={cx(sisaTarget != null && (sisaTarget < 0 ? "font-semibold text-danger" : sisaTarget <= 3 ? "font-semibold text-accent-ink" : ""), !k.targetSelesai && "text-muted")} title={sisaTarget != null && sisaTarget < 0 ? `Lewat target ${-sisaTarget} hari` : undefined}>
                      {formatTanggal(k.targetSelesai)}
                    </span>
                  </td>
                  <td>
                    <LencanaSla k={k} tanpaTarget />
                  </td>
                  <td className="whitespace-nowrap">
                    <span className={cx(sisa != null && sisa <= horizon && (sisa < 0 ? "font-semibold text-danger" : "font-semibold text-accent-ink"))} title={diperpanjang ? `Diperpanjang lewat addendum, semula ${formatTanggal(k.tanggalBerakhir)}` : undefined}>
                      {formatTanggal(berakhir)}
                    </span>
                    {diperpanjang && <span className="block text-[11px] text-info">lewat addendum</span>}
                    <LencanaPerpanjangan addendum={lencana.perpanjangan.get(k.id)} className="mt-1" />
                  </td>
                  <td>
                    <div className="flex flex-col items-start gap-1.5">
                      <span className="inline-flex flex-wrap items-center">
                        <LencanaStatus status={k.status} />
                        <ChipTtd kontrak={k} className="ml-1.5" />
                      </span>
                      <LencanaModeBerakhir mode={k.modeBerakhir} />
                      <LencanaSenyap id={k.id} />
                      <span className="flex gap-1" aria-hidden="true">
                        {[0, 1, 2, 3].map((n) => (
                          <span key={n} className={cx("h-1 w-5 rounded-full transition-colors", tahap >= 0 && n <= tahap ? "bg-brand" : "bg-line")} />
                        ))}
                      </span>
                    </div>
                  </td>
                </>
              );
              return hemat ? (
                <tr key={k.id} className={kelas} onClick={buka}>
                  {sel}
                </tr>
              ) : (
                <motion.tr key={k.id} layout="position" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.3, ease: EASE_KELUAR }} className={kelas} onClick={buka}>
                  {sel}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </WadahGulir>
    </>
  );
}

function Kepala({ kolom, urut, onUrut, kanan, awal = "asc", keterangan, className, children }: { kolom: Kolom; urut: UrutKolom | null; onUrut: (u: UrutKolom) => void; kanan?: boolean; awal?: Arah; keterangan?: string; className?: string; children: React.ReactNode }) {
  const aktif = urut?.kolom === kolom;
  const arah = urut?.arah ?? "asc";
  const Ikon = !aktif ? ChevronsUpDown : arah === "asc" ? ArrowUp : ArrowDown;
  const balik: Arah = awal === "asc" ? "desc" : "asc";
  return (
    <th scope="col" aria-sort={aktif ? (arah === "asc" ? "ascending" : "descending") : "none"} className={cx("sticky top-0 whitespace-nowrap", kanan && "text-right", className)}>
      <button type="button" title={keterangan} onClick={() => onUrut({ kolom, arah: aktif && arah === awal ? balik : awal })} className={cx("-my-3 inline-flex min-h-[44px] items-center gap-1 uppercase tracking-wider transition-colors hover:text-ink", aktif && "text-ink", kanan && "flex-row-reverse")}>
        {children}
        <motion.span key={`${aktif}-${arah}`} initial={{ opacity: 0, y: arah === "asc" ? 6 : -6 }} animate={{ opacity: 1, y: 0 }} transition={pegasLembut} className="inline-flex">
          <Ikon className={cx("h-3.5 w-3.5", !aktif && "opacity-50")} aria-hidden="true" />
        </motion.span>
      </button>
    </th>
  );
}

// --- Papan (kanban) ------------------------------------------------------------

function Papan({ data, jumlahAdd, berakhirDari, horizon, lencana }: { data: Kontrak[]; jumlahAdd: Map<number, number>; berakhirDari: (k: Kontrak) => Ymd | null; horizon: number; lencana: PetaLencana }) {
  const ditutup = data.filter((k) => !KOLOM_PAPAN.some((c) => c.status === k.status));
  const hemat = data.length > BATAS_ANIMASI;
  return (
    <div className="scroll-halus -mx-3 flex snap-x snap-mandatory gap-4 overflow-x-auto px-3 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
      {KOLOM_PAPAN.map((c, ci) => {
        const isi = data.filter((k) => k.status === c.status);
        return (
          <motion.section key={c.status} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.06, duration: 0.4, ease: EASE_KELUAR }} className="w-[82vw] max-w-[300px] shrink-0 snap-start sm:w-[290px]" aria-label={`Kolom ${c.status}`}>
            <header className="mb-3 flex items-center gap-2 px-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.warna }} aria-hidden="true" />
              <h3 className="text-sm font-bold">{c.status}</h3>
              <span className="angka ml-auto rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-muted">{isi.length}</span>
            </header>
            <div className="min-h-[120px] space-y-3 rounded-[22px] bg-raised p-2.5">
              <AnimatePresence initial={false} mode="popLayout">
                {isi.map((k) => (
                  <Kartu key={k.id} k={k} warna={c.warna} jumlahAdd={jumlahAdd.get(k.id) ?? 0} berakhir={berakhirDari(k)} horizon={horizon} lencana={lencana} hemat={hemat} />
                ))}
              </AnimatePresence>
              {isi.length === 0 && <p className="grid h-24 place-items-center text-center text-xs text-muted">Kosong</p>}
            </div>
          </motion.section>
        );
      })}
      {ditutup.length > 0 && (
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="w-[82vw] max-w-[300px] shrink-0 snap-start sm:w-[290px]" aria-label="Kolom ditutup">
          <header className="mb-3 flex items-center gap-2 px-1">
            <span className="h-2.5 w-2.5 rounded-full bg-line" aria-hidden="true" />
            <h3 className="text-sm font-bold">Ditutup</h3>
            <span className="angka ml-auto rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-muted">{ditutup.length}</span>
          </header>
          <div className="space-y-3 rounded-[22px] bg-raised p-2.5">
            <AnimatePresence initial={false} mode="popLayout">
              {ditutup.map((k) => (
                <Kartu key={k.id} k={k} warna="var(--wh-line)" jumlahAdd={jumlahAdd.get(k.id) ?? 0} berakhir={berakhirDari(k)} horizon={horizon} lencana={lencana} hemat={hemat} tampilStatus />
              ))}
            </AnimatePresence>
          </div>
        </motion.section>
      )}
    </div>
  );
}

function Kartu({ k, warna, jumlahAdd, berakhir, horizon, lencana, hemat, tampilStatus }: { k: Kontrak; warna: string; jumlahAdd: number; berakhir: Ymd | null; horizon: number; lencana: PetaLencana; hemat?: boolean; tampilStatus?: boolean }) {
  const { ke } = useRuang();
  const sisa = k.status === "Aktif" && berakhir ? selisihHari(berakhir) : null;
  const diproses = STATUS_PROSES.includes(k.status);
  const masuk = waktuMasuk(k);
  return (
    <motion.div layout={!hemat} initial={hemat ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={pegasLembut} whileHover={{ y: -3 }}>
      <Link to={ke.detail(k.id)} className="relative block overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-pop">
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: warna }} aria-hidden="true" />
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-[11px] font-semibold text-muted">{k.nomorPengajuan}</span>
          {k.prioritas !== "Normal" && <Lencana nada={k.prioritas === "Mendesak" ? "bahaya" : "peringatan"}>{k.prioritas}</Lencana>}
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm font-bold leading-snug">{k.judul}</p>
        <p className="mt-1 truncate text-xs text-muted">
          {k.mitra || "-"}
          {k.kodeProyek && ` · ${k.kodeProyek}`}
        </p>
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted" title={`Masuk ${formatMasuk(masuk)}`}>
          <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
          Masuk <span className="angka">{formatMasukRingkas(masuk)} WIB</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 empty:hidden">
          {tampilStatus && <LencanaStatus status={k.status} />}
          <ChipTtd kontrak={k} />
          <BadgeAddendum k={k} jumlah={jumlahAdd} />
          {diproses && <LencanaSla k={k} />}
          <LencanaPerpanjangan addendum={lencana.perpanjangan.get(k.id)} />
          <LencanaMataUangBeda addendum={lencana.bedaMataUang.get(k.id)} />
          {lencana.indukBeda.has(k.id) && <LencanaMataUangBeda addendum={[k]} induk={lencana.indukBeda.get(k.id)} />}
          <LencanaModeBerakhir mode={k.modeBerakhir} />
          <LencanaSenyap id={k.id} />
        </div>
        <p className={cx("angka mt-3 text-sm font-extrabold", k.nilai == null && "font-medium text-muted")}>{teksNilai(k)}</p>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <Avatar nama={k.pengajuNama || "?"} ukuran={22} className="shrink-0" />
            <span className="truncate">{k.divisi}</span>
          </span>
          {sisa != null ? (
            <span className={cx("inline-flex shrink-0 items-center gap-1 text-xs font-semibold", sisa < 0 ? "text-danger" : sisa <= horizon ? "text-accent-ink" : "text-muted")}>
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> {sisaHari(berakhir!)}
            </span>
          ) : (
            // Selama diproses, target sudah tampil di lencana SLA di atas.
            !diproses &&
            k.targetSelesai && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> {formatTanggal(k.targetSelesai)}
              </span>
            )
          )}
        </div>
      </Link>
    </motion.div>
  );
}

/** "Addendum ke-2" untuk addendum, atau "3 addendum" untuk kontrak yang punya addendum. */
function BadgeAddendum({ k, jumlah }: { k: Kontrak; jumlah: number }) {
  if (adalahAddendum(k)) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info">
        <Layers className="h-3 w-3" aria-hidden="true" /> Addendum ke-{k.urutanAddendum ?? "?"}
      </span>
    );
  }
  if (adalahMou(k)) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
        <Handshake className="h-3 w-3" aria-hidden="true" /> MoU
      </span>
    );
  }
  if (k.mouAcuanId != null) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
        <Handshake className="h-3 w-3" aria-hidden="true" /> Turunan MoU
      </span>
    );
  }
  if (jumlah > 0) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-strong">
        <Layers className="h-3 w-3" aria-hidden="true" /> {jumlah} addendum
      </span>
    );
  }
  return null;
}
