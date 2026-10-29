// Halaman masuk. Tata letaknya mengikuti Portal Waskita (portal.waskitainfrastruktur.co.id):
// foto kantor dengan judul besar di kiri, kartu putih dengan tombol Microsoft di kanan.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock, ExternalLink, FilePlus2, Hand, Loader2, Moon, PenLine, Scale, ShieldCheck, Sun, Archive } from "lucide-react";
import { loginRequest, ssoRequest } from "../auth/msal";
import { DOMAIN_KANTOR } from "../config";
import { alamatDiBrowser, dalamTeams, masukLewatJendela } from "../auth/teams";
import { useTema } from "../hooks/useTema";
import { cx } from "../components/ui";

// Foto dipakai langsung dari portal (tidak disalin ke proyek ini). Jika gagal dimuat,
// panel kiri tetap tampil dengan gradasi teal.
const FOTO_TERANG = "https://portal.waskitainfrastruktur.co.id/front.jpeg";
const FOTO_GELAP = "https://portal.waskitainfrastruktur.co.id/back.jpeg";

function LogoMicrosoft() {
  return (
    <svg viewBox="0 0 21 21" className="h-5 w-5 shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

const ALUR = [
  { ikon: FilePlus2, label: "Pengajuan", warna: "bg-sky-500" },
  { ikon: Scale, label: "Review Legal", warna: "bg-emerald-500" },
  { ikon: PenLine, label: "Tanda tangan", warna: "bg-indigo-500" },
  { ikon: Archive, label: "Arsip", warna: "bg-orange-500" },
  { ikon: CalendarClock, label: "Pengingat", warna: "bg-rose-500" },
];

const masuk = (d: number) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay: d * 0.5, duration: 0.38, ease: [0.22, 1, 0.36, 1] as const } });

export default function Login() {
  const { instance } = useMsal();
  const [gelap, gantiTema] = useTema();
  const [memuat, setMemuat] = useState(false);
  const [cekSso, setCekSso] = useState(true);
  const [galat, setGalat] = useState("");
  const [fotoGagal, setFotoGagal] = useState(false);
  const sudahSso = useRef(false);

  // Di Microsoft Teams popup MSAL sering diblokir, jadi login berjalan di jendela terpisah
  // (teams-auth.html, loginRedirect). Tombol "Buka di browser" selalu tersedia sebagai jalan keluar.
  const diTeams = useMemo(() => dalamTeams(), []);
  const diBingkai = useMemo(() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }, []);
  const [sarankanBrowser, setSarankanBrowser] = useState(false);
  // Popup diblokir peramban (sering di Safari/iOS): tawarkan masuk di halaman ini saja, tanpa jendela baru.
  const [tawarkanTanpaPopup, setTawarkanTanpaPopup] = useState(false);

  // `?sso=off` melewati pemeriksaan sesi otomatis, berguna untuk melihat halaman ini
  // padahal sesi Microsoft 365 masih aktif.
  const tanpaSso = new URLSearchParams(window.location.search).get("sso") === "off";

  // SSO berjalan di latar belakang; tombol tetap bisa dipakai. Jika pengguna sudah
  // masuk Microsoft 365 di peramban ini, aplikasi langsung terbuka.
  useEffect(() => {
    if (sudahSso.current) return;
    sudahSso.current = true;
    if (tanpaSso) {
      setCekSso(false);
      return;
    }
    let hidup = true;
    const batas = setTimeout(() => hidup && setCekSso(false), 3000);
    instance
      .ssoSilent(ssoRequest)
      .catch(() => {
        /* tidak ada sesi: pengguna masuk lewat tombol */
      })
      .finally(() => {
        if (hidup) {
          clearTimeout(batas);
          setCekSso(false);
        }
      });
    return () => {
      hidup = false;
      clearTimeout(batas);
    };
  }, [instance, tanpaSso]);

  const masukTeams = async () => {
    setMemuat(true);
    setGalat("");
    try {
      const hasil = await masukLewatJendela(instance);
      if (hasil === "berhasil" || hasil === "ditutup") return; // berhasil: aplikasi terbuka sendiri
      setSarankanBrowser(true);
      if (hasil === "diblokir") setGalat("Teams belum mengizinkan jendela login terbuka. Tidak apa-apa, buka WiCon di browser untuk masuk.");
      else if (hasil === "terpisah") setGalat("Login sudah berhasil, tetapi Teams menyimpan sesinya terpisah dari tab ini. Muat ulang tab ini, atau buka WiCon di browser.");
      else setGalat("Login belum berhasil. Coba sekali lagi, atau buka WiCon di browser.");
    } finally {
      setMemuat(false);
    }
  };

  const masukMicrosoft = async () => {
    if (diTeams) return masukTeams();
    setMemuat(true);
    setGalat("");
    try {
      await instance.loginPopup(loginRequest);
    } catch (err) {
      const kode = String((err as { errorCode?: string })?.errorCode ?? (err as Error)?.message ?? "");
      if (kode.includes("interaction_in_progress")) {
        // Cek SSO latar belakang belum selesai; coba sekali lagi.
        await new Promise((r) => setTimeout(r, 700));
        try {
          await instance.loginPopup(loginRequest);
          return;
        } catch {
          /* jatuh ke pesan di bawah */
        }
      }
      if (!kode.includes("user_cancelled")) {
        // Di dalam bingkai (mis. Teams yang tak terdeteksi), popup yang gagal paling mudah diatasi di tab biasa.
        if (diBingkai) setSarankanBrowser(true);
        const popupDiblokir = kode.includes("popup_window_error") || kode.includes("empty_window_error");
        if (popupDiblokir) setTawarkanTanpaPopup(true);
        setGalat(popupDiblokir ? "Peramban memblokir jendela login. Pakai tombol “Masuk di halaman ini” di bawah, atau izinkan popup untuk situs ini." : "Login belum berhasil. Coba lagi, atau hubungi admin bila berulang.");
      }
    } finally {
      setMemuat(false);
    }
  };

  // Tanpa popup: pindah penuh ke halaman Microsoft lalu kembali ke sini (MSAL memprosesnya saat halaman dimuat ulang).
  const masukTanpaPopup = async () => {
    setMemuat(true);
    setGalat("");
    try {
      await instance.loginRedirect(loginRequest);
    } catch {
      setGalat("Login belum berhasil. Coba lagi, atau hubungi admin bila berulang.");
      setMemuat(false);
    }
  };

  return (
    <div className="grid min-h-[100dvh] grid-rows-[auto_1fr] bg-[#f8fafc] font-geist text-slate-900 dark:bg-[#020617] dark:text-slate-100 lg:grid-cols-[1.08fr_1fr] lg:grid-rows-1">
      {/* ── Ponsel: banner merek di atas ── */}
      <header className="hero-bg relative overflow-hidden px-6 pb-16 pt-[max(3.25rem,calc(env(safe-area-inset-top)+2.25rem))] text-center text-white lg:hidden">
        <div className="titik-halus pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
        <motion.div {...masuk(0)} className="relative mx-auto w-fit rounded-2xl bg-white px-5 py-3 shadow-xl shadow-black/25">
          <img src="/logo-wicon.png" alt="WiCon Infrastruktur, Contract Management & Dashboard" className="h-14 w-auto min-[400px]:h-16" width={600} height={332} />
        </motion.div>
        <motion.p {...masuk(0.1)} className="relative mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200">
          Sistem kontrak internal
        </motion.p>
        <motion.h1 {...masuk(0.16)} className="relative mt-1.5 text-balance text-[1.65rem] font-extrabold leading-tight tracking-tight">
          Satu Tempat, <span className="bg-gradient-to-r from-cyan-200 via-sky-300 to-indigo-300 bg-clip-text text-transparent">Semua Kontrak Waskita.</span>
        </motion.h1>
      </header>

      {/* ── Kiri: foto + judul ── */}
      <section className="hero-bg relative hidden overflow-hidden lg:block" aria-label="Sambutan">
        {!fotoGagal && (
          <>
            <img src={FOTO_TERANG} alt="" onError={() => setFotoGagal(true)} className={cx("absolute inset-0 h-full w-full object-cover transition-opacity duration-700", gelap ? "opacity-0" : "opacity-100")} />
            <img src={FOTO_GELAP} alt="" onError={() => setFotoGagal(true)} className={cx("absolute inset-0 h-full w-full object-cover transition-opacity duration-700", gelap ? "opacity-100" : "opacity-0")} />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-slate-950/40" aria-hidden="true" />

        <div className="relative flex h-full flex-col justify-between p-10 xl:p-12">
          <motion.div {...masuk(0)} className="flex items-center gap-4 text-white">
            <span className="rounded-2xl bg-white px-5 py-3 shadow-lg">
              <img src="/logo-wicon.png" alt="WiCon Infrastruktur, Contract Management & Dashboard" className="h-16 w-auto xl:h-20" width={600} height={332} />
            </span>
          </motion.div>

          <div>
            <motion.p {...masuk(0.1)} className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
              Sistem kontrak internal
            </motion.p>
            <motion.h1 {...masuk(0.18)} className="text-6xl font-extrabold leading-[0.98] tracking-tight text-white xl:text-7xl 2xl:text-[5.25rem]">
              Satu Tempat,
              <br />
              <span className="bg-gradient-to-r from-cyan-200 via-sky-300 to-indigo-300 bg-clip-text text-transparent">Semua Kontrak Waskita.</span>
            </motion.h1>
            <motion.p {...masuk(0.28)} className="mt-6 max-w-md text-base text-slate-200">
              Pengadaan dan SCM mengajukan, Legal mereview sampai tanda tangan, semua tercatat rapi dengan pengingat masa berlaku.
            </motion.p>
          </div>

          <motion.ul {...masuk(0.38)} className="flex items-center justify-end gap-2" aria-label="Alur kontrak">
            {ALUR.map(({ ikon: Ikon, label, warna }) => (
              <li key={label} title={label} className={cx("grid h-9 w-9 place-items-center rounded-xl text-white shadow-lg ring-1 ring-white/20", warna)}>
                <Ikon className="h-[18px] w-[18px]" aria-hidden="true" />
                <span className="sr-only">{label}</span>
              </li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* ── Kanan: kartu masuk ── */}
      <section className="relative -mt-8 flex flex-col items-center overflow-hidden rounded-t-[32px] bg-[#f8fafc] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 shadow-[0_-12px_32px_-12px_rgba(2,6,23,.35)] dark:bg-[#020617] sm:px-6 lg:mt-0 lg:min-h-0 lg:justify-center lg:rounded-none lg:pt-20 lg:shadow-none">
        <div
          className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-30"
          style={{
            backgroundImage: "linear-gradient(to right, rgb(148 163 184 / .16) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / .16) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at center, black 30%, transparent 78%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 78%)",
          }}
          aria-hidden="true"
        />

        <button
          onClick={gantiTema}
          className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex items-center gap-0.5 rounded-full border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 sm:right-5 lg:absolute lg:top-[max(1.25rem,env(safe-area-inset-top))]"
          aria-label={gelap ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
        >
          <span className={cx("grid h-9 w-9 place-items-center rounded-full transition-colors", !gelap ? "bg-amber-500 text-white" : "text-slate-500")}>
            <Sun className="h-4 w-4" />
          </span>
          <span className={cx("grid h-9 w-9 place-items-center rounded-full transition-colors", gelap ? "bg-violet-500 text-white" : "text-slate-500")}>
            <Moon className="h-4 w-4" />
          </span>
        </button>

        <div className="relative w-full max-w-[25rem]">

          <motion.span {...masuk(0.1)} className="mx-auto flex w-fit items-center gap-2 rounded-full lg:mx-0 border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            WiCon · Contract Management &amp; Dashboard
          </motion.span>

          <motion.h2 {...masuk(0.16)} className="mt-4 flex flex-wrap items-center justify-center gap-2 text-3xl font-bold tracking-tight lg:justify-start">
            Selamat Datang
            <motion.span aria-hidden="true" animate={{ rotate: [0, 16, -8, 16, 0] }} transition={{ delay: 0.9, duration: 1.1, ease: "easeInOut" }} className="inline-block origin-bottom-right text-amber-500">
              <Hand className="h-7 w-7" />
            </motion.span>
          </motion.h2>
          <motion.p {...masuk(0.22)} className="mt-2 text-center text-sm leading-relaxed text-slate-500 dark:text-slate-400 lg:text-left">
            Masuk menggunakan akun perusahaan Anda untuk melanjutkan.
          </motion.p>

          <motion.button
            {...masuk(0.3)}
            whileTap={{ scale: 0.985 }}
            onClick={masukMicrosoft}
            disabled={memuat}
            aria-busy={memuat}
            className="group mt-6 flex min-h-12 w-full touch-manipulation items-center justify-center gap-3 rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white shadow-xl shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70 dark:bg-white dark:text-slate-900 dark:shadow-black/40 dark:hover:bg-slate-100"
          >
            {memuat ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <LogoMicrosoft />}
            {memuat ? "Menunggu Microsoft…" : "Lanjutkan dengan Microsoft 365"}
            {!memuat && <ArrowRight className="h-4 w-4 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true" />}
          </motion.button>

          <div role="status" aria-live="polite" className="mt-3 min-h-5 text-balance text-center text-xs text-slate-500 dark:text-slate-400">
            {diTeams && memuat && <span>Selesaikan login di jendela Microsoft yang baru terbuka, lalu kembali ke sini.</span>}
            {cekSso && !memuat && (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Memeriksa sesi Microsoft 365… (tetap bisa klik tombol di atas)
              </span>
            )}
          </div>
          {galat && (
            <p role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {galat}
            </p>
          )}

          {tawarkanTanpaPopup && !diTeams && (
            <button type="button" onClick={() => void masukTanpaPopup()} disabled={memuat} className="mt-3 inline-flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800">
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              Masuk di halaman ini
            </button>
          )}

          {(diTeams || sarankanBrowser) && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <a
                href={alamatDiBrowser()}
                target="_blank"
                rel="noopener noreferrer"
                className={cx(
                  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition",
                  sarankanBrowser
                    ? "w-full border border-slate-300 bg-white px-4 py-2.5 text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                    : "px-3 py-2 text-slate-600 underline-offset-4 hover:underline dark:text-slate-300",
                )}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Buka di browser
              </a>
              {sarankanBrowser && diTeams && (
                <button type="button" onClick={() => window.location.reload()} className="min-h-11 px-2 text-xs font-medium text-slate-500 underline-offset-4 hover:underline dark:text-slate-400">
                  Sudah masuk di jendela lain? Muat ulang tab ini
                </button>
              )}
              {diTeams && !sarankanBrowser && <p className="text-center text-xs text-slate-500 dark:text-slate-400">Anda membuka WiCon dari Microsoft Teams. Login berjalan di jendela terpisah.</p>}
            </div>
          )}

          <motion.div {...masuk(0.4)} className="my-7 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            Aman &amp; terpercaya
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </motion.div>

          <motion.div {...masuk(0.46)} className="flex gap-3 rounded-2xl bg-slate-100/80 p-4 text-sm leading-relaxed text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <ShieldCheck className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <p>
              Diamankan oleh <strong className="text-slate-900 dark:text-white">Microsoft Entra ID</strong>. Masuk dengan akun kantor @{DOMAIN_KANTOR}; peran Legal dan akses divisi diatur admin.
            </p>
          </motion.div>

          <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">© {new Date().getFullYear()} PT Waskita Karya Infrastruktur</p>
        </div>
      </section>
    </div>
  );
}
