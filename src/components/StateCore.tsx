import { EMOTION_LABEL, EMOTION_TO_STATE, FREQUENCY_RANGE, STATE_META, STATE_ORDER } from "../data/states";
import type { Symphony } from "../hooks/useSymphony";

/** Maps a frequency to a needle angle across the 180° gauge. */
function angleFor(freq: number): number {
  const { min, max } = FREQUENCY_RANGE;
  const t = (freq - min) / (max - min);
  return -90 + t * 180; // -90 (left) → +90 (right)
}

export function StateCore({ sym }: { sym: Symphony }) {
  const { stateId, transitioning, emotion, mode, source } = sym;
  const meta = STATE_META[stateId];
  const needle = angleFor(meta.frequency);
  const t = (meta.frequency - FREQUENCY_RANGE.min) / (FREQUENCY_RANGE.max - FREQUENCY_RANGE.min);
  const arcPct = 12 + t * 88; // visible arc progression across 432 → 528 → 639
  const target = emotion ? EMOTION_TO_STATE[emotion.emotion] : null;

  return (
    <div className="panel relative overflow-hidden">
      <span className="panel-corner top-0 left-0 border-t border-l" />
      <span className="panel-corner top-0 right-0 border-t border-r" />
      <span className="panel-corner bottom-0 left-0 border-b border-l" />
      <span className="panel-corner bottom-0 right-0 border-b border-r" />

      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
        <h2 className="hud-label">Target Soundscape</h2>
        <span className="font-mono text-[9px] tracking-[0.22em] text-dim">
          {source === "backend" ? "SOURCE · DEEPFACE PIPELINE" : mode === "manual" ? "SOURCE · MANUAL OVERRIDE" : "SOURCE · AUTO PILOT"}
        </span>
      </div>

      <div className="relative px-4 pt-5 pb-6">
        {/* giant state word */}
        <div className="text-center">
          <p className="hud-label mb-1">{meta.tagline}</p>
          <h3
            key={stateId}
            className="anim-state neon-text font-display text-[clamp(2.6rem,6vw,4.6rem)] leading-none tracking-[0.16em]"
            style={{ fontWeight: 900 }}
          >
            {meta.label}
          </h3>
        </div>

        {/* gauge */}
        <div className="relative mx-auto mt-4 h-[150px] w-[290px] max-w-full">
          {/* pulse rings */}
          <div
            className="ring-ping absolute left-1/2 top-[86px] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border"
            style={{ borderColor: "color-mix(in srgb, var(--acc) 40%, transparent)" }}
          />
          <div
            className="ring-ping-2 absolute left-1/2 top-[86px] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border"
            style={{ borderColor: "color-mix(in srgb, var(--acc) 30%, transparent)" }}
          />

          <svg viewBox="0 0 200 112" className="absolute inset-x-0 top-0 mx-auto w-[270px]">
            {/* track */}
            <path d="M 22 100 A 78 78 0 0 1 178 100" fill="none" stroke="#1b2740" strokeWidth="5" strokeLinecap="round" />
            {/* tick marks for 432 / 528 / 639 */}
            {[432, 528, 639].map((f) => {
              const a = ((angleFor(f) - 90) * Math.PI) / 180;
              const x1 = 100 + Math.cos(a) * 70;
              const y1 = 100 + Math.sin(a) * 70;
              const x2 = 100 + Math.cos(a) * 86;
              const y2 = 100 + Math.sin(a) * 86;
              const active = f === meta.frequency;
              return (
                <g key={f}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={active ? "var(--acc)" : "#33436a"} strokeWidth={active ? 2.4 : 1.2} style={{ transition: "stroke .6s" }} />
                  <text
                    x={100 + Math.cos(a) * 95}
                    y={103 + Math.sin(a) * 95}
                    textAnchor="middle"
                    fontSize="7.5"
                    fontFamily="IBM Plex Mono, monospace"
                    fill={active ? "var(--acc)" : "#5b6b8c"}
                    style={{ transition: "fill .6s" }}
                  >
                    {f}
                  </text>
                </g>
              );
            })}
            {/* value arc */}
            <path
              d="M 22 100 A 78 78 0 0 1 178 100"
              fill="none"
              stroke="var(--acc)"
              strokeWidth="5"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${arcPct} ${100 - arcPct}`}
              style={{ filter: "drop-shadow(0 0 6px var(--acc-glow))", transition: "stroke-dasharray 1.2s cubic-bezier(.3,.8,.3,1), stroke .8s" }}
            />
            {/* needle */}
            <g style={{ transform: `rotate(${needle}deg)`, transformOrigin: "100px 100px", transition: "transform 1.4s cubic-bezier(.3,.9,.3,1)" }}>
              <line x1="100" y1="100" x2="100" y2="34" stroke="var(--acc2)" strokeWidth="1.6" />
              <circle cx="100" cy="34" r="2.6" fill="var(--acc2)" style={{ filter: "drop-shadow(0 0 5px var(--acc2))" }} />
            </g>
            <circle cx="100" cy="100" r="4.5" fill="#0d1526" stroke="var(--acc)" strokeWidth="1.4" />
          </svg>

          {/* center readout */}
          <div className="absolute inset-x-0 top-[52px] text-center">
            <p key={meta.frequency} className="anim-state font-mono text-4xl text-bright" style={{ fontWeight: 600 }}>
              {meta.frequency}
              <span className="neon-text ml-1 text-sm">Hz</span>
            </p>
            <p className="mt-1 font-mono text-[8.5px] tracking-[0.3em] text-dim">SOLFEGGIO-INSPIRED TUNING</p>
          </div>
        </div>

        {/* expression → target strip */}
        <div className="mx-auto mt-4 flex max-w-md items-center justify-center gap-3 font-mono text-[10px] tracking-[0.16em]">
          {emotion ? (
            <>
              <span className="chip">
                EXP <span className="text-bright">{EMOTION_LABEL[emotion.emotion]}</span>
                <span style={{ color: "var(--acc)" }}>{emotion.confidence.toFixed(0)}%</span>
              </span>
              <span className="chevrons text-base" style={{ color: "var(--acc)" }}>»»</span>
              <span className="chip" style={{ borderColor: "color-mix(in srgb, var(--acc) 50%, #1b2740)" }}>
                TARGET <span style={{ color: target ? STATE_META[target].color : "var(--acc)" }}>{target ? STATE_META[target].label : "—"}</span>
              </span>
            </>
          ) : (
            <span className="chip">AWAITING EXPRESSION DATA…</span>
          )}
        </div>

        {/* state selector tabs (decorative progress) */}
        <div className="mx-auto mt-5 flex max-w-md gap-1">
          {STATE_ORDER.map((s) => (
            <div key={s} className="h-[3px] flex-1 transition-all duration-700" style={{ background: s === stateId ? STATE_META[s].color : "#141d33", boxShadow: s === stateId ? `0 0 10px ${STATE_META[s].color}66` : "none" }} />
          ))}
        </div>

        {/* transition banner */}
        {transitioning && (
          <div className="anim-in absolute inset-x-0 bottom-2 flex items-center justify-center gap-2 py-1">
            <span className="chevrons font-mono text-[10px]" style={{ color: "var(--acc)" }}>««</span>
            <span className="font-mono text-[10px] tracking-[0.28em] text-soft">
              TRANSITIONING → <span className="neon-text">{STATE_META[transitioning.to].label}</span> · CROSSFADE 2.8s
            </span>
            <span className="chevrons font-mono text-[10px]" style={{ color: "var(--acc)" }}>»»</span>
          </div>
        )}
      </div>
    </div>
  );
}
