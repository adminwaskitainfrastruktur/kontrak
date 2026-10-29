// Ringkasan tanda tangan digital di halaman detail kontrak: status permintaan, siapa yang ditunggu, dan jalan pintas
// ke halaman Tanda Tangan (tempat semua aksinya). Pelacak langkah manual (PanelTtd) tetap ada untuk kontrak yang
// ditandatangani di luar WiCon.
import { Link } from "react-router-dom";
import { ArrowRight, Signature } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { useRuang } from "../context/RuangContext";
import { useMuat } from "../hooks/useMuat";
import { formatMasukRingkas } from "../lib/format";
import { bolehAksi, langkahUntukSaya, ringkasPermintaan, sedangGiliran, statusPermintaan } from "../lib/penandatangan";
import type { Kontrak } from "../lib/types";
import { ambilPermintaan, pelakuDari } from "../services/tandaTangan";
import { LencanaTtd } from "../pages/DetailTandaTangan";
import { Kerangka } from "./ui";

export default function PanelTandaTangan({ kontrak: k }: { kontrak: Kontrak }) {
  const { sesi } = useSesi();
  const { ke } = useRuang();
  const q = useMuat(() => ambilPermintaan(k.id), [k.id]);
  const pelaku = pelakuDari(sesi);
  const p = q.data;

  // Galat baca (mis. list belum siap) tidak boleh merusak halaman kontrak: panel disembunyikan.
  if (q.error) return null;
  if (q.loading && !p) return <Kerangka className="h-28 rounded-2xl" />;
  if (!p && !(pelaku.legal && k.status === "Proses Tanda Tangan")) return null;
  if (p && !bolehAksi(p, "lihat", pelaku) && k.pengajuEmail.toLowerCase() !== sesi.email.toLowerCase()) return null;

  const status = p ? statusPermintaan(p.isi) : null;
  const giliran = p ? sedangGiliran(p.isi) : [];
  const giliranSaya = p ? langkahUntukSaya(p, sesi.email) : null;
  return (
    <section className="kartu p-4 sm:p-5" aria-label="Tanda tangan digital">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-strong">
          <Signature className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-bold">
            Tanda tangan digital
            {status && <LencanaTtd status={status} />}
            {giliranSaya && <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-white">Giliran Anda</span>}
          </h2>
          <p className="teks-panjang mt-0.5 text-sm text-muted">
            {!p
              ? "Kontrak ini siap ditandatangani. Kirim dokumen ke para penandatangan, mereka menandatangani langsung di WiCon."
              : status === "Selesai"
                ? `Selesai ditandatangani${p.isi.berkasScan ? " (tanda tangan basah)" : ""}. PDF bertanda tangan tersimpan di dokumen kontrak.`
                : status === "Ditolak" || status === "Dibatalkan"
                  ? "Permintaan ini sudah ditutup. Buka halaman tanda tangan untuk alasannya."
                  : `${ringkasPermintaan(p.isi).teks}${giliran.length ? ` · menunggu ${giliran.map((x) => x.nama).join(", ")}` : ""}`}
          </p>
          {p && <p className="mt-0.5 text-xs text-muted">Diminta {p.dibuatOleh} · {formatMasukRingkas(p.waktuDibuat)}</p>}
        </div>
        <Link to={ke.tandaTangan(k.id)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-sm hover:border-brand">
          {p ? "Buka halaman tanda tangan" : "Minta tanda tangan"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
