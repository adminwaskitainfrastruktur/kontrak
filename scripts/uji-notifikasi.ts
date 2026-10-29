// Uji fondasi notifikasi (U23a): aturan penerima email (lib/penerimaNotifikasi), coba ulang penulisan pelengkap
// (lib/cobaUlang), ringkasan antrean untuk kolom Aktivitas (lib/antrean), dan ringkasan dokumen di email Legal.
// Jalankan: npx --yes tsx scripts/uji-notifikasi.ts
import assert from "node:assert/strict";
import { register } from "node:module";

// src/config.ts membaca import.meta.env milik Vite, yang tidak ada di Node. Kait ini menggantinya dengan objek kosong.
const kait = `export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const N = await import("../src/lib/penerimaNotifikasi");
const C = await import("../src/lib/cobaUlang");
const A = await import("../src/lib/antrean");
const E = await import("../src/lib/email");
const Al = await import("../src/lib/alur");
const Ek = await import("../src/lib/emailKit");
type Kontrak = import("../src/lib/types").Kontrak;
type KonteksNotif = import("../src/lib/penerimaNotifikasi").KonteksNotif;
type KejadianNotif = import("../src/lib/penerimaNotifikasi").KejadianNotif;

let nomor = 0;
async function kasus(nama: string, fn: () => void | Promise<void>) {
  await fn();
  nomor++;
  console.log(`  ok ${String(nomor).padStart(2, "0")}  ${nama}`);
}

const D = "waskitainfrastruktur.co.id";
const em = (nama: string) => `${nama}@${D}`;

// Tim: dua Legal aktif, satu Admin, satu Legal nonaktif, satu Pemantau, satu Pengaju terdaftar.
const PENGGUNA = [
  { email: em("rina"), peran: "Legal" as const, aktif: true },
  { email: em("budi"), peran: "Legal" as const, aktif: true },
  { email: em("admin"), peran: "Admin" as const, aktif: true },
  { email: em("lama"), peran: "Legal" as const, aktif: false },
  { email: em("pantau"), peran: "Pemantau" as const, aktif: true },
  { email: em("sari"), peran: "Pengaju" as const, aktif: true },
];

const konteks = (o: Partial<KonteksNotif> = {}): KonteksNotif => ({ pelakuEmail: em("sari"), pengguna: PENGGUNA, alamatGrupLegal: "", domain: D, ...o });
const kon = (o: { pengaju?: string; pic?: string } = {}) => ({ pengajuEmail: o.pengaju ?? em("sari"), picLegalEmail: o.pic ?? "" });

console.log("lib/penerimaNotifikasi: tabel aturan");

interface Baris {
  nama: string;
  kejadian: KejadianNotif;
  konteks?: Partial<KonteksNotif>;
  legal?: string[];
  pengaju?: string[];
  picBaru?: string[];
  picLama?: string[];
  takDiketahui?: boolean;
}

const TABEL: Baris[] = [
  {
    nama: "Diajukan: Legal dan Admin aktif menerima; Legal nonaktif dan Pemantau tidak; pengaju dapat tanda terima",
    kejadian: { jenis: "pengajuan-baru", k: kon() },
    legal: [em("rina"), em("budi"), em("admin")],
    pengaju: [em("sari")],
  },
  {
    nama: "Diajukan oleh Legal sendiri: pelaku tidak menerima email tim Legal, tetapi tetap dapat tanda terima",
    kejadian: { jenis: "pengajuan-baru", k: kon({ pengaju: em("rina") }) },
    konteks: { pelakuEmail: em("rina") },
    legal: [em("budi"), em("admin")],
    pengaju: [em("rina")],
  },
  {
    nama: "Diajukan oleh akun kantor tak terdaftar (akses domain otomatis): tetap menerima tanda terima",
    kejadian: { jenis: "pengajuan-baru", k: kon({ pengaju: em("tamu") }) },
    konteks: { pelakuEmail: em("tamu") },
    legal: [em("rina"), em("budi"), em("admin")],
    pengaju: [em("tamu")],
  },
  {
    nama: "Alamat grup Legal diisi: grup MENGGANTIKAN anggota (tidak ada salinan ganda)",
    kejadian: { jenis: "pengajuan-baru", k: kon() },
    konteks: { alamatGrupLegal: ` Legal@${D.toUpperCase()} ` },
    legal: [em("legal")],
    pengaju: [em("sari")],
  },
  {
    nama: "Daftar pengguna gagal dimuat dan grup kosong: tim Legal tak diketahui, tanda terima tetap terkirim",
    kejadian: { jenis: "pengajuan-baru", k: kon() },
    konteks: { pengguna: null },
    legal: [],
    pengaju: [em("sari")],
    takDiketahui: true,
  },
  {
    nama: "Perlu Revisi (aksi Legal): ke pengaju saja",
    kejadian: { jenis: "status", k: kon({ pic: em("rina") }), dari: "Review Legal", ke: "Perlu Revisi", oleh: "legal" },
    konteks: { pelakuEmail: em("rina") },
    pengaju: [em("sari")],
  },
  {
    nama: "Ditolak (aksi Legal): ke pengaju",
    kejadian: { jenis: "status", k: kon(), dari: "Diajukan", ke: "Ditolak", oleh: "legal" },
    konteks: { pelakuEmail: em("budi") },
    pengaju: [em("sari")],
  },
  {
    nama: "Legal memproses pengajuannya sendiri: pelaku tidak dikirimi aksinya sendiri",
    kejadian: { jenis: "status", k: kon({ pengaju: em("rina"), pic: em("rina") }), dari: "Diajukan", ke: "Review Legal", oleh: "legal" },
    konteks: { pelakuEmail: em("rina") },
    pengaju: [],
  },
  {
    nama: "Kirim ulang (aksi pengaju) dengan PIC: ke PIC saja, pengaju-pelaku tidak",
    kejadian: { jenis: "status", k: kon({ pic: em("budi") }), dari: "Perlu Revisi", ke: "Review Legal", oleh: "pengaju" },
    legal: [em("budi")],
    pengaju: [],
  },
  {
    nama: "Dibatalkan pengaju tanpa PIC: ke tim Legal aktif",
    kejadian: { jenis: "status", k: kon(), dari: "Diajukan", ke: "Dibatalkan", oleh: "pengaju" },
    legal: [em("rina"), em("budi"), em("admin")],
    pengaju: [],
  },
  {
    nama: "Admin membatalkan atas nama pengaju: PIC dan pengaju sama-sama diberi tahu, Admin tidak",
    kejadian: { jenis: "status", k: kon({ pic: em("budi") }), dari: "Perlu Revisi", ke: "Dibatalkan", oleh: "pengaju" },
    konteks: { pelakuEmail: em("admin") },
    legal: [em("budi")],
    pengaju: [em("sari")],
  },
  {
    nama: "Pengaju yang kini dinonaktifkan tidak menerima email status",
    kejadian: { jenis: "status", k: kon({ pengaju: em("lama") }), dari: "Review Legal", ke: "Perlu Revisi", oleh: "legal" },
    konteks: { pelakuEmail: em("rina") },
    pengaju: [],
  },
  {
    nama: "Pemantau tidak pernah menerima, walau tercatat sebagai PIC",
    kejadian: { jenis: "status", k: kon({ pic: em("pantau") }), dari: "Perlu Revisi", ke: "Review Legal", oleh: "pengaju" },
    legal: [],
    pengaju: [],
  },
  {
    nama: "Alamat di luar domain kantor dibuang",
    kejadian: { jenis: "status", k: kon({ pengaju: "orang@gmail.com" }), dari: "Review Legal", ke: "Ditolak", oleh: "legal" },
    konteks: { pelakuEmail: em("rina") },
    pengaju: [],
  },
  {
    nama: "Penugasan baru (belum ada PIC): PIC baru menerima, pelaku tidak",
    kejadian: { jenis: "penugasan", k: kon(), picLama: null, picBaru: { email: em("budi"), nama: "Budi" } },
    konteks: { pelakuEmail: em("rina") },
    picBaru: [em("budi")],
    picLama: [],
  },
  {
    nama: "Dialihkan: PIC lama dan PIC baru sama-sama diberi tahu",
    kejadian: { jenis: "penugasan", k: kon(), picLama: { email: em("rina"), nama: "Rina" }, picBaru: { email: em("budi"), nama: "Budi" } },
    konteks: { pelakuEmail: em("admin") },
    picBaru: [em("budi")],
    picLama: [em("rina")],
  },
  {
    nama: "PIC lama mengalihkan sendiri ke rekan: hanya PIC baru yang menerima",
    kejadian: { jenis: "penugasan", k: kon(), picLama: { email: em("rina"), nama: "Rina" }, picBaru: { email: em("budi"), nama: "Budi" } },
    konteks: { pelakuEmail: em("rina") },
    picBaru: [em("budi")],
    picLama: [],
  },
  {
    nama: "Mengambil sendiri dari rekan: PIC lama diberi tahu, pelaku (PIC baru) tidak",
    kejadian: { jenis: "penugasan", k: kon(), picLama: { email: em("budi"), nama: "Budi" }, picBaru: { email: em("rina"), nama: "Rina" } },
    konteks: { pelakuEmail: em("rina") },
    picBaru: [],
    picLama: [em("budi")],
  },
  {
    nama: "PIC lama nonaktif tidak menerima email pengalihan",
    kejadian: { jenis: "penugasan", k: kon(), picLama: { email: em("lama"), nama: "Lama" }, picBaru: { email: em("budi"), nama: "Budi" } },
    konteks: { pelakuEmail: em("admin") },
    picBaru: [em("budi")],
    picLama: [],
  },
];

for (const b of TABEL) {
  await kasus(b.nama, () => {
    const h = N.penerimaNotifikasi(b.kejadian, konteks(b.konteks));
    assert.deepEqual(h.legal, b.legal ?? [], "legal");
    assert.deepEqual(h.pengaju, b.pengaju ?? [], "pengaju");
    assert.deepEqual(h.picBaru, b.picBaru ?? [], "picBaru");
    assert.deepEqual(h.picLama, b.picLama ?? [], "picLama");
    assert.equal(h.timLegalTakDiketahui, b.takDiketahui ?? false, "timLegalTakDiketahui");
  });
}

console.log("lib/penerimaNotifikasi: pembantu");

await kasus("diDomain: domain dan subdomain kantor, bukan domain mirip; format rusak ditolak", () => {
  assert.equal(N.diDomain(` RINA@${D.toUpperCase()} `, D), true);
  assert.equal(N.diDomain(`rina@proyek.${D}`, D), true);
  assert.equal(N.diDomain(`rina@palsu${D}`, D), false);
  assert.equal(N.diDomain(`rina@${D}.contoh.com`, D), false);
  assert.equal(N.diDomain("bukan-email", D), false);
  assert.equal(N.diDomain(em("rina"), ""), false);
});

await kasus("saringPenerima: huruf kecil, unik, tanpa yang dikecualikan, tanpa kosong", () => {
  const h = N.saringPenerima([em("Rina"), ` ${em("rina")} `, "", null, em("budi"), em("pantau"), em("lama"), em("tamu")], { pengguna: PENGGUNA, domain: D }, [em("BUDI")]);
  assert.deepEqual(h, [em("rina"), em("tamu")]);
});

await kasus("alamatTimLegal: grup di luar domain ditolak; tanpa grup dan tanpa daftar = null", () => {
  assert.deepEqual(N.alamatTimLegal(konteks({ alamatGrupLegal: "legal@gmail.com" })), []);
  assert.equal(N.alamatTimLegal(konteks({ pengguna: null })), null);
  assert.deepEqual(N.alamatTimLegal(konteks({ pengguna: null, alamatGrupLegal: em("legal") })), [em("legal")]);
});

console.log("lib/cobaUlang: penulisan pelengkap");

await kasus("galatSementara: catatan mengulang 5xx dan luring; email hanya luring, 429, 503; sesi dan izin tidak pernah", () => {
  const g = (status: number, kode?: string) => ({ status, kode });
  for (const s of [429, 500, 502, 503, 504]) assert.equal(C.galatSementara(g(s), "catatan"), true, `catatan ${s}`);
  for (const s of [429, 503]) assert.equal(C.galatSementara(g(s), "email"), true, `email ${s}`);
  for (const s of [500, 502, 504]) assert.equal(C.galatSementara(g(s), "email"), false, `email ${s}`);
  assert.equal(C.galatSementara(g(0, "jaringan"), "email"), true);
  assert.equal(C.galatSementara(g(401, "perlu_login"), "catatan"), false);
  for (const s of [400, 403, 404, 409]) assert.equal(C.galatSementara(g(s), "catatan"), false, String(s));
  assert.equal(C.galatSementara(new Error("x"), "catatan"), false);
  assert.equal(C.galatSementara(null, "catatan"), false);
});

await kasus("ulangiPenulisan: berhasil di percobaan ke-3 dengan jeda naik 0,8 lalu 1,6 detik", async () => {
  let ke = 0;
  const jeda: number[] = [];
  const h = await C.ulangiPenulisan(
    async () => {
      ke++;
      if (ke < 3) throw { status: 503 };
      return "beres";
    },
    { bolehUlang: (e) => C.galatSementara(e, "email"), tunggu: async (ms) => void jeda.push(ms) },
  );
  assert.equal(h, "beres");
  assert.equal(ke, 3);
  assert.deepEqual(jeda, [800, 1600]);
});

await kasus("ulangiPenulisan: berhenti setelah 3 percobaan dan melempar galat terakhir", async () => {
  let ke = 0;
  await assert.rejects(
    C.ulangiPenulisan(
      async () => {
        ke++;
        throw { status: 503, ke };
      },
      { bolehUlang: () => true, tunggu: async () => undefined },
    ),
    (e: { ke: number }) => e.ke === 3,
  );
  assert.equal(ke, C.KALI_COBA_PENULISAN);
});

await kasus("ulangiPenulisan: galat yang tidak boleh diulang langsung dilempar", async () => {
  let ke = 0;
  await assert.rejects(
    C.ulangiPenulisan(
      async () => {
        ke++;
        throw { status: 403 };
      },
      { bolehUlang: (e) => C.galatSementara(e, "catatan"), tunggu: async () => undefined },
    ),
  );
  assert.equal(ke, 1);
});

console.log("lib/antrean dan lib/email: ringkasan untuk Aktivitas dan email Legal");

const kontrak = (id: number, o: Partial<Kontrak> = {}): Kontrak =>
  ({ id, status: "Diajukan", prioritas: "Normal", tanggalDiajukan: `2026-10-0${id}T02:00:00Z`, dibuat: `2026-10-0${id}T02:00:00Z`, ...o }) as Kontrak;

await kasus("teksRingkasAntrean: urutan prioritas lalu waktu; di luar antrean = kosong", () => {
  const semua = [kontrak(1), kontrak(2), kontrak(3, { prioritas: "Mendesak" }), kontrak(4, { status: "Review Legal" })];
  const antrean = A.antreanLegal(semua);
  assert.equal(A.teksRingkasAntrean(semua[2]!, antrean), "Antrean ke-1 dari 3 di Legal");
  assert.equal(A.teksRingkasAntrean(semua[1]!, antrean), "Antrean ke-3 dari 3 di Legal");
  assert.equal(A.teksRingkasAntrean(semua[3]!, antrean), "");
});

await kasus("teksDokumenPengajuan: jumlah, jenis berulang, dan susulan", () => {
  assert.equal(E.teksDokumenPengajuan({ jumlah: 3, jenis: ["Draft Kontrak", "Penawaran", "Penawaran"] }), "3 berkas (Draft Kontrak, Penawaran 2x)");
  assert.equal(E.teksDokumenPengajuan({ jumlah: 1, jenis: ["Draft Kontrak"], susulan: true }), "1 berkas (Draft Kontrak), sisanya menyusul");
  assert.equal(E.teksDokumenPengajuan({ jumlah: 0, susulan: true }), "Belum ada dokumen, pengaju akan menyusulkan");
  assert.equal(E.teksDokumenPengajuan({ jumlah: 0 }), "Belum ada dokumen");
  assert.equal(E.teksDokumenPengajuan(null), "-");
});

await kasus("email Legal menyebut dokumen terlampir (dan tetap aman dari HTML)", () => {
  const k = {
    ...kontrak(5),
    judul: "Sewa <alat> berat",
    nomorPengajuan: "KTR-2026-0005",
    pengajuNama: "Sari",
    pengajuEmail: em("sari"),
    divisi: "SCM",
    jenis: "Sewa",
    mitra: "PT A",
    nilai: 1_000_000,
    mataUang: "IDR",
    targetSelesai: null,
    deskripsi: "",
  } as Kontrak;
  const m = E.emailPengajuanBaruLegal(k, [k], { jumlah: 2, jenis: ["Draft Kontrak", "Penawaran"] });
  assert.match(m.html, /2 berkas \(Draft Kontrak, Penawaran\)/);
  assert.ok(!m.html.includes("<alat>"));
  const tanpa = E.emailPengajuanBaruLegal(k, [k]);
  assert.ok(!tanpa.html.includes("berkas ("));
});

await kasus("email pengalihan untuk PIC lama menyebut PIC baru dan alasannya", () => {
  const k = { ...kontrak(6), judul: "Jasa", nomorPengajuan: "KTR-2026-0006", status: "Review Legal", mitra: "PT B", jenis: "Pengadaan Jasa" } as Kontrak;
  const m = E.emailDialihkan(k, "Admin", "Budi", "Rina cuti");
  assert.match(m.subjek, /Dialihkan ke Budi/);
  assert.match(m.html, /Rina cuti/);
  const t = E.emailDitugaskan(k, "Admin", "Rina cuti", "Rina");
  assert.match(t.html, /mengalihkan kontrak ini dari Rina/);
});

console.log("U23c: tautan Ambil sebagai PIC");

await kasus("cekAmbilPic: hanya Legal/Admin di Ruang Admin, kontrak belum final dan belum ber-PIC", () => {
  const sesi = (peran: "Admin" | "Legal" | "Pengaju" | "Pemantau", email = em("rina")) => ({ email, nama: "Rina", peran, divisi: null, penggunaId: 1 });
  const k = (o: Partial<Kontrak> = {}) => ({ status: "Diajukan" as Kontrak["status"], picLegalEmail: "", picLegalNama: "", nomorPengajuan: "KTR-2026-0009", ...o });
  assert.deepEqual(Al.cekAmbilPic(k(), sesi("Legal"), true), { boleh: true });
  assert.deepEqual(Al.cekAmbilPic(k({ status: "Review Legal" }), sesi("Admin"), true), { boleh: true });
  const tolak = (h: ReturnType<typeof Al.cekAmbilPic>) => (h.boleh ? "" : h.pesan);
  assert.match(tolak(Al.cekAmbilPic(k(), sesi("Pengaju"), true)), /hanya untuk Legal dan Admin/);
  assert.match(tolak(Al.cekAmbilPic(k(), sesi("Pemantau"), true)), /hanya untuk Legal dan Admin/);
  assert.match(tolak(Al.cekAmbilPic(k(), sesi("Legal"), false)), /Ruang Admin/);
  assert.match(tolak(Al.cekAmbilPic(k({ status: "Ditolak" }), sesi("Legal"), true)), /sudah berstatus Ditolak/);
  assert.match(tolak(Al.cekAmbilPic(k({ picLegalEmail: em("budi"), picLegalNama: "Budi" }), sesi("Legal"), true)), /sudah dipegang Budi/);
  assert.match(tolak(Al.cekAmbilPic(k({ picLegalEmail: ` ${em("RINA")} ` }), sesi("Legal"), true)), /Anda sudah menjadi PIC/);
});

await kasus("tautan Ambil PIC di email Legal mengarah ke Ruang Admin dengan ?aksi=ambil-pic", () => {
  assert.match(Ek.urlAmbilPic(12), /\/#\/kontrak\/12\?aksi=ambil-pic$/);
});

console.log(`\nSemua ${nomor} kasus lulus.`);
