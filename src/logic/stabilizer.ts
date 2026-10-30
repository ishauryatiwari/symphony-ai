import type { EmotionName, EmotionReading, StabilityResult } from "../types";

/**
 * EmotionStabilizer — hysteresis filter that prevents the soundscape from
 * switching on every flicker of expression.
 *
 * A new emotion only becomes "stable" after it has been observed
 * `required` consecutive times AND each observation clears the
 * confidence threshold. Mirrors backend/state/emotion_state.py.
 */
export class EmotionStabilizer {
  private last: EmotionName | null = null;
  private count = 0;
  stable: EmotionName | null = null;

  constructor(
    private required = 3,
    private threshold = 55,
  ) {}

  push(reading: EmotionReading): StabilityResult {
    if (reading.confidence < this.threshold) {
      return { changed: false, emotion: this.stable, progress: this.count };
    }
    if (reading.emotion === this.last) {
      this.count = Math.min(this.count + 1, this.required);
    } else {
      this.last = reading.emotion;
      this.count = 1;
    }
    if (this.count >= this.required && this.last !== this.stable) {
      this.stable = this.last;
      return { changed: true, emotion: this.stable, progress: this.count };
    }
    return { changed: false, emotion: this.stable, progress: this.count };
  }

  reset() {
    this.last = null;
    this.count = 0;
    this.stable = null;
  }
}
