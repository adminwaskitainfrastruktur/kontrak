// Peringatan peramban saat tab hendak ditutup atau dimuat ulang selagi pekerjaan penting berjalan (U23a): mis.
// pengajuan sudah tersimpan tetapi dokumen masih diunggah dan email ke Legal belum diantrikan. Peramban hanya
// menampilkan pesan bawaannya sendiri; teks kustom tidak lagi didukung.
import { useEffect } from "react";

export function useCegahTutup(aktif: boolean): void {
  useEffect(() => {
    if (!aktif) return;
    const tahan = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Peramban lama (Chrome < 119) memerlukan returnValue terisi.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", tahan);
    return () => window.removeEventListener("beforeunload", tahan);
  }, [aktif]);
}
