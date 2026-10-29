// Aturan alur kontrak dan hak akses, ditulis sekali di sini dan dipakai semua
// halaman.
//
//   Diajukan ──(Legal: Mulai Review)──> Review Legal
//      │                                   ├─(Legal: Minta Revisi)──> Perlu Revisi ──(Pengaju: Kirim Ulang)──┐
//      │                                   ├─(Legal: Lanjut Tanda Tangan)──> Proses Tanda Tangan             │
//      │                                   │        ├─(Legal: Aktifkan, isi nomor & tanggal)──> Aktif ──> Berakhir
//      │                                   │        └─(Legal: Kembali ke Review)──> Review Legal <───────────┘
//      ├─(Legal: Tolak)──> Ditolak  (juga dari Review Legal)
//      └─(Pengaju: Batalkan)──> Dibatalkan  (juga dari Perlu Revisi)
//
//   Admin: Aktifkan Kembali dari Berakhir, Ditolak, atau Dibatalkan (lihat aksiPemulihan), catatan wajib.
//
// Catatan keamanan: aturan ini dijaga oleh tampilan aplikasi. Batas keras
// tetap keanggotaan site SharePoint Kontrak WKI, karena setiap anggota site
// secara teknis bisa mengubah list lewat SharePoint langsung.

import { STATUS_FINAL, STATUS_PROSES, type Kontrak, type Sesi, type Status } from "./types";

export type Pelaku = "legal" | "pengaju";

export interface AksiStatus {
  id: string;
  label: string;
  ke: Status;
  oleh: Pelaku;
  /** Catatan wajib diisi (alasan penolakan, poin revisi, dsb.). */
  wajibCatatan: boolean;
  nada: "utama" | "bahaya" | "netral";
  /** Aktivasi kontrak meminta nomor kontrak dan tanggal-tanggal final. */
  butuhDataFinal?: boolean;
  /** "Tandai Berakhir" meminta mode berakhir dan tanggal efektifnya (K02). */
  butuhPenutupan?: boolean;
  /** Hanya Admin (aksi balik dari status akhir). */
  hanyaAdmin?: boolean;
  petunjuk: string;
}

const ALUR: Record<Status, AksiStatus[]> = {
  Diajukan: [
    { id: "mulai-review", label: "Mulai Review", ke: "Review Legal", oleh: "legal", wajibCatatan: false, nada: "utama", petunjuk: "Anda akan tercatat sebagai PIC Legal jika belum ada PIC." },
    { id: "tolak", label: "Tolak", ke: "Ditolak", oleh: "legal", wajibCatatan: true, nada: "bahaya", petunjuk: "Tuliskan alasan penolakan. Pengaju akan melihatnya di riwayat." },
    { id: "batal", label: "Batalkan Pengajuan", ke: "Dibatalkan", oleh: "pengaju", wajibCatatan: true, nada: "bahaya", petunjuk: "Tuliskan alasan pembatalan." },
  ],
  "Review Legal": [
    { id: "lanjut-ttd", label: "Lanjut ke Tanda Tangan", ke: "Proses Tanda Tangan", oleh: "legal", wajibCatatan: false, nada: "utama", petunjuk: "Draft final sudah disepakati dan siap ditandatangani." },
    { id: "minta-revisi", label: "Minta Revisi", ke: "Perlu Revisi", oleh: "legal", wajibCatatan: true, nada: "netral", petunjuk: "Tuliskan poin yang harus diperbaiki atau dokumen yang harus dilengkapi pengaju." },
    { id: "tolak", label: "Tolak", ke: "Ditolak", oleh: "legal", wajibCatatan: true, nada: "bahaya", petunjuk: "Tuliskan alasan penolakan." },
  ],
  "Perlu Revisi": [
    { id: "kirim-ulang", label: "Kirim Ulang ke Legal", ke: "Review Legal", oleh: "pengaju", wajibCatatan: false, nada: "utama", petunjuk: "Pastikan revisi dan dokumen baru sudah diunggah. Catatan bersifat opsional." },
    { id: "batal", label: "Batalkan Pengajuan", ke: "Dibatalkan", oleh: "pengaju", wajibCatatan: true, nada: "bahaya", petunjuk: "Tuliskan alasan pembatalan." },
  ],
  "Proses Tanda Tangan": [
    { id: "aktifkan", label: "Tandai Sudah Ditandatangani", ke: "Aktif", oleh: "legal", wajibCatatan: false, nada: "utama", butuhDataFinal: true, petunjuk: "Lengkapi nomor kontrak dan tanggal final. Unggah juga kontrak yang sudah ditandatangani." },
    { id: "kembali-review", label: "Kembali ke Review", ke: "Review Legal", oleh: "legal", wajibCatatan: true, nada: "netral", petunjuk: "Tuliskan alasan draft dikembalikan ke review." },
  ],
  Aktif: [
    { id: "akhiri", label: "Tandai Berakhir", ke: "Berakhir", oleh: "legal", wajibCatatan: false, nada: "netral", butuhPenutupan: true, petunjuk: "Pilih cara kontrak berakhir dan tanggal efektifnya." },
  ],
  // Status akhir tidak punya langkah lanjutan. Aksi balik Admin ada di aksiPemulihan (bukan bagian alur biasa).
  Berakhir: [],
  Ditolak: [],
  Dibatalkan: [],
};

// --- Aksi balik Admin (U04) --------------------------------------------------------------
//
// "Aktifkan kembali" memulihkan kontrak yang salah ditutup (Berakhir, Ditolak, Dibatalkan). Sengaja tidak
// dimasukkan ke ALUR supaya glosarium status tetap menyebut status akhir sebagai akhir bagi pengguna biasa.

/** Status yang bisa dituju saat membuka kembali, menurut status akhirnya. Yang pertama adalah bawaan. */
const TUJUAN_PEMULIHAN: Record<"Berakhir" | "Ditolak" | "Dibatalkan", Status[]> = {
  Berakhir: ["Aktif"],
  Ditolak: ["Review Legal", "Diajukan"],
  Dibatalkan: ["Diajukan", "Perlu Revisi"],
};

/**
 * Status tujuan "Aktifkan kembali": status sebelum ditutup bila tercatat dan masuk akal, selain itu bawaannya
 * (Berakhir ke Aktif, Ditolak ke Review Legal, Dibatalkan ke Diajukan). null bila status bukan status akhir.
 */
export function tujuanPemulihan(status: Status, statusSebelum?: string | null): Status | null {
  if (status !== "Berakhir" && status !== "Ditolak" && status !== "Dibatalkan") return null;
  const pilihan = TUJUAN_PEMULIHAN[status];
  return pilihan.find((s) => s === statusSebelum) ?? pilihan[0]!;
}

/** Aksi "Aktifkan Kembali" untuk Admin pada kontrak berstatus akhir. Kosong untuk selain itu. */
export function aksiPemulihan(k: Pick<Kontrak, "status">, sesi: Sesi, statusSebelum?: string | null): AksiStatus[] {
  const ke = sesi.peran === "Admin" ? tujuanPemulihan(k.status, statusSebelum) : null;
  if (!ke) return [];
  const petunjuk =
    k.status === "Berakhir"
      ? "Kontrak kembali berlaku. Mode dan tanggal berakhir dikosongkan; addendum yang ikut diakhiri perlu diaktifkan sendiri."
      : `Pengajuan kembali ke ${ke} dan diproses seperti biasa. Tuliskan alasan pemulihannya.`;
  return [{ id: "aktifkan-kembali", label: "Aktifkan Kembali", ke, oleh: "legal", wajibCatatan: true, nada: "netral", hanyaAdmin: true, petunjuk }];
}

export function adalahLegal(sesi: Sesi): boolean {
  return sesi.peran === "Admin" || sesi.peran === "Legal";
}

/** Kesamaan divisi hanya berlaku bila sesi punya divisi (akun yang masuk otomatis tidak punya). */
function divisiSama(k: Kontrak, sesi: Sesi): boolean {
  return sesi.divisi != null && k.divisi === sesi.divisi;
}

/**
 * Pengaju kontrak ini: pembuatnya, atau Pengaju terdaftar lain dari divisi yang sama.
 * Akun kantor yang masuk otomatis (divisi null) hanya pengaju untuk kontrak buatannya sendiri.
 */
export function adalahPengajuKontrak(k: Kontrak, sesi: Sesi): boolean {
  if (sesi.peran === "Pemantau") return false;
  return k.pengajuEmail.toLowerCase() === sesi.email || (sesi.peran === "Pengaju" && divisiSama(k, sesi));
}

export function bisaLihat(k: Kontrak, sesi: Sesi): boolean {
  if (sesi.peran !== "Pengaju") return true;
  return divisiSama(k, sesi) || k.pengajuEmail.toLowerCase() === sesi.email;
}

export function bisaAjukan(sesi: Sesi): boolean {
  return sesi.peran !== "Pemantau";
}

/** Addendum hanya bisa diajukan untuk kontrak yang sedang berlaku (Aktif). */
export function bisaAjukanAddendum(k: Kontrak, sesi: Sesi): boolean {
  return k.status === "Aktif" && bisaAjukan(sesi) && bisaLihat(k, sesi);
}

export function bisaUbah(k: Kontrak, sesi: Sesi): boolean {
  if (STATUS_FINAL.includes(k.status)) return false;
  if (adalahLegal(sesi)) return true;
  return adalahPengajuKontrak(k, sesi) && (k.status === "Diajukan" || k.status === "Perlu Revisi");
}

/** Hak ubah menurut aturan pengaju saja (dipakai di Ruang Pengguna, juga oleh Admin dan Legal). */
export function bisaUbahSebagaiPengaju(k: Kontrak, sesi: Sesi): boolean {
  return adalahPengajuKontrak(k, sesi) && (k.status === "Diajukan" || k.status === "Perlu Revisi");
}

/** Unggah dokumen: Legal kapan pun, pengaju selama kontrak masih diproses. */
export function bisaUnggah(k: Kontrak, sesi: Sesi): boolean {
  if (adalahLegal(sesi)) return k.status !== "Dibatalkan";
  return adalahPengajuKontrak(k, sesi) && STATUS_PROSES.includes(k.status);
}

export function bisaKomentar(k: Kontrak, sesi: Sesi): boolean {
  return sesi.peran !== "Pemantau" && bisaLihat(k, sesi);
}

export function aksiTersedia(k: Kontrak, sesi: Sesi): AksiStatus[] {
  return ALUR[k.status].filter((a) =>
    a.oleh === "legal" ? adalahLegal(sesi) : adalahPengajuKontrak(k, sesi) || sesi.peran === "Admin",
  );
}

/**
 * Kontrak yang menunggu tindakan pengguna ini. Untuk Legal: pengajuan baru yang belum ada PIC-nya atau
 * sudah ditugaskan kepadanya, serta review dan tanda tangan yang dipegangnya (atau belum ada PIC-nya).
 * Pengajuan yang sudah ditugaskan ke rekan lain tidak dihitung, supaya antrean tiap orang tidak tumpang tindih.
 */
export function butuhTindakan(k: Kontrak, sesi: Sesi): boolean {
  if (adalahLegal(sesi)) {
    if (k.status === "Diajukan" || k.status === "Review Legal" || k.status === "Proses Tanda Tangan") {
      return !k.picLegalEmail || k.picLegalEmail.toLowerCase() === sesi.email;
    }
    return false;
  }
  return k.status === "Perlu Revisi" && adalahPengajuKontrak(k, sesi);
}

/**
 * Cek konflik sebelum aksi status (U38, pengganti If-Match): bandingkan kontrak yang dilihat pengguna dengan
 * hasil baca ulang. Mengembalikan pesan yang jelas bila status (atau PIC, untuk aksi Legal) sudah berubah,
 * null bila aman dilanjutkan.
 */
export function pesanKonflik(
  dilihat: Pick<Kontrak, "status" | "picLegalEmail">,
  segar: Pick<Kontrak, "status" | "picLegalEmail" | "picLegalNama" | "nomorPengajuan">,
  opsi: { cekPic?: boolean } = {},
): string | null {
  const nomor = segar.nomorPengajuan || "Kontrak ini";
  if (dilihat.status !== segar.status) {
    return `Status ${nomor} baru saja berubah menjadi ${segar.status}, mungkin oleh rekan Anda. Muat ulang dulu supaya tidak menimpa keputusan orang lain.`;
  }
  if (opsi.cekPic) {
    const lama = dilihat.picLegalEmail.trim().toLowerCase();
    const baru = segar.picLegalEmail.trim().toLowerCase();
    if (lama !== baru) {
      return baru
        ? `PIC ${nomor} baru saja berubah menjadi ${segar.picLegalNama || segar.picLegalEmail}. Muat ulang dulu, lalu ulangi langkah ini bila masih perlu.`
        : `PIC ${nomor} baru saja dilepas. Muat ulang dulu, lalu ulangi langkah ini bila masih perlu.`;
    }
  }
  return null;
}

/**
 * Tautan "Ambil sebagai PIC" (?aksi=ambil-pic, U23c) dari email atau kartu Teams: hanya Legal/Admin di Ruang Admin,
 * hanya untuk kontrak yang belum final dan belum punya PIC. Bila tidak boleh, `pesan` menjelaskan kenapa tautan
 * diabaikan. Pemeriksaan ulang terhadap data segar tetap dilakukan saat menyimpan (jalankanPenugasan).
 */
export function cekAmbilPic(
  k: Pick<Kontrak, "status" | "picLegalEmail" | "picLegalNama" | "nomorPengajuan">,
  sesi: Sesi,
  ruangAdmin: boolean,
): { boleh: true } | { boleh: false; pesan: string } {
  const nomor = k.nomorPengajuan || "Kontrak ini";
  if (!adalahLegal(sesi)) return { boleh: false, pesan: "Mengambil PIC hanya untuk Legal dan Admin, jadi tautan ini diabaikan." };
  if (!ruangAdmin) return { boleh: false, pesan: "Buka kontrak ini dari Ruang Admin untuk mengambilnya sebagai PIC." };
  if (STATUS_FINAL.includes(k.status)) return { boleh: false, pesan: `${nomor} sudah berstatus ${k.status}, jadi tidak perlu PIC lagi.` };
  const pic = k.picLegalEmail.trim().toLowerCase();
  if (pic === sesi.email.trim().toLowerCase()) return { boleh: false, pesan: `Anda sudah menjadi PIC ${nomor}.` };
  if (pic) return { boleh: false, pesan: `${nomor} sudah dipegang ${k.picLegalNama || k.picLegalEmail}, jadi tautan ini diabaikan. Pakai "Alihkan PIC" bila memang perlu diganti.` };
  return { boleh: true };
}

/** Urutan tahap untuk penunjuk langkah di halaman detail. */
export const TAHAP: { label: string; status: Status[] }[] = [
  { label: "Diajukan", status: ["Diajukan"] },
  { label: "Review Legal", status: ["Review Legal", "Perlu Revisi"] },
  { label: "Tanda Tangan", status: ["Proses Tanda Tangan"] },
  { label: "Aktif", status: ["Aktif", "Berakhir"] },
];

export function indeksTahap(status: Status): number {
  return TAHAP.findIndex((t) => t.status.includes(status));
}
