// Tanda tangan digital kontrak (meniru alur dokumen bertanda tangan di aplikasi stok), disimpan di list
// "Tanda Tangan Kontrak": satu baris per permintaan, isinya JSON di kolom Isi (lihat lib/penandatangan.ts).
//
// Urutan menulis sengaja mengikuti aplikasi stok: gambar tanda tangan (bukti PNG) disimpan LEBIH DULU di
// subfolder "TTD" kontrak, baru status di list diperbarui, sehingga tidak pernah ada tanda tangan "sah" tanpa
// buktinya. PDF final dibuat sesudahnya; bila gagal, tanda tangannya tetap sah dan PDF bisa dibuat ulang.
//
// Dokumen yang ditandatangani dikunci dengan SHA-256 saat permintaan dibuat; sebelum menandatangani, isi
// dokumen dibaca ulang dan dibandingkan, jadi dokumen yang berubah diam-diam tidak bisa ikut disahkan.
import { GRAPH_SITE_ID, LIST_ID, URL_APLIKASI } from "../config";
import { BATAS_UKURAN_BERKAS } from "../lib/jenisBerkas";
import { GraphError, graph, graphSemua } from "../lib/graph";
import { galatSementara, ulangiPenulisan } from "../lib/cobaUlang";
import { emailGiliranTtd, emailTtdDibatalkan, emailTtdDitolak, emailTtdSelesai } from "../lib/emailTtd";
import { buatPdfTtd } from "../lib/pdfTtd";
import {
  bahanJejak,
  bolehAksi,
  capWaktu,
  huruf,
  langkahUntukSaya,
  masihBerjalan,
  namaBerkasTtd,
  periksaPenandatangan,
  sedangGiliran,
  statusPermintaan,
  sudahTtd,
  susunPenandatangan,
  type IsiPermintaan,
  type MasukanPenandatangan,
  type PelakuTtd,
  type Penandatangan,
  type PermintaanTtd,
  type SumberTtd,
} from "../lib/penandatangan";
import { hitungSha256 } from "../lib/ttd";
import type { Dokumen, EmailKeluar, Kontrak, Sesi } from "../lib/types";
import { catatAktivitas } from "./aktivitas";
import { cariBerkasJalur, graphBlob, hapusBerkasId, unggahBerkasJalur, unggahDokumen } from "./dokumen";
import { antrikanTangguh } from "./notifikasi";

const ITEMS = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.tandaTangan}/items`;
const PREFER = { headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" } };
const FOLDER_TTD = "TTD";
const FOLDER_TERSIMPAN = "_TTD Tersimpan";

export const pelakuDari = (sesi: Pick<Sesi, "email" | "peran">): PelakuTtd => ({ email: sesi.email, legal: sesi.peran === "Admin" || sesi.peran === "Legal" });

// --- Membaca -------------------------------------------------------------------------------------------

interface ItemTtd {
  id: string;
  fields: { KontrakId?: number; Title?: string; Isi?: string; DibuatOleh?: string; DibuatEmail?: string; WaktuDibuat?: string };
  createdDateTime?: string;
}

function dariItem(it: ItemTtd): PermintaanTtd | null {
  try {
    const isi = JSON.parse(it.fields.Isi ?? "") as IsiPermintaan;
    if (!isi || !Array.isArray(isi.penandatangan) || !isi.dokumen) return null;
    return {
      itemId: Number(it.id),
      kontrakId: Number(it.fields.KontrakId ?? 0),
      nomor: it.fields.Title ?? "",
      isi,
      dibuatOleh: it.fields.DibuatOleh ?? "",
      dibuatEmail: huruf(it.fields.DibuatEmail),
      waktuDibuat: it.fields.WaktuDibuat ?? it.createdDateTime ?? "",
    };
  } catch {
    return null;
  }
}

const PILIH = "$expand=fields($select=KontrakId,Title,Isi,DibuatOleh,DibuatEmail,WaktuDibuat)";

async function bacaItem(itemId: number): Promise<PermintaanTtd> {
  const it = await graph<ItemTtd>(`${ITEMS}/${itemId}?${PILIH}`);
  const p = dariItem(it);
  if (!p) throw new Error("Isi permintaan tanda tangan tidak terbaca. Hubungi Admin.");
  return p;
}

/** Semua permintaan untuk satu kontrak, terbaru dulu. */
export async function ambilRiwayatPermintaan(kontrakId: number): Promise<PermintaanTtd[]> {
  const items = await graphSemua<ItemTtd>(`${ITEMS}?${PILIH}&$top=100&$filter=fields/KontrakId eq ${kontrakId}`, PREFER);
  return items.map(dariItem).filter((x): x is PermintaanTtd => x != null).sort((a, b) => b.itemId - a.itemId);
}

/** Permintaan terbaru sebuah kontrak (yang berjalan, atau yang terakhir selesai/ditolak), atau null. */
export async function ambilPermintaan(kontrakId: number): Promise<PermintaanTtd | null> {
  const semua = await ambilRiwayatPermintaan(kontrakId);
  return semua.find((p) => masihBerjalan(p.isi)) ?? semua[0] ?? null;
}

/** Semua permintaan (terbaru dulu), untuk halaman Tanda Tangan. Ukuran list kecil, jadi dibaca sekaligus. */
export async function ambilSemuaPermintaan(): Promise<PermintaanTtd[]> {
  const items = await graphSemua<ItemTtd>(`${ITEMS}?${PILIH}&$top=999`, PREFER);
  return items.map(dariItem).filter((x): x is PermintaanTtd => x != null).sort((a, b) => b.itemId - a.itemId);
}

// --- Menulis (baca-ubah-tulis dengan pemeriksaan ulang) ---------------------------------------------------

/**
 * Baca ulang permintaan terbaru, terapkan perubahan, tulis, lalu baca lagi untuk memastikan perubahan itu
 * benar-benar bertahan (dua orang yang menandatangani bersamaan bisa saling menimpa). Bila hilang, diulang.
 */
async function perbarui(itemId: number, ubah: (isi: IsiPermintaan) => IsiPermintaan, bertahan: (isi: IsiPermintaan) => boolean): Promise<PermintaanTtd> {
  for (let percobaan = 0; percobaan < 3; percobaan++) {
    const segar = await bacaItem(itemId);
    const baru = ubah(segar.isi);
    await ulangiPenulisan(
      () => graph(`${ITEMS}/${itemId}/fields`, { method: "PATCH", json: { Isi: JSON.stringify(baru), StatusTtd: statusPermintaan(baru) } }),
      { bolehUlang: (err) => galatSementara(err, "catatan") },
    );
    const cek = await bacaItem(itemId);
    if (bertahan(cek.isi)) return cek;
  }
  throw new Error("Perubahan belum tersimpan karena bersamaan dengan perubahan orang lain. Muat ulang halaman lalu coba lagi.");
}

// --- Berkas dokumen --------------------------------------------------------------------------------------

export const bisaDitandatangani = (d: Pick<Dokumen, "nama">): boolean => /\.(pdf|docx?)$/i.test(d.nama);
const adalahPdf = (nama: string) => /\.pdf$/i.test(nama);

async function sidikDokumen(id: string): Promise<{ sha256: string; ukuran: number; blob: Blob }> {
  const blob = await graphBlob(id, { batas: BATAS_UKURAN_BERKAS });
  return { sha256: await hitungSha256(await blob.arrayBuffer()), ukuran: blob.size, blob };
}

/** Isi dokumen sekarang masih sama dengan yang dikunci saat permintaan dibuat? */
export async function dokumenMasihSama(p: PermintaanTtd): Promise<boolean> {
  return (await sidikDokumen(p.isi.dokumen.id)).sha256 === p.isi.dokumen.sha256;
}

// --- Email ---------------------------------------------------------------------------------------------

async function antrikan(e: Omit<EmailKeluar, "kontrakId"> & { kontrakId: number }): Promise<boolean> {
  if (e.penerima.length === 0) return true;
  try {
    await antrikanTangguh(e);
    return true;
  } catch (err) {
    console.warn("Email tanda tangan gagal diantrikan:", e.subjek, err);
    return false;
  }
}

/** Email giliran ke penandatangan internal yang sedang gilirannya. Mengembalikan ada-tidaknya yang gagal. */
async function kabarkanGiliran(k: Kontrak, isi: IsiPermintaan, oleh: string, pengingat = false): Promise<boolean> {
  let beres = true;
  for (const p of sedangGiliran(isi)) {
    if (p.luar || !p.email) continue;
    const m = emailGiliranTtd(k, p, oleh, isi.dokumen.nama, { pengingat, berurutan: isi.berurutan });
    beres = (await antrikan({ penerima: [p.email], subjek: m.subjek, html: m.html, jenis: pengingat ? "Pengingat" : "Status Berubah", kontrakId: k.id })) && beres;
  }
  return beres;
}

const semuaTerlibat = (k: Kontrak, p: PermintaanTtd): string[] => [
  ...p.isi.penandatangan.filter((x) => !x.luar).map((x) => x.email),
  p.dibuatEmail,
  k.pengajuEmail,
  k.picLegalEmail,
];

// --- Membuat ---------------------------------------------------------------------------------------------

export interface HasilAksiTtd {
  permintaan: PermintaanTtd;
  /** Email yang gagal diantrikan; aksi utamanya tetap berhasil. */
  emailGagal: boolean;
  /** Semua pihak sudah menandatangani. */
  lengkap?: boolean;
  /** Pesan bila PDF final gagal dibuat; tanda tangan tetap sah. */
  galatPdf?: string | null;
}

export async function buatPermintaan(
  k: Kontrak,
  dokumen: Pick<Dokumen, "id" | "nama" | "ukuran">,
  masukan: readonly MasukanPenandatangan[],
  berurutan: boolean,
  sesi: Sesi,
): Promise<HasilAksiTtd> {
  const aktif = await ambilPermintaan(k.id);
  if (!bolehAksi(aktif, "buat", pelakuDari(sesi))) throw new Error(aktif && masihBerjalan(aktif.isi) ? "Masih ada permintaan tanda tangan yang berjalan untuk kontrak ini. Batalkan dulu bila ingin membuat yang baru." : "Hanya Admin dan Legal yang bisa meminta tanda tangan.");
  if (k.status !== "Proses Tanda Tangan") throw new Error("Permintaan tanda tangan hanya bisa dibuat saat kontrak berstatus Proses Tanda Tangan.");
  if (!bisaDitandatangani(dokumen)) throw new Error("Pilih dokumen PDF atau Word (.docx) sebagai dokumen yang ditandatangani.");
  const galat = periksaPenandatangan(masukan);
  if (galat.length) throw new Error(galat[0]);

  const { sha256, ukuran } = await sidikDokumen(dokumen.id);
  const isi: IsiPermintaan = {
    v: 1,
    judul: k.judul,
    mitra: k.mitra,
    dokumen: { id: dokumen.id, nama: dokumen.nama, ukuran, sha256 },
    berurutan,
    penandatangan: susunPenandatangan(masukan),
  };
  const waktu = new Date().toISOString();
  const item = await graph<ItemTtd>(ITEMS, {
    method: "POST",
    json: {
      fields: {
        Title: k.nomorPengajuan,
        KontrakId: k.id,
        StatusTtd: statusPermintaan(isi),
        Isi: JSON.stringify(isi),
        DibuatOleh: sesi.nama,
        DibuatEmail: huruf(sesi.email),
        WaktuDibuat: waktu,
      },
    },
  });
  const permintaan = (await bacaItem(Number(item.id))) ?? null;
  const rincian = isi.penandatangan.map((p) => `${p.nama}${p.luar ? " (pihak luar)" : ""}`).join(", ");
  await catatAktivitas({ kontrakId: k.id, jenis: "Tanda Tangan", pesan: `Meminta tanda tangan atas "${dokumen.nama}" dari ${isi.penandatangan.length} penandatangan${berurutan ? " secara berurutan" : ""}: ${rincian}.` }, sesi).catch(() => undefined);
  const beres = await kabarkanGiliran(k, isi, sesi.nama);
  return { permintaan, emailGagal: !beres };
}

// --- Tanda tangan ------------------------------------------------------------------------------------------

async function simpanBukti(k: Kontrak, p: Penandatangan, png: Uint8Array): Promise<{ id: string; sha256: string }> {
  const sha = await hitungSha256(png);
  const nama = namaBerkasTtd(k.nomorPengajuan, p.id, capWaktu(new Date().toISOString()));
  const berkas = await unggahBerkasJalur([k.nomorPengajuan, FOLDER_TTD, nama], new File([png as Uint8Array<ArrayBuffer>], nama, { type: "image/png" }));
  return { id: berkas.id, sha256: sha };
}

async function bubuhkan(
  k: Kontrak,
  p: PermintaanTtd,
  langkah: Penandatangan,
  png: Uint8Array,
  sumber: SumberTtd,
  sesi: Sesi,
  opsi: { nama?: string; email?: string; dicatatOleh?: string },
): Promise<HasilAksiTtd> {
  // 1. Dokumen belum berubah sejak dikunci.
  if (!(await dokumenMasihSama(p))) {
    throw new Error("Isi dokumen berubah sejak permintaan tanda tangan dibuat, jadi tidak bisa ditandatangani. Minta Legal membatalkan lalu membuat permintaan baru.");
  }
  // 2. Bukti dulu, status sesudahnya.
  const bukti = await simpanBukti(k, langkah, png);
  const waktu = new Date().toISOString();
  const jejak = await hitungSha256(new TextEncoder().encode(bahanJejak(p.isi.dokumen.sha256, opsi.email ?? langkah.email, waktu, bukti.sha256)));
  const baru = await perbarui(
    p.itemId,
    (isi) => {
      if (!masihBerjalan(isi)) throw new Error("Permintaan ini sudah tidak berjalan (selesai, ditolak, atau dibatalkan).");
      const sasaran = isi.penandatangan.find((x) => x.id === langkah.id);
      if (!sasaran) throw new Error("Penandatangan tidak ditemukan pada permintaan ini.");
      if (sudahTtd(sasaran)) throw new Error("Langkah ini sudah ditandatangani.");
      if (!sedangGiliran(isi).some((x) => x.id === langkah.id)) throw new Error("Belum giliran Anda: penandatangan sebelumnya harus selesai lebih dulu.");
      return {
        ...isi,
        penandatangan: isi.penandatangan.map((x) =>
          x.id === langkah.id
            ? { ...x, waktu, oleh: opsi.nama ?? x.nama, berkasTtd: bukti.id, sumber, jejak, ...(opsi.dicatatOleh ? { dicatatOleh: opsi.dicatatOleh } : {}) }
            : x,
        ),
      };
    },
    (isi) => isi.penandatangan.find((x) => x.id === langkah.id)?.jejak === jejak,
  );

  const lengkap = statusPermintaan(baru.isi) === "Selesai";
  const apa = langkah.luar ? `Mencatat tanda tangan ${langkah.nama} (pihak luar)` : `${langkah.nama} menandatangani`;
  await catatAktivitas({ kontrakId: k.id, jenis: "Tanda Tangan", pesan: `${apa} sebagai ${langkah.peran}.` }, sesi).catch(() => undefined);

  // 3. PDF final bila sudah lengkap; kegagalannya tidak membatalkan tanda tangan.
  let hasil = baru;
  let galatPdf: string | null = null;
  let emailGagal = false;
  if (lengkap) {
    try {
      hasil = await susunPdfFinal(k, baru, sesi);
    } catch (err) {
      galatPdf = err instanceof Error ? err.message : String(err);
    }
    const m = emailTtdSelesai(k, hasil.isi.penandatangan, !!hasil.isi.berkasPdf);
    emailGagal = !(await antrikan({ penerima: semuaTerlibat(k, hasil), subjek: m.subjek, html: m.html, jenis: "Selesai", kontrakId: k.id }));
    await catatAktivitas({ kontrakId: k.id, jenis: "Tanda Tangan", pesan: `Dokumen "${hasil.isi.dokumen.nama}" selesai ditandatangani semua pihak.` }, sesi).catch(() => undefined);
  } else if (baru.isi.berurutan) {
    emailGagal = !(await kabarkanGiliran(k, baru.isi, sesi.nama));
  }
  return { permintaan: hasil, emailGagal, lengkap, galatPdf };
}

/** Tanda tangan penandatangan internal yang sedang masuk (langkah miliknya yang sedang gilirannya). */
export async function tandatangani(k: Kontrak, p: PermintaanTtd, png: Uint8Array, sumber: Exclude<SumberTtd, "dicatat">, sesi: Sesi): Promise<HasilAksiTtd> {
  const segar = await bacaItem(p.itemId);
  if (!bolehAksi(segar, "ttd", pelakuDari(sesi))) throw new Error("Anda tidak bisa menandatangani permintaan ini sekarang.");
  const langkah = langkahUntukSaya(segar, sesi.email)!;
  return bubuhkan(k, segar, langkah, png, sumber, sesi, { nama: sesi.nama, email: sesi.email });
}

/** Legal mencatat tanda tangan pihak luar (mitra) dari gambar tanda tangan yang diterimanya. */
export async function catatPihakLuar(k: Kontrak, p: PermintaanTtd, langkahId: string, png: Uint8Array, sesi: Sesi): Promise<HasilAksiTtd> {
  const segar = await bacaItem(p.itemId);
  if (!bolehAksi(segar, "catat-luar", pelakuDari(sesi))) throw new Error("Tanda tangan pihak luar hanya bisa dicatat Legal, pada gilirannya.");
  const langkah = segar.isi.penandatangan.find((x) => x.id === langkahId && x.luar);
  if (!langkah) throw new Error("Langkah pihak luar tidak ditemukan.");
  return bubuhkan(k, segar, langkah, png, "dicatat", sesi, { nama: langkah.nama, email: langkah.email || `luar-${langkah.id}`, dicatatOleh: sesi.nama });
}

// --- PDF final ---------------------------------------------------------------------------------------------

/**
 * Buat (atau buat ulang) PDF final dari bukti tanda tangan, simpan di dokumen kontrak sebagai
 * "Kontrak Ditandatangani", dan catat ID-nya di permintaan. Dipakai juga untuk membuat ulang bila sebelumnya gagal.
 */
export async function susunPdfFinal(k: Kontrak, p: PermintaanTtd, sesi: Sesi): Promise<PermintaanTtd> {
  const ttd: Record<string, Uint8Array | null> = {};
  for (const x of p.isi.penandatangan) {
    ttd[x.id] = x.berkasTtd ? new Uint8Array(await (await graphBlob(x.berkasTtd, { batas: 4 * 1024 * 1024 })).arrayBuffer()).slice() : null;
  }
  const pdfAsli = adalahPdf(p.isi.dokumen.nama) ? new Uint8Array(await (await graphBlob(p.isi.dokumen.id, { batas: BATAS_UKURAN_BERKAS })).arrayBuffer()) : null;
  const bytes = await buatPdfTtd({
    nomorPengajuan: k.nomorPengajuan,
    judul: k.judul,
    mitra: k.mitra,
    isi: p.isi,
    ttd,
    urlVerifikasi: `${URL_APLIKASI}/#/tanda-tangan/${k.id}`,
    pdfAsli,
    dibuatPada: new Date().toISOString(),
  });
  const nama = `${k.nomorPengajuan}-ditandatangani.pdf`;
  const hasil = await unggahDokumen(k, new File([bytes as Uint8Array<ArrayBuffer>], nama, { type: "application/pdf" }), "Kontrak Ditandatangani");
  const waktu = new Date().toISOString();
  const baru = await perbarui(
    p.itemId,
    (isi) => ({ ...isi, berkasPdf: hasil.id, waktuSelesai: isi.waktuSelesai ?? waktu }),
    (isi) => isi.berkasPdf === hasil.id,
  );
  void sesi;
  return baru;
}

// --- Tolak, batal, ingatkan, pindaian ------------------------------------------------------------------------

export async function tolakPermintaan(k: Kontrak, p: PermintaanTtd, alasan: string, sesi: Sesi): Promise<HasilAksiTtd> {
  const segar = await bacaItem(p.itemId);
  if (!bolehAksi(segar, "tolak", pelakuDari(sesi))) throw new Error("Anda tidak bisa menolak permintaan ini.");
  const bersih = alasan.trim();
  if (bersih.length < 5) throw new Error("Tuliskan alasan penolakan (minimal 5 karakter).");
  const baru = await perbarui(p.itemId, (isi) => (isi.tolak ? isi : { ...isi, tolak: { waktu: new Date().toISOString(), oleh: sesi.nama, alasan: bersih } }), (isi) => !!isi.tolak);
  await catatAktivitas({ kontrakId: k.id, jenis: "Tanda Tangan", pesan: `${sesi.nama} menolak menandatangani. Alasan: ${bersih}` }, sesi).catch(() => undefined);
  const m = emailTtdDitolak(k, sesi.nama, bersih);
  const gagal = !(await antrikan({ penerima: semuaTerlibat(k, baru), subjek: m.subjek, html: m.html, jenis: "Status Berubah", kontrakId: k.id }));
  return { permintaan: baru, emailGagal: gagal };
}

export async function batalkanPermintaan(k: Kontrak, p: PermintaanTtd, alasan: string, sesi: Sesi): Promise<HasilAksiTtd> {
  const segar = await bacaItem(p.itemId);
  if (!bolehAksi(segar, "batal", pelakuDari(sesi))) throw new Error("Anda tidak bisa membatalkan permintaan ini.");
  const bersih = alasan.trim();
  if (bersih.length < 5) throw new Error("Tuliskan alasan pembatalan (minimal 5 karakter).");
  const baru = await perbarui(p.itemId, (isi) => (isi.batal ? isi : { ...isi, batal: { waktu: new Date().toISOString(), oleh: sesi.nama, alasan: bersih } }), (isi) => !!isi.batal);
  await catatAktivitas({ kontrakId: k.id, jenis: "Tanda Tangan", pesan: `Permintaan tanda tangan dibatalkan. Alasan: ${bersih}` }, sesi).catch(() => undefined);
  const m = emailTtdDibatalkan(k, sesi.nama, bersih);
  const gagal = !(await antrikan({ penerima: semuaTerlibat(k, baru).filter((e) => huruf(e) !== huruf(sesi.email)), subjek: m.subjek, html: m.html, jenis: "Status Berubah", kontrakId: k.id }));
  return { permintaan: baru, emailGagal: gagal };
}

/** Kirim ulang permintaan ke yang sedang gilirannya. */
export async function ingatkanPenandatangan(k: Kontrak, p: PermintaanTtd, sesi: Sesi): Promise<{ emailGagal: boolean; jumlah: number }> {
  const segar = await bacaItem(p.itemId);
  if (!bolehAksi(segar, "ingatkan", pelakuDari(sesi))) throw new Error("Anda tidak bisa mengirim pengingat untuk permintaan ini.");
  const jumlah = sedangGiliran(segar.isi).filter((x) => !x.luar && x.email).length;
  const beres = await kabarkanGiliran(k, segar.isi, sesi.nama, true);
  await catatAktivitas({ kontrakId: k.id, jenis: "Tanda Tangan", pesan: `Mengirim pengingat tanda tangan ke ${jumlah} orang.` }, sesi).catch(() => undefined);
  return { emailGagal: !beres, jumlah };
}

/** Kontrak ditandatangani basah: unggah pindaian PDF-nya; permintaan dinyatakan selesai. */
export async function unggahPindaian(k: Kontrak, p: PermintaanTtd, file: File, sesi: Sesi): Promise<HasilAksiTtd> {
  const segar = await bacaItem(p.itemId);
  if (!bolehAksi(segar, "scan", pelakuDari(sesi))) throw new Error("Hanya Legal yang bisa mengunggah pindaian tanda tangan basah.");
  if (!adalahPdf(file.name)) throw new Error("Unggah pindaian dalam format PDF.");
  const hasil = await unggahDokumen(k, file, "Kontrak Ditandatangani");
  const waktu = new Date().toISOString();
  const baru = await perbarui(p.itemId, (isi) => ({ ...isi, berkasScan: hasil.id, waktuSelesai: waktu }), (isi) => isi.berkasScan === hasil.id);
  await catatAktivitas({ kontrakId: k.id, jenis: "Tanda Tangan", pesan: `Pindaian tanda tangan basah diunggah (${hasil.nama}); permintaan selesai.` }, sesi).catch(() => undefined);
  const m = emailTtdSelesai(k, baru.isi.penandatangan, true);
  const gagal = !(await antrikan({ penerima: semuaTerlibat(k, baru), subjek: m.subjek, html: m.html, jenis: "Selesai", kontrakId: k.id }));
  return { permintaan: baru, emailGagal: gagal, lengkap: true };
}

// --- Gambar tanda tangan ------------------------------------------------------------------------------------

/** Gambar PNG satu tanda tangan di permintaan (untuk kartu penandatangan), atau null bila belum ada. */
export async function ambilGambarTtd(p: Penandatangan): Promise<Blob | null> {
  if (!p.berkasTtd) return null;
  return graphBlob(p.berkasTtd, { batas: 4 * 1024 * 1024 }).catch(() => null);
}

// --- TTD tersimpan (per pengguna) --------------------------------------------------------------------------

const namaTersimpan = (email: string) => `${huruf(email).replace(/[^a-z0-9@._-]/g, "_")}.png`;

export interface TtdTersimpan {
  bytes: Uint8Array;
  waktu: string;
}

/** TTD tersimpan milik `email`, atau null. Tidak melempar galat 404; galat lain tetap dilempar. */
export async function ambilTtdTersimpan(email: string): Promise<TtdTersimpan | null> {
  const ada = await cariBerkasJalur([FOLDER_TERSIMPAN, namaTersimpan(email)]);
  if (!ada) return null;
  const blob = await graphBlob(ada.id, { batas: 4 * 1024 * 1024 });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), waktu: ada.diubah };
}

export async function simpanTtdTersimpan(email: string, png: Uint8Array): Promise<void> {
  const nama = namaTersimpan(email);
  await unggahBerkasJalur([FOLDER_TERSIMPAN, nama], new File([png as Uint8Array<ArrayBuffer>], nama, { type: "image/png" }), true);
}

export async function hapusTtdTersimpan(email: string): Promise<void> {
  const ada = await cariBerkasJalur([FOLDER_TERSIMPAN, namaTersimpan(email)]);
  if (ada) await hapusBerkasId(ada.id);
}

export { GraphError };
