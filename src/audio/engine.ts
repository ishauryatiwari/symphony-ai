import { STATE_META } from "../data/states";
import type { StateId } from "../types";

interface VoiceGraph {
  input: GainNode;
  stop: () => void;
}

/**
 * SoundscapeEngine — real-time adaptive synth built on the Web Audio API.
 *
 * Each emotional state owns a layered voice:
 *   SUB (f/2 sine) · CORE (f sine ×2 detuned) · FIFTH (f·1.5) · AIR (f·2 triangle) · NOISE shimmer
 * with a slow amplitude LFO ("breathing") tuned per state. State changes
 * crossfade over ~3 seconds — the outgoing voice is ramped down while the
 * incoming one blooms, so transitions are never harsh.
 *
 * Frequencies are solfeggio-inspired creative tuning choices
 * (432 calm · 528 happy · 639 energy), not medical interventions.
 */
export class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private active: VoiceGraph | null = null;
  private activeState: StateId | null = null;
  private volume = 0.55;
  private fadedOut = false;
  available = true;

  get running() {
    return this.ctx !== null;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  async init(): Promise<boolean> {
    if (this.ctx) return true;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error("Web Audio unsupported");
      this.ctx = new Ctor();
      await this.ctx.resume();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.fadedOut ? 0 : this.volume;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.82;
      this.master.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      return true;
    } catch (err) {
      console.warn("[AI Symphony] audio init failed", err);
      this.available = false;
      return false;
    }
  }

  private noiseBuffer(seconds = 2): AudioBuffer | null {
    if (!this.ctx) return null;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private buildVoice(state: StateId): VoiceGraph | null {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return null;
    const meta = STATE_META[state];
    const f = meta.frequency;

    const input = ctx.createGain();
    input.gain.value = 0;
    input.connect(master);

    const stops: Array<() => void> = [];
    const osc = (
      type: OscillatorType,
      freq: number,
      gain: number,
      detuneCents = 0,
    ) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detuneCents;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g);
      g.connect(input);
      o.start();
      stops.push(() => { try { o.stop(); o.disconnect(); g.disconnect(); } catch { /* noop */ } });
      return o;
    };

    // harmonic stack — gentle, consonant, loop-free
    osc("sine", f / 2, 0.2); // sub foundation
    osc("sine", f, 0.3); // core tone
    osc("sine", f, 0.13, meta.detune); // detuned twin → slow beating
    osc("sine", f * 1.5, 0.09); // perfect fifth
    osc("triangle", f * 2, 0.045); // airy octave

    // filtered noise shimmer (breath / room tone)
    const noise = this.noiseBuffer();
    if (noise) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f * 3;
      bp.Q.value = 0.7;
      const ng = ctx.createGain();
      ng.gain.value = 0.02;
      src.connect(bp);
      bp.connect(ng);
      ng.connect(input);
      src.start();
      stops.push(() => { try { src.stop(); src.disconnect(); bp.disconnect(); ng.disconnect(); } catch { /* noop */ } });
    }

    // breathing LFO summed into the voice gain (AudioParams sum connections)
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = meta.lfoRate;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.13;
    lfo.connect(lfoDepth);
    lfoDepth.connect(input.gain);
    lfo.start();
    stops.push(() => { try { lfo.stop(); lfo.disconnect(); lfoDepth.disconnect(); } catch { /* noop */ } });

    return { input, stop: () => stops.forEach((s) => s()) };
  }

  /** Crossfade to a new state. fade seconds ≈ transition time. */
  setState(state: StateId, fade = 2.8) {
    const ctx = this.ctx;
    if (!ctx || state === this.activeState) return;
    const voice = this.buildVoice(state);
    if (!voice) return;

    const tau = Math.max(0.05, fade / 4);
    const now = ctx.currentTime;
    voice.input.gain.setTargetAtTime(1, now, tau);

    const old = this.active;
    if (old) {
      old.input.gain.cancelScheduledValues(now);
      old.input.gain.setTargetAtTime(0, now, tau * 0.8);
      window.setTimeout(() => old.stop(), fade * 1000 + 400);
    }
    this.active = voice;
    this.activeState = state;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.master && !this.fadedOut) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08);
    }
  }

  fadeOut(seconds = 0.9) {
    if (!this.ctx || !this.master) return;
    this.fadedOut = true;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, seconds / 4);
  }

  fadeIn(seconds = 1.2) {
    if (!this.ctx || !this.master) return;
    this.fadedOut = false;
    this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, seconds / 4);
  }

  /** Band energies (0..1) for UI meters — [sub, core, fifth, air]. */
  bandLevels(out: Float32Array): boolean {
    if (!this.analyser || this.fadedOut) return false;
    const bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(bins);
    const hzPerBin = (this.ctx?.sampleRate ?? 44100) / this.analyser.fftSize;
    const band = (from: number, to: number) => {
      const a = Math.max(0, Math.floor(from / hzPerBin));
      const b = Math.min(bins.length - 1, Math.ceil(to / hzPerBin));
      let sum = 0;
      for (let i = a; i <= b; i++) sum += bins[i];
      return sum / ((b - a + 1) * 255);
    };
    out[0] = band(40, 260);
    out[1] = band(380, 560);
    out[2] = band(600, 1000);
    out[3] = band(1000, 2600);
    return true;
  }

  suspend() {
    void this.ctx?.suspend();
  }
}
