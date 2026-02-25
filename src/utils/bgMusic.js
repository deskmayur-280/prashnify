/**
 * Background music using Web Audio API — joyful, looping
 * Procedurally generated chiptune-style melody
 */

let audioCtx = null;
let musicNodes = [];
let isPlaying = false;
let musicMuted = false;
let lastMelodyType = null; // Track which melody was last requested

const NOTES = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
  G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
};

// Joyful lobby melody — upbeat major key
const LOBBY_MELODY = [
  [NOTES.C4, 0.3], [NOTES.E4, 0.3], [NOTES.G4, 0.3], [NOTES.C5, 0.5],
  [NOTES.B4, 0.2], [NOTES.A4, 0.3], [NOTES.G4, 0.5],
  [NOTES.E4, 0.3], [NOTES.F4, 0.3], [NOTES.G4, 0.3], [NOTES.A4, 0.5],
  [NOTES.G4, 0.2], [NOTES.E4, 0.3], [NOTES.C4, 0.7],
];

// Upbeat quiz melody — slightly faster, more energetic
const QUIZ_MELODY = [
  [NOTES.G4, 0.2], [NOTES.A4, 0.2], [NOTES.B4, 0.2], [NOTES.C5, 0.4],
  [NOTES.B4, 0.2], [NOTES.G4, 0.2], [NOTES.E4, 0.4],
  [NOTES.F4, 0.2], [NOTES.G4, 0.2], [NOTES.A4, 0.2], [NOTES.B4, 0.4],
  [NOTES.A4, 0.2], [NOTES.G4, 0.4], [NOTES.E4, 0.2], [NOTES.G4, 0.5],
];

const initMusicCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
};

const playMelodyLoop = (melody, tempo = 1.0, type = 'lobby') => {
  if (musicMuted || isPlaying) return;
  initMusicCtx();
  isPlaying = true;

  const masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0.12, audioCtx.currentTime);
  masterGain.connect(audioCtx.destination);
  musicNodes.push(masterGain);

  // Also add a soft chord pad underneath
  const padFreqs = type === 'lobby' ? [NOTES.C4, NOTES.E4, NOTES.G4] : [NOTES.G4, NOTES.B4, NOTES.D5];
  padFreqs.forEach(freq => {
    const osc = audioCtx.createOscillator();
    const padGain = audioCtx.createGain();
    osc.connect(padGain);
    padGain.connect(masterGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 0.5, audioCtx.currentTime); // one octave down
    padGain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    osc.start();
    musicNodes.push(osc);
    musicNodes.push(padGain);
  });

  const scheduleMelody = (startTime) => {
    let time = startTime;
    melody.forEach(([freq, duration]) => {
      const d = duration / tempo;
      const osc = audioCtx.createOscillator();
      const env = audioCtx.createGain();
      osc.connect(env);
      env.connect(masterGain);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(0.6, time + 0.02);
      env.gain.setValueAtTime(0.6, time + d * 0.6);
      env.gain.linearRampToValueAtTime(0, time + d * 0.95);
      osc.start(time);
      osc.stop(time + d);
      musicNodes.push(osc);
      time += d;
    });
    return time;
  };

  const loop = (startTime) => {
    if (!isPlaying || musicMuted) return;
    const endTime = scheduleMelody(startTime);
    // Schedule next iteration slightly before end to avoid gaps
    const timeout = setTimeout(() => {
      if (isPlaying && !musicMuted) loop(endTime);
    }, Math.max(0, (endTime - audioCtx.currentTime - 0.5) * 1000));
    musicNodes.push({ stop: () => clearTimeout(timeout) });
  };

  loop(audioCtx.currentTime + 0.1);
};

function stopAll() {
  isPlaying = false;
  musicNodes.forEach(node => {
    try {
      if (typeof node.stop === 'function') node.stop();
      if (typeof node.disconnect === 'function') node.disconnect();
    } catch (e) { /* ignore */ }
  });
  musicNodes = [];
}

export const bgMusic = {
  startLobby: () => {
    stopAll();
    lastMelodyType = 'lobby';
    setTimeout(() => playMelodyLoop(LOBBY_MELODY, 0.9, 'lobby'), 50);
  },
  startQuiz: () => {
    stopAll();
    lastMelodyType = 'quiz';
    setTimeout(() => playMelodyLoop(QUIZ_MELODY, 1.2, 'quiz'), 50);
  },
  stop: () => {
    stopAll();
    lastMelodyType = null;
  },
  setMuted: (val) => {
    musicMuted = val;
    if (val) {
      stopAll();
    } else if (lastMelodyType) {
      // Restart the last melody when unmuting
      if (lastMelodyType === 'lobby') {
        stopAll();
        setTimeout(() => playMelodyLoop(LOBBY_MELODY, 0.9, 'lobby'), 50);
      } else {
        stopAll();
        setTimeout(() => playMelodyLoop(QUIZ_MELODY, 1.2, 'quiz'), 50);
      }
    }
  },
  isMuted: () => musicMuted,
};
