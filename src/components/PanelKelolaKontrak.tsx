// Panel "Kelola kontrak" di halaman detail (Ruang Admin): arsipkan atau pulihkan kontrak (Admin dan Legal) dan
// hapus permanen (hanya Admin). Aturan dan efeknya ada di services/kelolaKontrak.ts.
import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { pesanError } from "../lib/graph";
import { umpanBalik } from "../lib/umpanBalik";
import { STATUS_PROSES, type Kontrak } from "../lib/types";
import { arsipkanKontrak, BATAS_ALASAN_ARSIP, BATAS_ALASAN_HAPUS, bolehArsipkan, bolehHapusPermanen, hapusKontrakPermanen, hitungDampakHapus, pulihkanDariArsip, type DampakHapus } from "../services/kelolaKontrak";
import { AksiModal, Isian, Modal, Tombol, cx } from "./ui";

interface Props {
  k: Kontrak;
  /** Dipanggil setelah kontrak diarsipkan atau dipulihkan (muat ulang halaman). */
  onBerubah: () => void | Promise<void>;
  /** Dipanggil setelah kontrak dihapus permanen (halamannya sudah tidak ada). */
  onTerhapus: () => void;
}

export default function PanelKelolaKontrak({ k, onBerubah, onTerhapus }: Props) {
  const { sesi } = useSesi();
  const [dialog, setDialog] = useState<"arsip" | "hapus" | null>(null);
  const [memulihkan, setMemulihkan] = useState(false);
  if (!bolehArsipkan(sesi)) return null;

  const pulihkan = async () => {
    setMemulihkan(true);
    try {
      await pulihkanDariArsip(k, sesi);
      umpanBalik.berhasil("Kontrak dipulihkan dari arsip.", { teks: "Kontrak kembali tampil di daftar dan dashboard." });
      await onBerubah();
    } catch (err) {
      umpanBalik.gagal(err, "Belum bisa memulihkan kontrak");
    } finally {
      setMemulihkan(false);
    }
  };

  return (
    <section className="kartu p-5 sm:p-6" aria-label="Kelola kontrak">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Archive className="h-5 w-5 text-muted" aria-hidden="true" /> Kelola kontrak
      </h2>
      <p className="mt-1 text-sm text-muted">
        {k.diarsipkan
          ? "Kontrak ini ada di arsip: tidak tampil di daftar, dashboard, antrean, dan laporan, tetapi datanya tetap tersimpan lengkap."
          : "Arsip menyembunyikan kontrak dari daftar kerja tanpa menghapus apa pun. Hapus permanen hanya untuk data yang memang tidak boleh tersimpan, misalnya data uji."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {k.diarsipkan ? (
          <Tombol varian="kedua" ikon={memulihkan ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />} onClick={() => void pulihkan()} disabled={memulihkan}>
            Pulihkan dari arsip
          </Tombol>
        ) : (
          <Tombol varian="kedua" ikon={<Archive className="h-4 w-4" />} onClick={() => setDialog("arsip")}>
            Arsipkan kontrak
          </Tombol>
        )}
        {bolehHapusPermanen(sesi) && (
          <Tombol varian="bahaya" ikon={<Trash2 className="h-4 w-4" />} onClick={() => setDialog("hapus")}>
            Hapus permanen
          </Tombol>
        )}
      </div>

      {dialog === "arsip" && <DialogArsip k={k} onTutup={() => setDialog(null)} onSelesai={onBerubah} />}
      {dialog === "hapus" && <DialogHapus k={k} onTutup={() => setDialog(null)} onTerhapus={onTerhapus} />}
    </section>
  );
}

function DialogArsip({ k, onTutup, onSelesai }: { k: Kontrak; onTutup: () => void; onSelesai: () => void | Promise<void> }) {
  const { sesi } = useSesi();
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");
  const masihProses = (STATUS_PROSES as readonly string[]).includes(k.status);
  const cukup = alasan.trim().length >= BATAS_ALASAN_ARSIP;

  const kirim = async () => {
    setSibuk(true);
    setGalat("");
    try {
      await arsipkanKontrak(k, alasan, sesi);
      umpanBalik.berhasil("Kontrak diarsipkan.", { teks: "Ia bisa dilihat dan dipulihkan dari halaman Arsip." });
      onTutup();
      await onSelesai();
    } catch (err) {
      setGalat(pesanError(err));
      setSibuk(false);
    }
  };

  return (
    <Modal judul="Arsipkan kontrak" onTutup={onTutup}>
      <p className="text-sm">
        <span className="font-semibold">{k.nomorPengajuan}</span> · {k.judul}
      </p>
      <p className="mt-2 text-sm text-muted">Kontrak keluar dari daftar, dashboard, antrean, dan laporan. Dokumen dan riwayatnya tetap tersimpan, dan bisa dipulihkan kapan saja.</p>
      {masihProses && (
        <p role="note" className="mt-3 flex gap-2 rounded-xl bg-accent-soft p-3 text-sm text-accent-ink">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Kontrak ini masih berstatus {k.status}. Setelah diarsipkan, ia tidak lagi muncul di antrean Legal dan pengaju tidak melihatnya di Monitoring.
        </p>
      )}
      <Isian label="Alasan diarsipkan" wajib bantuan={`Minimal ${BATAS_ALASAN_ARSIP} karakter. Dicatat di riwayat kontrak.`} className="mt-4">
        <textarea className="input min-h-[84px]" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. kontrak sudah selesai dan tidak perlu dipantau lagi." data-fokus-awal />
      </Isian>
      {galat && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
          {galat}
        </p>
      )}
      <AksiModal>
        <Tombol varian="hantu" onClick={onTutup} disabled={sibuk}>
          Batal
        </Tombol>
        <Tombol onClick={() => void kirim()} memuat={sibuk} disabled={!cukup}>
          Arsipkan
        </Tombol>
      </AksiModal>
    </Modal>
  );
}

function DialogHapus({ k, onTutup, onTerhapus }: { k: Kontrak; onTutup: () => void; onTerhapus: () => void }) {
  const { sesi } = useSesi();
  const [dampak, setDampak] = useState<DampakHapus | null>(null);
  const [galatDampak, setGalatDampak] = useState("");
  const [alasan, setAlasan] = useState("");
  const [nomor, setNomor] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [progres, setProgres] = useState<{ selesai: number; total: number; langkah: string } | null>(null);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    let batal = false;
    hitungDampakHapus(k).then(
      (d) => !batal && setDampak(d),
      (err) => !batal && setGalatDampak(pesanError(err)),
    );
    return () => {
      batal = true;
    };
  }, [k]);

  const terblokir = (dampak?.bergantung.length ?? 0) > 0;
  const siap = !!dampak && !terblokir && alasan.trim().length >= BATAS_ALASAN_HAPUS && nomor.trim() === k.nomorPengajuan;
  const totalBaris = dampak?.baris.reduce((a, b) => a + b.jumlah, 0) ?? 0;

  const hapus = async () => {
    setSibuk(true);
    setGalat("");
    try {
      await hapusKontrakPermanen(k, alasan, nomor, sesi, (selesai, total, langkah) => setProgres({ selesai, total, langkah }));
      umpanBalik.berhasil("Kontrak dihapus permanen.", { teks: "Datanya ada di Recycle Bin SharePoint selama 93 hari. Jejaknya tercatat di Log Admin." });
      onTutup();
      onTerhapus();
    } catch (err) {
      setGalat(pesanError(err));
      setSibuk(false);
      setProgres(null);
    }
  };

  return (
    <Modal judul="Hapus kontrak secara permanen" onTutup={sibuk ? () => undefined : onTutup}>
      <p className="text-sm">
        <span className="font-semibold">{k.nomorPengajuan}</span> · {k.judul}
      </p>
      <p role="note" className="mt-3 flex gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Tindakan ini tidak bisa dibatalkan dari aplikasi. Bila kontrak hanya perlu disembunyikan, pakai Arsipkan.
      </p>

      <div className="mt-4 rounded-xl border border-line bg-raised p-3 text-sm" aria-live="polite">
        <p className="font-semibold">Yang akan ikut terhapus</p>
        {!dampak && !galatDampak && (
          <p className="mt-1 flex items-center gap-2 text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Menghitung…
          </p>
        )}
        {galatDampak && <p className="mt-1 text-danger">{galatDampak}</p>}
        {dampak && (
          <ul className="mt-1 list-disc pl-5 text-muted">
            <li>Data kontrak itu sendiri</li>
            <li>{dampak.dokumen} berkas di folder dokumen</li>
            {dampak.baris.map((b) => (
              <li key={b.kunci} className={cx(b.jumlah === 0 && "opacity-60")}>
                {b.jumlah} {b.label}
              </li>
            ))}
          </ul>
        )}
        {dampak && <p className="mt-2 text-xs text-muted">Antrean email yang sudah dikirim ke list Notifikasi tidak ikut dihapus (catatan kirim). Total {totalBaris} baris terkait.</p>}
      </div>

      {terblokir && dampak && (
        <p role="alert" className="mt-3 rounded-xl bg-accent-soft p-3 text-sm text-accent-ink">
          Kontrak ini punya addendum atau kontrak turunan: {dampak.bergantung.map((x) => `${x.nomorPengajuan}`).join(", ")}. Hapus atau arsipkan itu lebih dulu.
        </p>
      )}

      <Isian label="Alasan penghapusan" wajib bantuan={`Minimal ${BATAS_ALASAN_HAPUS} karakter. Dicatat di Log Admin.`} className="mt-4">
        <textarea className="input min-h-[72px]" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Mis. data uji coba sistem, bukan kontrak sebenarnya." disabled={sibuk || terblokir} />
      </Isian>
      <Isian label={`Ketik ${k.nomorPengajuan} untuk mengonfirmasi`} wajib className="mt-3">
        <input className="input angka" value={nomor} onChange={(e) => setNomor(e.target.value)} placeholder={k.nomorPengajuan} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={sibuk || terblokir} />
      </Isian>

      {progres && (
        <div className="mt-4" role="status" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-danger transition-[width] duration-200" style={{ width: `${Math.round((progres.selesai / Math.max(1, progres.total)) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {progres.langkah} ({progres.selesai}/{progres.total})
          </p>
        </div>
      )}
      {galat && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
          {galat}
        </p>
      )}

      <AksiModal>
        <Tombol varian="hantu" onClick={onTutup} disabled={sibuk}>
          Batal
        </Tombol>
        <Tombol varian="bahaya" ikon={<Trash2 className="h-4 w-4" />} onClick={() => void hapus()} memuat={sibuk} disabled={!siap}>
          Hapus permanen
        </Tombol>
      </AksiModal>
    </Modal>
  );
}
