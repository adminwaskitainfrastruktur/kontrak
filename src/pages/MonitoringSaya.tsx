// Ruang Pengguna: memantau kontrak yang diajukan sendiri. Statusnya diringkas jadi Antri, Proses, dan
// Selesai, dengan posisi di antrean Legal dan kabar terbaru. Data datang dari PantauContext (diperbarui
// otomatis tiap menit selama halaman terbuka). Kartu yang masih antri memberi perkiraan kapan review selesai,
// dihitung dari riwayat status (angka agregat saja; event milik orang lain tidak pernah ditampilkan).
// Kartu menampilkan kapan masuk, sejak kapan di tahap sekarang, dan umur pengajuan (U03A, lib/waktuPengajuan),
// bukan "Diperbarui ..." yang ikut berubah karena hal teknis. Saat Proses Tanda Tangan ada chip "TTD n/m" (U21).
// Pengguna baru (belum menutup sambutan dan belum punya pengajuan) melihat sambutan tiga langkah (SambutanPengguna).
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BellRing, CalendarClock, CheckCheck, CheckCircle2, ChevronRight, Clock3, CopyPlus, History, Hourglass, Lightbulb, MessageSquarePlus, RefreshCw, Scale, Search, Signature, Sparkles, XCircle } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { usePantau } from "../context/PantauContext";
import { useRuang } from "../context/RuangContext";
import { keteranganRingkas, posisiAntrean, sedangDitangani, selesaiBerhasil, statusRingkas, teksPosisi, type StatusRingkas } from "../lib/antrean";
import { formatMasuk, formatRelatif, formatWaktu } from "../lib/format";
import { perkiraanSelesaiAntrean } from "../lib/estimasi";
import type { EventStatus } from "../lib/laporan";
import { bisaAjukanSerupa } from "../lib/serupa";
import { cocokCari } from "../lib/filterKerja";
import { waktuPengajuan } from "../lib/waktuPengajuan";
import { ambilSemuaEventStatus } from "../services/riwayatStatus";
import { useMuat } from "../hooks/useMuat";
import { teksNilai } from "../lib/mou";
import { EASE_KELUAR, pegas, pegasLembut } from "../lib/gerak";
import { TIPS_PENGAJU, acak, judulSambutan, kalimatPantau } from "../lib/kata";
import type { Kontrak } from "../lib/types";
import SambutanPengguna, { useSambutanPengguna } from "../components/SambutanPengguna";
import { ChipTtdRingkas, DaftarKabar, JalurAntrean, LegendaAntrean, LencanaRingkas, PelacakRingkas, keteranganTtd } from "../components/Antrean";
import { AngkaHidup, GlosariumStatus, Item, KerangkaHalaman, Kontainer, KotakError, Kosong, Segmen, Tombol, cx, useSorot } from "../components/ui";

type Saring = "Semua" | StatusRingkas;

export default function MonitoringSaya() {
  const { sesi } = useSesi();
  const { ke, ruang } = useRuang();
  const navigate = useNavigate();
  const { semua, error, loading, milik, antrean, kabar, tandaiDibaca, segarkan, terakhir } = usePantau();
  const [saring, setSaring] = useState<Saring>("Semua");
  const [cari, setCari] = useState("");
  const [menyegarkan, setMenyegarkan] = useState(false);
  const sorotHero = useSorot();
  // Riwayat status untuk perkiraan antrean. Gagal dimuat (mis. izin list) tidak boleh menggagalkan halaman:
  // kartu cukup tanpa perkiraan.
  const { data: riwayat } = useMuat(() => ambilSemuaEventStatus().catch((): EventStatus[] => []), []);

  const hitung = useMemo(() => {
    const per = { Antri: 0, Proses: 0, Selesai: 0 } as Record<StatusRingkas, number>;
    for (const k of milik) per[statusRingkas(k.status)]++;
    return { ...per, revisi: milik.filter((k) => k.status === "Perlu Revisi").length };
  }, [milik]);

  const namaSapaan = sesi.nama.split(" ")[0]!;
  const judulHero = useMemo(() => judulSambutan(namaSapaan), [namaSapaan]);
  const kalimat = useMemo(() => kalimatPantau(hitung.Antri, hitung.Proses, hitung.revisi), [hitung.Antri, hitung.Proses, hitung.revisi]);
  const tip = useMemo(() => acak(TIPS_PENGAJU), []);
  // Sambutan tiga langkah untuk pengguna baru; bisa ditutup dan diingat per akun di peramban ini.
  const sambutan = useSambutanPengguna(sesi.email);

  const tampil = useMemo(() => {
    // Yang butuh tindakan (revisi) lebih dulu, lalu yang masih berjalan, lalu yang selesai.
    const bobot = (k: Kontrak) => (k.status === "Perlu Revisi" ? 0 : statusRingkas(k.status) === "Selesai" ? 2 : 1);
    return milik
      .filter((k) => saring === "Semua" || statusRingkas(k.status) === saring)
      // Sama dengan pencarian Daftar Kontrak: judul, nomor, mitra, proyek, dan nomor PR/PO/SPK.
      .filter((k) => cocokCari(k, cari))
      .sort((a, b) => bobot(a) - bobot(b) || b.dibuat.localeCompare(a.dibuat));
  }, [milik, saring, cari]);

  if (loading && !semua) return <KerangkaHalaman baris={4} />;
  if (error && !semua) return <KotakError error={error} ulangi={() => void segarkan()} />;

  const milikAntri = milik.filter((k) => k.status === "Diajukan");
  const posisiTerdekat = milikAntri.map((k) => posisiAntrean(k, antrean)).filter((p): p is number => p != null).sort((a, b) => a - b)[0] ?? null;
  const ditangani = sedangDitangani(semua ?? []);
  const kabarBaru = kabar.filter((k) => !k.dibaca);
  const revisi = milik.filter((k) => k.status === "Perlu Revisi");

  const muatUlang = async () => {
    setMenyegarkan(true);
    try {
      await segarkan();
    } finally {
      setMenyegarkan(false);
    }
  };

  return (
    <Kontainer className="grid grid-cols-12 gap-4 lg:gap-5" jeda={0.06}>
      {/* Hero */}
      <Item className="col-span-12">
        <section onPointerMove={sorotHero} className="hero-bg sorot relative overflow-hidden rounded-[28px] p-5 text-hero-on shadow-pop sm:p-8 lg:p-9">
          <div className="titik-halus pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0 max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Ruang Pengguna
              </p>
              <h1 className="judul teks-panjang mt-3 text-4xl leading-[1.05] sm:text-5xl">{judulHero}</h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed opacity-90 sm:text-base">{kalimat}</p>
              <p className="mt-3 inline-flex max-w-xl items-start gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs leading-relaxed opacity-95">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <span>{tip}</span>
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Tombol className="!bg-none bg-accent !text-accent-on" ikon={<MessageSquarePlus className="h-4 w-4" />} onClick={() => navigate(ke.ajukan)}>
                  Ajukan kontrak
                </Tombol>
              </div>
            </div>
            <ul className="grid grid-cols-3 gap-2.5 sm:gap-3" aria-label="Ringkasan pengajuan Anda">
              {(
                [
                  { l: "Antri", n: hitung.Antri, ikon: Hourglass, warna: "from-amber-400 to-orange-500" },
                  { l: "Proses", n: hitung.Proses, ikon: Scale, warna: "from-sky-400 to-indigo-500" },
                  { l: "Selesai", n: hitung.Selesai, ikon: CheckCheck, warna: "from-emerald-400 to-teal-600" },
                ] as const
              ).map(({ l, n, ikon: Ikon, warna }, i) => (
                <motion.li key={l} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...pegasLembut, delay: 0.2 + i * 0.07 }}>
                  <button type="button" onClick={() => setSaring(saring === l ? "Semua" : l)} title={saring === l ? "Tekan lagi untuk menampilkan semua" : `Tampilkan yang ${l.toLowerCase()} saja`} className={cx("group w-full rounded-2xl border bg-white/10 p-3 text-left backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white/15 sm:p-4 lg:w-32", saring === l ? "border-white/60" : "border-white/15")} aria-pressed={saring === l}>
                    <span className={cx("grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg sm:h-9 sm:w-9", warna)}>
                      <Ikon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="mt-3 block text-3xl font-extrabold leading-none sm:text-4xl">
                      <AngkaHidup nilai={n} />
                    </span>
                    <span className="mt-1 block text-xs font-semibold opacity-85">{l}</span>
                  </button>
                </motion.li>
              ))}
            </ul>
          </div>
        </section>
      </Item>

      {/* Sambutan pengguna baru: hanya di Ruang Pengguna, selama belum ditutup dan belum ada pengajuan. */}
      <AnimatePresence initial={false}>
        {ruang === "pengguna" && sambutan.tampil && milik.length === 0 && (
          <Item key="sambutan" className="col-span-12">
            <SambutanPengguna nama={namaSapaan} onTutup={sambutan.tutup} />
          </Item>
        )}
      </AnimatePresence>

      {/* Gagal memperbarui, tetapi data lama masih ada: beri tahu, jangan dibiarkan diam. */}
      {error != null && semua && (
        <Item className="col-span-12">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger" role="status">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1">Belum bisa memperbarui data. Yang tampil di bawah mungkin belum yang terbaru.</p>
            <Tombol kecil varian="kedua" onClick={() => void muatUlang()}>
              Coba lagi
            </Tombol>
          </div>
        </Item>
      )}

      {/* Permintaan revisi: tindakan dari pengaju */}
      {revisi.length > 0 && (
        <Item className="col-span-12">
          <div className="flex flex-wrap items-center gap-4 rounded-[22px] border border-accent bg-accent-soft p-5 text-accent-ink">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent text-accent-on">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{revisi.length === 1 ? "Satu pengajuan menunggu revisi dari Anda" : `${revisi.length} pengajuan menunggu revisi dari Anda`}</p>
              <p className="line-clamp-2 break-words text-sm opacity-90" title={revisi.map((k) => k.judul).join(" · ")}>
                {revisi.map((k) => k.judul).join(" · ")}
              </p>
            </div>
            <Tombol className="w-full !bg-none bg-accent !text-accent-on sm:w-auto" onClick={() => navigate(ke.detail(revisi[0]!.id))}>
              {revisi.length === 1 ? "Lihat catatan Legal" : "Mulai dari yang pertama"}
            </Tombol>
          </div>
        </Item>
      )}

      {/* Antrean Legal */}
      <Item className={cx("col-span-12", kabarBaru.length > 0 && "xl:col-span-8")}>
        <section className="kartu h-full p-5 sm:p-6" aria-labelledby="judul-antrean">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="judul-antrean" className="text-lg font-bold">
                Antrean Legal
              </h2>
              <p className="text-sm text-muted" role="status" aria-atomic="true">
                {posisiTerdekat != null ? (
                  <>
                    Pengajuan Anda terdekat ada di <strong className="text-ink">urutan ke-{posisiTerdekat}</strong>. {teksPosisi(posisiTerdekat)}.
                  </>
                ) : antrean.length > 0 ? (
                  <>
                    Ada <strong className="text-ink">{antrean.length} pengajuan</strong> menunggu review. Pengajuan baru berprioritas normal masuk di urutan ke-{antrean.length + 1}.
                  </>
                ) : (
                  "Antrean kosong. Pengajuan baru akan langsung jadi urutan pertama."
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span title={terakhir ? formatWaktu(terakhir.toISOString()) : undefined}>{terakhir ? `Diperbarui ${formatRelatif(terakhir.toISOString())}` : "Memuat…"}</span>
              <motion.button whileTap={{ scale: 0.9 }} transition={pegas} onClick={() => void muatUlang()} className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label="Perbarui antrean">
                <RefreshCw className={cx("h-4 w-4", (menyegarkan || loading) && "animate-spin")} />
              </motion.button>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <JalurAntrean antrean={antrean} milik={milikAntri} ditangani={ditangani} />
            </div>
            <dl className="grid shrink-0 grid-cols-3 gap-2 lg:w-[19rem]">
              {[
                { label: "Antrean", nilai: antrean.length },
                { label: "Diproses", nilai: ditangani },
                { label: "Milik Anda", nilai: milikAntri.length },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl bg-raised px-3 py-2.5">
                  <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">{s.label}</dt>
                  <dd className="mt-0.5 text-2xl font-extrabold leading-none">
                    <AngkaHidup nilai={s.nilai} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <LegendaAntrean />
            <p className="text-xs text-muted">
              {ditangani > 0 ? `${ditangani} kontrak sedang ditangani Legal` : "Legal belum memegang kontrak lain"} · urut prioritas, lalu waktu pengajuan
            </p>
          </div>
        </section>
      </Item>

      {/* Kabar baru */}
      {kabarBaru.length > 0 && (
        <Item className="col-span-12 xl:col-span-4">
          <section className="kartu flex h-full flex-col overflow-hidden" aria-labelledby="judul-kabar">
            <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
              <h2 id="judul-kabar" className="flex items-center gap-2 font-bold">
                <BellRing className="h-4 w-4 text-accent" aria-hidden="true" /> Kabar baru
                <span className="angka rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">{kabarBaru.length}</span>
              </h2>
              <button type="button" onClick={tandaiDibaca} className="text-xs font-semibold text-brand transition-colors hover:text-brand-strong [@media(pointer:coarse)]:min-h-11">
                Tandai dibaca
              </button>
            </div>
            <DaftarKabar kabar={kabarBaru.slice(0, 5)} />
          </section>
        </Item>
      )}

      {/* Daftar pengajuan */}
      <Item className="col-span-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Pengajuan saya</h2>
            <p className="text-sm text-muted">{milik.length ? `${milik.length} pengajuan atas nama Anda` : "Belum ada pengajuan"}</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="relative flex-1 sm:w-56 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input type="search" enterKeyHint="search" autoComplete="off" autoCapitalize="off" spellCheck={false} className="input !py-2 !pl-9 [@media(pointer:coarse)]:min-h-11" placeholder="Cari judul, nomor, mitra…" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari pengajuan berdasarkan judul, nomor, mitra, atau proyek" />
            </label>
            <div className="max-w-full overflow-x-auto">
              <Segmen
                id="saring-pantau"
                label="Saring status"
                nilai={saring}
                onUbah={setSaring}
                pilihan={[
                  { nilai: "Semua", label: `Semua ${milik.length}` },
                  { nilai: "Antri", label: `Antri ${hitung.Antri}` },
                  { nilai: "Proses", label: `Proses ${hitung.Proses}` },
                  { nilai: "Selesai", label: `Selesai ${hitung.Selesai}` },
                ]}
              />
            </div>
          </div>
        </div>
      </Item>

      <Item className="col-span-12">
        {milik.length === 0 ? (
          <div className="kartu">
            <Kosong
              judul="Belum ada pengajuan"
              teks="Ajukan kontrak lewat chat. Setelah terkirim, posisinya di antrean Legal langsung terlihat di sini."
              ikon={<MessageSquarePlus className="h-6 w-6" />}
              aksi={
                <Tombol ikon={<MessageSquarePlus className="h-4 w-4" />} onClick={() => navigate(ke.ajukan)}>
                  Ajukan kontrak pertama
                </Tombol>
              }
            />
          </div>
        ) : tampil.length === 0 ? (
          <div className="kartu">
            <Kosong
              judul="Tidak ada yang cocok"
              teks={cari ? `Tidak ada pengajuan yang cocok dengan “${cari}”. Coba kata lain, atau hapus pencariannya.` : `Tidak ada pengajuan berstatus ${saring}. Coba lihat semua pengajuan.`}
              ikon={<Search className="h-6 w-6" />}
              aksi={
                <Tombol
                  varian="kedua"
                  onClick={() => {
                    setCari("");
                    setSaring("Semua");
                  }}
                >
                  Tampilkan semua
                </Tombol>
              }
            />
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3 4xl:grid-cols-4">
            <AnimatePresence initial={false}>
              {tampil.map((k, i) => (
                <motion.li key={k.id} layout="position" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }} transition={{ duration: 0.35, ease: EASE_KELUAR, delay: Math.min(i, 8) * 0.04 }} className="min-w-0">
                  <KartuPantau k={k} posisi={posisiAntrean(k, antrean)} riwayat={riwayat} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Item>
    </Kontainer>
  );
}

function KartuPantau({ k, posisi, riwayat }: { k: Kontrak; posisi: number | null; riwayat: EventStatus[] | null }) {
  const { sesi } = useSesi();
  const { ke } = useRuang();
  const sorot = useSorot();
  const revisi = k.status === "Perlu Revisi";
  const waktu = waktuPengajuan(k);
  const ttd = keteranganTtd(k);
  // Perkiraan hanya untuk yang masih antri, dan baru tampil setelah riwayat termuat.
  const perkiraan = useMemo(() => (posisi != null && riwayat ? perkiraanSelesaiAntrean(posisi, riwayat, Date.now()) : null), [posisi, riwayat]);
  const serupa = statusRingkas(k.status) === "Selesai" && bisaAjukanSerupa(k, sesi);
  return (
    <div onPointerMove={sorot} className={cx("kartu kartu-hover sorot group relative flex h-full flex-col overflow-hidden", revisi && "!border-accent")}>
      <Link to={ke.detail(k.id)} className="relative flex flex-1 flex-col gap-4 rounded-[inherit] p-5 pb-3">
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="break-all font-mono font-semibold">{k.nomorPengajuan}</span>
              <span aria-hidden="true">·</span>
              <span>{k.jenis}</span>
            </p>
            <p className="teks-panjang mt-1 line-clamp-2 font-bold leading-snug transition-colors group-hover:text-brand" title={k.judul}>
              {k.judul}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted" title={`${k.mitra || "-"} · ${teksNilai(k)}`}>
              {k.mitra || "-"} · {teksNilai(k)}
            </p>
          </div>
          <LencanaRingkas k={k} />
        </div>

        <div className="relative">
          <PelacakRingkas k={k} />
        </div>

        <div className={cx("relative rounded-2xl px-3.5 py-2.5 text-sm", revisi ? "bg-accent-soft text-accent-ink" : "bg-raised")}>
          {posisi != null ? (
            <>
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-sm font-extrabold text-brand-on">{posisi}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Urutan ke-{posisi} di antrean</span>
                  <span className="block text-xs text-muted">{teksPosisi(posisi)}</span>
                </span>
                {perkiraan?.hariMin != null && perkiraan.hariMaks != null && (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold text-ink" title="Perkiraan sampai review selesai">
                    {perkiraan.hariMin === perkiraan.hariMaks ? `±${perkiraan.hariMin}` : `${perkiraan.hariMin}-${perkiraan.hariMaks}`} hari kerja
                  </span>
                )}
              </div>
              {perkiraan && (
                <p className="mt-2 flex items-start gap-1.5 border-t border-line pt-2 text-xs leading-relaxed text-muted">
                  <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{perkiraan.teks}</span>
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                {revisi ? (
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : selesaiBerhasil(k.status) ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                ) : k.status === "Ditolak" ? (
                  <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                ) : ttd ? (
                  <Signature className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                ) : (
                  <Clock3 className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{keteranganRingkas(k)}</span>
                <ChipTtdRingkas k={k} className="shrink-0" />
              </div>
              {/* U21: langkah tanda tangan yang sedang ditunggu, supaya pengaju tidak perlu menelepon Legal. */}
              {ttd && <p className="mt-1.5 border-t border-line pt-1.5 text-xs leading-relaxed text-muted">{ttd}</p>}
            </>
          )}
        </div>

        {/* U03A: kapan masuk, sejak kapan di tahap ini, dan umur pengajuan (bukan "Diperbarui", yang ikut berubah karena hal teknis). */}
        <div className="relative mt-auto space-y-0.5 text-xs text-muted">
          <p>
            Masuk{" "}
            <time dateTime={waktu.masuk} className="font-semibold text-ink">
              {formatMasuk(waktu.masuk)}
            </time>
          </p>
          {(waktu.teksTahap || waktu.teksUmur) && (
            <p className="flex items-start gap-1.5">
              <History className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{[waktu.teksTahap, waktu.teksUmur].filter(Boolean).join(" · ")}</span>
            </p>
          )}
        </div>
      </Link>

      <div className="relative flex flex-wrap items-center justify-end gap-x-3 gap-y-2 px-5 pb-4 text-xs">
        {serupa && (
          <Link
            to={ke.ajukanSerupa(k.id)}
            title="Mulai pengajuan baru dengan jenis, mitra, dan mata uang yang sama"
            className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-semibold text-muted transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand [@media(pointer:coarse)]:min-h-11"
          >
            <CopyPlus className="h-3.5 w-3.5" aria-hidden="true" /> Ajukan serupa
          </Link>
        )}
        {/* Arti status sebenarnya dan langkah berikutnya; di luar tautan kartu karena ikonnya sebuah tombol. */}
        <span className="inline-flex items-center gap-1 text-muted">
          {k.status}
          <GlosariumStatus status={k.status} />
        </span>
        <Link to={ke.detail(k.id)} tabIndex={-1} aria-hidden="true" className="inline-flex items-center gap-1 font-semibold text-brand">
          {revisi ? "Revisi" : "Detail"} <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
