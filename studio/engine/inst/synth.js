// Subtractive / supersaw synth with presets for modern EDM-pop (leads, stabs, plucks, pads, basses, brass),
// plus an FM bell.
import { SR, Rng, midiToHz, clamp, dbToGain, panGains, tanhFast } from '../core/util.js';
import { renderOsc, renderWavetable, supersaw, Wavetable, Noise, SIN, SIN_N } from '../core/osc.js';
import { SVF, Biquad, DCBlock } from '../core/filters.js';
import { adsr } from '../core/env.js';

const PRESETS = {
  'supersaw-lead': { osc: [{ type: 'supersaw', voices: 9, detune: 0.32, mix: 0.75, spread: 0.85 }, { type: 'supersaw', octave: 1, voices: 7, detune: 0.25, level: 0.45, spread: 0.9 }, { type: 'sine', octave: -1, level: 0.25 }], filter: { cutoff: 5200, res: 0.8, env: 1.0, keytrack: 0.4, a: 0.002, d: 0.35, s: 0.55, r: 0.2 }, amp: { a: 0.004, d: 0.2, s: 0.92, r: 0.18 }, drive: 2, glide: 0.04 },
  'supersaw-pad': { osc: [{ type: 'supersaw', voices: 9, detune: 0.42, mix: 0.85, spread: 1 }, { type: 'wt:warm', octave: 1, level: 0.3, detune: 6 }], filter: { cutoff: 2400, res: 0.6, env: 0.6, keytrack: 0.3, a: 0.6, d: 1.2, s: 0.6, r: 0.8 }, amp: { a: 0.35, d: 0.5, s: 0.9, r: 0.9 }, drive: 0 },
  stab: { osc: [{ type: 'supersaw', voices: 9, detune: 0.38, mix: 0.8, spread: 0.95 }, { type: 'supersaw', octave: 1, voices: 7, detune: 0.3, level: 0.5, spread: 1 }], filter: { cutoff: 1800, res: 0.9, env: 2.6, keytrack: 0.3, a: 0.001, d: 0.22, s: 0.35, r: 0.15 }, amp: { a: 0.002, d: 0.3, s: 0.75, r: 0.14 }, drive: 3 },
  pluck: { osc: [{ type: 'supersaw', voices: 5, detune: 0.2, mix: 0.6, spread: 0.7 }, { type: 'square', octave: 1, level: 0.25 }], filter: { cutoff: 700, res: 1.1, env: 4, keytrack: 0.5, a: 0.001, d: 0.18, s: 0, r: 0.12 }, amp: { a: 0.001, d: 0.32, s: 0.0, r: 0.12 }, drive: 1 },
  arp: { osc: [{ type: 'saw', level: 0.7 }, { type: 'square', octave: 0, detune: 7, level: 0.5 }], filter: { cutoff: 1100, res: 1.4, env: 3.2, keytrack: 0.5, a: 0.001, d: 0.12, s: 0.05, r: 0.08 }, amp: { a: 0.001, d: 0.18, s: 0.2, r: 0.08 }, drive: 2 },
  brass: { osc: [{ type: 'saw', level: 0.7 }, { type: 'saw', detune: 9, level: 0.6 }, { type: 'saw', detune: -8, level: 0.6 }, { type: 'square', octave: -1, level: 0.2 }], filter: { cutoff: 650, res: 0.7, env: 2.4, keytrack: 0.6, a: 0.045, d: 0.35, s: 0.45, r: 0.15 }, amp: { a: 0.02, d: 0.2, s: 0.85, r: 0.14 }, drive: 3, pitchEnv: { semis: -0.6, time: 0.06 } },
  'warm-pad': { osc: [{ type: 'wt:warm', level: 0.7, detune: -7 }, { type: 'wt:warm', level: 0.7, detune: 7 }, { type: 'wt:hollow', octave: 1, level: 0.25 }], filter: { cutoff: 1500, res: 0.6, env: 0.8, keytrack: 0.3, a: 1, d: 1.5, s: 0.7, r: 1 }, amp: { a: 0.6, d: 0.6, s: 0.9, r: 1.2 }, drive: 0, width: 1 },
  'vox-pad': { osc: [{ type: 'wt:vox', level: 0.7, detune: -6 }, { type: 'wt:vox', level: 0.7, detune: 6 }], filter: { cutoff: 3000, res: 0.6, env: 0.4, a: 0.3, d: 1, s: 0.8, r: 0.6 }, amp: { a: 0.25, d: 0.5, s: 0.9, r: 0.7 } },
  'saw-bass': { osc: [{ type: 'saw', level: 0.8 }, { type: 'saw', detune: 6, level: 0.5 }, { type: 'sine', octave: -1, level: 0.7 }], filter: { cutoff: 260, res: 0.9, env: 2.2, keytrack: 0.4, a: 0.001, d: 0.2, s: 0.25, r: 0.08 }, amp: { a: 0.002, d: 0.3, s: 0.85, r: 0.07 }, drive: 4, mono: true, glide: 0.03 },
  reese: { osc: [{ type: 'saw', detune: -14, level: 0.7 }, { type: 'saw', detune: 14, level: 0.7 }, { type: 'sine', octave: -1, level: 0.7 }], filter: { cutoff: 420, res: 0.8, env: 0.8, keytrack: 0.3, a: 0.01, d: 0.4, s: 0.6, r: 0.1 }, amp: { a: 0.005, d: 0.2, s: 0.95, r: 0.08 }, drive: 5, mono: true, width: 0.6 },
  sub: { osc: [{ type: 'sine', level: 1 }, { type: 'tri', octave: 1, level: 0.06 }], filter: { cutoff: 400, res: 0.5, env: 0 }, amp: { a: 0.004, d: 0.1, s: 1, r: 0.06 }, drive: 1.5, mono: true, glide: 0.02 },
  '808': { osc: [{ type: 'sine', level: 1 }], filter: { cutoff: 1200, res: 0.5, env: 0 }, amp: { a: 0.001, d: 1.6, s: 0.0, r: 0.12 }, drive: 6, mono: true, pitchEnv: { semis: 7, time: 0.035 }, glide: 0.07 },
  'piano-house': { osc: [{ type: 'wt:organ', level: 0.4 }, { type: 'saw', level: 0.3 }, { type: 'square', octave: 1, level: 0.15 }], filter: { cutoff: 1400, res: 0.7, env: 2.5, keytrack: 0.6, a: 0.001, d: 0.25, s: 0.2, r: 0.2 }, amp: { a: 0.001, d: 0.6, s: 0.3, r: 0.2 }, drive: 1 },
};

/**
 * Generic synth voice. Use a preset: new Synth('supersaw-lead', overrides) or a full config:
 * { osc: [{ type: 'supersaw'|'saw'|'square'|'pulse'|'tri'|'sine'|'noise'|'wt:<saw|square|tri|organ|warm|hollow|vox|glass|morph>',
 *           octave, semi, detune (cents), level, voices, detune (supersaw 0..1), mix, spread, pw }],
 *   filter: { type='lp'|'hp'|'bp', cutoff, res (Q), env (octaves of filter-env sweep), keytrack (0..1), slope=12|24, a,d,s,r },
 *   amp: { a, d, s, r }, drive (dB), glide (s, used with note.glideFrom), vibrato: { rate, depth (cents), delay },
 *   pitchEnv: { semis, time }, width=1, gain=1, seed }
 * note: { midi, vel, dur, glideFrom, cutoff (override), filterEnv (override octaves) }
 */
export class Synth {
  constructor(preset = 'supersaw-lead', overrides = {}) {
    const base = typeof preset === 'string' ? PRESETS[preset] : preset;
    if (!base) throw new Error(`unknown synth preset ${preset}. Known: ${Object.keys(PRESETS).join(', ')}`);
    this.cfg = { ...base, ...overrides, filter: { ...base.filter, ...(overrides.filter || {}) }, amp: { ...base.amp, ...(overrides.amp || {}) } };
    this.name = overrides.name || (typeof preset === 'string' ? preset : 'synth');
    this.sr = SR; this.tail = (this.cfg.amp.r ?? 0.2) * 1.6; this.count = 0;
  }
  static presets() { return Object.keys(PRESETS); }
  render(note) {
    const c = this.cfg, sr = this.sr, v = clamp(note.vel ?? 0.8, 0.02, 1), m = note.midi;
    const r = new Rng(`${c.seed ?? this.name}:${m}:${this.count++}`);
    const dur = Math.max(0.01, note.dur ?? 0.5);
    const env = adsr(c.amp, dur, sr);
    const n = env.length;
    // pitch track (Hz) incl. glide, pitch env, vibrato
    const f0 = midiToHz(m), fr = new Float32Array(n);
    const gFrom = note.glideFrom !== undefined ? midiToHz(note.glideFrom) : null, gT = Math.max(1, (c.glide ?? 0.05) * sr);
    const pe = c.pitchEnv, vib = c.vibrato;
    const constPitch = !gFrom && !pe && !vib;
    if (constPitch) fr.fill(f0);
    else {
      // pitch modulation evaluated every 8 samples (it is smooth), held in between
      const vd = (vib?.delay ?? 0.3) * sr, vdepth = vib?.depth ?? 15, vw = (2 * Math.PI * (vib?.rate ?? 5.5)) / sr, peT = pe ? pe.time * sr : 1;
      for (let i0 = 0; i0 < n; i0 += 8) {
        let f = f0;
        if (gFrom && i0 < gT * 3) f = f0 * Math.pow(gFrom / f0, Math.exp(-i0 / gT));
        if (pe) f *= Math.pow(2, (pe.semis * Math.exp(-i0 / peT)) / 12);
        if (vib && i0 > vd) f *= Math.pow(2, (vdepth * Math.sin(vw * i0) * Math.min(1, (i0 - vd) / (0.3 * sr))) / 1200);
        fr.fill(f, i0, Math.min(n, i0 + 8));
      }
    }
    const L = new Float32Array(n), R = new Float32Array(n);
    const tmp = new Float32Array(n), fo = new Float32Array(n);
    for (const o of c.osc) {
      const ratio = Math.pow(2, (o.octave ?? 0) + (o.semi ?? 0) / 12 + (typeof o.detune === 'number' && o.type !== 'supersaw' ? o.detune / 1200 : 0));
      // constant pitch (no glide / pitch env / vibrato): pass a number so the oscillators take their fast path
      const fq = constPitch ? f0 * ratio : fo;
      if (!constPitch) for (let i = 0; i < n; i++) fo[i] = fr[i] * ratio;
      const lvl = o.level ?? 1;
      if (o.type === 'supersaw') {
        const [sl, srr] = supersaw({ freq: fq, n, voices: o.voices ?? 7, detune: o.detune ?? 0.3, mix: o.mix ?? 0.75, spread: o.spread ?? 0.85, seed: r.u32() });
        for (let i = 0; i < n; i++) { L[i] += sl[i] * lvl; R[i] += srr[i] * lvl; }
        continue;
      }
      tmp.fill(0);
      if (o.type === 'noise') new Noise(r.u32(), 'white').render(tmp, 0, n, 1);
      else if (o.type.startsWith('wt:')) renderWavetable(Wavetable.preset(o.type.slice(3)), tmp, 0, n, fq, { phase: r.float() });
      else renderOsc(o.type, tmp, 0, n, fq, { phase: r.float(), pw: o.pw });
      const [gl, gr] = panGains(o.pan ?? 0);
      for (let i = 0; i < n; i++) { L[i] += tmp[i] * lvl * gl * 1.414; R[i] += tmp[i] * lvl * gr * 1.414; }
    }
    // filter with envelope + keytracking + velocity
    const F = c.filter || {};
    if (F.cutoff && F.cutoff < 19000 || F.type === 'hp' || F.type === 'bp') {
      const fenv = adsr({ a: F.a ?? 0.002, d: F.d ?? 0.3, s: F.s ?? 0.3, r: F.r ?? 0.2 }, dur, sr);
      const envOct = (note.filterEnv ?? F.env ?? 0) * (0.6 + 0.5 * v);
      const kt = Math.pow(f0 / 261.6, F.keytrack ?? 0.3);
      const base = (note.cutoff ?? F.cutoff ?? 20000) * kt;
      const cut = new Float32Array(n);
      // the SVF reads its cutoff array every 8 samples: only those entries are computed
      const LN2o = Math.LN2 * envOct;
      const nf = fenv.length; // the filter envelope may end before the amp envelope (then it holds 0)
      for (let i = 0; i < n; i += 8) cut[i] = Math.min(20000, base * Math.exp(LN2o * (i < nf ? fenv[i] : 0)));
      const stages = (F.slope ?? 24) >= 24 ? 2 : 1;
      for (const X of [L, R]) for (let s = 0; s < stages; s++) new SVF(F.type || 'lp', base, s === stages - 1 ? F.res ?? 0.7 : 0.54, sr).process(X, 0, n, cut);
    }
    // amp env, drive, width
    const drv = dbToGain(c.drive ?? 0), dn = drv > 1 ? Math.tanh(drv * 0.5) / 0.5 : 1, hd = drv * 0.5, idn = 1 / dn;
    const w = c.width ?? 1, g = (c.gain ?? 1) * 0.42 * Math.pow(v, 0.7), mono = !!c.mono, drive = drv > 1;
    for (let i = 0; i < n; i++) {
      let l = L[i] * env[i], rr = R[i] * env[i];
      if (mono) { const mm = (l + rr) * 0.5; l = rr = mm; }
      if (drive) { l = tanhFast(l * hd) * idn; rr = tanhFast(rr * hd) * idn; }
      if (w !== 1) { const mm = (l + rr) * 0.5, s = (l - rr) * 0.5 * w; l = mm + s; rr = mm - s; }
      L[i] = l * g; R[i] = rr * g;
    }
    if (drv > 1) { new DCBlock(8, sr).process(L); new DCBlock(8, sr).process(R); }
    return [L, R];
  }
}

/**
 * FM bell / mallet (2-op + a decaying high partial). opts: { ratio=3.5, index=3, decay=2.5, bright=1, gain=1, seed }
 */
export class Bell {
  constructor(opts = {}) { this.name = opts.name || 'bell'; this.opts = opts; this.sr = SR; this.tail = 0.1; this.count = 0; }
  render(note) {
    const o = this.opts, sr = this.sr, v = clamp(note.vel ?? 0.8, 0.02, 1), f = midiToHz(note.midi);
    const dec = (o.decay ?? 2.5) * Math.pow(2, -(note.midi - 72) / 24);
    const n = Math.round(Math.min(dec * 1.1, (note.dur ?? dec) + 0.6) * sr), out = new Float32Array(n);
    const ratio = o.ratio ?? 3.5, I0 = (o.index ?? 3) * (0.4 + 0.7 * v) * (o.bright ?? 1);
    const k = Math.exp(-6.9 / (dec * sr)), ki = Math.exp(-6.9 / (dec * 0.35 * sr)), kh = Math.exp(-6.9 / (0.25 * sr));
    let a = 1, ai = 1, ah = 1, pc = 0, pm = 0, ph = 0;
    const r = new Rng(`${o.seed ?? 'bell'}:${this.count++}`); pc = r.float(); pm = r.float();
    const relAt = note.dur !== undefined ? Math.round((note.dur + 0.3) * sr) : n;
    for (let i = 0; i < n; i++) {
      let q = pm * SIN_N, j = q | 0; const mo = SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j);
      let pp = pc + (I0 * ai * mo) / 6.2832; pp -= Math.floor(pp); q = pp * SIN_N; j = q | 0;
      const c1 = SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j);
      q = ph * SIN_N; j = q | 0; const hp = SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j);
      out[i] = (c1 * a + hp * ah * 0.25 * v) * (i < 40 ? i / 40 : 1) * (i > relAt ? Math.exp(-(i - relAt) / (0.08 * sr)) : 1);
      pc += f / sr; pm += (f * ratio) / sr; ph += (f * 5.4) / sr;
      if (pc >= 1) pc -= 1; if (pm >= 1) pm -= 1; if (ph >= 1) ph -= 1;
      a *= k; ai *= ki; ah *= kh;
    }
    const g = (o.gain ?? 1) * 0.4 * v;
    for (let i = 0; i < n; i++) out[i] *= g;
    const fe = Math.min(128, n); for (let i = 0; i < fe; i++) out[n - 1 - i] *= i / fe;
    return out;
  }
}

export { PRESETS as SYNTH_PRESETS };
