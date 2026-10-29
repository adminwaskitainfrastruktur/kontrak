// Uji alur tanda tangan digital end-to-end terhadap SharePoint tiruan di memori: services/tandaTangan.ts.
// Menguji pembuatan permintaan, giliran berurutan, kunci sidik dokumen, bukti PNG, pencatatan pihak luar, PDF final,
// tolak/batal, serta email yang diantrikan. Jalankan: npx --yes tsx scripts/uji-tanda-tangan.ts
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { register } from "node:module";

const tiruanGraph = `
export class GraphError extends Error {
  constructor(message, status, kode) { super(message); this.status = status; this.kode = kode; }
  get perluLogin() { return this.kode === "perlu_login"; }
  get jaringan() { return this.kode === "jaringan"; }
}
export function pasangMsal() {}
export function msalTerpasang() { return null; }
export function pesanError(err) { return err instanceof Error ? err.message : String(err); }
export function graph(path, opsi) { return globalThis.__graf.graph(path, opsi); }
export function graphSemua(path, opsi) { return globalThis.__graf.graphSemua(path, opsi); }
`;
const kait = `export async function load(url, ctx, next) {
  if (url.includes("/src/lib/graph.ts")) return { format: "module", shortCircuit: true, source: ${JSON.stringify(tiruanGraph)} };
  if (url.endsWith("/src/auth/masukUlang.ts")) return { format: "module", shortCircuit: true, source: "export async function masukUlang() {}" };
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const { GraphError } = (await import("../src/lib/graph")) as { GraphError: new (m: string, s?: number) => Error };
const { GRAPH_SITE_ID, LIST_ID } = await import("../src/config");
const { PDFDocument } = await import("pdf-lib");

// --- SharePoint tiruan -------------------------------------------------------------------------------------
interface Item { id: string; fields: Record<string, unknown> }
const daftar: Record<string, Item[]> = {};
const berkas = new Map<string, { id: string; nama: string; bytes: Uint8Array }>(); // kunci: path library
const berkasId = new Map<string, Uint8Array>();
let urut = 100;
const emailTerantri: Record<string, unknown>[] = [];
const hitungGraph: string[] = [];
const dasarList = (id: string) => `/sites/${GRAPH_SITE_ID}/lists/${id}/items`;
const DRIVE = `/sites/${GRAPH_SITE_ID}/lists/${LIST_ID.berkas}/drive`;
let timpaPertama = false; // simulasi dua penulis bersamaan: tulisan pertama ditimpa sekali

const g = globalThis as unknown as { __graf: unknown };
g.__graf = {
  graph: async (path: string, opsi: { method?: string; json?: { fields?: Record<string, unknown> } & Record<string, unknown>; body?: File } = {}) => {
    const metode = opsi.method ?? "GET";
    hitungGraph.push(`${metode} ${path}`);
    // Email dan aktivitas
    if (path.startsWith(dasarList(LIST_ID.notifikasi)) && metode === "POST") { emailTerantri.push(opsi.json!.fields!); return { id: String(++urut) }; }
    if (path.startsWith(dasarList(LIST_ID.aktivitas))) return { id: String(++urut) };
    if (path.includes(`/lists/${LIST_ID.kontrak}/items/`)) return {};
    // List tanda tangan
    const tt = dasarList(LIST_ID.tandaTangan);
    if (path.startsWith(tt)) {
      const baris = (daftar[tt] ??= []);
      if (metode === "POST") { const it = { id: String(++urut), fields: { ...opsi.json!.fields! } }; baris.push(it); return it; }
      const m = /items\/(\d+)(\/fields)?/.exec(path)!;
      const it = baris.find((b) => b.id === m[1]);
      if (!it) throw new GraphError("tidak ada", 404);
      if (metode === "PATCH") {
        const sebelum = { ...it.fields };
        Object.assign(it.fields, opsi.json);
        if (timpaPertama) { timpaPertama = false; it.fields = sebelum; } // tulisan hilang (ditimpa penulis lain)
        return {};
      }
      return { id: it.id, fields: { ...it.fields } };
    }
    // Library dokumen
    if (path.startsWith(DRIVE)) {
      const mPut = /root:\/(.+?):\/content/.exec(path);
      if (mPut && metode === "PUT") {
        const jalur = decodeURIComponent(mPut[1]!).split("/").map((s) => s).join("/");
        const bytes = new Uint8Array(await opsi.body!.arrayBuffer());
        const id = `F${++urut}`;
        berkas.set(jalur, { id, nama: jalur.split("/").at(-1)!, bytes });
        berkasId.set(id, bytes);
        return { id, name: jalur.split("/").at(-1), size: bytes.length, webUrl: `http://sp/${id}` };
      }
      if (path.includes("/listItem/fields")) return {};
      const mItem = /items\/([^/?]+)\?/.exec(path);
      if (mItem && metode === "GET") {
        const b = berkasId.get(mItem[1]!);
        if (!b) throw new GraphError("tidak ada", 404);
        return { id: mItem[1], name: "x", size: b.length, file: { mimeType: "application/octet-stream" }, "@microsoft.graph.downloadUrl": `http://dl/${mItem[1]}` };
      }
      const mPath = /root:\/(.+?):\?/.exec(path);
      if (mPath && metode === "GET") {
        const b = berkas.get(decodeURIComponent(mPath[1]!));
        if (!b) throw new GraphError("tidak ada", 404);
        return { id: b.id, name: b.nama, lastModifiedDateTime: "2026-10-16T00:00:00Z" };
      }
    }
    throw new Error(`panggilan tak terduga: ${metode} ${path}`);
  },
  graphSemua: async (path: string) => {
    if (path.startsWith(dasarList(LIST_ID.tandaTangan))) {
      const m = /KontrakId eq (\d+)/.exec(path);
      return (daftar[dasarList(LIST_ID.tandaTangan)] ?? []).filter((b) => (m ? b.fields.KontrakId === Number(m[1]) : true)).map((b) => ({ ...b, fields: { ...b.fields } }));
    }
    return []; // senyap kosong
  },
};
const fetchAsli = globalThis.fetch;
globalThis.fetch = (async (url: string) => {
  const m = /^http:\/\/dl\/(.+)$/.exec(String(url));
  const b = m ? berkasId.get(m[1]!) : undefined;
  if (!b) return new Response("tidak ada", { status: 404 });
  return new Response(b as unknown as BodyInit, { status: 200 });
}) as typeof fetch;

const T = await import("../src/services/tandaTangan");
const P = await import("../src/lib/penandatangan");

// --- Data uji ------------------------------------------------------------------------------------------------
function crc32(b: Uint8Array): number { let c, crc = 0xffffffff; for (let i = 0; i < b.length; i++) { c = (crc ^ b[i]!) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function potong(tipe: string, isi: Uint8Array): Buffer { const t = Buffer.from(tipe); const p = Buffer.alloc(4); p.writeUInt32BE(isi.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, isi]))); return Buffer.concat([p, t, isi, c]); }
function png(w = 60, h = 24): Uint8Array {
  const baris: Buffer[] = [];
  for (let y = 0; y < h; y++) { const r = Buffer.alloc(1 + w * 4); for (let x = 0; x < w; x++) if (Math.abs(y - (x * h) / w) < 2) { r[1 + x * 4] = 11; r[3 + x * 4] = 92; r[4 + x * 4] = 255; } baris.push(r); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), potong("IHDR", ihdr), potong("IDAT", deflateSync(Buffer.concat(baris))), potong("IEND", Buffer.alloc(0))]);
}
async function pdfAsli(): Promise<Uint8Array> { const d = await PDFDocument.create(); d.addPage([595, 842]); d.addPage([595, 842]); return d.save(); }

const k = { id: 7, nomorPengajuan: "KTR-2026-0007", judul: "Perjanjian Uji", mitra: "PT Mitra", status: "Proses Tanda Tangan", pengajuEmail: "pengaju@waskitainfrastruktur.co.id", picLegalEmail: "pic@waskitainfrastruktur.co.id" } as never;
const legal = { email: "legal@waskitainfrastruktur.co.id", nama: "Legal Satu", peran: "Legal", divisi: "Legal" } as never;
const A = { email: "a@waskitainfrastruktur.co.id", nama: "Ani", peran: "Pengaju", divisi: "SCM" } as never;
const B = { email: "b@waskitainfrastruktur.co.id", nama: "Budi", peran: "Pengaju", divisi: "SCM" } as never;
const orang = (nama: string, email: string, luar = false) => ({ nama, jabatan: "Direktur", peran: `Peran ${nama}`, email, luar });

const dokBytes = await pdfAsli();
const idDok = "FDOK1";
berkasId.set(idDok, dokBytes);
const dokumen = { id: idDok, nama: "Draft Final.pdf", ukuran: dokBytes.length };

let n = 0;
const kasus = async (nama: string, fn: () => Promise<void>) => { await fn(); console.log(`ok ${++n} - ${nama}`); };
const emailKe = () => emailTerantri.map((e) => String(e.Penerima));

let p!: Awaited<ReturnType<typeof T.buatPermintaan>>["permintaan"];

await kasus("buatPermintaan: hanya Legal, dokumen PDF/Word, daftar sah", async () => {
  await assert.rejects(T.buatPermintaan(k, dokumen, [orang("Ani", A.email)], false, A), /Hanya Admin dan Legal/);
  await assert.rejects(T.buatPermintaan(k, { ...dokumen, nama: "foto.png" }, [orang("Ani", A.email)], false, legal), /PDF atau Word/);
  await assert.rejects(T.buatPermintaan(k, dokumen, [orang("Ani", "ani@gmail.com")], false, legal), /@waskitainfrastruktur/);
  await assert.rejects(T.buatPermintaan({ ...k, status: "Review Legal" } as never, dokumen, [orang("Ani", A.email)], false, legal), /Proses Tanda Tangan/);
  assert.equal((daftar[dasarList(LIST_ID.tandaTangan)] ?? []).length, 0, "gagal validasi tidak menulis apa pun");
});

await kasus("buatPermintaan berurutan: tersimpan dengan sidik dokumen, email hanya ke penandatangan pertama", async () => {
  const h = await T.buatPermintaan(k, dokumen, [orang("Ani", A.email), orang("Budi", B.email), orang("Mitra", "", true)], true, legal);
  p = h.permintaan;
  assert.equal(h.emailGagal, false);
  assert.equal(p.isi.penandatangan.length, 3);
  assert.match(p.isi.dokumen.sha256, /^[0-9a-f]{64}$/);
  assert.equal(p.isi.judul, "Perjanjian Uji");
  assert.equal(P.statusPermintaan(p.isi), "Menunggu");
  assert.deepEqual(emailKe(), [A.email]);
  assert.equal((daftar[dasarList(LIST_ID.tandaTangan)]![0]!.fields as { StatusTtd: string }).StatusTtd, "Menunggu");
});

await kasus("tidak boleh membuat permintaan kedua selagi yang pertama berjalan", async () => {
  await assert.rejects(T.buatPermintaan(k, dokumen, [orang("Ani", A.email)], false, legal), /Masih ada permintaan/);
});

await kasus("belum giliran: Budi ditolak, orang lain ditolak, Legal tidak bisa menandatangani atas nama", async () => {
  await assert.rejects(T.tandatangani(k, p, png(), "coret", B), /tidak bisa menandatangani/);
  await assert.rejects(T.tandatangani(k, p, png(), "coret", { ...A, email: "x@waskitainfrastruktur.co.id" } as never), /tidak bisa menandatangani/);
  await assert.rejects(T.tandatangani(k, p, png(), "coret", legal), /tidak bisa menandatangani/);
});

await kasus("dokumen berubah sejak dikunci: tanda tangan ditolak dan tidak ada bukti tersimpan", async () => {
  const asli = berkasId.get(idDok)!;
  berkasId.set(idDok, new Uint8Array([...asli, 0]));
  const sebelum = berkas.size;
  await assert.rejects(T.tandatangani(k, p, png(), "coret", A), /berubah sejak permintaan/);
  assert.equal(berkas.size, sebelum);
  berkasId.set(idDok, asli);
});

await kasus("Ani menandatangani: bukti PNG di subfolder TTD, jejak tercatat, giliran Budi dikabari", async () => {
  emailTerantri.length = 0;
  const h = await T.tandatangani(k, p, png(), "coret", A);
  p = h.permintaan;
  const ani = p.isi.penandatangan[0]!;
  assert.ok(P.sudahTtd(ani));
  assert.equal(ani.sumber, "coret");
  assert.match(ani.jejak!, /^[0-9a-f]{64}$/);
  assert.ok([...berkas.keys()].some((x) => x.startsWith("KTR-2026-0007/TTD/ttd-KTR-2026-0007-p1-")), "bukti PNG ada di subfolder TTD");
  assert.equal(h.lengkap, false);
  assert.deepEqual(emailKe(), [B.email]);
  assert.equal(P.statusPermintaan(p.isi), "Sebagian");
  await assert.rejects(T.tandatangani(k, p, png(), "coret", A), /tidak bisa menandatangani/, "tidak bisa dua kali");
});

await kasus("tanda tangan yang tertimpa penulis lain diulang sampai bertahan", async () => {
  timpaPertama = true;
  const h = await T.tandatangani(k, p, png(), "unggah", B);
  p = h.permintaan;
  assert.ok(P.sudahTtd(p.isi.penandatangan[1]!), "tanda tangan Budi bertahan setelah ditimpa sekali");
  assert.equal(p.isi.penandatangan[1]!.sumber, "unggah");
  assert.equal(timpaPertama, false);
});

await kasus("pihak luar: hanya Legal yang mencatat, tercatat siapa pencatatnya; permintaan lengkap membuat PDF final", async () => {
  await assert.rejects(T.catatPihakLuar(k, p, "p3", png(), A), /hanya bisa dicatat Legal/);
  emailTerantri.length = 0;
  const h = await T.catatPihakLuar(k, p, "p3", png(), legal);
  p = h.permintaan;
  const luar = p.isi.penandatangan[2]!;
  assert.equal(luar.dicatatOleh, "Legal Satu");
  assert.equal(luar.sumber, "dicatat");
  assert.equal(h.lengkap, true);
  assert.equal(h.galatPdf, null);
  assert.equal(P.statusPermintaan(p.isi), "Selesai");
  assert.ok(p.isi.berkasPdf, "ID PDF final tercatat");
  const pdf = berkasId.get(p.isi.berkasPdf!)!;
  const doc = await PDFDocument.load(pdf);
  assert.equal(doc.getPageCount(), 3, "2 halaman asli + 1 halaman pengesahan");
  assert.ok([...berkas.keys()].includes("KTR-2026-0007/KTR-2026-0007-ditandatangani.pdf"));
  assert.equal(emailKe().length, 1, "satu email selesai");
  const penerima = emailKe()[0]!.split(";");
  for (const e of [A.email, B.email, "pengaju@waskitainfrastruktur.co.id", "pic@waskitainfrastruktur.co.id", legal.email]) assert.ok(penerima.includes(e), `penerima selesai memuat ${e}`);
});

await kasus("setelah selesai: tidak ada aksi yang tersisa", async () => {
  await assert.rejects(T.tolakPermintaan(k, p, "alasan cukup panjang", A), /tidak bisa menolak/);
  await assert.rejects(T.batalkanPermintaan(k, p, "alasan cukup panjang", legal), /tidak bisa membatalkan/);
  await assert.rejects(T.ingatkanPenandatangan(k, p, legal), /tidak bisa mengirim pengingat/);
});

await kasus("tolak: alasan wajib, permintaan ditutup, Legal dan pembuat dikabari; permintaan baru boleh dibuat", async () => {
  daftar[dasarList(LIST_ID.tandaTangan)] = [];
  const h = await T.buatPermintaan(k, dokumen, [orang("Ani", A.email), orang("Budi", B.email)], false, legal);
  let q = h.permintaan;
  assert.equal(emailKe().filter((e) => e === A.email || e === B.email).length >= 2, true, "bersamaan: keduanya dikabari");
  await assert.rejects(T.tolakPermintaan(k, q, "x", B), /minimal 5/);
  await assert.rejects(T.tolakPermintaan(k, q, "alasan cukup panjang", legal), /tidak bisa menolak/);
  emailTerantri.length = 0;
  q = (await T.tolakPermintaan(k, q, "Nilai kontrak salah ketik", B)).permintaan;
  assert.equal(P.statusPermintaan(q.isi), "Ditolak");
  assert.equal(q.isi.tolak!.oleh, "Budi");
  assert.ok(emailKe()[0]!.includes(legal.email) || emailKe()[0]!.includes("pic@waskitainfrastruktur.co.id"));
  await assert.rejects(T.tandatangani(k, q, png(), "coret", A), /tidak bisa menandatangani/);
  const baru = await T.buatPermintaan(k, dokumen, [orang("Ani", A.email)], false, legal);
  assert.equal(P.statusPermintaan(baru.permintaan.isi), "Menunggu");
  assert.equal((await T.ambilPermintaan(7))!.itemId, baru.permintaan.itemId, "yang berjalan didahulukan");
});

await kasus("batal: pembuat atau Legal; pindaian basah menyelesaikan tanpa tanda tangan digital", async () => {
  const q = (await T.ambilPermintaan(7))!;
  await assert.rejects(T.batalkanPermintaan(k, q, "alasan cukup panjang", A), /tidak bisa membatalkan/);
  await assert.rejects(T.unggahPindaian(k, q, new File([new Uint8Array([1])], "scan.pdf"), A), /Hanya Legal/);
  await assert.rejects(T.unggahPindaian(k, q, new File([new Uint8Array([1])], "scan.jpg"), legal), /format PDF/);
  const h = await T.unggahPindaian(k, q, new File([dokBytes as unknown as BlobPart], "scan.pdf", { type: "application/pdf" }), legal);
  assert.equal(P.statusPermintaan(h.permintaan.isi), "Selesai");
  assert.ok(h.permintaan.isi.berkasScan);
  const b = await T.buatPermintaan(k, dokumen, [orang("Ani", A.email)], false, legal);
  const x = await T.batalkanPermintaan(k, b.permintaan, "Salah dokumen yang dipilih", legal);
  assert.equal(P.statusPermintaan(x.permintaan.isi), "Dibatalkan");
});

await kasus("pengingat hanya ke yang sedang gilirannya dan hanya internal", async () => {
  const b = await T.buatPermintaan(k, dokumen, [orang("Mitra", "", true), orang("Ani", A.email)], true, legal);
  emailTerantri.length = 0;
  const r = await T.ingatkanPenandatangan(k, b.permintaan, legal);
  assert.equal(r.jumlah, 0, "yang ditunggu pihak luar: tak ada email");
  assert.equal(emailTerantri.length, 0);
});

await kasus("TTD tersimpan: simpan, baca kembali, hapus per email", async () => {
  assert.equal(await T.ambilTtdTersimpan(A.email), null);
  const gambar = png();
  await T.simpanTtdTersimpan(A.email, gambar);
  assert.ok([...berkas.keys()].includes("_TTD Tersimpan/a@waskitainfrastruktur.co.id.png"));
  const t = await T.ambilTtdTersimpan(A.email.toUpperCase());
  assert.deepEqual([...t!.bytes], [...gambar]);
  assert.equal(await T.ambilTtdTersimpan(B.email), null, "milik orang lain tidak ikut terbaca");
});

globalThis.fetch = fetchAsli;
console.log(`\n${n} kasus lulus (${hitungGraph.length} panggilan Graph tiruan)`);
