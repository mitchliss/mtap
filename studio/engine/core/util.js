// Core utilities: constants, unit conversions, seeded RNG, buffer helpers.
// Everything here is deterministic. Never use Math.random() anywhere in the studio.

export const SR = 44100;
export const TAU = Math.PI * 2;
export const NYQ = SR / 2;

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(Math.abs(g), 1e-12));
export const centsToRatio = (c) => Math.pow(2, c / 1200);
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const secToFrames = (s, sr = SR) => Math.round(s * sr);

const NOTE_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** 'C4' -> 60, 'F#3' -> 54, 'Bb2' -> 46. Numbers pass through. */
export function noteToMidi(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(String(n).trim());
  if (!m) throw new Error(`bad note name ${n}`);
  let pc = NOTE_PC[m[1].toLowerCase()];
  for (const ch of m[2]) pc += ch === '#' ? 1 : -1;
  return pc + (parseInt(m[3], 10) + 1) * 12;
}

/** Equal-power pan for a mono source. pan -1..1. Centre gives 0.7071 per side (-3 dB law). */
export function panGains(pan = 0) {
  const a = (clamp(pan, -1, 1) + 1) * Math.PI / 4;
  return [Math.cos(a), Math.sin(a)];
}
/** Balance for an already-stereo source: centre = unity on both sides. */
export function balanceGains(pan = 0) {
  const p = clamp(pan, -1, 1);
  return [p > 0 ? Math.cos(p * Math.PI / 2) : 1, p < 0 ? Math.cos(-p * Math.PI / 2) : 1];
}

// ---------------------------------------------------------------------------
// Seeded RNG (sfc32 seeded from a string/number hash). Fast and good quality.
// ---------------------------------------------------------------------------
function hashSeed(seed) {
  const s = String(seed);
  let h1 = 1779033703 ^ s.length, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < s.length; i++) {
    const k = s.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

export class Rng {
  constructor(seed = 1) {
    [this.a, this.b, this.c, this.d] = hashSeed(seed);
    for (let i = 0; i < 12; i++) this.u32();
    this._g = null;
  }
  u32() {
    let { a, b, c, d } = this;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t >>> 0;
  }
  /** [0,1) */
  float() { return this.u32() / 4294967296; }
  /** [-1,1) */
  bi() { return this.float() * 2 - 1; }
  range(lo, hi) { return lo + (hi - lo) * this.float(); }
  /** integer in [lo, hi] inclusive */
  int(lo, hi) { return lo + Math.floor(this.float() * (hi - lo + 1)); }
  pick(arr) { return arr[Math.floor(this.float() * arr.length)]; }
  chance(p) { return this.float() < p; }
  gauss(mean = 0, sd = 1) {
    if (this._g !== null) { const g = this._g; this._g = null; return mean + sd * g; }
    let u = 0, v = 0, s = 0;
    do { u = this.bi(); v = this.bi(); s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    this._g = v * m;
    return mean + sd * u * m;
  }
  /** a child RNG with an independent, reproducible stream */
  fork(tag = '') { return new Rng(`${this.u32()}:${tag}`); }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.float() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
}
export const rng = (seed) => new Rng(seed);

// ---------------------------------------------------------------------------
// Buffer helpers. Stereo buffers are [L, R] pairs of Float32Array.
// ---------------------------------------------------------------------------
export const mono = (n) => new Float32Array(Math.max(0, Math.ceil(n)));
export const stereo = (n) => [mono(n), mono(n)];
export const framesOf = (sec, sr = SR) => Math.max(0, Math.ceil(sec * sr));

/** dst[offset+i] += src[i]*gain (bounds-checked) */
export function mixInto(dst, src, offset = 0, gain = 1) {
  const n0 = Math.max(0, -offset), n1 = Math.min(src.length, dst.length - offset);
  for (let i = n0; i < n1; i++) dst[offset + i] += src[i] * gain;
  return dst;
}
export function scale(buf, g) { for (let i = 0; i < buf.length; i++) buf[i] *= g; return buf; }
/** multiply buf by env (same index), env shorter => zero after */
export function applyEnv(buf, env) {
  const n = Math.min(buf.length, env.length);
  for (let i = 0; i < n; i++) buf[i] *= env[i];
  for (let i = n; i < buf.length; i++) buf[i] = 0;
  return buf;
}
export function fadeIn(buf, n) { n = Math.min(n, buf.length); for (let i = 0; i < n; i++) buf[i] *= Math.sin((i / n) * Math.PI / 2) ** 2; return buf; }
export function fadeOut(buf, n) {
  n = Math.min(n, buf.length); const L = buf.length;
  for (let i = 0; i < n; i++) buf[L - n + i] *= Math.cos((i / n) * Math.PI / 2) ** 2;
  return buf;
}
export function reverse(buf) { return buf.slice().reverse(); }
export function peak(buf) { let p = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > p) p = a; } return p; }
export function rms(buf) { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / Math.max(1, buf.length)); }
export function normalize(buf, target = 1) { const p = peak(buf); if (p > 0) scale(buf, target / p); return buf; }
/** mono -> stereo with equal-power pan */
export function toStereo(m, pan = 0, gain = 1) {
  const [gl, gr] = panGains(pan);
  const L = new Float32Array(m.length), R = new Float32Array(m.length);
  for (let i = 0; i < m.length; i++) { L[i] = m[i] * gl * gain; R[i] = m[i] * gr * gain; }
  return [L, R];
}
/** trim trailing samples below thresh (linear), keep at least minLen */
export function trimTail(buf, thresh = 1e-5, minLen = 0) {
  let n = buf.length;
  while (n > minLen && Math.abs(buf[n - 1]) < thresh) n--;
  return n === buf.length ? buf : buf.subarray(0, n);
}
/** Hermite-interpolated read (x is fractional index) */
export function hermite(buf, x) {
  const i = Math.floor(x), f = x - i;
  const xm1 = buf[i - 1] || 0, x0 = buf[i] || 0, x1 = buf[i + 1] || 0, x2 = buf[i + 2] || 0;
  const c = (x1 - xm1) * 0.5, v = x0 - x1, w = c + v, a = w + v + (x2 - x0) * 0.5, b = w + a;
  return (((a * f) - b) * f + c) * f + x0;
}
/** Varispeed / repitch a mono buffer: rate 2 = octave up (half length). rate may be a function of output index. */
export function varispeed(buf, rate) {
  const fn = typeof rate === 'function';
  const out = [];
  let x = 0, i = 0;
  const maxLen = fn ? buf.length * 8 : Math.ceil(buf.length / rate);
  const res = new Float32Array(maxLen);
  while (x < buf.length - 1 && i < maxLen) { res[i] = hermite(buf, x); x += fn ? rate(i) : rate; i++; }
  void out;
  return res.subarray(0, i);
}

/** fast tanh approximation (Pade), accurate to ~1e-4 in [-3,3], clamps beyond */
export function tanhFast(x) {
  if (x > 4.97) return 1; if (x < -4.97) return -1;
  const x2 = x * x;
  return x * (135135 + x2 * (17325 + x2 * (378 + x2))) / (135135 + x2 * (62370 + x2 * (3150 + x2 * 28)));
}

/** parse musical note length strings like '1/8', '1/8d', '1/8t', '1/4.', 2 (beats) -> beats */
export function noteValueBeats(v) {
  if (typeof v === 'number') return v;
  const m = /^(\d+)\/(\d+)([dt.]?)$/.exec(String(v).trim());
  if (!m) throw new Error(`bad note value ${v}`);
  let beats = (4 * parseInt(m[1], 10)) / parseInt(m[2], 10);
  if (m[3] === 'd' || m[3] === '.') beats *= 1.5;
  if (m[3] === 't') beats *= 2 / 3;
  return beats;
}

/** isFinite guard for a buffer region; returns count of fixed samples */
export function sanitize(buf, start = 0, end = buf.length) {
  let bad = 0;
  for (let i = start; i < end; i++) { const v = buf[i]; if (v !== v || v === Infinity || v === -Infinity) { buf[i] = 0; bad++; } }
  return bad;
}
