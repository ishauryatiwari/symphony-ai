"""Local Ollama integration with graceful degradation.

Responsibilities
----------------
* check whether Ollama is reachable at `OLLAMA_HOST`
* check whether the configured model is actually pulled
* generate exactly-two-sentence supportive affirmations
* fall back to the predefined bank whenever anything goes wrong

The client never raises into the rest of the app — every failure path
returns a fallback affirmation so the experience never breaks.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, Tuple

import requests

try:
    from ollama import Client as _OllamaPkgClient  # type: ignore

    OLLAMA_PKG_AVAILABLE = True
except ImportError:  # pragma: no cover
    _OllamaPkgClient = None
    OLLAMA_PKG_AVAILABLE = False

from .affirmations import get_fallback

logger = logging.getLogger("symphony.ollama")

GOALS = {
    "calm": "a calmer, steadier state",
    "happy": "a lighter, more hopeful state",
    "energy": "an energized, positively connected state",
}

PROMPT_TEMPLATE = """The user's current detected emotional expression is: {emotion}.

Generate exactly two short supportive sentences that help the user move toward {goal}.

Do not diagnose the user.
Do not mention AI.
Do not use therapy jargon.
Do not make medical claims.
Keep the tone warm, calm, and encouraging.
Respond with only the two sentences."""


class OllamaClient:
    """Thin, defensive wrapper around a locally hosted Ollama server."""

    def __init__(self, host: str = "http://localhost:11434", model: str = "llama3.2"):
        self.host = host.rstrip("/")
        self.model = model
        self.reachable = False
        self.model_available = False
        self.last_error: str | None = None

    # ------------------------------------------------------------- health
    def refresh_status(self, timeout: float = 3.0) -> Dict[str, Any]:
        """Ping Ollama and verify the configured model is pulled."""
        try:
            resp = requests.get(f"{self.host}/api/tags", timeout=timeout)
            resp.raise_for_status()
            data = resp.json()
            names = [m.get("name", "") for m in data.get("models", [])]
            self.reachable = True
            self.model_available = any(
                n == self.model or n.split(":")[0] == self.model for n in names
            )
            self.last_error = None
            if not self.model_available:
                logger.warning(
                    "Ollama is running but model '%s' is unavailable — run: ollama pull %s",
                    self.model, self.model,
                )
        except Exception as exc:
            self.reachable = False
            self.model_available = False
            self.last_error = str(exc)
        return self.status()

    def status(self) -> Dict[str, Any]:
        return {
            "reachable": self.reachable,
            "model": self.model,
            "model_available": self.model_available,
        }

    # --------------------------------------------------------- generation
    @staticmethod
    def _first_two_sentences(text: str) -> str:
        parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text.strip()) if p.strip()]
        return " ".join(parts[:2])

    def generate_affirmation(self, emotion: str, state: str) -> Tuple[str, str]:
        """Return `(text, source)` where source is 'ollama' or 'fallback'."""
        if not self.reachable or not self.model_available:
            return get_fallback(state), "fallback"

        prompt = PROMPT_TEMPLATE.format(
            emotion=(emotion or "neutral").upper(),
            goal=GOALS.get(state, "a better state"),
        )
        try:
            raw = self._generate_raw(prompt)
            text = self._first_two_sentences(raw)
            if not text:
                raise ValueError("empty response")
            return text, "ollama"
        except Exception as exc:
            logger.warning("Ollama generation failed — using fallback affirmation (%s)", exc)
            return get_fallback(state), "fallback"

    def _generate_raw(self, prompt: str) -> str:
        if OLLAMA_PKG_AVAILABLE:
            client = _OllamaPkgClient(host=self.host)
            resp = client.generate(
                model=self.model,
                prompt=prompt,
                stream=False,
                options={"temperature": 0.8, "num_predict": 140},
            )
            if isinstance(resp, dict):
                return str(resp.get("response", ""))
            return str(getattr(resp, "response", ""))

        # Fallback: plain REST (keeps the app alive even without the ollama pkg)
        resp = requests.post(
            f"{self.host}/api/generate",
            json={
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.8, "num_predict": 140},
            },
            timeout=45,
        )
        resp.raise_for_status()
        return str(resp.json().get("response", ""))
