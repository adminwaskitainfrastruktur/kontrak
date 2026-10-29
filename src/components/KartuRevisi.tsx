// Kartu permintaan revisi (U06), dipasang di bawah hero detail kontrak.
//   Perlu Revisi  : poin yang diminta Legal, tanggapan per poin (disimpan lokal di peramban), ringkasan apa
//                   yang sudah berubah, dan tombol "Kirim ulang ke Legal" bagi pengaju.
//   Review Legal  : bagi Legal di Ruang Admin, ringkasan "yang berubah sejak revisi diminta" setelah dikirim ulang.
// Peringatan di sini lunak: pengaju tetap boleh mengirim ulang walau belum mengunggah dokumen baru.
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, CheckCheck, FileText, MessageCircleReply, RefreshCcw, Send, Upload } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import type { Ruang } from "../context/RuangContext";
import { aksiTersedia } from "../lib/alur";
import { formatRelatif, formatWaktu } from "../lib/format";
import { pegasLembut } from "../lib/gerak";
import { baruDikirimUlang, kunciTanggapan, permintaanRevisiTerakhir, sejakRevisi, teksTanggapan, type TanggapanPoin } from "../lib/revisi";
import type { Aktivitas, Dokumen, Kontrak } from "../lib/types";
import { Kerangka, Tombol, cx } from "./ui";

interface PropsKartuRevisi {
  kontrak: Kontrak;
  /** Dari ambilAktivitas. null saat masih dimuat. */
  aktivitas: Aktivitas[] | null;
  /** Dari ambilDokumen. null saat masih dimuat. */
  dokumen: Dokumen[] | null;
  ruang: Ruang;
  /** Membuka aksi Kirim Ulang (mis. ModalAksi "kirim-ulang") dengan catatan awal dari tanggapan per poin. */
  onKirimUlang: (catatan: string) => void;
  /** Mengarahkan ke panel unggah dokumen. Tombol "Unggah" disembunyikan bila tidak diisi. */
  onUnggah?: () => void;
  /** Sorot kartu sebentar, mis. setelah kembali dari formulir tanpa dokumen baru. */
  sorot?: boolean;
}

type PetaTanggapan = Record<number, TanggapanPoin>;

function bacaTanggapan(kunci: string): PetaTanggapan {
  try {
    const teks = localStorage.getItem(kunci);
    const j: unknown = teks ? JSON.parse(teks) : null;
    return j && typeof j === "object" ? (j as PetaTanggapan) : {};
  } catch {
    return {};
  }
}

function tulisTanggapan(kunci: string, isi: PetaTanggapan) {
  try {
    if (Object.keys(isi).length === 0) localStorage.removeItem(kunci);
    else localStorage.setItem(kunci, JSON.stringify(isi));
  } catch {
    // Penyimpanan lokal hanya kenyamanan; tanpa itu tanggapan tetap terkirim lewat catatan.
  }
}

export default function KartuRevisi({ kontrak: k, aktivitas, dokumen, ruang, onKirimUlang, onUnggah, sorot }: PropsKartuRevisi) {
  const { sesi } = useSesi();
  const kurangiGerak = useReducedMotion();

  const permintaan = useMemo(() => (aktivitas ? permintaanRevisiTerakhir(aktivitas) : null), [aktivitas]);
  const sejak = useMemo(() => (aktivitas && dokumen ? sejakRevisi(dokumen, aktivitas, permintaan) : null), [aktivitas, dokumen, permintaan]);
  const kunci = permintaan ? kunciTanggapan(k.id, permintaan.aktivitasId) : null;
  const [tanggapan, setTanggapan] = useState<PetaTanggapan>({});
  const [bukaTanggapan, setBukaTanggapan] = useState<number | null>(null);

  useEffect(() => {
    setTanggapan(kunci ? bacaTanggapan(kunci) : {});
  }, [kunci]);

  const perbarui = (i: number, ubah: Partial<TanggapanPoin>) => {
    setTanggapan((lama) => {
      const baru: PetaTanggapan = { ...lama, [i]: { ...(lama[i] ?? { sudah: false }), ...ubah } };
      if (kunci) tulisTanggapan(kunci, baru);
      return baru;
    });
  };

  const perluRevisi = k.status === "Perlu Revisi";
  const ringkasLegal = ruang === "admin" && aktivitas != null && baruDikirimUlang(k, aktivitas);
  if (!perluRevisi && !ringkasLegal) return null;

  const bisaKirim = perluRevisi && aksiTersedia(k, sesi).some((a) => a.id === "kirim-ulang");
  const poin = permintaan?.uraian.poin ?? [];
  const jumlahSudah = poin.filter((_, i) => tanggapan[i]?.sudah).length;
  const judulId = `revisi-${k.id}`;

  const sorotan = sorot && !kurangiGerak ? { boxShadow: ["0 0 0 0 var(--wh-accent)", "0 0 0 6px var(--wh-accent-soft)", "0 0 0 0 var(--wh-accent-soft)"] } : undefined;

  // --- Legal: kontrak sudah dikirim ulang, tampilkan yang berubah ----------------------------------
  if (!perluRevisi) {
    return (
      <section id="kartu-revisi" aria-labelledby={judulId} className="kartu overflow-hidden border-info-soft">
        <div className="flex flex-wrap items-start gap-3 bg-info-soft px-5 py-4 text-info">
          <RefreshCcw className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id={judulId} className="font-bold">
              Dikirim ulang setelah revisi
            </h2>
            <p className="text-xs opacity-90">{permintaan ? `Revisi diminta ${permintaan.olehNama || "Legal"}, ${formatWaktu(permintaan.waktu)}.` : "Pengaju sudah mengirim ulang."}</p>
          </div>
        </div>
        <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
          <div className="min-w-0">
            <p className="label">Yang diminta</p>
            <DaftarPoin poin={poin} pengantar={permintaan?.uraian.pengantar ?? ""} />
          </div>
          <div className="min-w-0">
            <p className="label">Yang berubah sejak itu</p>
            <RingkasSejak sejak={sejak} />
          </div>
        </div>
      </section>
    );
  }

  // --- Perlu Revisi: kedua ruang ------------------------------------------------------------------
  return (
    <motion.section
      id="kartu-revisi"
      aria-labelledby={judulId}
      initial={kurangiGerak ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, ...sorotan }}
      transition={sorot ? { boxShadow: { duration: 1.6, repeat: 1 }, default: pegasLembut } : pegasLembut}
      className="kartu overflow-hidden border-2 border-accent"
    >
      <div className="flex flex-wrap items-start gap-3 bg-accent-soft px-5 py-4 text-accent-ink">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent text-accent-on" aria-hidden="true">
          <MessageCircleReply className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={judulId} className="text-base font-bold">
            {bisaKirim ? "Legal meminta sedikit perbaikan" : "Menunggu revisi dari pengaju"}
          </h2>
          <p className="text-xs opacity-90">
            {aktivitas == null
              ? "Memuat catatan revisi…"
              : permintaan
                ? `Dari ${permintaan.olehNama || "Legal"}, ${formatRelatif(permintaan.waktu)}. ${bisaKirim ? "Setelah dirapikan, kirim ulang dari sini." : ""}`
                : "Catatan revisinya ada di bagian Riwayat & diskusi."}
          </p>
        </div>
        {bisaKirim && poin.length > 1 && (
          <p className="angka self-center rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink" aria-live="polite">
            {jumlahSudah}/{poin.length} beres
          </p>
        )}
      </div>

      <div className="px-5 py-4">
        {aktivitas == null ? (
          <div className="space-y-2" role="status" aria-label="Memuat catatan revisi">
            <Kerangka className="h-4 w-3/4" />
            <Kerangka className="h-4 w-1/2" />
          </div>
        ) : !permintaan || poin.length === 0 ? (
          <p className="text-sm text-muted">Legal tidak menuliskan poin khusus. Silakan cek riwayat atau hubungi PIC Legal{k.picLegalNama ? ` (${k.picLegalNama})` : ""}.</p>
        ) : bisaKirim ? (
          <>
            {permintaan.uraian.pengantar && <p className="mb-3 text-sm text-muted">{permintaan.uraian.pengantar}</p>}
            <ol className="space-y-2" aria-label="Poin revisi">
              {poin.map((p, i) => {
                const t = tanggapan[i];
                const idCek = `poin-${k.id}-${i}`;
                return (
                  <li key={i} className={cx("rounded-xl border px-3 py-2.5 transition-colors", t?.sudah ? "border-success-soft bg-success-soft" : "border-line bg-surface")}>
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-1 sm:flex-nowrap">
                      <input
                        id={idCek}
                        type="checkbox"
                        checked={!!t?.sudah}
                        onChange={(e) => perbarui(i, { sudah: e.target.checked })}
                        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-[var(--wh-success)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                      />
                      {/* Seluruh teks poin ikut menjadi area sentuh centang (label), jadi mudah ditekan di ponsel. */}
                      <label htmlFor={idCek} className="min-w-0 flex-1 basis-[10rem] cursor-pointer text-sm [@media(pointer:coarse)]:py-0.5">
                        <span className="angka mr-1.5 font-semibold text-muted">{i + 1}.</span>
                        <span className={cx("break-words", t?.sudah && "text-muted")}>{p}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setBukaTanggapan(bukaTanggapan === i ? null : i)}
                        className="ml-8 shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:ml-0 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3"
                        aria-expanded={bukaTanggapan === i}
                        aria-controls={`${idCek}-tanggapan`}
                      >
                        {t?.teks ? "Ubah tanggapan" : "Tanggapi"}
                      </button>
                    </div>
                    {t?.teks && bukaTanggapan !== i && <p className="ml-7 mt-1 break-words text-xs text-muted">Tanggapan: {t.teks}</p>}
                    {bukaTanggapan === i && (
                      <div id={`${idCek}-tanggapan`} className="ml-7 mt-2">
                        <label htmlFor={`${idCek}-teks`} className="sr-only">
                          Tanggapan untuk poin {i + 1}
                        </label>
                        <input
                          id={`${idCek}-teks`}
                          className="input !py-2 !text-xs [@media(pointer:coarse)]:!text-base"
                          autoFocus
                          maxLength={200}
                          value={t?.teks ?? ""}
                          enterKeyHint="done"
                          autoComplete="off"
                          placeholder="mis. Sudah diunggah versi terbaru, atau menunggu dari mitra"
                          onChange={(e) => perbarui(i, { teks: e.target.value })}
                          onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && (e.preventDefault(), e.stopPropagation(), setBukaTanggapan(null))}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {poin.length > 1 && jumlahSudah < poin.length && (
              <button type="button" onClick={() => poin.forEach((_, i) => perbarui(i, { sudah: true }))} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Tandai semua sudah
              </button>
            )}
            <p className="mt-2 text-xs text-muted">Tanda centang dan tanggapan tersimpan di peramban ini saja, lalu ikut terkirim sebagai catatan saat Anda mengirim ulang.</p>
          </>
        ) : (
          <DaftarPoin poin={poin} pengantar={permintaan.uraian.pengantar} />
        )}
      </div>

      <div className="border-t border-line px-5 py-4">
        <p className="label">Sejak revisi diminta</p>
        <RingkasSejak sejak={sejak} />
        {sejak && !sejak.adaDokumenBaru && bisaKirim && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-ink" role="note">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Belum ada dokumen baru sejak revisi diminta. Kalau perbaikannya ada di berkas, unggah dulu supaya Legal langsung bisa melihatnya. Kalau tidak perlu, tetap boleh dikirim ulang.
          </p>
        )}
      </div>

      {bisaKirim && (
        <div className="flex flex-col-reverse gap-2 border-t border-line bg-raised px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          {onUnggah && (
            <Tombol varian="kedua" ikon={<Upload className="h-4 w-4" />} onClick={onUnggah}>
              Unggah dokumen
            </Tombol>
          )}
          <Tombol ikon={<Send className="h-4 w-4" />} onClick={() => onKirimUlang(teksTanggapan(poin, tanggapan))}>
            Kirim ulang ke Legal
          </Tombol>
        </div>
      )}
    </motion.section>
  );
}

function DaftarPoin({ poin, pengantar }: { poin: string[]; pengantar: string }) {
  if (poin.length === 0) return <p className="text-sm text-muted">Tidak ada poin tertulis.</p>;
  return (
    <>
      {pengantar && <p className="mb-2 text-sm text-muted">{pengantar}</p>}
      <ol className="space-y-1.5 text-sm">
        {poin.map((p, i) => (
          <li key={i} className="flex gap-2">
            <span className="angka shrink-0 font-semibold text-muted">{i + 1}.</span>
            <span className="min-w-0 break-words">{p}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

function RingkasSejak({ sejak }: { sejak: ReturnType<typeof sejakRevisi> | null }) {
  if (!sejak) {
    return (
      <div className="space-y-2" role="status" aria-label="Memuat perubahan">
        <Kerangka className="h-4 w-2/3" />
      </div>
    );
  }
  if (!sejak.ringkasan.length) return <p className="text-sm text-muted">Belum ada perubahan tercatat.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {sejak.ringkasan.map((r) => (
        <li key={r} className="flex items-start gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <span className="min-w-0 break-words">{r}</span>
        </li>
      ))}
      {sejak.dokumenBaru.length > 0 && (
        <li className="flex flex-wrap gap-1.5 pl-6">
          {sejak.dokumenBaru.slice(0, 5).map((d) => (
            <a key={d.id} href={d.webUrl} target="_blank" rel="noreferrer" title={d.nama}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-xs font-semibold hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3">
              <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{d.nama}</span>
            </a>
          ))}
        </li>
      )}
    </ul>
  );
}
