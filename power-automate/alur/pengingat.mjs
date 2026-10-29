// Flow 2: pengingat harian pukul 07.00 WIB.
//   - Kontrak Aktif yang mendekati tanggal berakhir atau batas keputusan: email ke pengaju dan PIC Legal.
//     Ambang H-sekian dari Pengaturan (hariPeringatan, bawaan 90/60/30/7/0).
//   - Jaminan Aktif yang akan berakhir: email ke tim Legal. Ambang dari Pengaturan (jaminanPeringatan, bawaan 30/14/7).
//   - Kewajiban Terbuka yang jatuh tempo dalam 7/1/0 hari: email ke PIC kewajiban (atau tim Legal).
// Kolom PengingatTerakhir mencatat kapan pengingat terakhir dikirim. Tiap hari dihitung berapa ambang yang sudah
// dilewati (ambang >= sisa hari), untuk hari ini dan untuk tanggal pengingat terakhir. Bila hari ini lebih banyak, ada
// ambang baru yang terlewati dan pengingat dikirim. Jadi satu hari flow gagal tidak menghilangkan pengingat, dan satu
// ambang tidak dikirim dua kali. Untuk kontrak, hitungan ini dilakukan sekali untuk semua item sebelum perulangan.
//
// Kontrak mengikuti aturan src/lib/masa.ts:
//   akhir           BerakhirEfektif (sudah termasuk addendum), atau TanggalBerakhir bila BerakhirEfektif belum diisi.
//   batas keputusan akhir dikurangi MasaPemberitahuanHari, hanya bila masa pemberitahuan sudah dicatat.
//   Kontrak biasa diingatkan menjelang akhir, dan juga menjelang batas keputusan bila masa pemberitahuannya > 0.
//   Kontrak dengan PerpanjanganOtomatis = ya tidak disuruh mengajukan addendum: diingatkan menjelang batas keputusan,
//   atau menjelang tanggal perpanjangan bila masa pemberitahuannya belum dicatat.
//   Addendum tidak diingatkan sendiri; akhir kontrak induknya sudah memperhitungkannya.
import {
  APA_PUN,
  LIST,
  URL_APLIKASI,
  ZONA,
  W,
  FONT,
  adalahAddendumE,
  akhirKontrakE,
  ambilItem,
  barisTombol,
  ekspresiKelompok,
  escE,
  filterAkhirPalingLambat,
  filterAkhirSesudah,
  kerangka,
  kirimEmail,
  kondisi,
  paragraf,
  pemicuJadwal,
  petik,
  pilih,
  saring,
  selisihHariWib,
  tanggalPanjang,
  tombolHtml,
  tulis,
  ubahItem,
  untukSetiap,
} from "./umum.mjs";
import { aksiPengaturan, aksiTimLegal, awalanUji, jumlahAmbang } from "./pengaturan.mjs";

const HARI_INI = "outputs('Tanggal_hari_ini')";
const P = "outputs('Pengaturan')";
const UJI = "outputs('Email_uji')";
const AWAL_ZAMAN = "'1900-01-01T00:00:00Z'";

function kartuBaris(baris) {
  const isi = baris
    .map(([label, nilai], i) => `<tr><td width="150" valign="top" style="padding:9px 12px 9px 0;${i < baris.length - 1 ? `border-bottom:1px solid ${W.line};` : ""}font-family:${FONT};font-size:12px;line-height:18px;color:${W.muted};font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">${label}</td><td valign="top" style="padding:9px 0;${i < baris.length - 1 ? `border-bottom:1px solid ${W.line};` : ""}font-family:${FONT};font-size:14px;line-height:20px;color:${W.ink};">${nilai}</td></tr>`)
    .join("");
  return `<tr><td style="padding:18px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${W.line};border-radius:10px;background-color:${W.raised};" bgcolor="${W.raised}"><tr><td style="padding:6px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${isi}</table></td></tr></table></td></tr>`;
}

/** Kotak angka sisa hari. `nol` = ekspresi teks untuk hari H, `keterangan` = teks (boleh berisi @{...}). */
function kotakSisa(ekspresiSisa, { nol = "'Berakhir hari ini'", keterangan = "Dihitung dari tanggal hari ini (WIB)." } = {}) {
  return `<tr><td style="padding:18px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${W.accentSoft}" style="background-color:${W.accentSoft};border-radius:10px;"><tr><td width="96" align="center" valign="middle" style="padding:16px 8px 16px 18px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="72" height="72" align="center" valign="middle" bgcolor="@{if(lessOrEquals(${ekspresiSisa},7),'${W.danger}','${W.accent}')}" style="background-color:@{if(lessOrEquals(${ekspresiSisa},7),'${W.danger}','${W.accent}')};border-radius:14px;font-family:${FONT};font-size:30px;line-height:72px;font-weight:800;color:#ffffff;">@{if(less(${ekspresiSisa},0),'!',string(${ekspresiSisa}))}</td></tr></table></td><td valign="middle" style="padding:16px 18px 16px 8px;font-family:${FONT};"><div style="font-size:17px;line-height:24px;font-weight:800;color:${W.ink};">@{if(less(${ekspresiSisa},0),concat('Sudah lewat ',string(mul(${ekspresiSisa},-1)),' hari'),if(equals(${ekspresiSisa},0),${nol},concat('Sisa ',string(${ekspresiSisa}),' hari')))}</div><div style="font-size:13px;line-height:20px;color:${W.accentInk};">${keterangan}</div></td></tr></table></td></tr>`;
}

/** "Batas keputusan dalam 5 hari" / "... hari ini" / "... sudah lewat 2 hari" sebagai ekspresi. */
const frasaSisa = (s, { lewat, nol, dalam }) => `if(less(${s},0),concat('${lewat} ',string(mul(${s},-1)),' hari'),if(equals(${s},0),'${nol}',concat('${dalam} ',string(${s}),' hari')))`;

// --- Kontrak ---------------------------------------------------------------------------------------------------

const K = "items('Untuk_setiap_kontrak')";
const JK = "outputs('Jadwal_kontrak')";
const FK = "outputs('Fokus_kontrak')";
const AMBANG_K = `${P}?['hariPeringatan']`;

/** Aturan masa satu kontrak (`it` = ekspresi item kontrak), dipakai di penyaring sebelum perulangan dan di dalamnya. */
function aturanKontrak(it) {
  const akhir = akhirKontrakE(it);
  const adaMasa = `not(equals(${it}?['MasaPemberitahuanHari'],null))`;
  // Kolom angka bisa datang sebagai 30 atau 30.0; dibulatkan supaya selisih hari tetap bilangan bulat.
  const masa = `int(formatNumber(coalesce(${it}?['MasaPemberitahuanHari'],0),'0','en-US'))`;
  const otomatis = `equals(${it}?['PerpanjanganOtomatis'],true)`;
  const sisaAkhir = selisihHariWib("utcNow()", akhir);
  const sisaAkhirLalu = selisihHariWib(`coalesce(${it}?['PengingatTerakhir'],${AWAL_ZAMAN})`, akhir);
  // Tanggal berakhir ikut dihitung, kecuali kontrak otomatis yang batas keputusannya sudah diketahui.
  const pakaiAkhir = `not(and(${otomatis},${adaMasa}))`;
  // Batas keputusan ikut dihitung bila masa pemberitahuan dicatat (untuk kontrak biasa: lebih dari 0 hari).
  const pakaiBatas = `and(${adaMasa},or(${otomatis},greater(${masa},0)))`;
  /** Banyaknya ambang (ke akhir dan ke batas keputusan) yang sudah dilewati bila sisa hari ke akhir = `sisa`. */
  const terlewati = (sisa) => `add(if(${pakaiAkhir},${jumlahAmbang(AMBANG_K, sisa)},0),if(${pakaiBatas},${jumlahAmbang(AMBANG_K, `sub(${sisa},${masa})`)},0))`;
  return { akhir, adaMasa, masa, otomatis, sisaAkhir, sisaAkhirLalu, pakaiBatas, terlewati };
}

const { akhir: AKHIR, adaMasa: ADA_MASA, masa: MASA, otomatis: OTOMATIS, sisaAkhir: SISA_AKHIR, pakaiBatas: PAKAI_BATAS } = aturanKontrak(K);
const aturanItem = aturanKontrak("item()");

const sisaK = `${FK}?['sisa']`;
const ADA_MASA_J = `not(equals(${JK}?['masa'],null))`;
const TGL_BATAS = tanggalPanjang(`coalesce(${JK}?['batas'],${JK}?['akhir'])`);
const TGL_AKHIR = tanggalPanjang(`${JK}?['akhir']`);
const judulKontrak = `if(${JK}?['fokusBatas'],${frasaSisa(sisaK, { lewat: "Batas keputusan sudah lewat", nol: "Batas keputusan hari ini", dalam: "Batas keputusan dalam" })},if(${JK}?['otomatis'],${frasaSisa(sisaK, { lewat: "Perpanjangan otomatis sudah lewat", nol: "Diperpanjang otomatis hari ini", dalam: "Diperpanjang otomatis dalam" })},${frasaSisa(sisaK, { lewat: "Masa berlaku sudah lewat", nol: "Kontrak berakhir hari ini", dalam: "Kontrak berakhir dalam" })}))`;

const KALIMAT_OTOMATIS = "Kontrak di bawah ini <strong>diperpanjang otomatis</strong> sesuai klausulnya, jadi tidak perlu addendum perpanjangan.";
const pembukaKontrak =
  `@{if(${JK}?['otomatis'],` +
  `if(${ADA_MASA_J},concat('${petik(KALIMAT_OTOMATIS)} Bila kerja sama tidak ingin dilanjutkan atau syaratnya perlu dirundingkan ulang, sampaikan pemberitahuan ke mitra paling lambat <strong>',${TGL_BATAS},'</strong>.'),` +
  `concat('${petik(KALIMAT_OTOMATIS)} Tanggal perpanjangannya <strong>',${TGL_AKHIR},'</strong>. Masa pemberitahuannya belum dicatat, jadi batas keputusannya belum bisa dihitung. Mohon Legal melengkapinya di halaman kontrak.')),` +
  `concat('Kontrak di bawah ini akan segera berakhir. Bila kerja samanya masih berlanjut, ajukan <strong>addendum perpanjangan</strong> sebelum tanggal berakhir. Bila tidak, Legal akan menandainya Berakhir.',` +
  `if(greater(coalesce(${JK}?['masa'],0),0),concat(' Kontrak ini mensyaratkan pemberitahuan ke mitra ',string(coalesce(${JK}?['masa'],0)),' hari sebelum berakhir, jadi keputusan lanjut atau tidak perlu disampaikan paling lambat <strong>',${TGL_BATAS},'</strong>',if(less(sub(${JK}?['sisaAkhir'],coalesce(${JK}?['masa'],0)),0),' (sudah lewat).','.')),'')))}`;

// Tombol: kontrak otomatis tidak diberi tombol addendum, dan "Buka kontrak" menjadi tombol utama.
const [awalTombolAddendum, akhirTombolAddendum] = tombolHtml("Ajukan addendum perpanjangan", `${URL_APLIKASI}/#/saya/ajukan?induk=§`).split("§");
const tombolKontrak =
  `@{if(${JK}?['otomatis'],'',concat('${petik(awalTombolAddendum)}',string(${K}?['ID']),'${petik(`${akhirTombolAddendum}<span style="display:inline-block;width:10px;">&nbsp;</span>`)}'))}` +
  `<a href="${URL_APLIKASI}/#/saya/kontrak/@{${K}?['ID']}" target="_blank" style="display:inline-block;background-color:@{if(${JK}?['otomatis'],'${W.brand}','#ffffff')};border:2px solid ${W.brand};color:@{if(${JK}?['otomatis'],'#ffffff','${W.brand}')};font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;text-decoration:none;padding:10px 26px;border-radius:8px;">Buka kontrak</a>`;

const emailKontrak = kerangka({
  pratinjau: `@{${escE(`${K}?['Title']`)}}: @{if(${JK}?['fokusBatas'],concat('putuskan paling lambat ',${TGL_BATAS}),concat(if(${JK}?['otomatis'],'diperpanjang otomatis ','berakhir '),${TGL_AKHIR}))}.`,
  label: `@{if(${JK}?['otomatis'],'Perpanjangan otomatis',if(${JK}?['fokusBatas'],'Batas keputusan','Pengingat masa berlaku'))}`,
  judul: `@{${judulKontrak}}`,
  nada: "accent",
  isi:
    paragraf(`Halo. ${pembukaKontrak}`) +
    kotakSisa(sisaK, {
      nol: `if(${JK}?['fokusBatas'],'Batas keputusan hari ini',if(${JK}?['otomatis'],'Diperpanjang hari ini','Berakhir hari ini'))`,
      keterangan: `@{if(${JK}?['fokusBatas'],'Menuju batas keputusan. ',if(${JK}?['otomatis'],'Menuju tanggal perpanjangan. ','Menuju tanggal berakhir. '))}Dihitung dari tanggal hari ini (WIB).`,
    }) +
    kartuBaris([
      ["Nomor kontrak", `<strong style="font-family:Consolas,'Courier New',monospace;">@{coalesce(${K}?['NomorKontrak'],${K}?['NomorPengajuan'])}</strong>`],
      ["Judul", `<strong>@{${escE(`${K}?['Title']`)}}</strong>`],
      ["Mitra", `@{${escE(`${K}?['NamaMitra']`)}}`],
      ["Berakhir", `<strong>@{${TGL_AKHIR}}</strong> (@{if(${JK}?['otomatis'],'diperpanjang otomatis sesuai klausul','sudah termasuk addendum yang berlaku')})`],
      ["Batas keputusan", `@{if(equals(${JK}?['masa'],null),'Belum dicatat Legal',if(equals(${JK}?['masa'],0),'Tanpa masa pemberitahuan',concat('<strong>',${TGL_BATAS},'</strong> (',string(${JK}?['masa']),' hari sebelum berakhir)')))}`],
      ["Pengaju", `@{${escE(`${K}?['PengajuNama']`)}}`],
      ["PIC Legal", `@{${escE(`coalesce(${K}?['PicLegalNama'],'Belum ditetapkan')`)}}`],
    ]) +
    barisTombol(tombolKontrak),
});

// Pengaju dan PIC Legal. Bila belum ada PIC dan pengingatnya soal batas keputusan atau perpanjangan otomatis, tim Legal
// ikut menerima karena keputusan itu ada di tangan Legal.
const tambahanKontrak = `if(empty(${K}?['PicLegalEmail']),if(or(${JK}?['fokusBatas'],${JK}?['otomatis']),outputs('Email_tim_legal'),''),${K}?['PicLegalEmail'])`;

// Batas pengambilan: hari ini ditambah ambang terbesar (bawaan 90 hari).
const BATAS_AMBIL = `@{addDays(${HARI_INI},max(${AMBANG_K}),'yyyy-MM-dd')}`;

const blokKontrak = {
  Ambil_kontrak_berakhir: ambilItem(
    LIST.kontrak,
    { filter: `Status eq 'Aktif' and Diarsipkan ne 1 and ${filterAkhirPalingLambat(BATAS_AMBIL)}`, urut: "ID asc", semua: true },
    { Email_tim_legal: ["Succeeded"] },
  ),
  // Kontrak dengan masa pemberitahuan: batas keputusannya bisa jatuh jauh sebelum tanggal berakhir, jadi diambil
  // terpisah, hanya yang tidak sudah terambil di atas (supaya satu kontrak tidak diproses dua kali dalam satu jalan).
  // Bila kolom MasaPemberitahuanHari belum ada di list, aksi ini gagal dan pengingat biasa tetap jalan.
  Ambil_kontrak_masa: ambilItem(
    LIST.kontrak,
    { filter: `Status eq 'Aktif' and Diarsipkan ne 1 and MasaPemberitahuanHari gt 0 and ${filterAkhirSesudah(BATAS_AMBIL)}`, urut: "ID asc", semua: true },
    { Email_tim_legal: ["Succeeded"] },
  ),
  Kontrak_dipantau: saring(
    "@union(body('Ambil_kontrak_berakhir')?['value'],coalesce(actions('Ambil_kontrak_masa')?['outputs']?['body']?['value'],json('[]')))",
    `@and(not(equals(${akhirKontrakE("item()")},null)),not(${adalahAddendumE("item()")}))`,
    { Ambil_kontrak_berakhir: ["Succeeded"], Ambil_kontrak_masa: APA_PUN },
  ),
  // Ambang yang sudah dilewati hari ini dan pada tanggal pengingat terakhir, dihitung sekali untuk semua kontrak.
  // Perulangan di bawah hanya menerima kontrak yang memang perlu diingatkan, jadi jatah aksi harian Power Automate
  // tidak habis untuk kontrak yang masa pemberitahuannya masih jauh.
  Kontrak_dinilai: pilih(
    "@body('Kontrak_dipantau')",
    `@addProperty(addProperty(item(),'AmbangKini',${aturanItem.terlewati(aturanItem.sisaAkhir)}),'AmbangLalu',${aturanItem.terlewati(aturanItem.sisaAkhirLalu)})`,
    { Kontrak_dipantau: ["Succeeded"] },
  ),
  Kontrak_perlu_diingatkan: saring("@body('Kontrak_dinilai')", "@greater(item()?['AmbangKini'],item()?['AmbangLalu'])", { Kontrak_dinilai: ["Succeeded"] }),
  Untuk_setiap_kontrak: untukSetiap(
    "@body('Kontrak_perlu_diingatkan')",
    {
      Jadwal_kontrak: tulis({
        akhir: `@${AKHIR}`,
        otomatis: `@${OTOMATIS}`,
        masa: `@if(${ADA_MASA},${MASA},null)`,
        batas: `@if(${ADA_MASA},addDays(${AKHIR},mul(${MASA},-1)),null)`,
        sisaAkhir: `@${SISA_AKHIR}`,
        fokusBatas: `@and(${PAKAI_BATAS},or(${OTOMATIS},greaterOrEquals(sub(${SISA_AKHIR},${MASA}),0)))`,
      }),
      Fokus_kontrak: tulis(
        {
          sisa: `@if(${JK}?['fokusBatas'],sub(${JK}?['sisaAkhir'],coalesce(${JK}?['masa'],0)),${JK}?['sisaAkhir'])`,
          tanggal: `@if(${JK}?['fokusBatas'],coalesce(${JK}?['batas'],${JK}?['akhir']),${JK}?['akhir'])`,
        },
        { Jadwal_kontrak: ["Succeeded"] },
      ),
      Kirim_pengingat_kontrak: kirimEmail(
        {
          ke: `@{if(not(empty(${UJI})),${UJI},concat(${K}?['PengajuEmail'],if(empty(${tambahanKontrak}),'',concat(';',${tambahanKontrak}))))}`,
          subjek: `${awalanUji}[WiCon] @{${judulKontrak}}: @{${K}?['Title']}`,
          isi: emailKontrak,
          penting: `@{if(lessOrEquals(${sisaK},7),'High','Normal')}`,
        },
        { Fokus_kontrak: ["Succeeded"] },
      ),
      Catat_pengingat_kontrak: ubahItem(LIST.kontrak, `@${K}?['ID']`, { Title: `@${K}?['Title']`, PengingatTerakhir: `@${HARI_INI}` }, { Kirim_pengingat_kontrak: ["Succeeded"] }),
    },
    { Kontrak_perlu_diingatkan: ["Succeeded"] },
  ),
};

// --- Jaminan ---------------------------------------------------------------------------------------------------

const J = "items('Untuk_setiap_jaminan')";
const sisaJ = "outputs('Sisa_hari_jaminan')";
const AMBANG_J = `${P}?['jaminanPeringatan']`;
const emailJaminan = kerangka({
  pratinjau: `@{${J}?['JenisJaminan']?['Value']} @{${escE(`${J}?['Title']`)}} berakhir @{${tanggalPanjang(`${J}?['TanggalBerakhirJaminan']`)}}.`,
  label: "Pengingat jaminan",
  judul: `@{if(less(${sisaJ},0),'Jaminan sudah lewat masa berlaku',if(equals(${sisaJ},0),'Jaminan berakhir hari ini',concat('Jaminan berakhir dalam ',string(${sisaJ}),' hari')))}`,
  nada: "danger",
  isi:
    paragraf(`Jaminan berikut akan habis masa berlakunya. Mintakan perpanjangan ke penerbit bila kontraknya masih berjalan, atau tandai <strong>Dikembalikan</strong> bila kewajiban mitra sudah selesai.`) +
    kotakSisa(sisaJ) +
    kartuBaris([
      ["Jenis", `<strong>@{${J}?['JenisJaminan']?['Value']}</strong>`],
      ["Nomor", `<span style="font-family:Consolas,'Courier New',monospace;">@{${escE(`${J}?['Title']`)}}</span>`],
      ["Penerbit", `@{${escE(`${J}?['Penerbit']`)}}`],
      ["Nilai", `@{${J}?['MataUangJaminan']?['Value']} @{formatNumber(coalesce(${J}?['NilaiJaminan'],0),'N0','id-ID')}`],
      ["Berakhir", `<strong>@{${tanggalPanjang(`${J}?['TanggalBerakhirJaminan']`)}}</strong>`],
    ]) +
    barisTombol(tombolHtml("Buka kontrak", `${URL_APLIKASI}/#/kontrak/@{${J}?['KontrakId']}`)),
});

const blokJaminan = {
  Ambil_jaminan_berakhir: ambilItem(
    LIST.jaminan,
    { filter: `StatusJaminan eq 'Aktif' and TanggalBerakhirJaminan le '@{addDays(${HARI_INI},max(${AMBANG_J}),'yyyy-MM-dd')}'`, semua: true },
    { Email_tim_legal: ["Succeeded"] },
  ),
  Untuk_setiap_jaminan: untukSetiap(
    `@body('Ambil_jaminan_berakhir')?['value']`,
    {
      Sisa_hari_jaminan: tulis(`@${selisihHariWib("utcNow()", `${J}?['TanggalBerakhirJaminan']`)}`),
      Kelompok_jaminan: tulis(
        {
          kini: `@${jumlahAmbang(AMBANG_J, sisaJ)}`,
          lalu: `@${jumlahAmbang(AMBANG_J, selisihHariWib(`coalesce(${J}?['PengingatTerakhir'],${AWAL_ZAMAN})`, `${J}?['TanggalBerakhirJaminan']`))}`,
        },
        { Sisa_hari_jaminan: ["Succeeded"] },
      ),
      Perlu_ingatkan_jaminan: kondisi(
        { and: [{ greater: ["@outputs('Kelompok_jaminan')?['kini']", "@outputs('Kelompok_jaminan')?['lalu']"] }] },
        {
          Kirim_pengingat_jaminan: kirimEmail({
            ke: "@outputs('Email_tim_legal')",
            subjek: `${awalanUji}[WiCon] Jaminan @{if(less(${sisaJ},0),'sudah lewat',concat('berakhir ',if(equals(${sisaJ},0),'hari ini',concat('dalam ',string(${sisaJ}),' hari'))))}: @{${J}?['JenisJaminan']?['Value']} @{${J}?['Title']}`,
            isi: emailJaminan,
            penting: "High",
          }),
          Catat_pengingat_jaminan: ubahItem(LIST.jaminan, `@${J}?['ID']`, { Title: `@${J}?['Title']`, PengingatTerakhir: `@${HARI_INI}` }, { Kirim_pengingat_jaminan: ["Succeeded"] }),
        },
        {},
        { Kelompok_jaminan: ["Succeeded"] },
      ),
    },
    { Ambil_jaminan_berakhir: ["Succeeded"] },
  ),
};

// --- Kewajiban -------------------------------------------------------------------------------------------------
// Ambang kewajiban (7/1/0 hari) tidak diatur di Pengaturan.

const KW = "items('Untuk_setiap_kewajiban')";
const sisaKW = "outputs('Sisa_hari_kewajiban')";
const emailKewajiban = kerangka({
  pratinjau: `@{${escE(`${KW}?['Title']`)}} jatuh tempo @{${tanggalPanjang(`${KW}?['JatuhTempo']`)}}.`,
  label: "Pengingat kewajiban",
  judul: `@{if(less(${sisaKW},0),'Kewajiban sudah lewat jatuh tempo',if(equals(${sisaKW},0),'Kewajiban jatuh tempo hari ini',concat('Kewajiban jatuh tempo dalam ',string(${sisaKW}),' hari')))}`,
  nada: "accent",
  isi:
    paragraf(`Ada kewajiban kontrak yang perlu diselesaikan. Setelah selesai, buka kontraknya dan tekan <strong>Tandai selesai</strong> (lampirkan buktinya, mis. BAST).`) +
    kotakSisa(sisaKW, { nol: "'Jatuh tempo hari ini'" }) +
    kartuBaris([
      ["Kewajiban", `<strong>@{${escE(`${KW}?['Title']`)}}</strong>`],
      ["Tipe", `@{${KW}?['TipeKewajiban']?['Value']}`],
      ["Jatuh tempo", `<strong>@{${tanggalPanjang(`${KW}?['JatuhTempo']`)}}</strong>`],
      ["Catatan", `@{${escE(`${KW}?['CatatanKewajiban']`)}}`],
    ]) +
    barisTombol(tombolHtml("Buka kontrak", `${URL_APLIKASI}/#/saya/kontrak/@{${KW}?['KontrakId']}`)),
});

const blokKewajiban = {
  Ambil_kewajiban: ambilItem(LIST.kewajiban, { filter: `StatusKewajiban eq 'Terbuka' and JatuhTempo le '@{addDays(${HARI_INI},7,'yyyy-MM-dd')}'`, semua: true }, { Email_tim_legal: ["Succeeded"] }),
  Untuk_setiap_kewajiban: untukSetiap(
    `@body('Ambil_kewajiban')?['value']`,
    {
      Sisa_hari_kewajiban: tulis(`@${selisihHariWib("utcNow()", `${KW}?['JatuhTempo']`)}`),
      Kelompok_kewajiban: tulis(
        {
          kini: `@${ekspresiKelompok(sisaKW, [7, 1, 0])}`,
          lalu: `@${ekspresiKelompok(selisihHariWib(`coalesce(${KW}?['PengingatTerakhir'],${AWAL_ZAMAN})`, `${KW}?['JatuhTempo']`), [7, 1, 0])}`,
        },
        { Sisa_hari_kewajiban: ["Succeeded"] },
      ),
      Perlu_ingatkan_kewajiban: kondisi(
        { and: [{ less: ["@outputs('Kelompok_kewajiban')?['kini']", "@outputs('Kelompok_kewajiban')?['lalu']"] }] },
        {
          Kirim_pengingat_kewajiban: kirimEmail({
            ke: `@{if(not(empty(${UJI})),${UJI},if(empty(${KW}?['PicEmail']),outputs('Email_tim_legal'),${KW}?['PicEmail']))}`,
            subjek: `${awalanUji}[WiCon] Kewajiban jatuh tempo: @{${KW}?['Title']}`,
            isi: emailKewajiban,
          }),
          Catat_pengingat_kewajiban: ubahItem(LIST.kewajiban, `@${KW}?['ID']`, { Title: `@${KW}?['Title']`, PengingatTerakhir: `@${HARI_INI}` }, { Kirim_pengingat_kewajiban: ["Succeeded"] }),
        },
        {},
        { Kelompok_kewajiban: ["Succeeded"] },
      ),
    },
    { Ambil_kewajiban: ["Succeeded"] },
  ),
};

export default {
  // ID tetap: impor ulang memperbarui flow yang sama, tidak membuat salinan baru.
  id: "cdb6c1c6-e003-4416-a5cc-0269dece49d0",
  nama: "WiCon - Pengingat harian (berakhir, jaminan, kewajiban)",
  berkas: "KontrakWKI-PengingatHarian",
  koneksi: ["sharepoint", "outlook"],
  pemicu: { Setiap_pagi: pemicuJadwal({ frekuensi: "Day", jam: 7 }) },
  aksi: {
    Tanggal_hari_ini: tulis(`@formatDateTime(convertTimeZone(utcNow(),'UTC','${ZONA}'),'yyyy-MM-dd')`),
    ...aksiPengaturan(["hariPeringatan", "jaminanPeringatan", "alamatGrupLegal"], { Tanggal_hari_ini: ["Succeeded"] }),
    ...aksiTimLegal({ Email_uji: ["Succeeded"] }),
    ...blokKontrak,
    ...blokJaminan,
    ...blokKewajiban,
  },
};
