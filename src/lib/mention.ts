// Sebut @nama di diskusi kontrak dan tombol "Ingatkan" (U27). Logika murni; tampilannya di KotakDiskusi.
//
// Siapa yang boleh disebut: pengguna aktif yang berhak melihat kontrak, yaitu Legal dan Admin, serta Pengaju
// dari divisi yang sama atau pembuat kontrak (aturan bisaLihat di lib/alur dengan sesi semu tiap pengguna).
// Pengaju yang masuk otomatis tanpa terdaftar tetap bisa disebut lewat nama dan email di kolom kontrak.
// Pemantau tidak disebut karena tidak ikut berdiskusi. Orang yang menulis tidak menyebut dirinya sendiri.
import { adalahLegal, adalahPengajuKontrak, bisaLihat } from "./alur";
import { esc, infoKontrak, kerangka, kotakCatatan, paragraf, barisTombol, tombol, urlKontrak } from "./emailKit";
import type { Aktivitas, Kontrak, Pengguna, Sesi } from "./types";

/** Sesi tiruan untuk menanyakan hak seorang pengguna lewat aturan lib/alur. */
export function sesiSemu(p: Pengguna): Sesi {
  return { email: p.email.toLowerCase(), nama: p.nama, peran: p.peran, divisi: p.divisi, penggunaId: p.id };
}

const normal = (t: string) =>
  t
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Pengaju kontrak ini sebagai calon sebutan bila ia tidak terdaftar di list Pengguna Kontrak (akun kantor
 * yang masuk otomatis). Nama dan emailnya dari kolom kontrak; id 0 menandai bukan pengguna terdaftar.
 * Pengaju terdaftar yang dinonaktifkan tidak dimunculkan.
 */
export function pengajuTakTerdaftar(k: Kontrak, pengguna: readonly Pengguna[]): Pengguna | null {
  const email = k.pengajuEmail.trim().toLowerCase();
  if (!email || pengguna.some((p) => p.email.toLowerCase() === email)) return null;
  return { id: 0, nama: k.pengajuNama.trim() || email, email, divisi: k.divisi, peran: "Pengaju", aktif: true };
}

/** Pengguna yang boleh disebut di diskusi kontrak ini, urut nama. Termasuk pengajunya walau tidak terdaftar. */
export function kandidatSebut(k: Kontrak, pengguna: readonly Pengguna[], penulisEmail = ""): Pengguna[] {
  const saya = penulisEmail.toLowerCase();
  const sudah = new Set<string>();
  const tamu = pengajuTakTerdaftar(k, pengguna);
  return [...pengguna, ...(tamu ? [tamu] : [])]
    .filter((p) => {
      const email = p.email.toLowerCase();
      if (!p.aktif || !email || email === saya || sudah.has(email)) return false;
      if (p.peran === "Pemantau") return false;
      const s = sesiSemu(p);
      if (!bisaLihat(k, s)) return false;
      sudah.add(email);
      return true;
    })
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

/** Saring kandidat menurut ketikan setelah @: awal kata pada nama, atau awal alamat email. */
export function saringKandidat(kandidat: readonly Pengguna[], kueri: string, maks = 6): Pengguna[] {
  const q = normal(kueri.trim());
  if (!q) return kandidat.slice(0, maks);
  const skor = (p: Pengguna): number => {
    const nama = normal(p.nama);
    if (nama.startsWith(q)) return 0;
    if (nama.split(/\s+/).some((kata) => kata.startsWith(q))) return 1;
    if (normal(p.email).startsWith(q)) return 2;
    return -1;
  };
  return kandidat
    .map((p) => ({ p, s: skor(p) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.p.nama.localeCompare(b.p.nama, "id"))
    .slice(0, maks)
    .map((x) => x.p);
}

export interface Pemicu {
  /** Indeks karakter @ di teks. */
  awal: number;
  /** Ketikan setelah @ sampai kursor. */
  kueri: string;
}

/**
 * Apakah kursor sedang berada di sebutan yang diketik? @ harus di awal teks atau setelah spasi/tanda buka,
 * dan ketikannya paling banyak tiga kata tanpa baris baru (nama lengkap boleh berspasi).
 */
export function cariPemicu(teks: string, kursor: number): Pemicu | null {
  const sebelum = teks.slice(0, Math.max(0, Math.min(kursor, teks.length)));
  const m = /(^|[\s([{"'])@([^\s@][^@\n]{0,39})?$/.exec(sebelum);
  if (!m) return null;
  const kueri = m[2] ?? "";
  if (kueri.split(" ").length > 3 || / {2}/.test(kueri)) return null;
  return { awal: sebelum.length - kueri.length - 1, kueri };
}

/** Ganti "@ketikan" di posisi pemicu dengan "@Nama Lengkap ". Mengembalikan teks baru dan posisi kursor. */
export function sisipkanSebut(teks: string, pemicu: Pemicu, p: Pengguna): { teks: string; kursor: number } {
  const ujung = pemicu.awal + 1 + pemicu.kueri.length;
  const sisipan = `@${p.nama} `;
  const sesudah = teks.slice(ujung).replace(/^ /, "");
  return { teks: teks.slice(0, pemicu.awal) + sisipan + sesudah, kursor: pemicu.awal + sisipan.length };
}

const HURUF = /[\p{L}\p{N}]/u;

function posisiSebut(teks: string, nama: string): number[] {
  const t = teks.toLocaleLowerCase("id");
  const cari = `@${nama.toLocaleLowerCase("id")}`;
  const hasil: number[] = [];
  let i = t.indexOf(cari);
  while (i >= 0) {
    const sebelum = i === 0 ? "" : teks[i - 1]!;
    const sesudah = teks[i + cari.length] ?? "";
    if (!HURUF.test(sebelum) && !HURUF.test(sesudah)) hasil.push(i);
    i = t.indexOf(cari, i + 1);
  }
  return hasil;
}

/**
 * Email orang yang disebut di teks. Nama yang lebih panjang dicocokkan lebih dulu, jadi "@Budi Santoso"
 * tidak ikut menghitung "@Budi" sebagai orang lain.
 */
export function ekstrakDisebut(teks: string, kandidat: readonly Pengguna[]): string[] {
  const urut = [...kandidat].filter((p) => p.nama.trim()).sort((a, b) => b.nama.length - a.nama.length);
  const terpakai: [number, number][] = [];
  const hasil: string[] = [];
  for (const p of urut) {
    const panjang = p.nama.length + 1;
    const cocok = posisiSebut(teks, p.nama).filter((i) => !terpakai.some(([a, b]) => i < b && i + panjang > a));
    if (!cocok.length) continue;
    for (const i of cocok) terpakai.push([i, i + panjang]);
    const email = p.email.toLowerCase();
    if (!hasil.includes(email)) hasil.push(email);
  }
  return hasil;
}

export interface Potongan {
  teks: string;
  sebut: boolean;
}

/** Pecah teks menjadi potongan biasa dan sebutan, untuk disorot saat ditampilkan. */
export function pecahSebutan(teks: string, nama: readonly string[]): Potongan[] {
  const urut = [...new Set(nama.filter((n) => n.trim()))].sort((a, b) => b.length - a.length);
  const rentang: [number, number][] = [];
  for (const n of urut) {
    for (const i of posisiSebut(teks, n)) {
      const r: [number, number] = [i, i + n.length + 1];
      if (!rentang.some(([a, b]) => r[0] < b && r[1] > a)) rentang.push(r);
    }
  }
  rentang.sort((a, b) => a[0] - b[0]);
  const hasil: Potongan[] = [];
  let pos = 0;
  for (const [a, b] of rentang) {
    if (a > pos) hasil.push({ teks: teks.slice(pos, a), sebut: false });
    hasil.push({ teks: teks.slice(a, b), sebut: true });
    pos = b;
  }
  if (pos < teks.length) hasil.push({ teks: teks.slice(pos), sebut: false });
  return hasil;
}

// --- Ingatkan --------------------------------------------------------------------------------

export const JEDA_INGATKAN_MS = 24 * 3_600_000;

export interface AturanIngatkan {
  /** Siapa yang mengingatkan siapa. */
  arah: "legal-ke-pengaju" | "pengaju-ke-legal";
  label: string;
  keterangan: string;
}

/** Tombol Ingatkan untuk pengguna ini pada kontrak ini, atau null bila tidak tersedia. */
/** `ruang` "pengguna": Admin/Legal di Ruang Pengguna diperlakukan seperti pengaju (tanpa kontrol Legal). */
export function aturanIngatkan(k: Kontrak, sesi: Sesi, ruang: "admin" | "pengguna" = "admin"): AturanIngatkan | null {
  if (sesi.peran === "Pemantau") return null;
  const legal = adalahLegal(sesi) && ruang === "admin";
  if (k.status === "Perlu Revisi" && legal) {
    return { arah: "legal-ke-pengaju", label: "Ingatkan pengaju", keterangan: "Kirim pengingat ke pengaju bahwa revisi masih ditunggu." };
  }
  if ((k.status === "Diajukan" || k.status === "Review Legal") && adalahPengajuKontrak(k, sesi) && !legal) {
    return {
      arah: "pengaju-ke-legal",
      label: "Tanyakan progres",
      keterangan: k.picLegalEmail ? `Tanyakan kabar terbaru ke ${k.picLegalNama || "PIC Legal"}.` : "Tanyakan kabar terbaru ke tim Legal.",
    };
  }
  return null;
}

/** Penerima pengingat, diturunkan otomatis. Pengirim tidak pernah menjadi penerimanya sendiri. */
export function penerimaIngatkan(k: Kontrak, aturan: AturanIngatkan, pengguna: readonly Pengguna[], pengirimEmail: string): string[] {
  const saya = pengirimEmail.toLowerCase();
  let daftar: string[];
  if (aturan.arah === "legal-ke-pengaju") {
    daftar = [k.pengajuEmail];
  } else if (k.picLegalEmail) {
    daftar = [k.picLegalEmail];
  } else {
    daftar = pengguna.filter((p) => p.aktif && (p.peran === "Legal" || p.peran === "Admin")).map((p) => p.email);
  }
  return [...new Set(daftar.map((e) => e.trim().toLowerCase()).filter((e) => e && e !== saya))];
}

/** Pengingat terakhir pada kontrak ini dan kapan boleh mengingatkan lagi (sekali per 24 jam per kontrak). */
export function jedaIngatkan(aktivitas: readonly Aktivitas[], sekarang: number = Date.now()): { boleh: boolean; terakhir: Aktivitas | null; bolehLagi: number | null } {
  const terakhir = aktivitas.filter((a) => a.jenis === "Pengingat").sort((a, b) => b.waktu.localeCompare(a.waktu))[0] ?? null;
  if (!terakhir) return { boleh: true, terakhir: null, bolehLagi: null };
  const bolehLagi = Date.parse(terakhir.waktu) + JEDA_INGATKAN_MS;
  if (Number.isNaN(bolehLagi)) return { boleh: true, terakhir, bolehLagi: null };
  return { boleh: sekarang >= bolehLagi, terakhir, bolehLagi };
}

// --- Email ------------------------------------------------------------------------------------

export interface IsiEmailSederhana {
  subjek: string;
  html: string;
}

/** Ruang tujuan tautan: Pengaju hanya punya Ruang Pengguna. */
export const ruangPenerima = (p: Pengguna | undefined): "pengaju" | "legal" => (p && p.peran !== "Pengaju" ? "legal" : "pengaju");

const potong = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);

/** Email untuk orang yang disebut di diskusi. */
export function emailSebutan(k: Kontrak, olehNama: string, pesan: string, untuk: "pengaju" | "legal"): IsiEmailSederhana {
  const isi =
    paragraf(`<strong>${esc(olehNama)}</strong> menyebut Anda di diskusi kontrak <strong>${esc(k.judul)}</strong>.`) +
    kotakCatatan(`Pesan dari ${olehNama}`, potong(pesan, 1200), "info") +
    `<tr><td style="padding:18px 32px 0 32px;">${infoKontrak(k)}</td></tr>` +
    barisTombol(tombol("Balas di diskusi", urlKontrak(k.id, untuk)));
  return {
    subjek: `[WiCon] ${olehNama} menyebut Anda: ${k.judul} (${k.nomorPengajuan})`,
    html: kerangka({ pratinjau: `${olehNama}: ${potong(pesan.replace(/\s+/g, " "), 120)}`, label: "Disebut di diskusi", judul: "Anda disebut di diskusi kontrak", isi }),
  };
}

/** Email pengingat dari tombol Ingatkan / Tanyakan progres. */
export function emailPengingat(k: Kontrak, olehNama: string, aturan: AturanIngatkan, catatan: string): IsiEmailSederhana {
  const keLegal = aturan.arah === "pengaju-ke-legal";
  const pembuka = keLegal
    ? `<strong>${esc(olehNama)}</strong> menanyakan perkembangan pengajuan ini. Status saat ini <strong>${esc(k.status)}</strong>. Mohon beri kabar singkat di diskusi kontrak.`
    : `<strong>${esc(olehNama)}</strong> mengingatkan bahwa revisi untuk pengajuan ini masih ditunggu. Perbaiki sesuai catatan Legal, unggah dokumennya, lalu tekan <strong>Kirim Ulang ke Legal</strong>.`;
  const isi =
    paragraf(pembuka) +
    (catatan.trim() ? kotakCatatan(`Catatan dari ${olehNama}`, potong(catatan.trim(), 1200), keLegal ? "info" : "peringatan") : "") +
    `<tr><td style="padding:18px 32px 0 32px;">${infoKontrak(k)}</td></tr>` +
    barisTombol(tombol(keLegal ? "Buka kontrak" : "Buka dan revisi", urlKontrak(k.id, keLegal ? "legal" : "pengaju")));
  return {
    subjek: keLegal ? `[WiCon] Menanyakan progres: ${k.judul} (${k.nomorPengajuan})` : `[WiCon] Pengingat revisi: ${k.judul} (${k.nomorPengajuan})`,
    html: kerangka({
      pratinjau: keLegal ? `${olehNama} menanyakan kabar ${k.judul}.` : `Revisi ${k.judul} masih ditunggu Legal.`,
      label: "Pengingat",
      judul: keLegal ? "Ada yang menanyakan progres" : "Revisi Anda masih ditunggu",
      nada: "accent",
      isi,
    }),
  };
}
