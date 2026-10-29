// Hasil review Legal untuk pengaju (Ruang Pengguna): HANYA kesimpulan dan catatan yang ditujukan kepadanya.
// Temuan, tingkat risiko, tanggapan, dan catatan untuk penandatangan tidak pernah dimuat di sini: komponen ini membaca
// kolom ringkas HasilReview, bukan LembarReview (lihat services/lembarReview).
import { CheckCircle2, ClipboardCheck, MessageSquareText, OctagonAlert, TriangleAlert } from "lucide-react";
import { formatTanggal } from "../lib/format";
import { defKesimpulan } from "../lib/lembarStandar";
import { tampilkanHasilUntukPengaju, type HasilReviewPengaju } from "../lib/lembarReview";
import type { Kontrak } from "../lib/types";
import { cx } from "./ui";

export default function KartuHasilReview({ hasil, k }: { hasil: HasilReviewPengaju | null; k: Pick<Kontrak, "status" | "statusSejak"> }) {
  if (!tampilkanHasilUntukPengaju(hasil, k) || !hasil) return null;
  const def = defKesimpulan(hasil.kesimpulan);
  if (!def) return null;
  const Ikon = def.nada === "sukses" ? CheckCircle2 : def.nada === "bahaya" ? OctagonAlert : TriangleAlert;
  const warna = def.nada === "sukses" ? "bg-success-soft text-success" : def.nada === "bahaya" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-ink";

  return (
    <section className="kartu p-5 sm:p-6" aria-labelledby={`hasil-review-${hasil.putaran}`}>
      <h2 id={`hasil-review-${hasil.putaran}`} className="flex items-center gap-2 font-bold">
        <ClipboardCheck className="h-4 w-4 text-brand" aria-hidden="true" /> Hasil review Legal
      </h2>
      <div className={cx("mt-3 flex items-start gap-3 rounded-2xl px-4 py-3", warna)}>
        <Ikon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-bold">{def.label}</p>
          <p className="mt-0.5 text-sm">{def.untukPengaju}</p>
        </div>
      </div>
      {hasil.catatan.trim() && (
        <div className="mt-3 rounded-2xl bg-raised px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" /> Catatan dari Legal
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{hasil.catatan}</p>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Review putaran {hasil.putaran}
        {hasil.tanggal ? `, ${formatTanggal(hasil.tanggal)}` : ""}
        {hasil.oleh ? `, oleh ${hasil.oleh}` : ""}.
      </p>
    </section>
  );
}
