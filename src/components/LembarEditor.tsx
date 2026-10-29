// Formulir isian Lembar Hasil Review Legal (putaran yang masih draf). Dipakai PanelLembarReview.
//
// Bagian yang terisi otomatis (identitas, pihak, dokumen, kelengkapan, checklist, pindai, revisi) hanya DITAMPILKAN di
// sini, tidak diketik ulang. Yang diisi Legal: pokok-pokok kontrak (sudah diisi awal dari data pengajuan), temuan per
// pasal, daftar periksa kepatuhan regulasi, kesimpulan, syarat sebelum tanda tangan, dan catatan.
//
// Semua daftar bertanda "Standar awal": disusun dari riset dan perlu disahkan Legal WKI (lib/lembarStandar).
import { useId, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, ClipboardCheck, FileText, Gavel, Info, ListChecks, Plus, ScanSearch, Scale, Trash2 } from "lucide-react";
import { formatTanggal, formatWaktu } from "../lib/format";
import { teksUkuran } from "../lib/jenisBerkas";
import {
  BATAS_TEKS,
  MAKS_SYARAT,
  MAKS_TEMUAN,
  poinRevisiDariTemuan,
  ringkasTemuan,
  risikoKeseluruhan,
  sarankanKesimpulan,
  syaratKosong,
  temuanKosong,
  type DataOtomatis,
  type PutaranReview,
  type TemuanReview,
} from "../lib/lembarReview";
import {
  DAFTAR_KESIMPULAN,
  HASIL_KEPATUHAN,
  KEPATUHAN_DASAR,
  KETERANGAN_STATUS_TEMUAN,
  KRITERIA_RISIKO,
  LABEL_HASIL_KEPATUHAN,
  STATUS_TEMUAN,
  TINGKAT_RISIKO,
  USULAN_SYARAT_TTD,
  daftarPokok,
  defKesimpulan,
  type HasilKepatuhan,
  type TingkatRisiko,
} from "../lib/lembarStandar";
import { PENAFIAN } from "../lib/pemindai";
import type { Kontrak } from "../lib/types";
import { BilahKemajuan, TandaStandarAwal } from "./PanelSyarat";
import { Field, Tombol, cx } from "./ui";

// --- Bagian yang bisa dilipat ----------------------------------------------------------------------

function Bagian({ judul, ikon, ringkas, bukaAwal = false, tanda, children }: { judul: string; ikon: ReactNode; ringkas?: ReactNode; bukaAwal?: boolean; tanda?: ReactNode; children: ReactNode }) {
  const [buka, setBuka] = useState(bukaAwal);
  const id = useId();
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={buka}
          aria-controls={`${id}-isi`}
          onClick={() => setBuka((b) => !b)}
          className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-strong" aria-hidden="true">
            {ikon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold">
              {judul}
              {tanda}
            </span>
            {ringkas && <span className="mt-0.5 block text-xs font-normal text-muted">{ringkas}</span>}
          </span>
          <ChevronDown className={cx("h-4 w-4 shrink-0 text-muted transition-transform", buka && "rotate-180")} aria-hidden="true" />
        </button>
      </h3>
      {buka && (
        <div id={`${id}-isi`} className="space-y-4 border-t border-line px-4 py-4">
          {children}
        </div>
      )}
    </section>
  );
}

const NADA_RISIKO: Record<TingkatRisiko, { aktif: string; chip: string }> = {
  Tinggi: { aktif: "border-danger bg-danger-soft text-danger", chip: "bg-danger-soft text-danger" },
  Sedang: { aktif: "border-accent bg-accent-soft text-accent-ink", chip: "bg-accent-soft text-accent-ink" },
  Rendah: { aktif: "border-success bg-success-soft text-success", chip: "bg-success-soft text-success" },
};

export function ChipRisiko({ risiko }: { risiko: TingkatRisiko }) {
  return <span className={cx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold", NADA_RISIKO[risiko].chip)}>Risiko {risiko.toLowerCase()}</span>;
}

// --- Editor ----------------------------------------------------------------------------------------------

export interface PropsLembarEditor {
  k: Kontrak;
  draf: PutaranReview;
  ubah: (fn: (p: PutaranReview) => PutaranReview) => void;
  /** Data otomatis terbaru (hanya dibaca). */
  data: DataOtomatis;
  onPindai: () => void;
  pindaiSibuk: boolean;
  pindaiGalat: string;
  /** Sedang menyimpan: semua isian dikunci. */
  terkunci: boolean;
  onMintaRevisi: (teks: string) => void;
}

export default function LembarEditor({ k, draf, ubah, data, onPindai, pindaiSibuk, pindaiGalat, terkunci, onMintaRevisi }: PropsLembarEditor) {
  const ringkas = ringkasTemuan(draf.temuan);
  const risiko = risikoKeseluruhan(draf.temuan);
  const pokok = daftarPokok(k.jenis);
  const sudahPokok = pokok.filter((p) => draf.pokok[p.id]?.trim()).length;
  const sudahKepatuhan = draf.kepatuhan.filter((b) => b.hasil).length;
  const poinRevisi = poinRevisiDariTemuan(draf.temuan);

  return (
    <fieldset disabled={terkunci} className="m-0 min-w-0 space-y-3 border-0 p-0">
      <legend className="sr-only">Isian Lembar Hasil Review Legal putaran {draf.nomor}</legend>

      <Bagian
        judul="Terisi otomatis dari sistem"
        ikon={<ClipboardCheck className="h-4 w-4" />}
        ringkas={`${data.dokumen.length} dokumen · kelengkapan ${data.kelengkapan.teks} · checklist ${data.checklist.selesai} dari ${data.checklist.total}`}
        bukaAwal
      >
        <BagianOtomatis data={data} onPindai={onPindai} pindaiSibuk={pindaiSibuk} pindaiGalat={pindaiGalat} />
      </Bagian>

      <Bagian judul="Pokok-pokok kontrak" ikon={<FileText className="h-4 w-4" />} ringkas={`${sudahPokok} dari ${pokok.length} pokok terisi. Sebagian sudah diisi dari data pengajuan; periksa dengan draf.`} bukaAwal>
        <div className="grid gap-4 sm:grid-cols-2">
          {pokok.map((p) => (
            <Field key={p.id} label={p.label} bantuan={p.petunjuk}>
              <textarea
                className="input min-h-[84px]"
                maxLength={BATAS_TEKS.pokok}
                value={draf.pokok[p.id] ?? ""}
                onChange={(e) => {
                  const nilai = e.target.value;
                  ubah((d) => ({ ...d, pokok: { ...d.pokok, [p.id]: nilai } }));
                }}
              />
            </Field>
          ))}
        </div>
      </Bagian>

      <Bagian
        judul="Temuan per pasal"
        ikon={<Gavel className="h-4 w-4" />}
        tanda={ringkas.total > 0 ? <ChipRisiko risiko={risiko.sisa} /> : undefined}
        ringkas={ringkas.total ? `${ringkas.total} temuan, ${ringkas.belumSelesai} belum diterima. ${risiko.ringkas}` : "Belum ada temuan. Catat pasal yang perlu diubah atau diwaspadai."}
        bukaAwal
      >
        <BagianTemuan draf={draf} ubah={ubah} poinRevisi={poinRevisi} onMintaRevisi={onMintaRevisi} />
      </Bagian>

      <Bagian
        judul="Kepatuhan regulasi"
        ikon={<Scale className="h-4 w-4" />}
        tanda={<TandaStandarAwal />}
        ringkas={`${sudahKepatuhan} dari ${draf.kepatuhan.length} butir diperiksa. Dasar hukum bertanda * perlu diverifikasi Legal.`}
      >
        <BagianKepatuhan draf={draf} ubah={ubah} />
      </Bagian>

      <Bagian
        judul="Kesimpulan dan catatan"
        ikon={<ListChecks className="h-4 w-4" />}
        tanda={<TandaStandarAwal />}
        ringkas={defKesimpulan(draf.kesimpulan) ? `Kesimpulan: ${defKesimpulan(draf.kesimpulan)!.label}` : "Belum ada kesimpulan. Wajib dipilih sebelum difinalkan."}
        bukaAwal
      >
        <BagianKesimpulan draf={draf} ubah={ubah} data={data} />
      </Bagian>
    </fieldset>
  );
}

// --- Terisi otomatis ---------------------------------------------------------------------------------------

function BagianOtomatis({ data, onPindai, pindaiSibuk, pindaiGalat }: { data: DataOtomatis; onPindai: () => void; pindaiSibuk: boolean; pindaiGalat: string }) {
  const i = data.identitas;
  const p = data.pihak;
  const kel = data.kelengkapan;
  const cek = data.checklist;
  const persenKel = kel.ada.length + kel.kurang.length === 0 ? 100 : Math.round((kel.ada.length / (kel.ada.length + kel.kurang.length)) * 100);
  const persenCek = cek.total === 0 ? 0 : Math.round((cek.selesai / cek.total) * 100);
  const fakta: [string, string][] = [
    ["Nomor pengajuan", i.nomorPengajuan],
    ["Jenis", i.jenis],
    ["Pengaju", `${i.pengaju || "-"} (Divisi ${i.divisi})`],
    ["PIC Legal", i.picLegal || "-"],
    ["Mitra", p.mitra || "-"],
    ["NPWP mitra", p.npwp || "-"],
    ["Penandatangan mitra", [p.penandatangan, p.jabatan].filter(Boolean).join(", ") || "-"],
    ["Dasar kewenangan", p.dasarKewenangan || "-"],
    ...(i.induk ? ([["Kontrak induk", i.induk]] as [string, string][]) : []),
    ...(p.lain.length ? ([["Pihak lain", p.lain.map((x) => `${x.nama}${x.peran ? ` (${x.peran})` : ""}`).join("; ")]] as [string, string][]) : []),
  ];
  return (
    <>
      <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-xs text-info">
        <Info className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Bagian ini diambil dari data yang sudah ada, jadi tidak perlu diketik ulang. Isinya diperbarui otomatis dan dibekukan saat lembar difinalkan. Ubah datanya di halaman kontrak, panel Pihak, atau Dokumen.</span>
      </p>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {fakta.map(([l, v]) => (
          <div key={l} className="min-w-0">
            <dt className="text-xs font-semibold text-muted">{l}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="label !mb-1">Dokumen yang direview</p>
        {data.dokumen.length === 0 ? (
          <p className="text-sm text-muted">Belum ada dokumen yang diunggah.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {data.dokumen.map((d) => (
              <li key={d.nama + d.diubah} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="min-w-0 break-all font-semibold">{d.nama}</span>
                <span className="text-xs text-muted">
                  {d.jenis}
                  {d.versi ? ` · ${d.versi}` : ""} · {formatTanggal(d.diubah.slice(0, 10))} · {teksUkuran(d.ukuran)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="label !mb-1">Kelengkapan dokumen wajib</p>
          <BilahKemajuan persen={persenKel} nada={kel.lengkap ? "success" : "accent"} label={`Kelengkapan dokumen wajib: ${kel.teks}`} />
          <p className="mt-1.5 text-xs text-muted">{kel.lengkap ? `${kel.teks}. Semua dokumen wajib sudah ada.` : `${kel.teks}. Belum ada: ${kel.kurang.join(", ")}.`}</p>
        </div>
        <div className="min-w-0">
          <p className="label !mb-1">Checklist review klausul</p>
          <BilahKemajuan persen={persenCek} nada={cek.total > 0 && cek.selesai === cek.total ? "success" : "brand"} label={`Checklist review klausul: ${cek.selesai} dari ${cek.total} butir`} />
          <p className="mt-1.5 text-xs text-muted">{cek.total ? `${cek.selesai} dari ${cek.total} butir selesai${cek.belum.length ? `. Belum: ${cek.belum.slice(0, 4).join(", ")}${cek.belum.length > 4 ? ` dan ${cek.belum.length - 4} lainnya` : ""}.` : "."}` : "Checklist belum tersedia."}</p>
        </div>
      </div>

      <div className="rounded-xl bg-raised p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Hasil pindai draf</p>
          <Tombol kecil varian="kedua" ikon={<ScanSearch className="h-3.5 w-3.5" />} memuat={pindaiSibuk} onClick={onPindai} type="button">
            {data.pindai ? "Pindai ulang draf terbaru" : "Pindai draf terbaru"}
          </Tombol>
        </div>
        {pindaiGalat && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {pindaiGalat}
          </p>
        )}
        {data.pindai ? (
          <div className="mt-2 text-xs text-muted">
            {data.pindai.terbaca ? (
              <>
                <p>
                  <span className="break-all font-semibold text-ink">{data.pindai.nama}</span> ({formatWaktu(data.pindai.waktu)}): {data.pindai.klausul.filter((x) => x.ada).length} dari {data.pindai.klausul.length} klausul inti terdeteksi
                  {data.pindai.klausul.some((x) => !x.ada) ? `; belum terdeteksi: ${data.pindai.klausul.filter((x) => !x.ada).map((x) => x.nama).join(", ")}` : ""}. Bagian yang tampaknya masih kosong: {data.pindai.penanda}.
                </p>
                {data.pindai.selisih.length > 0 && <p className="mt-1">Selisih dengan pengajuan: {data.pindai.selisih.join("; ")}.</p>}
              </>
            ) : (
              <p>Teks draf belum terbaca (mungkin PDF hasil pindai), jadi tidak ada hasil.</p>
            )}
            <p className="mt-1 italic">{PENAFIAN}</p>
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-muted">Belum dipindai. Pemindaian membaca draf di peramban ini saja dan hasilnya ikut masuk lembar sebagai ringkasan.</p>
        )}
      </div>

      {data.revisi && (
        <div className="rounded-xl bg-raised p-3 text-xs text-muted">
          <p className="text-sm font-semibold text-ink">Permintaan revisi sebelumnya</p>
          <p className="mt-0.5">
            {formatWaktu(data.revisi.waktu)} oleh {data.revisi.oleh || "Legal"}. {data.revisi.kirimUlang ? `Dikirim ulang ${formatWaktu(data.revisi.kirimUlang)}.` : "Belum dikirim ulang."}
          </p>
          {data.revisi.poin.length > 0 && (
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              {data.revisi.poin.map((x, n) => (
                <li key={n} className="break-words">
                  {x}
                </li>
              ))}
            </ol>
          )}
          {data.revisi.sejak.length > 0 && <p className="mt-1">Sejak revisi diminta: {data.revisi.sejak.join("; ")}.</p>}
        </div>
      )}
    </>
  );
}

// --- Temuan ---------------------------------------------------------------------------------------------------

function BagianTemuan({ draf, ubah, poinRevisi, onMintaRevisi }: { draf: PutaranReview; ubah: PropsLembarEditor["ubah"]; poinRevisi: string[]; onMintaRevisi: (teks: string) => void }) {
  const [fokusId, setFokusId] = useState<string | null>(null);
  const ubahTemuan = (id: string, patch: Partial<TemuanReview>) => ubah((d) => ({ ...d, temuan: d.temuan.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const tambah = () => {
    const baru = temuanKosong();
    setFokusId(baru.id);
    ubah((d) => ({ ...d, temuan: [...d.temuan, baru] }));
  };
  const penuh = draf.temuan.length >= MAKS_TEMUAN;

  return (
    <>
      <details className="rounded-xl bg-raised px-3 py-2 text-xs">
        <summary className="flex min-h-8 cursor-pointer select-none flex-wrap items-center gap-2 font-semibold text-brand hover:text-brand-strong [@media(pointer:coarse)]:min-h-11">
          Kriteria tingkat risiko <TandaStandarAwal />
        </summary>
        <ul className="mt-2 space-y-1.5">
          {[...TINGKAT_RISIKO].reverse().map((r) => (
            <li key={r} className="flex flex-wrap items-start gap-x-2 gap-y-1">
              <ChipRisiko risiko={r} />
              <span className="min-w-0 flex-1 text-muted">
                {KRITERIA_RISIKO[r].arti} <strong className="text-ink">{KRITERIA_RISIKO[r].tindakan}</strong>
              </span>
            </li>
          ))}
        </ul>
      </details>

      {draf.temuan.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Belum ada temuan. Tekan "Tambah temuan" untuk mencatat pasal yang perlu diubah atau diwaspadai.</p>
      ) : (
        <ol className="space-y-3" aria-label="Daftar temuan">
          {draf.temuan.map((t, n) => (
            <KartuTemuan key={t.id} nomor={n + 1} t={t} fokus={fokusId === t.id} onUbah={(p) => ubahTemuan(t.id, p)} onHapus={() => ubah((d) => ({ ...d, temuan: d.temuan.filter((x) => x.id !== t.id) }))} />
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Tombol kecil varian="kedua" type="button" ikon={<Plus className="h-4 w-4" />} disabled={penuh} onClick={tambah}>
          Tambah temuan
        </Tombol>
        <Tombol kecil type="button" disabled={poinRevisi.length === 0} onClick={() => onMintaRevisi(`Mohon perbaiki hal berikut ya:\n${poinRevisi.map((p, i) => `${i + 1}. ${p}`).join("\n")}`)} title={poinRevisi.length ? "Buka Minta Revisi dengan poin dari temuan yang ditandai" : "Tandai temuan untuk permintaan revisi lebih dulu"}>
          Isi Minta Revisi dari temuan{poinRevisi.length ? ` (${poinRevisi.length})` : ""}
        </Tombol>
        {penuh && <span className="text-xs text-muted">Batas {MAKS_TEMUAN} temuan per putaran tercapai.</span>}
      </div>
      <p className="text-xs text-muted">Poin revisi memakai usulan perbaikan (atau rumusan bila usulan kosong). Tingkat risiko dan tanggapan tidak ikut karena pengaju membaca permintaan revisi.</p>
    </>
  );
}

function KartuTemuan({ nomor, t, fokus, onUbah, onHapus }: { nomor: number; t: TemuanReview; fokus: boolean; onUbah: (p: Partial<TemuanReview>) => void; onHapus: () => void }) {
  const [yakin, setYakin] = useState(false);
  const idRisiko = useId();
  return (
    <li className="rounded-2xl border border-line p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
          Temuan {nomor}
          <ChipRisiko risiko={t.risiko} />
          {t.dariPutaran != null && <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] font-semibold text-muted">Dari putaran {t.dariPutaran}</span>}
        </p>
        {yakin ? (
          <span className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Konfirmasi hapus temuan ${nomor}`}>
            <span className="text-xs text-muted">Hapus temuan ini?</span>
            <Tombol kecil varian="bahaya" type="button" onClick={onHapus}>
              Ya, hapus
            </Tombol>
            <Tombol kecil varian="hantu" type="button" onClick={() => setYakin(false)}>
              Batal
            </Tombol>
          </span>
        ) : (
          <Tombol kecil varian="hantu" type="button" ikon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setYakin(true)} aria-label={`Hapus temuan ${nomor}`}>
            Hapus
          </Tombol>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Pasal">
          <input className="input" autoFocus={fokus} maxLength={BATAS_TEKS.pasal} placeholder="mis. Pasal 12 (Denda)" value={t.pasal} onChange={(e) => onUbah({ pasal: e.target.value })} />
        </Field>
        <div className="min-w-0">
          <span id={idRisiko} className="label">
            Tingkat risiko
          </span>
          <div role="radiogroup" aria-labelledby={idRisiko} className="grid grid-cols-3 gap-1.5">
            {TINGKAT_RISIKO.map((r) => {
              const pilih = t.risiko === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={pilih}
                  onClick={() => onUbah({ risiko: r })}
                  className={cx(
                    "min-h-10 rounded-xl border px-2 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft [@media(pointer:coarse)]:min-h-11",
                    pilih ? NADA_RISIKO[r].aktif : "border-line bg-surface text-muted hover:border-brand hover:text-ink",
                  )}
                >
                  {r}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted">{KRITERIA_RISIKO[t.risiko].tindakan}</p>
        </div>
        <Field label="Rumusan dan isu" bantuan="Apa bunyi pasalnya dan apa masalah hukumnya." className="sm:col-span-2">
          <textarea className="input min-h-[84px]" maxLength={BATAS_TEKS.isu} value={t.isu} onChange={(e) => onUbah({ isu: e.target.value })} />
        </Field>
        <Field label="Usulan perbaikan" bantuan="Redaksi atau posisi yang diusulkan." className="sm:col-span-2">
          <textarea className="input min-h-[72px]" maxLength={BATAS_TEKS.usulan} value={t.usulan} onChange={(e) => onUbah({ usulan: e.target.value })} />
        </Field>
        <Field label="Status" bantuan={KETERANGAN_STATUS_TEMUAN[t.status]}>
          <select className="input" value={t.status} onChange={(e) => onUbah({ status: e.target.value as TemuanReview["status"] })}>
            {STATUS_TEMUAN.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tanggapan atau hasil pembahasan" bantuan="Opsional. Internal Legal, tidak dibaca pengaju.">
          <textarea className="input min-h-[60px]" maxLength={BATAS_TEKS.tanggapan} value={t.tanggapan} onChange={(e) => onUbah({ tanggapan: e.target.value })} />
        </Field>
      </div>

      <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--wh-brand)]" checked={t.revisi} onChange={(e) => onUbah({ revisi: e.target.checked })} />
        <span>
          Masukkan ke permintaan revisi
          <span className="block text-xs text-muted">Poinnya (pasal dan usulan) akan dibaca pengaju.</span>
        </span>
      </label>
    </li>
  );
}

// --- Kepatuhan ----------------------------------------------------------------------------------------------------

function BagianKepatuhan({ draf, ubah }: { draf: PutaranReview; ubah: PropsLembarEditor["ubah"] }) {
  const ubahButir = (id: string, patch: Partial<PutaranReview["kepatuhan"][number]>) => ubah((d) => ({ ...d, kepatuhan: d.kepatuhan.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  return (
    <>
      <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-xs text-info">
        <Info className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Daftar periksa ini standar awal dari riset dan belum disahkan Legal WKI. Tanda * berarti dasar hukum atau angkanya dari ingatan dan perlu dicek ke teks resminya. Isi Tidak relevan bila butirnya tidak berlaku.</span>
      </p>
      <ul className="divide-y divide-line rounded-2xl border border-line" aria-label="Daftar periksa kepatuhan regulasi">
        {draf.kepatuhan.map((b) => (
          <li key={b.id} className="px-3.5 py-3">
            <p className="text-sm font-semibold">{b.label}</p>
            <p className="mt-0.5 break-words text-xs text-muted">
              Dasar: {b.dasar}
              {b.perluVerifikasi ? " *" : ""}
            </p>
            <div role="radiogroup" aria-label={`Hasil pemeriksaan ${b.label}`} className="mt-2 grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-3">
              {HASIL_KEPATUHAN.map((h: HasilKepatuhan) => {
                const pilih = b.hasil === h;
                const warna = h === "sesuai" ? "border-success bg-success-soft text-success" : h === "tidak-sesuai" ? "border-danger bg-danger-soft text-danger" : "border-brand bg-brand-soft text-brand-strong";
                return (
                  <button
                    key={h}
                    type="button"
                    role="radio"
                    aria-checked={pilih}
                    onClick={() => ubahButir(b.id, { hasil: pilih ? "" : h })}
                    className={cx(
                      "min-h-10 rounded-xl border px-2 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft [@media(pointer:coarse)]:min-h-11",
                      pilih ? warna : "border-line bg-surface text-muted hover:border-brand hover:text-ink",
                    )}
                  >
                    {pilih && <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}
                    {LABEL_HASIL_KEPATUHAN[h]}
                  </button>
                );
              })}
            </div>
            <details className="mt-1.5 text-xs">
              <summary className="min-h-8 cursor-pointer select-none py-1 font-semibold text-brand hover:text-brand-strong [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:py-2.5">Yang dicek{b.catatan ? " dan catatan Anda" : ""}</summary>
              <p className="text-muted">{KEPATUHAN_PETUNJUK.get(b.id) ?? "Periksa kesesuaian dengan dasar di atas."}</p>
            </details>
            <input
              className="input mt-1.5 !py-2 !text-xs"
              maxLength={BATAS_TEKS.kepatuhan}
              placeholder="Catatan (opsional), mis. PPN belum disebut"
              aria-label={`Catatan untuk ${b.label}`}
              value={b.catatan}
              onChange={(e) => ubahButir(b.id, { catatan: e.target.value })}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

// Petunjuk tiap butir dibaca dari standar (id sama), bukan disalin ke lembar.
const KEPATUHAN_PETUNJUK = new Map(KEPATUHAN_DASAR.map((b) => [b.id, b.petunjuk]));

// --- Kesimpulan ---------------------------------------------------------------------------------------------------

function BagianKesimpulan({ draf, ubah, data }: { draf: PutaranReview; ubah: PropsLembarEditor["ubah"]; data: DataOtomatis }) {
  const idKes = useId();
  const saran = sarankanKesimpulan({ temuan: draf.temuan, kepatuhan: draf.kepatuhan, syarat: draf.syarat, dokumenLengkap: data.kelengkapan.lengkap });
  const defSaran = defKesimpulan(saran.kode)!;
  const ubahSyarat = (id: string, patch: Partial<PutaranReview["syarat"][number]>) => ubah((d) => ({ ...d, syarat: d.syarat.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const tambahSyarat = (teks = "") => ubah((d) => (d.syarat.length >= MAKS_SYARAT || (teks && d.syarat.some((s) => s.teks === teks)) ? d : { ...d, syarat: [...d.syarat, syaratKosong(teks)] }));

  return (
    <>
      <Field label="Tanggal review" wajib className="max-w-xs">
        <input type="date" className="input" value={draf.tanggalReview} onChange={(e) => ubah((d) => ({ ...d, tanggalReview: e.target.value }))} />
      </Field>

      <div>
        <p id={idKes} className="label">
          Kesimpulan<span className="ml-0.5 text-danger">*</span>
        </p>
        <div role="radiogroup" aria-labelledby={idKes} className="grid gap-2 sm:grid-cols-2">
          {DAFTAR_KESIMPULAN.map((d) => {
            const pilih = draf.kesimpulan === d.kode;
            const warna = d.nada === "sukses" ? "border-success bg-success-soft" : d.nada === "bahaya" ? "border-danger bg-danger-soft" : "border-accent bg-accent-soft";
            return (
              <button
                key={d.kode}
                type="button"
                role="radio"
                aria-checked={pilih}
                onClick={() => ubah((p) => ({ ...p, kesimpulan: d.kode }))}
                className={cx("min-h-11 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft", pilih ? warna : "border-line bg-surface hover:border-brand")}
              >
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  {pilih && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  {d.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{d.arti}</span>
                <span className="mt-1 block text-[11px] font-semibold text-muted">Langkah berikutnya: {d.langkah}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-start gap-2 rounded-xl bg-raised px-3 py-2 text-xs">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-muted">
            <span className="font-semibold text-ink">Saran dari isi lembar: {defSaran.label}.</span> {saran.alasan.join(" ")} Hanya saran; keputusan tetap pada Legal.
          </p>
          {draf.kesimpulan !== saran.kode && (
            <Tombol kecil varian="kedua" type="button" onClick={() => ubah((p) => ({ ...p, kesimpulan: saran.kode }))}>
              Pakai saran
            </Tombol>
          )}
        </div>
      </div>

      <div>
        <p className="label">Syarat sebelum tanda tangan</p>
        {draf.syarat.length > 0 && (
          <ul className="mb-2 space-y-2" aria-label="Syarat sebelum tanda tangan">
            {draf.syarat.map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <label className="flex min-h-11 shrink-0 cursor-pointer items-center" title="Tandai bila syarat sudah dipenuhi">
                  <input type="checkbox" className="h-5 w-5 accent-[var(--wh-brand)]" checked={s.selesai} onChange={(e) => ubahSyarat(s.id, { selesai: e.target.checked })} aria-label={`Syarat sudah dipenuhi: ${s.teks || "baris baru"}`} />
                </label>
                <input className="input min-w-0 flex-1" maxLength={BATAS_TEKS.syarat} value={s.teks} placeholder="mis. Jaminan pelaksanaan diterima" aria-label="Isi syarat" onChange={(e) => ubahSyarat(s.id, { teks: e.target.value })} />
                <button type="button" onClick={() => ubah((d) => ({ ...d, syarat: d.syarat.filter((x) => x.id !== s.id) }))} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-danger" aria-label={`Hapus syarat ${s.teks || "baris baru"}`}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Tombol kecil varian="kedua" type="button" ikon={<Plus className="h-4 w-4" />} disabled={draf.syarat.length >= MAKS_SYARAT} onClick={() => tambahSyarat()}>
            Tambah syarat
          </Tombol>
        </div>
        <p className="mb-1 mt-2 text-xs text-muted">Usulan (standar awal), ketuk untuk menambah:</p>
        <div className="flex flex-wrap gap-1.5">
          {USULAN_SYARAT_TTD.map((u) => (
            <button key={u} type="button" title={u} onClick={() => tambahSyarat(u)} className="min-h-8 max-w-full rounded-full bg-raised px-2.5 py-1 text-left text-xs font-semibold hover:bg-brand-soft [@media(pointer:coarse)]:min-h-11">
              {u.length > 48 ? `${u.slice(0, 47).trimEnd()}…` : u}
            </button>
          ))}
        </div>
      </div>

      <Field label="Catatan untuk penandatangan" bantuan="Internal. Risiko yang diterima secara sadar, hal yang perlu diperhatikan sebelum menandatangani." >
        <textarea className="input min-h-[96px]" maxLength={BATAS_TEKS.catatan} value={draf.catatanPenandatangan} onChange={(e) => ubah((d) => ({ ...d, catatanPenandatangan: e.target.value }))} />
      </Field>
      <Field label="Catatan untuk pengaju" bantuan="Dibaca pengaju di Ruang Pengguna setelah lembar difinalkan, bersama kesimpulannya. Tulis dengan bahasa yang mudah dipahami dan tanpa penilaian risiko internal.">
        <textarea className="input min-h-[96px]" maxLength={BATAS_TEKS.catatan} value={draf.catatanPengaju} onChange={(e) => ubah((d) => ({ ...d, catatanPengaju: e.target.value }))} />
      </Field>
    </>
  );
}
