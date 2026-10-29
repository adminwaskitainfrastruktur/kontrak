// Uji asap UI Ruang Pengguna: sambutan pengguna baru dan jalur antrean dirender ke teks HTML di Node (tanpa peramban)
// untuk memastikan tidak ada galat saat render dan petunjuk ramah ponsel muncul. Bukan pengganti pemeriksaan visual.
// Jalankan: npx --yes tsx scripts/uji-ui-pengguna.tsx
import assert from "node:assert/strict";
import { register } from "node:module";

// config.ts membaca import.meta.env milik Vite, dan komponen mengimpor berkas .css; kait ini menggantinya untuk Node.
const kait = `export async function load(url, ctx, next) {
  if (url.endsWith("/src/auth/masukUlang.ts")) return { format: "module", shortCircuit: true, source: "export async function masukUlang() {}" };
  if (url.endsWith("/src/auth/msal.ts")) return { format: "module", shortCircuit: true, source: "export const SCOPE_GRAPH = []; export const loginRequest = {}; export const ssoRequest = {}; export const msalConfig = {}; export const dalamJendelaAuth = false;" };
  if (url.endsWith(".css")) return { format: "module", shortCircuit: true, source: "export default {};" };
  const r = await next(url, ctx);
  if (url.includes("/src/") && !url.includes("node_modules")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
const { default: SambutanPengguna } = await import("../src/components/SambutanPengguna");
const { JalurAntrean } = await import("../src/components/Antrean");
import type { Kontrak } from "../src/lib/types";

let nomor = 0;
const kasus = (nama: string, fn: () => void) => {
  fn();
  console.log(`ok ${++nomor} - ${nama}`);
};

const kontrak = (id: number): Kontrak =>
  ({ id, judul: `Kontrak ${id}`, nomorPengajuan: `KTR-2026-${String(id).padStart(4, "0")}`, prioritas: "Normal", dibuat: "2026-10-01T01:00:00Z", tanggalDiajukan: "2026-10-01T01:00:00Z" }) as unknown as Kontrak;

kasus("sambutan: tiga langkah bernomor, sapaan memakai nama, tombol tutup berlabel", () => {
  const html = renderToStaticMarkup(createElement(SambutanPengguna, { nama: "Budi", onTutup: () => undefined }));
  assert.match(html, /Selamat datang, Budi/);
  for (const judul of ["Ajukan", "Pantau antrean", "Tanggapi revisi"]) assert.ok(html.includes(judul), judul);
  assert.equal((html.match(/<li /g) ?? []).length, 3);
  assert.match(html, /aria-label="Tutup sambutan"/);
  assert.match(html, /Mengerti, tutup/);
});

kasus("sambutan: tanpa nama tetap menyapa", () => {
  const html = renderToStaticMarkup(createElement(SambutanPengguna, { nama: "", onTutup: () => undefined }));
  assert.match(html, /Selamat datang</);
});

kasus("jalur antrean: wilayah bisa difokus dan diberi nama; petunjuk geser hanya bila banyak slot", () => {
  const banyak = Array.from({ length: 10 }, (_, i) => kontrak(i + 1));
  const html = renderToStaticMarkup(createElement(JalurAntrean, { antrean: banyak, milik: [banyak[3]!], ditangani: 1 }));
  assert.match(html, /role="region"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /Geser ke samping/);
  const sedikit = renderToStaticMarkup(createElement(JalurAntrean, { antrean: banyak.slice(0, 2), milik: [], ditangani: 0 }));
  assert.ok(!sedikit.includes("Geser ke samping"));
});

console.log(`\nSemua ${nomor} kasus lulus.`);
