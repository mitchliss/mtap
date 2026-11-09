// Band-limited oscillators: polyBLEP saw/pulse, polyBLAMP triangle, table sine,
// mipmapped wavetables, the JP-8000-style supersaw, and noise generators.
import { SR, Rng, panGains } from './util.js';
import { FFT } from './fft.js';

// ---------------------------------------------------------------------------
// Sine table (4096 + guard). Linear interpolation error ~ -140 dB.
// ---------------------------------------------------------------------------
export const SIN_N = 4096;
export const SIN = new Float64Array(SIN_N + 1);
for (let i = 0; i <= SIN_N; i++) SIN[i] = Math.sin((2 * Math.PI * i) / SIN_N);
/** sine of a phase in cycles (any real number) */
export function sinc1(ph) {
  ph -= Math.floor(ph);
  const p = ph * SIN_N, i = p | 0;
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (p - i);
}

// polyBLEP / polyBLAMP residuals (t = phase in [0,1), dt = phase increment)
export function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
export function blamp(t, dt) {
  if (t < dt) { t = t / dt - 1; return -t * t * t / 3; }
  if (t > 1 - dt) { t = (t - 1) / dt + 1; return t * t * t / 3; }
  return 0;
}

/**
 * Render a classic oscillator into out[start..start+n), ADDING (amp may be a number).
 * type: 'sine' | 'saw' | 'square' | 'pulse' | 'tri'
 * freq: Hz number or Float32Array (per-sample Hz, indexed from 0 => out[start])
 * opts: { phase=0 (cycles), amp=1, pw=0.5 (number or array), sr }
 * returns the end phase (so you can continue a waveform).
 */
export function renderOsc(type, out, start, n, freq, opts = {}) {
  const sr = opts.sr || SR, amp = opts.amp ?? 1;
  const fArr = typeof freq === 'number' ? null : freq;
  const pwArr = typeof opts.pw === 'object' ? opts.pw : null;
  const pwC = typeof opts.pw === 'number' ? opts.pw : 0.5;
  let ph = (opts.phase ?? 0) % 1; if (ph < 0) ph += 1;
  let dt = fArr ? 0 : freq / sr;
  const end = start + n;
  switch (type) {
    case 'sine':
      for (let i = start, k = 0; i < end; i++, k++) {
        if (fArr) dt = fArr[k] / sr;
        const p = ph * SIN_N, j = p | 0;
        out[i] += amp * (SIN[j] + (SIN[j + 1] - SIN[j]) * (p - j));
        ph += dt; if (ph >= 1) ph -= 1;
      }
      break;
    case 'saw':
      for (let i = start, k = 0; i < end; i++, k++) {
        if (fArr) dt = fArr[k] / sr;
        let v = 2 * ph - 1;
        if (ph < dt) { const t = ph / dt; v -= t + t - t * t - 1; }
        else if (ph > 1 - dt) { const t = (ph - 1) / dt; v -= t * t + t + t + 1; }
        out[i] += amp * v;
        ph += dt; if (ph >= 1) ph -= 1;
      }
      break;
    case 'square':
    case 'pulse':
      for (let i = start, k = 0; i < end; i++, k++) {
        if (fArr) dt = fArr[k] / sr;
        const pw = pwArr ? pwArr[k] : (type === 'square' ? 0.5 : pwC);
        let v = ph < pw ? 1 : -1;
        v += blep(ph, dt);
        let t2 = ph - pw; if (t2 < 0) t2 += 1;
        v -= blep(t2, dt);
        out[i] += amp * (v - (2 * pw - 1)); // remove DC of asymmetric pulse
        ph += dt; if (ph >= 1) ph -= 1;
      }
      break;
    case 'tri':
      for (let i = start, k = 0; i < end; i++, k++) {
        if (fArr) dt = fArr[k] / sr;
        // naive tri: -1 at ph=0, +1 at ph=0.5
        let v = 1 - 4 * Math.abs(ph - 0.5);
        let t2 = ph + 0.5; if (t2 >= 1) t2 -= 1;
        v += 4 * dt * (blamp(ph, dt) - blamp(t2, dt));
        out[i] += amp * v;
        ph += dt; if (ph >= 1) ph -= 1;
      }
      break;
    default: throw new Error(`unknown osc type ${type}`);
  }
  return ph;
}

/** Stateful oscillator for streaming/block use. */
export class Osc {
  constructor(type = 'saw', freq = 440, phase = 0, sr = SR) { this.type = type; this.freq = freq; this.phase = phase; this.pw = 0.5; this.sr = sr; }
  render(out, start, n, amp = 1, freqArr = null) {
    this.phase = renderOsc(this.type, out, start, n, freqArr || this.freq, { phase: this.phase, amp, pw: this.pw, sr: this.sr });
    return out;
  }
}

/** one-shot helper: new buffer with the waveform */
export function osc(type, freq, n, opts = {}) {
  const out = new Float32Array(n);
  renderOsc(type, out, 0, n, freq, opts);
  return out;
}

// ---------------------------------------------------------------------------
// Mipmapped wavetables
// ---------------------------------------------------------------------------
const WT_SIZE = 2048;
const WT_LEVELS = 10; // max harmonics 512, 256, ... 1
const WT_MAXH = (l) => 512 >> l;

/**
 * A wavetable with one or more frames. Each frame is defined by harmonic amplitudes
 * (index 1 = fundamental) and optional phases (radians), or by a single-cycle waveform array
 * (any length) which is analysed.
 */
export class Wavetable {
  /** frames: array of {amps: number[], phases?: number[]} | {wave: Float32Array} */
  constructor(frames) {
    this.frames = frames.map((fr) => buildFrame(fr));
    this.count = this.frames.length;
  }
  static fromWaves(waves) { return new Wavetable(waves.map((w) => ({ wave: w }))); }
  static fromFn(fn, count = 1, h = 256) {
    const frames = [];
    for (let f = 0; f < count; f++) {
      const amps = [0], phases = [0];
      for (let k = 1; k <= h; k++) { const r = fn(k, count > 1 ? f / (count - 1) : 0); amps.push(Array.isArray(r) ? r[0] : r); phases.push(Array.isArray(r) ? r[1] : 0); }
      frames.push({ amps, phases });
    }
    return new Wavetable(frames);
  }
  /** built-in tables. 'saw','square','tri','sine','organ','warm','vox','glass','hollow','morph' (sine->saw 8 frames) */
  static preset(name) {
    if (presetCache.has(name)) return presetCache.get(name);
    let wt;
    const P = Math.PI / 2;
    switch (name) {
      case 'saw': wt = Wavetable.fromFn((k) => 1 / k); break;
      case 'square': wt = Wavetable.fromFn((k) => (k % 2 ? 1 / k : 0)); break;
      case 'tri': wt = Wavetable.fromFn((k) => (k % 2 ? [1 / (k * k), ((k - 1) / 2) % 2 ? -P : P] : 0)); break;
      case 'sine': wt = Wavetable.fromFn((k) => (k === 1 ? 1 : 0)); break;
      case 'organ': wt = Wavetable.fromFn((k) => ({ 1: 1, 2: 0.7, 3: 0.5, 4: 0.35, 6: 0.25, 8: 0.2, 10: 0.08, 12: 0.06, 16: 0.05 })[k] || 0); break;
      case 'warm': wt = Wavetable.fromFn((k) => 1 / Math.pow(k, 1.45) * (1 / (1 + Math.pow(k / 24, 2)))); break;
      case 'hollow': wt = Wavetable.fromFn((k) => (k % 2 ? 1 / k : 0.25 / k) / (1 + (k / 30) ** 2)); break;
      case 'vox': wt = Wavetable.fromFn((k) => { const f = k * 220; const fm = (c, b) => 1 / (1 + ((f - c) / b) ** 2); return (1 / k) * (0.15 + fm(700, 160) + 0.6 * fm(1200, 200) + 0.25 * fm(2600, 300)); }); break;
      case 'glass': wt = Wavetable.fromFn((k) => ({ 1: 1, 2: 0.4, 3: 0.12, 5: 0.25, 7: 0.15, 9: 0.08, 12: 0.05 })[k] || 0); break;
      case 'morph': wt = Wavetable.fromFn((k, x) => (k === 1 ? 1 : (x * x) / k), 8); break;
      default: throw new Error(`unknown wavetable preset ${name}`);
    }
    presetCache.set(name, wt);
    return wt;
  }
}
const presetCache = new Map();

function buildFrame(fr) {
  let amps = fr.amps, phases = fr.phases;
  if (fr.wave) {
    const n = 4096, f = FFT.get(n), re = new Float64Array(n), im = new Float64Array(n);
    const w = fr.wave, L = w.length;
    for (let i = 0; i < n; i++) { const x = (i * L) / n, j = Math.floor(x), t = x - j; re[i] = w[j % L] * (1 - t) + w[(j + 1) % L] * t; }
    f.transform(re, im);
    amps = [0]; phases = [0];
    for (let k = 1; k <= 512; k++) { amps.push((2 * Math.hypot(re[k], im[k])) / n); phases.push(Math.atan2(re[k], -im[k]) ); }
  }
  // levels
  const levels = [];
  let peakNorm = 0;
  for (let l = 0; l < WT_LEVELS; l++) {
    const H = WT_MAXH(l), re = new Float64Array(WT_SIZE), im = new Float64Array(WT_SIZE);
    for (let k = 1; k <= H && k < amps.length; k++) {
      const a = amps[k] || 0; if (!a) continue;
      const p = (phases && phases[k]) || 0;
      // sin(2pi k t + p) => X[k] = a/2 * e^{j(p - pi/2)} * N ... build via inverse FFT
      re[k] = (a / 2) * Math.cos(p - Math.PI / 2) * WT_SIZE;
      im[k] = (a / 2) * Math.sin(p - Math.PI / 2) * WT_SIZE;
      re[WT_SIZE - k] = re[k]; im[WT_SIZE - k] = -im[k];
    }
    FFT.get(WT_SIZE).transform(re, im, true);
    const t = new Float32Array(WT_SIZE + 1);
    for (let i = 0; i < WT_SIZE; i++) t[i] = re[i] / WT_SIZE;
    t[WT_SIZE] = t[0];
    if (l === 0) { for (let i = 0; i < WT_SIZE; i++) peakNorm = Math.max(peakNorm, Math.abs(t[i])); }
    levels.push(t);
  }
  const g = peakNorm > 0 ? 1 / peakNorm : 1;
  for (const t of levels) for (let i = 0; i <= WT_SIZE; i++) t[i] *= g;
  return levels;
}

function levelFor(f) {
  const allowed = 20000 / Math.max(1, f);
  let l = 0;
  while (l < WT_LEVELS - 1 && WT_MAXH(l) > allowed) l++;
  return l;
}

/**
 * Render a wavetable oscillator (ADDS into out).
 * opts: { phase, amp, position (0..1 number or Float32Array) , sr }
 * returns end phase.
 */
export function renderWavetable(wt, out, start, n, freq, opts = {}) {
  const sr = opts.sr || SR, amp = opts.amp ?? 1;
  const fArr = typeof freq === 'number' ? null : freq;
  const posArr = typeof opts.position === 'object' ? opts.position : null;
  const posC = typeof opts.position === 'number' ? opts.position : 0;
  let ph0 = (opts.phase ?? 0) % 1; if (ph0 < 0) ph0 += 1;
  let ph = (ph0 * 4294967296) >>> 0;
  const fr = wt.frames, nf = fr.length, sc = 4294967296 / sr, FR = 4.76837158203125e-7;
  for (let k0 = 0; k0 < n; k0 += 64) {
    const e = Math.min(n, k0 + 64);
    const lvl = levelFor(fArr ? fArr[k0] : freq);
    const dtC = fArr ? 0 : (freq * sc) >>> 0;
    if (nf === 1) {
      const T = fr[0][lvl];
      for (let k = k0; k < e; k++) {
        const j = ph >>> 21, v = T[j] + (T[j + 1] - T[j]) * ((ph & 0x1fffff) * FR);
        out[start + k] += amp * v;
        ph = (ph + (fArr ? (fArr[k] * sc) >>> 0 : dtC)) >>> 0;
      }
    } else {
      for (let k = k0; k < e; k++) {
        const pos = (posArr ? posArr[k] : posC) * (nf - 1);
        const a = Math.min(nf - 2, Math.max(0, Math.floor(pos))), b = pos - a;
        const A = fr[a][lvl], B = fr[a + 1][lvl];
        const j = ph >>> 21, t = (ph & 0x1fffff) * FR;
        const va = A[j] + (A[j + 1] - A[j]) * t, vb = B[j] + (B[j + 1] - B[j]) * t;
        out[start + k] += amp * (va + (vb - va) * b);
        ph = (ph + (fArr ? (fArr[k] * sc) >>> 0 : dtC)) >>> 0;
      }
    }
  }
  return ph / 4294967296;
}

// ---------------------------------------------------------------------------
// Supersaw (after Adam Szabo's analysis of the Roland JP-8000)
// ---------------------------------------------------------------------------
const SS_OFFS = [-0.11002313, -0.06288439, -0.01952356, 0, 0.01991221, 0.06216538, 0.10745242];
function ssDetuneCurve(x) {
  return 10028.7312891634 * x ** 11 - 50818.8652045924 * x ** 10 + 111363.4808729368 * x ** 9 - 138150.6761080548 * x ** 8 +
    106649.6679158292 * x ** 7 - 53046.9642751875 * x ** 6 + 17019.9518580080 * x ** 5 - 3425.0836591318 * x ** 4 +
    404.2703938388 * x ** 3 - 24.1878824391 * x ** 2 + 0.6717417634 * x + 0.0030115596;
}
/** detune offsets for any voice count (7 = JP-8000 table) */
let SAW_WT_CACHE = null;
const SAW_WT = { get frames() { if (!SAW_WT_CACHE) SAW_WT_CACHE = Wavetable.preset('saw'); return SAW_WT_CACHE.frames; } };
function ssOffsets(v) {
  if (v === 7) return SS_OFFS.slice();
  const o = [];
  for (let i = 0; i < v; i++) { const x = v === 1 ? 0 : (i / (v - 1)) * 2 - 1; o.push(Math.sign(x) * Math.pow(Math.abs(x), 1.25) * 0.11); }
  return o;
}

/**
 * Render a supersaw note. Returns [L, R].
 * p: { freq (Hz number or Float32Array), n (frames), voices=7, detune=0.3 (0..1 knob), mix=0.7 (0..1 side voices),
 *      spread=0.85 (stereo 0..1), seed, hpf=true (high-pass at the fundamental, like the JP-8000), amp=1 }
 */
export function supersaw(p) {
  const n = p.n | 0, sr = p.sr || SR, V = p.voices ?? 7;
  const L = new Float32Array(n), R = new Float32Array(n);
  const rng = new Rng(p.seed ?? 'ss');
  const det = ssDetuneCurve(Math.min(1, Math.max(0, p.detune ?? 0.3)));
  const mix = p.mix ?? 0.7;
  const centreAmp = -0.55366 * mix + 0.99785, sideAmp = -0.73764 * mix * mix + 1.2841 * mix + 0.044372;
  const offs = ssOffsets(V);
  const fArr = typeof p.freq === 'number' ? null : p.freq;
  const spread = p.spread ?? 0.85;
  const norm = (p.amp ?? 1) / Math.sqrt(centreAmp * centreAmp + (V - 1) * sideAmp * sideAmp) * 0.9;
  // mipmapped wavetable saw (alias-free, ~-100 dB) with 32-bit fixed-point phase (fastest loop shape in V8)
  const frames = SAW_WT.frames[0];
  for (let v = 0; v < V; v++) {
    const ratio = 1 + offs[v] * det;
    const isCentre = Math.abs(offs[v]) < 1e-9;
    const a = (isCentre ? centreAmp : sideAmp) * norm;
    const pan = V === 1 ? 0 : ((v / (V - 1)) * 2 - 1) * spread * (v % 2 ? -1 : 1);
    const [gl, gr] = panGains(pan);
    const gL = a * gl * 1.4142, gR = a * gr * 1.4142;
    let ph = (rng.float() * 4294967296) >>> 0;
    const sc = (ratio * 4294967296) / sr;
    if (!fArr) {
      const T = frames[levelFor(p.freq * ratio)], dt = (p.freq * sc) >>> 0;
      for (let i = 0; i < n; i++) {
        const j = ph >>> 21, s = T[j] + (T[j + 1] - T[j]) * ((ph & 0x1fffff) * 4.76837158203125e-7);
        L[i] += s * gL; R[i] += s * gR; ph = (ph + dt) >>> 0;
      }
    } else {
      for (let i0 = 0; i0 < n; i0 += 64) {
        const T = frames[levelFor(fArr[i0] * ratio)], e = Math.min(n, i0 + 64);
        for (let i = i0; i < e; i++) {
          const j = ph >>> 21, s = T[j] + (T[j + 1] - T[j]) * ((ph & 0x1fffff) * 4.76837158203125e-7);
          L[i] += s * gL; R[i] += s * gR; ph = (ph + ((fArr[i] * sc) >>> 0)) >>> 0;
        }
      }
    }
  }
  if (p.hpf !== false) {
    // 2-pole high-pass tracking the fundamental (TPT SVF, Q 0.7)
    const f0 = fArr ? fArr[0] : p.freq;
    for (const B of [L, R]) {
      let ic1 = 0, ic2 = 0, fPrev = -1, a1 = 0, a2 = 0, a3 = 0;
      const k = 1.4142;
      for (let i = 0; i < n; i++) {
        const fc = (fArr ? fArr[i] : f0) * 0.75;
        if (fc !== fPrev) { const g = Math.tan(Math.PI * Math.min(fc, sr * 0.45) / sr); a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2; fPrev = fc; }
        const v0 = B[i], v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
        B[i] = v0 - k * v1 - v2;
      }
    }
  }
  return [L, R];
}

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------
/** Stateful noise source. type 'white' | 'pink' | 'brown' */
export class Noise {
  constructor(seed = 'noise', type = 'white') {
    const r = new Rng(seed);
    this.s = (r.u32() | 1) >>> 0;
    this.type = type;
    this.b = new Float64Array(7);
    this.br = 0;
  }
  /** ADD noise into out[start..start+n) with amp (number or array indexed from 0) */
  render(out, start, n, amp = 1) {
    let s = this.s;
    const ampArr = typeof amp === 'object' ? amp : null;
    const b = this.b;
    const end = start + n;
    for (let i = start, k = 0; i < end; i++, k++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      const w = s / 2147483648 - 1;
      let v;
      if (this.type === 'white') v = w;
      else if (this.type === 'pink') {
        // Paul Kellet's refined pink filter
        b[0] = 0.99886 * b[0] + w * 0.0555179; b[1] = 0.99332 * b[1] + w * 0.0750759;
        b[2] = 0.969 * b[2] + w * 0.153852; b[3] = 0.8665 * b[3] + w * 0.3104856;
        b[4] = 0.55 * b[4] + w * 0.5329522; b[5] = -0.7616 * b[5] - w * 0.016898;
        v = (b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362) * 0.11;
        b[6] = w * 0.115926;
      } else { this.br = (this.br + 0.02 * w) / 1.02; v = this.br * 3.5; }
      out[i] += v * (ampArr ? ampArr[k] : amp);
    }
    this.s = s;
    return out;
  }
}
/** one-shot noise buffer */
export function noise(n, seed = 'noise', type = 'white', amp = 1) {
  const out = new Float32Array(n);
  new Noise(seed, type).render(out, 0, n, amp);
  return out;
}
