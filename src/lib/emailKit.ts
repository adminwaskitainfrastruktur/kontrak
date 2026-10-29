// Potongan HTML untuk email Outlook. Aturan yang dijaga supaya tampil sama di Outlook desktop (mesin Word),
// Outlook web, dan Outlook ponsel:
//   - hanya <table> untuk tata letak, gaya inline, tanpa flex/grid/gap/CSS variable;
//   - warna latar dipasang dua kali (atribut bgcolor dan style background-color);
//   - lebar dalam angka piksel, bukan persen/rem, dan tinggi baris eksplisit;
//   - tanpa gambar eksternal (Outlook memblokirnya secara bawaan), ikon dibuat dari teks dan sel berwarna;
//   - tombol memakai VML (v:roundrect) untuk Outlook desktop dan <a> bergaya untuk yang lain;
//   - sudut membulat (border-radius) hanya hiasan: di Outlook desktop jadi kotak, tetap terbaca.
// Semua teks dari pengguna lewat esc() agar tidak merusak HTML.

import { URL_APLIKASI } from "../config";
import { formatJam, formatMasuk, formatMasukRingkas, lamaSejak } from "./format";
import { DAFTAR_STATUS_RINGKAS, statusRingkas, type StatusRingkas } from "./antrean";
import type { Kontrak, Prioritas } from "./types";

export const WARNA = {
  navy: "#0b1f3a",
  navy2: "#12315c",
  brand: "#0a7f79",
  brandSoft: "#e3f4f2",
  accent: "#e5a62c",
  accentSoft: "#fdf3dc",
  accentInk: "#7a5200",
  ink: "#1f2a37",
  muted: "#64748b",
  line: "#e2e8f0",
  bg: "#f2f5f9",
  surface: "#ffffff",
  raised: "#f8fafc",
  success: "#15803d",
  successSoft: "#e3f6e8",
  danger: "#b91c1c",
  dangerSoft: "#fde8e8",
  info: "#2563eb",
  infoSoft: "#e5edff",
} as const;

const FONT = "'Segoe UI',Calibri,Arial,Helvetica,sans-serif";

export function esc(teks: string | number | null | undefined): string {
  return String(teks ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Tautan ke halaman kontrak, di ruang yang sesuai dengan penerimanya. */
export function urlKontrak(id: number, untuk: "pengaju" | "legal"): string {
  return untuk === "pengaju" ? `${URL_APLIKASI}/#/saya/kontrak/${id}` : `${URL_APLIKASI}/#/kontrak/${id}`;
}
/** Tautan "Ambil sebagai PIC" untuk Legal (U23c): halaman detail meminta konfirmasi lebih dulu. */
export const urlAmbilPic = (id: number) => `${URL_APLIKASI}/#/kontrak/${id}?aksi=ambil-pic`;
export const urlMonitoring = () => `${URL_APLIKASI}/#/saya`;
export const urlAntreanLegal = () => `${URL_APLIKASI}/#/`;

// --- Elemen dasar --------------------------------------------------------------------

export function pil(teks: string, warna: { bg: string; ink: string }): string {
  return `<span style="display:inline-block;background-color:${warna.bg};color:${warna.ink};font-family:${FONT};font-size:12px;line-height:18px;font-weight:700;padding:2px 10px;border-radius:12px;white-space:nowrap;">${esc(teks)}</span>`;
}

export function pilPrioritas(p: Prioritas): string {
  if (p === "Mendesak") return pil("Mendesak", { bg: WARNA.dangerSoft, ink: WARNA.danger });
  if (p === "Tinggi") return pil("Prioritas tinggi", { bg: WARNA.accentSoft, ink: WARNA.accentInk });
  return pil("Normal", { bg: WARNA.raised, ink: WARNA.muted });
}

/** Tombol yang tampil benar di Outlook desktop (VML) dan klien lain. */
export function tombol(label: string, url: string, gaya: "utama" | "kedua" = "utama"): string {
  const bg = gaya === "utama" ? WARNA.brand : WARNA.surface;
  const ink = gaya === "utama" ? "#ffffff" : WARNA.brand;
  const garis = gaya === "utama" ? WARNA.brand : WARNA.brand;
  return `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(url)}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="18%" strokecolor="${garis}" fillcolor="${bg}"><w:anchorlock/><center style="color:${ink};font-family:${FONT};font-size:15px;font-weight:bold;">${esc(label)}</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href="${esc(url)}" target="_blank" style="display:inline-block;background-color:${bg};border:2px solid ${garis};color:${ink};font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;text-decoration:none;padding:10px 26px;border-radius:8px;mso-hide:all;">${esc(label)}</a><!--<![endif]-->`;
}

/** Baris label-nilai di dalam kartu info. */
export function barisInfo(label: string, nilaiHtml: string, ujung = false): string {
  return `<tr><td width="150" valign="top" style="padding:9px 12px 9px 0;${ujung ? "" : `border-bottom:1px solid ${WARNA.line};`}font-family:${FONT};font-size:12px;line-height:18px;color:${WARNA.muted};font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">${esc(label)}</td><td valign="top" style="padding:9px 0;${ujung ? "" : `border-bottom:1px solid ${WARNA.line};`}font-family:${FONT};font-size:14px;line-height:20px;color:${WARNA.ink};">${nilaiHtml}</td></tr>`;
}

export function kartuInfo(baris: { label: string; nilaiHtml: string }[]): string {
  const isi = baris.map((b, i) => barisInfo(b.label, b.nilaiHtml, i === baris.length - 1)).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${WARNA.line};border-radius:10px;background-color:${WARNA.raised};" bgcolor="${WARNA.raised}"><tr><td style="padding:6px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${isi}</table></td></tr></table>`;
}

/** Info utama sebuah kontrak, dipakai hampir semua email. */
export function infoKontrak(k: Kontrak, tambahan: { label: string; nilaiHtml: string }[] = []): string {
  return kartuInfo([
    { label: "Nomor", nilaiHtml: `<span style="font-family:Consolas,'Courier New',monospace;font-weight:700;">${esc(k.nomorPengajuan)}</span>` },
    { label: "Judul", nilaiHtml: `<strong>${esc(k.judul)}</strong>` },
    { label: "Mitra", nilaiHtml: esc(k.mitra || "-") },
    { label: "Jenis", nilaiHtml: esc(k.jenis) },
    {
      label: "Masuk",
      nilaiHtml: `<strong>${esc(formatMasuk(k.tanggalDiajukan ?? k.dibuat))}</strong>`,
    },
    { label: "Prioritas", nilaiHtml: pilPrioritas(k.prioritas) },
    ...tambahan,
  ]);
}

// --- Posisi antrean ------------------------------------------------------------------

/** Angka posisi besar, dengan keterangannya. */
export function kartuPosisi(posisi: number, total: number, keterangan: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:10px;background-color:${WARNA.accentSoft};" bgcolor="${WARNA.accentSoft}"><tr>
<td width="96" align="center" valign="middle" style="padding:16px 8px 16px 18px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="72" height="72" align="center" valign="middle" bgcolor="${WARNA.brand}" style="background-color:${WARNA.brand};border-radius:14px;font-family:${FONT};font-size:34px;line-height:72px;font-weight:800;color:#ffffff;">${posisi}</td></tr></table></td>
<td valign="middle" style="padding:16px 18px 16px 8px;font-family:${FONT};"><div style="font-size:17px;line-height:24px;font-weight:800;color:${WARNA.ink};">Urutan ke-${posisi} dari ${total} pengajuan</div><div style="font-size:13px;line-height:20px;color:${WARNA.accentInk};">${esc(keterangan)}</div></td></tr></table>`;
}

/**
 * Jalur antrean: kotak "Legal" di depan, lalu urutan pengajuan. Milik penerima disorot hijau-teal.
 * Isi pengajuan orang lain tidak ditampilkan, hanya nomor urut dan tanda prioritasnya.
 */
export function jalurAntrean(antrean: Kontrak[], sorotId: number[] = [], maks = 9): string {
  const sorot = new Set(sorotId);
  const idx = new Set<number>();
  for (let i = 0; i < Math.min(antrean.length, maks); i++) idx.add(i);
  antrean.forEach((k, i) => sorot.has(k.id) && idx.add(i));
  const urut = [...idx].sort((a, b) => a - b);

  const sel: string[] = [];
  sel.push(`<td align="center" valign="bottom" style="padding:0 6px 0 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="46" height="46" align="center" valign="middle" bgcolor="${WARNA.navy}" style="background-color:${WARNA.navy};border-radius:10px;font-family:${FONT};font-size:11px;line-height:46px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">LEGAL</td></tr></table></td>`);
  let sebelum = -1;
  for (const i of urut) {
    if (i - sebelum > 1) sel.push(`<td align="center" valign="middle" style="padding:0 6px;font-family:${FONT};font-size:12px;color:${WARNA.muted};font-weight:700;white-space:nowrap;">+${i - sebelum - 1}</td>`);
    const k = antrean[i]!;
    const saya = sorot.has(k.id);
    const tanda = k.prioritas === "Mendesak" ? WARNA.danger : k.prioritas === "Tinggi" ? WARNA.accent : "";
    const kotak = saya
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="46" height="54" align="center" valign="middle" bgcolor="${WARNA.brand}" style="background-color:${WARNA.brand};border:2px solid ${WARNA.navy};border-radius:10px;font-family:${FONT};font-size:20px;line-height:50px;font-weight:800;color:#ffffff;">${i + 1}</td></tr></table><div style="font-family:${FONT};font-size:11px;line-height:16px;font-weight:800;color:${WARNA.brand};padding-top:3px;">ANDA</div>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="40" height="46" align="center" valign="middle" bgcolor="${WARNA.line}" style="background-color:${WARNA.line};${tanda ? `border-bottom:4px solid ${tanda};` : ""}border-radius:8px;font-family:${FONT};font-size:16px;line-height:44px;font-weight:700;color:${WARNA.muted};">${i + 1}</td></tr></table>`;
    sel.push(`<td align="center" valign="bottom" style="padding:0 4px;">${kotak}</td>`);
    sebelum = i;
  }
  if (antrean.length - 1 > sebelum) sel.push(`<td align="center" valign="middle" style="padding:0 6px;font-family:${FONT};font-size:12px;color:${WARNA.muted};font-weight:700;white-space:nowrap;">+${antrean.length - 1 - sebelum}</td>`);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${sel.join("")}</tr></table>`;
}

export function legendaAntrean(): string {
  return `<div style="font-family:${FONT};font-size:11px;line-height:18px;color:${WARNA.muted};padding-top:8px;">Diurutkan menurut prioritas, lalu waktu masuk. Garis <span style="color:${WARNA.danger};font-weight:700;">merah</span> = mendesak, <span style="color:${WARNA.accent};font-weight:700;">kuning</span> = prioritas tinggi.</div>`;
}

// --- Pelacak tiga langkah (Antri, Proses, Selesai) -------------------------------------

export function pelacak(k: Kontrak): string {
  const r = statusRingkas(k.status);
  const kini = DAFTAR_STATUS_RINGKAS.indexOf(r);
  const gagal = k.status === "Ditolak" || k.status === "Dibatalkan";
  const langkah = (l: StatusRingkas, i: number) => {
    const lewat = i < kini || (i === kini && r === "Selesai");
    const sekarang = i === kini && r !== "Selesai";
    const warna = lewat ? (l === "Selesai" && gagal ? (k.status === "Ditolak" ? WARNA.danger : WARNA.muted) : WARNA.brand) : sekarang ? WARNA.accent : WARNA.line;
    const ink = lewat || sekarang ? "#ffffff" : WARNA.muted;
    const simbol = lewat ? (l === "Selesai" && gagal ? "✕" : "✓") : String(i + 1);
    const label = l === "Selesai" && gagal ? k.status : l;
    return `<td width="64" align="center" valign="top"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="36" height="36" align="center" valign="middle" bgcolor="${warna}" style="background-color:${warna};border-radius:18px;font-family:${FONT};font-size:16px;line-height:36px;font-weight:800;color:${ink};">${simbol}</td></tr></table><div style="font-family:${FONT};font-size:12px;line-height:18px;padding-top:5px;font-weight:${lewat || sekarang ? 800 : 600};color:${lewat || sekarang ? WARNA.ink : WARNA.muted};">${esc(label)}</div></td>`;
  };
  const garis = (aktif: boolean) => `<td valign="top" style="padding-top:16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="4" bgcolor="${aktif ? WARNA.brand : WARNA.line}" style="background-color:${aktif ? WARNA.brand : WARNA.line};font-size:0;line-height:0;">&nbsp;</td></tr></table></td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${langkah("Antri", 0)}${garis(kini > 0)}${langkah("Proses", 1)}${garis(kini > 1 || (kini === 1 && r === "Selesai"))}${langkah("Selesai", 2)}</tr></table>`;
}

// --- Tabel antrean ringkas (untuk email Legal) -----------------------------------------

export function tabelAntrean(antrean: Kontrak[], sorotId: number | null, maks = 6, sampai: number = Date.now()): string {
  const baris = antrean.slice(0, maks).map((k, i) => {
    const saya = k.id === sorotId;
    const bg = saya ? WARNA.brandSoft : i % 2 ? WARNA.raised : WARNA.surface;
    const sel = `padding:9px 10px;border-bottom:1px solid ${WARNA.line};font-family:${FONT};font-size:13px;line-height:18px;color:${WARNA.ink};`;
    return `<tr bgcolor="${bg}" style="background-color:${bg};"><td width="30" align="center" style="${sel}font-weight:800;color:${saya ? WARNA.brand : WARNA.muted};">${i + 1}</td><td style="${sel}"><div style="font-weight:700;">${esc(k.judul)}</div><div style="font-size:12px;color:${WARNA.muted};"><span style="font-family:Consolas,'Courier New',monospace;">${esc(k.nomorPengajuan)}</span> · ${esc(k.mitra || "-")}</div></td><td width="92" style="${sel}">${pilPrioritas(k.prioritas)}</td><td width="140" align="right" style="${sel}font-size:12px;white-space:nowrap;"><div>${esc(formatMasukRingkas(k.tanggalDiajukan ?? k.dibuat))}</div><div style="color:${WARNA.muted};">menunggu ${esc(lamaSejak(k.tanggalDiajukan ?? k.dibuat, sampai))}</div></td></tr>`;
  });
  const kepala = (t: string, lebar?: number, rata = "left") => `<td${lebar ? ` width="${lebar}"` : ""} align="${rata}" style="padding:8px 10px;background-color:${WARNA.navy};font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;" bgcolor="${WARNA.navy}">${t}</td>`;
  const sisa = antrean.length - maks;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${WARNA.line};border-radius:10px;"><tr>${kepala("#", 30, "center")}${kepala("Pengajuan")}${kepala("Prioritas", 92)}${kepala("Masuk", 140, "right")}</tr>${baris.join("")}${sisa > 0 ? `<tr><td colspan="4" align="center" style="padding:9px 10px;font-family:${FONT};font-size:12px;color:${WARNA.muted};background-color:${WARNA.raised};" bgcolor="${WARNA.raised}">+ ${sisa} pengajuan lainnya di antrean</td></tr>` : ""}</table>`;
}

// --- Kerangka halaman -------------------------------------------------------------------

export function seksi(judul: string, isi: string): string {
  return `<tr><td style="padding:22px 32px 0 32px;"><div style="font-family:${FONT};font-size:13px;line-height:18px;font-weight:800;color:${WARNA.brand};text-transform:uppercase;letter-spacing:0.8px;padding-bottom:10px;">${esc(judul)}</div>${isi}</td></tr>`;
}

export function paragraf(teksHtml: string): string {
  return `<tr><td style="padding:14px 32px 0 32px;font-family:${FONT};font-size:15px;line-height:24px;color:${WARNA.ink};">${teksHtml}</td></tr>`;
}

export function kotakCatatan(judul: string, teks: string, nada: "info" | "peringatan" | "bahaya" = "info"): string {
  const w = nada === "bahaya" ? { bg: WARNA.dangerSoft, garis: WARNA.danger, ink: "#7f1d1d" } : nada === "peringatan" ? { bg: WARNA.accentSoft, garis: WARNA.accent, ink: WARNA.accentInk } : { bg: WARNA.infoSoft, garis: WARNA.info, ink: "#1e3a8a" };
  return `<tr><td style="padding:18px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="5" bgcolor="${w.garis}" style="background-color:${w.garis};font-size:0;line-height:0;">&nbsp;</td><td bgcolor="${w.bg}" style="background-color:${w.bg};padding:12px 16px;font-family:${FONT};"><div style="font-size:12px;line-height:18px;font-weight:800;color:${w.ink};text-transform:uppercase;letter-spacing:0.5px;">${esc(judul)}</div><div style="font-size:14px;line-height:22px;color:${w.ink};white-space:pre-wrap;">${esc(teks)}</div></td></tr></table></td></tr>`;
}

export function barisTombol(...tombolHtml: string[]): string {
  return `<tr><td style="padding:26px 32px 8px 32px;">${tombolHtml.map((t) => `<span style="display:inline-block;padding:0 10px 10px 0;">${t}</span>`).join("")}</td></tr>`;
}

export interface OpsiKerangka {
  /** Teks pratinjau di daftar kotak masuk (tidak tampil di badan email). */
  pratinjau: string;
  /** Label kecil di atas judul, mis. "Pengajuan baru". */
  label: string;
  judul: string;
  /** Isi: deretan <tr> dari seksi(), paragraf(), kotakCatatan(), barisTombol(). */
  isi: string;
  /** Warna pita judul. */
  nada?: "brand" | "accent" | "success" | "danger";
}

export function kerangka(o: OpsiKerangka): string {
  const pita = { brand: WARNA.brand, accent: WARNA.accent, success: WARNA.success, danger: WARNA.danger }[o.nada ?? "brand"];
  return `<!DOCTYPE html>
<html lang="id" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(o.judul)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
  img{border:0;line-height:100%;outline:none;text-decoration:none;}
  a{color:${WARNA.brand};}
  @media only screen and (max-width:640px){
    .lebar{width:100%!important;}
    .pad{padding-left:18px!important;padding-right:18px!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${WARNA.bg};" bgcolor="${WARNA.bg}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${WARNA.bg};">${esc(o.pratinjau)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${WARNA.bg}" style="background-color:${WARNA.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="lebar" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;">
  <tr><td bgcolor="${WARNA.navy}" style="background-color:${WARNA.navy};border-radius:14px 14px 0 0;padding:22px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle" width="44"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="40" height="40" align="center" valign="middle" bgcolor="${WARNA.brand}" style="background-color:${WARNA.brand};border-radius:10px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:40px;font-weight:700;color:#ffffff;">W</td></tr></table></td>
      <td valign="middle" style="padding-left:12px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:26px;color:#ffffff;font-weight:700;">WiCon<div style="font-family:${FONT};font-size:11px;line-height:16px;font-weight:600;color:#9db4d3;letter-spacing:1.2px;text-transform:uppercase;">Contract Management &amp; Dashboard</div></td>
    </tr></table>
  </td></tr>
  <tr><td height="5" bgcolor="${pita}" style="background-color:${pita};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td bgcolor="${WARNA.surface}" style="background-color:${WARNA.surface};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="pad" style="padding:28px 32px 0 32px;"><div style="font-family:${FONT};font-size:12px;line-height:18px;font-weight:800;color:${pita};text-transform:uppercase;letter-spacing:1px;">${esc(o.label)}</div><div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:34px;color:${WARNA.navy};font-weight:700;padding-top:4px;">${esc(o.judul)}</div></td></tr>
      ${o.isi}
      <tr><td style="padding:18px 32px 28px 32px;">&nbsp;</td></tr>
    </table>
  </td></tr>
  <tr><td bgcolor="${WARNA.raised}" style="background-color:${WARNA.raised};border-top:1px solid ${WARNA.line};border-radius:0 0 14px 14px;padding:16px 32px;font-family:${FONT};font-size:12px;line-height:18px;color:${WARNA.muted};">Email otomatis dari <strong>WiCon</strong>, PT Waskita Karya Infrastruktur. Mohon tidak membalas email ini. Waktu ditampilkan dalam WIB. Pertanyaan seputar kontrak? Tulis di kolom diskusi pada halaman kontrak.</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

export { formatJam, formatMasuk };
