import { useEffect, useRef } from "react";
import { EMOTION_LABEL, EMOTION_TO_STATE, SIM_EMOTIONS, STATE_META } from "../data/states";
import type { Symphony } from "../hooks/useSymphony";

export function CameraPanel({ sym }: { sym: Symphony }) {
  const { emotion, stability, source, cameraStatus, setCameraStatus, injectEmotion, pushLog, backend, mode } = sym;
  const videoRef = useRef<HTMLVideoElement>(null);

  /* own the camera stream locally; status is reported up */
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraStatus("on");
        pushLog("INFO", "Camera initialized");
      } catch {
        if (!cancelled) {
          setCameraStatus("unavailable");
          pushLog("WARN", "Webcam unavailable — vision disabled, manual controls active");
        }
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [setCameraStatus, pushLog]);

  const noVision = cameraStatus === "unavailable" || (backend === "online" && !emotion);
  const target = emotion ? EMOTION_TO_STATE[emotion.emotion] : null;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* feed */}
      <div className="panel scanlines relative aspect-video overflow-hidden">
        <span className="panel-corner top-0 left-0 border-t border-l" />
        <span className="panel-corner top-0 right-0 border-t border-r" />
        <span className="panel-corner bottom-0 left-0 border-b border-l" />
        <span className="panel-corner bottom-0 right-0 border-b border-r" />

        {cameraStatus !== "unavailable" ? (
          <>
            <video
              ref={videoRef}
              muted
              playsInline
              className="absolute inset-0 h-full w-full -scale-x-100 object-cover opacity-90 saturate-[.85]"
              style={{ filter: "contrast(1.05) brightness(.92)" }}
            />
            <div className="scan-beam" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink/90 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-panel px-6 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fb7185" strokeWidth="1.5" aria-hidden="true">
              <path d="M2 2l20 20M9.5 4h5L17 7h3a1 1 0 011 1v8.5M15 15.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1h1M9 9a3.5 3.5 0 004.9 4.9" strokeLinecap="round" />
            </svg>
            <div>
              <p className="font-display text-xs font-700 tracking-[0.2em] text-bright" style={{ fontWeight: 700 }}>
                CAMERA UNAVAILABLE
              </p>
              <p className="mt-2 max-w-[220px] font-mono text-[10px] leading-relaxed text-dim">
                AI emotion detection is disabled.
                <br />
                Manual soundscape controls remain available.
              </p>
            </div>
          </div>
        )}

        {/* feed HUD overlay */}
        {cameraStatus !== "unavailable" && (
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 py-2">
            <span className="font-mono text-[9px] tracking-[0.3em] text-soft/90">VISION FEED</span>
            <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em]" style={{ color: source === "sim" ? "#fbbf24" : "#fb7185" }}>
              <span className="led led-pulse" />
              {source === "sim" ? "SIM" : "REC"}
            </span>
          </div>
        )}
      </div>

      {/* detection readout */}
      <div className="panel relative flex-1">
        <span className="panel-corner top-0 left-0 border-t border-l" />
        <span className="panel-corner bottom-0 right-0 border-b border-r" />
        <div className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="hud-label">Detected State</h2>
            {/* stability pips */}
            <div className="flex items-center gap-1.5" title="expression stability">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-4 transition-all duration-500"
                  style={{
                    background: i < stability ? "var(--acc)" : "#1b2740",
                    boxShadow: i < stability ? "0 0 8px var(--acc-glow)" : "none",
                  }}
                />
              ))}
            </div>
          </div>

          {noVision ? (
            <div className="mt-4">
              <p className="font-display text-xl tracking-[0.14em] text-dim" style={{ fontWeight: 700 }}>
                NO FACE DETECTED
              </p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-dim/80">
                {cameraStatus === "unavailable" ? "SENSOR OFFLINE" : "WAITING FOR USER…"}
              </p>
            </div>
          ) : emotion ? (
            <div className="anim-in mt-3" key={emotion.emotion}>
              <div className="flex items-end justify-between gap-2">
                <p className="font-display text-3xl tracking-[0.1em] text-bright" style={{ fontWeight: 800 }}>
                  {EMOTION_LABEL[emotion.emotion]}
                </p>
                <p className="neon-text font-mono text-2xl" style={{ fontWeight: 600 }}>
                  {emotion.confidence.toFixed(0)}
                  <span className="text-sm opacity-70">%</span>
                </p>
              </div>
              <div className="mt-2 h-1 w-full bg-line/70">
                <div className="conf-bar-fill h-full" style={{ width: `${emotion.confidence}%` }} />
              </div>
              <p className="mt-3 font-mono text-[10px] tracking-[0.16em] text-dim">
                {source === "backend" ? "DEEPFACE · OPENCV HAAR" : "SIMULATED INFERENCE · DEMO"}
              </p>
              {target && mode === "auto" && (
                <p className="mt-2 flex items-center gap-2 font-mono text-[11px] tracking-[0.14em]">
                  <span className="text-dim">MAPPING</span>
                  <span className="chevrons" style={{ color: STATE_META[target].color }}>»»»</span>
                  <span style={{ color: STATE_META[target].color }}>{STATE_META[target].label}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="mt-4 font-mono text-[10px] tracking-[0.2em] text-dim">ACQUIRING EXPRESSION DATA…</p>
          )}

          {/* demo triggers — solo mode only */}
          {source === "sim" && backend !== "online" && (
            <div className="mt-5 border-t border-white/5 pt-3">
              <p className="hud-label mb-2 !text-[9px]">Demo trigger · inject expression</p>
              <div className="flex flex-wrap gap-1.5">
                {SIM_EMOTIONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => injectEmotion(e)}
                    className="cursor-pointer border border-line bg-ink/60 px-2 py-1 font-mono text-[9px] tracking-[0.14em] text-soft transition-all hover:-translate-y-px hover:text-bright"
                    style={{ ["--c" as string]: "#fbbf24" }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.borderColor = "#fbbf2480")}
                    onMouseLeave={(ev) => (ev.currentTarget.style.borderColor = "")}
                  >
                    {EMOTION_LABEL[e]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
