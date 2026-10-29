// Panel "Masukan unit lain" di halaman detail (K03): Legal mencatat permintaan masukan ke Keuangan, Pajak, Teknik,
// K3, dan sebagainya; email permintaannya dikirim lewat kotak keluar, dan jawabannya dicatat Legal di sini.
// Selama ada permintaan yang menunggu, umur tahap Legal dikurangi (lencana SLA di detail ikut memakainya).
//
// Khusus Legal/Admin di Ruang Admin; pemanggil wajib menyembunyikannya dari Ruang Pengguna dan Pemantau. Isinya tidak
// ditulis ke list Aktivitas (yang terbaca pengaju).
import { useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarClock, Check, ExternalLink, Lock, MessagesSquare, Plus, Reply, Send, X } from "lucide-react";
import { DOMAIN_KANTOR } from "../config";
import { usePengaturan } from "../context/PengaturanContext";
import { useSesi } from "../context/SesiContext";
import type { useMuat } from "../hooks/useMuat";
import { formatRelatif, formatTanggal, formatWaktu, hariIni, tambahHari } from "../lib/format";
import { EASE_KELUAR } from "../lib/gerak";
import { pesanError } from "../lib/graph";
import {
  TENGGAT_BAWAAN_HARI,
  UNIT_USULAN,
  masihMenunggu,
  masukanKosong,
  rentangTungguMasukan,
  ringkasMasukan,
  statusTampil,
  urutkanMasukan,
  validasiJawaban,
  validasiMasukan,
  type JawabanMasukan,
  type MasukanBaru,
  type PermintaanMasukan,
  type StatusMasukan,
} from "../lib/masukan";
import { potonganTungguPengaturan } from "../lib/pengaturan";
import { MENUNGGU_UNIT_LAIN } from "../lib/sla";
import { STATUS_FINAL, type Kontrak } from "../lib/types";
import { umpanBalik } from "../lib/umpanBalik";
import { batalkanMasukan, buatMasukan, catatJawabanMasukan, kirimUlangMasukan } from "../services/masukan";
import { AksiModal, Isian, Kerangka, Kosong, KotakError, Lencana, Modal, Tombol, cx } from "./ui";

const NADA_STATUS: Record<StatusMasukan, "netral" | "peringatan" | "bahaya" | "sukses"> = {
  Menunggu: "peringatan",
  Terlambat: "bahaya",
  Dijawab: "sukses",
  Dibatalkan: "netral",
};

/** "2,5 hari" / "5 jam" untuk ringkasan jeda SLA. */
function teksLama(hari: number): string {
  if (hari < 1) return `${Math.max(1, Math.round(hari * 24))} jam`;
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(hari)} hari`;
}

export default function PanelMasukan({ k, q }: { k: Kontrak; q: ReturnType<typeof useMuat<PermintaanMasukan[]>> }) {
  const { sesi } = useSesi();
  const { pengaturan } = usePengaturan();
  const kurangiGerak = useReducedMotion();
  const [form, setForm] = useState(false);
  const [jawab, setJawab] = useState<PermintaanMasukan | null>(null);
  const [batal, setBatal] = useState<PermintaanMasukan | null>(null);
  const [sibuk, setSibuk] = useState<number | null>(null);
  const hari = hariIni();
  const daftar = urutkanMasukan(q.data ?? []);
  const r = ringkasMasukan(daftar, hari);
  const bolehMinta = !STATUS_FINAL.includes(k.status);
  const jeda = MENUNGGU_UNIT_LAIN.includes(k.status) ? potonganTungguPengaturan(k, pengaturan, Date.now(), rentangTungguMasukan(daftar)) : 0;
  const satuan = pengaturan.slaPakaiHariKerja ? " kerja" : "";

  const kirimUlang = async (m: PermintaanMasukan) => {
    setSibuk(m.id);
    const ok = await kirimUlangMasukan(k, m, sesi);
    setSibuk(null);
    if (ok) umpanBalik.berhasil(`Permintaan dikirim ulang ke ${m.namaPenerima || m.emailPenerima}.`, { teks: "Tembusannya masuk ke email Anda." });
    else umpanBalik.peringatan("Email belum masuk antrean kirim.", { teks: "Coba lagi sebentar lagi, atau hubungi unitnya langsung." });
  };

  return (
    <section className="kartu overflow-hidden" aria-labelledby={`masukan-${k.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={`masukan-${k.id}`} className="flex flex-wrap items-center gap-2 font-bold">
            <MessagesSquare className="h-4 w-4 text-brand" aria-hidden="true" /> Masukan unit lain
            {r.total > 0 && <span className="angka rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-muted">{r.total}</span>}
            {r.menunggu > 0 && <Lencana nada="peringatan">{r.menunggu} menunggu</Lencana>}
            {r.terlambat > 0 && <Lencana nada="bahaya">{r.terlambat} terlambat</Lencana>}
          </h2>
          <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted">
            <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Pendapat Keuangan, Pajak, Teknik, K3, dan unit lain lewat email. Khusus Legal dan Admin; tidak terlihat oleh pengaju.
          </p>
        </div>
        {bolehMinta && (
          <Tombol kecil ikon={<Plus className="h-4 w-4" />} onClick={() => setForm(true)}>
            Minta masukan
          </Tombol>
        )}
      </div>

      {q.loading && !q.data ? (
        <div className="space-y-3 p-5" role="status" aria-label="Memuat permintaan masukan">
          <Kerangka className="h-4 w-40" />
          <Kerangka className="h-16 w-full rounded-2xl" />
        </div>
      ) : q.error && !q.data ? (
        <div className="p-4">
          <KotakError error={q.error} ulangi={() => void q.muatUlang()} />
        </div>
      ) : daftar.length === 0 ? (
        <Kosong
          judul="Belum ada permintaan masukan"
          teks="Butuh pendapat unit lain? Kirim pertanyaan lewat email dari sini. Waktu menunggu jawabannya tidak dihitung ke SLA Legal."
          ikon={<MessagesSquare className="h-6 w-6" />}
        />
      ) : (
        <ul className="divide-y divide-line">
          {daftar.map((m, i) => (
            <motion.li
              key={m.id}
              initial={kurangiGerak ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_KELUAR, delay: kurangiGerak ? 0 : Math.min(i, 8) * 0.04 }}
              className="px-5 py-4 sm:px-6"
            >
              <ItemMasukan m={m} hari={hari} sibuk={sibuk === m.id} onJawab={() => setJawab(m)} onKirimUlang={() => void kirimUlang(m)} onBatal={() => setBatal(m)} />
            </motion.li>
          ))}
        </ul>
      )}

      {jeda > 0 && (
        <p className="flex items-start gap-1.5 border-t border-line bg-raised px-5 py-3 text-xs text-muted sm:px-6">
          <CalendarClock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Waktu menunggu unit lain di tahap {k.status}: <strong className="text-ink">{teksLama(jeda).replace(" hari", ` hari${satuan}`)}</strong>. Waktu ini tidak dihitung ke SLA Legal.
          </span>
        </p>
      )}

      {form && (
        <FormMinta
          k={k}
          onTutup={() => setForm(false)}
          onTersimpan={async () => {
            setForm(false);
            await q.muatUlang();
          }}
        />
      )}
      {jawab && (
        <FormJawaban
          m={jawab}
          onTutup={() => setJawab(null)}
          onTersimpan={async () => {
            setJawab(null);
            await q.muatUlang();
          }}
        />
      )}
      {batal && (
        <KonfirmasiBatal
          m={batal}
          onTutup={() => setBatal(null)}
          onTersimpan={async () => {
            setBatal(null);
            await q.muatUlang();
          }}
        />
      )}
    </section>
  );
}

function ItemMasukan({ m, hari, sibuk, onJawab, onKirimUlang, onBatal }: { m: PermintaanMasukan; hari: string; sibuk: boolean; onJawab: () => void; onKirimUlang: () => void; onBatal: () => void }) {
  const [lengkap, setLengkap] = useState(false);
  const status = statusTampil(m, hari);
  const menunggu = masihMenunggu(m);
  const panjang = m.pertanyaan.length > 220;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <Lencana>{m.unit || "Unit"}</Lencana>
        <Lencana nada={NADA_STATUS[status]}>{status}</Lencana>
        {m.tenggat && menunggu && (
          <span className={cx("inline-flex items-center gap-1 text-xs", status === "Terlambat" ? "font-semibold text-danger" : "text-muted")}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Tenggat {formatTanggal(m.tenggat)}
          </span>
        )}
      </div>
      <p className="mt-1.5 break-words text-xs text-muted">
        Ke {m.namaPenerima ? <span className="font-semibold text-ink">{m.namaPenerima}</span> : null} <span className="break-all">{m.namaPenerima ? `<${m.emailPenerima}>` : m.emailPenerima}</span>
      </p>
      <div className="mt-1">
        <p className={cx("whitespace-pre-wrap break-words text-sm", panjang && !lengkap && "line-clamp-3")}>{m.pertanyaan}</p>
        {panjang && (
          <button type="button" onClick={() => setLengkap((v) => !v)} className="mt-0.5 min-h-8 text-xs font-semibold text-brand hover:text-brand-strong [@media(pointer:coarse)]:min-h-11" aria-expanded={lengkap}>
            {lengkap ? "Ringkas" : "Selengkapnya"}
          </button>
        )}
      </div>
      {m.status === "Dijawab" && m.jawaban && (
        <div className="mt-2 rounded-xl bg-success-soft px-3 py-2 text-sm">
          <p className="text-xs font-semibold text-success">
            Jawaban{m.dijawabOleh ? ` dari ${m.dijawabOleh}` : ""}
            {m.selesaiPada ? ` · ${formatWaktu(m.selesaiPada)}` : ""}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words">{m.jawaban}</p>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          Diminta {m.dibuatOleh || "-"} {formatRelatif(m.dibuat)}
        </span>
        {m.status === "Dibatalkan" && m.selesaiPada && <span>Dibatalkan {formatWaktu(m.selesaiPada)}</span>}
        {m.tautanBerkas && (
          <a href={m.tautanBerkas} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 font-semibold text-brand hover:text-brand-strong [@media(pointer:coarse)]:min-h-11">
            Berkas yang dibagikan <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
      </div>
      {menunggu && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Tombol kecil ikon={<Reply className="h-3.5 w-3.5" />} disabled={sibuk} onClick={onJawab}>
            Catat jawaban
          </Tombol>
          <Tombol kecil varian="kedua" memuat={sibuk} ikon={<Send className="h-3.5 w-3.5" />} onClick={onKirimUlang}>
            Kirim ulang
          </Tombol>
          <Tombol kecil varian="hantu" ikon={<X className="h-3.5 w-3.5" />} disabled={sibuk} onClick={onBatal}>
            Batalkan
          </Tombol>
        </div>
      )}
    </div>
  );
}

function FormMinta({ k, onTutup, onTersimpan }: { k: Kontrak; onTutup: () => void; onTersimpan: () => Promise<void> }) {
  const { sesi, pengguna } = useSesi();
  const idUnit = useId();
  const idOrang = useId();
  const [isi, setIsi] = useState<MasukanBaru>(() => masukanKosong(tambahHari(TENGGAT_BAWAAN_HARI)));
  const [galat, setGalat] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const ubah = <K extends keyof MasukanBaru>(kunci: K, nilai: MasukanBaru[K]) => setIsi((v) => ({ ...v, [kunci]: nilai }));
  // Usulan penerima dari pengguna terdaftar (alamat kantor); penerima tidak wajib terdaftar.
  const orang = pengguna.filter((p) => p.aktif && p.email.endsWith(`@${DOMAIN_KANTOR}`));

  const kirim = async () => {
    const g = validasiMasukan(isi, { domain: DOMAIN_KANTOR, hari: hariIni() });
    if (g) return setGalat(g);
    setGalat("");
    setMenyimpan(true);
    try {
      const h = await buatMasukan(k, isi, sesi);
      umpanBalik.berhasil(h.emailTerantri ? `Permintaan terkirim ke ${isi.unit.trim()}.` : "Permintaan tercatat.", { teks: h.emailTerantri ? "Email dikirim lewat kotak keluar; tembusannya masuk ke email Anda." : undefined });
      for (const p of h.peringatan) umpanBalik.peringatan(p, { durasi: 10_000 });
      await onTersimpan();
    } catch (err) {
      setGalat(pesanError(err));
      setMenyimpan(false);
    }
  };

  return (
    <Modal judul="Minta masukan unit lain" onTutup={onTutup} lebar="max-w-xl">
      <p className="mb-4 text-sm text-muted">
        Pertanyaan dikirim lewat email atas nama Anda. Penerima tidak perlu akses ke aplikasi; ia cukup membalas ke email Anda, lalu Anda mencatat jawabannya di sini.
      </p>
      <datalist id={idUnit}>
        {UNIT_USULAN.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <datalist id={idOrang}>
        {orang.map((p) => (
          <option key={p.email} value={p.email}>
            {p.nama}
          </option>
        ))}
      </datalist>
      <div className="grid gap-4 sm:grid-cols-2">
        <Isian label="Unit" wajib>
          <input className="input" list={idUnit} value={isi.unit} maxLength={80} onChange={(e) => ubah("unit", e.target.value)} placeholder="Mis. Keuangan" autoFocus autoComplete="off" />
        </Isian>
        <Isian label="Tenggat jawaban" wajib bantuan={`Standar awal: ${TENGGAT_BAWAAN_HARI} hari dari sekarang.`}>
          <input type="date" className="input" value={isi.tenggat ?? ""} min={hariIni()} onChange={(e) => ubah("tenggat", e.target.value || null)} />
        </Isian>
        <Isian label="Email penerima" wajib bantuan={`Alamat kantor @${DOMAIN_KANTOR}.`}>
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            className="input"
            list={idOrang}
            value={isi.emailPenerima}
            onChange={(e) => {
              const email = e.target.value;
              const kenal = pengguna.find((p) => p.email === email.trim().toLowerCase());
              setIsi((v) => ({ ...v, emailPenerima: email, namaPenerima: kenal && !v.namaPenerima.trim() ? kenal.nama : v.namaPenerima }));
            }}
            placeholder={`nama@${DOMAIN_KANTOR}`}
            autoComplete="off"
          />
        </Isian>
        <Isian label="Nama penerima (opsional)">
          <input className="input" value={isi.namaPenerima} maxLength={120} onChange={(e) => ubah("namaPenerima", e.target.value)} autoComplete="off" />
        </Isian>
        <Isian label="Pertanyaan" wajib className="sm:col-span-2" bantuan="Tulis jelas apa yang perlu dijawab, mis. perlakuan PPh atas pembayaran ini, atau kecukupan anggaran tahun berjalan.">
          <textarea className="input min-h-[120px]" value={isi.pertanyaan} maxLength={2000} onChange={(e) => ubah("pertanyaan", e.target.value)} />
        </Isian>
        <Isian label="Tautan berkas (opsional)" className="sm:col-span-2" bantuan="Bagikan berkasnya per berkas dari SharePoint (Bagikan > Orang tertentu), lalu tempel tautannya di sini.">
          <input type="url" inputMode="url" autoCapitalize="none" spellCheck={false} className="input" value={isi.tautanBerkas} onChange={(e) => ubah("tautanBerkas", e.target.value)} placeholder="https://..." autoComplete="off" />
        </Isian>
      </div>
      {galat && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {galat}
        </p>
      )}
      <AksiModal>
        <Tombol varian="kedua" onClick={onTutup} disabled={menyimpan}>
          Batal
        </Tombol>
        <Tombol memuat={menyimpan} ikon={<Send className="h-4 w-4" />} onClick={() => void kirim()}>
          Kirim permintaan
        </Tombol>
      </AksiModal>
    </Modal>
  );
}

function FormJawaban({ m, onTutup, onTersimpan }: { m: PermintaanMasukan; onTutup: () => void; onTersimpan: () => Promise<void> }) {
  const [isi, setIsi] = useState<JawabanMasukan>({ jawaban: "", dijawabOleh: m.namaPenerima, tanggal: hariIni() });
  const [galat, setGalat] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);

  const kirim = async () => {
    const g = validasiJawaban(isi, hariIni());
    if (g) return setGalat(g);
    setGalat("");
    setMenyimpan(true);
    try {
      const peringatan = await catatJawabanMasukan(m, isi);
      umpanBalik.berhasil(`Jawaban ${m.unit} tercatat.`, { teks: "Masa tunggunya berhenti dihitung." });
      for (const p of peringatan) umpanBalik.peringatan(p, { durasi: 10_000 });
      await onTersimpan();
    } catch (err) {
      setGalat(pesanError(err));
      setMenyimpan(false);
    }
  };

  return (
    <Modal judul={`Catat jawaban ${m.unit}`} onTutup={onTutup} lebar="max-w-xl">
      <div className="mb-4 rounded-xl bg-raised px-3.5 py-2.5 text-sm">
        <p className="text-xs font-semibold text-muted">Pertanyaan</p>
        <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap break-words">{m.pertanyaan}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Isian label="Ringkasan jawaban" wajib className="sm:col-span-2" bantuan="Salin inti jawaban dari email balasan. Lampiran simpan di panel dokumen.">
          <textarea className="input min-h-[120px]" value={isi.jawaban} maxLength={4000} onChange={(e) => setIsi((v) => ({ ...v, jawaban: e.target.value }))} autoFocus />
        </Isian>
        <Isian label="Dijawab oleh (opsional)">
          <input className="input" value={isi.dijawabOleh} maxLength={120} onChange={(e) => setIsi((v) => ({ ...v, dijawabOleh: e.target.value }))} autoComplete="off" />
        </Isian>
        <Isian label="Tanggal jawaban" bantuan="Kosong berarti sekarang.">
          <input type="date" className="input" value={isi.tanggal ?? ""} max={hariIni()} min={m.dibuat.slice(0, 10)} onChange={(e) => setIsi((v) => ({ ...v, tanggal: e.target.value || null }))} />
        </Isian>
      </div>
      {galat && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {galat}
        </p>
      )}
      <AksiModal>
        <Tombol varian="kedua" onClick={onTutup} disabled={menyimpan}>
          Batal
        </Tombol>
        <Tombol memuat={menyimpan} ikon={<Check className="h-4 w-4" />} onClick={() => void kirim()}>
          Simpan jawaban
        </Tombol>
      </AksiModal>
    </Modal>
  );
}

function KonfirmasiBatal({ m, onTutup, onTersimpan }: { m: PermintaanMasukan; onTutup: () => void; onTersimpan: () => Promise<void> }) {
  const [menyimpan, setMenyimpan] = useState(false);
  const kirim = async () => {
    setMenyimpan(true);
    try {
      await batalkanMasukan(m);
      umpanBalik.berhasil(`Permintaan ke ${m.unit} dibatalkan.`);
      await onTersimpan();
    } catch (err) {
      umpanBalik.gagal(err, "Belum bisa dibatalkan");
      setMenyimpan(false);
    }
  };
  return (
    <Modal judul={`Batalkan permintaan ke ${m.unit}?`} onTutup={onTutup}>
      <p className="text-sm text-muted">Permintaan ditandai Dibatalkan dan masa tunggunya berhenti dihitung. Penerima tidak dikirimi email; kabari langsung bila perlu.</p>
      <AksiModal>
        <Tombol varian="kedua" onClick={onTutup} disabled={menyimpan}>
          Kembali
        </Tombol>
        <Tombol varian="bahaya" memuat={menyimpan} onClick={() => void kirim()}>
          Batalkan permintaan
        </Tombol>
      </AksiModal>
    </Modal>
  );
}
