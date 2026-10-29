// Masuk ulang di tempat, tanpa memuat ulang halaman: isian dan catatan yang sedang diketik tetap ada.
//
// Dipanggil hanya dari klik pengguna (pita sesi, KotakError, toast), karena peramban memblokir popup
// yang tidak dipicu klik. Urutannya:
//   1. Di Microsoft Teams: jendela teams-auth.html (popup MSAL sering diblokir Teams).
//   2. Di peramban: acquireTokenPopup dengan akun yang sama.
//   3. Bila popup diblokir: loginRedirect sebagai cadangan (halaman dimuat ulang setelah login).
// Setelah berhasil, kabar "sesi pulih" dipancarkan supaya halaman aktif memuat ulang datanya.
import { msalTerpasang } from "../lib/graph";
import { kabarkanSesiPulih } from "../lib/pemancarSesi";
import { SCOPE_GRAPH, loginRequest } from "./msal";
import { dalamTeams, masukLewatJendela } from "./teams";

export type HasilMasukUlang = "berhasil" | "dibatalkan" | "dialihkan" | "gagal";

let berjalan: Promise<HasilMasukUlang> | null = null;

/** Satu proses masuk ulang untuk semua tombol: klik ganda atau dua tombol sekaligus tidak membuka dua popup. */
export function masukUlang(): Promise<HasilMasukUlang> {
  if (!berjalan) {
    berjalan = jalankan().finally(() => {
      berjalan = null;
    });
  }
  return berjalan;
}

async function jalankan(): Promise<HasilMasukUlang> {
  const msal = msalTerpasang();
  if (!msal) return "gagal";
  const akun = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null;

  if (dalamTeams()) {
    const hasil = await masukLewatJendela(msal);
    if (hasil === "berhasil") {
      kabarkanSesiPulih();
      return "berhasil";
    }
    return hasil === "ditutup" ? "dibatalkan" : "gagal";
  }

  try {
    const hasil = await msal.acquireTokenPopup({
      scopes: SCOPE_GRAPH,
      account: akun ?? undefined,
      loginHint: akun?.username,
      extraQueryParameters: loginRequest.extraQueryParameters,
    });
    if (hasil.account) msal.setActiveAccount(hasil.account);
    kabarkanSesiPulih();
    return "berhasil";
  } catch (err) {
    const kode = String((err as { errorCode?: string })?.errorCode ?? "");
    if (kode === "user_cancelled") return "dibatalkan";
    if (kode === "popup_window_error" || kode === "empty_window_error") {
      // Popup diblokir peramban: pindah halaman penuh ke Microsoft, lalu kembali ke alamat yang sama.
      await msal.loginRedirect({ ...loginRequest, prompt: undefined, loginHint: akun?.username });
      return "dialihkan";
    }
    console.error("[Masuk ulang]", err);
    return "gagal";
  }
}
