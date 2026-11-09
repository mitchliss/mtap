// Physically modelled guitars.
// Acoustic: commuted waveguide synthesis (extended Karplus-Strong). The pluck is pre-convolved with a synthetic
// steel-string body impulse response (modal: Helmholtz A0, top-plate modes, ...), then filtered for pick position
// and pick hardness and injected into a tuned string loop (one-pole loss filter designed from T60 at the fundamental
// and at 4 kHz, Thiran allpass fine tuning). Two slightly detuned loops with different "mic" body IRs give stereo.
// Electric: same string, magnetic pickup comb + amp/cab chain.
import { SR, Rng, midiToHz, dbToGain, clamp, tanhFast } from '../core/util.js';
import { Biquad, OnePole, DCBlock } from '../core/filters.js';
import { guitarVoicing, GUITAR_TUNING } from '../theory.js';

const TWO_PI = Math.PI * 2;

/** solve the one-pole loss filter for desired per-period gains at w0 and wh */
// (the loop also contains a DC blocker, so the low-pass DC gain may slightly exceed 1 without instability)
function designLoss(G0, Gh, w0, wh, hpRho) {
  const mag = (p, w) => (1 - p) / Math.sqrt(1 - 2 * p * Math.cos(w) + p * p);
  const target = Gh / G0;
  let lo = 0, hi = 0.97;
  for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (mag(m, wh) / mag(m, w0) > target) lo = m; else hi = m; }
  const p = (lo + hi) / 2;
  let g = G0 / (mag(p, w0) * hpMag(hpRho, w0));
  // stability: the loop gain must stay below 1 at every frequency, not just at the fundamental
  let mx = 0;
  for (let k = 0; k <= 240; k++) { const w = 1e-4 * Math.pow(Math.PI / 1e-4, k / 240); mx = Math.max(mx, mag(p, w) * hpMag(hpRho, w)); }
  g = Math.min(g, 0.99998 / mx);
  return { p, g };
}
// in-loop DC blocker  H = (1+r)/2 (1 - z^-1) / (1 - r z^-1)
function hpMag(r, w) { const c = (1 + r) / 2; return c * Math.sqrt(2 - 2 * Math.cos(w)) / Math.sqrt(1 - 2 * r * Math.cos(w) + r * r); }
function hpPhaseDelay(r, w) { const ph = Math.atan2(Math.sin(w), 1 - Math.cos(w)) - Math.atan2(r * Math.sin(w), 1 - r * Math.cos(w)); return -ph / w; }
const lpPhaseDelay = (p, w) => Math.atan2(p * Math.sin(w), 1 - p * Math.cos(w)) / w;
function apPhaseDelay(eta, w) {
  const re1 = eta + Math.cos(w), im1 = -Math.sin(w), re2 = 1 + eta * Math.cos(w), im2 = -eta * Math.sin(w);
  return -(Math.atan2(im1, re1) - Math.atan2(im2, re2)) / w;
}
function solveEta(delta, w) {
  let lo = -0.99, hi = 0.99;
  for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (apPhaseDelay(m, w) > delta) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/**
 * Core string loop. exc: excitation (Float32Array) injected from sample 0. n: output length.
 * p: { f0, t60, t60hf, rel (sample index where damping starts or -1), relT60=0.07, relT60hf=0.025, sr }
 */
export function stringLoop(exc, n, p) {
  const sr = p.sr || SR, f0 = p.f0, P = sr / f0, w0 = (TWO_PI * f0) / sr, wh = (TWO_PI * Math.min(4000, sr * 0.4)) / sr;
  const G0 = Math.pow(10, -3 / (p.t60 * f0)), Gh = Math.pow(10, -3 / (Math.max(0.01, p.t60hf) * f0));
  const rho = Math.exp((-2 * Math.PI * Math.min(15, f0 / 20)) / sr);
  let { p: pole, g } = designLoss(G0, Math.min(Gh, G0 * 0.9999), w0, wh, rho);
  const tl = lpPhaseDelay(pole, w0) + hpPhaseDelay(rho, w0);
  const D = Math.max(2, Math.floor(P - tl - 0.5));
  const eta = solveEta(P - tl - D, w0);
  const buf = new Float32Array(D);
  const out = new Float32Array(n);
  let idx = 0, lpz = 0, apx = 0, apy = 0, hx = 0, hy = 0;
  const hc = (1 + rho) / 2;
  const rel = p.rel ?? -1, E = exc.length;
  let relPole = pole, relG = g;
  if (rel >= 0) {
    const r = designLoss(Math.pow(10, -3 / ((p.relT60 ?? 0.07) * f0)), Math.pow(10, -3 / ((p.relT60hf ?? 0.025) * f0)), w0, wh, rho);
    relPole = r.p; relG = r.g;
  }
  const rampN = Math.round(0.004 * sr);
  let a = g * (1 - pole), b = pole;
  for (let i = 0; i < n; i++) {
    if (rel >= 0 && i >= rel && i <= rel + rampN) {
      const x = (i - rel) / rampN;
      const pp = pole + (relPole - pole) * x, gg = g + (relG - g) * x;
      a = gg * (1 - pp); b = pp;
    }
    const d = buf[idx];
    lpz = a * d + b * lpz;
    hy = hc * (lpz - hx) + rho * hy; hx = lpz;
    const ap = eta * hy + apx - eta * apy; apx = hy; apy = ap;
    const y = (i < E ? exc[i] : 0) + ap;
    buf[idx] = y; if (++idx >= D) idx = 0;
    out[i] = y;
  }
  return out;
}

/** direct-form convolution (short x, long h) */
function convolve(x, h) {
  const out = new Float32Array(x.length + h.length - 1);
  for (let i = 0; i < x.length; i++) { const xi = x[i]; if (!xi) continue; for (let j = 0; j < h.length; j++) out[i + j] += xi * h[j]; }
  return out;
}

// steel-string dreadnought body modes: [Hz, Q, peak dB]
const BODY_MODES = [[98, 12, 13], [196, 20, 11], [226, 25, 6], [390, 25, 7], [470, 30, 5], [560, 28, 6], [700, 30, 4],
  [880, 30, 4], [1050, 35, 3], [1300, 35, 3], [1620, 35, 2], [2050, 40, 3], [2500, 40, 2], [3150, 40, 1], [3900, 45, 0]];

function bodyIR(rng, sizeScale, micTone, sr) {
  const n = Math.round(0.3 * sr), ir = new Float32Array(n);
  ir[0] = 1;
  for (const [f0, Q, db] of BODY_MODES) {
    const f = (f0 / sizeScale) * (1 + rng.range(-0.035, 0.035));
    const tau = Q / (Math.PI * f), A = (dbToGain(db + rng.range(-1.5, 1.5) + (f < 300 ? micTone : -micTone * 0.5)) / ((tau * sr) / 2)) * 1.6;
    const ph = rng.range(0, TWO_PI), w = (TWO_PI * f) / sr, k = Math.exp(-1 / (tau * sr));
    let env = A;
    for (let i = 1; i < n && env > 1e-7; i++) { ir[i] += env * Math.sin(w * i + ph); env *= k; }
  }
  // dense high-frequency radiation: short decaying noise
  let s = rng.u32() | 1;
  for (let i = 1; i < Math.round(0.006 * sr); i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; ir[i] += ((s >>> 0) / 2147483648 - 1) * 0.08 * Math.exp(-i / (0.0012 * sr)); }
  // gentle top-end roll-off of the radiated sound
  new OnePole('lp', 10000, sr).process(ir);
  return ir;
}

/** half-cosine pluck pulse of width w seconds */
function pulse(w, sr) { const n = Math.max(2, Math.round(w * sr)), p = new Float32Array(n); for (let i = 0; i < n; i++) p[i] = 0.5 - 0.5 * Math.cos((TWO_PI * (i + 0.5)) / n); return p; }

/**
 * Steel-string acoustic guitar.
 * opts: { seed, decay=1 (scale), brightness=0.55 (0..1), body=1 (body size scale, >1 = bigger/boomier), pickPos=0.15,
 *         width=0.85 (stereo of the 2 mics), noise=0.12 (pick noise), gain=1 }
 * note: { midi, vel=0.8, dur, mute: false|'palm'|'dead', cut (boolean: next pluck on the same string), pickPos, bright }
 */
export class AcousticGuitar {
  constructor(opts = {}) {
    this.name = opts.name || 'acoustic-guitar'; this.sr = opts.sr || SR; this.opts = opts;
    this.tail = 0.6;
    const rng = new Rng(opts.seed ?? 'acoustic');
    const sz = opts.body ?? 1;
    this.ir = [bodyIR(rng.fork('L'), sz, 2.0, this.sr), bodyIR(rng.fork('R'), sz * 1.02, -1.5, this.sr)];
    const widths = [0.00025, 0.0005, 0.001, 0.002, 0.0035];
    this.widths = widths;
    this.excP = this.ir.map((ir) => widths.map((w) => convolve(pulse(w, this.sr), ir)));
    this.excN = this.ir.map((ir, c) => [0, 1, 2].map((k) => {
      const r = new Rng(`gtn${c}${k}`), m = Math.round(0.003 * this.sr), x = new Float32Array(m);
      for (let i = 0; i < m; i++) x[i] = r.bi() * Math.exp(-i / (0.0008 * this.sr));
      return convolve(x, ir);
    }));
    this.rng = rng.fork('notes');
    this.count = 0;
  }
  render(note) {
    const sr = this.sr, o = this.opts, vel = clamp(note.vel ?? 0.8, 0.02, 1), f0 = midiToHz(note.midi);
    const mute = note.mute || false;
    const r = new Rng(`${o.seed ?? 'ac'}:${note.midi}:${this.count++}`);
    const dur = Math.max(0.02, note.dur ?? 1);
    let t60 = clamp(5.5 * Math.pow(110 / f0, 0.6), 1.2, 7.5) * (o.decay ?? 1);
    const bright = clamp((note.bright ?? o.brightness ?? 0.55) * (0.75 + 0.5 * vel), 0, 1.2);
    let t60hf = t60 * (0.09 + 0.24 * bright); // steel strings keep their shimmer
    let pickPos = note.pickPos ?? o.pickPos ?? 0.15, noiseAmt = (o.noise ?? 0.12) * (0.6 + vel * 0.6);
    let relT60 = note.cut ? 0.012 : 0.08, tailS = note.cut ? 0.03 : 0.35;
    if (mute === 'palm') { t60 = 0.32 * (o.decay ?? 1); t60hf = 0.03; pickPos = 0.09; tailS = 0.05; }
    if (mute === 'dead') { t60 = 0.03; t60hf = 0.012; noiseAmt = 1.2; tailS = 0.02; }
    const ringLen = mute ? Math.min(dur, mute === 'dead' ? 0.09 : 0.6) : dur;
    const n = Math.round((ringLen + tailS) * sr);
    // excitation blend by hardness (velocity)
    const hard = clamp(1 - vel, 0, 1) * 2.2 * (mute === 'palm' ? 0.6 : 1) + (mute === 'palm' ? 1.5 : 0);
    const wi = Math.min(this.widths.length - 2, Math.floor(hard)), wf = hard - wi;
    const out = [];
    const detune = [1 - r.range(0.0001, 0.00025), 1 + r.range(0.0001, 0.00025)];
    const P = sr / f0, M = Math.max(1, Math.round(pickPos * P));
    const lpf = 2500 + 12500 * vel * vel * (mute === 'palm' ? 0.4 : 1);
    const nk = r.int(0, 2);
    for (let c = 0; c < 2; c++) {
      const a = this.excP[c][wi], b = this.excP[c][wi + 1], nz = this.excN[c][nk];
      const E = Math.min(Math.max(a.length, b.length), n);
      const e = new Float32Array(E + M);
      for (let i = 0; i < E; i++) e[i] = (a[i] || 0) * (1 - wf) + (b[i] || 0) * wf + (nz[i] || 0) * noiseAmt;
      // pick position comb (both travelling waves) + hardness low-pass
      for (let i = E + M - 1; i >= M; i--) e[i] -= e[i - M];
      new OnePole('lp', lpf, sr).process(e);
      const y = stringLoop(e, n, { f0: f0 * detune[c], t60: t60 * (c ? 0.93 : 1), t60hf, rel: Math.round(ringLen * sr), relT60, relT60hf: relT60 * 0.4, sr });
      out.push(y);
    }
    // level: normalise early peak, then velocity curve and register balance
    let pk = 0; const pn = Math.min(n, Math.round(0.08 * sr));
    for (let i = 0; i < pn; i++) pk = Math.max(pk, Math.abs(out[0][i]), Math.abs(out[1][i]));
    const g = (o.gain ?? 1) * (pk > 0 ? 0.5 / pk : 0) * Math.pow(vel, 1.3) * (mute === 'dead' ? 0.5 : 1) * clamp(Math.pow(f0 / 160, -0.15), 0.8, 1.2);
    const w = o.width ?? 0.85;
    const [L, R] = out;
    for (let i = 0; i < n; i++) { const m = (L[i] + R[i]) * 0.5, s = (L[i] - R[i]) * 0.5 * w; L[i] = (m + s) * g; R[i] = (m - s) * g; }
    // plectrum scrape
    const pn2 = Math.round(0.0025 * sr);
    let s = r.u32() | 1;
    const sg = 0.09 * vel * g / Math.max(1e-6, (o.gain ?? 1)) * (o.gain ?? 1);
    for (let i = 0; i < pn2 && i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; const v = ((s >>> 0) / 2147483648 - 1) * sg * Math.exp(-i / (0.0006 * sr)) * (pk > 0 ? pk : 1); L[i] += v; R[i] += v * 0.8; }
    return [L, R];
  }
  performance(opts) { return new GuitarPerformance(this, opts); }
}

/**
 * Electric guitar: same string model, magnetic pickup comb, amp + cab.
 * opts: { tone: 'clean'|'chorus'|'crunch'|'mute' (picked muted funk/pop pluck), pickup: 'neck'|'middle'|'bridge', decay=1, brightness=0.6, seed, gain }
 * For 'chorus' put a chorus/ensemble insert on the stem (mix.js) -- the instrument output is dry/mono-ish.
 */
export class ElectricGuitar {
  constructor(opts = {}) {
    this.name = opts.name || 'electric-guitar'; this.sr = opts.sr || SR; this.opts = opts; this.tail = 0.4; this.count = 0;
    this.pickup = { neck: 0.25, middle: 0.18, bridge: 0.09 }[opts.pickup || 'neck'];
  }
  render(note) {
    const sr = this.sr, o = this.opts, vel = clamp(note.vel ?? 0.8, 0.02, 1), f0 = midiToHz(note.midi);
    const r = new Rng(`${o.seed ?? 'eg'}:${note.midi}:${this.count++}`);
    const mute = note.mute || (o.tone === 'mute' ? 'palm' : false);
    const dur = Math.max(0.02, note.dur ?? 1);
    let t60 = clamp(7 * Math.pow(110 / f0, 0.5), 2, 9) * (o.decay ?? 1);
    const bright = clamp(o.brightness ?? 0.6, 0, 1);
    let t60hf = t60 * (0.05 + 0.15 * bright);
    if (mute === 'palm') { t60 = 0.28; t60hf = 0.04; }
    if (mute === 'dead') { t60 = 0.03; t60hf = 0.01; }
    const ringLen = mute ? Math.min(dur, 0.5) : dur;
    const tailS = note.cut ? 0.03 : 0.25;
    const n = Math.round((ringLen + tailS) * sr);
    const P = sr / f0, M = Math.max(1, Math.round((note.pickPos ?? 0.12) * P));
    const w = 0.0003 + (1 - vel) * 0.0015;
    const pl = pulse(w, sr), E = pl.length + M + 64, e = new Float32Array(E);
    for (let i = 0; i < pl.length; i++) e[i] = pl[i];
    for (let i = 0; i < 64; i++) e[i] += r.bi() * 0.15 * Math.exp(-i / 10);
    for (let i = E - 1; i >= M; i--) e[i] -= e[i - M];
    const y = stringLoop(e, n, { f0, t60, t60hf, rel: Math.round(ringLen * sr), relT60: note.cut ? 0.012 : 0.06, relT60hf: 0.02, sr });
    // magnetic pickup: comb at pickup position + slight nonlinearity
    const Mp = Math.max(1, Math.round(this.pickup * P));
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = y[i] - (i >= Mp ? y[i - Mp] : 0);
    let pk = 0; for (let i = 0; i < Math.min(n, 4000); i++) pk = Math.max(pk, Math.abs(x[i]));
    const norm = pk > 0 ? 1 / pk : 0;
    const tone = o.tone || 'clean';
    const drive = tone === 'crunch' ? 6 : 1.4;
    for (let i = 0; i < n; i++) { const v = x[i] * norm * vel; x[i] = tanhFast(v * drive + 0.08 * v * v) / Math.tanh(drive) ; }
    new DCBlock(10, sr).process(x);
    // cab: HP 90, presence bump, LP ~5.5k (clean) / 4.5k (crunch)
    new Biquad('hp', 90, 0.7, 0, sr).process(x);
    new Biquad('peak', 1800, 0.9, tone === 'crunch' ? 4 : 2.5, sr).process(x);
    new Biquad('peak', 380, 1.2, -2, sr).process(x);
    new Biquad('lp', tone === 'crunch' ? 4500 : 6000, 0.7, 0, sr).process(x);
    new Biquad('lp', tone === 'crunch' ? 5000 : 7500, 0.7, 0, sr).process(x);
    const g = (o.gain ?? 1) * 0.45 * Math.pow(vel, 0.6);
    for (let i = 0; i < n; i++) x[i] *= g;
    return x;
  }
  performance(opts) { return new GuitarPerformance(this, opts); }
}

/**
 * Collects strums/picks for one guitar and renders them so each string only rings one note at a time
 * (a new pluck on a string cuts the previous one, just like a real guitar).
 * opts: { tuning = standard EADGBE, seed, humanize=true }
 */
export class GuitarPerformance {
  constructor(inst, opts = {}) {
    this.inst = inst; this.tuning = opts.tuning || GUITAR_TUNING; this.events = [];
    this.rng = new Rng(opts.seed ?? 'gperf'); this.human = opts.humanize ?? true;
  }
  /**
   * Strum a chord. s: { time, chord (symbol) | voicing (6 x midi|null, low E first), dir='down'|'up', vel=0.8,
   *   spread (s, whole strum; default from vel 0.012..0.03), strings: 'all'|'bass'|'treble'|'top4'|[lo,hi] (string indices 0=low E),
   *   mute=false|'palm'|'dead', dur (s, max ring; default 4), prefer ('open'|'barre'|'high') }
   */
  strum(s) {
    const v = s.voicing || guitarVoicing(s.chord, { prefer: s.prefer || 'open' });
    let lo = 0, hi = 5;
    const st = s.strings || (s.dir === 'up' ? 'top4' : 'all');
    if (Array.isArray(st)) [lo, hi] = st;
    else if (st === 'bass') [lo, hi] = [0, 3]; else if (st === 'treble') [lo, hi] = [2, 5]; else if (st === 'top4') [lo, hi] = [2, 5]; else if (st === 'top3') [lo, hi] = [3, 5];
    const idx = [];
    for (let k = lo; k <= hi; k++) if (v[k] !== null && v[k] !== undefined) idx.push(k);
    if (s.dir === 'up') idx.reverse();
    const vel = s.vel ?? 0.8;
    const spread = s.spread ?? (0.034 - 0.022 * vel);
    idx.forEach((k, j) => {
      const jitter = this.human ? this.rng.range(-0.18, 0.18) / Math.max(1, idx.length) : 0;
      const t = s.time + spread * ((j + jitter) / Math.max(1, idx.length - 1));
      const ve = vel * (s.dir === 'up' ? 0.82 + 0.12 * (j === 0) : 1 - 0.12 * (j / Math.max(1, idx.length - 1))) * (this.human ? this.rng.range(0.92, 1.06) : 1);
      this.events.push({ string: k, time: t, midi: v[k], vel: clamp(ve, 0.05, 1), dur: s.dur ?? 4, mute: s.mute || false });
    });
    return this;
  }
  /** single picked note on a given string (or auto string if string omitted). p: { time, midi | fret, string, vel, dur, mute } */
  pick(p) {
    let string = p.string, midi = p.midi;
    if (midi === undefined) midi = this.tuning[string] + p.fret;
    if (string === undefined) {
      // highest string that can play it within 12 frets, preferring low frets
      string = 0;
      for (let k = 5; k >= 0; k--) { const f = midi - this.tuning[k]; if (f >= 0 && f <= 12) { string = k; break; } }
    }
    this.events.push({ string, time: p.time, midi, vel: p.vel ?? 0.8, dur: p.dur ?? 2, mute: p.mute || false });
    return this;
  }
  /** render everything into a stem (via stem.play so notes are logged). Returns number of notes. */
  flush(stem, extra = {}) {
    const ev = this.events.sort((a, b) => a.time - b.time);
    const last = new Map();
    for (const e of ev) {
      const prev = last.get(e.string);
      if (prev && prev.time + prev.dur > e.time) { prev.dur = Math.max(0.01, e.time - prev.time); prev.cut = true; }
      last.set(e.string, e);
    }
    for (const e of ev) stem.play(this.inst, { time: e.time, midi: e.midi, vel: e.vel, dur: e.dur, mute: e.mute, cut: e.cut, ...extra });
    const n = ev.length; this.events = [];
    return n;
  }
}
