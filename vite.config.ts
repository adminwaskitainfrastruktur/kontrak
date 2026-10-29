import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Header untuk `vite preview` diambil dari public/.htaccess (sumber tunggal), supaya CSP produksi
// bisa diuji di lokal sebelum diunggah. Apache tidak dipakai saat preview, hanya isi headernya.
function headerDariHtaccess(): Record<string, string> {
  try {
    const isi = readFileSync("public/.htaccess", "utf-8");
    const header: Record<string, string> = {};
    for (const m of isi.matchAll(/^\s*Header always set ([\w-]+) "(.*)"\s*$/gm)) header[m[1]!] = m[2]!;
    delete header["Strict-Transport-Security"]; // preview berjalan di http://localhost
    return header;
  } catch {
    return {};
  }
}

// Cloudflare Rocket Loader (bila aktif di domain) menulis ulang tipe semua <script> dan menunda eksekusinya. Pada
// aplikasi modul React, itu membuat tema berkedip, pemeriksa peramban terlambat, dan pemuatan di ponsel tersendat.
// data-cfasync="false" membuat Rocket Loader melewati tag ini, apa pun pengaturan di dasbor Cloudflare.
function lewatiRocketLoader(): Plugin {
  return {
    name: "lewati-rocket-loader",
    enforce: "post",
    transformIndexHtml: (html) => html.replace(/<script(?![^>]*data-cfasync)/g, '<script data-cfasync="false"'),
  };
}

// Port 8080 dipatok (strictPort) karena harus sama persis dengan Redirect URI
// yang terdaftar di app registration Azure. Kalau port ini terpakai, Vite
// berhenti dengan pesan jelas alih-alih pindah diam-diam ke port lain lalu
// login gagal dengan AADSTS50011.
export default defineConfig({
  plugins: [react(), lewatiRocketLoader()],
  build: {
    rollupOptions: {
      // Dua halaman: aplikasi utama dan jendela login untuk Microsoft Teams (teams-auth.html, lihat teams/README.md).
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        teamsAuth: fileURLToPath(new URL("./teams-auth.html", import.meta.url)),
      },
      output: {
        // Pustaka besar dipisah supaya cache peramban tidak ikut hangus tiap kode aplikasi berubah.
        // recharts (beserta d3) hanya dipakai komponen grafik yang dimuat malas (GrafikDashboard, GrafikLaporan),
        // jadi chunk "grafik" baru diunduh setelah KPI tampil, bukan bersama halaman.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          msal: ["@azure/msal-browser", "@azure/msal-react"],
          motion: ["framer-motion"],
          grafik: ["recharts"],
        },
      },
    },
  },
  server: { port: 8080, strictPort: true, host: "localhost" },
  preview: { port: 8080, strictPort: true, host: "localhost", headers: headerDariHtaccess() },
});
