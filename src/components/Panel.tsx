import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** HUD panel with corner brackets and a mono title strip. */
export function Panel({ title, right, children, className = "", bodyClassName = "" }: PanelProps) {
  return (
    <section className={`panel ${className}`}>
      <span className="panel-corner top-0 left-0 border-t border-l" />
      <span className="panel-corner top-0 right-0 border-t border-r" />
      <span className="panel-corner bottom-0 left-0 border-b border-l" />
      <span className="panel-corner bottom-0 right-0 border-b border-r" />
      <header className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2.5">
        <h2 className="hud-label">{title}</h2>
        {right ? <div className="flex items-center gap-2">{right}</div> : null}
      </header>
      <div className={`p-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
