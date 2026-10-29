// Semua alamat SharePoint di satu tempat. ID list diambil dari site
// https://waskitainfra.sharepoint.com/sites/KontrakWKI saat list dibuat
// (30 Sep 2026). Kalau list dibuat ulang, ID-nya berubah dan harus diganti di sini.

export const SITE_URL = "https://waskitainfra.sharepoint.com/sites/KontrakWKI";

// Format ID site Graph: <hostname>,<site collection id>,<web id>
export const GRAPH_SITE_ID =
  "waskitainfra.sharepoint.com,338443f1-c678-45c4-8ad1-45b61ed1babb,74ddd2a1-7fbc-46ae-8fa3-9833cbd1dcb4";

export const LIST_ID = {
  kontrak: "0288609d-15ba-4e92-8afb-a2e4d491dc3a",
  aktivitas: "47b3dcbf-ff54-45ca-b05d-18d922ca2e24",
  pengguna: "8ddfa9ba-0fa4-407a-8017-78d4c41c1fdb",
  // Library dokumen (bukan list biasa): satu folder per nomor pengajuan.
  berkas: "06b57677-7d1f-4b01-aa0d-63978f03026e",
  // Kotak keluar email: aplikasi menulis, Power Automate mengirim lewat Outlook.
  notifikasi: "989a651f-10b2-4922-9297-ca56f736579f",
  mitra: "d0a7337b-a2bd-4435-b935-1f966853d0cc",
  jaminan: "8b435619-72ca-4c7d-a470-99e77d90f89f",
  pengaturan: "2b89317d-807b-4b1c-96e5-52640a58708e",
  kewajiban: "61677c2e-cac1-48ed-a7f9-eb41b4f09d9e",
  kasus: "8c7ddfbe-b689-4d9a-8482-7221775e74ba",
  masukan: "06d4f825-7f1e-4b37-8dd5-64d69a46c4ee",
  logAdmin: "99e279a4-80b7-423d-ade5-0ccc4effe6fa",
  // Kontrak yang notifikasinya dibisukan per pengguna (Title = email, KontrakId).
  senyap: "8ae91f01-f7a1-48f3-9a52-656949536b65",
  // Permintaan tanda tangan digital: satu baris per permintaan, isinya JSON (kolom Isi).
  tandaTangan: "dcdc1150-0e8a-4868-a5d2-d031209e152f",
} as const;

/** Alamat publik aplikasi, dipakai untuk tautan di dalam email. */
export const URL_APLIKASI = "https://wicon.waskitainfrastruktur.co.id";

// URL library "Berkas Kontrak". Dokumen tiap kontrak ada di folder <Nomor Pengajuan>.
export const URL_LIBRARY_BERKAS = `${SITE_URL}/BerkasKontrak`;

export const DOMAIN_KANTOR = "waskitainfrastruktur.co.id";

// Zona waktu site SharePoint (Regional Settings: UTC+07:00 Jakarta). Kolom
// tanggal SharePoint disimpan sebagai tengah malam di zona ini.
export const ZONA_WAKTU = "Asia/Jakarta";

// Kontrak aktif yang berakhir dalam jangka ini ditandai "akan berakhir".
export const HARI_PERINGATAN = 90;

export const ADMIN_BAWAAN = (import.meta.env.VITE_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
