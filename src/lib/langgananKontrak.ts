// Langganan pada pengosongan cache daftar kontrak (services/kontrak.ts: kosongkanCacheKontrak).
// Setiap aksi tulis di tab ini mengosongkan cache; pendengar (PantauProvider: lonceng dan judul tab)
// lalu memuat ulang daftar sesudah jeda singkat, sehingga angka lonceng ikut berubah setelah aksi.
//
// Pemasangan: kosongkanCacheKontrak() memanggil kabarkanCacheKontrakKosong().
// Penyegaran milik pendengar sendiri dibungkus tanpaKabar() supaya tidak memicu dirinya berulang-ulang.

type Pendengar = () => void;

const pendengar = new Set<Pendengar>();
let diam = 0;

/** Dengarkan pengosongan cache kontrak. Kembalian: fungsi berhenti mendengar. */
export function dengarCacheKontrak(fn: Pendengar): () => void {
  pendengar.add(fn);
  return () => void pendengar.delete(fn);
}

/** Dipanggil dari kosongkanCacheKontrak(). */
export function kabarkanCacheKontrakKosong() {
  if (diam > 0) return;
  for (const fn of [...pendengar]) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }
}

/** Jalankan `fn` tanpa mengabari pendengar (untuk penyegaran oleh pendengar itu sendiri). */
export function tanpaKabar<T>(fn: () => T): T {
  diam++;
  try {
    return fn();
  } finally {
    diam--;
  }
}

/**
 * Pendengar dengan jeda: beberapa pengosongan beruntun (sebelum dan sesudah sebuah aksi tulis)
 * digabung jadi satu panggilan, dan dipanggil setelah tulisannya kemungkinan besar selesai.
 */
export function dengarCacheKontrakTertunda(fn: Pendengar, jedaMs = 2000): () => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  const lepas = dengarCacheKontrak(() => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn();
    }, jedaMs);
  });
  return () => {
    if (t) clearTimeout(t);
    lepas();
  };
}
