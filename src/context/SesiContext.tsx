// Menentukan siapa pengguna yang login di aplikasi ini: akun Microsoft dari MSAL, dicocokkan dengan
// list "Pengguna Kontrak" untuk peran dan divisinya. Semua akun kantor boleh masuk; yang tidak terdaftar
// otomatis menjadi Pengaju tanpa divisi. Aturan lengkapnya di lib/akses.ts.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useMsal } from "@azure/msal-react";
import { ADMIN_BAWAAN, DOMAIN_KANTOR } from "../config";
import { useMuat } from "../hooks/useMuat";
import { ambilSemuaPengguna } from "../services/pengguna";
import { adalahEmailKantor, tentukanAkses, type AlasanTanpaAkses } from "../lib/akses";
import { GraphError } from "../lib/graph";
import type { Pengguna, Sesi } from "../lib/types";

interface NilaiSesi {
  sesi: Sesi;
  pengguna: Pengguna[];
  muatUlangPengguna: () => Promise<void>;
  keluar: () => void;
}

const SesiContext = createContext<NilaiSesi | null>(null);

export function useSesi(): NilaiSesi {
  const nilai = useContext(SesiContext);
  if (!nilai) throw new Error("useSesi dipakai di luar SesiProvider");
  return nilai;
}

export type HasilSesi =
  | { keadaan: "memuat" }
  | { keadaan: "gagal"; error: unknown; ulangi: () => void }
  | { keadaan: "tanpa-akses"; email: string; nama: string; alasan: AlasanTanpaAkses; ulangi?: () => void }
  | { keadaan: "siap"; nilai: NilaiSesi };

export function useMuatSesi(): HasilSesi {
  const { instance, accounts } = useMsal();
  const akun = instance.getActiveAccount() ?? accounts[0];
  const email = String(akun?.idTokenClaims?.preferred_username ?? akun?.username ?? "").toLowerCase();
  const nama = akun?.name ?? email;

  const { data: pengguna, error, loading, muatUlang } = useMuat(ambilSemuaPengguna, []);

  return useMemo<HasilSesi>(() => {
    if (loading && !pengguna) return { keadaan: "memuat" };
    const ulangi = () => void muatUlang();
    if (error || !pengguna) {
      // 403: SharePoint menolak akun ini (belum punya akses ke situs Kontrak WKI). Bukan galat teknis
      // bagi pengguna; jelaskan bahwa Admin perlu memberi akses situs.
      if (error instanceof GraphError && error.status === 403) {
        const alasan: AlasanTanpaAkses = adalahEmailKantor(email, DOMAIN_KANTOR) || ADMIN_BAWAAN.includes(email) ? "tanpa-situs" : "di-luar-domain";
        return { keadaan: "tanpa-akses", email, nama, alasan, ulangi };
      }
      return { keadaan: "gagal", error, ulangi };
    }

    const hasil = tentukanAkses({ email, nama, pengguna, adminBawaan: ADMIN_BAWAAN, domain: DOMAIN_KANTOR });
    if (!hasil.boleh) return { keadaan: "tanpa-akses", email, nama, alasan: hasil.alasan };
    const keluar = () => void instance.logoutRedirect({ account: akun, postLogoutRedirectUri: window.location.origin });
    return { keadaan: "siap", nilai: { sesi: hasil.sesi, pengguna, muatUlangPengguna: muatUlang, keluar } };
  }, [loading, error, pengguna, email, nama, instance, akun, muatUlang]);
}

export function SesiProvider({ nilai, children }: { nilai: NilaiSesi; children: ReactNode }) {
  return <SesiContext.Provider value={nilai}>{children}</SesiContext.Provider>;
}
