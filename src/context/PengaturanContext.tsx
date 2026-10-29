// Menyediakan Pengaturan ke seluruh aplikasi. Tidak pernah memblokir: selama memuat, atau bila list
// Pengaturan gagal dibaca, nilai bawaan di kode yang dipakai.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { pasangPengaturanAktif, pengaturanBawaan, type KunciPengaturan, type Pengaturan } from "../lib/pengaturan";
import { ambilPengaturanRinci, kosongkanCachePengaturan } from "../services/pengaturan";

interface NilaiPengaturan {
  pengaturan: Pengaturan;
  /** true setelah percobaan pertama selesai (berhasil atau gagal). */
  siap: boolean;
  /** Galat terakhir saat memuat; pengaturan tetap terisi bawaan. */
  galat: unknown;
  tersimpan: KunciPengaturan[];
  rusak: { kunci: KunciPengaturan; galat: string }[];
  /** Muat ulang dari SharePoint (melewati cache). */
  muatUlang: () => Promise<void>;
}

const BAWAAN: NilaiPengaturan = {
  pengaturan: pengaturanBawaan(),
  siap: false,
  galat: null,
  tersimpan: [],
  rusak: [],
  muatUlang: async () => {},
};

const PengaturanContext = createContext<NilaiPengaturan>(BAWAAN);

/** Di luar provider pun aman: mengembalikan nilai bawaan. */
export function usePengaturan(): NilaiPengaturan {
  return useContext(PengaturanContext);
}

export function PengaturanProvider({ children }: { children: ReactNode }) {
  const [keadaan, setKeadaan] = useState<Omit<NilaiPengaturan, "muatUlang">>(BAWAAN);
  const urutan = useRef(0);

  const muat = useCallback(async (paksa: boolean) => {
    const ke = ++urutan.current;
    if (paksa) kosongkanCachePengaturan();
    try {
      const h = await ambilPengaturanRinci();
      if (ke !== urutan.current) return;
      pasangPengaturanAktif(h.pengaturan);
      setKeadaan({ pengaturan: h.pengaturan, siap: true, galat: null, tersimpan: h.tersimpan, rusak: h.rusak });
    } catch (err) {
      if (ke !== urutan.current) return;
      // Nilai terakhir yang berhasil dimuat tetap dipakai; sebelum pernah berhasil, bawaan.
      setKeadaan((lama) => ({ ...lama, siap: true, galat: err }));
    }
  }, []);

  useEffect(() => {
    void muat(false);
  }, [muat]);

  const muatUlang = useCallback(() => muat(true), [muat]);
  const nilai = useMemo(() => ({ ...keadaan, muatUlang }), [keadaan, muatUlang]);
  return <PengaturanContext.Provider value={nilai}>{children}</PengaturanContext.Provider>;
}
