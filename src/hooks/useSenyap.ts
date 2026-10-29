// Daftar kontrak yang dibisukan pengguna ini, dibagi lewat satu penyimpanan di memori supaya tombol di detail,
// lencana di daftar, dan lonceng kabar selalu sepakat. Dimuat sekali per akun, lalu diperbarui saat diubah.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { bisukanKontrak, bunyikanKontrak, ambilSenyapSaya } from "../services/senyap";

interface Keadaan {
  email: string;
  peta: ReadonlyMap<number, string>;
  siap: boolean;
  sibuk: ReadonlySet<number>;
}

const KOSONG: Keadaan = { email: "", peta: new Map(), siap: false, sibuk: new Set() };
let keadaan: Keadaan = KOSONG;
let memuatUntuk = "";
const pendengar = new Set<() => void>();

function ubah(baru: Partial<Keadaan>) {
  keadaan = { ...keadaan, ...baru };
  for (const fn of pendengar) fn();
}

function muat(email: string) {
  if (!email || memuatUntuk === email) return;
  memuatUntuk = email;
  keadaan = { ...KOSONG, email };
  ambilSenyapSaya(email).then(
    (peta) => memuatUntuk === email && ubah({ peta, siap: true }),
    // Gagal dibaca (mis. list belum ada): anggap tidak ada yang dibisukan; dicoba lagi saat akun dibuka ulang.
    () => memuatUntuk === email && ubah({ siap: true }),
  );
}

const langganan = (fn: () => void) => {
  pendengar.add(fn);
  return () => void pendengar.delete(fn);
};
const cuplikan = () => keadaan;

/** ID kontrak yang dibisukan, tanpa memicu pemuatan (untuk kode non-komponen). */
export function idSenyapSaatIni(): ReadonlySet<number> {
  return new Set(keadaan.peta.keys());
}

export function useSenyap(email: string) {
  useEffect(() => muat(email), [email]);
  const k = useSyncExternalStore(langganan, cuplikan);
  const milik = k.email === email;
  const peta = milik ? k.peta : (KOSONG.peta as ReadonlyMap<number, string>);

  const dibisukan = useCallback((kontrakId: number) => peta.has(kontrakId), [peta]);
  const sedangUbah = useCallback((kontrakId: number) => k.sibuk.has(kontrakId), [k.sibuk]);

  /** Balik status senyap satu kontrak. Melempar galat agar pemanggil bisa menampilkannya. */
  const balik = useCallback(
    async (kontrakId: number): Promise<boolean> => {
      if (keadaan.sibuk.has(kontrakId)) return keadaan.peta.has(kontrakId);
      ubah({ sibuk: new Set(keadaan.sibuk).add(kontrakId) });
      try {
        const baru = new Map(keadaan.peta);
        const idBaris = baru.get(kontrakId);
        if (idBaris) {
          await bunyikanKontrak(idBaris);
          baru.delete(kontrakId);
        } else {
          baru.set(kontrakId, await bisukanKontrak(email, kontrakId));
        }
        ubah({ peta: baru });
        return baru.has(kontrakId);
      } finally {
        const lepas = new Set(keadaan.sibuk);
        lepas.delete(kontrakId);
        ubah({ sibuk: lepas });
      }
    },
    [email],
  );

  const ids = useCallback(() => new Set(peta.keys()), [peta]);
  return { dibisukan, sedangUbah, balik, siap: milik && k.siap, ids, peta };
}
