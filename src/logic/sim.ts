import type { EmotionName, EmotionReading } from "../types";

interface ScriptStep {
  emotion: EmotionName;
  /** ticks this expression holds (≈ seconds ÷ 1.6) */
  ticks: number;
  conf: number;
}

/**
 * EmotionSimulator — drives the AUTO pipeline when the Python core
 * (OpenCV + DeepFace) is not connected. It plays a believable scripted
 * sequence of expressions with confidence jitter, and supports manual
 * "demo triggers" that inject an emotion for a few frames — exactly the
 * way the real stabilizer would consume camera observations.
 */
const SCRIPT: ScriptStep[] = [
  { emotion: "neutral", ticks: 8, conf: 74 },
  { emotion: "happy", ticks: 7, conf: 86 },
  { emotion: "sad", ticks: 8, conf: 79 },
  { emotion: "angry", ticks: 7, conf: 83 },
  { emotion: "neutral", ticks: 6, conf: 71 },
  { emotion: "fear", ticks: 7, conf: 76 },
  { emotion: "happy", ticks: 8, conf: 88 },
];

export class EmotionSimulator {
  private idx = 0;
  private left = SCRIPT[0].ticks;
  private injected: { emotion: EmotionName; frames: number } | null = null;

  inject(emotion: EmotionName, frames = 5) {
    this.injected = { emotion, frames };
  }

  next(): EmotionReading {
    let emotion: EmotionName;
    let conf: number;

    if (this.injected && this.injected.frames > 0) {
      emotion = this.injected.emotion;
      conf = 82 + Math.random() * 12;
      this.injected.frames -= 1;
      if (this.injected.frames === 0) {
        // resume script cleanly at current step
        this.left = Math.max(this.left, 3);
        this.injected = null;
      }
    } else {
      const step = SCRIPT[this.idx];
      emotion = step.emotion;
      conf = step.conf + (Math.random() * 10 - 5);
      this.left -= 1;
      if (this.left <= 0) {
        this.idx = (this.idx + 1) % SCRIPT.length;
        this.left = SCRIPT[this.idx].ticks;
      }
    }
    return {
      emotion,
      confidence: Math.round(Math.min(97, Math.max(58, conf)) * 10) / 10,
      timestamp: Date.now(),
    };
  }
}
