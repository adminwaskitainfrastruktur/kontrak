// Daftar tanda tangan: permintaan yang menunggu tanda tangan Anda, yang masih berjalan, dan yang sudah selesai.
// Legal melihat semua permintaan; penandatangan dan pembuat hanya yang melibatkannya.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, RefreshCw, Signature } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { useTtdSaya } from "../hooks/useTtdSaya";
import { formatMasukRingkas } from "../lib/format";
import { bolehAksi, langkahUntukSaya, masihBerjalan, ringkasPermintaan, statusPermintaan, type PermintaanTtd } from "../lib/penandatangan";
import { pelakuDari } from "../services/tandaTangan";
import { Item, KepalaHalaman, KerangkaHalaman, Kontainer, KotakError, Kosong, Segmen, Tombol } from "../components/ui";
import { LencanaTtd } from "./DetailTandaTangan";

type Tab = "saya" | "berjalan" | "selesai";

export default function TandaTangan() {
  const { sesi } = useSesi();
  const { ke } = useRuang();
  const { semua, menunggu, siap, memuat, galat, muatUlang } = useTtdSaya(sesi.email);
  const pelaku = pelakuDari(sesi);
  const [tab, setTab] = useState<Tab>("saya");

  const terlihat = useMemo(() => semua.filter((p) => bolehAksi(p, "lihat", pelaku)), [semua, pelaku.email, pelaku.legal]); // eslint-disable-line react-hooks/exhaustive-deps
  const daftar = useMemo<PermintaanTtd[]>(() => {
    if (tab === "saya") return menunggu;
    if (tab === "berjalan") return terlihat.filter((p) => masihBerjalan(p.isi));
    return terlihat.filter((p) => !masihBerjalan(p.isi));
  }, [tab, menunggu, terlihat]);

  if (!siap && memuat) return <KerangkaHalaman baris={3} />;
  if (galat && semua.length === 0) return <KotakError error={galat} ulangi={() => void muatUlang()} />;

  const pilihan: { nilai: Tab; label: string }[] = [
    { nilai: "saya", label: `Menunggu saya${menunggu.length ? ` (${menunggu.length})` : ""}` },
    { nilai: "berjalan", label: "Berjalan" },
    { nilai: "selesai", label: "Selesai / ditutup" },
  ];
  const kosong = {
    saya: ["Tidak ada yang menunggu tanda tangan Anda", "Permintaan baru akan muncul di sini dan dikirim ke email Anda."],
    berjalan: ["Tidak ada permintaan yang berjalan", pelaku.legal ? "Minta tanda tangan dari halaman Tanda Tangan di kontrak berstatus Proses Tanda Tangan." : "Belum ada dokumen yang menunggu tanda tangan."],
    selesai: ["Belum ada yang selesai", "Dokumen yang selesai, ditolak, atau dibatalkan tampil di sini."],
  }[tab];

  return (
    <Kontainer>
      <Item>
        <KepalaHalaman
          judul="Tanda Tangan"
          sub="Dokumen kontrak yang ditandatangani digital di WiCon: coret di layar atau unggah gambar tanda tangan."
          aksi={
            <Tombol varian="kedua" ikon={<RefreshCw className="h-4 w-4" />} memuat={memuat} onClick={() => void muatUlang()}>
              Segarkan
            </Tombol>
          }
        />
      </Item>
      <Item>
        <Segmen nilai={tab} pilihan={pilihan} onUbah={setTab} id="tab-ttd" label="Filter tanda tangan" />
      </Item>
      <Item>
        {daftar.length === 0 ? (
          <div className="kartu">
            <Kosong judul={kosong[0]!} teks={kosong[1]} ikon={<Signature className="h-6 w-6" />} />
          </div>
        ) : (
          <ul className="grid gap-3" aria-label="Daftar tanda tangan">
            {daftar.map((p) => {
              const status = statusPermintaan(p.isi);
              const giliranSaya = langkahUntukSaya(p, sesi.email);
              const r = ringkasPermintaan(p.isi);
              return (
                <li key={p.itemId}>
                  <Link to={ke.tandaTangan(p.kontrakId)} className="kartu kartu-hover flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5">
                    <div className="min-w-0 flex-1 basis-64">
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="angka font-semibold text-ink">{p.nomor}</span>
                        <LencanaTtd status={status} />
                        {giliranSaya && <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-white">Giliran Anda</span>}
                      </p>
                      <p className="teks-panjang mt-1 font-bold">{p.isi.judul || p.isi.dokumen.nama}</p>
                      <p className="teks-panjang mt-0.5 text-sm text-muted">
                        {p.isi.dokumen.nama} · {r.teks}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Diminta {p.dibuatOleh} · {formatMasukRingkas(p.waktuDibuat)}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Item>
    </Kontainer>
  );
}
