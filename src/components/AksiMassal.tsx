// Bilah aksi massal untuk tabel desktop Legal (U04). Kotak centang dikelola halaman induk; komponen ini
// hanya menerima `terpilih`. Dua aksi saja: "Tetapkan PIC ke..." dan "Tandai Berakhir" (khusus kontrak
// Aktif non-addendum yang sudah lewat masa berlaku efektifnya, ikut mengakhiri addendum Aktif-nya).
//
// Eksekusi memanggil ulang fungsi service yang sama dengan aksi tunggal (tetapkanPic/jalankanAksi) dengan
// konkurensi 3, setelah mengosongkan cache dan memeriksa ulang aksiTersedia pada data segar. Tanpa Graph
// $batch, dan sengaja tanpa "Mulai Review" massal.
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarX2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useSesi } from "../context/SesiContext";
import { adalahAddendum } from "../lib/addendum";
import { adalahLegal, aksiTersedia } from "../lib/alur";
import { bebanTim, jalankanBertahap, labelBeban, type BebanStaf } from "../lib/beban";
import { addendumAktifInduk, alasanTakBisaDiakhiri, bisaAkhiriMassal, selisihYmd, tanggalBerakhirEfektif } from "../lib/filterKerja";
import { formatTanggal, hariIni as hariIniJakarta } from "../lib/format";
import { pesanError } from "../lib/graph";
import { pegasLembut } from "../lib/gerak";
import type { Kontrak, ModeBerakhir, Sesi } from "../lib/types";
import { ambilKontrak, ambilSemuaKontrak, jalankanAksi, kosongkanCacheKontrak } from "../services/kontrak";
import { GalatPenugasan, MenuStaf, jalankanPenugasan, laporHasilMassal } from "./TugaskanPic";
import { AksiModal, Modal, Tombol, cx } from "./ui";

export interface PropsAksiMassal {
  /** Kontrak yang dicentang di tabel (dikelola induk). */
  terpilih: Kontrak[];
  /** Semua kontrak (untuk beban tim, berakhir efektif, dan addendum). */
  semua: Kontrak[];
  /** Kosongkan centang. */
  onBersihkan: () => void;
  /** Dipanggil setelah aksi selesai (muat ulang daftar). Centang dikosongkan otomatis. */
  onSelesai: () => void | Promise<void>;
  className?: string;
}

const nomorTampil = (k: Kontrak) => k.nomorKontrak || k.nomorPengajuan;
const MIN_ALASAN = 5;

export default function AksiMassal({ terpilih, semua, onBersihkan, onSelesai, className }: PropsAksiMassal) {
  const { sesi, pengguna } = useSesi();
  const kurangiGerak = useReducedMotion();
  const [menu, setMenu] = useState(false);
  const [picTujuan, setPicTujuan] = useState<BebanStaf | null>(null);
  const [akhiri, setAkhiri] = useState(false);
  const [proses, setProses] = useState(false);
  const hariIni = hariIniJakarta();
  const beban = useMemo(() => bebanTim(pengguna, semua), [pengguna, semua]);
  const syaratAkhir = useMemo(() => bisaAkhiriMassal(terpilih, semua, hariIni), [terpilih, semua, hariIni]);
  const tampil = adalahLegal(sesi) && terpilih.length > 0;

  const selesai = async () => {
    onBersihkan();
    await onSelesai();
  };

  return (
    <>
      <div className={cx("pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex justify-center pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]", className)}>
        <AnimatePresence>
          {tampil && (
            <motion.div
              role="toolbar"
              aria-label="Aksi untuk kontrak terpilih"
              initial={kurangiGerak ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={kurangiGerak ? { opacity: 0 } : { opacity: 0, y: 16, transition: { duration: 0.15 } }}
              transition={pegasLembut}
              className="pointer-events-auto relative flex w-full max-w-full flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2 pl-4 shadow-pop sm:w-auto"
            >
              <span className="text-sm font-semibold" aria-live="polite">
                <span className="angka">{terpilih.length}</span> dipilih
              </span>
              <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
              <div className="sm:relative">
                <Tombol kecil varian="kedua" ikon={<Users className="h-3.5 w-3.5" />} aria-haspopup="menu" aria-expanded={menu} disabled={proses} onClick={() => setMenu((m) => !m)}>
                  Tetapkan PIC ke...
                </Tombol>
                <AnimatePresence>
                  {menu && (
                    <div className="absolute bottom-full left-0 mb-2">
                      <MenuStaf
                        beban={beban}
                        judul={`Tetapkan PIC untuk ${terpilih.length} kontrak`}
                        onTutup={() => setMenu(false)}
                        onPilih={(b) => {
                          setMenu(false);
                          setPicTujuan(b);
                        }}
                      />
                    </div>
                  )}
                </AnimatePresence>
              </div>
              <span className="inline-flex" title={syaratAkhir.boleh ? undefined : syaratAkhir.alasan}>
                <Tombol kecil varian="kedua" ikon={<CalendarX2 className="h-3.5 w-3.5" />} disabled={!syaratAkhir.boleh || proses} aria-describedby={syaratAkhir.boleh ? undefined : "alasan-akhiri-massal"} onClick={() => setAkhiri(true)}>
                  Tandai Berakhir
                </Tombol>
              </span>
              {!syaratAkhir.boleh && (
                <span id="alasan-akhiri-massal" className="sr-only">
                  {syaratAkhir.alasan}
                </span>
              )}
              <button type="button" onClick={onBersihkan} disabled={proses} className="grid h-8 w-8 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label="Batalkan pilihan" title="Batalkan pilihan">
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {picTujuan && <ModalPicMassal terpilih={terpilih} ke={picTujuan} sesi={sesi} onProses={setProses} onTutup={() => setPicTujuan(null)} onSelesai={selesai} />}
      {akhiri && <ModalAkhiriMassal terpilih={terpilih} semua={semua} hariIni={hariIni} sesi={sesi} onProses={setProses} onTutup={() => setAkhiri(false)} onSelesai={selesai} />}
    </>
  );
}

// --- PIC massal ---------------------------------------------------------------------------------

function ModalPicMassal({ terpilih, ke, sesi, onProses, onTutup, onSelesai }: { terpilih: Kontrak[]; ke: BebanStaf; sesi: Sesi; onProses: (b: boolean) => void; onTutup: () => void; onSelesai: () => Promise<void> }) {
  const [alasan, setAlasan] = useState("");
  const [coba, setCoba] = useState(false);
  const [jalan, setJalan] = useState(false);
  const sudah = terpilih.filter((k) => k.picLegalEmail.trim().toLowerCase() === ke.email);
  const diproses = terpilih.filter((k) => !sudah.includes(k));
  const dialihkan = diproses.filter((k) => k.picLegalEmail.trim());
  const wajibAlasan = dialihkan.length > 0;
  const kurang = wajibAlasan && alasan.trim().length < MIN_ALASAN;

  const kirim = async () => {
    setCoba(true);
    if (kurang || diproses.length === 0) return;
    setJalan(true);
    onProses(true);
    const idToast = toast.loading(`Menugaskan 0 dari ${diproses.length} kontrak...`);
    const h = await jalankanBertahap(diproses, (k) => jalankanPenugasan(k, { email: ke.email, nama: ke.nama }, alasan.trim(), sesi), {
      konkurensi: 3,
      kemajuan: (n, total) => toast.loading(`Menugaskan ${n} dari ${total} kontrak...`, { id: idToast }),
    });
    const gagal = h.gagal.map((g) => ({ nomor: nomorTampil(g.item), pesan: g.galat instanceof GalatPenugasan ? g.galat.message : pesanError(g.galat) }));
    laporHasilMassal(`PIC ke ${ke.nama}`, h.berhasil.length, gagal, idToast);
    onProses(false);
    setJalan(false);
    onTutup();
    await onSelesai();
  };

  return (
    <Modal judul={`Tetapkan ${ke.nama} sebagai PIC`} onTutup={onTutup} lebar="max-w-xl">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void kirim();
        }}
      >
        <p className="text-sm">
          <strong className="angka">{diproses.length}</strong> kontrak akan dipegang {ke.nama} (beban saat ini: {labelBeban(ke).toLowerCase()}).
          {dialihkan.length > 0 && ` ${dialihkan.length} di antaranya sudah punya PIC dan akan dialihkan.`}
        </p>
        <DaftarNomor
          daftar={diproses}
          keterangan={(k) => (k.picLegalEmail ? `dari ${k.picLegalNama || k.picLegalEmail}` : "belum ada PIC")}
        />
        {sudah.length > 0 && <p className="text-xs text-muted">Dilewati karena sudah dipegang {ke.nama}: {sudah.map(nomorTampil).join(", ")}.</p>}
        {wajibAlasan && (
          <label className="block">
            <span className="label">
              Alasan pengalihan<span className="ml-0.5 text-danger">*</span>
            </span>
            <textarea className="input min-h-[80px]" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. pembagian ulang beban tim minggu ini." aria-invalid={coba && kurang} />
            {coba && kurang && <span className="mt-1 block text-xs text-danger">Alasan wajib diisi karena ada PIC yang dialihkan.</span>}
          </label>
        )}
        <AksiModal>
          <Tombol type="button" varian="kedua" onClick={onTutup} disabled={jalan}>
            Batal
          </Tombol>
          <Tombol type="submit" memuat={jalan} disabled={diproses.length === 0} ikon={<Users className="h-4 w-4" />}>
            Tetapkan {diproses.length} kontrak
          </Tombol>
        </AksiModal>
      </form>
    </Modal>
  );
}

// --- Tandai Berakhir massal ---------------------------------------------------------------------

/**
 * Cara berakhir yang ditawarkan di aksi massal: hanya dua yang lazim untuk kontrak yang sudah lewat masa berlakunya.
 * Diputus, dibatalkan bersama, dan sengketa menuntut alasan per kontrak, jadi ditutup satu per satu dari detailnya.
 */
const MODE_MASSAL: readonly { mode: ModeBerakhir; label: string; bantuan: string }[] = [
  { mode: "Selesai Normal", label: "Selesai normal", bantuan: "Pekerjaan atau masa kontrak selesai sebagaimana mestinya." },
  { mode: "Tidak Diperpanjang", label: "Tidak diperpanjang", bantuan: "Masa berlaku habis dan tidak ada perpanjangan atau addendum waktu." },
];

/** Tanggal efektif berakhir yang dicatat: tanggal berakhir efektif, tidak lebih awal dari tanggal mulai, cadangannya hari ini. */
function tanggalPenutupan(k: Kontrak, ef: string | null, hariIni: string): string {
  const t = ef ?? hariIni;
  return k.tanggalMulai && t < k.tanggalMulai ? k.tanggalMulai : t;
}

/**
 * Akhiri satu kontrak induk (dengan data segar) lalu addendum Aktif-nya. Cara dan tanggal efektif berakhir ikut
 * dicatat (K02): tanggalnya mengikuti masa berlaku efektif induk, juga untuk addendumnya. Galat addendum
 * dikembalikan, bukan dilempar.
 */
async function akhiriSatu(k: Kontrak, catatan: string, mode: ModeBerakhir, semuaSegar: readonly Kontrak[], hariIni: string, sesi: Sesi): Promise<{ nomor: string; pesan: string }[]> {
  const segar = await ambilKontrak(k.id);
  const halangan = alasanTakBisaDiakhiri(segar, semuaSegar.map((x) => (x.id === segar.id ? segar : x)), hariIni);
  if (halangan) throw new GalatPenugasan(`Dilewati: kontrak ${halangan}.`);
  const aksi = aksiTersedia(segar, sesi).find((a) => a.id === "akhiri");
  if (!aksi) throw new GalatPenugasan("Anda tidak lagi berhak menandai kontrak ini Berakhir.");
  const efektif = tanggalBerakhirEfektif(segar, semuaSegar.map((x) => (x.id === segar.id ? segar : x)));
  await jalankanAksi(segar, aksi, catatan, {}, sesi, { penutupan: { mode, tanggal: tanggalPenutupan(segar, efektif, hariIni) } });

  const gagal: { nomor: string; pesan: string }[] = [];
  for (const a of addendumAktifInduk(segar, semuaSegar)) {
    try {
      const add = await ambilKontrak(a.id);
      if (add.status !== "Aktif") continue;
      const aksiAdd = aksiTersedia(add, sesi).find((x) => x.id === "akhiri");
      if (!aksiAdd) throw new GalatPenugasan("tidak bisa ditandai Berakhir.");
      await jalankanAksi(add, aksiAdd, `Ikut berakhir bersama kontrak induk ${nomorTampil(segar)}. ${catatan}`.trim(), {}, sesi, { penutupan: { mode, tanggal: tanggalPenutupan(add, efektif, hariIni) } });
    } catch (err) {
      gagal.push({ nomor: nomorTampil(a), pesan: `addendum belum ikut berakhir (${err instanceof GalatPenugasan ? err.message : pesanError(err)})` });
    }
  }
  return gagal;
}

function ModalAkhiriMassal({ terpilih, semua, hariIni, sesi, onProses, onTutup, onSelesai }: { terpilih: Kontrak[]; semua: Kontrak[]; hariIni: string; sesi: Sesi; onProses: (b: boolean) => void; onTutup: () => void; onSelesai: () => Promise<void> }) {
  const [alasan, setAlasan] = useState("");
  const [mode, setMode] = useState<ModeBerakhir>("Selesai Normal");
  const [coba, setCoba] = useState(false);
  const [jalan, setJalan] = useState(false);
  const induk = terpilih.filter((k) => !adalahAddendum(k));
  const jumlahAdd = induk.reduce((n, k) => n + addendumAktifInduk(k, semua).length, 0);
  const kurang = alasan.trim().length < MIN_ALASAN;

  const kirim = async () => {
    setCoba(true);
    if (kurang) return;
    setJalan(true);
    onProses(true);
    const idToast = toast.loading(`Menutup 0 dari ${induk.length} kontrak...`);
    const gagal: { nomor: string; pesan: string }[] = [];
    try {
      kosongkanCacheKontrak();
      const semuaSegar = await ambilSemuaKontrak();
      const h = await jalankanBertahap(
        induk,
        async (k) => {
          gagal.push(...(await akhiriSatu(k, alasan.trim(), mode, semuaSegar, hariIni, sesi)));
        },
        { konkurensi: 3, kemajuan: (n, total) => toast.loading(`Menutup ${n} dari ${total} kontrak...`, { id: idToast }) },
      );
      for (const g of h.gagal) gagal.push({ nomor: nomorTampil(g.item), pesan: g.galat instanceof GalatPenugasan ? g.galat.message : pesanError(g.galat) });
      laporHasilMassal("Tandai Berakhir", h.berhasil.length, gagal, idToast);
    } catch (err) {
      toast.error("Data terbaru gagal dimuat, belum ada kontrak yang diubah.", { id: idToast, description: pesanError(err) });
    }
    onProses(false);
    setJalan(false);
    onTutup();
    await onSelesai();
  };

  return (
    <Modal judul={`Tandai ${induk.length} kontrak Berakhir`} onTutup={onTutup} lebar="max-w-xl">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void kirim();
        }}
      >
        <p className="text-sm">
          Kontrak di bawah sudah lewat masa berlakunya. Statusnya akan menjadi <strong>Berakhir</strong> dan pengaju diberi tahu.
          {jumlahAdd > 0 && ` ${jumlahAdd} addendum Aktif ikut diakhiri bersama induknya.`}
        </p>
        <DaftarNomor
          daftar={induk}
          keterangan={(k) => {
            const ef = tanggalBerakhirEfektif(k, semua);
            const lewat = ef ? -selisihYmd(hariIni, ef) : 0;
            const add = addendumAktifInduk(k, semua);
            return `berakhir ${formatTanggal(ef)}${lewat > 0 ? `, lewat ${lewat} hari` : ""}${add.length ? ` · +${add.length} addendum` : ""}`;
          }}
        />
        <fieldset className="min-w-0">
          <legend className="label">Cara kontrak berakhir</legend>
          <div role="radiogroup" aria-label="Cara kontrak berakhir" className="grid gap-2 sm:grid-cols-2">
            {MODE_MASSAL.map((m) => {
              const pilih = mode === m.mode;
              return (
                <button
                  key={m.mode}
                  type="button"
                  role="radio"
                  aria-checked={pilih}
                  disabled={jalan}
                  onClick={() => setMode(m.mode)}
                  className={cx(
                    "min-h-11 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:opacity-60",
                    pilih ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface hover:border-brand",
                  )}
                >
                  <span className="block font-semibold">{m.label}</span>
                  <span className="block text-xs text-muted">{m.bantuan}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted">Tanggal efektif berakhir mengikuti masa berlaku efektif tiap kontrak. Untuk diputus, dibatalkan bersama, atau sengketa, tutup dari halaman detail kontraknya.</p>
        </fieldset>
        <label className="block">
          <span className="label">
            Alasan<span className="ml-0.5 text-danger">*</span>
          </span>
          <textarea className="input min-h-[80px]" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. pekerjaan selesai dan BAST sudah terbit; tidak diperpanjang." aria-invalid={coba && kurang} />
          <span className={cx("mt-1 block text-xs", coba && kurang ? "text-danger" : "text-muted")}>{coba && kurang ? "Alasan wajib diisi, tercatat di riwayat tiap kontrak." : "Alasan tercatat di riwayat tiap kontrak."}</span>
        </label>
        <AksiModal>
          <Tombol type="button" varian="kedua" onClick={onTutup} disabled={jalan}>
            Batal
          </Tombol>
          <Tombol type="submit" varian="bahaya" memuat={jalan} ikon={<CalendarX2 className="h-4 w-4" />}>
            Tandai {induk.length} Berakhir
          </Tombol>
        </AksiModal>
      </form>
    </Modal>
  );
}

function DaftarNomor({ daftar, keterangan }: { daftar: Kontrak[]; keterangan: (k: Kontrak) => string }) {
  return (
    <ul className="scroll-halus max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-line bg-raised p-2" aria-label="Kontrak yang akan diproses">
      {daftar.map((k) => (
        <li key={k.id} className="flex min-w-0 flex-wrap items-baseline gap-x-2 rounded-xl bg-surface px-3 py-2 text-sm">
          <span className="shrink-0 font-mono text-xs font-semibold">{nomorTampil(k)}</span>
          <span className="teks-panjang min-w-0 flex-1">{k.judul}</span>
          <span className="w-full text-xs text-muted sm:w-auto">{keterangan(k)}</span>
        </li>
      ))}
    </ul>
  );
}
