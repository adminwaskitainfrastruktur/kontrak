// Layar untuk akun yang tidak boleh masuk. Tiga alasan dibedakan (lib/akses.ts): akun dinonaktifkan,
// akun di luar domain kantor, dan akun kantor yang belum punya akses ke situs SharePoint (403).
// "Minta akses" membuka email ke Admin bawaan; aplikasi tidak menulis apa pun ke list Pengguna.
import { useMsal } from "@azure/msal-react";
import { motion } from "framer-motion";
import { Globe2, Lock, Mail, RefreshCw, ServerCog, UserX } from "lucide-react";
import { ADMIN_BAWAAN, DOMAIN_KANTOR } from "../config";
import type { AlasanTanpaAkses } from "../lib/akses";
import { pegasMantul } from "../lib/gerak";
import { Avatar, Tombol } from "../components/ui";

const ISI: Record<AlasanTanpaAkses, { judul: string; teks: string[]; ikon: typeof Lock; subjek: string }> = {
  dinonaktifkan: {
    judul: "Akun Anda dinonaktifkan",
    teks: ["Admin aplikasi menonaktifkan akses akun ini ke WiCon.", "Bila menurut Anda ini keliru, minta Admin mengaktifkannya kembali."],
    ikon: UserX,
    subjek: "Permintaan aktifkan kembali akses WiCon",
  },
  "di-luar-domain": {
    judul: "Akun ini tidak bisa dipakai",
    teks: [`WiCon hanya untuk akun kantor @${DOMAIN_KANTOR}.`, "Masuk dengan akun kantor Anda, atau minta akses ke Admin bila Anda memang perlu memakai akun ini."],
    ikon: Globe2,
    subjek: "Permintaan akses WiCon",
  },
  "tanpa-situs": {
    judul: "Akses situs belum diberikan",
    teks: [
      "Akun kantor Anda sudah dikenali, tetapi belum punya akses ke situs SharePoint Kontrak WKI tempat data kontrak disimpan.",
      "Admin perlu menambahkan Anda sebagai anggota situs. Setelah itu, tekan Coba lagi.",
    ],
    ikon: ServerCog,
    subjek: "Permintaan akses situs SharePoint Kontrak WKI",
  },
};

/** Tautan mailto ke Admin bawaan, atau null bila belum ada alamat Admin yang diatur. */
function tautanMintaAkses(alasan: AlasanTanpaAkses, email: string, nama: string): string | null {
  if (ADMIN_BAWAAN.length === 0) return null;
  const isi = ISI[alasan];
  const badan = [
    "Halo Admin WiCon,",
    "",
    `Saya ${nama} (${email}) belum bisa masuk ke aplikasi WiCon.`,
    `Pesan di layar: ${isi.judul}.`,
    "",
    "Mohon bantuannya untuk memberi akses. Terima kasih.",
  ].join("\r\n");
  return `mailto:${ADMIN_BAWAAN.join(",")}?subject=${encodeURIComponent(isi.subjek)}&body=${encodeURIComponent(badan)}`;
}

export default function TanpaAkses({ email, nama, alasan, ulangi }: { email: string; nama: string; alasan: AlasanTanpaAkses; ulangi?: () => void }) {
  const { instance } = useMsal();
  const isi = ISI[alasan];
  const Ikon = isi.ikon;
  const mailto = tautanMintaAkses(alasan, email, nama);
  const akunLain = () => void instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin });

  return (
    <div className="relative grid min-h-layar place-items-center overflow-hidden bg-bg px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:p-6">
      <motion.div className="absolute -left-32 -top-32 h-96 w-96 rounded-full pendar-brand blur-3xl" animate={{ x: [0, 60, 0], y: [0, 40, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} aria-hidden="true" />
      <motion.div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full pendar-aksen blur-3xl" animate={{ x: [0, -50, 0], y: [0, -40, 0] }} transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }} aria-hidden="true" />
      <motion.main initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={pegasMantul} className="kartu relative w-full max-w-md p-6 text-center sm:p-8">
        <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...pegasMantul, delay: 0.15 }} className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg" aria-hidden="true">
          <Ikon className="h-7 w-7" />
        </motion.div>
        <h1 className="judul mt-5 text-2xl sm:text-3xl">{isi.judul}</h1>
        <div className="mx-auto mt-4 flex max-w-full items-center gap-3 rounded-2xl bg-raised px-4 py-2.5 text-left sm:w-fit">
          <Avatar nama={nama} ukuran={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" title={nama}>{nama}</p>
            <p className="flex min-w-0 items-center gap-1 text-xs text-muted">
              <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate" title={email}>{email}</span>
            </p>
          </div>
        </div>
        {isi.teks.map((t) => (
          <p key={t} className="mt-3 text-sm text-muted first-of-type:mt-4">
            {t}
          </p>
        ))}

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          {alasan === "tanpa-situs" && ulangi && (
            <Tombol className="min-h-11" ikon={<RefreshCw className="h-4 w-4" aria-hidden="true" />} onClick={ulangi}>
              Coba lagi
            </Tombol>
          )}
          {mailto && (
            <a href={mailto} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${alasan === "tanpa-situs" ? "border border-line bg-surface text-ink shadow-sm hover:border-brand hover:bg-raised" : "bg-gradient-to-b from-brand to-brand-strong text-brand-on shadow-card"}`}>
              <Mail className="h-4 w-4" aria-hidden="true" /> Minta akses
            </a>
          )}
          <Tombol varian="kedua" className="min-h-11" onClick={akunLain}>
            Masuk dengan akun lain
          </Tombol>
        </div>
        {!mailto && <p className="mt-4 text-xs text-muted">Hubungi admin aplikasi (tim Legal) untuk meminta akses.</p>}
        <p className="mt-4 text-xs text-muted">“Masuk dengan akun lain” mengeluarkan akun Microsoft ini dari peramban, lalu Anda bisa memilih akun kantor yang benar.</p>
      </motion.main>
    </div>
  );
}
