import { useEffect, useRef } from "react";
import { STATE_META } from "../data/states";
import type { Symphony } from "../hooks/useSymphony";

const BARS = 112;

const gauss = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));

/**
 * Real-time spectrum + waveform. Driven by the live AnalyserNode when the
 * engine runs; otherwise renders a simulated spectrum shaped around the
 * active state's frequency — so visual-only mode still breathes.
 */
export function Visualizer({ sym }: { sym: Symphony }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaksRef = useRef(new Float32Array(BARS));
  const { engine, stateId, audioStatus } = sym;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const meta = STATE_META[stateId];
    const peaks = peaksRef.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const freqData = new Uint8Array(1024);
    const timeData = new Uint8Array(1024);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(10, Math.round(r.width * dpr));
      canvas.height = Math.max(10, Math.round(r.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const draw = (tms: number) => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const analyser = engine.analyser;
      const live = analyser !== null && audioStatus === "running";
      if (live && analyser) analyser.getByteFrequencyData(freqData);

      const t = tms / 1000;
      const peakX = (meta.frequency - 380) / (700 - 380);
      const barW = w / BARS;

      // faint grid
      ctx.strokeStyle = "rgba(27,39,64,.5)";
      ctx.lineWidth = 1;
      for (const gy of [0.28, 0.55, 0.82]) {
        ctx.beginPath();
        ctx.moveTo(0, h * gy);
        ctx.lineTo(w, h * gy);
        ctx.stroke();
      }

      // spectrum bars
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, meta.color + "26");
      grad.addColorStop(0.45, meta.color + "cc");
      grad.addColorStop(1, meta.color2);
      ctx.fillStyle = grad;

      for (let i = 0; i < BARS; i++) {
        const x = i / BARS;
        let v: number;
        if (live) {
          const idx = Math.min(freqData.length - 1, Math.floor(Math.pow(x, 1.55) * 520));
          v = freqData[idx] / 255;
        } else {
          const shape =
            gauss(x, peakX, 0.055) * 0.85 +
            gauss(x, peakX * 0.5, 0.09) * 0.4 +
            gauss(x, Math.min(0.97, peakX * 1.5), 0.05) * 0.32 +
            gauss(x, 0.04, 0.05) * 0.3;
          const mod = 0.58 + 0.42 * Math.sin(t * Math.PI * 2 * meta.lfoRate + x * 9 + Math.sin(t * 0.7 + x * 22) * 1.3);
          const jitter = 0.8 + 0.2 * Math.sin(i * 12.9898 + Math.floor(t * 8) * 78.233);
          v = Math.max(0.02, shape * mod * jitter);
        }
        peaks[i] = Math.max(v, peaks[i] * 0.965);

        const bh = Math.min(0.94, v) * h * 0.86;
        const bx = i * barW + barW * 0.18;
        const bw = barW * 0.64;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(bx, h - bh, bw, bh);
        // peak-hold cap
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = meta.color2;
        ctx.fillRect(bx, h - peaks[i] * h * 0.86 - 3, bw, 1.6);
        ctx.fillStyle = grad;
      }
      ctx.globalAlpha = 1;

      // waveform overlay
      ctx.beginPath();
      ctx.strokeStyle = meta.color2;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.3;
      ctx.shadowColor = meta.color2;
      ctx.shadowBlur = 7;
      if (live && analyser) {
        analyser.getByteTimeDomainData(timeData);
        for (let i = 0; i < timeData.length; i += 4) {
          const px = (i / timeData.length) * w;
          const py = h * 0.44 + ((timeData[i] - 128) / 128) * h * 0.3;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      } else {
        for (let px = 0; px <= w; px += 4) {
          const x = px / w;
          const py =
            h * 0.44 +
            Math.sin(x * 22 + t * 2.4) * Math.sin(x * 5 - t * 0.9) * h * 0.1 *
              (0.6 + 0.4 * Math.sin(t * Math.PI * 2 * meta.lfoRate));
          if (px === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [engine, stateId, audioStatus]);

  return (
    <div className="panel relative overflow-hidden">
      <span className="panel-corner top-0 left-0 border-t border-l" />
      <span className="panel-corner top-0 right-0 border-t border-r" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-2">
        <span className="hud-label !text-[9px]">Spectrum Analyzer · FFT-2048</span>
        <span className="chip">
          <span className="led led-pulse" style={{ color: "var(--acc)" }} />
          <span style={{ color: "var(--acc)" }}>{STATE_META[stateId].frequency} Hz</span>
          <span className="opacity-60">{STATE_META[stateId].label}</span>
        </span>
      </div>
      <canvas ref={canvasRef} className="block h-[112px] w-full md:h-[128px]" />
    </div>
  );
}
