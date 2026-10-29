// Periksa definisi flow hasil buat-solusi (power-automate/hasil/*.json) sebelum diimpor:
//   1. Setiap ekspresi "@..." dan "@{...}": petik tunggal dan kurung seimbang, tanpa "<" di luar string literal, dan
//      tidak lebih dari 8.192 karakter.
//   2. Fungsi yang dipanggil ada di bahasa ekspresi Power Automate (daftar FUNGSI di bawah).
//   3. outputs/body/actions/items merujuk aksi yang ada; items('X') hanya dipakai di dalam perulangan X.
//   4. Fungsi yang butuh argumen tidak dipanggil kosong, mis. createArray() (galat InvalidTemplate saat jalan).
//   5. runAfter hanya merujuk aksi dalam cakupan yang sama, dan nama aksi unik di seluruh flow.
// Jalankan: node power-automate/periksa.mjs [folder] (setelah node power-automate/buat-solusi.mjs; bawaan folder hasil/).
import { readFileSync, readdirSync } from "node:fs";

const FUNGSI = new Set(
  (
    "concat endsWith formatNumber guid indexOf lastIndexOf nthIndexOf length replace slice split startsWith substring toLower toUpper trim chunk isFloat isInt " +
    "contains empty first intersection item join last reverse skip sort take union createArray " +
    "and equals greater greaterOrEquals if less lessOrEquals not or " +
    "array base64 base64ToBinary base64ToString binary bool dataUri dataUriToBinary dataUriToString decimal decodeBase64 decodeDataUri decodeUriComponent encodeUriComponent float int json string uriComponent uriComponentToBinary uriComponentToString xml " +
    "add div max min mod mul rand range sub " +
    "addDays addHours addMinutes addSeconds addToTime convertFromUtc convertTimeZone convertToUtc dateDifference dayOfMonth dayOfWeek dayOfYear formatDateTime getFutureTime getPastTime parseDateTime startOfDay startOfHour startOfMonth subtractFromTime ticks utcNow " +
    "action actions body formDataMultiValues formDataValue items iterationIndexes listCallbackUrl multipartBody outputs parameters result trigger triggerBody triggerFormDataMultiValues triggerFormDataValue triggerMultipartBody triggerOutputs variables workflow " +
    "uriHost uriPath uriPathAndQuery uriPort uriQuery uriScheme addProperty coalesce removeProperty setProperty xpath"
  ).split(/\s+/),
);
/** Fungsi yang sah dipanggil tanpa argumen. Selain ini, "nama()" ditolak Power Automate saat jalan (mis. createArray()). */
const TANPA_ARGUMEN = new Set(["utcNow", "guid", "item", "trigger", "triggerBody", "triggerOutputs", "workflow", "listCallbackUrl", "triggerMultipartBody", "triggerFormDataMultiValues", "variables"]);
const RUJUK_AKSI = new Set(["outputs", "body", "actions", "items", "result"]);
/** Batas panjang satu ekspresi di definisi alur kerja Power Automate / Logic Apps. */
const BATAS_EKSPRESI = 8192;

/** Ekspresi di dalam satu nilai teks: seluruh nilai bila diawali "@", dan setiap "@{...}". */
function ambilEkspresi(v) {
  const hasil = [];
  if (v.startsWith("@") && !v.startsWith("@@") && !v.startsWith("@{")) hasil.push(v.slice(1));
  let i = 0;
  while ((i = v.indexOf("@{", i)) >= 0) {
    if (i > 0 && v[i - 1] === "@") { i += 2; continue; } // "@@{" = teks "@{" yang di-escape
    let j = i + 2, dalam = false, k = 1;
    for (; j < v.length; j++) {
      const c = v[j];
      if (c === "'") { if (dalam && v[j + 1] === "'") { j++; continue; } dalam = !dalam; }
      else if (!dalam && c === "{") k++;
      else if (!dalam && c === "}") { k--; if (k === 0) break; }
    }
    hasil.push(v.slice(i + 2, j));
    i = j + 1;
  }
  return hasil;
}

/** Pemeriksaan sintaks kasar plus daftar panggilan fungsi { nama, argumen pertama bila berupa teks literal }. */
function urai(e) {
  let dalam = false, kurung = 0, ok = true;
  const panggilan = [];
  for (let j = 0; j < e.length; j++) {
    const c = e[j];
    if (c === "'") { if (dalam && e[j + 1] === "'") { j++; continue; } dalam = !dalam; continue; }
    if (dalam) continue;
    if (c === "(") kurung++;
    else if (c === ")") { kurung--; if (kurung < 0) ok = false; }
    else if (c === "<") ok = false;
    else if (/[A-Za-z_]/.test(c) && !/[A-Za-z0-9_.]/.test(e[j - 1] ?? "")) {
      let k = j;
      while (k < e.length && /[A-Za-z0-9_]/.test(e[k])) k++;
      const nama = e.slice(j, k);
      if (e[k] === "(") {
        let arg = null;
        if (e[k + 1] === "'") {
          let m = k + 2, s = "";
          for (; m < e.length; m++) {
            if (e[m] === "'") { if (e[m + 1] === "'") { s += "'"; m++; continue; } break; }
            s += e[m];
          }
          arg = s;
        }
        panggilan.push({ nama, arg });
      }
      j = k - 1;
    }
  }
  return { ok: ok && !dalam && kurung === 0, panggilan };
}

/** Semua aksi dalam definisi beserta cakupannya: { nama, aksi, cakupan, leluhur (aksi wadah dari luar ke dalam) }. */
function daftarAksi(aksiAkar) {
  const hasil = [];
  const jelajah = (kumpulan, cakupan, leluhur) => {
    for (const [nama, aksi] of Object.entries(kumpulan ?? {})) {
      hasil.push({ nama, aksi, cakupan, leluhur });
      const lagi = [...leluhur, nama];
      if (aksi.actions) jelajah(aksi.actions, `${nama}/ya`, lagi);
      if (aksi.else?.actions) jelajah(aksi.else.actions, `${nama}/tidak`, lagi);
      for (const [c, isi] of Object.entries(aksi.cases ?? {})) jelajah(isi.actions, `${nama}/${c}`, lagi);
      if (aksi.default?.actions) jelajah(aksi.default.actions, `${nama}/bawaan`, lagi);
    }
  };
  jelajah(aksiAkar, "", []);
  return hasil;
}

let masalah = 0;
const lapor = (f, jalur, pesan) => {
  masalah++;
  console.log(`${f} ${jalur} => ${pesan}`);
};

const FOLDER = process.argv[2] ?? "power-automate/hasil";
for (const f of readdirSync(FOLDER).filter((x) => x.endsWith(".json"))) {
  const def = JSON.parse(readFileSync(`${FOLDER}/${f}`, "utf8")).properties.definition;
  const aksi = daftarAksi(def.actions);
  const perNama = new Map();
  for (const a of aksi) {
    if (perNama.has(a.nama)) lapor(f, a.nama, "nama aksi ganda");
    perNama.set(a.nama, a);
  }
  for (const a of aksi) {
    for (const sebelum of Object.keys(a.aksi.runAfter ?? {})) {
      const s = perNama.get(sebelum);
      if (!s) lapor(f, a.nama, `runAfter merujuk aksi yang tidak ada: ${sebelum}`);
      else if (s.cakupan !== a.cakupan) lapor(f, a.nama, `runAfter merujuk aksi di cakupan lain: ${sebelum}`);
    }
  }

  const telusur = (v, jalur, pemilik) => {
    if (typeof v === "string") {
      for (const e of ambilEkspresi(v)) {
        const { ok, panggilan } = urai(e);
        if (!ok) lapor(f, jalur, `ekspresi tidak seimbang: ${e.slice(0, 160)}`);
        if (e.length > BATAS_EKSPRESI) lapor(f, jalur, `ekspresi ${e.length} karakter, melebihi batas ${BATAS_EKSPRESI}`);
        const tanpaLiteral = e.replace(/'(?:[^']|'')*'/g, "''");
        for (const m of tanpaLiteral.matchAll(/\b([A-Za-z]\w*)\(\s*\)/g)) if (!TANPA_ARGUMEN.has(m[1])) lapor(f, jalur, `${m[1]}() dipanggil tanpa argumen`);
        for (const { nama, arg } of panggilan) {
          if (!FUNGSI.has(nama)) lapor(f, jalur, `fungsi tidak dikenal: ${nama}()`);
          if (!RUJUK_AKSI.has(nama) || arg == null) continue;
          const sasaran = perNama.get(arg);
          if (!sasaran) lapor(f, jalur, `${nama}('${arg}') merujuk aksi yang tidak ada`);
          else if (nama === "items" && !(pemilik?.leluhur ?? []).includes(arg) && pemilik?.nama !== arg) lapor(f, jalur, `items('${arg}') dipakai di luar perulangannya`);
        }
      }
    } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) telusur(x, `${jalur}/${k}`, pemilik);
  };
  for (const [nama, p] of Object.entries(def.triggers ?? {})) telusur(p, `pemicu/${nama}`, null);
  for (const a of aksi) {
    // Isi wadah (actions, else, cases) diperiksa lewat aksinya masing-masing.
    const { actions: _a, else: _e, cases: _c, default: _d, ...milikSendiri } = a.aksi;
    telusur(milikSendiri, a.nama, a);
  }
}
console.log(masalah ? `${masalah} masalah ditemukan` : "semua ekspresi seimbang, fungsi dikenal, dan rujukan aksi sah");
process.exitCode = masalah ? 1 : 0;
