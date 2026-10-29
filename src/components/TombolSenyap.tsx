// Tombol bisukan/bunyikan notifikasi satu kontrak (halaman detail, kedua ruang) dan lencana kecil untuk daftar.
// Penyimpanan dan cakupannya dijelaskan di services/senyap.ts.
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useSenyap } from "../hooks/useSenyap";
import { umpanBalik } from "../lib/umpanBalik";
import type { Kontrak } from "../lib/types";
import { Tombol, cx } from "./ui";

export default function TombolSenyap({ k, className }: { k: Pick<Kontrak, "id" | "nomorPengajuan">; className?: string }) {
  const { sesi } = useSesi();
  const senyap = useSenyap(sesi.email);
  const diam = senyap.dibisukan(k.id);
  const sibuk = senyap.sedangUbah(k.id);

  const balik = async () => {
    try {
      const sekarangDiam = await senyap.balik(k.id);
      if (sekarangDiam) umpanBalik.berhasil("Notifikasi kontrak ini dibisukan.", { teks: `Email dan kabar tentang ${k.nomorPengajuan} tidak akan sampai ke Anda. Status tetap terlihat di aplikasi.` });
      else umpanBalik.berhasil("Notifikasi kontrak ini diaktifkan lagi.");
    } catch (err) {
      umpanBalik.gagal(err, "Belum bisa mengubah pengaturan notifikasi");
    }
  };

  return (
    <Tombol
      kecil
      varian="kedua"
      className={className}
      ikon={sibuk ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : diam ? <BellOff className="h-4 w-4" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}
      onClick={() => void balik()}
      disabled={sibuk || !senyap.siap}
      aria-pressed={diam}
      title={diam ? "Notifikasi kontrak ini dibisukan. Ketuk untuk mengaktifkan lagi." : "Bisukan email dan kabar tentang kontrak ini"}
    >
      {diam ? "Dibisukan" : "Bisukan"}
    </Tombol>
  );
}

/** Ikon kecil di daftar untuk kontrak yang dibisukan; tidak menampilkan apa pun bila tidak. */
export function LencanaSenyap({ id, className }: { id: number; className?: string }) {
  const { sesi } = useSesi();
  const { dibisukan } = useSenyap(sesi.email);
  if (!dibisukan(id)) return null;
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-[11px] font-semibold text-muted", className)} title="Notifikasi kontrak ini dibisukan">
      <BellOff className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">Notifikasi dibisukan</span>
      Senyap
    </span>
  );
}
