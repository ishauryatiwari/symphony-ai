"""Conceptual controller for the browser-side YouTube ambience layer.

Actual playback happens in the browser through the YouTube IFrame Player
API (see `frontend/app.js`). The backend only advertises the playlists
and mirrors playback intent, which keeps the fallback chain honest:

    YouTube (browser) → local synthesized soundscape → silent + visuals

A YouTube failure can therefore never take the application down.
Swap the video IDs for any ambient playlists you have rights to use.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger("symphony.music")

PLAYLISTS: Dict[str, Dict[str, Any]] = {
    "calm": {"video_ids": ["1ZYbU82GVz4", "jfKfPfyJRdk"], "title": "Weightless · ambient drift"},
    "happy": {"video_ids": ["jfKfPfyJRdk", "1ZYbU82GVz4"], "title": "Lofi · uplift session"},
    "energy": {"video_ids": ["jfKfPfyJRdk", "1ZYbU82GVz4"], "title": "Lofi · upbeat current"},
}


class PlaylistController:
    """State-aware facade over the browser music layer (never crashes)."""

    def __init__(self) -> None:
        self.active: Optional[str] = None
        self.paused = False

    def playlists(self) -> Dict[str, Dict[str, Any]]:
        return PLAYLISTS

    def play(self, state: str) -> bool:
        if state not in PLAYLISTS:
            logger.warning("Unknown playlist state: %s", state)
            return False
        self.active = state
        self.paused = False
        logger.info("Music layer play → %s", state.upper())
        return True

    def pause(self) -> None:
        self.paused = True
        logger.info("Music layer paused")

    def fade_in(self, seconds: float = 2.0) -> None:
        logger.debug("Music layer fade-in over %.1fs (executed in browser)", seconds)

    def fade_out(self, seconds: float = 2.0) -> None:
        logger.debug("Music layer fade-out over %.1fs (executed in browser)", seconds)

    def switch_state(self, state: str) -> None:
        if state in PLAYLISTS:
            self.active = state
            logger.info("Music layer → %s playlist", state.upper())

    def status(self) -> Dict[str, Any]:
        return {"active": self.active, "paused": self.paused, "engine": "youtube-iframe (browser)"}
