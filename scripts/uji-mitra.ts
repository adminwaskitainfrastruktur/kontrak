// Uji lib/mitra.ts dan lib/duplikat.ts. Jalankan: npx --yes tsx scripts/uji-mitra.ts
import assert from "node:assert/strict";
import { cariPengajuanGanda, judulMenyebutPerubahan, kemiripanJudul } from "../src/lib/duplikat";
import {
  cariMitraPersis,
  cariMitraSerupa,
  formatNpwp,
  kemiripanNama,
  kontrakDenganMitra,
  kunciMitra,
  opsiDatalist,
  petaKontrakPerMitra,
  ringkasMitra,
  teksKomparisi,
  usulanIdentitas,
  usulanImporMitra,
  validasiNpwp,
  type PihakKontrak,
} from "../src/lib/mitra";
import type { Kontrak, Mitra, Sesi } from "../src/lib/types";

let nomor = 0;
const kasus = (nama: string, fn: () => void) => {
  fn();
  nomor++;
  console.log(`ok ${nomor} - ${nama}`);
};

let seq = 100;
function kontrak(sebagian: Partial<Kontrak>): Kontrak {
  seq++;
  return {
    id: seq,
    judul: "Kontrak contoh",
    nomorPengajuan: `KTR-2026-${seq}`,
    nomorKontrak: "",
    jenis: "Pengadaan Jasa",
    divisi: "SCM",
    mitra: "PT Contoh",
    nilai: null,
    mataUang: "IDR",
    tanggalMulai: null,
    tanggalBerakhir: null,
    status: "Diajukan",
    prioritas: "Normal",
    deskripsi: "",
    targetSelesai: null,
    pengajuEmail: "a@waskitainfrastruktur.co.id",
    pengajuNama: "A",
    picLegalEmail: "",
    picLegalNama: "",
    tanggalDiajukan: "2026-09-01T03:00:00Z",
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
    dibuat: `2026-09-${String(10 + (seq % 15)).padStart(2, "0")}T03:00:00Z`,
    diubah: "2026-09-20T03:00:00Z",
    webUrl: "",
    ...sebagian,
  };
}

function mitra(sebagian: Partial<Mitra>): Mitra {
  seq++;
  return { id: seq, nama: "PT Contoh", npwp: "", alamat: "", penandatangan: "", jabatan: "", email: "", telepon: "", namaLain: [], aktif: true, terverifikasi: false, ...sebagian };
}

const sesi = (sebagian: Partial<Sesi>): Sesi => ({ email: "x@waskitainfrastruktur.co.id", nama: "X", peran: "Legal", divisi: "Legal", penggunaId: 1, ...sebagian });
const legal = sesi({});
const pengajuScm = sesi({ peran: "Pengaju", divisi: "SCM", email: "scm@waskitainfrastruktur.co.id" });

// --- kunciMitra ---------------------------------------------------------------------------
kasus("kunciMitra: tanda baca dan huruf besar dinormalkan", () => {
  assert.equal(kunciMitra("PT. ABC"), kunciMitra("PT ABC"));
  assert.equal(kunciMitra("  PT   ABC,  "), "pt abc");
  assert.equal(kunciMitra("P.T. Abc Sejahtera"), "pt abc sejahtera");
  assert.equal(kunciMitra("Perseroan Terbatas Abc"), "pt abc");
});

kasus("kunciMitra: PT, CV, UD, Tbk tetap dibedakan", () => {
  assert.notEqual(kunciMitra("PT ABC"), kunciMitra("CV ABC"));
  assert.notEqual(kunciMitra("PT ABC"), kunciMitra("UD ABC"));
  assert.notEqual(kunciMitra("PT ABC"), kunciMitra("PT ABC Tbk"));
  assert.notEqual(kunciMitra("PT ABC"), kunciMitra("ABC"));
});

kasus("kunciMitra: ampersand, aksen, dan string kosong", () => {
  assert.equal(kunciMitra("PT Karya & Putra"), kunciMitra("PT Karya dan Putra"));
  assert.equal(kunciMitra("PT Café"), "pt cafe");
  assert.equal(kunciMitra(""), "");
  assert.equal(kunciMitra("...,,"), "");
});

// --- kemiripanNama ---------------------------------------------------------------------------
kasus("kemiripanNama: sama = 1, beda total = 0, kosong = 0", () => {
  assert.equal(kemiripanNama("PT. Abc", "pt abc"), 1);
  assert.equal(kemiripanNama("PT Abc", "PT Xyz Perkasa"), 0);
  assert.equal(kemiripanNama("", "PT Abc"), 0);
});

kasus("kemiripanNama: PT vs CV dengan nama sama diturunkan di bawah ambang saran", () => {
  const s = kemiripanNama("PT Abc Sejahtera", "CV Abc Sejahtera");
  assert.ok(s < 0.75 && s > 0, `skor ${s}`);
});

kasus("kemiripanNama: salah ketik satu huruf pada kata panjang masih mirip; kata pendek tidak", () => {
  assert.ok(kemiripanNama("PT Abc Sejahtera", "PT Abc Sejahtra") >= 0.75);
  assert.ok(kemiripanNama("PT Abc Jaya", "PT Abc Jaja") < 0.75);
});

kasus("kemiripanNama: kata sama urutan terbalik tidak disarankan", () => {
  assert.ok(kemiripanNama("PT Karya Abadi", "PT Abadi Karya") < 0.75);
});

// --- cariMitraSerupa ----------------------------------------------------------------------------
const master = [
  mitra({ nama: "PT Abc Sejahtera", namaLain: ["ABC Sejahtera", "PT ASJ"] }),
  mitra({ nama: "CV Abc Sejahtera" }),
  mitra({ nama: "PT Maju Bersama", aktif: false }),
  mitra({ nama: "PT Sinar Jaya Abadi" }),
  mitra({ nama: "PT Sinar Mas Perkasa" }),
];

kasus("cariMitraSerupa: cocok persis lewat kunci menempati urutan pertama", () => {
  const r = cariMitraSerupa("pt. abc sejahtera", master, []);
  assert.equal(r[0]!.nama, "PT Abc Sejahtera");
  assert.equal(r[0]!.alasan, "persis");
  assert.equal(r[0]!.mitra?.id, master[0]!.id);
});

kasus("cariMitraSerupa: PT ABC tidak menyarankan CV ABC", () => {
  const r = cariMitraSerupa("PT Abc Sejahtera", master, []);
  assert.ok(!r.some((s) => s.nama === "CV Abc Sejahtera"));
});

kasus("cariMitraSerupa: nama lain (alias) mengenali mitra dan mencatat via", () => {
  const r = cariMitraSerupa("PT ASJ", master, []);
  assert.equal(r[0]!.nama, "PT Abc Sejahtera");
  assert.equal(r[0]!.via, "PT ASJ");
});

kasus("cariMitraSerupa: awalan ketikan, maksimal 3, mitra nonaktif tidak disarankan", () => {
  const r = cariMitraSerupa("PT Sinar", master, []);
  assert.deepEqual(r.map((s) => s.nama).sort(), ["PT Sinar Jaya Abadi", "PT Sinar Mas Perkasa"]);
  assert.ok(r.every((s) => s.alasan === "awalan"));
  assert.equal(cariMitraSerupa("PT Maju Bersama", master, []).length, 0);
  const banyak = Array.from({ length: 6 }, (_, i) => mitra({ nama: `PT Delta ${["Satu", "Dua", "Tiga", "Empat", "Lima", "Enam"][i]}` }));
  assert.equal(cariMitraSerupa("PT Delta", banyak, []).length, 3);
});

kasus("cariMitraSerupa: ketikan terlalu pendek atau hanya badan hukum tidak menyarankan apa pun", () => {
  assert.deepEqual(cariMitraSerupa("PT", master, []), []);
  assert.deepEqual(cariMitraSerupa("PT A", master, []), []);
  assert.deepEqual(cariMitraSerupa("  ", master, []), []);
});

kasus("cariMitraSerupa: nama dari kontrak ikut disarankan, master tidak digandakan", () => {
  const ks = [kontrak({ mitra: "PT Bintang Timur" }), kontrak({ mitra: "PT. Bintang Timur" }), kontrak({ mitra: "PT Abc Sejahtera" })];
  const r = cariMitraSerupa("pt bintang timur", master, ks);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.sumber, "kontrak");
  assert.equal(r[0]!.pemakaian, 2);
  const r2 = cariMitraSerupa("PT Abc Sejahtera", master, ks);
  assert.equal(r2.filter((s) => kunciMitra(s.nama) === "pt abc sejahtera").length, 1);
  assert.equal(r2[0]!.pemakaian, 1);
});

kasus("cariMitraPersis: lewat nama lain, nonaktif diabaikan", () => {
  assert.equal(cariMitraPersis("abc sejahtera", master)?.nama, "PT Abc Sejahtera");
  assert.equal(cariMitraPersis("PT Maju Bersama", master), null);
  assert.equal(cariMitraPersis("CV Tidak Ada", master), null);
});

kasus("opsiDatalist: master dulu, lalu kontrak paling sering, tanpa duplikat kunci", () => {
  const ks = [kontrak({ mitra: "PT Zeta" }), kontrak({ mitra: "PT Zeta" }), kontrak({ mitra: "PT Beta" }), kontrak({ mitra: "PT. Abc Sejahtera" })];
  const o = opsiDatalist(master, ks);
  assert.deepEqual(o.slice(0, 3), ["PT Abc Sejahtera", "CV Abc Sejahtera", "PT Sinar Jaya Abadi"]);
  assert.ok(o.indexOf("PT Zeta") < o.indexOf("PT Beta"));
  assert.ok(!o.includes("PT Maju Bersama"));
  assert.equal(o.filter((x) => kunciMitra(x) === "pt abc sejahtera").length, 1);
});

// --- Impor dan ringkasan ----------------------------------------------------------------------------
kasus("usulanImporMitra: menggabungkan penulisan berbeda dan melewati yang sudah ada di master", () => {
  const ks = [kontrak({ mitra: "PT Baru Makmur" }), kontrak({ mitra: "PT. Baru Makmur" }), kontrak({ mitra: "PT Baru Makmur" }), kontrak({ mitra: "ABC Sejahtera" }), kontrak({ mitra: "" }), kontrak({ mitra: "CV Lain" })];
  const u = usulanImporMitra(master, ks);
  assert.deepEqual(u.map((x) => x.nama), ["PT Baru Makmur", "CV Lain"]);
  assert.equal(u[0]!.jumlah, 3);
  assert.deepEqual(u[0]!.varian, ["PT Baru Makmur", "PT. Baru Makmur"]);
});

kasus("usulanImporMitra: menandai master yang mirip tetapi tidak menggabung", () => {
  const u = usulanImporMitra(master, [kontrak({ mitra: "PT Abc Sejahtra" })]);
  assert.equal(u.length, 1);
  assert.equal(u[0]!.mirip?.nama, "PT Abc Sejahtera");
});

kasus("ringkasMitra: nilai aktif per mata uang, terakhir berakhir, tanpa kontrak ditolak", () => {
  const m = mitra({ nama: "PT Ringkas" });
  const ks = [
    kontrak({ mitra: "PT Ringkas", status: "Aktif", nilai: 1000, tanggalBerakhir: "2026-12-31" }),
    kontrak({ mitra: "PT Ringkas", status: "Aktif", nilai: 500, tanggalBerakhir: "2027-03-01", berakhirEfektif: "2027-06-01" }),
    kontrak({ mitra: "PT Ringkas", status: "Aktif", nilai: 20, mataUang: "USD", tanggalBerakhir: "2026-10-10" }),
    kontrak({ mitra: "PT Ringkas", status: "Review Legal", nilai: 9999 }),
    kontrak({ mitra: "PT Ringkas", status: "Ditolak", tanggalBerakhir: "2030-01-01" }),
    kontrak({ mitra: "PT Lain", status: "Aktif", nilai: 7 }),
  ];
  const peta = petaKontrakPerMitra([m], ks);
  const r = ringkasMitra(peta.get(m.id)!);
  assert.equal(r.jumlah, 5);
  assert.equal(r.aktif, 3);
  assert.equal(r.berjalan, 1);
  assert.deepEqual(r.nilaiAktif, [
    { mataUang: "IDR", nilai: 1500 },
    { mataUang: "USD", nilai: 20 },
  ]);
  assert.equal(r.terakhirBerakhir, "2027-06-01");
  assert.deepEqual(ringkasMitra([]), { jumlah: 0, aktif: 0, berjalan: 0, nilaiAktif: [], terakhirBerakhir: null });
});

kasus("petaKontrakPerMitra: MitraId diutamakan, nama lain ikut terhitung", () => {
  const m = mitra({ nama: "PT Abc Sejahtera", namaLain: ["ABC Sejahtera"] });
  const ks = [kontrak({ mitra: "ABC Sejahtera" }), kontrak({ mitra: "nama tak dikenal", mitraId: m.id }), kontrak({ mitra: "PT Lain" })];
  assert.equal(petaKontrakPerMitra([m], ks).get(m.id)!.length, 2);
});

kasus("kontrakDenganMitra: mengecualikan diri sendiri, mengikuti nama lain di master", () => {
  const m = mitra({ nama: "PT Abc Sejahtera", namaLain: ["ABC Sejahtera"] });
  const a = kontrak({ mitra: "PT Abc Sejahtera" });
  const b = kontrak({ mitra: "ABC Sejahtera" });
  const c = kontrak({ mitra: "PT Lain" });
  const r = kontrakDenganMitra(a, [a, b, c], [m]);
  assert.deepEqual(r.map((x) => x.id), [b.id]);
  assert.deepEqual(kontrakDenganMitra(a, [a, b, c], []).map((x) => x.id), []);
});

// --- NPWP dan komparisi ---------------------------------------------------------------------------------
kasus("validasiNpwp: 15 dan 16 digit sah, selain itu tidak", () => {
  assert.equal(validasiNpwp("01.234.567.8-901.234").sah, true);
  assert.equal(validasiNpwp("0123456789012345").sah, true);
  assert.equal(validasiNpwp("").sah, true);
  assert.equal(validasiNpwp("12345").sah, false);
  assert.equal(validasiNpwp("01.234.567.8-901.23A").sah, false);
  assert.equal(validasiNpwp("000000000000000").sah, false);
  assert.equal(validasiNpwp("01234567890123456").sah, false);
});

kasus("formatNpwp: 15 digit diberi titik, 16 digit polos, tidak sah dibiarkan", () => {
  assert.equal(formatNpwp("012345678901234"), "01.234.567.8-901.234");
  assert.equal(formatNpwp("0123 4567 8901 2345"), "0123456789012345");
  assert.equal(formatNpwp(" 123 "), "123");
});

kasus("teksKomparisi: lengkap dan dengan bagian kosong ditandai", () => {
  const p: PihakKontrak = { nama: "PT Abc", npwp: "012345678901234", alamat: "Jl. Mawar No. 1, Jakarta", penandatangan: "Budi", jabatan: "Direktur Utama", dasarKewenangan: "Akta No. 5 Tahun 2020" };
  assert.equal(teksKomparisi(p), "PT Abc, beralamat di Jl. Mawar No. 1, Jakarta, NPWP 01.234.567.8-901.234, dalam hal ini diwakili oleh Budi, selaku Direktur Utama, berdasarkan Akta No. 5 Tahun 2020");
  const kurang = teksKomparisi({ ...p, alamat: "", npwp: "", dasarKewenangan: "", jabatan: "" });
  assert.ok(kurang.includes("[alamat belum diisi]") && kurang.includes("[jabatan belum diisi]"));
  assert.ok(!kurang.includes("NPWP") && !kurang.includes("berdasarkan"));
});

kasus("usulanIdentitas: dari kontrak terakhir yang terisi, lalu dari master, lalu null", () => {
  const m = mitra({ nama: "PT Abc", npwp: "012345678901234", alamat: "Alamat Master", penandatangan: "Master Orang", jabatan: "Dir" });
  const lama = kontrak({ mitra: "PT Abc", penandatanganMitra: "Budi", jabatanMitra: "Direktur", dibuat: "2026-01-01T00:00:00Z" });
  const baru = kontrak({ mitra: "PT Abc", npwpMitra: "999999999999999", alamatMitra: "Alamat Baru", penandatanganMitra: "Sari", jabatanMitra: "Komisaris", dibuat: "2026-08-01T00:00:00Z" });
  const kosong = kontrak({ mitra: "PT Abc", dibuat: "2026-09-01T00:00:00Z" });
  const u = usulanIdentitas(kosong, [lama, baru, kosong], [m])!;
  assert.equal(u.sumber, "kontrak");
  assert.equal(u.dari?.id, baru.id);
  assert.equal(u.pihak.penandatangan, "Sari");
  const hanyaLama = usulanIdentitas(kosong, [lama, kosong], [m])!;
  assert.equal(hanyaLama.pihak.npwp, "012345678901234"); // dilengkapi dari master
  assert.equal(hanyaLama.pihak.penandatangan, "Budi");
  const dariMaster = usulanIdentitas(kosong, [kosong], [m])!;
  assert.equal(dariMaster.sumber, "master");
  assert.equal(dariMaster.pihak.penandatangan, "Master Orang");
  assert.equal(usulanIdentitas(kosong, [kosong], []), null);
});

// --- Pengajuan ganda --------------------------------------------------------------------------------------
const HARI = "2026-10-02";

kasus("kemiripanJudul dan judulMenyebutPerubahan", () => {
  assert.equal(kemiripanJudul("Sewa Alat Berat Proyek Tol", "sewa alat berat proyek tol!"), 1);
  assert.ok(kemiripanJudul("Sewa Alat Berat 2025", "Sewa Alat Berat 2026") < 0.6);
  assert.equal(kemiripanJudul("", "x"), 0);
  assert.ok(judulMenyebutPerubahan("Perpanjangan sewa gudang"));
  assert.ok(judulMenyebutPerubahan("Amandemen ke-2"));
  assert.ok(!judulMenyebutPerubahan("Pengadaan besi beton"));
});

kasus("cariPengajuanGanda: mitra sama + judul mirip + masih diproses terdeteksi", () => {
  const ada = kontrak({ mitra: "PT. Abc", judul: "Pengadaan Besi Beton Proyek Tol", status: "Review Legal" });
  const r = cariPengajuanGanda({ judul: "Pengadaan besi beton proyek tol", mitra: "PT Abc" }, [ada], legal, HARI);
  assert.deepEqual(r.terlihat.map((k) => k.id), [ada.id]);
  assert.equal(r.tersembunyi, 0);
});

kasus("cariPengajuanGanda: status selesai, mitra lain, atau judul beda tidak dianggap ganda", () => {
  const ks = [
    kontrak({ mitra: "PT Abc", judul: "Pengadaan Besi Beton", status: "Aktif" }),
    kontrak({ mitra: "PT Abc", judul: "Pengadaan Besi Beton", status: "Ditolak" }),
    kontrak({ mitra: "CV Abc", judul: "Pengadaan Besi Beton", status: "Diajukan" }),
    kontrak({ mitra: "PT Abc", judul: "Sewa Kantor Pusat", status: "Diajukan" }),
  ];
  const r = cariPengajuanGanda({ judul: "Pengadaan Besi Beton", mitra: "PT Abc" }, ks, legal, HARI);
  assert.equal(r.terlihat.length + r.tersembunyi, 0);
  assert.deepEqual(cariPengajuanGanda({ judul: "Pengadaan Besi Beton", mitra: "" }, ks, legal, HARI), { terlihat: [], tersembunyi: 0, tawaran: [] });
});

kasus("cariPengajuanGanda: pengaju tidak diberi isi pengajuan divisi lain, hanya jumlahnya", () => {
  const lain = kontrak({ mitra: "PT Abc", judul: "Pengadaan Besi Beton Proyek Tol", status: "Diajukan", divisi: "Pengadaan", pengajuEmail: "lain@waskitainfrastruktur.co.id" });
  const milik = kontrak({ mitra: "PT Abc", judul: "Pengadaan Besi Beton Proyek Tol", status: "Diajukan", divisi: "SCM" });
  const r = cariPengajuanGanda({ judul: "Pengadaan Besi Beton Proyek Tol", mitra: "PT Abc" }, [lain, milik], pengajuScm, HARI);
  assert.deepEqual(r.terlihat.map((k) => k.id), [milik.id]);
  assert.equal(r.tersembunyi, 1);
  assert.ok(!JSON.stringify(r).includes(lain.nomorPengajuan));
});

kasus("cariPengajuanGanda: tawaran addendum bila judul menyebut perpanjangan dan ada kontrak Aktif", () => {
  const induk = kontrak({ mitra: "PT Abc", judul: "Sewa Gudang Cikarang", status: "Aktif", tanggalBerakhir: "2027-12-31" });
  const r = cariPengajuanGanda({ judul: "Perpanjangan sewa gudang Cikarang", mitra: "PT Abc" }, [induk], legal, HARI);
  assert.equal(r.tawaran.length, 1);
  assert.deepEqual(r.tawaran[0]!.alasan, ["judul"]);
  assert.equal(r.tawaran[0]!.induk.id, induk.id);
});

kasus("cariPengajuanGanda: tawaran karena kontrak Aktif berakhir dalam 90 hari (pakai berakhirEfektif)", () => {
  const segera = kontrak({ mitra: "PT Abc", judul: "Sewa Gudang", status: "Aktif", tanggalBerakhir: "2026-11-01", berakhirEfektif: "2026-12-15" });
  const jauh = kontrak({ mitra: "PT Abc", judul: "Sewa Kantor", status: "Aktif", tanggalBerakhir: "2026-12-30", berakhirEfektif: "2027-06-30" });
  const r = cariPengajuanGanda({ judul: "Layanan keamanan", mitra: "PT Abc" }, [segera, jauh], legal, HARI);
  assert.deepEqual(r.tawaran.map((t) => t.induk.id), [segera.id]);
  assert.deepEqual(r.tawaran[0]!.alasan, ["segera-berakhir"]);
  assert.equal(r.tawaran[0]!.sisaHari, 74);
});

kasus("cariPengajuanGanda: tanpa tawaran untuk addendum, tanpa kontrak Aktif, atau kontrak yang sudah lama lewat", () => {
  const segera = kontrak({ mitra: "PT Abc", status: "Aktif", tanggalBerakhir: "2026-11-01" });
  assert.equal(cariPengajuanGanda({ judul: "Addendum sewa", mitra: "PT Abc", jenis: "Addendum / Amandemen" }, [segera], legal, HARI).tawaran.length, 0);
  assert.equal(cariPengajuanGanda({ judul: "Addendum sewa", mitra: "PT Abc", kontrakIndukId: 5 }, [segera], legal, HARI).tawaran.length, 0);
  assert.equal(cariPengajuanGanda({ judul: "Perpanjangan sewa", mitra: "PT Abc" }, [kontrak({ mitra: "PT Abc", status: "Berakhir" })], legal, HARI).tawaran.length, 0);
  const basi = kontrak({ mitra: "PT Abc", status: "Aktif", tanggalBerakhir: "2026-01-01" });
  assert.equal(cariPengajuanGanda({ judul: "Layanan lain", mitra: "PT Abc" }, [basi], legal, HARI).tawaran.length, 0);
  const baruLewat = kontrak({ mitra: "PT Abc", status: "Aktif", tanggalBerakhir: "2026-09-20" });
  assert.equal(cariPengajuanGanda({ judul: "Layanan lain", mitra: "PT Abc" }, [baruLewat], legal, HARI).tawaran.length, 1);
});

kasus("cariPengajuanGanda: pengaju tidak ditawari addendum untuk kontrak divisi lain; addendum tidak ditawari addendum lagi", () => {
  const lain = kontrak({ mitra: "PT Abc", status: "Aktif", divisi: "Pengadaan", pengajuEmail: "lain@waskitainfrastruktur.co.id", tanggalBerakhir: "2026-11-01" });
  assert.equal(cariPengajuanGanda({ judul: "Perpanjangan", mitra: "PT Abc" }, [lain], pengajuScm, HARI).tawaran.length, 0);
  const add = kontrak({ mitra: "PT Abc", status: "Aktif", jenis: "Addendum / Amandemen", kontrakIndukId: 1, tanggalBerakhir: "2026-11-01" });
  assert.equal(cariPengajuanGanda({ judul: "Perpanjangan", mitra: "PT Abc" }, [add], legal, HARI).tawaran.length, 0);
});

console.log(`\nSemua ${nomor} kasus lulus.`);
