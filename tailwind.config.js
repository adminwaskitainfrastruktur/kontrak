// Warna Tailwind dipetakan ke token Waskita Horizon (src/styles.css), sama
// dengan aplikasi IT Asset Management, supaya dua aplikasi internal ini
// terasa satu keluarga. Mode gelap memakai kelas `.dark` pada <html>.
const v = (name) => `var(--wh-${name})`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  // Gaya hover: hanya di perangkat yang punya tetikus. Di layar sentuh, hover tidak "menempel" setelah ditekan
  // (kartu terangkat, tombol berubah warna) dan tidak ada aksi yang hanya muncul lewat hover.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      // Monitor besar dan ultra-wide: untuk menambah kolom grid atau melebarkan wadah (md/lg/xl/2xl bawaan Tailwind).
      screens: { "3xl": "1920px", "4xl": "2560px" },
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        raised: v("surface-raised"),
        line: v("line"),
        ink: v("ink"),
        muted: v("ink-muted"),
        brand: { DEFAULT: v("brand"), strong: v("brand-strong"), soft: v("brand-soft"), on: v("on-brand") },
        accent: { DEFAULT: v("accent"), soft: v("accent-soft"), ink: v("accent-ink"), on: v("on-accent") },
        info: { DEFAULT: v("info"), soft: v("info-soft") },
        success: { DEFAULT: v("success"), soft: v("success-soft") },
        // `strong` dan `on`: latar tombol bahaya dan tulisannya (di mode gelap `danger` terlalu terang untuk teks putih).
        danger: { DEFAULT: v("danger"), soft: v("danger-soft"), strong: v("danger-strong"), on: v("on-danger") },
        // Abu pekat status akhir (Berakhir/Dibatalkan); `2` untuk Dibatalkan di grafik.
        abu: { DEFAULT: v("abu"), 2: v("abu-2"), soft: v("abu-soft"), ink: v("abu-ink") },
        hero: { DEFAULT: v("hero"), on: v("on-hero") },
        navy: { DEFAULT: v("navy"), 2: v("navy-2") },
        sidebar: { DEFAULT: v("sidebar"), ink: v("sidebar-ink"), line: v("sidebar-line") },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "Segoe UI", "sans-serif"],
        display: ["EB Garamond", "Georgia", "serif"],
        geist: ["Geist", "Plus Jakarta Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "Consolas", "monospace"],
      },
      boxShadow: {
        card: v("shadow-card"),
        pop: v("shadow-pop"),
      },
    },
  },
  plugins: [],
};
