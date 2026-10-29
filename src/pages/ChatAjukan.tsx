// Pengajuan kontrak dalam bentuk percakapan layar penuh. Ini skrip pertanyaan bertahap, bukan AI:
// tidak butuh API key. Kalimatnya divariasikan (lihat lib/kata.ts) supaya tidak terasa monoton.
// Jawaban dikumpulkan, dipratinjau langsung di sisi kanan, lalu diringkas dan bisa diubah per bagian.
// Isian disimpan sebagai draf di peramban (lib/draf) sampai pengajuan terkirim, jadi bisa dilanjutkan nanti.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Activity, AlertTriangle, Bot, Building2, Check, Clock, Eye, FileText, Lock, MessageSquarePlus, Moon, Pencil, RotateCcw, Send, Sun, X } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { useMuat } from "../hooks/useMuat";
import { useTema } from "../hooks/useTema";
import { useCegahTutup } from "../hooks/useCegahTutup";
import { useAreaTampak } from "../hooks/useAreaTampak";
import { useLapisan } from "../lib/lapisan";
import { ambilKontrak, ambilSemuaKontrak, buatKontrak, selesaikanPengajuan } from "../services/kontrak";
import { antreanLegal, posisiAntrean, teksPosisi } from "../lib/antrean";
import { unggahBanyak } from "../services/dokumen";
import { catatAktivitas } from "../services/aktivitas";
import { adalahLegal, bisaAjukan, bisaAjukanAddendum, bisaLihat } from "../lib/alur";
import { adalahAddendum, judulUsulanAddendum, ringkasAddendum } from "../lib/addendum";
import { daftarMouAktif } from "../lib/mou";
import { peringatanTurunanBaru } from "../lib/plafon";
import { konteksDraf, teksLampirkanUlang, validasiUlangDraf } from "../lib/draf";
import { bacaParamSalin, dariKontrak, sapaanSerupa, type HasilSerupa } from "../lib/serupa";
import { bacaDivisiTerakhir, divisiAwalPengajuan, ingatDivisiTerakhir } from "../lib/akses";
import { LABEL_KANTOR_PUSAT, PROYEK_KANTOR_PUSAT, catatanMataUangAddendum, mataUangTerkunci, proyekTerakhir, rapikanProyek, rapikanReferensi, saranProyek, teksProyekReferensi, warisanAcuan } from "../lib/isianPengajuan";
import { kekuranganDokumen, teksSusulan } from "../lib/syarat";
import type { SaranIsian } from "../lib/pemindai";
import { bacaNilai, formatMasuk, formatTanggal, formatUang, selisihHari, tambahHari } from "../lib/format";
import { EASE_KELUAR, itemKecil, pegas, pegasLembut, pegasMantul, tekan } from "../lib/gerak";
import { GAGAL_CHAT, KOSONG_BERKAS, PEMBUKA_CHAT, PENGANTAR_BERIKUT, RINGKASAN_CHAT, SAPAAN_CHAT, SELESAI_CHAT, buatPemilih, waktuHariIni } from "../lib/kata";
import {
  DIVISI_PENGAJU,
  JENIS_ADDENDUM,
  JENIS_KONTRAK,
  JENIS_MOU,
  JENIS_PERUBAHAN,
  MATA_UANG,
  PRIORITAS,
  type DivisiPengaju,
  type JenisKontrak,
  type JenisPerubahan,
  type Kontrak,
  type KontrakInput,
  type MataUang,
  type Prioritas,
  type Ymd,
} from "../lib/types";
import { Kontainer, KotakError, Memuat, Modal, MotionLapisan, Tombol, cx } from "../components/ui";
import BannerDraf, { useDrafPengajuan } from "../components/BannerDraf";
import GalatKirim from "../components/GalatKirim";
import UnggahDokumen, { type BerkasAntre } from "../components/UnggahDokumen";
import { UnggahCerdas } from "../components/UnggahCerdas";
import { PeringatanGanda } from "../components/PeringatanGanda";
import { PenghitungSyarat } from "../components/PanelSyarat";
import { ChipSaranMitra, rapikanMitra, useDataSaranMitra, type DataSaranMitra } from "../components/SaranMitra";

// --- Data & langkah -----------------------------------------------------------

interface Data {
  judul: string;
  jenis: JenisKontrak;
  kontrakIndukId: number | null;
  mouAcuanId: number | null;
  jenisPerubahan: JenisPerubahan[];
  mitra: string;
  /** Tautan ke master Mitra bila nama cocok persis atau dipilih dari saran. */
  mitraId: number | null;
  divisi: DivisiPengaju;
  /** Kode proyek (atau "Kantor Pusat") dan nomor PR/PO/SPK dipisah koma. Keduanya boleh menyusul (kosong). */
  kodeProyek: string;
  nomorReferensi: string;
  nilai: number | null;
  mataUang: MataUang;
  tanggalMulai: Ymd | null;
  tanggalBerakhir: Ymd | null;
  targetSelesai: Ymd | null;
  prioritas: Prioritas;
  deskripsi: string;
  /** Berkas yang dipilih beserta jenisnya. Isinya tidak ikut tersimpan di draf. */
  berkas: BerkasAntre[];
  /** Pengaju menyatakan dokumen wajib yang belum ada akan menyusul. */
  susulan: boolean;
  /** "Ajukan serupa": ID kontrak sumber. */
  salinDari: number | null;
}

/** Dokumen wajib yang belum ada di antrean berkas. */
const kurangWajib = (d: Pick<Data, "jenis" | "berkas">) => kekuranganDokumen(d.jenis, d.berkas.map((b) => b.jenis)).kurang;

type IdLangkah = "judul" | "jenis" | "induk" | "perubahan" | "acuan" | "mitra" | "divisi" | "proyek" | "nilai" | "masa" | "target" | "prioritas" | "deskripsi" | "berkas";

interface Langkah {
  id: IdLangkah;
  label: string;
  /** Beberapa versi pertanyaan; satu dipilih tiap kali. */
  tanya: string[];
  /** Versi pertanyaan khusus addendum (dipakai bila jenisnya Addendum). */
  tanyaAdd?: string[];
  /** Versi pertanyaan khusus MoU. */
  tanyaMou?: string[];
  /** Langkah dilewati otomatis (jawabannya sudah pasti atau tidak relevan). */
  lewati?: (d: Data, s: { legal: boolean; adaMou: boolean; tanyaDivisi: boolean }) => boolean;
}

const LANGKAH: Langkah[] = [
  { id: "judul", label: "Judul", tanyaMou: ["Apa judul MoU-nya? Contoh: “MoU Kerja Sama Penyediaan Material Proyek Tol X”.", "Beri judul untuk MoU ini."], tanyaAdd: ["Judul addendumnya apa? Saya sudah siapkan usulan di bawah, tinggal pilih atau ketik sendiri.", "Beri judul untuk addendum ini. Usulan judulnya ada di bawah."], tanya: ["Apa judul kontraknya? Contoh: “Pengadaan Beton Ready Mix Proyek Tol X”.", "Kita mulai dari judulnya. Kontrak ini tentang apa?", "Beri kontrak ini judul yang mudah dikenali, misalnya “Sewa Alat Berat Proyek Tol X”."] },
  { id: "jenis", label: "Jenis kontrak", tanya: ["Jenis kontraknya apa?", "Ini termasuk jenis kontrak yang mana?", "Pilih jenis yang paling sesuai ya."] },
  { id: "induk", label: "Kontrak induk", tanya: ["Addendum ini mengubah atau memperpanjang kontrak yang mana?", "Kontrak induknya yang mana? Pilih dari kontrak yang sudah berjalan."], lewati: (d) => d.jenis !== JENIS_ADDENDUM },
  { id: "perubahan", label: "Yang diubah", tanya: ["Apa yang diubah oleh addendum ini? Boleh pilih lebih dari satu.", "Addendum ini mengubah apa saja? Pilih semua yang sesuai."], lewati: (d) => d.jenis !== JENIS_ADDENDUM },
  { id: "acuan", label: "Dasar MoU", tanya: ["Apakah kontrak ini tindak lanjut dari sebuah MoU yang sudah berjalan?", "Kontrak ini lanjutan dari MoU tertentu? Kalau iya, pilih MoU-nya."], lewati: (d, s) => d.jenis === JENIS_ADDENDUM || d.jenis === JENIS_MOU || !s.adaMou },
  { id: "mitra", label: "Mitra / vendor", tanyaMou: ["Dengan siapa MoU ini dibuat?", "Siapa pihak lain dalam MoU ini?"], tanya: ["Siapa mitra atau vendornya?", "Kontrak ini dengan pihak mana?", "Nama mitra atau vendornya siapa?"] },
  // Ditanyakan kepada Legal, dan kepada akun kantor yang masuk otomatis tanpa divisi.
  { id: "divisi", label: "Divisi pengaju", tanya: ["Dari divisi mana pengajuan ini?", "Pengajuan ini atas nama divisi mana?"], lewati: (_d, s) => !s.tanyaDivisi },
  // Satu langkah gabungan proyek dan nomor PR/PO/SPK (U12); boleh "Menyusul".
  {
    id: "proyek",
    label: "Proyek & referensi",
    tanyaMou: ["MoU ini terkait proyek tertentu? Bila tidak, pilih “Kantor pusat / bukan proyek”. Nomor referensi boleh dikosongkan.", "Untuk proyek mana MoU ini? Kalau bukan untuk proyek, pilih “Kantor pusat / bukan proyek”."],
    tanyaAdd: ["Addendum ini untuk proyek mana, dan adakah nomor PR, PO, atau SPK-nya? Boleh menyusul.", "Kode proyek dan nomor PR/PO/SPK untuk addendum ini? Kalau belum ada, pilih “Menyusul”."],
    tanya: ["Untuk proyek mana kontrak ini, dan berapa nomor PR, PO, atau SPK-nya? Boleh menyusul kalau belum ada.", "Kontrak ini untuk proyek apa? Sertakan juga nomor PR/PO/SPK bila sudah ada; kalau belum, pilih “Menyusul”."],
  },
  { id: "nilai", label: "Nilai kontrak", lewati: (d) => d.jenis === JENIS_MOU, tanyaAdd: ["Berapa selisih nilainya terhadap kontrak induk? Tambahan ditulis biasa, pengurangan pakai tanda minus. Bila tidak mengubah nilai, pilih tombol di bawah.", "Nilai kontrak berubah berapa? Isi selisihnya saja (contoh 250.000.000 atau -50.000.000)."], tanya: ["Berapa nilai kontraknya? Kalau tidak ada nilai (misalnya NDA), pilih “Tidak ada nilai”.", "Perkiraan nilainya berapa? Untuk kontrak tanpa nilai, pakai tombol di bawah.", "Nilai kontraknya berapa?"] },
  { id: "masa", label: "Masa berlaku", tanyaMou: ["Berapa lama MoU ini berlaku? Isi tanggal mulai dan berakhirnya, atau lewati bila belum pasti.", "MoU ini berlaku dari kapan sampai kapan?"], tanyaAdd: ["Kapan addendum ini mulai berlaku, dan sampai kapan masa berlaku kontrak setelah diubah? Lewati bila waktunya tidak berubah.", "Masa berlaku barunya bagaimana? Isi tanggal mulai addendum dan tanggal berakhir yang baru."], tanya: ["Kapan masa berlaku kontraknya? Isi tanggal mulai dan berakhir, atau lewati bila belum pasti.", "Kontrak berlaku dari kapan sampai kapan?", "Masa berlakunya? Boleh dilewati kalau masih dinegosiasikan."] },
  { id: "target", label: "Target review", tanya: ["Kapan kontrak ini dibutuhkan selesai direview Legal?", "Idealnya kapan Legal perlu menyelesaikan reviewnya?", "Targetnya selesai kapan?"] },
  { id: "prioritas", label: "Prioritas", tanya: ["Seberapa mendesak?", "Bagaimana tingkat prioritasnya?", "Seberapa cepat ini perlu diproses?"] },
  { id: "deskripsi", label: "Deskripsi", tanyaMou: ["Apa ruang lingkup kerja sama dalam MoU ini? Ceritakan singkat supaya Legal paham maksud kesepahamannya.", "Kerja sama apa yang dituangkan di MoU ini? Tuliskan poin utamanya."], tanya: ["Ada ruang lingkup pekerjaan atau catatan untuk Legal? Boleh dilewati.", "Adakah hal yang perlu Legal ketahui, seperti lokasi proyek atau syarat khusus?", "Catatan tambahan untuk Legal? Kalau tidak ada, lewati saja."] },
  { id: "berkas", label: "Dokumen", tanya: ["Terakhir, lampirkan draft kontrak dan dokumen pendukung. Bisa juga diunggah nanti.", "Langkah terakhir: ada draft atau dokumen pendukung yang mau dilampirkan?", "Hampir selesai! Lampirkan draft kontrak bila sudah ada."] },
];

const KETERANGAN_PRIORITAS: Record<Prioritas, string> = {
  Normal: "Sesuai antrean biasa",
  Tinggi: "Perlu diproses lebih cepat",
  Mendesak: "Mengganggu pekerjaan bila tertunda",
};

/** Versi pertanyaan yang sesuai jenis kontraknya (addendum, MoU, atau umum). */
const varianTanya = (l: Langkah, d: Data): string[] => (d.jenis === JENIS_ADDENDUM && l.tanyaAdd) || (d.jenis === JENIS_MOU && l.tanyaMou) || l.tanya;

const gerakKurang = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Jeda "sedang mengetik" paling lama, dan versi cepat untuk reaksi singkat (U08: sekitar 350 ms). */
const JEDA_MAKS_MS = 350;
const JEDA_CEPAT_MS = 280;

/** Reaksi singkat setelah sebuah jawaban. `wajib` = selalu ditampilkan karena isinya bermakna. */
function reaksi(id: IdLangkah, d: Data, pilih: ReturnType<typeof buatPemilih>): { teks: string; wajib: boolean } | null {
  switch (id) {
    case "judul":
      return { teks: pilih("a-judul", [`“${d.judul}”, judul yang jelas.`, "Oke, judulnya sudah saya catat.", "Siap, tercatat."]), wajib: false };
    case "jenis":
      if (d.jenis === JENIS_ADDENDUM) return { teks: "Addendum ya, berarti saya perlu tahu kontrak induknya.", wajib: true };
      if (d.jenis === JENIS_MOU) return { teks: "MoU ya. MoU biasanya tanpa nilai, jadi pertanyaan nilai saya lewati. Nilai kerja samanya nanti ada di kontrak pelaksananya.", wajib: true };
      if (d.jenis === "Kerahasiaan (NDA)") return { teks: "NDA biasanya cepat direview Legal.", wajib: true };
      if (d.jenis === "Sewa") return { teks: "Kontrak sewa, noted.", wajib: false };
      return { teks: pilih("a-jenis", [`${d.jenis}, siap.`, "Oke, jenisnya sudah masuk."]), wajib: false };
    case "induk":
      return d.kontrakIndukId != null
        ? { teks: `Kontrak induknya sudah saya tautkan. Mitra${d.kodeProyek ? ", divisi, dan proyeknya" : " dan divisinya"} ikut saya isi dari sana, dan mata uangnya mengikuti induk (${d.mataUang}).`, wajib: true }
        : { teks: "Baik, nanti Legal yang menautkan kontrak induknya.", wajib: false };
    case "acuan":
      return d.mouAcuanId ? { teks: `Baik, kontrak ini saya tautkan ke MoU-nya. Mitra${d.kodeProyek ? ", divisi, dan proyeknya" : " dan divisinya"} ikut terisi.`, wajib: true } : { teks: "Oke, kontrak ini berdiri sendiri.", wajib: false };
    case "perubahan":
      if (d.jenisPerubahan.includes("Perpanjangan Waktu")) return { teks: "Perpanjangan waktu ya, nanti saya tanyakan tanggal berakhir barunya.", wajib: true };
      return { teks: d.jenisPerubahan.length ? "Perubahannya sudah saya catat." : "Baik, Legal yang akan menelaah isinya.", wajib: false };
    case "mitra":
      return { teks: pilih("a-mitra", [`Baik, mitranya ${d.mitra}.`, `${d.mitra}, dicatat.`, "Mitra sudah masuk."]), wajib: false };
    case "divisi":
      return { teks: `Atas nama divisi ${d.divisi}.`, wajib: false };
    case "proyek": {
      const proyek = rapikanProyek(d.kodeProyek);
      const ref = rapikanReferensi(d.nomorReferensi);
      if (!proyek && !ref) return { teks: "Baik, proyek dan nomor referensinya menyusul. Bisa dilengkapi nanti dari halaman kontrak.", wajib: true };
      if (proyek === PROYEK_KANTOR_PUSAT) return { teks: ref ? "Kontrak kantor pusat, nomor referensinya juga sudah saya catat." : "Kontrak kantor pusat, dicatat.", wajib: false };
      return { teks: proyek ? `Proyek ${proyek}${ref ? ", lengkap dengan nomor referensinya" : ""}. Dicatat.` : "Nomor referensinya sudah saya catat; proyeknya menyusul.", wajib: false };
    }
    case "nilai":
      if (d.jenis === JENIS_ADDENDUM && d.nilai == null) return { teks: "Nilainya tetap, tidak ada selisih.", wajib: true };
      if (d.jenis === JENIS_ADDENDUM && d.nilai != null && d.nilai < 0) return { teks: "Ada pengurangan nilai, saya catat sebagai selisih negatif.", wajib: true };
      if (d.nilai == null) return { teks: "Tanpa nilai, jadi lebih sederhana.", wajib: true };
      if (d.mataUang === "IDR" && d.nilai >= 1_000_000_000) return { teks: "Nilainya cukup besar. Legal akan mereviewnya dengan teliti.", wajib: true };
      return { teks: pilih("a-nilai", ["Nilai sudah dicatat.", "Oke, nilainya masuk."]), wajib: false };
    case "masa": {
      if (!d.tanggalMulai || !d.tanggalBerakhir) return { teks: d.jenis === JENIS_ADDENDUM ? "Waktu berlakunya tidak berubah, siap." : "Masa berlaku menyusul ya, tidak masalah.", wajib: true };
      const bulan = Math.max(1, Math.round((selisihHari(d.tanggalBerakhir) - selisihHari(d.tanggalMulai)) / 30));
      return { teks: bulan >= 12 ? `Sekitar ${Math.round(bulan / 12)} tahun lebih. Jangka yang lumayan panjang.` : `Sekitar ${bulan} bulan.`, wajib: true };
    }
    case "target":
      if (!d.targetSelesai) return { teks: "Tanpa target, Legal akan menjadwalkan sesuai antrean.", wajib: true };
      return { teks: pilih("a-target", ["Targetnya saya catat.", "Oke, ini akan jadi acuan Legal."]), wajib: false };
    case "prioritas":
      if (d.prioritas === "Mendesak") return { teks: "Saya tandai mendesak supaya Legal melihatnya lebih dulu.", wajib: true };
      if (d.prioritas === "Tinggi") return { teks: "Prioritas tinggi, siap.", wajib: true };
      return { teks: "Antrean normal, oke.", wajib: false };
    case "deskripsi":
      return d.deskripsi ? { teks: "Catatannya sudah saya teruskan ke ringkasan.", wajib: false } : { teks: "Tidak apa-apa, bisa ditambah nanti.", wajib: false };
    case "berkas": {
      const kurang = kurangWajib(d);
      const sisa = d.susulan && kurang.length ? ` Sisanya (${kurang.length} dokumen wajib) saya catat akan menyusul, jadi Legal sudah tahu.` : "";
      return d.berkas.length ? { teks: `${d.berkas.length} berkas siap diunggah.${sisa}`, wajib: true } : { teks: sisa ? `Tidak apa-apa.${sisa}` : pilih("a-berkas", KOSONG_BERKAS), wajib: true };
    }
  }
}

interface Pesan {
  id: number;
  dari: "bot" | "saya";
  teks: string;
}

// --- Komponen visual ---------------------------------------------------------

/** Bola asisten: berdenyut saat mengetik. */
function Orb({ aktif, ukuran = 36 }: { aktif?: boolean; ukuran?: number }) {
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: ukuran, height: ukuran }} aria-hidden="true">
      <motion.span className="absolute inset-0 rounded-full bg-gradient-to-br from-teal-300 via-brand to-indigo-500 shadow-lg" animate={aktif ? { scale: [1, 1.14, 1], rotate: [0, 90, 180] } : { scale: 1, rotate: 0 }} transition={aktif ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : pegasLembut} />
      <span className="absolute inset-[3px] rounded-full bg-gradient-to-br from-white/25 to-transparent" />
      <Bot className="relative text-white" style={{ width: ukuran * 0.5, height: ukuran * 0.5 }} />
    </span>
  );
}

function Gelembung({ p, avatar }: { p: Pesan; avatar: boolean }) {
  const saya = p.dari === "saya";
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 14, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={pegasMantul} style={{ transformOrigin: saya ? "bottom right" : "bottom left" }} className={cx("flex items-end gap-2.5", saya && "flex-row-reverse")}>
      {!saya && (avatar ? <Orb /> : <span className="w-9 shrink-0" />)}
      <p className={cx("max-w-[85%] whitespace-pre-wrap break-words px-4 py-3 text-[15px] leading-relaxed sm:max-w-[78%]", saya ? "rounded-3xl rounded-br-lg bg-gradient-to-br from-brand to-brand-strong text-brand-on shadow-[0_10px_24px_-12px_var(--wh-brand)]" : "rounded-3xl rounded-bl-lg border border-line bg-surface text-ink shadow-card")}>{p.teks}</p>
    </motion.div>
  );
}

function Mengetik() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} className="flex items-end gap-2.5" role="status" aria-label="Asisten sedang mengetik">
      <Orb aktif />
      <div className="flex items-center gap-1.5 rounded-3xl rounded-bl-lg border border-line bg-surface px-5 py-4 shadow-card">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="h-2 w-2 rounded-full bg-brand" animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }} />
        ))}
      </div>
    </motion.div>
  );
}

/** Tombol pilihan cepat. Di layar sentuh tingginya minimal 44 px. `terpilih` menandai jawaban yang sedang dipakai. */
function Pilihan({ onPilih, children, ikon, terpilih }: { onPilih: () => void; children: ReactNode; ikon?: ReactNode; terpilih?: boolean }) {
  return (
    <motion.button
      type="button"
      variants={itemKecil}
      whileHover={{ y: -2, scale: 1.03 }}
      whileTap={tekan}
      transition={pegas}
      onClick={onPilih}
      aria-pressed={terpilih}
      className={cx(
        "kilat inline-flex items-center gap-1.5 rounded-full border border-brand px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-brand hover:text-brand-on [@media(pointer:coarse)]:min-h-11",
        terpilih ? "bg-brand text-brand-on" : "bg-surface text-brand",
      )}
    >
      {ikon}
      {children}
    </motion.button>
  );
}

/** Latar aurora: tiga cahaya lembut yang bergerak pelan. Hanya transform, jadi ringan. */
function Aurora() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <motion.div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-brand opacity-20 blur-3xl" animate={{ x: [0, 80, 0], y: [0, 60, 0] }} transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-accent opacity-20 blur-3xl" animate={{ x: [0, -70, 0], y: [0, 80, 0] }} transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute -bottom-48 left-1/3 h-[32rem] w-[32rem] rounded-full bg-info opacity-15 blur-3xl" animate={{ x: [0, 60, 0], y: [0, -50, 0] }} transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }} />
    </div>
  );
}

const WARNA_KONFETI = ["var(--wh-brand)", "var(--wh-accent)", "var(--wh-info)", "var(--wh-success)", "var(--wh-danger)"];

function Konfeti() {
  const partikel = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => {
        const sudut = (i / 44) * Math.PI * 2 + Math.random() * 0.6;
        const jarak = 140 + Math.random() * 240;
        return { i, x: Math.cos(sudut) * jarak, y: Math.sin(sudut) * jarak - 60, putar: Math.random() * 720 - 360, warna: WARNA_KONFETI[i % WARNA_KONFETI.length]!, lebar: 6 + Math.random() * 6 };
      }),
    [],
  );
  if (gerakKurang()) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center" aria-hidden="true">
      {partikel.map((p) => (
        <motion.span key={p.i} className="absolute rounded-[2px]" style={{ width: p.lebar, height: p.lebar * 0.55, background: p.warna }} initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }} animate={{ x: p.x, y: p.y + 260, opacity: 0, rotate: p.putar, scale: 0.6 }} transition={{ duration: 1.8 + Math.random() * 0.8, ease: [0.16, 1, 0.3, 1] }} />
      ))}
    </div>
  );
}

function CentangGambar() {
  return (
    <svg viewBox="0 0 52 52" className="h-16 w-16" aria-hidden="true">
      <motion.circle cx="26" cy="26" r="23" fill="none" stroke="var(--wh-success)" strokeWidth="3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: EASE_KELUAR }} />
      <motion.path d="M15 27l8 8 15-17" fill="none" stroke="var(--wh-success)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.5, ease: EASE_KELUAR }} />
    </svg>
  );
}

// --- Percakapan ---------------------------------------------------------------

export default function ChatAjukan() {
  const { sesi } = useSesi();
  const [putaran, setPutaran] = useState(0);
  const [params] = useSearchParams();
  const idInduk = Number(params.get("induk")) || null;
  const idMou = Number(params.get("mou")) || null;
  const idSalin = idInduk || idMou ? null : bacaParamSalin(params);
  const navigate = useNavigate();
  const { ke } = useRuang();
  // Bila dibuka dari "Ajukan Addendum", "Ajukan turunan", atau "Ajukan serupa", data kontrak dimuat dulu
  // supaya bisa diisi otomatis.
  const { data: semua, loading } = useMuat(ambilSemuaKontrak, []);
  // Sumber "Ajukan serupa" dibaca lengkap lewat ambilKontrak (bukan dari daftar), supaya kolom yang hanya
  // dimuat di detail (mis. Deskripsi, U39) tetap ikut tersalin.
  const salinQ = useMuat(() => (idSalin ? ambilKontrak(idSalin).catch(() => null) : Promise.resolve(null)), [idSalin]);
  const daftar = useMemo(() => semua ?? [], [semua]);
  if (!bisaAjukan(sesi)) return <KotakError error={new Error("Peran Anda hanya bisa melihat kontrak.")} />;
  if ((idInduk || idMou || idSalin) && loading && !semua) return <Memuat teks={idSalin ? "Menyiapkan data kontrak yang disalin…" : "Menyiapkan data kontrak induk…"} />;
  if (idSalin && salinQ.loading && !salinQ.data) return <Memuat teks="Menyiapkan data kontrak yang disalin…" />;
  const indukAwal = idInduk ? (daftar.find((k) => k.id === idInduk && !adalahAddendum(k) && bisaAjukanAddendum(k, sesi)) ?? null) : null;
  const mouAwal = idMou ? (daftar.find((k) => k.id === idMou && k.status === "Aktif" && k.jenis === JENIS_MOU && bisaLihat(k, sesi)) ?? null) : null;
  const sumberSalin = idSalin ? (salinQ.data ?? daftar.find((k) => k.id === idSalin) ?? null) : null;
  const serupa = sumberSalin ? dariKontrak(sumberSalin, { semua: daftar, sesi }) : null;
  const ulang = () => {
    // Pengajuan berikutnya setelah "Ajukan serupa" dimulai bersih, bukan menyalin kontrak yang sama lagi.
    if (idSalin) navigate(ke.ajukan, { replace: true });
    setPutaran((p) => p + 1);
  };
  return (
    <Percakapan
      key={`${putaran}-${indukAwal?.id ?? 0}-${mouAwal?.id ?? 0}-${idSalin ?? 0}`}
      indukAwal={indukAwal}
      mouAwal={mouAwal}
      serupa={serupa}
      salinGagal={idSalin != null && !serupa}
      konteks={konteksDraf({ induk: idInduk, mou: idMou, salin: idSalin })}
      semua={daftar}
      onUlang={ulang}
    />
  );
}

type Fase = "tanya" | "ringkasan" | "kirim" | "selesai";

/** Isi draf di peramban: semua jawaban kecuali berkas (isi berkas tidak pernah disimpan, hanya namanya). */
type DataDraf = Omit<Data, "berkas">;

const ID_LANGKAH = new Set<string>(LANGKAH.map((l) => l.id));
const adalahIdLangkah = (x: string): x is IdLangkah => ID_LANGKAH.has(x);

interface PropsPercakapan {
  onUlang: () => void;
  indukAwal: Kontrak | null;
  mouAwal: Kontrak | null;
  /** Data awal dari "Ajukan serupa" (?salin=ID). */
  serupa: HasilSerupa | null;
  /** ?salin ada tetapi kontraknya tidak ditemukan atau tidak boleh disalin. */
  salinGagal: boolean;
  /** Konteks draf (lihat konteksDraf): draf addendum tidak ditawarkan di pengajuan biasa. */
  konteks: string;
  semua: Kontrak[];
}

function Percakapan({ onUlang, indukAwal, mouAwal, serupa, salinGagal, konteks, semua: semuaKontrak }: PropsPercakapan) {
  const lokasiChat = useLocation();
  const { sesi } = useSesi();
  const navigate = useNavigate();
  const { ruang, ke } = useRuang();
  const [gelap, gantiTema] = useTema();
  const legal = adalahLegal(sesi);
  const divisiAwal: DivisiPengaju = divisiAwalPengajuan(sesi);
  // Akun tanpa divisi (masuk otomatis) memilih divisi tiap mengajukan; pilihan terakhirnya diingat per email
  // dan diisikan otomatis di pengajuan berikutnya (tetap bisa diubah di ringkasan).
  const tanpaDivisi = sesi.divisi == null;
  const tanyaDivisi = legal || tanpaDivisi;
  const divisiDiingat = useRef(tanpaDivisi && bacaDivisiTerakhir(sesi.email) != null).current;
  const pilih = useRef(buatPemilih()).current;
  const draf = useDrafPengajuan<DataDraf>({ sumber: "chat", konteks });
  // Ditawari draf lama saat halaman dibuka: pertanyaan pertama ditunda sampai pengguna memilih.
  const adaTawaranAwal = useRef(draf.tawaran != null).current;

  const [data, setData] = useState<Data>(() => ({
    judul: "",
    jenis: indukAwal ? JENIS_ADDENDUM : "Pengadaan Barang",
    kontrakIndukId: indukAwal?.id ?? null,
    mouAcuanId: mouAwal?.id ?? null,
    jenisPerubahan: [],
    mitra: indukAwal?.mitra ?? mouAwal?.mitra ?? "",
    mitraId: indukAwal?.mitraId ?? mouAwal?.mitraId ?? null,
    divisi: indukAwal?.divisi ?? mouAwal?.divisi ?? divisiAwal,
    // Proyek dan referensi diwarisi dari induk atau MoU (U12); mata uang addendum dikunci sama dengan induk (U29A).
    kodeProyek: rapikanProyek((indukAwal ?? mouAwal)?.kodeProyek ?? ""),
    nomorReferensi: rapikanReferensi((indukAwal ?? mouAwal)?.nomorReferensi ?? ""),
    nilai: null,
    mataUang: indukAwal?.mataUang ?? "IDR",
    tanggalMulai: null,
    tanggalBerakhir: null,
    targetSelesai: null,
    prioritas: "Normal",
    deskripsi: "",
    berkas: [],
    susulan: false,
    salinDari: null,
    ...(serupa?.data ?? {}),
  }));
  const [terjawab, setTerjawab] = useState<Set<IdLangkah>>(() => {
    const t = new Set<IdLangkah>(indukAwal ? ["jenis", "induk", "mitra", "divisi"] : mouAwal ? ["acuan", "mitra", "divisi"] : (serupa?.terjawab ?? []));
    // Proyek dari induk/MoU dianggap terjawab; yang kosong tetap ditanyakan.
    if ((indukAwal ?? mouAwal)?.kodeProyek.trim()) t.add("proyek");
    return t;
  });
  const [pesan, setPesan] = useState<Pesan[]>([]);
  const [mengetik, setMengetik] = useState(false);
  const [aktif, setAktif] = useState<IdLangkah | null>(null);
  const [fase, setFase] = useState<Fase>("tanya");
  const [mengubah, setMengubah] = useState(false);
  const [galat, setGalat] = useState("");
  /** Galat saat mengirim (bisa galat sesi yang menawarkan Masuk ulang). */
  const [galatKirim, setGalatKirim] = useState<unknown>(null);
  const [konfirmasiUlang, setKonfirmasiUlang] = useState(false);
  const [progres, setProgres] = useState("");
  const [hasil, setHasil] = useState<Kontrak | null>(null);
  const [posisiBaru, setPosisiBaru] = useState<number | null>(null);
  const [konfirmasiKeluar, setKonfirmasiKeluar] = useState(false);
  // Selama mengirim (menyimpan, mengunggah, mengabari Legal), menutup tab diperingatkan peramban.
  useCegahTutup(fase === "kirim");
  /** Pengguna sudah menjawab sesuatu sendiri (bukan isian otomatis dari tautan). Draf baru disimpan sejak saat ini. */
  const [disentuh, setDisentuh] = useState(false);
  // Layar di bawah xl tidak punya panel pratinjau di sisi kanan; pratinjau dibuka sebagai lembar dari bawah.
  const [lembar, setLembar] = useState(false);
  const refLembar = useRef<HTMLDivElement>(null);
  const tutupLembar = useCallback(() => setLembar(false), []);
  // Escape menutup lembar pratinjau, Tab tertahan di dalamnya, dan fokus kembali ke tombol mata saat ditutup.
  useLapisan(lembar, tutupLembar, { wadah: refLembar, jebakFokus: true });
  // Papan ketik layar: tinggi halaman mengikuti area yang terlihat supaya kolom jawaban tidak tertutup.
  const areaTampak = useAreaTampak();

  const dataRef = useRef(data);
  dataRef.current = data;
  const terjawabRef = useRef(terjawab);
  terjawabRef.current = terjawab;
  const hidup = useRef(true);
  const mulai = useRef(false);
  const pembuka = useRef<Promise<void>>(Promise.resolve());
  const drafDipilih = useRef(false);
  const nomor = useRef(0);
  const dasar = useRef<HTMLDivElement>(null);

  const { data: semua } = useMuat(ambilSemuaKontrak, []);
  const kontrakSemua = semua ?? semuaKontrak;
  const induk = useMemo(() => kontrakSemua.filter((k) => bisaLihat(k, sesi) && k.status === "Aktif" && !adalahAddendum(k)), [kontrakSemua, sesi]);
  const mouAktif = useMemo(() => daftarMouAktif(kontrakSemua).filter((k) => bisaLihat(k, sesi)), [kontrakSemua, sesi]);
  const saranMitra = useDataSaranMitra(semuaKontrak);
  // Saran kode proyek hanya dari kontrak yang boleh dilihat pengaju ini.
  const proyekSaran = useMemo(() => saranProyek(kontrakSemua.filter((k) => bisaLihat(k, sesi))), [kontrakSemua, sesi]);
  const proyekSaya = useMemo(() => proyekTerakhir(kontrakSemua, sesi.email), [kontrakSemua, sesi.email]);

  const s = { legal, adaMou: mouAktif.length > 0, tanyaDivisi };
  const langkahBerlaku = useMemo(() => LANGKAH.filter((l) => !l.lewati?.(data, s)), [data, legal, tanyaDivisi, mouAktif.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const selesaiCount = langkahBerlaku.filter((l) => terjawab.has(l.id)).length;
  const persen = Math.round((selesaiCount / langkahBerlaku.length) * 100);

  useEffect(() => {
    hidup.current = true;
    return () => {
      hidup.current = false;
    };
  }, []);

  useEffect(() => {
    dasar.current?.scrollIntoView({ behavior: gerakKurang() ? "auto" : "smooth", block: "end" });
  }, [pesan, mengetik, aktif, fase]);
  // Papan ketik muncul atau hilang: pesan terakhir tetap terlihat di atas kolom jawaban.
  const tinggiTampak = areaTampak?.tinggi;
  useEffect(() => {
    dasar.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [tinggiTampak]);

  // Draf otomatis: setiap perubahan jawaban disimpan (dengan jeda) di peramban ini. Berkas hanya namanya.
  const simpanDraf = draf.simpan;
  useEffect(() => {
    if (!disentuh) return;
    const { berkas, ...isi } = data;
    simpanDraf(isi, { terjawab, berkas: berkas.map((b) => b.file) });
  }, [data, terjawab, disentuh, simpanDraf]);

  const tambah = useCallback((dari: Pesan["dari"], teks: string) => setPesan((p) => [...p, { id: nomor.current++, dari, teks }]), []);

  const bicara = useCallback(
    async (daftar: string[], cepat = false) => {
      for (const teks of daftar) {
        if (!hidup.current) return;
        setMengetik(true);
        // Jeda mengetik dibuat singkat (paling lama JEDA_MAKS_MS) supaya percakapan terasa cepat.
        await new Promise((r) => setTimeout(r, gerakKurang() ? 0 : cepat ? Math.min(JEDA_CEPAT_MS, 160 + teks.length * 2) : Math.min(JEDA_MAKS_MS, 200 + teks.length * 3)));
        if (!hidup.current) return;
        setMengetik(false);
        tambah("bot", teks);
      }
    },
    [tambah],
  );

  const cariKontrak = (id: number | null | undefined): Kontrak | null => (id == null ? null : (kontrakSemua.find((k) => k.id === id) ?? null));

  /** Langkah berikutnya: berurutan saat pertama kali, atau yang belum terjawab saat mengubah. */
  const cariBerikut = (d: Data, t: Set<IdLangkah>, dari: IdLangkah | null, ubah: boolean): Langkah | null => {
    const mulaiDari = ubah || dari == null ? 0 : LANGKAH.findIndex((l) => l.id === dari) + 1;
    for (const l of LANGKAH.slice(mulaiDari)) {
      if (l.lewati?.(d, s)) continue;
      if (!t.has(l.id)) return l;
    }
    return null;
  };

  const tanyakan = useCallback(
    async (l: Langkah | null, denganPengantar: boolean) => {
      if (!l) {
        await bicara([pilih("ringkasan", RINGKASAN_CHAT)]);
        setFase("ringkasan");
        setMengubah(false);
        return;
      }
      const pertanyaan = pilih(`q-${l.id}`, varianTanya(l, dataRef.current));
      // Sesekali pertanyaan diawali kata pengantar supaya alurnya terasa seperti orang mengobrol.
      const pengantar = denganPengantar && Math.random() < 0.4 ? `${pilih("pengantar", PENGANTAR_BERIKUT)} ` : "";
      // Akun tanpa divisi baru pertama kali ditanya: beri tahu bahwa pilihannya diingat.
      const petunjuk = l.id === "divisi" && tanpaDivisi ? " Pilihan Anda saya ingat untuk pengajuan berikutnya." : "";
      await bicara([pengantar + pertanyaan + petunjuk]);
      setAktif(l.id);
    },
    [bicara, pilih, tanpaDivisi],
  );

  /**
   * Ajukan langkah berikutnya. Untuk akun tanpa divisi yang pernah memilih divisi, langkah divisi tidak
   * ditanyakan lagi: divisinya diisikan dari pilihan terakhir dan pengaju diberi tahu (bisa diubah di ringkasan).
   */
  const lanjutKe = async (d: Data, t: Set<IdLangkah>, dari: IdLangkah | null, ubah: boolean, denganPengantar: boolean): Promise<void> => {
    const l = cariBerikut(d, t, dari, ubah);
    if (l?.id === "divisi" && divisiDiingat) {
      const t2 = new Set(t);
      t2.add("divisi");
      terjawabRef.current = t2;
      setTerjawab(t2);
      await bicara([`Divisinya saya isi ${d.divisi}, sama seperti pengajuan Anda sebelumnya. Kalau berbeda, ubah saja di ringkasan nanti.`], true);
      if (!hidup.current) return;
      return lanjutKe(d, t2, "divisi", ubah, denganPengantar);
    }
    await tanyakan(l, denganPengantar);
  };

  // Sapaan pembuka. Dijaga agar tidak berjalan dua kali di StrictMode.
  useEffect(() => {
    if (mulai.current) return;
    mulai.current = true;
    pembuka.current = (async () => {
      const nama = sesi.nama.split(" ")[0]!;
      const sapa = pilih("sapaan", SAPAAN_CHAT[waktuHariIni()](nama));
      if (indukAwal) {
        const urutan = ringkasAddendum(indukAwal, semuaKontrak).daftar.filter((a) => a.status !== "Ditolak" && a.status !== "Dibatalkan").length + 1;
        await bicara([
          sapa,
          `Saya lihat Anda ingin mengajukan addendum ke-${urutan} untuk “${indukAwal.judul}” (${indukAwal.nomorKontrak || indukAwal.nomorPengajuan}). Mitra${indukAwal.kodeProyek.trim() ? ", divisi, dan proyeknya" : " dan divisinya"} sudah saya isi dari kontrak induk, dan mata uangnya mengikuti induk (${indukAwal.mataUang}).`,
          ...catatanMataUangAddendum(indukAwal, semuaKontrak),
        ]);
      } else if (mouAwal) {
        await bicara([sapa, `Saya lihat ini kontrak tindak lanjut dari MoU “${mouAwal.judul}” (${mouAwal.nomorKontrak || mouAwal.nomorPengajuan}). Mitra${mouAwal.kodeProyek.trim() ? ", divisi, dan proyeknya" : " dan divisinya"} sudah saya isi dari MoU tersebut.`]);
      } else if (serupa) {
        // catatan[0] sudah diwakili sapaanSerupa; sisanya (MoU tidak berlaku, deskripsi lama) tetap disampaikan.
        await bicara([sapa, sapaanSerupa(serupa), ...serupa.catatan.slice(1)]);
      } else if (salinGagal) {
        await bicara([sapa, "Kontrak yang mau disalin tidak ditemukan atau tidak bisa Anda buka, jadi kita mulai dari awal ya."]);
      } else {
        await bicara([sapa, pilih("pembuka", PEMBUKA_CHAT)]);
      }
      if (adaTawaranAwal) {
        if (!drafDipilih.current) await bicara(["Oh ya, ada draf pengajuan Anda yang belum terkirim. Mau dilanjutkan atau mulai baru? Pilihannya ada di bagian atas."]);
        return;
      }
      await lanjutKe(dataRef.current, terjawabRef.current, null, false, false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Banner draf: "Mulai baru". Draf lama dihapus, lalu pertanyaan pertama diajukan. */
  const mulaiTanpaDraf = async () => {
    drafDipilih.current = true;
    draf.mulaiBaru();
    await pembuka.current;
    if (!hidup.current) return;
    tambah("saya", "Mulai baru saja");
    await lanjutKe(dataRef.current, terjawabRef.current, null, false, false);
  };

  /** Banner draf: "Lanjutkan". Jawaban dimuat tanpa memutar ulang transkrip, lalu lompat ke langkah yang belum terjawab. */
  const lanjutkanDraf = async () => {
    const d = draf.lanjutkan();
    if (!d) return;
    drafDipilih.current = true;
    await pembuka.current;
    if (!hidup.current) return;
    // Induk dan MoU acuan dicek ulang: sejak draf disimpan, statusnya bisa sudah berubah.
    const daftar = semua ?? (await ambilSemuaKontrak().catch(() => null));
    const v = daftar ? validasiUlangDraf(d.data, daftar, sesi) : { data: d.data, tanyaUlang: [], catatan: [] };
    const ulangi: string[] = v.tanyaUlang;
    const t = new Set<IdLangkah>(d.terjawab.filter(adalahIdLangkah).filter((x) => !ulangi.includes(x)));
    // Isi berkas tidak ikut tersimpan: langkah dokumen ditanyakan lagi bila draf punya lampiran.
    if (d.berkas.length) t.delete("berkas");
    const baru: Data = { ...dataRef.current, ...v.data, berkas: [], susulan: d.berkas.length ? false : (v.data.susulan ?? false) };
    const catatanDraf = [...v.catatan];
    // Draf lama bisa menyimpan mata uang addendum yang berbeda dari induk: disamakan, dan pengaju diberi tahu.
    const kunci = mataUangTerkunci(baru.jenis, baru.kontrakIndukId != null ? (daftar?.find((k) => k.id === baru.kontrakIndukId) ?? null) : null);
    if (kunci && baru.mataUang !== kunci) {
      catatanDraf.push(`Mata uangnya saya samakan dengan kontrak induk (${kunci}), karena addendum selalu memakai mata uang induknya.`);
      baru.mataUang = kunci;
    }
    setDisentuh(true);
    setData(baru);
    setTerjawab(t);
    setAktif(null);
    setGalat("");
    setFase("tanya");
    tambah("saya", "Lanjutkan draf");
    const lampir = teksLampirkanUlang(d.berkas);
    await bicara([pilih("lanjut-draf", ["Siap, kita lanjutkan dari draf tadi.", "Oke, jawaban sebelumnya sudah saya muat lagi."]), ...catatanDraf, ...(lampir ? [lampir] : [])], true);
    await lanjutKe(baru, t, null, true, true);
  };

  const jawab = async (id: IdLangkah, patch: Partial<Data>, echo: string) => {
    const baru = { ...data, ...patch };
    const t = new Set(terjawab);
    t.add(id);
    // Berganti dari/ke Addendum: pertanyaan kontrak induk harus diajukan ulang.
    if (id === "jenis" && (baru.jenis === JENIS_ADDENDUM || baru.jenis === JENIS_MOU)) {
      t.delete("acuan");
      baru.mouAcuanId = null;
    }
    if (id === "jenis" && baru.jenis === JENIS_MOU) baru.nilai = null;
    // Induk atau MoU yang dipilih di tengah percakapan ikut mengisi mitra, divisi (bila boleh memilih divisi),
    // proyek, dan referensi; mata uang addendum dikunci sama dengan induk (U29A).
    const acuanBaru = id === "acuan" ? cariKontrak(baru.mouAcuanId) : id === "induk" ? cariKontrak(baru.kontrakIndukId) : null;
    if (acuanBaru) {
      const acuanLama = id === "acuan" ? cariKontrak(data.mouAcuanId) : cariKontrak(data.kontrakIndukId);
      Object.assign(baru, warisanAcuan(acuanBaru, data, { divisi: tanyaDivisi, addendum: id === "induk", acuanLama }));
      t.add("mitra");
      t.add("divisi");
      if (baru.kodeProyek.trim()) t.add("proyek");
    }
    if (id === "jenis" && baru.jenis !== JENIS_ADDENDUM) {
      t.delete("induk");
      t.delete("perubahan");
      baru.kontrakIndukId = null;
      baru.jenisPerubahan = [];
    }
    if (id === "divisi" && sesi.divisi == null) ingatDivisiTerakhir(sesi.email, baru.divisi);
    setDisentuh(true);
    setData(baru);
    setTerjawab(t);
    setAktif(null);
    setGalat("");
    tambah("saya", echo);
    const r = reaksi(id, baru, pilih);
    if (r && (r.wajib || Math.random() < 0.55)) await bicara([r.teks], true);
    // Addendum lama dari induk ini yang mata uangnya berbeda: disampaikan supaya tidak hilang diam-diam.
    if (id === "induk" && acuanBaru) {
      const catatan = catatanMataUangAddendum(acuanBaru, kontrakSemua);
      if (catatan.length) await bicara(catatan, true);
    }
    await lanjutKe(baru, t, id, mengubah, true);
  };

  /** Hasil UnggahCerdas: isian yang dicentang pengguna dipakai, berkasnya ikut masuk antrean lampiran. */
  const pakaiSaran = async (saran: Partial<SaranIsian>, file: File) => {
    const d = dataRef.current;
    const t = new Set(terjawab);
    const baru: Data = { ...d };
    if (!d.berkas.some((b) => b.file.name === file.name && b.file.size === file.size)) baru.berkas = [...d.berkas, { file, jenis: "Draft Kontrak" }];
    let dipakai = 0;
    if (saran.judul) {
      baru.judul = saran.judul;
      t.add("judul");
      dipakai++;
    }
    // Jenis dan mitra yang sudah terisi (dari tautan atau "Ajukan serupa") tidak ditimpa diam-diam.
    if (saran.jenis && !t.has("jenis")) {
      baru.jenis = saran.jenis;
      t.add("jenis");
      dipakai++;
    }
    if (saran.mitra && !t.has("mitra")) {
      Object.assign(baru, rapikanMitra(saran.mitra, saranMitra.daftarMitra));
      t.add("mitra");
      dipakai++;
    }
    if (saran.nilai != null) {
      baru.nilai = saran.nilai;
      // Addendum tetap memakai mata uang induk walau dokumen menyebut mata uang lain.
      baru.mataUang = mataUangTerkunci(baru.jenis, cariKontrak(baru.kontrakIndukId)) ?? saran.mataUang ?? d.mataUang;
      // Untuk addendum yang ditanya selisih nilai, angka dokumen hanya jadi isian awal dan tetap ditanyakan.
      if (baru.jenis !== JENIS_ADDENDUM) t.add("nilai");
      dipakai++;
    }
    if (saran.tanggalMulai) baru.tanggalMulai = saran.tanggalMulai;
    if (saran.tanggalBerakhir) baru.tanggalBerakhir = saran.tanggalBerakhir;
    if (saran.tanggalMulai || saran.tanggalBerakhir) dipakai++;
    // Masa berlaku baru dianggap terjawab bila kedua tanggal ada dan urutannya masuk akal.
    if (baru.tanggalMulai && baru.tanggalBerakhir && baru.tanggalBerakhir >= baru.tanggalMulai) t.add("masa");
    if (baru.jenis === JENIS_MOU) baru.nilai = null;
    if (baru.jenis === JENIS_ADDENDUM || baru.jenis === JENIS_MOU) {
      baru.mouAcuanId = null;
      t.delete("acuan");
    }
    setDisentuh(true);
    setData(baru);
    setTerjawab(t);
    setAktif(null);
    setGalat("");
    tambah("saya", `Saya unggah ${file.name}`);
    const kalimat = dipakai
      ? `Sip, ${dipakai} isian dari dokumen itu sudah saya pakai, dan berkasnya saya siapkan sebagai lampiran. Sisanya saya tanyakan ya.`
      : "Baik, berkasnya saya siapkan sebagai lampiran. Kita isi datanya bersama ya.";
    await bicara([kalimat], true);
    await lanjutKe(baru, t, null, true, true);
  };

  const ubahBagian = async (id: IdLangkah) => {
    const l = LANGKAH.find((x) => x.id === id)!;
    setFase("tanya");
    setMengubah(true);
    setGalat("");
    setGalatKirim(null);
    tambah("saya", `Ubah ${l.label.toLowerCase()}`);
    await bicara([`Boleh. ${pilih(`q-${id}`, varianTanya(l, data))}`], true);
    setAktif(id);
  };

  const kirim = async () => {
    setFase("kirim");
    setGalat("");
    setGalatKirim(null);
    setProgres("Menyimpan pengajuan…");
    try {
      const input: KontrakInput = {
        judul: data.judul,
        jenis: data.jenis,
        divisi: data.divisi,
        mitra: data.mitra,
        nilai: data.jenis === JENIS_MOU ? null : data.nilai,
        // Pengaman terakhir U29A: addendum selalu memakai mata uang induknya.
        mataUang: mataUangTerkunci(data.jenis, data.jenis === JENIS_ADDENDUM ? cariKontrak(data.kontrakIndukId) : null) ?? data.mataUang,
        tanggalMulai: data.tanggalMulai,
        tanggalBerakhir: data.tanggalBerakhir,
        prioritas: data.prioritas,
        deskripsi: data.deskripsi,
        targetSelesai: data.targetSelesai,
        kontrakIndukId: data.jenis === JENIS_ADDENDUM ? data.kontrakIndukId : null,
        jenisPerubahan: data.jenis === JENIS_ADDENDUM ? data.jenisPerubahan : [],
        mouAcuanId: data.jenis !== JENIS_ADDENDUM && data.jenis !== JENIS_MOU ? data.mouAcuanId : null,
        nomorKontrak: "",
        picLegalEmail: "",
        picLegalNama: "",
        tanggalTandaTangan: null,
        kodeProyek: rapikanProyek(data.kodeProyek),
        nomorReferensi: rapikanReferensi(data.nomorReferensi),
        costCenter: "",
        mitraId: data.mitraId ?? rapikanMitra(data.mitra, saranMitra.daftarMitra).mitraId,
        perpanjanganOtomatis: false,
        masaPemberitahuanHari: null,
        plafon: null,
        salinDari: data.salinDari,
        npwpMitra: "",
        alamatMitra: "",
        penandatanganMitra: "",
        jabatanMitra: "",
        dasarKewenangan: "",
      };
      const baru = await buatKontrak(input, sesi);
      // Pengajuan sudah tersimpan: draf dihapus sekarang juga, sebelum unggah yang bisa lama.
      draf.hapus();
      // Akun tanpa divisi: divisi pengajuan ini menjadi isian awal pengajuan berikutnya (sama dengan formulir).
      if (tanpaDivisi) ingatDivisiTerakhir(sesi.email, input.divisi);

      // Asal salinan ("Ajukan serupa") disebut di catatan Dibuat oleh selesaikanPengajuan.
      const unggah = data.berkas.length ? await unggahBanyak(baru, data.berkas, sesi, (t) => setProgres(t)) : null;
      const gagal = unggah?.gagal.map((g) => g.nama) ?? [];
      if (unggah && unggah.berhasil.length && !unggah.aktivitasTercatat) toast.warning("Dokumen terunggah, tetapi catatannya belum masuk riwayat.");

      // "Sisanya menyusul": dokumen wajib yang belum ada dicatat di riwayat supaya Legal tahu.
      const terunggah = data.berkas.filter((b) => !gagal.includes(b.file.name)).map((b) => b.jenis);
      if (data.susulan) {
        const pesanSusulan = teksSusulan(kekuranganDokumen(data.jenis, terunggah).kurang, data.jenis);
        if (pesanSusulan) {
          await catatAktivitas({ kontrakId: baru.id, jenis: "Dokumen", pesan: pesanSusulan }, sesi).catch(() =>
            toast.warning("Catatan dokumen menyusul belum tersimpan", { description: "Sampaikan ke Legal lewat komentar di halaman kontrak ya." }),
          );
        }
      }

      // U23a: catatan "Dibuat" dan email ke Legal SESUDAH unggahan, supaya email menyebut dokumen yang benar-benar ada.
      setProgres("Mengabari tim Legal…");
      const penutup = await selesaikanPengajuan(baru, sesi, { jumlah: terunggah.length, jenis: terunggah, susulan: data.susulan });
      // Posisi di antrean Legal, supaya pengaju langsung tahu berapa pengajuan di depannya.
      setPosisiBaru(penutup.semua ? posisiAntrean(baru, antreanLegal(penutup.semua.some((x) => x.id === baru.id) ? penutup.semua : [...penutup.semua, baru])) : null);
      setHasil(baru);
      setFase("selesai");
      toast.success(`Kontrak ${baru.nomorPengajuan} berhasil diajukan`);
      for (const p of penutup.peringatan) toast.warning(p, { duration: 10_000 });
      tambah("bot", pilih("selesai", SELESAI_CHAT)(baru.nomorPengajuan));
      if (gagal.length) tambah("bot", `Catatan: dokumen ini gagal diunggah: ${gagal.join(", ")}. Unggah ulang dari halaman detail kontrak ya.`);
      if (unggah?.berhasil.some((x) => !x.metadataTersimpan)) tambah("bot", "Sebagian dokumen sudah terunggah, tetapi jenisnya belum tercatat. Jenisnya bisa diatur dari halaman detail kontrak.");
    } catch (err) {
      setFase("ringkasan");
      setGalatKirim(err);
    } finally {
      setProgres("");
    }
  };

  const keluar = () => {
    if (fase !== "selesai" && disentuh) setKonfirmasiKeluar(true);
    else navigate(ke.beranda);
  };

  /** "Mulai ulang" di ringkasan: semua jawaban dan draf dihapus, jadi selalu dikonfirmasi dulu. */
  const mulaiUlang = () => {
    setKonfirmasiUlang(false);
    draf.mulaiBaru();
    onUlang();
  };

  // Kalimat pembuka galat kirim dipilih sekali per galat supaya tidak berganti tiap render.
  const pesanGagal = useMemo(() => (galatKirim != null ? pilih("gagal", GAGAL_CHAT) : ""), [galatKirim, pilih]);

  const indukTerpilih = kontrakSemua.find((k) => k.id === data.kontrakIndukId) ?? induk.find((k) => k.id === data.kontrakIndukId) ?? null;
  const addendum = data.jenis === JENIS_ADDENDUM;
  const usulanJudul = indukTerpilih && addendum ? judulUsulanAddendum(indukTerpilih, kontrakSemua) : !addendum && serupa ? serupa.usulanJudul : undefined;
  const mulaiUsulan = indukTerpilih && addendum ? tambahHari(1, ringkasAddendum(indukTerpilih, kontrakSemua).berakhirEfektif ?? tambahHari(0)) : null;
  const langkahAktif = aktif ? LANGKAH.find((l) => l.id === aktif)! : null;
  const persenTampil = fase === "tanya" ? persen : 100;
  // Tawaran "isi otomatis dari draf" hanya di awal percakapan biasa, sebelum pengguna menjawab apa pun.
  const tawarCerdas = fase === "tanya" && !disentuh && !indukAwal && !mouAwal && !draf.tawaran && langkahAktif != null && !mengetik;
  // Peringatan plafon/masa MoU payung (nonblokir).
  const payung = fase === "ringkasan" && data.mouAcuanId != null && !addendum && data.jenis !== JENIS_MOU ? kontrakSemua.find((k) => k.id === data.mouAcuanId) : undefined;
  const catatanPayung = payung ? peringatanTurunanBaru(payung, kontrakSemua, { nilai: data.nilai, mataUang: data.mataUang, tanggalMulai: data.tanggalMulai, tanggalBerakhir: data.tanggalBerakhir }) : [];
  // U29A: catatan mata uang addendum (addendum lama dari induk yang sama dengan mata uang berbeda).
  const catatanMataUang = fase === "ringkasan" && addendum && indukTerpilih ? catatanMataUangAddendum(indukTerpilih, kontrakSemua, { mataUangKini: data.mataUang }) : [];

  return (
    <div className="relative h-[100dvh] overflow-hidden" style={areaTampak ? { height: areaTampak.tinggi, top: areaTampak.atas } : undefined}>
      <Aurora />
      <div className="relative grid h-full xl:grid-cols-[minmax(0,1fr)_420px] 3xl:grid-cols-[minmax(0,1fr)_520px]">
        {/* Kolom percakapan */}
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <header className="flex items-center gap-2 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-3 sm:px-6">
            <motion.button whileHover={{ rotate: 90 }} whileTap={tekan} transition={pegas} onClick={keluar} className="kaca grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-muted shadow-card transition-colors hover:text-ink" aria-label="Tutup dan kembali">
              <X className="h-5 w-5" />
            </motion.button>
            <div className="min-w-0 flex-1">
              <div className="mx-auto max-w-2xl">
                <div className="flex items-baseline justify-between gap-3">
                  <h1 className="judul truncate text-xl sm:text-2xl">Ajukan Kontrak</h1>
                  <span className="angka shrink-0 text-xs font-semibold text-muted">{fase === "selesai" ? "Terkirim" : fase === "tanya" ? `${Math.min(selesaiCount + 1, langkahBerlaku.length)} / ${langkahBerlaku.length}` : "Periksa ringkasan"}</span>
                </div>
                <div className="mt-2 flex gap-1.5" role="progressbar" aria-label="Kemajuan pengisian" aria-valuenow={persenTampil} aria-valuemin={0} aria-valuemax={100}>
                  {langkahBerlaku.map((l) => {
                    const selesai = fase !== "tanya" || terjawab.has(l.id);
                    const kini = fase === "tanya" && l.id === aktif;
                    return (
                      <span key={l.id} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                        <motion.span className={cx("absolute inset-0 origin-left rounded-full", kini ? "bg-accent" : "bg-gradient-to-r from-brand to-success")} initial={false} animate={{ scaleX: selesai || kini ? 1 : 0, opacity: kini ? [0.5, 1, 0.5] : 1 }} transition={kini ? { scaleX: pegasLembut, opacity: { duration: 1.4, repeat: Infinity } } : pegasLembut} />
                      </span>
                    );
                  })}
                </div>
                {/* Ponsel: tautan formulir di bawah bilah kemajuan (tombol di kanan tidak muat); area sentuh 44 px lewat ::after. */}
                <p className="mt-1.5 text-right text-xs text-muted sm:hidden">
                  Lebih suka formulir?{" "}
                  <Link to={`${ke.formulir}${lokasiChat.search}`} className="relative font-semibold text-brand underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-[14px] after:content-[''] hover:underline">
                    Isi lewat formulir
                  </Link>
                </p>
              </div>
            </div>
            <Link to={`${ke.formulir}${lokasiChat.search}`} className="kaca hidden min-h-11 items-center rounded-xl border border-line px-3.5 text-xs font-semibold text-muted shadow-card transition-colors hover:text-ink sm:inline-flex">
              Isi lewat formulir
            </Link>
            <motion.button whileTap={tekan} transition={pegas} onClick={() => setLembar(true)} className="kaca grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-muted shadow-card transition-colors hover:text-ink xl:hidden" aria-label="Lihat pratinjau pengajuan">
              <Eye className="h-5 w-5" />
            </motion.button>
            <motion.button whileTap={tekan} transition={pegas} onClick={gantiTema} className="kaca grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-muted shadow-card transition-colors hover:text-ink" aria-label={gelap ? "Ganti ke tema terang" : "Ganti ke tema gelap"}>
              {gelap ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </motion.button>
          </header>

          {/* Draf yang belum terkirim: selalu terlihat di atas transkrip sampai pengguna memilih. */}
          {draf.tawaran && (
            <div className="shrink-0 px-4 pb-2 sm:px-6">
              <BannerDraf draf={draf.tawaran} onLanjutkan={() => void lanjutkanDraf()} onMulaiBaru={() => void mulaiTanpaDraf()} className="mx-auto max-w-2xl" />
            </div>
          )}

          <div role="log" aria-live="polite" aria-label="Percakapan pengajuan kontrak" className="scroll-halus min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2 sm:px-6">
            <div className="mx-auto max-w-2xl space-y-2.5">
              {pesan.map((p, i) => (
                <Gelembung key={p.id} p={p} avatar={i === 0 || pesan[i - 1]!.dari !== p.dari} />
              ))}
              <AnimatePresence>{mengetik && <Mengetik key="ketik" />}</AnimatePresence>

              {fase !== "tanya" && <Ringkasan data={data} induk={induk} terkunci={fase !== "ringkasan"} onUbah={ubahBagian} tampilDivisi={tanyaDivisi} />}

              {fase === "ringkasan" && (
                <div className="space-y-2.5 sm:ml-[46px]">
                  <PeringatanGanda
                    draf={{ judul: data.judul, mitra: data.mitra, jenis: data.jenis, kontrakIndukId: data.kontrakIndukId }}
                    semuaKontrak={semua ?? (semuaKontrak.length ? semuaKontrak : null)}
                    onAjukanAddendum={(k) => navigate(ke.ajukanAddendum(k.id))}
                  />
                  {catatanMataUang.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={pegasLembut} role="note" className="flex items-start gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <div className="min-w-0 space-y-1">
                        {catatanMataUang.map((c) => (
                          <p key={c}>{c}</p>
                        ))}
                      </div>
                    </motion.div>
                  )}
                  {catatanPayung.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={pegasLembut} role="note" className="flex items-start gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <div className="min-w-0 space-y-1">
                        {catatanPayung.map((c) => (
                          <p key={c}>{c}</p>
                        ))}
                        <p className="text-xs opacity-80">Ini hanya pengingat dari MoU payungnya; pengajuan tetap bisa dikirim.</p>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {fase === "selesai" && hasil && (
                <motion.div initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={pegasMantul} className="kartu mt-4 flex flex-col items-center gap-3 p-6 text-center sm:p-8">
                  <CentangGambar />
                  <div className="min-w-0">
                    <p className="judul break-words text-3xl">{hasil.nomorPengajuan}</p>
                    <p className="mt-1 text-sm text-muted">{posisiBaru != null ? `Masuk antrean Legal di urutan ke-${posisiBaru}. ${teksPosisi(posisiBaru)}.` : "Pengajuan Anda sudah masuk antrean Legal."}</p>
                    <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-raised px-3 py-1 text-xs font-semibold text-muted">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="min-w-0">Diterima {formatMasuk(hasil.tanggalDiajukan ?? hasil.dibuat)}</span>
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {ruang === "pengguna" && (
                      <Tombol ikon={<Activity className="h-4 w-4" />} onClick={() => navigate(ke.beranda)}>
                        Pantau di Monitoring
                      </Tombol>
                    )}
                    <Tombol varian={ruang === "pengguna" ? "kedua" : "utama"} ikon={<FileText className="h-4 w-4" />} onClick={() => navigate(ke.detail(hasil.id))}>
                      Buka kontrak
                    </Tombol>
                    <Tombol varian="kedua" ikon={<RotateCcw className="h-4 w-4" />} onClick={onUlang}>
                      Ajukan kontrak lain
                    </Tombol>
                  </div>
                </motion.div>
              )}
              <div ref={dasar} />
            </div>
          </div>

          {/* Area jawaban */}
          <div className="kaca border-t border-line px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
            <div className="mx-auto max-w-2xl">
              {galat && (
                <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} role="alert" className="mb-3 rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
                  {galat}
                </motion.p>
              )}
              {fase === "ringkasan" && galatKirim != null && <GalatKirim galat={galatKirim} teksKirim="Ajukan ke Legal" awalan={pesanGagal} className="mb-3" />}
              {tawarCerdas && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={pegasLembut} className="scroll-halus mb-3 max-h-[45dvh] overflow-y-auto">
                  <UnggahCerdas pembanding={terjawab.has("jenis") ? { jenis: data.jenis } : undefined} onSaran={(saran, file) => void pakaiSaran(saran, file)} />
                </motion.div>
              )}
              {fase === "tanya" && langkahAktif && !mengetik && (
                <motion.div key={langkahAktif.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_KELUAR }} className="scroll-halus -mx-1 max-h-[45dvh] overflow-y-auto overscroll-contain px-1 py-1">
                  <Jawaban
                    langkah={langkahAktif}
                    data={data}
                    induk={induk}
                    indukTerpilih={addendum ? indukTerpilih : null}
                    mouAktif={mouAktif}
                    usulanJudul={usulanJudul}
                    mulaiUsulan={mulaiUsulan}
                    saranMitra={saranMitra}
                    proyekSaran={proyekSaran}
                    proyekSaya={proyekSaya}
                    onJawab={jawab}
                    onGalat={setGalat}
                  />
                </motion.div>
              )}
              {fase === "ringkasan" && (
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={pegasLembut} className="flex flex-wrap items-center gap-2">
                  <Tombol ikon={<Send className="h-4 w-4" />} onClick={kirim}>
                    Ajukan ke Legal
                  </Tombol>
                  <Tombol varian="hantu" ikon={<RotateCcw className="h-4 w-4" />} onClick={() => setKonfirmasiUlang(true)}>
                    Mulai ulang
                  </Tombol>
                </motion.div>
              )}
              {fase === "kirim" && (
                <p className="flex items-center gap-3 py-2 text-sm text-muted" role="status">
                  <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden="true" />
                  <span className="min-w-0 truncate">{progres}</span>
                </p>
              )}
              {fase === "selesai" && <p className="py-1 text-sm text-muted">{ruang === "pengguna" ? "Posisi antrean dan statusnya bisa dipantau di menu Monitoring." : "Pantau statusnya dari halaman detail kontrak."}</p>}
              {fase === "tanya" && (!langkahAktif || mengetik) && <div className="h-11" aria-hidden="true" />}
            </div>
          </div>
        </div>

        {/* Pratinjau kontrak (layar lebar) */}
        <aside className="hidden h-full min-h-0 overflow-hidden border-l border-line p-5 xl:block" aria-label="Pratinjau pengajuan">
          <Pratinjau data={data} induk={induk} terjawab={terjawab} tampilDivisi={tanyaDivisi} persen={persenTampil} fase={fase} />
        </aside>
      </div>

      <AnimatePresence>
        {lembar && (
          <MotionLapisan className="fixed inset-0 z-[65] xl:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
            <div className="absolute inset-0 backdrop-blur-sm" onClick={tutupLembar}>
              <div className="h-full w-full bg-navy opacity-50" />
            </div>
            <motion.div ref={refLembar} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Pratinjau pengajuan" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%", transition: { duration: 0.2 } }} transition={pegasLembut} className="absolute inset-x-0 bottom-0 mx-auto flex h-[86dvh] max-w-lg flex-col rounded-t-[28px] bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-pop focus:outline-none sm:h-[80dvh]">
              <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-line" aria-hidden="true" />
              <div className="min-h-0 flex-1">
                <Pratinjau data={data} induk={induk} terjawab={terjawab} tampilDivisi={tanyaDivisi} persen={persenTampil} fase={fase} />
              </div>
              <Tombol varian="kedua" className="mt-3 shrink-0" onClick={tutupLembar} data-fokus-awal>
                Tutup
              </Tombol>
            </motion.div>
          </MotionLapisan>
        )}
      </AnimatePresence>

      {fase === "selesai" && <Konfeti />}
      {konfirmasiUlang && (
        <Modal judul="Mulai ulang dari awal?" onTutup={() => setKonfirmasiUlang(false)}>
          <p className="text-sm text-muted">Semua jawaban di percakapan ini dan drafnya akan dihapus, lalu pertanyaan dimulai lagi dari awal. Untuk mengganti satu bagian saja, pakai tombol pensil di ringkasan.</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Tombol varian="kedua" data-fokus-awal onClick={() => setKonfirmasiUlang(false)}>
              Batal
            </Tombol>
            <Tombol varian="bahaya" ikon={<RotateCcw className="h-4 w-4" />} onClick={mulaiUlang}>
              Ya, mulai ulang
            </Tombol>
          </div>
        </Modal>
      )}
      {konfirmasiKeluar && (
        <Modal judul="Keluar dari pengajuan?" onTutup={() => setKonfirmasiKeluar(false)}>
          <p className="text-sm text-muted">Jawaban Anda tersimpan sebagai draf di perangkat ini selama 7 hari, jadi bisa dilanjutkan nanti dari halaman ini. Lampiran perlu dipilih ulang karena isinya tidak ikut disimpan.</p>
          <div className="mt-5 flex justify-end gap-2">
            <Tombol varian="kedua" onClick={() => setKonfirmasiKeluar(false)}>
              Lanjut mengisi
            </Tombol>
            <Tombol varian="bahaya" onClick={() => navigate(ke.beranda)}>
              Keluar
            </Tombol>
          </div>
        </Modal>
      )}
    </div>
  );
}

// --- Baris data (dipakai ringkasan dan pratinjau) ----------------------------------

function teksBerkas(d: Data): string {
  const kurang = d.susulan ? kurangWajib(d).length : 0;
  const susul = kurang ? `${kurang} dokumen wajib menyusul` : "";
  if (!d.berkas.length) return susul ? `Belum ada, ${susul}` : "Belum ada";
  return `${d.berkas.length} berkas: ${d.berkas.map((b) => b.file.name).join(", ")}${susul ? ` (${susul})` : ""}`;
}

function barisData(data: Data, induk: Kontrak[], tampilDivisi: boolean): { id: IdLangkah; label: string; nilai: string; tampil: boolean }[] {
  const kontrakInduk = induk.find((k) => k.id === data.kontrakIndukId);
  return [
    { id: "judul", label: "Judul", nilai: data.judul, tampil: true },
    { id: "jenis", label: "Jenis", nilai: data.jenis, tampil: true },
    { id: "induk", label: "Kontrak induk", nilai: kontrakInduk ? `${kontrakInduk.nomorKontrak || kontrakInduk.nomorPengajuan} · ${kontrakInduk.judul}` : "Ditautkan Legal", tampil: data.jenis === JENIS_ADDENDUM },
    { id: "perubahan", label: "Yang diubah", nilai: data.jenisPerubahan.length ? data.jenisPerubahan.join(", ") : "Belum dijelaskan", tampil: data.jenis === JENIS_ADDENDUM },
    { id: "acuan", label: "Berdasarkan MoU", nilai: induk.find((k) => k.id === data.mouAcuanId)?.judul ?? "MoU terpilih", tampil: data.mouAcuanId != null },
    { id: "mitra", label: "Mitra", nilai: data.mitra, tampil: true },
    { id: "divisi", label: "Divisi", nilai: data.divisi, tampil: tampilDivisi },
    { id: "proyek", label: "Proyek & ref.", nilai: teksProyekReferensi(data), tampil: true },
    { id: "nilai", label: data.jenis === JENIS_ADDENDUM ? "Selisih nilai" : "Nilai", nilai: data.jenis === JENIS_ADDENDUM && data.nilai == null ? "Tidak mengubah nilai" : formatUang(data.nilai, data.mataUang), tampil: data.jenis !== JENIS_MOU },
    { id: "masa", label: "Masa berlaku", nilai: data.tanggalMulai || data.tanggalBerakhir ? `${formatTanggal(data.tanggalMulai)} – ${formatTanggal(data.tanggalBerakhir)}` : "Belum ditentukan", tampil: true },
    { id: "target", label: "Target review", nilai: formatTanggal(data.targetSelesai), tampil: true },
    { id: "prioritas", label: "Prioritas", nilai: data.prioritas, tampil: true },
    { id: "deskripsi", label: "Deskripsi", nilai: data.deskripsi || "-", tampil: true },
    { id: "berkas", label: "Dokumen", nilai: teksBerkas(data), tampil: true },
  ];
}

// --- Pratinjau: kertas kontrak yang terisi seiring jawaban ---------------------------

function Pratinjau({ data, induk, terjawab, tampilDivisi, persen, fase }: { data: Data; induk: Kontrak[]; terjawab: Set<IdLangkah>; tampilDivisi: boolean; persen: number; fase: Fase }) {
  const baris = barisData(data, induk, tampilDivisi).filter((b) => b.tampil && b.id !== "judul");
  const keliling = 2 * Math.PI * 18;
  // Pas satu layar tanpa scroll: kartu mengisi tinggi yang tersedia, dan baris membagi ruang sisa
  // sama rata (menyusut bila baris banyak, misalnya pada addendum).
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="mb-2 shrink-0 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Pratinjau</p>
      <motion.div initial={{ opacity: 0, y: 20, rotate: -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={pegasLembut} className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-pop">
        <div className="hero-bg relative shrink-0 px-5 pb-4 pt-4 text-hero-on">
          <div className="titik-halus pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-white"><img src="/wicon-mark.png" alt="" className="h-5 w-5" width={20} height={20} /></span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-90">Permohonan Kontrak</p>
            </div>
            <div className="relative grid h-11 w-11 place-items-center">
              <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden="true">
                <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="3.5" />
                <motion.circle cx="22" cy="22" r="18" fill="none" stroke="var(--wh-accent)" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={keliling} initial={false} animate={{ strokeDashoffset: keliling * (1 - persen / 100) }} transition={pegasLembut} />
              </svg>
              <span className="angka relative text-xs font-bold">{persen}%</span>
            </div>
          </div>
          <p className="judul relative mt-3 line-clamp-2 min-h-[2.6rem] text-xl leading-tight">{data.judul || <span className="opacity-50">Judul kontrak…</span>}</p>
        </div>

        <dl className="flex min-h-0 flex-1 flex-col divide-y divide-line px-5">
          {baris.map((b) => {
            const sudah = terjawab.has(b.id);
            return (
              <div key={b.id} className="flex min-h-0 flex-1 items-center gap-3 text-[13px] leading-snug">
                <dt className="w-[5.5rem] shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">{b.label}</dt>
                <dd className="min-w-0 flex-1">
                  <AnimatePresence mode="wait" initial={false}>
                    {sudah ? (
                      <motion.span key={b.nilai} initial={{ opacity: 0, y: 8, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.35, ease: EASE_KELUAR }} className="line-clamp-2 break-words font-semibold" title={b.nilai}>
                        {b.nilai}
                      </motion.span>
                    ) : (
                      <motion.span key="kosong" exit={{ opacity: 0 }} className="kilau block h-2.5 w-3/4 rounded-full" aria-label="Belum diisi" />
                    )}
                  </AnimatePresence>
                </dd>
                <span className="h-4 w-4 shrink-0">
                  <AnimatePresence>
                    {sudah && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={pegasMantul} className="grid h-4 w-4 place-items-center rounded-full bg-success text-white">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </div>
            );
          })}
        </dl>
        <AnimatePresence>
          {fase === "selesai" && (
            <motion.div initial={{ opacity: 0, scale: 1.6, rotate: -18 }} animate={{ opacity: 1, scale: 1, rotate: -10 }} transition={pegasMantul} className="absolute bottom-6 right-5 rounded-lg border-4 border-success bg-surface px-3 py-1 text-lg font-extrabold uppercase tracking-widest text-success">
              Terkirim
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// --- Ringkasan inline (dengan tombol ubah) -----------------------------------------

function Ringkasan({ data, induk, terkunci, onUbah, tampilDivisi }: { data: Data; induk: Kontrak[]; terkunci: boolean; onUbah: (id: IdLangkah) => void; tampilDivisi: boolean }) {
  const baris = barisData(data, induk, tampilDivisi).filter((b) => b.tampil);
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={pegasLembut} className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card sm:ml-[46px]">
      <div className="flex items-center gap-2 border-b border-line bg-raised px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
        <FileText className="h-4 w-4" aria-hidden="true" /> Ringkasan pengajuan
      </div>
      <Kontainer jeda={0.035}>
        <dl className="divide-y divide-line">
          {baris.map((b) => (
            <motion.div key={b.id} variants={itemKecil} className="flex items-start gap-3 px-5 py-3 text-sm">
              <dt className="w-24 shrink-0 text-muted sm:w-28">{b.label}</dt>
              <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words font-semibold">{b.nilai}</dd>
              {!terkunci && (
                <motion.button whileHover={{ scale: 1.15 }} whileTap={tekan} type="button" onClick={() => onUbah(b.id)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-brand-soft hover:text-brand sm:h-8 sm:w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label={`Ubah ${b.label.toLowerCase()}`}>
                  <Pencil className="h-4 w-4" />
                </motion.button>
              )}
            </motion.div>
          ))}
        </dl>
      </Kontainer>
    </motion.div>
  );
}

// --- Kotak jawaban per langkah ------------------------------------------------

interface PropsJawaban {
  langkah: Langkah;
  data: Data;
  induk: Kontrak[];
  /** Kontrak induk addendum yang sudah dipilih: mata uangnya mengunci mata uang addendum (U29A). */
  indukTerpilih: Kontrak | null;
  mouAktif: Kontrak[];
  /** Usulan judul (addendum: dari kontrak induk; "Ajukan serupa": dari kontrak sumber) dan tanggal mulai addendum. */
  usulanJudul?: string;
  mulaiUsulan?: Ymd | null;
  saranMitra: DataSaranMitra;
  /** Saran kode proyek (datalist) dan proyek yang terakhir dipakai pengaju (tombol cepat). */
  proyekSaran: string[];
  proyekSaya: string[];
  onJawab: (id: IdLangkah, patch: Partial<Data>, echo: string) => Promise<void>;
  onGalat: (pesan: string) => void;
}

function TombolKirim() {
  return (
    <Tombol type="submit" className="h-[46px] w-[46px] !rounded-full !p-0" aria-label="Kirim jawaban">
      <Send className="h-[18px] w-[18px]" />
    </Tombol>
  );
}

function Jawaban({ langkah, data, induk, indukTerpilih, mouAktif, usulanJudul, mulaiUsulan, saranMitra, proyekSaran, proyekSaya, onJawab, onGalat }: PropsJawaban) {
  const addendum = data.jenis === JENIS_ADDENDUM;
  const kunciMataUang = mataUangTerkunci(data.jenis, indukTerpilih);
  const idDaftarProyek = useId();
  const [teks, setTeks] = useState("");
  const [mataUang, setMataUang] = useState<MataUang>(kunciMataUang ?? data.mataUang);
  const [proyek, setProyek] = useState(data.kodeProyek);
  const [referensi, setReferensi] = useState(data.nomorReferensi);
  const [mulai, setMulai] = useState<Ymd | "">(data.tanggalMulai ?? (addendum ? (mulaiUsulan ?? "") : ""));
  const [dipilih, setDipilih] = useState<JenisPerubahan[]>(data.jenisPerubahan);
  const [akhir, setAkhir] = useState<Ymd | "">(data.tanggalBerakhir ?? "");
  const [tanggal, setTanggal] = useState<Ymd | "">(data.targetSelesai ?? "");
  const [indukId, setIndukId] = useState(data.kontrakIndukId ? String(data.kontrakIndukId) : "");
  const [berkas, setBerkas] = useState<BerkasAntre[]>(data.berkas);
  const [mouId, setMouId] = useState("");

  // Isi awal saat langkah dibuka lewat "Ubah".
  useEffect(() => {
    if (langkah.id === "judul") setTeks(data.judul);
    if (langkah.id === "mitra") setTeks(data.mitra);
    if (langkah.id === "deskripsi") setTeks(data.deskripsi);
    if (langkah.id === "nilai") setTeks(data.nilai == null ? "" : String(data.nilai));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { id } = langkah;
  const kirimTeks = (e: FormEvent) => {
    e.preventDefault();
    const nilai = teks.trim();
    if (id === "judul") {
      if (nilai.length < 5) return onGalat("Judulnya masih terlalu singkat. Tuliskan minimal 5 karakter ya.");
      void onJawab(id, { judul: nilai }, nilai);
    } else if (id === "mitra") {
      if (nilai.length < 2) return onGalat("Nama mitra wajib diisi.");
      // Nama yang cocok persis dengan master Mitra dirapikan ke nama resminya dan ditautkan.
      const m = rapikanMitra(nilai, saranMitra.daftarMitra);
      void onJawab(id, m, m.mitra);
    } else if (id === "deskripsi") {
      void onJawab(id, { deskripsi: nilai }, nilai || "Tidak ada catatan");
    } else if (id === "nilai") {
      const n = bacaNilai(nilai);
      if (n == null || Number.isNaN(n) || (n < 0 && !addendum)) return onGalat(addendum ? "Nilainya belum terbaca. Coba tulis seperti ini: 250.000.000 atau -50.000.000" : "Nilainya belum terbaca. Coba tulis seperti ini: 1.250.000.000");
      const mu = kunciMataUang ?? mataUang;
      void onJawab(id, { nilai: n, mataUang: mu }, formatUang(n, mu));
    }
  };

  const kolomTeks = (props: { placeholder: string; panjang?: boolean }) => (
    <form onSubmit={kirimTeks} className="flex items-end gap-2.5">
      {props.panjang ? (
        <textarea
          autoFocus
          aria-label={langkah.label}
          autoComplete="off"
          className="input min-h-[84px] flex-1 !rounded-2xl"
          placeholder={props.placeholder}
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) kirimTeks(e);
          }}
        />
      ) : (
        <input autoFocus aria-label={langkah.label} autoComplete="off" enterKeyHint="send" className="input h-[46px] min-w-0 flex-1 !rounded-full !px-5" placeholder={props.placeholder} value={teks} onChange={(e) => setTeks(e.target.value)} maxLength={255} />
      )}
      <TombolKirim />
    </form>
  );

  switch (id) {
    case "judul":
      return (
        <div className="space-y-3">
          {kolomTeks({ placeholder: addendum ? "Tulis judul addendum…" : "Tulis judul kontrak…" })}
          {usulanJudul && (
            <Kontainer className="flex flex-wrap gap-2">
              <Pilihan onPilih={() => void onJawab(id, { judul: usulanJudul }, usulanJudul)}>Pakai: {usulanJudul}</Pilihan>
            </Kontainer>
          )}
        </div>
      );

    case "acuan":
      return (
        <div className="space-y-3">
          <Kontainer className="flex gap-2">
            <Pilihan onPilih={() => void onJawab(id, { mouAcuanId: null }, "Bukan tindak lanjut MoU")}>Bukan tindak lanjut MoU</Pilihan>
          </Kontainer>
          <form
            className="flex items-end gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              const m = mouAktif.find((x) => String(x.id) === mouId);
              if (!m) return onGalat("Pilih salah satu MoU dulu ya.");
              // Mitra, divisi, proyek, dan referensi diwarisi di jawab() (warisanAcuan).
              void onJawab(id, { mouAcuanId: m.id }, `${m.nomorKontrak || m.nomorPengajuan} · ${m.judul}`);
            }}
          >
            <select aria-label="MoU dasar" className="input h-[46px] flex-1 !rounded-full !px-5" value={mouId} onChange={(e) => setMouId(e.target.value)}>
              <option value="">Atau pilih MoU yang menjadi dasarnya…</option>
              {mouAktif.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nomorKontrak || m.nomorPengajuan} · {m.judul}
                </option>
              ))}
            </select>
            <TombolKirim />
          </form>
        </div>
      );

    case "perubahan":
      return (
        <div className="space-y-3">
          <Kontainer jeda={0.04} className="flex flex-wrap gap-2" role="group" aria-label="Pilih yang diubah addendum">
            {JENIS_PERUBAHAN.map((j) => {
              const aktifPilih = dipilih.includes(j);
              return (
                <motion.button key={j} type="button" variants={itemKecil} aria-pressed={aktifPilih} whileHover={{ y: -2 }} whileTap={tekan} transition={pegas} onClick={() => setDipilih((d) => (d.includes(j) ? d.filter((x) => x !== j) : [...d, j]))} className={cx("inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors [@media(pointer:coarse)]:min-h-11", aktifPilih ? "border-brand bg-brand text-brand-on" : "border-brand bg-surface text-brand hover:bg-brand-soft")}>
                  {aktifPilih && <Check className="h-4 w-4" aria-hidden="true" />}
                  {j}
                </motion.button>
              );
            })}
          </Kontainer>
          <Tombol kecil ikon={<Send className="h-4 w-4" />} onClick={() => void onJawab(id, { jenisPerubahan: dipilih }, dipilih.length ? dipilih.join(", ") : "Belum tahu, biar Legal yang menelaah")}>
            {dipilih.length ? "Lanjut" : "Belum tahu, lanjut"}
          </Tombol>
        </div>
      );
    case "mitra":
      return (
        <div className="space-y-3">
          {kolomTeks({ placeholder: "Nama PT / vendor…" })}
          <ChipSaranMitra
            teks={teks}
            daftarMitra={saranMitra.daftarMitra}
            kontrak={saranMitra.kontrak}
            onPilih={(sm) => void onJawab(id, { mitra: sm.nama, mitraId: sm.mitra?.id ?? rapikanMitra(sm.nama, saranMitra.daftarMitra).mitraId }, sm.nama)}
          />
        </div>
      );

    case "jenis":
      return (
        <Kontainer jeda={0.045} className="flex flex-wrap gap-2" role="group" aria-label="Pilih jenis kontrak">
          {JENIS_KONTRAK.map((j) => (
            <Pilihan key={j} onPilih={() => void onJawab(id, { jenis: j }, j)}>
              {j}
            </Pilihan>
          ))}
        </Kontainer>
      );

    case "induk":
      return induk.length === 0 ? (
        <div className="space-y-2.5">
          <p className="text-sm text-muted">Belum ada kontrak aktif yang bisa dijadikan induk. Anda tetap bisa lanjut; Legal yang akan menautkannya.</p>
          <Kontainer className="flex gap-2">
            <Pilihan onPilih={() => void onJawab(id, { kontrakIndukId: null }, "Nanti dihubungkan Legal")}>Lanjutkan tanpa kontrak induk</Pilihan>
          </Kontainer>
        </div>
      ) : (
        <form
          className="flex items-end gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const k = induk.find((x) => String(x.id) === indukId);
            if (!k) return onGalat("Pilih salah satu kontrak dulu ya.");
            // Mitra, divisi, proyek, referensi, dan mata uang ikut dari kontrak induk lewat jawab() (warisanAcuan),
            // sama seperti saat dibuka lewat tombol "Ajukan Addendum".
            void onJawab(id, { kontrakIndukId: k.id }, `${k.nomorKontrak || k.nomorPengajuan} · ${k.judul}`);
          }}
        >
          <select autoFocus aria-label="Kontrak induk" className="input h-[46px] flex-1 !rounded-full !px-5" value={indukId} onChange={(e) => setIndukId(e.target.value)}>
            <option value="">Pilih kontrak…</option>
            {induk.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nomorKontrak || k.nomorPengajuan} · {k.judul}
              </option>
            ))}
          </select>
          <TombolKirim />
        </form>
      );

    case "divisi":
      return (
        <Kontainer jeda={0.05} className="flex flex-wrap gap-2" role="group" aria-label="Pilih divisi">
          {DIVISI_PENGAJU.map((d) => (
            // Saat diubah dari ringkasan, divisi yang sedang dipakai ditandai.
            <Pilihan key={d} terpilih={d === data.divisi} ikon={d === data.divisi ? <Check className="h-4 w-4" aria-hidden="true" /> : undefined} onPilih={() => void onJawab(id, { divisi: d }, d)}>
              {d}
            </Pilihan>
          ))}
        </Kontainer>
      );

    case "proyek": {
      const kantorPusat = rapikanProyek(proyek) === PROYEK_KANTOR_PUSAT;
      const chip = (aktifChip: boolean) =>
        cx("inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors [@media(pointer:coarse)]:min-h-11", aktifChip ? "border-brand bg-brand text-brand-on" : "border-brand bg-surface text-brand hover:bg-brand-soft");
      return (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const p = rapikanProyek(proyek);
            const r = rapikanReferensi(referensi);
            if (!p && !r) return onGalat("Isi kode proyek atau nomor referensinya, atau pilih “Menyusul”.");
            void onJawab(id, { kodeProyek: p, nomorReferensi: r }, teksProyekReferensi({ kodeProyek: p, nomorReferensi: r }));
          }}
        >
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="min-w-0">
              <span className="label">Kode proyek</span>
              <input autoFocus list={idDaftarProyek} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="input" maxLength={100} placeholder="Contoh: TOL-X-2026" value={proyek} onChange={(e) => setProyek(e.target.value)} />
            </label>
            <label className="min-w-0">
              <span className="label">Nomor PR / PO / SPK</span>
              <input autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="send" className="input font-mono" maxLength={200} placeholder="Pisahkan dengan koma" value={referensi} onChange={(e) => setReferensi(e.target.value)} />
            </label>
          </div>
          <datalist id={idDaftarProyek}>
            {proyekSaran.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Pilihan cepat proyek">
            <motion.button type="button" whileTap={tekan} transition={pegas} aria-pressed={kantorPusat} onClick={() => setProyek(kantorPusat ? "" : PROYEK_KANTOR_PUSAT)} className={chip(kantorPusat)}>
              <Building2 className="h-4 w-4" aria-hidden="true" />
              {LABEL_KANTOR_PUSAT}
            </motion.button>
            {proyekSaya.map((p) => {
              const aktifChip = rapikanProyek(proyek).toLowerCase() === p.toLowerCase();
              return (
                <motion.button key={p} type="button" whileTap={tekan} transition={pegas} aria-pressed={aktifChip} title="Proyek yang terakhir Anda pakai" onClick={() => setProyek(aktifChip ? "" : p)} className={chip(aktifChip)}>
                  {aktifChip && <Check className="h-4 w-4" aria-hidden="true" />}
                  {p}
                </motion.button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Pilihan onPilih={() => void onJawab(id, { kodeProyek: "", nomorReferensi: "" }, "Menyusul")}>Menyusul</Pilihan>
            <TombolKirim />
          </div>
        </form>
      );
    }

    case "nilai":
      return (
        <div className="space-y-3">
          <form onSubmit={kirimTeks} className="flex items-end gap-2.5">
            {kunciMataUang ? (
              // U29A: mata uang addendum dikunci sama dengan induk; ditampilkan, tidak bisa dipilih.
              <span className="input flex h-[46px] w-24 shrink-0 items-center justify-center gap-1.5 !rounded-full !px-3 font-semibold text-muted" aria-hidden="true">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                {kunciMataUang}
              </span>
            ) : (
              <select className="input h-[46px] w-24 shrink-0 !rounded-full !px-4" value={mataUang} onChange={(e) => setMataUang(e.target.value as MataUang)} aria-label="Mata uang">
                {MATA_UANG.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            )}
            <input autoFocus aria-label={kunciMataUang ? `Selisih nilai dalam ${kunciMataUang}` : addendum ? "Selisih nilai" : "Nilai kontrak"} inputMode={addendum ? "text" : "decimal"} autoComplete="off" enterKeyHint="send" className="input angka h-[46px] min-w-0 flex-1 !rounded-full !px-5 text-right" placeholder="0" value={teks} onChange={(e) => setTeks(e.target.value)} />
            <TombolKirim />
          </form>
          {kunciMataUang && <p className="flex items-center gap-1.5 text-xs text-muted">Mata uang addendum mengikuti kontrak induk ({kunciMataUang}).</p>}
          <Kontainer className="flex gap-2">
            <Pilihan onPilih={() => void onJawab(id, { nilai: null }, addendum ? "Tidak mengubah nilai" : "Tidak ada nilai")}>{addendum ? "Tidak mengubah nilai" : "Tidak ada nilai"}</Pilihan>
          </Kontainer>
        </div>
      );

    case "masa":
      return (
        <div className="space-y-3">
          <form
            className="flex flex-wrap items-end gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!mulai || !akhir) return onGalat("Isi kedua tanggalnya, atau pilih “Belum ditentukan”.");
              if (akhir < mulai) return onGalat("Tanggal berakhir tidak boleh sebelum tanggal mulai.");
              void onJawab(id, { tanggalMulai: mulai, tanggalBerakhir: akhir }, `${formatTanggal(mulai)} – ${formatTanggal(akhir)}`);
            }}
          >
            <label className="min-w-[9rem] flex-1">
              <span className="label">Mulai</span>
              <input autoFocus type="date" className="input" value={mulai} onChange={(e) => setMulai(e.target.value)} />
            </label>
            <label className="min-w-[9rem] flex-1">
              <span className="label">Berakhir</span>
              <input type="date" className="input" value={akhir} min={mulai || undefined} onChange={(e) => setAkhir(e.target.value)} />
            </label>
            <TombolKirim />
          </form>
          <Kontainer className="flex gap-2">
            <Pilihan onPilih={() => void onJawab(id, { tanggalMulai: null, tanggalBerakhir: null }, addendum ? "Waktu tidak berubah" : "Belum ditentukan")}>{addendum ? "Waktu tidak berubah" : "Belum ditentukan"}</Pilihan>
          </Kontainer>
        </div>
      );

    case "target": {
      const cepat = (hari: number, label: string) => (
        <Pilihan key={label} onPilih={() => void onJawab(id, { targetSelesai: tambahHari(hari) }, `${label} (${formatTanggal(tambahHari(hari))})`)}>
          {label}
        </Pilihan>
      );
      return (
        <div className="space-y-3">
          <Kontainer jeda={0.05} className="flex flex-wrap gap-2" role="group" aria-label="Pilihan cepat target selesai">
            {cepat(7, "1 minggu")}
            {cepat(14, "2 minggu")}
            {cepat(30, "1 bulan")}
            <Pilihan onPilih={() => void onJawab(id, { targetSelesai: null }, "Tidak ada target")}>Tidak ada target</Pilihan>
          </Kontainer>
          <form
            className="flex items-end gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!tanggal) return onGalat("Pilih tanggalnya, atau pakai pilihan cepat di atas.");
              void onJawab(id, { targetSelesai: tanggal }, formatTanggal(tanggal));
            }}
          >
            <label className="flex-1">
              <span className="label">Atau pilih tanggal</span>
              <input type="date" className="input" value={tanggal} min={tambahHari(0)} onChange={(e) => setTanggal(e.target.value)} />
            </label>
            <TombolKirim />
          </form>
        </div>
      );
    }

    case "prioritas":
      return (
        <Kontainer jeda={0.06} className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Pilih prioritas">
          {PRIORITAS.map((p) => (
            <motion.button key={p} type="button" variants={itemKecil} whileHover={{ y: -3 }} whileTap={tekan} transition={pegas} onClick={() => void onJawab(id, { prioritas: p }, p)} className="group rounded-2xl border border-line bg-surface p-4 text-left shadow-sm transition-colors hover:border-brand hover:bg-brand hover:text-brand-on">
              <span className="block text-sm font-bold">{p}</span>
              <span className="mt-0.5 block text-xs text-muted transition-colors group-hover:text-brand-on">{KETERANGAN_PRIORITAS[p]}</span>
            </motion.button>
          ))}
        </Kontainer>
      );

    case "deskripsi":
      return (
        <div className="space-y-3">
          {kolomTeks({ placeholder: "Ruang lingkup, lokasi proyek, hal yang perlu Legal perhatikan…", panjang: true })}
          <p className="hidden text-xs text-muted [@media(pointer:fine)]:block">Tips: tekan Ctrl + Enter untuk mengirim jawaban.</p>
          <Kontainer className="flex gap-2">
            <Pilihan onPilih={() => void onJawab(id, { deskripsi: "" }, "Lewati")}>Lewati</Pilihan>
          </Kontainer>
        </div>
      );

    case "berkas": {
      const kurang = kekuranganDokumen(data.jenis, berkas.map((b) => b.jenis)).kurang;
      const nama = berkas.map((b) => b.file.name).join(", ");
      return (
        <div className="space-y-3">
          <PenghitungSyarat jenisKontrak={data.jenis} jenisAda={berkas.map((b) => b.jenis)} />
          <div className="scroll-halus max-h-[38dvh] overflow-y-auto">
            <UnggahDokumen kompak berkas={berkas} onUbah={setBerkas} jenisBawaan="Draft Kontrak" />
          </div>
          <Kontainer className="flex flex-wrap items-center gap-2">
            {berkas.length > 0 && kurang.length === 0 && (
              <Tombol kecil onClick={() => void onJawab(id, { berkas, susulan: false }, nama)} ikon={<MessageSquarePlus className="h-4 w-4" />}>
                Selesai, lanjut
              </Tombol>
            )}
            {berkas.length > 0 && kurang.length > 0 && (
              <>
                <Tombol kecil onClick={() => void onJawab(id, { berkas, susulan: true }, `${nama} (sisanya menyusul)`)} ikon={<MessageSquarePlus className="h-4 w-4" />}>
                  Lanjut, sisanya menyusul
                </Tombol>
                <span className="text-xs text-muted">Masih kurang {kurang.length} dokumen wajib. Boleh menyusul, nanti saya catatkan untuk Legal.</span>
              </>
            )}
            {berkas.length === 0 && (
              <Pilihan onPilih={() => void onJawab(id, { berkas: [], susulan: kurang.length > 0 }, kurang.length ? "Unggah nanti, semuanya menyusul" : "Unggah nanti")}>Unggah nanti</Pilihan>
            )}
          </Kontainer>
        </div>
      );
    }
  }
}
