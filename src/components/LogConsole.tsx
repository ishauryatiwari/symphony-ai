import { useEffect, useRef } from "react";
import { Panel } from "./Panel";
import type { Symphony } from "../hooks/useSymphony";
import type { LogLevel } from "../types";

const LEVEL_COLOR: Record<LogLevel, string> = {
  INFO: "#93a3c4",
  WARN: "#fbbf24",
  ERROR: "#fb7185",
  SYS: "#22d3ee",
};

export function LogConsole({ sym }: { sym: Symphony }) {
  const { logs } = sym;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <Panel
      title="System Log"
      right={<span className="font-mono text-[9px] tracking-[0.2em] text-dim">{logs.length} EVT</span>}
      bodyClassName="!p-0"
    >
      <div ref={scrollRef} className="log-scroll h-[168px] overflow-y-auto px-3 py-2 font-mono text-[10px] leading-[1.7]">
        {logs.map((l) => (
          <div key={l.id} className="anim-in flex gap-2 whitespace-nowrap">
            <span className="shrink-0 text-dim/60">{l.t}</span>
            <span className="shrink-0 font-semibold" style={{ color: LEVEL_COLOR[l.level] }}>
              [{l.level}]
            </span>
            {l.origin === "core" && <span className="shrink-0 text-[#22d3ee]/70">core:</span>}
            <span className="truncate text-soft/90">{l.msg}</span>
          </div>
        ))}
        {logs.length === 0 && <div className="text-dim">— silent —</div>}
      </div>
    </Panel>
  );
}
