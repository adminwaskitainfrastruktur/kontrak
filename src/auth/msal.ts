// Konfigurasi MSAL, mengikuti pola aplikasi IT Asset Management (stok):
// SPA dengan @azure/msal-browser, login popup, SSO diam-diam saat halaman
// dimuat, cache token di localStorage.
import { LogLevel, type Configuration, type PopupRequest, type SilentRequest } from "@azure/msal-browser";
import { DOMAIN_KANTOR } from "../config";

export const SCOPE_GRAPH = [
  "https://graph.microsoft.com/User.Read",
  // Membaca & menulis list serta dokumen di site Kontrak WKI. Akses nyatanya
  // tetap dibatasi oleh keanggotaan site SharePoint milik pengguna.
  "https://graph.microsoft.com/Sites.ReadWrite.All",
];

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID,
    authority: import.meta.env.VITE_MSAL_AUTHORITY,
    // Mengikuti origin yang sedang dibuka (http://localhost:8080 saat dev).
    // Origin ini wajib terdaftar sebagai Redirect URI platform SPA di Azure.
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: "localStorage",
  },
  system: {
    loggerOptions: {
      piiLoggingEnabled: false,
      logLevel: import.meta.env.DEV ? LogLevel.Warning : LogLevel.Error,
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error(`[MSAL] ${message}`);
        else if (level === LogLevel.Warning) console.warn(`[MSAL] ${message}`);
      },
    },
  },
};

export const loginRequest: PopupRequest = {
  scopes: SCOPE_GRAPH,
  prompt: "select_account",
  extraQueryParameters: { domain_hint: DOMAIN_KANTOR },
};

export const ssoRequest: SilentRequest = {
  scopes: SCOPE_GRAPH,
};

/**
 * Halaman ini sedang dimuat di dalam popup login atau iframe SSO MSAL?
 * Di sana jendela induk yang membaca kode otorisasi dari URL, jadi aplikasi
 * tidak boleh ikut dirender: router bisa mengubah hash dan merusak respons.
 */
export function dalamJendelaAuth(): boolean {
  const adaRespons = /[#&?](code|error)=/.test(window.location.hash + window.location.search);
  const jendelaAnak = window.opener != null || window.self !== window.top;
  return adaRespons && jendelaAnak;
}
