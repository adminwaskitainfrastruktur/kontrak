// Bahan bersama semua flow: alamat site dan list, pembuat aksi SharePoint dan Outlook, serta kerangka HTML email
// (palet dan gaya sama dengan src/lib/emailKit.ts supaya email dari aplikasi dan dari flow terlihat satu keluarga).

export const SITE = "https://waskitainfra.sharepoint.com/sites/KontrakWKI";
export const LIST = {
  kontrak: "0288609d-15ba-4e92-8afb-a2e4d491dc3a",
  pengguna: "8ddfa9ba-0fa4-407a-8017-78d4c41c1fdb",
  notifikasi: "989a651f-10b2-4922-9297-ca56f736579f",
  jaminan: "8b435619-72ca-4c7d-a470-99e77d90f89f",
  kewajiban: "61677c2e-cac1-48ed-a7f9-eb41b4f09d9e",
  pengaturan: "2b89317d-807b-4b1c-96e5-52640a58708e",
  aktivitas: "47b3dcbf-ff54-45ca-b05d-18d922ca2e24",
};
export const URL_APLIKASI = "https://wicon.waskitainfrastruktur.co.id";
export const ZONA = "SE Asia Standard Time";
/** Domain email perusahaan (sama dengan DOMAIN_KANTOR di src/config.ts). */
export const DOMAIN_KANTOR = "waskitainfrastruktur.co.id";
/** Akun admin bawaan aplikasi: penerima cadangan bila list Pengguna belum berisi Legal/Admin. */
export const ADMIN_BAWAAN = "adminapp@waskitainfrastruktur.co.id";
/** Aksi berikutnya tetap jalan apa pun hasil aksi sebelumnya (untuk langkah "pakai bawaan bila gagal"). */
export const APA_PUN = ["Succeeded", "Failed", "Skipped", "TimedOut"];

/** Teks untuk string literal di dalam ekspresi: petik tunggal digandakan. */
export const petik = (s) => s.replace(/'/g, "''");

const AUTH = "@parameters('$authentication')";

/** Pemicu SharePoint "When an item is created" (atau "modified") yang memeriksa tiap menit, satu jalan per item. */
export function pemicuItemBaru(tabel, runs = 1, operationId = "GetOnNewItems") {
  return {
    inputs: {
      host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_sharepointonline", connectionName: "shared_sharepointonline", operationId },
      parameters: { dataset: SITE, table: tabel },
      authentication: AUTH,
    },
    recurrence: { interval: 1, frequency: "Minute" },
    splitOn: "@triggerOutputs()?['body/value']",
    metadata: { operationMetadataId: crypto.randomUUID() },
    runtimeConfiguration: { concurrency: { runs } },
    type: "OpenApiConnection",
  };
}

export const pemicuItemDiubah = (tabel, runs = 1) => pemicuItemBaru(tabel, runs, "GetOnUpdatedItems");

/** Tambah item ke list SharePoint. */
export function tambahItem(tabel, item, runAfter = {}) {
  const parameters = { dataset: SITE, table: tabel };
  for (const [k, v] of Object.entries(item)) parameters[`item/${k}`] = v;
  return {
    runAfter,
    metadata: { operationMetadataId: crypto.randomUUID() },
    type: "OpenApiConnection",
    inputs: { host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_sharepointonline", connectionName: "shared_sharepointonline", operationId: "PostItem" }, parameters, authentication: AUTH },
  };
}

/** "Send an HTTP request to SharePoint" (konektor standar). `uri` relatif terhadap site. */
export function httpSharePoint(uri, runAfter = {}) {
  return {
    runAfter,
    metadata: { operationMetadataId: crypto.randomUUID() },
    type: "OpenApiConnection",
    inputs: {
      host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_sharepointonline", connectionName: "shared_sharepointonline", operationId: "HttpRequest" },
      parameters: { dataset: SITE, "parameters/method": "GET", "parameters/uri": uri, "parameters/headers": { Accept: "application/json;odata=nometadata" } },
      authentication: AUTH,
    },
  };
}

export const variabelInit = (nama, tipe, nilai, runAfter = {}) => ({ runAfter, type: "InitializeVariable", inputs: { variables: [{ name: nama, type: tipe, value: nilai }] } });

/** Escape HTML untuk nilai dinamis di dalam ekspresi Power Automate. */
export const escE = (ekspresi) => `replace(replace(replace(string(coalesce(${ekspresi},'')),'&','&amp;'),'<','&lt;'),'>','&gt;')`;

/** Kelompok sisa hari ke ambang pengingat terdekat: ambang terkecil t dengan d <= t, atau 999 bila di atas semuanya. */
export function ekspresiKelompok(dEkspresi, ambang) {
  const urut = [...ambang].sort((a, b) => a - b);
  let e = "999";
  for (let i = urut.length - 1; i >= 0; i--) e = `if(lessOrEquals(${dEkspresi},${urut[i]}),${urut[i]},${e})`;
  return e;
}

/** Selisih hari dua tanggal (string ISO), dihitung pada tanggal WIB. */
export const selisihHariWib = (dariIso, keIso) => `div(sub(ticks(convertTimeZone(${keIso},'UTC','${ZONA}','yyyy-MM-dd')),ticks(convertTimeZone(${dariIso},'UTC','${ZONA}','yyyy-MM-dd'))),864000000000)`;

/** Pemicu jadwal. `hari` kosong = tiap hari. */
export function pemicuJadwal({ frekuensi = "Week", jam, menit = 0, hari, tanggal }) {
  const schedule = { hours: [String(jam)], minutes: [menit] };
  if (hari) schedule.weekDays = hari;
  if (tanggal) schedule.monthDays = [tanggal];
  return { recurrence: { frequency: frekuensi, interval: 1, schedule, timeZone: ZONA }, metadata: { operationMetadataId: crypto.randomUUID() }, type: "Recurrence" };
}

export const HARI_KERJA = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/**
 * "Get items". `semua` menyalakan paginasi (sampai 5000 item) supaya list yang besar tidak terpotong di halaman
 * pertama; tanpa itu hanya `atas` item pertama yang diambil.
 */
export function ambilItem(tabel, { filter, urut, atas = 500, semua = false }, runAfter = {}) {
  const parameters = { dataset: SITE, table: tabel, $top: atas };
  if (filter) parameters.$filter = filter;
  if (urut) parameters.$orderby = urut;
  const aksi = {
    runAfter,
    metadata: { operationMetadataId: crypto.randomUUID() },
    type: "OpenApiConnection",
    inputs: { host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_sharepointonline", connectionName: "shared_sharepointonline", operationId: "GetItems" }, parameters, authentication: AUTH },
  };
  if (semua) aksi.runtimeConfiguration = { paginationPolicy: { minimumItemCount: 5000 } };
  return aksi;
}

export function ubahItem(tabel, id, item, runAfter = {}) {
  const parameters = { dataset: SITE, table: tabel, id };
  for (const [k, v] of Object.entries(item)) parameters[`item/${k}`] = v;
  return {
    runAfter,
    metadata: { operationMetadataId: crypto.randomUUID() },
    type: "OpenApiConnection",
    inputs: { host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_sharepointonline", connectionName: "shared_sharepointonline", operationId: "PatchItem" }, parameters, authentication: AUTH },
  };
}

export function kirimEmail({ ke, subjek, isi, cc, penting = "Normal" }, runAfter = {}) {
  const parameters = { "emailMessage/To": ke, "emailMessage/Subject": subjek, "emailMessage/Body": isi, "emailMessage/Importance": penting };
  if (cc) parameters["emailMessage/Cc"] = cc;
  return {
    runAfter,
    metadata: { operationMetadataId: crypto.randomUUID() },
    type: "OpenApiConnection",
    inputs: { host: { apiId: "/providers/Microsoft.PowerApps/apis/shared_office365", connectionName: "shared_office365", operationId: "SendEmailV2" }, parameters, authentication: AUTH },
  };
}

export const tulis = (inputs, runAfter = {}) => ({ runAfter, type: "Compose", inputs });
export const pilih = (dari, peta, runAfter = {}) => ({ runAfter, type: "Select", inputs: { from: dari, select: peta } });
export const saring = (dari, kondisi, runAfter = {}) => ({ runAfter, type: "Query", inputs: { from: dari, where: kondisi } });
export const kondisi = (ekspresi, ya, tidak = {}, runAfter = {}) => ({ runAfter, type: "If", expression: ekspresi, actions: ya, else: { actions: tidak } });
export const untukSetiap = (dari, aksi, runAfter = {}, konkuren = 1) => ({ runAfter, type: "Foreach", foreach: dari, actions: aksi, runtimeConfiguration: { concurrency: { repetitions: konkuren } } });

/**
 * Teks literal untuk parameter Power Automate. "@" hanya istimewa di awal string (awal ekspresi) dan sebagai "@{"
 * (interpolasi); keduanya di-escape, "@" lain (mis. "@media" di tengah CSS) dibiarkan.
 */
export const lit = (s) => s.replace(/@\{/g, "@@{").replace(/^@/, "@@");

// --- Kerangka HTML ------------------------------------------------------------------------------------------

export const W = {
  navy: "#0b1f3a", brand: "#0a7f79", brandSoft: "#e3f4f2", accent: "#e5a62c", accentSoft: "#fdf3dc", accentInk: "#7a5200",
  ink: "#1f2a37", muted: "#64748b", line: "#e2e8f0", bg: "#f2f5f9", surface: "#ffffff", raised: "#f8fafc",
  success: "#15803d", danger: "#b91c1c", dangerSoft: "#fde8e8", info: "#2563eb",
};
export const FONT = "'Segoe UI',Calibri,Arial,Helvetica,sans-serif";

/**
 * Kerangka email. `pratinjau`, `label`, dan `judul` boleh berisi ekspresi @{...}; ketiganya disisipkan apa adanya
 * (tidak lewat lit) supaya ekspresinya dievaluasi, termasuk di <title>.
 */
export function kerangka({ pratinjau, label, judul, isi, nada = "brand" }) {
  const pita = { brand: W.brand, accent: W.accent, success: W.success, danger: W.danger }[nada];
  return lit(`<!DOCTYPE html><html lang="id" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>`) + judul + lit(`</title><!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--><style>body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;}table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}a{color:${W.brand};}@media only screen and (max-width:640px){.lebar{width:100%!important;}}</style></head><body style="margin:0;padding:0;background-color:${W.bg};" bgcolor="${W.bg}"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${W.bg};">`) + pratinjau + lit(`&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${W.bg}" style="background-color:${W.bg};"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" class="lebar" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;"><tr><td bgcolor="${W.navy}" style="background-color:${W.navy};border-radius:14px 14px 0 0;padding:22px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" width="44"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="40" height="40" align="center" valign="middle" bgcolor="${W.brand}" style="background-color:${W.brand};border-radius:10px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:40px;font-weight:700;color:#ffffff;">W</td></tr></table></td><td valign="middle" style="padding-left:12px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:26px;color:#ffffff;font-weight:700;">WiCon<div style="font-family:${FONT};font-size:11px;line-height:16px;font-weight:600;color:#9db4d3;letter-spacing:1.2px;text-transform:uppercase;">Contract Management &amp; Dashboard</div></td></tr></table></td></tr><tr><td height="5" bgcolor="${pita}" style="background-color:${pita};font-size:0;line-height:0;">&nbsp;</td></tr><tr><td bgcolor="${W.surface}" style="background-color:${W.surface};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:28px 32px 0 32px;"><div style="font-family:${FONT};font-size:12px;line-height:18px;font-weight:800;color:${pita};text-transform:uppercase;letter-spacing:1px;">`) + label + lit(`</div><div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:34px;color:${W.navy};font-weight:700;padding-top:4px;">`) + judul + lit(`</div></td></tr>`) + isi + lit(`<tr><td style="padding:18px 32px 28px 32px;">&nbsp;</td></tr></table></td></tr><tr><td bgcolor="${W.raised}" style="background-color:${W.raised};border-top:1px solid ${W.line};border-radius:0 0 14px 14px;padding:16px 32px;font-family:${FONT};font-size:12px;line-height:18px;color:${W.muted};">Email otomatis dari <strong>WiCon</strong>, PT Waskita Karya Infrastruktur. Mohon tidak membalas email ini. Waktu ditampilkan dalam WIB.</td></tr></table></td></tr></table></body></html>`);
}

export const paragraf = (html) => `<tr><td style="padding:14px 32px 0 32px;font-family:${FONT};font-size:15px;line-height:24px;color:${W.ink};">${html}</td></tr>`;
export const seksi = (judul, html) => `<tr><td style="padding:22px 32px 0 32px;"><div style="font-family:${FONT};font-size:13px;line-height:18px;font-weight:800;color:${W.brand};text-transform:uppercase;letter-spacing:0.8px;padding-bottom:10px;">${judul}</div>${html}</td></tr>`;
export const tombolHtml = (label, urlEkspresi) => `<a href="${urlEkspresi}" target="_blank" style="display:inline-block;background-color:${W.brand};border:2px solid ${W.brand};color:#ffffff;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;text-decoration:none;padding:10px 26px;border-radius:8px;">${label}</a>`;
export const barisTombol = (html) => `<tr><td style="padding:26px 32px 8px 32px;">${html}</td></tr>`;

/** Satu sel angka ringkasan (KPI) untuk baris ringkasan di email. */
export function kpi(label, nilaiEkspresi, warna = W.brand) {
  return `<td width="33%" align="center" style="padding:0 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${W.raised}" style="background-color:${W.raised};border:1px solid ${W.line};border-radius:10px;padding:14px 6px;"><div style="font-family:${FONT};font-size:30px;line-height:34px;font-weight:800;color:${warna};">${nilaiEkspresi}</div><div style="font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;color:${W.muted};text-transform:uppercase;letter-spacing:0.5px;">${label}</div></td></tr></table></td>`;
}

export const sel = (isi, { lebar, rata = "left", tebal = false, warna = W.ink } = {}) =>
  `<td${lebar ? ` width="${lebar}"` : ""} align="${rata}" valign="top" style="padding:9px 10px;border-bottom:1px solid ${W.line};font-family:${FONT};font-size:13px;line-height:18px;color:${warna};${tebal ? "font-weight:700;" : ""}">${isi}</td>`;

export const kepalaTabel = (...kolom) =>
  `<tr>${kolom.map(([t, lebar, rata]) => `<td${lebar ? ` width="${lebar}"` : ""} align="${rata ?? "left"}" bgcolor="${W.navy}" style="padding:8px 10px;background-color:${W.navy};font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">${t}</td>`).join("")}</tr>`;

export const bungkusTabel = (isi) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${W.line};border-radius:10px;">${isi}</table>`;

// --- Ekspresi yang sering dipakai ------------------------------------------------------------------------------

/** Tanggal-jam WIB: "02 Okt 2026, 14.35". */
export const waktuWib = (ekspresiIso) => `formatDateTime(convertTimeZone(${ekspresiIso},'UTC','${ZONA}'),'dd MMM yyyy, HH.mm','id-ID')`;
/** Hari kalender sejak sebuah waktu ISO (bilangan bulat). */
export const hariSejak = (ekspresiIso) => `div(sub(ticks(utcNow()),ticks(${ekspresiIso})),864000000000)`;
export const hariIniWib = () => `formatDateTime(convertTimeZone(utcNow(),'UTC','${ZONA}'),'yyyy-MM-dd')`;
/** Bagian bulat bilangan tak negatif (6,9 hari -> 6). Ekspresi Power Automate tidak punya floor(). */
export const bulatBawah = (ekspresi) => `int(first(split(formatNumber(${ekspresi},'0.000','en-US'),'.')))`;
/** Tanggal kolom SharePoint (ISO UTC) sebagai teks tanggal WIB, mis. "31 Des 2026". */
export const tanggalPendek = (ekspresiIso) => `formatDateTime(convertTimeZone(${ekspresiIso},'UTC','${ZONA}'),'d MMM yyyy','id-ID')`;
/** Tanggal panjang WIB, mis. "31 Desember 2026". */
export const tanggalPanjang = (ekspresiIso) => `formatDateTime(convertTimeZone(${ekspresiIso},'UTC','${ZONA}'),'d MMMM yyyy','id-ID')`;

/** Lencana kecil (pil) untuk tabel email. */
export const lencana = (teks, latar, tinta) => `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;background-color:${latar};color:${tinta};">${teks}</span>`;

/** Akhir masa berlaku: BerakhirEfektif (sudah termasuk addendum), atau TanggalBerakhir untuk kontrak lama yang belum diisi. */
export const akhirKontrakE = (it) => `coalesce(${it}?['BerakhirEfektif'],${it}?['TanggalBerakhir'])`;
/** Sama dengan adalahAddendum di src/lib/addendum.ts: jenis Addendum dan punya kontrak induk. */
export const adalahAddendumE = (it) => `and(equals(${it}?['JenisKontrak']?['Value'],'Addendum / Amandemen'),not(equals(${it}?['KontrakIndukId'],null)))`;
/**
 * Potongan $filter: akhir masa berlaku paling lambat `batas` (teks yyyy-MM-dd atau @{...}). Kontrak yang
 * BerakhirEfektif-nya masih kosong tetap terjaring lewat TanggalBerakhir.
 */
export const filterAkhirPalingLambat = (batas) => `(BerakhirEfektif le '${batas}' or (BerakhirEfektif eq null and TanggalBerakhir le '${batas}'))`;
/** Kebalikan filterAkhirPalingLambat: akhir masa berlaku sesudah `batas`. Dipakai supaya dua pengambilan tidak tumpang tindih. */
export const filterAkhirSesudah = (batas) => `(BerakhirEfektif gt '${batas}' or (BerakhirEfektif eq null and TanggalBerakhir gt '${batas}'))`;
