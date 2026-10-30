import type { Symphony } from "../hooks/useSymphony";

function Chip({ color, label, value, pulse }: { color: string; label: string; value: string; pulse?: boolean }) {
  return (
    <div className="chip">
      <span className={`led ${pulse ? "led-pulse" : ""}`} style={{ color }} />
      <span className="opacity-60">{label}</span>
      <span className="text-bright">{value}</span>
    </div>
  );
}

export function Header({ sym }: { sym: Symphony }) {
  const { backend, cameraStatus, audioStatus, ollamaInfo, mode, output, source } = sym;

  const coreColor = backend === "online" ? "#34d399" : backend === "checking" ? "#fbbf24" : "#fb7185";
  const coreText = backend === "online" ? "LINKED" : backend === "checking" ? "PROBING" : "SOLO";

  const visionColor = cameraStatus === "on" ? (source === "sim" ? "#fbbf24" : "#34d399") : cameraStatus === "checking" ? "#fbbf24" : "#fb7185";
  const visionText = cameraStatus === "on" ? (source === "sim" ? "SIM" : "LIVE") : cameraStatus === "checking" ? "…" : "OFF";

  const llmColor = backend === "online" ? (ollamaInfo?.available ? "#34d399" : "#fbbf24") : "#fbbf24";
  const llmText =
    backend === "online"
      ? ollamaInfo?.available
        ? (ollamaInfo.model ?? "OLLAMA").toUpperCase().slice(0, 9)
        : "FALLBACK"
      : "LOCAL BANK";

  const audioColor =
    audioStatus === "running" ? "#34d399" : audioStatus === "paused" ? "#fbbf24" : audioStatus === "unavailable" ? "#fb7185" : "#5b6b8c";
  const audioText =
    audioStatus === "running" ? (output === "core" ? "CORE" : "LIVE") : audioStatus === "paused" ? "HELD" : audioStatus === "unavailable" ? "MUTE" : "IDLE";

  return (
    <header className="relative z-10 border-b border-white/5 bg-panel/70 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
        {/* wordmark */}
        <div className="flex items-center gap-3">
          <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
            <polygon
              points="19,2 34,10.5 34,27.5 19,36 4,27.5 4,10.5"
              fill="none"
              stroke="var(--acc)"
              strokeWidth="1.4"
              style={{ filter: "drop-shadow(0 0 6px var(--acc-glow))", transition: "stroke .8s" }}
            />
            <path
              d="M9 19h3l2-5 3 10 3-14 3 16 2.5-9 2 2H29"
              fill="none"
              stroke="var(--acc)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transition: "stroke .8s" }}
            />
          </svg>
          <div>
            <h1 className="font-display text-lg font-800 tracking-[0.22em] text-bright" style={{ fontWeight: 800 }}>
              AI&nbsp;SYMPHONY
            </h1>
            <p className="hud-label !text-[9px] !tracking-[0.34em]">Adaptive Emotional Soundscape</p>
          </div>
        </div>

        {/* status chips */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Chip color={coreColor} label="CORE" value={coreText} pulse={backend === "online"} />
          <Chip color={visionColor} label="VISION" value={visionText} pulse={cameraStatus === "on"} />
          <Chip color={llmColor} label="LLM" value={llmText} />
          <Chip color={audioColor} label="AUDIO" value={audioText} pulse={audioStatus === "running"} />
          <div
            className="chip !border-transparent"
            style={{
              color: mode === "auto" ? "var(--acc)" : "#fbbf24",
              background: "color-mix(in srgb, var(--acc) 10%, rgba(10,16,29,.8))",
              border: "1px solid color-mix(in srgb, var(--acc) 45%, transparent)",
            }}
          >
            <span className="led led-pulse" />
            {mode === "auto" ? "AUTO MODE" : "MANUAL"}
          </div>
        </div>
      </div>
      {/* state-reactive hairline */}
      <div
        className="h-px w-full"
        style={{
          background: "linear-gradient(90deg, transparent, var(--acc) 30%, var(--acc2) 70%, transparent)",
          opacity: 0.7,
          transition: "background 1s",
        }}
      />
    </header>
  );
}
