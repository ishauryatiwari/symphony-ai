"""Emotion → target soundscape mapping with hysteresis stabilization.

Mapping contract (see README):
    ANGRY / FEARFUL  → CALM
    SAD / DEPRESSED  → HAPPY
    NEUTRAL / HAPPY  → ENERGETIC

The state machine refuses to switch on a single flicker: a candidate
emotion must be observed `stability_frames` consecutive times, each above
the confidence threshold, before it becomes the stable emotion.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

EMOTION_TO_STATE = {
    "angry": "calm",
    "fear": "calm",
    "sad": "happy",
    "neutral": "energy",
    "happy": "energy",
    "disgust": "calm",
    "surprise": "energy",
}


@dataclass
class StabilityResult:
    changed: bool
    emotion: Optional[str]
    progress: int  # consecutive matching observations (capped)


class EmotionStateMachine:
    """Hysteresis filter between raw detections and the soundscape."""

    def __init__(self, stability_frames: int = 5, confidence_threshold: float = 60.0):
        self.stability_frames = max(1, stability_frames)
        self.confidence_threshold = confidence_threshold
        self._last: Optional[str] = None
        self._count = 0
        self.stable: Optional[str] = None

    def push(self, emotion: Optional[str], confidence: float) -> StabilityResult:
        """Feed one observation; returns whether the stable emotion changed."""
        if emotion is None or confidence < self.confidence_threshold:
            return StabilityResult(False, self.stable, self._count)

        if emotion == self._last:
            self._count = min(self._count + 1, self.stability_frames)
        else:
            self._last = emotion
            self._count = 1

        if self._count >= self.stability_frames and self._last != self.stable:
            self.stable = self._last
            return StabilityResult(True, self.stable, self._count)
        return StabilityResult(False, self.stable, self._count)

    def reset(self) -> None:
        self._last = None
        self._count = 0
        self.stable = None
