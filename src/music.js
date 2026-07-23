// MTap background music - an original upbeat loop synthesized live with WebAudio.
// No audio files, no downloads, no licensing questions: every note is generated
// by oscillators from a simple original chord loop composed for this game.

let ctx = null;
let master = null;
let schedulerTimer = null;
let nextNoteTime = 0;
let step = 0;
let playing = false;

const BPM = 118;
const STEP = 60 / BPM / 2; // eighth notes

// A cheerful 4-bar loop (frequencies in Hz, computed from semitone offsets vs A4).
const f = (semisFromA4) => 440 * Math.pow(2, semisFromA4 / 12);
// Chord roots: C - G - A minor - F (classic sunny progression territory)
const BARS = [
  { bass: f(-33), chord: [f(-9), f(-5), f(-2)] },   // C3  / C4 E4 G4
  { bass: f(-26), chord: [f(-2), f(2), f(5)] },     // G3  / G4 B4 D5
  { bass: f(-24), chord: [f(0), f(3), f(7)] },      // A3  / A4 C5 E5
  { bass: f(-28), chord: [f(-4), f(0), f(3)] },     // F3  / F4 A4 C5
];
// Melody pattern per bar: indices into the chord (or -1 = rest), eighth notes.
const MELODY_PATTERNS = [
  [0, -1, 1, 2, -1, 1, 2, 1],
  [2, -1, 0, 1, -1, 2, -1, 0],
  [1, 2, -1, 0, 2, -1, 1, -1],
  [0, -1, 2, 1, 0, -1, 1, 2],
];

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    // Gentle master compression keeps it smooth at low volume.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function envGain(t, attack, peak, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(master);
  return g;
}

function pluck(freq, t, peak, decay, type) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(envGain(t, 0.01, peak, decay));
  o.start(t);
  o.stop(t + decay + 0.05);
}

function hat(t, peak) {
  const len = 0.05;
  const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  src.connect(hp).connect(envGain(t, 0.001, peak, len));
  src.start(t);
}

function scheduleStep(s, t) {
  const bar = Math.floor(s / 8) % BARS.length;
  const eighth = s % 8;
  const { bass, chord } = BARS[bar];

  // Bass: root on 1 and 5, octave bounce on 4 and 8.
  if (eighth === 0 || eighth === 4) pluck(bass, t, 0.16, 0.5, 'triangle');
  else if (eighth === 3 || eighth === 7) pluck(bass * 2, t, 0.09, 0.25, 'triangle');

  // Chord stab on the off-beats (2 and 6) - soft and warm.
  if (eighth === 2 || eighth === 6) {
    for (const note of chord) pluck(note, t, 0.045, 0.4, 'sine');
  }

  // Sparkly melody on top.
  const m = MELODY_PATTERNS[bar][eighth];
  if (m >= 0) pluck(chord[m] * 2, t, 0.06, 0.32, 'square');

  // Hats: every eighth, accented off-beats.
  hat(t, eighth % 2 === 1 ? 0.05 : 0.025);
}

function schedulerTick() {
  while (nextNoteTime < ctx.currentTime + 0.25) {
    scheduleStep(step, nextNoteTime);
    step++;
    nextNoteTime += STEP;
  }
}

export function startMusic() {
  ensureCtx();
  if (playing) return;
  playing = true;
  step = 0;
  nextNoteTime = ctx.currentTime + 0.1;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5); // fade in
  schedulerTimer = setInterval(schedulerTick, 100);
}

export function stopMusic() {
  if (!playing) return;
  playing = false;
  clearInterval(schedulerTimer);
  if (ctx && master) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.8); // fade out
  }
}

export function isMusicPlaying() { return playing; }
