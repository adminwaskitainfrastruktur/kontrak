// Pita global di atas layar (U38):
// - "Sesi berakhir": muncul saat graph() memancarkan kabar perlu login. Tombol Masuk ulang membuka
//   popup Microsoft dari klik (cadangan loginRedirect), lalu halaman aktif memuat ulang datanya lewat
//   kabar "sesi pulih". Isian yang sedang diketik tidak hilang karena halaman tidak dimuat ulang.
// - "Luring": mengikuti navigator.onLine, supaya kegagalan simpan tidak membingungkan.
// Wadahnya bertanda data-lepas-jebakan: tombolnya tetap bisa dicapai Tab walau modal sedang terbuka.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, WifiOff } from "lucide-react";
import { masukUlang } from "../auth/masukUlang";
import { pegasLembut } from "../lib/gerak";
import { dengarPerluLogin, dengarSesiPulih, sesiSedangBerakhir } from "../lib/pemancarSesi";
import { umpanBalik } from "../lib/umpanBalik";
import { Tombol } from "./ui";

function useDaring(): boolean {
  const [daring, setDaring] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const naik = () => setDaring(true);
    const turun = () => setDaring(false);
    window.addEventListener("online", naik);
    window.addEventListener("offline", turun);
    return () => {
      window.removeEventListener("online", naik);
      window.removeEventListener("offline", turun);
    };
  }, []);
  return daring;
}

export default function PitaSesi() {
  const [berakhir, setBerakhir] = useState(sesiSedangBerakhir);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState("");
  const daring = useDaring();

  useEffect(() => {
    const lepasA = dengarPerluLogin(() => {
      setBerakhir(true);
      setGalat("");
    });
    const lepasB = dengarSesiPulih(() => setBerakhir(false));
    return () => {
      lepasA();
      lepasB();
    };
  }, []);

  const masuk = async () => {
    setMemuat(true);
    setGalat("");
    const hasil = await masukUlang();
    setMemuat(false);
    if (hasil === "berhasil") umpanBalik.berhasil("Sesi diperbarui", { teks: "Data di halaman ini dimuat ulang." });
    else if (hasil === "dibatalkan") setGalat("Jendela masuk ditutup sebelum selesai. Coba lagi bila sudah siap.");
    else if (hasil === "gagal") setGalat("Belum berhasil masuk. Izinkan popup untuk situs ini, lalu coba lagi.");
  };

  return (
    <div data-lepas-jebakan className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[80] flex flex-col items-center gap-2 px-3">
      <AnimatePresence>
        {berakhir && (
          <motion.div key="sesi" role="alert" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }} transition={pegasLembut} className="pointer-events-auto flex w-full max-w-xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-accent bg-accent-soft px-4 py-3 text-sm text-accent-ink shadow-pop">
            <KeyRound className="h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1 basis-48">
              <p className="font-bold">Sesi berakhir</p>
              <p className="text-xs opacity-90">Masuk ulang untuk melanjutkan. Isian yang belum disimpan tetap aman di halaman ini.</p>
              {galat && <p className="mt-1 text-xs font-semibold">{galat}</p>}
            </div>
            <Tombol kecil memuat={memuat} onClick={() => void masuk()} className="ml-auto max-[420px]:w-full">
              Masuk ulang
            </Tombol>
          </motion.div>
        )}
        {!daring && (
          <motion.div key="luring" role="status" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }} transition={pegasLembut} className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-line bg-navy px-4 py-3 text-sm text-white shadow-pop">
            <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-xs sm:text-sm">
              <span className="font-bold">Anda sedang luring.</span> <span className="opacity-90">Perubahan belum bisa disimpan sampai koneksi pulih; data yang tampil mungkin belum yang terbaru.</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
