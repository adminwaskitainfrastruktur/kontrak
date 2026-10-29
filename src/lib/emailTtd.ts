// Template email tanda tangan digital: giliran menandatangani, pengingat, selesai, ditolak, dibatalkan.
// Memakai kerangka yang sama dengan email lain (emailKit). Tautan mengarah ke halaman Tanda Tangan, yang
// bisa dibuka penandatangan walau ia bukan pengaju atau Legal kontrak itu.
import { URL_APLIKASI } from "../config";
import { barisTombol, esc, infoKontrak, kerangka, kotakCatatan, paragraf, tombol } from "./emailKit";
import type { IsiEmail } from "./email";
import type { Penandatangan } from "./penandatangan";
import type { Kontrak } from "./types";

export const urlTandaTangan = (kontrakId: number): string => `${URL_APLIKASI}/#/tanda-tangan/${kontrakId}`;

const sebutan = (nama: string) => nama.trim().split(/\s+/)[0] || "Bapak/Ibu";
const judulEmail = (k: Pick<Kontrak, "judul" | "nomorPengajuan">) => `${k.judul} (${k.nomorPengajuan})`;
const kartu = (k: Kontrak, tambahan: { label: string; nilaiHtml: string }[] = []) => `<tr><td style="padding:18px 32px 0 32px;">${infoKontrak(k, tambahan)}</td></tr>`;

/** Giliran menandatangani (atau pengingat bila `pengingat`). */
export function emailGiliranTtd(k: Kontrak, p: Penandatangan, oleh: string, namaDokumen: string, opsi: { pengingat?: boolean; berurutan?: boolean } = {}): IsiEmail {
  const awalan = opsi.pengingat ? "Pengingat tanda tangan" : "Mohon tanda tangan";
  const isi =
    paragraf(
      `Yth. <strong>${esc(sebutan(p.nama))}</strong>, ${opsi.pengingat ? "dokumen berikut masih menunggu tanda tangan Anda." : `<strong>${esc(oleh)}</strong> meminta Anda menandatangani dokumen berikut sebagai <strong>${esc(p.peran)}</strong>.`}`,
    ) +
    kartu(k, [
      { label: "Dokumen", nilaiHtml: esc(namaDokumen) },
      { label: "Sebagai", nilaiHtml: esc(p.peran) },
    ]) +
    paragraf("Buka halaman Tanda Tangan, periksa dokumennya, lalu bubuhkan tanda tangan Anda dengan mencoret di layar atau mengunggah gambar tanda tangan. Bila ada yang tidak sesuai, Anda bisa menolak dengan alasan.") +
    barisTombol(tombol("Tanda tangani dokumen", urlTandaTangan(k.id))) +
    (opsi.berurutan ? kotakCatatan("Berurutan", "Penandatanganan dilakukan berurutan: Anda mendapat email ini karena sekarang giliran Anda.", "info") : "");
  return {
    subjek: `[WiCon] ${awalan}: ${judulEmail(k)}`,
    html: kerangka({ pratinjau: `${awalan}: ${k.judul}`, label: "Tanda tangan", judul: opsi.pengingat ? "Dokumen ini masih menunggu tanda tangan Anda" : "Giliran Anda menandatangani", isi }),
  };
}

/** Semua pihak sudah menandatangani. PDF final tersimpan di dokumen kontrak. */
export function emailTtdSelesai(k: Kontrak, penandatangan: readonly Penandatangan[], pdfTersimpan: boolean): IsiEmail {
  const daftar = penandatangan.map((p) => `<li style="margin:2px 0;">${esc(p.nama)} <span style="color:#667085;">(${esc(p.peran)})</span></li>`).join("");
  const isi =
    paragraf("Semua penandatangan sudah membubuhkan tanda tangannya. " + (pdfTersimpan ? "PDF final bertanda tangan sudah tersimpan di dokumen kontrak dengan jenis <strong>Kontrak Ditandatangani</strong>." : "PDF final belum berhasil disimpan otomatis; Legal bisa membuatnya ulang dari halaman Tanda Tangan.")) +
    `<tr><td style="padding:6px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;"><ul style="margin:0;padding-left:20px;">${daftar}</ul></td></tr>` +
    kartu(k) +
    barisTombol(tombol("Lihat dokumen bertanda tangan", urlTandaTangan(k.id)));
  return {
    subjek: `[WiCon] Selesai ditandatangani: ${judulEmail(k)}`,
    html: kerangka({ pratinjau: `${k.judul} sudah ditandatangani semua pihak.`, label: "Selesai", judul: "Dokumen sudah ditandatangani semua pihak", isi, nada: "success" }),
  };
}

export function emailTtdDitolak(k: Kontrak, penolak: string, alasan: string): IsiEmail {
  const isi =
    paragraf(`<strong>${esc(penolak)}</strong> menolak menandatangani dokumen ini. Permintaan tanda tangan dihentikan; Legal dapat memperbaiki dokumen lalu membuat permintaan baru.`) +
    kotakCatatan("Alasan penolakan", alasan.trim() || "(tidak ada alasan tertulis)", "bahaya") +
    kartu(k) +
    barisTombol(tombol("Buka halaman Tanda Tangan", urlTandaTangan(k.id), "kedua"));
  return {
    subjek: `[WiCon] Ditolak: ${judulEmail(k)}`,
    html: kerangka({ pratinjau: `${penolak} menolak menandatangani ${k.judul}.`, label: "Ditolak", judul: "Tanda tangan ditolak", isi, nada: "danger" }),
  };
}

export function emailTtdDibatalkan(k: Kontrak, oleh: string, alasan: string): IsiEmail {
  const isi =
    paragraf(`<strong>${esc(oleh)}</strong> membatalkan permintaan tanda tangan untuk dokumen ini. Anda tidak perlu menandatanganinya.`) +
    (alasan.trim() ? kotakCatatan("Alasan", alasan.trim(), "info") : "") +
    kartu(k);
  return {
    subjek: `[WiCon] Dibatalkan: ${judulEmail(k)}`,
    html: kerangka({ pratinjau: `Permintaan tanda tangan ${k.judul} dibatalkan.`, label: "Dibatalkan", judul: "Permintaan tanda tangan dibatalkan", isi, nada: "accent" }),
  };
}
