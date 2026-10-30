#!/usr/bin/env python3
"""AI Symphony — entry point.

Usage:
    python run.py [--host 0.0.0.0] [--port 5000]

Boots the full stack: camera thread, Ollama watchdog, audio engine,
conductor loop and the Flask API + UI on http://localhost:5000
"""

from __future__ import annotations

import argparse
import logging
import sys

BANNER = r"""
    ░█▀█░█░░░░░█▀▀░▀█▀░█░█░░░█▀▀░█░█░█▀▄▀█░█▀▀░█▀▄░█░█
    ░█▀█░█░░▄▀░▀▀█░░█░░▄▀▄░░░▀▀█░█▄█░█░▀░█░█▀▀░█▀▄░░█░
    ░▀░▀░▀▀░▀░░░▀▀▀░░▀░░▀░▀░░░▀▀▀░▀░▀░▀░░░▀░▀▀▀░▀░▀░░▀░
        ADAPTIVE EMOTIONAL SOUNDSCAPE · LOCAL-FIRST
"""


def setup_logging(ring) -> None:
    """Uniform '[LEVEL] message' logs on stdout + ring buffer for the UI."""
    fmt = logging.Formatter("[%(levelname)s] %(message)s")
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    stream = logging.StreamHandler()
    stream.setFormatter(fmt)
    ring.setFormatter(fmt)

    root_logger.addHandler(stream)
    root_logger.addHandler(ring)

    for noisy in ("werkzeug", "urllib3", "PIL", "h5py", "numba"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def main() -> int:
    parser = argparse.ArgumentParser(description="AI Symphony — adaptive emotional soundscape")
    parser.add_argument("--host", default=None, help="bind address (default from env/HOST)")
    parser.add_argument("--port", type=int, default=None, help="port (default from env/PORT)")
    args = parser.parse_args()

    print(BANNER)

    try:
        from backend.app import RingLogHandler, SymphonyCore, create_app
        from backend.config import Config
    except ImportError as exc:
        print(f"[ERROR] Missing dependency: {exc}")
        print("        Run: pip install -r requirements.txt")
        return 1

    config = Config.from_env()
    ring = RingLogHandler()
    setup_logging(ring)
    boot_log = logging.getLogger("symphony.boot")

    boot_log.info("Config: model=%s · camera=%d · stability=%d frames · threshold=%.0f%%",
                  config.ollama_model, config.camera_index,
                  config.emotion_stability_frames, config.confidence_threshold)

    core = SymphonyCore(config)
    app = create_app(core, ring)
    core.start()

    host = args.host or config.host
    port = args.port or config.port
    boot_log.info("UI ready → http://localhost:%d", port)
    boot_log.info("Press keys 1–4 in the UI: CALM / HAPPY / ENERGY / AUTO")

    try:
        app.run(host=host, port=port, threaded=True, debug=False, use_reloader=False)
    except KeyboardInterrupt:
        pass
    finally:
        core.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
