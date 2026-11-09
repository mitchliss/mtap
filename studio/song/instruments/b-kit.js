// Musician B toolkit: the drum voices the engine kit does not cover the way this record needs them
// (four kick designs per brief section 9, acoustic-style hats with real 3-8 kHz presence, tambourine, timpani,
// sub boom), the transition FX (width-growing noise riser, pitch riser, impact, sub drop, sub swell, breath),
// plus groove timing helpers and the cue-silence gate for B's stems.
// Every voice renders deterministically from a seed and caches per velocity layer x round-robin variant,
// like a multisampled kit generated in code.
import { SR, Rng, clamp, tanhFast, midiToHz, dbToGain } from '../../engine/core/util.js';
import { Biquad, SVF, OnePole } from '../../engine/core/filters.js';
import { Noise, supersaw } from '../../engine/core/osc.js';
import { Reverb } from '../../engine/fx/reverb.js';
import { CHUNK } from '../../engine/studio.js';

const TAU = Math.PI * 2;

function xnoise(n, seed) {
  const out = new Float32Array(n); let s = (seed | 1) >>> 0;
  for (let i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; out[i] = s / 2147483648 - 1; }
  return out;
}
function peakOf(...bufs) { let p = 0; for (const b of bufs) for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]); if (a > p) p = a; } return p; }
function norm(bufs, target) { const p = peakOf(...bufs); if (p > 0) for (const b of bufs) for (let i = 0; i < b.length; i++) b[i] *= target / p; return bufs; }
function endFade(bufs, n) { for (const b of bufs) { const m = Math.min(n, b.length); for (let i = 0; i < m; i++) b[b.length - 1 - i] *= i / m; } }

/** damped-rotation partial bank (no per-sample sin): adds sum of decaying partials into X */
function partials(X, freqs, sr) {
  const n = X.length;
  for (const { f, amp, t60, ph } of freqs) {
    if (f >= sr * 0.48) continue;
    const kk = Math.exp(-6.9 / (t60 * sr)), w = (TAU * f) / sr;
    let re = amp * Math.cos(ph), im = amp * Math.sin(ph);
    const c = kk * Math.cos(w), s = kk * Math.sin(w);
    const len = Math.min(n, Math.ceil(Math.log(1e-6 / Math.max(1e-9, amp)) / Math.log(kk)));
    for (let i = 0; i < len; i++) { const nr = re * c - im * s; im = re * s + im * c; re = nr; X[i] += im; }
  }
}

// =============================================================================================== kicks
/**
 * Kick designs (brief section 9). tail = body pitch the sweep settles on (Hz), start = sweep start (Hz), tp = pitch tau (s),
 * hold/tau = amplitude hold then exponential tau (s), drive (tanh), bias (even harmonics -> 2nd at 110/124 Hz for phones),
 * click (linear level), clickHz, clickMs, tok (big-room "tok" layer level), lp (Hz), len (s).
 */
export const KICKS = {
  // round, no click: 52-55 Hz sine with a +24 st -> 0 pitch drop, the "felt" verse kick
  verse: { tail: 55, start: 220, tp: 0.03, hold: 0.004, tau: 0.16, drive: 1.25, bias: 0.06, click: 0, lp: 1800, len: 0.7, knock: 0.18 },
  // warm, full pop kick (drop1 / verse2): 190 -> 55 Hz, short beater click at 4 kHz, tanh 1.6.
  // cut 3 (brief section 7 "Low-end pitch"): tau 0.17 -> 0.13 so the A1 tail is gone before it rubs the Bb1 sub
  pop: { tail: 55, start: 190, tp: 0.025, hold: 0.008, tau: 0.13, drive: 1.7, bias: 0.12, click: dbToGain(-12), clickHz: 4000, clickMs: 0.002, lp: 9000, len: 0.7, knock: 0.3 },
  // punchier club kick (drop2, builds): 220 -> 55 Hz, more click. cut 3: tau 0.20 -> 0.13 (D2 tonic comes through)
  club: { tail: 55, start: 220, tp: 0.022, hold: 0.01, tau: 0.13, drive: 2.1, bias: 0.15, click: dbToGain(-9), clickHz: 4500, clickMs: 0.0025, lp: 12000, len: 0.72, knock: 0.25 },
  // big-room (drop3+): a driven "tok" at 1 kHz, a 3 ms click, saturated tail.
  // cut 3: the tail is tuned to the TONIC, 230 -> 41.2 Hz (E1; cut 2 held B1 = 61.7 Hz, a semitone under every C bar),
  // hold 0.12 -> 0.03 s, tau 0.27 -> 0.13 s. Kick and sub share E1 on the tonic bars; the drive's 2nd/3rd harmonics
  // (E2 82 Hz, B2 124 Hz) carry it on earbuds. tp 0.02 -> 0.024: with the lower tail the sweep would rush through the
  // 80-120 Hz punch zone ~25 % faster, so the pitch envelope is slowed to keep the same knock in the chest.
  // notch: a narrow -10 dB cut at 62.5 Hz (Q 6) where the sweep crosses B1/C2: measured on the first cut-3 bounce, the
  // kick's 62.5 Hz line added to the C2 bass's own beat-rate sideband and failed drop3b bar 3 (E1 and E2 lose < 1 dB).
  bigroom: { tail: 41.2, start: 230, tp: 0.024, hold: 0.03, tau: 0.13, drive: 2.8, bias: 0.2, click: dbToGain(-9), clickHz: 5000, clickMs: 0.003, tok: 0.42, lp: 14000, len: 0.8, knock: 0, notch: { hz: 62.5, q: 6, db: -10 } },
};

function kickFn(p, v, r, sr) {
  const n = Math.round(p.len * sr), X = new Float32Array(n);
  const tail = p.tail * r.range(0.997, 1.003), start = p.start * (0.9 + 0.15 * v), tp = p.tp * r.range(0.95, 1.05);
  const hold = Math.round(p.hold * sr), kA = Math.exp(-1 / (p.tau * r.range(0.97, 1.03) * sr)), att = Math.max(1, Math.round(0.0005 * sr));
  const drive = p.drive * (0.75 + 0.35 * v), b = p.bias, tb = Math.tanh(b), dn = Math.tanh(drive + b) - tb;
  let ph = 0, a = 1, ph2 = r.float();
  const kn = p.knock || 0, kK = Math.exp(-1 / (0.022 * sr));
  let ak = 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = tail * (1 - 0.015 * Math.min(1, t / p.len)) + (start - tail) * Math.exp(-t / tp);
    ph += f / sr; if (ph >= 1) ph -= 1;
    ph2 += (f * 2.6) / sr; if (ph2 >= 1) ph2 -= 1;
    if (i > hold) a *= kA;
    const at = i < att ? i / att : 1;
    const s = Math.sin(TAU * ph) * a * at + (kn ? Math.sin(TAU * ph2) * ak * kn * at : 0);
    ak *= kK;
    X[i] = (Math.tanh(drive * s + b) - tb) / dn;
  }
  // beater click: band-passed noise burst
  if (p.click > 0) {
    const cn = Math.round((p.clickMs * 3 + 0.002) * sr), nz = xnoise(cn, r.u32());
    new SVF('bp', p.clickHz * r.range(0.92, 1.08), 0.9, sr).process(nz);
    const lvl = p.click * (0.55 + 0.6 * v) * 2.2, tau = p.clickMs * sr / 2.2;
    for (let i = 0; i < cn; i++) X[i] += nz[i] * lvl * Math.exp(-i / tau);
  }
  // big-room "tok": 190 -> 150 Hz sine over 35 ms, overdriven, band-passed at 1 kHz
  if (p.tok) {
    const tn = Math.round(0.07 * sr), T = new Float32Array(tn); let q = 0;
    for (let i = 0; i < tn; i++) {
      const t = i / sr, f = 150 + 40 * Math.exp(-t / 0.012);
      q += f / sr; if (q >= 1) q -= 1;
      T[i] = tanhFast(Math.sin(TAU * q) * 6) * Math.exp(-t / 0.016) * Math.min(1, i / (0.0006 * sr));
    }
    new SVF('bp', 1000, 0.8, sr).process(T); new SVF('bp', 1000, 0.8, sr).process(T);
    const lvl = p.tok * (0.6 + 0.5 * v) * 3;
    for (let i = 0; i < tn; i++) X[i] += T[i] * lvl;
  }
  new Biquad('lp', p.lp * (0.8 + 0.3 * v), 0.6, 0, sr).process(X);
  new Biquad('hp', 26, 0.7, 0, sr).process(X);
  norm([X], 0.97);
  // optional carve, after the level is set (so the fundamental keeps its level): a peaking cut on the sweep between the
  // kick's tuned harmonics. Cut 3: the big-room kick keeps the B1 / C2 zone (60-65 Hz) free for the rolling bass, so a
  // C bar's low end is the C, not the kick sweeping through B (and the 60-65 Hz "one-note boom" the label heard is gone)
  if (p.notch) new Biquad('peak', p.notch.hz, p.notch.q, p.notch.db, sr).process(X);
  return [X, X];
}

// =============================================================================================== hats / tambourine
/** acoustic-style hi-hat: inharmonic bronze partials 3-15 kHz + bright noise + stick tick. p: open, decay, tone */
function hatFn(p, v, r, sr) {
  const open = !!p.open;
  const dec = (open ? p.openDecay ?? 0.42 : p.decay ?? 0.055) * (0.75 + 0.4 * v) * r.range(0.93, 1.07);
  const n = Math.round((dec * 1.7 + 0.015) * sr);
  const out = [new Float32Array(n), new Float32Array(n)];
  const base = []; const fr = new Rng(`hatfreqs:${p.seed ?? 0}`); // the same cymbal for every hit: shared partial set
  for (let k = 0; k < 30; k++) base.push(3200 * Math.pow(15000 / 3200, fr.float()));
  for (let c = 0; c < 2; c++) {
    const X = out[c];
    partials(X, base.map((f) => ({ f: f * r.range(0.998, 1.002), amp: r.range(0.35, 1) / 30 * (f < 5000 ? 0.75 : 1), t60: dec * r.range(0.55, 1.25) * (f > 10000 ? 0.75 : 1), ph: r.range(0, TAU) })), sr);
    const nz = xnoise(n, r.u32());
    new Biquad('hp', 5200, 0.7, 0, sr).process(nz); new Biquad('peak', p.tone ?? 8500, 0.9, 4, sr).process(nz);
    const kn = Math.exp(-6.9 / (dec * 0.75 * sr)); let a = 1;
    for (let i = 0; i < n; i++) { X[i] = X[i] * 2.2 + nz[i] * a * (0.32 + 0.22 * v); a *= kn; }
    // stick tick (presence): 1.5 ms burst around 3.5 kHz
    const tn = Math.round(0.004 * sr), tk = xnoise(tn, r.u32());
    new SVF('bp', 3600, 1.1, sr).process(tk);
    for (let i = 0; i < tn; i++) X[i] += tk[i] * 0.9 * v * Math.exp(-i / (0.0009 * sr));
    new Biquad('hp', 2600, 0.7, 0, sr).process(X); new Biquad('hp', 2600, 0.7, 0, sr).process(X);
    new OnePole('lp', 8000 + 9000 * v, sr).process(X);
    const at = Math.round(0.0003 * sr); for (let i = 0; i < at; i++) X[i] *= i / at;
  }
  endFade(out, 64);
  return norm(out, 0.75);
}

/** tambourine: a shaker rattle plus jingle partials (6.2 / 8.1 / 9.7 kHz family) re-struck by the jingle collisions */
function tambFn(p, v, r, sr) {
  const n = Math.round(0.42 * sr), out = [new Float32Array(n), new Float32Array(n)];
  // collision envelope: 4-6 bursts over ~40 ms (the jingles slap back), then free ring
  const bursts = []; let t = 0; const nb = r.int(4, 6);
  for (let k = 0; k < nb; k++) { bursts.push([t, k === 0 ? 1 : r.range(0.25, 0.6) * Math.pow(0.8, k)]); t += r.range(0.006, 0.014); }
  const env = new Float32Array(n);
  for (const [t0, a] of bursts) { const s = Math.round(t0 * sr); for (let i = s; i < n; i++) env[i] += a * Math.exp(-(i - s) / (0.11 * sr)); }
  const jf = [6200, 8100, 9700, 5300, 7300, 11200, 12600];
  for (let c = 0; c < 2; c++) {
    const X = out[c], J = new Float32Array(n);
    partials(J, jf.flatMap((f) => [0.996, 1.004].map((d) => ({ f: f * d * r.range(0.995, 1.005), amp: r.range(0.5, 1) / 10, t60: r.range(0.18, 0.32), ph: r.range(0, TAU) }))), sr);
    const nz = xnoise(n, r.u32());
    new SVF('bp', 6500, 0.7, sr).process(nz); new Biquad('hp', 3000, 0.7, 0, sr).process(nz);
    for (let i = 0; i < n; i++) X[i] = J[i] * env[i] * 3 + nz[i] * env[i] * Math.exp(-i / (0.045 * sr)) * 0.8 * (0.6 + 0.5 * v);
    new Biquad('hp', 2800, 0.7, 0, sr).process(X);
    const at = Math.round(0.004 * sr); for (let i = 0; i < at; i++) X[i] *= i / at;
  }
  endFade(out, 64);
  return norm(out, 0.7);
}

// =============================================================================================== timpani / boom
/** timpani: kettle-drum preferred modes (1, 1.5, 1.74, 2, 2.24, 2.5) over a felt mallet thump, note.midi = pitch */
function timpFn(p, v, r, sr, note) {
  const f0 = midiToHz(note.midi ?? 40), dk = p.decay ?? 1;
  const n = Math.round(3.2 * dk * sr), X = new Float32Array(n);
  const modes = [[1, 1, 2.6], [1.504, 0.55, 1.9], [1.742, 0.36, 1.4], [2.0, 0.3, 1.2], [2.245, 0.2 * (0.5 + v), 0.9], [2.494, 0.14 * (0.4 + v), 0.7], [2.8, 0.08 * v, 0.5]];
  for (const [ratio, amp, t60] of modes) {
    const k = Math.exp(-6.9 / (t60 * dk * sr)); let a = amp, ph = r.float();
    for (let i = 0; i < n && a > 1e-5; i++) {
      const pd = 1 + 0.025 * Math.exp(-i / (0.05 * sr)); // head tension settles after the stroke
      ph += (f0 * ratio * pd) / sr; if (ph >= 1) ph -= 1;
      X[i] += Math.sin(TAU * ph) * a * Math.min(1, i / (0.002 * sr)); a *= k;
    }
  }
  const mn = Math.round(0.03 * sr), nz = xnoise(mn, r.u32());
  new Biquad('lp', 900 + 900 * v, 0.7, 0, sr).process(nz);
  for (let i = 0; i < mn; i++) X[i] += nz[i] * 0.55 * v * Math.exp(-i / (0.006 * sr));
  for (let i = 0; i < n; i++) X[i] = tanhFast(X[i] * 1.3);
  new Biquad('hp', 35, 0.7, 0, sr).process(X);
  const R = Float32Array.from(X); for (let i = n - 1; i >= 13; i--) R[i] = R[i] * 0.85 + X[i - 13] * 0.15;
  endFade([X, R], 400);
  return norm([X, R], 0.9);
}

/** cached multisample-style voice: velocity layers x round-robin variants (pitched voices cache per midi too) */
export class BVoice {
  constructor(kind, fn, params = {}, seed = 'b', { midi = 60, layers = 5, variants = 4, choke = false, chokeFade = 0.006, pitched = false } = {}) {
    this.kind = kind; this.name = kind; this.fn = fn; this.params = params; this.seed = seed; this.midi = midi;
    this.layers = layers; this.variants = variants; this.choke = choke; this.chokeFade = chokeFade; this.pitched = pitched;
    this.cache = new Map(); this.rr = 0; this.tail = 0.05; this.sr = SR; this.opts = {};
  }
  render(note = {}) {
    const v = clamp(note.vel ?? 0.85, 0.02, 1);
    const layer = Math.min(this.layers - 1, Math.floor(v * this.layers));
    const variant = note.rr !== undefined ? note.rr % this.variants : this.rr++ % this.variants;
    const key = `${variant}|${layer}${this.pitched ? `|${note.midi}` : ''}`;
    let base = this.cache.get(key);
    if (!base) {
      const lv = (layer + 0.75) / this.layers;
      base = this.fn(this.params, lv, new Rng(`${this.seed}:${this.kind}:${key}`), this.sr, note);
      base.lv = lv; this.cache.set(key, base);
    }
    const g = Math.pow(v / base.lv, 1.15) * (note.gain ?? 1);
    let n = base[0].length, chokeAt = -1, cf = Math.max(1, Math.round(this.chokeFade * this.sr));
    if (this.choke && note.dur !== undefined && note.dur * this.sr < n) { chokeAt = Math.max(0, Math.round(note.dur * this.sr) - cf); n = chokeAt + cf; }
    const L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let e = g;
      if (chokeAt >= 0 && i > chokeAt) { const x = 1 - (i - chokeAt) / cf; e *= x * x; }
      L[i] = base[0][i] * e; R[i] = base[1][i] * e;
    }
    return [L, R];
  }
}

export const kickVoice = (type, seed = 'bk') => new BVoice(`kick-${type}`, kickFn, KICKS[type], seed, { midi: 36, choke: true, chokeFade: 0.005, variants: 3 });
export const hatVoice = (open, params = {}, seed = 'bh') => new BVoice(open ? 'openhat' : 'hat', hatFn, { ...params, open }, seed, { midi: open ? 46 : 42, choke: true, chokeFade: 0.012 });
export const tambVoice = (seed = 'bt') => new BVoice('tamb', tambFn, {}, seed, { midi: 54 });
export const timpaniVoice = (params = {}, seed = 'btimp') => new BVoice('timpani', timpFn, params, seed, { midi: 41, pitched: true, variants: 3 });

/**
 * Wrap a voice so each note can be re-pitched (varispeed, note.semis) and high-passed (note.hp Hz): build snare rolls
 * that climb in pitch while their low end thins out.
 */
export class RollVoice {
  constructor(base) { this.base = base; this.name = `${base.name}-roll`; this.midi = base.midi; this.tail = 0.05; this.opts = {}; }
  render(note) {
    const [L, R] = this.base.render({ vel: note.vel, rr: note.rr });
    const rate = Math.pow(2, (note.semis ?? 0) / 12);
    const vs = (X) => { if (Math.abs(rate - 1) < 1e-4) return Float32Array.from(X); const m = Math.floor((X.length - 1) / rate), o = new Float32Array(m); for (let i = 0; i < m; i++) { const x = i * rate, k = Math.floor(x), f = x - k; o[i] = X[k] * (1 - f) + X[k + 1] * f; } return o; };
    const out = [vs(L), vs(R)];
    if (note.hp) for (const X of out) { new Biquad('hp', note.hp, 0.7, 0, SR).process(X); new Biquad('hp', note.hp, 0.7, 0, SR).process(X); }
    if (note.lp) for (const X of out) { new Biquad('lp', note.lp, 0.7, 0, SR).process(X); new Biquad('lp', note.lp, 0.7, 0, SR).process(X); }
    if (note.dur !== undefined) { const m = Math.min(out[0].length, Math.round(note.dur * SR)), f = Math.min(m, Math.round(0.005 * SR)); for (const X of out) { for (let i = 0; i < f; i++) X[m - 1 - i] *= i / f; X.fill(0, m); } }
    return out;
  }
}

// =============================================================================================== transition FX
/**
 * Noise riser (brief: decorrelated L/R noise into a BP sweep 400 Hz -> 9 kHz, Q 1.5; gain -30 -> -15 dB; width grows
 * from near-mono to 0.6 at most, so the build stays narrow and the drop is what opens up).
 * Ends exactly at time + dur with a 5 ms stop (it never plays into a silence). opts: { from, to, q, startDb, endDb, seed }
 */
export class NoiseRiser {
  constructor(opts = {}) { this.o = opts; this.name = 'noise-riser'; this.midi = 96; this.tail = 0.01; this.opts = {}; }
  render(note) {
    const o = this.o, sr = SR, n = Math.round(Math.max(0.2, note.dur) * sr);
    const from = o.from ?? 400, to = o.to ?? 9000, q = o.q ?? 1.5, sDb = o.startDb ?? -30, eDb = o.endDb ?? -15;
    const M = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n), cut = new Float32Array(n), amp = new Float32Array(n);
    const seed = `${o.seed ?? 'nr'}:${note.time.toFixed(3)}`;
    new Noise(`${seed}M`).render(M, 0, n, 1); new Noise(`${seed}A`).render(A, 0, n, 1); new Noise(`${seed}B`).render(B, 0, n, 1);
    for (let i = 0; i < n; i++) { const x = i / n; cut[i] = from * Math.pow(to / from, Math.pow(x, 1.25)); amp[i] = dbToGain(sDb + (eDb - sDb) * Math.pow(x, 0.85)); }
    for (const X of [M, A, B]) { new SVF('bp', from, q, sr).process(X, 0, n, cut); new SVF('bp', from, q * 0.8, sr).process(X, 0, n, cut); }
    const L = new Float32Array(n), R = new Float32Array(n), stop = Math.round(0.005 * sr);
    for (let i = 0; i < n; i++) {
      const x = i / n, w = 0.15 + 0.45 * x; // width grows from near-mono to 0.6 (cut 2: never fully decorrelated)
      const e = amp[i] * (i > n - stop ? (n - i) / stop : 1) * 2.2;
      L[i] = (M[i] * (1 - w) + A[i] * w) * e; R[i] = (M[i] * (1 - w) + B[i] * w) * e;
    }
    const g = (note.gain ?? 1) * (note.vel ?? 1);
    for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
    return [L, R];
  }
}

/** Pitch riser: one supersaw note gliding up `semis` over dur, low-pass opening, gain rising; stops dead at the end. */
export class PitchRiser {
  constructor(opts = {}) { this.o = opts; this.name = 'pitch-riser'; this.midi = 72; this.tail = 0.01; this.opts = {}; }
  render(note) {
    const o = this.o, sr = SR, n = Math.round(note.dur * sr), semis = o.semis ?? 12, f0 = midiToHz(note.midi ?? 57);
    const fr = new Float32Array(n), cut = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / n; fr[i] = f0 * Math.pow(2, (semis * Math.pow(x, 1.4)) / 12); cut[i] = 500 * Math.pow(16, Math.pow(x, 1.1)); }
    const [L, R] = supersaw({ freq: fr, n, voices: 7, detune: 0.45, mix: 0.75, spread: 0.9, seed: `pr:${note.time.toFixed(2)}` });
    new SVF('lp', 500, 1.1, sr).process(L, 0, n, cut); new SVF('lp', 500, 1.1, sr).process(R, 0, n, cut);
    const stop = Math.round(0.005 * sr), g = (note.gain ?? 1) * (note.vel ?? 1);
    for (let i = 0; i < n; i++) { const x = i / n, e = dbToGain(-26 + 26 * Math.pow(x, 0.7)) * (i > n - stop ? (n - i) / stop : 1) * g; L[i] *= e; R[i] *= e; }
    return [L, R];
  }
}

/** Impact (brief: sine 60 -> 35 Hz, tau 0.5 s, + 40 ms noise burst LP 5 kHz, + hall 4 s at 30 %), plus a short
 *  120 -> 60 Hz body thump so phones feel the hit. */
export class ImpactB {
  constructor(opts = {}) { this.o = opts; this.name = 'impact'; this.midi = 24; this.tail = 0.1; this.opts = {}; this.cache = null; }
  render(note) {
    if (this.cache) return this.cache.map((x) => x.map((s) => s * (note.vel ?? 1)));
    const sr = SR, n = Math.round(4.2 * sr), L = new Float32Array(n), R = new Float32Array(n);
    let ph = 0, ph2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, f = 35 + 25 * Math.exp(-t / 0.5); // never below 35 Hz (cut 2, no subsonic waste)
      ph += f / sr; ph2 += (60 + 60 * Math.exp(-t / 0.03)) / sr;
      const sub = Math.tanh(Math.sin(TAU * ph) * 1.8) * Math.exp(-t / 0.55) * Math.min(1, i / 40);
      const body = Math.sin(TAU * ph2) * Math.exp(-t / 0.06) * 0.6;
      L[i] = R[i] = sub * 0.9 + body;
    }
    const nn = Math.round(0.06 * sr), nz = xnoise(nn, 77), nz2 = xnoise(nn, 91);
    new Biquad('lp', 5000, 0.7, 0, sr).process(nz); new Biquad('lp', 5000, 0.7, 0, sr).process(nz2);
    for (let i = 0; i < nn; i++) { const e = Math.exp(-i / (0.013 * sr)) * 0.9; L[i] += nz[i] * e; R[i] += nz2[i] * e; }
    const wl = Float32Array.from(L), wr = Float32Array.from(R);
    new Reverb({ preset: 'hall', decay: 4, size: 1.2, lowcut: 180, highcut: 6000, seed: 'bimpact' }).process(wl, wr, 0, n);
    for (let i = 0; i < n; i++) { L[i] += wl[i] * 0.42; R[i] += wr[i] * 0.42; }
    endFade([L, R], Math.round(0.4 * sr));
    norm([L, R], 0.95);
    this.cache = [L, R];
    return this.render(note);
  }
}

/** Sub drop: sine gliding 55 -> 36 Hz (never below 35 Hz) over ~1 s with a touch of 2nd harmonic (so phones hear the fall). */
export class SubDrop {
  constructor(opts = {}) { this.o = opts; this.name = 'subdrop'; this.midi = 28; this.tail = 0.05; this.opts = {}; }
  render(note) {
    const sr = SR, len = note.dur ?? 1.1, n = Math.round(len * sr), X = new Float32Array(n), f0 = this.o.from ?? 55, f1 = Math.max(36, this.o.to ?? 36);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const x = i / n, f = f0 * Math.pow(f1 / f0, Math.pow(x, 0.8));
      ph += f / sr;
      const e = Math.min(1, i / (0.004 * sr)) * Math.pow(1 - x, 1.4);
      const s = Math.sin(TAU * ph);
      X[i] = (Math.tanh(1.6 * s + 0.25) - Math.tanh(0.25)) / Math.tanh(1.6) * e;
    }
    new Biquad('hp', 20, 0.7, 0, sr).process(X);
    norm([X], 0.95 * (note.vel ?? 1));
    return [X, Float32Array.from(X)];
  }
}

/** Sub swell into a downbeat ("soft" cue): sine at note.midi rising over `pre` seconds, peaking on the downbeat
 *  (note.time + pre), then decaying. Rendered starting at note.time. */
export class SubSwell {
  constructor(opts = {}) { this.o = opts; this.name = 'subswell'; this.midi = 38; this.tail = 0.05; this.opts = {}; }
  render(note) {
    const sr = SR, pre = note.pre ?? 0.5, post = note.post ?? 1.2, n = Math.round((pre + post) * sr), X = new Float32Array(n), f = midiToHz(note.midi ?? 38);
    let ph = 0; const np = Math.round(pre * sr);
    for (let i = 0; i < n; i++) {
      ph += f / sr;
      const e = i < np ? Math.pow(i / np, 2.2) : Math.exp(-(i - np) / (0.35 * sr));
      X[i] = (Math.sin(TAU * ph) + 0.18 * Math.sin(2 * TAU * ph)) * e;
    }
    endFade([X], 200);
    norm([X], 0.9 * (note.vel ?? 1));
    return [X, Float32Array.from(X)];
  }
}

/** Sub boom (tag hits): 45-60 Hz sine, small pitch drop, tau 0.6 s, gently saturated. note.midi = pitch */
export class SubBoom {
  constructor(opts = {}) { this.o = opts; this.name = 'subboom'; this.midi = 33; this.tail = 0.05; this.opts = {}; }
  render(note) {
    const sr = SR, f = midiToHz(note.midi ?? 33), tau = note.tau ?? 0.6, n = Math.round(tau * 6 * sr), X = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr; ph += f * (1 + 0.5 * Math.exp(-t / 0.04)) / sr;
      X[i] = tanhFast(Math.sin(TAU * ph) * 1.5) * Math.exp(-t / tau) * Math.min(1, i / (0.002 * sr));
    }
    new Biquad('lp', 220, 0.7, 0, sr).process(X);
    endFade([X], 400);
    norm([X], 0.95 * (note.vel ?? 1));
    return [X, Float32Array.from(X)];
  }
}

/** Breath (inhale) for the build3 gap: pink noise through two formant band-passes rising slightly, 350 ms attack, 80 ms release. */
export class Breath {
  constructor() { this.name = 'breath'; this.midi = 80; this.tail = 0.01; this.opts = {}; }
  render(note) {
    const sr = SR, n = Math.round(note.dur * sr), A = new Float32Array(n), B = new Float32Array(n);
    new Noise('breathA', 'pink').render(A, 0, n, 1); new Noise('breathB', 'pink').render(B, 0, n, 1);
    const f1 = new Float32Array(n), f2 = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / n; f1[i] = 1100 + 250 * x; f2[i] = 2500 + 400 * x; }
    const A2 = Float32Array.from(A), B2 = Float32Array.from(B);
    new SVF('bp', 1200, 0.8, sr).process(A, 0, n, f1); new SVF('bp', 2600, 1.6, sr).process(A2, 0, n, f2);
    new SVF('bp', 1200, 0.8, sr).process(B, 0, n, f1); new SVF('bp', 2600, 1.6, sr).process(B2, 0, n, f2);
    const L = new Float32Array(n), R = new Float32Array(n), na = Math.round(0.35 * sr), nr = Math.round(0.08 * sr);
    for (let i = 0; i < n; i++) {
      const e = i < na ? Math.pow(i / na, 1.6) : i > n - nr ? (n - i) / nr : 1;
      L[i] = (A[i] + A2[i] * 0.7) * e; R[i] = (B[i] * 0.6 + A[i] * 0.4 + A2[i] * 0.6) * e;
    }
    new Biquad('hp', 500, 0.7, 0, sr).process(L); new Biquad('hp', 500, 0.7, 0, sr).process(R);
    norm([L, R], 0.8 * (note.vel ?? 1));
    return [L, R];
  }
}

// =============================================================================================== groove + stems
/** seconds of 16th `step` inside a section, with MPC-style swing on the odd 16ths (pct 50 = straight) */
export function swingT(sec, step, pct = 50) { return sec.step(step + (step % 2 === 1 ? (2 * pct) / 100 - 1 : 0)); }

/** pattern string -> [{ step, acc }] ; X = accent 1, x = 0.8, o = ghost 0.45 */
export function pat(str) {
  const s = str.replace(/[\s|]/g, ''), out = [];
  for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '.') continue; out.push({ step: i, acc: c === 'X' ? 1 : c === 'x' ? 0.8 : 0.45 }); }
  return out;
}

function writeBack(stem, frame, L, R) {
  let i = 0; const n = L.length;
  while (i < n) {
    const f = frame + i, ci = Math.floor(f / CHUNK), off = f - ci * CHUNK, m = Math.min(n - i, CHUNK - off);
    const c = stem.chunks[ci];
    if (c) { c[0].set(L.subarray(i, i + m), off); c[1].set(R.subarray(i, i + m), off); }
    i += m;
  }
}

/** multiply [t0, t1) of a stem by gainAt(t) in place */
export function shapeStem(studio, stem, t0, t1, gainAt) {
  const sr = studio.sr, f0 = Math.max(0, Math.floor(t0 * sr)), f1 = Math.ceil(t1 * sr), n = f1 - f0;
  if (n <= 0 || !stem.hasData(f0, n)) return;
  const L = new Float32Array(n), R = new Float32Array(n);
  stem.read(f0, n, L, R);
  for (let i = 0; i < n; i++) { const g = gainAt((f0 + i) / sr); L[i] *= g; R[i] *= g; }
  writeBack(stem, f0, L, R);
}

/** cue silences: stems stop dead (fade <= 5 ms) at each window start and stay at zero until the downbeat */
export function gateSilences(studio, stems, fade = 0.004) {
  for (const st of stems) for (const z of studio.silences) {
    shapeStem(studio, st, z.start - fade, z.end, (t) => (t < z.start ? clamp((z.start - t) / fade, 0, 1) : 0));
  }
}
