/** Shared type definitions for AI Symphony. */

export type StateId = "calm" | "happy" | "energy";
export type EmotionName =
  | "angry"
  | "fear"
  | "sad"
  | "happy"
  | "neutral"
  | "disgust"
  | "surprise";

export interface EmotionReading {
  emotion: EmotionName;
  confidence: number; // 0..100
  timestamp: number; // ms epoch
}

export interface StabilityResult {
  changed: boolean;
  emotion: EmotionName | null;
  /** consecutive matching observations, capped at `required` */
  progress: number;
}

export interface Affirmation {
  text: string;
  source: "ollama" | "fallback";
  model?: string;
}

export type BackendStatus = "checking" | "online" | "offline";
export type CameraStatus = "checking" | "on" | "unavailable";
export type AudioStatus = "idle" | "running" | "paused" | "unavailable";
export type Mode = "auto" | "manual";
export type EmotionSource = "backend" | "sim";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "SYS";

export interface LogLine {
  id: number;
  t: string; // HH:MM:SS
  level: LogLevel;
  msg: string;
  origin: "ui" | "core";
}

export interface BackendStatePayload {
  mode: Mode;
  emotion: EmotionName | null;
  confidence: number;
  target_state: StateId;
  frequency: number;
  stability: number;
  ollama: boolean;
  ollama_model?: string;
  camera: boolean;
  audio: boolean;
}
