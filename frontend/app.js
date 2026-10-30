/* =====================================================================
   AI SYMPHONY · zero-build frontend logic
   Backend-linked mode  ⇄  solo mode (simulated inference + local synth)
   Fallback chain: YouTube layer → Web Audio synth → visual-only.
   ===================================================================== */
"use strict";

/* ------------------------------------------------------------- data -- */
const STATES = {
  calm:   { label: "CALM",   freq: 432, color: "#22d3ee", color2: "#2dd4bf", tagline: "GROUNDING DRIFT",  lfo: 0.07, detune: 2.5 },
  happy:  { label: "HAPPY",  freq: 528, color: "#fbbf24", color2: "#fb923c", tagline: "UPLIFTING RISE",   lfo: 0.14, detune: 4 },
  energy: { label: "ENERGY", freq: 639, color: "#a3e635", color2: "#34d399", tagline: "POSITIVE VOLTAGE", lfo: 0.27, detune: 6 },
};
const EMOTION_TO_STATE = { angry: "calm", fear: "calm", sad: "happy", neutral: "energy", happy: "energy", disgust: "calm", surprise: "energy" };
const EMOTION_LABEL = { angry: "ANGER", fear: "FEAR", sad: "SADNESS", happy: "HAPPY", neutral: "NEUTRAL", disgust: "DISGUST", surprise: "SURPRISE" };
const SIM_EMOTIONS = ["angry", "fear", "sad", "happy", "neutral"];
const AFFIRMATIONS = {
  calm: [
    "Take a slow breath and give yourself a moment before reacting. You do not have to solve everything at once.",
    "You are here in this moment, and you can take it one breath at a time. Let your shoulders relax and allow yourself a little space.",
    "Let your shoulders drop and your breathing slow. Calm is not something you chase — it is something you allow.",
  ],
  happy: [
    "This moment does not define your whole story. Give yourself permission to move forward one small step at a time.",
    "A little lightness is allowed, even on heavy days. Let this small spark remind you that brighter moments are real.",
  ],
  energy: [
    "Hold onto this positive energy and let it carry you forward. You have the opportunity to make this moment meaningful.",
    "Your energy is a current — point it at one thing you care about. Small momentum becomes big motion.",
  ],
};
const YT_IDS = { calm: "1ZYbU82GVz4", happy: "jfKfPfyJRdk", energy: "jfKfPfyJRdk" };
const affCursor = { calm: 0, happy: 0, energy: 0 };

/* ----------------------------------------------------- stabilizer ---- */
class Stabilizer {
  constructor(required = 3, threshold = 55) { this.required = required; this.threshold = threshold; this.last = null; this.count = 0; this.stable = null; }
  push(r) {
    if (r.confidence < this.threshold) return { changed: false, progress: this.count };
    if (r.emotion === this.last) this.count = Math.min(this.count + 1, this.required);
    else { this.last = r.emotion; this.count = 1; }
    if (this.count >= this.required && this.last !== this.stable) { this.stable = this.last; return { changed: true, progress: this.count }; }
    return { changed: false, progress: this.count };
  }
}

/* ---------------------------------------------------- simulator ------ */
const SCRIPT = [
  ["neutral", 8, 74], ["happy", 7, 86], ["sad", 8, 79], ["angry", 7, 83],
  ["neutral", 6, 71], ["fear", 7, 76], ["happy", 8, 88],
];
class Simulator {
  constructor() { this.idx = 0; this.left = SCRIPT[0][1]; this.injected = null; }
  inject(e, frames = 5) { this.injected = { e, frames }; }
  next() {
    let emotion, conf;
    if (this.injected && this.injected.frames > 0) {
      emotion = this.injected.e; conf = 82 + Math.random() * 12;
      if (--this.injected.frames === 0) { this.left = Math.max(this.left, 3); this.injected = null; }
    } else {
      const [e, ticks, c] = SCRIPT[this.idx];
      emotion = e; conf = c + (Math.random() * 10 - 5);
      if (--this.left <= 0) { this.idx = (this.idx + 1) % SCRIPT.length; this.left = SCRIPT[this.idx][1]; }
    }
    return { emotion, confidence: Math.round(Math.min(97, Math.max(58, conf)) * 10) / 10, timestamp: Date.now() };
  }
}

/* --------------------------------------------------- audio engine ---- */
class Soundscape {
  constructor() { this.ctx = null; this.master = null; this.analyser = null; this.active = null; this.activeState = null; this.volume = 0.55; this.faded = false; }
  async init() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("no web audio");
      this.ctx = new AC();
      await this.ctx.resume();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.faded ? 0 : this.volume;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.82;
      this.master.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      return true;
    } catch (err) { console.warn("audio init failed", err); return false; }
  }
  build(state) {
    const ctx = this.ctx, meta = STATES[state], f = meta.freq;
    const input = ctx.createGain(); input.gain.value = 0; input.connect(this.master);
    const stops = [];
    const osc = (type, freq, gain, det = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq; o.detune.value = det; g.gain.value = gain;
      o.connect(g); g.connect(input); o.start();
      stops.push(() => { try { o.stop(); o.disconnect(); g.disconnect(); } catch (_) {} });
    };
    osc("sine", f / 2, 0.2); osc("sine", f, 0.3); osc("sine", f, 0.13, meta.detune);
    osc("sine", f * 1.5, 0.09); osc("triangle", f * 2, 0.045);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 3; bp.Q.value = 0.7;
    const ng = ctx.createGain(); ng.gain.value = 0.02;
    src.connect(bp); bp.connect(ng); ng.connect(input); src.start();
    stops.push(() => { try { src.stop(); src.disconnect(); bp.disconnect(); ng.disconnect(); } catch (_) {} });
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = meta.lfo; depth.gain.value = 0.13;
    lfo.connect(depth); depth.connect(input.gain); lfo.start();
    stops.push(() => { try { lfo.stop(); lfo.disconnect(); depth.disconnect(); } catch (_) {} });
    return { input, stop: () => stops.forEach((s) => s()) };
  }
  setState(state, fade = 2.8) {
    if (!this.ctx || state === this.activeState) return;
    const voice = this.build(state);
    const now = this.ctx.currentTime, tau = Math.max(0.05, fade / 4);
    voice.input.gain.setTargetAtTime(1, now, tau);
    if (this.active) {
      const old = this.active;
      old.input.gain.setTargetAtTime(0, now, tau * 0.8);
      setTimeout(() => old.stop(), fade * 1000 + 400);
    }
    this.active = voice; this.activeState = state;
  }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); if (this.ctx && this.master && !this.faded) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08); }
  fadeOut(s = 0.9) { if (this.ctx && this.master) { this.faded = true; this.master.gain.setTargetAtTime(0, this.ctx.currentTime, s / 4); } }
  fadeIn(s = 1.2) { if (this.ctx && this.master) { this.faded = false; this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, s / 4); } }
}

/* --------------------------------------------------------------- dom - */
const $ = (id) => document.getElementById(id);
const dom = {
  ledCore: $("led-core"), chipCore: $("chip-core"), ledVision: $("led-vision"), chipVision: $("chip-vision"),
  ledLlm: $("led-llm"), chipLlm: $("chip-llm"), ledAudio: $("led-audio"), chipAudio: $("chip-audio"),
  chipMode: $("chip-mode"), chipModeText: $("chip-mode-text"), toast: $("toast"),
  video: $("video"), scanBeam: $("scan-beam"), feedFallback: $("feed-fallback"), recBadge: $("rec-badge"), recText: $("rec-text"),
  pips: $("pips"), detectNone: $("detect-none"), detectLive: $("detect-live"), emotionWord: $("emotion-word"),
  confidence: $("confidence"), confFill: $("conf-fill"), detectSrc: $("detect-src"), mapping: $("mapping"), mappingTarget: $("mapping-target"),
  simTriggers: $("sim-triggers"), triggerRow: $("trigger-row"),
  srcTag: $("src-tag"), stateTagline: $("state-tagline"), stateWord: $("state-word"),
  autoSub: $("auto-sub"),
  ticks: $("ticks"), arc: $("arc"), needle: $("needle"), freqNum: $("freq-num"),
  provEmo: $("prov-emo"), provConf: $("prov-conf"), provTarget: $("prov-target"),
  tabs: { calm: $("tab-calm"), happy: $("tab-happy"), energy: $("tab-energy") },
  transBanner: $("transition-banner"), transTarget: $("transition-target"),
  affSource: $("aff-source"), affText: $("aff-text"),
  soundStatus: $("sound-status"), soundIdle: $("sound-idle"), btnInit: $("btn-init"),
  soundLive: $("sound-live"), btnPlay: $("btn-play"), icoPause: $("ico-pause"), icoPlay: $("ico-play"),
  volNum: $("vol-num"), volume: $("volume"), crossfade: $("crossfade"), cfFrom: $("cf-from"), cfTo: $("cf-to"),
  layers: [$("lv-sub"), $("lv-core"), $("lv-fifth"), $("lv-air")], soundNote: $("sound-note"),
  ytSwitch: $("yt-switch"), ytHost: $("yt-host"), ytOff: $("yt-off"), ytTitle: $("yt-title"), ytStatus: $("yt-status"),
  logScroll: $("log-scroll"), logCount: $("log-count"),
  vizFreq: $("viz-freq"), vizState: $("viz-state"), canvas: $("visualizer"),
};

/* ------------------------------------------------------------- state - */
const app = {
  backend: "checking", mode: "auto", stateId: "calm", emotion: null,
  audio: "idle", camera: "checking", source: "sim", coreAudio: false,
  volume: 0.55, logTotal: 0, logLines: 0,
};
const engine = new Soundscape();
const stabilizer = new Stabilizer(3, 55);
const simulator = new Simulator();
let transTimer = null, toastTimer = null, affTimer = null;

/* ----------------------------------------------------------- helpers - */
const stamp = () => new Date().toTimeString().slice(0, 8);
function setLed(el, color, pulse = false) { el.style.color = color; el.classList.toggle("led-pulse", pulse); }

function pushLog(level, msg, origin = "ui") {
  const line = document.createElement("div");
  line.className = "log-line";
  const colors = { INFO: "#93a3c4", WARN: "#fbbf24", ERROR: "#fb7185", SYS: "#22d3ee" };
  line.innerHTML =
    `<span class="lt">${stamp()}</span><span class="ll" style="color:${colors[level] || colors.INFO}">[${level}]</span>` +
    (origin === "core" ? '<span class="lo">core:</span>' : "") +
    `<span class="lm"></span>`;
  line.querySelector(".lm").textContent = msg;
  dom.logScroll.appendChild(line);
  while (dom.logScroll.children.length > 90) dom.logScroll.removeChild(dom.logScroll.firstChild);
  dom.logScroll.scrollTop = dom.logScroll.scrollHeight;
  app.logLines++;
  dom.logCount.textContent = `${app.logLines} EVT`;
}

function toast(msg) {
  dom.toast.textContent = msg;
  dom.toast.hidden = false;
  dom.toast.style.animation = "none";
  void dom.toast.offsetWidth; // restart animation
  dom.toast.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 2600);
}

/* ------------------------------------------------------- affirmation - */
function typewrite(text) {
  clearInterval(affTimer);
  dom.affText.textContent = "";
  const caret = document.createElement("span"); caret.className = "caret";
  let i = 0;
  affTimer = setInterval(() => {
    i = Math.min(text.length, i + 2);
    dom.affText.textContent = text.slice(0, i);
    dom.affText.appendChild(caret);
    if (i >= text.length) { clearInterval(affTimer); setTimeout(() => caret.remove(), 1200); }
  }, 14);
}

function setAffSource(kind, model) {
  const map = {
    generating: ["#fbbf24", "GENERATING", true],
    ollama: ["#34d399", `OLLAMA · ${(model || "llama3.2").toUpperCase()}`, false],
    fallback: ["#fbbf24", app.backend === "online" ? "FALLBACK BANK" : "LOCAL BANK", false],
  };
  const [color, label, pulse] = map[kind] || map.fallback;
  dom.affSource.style.color = color;
  dom.affSource.style.borderColor = color + "55";
  dom.affSource.innerHTML = `<span class="led" style="color:${color};${pulse ? "animation:ledPulse 1.8s ease-in-out infinite" : ""}"></span>${label}`;
}

async function fetchAffirmation(state) {
  setAffSource("generating");
  pushLog("INFO", "Generating affirmation");
  if (app.backend === "online") {
    try {
      const res = await fetch(`/api/affirmation?state=${state}`);
      if (res.ok) {
        const data = await res.json();
        setAffSource(data.source, data.model);
        typewrite(data.text);
        return;
      }
    } catch (_) { /* fall through to local bank */ }
  }
  setTimeout(() => {
    const bank = AFFIRMATIONS[state];
    const text = bank[affCursor[state] % bank.length];
    affCursor[state]++;
    setAffSource("fallback");
    typewrite(text);
  }, 650 + Math.random() * 500);
}

/* --------------------------------------------------------- render ---- */
function angleFor(freq) { return -90 + ((freq - 396) / (680 - 396)) * 180; }

function renderState(meta, animate) {
  document.body.dataset.state = app.stateId;
  dom.stateWord.textContent = meta.label;
  dom.stateTagline.textContent = meta.tagline;
  dom.freqNum.textContent = meta.freq;
  dom.vizFreq.textContent = `${meta.freq} Hz`;
  dom.vizState.textContent = meta.label;
  if (animate) {
    dom.stateWord.classList.remove("flash");
    void dom.stateWord.offsetWidth;
    dom.stateWord.classList.add("flash");
  }
  const pct = 12 + ((meta.freq - 396) / (680 - 396)) * 88;
  dom.arc.setAttribute("stroke-dasharray", `${pct} ${100 - pct}`);
  dom.needle.style.transform = `rotate(${angleFor(meta.freq)}deg)`;
  dom.freqNum.parentElement.style.animation = "none";
  void dom.freqNum.offsetWidth;
  dom.freqNum.parentElement.style.animation = "";
  for (const s of Object.keys(STATES)) {
    dom.tabs[s].style.background = s === app.stateId ? STATES[s].color : "#141d33";
    dom.tabs[s].style.boxShadow = s === app.stateId ? `0 0 10px ${STATES[s].color}66` : "none";
  }
  dom.provTarget.textContent = meta.label;
  dom.provTarget.style.color = meta.color;
  [...dom.ticks.children].forEach((el) => {
    if (el.dataset && el.dataset.freq) {
      const active = Number(el.dataset.freq) === meta.freq;
      el.setAttribute(el.tagName === "line" ? "stroke" : "fill", active ? "var(--acc)" : el.tagName === "line" ? "#33436a" : "#5b6b8c");
      if (el.tagName === "line") el.setAttribute("stroke-width", active ? "2.4" : "1.2");
    }
  });
  document.querySelectorAll("[data-override]").forEach((b) => {
    const v = b.dataset.override;
    b.classList.toggle("active", v === "auto" ? app.mode === "auto" : app.mode === "manual" && v === app.stateId);
  });
  dom.chipModeText.textContent = app.mode === "auto" ? "AUTO MODE" : "MANUAL";
  dom.chipMode.style.color = app.mode === "auto" ? "var(--acc)" : "#fbbf24";
  dom.autoSub.textContent = app.mode === "auto" ? "EXPRESSION-DRIVEN" : "RESUME AI MODE";
}

function renderEmotion(reading, source, stability, mode) {
  const hasReading = !!reading && !!reading.emotion;
  dom.detectNone.hidden = hasReading;
  dom.detectLive.hidden = !hasReading;
  if (!hasReading) return;
  dom.emotionWord.textContent = EMOTION_LABEL[reading.emotion] || reading.emotion.toUpperCase();
  dom.confidence.innerHTML = `${Math.round(reading.confidence)}<span>%</span>`;
  dom.confFill.style.width = `${reading.confidence}%`;
  dom.detectSrc.textContent = source === "backend" ? "DEEPFACE · OPENCV HAAR" : "SIMULATED INFERENCE · DEMO";
  const target = EMOTION_TO_STATE[reading.emotion];
  dom.mappingTarget.textContent = STATES[target].label;
  dom.mappingTarget.style.color = STATES[target].color;
  dom.mapping.style.visibility = mode === "auto" ? "visible" : "hidden";
  dom.provEmo.textContent = EMOTION_LABEL[reading.emotion] || reading.emotion.toUpperCase();
  dom.provConf.textContent = `${Math.round(reading.confidence)}%`;
  [...dom.pips.children].forEach((p, i) => p.classList.toggle("on", i < stability));
}

function renderChips() {
  setLed(dom.ledCore, app.backend === "online" ? "#34d399" : app.backend === "checking" ? "#fbbf24" : "#fb7185", app.backend === "online");
  dom.chipCore.textContent = app.backend === "online" ? "LINKED" : app.backend === "checking" ? "PROBING" : "SOLO";
  setLed(dom.ledVision, app.camera === "on" ? (app.source === "sim" ? "#fbbf24" : "#34d399") : app.camera === "checking" ? "#fbbf24" : "#fb7185", app.camera === "on");
  dom.chipVision.textContent = app.camera === "on" ? (app.source === "sim" ? "SIM" : "LIVE") : app.camera === "checking" ? "…" : "OFF";
  dom.recText.textContent = app.source === "sim" ? "SIM" : "REC";
  dom.recBadge.style.color = app.source === "sim" ? "#fbbf24" : "#fb7185";
  setLed(dom.ledLlm, "#fbbf24");
  dom.chipLlm.textContent = app.backend === "online" ? (app.ollama ? app.ollamaModel.toUpperCase().slice(0, 9) : "FALLBACK") : "LOCAL BANK";
  setLed(dom.ledAudio, app.audio === "running" ? "#34d399" : app.audio === "paused" ? "#fbbf24" : app.audio === "unavailable" ? "#fb7185" : "#5b6b8c", app.audio === "running");
  dom.chipAudio.textContent = app.audio === "running" ? (app.coreAudio ? "CORE" : "LIVE") : app.audio === "paused" ? "HELD" : app.audio === "unavailable" ? "MUTE" : "IDLE";
}

/* ------------------------------------------------------- transitions - */
function transitionTo(state, manual = false) {
  const from = app.stateId;
  if (from === state) return;
  app.stateId = state;
  const meta = STATES[state];
  pushLog("INFO", `Target state: ${meta.label}`);
  pushLog("INFO", `Switching audio: ${STATES[from].freq}Hz → ${meta.freq}Hz`);
  toast(`STATE SHIFT // ${meta.label} · ${meta.freq} Hz`);
  engine.setState(state, 2.8);
  if (yt.enabled && yt.player) yt.switch(state);
  renderState(meta, true);
  dom.transTarget.textContent = meta.label;
  dom.transBanner.hidden = false;
  dom.cfFrom.textContent = STATES[from].freq;
  dom.cfTo.textContent = meta.freq;
  dom.crossfade.hidden = false;
  clearTimeout(transTimer);
  transTimer = setTimeout(() => { dom.transBanner.hidden = true; dom.crossfade.hidden = true; }, 3000);
  if (manual && app.backend === "online") {
    fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state }) }).catch(() => {});
  }
  fetchAffirmation(state);
}

function handleReading(reading, source) {
  app.emotion = reading;
  app.source = source;
  const res = stabilizer.push(reading);
  renderEmotion(reading, source, res.progress, app.mode);
  renderChips();
  if (res.changed) {
    pushLog("INFO", `Emotion detected: ${EMOTION_LABEL[stabilizer.stable]} (${Math.round(reading.confidence)}%)`);
    const target = EMOTION_TO_STATE[stabilizer.stable];
    if (target !== app.stateId) transitionTo(target);
  }
}

/* ---------------------------------------------------------- controls - */
function override(state) {
  app.mode = "manual";
  pushLog("INFO", `Manual override → ${STATES[state].label} (${STATES[state].freq} Hz)`);
  renderState(STATES[app.stateId], false);
  transitionTo(state, true);
}
function engageAuto() {
  app.mode = "auto";
  pushLog("INFO", "AUTO mode engaged — expression detection driving");
  renderState(STATES[app.stateId], false);
  if (app.backend === "online") {
    fetch("/api/mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "auto" }) }).catch(() => {});
  }
}

document.querySelectorAll("[data-override]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.dataset.override;
    if (v === "auto") engageAuto();
    else override(v);
  });
});
window.addEventListener("keydown", (e) => {
  if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === "1") override("calm");
  else if (e.key === "2") override("happy");
  else if (e.key === "3") override("energy");
  else if (e.key === "4") engageAuto();
});

dom.btnInit.addEventListener("click", async () => {
  pushLog("INFO", "Initializing Web Audio engine…");
  const ok = await engine.init();
  if (!ok) {
    app.audio = "unavailable";
    pushLog("WARN", "Audio device unavailable — running in visual-only mode");
    renderChips();
    return;
  }
  engine.setVolume(app.coreAudio ? 0 : app.volume);
  engine.setState(app.stateId, 1.6);
  app.audio = "running";
  dom.soundIdle.hidden = true;
  dom.soundLive.hidden = false;
  dom.soundStatus.style.color = "#34d399";
  dom.soundStatus.style.borderColor = "#34d39955";
  dom.soundStatus.innerHTML = '<span class="led led-pulse" style="color:#34d399"></span>PLAYING';
  pushLog("INFO", `Web Audio engine online · ${STATES[app.stateId].freq} Hz`);
  renderChips();
});

dom.btnPlay.addEventListener("click", () => {
  if (!engine.ctx) return;
  if (app.audio === "running") {
    engine.fadeOut(0.8); app.audio = "paused";
    dom.icoPause.hidden = true; dom.icoPlay.hidden = false;
    dom.soundStatus.innerHTML = '<span class="led" style="color:#fbbf24"></span>HELD';
    dom.soundStatus.style.color = "#fbbf24"; dom.soundStatus.style.borderColor = "#fbbf2455";
    pushLog("INFO", "Soundscape paused (fade out)");
  } else {
    engine.fadeIn(1.2); app.audio = "running";
    dom.icoPause.hidden = false; dom.icoPlay.hidden = true;
    dom.soundStatus.innerHTML = '<span class="led led-pulse" style="color:#34d399"></span>PLAYING';
    dom.soundStatus.style.color = "#34d399"; dom.soundStatus.style.borderColor = "#34d39955";
    pushLog("INFO", "Soundscape resumed (fade in)");
  }
  renderChips();
});

dom.volume.addEventListener("input", () => {
  const v = Number(dom.volume.value);
  app.volume = v / 100;
  dom.volNum.textContent = `${v}%`;
  dom.volume.style.setProperty("--fill", `${v}%`);
  if (!app.coreAudio) engine.setVolume(app.volume * 0.9);
  yt.setVolume(app.volume * 0.8);
});

/* ------------------------------------------------------- demo triggers */
SIM_EMOTIONS.forEach((e) => {
  const b = document.createElement("button");
  b.textContent = EMOTION_LABEL[e];
  b.addEventListener("click", () => {
    simulator.inject(e, 5);
    pushLog("INFO", `Demo trigger → ${EMOTION_LABEL[e]} expression injected`);
  });
  dom.triggerRow.appendChild(b);
});

/* ------------------------------------------------------------ camera - */
(async () => {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("unsupported");
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
    dom.video.srcObject = stream;
    await dom.video.play().catch(() => {});
    app.camera = "on";
    pushLog("INFO", "Camera initialized");
  } catch (_) {
    app.camera = "unavailable";
    dom.feedFallback.hidden = false;
    dom.scanBeam.style.display = "none";
    pushLog("WARN", "Webcam unavailable — vision disabled, manual controls active");
  }
  renderChips();
})();

/* ------------------------------------------------------- youtube ----- */
const yt = {
  enabled: false, player: null,
  toggle() {
    if (this.enabled) {
      this.enabled = false;
      if (this.player) { try { this.player.destroy(); } catch (_) {} this.player = null; }
      dom.ytHost.querySelectorAll("iframe, div:not(#yt-off)").forEach((n) => { if (n.id !== "yt-off") n.remove(); });
      dom.ytOff.style.display = "";
      dom.ytSwitch.classList.remove("on");
      dom.ytSwitch.setAttribute("aria-checked", "false");
      dom.ytStatus.innerHTML = '<span class="led"></span>OFF';
      dom.ytStatus.style.color = "";
      dom.ytTitle.textContent = "OPTIONAL STREAM · FALLBACK = LOCAL SYNTH";
      pushLog("INFO", "YT ambience layer disengaged");
      return;
    }
    this.enabled = true;
    dom.ytSwitch.classList.add("on");
    dom.ytSwitch.setAttribute("aria-checked", "true");
    dom.ytStatus.innerHTML = '<span class="led led-pulse" style="color:#fbbf24"></span>LOADING';
    dom.ytStatus.style.color = "#fbbf24";
    pushLog("INFO", "Loading YouTube ambience layer…");
    this.loadApi().then((ok) => {
      if (!ok || !this.enabled) return this.fail("YouTube IFrame API unreachable — synth soundscape continues");
      dom.ytOff.style.display = "none";
      const holder = document.createElement("div");
      dom.ytHost.appendChild(holder);
      this.player = new window.YT.Player(holder, {
        width: "100%", height: "100%", videoId: YT_IDS[app.stateId],
        playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1 },
        events: {
          onReady: (e) => { e.target.setVolume(Math.round(app.volume * 80)); e.target.playVideo(); },
          onStateChange: (e) => {
            if (window.YT.PlayerState && e.data === window.YT.PlayerState.PLAYING) {
              dom.ytStatus.innerHTML = '<span class="led" style="color:#34d399"></span>PLAYING';
              dom.ytStatus.style.color = "#34d399";
              dom.ytTitle.textContent = `▶ AMBIENT STREAM · ${STATES[app.stateId].label}`;
              pushLog("INFO", `YT ambience playing — ${STATES[app.stateId].label} playlist`);
            }
          },
          onError: () => this.fail("YouTube stream unavailable — synth soundscape continues"),
        },
      });
    });
  },
  fail(msg) {
    dom.ytStatus.innerHTML = '<span class="led" style="color:#fb7185"></span>UNAVAIL';
    dom.ytStatus.style.color = "#fb7185";
    dom.ytTitle.textContent = "STREAM UNAVAILABLE · SYNTH CONTINUES";
    pushLog("WARN", msg);
  },
  loadApi() {
    if (this._p) return this._p;
    this._p = new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve(true);
      const timer = setTimeout(() => resolve(false), 6500);
      window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); resolve(true); };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.onerror = () => { clearTimeout(timer); resolve(false); };
      document.head.appendChild(tag);
    });
    return this._p;
  },
  switch(state) { try { if (this.player) this.player.loadVideoById(YT_IDS[state]); } catch (_) {} },
  setVolume(v) { try { if (this.player) this.player.setVolume(Math.round(v * 100)); } catch (_) {} },
};
dom.ytSwitch.addEventListener("click", () => yt.toggle());

/* --------------------------------------------------------- visualizer - */
const BARS = 112;
const peaks = new Float32Array(BARS);
const freqData = new Uint8Array(1024);
const timeData = new Uint8Array(1024);
const gauss = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));

function drawViz(tms) {
  requestAnimationFrame(drawViz);
  const canvas = dom.canvas, ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const meta = STATES[app.stateId];
  const live = !!engine.analyser && app.audio === "running" && !engine.faded;
  if (live) engine.analyser.getByteFrequencyData(freqData);

  const t = tms / 1000;
  const peakX = (meta.freq - 380) / (700 - 380);
  const barW = W / BARS;

  ctx.strokeStyle = "rgba(27,39,64,.5)"; ctx.lineWidth = 1;
  [0.28, 0.55, 0.82].forEach((gy) => { ctx.beginPath(); ctx.moveTo(0, H * gy); ctx.lineTo(W, H * gy); ctx.stroke(); });

  const grad = ctx.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, meta.color + "26");
  grad.addColorStop(0.45, meta.color + "cc");
  grad.addColorStop(1, meta.color2);
  ctx.fillStyle = grad;

  for (let i = 0; i < BARS; i++) {
    const x = i / BARS;
    let v;
    if (live) {
      const idx = Math.min(freqData.length - 1, Math.floor(Math.pow(x, 1.55) * 520));
      v = freqData[idx] / 255;
    } else {
      const shape = gauss(x, peakX, 0.055) * 0.85 + gauss(x, peakX * 0.5, 0.09) * 0.4 +
        gauss(x, Math.min(0.97, peakX * 1.5), 0.05) * 0.32 + gauss(x, 0.04, 0.05) * 0.3;
      const mod = 0.58 + 0.42 * Math.sin(t * Math.PI * 2 * meta.lfo + x * 9 + Math.sin(t * 0.7 + x * 22) * 1.3);
      v = Math.max(0.02, shape * mod * (0.8 + 0.2 * Math.sin(i * 12.9898 + Math.floor(t * 8) * 78.233)));
    }
    peaks[i] = Math.max(v, peaks[i] * 0.965);
    const bh = Math.min(0.94, v) * H * 0.86;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(i * barW + barW * 0.18, H - bh, barW * 0.64, bh);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = meta.color2;
    ctx.fillRect(i * barW + barW * 0.18, H - peaks[i] * H * 0.86 - 3, barW * 0.64, 1.6);
    ctx.fillStyle = grad;
  }
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.strokeStyle = meta.color2; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.3;
  ctx.shadowColor = meta.color2; ctx.shadowBlur = 7;
  if (live) {
    engine.analyser.getByteTimeDomainData(timeData);
    for (let i = 0; i < timeData.length; i += 4) {
      const px = (i / timeData.length) * W;
      const py = H * 0.44 + ((timeData[i] - 128) / 128) * H * 0.3;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
  } else {
    for (let px = 0; px <= W; px += 4) {
      const x = px / W;
      const py = H * 0.44 + Math.sin(x * 22 + t * 2.4) * Math.sin(x * 5 - t * 0.9) * H * 0.1 *
        (0.6 + 0.4 * Math.sin(t * Math.PI * 2 * meta.lfo));
      px === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
}
requestAnimationFrame(drawViz);

/* ------------------------------------------------------- layer meters - */
const bandBuf = new Uint8Array(1024);
function meters() {
  setTimeout(meters, 90);
  if (engine.analyser && app.audio === "running" && !engine.faded) {
    engine.analyser.getByteFrequencyData(bandBuf);
    const hz = (engine.ctx ? engine.ctx.sampleRate : 44100) / 2048;
    const band = (a, b) => {
      let s = 0, n = 0;
      for (let i = Math.floor(a / hz); i <= Math.min(bandBuf.length - 1, Math.ceil(b / hz)); i++) { s += bandBuf[i]; n++; }
      return n ? s / (n * 255) : 0;
    };
    [band(40, 260), band(380, 560), band(600, 1000), band(1000, 2600)].forEach((v, i) => {
      dom.layers[i].style.height = `${Math.min(100, Math.max(2, v * 220))}%`;
    });
  } else {
    const t = Date.now() / 1000, lfo = STATES[app.stateId].lfo;
    for (let i = 0; i < 4; i++) {
      const v = app.audio === "running" ? 0.3 + 0.25 * Math.sin(t * Math.PI * 2 * lfo + i * 1.3) : 0.04;
      dom.layers[i].style.height = `${Math.min(100, Math.max(2, v * 100))}%`;
    }
  }
}
meters();

/* ---------------------------------------------- backend polling/solo -- */
async function probeBackend() {
  try {
    const res = await fetch("/api/health", { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch (_) { return false; }
}

async function pollStatus() {
  try {
    const res = await fetch("/api/status", { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error("bad status");
    const st = await res.json();
    if (st.emotion) {
      app.emotion = { emotion: st.emotion, confidence: st.confidence };
      app.source = "backend";
      renderEmotion(app.emotion, "backend", st.stability, app.mode);
    }
    app.ollama = st.ollama; app.ollamaModel = st.ollama_model || "llama3.2";
    const coreAudio = !!st.audio;
    if (coreAudio !== app.coreAudio) {
      app.coreAudio = coreAudio;
      if (coreAudio) {
        engine.setVolume(0);
        dom.soundNote.textContent = "PYTHON CORE (PYGAME) DRIVING SPEAKERS · BROWSER MIRRORS SPECTRUM";
        pushLog("INFO", "Audio: Python core (pygame) driving speakers");
      } else {
        engine.setVolume(app.volume * 0.9);
        pushLog("WARN", "Core audio unavailable — browser engine engaged");
      }
    }
    if (app.mode === "auto" && st.target_state !== app.stateId) transitionTo(st.target_state);
    renderChips();
  } catch (_) { /* transient */ }
}

async function pollCoreLogs() {
  try {
    const res = await fetch(`/api/logs?since=${app.logTotal}`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return;
    const data = await res.json();
    for (const raw of data.lines) {
      const m = /^\[(\w+)\]\s*(.*)$/.exec(raw);
      pushLog(m && ["INFO", "WARN", "ERROR", "SYS"].includes(m[1]) ? m[1] : "INFO", m ? m[2] : raw, "core");
    }
    app.logTotal = data.total;
  } catch (_) { /* transient */ }
}

setInterval(async () => {
  const ok = await probeBackend();
  const was = app.backend === "online";
  app.backend = ok ? "online" : "offline";
  if (ok && !was) { pushLog("INFO", "Backend linked — OpenCV · DeepFace pipeline online"); app.source = "backend"; }
  else if (!ok && was) { pushLog("WARN", "Backend lost — reverting to solo simulation"); app.source = "sim"; }
  dom.simTriggers.hidden = ok;
  renderChips();
}, 5000);

setInterval(() => { if (app.backend === "online") { pollStatus(); pollCoreLogs(); } }, 2000);

setInterval(() => {
  if (app.backend === "online" || app.mode !== "auto") return;
  handleReading(simulator.next(), "sim");
}, 1600);

/* --------------------------------------------------------------- boot - */
(function boot() {
  pushLog("SYS", "AI Symphony core v1.0 — local-first build");
  pushLog("INFO", "Probing Python backend (Flask · :5000)…");
  dom.volume.style.setProperty("--fill", "55%");

  // gauge tick marks for 432 / 528 / 639
  [432, 528, 639].forEach((f) => {
    const a = ((angleFor(f) - 90) * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", 100 + cos * 70); line.setAttribute("y1", 100 + sin * 70);
    line.setAttribute("x2", 100 + cos * 86); line.setAttribute("y2", 100 + sin * 86);
    line.setAttribute("stroke", f === 432 ? "var(--acc)" : "#33436a");
    line.setAttribute("stroke-width", f === 432 ? "2.4" : "1.2");
    line.dataset.freq = f;
    dom.ticks.appendChild(line);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", 100 + cos * 95); text.setAttribute("y", 103 + sin * 95);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "7.5");
    text.setAttribute("font-family", "IBM Plex Mono, monospace");
    text.setAttribute("fill", f === 432 ? "var(--acc)" : "#5b6b8c");
    text.dataset.freq = f;
    text.textContent = f;
    dom.ticks.appendChild(text);
  });

  renderState(STATES.calm, false);
  renderChips();
  setTimeout(() => fetchAffirmation("calm"), 900);
})();
