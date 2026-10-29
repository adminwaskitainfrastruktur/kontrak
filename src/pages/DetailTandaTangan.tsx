// Halaman tanda tangan satu kontrak: status, penandatangan, tanda tangan Anda, dan (untuk Legal) pembuatan permintaan,
// pencatatan pihak luar, pengingat, pembatalan, dan pindaian tanda tangan basah. Dibuka dari tautan email, jadi
// penandatangan yang bukan pengaju atau Legal kontrak itu pun bisa masuk: yang menentukan apa yang tampak adalah
// keterlibatan akun (bolehAksi), bukan akses ke halaman detail kontrak.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BellRing, Check, ChevronDown, ChevronUp, Eye, FileCheck2, FilePlus2, FileText, Plus, RefreshCw, ScrollText, ShieldCheck, Signature, Trash2, Undo2, Upload, UserPlus, X } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { useMuat } from "../hooks/useMuat";
import { terapkanPermintaan } from "../hooks/useTtdSaya";
import { formatMasuk, formatMasukRingkas } from "../lib/format";
import { pesanError } from "../lib/graph";
import { urlDariPng } from "../lib/gambarTtd";
import {
  BATAS_PENANDATANGAN,
  bolehAksi,
  langkahUntukSaya,
  masihBerjalan,
  periksaPenandatangan,
  ringkasPermintaan,
  sedangGiliran,
  statusPermintaan,
  sudahTtd,
  tahapan,
  type MasukanPenandatangan,
  type Penandatangan,
  type PermintaanTtd,
  type StatusTtd,
} from "../lib/penandatangan";
import { ringkasSha256 } from "../lib/ttd";
import { teksUkuran } from "../lib/jenisBerkas";
import { umpanBalik } from "../lib/umpanBalik";
import type { Dokumen, Kontrak } from "../lib/types";
import { ambilDokumen, type DokumenSP } from "../services/dokumen";
import { ambilKontrak } from "../services/kontrak";
import { ambilSemuaPengguna } from "../services/pengguna";
import {
  ambilGambarTtd,
  ambilPermintaan,
  ambilTtdTersimpan,
  batalkanPermintaan,
  bisaDitandatangani,
  buatPermintaan,
  catatPihakLuar,
  hapusTtdTersimpan,
  ingatkanPenandatangan,
  pelakuDari,
  simpanTtdTersimpan,
  susunPdfFinal,
  tandatangani,
  tolakPermintaan,
  unggahPindaian,
  type HasilAksiTtd,
  type TtdTersimpan,
} from "../services/tandaTangan";
import PilihTtd, { type PilihTtdRef } from "../components/PilihTtd";
import PratinjauDokumen from "../components/PratinjauDokumen";
import { AksiModal, Field, Item, KepalaHalaman, Kontainer, KotakError, KerangkaHalaman, Lencana, Modal, Tombol, cx } from "../components/ui";

const NADA_STATUS: Record<StatusTtd, "netral" | "peringatan" | "bahaya" | "sukses"> = {
  Menunggu: "peringatan",
  Sebagian: "peringatan",
  Selesai: "sukses",
  Ditolak: "bahaya",
  Dibatalkan: "netral",
};
export const LencanaTtd = ({ status }: { status: StatusTtd }) => <Lencana nada={NADA_STATUS[status]}>{status === "Sebagian" ? "Sebagian ditandatangani" : status === "Menunggu" ? "Menunggu tanda tangan" : status}</Lencana>;

const Kartu = ({ judul, ikon, aksi, children, className }: { judul: string; ikon?: ReactNode; aksi?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={cx("kartu p-4 sm:p-5", className)}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-bold">
        {ikon}
        {judul}
      </h2>
      {aksi}
    </div>
    {children}
  </section>
);

// --- Dialog alasan (tolak dan batal) ---------------------------------------------------------------------

function ModalAlasan({ judul, label, bantuan, tombol, onKirim, onTutup }: { judul: string; label: string; bantuan: string; tombol: string; onKirim: (alasan: string) => Promise<void>; onTutup: () => void }) {
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");
  const kirim = async () => {
    setSibuk(true);
    setGalat("");
    try {
      await onKirim(alasan);
      onTutup();
    } catch (err) {
      setGalat(pesanError(err));
      setSibuk(false);
    }
  };
  return (
    <Modal judul={judul} onTutup={onTutup} lebar="max-w-md">
      <Field label={label} wajib bantuan={bantuan} galat={galat}>
        <textarea className="input min-h-24" rows={3} value={alasan} onChange={(e) => setAlasan(e.target.value)} disabled={sibuk} data-fokus-awal />
      </Field>
      <AksiModal>
        <Tombol type="button" varian="kedua" onClick={onTutup} disabled={sibuk}>
          Kembali
        </Tombol>
        <Tombol type="button" varian="bahaya" memuat={sibuk} disabled={alasan.trim().length < 5} onClick={() => void kirim()}>
          {tombol}
        </Tombol>
      </AksiModal>
    </Modal>
  );
}

// --- Kartu penandatangan ---------------------------------------------------------------------------------

function KartuPenandatangan({ p, nomor, giliran, saya }: { p: Penandatangan; nomor: number; giliran: boolean; saya: boolean }) {
  const [gambar, setGambar] = useState<string | null>(null);
  const sah = sudahTtd(p);
  useEffect(() => {
    if (!sah || !p.berkasTtd) return undefined;
    let url = "";
    let batal = false;
    void ambilGambarTtd(p).then(async (blob) => {
      if (!blob || batal) return;
      url = urlDariPng(new Uint8Array(await blob.arrayBuffer()));
      setGambar(url);
    });
    return () => {
      batal = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [sah, p]);
  return (
    <li className={cx("rounded-2xl border p-4", sah ? "border-success/50 bg-success-soft/40" : giliran ? "border-accent bg-accent-soft/40" : "border-line bg-surface")}>
      <p className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-raised text-[11px] text-ink">{nomor}</span>
        {p.peran}
        {saya && <Lencana nada="sukses">Anda</Lencana>}
        {p.luar && <Lencana>Pihak luar</Lencana>}
      </p>
      <p className="teks-panjang mt-1 font-bold">{p.nama}</p>
      {p.jabatan && <p className="teks-panjang text-sm text-muted">{p.jabatan}</p>}
      {!p.luar && p.email && <p className="teks-panjang text-xs text-muted">{p.email}</p>}
      <div className="mt-3 grid h-24 place-items-center rounded-xl border border-line bg-white">
        {sah ? gambar ? <img src={gambar} alt={`Tanda tangan ${p.nama}`} className="max-h-20 max-w-full object-contain" /> : <span className="text-xs text-slate-400">memuat gambar…</span> : <span className="text-xs text-slate-400">{giliran ? "menunggu giliran ini" : "belum menandatangani"}</span>}
      </div>
      <p className={cx("mt-2 text-xs", sah ? "font-semibold text-success" : "text-muted")}>
        {sah ? `Ditandatangani ${formatMasukRingkas(p.waktu)}${p.luar && p.dicatatOleh ? ` · dicatat ${p.dicatatOleh}` : ""}` : giliran ? "Sedang ditunggu" : "Menunggu"}
      </p>
      {sah && p.jejak && (
        <p className="angka mt-0.5 text-[11px] text-muted" title={p.jejak}>
          Jejak {ringkasSha256(p.jejak)}
        </p>
      )}
    </li>
  );
}

function GarisWaktu({ p }: { p: PermintaanTtd }) {
  const langkah = tahapan(p);
  const pertamaBelum = langkah.findIndex((l) => !l.selesai);
  return (
    <ol className="space-y-3">
      {langkah.map((l, i) => {
        const tanda = l.selesai ? (l.bahaya ? "bg-danger text-danger-on" : "bg-success text-white") : i === pertamaBelum ? "bg-accent text-white" : "bg-raised text-muted";
        return (
          <li key={l.kunci} className="flex gap-3">
            <span className={cx("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold", tanda)} aria-hidden="true">
              {l.selesai ? (l.bahaya ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />) : i + 1}
            </span>
            <span className="min-w-0 text-sm">
              <span className="teks-panjang block font-semibold">{l.label}</span>
              <span className="text-xs text-muted">
                {l.waktu ? formatMasukRingkas(l.waktu) : i === pertamaBelum ? "sedang ditunggu" : "belum"}
                {l.oleh ? ` · ${l.oleh}` : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// --- Form permintaan (Legal) -----------------------------------------------------------------------------

const BARIS_KOSONG = (peran = ""): MasukanPenandatangan => ({ nama: "", jabatan: "", peran, email: "", luar: false });

function FormPermintaan({ k, dokumen, onSelesai }: { k: Kontrak; dokumen: DokumenSP[]; onSelesai: (h: HasilAksiTtd) => void }) {
  const { sesi } = useSesi();
  const kandidat = useMemo(() => dokumen.filter(bisaDitandatangani).sort((a, b) => (a.jenis === "Draft Final" ? -1 : 0) - (b.jenis === "Draft Final" ? -1 : 0) || b.diubah.localeCompare(a.diubah)), [dokumen]);
  const [dokId, setDokId] = useState(kandidat[0]?.id ?? "");
  const [baris, setBaris] = useState<MasukanPenandatangan[]>([BARIS_KOSONG("Pihak Pertama"), { ...BARIS_KOSONG("Pihak Kedua"), nama: k.mitra, luar: true }]);
  const [berurutan, setBerurutan] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [coba, setCoba] = useState(false);
  const pengguna = useMuat(ambilSemuaPengguna, []);
  const aktifkan = (pengguna.data ?? []).filter((x) => x.aktif);
  useEffect(() => {
    if (!dokId && kandidat[0]) setDokId(kandidat[0].id);
  }, [kandidat, dokId]);

  const galat = periksaPenandatangan(baris);
  const ubah = (i: number, bagian: Partial<MasukanPenandatangan>) => setBaris((b) => b.map((x, j) => (j === i ? { ...x, ...bagian } : x)));
  const pindah = (i: number, arah: -1 | 1) =>
    setBaris((b) => {
      const j = i + arah;
      if (j < 0 || j >= b.length) return b;
      const salin = [...b];
      [salin[i], salin[j]] = [salin[j]!, salin[i]!];
      return salin;
    });
  const pilihNama = (i: number, nama: string) => {
    const cocok = aktifkan.find((x) => x.nama.toLowerCase() === nama.trim().toLowerCase());
    ubah(i, cocok && !baris[i]!.luar ? { nama: cocok.nama, email: baris[i]!.email || cocok.email } : { nama });
  };

  const kirim = async () => {
    setCoba(true);
    const dok = kandidat.find((d) => d.id === dokId);
    if (!dok || galat.length) return;
    setSibuk(true);
    try {
      const h = await buatPermintaan(k, dok, baris, berurutan, sesi);
      umpanBalik.berhasil("Permintaan tanda tangan dikirim.", { teks: h.emailGagal ? "Email pemberitahuan belum masuk antrean; ingatkan penandatangan secara manual." : berurutan ? "Email dikirim ke penandatangan pertama." : "Email dikirim ke semua penandatangan internal." });
      onSelesai(h);
    } catch (err) {
      umpanBalik.gagal(err, "Belum bisa membuat permintaan");
    } finally {
      setSibuk(false);
    }
  };

  if (kandidat.length === 0) {
    return (
      <Kartu judul="Minta tanda tangan" ikon={<FilePlus2 className="h-5 w-5 text-brand" aria-hidden="true" />}>
        <p className="text-sm text-muted">Belum ada dokumen PDF atau Word di kontrak ini. Unggah draft final di halaman kontrak (jenis Draft Final), lalu kembali ke sini.</p>
      </Kartu>
    );
  }

  return (
    <Kartu judul="Minta tanda tangan" ikon={<FilePlus2 className="h-5 w-5 text-brand" aria-hidden="true" />}>
      <div className="space-y-5">
        <Field label="Dokumen yang ditandatangani" wajib bantuan="Isi dokumen dikunci dengan sidik SHA-256. Bila berkasnya diubah sesudahnya, tanda tangan ditolak sampai permintaan dibuat ulang.">
          <select className="input" value={dokId} onChange={(e) => setDokId(e.target.value)} disabled={sibuk}>
            {kandidat.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nama} · {d.jenis || "tanpa jenis"} · {teksUkuran(d.ukuran)}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <p className="label">Penandatangan</p>
          <ul className="space-y-3">
            {baris.map((b, i) => (
              <li key={i} className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-raised text-[11px] text-ink">{i + 1}</span>
                    {b.luar ? "Pihak luar (mitra)" : "Internal"}
                  </span>
                  <span className="flex gap-1">
                    <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-raised disabled:opacity-40" onClick={() => pindah(i, -1)} disabled={i === 0 || sibuk} aria-label={`Naikkan penandatangan ${i + 1}`}>
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-raised disabled:opacity-40" onClick={() => pindah(i, 1)} disabled={i === baris.length - 1 || sibuk} aria-label={`Turunkan penandatangan ${i + 1}`}>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-danger hover:bg-danger-soft disabled:opacity-40" onClick={() => setBaris((x) => x.filter((_, j) => j !== i))} disabled={baris.length === 1 || sibuk} aria-label={`Hapus penandatangan ${i + 1}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nama">
                    <input className="input" value={b.nama} list={b.luar ? undefined : "daftar-pengguna-ttd"} onChange={(e) => pilihNama(i, e.target.value)} placeholder={b.luar ? "Nama penandatangan mitra" : "Ketik untuk mencari pengguna"} disabled={sibuk} autoComplete="off" />
                  </Field>
                  <Field label="Jabatan">
                    <input className="input" value={b.jabatan} onChange={(e) => ubah(i, { jabatan: e.target.value })} placeholder="mis. Direktur Utama" disabled={sibuk} />
                  </Field>
                  <Field label="Kedudukan di kontrak" bantuan="Tampil di halaman pengesahan.">
                    <input className="input" value={b.peran} onChange={(e) => ubah(i, { peran: e.target.value })} placeholder="mis. Pihak Pertama" disabled={sibuk} />
                  </Field>
                  <Field label={b.luar ? "Email (opsional)" : "Email kantor"} bantuan={b.luar ? undefined : "Akun yang dipakai masuk ke WiCon."}>
                    <input className="input" type="email" inputMode="email" value={b.email} onChange={(e) => ubah(i, { email: e.target.value })} placeholder="nama@waskitainfrastruktur.co.id" disabled={sibuk} />
                  </Field>
                </div>
                <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--wh-brand)]" checked={b.luar} onChange={(e) => ubah(i, { luar: e.target.checked })} disabled={sibuk} />
                  <span>
                    <span className="font-semibold">Pihak luar (tidak punya akun WiCon)</span>
                    <span className="block text-xs text-muted">Legal mencatat tanda tangannya dari gambar yang diterima dari pihak tersebut.</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <datalist id="daftar-pengguna-ttd">
            {aktifkan.map((x) => (
              <option key={x.id} value={x.nama} />
            ))}
          </datalist>
          <div className="mt-3 flex flex-wrap gap-2">
            <Tombol type="button" varian="kedua" kecil ikon={<UserPlus className="h-4 w-4" />} disabled={baris.length >= BATAS_PENANDATANGAN || sibuk} onClick={() => setBaris((b) => [...b, BARIS_KOSONG(`Penandatangan ${b.length + 1}`)])}>
              Tambah penandatangan internal
            </Tombol>
            <Tombol type="button" varian="kedua" kecil ikon={<Plus className="h-4 w-4" />} disabled={baris.length >= BATAS_PENANDATANGAN || sibuk} onClick={() => setBaris((b) => [...b, { ...BARIS_KOSONG(`Pihak ${b.length + 1}`), luar: true }])}>
              Tambah pihak luar
            </Tombol>
          </div>
        </div>

        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--wh-brand)]" checked={berurutan} onChange={(e) => setBerurutan(e.target.checked)} disabled={sibuk} />
          <span>
            <span className="font-semibold">Tanda tangan berurutan</span>
            <span className="block text-xs text-muted">Tiap penandatangan baru dikabari setelah yang sebelumnya selesai. Matikan bila boleh bersamaan.</span>
          </span>
        </label>

        {coba && galat.length > 0 && (
          <ul role="alert" className="list-disc space-y-1 rounded-xl bg-danger-soft py-2 pl-7 pr-3 text-sm font-semibold text-danger">
            {galat.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <Tombol type="button" ikon={<Signature className="h-4 w-4" />} memuat={sibuk} onClick={() => void kirim()} className="w-full sm:w-auto">
            Kirim permintaan tanda tangan
          </Tombol>
        </div>
      </div>
    </Kartu>
  );
}

// --- Tanda tangan Anda -----------------------------------------------------------------------------------

function PanelTandaiSaya({ k, p, langkah, onSelesai, dokumen, onLihat }: { k: Kontrak; p: PermintaanTtd; langkah: Penandatangan; onSelesai: (h: HasilAksiTtd) => void; dokumen?: DokumenSP; onLihat: (d: Dokumen) => void }) {
  const { sesi } = useSesi();
  const pilih = useRef<PilihTtdRef>(null);
  const [tersimpan, setTersimpan] = useState<TtdTersimpan | null>(null);
  const [siap, setSiap] = useState(false);
  const [sudahBaca, setSudahBaca] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");
  const [tolak, setTolak] = useState(false);

  useEffect(() => {
    let aktif = true;
    void ambilTtdTersimpan(sesi.email).then(
      (t) => aktif && setTersimpan(t),
      () => undefined,
    );
    return () => {
      aktif = false;
    };
  }, [sesi.email]);

  const teken = async () => {
    setGalat("");
    const t = await pilih.current?.ambil();
    if (!t?.png) {
      setGalat("Tanda tangan belum ada. Coret di area yang disediakan, atau unggah gambarnya.");
      return;
    }
    setSibuk(true);
    try {
      const h = await tandatangani(k, p, t.png, t.sumber, sesi);
      if (t.simpan) {
        await simpanTtdTersimpan(sesi.email, t.png).then(
          () => setTersimpan({ bytes: t.png!, waktu: new Date().toISOString() }),
          () => umpanBalik.peringatan("Tanda tangan sah, tetapi belum bisa disimpan sebagai TTD tersimpan."),
        );
      }
      onSelesai(h);
    } catch (err) {
      setGalat(pesanError(err));
    } finally {
      setSibuk(false);
    }
  };

  return (
    <Kartu judul={`Tanda tangan Anda: ${langkah.peran}`} ikon={<Signature className="h-5 w-5 text-brand" aria-hidden="true" />} className="ring-2 ring-accent/60">
      <p className="mb-3 text-sm text-muted">
        Periksa dokumennya lebih dulu. Tanda tangan Anda dibubuhkan di halaman pengesahan bersama waktu dan jejak elektronik akun {sesi.email}.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
        <FileText className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="teks-panjang text-sm font-semibold">{p.isi.dokumen.nama}</p>
          <p className="angka text-xs text-muted">
            {teksUkuran(p.isi.dokumen.ukuran)} · SHA-256 {ringkasSha256(p.isi.dokumen.sha256)}
          </p>
        </div>
        {dokumen ? (
          <Tombol type="button" varian="kedua" kecil ikon={<Eye className="h-4 w-4" />} onClick={() => onLihat(dokumen)}>
            Baca dokumen
          </Tombol>
        ) : null}
      </div>

      <PilihTtd
        ref={pilih}
        tersimpan={tersimpan}
        disabled={sibuk}
        onSiap={setSiap}
        onHapusTersimpan={async () => {
          await hapusTtdTersimpan(sesi.email).then(
            () => {
              setTersimpan(null);
              umpanBalik.berhasil("TTD tersimpan dihapus.");
            },
            (err) => umpanBalik.gagal(err, "Belum bisa menghapus TTD tersimpan"),
          );
        }}
      />

      <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--wh-brand)]" checked={sudahBaca} onChange={(e) => setSudahBaca(e.target.checked)} disabled={sibuk} />
        <span>Saya sudah membaca dokumen ini dan setuju membubuhkan tanda tangan saya padanya.</span>
      </label>

      {galat && (
        <p role="alert" className="teks-panjang mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {galat}
        </p>
      )}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Tombol type="button" varian="kedua" onClick={() => setTolak(true)} disabled={sibuk} className="w-full sm:w-auto">
          Tolak…
        </Tombol>
        <Tombol type="button" ikon={<Check className="h-4 w-4" />} memuat={sibuk} disabled={!siap || !sudahBaca} onClick={() => void teken()} className="w-full sm:w-auto">
          Tanda tangani
        </Tombol>
      </div>
      {tolak && (
        <ModalAlasan
          judul="Tolak menandatangani"
          label="Alasan penolakan"
          bantuan="Apa yang tidak sesuai? Alasan ini dikirim ke Legal dan pihak terkait, dan permintaan dihentikan."
          tombol="Tolak dokumen ini"
          onTutup={() => setTolak(false)}
          onKirim={async (alasan) => {
            const h = await tolakPermintaan(k, p, alasan, sesi);
            umpanBalik.info("Penolakan dicatat.", { teks: "Permintaan tanda tangan dihentikan." });
            onSelesai(h);
          }}
        />
      )}
    </Kartu>
  );
}

// --- Pencatatan pihak luar (Legal) -------------------------------------------------------------------------

function PanelCatatLuar({ k, p, langkah, onSelesai }: { k: Kontrak; p: PermintaanTtd; langkah: Penandatangan; onSelesai: (h: HasilAksiTtd) => void }) {
  const { sesi } = useSesi();
  const pilih = useRef<PilihTtdRef>(null);
  const [siap, setSiap] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");
  const [konfirmasi, setKonfirmasi] = useState(false);
  const catat = async () => {
    setGalat("");
    const t = await pilih.current?.ambil();
    if (!t?.png) {
      setGalat("Gambar tanda tangan belum ada.");
      return;
    }
    setSibuk(true);
    try {
      onSelesai(await catatPihakLuar(k, p, langkah.id, t.png, sesi));
    } catch (err) {
      setGalat(pesanError(err));
    } finally {
      setSibuk(false);
    }
  };
  return (
    <Kartu judul={`Catat tanda tangan ${langkah.nama}`} ikon={<UserPlus className="h-5 w-5 text-brand" aria-hidden="true" />}>
      <p className="mb-3 text-sm text-muted">
        {langkah.nama} ({langkah.peran}) tidak memakai WiCon. Unggah foto atau gambar tanda tangannya yang Anda terima; Anda tercatat sebagai pencatatnya. Bila seluruh dokumen ditandatangani basah, lebih mudah memakai <strong>Unggah pindaian</strong>.
      </p>
      <PilihTtd ref={pilih} disabled={sibuk} bolehSimpan={false} onSiap={setSiap} />
      {galat && (
        <p role="alert" className="teks-panjang mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {galat}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <Tombol type="button" disabled={!siap} memuat={sibuk} onClick={() => setKonfirmasi(true)} className="w-full sm:w-auto">
          Catat tanda tangan
        </Tombol>
      </div>
      {konfirmasi && (
        <Modal judul="Catat tanda tangan pihak luar?" onTutup={() => setKonfirmasi(false)} lebar="max-w-md">
          <p className="text-sm text-muted">
            Anda menyatakan bahwa gambar ini adalah tanda tangan <strong>{langkah.nama}</strong> yang diterima dari yang bersangkutan. Nama Anda tercatat sebagai pencatat dan tampil di halaman pengesahan.
          </p>
          <AksiModal>
            <Tombol type="button" varian="kedua" onClick={() => setKonfirmasi(false)}>
              Kembali
            </Tombol>
            <Tombol
              type="button"
              onClick={() => {
                setKonfirmasi(false);
                void catat();
              }}
            >
              Ya, catat
            </Tombol>
          </AksiModal>
        </Modal>
      )}
    </Kartu>
  );
}

// --- Halaman ---------------------------------------------------------------------------------------------

export default function DetailTandaTangan() {
  const { kontrakId } = useParams();
  const id = Number(kontrakId);
  const { sesi } = useSesi();
  const { ruang, ke } = useRuang();
  const pelaku = pelakuDari(sesi);
  const kQ = useMuat(() => ambilKontrak(id), [id]);
  const pQ = useMuat(() => ambilPermintaan(id), [id]);
  const nomor = kQ.data?.nomorPengajuan ?? "";
  const dokQ = useMuat(() => (nomor ? ambilDokumen(nomor) : Promise.resolve([] as DokumenSP[])), [nomor]);
  const [lihat, setLihat] = useState<Dokumen | null>(null);
  const [alasan, setAlasan] = useState<"batal" | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const inputPindai = useRef<HTMLInputElement>(null);

  const p = pQ.data;
  const k = kQ.data;
  const terapkan = useCallback(
    (h: HasilAksiTtd) => {
      pQ.setData(h.permintaan);
      terapkanPermintaan(h.permintaan);
      void dokQ.muatUlang();
      if (h.lengkap) {
        umpanBalik.berhasil("Dokumen selesai ditandatangani semua pihak.", { teks: h.galatPdf ? `PDF final belum tersimpan (${h.galatPdf}). Legal bisa membuatnya ulang.` : "PDF final bertanda tangan tersimpan di dokumen kontrak." });
      } else if (h.permintaan.isi.penandatangan.some(sudahTtd) && !h.permintaan.isi.tolak && !h.permintaan.isi.batal) {
        umpanBalik.berhasil("Tanda tangan tersimpan.", { teks: h.emailGagal ? "Email pemberitahuan belum masuk antrean." : undefined });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pQ.setData, dokQ.muatUlang],
  );

  const sayaMilik = useMemo(() => (p ? p.isi.penandatangan.filter((x) => !x.luar && x.email === sesi.email.toLowerCase()).map((x) => x.id) : []), [p, sesi.email]);

  if (!Number.isFinite(id)) return <KotakError error={new Error("Alamat tanda tangan tidak dikenal.")} />;
  if ((kQ.loading && !k) || (pQ.loading && !p && !pQ.error)) return <KerangkaHalaman baris={4} />;
  if (kQ.error && !k) return <KotakError error={kQ.error} ulangi={() => void kQ.muatUlang()} />;
  if (pQ.error && !p) return <KotakError error={pQ.error} ulangi={() => void pQ.muatUlang()} />;
  if (!k) return null;

  const kembali = (
    <Link to={ke.tandaTangan()} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-brand">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Semua tanda tangan
    </Link>
  );
  const judulHalaman = (
    <KepalaHalaman
      judul={k.judul}
      sub={
        <span className="flex flex-wrap items-center gap-2">
          <span className="angka font-semibold text-ink">{k.nomorPengajuan}</span>
          {k.mitra && <span>{k.mitra}</span>}
          {p && <LencanaTtd status={statusPermintaan(p.isi)} />}
        </span>
      }
      aksi={
        <Link to={ruang === "admin" ? `/kontrak/${k.id}` : `/saya/kontrak/${k.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-sm hover:border-brand">
          Buka kontrak
        </Link>
      }
    />
  );

  // Belum ada permintaan.
  if (!p) {
    return (
      <Kontainer>
        <Item>
          {kembali}
          {judulHalaman}
        </Item>
        {pelaku.legal && k.status === "Proses Tanda Tangan" ? (
          <Item>
            <FormPermintaan k={k} dokumen={dokQ.data ?? []} onSelesai={terapkan} />
          </Item>
        ) : (
          <Item>
            <Kartu judul="Belum ada permintaan tanda tangan" ikon={<ScrollText className="h-5 w-5 text-muted" aria-hidden="true" />}>
              <p className="text-sm text-muted">{pelaku.legal ? "Permintaan tanda tangan dibuat setelah kontrak berstatus Proses Tanda Tangan." : "Legal belum meminta tanda tangan untuk kontrak ini."}</p>
            </Kartu>
          </Item>
        )}
      </Kontainer>
    );
  }

  if (!bolehAksi(p, "lihat", pelaku)) {
    return (
      <Kontainer>
        <Item>
          {kembali}
          <Kartu judul="Anda tidak terlibat dalam dokumen ini" ikon={<ShieldCheck className="h-5 w-5 text-muted" aria-hidden="true" />}>
            <p className="text-sm text-muted">Isi dan tanda tangan hanya ditampilkan kepada penandatangan, pembuat permintaan, dan Legal. Masuk dengan akun penandatangan, atau hubungi Legal.</p>
          </Kartu>
        </Item>
      </Kontainer>
    );
  }

  const status = statusPermintaan(p.isi);
  const berjalan = masihBerjalan(p.isi);
  const giliran = new Set(sedangGiliran(p.isi).map((x) => x.id));
  const langkahSaya = langkahUntukSaya(p, sesi.email);
  const luarGiliran = pelaku.legal ? p.isi.penandatangan.filter((x) => x.luar && giliran.has(x.id)) : [];
  const ringkas = ringkasPermintaan(p.isi);
  const dokumenAsli = dokQ.data?.find((d) => d.id === p.isi.dokumen.id);
  const dokumenFinal = dokQ.data?.find((d) => d.id === (p.isi.berkasScan ?? p.isi.berkasPdf));
  const mulai = async (nama: string, fn: () => Promise<void>) => {
    setSibuk(nama);
    try {
      await fn();
    } catch (err) {
      umpanBalik.gagal(err, "Belum berhasil");
    } finally {
      setSibuk(null);
    }
  };

  return (
    <Kontainer>
      <Item>
        {kembali}
        {judulHalaman}
      </Item>

      {/* Ringkasan status */}
      <Item>
        <section className="kartu flex flex-wrap items-center gap-x-6 gap-y-3 p-4 sm:p-5" aria-label="Ringkasan tanda tangan">
          <div className="min-w-0 flex-1 basis-60">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Dokumen</p>
            <p className="teks-panjang font-semibold">{p.isi.dokumen.nama}</p>
            <p className="angka text-xs text-muted">
              {teksUkuran(p.isi.dokumen.ukuran)} · dikunci SHA-256 {ringkasSha256(p.isi.dokumen.sha256)} · diminta {p.dibuatOleh}, {formatMasuk(p.waktuDibuat)}
            </p>
          </div>
          <div className="basis-48">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Kemajuan</p>
            <p className="font-semibold">{ringkas.teks}</p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={ringkas.selesai} aria-valuemin={0} aria-valuemax={ringkas.total} aria-label="Kemajuan tanda tangan">
              <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${ringkas.total ? (ringkas.selesai / ringkas.total) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {dokumenAsli && (
              <Tombol type="button" varian="kedua" ikon={<Eye className="h-4 w-4" />} onClick={() => setLihat(dokumenAsli)}>
                Baca dokumen
              </Tombol>
            )}
            {status === "Selesai" && dokumenFinal && (
              <Tombol type="button" ikon={<FileCheck2 className="h-4 w-4" />} onClick={() => setLihat(dokumenFinal)}>
                {p.isi.berkasScan ? "Pindaian bertanda tangan" : "PDF bertanda tangan"}
              </Tombol>
            )}
          </div>
        </section>
      </Item>

      {status === "Ditolak" && p.isi.tolak && (
        <Item>
          <p role="status" className="teks-panjang rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
            <strong>Ditolak oleh {p.isi.tolak.oleh}</strong> pada {formatMasukRingkas(p.isi.tolak.waktu)}: “{p.isi.tolak.alasan}”
          </p>
        </Item>
      )}
      {status === "Dibatalkan" && p.isi.batal && (
        <Item>
          <p role="status" className="teks-panjang rounded-2xl bg-raised px-4 py-3 text-sm text-muted">
            <strong className="text-ink">Dibatalkan oleh {p.isi.batal.oleh}</strong> pada {formatMasukRingkas(p.isi.batal.waktu)}: “{p.isi.batal.alasan}”
          </p>
        </Item>
      )}
      {status === "Selesai" && !dokumenFinal && !p.isi.berkasScan && (
        <Item>
          <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">
            Semua pihak sudah menandatangani, tetapi PDF final belum tersimpan.{" "}
            {pelaku.legal ? (
              <button type="button" className="font-bold underline" disabled={sibuk != null} onClick={() => void mulai("pdf", async () => terapkan({ permintaan: await susunPdfFinal(k, p, sesi), emailGagal: false }))}>
                Buat PDF final sekarang
              </button>
            ) : (
              "Legal bisa membuatnya ulang."
            )}
          </p>
        </Item>
      )}

      {/* Tanda tangan Anda */}
      {berjalan && langkahSaya && (
        <Item>
          <PanelTandaiSaya k={k} p={p} langkah={langkahSaya} dokumen={dokumenAsli} onLihat={setLihat} onSelesai={terapkan} />
        </Item>
      )}
      {berjalan && !langkahSaya && sayaMilik.length > 0 && (
        <Item>
          <p role="status" className="rounded-2xl bg-info-soft px-4 py-3 text-sm text-info">
            {p.isi.penandatangan.filter((x) => sayaMilik.includes(x.id)).every(sudahTtd) ? "Anda sudah menandatangani. Terima kasih." : "Belum giliran Anda: penandatangan sebelumnya harus selesai lebih dulu. Anda akan menerima email saat tiba giliran Anda."}
          </p>
        </Item>
      )}

      {/* Penandatangan */}
      <Item>
        <Kartu judul="Penandatangan" ikon={<Signature className="h-5 w-5 text-brand" aria-hidden="true" />} aksi={p.isi.berurutan ? <Lencana>Berurutan</Lencana> : <Lencana>Bersamaan</Lencana>}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {p.isi.penandatangan.map((x, i) => (
              <KartuPenandatangan key={x.id} p={x} nomor={i + 1} giliran={giliran.has(x.id)} saya={sayaMilik.includes(x.id)} />
            ))}
          </ul>
        </Kartu>
      </Item>

      {/* Pihak luar */}
      {berjalan && luarGiliran.map((x) => (
        <Item key={x.id}>
          <PanelCatatLuar k={k} p={p} langkah={x} onSelesai={terapkan} />
        </Item>
      ))}

      {/* Kelola (Legal / pembuat) */}
      {berjalan && (bolehAksi(p, "batal", pelaku) || bolehAksi(p, "scan", pelaku)) && (
        <Item>
          <Kartu judul="Kelola permintaan" ikon={<RefreshCw className="h-5 w-5 text-brand" aria-hidden="true" />}>
            <div className="flex flex-wrap gap-2">
              {bolehAksi(p, "ingatkan", pelaku) && (
                <Tombol
                  type="button"
                  varian="kedua"
                  ikon={<BellRing className="h-4 w-4" />}
                  memuat={sibuk === "ingatkan"}
                  disabled={sibuk != null}
                  onClick={() =>
                    void mulai("ingatkan", async () => {
                      const r = await ingatkanPenandatangan(k, p, sesi);
                      if (r.jumlah === 0) umpanBalik.info("Tidak ada yang perlu diingatkan.", { teks: "Yang sedang ditunggu adalah pihak luar." });
                      else if (r.emailGagal) umpanBalik.peringatan("Pengingat belum masuk antrean email.");
                      else umpanBalik.berhasil(`Pengingat dikirim ke ${r.jumlah} orang.`);
                    })
                  }
                >
                  Kirim pengingat
                </Tombol>
              )}
              {bolehAksi(p, "scan", pelaku) && (
                <>
                  <Tombol type="button" varian="kedua" ikon={<Upload className="h-4 w-4" />} memuat={sibuk === "scan"} disabled={sibuk != null} onClick={() => inputPindai.current?.click()}>
                    Unggah pindaian (TTD basah)
                  </Tombol>
                  <input
                    ref={inputPindai}
                    type="file"
                    accept="application/pdf,.pdf"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      void mulai("scan", async () => terapkan(await unggahPindaian(k, p, f, sesi)));
                    }}
                  />
                </>
              )}
              {bolehAksi(p, "batal", pelaku) && (
                <Tombol type="button" varian="bahaya" ikon={<Undo2 className="h-4 w-4" />} disabled={sibuk != null} onClick={() => setAlasan("batal")}>
                  Batalkan permintaan
                </Tombol>
              )}
            </div>
            <p className="mt-3 text-xs text-muted">Pindaian PDF dari dokumen yang sudah ditandatangani basah langsung menyelesaikan permintaan ini tanpa tanda tangan digital.</p>
          </Kartu>
        </Item>
      )}

      {!berjalan && pelaku.legal && (status === "Ditolak" || status === "Dibatalkan") && k.status === "Proses Tanda Tangan" && (
        <Item>
          <FormPermintaan k={k} dokumen={dokQ.data ?? []} onSelesai={terapkan} />
        </Item>
      )}

      <Item>
        <Kartu judul="Riwayat" ikon={<ScrollText className="h-5 w-5 text-brand" aria-hidden="true" />}>
          <GarisWaktu p={p} />
        </Kartu>
      </Item>

      <Item>
        <p className="flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Tanda tangan di WiCon berupa gambar tanda tangan yang dibubuhkan setelah penandatangan masuk dengan akun perusahaannya, diikat ke dokumen lewat sidik SHA-256 beserta waktu. Ini bukan tanda tangan elektronik tersertifikasi dan tidak menggantikan e-meterai bila dipersyaratkan.
          </span>
        </p>
      </Item>

      {lihat && <PratinjauDokumen dokumen={lihat} onTutup={() => setLihat(null)} />}
      {alasan === "batal" && (
        <ModalAlasan
          judul="Batalkan permintaan tanda tangan"
          label="Alasan pembatalan"
          bantuan="Penandatangan yang belum menandatangani dikabari. Tanda tangan yang sudah masuk tetap tersimpan sebagai riwayat."
          tombol="Batalkan permintaan"
          onTutup={() => setAlasan(null)}
          onKirim={async (a) => {
            terapkan(await batalkanPermintaan(k, p, a, sesi));
            umpanBalik.info("Permintaan dibatalkan.");
          }}
        />
      )}
    </Kontainer>
  );
}

