import { STATE_META, STATE_ORDER } from "../data/states";
import type { Symphony } from "../hooks/useSymphony";

const KEYS = ["1", "2", "3"];

export function OverrideBar({ sym }: { sym: Symphony }) {
  const { stateId, mode, override, engageAuto } = sym;

  return (
    <div className="panel relative">
      <span className="panel-corner top-0 left-0 border-t border-l" />
      <span className="panel-corner bottom-0 right-0 border-b border-r" />
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-stretch">
        <div className="grid flex-1 grid-cols-3 gap-2">
          {STATE_ORDER.map((s, i) => {
            const m = STATE_META[s];
            const active = mode === "manual" && stateId === s;
            return (
              <button
                key={s}
                onClick={() => override(s)}
                className={`btn-state group flex flex-col items-center gap-1 px-2 py-2.5 ${active ? "active" : ""}`}
                style={{ ["--c" as string]: m.color }}
                aria-pressed={active}
              >
                <span className="flex items-center gap-2">
                  <span className="keycap">{KEYS[i]}</span>
                  <span className="font-display text-[11px] tracking-[0.22em] text-bright" style={{ fontWeight: 700 }}>
                    {m.label}
                  </span>
                </span>
                <span className="font-mono text-[9px] tracking-[0.18em]" style={{ color: m.color }}>
                  {m.frequency} Hz
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={engageAuto}
          className={`btn-state flex flex-col items-center justify-center gap-1 px-4 py-2.5 sm:w-[130px] ${mode === "auto" ? "active" : ""}`}
          style={{ ["--c" as string]: "#93a3c4" }}
          aria-pressed={mode === "auto"}
        >
          <span className="flex items-center gap-2">
            <span className="keycap">4</span>
            <span className="font-display text-[11px] tracking-[0.22em] text-bright" style={{ fontWeight: 700 }}>
              AUTO
            </span>
          </span>
          <span className="font-mono text-[9px] tracking-[0.18em] text-dim">
            {mode === "auto" ? "EXPRESSION-DRIVEN" : "RESUME AI MODE"}
          </span>
        </button>
      </div>
    </div>
  );
}
