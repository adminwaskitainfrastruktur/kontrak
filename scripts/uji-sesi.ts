// Uji fondasi ketahanan sesi dan aksesibilitas: lib/cobaUlang.ts (U38), lib/pemancarSesi.ts (U38),
// lib/langgananKontrak.ts (U26), lib/lapisan.ts (U40, tumpukan Escape), lib/glosariumStatus.ts (U40).
// Jalankan: npx --yes tsx scripts/uji-sesi.ts
import assert from "node:assert/strict";
import { register } from "node:module";

// src/config.ts membaca import.meta.env milik Vite, yang tidak ada di Node. Kait ini menggantinya dengan objek kosong.
const kait = `export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const C = await import("../src/lib/cobaUlang");
const P = await import("../src/lib/pemancarSesi");
const G = await import("../src/lib/langgananKontrak");
const Lp = await import("../src/lib/lapisan");
const Gl = await import("../src/lib/glosariumStatus");

let nomor = 0;
async function kasus(nama: string, fn: () => void | Promise<void>) {
  await fn();
  nomor++;
  console.log(`  ok ${String(nomor).padStart(2, "0")}  ${nama}`);
}

console.log("lib/cobaUlang");

await kasus("429 diulang untuk semua metode; 503/504 hanya GET/PATCH/DELETE, tidak untuk POST", () => {
  for (const m of ["GET", "POST", "PATCH", "DELETE", "put"]) assert.equal(C.bolehCobaUlang(m, 429), true, m);
  for (const s of [503, 504]) {
    assert.equal(C.bolehCobaUlang("GET", s), true);
    assert.equal(C.bolehCobaUlang("patch", s), true);
    assert.equal(C.bolehCobaUlang("DELETE", s), true);
    assert.equal(C.bolehCobaUlang("POST", s), false);
  }
  for (const s of [400, 401, 403, 404, 409, 500, 502]) assert.equal(C.bolehCobaUlang("GET", s), false, String(s));
});

await kasus("Retry-After dalam detik atau tanggal HTTP; kosong/aneh = null", () => {
  const sekarang = Date.parse("2026-10-03T03:00:00Z");
  assert.equal(C.bacaRetryAfter("3", sekarang), 3000);
  assert.equal(C.bacaRetryAfter(" 1.5 ", sekarang), 1500);
  assert.equal(C.bacaRetryAfter("Sat, 03 Oct 2026 03:00:07 GMT", sekarang), 7000);
  assert.equal(C.bacaRetryAfter("Sat, 03 Oct 2026 02:59:00 GMT", sekarang), 0);
  assert.equal(C.bacaRetryAfter("", sekarang), null);
  assert.equal(C.bacaRetryAfter(null, sekarang), null);
  assert.equal(C.bacaRetryAfter("nanti", sekarang), null);
});

await kasus("jeda: Retry-After dipakai, tanpa itu naik berlipat 1-2-4 detik, berhenti setelah 3 kali", () => {
  assert.equal(C.jedaCobaUlang({ metode: "GET", status: 429, percobaan: 0, retryAfter: "2" }), 2000);
  assert.equal(C.jedaCobaUlang({ metode: "GET", status: 503, percobaan: 0 }), 1000);
  assert.equal(C.jedaCobaUlang({ metode: "GET", status: 503, percobaan: 1 }), 2000);
  assert.equal(C.jedaCobaUlang({ metode: "GET", status: 503, percobaan: 2 }), 4000);
  assert.equal(C.jedaCobaUlang({ metode: "GET", status: 503, percobaan: C.MAKS_COBA_ULANG }), null);
  assert.equal(C.jedaCobaUlang({ metode: "POST", status: 503, percobaan: 0 }), null);
  // Server meminta menunggu terlalu lama: tidak diulang, galatnya ditampilkan.
  assert.equal(C.jedaCobaUlang({ metode: "GET", status: 429, percobaan: 0, retryAfter: "120" }), null);
});

await kasus("tidur: selesai setelah jeda, dan berhenti lebih awal bila dibatalkan", async () => {
  const awal = Date.now();
  await C.tidur(15);
  assert.ok(Date.now() - awal >= 10);
  const batal = new AbortController();
  const janji = C.tidur(5_000, batal.signal);
  batal.abort();
  await assert.rejects(janji);
});

console.log("lib/pemancarSesi");

await kasus("perlu login dikabarkan sekali sampai sesi pulih; pendengar bisa berhenti", () => {
  let perlu = 0;
  let pulih = 0;
  const lepasA = P.dengarPerluLogin(() => perlu++);
  const lepasB = P.dengarSesiPulih(() => pulih++);
  assert.equal(P.sesiSedangBerakhir(), false);
  P.kabarkanPerluLogin();
  P.kabarkanPerluLogin();
  P.kabarkanPerluLogin();
  assert.equal(perlu, 1);
  assert.equal(P.sesiSedangBerakhir(), true);
  P.kabarkanSesiPulih();
  assert.equal(pulih, 1);
  assert.equal(P.sesiSedangBerakhir(), false);
  P.kabarkanPerluLogin();
  assert.equal(perlu, 2);
  lepasA();
  lepasB();
  P.kabarkanSesiPulih();
  P.kabarkanPerluLogin();
  assert.equal(perlu, 2);
  assert.equal(pulih, 1);
  P.kabarkanSesiPulih();
});

await kasus("pendengar yang galat tidak menghentikan pendengar lain", () => {
  const galatAsli = console.error;
  console.error = () => undefined;
  let jalan = 0;
  const a = P.dengarPerluLogin(() => {
    throw new Error("rusak");
  });
  const b = P.dengarPerluLogin(() => jalan++);
  P.kabarkanPerluLogin();
  console.error = galatAsli;
  assert.equal(jalan, 1);
  a();
  b();
  P.kabarkanSesiPulih();
});

console.log("lib/langgananKontrak");

await kasus("pengosongan cache dikabarkan; tanpaKabar membungkam penyegaran sendiri", () => {
  let n = 0;
  const lepas = G.dengarCacheKontrak(() => n++);
  G.kabarkanCacheKontrakKosong();
  assert.equal(n, 1);
  const hasil = G.tanpaKabar(() => {
    G.kabarkanCacheKontrakKosong();
    return 42;
  });
  assert.equal(hasil, 42);
  assert.equal(n, 1);
  lepas();
  G.kabarkanCacheKontrakKosong();
  assert.equal(n, 1);
});

await kasus("pendengar tertunda menggabungkan pengosongan beruntun menjadi satu panggilan", async () => {
  let n = 0;
  const lepas = G.dengarCacheKontrakTertunda(() => n++, 20);
  G.kabarkanCacheKontrakKosong();
  G.kabarkanCacheKontrakKosong();
  G.kabarkanCacheKontrakKosong();
  assert.equal(n, 0);
  await C.tidur(60);
  assert.equal(n, 1);
  G.kabarkanCacheKontrakKosong();
  lepas(); // dilepas sebelum jeda habis: tidak dipanggil
  await C.tidur(40);
  assert.equal(n, 1);
});

console.log("lib/lapisan");

await kasus("Escape hanya menutup lapisan paling atas; melepas lapisan tengah tidak merusak urutan", () => {
  const ditutup: string[] = [];
  const lepasModal = Lp.daftarkanLapisan({ tutup: () => ditutup.push("modal"), wadah: null });
  const lepasPalet = Lp.daftarkanLapisan({ tutup: () => ditutup.push("palet"), wadah: null });
  const lepasMenu = Lp.daftarkanLapisan({ tutup: () => ditutup.push("menu"), wadah: null });
  assert.equal(Lp.jumlahLapisan(), 3);
  assert.equal(Lp.tekanEscape(), true);
  assert.deepEqual(ditutup, ["menu"]);
  lepasMenu();
  lepasModal(); // modal di bawah dilepas lebih dulu (mis. komponen dilepas)
  assert.equal(Lp.tekanEscape(), true);
  assert.deepEqual(ditutup, ["menu", "palet"]);
  lepasPalet();
  assert.equal(Lp.jumlahLapisan(), 0);
  assert.equal(Lp.tekanEscape(), false);
  // Melepas dua kali aman.
  lepasPalet();
  assert.equal(Lp.jumlahLapisan(), 0);
});

console.log("lib/glosariumStatus");

await kasus("glosarium dari ALUR: langkah berikut per status, status akhir tanpa langkah", () => {
  const diajukan = Gl.langkahBerikut("Diajukan");
  assert.deepEqual(
    diajukan.map((l) => `${l.label}|${l.oleh}|${l.ke}`),
    ["Mulai Review|legal|Review Legal", "Tolak|legal|Ditolak", "Batalkan Pengajuan|pengaju|Dibatalkan"],
  );
  assert.deepEqual(
    Gl.langkahBerikut("Perlu Revisi").map((l) => l.oleh),
    ["pengaju", "pengaju"],
  );
  for (const s of ["Berakhir", "Ditolak", "Dibatalkan"] as const) assert.deepEqual(Gl.langkahBerikut(s), []);
  for (const s of ["Diajukan", "Review Legal", "Perlu Revisi", "Proses Tanda Tangan", "Aktif", "Berakhir", "Ditolak", "Dibatalkan"] as const) assert.ok(Gl.ARTI_STATUS[s].length > 10, s);
  assert.match(Gl.teksGlosarium("Aktif"), /^Aktif: .+Berikutnya: Tandai Berakhir oleh Legal \(menjadi Berakhir\)\.$/);
  assert.match(Gl.teksGlosarium("Ditolak"), /status akhir/);
});

console.log(`\nSemua ${nomor} kasus lulus.`);
