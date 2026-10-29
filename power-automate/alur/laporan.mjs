// Flow 4: laporan bulanan, tanggal 1 pukul 07.00 WIB, ke tim Legal (Admin dan Legal, atau alamatGrupLegal bila diisi
// di Pengaturan) dan Pemantau (pimpinan).
// Isi: pengajuan baru dan kontrak yang berlaku bulan lalu, sebaran status saat ini, dan kontrak yang berakhir dalam
// jangka pengingat terpanjang dari Pengaturan (angka terbesar hariPeringatan, bawaan 90 hari, sama dengan dashboard).
import { aksiPengaturan, awalanUji, bilaAda } from "./pengaturan.mjs";
import {
  ADMIN_BAWAAN,
  LIST,
  URL_APLIKASI,
  ZONA,
  W,
  FONT,
  adalahAddendumE,
  akhirKontrakE,
  ambilItem,
  barisTombol,
  bungkusTabel,
  escE,
  kepalaTabel,
  kerangka,
  kirimEmail,
  kpi,
  paragraf,
  pemicuJadwal,
  petik,
  pilih,
  saring,
  seksi,
  tombolHtml,
  tulis,
} from "./umum.mjs";

const STATUS = ["Diajukan", "Review Legal", "Perlu Revisi", "Proses Tanda Tangan", "Aktif", "Berakhir", "Ditolak", "Dibatalkan"];
const WARNA_STATUS = { Diajukan: W.muted, "Review Legal": W.info, "Perlu Revisi": W.accent, "Proses Tanda Tangan": W.brand, Aktif: W.success, Berakhir: "#94a3b8", Ditolak: W.danger, Dibatalkan: "#cbd5e1" };
const nama = (s) => `Status_${s.replace(/\s+/g, "_")}`;
const td = (isi, gaya = "") => `<td valign="middle" style="padding:8px 10px;border-bottom:1px solid ${W.line};font-family:${FONT};font-size:13px;line-height:18px;color:${W.ink};${gaya}">${isi}</td>`;
const AWAL_ZAMAN = "'1900-01-01T00:00:00Z'";

const saringStatus = Object.fromEntries(STATUS.map((s, i) => [nama(s), saring("@body('Ambil_semua')?['value']", `@equals(item()?['Status']?['Value'],'${s}')`, { [i === 0 ? "Ambil_semua" : nama(STATUS[i - 1])]: ["Succeeded"] })]));

// Batang horizontal: lebar sebanding jumlah terhadap total (tabel bersel berwarna, aman di Outlook).
const barisStatus = STATUS.map((s) => {
  const n = `length(body('${nama(s)}'))`;
  const lebar = `if(equals(length(body('Ambil_semua')?['value']),0),0,max(2,div(mul(${n},300),length(body('Ambil_semua')?['value']))))`;
  return `<tr>${td(`<span style="display:inline-block;width:10px;height:10px;border-radius:5px;background-color:${WARNA_STATUS[s]};"></span>&nbsp;${s}`, "width:170px;")}${td(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="@{${lebar}}" height="10" bgcolor="${WARNA_STATUS[s]}" style="background-color:${WARNA_STATUS[s]};font-size:0;line-height:0;">&nbsp;</td></tr></table>`)}${td(`<strong>@{${n}}</strong>`, "width:50px;text-align:right;")}</tr>`;
}).join("");

/** Baris kontrak; `tanggalE` = ekspresi tanggal yang ditampilkan di kolom kanan. */
const barisKontrak = (tanggalE, label) =>
  `<tr>${td(`<a href="${URL_APLIKASI}/#/kontrak/@{item()?['ID']}" style="color:${W.ink};font-weight:700;text-decoration:none;">@{${escE("item()?['Title']")}}</a><div style="font-size:12px;color:${W.muted};">@{${escE("item()?['NamaMitra']")}} · @{item()?['DivisiPengaju']?['Value']}@{if(equals(item()?['PerpanjanganOtomatis'],true),' · diperpanjang otomatis','')}</div>`)}${td(`@{if(equals(item()?['NilaiKontrak'],null),'Tanpa nilai',concat(item()?['MataUang']?['Value'],' ',formatNumber(coalesce(item()?['NilaiKontrak'],0),'N0','id-ID')))}`, "width:150px;text-align:right;white-space:nowrap;")}${td(`<span style="color:${W.muted};font-size:11px;">${label}</span><br>@{formatDateTime(convertTimeZone(coalesce(${tanggalE},${AWAL_ZAMAN}),'UTC','${ZONA}'),'d MMM yyyy','id-ID')}`, "width:100px;text-align:right;white-space:nowrap;")}</tr>`;

// Dipakai di dalam string literal ekspresi, jadi petik tunggal digandakan.
const kosong = (teks, kolom) => petik(`<tr><td colspan="${kolom}" align="center" style="padding:14px 10px;font-family:${FONT};font-size:13px;color:${W.muted};">${teks}</td></tr>`);

const HORIZON = "outputs('Batas_berakhir')?['hari']";

const isiEmail =
  paragraf(`Ringkasan kontrak untuk periode <strong>@{outputs('Periode')?['label']}</strong>, dibuat otomatis oleh WiCon.`) +
  `<tr><td style="padding:18px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${kpi("Pengajuan baru", "@{length(body('Masuk_bulan_lalu'))}", W.accent)}${kpi("Kontrak berlaku", "@{length(body('Aktif_bulan_lalu'))}", W.success)}${kpi("Antrean sekarang", "@{length(body('Status_Diajukan'))}", W.brand)}</tr></table></td></tr>` +
  seksi("Sebaran status saat ini", bungkusTabel(barisStatus) + `<div style="font-family:${FONT};font-size:12px;color:${W.muted};padding-top:6px;">Total @{length(body('Ambil_semua')?['value'])} pengajuan di sistem.</div>`) +
  seksi("Kontrak yang berlaku bulan lalu", bungkusTabel(kepalaTabel(["Kontrak"], ["Nilai", 150, "right"], ["Tanggal", 100, "right"]) + `@{if(empty(body('Aktif_bulan_lalu')),'${kosong("Tidak ada kontrak yang ditandatangani bulan lalu.", 3)}',join(body('Baris_aktif'),''))}`)) +
  seksi(`Berakhir dalam @{${HORIZON}} hari`, bungkusTabel(kepalaTabel(["Kontrak"], ["Nilai", 150, "right"], ["Berakhir", 100, "right"]) + `@{if(empty(body('Akan_berakhir')),'${kosong("Tidak ada kontrak yang berakhir dalam rentang ini.", 3)}',join(body('Baris_berakhir'),''))}`)) +
  barisTombol(tombolHtml("Buka laporan lengkap", `${URL_APLIKASI}/#/laporan`));

/** Email pengguna dalam huruf kecil, untuk Select. */
const EMAIL_PENGGUNA = "@toLower(trim(coalesce(item()?['Email'],'')))";
/** Daftar tanpa duplikat. */
const daftarTerisi = (aksi) => `union(body('${aksi}'),body('${aksi}'))`;

export default {
  // ID tetap: impor ulang memperbarui flow yang sama, tidak membuat salinan baru.
  id: "ad37ccb9-4d9a-4bf0-8dfe-aa84e5abe3ac",
  nama: "WiCon - Laporan bulanan",
  berkas: "KontrakWKI-LaporanBulanan",
  koneksi: ["sharepoint", "outlook"],
  pemicu: { Tiap_tanggal_1: pemicuJadwal({ frekuensi: "Month", jam: 7, tanggal: 1 }) },
  aksi: {
    Periode: tulis({
      awal: `@{formatDateTime(startOfMonth(addToTime(convertTimeZone(utcNow(),'UTC','${ZONA}'),-1,'Month')),'yyyy-MM-dd')}`,
      akhir: `@{formatDateTime(startOfMonth(convertTimeZone(utcNow(),'UTC','${ZONA}')),'yyyy-MM-dd')}`,
      label: `@{formatDateTime(addToTime(convertTimeZone(utcNow(),'UTC','${ZONA}'),-1,'Month'),'MMMM yyyy','id-ID')}`,
    }),
    ...aksiPengaturan(["hariPeringatan", "alamatGrupLegal"], { Periode: ["Succeeded"] }),
    Batas_berakhir: tulis(
      {
        hari: "@max(outputs('Pengaturan')?['hariPeringatan'])",
        tanggal: `@{addDays(convertTimeZone(utcNow(),'UTC','${ZONA}'),max(outputs('Pengaturan')?['hariPeringatan']),'yyyy-MM-dd')}`,
      },
      { Email_uji: ["Succeeded"] },
    ),

    // Penerima: tim Legal (Admin dan Legal, digantikan alamatGrupLegal bila diisi) ditambah Pemantau.
    Ambil_penerima: ambilItem(LIST.pengguna, { filter: "Aktif eq 1 and (Peran eq 'Admin' or Peran eq 'Legal' or Peran eq 'Pemantau')" }, { Batas_berakhir: ["Succeeded"] }),
    Penerima_legal: saring("@body('Ambil_penerima')?['value']", "@or(equals(item()?['Peran']?['Value'],'Admin'),equals(item()?['Peran']?['Value'],'Legal'))", { Ambil_penerima: ["Succeeded"] }),
    Penerima_pemantau: saring("@body('Ambil_penerima')?['value']", "@equals(item()?['Peran']?['Value'],'Pemantau')", { Penerima_legal: ["Succeeded"] }),
    Email_legal: pilih("@body('Penerima_legal')", EMAIL_PENGGUNA, { Penerima_pemantau: ["Succeeded"] }),
    Email_pemantau: pilih("@body('Penerima_pemantau')", EMAIL_PENGGUNA, { Email_legal: ["Succeeded"] }),
    Email_terpilih: saring(
      `@union(if(empty(outputs('Pengaturan')?['alamatGrupLegal']),body('Email_legal'),createArray(outputs('Pengaturan')?['alamatGrupLegal'])),body('Email_pemantau'))`,
      "@not(empty(item()))",
      { Email_pemantau: ["Succeeded"] },
    ),
    Email_penerima: tulis(`@coalesce(${bilaAda("outputs('Email_uji')")},${bilaAda(`join(${daftarTerisi("Email_terpilih")},';')`)},'${ADMIN_BAWAAN}')`, { Email_terpilih: ["Succeeded"] }),

    Ambil_semua: ambilItem(LIST.kontrak, { filter: "Diarsipkan ne 1", atas: 5000, semua: true }, { Email_penerima: ["Succeeded"] }),
    ...saringStatus,
    // Tanggal dibandingkan dalam WIB: TanggalDiajukan menyimpan jam, TanggalTandaTangan tanggal saja (tengah malam WIB).
    Masuk_bulan_lalu: saring(
      "@body('Ambil_semua')?['value']",
      `@and(greaterOrEquals(convertTimeZone(coalesce(item()?['TanggalDiajukan'],item()?['Created']),'UTC','${ZONA}','yyyy-MM-dd'),outputs('Periode')?['awal']),less(convertTimeZone(coalesce(item()?['TanggalDiajukan'],item()?['Created']),'UTC','${ZONA}','yyyy-MM-dd'),outputs('Periode')?['akhir']))`,
      { [nama(STATUS[STATUS.length - 1])]: ["Succeeded"] },
    ),
    Aktif_bulan_lalu: saring(
      "@body('Ambil_semua')?['value']",
      `@and(not(empty(item()?['TanggalTandaTangan'])),greaterOrEquals(convertTimeZone(coalesce(item()?['TanggalTandaTangan'],${AWAL_ZAMAN}),'UTC','${ZONA}','yyyy-MM-dd'),outputs('Periode')?['awal']),less(convertTimeZone(coalesce(item()?['TanggalTandaTangan'],${AWAL_ZAMAN}),'UTC','${ZONA}','yyyy-MM-dd'),outputs('Periode')?['akhir']))`,
      { Masuk_bulan_lalu: ["Succeeded"] },
    ),
    // Akhir masa berlaku: BerakhirEfektif, atau TanggalBerakhir untuk kontrak yang belum diisi. Addendum tidak dihitung
    // sendiri karena akhir kontrak induknya sudah memperhitungkannya.
    Akan_berakhir: saring(
      "@body('Status_Aktif')",
      `@and(not(${adalahAddendumE("item()")}),not(equals(${akhirKontrakE("item()")},null)),lessOrEquals(convertTimeZone(coalesce(${akhirKontrakE("item()")},'2999-01-01T00:00:00Z'),'UTC','${ZONA}','yyyy-MM-dd'),outputs('Batas_berakhir')?['tanggal']))`,
      { Aktif_bulan_lalu: ["Succeeded"] },
    ),
    Baris_aktif: pilih("@body('Aktif_bulan_lalu')", barisKontrak("item()?['TanggalTandaTangan']", "ditandatangani"), { Akan_berakhir: ["Succeeded"] }),
    Baris_berakhir: pilih("@body('Akan_berakhir')", barisKontrak(akhirKontrakE("item()"), "berakhir"), { Baris_aktif: ["Succeeded"] }),
    Kirim_laporan: kirimEmail(
      {
        ke: "@outputs('Email_penerima')",
        subjek: awalanUji + "[WiCon] Laporan bulanan @{outputs('Periode')?['label']}",
        isi: kerangka({
          pratinjau: "@{length(body('Masuk_bulan_lalu'))} pengajuan baru, @{length(body('Aktif_bulan_lalu'))} kontrak berlaku, @{length(body('Status_Diajukan'))} di antrean.",
          label: "Laporan bulanan",
          judul: "Laporan kontrak @{outputs('Periode')?['label']}",
          isi: isiEmail,
        }),
      },
      { Baris_berakhir: ["Succeeded"] },
    ),
  },
};
