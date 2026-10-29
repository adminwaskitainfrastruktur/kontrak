import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRightLeft,
  BadgeCheck,
  Archive,
  BellRing,
  CalendarClock,
  CalendarPlus,
  Check,
  Clock,
  CopyPlus,
  Download,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  GitBranchPlus,
  Handshake,
  History,
  Layers,
  MessageSquare,
  Paperclip,
  Pencil,
  PenLine,
  RefreshCw,
  Scale,
  Send,
  ShieldAlert,
  Upload,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { usePengaturan } from "../context/PengaturanContext";
import { useMuat } from "../hooks/useMuat";
import { GalatKonflik, GalatNomorGanda, LABEL_MODE_BERAKHIR, ambilKontrak, ambilSemuaKontrak, jalankanAksi, kosongkanCacheKontrak, simpanChecklistTtd } from "../services/kontrak";
import { ambilAktivitas } from "../services/aktivitas";
import { ambilMasukan } from "../services/masukan";
import { rentangTungguMasukan, type PermintaanMasukan } from "../lib/masukan";
import { ambilDokumen, sidikDraftFinal, simpanKontrakFinal, unggahRedline, type HasilRedline } from "../services/dokumen";
import { bacaHasilReview, bacaLembar, type BacaanLembar } from "../services/lembarReview";
import {
  adalahBerkasLembar,
  bolehCatatPersetujuanLembar,
  bolehLihatLembar,
  bolehUbahLembar,
  poinRevisiDariTemuan,
  putaranFinalTerakhir,
  putaranTerakhir,
  ringkasLembarUntukCatatan,
  tampilkanHasilUntukPengaju,
  tampilkanPanelLembar,
  type LembarReview,
} from "../lib/lembarReview";
import { URL_LIBRARY_BERKAS } from "../config";
import {
  TAHAP,
  adalahLegal,
  aksiPemulihan,
  aksiTersedia,
  bisaAjukanAddendum,
  bisaLihat,
  bisaUbah,
  bisaUbahSebagaiPengaju,
  bisaUnggah,
  indeksTahap,
  type AksiStatus,
} from "../lib/alur";
import { waktuPengajuan } from "../lib/waktuPengajuan";
import { bacaNilai, formatMasuk, formatMasukRingkas, formatRelatif, formatTanggal, formatUang, formatWaktu, hariIni, keYmd, lamaSejak, selisihHari, sisaHari } from "../lib/format";
import { GraphError, pesanError } from "../lib/graph";
import { umpanBalik } from "../lib/umpanBalik";
import { adalahAddendum, ringkasAddendum, type RingkasanAddendum } from "../lib/addendum";
import { adalahMou, teksNilai } from "../lib/mou";
import { adalahPayung, turunanPayung } from "../lib/plafon";
import { panelJaminanRelevan } from "../lib/jaminan";
import { horizonPeringatan } from "../lib/pengaturan";
import {
  checklistReviewKontrak,
  kekuranganDokumen,
  peringatanDokumenSebelumTtd,
  ringkasSebelumTtd,
  syaratDokumen,
  tampilkanChecklistReview,
  tampilkanPanelSyarat,
  teksMohonLengkapi,
  bolehUbahChecklistReview,
  urlTemplatLegal,
} from "../lib/syarat";
import { aturCaraTtd, aturDraftFinal, bolehUbahTtd, labelCaraTtd, tampilkanPanelTtd, tanggalTtdTerakhir, teksDraftFinal } from "../lib/ttd";
import { TEMPLAT_POIN, tambahPoin } from "../lib/revisi";
import { PESAN_NOMOR_GANDA, adalahGalatNomorUnik, peringatanFormatNomor, usulanNomorKontrak } from "../lib/penomoran";
import { sepadanEkstensi, teksUkuran, validasiBerkas } from "../lib/jenisBerkas";
import { bisaAjukanSerupa } from "../lib/serupa";
import { bolehLihatJejak } from "../lib/jejakAudit";
import { alamatDaftarTerakhir } from "../lib/filterKerja";
import { opsiIcsBerakhir, unduhIcs } from "../lib/ics";
import { urlKontrak } from "../lib/emailKit";
import { MODE_BERAKHIR, type Aktivitas, type CaraTtd, type DetailPerubahan, type Dokumen, type JenisAktivitas, type Kontrak, type KontrakInput, type ModeBerakhir, type Ymd } from "../lib/types";
import { EASE_KELUAR, pegas } from "../lib/gerak";
import { antreanLegal, keteranganRingkas, posisiAntrean, sedangDitangani, teksPosisi } from "../lib/antrean";
import { useRuang } from "../context/RuangContext";
import { JalurAntrean, LencanaRingkas, PelacakRingkas } from "../components/Antrean";
import KartuRevisi from "../components/KartuRevisi";
import PanelSyarat from "../components/PanelSyarat";
import ChecklistReviewPanel, { PeringatanReview } from "../components/ChecklistReviewPanel";
import PanelLembarReview, { PeringatanLembarTtd } from "../components/PanelLembarReview";
import KartuHasilReview from "../components/KartuHasilReview";
import PanelTtd, { PilihCaraTtd } from "../components/PanelTtd";
import PanelTandaTangan from "../components/PanelTandaTangan";
import PanelDokumenBaru, { TombolArsip } from "../components/PanelDokumenBaru";
import UnggahAktivasi, { type BerkasFinal } from "../components/UnggahAktivasi";
import { PanelJaminan, PeringatanAktivasiJaminan } from "../components/PanelJaminan";
import { PanelKewajiban, tautanAman } from "../components/PanelKewajiban";
import { BarPlafon, PanelMasa, panelMasaRelevan } from "../components/PanelMasa";
import { PanelPihak, PanelRiwayatMitra } from "../components/PanelPihak";
import { PanelDraf } from "../components/PanelDraf";
import KotakDiskusi, { TeksDiskusi } from "../components/KotakDiskusi";
import TugaskanPic from "../components/TugaskanPic";
import AmbilPicDariTautan from "../components/AmbilPicDariTautan";
import { LencanaModeBerakhir } from "../components/LencanaDaftar";
import PanelKasus from "../components/PanelKasus";
import PanelKelolaKontrak from "../components/PanelKelolaKontrak";
import TombolSenyap from "../components/TombolSenyap";
import PanelMasukan from "../components/PanelMasukan";
import PanelPersetujuan, { RujukanKewenangan } from "../components/PanelPersetujuan";
import { daftarPersetujuan, teksPersetujuan } from "../lib/kewenangan";
import LencanaSla from "../components/LencanaSla";
import { AksiModal, Isian, Item, KerangkaHalaman, Kontainer, KotakError, Kosong, Lencana, LencanaStatus, Memuat, Modal, Tombol, cx } from "../components/ui";

/** Rujukan tetap untuk "belum ada data", supaya komponen anak yang memakai `semua` sebagai dependensi tidak memuat ulang terus. */
const TANPA_KONTRAK: Kontrak[] = [];

/** Kelas tombol sekunder di atas latar hero yang gelap. */
const TOMBOL_HERO = "!border-white/30 !bg-white/10 !text-white hover:!bg-white/20";

/** Status yang tidak lagi diproses Legal. */
const STATUS_SELESAI: readonly Kontrak["status"][] = ["Aktif", "Berakhir", "Ditolak", "Dibatalkan"];

/** "3 hari lalu", atau "baru saja". */
function teksLalu(iso: string | null | undefined): string {
  const l = lamaSejak(iso);
  return l === "baru saja" || l === "-" ? l : `${l} lalu`;
}

interface AksiTerbuka {
  aksi: AksiStatus;
  catatanAwal?: string;
  /** Pembeda supaya modal yang dibuka ulang mulai dari keadaan bersih. */
  kunci: number;
}

export default function DetailKontrak() {
  const id = Number(useParams().id);
  const { sesi } = useSesi();
  const { ruang, ke } = useRuang();
  const { pengaturan } = usePengaturan();
  const lokasi = useLocation();
  const navigasi = useNavigate();
  const stateLokasi = lokasi.state as { peringatan?: string; sorotRevisi?: boolean } | null;
  const peringatan = stateLokasi?.peringatan;

  const kontrakQ = useMuat(() => ambilKontrak(id), [id]);
  const aktivitasQ = useMuat(() => ambilAktivitas(id), [id]);
  const k = kontrakQ.data;
  const semuaQ = useMuat(ambilSemuaKontrak, []);
  // Lembar Hasil Review Legal dan salinannya adalah dokumen internal: hanya Ruang Admin (bukan Pengaju) yang memuat dan melihatnya.
  // Pengaju membaca ringkasan kecil HasilReview (kesimpulan dan catatan untuknya) lewat KartuHasilReview.
  const lihatLembar = bolehLihatLembar(sesi, ruang);
  const dokumenQ = useMuat(() => (k ? ambilDokumen(k.nomorPengajuan, { sertakanLembar: lihatLembar }) : Promise.resolve([])), [k?.nomorPengajuan, lihatLembar]);
  const lembarQ = useMuat<BacaanLembar>(() => (lihatLembar ? bacaLembar(id) : Promise.resolve({ lembar: null, kolomAda: true })), [id, lihatLembar]);
  const hasilQ = useMuat(() => (ruang === "pengguna" ? bacaHasilReview(id) : Promise.resolve(null)), [id, ruang]);
  // Permintaan masukan unit lain (K03): panel khusus Legal/Admin, dan masa tunggunya mengurangi umur tahap di lencana
  // SLA Ruang Admin (termasuk untuk Pemantau). Tidak dimuat di Ruang Pengguna; galat (mis. list belum dibuat) tidak
  // menggagalkan halaman.
  const pakaiMasukan = ruang === "admin" && sesi.peran !== "Pengaju";
  const masukanQ = useMuat(() => (pakaiMasukan ? ambilMasukan(id) : Promise.resolve([] as PermintaanMasukan[])), [id, pakaiMasukan]);
  const [aksiTerbuka, setAksiTerbuka] = useState<AksiTerbuka | null>(null);

  if (kontrakQ.loading && !k) return <KerangkaHalaman baris={3} />;
  if (kontrakQ.error || !k) return <KotakError error={kontrakQ.error ?? new Error("Kontrak tidak ditemukan.")} ulangi={kontrakQ.muatUlang} />;
  if (!bisaLihat(k, sesi)) {
    // Akun tanpa divisi hanya melihat pengajuannya sendiri, jadi "divisi lain" tidak tepat untuknya.
    const alasan = sesi.divisi == null ? "Kontrak ini bukan pengajuan Anda, jadi tidak bisa Anda buka." : "Kontrak ini milik divisi lain dan tidak bisa Anda lihat.";
    return (
      <div className="kartu">
        <Kosong
          judul="Kontrak ini tidak bisa Anda buka"
          teks={alasan}
          aksi={
            <Link to={ke.beranda} className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold hover:border-brand hover:bg-raised">
              {ruang === "admin" ? "Kembali ke Dashboard" : "Kembali ke Monitoring"}
            </Link>
          }
        />
      </div>
    );
  }

  const segarkan = async () => {
    await Promise.all([kontrakQ.muatUlang(), aktivitasQ.muatUlang(), semuaQ.muatUlang()]);
  };
  const segarkanDokumen = () => void Promise.all([dokumenQ.muatUlang(), aktivitasQ.muatUlang()]);

  const admin = ruang === "admin";
  const semua = semuaQ.data ?? TANPA_KONTRAK;
  // Selama daftar dokumen pertama kali dimuat, kirim null supaya panel menampilkan kerangka, bukan "0 dari N".
  // Panel lain (kelengkapan, revisi, aktivasi) tidak memuat salinan lembar; hanya PanelDokumenBaru dan arsip yang melihatnya (khusus Legal).
  const dokumen: Dokumen[] | null = dokumenQ.loading && !dokumenQ.data?.length ? null : (dokumenQ.data?.filter((d) => !adalahBerkasLembar(d)) ?? null);
  const ring = adalahAddendum(k) ? null : ringkasAddendum(k, semua);
  const induk = adalahAddendum(k) ? (semua.find((x) => x.id === k.kontrakIndukId) ?? null) : null;
  const mou = k.mouAcuanId != null ? (semua.find((x) => x.id === k.mouAcuanId) ?? null) : null;
  const turunan = adalahPayung(k) ? turunanPayung(k, semua) : null;
  const antrean = antreanLegal(semua);
  const horizon = horizonPeringatan(pengaturan);

  // Di Ruang Pengguna, Admin dan Legal melihat kontrak seperti pengaju: tanpa tombol pemrosesan Legal.
  // "Aktifkan Kembali" (Admin) kembali ke status sebelum ditutup bila tercatat di riwayat (U04).
  const statusSebelum = aktivitasQ.data?.find((a) => a.jenis === "Status" && a.statusKe === k.status)?.statusDari ?? null;
  const daftarAksi = [...aksiTersedia(k, sesi).filter((a) => admin || a.oleh === "pengaju"), ...(admin ? aksiPemulihan(k, sesi, statusSebelum) : [])];
  const bukaAksi = (idAksi: string, catatanAwal?: string) => {
    const aksi = daftarAksi.find((a) => a.id === idAksi);
    if (!aksi) return void toast.info("Langkah ini belum tersedia untuk Anda di status sekarang.");
    setAksiTerbuka({ aksi, catatanAwal, kunci: Date.now() });
  };
  const keDokumen = () => document.getElementById("panel-dokumen")?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Panel mana yang relevan untuk status dan ruang ini. Ruang Pengguna sengaja dibuat ringkas.
  const tampilChecklist = tampilkanChecklistReview(k) && (admin || k.status === "Review Legal" || k.status === "Proses Tanda Tangan");
  const tampilTtd = tampilkanPanelTtd(k) && (admin || k.status === "Proses Tanda Tangan");
  const tampilMasa = panelMasaRelevan(k) && (admin ? !["Diajukan", "Perlu Revisi"].includes(k.status) : k.status === "Aktif");
  const tampilJaminan = panelJaminanRelevan(k) && (admin ? k.status !== "Diajukan" : k.status === "Aktif");
  // Register kasus (K02): khusus Legal/Admin di Ruang Admin, tidak untuk Pemantau dan tidak pernah di Ruang Pengguna.
  const tampilKasus = admin && adalahLegal(sesi) && (k.status === "Aktif" || k.status === "Berakhir" || k.status === "Proses Tanda Tangan" || k.adaSengketa);
  // Masukan unit lain (K03): selama kontrak diproses, atau bila sudah pernah ada permintaan.
  const tampilMasukan = admin && adalahLegal(sesi) && (["Diajukan", "Review Legal", "Perlu Revisi", "Proses Tanda Tangan"].includes(k.status) || (masukanQ.data?.length ?? 0) > 0);
  const tunggu = rentangTungguMasukan(masukanQ.data ?? []);
  // Persetujuan internal dan rujukan kewenangan (K01): Ruang Admin saja. Legal/Admin mencatat selama kontrak belum
  // ditutup (atau bila sudah ada catatan); Pemantau hanya melihat catatan yang ada. Tidak pernah di Ruang Pengguna.
  const adaCatatanSetuju = daftarPersetujuan(k.persetujuan).length > 0;
  const bolehCatatSetuju = admin && adalahLegal(sesi);
  const tampilPersetujuan = admin && (adaCatatanSetuju || (bolehCatatSetuju && !["Ditolak", "Dibatalkan", "Berakhir"].includes(k.status)));
  // Lembar Hasil Review Legal: Ruang Admin saja (Legal/Admin mengisi, Pemantau hanya melihat), tidak pernah untuk Pengaju.
  const lembar: LembarReview | null = lembarQ.data?.lembar ?? null;
  const lembarSiap = lihatLembar && !!lembarQ.data && lembarQ.data.kolomAda;
  const tampilLembar = lihatLembar && tampilkanPanelLembar(k, lembar);
  const tampilHasilPengaju = !admin && tampilkanHasilUntukPengaju(hasilQ.data, k);

  return (
    <Kontainer jeda={0.07} className="space-y-5">
      <Item>
        <Link to={admin ? alamatDaftarTerakhir() : ke.beranda} className="group inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> {admin ? "Daftar kontrak" : "Monitoring"}
        </Link>
      </Item>

      {peringatan && (
        <Item>
          <p className="rounded-2xl bg-accent-soft px-5 py-3 text-sm text-accent-ink">{peringatan}</p>
        </Item>
      )}

      {k.diarsipkan && (
        <Item>
          <p role="status" className="flex items-start gap-2 rounded-2xl bg-raised px-5 py-3 text-sm text-muted">
            <Archive className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold text-ink">Kontrak ini diarsipkan.</span> Ia tidak tampil di daftar, dashboard, antrean, dan laporan. {admin ? "Pulihkan lewat panel Kelola kontrak di bawah." : ""}
            </span>
          </p>
        </Item>
      )}

      <Item>
        <Kepala k={k} antrean={antrean} ditangani={sedangDitangani(semua)} semua={semua} dokumen={dokumenQ.data ?? []} aksi={daftarAksi} onPilihAksi={(a) => bukaAksi(a.id)} onBerubah={segarkan} />
      </Item>

      {induk && (
        <Item>
          <KartuInduk k={k} induk={induk} />
        </Item>
      )}
      {mou && (
        <Item>
          <KartuMou mou={mou} />
        </Item>
      )}
      {ring && k.status === "Aktif" && ring.berakhirEfektif && selisihHari(ring.berakhirEfektif) <= horizon && (
        <Item>
          <BannerBerakhir k={k} berakhir={ring.berakhirEfektif} berjalan={ring.berjalan.length} />
        </Item>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Kolom kiri: data kontrak dan pekerjaan yang sedang berjalan. */}
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Item>
            <KartuRevisi kontrak={k} aktivitas={aktivitasQ.data} dokumen={dokumen} ruang={ruang} onKirimUlang={(catatan) => bukaAksi("kirim-ulang", catatan)} onUnggah={keDokumen} sorot={!!stateLokasi?.sorotRevisi} />
          </Item>
          {tampilHasilPengaju && (
            <Item>
              <KartuHasilReview hasil={hasilQ.data} k={k} />
            </Item>
          )}
          <Item>
            <InfoKontrak k={k} ring={ring} horizon={horizon} />
          </Item>
          {admin && (
            <Item>
              <PanelPihak k={k} semua={semuaQ.data} onBerubah={() => void segarkan()} />
            </Item>
          )}
          {tampilkanPanelSyarat(k) && (
            <Item>
              <PanelSyarat
                kontrak={k}
                dokumen={dokumen}
                bolehUnggah={bisaUnggah(k, sesi)}
                onUnggah={keDokumen}
                onMohonLengkapi={admin && adalahLegal(sesi) && k.status === "Review Legal" ? (teks) => bukaAksi("minta-revisi", teks) : undefined}
              />
            </Item>
          )}
          {(k.status === "Proses Tanda Tangan" || k.status === "Aktif" || k.status === "Berakhir") && (
            <Item>
              <PanelTandaTangan kontrak={k} />
            </Item>
          )}
          {tampilTtd && (
            <Item>
              <PanelTtd
                kontrak={k}
                bolehUbah={admin && bolehUbahTtd(k, sesi)}
                onBerubah={(baru) => {
                  kontrakQ.setData(baru);
                  void aktivitasQ.muatUlang();
                }}
              />
            </Item>
          )}
          {tampilPersetujuan && (
            <Item>
              <PanelPersetujuan
                k={k}
                induk={induk}
                semua={semua}
                bolehCatat={bolehCatatSetuju}
                onBerubah={(persetujuan) => kontrakQ.setData({ ...k, persetujuan })}
                onDokumenBerubah={segarkanDokumen}
              />
            </Item>
          )}
          {tampilChecklist && (
            <Item>
              <ChecklistReviewPanel kontrak={k} bolehUbah={admin && bolehUbahChecklistReview(k, sesi)} onBerubah={(c) => kontrakQ.setData({ ...k, checklistReview: c })} />
            </Item>
          )}
          {tampilLembar && (
            <Item>
              <PanelLembarReview
                k={k}
                induk={induk}
                dokumen={dokumen}
                aktivitas={aktivitasQ.data}
                q={lembarQ}
                bolehUbah={admin && bolehUbahLembar(k, sesi)}
                bolehPersetujuan={admin && bolehCatatPersetujuanLembar(k, sesi)}
                onMintaRevisi={(teks) => bukaAksi("minta-revisi", teks)}
                onBerubah={segarkanDokumen}
              />
            </Item>
          )}
          {tampilMasukan && (
            <Item>
              <PanelMasukan k={k} q={masukanQ} />
            </Item>
          )}
          <Item>
            <div id="panel-dokumen" className="scroll-mt-24">
              <PanelDokumenBaru k={k} q={dokumenQ} onDiunggah={segarkanDokumen} syarat={syaratDokumen(k.jenis).wajib.map((s) => s.jenis)} />
            </div>
          </Item>
          {admin && (
            <Item>
              <PanelDraf k={k} induk={induk} onBerubah={segarkanDokumen} />
            </Item>
          )}
          {k.status === "Aktif" && (
            <Item>
              <PanelKewajiban k={k} semua={semua} />
            </Item>
          )}
          {tampilMasa && (
            <Item>
              <PanelMasa k={k} semua={semua} onBerubah={segarkan} />
            </Item>
          )}
          {tampilJaminan && (
            <Item>
              <PanelJaminan k={k} semua={semua} />
            </Item>
          )}
          {tampilKasus && (
            <Item>
              <PanelKasus k={k} onFlagBerubah={() => void kontrakQ.muatUlang()} />
            </Item>
          )}
          {admin && (
            <Item>
              <PanelKelolaKontrak k={k} onBerubah={segarkan} onTerhapus={() => navigasi(alamatDaftarTerakhir(), { replace: true, state: { peringatan: "Kontrak dihapus permanen." } })} />
            </Item>
          )}
          {turunan && (
            <Item>
              <PanelTurunan k={k} turunan={turunan} semua={semua} />
            </Item>
          )}
          {ring && (
            <Item>
              <PanelAddendum k={k} ring={ring} />
            </Item>
          )}
        </div>

        {/* Kolom kanan: jejak waktu (SLA, riwayat dengan mitra, riwayat dan diskusi). */}
        <div className="min-w-0 space-y-5 self-start">
          {admin && (
            <Item>
              <LencanaSla k={k} varian="lengkap" tunggu={tunggu} />
            </Item>
          )}
          {admin && (
            <Item>
              <PanelRiwayatMitra k={k} semua={semuaQ.data} />
            </Item>
          )}
          <Item>
            <PanelRiwayat k={k} q={aktivitasQ} />
          </Item>
        </div>
      </div>

      {aksiTerbuka && (
        <ModalAksi
          key={aksiTerbuka.kunci}
          k={k}
          aksi={aksiTerbuka.aksi}
          catatanAwal={aksiTerbuka.catatanAwal}
          semua={semua}
          induk={induk}
          dokumen={dokumen}
          lembar={lembar}
          lembarSiap={lembarSiap}
          onDokumenBerubah={segarkanDokumen}
          onTutup={() => setAksiTerbuka(null)}
          onSelesai={async () => {
            setAksiTerbuka(null);
            await Promise.all([segarkan(), dokumenQ.muatUlang(), lihatLembar ? lembarQ.muatUlang() : Promise.resolve()]);
          }}
        />
      )}
      <AmbilPicDariTautan k={k} onBerubah={segarkan} />
    </Kontainer>
  );
}

// --- Kepala: judul, status, tahap, aksi ------------------------------------

function Kepala({
  k,
  antrean,
  ditangani,
  semua,
  dokumen,
  aksi,
  onPilihAksi,
  onBerubah,
}: {
  k: Kontrak;
  antrean: Kontrak[];
  ditangani: number;
  semua: Kontrak[];
  dokumen: readonly Dokumen[];
  aksi: AksiStatus[];
  onPilihAksi: (a: AksiStatus) => void;
  onBerubah: () => Promise<void>;
}) {
  const { sesi } = useSesi();
  const { ruang, ke } = useRuang();
  const navigate = useNavigate();
  const posisi = posisiAntrean(k, antrean);
  const ruangPengguna = ruang === "pengguna";
  const bolehUbah = ruangPengguna ? bisaUbahSebagaiPengaju(k, sesi) : bisaUbah(k, sesi);
  const bolehSerupa = bisaAjukanSerupa(k, sesi);
  const finalAman = !!k.kontrakFinal && tautanAman(k.kontrakFinal);
  const tahapAktif = indeksTahap(k.status);
  const berhenti = k.status === "Ditolak" || k.status === "Dibatalkan";
  const masuk = k.tanggalDiajukan ?? k.dibuat;

  const IKON_TAHAP = [Send, Scale, PenLine, BadgeCheck];
  const lebarIsi = berhenti || tahapAktif < 0 ? 0 : k.status === "Berakhir" ? 100 : (tahapAktif / (TAHAP.length - 1)) * 100;

  return (
    <div className="space-y-4">
      {/* Tanpa overflow-hidden di section supaya menu "Tugaskan ke" tidak terpotong; pola titik dibatasi wadahnya sendiri. */}
      <section className="hero-bg relative rounded-[28px] p-6 text-hero-on shadow-pop sm:p-8">
        <div className="titik-halus pointer-events-none absolute inset-0 rounded-[28px] opacity-40" aria-hidden="true" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/15 px-3 py-1 font-mono text-xs font-semibold">{k.nomorPengajuan}</span>
              {ruangPengguna ? (
                <LencanaRingkas k={k} />
              ) : (
                // Ikon "?" glosarium di atas latar hero yang gelap: warnanya disesuaikan supaya tetap terbaca.
                <span className="inline-flex [&_button:hover]:bg-white/15 [&_button:hover]:text-white [&_button]:text-white/80">
                  <LencanaStatus status={k.status} glosarium />
                </span>
              )}
              {!ruangPengguna && k.status === "Berakhir" && <LencanaModeBerakhir mode={k.modeBerakhir} />}
              {!ruangPengguna && k.adaSengketa && (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger" title="Ada kasus sengketa terbuka. Rinciannya di panel Kasus (khusus Legal).">
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Ada sengketa
                </span>
              )}
              {posisi != null && <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-on">Antrean #{posisi}</span>}
              {k.prioritas !== "Normal" && <Lencana nada={k.prioritas === "Mendesak" ? "bahaya" : "peringatan"}>{k.prioritas}</Lencana>}
              {!ruangPengguna && <LencanaSla k={k} />}
            </div>
            <h1 className="judul teks-panjang mt-4 text-2xl leading-tight sm:text-3xl lg:text-4xl">{k.judul}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm opacity-85">
              <span className="break-words">{k.mitra || "-"}</span>
              <span aria-hidden="true">·</span>
              <span>{k.jenis}</span>
              <span aria-hidden="true">·</span>
              <span>Divisi {k.divisi}</span>
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs opacity-80" title={formatMasuk(masuk)}>
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Masuk {formatMasukRingkas(masuk)} WIB · {teksLalu(masuk)}
              </span>
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            {aksi.length > 0 && (
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {aksi.map((a) => (
                  <Tombol key={a.id} varian={a.nada === "bahaya" ? "bahaya" : "utama"} className={a.nada === "utama" ? "!bg-none bg-accent !text-accent-on" : a.nada === "netral" ? "!bg-none !bg-white/15 !text-white !shadow-none" : ""} onClick={() => onPilihAksi(a)}>
                    {a.label}
                  </Tombol>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {!ruangPengguna && <TugaskanPic k={k} semua={semua} onBerubah={onBerubah} className={TOMBOL_HERO} />}
              {bolehUbah && (
                <Tombol kecil varian="kedua" className={TOMBOL_HERO} ikon={<Pencil className="h-4 w-4" />} onClick={() => navigate(ke.ubah(k.id))}>
                  Ubah
                </Tombol>
              )}
              <TombolSenyap k={k} className={TOMBOL_HERO} />
              {bolehSerupa && (
                <Tombol kecil varian="kedua" className={TOMBOL_HERO} ikon={<CopyPlus className="h-4 w-4" />} onClick={() => navigate(ke.ajukanSerupa(k.id))} title="Mulai pengajuan baru dengan jenis, mitra, dan divisi yang sama">
                  Ajukan serupa
                </Tombol>
              )}
              {finalAman && (
                <a href={k.kontrakFinal} target="_blank" rel="noreferrer" className={cx("inline-flex touch-manipulation items-center justify-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors [@media(pointer:coarse)]:min-h-11", TOMBOL_HERO)}>
                  <Download className="h-4 w-4" aria-hidden="true" /> Unduh kontrak final
                </a>
              )}
              {!ruangPengguna && dokumen.length > 0 && (
                <span className="contents [&_button:hover]:!bg-white/15 [&_button]:!text-white">
                  <TombolArsip k={k} dokumen={dokumen} />
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {ruangPengguna ? (
        <PanelStatusPengguna k={k} antrean={antrean} posisi={posisi} ditangani={ditangani} />
      ) : (
        <section className="kartu px-3 py-5 sm:px-10 sm:py-6" aria-label="Tahapan kontrak">
          <ol className="relative grid grid-cols-4">
            <div className="absolute left-[12.5%] right-[12.5%] top-5 h-1 rounded-full bg-line" aria-hidden="true">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-brand to-success" initial={{ width: 0 }} animate={{ width: `${lebarIsi}%` }} transition={{ duration: 1, ease: EASE_KELUAR, delay: 0.3 }} />
            </div>
            {TAHAP.map((t, i) => {
              const selesai = !berhenti && (i < tahapAktif || k.status === "Berakhir");
              const kini = !berhenti && i === tahapAktif && k.status !== "Berakhir";
              const Ikon = IKON_TAHAP[i]!;
              return (
                <li key={t.label} className="relative flex flex-col items-center text-center">
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ ...pegas, delay: 0.15 + i * 0.1 }}
                    className={cx("relative z-10 grid h-10 w-10 place-items-center rounded-full border-2 border-surface shadow-card", selesai ? "bg-brand text-brand-on" : kini ? "denyut bg-accent text-accent-on" : "bg-raised text-muted")}
                  >
                    {selesai ? <Check className="h-5 w-5" /> : <Ikon className="h-[18px] w-[18px]" />}
                  </motion.span>
                  <p className={cx("mt-2.5 text-[11px] font-semibold leading-tight sm:text-sm", selesai || kini ? "text-ink" : "text-muted")}>{t.label}</p>
                </li>
              );
            })}
          </ol>
          {berhenti && <p className="mt-4 text-center text-sm text-muted">Pengajuan ini {k.status.toLowerCase()}. Lihat alasannya di riwayat.</p>}
        </section>
      )}
    </div>
  );
}

/** Ruang Pengguna: status ringkas (Antri/Proses/Selesai) dan posisi di antrean Legal. */
function PanelStatusPengguna({ k, antrean, posisi, ditangani }: { k: Kontrak; antrean: Kontrak[]; posisi: number | null; ditangani: number }) {
  const { sesi } = useSesi();
  const milikSaya = k.pengajuEmail.toLowerCase() === sesi.email;
  const masuk = k.tanggalDiajukan ?? k.dibuat;
  const waktu = waktuPengajuan(k);
  const fakta: { label: string; isi: ReactNode }[] =
    k.status === "Aktif" || k.status === "Berakhir"
      ? [
          { label: "Nomor kontrak", isi: k.nomorKontrak ? <span className="font-mono">{k.nomorKontrak}</span> : "-" },
          { label: "Ditandatangani", isi: formatTanggal(k.tanggalTandaTangan) },
          { label: k.status === "Berakhir" ? "Berakhir" : "Berlaku sampai", isi: formatTanggal(k.status === "Berakhir" ? (k.tanggalDiakhiri ?? k.berakhirEfektif ?? k.tanggalBerakhir) : (k.berakhirEfektif ?? k.tanggalBerakhir)) },
        ]
      : [
          { label: "Ditangani", isi: k.picLegalNama || "Belum ada PIC" },
          { label: "Target selesai", isi: formatTanggal(k.targetSelesai) },
          // U03A: "diperbarui" ikut berubah karena hal teknis; waktu masuk sudah tampil di kartu, jadi yang ditambah hanya sejak kapan di tahap ini.
          ...(waktu.sejakTahap ? [{ label: "Di tahap ini", isi: `sejak ${formatTanggal(keYmd(waktu.sejakTahap))}` }] : []),
        ];
  return (
    <section className="kartu p-5 sm:p-6" aria-label="Status pengajuan">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <PelacakRingkas k={k} besar />
          <p className="mt-4 text-center text-sm font-semibold">{keteranganRingkas(k)}</p>
          {k.status === "Perlu Revisi" && <p className="mx-auto mt-1 max-w-sm text-center text-xs text-muted">Perbaiki sesuai poin dari Legal di kartu revisi, unggah dokumen yang diminta, lalu tekan Kirim Ulang ke Legal.</p>}
          <p className="mx-auto mt-3 flex max-w-sm flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center text-xs text-muted">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Masuk</span>
            <strong className="font-semibold text-ink">{formatMasuk(masuk)}</strong>
            <span>({teksLalu(masuk)})</span>
          </p>
        </div>
        {posisi != null ? (
          <div className="min-w-0 rounded-2xl bg-raised p-4">
            <p className="text-sm" role="status" aria-atomic="true">
              <strong>Urutan ke-{posisi}</strong> dari {antrean.length} pengajuan di antrean Legal. {teksPosisi(posisi)}.
            </p>
            <div className="mt-3">
              <JalurAntrean antrean={antrean} milik={[k]} ditangani={ditangani} labelSorot={milikSaya ? "Anda" : "Ini"} />
            </div>
          </div>
        ) : (
          <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
            {fakta.map((f) => (
              <div key={f.label} className="min-w-0 rounded-2xl bg-raised px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{f.label}</dt>
                <dd className="teks-panjang mt-1 text-sm font-semibold">{f.isi}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

// --- Modal aksi status --------------------------------------------------------

type DataFinal = Pick<KontrakInput, "nomorKontrak" | "tanggalTandaTangan" | "tanggalMulai" | "tanggalBerakhir">;

/** Penjelasan singkat tiap cara kontrak berakhir (K02). */
const KETERANGAN_MODE: Record<ModeBerakhir, string> = {
  "Selesai Normal": "Pekerjaan dan kewajiban selesai sesuai kontrak.",
  "Tidak Diperpanjang": "Masa berlaku habis dan tidak dilanjutkan.",
  Diputus: "Diakhiri sebelum waktunya, mis. karena wanprestasi.",
  "Dibatalkan Bersama": "Diakhiri lebih awal atas kesepakatan para pihak.",
  Sengketa: "Berakhir dalam keadaan sengketa. Catat rinciannya di panel Kasus.",
};

/** Mode berakhir yang wajib disertai alasan tertulis di catatan. */
const MODE_WAJIB_ALASAN: readonly ModeBerakhir[] = ["Diputus", "Dibatalkan Bersama", "Sengketa"];

/** Draft didahulukan: Draft Final terbaru, lalu Draft Kontrak, lalu dokumen lain (kontrak bertanda tangan tidak). */
const URUTAN_DRAFT: Partial<Record<string, number>> = { "Draft Final": 0, "Draft Kontrak": 1 };
function urutkanDraft(daftar: readonly Dokumen[]): Dokumen[] {
  return daftar.filter((d) => d.jenis !== "Kontrak Ditandatangani").sort((a, b) => (URUTAN_DRAFT[a.jenis] ?? 2) - (URUTAN_DRAFT[b.jenis] ?? 2) || b.diubah.localeCompare(a.diubah));
}
const adalahDraft = (d: Dokumen) => d.jenis === "Draft Final" || d.jenis === "Draft Kontrak";

const fmtIsianNilai = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

function ModalAksi({
  k,
  aksi,
  catatanAwal,
  semua,
  induk,
  dokumen,
  lembar,
  lembarSiap,
  onDokumenBerubah,
  onTutup,
  onSelesai,
}: {
  k: Kontrak;
  aksi: AksiStatus;
  catatanAwal?: string;
  semua: Kontrak[];
  induk: Kontrak | null;
  dokumen: Dokumen[] | null;
  /** Lembar Hasil Review Legal (Ruang Admin). `lembarSiap` false bila belum termuat, kolomnya belum ada, atau bukan untuk ruang ini. */
  lembar: LembarReview | null;
  lembarSiap: boolean;
  onDokumenBerubah: () => void;
  onTutup: () => void;
  onSelesai: () => Promise<void>;
}) {
  const { sesi } = useSesi();
  const { pengaturan, rusak } = usePengaturan();
  const addendum = adalahAddendum(k);
  const aktivasi = !!aksi.butuhDataFinal;
  const penutupan = !!aksi.butuhPenutupan;
  const lanjutTtd = aksi.id === "lanjut-ttd";
  const mintaRevisi = aksi.id === "minta-revisi";
  const format = pengaturan.formatPenomoran;
  const formatRusak = rusak.some((r) => r.kunci === "formatPenomoran");

  const [catatan, setCatatan] = useState(() => {
    if (catatanAwal) return catatanAwal;
    if (mintaRevisi && dokumen) return teksMohonLengkapi(kekuranganDokumen(k.jenis, dokumen.map((d) => d.jenis)).kurang, k.jenis);
    return "";
  });
  const [final, setFinal] = useState<DataFinal>(() => ({
    nomorKontrak: k.nomorKontrak,
    tanggalTandaTangan: tanggalTtdTerakhir(k.checklistTtd) ?? k.tanggalTandaTangan ?? hariIni(),
    tanggalMulai: k.tanggalMulai,
    tanggalBerakhir: k.tanggalBerakhir,
  }));
  // Selama nomor belum disentuh, isian mengikuti usulan terbaru (mis. setelah data kontrak dibaca ulang).
  const [nomorDisentuh, setNomorDisentuh] = useState(() => !!k.nomorKontrak.trim());
  const [semuaSegar, setSemuaSegar] = useState<Kontrak[] | null>(null);
  const [ttd, setTtd] = useState<{ siap: boolean; final: BerkasFinal | null }>({ siap: false, final: null });
  const [alasanLewati, setAlasanLewati] = useState<string | null>(null);
  // U19: nilai final (tidak untuk MoU) dan nomor referensi pengadaan.
  const tampilNilai = aktivasi && !adalahMou(k);
  const [nilaiTeks, setNilaiTeks] = useState(() => (k.nilai == null ? "" : fmtIsianNilai.format(k.nilai)));
  const [nomorReferensi, setNomorReferensi] = useState(k.nomorReferensi);
  // K02: cara dan tanggal efektif berakhir. Kontrak yang masa berlakunya sudah lewat diusulkan "Selesai Normal".
  const akhirBerlaku = k.berakhirEfektif ?? k.tanggalBerakhir;
  const sudahLewat = !!akhirBerlaku && akhirBerlaku < hariIni();
  const [mode, setMode] = useState<ModeBerakhir | "">(() => k.modeBerakhir || (sudahLewat ? "Selesai Normal" : ""));
  const [tanggalAkhir, setTanggalAkhir] = useState<Ymd>(() => (sudahLewat ? akhirBerlaku! : hariIni()));
  // U21: cara tanda tangan dan draft final yang disepakati.
  const [cara, setCara] = useState<CaraTtd | null>(k.checklistTtd?.cara ?? null);
  const kandidat = useMemo(() => urutkanDraft(dokumen ?? []), [dokumen]);
  const [idDraft, setIdDraft] = useState<string | null>(null);
  // U15: lampiran redline opsional di Minta Revisi.
  const [redline, setRedline] = useState<File | null>(null);
  const [tujuanRedline, setTujuanRedline] = useState<string | null>(null);
  const [redlineTersimpan, setRedlineTersimpan] = useState<HasilRedline | null>(null);
  const [persenUnggah, setPersenUnggah] = useState<number | null>(null);
  const [langkah, setLangkah] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");
  const [konflik, setKonflik] = useState(false);
  // Galat muncul di tengah isi yang panjang: gulirkan ke sana supaya tidak terlewat di balik tombol yang menempel.
  const kotakGalat = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (galat) kotakGalat.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [galat]);

  const acuan = semuaSegar ?? semua;
  const usulan = useMemo(() => (aktivasi ? usulanNomorKontrak(k, acuan, format, { tanggal: final.tanggalTandaTangan }) : null), [aktivasi, k, acuan, format, final.tanggalTandaTangan]);
  const nomorUsulan = usulan?.nomor ?? "";
  useEffect(() => {
    if (!nomorDisentuh && nomorUsulan) setFinal((f) => (f.nomorKontrak === nomorUsulan ? f : { ...f, nomorKontrak: nomorUsulan }));
  }, [nomorDisentuh, nomorUsulan]);
  const catatanNomor = aktivasi ? peringatanFormatNomor(final.nomorKontrak, k, format, { nomorInduk: induk?.nomorKontrak }) : [];
  const kurangAktivasi = aksi.id === "aktifkan" && dokumen ? kekuranganDokumen(k.jenis, dokumen.map((d) => d.jenis)).kurang : [];
  const persetujuanTerbaru = lanjutTtd ? (daftarPersetujuan(k.persetujuan)[0] ?? null) : null;
  // Poin dari temuan di Lembar Hasil Review Legal (putaran terakhir), untuk mengisi catatan Minta Revisi.
  const poinLembar = useMemo(() => (mintaRevisi && lembarSiap ? poinRevisiDariTemuan(putaranTerakhir(lembar)?.temuan ?? []) : []), [mintaRevisi, lembarSiap, lembar]);
  const peringatanTtd = lanjutTtd && dokumen ? peringatanDokumenSebelumTtd(k.jenis, dokumen.map((d) => d.jenis)) : "";

  // Draft final bawaan: draft terbaru, sampai Legal memilih sendiri.
  const draftBawaan = kandidat.find(adalahDraft) ?? null;
  const idDraftDipakai = idDraft ?? draftBawaan?.id ?? "";
  const draftDipilih = kandidat.find((d) => d.id === idDraftDipakai) ?? null;
  // Tujuan redline bawaan: draft terbaru yang sejenis berkasnya; selain itu menjadi dokumen baru.
  const tujuanSejenis = redline ? kandidat.filter((d) => sepadanEkstensi(d.nama, redline.name)) : [];
  const idTujuanDipakai = tujuanRedline ?? tujuanSejenis.find(adalahDraft)?.id ?? "";
  const tujuanDipilih = tujuanSejenis.find((d) => d.id === idTujuanDipakai) ?? null;

  const nilaiBaru = tampilNilai ? bacaNilai(nilaiTeks) : undefined;
  const nilaiBerubah = tampilNilai && nilaiBaru !== undefined && !Number.isNaN(nilaiBaru) && nilaiBaru !== k.nilai;

  const kirim = async () => {
    setGalat("");
    setKonflik(false);
    if (aksi.wajibCatatan && !catatan.trim()) return setGalat("Catatan wajib diisi.");
    if (aktivasi) {
      if (!final.nomorKontrak.trim()) return setGalat(addendum ? "Nomor addendum wajib diisi." : "Nomor kontrak wajib diisi.");
      // Addendum yang tidak mengubah waktu tidak wajib punya tanggal; kontrak biasa dan perpanjangan wajib.
      const wajibTanggal = !addendum || k.jenisPerubahan.includes("Perpanjangan Waktu");
      if (wajibTanggal && (!final.tanggalMulai || !final.tanggalBerakhir)) return setGalat(addendum ? "Tanggal berakhir baru wajib diisi karena addendum ini memperpanjang waktu." : "Tanggal mulai dan berakhir wajib diisi.");
      if (final.tanggalMulai && final.tanggalBerakhir && final.tanggalBerakhir < final.tanggalMulai) return setGalat("Tanggal berakhir tidak boleh sebelum tanggal mulai.");
      if (tampilNilai && Number.isNaN(nilaiBaru)) return setGalat("Nilai final belum terbaca. Tulis angkanya saja, mis. 1.250.000.000.");
      if (!ttd.siap) return setGalat("Unggah dulu kontrak yang sudah ditandatangani (PDF).");
    }
    if (penutupan) {
      if (!mode) return setGalat("Pilih cara kontrak ini berakhir.");
      if (!tanggalAkhir) return setGalat("Tanggal efektif berakhir wajib diisi.");
      if (k.tanggalMulai && tanggalAkhir < k.tanggalMulai) return setGalat("Tanggal efektif berakhir tidak boleh sebelum tanggal mulai kontrak.");
      if (MODE_WAJIB_ALASAN.includes(mode) && !catatan.trim()) return setGalat(`Untuk mode ${mode}, tuliskan alasannya di catatan.`);
    }
    if (mintaRevisi && redline) {
      const tolak = validasiBerkas(redline.name, redline.size);
      if (tolak) return setGalat(tolak);
    }

    setMenyimpan(true);
    try {
      // U15: redline diunggah SEBELUM status berubah, supaya tidak terhitung sebagai dokumen revisi dari pengaju.
      if (mintaRevisi && redline) {
        setLangkah("Mengunggah redline…");
        const h = await unggahRedline(k, redline, tujuanDipilih, sesi, setPersenUnggah);
        setRedlineTersimpan(h);
        setRedline(null);
        setPersenUnggah(null);
        onDokumenBerubah();
        if (!h.aktivitasTercatat) umpanBalik.peringatan("Redline tersimpan, tetapi catatannya belum masuk riwayat.");
      }
      // U21: sidik SHA-256 draft final dihitung dari isi berkas saat ini.
      let sidik: Awaited<ReturnType<typeof sidikDraftFinal>> | null = null;
      if (lanjutTtd && draftDipilih) {
        setLangkah("Menghitung sidik draft final…");
        sidik = await sidikDraftFinal(draftDipilih, sesi);
      }
      setLangkah("Menyimpan…");

      const nomorRapi = final.nomorKontrak.trim().replace(/\s{2,}/g, " ");
      // U19: nilai final yang berbeda disebut juga di catatan, supaya pengaju membacanya di email dan riwayat.
      const teksNilaiFinal = nilaiBerubah
        ? `${addendum ? "Selisih nilai final" : "Nilai final"} diubah dari ${k.nilai == null ? "kosong" : formatUang(k.nilai, k.mataUang)} ke ${nilaiBaru == null ? "kosong" : formatUang(nilaiBaru, k.mataUang)}.`
        : "";
      const catatanAkhir = lanjutTtd
        ? [catatan.trim(), ringkasSebelumTtd(checklistReviewKontrak(k)), persetujuanTerbaru ? teksPersetujuan(persetujuanTerbaru, formatTanggal) : "", lembarSiap && putaranFinalTerakhir(lembar) ? ringkasLembarUntukCatatan(lembar) : "", cara ? `Cara tanda tangan: ${labelCaraTtd(cara)}.` : "", sidik ? teksDraftFinal(sidik.jejak, sidik.alasan) : ""].filter(Boolean).join("\n\n")
        : aktivasi
          ? [catatan.trim(), teksNilaiFinal, !ttd.final && alasanLewati ? `[Diaktifkan tanpa salinan bertanda tangan oleh Admin] Alasan: ${alasanLewati}` : ""].filter(Boolean).join("\n")
          : catatan;
      const dataFinal: Partial<KontrakInput> = aktivasi
        ? {
            ...final,
            nomorKontrak: nomorRapi,
            ...(nilaiBerubah ? { nilai: nilaiBaru } : {}),
            ...(nomorReferensi.trim() !== k.nomorReferensi.trim() ? { nomorReferensi: nomorReferensi.trim() } : {}),
          }
        : {};
      const hasil = await jalankanAksi(k, aksi, catatanAkhir, dataFinal, sesi, penutupan && mode ? { penutupan: { mode, tanggal: tanggalAkhir } } : {});
      const peringatan = [...hasil.peringatan];

      if (lanjutTtd && (cara || sidik)) {
        let c = hasil.kontrak.checklistTtd;
        if (cara) c = aturCaraTtd(c, cara);
        if (sidik) c = aturDraftFinal(c, sidik.jejak);
        if (c) await simpanChecklistTtd(hasil.kontrak, c).catch(() => peringatan.push("Cara tanda tangan dan draft final sudah tercatat di riwayat, tetapi belum tersimpan di panel tanda tangan."));
      }
      if (aktivasi && ttd.final) {
        const ok = await simpanKontrakFinal(k.id, ttd.final.webUrl);
        if (!ok) peringatan.push("Kontrak aktif, tetapi tautan kontrak final belum tersimpan. Periksa kolom KontrakFinal di list Kontrak.");
      }
      umpanBalik.berhasil(`Beres, status sekarang ${aksi.ke}.`);
      for (const p of peringatan) umpanBalik.peringatan(p, { durasi: 10_000 });
      await onSelesai();
    } catch (err) {
      if (err instanceof GalatKonflik) {
        setGalat(err.message);
        setKonflik(true);
      } else if (err instanceof GalatNomorGanda) {
        setSemuaSegar(err.semua);
        setNomorDisentuh(false);
        setGalat(`${err.message} Isian sudah diganti dengan usulan terbaru.`);
      } else if (aktivasi && adalahGalatNomorUnik(err)) {
        setGalat(PESAN_NOMOR_GANDA);
        kosongkanCacheKontrak();
        void ambilSemuaKontrak()
          .then(setSemuaSegar)
          .catch(() => undefined);
        setNomorDisentuh(false);
      } else {
        setGalat(pesanError(err));
        // Galat sesi: toast menawarkan Masuk ulang; isian di modal tetap utuh.
        if (err instanceof GraphError && err.perluLogin) umpanBalik.gagal(err, "Sesi Microsoft berakhir");
      }
      setPersenUnggah(null);
      setMenyimpan(false);
    } finally {
      setLangkah("");
    }
  };

  const lebar = aktivasi || lanjutTtd ? "max-w-2xl" : mintaRevisi || penutupan ? "max-w-xl" : "max-w-lg";

  return (
    <Modal judul={aksi.label} onTutup={onTutup} lebar={lebar}>
      <p className="text-sm text-muted">
        Status akan berubah dari <strong className="text-ink">{k.status}</strong> menjadi <strong className="text-ink">{aksi.ke}</strong>. {aksi.petunjuk}
      </p>
      {aksi.hanyaAdmin && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent-ink">
          <ShieldAlert className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Aksi khusus Admin untuk memulihkan kontrak yang salah ditutup. Alasannya tercatat di riwayat dan pengaju diberi tahu lewat email.</span>
        </p>
      )}
      {aksi.id === "aktifkan" && !addendum && (
        <div className="mt-3">
          <PeringatanAktivasiJaminan k={k} />
        </div>
      )}
      {kurangAktivasi.length > 0 && (
        <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent-ink">
          Dokumen wajib yang belum ada: {kurangAktivasi.join(", ")}. Anda tetap bisa lanjut; ini hanya pengingat supaya arsipnya lengkap.
        </p>
      )}

      {aktivasi && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 sm:col-span-2">
            <Isian label={addendum ? "Nomor addendum" : "Nomor kontrak"} wajib>
              <input
                className="input font-mono"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={final.nomorKontrak}
                onChange={(e) => {
                  setNomorDisentuh(true);
                  setFinal({ ...final, nomorKontrak: e.target.value });
                }}
              />
            </Isian>
            {usulan && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span className="min-w-0">
                  {usulan.nomor ? (
                    <>
                      Usulan <span className="font-mono font-semibold text-ink">{usulan.nomor}</span>. {usulan.alasan}
                    </>
                  ) : (
                    usulan.alasan
                  )}
                </span>
                {usulan.nomor && usulan.nomor !== final.nomorKontrak.trim() && (
                  <button
                    type="button"
                    className="min-h-8 rounded-full bg-brand-soft px-2.5 py-0.5 font-semibold text-brand-strong hover:bg-raised [@media(pointer:coarse)]:min-h-11"
                    onClick={() => {
                      setNomorDisentuh(false);
                      setFinal({ ...final, nomorKontrak: usulan.nomor });
                    }}
                  >
                    Pakai usulan
                  </button>
                )}
              </div>
            )}
            {(catatanNomor.length > 0 || formatRusak) && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted">
                {formatRusak && <li>Format nomor di Pengaturan tidak terbaca, jadi usulan memakai format standar awal.</li>}
                {catatanNomor.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </div>
          <Isian label="Tanggal tanda tangan" wajib className="sm:col-span-2" bantuan={tanggalTtdTerakhir(k.checklistTtd) ? "Diisi dari langkah tanda tangan terakhir yang tercatat." : undefined}>
            <input type="date" className="input" value={final.tanggalTandaTangan ?? ""} onChange={(e) => setFinal({ ...final, tanggalTandaTangan: e.target.value || null })} />
          </Isian>
          <Isian label="Tanggal mulai" wajib={!addendum || k.jenisPerubahan.includes("Perpanjangan Waktu")}>
            <input type="date" className="input" value={final.tanggalMulai ?? ""} onChange={(e) => setFinal({ ...final, tanggalMulai: e.target.value || null })} />
          </Isian>
          <Isian label={addendum ? "Berakhir baru" : "Tanggal berakhir"} wajib={!addendum || k.jenisPerubahan.includes("Perpanjangan Waktu")}>
            <input type="date" className="input" value={final.tanggalBerakhir ?? ""} onChange={(e) => setFinal({ ...final, tanggalBerakhir: e.target.value || null })} />
          </Isian>
          {tampilNilai && (
            <Isian
              label={addendum ? `Selisih nilai final (${k.mataUang})` : `Nilai final (${k.mataUang})`}
              bantuan={
                nilaiBerubah
                  ? `Akan dicatat di riwayat: dari ${k.nilai == null ? "kosong" : formatUang(k.nilai, k.mataUang)} ke ${nilaiBaru == null ? "kosong" : formatUang(nilaiBaru, k.mataUang)}.`
                  : addendum
                    ? "Tambah atau kurang terhadap nilai induk (pakai tanda minus untuk pengurangan). Ubah bila berbeda dengan dokumen bertanda tangan."
                    : "Sesuaikan bila nilai di kontrak bertanda tangan berbeda dengan pengajuan."
              }
            >
              <input className="input angka" inputMode="decimal" value={nilaiTeks} onChange={(e) => setNilaiTeks(e.target.value)} placeholder="0" />
            </Isian>
          )}
          <Isian label="Nomor referensi (opsional)" className={tampilNilai ? undefined : "sm:col-span-2"} bantuan="Nomor PR, PO, SPK, atau referensi pengadaan lain. Pisahkan dengan koma bila lebih dari satu.">
            <input className="input font-mono" maxLength={200} autoComplete="off" autoCorrect="off" spellCheck={false} value={nomorReferensi} onChange={(e) => setNomorReferensi(e.target.value)} />
          </Isian>
          <div className="min-w-0 sm:col-span-2">
            <UnggahAktivasi kontrak={k} dokumen={dokumen} onSiap={(siap, berkas) => setTtd({ siap, final: berkas })} onLewati={setAlasanLewati} onUnggah={onDokumenBerubah} />
          </div>
        </div>
      )}

      {penutupan && (
        <div className="mt-4 space-y-4">
          <fieldset className="min-w-0">
            <legend className="label">
              Cara kontrak berakhir<span className="ml-0.5 text-danger">*</span>
            </legend>
            <div role="radiogroup" aria-label="Cara kontrak berakhir" className="grid gap-2 sm:grid-cols-2">
              {MODE_BERAKHIR.map((m) => {
                const pilih = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={pilih}
                    onClick={() => setMode(m)}
                    className={cx(
                      "min-h-11 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft",
                      pilih ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-brand",
                    )}
                  >
                    <span className={cx("block text-sm font-semibold", pilih && "text-brand-strong")}>{m}</span>
                    <span className="block text-xs text-muted">{KETERANGAN_MODE[m]}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Isian
            label="Tanggal efektif berakhir"
            wajib
            bantuan={akhirBerlaku ? `Masa berlaku efektif sampai ${formatTanggal(akhirBerlaku)}. Isi tanggal lebih awal bila kontrak diputus atau dibatalkan.` : "Tanggal kontrak benar-benar berhenti berlaku."}
          >
            <input type="date" className="input" value={tanggalAkhir} min={k.tanggalMulai ?? undefined} onChange={(e) => setTanggalAkhir(e.target.value)} />
          </Isian>
        </div>
      )}

      {lanjutTtd && (
        <div className="mt-4 space-y-4">
          <PeringatanReview kontrak={k} />
          {lembarSiap && <PeringatanLembarTtd lembar={lembar} />}
          <RujukanKewenangan k={k} induk={induk} semua={acuan} ringkas />
          <p className="-mt-2 text-xs text-muted">
            {persetujuanTerbaru
              ? `Bukti persetujuan tercatat: ${teksPersetujuan(persetujuanTerbaru, formatTanggal)}`
              : "Belum ada bukti persetujuan yang dicatat. Anda tetap bisa lanjut; catat buktinya di panel Persetujuan internal supaya arsipnya lengkap."}
          </p>
          {peringatanTtd && <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent-ink">{peringatanTtd}</p>}
          <PilihCaraTtd nilai={cara} onUbah={setCara} judul="Cara tanda tangan (opsional)" />
          <Isian label="Draft final yang disepakati" bantuan="Nama, ukuran, dan sidik SHA-256 isinya dicatat di riwayat sebagai bukti draft mana yang ditandatangani.">
            <select className="input" value={idDraftDipakai} disabled={dokumen == null} onChange={(e) => setIdDraft(e.target.value)}>
              <option value="">{dokumen == null ? "Memuat dokumen…" : "Tidak dicatat"}</option>
              {kandidat.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nama} · {d.jenis || "jenis belum diisi"} · {teksUkuran(d.ukuran)}
                </option>
              ))}
            </select>
          </Isian>
          {draftDipilih && !adalahDraft(draftDipilih) && <p className="-mt-2 text-xs text-muted">Berkas ini belum berjenis Draft Kontrak atau Draft Final. Pastikan memang ini yang disepakati.</p>}
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
            <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Perlu templat surat atau kontrak?
            <a href={urlTemplatLegal(URL_LIBRARY_BERKAS)} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 font-semibold text-brand hover:text-brand-strong">
              Buka folder Templat Legal <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <span>(standar awal: folder _Templat di Berkas Kontrak)</span>
          </p>
        </div>
      )}

      <Isian label={aksi.wajibCatatan || (penutupan && mode && MODE_WAJIB_ALASAN.includes(mode)) ? "Catatan" : "Catatan (opsional)"} wajib={aksi.wajibCatatan || (penutupan && !!mode && MODE_WAJIB_ALASAN.includes(mode))} className="mt-4">
        <textarea className={cx("input", mintaRevisi ? "min-h-[150px]" : "min-h-[100px]")} value={catatan} onChange={(e) => setCatatan(e.target.value)} autoFocus={!aktivasi && !penutupan} />
      </Isian>

      {mintaRevisi && (
        <div className="mt-2">
          <p className="text-xs text-muted">Satu poin per baris supaya pengaju bisa mencentangnya. Ketuk templat untuk menambah poin:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TEMPLAT_POIN.map((t) => (
              <button key={t.id} type="button" title={t.teks} onClick={() => setCatatan((c) => tambahPoin(c, t.teks))} className="min-h-8 rounded-full bg-raised px-2.5 py-1 text-xs font-semibold hover:bg-brand-soft [@media(pointer:coarse)]:min-h-11">
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mintaRevisi && poinLembar.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-raised px-3 py-2">
          <p className="min-w-0 flex-1 basis-48 text-xs text-muted">Lembar Hasil Review Legal punya {poinLembar.length} temuan yang ditandai untuk revisi. Hanya pasal dan usulannya yang dipakai, tanpa penilaian risiko.</p>
          <button
            type="button"
            onClick={() => setCatatan((c) => poinLembar.reduce((hasil, poin) => tambahPoin(hasil, poin), c))}
            className="min-h-8 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-strong hover:bg-surface [@media(pointer:coarse)]:min-h-11"
          >
            Tambahkan {poinLembar.length} poin dari lembar
          </button>
        </div>
      )}

      {mintaRevisi && (
        <LampiranRedline
          berkas={redline}
          tersimpan={redlineTersimpan}
          tujuan={tujuanSejenis}
          idTujuan={idTujuanDipakai}
          persen={persenUnggah}
          sibuk={menyimpan}
          onPilih={(f) => {
            setRedline(f);
            setTujuanRedline(null);
          }}
          onTujuan={setTujuanRedline}
        />
      )}

      {galat && (
        <div ref={kotakGalat} role="alert" className="mt-3 scroll-mb-24 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <p>{galat}</p>
          {konflik && (
            <Tombol kecil varian="kedua" className="mt-2" ikon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void onSelesai()}>
              Muat ulang data
            </Tombol>
          )}
        </div>
      )}
      {langkah && (
        <p className="mt-3 text-xs text-muted" role="status" aria-live="polite">
          {langkah}
        </p>
      )}

      <AksiModal>
        <Tombol varian="kedua" onClick={onTutup} disabled={menyimpan}>
          Batal
        </Tombol>
        <Tombol varian={aksi.nada === "bahaya" ? "bahaya" : "utama"} memuat={menyimpan} disabled={(aktivasi && !ttd.siap) || (penutupan && !mode)} onClick={kirim}>
          {aksi.label}
        </Tombol>
      </AksiModal>
    </Modal>
  );
}

/** Area lampiran redline di modal Minta Revisi (U15): pilih berkas, lalu tentukan menjadi versi baru dokumen mana. */
function LampiranRedline({
  berkas,
  tersimpan,
  tujuan,
  idTujuan,
  persen,
  sibuk,
  onPilih,
  onTujuan,
}: {
  berkas: File | null;
  tersimpan: HasilRedline | null;
  tujuan: Dokumen[];
  idTujuan: string;
  persen: number | null;
  sibuk: boolean;
  onPilih: (f: File | null) => void;
  onTujuan: (id: string) => void;
}) {
  const idInput = useId();
  return (
    <fieldset className="mt-4 min-w-0 rounded-2xl border border-line p-3.5">
      <legend className="px-1 text-sm font-semibold">Lampiran redline (opsional)</legend>
      {tersimpan ? (
        <p className="flex items-start gap-2 text-sm text-success" role="status">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">
            Redline tersimpan{tersimpan.tujuan ? ` sebagai versi baru${tersimpan.versi ? ` (${tersimpan.versi})` : ""} dari "${tersimpan.tujuan}"` : ` sebagai "${tersimpan.nama}"`}. Tidak akan diunggah ulang.
          </span>
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">Draft yang sudah Anda tandai perubahannya. Disimpan sebagai versi baru dokumen yang dipilih, jadi versi lamanya tetap ada di riwayat versi.</p>
          {berkas ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-raised px-3 py-2">
              <Paperclip className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={berkas.name}>
                {berkas.name}
              </span>
              <span className="shrink-0 text-xs text-muted">{teksUkuran(berkas.size)}</span>
              <button type="button" disabled={sibuk} onClick={() => onPilih(null)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink disabled:opacity-50" aria-label={`Batalkan lampiran ${berkas.name}`}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <label htmlFor={idInput} className="mt-3 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line px-3 py-2 text-sm font-semibold text-brand transition-colors hover:border-brand focus-within:border-brand">
              <Upload className="h-4 w-4" aria-hidden="true" /> Pilih berkas redline
              <input
                id={idInput}
                type="file" aria-label="Pilih berkas untuk diunggah"
                className="sr-only"
                accept=".doc,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                onChange={(e) => {
                  onPilih(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {berkas && (
            <Isian label="Simpan sebagai" className="mt-3" bantuan={tujuan.length === 0 ? "Belum ada dokumen sejenis, jadi redline disimpan sebagai dokumen baru berjenis Draft Kontrak." : undefined}>
              <select className="input" value={idTujuan} disabled={sibuk} onChange={(e) => onTujuan(e.target.value)}>
                {tujuan.map((d) => (
                  <option key={d.id} value={d.id}>
                    Versi baru dari {d.nama}
                  </option>
                ))}
                <option value="">Dokumen baru (Draft Kontrak)</option>
              </select>
            </Isian>
          )}
          {persen != null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={persen} aria-valuemin={0} aria-valuemax={100} aria-label="Kemajuan unggah redline">
              <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${persen}%` }} transition={{ duration: 0.2 }} />
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}

// --- Informasi --------------------------------------------------------------

function Baris({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm">{children}</dd>
    </div>
  );
}

function InfoKontrak({ k, ring, horizon }: { k: Kontrak; ring: RingkasanAddendum | null; horizon: number }) {
  const { ruang } = useRuang();
  const { pengaturan } = usePengaturan();
  const addendum = adalahAddendum(k);
  const berakhir = ring?.berakhirEfektif ?? k.tanggalBerakhir;
  const sisa = k.status === "Aktif" && berakhir ? selisihHari(berakhir) : null;
  const masuk = k.tanggalDiajukan ?? k.dibuat;
  const ics =
    k.status === "Aktif" || k.status === "Proses Tanda Tangan"
      ? opsiIcsBerakhir(k, { tautan: urlKontrak(k.id, ruang === "pengguna" ? "pengaju" : "legal"), alarmHari: pengaturan.hariPeringatan.filter((h) => h <= 90) })
      : null;

  const tambahKalender = () => {
    if (!ics) return;
    try {
      unduhIcs(ics);
      toast.success("Berkas kalender siap", { description: "Buka berkas .ics-nya untuk menambahkan pengingat ke Outlook." });
    } catch (err) {
      toast.error("Berkas kalender belum bisa dibuat", { description: pesanError(err) });
    }
  };

  return (
    <section className="kartu p-5 sm:p-6">
      <h2 className="mb-4 font-bold">Informasi kontrak</h2>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        <Baris label={addendum ? "Selisih nilai" : "Nilai kontrak"}>
          <span className={cx("text-base font-bold tabular-nums", k.nilai == null && "text-muted")}>{teksNilai(k)}</span>
          {ring?.nilaiBerubah && (
            <p className="mt-1 text-xs text-muted">
              Nilai efektif <strong className="text-ink">{formatUang(ring.nilaiEfektif, k.mataUang)}</strong> setelah {ring.aktif.length} addendum
            </p>
          )}
        </Baris>
        <Baris label="Nomor kontrak">{k.nomorKontrak ? <span className="font-mono">{k.nomorKontrak}</span> : <span className="text-muted">Belum ada</span>}</Baris>
        <Baris label="Tanggal tanda tangan">{formatTanggal(k.tanggalTandaTangan)}</Baris>
        <Baris label={addendum ? "Berlaku (addendum)" : "Masa berlaku"} className="sm:col-span-2 xl:col-span-1">
          {formatTanggal(k.tanggalMulai)} – {formatTanggal(berakhir)}
          {sisa != null && (
            <span className="ml-2">
              <Lencana nada={sisa < 0 ? "bahaya" : sisa <= horizon ? "peringatan" : "sukses"}>{sisaHari(berakhir!)}</Lencana>
            </span>
          )}
          {ring?.diperpanjang && <p className="mt-1 text-xs text-muted">Semula berakhir {formatTanggal(k.tanggalBerakhir)}, diperpanjang addendum.</p>}
          {ics && (
            <div className="mt-2">
              <Tombol kecil varian="kedua" ikon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={tambahKalender}>
                Tambah ke kalender Outlook
              </Tombol>
            </div>
          )}
        </Baris>
        {k.status === "Berakhir" && (k.tanggalDiakhiri || k.modeBerakhir) && (
          <Baris label="Diakhiri">
            <span className="flex flex-wrap items-center gap-2">
              {k.tanggalDiakhiri ? formatTanggal(k.tanggalDiakhiri) : <span className="text-muted">Tanggal belum dicatat</span>}
              {/* Cara berakhir (mis. Sengketa) termasuk data sensitif: hanya di Ruang Admin. */}
              {ruang === "admin" && <LencanaModeBerakhir mode={k.modeBerakhir} />}
            </span>
          </Baris>
        )}
        <Baris label="Target selesai review">{formatTanggal(k.targetSelesai)}</Baris>
        <Baris label="Diajukan" className="sm:col-span-2 xl:col-span-1">
          <span className="font-semibold">{formatMasuk(masuk)}</span>
          <p className="text-xs text-muted">{teksLalu(masuk)}</p>
        </Baris>
        <Baris label="Pengaju">
          {k.pengajuNama}
          <p className="break-all text-xs text-muted">{k.pengajuEmail}</p>
        </Baris>
        <Baris label="PIC Legal">{k.picLegalNama || <span className="text-muted">Belum ditetapkan</span>}</Baris>
        {addendum && k.jenisPerubahan.length > 0 && (
          <Baris label="Yang diubah">
            <span className="flex flex-wrap gap-1.5">
              {k.jenisPerubahan.map((j) => (
                <Lencana key={j}>{j}</Lencana>
              ))}
            </span>
          </Baris>
        )}
      </dl>
      {k.deskripsi && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Deskripsi / ruang lingkup</p>
          <p className="mt-1 max-w-[80ch] whitespace-pre-wrap break-words text-sm leading-relaxed">{k.deskripsi}</p>
        </div>
      )}
    </section>
  );
}

// --- Addendum ---------------------------------------------------------------

/** Untuk addendum: kartu yang menaut ke kontrak induknya. */
function KartuInduk({ k, induk }: { k: Kontrak; induk: Kontrak }) {
  const { ke } = useRuang();
  return (
    <Link to={ke.detail(induk.id)} className="group kartu kartu-hover flex flex-wrap items-center gap-4 p-5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-400 to-sky-600 text-white shadow-lg">
        <Layers className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Addendum ke-{k.urutanAddendum ?? "?"} dari kontrak</p>
        <p className="teks-panjang text-base font-bold transition-colors group-hover:text-brand sm:truncate">{induk.judul}</p>
        <p className="teks-panjang text-xs text-muted sm:truncate">
          <span className="font-mono">{induk.nomorKontrak || induk.nomorPengajuan}</span> · {induk.mitra || "-"} · berlaku sampai {formatTanggal(induk.tanggalBerakhir)}
        </p>
      </div>
      <LencanaStatus status={induk.status} />
    </Link>
  );
}

/** Untuk kontrak turunan: kartu yang menaut ke MoU atau kontrak payung dasarnya. */
function KartuMou({ mou }: { mou: Kontrak }) {
  const { ke } = useRuang();
  return (
    <Link to={ke.detail(mou.id)} className="group kartu kartu-hover flex flex-wrap items-center gap-4 p-5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg">
        <Handshake className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{adalahMou(mou) ? "Tindak lanjut dari MoU" : "Turunan dari kontrak payung"}</p>
        <p className="teks-panjang text-base font-bold transition-colors group-hover:text-brand sm:truncate">{mou.judul}</p>
        <p className="teks-panjang text-xs text-muted sm:truncate">
          <span className="font-mono">{mou.nomorKontrak || mou.nomorPengajuan}</span> · {mou.mitra || "-"} · berlaku sampai {formatTanggal(mou.tanggalBerakhir)}
        </p>
      </div>
      <LencanaStatus status={mou.status} />
    </Link>
  );
}

/** Untuk MoU dan kontrak payung berplafon: pemakaian plafon dan daftar kontrak turunan yang menaut ke sini. */
function PanelTurunan({ k, turunan, semua }: { k: Kontrak; turunan: Kontrak[]; semua: Kontrak[] }) {
  const navigate = useNavigate();
  const { ke } = useRuang();
  const { sesi } = useSesi();
  const boleh = bisaAjukanAddendum(k, sesi);
  const mou = adalahMou(k);
  // Privasi: judul turunan milik divisi lain tidak ditampilkan; angkanya tetap masuk ke bar plafon (agregat).
  const terlihat = turunan.filter((t) => bisaLihat(t, sesi));
  const tersembunyi = turunan.length - terlihat.length;
  return (
    <section className="kartu overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-bold">
            <Handshake className="h-4 w-4" aria-hidden="true" /> Kontrak turunan
            {turunan.length > 0 && <span className="angka rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-muted">{turunan.length}</span>}
          </h2>
          <p className="text-xs text-muted">{mou ? "MoU tidak bernilai. Nilai dan pekerjaannya ada di kontrak pelaksana yang menaut ke sini." : "Kontrak payung berplafon. Pemakaiannya dihitung dari kontrak turunan yang menaut ke sini."}</p>
        </div>
        {boleh && (
          <Tombol kecil ikon={<GitBranchPlus className="h-4 w-4" />} onClick={() => navigate(ke.ajukanTurunan(k.id))}>
            Ajukan kontrak turunan
          </Tombol>
        )}
      </div>
      <BarPlafon payung={k} semua={semua} className="border-b border-line px-5 py-4 sm:px-6" />
      {turunan.length === 0 ? (
        <Kosong
          judul="Belum ada kontrak turunan"
          teks={k.status === "Aktif" ? `Saat kerja sama mulai dijalankan, ajukan kontrak pelaksananya dan tautkan ke ${mou ? "MoU" : "kontrak payung"} ini.` : `Kontrak turunan bisa diajukan setelah ${mou ? "MoU" : "kontrak payung"} berlaku (Aktif).`}
          ikon={<Handshake className="h-6 w-6" />}
        />
      ) : (
        <>
          {terlihat.length > 0 && (
            <ul className="divide-y divide-line">
              {terlihat.map((t) => (
                <li key={t.id}>
                  <Link to={ke.detail(t.id)} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-raised sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="teks-panjang font-semibold transition-colors group-hover:text-brand sm:truncate">{t.judul}</p>
                      <p className="teks-panjang mt-0.5 text-xs text-muted sm:truncate">
                        <span className="font-mono">{t.nomorPengajuan}</span> · {t.jenis} · {teksNilai(t)}
                      </p>
                    </div>
                    <LencanaStatus status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {tersembunyi > 0 && (
            <p className={cx("px-5 py-3 text-xs text-muted sm:px-6", terlihat.length > 0 && "border-t border-line")}>
              {tersembunyi} kontrak turunan lain milik divisi lain tidak ditampilkan, tetapi nilainya ikut dihitung di pemakaian plafon.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Untuk kontrak aktif yang hampir habis: ajakan memperpanjang lewat addendum. */
function BannerBerakhir({ k, berakhir, berjalan }: { k: Kontrak; berakhir: string; berjalan: number }) {
  const navigate = useNavigate();
  const { ke } = useRuang();
  const { sesi } = useSesi();
  const n = selisihHari(berakhir);
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[22px] border border-accent bg-accent-soft p-5 text-accent-ink">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent text-accent-on">
        <CalendarClock className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{n < 0 ? "Masa berlaku kontrak sudah lewat" : `Kontrak ini berakhir ${sisaHari(berakhir)}`}</p>
        <p className="text-sm opacity-90">
          {berjalan > 0 ? `Sudah ada ${berjalan} addendum yang sedang diproses. Pantau di bagian addendum di bawah.` : k.perpanjanganOtomatis ? "Kontrak ini diperpanjang otomatis. Bila tidak ingin dilanjutkan, beri tahu mitra sebelum batas pemberitahuan." : "Bila ingin dilanjutkan, ajukan addendum perpanjangan sebelum tanggal berakhir."}
        </p>
      </div>
      {bisaAjukanAddendum(k, sesi) && (
        <Tombol className="!bg-none bg-accent !text-accent-on" ikon={<GitBranchPlus className="h-4 w-4" />} onClick={() => navigate(ke.ajukanAddendum(k.id))}>
          Ajukan addendum
        </Tombol>
      )}
    </div>
  );
}

function PanelAddendum({ k, ring }: { k: Kontrak; ring: RingkasanAddendum }) {
  const navigate = useNavigate();
  const { ke } = useRuang();
  const { sesi } = useSesi();
  const boleh = bisaAjukanAddendum(k, sesi);
  return (
    <section className="kartu overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-bold">
            <Layers className="h-4 w-4" aria-hidden="true" /> Addendum
            {ring.daftar.length > 0 && <span className="angka rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-muted">{ring.daftar.length}</span>}
          </h2>
          <p className="text-xs text-muted">Perubahan resmi atas kontrak ini, masing-masing dengan alur review sendiri.</p>
        </div>
        {boleh && (
          <Tombol kecil ikon={<GitBranchPlus className="h-4 w-4" />} onClick={() => navigate(ke.ajukanAddendum(k.id))}>
            Ajukan addendum
          </Tombol>
        )}
      </div>
      {ring.daftar.length === 0 ? (
        <Kosong judul="Belum ada addendum" teks={k.status === "Aktif" ? "Bila ada perpanjangan atau perubahan isi kontrak, ajukan sebagai addendum." : "Addendum hanya bisa diajukan untuk kontrak yang sedang berlaku."} ikon={<Layers className="h-6 w-6" />} />
      ) : (
        <ol className="divide-y divide-line">
          {ring.daftar.map((a) => (
            <li key={a.id}>
              <Link to={ke.detail(a.id)} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-raised sm:px-6">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-extrabold text-brand-strong">{a.urutanAddendum ?? "?"}</span>
                <div className="min-w-0 flex-1">
                  <p className="teks-panjang font-semibold transition-colors group-hover:text-brand sm:truncate">{a.judul}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span className="font-mono">{a.nomorPengajuan}</span>
                    {a.tanggalBerakhir && <span>· berakhir {formatTanggal(a.tanggalBerakhir)}</span>}
                    {a.nilai != null && (
                      <span className="angka">
                        · {a.nilai > 0 ? "+" : ""}
                        {formatUang(a.nilai, a.mataUang)}
                      </span>
                    )}
                  </p>
                  {a.jenisPerubahan.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {a.jenisPerubahan.map((j) => (
                        <Lencana key={j}>{j}</Lencana>
                      ))}
                    </span>
                  )}
                </div>
                <LencanaStatus status={a.status} />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// --- Riwayat & diskusi ------------------------------------------------------

/** Baris Detail yang hanya untuk Ruang Admin (cara kontrak berakhir bisa sensitif, mis. Sengketa). */
const KOLOM_DETAIL_INTERNAL = [LABEL_MODE_BERAKHIR];

function PanelRiwayat({ k, q }: { k: Kontrak; q: ReturnType<typeof useMuat<Aktivitas[]>> }) {
  const { sesi, pengguna } = useSesi();
  const { ruang } = useRuang();
  const tautanJejak = ruang === "admin" && bolehLihatJejak(sesi);
  const detailTampil = (d: DetailPerubahan[]) => (ruang === "admin" ? d : d.filter((x) => !KOLOM_DETAIL_INTERNAL.includes(x.kolom)));
  const namaPengguna = useMemo(() => pengguna.map((p) => p.nama), [pengguna]);
  const proses = !STATUS_SELESAI.includes(k.status);

  return (
    <section className="kartu flex flex-col self-start overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-bold">
            <MessageSquare className="h-4 w-4" /> Riwayat & diskusi
          </h2>
          {proses && <p className="text-xs text-muted">Sebut rekan dengan @nama supaya mereka dikabari.</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {tautanJejak && (
            <Link
              to={`/jejak-audit?kontrak=${k.id}`}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
              title="Buka di Jejak Audit"
              aria-label="Buka riwayat kontrak ini di Jejak Audit"
            >
              <History className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
          <button
            onClick={() => void q.muatUlang()}
            className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
            title="Muat ulang"
            aria-label="Muat ulang riwayat"
          >
            <RefreshCw className={cx("h-4 w-4", q.loading && "animate-spin")} aria-hidden="true" />
          </button>
        </div>
      </div>

      <KotakDiskusi kontrak={k} aktivitas={q} onBerubah={q.muatUlang} />

      {q.loading && !q.data ? (
        <Memuat teks="Memuat riwayat…" />
      ) : q.error ? (
        <div className="p-4">
          <KotakError error={q.error} ulangi={q.muatUlang} />
        </div>
      ) : !q.data?.length ? (
        <Kosong judul="Belum ada riwayat" />
      ) : (
        <ol className="scroll-halus max-h-[640px] overflow-y-auto p-5">
          {q.data.map((a, i) => {
            const Ikon = ikonAktivitas(a.jenis);
            const diskusi = a.jenis === "Komentar" || a.jenis === "Pengingat";
            const kelasPesan = cx("mt-1.5 whitespace-pre-wrap break-words text-sm", (diskusi || a.jenis === "Status") && "rounded-xl bg-raised px-3 py-2");
            return (
              <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
                {i < q.data!.length - 1 && <span className="absolute left-4 top-9 -ml-px h-[calc(100%-2.25rem)] w-px bg-line" aria-hidden="true" />}
                <span className={cx("relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full", warnaAktivitas(a.jenis))}>
                  <Ikon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{a.olehNama}</span> <span className="text-muted">{keteranganAktivitas(a)}</span>
                  </p>
                  {a.jenis === "Status" && a.statusKe && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      {a.statusDari && <span className="text-muted">{a.statusDari} →</span>}
                      <LencanaStatus status={a.statusKe as Kontrak["status"]} />
                    </p>
                  )}
                  {a.pesan && a.jenis !== "Dibuat" && (diskusi ? <TeksDiskusi teks={a.pesan} nama={namaPengguna} className={kelasPesan} /> : <p className={kelasPesan}>{a.pesan}</p>)}
                  {detailTampil(a.detail).length > 0 && (
                    <dl className="mt-1.5 space-y-1 rounded-xl border border-line px-3 py-2 text-xs">
                      {detailTampil(a.detail).map((d, j) => (
                        <div key={`${d.kolom}-${j}`} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                          <dt className="font-semibold">{d.kolom}:</dt>
                          <dd className="min-w-0 break-words text-muted">
                            <span className="line-through decoration-line">{d.dari || "kosong"}</span>
                            <span aria-hidden="true"> → </span>
                            <span className="sr-only"> menjadi </span>
                            <span className="text-ink">{d.ke || "kosong"}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className="mt-1 text-xs text-muted" title={formatWaktu(a.waktu)}>
                    {formatMasukRingkas(a.waktu)} WIB · {formatRelatif(a.waktu)}
                    {a.disebut.length > 0 && ` · menyebut ${a.disebut.length} orang`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const IKON_AKTIVITAS: Record<JenisAktivitas, LucideIcon> = {
  Dibuat: FilePlus2,
  Status: ArrowRightLeft,
  Komentar: MessageSquare,
  Dokumen: Paperclip,
  Perubahan: Pencil,
  Penugasan: Users,
  Pengingat: BellRing,
  Arsip: Archive,
  "Tanda Tangan": PenLine,
};
const WARNA_AKTIVITAS: Record<JenisAktivitas, string> = {
  Dibuat: "bg-brand-soft text-brand-strong",
  Status: "bg-accent-soft text-accent-ink",
  Komentar: "bg-info-soft text-info",
  Dokumen: "bg-success-soft text-success",
  Perubahan: "bg-raised text-muted",
  Penugasan: "bg-brand-soft text-brand-strong",
  Pengingat: "bg-accent-soft text-accent-ink",
  Arsip: "bg-raised text-muted",
  "Tanda Tangan": "bg-success-soft text-success",
};

// Data dari SharePoint bisa memuat jenis yang belum dikenal aplikasi; jatuh ke tampilan "Perubahan".
function ikonAktivitas(jenis: string): LucideIcon {
  return (IKON_AKTIVITAS as Partial<Record<string, LucideIcon>>)[jenis] ?? Pencil;
}
function warnaAktivitas(jenis: string): string {
  return (WARNA_AKTIVITAS as Partial<Record<string, string>>)[jenis] ?? "bg-raised text-muted";
}

function keteranganAktivitas(a: Aktivitas): string {
  switch (a.jenis) {
    case "Dibuat":
      return "mengajukan kontrak";
    case "Status":
      return "mengubah status";
    case "Komentar":
      return "menulis catatan";
    case "Dokumen":
      return "mengelola dokumen";
    case "Perubahan":
      return "memperbarui data";
    case "Penugasan":
      return "mengatur penugasan PIC";
    case "Pengingat":
      return "mengirim pengingat";
    default:
      return "mencatat aktivitas";
  }
}
