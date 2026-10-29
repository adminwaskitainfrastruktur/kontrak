// Pita ramah "Peramban Anda terlalu lama" di puncak halaman (di atas layar masuk maupun aplikasi).
// Tidak memblokir apa pun: pengguna bisa menutupnya, dan pilihannya diingat selama tab terbuka.
// Logika pemeriksaan ada di lib/peramban.ts. Untuk peramban yang bahkan tidak bisa memuat aplikasi,
// public/peramban.js menampilkan pesan serupa dari luar React.
import { useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { pesanPeramban, periksaPeramban } from "../lib/peramban";

const KUNCI_ABAI = "kontrak-peramban-abai";

function sudahDiabaikan(): boolean {
  try {
    return sessionStorage.getItem(KUNCI_ABAI) === "1";
  } catch {
    return false;
  }
}

export default function PeringatanPeramban() {
  const pesan = useMemo(() => pesanPeramban(periksaPeramban()), []);
  const [abai, setAbai] = useState(sudahDiabaikan);
  if (!pesan || abai) return null;

  const tutup = () => {
    setAbai(true);
    try {
      sessionStorage.setItem(KUNCI_ABAI, "1");
    } catch {
      /* penyimpanan diblokir: pita hanya tertutup untuk tampilan ini */
    }
  };

  return (
    <div role="status" className="relative z-[90] flex items-start gap-3 border-b border-accent bg-accent-soft px-4 py-3 text-sm text-accent-ink">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="teks-panjang min-w-0 flex-1">
        <p className="font-bold">{pesan.judul}</p>
        <p className="mt-0.5">{pesan.teks}</p>
        {pesan.rincian && <p className="mt-1 text-xs opacity-80">{pesan.rincian}</p>}
      </div>
      <button type="button" onClick={tutup} className="-my-1.5 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors hover:bg-raised" aria-label="Tutup peringatan peramban">
        <span className="hidden sm:inline">Mengerti</span>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
