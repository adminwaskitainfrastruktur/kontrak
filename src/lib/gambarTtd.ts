// Pengolahan gambar tanda tangan di peramban (canvas): potong ke kotak coretan dan buang latar putih.
// Hasilnya PNG transparan yang siap ditempel di Halaman Pengesahan. Tanpa layanan pihak ketiga.

const MARGIN_BAWAAN = 12;
/** Batas gambar yang diunggah; foto ponsel bisa belasan MB. */
export const BATAS_BERKAS_GAMBAR = 12 * 1024 * 1024;
const LEBAR_MAKS = 1200;

/** Potong kanvas ke kotak yang berisi goresan (+ margin) dan kembalikan PNG, atau null bila kosong. */
export function kanvasKePng(kanvas: HTMLCanvasElement, margin = MARGIN_BAWAAN): Promise<Uint8Array | null> {
  const ctx = kanvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  const { width: w, height: h } = kanvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return Promise.resolve(null);
  x0 = Math.max(0, x0 - margin);
  y0 = Math.max(0, y0 - margin);
  x1 = Math.min(w - 1, x1 + margin);
  y1 = Math.min(h - 1, y1 + margin);
  const hasil = document.createElement("canvas");
  hasil.width = x1 - x0 + 1;
  hasil.height = y1 - y0 + 1;
  hasil.getContext("2d")!.drawImage(kanvas, x0, y0, hasil.width, hasil.height, 0, 0, hasil.width, hasil.height);
  return new Promise((ok) => hasil.toBlob(async (b) => ok(b ? new Uint8Array(await b.arrayBuffer()) : null), "image/png"));
}

/**
 * Gambar tanda tangan yang diunggah (PNG/JPG, termasuk foto kertas) menjadi PNG berlatar transparan dan terpotong
 * rapi. Piksel yang hampir putih dibuang supaya tanda tangan tidak menempel sebagai kotak putih.
 */
export async function rapikanGambarTtd(berkas: Blob): Promise<Uint8Array | null> {
  if (berkas.size > BATAS_BERKAS_GAMBAR) throw new Error("Gambar terlalu besar (maksimal 12 MB). Pakai foto yang lebih kecil.");
  const url = URL.createObjectURL(berkas);
  try {
    const img = await new Promise<HTMLImageElement>((ok, gagal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => gagal(new Error("Berkas bukan gambar yang bisa dibaca. Pakai PNG atau JPG."));
      i.src = url;
    });
    const skala = Math.min(1, LEBAR_MAKS / img.naturalWidth);
    const k = document.createElement("canvas");
    k.width = Math.max(1, Math.round(img.naturalWidth * skala));
    k.height = Math.max(1, Math.round(img.naturalHeight * skala));
    const ctx = k.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, k.width, k.height);
    const d = ctx.getImageData(0, 0, k.width, k.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const terang = (d.data[i]! + d.data[i + 1]! + d.data[i + 2]!) / 3;
      if (terang > 225) d.data[i + 3] = 0;
      else if (terang > 190) d.data[i + 3] = Math.min(d.data[i + 3]!, Math.round((225 - terang) * 7));
    }
    ctx.putImageData(d, 0, 0);
    return await kanvasKePng(k, 6);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Object URL untuk menampilkan byte PNG; panggil URL.revokeObjectURL saat tidak dipakai. */
export const urlDariPng = (png: Uint8Array): string => URL.createObjectURL(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }));
