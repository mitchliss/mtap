// MTap background music - an original EDM-style loop synthesized live with WebAudio.
// No audio files, no samples, no licensing questions: kick, bass, claps, pads and
// lead are all generated from oscillators/noise using an original pattern.
//
// Style: 126 BPM four-on-the-floor house. A-minor progression (Am-F-C-G),
// off-beat saw bass, clap on the backbeat, sidechain-pumped pad, filtered arp lead.

let ctx = null;
let master = null;
let padGain = null;
let schedulerTimer = null;
let nextNoteTime = 0;
let step = 0;          // 16th-note steps
let playing = false;
let padOscs = [];
let currentPadBar = -1;

const BPM = 126;
const STEP = 60 / BPM / 4; // sixteenth notes
const STEPS_PER_BAR = 16;

const f = (semisFromA4) => 440 * Math.pow(2, semisFromA4 / 12);

// Am - F - C - G, bass roots low, chord voicings mid.
const BARS = [
  { bass: f(-24), chord: [f(-12), f(-9), f(-5)] },   // A2  / A3 C4 E4
  { bass: f(-28), chord: [f(-16), f(-12), f(-9)] },  // F2  / F3 A3 C4
  { bass: f(-33), chord: [f(-14), f(-9), f(-5)] },   // C2  / G3 C4 E4
  { bass: f(-26), chord: [f(-14), f(-10), f(-7)] },  // G2  / G3 B3 D4
];

// 16th-note arp pattern per bar: chord-tone index, -1 = rest. Syncopated, not cute.
const ARP = [
  [0, -1, 1, -1, 2, -1, 1, 2, -1, 1, -1, 2, -1, 1, 0, -1],
  [2, -1, 1, -1, 0, -1, 2, -1, 1, -1, 2, 1, -1, 0, -1, 1],
  [0, -1, 2, -1, 1, 2, -1, 1, -1, 2, -1, 1, 2, -1, 1, -1],
  [1, -1, 0, -1, 2, -1, 1, -1, 2, 1, -1, 2, -1, 1, -1, 2],
];

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    padGain = ctx.createGain();
    padGain.gain.value = 0.0;
    padGain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function env(t, attack, peak, decay, dest) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest || master);
  return g;
}

// Four-on-the-floor kick: fast pitch-drop sine thump.
function kick(t) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
  o.connect(env(t, 0.002, 0.5, 0.22));
  o.start(t);
  o.stop(t + 0.3);
  // Sidechain pump: duck the pad on every kick, swell back before the next beat.
  padGain.gain.cancelScheduledValues(t);
  padGain.gain.setValueAtTime(0.05, t);
  padGain.gain.linearRampToValueAtTime(0.30, t + STEP * 3.4);
}

function noiseBurst(t, len, filterType, freq, peak) {
  const buf = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * len), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = filterType;
  filt.frequency.value = freq;
  src.connect(filt).connect(env(t, 0.001, peak, len));
  src.start(t);
}

const clap = (t) => noiseBurst(t, 0.16, 'bandpass', 1700, 0.22);
const hatClosed = (t) => noiseBurst(t, 0.04, 'highpass', 8500, 0.07);
const hatOpen = (t) => noiseBurst(t, 0.12, 'highpass', 7500, 0.06);

// Off-beat house bass: filtered saw stab.
function bassStab(t, freq) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(220, t + 0.16);
  lp.Q.value = 6;
  o.connect(lp).connect(env(t, 0.004, 0.26, 0.18));
  o.start(t);
  o.stop(t + 0.25);
}

// Filtered arp lead: two slightly detuned saws, snappy.
function lead(t, freq) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2600, t);
  lp.frequency.exponentialRampToValueAtTime(700, t + 0.14);
  lp.Q.value = 4;
  const g = env(t, 0.004, 0.07, 0.15);
  lp.connect(g);
  for (const detune of [-6, 6]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(lp);
    o.start(t);
    o.stop(t + 0.2);
  }
}

// Sustained pad chord for the bar, pumped by the kick via padGain.
function setPadChord(barIdx, t) {
  if (barIdx === currentPadBar) return;
  currentPadBar = barIdx;
  for (const o of padOscs) { try { o.stop(t + 0.05); } catch { /* ok */ } }
  padOscs = [];
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1100;
  lp.connect(padGain);
  for (const note of BARS[barIdx].chord) {
    for (const detune of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = note;
      o.detune.value = detune;
      o.connect(lp);
      o.start(t);
      padOscs.push(o);
    }
  }
}

function scheduleStep(s, t) {
  const bar = Math.floor(s / STEPS_PER_BAR) % BARS.length;
  const sixteenth = s % STEPS_PER_BAR;
  const { bass } = BARS[bar];

  setPadChord(bar, t);

  // Kick on every quarter note.
  if (sixteenth % 4 === 0) kick(t);
  // Clap on beats 2 and 4.
  if (sixteenth === 4 || sixteenth === 12) clap(t);
  // Off-beat bass (the "and" of every beat) - the house engine.
  if (sixteenth % 4 === 2) bassStab(t, bass);
  // Hats: closed on off-16ths, open on the off-beats.
  if (sixteenth % 2 === 1) hatClosed(t);
  if (sixteenth % 8 === 6) hatOpen(t);
  // Arp lead.
  const a = ARP[bar][sixteenth];
  if (a >= 0) lead(t, BARS[bar].chord[a] * 2);
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
  currentPadBar = -1;
  nextNoteTime = ctx.currentTime + 0.1;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.42, ctx.currentTime + 1.2);
  schedulerTimer = setInterval(schedulerTick, 100);
}

export function stopMusic() {
  if (!playing) return;
  playing = false;
  clearInterval(schedulerTimer);
  if (ctx && master) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    const stopAt = ctx.currentTime + 0.8;
    for (const o of padOscs) { try { o.stop(stopAt); } catch { /* ok */ } }
    padOscs = [];
    currentPadBar = -1;
  }
}

export function isMusicPlaying() { return playing; }
