"""NumPy → pygame additive synthesizer with smooth crossfades.

Each state buffer is a seamless loop (integer cycle counts) containing:
    fundamental (f) · sub-octave (f/2) · perfect fifth (f·1.5) ·
    triangle octave (f·2) · gentle noise shimmer · breathing LFO

State changes crossfade: the outgoing channel fades out while the
incoming sound fades in (`fade_ms`), so transitions are never harsh.
"""

from __future__ import annotations

import logging
import threading
from typing import Optional

import numpy as np

try:
    import pygame  # type: ignore

    PYGAME_AVAILABLE = True
except ImportError:  # pragma: no cover
    pygame = None
    PYGAME_AVAILABLE = False

logger = logging.getLogger("symphony.audio")


class Synthesizer:
    """Owns the pygame mixer and performs crossfaded sound transitions."""

    def __init__(self, sample_rate: int = 44100, volume: float = 0.5):
        self.sample_rate = sample_rate
        self.volume = max(0.0, min(1.0, float(volume)))
        self.available = False

        self._lock = threading.RLock()
        self._current_sound: Optional[object] = None
        self._current_channel: Optional[object] = None

    # ------------------------------------------------------------ lifecycle
    def start(self) -> bool:
        """Initialize the audio device. Returns False → visual-only mode."""
        if not PYGAME_AVAILABLE:
            logger.error("pygame is not installed — silent mode (pip install pygame)")
            return False
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.pre_init(self.sample_rate, -16, 2, 1024)
                pygame.init()
                pygame.mixer.set_num_channels(8)
            self.available = True
            logger.info("Audio device initialized (%d Hz, 16-bit stereo)", self.sample_rate)
            return True
        except pygame.error as exc:
            logger.error("Audio device unavailable: %s — running in visual-only mode", exc)
            self.available = False
            return False

    def shutdown(self) -> None:
        """Graceful teardown: fade out, then quit the mixer."""
        with self._lock:
            try:
                if self._current_channel is not None:
                    self._current_channel.fadeout(500)
            except Exception:
                pass
            self._current_channel = None
            self._current_sound = None
        if PYGAME_AVAILABLE:
            try:
                if pygame.mixer.get_init():
                    pygame.mixer.quit()
            except Exception:
                pass
        self.available = False

    # ------------------------------------------------------------- synthesis
    def build_sound(self, freq: float, lfo_rate: float = 0.1, duration: float = 6.0):
        """Render a seamless-loop stereo buffer for `freq` and wrap as Sound."""
        sr = self.sample_rate
        cycles = max(1, int(round(freq * duration)))  # integer cycles → seamless
        dur = cycles / freq
        n = int(sr * dur)
        t = np.arange(n) / sr
        two_pi = 2.0 * np.pi

        core = np.sin(two_pi * freq * t)
        sub = np.sin(two_pi * freq * 0.5 * t)
        fifth = np.sin(two_pi * freq * 1.5 * t)
        octave = (2.0 / np.pi) * np.arcsin(np.sin(two_pi * freq * 2.0 * t))  # triangle

        rng = np.random.default_rng(int(freq * 100))
        shimmer = rng.normal(0.0, 1.0, n) * 0.02

        lfo_cycles = max(1, int(round(lfo_rate * dur)))
        envelope = 0.74 + 0.26 * np.sin(two_pi * lfo_cycles * t / dur)

        mix = (0.50 * core + 0.22 * sub + 0.13 * fifth + 0.07 * octave + shimmer) * envelope
        peak = float(np.max(np.abs(mix))) or 1.0
        mix = mix / peak * 0.82

        pcm = (mix * 32767).astype(np.int16)
        stereo = np.ascontiguousarray(np.column_stack((pcm, pcm)))
        return pygame.sndarray.make_sound(stereo)

    # ------------------------------------------------------------ transport
    def transition_to(self, freq: float, lfo_rate: float = 0.1, fade_ms: int = 2600) -> bool:
        """Crossfade to a new frequency layer."""
        if not self.available:
            return False
        with self._lock:
            try:
                sound = self.build_sound(freq, lfo_rate)
                old_channel = self._current_channel
                channel = sound.play(loops=-1, fade_ms=fade_ms)
                if channel is None:
                    logger.error("No free audio channel for crossfade")
                    return False
                channel.set_volume(self.volume)
                if old_channel is not None:
                    try:
                        old_channel.fadeout(fade_ms)
                    except Exception:
                        pass
                self._current_sound = sound
                self._current_channel = channel
                return True
            except Exception as exc:
                logger.error("Audio transition failed: %s", exc)
                return False

    def set_volume(self, volume: float) -> None:
        self.volume = max(0.0, min(1.0, float(volume)))
        with self._lock:
            if self._current_channel is not None:
                try:
                    self._current_channel.set_volume(self.volume)
                except Exception:
                    pass

    def stop(self, fade_ms: int = 800) -> None:
        with self._lock:
            if self._current_channel is not None:
                try:
                    self._current_channel.fadeout(fade_ms)
                except Exception:
                    pass
