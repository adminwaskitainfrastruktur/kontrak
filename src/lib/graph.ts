// Klien Microsoft Graph tipis. Semua data aplikasi (list SharePoint dan
// dokumen) lewat sini, dengan token pengguna yang sedang login.
//
// Ketahanan sesi (U38):
// - Token yang tidak bisa diperbarui diam-diam (atau HTTP 401) memancarkan kabar "perlu login";
//   pita sesi di atas layar lalu menawarkan Masuk ulang tanpa membuang isian di halaman.
// - 429 diulang untuk semua metode, 503/504 hanya untuk GET/PATCH/DELETE (lihat lib/cobaUlang.ts).
// - Koneksi putus menjadi GraphError berkode "jaringan" dengan pesan yang bisa dipahami.
import {
  InteractionRequiredAuthError,
  type IPublicClientApplication,
} from "@azure/msal-browser";
import { SCOPE_GRAPH } from "../auth/msal";
import { jedaCobaUlang, tidur } from "./cobaUlang";
import { kabarkanPerluLogin } from "./pemancarSesi";

const GRAPH = "https://graph.microsoft.com/v1.0";

let msal: IPublicClientApplication | null = null;

export function pasangMsal(instance: IPublicClientApplication) {
  msal = instance;
}

/** Instance MSAL yang dipasang saat aplikasi dimulai (dipakai alur Masuk ulang). */
export function msalTerpasang(): IPublicClientApplication | null {
  return msal;
}

export type KodeGraphError = "perlu_login" | "jaringan";

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kode?: KodeGraphError,
  ) {
    super(message);
  }
  /** Token tidak bisa diambil diam-diam; pengguna perlu login ulang. */
  get perluLogin() {
    return this.kode === "perlu_login";
  }
  /** Permintaan tidak sampai ke Microsoft 365 (luring atau jaringan putus). */
  get jaringan() {
    return this.kode === "jaringan";
  }
}

function galatSesi(pesan: string): GraphError {
  kabarkanPerluLogin();
  return new GraphError(pesan, 401, "perlu_login");
}

function galatJaringan(): GraphError {
  const luring = typeof navigator !== "undefined" && navigator.onLine === false;
  return new GraphError(
    luring
      ? "Perangkat Anda sedang luring. Periksa koneksi internet, lalu coba lagi."
      : "Tidak bisa menghubungi Microsoft 365. Periksa koneksi internet, lalu coba lagi.",
    0,
    "jaringan",
  );
}

async function ambilToken(): Promise<string> {
  if (!msal) throw new GraphError("MSAL belum siap", 0);
  const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0];
  if (!account) throw galatSesi("Anda belum login.");
  try {
    return (await msal.acquireTokenSilent({ scopes: SCOPE_GRAPH, account })).accessToken;
  } catch (err) {
    // Popup tidak dibuka di sini: permintaan ini bisa berjalan saat halaman
    // dimuat, dan peramban memblokir popup yang tidak dipicu klik. Pita sesi
    // yang menawarkan Masuk ulang dari klik pengguna.
    if (err instanceof InteractionRequiredAuthError) {
      throw galatSesi("Sesi Microsoft Anda perlu diperbarui. Silakan masuk ulang.");
    }
    const kode = String((err as { errorCode?: string })?.errorCode ?? "");
    if (kode === "no_network_connectivity" || kode === "post_request_failed" || (typeof navigator !== "undefined" && navigator.onLine === false)) {
      throw galatJaringan();
    }
    throw err;
  }
}

function pesanGagal(status: number, detail: string): string {
  if (status === 401) return "Sesi Microsoft Anda berakhir. Silakan masuk ulang.";
  if (status === 403)
    return "Akun Anda belum punya izin untuk data ini di situs SharePoint Kontrak WKI. Minta Admin aplikasi menambahkan Anda sebagai anggota (Member) situs.";
  if (status === 404) return "Data tidak ditemukan. Mungkin sudah dihapus.";
  if (status === 429 || status === 503 || status === 504) return "SharePoint sedang sibuk. Coba lagi sebentar lagi.";
  return detail || `Permintaan ke Microsoft Graph gagal (HTTP ${status}).`;
}

type Opsi = Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit };

export async function graph<T = unknown>(path: string, opsi: Opsi = {}): Promise<T> {
  const { json, headers, ...sisa } = opsi;
  const url = path.startsWith("https://") ? path : `${GRAPH}${path}`;
  const metode = (sisa.method ?? "GET").toUpperCase();
  const body = json !== undefined ? JSON.stringify(json) : opsi.body;

  for (let percobaan = 0; ; percobaan++) {
    // Token diambil ulang tiap percobaan: jeda Retry-After bisa melewati umur token.
    const token = await ambilToken();
    let res: Response;
    try {
      res = await fetch(url, {
        ...sisa,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body,
      });
    } catch (err) {
      // Dibatalkan oleh pemanggil: teruskan apa adanya.
      if (sisa.signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) throw err;
      throw galatJaringan();
    }

    if (!res.ok) {
      const jeda = jedaCobaUlang({ metode, status: res.status, percobaan, retryAfter: res.headers.get("Retry-After") });
      if (jeda != null) {
        await tidur(jeda, sisa.signal);
        continue;
      }
      let detail = "";
      try {
        detail = (await res.json())?.error?.message ?? "";
      } catch {
        /* respons bukan JSON */
      }
      if (res.status === 401) throw galatSesi(pesanGagal(401, detail));
      throw new GraphError(pesanGagal(res.status, detail), res.status);
    }
    if (res.status === 204) return undefined as T;
    const teks = await res.text();
    return (teks ? JSON.parse(teks) : undefined) as T;
  }
}

/** Ambil semua halaman hasil (@odata.nextLink) dari sebuah koleksi. */
export async function graphSemua<T>(path: string, opsi: Opsi = {}): Promise<T[]> {
  const hasil: T[] = [];
  let berikut: string | undefined = path;
  while (berikut) {
    const halaman: { value: T[]; "@odata.nextLink"?: string } = await graph(berikut, opsi);
    hasil.push(...halaman.value);
    berikut = halaman["@odata.nextLink"];
  }
  return hasil;
}

export function pesanError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
