// Arsip: kontrak yang disembunyikan dari daftar kerja tetapi tetap tersimpan lengkap (Ruang Admin).
// Diarsipkan dan dipulihkan dari panel "Kelola kontrak" di detail kontrak; di sini Admin dan Legal juga bisa
// langsung memulihkan. Pemantau hanya melihat.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ArchiveRestore, RefreshCw, Search, X } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useMuat } from "../hooks/useMuat";
import { bisaLihat } from "../lib/alur";
import { formatMasukRingkas, formatUang } from "../lib/format";
import { umpanBalik } from "../lib/umpanBalik";
import type { Kontrak } from "../lib/types";
import { ambilKontrakArsip, segarkanKontrak } from "../services/kontrak";
import { bolehArsipkan, pulihkanDariArsip } from "../services/kelolaKontrak";
import { Item, KepalaHalaman, KerangkaHalaman, Kontainer, KotakError, Kosong, LencanaStatus, Tombol, cx } from "../components/ui";

export default function Arsip() {
  const { sesi } = useSesi();
  const q = useMuat(ambilKontrakArsip, []);
  const [cari, setCari] = useState("");
  const [sedang, setSedang] = useState<number | null>(null);
  const boleh = bolehArsipkan(sesi);

  const daftar = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    return (q.data ?? [])
      .filter((k) => bisaLihat(k, sesi))
      .filter((k) => !kata || [k.nomorPengajuan, k.judul, k.mitra, k.nomorKontrak].some((v) => v.toLowerCase().includes(kata)))
      .sort((a, b) => b.diubah.localeCompare(a.diubah));
  }, [q.data, cari, sesi]);

  const pulihkan = async (k: Kontrak) => {
    setSedang(k.id);
    try {
      await pulihkanDariArsip(k, sesi);
      umpanBalik.berhasil("Kontrak dipulihkan dari arsip.", { teks: `${k.nomorPengajuan} kembali tampil di daftar dan dashboard.` });
      await segarkanKontrak();
      await q.muatUlang();
    } catch (err) {
      umpanBalik.gagal(err, "Belum bisa memulihkan kontrak");
    } finally {
      setSedang(null);
    }
  };

  if (q.loading && !q.data) return <KerangkaHalaman baris={4} />;
  if (q.error && !q.data) return <KotakError error={q.error} ulangi={() => void q.muatUlang()} />;

  const total = q.data?.length ?? 0;
  return (
    <Kontainer>
      <Item>
        <KepalaHalaman
          judul="Arsip"
          sub={`${total} kontrak diarsipkan. Tidak tampil di daftar, dashboard, antrean, dan laporan, tetapi tetap tersimpan lengkap.`}
          aksi={
            <Tombol varian="kedua" ikon={<RefreshCw className="h-4 w-4" />} onClick={() => void segarkanKontrak().then(() => q.muatUlang())}>
              Segarkan
            </Tombol>
          }
        />
      </Item>

      {total > 0 && (
        <Item>
          <div className="relative mb-4 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input className="input pl-10 pr-10" type="search" value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nomor, judul, atau mitra…" aria-label="Cari di arsip" />
            {cari && (
              <button type="button" onClick={() => setCari("")} className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-ink" aria-label="Hapus pencarian">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </Item>
      )}

      {daftar.length === 0 ? (
        <Item>
          <div className="kartu">
            <Kosong
              judul={total === 0 ? "Arsip masih kosong" : "Tidak ada yang cocok"}
              teks={total === 0 ? "Buka sebuah kontrak, lalu pilih Arsipkan kontrak di panel Kelola kontrak untuk menyembunyikannya dari daftar kerja." : "Coba kata kunci lain."}
              ikon={<Archive className="h-6 w-6" />}
            />
          </div>
        </Item>
      ) : (
        <Item>
          <ul className="grid gap-3" aria-label="Kontrak yang diarsipkan">
            {daftar.map((k) => (
              <li key={k.id} className="kartu flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="angka font-semibold text-ink">{k.nomorPengajuan}</span>
                    <LencanaStatus status={k.status} />
                  </p>
                  <Link to={`/kontrak/${k.id}`} className="teks-panjang mt-1 block font-bold hover:text-brand">
                    {k.judul}
                  </Link>
                  <p className="teks-panjang mt-0.5 text-sm text-muted">
                    {k.mitra || "Tanpa mitra"} · {k.jenis}
                    {k.nilai != null && !k.jenis.startsWith("MoU") ? ` · ${formatUang(k.nilai, k.mataUang)}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">Terakhir diubah {formatMasukRingkas(k.diubah)}</p>
                </div>
                <div className={cx("flex shrink-0 flex-wrap gap-2")}>
                  <Link to={`/kontrak/${k.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-sm hover:border-brand">
                    Buka
                  </Link>
                  {boleh && (
                    <Tombol varian="kedua" ikon={<ArchiveRestore className="h-4 w-4" />} onClick={() => void pulihkan(k)} memuat={sedang === k.id} disabled={sedang !== null}>
                      Pulihkan
                    </Tombol>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Item>
      )}
    </Kontainer>
  );
}
