// Uji asap tampilan Lembar Hasil Review Legal: komponen dirender ke teks HTML di Node (tanpa peramban) untuk memastikan
// tidak ada galat saat render dan isinya muncul. Bukan pengganti pemeriksaan visual di peramban.
// Jalankan: npx --yes tsx scripts/uji-lembar-render.tsx
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
const { default: DokumenLembar } = await import("../src/components/DokumenLembar");
const { default: LembarEditor } = await import("../src/components/LembarEditor");
const { default: KartuHasilReview } = await import("../src/components/KartuHasilReview");
const { PeringatanLembarTtd } = await import("../src/components/PanelLembarReview");
const R = await import("../src/lib/lembarReview");
const { susunDokumenLembar } = await import("../src/lib/lembarDokumen");
import type { Kontrak } from "../src/lib/types";

let nomor = 0;
const kasus = (nama: string, fn: () => void) => {
  fn();
  console.log(`ok ${++nomor} - ${nama}`);
};

const k = {
  id: 7,
  judul: "Pengadaan Besi Beton",
  nomorPengajuan: "KTR-2026-0007",
  nomorKontrak: "",
  jenis: "Pengadaan Jasa",
  divisi: "SCM",
  mitra: "PT Baja Nusantara",
  nilai: 1_000_000_000,
  mataUang: "IDR",
  tanggalMulai: "2026-11-01",
  tanggalBerakhir: "2027-04-30",
  status: "Review Legal",
  prioritas: "Normal",
  deskripsi: "Jasa pemasangan",
  pengajuEmail: "scm@wki.co.id",
  pengajuNama: "Budi",
  picLegalEmail: "legal@wki.co.id",
  picLegalNama: "Rina",
  tanggalDiajukan: "2026-10-01T02:00:00Z",
  jenisPerubahan: [],
  checklistReview: null,
  pihakLain: [],
  dibuat: "2026-10-01T02:00:00Z",
  diubah: "2026-10-01T02:00:00Z",
} as unknown as Kontrak;

const SEKARANG = "2026-10-05T04:00:00Z";
const data = R.susunDataOtomatis({ kontrak: k, dokumen: [], aktivitas: [], sekarang: SEKARANG });
const draf = R.putaranBaru(k, null, { nama: "Rina", email: "legal@wki.co.id" }, SEKARANG, "2026-10-05");
draf.temuan = [{ ...R.temuanKosong(), pasal: "Pasal 5", isu: "Denda tanpa batas", usulan: "Batasi 5%", risiko: "Tinggi" }];
draf.syarat = [R.syaratKosong("Meterai")];

kasus("DokumenLembar merender semua blok tanpa galat", () => {
  const html = renderToStaticMarkup(createElement(DokumenLembar, { blok: susunDokumenLembar(draf, data, { dicetak: SEKARANG }) }));
  assert.match(html, /LEMBAR HASIL REVIEW LEGAL/);
  assert.match(html, /<table/);
  assert.match(html, /data-label="Pasal"/);
  assert.match(html, /lembar-ttd/);
  assert.match(html, /Pasal 5/);
  assert.ok(!/undefined|NaN|\[object/.test(html));
});

kasus("LembarEditor merender bagian yang terbuka dan label yang dibutuhkan", () => {
  const html = renderToStaticMarkup(
    createElement(LembarEditor, { k, draf, ubah: () => undefined, data, onPindai: () => undefined, pindaiSibuk: false, pindaiGalat: "", terkunci: false, onMintaRevisi: () => undefined }),
  );
  assert.match(html, /Terisi otomatis dari sistem/);
  assert.match(html, /Pokok-pokok kontrak/);
  assert.match(html, /Temuan per pasal/);
  assert.match(html, /Kepatuhan regulasi/);
  assert.match(html, /Kesimpulan dan catatan/);
  assert.match(html, /Tambah temuan/);
  assert.match(html, /Isi Minta Revisi dari temuan \(1\)/);
  assert.match(html, /Saran dari isi lembar/);
  assert.match(html, /Standar awal/);
  assert.ok(!/undefined|NaN|\[object/.test(html));
});

kasus("KartuHasilReview menampilkan kesimpulan dan catatan pengaju, dan tidak apa pun bila tidak berlaku", () => {
  const hasil = R.uraiHasilPengaju({ kesimpulan: "layak-catatan", putaran: 2, waktu: "2026-10-05T03:00:00Z", tanggal: "2026-10-05", oleh: "Rina", catatan: "Mohon siapkan jaminan." });
  const html = renderToStaticMarkup(createElement(KartuHasilReview, { hasil, k: { status: "Proses Tanda Tangan", statusSejak: null } }));
  assert.match(html, /Hasil review Legal/);
  assert.match(html, /Layak dengan catatan/);
  assert.match(html, /Mohon siapkan jaminan/);
  assert.ok(!/risiko|temuan/i.test(html.replace(/Hasil review Legal/g, "")));
  assert.equal(renderToStaticMarkup(createElement(KartuHasilReview, { hasil: null, k: { status: "Proses Tanda Tangan", statusSejak: null } })), "");
  assert.equal(renderToStaticMarkup(createElement(KartuHasilReview, { hasil, k: { status: "Diajukan", statusSejak: null } })), "");
});

kasus("PeringatanLembarTtd: tanpa lembar tetap bernada lunak", () => {
  const html = renderToStaticMarkup(createElement(PeringatanLembarTtd, { lembar: null }));
  assert.match(html, /Belum ada Lembar Hasil Review Legal/);
  assert.match(html, /tetap bisa lanjut/);
});

console.log(`\nSemua ${nomor} uji lulus.`);
