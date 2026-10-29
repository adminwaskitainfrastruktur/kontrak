import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Muat data async dengan status loading/error dan fungsi muat ulang.
 * Hasil permintaan lama diabaikan bila `deps` berubah di tengah jalan.
 */
export function useMuat<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const urutan = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const muat = useCallback(fn, deps);

  const muatUlang = useCallback(async () => {
    const ke = ++urutan.current;
    setLoading(true);
    setError(null);
    try {
      const hasil = await muat();
      if (ke === urutan.current) setData(hasil);
    } catch (err) {
      if (ke === urutan.current) setError(err);
    } finally {
      if (ke === urutan.current) setLoading(false);
    }
  }, [muat]);

  useEffect(() => {
    void muatUlang();
  }, [muatUlang]);

  return { data, error, loading, muatUlang, setData };
}
