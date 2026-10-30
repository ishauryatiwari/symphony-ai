import { useEffect, useRef, useState } from "react";
import { Panel } from "./Panel";
import { STATE_META } from "../data/states";
import type { Symphony } from "../hooks/useSymphony";

const BANDS = ["SUB", "CORE", "5TH", "AIR"] as const;

export function SoundPanel({ sym }: { sym: Symphony }) {
  const { audioStatus, initAudio, togglePlay, volume, setVolume, stateId, output, transitioning, engine } = sym;
  const meta = STATE_META[stateId];
  const [levels, setLevels] = useState<number[]>([0, 0, 0, 0]);
  const levelsRef = useRef(new Float32Array(4));

  /* meter refresh ~12fps */
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 85) return;
      last = t;
      const live = engine.bandLevels(levelsRef.current);
      const arr = Array.from(levelsRef.current);
      if (!live) {
        // visual-only fallback: breathe with the state LFO so meters stay alive
        const tt = t / 1000;
        for (let i = 0; i < 4; i++) {
          arr[i] = audioStatus === "running" ? 0.3 + 0.25 * Math.sin(tt * Math.PI * 2 * meta.lfoRate + i * 1.3) + 0.08 : 0.04;
        }
      }
      setLevels(arr);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, audioStatus, meta.lfoRate]);

  return (
    <Panel
      title="Sound Engine"
      right={
        audioStatus === "running" ? (
          <span className="chip" style={{ color: "#34d399", borderColor: "#34d39950" }}>
            <span className="led led-pulse" /> {output === "core" ? "CORE DRIVING" : "PLAYING"}
          </span>
        ) : audioStatus === "paused" ? (
          <span className="chip" style={{ color: "#fbbf24", borderColor: "#fbbf2450" }}>
            <span className="led" /> HELD
          </span>
        ) : audioStatus === "unavailable" ? (
          <span className="chip" style={{ color: "#fb7185", borderColor: "#fb718550" }}>
            <span className="led" /> VISUAL-ONLY
          </span>
        ) : (
          <span className="chip">
            <span className="led" style={{ color: "#5b6b8c" }} /> STANDBY
          </span>
        )
      }
    >
      {audioStatus === "idle" ? (
        <div className="flex flex-col items-center gap-3 py-3">
          <button
            onClick={() => void initAudio()}
            className="btn-state active flex w-full cursor-pointer items-center justify-center gap-3 px-4 py-4"
            style={{ ["--c" as string]: "var(--acc)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6.4" stroke="var(--acc)" strokeWidth="1.3" />
              <circle cx="8" cy="8" r="2.4" fill="var(--acc)" />
            </svg>
            <span className="font-display text-[11px] tracking-[0.26em] text-bright" style={{ fontWeight: 700 }}>
              INITIALIZE AUDIO ENGINE
            </span>
          </button>
          <p className="font-mono text-[9px] tracking-[0.18em] text-dim">BROWSERS REQUIRE ONE TAP TO UNLOCK SOUND</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* transport row */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              disabled={audioStatus === "unavailable"}
              className="btn-state active flex h-10 w-10 cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-40"
              style={{ ["--c" as string]: "var(--acc)" }}
              aria-label={audioStatus === "running" ? "pause" : "play"}
            >
              {audioStatus === "running" ? (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1" width="3.2" height="10" fill="var(--acc)" /><rect x="7.3" y="1" width="3.2" height="10" fill="var(--acc)" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.2v9.6L10.8 6z" fill="var(--acc)" /></svg>
              )}
            </button>
            <div className="flex-1">
              <div className="mb-1.5 flex items-center justify-between font-mono text-[9px] tracking-[0.2em] text-dim">
                <span>MASTER VOLUME</span>
                <span className="neon-text text-[10px]">{volume}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="vol"
                style={{ ["--fill" as string]: `${volume}%` }}
                aria-label="master volume"
              />
            </div>
          </div>

          {/* crossfade indicator */}
          {transitioning && (
            <div className="anim-in">
              <p className="mb-1 font-mono text-[9px] tracking-[0.24em] text-dim">
                CROSSFADING {STATE_META[transitioning.from].frequency}Hz → <span style={{ color: "var(--acc)" }}>{STATE_META[transitioning.to].frequency}Hz</span>
              </p>
              <div className="h-[3px] w-full overflow-hidden bg-line/60">
                <div className="h-full w-1/2" style={{ background: "linear-gradient(90deg, transparent, var(--acc), transparent)", animation: "shimmerBar 1.1s linear infinite", backgroundSize: "280px 100%" }} />
              </div>
            </div>
          )}

          {/* layer meters */}
          <div>
            <p className="hud-label mb-2 !text-[9px]">Voice layers</p>
            <div className="grid grid-cols-4 gap-2">
              {BANDS.map((b, i) => (
                <div key={b} className="flex flex-col items-center gap-1.5">
                  <div className="relative h-16 w-full overflow-hidden border border-line/60 bg-ink/70">
                    <div
                      className="absolute inset-x-0 bottom-0 transition-[height] duration-150 ease-out"
                      style={{
                        height: `${Math.min(100, Math.max(2, levels[i] * 220))}%`,
                        background: "linear-gradient(180deg, var(--acc2), color-mix(in srgb, var(--acc) 55%, transparent))",
                        boxShadow: "0 0 12px var(--acc-glow)",
                      }}
                    />
                  </div>
                  <span className="font-mono text-[8px] tracking-[0.24em] text-dim">{b}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="border-t border-white/5 pt-2 font-mono text-[9px] leading-relaxed tracking-[0.14em] text-dim">
            {output === "core" ? "PYTHON CORE (PYGAME) DRIVING SPEAKERS · BROWSER MIRRORS SPECTRUM" : `LAYERED SYNTH · ${meta.frequency} Hz FUNDAMENTAL · HARMONIC STACK + AIR`}
          </p>
        </div>
      )}
    </Panel>
  );
}
