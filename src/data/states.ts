import type { EmotionName, StateId } from "../types";

/**
 * Emotion → target soundscape mapping (mirrors backend/state/emotion_state.py).
 *   ANGRY / FEARFUL → CALM · SAD → HAPPY · NEUTRAL / HAPPY → ENERGY
 */
export const EMOTION_TO_STATE: Record<EmotionName, StateId> = {
  angry: "calm",
  fear: "calm",
  sad: "happy",
  neutral: "energy",
  happy: "energy",
  disgust: "calm",
  surprise: "energy",
};

export interface StateMeta {
  id: StateId;
  label: string;
  frequency: number; // Hz — creative solfeggio-inspired tuning, not a medical claim
  color: string;
  color2: string;
  tagline: string;
  lfoRate: number; // breathing rate of the synth voice, Hz
  detune: number; // cents of beating between the twin core oscillators
  goal: string;
}

export const STATE_META: Record<StateId, StateMeta> = {
  calm: {
    id: "calm",
    label: "CALM",
    frequency: 432,
    color: "#22d3ee",
    color2: "#2dd4bf",
    tagline: "GROUNDING DRIFT",
    lfoRate: 0.07,
    detune: 2.5,
    goal: "a calmer, steadier state",
  },
  happy: {
    id: "happy",
    label: "HAPPY",
    frequency: 528,
    color: "#fbbf24",
    color2: "#fb923c",
    tagline: "UPLIFTING RISE",
    lfoRate: 0.14,
    detune: 4,
    goal: "a lighter, more hopeful state",
  },
  energy: {
    id: "energy",
    label: "ENERGY",
    frequency: 639,
    color: "#a3e635",
    color2: "#34d399",
    tagline: "POSITIVE VOLTAGE",
    lfoRate: 0.27,
    detune: 6,
    goal: "an energized, positively connected state",
  },
};

export const STATE_ORDER: StateId[] = ["calm", "happy", "energy"];

export const FREQUENCY_RANGE = { min: 396, max: 680 } as const;

export const SIM_EMOTIONS: EmotionName[] = ["angry", "fear", "sad", "happy", "neutral"];

export const EMOTION_LABEL: Record<EmotionName, string> = {
  angry: "ANGER",
  fear: "FEAR",
  sad: "SADNESS",
  happy: "HAPPY",
  neutral: "NEUTRAL",
  disgust: "DISGUST",
  surprise: "SURPRISE",
};
