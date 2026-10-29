// Uji flow Power Automate (power-automate/alur): K05, U24, U25, U27, U23b, U34.
// Jalankan: npx --yes tsx scripts/uji-flow.ts
//
// Flow tidak bisa dijalankan di Node, jadi berkas ini membawa penilai kecil untuk bahasa ekspresi Power Automate
// (sebagian fungsi yang dipakai flow kita) dan penjalan aksi (Compose, Select, Query, If, Foreach, serta konektor
// SharePoint/Outlook tiruan). Dengan itu definisi flow yang sama persis dengan isi KontrakWKI.zip dijalankan terhadap
// data contoh dan dibandingkan dengan fungsi murni aplikasi (lib/pengaturan.ts, lib/masa.ts).
//
// Semantik yang ditiru dengan sengaja ketat: if(), and(), dan or() mengevaluasi semua argumennya; empty() menolak
// angka; akses properti tanpa "?" pada nilai kosong gagal. Bila uji lolos di sini, ekspresinya juga aman di Power
// Automate yang (untuk sebagian fungsi) lebih longgar.
import assert from "node:assert/strict";
import { register } from "node:module";

// src/config.ts membaca import.meta.env milik Vite, yang tidak ada di Node. Kait ini menggantinya dengan objek kosong.
const kait = `export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const App = await import("../src/lib/pengaturan");
const PA = await import("../power-automate/alur/pengaturan.mjs");
const Umum = await import("../power-automate/alur/umum.mjs");
const flowAgenda = (await import("../power-automate/alur/agenda.mjs")).default;
const flowPengingat = (await import("../power-automate/alur/pengingat.mjs")).default;
const flowKirim = (await import("../power-automate/alur/kirim-email.mjs")).default;
const flowLaporan = (await import("../power-automate/alur/laporan.mjs")).default;
const flowPengawas = (await import("../power-automate/alur/pengawas.mjs")).default;

let nomor = 0;
function kasus(nama: string, fn: () => void) {
  fn();
  nomor++;
  console.log(`ok ${nomor} - ${nama}`);
}

// =====================================================================================================================
// Penilai ekspresi
// =====================================================================================================================

class GalatEkspresi extends Error {}
class XmlNilai {
  constructor(readonly isi: unknown) {}
}
type Nilai = null | boolean | bigint | number | string | Nilai[] | { [k: string]: Nilai } | XmlNilai;
type Obj = { [k: string]: Nilai };

const adalahObj = (v: Nilai): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof XmlNilai);
const adalahAngka = (v: Nilai): v is bigint | number => typeof v === "bigint" || typeof v === "number";
const gagal = (pesan: string): never => {
  throw new GalatEkspresi(pesan);
};

/** JSON gaya Newtonsoft: bilangan bulat jadi bigint, pecahan atau eksponen jadi number. */
function uraiJson(s: string): Nilai {
  let i = 0;
  const spasi = () => {
    while (i < s.length && /\s/.test(s[i]!)) i++;
  };
  const nilai = (): Nilai => {
    spasi();
    const c = s[i];
    if (c === "{" || c === "[") {
      const objek = c === "{";
      i++;
      const o: Obj = {};
      const a: Nilai[] = [];
      spasi();
      if (s[i] === (objek ? "}" : "]")) {
        i++;
        return objek ? o : a;
      }
      for (;;) {
        if (objek) {
          spasi();
          const k = nilai();
          if (typeof k !== "string") gagal("kunci JSON harus teks");
          spasi();
          if (s[i++] !== ":") gagal("JSON: harap ':'");
          o[k as string] = nilai();
        } else a.push(nilai());
        spasi();
        if (s[i] === ",") {
          i++;
          continue;
        }
        if (s[i] === (objek ? "}" : "]")) {
          i++;
          return objek ? o : a;
        }
        return gagal("JSON tidak sah");
      }
    }
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j += s[j] === "\\" ? 2 : 1;
      if (j >= s.length) gagal("JSON: teks tidak ditutup");
      const v = JSON.parse(s.slice(i, j + 1)) as string;
      i = j + 1;
      return v;
    }
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i));
    if (m) {
      i += m[0].length;
      return m[1] || m[2] ? Number(m[0]) : BigInt(m[0]);
    }
    for (const [kata, v] of [["true", true], ["false", false], ["null", null]] as const) {
      if (s.startsWith(kata, i)) {
        i += kata.length;
        return v;
      }
    }
    return gagal(`JSON tidak sah: ${s.slice(0, 40)}`);
  };
  const v = nilai();
  spasi();
  if (i !== s.length) gagal("JSON: ada sisa");
  return v;
}

/** string() Power Automate. `dalam` = di dalam JSON (teks diberi petik, ya/tidak huruf kecil). */
function teksDari(v: Nilai, dalam = false): string {
  if (v === null) return dalam ? "null" : "";
  if (typeof v === "string") return dalam ? JSON.stringify(v) : v;
  if (typeof v === "boolean") return dalam ? String(v) : v ? "True" : "False";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return Number.isInteger(v) && Math.abs(v) < 1e15 ? `${v}.0` : String(v).replace("e", "E");
  if (Array.isArray(v)) return `[${v.map((x) => teksDari(x, true)).join(",")}]`;
  if (v instanceof XmlNilai) return "<xml/>";
  return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}:${teksDari(x, true)}`).join(",")}}`;
}

function samaDengan(a: Nilai, b: Nilai): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "bigint" && typeof b === "bigint") return a === b;
  if (adalahAngka(a) && adalahAngka(b)) return Number(a) === Number(b);
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") return Array.isArray(a) === Array.isArray(b) && teksDari(a, true) === teksDari(b, true);
  return a === b;
}

function hitung(op: string, a: Nilai, b: Nilai): Nilai {
  if (!adalahAngka(a) || !adalahAngka(b)) return gagal(`${op}() butuh angka, dapat ${teksDari(a, true)} dan ${teksDari(b, true)}`);
  if (typeof a === "bigint" && typeof b === "bigint") {
    if ((op === "div" || op === "mod") && b === 0n) gagal("bagi nol");
    return op === "add" ? a + b : op === "sub" ? a - b : op === "mul" ? a * b : op === "div" ? a / b : a % b;
  }
  const x = Number(a);
  const y = Number(b);
  return op === "add" ? x + y : op === "sub" ? x - y : op === "mul" ? x * y : op === "div" ? x / y : x % y;
}

function bandingkan(a: Nilai, b: Nilai): number {
  if (adalahAngka(a) && adalahAngka(b)) return typeof a === "bigint" && typeof b === "bigint" ? (a < b ? -1 : a > b ? 1 : 0) : Number(a) - Number(b);
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return gagal(`tidak bisa membandingkan ${teksDari(a, true)} dan ${teksDari(b, true)}`);
}

// --- Tanggal ---------------------------------------------------------------------------------------------------------

const TICK_EPOCH = 621355968000000000n;
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Waktu ISO -> { ms, utc }. Tanpa zona dianggap apa adanya (utc = false), seperti keluaran convertTimeZone. */
function waktu(v: Nilai): { ms: number; utc: boolean } {
  if (typeof v !== "string") return gagal(`bukan waktu: ${teksDari(v, true)}`);
  let s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00";
  const zona = /(Z|[+-]\d{2}:\d{2})$/.test(s);
  s = s.replace(/(\.\d{3})\d+/, "$1");
  const ms = Date.parse(zona ? s : s + "Z");
  if (Number.isNaN(ms)) gagal(`waktu tidak sah: ${v}`);
  return { ms, utc: zona };
}

const dua = (n: number) => String(n).padStart(2, "0");
function formatWaktu(ms: number, format: string | null, utc: boolean): string {
  const d = new Date(ms);
  if (!format) return `${d.getUTCFullYear()}-${dua(d.getUTCMonth() + 1)}-${dua(d.getUTCDate())}T${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())}:${dua(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, "0")}0000${utc ? "Z" : ""}`;
  return format.replace(/y+|M+|d+|H+|m+|s+/g, (t) => {
    switch (t[0]) {
      case "y":
        return String(d.getUTCFullYear());
      case "M":
        return t.length >= 4 ? BULAN[d.getUTCMonth()]! : t.length === 3 ? BULAN_PENDEK[d.getUTCMonth()]! : t.length === 2 ? dua(d.getUTCMonth() + 1) : String(d.getUTCMonth() + 1);
      case "d":
        return t.length >= 4 ? HARI[d.getUTCDay()]! : t.length === 3 ? HARI[d.getUTCDay()]!.slice(0, 3) : t.length === 2 ? dua(d.getUTCDate()) : String(d.getUTCDate());
      case "H":
        return dua(d.getUTCHours());
      case "m":
        return dua(d.getUTCMinutes());
      default:
        return dua(d.getUTCSeconds());
    }
  });
}

// --- Pengurai ----------------------------------------------------------------------------------------------------------

type Simpul = { j: "lit"; v: Nilai } | { j: "panggil"; nama: string; arg: Simpul[] } | { j: "akses"; dari: Simpul; kunci: Simpul; aman: boolean };

function uraiEkspresi(teks: string): Simpul {
  const tk: { t: "str" | "num" | "id" | "p"; v: string }[] = [];
  for (let i = 0; i < teks.length; ) {
    const c = teks[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (c === "'") {
      let v = "";
      i++;
      for (;;) {
        if (i >= teks.length) gagal("teks tidak ditutup");
        if (teks[i] === "'") {
          if (teks[i + 1] === "'") {
            v += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        v += teks[i++];
      }
      tk.push({ t: "str", v });
    } else if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(teks[i + 1] ?? "") && ["(", ","].includes(tk[tk.length - 1]?.v ?? ""))) {
      let j = i + 1;
      while (j < teks.length && /[0-9.]/.test(teks[j]!)) j++;
      tk.push({ t: "num", v: teks.slice(i, j) });
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < teks.length && /[A-Za-z0-9_]/.test(teks[j]!)) j++;
      tk.push({ t: "id", v: teks.slice(i, j) });
      i = j;
    } else if ("(),[]?.".includes(c)) {
      tk.push({ t: "p", v: c });
      i++;
    } else gagal(`karakter tak dikenal "${c}"`);
  }
  let i = 0;
  const harap = (v: string) => {
    const x = tk[i++];
    if (!x || x.t !== "p" || x.v !== v) gagal(`harap "${v}" di token ${i}`);
  };
  const utama = (): Simpul => {
    const x = tk[i++];
    if (!x) return gagal("ekspresi terpotong");
    let s: Simpul;
    if (x.t === "str") s = { j: "lit", v: x.v };
    else if (x.t === "num") s = { j: "lit", v: x.v.includes(".") ? Number(x.v) : BigInt(x.v) };
    else if (x.t === "id" && ["true", "false", "null"].includes(x.v)) s = { j: "lit", v: x.v === "null" ? null : x.v === "true" };
    else if (x.t === "id") {
      harap("(");
      const arg: Simpul[] = [];
      if (!(tk[i]?.t === "p" && tk[i]!.v === ")")) {
        for (;;) {
          arg.push(utama());
          if (tk[i]?.v === ",") {
            i++;
            continue;
          }
          break;
        }
      }
      harap(")");
      s = { j: "panggil", nama: x.v, arg };
    } else return gagal(`token tak terduga "${x.v}"`);
    for (;;) {
      const y = tk[i];
      if (y?.t !== "p" || !["?", "[", "."].includes(y.v)) break;
      const aman = y.v === "?";
      if (aman) i++;
      const z = tk[i++];
      if (z?.v === "[") {
        const kunci = utama();
        harap("]");
        s = { j: "akses", dari: s, kunci, aman };
      } else if (z?.v === ".") {
        const id = tk[i++];
        if (id?.t !== "id") gagal("harap nama properti");
        s = { j: "akses", dari: s, kunci: { j: "lit", v: id!.v }, aman };
      } else gagal("akses properti tidak sah");
    }
    return s;
  };
  const hasil = utama();
  if (i !== tk.length) gagal(`sisa token: ${tk.slice(i).map((x) => x.v).join("")}`);
  return hasil;
}

// --- Penilaian -------------------------------------------------------------------------------------------------------

interface Konteks {
  sekarang: string;
  keluaran: (nama: string) => Nilai;
  aksi: (nama: string) => Nilai;
  butirs: Record<string, Nilai>;
  butir?: Nilai;
  pemicu?: Nilai;
}

function akses(dari: Nilai, kunci: Nilai, aman: boolean): Nilai {
  if (dari === null) return aman ? null : gagal(`akses [${teksDari(kunci, true)}] pada null`);
  if (typeof kunci === "string" && kunci.includes("/") && adalahObj(dari)) return kunci.split("/").reduce<Nilai>((v, k) => akses(v, k, aman), dari);
  if (Array.isArray(dari)) {
    if (!adalahAngka(kunci)) return gagal("indeks daftar harus angka");
    const v = dari[Number(kunci)];
    return v === undefined ? (aman ? null : gagal("indeks di luar daftar")) : v;
  }
  if (adalahObj(dari)) {
    const k = teksDari(kunci);
    return k in dari ? dari[k]! : aman ? null : gagal(`properti ${k} tidak ada`);
  }
  return gagal(`akses [${teksDari(kunci, true)}] pada bukan objek`);
}

const teksWajib = (v: Nilai, fungsi: string): string => (typeof v === "string" ? v : gagal(`${fungsi}() butuh teks, dapat ${teksDari(v, true)}`));
const bulat = (v: Nilai): number => (adalahAngka(v) && Number.isInteger(Number(v)) ? Number(v) : gagal(`butuh bilangan bulat, dapat ${teksDari(v, true)}`));
const yaTidak = (v: Nilai, fungsi: string): boolean => (typeof v === "boolean" ? v : gagal(`${fungsi}() butuh ya/tidak, dapat ${teksDari(v, true)}`));

function xpathHitung(x: Nilai, q: Nilai): Nilai {
  if (!(x instanceof XmlNilai)) return gagal("xpath() butuh xml");
  const r = (x.isi as Obj)?.r;
  const t = adalahObj(r ?? null) ? (r as Obj).t : gagal("xml tanpa /r");
  const daftar = Array.isArray(t) ? t : t === undefined ? [] : [t];
  const teks = daftar.map((v) => (v !== null && typeof v === "object" ? gagal("xml bersarang tidak didukung") : typeof v === "boolean" ? String(v) : teksDari(v)));
  const angka = (s: string) => (/^\s*-?(\d+(\.\d*)?|\.\d+)\s*$/.test(s) ? Number(s) : NaN);
  const query = teksWajib(q, "xpath");
  let m = /^count\(\/r\/t\[not\(number\(\.\) = floor\(number\(\.\)\)\) or number\(\.\) < (-?\d+) or number\(\.\) > (-?\d+)\]\)$/.exec(query);
  if (m) return teks.filter((s) => !(angka(s) === Math.floor(angka(s))) || angka(s) < Number(m![1]) || angka(s) > Number(m![2])).length;
  m = /^count\(\/r\/t\[\. >= (-?[\d.]+)\]\)$/.exec(query);
  if (m) return teks.filter((s) => angka(s) >= Number(m![1])).length;
  return gagal(`xpath tidak didukung: ${query}`);
}

const FUNGSI: Record<string, (a: Nilai[], k: Konteks) => Nilai> = {
  // Alur kerja
  outputs: ([n], k) => k.keluaran(teksWajib(n!, "outputs")),
  body: ([n], k) => akses(k.keluaran(teksWajib(n!, "body")), "body", false),
  actions: ([n], k) => k.aksi(teksWajib(n!, "actions")),
  items: ([n], k) => (teksWajib(n!, "items") in k.butirs ? k.butirs[n as string]! : gagal(`items('${n}') di luar perulangan`)),
  item: (_a, k) => (k.butir === undefined ? gagal("item() di luar perulangan") : k.butir),
  triggerOutputs: (_a, k) => k.pemicu ?? gagal("tidak ada pemicu"),
  // Logika
  if: ([c, a, b]) => (yaTidak(c!, "if") ? a! : b!),
  and: (a) => a.map((x) => yaTidak(x, "and")).every(Boolean),
  or: (a) => a.map((x) => yaTidak(x, "or")).some(Boolean),
  not: ([x]) => !yaTidak(x!, "not"),
  equals: ([a, b]) => samaDengan(a!, b!),
  greater: ([a, b]) => bandingkan(a!, b!) > 0,
  greaterOrEquals: ([a, b]) => bandingkan(a!, b!) >= 0,
  less: ([a, b]) => bandingkan(a!, b!) < 0,
  lessOrEquals: ([a, b]) => bandingkan(a!, b!) <= 0,
  coalesce: (a) => a.find((x) => x !== null) ?? null,
  // Angka
  add: ([a, b]) => hitung("add", a!, b!),
  sub: ([a, b]) => hitung("sub", a!, b!),
  mul: ([a, b]) => hitung("mul", a!, b!),
  div: ([a, b]) => hitung("div", a!, b!),
  mod: ([a, b]) => hitung("mod", a!, b!),
  max: (a) => {
    const d = a.length === 1 && Array.isArray(a[0]) ? (a[0] as Nilai[]) : a;
    if (!d.length) gagal("max() kosong");
    return d.reduce((x, y) => (bandingkan(y, x) > 0 ? y : x));
  },
  int: ([v]) => (typeof v === "string" ? (/^-?\d+$/.test(v.trim()) ? BigInt(v.trim()) : gagal(`int('${v}')`)) : BigInt(bulat(v!))),
  formatNumber: ([v, f, b]) => {
    const n = adalahAngka(v!) ? Number(v) : gagal("formatNumber() butuh angka");
    if (f === "0") return String(Math.sign(n) * Math.round(Math.abs(n)));
    if (f === "0.000") return n.toFixed(3);
    if (f === "N0") return Math.round(n).toLocaleString(b === "id-ID" ? "id-ID" : "en-US");
    return gagal(`format angka tidak didukung: ${f}`);
  },
  // Teks dan koleksi
  string: ([v]) => teksDari(v!),
  json: ([v]) => uraiJson(teksWajib(v!, "json")),
  xml: ([v]) => (adalahObj(v!) && Object.keys(v as Obj).length === 1 ? new XmlNilai(v) : gagal("xml() butuh objek satu akar")),
  xpath: ([x, q]) => xpathHitung(x!, q!),
  concat: (a) => a.map((x) => (x === null ? "" : teksWajib(x, "concat"))).join(""),
  length: ([v]) => (typeof v === "string" || Array.isArray(v) ? BigInt(v.length) : gagal(`length() pada ${teksDari(v!, true)}`)),
  empty: ([v]) => (v === null ? true : typeof v === "string" || Array.isArray(v) ? v.length === 0 : adalahObj(v!) ? Object.keys(v).length === 0 : gagal(`empty() pada ${teksDari(v!, true)}`)),
  first: ([v]) => (typeof v === "string" ? v.slice(0, 1) : Array.isArray(v) ? (v[0] ?? null) : gagal("first() butuh daftar atau teks")),
  last: ([v]) => (typeof v === "string" ? v.slice(-1) : Array.isArray(v) ? (v[v.length - 1] ?? null) : gagal("last() butuh daftar atau teks")),
  contains: ([c, v]) => (typeof c === "string" ? c.includes(teksWajib(v!, "contains")) : Array.isArray(c) ? c.some((x) => samaDengan(x, v!)) : adalahObj(c!) ? teksWajib(v!, "contains") in c : gagal("contains() pada nilai tidak sah")),
  split: ([s, p]) => teksWajib(s!, "split").split(teksWajib(p!, "split")),
  replace: ([s, a, b]) => teksWajib(s!, "replace").split(teksWajib(a!, "replace")).join(teksWajib(b!, "replace")),
  substring: ([s, m, p]) => {
    const t = teksWajib(s!, "substring");
    const awal = bulat(m!);
    const panjang = p === undefined ? t.length - awal : bulat(p);
    if (awal < 0 || panjang < 0 || awal + panjang > t.length) gagal(`substring di luar teks: '${t}', ${awal}, ${panjang}`);
    return t.substr(awal, panjang);
  },
  trim: ([s]) => teksWajib(s!, "trim").trim(),
  toLower: ([s]) => teksWajib(s!, "toLower").toLowerCase(),
  startsWith: ([s, a]) => teksWajib(s!, "startsWith").toLowerCase().startsWith(teksWajib(a!, "startsWith").toLowerCase()),
  endsWith: ([s, a]) => teksWajib(s!, "endsWith").toLowerCase().endsWith(teksWajib(a!, "endsWith").toLowerCase()),
  take: ([v, n]) => (typeof v === "string" || Array.isArray(v) ? v.slice(0, bulat(n!)) : gagal("take() pada nilai tidak sah")),
  join: ([d, p]) => (Array.isArray(d) ? d.map((x) => teksDari(x)).join(teksWajib(p!, "join")) : gagal("join() butuh daftar")),
  union: ([a, b]) => {
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b].filter((x, i, s) => s.findIndex((y) => samaDengan(x, y)) === i);
    if (adalahObj(a!) && adalahObj(b!)) return { ...a, ...b };
    return gagal("union() butuh dua daftar atau dua objek");
  },
  createArray: (a) => a,
  reverse: ([d]) => (Array.isArray(d) ? [...d].reverse() : gagal("reverse() butuh daftar")),
  sort: ([d, kunci]) => (Array.isArray(d) ? [...d].sort((x, y) => bandingkan(kunci == null ? x : akses(x, kunci, true), kunci == null ? y : akses(y, kunci, true))) : gagal("sort() butuh daftar")),
  addProperty: ([o, n, v]) => (adalahObj(o!) && !(teksWajib(n!, "addProperty") in o) ? { ...o, [n as string]: v! } : gagal("addProperty() tidak sah")),
  // Tanggal
  utcNow: ([f], k) => formatWaktu(Date.parse(k.sekarang), (f as string) ?? null, true),
  ticks: ([v]) => BigInt(waktu(v!).ms) * 10000n + TICK_EPOCH,
  convertTimeZone: ([v, dari, ke, f]) => {
    if (dari !== "UTC" || ke !== Umum.ZONA) gagal("zona tidak didukung");
    return formatWaktu(waktu(v!).ms + 7 * 3_600_000, (f as string) ?? null, false);
  },
  addDays: ([v, n, f]) => {
    const w = waktu(v!);
    return formatWaktu(w.ms + bulat(n!) * 86_400_000, (f as string) ?? null, w.utc);
  },
  addHours: ([v, n, f]) => {
    const w = waktu(v!);
    return formatWaktu(w.ms + bulat(n!) * 3_600_000, (f as string) ?? null, w.utc);
  },
  addToTime: ([v, n, satuan, f]) => {
    const w = waktu(v!);
    if (satuan !== "Month") gagal("addToTime hanya Month");
    const d = new Date(w.ms);
    d.setUTCMonth(d.getUTCMonth() + bulat(n!));
    return formatWaktu(d.getTime(), (f as string) ?? null, w.utc);
  },
  startOfMonth: ([v, f]) => {
    const w = waktu(v!);
    const d = new Date(w.ms);
    return formatWaktu(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), (f as string) ?? null, w.utc);
  },
  formatDateTime: ([v, f]) => formatWaktu(waktu(v!).ms, teksWajib(f!, "formatDateTime"), false),
};

function nilai(s: Simpul, k: Konteks): Nilai {
  if (s.j === "lit") return s.v;
  if (s.j === "akses") return akses(nilai(s.dari, k), nilai(s.kunci, k), s.aman);
  const f = FUNGSI[s.nama] ?? gagal(`fungsi belum didukung penilai: ${s.nama}()`);
  return f(s.arg.map((a) => nilai(a, k)), k); // semua argumen dinilai lebih dulu, termasuk kedua cabang if()
}

const tembolok = new Map<string, Simpul>();
function evaluasi(teks: string, k: Konteks): Nilai {
  let s = tembolok.get(teks);
  if (!s) tembolok.set(teks, (s = uraiEkspresi(teks)));
  return nilai(s, k);
}

/** Nilai parameter Power Automate: "@ekspresi", teks dengan "@{...}", atau objek/daftar berisi keduanya. */
function render(v: unknown, k: Konteks): Nilai {
  if (typeof v === "string") {
    if (v.startsWith("@@")) return v.slice(1);
    if (v.startsWith("@") && !v.startsWith("@{")) return evaluasi(v.slice(1), k);
    let hasil = "";
    for (let i = 0; i < v.length; ) {
      const a = v.indexOf("@", i);
      if (a < 0) {
        hasil += v.slice(i);
        break;
      }
      hasil += v.slice(i, a);
      if (v.startsWith("@@{", a)) {
        hasil += "@{";
        i = a + 3;
      } else if (v.startsWith("@{", a)) {
        let j = a + 2;
        let dalam = false;
        let kurung = 1;
        for (; j < v.length; j++) {
          if (v[j] === "'") {
            if (dalam && v[j + 1] === "'") {
              j++;
              continue;
            }
            dalam = !dalam;
          } else if (!dalam && v[j] === "{") kurung++;
          else if (!dalam && v[j] === "}" && --kurung === 0) break;
        }
        hasil += teksDari(evaluasi(v.slice(a + 2, j), k));
        i = j + 1;
      } else {
        hasil += "@";
        i = a + 1;
      }
    }
    return hasil;
  }
  if (Array.isArray(v)) return v.map((x) => render(x, k));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([a, b]) => [a, render(b, k)]));
  if (typeof v === "number") return Number.isInteger(v) ? BigInt(v) : v;
  return v as Nilai;
}

// =====================================================================================================================
// Penjalan flow
// =====================================================================================================================

type Status = "Succeeded" | "Failed" | "Skipped" | "TimedOut";
interface Jejak {
  status: Status;
  outputs?: Nilai;
  error?: string;
}
interface Aksi {
  type: string;
  runAfter?: Record<string, Status[]>;
  inputs?: any;
  expression?: any;
  actions?: Record<string, Aksi>;
  else?: { actions: Record<string, Aksi> };
  foreach?: string;
}
interface Email {
  ke: string;
  cc: string;
  subjek: string;
  isi: string;
  penting: string;
}
interface Lingkungan {
  sekarang: string;
  pemicu?: Nilai;
  tabel: Record<string, Obj[]>;
  /** Kolom yang ada per tabel. Filter dengan kolom lain gagal, seperti SharePoint. */
  kolom?: Record<string, string[]>;
  /** Pengambilan yang dipaksa gagal (nama aksi). */
  gagalAmbil?: string[];
  gagalKirim?: boolean;
  http?: (uri: string) => Nilai;
  email: Email[];
  ubahan: { tabel: string; id: Nilai; item: Obj }[];
  tambahan: { tabel: string; item: Obj }[];
  filter: Record<string, string>;
}

const TABEL: Record<string, string> = Object.fromEntries(Object.entries(Umum.LIST).map(([k, v]) => [v as string, k]));

/** Tanggal-saja SharePoint: tengah malam WIB disimpan sebagai UTC. */
const tglSp = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`).toISOString();

/** Penilai kecil $filter OData untuk tabel tiruan: eq/ne/lt/le/gt/ge, and, or, kurung, null. */
function cocokOData(filter: string, baris: Obj, kolom?: string[]): boolean {
  const tk = filter.match(/'(?:[^']|'')*'|\(|\)|[A-Za-z_][A-Za-z0-9_/]*|-?\d+(?:\.\d+)?/g) ?? [];
  let i = 0;
  const atau = (): boolean => {
    let v = dan();
    while (tk[i] === "or") {
      i++;
      const w = dan();
      v = v || w;
    }
    return v;
  };
  const dan = (): boolean => {
    let v = atom();
    while (tk[i] === "and") {
      i++;
      const w = atom();
      v = v && w;
    }
    return v;
  };
  const atom = (): boolean => {
    if (tk[i] === "(") {
      i++;
      const v = atau();
      if (tk[i++] !== ")") throw new Error(`OData: kurung tidak ditutup di "${filter}"`);
      return v;
    }
    const nama = tk[i++]!;
    const op = tk[i++]!;
    const lit = tk[i++]!;
    if (kolom && nama !== "ID" && !kolom.includes(nama)) throw new Error(`Kolom '${nama}' tidak ada`);
    if (!["eq", "ne", "lt", "le", "gt", "ge"].includes(op ?? "")) throw new Error(`OData: operator "${op}" di "${filter}"`);
    let kiri = baris[nama] ?? null;
    if (adalahObj(kiri) && "Value" in kiri) kiri = kiri.Value!;
    const kanan = lit === "null" ? null : lit.startsWith("'") ? lit.slice(1, -1).replace(/''/g, "'") : Number(lit);
    if (kanan === null) return op === "eq" ? kiri === null : op === "ne" ? kiri !== null : false;
    if (kiri === null) return op === "ne"; // SharePoint: "Kolom ne 1" juga memuat baris yang kolomnya kosong (diuji di tenant)
    let a: number | string;
    let b: number | string;
    if (typeof kanan === "string" && /^\d{4}-\d{2}-\d{2}/.test(kanan)) {
      a = Date.parse(String(kiri));
      b = Date.parse(kanan.length === 10 ? `${kanan}T00:00:00Z` : kanan);
      if (Number.isNaN(b)) throw new Error(`OData: tanggal tidak sah '${kanan}'`);
    } else if (typeof kanan === "number") {
      a = Number(kiri);
      b = kanan;
    } else {
      a = String(kiri);
      b = kanan;
    }
    return op === "eq" ? a === b : op === "ne" ? a !== b : op === "lt" ? a < b : op === "le" ? a <= b : op === "gt" ? a > b : a >= b;
  };
  const v = atau();
  if (i !== tk.length) throw new Error(`OData: sisa "${tk.slice(i).join(" ")}" di "${filter}"`);
  return v;
}

function jalankanFlow(flow: { pemicu: Record<string, unknown>; aksi: Record<string, Aksi> }, env: Lingkungan): Map<string, Jejak> {
  const jejak = new Map<string, Jejak>();
  const konteks = (butirs: Record<string, Nilai>, butir?: Nilai): Konteks => ({
    sekarang: env.sekarang,
    pemicu: env.pemicu,
    butirs,
    butir,
    keluaran: (n) => {
      const j = jejak.get(n);
      return j?.status === "Succeeded" ? (j.outputs ?? null) : gagal(`outputs('${n}') tidak tersedia (${j?.status ?? "belum jalan"})`);
    },
    aksi: (n) => {
      const j = jejak.get(n) ?? { status: "Skipped" };
      return { name: n, status: j.status, outputs: j.outputs ?? null, error: j.error ? { message: j.error } : null };
    },
  });

  const lewati = (kumpulan: Record<string, Aksi>) => {
    for (const [n, a] of Object.entries(kumpulan)) {
      jejak.set(n, { status: "Skipped" });
      if (a.actions) lewati(a.actions);
      if (a.else) lewati(a.else.actions);
    }
  };

  const nilaiKondisi = (e: any, k: Konteks): boolean => {
    if (typeof e === "string") return yaTidak(render(e, k), "kondisi");
    const [op, isi] = Object.entries(e)[0]!;
    if (op === "and") return (isi as any[]).map((x) => nilaiKondisi(x, k)).every(Boolean);
    if (op === "or") return (isi as any[]).map((x) => nilaiKondisi(x, k)).some(Boolean);
    if (op === "not") return !nilaiKondisi(isi, k);
    const [a, b] = (isi as unknown[]).map((x) => render(x, k));
    if (op === "equals") return samaDengan(a!, b!);
    if (op === "greater") return bandingkan(a!, b!) > 0;
    if (op === "less") return bandingkan(a!, b!) < 0;
    return gagal(`kondisi ${op} belum didukung`);
  };

  const konektor = (nama: string, a: Aksi, k: Konteks): Nilai => {
    const p = render(a.inputs.parameters, k) as Obj;
    const op = a.inputs.host.operationId as string;
    if (op === "SendEmailV2") {
      if (env.gagalKirim) throw new Error("Mailbox tidak tersedia.");
      env.email.push({ ke: p["emailMessage/To"] as string, cc: (p["emailMessage/Cc"] as string) ?? "", subjek: p["emailMessage/Subject"] as string, isi: p["emailMessage/Body"] as string, penting: p["emailMessage/Importance"] as string });
      return {};
    }
    if (op === "HttpRequest") return { body: env.http!(p["parameters/uri"] as string) };
    const tabel = TABEL[p.table as string] ?? gagal(`tabel ${p.table} tidak dikenal`);
    const isiItem = Object.fromEntries(Object.entries(p).filter(([x]) => x.startsWith("item/")).map(([x, v]) => [x.slice(5), v]));
    if (op === "GetItems") {
      if (env.gagalAmbil?.includes(nama)) throw new Error("Galat SharePoint tiruan.");
      const filter = (p.$filter as string) ?? "";
      env.filter[nama] = filter;
      const baris = (env.tabel[tabel] ?? []).filter((b) => !filter || cocokOData(filter, b, env.kolom?.[tabel]));
      const urut = [...baris].sort((x, y) => Number(x.ID) - Number(y.ID));
      return { body: { value: urut.slice(0, Number(p.$top ?? 100)) } };
    }
    if (op === "PatchItem") {
      const baris = (env.tabel[tabel] ?? []).find((b) => samaDengan(b.ID!, p.id!)) ?? gagal(`item ${teksDari(p.id!)} tidak ada`);
      for (const [x, v] of Object.entries(isiItem)) {
        const kunci = x.endsWith("/Value") ? x.slice(0, -6) : x;
        baris[kunci] = x.endsWith("/Value") ? { Value: v } : typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? tglSp(v) : v;
      }
      env.ubahan.push({ tabel, id: p.id!, item: isiItem });
      return { body: baris };
    }
    if (op === "PostItem") {
      env.tambahan.push({ tabel, item: isiItem });
      return { body: isiItem };
    }
    return gagal(`operasi ${op} belum didukung`);
  };

  const jalankanSatu = (nama: string, a: Aksi, butirs: Record<string, Nilai>): Jejak => {
    const k = konteks(butirs);
    try {
      switch (a.type) {
        case "Compose":
          return { status: "Succeeded", outputs: render(a.inputs, k) };
        case "Select":
        case "Query": {
          const dari = render(a.inputs.from, k);
          if (!Array.isArray(dari)) return gagal(`${nama}: from bukan daftar`);
          const body =
            a.type === "Select"
              ? dari.map((x) => render(a.inputs.select, konteks(butirs, x)))
              : dari.filter((x) => yaTidak(render(a.inputs.where, konteks(butirs, x)), "where"));
          return { status: "Succeeded", outputs: { body } };
        }
        case "OpenApiConnection":
          return { status: "Succeeded", outputs: konektor(nama, a, k) };
        case "If": {
          const ya = nilaiKondisi(a.expression, k);
          lewati(ya ? (a.else?.actions ?? {}) : (a.actions ?? {}));
          const ok = jalankanKumpulan(ya ? (a.actions ?? {}) : (a.else?.actions ?? {}), butirs);
          return { status: ok ? "Succeeded" : "Failed" };
        }
        case "Foreach": {
          const dari = render(a.foreach, k);
          if (!Array.isArray(dari)) return gagal(`${nama}: foreach bukan daftar`);
          let ok = true;
          for (const x of dari) ok = jalankanKumpulan(a.actions ?? {}, { ...butirs, [nama]: x }) && ok;
          return { status: ok ? "Succeeded" : "Failed" };
        }
        default:
          return gagal(`jenis aksi ${a.type} belum didukung`);
      }
    } catch (e) {
      return { status: "Failed", error: (e as Error).message };
    }
  };

  /** Jalankan satu cakupan menurut runAfter. Hasilnya false bila ada aksi ujung (tidak ditunggu aksi lain) yang gagal. */
  const jalankanKumpulan = (kumpulan: Record<string, Aksi>, butirs: Record<string, Nilai>): boolean => {
    const sisa = new Set(Object.keys(kumpulan));
    while (sisa.size) {
      let maju = false;
      for (const n of [...sisa]) {
        const a = kumpulan[n]!;
        const syarat = Object.entries(a.runAfter ?? {});
        if (syarat.some(([p]) => sisa.has(p))) continue;
        sisa.delete(n);
        maju = true;
        if (!syarat.every(([p, st]) => st.includes(jejak.get(p)!.status))) {
          jejak.set(n, { status: "Skipped" });
          if (a.actions) lewati(a.actions);
          if (a.else) lewati(a.else.actions);
          continue;
        }
        jejak.set(n, jalankanSatu(n, a, butirs));
      }
      if (!maju) throw new Error("runAfter melingkar");
    }
    const ditunggu = new Set(Object.values(kumpulan).flatMap((a) => Object.keys(a.runAfter ?? {})));
    return Object.keys(kumpulan).every((n) => ditunggu.has(n) || jejak.get(n)!.status !== "Failed");
  };

  jalankanKumpulan(flow.aksi, {});
  return jejak;
}

function lingkungan(sekarang: string, tabel: Record<string, Obj[]>, lain: Partial<Lingkungan> = {}): Lingkungan {
  return { sekarang, tabel, email: [], ubahan: [], tambahan: [], filter: {}, ...lain };
}

/** Nilai satu ekspresi dengan konteks kosong (untuk ekspresi murni). */
const hitungMurni = (teks: string, sekarang = "2026-10-05T00:00:00Z"): Nilai =>
  evaluasi(teks.startsWith("@") ? teks.slice(1) : teks, { sekarang, keluaran: (n) => gagal(`outputs('${n}')`), aksi: (n) => gagal(`actions('${n}')`), butirs: {} });

/** Nilai JS biasa (bigint -> number) supaya bisa dibandingkan dengan nilai aplikasi. */
function keJs(v: Nilai): unknown {
  if (typeof v === "bigint") return Number(v);
  if (Array.isArray(v)) return v.map(keJs);
  if (adalahObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, keJs(x)]));
  return v;
}

// =====================================================================================================================
// Data contoh
// =====================================================================================================================

const D = "@waskitainfrastruktur.co.id";
const barisPengaturan = (isi: Record<string, string>): Obj[] => Object.entries(isi).map(([Title, NilaiJson], i) => ({ ID: BigInt(i + 1), Title, NilaiJson }));
const pengguna = (): Obj[] => [
  { ID: 1n, Title: "Lia Legal", Email: `Lia${D}`, Peran: { Value: "Legal" }, Aktif: true },
  { ID: 2n, Title: "Bima Legal", Email: `bima${D}`, Peran: { Value: "Legal" }, Aktif: true },
  { ID: 3n, Title: "Citra Admin", Email: `citra${D}`, Peran: { Value: "Admin" }, Aktif: true },
  { ID: 4n, Title: "Dodi Pantau", Email: `dodi${D}`, Peran: { Value: "Pemantau" }, Aktif: true },
  { ID: 5n, Title: "Eka Nonaktif", Email: `eka${D}`, Peran: { Value: "Legal" }, Aktif: false },
  { ID: 6n, Title: "Fajar Pengaju", Email: `fajar${D}`, Peran: { Value: "Pengaju" }, Aktif: true },
];

let idKontrak = 100n;
function kontrakSp(isi: Obj): Obj {
  idKontrak++;
  return {
    ID: idKontrak,
    Title: `Kontrak ${idKontrak}`,
    NomorPengajuan: `PK-2026-${idKontrak}`,
    NamaMitra: "PT Mitra & Rekan",
    PengajuNama: "Fajar",
    PengajuEmail: `fajar${D}`,
    PicLegalEmail: null,
    PicLegalNama: null,
    Prioritas: { Value: "Normal" },
    JenisKontrak: { Value: "Sewa" },
    KontrakIndukId: null,
    PerpanjanganOtomatis: false,
    MasaPemberitahuanHari: null,
    BerakhirEfektif: null,
    TanggalBerakhir: null,
    PengingatTerakhir: null,
    StatusSejak: null,
    TanggalDiajukan: null,
    Created: "2026-01-01T00:00:00Z",
    ...isi,
  };
}

// =====================================================================================================================
// K05: Pengaturan dibaca flow dengan aturan yang sama dengan aplikasi
// =====================================================================================================================

kasus("nilai bawaan flow sama persis dengan PENGATURAN_BAWAAN aplikasi", () => {
  for (const [k, v] of Object.entries(PA.BAWAAN)) assert.deepEqual(v, (App.PENGATURAN_BAWAAN as unknown as Record<string, unknown>)[k], k);
  assert.deepEqual(PA.STATUS_SLA, [...App.STATUS_SLA]);
  assert.deepEqual(Object.keys(PA.PEMERIKSA).sort(), Object.keys(PA.BAWAAN).sort());
});

/** Nilai satu kunci menurut flow: Nilai_<kunci>, Periksa_<kunci>, lalu Pengaturan (bawaan bila tidak sah atau gagal). */
function nilaiFlow(kunci: string, nilaiJson: string | null): unknown {
  let hasil: Nilai = null;
  try {
    const terurai = hitungMurni(PA.ekspresiNilai(kunci, nilaiJson == null ? "null" : `'${Umum.petik(nilaiJson)}'`));
    const k: Konteks = { sekarang: "2026-10-05T00:00:00Z", keluaran: (n) => (n === `Nilai_${kunci}` ? terurai : gagal(n)), aksi: (n) => gagal(n), butirs: {} };
    hasil = evaluasi(PA.ekspresiPeriksa(kunci).slice(1), k);
  } catch {
    hasil = null;
  }
  return keJs(hasil ?? hitungMurni(PA.bawaanE(kunci)));
}
const urutAngka = (v: unknown) => (Array.isArray(v) ? [...v].sort((a, b) => a - b) : v);

const CONTOH: Record<string, (string | null)[]> = {
  hariPeringatan: ["[90,60,30,7,0]", "[120, 45, 3]", " [60, 30] ", "[7]", "[]", "[90,90,30]", "[730]", "[731]", "[-1]", "[30.5]", "[90.0,30]", "[1e2]", '["30"]', "[true]", "[[1]]", '{"a":1}', "5", '"90"', "null", "bukan json", "[1,2,3,4,5,6,7,8,9,10]", "[1,2,3,4,5,6,7,8,9,10,11]", "[0]", "", null],
  jaminanPeringatan: ["[30,14,7]", "[30,14,7,0]", "[365]", "[366]", "[]", "[60, 60]", '["7"]', "x"],
  hariKerja: ["[1,2,3,4,5]", "[0,6]", "[5,4,3]", "[1,1,2]", "[0,1,2,3,4,5,6]", "[7]", "[]", "[1.5]", '{"senin":1}'],
  sla: [
    '{"Diajukan":3,"Review Legal":10,"Perlu Revisi":5,"Proses Tanda Tangan":7}',
    '{"Review Legal":14}',
    "{}",
    '{"Lain":5}',
    '{"Diajukan":0}',
    '{"Diajukan":90}',
    '{"Diajukan":91}',
    '{"Diajukan":null}',
    '{"Diajukan":"3"}',
    '{"Diajukan":2.5}',
    '{"Diajukan":true}',
    '{"Diajukan":[3]}',
    '{"Diajukan":{"x":1}}',
    "[1,2]",
    "7",
    "rusak",
  ],
  slaPakaiHariKerja: ["true", "false", " true ", '"true"', "1", "TRUE", "null", "", "ya", null],
  alamatGrupLegal: [
    `"legal${D}"`,
    '""',
    '"  Legal@WKI.co.id  "',
    '"bukan-email"',
    '"a@b"',
    '"a@b."',
    '"a@.b"',
    '"a b@c.d"',
    '"a@b.c;d@e.f"',
    '"a@b.c,d@e.f"',
    '"@b.c"',
    '"a@@b.c"',
    "legal@wki.co.id",
    "123",
    "null",
    ' "a@b.c" ',
    '"',
    "",
  ],
  ambangEskalasi: [
    '{"diajukanTanpaPicHari":3,"revisiMenggantungHari":10}',
    "{}",
    '{"diajukanTanpaPicHari":60}',
    '{"diajukanTanpaPicHari":0}',
    '{"diajukanTanpaPicHari":61}',
    '{"revisiMenggantungHari":90}',
    '{"revisiMenggantungHari":91}',
    '{"diajukanTanpaPicHari":null}',
    '{"diajukanTanpaPicHari":"3"}',
    '{"diajukanTanpaPicHari":[3]}',
    '{"diajukanTanpaPicHari":2.5}',
    "[]",
    "5",
  ],
};

kasus("Periksa_<kunci> menerima dan menolak NilaiJson persis seperti bacaPengaturan di aplikasi", () => {
  for (const [kunci, contoh] of Object.entries(CONTOH)) {
    for (const nilaiJson of contoh) {
      const app = App.bacaPengaturan(nilaiJson == null ? [] : [{ kunci, nilaiJson }]).pengaturan as unknown as Record<string, unknown>;
      assert.deepEqual(urutAngka(nilaiFlow(kunci, nilaiJson)), urutAngka(app[kunci]), `${kunci} = ${JSON.stringify(nilaiJson)}`);
    }
  }
});

kasus("nilai bawaan di aksi Pengaturan tidak memakai json() untuk teks dan ya/tidak", () => {
  assert.equal(PA.bawaanE("alamatGrupLegal"), "''");
  assert.equal(PA.bawaanE("slaPakaiHariKerja"), "false");
  assert.deepEqual(keJs(hitungMurni(PA.bawaanE("sla"))), App.PENGATURAN_BAWAAN.sla);
});

// =====================================================================================================================
// Hari kerja dan umur tahap (U25: SLA dari Pengaturan, hari kerja bila slaPakaiHariKerja)
// =====================================================================================================================

kasus("topeng dan hari kerja kumulatif flow sama dengan hitungHariKerja aplikasi", () => {
  let benih = 7;
  const acak = () => (benih = (benih * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (const hk of [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6], [0, 6], [3]]) {
    const topeng = hitungMurni(PA.ekspresiTopeng(`json('${JSON.stringify(hk)}')`)) as string;
    assert.equal(topeng, [0, 1, 2, 3, 4, 5, 6].map((d) => (hk.includes(d) ? "1" : "0")).join(""));
    for (let n = 0; n < 60; n++) {
      const dari = Date.UTC(2026, 0, 1) + Math.floor(acak() * 300 * 86_400_000);
      const sampai = dari + Math.floor(acak() * 40 * 86_400_000);
      const iso = (ms: number) => `'${new Date(ms).toISOString()}'`;
      const flow = Number(hitungMurni(`sub(${PA.hariKerjaKumulatif(iso(sampai), `'${topeng}'`)},${PA.hariKerjaKumulatif(iso(dari), `'${topeng}'`)})`));
      const app = App.hitungHariKerja(dari, sampai, hk);
      assert.ok(Math.abs(flow - app) < 1e-9, `${hk} ${new Date(dari).toISOString()} -> ${new Date(sampai).toISOString()}: flow ${flow}, aplikasi ${app}`);
    }
  }
});

// =====================================================================================================================
// U25: Agenda pagi
// =====================================================================================================================

// Senin 5 Oktober 2026, 07.30 WIB.
const SENIN = "2026-10-05T00:30:00Z";
function dataAgenda(): Record<string, Obj[]> {
  idKontrak = 200n;
  return {
    pengguna: pengguna(),
    pengaturan: barisPengaturan({}),
    kontrak: [
      // Antrean
      kontrakSp({ Title: "Sewa Crane Mendesak", Status: { Value: "Diajukan" }, Prioritas: { Value: "Mendesak" }, TanggalDiajukan: "2026-10-04T01:00:00Z" }),
      kontrakSp({ Title: "Jasa Survei Lama", Status: { Value: "Diajukan" }, TanggalDiajukan: "2026-09-30T02:00:00Z" }),
      kontrakSp({ Title: "Pengadaan Tinggi", Status: { Value: "Diajukan" }, Prioritas: { Value: "Tinggi" }, TanggalDiajukan: "2026-10-01T02:00:00Z", PicLegalEmail: `lia${D}`, PicLegalNama: "Lia Legal" }),
      // Sedang ditangani
      kontrakSp({ Title: "Review Terlambat", Status: { Value: "Review Legal" }, StatusSejak: "2026-09-20T02:00:00Z", PicLegalEmail: `lia${D}`, PicLegalNama: "Lia Legal" }),
      kontrakSp({ Title: "Revisi Menggantung", Status: { Value: "Perlu Revisi" }, StatusSejak: "2026-09-25T02:00:00Z", PicLegalEmail: `bima${D}`, PicLegalNama: "Bima Legal" }),
      kontrakSp({ Title: "Tanda Tangan Baru", Status: { Value: "Proses Tanda Tangan" }, StatusSejak: "2026-10-03T02:00:00Z", PicLegalEmail: `bima${D}`, PicLegalNama: "Bima Legal" }),
      // Aktif dan akan berakhir
      kontrakSp({ Title: "Kontrak Lama Tanpa Efektif", Status: { Value: "Aktif" }, TanggalBerakhir: tglSp("2026-10-20") }),
      kontrakSp({ Title: "Kontrak Diperpanjang Otomatis", Status: { Value: "Aktif" }, BerakhirEfektif: tglSp("2026-10-15"), PerpanjanganOtomatis: true }),
      kontrakSp({ Title: "Addendum Satu", Status: { Value: "Aktif" }, BerakhirEfektif: tglSp("2026-10-12"), JenisKontrak: { Value: "Addendum / Amandemen" }, KontrakIndukId: 1n }),
      kontrakSp({ Title: "Kontrak Masih Jauh", Status: { Value: "Aktif" }, BerakhirEfektif: tglSp("2027-06-30") }),
    ],
  };
}

kasus("agenda: satu email per Legal/Admin dengan blok milik sendiri, Perlu perhatian, tanda tanpa PIC, dan SLA dari Pengaturan", () => {
  const env = lingkungan(SENIN, dataAgenda());
  const jejak = jalankanFlow(flowAgenda, env);
  assert.equal(jejak.get("Ada_agenda")!.status, "Succeeded", jejak.get("Ada_agenda")!.error);
  assert.deepEqual(env.email.map((e) => e.ke).sort(), [`bima${D}`, `citra${D}`, `lia${D}`]);
  const lia = env.email.find((e) => e.ke === `lia${D}`)!;
  assert.equal(lia.subjek, "[WiCon] Agenda pagi: 2 milik Anda, 3 di antrean, 2 perlu perhatian");
  assert.match(env.email.find((e) => e.ke === `citra${D}`)!.subjek, /: 0 milik Anda,/);
  // Isi
  const isi = lia.isi;
  assert.ok(isi.startsWith("<!DOCTYPE html>"));
  assert.ok(!isi.includes("@{"), "masih ada ekspresi yang tidak dinilai");
  assert.match(isi, /Review milik Anda/);
  assert.match(isi, /Perlu perhatian/);
  assert.match(isi, /tanpa PIC lebih dari 2 hari, atau revisi yang belum dikirim ulang pengaju lebih dari 7 hari/);
  assert.match(isi, /Belum ada PIC/);
  assert.match(isi, /Revisi menggantung/);
  assert.match(isi, /LEWAT SLA/);
  assert.match(isi, /menunggu pengaju/);
  assert.match(isi, /PT Mitra &amp; Rekan/);
  // Antrean urut prioritas: Mendesak, Tinggi, lalu Normal.
  const awalAntrean = isi.indexOf("Antrean hari ini");
  const antrean = isi.slice(awalAntrean, isi.indexOf("Sedang ditangani</div>", awalAntrean));
  const urut = ["Sewa Crane Mendesak", "Pengadaan Tinggi", "Jasa Survei Lama"].map((t) => antrean.indexOf(t));
  assert.ok(urut.every((x) => x >= 0), `antrean ${urut}`);
  assert.equal((antrean.match(/Belum ada PIC/g) ?? []).length, 2, "dua pengajuan antrean tanpa PIC ditandai");
  assert.ok(urut[0]! < urut[1]! && urut[1]! < urut[2]!, `urutan antrean ${urut}`);
  // Berakhir dalam 30 hari: TanggalBerakhir cadangan ikut, otomatis dan addendum tidak.
  assert.match(isi, /Kontrak Lama Tanpa Efektif/);
  assert.ok(!isi.includes("Kontrak Diperpanjang Otomatis") && !isi.includes("Addendum Satu") && !isi.includes("Kontrak Masih Jauh"));
  assert.match(env.filter.Ambil_akan_berakhir!, /BerakhirEfektif eq null and TanggalBerakhir le '2026-11-04'/);
  // Pengajuan Diajukan tanpa PIC lebih dari 2 hari (Jasa Survei Lama) dan revisi lebih dari 7 hari.
  assert.deepEqual((jejak.get("Tanpa_pic_lama")!.outputs as Obj).body && ((jejak.get("Tanpa_pic_lama")!.outputs as Obj).body as Obj[]).map((x) => x.Title), ["Jasa Survei Lama"]);
  assert.deepEqual(((jejak.get("Revisi_menggantung")!.outputs as Obj).body as Obj[]).map((x) => x.Title), ["Revisi Menggantung"]);
});

kasus("agenda: Get items memakai paginasi 5000", () => {
  for (const n of ["Ambil_antrean", "Ambil_berjalan", "Ambil_akan_berakhir"]) {
    assert.deepEqual((flowAgenda.aksi[n] as any).runtimeConfiguration?.paginationPolicy, { minimumItemCount: 5000 }, n);
  }
  for (const n of ["Ambil_kontrak_berakhir", "Ambil_kontrak_masa", "Ambil_jaminan_berakhir", "Ambil_kewajiban"]) {
    assert.deepEqual((flowPengingat.aksi[n] as any).runtimeConfiguration?.paginationPolicy, { minimumItemCount: 5000 }, n);
  }
});

kasus("agenda: ambang dan SLA dari Pengaturan; hari kerja membuat akhir pekan tidak dihitung", () => {
  const data = dataAgenda();
  // Diajukan Jumat 09.00 WIB: 2,9 hari kalender sampai Senin 07.30, tetapi kurang dari 1 hari kerja.
  data.kontrak = [kontrakSp({ Title: "Masuk Jumat", Status: { Value: "Diajukan" }, TanggalDiajukan: "2026-10-02T02:00:00Z" })];
  const kalender = lingkungan(SENIN, { ...data, pengaturan: barisPengaturan({}) });
  jalankanFlow(flowAgenda, kalender);
  assert.equal(kalender.email.length, 3);
  assert.match(kalender.email[0]!.isi, /LEWAT SLA/);
  assert.match(kalender.email[0]!.subjek, /1 perlu perhatian/);

  const kerja = lingkungan(SENIN, { ...data, pengaturan: barisPengaturan({ slaPakaiHariKerja: "true", hariKerja: "[1,2,3,4,5]" }) });
  jalankanFlow(flowAgenda, kerja);
  assert.ok(!kerja.email[0]!.isi.includes("LEWAT SLA"));
  assert.match(kerja.email[0]!.subjek, /0 perlu perhatian/);
  assert.match(kerja.email[0]!.isi, /hari kerja/);

  // Ambang SLA Diajukan dinaikkan dan eskalasi dilonggarkan: tidak ada tanda sama sekali.
  const longgar = lingkungan(SENIN, { ...data, pengaturan: barisPengaturan({ sla: '{"Diajukan":5}', ambangEskalasi: '{"diajukanTanpaPicHari":4}' }) });
  jalankanFlow(flowAgenda, longgar);
  assert.ok(!longgar.email[0]!.isi.includes("LEWAT SLA"));
  assert.match(longgar.email[0]!.subjek, /0 perlu perhatian/);
});

kasus("agenda: alamatGrupLegal menggantikan email per orang, mode uji mengalahkan semuanya", () => {
  const grup = lingkungan(SENIN, { ...dataAgenda(), pengaturan: barisPengaturan({ alamatGrupLegal: `"Legal.Grup${D}"` }) });
  jalankanFlow(flowAgenda, grup);
  assert.deepEqual(grup.email.map((e) => e.ke), [`legal.grup${D}`]);
  assert.match(grup.email[0]!.subjek, /^\[WiCon\] Agenda pagi: 3 di antrean, 3 sedang ditangani, 2 perlu perhatian$/);

  const uji = lingkungan(SENIN, { ...dataAgenda(), pengaturan: barisPengaturan({ alamatGrupLegal: `"legal.grup${D}"`, emailUji: `"penguji${D}"` }) });
  jalankanFlow(flowAgenda, uji);
  assert.deepEqual(uji.email.map((e) => e.ke), [`penguji${D}`]);
  assert.match(uji.email[0]!.subjek, /^\[UJI\] /);

  const ujiPribadi = lingkungan(SENIN, { ...dataAgenda(), pengaturan: barisPengaturan({ emailUji: `"penguji${D}"` }) });
  jalankanFlow(flowAgenda, ujiPribadi);
  assert.equal(ujiPribadi.email.length, 3);
  assert.ok(ujiPribadi.email.every((e) => e.ke === `penguji${D}` && e.subjek.startsWith("[UJI] ")));
  assert.ok(ujiPribadi.email.some((e) => e.subjek.endsWith("(untuk Lia Legal)")));
});

kasus("agenda: tidak dikirim bila semua blok kosong atau Pengaturan tidak terbaca", () => {
  const kosong = lingkungan(SENIN, { ...dataAgenda(), kontrak: [] });
  jalankanFlow(flowAgenda, kosong);
  assert.equal(kosong.email.length, 0);

  const rusak = lingkungan(SENIN, dataAgenda(), { gagalAmbil: ["Ambil_pengaturan"] });
  jalankanFlow(flowAgenda, rusak);
  assert.equal(rusak.email.length, 0);

  // Baris Pengaturan yang rusak jatuh ke bawaan, flow tetap jalan.
  const bawaan = lingkungan(SENIN, { ...dataAgenda(), pengaturan: barisPengaturan({ sla: "{rusak", ambangEskalasi: "[]", hariKerja: "[9]" }) });
  jalankanFlow(flowAgenda, bawaan);
  assert.equal(bawaan.email.length, 3);
  assert.match(bawaan.email[0]!.subjek, /2 perlu perhatian/);
});

// =====================================================================================================================
// U24 dan U34: Pengingat harian
// =====================================================================================================================

const tambahHari = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const selisih = (dari: string, ke: string) => Math.round((Date.parse(`${ke}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86_400_000);

interface HasilSimulasi {
  /** Hari pengiriman pengingat per judul kontrak, relatif terhadap AKHIR (negatif = sebelum). */
  hari: Record<string, number[]>;
  email: (Email & { tanggal: string })[];
}

/** Jalankan flow pengingat tiap pagi 07.00 WIB dari `mulai` sampai `selesai`, melompati tanggal di `lompat`. */
function simulasi(tabel: Record<string, Obj[]>, mulai: string, selesai: string, acuan: string, lain: Partial<Lingkungan> = {}, lompat: string[] = []): HasilSimulasi {
  const hasil: HasilSimulasi = { hari: {}, email: [] };
  for (let t = mulai; t <= selesai; t = tambahHari(t, 1)) {
    if (lompat.includes(t)) continue;
    const env = lingkungan(`${t}T00:00:00Z`, tabel, lain);
    const jejak = jalankanFlow(flowPengingat, env);
    for (const n of ["Untuk_setiap_kontrak", "Untuk_setiap_jaminan", "Untuk_setiap_kewajiban"]) {
      assert.notEqual(jejak.get(n)?.status, "Failed", `${t} ${n}: ${jejak.get(n)?.error ?? ""} ${[...jejak].filter(([, j]) => j.error).map(([a, j]) => `${a}: ${j.error}`).join("; ")}`);
    }
    for (const u of env.ubahan) {
      const baris = tabel[u.tabel]!.find((b) => samaDengan(b.ID!, u.id))!;
      (hasil.hari[baris.Title as string] ??= []).push(selisih(acuan, t));
    }
    hasil.email.push(...env.email.map((e) => ({ ...e, tanggal: t })));
  }
  return hasil;
}

const AKHIR = "2027-03-01";
function dataPengingat(pengaturan: Record<string, string> = {}): Record<string, Obj[]> {
  idKontrak = 300n;
  const akhir = tglSp(AKHIR);
  return {
    pengguna: pengguna(),
    pengaturan: barisPengaturan(pengaturan),
    kontrak: [
      kontrakSp({ Title: "Biasa", Status: { Value: "Aktif" }, BerakhirEfektif: akhir, PicLegalEmail: `lia${D}` }),
      kontrakSp({ Title: "Biasa Tanpa Efektif", Status: { Value: "Aktif" }, TanggalBerakhir: akhir }),
      kontrakSp({ Title: "Biasa Masa 30", Status: { Value: "Aktif" }, BerakhirEfektif: akhir, MasaPemberitahuanHari: 30.0 }),
      kontrakSp({ Title: "Otomatis Masa 60", Status: { Value: "Aktif" }, BerakhirEfektif: akhir, MasaPemberitahuanHari: 60.0, PerpanjanganOtomatis: true }),
      kontrakSp({ Title: "Otomatis Tanpa Masa", Status: { Value: "Aktif" }, BerakhirEfektif: akhir, PerpanjanganOtomatis: true }),
      kontrakSp({ Title: "Addendum", Status: { Value: "Aktif" }, BerakhirEfektif: akhir, JenisKontrak: { Value: "Addendum / Amandemen" }, KontrakIndukId: 301n }),
      kontrakSp({ Title: "Sudah Berakhir", Status: { Value: "Berakhir" }, BerakhirEfektif: akhir }),
    ],
    jaminan: [{ ID: 1n, Title: "JP-001", StatusJaminan: { Value: "Aktif" }, JenisJaminan: { Value: "Jaminan Pelaksanaan" }, TanggalBerakhirJaminan: akhir, KontrakId: 301n, Penerbit: "Bank A", NilaiJaminan: 1500000.0, MataUangJaminan: { Value: "IDR" }, PengingatTerakhir: null }],
    kewajiban: [{ ID: 1n, Title: "BAST tahap 1", StatusKewajiban: { Value: "Terbuka" }, JatuhTempo: akhir, KontrakId: 301n, PicEmail: null, TipeKewajiban: { Value: "BAST" }, CatatanKewajiban: null, PengingatTerakhir: null }],
  };
}

/** Hari yang diharapkan menurut lib/masa.ts: sisa ke akhir dan/atau ke batas keputusan tepat di salah satu ambang. */
function hariDiharapkan(ambang: number[], { masa, otomatis }: { masa: number | null; otomatis: boolean }, mulai: number, selesai: number): number[] {
  const hari: number[] = [];
  for (let r = mulai; r <= selesai; r++) {
    const sisaAkhir = -r;
    const pakaiAkhir = !(otomatis && masa != null);
    const pakaiBatas = masa != null && (otomatis || masa > 0);
    if ((pakaiAkhir && ambang.includes(sisaAkhir)) || (pakaiBatas && ambang.includes(sisaAkhir - masa!))) hari.push(r);
  }
  return hari;
}

const MULAI = tambahHari(AKHIR, -200);
const SELESAI = tambahHari(AKHIR, 5);
let simBawaan: HasilSimulasi;

kasus("pengingat: ambang bawaan 90/60/30/7/0, addendum dan kontrak non-Aktif dilewati, TanggalBerakhir sebagai cadangan", () => {
  simBawaan = simulasi(dataPengingat(), MULAI, SELESAI, AKHIR);
  const T = [90, 60, 30, 7, 0];
  assert.deepEqual(simBawaan.hari["Biasa"], hariDiharapkan(T, { masa: null, otomatis: false }, -200, 5));
  assert.deepEqual(simBawaan.hari["Biasa"], [-90, -60, -30, -7, 0]);
  assert.deepEqual(simBawaan.hari["Biasa Tanpa Efektif"], [-90, -60, -30, -7, 0]);
  assert.equal(simBawaan.hari["Addendum"], undefined);
  assert.equal(simBawaan.hari["Sudah Berakhir"], undefined);
});

kasus("pengingat (U34): batas keputusan memakai ambang yang sama; kontrak otomatis tidak disuruh mengajukan addendum", () => {
  const T = [90, 60, 30, 7, 0];
  assert.deepEqual(simBawaan.hari["Biasa Masa 30"], hariDiharapkan(T, { masa: 30, otomatis: false }, -200, 5));
  assert.deepEqual(simBawaan.hari["Biasa Masa 30"], [-120, -90, -60, -37, -30, -7, 0]);
  assert.deepEqual(simBawaan.hari["Otomatis Masa 60"], [-150, -120, -90, -67, -60]);
  assert.deepEqual(simBawaan.hari["Otomatis Tanpa Masa"], [-90, -60, -30, -7, 0]);

  const emailDari = (judul: string) => simBawaan.email.filter((e) => e.subjek.endsWith(`: ${judul}`));
  for (const judul of ["Otomatis Masa 60", "Otomatis Tanpa Masa"]) {
    const daftar = emailDari(judul);
    assert.ok(daftar.length > 0, judul);
    for (const e of daftar) {
      assert.ok(!e.isi.includes("Ajukan addendum") && !e.isi.includes("/#/saya/ajukan?induk="), `${judul} ${e.tanggal}`);
      assert.match(e.isi, /diperpanjang otomatis/);
    }
  }
  // Otomatis dengan masa: judul dan tanggal batas keputusan (1 Maret 2027 - 60 hari = 31 Desember 2026).
  const pertama = emailDari("Otomatis Masa 60")[0]!;
  assert.match(pertama.subjek, /Batas keputusan dalam 90 hari/);
  assert.match(pertama.isi, /31 Desember 2026/);
  // Otomatis tanpa PIC: tim Legal ikut menerima karena keputusannya di tangan Legal.
  assert.ok(pertama.ke.includes(`fajar${D}`) && pertama.ke.includes(`lia${D}`) && pertama.ke.includes(`citra${D}`), pertama.ke);
  assert.match(emailDari("Otomatis Tanpa Masa")[0]!.subjek, /Diperpanjang otomatis dalam 90 hari/);
  // Kontrak biasa: tombol addendum ke /#/saya/ajukan?induk=<ID>, PIC menerima, batas keputusan disebut bila ada masa.
  const biasa = emailDari("Biasa")[0]!;
  assert.match(biasa.isi, /\/#\/saya\/ajukan\?induk=301"/);
  assert.equal(biasa.ke, `fajar${D};lia${D}`);
  assert.match(emailDari("Biasa Masa 30")[0]!.subjek, /Batas keputusan dalam 90 hari/);
  assert.match(emailDari("Biasa Masa 30").at(-1)!.subjek, /Kontrak berakhir hari ini/);
  for (const e of simBawaan.email) assert.ok(!e.isi.includes("@{") && !e.subjek.includes("@{"), e.subjek);
});

kasus("pengingat: jaminan memakai jaminanPeringatan (bawaan 30/14/7, sama dengan aplikasi), kewajiban 7/1/0", () => {
  const jaminan = simBawaan.email.filter((e) => e.subjek.includes("Jaminan")).map((e) => selisih(AKHIR, e.tanggal));
  assert.deepEqual(jaminan, [-30, -14, -7]);
  const kewajiban = simBawaan.email.filter((e) => e.subjek.includes("Kewajiban")).map((e) => selisih(AKHIR, e.tanggal));
  assert.deepEqual(kewajiban, [-7, -1, 0]);
});

kasus("pengingat: perulangan kontrak hanya untuk kontrak yang perlu diingatkan (hemat jatah aksi)", () => {
  const tabel = dataPengingat();
  const env = lingkungan(`${tambahHari(AKHIR, -200)}T00:00:00Z`, tabel);
  const jejak = jalankanFlow(flowPengingat, env);
  const panjang = (n: string) => ((jejak.get(n)!.outputs as Obj).body as Nilai[]).length;
  assert.ok(panjang("Kontrak_dipantau") >= 2, "kontrak dengan masa pemberitahuan ikut dipantau");
  assert.equal(panjang("Kontrak_perlu_diingatkan"), 0);
  assert.equal(env.email.length, 0);
});

kasus("pengingat: ambang dari Pengaturan, hari yang terlewat dikejar besoknya tanpa dobel", () => {
  const sim = simulasi(dataPengingat({ hariPeringatan: "[45,10]", jaminanPeringatan: "[20]" }), MULAI, SELESAI, AKHIR, {}, [tambahHari(AKHIR, -10)]);
  assert.deepEqual(sim.hari["Biasa"], [-45, -9]);
  assert.deepEqual(sim.hari["Biasa Masa 30"], [-75, -45, -40, -9]);
  assert.deepEqual(sim.email.filter((e) => e.subjek.includes("Jaminan")).map((e) => selisih(AKHIR, e.tanggal)), [-20]);
});

kasus("pengingat: kolom MasaPemberitahuanHari belum ada, pengingat biasa tetap jalan", () => {
  const data = dataPengingat();
  for (const k of data.kontrak!) delete k.MasaPemberitahuanHari;
  const kolom = { kontrak: ["Status", "Diarsipkan", "BerakhirEfektif", "TanggalBerakhir", "PerpanjanganOtomatis"], jaminan: ["StatusJaminan", "TanggalBerakhirJaminan"], kewajiban: ["StatusKewajiban", "JatuhTempo"], pengguna: ["Aktif", "Peran"] };
  const sim = simulasi(data, tambahHari(AKHIR, -95), tambahHari(AKHIR, -85), AKHIR, { kolom });
  assert.deepEqual(sim.hari["Biasa"], [-90]);
  assert.deepEqual(sim.hari["Biasa Masa 30"], [-90]);
});

kasus("pengingat: kontrak lama yang sudah lewat diingatkan sekali saja, mode uji mengalihkan semua email", () => {
  idKontrak = 400n;
  const tabel = { ...dataPengingat({ emailUji: `"penguji${D}"` }), kontrak: [kontrakSp({ Title: "Lupa Ditutup", Status: { Value: "Aktif" }, TanggalBerakhir: tglSp("2025-12-31") })] };
  const sim = simulasi(tabel, "2026-10-05", "2026-10-09", AKHIR);
  assert.deepEqual(sim.hari["Lupa Ditutup"], [selisih(AKHIR, "2026-10-05")]);
  const e = sim.email.find((x) => x.subjek.includes("Lupa Ditutup"))!;
  assert.equal(e.ke, `penguji${D}`);
  assert.match(e.subjek, /^\[UJI\] \[WiCon\] Masa berlaku sudah lewat 278 hari: Lupa Ditutup$/);
});

// =====================================================================================================================
// U27 dan U23b: Kirim email dari kotak keluar
// =====================================================================================================================

const SEKARANG_KIRIM = "2026-10-05T03:00:00Z";
function jalankanKirim(baru: Obj, sebelumnya: Obj[] = [], lain: Partial<Lingkungan> = {}) {
  const notifikasi = [...sebelumnya, { ID: 500n, StatusKirim: { Value: "Antri" }, Cc: null, IsiHtml: "<p>Isi</p>", Title: "Subjek", JenisNotif: { Value: "Status Berubah" }, KontrakId: null, ...baru }];
  const env = lingkungan(SEKARANG_KIRIM, { notifikasi }, { pemicu: { body: notifikasi[notifikasi.length - 1]! }, ...lain });
  const jejak = jalankanFlow(flowKirim, env);
  const baris = notifikasi[notifikasi.length - 1]!;
  return { env, jejak, status: (baris.StatusKirim as Obj).Value, galat: baris.Galat as string };
}
const pengingatLalu = (jamLalu: number, kontrakId: Nilai, status = "Terkirim"): Obj => ({
  ID: 480n,
  Title: "Pengingat lama",
  JenisNotif: { Value: "Pengingat" },
  KontrakId: kontrakId,
  StatusKirim: { Value: status },
  DikirimPada: new Date(Date.parse(SEKARANG_KIRIM) - jamLalu * 3_600_000).toISOString(),
});

kasus("kirim email: alamat perusahaan terkirim, alamat luar dan penerima kosong ditolak dengan Galat jelas (U23b)", () => {
  const ok = jalankanKirim({ Penerima: `Lia${D}; bima${D}`, Cc: `citra${D},` });
  assert.equal(ok.status, "Terkirim");
  assert.equal(ok.galat, "");
  assert.equal(ok.env.email.length, 1);
  assert.equal(ok.env.email[0]!.cc, `citra${D},`);

  for (const [penerima, cc] of [
    [`lia${D};rekan@gmail.com`, null],
    [`lia${D}`, "x@waskitainfrastruktur.co.id.palsu.com"],
    [`lia@sub.waskitainfrastruktur.co.id`, null],
    [`a@b${D}`, null],
  ] as const) {
    const r = jalankanKirim({ Penerima: penerima, Cc: cc });
    assert.equal(r.status, "Gagal", penerima);
    assert.equal(r.env.email.length, 0);
    assert.match(r.galat, /^Ditolak: alamat di luar @waskitainfrastruktur\.co\.id \(.+\)\. Email WiCon hanya untuk alamat perusahaan\.$/);
  }
  const kosong = jalankanKirim({ Penerima: "  " });
  assert.equal(kosong.status, "Gagal");
  assert.equal(kosong.galat, "Ditolak: tidak ada alamat penerima.");
});

kasus("kirim email: Pengingat paling banyak sekali per 24 jam per kontrak, dicek di flow (U27)", () => {
  const pengingat = { Penerima: `fajar${D}`, JenisNotif: { Value: "Pengingat" }, KontrakId: 12.0 };
  const ganda = jalankanKirim(pengingat, [pengingatLalu(5, 12.0)]);
  assert.equal(ganda.status, "Gagal");
  assert.match(ganda.galat, /sudah terkirim dalam 24 jam terakhir/);
  assert.equal(ganda.env.email.length, 0);
  assert.match(ganda.env.filter.Ambil_pengingat_terkirim!, /^ID lt 500 and ID gt -1500 and KontrakId eq 12 and JenisNotif eq 'Pengingat' and StatusKirim eq 'Terkirim' and DikirimPada ge '2026-10-04T03:00:00Z'$/);

  assert.equal(jalankanKirim(pengingat, [pengingatLalu(30, 12.0)]).status, "Terkirim");
  assert.equal(jalankanKirim(pengingat, [pengingatLalu(5, 13.0)]).status, "Terkirim");
  assert.equal(jalankanKirim(pengingat, [pengingatLalu(5, 12.0, "Gagal")]).status, "Terkirim");
  // Jenis lain untuk kontrak yang sama tidak dibatasi.
  assert.equal(jalankanKirim({ Penerima: `fajar${D}`, KontrakId: 12.0 }, [pengingatLalu(5, 12.0)]).status, "Terkirim");
  // Pemeriksaan gagal: email tetap dikirim, catatannya di Galat.
  const cekGagal = jalankanKirim(pengingat, [], { gagalAmbil: ["Ambil_pengingat_terkirim"] });
  assert.equal(cekGagal.status, "Terkirim");
  assert.match(cekGagal.galat, /tanpa pemeriksaan batas pengingat 24 jam/);
});

kasus("kirim email: kegagalan Outlook ditandai Gagal beserta pesannya", () => {
  const r = jalankanKirim({ Penerima: `lia${D}` }, [], { gagalKirim: true });
  assert.equal(r.status, "Gagal");
  assert.equal(r.galat, "Mailbox tidak tersedia.");
});

// =====================================================================================================================
// Laporan bulanan dan pengawas
// =====================================================================================================================

kasus("laporan: penerima tim Legal (atau alamatGrupLegal) plus Pemantau, jangka berakhir dari hariPeringatan", () => {
  const data = () => ({ pengguna: pengguna(), pengaturan: barisPengaturan({}), kontrak: dataAgenda().kontrak! });
  const biasa = lingkungan("2026-11-01T00:00:00Z", data());
  jalankanFlow(flowLaporan, biasa);
  assert.equal(biasa.email.length, 1);
  assert.deepEqual(biasa.email[0]!.ke.split(";").sort(), [`bima${D}`, `citra${D}`, `dodi${D}`, `lia${D}`]);
  assert.equal(biasa.email[0]!.subjek, "[WiCon] Laporan bulanan Oktober 2026");
  assert.match(biasa.email[0]!.isi, /Berakhir dalam 90 hari/);

  const grup = lingkungan("2026-11-01T00:00:00Z", { ...data(), pengaturan: barisPengaturan({ alamatGrupLegal: `"legal.grup${D}"`, hariPeringatan: "[120,30]" }) });
  jalankanFlow(flowLaporan, grup);
  assert.deepEqual(grup.email[0]!.ke.split(";").sort(), [`dodi${D}`, `legal.grup${D}`]);
  assert.match(grup.email[0]!.isi, /Berakhir dalam 120 hari/);
  assert.ok(!grup.email[0]!.isi.includes("@{"));
});

kasus("pengawas: perubahan di luar alur dicatat dan dikabarkan ke Admin, tanpa memulihkan versi (U37A)", () => {
  const pemicu = { body: { ID: 7n, Title: "Kontrak X", NomorPengajuan: "PK-2026-007", Status: { Value: "Aktif" }, Editor: { Email: `Fajar${D}`, DisplayName: "Fajar" } } };
  const versi = { value: [{ VersionId: 512n, Status: "Aktif" }, { VersionId: 1n, Status: "Diajukan" }] };
  const env = lingkungan(SENIN, { pengguna: pengguna(), pengaturan: barisPengaturan({}) }, { pemicu, http: () => versi });
  jalankanFlow(flowPengawas, env);
  assert.equal(env.email.length, 1);
  assert.match(env.email[0]!.subjek, /Perubahan status di luar alur: PK-2026-007/);
  assert.ok(env.email[0]!.ke.split(";").includes(`citra${D}`));
  assert.equal(env.tambahan.length, 1);
  assert.equal(env.ubahan.length, 0, "pengawas tidak boleh mengubah item kontrak");
});

// =====================================================================================================================
// Struktur
// =====================================================================================================================

kasus("kunci Pengaturan yang dibaca tiap flow terjadwal, dan ID flow tetap", () => {
  const kunci = (f: { aksi: Record<string, unknown> }) => Object.keys(f.aksi).filter((n) => n.startsWith("Periksa_")).map((n) => n.slice(8)).sort();
  assert.deepEqual(kunci(flowPengingat), ["alamatGrupLegal", "hariPeringatan", "jaminanPeringatan"]);
  assert.deepEqual(kunci(flowAgenda), ["alamatGrupLegal", "ambangEskalasi", "hariKerja", "sla", "slaPakaiHariKerja"]);
  assert.deepEqual(kunci(flowLaporan), ["alamatGrupLegal", "hariPeringatan"]);
  assert.deepEqual(
    [flowKirim, flowPengingat, flowAgenda, flowLaporan, flowPengawas].map((f) => f.id),
    ["ac15ca29-867f-4f1d-9cc0-770600b1b31c", "cdb6c1c6-e003-4416-a5cc-0269dece49d0", "f3f4e2d0-a927-4e0b-a4ca-11548160ab1a", "ad37ccb9-4d9a-4bf0-8dfe-aa84e5abe3ac", "76a6926e-af17-40b7-b616-1be461a82ff1"],
  );
});

console.log(`\n${nomor} kasus lolos.`);
