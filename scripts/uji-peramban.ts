// Uji pemeriksaan peramban untuk peringatan "Peramban Anda terlalu lama": lib/peramban.ts.
// Lingkungan peramban ditiru dengan objek biasa, jadi tidak butuh DOM.
// Jalankan: npx --yes tsx scripts/uji-peramban.ts
import assert from "node:assert/strict";
import { FITUR_PENTING, periksaPeramban, pesanPeramban } from "../src/lib/peramban";

let nomor = 0;
function kasus(nama: string, fn: () => void) {
  fn();
  nomor++;
  console.log(`  ok ${String(nomor).padStart(2, "0")}  ${nama}`);
}

/** Peramban modern: semua fitur ada, color-mix didukung. */
function modern(): Record<string, unknown> {
  return {
    fetch: () => undefined,
    Promise: { allSettled: () => undefined },
    ResizeObserver: class {},
    Intl: { RelativeTimeFormat: class {} },
    matchMedia: () => undefined,
    crypto: { subtle: {} },
    document: {},
    CSS: { supports: (_p: string, v: string) => v.startsWith("color-mix(") },
  };
}

kasus("peramban modern tidak diberi peringatan", () => {
  const h = periksaPeramban(modern());
  assert.deepEqual(h.fiturHilang, []);
  assert.equal(h.tanpaColorMix, false);
  assert.equal(h.perluPeringatan, false);
  assert.equal(pesanPeramban(h), null);
});

kasus("tanpa color-mix: hanya peringatan tampilan, semua fitur tetap jalan", () => {
  const g = modern();
  g.CSS = { supports: () => false };
  const h = periksaPeramban(g);
  assert.equal(h.tanpaColorMix, true);
  assert.deepEqual(h.fiturHilang, []);
  const p = pesanPeramban(h)!;
  assert.equal(p.judul, "Peramban Anda terlalu lama");
  assert.match(p.teks, /tetap bisa dipakai/);
  assert.equal(p.rincian, "");
});

kasus("peramban tanpa CSS.supports dianggap tanpa color-mix", () => {
  const g = modern();
  delete g.CSS;
  assert.equal(periksaPeramban(g).tanpaColorMix, true);
});

kasus("CSS.supports yang melempar galat tidak merusak pemeriksaan", () => {
  const g = modern();
  g.CSS = {
    supports: () => {
      throw new Error("rusak");
    },
  };
  const h = periksaPeramban(g);
  assert.equal(h.tanpaColorMix, false);
  assert.equal(h.perluPeringatan, false);
});

kasus("fitur JS hilang disebut satu per satu", () => {
  const g = modern();
  delete g.ResizeObserver;
  g.Intl = {};
  const h = periksaPeramban(g);
  assert.equal(h.fiturHilang.length, 2);
  assert.ok(h.fiturHilang.some((n) => n.includes("ResizeObserver")));
  assert.ok(h.fiturHilang.some((n) => n.includes("format waktu relatif")));
  const p = pesanPeramban(h)!;
  assert.match(p.teks, /tidak berjalan/);
  assert.match(p.rincian, /^Belum didukung: .+\.$/);
});

kasus("jalur bertingkat yang putus di tengah dianggap hilang", () => {
  const g = modern();
  g.Promise = undefined;
  g.crypto = null;
  const h = periksaPeramban(g);
  assert.ok(h.fiturHilang.some((n) => n.includes("Promise.allSettled")));
  assert.ok(h.fiturHilang.some((n) => n.includes("kripto")));
});

kasus("lingkungan kosong (Node tanpa DOM) melaporkan semua fitur hilang tanpa melempar galat", () => {
  const h = periksaPeramban({});
  assert.equal(h.fiturHilang.length, FITUR_PENTING.length);
  assert.equal(h.tanpaColorMix, false); // tanpa document: bukan peramban, jangan menuduh color-mix
  assert.equal(h.perluPeringatan, true);
});

kasus("globalThis Node lulus tanpa melempar galat", () => {
  const h = periksaPeramban();
  assert.ok(Array.isArray(h.fiturHilang));
});

console.log(`\n${nomor} kasus lulus.`);
