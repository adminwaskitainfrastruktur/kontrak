// Kanvas tanda tangan: dicoret dengan tetikus, jari, atau stylus. Goresan disimpan sebagai titik (bukan hanya
// piksel), jadi saat ukuran layar berubah (ponsel diputar, jendela diperkecil) tanda tangan digambar ulang utuh.
// Latar kertas selalu terang agar tinta tetap terlihat di tema gelap. Metode lewat ref: kosong(), hapus(), png().
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { kanvasKePng } from "../lib/gambarTtd";
import { Tombol } from "./ui";

const TINTA = "#0b1f5c";
const TEBAL = 2.4;

interface Titik {
  x: number;
  y: number;
  p: number;
}

export interface PadTandaTanganRef {
  kosong: () => boolean;
  hapus: () => void;
  png: () => Promise<Uint8Array | null>;
}

// Resolusi kanvas minimal 2x ukuran tampil: TTD ini dicetak, dan layar 1x menghasilkan PNG pecah di kertas.
const skala = () => Math.max(2, window.devicePixelRatio || 1);

const PadTandaTangan = forwardRef<PadTandaTanganRef, { tinggi?: number; onUbah?: (ada: boolean) => void; disabled?: boolean }>(function PadTandaTangan({ tinggi = 190, onUbah, disabled = false }, ref) {
  const wadah = useRef<HTMLDivElement>(null);
  const kanvas = useRef<HTMLCanvasElement>(null);
  const goresan = useRef<Titik[][]>([]);
  const aktif = useRef<Titik[] | null>(null);
  const [kosong, setKosong] = useState(true);

  const gambarUlang = useCallback(() => {
    const k = kanvas.current;
    const ctx = k?.getContext("2d");
    if (!k || !ctx) return;
    const dpr = skala();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, k.width, k.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = TINTA;
    ctx.fillStyle = TINTA;
    for (const g of goresan.current) {
      if (g.length === 1) {
        ctx.beginPath();
        ctx.arc(g[0]!.x, g[0]!.y, TEBAL * 0.6, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      for (let i = 1; i < g.length; i++) {
        const a = g[i - 1]!;
        const b = g[i]!;
        const c = g[i + 1];
        ctx.lineWidth = TEBAL * (0.7 + 0.6 * b.p);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        if (c) ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
        else ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }, []);

  const ukurUlang = useCallback(() => {
    const k = kanvas.current;
    const w = wadah.current;
    if (!k || !w) return;
    const dpr = skala();
    const lebar = w.clientWidth;
    k.style.width = `${lebar}px`;
    k.style.height = `${tinggi}px`;
    k.width = Math.round(lebar * dpr);
    k.height = Math.round(tinggi * dpr);
    gambarUlang();
  }, [tinggi, gambarUlang]);

  useEffect(() => {
    ukurUlang();
    const ro = new ResizeObserver(ukurUlang);
    if (wadah.current) ro.observe(wadah.current);
    return () => ro.disconnect();
  }, [ukurUlang]);

  const titik = (e: React.PointerEvent): Titik => {
    const r = kanvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure && e.pointerType !== "mouse" ? e.pressure : 0.5 };
  };

  const sinkron = () => {
    const k = goresan.current.length === 0;
    setKosong(k);
    onUbah?.(!k);
  };

  const mulai = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    kanvas.current?.setPointerCapture?.(e.pointerId);
    aktif.current = [titik(e)];
    goresan.current.push(aktif.current);
    gambarUlang();
  };
  const gerak = (e: React.PointerEvent) => {
    if (!aktif.current) return;
    e.preventDefault();
    aktif.current.push(titik(e));
    gambarUlang();
  };
  const selesai = () => {
    if (!aktif.current) return;
    aktif.current = null;
    sinkron();
  };

  const hapus = useCallback(() => {
    goresan.current = [];
    gambarUlang();
    setKosong(true);
    onUbah?.(false);
  }, [gambarUlang, onUbah]);

  const urungkan = () => {
    goresan.current.pop();
    gambarUlang();
    sinkron();
  };

  useImperativeHandle(ref, () => ({ kosong: () => goresan.current.length === 0, hapus, png: () => (kanvas.current ? kanvasKePng(kanvas.current) : Promise.resolve(null)) }), [hapus]);

  return (
    <div>
      <div ref={wadah} className={`relative overflow-hidden rounded-xl border-2 border-dashed border-line bg-white ${disabled ? "opacity-60" : ""}`}>
        {/* touch-action:none wajib: tanpa itu jari menggulir halaman dan membatalkan coretan di ponsel. */}
        <canvas
          ref={kanvas}
          className="block cursor-crosshair"
          style={{ touchAction: "none" }}
          role="img"
          aria-label="Area tanda tangan. Coret dengan tetikus, jari, atau stylus."
          onPointerDown={mulai}
          onPointerMove={gerak}
          onPointerUp={selesai}
          onPointerCancel={selesai}
          onPointerLeave={selesai}
        />
        {kosong && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-semibold text-slate-400" aria-hidden="true">
            Tanda tangan di sini
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-slate-300" aria-hidden="true" />
      </div>
      <div className="mt-2 flex gap-2">
        <Tombol type="button" varian="kedua" kecil ikon={<Undo2 className="h-3.5 w-3.5" />} onClick={urungkan} disabled={kosong || disabled}>
          Urungkan
        </Tombol>
        <Tombol type="button" varian="kedua" kecil ikon={<Eraser className="h-3.5 w-3.5" />} onClick={hapus} disabled={kosong || disabled}>
          Hapus
        </Tombol>
      </div>
    </div>
  );
});

export default PadTandaTangan;
