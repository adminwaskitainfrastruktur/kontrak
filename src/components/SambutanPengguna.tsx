// Sambutan singkat untuk pengguna baru di Ruang Pengguna: tiga langkah (ajukan, pantau antrean, tanggapi revisi).
// Karena semua karyawan WKI kini bisa masuk sebagai Pengaju, halaman pertama tidak boleh membingungkan.
// Bisa ditutup, dan penutupannya diingat per akun di peramban ini (localStorage, bukan data penting:
// bila penyimpanan diblokir, sambutan sekadar tampil lagi).
import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Activity, MessageCircleReply, MessageSquarePlus, X } from "lucide-react";
import { pegasLembut } from "../lib/gerak";
import { Tombol } from "./ui";

const AWALAN_KUNCI = "kontrak-wki:sambutan-pengguna:v1:";

const kunciSambutan = (email: string) => `${AWALAN_KUNCI}${email.trim().toLowerCase()}`;

function sudahDitutup(email: string): boolean {
  try {
    return localStorage.getItem(kunciSambutan(email)) === "1";
  } catch {
    return false;
  }
}

function ingatDitutup(email: string) {
  try {
    localStorage.setItem(kunciSambutan(email), "1");
  } catch {
    // Penyimpanan lokal hanya kenyamanan; tanpa itu sambutan tampil lagi pada kunjungan berikutnya.
  }
}

/** Status sambutan untuk satu akun: `tampil` selama belum pernah ditutup di peramban ini. */
export function useSambutanPengguna(email: string): { tampil: boolean; tutup: () => void } {
  const [tampil, setTampil] = useState(() => !sudahDitutup(email));
  const tutup = useCallback(() => {
    ingatDitutup(email);
    setTampil(false);
  }, [email]);
  return { tampil, tutup };
}

const LANGKAH = [
  { ikon: MessageSquarePlus, judul: "Ajukan", teks: "Ceritakan kontraknya lewat chat atau formulir, lalu lampirkan draf dan dokumen pendukung." },
  { ikon: Activity, judul: "Pantau antrean", teks: "Lihat urutan pengajuan Anda di antrean Legal dan kabar terbarunya langsung di halaman ini." },
  { ikon: MessageCircleReply, judul: "Tanggapi revisi", teks: "Bila Legal meminta perbaikan, kartu kuning muncul di sini. Rapikan, lalu kirim ulang dari kartu itu." },
] as const;

export default function SambutanPengguna({ nama, onTutup }: { nama: string; onTutup: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={pegasLembut}
      aria-labelledby="judul-sambutan"
      className="kartu relative p-5 pr-14 sm:p-6 sm:pr-16"
    >
      <button
        type="button"
        onClick={onTutup}
        aria-label="Tutup sambutan"
        className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-ink sm:right-3 sm:top-3"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      <h2 id="judul-sambutan" className="teks-panjang text-lg font-bold">
        Selamat datang{nama ? `, ${nama}` : ""}
      </h2>
      <p className="mt-0.5 text-sm text-muted">Di sini Anda mengajukan kontrak ke Legal dan memantau perkembangannya. Cukup tiga langkah.</p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {LANGKAH.map(({ ikon: Ikon, judul, teks }, i) => (
          <li key={judul} className="flex min-w-0 gap-3 rounded-2xl bg-raised p-3.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
              <Ikon className="h-4 w-4" />
            </span>
            <span className="min-w-0 text-sm">
              <span className="block font-semibold">
                <span className="angka text-muted">{i + 1}.</span> {judul}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{teks}</span>
            </span>
          </li>
        ))}
      </ol>
      {/* Satu tombol saja: tindakan utama halaman ini ada di hero ("Ajukan kontrak"). */}
      <div className="mt-4">
        <Tombol varian="kedua" onClick={onTutup}>
          Mengerti, tutup
        </Tombol>
      </div>
    </motion.section>
  );
}
