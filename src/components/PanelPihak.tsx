// Identitas pihak lain di detail kontrak, dan riwayat kontrak dengan mitra yang sama.
//
// Identitas (NPWP, alamat, penandatangan, jabatan, dasar kewenangan) disalin PER KONTRAK, bukan dirujuk
// dari master: penandatangan dan kewenangannya bisa berganti, sedangkan kontrak yang sudah ditandatangani
// harus tetap mencatat siapa yang menandatangani saat itu. Master hanya sumber usulan.
//
// Kontak perorangan (email, telepon) hanya untuk Legal/Admin di Ruang Admin (UU PDP).
//
// "Pihak lain dan perannya" (U11): penjamin, anggota KSO, pemberi kerja, dsb. Disimpan di kolom PihakLain
// sebagai kolom pelengkap, jadi kolom yang belum dibuat tidak menggagalkan penyimpanan identitas.
import { useId, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardCopy, FileSignature, History, Mail, Pencil, Phone, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useRuang } from "../context/RuangContext";
import { useSesi } from "../context/SesiContext";
import { useMuat } from "../hooks/useMuat";
import { adalahLegal, bisaUbah } from "../lib/alur";
import { formatTanggal } from "../lib/format";
import { EASE_KELUAR } from "../lib/gerak";
import { pesanError } from "../lib/graph";
import { cariMitraPersis, formatNpwp, kontrakDenganMitra, kurangKomparisi, pihakDariKontrak, pihakKosong, ringkasMitra, teksKomparisi, usulanIdentitas, validasiNpwp, type PihakKontrak } from "../lib/mitra";
import { teksNilai } from "../lib/mou";
import { MAKS_PIHAK_LAIN, PERAN_PIHAK_USULAN, rapikanPihakLain, samaPihakLain, validasiPihakLain, type PihakLain } from "../lib/pihakLain";
import { JENIS_ADDENDUM, type Kontrak, type Mitra } from "../lib/types";
import { simpanPihakLain, ubahKontrak } from "../services/kontrak";
import { ambilSemuaMitra, ubahMitra } from "../services/mitra";
import { Isian, Kerangka, Lencana, LencanaStatus, Tombol, cx } from "./ui";

/** Master mitra untuk panel. Gagal memuat tidak menggagalkan panel: usulan dari master saja yang hilang. */
function useMasterMitra() {
  return useMuat(() => ambilSemuaMitra().catch(() => [] as Mitra[]), []);
}

function masterUntuk(k: Kontrak, daftar: readonly Mitra[]): Mitra | null {
  return (k.mitraId != null ? daftar.find((m) => m.id === k.mitraId) : undefined) ?? cariMitraPersis(k.mitra, daftar);
}

async function salinTeks(teks: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(teks);
      return true;
    }
  } catch {
    // Jatuh ke cara lama di bawah (mis. halaman tidak dalam konteks aman).
  }
  const ta = document.createElement("textarea");
  ta.value = teks;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}

async function salinKomparisi(p: PihakKontrak) {
  const ok = await salinTeks(teksKomparisi(p));
  if (!ok) return toast.error("Tidak bisa menyalin otomatis. Blok teksnya lalu salin manual, ya.");
  const kurang = kurangKomparisi(p);
  if (kurang.length) toast.warning(`Teks disalin, tapi ${kurang.join(", ")} masih kosong dan ditandai di teksnya.`);
  else toast.success("Teks komparisi disalin. Tinggal tempel ke draf perjanjian.");
}

// --- Identitas pihak lain -------------------------------------------------------------------

export function PanelPihak({ k, semua, onBerubah }: { k: Kontrak; semua: readonly Kontrak[] | null | undefined; onBerubah?: () => void }) {
  const { sesi } = useSesi();
  const { ruang } = useRuang();
  const masterQ = useMasterMitra();
  const legal = adalahLegal(sesi) && ruang === "admin";
  const bolehUbah = legal && bisaUbah(k, sesi);
  const [mengubah, setMengubah] = useState(false);

  const pihak = pihakDariKontrak(k);
  const kosong = pihakKosong(pihak);
  const daftarMitra = masterQ.data ?? [];
  const master = masterUntuk(k, daftarMitra);
  const usulan = useMemo(() => (legal && semua ? usulanIdentitas(k, semua, masterQ.data ?? []) : null), [legal, k, semua, masterQ.data]);
  const npwp = validasiNpwp(pihak.npwp);

  return (
    <section className="kartu overflow-hidden" aria-labelledby={`pihak-${k.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={`pihak-${k.id}`} className="flex items-center gap-2 font-bold">
            <FileSignature className="h-4 w-4" aria-hidden="true" /> Identitas pihak lain
          </h2>
          <p className="truncate text-xs text-muted">{k.mitra || "Mitra belum diisi"} · dicatat khusus untuk kontrak ini</p>
        </div>
        {!mengubah && (
          <div className="flex flex-wrap gap-2">
            {legal && !kosong && (
              <Tombol kecil varian="kedua" ikon={<ClipboardCopy className="h-4 w-4" />} onClick={() => void salinKomparisi(pihak)}>
                Salin teks komparisi
              </Tombol>
            )}
            {bolehUbah && (
              <Tombol kecil varian={kosong ? "utama" : "kedua"} ikon={<Pencil className="h-4 w-4" />} onClick={() => setMengubah(true)}>
                {kosong ? "Isi identitas" : "Ubah"}
              </Tombol>
            )}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {mengubah ? (
          <motion.div key="ubah" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.3, ease: EASE_KELUAR }}>
            <FormPihak
              k={k}
              awal={pihak}
              usulan={usulan}
              master={master}
              onBatal={() => setMengubah(false)}
              onTersimpan={() => {
                setMengubah(false);
                onBerubah?.();
              }}
            />
          </motion.div>
        ) : (
          <motion.div key="lihat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.25, ease: EASE_KELUAR }} className="px-5 py-5 sm:px-6">
            {kosong ? (
              <div className="text-sm text-muted">
                <p>{legal ? "Belum ada identitas pihak lain untuk kontrak ini." : "Identitas pihak lain akan dilengkapi Legal saat menyusun draf perjanjian."}</p>
                {legal && usulan && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
                    {usulan.sumber === "kontrak" && usulan.dari
                      ? `Bisa diisi otomatis dari ${usulan.dari.nomorKontrak || usulan.dari.nomorPengajuan}, kontrak terakhir dengan mitra ini.`
                      : "Bisa diisi otomatis dari data mitra."}
                  </p>
                )}
              </div>
            ) : (
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Data label="NPWP">
                  {pihak.npwp ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="angka font-mono">{formatNpwp(pihak.npwp)}</span>
                      {!npwp.sah && <Lencana nada="peringatan">Format perlu dicek</Lencana>}
                    </span>
                  ) : (
                    "-"
                  )}
                </Data>
                <Data label="Dasar kewenangan">{pihak.dasarKewenangan || "-"}</Data>
                <Data label="Alamat" className="sm:col-span-2">
                  {pihak.alamat || "-"}
                </Data>
                <Data label="Penandatangan">{pihak.penandatangan || "-"}</Data>
                <Data label="Jabatan">{pihak.jabatan || "-"}</Data>
              </dl>
            )}

            <DaftarPihakLain daftar={k.pihakLain} legal={legal} />

            {legal && master && (master.email || master.telepon) && (
              <div className="mt-5 rounded-xl bg-raised px-4 py-3">
                <p className="label !mb-1">Kontak mitra (data mitra, khusus Legal)</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  {master.email && (
                    <a href={`mailto:${master.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-brand hover:underline [@media(pointer:coarse)]:min-h-11">
                      <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{master.email}</span>
                    </a>
                  )}
                  {master.telepon && (
                    <a href={`tel:${master.telepon.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-brand hover:underline [@media(pointer:coarse)]:min-h-11">
                      <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="angka">{master.telepon}</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Tampilan "Pihak lain dan perannya". Kosong: hanya petunjuk singkat untuk Legal. */
function DaftarPihakLain({ daftar, legal }: { daftar: readonly PihakLain[]; legal: boolean }) {
  if (daftar.length === 0) {
    return legal ? <p className="mt-4 text-xs text-muted">Pihak lain (penjamin, anggota KSO, pemberi kerja, dsb.) belum dicatat.</p> : null;
  }
  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="label !mb-2 flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" aria-hidden="true" /> Pihak lain dan perannya
      </p>
      <ul className="space-y-1.5">
        {daftar.map((p, i) => (
          <li key={`${p.nama}-${i}`} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
            <span className="min-w-0 break-words font-semibold">{p.nama}</span>
            {p.peran && <span className="rounded-full bg-raised px-2 py-0.5 text-xs text-muted">{p.peran}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Isian baris "nama + peran" untuk pihak lain. Di ponsel setiap baris bertumpuk. */
function IsianPihakLain({ nilai, onUbah }: { nilai: PihakLain[]; onUbah: (d: PihakLain[]) => void }) {
  const idDaftar = useId();
  const ubahBaris = (i: number, kunci: keyof PihakLain, v: string) => onUbah(nilai.map((p, j) => (j === i ? { ...p, [kunci]: v } : p)));
  return (
    <fieldset className="min-w-0 rounded-xl border border-line px-4 py-3">
      <legend className="label !mb-0 px-1">Pihak lain dan perannya (opsional)</legend>
      <p className="mb-3 text-xs text-muted">Pihak di luar WKI dan mitra utama yang ikut dalam kontrak, mis. penjamin atau anggota KSO.</p>
      <datalist id={idDaftar}>
        {PERAN_PIHAK_USULAN.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {nilai.length > 0 && (
        <ul className="space-y-3">
          {nilai.map((p, i) => (
            <li key={i} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto] sm:items-end">
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-semibold text-muted">Nama pihak {i + 1}</span>
                <input className="input" value={p.nama} maxLength={150} onChange={(e) => ubahBaris(i, "nama", e.target.value)} placeholder="Mis. PT Bank ABC" autoComplete="off" />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-semibold text-muted">Peran</span>
                <input className="input" list={idDaftar} value={p.peran} maxLength={80} onChange={(e) => ubahBaris(i, "peran", e.target.value)} placeholder="Mis. Penjamin" autoComplete="off" />
              </label>
              <button
                type="button"
                onClick={() => onUbah(nilai.filter((_, j) => j !== i))}
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 justify-self-start rounded-xl px-3 text-sm font-semibold text-danger hover:bg-danger-soft sm:justify-self-auto"
                aria-label={`Hapus pihak ${i + 1}${p.nama ? ` (${p.nama})` : ""}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="sm:sr-only">Hapus</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {nilai.length < MAKS_PIHAK_LAIN && (
        <Tombol type="button" kecil varian="kedua" className={nilai.length ? "mt-3" : undefined} ikon={<Plus className="h-4 w-4" />} onClick={() => onUbah([...nilai, { nama: "", peran: "" }])}>
          Tambah pihak
        </Tombol>
      )}
    </fieldset>
  );
}

function Data({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <dt className="label !mb-0.5">{label}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

function FormPihak({
  k,
  awal,
  usulan,
  master,
  onBatal,
  onTersimpan,
}: {
  k: Kontrak;
  awal: PihakKontrak;
  usulan: ReturnType<typeof usulanIdentitas>;
  master: Mitra | null;
  onBatal: () => void;
  onTersimpan: () => void;
}) {
  const { sesi } = useSesi();
  // Kontrak yang belum berisi identitas langsung diisi dari usulan; Legal tetap memeriksa sebelum menyimpan.
  const isiOtomatis = pihakKosong(awal) && usulan != null;
  const [form, setForm] = useState<PihakKontrak>(isiOtomatis ? { ...usulan.pihak, nama: awal.nama } : awal);
  const [sumberIsi, setSumberIsi] = useState<typeof usulan>(isiOtomatis ? usulan : null);
  const [lengkapiMaster, setLengkapiMaster] = useState(true);
  const [pihakLain, setPihakLain] = useState<PihakLain[]>(() => k.pihakLain.map((p) => ({ ...p })));
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");

  const npwp = validasiNpwp(form.npwp);
  const ubah = (kunci: keyof PihakKontrak) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [kunci]: e.target.value }));
  const masterBisaDilengkapi = master != null && ((!master.npwp.trim() && npwp.sah && npwp.digit !== "") || (!master.alamat.trim() && form.alamat.trim() !== ""));

  const simpan = async () => {
    setGalat("");
    if (!npwp.sah) return setGalat(npwp.pesan);
    const galatPihak = validasiPihakLain(pihakLain);
    if (galatPihak) return setGalat(galatPihak);
    setMenyimpan(true);
    const peringatan: string[] = [];
    try {
      const catatan = await ubahKontrak(
        k,
        {
          npwpMitra: formatNpwp(form.npwp),
          alamatMitra: form.alamat,
          penandatanganMitra: form.penandatangan,
          jabatanMitra: form.jabatan,
          dasarKewenangan: form.dasarKewenangan,
          ...(k.mitraId == null && master ? { mitraId: master.id } : {}),
        },
        sesi,
      );
      peringatan.push(...catatan);
      const rapi = rapikanPihakLain(pihakLain);
      if (!samaPihakLain(k.pihakLain, rapi)) peringatan.push(...(await simpanPihakLain(k, rapi, sesi)).peringatan);
    } catch (err) {
      setGalat(pesanError(err));
      setMenyimpan(false);
      return;
    }
    if (masterBisaDilengkapi && lengkapiMaster && master) {
      try {
        await ubahMitra(master.id, {
          ...(!master.npwp.trim() && npwp.digit ? { npwp: formatNpwp(form.npwp) } : {}),
          ...(!master.alamat.trim() && form.alamat.trim() ? { alamat: form.alamat } : {}),
        });
      } catch (err) {
        toast.warning(`Identitas tersimpan, tetapi data mitra belum ikut diperbarui: ${pesanError(err)}`);
      }
    }
    toast.success("Identitas pihak lain tersimpan.");
    for (const p of peringatan) toast.warning(p, { duration: 10_000 });
    onTersimpan();
  };

  return (
    <form
      className="space-y-4 px-5 py-5 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        void simpan();
      }}
    >
      {sumberIsi ? (
        <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3.5 py-2.5 text-sm text-info" role="status">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {sumberIsi.sumber === "kontrak" && sumberIsi.dari ? `Diisi dari ${sumberIsi.dari.nomorKontrak || sumberIsi.dari.nomorPengajuan}, kontrak terakhir dengan mitra ini.` : "Diisi dari data mitra."} Periksa lagi sebelum
            menyimpan, terutama penandatangan dan kewenangannya.
          </span>
        </p>
      ) : (
        usulan && (
          <button
            type="button"
            onClick={() => {
              setForm({ ...usulan.pihak, nama: awal.nama });
              setSumberIsi(usulan);
            }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-strong hover:underline [@media(pointer:coarse)]:min-h-11"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Isi dari {usulan.sumber === "kontrak" && usulan.dari ? usulan.dari.nomorKontrak || usulan.dari.nomorPengajuan : "data mitra"}
          </button>
        )
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Isian label="NPWP" bantuan={npwp.sah ? "15 digit (format lama) atau 16 digit." : undefined}>
          <input
            className={cx("input angka font-mono", !npwp.sah && "!border-danger")}
            inputMode="numeric"
            autoComplete="off"
            value={form.npwp}
            onChange={ubah("npwp")}
            onBlur={() => npwp.sah && setForm((f) => ({ ...f, npwp: formatNpwp(f.npwp) }))}
            aria-invalid={!npwp.sah}
            aria-describedby={!npwp.sah ? "npwp-galat" : undefined}
            placeholder="01.234.567.8-901.234"
          />
          {!npwp.sah && (
            <span id="npwp-galat" role="alert" className="mt-1 block text-xs text-danger">
              {npwp.pesan}
            </span>
          )}
        </Isian>
        <Isian label="Dasar kewenangan" bantuan="Mis. Akta No. 12 tgl 3 Mei 2024, atau Surat Kuasa No. ...">
          <input className="input" value={form.dasarKewenangan} onChange={ubah("dasarKewenangan")} />
        </Isian>
        <Isian label="Alamat" className="sm:col-span-2">
          <textarea className="input min-h-[76px] resize-y" value={form.alamat} onChange={ubah("alamat")} rows={2} />
        </Isian>
        <Isian label="Nama penandatangan">
          <input className="input" value={form.penandatangan} onChange={ubah("penandatangan")} autoComplete="off" />
        </Isian>
        <Isian label="Jabatan">
          <input className="input" value={form.jabatan} onChange={ubah("jabatan")} placeholder="Direktur Utama" />
        </Isian>
      </div>

      <IsianPihakLain nilai={pihakLain} onUbah={setPihakLain} />

      {masterBisaDilengkapi && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--wh-brand)]" checked={lengkapiMaster} onChange={(e) => setLengkapiMaster(e.target.checked)} />
          <span>
            Lengkapi juga NPWP/alamat yang masih kosong di data mitra <span className="font-semibold">{master?.nama}</span>
          </span>
        </label>
      )}

      <div className="rounded-xl bg-raised px-4 py-3">
        <p className="label !mb-1">Pratinjau komparisi</p>
        <p className="text-sm leading-relaxed">{teksKomparisi(form)}</p>
      </div>

      {galat && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {galat}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Tombol type="button" varian="hantu" onClick={() => void salinKomparisi(form)} ikon={<ClipboardCopy className="h-4 w-4" />}>
          Salin teks komparisi
        </Tombol>
        <Tombol type="button" varian="kedua" onClick={onBatal} disabled={menyimpan}>
          Batal
        </Tombol>
        <Tombol type="submit" memuat={menyimpan}>
          Simpan
        </Tombol>
      </div>
    </form>
  );
}

// --- Riwayat dengan mitra ini (khusus Legal) ---------------------------------------------------

const BATAS_AWAL = 5;

/** Kontrak lain dengan mitra yang sama. Hanya untuk Legal/Admin di Ruang Admin; selain itu tidak dirender. */
export function PanelRiwayatMitra({ k, semua }: { k: Kontrak; semua: readonly Kontrak[] | null | undefined }) {
  const { sesi } = useSesi();
  const { ruang, ke } = useRuang();
  const masterQ = useMasterMitra();
  const [semuaTampil, setSemuaTampil] = useState(false);
  const legal = adalahLegal(sesi) && ruang === "admin";

  const lain = useMemo(() => (legal && semua ? kontrakDenganMitra(k, semua, masterQ.data ?? []) : []), [legal, k, semua, masterQ.data]);
  const ring = useMemo(() => ringkasMitra(lain), [lain]);
  if (!legal || !k.mitra.trim()) return null;

  const tampil = semuaTampil ? lain : lain.slice(0, BATAS_AWAL);
  return (
    <section className="kartu overflow-hidden" aria-labelledby={`riwayat-mitra-${k.id}`}>
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <h2 id={`riwayat-mitra-${k.id}`} className="flex items-center gap-2 font-bold">
          <History className="h-4 w-4" aria-hidden="true" /> Riwayat dengan mitra ini
          {lain.length > 0 && <span className="angka rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-muted">{lain.length}</span>}
        </h2>
        <p className="text-xs text-muted">
          {lain.length === 0
            ? "Khusus Legal. Kontrak lain dengan mitra yang sama akan muncul di sini."
            : [`${ring.aktif} aktif`, ring.berjalan ? `${ring.berjalan} masih diproses` : "", ring.terakhirBerakhir ? `terakhir berakhir ${formatTanggal(ring.terakhirBerakhir)}` : ""].filter(Boolean).join(" · ")}
        </p>
      </div>
      {!semua || masterQ.loading ? (
        <div className="space-y-3 px-5 py-4 sm:px-6" role="status" aria-label="Memuat riwayat mitra">
          <Kerangka className="h-4 w-3/4" />
          <Kerangka className="h-4 w-1/2" />
        </div>
      ) : lain.length === 0 ? (
        <p className="px-5 py-5 text-sm text-muted sm:px-6">Ini kontrak pertama dengan {k.mitra}.</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {tampil.map((x) => (
              <li key={x.id}>
                <Link to={ke.detail(x.id)} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-raised sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold transition-colors group-hover:text-brand">{x.judul}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      <span className="font-mono">{x.nomorKontrak || x.nomorPengajuan}</span> · <span className="angka">{teksNilai(x)}</span> · berakhir{" "}
                      {formatTanggal(x.jenis === JENIS_ADDENDUM ? x.tanggalBerakhir : (x.berakhirEfektif ?? x.tanggalBerakhir))}
                    </p>
                  </div>
                  <LencanaStatus status={x.status} />
                </Link>
              </li>
            ))}
          </ul>
          {lain.length > BATAS_AWAL && (
            <div className="border-t border-line px-5 py-3 sm:px-6">
              <button type="button" onClick={() => setSemuaTampil((s) => !s)} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:text-brand-strong hover:underline" aria-expanded={semuaTampil}>
                {semuaTampil ? "Ringkas lagi" : `Tampilkan semua (${lain.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
