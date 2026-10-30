import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api";
import { SoundscapeEngine } from "../audio/engine";
import { pickFallback } from "../data/affirmations";
import { EMOTION_LABEL, EMOTION_TO_STATE, STATE_META } from "../data/states";
import { EmotionSimulator } from "../logic/sim";
import { EmotionStabilizer } from "../logic/stabilizer";
import type {
  Affirmation,
  AudioStatus,
  BackendStatus,
  CameraStatus,
  EmotionName,
  EmotionReading,
  EmotionSource,
  LogLine,
  LogLevel,
  Mode,
  StateId,
} from "../types";

let LOG_ID = 0;
const stamp = () => new Date().toTimeString().slice(0, 8);

export interface Toast {
  key: number;
  msg: string;
}

/**
 * useSymphony — the conductor. Wires together:
 *  backend probe/poll ⇄ solo emotion simulation ⇄ hysteresis stabilizer
 *  ⇄ Web Audio soundscape engine ⇄ Ollama/fallback affirmations ⇄ logs.
 */
export function useSymphony() {
  const [backend, setBackend] = useState<BackendStatus>("checking");
  const [mode, setMode] = useState<Mode>("auto");
  const [stateId, setStateId] = useState<StateId>("calm");
  const [emotion, setEmotion] = useState<EmotionReading | null>(null);
  const [stability, setStability] = useState(0);
  const [source, setSource] = useState<EmotionSource>("sim");
  const [transitioning, setTransitioning] = useState<{ from: StateId; to: StateId } | null>(null);
  const [affirmation, setAffirmation] = useState<Affirmation | null>(null);
  const [affirming, setAffirming] = useState(false);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("idle");
  const [volume, setVolumeUi] = useState(62);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [ollamaInfo, setOllamaInfo] = useState<{ available: boolean; model?: string } | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("checking");
  const [output, setOutput] = useState<"browser" | "core">("browser");

  const engineRef = useRef<SoundscapeEngine>(new SoundscapeEngine());
  const audioStatusRef = useRef<AudioStatus>("idle");
  const stabilizerRef = useRef(new EmotionStabilizer(3, 55));
  const simRef = useRef(new EmotionSimulator());
  const stateRef = useRef<StateId>("calm");
  const modeRef = useRef<Mode>("auto");
  const backendRef = useRef(false);
  const outputRef = useRef<"browser" | "core">("browser");
  const volumeRef = useRef(0.62);
  const coreLogCursor = useRef(0);
  const transTimer = useRef<number | null>(null);

  /* ------------------------------------------------ logging ------- */
  const pushLog = useCallback((level: LogLevel, msg: string, origin: "ui" | "core" = "ui") => {
    setLogs((prev) => {
      const next = [...prev, { id: ++LOG_ID, t: stamp(), level, msg, origin }];
      return next.length > 90 ? next.slice(next.length - 90) : next;
    });
  }, []);

  /* ------------------------------------------------ transitions --- */
  const fetchAffirmation = useCallback(
    async (target: StateId) => {
      setAffirming(true);
      pushLog("INFO", "Generating affirmation");
      if (backendRef.current) {
        const a = await api.getAffirmation(target);
        if (a) {
          setAffirmation({ text: a.text, source: a.source, model: a.model });
          setAffirming(false);
          return;
        }
      }
      // local fallback with a touch of "thinking" latency
      window.setTimeout(() => {
        setAffirmation({ text: pickFallback(target), source: "fallback" });
        setAffirming(false);
      }, 650 + Math.random() * 500);
    },
    [pushLog],
  );

  const transitionTo = useCallback(
    (to: StateId, manual = false) => {
      const from = stateRef.current;
      if (from === to) return;
      stateRef.current = to;
      setStateId(to);
      setTransitioning({ from, to });
      if (transTimer.current) window.clearTimeout(transTimer.current);
      transTimer.current = window.setTimeout(() => setTransitioning(null), 3000);

      const meta = STATE_META[to];
      pushLog("INFO", `Target state: ${meta.label}`);
      pushLog("INFO", `Switching audio: ${STATE_META[from].frequency}Hz → ${meta.frequency}Hz`);
      setToast({ key: Date.now(), msg: `STATE SHIFT // ${meta.label} · ${meta.frequency} Hz` });

      engineRef.current.setState(to, 2.8);
      if (manual) void api.postState(to);
      void fetchAffirmation(to);
    },
    [pushLog, fetchAffirmation],
  );

  const handleReading = useCallback(
    (reading: EmotionReading, src: EmotionSource) => {
      setEmotion(reading);
      setSource(src);
      const res = stabilizerRef.current.push(reading);
      setStability(res.progress);
      if (res.changed && res.emotion) {
        pushLog("INFO", `Emotion detected: ${EMOTION_LABEL[res.emotion]} (${reading.confidence.toFixed(0)}%)`);
        const target = EMOTION_TO_STATE[res.emotion];
        if (target !== stateRef.current) transitionTo(target);
      }
    },
    [pushLog, transitionTo],
  );

  /* ------------------------------------------------ backend probe - */
  useEffect(() => {
    let alive = true;
    pushLog("SYS", "AI Symphony core v1.0 — local-first build");
    pushLog("INFO", "Probing Python backend (Flask · :5000)…");

    const tick = async () => {
      const ok = await api.probeBackend();
      if (!alive) return;
      const was = backendRef.current;
      backendRef.current = ok;
      setBackend(ok ? "online" : "offline");
      if (ok && !was) {
        pushLog("INFO", "Backend linked — OpenCV · DeepFace pipeline online");
        setSource("backend");
      } else if (!ok && was) {
        pushLog("WARN", "Backend lost — reverting to solo simulation");
      }
    };
    void tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [pushLog]);

  /* ------------------------------------------------ backend poll -- */
  useEffect(() => {
    if (backend !== "online") return;
    let alive = true;
    const id = window.setInterval(async () => {
      const st = await api.getStatus();
      if (!st || !alive) return;
      if (st.emotion) {
        setEmotion({ emotion: st.emotion, confidence: st.confidence, timestamp: Date.now() });
        setSource("backend");
      }
      setStability(st.stability);
      setOllamaInfo({ available: st.ollama, model: st.ollama_model });
      const coreAudio = st.audio;
      const nextOutput = coreAudio ? "core" : "browser";
      if (nextOutput !== outputRef.current) {
        outputRef.current = nextOutput;
        setOutput(nextOutput);
        if (nextOutput === "core") {
          engineRef.current.setVolume(0); // analyser keeps feeding the visualizer
          pushLog("INFO", "Audio: Python core (pygame) driving speakers");
        } else {
          engineRef.current.setVolume(volumeRef.current * 0.9);
          pushLog("WARN", "Core audio unavailable — browser engine engaged");
        }
      }
      if (modeRef.current === "auto" && st.target_state !== stateRef.current) {
        transitionTo(st.target_state);
      }
    }, 2000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [backend, pushLog, transitionTo]);

  /* ------------------------------------------------ core logs ----- */
  useEffect(() => {
    if (backend !== "online") return;
    const id = window.setInterval(async () => {
      const lines = await api.getCoreLogs(coreLogCursor.current);
      if (!lines) return;
      for (const raw of lines) {
        const m = /^\[(\w+)\]\s*(.*)$/.exec(raw);
        const level: LogLevel = m && ["INFO", "WARN", "ERROR", "SYS"].includes(m[1]) ? (m[1] as LogLevel) : "INFO";
        pushLog(level, m ? m[2] : raw, "core");
        coreLogCursor.current += 1;
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [backend, pushLog]);

  /* ------------------------------------------------ solo sim loop - */
  useEffect(() => {
    if (backend === "online" || mode !== "auto") return;
    const id = window.setInterval(() => {
      handleReading(simRef.current.next(), "sim");
    }, 1600);
    return () => window.clearInterval(id);
  }, [backend, mode, handleReading]);

  /* ------------------------------------------------ keyboard ------ */
  const override = useCallback(
    (s: StateId) => {
      modeRef.current = "manual";
      setMode("manual");
      pushLog("INFO", `Manual override → ${STATE_META[s].label} (${STATE_META[s].frequency} Hz)`);
      transitionTo(s, true);
    },
    [pushLog, transitionTo],
  );

  const engageAuto = useCallback(() => {
    modeRef.current = "auto";
    setMode("auto");
    pushLog("INFO", "AUTO mode engaged — expression detection driving");
    void api.postMode("auto");
  }, [pushLog]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "1") override("calm");
      else if (e.key === "2") override("happy");
      else if (e.key === "3") override("energy");
      else if (e.key === "4") engageAuto();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [override, engageAuto]);

  /* ------------------------------------------------ audio --------- */
  const initAudio = useCallback(async () => {
    const engine = engineRef.current;
    pushLog("INFO", "Initializing Web Audio engine…");
    const ok = await engine.init();
    if (!ok) {
      setAudioStatus("unavailable");
      pushLog("WARN", "Audio device unavailable — running in visual-only mode");
      return;
    }
    engine.setVolume(outputRef.current === "core" ? 0 : volumeRef.current * 0.9);
    engine.setState(stateRef.current, 1.6);
    audioStatusRef.current = "running";
    setAudioStatus("running");
    pushLog("INFO", `Web Audio engine online · ${STATE_META[stateRef.current].frequency} Hz`);
  }, [pushLog]);

  const togglePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine.running) return;
    if (audioStatusRef.current === "running") {
      engine.fadeOut(0.8);
      audioStatusRef.current = "paused";
      setAudioStatus("paused");
      pushLog("INFO", "Soundscape paused (fade out)");
    } else if (audioStatusRef.current === "paused") {
      engine.fadeIn(1.2);
      audioStatusRef.current = "running";
      setAudioStatus("running");
      pushLog("INFO", "Soundscape resumed (fade in)");
    }
  }, [pushLog]);

  const setVolume = useCallback((v: number) => {
    setVolumeUi(v);
    volumeRef.current = v / 100;
    if (outputRef.current !== "core") engineRef.current.setVolume(volumeRef.current * 0.9);
  }, []);

  /* ------------------------------------------------ demo triggers - */
  const injectEmotion = useCallback(
    (e: EmotionName) => {
      simRef.current.inject(e, 5);
      pushLog("INFO", `Demo trigger → ${EMOTION_LABEL[e]} expression injected`);
    },
    [pushLog],
  );

  /* ------------------------------------------------ first words --- */
  useEffect(() => {
    const id = window.setTimeout(() => void fetchAffirmation("calm"), 900);
    return () => window.clearTimeout(id);
  }, [fetchAffirmation]);

  return {
    backend, mode, stateId, emotion, stability, source, transitioning,
    affirmation, affirming, audioStatus, volume, logs, toast, ollamaInfo,
    cameraStatus, output, engine: engineRef.current,
    setCameraStatus, initAudio, togglePlay, setVolume, override, engageAuto,
    injectEmotion, pushLog,
  };
}

export type Symphony = ReturnType<typeof useSymphony>;
