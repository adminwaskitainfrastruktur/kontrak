// Pengaturan Kontrak (K05) untuk flow. List "Pengaturan Kontrak" berisi satu baris per kunci: Title = kunci,
// NilaiJson = nilai dalam JSON. Nama kunci, bentuk JSON, batas, dan nilai bawaan di sini HARUS sama dengan
// src/lib/pengaturan.ts (PENGATURAN_BAWAAN dan validasiNilai); scripts/uji-flow.ts membandingkan keduanya.
//
// Per kunci yang dipakai sebuah flow:
//   Baris_<kunci>    baris dengan Title = kunci (ID terkecil, yaitu baris yang ditulis aplikasi).
//   Nilai_<kunci>    NilaiJson yang sudah diurai. Baris yang tidak ada atau kosong dibaca sebagai nilai bawaan.
//                    NilaiJson yang bukan JSON membuat json() gagal sehingga aksi ini Failed: disengaja, artinya
//                    "pakai bawaan", sama seperti aplikasi. Kunci bernilai teks atau ya/tidak (TEKS_MENTAH) disimpan
//                    sebagai teks JSON-nya, tanpa json(), supaya tidak bergantung pada json() untuk nilai tunggal.
//   Periksa_<kunci>  periksa dengan aturan yang sama dengan aplikasi. Hasilnya nilai yang sudah dirapikan, atau null
//                    bila tidak sah. Dipisah dari Nilai_<kunci> supaya ekspresinya jauh di bawah batas 8.192 karakter.
//   Pengaturan       satu objek berisi semua kunci, jalan setelah semua Periksa_* apa pun hasilnya.
// Bila list Pengaturan tidak bisa dibaca sama sekali, Email_uji tidak jalan dan flow berhenti tanpa mengirim apa pun,
// supaya email tidak pernah lolos ke penerima sungguhan saat mode uji mungkin sedang menyala.
import { ADMIN_BAWAAN, APA_PUN, LIST, ambilItem, petik, pilih, saring, tulis } from "./umum.mjs";

/** Sama dengan PENGATURAN_BAWAAN di src/lib/pengaturan.ts untuk kunci yang dibaca flow. */
export const BAWAAN = {
  hariPeringatan: [90, 60, 30, 7, 0],
  sla: { Diajukan: 2, "Review Legal": 7, "Perlu Revisi": 5, "Proses Tanda Tangan": 7 },
  slaPakaiHariKerja: false,
  hariKerja: [1, 2, 3, 4, 5],
  alamatGrupLegal: "",
  ambangEskalasi: { diajukanTanpaPicHari: 2, revisiMenggantungHari: 7 },
  jaminanPeringatan: [30, 14, 7],
};
export const STATUS_SLA = Object.keys(BAWAAN.sla);

/**
 * Nilai bawaan sebagai ekspresi. Teks, angka, dan ya/tidak ditulis langsung (tanpa json()) supaya aksi Pengaturan,
 * yang menjadi gerbang seluruh flow, tidak pernah gagal karena nilai bawaannya.
 */
export function bawaanE(kunci) {
  const v = BAWAAN[kunci];
  if (typeof v === "string") return `'${petik(v)}'`;
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  return `json('${petik(JSON.stringify(v))}')`;
}

/** Kunci yang diperiksa dari teks JSON mentahnya (lihat keterangan di atas). */
const TEKS_MENTAH = new Set(["slaPakaiHariKerja", "alamatGrupLegal"]);

// --- Pemeriksa per kunci (padanan validasiNilai di aplikasi) ----------------------------------------------------

const KARAKTER_ANGKA = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ",", ".", "-", " ", "[", "]"];
/** Teks yang tersisa setelah angka, koma, titik, minus, spasi, dan kurung siku dibuang. Kosong = daftar angka polos. */
const sisaBukanAngka = (teks) => KARAKTER_ANGKA.reduce((e, c) => `replace(${e},'${c}','')`, teks);

/**
 * Daftar angka sebagai XML (`<r><t>90</t><t>60</t></r>`) supaya bisa dihitung dengan XPath: ekspresi Power Automate
 * tidak punya perulangan, sedangkan count() XPath bisa menyaring anggota daftar dalam satu ekspresi.
 */
const xmlDaftar = (daftar) => `xml(json(concat('{"r":{"t":',string(${daftar}),'}}')))`;

/** Banyaknya anggota `daftar` yang bukan bilangan bulat dalam [min, maks]. */
export const jumlahDiLuarBatas = (daftar, min, maks) =>
  `xpath(${xmlDaftar(daftar)},'count(/r/t[not(number(.) = floor(number(.))) or number(.) < ${min} or number(.) > ${maks}])')`;

/**
 * Banyaknya ambang di `daftar` yang sama dengan atau lebih besar dari `sisa` hari, yaitu ambang yang sudah dilewati.
 * Pengingat dikirim bila angka ini hari ini lebih besar daripada pada tanggal pengingat terakhir.
 */
export const jumlahAmbang = (daftar, sisa) => `xpath(${xmlDaftar(daftar)},concat('count(/r/t[. >= ',string(${sisa}),'])'))`;

/**
 * Daftar angka polos: teks JSON-nya hanya berisi angka, koma, titik, minus, dan tepat satu kurung siku buka (tanpa
 * daftar bersarang, teks, ya/tidak, atau objek).
 */
const daftarAngkaPolos = (teksDaftar) => `and(startsWith(${teksDaftar},'['),equals(length(split(${teksDaftar},'[')),2),empty(${sisaBukanAngka(teksDaftar)}))`;

/** Daftar hari (validasiDaftarHari): bilangan bulat dalam [min, maks], tanpa duplikat, 1 sampai maksJumlah angka. */
function daftarHari(nilai, { min = 0, maks, maksJumlah = 10 }) {
  const unik = `union(${nilai},${nilai})`;
  return {
    sah: `and(${daftarAngkaPolos(`string(${nilai})`)},greater(length(${unik}),0),lessOrEquals(length(${unik}),${maksJumlah}),less(${jumlahDiLuarBatas(nilai, min, maks)},1))`,
    rapi: unik,
  };
}

/** SLA per status: status yang tidak diisi memakai bawaan; satu status yang salah membuat seluruh nilai ditolak. */
function sla(nilai) {
  const teks = `string(${nilai})`;
  const per = (s) => `coalesce(${nilai}?['${s}'],${BAWAAN.sla[s]})`;
  const daftar = `createArray(${STATUS_SLA.map(per).join(",")})`;
  return {
    sah: `and(startsWith(${teks},'{'),${STATUS_SLA.map((s) => `not(contains(${teks},'"${s}":null'))`).join(",")},${daftarAngkaPolos(`string(${daftar})`)},less(${jumlahDiLuarBatas(daftar, 1, 90)},1))`,
    rapi: `json(concat('{',${STATUS_SLA.map((s, i) => `'${i ? "," : ""}"${s}":',string(${per(s)})`).join(",")},'}'))`,
  };
}

/** Ya/tidak dari teks JSON mentah: hanya true atau false (JSON membedakan huruf besar). */
const yaTidak = (teks) => ({ sah: `or(equals(${teks},'true'),equals(${teks},'false'))`, rapi: `equals(${teks},'true')` });

/**
 * Email opsional (validasiEmailOpsional) dari teks JSON mentah: teks bertanda petik ganda yang isinya kosong, atau satu
 * alamat nama@domain.tld tanpa spasi, ; atau ,. Isi dengan garis miring terbalik (escape JSON) ditolak; aplikasi
 * tidak pernah menulisnya untuk alamat email.
 */
function emailOpsional(teks) {
  // Isi di antara dua petik ganda. Diberi ganjal spasi supaya substring tidak gagal pada teks satu huruf.
  const dalam = `substring(concat(${teks},' '),1,max(0,sub(length(${teks}),2)))`;
  const t = `toLower(trim(${dalam}))`;
  const bagian = `split(${t},'@')`;
  const domain = `last(${bagian})`;
  // Titik di domain tidak boleh di huruf pertama atau terakhir. substring diberi ganjal spasi supaya tidak gagal
  // pada teks pendek atau kosong.
  const titikDiTengah = `contains(substring(concat(${domain},'  '),1,max(0,sub(length(${domain}),2))),'.')`;
  return {
    sah:
      `and(startsWith(${teks},'"'),endsWith(${teks},'"'),greater(length(${teks}),1),not(contains(${dalam},'"')),not(contains(${dalam},'\\')),` +
      `or(empty(${t}),and(equals(length(${bagian}),2),not(empty(first(${bagian}))),${titikDiTengah},not(contains(${t},' ')),not(contains(${t},';')),not(contains(${t},',')))))`,
    rapi: t,
  };
}

/** Ambang eskalasi: tanpa PIC 1 sampai 60 hari, revisi menggantung 1 sampai 90 hari; yang tidak diisi memakai bawaan. */
function ambangEskalasi(nilai) {
  const a = `coalesce(${nilai}?['diajukanTanpaPicHari'],${BAWAAN.ambangEskalasi.diajukanTanpaPicHari})`;
  const b = `coalesce(${nilai}?['revisiMenggantungHari'],${BAWAAN.ambangEskalasi.revisiMenggantungHari})`;
  return {
    sah: `and(startsWith(string(${nilai}),'{'),${daftarAngkaPolos(`string(createArray(${a},${b}))`)},less(${jumlahDiLuarBatas(`createArray(${a})`, 1, 60)},1),less(${jumlahDiLuarBatas(`createArray(${b})`, 1, 90)},1))`,
    rapi: `json(concat('{"diajukanTanpaPicHari":',string(${a}),',"revisiMenggantungHari":',string(${b}),'}'))`,
  };
}

export const PEMERIKSA = {
  hariPeringatan: (v) => daftarHari(v, { maks: 730 }),
  jaminanPeringatan: (v) => daftarHari(v, { maks: 365 }),
  hariKerja: (v) => daftarHari(v, { maks: 6, maksJumlah: 7 }),
  sla,
  slaPakaiHariKerja: yaTidak,
  alamatGrupLegal: emailOpsional,
  ambangEskalasi,
};

/**
 * Ekspresi Nilai_<kunci>: NilaiJson yang diurai (atau teks JSON-nya untuk TEKS_MENTAH). `sumber` = ekspresi teks
 * NilaiJson (bisa null); bawaannya membaca dari aksi Baris_<kunci>.
 */
export function ekspresiNilai(kunci, sumber = `first(body('Baris_${kunci}'))?['NilaiJson']`) {
  const bersih = `trim(coalesce(${sumber},''))`;
  // Baris yang tidak ada atau kosong dibaca sebagai teks JSON nilai bawaan.
  const teks = `if(empty(${bersih}),'${petik(JSON.stringify(BAWAAN[kunci]))}',${bersih})`;
  return `@${TEKS_MENTAH.has(kunci) ? teks : `json(${teks})`}`;
}

/** Ekspresi Periksa_<kunci>: nilai rapi bila sah, null bila tidak. `nilai` = ekspresi hasil Nilai_<kunci>. */
export function ekspresiPeriksa(kunci, nilai = `outputs('Nilai_${kunci}')`) {
  const { sah, rapi } = PEMERIKSA[kunci](nilai);
  return `@if(${sah},${rapi},null)`;
}

/**
 * Aksi pembaca Pengaturan untuk `kunci` yang dipakai flow, ditambah mode uji (Email_uji). Aksi sesudahnya cukup
 * menunggu Email_uji, lalu membaca nilai lewat outputs('Pengaturan')?['<kunci>'].
 */
export function aksiPengaturan(kunci, runAfter = {}) {
  const aksi = { Ambil_pengaturan: ambilItem(LIST.pengaturan, { urut: "ID asc", atas: 500 }, runAfter) };
  for (const k of [...kunci, "emailUji"]) {
    aksi[`Baris_${k}`] = saring("@body('Ambil_pengaturan')?['value']", `@equals(trim(coalesce(item()?['Title'],'')),'${k}')`, { Ambil_pengaturan: ["Succeeded"] });
  }
  for (const k of kunci) {
    aksi[`Nilai_${k}`] = tulis(ekspresiNilai(k), { [`Baris_${k}`]: ["Succeeded"] });
    // Nilai_<kunci> gagal (bukan JSON) membuat Periksa_<kunci> dilewati, lalu Pengaturan memakai bawaan.
    aksi[`Periksa_${k}`] = tulis(ekspresiPeriksa(k), { [`Nilai_${k}`]: ["Succeeded"] });
  }
  aksi.Pengaturan = tulis(
    Object.fromEntries(kunci.map((k) => [k, `@coalesce(actions('Periksa_${k}')?['outputs'],${bawaanE(k)})`])),
    Object.fromEntries(kunci.map((k) => [`Periksa_${k}`, APA_PUN])),
  );
  // Mode uji: baris emailUji berisi alamat (boleh dengan atau tanpa tanda petik). Kosong = mode uji mati.
  aksi.Email_uji = tulis(`@trim(replace(string(coalesce(first(body('Baris_emailUji'))?['NilaiJson'],'')),'"',''))`, { Pengaturan: ["Succeeded"], Baris_emailUji: ["Succeeded"] });
  return aksi;
}

/**
 * Mode uji saja, untuk flow yang tidak butuh Pengaturan lain (Pengawas): bila baris emailUji berisi alamat, semua email
 * terjadwal dialihkan ke alamat itu dengan subjek berawalan [UJI].
 */
export const aksiModeUji = (runAfter = {}) => ({
  Ambil_mode_uji: ambilItem(LIST.pengaturan, { filter: "Title eq 'emailUji'", urut: "ID asc", atas: 1 }, runAfter),
  Email_uji: tulis("@trim(replace(string(coalesce(first(body('Ambil_mode_uji')?['value'])?['NilaiJson'],'')),'\"',''))", { Ambil_mode_uji: ["Succeeded"] }),
});

/** Awalan subjek saat mode uji aktif. */
export const awalanUji = "@{if(empty(outputs('Email_uji')),'','[UJI] ')}";

/** null bila kosong, supaya bisa dirangkai dengan coalesce (if() mengevaluasi kedua cabang, jadi aman di sini). */
export const bilaAda = (e) => `if(empty(${e}),null,${e})`;

/**
 * Penerima email tim Legal, berurutan: alamat mode uji, alamatGrupLegal dari Pengaturan (menggantikan daftar anggota),
 * Legal dan Admin aktif di list Pengguna, lalu akun admin bawaan aplikasi. Butuh aksiPengaturan dengan kunci
 * alamatGrupLegal.
 */
export const aksiTimLegal = (runAfter = {}) => ({
  Ambil_tim_legal: ambilItem(LIST.pengguna, { filter: "Aktif eq 1 and (Peran eq 'Legal' or Peran eq 'Admin')" }, runAfter),
  Pilih_email_legal: pilih("@body('Ambil_tim_legal')?['value']", "@toLower(trim(coalesce(item()?['Email'],'')))", { Ambil_tim_legal: ["Succeeded"] }),
  Email_legal_terisi: saring("@body('Pilih_email_legal')", "@not(empty(item()))", { Pilih_email_legal: ["Succeeded"] }),
  Email_tim_legal: tulis(
    `@coalesce(${bilaAda("outputs('Email_uji')")},${bilaAda("outputs('Pengaturan')?['alamatGrupLegal']")},${bilaAda("join(union(body('Email_legal_terisi'),body('Email_legal_terisi')),';')")},'${ADMIN_BAWAAN}')`,
    { Email_legal_terisi: ["Succeeded"] },
  ),
});

// --- Umur tahap dan hari kerja (padanan umurTahapPengaturan di aplikasi) ---------------------------------------

const TICK_HARI = 864000000000;
const TICK_WIB = 252000000000;

/** Topeng hari kerja: 7 karakter '1'/'0' untuk Minggu sampai Sabtu (0 = Minggu, sama dengan Pengaturan.hariKerja). */
export const ekspresiTopeng = (hariKerja) => `concat(${[0, 1, 2, 3, 4, 5, 6].map((d) => `if(contains(${hariKerja},${d}),'1','0')`).join(",")})`;

/**
 * Hari kerja (pecahan) dari awal penanggalan sampai `iso`, dalam WIB. Selisih dua nilai ini sama dengan
 * hitungHariKerja(dari, sampai) di aplikasi: bagian hari yang jatuh pada hari libur mingguan tidak dihitung.
 * Indeks hari diambil dari ticks (1 Januari tahun 1 jatuh pada Senin) lalu digeser satu, jadi kelipatan 7 = Minggu.
 */
export function hariKerjaKumulatif(iso, topeng) {
  const lokal = `add(ticks(${iso}),${TICK_WIB})`;
  const indeks = `add(div(${lokal},${TICK_HARI}),1)`;
  const hari = `mod(${indeks},7)`;
  const mingguPenuh = `mul(div(${indeks},7),length(replace(${topeng},'0','')))`;
  const awalPekan = `length(replace(substring(${topeng},0,${hari}),'0',''))`;
  const hariIni = `mul(if(equals(substring(${topeng},${hari},1),'1'),1,0),div(mod(${lokal},${TICK_HARI}),${TICK_HARI}.0))`;
  return `add(add(${mingguPenuh},${awalPekan}),${hariIni})`;
}

/** Topeng hari kerja dan hari kerja kumulatif saat ini, dihitung sekali per jalan. Butuh Pengaturan.hariKerja. */
export const aksiHariKerja = (runAfter = {}) => ({
  Topeng_hari_kerja: tulis(`@${ekspresiTopeng("outputs('Pengaturan')?['hariKerja']")}`, runAfter),
  Hari_kerja_kini: tulis(`@${hariKerjaKumulatif("utcNow()", "outputs('Topeng_hari_kerja')")}`, { Topeng_hari_kerja: ["Succeeded"] }),
});

/**
 * Umur (hari, pecahan) sejak `iso` sampai sekarang: hari kerja bila Pengaturan.slaPakaiHariKerja, selain itu hari
 * kalender. Tidak pernah negatif. Butuh aksiHariKerja dan Pengaturan dengan slaPakaiHariKerja.
 */
export function umurHariE(iso) {
  const kalender = `div(sub(ticks(utcNow()),ticks(${iso})),${TICK_HARI}.0)`;
  const kerja = `sub(outputs('Hari_kerja_kini'),${hariKerjaKumulatif(iso, "outputs('Topeng_hari_kerja')")})`;
  return `max(0,if(outputs('Pengaturan')?['slaPakaiHariKerja'],${kerja},${kalender}))`;
}
