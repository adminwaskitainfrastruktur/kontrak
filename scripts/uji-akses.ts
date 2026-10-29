// Uji akses domain otomatis: lib/akses.ts, aturan lihat/ubah untuk sesi tanpa divisi (lib/alur.ts),
// sebutan dan pengingat untuk pengaju yang tidak terdaftar (lib/mention.ts), dan "Ajukan serupa" (lib/serupa.ts).
// Jalankan: npx --yes tsx scripts/uji-akses.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { Kontrak, Pengguna, Sesi } from "../src/lib/types";

// src/config.ts membaca import.meta.env milik Vite, yang tidak ada di Node. Kait ini menggantinya dengan objek kosong.
const kait = `export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const A = await import("../src/lib/akses");
const L = await import("../src/lib/alur");
const M = await import("../src/lib/mention");
const S = await import("../src/lib/serupa");

let nomor = 0;
async function kasus(nama: string, fn: () => void | Promise<void>) {
  await fn();
  nomor++;
  console.log(`  ok ${String(nomor).padStart(2, "0")}  ${nama}`);
}

// --- Data uji --------------------------------------------------------------------------------

const DOMAIN = "waskitainfrastruktur.co.id";

function k(p: Partial<Kontrak> & { id: number }): Kontrak {
  return {
    judul: `Kontrak ${p.id}`,
    nomorPengajuan: `KTR-2026-${String(p.id).padStart(4, "0")}`,
    nomorKontrak: "",
    jenis: "Pengadaan Barang",
    divisi: "SCM",
    mitra: "PT Maju Jaya",
    nilai: 1_000_000,
    mataUang: "IDR",
    tanggalMulai: null,
    tanggalBerakhir: null,
    status: "Diajukan",
    prioritas: "Normal",
    deskripsi: "",
    targetSelesai: null,
    pengajuEmail: `budi@${DOMAIN}`,
    pengajuNama: "Budi",
    picLegalEmail: "",
    picLegalNama: "",
    tanggalDiajukan: "2026-10-01T03:00:00Z",
    tanggalTandaTangan: null,
    kontrakIndukId: null,
    mouAcuanId: null,
    jenisPerubahan: [],
    urutanAddendum: null,
    statusSejak: null,
    berakhirEfektif: null,
    checklistReview: null,
    checklistTtd: null,
    kodeProyek: "",
    nomorReferensi: "",
    costCenter: "",
    mitraId: null,
    kontrakFinal: "",
    perpanjanganOtomatis: false,
    masaPemberitahuanHari: null,
    modeBerakhir: "",
    adaSengketa: false,
    plafon: null,
    persetujuan: null,
    salinDari: null,
    npwpMitra: "",
    alamatMitra: "",
    penandatanganMitra: "",
    jabatanMitra: "",
    dasarKewenangan: "",
    dibuat: "2026-10-01T03:00:00Z",
    diubah: "2026-10-01T03:00:00Z",
    webUrl: "",
    ...p,
  };
}

const pengguna: Pengguna[] = [
  { id: 1, nama: "Rina", email: `rina@${DOMAIN}`, divisi: "Legal", peran: "Legal", aktif: true },
  { id: 2, nama: "Sari", email: `sari@${DOMAIN}`, divisi: "SCM", peran: "Pengaju", aktif: true },
  { id: 3, nama: "Lama", email: `lama@${DOMAIN}`, divisi: "Pengadaan", peran: "Pengaju", aktif: false },
  { id: 4, nama: "Ganda", email: `ganda@${DOMAIN}`, divisi: "SCM", peran: "Pengaju", aktif: false },
  { id: 5, nama: "Ganda Baru", email: `ganda@${DOMAIN}`, divisi: "Pengadaan", peran: "Legal", aktif: true },
  { id: 6, nama: "Mitra Luar", email: "konsultan@contoh.com", divisi: "Legal", peran: "Pemantau", aktif: true },
];
const tentukan = (email: string, adminBawaan: string[] = []) => A.tentukanAkses({ email, nama: "Nama MSAL", pengguna, adminBawaan, domain: DOMAIN });

console.log("lib/akses");

await kasus("adalahEmailKantor: hanya @domain persis, tanpa subdomain atau akhiran palsu", () => {
  assert.equal(A.adalahEmailKantor(`andi@${DOMAIN}`, DOMAIN), true);
  assert.equal(A.adalahEmailKantor(`ANDI@${DOMAIN.toUpperCase()}`, DOMAIN), true);
  assert.equal(A.adalahEmailKantor(`andi@sub.${DOMAIN}`, DOMAIN), false);
  assert.equal(A.adalahEmailKantor(`andi@${DOMAIN}.palsu.com`, DOMAIN), false);
  assert.equal(A.adalahEmailKantor(`@${DOMAIN}`, DOMAIN), false);
  assert.equal(A.adalahEmailKantor(`andi@${DOMAIN}`, ""), false);
});

await kasus("terdaftar aktif: peran dan divisi dari list, terdaftar = true", () => {
  const h = tentukan(`RINA@${DOMAIN}`);
  assert.ok(h.boleh);
  assert.deepEqual(h.sesi, { email: `rina@${DOMAIN}`, nama: "Rina", peran: "Legal", divisi: "Legal", penggunaId: 1, terdaftar: true });
  // Terdaftar aktif di luar domain tetap boleh (mis. akun tamu yang sengaja didaftarkan).
  const luar = tentukan("konsultan@contoh.com");
  assert.ok(luar.boleh && luar.sesi.peran === "Pemantau");
});

await kasus("terdaftar tetapi dinonaktifkan: tidak boleh masuk walau akun kantor atau admin bawaan", () => {
  assert.deepEqual(tentukan(`lama@${DOMAIN}`), { boleh: false, alasan: "dinonaktifkan" });
  assert.deepEqual(tentukan(`lama@${DOMAIN}`, [`lama@${DOMAIN}`]), { boleh: false, alasan: "dinonaktifkan" });
});

await kasus("dua baris untuk email yang sama: baris aktif yang dipakai", () => {
  const h = tentukan(`ganda@${DOMAIN}`);
  assert.ok(h.boleh);
  assert.equal(h.sesi.peran, "Legal");
  assert.equal(h.sesi.penggunaId, 5);
});

await kasus("admin bawaan yang belum terdaftar: Admin, divisi IT, terdaftar = false", () => {
  const h = tentukan("Bos@Luar.co", ["bos@luar.co"]);
  assert.ok(h.boleh);
  assert.deepEqual(h.sesi, { email: "bos@luar.co", nama: "Nama MSAL", peran: "Admin", divisi: "IT", penggunaId: null, terdaftar: false });
});

await kasus("akun kantor tak terdaftar: Pengaju tanpa divisi, penggunaId null, terdaftar = false", () => {
  const h = tentukan(`andi@${DOMAIN}`);
  assert.ok(h.boleh);
  assert.deepEqual(h.sesi, { email: `andi@${DOMAIN}`, nama: "Nama MSAL", peran: "Pengaju", divisi: null, penggunaId: null, terdaftar: false });
  assert.equal(A.pengajuTanpaDivisi(h.sesi), true);
  assert.equal(A.labelDivisi(h.sesi), "Pengguna");
});

await kasus("di luar domain dan tidak terdaftar, atau email kosong: tidak boleh masuk", () => {
  assert.deepEqual(tentukan("orang@gmail.com"), { boleh: false, alasan: "di-luar-domain" });
  assert.deepEqual(tentukan(""), { boleh: false, alasan: "di-luar-domain" });
});

// --- Hak lihat dan ubah ----------------------------------------------------------------------

const andi: Sesi = { email: `andi@${DOMAIN}`, nama: "Andi", peran: "Pengaju", divisi: null, penggunaId: null, terdaftar: false };
const sari: Sesi = { email: `sari@${DOMAIN}`, nama: "Sari", peran: "Pengaju", divisi: "SCM", penggunaId: 2 };
const rina: Sesi = { email: `rina@${DOMAIN}`, nama: "Rina", peran: "Legal", divisi: "Legal", penggunaId: 1 };
const milikAndi = k({ id: 1, pengajuEmail: `Andi@${DOMAIN}`, pengajuNama: "Andi", divisi: "SCM" });
const milikBudiScm = k({ id: 2, divisi: "SCM" });

console.log("lib/alur (sesi tanpa divisi)");

await kasus("tanpa divisi: hanya melihat pengajuan sendiri, tidak melihat kontrak divisi mana pun", () => {
  assert.equal(L.bisaLihat(milikAndi, andi), true);
  assert.equal(L.bisaLihat(milikBudiScm, andi), false);
  assert.equal(L.bisaLihat(k({ id: 3, divisi: "Pengadaan" }), andi), false);
  // Pengaju terdaftar tetap melihat kontrak divisinya.
  assert.equal(L.bisaLihat(milikBudiScm, sari), true);
  assert.equal(L.bisaLihat(milikBudiScm, rina), true);
});

await kasus("tanpa divisi: hanya pengaju untuk kontrak buatannya (ubah, aksi, unggah)", () => {
  assert.equal(L.adalahPengajuKontrak(milikAndi, andi), true);
  assert.equal(L.adalahPengajuKontrak(milikBudiScm, andi), false);
  assert.equal(L.bisaUbah(milikAndi, andi), true);
  assert.equal(L.bisaUbah(milikBudiScm, andi), false);
  assert.deepEqual(
    L.aksiTersedia(milikAndi, andi).map((a) => a.id),
    ["batal"],
  );
  assert.deepEqual(L.aksiTersedia(milikBudiScm, andi), []);
  assert.equal(L.bisaAjukan(andi), true);
  // Pengaju terdaftar divisi SCM tetap pengaju untuk kontrak SCM rekannya.
  assert.equal(L.adalahPengajuKontrak(milikBudiScm, sari), true);
});

console.log("divisi pengajuan untuk akun tanpa divisi");

function pasangPenyimpanan(rusak = false) {
  const isi = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (kunci: string) => {
      if (rusak) throw new Error("diblokir");
      return isi.get(kunci) ?? null;
    },
    setItem: (kunci: string, nilai: string) => {
      if (rusak) throw new Error("diblokir");
      isi.set(kunci, nilai);
    },
  };
  return isi;
}

await kasus("pilihan terakhir diingat per email; nilai asing diabaikan; sesi berdivisi memakai divisinya", () => {
  const isi = pasangPenyimpanan();
  assert.equal(A.divisiAwalPengajuan(andi), "SCM");
  assert.equal(A.bacaDivisiTerakhir(andi.email), null);
  A.ingatDivisiTerakhir("ANDI@" + DOMAIN, "Pengadaan");
  assert.equal(A.bacaDivisiTerakhir(andi.email), "Pengadaan");
  assert.equal(A.divisiAwalPengajuan(andi), "Pengadaan");
  isi.set(`kontrak-divisi-terakhir:${andi.email}`, "IT");
  assert.equal(A.bacaDivisiTerakhir(andi.email), null);
  assert.equal(A.divisiAwalPengajuan(sari), "SCM");
  assert.equal(A.divisiAwalPengajuan({ ...rina, divisi: "IT" }), "SCM");
  assert.equal(A.divisiAwalPengajuan(rina), "Legal");
});

await kasus("penyimpanan diblokir: tidak melempar, kembali ke bawaan", () => {
  pasangPenyimpanan(true);
  assert.equal(A.bacaDivisiTerakhir(andi.email), null);
  assert.doesNotThrow(() => A.ingatDivisiTerakhir(andi.email, "SCM"));
  assert.equal(A.divisiAwalPengajuan(andi, "Legal"), "Legal");
});

console.log("lib/mention dan lib/serupa (pengaju tak terdaftar)");

await kasus("pengaju tak terdaftar ikut menjadi calon sebutan dengan nama dari kontrak", () => {
  const kandidat = M.kandidatSebut(milikAndi, pengguna, rina.email);
  const tamu = kandidat.find((p) => p.email === andi.email);
  assert.ok(tamu, "pengaju tak terdaftar harus bisa disebut");
  assert.equal(tamu.nama, "Andi");
  assert.equal(tamu.id, 0);
  // Tidak menyebut diri sendiri.
  assert.equal(M.kandidatSebut(milikAndi, pengguna, andi.email).some((p) => p.email === andi.email), false);
  // Disebut lewat @Andi: email dari kontrak.
  assert.deepEqual(M.ekstrakDisebut("Mohon dicek @Andi ya", kandidat), [andi.email]);
});

await kasus("pengaju terdaftar (aktif atau nonaktif) tidak digandakan sebagai tamu", () => {
  assert.equal(M.pengajuTakTerdaftar(k({ id: 4, pengajuEmail: `sari@${DOMAIN}` }), pengguna), null);
  const nonaktif = k({ id: 5, pengajuEmail: `lama@${DOMAIN}`, divisi: "Pengadaan" });
  assert.equal(M.pengajuTakTerdaftar(nonaktif, pengguna), null);
  assert.equal(M.kandidatSebut(nonaktif, pengguna, rina.email).some((p) => p.email === `lama@${DOMAIN}`), false);
});

await kasus("pengingat Legal ke pengaju tak terdaftar memakai pengajuEmail kontrak; pengaju itu bisa Tanyakan progres", () => {
  const revisi = { ...milikAndi, status: "Perlu Revisi" as const };
  const aturan = M.aturanIngatkan(revisi, rina);
  assert.ok(aturan);
  assert.deepEqual(M.penerimaIngatkan(revisi, aturan, pengguna, rina.email), [andi.email]);
  const tanya = M.aturanIngatkan(milikAndi, andi, "pengguna");
  assert.equal(tanya?.arah, "pengaju-ke-legal");
  assert.deepEqual(M.penerimaIngatkan(milikAndi, tanya!, pengguna, andi.email), [`rina@${DOMAIN}`, `ganda@${DOMAIN}`]);
});

await kasus("Ajukan serupa oleh akun tanpa divisi: divisi kontrak lama jadi pilihan awal, langkah divisi tetap ditanyakan", () => {
  const h = S.dariKontrak({ ...milikAndi, divisi: "Pengadaan" }, { semua: [milikAndi], sesi: andi, tahun: 2026 });
  assert.ok(h);
  assert.equal(h.data.divisi, "Pengadaan");
  assert.equal(h.terjawab.includes("divisi"), false);
  const hs = S.dariKontrak(milikBudiScm, { semua: [milikBudiScm], sesi: sari, tahun: 2026 });
  assert.ok(hs && hs.terjawab.includes("divisi") && hs.data.divisi === "SCM");
  // Kontrak orang lain tidak boleh disalin oleh akun tanpa divisi.
  assert.equal(S.dariKontrak(milikBudiScm, { semua: [milikBudiScm], sesi: andi }), null);
});

console.log(`\nSemua ${nomor} kasus lulus.`);
