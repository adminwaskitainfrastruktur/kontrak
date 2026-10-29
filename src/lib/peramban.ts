// Pemeriksaan kemampuan peramban untuk peringatan ramah "Peramban Anda terlalu lama".
// Logika murni (tanpa React dan DOM) supaya bisa diuji: lingkungan peramban dilewatkan sebagai argumen.
//
// Dua tingkat, dan keduanya tidak memblokir aplikasi:
//   - fiturHilang: fitur JavaScript yang dipakai aplikasi tidak ada, sebagian halaman mungkin tidak berjalan.
//   - tanpaColorMix: hanya warna campuran (color-mix) yang tidak didukung; semua fitur tetap jalan, tampilan
//     sebagian elemen lebih polos (cadangan warna padat sudah disiapkan di styles.css).

/** Fitur JS yang dipakai aplikasi (atau pustakanya) dan tidak punya cadangan. `jalur` memakai titik, mis. "Intl.RelativeTimeFormat". */
export const FITUR_PENTING: { jalur: string; nama: string }[] = [
  { jalur: "fetch", nama: "pengambilan data (fetch)" },
  { jalur: "Promise.allSettled", nama: "Promise.allSettled" },
  { jalur: "ResizeObserver", nama: "ResizeObserver (grafik)" },
  { jalur: "Intl.RelativeTimeFormat", nama: "format waktu relatif" },
  { jalur: "matchMedia", nama: "matchMedia" },
  { jalur: "crypto.subtle", nama: "kripto web (sidik dokumen)" },
];

export interface HasilPeriksaPeramban {
  /** Nama fitur JS penting yang tidak ada. */
  fiturHilang: string[];
  /** color-mix() tidak didukung (Safari < 16.2, Chrome < 111, Firefox < 113). */
  tanpaColorMix: boolean;
  /** true bila ada yang perlu diberitahukan ke pengguna. */
  perluPeringatan: boolean;
}

function ambilJalur(akar: unknown, jalur: string): unknown {
  let kini: unknown = akar;
  for (const bagian of jalur.split(".")) {
    if (kini == null) return undefined;
    try {
      kini = (kini as Record<string, unknown>)[bagian];
    } catch {
      return undefined;
    }
  }
  return kini;
}

/** Periksa lingkungan `g` (bawaan: globalThis). Aman dipanggil di Node dan di peramban. */
export function periksaPeramban(g: unknown = globalThis): HasilPeriksaPeramban {
  const fiturHilang = FITUR_PENTING.filter((f) => ambilJalur(g, f.jalur) == null).map((f) => f.nama);
  let tanpaColorMix = false;
  const supports = ambilJalur(g, "CSS.supports");
  if (typeof supports === "function") {
    try {
      tanpaColorMix = !(supports as (p: string, v: string) => boolean).call(ambilJalur(g, "CSS"), "color", "color-mix(in srgb, red, blue)");
    } catch {
      tanpaColorMix = false;
    }
  } else if (ambilJalur(g, "document") != null) {
    // Peramban tanpa CSS.supports (sangat lama) pasti tanpa color-mix.
    tanpaColorMix = true;
  }
  return { fiturHilang, tanpaColorMix, perluPeringatan: fiturHilang.length > 0 || tanpaColorMix };
}

export interface PesanPeramban {
  judul: string;
  teks: string;
  /** Rincian untuk yang ingin tahu (daftar fitur yang belum didukung); kosong bila tidak ada. */
  rincian: string;
}

/** Kalimat peringatan menurut hasil pemeriksaan. Null bila peramban sudah cukup baru. */
export function pesanPeramban(h: HasilPeriksaPeramban): PesanPeramban | null {
  if (!h.perluPeringatan) return null;
  const saran = "Perbarui Chrome, Edge, Firefox, atau Safari ke versi terbaru untuk pengalaman terbaik.";
  if (h.fiturHilang.length > 0) {
    return {
      judul: "Peramban Anda terlalu lama",
      teks: `Sebagian fitur mungkin tidak berjalan dengan benar. ${saran}`,
      rincian: `Belum didukung: ${h.fiturHilang.join(", ")}.`,
    };
  }
  return {
    judul: "Peramban Anda terlalu lama",
    teks: `Aplikasi tetap bisa dipakai, tetapi sebagian warna dan bayangan tampil lebih polos. ${saran}`,
    rincian: "",
  };
}
