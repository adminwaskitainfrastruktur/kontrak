// Flow 3: agenda pagi tim Legal, Senin sampai Jumat pukul 07.30 WIB.
// Isi email, berurutan:
//   - Review milik Anda: pengajuan yang PIC-nya penerima email (hanya di email per orang).
//   - Perlu perhatian: eskalasi dari Pengaturan.ambangEskalasi, yaitu Diajukan tanpa PIC lebih dari N hari dan
//     Perlu Revisi yang belum ditanggapi pengaju lebih dari N hari. Bagian ini hanya muncul bila ada isinya.
//   - Antrean hari ini: urut prioritas lalu waktu masuk (sama dengan aplikasi); yang belum punya PIC ditandai.
//   - Sedang ditangani: umur tahap dengan SLA dari Pengaturan (hari kerja bila slaPakaiHariKerja). Perlu Revisi
//     ditandai "menunggu pengaju" dan tidak dihitung sebagai keterlambatan Legal, sama dengan aplikasi.
//   - Berakhir dalam 30 hari: tanpa kontrak berperpanjangan otomatis (batas keputusannya diingatkan flow harian).
// Tidak dikirim bila antrean, yang ditangani, dan yang berakhir semuanya kosong.
//
// Penerima: satu email per Legal/Admin aktif, dengan blok "Review milik Anda". Bila alamatGrupLegal diisi di
// Pengaturan, yang dikirim satu email tim ke alamat grup itu saja (tanpa blok pribadi). Mode uji mengalihkan
// semuanya ke alamat uji (email per orang tetap dikirim satu per satu, subjeknya menyebut nama penerimanya).
import {
  ADMIN_BAWAAN,
  LIST,
  URL_APLIKASI,
  ZONA,
  W,
  FONT,
  HARI_KERJA,
  adalahAddendumE,
  akhirKontrakE,
  ambilItem,
  barisTombol,
  bulatBawah,
  bungkusTabel,
  escE,
  filterAkhirPalingLambat,
  kepalaTabel,
  kerangka,
  kirimEmail,
  kondisi,
  kpi,
  lencana,
  paragraf,
  pemicuJadwal,
  petik,
  pilih,
  saring,
  seksi,
  tanggalPendek,
  tombolHtml,
  tulis,
  untukSetiap,
  waktuWib,
} from "./umum.mjs";
import { aksiHariKerja, aksiPengaturan, aksiTimLegal, awalanUji, umurHariE } from "./pengaturan.mjs";

const HARI_INI = "outputs('Tanggal_hari_ini')";
const P = "outputs('Pengaturan')";
const UJI = "outputs('Email_uji')";
const AWAL_ZAMAN = "'1900-01-01T00:00:00Z'";
const td = (isi, gaya = "") => `<td valign="top" style="padding:9px 10px;border-bottom:1px solid ${W.line};font-family:${FONT};font-size:13px;line-height:18px;color:${W.ink};${gaya}">${isi}</td>`;
const pilPrioritas = (e) => `<span style="display:inline-block;padding:2px 9px;border-radius:12px;font-size:12px;font-weight:700;background-color:@{if(equals(${e},'Mendesak'),'${W.dangerSoft}',if(equals(${e},'Tinggi'),'${W.accentSoft}','${W.raised}'))};color:@{if(equals(${e},'Mendesak'),'${W.danger}',if(equals(${e},'Tinggi'),'${W.accentInk}','${W.muted}'))};">@{${e}}</span>`;
// Dipakai di dalam string literal ekspresi, jadi petik tunggal digandakan.
const kosong = (teks, kolom) => petik(`<tr><td colspan="${kolom}" align="center" style="padding:14px 10px;font-family:${FONT};font-size:13px;color:${W.muted};">${teks}</td></tr>`);
const tandaKecil = (teks, warna) => `<div style="font-size:11px;line-height:16px;color:${warna};font-weight:700;">${teks}</div>`;
const tautanKontrak = (it) => `<a href="${URL_APLIKASI}/#/kontrak/@{${it}?['ID']}" style="color:${W.ink};font-weight:700;text-decoration:none;">@{${escE(`${it}?['Title']`)}}</a>`;

// --- Umur tahap dan SLA ----------------------------------------------------------------------------------------
// Umur dihitung sekali per kontrak dan disimpan sebagai properti UmurTahap. Dasarnya sama dengan umurTahapHari di
// aplikasi: StatusSejak, atau TanggalDiajukan untuk yang masih Diajukan. Tanpa dasar, umurnya null (tanpa SLA).

const U = "item()?['UmurTahap']";
const STATUS = "item()?['Status']?['Value']";
const SATUAN = `@{if(${P}?['slaPakaiHariKerja'],' hari kerja',' hari')}`;
const umurTeks = `@{${bulatBawah(`coalesce(${U},0)`)}}${SATUAN}`;
const batasSla = `coalesce(${P}?['sla']?[${STATUS}],9999)`;
const MENUNGGU_PENGAJU = `equals(${STATUS},'Perlu Revisi')`;
const LEWAT_SLA = `and(not(${MENUNGGU_PENGAJU}),not(equals(${U},null)),greater(coalesce(${U},0),${batasSla}))`;

const umurDiajukan = `@addProperty(item(),'UmurTahap',${umurHariE("coalesce(item()?['StatusSejak'],item()?['TanggalDiajukan'],item()?['Created'])")})`;
const umurBerjalan = `@addProperty(item(),'UmurTahap',if(equals(item()?['StatusSejak'],null),null,${umurHariE(`coalesce(item()?['StatusSejak'],${AWAL_ZAMAN})`)}))`;

// --- Baris tabel -------------------------------------------------------------------------------------------------

const picAtauTanda = `@{if(empty(item()?['PicLegalEmail']),'${petik(lencana("Belum ada PIC", W.accentSoft, W.accentInk))}',concat('PIC: ',${escE("coalesce(item()?['PicLegalNama'],item()?['PicLegalEmail'])")}))}`;

const barisAntrean =
  `<tr>` +
  td(`<strong style="color:${W.brand};">@{length(split(first(split(outputs('Daftar_id'),concat(',',string(item()?['ID']),','))),','))}</strong>`, "width:30px;text-align:center;") +
  td(`${tautanKontrak("item()")}<div style="font-size:12px;color:${W.muted};"><span style="font-family:Consolas,'Courier New',monospace;">@{item()?['NomorPengajuan']}</span> · @{${escE("item()?['NamaMitra']")}} · @{${escE("item()?['PengajuNama']")}}</div><div style="font-size:12px;color:${W.muted};padding-top:3px;">${picAtauTanda}</div>`) +
  td(pilPrioritas("item()?['Prioritas']?['Value']"), "width:92px;") +
  td(
    `@{${waktuWib("coalesce(item()?['TanggalDiajukan'],item()?['Created'])")}}<div style="font-size:12px;color:${W.muted};">menunggu ${umurTeks}</div>@{if(${LEWAT_SLA},'${petik(tandaKecil("LEWAT SLA", W.danger))}','')}`,
    "width:130px;text-align:right;white-space:nowrap;",
  ) +
  `</tr>`;

/** Baris kontrak yang sedang berjalan (juga dipakai blok "Review milik Anda"). */
const barisBerjalan =
  `<tr>` +
  td(`${tautanKontrak("item()")}<div style="font-size:12px;color:${W.muted};"><span style="font-family:Consolas,'Courier New',monospace;">@{item()?['NomorPengajuan']}</span> · PIC: @{${escE("coalesce(item()?['PicLegalNama'],'belum ada')")}}</div>`) +
  td(`@{${STATUS}}`, "width:120px;") +
  td(
    `@{if(equals(${U},null),'–',concat('<strong style="color:',if(${LEWAT_SLA},'${W.danger}','${W.ink}'),';">',string(${bulatBawah(`coalesce(${U},0)`)}),'</strong>'))}@{if(equals(${U},null),'',if(${P}?['slaPakaiHariKerja'],' hari kerja',' hari'))}` +
      `@{if(${MENUNGGU_PENGAJU},'${petik(tandaKecil("menunggu pengaju", W.accentInk))}',if(${LEWAT_SLA},'${petik(tandaKecil("LEWAT SLA", W.danger))}',''))}`,
    "width:110px;text-align:right;",
  ) +
  `</tr>`;

const barisBerakhir =
  `<tr>` +
  td(`${tautanKontrak("item()")}<div style="font-size:12px;color:${W.muted};">@{${escE("item()?['NamaMitra']")}}@{if(empty(item()?['PicLegalEmail']),'',concat(' · PIC: ',${escE("coalesce(item()?['PicLegalNama'],item()?['PicLegalEmail'])")}))}</div>`) +
  td(
    `@{${tanggalPendek(`coalesce(${akhirKontrakE("item()")},${AWAL_ZAMAN})`)}}@{if(less(convertTimeZone(coalesce(${akhirKontrakE("item()")},${AWAL_ZAMAN}),'UTC','${ZONA}','yyyy-MM-dd'),${HARI_INI}),'${petik(tandaKecil("sudah lewat", W.danger))}','')}`,
    "width:110px;text-align:right;white-space:nowrap;",
  ) +
  `</tr>`;

const barisPerhatian = (alasan) =>
  `<tr>` +
  td(`${tautanKontrak("item()")}<div style="font-size:12px;color:${W.muted};"><span style="font-family:Consolas,'Courier New',monospace;">@{item()?['NomorPengajuan']}</span> · @{${escE("item()?['PengajuNama']")}}</div>`) +
  td(alasan, "width:150px;") +
  td(`<strong style="color:${W.danger};">${umurTeks}</strong>`, "width:96px;text-align:right;white-space:nowrap;") +
  `</tr>`;

// --- Isi email -----------------------------------------------------------------------------------------------

const N_ANTREAN = "length(outputs('Antrean_urut'))";
const N_BERJALAN = "length(body('Berjalan_umur'))";
const N_BERAKHIR = "length(body('Akan_berakhir'))";
const N_PERHATIAN = "add(length(body('Tanpa_pic_lama')),length(body('Revisi_menggantung')))";

// Blok "Perlu perhatian" hanya ditulis bila ada isinya. Kerangkanya dipotong di tanda § supaya angka ambang dan
// barisnya bisa disisipkan lewat concat().
const kerangkaPerhatian = seksi(
  "Perlu perhatian",
  `<div style="font-family:${FONT};font-size:13px;line-height:19px;color:${W.muted};padding-bottom:10px;">Diajukan tanpa PIC lebih dari §1 hari, atau revisi yang belum dikirim ulang pengaju lebih dari §2 hari. Ambangnya diatur Admin di halaman Pengaturan.</div>` +
    bungkusTabel(kepalaTabel(["Pengajuan"], ["Alasan", 150], ["Umur", 96, "right"]) + "§3"),
);
const [p1, sisa1] = kerangkaPerhatian.split("§1");
const [p2, sisa2] = sisa1.split("§2");
const [p3, p4] = sisa2.split("§3");
const blokPerhatian = `@{if(equals(${N_PERHATIAN},0),'',concat('${petik(p1)}',string(${P}?['ambangEskalasi']?['diajukanTanpaPicHari']),'${petik(p2)}',string(${P}?['ambangEskalasi']?['revisiMenggantungHari']),'${petik(p3)}',join(body('Baris_tanpa_pic'),''),join(body('Baris_revisi_menggantung'),''),'${petik(p4)}'))}`;

const isiTim =
  `<tr><td style="padding:18px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${kpi("Di antrean", `@{${N_ANTREAN}}`, W.accent)}${kpi("Sedang ditangani", `@{${N_BERJALAN}}`, W.brand)}${kpi("Perlu perhatian", `@{${N_PERHATIAN}}`, W.danger)}</tr></table></td></tr>` +
  blokPerhatian +
  seksi("Antrean hari ini", bungkusTabel(kepalaTabel(["#", 30, "center"], ["Pengajuan"], ["Prioritas", 92], ["Masuk", 130, "right"]) + `@{if(empty(outputs('Antrean_urut')),'${kosong("Antrean kosong. Tidak ada pengajuan yang menunggu.", 4)}',join(body('Baris_antrean'),''))}`)) +
  seksi("Sedang ditangani", bungkusTabel(kepalaTabel(["Kontrak"], ["Status", 120], ["Umur tahap", 110, "right"]) + `@{if(empty(body('Berjalan_umur')),'${kosong("Tidak ada kontrak dalam review, revisi, atau tanda tangan.", 3)}',join(body('Baris_berjalan'),''))}`)) +
  seksi(
    `Berakhir dalam 30 hari (@{${N_BERAKHIR}})`,
    bungkusTabel(kepalaTabel(["Kontrak"], ["Berakhir", 110, "right"]) + `@{if(empty(body('Akan_berakhir')),'${kosong("Tidak ada kontrak yang berakhir dalam 30 hari.", 2)}',join(body('Baris_berakhir'),''))}`) +
      `<div style="font-family:${FONT};font-size:12px;line-height:18px;color:${W.muted};padding-top:6px;">Kontrak yang diperpanjang otomatis tidak dicantumkan; batas keputusannya diingatkan lewat email pengingat harian.</div>`,
  );

const tanggalSapaan = `@{formatDateTime(convertTimeZone(utcNow(),'UTC','${ZONA}'),'dddd, d MMMM yyyy','id-ID')}`;
const tombolDashboard = barisTombol(tombolHtml("Buka dashboard Legal", `${URL_APLIKASI}/#/`));

const R = "items('Untuk_setiap_penerima')";
const emailPribadi = kerangka({
  pratinjau: `@{length(body('Milik_saya'))} milik Anda, @{${N_ANTREAN}} pengajuan menunggu, @{${N_PERHATIAN}} perlu perhatian.`,
  label: "Agenda pagi",
  judul: "Agenda kontrak hari ini",
  isi:
    paragraf(`Selamat pagi, @{${escE(`if(empty(${R}?['Nama']),'rekan Legal',${R}?['Nama'])`)}}. Berikut agenda kontrak hari ini, ${tanggalSapaan}.`) +
    seksi(
      "Review milik Anda",
      bungkusTabel(kepalaTabel(["Kontrak"], ["Status", 120], ["Umur tahap", 110, "right"]) + `@{if(empty(body('Milik_saya')),'${kosong("Belum ada pengajuan dengan PIC atas nama Anda.", 3)}',join(body('Baris_milik_saya'),''))}`),
    ) +
    "@{outputs('Isi_tim')}" +
    tombolDashboard,
});

const emailTim = kerangka({
  pratinjau: `@{${N_ANTREAN}} pengajuan menunggu, @{${N_BERJALAN}} sedang ditangani, @{${N_PERHATIAN}} perlu perhatian.`,
  label: "Agenda pagi",
  judul: "Agenda kontrak hari ini",
  isi: paragraf(`Selamat pagi, tim Legal. Berikut agenda kontrak hari ini, ${tanggalSapaan}.`) + "@{outputs('Isi_tim')}" + tombolDashboard,
});

export default {
  // ID tetap: impor ulang memperbarui flow yang sama, tidak membuat salinan baru.
  id: "f3f4e2d0-a927-4e0b-a4ca-11548160ab1a",
  nama: "WiCon - Agenda pagi tim Legal",
  berkas: "KontrakWKI-AgendaPagi",
  koneksi: ["sharepoint", "outlook"],
  pemicu: { Hari_kerja_pagi: pemicuJadwal({ frekuensi: "Week", jam: 7, menit: 30, hari: HARI_KERJA }) },
  aksi: {
    Tanggal_hari_ini: tulis(`@formatDateTime(convertTimeZone(utcNow(),'UTC','${ZONA}'),'yyyy-MM-dd')`),
    ...aksiPengaturan(["sla", "slaPakaiHariKerja", "hariKerja", "ambangEskalasi", "alamatGrupLegal"], { Tanggal_hari_ini: ["Succeeded"] }),
    ...aksiTimLegal({ Email_uji: ["Succeeded"] }),
    ...aksiHariKerja({ Email_tim_legal: ["Succeeded"] }),

    // Penerima email per orang: Legal dan Admin aktif (cadangan: akun admin bawaan).
    Penerima_terdaftar: pilih("@body('Ambil_tim_legal')?['value']", { Email: "@toLower(trim(coalesce(item()?['Email'],'')))", Nama: "@coalesce(item()?['Title'],'')" }, { Hari_kerja_kini: ["Succeeded"] }),
    Penerima_terisi: saring("@body('Penerima_terdaftar')", "@not(empty(item()?['Email']))", { Penerima_terdaftar: ["Succeeded"] }),
    Penerima_agenda: tulis(`@if(empty(body('Penerima_terisi')),json('[{"Email":"${ADMIN_BAWAAN}","Nama":"Admin"}]'),union(body('Penerima_terisi'),body('Penerima_terisi')))`, { Penerima_terisi: ["Succeeded"] }),

    // Antrean: urut prioritas lalu waktu masuk.
    Ambil_antrean: ambilItem(LIST.kontrak, { filter: "Status eq 'Diajukan' and Diarsipkan ne 1", urut: "TanggalDiajukan asc", semua: true }, { Penerima_agenda: ["Succeeded"] }),
    Antrean_umur: pilih("@body('Ambil_antrean')?['value']", umurDiajukan, { Ambil_antrean: ["Succeeded"] }),
    Antrean_mendesak: saring("@body('Antrean_umur')", "@equals(item()?['Prioritas']?['Value'],'Mendesak')", { Antrean_umur: ["Succeeded"] }),
    Antrean_tinggi: saring("@body('Antrean_umur')", "@equals(item()?['Prioritas']?['Value'],'Tinggi')", { Antrean_mendesak: ["Succeeded"] }),
    Antrean_normal: saring("@body('Antrean_umur')", "@and(not(equals(item()?['Prioritas']?['Value'],'Mendesak')),not(equals(item()?['Prioritas']?['Value'],'Tinggi')))", { Antrean_tinggi: ["Succeeded"] }),
    Antrean_urut: tulis("@union(union(body('Antrean_mendesak'),body('Antrean_tinggi')),body('Antrean_normal'))", { Antrean_normal: ["Succeeded"] }),
    Id_antrean: pilih("@outputs('Antrean_urut')", "@string(item()?['ID'])", { Antrean_urut: ["Succeeded"] }),
    Daftar_id: tulis("@concat(',',join(body('Id_antrean'),','),',')", { Id_antrean: ["Succeeded"] }),
    Baris_antrean: pilih("@outputs('Antrean_urut')", barisAntrean, { Daftar_id: ["Succeeded"] }),

    // Sedang ditangani.
    Ambil_berjalan: ambilItem(LIST.kontrak, { filter: "(Status eq 'Review Legal' or Status eq 'Proses Tanda Tangan' or Status eq 'Perlu Revisi') and Diarsipkan ne 1", urut: "StatusSejak asc", semua: true }, { Penerima_agenda: ["Succeeded"] }),
    Berjalan_umur: pilih("@body('Ambil_berjalan')?['value']", umurBerjalan, { Ambil_berjalan: ["Succeeded"] }),
    Baris_berjalan: pilih("@body('Berjalan_umur')", barisBerjalan, { Berjalan_umur: ["Succeeded"] }),

    // Perlu perhatian (eskalasi). Umur memakai dasar yang sama dengan SLA.
    Tanpa_pic_lama: saring(
      "@body('Antrean_umur')",
      `@and(empty(item()?['PicLegalEmail']),greater(coalesce(${U},0),${P}?['ambangEskalasi']?['diajukanTanpaPicHari']))`,
      { Baris_antrean: ["Succeeded"] },
    ),
    Revisi_menggantung: saring(
      "@body('Berjalan_umur')",
      `@and(equals(${STATUS},'Perlu Revisi'),not(equals(${U},null)),greater(coalesce(${U},0),${P}?['ambangEskalasi']?['revisiMenggantungHari']))`,
      { Baris_berjalan: ["Succeeded"] },
    ),
    Baris_tanpa_pic: pilih("@body('Tanpa_pic_lama')", barisPerhatian(`<strong>Belum ada PIC</strong><div style="font-size:12px;color:${W.muted};">tetapkan PIC Legal</div>`), { Tanpa_pic_lama: ["Succeeded"] }),
    Baris_revisi_menggantung: pilih(
      "@body('Revisi_menggantung')",
      barisPerhatian(`<strong>Revisi menggantung</strong><div style="font-size:12px;color:${W.muted};">PIC: @{${escE("coalesce(item()?['PicLegalNama'],'belum ada')")}}</div>`),
      { Revisi_menggantung: ["Succeeded"] },
    ),

    // Berakhir dalam 30 hari (BerakhirEfektif, atau TanggalBerakhir bila belum diisi), tanpa addendum dan tanpa
    // kontrak berperpanjangan otomatis.
    Ambil_akan_berakhir: ambilItem(
      LIST.kontrak,
      { filter: `Status eq 'Aktif' and Diarsipkan ne 1 and ${filterAkhirPalingLambat(`@{addDays(${HARI_INI},30,'yyyy-MM-dd')}`)}`, urut: "ID asc", semua: true },
      { Penerima_agenda: ["Succeeded"] },
    ),
    Akan_berakhir: saring(
      "@body('Ambil_akan_berakhir')?['value']",
      `@and(not(${adalahAddendumE("item()")}),not(equals(item()?['PerpanjanganOtomatis'],true)),not(equals(${akhirKontrakE("item()")},null)))`,
      { Ambil_akan_berakhir: ["Succeeded"] },
    ),
    // Urut menurut akhir masa berlaku (gabungan BerakhirEfektif dan TanggalBerakhir), yang paling dekat dulu.
    Akan_berakhir_akhir: pilih("@body('Akan_berakhir')", `@addProperty(item(),'AkhirMasa',${akhirKontrakE("item()")})`, { Akan_berakhir: ["Succeeded"] }),
    Berakhir_urut: tulis("@sort(body('Akan_berakhir_akhir'),'AkhirMasa')", { Akan_berakhir_akhir: ["Succeeded"] }),
    Baris_berakhir: pilih("@outputs('Berakhir_urut')", barisBerakhir, { Berakhir_urut: ["Succeeded"] }),

    Semua_proses: tulis("@union(body('Antrean_umur'),body('Berjalan_umur'))", { Baris_tanpa_pic: ["Succeeded"], Baris_revisi_menggantung: ["Succeeded"], Baris_berakhir: ["Succeeded"] }),
    Isi_tim: tulis(isiTim, { Semua_proses: ["Succeeded"] }),

    Ada_agenda: kondisi(
      { or: [{ greater: [`@${N_ANTREAN}`, 0] }, { greater: [`@${N_BERJALAN}`, 0] }, { greater: [`@${N_BERAKHIR}`, 0] }] },
      {
        Kirim_ke_grup: kondisi(
          { and: [{ equals: [`@empty(${P}?['alamatGrupLegal'])`, false] }] },
          {
            Kirim_agenda_tim: kirimEmail({
              ke: "@outputs('Email_tim_legal')",
              subjek: `${awalanUji}[WiCon] Agenda pagi: @{${N_ANTREAN}} di antrean, @{${N_BERJALAN}} sedang ditangani, @{${N_PERHATIAN}} perlu perhatian`,
              isi: emailTim,
            }),
          },
          {
            Untuk_setiap_penerima: untukSetiap("@outputs('Penerima_agenda')", {
              Milik_saya: saring("@outputs('Semua_proses')", `@equals(toLower(coalesce(item()?['PicLegalEmail'],'')),${R}?['Email'])`),
              Baris_milik_saya: pilih("@body('Milik_saya')", barisBerjalan, { Milik_saya: ["Succeeded"] }),
              Kirim_agenda_pribadi: kirimEmail(
                {
                  ke: `@{if(empty(${UJI}),${R}?['Email'],${UJI})}`,
                  subjek: `${awalanUji}[WiCon] Agenda pagi: @{length(body('Milik_saya'))} milik Anda, @{${N_ANTREAN}} di antrean, @{${N_PERHATIAN}} perlu perhatian@{if(empty(${UJI}),'',concat(' (untuk ',if(empty(${R}?['Nama']),${R}?['Email'],${R}?['Nama']),')'))}`,
                  isi: emailPribadi,
                },
                { Baris_milik_saya: ["Succeeded"] },
              ),
            }),
          },
        ),
      },
      {},
      { Isi_tim: ["Succeeded"] },
    ),
  },
};
