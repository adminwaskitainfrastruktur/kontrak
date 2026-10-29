import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useSesi } from "../context/SesiContext";
import { tambahPengguna, ubahPengguna, type PenggunaInput } from "../services/pengguna";
import { catatLogAdmin } from "../services/pengaturan";
import { pesanError } from "../lib/graph";
import { bedaPengguna, VERSI_DETAIL } from "../lib/jejakAudit";
import { umpanBalik } from "../lib/umpanBalik";
import { DOMAIN_KANTOR, SITE_URL } from "../config";
import { DAFTAR_DIVISI, DAFTAR_PERAN, KETERANGAN_PERAN, type Pengguna, type Sesi } from "../lib/types";
import { motion } from "framer-motion";
import { EASE_KELUAR } from "../lib/gerak";
import { AksiModal, Avatar, Isian, KepalaHalaman, Kosong, Lencana, Modal, Tombol } from "../components/ui";
import WadahGulir from "../components/WadahGulir";

/** Nama aksi Log Admin untuk satu perubahan pengguna (U31). */
function aksiLogPengguna(lama: Pengguna | null, baru: PenggunaInput): string {
  if (!lama) return "Tambah pengguna";
  if (lama.aktif && !baru.aktif) return "Nonaktifkan pengguna";
  if (!lama.aktif && baru.aktif) return "Aktifkan pengguna";
  if (lama.peran !== baru.peran) return "Ubah peran pengguna";
  return "Ubah pengguna";
}

/**
 * Jejak perubahan pengguna di Log Admin: lama-ke-baru per kolom, pelaku diambil SharePoint dari createdBy.
 * Gagal mencatat tidak membatalkan perubahan, tetapi Admin diberi tahu.
 */
async function catatPerubahanPengguna(lama: Pengguna | null, baru: PenggunaInput, sesi: Sesi): Promise<void> {
  const ubah = bedaPengguna(lama, baru);
  if (ubah.length === 0) return;
  await catatLogAdmin({ aksi: aksiLogPengguna(lama, baru), sasaran: baru.email, detail: { v: VERSI_DETAIL, ubah } }, sesi).catch(() =>
    umpanBalik.peringatan("Perubahan tersimpan, tetapi jejaknya belum tercatat di Log Admin."),
  );
}

export default function KelolaPengguna() {
  const { sesi, pengguna, muatUlangPengguna } = useSesi();
  const [dipilih, setDipilih] = useState<Pengguna | "baru" | null>(null);

  return (
    <>
      <KepalaHalaman
        judul="Pengguna"
        sub="Peran dan divisi khusus, serta akun yang dinonaktifkan."
        aksi={
          <Tombol ikon={<UserPlus className="h-4 w-4" />} onClick={() => setDipilih("baru")}>
            Tambah Pengguna
          </Tombol>
        }
      />

      <div className="mb-4 space-y-1.5 rounded-xl border border-info-soft bg-info-soft px-4 py-3 text-sm text-info">
        <p>
          Semua akun <strong>@{DOMAIN_KANTOR}</strong> otomatis bisa masuk sebagai <strong>Pengaju</strong>: hanya melihat dan mengubah pengajuannya sendiri, dan memilih divisi
          setiap kali mengajukan.
        </p>
        <p>
          Daftarkan di sini hanya <strong>Admin</strong>, <strong>Legal</strong>, <strong>Pemantau</strong>, Pengaju yang perlu melihat semua kontrak divisinya, atau akun yang ingin
          dinonaktifkan (ubah lalu matikan Aktif).
        </p>
        <p>
          Semua pengguna tetap harus menjadi anggota (Member) site SharePoint{" "}
          <a href={SITE_URL} target="_blank" rel="noreferrer" className="font-semibold underline">
            WiCon
          </a>{" "}
          supaya bisa membaca dan menyimpan data.
        </p>
      </div>

      {/* Ponsel: kartu per pengguna. */}
      <div className="space-y-3 md:hidden">
        {pengguna.length === 0 && (
          <div className="kartu">
            <Kosong judul="Belum ada pengguna terdaftar" teks="Akun kantor tetap bisa masuk sebagai Pengaju. Tambahkan tim Legal, Admin, dan Pemantau lewat tombol Tambah Pengguna." />
          </div>
        )}
        {pengguna.map((p) => (
          <div key={p.id} className="kartu flex items-center gap-3 p-4">
            <Avatar nama={p.nama} ukuran={44} />
            <div className="min-w-0 flex-1">
              <p className="teks-panjang font-semibold">{p.nama}</p>
              <p className="break-all text-xs text-muted">{p.email}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Lencana nada={p.peran === "Admin" ? "bahaya" : p.peran === "Legal" ? "sukses" : p.peran === "Pemantau" ? "netral" : "peringatan"}>{p.peran}</Lencana>
                <span className="text-xs text-muted">{p.divisi}</span>
                {!p.aktif && <Lencana>Nonaktif</Lencana>}
              </p>
            </div>
            <Tombol kecil varian="kedua" className="min-h-11 shrink-0" onClick={() => setDipilih(p)} aria-label={`Ubah ${p.nama}`}>
              Ubah
            </Tombol>
          </div>
        ))}
      </div>

      <WadahGulir className="hidden md:block">
        {pengguna.length === 0 ? (
          <Kosong judul="Belum ada pengguna terdaftar" teks="Akun kantor tetap bisa masuk sebagai Pengaju. Tambahkan tim Legal, Admin, dan Pemantau di sini." />
        ) : (
          <table className="tabel w-full min-w-[640px]">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Divisi</th>
                <th>Peran</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pengguna.map((p, i) => (
                <motion.tr key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03, duration: 0.3, ease: EASE_KELUAR }} className="transition-colors hover:bg-raised">
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar nama={p.nama} ukuran={38} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold" title={p.nama}>
                          {p.nama}
                        </p>
                        <p className="truncate text-xs text-muted" title={p.email}>
                          {p.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>{p.divisi}</td>
                  <td>
                    <Lencana nada={p.peran === "Admin" ? "bahaya" : p.peran === "Legal" ? "sukses" : p.peran === "Pemantau" ? "netral" : "peringatan"}>{p.peran}</Lencana>
                    <p className="mt-1 text-xs text-muted">{KETERANGAN_PERAN[p.peran]}</p>
                  </td>
                  <td>{p.aktif ? <Lencana nada="sukses">Aktif</Lencana> : <Lencana>Nonaktif</Lencana>}</td>
                  <td className="text-right">
                    <Tombol kecil varian="kedua" onClick={() => setDipilih(p)} aria-label={`Ubah ${p.nama}`}>
                      Ubah
                    </Tombol>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </WadahGulir>

      {dipilih && (
        <FormPengguna
          awal={dipilih === "baru" ? null : dipilih}
          diriSendiri={dipilih !== "baru" && dipilih.email === sesi.email}
          emailTerpakai={pengguna.filter((p) => dipilih === "baru" || p.id !== dipilih.id).map((p) => p.email)}
          onTutup={() => setDipilih(null)}
          onSimpan={async () => {
            setDipilih(null);
            await muatUlangPengguna();
          }}
        />
      )}
    </>
  );
}

function FormPengguna({
  awal,
  diriSendiri,
  emailTerpakai,
  onTutup,
  onSimpan,
}: {
  awal: Pengguna | null;
  diriSendiri: boolean;
  emailTerpakai: string[];
  onTutup: () => void;
  onSimpan: () => Promise<void>;
}) {
  const { sesi } = useSesi();
  const [form, setForm] = useState<PenggunaInput>(awal ?? { nama: "", email: "", divisi: "SCM", peran: "Pengaju", aktif: true });
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState("");

  const simpan = async () => {
    setGalat("");
    const email = form.email.trim().toLowerCase();
    if (!form.nama.trim()) return setGalat("Nama wajib diisi.");
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return setGalat("Email tidak valid.");
    if (!email.endsWith(`@${DOMAIN_KANTOR}`)) return setGalat(`Gunakan email kantor @${DOMAIN_KANTOR}.`);
    if (emailTerpakai.includes(email)) return setGalat("Email ini sudah terdaftar.");
    if (diriSendiri && (form.peran !== "Admin" || !form.aktif)) return setGalat("Anda tidak bisa mencabut akses Admin milik sendiri.");

    setMenyimpan(true);
    const baru: PenggunaInput = { ...form, nama: form.nama.trim(), email };
    try {
      if (awal) await ubahPengguna(awal.id, baru);
      else await tambahPengguna(baru);
    } catch (err) {
      setGalat(pesanError(err));
      setMenyimpan(false);
      return;
    }
    await catatPerubahanPengguna(awal, baru, sesi);
    umpanBalik.berhasil(awal ? `Data ${baru.nama} tersimpan.` : `${baru.nama} ditambahkan.`);
    await onSimpan();
  };

  return (
    <Modal judul={awal ? "Ubah Pengguna" : "Tambah Pengguna"} onTutup={onTutup}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!menyimpan) void simpan();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Isian label="Nama" wajib className="sm:col-span-2">
            <input className="input" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} autoComplete="off" autoFocus />
          </Isian>
          <Isian label="Email kantor" wajib className="sm:col-span-2">
            <input className="input" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={`nama@${DOMAIN_KANTOR}`} />
          </Isian>
          <Isian label="Divisi">
            <select className="input" value={form.divisi} onChange={(e) => setForm({ ...form, divisi: e.target.value as PenggunaInput["divisi"] })}>
              {DAFTAR_DIVISI.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Isian>
          <Isian label="Peran" bantuan={KETERANGAN_PERAN[form.peran]}>
            <select className="input" value={form.peran} onChange={(e) => setForm({ ...form, peran: e.target.value as PenggunaInput["peran"] })}>
              {DAFTAR_PERAN.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Isian>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--wh-brand)]" checked={form.aktif} onChange={(e) => setForm({ ...form, aktif: e.target.checked })} />
            Aktif (boleh masuk ke aplikasi)
          </label>
        </div>
        <p className="mt-3 text-xs text-muted">Perubahan dicatat di Log Admin (siapa, kapan, dari apa ke apa) dan terlihat di halaman Jejak Audit.</p>
        {galat && (
          <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {galat}
          </p>
        )}
        <AksiModal>
          <Tombol type="button" varian="kedua" onClick={onTutup} disabled={menyimpan}>
            Batal
          </Tombol>
          <Tombol type="submit" memuat={menyimpan}>
            Simpan
          </Tombol>
        </AksiModal>
      </form>
    </Modal>
  );
}
