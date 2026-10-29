// Uji palet Ctrl+K: pencocokan kontrak dengan nomor referensi PR/PO/SPK dan kode proyek (lib/cariPalet.ts, U12)
// dan grup Dokumen dari Microsoft Search (lib/cariDokumen.ts, U17).
// Jalankan: npx --yes tsx scripts/uji-palet.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { Kontrak } from "../src/lib/types";
import type { HitDokumen } from "../src/lib/cariDokumen";

// src/config.ts membaca import.meta.env milik Vite, yang tidak ada di Node. Kait ini menggantinya dengan objek kosong.
const kait = `export async function load(url, ctx, next) {
  const r = await next(url, ctx);
  if (url.includes("/src/config.ts")) return { ...r, shortCircuit: true, source: String(r.source).replaceAll("import.meta.env", "({})") };
  return r;
}`;
register("data:text/javascript;base64," + Buffer.from(kait).toString("base64"));

const P = await import("../src/lib/cariPalet");
const D = await import("../src/lib/cariDokumen");

let nomor = 0;
async function kasus(nama: string, fn: () => void | Promise<void>) {
  await fn();
  nomor++;
  console.log(`  ok ${String(nomor).padStart(2, "0")}  ${nama}`);
}

function k(p: Partial<Kontrak> & { id: number }): Kontrak {
  return {
    judul: `Kontrak ${p.id}`,
    nomorPengajuan: `KTR-2026-${String(p.id).padStart(4, "0")}`,
    nomorKontrak: "",
    jenis: "Pengadaan Barang",
    divisi: "SCM",
    mitra: "PT Maju Jaya",
    nilai: null,
    mataUang: "IDR",
    tanggalMulai: null,
    tanggalBerakhir: null,
    status: "Diajukan",
    prioritas: "Normal",
    deskripsi: "",
    targetSelesai: null,
    pengajuEmail: "budi@wki.co.id",
    pengajuNama: "Budi",
    picLegalEmail: "",
    picLegalNama: "",
    tanggalDiajukan: null,
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

console.log("lib/cariPalet");

const sewa = k({ id: 1, judul: "Sewa Crane Proyek Tol", nomorReferensi: "PR-0091, PO-4500/123; SPK 77", kodeProyek: "TOL-KAYU-AGUNG", mitra: "PT Angkat Berat" });
const beton = k({ id: 2, judul: "Pengadaan Beton", nomorReferensi: "PO-4500123", kodeProyek: "JLN-01" });
const nda = k({ id: 12, judul: "NDA Konsultan", nomorKontrak: "001/LGL/X/2026", mitra: "CV Sinar" });

await kasus("pecahReferensi: koma, titik koma, dan baris baru", () => {
  assert.deepEqual(P.pecahReferensi("PR-0091, PO-4500/123; SPK 77\nBA-1"), ["PR-0091", "PO-4500/123", "SPK 77", "BA-1"]);
  assert.deepEqual(P.pecahReferensi("  "), []);
});

await kasus("nomor PO/SPK ditemukan walau pemisahnya berbeda; nilai yang cocok yang ditampilkan", () => {
  assert.deepEqual(P.cocokKontrakPalet(sewa, "PO-4500/123"), { lewat: "referensi", nilai: "PO-4500/123", skor: 0 });
  assert.deepEqual(P.cocokKontrakPalet(sewa, "po4500123"), { lewat: "referensi", nilai: "PO-4500/123", skor: 0 });
  assert.equal(P.cocokKontrakPalet(sewa, "spk 77")?.nilai, "SPK 77");
  assert.equal(P.cocokKontrakPalet(sewa, "spk77")?.lewat, "referensi");
  assert.equal(P.keteranganCocok(P.cocokKontrakPalet(sewa, "PR-0091")!), "Ref. PR-0091");
});

await kasus("kode proyek, nomor kontrak, judul, dan mitra", () => {
  assert.equal(P.cocokKontrakPalet(sewa, "kayu agung")?.lewat, "proyek");
  assert.equal(P.keteranganCocok(P.cocokKontrakPalet(sewa, "tol-kayu")!), "Proyek TOL-KAYU-AGUNG");
  assert.equal(P.cocokKontrakPalet(nda, "001/lgl")?.lewat, "nomor");
  assert.equal(P.cocokKontrakPalet(nda, "KTR-2026-0012")?.lewat, "nomor");
  assert.equal(P.cocokKontrakPalet(beton, "beton")?.lewat, "judul");
  assert.equal(P.cocokKontrakPalet(sewa, "angkat")?.lewat, "mitra");
  assert.equal(P.keteranganCocok(P.cocokKontrakPalet(beton, "beton")!), null);
  assert.equal(P.cocokKontrakPalet(beton, "tidak ada"), null);
  // Kata pendek tidak dicocokkan dalam bentuk rapat (menghindari temuan acak).
  assert.equal(P.cocokKontrakPalet(beton, "o4"), null);
});

await kasus("urutan: yang sama persis lebih dulu, lalu urutan asal; kata kosong = daftar terbaru", () => {
  const hasil = P.cariKontrakPalet([sewa, beton, nda], "po4500123", 8);
  assert.deepEqual(hasil.map((h) => h.k.id), [1, 2]);
  // Sama persis (setelah dirapatkan) lebih dulu daripada "memuat", walau kontraknya lebih lama.
  const persis = k({ id: 3, judul: "Kontrak lama", nomorReferensi: "4500123" });
  const urut = P.cariKontrakPalet([sewa, beton, persis], "4500123", 8);
  assert.deepEqual(urut.map((h) => [h.k.id, h.cocok.skor]), [[3, 0], [1, 2], [2, 2]]);
  assert.deepEqual(P.cariKontrakPalet([sewa, beton, nda], "", 2).map((h) => h.k.id), [1, 2]);
});

console.log("lib/cariDokumen");

const LIB = "https://waskitainfra.sharepoint.com/sites/KontrakWKI/BerkasKontrak";

await kasus("kueri KQL: minimal 3 huruf, operator dan tanda kutip dinetralkan, kata terakhir berawalan *, dibatasi path library", () => {
  assert.equal(D.kueriDokumen("ab", LIB), null);
  assert.equal(D.kueriDokumen("  a b ", LIB), null);
  assert.equal(D.kueriDokumen("draft kon", LIB), `draft kon* path:"${LIB}"`);
  assert.equal(D.kueriDokumen('Klausul "denda" OR path:http', LIB), `klausul denda or path http* path:"${LIB}"`);
  assert.equal(D.kueriDokumen("-rahasia (NOT) final", `${LIB}/`), `rahasia not final* path:"${LIB}"`);
  assert.equal(D.kueriDokumen("ba ab", LIB), `ba ab path:"${LIB}"`);
});

await kasus("uraiSorotan: <c0> disorot, <ddd/> jadi elipsis, entitas diurai, tag lain dibuang (tanpa HTML)", () => {
  assert.deepEqual(D.uraiSorotan("Pasal 5 <c0>denda</c0> keterlambatan<ddd/>sebesar <c0>1</c0>‰"), [
    { teks: "Pasal 5 ", sorot: false },
    { teks: "denda", sorot: true },
    { teks: " keterlambatan … sebesar ", sorot: false },
    { teks: "1", sorot: true },
    { teks: "‰", sorot: false },
  ]);
  assert.deepEqual(D.uraiSorotan("PT A &amp; B &lt;img src=x onerror=alert(1)&gt; <b>tebal</b>"), [{ teks: "PT A & B <img src=x onerror=alert(1)> tebal", sorot: false }]);
  assert.deepEqual(D.uraiSorotan("<img src=x onerror=alert(1)><c0>aman</c0>"), [{ teks: "aman", sorot: true }]);
  assert.deepEqual(D.uraiSorotan(""), []);
  assert.equal(D.uraiEntitas("&#39;a&#x27; &unknown;"), "'a' &unknown;");
});

await kasus("folderDariWebUrl: folder pertama di bawah library; luar library, akar, atau alamat rusak = null", () => {
  assert.equal(D.folderDariWebUrl(`${LIB}/KTR-2026-0001/Draft%20Kontrak.docx`, LIB), "KTR-2026-0001");
  assert.equal(D.folderDariWebUrl(`${LIB}/KTR-2026-0001/Sub/Lampiran.pdf`, LIB), "KTR-2026-0001");
  assert.equal(D.folderDariWebUrl(`https://WASKITAINFRA.sharepoint.com/sites/kontrakwki/berkaskontrak/KTR-2026-0002/a.pdf`, LIB), "KTR-2026-0002");
  assert.equal(D.folderDariWebUrl(`${LIB}/a.pdf`, LIB), null);
  assert.equal(D.folderDariWebUrl("https://waskitainfra.sharepoint.com/sites/Lain/Dokumen/KTR-2026-0001/a.pdf", LIB), null);
  assert.equal(D.folderDariWebUrl("https://evil.example.com/sites/KontrakWKI/BerkasKontrak/KTR-2026-0001/a.pdf", LIB), null);
  assert.equal(D.folderDariWebUrl(`${LIB}/%E0%A4%A/a.pdf`, LIB), null);
  assert.equal(D.folderDariWebUrl("bukan url", LIB), null);
});

await kasus("petakanDokumen: hanya yang terpetakan dan boleh dilihat, tanpa duplikat, nama berkas diutamakan, dibatasi", () => {
  const kontrak = [k({ id: 1, nomorPengajuan: "KTR-2026-0001" }), k({ id: 2, nomorPengajuan: "KTR-2026-0002", pengajuEmail: "lain@wki.co.id" })];
  const hit = (id: string, folder: string, nama: string, ringkasan = ""): HitDokumen => ({ id, nama, webUrl: `${LIB}/${folder}/${encodeURIComponent(nama)}`, ringkasan, diubah: null });
  const hits = [
    hit("a", "KTR-2026-0001", "Lampiran.pdf", "berisi <c0>denda</c0>"),
    hit("b", "KTR-2026-0002", "Denda.docx"),
    hit("c", "_Templat", "Denda templat.docx"),
    hit("d", "KTR-2026-0001", "Ketentuan Denda.docx"),
    hit("a2", "KTR-2026-0001", "Lampiran.pdf"),
    hit("e", "KTR-2026-9999", "Denda lama.docx"),
  ];
  const boleh = (x: Kontrak) => x.pengajuEmail === "budi@wki.co.id";
  const hasil = D.petakanDokumen(hits, kontrak, { urlLibrary: LIB, boleh, teks: "denda" });
  assert.deepEqual(hasil.map((h) => h.id), ["d", "a"]);
  assert.equal(hasil[0]!.cocokNama, true);
  assert.equal(hasil[1]!.kontrak.id, 1);
  assert.deepEqual(hasil[1]!.sorotan, [{ teks: "berisi ", sorot: false }, { teks: "denda", sorot: true }]);
  assert.equal(D.petakanDokumen(hits, kontrak, { urlLibrary: LIB, boleh: () => true, teks: "denda", maks: 1 }).length, 1);
});

await kasus("petakanDokumen: salinan Lembar Review Legal disembunyikan dari pengaju (tanpaLembar), tetap ada untuk Legal", () => {
  const kontrak = [k({ id: 1, nomorPengajuan: "KTR-2026-0001" })];
  const hits: HitDokumen[] = [
    { id: "l", nama: "Lembar Review Legal P1 KTR-2026-0001 - Judul.docx", webUrl: `${LIB}/KTR-2026-0001/${encodeURIComponent("Lembar Review Legal P1 KTR-2026-0001 - Judul.docx")}`, ringkasan: "risiko tinggi", diubah: null },
    { id: "d", nama: "Draft Kontrak.docx", webUrl: `${LIB}/KTR-2026-0001/${encodeURIComponent("Draft Kontrak.docx")}`, ringkasan: "", diubah: null },
  ];
  const o = { urlLibrary: LIB, boleh: () => true, teks: "kontrak" };
  assert.deepEqual(D.petakanDokumen(hits, kontrak, { ...o, tanpaLembar: true }).map((h) => h.id), ["d"]);
  assert.deepEqual(D.petakanDokumen(hits, kontrak, o).map((h) => h.id).sort(), ["d", "l"]);
});

console.log(`\nSemua ${nomor} kasus lulus.`);
