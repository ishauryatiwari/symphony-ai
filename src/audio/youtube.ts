import type { StateId } from "../types";

/**
 * State-specific ambient playlists for the optional YouTube layer.
 * Swap these IDs for any royalty-free / licensed ambient playlists you like.
 * If YouTube is unreachable (offline, blocked iframe, bad ID), the app
 * logs a warning and continues on the local synth — it never crashes.
 */
export const YT_PLAYLISTS: Record<StateId, string[]> = {
  calm: ["1ZYbU82GVz4", "jfKfPfyJRdk"],
  happy: ["jfKfPfyJRdk", "1ZYbU82GVz4"],
  energy: ["jfKfPfyJRdk", "1ZYbU82GVz4"],
};

export const YT_TITLES: Record<StateId, string> = {
  calm: "Marconi Union — Weightless (ambient)",
  happy: "Lofi Girl — relaxed beats",
  energy: "Lofi Girl — upbeat session",
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: Record<string, unknown>,
      ) => YoutubePlayer;
      PlayerState?: { PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YoutubePlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (v: number) => void;
  cueVideoById: (id: string) => void;
  loadVideoById: (id: string) => void;
  destroy: () => void;
}

/** Thin, defensive wrapper around the YouTube IFrame Player API. */
export class YoutubeLayer {
  private player: YoutubePlayer | null = null;
  private apiPromise: Promise<boolean> | null = null;
  mounted = false;

  loadApi(timeoutMs = 6500): Promise<boolean> {
    if (this.apiPromise) return this.apiPromise;
    this.apiPromise = new Promise<boolean>((resolve) => {
      if (window.YT?.Player) return resolve(true);
      const timer = window.setTimeout(() => resolve(false), timeoutMs);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        window.clearTimeout(timer);
        resolve(true);
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.onerror = () => {
        window.clearTimeout(timer);
        resolve(false);
      };
      document.head.appendChild(tag);
    });
    return this.apiPromise;
  }

  async mount(
    host: HTMLElement,
    state: StateId,
    volume: number,
    onPlaying: () => void,
    onError: () => void,
  ): Promise<boolean> {
    const ok = await this.loadApi();
    if (!ok || !window.YT) return false;
    try {
      host.innerHTML = "";
      const el = document.createElement("div");
      host.appendChild(el);
      this.player = new window.YT.Player(el, {
        width: "100%",
        height: "100%",
        videoId: YT_PLAYLISTS[state][0],
        playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: (e: { target: YoutubePlayer }) => {
            e.target.setVolume(Math.round(volume * 100));
            e.target.playVideo();
            this.mounted = true;
          },
          onStateChange: (e: { data: number }) => {
            if (window.YT?.PlayerState && e.data === window.YT.PlayerState.PLAYING) onPlaying();
          },
          onError: () => onError(),
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  switchState(state: StateId) {
    try {
      this.player?.loadVideoById(YT_PLAYLISTS[state][0]);
    } catch { /* layer is optional — never crash */ }
  }

  setVolume(v: number) {
    try { this.player?.setVolume(Math.round(v * 100)); } catch { /* noop */ }
  }

  pause() { try { this.player?.pauseVideo(); } catch { /* noop */ } }
  play() { try { this.player?.playVideo(); } catch { /* noop */ } }

  destroy() {
    try { this.player?.destroy(); } catch { /* noop */ }
    this.player = null;
    this.mounted = false;
  }
}
