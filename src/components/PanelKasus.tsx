// Panel "Kasus" di halaman detail (K02 tahap 2): register peringatan, somasi, sengketa, pemutusan, dan klaim
// untuk satu kontrak. Khusus Legal/Admin di Ruang Admin; pemanggil wajib menyembunyikannya dari Ruang Pengguna
// dan Pemantau. Isinya tidak pernah ditulis ke list Aktivitas (yang terbaca pengaju).
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarClock, Check, Gavel, Lock, Pencil, Plus } from "lucide-react";
import { useMuat } from "../hooks/useMuat";
import { formatRelatif, formatTanggal, hariIni } from "../lib/format";
import { EASE_KELUAR } from "../lib/gerak";
import { pesanError } from "../lib/graph";
import { umpanBalik } from "../lib/umpanBalik";
import {
  JENIS_KASUS,
  JENIS_MEMICU_SENGKETA,
  KETERANGAN_JENIS_KASUS,
  STATUS_KASUS,
  kasusKosong,
  lewatBatas,
  rapikanKasus,
  ringkasKasus,
  urutkanKasus,
  validasiKasus,
  type JenisKasus,
  type Kasus,
  type KasusInput,
} from "../lib/kasus";
import type { Kontrak } from "../lib/types";
import { ambilKasus, simpanKasus } from "../services/kasus";
import { AksiModal, Isian, Kerangka, Kosong, KotakError, Lencana, Modal, Tombol, cx } from "./ui";

const NADA_JENIS: Record<JenisKasus, "netral" | "peringatan" | "bahaya"> = {
  Peringatan: "peringatan",
  Somasi: "peringatan",
  Sengketa: "bahaya",
  Pemutusan: "bahaya",
  Klaim: "bahaya",
  Lainnya: "netral",
};

export default function PanelKasus({ k, onFlagBerubah }: { k: Kontrak; onFlagBerubah: () => void }) {
  const q = useMuat(() => ambilKasus(k.id), [k.id]);
  const [form, setForm] = useState<{ id?: number; isi: KasusInput } | null>(null);
  const [sibuk, setSibuk] = useState<number | null>(null);
  const kurangiGerak = useReducedMotion();
  const hari = hariIni();
  const daftar = urutkanKasus(q.data ?? []);
  const r = ringkasKasus(daftar, hari);

  const simpan = async (isi: KasusInput, id?: number): Promise<boolean> => {
    try {
      const h = await simpanKasus(k, rapikanKasus(isi, hari), id);
      umpanBalik.berhasil(id != null ? "Kasus diperbarui." : "Kasus tercatat.", { teks: "Hanya Legal dan Admin yang bisa melihatnya." });
      if (!h.flagTersimpan) umpanBalik.peringatan("Kasus tersimpan, tetapi lencana sengketa di kontrak belum diperbarui.", { teks: "Pastikan kolom AdaSengketa (Ya/Tidak) sudah dibuat di list Kontrak." });
      if (h.adaSengketa !== k.adaSengketa) onFlagBerubah();
      await q.muatUlang();
      return true;
    } catch (err) {
      umpanBalik.gagal(err, "Kasus belum tersimpan");
      return false;
    }
  };

  const tandaiSelesai = async (x: Kasus) => {
    setSibuk(x.id);
    await simpan({ ...x, status: "Selesai", tanggalSelesai: hari }, x.id);
    setSibuk(null);
  };

  return (
    <section className="kartu overflow-hidden" aria-labelledby={`kasus-${k.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={`kasus-${k.id}`} className="flex flex-wrap items-center gap-2 font-bold">
            <Gavel className="h-4 w-4 text-brand" aria-hidden="true" /> Kasus
            {r.total > 0 && <span className="angka rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-muted">{r.total}</span>}
            {r.terbuka > 0 && <Lencana nada="peringatan">{r.terbuka} terbuka</Lencana>}
            {r.lewat > 0 && <Lencana nada="bahaya">{r.lewat} lewat batas</Lencana>}
          </h2>
          <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted">
            <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Peringatan, somasi, sengketa, pemutusan, dan klaim. Khusus Legal dan Admin; tidak terlihat oleh pengaju.
          </p>
        </div>
        <Tombol kecil ikon={<Plus className="h-4 w-4" />} onClick={() => setForm({ isi: kasusKosong(hari) })}>
          Catat kasus
        </Tombol>
      </div>

      {q.loading && !q.data ? (
        <div className="space-y-3 p-5" role="status" aria-label="Memuat kasus">
          <Kerangka className="h-4 w-40" />
          <Kerangka className="h-16 w-full rounded-2xl" />
        </div>
      ) : q.error && !q.data ? (
        <div className="p-4">
          <KotakError error={q.error} ulangi={() => void q.muatUlang()} />
        </div>
      ) : daftar.length === 0 ? (
        <Kosong judul="Belum ada kasus" teks="Catat surat peringatan, somasi, atau sengketa di sini supaya riwayatnya tidak tersebar di email pribadi." ikon={<Gavel className="h-6 w-6" />} />
      ) : (
        <ul className="divide-y divide-line">
          {daftar.map((x, i) => (
            <motion.li
              key={x.id}
              initial={kurangiGerak ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_KELUAR, delay: kurangiGerak ? 0 : Math.min(i, 8) * 0.04 }}
              className="px-5 py-4 sm:px-6"
            >
              <ItemKasus x={x} hari={hari} sibuk={sibuk === x.id} onUbah={() => setForm({ id: x.id, isi: x })} onSelesai={() => void tandaiSelesai(x)} />
            </motion.li>
          ))}
        </ul>
      )}

      {form && (
        <FormKasus
          awal={form.isi}
          baru={form.id == null}
          onTutup={() => setForm(null)}
          onSimpan={async (isi) => {
            const ok = await simpan(isi, form.id);
            if (ok) setForm(null);
            return ok;
          }}
        />
      )}
    </section>
  );
}

function ItemKasus({ x, hari, sibuk, onUbah, onSelesai }: { x: Kasus; hari: string; sibuk: boolean; onUbah: () => void; onSelesai: () => void }) {
  const [lengkap, setLengkap] = useState(false);
  const panjang = x.uraian.length > 220;
  const lewat = lewatBatas(x, hari);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <Lencana nada={NADA_JENIS[x.jenis]}>{x.jenis}</Lencana>
        <Lencana nada={x.status === "Selesai" ? "sukses" : "netral"}>{x.status}</Lencana>
        {lewat && <Lencana nada="bahaya">Lewat batas tindak lanjut</Lencana>}
        <span className="text-xs text-muted">{formatTanggal(x.tanggal)}</span>
      </div>
      <p className="mt-1.5 break-words font-semibold">{x.judul}</p>
      {x.uraian && (
        <div className="mt-1">
          <p className={cx("whitespace-pre-wrap break-words text-sm", panjang && !lengkap && "line-clamp-3")}>{x.uraian}</p>
          {panjang && (
            <button type="button" onClick={() => setLengkap((v) => !v)} className="mt-0.5 min-h-8 text-xs font-semibold text-brand hover:text-brand-strong [@media(pointer:coarse)]:min-h-11" aria-expanded={lengkap}>
              {lengkap ? "Ringkas" : "Selengkapnya"}
            </button>
          )}
        </div>
      )}
      {x.tindakLanjut && (
        <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-raised px-3 py-2 text-sm">
          <span className="font-semibold">Tindak lanjut: </span>
          {x.tindakLanjut}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {x.batasTindakLanjut && x.status === "Terbuka" && (
          <span className={cx("inline-flex items-center gap-1", lewat && "font-semibold text-danger")}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Batas {formatTanggal(x.batasTindakLanjut)}
          </span>
        )}
        {x.status === "Selesai" && x.tanggalSelesai && <span>Selesai {formatTanggal(x.tanggalSelesai)}</span>}
        <span>
          Dicatat {x.dibuatOleh || "-"}
          {x.diubah && x.diubah !== x.dibuat ? ` · diubah ${x.diubahOleh || "-"} ${formatRelatif(x.diubah)}` : ""}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Tombol kecil varian="hantu" ikon={<Pencil className="h-3.5 w-3.5" />} disabled={sibuk} onClick={onUbah}>
          Ubah
        </Tombol>
        {x.status === "Terbuka" && (
          <Tombol kecil varian="kedua" memuat={sibuk} ikon={<Check className="h-3.5 w-3.5" />} onClick={onSelesai}>
            Tandai selesai
          </Tombol>
        )}
      </div>
    </div>
  );
}

function FormKasus({ awal, baru, onTutup, onSimpan }: { awal: KasusInput; baru: boolean; onTutup: () => void; onSimpan: (isi: KasusInput) => Promise<boolean> }) {
  const [isi, setIsi] = useState<KasusInput>(() => ({ ...awal }));
  const [galat, setGalat] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const ubah = <K extends keyof KasusInput>(kunci: K, nilai: KasusInput[K]) => setIsi((v) => ({ ...v, [kunci]: nilai }));

  const kirim = async () => {
    const g = validasiKasus(isi);
    if (g) return setGalat(g);
    setGalat("");
    setMenyimpan(true);
    try {
      await onSimpan(isi);
    } catch (err) {
      setGalat(pesanError(err));
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <Modal judul={baru ? "Catat kasus" : "Ubah kasus"} onTutup={onTutup} lebar="max-w-xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <Isian label="Judul" wajib className="sm:col-span-2">
          <input className="input" value={isi.judul} maxLength={200} onChange={(e) => ubah("judul", e.target.value)} placeholder="Mis. SP1 keterlambatan pekerjaan tahap 2" autoFocus />
        </Isian>
        <Isian label="Jenis" wajib bantuan={KETERANGAN_JENIS_KASUS[isi.jenis]}>
          <select className="input" value={isi.jenis} onChange={(e) => ubah("jenis", e.target.value as JenisKasus)}>
            {JENIS_KASUS.map((j) => (
              <option key={j}>{j}</option>
            ))}
          </select>
        </Isian>
        <Isian label="Status" wajib bantuan={JENIS_MEMICU_SENGKETA.includes(isi.jenis) ? 'Selama terbuka, kontrak berlencana "Ada sengketa" di Ruang Admin.' : undefined}>
          <select className="input" value={isi.status} onChange={(e) => ubah("status", e.target.value as KasusInput["status"])}>
            {STATUS_KASUS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Isian>
        <Isian label="Tanggal kejadian atau surat" wajib>
          <input type="date" className="input" value={isi.tanggal ?? ""} max={hariIni()} onChange={(e) => ubah("tanggal", e.target.value || null)} />
        </Isian>
        <Isian label="Batas tindak lanjut (opsional)" bantuan="Mis. tenggat jawaban somasi.">
          <input type="date" className="input" value={isi.batasTindakLanjut ?? ""} min={isi.tanggal ?? undefined} onChange={(e) => ubah("batasTindakLanjut", e.target.value || null)} />
        </Isian>
        <Isian label="Uraian" className="sm:col-span-2" bantuan="Kronologi singkat, pihak yang terlibat, dan dasar kontraknya (pasal).">
          <textarea className="input min-h-[110px]" value={isi.uraian} onChange={(e) => ubah("uraian", e.target.value)} />
        </Isian>
        <Isian label="Tindak lanjut" className="sm:col-span-2" bantuan="Langkah yang sudah atau akan diambil, beserta nomor surat bila ada.">
          <textarea className="input min-h-[80px]" value={isi.tindakLanjut} onChange={(e) => ubah("tindakLanjut", e.target.value)} />
        </Isian>
        <AnimatePresence initial={false}>
          {isi.status === "Selesai" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden sm:col-span-2">
              <Isian label="Tanggal selesai" bantuan="Kosong berarti hari ini.">
                <input type="date" className="input" value={isi.tanggalSelesai ?? ""} min={isi.tanggal ?? undefined} max={hariIni()} onChange={(e) => ubah("tanggalSelesai", e.target.value || null)} />
              </Isian>
            </motion.div>
          )}
        </AnimatePresence>
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
        <Tombol memuat={menyimpan} onClick={() => void kirim()}>
          Simpan
        </Tombol>
      </AksiModal>
    </Modal>
  );
}
