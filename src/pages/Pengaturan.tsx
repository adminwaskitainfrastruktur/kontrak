// Halaman Pengaturan (K05), khusus Admin. Nilai disimpan per kunci di list "Pengaturan Kontrak". Sebagian kunci
// juga dibaca flow Power Automate terjadwal (lihat PEMBACA_FLOW di lib/pengaturan), jadi setiap kunci disimpan
// terpisah dan hanya kunci yang berubah yang ditulis.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlarmClock, AlertTriangle, CalendarClock, CalendarSync, FlaskConical, Hash, Mail, Plus, RotateCcw, Save, Scale, Settings2, ShieldAlert, Timer, Trash2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { useSesi } from "../context/SesiContext";
import { usePengaturan } from "../context/PengaturanContext";
import { useMuat } from "../hooks/useMuat";
import { bacaNilai, formatTanggal, hariIni } from "../lib/format";
import { EASE_KELUAR, pegasLembut } from "../lib/gerak";
import { pesanError } from "../lib/graph";
import { umpanBalik } from "../lib/umpanBalik";
import {
  DAFTAR_KUNCI,
  ISIAN_FORMAT_PENOMORAN,
  NAMA_HARI,
  PENGATURAN_BAWAAN,
  STATUS_SLA,
  dariForm,
  flowPembaca,
  keForm,
  pengaturanBawaan,
  ringkasNilai,
  samaNilai,
  formatDariForm,
  matriksDariForm,
  type BarisMatriksForm,
  type FormPengaturan,
  type GalatForm,
  type KunciPengaturan,
  type Pengaturan as DataPengaturan,
  type StatusSla,
} from "../lib/pengaturan";
import { PENANDA_POLA, usulanNomorKontrak, type FormatPenomoran } from "../lib/penomoran";
import type { SelisihBerakhirEfektif } from "../lib/masa";
import { ambilEmailUji, ambilPengaturanRinci, catatLogAdmin, kosongkanCachePengaturan, simpanEmailUji, simpanPengaturan } from "../services/pengaturan";
import { periksaBerakhirEfektif, rekonsiliasiBerakhirEfektif, type HasilRekonsiliasi } from "../services/kontrak";
import { JENIS_KONTRAK, type JenisKontrak, type Sesi } from "../lib/types";
import { AksiModal, Isian, KepalaHalaman, KerangkaHalaman, Kosong, KotakError, Lencana, Modal, Tombol, cx } from "../components/ui";

const LABEL_KUNCI: Record<KunciPengaturan, string> = {
  hariPeringatan: "Pengingat kontrak berakhir",
  jaminanPeringatan: "Pengingat jaminan berakhir",
  sla: "Batas SLA per tahap",
  slaPakaiHariKerja: "Cara hitung SLA",
  hariKerja: "Hari kerja",
  ambangEskalasi: "Ambang eskalasi",
  alamatGrupLegal: "Alamat grup Legal",
  pengirimEmail: "Pengirim email",
  tautanTeams: "Channel Teams Legal",
  formatPenomoran: "Format nomor kontrak",
  matriksKewenangan: "Matriks kewenangan",
};

const KETERANGAN_SLA: Record<StatusSla, string> = {
  Diajukan: "Sampai Legal mengambil pengajuan",
  "Review Legal": "Lama Legal memeriksa draf",
  "Perlu Revisi": "Waktu pengaju memperbaiki",
  "Proses Tanda Tangan": "Sampai semua pihak tanda tangan",
};

/** Bagian formulir mana yang dipegang setiap kunci, untuk tombol "Kembalikan ke bawaan" per kartu. */
function kembalikanKunci(f: FormPengaturan, kunci: readonly KunciPengaturan[]): FormPengaturan {
  const b = keForm(pengaturanBawaan());
  const hasil = { ...f, sla: { ...f.sla } };
  for (const k of kunci) {
    if (k === "ambangEskalasi") {
      hasil.diajukanTanpaPicHari = b.diajukanTanpaPicHari;
      hasil.revisiMenggantungHari = b.revisiMenggantungHari;
    } else if (k === "sla") {
      hasil.sla = { ...b.sla };
    } else if (k === "matriksKewenangan") {
      hasil.matriks = b.matriks.map((x) => ({ ...x }));
    } else if (k === "formatPenomoran") {
      for (const isian of ISIAN_FORMAT_PENOMORAN) (hasil as unknown as Record<string, unknown>)[isian] = isian === "formatKode" ? { ...b.formatKode } : b[isian];
    } else {
      (hasil as unknown as Record<string, unknown>)[k] = b[k];
    }
  }
  return hasil;
}

/** Keterangan siapa yang membaca kunci-kunci sebuah kartu: aplikasi saja, atau juga flow tertentu. */
function teksPemakai(kunci: readonly KunciPengaturan[]): string {
  const flow = flowPembaca(kunci);
  return flow.length ? `Dipakai aplikasi dan flow ${flow.join(", ")}.` : "Hanya dipakai aplikasi; tidak dibaca flow.";
}

export default function Pengaturan() {
  const { sesi } = useSesi();
  const konteks = usePengaturan();
  const q = useMuat(() => {
    // Halaman ini selalu membaca nilai terbaru, bukan salinan sesi, supaya tidak menimpa simpanan Admin lain.
    kosongkanCachePengaturan();
    return ambilPengaturanRinci();
  }, []);

  const [form, setForm] = useState<FormPengaturan | null>(null);
  const [galat, setGalat] = useState<GalatForm>({});
  const [sudahCoba, setSudahCoba] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    if (q.data) setForm(keForm(q.data.pengaturan));
  }, [q.data]);

  const tersimpan = q.data?.pengaturan ?? null;
  const hasil = useMemo(() => (form ? dariForm(form) : null), [form]);
  const berubah = useMemo<KunciPengaturan[]>(() => {
    if (!tersimpan || !hasil?.ok) return [];
    return DAFTAR_KUNCI.filter((k) => !samaNilai(hasil.nilai[k], tersimpan[k]));
  }, [hasil, tersimpan]);
  const kotor = useMemo(() => !!form && !!tersimpan && JSON.stringify(form) !== JSON.stringify(keForm(tersimpan)), [form, tersimpan]);

  useEffect(() => {
    if (sudahCoba && hasil) setGalat(hasil.ok ? {} : hasil.galat);
  }, [hasil, sudahCoba]);

  // Perubahan yang belum disimpan: peramban bertanya dulu sebelum tab ditutup atau dimuat ulang.
  useEffect(() => {
    if (!kotor) return;
    const jaga = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", jaga);
    return () => window.removeEventListener("beforeunload", jaga);
  }, [kotor]);

  if (sesi.peran !== "Admin") {
    return <Kosong judul="Pengaturan khusus Admin" teks="Angka pengingat, SLA, dan alamat email diatur oleh Admin sistem. Bila ada yang perlu diubah, sampaikan ke Admin ya." ikon={<Settings2 className="h-6 w-6" />} />;
  }
  if (q.loading && !q.data) return <KerangkaHalaman baris={4} />;
  if (q.error && !q.data) {
    return (
      <div className="space-y-4">
        <KepalaHalaman judul="Pengaturan" sub="Aplikasi tetap berjalan dengan nilai bawaan selama pengaturan belum terbaca." />
        <KotakError error={q.error} ulangi={() => void q.muatUlang()} />
      </div>
    );
  }
  if (!form || !tersimpan || !q.data) return <KerangkaHalaman baris={4} />;

  const ubah = <K extends keyof FormPengaturan>(kunci: K, nilai: FormPengaturan[K]) => setForm((f) => (f ? { ...f, [kunci]: nilai } : f));
  const ubahSla = (s: StatusSla, nilai: string) => setForm((f) => (f ? { ...f, sla: { ...f.sla, [s]: nilai } } : f));
  const kembalikan = (kunci: readonly KunciPengaturan[]) => setForm((f) => (f ? kembalikanKunci(f, kunci) : f));
  const batalkan = () => {
    setForm(keForm(tersimpan));
    setSudahCoba(false);
    setGalat({});
  };

  const simpan = async () => {
    setSudahCoba(true);
    const h = dariForm(form);
    if (!h.ok) {
      setGalat(h.galat);
      toast.error("Ada isian yang belum pas. Cek tanda merah di formulir.");
      return;
    }
    if (berubah.length === 0) {
      toast.info("Tidak ada yang berubah, jadi tidak ada yang disimpan.");
      return;
    }
    setMenyimpan(true);
    const berhasil: KunciPengaturan[] = [];
    let logGagal = false;
    try {
      for (const k of berubah) {
        await simpanPengaturan(k, h.nilai[k] as DataPengaturan[typeof k]);
        berhasil.push(k);
        try {
          await catatLogAdmin({ aksi: "Ubah pengaturan", sasaran: k, detail: { dari: tersimpan[k], ke: h.nilai[k] } }, sesi);
        } catch {
          logGagal = true;
        }
      }
      const flow = flowPembaca(berhasil);
      toast.success(berhasil.length === 1 ? `${LABEL_KUNCI[berhasil[0]!]} tersimpan.` : `${berhasil.length} pengaturan tersimpan.`, {
        description: flow.length
          ? `Aplikasi langsung memakai nilai baru. Flow ${flow.join(", ")} membacanya pada jalan terjadwal berikutnya.`
          : "Aplikasi langsung memakai nilai baru. Pengaturan ini tidak dibaca flow.",
      });
      if (logGagal) toast.warning("Perubahan tersimpan, tetapi jejaknya belum tercatat di Log Admin.");
    } catch (err) {
      const sisa = berubah.filter((k) => !berhasil.includes(k)).map((k) => LABEL_KUNCI[k]);
      toast.error(berhasil.length ? `Sebagian tersimpan. Belum tersimpan: ${sisa.join(", ")}.` : "Pengaturan belum tersimpan.", { description: pesanError(err) });
    } finally {
      setMenyimpan(false);
      setSudahCoba(false);
      await Promise.all([q.muatUlang(), konteks.muatUlang()]);
    }
  };

  const beda = (k: KunciPengaturan) => !samaNilai(tersimpan[k], PENGATURAN_BAWAAN[k]);
  const bisaSimpan = kotor && !menyimpan;

  return (
    <div className="pb-40 sm:pb-28">
      <KepalaHalaman
        judul="Pengaturan"
        sub="Angka pengingat, SLA, alamat email, dan format nomor kontrak dalam satu tempat. Sebagian nilai juga dibaca flow terjadwal; tiap kartu menyebut siapa yang memakainya."
        aksi={
          <Tombol
            varian="kedua"
            ikon={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              kembalikan(DAFTAR_KUNCI);
              toast.info("Semua isian kembali ke nilai bawaan.", { description: "Belum tersimpan. Tekan Simpan perubahan untuk menerapkan, atau Batalkan." });
            }}
            disabled={menyimpan}
          >
            Kembalikan semua ke bawaan
          </Tombol>
        }
      />

      <KartuModeUji sesi={sesi} />

      {q.data.rusak.length > 0 && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-line bg-accent-soft p-4 text-sm text-accent-ink">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Beberapa nilai di SharePoint tidak terbaca, jadi sementara memakai bawaan</p>
            <ul className="mt-1 list-disc pl-5">
              {q.data.rusak.map((r) => (
                <li key={r.kunci}>
                  {LABEL_KUNCI[r.kunci]}: {r.galat}
                </li>
              ))}
            </ul>
            <p className="mt-1 opacity-90">Simpan halaman ini sekali untuk menimpanya dengan nilai yang benar.</p>
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Bagian
          ikon={<CalendarClock className="h-5 w-5" />}
          judul="Pengingat tanggal berakhir"
          sub="Hari sebelum tanggal berakhir saat email pengingat dikirim. 0 berarti pada hari itu."
          ubahan={beda("hariPeringatan") || beda("jaminanPeringatan")}
          onKembalikan={() => kembalikan(["hariPeringatan", "jaminanPeringatan"])}
          pemakai={teksPemakai(["hariPeringatan", "jaminanPeringatan"])}
        >
          <Isian label="Kontrak (H-sekian)" bantuan={`Pisahkan dengan koma. Angka terbesar juga menjadi batas "akan berakhir" di dashboard. Bawaan: ${ringkasNilai("hariPeringatan", PENGATURAN_BAWAAN.hariPeringatan)}.`}>
            <InputTeks id="hariPeringatan" nilai={form.hariPeringatan} galat={galat.hariPeringatan} onUbah={(v) => ubah("hariPeringatan", v)} placeholder="90, 60, 30, 7, 0" inputMode="numeric" />
          </Isian>
          <PratinjauHari teks={form.hariPeringatan} />
          <Isian label="Jaminan / bank garansi (H-sekian)" bantuan={`Bawaan: ${ringkasNilai("jaminanPeringatan", PENGATURAN_BAWAAN.jaminanPeringatan)}.`} className="mt-4">
            <InputTeks id="jaminanPeringatan" nilai={form.jaminanPeringatan} galat={galat.jaminanPeringatan} onUbah={(v) => ubah("jaminanPeringatan", v)} placeholder="30, 14, 7" inputMode="numeric" />
          </Isian>
        </Bagian>

        <Bagian
          ikon={<Timer className="h-5 w-5" />}
          judul="Batas SLA per tahap"
          sub="Berapa hari sebuah pengajuan wajar berada di satu tahap. Lewat 70% tampil kuning, lewat batas tampil merah."
          ubahan={beda("sla") || beda("slaPakaiHariKerja") || beda("hariKerja")}
          onKembalikan={() => kembalikan(["sla", "slaPakaiHariKerja", "hariKerja"])}
          pemakai={teksPemakai(["sla", "slaPakaiHariKerja", "hariKerja"])}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {STATUS_SLA.map((s) => (
              <div key={s} className="min-w-0">
                <label htmlFor={`sla-${s}`} className="label">
                  {s}
                </label>
                <div className="relative">
                  <input
                    id={`sla-${s}`}
                    className={cx("input pr-14 angka", galat[`sla.${s}`] && "border-danger")}
                    inputMode="numeric"
                    value={form.sla[s]}
                    onChange={(e) => ubahSla(s, e.target.value)}
                    aria-invalid={!!galat[`sla.${s}`]}
                    aria-describedby={`sla-${s}-ket`}
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted">hari</span>
                </div>
                <p id={`sla-${s}-ket`} className={cx("mt-1 text-xs", galat[`sla.${s}`] ? "text-danger" : "text-muted")}>
                  {galat[`sla.${s}`] ?? `${KETERANGAN_SLA[s]}. Bawaan ${PENGATURAN_BAWAAN.sla[s]}.`}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-raised p-3.5">
            <div className="min-w-0">
              <p id="lbl-hari-kerja" className="text-sm font-semibold">
                Hitung dengan hari kerja
              </p>
              <p className="text-xs text-muted">{form.slaPakaiHariKerja ? "Akhir pekan tidak ikut dihitung." : "Saat ini memakai hari kalender, termasuk akhir pekan."}</p>
            </div>
            <Sakelar aktif={form.slaPakaiHariKerja} labelId="lbl-hari-kerja" onUbah={(v) => ubah("slaPakaiHariKerja", v)} />
          </div>

          <fieldset className="mt-4" aria-describedby="hari-kerja-ket">
            <legend className="label">Hari kerja</legend>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((h) => {
                const pilih = form.hariKerja.includes(h);
                return (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={pilih}
                    onClick={() => ubah("hariKerja", pilih ? form.hariKerja.filter((x) => x !== h) : [...form.hariKerja, h])}
                    className={cx(
                      "min-w-[3.25rem] rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-[3.5rem]",
                      pilih ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface text-muted hover:text-ink",
                    )}
                  >
                    {NAMA_HARI[h]!.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            <p id="hari-kerja-ket" className={cx("mt-1 text-xs", galat.hariKerja ? "text-danger" : "text-muted")}>
              {galat.hariKerja ?? `Dipakai bila hitung hari kerja aktif. Bawaan: ${ringkasNilai("hariKerja", PENGATURAN_BAWAAN.hariKerja)}. Hari libur nasional belum diperhitungkan.`}
            </p>
          </fieldset>
        </Bagian>

        <Bagian
          ikon={<ShieldAlert className="h-5 w-5" />}
          judul="Ambang eskalasi"
          sub='Kapan sebuah pengajuan masuk blok "Perlu perhatian" di agenda pagi Legal.'
          ubahan={beda("ambangEskalasi")}
          onKembalikan={() => kembalikan(["ambangEskalasi"])}
          pemakai={teksPemakai(["ambangEskalasi"])}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Isian label="Diajukan tanpa PIC" bantuan={galat.diajukanTanpaPicHari ? undefined : `Lebih dari sekian hari. Bawaan ${PENGATURAN_BAWAAN.ambangEskalasi.diajukanTanpaPicHari}.`}>
              <InputTeks id="diajukanTanpaPicHari" nilai={form.diajukanTanpaPicHari} galat={galat.diajukanTanpaPicHari} onUbah={(v) => ubah("diajukanTanpaPicHari", v)} inputMode="numeric" akhiran="hari" />
            </Isian>
            <Isian label="Revisi menggantung" bantuan={galat.revisiMenggantungHari ? undefined : `Pengaju belum merespons. Bawaan ${PENGATURAN_BAWAAN.ambangEskalasi.revisiMenggantungHari}.`}>
              <InputTeks id="revisiMenggantungHari" nilai={form.revisiMenggantungHari} galat={galat.revisiMenggantungHari} onUbah={(v) => ubah("revisiMenggantungHari", v)} inputMode="numeric" akhiran="hari" />
            </Isian>
          </div>
        </Bagian>

        <Bagian
          ikon={<Mail className="h-5 w-5" />}
          judul="Email dan kanal"
          sub="Alamat tujuan email untuk tim Legal, dan keterangan kanal lain."
          ubahan={beda("alamatGrupLegal") || beda("pengirimEmail") || beda("tautanTeams")}
          onKembalikan={() => kembalikan(["alamatGrupLegal", "pengirimEmail", "tautanTeams"])}
          pemakai={teksPemakai(["alamatGrupLegal"])}
        >
          <Isian label="Alamat grup Legal (opsional)" bantuan={galat.alamatGrupLegal ? undefined : "Bila diisi, semua email untuk tim Legal (pengajuan baru dari aplikasi, agenda pagi, pengingat, laporan bulanan) dikirim ke grup ini saja, bukan ke tiap anggota, supaya tidak ada salinan ganda. Kosongkan untuk mengirim ke tiap Legal dan Admin yang aktif. Email pribadi (penugasan, revisi) tetap ke orangnya."}>
            <InputTeks id="alamatGrupLegal" type="email" nilai={form.alamatGrupLegal} galat={galat.alamatGrupLegal} onUbah={(v) => ubah("alamatGrupLegal", v)} placeholder="legal@waskitainfrastruktur.co.id" />
          </Isian>
          <Isian label="Pengirim email (keterangan)" className="mt-4" bantuan={galat.pengirimEmail ? undefined : "Hanya catatan, mis. shared mailbox yang dipakai flow. Tidak dibaca flow mana pun, jadi mengubahnya di sini tidak mengubah pengirim."}>
            <InputTeks id="pengirimEmail" nilai={form.pengirimEmail} galat={galat.pengirimEmail} onUbah={(v) => ubah("pengirimEmail", v)} placeholder="wicon@waskitainfrastruktur.co.id" />
          </Isian>
          <Isian label="Tautan channel Teams Legal (opsional)" className="mt-4" bantuan={galat.tautanTeams ? undefined : "Disimpan untuk kartu Teams pengajuan baru bila nanti dibuat; saat ini belum dibaca flow mana pun. Salin dari menu channel, Dapatkan tautan."}>
            <InputTeks id="tautanTeams" type="url" nilai={form.tautanTeams} galat={galat.tautanTeams} onUbah={(v) => ubah("tautanTeams", v)} placeholder="https://teams.microsoft.com/l/channel/…" />
          </Isian>
        </Bagian>

        <Bagian
          ikon={<Hash className="h-5 w-5" />}
          judul="Format nomor kontrak"
          sub="Dasar usulan nomor saat kontrak ditandai sudah ditandatangani, dan peringatan format yang lunak (tidak memblokir)."
          ubahan={beda("formatPenomoran")}
          onKembalikan={() => kembalikan(["formatPenomoran"])}
          pemakai={teksPemakai(["formatPenomoran"])}
        >
          <IsianFormatNomor form={form} galat={galat} ubah={ubah} masihBawaan={!beda("formatPenomoran")} />
        </Bagian>

        <Bagian
          ikon={<Scale className="h-5 w-5" />}
          judul="Matriks kewenangan"
          sub="Rujukan siapa yang menyetujui dan menandatangani menurut nilai kontrak (rupiah). Tampil di modal Lanjut ke Tanda Tangan."
          ubahan={beda("matriksKewenangan")}
          onKembalikan={() => kembalikan(["matriksKewenangan"])}
          pemakai={teksPemakai(["matriksKewenangan"])}
        >
          <IsianMatriks form={form} galat={galat.matriks} ubah={ubah} masihBawaan={!beda("matriksKewenangan")} />
        </Bagian>
      </div>

      <KartuRekonsiliasi sesi={sesi} />

      {konteks.galat != null && (
        <p className="mt-5 flex items-center gap-2 text-xs text-muted">
          <AlarmClock className="h-3.5 w-3.5" aria-hidden="true" /> Sesi ini sempat gagal membaca pengaturan dan memakai nilai bawaan. Setelah menyimpan, nilai baru langsung dipakai.
        </p>
      )}

      <BilahSimpan tampil={kotor} jumlah={berubah.length} adaGalat={!!hasil && !hasil.ok && sudahCoba} menyimpan={menyimpan} bisaSimpan={bisaSimpan} onSimpan={simpan} onBatal={batalkan} />
    </div>
  );
}

/**
 * Mode uji email. Terpisah dari formulir utama karena efeknya langsung: begitu dimatikan, agenda pagi, laporan
 * bulanan, dan pengingat terkirim ke penerima sebenarnya pada jalan flow berikutnya.
 */
function KartuModeUji({ sesi }: { sesi: Sesi }) {
  const q = useMuat(ambilEmailUji, []);
  const [alamat, setAlamat] = useState("");
  const [proses, setProses] = useState(false);
  const aktif = !!q.data;

  useEffect(() => {
    if (q.data !== null) setAlamat(q.data || sesi.email);
  }, [q.data, sesi.email]);

  const ubah = async (baru: string) => {
    setProses(true);
    try {
      await simpanEmailUji(baru);
      try {
        await catatLogAdmin({ aksi: baru ? "Nyalakan mode uji email" : "Matikan mode uji email", sasaran: "emailUji", detail: { dari: q.data ?? "", ke: baru } }, sesi);
      } catch {
        toast.warning("Perubahan tersimpan, tetapi jejaknya belum tercatat di Log Admin.");
      }
      toast.success(baru ? `Mode uji menyala. Email terjadwal dialihkan ke ${baru}.` : "Mode uji mati. Email terjadwal dikirim ke penerima sebenarnya.", {
        description: "Berlaku pada jalan flow berikutnya.",
      });
      await q.muatUlang();
    } catch (err) {
      toast.error("Mode uji belum berubah.", { description: pesanError(err) });
    } finally {
      setProses(false);
    }
  };

  if (q.loading && q.data === null) return null;
  if (q.error && q.data === null) {
    return (
      <p className="mb-5 flex items-center gap-2 text-xs text-muted">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" /> Status mode uji email belum terbaca. Muat ulang halaman untuk mencoba lagi.
      </p>
    );
  }

  return (
    <section
      aria-label="Mode uji email"
      className={cx("kartu mb-5 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6", aktif && "border-accent bg-accent-soft")}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", aktif ? "bg-accent text-accent-on" : "bg-brand-soft text-brand-strong")} aria-hidden="true">
          <FlaskConical className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 font-bold">
            Mode uji email
            <Lencana nada={aktif ? "peringatan" : "sukses"}>{aktif ? "Menyala" : "Mati"}</Lencana>
          </h2>
          <p className={cx("mt-0.5 text-sm", aktif ? "text-accent-ink" : "text-muted")}>
            {aktif ? (
              <>
                Agenda pagi, laporan bulanan, pengingat, dan peringatan sistem saat ini hanya dikirim ke <span className="font-semibold">{q.data}</span> dengan subjek berawalan [UJI]. Matikan bila
                aplikasi sudah siap dipakai semua orang.
              </>
            ) : (
              "Email terjadwal dikirim ke penerima sebenarnya. Nyalakan untuk mengalihkan semuanya ke satu alamat saat menguji."
            )}
          </p>
          <p className="mt-1 text-xs text-muted">Email pengajuan dan perubahan status dari kotak keluar tidak ikut dialihkan.</p>
        </div>
      </div>
      {aktif ? (
        <Tombol varian="kedua" memuat={proses} onClick={() => void ubah("")}>
          Matikan mode uji
        </Tombol>
      ) : (
        <form
          className="flex w-full flex-wrap items-center gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            void ubah(alamat);
          }}
        >
          <label htmlFor="emailUji" className="sr-only">
            Alamat tujuan mode uji
          </label>
          <input id="emailUji" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} required className="input min-w-0 flex-1 sm:w-72" value={alamat} onChange={(e) => setAlamat(e.target.value)} placeholder="nama@waskitainfrastruktur.co.id" />
          <Tombol type="submit" varian="kedua" memuat={proses}>
            Nyalakan
          </Tombol>
        </form>
      )}
    </section>
  );
}

function Bagian({
  ikon,
  judul,
  sub,
  ubahan,
  onKembalikan,
  pemakai,
  children,
}: {
  ikon: ReactNode;
  judul: string;
  sub: string;
  ubahan: boolean;
  onKembalikan: () => void;
  /** Siapa yang membaca nilai di kartu ini (aplikasi saja atau juga flow). */
  pemakai?: string;
  children: ReactNode;
}) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_KELUAR }} className="kartu min-w-0 p-5 sm:p-6" aria-label={judul}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-strong" aria-hidden="true">
            {ikon}
          </span>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 font-bold">
              {judul}
              {ubahan && <Lencana nada="peringatan">Disesuaikan</Lencana>}
            </h2>
            <p className="mt-0.5 text-sm text-muted">{sub}</p>
            {pemakai && (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-muted">
                <Workflow className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {pemakai}
              </p>
            )}
          </div>
        </div>
        <Tombol varian="hantu" kecil ikon={<RotateCcw className="h-3.5 w-3.5" />} onClick={onKembalikan} aria-label={`Kembalikan ${judul} ke bawaan`}>
          Bawaan
        </Tombol>
      </div>
      {children}
    </motion.section>
  );
}

function InputTeks({
  id,
  nilai,
  galat,
  onUbah,
  placeholder,
  inputMode,
  type = "text",
  akhiran,
}: {
  id: string;
  nilai: string;
  galat?: string;
  onUbah: (v: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "text" | "email" | "url";
  type?: "text" | "email" | "url";
  akhiran?: string;
}) {
  return (
    <>
      <span className="relative block">
        <input
          id={id}
          type={type}
          className={cx("input", akhiran && "pr-14", galat && "border-danger")}
          value={nilai}
          placeholder={placeholder}
          inputMode={inputMode ?? (type === "email" ? "email" : type === "url" ? "url" : undefined)}
          autoComplete="off"
          autoCapitalize={type === "text" ? undefined : "none"}
          spellCheck={type === "text" ? undefined : false}
          onChange={(e) => onUbah(e.target.value)}
          aria-invalid={!!galat}
          aria-describedby={galat ? `${id}-galat` : undefined}
        />
        {akhiran && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted">{akhiran}</span>}
      </span>
      {galat && (
        <span id={`${id}-galat`} role="alert" className="mt-1 block text-xs text-danger">
          {galat}
        </span>
      )}
    </>
  );
}

/** Garis waktu kecil dari daftar H-sekian, supaya Admin melihat jarak antarpengingat. */
function PratinjauHari({ teks }: { teks: string }) {
  const angka = [...new Set(teks.split(/[\s,;]+/).filter((x) => /^\d+$/.test(x)).map(Number))].filter((n) => n <= 730).sort((a, b) => b - a);
  if (!angka.length) return null;
  const maks = Math.max(...angka, 1);
  return (
    <div className="mt-3" aria-hidden="true">
      <div className="relative mx-3 h-8">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        {angka.map((n) => (
          <span key={n} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${100 - (n / maks) * 100}%` }}>
            <span className={cx("block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold angka", n === 0 ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-strong")}>{n === 0 ? "Hari H" : `H-${n}`}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Sakelar({ aktif, onUbah, labelId }: { aktif: boolean; onUbah: (v: boolean) => void; labelId: string }) {
  const kurangiGerak = useReducedMotion();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={aktif}
      aria-labelledby={labelId}
      onClick={() => onUbah(!aktif)}
      className={cx("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft", aktif ? "border-brand bg-brand" : "border-line bg-surface")}
    >
      <motion.span layout={!kurangiGerak} transition={pegasLembut} className={cx("absolute h-5 w-5 rounded-full shadow-sm", aktif ? "right-1 bg-brand-on" : "left-1 bg-muted")} />
    </button>
  );
}

function BilahSimpan({ tampil, jumlah, adaGalat, menyimpan, bisaSimpan, onSimpan, onBatal }: { tampil: boolean; jumlah: number; adaGalat: boolean; menyimpan: boolean; bisaSimpan: boolean; onSimpan: () => void; onBatal: () => void }) {
  const kurangiGerak = useReducedMotion();
  return (
    <AnimatePresence>
      {tampil && (
        <motion.div
          initial={kurangiGerak ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={kurangiGerak ? { opacity: 0 } : { opacity: 0, y: 16, transition: { duration: 0.15 } }}
          transition={pegasLembut}
          className="fixed inset-x-0 bottom-0 z-30 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]"
        >
          <div role="region" aria-label="Simpan perubahan" className="kartu mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3 shadow-pop">
            <p className="min-w-0 text-sm" aria-live="polite">
              {adaGalat ? <span className="font-semibold text-danger">Ada isian yang perlu dibetulkan.</span> : jumlah > 0 ? <><span className="font-semibold">{jumlah} pengaturan</span> <span className="text-muted">berubah dan belum disimpan.</span></> : <span className="text-muted">Ada perubahan yang belum disimpan.</span>}
            </p>
            <div className="flex w-full gap-2 min-[480px]:w-auto">
              <Tombol varian="hantu" kecil className="flex-1 min-[480px]:flex-none" onClick={onBatal} disabled={menyimpan}>
                Batalkan
              </Tombol>
              <Tombol kecil className="flex-1 min-[480px]:flex-none" ikon={<Save className="h-3.5 w-3.5" />} memuat={menyimpan} disabled={!bisaSimpan} onClick={onSimpan}>
                Simpan perubahan
              </Tombol>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- Format nomor kontrak (U20) ------------------------------------------------------------------

const LABEL_JENIS_RINGKAS: Record<JenisKontrak, string> = {
  "Pengadaan Barang": "Pengadaan barang",
  "Pengadaan Jasa": "Pengadaan jasa",
  Sewa: "Sewa",
  "Kerja Sama": "Kerja sama",
  "MoU / Nota Kesepahaman": "MoU",
  "Kerahasiaan (NDA)": "NDA",
  "Addendum / Amandemen": "Addendum",
  Lainnya: "Lainnya",
};

/** Contoh nomor dari format yang sedang diisi, supaya Admin melihat hasilnya sebelum menyimpan. */
function contohNomor(format: FormatPenomoran, jenis: JenisKontrak): string {
  const k = { id: 0, jenis, divisi: "SCM" as const, kontrakIndukId: null, urutanAddendum: null, tanggalTandaTangan: hariIni() };
  return usulanNomorKontrak(k, [], format).nomor;
}

function IsianFormatNomor({
  form,
  galat,
  ubah,
  masihBawaan,
}: {
  form: FormPengaturan;
  galat: GalatForm;
  ubah: <K extends keyof FormPengaturan>(kunci: K, nilai: FormPengaturan[K]) => void;
  masihBawaan: boolean;
}) {
  const h = formatDariForm(form);
  const contoh = h.ok ? contohNomor(h.nilai, "Pengadaan Jasa") : "";
  const contohAdd = h.ok && contoh ? h.nilai.polaAddendum.replace(/\{induk\}/g, contoh).replace(/\{urutan\}/g, "1") : "";
  return (
    <>
      {masihBawaan && (
        <p className="mb-4 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-ink">
          <strong>Standar awal.</strong> Format resmi belum diputuskan Legal. Sesuaikan di sini setelah ada keputusan; tidak perlu mengubah kode.
        </p>
      )}
      <Isian label="Pola nomor" bantuan={galat.formatPola ? undefined : `Wajib memuat {urut}. Penanda lain: ${PENANDA_POLA.filter((p) => p !== "{urut}").join(" ")} ({romawi} = bulan Romawi).`}>
        <InputTeks id="formatPola" nilai={form.formatPola} galat={galat.formatPola} onUbah={(v) => ubah("formatPola", v)} placeholder="{kode}/{tahun}/{urut}" />
      </Isian>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Isian label="Panjang nomor urut" bantuan={galat.formatPanjangUrut ? undefined : `1 sampai 8. Bawaan ${PENGATURAN_BAWAAN.formatPenomoran.panjangUrut}.`}>
          <InputTeks id="formatPanjangUrut" nilai={form.formatPanjangUrut} galat={galat.formatPanjangUrut} onUbah={(v) => ubah("formatPanjangUrut", v)} inputMode="numeric" akhiran="digit" />
        </Isian>
        <div className="min-w-0">
          <span className="label">Nomor urut</span>
          <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-raised px-3.5 py-2">
            <p id="lbl-reset-tahunan" className="min-w-0 text-sm">
              {form.formatResetTahunan ? "Mulai dari 1 tiap tahun" : "Berlanjut terus"}
            </p>
            <Sakelar aktif={form.formatResetTahunan} labelId="lbl-reset-tahunan" onUbah={(v) => ubah("formatResetTahunan", v)} />
          </div>
        </div>
      </div>
      <Isian label="Pola nomor addendum" className="mt-4" bantuan={galat.formatPolaAddendum ? undefined : "Wajib memuat {induk} (nomor kontrak induk) dan {urutan} (addendum ke berapa)."}>
        <InputTeks id="formatPolaAddendum" nilai={form.formatPolaAddendum} galat={galat.formatPolaAddendum} onUbah={(v) => ubah("formatPolaAddendum", v)} placeholder="{induk}/ADD-{urutan}" />
      </Isian>
      <fieldset className="mt-4 min-w-0">
        <legend className="label">Kode per jenis kontrak</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {JENIS_KONTRAK.map((j) => (
            <label key={j} className="block min-w-0">
              <span className="mb-1 block truncate text-xs text-muted" title={j}>
                {LABEL_JENIS_RINGKAS[j]}
              </span>
              <input
                className={cx("input !py-2 font-mono", galat.formatKode && "border-danger")}
                value={form.formatKode[j]}
                maxLength={12}
                onChange={(e) => ubah("formatKode", { ...form.formatKode, [j]: e.target.value })}
                aria-invalid={!!galat.formatKode}
              />
            </label>
          ))}
        </div>
        <p role={galat.formatKode ? "alert" : undefined} className={cx("mt-1 text-xs", galat.formatKode ? "text-danger" : "text-muted")}>
          {galat.formatKode ?? "1-12 huruf, angka, atau tanda hubung. Dipakai di penanda {kode}; kosong berarti memakai bawaan."}
        </p>
      </fieldset>
      <div className="mt-4 rounded-2xl border border-line px-3.5 py-3 text-sm" aria-live="polite">
        {h.ok && contoh ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Contoh hasil</p>
            <p className="mt-1 break-all">
              Pengadaan jasa pertama tahun ini: <span className="font-mono font-semibold">{contoh}</span>
            </p>
            <p className="break-all text-muted">
              Addendum pertamanya: <span className="font-mono">{contohAdd}</span>
            </p>
          </>
        ) : (
          <p className="text-xs text-muted">Contoh nomor muncul setelah pola dan panjang nomor urut benar.</p>
        )}
      </div>
    </>
  );
}

// --- Matriks kewenangan (K01) --------------------------------------------------------------------

const MAKS_JENJANG_FORM = 8;
const fmtRupiah = new Intl.NumberFormat("id-ID");

/** Editor jenjang matriks: tiap jenjang satu kartu kecil supaya tetap nyaman dibaca di ponsel. */
function IsianMatriks({
  form,
  galat,
  ubah,
  masihBawaan,
}: {
  form: FormPengaturan;
  galat?: string;
  ubah: <K extends keyof FormPengaturan>(kunci: K, nilai: FormPengaturan[K]) => void;
  masihBawaan: boolean;
}) {
  const baris = form.matriks;
  const terakhir = baris.length - 1;
  const ubahBaris = (i: number, tambahan: Partial<BarisMatriksForm>) => ubah("matriks", baris.map((b, j) => (j === i ? { ...b, ...tambahan } : b)));
  const tambah = () => {
    // Jenjang baru disisipkan sebelum jenjang terakhir (yang selalu tanpa batas atas).
    const baru: BarisMatriksForm = { sampai: "", penyetuju: "", penandatangan: "" };
    ubah("matriks", baris.length === 0 ? [baru] : [...baris.slice(0, terakhir), baru, baris[terakhir]!]);
  };
  const hapus = (i: number) => {
    const sisa = baris.filter((_, j) => j !== i);
    // Bila jenjang terakhir yang dihapus, jenjang di depannya menjadi yang terakhir dan tanpa batas atas.
    ubah("matriks", i === terakhir && sisa.length ? [...sisa.slice(0, -1), { ...sisa[sisa.length - 1]!, sampai: "" }] : sisa);
  };
  const hasil = matriksDariForm(baris);
  return (
    <>
      <p className="mb-3 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-ink">
        <strong>{masihBawaan ? "Standar awal. " : ""}</strong>
        {masihBawaan ? "Matriks resmi WKI belum ditetapkan. " : ""}Ini rujukan dan pencatatan saja, bukan kontrol keras: aplikasi tidak menahan proses bila persetujuan belum dicatat. Hanya untuk kontrak rupiah.
      </p>
      <ol className="space-y-3">
        {baris.map((b, i) => {
          const sebelum = i > 0 ? baris[i - 1]!.sampai : "";
          const batasSebelum = sebelum ? bacaNilai(sebelum) : null;
          return (
            <li key={i} className="rounded-2xl border border-line p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Jenjang {i + 1}</p>
                <Tombol varian="hantu" kecil ikon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => hapus(i)} disabled={baris.length <= 1} aria-label={`Hapus jenjang ${i + 1}`}>
                  Hapus
                </Tombol>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 sm:col-span-2">
                  <label htmlFor={`mtx-sampai-${i}`} className="label">
                    Nilai kontrak sampai
                  </label>
                  {i === terakhir ? (
                    <p id={`mtx-sampai-${i}`} className="flex min-h-11 items-center rounded-xl bg-raised px-3.5 text-sm text-muted">
                      Tanpa batas atas{typeof batasSebelum === "number" && Number.isFinite(batasSebelum) ? ` (di atas Rp${fmtRupiah.format(batasSebelum)})` : ""}
                    </p>
                  ) : (
                    <span className="relative block">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">Rp</span>
                      <input id={`mtx-sampai-${i}`} className="input pl-10 angka" inputMode="numeric" value={b.sampai} placeholder="1.000.000.000" onChange={(e) => ubahBaris(i, { sampai: e.target.value })} />
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <label htmlFor={`mtx-setuju-${i}`} className="label">
                    Penyetuju
                  </label>
                  <input id={`mtx-setuju-${i}`} className="input" maxLength={120} value={b.penyetuju} onChange={(e) => ubahBaris(i, { penyetuju: e.target.value })} placeholder="mis. Direktur bidang terkait" />
                </div>
                <div className="min-w-0">
                  <label htmlFor={`mtx-ttd-${i}`} className="label">
                    Penandatangan
                  </label>
                  <input id={`mtx-ttd-${i}`} className="input" maxLength={120} value={b.penandatangan} onChange={(e) => ubahBaris(i, { penandatangan: e.target.value })} placeholder="mis. Direktur Utama" />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Tombol varian="kedua" kecil ikon={<Plus className="h-3.5 w-3.5" />} onClick={tambah} disabled={baris.length >= MAKS_JENJANG_FORM}>
          Tambah jenjang
        </Tombol>
        <span className="text-xs text-muted">Paling banyak {MAKS_JENJANG_FORM} jenjang. Jenjang terakhir selalu tanpa batas atas.</span>
      </div>
      {galat ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {galat}
        </p>
      ) : (
        !hasil.ok && (
          <p className="mt-2 text-xs text-muted" aria-live="polite">
            {hasil.galat}
          </p>
        )
      )}
    </>
  );
}

// --- Rekonsiliasi masa berlaku (U24) --------------------------------------------------------------

type TahapRekonsiliasi =
  | { jenis: "diam" }
  | { jenis: "memeriksa" }
  | { jenis: "konfirmasi"; selisih: SelisihBerakhirEfektif[]; diperiksa: number }
  | { jenis: "berjalan"; selesai: number; total: number };

/**
 * Isi atau perbaiki kolom BerakhirEfektif semua kontrak Aktif (data lama yang kosong, atau yang tertinggal karena
 * diubah langsung di SharePoint). Terpisah dari formulir karena langsung menulis ke list Kontrak.
 */
function KartuRekonsiliasi({ sesi }: { sesi: Sesi }) {
  const [tahap, setTahap] = useState<TahapRekonsiliasi>({ jenis: "diam" });
  const [terakhir, setTerakhir] = useState<HasilRekonsiliasi | null>(null);
  const sibuk = tahap.jenis === "memeriksa" || tahap.jenis === "berjalan";

  const periksa = async () => {
    setTahap({ jenis: "memeriksa" });
    try {
      const h = await periksaBerakhirEfektif();
      if (h.selisih.length === 0) {
        setTahap({ jenis: "diam" });
        setTerakhir({ diperiksa: h.diperiksa, diperbaiki: [], gagal: [] });
        umpanBalik.berhasil("Masa berlaku sudah rapi", { teks: `${h.diperiksa} kontrak Aktif diperiksa, tidak ada yang perlu diperbaiki.` });
        return;
      }
      setTahap({ jenis: "konfirmasi", selisih: h.selisih, diperiksa: h.diperiksa });
    } catch (err) {
      setTahap({ jenis: "diam" });
      umpanBalik.gagal(err, "Pemeriksaan belum berhasil");
    }
  };

  const jalankan = async () => {
    if (tahap.jenis !== "konfirmasi") return;
    setTahap({ jenis: "berjalan", selesai: 0, total: tahap.selisih.length });
    try {
      const h = await rekonsiliasiBerakhirEfektif((selesai, total) => setTahap({ jenis: "berjalan", selesai, total }));
      setTerakhir(h);
      setTahap({ jenis: "diam" });
      // Jejak untuk auditor: siapa merapikan apa, dari tanggal berapa ke berapa (paling banyak 50 baris).
      await catatLogAdmin(
        {
          aksi: "Rekonsiliasi masa berlaku",
          sasaran: "BerakhirEfektif",
          detail: { v: 1, diperiksa: h.diperiksa, gagal: h.gagal.length, ubah: h.diperbaiki.slice(0, 50).map((s) => ({ kolom: `BerakhirEfektif ${s.nomor}`, dari: s.dari ?? "", ke: s.ke ?? "" })) },
        },
        sesi,
      ).catch(() => umpanBalik.peringatan("Rekonsiliasi selesai, tetapi jejaknya belum tercatat di Log Admin."));
      if (h.gagal.length) {
        umpanBalik.peringatan(`${h.diperbaiki.length} kontrak dirapikan, ${h.gagal.length} gagal`, { teks: h.gagal.slice(0, 3).map((g) => `${g.nomor}: ${g.pesan}`).join("\n"), durasi: 12_000 });
      } else {
        umpanBalik.berhasil(`${h.diperbaiki.length} kontrak dirapikan`, { teks: "Flow Pengingat harian memakai tanggal baru pada jalan berikutnya." });
      }
    } catch (err) {
      setTahap({ jenis: "diam" });
      umpanBalik.gagal(err, "Rekonsiliasi belum berhasil");
    }
  };

  return (
    <section aria-label="Rekonsiliasi masa berlaku" className="kartu mt-5 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-strong" aria-hidden="true">
          <CalendarSync className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold">Rekonsiliasi masa berlaku</h2>
          <p className="mt-0.5 text-sm text-muted">
            Menghitung ulang tanggal berakhir efektif (dengan addendum yang berlaku) untuk semua kontrak Aktif, lalu memperbaiki yang kosong atau tidak cocok. Flow Pengingat harian membaca tanggal ini.
          </p>
          {terakhir && (
            <p className="mt-1 text-xs text-muted" role="status">
              Terakhir: {terakhir.diperiksa} kontrak diperiksa, {terakhir.diperbaiki.length} dirapikan{terakhir.gagal.length ? `, ${terakhir.gagal.length} gagal` : ""}.
            </p>
          )}
        </div>
      </div>
      <Tombol varian="kedua" memuat={sibuk} ikon={<CalendarSync className="h-4 w-4" />} onClick={() => void periksa()}>
        Periksa dan rapikan
      </Tombol>

      {(tahap.jenis === "konfirmasi" || tahap.jenis === "berjalan") && (
        <Modal judul="Rapikan masa berlaku" onTutup={() => setTahap((t) => (t.jenis === "berjalan" ? t : { jenis: "diam" }))}>
          {tahap.jenis === "konfirmasi" ? (
            <>
              <p className="text-sm">
                Dari {tahap.diperiksa} kontrak Aktif, <strong>{tahap.selisih.length}</strong> perlu dirapikan. Hanya kolom BerakhirEfektif yang ditulis; tanggal berakhir di kontrak tidak berubah.
              </p>
              <ul className="mt-3 max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line text-sm">
                {tahap.selisih.slice(0, 30).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                    <span className="min-w-0 break-all font-mono text-xs font-semibold">{s.nomor}</span>
                    <span className="text-xs text-muted">
                      {s.dari ? formatTanggal(s.dari) : "kosong"} <span aria-hidden="true">→</span>
                      <span className="sr-only"> menjadi </span> <span className="font-semibold text-ink">{formatTanggal(s.ke)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {tahap.selisih.length > 30 && <p className="mt-1 text-xs text-muted">...dan {tahap.selisih.length - 30} kontrak lainnya.</p>}
              <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent-ink">
                Kontrak yang tanggal berakhirnya sudah lewat bisa langsung menerima email &quot;masa berlaku sudah lewat&quot; pada jalan pengingat berikutnya. Nyalakan mode uji email dulu bila belum yakin.
              </p>
              <AksiModal>
                <Tombol varian="kedua" onClick={() => setTahap({ jenis: "diam" })}>
                  Batal
                </Tombol>
                <Tombol onClick={() => void jalankan()}>Rapikan {tahap.selisih.length} kontrak</Tombol>
              </AksiModal>
            </>
          ) : (
            <div role="status" aria-live="polite">
              <p className="text-sm">
                Merapikan {tahap.selesai} dari {tahap.total} kontrak…
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={tahap.total} aria-valuenow={tahap.selesai} aria-label="Kemajuan rekonsiliasi">
                <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${tahap.total ? (tahap.selesai / tahap.total) * 100 : 100}%` }} transition={{ duration: 0.2 }} />
              </div>
              <p className="mt-2 text-xs text-muted">Biarkan halaman ini terbuka sampai selesai.</p>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
