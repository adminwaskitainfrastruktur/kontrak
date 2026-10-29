// Tampilan dokumen Lembar Hasil Review Legal: satu komponen untuk pratinjau di halaman, tampilan cetak, dan PDF.
//
// Isinya datang dari susunDokumenLembar (lib/lembarDokumen), sama persis dengan berkas .docx. Gaya kertasnya ada di
// styles.css (kelas lembar-*): di layar berupa lembar putih yang rapi (tabel bertumpuk di ponsel), saat dicetak menjadi
// A4 dengan kop, tabel yang tidak terpotong di tengah baris, dan kolom paraf/tanda tangan.
//
// TampilanCetakLembar membuka lembar layar penuh lewat portal ke <body>. Saat mencetak, hanya lembar itu yang
// ditampilkan (CSS print menyembunyikan sisa halaman), jadi pengguna bisa memilih "Simpan sebagai PDF" di dialog cetak.
import { Fragment, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Download, Printer, X } from "lucide-react";
import "../styles-lembar.css";
import { useLapisan } from "../lib/lapisan";
import type { BlokLembar } from "../lib/lembarDokumen";
import { Tombol, cx } from "./ui";

/** Baris teks dengan jeda baris dipertahankan. */
const Teks = ({ children }: { children: string }) => <span className="whitespace-pre-wrap break-words">{children}</span>;

export default function DokumenLembar({ blok, className }: { blok: readonly BlokLembar[]; className?: string }) {
  return (
    <article className={cx("lembar-kertas", className)} aria-label="Lembar Hasil Review Legal">
      {blok.map((b, i) => {
        switch (b.tipe) {
          case "kop":
            return (
              <header key={i} className="lembar-kop">
                <h1>{b.judul}</h1>
                {b.sub.map((s) => (
                  <p key={s}>{s}</p>
                ))}
                {b.tanda && <p className="lembar-tanda">{b.tanda}</p>}
              </header>
            );
          case "bagian":
            return <h2 key={i}>{b.teks}</h2>;
          case "paragraf":
            return (
              <p key={i} className={b.kecil ? "lembar-kecil" : undefined}>
                <Teks>{b.teks}</Teks>
              </p>
            );
          case "daftar":
            return (
              <ul key={i} className="lembar-daftar">
                {b.butir.map((x, n) => (
                  <li key={n}>
                    <Teks>{x}</Teks>
                  </li>
                ))}
              </ul>
            );
          case "kv":
            return (
              <dl key={i} className="lembar-kv">
                {b.baris.map((x) => (
                  <Fragment key={x.label}>
                    <dt>{x.label}</dt>
                    <dd>
                      <Teks>{x.isi}</Teks>
                    </dd>
                  </Fragment>
                ))}
              </dl>
            );
          case "tabel":
            return b.baris.length === 0 ? (
              <p key={i} className="lembar-kecil">
                {b.kosong}
              </p>
            ) : (
              <table key={i} className="lembar-tabel">
                <thead>
                  <tr>
                    {b.kolom.map((k, n) => (
                      <th key={k} style={{ width: `${b.lebar[n]}%` }} scope="col">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.baris.map((r, n) => (
                    <tr key={n}>
                      {r.map((c, m) => (
                        <td key={m} data-label={b.kolom[m]}>
                          <Teks>{c}</Teks>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          case "ttd":
            return (
              <div key={i} className="lembar-ttd">
                {b.kolom.map((x) => (
                  <div key={x.judul}>
                    <p className="lembar-ttd-judul">{x.judul}</p>
                    <div className="lembar-ttd-garis" aria-hidden="true" />
                    <p className="lembar-ttd-nama">{x.nama}</p>
                    <p className="lembar-ttd-ket">{x.keterangan}</p>
                  </div>
                ))}
              </div>
            );
        }
      })}
    </article>
  );
}

/**
 * Lembar layar penuh untuk dibaca dan dicetak. `onUnduh` (opsional) menampilkan tombol unduh .docx di bilahnya.
 * Tombol Cetak membuka dialog cetak bawaan peramban; di sana pengguna bisa memilih printer atau "Simpan sebagai PDF".
 */
export function TampilanCetakLembar({ blok, judul, onTutup, onUnduh, mengunduh }: { blok: readonly BlokLembar[]; judul: string; onTutup: () => void; onUnduh?: () => void; mengunduh?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLapisan(true, onTutup, { wadah: ref, jebakFokus: true });

  // Kelas pada <html> dipakai CSS cetak untuk menyembunyikan seluruh aplikasi selain lembar ini; juga mengunci gulir latar.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("cetak-lembar");
    return () => html.classList.remove("cetak-lembar");
  }, []);

  const judulAsli = useRef<string | null>(null);
  useEffect(() => {
    // Nama berkas PDF bawaan peramban mengikuti judul halaman.
    judulAsli.current = document.title;
    document.title = judul;
    return () => {
      if (judulAsli.current != null) document.title = judulAsli.current;
    };
  }, [judul]);

  return createPortal(
    <div ref={ref} role="dialog" aria-modal="true" aria-label={judul} tabIndex={-1} className="lembar-akar">
      <div className="lembar-bilah">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{judul}</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Tombol kecil ikon={<Printer className="h-4 w-4" />} onClick={() => window.print()} data-fokus-awal>
            Cetak atau simpan PDF
          </Tombol>
          {onUnduh && (
            <Tombol kecil varian="kedua" ikon={<Download className="h-4 w-4" />} memuat={mengunduh} onClick={onUnduh}>
              Unduh .docx
            </Tombol>
          )}
          <button type="button" onClick={onTutup} className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink" aria-label="Tutup tampilan cetak">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="lembar-latar">
        <DokumenLembar blok={blok} />
        <p className="lembar-petunjuk">Tip: di dialog cetak, pilih "Simpan sebagai PDF" sebagai printer, ukuran A4, dan matikan "Header dan footer" bila ada.</p>
      </div>
    </div>,
    document.body,
  );
}
