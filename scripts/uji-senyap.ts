// Uji senyap (mute) notifikasi per kontrak: services/senyap.ts dan penyaringan penerima di antrikanEmail.
// Jalankan: npx --yes tsx scripts/uji-senyap.ts
import assert from "node:assert/strict";
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

interface Panggilan {
  path: string;
  opsi?: { method?: string; json?: { fields?: Record<string, unknown> } };
}
const g = globalThis as unknown as { __graf: { graph: (p: string, o?: Panggilan["opsi"]) => Promise<unknown>; graphSemua: (p: string, o?: unknown) => Promise<unknown[]> } };
const tulis: Panggilan[] = [];
let barisSenyap: { id: string; fields: { Title: string; KontrakId: number } }[] = [];
let bacaGagal = false;
g.__graf = {
  graph: async (path, opsi) => {
    tulis.push({ path, opsi });
    if (opsi?.method === "POST") return { id: "99", fields: opsi.json?.fields };
    return {};
  },
  graphSemua: async (path) => {
    if (bacaGagal) throw new Error("list tidak ada");
    const m = /KontrakId eq (\d+)/.exec(path);
    const t = /Title eq '([^']+)'/.exec(path);
    return barisSenyap.filter((b) => (m ? b.fields.KontrakId === Number(m[1]) : t ? b.fields.Title === t[1] : true));
  },
};

const S = await import("../src/services/senyap");
const N = await import("../src/services/notifikasi");

let nomor = 0;
const kasus = async (nama: string, fn: () => Promise<void> | void) => {
  tulis.length = 0;
  await fn();
  console.log(`ok ${++nomor} - ${nama}`);
};
const email = (kontrakId: number | undefined, penerima: string[], cc: string[] = []) => ({ penerima, cc, subjek: "Uji", html: "<p>x</p>", jenis: "Status Berubah" as const, kontrakId });
const dikirim = () => tulis.filter((t) => t.opsi?.method === "POST").map((t) => t.opsi!.json!.fields!);

barisSenyap = [
  { id: "1", fields: { Title: "bima@waskitainfrastruktur.co.id", KontrakId: 7 } },
  { id: "2", fields: { Title: "citra@waskitainfrastruktur.co.id", KontrakId: 7 } },
  { id: "3", fields: { Title: "bima@waskitainfrastruktur.co.id", KontrakId: 9 } },
];

await kasus("ambilSenyapSaya: kontrak yang dibisukan satu pengguna, dengan ID barisnya", async () => {
  const peta = await S.ambilSenyapSaya("Bima@waskitainfrastruktur.co.id".toLowerCase());
  assert.deepEqual([...peta.entries()].sort(), [[7, "1"], [9, "3"]]);
});

await kasus("emailSenyapKontrak: hanya yang membisukan kontrak itu", async () => {
  assert.deepEqual([...(await S.emailSenyapKontrak(7))].sort(), ["bima@waskitainfrastruktur.co.id", "citra@waskitainfrastruktur.co.id"]);
  assert.deepEqual([...(await S.emailSenyapKontrak(9))], ["bima@waskitainfrastruktur.co.id"]);
  assert.equal((await S.emailSenyapKontrak(123)).size, 0);
});

await kasus("antrikanEmail: penerima yang membisukan kontrak itu dilewati, yang lain tetap dikirimi", async () => {
  await N.antrikanEmail(email(7, ["Bima@waskitainfrastruktur.co.id", "lia@waskitainfrastruktur.co.id"], ["citra@waskitainfrastruktur.co.id", "dewi@waskitainfrastruktur.co.id"]));
  const [f] = dikirim();
  assert.equal(f!.Penerima, "lia@waskitainfrastruktur.co.id");
  assert.equal(f!.Cc, "dewi@waskitainfrastruktur.co.id");
});

await kasus("antrikanEmail: bila semua penerima membisukan, email tidak dibuat sama sekali", async () => {
  await N.antrikanEmail(email(7, ["bima@waskitainfrastruktur.co.id", "citra@waskitainfrastruktur.co.id"]));
  assert.equal(dikirim().length, 0);
});

await kasus("antrikanEmail: senyap satu kontrak tidak memengaruhi kontrak lain atau email tanpa kontrak", async () => {
  await N.antrikanEmail(email(8, ["bima@waskitainfrastruktur.co.id"]));
  await N.antrikanEmail(email(undefined, ["bima@waskitainfrastruktur.co.id"]));
  assert.equal(dikirim().length, 2);
});

await kasus("antrikanEmail: gagal membaca daftar senyap tidak menahan email (lebih baik terkirim daripada hilang)", async () => {
  bacaGagal = true;
  await N.antrikanEmail(email(7, ["bima@waskitainfrastruktur.co.id"]));
  bacaGagal = false;
  assert.equal(dikirim().length, 1);
});

await kasus("bisukanKontrak menulis satu baris Title=email KontrakId=ID", async () => {
  const id = await S.bisukanKontrak("Lia@WaskitaInfrastruktur.co.id", 12);
  assert.equal(id, "99");
  const f = dikirim()[0]!;
  assert.equal(f.Title, "lia@waskitainfrastruktur.co.id");
  assert.equal(f.KontrakId, 12);
});

console.log(`\nSemua ${nomor} kasus lulus.`);
