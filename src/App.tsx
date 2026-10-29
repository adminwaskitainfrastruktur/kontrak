import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { MsalProvider, useIsAuthenticated, useMsal } from "@azure/msal-react";
import { InteractionStatus, type IPublicClientApplication } from "@azure/msal-browser";
import { SesiProvider, useMuatSesi } from "./context/SesiContext";
import { PengaturanProvider } from "./context/PengaturanContext";
import { DASAR_PENGGUNA, bolehRuangAdmin, bolehRuangPengguna } from "./context/RuangContext";
import { adalahLegal } from "./lib/alur";
import { bolehLihatJejak } from "./lib/jejakAudit";
import Layout from "./components/Layout";
import PeringatanPeramban from "./components/PeringatanPeramban";
import PitaSesi from "./components/PitaSesi";
import { KotakError, Memuat } from "./components/ui";
import Login from "./pages/Login";
import TanpaAkses from "./pages/TanpaAkses";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const DaftarKontrak = lazy(() => import("./pages/DaftarKontrak"));
const FormKontrak = lazy(() => import("./pages/FormKontrak"));
const ChatAjukan = lazy(() => import("./pages/ChatAjukan"));
const DetailKontrak = lazy(() => import("./pages/DetailKontrak"));
const KelolaPengguna = lazy(() => import("./pages/KelolaPengguna"));
const MonitoringSaya = lazy(() => import("./pages/MonitoringSaya"));
const Laporan = lazy(() => import("./pages/Laporan"));
const Jaminan = lazy(() => import("./pages/Jaminan"));
const Arsip = lazy(() => import("./pages/Arsip"));
const TandaTangan = lazy(() => import("./pages/TandaTangan"));
const DetailTandaTangan = lazy(() => import("./pages/DetailTandaTangan"));
const Mitra = lazy(() => import("./pages/Mitra"));
const Notifikasi = lazy(() => import("./pages/Notifikasi"));
const Pengaturan = lazy(() => import("./pages/Pengaturan"));
const JejakAudit = lazy(() => import("./pages/JejakAudit"));

function LayarPenuh({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-layar place-items-center bg-bg p-4 sm:p-6">{children}</div>;
}

function AplikasiMasuk() {
  const hasil = useMuatSesi();

  if (hasil.keadaan === "memuat") {
    return (
      <LayarPenuh>
        <Memuat teks="Menyiapkan akun Anda…" />
      </LayarPenuh>
    );
  }
  if (hasil.keadaan === "gagal") {
    return (
      <LayarPenuh>
        <div className="w-full max-w-md">
          {/* Galat sesi: KotakError menawarkan Masuk ulang sendiri, lalu memuat ulang daftar pengguna lewat `ulangi`. */}
          <KotakError error={hasil.error} ulangi={hasil.ulangi} />
        </div>
      </LayarPenuh>
    );
  }
  if (hasil.keadaan === "tanpa-akses") return <TanpaAkses email={hasil.email} nama={hasil.nama} alasan={hasil.alasan} ulangi={hasil.ulangi} />;

  const { sesi } = hasil.nilai;
  const admin = bolehRuangAdmin(sesi);
  const pengguna = bolehRuangPengguna(sesi);
  const legal = adalahLegal(sesi);

  // Rute Ruang Admin tidak didaftarkan untuk Pengaju, jadi alamatnya tidak bisa dibuka sama sekali.
  // Satu Layout untuk kedua ruang supaya sidebar tidak dimuat ulang saat berpindah ruang.
  return (
    <SesiProvider nilai={hasil.nilai}>
      {/* Pengaturan dimuat setelah login (Graph butuh token) dan tidak menahan tampilan: selama memuat, nilai bawaan dipakai. */}
      <PengaturanProvider>
        <Suspense fallback={<Memuat />}>
          <Routes>
            <Route element={<Layout />}>
              {admin && (
                <>
                  <Route index element={<Dashboard />} />
                  <Route path="kontrak" element={<DaftarKontrak />} />
                  {/* Chat pengajuan: Layout menampilkannya layar penuh di samping sidebar. */}
                  <Route path="kontrak/baru" element={<ChatAjukan />} />
                  <Route path="kontrak/baru/formulir" element={<FormKontrak />} />
                  <Route path="kontrak/:id" element={<DetailKontrak />} />
                  <Route path="kontrak/:id/ubah" element={<FormKontrak />} />
                  <Route path="tanda-tangan" element={<TandaTangan />} />
                  <Route path="tanda-tangan/:kontrakId" element={<DetailTandaTangan />} />
                  {/* Laporan dan Jaminan hanya membaca, jadi Pemantau juga boleh membukanya. */}
                  <Route path="laporan" element={<Laporan />} />
                  <Route path="jaminan" element={<Jaminan />} />
                  <Route path="arsip" element={<Arsip />} />
                  {legal && <Route path="mitra" element={<Mitra />} />}
                  {legal && <Route path="notifikasi" element={<Notifikasi />} />}
                  {sesi.peran === "Admin" && <Route path="pengaturan" element={<Pengaturan />} />}
                  {sesi.peran === "Admin" && <Route path="pengguna" element={<KelolaPengguna />} />}
                  {/* Jejak audit hanya membaca: Admin dan Pemantau. */}
                  {bolehLihatJejak(sesi) && <Route path="jejak-audit" element={<JejakAudit />} />}
                </>
              )}
              {pengguna && (
                <Route path={DASAR_PENGGUNA.slice(1)}>
                  <Route index element={<MonitoringSaya />} />
                  <Route path="ajukan" element={<ChatAjukan />} />
                  <Route path="ajukan/formulir" element={<FormKontrak />} />
                  <Route path="kontrak/:id" element={<DetailKontrak />} />
                  <Route path="kontrak/:id/ubah" element={<FormKontrak />} />
                  <Route path="tanda-tangan" element={<TandaTangan />} />
                  <Route path="tanda-tangan/:kontrakId" element={<DetailTandaTangan />} />
                </Route>
              )}
              {/* Tautan lama ke detail kontrak (#/kontrak/12) tetap bisa dibuka Pengaju, diarahkan ke ruangnya. */}
              {!admin && <Route path="kontrak/:id" element={<AlihkanDetail />} />}
              {/* Tautan di email tanda tangan (#/tanda-tangan/12) juga diarahkan ke ruang Pengaju. */}
              {!admin && <Route path="tanda-tangan" element={<Navigate to={`${DASAR_PENGGUNA}/tanda-tangan`} replace />} />}
              {!admin && <Route path="tanda-tangan/:kontrakId" element={<AlihkanTandaTangan />} />}
              <Route path="*" element={<Navigate to={admin ? "/" : DASAR_PENGGUNA} replace />} />
            </Route>
          </Routes>
        </Suspense>
      </PengaturanProvider>
    </SesiProvider>
  );
}

function AlihkanDetail() {
  const { id } = useParams();
  return <Navigate to={`${DASAR_PENGGUNA}/kontrak/${id}`} replace />;
}

function AlihkanTandaTangan() {
  const { kontrakId } = useParams();
  return <Navigate to={`${DASAR_PENGGUNA}/tanda-tangan/${kontrakId}`} replace />;
}

function Gerbang() {
  const masuk = useIsAuthenticated();
  const { inProgress } = useMsal();
  if (!masuk && inProgress === InteractionStatus.Startup) {
    return (
      <LayarPenuh>
        <Memuat teks="Memeriksa sesi Microsoft…" />
      </LayarPenuh>
    );
  }
  return masuk ? <AplikasiMasuk /> : <Login />;
}

export default function App({ msal }: { msal: IPublicClientApplication }) {
  return (
    <HashRouter>
      <MsalProvider instance={msal}>
        {/* Peringatan peramban terlalu lama (tidak memblokir), serta pita "Sesi berakhir" dan "Luring": berlaku di semua layar. */}
        <PeringatanPeramban />
        <PitaSesi />
        <Gerbang />
      </MsalProvider>
    </HashRouter>
  );
}
