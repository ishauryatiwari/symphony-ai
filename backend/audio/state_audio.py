"""State → soundscape profile mapping and high-level transitions.

The frequencies are solfeggio-inspired *creative* tuning choices for an
interactive soundscape — they are not medical interventions and are never
presented as such.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from .synthesizer import Synthesizer

logger = logging.getLogger("symphony.audio")

STATE_AUDIO_PROFILES: Dict[str, Dict[str, Any]] = {
    "calm": {"frequency": 432, "lfo_rate": 0.08, "label": "CALM"},
    "happy": {"frequency": 528, "lfo_rate": 0.14, "label": "HAPPY"},
    "energy": {"frequency": 639, "lfo_rate": 0.26, "label": "ENERGY"},
}


class StateAudioController:
    """Bridges emotional states and the low-level Synthesizer."""

    def __init__(self, synthesizer: Synthesizer):
        self.synth = synthesizer
        self.current: Optional[str] = None
        self.started = False

    def start(self) -> bool:
        """Boot the synth and bloom into the initial state."""
        self.started = self.synth.start()
        if self.started:
            self.switch_state("calm")
        return self.started

    @property
    def available(self) -> bool:
        return self.started and self.synth.available

    @property
    def frequency(self) -> Optional[int]:
        if self.current is None:
            return None
        return STATE_AUDIO_PROFILES[self.current]["frequency"]

    def switch_state(self, state: str) -> None:
        """Crossfade into the profile for `state` (no-op when unchanged)."""
        profile = STATE_AUDIO_PROFILES.get(state)
        if profile is None:
            logger.warning("Unknown audio state: %s", state)
            return
        if state == self.current:
            return

        if self.current is not None and self.started:
            old_freq = STATE_AUDIO_PROFILES[self.current]["frequency"]
            logger.info("Switching audio: %dHz → %dHz", old_freq, profile["frequency"])
        elif self.started:
            logger.info("Audio blooming at %d Hz (%s)", profile["frequency"], profile["label"])

        if self.started:
            self.synth.transition_to(profile["frequency"], profile["lfo_rate"])
        self.current = state

    def set_volume(self, volume: float) -> None:
        self.synth.set_volume(volume)

    def stop(self) -> None:
        self.synth.stop()

    def shutdown(self) -> None:
        self.synth.shutdown()
        self.started = False
