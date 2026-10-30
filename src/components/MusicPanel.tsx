import { useEffect, useRef, useState } from "react";
import { Panel } from "./Panel";
import { YoutubeLayer, YT_TITLES } from "../audio/youtube";
import { STATE_META } from "../data/states";
import type { Symphony } from "../hooks/useSymphony";

type YtStatus = "off" | "loading" | "playing" | "error";

/** Optional YouTube ambience layer — degrades silently into the local synth. */
export function MusicPanel({ sym }: { sym: Symphony }) {
  const { stateId, volume, audioStatus, pushLog } = sym;
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<YtStatus>("off");
  const layerRef = useRef<YoutubeLayer | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const enabledRef = useRef(false);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) return;
    let cancelled = false;
    const layer = layerRef.current ?? new YoutubeLayer();
    layerRef.current = layer;
    setStatus("loading");
    pushLog("INFO", "Loading YouTube ambience layer…");
    const host = hostRef.current;
    if (!host) return;
    void layer.mount(
      host,
      stateId,
      (volume / 100) * 0.8,
      () => {
        if (cancelled) return;
        setStatus("playing");
        pushLog("INFO", `YT ambience playing — ${YT_TITLES[stateId]}`);
      },
      () => {
        if (cancelled) return;
        setStatus("error");
        pushLog("WARN", "YouTube stream unavailable — synth soundscape continues");
      },
    ).then((ok) => {
      if (!ok && !cancelled) {
        setStatus("error");
        pushLog("WARN", "YouTube IFrame API unreachable — synth soundscape continues");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  /* follow state changes */
  useEffect(() => {
    if (!enabledRef.current || status !== "playing") return;
    layerRef.current?.switchState(stateId);
    pushLog("INFO", `YT layer → ${STATE_META[stateId].label} playlist`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateId]);

  /* volume + transport sync */
  useEffect(() => {
    layerRef.current?.setVolume((volume / 100) * 0.8);
  }, [volume]);
  useEffect(() => {
    if (status !== "playing") return;
    if (audioStatus === "paused") layerRef.current?.pause();
    if (audioStatus === "running") layerRef.current?.play();
  }, [audioStatus, status]);

  useEffect(() => () => layerRef.current?.destroy(), []);

  const toggle = () => {
    if (enabled) {
      layerRef.current?.destroy();
      setEnabled(false);
      setStatus("off");
      pushLog("INFO", "YT ambience layer disengaged");
    } else {
      setEnabled(true);
    }
  };

  return (
    <Panel
      title="Music Layer · YouTube"
      right={
        <button
          onClick={toggle}
          className="relative h-[18px] w-[34px] cursor-pointer border border-line bg-ink/80 transition-colors"
          style={enabled ? { borderColor: "color-mix(in srgb, var(--acc) 60%, #1b2740)" } : undefined}
          role="switch"
          aria-checked={enabled}
          aria-label="toggle youtube ambience"
        >
          <span
            className="absolute top-[2px] h-[12px] w-[12px] transition-all duration-300"
            style={{
              left: enabled ? "18px" : "2px",
              background: enabled ? "var(--acc)" : "#33436a",
              boxShadow: enabled ? "0 0 8px var(--acc-glow)" : "none",
            }}
          />
        </button>
      }
    >
      <div className="relative h-[88px] overflow-hidden border border-line/60 bg-ink/80">
        <div ref={hostRef} className="pointer-events-none absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
        {!enabled && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <svg width="22" height="16" viewBox="0 0 24 17" fill="none" aria-hidden="true">
              <rect x="0.7" y="0.7" width="22.6" height="15.6" rx="3.4" stroke="#33436a" strokeWidth="1.3" />
              <path d="M9.8 5.2l5.4 3.3-5.4 3.3z" fill="#33436a" />
            </svg>
            <p className="font-mono text-[9px] tracking-[0.22em] text-dim">AMBIENCE LAYER DISENGAGED</p>
          </div>
        )}
        {enabled && status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink/70">
            <span className="led led-pulse" style={{ color: "#fbbf24" }} />
            <span className="font-mono text-[9px] tracking-[0.22em] text-soft">CONNECTING…</span>
          </div>
        )}
        {enabled && status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-ink/80 px-4 text-center">
            <p className="font-mono text-[10px] tracking-[0.18em] text-[#fb7185]">STREAM UNAVAILABLE</p>
            <p className="font-mono text-[9px] tracking-[0.12em] text-dim">Falling back to synthesized soundscape.</p>
          </div>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="truncate font-mono text-[9.5px] tracking-[0.12em] text-dim">
          {enabled && status === "playing" ? (
            <span style={{ color: STATE_META[stateId].color }}>▶ {YT_TITLES[stateId]}</span>
          ) : (
            "OPTIONAL STREAM · FALLBACK = LOCAL SYNTH"
          )}
        </p>
        <span
          className="chip shrink-0"
          style={
            status === "playing"
              ? { color: "#34d399", borderColor: "#34d39950" }
              : status === "loading"
                ? { color: "#fbbf24", borderColor: "#fbbf2450" }
                : status === "error"
                  ? { color: "#fb7185", borderColor: "#fb718550" }
                  : undefined
          }
        >
          <span className="led" />
          {status.toUpperCase()}
        </span>
      </div>
    </Panel>
  );
}
