// Token dan varian gerak bersama, supaya seluruh aplikasi bergerak dengan "irama" yang sama.
// Prinsip: hanya transform dan opacity (murah), pegas untuk yang diinteraksi pengguna,
// kurva ease-out untuk yang muncul sendiri, keluar lebih cepat daripada masuk.
import type { Transition, Variants } from "framer-motion";

export const EASE_KELUAR = [0.22, 1, 0.36, 1] as const;

/** Pegas untuk hover, tekan, dan indikator yang berpindah. */
export const pegas: Transition = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 };
/** Pegas lebih lembut untuk panel, modal, dan kartu yang masuk. */
export const pegasLembut: Transition = { type: "spring", stiffness: 300, damping: 30, mass: 0.9 };
/** Pegas sedikit memantul untuk elemen "muncul" seperti gelembung chat. */
export const pegasMantul: Transition = { type: "spring", stiffness: 420, damping: 24, mass: 0.8 };

export const tekan = { scale: 0.97 } as const;
export const angkat = { y: -2 } as const;

/** Wadah yang memunculkan anak-anaknya satu per satu (30-60ms per item). */
export const kontainer = (jeda = 0.05, tunda = 0): Variants => ({
  awal: {},
  tampil: { transition: { staggerChildren: jeda, delayChildren: tunda } },
});

/** Anak dari `kontainer`: naik sedikit sambil memudar masuk. */
export const item: Variants = {
  awal: { opacity: 0, y: 14 },
  tampil: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE_KELUAR } },
};

export const itemKecil: Variants = {
  awal: { opacity: 0, y: 8 },
  tampil: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_KELUAR } },
};

/** Transisi halaman: masuk saja, tanpa menunggu halaman lama keluar (terasa lebih cepat). */
export const halaman: Variants = {
  awal: { opacity: 0, y: 14, filter: "blur(4px)" },
  tampil: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.38, ease: EASE_KELUAR } },
};
