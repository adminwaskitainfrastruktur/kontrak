// Terapkan tema sebelum React dimuat supaya halaman tidak berkedip.
// Mode terang adalah tema utama: mode gelap hanya aktif bila pengguna memilihnya sendiri.
// Berkas terpisah (bukan inline di index.html) agar Content-Security-Policy bisa memakai script-src 'self'.
try {
  if (localStorage.getItem("kontrak-tema") === "gelap") {
    document.documentElement.classList.add("dark");
  }
} catch (e) {}

// Warna bilah alamat peramban seluler (theme-color) dan skema warna bawaan peramban (bilah gulir, isian formulir)
// mengikuti tema aplikasi, termasuk saat pengguna menggantinya lewat tombol tema.
(function () {
  var html = document.documentElement;
  function sinkron() {
    var gelap = html.classList.contains("dark");
    var warna = document.querySelector('meta[name="theme-color"]');
    if (warna) warna.setAttribute("content", gelap ? "#07121b" : "#f2f5f9");
    var skema = document.querySelector('meta[name="color-scheme"]');
    if (skema) skema.setAttribute("content", gelap ? "dark" : "light");
  }
  sinkron();
  if (typeof MutationObserver === "function") {
    new MutationObserver(sinkron).observe(html, { attributes: true, attributeFilter: ["class"] });
  }
})();
