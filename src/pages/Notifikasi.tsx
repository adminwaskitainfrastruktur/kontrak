// Halaman Notifikasi (Ruang Admin, Legal/Admin): kotak keluar email dan pratinjau template.
// Aplikasi hanya menulis baris ke list "Notifikasi Kontrak"; pengiriman dikerjakan flow Power Automate,
// jadi halaman ini juga alat untuk memeriksa apakah flow berjalan (email lama berstatus Antri = flow macet).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Clock3, Eye, Inbox, Mail, Monitor, RefreshCw, Search, Send, Smartphone, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useRuang } from "../context/RuangContext";
import { useSesi } from "../context/SesiContext";
import { useMuat } from "../hooks/useMuat";
import { adalahLegal } from "../lib/alur";
import { antreanLegal, posisiAntrean } from "../lib/antrean";
import { emailAntreanBergerak, emailDitugaskan, emailKonfirmasiPengaju, emailPengajuanBaruLegal, emailStatusBerubah, type IsiEmail } from "../lib/email";
import { formatMasukRingkas, formatRelatif, formatWaktu } from "../lib/format";
import { EASE_KELUAR, pegasLembut } from "../lib/gerak";
import { pesanError } from "../lib/graph";
import { aturanIngatkan, emailPengingat, emailSebutan, sesiSemu } from "../lib/mention";
import type { Kontrak, Status } from "../lib/types";
import { ambilSemuaKontrak } from "../services/kontrak";
import { ambilIsiEmail, ambilKotakKeluar, antrikanEmail, type EmailTerantri, type StatusKirim } from "../services/notifikasi";
import { KepalaHalaman, Kosong, KotakError, Memuat, Modal, Segmen, Tombol, cx } from "../components/ui";

type Tab = "keluar" | "pratinjau";
type SaringStatus = "Semua" | StatusKirim;

const MUAT_ULANG_MS = 30_000;
/** Email yang masih Antri lebih lama dari ini menandakan flow tidak berjalan. */
const ANTRI_MACET_MS = 15 * 60_000;

export default function Notifikasi() {
  const { sesi } = useSesi();
  const [tab, setTab] = useState<Tab>("keluar");
  const kotak = useMuat(() => ambilKotakKeluar(150), []);

  if (!adalahLegal(sesi)) {
    return <Kosong judul="Halaman ini khusus Legal dan Admin" teks="Kotak keluar berisi email untuk banyak orang, jadi hanya tim Legal dan Admin yang bisa membukanya." ikon={<Mail className="h-6 w-6" />} />;
  }

  return (
    <div>
      <KepalaHalaman
        judul="Notifikasi"
        sub="Email dari aplikasi diantrikan di sini, lalu dikirim lewat Outlook oleh Power Automate. Biasanya sampai dalam beberapa menit, kadang sedikit lebih lama."
        aksi={
          <Segmen<Tab>
            id="tab-notifikasi"
            label="Bagian halaman notifikasi"
            nilai={tab}
            onUbah={setTab}
            pilihan={[
              { nilai: "keluar", label: "Kotak Keluar", ikon: <Inbox className="h-4 w-4" aria-hidden="true" /> },
              { nilai: "pratinjau", label: "Pratinjau", ikon: <Eye className="h-4 w-4" aria-hidden="true" /> },
            ]}
          />
        }
      />
      {tab === "keluar" ? <KotakKeluar q={kotak} /> : <Pratinjau onTerkirim={() => { setTab("keluar"); void kotak.muatUlang(); }} />}
    </div>
  );
}

// --- Kotak keluar ------------------------------------------------------------------------------

const GAYA_STATUS: Record<StatusKirim, { kelas: string; ikon: typeof Clock3 }> = {
  Antri: { kelas: "bg-accent-soft text-accent-ink", ikon: Clock3 },
  Terkirim: { kelas: "bg-success-soft text-success", ikon: CheckCircle2 },
  Gagal: { kelas: "bg-danger-soft text-danger", ikon: XCircle },
};

function LencanaKirim({ status }: { status: StatusKirim }) {
  const g = GAYA_STATUS[status];
  const Ikon = g.ikon;
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", g.kelas)}>
      <Ikon className="h-3.5 w-3.5" aria-hidden="true" />
      {status}
    </span>
  );
}

/** "andi.s +2" untuk daftar; alamat lengkap ada di atribut title dan di rincian. */
function singkatPenerima(daftar: string[]): string {
  if (!daftar.length) return "-";
  const pertama = daftar[0]!.split("@")[0] ?? daftar[0]!;
  return daftar.length > 1 ? `${pertama} +${daftar.length - 1}` : pertama;
}

function KotakKeluar({ q }: { q: ReturnType<typeof useMuat<EmailTerantri[]>> }) {
  const { ke } = useRuang();
  const [saring, setSaring] = useState<SaringStatus>("Semua");
  const [cari, setCari] = useState("");
  const [buka, setBuka] = useState<EmailTerantri | null>(null);
  const [terakhir, setTerakhir] = useState(() => Date.now());
  const { muatUlang } = q;

  const segarkan = useCallback(async () => {
    await muatUlang();
    setTerakhir(Date.now());
  }, [muatUlang]);

  // Muat ulang otomatis tiap 30 detik, dijeda saat tab peramban tidak terlihat.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void segarkan();
    }, MUAT_ULANG_MS);
    const saatTerlihat = () => document.visibilityState === "visible" && void segarkan();
    document.addEventListener("visibilitychange", saatTerlihat);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", saatTerlihat);
    };
  }, [segarkan]);

  const data = useMemo(() => q.data ?? [], [q.data]);
  const kini = terakhir;
  const hitung = useMemo(() => {
    const h: Record<StatusKirim, number> = { Antri: 0, Terkirim: 0, Gagal: 0 };
    for (const e of data) h[e.status]++;
    return h;
  }, [data]);
  const macet = useMemo(() => data.filter((e) => e.status === "Antri" && kini - Date.parse(e.dibuat) > ANTRI_MACET_MS), [data, kini]);

  const tampil = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    return data.filter((e) => (saring === "Semua" || e.status === saring) && (!kata || [e.subjek, e.jenis, ...e.penerima, ...e.cc].some((x) => x.toLowerCase().includes(kata))));
  }, [data, saring, cari]);

  if (q.loading && !q.data) return <Memuat teks="Membuka kotak keluar…" />;
  if (q.error && !q.data) return <KotakError error={q.error} ulangi={() => void segarkan()} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {(["Antri", "Terkirim", "Gagal"] as const).map((s) => {
          const g = GAYA_STATUS[s];
          const Ikon = g.ikon;
          const aktif = saring === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={aktif}
              onClick={() => setSaring(aktif ? "Semua" : s)}
              className={cx("kartu kartu-hover min-w-0 p-3 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft sm:p-4", aktif && "border-brand")}
            >
              <span className={cx("mb-2 inline-grid h-8 w-8 place-items-center rounded-lg", g.kelas)} aria-hidden="true">
                <Ikon className="h-4 w-4" />
              </span>
              <span className="block text-2xl font-bold angka">{hitung[s]}</span>
              <span className="block text-xs leading-tight text-muted">{s === "Antri" ? "Menunggu dikirim" : s === "Terkirim" ? "Sudah terkirim" : "Gagal terkirim"}</span>
            </button>
          );
        })}
      </div>

      {macet.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-line bg-accent-soft p-4 text-sm text-accent-ink">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            <span className="font-semibold">{macet.length} email sudah antri lebih dari 15 menit.</span> Kemungkinan flow Power Automate sedang berhenti atau koneksinya kedaluwarsa. Minta pemilik flow memeriksa riwayat jalannya.
          </p>
        </div>
      )}

      <section className="kartu min-w-0 overflow-hidden" aria-label="Daftar email di kotak keluar">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">Cari email</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input type="search" enterKeyHint="search" autoComplete="off" className="input pl-9" placeholder="Cari subjek, penerima, atau jenis…" value={cari} onChange={(e) => setCari(e.target.value)} />
          </label>
          <label className="min-w-0">
            <span className="sr-only">Saring status</span>
            <select className="input w-auto" value={saring} onChange={(e) => setSaring(e.target.value as SaringStatus)}>
              <option value="Semua">Semua status</option>
              <option value="Antri">Antri</option>
              <option value="Terkirim">Terkirim</option>
              <option value="Gagal">Gagal</option>
            </select>
          </label>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted">
            <span aria-live="polite">Diperbarui {formatRelatif(new Date(terakhir).toISOString())}</span>
            <button type="button" onClick={() => void segarkan()} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label="Muat ulang kotak keluar" title="Muat ulang sekarang">
              <RefreshCw className={cx("h-4 w-4", q.loading && "animate-spin")} aria-hidden="true" />
            </button>
          </div>
        </div>

        {q.error != null && <p className="border-b border-line bg-danger-soft px-5 py-2 text-xs text-danger">Pembaruan terakhir gagal: {pesanError(q.error)}. Daftar di bawah dari muatan sebelumnya.</p>}

        {!tampil.length ? (
          <Kosong
            judul={data.length ? "Tidak ada yang cocok" : "Kotak keluar masih kosong"}
            teks={data.length ? "Coba kata kunci lain atau ganti saringan status." : "Begitu ada pengajuan atau perubahan status, emailnya muncul di sini."}
          />
        ) : (
          <>
            {/* Ponsel: kartu */}
            <ul className="divide-y divide-line md:hidden">
              {tampil.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => setBuka(e)} className="block w-full px-4 py-3.5 text-left hover:bg-raised focus-visible:bg-raised focus-visible:outline-none">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{e.subjek || "(tanpa subjek)"}</p>
                      <LencanaKirim status={e.status} />
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">
                      {e.jenis} · ke {singkatPenerima(e.penerima)} · {formatRelatif(e.dibuat)}
                    </p>
                    {e.status === "Gagal" && e.galat && <p className="mt-1 line-clamp-2 text-xs text-danger">{e.galat}</p>}
                  </button>
                </li>
              ))}
            </ul>

            {/* Layar lebar: tabel */}
            <div className="hidden overflow-x-auto md:block">
              <table className="tabel w-full">
                <thead>
                  <tr>
                    <th scope="col">Status</th>
                    <th scope="col">Subjek</th>
                    <th scope="col">Penerima</th>
                    <th scope="col">Jenis</th>
                    <th scope="col">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {tampil.map((e) => (
                    <tr key={e.id} className="cursor-pointer hover:bg-raised" onClick={() => setBuka(e)}>
                      <td>
                        <LencanaKirim status={e.status} />
                      </td>
                      <td className="max-w-[26rem]">
                        <button type="button" onClick={(ev) => { ev.stopPropagation(); setBuka(e); }} className="block max-w-full truncate rounded text-left font-semibold hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft [@media(pointer:coarse)]:min-h-11">
                          {e.subjek || "(tanpa subjek)"}
                        </button>
                        {e.status === "Gagal" && e.galat && <p className="mt-0.5 truncate text-xs text-danger" title={e.galat}>{e.galat}</p>}
                      </td>
                      <td className="whitespace-nowrap text-muted" title={[...e.penerima, ...e.cc.map((c) => `cc: ${c}`)].join("\n")}>
                        {singkatPenerima(e.penerima)}
                      </td>
                      <td className="whitespace-nowrap text-muted">{e.jenis}</td>
                      <td className="whitespace-nowrap text-muted" title={formatWaktu(e.dibuat)}>
                        {formatRelatif(e.dibuat)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Menampilkan {tampil.length} dari {data.length} email terbaru. Daftar diperbarui otomatis tiap 30 detik.
        </p>
      </section>

      {buka && <RincianEmail email={buka} onTutup={() => setBuka(null)} tautanKontrak={buka.kontrakId ? ke.detail(buka.kontrakId) : null} />}
    </div>
  );
}

function RincianEmail({ email, onTutup, tautanKontrak }: { email: EmailTerantri; onTutup: () => void; tautanKontrak: string | null }) {
  const isi = useMuat(() => ambilIsiEmail(email.id), [email.id]);
  return (
    <Modal judul="Rincian email" onTutup={onTutup} lebar="max-w-3xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="min-w-0 flex-1 break-words font-semibold">{email.subjek || "(tanpa subjek)"}</p>
          <LencanaKirim status={email.status} />
        </div>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-muted">Penerima</dt>
          <dd className="min-w-0 break-all">{email.penerima.join(", ") || "-"}</dd>
          {email.cc.length > 0 && (
            <>
              <dt className="text-muted">Cc</dt>
              <dd className="min-w-0 break-all">{email.cc.join(", ")}</dd>
            </>
          )}
          <dt className="text-muted">Jenis</dt>
          <dd>{email.jenis}</dd>
          <dt className="text-muted">Diantrikan</dt>
          <dd>{formatMasukRingkas(email.dibuat)}</dd>
          {email.dikirimPada && (
            <>
              <dt className="text-muted">Dikirim</dt>
              <dd>{formatMasukRingkas(email.dikirimPada)}</dd>
            </>
          )}
          {tautanKontrak && (
            <>
              <dt className="text-muted">Kontrak</dt>
              <dd>
                <Link to={tautanKontrak} className="inline-flex min-h-[44px] items-center font-semibold text-brand hover:underline" onClick={onTutup}>
                  Buka kontrak
                </Link>
              </dd>
            </>
          )}
        </dl>
        {email.status === "Gagal" && (
          <div className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
            <p className="font-semibold">Alasan gagal</p>
            <p className="mt-0.5 break-words">{email.galat || "Flow tidak mencatat alasannya."}</p>
          </div>
        )}
        {isi.loading && !isi.data ? <Memuat teks="Memuat isi email…" /> : isi.error ? <KotakError error={isi.error} ulangi={() => void isi.muatUlang()} /> : <BingkaiEmail html={isi.data ?? ""} lebar={640} judul={`Isi email: ${email.subjek}`} />}
      </div>
    </Modal>
  );
}

// --- Pratinjau ---------------------------------------------------------------------------------

type JenisPratinjau = "pengajuanBaru" | "konfirmasi" | "statusPengaju" | "statusLegal" | "antrean" | "ditugaskan" | "pengingat" | "sebutan";

const DAFTAR_PRATINJAU: { nilai: JenisPratinjau; label: string; untuk: string }[] = [
  { nilai: "pengajuanBaru", label: "Pengajuan baru", untuk: "Tim Legal" },
  { nilai: "konfirmasi", label: "Konfirmasi pengajuan", untuk: "Pengaju" },
  { nilai: "statusPengaju", label: "Status berubah", untuk: "Pengaju" },
  { nilai: "statusLegal", label: "Revisi dikirim ulang / dibatalkan", untuk: "PIC Legal" },
  { nilai: "antrean", label: "Antrean bergerak", untuk: "Pengaju" },
  { nilai: "ditugaskan", label: "Penugasan PIC", untuk: "PIC Legal" },
  { nilai: "pengingat", label: "Pengingat / tanyakan progres", untuk: "Pengaju atau Legal" },
  { nilai: "sebutan", label: "Disebut di diskusi", untuk: "Orang yang disebut" },
];

/** Status sebelumnya yang masuk akal untuk contoh email "status berubah". */
const DARI_CONTOH: Partial<Record<Status, Status>> = {
  "Review Legal": "Diajukan",
  "Perlu Revisi": "Review Legal",
  "Proses Tanda Tangan": "Review Legal",
  Aktif: "Proses Tanda Tangan",
  Ditolak: "Review Legal",
  Dibatalkan: "Diajukan",
  Berakhir: "Aktif",
};

function buatContoh(jenis: JenisPratinjau, k: Kontrak, semua: Kontrak[], olehNama: string): IsiEmail {
  // Untuk email yang bergantung pada antrean, kontrak contoh diperlakukan seolah sedang antri.
  const sebagaiAntri = (): { k: Kontrak; antrean: Kontrak[] } => {
    const kk = k.status === "Diajukan" ? k : { ...k, status: "Diajukan" as Status };
    const dasar = semua.some((x) => x.id === k.id) ? semua.map((x) => (x.id === k.id ? kk : x)) : [...semua, kk];
    return { k: kk, antrean: antreanLegal(dasar) };
  };
  switch (jenis) {
    case "pengajuanBaru": {
      const a = sebagaiAntri();
      return emailPengajuanBaruLegal(a.k, a.antrean);
    }
    case "konfirmasi": {
      const a = sebagaiAntri();
      return emailKonfirmasiPengaju(a.k, a.antrean);
    }
    case "statusPengaju": {
      const ke: Status = k.status === "Diajukan" ? "Review Legal" : k.status;
      const kk = { ...k, status: ke };
      return emailStatusBerubah(kk, DARI_CONTOH[ke] ?? "Diajukan", ke === "Perlu Revisi" ? "Mohon lengkapi lampiran penawaran harga dan perbaiki pasal 7 tentang denda keterlambatan." : "", olehNama, antreanLegal(semua), "pengaju");
    }
    case "statusLegal": {
      const kk = { ...k, status: "Review Legal" as Status };
      return emailStatusBerubah(kk, "Perlu Revisi", "Lampiran penawaran sudah ditambahkan dan pasal 7 sudah diperbaiki.", k.pengajuNama || olehNama, antreanLegal(semua), "legal");
    }
    case "antrean": {
      const a = sebagaiAntri();
      const baru = posisiAntrean(a.k, a.antrean) ?? 1;
      return emailAntreanBergerak(a.k, baru + 1, baru, a.antrean);
    }
    case "ditugaskan":
      return emailDitugaskan(k, olehNama);
    case "pengingat": {
      const kk = k.status === "Perlu Revisi" || k.status === "Diajukan" || k.status === "Review Legal" ? k : { ...k, status: "Perlu Revisi" as Status };
      const legal = kk.status === "Perlu Revisi";
      const aturan = legal
        ? aturanIngatkan(kk, { email: "", nama: olehNama, peran: "Legal", divisi: "Legal", penggunaId: null })
        : aturanIngatkan(kk, sesiSemu({ id: 0, nama: kk.pengajuNama, email: kk.pengajuEmail, peran: "Pengaju", divisi: kk.divisi, aktif: true }));
      return emailPengingat(kk, legal ? olehNama : kk.pengajuNama, aturan ?? { arah: "legal-ke-pengaju", label: "", keterangan: "" }, legal ? "Mohon dikirim ulang paling lambat Jumat ya." : "");
    }
    case "sebutan":
      return emailSebutan(k, olehNama, `Halo, mohon dicek pasal 5 soal jaminan pelaksanaan. Apakah nilainya sudah sesuai penawaran?`, "pengaju");
  }
}

function Pratinjau({ onTerkirim }: { onTerkirim: () => void }) {
  const { sesi } = useSesi();
  const q = useMuat(ambilSemuaKontrak, []);
  const [jenis, setJenis] = useState<JenisPratinjau>("pengajuanBaru");
  const [idKontrak, setIdKontrak] = useState<number | null>(null);
  const [layar, setLayar] = useState<"desktop" | "ponsel">("desktop");
  const [mengirim, setMengirim] = useState(false);

  const semua = useMemo(() => q.data ?? [], [q.data]);
  const urut = useMemo(() => [...semua].sort((a, b) => b.dibuat.localeCompare(a.dibuat)), [semua]);
  const k = useMemo(() => urut.find((x) => x.id === idKontrak) ?? urut[0] ?? null, [urut, idKontrak]);
  const contoh = useMemo(() => {
    if (!k) return null;
    try {
      return { ok: true as const, isi: buatContoh(jenis, k, semua, sesi.nama) };
    } catch (err) {
      return { ok: false as const, galat: pesanError(err) };
    }
  }, [jenis, k, semua, sesi.nama]);

  if (q.loading && !q.data) return <Memuat teks="Mengambil daftar kontrak untuk contoh…" />;
  if (q.error && !q.data) return <KotakError error={q.error} ulangi={() => void q.muatUlang()} />;
  if (!k) return <Kosong judul="Belum ada kontrak untuk contoh" teks="Pratinjau memakai data kontrak sungguhan. Ajukan satu kontrak dulu, lalu kembali ke sini." />;

  const kirimContoh = async () => {
    if (!contoh?.ok) return;
    setMengirim(true);
    try {
      await antrikanEmail({ penerima: [sesi.email], subjek: `[CONTOH] ${contoh.isi.subjek}`, html: contoh.isi.html, jenis: "Lainnya", kontrakId: k.id });
      toast.success("Contoh sudah masuk antrean", { description: `Power Automate akan mengirimnya ke ${sesi.email}. Biasanya tiba dalam beberapa menit.` });
      onTerkirim();
    } catch (err) {
      toast.error("Contoh belum bisa diantrikan", { description: pesanError(err) });
    } finally {
      setMengirim(false);
    }
  };

  const pilihan = DAFTAR_PRATINJAU.find((p) => p.nilai === jenis)!;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <aside className="kartu min-w-0 space-y-4 self-start p-5" aria-label="Pilihan pratinjau">
        <div>
          <label htmlFor="jenis-email" className="label">
            Jenis email
          </label>
          <select id="jenis-email" className="input" value={jenis} onChange={(e) => setJenis(e.target.value as JenisPratinjau)}>
            {DAFTAR_PRATINJAU.map((p) => (
              <option key={p.nilai} value={p.nilai}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Biasanya dikirim ke: {pilihan.untuk}</p>
        </div>
        <div>
          <label htmlFor="kontrak-contoh" className="label">
            Kontrak contoh
          </label>
          <select id="kontrak-contoh" className="input" value={k.id} onChange={(e) => setIdKontrak(Number(e.target.value))}>
            {urut.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nomorPengajuan} · {x.judul.length > 48 ? `${x.judul.slice(0, 48)}…` : x.judul}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Status kontrak ini: {k.status}. Bila perlu, contoh menyesuaikan status agar emailnya masuk akal.</p>
        </div>

        <div className="rounded-2xl bg-info-soft p-3.5 text-xs text-info">
          <p className="font-semibold">Bagaimana email dikirim?</p>
          <p className="mt-1 leading-relaxed">Aplikasi menaruh email di kotak keluar. Flow Power Automate mengambilnya dan mengirim lewat Outlook, jadi bisa tertunda beberapa menit. Statusnya bisa dipantau di tab Kotak Keluar.</p>
        </div>

        <Tombol className="w-full" ikon={<Send className="h-4 w-4" />} memuat={mengirim} disabled={!contoh?.ok} onClick={kirimContoh}>
          Kirim contoh ke saya
        </Tombol>
        <p className="-mt-2 text-center text-xs text-muted">Hanya ke {sesi.email}, subjek diawali [CONTOH].</p>
      </aside>

      <section className="min-w-0 space-y-3" aria-label="Pratinjau email">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Subjek</p>
            <p className="break-words font-semibold">{contoh?.ok ? contoh.isi.subjek : "-"}</p>
          </div>
          <Segmen<"desktop" | "ponsel">
            id="layar-pratinjau"
            label="Ukuran layar pratinjau"
            nilai={layar}
            onUbah={setLayar}
            pilihan={[
              { nilai: "desktop", label: "Desktop", ikon: <Monitor className="h-4 w-4" aria-hidden="true" /> },
              { nilai: "ponsel", label: "Ponsel", ikon: <Smartphone className="h-4 w-4" aria-hidden="true" /> },
            ]}
          />
        </div>
        {contoh && !contoh.ok ? (
          <KotakError error={new Error(contoh.galat)} />
        ) : (
          contoh && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={`${layar}-${jenis}-${k.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.3, ease: EASE_KELUAR }}>
                <BingkaiEmail html={contoh.isi.html} lebar={layar === "desktop" ? 640 : 390} judul={`Pratinjau email ${pilihan.label}`} ponsel={layar === "ponsel"} />
              </motion.div>
            </AnimatePresence>
          )
        )}
      </section>
    </div>
  );
}

/**
 * Menampilkan HTML email dalam iframe bersandbox: skrip tidak dijalankan. allow-same-origin dibutuhkan
 * hanya supaya tinggi bingkai bisa disesuaikan dengan isi; tanpa allow-scripts, isi tetap pasif.
 */
function BingkaiEmail({ html, lebar, judul, ponsel }: { html: string; lebar: number; judul: string; ponsel?: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [tinggi, setTinggi] = useState(640);
  const kurangiGerak = useReducedMotion();

  const ukur = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (doc?.documentElement) setTinggi(Math.min(4000, Math.max(320, doc.documentElement.scrollHeight + 4)));
  }, []);

  useEffect(() => {
    // Ukur ulang saat lebar berubah, setelah tata letak di dalam bingkai selesai.
    const t = window.setTimeout(ukur, 60);
    return () => window.clearTimeout(t);
  }, [lebar, html, ukur]);

  if (!html.trim()) return <Kosong judul="Isi email kosong" teks="Baris ini tidak menyimpan isi HTML." />;

  return (
    <div className="overflow-x-auto rounded-[22px] border border-line bg-raised p-3 sm:p-5">
      <motion.div
        layout={!kurangiGerak}
        transition={pegasLembut}
        style={{ width: lebar, maxWidth: "100%" }}
        className={cx("mx-auto overflow-hidden bg-surface shadow-card", ponsel ? "rounded-[28px] border-[6px] border-line" : "rounded-xl border border-line")}
      >
        <iframe ref={ref} title={judul} srcDoc={html} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" onLoad={ukur} style={{ width: "100%", height: tinggi, border: 0, display: "block" }} />
      </motion.div>
      <p className="mt-2 text-center text-xs text-muted">Lebar {lebar} px, mengecil mengikuti layar Anda. Outlook desktop bisa sedikit berbeda (sudut tidak membulat).</p>
    </div>
  );
}

