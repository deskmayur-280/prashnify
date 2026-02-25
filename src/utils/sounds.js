// frontend/src/utils/sounds.js
let audioCtx = null;
let initialized = false;
let muted = false;

// Call this on FIRST user interaction (click, tap)
export const initAudio = () => {
  if (initialized) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    initialized = true;
  } catch (e) {
    console.warn('Web Audio not supported:', e);
  }
};

export const setMuted = (val) => { muted = val; };
export const isMuted = () => muted;

const play = (fn) => {
  if (!initialized || muted || !audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  try { fn(audioCtx); } catch(e) { /* silence errors */ }
};

const tone = (ctx, freq, startTime, duration, type = 'sine', gainVal = 0.3) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(gainVal, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
};

export const sounds = {
  correct: () => play((ctx) => {
    const t = ctx.currentTime;
    tone(ctx, 523, t, 0.15);        // C5
    tone(ctx, 659, t + 0.12, 0.15); // E5
    tone(ctx, 784, t + 0.24, 0.25); // G5
  }),

  wrong: () => play((ctx) => {
    const t = ctx.currentTime;
    tone(ctx, 300, t, 0.1, 'sawtooth', 0.2);
    tone(ctx, 200, t + 0.1, 0.2, 'sawtooth', 0.15);
  }),

  tick: () => play((ctx) => {
    tone(ctx, 800, ctx.currentTime, 0.05, 'square', 0.1);
  }),

  countdownBeep: () => play((ctx) => {
    tone(ctx, 440, ctx.currentTime, 0.1, 'sine', 0.25);
  }),

  finalBeep: () => play((ctx) => {
    const t = ctx.currentTime;
    tone(ctx, 880, t, 0.2, 'sine', 0.3);
    tone(ctx, 1100, t + 0.15, 0.3, 'sine', 0.25);
  }),

  lobbyJoin: () => play((ctx) => {
    tone(ctx, 440, ctx.currentTime, 0.1);
    tone(ctx, 550, ctx.currentTime + 0.08, 0.15);
  }),

  quizStart: () => play((ctx) => {
    const t = ctx.currentTime;
    [261, 329, 392, 523].forEach((f, i) => {
      tone(ctx, f, t + i * 0.1, 0.2, 'sine', 0.25);
    });
  }),

  podiumReveal: () => play((ctx) => {
    const t = ctx.currentTime;
    [392, 494, 587, 698, 784].forEach((f, i) => {
      tone(ctx, f, t + i * 0.08, 0.3, 'sine', 0.2);
    });
  }),
};

// Legacy exports for backwards compatibility
export const playCorrect = sounds.correct;
export const playWrong = sounds.wrong;
export const playTick = sounds.tick;
