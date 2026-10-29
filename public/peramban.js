// Cadangan di luar React: pesan ramah bila aplikasi tidak muncul.
// Dua keadaan:
//   1. Peramban tidak mendukung modul JavaScript (sangat lama): pesan tampil seketika, karena aplikasi pasti tidak bisa dimuat.
//   2. Aplikasi belum tampil setelah 12 detik (koneksi lambat atau kode tidak bisa dijalankan): pesan tampil,
//      lalu hilang sendiri begitu aplikasi muncul.
// Ditulis dengan sintaks lama (ES5) supaya bisa jalan di peramban yang tidak mengerti kode aplikasi.
// Berkas terpisah (bukan inline di index.html) agar Content-Security-Policy bisa memakai script-src 'self'.
// Peringatan "terlalu lama" yang tidak memblokir untuk peramban yang masih bisa memuat aplikasi ada di
// src/components/PeringatanPeramban.tsx.
(function () {
  var JEDA_MS = 12000;
  var kotak = null;

  function kosong() {
    var root = document.getElementById("root");
    return !root || !root.firstChild;
  }

  function buat(teks, judul, tombol) {
    var d = document.createElement("div");
    d.setAttribute("role", "alert");
    d.style.cssText = "box-sizing:border-box;max-width:28rem;margin:16px auto;padding:20px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#0c1b2b;font:15px/1.55 system-ui,'Segoe UI',sans-serif;box-shadow:0 4px 16px rgba(12,27,43,.12)";
    var h = document.createElement("p");
    h.style.cssText = "margin:0 0 6px;font-size:17px;font-weight:700";
    h.appendChild(document.createTextNode(judul));
    var p = document.createElement("p");
    p.style.cssText = "margin:0;color:#56687a";
    p.appendChild(document.createTextNode(teks));
    d.appendChild(h);
    d.appendChild(p);
    if (tombol) {
      var b = document.createElement("button");
      b.type = "button";
      b.style.cssText = "margin-top:14px;min-height:44px;padding:0 18px;border:0;border-radius:12px;background:#0a7f79;color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer";
      b.appendChild(document.createTextNode("Muat ulang halaman"));
      b.onclick = function () {
        window.location.reload();
      };
      d.appendChild(b);
    }
    return d;
  }

  function tampilkan(lama) {
    if (kotak || !document.body) return;
    kotak = buat(
      lama
        ? "Peramban Anda terlalu lama untuk membuka WiCon. Perbarui Chrome, Edge, Firefox, atau Safari ke versi terbaru, lalu buka lagi halaman ini."
        : "Bila layar ini tetap kosong, koneksi Anda mungkin lambat atau peramban Anda terlalu lama. Coba muat ulang; bila masih sama, perbarui Chrome, Edge, Firefox, atau Safari ke versi terbaru.",
      lama ? "Peramban Anda terlalu lama" : "WiCon belum tampil",
      true,
    );
    document.body.insertBefore(kotak, document.body.firstChild);
  }

  function lepas() {
    if (kotak && kotak.parentNode) kotak.parentNode.removeChild(kotak);
    kotak = null;
  }

  // Keadaan 1: tanpa dukungan modul.
  if (!("noModule" in document.createElement("script"))) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { tampilkan(true); });
    else tampilkan(true);
    return;
  }

  // Jendela popup login Microsoft (dan iframe SSO) sengaja tidak memuat aplikasi, jadi tidak diberi pesan.
  var hash = window.location.hash || "";
  if (window.opener || /[#&](code|error|state)=/.test(hash)) return;

  // Keadaan 2: aplikasi tidak muncul tepat waktu. Diperiksa tiap detik supaya pesan hilang sendiri begitu aplikasi tampil.
  var mulai = new Date().getTime();
  var pengatur = setInterval(function () {
    if (!kosong()) {
      lepas();
      clearInterval(pengatur);
    } else if (new Date().getTime() - mulai >= JEDA_MS) {
      tampilkan(false);
    }
  }, 1000);
})();
