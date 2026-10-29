import { useCallback, useEffect, useSyncExternalStore } from "react";
import { ambilSemuaKontrak, cuplikanKontrak, langgananKontrak, segarkanKontrak } from "../services/kontrak";

/**
 * Daftar kontrak dari cache bersama (U39). Semua halaman yang memakai hook ini melihat data yang sama dan ikut
 * diperbarui bila data baru tiba dari mana pun (halaman lain, aksi, atau tab yang kembali aktif).
 * Bentuk hasilnya sama dengan useMuat supaya mudah dipakai menggantikan useMuat(ambilSemuaKontrak).
 *
 *   data     : null sampai pemuatan pertama berhasil; setelah itu data terakhir tetap ada selama memuat ulang.
 *   error    : galat pemuatan terakhir. Tampilkan layar galat hanya bila `data` masih null.
 *   loading  : sedang memuat, atau belum pernah dimuat sama sekali.
 *   waktu    : kapan data terakhir berhasil dimuat (ms).
 *   muatUlang: paksa ambil data terbaru, melewati cache.
 */
export function useDaftarKontrak() {
  const k = useSyncExternalStore(langgananKontrak, cuplikanKontrak);

  // Saat dipasang: pakai cache yang masih segar, atau muat (data lama tetap tampil selama memuat).
  useEffect(() => {
    void ambilSemuaKontrak().catch(() => undefined);
  }, []);

  const muatUlang = useCallback(async () => {
    await segarkanKontrak().catch(() => undefined);
  }, []);

  return { data: k.data, error: k.error, loading: k.memuat || (!k.data && !k.error), waktu: k.waktu, muatUlang };
}
