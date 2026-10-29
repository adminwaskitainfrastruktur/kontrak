// Dukungan Microsoft Teams (aplikasi pribadi / tab) tanpa Teams JS SDK.
//
// Di dalam Teams aplikasi dimuat dalam iframe. Popup MSAL sering diblokir Teams desktop, dan
// popup yang terbuka pun kadang tidak bisa mengirim hasil login kembali ke tab. Karena itu,
// saat berada di Teams, login berjalan di jendela terpisah (teams-auth.html) yang memakai
// loginRedirect biasa. Setelah selesai, jendela itu memberi kabar lalu menutup diri, dan cache
// MSAL (localStorage + BroadcastChannel) ikut terbaca oleh tab Teams.
//
// Bila Teams memisahkan penyimpanan jendela itu dari tab (terjadi di Teams versi web karena
// partisi penyimpanan pihak ketiga), jalan keluarnya: "Buka di browser".
import { PublicClientApplication, type IPublicClientApplication, type RedirectRequest } from "@azure/msal-browser";
import { loginRequest, msalConfig } from "./msal";

/** Parameter yang dipasang manifest Teams pada contentUrl: https://…/?teams=1#/saya */
const PARAM_TEAMS = "teams";
const KUNCI_SESI = "kontrak-di-teams";
const KANAL = "kontrak-teams-auth";
const KUNCI_COBA = "kontrak-teams-auth-coba";
export const ALAMAT_JENDELA_MASUK = "/teams-auth.html";

type PesanMasuk = { jenis: "kontrak-masuk"; hasil: "ok" | "galat"; pesan?: string };

function bacaSesi(kunci: string): string | null {
  try {
    return sessionStorage.getItem(kunci);
  } catch {
    return null;
  }
}

function tulisSesi(kunci: string, nilai: string | null) {
  try {
    if (nilai == null) sessionStorage.removeItem(kunci);
    else sessionStorage.setItem(kunci, nilai);
  } catch {
    /* penyimpanan diblokir: abaikan */
  }
}

function dalamIframe(): boolean {
  try {
    return window.parent !== window || window.self !== window.top;
  } catch {
    // Akses ke window.top lintas origin bisa melempar galat: pasti di dalam iframe.
    return true;
  }
}

/**
 * Apakah aplikasi sedang dibuka di dalam Microsoft Teams (atau Microsoft 365 / Outlook
 * yang menjalankan aplikasi Teams)? Pemeriksaan ringan tanpa SDK:
 *  - parameter ?teams=1 dari manifest (paling andal, diingat selama sesi tab),
 *  - user agent klien Teams desktop/seluler,
 *  - berada di iframe dengan perujuk domain Teams / Microsoft 365.
 */
export function dalamTeams(): boolean {
  if (typeof window === "undefined") return false;
  const param = new URLSearchParams(window.location.search).get(PARAM_TEAMS);
  if (param === "1") {
    tulisSesi(KUNCI_SESI, "1");
    return true;
  }
  if (bacaSesi(KUNCI_SESI) === "1") return true;
  if (/\bTeams\/|MicrosoftTeams/i.test(navigator.userAgent)) return true;
  if (dalamIframe()) {
    const perujuk = document.referrer;
    if (/^https:\/\/([\w-]+\.)*(teams\.microsoft\.com|teams\.cloud\.microsoft|cloud\.microsoft|office\.com|microsoft365\.com|office365\.com)(\/|$)/i.test(perujuk)) return true;
  }
  return false;
}

/** Alamat aplikasi di peramban biasa (tanpa penanda Teams), di halaman yang sama. */
export function alamatDiBrowser(): string {
  const hash = window.location.hash && window.location.hash !== "#" ? window.location.hash : "#/";
  return `${window.location.origin}/${hash}`;
}

export type HasilMasukJendela =
  /** Akun sudah terbaca di tab ini; aplikasi akan terbuka sendiri. */
  | "berhasil"
  /** Jendela tidak bisa dibuka (diblokir Teams/peramban). */
  | "diblokir"
  /** Pengguna menutup jendela sebelum selesai. */
  | "ditutup"
  /** Login berhasil di jendela lain, tetapi penyimpanannya terpisah dari tab Teams. */
  | "terpisah"
  /** Microsoft mengembalikan galat atau waktu habis. */
  | "gagal";

/**
 * Membuka teams-auth.html di jendela baru, menunggu kabar hasil login, lalu memastikan
 * akun terbaca oleh instance MSAL tab ini.
 */
export function masukLewatJendela(instance: IPublicClientApplication): Promise<HasilMasukJendela> {
  return new Promise((selesai) => {
    const lebar = 520;
    const tinggi = 680;
    const kiri = Math.max(0, Math.round((window.screenX || 0) + (window.outerWidth - lebar) / 2));
    const atas = Math.max(0, Math.round((window.screenY || 0) + (window.outerHeight - tinggi) / 2));
    let jendela: Window | null = null;
    try {
      jendela = window.open(ALAMAT_JENDELA_MASUK, "kontrak-masuk", `width=${lebar},height=${tinggi},left=${kiri},top=${atas}`);
    } catch {
      jendela = null;
    }
    if (!jendela) {
      selesai("diblokir");
      return;
    }

    let beres = false;
    let kanal: BroadcastChannel | null = null;
    const timer: { pantau?: ReturnType<typeof setInterval>; batas?: ReturnType<typeof setTimeout>; tutup?: ReturnType<typeof setTimeout> } = {};

    const akhiri = (hasil: HasilMasukJendela) => {
      if (beres) return;
      beres = true;
      clearInterval(timer.pantau);
      clearTimeout(timer.batas);
      clearTimeout(timer.tutup);
      window.removeEventListener("message", diPesan);
      kanal?.close();
      selesai(hasil);
    };

    // Cache MSAL di tab ini diperbarui lewat BroadcastChannel secara asinkron, jadi akun
    // ditunggu sebentar sebelum menyimpulkan penyimpanannya terpisah.
    const tungguAkun = async () => {
      for (let i = 0; i < 16; i++) {
        const akun = instance.getAllAccounts();
        if (akun.length > 0) {
          instance.setActiveAccount(akun[0]!);
          akhiri("berhasil");
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      akhiri("terpisah");
    };

    const olah = (data: unknown) => {
      const p = data as Partial<PesanMasuk> | null;
      if (!p || p.jenis !== "kontrak-masuk" || beres) return;
      if (p.hasil === "ok") void tungguAkun();
      else akhiri("gagal");
    };

    function diPesan(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      olah(e.data);
    }
    window.addEventListener("message", diPesan);
    try {
      kanal = new BroadcastChannel(KANAL);
      kanal.onmessage = (e) => olah(e.data);
    } catch {
      kanal = null;
    }

    timer.pantau = setInterval(() => {
      let tertutup = false;
      try {
        tertutup = jendela!.closed;
      } catch {
        tertutup = false;
      }
      // Beri jeda singkat: kabar dari jendela bisa tiba sesaat setelah jendela tertutup.
      if (tertutup && timer.tutup === undefined) {
        timer.tutup = setTimeout(() => {
          if (instance.getAllAccounts().length > 0) void tungguAkun();
          else akhiri("ditutup");
        }, 1500);
      }
    }, 500);
    timer.batas = setTimeout(() => akhiri("gagal"), 5 * 60 * 1000);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bagian yang berjalan DI DALAM jendela teams-auth.html
// ─────────────────────────────────────────────────────────────────────────────

function kabari(pesan: PesanMasuk) {
  try {
    const kanal = new BroadcastChannel(KANAL);
    kanal.postMessage(pesan);
    kanal.close();
  } catch {
    /* BroadcastChannel tidak tersedia */
  }
  try {
    window.opener?.postMessage(pesan, window.location.origin);
  } catch {
    /* jendela pembuka sudah tidak terjangkau */
  }
}

function tampilkan(judul: string, isi: string, galat = false) {
  const elJudul = document.getElementById("judul");
  const elIsi = document.getElementById("isi");
  const elPutar = document.getElementById("putar");
  if (elJudul) elJudul.textContent = judul;
  if (elIsi) elIsi.textContent = isi;
  if (elPutar) elPutar.hidden = true;
  if (galat) document.body.dataset.galat = "1";
}

/**
 * Titik masuk teams-auth.html. Kunjungan pertama memanggil loginRedirect; setelah Microsoft
 * mengembalikan pengguna ke halaman ini, hasilnya diproses, tab Teams dikabari, lalu jendela
 * menutup diri.
 *
 * redirectUri halaman ini (<origin>/teams-auth.html) harus terdaftar sebagai Redirect URI
 * platform SPA di app registration Azure, di samping origin aplikasi.
 */
export async function jalankanJendelaMasuk(): Promise<void> {
  const redirectUri = `${window.location.origin}${ALAMAT_JENDELA_MASUK}`;
  const pca = new PublicClientApplication({
    ...msalConfig,
    auth: { ...msalConfig.auth, redirectUri, navigateToLoginRequestUrl: false },
  });

  try {
    await pca.initialize();
    const hasil = await pca.handleRedirectPromise();
    if (hasil) {
      pca.setActiveAccount(hasil.account);
      tulisSesi(KUNCI_COBA, null);
      kabari({ jenis: "kontrak-masuk", hasil: "ok" });
      tampilkan("Berhasil masuk", "Jendela ini akan tertutup. Bila tidak, tutup saja lalu kembali ke Teams.");
      setTimeout(() => window.close(), 600);
      return;
    }

    // Tidak ada respons. Cegah putaran tanpa akhir bila redirect sebelumnya tidak kembali dengan hasil.
    if (bacaSesi(KUNCI_COBA) === "1") {
      tulisSesi(KUNCI_COBA, null);
      kabari({ jenis: "kontrak-masuk", hasil: "galat", pesan: "tanpa_respons" });
      tampilkan("Login belum selesai", "Microsoft tidak mengembalikan hasil login. Tutup jendela ini dan coba lagi, atau buka WiCon di browser.", true);
      return;
    }

    tulisSesi(KUNCI_COBA, "1");
    const permintaan: RedirectRequest = { ...loginRequest, redirectUri };
    await pca.loginRedirect(permintaan);
  } catch (err) {
    tulisSesi(KUNCI_COBA, null);
    const kode = String((err as { errorCode?: string })?.errorCode ?? (err as Error)?.message ?? "");
    kabari({ jenis: "kontrak-masuk", hasil: "galat", pesan: kode });
    const batal = kode.includes("user_cancelled") || kode.includes("access_denied");
    tampilkan(
      batal ? "Login dibatalkan" : "Login gagal",
      batal ? "Tidak apa-apa. Tutup jendela ini dan coba lagi kapan saja dari Teams." : "Maaf, login belum berhasil. Tutup jendela ini lalu coba lagi, atau hubungi admin bila terus berulang.",
      true,
    );
  }
}
