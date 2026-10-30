"""Flask API + conductor — wires every subsystem into one resilient app.

Endpoints
---------
    GET  /api/health        liveness probe
    GET  /api/status        full system snapshot (UI polls this)
    GET  /api/emotion       latest emotion reading
    GET  /api/state         current soundscape state
    POST /api/state         manual override  {"state": "calm|happy|energy"}
    POST /api/mode          {"mode": "auto|manual"}
    GET  /api/affirmation   ?state=calm — cached Ollama text or fallback
    GET  /api/playlists     YouTube playlist map for the browser layer
    GET  /api/logs?since=N  ring-buffered core logs for the UI console

The frontend is served from `frontend/` (zero-build) or `dist/` (React
build) when present.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from flask import Flask, jsonify, request, send_from_directory

from .audio.playlist_controller import PlaylistController
from .audio.state_audio import STATE_AUDIO_PROFILES, StateAudioController
from .audio.synthesizer import Synthesizer
from .camera.emotion_detector import EmotionDetector
from .config import Config
from .intelligence import affirmations
from .intelligence.ollama_client import OllamaClient
from .state.emotion_state import EMOTION_TO_STATE, EmotionStateMachine

logger = logging.getLogger("symphony.core")

VALID_STATES = set(STATE_AUDIO_PROFILES)
AFFIRMATION_TTL = 300  # seconds an Ollama affirmation stays fresh per state


class RingLogHandler(logging.Handler):
    """Keeps the last N formatted lines plus a global counter for polling."""

    def __init__(self, maxlen: int = 250):
        super().__init__(level=logging.INFO)
        self.buffer: deque = deque(maxlen=maxlen)
        self.total = 0
        self._lock = threading.Lock()

    def emit(self, record: logging.LogRecord) -> None:
        try:
            with self._lock:
                self.buffer.append(self.format(record))
                self.total += 1
        except Exception:  # pragma: no cover
            self.handleError(record)

    def since(self, index: int) -> Tuple[List[str], int]:
        with self._lock:
            start = max(0, self.total - len(self.buffer))
            idx = max(start, min(index, self.total))
            return list(self.buffer)[idx - start:], self.total


class SymphonyCore:
    """Owns every subsystem and runs the emotion → state conductor loop."""

    def __init__(self, config: Config):
        self.config = config
        self.detector = EmotionDetector(config.camera_index, config.frame_analyze_interval)
        self.machine = EmotionStateMachine(config.emotion_stability_frames, config.confidence_threshold)
        self.audio = StateAudioController(Synthesizer(config.audio_sample_rate, config.default_volume))
        self.ollama = OllamaClient(config.ollama_host, config.ollama_model)
        self.music = PlaylistController()

        self.mode = "auto"
        self.state = "calm"
        self.emotion: Optional[str] = None
        self.confidence = 0.0
        self.stability = 0
        self.started_at = time.time()

        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._affirmation_cache: Dict[str, Dict[str, Any]] = {}
        self._aff_lock = threading.Lock()

    # ------------------------------------------------------------- lifecycle
    def start(self) -> None:
        self.audio.start() or logger.warning("Audio offline — visual-only mode")
        self.detector.start()
        threading.Thread(target=self._ollama_watchdog, daemon=True, name="ollama-watchdog").start()
        threading.Thread(target=self._conductor, daemon=True, name="conductor").start()
        self._spawn_affirmation("neutral", "calm")
        logger.info("AI Symphony core started")

    def shutdown(self) -> None:
        logger.info("Shutting down…")
        self._stop.set()
        self.detector.stop()
        self.audio.shutdown()
        logger.info("Shutdown complete")

    # ----------------------------------------------------------- background
    def _ollama_watchdog(self) -> None:
        was_reachable: Optional[bool] = None
        while not self._stop.is_set():
            status = self.ollama.refresh_status()
            if status["reachable"] != was_reachable:
                if status["reachable"]:
                    logger.info("Ollama connected")
                    if status["model_available"]:
                        logger.info("Model: %s", self.ollama.model)
                else:
                    logger.warning("Ollama unavailable — using fallback affirmations")
                was_reachable = status["reachable"]
            self._stop.wait(20)

    def _conductor(self) -> None:
        """Feed stabilized emotions into the state machine → audio engine."""
        while not self._stop.is_set():
            reading = self.detector.read_new()
            if reading is not None and self.mode == "auto":
                emotion = reading.get("emotion")
                confidence = float(reading.get("confidence", 0.0))
                if reading.get("face_detected", False):
                    self.emotion = emotion
                    self.confidence = confidence
                    result = self.machine.push(emotion, confidence)
                    self.stability = result.progress
                    if result.changed and result.emotion:
                        logger.info("Emotion detected: %s (%.0f%%)", result.emotion.upper(), confidence)
                        target = EMOTION_TO_STATE.get(result.emotion, "energy")
                        self.set_state(target, emotion=result.emotion)
            self._stop.wait(0.4)

    # --------------------------------------------------------- state control
    def set_state(self, new_state: str, emotion: Optional[str] = None, manual: bool = False) -> None:
        with self._lock:
            if new_state not in VALID_STATES:
                return
            changed = new_state != self.state
            if changed:
                self.state = new_state
                logger.info("Target state: %s%s", new_state.upper(), " (manual override)" if manual else "")
                self.audio.switch_state(new_state)
                self.music.switch_state(new_state)
            aff_emotion = emotion or self.emotion or "neutral"
        if changed:
            self._spawn_affirmation(aff_emotion, new_state)

    # ------------------------------------------------------------ affirmations
    def _spawn_affirmation(self, emotion: str, state: str) -> None:
        with self._aff_lock:
            cached = self._affirmation_cache.get(state)
            if cached and time.time() - cached["ts"] < AFFIRMATION_TTL:
                return
        threading.Thread(
            target=self._refresh_affirmation, args=(emotion, state),
            daemon=True, name=f"affirmation-{state}",
        ).start()

    def _refresh_affirmation(self, emotion: str, state: str) -> None:
        logger.info("Generating affirmation")
        text, source = self.ollama.generate_affirmation(emotion, state)
        with self._aff_lock:
            self._affirmation_cache[state] = {
                "text": text,
                "source": source,
                "model": self.ollama.model if source == "ollama" else None,
                "ts": time.time(),
            }

    def get_affirmation(self, state: str) -> Dict[str, Any]:
        with self._aff_lock:
            cached = self._affirmation_cache.get(state)
        if cached:
            return cached
        self._spawn_affirmation(self.emotion or "neutral", state)
        return {"text": affirmations.get_fallback(state), "source": "fallback", "model": None}

    # ----------------------------------------------------------------- status
    def status(self) -> Dict[str, Any]:
        profile = STATE_AUDIO_PROFILES[self.state]
        return {
            "mode": self.mode,
            "emotion": self.emotion,
            "confidence": self.confidence,
            "target_state": self.state,
            "frequency": profile["frequency"],
            "stability": self.stability,
            "ollama": bool(self.ollama.reachable and self.ollama.model_available),
            "ollama_reachable": self.ollama.reachable,
            "ollama_model": self.ollama.model,
            "camera": self.detector.available,
            "deepface": self.detector.deepface_ready,
            "audio": self.audio.available,
            "uptime": int(time.time() - self.started_at),
        }


def create_app(core: SymphonyCore, ring: RingLogHandler) -> Flask:
    """Flask app factory — routes, CORS, static frontend, error handlers."""
    root = Path(__file__).resolve().parent.parent
    frontend_dir: Optional[Path] = None
    for candidate in (root / "frontend", root / "dist"):
        if (candidate / "index.html").exists():
            frontend_dir = candidate
            break

    app = Flask(__name__, static_folder=None)

    @app.after_request
    def _cors(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return resp

    # ------------------------------------------------------------- API routes
    @app.get("/api/health")
    def health():
        return jsonify({"ok": True, "service": "ai-symphony", "uptime": int(time.time() - core.started_at)})

    @app.get("/api/status")
    def status():
        return jsonify(core.status())

    @app.get("/api/emotion")
    def emotion():
        return jsonify({
            "emotion": core.emotion,
            "confidence": core.confidence,
            "timestamp": int(time.time() * 1000),
            "camera": core.detector.available,
            "face_detected": core.emotion is not None,
        })

    @app.get("/api/state")
    def get_state():
        return jsonify({
            "state": core.state,
            "frequency": STATE_AUDIO_PROFILES[core.state]["frequency"],
            "mode": core.mode,
        })

    @app.post("/api/state")
    def post_state():
        data = request.get_json(silent=True) or {}
        state = str(data.get("state", "")).lower()
        if state not in VALID_STATES:
            return jsonify({"error": f"invalid state '{state}' — expected one of {sorted(VALID_STATES)}"}), 400
        core.mode = "manual"
        core.set_state(state, manual=True)
        return jsonify({"ok": True, "state": state, "mode": "manual"})

    @app.post("/api/mode")
    def post_mode():
        data = request.get_json(silent=True) or {}
        mode = str(data.get("mode", "")).lower()
        if mode not in ("auto", "manual"):
            return jsonify({"error": "invalid mode — expected 'auto' or 'manual'"}), 400
        core.mode = mode
        logger.info("Mode: %s", mode.upper())
        return jsonify({"ok": True, "mode": mode})

    @app.get("/api/affirmation")
    def affirmation():
        state = (request.args.get("state") or core.state).lower()
        if state not in VALID_STATES:
            return jsonify({"error": f"invalid state '{state}'"}), 400
        aff = core.get_affirmation(state)
        return jsonify({"text": aff["text"], "source": aff["source"], "model": aff.get("model"), "state": state})

    @app.get("/api/playlists")
    def playlists():
        return jsonify(core.music.playlists())

    @app.get("/api/logs")
    def logs():
        since = request.args.get("since", 0, type=int)
        lines, total = ring.since(since)
        return jsonify({"lines": lines, "total": total})

    # ---------------------------------------------------------- error handlers
    @app.errorhandler(404)
    def _not_found(_err):
        return jsonify({"error": "not found"}), 404

    @app.errorhandler(405)
    def _bad_method(_err):
        return jsonify({"error": "method not allowed"}), 405

    @app.errorhandler(500)
    def _server_error(_err):
        return jsonify({"error": "internal server error"}), 500

    # ------------------------------------------------------- static frontend
    if frontend_dir is not None:
        resolved_root = frontend_dir.resolve()

        @app.get("/")
        def index():
            return send_from_directory(resolved_root, "index.html")

        @app.get("/<path:filename>")
        def static_files(filename: str):
            target = (resolved_root / filename).resolve()
            if resolved_root not in target.parents and target != resolved_root:
                return jsonify({"error": "forbidden"}), 403
            if target.is_file():
                return send_from_directory(resolved_root, filename)
            return send_from_directory(resolved_root, "index.html")

        logger.info("Serving frontend from %s", frontend_dir)
    else:
        @app.get("/")
        def index():
            return jsonify({
                "ok": True,
                "hint": "No frontend found. Keep frontend/index.html in the repo or build the React UI into dist/.",
            })

    return app
