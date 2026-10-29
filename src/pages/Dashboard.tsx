import { lazy, useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlarmClock, ArrowRight, CalendarX2, CheckCircle2, ChevronRight, Coins, Eye, FileCheck2, Hourglass, Inbox, Lightbulb, MessageSquarePlus, Repeat, Sparkles, Target } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { usePengaturan } from "../context/PengaturanContext";
import { useDaftarKontrak } from "../hooks/useDaftarKontrak";
import { adalahLegal, bisaAjukan, bisaLihat } from "../lib/alur";
import { formatMasuk, formatMasukRingkas, formatTanggal, formatUangRingkas, selisihHari, sisaHari } from "../lib/format";
import { addendumBedaMataUang, petaPerpanjanganDiproses } from "../lib/addendum";
import { antreanLegal, posisiAntrean } from "../lib/antrean";
import { teksNilai } from "../lib/mou";
import { EASE_KELUAR, pegas } from "../lib/gerak";
import { TIPS, acak, judulSambutan, kalimatTindakan } from "../lib/kata";
import { FILTER_KERJA_KOSONG, HARI_AKAN_BERAKHIR, PERIKSA_MATA_UANG, filterPreset, hitungPreset, kueriPreset, petaBerakhirEfektif, saringKerja, tulisFilterKerja, type FilterKerja, type KonteksKerja } from "../lib/filterKerja";
import { hariWib, kelompokMasa, type JendelaMasa } from "../lib/masa";
import { horizonPeringatan, levelSlaPengaturan } from "../lib/pengaturan";
import { susunPortofolio, teksNilaiMataUang } from "../lib/portofolio";
import { DAFTAR_STATUS, type Kontrak, type MataUang, type Status } from "../lib/types";
import KartuBeban from "../components/KartuBeban";
import { GrafikTunda } from "../components/GrafikTunda";
import { LencanaPerpanjangan } from "../components/LencanaDaftar";
import { RingkasanMasa } from "../components/PanelMasa";
import { AngkaHidup, Avatar, Item, KerangkaHalaman, Kontainer, KotakError, Kosong, GlosariumStatus, Lencana, LencanaStatus, Tombol, WARNA_STATUS_GRAFIK, cx, useSorot } from "../components/ui";

// Grafik (recharts) dimuat malas setelah KPI tampil: chunk "grafik" tidak ikut diunduh bersama halaman (U39).
const GrafikPengajuan = lazy(() => import("../components/GrafikDashboard").then((m) => ({ default: m.GrafikPengajuan })));
const DonatStatus = lazy(() => import("../components/GrafikDashboard").then((m) => ({ default: m.DonatStatus })));

const TAHAP_ALUR: Status[] = ["Diajukan", "Review Legal", "Perlu Revisi", "Proses Tanda Tangan", "Aktif"];

const SIMBOL_UANG: Record<MataUang, string> = { IDR: "Rp", USD: "US$", EUR: "€", SGD: "S$" };

/** Baris yang tampil di kartu daftar sebelum dipotong dengan tautan "Lihat semua". */
const MAKS_TINDAKAN = 6;
const MAKS_MASA = 4;
const MAKS_OTOMATIS = 3;

const NAMA_BULAN = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" });

/** Filter kerja kosong yang aman diubah (FILTER_KERJA_KOSONG dibekukan). */
const kosong = (): FilterKerja => ({ ...FILTER_KERJA_KOSONG, prioritas: [] });

function pengajuanPerBulan(kontrak: Kontrak[]) {
  const sekarang = new Date();
  const bulan = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(sekarang.getFullYear(), sekarang.getMonth() - (5 - i), 1);
    return { kunci: `${d.getFullYear()}-${d.getMonth()}`, nama: NAMA_BULAN.format(d), jumlah: 0 };
  });
  for (const k of kontrak) {
    const d = new Date(k.dibuat);
    const b = bulan.find((x) => x.kunci === `${d.getFullYear()}-${d.getMonth()}`);
    if (b) b.jumlah++;
  }
  return bulan;
}

const waktuMasuk = (k: Kontrak) => k.tanggalDiajukan ?? k.dibuat;

const uangRingkas = (n: number, m: MataUang) => `${SIMBOL_UANG[m]} ${formatUangRingkas(n)}`;

function Ubin({ label, nilai, total, ikon: Ikon, warna, keterangan, ke }: { label: string; nilai: number; total: number; ikon: typeof Inbox; warna: string; keterangan: string; ke: string }) {
  const sorot = useSorot();
  return (
    <Item className="min-w-0">
      <Link to={ke} onPointerMove={sorot} className="kartu kartu-hover sorot group relative block h-full overflow-hidden p-4 sm:p-5">
        <div className="relative flex items-center justify-between gap-2">
          <p className="min-w-0 text-sm font-semibold leading-tight text-muted">{label}</p>
          <motion.span whileHover={{ rotate: -8, scale: 1.1 }} transition={pegas} className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-lg", warna)}>
            <Ikon className="h-5 w-5" aria-hidden="true" />
          </motion.span>
        </div>
        <p className="relative mt-3 text-4xl font-extrabold leading-none tracking-tight sm:mt-4 sm:text-5xl xl:text-4xl 2xl:text-5xl">
          <AngkaHidup nilai={nilai} />
        </p>
        <p className="relative mt-2 text-xs text-muted">{keterangan}</p>
        <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-raised">
          <motion.div className={cx("h-full rounded-full", warna)} initial={{ width: 0 }} animate={{ width: `${total && nilai ? Math.max(4, Math.min(100, (nilai / total) * 100)) : 0}%` }} transition={{ duration: 0.9, ease: EASE_KELUAR, delay: 0.3 }} />
        </div>
      </Link>
    </Item>
  );
}

export default function Dashboard() {
  const { sesi } = useSesi();
  const { ke } = useRuang();
  const { pengaturan } = usePengaturan();
  const navigate = useNavigate();
  // Cache bersama (U39): kembali ke dashboard tidak mengunduh ulang list bila datanya masih segar.
  const { data, error, loading, muatUlang } = useDaftarKontrak();
  const sorotHero = useSorot();

  const legal = adalahLegal(sesi);
  // Pemantau hanya melihat dan tidak pernah punya antrean sendiri. Kalimat "tidak ada yang menunggu Anda"
  // akan menyesatkan, jadi untuknya kartu tindakan diganti antrean Legal.
  const pemantau = !legal;
  // Horizon "akan berakhir" mengikuti H terbesar di Pengaturan (bawaan 90 hari).
  const horizonAtur = horizonPeringatan(pengaturan);
  const horizon = horizonAtur > 0 ? horizonAtur : HARI_AKAN_BERAKHIR;

  const kontrak = useMemo(() => (data ?? []).filter((k) => bisaLihat(k, sesi)), [data, sesi]);

  // Konteks yang sama dengan Daftar Kontrak, supaya angka ubin sama dengan jumlah baris setelah diklik.
  const ctx = useMemo<KonteksKerja>(() => ({ sesi, semua: data ?? [], level: (k) => levelSlaPengaturan(k, pengaturan) }), [sesi, data, pengaturan]);
  const hitung = useMemo(() => hitungPreset(data ?? [], ctx), [data, ctx]);

  const ringkas = useMemo(() => {
    const semuaData = data ?? [];
    // Ubin dihitung dengan penyaring yang SAMA dengan daftar yang dibukanya (U01):
    //   "Sedang diproses" = ?tahap=proses, "Kontrak aktif" = ?status=Aktif&addendum=tanpa.
    const proses = saringKerja(semuaData, { ...kosong(), tahap: "proses" }, ctx);
    const aktif = saringKerja(semuaData, { ...kosong(), addendum: "tanpa" }, ctx).filter((k) => k.status === "Aktif");
    // Addendum melekat pada kontrak induknya: tidak dihitung sebagai kontrak aktif tersendiri.
    const addendumAktif = kontrak.filter((k) => k.status === "Aktif").length - aktif.length;
    // Antrean Legal memakai urutan yang sama dengan yang dilihat pengaju di Ruang Pengguna.
    const antrean = antreanLegal(semuaData);
    // Urutan kerja Legal (sama dengan ?urut=kerja di Daftar Kontrak): antrean dulu, lalu yang dipegang.
    const tindakan = saringKerja(semuaData, filterPreset("antrean-saya"), ctx);
    const efektif = petaBerakhirEfektif(semuaData);
    const tglAkhir = (k: Kontrak) => efektif.get(k.id) ?? k.tanggalBerakhir ?? "";
    const urutAkhir = (a: Kontrak, b: Kontrak) => tglAkhir(a).localeCompare(tglAkhir(b)) || a.id - b.id;
    // Dua kelompok terpisah: yang masih berlaku tetapi segera berakhir, dan yang sudah lewat tetapi masih Aktif.
    // "Akan berakhir" tidak memuat perpanjangan otomatis (U34); itu tampil di kelompok sendiri dengan batas keputusannya.
    const akanBerakhir = saringKerja(semuaData, { ...kosong(), berakhir: horizon }, ctx).sort(urutAkhir);
    const lewatMasa = saringKerja(semuaData, filterPreset("lewat-masa"), ctx).sort(urutAkhir);
    // Perpanjangan otomatis yang batas keputusannya (atau akhirnya) dekat. Yang sudah lewat masa berlaku
    // sudah tampil di kelompok "Lewat masa berlaku", jadi tidak diulang di sini.
    const otomatis = kelompokMasa(semuaData, hariWib(), horizon).otomatis.filter((j) => j.tahap !== "berakhir" && bisaLihat(j.kontrak, sesi));
    const perStatus = DAFTAR_STATUS.map((s) => ({ status: s, jumlah: kontrak.filter((k) => k.status === s).length }));
    // Nilai per mata uang, sudah memperhitungkan addendum; kontrak yang lewat masa berlaku dihitung terpisah.
    const portofolio = susunPortofolio(semuaData, Date.now());
    // Perlu Revisi menunggu pengaju, bukan kinerja Legal, jadi tidak dihitung lewat SLA.
    const slaLewat = proses.filter((k) => k.status !== "Perlu Revisi" && levelSlaPengaturan(k, pengaturan) === "lewat").length;
    // Lencana perpanjangan diproses (U05A) dan addendum bermata uang beda (U29A).
    const perpanjangan = petaPerpanjanganDiproses(semuaData);
    const bedaMataUang = addendumBedaMataUang(semuaData).filter((a) => bisaLihat(a, sesi));
    return { proses, tindakan, antrean, aktif, addendumAktif, akanBerakhir, lewatMasa, otomatis, tglAkhir, perStatus, portofolio, slaLewat, perpanjangan, bedaMataUang, perBulan: pengajuanPerBulan(kontrak) };
  }, [kontrak, data, ctx, horizon, pengaturan, sesi]);

  const jumlahTindakan = hitung["antrean-saya"];

  // Sapaan dan tips dipilih sekali per kunjungan, supaya tidak berganti sendiri saat data dimuat ulang.
  const namaSapaan = sesi.nama.split(" ")[0]!;
  const sambutan = useMemo(() => judulSambutan(namaSapaan), [namaSapaan]);
  const tip = useMemo(() => acak(TIPS), []);
  const kalimat = useMemo(() => kalimatTindakan(jumlahTindakan), [jumlahTindakan]);

  if (loading && !data) return <KerangkaHalaman />;
  if (error != null && !data) return <KotakError error={error} ulangi={() => void muatUlang()} />;

  const dataDonat = ringkas.perStatus.filter((s) => s.jumlah > 0);
  const total = kontrak.length;
  const tanggalHariIni = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date());
  const jumlahTahap = (s: Status) => ringkas.perStatus.find((x) => x.status === s)?.jumlah ?? 0;
  const maksTahap = Math.max(1, ...TAHAP_ALUR.map(jumlahTahap));

  // Tautan ubin: parameter yang sama dengan penghitung ubinnya.
  const keAkanBerakhir = `/kontrak${horizon === HARI_AKAN_BERAKHIR ? kueriPreset("akan-berakhir") : `?${tulisFilterKerja({ berakhir: horizon }).toString()}`}`;
  const keLewatMasa = `/kontrak${kueriPreset("lewat-masa")}`;
  const keLewatTarget = `/kontrak${kueriPreset("lewat-target")}`;
  const keProses = `/kontrak?${tulisFilterKerja({ tahap: "proses" }).toString()}`;
  const keAktif = `/kontrak?${tulisFilterKerja({ addendum: "tanpa" }, new URLSearchParams({ status: "Aktif" })).toString()}`;
  const keBerlaku = `/kontrak?${tulisFilterKerja({ berakhir: "berlaku" }).toString()}`;
  const kePeriksaMu = `/kontrak?${new URLSearchParams({ periksa: PERIKSA_MATA_UANG }).toString()}`;
  const keTindakan = pemantau ? `/kontrak?status=${encodeURIComponent("Diajukan")}` : `/kontrak${kueriPreset("antrean-saya")}`;
  const daftarTindakan = pemantau ? ringkas.antrean : ringkas.tindakan;
  const nTindakan = pemantau ? ringkas.antrean.length : jumlahTindakan;

  const komitmen = ringkas.portofolio.komitmen;
  const lewatNilai = ringkas.portofolio.lewatMasa;
  const nilaiUtama = komitmen.nilai[0] ?? null;
  const nilaiLain = komitmen.nilai.slice(1);
  const nLewat = hitung["lewat-masa"];
  const nAkan = ringkas.akanBerakhir.length;
  const nOtomatis = ringkas.otomatis.length;
  const nBedaMu = ringkas.bedaMataUang.length;
  const jendelaOtomatis = new Map(ringkas.otomatis.map((j) => [j.kontrak.id, j]));
  const lencanaPerpanjangan = (k: Kontrak) => <LencanaPerpanjangan addendum={ringkas.perpanjangan.get(k.id)} />;

  const teksHero = pemantau
    ? `Anda memantau seluruh kontrak dalam mode lihat saja. Saat ini ${ringkas.proses.length} kontrak sedang diproses dan ${ringkas.antrean.length} menunggu giliran review Legal.`
    : `${kalimat} Ringkasan seluruh kontrak yang masuk ke Legal.`;

  return (
    <Kontainer className="grid grid-cols-12 gap-4 lg:gap-5" jeda={0.06}>
      {/* Hero */}
      <Item className="col-span-12 min-w-0 lg:col-span-8">
        <section onPointerMove={sorotHero} className="hero-bg sorot relative h-full min-h-[240px] overflow-hidden rounded-[28px] p-5 text-hero-on shadow-pop sm:min-h-[270px] sm:p-9">
          <div className="titik-halus pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
          {/* Ornamen: tiga lembar kontrak yang melayang pelan */}
          <div className="pointer-events-none absolute -right-10 top-6 hidden h-64 w-64 xl:block" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="ambang absolute rounded-2xl border border-white/20 bg-white/10 p-3 shadow-2xl backdrop-blur-sm" style={{ width: 150, height: 190, right: i * 36, top: i * 18, transform: `rotate(${(i - 1) * 7}deg)`, animationDelay: `${i * 0.8}s`, opacity: 1 - i * 0.22 }}>
                <div className="mb-3 h-2 w-12 rounded-full bg-white/50" />
                {[80, 100, 70, 90, 60].map((w, j) => (
                  <div key={j} className="mb-2 h-1.5 rounded-full bg-white/25" style={{ width: `${w}%` }} />
                ))}
                {i === 0 && <FileCheck2 className="absolute bottom-3 right-3 h-8 w-8 text-accent" />}
              </div>
            ))}
          </div>

          <div className="relative flex h-full max-w-xl flex-col">
            <p className="text-sm font-medium opacity-80">{tanggalHariIni}</p>
            <h1 className="judul teks-panjang mt-2 text-4xl leading-[1.05] sm:text-5xl xl:text-6xl">{sambutan}</h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed opacity-90 sm:text-base">{teksHero}</p>
            <p className="mt-3 inline-flex max-w-md items-start gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs leading-relaxed opacity-95">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <span>{tip}</span>
            </p>
            <div className="mt-auto flex flex-wrap gap-3 pt-6">
              {bisaAjukan(sesi) && (
                <Tombol className="min-h-[44px] !bg-none bg-accent !text-accent-on" ikon={<MessageSquarePlus className="h-4 w-4" />} onClick={() => navigate(ke.ajukan)}>
                  Ajukan lewat chat
                </Tombol>
              )}
              {legal && jumlahTindakan > 0 && (
                <Tombol varian="kedua" className="min-h-[44px] !border-white/30 !bg-white/10 !text-white hover:!bg-white/20" ikon={<Inbox className="h-4 w-4" />} onClick={() => navigate(keTindakan)}>
                  Buka antrean saya ({jumlahTindakan})
                </Tombol>
              )}
              <Tombol varian="kedua" className="min-h-[44px] !border-white/30 !bg-white/10 !text-white hover:!bg-white/20" onClick={() => navigate("/kontrak")}>
                Lihat semua kontrak
              </Tombol>
            </div>
          </div>
        </section>
      </Item>

      {/* Nilai kontrak aktif, per mata uang. Yang lewat masa berlaku tampil sebagai baris terpisah (U05A). */}
      <Item className="col-span-12 min-w-0 lg:col-span-4">
        <section className="kartu relative flex h-full flex-col overflow-hidden p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" /> Nilai kontrak aktif
          </div>
          <p className="judul mt-2 text-4xl">
            {nilaiUtama ? (
              <>
                <span className="text-xl align-top text-muted">{SIMBOL_UANG[nilaiUtama.mataUang]} </span>
                <AngkaHidup nilai={nilaiUtama.total} format={(n) => formatUangRingkas(n)} />
              </>
            ) : (
              <span className="text-muted">-</span>
            )}
          </p>
          {nilaiLain.length > 0 && (
            <p className="mt-1 truncate text-sm font-semibold" title={teksNilaiMataUang(komitmen.nilai, uangRingkas)}>
              + {teksNilaiMataUang(nilaiLain, uangRingkas)}
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            <Link to={keBerlaku} className="inline-block py-2 font-semibold text-ink underline-offset-2 hover:underline">
              {komitmen.jumlahKontrak} kontrak masih berlaku
            </Link>{" "}
            · sudah termasuk addendum
            {komitmen.tanpaNilai > 0 && ` · ${komitmen.tanpaNilai} tanpa nilai`}
          </p>

          {lewatNilai.jumlahKontrak > 0 && (
            <Link to={keLewatMasa} className="group mt-3 flex min-h-[44px] items-center gap-2.5 rounded-xl bg-danger-soft px-3 py-2 text-xs text-danger transition-colors hover:brightness-95">
              <CalendarX2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Lewat masa berlaku · {lewatNilai.jumlahKontrak} kontrak</span>
                <span className="angka block truncate" title={lewatNilai.nilai.map((n) => uangRingkas(n.total, n.mataUang)).join(" · ")}>
                  {lewatNilai.nilai.length > 0 ? teksNilaiMataUang(lewatNilai.nilai, uangRingkas) : "Tanpa nilai"}
                  <span className="font-normal"> · tidak ikut dihitung di atas</span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          )}

          {nBedaMu > 0 && (
            <Link to={kePeriksaMu} className="group mt-2 flex min-h-[44px] items-center gap-2.5 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-ink transition-colors hover:brightness-95">
              <Coins className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{nBedaMu} addendum</span> bermata uang berbeda dari induknya, jadi nilainya tidak ikut dijumlahkan.
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          )}

          <div className="-mx-5 -mb-5 mt-auto h-28 pt-2 sm:-mx-6 sm:-mb-6" role="img" aria-label={`Grafik pengajuan per bulan: ${ringkas.perBulan.map((b) => `${b.nama} ${b.jumlah}`).join(", ")}`}>
            <GrafikTunda className="!rounded-none opacity-60">
              <GrafikPengajuan data={ringkas.perBulan} />
            </GrafikTunda>
          </div>
        </section>
      </Item>

      {/* KPI: setiap ubin membuka daftar dengan filter yang angkanya sama */}
      <div className="col-span-12 grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-3 lg:gap-5 xl:grid-cols-6">
        {pemantau ? (
          <Ubin ke={keTindakan} label="Antrean Legal" nilai={ringkas.antrean.length} total={Math.max(total, 1)} ikon={Inbox} warna="bg-gradient-to-br from-amber-400 to-orange-500" keterangan="Pengajuan menunggu giliran review" />
        ) : (
          <Ubin ke={keTindakan} label="Butuh tindakan Anda" nilai={jumlahTindakan} total={Math.max(total, 1)} ikon={Inbox} warna="bg-gradient-to-br from-amber-400 to-orange-500" keterangan="Pengajuan baru & review yang Anda pegang" />
        )}
        <Ubin ke={keProses} label="Sedang diproses" nilai={ringkas.proses.length} total={Math.max(total, 1)} ikon={Hourglass} warna="bg-gradient-to-br from-sky-400 to-indigo-500" keterangan={ringkas.slaLewat > 0 ? `Diajukan sampai tanda tangan · ${ringkas.slaLewat} lewat SLA` : "Diajukan sampai tanda tangan"} />
        <Ubin ke={keLewatTarget} label="Lewat target" nilai={hitung["lewat-target"]} total={Math.max(ringkas.proses.length, 1)} ikon={Target} warna="bg-gradient-to-br from-fuchsia-500 to-purple-600" keterangan="Melewati target selesai dari pengaju" />
        <Ubin ke={keAktif} label="Kontrak aktif" nilai={ringkas.aktif.length} total={Math.max(total, 1)} ikon={CheckCircle2} warna="bg-gradient-to-br from-emerald-400 to-teal-600" keterangan={ringkas.addendumAktif > 0 ? `Ditambah ${ringkas.addendumAktif} addendum berlaku` : "Sudah ditandatangani"} />
        <Ubin ke={keAkanBerakhir} label="Akan berakhir" nilai={nAkan} total={Math.max(ringkas.aktif.length, 1)} ikon={AlarmClock} warna="bg-gradient-to-br from-amber-500 to-rose-500" keterangan={nOtomatis > 0 ? `Dalam ${horizon} hari · ${nOtomatis} diperpanjang otomatis dipisah` : `Dalam ${horizon} hari ke depan`} />
        <Ubin ke={keLewatMasa} label="Lewat masa berlaku" nilai={nLewat} total={Math.max(ringkas.aktif.length, 1)} ikon={CalendarX2} warna="bg-gradient-to-br from-rose-500 to-red-700" keterangan="Masih Aktif, perlu ditutup atau diperpanjang" />
      </div>

      {/* Pipeline */}
      <Item className="col-span-12 min-w-0 lg:col-span-8">
        <section className="kartu h-full p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Alur kontrak</h2>
              <p className="text-sm text-muted">Posisi kontrak di setiap tahap. Ketuk salah satu untuk melihat daftarnya.</p>
            </div>
          </div>
          <ol className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {TAHAP_ALUR.map((s, i) => {
              const n = jumlahTahap(s);
              return (
                <li key={s} className="relative min-w-0">
                  <Link to={`/kontrak?status=${encodeURIComponent(s)}`} className="group block rounded-2xl border border-line bg-raised p-4 transition-all duration-200 hover:-translate-y-1 hover:border-brand hover:bg-surface hover:shadow-card">
                    <span className="flex items-start gap-2 text-[11px] font-semibold uppercase leading-tight tracking-wide text-muted">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] text-white" style={{ background: WARNA_STATUS_GRAFIK[s] }}>
                        {i + 1}
                      </span>
                      <span className="min-w-0 break-words">{s}</span>
                    </span>
                    <span className="mt-3 block text-3xl font-extrabold leading-none">
                      <AngkaHidup nilai={n} />
                    </span>
                    <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-line">
                      <motion.span className="block h-full rounded-full" style={{ background: WARNA_STATUS_GRAFIK[s] }} initial={{ width: 0 }} animate={{ width: `${n ? Math.max(8, (n / maksTahap) * 100) : 0}%` }} transition={{ duration: 0.9, ease: EASE_KELUAR, delay: 0.35 + i * 0.08 }} />
                    </span>
                  </Link>
                  {i < TAHAP_ALUR.length - 1 && <ChevronRight className="absolute -right-3 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-muted lg:block" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </section>
      </Item>

      {/* Donut */}
      <Item className="col-span-12 min-w-0 lg:col-span-4">
        <section className="kartu h-full p-5 sm:p-6">
          <h2 className="text-lg font-bold">Komposisi status</h2>
          {total === 0 ? (
            <Kosong judul="Belum ada data" teks="Grafik muncul setelah ada kontrak yang diajukan." />
          ) : (
            <div className="mt-3 flex flex-col items-center gap-4 min-[400px]:flex-row">
              <div className="relative h-40 w-40 shrink-0" aria-hidden="true">
                <GrafikTunda className="rounded-full">
                  <DonatStatus data={dataDonat} warna={WARNA_STATUS_GRAFIK} />
                </GrafikTunda>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-3xl font-extrabold leading-none">
                      <AngkaHidup nilai={total} />
                    </p>
                    <p className="text-[11px] text-muted">kontrak</p>
                  </div>
                </div>
              </div>
              <ul className="w-full min-w-0 space-y-1 min-[400px]:w-auto min-[400px]:flex-1">
                {dataDonat.map(({ status, jumlah }) => (
                  <li key={status} className="flex items-center gap-1">
                    <Link to={`/kontrak?status=${encodeURIComponent(status)}`} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-xs transition-colors hover:bg-raised sm:min-h-[32px]">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: WARNA_STATUS_GRAFIK[status] }} aria-hidden="true" />
                      <span className="flex-1 truncate text-muted">{status}</span>
                      <span className="angka font-bold">{jumlah}</span>
                    </Link>
                    {/* Ikon "?" di luar tautan: ia sendiri sebuah tombol. */}
                    <GlosariumStatus status={status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </Item>

      {/* Butuh tindakan (Legal/Admin) atau antrean Legal (Pemantau) */}
      <Item className="col-span-12 min-w-0 lg:col-span-7">
        <section className="kartu flex h-full flex-col overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-2 px-5 pb-3 pt-5 sm:px-6">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                {pemantau && <Eye className="h-4 w-4 text-muted" aria-hidden="true" />}
                {pemantau ? "Antrean Legal" : "Butuh tindakan Anda"}
              </h2>
              <p className="text-sm text-muted">{pemantau ? "Urut prioritas, lalu waktu pengajuan. Anda hanya memantau." : "Urutan kerja: antrean dulu, lalu review dan tanda tangan yang Anda pegang."}</p>
            </div>
            <Link to={keTindakan} className="garis-tumbuh inline-flex min-h-[44px] shrink-0 items-center gap-1 text-sm font-semibold text-brand">
              Lihat semua ({nTindakan}) <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          {daftarTindakan.length === 0 ? (
            <Kosong judul="Tidak ada yang menunggu" teks={pemantau ? "Antrean Legal sedang kosong." : "Semua kontrak yang perlu Anda tangani sudah beres."} />
          ) : (
            <>
              <DaftarRingkas
                kontrak={daftarTindakan.slice(0, MAKS_TINDAKAN)}
                tampilMasuk
                kanan={(k) => {
                  const p = posisiAntrean(k, ringkas.antrean);
                  return p != null ? <span className="whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-ink">Antrean #{p}</span> : <LencanaStatus status={k.status} />;
                }}
              />
              {daftarTindakan.length > MAKS_TINDAKAN && (
                <Link to={keTindakan} className="mx-2 mb-3 mt-auto flex min-h-[44px] items-center justify-center gap-1 rounded-2xl bg-raised px-4 py-2.5 text-sm font-semibold text-brand transition-colors hover:bg-brand-soft">
                  {daftarTindakan.length - MAKS_TINDAKAN} lainnya menunggu · Lihat semua ({nTindakan}) <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
            </>
          )}
        </section>
      </Item>

      {/* Masa berlaku: lewat masa, akan berakhir, dan diperpanjang otomatis dipisah */}
      <Item className="col-span-12 min-w-0 lg:col-span-5">
        <section className="kartu flex h-full flex-col overflow-hidden">
          <div className="px-5 pb-3 pt-5 sm:px-6">
            <h2 className="text-lg font-bold">Masa berlaku</h2>
            <p className="text-sm text-muted">Siapkan perpanjangan, addendum, atau penutupan kontrak.</p>
          </div>

          {nLewat > 0 && (
            <div className="mx-2 mb-2 rounded-2xl border border-danger bg-danger-soft">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2">
                <p className="flex items-center gap-2 text-sm font-bold text-danger">
                  <CalendarX2 className="h-4 w-4" aria-hidden="true" /> Lewat masa berlaku
                </p>
                <Link to={keLewatMasa} className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-danger hover:underline">
                  Lihat semua ({nLewat}) <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
              <DaftarRingkas kontrak={ringkas.lewatMasa.slice(0, 3)} kanan={(k) => <KananMasa tgl={ringkas.tglAkhir(k)} otomatis={k.perpanjanganOtomatis} />} tambahan={lencanaPerpanjangan} />
            </div>
          )}

          <JudulKelompok ikon={<AlarmClock className="h-4 w-4" aria-hidden="true" />} judul={`Berakhir dalam ${horizon} hari`} tautan={nAkan > 0 ? { ke: keAkanBerakhir, label: `Lihat semua (${nAkan})` } : undefined} />
          {nAkan === 0 ? (
            <Kosong judul="Aman" teks={`Tidak ada kontrak aktif yang berakhir dalam ${horizon} hari.`} ikon={<CheckCircle2 className="h-6 w-6" />} />
          ) : (
            <DaftarRingkas kontrak={ringkas.akanBerakhir.slice(0, MAKS_MASA)} kanan={(k) => <KananMasa tgl={ringkas.tglAkhir(k)} otomatis={k.perpanjanganOtomatis} />} tambahan={lencanaPerpanjangan} />
          )}

          {/* U34: perpanjangan otomatis tidak "berakhir"; yang perlu diputuskan adalah batas pemberitahuannya. */}
          {nOtomatis > 0 && (
            <div className="border-t border-line pt-1">
              <JudulKelompok ikon={<Repeat className="h-4 w-4" aria-hidden="true" />} judul="Diperpanjang otomatis" sub="Putuskan sebelum batas pemberitahuan" />
              <DaftarRingkas kontrak={ringkas.otomatis.slice(0, MAKS_OTOMATIS).map((j) => j.kontrak)} kanan={(k) => <KananBatas j={jendelaOtomatis.get(k.id)!} />} tambahan={lencanaPerpanjangan} />
              {nOtomatis > MAKS_OTOMATIS && <p className="px-5 pb-4 text-xs text-muted sm:px-6">dan {nOtomatis - MAKS_OTOMATIS} lainnya di kartu Batas keputusan.</p>}
            </div>
          )}
        </section>
      </Item>

      {/* Batas keputusan: perpanjangan otomatis terpisah dari yang akan berakhir */}
      <Item className={cx("col-span-12 min-w-0", legal && "lg:col-span-8")}>
        <RingkasanMasa semua={data ?? []} />
      </Item>

      {/* Beban tim Legal: hanya untuk Legal/Admin */}
      {legal && (
        <Item className="col-span-12 min-w-0 lg:col-span-4">
          <KartuBeban semua={data ?? undefined} onBerubah={muatUlang} className="h-full" />
        </Item>
      )}

      {/* Alternatif tabel untuk pembaca layar: grafik saja tidak cukup (WCAG). */}
      <table className="sr-only">
        <caption>Jumlah kontrak per status</caption>
        <thead>
          <tr>
            <th>Status</th>
            <th>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {ringkas.perStatus.map((s) => (
            <tr key={s.status}>
              <td>{s.status}</td>
              <td>{s.jumlah}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Kontainer>
  );
}

function JudulKelompok({ ikon, judul, sub, tautan }: { ikon: ReactNode; judul: string; sub?: string; tautan?: { ke: string; label: string } }) {
  return (
    <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-2 px-5 pt-1 sm:px-6">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {ikon} {judul}
        {sub && <span className="font-normal normal-case tracking-normal">· {sub}</span>}
      </p>
      {tautan && (
        <Link to={tautan.ke} className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-brand hover:underline">
          {tautan.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function KananMasa({ tgl, otomatis }: { tgl: string; otomatis: boolean }) {
  if (!tgl) return null;
  const n = selisihHari(tgl);
  return (
    <div className="shrink-0 text-right">
      <Lencana nada={n < 0 ? "bahaya" : n <= 30 ? "peringatan" : "netral"}>{sisaHari(tgl)}</Lencana>
      <p className="mt-1 flex items-center justify-end gap-1 text-xs text-muted">
        {otomatis && <Repeat className="h-3 w-3" aria-label="Diperpanjang otomatis" />}
        {formatTanggal(tgl)}
      </p>
    </div>
  );
}

/** Batas keputusan perpanjangan otomatis (lib/masa). Tanpa masa pemberitahuan, yang tampil tanggal berakhirnya. */
function KananBatas({ j }: { j: JendelaMasa }) {
  if (!j.batas || j.sisaBatas == null) {
    return (
      <div className="shrink-0 text-right">
        <Lencana nada="peringatan">Klausul belum diisi</Lencana>
        <p className="mt-1 text-xs text-muted">Berakhir {formatTanggal(j.akhir)}</p>
      </div>
    );
  }
  const n = j.sisaBatas;
  const teks = n < 0 ? `batas lewat ${-n} hari` : n === 0 ? "batas hari ini" : `batas ${n} hari lagi`;
  return (
    <div className="shrink-0 text-right">
      <Lencana nada={n <= 14 ? "bahaya" : "peringatan"}>{teks}</Lencana>
      <p className="mt-1 text-xs text-muted">Beri tahu sebelum {formatTanggal(j.batas)}</p>
    </div>
  );
}

function DaftarRingkas({ kontrak, kanan, tambahan, tampilMasuk }: { kontrak: Kontrak[]; kanan: (k: Kontrak) => ReactNode; tambahan?: (k: Kontrak) => ReactNode; tampilMasuk?: boolean }) {
  const { ke } = useRuang();
  return (
    <ul className="px-2 pb-2">
      {kontrak.map((k, i) => (
        <motion.li key={k.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.05, duration: 0.35, ease: EASE_KELUAR }}>
          <Link to={ke.detail(k.id)} className="group flex items-center gap-3.5 rounded-2xl px-4 py-3 transition-colors hover:bg-raised">
            <Avatar nama={k.pengajuNama || k.mitra || "?"} ukuran={40} className="hidden min-[360px]:grid" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold transition-colors group-hover:text-brand">{k.judul}</p>
              <p className="truncate text-xs text-muted">
                <span className="font-mono">{k.nomorPengajuan}</span> · {k.mitra || "-"} · {teksNilai(k)}
              </p>
              {tampilMasuk && (
                <p className="truncate text-xs text-muted">
                  Masuk{" "}
                  <time dateTime={waktuMasuk(k)} title={formatMasuk(waktuMasuk(k))}>
                    {formatMasukRingkas(waktuMasuk(k))} WIB
                  </time>
                </p>
              )}
              {tambahan && <div className="mt-1 flex flex-wrap gap-1 empty:hidden">{tambahan(k)}</div>}
            </div>
            {kanan(k)}
            <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-1 sm:block" aria-hidden="true" />
          </Link>
        </motion.li>
      ))}
    </ul>
  );
}
