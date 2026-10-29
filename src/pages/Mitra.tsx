// Data mitra (master ringan) untuk Legal/Admin: nama resmi, nama lain, NPWP, alamat, kontak.
// Sengaja TANPA status diblokir/verifikasi vendor (wewenang SCM/Pengadaan) dan tanpa gabung otomatis:
// nama yang mirip hanya ditandai, manusia yang memutuskan.
import { useMemo, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Building2, CircleAlert, Import, Pencil, Plus, Power, PowerOff, Search } from "lucide-react";
import { toast } from "sonner";
import { useRuang } from "../context/RuangContext";
import { useSesi } from "../context/SesiContext";
import { useMuat } from "../hooks/useMuat";
import { adalahLegal } from "../lib/alur";
import { formatTanggal, formatUang } from "../lib/format";
import { EASE_KELUAR } from "../lib/gerak";
import { pesanError } from "../lib/graph";
import { cariMitraSerupa, formatNpwp, kunciMitra, petaKontrakPerMitra, ringkasMitra, usulanImporMitra, validasiNpwp, type RingkasanMitra, type UsulanImpor } from "../lib/mitra";
import { teksNilai } from "../lib/mou";
import type { Kontrak, Mitra as DataMitra, MitraInput } from "../lib/types";
import { ambilSemuaKontrak } from "../services/kontrak";
import { ambilSemuaMitra, tambahMitra, ubahMitra } from "../services/mitra";
import { AksiModal, Isian, KepalaHalaman, KerangkaHalaman, Kosong, KotakError, Lencana, LencanaStatus, Modal, Segmen, Tombol, cx } from "../components/ui";
import WadahGulir from "../components/WadahGulir";

type Saring = "aktif" | "nonaktif" | "semua";
type Urut = "nama" | "kontrak" | "berakhir";

interface Baris {
  m: DataMitra;
  kontrak: Kontrak[];
  ring: RingkasanMitra;
}

export default function Mitra() {
  const { sesi } = useSesi();
  const q = useMuat(() => Promise.all([ambilSemuaMitra(), ambilSemuaKontrak()]), []);
  const [cari, setCari] = useState("");
  const [saring, setSaring] = useState<Saring>("aktif");
  const [urut, setUrut] = useState<Urut>("nama");
  const [ubah, setUbah] = useState<DataMitra | "baru" | null>(null);
  const [rincian, setRincian] = useState<Baris | null>(null);
  const [impor, setImpor] = useState(false);

  const daftar = useMemo(() => q.data?.[0] ?? [], [q.data]);
  const kontrak = useMemo(() => q.data?.[1] ?? [], [q.data]);
  const baris = useMemo<Baris[]>(() => {
    const peta = petaKontrakPerMitra(daftar, kontrak);
    return daftar.map((m) => {
      const ks = peta.get(m.id) ?? [];
      return { m, kontrak: ks, ring: ringkasMitra(ks) };
    });
  }, [daftar, kontrak]);
  const usulan = useMemo(() => usulanImporMitra(daftar, kontrak), [daftar, kontrak]);

  const tampil = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    const kunci = kunciMitra(cari);
    const digit = cari.replace(/\D/g, "");
    return baris
      .filter((b) => (saring === "semua" ? true : saring === "aktif" ? b.m.aktif : !b.m.aktif))
      .filter((b) => {
        if (!kata) return true;
        if ([b.m.nama, ...b.m.namaLain].some((n) => n.toLowerCase().includes(kata) || (kunci && kunciMitra(n).includes(kunci)))) return true;
        return digit.length >= 4 && b.m.npwp.replace(/\D/g, "").includes(digit);
      })
      .sort((a, b) => {
        if (urut === "kontrak") return b.ring.jumlah - a.ring.jumlah || a.m.nama.localeCompare(b.m.nama, "id");
        if (urut === "berakhir") return (b.ring.terakhirBerakhir ?? "").localeCompare(a.ring.terakhirBerakhir ?? "") || a.m.nama.localeCompare(b.m.nama, "id");
        return a.m.nama.localeCompare(b.m.nama, "id");
      });
  }, [baris, cari, saring, urut]);

  if (!adalahLegal(sesi)) {
    return <Kosong judul="Halaman ini khusus Legal" teks="Data mitra dikelola oleh tim Legal. Hubungi Legal bila ada nama mitra yang perlu dirapikan." ikon={<Building2 className="h-6 w-6" />} />;
  }
  if (q.loading && !q.data) return <KerangkaHalaman />;
  if (q.error && !q.data) return <KotakError error={q.error} ulangi={() => void q.muatUlang()} />;

  const gantiAktif = async (m: DataMitra, aktif: boolean) => {
    try {
      await ubahMitra(m.id, { aktif });
      await q.muatUlang();
      toast.success(aktif ? `${m.nama} aktif lagi.` : `${m.nama} dinonaktifkan. Namanya tidak lagi disarankan saat pengajuan.`, {
        action: { label: "Urungkan", onClick: () => void ubahMitra(m.id, { aktif: !aktif }).then(q.muatUlang).catch((err) => toast.error(pesanError(err))) },
      });
    } catch (err) {
      toast.error(`Gagal menyimpan: ${pesanError(err)}`);
    }
  };

  return (
    <>
      <KepalaHalaman
        judul="Mitra"
        sub="Satu nama resmi untuk setiap mitra, supaya pengajuan dan laporan tidak terpecah karena beda penulisan."
        aksi={
          <>
            <Tombol varian="kedua" ikon={<Import className="h-4 w-4" />} onClick={() => setImpor(true)}>
              Impor dari kontrak
              {usulan.length > 0 && <span className="angka rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">{usulan.length}</span>}
            </Tombol>
            <Tombol ikon={<Plus className="h-4 w-4" />} onClick={() => setUbah("baru")}>
              Tambah mitra
            </Tombol>
          </>
        }
      />

      {usulan.length > 0 && daftar.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            Ada <span className="angka font-semibold">{usulan.length}</span> nama mitra di kontrak yang belum tercatat di sini.
          </p>
          <button type="button" onClick={() => setImpor(true)} className="inline-flex min-h-[44px] items-center px-2 font-semibold underline underline-offset-2 hover:no-underline">
            Tinjau
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Cari mitra</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input className="input !pl-10" type="search" enterKeyHint="search" autoComplete="off" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama, nama lain, atau NPWP…" />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Segmen
            id="saring-mitra"
            label="Saring status mitra"
            nilai={saring}
            onUbah={setSaring}
            pilihan={[
              { nilai: "aktif", label: "Aktif" },
              { nilai: "nonaktif", label: "Nonaktif" },
              { nilai: "semua", label: "Semua" },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-muted">
            Urutkan
            <select className="input !w-auto !py-2" value={urut} onChange={(e) => setUrut(e.target.value as Urut)}>
              <option value="nama">Nama</option>
              <option value="kontrak">Kontrak terbanyak</option>
              <option value="berakhir">Berakhir paling akhir</option>
            </select>
          </label>
        </div>
      </div>

      {daftar.length === 0 ? (
        <div className="kartu">
          <Kosong
            judul="Belum ada data mitra"
            teks={usulan.length ? `Mulai dari ${usulan.length} nama mitra yang sudah ada di kontrak. Anda bisa meninjau dulu sebelum menyimpan.` : "Tambahkan mitra pertama, atau impor dari kontrak yang sudah ada."}
            ikon={<Building2 className="h-6 w-6" />}
            aksi={
              usulan.length ? (
                <Tombol ikon={<Import className="h-4 w-4" />} onClick={() => setImpor(true)}>
                  Impor dari kontrak
                </Tombol>
              ) : (
                <Tombol ikon={<Plus className="h-4 w-4" />} onClick={() => setUbah("baru")}>
                  Tambah mitra
                </Tombol>
              )
            }
          />
        </div>
      ) : tampil.length === 0 ? (
        <div className="kartu">
          <Kosong judul="Tidak ada yang cocok" teks="Coba kata lain, atau ganti saringan statusnya." ikon={<Search className="h-6 w-6" />} />
        </div>
      ) : (
        <>
          {/* Ponsel: kartu per mitra. */}
          <ul className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:hidden">
            {tampil.map((b) => (
              <li key={b.m.id} className="kartu p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">{b.m.nama}</p>
                    {b.m.namaLain.length > 0 && <p className="teks-panjang mt-0.5 text-xs text-muted">juga: {b.m.namaLain.join(", ")}</p>}
                  </div>
                  {!b.m.aktif && <Lencana>Nonaktif</Lencana>}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="min-w-0">
                    <dt className="text-xs text-muted">NPWP</dt>
                    <dd className="angka break-all font-mono text-xs">{b.m.npwp ? formatNpwp(b.m.npwp) : "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Kontrak</dt>
                    <dd className="angka">
                      {b.ring.jumlah} <span className="text-xs text-muted">({b.ring.aktif} aktif)</span>
                    </dd>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <dt className="text-xs text-muted">Nilai aktif</dt>
                    <dd>
                      <NilaiAktif ring={b.ring} />
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Tombol kecil varian="kedua" className="min-h-10" onClick={() => setRincian(b)} aria-label={`Lihat ${b.ring.jumlah} kontrak dengan ${b.m.nama}`}>
                    Kontrak
                  </Tombol>
                  <Tombol kecil varian="kedua" className="min-h-10" ikon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setUbah(b.m)} aria-label={`Ubah ${b.m.nama}`}>
                    Ubah
                  </Tombol>
                  <Tombol
                    kecil
                    varian="hantu"
                    className="min-h-10"
                    ikon={b.m.aktif ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                    onClick={() => void gantiAktif(b.m, !b.m.aktif)}
                    aria-label={`${b.m.aktif ? "Nonaktifkan" : "Aktifkan"} ${b.m.nama}`}
                  >
                    {b.m.aktif ? "Nonaktifkan" : "Aktifkan"}
                  </Tombol>
                </div>
              </li>
            ))}
          </ul>

          <WadahGulir className="hidden lg:block">
            <table className="tabel w-full min-w-[860px]">
              <thead>
                <tr>
                  <th>Mitra</th>
                  <th>NPWP</th>
                  <th className="text-right">Kontrak</th>
                  <th>Nilai aktif</th>
                  <th>Terakhir berakhir</th>
                  <th>
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tampil.map((b, i) => (
                  <motion.tr key={b.m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.025, duration: 0.28, ease: EASE_KELUAR }} className="transition-colors hover:bg-raised">
                    <td className="max-w-[320px]">
                      <p className="flex items-center gap-2 font-semibold">
                        <span className="min-w-0 truncate" title={b.m.nama}>{b.m.nama}</span>
                        {!b.m.aktif && <Lencana>Nonaktif</Lencana>}
                      </p>
                      {b.m.namaLain.length > 0 && <p className="truncate text-xs text-muted">juga: {b.m.namaLain.join(", ")}</p>}
                    </td>
                    <td className="angka whitespace-nowrap font-mono text-xs">{b.m.npwp ? formatNpwp(b.m.npwp) : <span className="text-muted">-</span>}</td>
                    <td className="text-right">
                      <button type="button" onClick={() => setRincian(b)} className="angka -mr-2 inline-flex min-w-[2.75rem] items-center justify-end px-2 font-semibold text-brand hover:underline [@media(pointer:coarse)]:min-h-11" aria-label={`Lihat ${b.ring.jumlah} kontrak dengan ${b.m.nama}`}>
                        {b.ring.jumlah}
                      </button>
                      <p className="text-xs text-muted">
                        {b.ring.aktif} aktif{b.ring.berjalan ? ` · ${b.ring.berjalan} proses` : ""}
                      </p>
                    </td>
                    <td>
                      <NilaiAktif ring={b.ring} />
                    </td>
                    <td className="whitespace-nowrap">{formatTanggal(b.ring.terakhirBerakhir)}</td>
                    <td className="whitespace-nowrap text-right">
                      <div className="inline-flex gap-1.5">
                        <Tombol kecil varian="kedua" ikon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setUbah(b.m)}>
                          Ubah
                        </Tombol>
                        <Tombol
                          kecil
                          varian="hantu"
                          ikon={b.m.aktif ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                          onClick={() => void gantiAktif(b.m, !b.m.aktif)}
                          aria-label={`${b.m.aktif ? "Nonaktifkan" : "Aktifkan"} ${b.m.nama}`}
                        >
                          {b.m.aktif ? "Nonaktifkan" : "Aktifkan"}
                        </Tombol>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </WadahGulir>
        </>
      )}

      {ubah && (
        <FormMitra
          awal={ubah === "baru" ? null : ubah}
          daftar={daftar}
          onTutup={() => setUbah(null)}
          onTersimpan={async () => {
            setUbah(null);
            await q.muatUlang();
          }}
        />
      )}
      {rincian && <RincianMitra baris={rincian} onTutup={() => setRincian(null)} />}
      {impor && (
        <ImporMitra
          usulan={usulan}
          onTutup={() => setImpor(false)}
          onTersimpan={async () => {
            setImpor(false);
            await q.muatUlang();
          }}
        />
      )}
    </>
  );
}

function NilaiAktif({ ring }: { ring: RingkasanMitra }) {
  if (!ring.nilaiAktif.length) return <span className="text-sm text-muted">-</span>;
  return (
    <span className="flex flex-col">
      {ring.nilaiAktif.map((n) => (
        <span key={n.mataUang} className="angka whitespace-nowrap text-sm">
          {formatUang(n.nilai, n.mataUang)}
        </span>
      ))}
    </span>
  );
}

// --- Formulir mitra ---------------------------------------------------------------------------

type IsianMitra = Pick<MitraInput, "nama" | "npwp" | "alamat" | "email" | "telepon" | "aktif"> & { namaLainTeks: string };

function FormMitra({ awal, daftar, onTutup, onTersimpan }: { awal: DataMitra | null; daftar: readonly DataMitra[]; onTutup: () => void; onTersimpan: () => Promise<void> }) {
  const [form, setForm] = useState<IsianMitra>(() => ({
    nama: awal?.nama ?? "",
    npwp: awal?.npwp ?? "",
    alamat: awal?.alamat ?? "",
    email: awal?.email ?? "",
    telepon: awal?.telepon ?? "",
    aktif: awal?.aktif ?? true,
    namaLainTeks: awal?.namaLain.join("\n") ?? "",
  }));
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");

  const lain = useMemo(() => daftar.filter((m) => m.id !== awal?.id), [daftar, awal]);
  const namaLain = form.namaLainTeks
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const npwp = validasiNpwp(form.npwp);
  const mirip = useMemo(() => cariMitraSerupa(form.nama, lain, []).find((s) => s.alasan !== "persis"), [form.nama, lain]);
  const ubah = (kunci: keyof IsianMitra) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [kunci]: e.target.value }));

  const bentrok = (): string | null => {
    const kunciLain = new Map<string, string>();
    for (const m of lain) for (const n of [m.nama, ...m.namaLain]) kunciLain.set(kunciMitra(n), m.nama);
    for (const n of [form.nama, ...namaLain]) {
      const pemilik = kunciLain.get(kunciMitra(n));
      if (pemilik) return `“${n}” sudah tercatat sebagai ${pemilik === n ? "mitra" : `nama milik ${pemilik}`}.`;
    }
    return null;
  };

  const simpan = async () => {
    setGalat("");
    if (kunciMitra(form.nama).length < 2) return setGalat("Nama resmi mitra wajib diisi.");
    if (!npwp.sah) return setGalat(npwp.pesan);
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setGalat("Format email kontak belum benar.");
    const b = bentrok();
    if (b) return setGalat(b);

    const data = { nama: form.nama, npwp: formatNpwp(form.npwp), alamat: form.alamat, email: form.email, telepon: form.telepon, aktif: form.aktif, namaLain };
    setMenyimpan(true);
    try {
      if (awal) await ubahMitra(awal.id, data);
      else await tambahMitra({ ...data, penandatangan: "", jabatan: "", terverifikasi: false });
      toast.success(awal ? "Perubahan mitra tersimpan." : `${form.nama.trim()} masuk ke data mitra.`);
      await onTersimpan();
    } catch (err) {
      setGalat(pesanError(err));
      setMenyimpan(false);
    }
  };

  return (
    <Modal judul={awal ? "Ubah Mitra" : "Tambah Mitra"} onTutup={onTutup} lebar="max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void simpan();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Isian label="Nama resmi" wajib className="sm:col-span-2" bantuan="Tulis lengkap dengan bentuk badannya, mis. PT Beton Jaya Abadi Tbk.">
            <input className="input" value={form.nama} onChange={ubah("nama")} autoComplete="organization" autoFocus />
          </Isian>
          {mirip && (
            <p className="-mt-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent-ink sm:col-span-2" role="status">
              Mirip dengan <span className="font-semibold">{mirip.nama}</span> yang sudah ada. Bila itu badan yang sama, lebih baik tambahkan nama ini sebagai nama lainnya.
            </p>
          )}
          <Isian label="Nama lain" className="sm:col-span-2" bantuan="Satu per baris: singkatan, nama lama, atau penulisan yang sering dipakai.">
            <textarea className="input min-h-[72px] resize-y" rows={2} value={form.namaLainTeks} onChange={ubah("namaLainTeks")} />
          </Isian>
          <Isian label="NPWP">
            <input
              className={cx("input angka font-mono", !npwp.sah && "!border-danger")}
              inputMode="numeric"
              value={form.npwp}
              onChange={ubah("npwp")}
              onBlur={() => npwp.sah && setForm((f) => ({ ...f, npwp: formatNpwp(f.npwp) }))}
              aria-invalid={!npwp.sah}
              aria-describedby={!npwp.sah ? "mitra-npwp-galat" : undefined}
            />
            {!npwp.sah && (
              <span id="mitra-npwp-galat" role="alert" className="mt-1 block text-xs text-danger">
                {npwp.pesan}
              </span>
            )}
          </Isian>
          <div className="flex items-end sm:pb-0.5">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[var(--wh-brand)]" checked={form.aktif} onChange={(e) => setForm((f) => ({ ...f, aktif: e.target.checked }))} />
              Aktif (disarankan saat pengajuan)
            </label>
          </div>
          <Isian label="Alamat" className="sm:col-span-2">
            <textarea className="input min-h-[72px] resize-y" rows={2} value={form.alamat} onChange={ubah("alamat")} />
          </Isian>
          <Isian label="Email kontak" bantuan="Hanya terlihat oleh Legal.">
            <input className="input" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={form.email} onChange={ubah("email")} autoComplete="off" />
          </Isian>
          <Isian label="Telepon kontak" bantuan="Hanya terlihat oleh Legal.">
            <input className="input angka" type="tel" inputMode="tel" value={form.telepon} onChange={ubah("telepon")} autoComplete="off" />
          </Isian>
        </div>
        {galat && (
          <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            {galat}
          </p>
        )}
        <AksiModal>
          <Tombol type="button" varian="kedua" onClick={onTutup} disabled={menyimpan}>
            Batal
          </Tombol>
          <Tombol type="submit" memuat={menyimpan}>
            Simpan
          </Tombol>
        </AksiModal>
      </form>
    </Modal>
  );
}

// --- Rincian kontrak per mitra ---------------------------------------------------------------

function RincianMitra({ baris, onTutup }: { baris: Baris; onTutup: () => void }) {
  const { ke } = useRuang();
  const { m, kontrak, ring } = baris;
  return (
    <Modal judul={m.nama} onTutup={onTutup} lebar="max-w-2xl">
      <div className="grid grid-cols-3 gap-3">
        <Angka label="Kontrak" nilai={ring.jumlah} />
        <Angka label="Aktif" nilai={ring.aktif} />
        <Angka label="Diproses" nilai={ring.berjalan} />
      </div>
      <p className="mt-3 text-sm text-muted">
        Terakhir berakhir: <span className="text-ink">{formatTanggal(ring.terakhirBerakhir)}</span>
      </p>
      {kontrak.length === 0 ? (
        <Kosong judul="Belum ada kontrak" teks="Kontrak dengan mitra ini akan muncul di sini." />
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {kontrak.map((k) => (
            <li key={k.id}>
              <Link to={ke.detail(k.id)} onClick={onTutup} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-raised">
                <div className="min-w-0 flex-1">
                  <p className="teks-panjang text-sm font-semibold group-hover:text-brand">{k.judul}</p>
                  <p className="teks-panjang text-xs text-muted">
                    <span className="font-mono">{k.nomorKontrak || k.nomorPengajuan}</span> · <span className="angka">{teksNilai(k)}</span>
                    {k.mitra !== m.nama && ` · ditulis “${k.mitra}”`}
                  </p>
                </div>
                <LencanaStatus status={k.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Angka({ label, nilai }: { label: string; nilai: number }) {
  return (
    <div className="rounded-2xl bg-raised px-3 py-2.5 text-center">
      <p className="angka text-2xl font-bold">{nilai}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

// --- Impor dari kontrak -------------------------------------------------------------------------

type Tindakan = "baru" | "alias" | "lewati";

interface PilihanImpor {
  tindakan: Tindakan;
  nama: string;
}

function ImporMitra({ usulan, onTutup, onTersimpan }: { usulan: UsulanImpor[]; onTutup: () => void; onTersimpan: () => Promise<void> }) {
  const [pilihan, setPilihan] = useState<Record<string, PilihanImpor>>(() =>
    Object.fromEntries(usulan.map((u) => [u.kunci, { tindakan: u.mirip?.mitra ? "lewati" : "baru", nama: u.nama } satisfies PilihanImpor])),
  );
  const [tahap, setTahap] = useState<"pilih" | "periksa">("pilih");
  const [progres, setProgres] = useState<{ selesai: number; total: number } | null>(null);

  const atur = (kunci: string, p: Partial<PilihanImpor>) => setPilihan((s) => ({ ...s, [kunci]: { ...s[kunci]!, ...p } }));
  const baru = usulan.filter((u) => pilihan[u.kunci]?.tindakan === "baru");
  const alias = usulan.filter((u) => pilihan[u.kunci]?.tindakan === "alias" && u.mirip?.mitra);

  const simpan = async () => {
    // Nama lain dikelompokkan per mitra tujuan supaya beberapa alias ke mitra yang sama tidak saling menimpa.
    const aliasPerMitra = new Map<number, { m: DataMitra; nama: string[] }>();
    for (const u of alias) {
      const m = u.mirip!.mitra!;
      const ada = aliasPerMitra.get(m.id) ?? { m, nama: [...m.namaLain] };
      ada.nama.push(pilihan[u.kunci]!.nama);
      aliasPerMitra.set(m.id, ada);
    }
    const tugas: { label: string; jalan: () => Promise<unknown> }[] = [
      ...baru.map((u) => ({
        label: pilihan[u.kunci]!.nama,
        jalan: () => tambahMitra({ nama: pilihan[u.kunci]!.nama, namaLain: [], npwp: "", alamat: "", penandatangan: "", jabatan: "", email: "", telepon: "", aktif: true, terverifikasi: false }),
      })),
      ...[...aliasPerMitra.values()].map(({ m, nama }) => ({ label: m.nama, jalan: () => ubahMitra(m.id, { namaLain: nama }) })),
    ];
    if (!tugas.length) return onTutup();

    setProgres({ selesai: 0, total: tugas.length });
    const gagal: string[] = [];
    for (const [i, t] of tugas.entries()) {
      try {
        await t.jalan();
      } catch (err) {
        gagal.push(`${t.label} (${pesanError(err)})`);
      }
      setProgres({ selesai: i + 1, total: tugas.length });
    }
    if (gagal.length) toast.error(`${gagal.length} dari ${tugas.length} belum tersimpan: ${gagal.slice(0, 3).join("; ")}${gagal.length > 3 ? "…" : ""}`);
    else toast.success(`Data mitra diperbarui: ${baru.length} mitra baru${aliasPerMitra.size ? `, ${alias.length} nama lain` : ""}.`);
    await onTersimpan();
  };

  if (usulan.length === 0) {
    return (
      <Modal judul="Impor dari kontrak" onTutup={onTutup}>
        <Kosong judul="Semua sudah tercatat" teks="Setiap nama mitra di kontrak sudah ada di data mitra, baik sebagai nama resmi maupun nama lain." ikon={<Building2 className="h-6 w-6" />} />
      </Modal>
    );
  }

  return (
    <Modal judul="Impor dari kontrak" onTutup={onTutup} lebar="max-w-2xl">
      {tahap === "pilih" ? (
        <>
          <p className="text-sm text-muted">
            Nama mitra di kontrak yang belum ada di data mitra. Penulisan yang hanya beda titik, huruf besar, atau spasi sudah digabung. Nama yang mirip dengan mitra lain sengaja tidak dicentang: periksa dulu.
          </p>
          <ul className="scroll-halus mt-4 max-h-[48vh] space-y-2 overflow-y-auto pr-1 sm:max-h-[52vh]">
            {usulan.map((u) => {
              const p = pilihan[u.kunci]!;
              const idCek = `impor-${u.kunci}`;
              return (
                <li key={u.kunci} className={cx("rounded-2xl border px-4 py-3 transition-colors", p.tindakan === "lewati" ? "border-line bg-surface" : "border-brand bg-brand-soft")}>
                  <div className="flex items-start gap-3">
                    {/* Kotak centang dibungkus label 44 px supaya mudah disentuh di ponsel. */}
                    <label className="-m-2.5 grid h-11 w-11 shrink-0 cursor-pointer place-items-center">
                      <input
                        id={idCek}
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--wh-brand)]"
                        checked={p.tindakan !== "lewati"}
                        onChange={(e) => atur(u.kunci, { tindakan: e.target.checked ? "baru" : "lewati" })}
                        aria-label={`Impor ${p.nama}`}
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <label htmlFor={idCek} className="block break-words font-semibold">
                        {p.nama}
                      </label>
                      <p className="text-xs text-muted">
                        dipakai di <span className="angka">{u.jumlah}</span> kontrak
                        {u.varian.length > 1 && ` · digabung dari ${u.varian.length} penulisan`}
                      </p>
                      {u.varian.length > 1 && (
                        <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                          Nama resmi
                          <select className="input !w-auto min-w-0 max-w-full !py-1.5 text-xs" value={p.nama} onChange={(e) => atur(u.kunci, { nama: e.target.value })}>
                            {u.varian.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {u.mirip?.mitra && (
                        <div className="mt-2 rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent-ink">
                          <p>
                            Mirip dengan <span className="font-semibold">{u.mirip.nama}</span> di data mitra.
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1" role="radiogroup" aria-label={`Tindakan untuk ${p.nama}`}>
                            {(
                              [
                                ["lewati", "Lewati dulu"],
                                ["alias", `Jadikan nama lain ${u.mirip.nama}`],
                                ["baru", "Mitra berbeda, tambah baru"],
                              ] as const
                            ).map(([nilai, label]) => (
                              <label key={nilai} className="flex cursor-pointer items-center gap-1.5 [@media(pointer:coarse)]:min-h-11">
                                <input type="radio" name={`tindakan-${u.kunci}`} className="accent-[var(--wh-brand)]" checked={p.tindakan === nilai} onChange={() => atur(u.kunci, { tindakan: nilai })} />
                                {label}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm text-muted" aria-live="polite">
            <span className="angka font-semibold text-ink">{baru.length}</span> mitra baru{alias.length ? `, ${alias.length} nama lain` : ""} akan disimpan.
          </p>
          <AksiModal>
            <Tombol type="button" varian="kedua" onClick={onTutup}>
              Batal
            </Tombol>
            <Tombol type="button" disabled={baru.length + alias.length === 0} onClick={() => setTahap("periksa")}>
              Lanjut periksa
            </Tombol>
          </AksiModal>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">Belum ada yang disimpan. Periksa sekali lagi, lalu simpan.</p>
          {baru.length > 0 && (
            <>
              <p className="label mt-4">Mitra baru ({baru.length})</p>
              <ul className="scroll-halus max-h-[28vh] space-y-1 overflow-y-auto text-sm">
                {baru.map((u) => (
                  <li key={u.kunci} className="flex items-center gap-2">
                    <Plus className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                    <span className="min-w-0 break-words">{pilihan[u.kunci]!.nama}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {alias.length > 0 && (
            <>
              <p className="label mt-4">Nama lain ({alias.length})</p>
              <ul className="space-y-1 text-sm">
                {alias.map((u) => (
                  <li key={u.kunci} className="break-words">
                    “{pilihan[u.kunci]!.nama}” → {u.mirip!.nama}
                  </li>
                ))}
              </ul>
            </>
          )}
          {progres && (
            <div className="mt-4" role="status" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-raised">
                <motion.div className="h-full rounded-full bg-brand" initial={{ width: 0 }} animate={{ width: `${(progres.selesai / progres.total) * 100}%` }} transition={{ duration: 0.3, ease: EASE_KELUAR }} />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                Menyimpan <span className="angka">{progres.selesai}</span> dari <span className="angka">{progres.total}</span>…
              </p>
            </div>
          )}
          <AksiModal>
            <Tombol type="button" varian="kedua" onClick={() => setTahap("pilih")} disabled={!!progres}>
              Kembali
            </Tombol>
            <Tombol type="button" memuat={!!progres} onClick={() => void simpan()}>
              Simpan ke data mitra
            </Tombol>
          </AksiModal>
        </>
      )}
    </Modal>
  );
}
