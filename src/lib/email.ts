// Template email Outlook untuk WiCon. Potongan HTML-nya ada di emailKit.ts.
//
// Aturan isi:
//   - Setiap email menyebut KAPAN pengajuan masuk (hari, tanggal, jam WIB), supaya tidak ada perdebatan soal waktu.
//   - Email untuk pengaju selalu memuat posisi antrean dan pelacak Antri, Proses, Selesai.
//   - Isi pengajuan orang lain tidak pernah tampil di email pengaju: hanya nomor urut dan tanda prioritas.
//   - Kalimat dipilih dari beberapa variasi menurut id kontrak, jadi stabil untuk satu kontrak tetapi tidak monoton.
import { formatMasuk, formatTanggal, formatUang } from "./format";
import { keteranganRingkas, posisiAntrean, teksPosisi } from "./antrean";
import { lamaSejak } from "./format";
import {
  WARNA,
  barisTombol,
  esc,
  infoKontrak,
  jalurAntrean,
  kartuPosisi,
  kerangka,
  kotakCatatan,
  legendaAntrean,
  paragraf,
  pelacak,
  seksi,
  tabelAntrean,
  tombol,
  urlAmbilPic,
  urlAntreanLegal,
  urlKontrak,
  urlMonitoring,
} from "./emailKit";
import type { PerkiraanAntrean } from "./estimasi";
import type { Kontrak, Status } from "./types";

export interface IsiEmail {
  subjek: string;
  html: string;
}

const awal = (nama: string) => (nama.trim().split(/\s+/)[0] || "Bapak/Ibu");
const varian = <T>(id: number, daftar: readonly T[]): T => daftar[id % daftar.length]!;
const tanda = (k: Kontrak) => (k.prioritas === "Mendesak" ? "[MENDESAK] " : k.prioritas === "Tinggi" ? "[Prioritas] " : "");
const masuk = (k: Kontrak) => k.tanggalDiajukan ?? k.dibuat;

/**
 * Perkiraan kapan review selesai, disisipkan di bawah kartu posisi. Hanya tampil bila datanya cukup
 * (hariMin terisi); bila belum cukup, email tidak menjanjikan apa pun. Isinya angka agregat, bukan data orang lain.
 */
const teksPerkiraan = (p?: PerkiraanAntrean | null) =>
  p?.hariMin != null ? `<div style="padding-top:12px;font-family:'Segoe UI',Calibri,Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${WARNA.muted};">${esc(p.teks)}</div>` : "";

/** Dokumen yang terunggah bersama pengajuan (U23a): email Legal dikirim SESUDAH unggahan selesai. */
export interface DokumenPengajuan {
  jumlah: number;
  /** Jenis tiap dokumen yang terunggah, mis. ["Draft Kontrak", "Penawaran"]. */
  jenis?: readonly string[];
  /** Pengaju menyatakan dokumen wajib yang belum ada akan disusulkan. */
  susulan?: boolean;
}

/** "3 berkas (Draft Kontrak, Penawaran 2x)" atau "Belum ada dokumen". */
export function teksDokumenPengajuan(d: DokumenPengajuan | null | undefined): string {
  if (!d) return "-";
  if (d.jumlah <= 0) return d.susulan ? "Belum ada dokumen, pengaju akan menyusulkan" : "Belum ada dokumen";
  const hitung = new Map<string, number>();
  for (const j of d.jenis ?? []) if (j) hitung.set(j, (hitung.get(j) ?? 0) + 1);
  const rinci = [...hitung].map(([j, n]) => (n > 1 ? `${j} ${n}x` : j)).join(", ");
  return `${d.jumlah} berkas${rinci ? ` (${rinci})` : ""}${d.susulan ? ", sisanya menyusul" : ""}`;
}

/** Tim Legal: ada pengajuan baru di antrean. */
export function emailPengajuanBaruLegal(k: Kontrak, antrean: Kontrak[], dokumen?: DokumenPengajuan | null): IsiEmail {
  const posisi = posisiAntrean(k, antrean) ?? antrean.length;
  const mendesak = k.prioritas === "Mendesak";
  const isi =
    paragraf(`<strong>${esc(k.pengajuNama)}</strong> (divisi ${esc(k.divisi)}) mengajukan kontrak pada <strong>${esc(formatMasuk(masuk(k)))}</strong>. ${posisi === 1 ? "Pengajuan ini berada di urutan pertama antrean." : `Pengajuan ini berada di urutan ke-${posisi} dari ${antrean.length} di antrean.`}`) +
    `<tr><td style="padding:18px 32px 0 32px;">${infoKontrak(k, [
      { label: "Pengaju", nilaiHtml: `${esc(k.pengajuNama)}<br><span style="color:${WARNA.muted};font-size:12px;">${esc(k.pengajuEmail)}</span>` },
      { label: "Nilai", nilaiHtml: k.jenis.startsWith("MoU") ? "Tanpa nilai" : esc(formatUang(k.nilai, k.mataUang)) },
      { label: "Target selesai", nilaiHtml: esc(formatTanggal(k.targetSelesai)) },
      ...(dokumen ? [{ label: "Dokumen", nilaiHtml: esc(teksDokumenPengajuan(dokumen)) }] : []),
    ])}</td></tr>` +
    (k.deskripsi ? kotakCatatan("Ruang lingkup", k.deskripsi.length > 400 ? `${k.deskripsi.slice(0, 400)}…` : k.deskripsi, "info") : "") +
    seksi("Antrean Legal saat ini", tabelAntrean(antrean, k.id, 6)) +
    barisTombol(tombol("Buka pengajuan", urlKontrak(k.id, "legal")), tombol("Ambil sebagai PIC", urlAmbilPic(k.id), "kedua"), tombol("Lihat antrean", urlAntreanLegal(), "kedua"));
  return {
    subjek: `[WiCon] ${tanda(k)}Pengajuan baru: ${k.judul} (${k.nomorPengajuan})`,
    html: kerangka({
      pratinjau: `${k.pengajuNama} mengajukan ${k.judul}. Masuk ${formatMasuk(masuk(k))}. Urutan ke-${posisi} di antrean.${dokumen ? ` Dokumen: ${teksDokumenPengajuan(dokumen)}.` : ""}`,
      label: mendesak ? "Pengajuan baru · Mendesak" : "Pengajuan baru",
      judul: varian(k.id, ["Ada pengajuan kontrak baru", "Pengajuan baru menunggu giliran", "Satu pengajuan masuk ke antrean"]),
      nada: mendesak ? "danger" : "accent",
      isi,
    }),
  };
}

/** Pengaju: pengajuannya diterima, lengkap dengan posisi antrean. */
export function emailKonfirmasiPengaju(k: Kontrak, antrean: Kontrak[], perkiraan?: PerkiraanAntrean | null): IsiEmail {
  const posisi = posisiAntrean(k, antrean) ?? antrean.length;
  const isi =
    paragraf(
      `${varian(k.id, ["Halo", "Selamat datang kembali", "Terima kasih"])} <strong>${esc(awal(k.pengajuNama))}</strong>, pengajuan Anda sudah tercatat pada <strong>${esc(formatMasuk(masuk(k)))}</strong>. Legal akan mereview sesuai urutan antrean. Anda akan mendapat email lagi setiap kali statusnya berubah atau antreannya bergerak.`,
    ) +
    `<tr><td style="padding:18px 32px 0 32px;">${infoKontrak(k)}</td></tr>` +
    seksi("Posisi antrean Anda", kartuPosisi(posisi, antrean.length, teksPosisi(posisi)) + teksPerkiraan(perkiraan) + `<div style="padding-top:14px;">${jalurAntrean(antrean, [k.id])}</div>${legendaAntrean()}`) +
    seksi("Tahapan pengajuan", pelacak(k)) +
    barisTombol(tombol("Pantau pengajuan", urlKontrak(k.id, "pengaju")), tombol("Semua pengajuan saya", urlMonitoring(), "kedua"));
  return {
    subjek: `[WiCon] Pengajuan ${k.nomorPengajuan} diterima, urutan ke-${posisi}`,
    html: kerangka({
      pratinjau: `Pengajuan ${k.judul} masuk ${formatMasuk(masuk(k))}. Anda di urutan ke-${posisi} dari ${antrean.length}.`,
      label: "Pengajuan diterima",
      judul: varian(k.id, ["Pengajuan Anda sudah masuk antrean", "Terkirim! Pengajuan Anda kami terima", "Pengajuan Anda tercatat"]),
      isi,
    }),
  };
}

const JUDUL_STATUS: Record<Status, readonly string[]> = {
  Diajukan: ["Pengajuan kembali masuk antrean"],
  "Review Legal": ["Giliran Anda tiba: pengajuan mulai direview", "Pengajuan Anda sedang direview Legal", "Legal mulai mereview pengajuan Anda"],
  "Perlu Revisi": ["Legal meminta revisi dari Anda", "Ada catatan revisi untuk pengajuan Anda"],
  "Proses Tanda Tangan": ["Review selesai, masuk proses tanda tangan", "Tinggal selangkah lagi: tanda tangan"],
  Aktif: ["Kontrak Anda sudah berlaku", "Selesai! Kontrak sudah ditandatangani"],
  Berakhir: ["Masa berlaku kontrak sudah berakhir"],
  Ditolak: ["Pengajuan Anda belum dapat diproses"],
  Dibatalkan: ["Pengajuan dibatalkan"],
};

/** Status berubah. `untuk` = pengaju (aksi Legal) atau legal (aksi pengaju: kirim ulang, batal). */
export function emailStatusBerubah(k: Kontrak, dari: Status, catatan: string, oleh: string, antrean: Kontrak[], untuk: "pengaju" | "legal"): IsiEmail {
  const posisi = posisiAntrean(k, antrean);

  if (untuk === "legal") {
    const batal = k.status === "Dibatalkan";
    const isi =
      paragraf(`<strong>${esc(oleh)}</strong> ${batal ? "membatalkan pengajuan ini" : "mengirim ulang pengajuan setelah merevisinya"} pada <strong>${esc(formatMasuk(new Date().toISOString()))}</strong>.`) +
      (catatan ? kotakCatatan(batal ? "Alasan pembatalan" : "Catatan pengaju", catatan, batal ? "bahaya" : "info") : "") +
      `<tr><td style="padding:18px 32px 0 32px;">${infoKontrak(k)}</td></tr>` +
      barisTombol(tombol(batal ? "Lihat riwayat" : "Lanjutkan review", urlKontrak(k.id, "legal")));
    return {
      subjek: `[WiCon] ${k.nomorPengajuan}: ${batal ? "pengajuan dibatalkan" : "revisi dikirim ulang"}`,
      html: kerangka({ pratinjau: `${oleh} ${batal ? "membatalkan" : "mengirim ulang"} ${k.judul}.`, label: batal ? "Dibatalkan pengaju" : "Revisi dikirim ulang", judul: batal ? "Pengajuan dibatalkan oleh pengaju" : "Revisi sudah dikirim ulang", nada: batal ? "danger" : "brand", isi }),
    };
  }

  const nada = k.status === "Aktif" ? "success" : k.status === "Ditolak" ? "danger" : k.status === "Perlu Revisi" ? "accent" : "brand";
  const tambahan: { label: string; nilaiHtml: string }[] = [{ label: "Ditangani", nilaiHtml: esc(k.picLegalNama || "Tim Legal") }];
  if (k.status === "Aktif") {
    tambahan.push({ label: "Nomor kontrak", nilaiHtml: `<strong style="font-family:Consolas,'Courier New',monospace;">${esc(k.nomorKontrak || "-")}</strong>` });
    tambahan.push({ label: "Masa berlaku", nilaiHtml: esc(`${formatTanggal(k.tanggalMulai)} – ${formatTanggal(k.tanggalBerakhir)}`) });
  }
  const catatanKotak =
    catatan && (k.status === "Perlu Revisi" || k.status === "Ditolak" || k.status === "Dibatalkan")
      ? kotakCatatan(k.status === "Perlu Revisi" ? "Yang perlu Anda perbaiki" : "Alasan", catatan, k.status === "Ditolak" ? "bahaya" : "peringatan")
      : catatan
        ? kotakCatatan(`Catatan dari ${oleh}`, catatan, "info")
        : "";
  const langkah =
    k.status === "Perlu Revisi"
      ? "Perbaiki dokumen sesuai catatan di bawah, unggah versi terbarunya, lalu tekan <strong>Kirim Ulang ke Legal</strong>. Pengajuan Anda masuk kembali ke review."
      : k.status === "Review Legal"
        ? `${esc(oleh)} mulai mereview. Anda akan diberi tahu bila ada yang perlu direvisi.`
        : k.status === "Proses Tanda Tangan"
          ? "Draf final sudah disepakati. Tim Legal menyiapkan tanda tangan; Anda akan diberi tahu begitu kontrak berlaku."
          : k.status === "Aktif"
            ? "Kontrak sudah ditandatangani dan berlaku. Dokumen bertanda tangan tersimpan di halaman kontrak."
            : esc(keteranganRingkas(k));
  const isi =
    paragraf(`Halo <strong>${esc(awal(k.pengajuNama))}</strong>, status pengajuan Anda berubah dari <strong>${esc(dari)}</strong> menjadi <strong>${esc(k.status)}</strong>. ${langkah}`) +
    catatanKotak +
    seksi("Tahapan pengajuan", pelacak(k)) +
    `<tr><td style="padding:18px 32px 0 32px;">${infoKontrak(k, tambahan)}</td></tr>` +
    (posisi != null ? seksi("Posisi antrean Anda", kartuPosisi(posisi, antrean.length, teksPosisi(posisi)) + `<div style="padding-top:14px;">${jalurAntrean(antrean, [k.id])}</div>`) : "") +
    barisTombol(tombol(k.status === "Perlu Revisi" ? "Buka dan revisi" : "Lihat pengajuan", urlKontrak(k.id, "pengaju")), tombol("Semua pengajuan saya", urlMonitoring(), "kedua"));
  return {
    subjek: `[WiCon] ${k.nomorPengajuan}: ${k.status === "Perlu Revisi" ? "perlu revisi dari Anda" : k.status === "Aktif" ? "kontrak berlaku" : k.status === "Review Legal" ? "mulai direview" : k.status === "Ditolak" ? "ditolak" : k.status.toLowerCase()}`,
    html: kerangka({
      pratinjau: `${k.judul}: ${dari} → ${k.status}. ${keteranganRingkas(k)}.`,
      label: `Status: ${k.status}`,
      judul: varian(k.id, JUDUL_STATUS[k.status]),
      nada,
      isi,
    }),
  };
}

/** Pengaju yang antreannya maju karena ada pengajuan di depannya mulai direview. */
export function emailAntreanBergerak(k: Kontrak, posisiLama: number, posisiBaru: number, antrean: Kontrak[], perkiraan?: PerkiraanAntrean | null): IsiEmail {
  const berikutnya = posisiBaru === 1;
  const isi =
    paragraf(
      berikutnya
        ? `Kabar baik, <strong>${esc(awal(k.pengajuNama))}</strong>: pengajuan di depan Anda sudah mulai direview, jadi <strong>giliran Anda berikutnya</strong>. Pastikan dokumen Anda lengkap supaya review bisa langsung berjalan.`
        : `Antrean bergerak. Pengajuan Anda naik dari urutan ke-${posisiLama} ke <strong>urutan ke-${posisiBaru}</strong>, karena pengajuan di depannya sudah mulai direview Legal.`,
    ) +
    `<tr><td style="padding:18px 32px 0 32px;">${kartuPosisi(posisiBaru, antrean.length, `Sebelumnya urutan ke-${posisiLama}. ${teksPosisi(posisiBaru)}.`)}${teksPerkiraan(perkiraan)}<div style="padding-top:14px;">${jalurAntrean(antrean, [k.id])}</div>${legendaAntrean()}</td></tr>` +
    seksi("Pengajuan Anda", infoKontrak(k)) +
    barisTombol(tombol("Pantau pengajuan", urlKontrak(k.id, "pengaju")));
  return {
    subjek: `[WiCon] Antrean bergerak: ${k.nomorPengajuan} ${berikutnya ? "giliran berikutnya" : `naik ke urutan ${posisiBaru}`}`,
    html: kerangka({
      pratinjau: `${k.judul}: sekarang urutan ke-${posisiBaru} dari ${antrean.length}.`,
      label: "Antrean bergerak",
      judul: berikutnya ? "Giliran Anda berikutnya!" : `Naik ke urutan ke-${posisiBaru}`,
      nada: "success",
      isi,
    }),
  };
}

/** PIC Legal baru: kontrak ditugaskan kepadanya. `picLama` diisi bila kontrak dialihkan dari rekan lain. */
export function emailDitugaskan(k: Kontrak, oleh: string, alasan = "", picLama = ""): IsiEmail {
  const asal = picLama ? ` dari ${esc(picLama)}` : "";
  const isi =
    paragraf(`<strong>${esc(oleh)}</strong> ${picLama ? "mengalihkan" : "menugaskan"} kontrak ini${asal} kepada Anda sebagai PIC Legal. Pengajuan masuk pada <strong>${esc(formatMasuk(masuk(k)))}</strong> dan sudah menunggu ${esc(lamaSejak(masuk(k)))}.`) +
    (alasan.trim() ? kotakCatatan("Alasan", alasan.trim(), "info") : "") +
    `<tr><td style="padding:18px 32px 0 32px;">${infoKontrak(k, [{ label: "Status", nilaiHtml: esc(k.status) }])}</td></tr>` +
    barisTombol(tombol("Buka kontrak", urlKontrak(k.id, "legal")));
  return {
    subjek: `[WiCon] Ditugaskan kepada Anda: ${k.judul} (${k.nomorPengajuan})`,
    html: kerangka({ pratinjau: `${oleh} menugaskan ${k.judul} kepada Anda.`, label: "Penugasan", judul: "Kontrak ini ditugaskan kepada Anda", isi }),
  };
}

/** PIC Legal lama: kontrak yang dipegangnya dialihkan ke rekan lain (U23a). */
export function emailDialihkan(k: Kontrak, oleh: string, picBaru: string, alasan = ""): IsiEmail {
  const isi =
    paragraf(`<strong>${esc(oleh)}</strong> mengalihkan kontrak ini dari Anda kepada <strong>${esc(picBaru)}</strong>. Anda tidak perlu menindaklanjutinya lagi kecuali diminta; riwayat dan dokumennya tetap bisa Anda buka.`) +
    (alasan.trim() ? kotakCatatan("Alasan pengalihan", alasan.trim(), "info") : "") +
    `<tr><td style="padding:18px 32px 0 32px;">${infoKontrak(k, [
      { label: "Status", nilaiHtml: esc(k.status) },
      { label: "PIC baru", nilaiHtml: `<strong>${esc(picBaru)}</strong>` },
    ])}</td></tr>` +
    barisTombol(tombol("Lihat kontrak", urlKontrak(k.id, "legal"), "kedua"));
  return {
    subjek: `[WiCon] Dialihkan ke ${picBaru}: ${k.judul} (${k.nomorPengajuan})`,
    html: kerangka({ pratinjau: `${oleh} mengalihkan ${k.judul} ke ${picBaru}.`, label: "Pengalihan PIC", judul: "Kontrak ini dialihkan ke rekan Anda", isi }),
  };
}

/** Isi permintaan masukan yang dibutuhkan templat email (K03). */
export interface IsiPermintaanMasukan {
  unit: string;
  namaPenerima: string;
  pertanyaan: string;
  tenggat: string | null;
  tautanBerkas: string;
}

/**
 * Permintaan masukan ke unit lain (K03). Penerima tidak perlu akses ke aplikasi: tombol "Balas ke Legal" membuka
 * email balasan ke Legal yang meminta, lengkap dengan subjek berisi nomor pengajuan.
 */
export function emailPermintaanMasukan(k: Kontrak, m: IsiPermintaanMasukan, peminta: { nama: string; email: string }): IsiEmail {
  const sapa = m.namaPenerima.trim() ? `Halo <strong>${esc(awal(m.namaPenerima))}</strong>` : `Halo rekan ${esc(m.unit)}`;
  const tenggat = m.tenggat ? formatTanggal(m.tenggat) : "";
  const subjekBalas = `Masukan ${m.unit} untuk ${k.nomorPengajuan}: ${k.judul}`;
  const balas = `mailto:${peminta.email.trim()}?subject=${encodeURIComponent(subjekBalas)}`;
  const isi =
    paragraf(
      `${sapa}, <strong>${esc(peminta.nama)}</strong> dari tim Legal meminta masukan ${esc(m.unit)} untuk kontrak di bawah ini${tenggat ? `, paling lambat <strong>${esc(tenggat)}</strong>` : ""}. Anda tidak perlu masuk ke aplikasi: cukup balas ke ${esc(peminta.email)}.`,
    ) +
    kotakCatatan("Yang ditanyakan", m.pertanyaan, "peringatan") +
    `<tr><td style="padding:18px 32px 0 32px;">${infoKontrak(k, [
      { label: "Nilai", nilaiHtml: k.jenis.startsWith("MoU") ? "Tanpa nilai" : esc(formatUang(k.nilai, k.mataUang)) },
      ...(tenggat ? [{ label: "Tenggat jawaban", nilaiHtml: `<strong>${esc(tenggat)}</strong>` }] : []),
    ])}</td></tr>` +
    barisTombol(tombol("Balas ke Legal", balas), ...(m.tautanBerkas.trim() ? [tombol("Buka berkas", m.tautanBerkas.trim(), "kedua")] : [])) +
    paragraf(`<span style="font-size:13px;color:${WARNA.muted};">Berkas kontrak hanya dibagikan per berkas bila diperlukan. Mohon tidak meneruskan email ini ke luar perusahaan.</span>`);
  return {
    subjek: `[WiCon] Mohon masukan ${m.unit}: ${k.judul} (${k.nomorPengajuan})`,
    html: kerangka({
      pratinjau: `${peminta.nama} (Legal) meminta masukan ${m.unit}${tenggat ? ` paling lambat ${tenggat}` : ""}.`,
      label: `Permintaan masukan · ${m.unit}`,
      judul: "Legal meminta masukan Anda",
      nada: "accent",
      isi,
    }),
  };
}
