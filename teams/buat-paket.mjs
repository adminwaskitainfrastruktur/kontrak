// Membuat paket aplikasi Microsoft Teams: teams/KontrakWKI-Teams.zip
//   node teams/buat-paket.mjs
//
// Langkah:
//  1. Memakai ikon color.png (192x192) dan outline.png (32x32) yang dibuat dari logo WiCon.
//  2. Memeriksa struktur teams/manifest.json (kolom wajib, panjang teks, domain, GUID) dan
//     mencocokkan webApplicationInfo.id dengan VITE_MSAL_CLIENT_ID di .env.production.
//  3. Mengemas manifest.json + kedua ikon (di akar zip) dengan jszip.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import JSZip from "jszip";

const FOLDER = dirname(fileURLToPath(import.meta.url));
const AKAR = join(FOLDER, "..");
const HASIL = join(FOLDER, "KontrakWKI-Teams.zip");

// ── 1. Ikon ─────────────────────────────────────────────────────────────────

const TEAL = [0x0a, 0x7f, 0x79];
const LIPAT = [0xd9, 0xf0, 0xec];
const PUTIH = [0xff, 0xff, 0xff];

const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABEL_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function potongan(jenis, data) {
  const panjang = Buffer.alloc(4);
  panjang.writeUInt32BE(data.length);
  const isi = Buffer.concat([Buffer.from(jenis, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(isi));
  return Buffer.concat([panjang, isi, crc]);
}

/** RGBA (Uint8Array lebar*tinggi*4) -> PNG */
function tulisPng(lebar, tinggi, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lebar, 0);
  ihdr.writeUInt32BE(tinggi, 4);
  ihdr[8] = 8; // kedalaman bit
  ihdr[9] = 6; // RGBA
  const mentah = Buffer.alloc((lebar * 4 + 1) * tinggi);
  for (let y = 0; y < tinggi; y++) {
    mentah[y * (lebar * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * lebar * 4, lebar * 4).copy(mentah, y * (lebar * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    potongan("IHDR", ihdr),
    potongan("IDAT", deflateSync(mentah, { level: 9 })),
    potongan("IEND", Buffer.alloc(0)),
  ]);
}

function dalamPoligon(x, y, titik) {
  let dalam = false;
  for (let i = 0, j = titik.length - 1; i < titik.length; j = i++) {
    const [xi, yi] = titik[i];
    const [xj, yj] = titik[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dalam = !dalam;
  }
  return dalam;
}

function jarakKeRuas(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

// Bentuk dalam satuan favicon (kotak 32x32), sama dengan public/favicon.svg.
const DOKUMEN = [[9, 7], [19, 7], [24, 12], [24, 26], [9, 26]];
const LIPATAN = [[19, 7], [19, 12], [24, 12]];
const GARIS = [
  [[12.5, 13.5], [16.5, 13.5]],
  [[12.5, 17], [19.5, 17]],
  [[12.5, 20.5], [19.5, 20.5]],
];
const TEBAL_GARIS = 1.6;

/**
 * Menggambar ikon dengan supersampling 4x4. `warnaDi(u, v)` mengembalikan [r,g,b,a] untuk satu
 * titik dalam satuan favicon; hasil sampel dirata-rata (alfa terpremultiplikasi).
 */
function gambar(ukuran, skala, pusat, warnaDi) {
  const rgba = new Uint8Array(ukuran * ukuran * 4);
  const S = 4;
  for (let py = 0; py < ukuran; py++) {
    for (let px = 0; px < ukuran; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (px + (sx + 0.5) / S - ukuran / 2) / skala + pusat;
          const v = (py + (sy + 0.5) / S - ukuran / 2) / skala + pusat;
          const [cr, cg, cb, ca] = warnaDi(u, v);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (py * ukuran + px) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round((a / (S * S)) * 255);
    }
  }
  return rgba;
}

const diGaris = (u, v) => GARIS.some(([p, q]) => jarakKeRuas(u, v, p, q) <= TEBAL_GARIS / 2);

// Ikon warna: latar teal penuh, dokumen putih di tengah (dalam area aman 120 px dari 192 px).
function ikonWarna() {
  return gambar(192, 6, 16.5, (u, v) => {
    if (dalamPoligon(u, v, DOKUMEN)) {
      if (dalamPoligon(u, v, LIPATAN)) return [...LIPAT, 1];
      if (diGaris(u, v)) return [...TEAL, 1];
      return [...PUTIH, 1];
    }
    return [...TEAL, 1];
  });
}

// Ikon garis: hanya putih di atas transparan (aturan Teams). Dokumen putih dengan sudut terlipat
// dan baris teks sebagai potongan transparan.
function ikonGaris() {
  return gambar(32, 1.3, 16.5, (u, v) => {
    if (!dalamPoligon(u, v, DOKUMEN)) return [0, 0, 0, 0];
    if (dalamPoligon(u, v, [[19, 7], [24, 12], [19.6, 12.6]]) || diGaris(u, v)) return [0, 0, 0, 0];
    if (jarakKeRuas(u, v, [19, 7.4], [19, 12]) < 0.45 || jarakKeRuas(u, v, [19, 12], [23.6, 12]) < 0.45) return [0, 0, 0, 0];
    return [...PUTIH, 1];
  });
}

// ── 2. Pemeriksaan manifest ─────────────────────────────────────────────────

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEMVER = /^\d+\.\d+\.\d+$/;

function bacaEnvProduksi() {
  const berkas = join(AKAR, ".env.production");
  if (!existsSync(berkas)) return {};
  const env = {};
  for (const baris of readFileSync(berkas, "utf-8").split(/\r?\n/)) {
    const m = baris.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function periksa(manifest) {
  const galat = [];
  const peringatan = [];
  const wajib = (cond, pesan) => cond || galat.push(pesan);
  const https = (url) => typeof url === "string" && url.startsWith("https://");

  wajib(/^1\.(1[7-9]|[2-9]\d)$/.test(manifest.manifestVersion ?? ""), "manifestVersion harus 1.17 atau lebih baru");
  wajib(typeof manifest.$schema === "string" && manifest.$schema.includes(`/v${manifest.manifestVersion}/`), "$schema harus menunjuk versi yang sama dengan manifestVersion");
  wajib(SEMVER.test(manifest.version ?? ""), "version harus berbentuk x.y.z");
  wajib(GUID.test(manifest.id ?? ""), "id harus GUID");

  const d = manifest.developer ?? {};
  wajib(typeof d.name === "string" && d.name.length > 0 && d.name.length <= 32, "developer.name wajib, maks 32 karakter");
  for (const k of ["websiteUrl", "privacyUrl", "termsOfUseUrl"]) wajib(https(d[k]), `developer.${k} wajib https`);

  const n = manifest.name ?? {};
  wajib(typeof n.short === "string" && n.short.length > 0 && n.short.length <= 30, "name.short wajib, maks 30 karakter");
  wajib(n.full === undefined || (typeof n.full === "string" && n.full.length <= 100), "name.full maks 100 karakter");

  const ds = manifest.description ?? {};
  wajib(typeof ds.short === "string" && ds.short.length > 0 && ds.short.length <= 80, "description.short wajib, maks 80 karakter");
  wajib(typeof ds.full === "string" && ds.full.length > 0 && ds.full.length <= 4000, "description.full wajib, maks 4000 karakter");

  wajib(manifest.icons?.color === "color.png" && manifest.icons?.outline === "outline.png", "icons harus color.png dan outline.png");
  wajib(/^#[0-9a-f]{6}$/i.test(manifest.accentColor ?? ""), "accentColor harus #RRGGBB");

  const domain = manifest.validDomains ?? [];
  wajib(Array.isArray(domain) && domain.length > 0, "validDomains wajib diisi");
  const tab = manifest.staticTabs ?? [];
  wajib(Array.isArray(tab) && tab.length > 0 && tab.length <= 16, "staticTabs 1 sampai 16 item");
  const entitas = new Set();
  for (const t of tab) {
    wajib(typeof t.entityId === "string" && t.entityId.length > 0 && t.entityId.length <= 64, `staticTabs: entityId wajib (maks 64)`);
    wajib(!entitas.has(t.entityId), `staticTabs: entityId ganda "${t.entityId}"`);
    entitas.add(t.entityId);
    wajib(Array.isArray(t.scopes) && t.scopes.length > 0 && t.scopes.every((s) => s === "personal" || s === "team" || s === "groupChat"), `staticTabs[${t.entityId}]: scopes tidak sah`);
    if (t.entityId === "about" || t.entityId === "conversations") continue; // tab bawaan Teams
    wajib(typeof t.name === "string" && t.name.length > 0 && t.name.length <= 128, `staticTabs[${t.entityId}]: name wajib`);
    wajib(https(t.contentUrl), `staticTabs[${t.entityId}]: contentUrl wajib https`);
    wajib(t.websiteUrl === undefined || https(t.websiteUrl), `staticTabs[${t.entityId}]: websiteUrl wajib https`);
    for (const url of [t.contentUrl, t.websiteUrl].filter(Boolean)) {
      const host = new URL(url).hostname;
      wajib(domain.includes(host), `staticTabs[${t.entityId}]: ${host} belum ada di validDomains`);
    }
  }

  const w = manifest.webApplicationInfo;
  if (w) {
    wajib(GUID.test(w.id ?? ""), "webApplicationInfo.id harus GUID (client id app registration)");
    wajib(typeof w.resource === "string" && w.resource.startsWith("api://"), "webApplicationInfo.resource harus api://…");
    const env = bacaEnvProduksi();
    if (env.VITE_MSAL_CLIENT_ID) {
      wajib(w.id === env.VITE_MSAL_CLIENT_ID, `webApplicationInfo.id (${w.id}) tidak sama dengan VITE_MSAL_CLIENT_ID di .env.production (${env.VITE_MSAL_CLIENT_ID})`);
      wajib(w.resource.endsWith(`/${env.VITE_MSAL_CLIENT_ID}`), "webApplicationInfo.resource harus diakhiri client id yang sama");
    } else peringatan.push(".env.production tidak ditemukan / tanpa VITE_MSAL_CLIENT_ID; webApplicationInfo tidak dicocokkan");
  }
  if (d.privacyUrl === d.websiteUrl) peringatan.push("developer.privacyUrl & termsOfUseUrl masih menunjuk beranda aplikasi; ganti bila ada halaman kebijakan resmi");
  return { galat, peringatan };
}

function periksaIkon(rgba, ukuran, hanyaPutih) {
  if (rgba.length !== ukuran * ukuran * 4) return `ukuran ikon bukan ${ukuran}x${ukuran}`;
  if (!hanyaPutih) return null;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] > 0 && (rgba[i] !== 255 || rgba[i + 1] !== 255 || rgba[i + 2] !== 255)) return "outline.png harus hanya putih dan transparan";
  }
  return null;
}

// ── 3. Kemas ─────────────────────────────────────────────────────────────────

const teksManifest = readFileSync(join(FOLDER, "manifest.json"), "utf-8");
const manifest = JSON.parse(teksManifest);
const { galat, peringatan } = periksa(manifest);

// Ikon dibuat dari logo WiCon (lihat public/wicon-mark.png): color.png 192x192 dan outline.png 32x32 putih-transparan.
if (!existsSync(join(FOLDER, "color.png")) || !existsSync(join(FOLDER, "outline.png"))) galat.push("teams/color.png dan teams/outline.png belum ada");

for (const p of peringatan) console.warn(`Peringatan: ${p}`);
if (galat.length > 0) {
  console.error("Manifest belum valid:");
  for (const g of galat) console.error(`  - ${g}`);
  process.exit(1);
}

const pngWarna = readFileSync(join(FOLDER, "color.png"));
const pngGaris = readFileSync(join(FOLDER, "outline.png"));

const zip = new JSZip();
const tanggal = new Date("2026-01-01T00:00:00Z"); // tetap, supaya isi zip sama bila sumbernya sama
zip.file("manifest.json", teksManifest, { date: tanggal });
zip.file("color.png", pngWarna, { date: tanggal });
zip.file("outline.png", pngGaris, { date: tanggal });
const isi = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
writeFileSync(HASIL, isi);

console.log(`Paket Teams siap: ${HASIL} (${(isi.length / 1024).toFixed(1)} KB)`);
console.log(`  manifest ${manifest.manifestVersion}, versi aplikasi ${manifest.version}, id ${manifest.id}`);
console.log(`  tab: ${manifest.staticTabs.filter((t) => t.name).map((t) => t.name).join(", ")}`);
