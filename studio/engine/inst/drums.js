// Drum toolkit: every voice is synthesized (oscillators + noise + filters), rendered per velocity layer and
// round-robin variant, and cached -- like a multisampled kit, but generated in code.
import { SR, Rng, midiToHz, clamp, tanhFast } from '../core/util.js';
import { renderOsc } from '../core/osc.js';
import { Biquad, SVF, OnePole } from '../core/filters.js';
import { Reverb } from '../fx/reverb.js';

const VEL_LAYERS = 5, VARIANTS = 4;

function xorNoise(n, seed) {
  const out = new Float32Array(n); let s = seed | 1;
  for (let i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; out[i] = (s >>> 0) / 2147483648 - 1; }
  return out;
}
const expEnv = (i, tau) => Math.exp(-i / tau);
function room(L, R, amt, size = 0.3, seed = 'room') {
  if (amt <= 0) return;
  const n = L.length, wl = new Float32Array(n), wr = new Float32Array(n);
  wl.set(L); wr.set(R);
  new Reverb({ preset: 'drum', size, decay: 0.45, er: 0.7, predelay: 0.002, seed, lines: 8 }).process(wl, wr, 0, n);
  for (let i = 0; i < n; i++) { L[i] += wl[i] * amt; R[i] += wr[i] * amt; }
}
function finish(L, R, peakTarget) {
  let pk = 0; for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const g = pk > 0 ? peakTarget / pk : 0;
  for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; }
  const f = Math.min(64, L.length); for (let i = 0; i < f; i++) { const w = i / f; L[L.length - 1 - i] *= w; R[R.length - 1 - i] *= w; }
  return [L, R];
}

// ---------------------------------------------------------------------------- voices
const SYNTH = {
  /** layered kick: click + pitch-swept body (saturated) + clean sub. p: tune (Hz, 50), sweep (x tune, 4.5), punch (pitch tau s, 0.026),
   *  decay (T60 s, 0.42), click (0.35), drive (2.2), sub (0.5), length (0.55) */
  kick(p, v, r, sr) {
    const tune = p.tune ?? 50, len = p.length ?? 0.55, n = Math.round(len * sr);
    const start = tune * (p.sweep ?? 4.5) * (0.85 + 0.25 * v), tp = (p.punch ?? 0.026) * r.range(0.95, 1.05);
    const dec = (p.decay ?? 0.42) * r.range(0.97, 1.03), drive = (p.drive ?? 2.2) * (0.7 + 0.5 * v), subAmt = p.sub ?? 0.5;
    const body = new Float32Array(n), sub = new Float32Array(n);
    let ph = 0;
    const kA = Math.exp(-6.9 / (dec * sr)), kS = Math.exp(-6.9 / (dec * 1.25 * sr)), hold = Math.round(0.012 * sr), att = Math.round(0.0006 * sr);
    let a = 1, as = 1;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = tune * (1 - 0.06 * Math.min(1, t / len)) + (start - tune) * Math.exp(-t / tp);
      ph += f / sr; if (ph >= 1) ph -= 1;
      const s = Math.sin(2 * Math.PI * ph);
      if (i > hold) { a *= kA; as *= kS; }
      const at = i < att ? i / att : 1;
      body[i] = tanhFast(s * a * at * drive) / Math.tanh(drive);
      sub[i] = s * as * at;
    }
    new Biquad('lp', 110, 0.7, 0, sr).process(sub);
    const L = new Float32Array(n);
    // click: short bright noise + "tok" band around 1.5-3 kHz
    const cn = Math.round(0.008 * sr), nz = xorNoise(cn, r.u32());
    const ck = new Float32Array(cn); ck.set(nz);
    new SVF('bp', 2600 * r.range(0.9, 1.1), 1.1, sr).process(ck);
    const click = (p.click ?? 0.35) * (0.5 + 0.7 * v);
    for (let i = 0; i < n; i++) L[i] = body[i] * (1 - subAmt * 0.5) + sub[i] * subAmt + (i < cn ? (ck[i] * 1.6 + nz[i] * 0.25) * expEnv(i, 0.0011 * sr) * click : 0);
    new Biquad('hp', 24, 0.7, 0, sr).process(L);
    return finish(L, Float32Array.from(L), 0.98);
  },
  /** snare: struck membrane (fundamental + inharmonic drumhead modes with pitch drop), stick crack, snare-wire buzz
   *  (bright noise whose decay follows the shell), saturation + small room.
   *  p: tune (1 = 190 Hz head), decay (0.24 wires), body (0.6), wires (1), crack (0.5), room (0.18), tone (5000 Hz wire peak) */
  snare(p, v, r, sr) {
    const n = Math.round(0.45 * sr), tune = p.tune ?? 1, f0 = 190 * tune;
    const L = new Float32Array(n);
    // membrane: circular-plate mode ratios (1, 1.59, 2.14, 2.30, 2.65) with their own decays, 6 ms pitch drop on the strike
    const modes = [[1, 1, 0.13], [1.59, 0.55, 0.08], [2.14, 0.4, 0.06], [2.3, 0.3, 0.05], [2.65, 0.22, 0.04]];
    const body = (p.body ?? 0.6) * (0.8 + 0.3 * v);
    for (const [ratio, amp, t60] of modes) {
      const k = Math.exp(-6.9 / (t60 * sr * (0.9 + 0.2 * v))); let a = amp * body, ph = r.float();
      for (let i = 0; i < n && a > 1e-5; i++) {
        const pd = 1 + 0.35 * Math.exp(-i / (0.006 * sr));
        ph += (f0 * ratio * pd) / sr; if (ph >= 1) ph -= 1;
        L[i] += Math.sin(2 * Math.PI * ph) * a; a *= k;
      }
    }
    // stick crack: very short broadband click, brighter with velocity
    const cn = Math.round(0.004 * sr), ck = xorNoise(cn, r.u32());
    new Biquad('hp', 1100, 0.7, 0, sr).process(ck); new Biquad('lp', 9000, 0.7, 0, sr).process(ck);
    const crack = (p.crack ?? 0.5) * (0.4 + 0.8 * v);
    for (let i = 0; i < cn; i++) L[i] += ck[i] * crack * Math.exp(-i / (0.0007 * sr));
    // wires: noise, band-shaped, decaying with a slower tail (the buzz rides the membrane ring-down)
    const nz = xorNoise(n, r.u32()), dec = (p.decay ?? 0.24) * (0.85 + 0.3 * v);
    new Biquad('hp', 1500, 0.7, 0, sr).process(nz); new Biquad('peak', p.tone ?? 5000, 0.8, 5, sr).process(nz);
    new Biquad('peak', 9000, 1, 2, sr).process(nz);
    new OnePole('lp', 7000 + 6000 * v, sr).process(nz); new Biquad('lp', 12000, 0.7, 0, sr).process(nz);
    const kn = Math.exp(-6.9 / (dec * sr)), kn2 = Math.exp(-6.9 / (dec * 0.35 * sr)), wires = p.wires ?? 1;
    let an = 1, an2 = 1;
    for (let i = 0; i < n; i++) { L[i] += nz[i] * wires * (0.55 * an + 0.6 * an2) * (0.7 + 0.6 * expEnv(i, 0.003 * sr)); an *= kn; an2 *= kn2; }
    for (let i = 0; i < n; i++) L[i] = tanhFast(L[i] * 1.6) / 1.2;
    const R = Float32Array.from(L);
    room(L, R, p.room ?? 0.18, 0.3, r.u32());
    return finish(L, R, 0.9);
  },
  /** clap: 3-4 bursts + tail + micro-room, slightly different per side. p: tone (1150), decay (0.16), room (0.35), bursts (4) */
  clap(p, v, r, sr) {
    const n = Math.round(0.6 * sr), out = [new Float32Array(n), new Float32Array(n)];
    const B = p.bursts ?? 4, dec = (p.decay ?? 0.16) * (0.85 + 0.3 * v);
    for (let c = 0; c < 2; c++) {
      const nz = xorNoise(n, r.u32()), X = out[c];
      let t = c ? r.range(0, 0.0012) : 0;
      for (let b = 0; b < B; b++) {
        const st = Math.round(t * sr), last = b === B - 1, tau = (last ? dec / 6.9 : 0.0022) * sr;
        for (let i = st; i < n; i++) { const k = i - st; const e = Math.min(1, k / (0.0004 * sr)) * Math.exp(-k / tau); if (e < 1e-4 && k > 10) break; X[i] += nz[i] * e * (last ? 1 : 0.85); }
        t += r.range(0.0065, 0.011);
      }
      new SVF('bp', (p.tone ?? 1150) * r.range(0.95, 1.05), 1.3, sr).process(X);
      new Biquad('peak', 2600, 1, 4, sr).process(X); new Biquad('hp', 450, 0.7, 0, sr).process(X);
    }
    room(out[0], out[1], p.room ?? 0.35, 0.28, r.u32());
    return finish(out[0], out[1], 0.9);
  },
  /** metallic hats (808-style square stack + noise). p: tune (1.55), decay (closed 0.07 / open 0.45), open (bool), tone (9000) */
  hat(p, v, r, sr) {
    const open = !!p.open, dec = (p.decay ?? (open ? 0.45 : 0.065)) * (0.7 + 0.5 * v) * r.range(0.93, 1.07);
    const n = Math.round((dec * 1.3 + 0.01) * sr), X = new Float32Array(n);
    const tune = (p.tune ?? 1.55) * r.range(0.995, 1.005);
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) renderOsc('square', X, 0, n, f * tune, { phase: r.float(), amp: 0.25 });
    const nz = xorNoise(n, r.u32());
    for (let i = 0; i < n; i++) X[i] = X[i] * 0.8 + nz[i] * (0.35 + 0.2 * v);
    new SVF('bp', (p.tone ?? 9000) * (0.9 + 0.2 * v), 1.0, sr).process(X);
    new Biquad('hp', 6500, 0.7, 0, sr).process(X); new Biquad('hp', 6500, 0.7, 0, sr).process(X);
    const k = Math.exp(-6.9 / (dec * sr)), att = Math.round(0.0004 * sr);
    let a = 1;
    for (let i = 0; i < n; i++) { X[i] *= (i < att ? i / att : 1) * a; a *= k; }
    const R = Float32Array.from(X);
    for (let i = n - 1; i >= 6; i--) R[i] = R[i] * 0.85 + X[i - 6] * 0.15; // slight decorrelation
    return finish(X, R, 0.7);
  },
  /** ride: metal stack + bell partials + wash. p: decay (2.2), bell (0.5) */
  ride(p, v, r, sr) {
    const dec = (p.decay ?? 2.2), n = Math.round(dec * sr * 0.9), X = new Float32Array(n);
    for (const f of [311, 467, 588, 742, 813, 1001, 1219]) renderOsc('square', X, 0, n, f * 1.9 * r.range(0.997, 1.003), { phase: r.float(), amp: 0.2 });
    const nz = xorNoise(n, r.u32());
    for (let i = 0; i < n; i++) X[i] += nz[i] * 0.4;
    new SVF('bp', 7500, 0.8, sr).process(X); new Biquad('hp', 3500, 0.7, 0, sr).process(X);
    const k = Math.exp(-6.9 / (dec * sr)), kq = Math.exp(-6.9 / (0.25 * sr));
    let a = 1, b = 1;
    const bell = (p.bell ?? 0.5) * (0.5 + 0.6 * v);
    for (let i = 0; i < n; i++) { X[i] *= a * 0.6 + b * 0.6; a *= k; b *= kq; X[i] += (Math.sin((2 * Math.PI * 2330 * i) / sr) + 0.6 * Math.sin((2 * Math.PI * 3447 * i) / sr)) * a * a * bell * 0.25; }
    const R = Float32Array.from(X); for (let i = n - 1; i >= 11; i--) R[i] = R[i] * 0.8 + X[i - 11] * 0.2;
    return finish(X, R, 0.6);
  },
  /** crash: dense inharmonic partials + noise, stereo. p: decay (2.4), tone (1) */
  crash(p, v, r, sr) {
    const dec = (p.decay ?? 2.4) * (0.8 + 0.3 * v), n = Math.round(dec * sr), out = [new Float32Array(n), new Float32Array(n)];
    for (let c = 0; c < 2; c++) {
      const X = out[c];
      for (let k = 0; k < 36; k++) {
        const f = r.range(2400, 13000) * (p.tone ?? 1), d = dec * r.range(0.35, 1), kk = Math.exp(-6.9 / (d * sr)), w = (2 * Math.PI * f) / sr, ph = r.range(0, 6.28), amp = r.range(0.3, 1) / 36;
        // damped rotation (no per-sample sin)
        let re = amp * Math.cos(ph), im = amp * Math.sin(ph);
        const c = kk * Math.cos(w), s = kk * Math.sin(w), len = Math.min(n, Math.ceil(Math.log(1e-6 / amp) / Math.log(kk)));
        for (let i = 0; i < len; i++) { const nr = re * c - im * s; im = re * s + im * c; re = nr; X[i] += im; }
      }
      const nz = xorNoise(n, r.u32());
      new Biquad('hp', 3500, 0.7, 0, sr).process(nz); new OnePole('lp', 12000, sr).process(nz);
      const kn = Math.exp(-6.9 / (dec * 0.8 * sr)); let a = 1;
      for (let i = 0; i < n; i++) { X[i] = X[i] * 3 + nz[i] * a * 0.5; a *= kn; }
      const att = Math.round(0.003 * sr); for (let i = 0; i < att; i++) X[i] *= i / att;
      new Biquad('hp', 400, 0.7, 0, sr).process(X);
    }
    return finish(out[0], out[1], 0.7);
  },
  /** tom: pitched sine with drop + second mode + stick noise. note.midi sets pitch (default 45). p: decay (0.5) */
  tom(p, v, r, sr, note) {
    const f = midiToHz(note.midi ?? p.midi ?? 45), dec = (p.decay ?? 0.5), n = Math.round(dec * sr), X = new Float32Array(n);
    let p1 = 0, p2 = 0; const k = Math.exp(-6.9 / (dec * sr)), k2 = Math.exp(-6.9 / (dec * 0.4 * sr)); let a = 1, b = 1;
    for (let i = 0; i < n; i++) {
      const pd = 1 + 0.6 * Math.exp(-i / (0.03 * sr));
      p1 += (f * pd) / sr; p2 += (f * 1.52 * pd) / sr;
      X[i] = Math.sin(2 * Math.PI * p1) * a + Math.sin(2 * Math.PI * p2) * b * 0.35; a *= k; b *= k2;
    }
    const nz = xorNoise(Math.round(0.02 * sr), r.u32()); new SVF('bp', 3000, 0.8, sr).process(nz);
    for (let i = 0; i < nz.length; i++) X[i] += nz[i] * expEnv(i, 0.003 * sr) * 0.5 * v;
    for (let i = 0; i < n; i++) X[i] = tanhFast(X[i] * 1.4);
    const R = Float32Array.from(X); room(X, R, 0.2, 0.4, r.u32());
    return finish(X, R, 0.9);
  },
  /** shaker: granular bead bursts. p: decay (0.07), tone (7000) */
  shaker(p, v, r, sr) {
    const dec = p.decay ?? 0.07, n = Math.round((dec + 0.05) * sr), X = new Float32Array(n);
    const att = (0.012 + 0.01 * (1 - v)) * sr;
    let s = r.u32() | 1;
    for (let i = 0; i < n; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const u = (s >>> 0) / 4294967296;
      const env = i < att ? i / att : Math.exp(-(i - att) / (dec * sr / 3));
      if (u < 0.12) X[i] = (u / 0.06 - 1) * env;
    }
    new SVF('bp', (p.tone ?? 7000) * r.range(0.95, 1.05), 1.2, sr).process(X); new Biquad('hp', 3500, 0.7, 0, sr).process(X);
    const R = Float32Array.from(X); for (let i = n - 1; i >= 9; i--) R[i] = X[i - 9];
    return finish(X, R, 0.6);
  },
  /** finger snap. p: tone (1900), room (0.4) */
  snap(p, v, r, sr) {
    const n = Math.round(0.35 * sr), X = xorNoise(n, r.u32());
    for (let i = 0; i < n; i++) X[i] *= Math.exp(-i / (0.007 * sr)) * Math.min(1, i / (0.0003 * sr));
    new SVF('bp', (p.tone ?? 1900) * r.range(0.95, 1.05), 2.2, sr).process(X); new Biquad('peak', 4500, 1, 6, sr).process(X);
    const R = Float32Array.from(X); room(X, R, p.room ?? 0.4, 0.25, r.u32());
    return finish(X, R, 0.85);
  },
  /** rimshot / clave-ish click. */
  rim(p, v, r, sr) {
    const n = Math.round(0.08 * sr), X = new Float32Array(n);
    for (let i = 0; i < n; i++) X[i] = (Math.sin((2 * Math.PI * 1720 * i) / sr) * 0.7 + Math.sin((2 * Math.PI * 510 * i) / sr) * 0.5) * Math.exp(-i / (0.008 * sr));
    const nz = xorNoise(Math.round(0.004 * sr), r.u32()); for (let i = 0; i < nz.length; i++) X[i] += nz[i] * 0.5 * expEnv(i, 0.0008 * sr);
    return finish(X, Float32Array.from(X), 0.8);
  },
};

const GM = { kick: 36, snare: 38, clap: 39, hat: 42, openhat: 46, ride: 51, crash: 49, tom: 45, shaker: 70, snap: 37, rim: 37 };

/**
 * One drum voice. kind: 'kick'|'snare'|'clap'|'hat'|'openhat'|'ride'|'crash'|'tom'|'shaker'|'snap'|'rim'. params per SYNTH docs.
 * render(note): note { vel, dur (choke: open hats/crash fade out at dur), midi (toms: pitch), rr (variant index) }
 */
export class DrumVoice {
  constructor(kind, params = {}, seed = 'drum') {
    this.kind = kind; this.name = kind; this.params = kind === 'openhat' ? { open: true, ...params } : params;
    this.fn = SYNTH[kind === 'openhat' ? 'hat' : kind];
    if (!this.fn) throw new Error(`unknown drum ${kind}`);
    this.seed = seed; this.cache = new Map(); this.rr = 0; this.midi = GM[kind] ?? 60; this.tail = 0.05; this.sr = SR;
    this.choke = kind === 'openhat' || kind === 'crash' || kind === 'ride';
  }
  render(note = {}) {
    const v = clamp(note.vel ?? 0.85, 0.02, 1);
    const layer = Math.min(VEL_LAYERS - 1, Math.floor(v * VEL_LAYERS));
    const variant = note.rr !== undefined ? note.rr % VARIANTS : this.rr++ % VARIANTS;
    const tomKey = this.kind === 'tom' ? `|${note.midi ?? 45}` : '';
    const key = `${variant}|${layer}${tomKey}`;
    let base = this.cache.get(key);
    if (!base) {
      const lv = (layer + 0.75) / VEL_LAYERS;
      base = this.fn(this.params, lv, new Rng(`${this.seed}:${this.kind}:${key}`), this.sr, note);
      base.lv = lv;
      this.cache.set(key, base);
    }
    const g = Math.pow(v / base.lv, 1.15) * (note.gain ?? 1);
    let n = base[0].length;
    let chokeAt = -1;
    if (this.choke && note.dur !== undefined && note.dur * this.sr < n) { chokeAt = Math.round(note.dur * this.sr); n = Math.min(n, chokeAt + Math.round(0.03 * this.sr)); }
    const L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let e = g;
      if (chokeAt >= 0 && i > chokeAt) e *= Math.exp(-(i - chokeAt) / (0.006 * this.sr));
      L[i] = base[0][i] * e; R[i] = base[1][i] * e;
    }
    return [L, R];
  }
}

/**
 * A full kit. opts: { seed, kick: {params}, snare: {...}, clap, hat, openhat, ride, crash, tom, shaker, snap, rim }
 * kit.kick, kit.snare, ... are DrumVoice instruments: stem.play(kit.kick, { time, vel }).
 */
export class DrumKit {
  constructor(opts = {}) {
    const seed = opts.seed ?? 'kit';
    for (const k of Object.keys(GM)) this[k] = new DrumVoice(k, opts[k] || {}, `${seed}:${k}`);
  }
}

export { GM as DRUM_MIDI };
