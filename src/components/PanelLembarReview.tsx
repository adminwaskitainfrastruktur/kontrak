// Lembar Hasil Review Legal di halaman Detail (Ruang Admin saja). Diisi Legal per putaran review.
//
// Alur: Legal membuka putaran (draf), melengkapi pokok kontrak, temuan, kepatuhan, kesimpulan, lalu memfinalkannya.
// Bagian yang sudah ada datanya terisi otomatis (lib/lembarReview susunDataOtomatis) dan dibekukan saat final.
// Setelah final: unduh .docx, cetak atau simpan PDF, simpan salinan ke Berkas Kontrak, dan catat persetujuan kepala Legal
// (opsional). Temuan bisa langsung mengisi modal Minta Revisi.
//
// Pengaju tidak pernah melihat panel ini; ia hanya membaca kesimpulan dan catatan untuknya (KartuHasilReview).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BadgeCheck, Check, ClipboardCheck, Download, FilePlus2, Lock, Printer, RotateCcw, Save, Stamp, Trash2, Upload } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { formatTanggal, formatWaktu, hariIni } from "../lib/format";
import { pesanError } from "../lib/graph";
import { kirimUlangSetelah } from "../lib/revisi";
import {
  BATAS_TEKS,
  bukaKembaliPutaran,
  catatPersetujuanLembar,
  cekFinalisasi,
  finalkanPutaran,
  hapusPersetujuanLembar,
  peringatanLembarSebelumTtd,
  poinRevisiDariTemuan,
  putaranBaru,
  putaranTerakhir,
  ringkasTemuan,
  risikoKeseluruhan,
  salinanUsang,
  susunDataOtomatis,
  type DataOtomatis,
  type LembarReview,
  type PersetujuanLembar,
  type PutaranReview,
} from "../lib/lembarReview";
import { susunDokumenLembar } from "../lib/lembarDokumen";
import { defKesimpulan } from "../lib/lembarStandar";
import { umpanBalik } from "../lib/umpanBalik";
import type { Aktivitas, Dokumen, Kontrak } from "../lib/types";
import {
  GalatKonflikLembar,
  bacaVersiDraft,
  catatRiwayatLembar,
  pindaiDrafUntukLembar,
  rakitLembarDocx,
  simpanLembar,
  simpanSalinanLembar,
  type BacaanLembar,
} from "../services/lembarReview";
import DokumenLembar, { TampilanCetakLembar } from "./DokumenLembar";
import LembarEditor, { ChipRisiko } from "./LembarEditor";
import { TandaStandarAwal } from "./PanelSyarat";
import { AksiModal, Field, Isian, Kerangka, KotakError, Lencana, Modal, Tombol, cx } from "./ui";

/** Bentuk minimal hasil useMuat(bacaLembar) yang dipakai panel. */
export interface MuatLembar {
  data: BacaanLembar | null;
  loading: boolean;
  error: unknown;
  muatUlang: () => Promise<void>;
  setData: (d: BacaanLembar | null) => void;
}

export interface PropsPanelLembar {
  k: Kontrak;
  induk: Kontrak | null;
  /** Dokumen kontrak tanpa salinan lembar. null selama masih dimuat. */
  dokumen: Dokumen[] | null;
  aktivitas: Aktivitas[] | null;
  q: MuatLembar;
  /** Legal/Admin saat status Review Legal. */
  bolehUbah: boolean;
  /** Legal/Admin saat Review Legal atau Proses Tanda Tangan: mencatat persetujuan kepala Legal dan menyimpan salinan. */
  bolehPersetujuan: boolean;
  onMintaRevisi: (teks: string) => void;
  /** Dokumen atau riwayat berubah (salinan diunggah, lembar difinalkan): muat ulang. */
  onBerubah: () => void;
}

// --- Salinan lokal draf (cadangan bila tab tertutup sebelum disimpan) ---------------------------------

const kunciLokal = (kontrakId: number, putaranId: string) => `kontrak-wki:lembar-review:${kontrakId}:${putaranId}`;

function bacaLokal(kunci: string): { rev: number; putaran: PutaranReview } | null {
  try {
    const t = localStorage.getItem(kunci);
    if (!t) return null;
    const j = JSON.parse(t) as { rev?: unknown; putaran?: unknown };
    return typeof j.rev === "number" && j.putaran && typeof j.putaran === "object" ? { rev: j.rev, putaran: j.putaran as PutaranReview } : null;
  } catch {
    return null;
  }
}
function simpanLokal(kunci: string, rev: number, putaran: PutaranReview) {
  try {
    localStorage.setItem(kunci, JSON.stringify({ rev, putaran }));
  } catch {
    /* penyimpanan penuh atau diblokir: cadangan lokal dilewati */
  }
}
function hapusLokal(kunci: string) {
  try {
    localStorage.removeItem(kunci);
  } catch {
    /* diabaikan */
  }
}

function unduhBlob(blob: Blob, nama: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

type Sibuk = "" | "mulai" | "simpan" | "final" | "buka" | "setuju" | "salinan" | "docx";

export default function PanelLembarReview({ k, induk, dokumen, aktivitas, q, bolehUbah, bolehPersetujuan, onMintaRevisi, onBerubah }: PropsPanelLembar) {
  const { sesi } = useSesi();
  const lembar: LembarReview | null = q.data?.lembar ?? null;
  const kolomAda = q.data?.kolomAda !== false;
  const terakhir = putaranTerakhir(lembar);

  const [nomorPilih, setNomorPilih] = useState<number | null>(null);
  const terpilih = lembar?.putaran.find((p) => p.nomor === nomorPilih) ?? terakhir;
  const suntingan = bolehUbah && !!terpilih && terpilih.status === "draf" && terpilih.id === terakhir?.id;

  const [draf, setDraf] = useState<PutaranReview | null>(null);
  const [basisRev, setBasisRev] = useState<number | null>(null);
  const [kotor, setKotor] = useState(false);
  const [sibuk, setSibuk] = useState<Sibuk>("");
  const [persen, setPersen] = useState<number | null>(null);
  const [galat, setGalat] = useState("");
  const [konflik, setKonflik] = useState<GalatKonflikLembar | null>(null);
  const [versi, setVersi] = useState<Record<string, string>>({});
  const [pindaiSibuk, setPindaiSibuk] = useState(false);
  const [pindaiGalat, setPindaiGalat] = useState("");
  const [dialog, setDialog] = useState<"final" | "buka" | "setuju" | null>(null);
  const [cetak, setCetak] = useState(false);

  // Samakan salinan suntingan dengan data server, kecuali ada suntingan yang belum disimpan pada putaran yang sama.
  const idTerpilih = terpilih?.id ?? null;
  const revTerpilih = terpilih?.rev ?? -1;
  const kotorRef = useRef(false);
  const drafRef = useRef<PutaranReview | null>(null);
  kotorRef.current = kotor;
  drafRef.current = draf;
  useEffect(() => {
    if (!suntingan || !terpilih) {
      setDraf(null);
      setKotor(false);
      return;
    }
    // Suntingan yang belum disimpan dipertahankan; basisRev sengaja tidak diperbarui supaya perubahan rekan tertangkap sebagai konflik.
    if (kotorRef.current && drafRef.current?.id === terpilih.id) return;
    setBasisRev(terpilih.rev);
    const lokal = bacaLokal(kunciLokal(k.id, terpilih.id));
    if (lokal && lokal.rev === terpilih.rev && JSON.stringify(lokal.putaran) !== JSON.stringify(terpilih)) {
      setDraf(lokal.putaran);
      setKotor(true);
      umpanBalik.info("Draf lembar yang belum tersimpan dipulihkan.", { teks: "Ini isian terakhir Anda di perangkat ini. Tekan Simpan draf untuk menyimpannya.", id: `lembar-pulih-${k.id}` });
      return;
    }
    setDraf(salin(terpilih));
    setKotor(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suntingan, idTerpilih, revTerpilih, k.id]);

  const ubah = useCallback((fn: (p: PutaranReview) => PutaranReview) => {
    setDraf((d) => (d ? fn(d) : d));
    setKotor(true);
  }, []);

  // Cadangan lokal selama ada suntingan yang belum disimpan.
  useEffect(() => {
    if (!kotor || !draf || basisRev == null) return;
    const t = setTimeout(() => simpanLokal(kunciLokal(k.id, draf.id), basisRev, draf), 700);
    return () => clearTimeout(t);
  }, [kotor, draf, basisRev, k.id]);

  // Peringatan bila halaman ditutup padahal ada suntingan yang belum disimpan.
  useEffect(() => {
    if (!kotor) return;
    const jaga = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", jaga);
    return () => window.removeEventListener("beforeunload", jaga);
  }, [kotor]);

  // Versi draft terbaru dibaca sekali per perubahan daftar dokumen, hanya untuk Legal yang bisa menyunting atau memfinalkan.
  const kunciDokumen = (dokumen ?? []).map((d) => `${d.id}:${d.diubah}`).join("|");
  useEffect(() => {
    if (!dokumen || !(bolehUbah || bolehPersetujuan)) return;
    let batal = false;
    void bacaVersiDraft(dokumen).then((v) => !batal && setVersi(v));
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunciDokumen, bolehUbah, bolehPersetujuan]);

  const aktif = draf ?? terpilih;
  const pindaiAktif = aktif?.pindai ?? null;
  // Data otomatis tidak dihitung ulang tiap ketikan: yang berubah hanya sumbernya (kontrak, dokumen, riwayat) atau hasil pindai.
  const dataLive: DataOtomatis = useMemo(
    () => susunDataOtomatis({ kontrak: k, dokumen: dokumen ?? [], aktivitas: aktivitas ?? [], induk, versi, pindai: pindaiAktif, sekarang: new Date().toISOString() }),
    [k, dokumen, aktivitas, induk, versi, pindaiAktif],
  );
  const dataTampil: DataOtomatis = terpilih?.status === "final" && terpilih.final ? terpilih.final.data : dataLive;
  // Isi dokumen hanya disusun saat dibutuhkan (tampilan cetak atau ringkasan), bukan sambil mengetik di formulir.
  const perluBlok = cetak || !(suntingan && !!draf);
  const blok = useMemo(() => (aktif && perluBlok ? susunDokumenLembar(aktif, aktif.status === "final" && aktif.final ? aktif.final.data : dataLive) : []), [aktif, dataLive, perluBlok]);

  // --- Tindakan -----------------------------------------------------------------------------------------

  const terapkanHasil = (l: LembarReview, nomor?: number) => {
    q.setData({ lembar: l, kolomAda: true });
    if (nomor != null) setNomorPilih(nomor);
  };

  /** Bungkus tindakan yang menyimpan: menjaga status sibuk, memetakan konflik dan galat jadi pesan yang ramah. */
  const jalankan = async (jenis: Sibuk, fn: () => Promise<void>) => {
    setGalat("");
    setKonflik(null);
    setSibuk(jenis);
    try {
      await fn();
    } catch (err) {
      if (err instanceof GalatKonflikLembar) {
        setKonflik(err);
        setGalat(err.message);
      } else {
        setGalat(pesanError(err));
        umpanBalik.gagal(err, "Lembar belum tersimpan");
      }
    } finally {
      setSibuk("");
      setPersen(null);
    }
  };

  const mulai = () =>
    jalankan("mulai", async () => {
      const p = putaranBaru(k, lembar, { nama: sesi.nama, email: sesi.email }, new Date().toISOString(), hariIni());
      const h = await simpanLembar(k.id, p, null);
      terapkanHasil(h.lembar, p.nomor);
      umpanBalik.berhasil(`Lembar putaran ${p.nomor} dibuka.`, { teks: p.nomor > 1 ? "Temuan yang belum diterima dan isian lama dibawa dari putaran sebelumnya." : "Pokok kontrak sudah diisi awal dari data pengajuan." });
    });

  const simpanDraf = () =>
    jalankan("simpan", async () => {
      if (!draf) return;
      const h = await simpanLembar(k.id, draf, basisRev);
      terapkanHasil(h.lembar);
      hapusLokal(kunciLokal(k.id, draf.id));
      setDraf(salin(h.putaran));
      setBasisRev(h.putaran.rev);
      setKotor(false);
      umpanBalik.berhasil("Draf lembar tersimpan.");
      if (h.dipadatkan.length) umpanBalik.info(`Putaran ${h.dipadatkan.join(", ")} dipadatkan agar muat.`, { teks: "Ringkasan temuannya tetap ada. Isi lengkapnya ada di salinan .docx bila pernah disimpan." });
    });

  const timpa = () =>
    jalankan("simpan", async () => {
      if (!draf) return;
      const h = await simpanLembar(k.id, draf, null, { paksa: true });
      terapkanHasil(h.lembar);
      hapusLokal(kunciLokal(k.id, draf.id));
      setDraf(salin(h.putaran));
      setBasisRev(h.putaran.rev);
      setKotor(false);
      umpanBalik.berhasil("Suntingan Anda disimpan menimpa versi rekan.");
    });

  const muatTerbaru = () => {
    if (konflik) terapkanHasil(konflik.segar ?? { versi: 1, putaran: [] });
    if (draf) hapusLokal(kunciLokal(k.id, draf.id));
    setKotor(false);
    setDraf(null);
    setKonflik(null);
    setGalat("");
    void q.muatUlang();
  };

  const pindai = async () => {
    setPindaiGalat("");
    setPindaiSibuk(true);
    try {
      const h = await pindaiDrafUntukLembar(k);
      ubah((d) => ({ ...d, pindai: h.ringkas }));
      umpanBalik.info("Hasil pindai masuk ke lembar.", { teks: "Tekan Simpan draf untuk menyimpannya." });
    } catch (err) {
      setPindaiGalat(pesanError(err));
    } finally {
      setPindaiSibuk(false);
    }
  };

  const finalkan = () =>
    jalankan("final", async () => {
      if (!draf) return;
      if (!dokumen || !aktivitas) throw new Error("Daftar dokumen atau riwayat masih dimuat. Tunggu sebentar, lalu coba lagi.");
      const sekarang = new Date().toISOString();
      const versiBaru = { ...versi, ...(await bacaVersiDraft(dokumen ?? [])) };
      const data = susunDataOtomatis({ kontrak: k, dokumen: dokumen ?? [], aktivitas: aktivitas ?? [], induk, versi: versiBaru, pindai: draf.pindai ?? null, sekarang });
      const final = finalkanPutaran(draf, data, sesi.nama, sekarang);
      const h = await simpanLembar(k.id, final, basisRev);
      terapkanHasil(h.lembar);
      hapusLokal(kunciLokal(k.id, draf.id));
      setDialog(null);
      setKotor(false);
      setDraf(null);
      const def = defKesimpulan(final.kesimpulan);
      const dicatat = await catatRiwayatLembar(k.id, `Lembar Hasil Review Legal putaran ${final.nomor} difinalkan. Kesimpulan: ${def?.label ?? "-"}.`, sesi);
      umpanBalik.berhasil(`Lembar putaran ${final.nomor} difinalkan.`, { teks: def ? `Kesimpulan: ${def.label}. Langkah berikutnya: ${def.langkah}.` : undefined });
      if (!h.ringkasTersimpan) umpanBalik.peringatan("Lembar tersimpan, tetapi ringkasan untuk pengaju belum.", { teks: "Buat kolom HasilReview (teks beberapa baris) di list Kontrak agar pengaju bisa membaca kesimpulannya.", durasi: 12_000 });
      if (!dicatat) umpanBalik.peringatan("Lembar tersimpan, tetapi catatannya belum masuk riwayat.");
      onBerubah();
    });

  const bukaKembali = () =>
    jalankan("buka", async () => {
      if (!terpilih) return;
      const p = bukaKembaliPutaran(terpilih, new Date().toISOString());
      const h = await simpanLembar(k.id, p, terpilih.rev);
      terapkanHasil(h.lembar);
      setDialog(null);
      await catatRiwayatLembar(k.id, `Hasil review Legal putaran ${terpilih.nomor} dibuka kembali untuk diperbarui.`, sesi);
      umpanBalik.info(`Putaran ${terpilih.nomor} dibuka kembali.`, { teks: terpilih.persetujuan ? "Persetujuan kepala Legal dicabut karena isinya akan berubah." : undefined });
      onBerubah();
    });

  const simpanPersetujuan = (isi: Omit<PersetujuanLembar, "dicatat" | "oleh">) =>
    jalankan("setuju", async () => {
      if (!terpilih) return;
      const p = catatPersetujuanLembar(terpilih, isi, sesi.nama, new Date().toISOString());
      const h = await simpanLembar(k.id, p, terpilih.rev);
      terapkanHasil(h.lembar);
      setDialog(null);
      await catatRiwayatLembar(k.id, `Persetujuan internal atas hasil review Legal putaran ${terpilih.nomor} dicatat.`, sesi);
      umpanBalik.berhasil("Persetujuan kepala Legal tercatat.", { teks: "Perbarui salinan .docx agar memuat persetujuan ini." });
      onBerubah();
    });

  const cabutPersetujuan = () =>
    jalankan("setuju", async () => {
      if (!terpilih) return;
      const h = await simpanLembar(k.id, hapusPersetujuanLembar(terpilih, new Date().toISOString()), terpilih.rev);
      terapkanHasil(h.lembar);
      await catatRiwayatLembar(k.id, `Catatan persetujuan internal atas hasil review Legal putaran ${terpilih.nomor} dihapus.`, sesi);
      umpanBalik.info("Catatan persetujuan dihapus.");
    });

  const unduhDocx = () =>
    jalankan("docx", async () => {
      const p = aktif;
      if (!p) return;
      const { blob, nama } = await rakitLembarDocx(k, p, p.status === "final" && p.final ? p.final.data : dataLive);
      unduhBlob(blob, nama);
      umpanBalik.berhasil("Lembar sudah diunduh.", { teks: p.status === "draf" ? "Berkasnya bertanda DRAF karena belum difinalkan." : undefined });
    });

  const simpanSalinan = () =>
    jalankan("salinan", async () => {
      if (!terpilih || terpilih.status !== "final" || !terpilih.final) return;
      const h = await simpanSalinanLembar(k, terpilih, terpilih.final.data, setPersen);
      const sekarang = new Date().toISOString();
      const p: PutaranReview = { ...terpilih, salinan: { nama: h.nama, waktu: sekarang, oleh: sesi.nama, rev: terpilih.rev + 1, webUrl: h.webUrl } };
      const simpan = await simpanLembar(k.id, p, terpilih.rev);
      terapkanHasil(simpan.lembar);
      await catatRiwayatLembar(k.id, `Menyimpan salinan Lembar Hasil Review Legal putaran ${terpilih.nomor} di dokumen kontrak.`, sesi, "Dokumen");
      umpanBalik.berhasil("Salinan tersimpan di Berkas Kontrak.", { teks: h.nama });
      if (!h.jenisTercatat) umpanBalik.peringatan("Jenis dokumennya belum tercatat.", { teks: 'Tambahkan pilihan "Lembar Review Legal" di kolom JenisDokumen library Berkas Kontrak. Sementara itu berkasnya tetap disembunyikan dari pengaju lewat namanya.', durasi: 12_000 });
      onBerubah();
    });

  // --- Tampilan --------------------------------------------------------------------------------------------

  const judulId = `lembar-${k.id}`;
  const lembarKosong = !terakhir;
  const sudahDikirimUlang = !!terakhir?.final && !!aktivitas && !!kirimUlangSetelah(aktivitas, terakhir.final.waktu);
  const bolehMulaiBaru = bolehUbah && kolomAda && terakhir?.status === "final";

  return (
    <section className="kartu" aria-labelledby={judulId}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={judulId} className="flex flex-wrap items-center gap-2 font-bold">
            <ClipboardCheck className="h-4 w-4 text-brand" aria-hidden="true" /> Lembar Hasil Review Legal
            <TandaStandarAwal />
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {bolehUbah ? "Diisi Legal tiap putaran review. Sebagian besar terisi otomatis; pengaju hanya membaca kesimpulan dan catatan untuknya." : "Hasil review internal Legal. Pengaju hanya membaca kesimpulan dan catatan untuknya."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {bolehUbah && kolomAda && lembarKosong && !q.loading && (
            <Tombol kecil ikon={<FilePlus2 className="h-4 w-4" />} memuat={sibuk === "mulai"} disabled={!!sibuk} onClick={() => void mulai()}>
              Mulai lembar review
            </Tombol>
          )}
          {bolehMulaiBaru && (
            <Tombol kecil ikon={<FilePlus2 className="h-4 w-4" />} memuat={sibuk === "mulai"} disabled={!!sibuk} onClick={() => void mulai()}>
              Mulai putaran {(terakhir?.nomor ?? 0) + 1}
            </Tombol>
          )}
        </div>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        {q.loading && !q.data && <Kerangka className="h-24" />}
        {q.error != null && !q.data && <KotakError error={q.error} ulangi={() => void q.muatUlang()} />}

        {q.data && !kolomAda && (
          <p role="note" className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">
            Lembar Hasil Review Legal belum aktif di site ini. Admin perlu membuat kolom <strong>LembarReview</strong> (teks beberapa baris, plain, tanpa batas 255) di list Kontrak. Kolom <strong>HasilReview</strong> (teks beberapa baris) opsional, untuk ringkasan yang dibaca pengaju.
          </p>
        )}

        {q.data && kolomAda && lembarKosong && (
          <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center">
            <p className="text-sm font-semibold">Belum ada lembar hasil review.</p>
            <p className="mx-auto mt-1 max-w-xl text-xs text-muted">
              {bolehUbah
                ? "Setelah mereview draf, Legal mencatat pokok kontrak, temuan per pasal, kepatuhan regulasi, dan kesimpulan di sini. Hasilnya bisa diunduh sebagai .docx atau dicetak sebagai PDF untuk penandatangan."
                : k.status === "Review Legal"
                  ? "Belum dibuat. Lembar diisi Legal selama tahap Review Legal."
                  : "Lembar tidak dibuat untuk pengajuan ini."}
            </p>
          </div>
        )}

        {lembar && lembar.putaran.length > 1 && (
          <nav aria-label="Putaran review" className="flex flex-wrap gap-1.5">
            {lembar.putaran.map((p) => {
              const d = defKesimpulan(p.kesimpulan);
              const pilih = p.id === terpilih?.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-current={pilih ? "true" : undefined}
                  disabled={kotor && !pilih}
                  title={kotor && !pilih ? "Simpan draf dulu sebelum berpindah putaran" : undefined}
                  onClick={() => setNomorPilih(p.nomor)}
                  className={cx(
                    "min-h-9 rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:opacity-50 [@media(pointer:coarse)]:min-h-11",
                    pilih ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface text-muted hover:border-brand hover:text-ink",
                  )}
                >
                  Putaran {p.nomor} · {p.status === "draf" ? "Draf" : (d?.label ?? "Final")}
                </button>
              );
            })}
          </nav>
        )}

        {sudahDikirimUlang && bolehUbah && terakhir?.status === "final" && (
          <p role="note" className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-xs text-info">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Pengaju sudah mengirim ulang kontrak sesudah lembar putaran {terakhir.nomor} difinalkan. Mulai putaran {terakhir.nomor + 1} untuk mencatat hasil review terbaru; temuan yang belum diterima ikut terbawa.
            </span>
          </p>
        )}

        {galat && (
          <div role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            <p>{galat}</p>
            {konflik && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Tombol kecil varian="kedua" type="button" onClick={muatTerbaru}>
                  Muat versi terbaru (suntingan saya dibuang)
                </Tombol>
                {draf && (
                  <Tombol kecil varian="bahaya" type="button" onClick={() => void timpa()}>
                    Simpan suntingan saya (menimpa)
                  </Tombol>
                )}
              </div>
            )}
          </div>
        )}

        {/* Putaran draf yang bisa disunting. */}
        {suntingan && draf && (
          <>
            <LembarEditor k={k} draf={draf} ubah={ubah} data={dataLive} onPindai={() => void pindai()} pindaiSibuk={pindaiSibuk} pindaiGalat={pindaiGalat} terkunci={!!sibuk} onMintaRevisi={onMintaRevisi} />
            <BilahAksi
              kotor={kotor}
              sibuk={sibuk}
              onSimpan={() => void simpanDraf()}
              onFinal={() => setDialog("final")}
              onCetak={() => setCetak(true)}
              onDocx={() => void unduhDocx()}
              nomor={draf.nomor}
            />
          </>
        )}

        {/* Putaran yang tidak disunting: ringkasan, lalu isi lembar. */}
        {terpilih && !(suntingan && draf) && (
          <RingkasPutaran
            p={terpilih}
            data={dataTampil}
            blok={blok}
            sibuk={sibuk}
            persen={persen}
            bolehUbah={bolehUbah && terpilih.id === terakhir?.id}
            bolehPersetujuan={bolehPersetujuan && terpilih.id === terakhir?.id && terpilih.status === "final"}
            onBuka={() => setDialog("buka")}
            onSetuju={() => setDialog("setuju")}
            onCabut={() => void cabutPersetujuan()}
            onCetak={() => setCetak(true)}
            onDocx={() => void unduhDocx()}
            onSalinan={() => void simpanSalinan()}
            onMintaRevisi={onMintaRevisi}
          />
        )}

        {terpilih && !suntingan && terpilih.status === "draf" && !bolehUbah && (
          <p className="flex items-start gap-2 text-xs text-muted">
            <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Putaran ini masih draf dan hanya bisa disunting Legal selama tahap Review Legal.
          </p>
        )}
      </div>

      {dialog === "final" && draf && <DialogFinal draf={draf} data={dataLive} siap={!!dokumen && !!aktivitas} sibuk={sibuk === "final"} onBatal={() => setDialog(null)} onFinal={() => void finalkan()} />}
      {dialog === "buka" && terpilih && <DialogBuka p={terpilih} sibuk={sibuk === "buka"} onBatal={() => setDialog(null)} onBuka={() => void bukaKembali()} />}
      {dialog === "setuju" && terpilih && <DialogSetuju p={terpilih} sibuk={sibuk === "setuju"} onBatal={() => setDialog(null)} onSimpan={(i) => void simpanPersetujuan(i)} />}
      {cetak && aktif && (
        <TampilanCetakLembar
          blok={blok}
          judul={`Lembar Hasil Review Legal putaran ${aktif.nomor} - ${k.nomorPengajuan}`}
          onTutup={() => setCetak(false)}
          onUnduh={() => void unduhDocx()}
          mengunduh={sibuk === "docx"}
        />
      )}
    </section>
  );
}

// --- Bilah aksi (draf) -------------------------------------------------------------------------------------

function BilahAksi({ kotor, sibuk, onSimpan, onFinal, onCetak, onDocx, nomor }: { kotor: boolean; sibuk: Sibuk; onSimpan: () => void; onFinal: () => void; onCetak: () => void; onDocx: () => void; nomor: number }) {
  return (
    <div className="-mx-5 flex flex-wrap items-center gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:sticky sm:bottom-0 sm:z-10 sm:-mx-6 sm:px-6" role="group" aria-label={`Aksi lembar putaran ${nomor}`}>
      <p className={cx("min-w-0 flex-1 basis-40 text-xs", kotor ? "font-semibold text-accent-ink" : "text-muted")} role="status" aria-live="polite">
        {kotor ? "Ada perubahan yang belum disimpan." : "Semua perubahan tersimpan."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Tombol kecil varian="hantu" type="button" ikon={<Printer className="h-4 w-4" />} disabled={!!sibuk} onClick={onCetak}>
          Pratinjau cetak
        </Tombol>
        <Tombol kecil varian="hantu" type="button" ikon={<Download className="h-4 w-4" />} memuat={sibuk === "docx"} disabled={!!sibuk} onClick={onDocx}>
          .docx
        </Tombol>
        <Tombol kecil varian="kedua" type="button" ikon={<Save className="h-4 w-4" />} memuat={sibuk === "simpan"} disabled={!kotor || !!sibuk} onClick={onSimpan}>
          Simpan draf
        </Tombol>
        <Tombol kecil type="button" ikon={<BadgeCheck className="h-4 w-4" />} disabled={!!sibuk} onClick={onFinal}>
          Finalkan
        </Tombol>
      </div>
    </div>
  );
}

// --- Ringkasan putaran yang tidak disunting ------------------------------------------------------------------

function RingkasPutaran({
  p,
  data,
  blok,
  sibuk,
  persen,
  bolehUbah,
  bolehPersetujuan,
  onBuka,
  onSetuju,
  onCabut,
  onCetak,
  onDocx,
  onSalinan,
  onMintaRevisi,
}: {
  p: PutaranReview;
  data: DataOtomatis;
  blok: ReturnType<typeof susunDokumenLembar>;
  sibuk: Sibuk;
  persen: number | null;
  bolehUbah: boolean;
  bolehPersetujuan: boolean;
  onBuka: () => void;
  onSetuju: () => void;
  onCabut: () => void;
  onCetak: () => void;
  onDocx: () => void;
  onSalinan: () => void;
  onMintaRevisi: (teks: string) => void;
}) {
  const def = defKesimpulan(p.kesimpulan);
  const r = ringkasTemuan(p.temuan);
  const risiko = risikoKeseluruhan(p.temuan);
  const syaratBuka = p.syarat.filter((s) => !s.selesai).length;
  const usang = salinanUsang(p);
  const poin = poinRevisiDariTemuan(p.temuan);
  const nadaKes = def?.nada === "sukses" ? "bg-success-soft text-success" : def?.nada === "bahaya" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-ink";
  const final = p.status === "final";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-raised p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cx("inline-flex rounded-full px-3 py-1 text-sm font-bold", def ? nadaKes : "bg-surface text-muted")}>{def?.label ?? "Belum ada kesimpulan"}</span>
          <Lencana nada={final ? "sukses" : "peringatan"}>{final ? "Final" : "Draf"}</Lencana>
          {r.total > 0 && <ChipRisiko risiko={risiko.sisa} />}
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-muted">Putaran dan tanggal</dt>
            <dd>
              Putaran {p.nomor} · {formatTanggal(p.tanggalReview || null)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">Pengulas</dt>
            <dd className="break-words">{p.olehNama || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">Temuan</dt>
            <dd>{r.total ? `${r.total} (${r.belumSelesai} belum diterima)` : "Tidak ada"}</dd>
          </div>
        </dl>
        {p.syarat.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Syarat sebelum tanda tangan: {p.syarat.length - syaratBuka} dari {p.syarat.length} selesai.
          </p>
        )}
        {p.final && (
          <p className="mt-2 text-xs text-muted">
            Difinalkan {formatWaktu(p.final.waktu)} oleh {p.final.oleh}.
          </p>
        )}
        {p.dipangkas && <p className="mt-1 text-xs text-muted">Isi lengkap putaran ini sudah dipadatkan agar muat; lihat salinan .docx bila pernah disimpan.</p>}
        {p.persetujuan && (
          <div className="mt-3 rounded-xl bg-surface px-3 py-2 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <Stamp className="h-4 w-4 text-brand" aria-hidden="true" /> Kepala Legal: {p.persetujuan.keputusan}
              <span className="font-normal text-muted">
                {p.persetujuan.nama}
                {p.persetujuan.jabatan ? `, ${p.persetujuan.jabatan}` : ""}
                {p.persetujuan.tanggal ? ` · ${formatTanggal(p.persetujuan.tanggal)}` : ""}
              </span>
            </p>
            {p.persetujuan.catatan && <p className="mt-0.5 break-words text-xs text-muted">{p.persetujuan.catatan}</p>}
            {bolehPersetujuan && (
              <Tombol kecil varian="hantu" type="button" className="mt-1" ikon={<Trash2 className="h-3.5 w-3.5" />} disabled={!!sibuk} onClick={onCabut}>
                Hapus catatan persetujuan
              </Tombol>
            )}
          </div>
        )}
      </div>

      {p.catatanPengaju.trim() && (
        <div className="rounded-xl border border-line px-3 py-2 text-sm">
          <p className="text-xs font-semibold text-muted">Catatan untuk pengaju</p>
          <p className="whitespace-pre-wrap break-words">{p.catatanPengaju}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Tombol kecil varian="kedua" type="button" ikon={<Printer className="h-4 w-4" />} disabled={!!sibuk} onClick={onCetak}>
          Tampilan cetak atau PDF
        </Tombol>
        <Tombol kecil varian="kedua" type="button" ikon={<Download className="h-4 w-4" />} memuat={sibuk === "docx"} disabled={!!sibuk} onClick={onDocx}>
          Unduh .docx
        </Tombol>
        {(bolehUbah || bolehPersetujuan) && final && (
          <Tombol kecil varian="kedua" type="button" ikon={<Upload className="h-4 w-4" />} memuat={sibuk === "salinan"} disabled={!!sibuk} onClick={onSalinan} title="Simpan salinan .docx ke library Berkas Kontrak sebagai dokumen internal Legal">
            {p.salinan ? (usang ? "Perbarui salinan di Berkas Kontrak" : "Simpan ulang salinan") : "Simpan salinan ke Berkas Kontrak"}
          </Tombol>
        )}
        {bolehPersetujuan && !p.persetujuan && (
          <Tombol kecil varian="kedua" type="button" ikon={<Stamp className="h-4 w-4" />} disabled={!!sibuk} onClick={onSetuju}>
            Catat persetujuan kepala Legal
          </Tombol>
        )}
        {bolehUbah && final && (
          <Tombol kecil varian="hantu" type="button" ikon={<RotateCcw className="h-4 w-4" />} disabled={!!sibuk} onClick={onBuka}>
            Buka kembali untuk disunting
          </Tombol>
        )}
        {final && poin.length > 0 && bolehUbah && (
          <Tombol kecil type="button" onClick={() => onMintaRevisi(`Mohon perbaiki hal berikut ya:\n${poin.map((x, i) => `${i + 1}. ${x}`).join("\n")}`)}>
            Isi Minta Revisi dari temuan ({poin.length})
          </Tombol>
        )}
      </div>
      {persen != null && (
        <p className="text-xs text-muted" role="status">
          Mengunggah… {persen}%
        </p>
      )}
      {p.salinan && (
        <p className="text-xs text-muted">
          Salinan: <span className="break-all font-semibold text-ink">{p.salinan.nama}</span> ({formatWaktu(p.salinan.waktu)}).{usang ? " Lembar sudah berubah sejak salinan ini dibuat; perbarui bila perlu." : ""}
        </p>
      )}

      <details className="rounded-2xl border border-line">
        <summary className="flex min-h-11 cursor-pointer select-none items-center px-4 py-2 text-sm font-semibold text-brand hover:text-brand-strong">Lihat isi lembar lengkap</summary>
        <div className="border-t border-line p-3 sm:p-4">
          <DokumenLembar blok={blok} />
          <p className="mt-2 text-center text-xs text-muted">Data otomatis per {formatWaktu(data.dibuat)}.</p>
        </div>
      </details>
    </div>
  );
}

// --- Dialog ---------------------------------------------------------------------------------------------------

function DialogFinal({ draf, data, siap, sibuk, onBatal, onFinal }: { draf: PutaranReview; data: DataOtomatis; siap: boolean; sibuk: boolean; onBatal: () => void; onFinal: () => void }) {
  const cek = cekFinalisasi(draf, data);
  const def = defKesimpulan(draf.kesimpulan);
  const poin = poinRevisiDariTemuan(draf.temuan).length;
  return (
    <Modal judul={`Finalkan lembar putaran ${draf.nomor}`} onTutup={onBatal} lebar="max-w-xl">
      <p className="text-sm text-muted">
        Setelah difinalkan, data otomatis (dokumen, kelengkapan, checklist) dibekukan dan lembar bisa dicetak atau disimpan sebagai salinan. Pengaju akan membaca <strong className="text-ink">kesimpulan dan catatan untuknya saja</strong>; penilaian risiko tetap internal. Anda masih bisa membukanya kembali selama tahap Review Legal.
      </p>
      {def && (
        <p className="mt-3 rounded-xl bg-raised px-3 py-2 text-sm">
          Kesimpulan: <strong>{def.label}</strong>. Langkah berikutnya: {def.langkah}.
          {(draf.kesimpulan === "revisi" || draf.kesimpulan === "tidak") && poin > 0 ? ` ${poin} temuan siap mengisi Minta Revisi.` : ""}
        </p>
      )}
      {!siap && (
        <p className="mt-3 text-xs text-muted" role="status">
          Memuat daftar dokumen dan riwayat…
        </p>
      )}
      {cek.galat.length > 0 && (
        <div role="alert" className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          <p className="font-semibold">Perlu dilengkapi dulu:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {cek.galat.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {cek.peringatan.length > 0 && (
        <div className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-ink">
          <p className="font-semibold">Pengingat (tidak menahan):</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {cek.peringatan.map((g) => (
              <li key={g} className="break-words">
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}
      <AksiModal>
        <Tombol varian="kedua" type="button" onClick={onBatal} disabled={sibuk}>
          Kembali menyunting
        </Tombol>
        <Tombol type="button" memuat={sibuk} disabled={cek.galat.length > 0 || !siap} onClick={onFinal}>
          Finalkan lembar
        </Tombol>
      </AksiModal>
    </Modal>
  );
}

function DialogBuka({ p, sibuk, onBatal, onBuka }: { p: PutaranReview; sibuk: boolean; onBatal: () => void; onBuka: () => void }) {
  return (
    <Modal judul={`Buka kembali putaran ${p.nomor}`} onTutup={onBatal}>
      <p className="text-sm text-muted">
        Lembar kembali menjadi draf dan bisa disunting.
        {p.persetujuan ? " Persetujuan kepala Legal yang sudah dicatat akan dicabut karena isinya akan berubah." : ""} Pengaju tetap membaca hasil final sebelumnya sampai lembar difinalkan lagi. Salinan .docx lama tidak terhapus.
      </p>
      <AksiModal>
        <Tombol varian="kedua" type="button" onClick={onBatal} disabled={sibuk}>
          Batal
        </Tombol>
        <Tombol type="button" memuat={sibuk} onClick={onBuka}>
          Buka kembali
        </Tombol>
      </AksiModal>
    </Modal>
  );
}

function DialogSetuju({ p, sibuk, onBatal, onSimpan }: { p: PutaranReview; sibuk: boolean; onBatal: () => void; onSimpan: (i: Omit<PersetujuanLembar, "dicatat" | "oleh">) => void }) {
  const [isi, setIsi] = useState<Omit<PersetujuanLembar, "dicatat" | "oleh">>({ nama: "", jabatan: "Kepala Legal", tanggal: hariIni(), keputusan: "Disetujui", catatan: "" });
  const [galat, setGalat] = useState("");
  const refNama = useRef<HTMLInputElement>(null);
  useEffect(() => refNama.current?.focus(), []);
  const kirim = () => {
    if (!isi.nama.trim()) return setGalat("Nama kepala Legal wajib diisi.");
    if (!isi.tanggal) return setGalat("Tanggal wajib diisi.");
    setGalat("");
    onSimpan(isi);
  };
  return (
    <Modal judul="Catat persetujuan kepala Legal" onTutup={onBatal} lebar="max-w-lg">
      <p className="text-sm text-muted">
        Opsional dan standar awal. Mencatat bahwa kepala Legal sudah memeriksa lembar putaran {p.nomor}; ini pencatatan, bukan tanda tangan elektronik, dan tidak menahan langkah apa pun. Tanda tangan basahnya tetap di lembar cetak.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Isian label="Nama" wajib>
          <input ref={refNama} className="input" maxLength={BATAS_TEKS.nama} autoComplete="off" value={isi.nama} onChange={(e) => setIsi({ ...isi, nama: e.target.value })} />
        </Isian>
        <Isian label="Jabatan">
          <input className="input" maxLength={BATAS_TEKS.nama} autoComplete="off" value={isi.jabatan} onChange={(e) => setIsi({ ...isi, jabatan: e.target.value })} />
        </Isian>
        <Isian label="Tanggal" wajib>
          <input type="date" className="input" value={isi.tanggal} max={hariIni()} onChange={(e) => setIsi({ ...isi, tanggal: e.target.value })} />
        </Isian>
        <fieldset className="min-w-0">
          <legend className="label">Keputusan</legend>
          <div role="radiogroup" aria-label="Keputusan kepala Legal" className="grid grid-cols-2 gap-1.5">
            {(["Disetujui", "Dikembalikan"] as const).map((x) => (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={isi.keputusan === x}
                onClick={() => setIsi({ ...isi, keputusan: x })}
                className={cx(
                  "min-h-10 rounded-xl border px-2 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft [@media(pointer:coarse)]:min-h-11",
                  isi.keputusan === x ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface text-muted hover:border-brand",
                )}
              >
                {x}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Catatan (opsional)" className="sm:col-span-2">
          <textarea className="input min-h-[72px]" maxLength={600} value={isi.catatan} onChange={(e) => setIsi({ ...isi, catatan: e.target.value })} />
        </Field>
      </div>
      {galat && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {galat}
        </p>
      )}
      <AksiModal>
        <Tombol varian="kedua" type="button" onClick={onBatal} disabled={sibuk}>
          Batal
        </Tombol>
        <Tombol type="button" memuat={sibuk} onClick={kirim}>
          Catat persetujuan
        </Tombol>
      </AksiModal>
    </Modal>
  );
}

// --- Peringatan lunak di modal Lanjut ke Tanda Tangan ------------------------------------------------------

/**
 * Catatan di modal Lanjut ke Tanda Tangan tentang Lembar Hasil Review Legal: belum ada lembar, belum final, atau kesimpulannya
 * bukan layak. Hanya mengingatkan; tombol lanjut tidak pernah dikunci.
 */
export function PeringatanLembarTtd({ lembar }: { lembar: LembarReview | null }) {
  const w = peringatanLembarSebelumTtd(lembar);
  if (!w) return null;
  const gaya = w.nada === "sukses" ? "bg-success-soft text-success" : w.nada === "info" ? "bg-info-soft text-info" : "bg-accent-soft text-accent-ink";
  const Ikon = w.nada === "sukses" ? Check : AlertTriangle;
  return (
    <div role="note" className={cx("rounded-2xl p-4 text-sm", gaya)}>
      <p className="flex items-start gap-2 font-semibold">
        <Ikon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Lembar Hasil Review Legal</span>
      </p>
      <p className="mt-1 break-words text-xs">{w.teks}</p>
      {w.rinci.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
          {w.rinci.map((r) => (
            <li key={r} className="break-words">
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
