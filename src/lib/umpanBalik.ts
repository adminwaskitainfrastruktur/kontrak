// Umpan balik singkat (toast) di satu tempat, supaya nada dan perilakunya sama di semua komponen:
// sukses hilang sendiri, gagal bertahan lebih lama, galat sesi selalu menawarkan "Masuk ulang",
// dan galat jaringan memakai pesan luring yang sama dengan pita di atas layar.
import { toast, type ExternalToast } from "sonner";
import { masukUlang } from "../auth/masukUlang";
import { GraphError, pesanError } from "./graph";

export type NadaUmpanBalik = "info" | "sukses" | "peringatan" | "bahaya";

export interface OpsiUmpanBalik {
  /** Kalimat penjelas di bawah judul. */
  teks?: string;
  aksi?: { label: string; onClick: () => void };
  /** Pakai id yang sama untuk mengganti toast sebelumnya (mis. progres). */
  id?: string | number;
  durasi?: number;
}

function keSonner(o: OpsiUmpanBalik = {}): ExternalToast {
  return { description: o.teks, action: o.aksi, id: o.id, duration: o.durasi };
}

function berhasil(judul: string, o?: OpsiUmpanBalik) {
  return toast.success(judul, keSonner(o));
}

function info(judul: string, o?: OpsiUmpanBalik) {
  return toast.info(judul, keSonner(o));
}

function peringatan(judul: string, o?: OpsiUmpanBalik) {
  return toast.warning(judul, keSonner(o));
}

/** Toast galat dari Error apa pun. Galat sesi diberi tombol Masuk ulang. */
function gagal(err: unknown, judul = "Belum berhasil", o: OpsiUmpanBalik = {}) {
  const sesi = err instanceof GraphError && err.perluLogin;
  return toast.error(judul, {
    ...keSonner(o),
    description: o.teks ?? pesanError(err),
    duration: o.durasi ?? 8000,
    action: sesi ? { label: "Masuk ulang", onClick: () => void masukUlang() } : o.aksi,
  });
}

/** Toast menurut nada kabar (dipakai lonceng dan pemantauan). */
function nada(n: NadaUmpanBalik, judul: string, o?: OpsiUmpanBalik) {
  if (n === "sukses") return berhasil(judul, o);
  if (n === "peringatan") return peringatan(judul, o);
  if (n === "bahaya") return toast.error(judul, keSonner(o));
  return info(judul, o);
}

/**
 * Tampilkan "sedang…" selama janji berjalan, lalu ganti dengan sukses atau galat di toast yang sama.
 * Galat tetap dilempar ulang supaya pemanggil bisa menjaga isian.
 */
async function proses<T>(janji: Promise<T>, teks: { memuat: string; berhasil: string | ((hasil: T) => string); gagal?: string }): Promise<T> {
  const id = toast.loading(teks.memuat);
  try {
    const hasil = await janji;
    toast.success(typeof teks.berhasil === "function" ? teks.berhasil(hasil) : teks.berhasil, { id });
    return hasil;
  } catch (err) {
    gagal(err, teks.gagal ?? "Belum berhasil", { id });
    throw err;
  }
}

export const umpanBalik = { berhasil, info, peringatan, gagal, nada, proses };
