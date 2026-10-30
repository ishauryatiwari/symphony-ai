import { AffirmationPanel } from "./components/AffirmationPanel";
import { CameraPanel } from "./components/CameraPanel";
import { Header } from "./components/Header";
import { LogConsole } from "./components/LogConsole";
import { MusicPanel } from "./components/MusicPanel";
import { OverrideBar } from "./components/OverrideBar";
import { SoundPanel } from "./components/SoundPanel";
import { StateCore } from "./components/StateCore";
import { Visualizer } from "./components/Visualizer";
import { useSymphony } from "./hooks/useSymphony";

export default function App() {
  const sym = useSymphony();

  return (
    <div data-state={sym.stateId} className="relative min-h-full font-body text-bright">
      {/* layered ambient background — re-tints with the active state */}
      <div className="hud-bg-grid pointer-events-none fixed inset-0" aria-hidden="true" />
      <div className="hud-bg-glow-a pointer-events-none fixed inset-0" aria-hidden="true" />
      <div className="hud-bg-glow-b pointer-events-none fixed inset-0" aria-hidden="true" />
      <div className="hud-noise pointer-events-none fixed inset-0 opacity-70" aria-hidden="true" />

      <Header sym={sym} />

      {/* state-shift toast */}
      {sym.toast && (
        <div
          key={sym.toast.key}
          className="toast-anim fixed left-1/2 top-[76px] z-50 border px-5 py-2 font-mono text-[11px] tracking-[0.26em]"
          style={{
            borderColor: "color-mix(in srgb, var(--acc) 55%, transparent)",
            background: "color-mix(in srgb, var(--acc) 10%, rgba(5,8,14,.92))",
            color: "var(--acc)",
            boxShadow: "0 0 30px -6px var(--acc-glow)",
          }}
        >
          {sym.toast.msg}
        </div>
      )}

      <main className="relative z-10 mx-auto max-w-[1600px] px-4 pt-4 pb-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* vision column */}
          <div className="lg:col-span-3">
            <CameraPanel sym={sym} />
          </div>

          {/* core column */}
          <div className="flex flex-col gap-4 lg:col-span-6">
            <StateCore sym={sym} />
            <AffirmationPanel sym={sym} />
            <OverrideBar sym={sym} />
          </div>

          {/* audio / intelligence column */}
          <div className="flex flex-col gap-4 lg:col-span-3">
            <SoundPanel sym={sym} />
            <MusicPanel sym={sym} />
            <LogConsole sym={sym} />
          </div>
        </div>

        <div className="mt-4">
          <Visualizer sym={sym} />
        </div>

        {/* footer */}
        <footer className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-white/5 pt-4 md:flex-row">
          <p className="max-w-xl text-center font-mono text-[9.5px] leading-relaxed tracking-[0.08em] text-dim md:text-left">
            AI Symphony is an experimental wellness and creative soundscape project. It does not provide medical
            diagnosis or treatment. Frequencies are artistic tuning choices, not clinical interventions.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {["OPENCV", "DEEPFACE", "OLLAMA", "PYGAME", "WEB AUDIO", "FLASK"].map((t) => (
              <span key={t} className="chip !text-[8.5px]">{t}</span>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}
