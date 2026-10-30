import { useEffect, useState } from "react";
import { Panel } from "./Panel";
import type { Symphony } from "../hooks/useSymphony";

/** Typewriter reveal for the affirmation text. */
function useTypewriter(text: string, speed = 14) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0);
    if (!text) return;
    const id = window.setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          window.clearInterval(id);
          return c;
        }
        return c + 2;
      });
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed]);
  return { shown: text.slice(0, count), done: count >= text.length };
}

export function AffirmationPanel({ sym }: { sym: Symphony }) {
  const { affirmation, affirming, ollamaInfo, backend } = sym;
  const text = affirmation?.text ?? "";
  const { shown, done } = useTypewriter(text);

  const sourceChip = affirming ? (
    <span className="chip" style={{ color: "#fbbf24", borderColor: "#fbbf2450" }}>
      <span className="led led-pulse" /> GENERATING
    </span>
  ) : affirmation?.source === "ollama" ? (
    <span className="chip" style={{ color: "#34d399", borderColor: "#34d39950" }}>
      <span className="led" /> OLLAMA · {(affirmation.model ?? ollamaInfo?.model ?? "llama3.2").toUpperCase()}
    </span>
  ) : (
    <span className="chip" style={{ color: "#fbbf24", borderColor: "#fbbf2440" }}>
      <span className="led" /> {backend === "online" ? "FALLBACK BANK" : "LOCAL BANK"}
    </span>
  );

  return (
    <Panel title="AI Affirmation" right={sourceChip} bodyClassName="!py-5">
      <div className="relative min-h-[92px]">
        <span className="neon-text pointer-events-none absolute -top-4 -left-1 font-display text-6xl opacity-40" style={{ fontWeight: 900 }}>
          “
        </span>
        {affirming && !text ? (
          <div className="flex items-center gap-2 pl-8 font-mono text-[11px] tracking-[0.22em] text-dim">
            <span className="led led-pulse" style={{ color: "#fbbf24" }} />
            COMPOSING SUPPORTIVE MESSAGE…
          </div>
        ) : (
          <blockquote className="pl-8 font-body text-lg leading-relaxed text-bright/95 md:text-xl" style={{ fontWeight: 300 }}>
            {shown}
            {!done && <span className="caret ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] bg-[var(--acc)]" />}
          </blockquote>
        )}
      </div>
      <p className="mt-3 pl-8 font-mono text-[9px] tracking-[0.2em] text-dim">
        AI-GENERATED SUPPORTIVE AFFIRMATION · TWO SENTENCES · NON-MEDICAL
      </p>
    </Panel>
  );
}
