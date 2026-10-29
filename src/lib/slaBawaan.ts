// Batas SLA bawaan, dipisah dari lib/sla supaya aman dari impor melingkar:
// lib/sla membaca Pengaturan (lib/pengaturan), sementara lib/pengaturan memakai angka di sini sebagai
// nilai bawaannya saat modul dimuat. Karena berkas ini tidak mengimpor apa pun selain tipe, nilainya
// selalu sudah siap, siapa pun yang dimuat lebih dulu.
import type { Status } from "./types";

/** Batas wajar lama sebuah kontrak berada di satu status, dalam hari kalender. */
export const SLA_HARI: Partial<Record<Status, number>> = {
  Diajukan: 2,
  "Review Legal": 7,
  "Perlu Revisi": 5,
  "Proses Tanda Tangan": 7,
};
