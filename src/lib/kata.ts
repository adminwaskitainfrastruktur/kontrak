// Bank kalimat supaya tulisan di aplikasi tidak monoton. Semuanya dipilih acak,
// tetapi `Pilih` menjaga agar kalimat yang sama tidak keluar dua kali berturut-turut.

export function acak<T>(daftar: readonly T[]): T {
  return daftar[Math.floor(Math.random() * daftar.length)]!;
}

/** Pemilih dengan ingatan: tidak mengulang pilihan terakhir untuk kunci yang sama. */
export function buatPemilih() {
  const terakhir = new Map<string, number>();
  return <T>(kunci: string, daftar: readonly T[]): T => {
    if (daftar.length === 1) return daftar[0]!;
    let i = Math.floor(Math.random() * daftar.length);
    if (i === terakhir.get(kunci)) i = (i + 1) % daftar.length;
    terakhir.set(kunci, i);
    return daftar[i]!;
  };
}

export type Waktu = "pagi" | "siang" | "sore" | "malam";

export function waktuHariIni(d = new Date()): Waktu {
  const jam = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(d));
  if (jam >= 4 && jam < 11) return "pagi";
  if (jam >= 11 && jam < 15) return "siang";
  if (jam >= 15 && jam < 18) return "sore";
  return "malam";
}

const SALAM: Record<Waktu, string> = { pagi: "Selamat pagi", siang: "Selamat siang", sore: "Selamat sore", malam: "Selamat malam" };

export function salam(waktu = waktuHariIni()) {
  return SALAM[waktu];
}

/** Judul besar di dashboard, berganti menurut waktu. */
export function judulSambutan(nama: string, waktu = waktuHariIni()): string {
  const bank: Record<Waktu, string[]> = {
    pagi: [`Selamat pagi, ${nama}`, `Pagi, ${nama}`, `Semangat pagi, ${nama}`],
    siang: [`Selamat siang, ${nama}`, `Siang, ${nama}`, `Halo, ${nama}`],
    sore: [`Selamat sore, ${nama}`, `Sore, ${nama}`, `Halo lagi, ${nama}`],
    malam: [`Selamat malam, ${nama}`, `Masih semangat, ${nama}?`, `Malam, ${nama}`],
  };
  return acak(bank[waktu]);
}

export function kalimatTindakan(n: number): string {
  if (n === 0) {
    return acak(["Semua beres, tidak ada yang menunggu Anda.", "Antrean Anda kosong. Waktu yang pas untuk minum kopi.", "Tidak ada kontrak yang perlu Anda tangani sekarang."]);
  }
  if (n === 1) return acak(["Ada 1 kontrak yang menunggu tindakan Anda.", "Satu kontrak butuh perhatian Anda.", "Tinggal 1 kontrak yang perlu Anda tangani."]);
  return acak([`Ada ${n} kontrak yang menunggu tindakan Anda.`, `${n} kontrak butuh perhatian Anda hari ini.`, `Antrean Anda berisi ${n} kontrak.`]);
}

/** Kalimat pembuka halaman Monitoring (Ruang Pengguna). */
export function kalimatPantau(antri: number, proses: number, revisi: number): string {
  if (revisi > 0) {
    return acak([
      `Legal meminta revisi pada ${revisi} pengajuan Anda. Yuk dirapikan supaya bisa lanjut.`,
      `Ada ${revisi} pengajuan yang menunggu revisi dari Anda.`,
    ]);
  }
  if (antri === 0 && proses === 0) {
    return acak(["Tidak ada pengajuan yang sedang berjalan. Semua sudah ada hasilnya.", "Belum ada pengajuan yang menunggu. Ajukan kontrak baru kapan saja.", "Meja Anda bersih: tidak ada pengajuan yang masih diproses."]);
  }
  const bagian = [antri > 0 && `${antri} di antrean`, proses > 0 && `${proses} sedang diproses`].filter(Boolean).join(" dan ");
  return acak([`Pengajuan Anda: ${bagian}.`, `Saat ini ${bagian}. Posisinya diperbarui otomatis.`, `Kabar terkini: ${bagian}. Kami beri tahu begitu ada perubahan.`]);
}

export const TIPS_PENGAJU: readonly string[] = [
  "Antrean diurutkan menurut prioritas, lalu waktu pengajuan.",
  "Unggah draft kontrak saat mengajukan supaya review bisa langsung dimulai.",
  "Lonceng di kanan atas memberi tahu saat antrean bergerak atau status berubah.",
  "Kontrak yang diminta revisi kembali ke Legal setelah Anda menekan Kirim Ulang.",
];

export const TIPS: readonly string[] = [
  "Tekan Ctrl + K untuk mencari kontrak atau pindah halaman dengan cepat.",
  "Tampilan Papan di Daftar Kontrak memudahkan melihat posisi kontrak di setiap tahap.",
  "Unggah draft kontrak saat mengajukan supaya Legal bisa langsung memulai review.",
  "Isi target selesai review agar Legal tahu kapan kontrak dibutuhkan.",
  "Kontrak yang akan berakhir muncul otomatis di dashboard 90 hari sebelumnya.",
];

// --- Percakapan pengajuan kontrak -----------------------------------------------

export const SAPAAN_CHAT: Record<Waktu, (n: string) => string[]> = {
  pagi: (n) => [`Selamat pagi, ${n}! Mari kita ajukan kontrak dengan kepala segar.`, `Pagi, ${n}! Saya siap membantu pengajuan kontrak Anda.`],
  siang: (n) => [`Selamat siang, ${n}! Yuk, kita mulai pengajuan kontraknya.`, `Halo ${n}, siang ini kita rapikan pengajuan kontrak Anda ya.`],
  sore: (n) => [`Selamat sore, ${n}! Kita selesaikan pengajuan ini dengan cepat.`, `Sore, ${n}! Saya bantu siapkan pengajuan kontrak Anda.`],
  malam: (n) => [`Selamat malam, ${n}! Semoga lancar, kita selesaikan pengajuannya sekarang.`, `Malam, ${n}! Masih sempat mengajukan kontrak, kok. Saya bantu.`],
};

export const PEMBUKA_CHAT: readonly string[] = [
  "Saya akan bertanya beberapa hal singkat, lalu menyusunnya jadi pengajuan yang rapi untuk Legal.",
  "Cukup jawab satu per satu. Anda boleh mengubah jawaban kapan saja sebelum dikirim.",
  "Prosesnya ringan, kira-kira 10 pertanyaan. Sisanya biar saya yang rapikan.",
];

export const PENGANTAR_BERIKUT: readonly string[] = ["Lanjut ya.", "Berikutnya,", "Oke, selanjutnya:", "Sedikit lagi.", "Kita lanjut."];

export const RINGKASAN_CHAT: readonly string[] = [
  "Sudah lengkap! Ini ringkasannya. Periksa dulu, bagian mana pun masih bisa diubah.",
  "Semua pertanyaan terjawab. Silakan cek ringkasan di bawah sebelum dikirim ke Legal.",
  "Selesai! Coba periksa ringkasannya, kalau ada yang kurang pas tinggal tekan ikon pensil.",
];

export const SELESAI_CHAT: readonly ((nomor: string) => string)[] = [
  (n) => `Berhasil! Pengajuan Anda tercatat dengan nomor ${n} dan sudah masuk antrean Legal.`,
  (n) => `Terkirim. Nomor pengajuannya ${n}. Legal akan segera meninjaunya.`,
  (n) => `Beres! ${n} sudah ada di meja Legal.`,
];

export const GAGAL_CHAT: readonly string[] = ["Aduh, pengajuan belum berhasil dikirim. Data Anda masih aman, silakan coba lagi.", "Ada kendala saat mengirim. Jawaban Anda tidak hilang; coba kirim ulang."];

export const KOSONG_BERKAS: readonly string[] = ["Oke, dokumennya bisa menyusul.", "Tidak masalah, dokumen bisa diunggah nanti dari halaman detail.", "Baik, tanpa lampiran dulu."];

export const KATA_PILIHAN_LEWATI: readonly string[] = ["Lewati", "Nanti saja", "Tidak ada"];
