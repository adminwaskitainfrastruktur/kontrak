// Kotak diskusi kontrak (U27): komentar dengan sebut @nama dan tombol Ingatkan / Tanyakan progres.
// Menggantikan kotak komentar lama di PanelRiwayat. Daftar riwayat tetap milik PanelRiwayat; komponen
// TeksDiskusi di bawah bisa dipakai di sana untuk menyorot sebutan.
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AtSign, BellRing, Clock3, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import type { useMuat } from "../hooks/useMuat";
import { bisaKomentar } from "../lib/alur";
import { formatWaktu, lamaSejak } from "../lib/format";
import { EASE_KELUAR, pegas } from "../lib/gerak";
import { pesanError } from "../lib/graph";
import {
  aturanIngatkan,
  cariPemicu,
  ekstrakDisebut,
  emailPengingat,
  emailSebutan,
  jedaIngatkan,
  kandidatSebut,
  pecahSebutan,
  penerimaIngatkan,
  ruangPenerima,
  saringKandidat,
  sisipkanSebut,
  type Pemicu,
} from "../lib/mention";
import type { Aktivitas, Kontrak, Pengguna } from "../lib/types";
import { ambilAktivitas, catatAktivitas } from "../services/aktivitas";
import { antrikanTangguh } from "../services/notifikasi";
import { Avatar, Tombol, cx } from "./ui";

export interface PropsKotakDiskusi {
  kontrak: Kontrak;
  /** Hasil useMuat(() => ambilAktivitas(id)). Dipakai untuk membatasi Ingatkan sekali per 24 jam. */
  aktivitas: ReturnType<typeof useMuat<Aktivitas[]>>;
  /** Dipanggil setelah komentar atau pengingat tercatat, mis. untuk memuat ulang riwayat. */
  onBerubah?: () => void | Promise<void>;
}

const BAWAAN_PENGINGAT = {
  "legal-ke-pengaju": "Revisi untuk pengajuan ini masih kami tunggu. Kabari bila ada kendala ya.",
  "pengaju-ke-legal": "Boleh minta kabar terbaru untuk pengajuan ini?",
} as const;

export default function KotakDiskusi({ kontrak: k, aktivitas, onBerubah }: PropsKotakDiskusi) {
  const { sesi, pengguna } = useSesi();
  const { ruang } = useRuang();
  const idDasar = useId();
  const idDaftar = `${idDasar}-sebut`;
  const kurangiGerak = useReducedMotion();
  const ref = useRef<HTMLTextAreaElement>(null);

  const [pesan, setPesan] = useState("");
  const [pemicu, setPemicu] = useState<Pemicu | null>(null);
  const [sorot, setSorot] = useState(0);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState("");

  const kandidat = useMemo(() => kandidatSebut(k, pengguna, sesi.email), [k, pengguna, sesi.email]);
  const saran = useMemo(() => (pemicu ? saringKandidat(kandidat, pemicu.kueri) : []), [pemicu, kandidat]);
  const disebut = useMemo(() => ekstrakDisebut(pesan, kandidat), [pesan, kandidat]);
  const namaDisebut = useMemo(() => disebut.map((e) => kandidat.find((p) => p.email.toLowerCase() === e)?.nama ?? e), [disebut, kandidat]);
  const terbuka = !!pemicu && saran.length > 0;

  const bolehTulis = bisaKomentar(k, sesi);
  const aturan = aturanIngatkan(k, sesi, ruang);
  if (!bolehTulis && !aturan) return null;

  const perbaruiPemicu = (teks: string, kursor: number) => {
    const p = cariPemicu(teks, kursor);
    setPemicu(p);
    if (!p || p.kueri !== pemicu?.kueri) setSorot(0);
  };

  const pilih = (p: Pengguna) => {
    if (!pemicu) return;
    const h = sisipkanSebut(pesan, pemicu, p);
    setPesan(h.teks);
    setPemicu(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(h.kursor, h.kursor);
    });
  };

  const kirim = async () => {
    const isi = pesan.trim();
    if (!isi || mengirim) return;
    setMengirim(true);
    setGalat("");
    try {
      await catatAktivitas({ kontrakId: k.id, jenis: "Komentar", pesan: isi, disebut }, sesi);
    } catch (err) {
      setGalat(pesanError(err));
      setMengirim(false);
      return;
    }
    setPesan("");
    setPemicu(null);
    if (disebut.length) {
      // Email untuk yang disebut hanyalah pelengkap: komentar sudah tersimpan walau email gagal diantrikan.
      try {
        await kabariYangDisebut(k, disebut, pengguna, sesi.nama, isi);
        toast.success(disebut.length === 1 ? `${namaDisebut[0]} akan diberi tahu lewat email.` : `${disebut.length} orang akan diberi tahu lewat email.`);
      } catch (err) {
        toast.warning("Komentar tersimpan, tetapi email pemberitahuan belum terkirim.", { description: pesanError(err) });
      }
    }
    setMengirim(false);
    await onBerubah?.();
  };

  const tekanTombol = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (terbuka) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSorot((i) => (i + 1) % saran.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSorot((i) => (i - 1 + saran.length) % saran.length);
        return;
      }
      if ((e.key === "Enter" && !e.ctrlKey && !e.metaKey) || e.key === "Tab") {
        e.preventDefault();
        pilih(saran[Math.min(sorot, saran.length - 1)]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setPemicu(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void kirim();
    }
  };

  return (
    <div className="border-b border-line p-4">
      {bolehTulis && (
        <>
          <div className="relative">
            <label htmlFor={`${idDasar}-pesan`} className="sr-only">
              Tulis komentar
            </label>
            <textarea
              id={`${idDasar}-pesan`}
              ref={ref}
              className="input min-h-[80px] resize-y"
              placeholder="Tulis catatan atau pertanyaan. Ketik @ untuk menyebut rekan…"
              value={pesan}
              role="combobox"
              aria-expanded={terbuka}
              aria-controls={idDaftar}
              aria-autocomplete="list"
              aria-activedescendant={terbuka ? `${idDaftar}-${saran[sorot]?.id ?? ""}` : undefined}
              aria-describedby={`${idDasar}-bantuan`}
              onChange={(e) => {
                setPesan(e.target.value);
                perbaruiPemicu(e.target.value, e.target.selectionStart);
              }}
              onSelect={(e) => perbaruiPemicu(e.currentTarget.value, e.currentTarget.selectionStart)}
              onKeyDown={tekanTombol}
              onBlur={() => window.setTimeout(() => setPemicu(null), 120)}
            />
            <AnimatePresence>
              {terbuka && (
                <motion.ul
                  id={idDaftar}
                  role="listbox"
                  aria-label="Pilih orang yang disebut"
                  initial={kurangiGerak ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.18, ease: EASE_KELUAR }}
                  className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-2xl border border-line bg-surface p-1 shadow-pop"
                >
                  {saran.map((p, i) => (
                    <li
                      key={p.id}
                      id={`${idDaftar}-${p.id}`}
                      role="option"
                      aria-selected={i === sorot}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pilih(p);
                      }}
                      onMouseEnter={() => setSorot(i)}
                      className={cx("flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2", i === sorot ? "bg-brand-soft" : "hover:bg-raised")}
                    >
                      <Avatar nama={p.nama} ukuran={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{p.nama}</span>
                        <span className="block truncate text-xs text-muted">
                          {/* id 0: pengaju yang masuk otomatis tanpa terdaftar (lib/mention pengajuTakTerdaftar). */}
                          {p.id === 0 ? "Pengaju kontrak ini" : p.peran === "Pengaju" ? `Pengaju · ${p.divisi}` : p.peran} · {p.email}
                        </span>
                      </span>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
            {!!pemicu && saran.length === 0 && (
              <p className="absolute inset-x-0 top-full z-20 mt-1 rounded-2xl border border-line bg-surface px-3 py-2 text-xs text-muted shadow-pop" role="status">
                Tidak ada rekan bernama "{pemicu.kueri}" yang berhak melihat kontrak ini.
              </p>
            )}
          </div>

          {galat && (
            <p className="mt-2 text-xs text-danger" role="alert">
              {galat}
            </p>
          )}

          {namaDisebut.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <AtSign className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              Akan diberi tahu lewat email:
              {namaDisebut.map((n) => (
                <span key={n} className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand-strong">
                  {n}
                </span>
              ))}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span id={`${idDasar}-bantuan`} className="text-xs text-muted">
              Ketik @ untuk menyebut · Ctrl + Enter untuk kirim
            </span>
            <Tombol kecil ikon={<Send className="h-3.5 w-3.5" />} memuat={mengirim} disabled={!pesan.trim()} onClick={() => void kirim()}>
              Kirim
            </Tombol>
          </div>
        </>
      )}

      {aturan && <PanelIngatkan k={k} aktivitas={aktivitas} pengguna={pengguna} onBerubah={onBerubah} adaKomentar={bolehTulis} />}
    </div>
  );
}

async function kabariYangDisebut(k: Kontrak, disebut: string[], pengguna: readonly Pengguna[], olehNama: string, pesan: string): Promise<void> {
  // Tautan di email berbeda untuk Pengaju (Ruang Pengguna) dan Legal/Admin (Ruang Admin), jadi dikirim per kelompok.
  const kelompok: Record<"pengaju" | "legal", string[]> = { pengaju: [], legal: [] };
  for (const email of disebut) kelompok[ruangPenerima(pengguna.find((p) => p.email.toLowerCase() === email))].push(email);
  for (const untuk of ["legal", "pengaju"] as const) {
    if (!kelompok[untuk].length) continue;
    const m = emailSebutan(k, olehNama, pesan, untuk);
    await antrikanTangguh({ penerima: kelompok[untuk], subjek: m.subjek, html: m.html, jenis: "Lainnya", kontrakId: k.id });
  }
}

function PanelIngatkan({ k, aktivitas, pengguna, onBerubah, adaKomentar }: { k: Kontrak; aktivitas: PropsKotakDiskusi["aktivitas"]; pengguna: readonly Pengguna[]; onBerubah?: PropsKotakDiskusi["onBerubah"]; adaKomentar: boolean }) {
  const { sesi } = useSesi();
  const { ruang } = useRuang();
  const idDasar = useId();
  const kurangiGerak = useReducedMotion();
  const [buka, setBuka] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [mengirim, setMengirim] = useState(false);

  const aturan = aturanIngatkan(k, sesi, ruang);
  const jeda = useMemo(() => jedaIngatkan(aktivitas.data ?? []), [aktivitas.data]);
  const penerima = useMemo(() => (aturan ? penerimaIngatkan(k, aturan, pengguna, sesi.email) : []), [k, aturan, pengguna, sesi.email]);
  if (!aturan) return null;

  // Pengaju yang masuk otomatis tidak ada di list Pengguna: namanya diambil dari kolom kontrak.
  const namaPenerima = penerima.map((e) => pengguna.find((p) => p.email.toLowerCase() === e)?.nama ?? (e === k.pengajuEmail.toLowerCase() && k.pengajuNama ? k.pengajuNama : e));
  const belumSiap = aktivitas.loading && !aktivitas.data;

  const kirim = async () => {
    if (mengirim) return;
    setMengirim(true);
    try {
      // Periksa ulang dari server supaya dua orang yang menekan bersamaan tidak mengirim dua pengingat.
      const terbaru = await ambilAktivitas(k.id).catch(() => aktivitas.data ?? []);
      const cek = jedaIngatkan(terbaru);
      if (!cek.boleh) {
        toast.info("Pengingat untuk kontrak ini baru saja dikirim.", { description: cek.bolehLagi ? `Bisa mengingatkan lagi ${formatWaktu(new Date(cek.bolehLagi).toISOString())}.` : undefined });
        setBuka(false);
        await onBerubah?.();
        return;
      }
      if (!penerima.length) {
        toast.error("Belum ada penerima untuk pengingat ini.", { description: "Pastikan tim Legal atau pengaju terdaftar sebagai pengguna aktif." });
        return;
      }
      const isiCatatan = catatan.trim();
      await catatAktivitas({ kontrakId: k.id, jenis: "Pengingat", pesan: isiCatatan || BAWAAN_PENGINGAT[aturan.arah], disebut: penerima }, sesi);
      try {
        const m = emailPengingat(k, sesi.nama, aturan, isiCatatan);
        await antrikanTangguh({ penerima, subjek: m.subjek, html: m.html, jenis: "Pengingat", kontrakId: k.id });
        toast.success(aturan.arah === "pengaju-ke-legal" ? "Pertanyaan Anda sudah dikirim ke Legal." : "Pengingat sudah dikirim ke pengaju.", { description: "Email dikirim lewat Power Automate, biasanya tiba dalam beberapa menit." });
      } catch (err) {
        toast.warning("Pengingat tercatat di riwayat, tetapi emailnya belum terkirim.", { description: pesanError(err) });
      }
      setCatatan("");
      setBuka(false);
      await onBerubah?.();
    } catch (err) {
      toast.error("Pengingat belum terkirim.", { description: pesanError(err) });
    } finally {
      setMengirim(false);
    }
  };

  return (
    <div className={cx(adaKomentar && "mt-3 border-t border-line pt-3")}>
      {!jeda.boleh && jeda.terakhir ? (
        <p className="flex items-start gap-2 text-xs text-muted">
          <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {jeda.terakhir.olehNama || "Seseorang"} sudah mengingatkan {lamaSejak(jeda.terakhir.waktu)} lalu. Tombol {aturan.label.toLowerCase()} aktif lagi {jeda.bolehLagi ? formatWaktu(new Date(jeda.bolehLagi).toISOString()) : "besok"}.
          </span>
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs text-muted">{aturan.keterangan}</p>
          {!buka && (
            <Tombol kecil varian="kedua" ikon={<BellRing className="h-3.5 w-3.5" />} disabled={belumSiap} onClick={() => setBuka(true)} aria-expanded={buka} aria-controls={`${idDasar}-panel`}>
              {aturan.label}
            </Tombol>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {buka && jeda.boleh && (
          <motion.div
            id={`${idDasar}-panel`}
            initial={kurangiGerak ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={kurangiGerak ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={kurangiGerak ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.15 } }}
            transition={pegas}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-2xl bg-accent-soft p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-accent-ink">
                  {aturan.label} ke {namaPenerima.length > 2 ? `${namaPenerima.slice(0, 2).join(", ")} dan ${namaPenerima.length - 2} lainnya` : namaPenerima.join(" dan ") || "-"}
                </p>
                <button type="button" onClick={() => setBuka(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-accent-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label="Tutup pengingat">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <label htmlFor={`${idDasar}-catatan`} className="mt-2 block text-xs text-accent-ink">
                Catatan singkat (opsional)
              </label>
              <textarea
                id={`${idDasar}-catatan`}
                className="input mt-1 min-h-[60px]"
                placeholder={BAWAAN_PENGINGAT[aturan.arah]}
                value={catatan}
                maxLength={1000}
                onChange={(e) => setCatatan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void kirim();
                }}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-accent-ink">Bisa dikirim sekali per 24 jam untuk kontrak ini.</span>
                <Tombol kecil ikon={<BellRing className="h-3.5 w-3.5" />} memuat={mengirim} onClick={() => void kirim()}>
                  Kirim pengingat
                </Tombol>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Teks komentar dengan sebutan @nama disorot. `nama` biasanya useSesi().pengguna.map(p => p.nama). */
export function TeksDiskusi({ teks, nama, className }: { teks: string; nama: readonly string[]; className?: string }) {
  const potongan = useMemo(() => pecahSebutan(teks, nama), [teks, nama]);
  return (
    <p className={cx("whitespace-pre-wrap break-words", className)}>
      {potongan.map((p, i) =>
        p.sebut ? (
          <span key={i} className="rounded-md bg-brand-soft px-1 font-semibold text-brand-strong">
            {p.teks}
          </span>
        ) : (
          <span key={i}>{p.teks}</span>
        ),
      )}
    </p>
  );
}
