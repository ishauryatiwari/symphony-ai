import type { BackendStatePayload, StateId } from "./types";

/**
 * Backend API client.
 *
 * The React UI prefers a same-origin backend; when served statically it
 * also probes http://localhost:5000 (the Flask core). When neither answers,
 * the UI drops into solo mode: in-browser simulation + local synth.
 * Every call is timeout-guarded and failure-tolerant.
 */

const REMOTE = "http://localhost:5000";
let base = "";

async function timedFetch(url: string, init?: RequestInit, ms = 2500): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function probeBackend(): Promise<boolean> {
  const candidates = ["/api/health", `${REMOTE}/api/health`];
  for (const url of candidates) {
    try {
      const res = await timedFetch(url);
      if (!res.ok) continue;
      // Guard against static servers that answer HTML for unknown paths.
      const data = (await res.json()) as { ok?: boolean; service?: string };
      if (data && data.ok === true) {
        base = url.startsWith("http") ? REMOTE : "";
        return true;
      }
    } catch {
      /* try next candidate */
    }
  }
  return false;
}

export async function getStatus(): Promise<BackendStatePayload | null> {
  try {
    const res = await timedFetch(`${base}/api/status`);
    if (!res.ok) return null;
    return (await res.json()) as BackendStatePayload;
  } catch {
    return null;
  }
}

export async function getAffirmation(
  state: StateId,
): Promise<{ text: string; source: "ollama" | "fallback"; model?: string } | null> {
  try {
    const res = await timedFetch(`${base}/api/affirmation?state=${state}`, undefined, 6000);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function postState(state: StateId): Promise<void> {
  try {
    await timedFetch(`${base}/api/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
  } catch { /* backend audio mirroring is best-effort */ }
}

export async function postMode(mode: "auto" | "manual"): Promise<void> {
  try {
    await timedFetch(`${base}/api/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
  } catch { /* best-effort */ }
}

export async function getCoreLogs(since: number): Promise<string[] | null> {
  try {
    const res = await timedFetch(`${base}/api/logs?since=${since}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { lines: string[] };
    return data.lines;
  } catch {
    return null;
  }
}
