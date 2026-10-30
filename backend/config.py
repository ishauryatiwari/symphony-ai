"""Central configuration.

Everything is environment-driven with sensible demo defaults, so the app
runs with zero setup. Values can also live in a `.env` file at the repo
root (parsed here — no extra dependency required).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    """Minimal .env loader (KEY=VALUE lines, '#' comments)."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


def _env_str(name: str, default: str) -> str:
    return os.environ.get(name, default)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class Config:
    """Runtime configuration for every subsystem."""

    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    camera_index: int = 0
    confidence_threshold: float = 60.0
    emotion_stability_frames: int = 5
    default_volume: float = 0.5
    frame_analyze_interval: float = 1.5  # seconds between DeepFace passes
    audio_sample_rate: int = 44100
    host: str = "0.0.0.0"
    port: int = 5000

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            ollama_host=_env_str("OLLAMA_HOST", "http://localhost:11434").rstrip("/"),
            ollama_model=_env_str("OLLAMA_MODEL", "llama3.2"),
            camera_index=_env_int("CAMERA_INDEX", 0),
            confidence_threshold=_env_float("CONFIDENCE_THRESHOLD", 60.0),
            emotion_stability_frames=_env_int("EMOTION_STABILITY_FRAMES", 5),
            default_volume=_env_float("DEFAULT_VOLUME", 0.5),
            frame_analyze_interval=_env_float("FRAME_ANALYZE_INTERVAL", 1.5),
            audio_sample_rate=_env_int("AUDIO_SAMPLE_RATE", 44100),
            host=_env_str("HOST", "0.0.0.0"),
            port=_env_int("PORT", 5000),
        )
