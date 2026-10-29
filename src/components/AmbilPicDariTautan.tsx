// Tautan "Ambil sebagai PIC" (?aksi=ambil-pic, U23c) dari email pengajuan baru (dan kelak kartu Teams).
// Tidak pernah mengambil diam-diam: Legal/Admin selalu diminta konfirmasi. Tautan yang tidak berlaku (bukan Legal,
// kontrak final, PIC sudah terisi) diabaikan dengan pesan yang menjelaskan alasannya. Parameternya dihapus dari
// alamat begitu dibaca, jadi memuat ulang halaman tidak memicu konfirmasi lagi.
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useRuang } from "../context/RuangContext";
import { useSesi } from "../context/SesiContext";
import { cekAmbilPic } from "../lib/alur";
import { formatMasuk } from "../lib/format";
import { umpanBalik } from "../lib/umpanBalik";
import type { Kontrak } from "../lib/types";
import { GalatPenugasan, jalankanPenugasan } from "./TugaskanPic";
import { Modal, Tombol } from "./ui";

export default function AmbilPicDariTautan({ k, onBerubah }: { k: Kontrak; onBerubah: () => void | Promise<void> }) {
  const { sesi } = useSesi();
  const { ruang } = useRuang();
  const [params, setParams] = useSearchParams();
  const diminta = params.get("aksi") === "ambil-pic";
  const ditangani = useRef(false);
  const [buka, setBuka] = useState(false);
  const [proses, setProses] = useState(false);

  useEffect(() => {
    if (!diminta || ditangani.current) return;
    ditangani.current = true;
    setParams(
      (p) => {
        const baru = new URLSearchParams(p);
        baru.delete("aksi");
        return baru;
      },
      { replace: true },
    );
    const cek = cekAmbilPic(k, sesi, ruang === "admin");
    if (cek.boleh) setBuka(true);
    else umpanBalik.info("Tautan Ambil PIC tidak dijalankan", { teks: cek.pesan, durasi: 8000 });
  }, [diminta, k, sesi, ruang, setParams]);

  if (!buka) return null;

  const ambil = async () => {
    setProses(true);
    try {
      const h = await jalankanPenugasan(k, { email: sesi.email, nama: sesi.nama }, "", sesi);
      toast.success(`${k.nomorPengajuan} sekarang Anda pegang.`, { description: k.status === "Diajukan" ? "Tekan Mulai Review bila siap mereview." : undefined });
      if (!h.jejakTercatat) toast.warning("PIC tersimpan, tetapi jejaknya tidak tercatat di riwayat.");
      for (const p of h.peringatan) toast.warning(p, { duration: 10_000 });
      setBuka(false);
      await onBerubah();
    } catch (err) {
      // Konflik (PIC baru saja diisi rekan): pesan apa adanya lalu muat ulang data.
      if (err instanceof GalatPenugasan) {
        toast.error("PIC belum diambil", { description: err.message });
        setBuka(false);
        await onBerubah();
      } else {
        umpanBalik.gagal(err, "PIC belum diambil");
      }
    } finally {
      setProses(false);
    }
  };

  return (
    <Modal judul="Ambil sebagai PIC?" onTutup={() => setBuka(false)}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-raised p-3.5 text-sm">
          <p className="font-mono text-xs font-semibold text-muted">{k.nomorPengajuan}</p>
          <p className="mt-0.5 break-words font-semibold">{k.judul}</p>
          <p className="mt-1 text-xs text-muted">
            {k.pengajuNama} · masuk {formatMasuk(k.tanggalDiajukan ?? k.dibuat)}
          </p>
        </div>
        <p className="text-sm text-muted">
          Anda akan tercatat sebagai PIC Legal untuk kontrak ini. Statusnya tetap <strong className="text-ink">{k.status}</strong>; rekan Legal lain melihat bahwa kontrak ini sudah Anda pegang.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Tombol varian="kedua" onClick={() => setBuka(false)} disabled={proses}>
            Batal
          </Tombol>
          <Tombol memuat={proses} ikon={<UserCheck className="h-4 w-4" />} onClick={() => void ambil()}>
            Ambil sebagai PIC
          </Tombol>
        </div>
      </div>
    </Modal>
  );
}
