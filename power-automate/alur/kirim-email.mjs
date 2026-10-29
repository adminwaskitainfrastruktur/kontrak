// Flow 1: kirim email dari kotak keluar.
// Aplikasi menulis satu baris ke list "Notifikasi Kontrak" per email (penerima, subjek, isi HTML yang sudah jadi).
// Flow ini mengirimnya lewat Outlook lalu menandai Terkirim, atau Gagal beserta alasannya.
//
// Sebelum mengirim, flow memeriksa dua hal yang juga dijaga aplikasi, supaya tidak bisa dilewati dengan menulis
// langsung ke list:
//   - Semua alamat Penerima dan Cc harus berdomain @waskitainfrastruktur.co.id (U23b).
//   - Email berjenis "Pengingat" (tombol Ingatkan / Tanyakan progres) paling banyak sekali per 24 jam per kontrak:
//     bila sudah ada Pengingat Terkirim untuk KontrakId yang sama dalam 24 jam terakhir, email ditandai Gagal (U27).
// Versi teks biasa tidak dikirim: aksi Send an email (V2) hanya menerima satu isi, HTML.
import { DOMAIN_KANTOR, LIST, ambilItem, kirimEmail, kondisi, pemicuItemBaru, saring, tulis, ubahItem } from "./umum.mjs";

const t = (kolom) => `@triggerOutputs()?['body/${kolom}']`;
const te = (kolom) => `triggerOutputs()?['body/${kolom}']`;
const NILAI = "outputs('Penilaian')";

// JenisNotif bisa kolom pilihan (objek berisi Value) atau teks; string() membuat pemeriksaannya berlaku untuk keduanya.
const JENIS_PENGINGAT = `contains(string(coalesce(${te("JenisNotif")},'')),'Pengingat')`;

export default {
  // ID tetap: impor ulang memperbarui flow yang sama, tidak membuat salinan baru.
  id: "ac15ca29-867f-4f1d-9cc0-770600b1b31c",
  nama: "WiCon - Kirim email dari kotak keluar",
  berkas: "KontrakWKI-KirimEmail",
  koneksi: ["sharepoint", "outlook"],
  pemicu: { Saat_email_diantrikan: pemicuItemBaru(LIST.notifikasi, 1) },
  aksi: {
    // Semua alamat Penerima dan Cc, dipisah ; atau , (huruf kecil, tanpa spasi).
    Daftar_alamat: tulis(`@split(replace(replace(toLower(concat(coalesce(${te("Penerima")},''),';',coalesce(${te("Cc")},''))),',',';'),' ',''),';')`),
    Alamat_luar: saring("@outputs('Daftar_alamat')", `@and(not(empty(item())),or(not(equals(length(split(item(),'@')),2)),not(endsWith(item(),'@${DOMAIN_KANTOR}'))))`, { Daftar_alamat: ["Succeeded"] }),
    // Hanya untuk Pengingat yang punya KontrakId. Rentang ID membatasi pencarian ke 2000 email terakhir supaya tetap
    // cepat dan aman dari batas 5000 item SharePoint walau list kotak keluar terus bertambah. KontrakId (kolom angka)
    // ditulis tanpa desimal dan waktu tanpa pecahan detik supaya filter OData-nya selalu sah.
    Cek_pengingat: kondisi(
      { and: [{ equals: [`@${JENIS_PENGINGAT}`, true] }, { equals: [`@equals(${te("KontrakId")},null)`, false] }] },
      {
        Ambil_pengingat_terkirim: ambilItem(LIST.notifikasi, {
          filter: `ID lt @{${te("ID")}} and ID gt @{sub(${te("ID")},2000)} and KontrakId eq @{formatNumber(${te("KontrakId")},'0','en-US')} and JenisNotif eq 'Pengingat' and StatusKirim eq 'Terkirim' and DikirimPada ge '@{addHours(utcNow(),-24,'yyyy-MM-ddTHH:mm:ssZ')}'`,
          atas: 1,
        }),
      },
      {},
      { Alamat_luar: ["Succeeded"] },
    ),
    // Bila pemeriksaan 24 jam gagal (mis. kolom berubah), email tetap dikirim dan catatannya ditulis di Galat.
    Penilaian: tulis(
      {
        luar: "@join(body('Alamat_luar'),', ')",
        tanpaPenerima: `@empty(trim(coalesce(${te("Penerima")},'')))`,
        pengingatGanda: "@greater(length(coalesce(actions('Ambil_pengingat_terkirim')?['outputs']?['body']?['value'],json('[]'))),0)",
        cekGagal: "@equals(actions('Cek_pengingat')?['status'],'Failed')",
      },
      { Cek_pengingat: ["Succeeded", "Failed", "TimedOut"] },
    ),
    Boleh_kirim: kondisi(
      { and: [{ equals: [`@empty(${NILAI}?['luar'])`, true] }, { equals: [`@${NILAI}?['tanpaPenerima']`, false] }, { equals: [`@${NILAI}?['pengingatGanda']`, false] }] },
      {
        Kirim_email: kirimEmail({ ke: t("Penerima"), cc: t("Cc"), subjek: t("Title"), isi: t("IsiHtml") }),
        Tandai_terkirim: ubahItem(
          LIST.notifikasi,
          t("ID"),
          { Title: t("Title"), "StatusKirim/Value": "Terkirim", DikirimPada: "@utcNow()", Galat: `@{if(${NILAI}?['cekGagal'],'Terkirim tanpa pemeriksaan batas pengingat 24 jam karena pemeriksaannya gagal.','')}` },
          { Kirim_email: ["Succeeded"] },
        ),
        Tandai_gagal: ubahItem(
          LIST.notifikasi,
          t("ID"),
          { Title: t("Title"), "StatusKirim/Value": "Gagal", Galat: "@{coalesce(actions('Kirim_email')?['error']?['message'], 'Email tidak dapat dikirim.')}" },
          { Kirim_email: ["Failed", "TimedOut"] },
        ),
      },
      {
        Tandai_ditolak: ubahItem(LIST.notifikasi, t("ID"), {
          Title: t("Title"),
          "StatusKirim/Value": "Gagal",
          Galat:
            `@{if(${NILAI}?['tanpaPenerima'],'Ditolak: tidak ada alamat penerima.',` +
            `if(not(empty(${NILAI}?['luar'])),concat('Ditolak: alamat di luar @${DOMAIN_KANTOR} (',take(${NILAI}?['luar'],120),'). Email WiCon hanya untuk alamat perusahaan.'),` +
            `'Ditolak: pengingat untuk kontrak ini sudah terkirim dalam 24 jam terakhir. Batasnya sekali per 24 jam per kontrak.'))}`,
        }),
      },
      { Penilaian: ["Succeeded"] },
    ),
  },
};
