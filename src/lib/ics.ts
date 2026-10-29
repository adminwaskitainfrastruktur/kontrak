// Berkas kalender .ics (RFC 5545) untuk tanggal penting kontrak, misalnya tanggal berakhir (U24).
// Acara seharian dengan UID stabil: mengimpor ulang berkas untuk kontrak yang sama memperbarui acara lama
// di Outlook, bukan menggandakannya. Baris dipisah CRLF dan dilipat per 75 oktet (UTF-8), sesuai standar.
//
// Catatan Outlook: Outlook desktop hanya memakai alarm pertama. Karena itu alarm diurutkan dari yang
// paling awal (H-terbesar), supaya pengingat yang paling berguna yang dipakai.
import type { Kontrak, Ymd } from "./types";

export interface OpsiIcs {
  judul: string;
  /** Tanggal acara, YYYY-MM-DD. */
  tanggal: Ymd;
  deskripsi?: string;
  tautan?: string;
  /** H-sekian untuk alarm; 0 = pada hari itu. Alarm berbunyi pukul 09.00 waktu setempat. */
  alarmHari?: readonly number[];
  /** Pengenal stabil. Sama untuk acara yang sama (mis. uidKontrak(id)). Bila kosong, diturunkan dari judul dan tanggal. */
  uid?: string;
  /** Naikkan bila acara yang sama diterbitkan ulang dengan isi berbeda. */
  urutan?: number;
  /** Waktu pembuatan untuk DTSTAMP; bisa diatur untuk pengujian. */
  sekarang?: Date;
}

const DOMAIN_UID = "wicon.waskitainfrastruktur.co.id";

export function uidKontrak(id: number, acara = "berakhir"): string {
  return `kontrak-${id}-${acara}@${DOMAIN_UID}`;
}

/** Escape teks untuk properti TEXT: \ ; , dan baris baru. */
export function escapeIcs(teks: string): string {
  return teks
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

const enkoder = new TextEncoder();

/** Lipat satu baris logis menjadi baris fisik paling panjang 75 oktet, tanpa memotong karakter multi-byte. */
export function lipatBaris(baris: string): string {
  if (enkoder.encode(baris).length <= 75) return baris;
  const hasil: string[] = [];
  let kini = "";
  let oktet = 0;
  for (const ch of baris) {
    const n = enkoder.encode(ch).length;
    if (oktet + n > 75) {
      hasil.push(kini);
      // Baris lanjutan diawali satu spasi, yang ikut dihitung dalam batas 75 oktet.
      kini = " ";
      oktet = 1;
    }
    kini += ch;
    oktet += n;
  }
  hasil.push(kini);
  return hasil.join("\r\n");
}

const ymdIcs = (ymd: Ymd) => ymd.replace(/-/g, "");

function tambahSatuHari(ymd: Ymd): Ymd {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function stempelUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Pemicu alarm relatif ke awal acara seharian (tengah malam), dibunyikan pukul 09.00. */
export function pemicuAlarm(hari: number): string {
  if (hari <= 0) return "PT9H";
  if (hari === 1) return "-PT15H";
  return `-P${hari - 1}DT15H`;
}

function hashTeks(t: string): string {
  let h = 2166136261;
  for (const c of t) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

const POLA_YMD = /^\d{4}-\d{2}-\d{2}$/;

export function buatIcs(o: OpsiIcs): string {
  if (!POLA_YMD.test(o.tanggal) || Number.isNaN(Date.parse(`${o.tanggal}T00:00:00Z`))) {
    throw new Error(`Tanggal acara tidak sah: ${o.tanggal}`);
  }
  const uid = o.uid?.trim() || `${hashTeks(`${o.judul}|${o.tanggal}`)}@${DOMAIN_UID}`;
  const deskripsi = [o.deskripsi?.trim(), o.tautan ? `Buka di WiCon: ${o.tautan}` : ""].filter(Boolean).join("\n\n");
  const alarm = [...new Set((o.alarmHari ?? []).filter((h) => Number.isInteger(h) && h >= 0))].sort((a, b) => b - a);

  const baris = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PT Waskita Karya Infrastruktur//WiCon//ID",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stempelUtc(o.sekarang ?? new Date())}`,
    `SEQUENCE:${Math.max(0, Math.floor(o.urutan ?? 0))}`,
    `DTSTART;VALUE=DATE:${ymdIcs(o.tanggal)}`,
    `DTEND;VALUE=DATE:${ymdIcs(tambahSatuHari(o.tanggal))}`,
    `SUMMARY:${escapeIcs(o.judul)}`,
    ...(deskripsi ? [`DESCRIPTION:${escapeIcs(deskripsi)}`] : []),
    ...(o.tautan ? [`URL:${o.tautan}`] : []),
    "TRANSP:TRANSPARENT",
    "X-MICROSOFT-CDO-ALLDAYEVENT:TRUE",
    "X-MICROSOFT-CDO-BUSYSTATUS:FREE",
    ...alarm.flatMap((h) => [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcs(h === 0 ? `Hari ini: ${o.judul}` : `H-${h}: ${o.judul}`)}`,
      `TRIGGER:${pemicuAlarm(h)}`,
      "END:VALARM",
    ]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return baris.map(lipatBaris).join("\r\n") + "\r\n";
}

/** Nama berkas aman untuk sistem berkas: huruf, angka, dan tanda hubung. */
export function namaBerkasIcs(judul: string): string {
  const dasar = judul
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${dasar || "acara"}.ics`;
}

/** Opsi .ics untuk tanggal berakhir kontrak (memperhitungkan addendum lewat berakhirEfektif). null bila tanpa tanggal. */
export function opsiIcsBerakhir(k: Kontrak, o: { tautan?: string; alarmHari?: readonly number[] } = {}): OpsiIcs | null {
  const tanggal = k.berakhirEfektif ?? k.tanggalBerakhir;
  if (!tanggal) return null;
  const nomor = k.nomorKontrak || k.nomorPengajuan;
  const rincian = [
    `Kontrak: ${k.judul}`,
    `Nomor: ${nomor}`,
    k.mitra ? `Mitra: ${k.mitra}` : "",
    k.perpanjanganOtomatis
      ? `Klausul perpanjangan otomatis${k.masaPemberitahuanHari ? `: beri tahu mitra paling lambat ${k.masaPemberitahuanHari} hari sebelum tanggal ini bila tidak ingin diperpanjang` : ""}.`
      : "Siapkan addendum perpanjangan atau penutupan sebelum tanggal ini.",
  ].filter(Boolean);
  return {
    judul: `Kontrak berakhir: ${k.judul} (${nomor})`,
    tanggal,
    deskripsi: rincian.join("\n"),
    tautan: o.tautan,
    alarmHari: o.alarmHari ?? [30, 7],
    uid: uidKontrak(k.id, "berakhir"),
  };
}

/** Picu unduhan berkas .ics di peramban. */
export function unduhIcs(o: OpsiIcs, namaBerkas: string = namaBerkasIcs(o.judul)): void {
  const url = URL.createObjectURL(new Blob([buatIcs(o)], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = namaBerkas;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
