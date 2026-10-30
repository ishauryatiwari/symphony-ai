"""Threaded webcam emotion detector: OpenCV capture + DeepFace analysis.

Design notes
------------
* Capture runs on its own daemon thread so Flask is never blocked.
* DeepFace is expensive — frames are only analyzed every
  `analyze_interval` seconds, never per-frame.
* Missing webcam / missing DeepFace / per-frame analysis errors are all
  handled gracefully: the detector simply reports unavailability and the
  rest of the application keeps working.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, Optional

try:
    import cv2  # type: ignore

    CV2_AVAILABLE = True
except ImportError:  # pragma: no cover
    cv2 = None
    CV2_AVAILABLE = False

logger = logging.getLogger("symphony.camera")


class EmotionDetector(threading.Thread):
    """Background thread producing `{emotion, confidence, timestamp}` readings."""

    def __init__(self, camera_index: int = 0, analyze_interval: float = 1.5):
        super().__init__(daemon=True, name="emotion-detector")
        self.camera_index = camera_index
        self.analyze_interval = analyze_interval

        self._stop = threading.Event()
        self._lock = threading.RLock()
        self._last_ts = 0.0
        self._consumed_ts = -1.0
        self._deepface: Any = None

        self.latest: Optional[Dict[str, Any]] = None
        self.available = False
        self.deepface_ready = False
        self.error: Optional[str] = None

    # ------------------------------------------------------------ lifecycle
    def run(self) -> None:  # noqa: D102 (thread entry)
        if not CV2_AVAILABLE:
            logger.error("OpenCV is not installed — camera disabled (pip install opencv-python)")
            self.error = "opencv-missing"
            return

        cap = None
        try:
            cap = cv2.VideoCapture(self.camera_index)
            if not cap.isOpened():
                logger.error("Webcam unavailable at index %s — try CAMERA_INDEX=1", self.camera_index)
                self.error = "webcam-unavailable"
                return

            self.available = True
            logger.info("Camera initialized (index %s)", self.camera_index)
            self._load_deepface()

            last_analyze = 0.0
            read_failures = 0
            while not self._stop.is_set():
                ret, frame = cap.read()
                if not ret:
                    read_failures += 1
                    if read_failures > 90:
                        logger.error("Camera stream lost")
                        self.available = False
                        self.error = "stream-lost"
                        break
                    time.sleep(0.05)
                    continue
                read_failures = 0

                now = time.time()
                if self.deepface_ready and now - last_analyze >= self.analyze_interval:
                    last_analyze = now
                    self._analyze(frame)
                else:
                    time.sleep(0.03)  # don't burn CPU between analysis windows
        except Exception as exc:  # never let the thread die loudly
            logger.error("Camera thread error: %s", exc)
            self.error = str(exc)
        finally:
            if cap is not None:
                cap.release()
            self.available = False

    def stop(self) -> None:
        """Signal the capture loop to exit."""
        self._stop.set()

    # ------------------------------------------------------------- analysis
    def _load_deepface(self) -> None:
        try:
            logger.info("Loading DeepFace emotion model (first run may download weights)…")
            from deepface import DeepFace  # type: ignore

            self._deepface = DeepFace
            self.deepface_ready = True
            logger.info("DeepFace ready")
        except Exception as exc:
            logger.error("DeepFace failed to load: %s — detection disabled", exc)
            self.error = "deepface-load-failed"

    def _analyze(self, frame: Any) -> None:
        try:
            results = self._deepface.analyze(
                img_path=frame,
                actions=["emotion"],
                detector_backend="opencv",
                enforce_detection=False,
                silent=True,
            )
        except Exception as exc:
            # Logged at debug level: per-frame failures must not spam the terminal.
            logger.debug("DeepFace analysis error: %s", exc)
            return

        if isinstance(results, dict):
            results = [results]
        if not results:
            self._publish({"face_detected": False, "emotion": None, "confidence": 0.0,
                           "timestamp": int(time.time() * 1000)})
            return

        # Prefer the largest detected face.
        best = max(results, key=lambda r: (r.get("region") or {}).get("w", 0))
        dominant = best.get("dominant_emotion")
        scores = best.get("emotion") or {}
        confidence = float(scores.get(dominant, 0.0))
        self._publish({
            "face_detected": True,
            "emotion": dominant,
            "confidence": round(confidence, 1),
            "timestamp": int(time.time() * 1000),
        })

    # -------------------------------------------------------------- plumbing
    def _publish(self, reading: Dict[str, Any]) -> None:
        with self._lock:
            self.latest = reading
            self._last_ts = time.time()

    def read_new(self) -> Optional[Dict[str, Any]]:
        """Return the newest reading exactly once (None until the next one)."""
        with self._lock:
            if self.latest is not None and self._last_ts != self._consumed_ts:
                self._consumed_ts = self._last_ts
                return self.latest
            return None

    def status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "available": self.available,
                "deepface_ready": self.deepface_ready,
                "latest": self.latest,
                "error": self.error,
            }
