// Galat saat mengirim pengajuan (chat dan formulir), U08. Galat sesi Microsoft menawarkan "Masuk ulang"
// di tempat (auth/masukUlang: popup dari klik, cadangan loginRedirect), jadi jawaban dan isian tidak hilang.
// Setelah sesi pulih, dari tombol ini atau dari pita sesi di atas layar, kotak berganti menjadi ajakan
// untuk menekan tombol kirim lagi. Pengiriman tidak diulang otomatis supaya tidak terjadi pengajuan ganda.
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, KeyRound, WifiOff } from "lucide-react";
import { masukUlang } from "../auth/masukUlang";
import { GraphError, pesanError } from "../lib/graph";
import { pegasLembut } from "../lib/gerak";
import { useSaatSesiPulih } from "../lib/pemancarSesi";
import { Tombol, cx } from "./ui";

export default function GalatKirim({ galat, teksKirim, awalan, className }: { galat: unknown; /** Nama tombol kirim, mis. "Ajukan ke Legal". */ teksKirim: string; /** Kalimat pembuka sebelum pesan teknis. */ awalan?: string; className?: string }) {
  const perluLogin = galat instanceof GraphError && galat.perluLogin;
  const jaringan = galat instanceof GraphError && galat.jaringan;
  const [memuat, setMemuat] = useState(false);
  const [pulih, setPulih] = useState(false);
  const [catatan, setCatatan] = useState("");
  // Masuk ulang lewat pita sesi juga dihitung.
  useSaatSesiPulih(perluLogin ? () => setPulih(true) : null);
  // Galat baru: mulai lagi dari keadaan awal.
  useEffect(() => {
    setPulih(false);
    setCatatan("");
  }, [galat]);

  if (!galat) return null;

  const masuk = async () => {
    setMemuat(true);
    setCatatan("");
    const hasil = await masukUlang();
    setMemuat(false);
    if (hasil === "berhasil") setPulih(true);
    else if (hasil === "dibatalkan") setCatatan("Jendela masuk ditutup sebelum selesai. Coba lagi bila sudah siap.");
    else if (hasil === "gagal") setCatatan("Belum berhasil masuk. Izinkan popup untuk situs ini, lalu coba lagi.");
  };

  if (perluLogin && pulih) {
    return (
      <motion.div role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={pegasLembut} className={cx("flex items-start gap-3 rounded-2xl bg-success-soft px-4 py-3 text-sm text-success", className)}>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0">
          <span className="font-semibold">Sesi sudah diperbarui.</span> Isian Anda masih utuh. Tekan “{teksKirim}” untuk mengirim lagi.
        </p>
      </motion.div>
    );
  }

  const Ikon = perluLogin ? KeyRound : jaringan ? WifiOff : AlertTriangle;
  return (
    <motion.div role="alert" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={pegasLembut} className={cx("flex items-start gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger", className)}>
      <Ikon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {perluLogin ? (
          <>
            <p className="font-semibold">Sesi Microsoft Anda berakhir, jadi pengajuan belum terkirim.</p>
            <p className="mt-0.5 opacity-90">Isian Anda tetap aman di halaman ini. Masuk ulang, lalu tekan “{teksKirim}” lagi.</p>
          </>
        ) : (
          <>
            <p className="font-semibold">{awalan ?? "Pengajuan belum berhasil dikirim."}</p>
            <p className="mt-0.5 break-words text-xs opacity-90">{pesanError(galat)}</p>
          </>
        )}
        {catatan && <p className="mt-1 text-xs font-semibold">{catatan}</p>}
        {perluLogin && (
          <Tombol kecil memuat={memuat} className="mt-2.5" ikon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => void masuk()}>
            Masuk ulang
          </Tombol>
        )}
      </div>
    </motion.div>
  );
}
