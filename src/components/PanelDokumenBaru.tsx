// Panel dokumen di halaman detail kontrak (pengganti PanelDokumen lama di DetailKontrak.tsx).
// Dokumen dikelompokkan per jenis dengan lencana "Terbaru", unduhan selalu mengambil tautan segar,
// pratinjau PDF/gambar di laci, ubah jenis dan hapus (alasan dicatat), riwayat versi dan unggah versi baru.
// Pembanding dua versi sengaja tidak dibangun: Legal diarahkan ke riwayat versi SharePoint dan Compare di Word.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Archive, Download, Ellipsis, ExternalLink, Eye, FolderOpen, GitCompare, History, Info, Paperclip, Tags, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useMuat } from "../hooks/useMuat";
import { ambilAktivitas, catatAktivitas } from "../services/aktivitas";
import {
  ambilUnduhSegar,
  ambilVersi,
  hapusDokumen,
  ubahJenisDokumen,
  unggahBanyak,
  unggahVersiBaru,
  urlFolderKontrak,
  urlRiwayatVersiSharePoint,
  type DokumenSP,
} from "../services/dokumen";
import { adalahLegal, bisaUnggah } from "../lib/alur";
import { buatPaketArsip, periksaBatasArsip, simpanBlob } from "../lib/arsip";
import { formatRelatif, formatWaktu } from "../lib/format";
import { pesanError } from "../lib/graph";
import { izinDokumen, izinUbahJenis, kelompokkanDokumen, pilihanJenisUntuk, sepadanEkstensi, teksUkuran, teksVersi, validasiBerkas, ekstensiDari } from "../lib/jenisBerkas";
import type { Dokumen, JenisDokumen, Kontrak } from "../lib/types";
import { pegas } from "../lib/gerak";
import { useLapisan } from "../lib/lapisan";
import PratinjauDokumen, { caraPratinjau } from "./PratinjauDokumen";
import UnggahDokumen, { IkonBerkas, type BerkasAntre } from "./UnggahDokumen";
import { AksiModal, Isian, KotakError, Kosong, Lencana, Memuat, Modal, Tombol, cx } from "./ui";

/** Bentuk minimal hasil useMuat(ambilDokumen) yang dipakai panel. */
export interface MuatDokumen {
  data: Dokumen[] | null;
  error: unknown;
  loading: boolean;
  muatUlang: () => Promise<void>;
}

export interface PropsPanelDokumen {
  k: Kontrak;
  q: MuatDokumen;
  /** Dipanggil setelah unggah, ubah jenis, hapus, atau versi baru: muat ulang dokumen dan riwayat. */
  onDiunggah: () => void;
  /** Slot opsional di atas daftar, mis. panel kelengkapan dokumen wajib. */
  kelengkapan?: ReactNode;
  /** Jenis dokumen wajib untuk hitungan di antrean unggah. */
  syarat?: readonly JenisDokumen[];
}

const listItemDari = (d: Dokumen) => ("listItemId" in d ? (d as DokumenSP).listItemId : null);

type Dialog = { jenis: "ubah"; d: Dokumen } | { jenis: "hapus"; d: Dokumen } | { jenis: "versi"; d: Dokumen; unggah: boolean } | null;

export default function PanelDokumenBaru({ k, q, onDiunggah, kelengkapan, syarat }: PropsPanelDokumen) {
  const { sesi } = useSesi();
  const bolehUnggah = bisaUnggah(k, sesi);
  const [antre, setAntre] = useState<BerkasAntre[]>([]);
  const [bukaUnggah, setBukaUnggah] = useState(false);
  const [progres, setProgres] = useState<{ teks: string; persen: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pratinjau, setPratinjau] = useState<Dokumen | null>(null);
  const [mengunduh, setMengunduh] = useState<string | null>(null);

  const daftar = q.data ?? [];
  const kelompok = useMemo(() => kelompokkanDokumen(daftar), [daftar]);
  const belumBerjenis = daftar.filter((d) => !d.jenis).length;

  const unggah = async () => {
    if (!antre.length) return;
    setProgres({ teks: "Menyiapkan unggahan…", persen: 0 });
    const h = await unggahBanyak(k, antre, sesi, (teks, persen) => setProgres({ teks, persen }));
    setProgres(null);
    if (h.berhasil.length) {
      toast.success(h.berhasil.length === 1 ? `"${h.berhasil[0]!.nama}" sudah tersimpan` : `${h.berhasil.length} berkas sudah tersimpan`);
      onDiunggah();
    }
    const tanpaJenis = h.berhasil.filter((x) => !x.metadataTersimpan);
    if (tanpaJenis.length) toast.warning(`Jenis ${tanpaJenis.length} berkas belum tersimpan`, { description: 'Berkasnya aman. Ketuk lencana "Jenis belum diisi" untuk mengisinya.' });
    if (!h.aktivitasTercatat) toast.warning("Unggahan tidak tercatat di riwayat", { description: "Berkas tetap tersimpan di SharePoint." });
    if (h.gagal.length) {
      toast.error(`${h.gagal.length} berkas gagal diunggah`, { description: h.gagal.map((g) => `${g.nama}: ${g.pesan}`).join(" ") });
      const namaGagal = new Set(h.gagal.map((g) => g.nama));
      setAntre((a) => a.filter((b) => namaGagal.has(b.file.name)));
    } else {
      setAntre([]);
      setBukaUnggah(false);
    }
  };

  const unduh = async (d: Dokumen) => {
    setMengunduh(d.id);
    try {
      const url = await ambilUnduhSegar(d.id);
      const a = Object.assign(document.createElement("a"), { href: url, rel: "noopener" });
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast.error("Berkas belum bisa diunduh", { description: pesanError(err) });
    } finally {
      setMengunduh(null);
    }
  };

  const lihat = (d: Dokumen) => {
    const cara = caraPratinjau(d);
    if (cara.mode === "tab") {
      // Dibuka langsung dari klik supaya tidak diblokir peramban.
      window.open(d.webUrl, "_blank", "noopener,noreferrer");
      toast(cara.alasan);
      return;
    }
    setPratinjau(d);
  };

  return (
    <section
      className="kartu overflow-hidden"
      aria-labelledby="judul-dokumen"
      onDragEnter={(e) => {
        if (bolehUnggah && e.dataTransfer.types.includes("Files")) setBukaUnggah(true);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <h2 id="judul-dokumen" className="flex items-center gap-2 font-bold">
          <Paperclip className="h-4 w-4" aria-hidden="true" /> Dokumen
          {daftar.length > 0 && <span className="angka rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-muted">{daftar.length}</span>}
        </h2>
        <div className="flex flex-wrap gap-2">
          {daftar.length > 0 && (
            <Tombol kecil varian="hantu" ikon={<FolderOpen className="h-4 w-4" />} onClick={() => window.open(urlFolderKontrak(k.nomorPengajuan), "_blank", "noopener")}>
              Buka folder
            </Tombol>
          )}
          {adalahLegal(sesi) && daftar.length > 0 && <TombolArsip k={k} dokumen={daftar} />}
          {bolehUnggah && (
            <Tombol kecil varian={bukaUnggah ? "kedua" : "utama"} ikon={bukaUnggah ? <X className="h-4 w-4" /> : <Upload className="h-4 w-4" />} onClick={() => setBukaUnggah((b) => !b)} aria-expanded={bukaUnggah} disabled={!!progres}>
              {bukaUnggah ? "Tutup" : "Unggah"}
            </Tombol>
          )}
        </div>
      </div>

      {kelengkapan && <div className="border-b border-line px-5 py-4">{kelengkapan}</div>}

      <AnimatePresence initial={false}>
        {bolehUnggah && (bukaUnggah || (!!q.data && !daftar.length)) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-b border-line">
            <div className="space-y-3 px-5 py-4">
              <UnggahDokumen berkas={antre} onUbah={setAntre} syarat={syarat} sudahAda={daftar.map((d) => d.jenis)} nonaktif={!!progres} />
              {progres && (
                <div role="status" aria-live="polite">
                  <p className="mb-1.5 text-xs font-medium text-brand-strong">{progres.teks}</p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                    <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${progres.persen}%` }} transition={{ duration: 0.2 }} />
                  </div>
                </div>
              )}
              {antre.length > 0 && (
                <div className="flex flex-wrap justify-end gap-2">
                  <Tombol kecil varian="hantu" onClick={() => setAntre([])} disabled={!!progres}>
                    Kosongkan
                  </Tombol>
                  <Tombol kecil memuat={!!progres} ikon={<Upload className="h-4 w-4" />} onClick={() => void unggah()}>
                    Unggah {antre.length} berkas
                  </Tombol>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {belumBerjenis > 0 && (
        <p className="flex items-start gap-2 border-b border-line bg-accent-soft px-5 py-2.5 text-xs text-accent-ink">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {belumBerjenis} dokumen belum punya jenis, mungkin diunggah langsung lewat SharePoint atau metadatanya gagal tersimpan. Ketuk lencananya untuk mengisi.
        </p>
      )}

      {q.loading && !q.data ? (
        <Memuat teks="Memuat dokumen…" />
      ) : q.error ? (
        <div className="p-4">
          <KotakError error={q.error} ulangi={() => void q.muatUlang()} />
        </div>
      ) : !daftar.length ? (
        !bolehUnggah && <Kosong judul="Belum ada dokumen" teks="Dokumen akan muncul di sini setelah diunggah pengaju atau Legal." />
      ) : (
        <div className="divide-y divide-line">
          {kelompok.map((g) => (
            <div key={g.jenis || "kosong"}>
              <h3 className="flex items-center gap-2 bg-raised px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {g.jenis || "Jenis belum diisi"}
                <span className="angka">· {g.dokumen.length}</span>
              </h3>
              <ul className="divide-y divide-line">
                {g.dokumen.map((d) => (
                  <BarisDokumen
                    key={d.id}
                    k={k}
                    d={d}
                    terbaru={g.terbaruId === d.id}
                    mengunduh={mengunduh === d.id}
                    onLihat={() => lihat(d)}
                    onUnduh={() => void unduh(d)}
                    onDialog={setDialog}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {daftar.length > 0 && (
        <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-xs text-muted">
          <GitCompare className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Ingin membandingkan dua versi draft? Unduh keduanya lalu buka di Word: Tinjau, Bandingkan. Lebih akurat untuk tabel dan penomoran.
        </p>
      )}

      {dialog?.jenis === "ubah" && <ModalUbahJenis k={k} d={dialog.d} onTutup={() => setDialog(null)} onSelesai={onDiunggah} />}
      {dialog?.jenis === "hapus" && <ModalHapus k={k} d={dialog.d} onTutup={() => setDialog(null)} onSelesai={onDiunggah} />}
      {dialog?.jenis === "versi" && <ModalVersi k={k} d={dialog.d} fokusUnggah={dialog.unggah} onTutup={() => setDialog(null)} onSelesai={onDiunggah} />}
      {pratinjau && <PratinjauDokumen dokumen={pratinjau} onTutup={() => setPratinjau(null)} />}
    </section>
  );
}

// --- Baris dokumen ------------------------------------------------------------------

// Layar sentuh: 44 px supaya mudah ditekan (tetikus tetap ringkas).
const KELAS_IKON = "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-50 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

function BarisDokumen({
  k,
  d,
  terbaru,
  mengunduh,
  onLihat,
  onUnduh,
  onDialog,
}: {
  k: Kontrak;
  d: Dokumen;
  terbaru: boolean;
  mengunduh: boolean;
  onLihat: () => void;
  onUnduh: () => void;
  onDialog: (d: Dialog) => void;
}) {
  const { sesi } = useSesi();
  const bolehJenis = izinDokumen(k, d.jenis, "jenis", sesi).boleh;
  const bolehHapus = izinDokumen(k, d.jenis, "hapus", sesi).boleh;
  const bolehVersi = izinDokumen(k, d.jenis, "versi", sesi).boleh;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
      <IkonBerkas nama={d.nama} />
      <div className="min-w-0 flex-1 basis-44">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <a href={d.webUrl} target="_blank" rel="noreferrer" className="teks-panjang min-w-0 text-sm font-semibold transition-colors hover:text-brand sm:truncate" title={d.nama}>
            {d.nama}
          </a>
          {terbaru && <Lencana nada="sukses">Terbaru</Lencana>}
          {!d.jenis &&
            (bolehJenis ? (
              <button type="button" onClick={() => onDialog({ jenis: "ubah", d })} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent hover:text-accent-on [@media(pointer:coarse)]:min-h-11">
                <Tags className="h-3 w-3" aria-hidden="true" /> Jenis belum diisi
              </button>
            ) : (
              <Lencana nada="peringatan">Jenis belum diisi</Lencana>
            ))}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {teksUkuran(d.ukuran)} · {d.diubahOleh || "SharePoint"} · <time dateTime={d.diubah} title={formatWaktu(d.diubah)}>{formatRelatif(d.diubah)}</time>
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center">
        <button type="button" onClick={onLihat} className={KELAS_IKON} title="Pratinjau" aria-label={`Pratinjau ${d.nama}`}>
          <Eye className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={onUnduh} disabled={mengunduh} className={KELAS_IKON} title="Unduh" aria-label={`Unduh ${d.nama}`}>
          <Download className={cx("h-4 w-4", mengunduh && "animate-pulse")} aria-hidden="true" />
        </button>
        <a href={d.webUrl} target="_blank" rel="noreferrer" className={cx(KELAS_IKON, "hidden sm:grid")} title="Buka di SharePoint" aria-label={`Buka ${d.nama} di SharePoint`}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
        <MenuDokumen
          nama={d.nama}
          butir={[
            { label: "Buka di SharePoint", ikon: <ExternalLink className="h-4 w-4" />, aksi: () => window.open(d.webUrl, "_blank", "noopener,noreferrer"), hanyaPonsel: true },
            { label: "Riwayat versi", ikon: <History className="h-4 w-4" />, aksi: () => onDialog({ jenis: "versi", d, unggah: false }) },
            ...(bolehVersi ? [{ label: "Unggah versi baru", ikon: <Upload className="h-4 w-4" />, aksi: () => onDialog({ jenis: "versi", d, unggah: true }) }] : []),
            ...(bolehJenis ? [{ label: "Ubah jenis", ikon: <Tags className="h-4 w-4" />, aksi: () => onDialog({ jenis: "ubah", d }) }] : []),
            ...(bolehHapus ? [{ label: "Hapus", ikon: <Trash2 className="h-4 w-4" />, aksi: () => onDialog({ jenis: "hapus", d }), bahaya: true }] : []),
          ]}
        />
      </div>
    </li>
  );
}

interface ButirMenu {
  label: string;
  ikon: ReactNode;
  aksi: () => void;
  bahaya?: boolean;
  hanyaPonsel?: boolean;
}

function MenuDokumen({ nama, butir }: { nama: string; butir: ButirMenu[] }) {
  const [buka, setBuka] = useState(false);
  const wadah = useRef<HTMLDivElement>(null);
  const pemicu = useRef<HTMLButtonElement>(null);

  // Escape lewat tumpukan lapisan bersama: hanya menu ini yang tertutup, bukan juga modal atau palet di bawahnya.
  const tutupMenu = useCallback(() => {
    setBuka(false);
    pemicu.current?.focus();
  }, []);
  useLapisan(buka, tutupMenu);

  useEffect(() => {
    if (!buka) return;
    const luar = (e: PointerEvent) => !wadah.current?.contains(e.target as Node) && setBuka(false);
    const tombol = (e: KeyboardEvent) => {
      const item = Array.from(wadah.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []).filter((x) => x.offsetParent !== null);
      const i = item.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        item[(i + 1) % item.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        item[(i - 1 + item.length) % item.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", luar);
    document.addEventListener("keydown", tombol);
    const pertama = Array.from(wadah.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []).find((x) => x.offsetParent !== null);
    pertama?.focus();
    return () => {
      document.removeEventListener("pointerdown", luar);
      document.removeEventListener("keydown", tombol);
    };
  }, [buka]);

  return (
    <div ref={wadah} className="relative">
      <button ref={pemicu} type="button" onClick={() => setBuka((b) => !b)} className={KELAS_IKON} aria-haspopup="menu" aria-expanded={buka} aria-label={`Menu untuk ${nama}`}>
        <Ellipsis className="h-4 w-4" aria-hidden="true" />
      </button>
      <AnimatePresence>
        {buka && (
          <motion.div
            role="menu"
            aria-label={`Tindakan untuk ${nama}`}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
            transition={pegas}
            className="absolute right-0 top-full z-30 mt-1 w-52 origin-top-right overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-pop"
          >
            {butir.map((b) => (
              <button
                key={b.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setBuka(false);
                  b.aksi();
                }}
                className={cx(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-none [@media(pointer:coarse)]:min-h-11",
                  b.bahaya ? "text-danger hover:bg-danger-soft focus:bg-danger-soft" : "text-ink hover:bg-raised focus:bg-raised",
                  b.hanyaPonsel && "sm:hidden",
                )}
              >
                <span aria-hidden="true" className={b.bahaya ? "text-danger" : "text-muted"}>
                  {b.ikon}
                </span>
                {b.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Ubah jenis ----------------------------------------------------------------------

function ModalUbahJenis({ k, d, onTutup, onSelesai }: { k: Kontrak; d: Dokumen; onTutup: () => void; onSelesai: () => void }) {
  const { sesi } = useSesi();
  const pilihan = pilihanJenisUntuk(sesi).filter((j) => izinUbahJenis(k, d.jenis, j, sesi).boleh);
  const [jenis, setJenis] = useState<JenisDokumen | "">(d.jenis && pilihan.includes(d.jenis) ? d.jenis : "");
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");

  const simpan = async () => {
    if (!jenis) return setGalat("Pilih jenis dokumennya dulu.");
    if (jenis === d.jenis) return onTutup();
    const izin = izinUbahJenis(k, d.jenis, jenis, sesi);
    if (!izin.boleh) return setGalat(izin.alasan);
    setMenyimpan(true);
    setGalat("");
    try {
      await ubahJenisDokumen(d.id, jenis);
    } catch (err) {
      setGalat(pesanError(err));
      setMenyimpan(false);
      return;
    }
    await catatAktivitas(
      { kontrakId: k.id, jenis: "Dokumen", pesan: `Mengubah jenis "${d.nama}" menjadi ${jenis}.`, detail: [{ kolom: "Jenis dokumen", dari: d.jenis || "(belum diisi)", ke: jenis }] },
      sesi,
    ).catch(() => toast.warning("Perubahan jenis tersimpan, tetapi tidak tercatat di riwayat."));
    toast.success(`"${d.nama}" sekarang berjenis ${jenis}`);
    onSelesai();
    onTutup();
  };

  return (
    <Modal judul="Ubah jenis dokumen" onTutup={onTutup}>
      <div className="flex items-center gap-3 rounded-2xl bg-raised p-3">
        <IkonBerkas nama={d.nama} kecil />
        <p className="teks-panjang min-w-0 text-sm font-semibold">{d.nama}</p>
      </div>
      <Isian label="Jenis dokumen" wajib className="mt-4">
        <select className="input" value={jenis} onChange={(e) => setJenis(e.target.value as JenisDokumen)} autoFocus>
          <option value="" disabled>
            Pilih jenis…
          </option>
          {pilihan.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </Isian>
      {galat && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {galat}
        </p>
      )}
      <AksiModal>
        <Tombol varian="kedua" onClick={onTutup} disabled={menyimpan}>
          Batal
        </Tombol>
        <Tombol memuat={menyimpan} onClick={() => void simpan()}>
          Simpan jenis
        </Tombol>
      </AksiModal>
    </Modal>
  );
}

// --- Hapus ---------------------------------------------------------------------------

function ModalHapus({ k, d, onTutup, onSelesai }: { k: Kontrak; d: Dokumen; onTutup: () => void; onSelesai: () => void }) {
  const { sesi } = useSesi();
  const [alasan, setAlasan] = useState("");
  const [menghapus, setMenghapus] = useState(false);
  const [galat, setGalat] = useState("");

  const hapus = async () => {
    if (alasan.trim().length < 5) return setGalat("Tuliskan alasannya, minimal 5 karakter. Alasan ini tercatat di riwayat.");
    setMenghapus(true);
    setGalat("");
    try {
      const h = await hapusDokumen(k, d.id, alasan, sesi);
      toast.success(`"${h.nama}" sudah dihapus`, { description: "Berkas dipindahkan ke Recycle Bin SharePoint." });
      if (!h.aktivitasTercatat) toast.warning("Penghapusan tidak tercatat di riwayat.");
      onSelesai();
      onTutup();
    } catch (err) {
      setGalat(pesanError(err));
      setMenghapus(false);
    }
  };

  return (
    <Modal judul="Hapus dokumen" onTutup={onTutup}>
      <div className="flex items-center gap-3 rounded-2xl bg-raised p-3">
        <IkonBerkas nama={d.nama} kecil />
        <div className="min-w-0">
          <p className="teks-panjang text-sm font-semibold">{d.nama}</p>
          <p className="text-xs text-muted">{d.jenis || "Jenis belum diisi"}</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">
        Berkas akan dipindahkan ke Recycle Bin SharePoint dan masih bisa dipulihkan pemilik site dalam 93 hari. Alasan Anda tercatat di riwayat kontrak.
      </p>
      <Isian label="Alasan penghapusan" wajib className="mt-4">
        <textarea className="input min-h-[90px]" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. salah unggah, berkas milik kontrak lain" autoFocus />
      </Isian>
      {galat && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {galat}
        </p>
      )}
      <AksiModal>
        <Tombol varian="kedua" onClick={onTutup} disabled={menghapus}>
          Batal
        </Tombol>
        <Tombol varian="bahaya" memuat={menghapus} ikon={<Trash2 className="h-4 w-4" />} onClick={() => void hapus()}>
          Hapus dokumen
        </Tombol>
      </AksiModal>
    </Modal>
  );
}

// --- Versi ---------------------------------------------------------------------------

function ModalVersi({ k, d, fokusUnggah, onTutup, onSelesai }: { k: Kontrak; d: Dokumen; fokusUnggah: boolean; onTutup: () => void; onSelesai: () => void }) {
  const { sesi } = useSesi();
  const versiQ = useMuat(() => ambilVersi(d.id, { folder: k.nomorPengajuan, nama: d.nama, webUrl: d.webUrl }), [d.id]);
  const bolehVersi = izinDokumen(k, d.jenis, "versi", sesi).boleh;
  const [persen, setPersen] = useState<number | null>(null);
  const [galat, setGalat] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listItemId = listItemDari(d);
  const eks = ekstensiDari(d.nama);

  useEffect(() => {
    if (fokusUnggah) inputRef.current?.focus();
  }, [fokusUnggah]);

  const unggah = async (file: File) => {
    setGalat("");
    const alasan = validasiBerkas(file.name, file.size);
    if (alasan) return setGalat(alasan);
    if (!sepadanEkstensi(d.nama, file.name)) return setGalat(`Versi baru harus berformat .${eks || "sama"} seperti berkas aslinya. Untuk format lain, unggah sebagai dokumen baru.`);
    setPersen(0);
    try {
      const h = await unggahVersiBaru(k, d.id, file, setPersen);
      const label = h.versi ? ` (${teksVersi(h.versi)})` : "";
      await catatAktivitas({ kontrakId: k.id, jenis: "Dokumen", pesan: `Mengunggah versi baru "${d.nama}"${label}${d.jenis ? `, ${d.jenis}` : ""}.` }, sesi).catch(() =>
        toast.warning("Versi baru tersimpan, tetapi tidak tercatat di riwayat."),
      );
      toast.success(`Versi baru "${d.nama}" tersimpan${label}`);
      onSelesai();
      void versiQ.muatUlang();
    } catch (err) {
      setGalat(pesanError(err));
    } finally {
      setPersen(null);
    }
  };

  return (
    <Modal judul="Versi dokumen" onTutup={onTutup} lebar="max-w-xl">
      <div className="flex items-center gap-3 rounded-2xl bg-raised p-3">
        <IkonBerkas nama={d.nama} kecil />
        <div className="min-w-0">
          <p className="teks-panjang text-sm font-semibold">{d.nama}</p>
          <p className="text-xs text-muted">{d.jenis || "Jenis belum diisi"}</p>
        </div>
      </div>

      {bolehVersi && (
        <div className="mt-4">
          <label className={cx("flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-line px-4 py-3.5 transition-colors focus-within:border-brand hover:border-brand hover:bg-raised", persen != null && "pointer-events-none opacity-70")}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
              <Upload className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{persen != null ? `Mengunggah… ${persen}%` : "Unggah versi baru"}</span>
              <span className="block text-xs text-muted">Pilih berkas .{eks || "sama"}. Nama berkas tetap, versi lama tersimpan di riwayat.</span>
            </span>
            <input
              ref={inputRef}
              type="file" aria-label="Pilih berkas untuk diunggah"
              accept={eks ? `.${eks}` : undefined}
              className="sr-only"
              disabled={persen != null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void unggah(f);
              }}
            />
          </label>
          {persen != null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={persen} aria-valuemin={0} aria-valuemax={100} aria-label="Kemajuan unggah versi">
              <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${persen}%` }} transition={{ duration: 0.2 }} />
            </div>
          )}
          {galat && (
            <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {galat}
            </p>
          )}
        </div>
      )}

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Riwayat versi</h3>
      {versiQ.loading && !versiQ.data ? (
        <Memuat teks="Memuat riwayat versi…" />
      ) : versiQ.error ? (
        <KotakError error={versiQ.error} ulangi={() => void versiQ.muatUlang()} />
      ) : !versiQ.data?.length ? (
        <p className="rounded-2xl bg-raised px-4 py-3 text-sm text-muted">Riwayat versi tidak tersedia untuk berkas ini.</p>
      ) : (
        <>
          <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {versiQ.data.map((v) => (
              <li key={v.label} className="flex items-center gap-3 px-4 py-2.5">
                <span className={cx("angka grid h-8 min-w-[2.5rem] shrink-0 place-items-center rounded-lg px-1.5 text-xs font-bold", v.terkini ? "bg-brand-soft text-brand-strong" : "bg-raised text-muted")}>{v.teks}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {v.oleh || "Tanpa nama"}
                    {v.terkini && <span className="ml-2 text-xs font-semibold text-success">terkini</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {formatWaktu(v.diubah)}
                    {v.ukuran != null && ` · ${teksUkuran(v.ukuran)}`}
                  </p>
                </div>
                {v.url && (
                  <a href={v.url} target="_blank" rel="noreferrer" className={KELAS_IKON} title={v.terkini ? "Buka versi terkini" : "Buka atau unduh versi ini"} aria-label={`Buka ${v.teks}`}>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                )}
              </li>
            ))}
          </ol>
          {versiQ.data.length === 1 && (
            <p className="mt-2 text-xs text-muted">Belum ada versi sebelumnya. Versi lama akan muncul di sini setelah berkas diperbarui (bila versioning library aktif).</p>
          )}
        </>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-2xl bg-info-soft px-4 py-3 text-xs text-info">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Untuk melihat perbedaan, unduh dua versi lalu bandingkan di Word (Tinjau, Bandingkan).
          {listItemId && (
            <>
              {" "}
              Pemulihan versi lama bisa lewat{" "}
              <a href={urlRiwayatVersiSharePoint(listItemId)} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
                riwayat versi SharePoint
              </a>
              .
            </>
          )}
        </p>
      </div>
    </Modal>
  );
}

// --- Paket arsip ZIP -----------------------------------------------------------------

/**
 * Tombol "Arsip ZIP" (U18) untuk Legal: semua dokumen kontrak + ringkasan.csv + riwayat.txt.
 * Bisa dipasang terpisah (mis. di hero detail); di panel ini sudah tampil otomatis untuk Legal.
 */
export function TombolArsip({ k, dokumen, kecil = true }: { k: Kontrak; dokumen: readonly Dokumen[]; kecil?: boolean }) {
  const { sesi } = useSesi();
  const [persen, setPersen] = useState<number | null>(null);
  const henti = useRef<AbortController | null>(null);

  useEffect(() => () => henti.current?.abort(), []);

  if (!adalahLegal(sesi)) return null;

  const buat = async () => {
    const lewat = periksaBatasArsip(dokumen);
    if (lewat) return void toast.error("Paket arsip terlalu besar", { description: lewat });
    henti.current = new AbortController();
    setPersen(0);
    try {
      const aktivitas = await ambilAktivitas(k.id).catch(() => {
        toast.warning("Riwayat belum bisa diambil", { description: "Paket tetap dibuat; riwayat.txt akan kosong." });
        return [];
      });
      const h = await buatPaketArsip(k, [...dokumen], aktivitas, (p) => setPersen(p.persen), { signal: henti.current.signal });
      simpanBlob(h.blob, h.namaBerkas);
      toast.success("Paket arsip siap diunduh", { description: h.namaBerkas });
      if (h.dilewati.length) toast.warning(`${h.dilewati.length} dokumen tidak ikut`, { description: h.dilewati.map((x) => `${x.nama}: ${x.alasan}`).join(" ") });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) toast.error("Paket arsip gagal dibuat", { description: pesanError(err) });
    } finally {
      setPersen(null);
      henti.current = null;
    }
  };

  return (
    <Tombol kecil={kecil} varian="hantu" memuat={persen != null} ikon={<Archive className="h-4 w-4" />} onClick={() => void buat()} title="Unduh semua dokumen, ringkasan, dan riwayat dalam satu ZIP">
      {persen != null ? `Mengemas ${persen}%` : "Arsip ZIP"}
    </Tombol>
  );
}
