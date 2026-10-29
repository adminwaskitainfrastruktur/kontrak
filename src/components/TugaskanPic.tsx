// Penugasan PIC Legal (U02): menu "Tugaskan ke..." berisi staf Legal aktif beserta bebannya, modal
// "Alihkan dari X ke Y" dengan alasan wajib bila sudah ada PIC, dan "Alihkan semua" untuk delegasi cuti.
//
// Setiap penulisan membaca ulang kontrak lebih dulu dan batal bila PIC sudah diubah orang lain sejak
// halaman dimuat (pengganti If-Match). Jejak "Penugasan" lama-ke-baru adalah pelengkap: bila gagal
// dicatat, penugasan tetap berlaku dan pengguna diberi tahu lewat toast.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as KE } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ChevronDown, Sparkles, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { useSesi } from "../context/SesiContext";
import { useMuat } from "../hooks/useMuat";
import { adalahLegal } from "../lib/alur";
import { bebanTim, detailPenugasan, jalankanBertahap, kontrakDipegang, labelBeban, pesanPenugasan, saranPic, type BebanStaf } from "../lib/beban";
import { pesanError } from "../lib/graph";
import { umpanBalik } from "../lib/umpanBalik";
import { EASE_KELUAR, pegas } from "../lib/gerak";
import { STATUS_FINAL, type Kontrak, type Sesi } from "../lib/types";
import { catatAktivitas } from "../services/aktivitas";
import { ambilKontrak, ambilSemuaKontrak, kosongkanCacheKontrak, tetapkanPic } from "../services/kontrak";
import { AksiModal, Avatar, Modal, Tombol, cx } from "./ui";

// --- Eksekusi -------------------------------------------------------------------------------

export interface Pic {
  email: string;
  nama: string;
}

export interface HasilPenugasan {
  kontrak: Kontrak;
  /** false bila jejak "Penugasan" gagal dicatat (penugasan tetap berlaku). */
  jejakTercatat: boolean;
  /** Email pemberitahuan yang belum masuk antrean, dsb. Penugasan tetap berlaku. */
  peringatan: string[];
}

/** Galat yang pesannya sudah ramah dan boleh ditampilkan apa adanya. */
export class GalatPenugasan extends Error {}

/**
 * Tetapkan atau alihkan PIC satu kontrak. Kontrak dibaca ulang dulu; bila PIC-nya sudah berubah dari
 * `k.picLegalEmail` (data yang dilihat pengguna), penugasan dibatalkan dengan pesan jelas.
 */
export async function jalankanPenugasan(k: Kontrak, baru: Pic, alasan: string, sesi: Sesi): Promise<HasilPenugasan> {
  kosongkanCacheKontrak();
  const segar = await ambilKontrak(k.id);
  const lamaDilihat = k.picLegalEmail.trim().toLowerCase();
  const lamaSekarang = segar.picLegalEmail.trim().toLowerCase();
  if (lamaSekarang !== lamaDilihat) {
    throw new GalatPenugasan(
      lamaSekarang
        ? `PIC ${segar.nomorPengajuan} baru saja diubah menjadi ${segar.picLegalNama || segar.picLegalEmail}. Muat ulang dulu supaya tidak menimpa keputusan orang lain.`
        : `PIC ${segar.nomorPengajuan} baru saja dilepas orang lain. Muat ulang dulu, lalu tugaskan lagi.`,
    );
  }
  if (STATUS_FINAL.includes(segar.status)) throw new GalatPenugasan(`${segar.nomorPengajuan} sudah berstatus ${segar.status}, jadi PIC-nya tidak perlu diubah.`);
  if (lamaSekarang === baru.email.trim().toLowerCase()) throw new GalatPenugasan(`${segar.nomorPengajuan} sudah dipegang ${baru.nama}.`);

  // Jejak "Penugasan" (dengan alasan dan lama-ke-baru) dicatat di sini, jadi tetapkanPic tidak mencatat lagi.
  // tetapkanPic mengabari PIC baru dan PIC lama (bila dialihkan) beserta alasannya.
  const peringatan = await tetapkanPic(segar, baru, sesi, { catat: false, alasan });
  const lama = { email: segar.picLegalEmail, nama: segar.picLegalNama };
  let jejakTercatat = true;
  try {
    await catatAktivitas({ kontrakId: segar.id, jenis: "Penugasan", pesan: pesanPenugasan(lama, baru, alasan, sesi.nama), detail: detailPenugasan(lama, baru) }, sesi);
  } catch (err) {
    jejakTercatat = false;
    console.warn("Jejak penugasan gagal dicatat:", err);
  }
  return { kontrak: { ...segar, picLegalEmail: baru.email, picLegalNama: baru.nama }, jejakTercatat, peringatan };
}

/** Ringkasan hasil penugasan banyak kontrak lewat toast. */
export function laporHasilMassal(judul: string, berhasil: number, gagal: { nomor: string; pesan: string }[], idToast?: string | number) {
  if (gagal.length === 0) {
    toast.success(`${judul}: ${berhasil} kontrak beres.`, { id: idToast });
    return;
  }
  const rinci = gagal
    .slice(0, 4)
    .map((g) => `${g.nomor}: ${g.pesan}`)
    .join("\n");
  const sisa = gagal.length > 4 ? `\n...dan ${gagal.length - 4} lainnya.` : "";
  const isi = { id: idToast, description: rinci + sisa, duration: 12_000 };
  if (berhasil === 0) toast.error(`${judul}: semua ${gagal.length} kontrak gagal.`, isi);
  else toast.warning(`${judul}: ${berhasil} berhasil, ${gagal.length} gagal.`, isi);
}

// --- Menu staf --------------------------------------------------------------------------------

export interface PropsMenuStaf {
  beban: readonly BebanStaf[];
  /** Email PIC sekarang (ditandai dan tidak bisa dipilih). */
  picSekarang?: string;
  /** Email yang tidak boleh dipilih selain PIC sekarang (mis. sumber alih massal). */
  kecuali?: readonly string[];
  onPilih: (staf: BebanStaf) => void;
  onTutup: () => void;
  /** Label kepala menu. */
  judul?: string;
  className?: string;
}

/** Daftar staf Legal aktif dengan jumlah beban dan penanda "Saran". Dipakai juga oleh AksiMassal. */
export function MenuStaf({ beban, picSekarang = "", kecuali = [], onPilih, onTutup, judul = "Tugaskan ke", className }: PropsMenuStaf) {
  const { sesi } = useSesi();
  const kurangiGerak = useReducedMotion();
  const wadah = useRef<HTMLDivElement>(null);
  const pic = picSekarang.trim().toLowerCase();
  const larangan = useMemo(() => new Set([pic, ...kecuali.map((e) => e.toLowerCase())].filter(Boolean)), [pic, kecuali]);
  const aktif = useMemo(() => [...beban].filter((b) => b.aktif).sort((a, b) => a.total - b.total || a.nama.localeCompare(b.nama, "id")), [beban]);
  const saran = useMemo(() => saranPic(aktif, { sesiEmail: sesi.email, kecuali: [...larangan] }), [aktif, sesi.email, larangan]);
  const maks = Math.max(1, ...aktif.map((b) => b.total));

  // onTutup biasanya fungsi baru tiap render; disimpan di ref supaya fokus awal tidak dipasang ulang.
  const tutupRef = useRef(onTutup);
  tutupRef.current = onTutup;
  useEffect(() => {
    wadah.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    const klikLuar = (e: PointerEvent) => {
      // Klik pada tombol pemicu ditangani tombol itu sendiri (buka/tutup); kalau ikut ditutup di sini, menu langsung terbuka lagi.
      if ((e.target as Element | null)?.closest?.('[aria-haspopup="menu"]')) return;
      if (wadah.current && !wadah.current.contains(e.target as Node)) tutupRef.current();
    };
    document.addEventListener("pointerdown", klikLuar);
    return () => document.removeEventListener("pointerdown", klikLuar);
  }, []);

  const tekanTombol = (e: KE<HTMLDivElement>) => {
    const item = [...(wadah.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
    const i = item.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      onTutup();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      item[(i + 1) % item.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      item[(i - 1 + item.length) % item.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      item[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      item[item.length - 1]?.focus();
    }
  };

  return (
    <motion.div
      ref={wadah}
      role="menu"
      aria-label={judul}
      onKeyDown={tekanTombol}
      initial={kurangiGerak ? false : { opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={kurangiGerak ? { opacity: 0 } : { opacity: 0, y: -4, transition: { duration: 0.12 } }}
      transition={{ duration: 0.2, ease: EASE_KELUAR }}
      className={cx("z-40 w-[min(20rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-pop", className)}
    >
      <div className="border-b border-line px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">{judul}</p>
        {saran ? (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-muted">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            {saran.alasan}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">Belum ada staf Legal aktif lain yang bisa ditugasi.</p>
        )}
      </div>
      {aktif.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">Daftar staf Legal masih kosong. Admin bisa menambahkannya di halaman Pengguna.</p>
      ) : (
        <ul className="scroll-halus max-h-80 overflow-y-auto py-1">
          {aktif.map((b) => {
            const dilarang = larangan.has(b.email);
            const diSarankan = saran?.staf.email === b.email;
            const saya = b.email === sesi.email.toLowerCase();
            return (
              <li key={b.email}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={dilarang}
                  onClick={() => onPilih(b)}
                  className={cx(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors focus:outline-none focus-visible:bg-raised disabled:cursor-not-allowed disabled:opacity-60",
                    !dilarang && "hover:bg-raised",
                    diSarankan && "bg-accent-soft",
                  )}
                >
                  <Avatar nama={b.nama} ukuran={30} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{b.nama}</span>
                      {saya && <span className="shrink-0 rounded-full bg-raised px-1.5 text-[10px] font-bold text-muted">Anda</span>}
                      {diSarankan && <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-on">Saran</span>}
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${(b.total / maks) * 100}%` }} />
                      </span>
                      <span className="text-xs text-muted">{dilarang && pic === b.email ? "PIC sekarang" : labelBeban(b)}</span>
                    </span>
                  </span>
                  {dilarang && pic === b.email && <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}

// --- Tombol + alur penugasan satu kontrak ---------------------------------------------------

export interface PropsTugaskanPic {
  k: Kontrak;
  /** Semua kontrak untuk menghitung beban. Bila kosong, dimuat sendiri (memakai cache service). */
  semua?: Kontrak[];
  /** Dipanggil setelah penugasan berhasil (muat ulang halaman induk). */
  onBerubah: () => void | Promise<void>;
  /** Kelas tambahan untuk tombol pemicu (mis. gaya tombol di hero detail). */
  className?: string;
}

/**
 * Pengganti tombol "Jadikan saya PIC". Hanya tampil untuk Legal/Admin dan kontrak yang belum final.
 */
export default function TugaskanPic({ k, semua, onBerubah, className }: PropsTugaskanPic) {
  const { sesi, pengguna } = useSesi();
  const idMenu = useId();
  const idPemicu = useId();
  const [buka, setBuka] = useState(false);
  const [alih, setAlih] = useState<BebanStaf | null>(null);
  const [proses, setProses] = useState(false);
  const muatan = useMuat(() => (semua ? Promise.resolve(semua) : ambilSemuaKontrak()), [semua]);
  const beban = useMemo(() => bebanTim(pengguna, muatan.data ?? semua ?? []), [pengguna, muatan.data, semua]);

  if (!adalahLegal(sesi) || STATUS_FINAL.includes(k.status)) return null;

  const adaPic = !!k.picLegalEmail.trim();
  const tutupMenu = () => {
    setBuka(false);
    document.getElementById(idPemicu)?.focus();
  };

  const eksekusi = async (staf: BebanStaf, alasan: string) => {
    setProses(true);
    try {
      const h = await jalankanPenugasan(k, { email: staf.email, nama: staf.nama }, alasan, sesi);
      const diri = staf.email === sesi.email.toLowerCase();
      const lama = k.picLegalNama || k.picLegalEmail;
      toast.success(diri ? `${k.nomorPengajuan} sekarang Anda pegang.` : `${k.nomorPengajuan} ditugaskan ke ${staf.nama}.`, {
        description: diri ? (adaPic ? `${lama} diberi tahu lewat email.` : undefined) : adaPic ? `${staf.nama} dan ${lama} akan menerima email pemberitahuan.` : `${staf.nama} akan menerima email pemberitahuan.`,
      });
      if (!h.jejakTercatat) toast.warning("Penugasan berlaku, tetapi jejaknya tidak tercatat di riwayat.");
      for (const p of h.peringatan) toast.warning(p, { duration: 10_000 });
      setAlih(null);
      await onBerubah();
    } catch (err) {
      // Konflik (PIC sudah diubah orang lain): pesan apa adanya lalu muat ulang. Galat lain lewat umpanBalik,
      // supaya galat sesi otomatis menawarkan Masuk ulang.
      if (err instanceof GalatPenugasan) {
        toast.error("Penugasan belum berhasil", { description: err.message });
        await onBerubah();
      } else {
        umpanBalik.gagal(err, "Penugasan belum berhasil");
      }
    } finally {
      setProses(false);
    }
  };

  const pilih = (staf: BebanStaf) => {
    setBuka(false);
    if (adaPic) setAlih(staf);
    else void eksekusi(staf, "");
  };

  return (
    <div className="relative inline-flex">
      <Tombol
        id={idPemicu}
        varian="kedua"
        className={className}
        ikon={adaPic ? <Users className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
        memuat={proses}
        aria-haspopup="menu"
        aria-expanded={buka}
        aria-controls={buka ? idMenu : undefined}
        onClick={() => setBuka((b) => !b)}
      >
        {adaPic ? "Alihkan PIC" : "Tugaskan ke..."}
        <ChevronDown className={cx("h-4 w-4 transition-transform", buka && "rotate-180")} aria-hidden="true" />
      </Tombol>
      <AnimatePresence>
        {buka && (
          <div id={idMenu} className="z-40 max-sm:fixed max-sm:inset-x-3 max-sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:flex max-sm:justify-center sm:absolute sm:right-0 sm:top-full sm:mt-2">
            <MenuStaf beban={beban} picSekarang={k.picLegalEmail} onPilih={pilih} onTutup={tutupMenu} judul={adaPic ? "Alihkan ke" : "Tugaskan ke"} />
          </div>
        )}
      </AnimatePresence>
      {alih && <ModalAlih k={k} ke={alih} proses={proses} onKirim={(alasan) => void eksekusi(alih, alasan)} onTutup={() => setAlih(null)} />}
    </div>
  );
}

const MIN_ALASAN = 5;

function ModalAlih({ k, ke, proses, onKirim, onTutup }: { k: Kontrak; ke: BebanStaf; proses: boolean; onKirim: (alasan: string) => void; onTutup: () => void }) {
  const [alasan, setAlasan] = useState("");
  const [coba, setCoba] = useState(false);
  const idAlasan = useId();
  const kurang = alasan.trim().length < MIN_ALASAN;
  const dari = k.picLegalNama || k.picLegalEmail;

  return (
    <Modal judul={`Alihkan dari ${dari} ke ${ke.nama}`} onTutup={onTutup}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setCoba(true);
          if (!kurang) onKirim(alasan.trim());
        }}
        className="space-y-4"
      >
        <div className="flex items-center gap-3 rounded-2xl bg-raised p-3">
          <Avatar nama={dari} ukuran={34} />
          <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <Avatar nama={ke.nama} ukuran={34} />
          <p className="min-w-0 text-sm">
            <span className="font-semibold">{k.nomorPengajuan}</span> <span className="text-muted">· {k.judul}</span>
            <span className="mt-0.5 block text-xs text-muted">Beban {ke.nama} saat ini: {labelBeban(ke).toLowerCase()}.</span>
          </p>
        </div>
        <label htmlFor={idAlasan} className="block">
          <span className="label">
            Alasan pengalihan<span className="ml-0.5 text-danger">*</span>
          </span>
          <textarea
            id={idAlasan}
            className="input min-h-[96px]"
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder="Mis. menyeimbangkan beban, atau Rina cuti sampai 10 Okt."
            aria-invalid={coba && kurang}
            aria-describedby={`${idAlasan}-bantuan`}
            autoFocus
          />
          <span id={`${idAlasan}-bantuan`} className={cx("mt-1 block text-xs", coba && kurang ? "text-danger" : "text-muted")}>
            {coba && kurang ? "Tuliskan alasannya dulu, minimal beberapa kata." : `Alasan tercatat di riwayat dan terlihat oleh ${dari} serta ${ke.nama}.`}
          </span>
        </label>
        <AksiModal>
          <Tombol type="button" varian="kedua" onClick={onTutup}>
            Batal
          </Tombol>
          <Tombol type="submit" memuat={proses} ikon={<Users className="h-4 w-4" />}>
            Alihkan
          </Tombol>
        </AksiModal>
      </form>
    </Modal>
  );
}

// --- Alih semua (delegasi cuti) ------------------------------------------------------------

export interface PropsAlihSemua {
  /** Staf yang kontraknya dialihkan. */
  dari: Pic;
  semua: Kontrak[];
  onTutup: () => void;
  onSelesai: () => void | Promise<void>;
}

/** Modal "Alihkan semua kontrak X ke Y": menyebut jumlah dan nomor tiap kontrak, alasan wajib. */
export function ModalAlihSemua({ dari, semua, onTutup, onSelesai }: PropsAlihSemua) {
  const { sesi, pengguna } = useSesi();
  const kurangiGerak = useReducedMotion();
  const idTujuan = useId();
  const idAlasan = useId();
  const beban = useMemo(() => bebanTim(pengguna, semua), [pengguna, semua]);
  const daftar = useMemo(() => kontrakDipegang(dari.email, semua), [dari.email, semua]);
  const calon = useMemo(() => beban.filter((b) => b.aktif && b.email !== dari.email.toLowerCase()), [beban, dari.email]);
  const saran = useMemo(() => saranPic(calon, { sesiEmail: sesi.email }), [calon, sesi.email]);
  const [tujuan, setTujuan] = useState(saran?.staf.email ?? "");
  const [alasan, setAlasan] = useState("");
  const [coba, setCoba] = useState(false);
  const [proses, setProses] = useState(false);
  const staf = calon.find((b) => b.email === tujuan) ?? null;
  const kurang = alasan.trim().length < MIN_ALASAN;

  const kirim = async () => {
    setCoba(true);
    if (!staf || kurang || daftar.length === 0) return;
    setProses(true);
    const idToast = toast.loading(`Mengalihkan 0 dari ${daftar.length} kontrak...`);
    const gagal: { nomor: string; pesan: string }[] = [];
    const h = await jalankanBertahap(daftar, (k) => jalankanPenugasan(k, { email: staf.email, nama: staf.nama }, alasan.trim(), sesi), {
      konkurensi: 3,
      kemajuan: (n, total) => toast.loading(`Mengalihkan ${n} dari ${total} kontrak...`, { id: idToast }),
    });
    for (const g of h.gagal) gagal.push({ nomor: g.item.nomorPengajuan, pesan: g.galat instanceof GalatPenugasan ? g.galat.message : pesanError(g.galat) });
    laporHasilMassal(`Alih dari ${dari.nama}`, h.berhasil.length, gagal, idToast);
    setProses(false);
    await onSelesai();
    onTutup();
  };

  return (
    <Modal judul={`Alihkan semua kontrak ${dari.nama}`} onTutup={onTutup} lebar="max-w-xl">
      {daftar.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">{dari.nama} tidak sedang memegang kontrak yang masih diproses. Tidak ada yang perlu dialihkan.</p>
          <AksiModal>
            <Tombol varian="kedua" onClick={onTutup}>
              Tutup
            </Tombol>
          </AksiModal>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void kirim();
          }}
        >
          <p className="text-sm">
            Ada <strong className="angka">{daftar.length}</strong> kontrak yang masih diproses dan dipegang {dari.nama}. Semuanya akan dipindah ke staf yang Anda pilih, cocok untuk masa cuti atau rotasi tugas.
          </p>
          <ul className="scroll-halus max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-line bg-raised p-2" aria-label="Kontrak yang akan dialihkan">
            {daftar.map((k, i) => (
              <motion.li
                key={k.id}
                initial={kurangiGerak ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...pegas, delay: kurangiGerak ? 0 : Math.min(i, 10) * 0.03 }}
                className="flex min-w-0 items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm"
              >
                <span className="shrink-0 font-mono text-xs font-semibold">{k.nomorPengajuan}</span>
                <span className="teks-panjang min-w-0 flex-1 text-muted">{k.judul}</span>
                <span className="shrink-0 text-xs text-muted">{k.status}</span>
              </motion.li>
            ))}
          </ul>
          <label htmlFor={idTujuan} className="block">
            <span className="label">
              Alihkan ke<span className="ml-0.5 text-danger">*</span>
            </span>
            <select id={idTujuan} className="input" value={tujuan} onChange={(e) => setTujuan(e.target.value)} aria-invalid={coba && !staf}>
              <option value="">Pilih staf Legal...</option>
              {calon.map((b) => (
                <option key={b.email} value={b.email}>
                  {b.nama} ({labelBeban(b).toLowerCase()}){saran?.staf.email === b.email ? " · saran" : ""}
                </option>
              ))}
            </select>
            {saran && <span className="mt-1 block text-xs text-muted">{saran.alasan}</span>}
          </label>
          <label htmlFor={idAlasan} className="block">
            <span className="label">
              Alasan<span className="ml-0.5 text-danger">*</span>
            </span>
            <textarea id={idAlasan} className="input min-h-[80px]" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. cuti tahunan 6-17 Okt 2026." aria-invalid={coba && kurang} />
            {coba && kurang && <span className="mt-1 block text-xs text-danger">Alasan wajib diisi supaya riwayat tiap kontrak jelas.</span>}
          </label>
          <AksiModal>
            <Tombol type="button" varian="kedua" onClick={onTutup} disabled={proses}>
              Batal
            </Tombol>
            <Tombol type="submit" memuat={proses} disabled={!staf} ikon={<Users className="h-4 w-4" />}>
              Alihkan {daftar.length} kontrak
            </Tombol>
          </AksiModal>
        </form>
      )}
    </Modal>
  );
}
