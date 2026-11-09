// Transition FX for builds and drops: risers, downlifters, impacts, reverse cymbals, sweeps.
// All are instruments: stem.play(new Riser(), { time, dur }) -- `dur` is the effect length.
import { SR, Rng, clamp } from '../core/util.js';
import { Noise, supersaw } from '../core/osc.js';
import { SVF, Biquad } from '../core/filters.js';
import { Reverb } from '../fx/reverb.js';
import { DrumVoice } from './drums.js';

/**
 * Riser. opts: { noise=1, saw=0.5 (supersaw pitch riser level), from=400, to=9000 (noise filter Hz), fromMidi=50, semis=12,
 *   curve=2 (amplitude rise exponent), q=1.2, seed, gain=1 }
 * note: { dur, vel }. The riser ends exactly at time+dur (put it right before the drop).
 */
export class Riser {
  constructor(opts = {}) { this.name = opts.name || 'riser'; this.opts = opts; this.sr = SR; this.tail = 0.02; this.midi = 96; }
  render(note) {
    const o = this.opts, sr = this.sr, dur = Math.max(0.2, note.dur ?? 4), n = Math.round(dur * sr), v = note.vel ?? 0.9;
    const L = new Float32Array(n), R = new Float32Array(n);
    const curve = o.curve ?? 2;
    const amp = new Float32Array(n), cut = new Float32Array(n);
    const from = o.from ?? 400, to = o.to ?? 9000;
    for (let i = 0; i < n; i++) { const x = i / n; amp[i] = Math.pow(x, curve) * Math.min(1, (n - i) / (0.004 * sr)); cut[i] = from * Math.pow(to / from, Math.pow(x, 1.3)); }
    if ((o.noise ?? 1) > 0) {
      const nl = new Float32Array(n), nr = new Float32Array(n);
      new Noise(`${o.seed ?? 'riser'}L`).render(nl, 0, n, 1); new Noise(`${o.seed ?? 'riser'}R`).render(nr, 0, n, 1);
      new SVF('bp', from, o.q ?? 1.2, sr).process(nl, 0, n, cut); new SVF('bp', from, o.q ?? 1.2, sr).process(nr, 0, n, cut);
      for (let i = 0; i < n; i++) { L[i] += nl[i] * amp[i] * (o.noise ?? 1); R[i] += nr[i] * amp[i] * (o.noise ?? 1); }
    }
    if ((o.saw ?? 0.5) > 0) {
      const fm = 440 * Math.pow(2, ((o.fromMidi ?? 50) - 69) / 12), semis = o.semis ?? 12, fr = new Float32Array(n);
      for (let i = 0; i < n; i++) fr[i] = fm * Math.pow(2, (semis * Math.pow(i / n, 1.6)) / 12);
      const [sl, srr] = supersaw({ freq: fr, n, voices: 7, detune: 0.5, mix: 0.8, spread: 1, seed: o.seed ?? 'rs' });
      const lp = [new SVF('lp', 800, 0.8, sr), new SVF('lp', 800, 0.8, sr)];
      lp[0].process(sl, 0, n, cut); lp[1].process(srr, 0, n, cut);
      for (let i = 0; i < n; i++) { L[i] += sl[i] * amp[i] * (o.saw ?? 0.5); R[i] += srr[i] * amp[i] * (o.saw ?? 0.5); }
    }
    const g = (o.gain ?? 1) * 0.5 * v;
    for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
    return [L, R];
  }
}

/** Downlifter: falling filtered noise + dropping tone. opts: { from=9000, to=150, tone=0.4, seed, gain } note: { dur } */
export class Downlifter {
  constructor(opts = {}) { this.name = opts.name || 'downlifter'; this.opts = opts; this.sr = SR; this.tail = 0.05; this.midi = 84; }
  render(note) {
    const o = this.opts, sr = this.sr, dur = Math.max(0.2, note.dur ?? 2), n = Math.round(dur * sr), v = note.vel ?? 0.85;
    const L = new Float32Array(n), R = new Float32Array(n), cut = new Float32Array(n);
    const from = o.from ?? 9000, to = o.to ?? 150;
    for (let i = 0; i < n; i++) cut[i] = from * Math.pow(to / from, Math.pow(i / n, 0.7));
    new Noise(`${o.seed ?? 'dl'}L`).render(L, 0, n, 1); new Noise(`${o.seed ?? 'dl'}R`).render(R, 0, n, 1);
    new SVF('lp', from, 1.4, sr).process(L, 0, n, cut); new SVF('lp', from, 1.4, sr).process(R, 0, n, cut);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const x = i / n, a = Math.pow(1 - x, 1.5) * Math.min(1, i / (0.01 * sr));
      ph += (220 * Math.pow(0.12, x)) / sr;
      const t = Math.sin(2 * Math.PI * ph) * (o.tone ?? 0.4);
      L[i] = (L[i] + t) * a; R[i] = (R[i] + t) * a;
    }
    const g = (o.gain ?? 1) * 0.5 * v; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
    return [L, R];
  }
}

/** Impact / boom for drop downbeats: sub drop + noise crack + big reverb tail. opts: { sub=1, noise=0.6, tail=0.6, seed, gain } */
export class Impact {
  constructor(opts = {}) { this.name = opts.name || 'impact'; this.opts = opts; this.sr = SR; this.tail = 0.1; this.midi = 24; }
  render(note) {
    const o = this.opts, sr = this.sr, n = Math.round((note.dur ?? 3) * sr), v = note.vel ?? 0.9;
    const L = new Float32Array(n), R = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr; ph += (32 + 60 * Math.exp(-t / 0.08)) / sr;
      const s = Math.tanh(Math.sin(2 * Math.PI * ph) * 2) * Math.exp(-t / 0.6) * (o.sub ?? 1) * Math.min(1, i / 30);
      L[i] = s; R[i] = s;
    }
    const nz = new Float32Array(n); new Noise(o.seed ?? 'imp').render(nz, 0, Math.min(n, Math.round(0.4 * sr)), 1);
    new Biquad('lp', 3500, 0.7, 0, sr).process(nz);
    for (let i = 0; i < n; i++) { const e = Math.exp(-i / (0.07 * sr)) * (o.noise ?? 0.6); L[i] += nz[i] * e; R[i] += nz[i] * e; }
    const wl = Float32Array.from(L), wr = Float32Array.from(R);
    new Reverb({ preset: 'huge', decay: 3.5, seed: o.seed ?? 'imp' }).process(wl, wr, 0, n);
    const tl = o.tail ?? 0.6;
    for (let i = 0; i < n; i++) { L[i] += wl[i] * tl; R[i] += wr[i] * tl; }
    const fe = Math.min(n, Math.round(0.3 * sr)); for (let i = 0; i < fe; i++) { L[n - 1 - i] *= i / fe; R[n - 1 - i] *= i / fe; }
    const g = (o.gain ?? 1) * 0.6 * v; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
    return [L, R];
  }
}

/** Reverse cymbal swell ending at time+dur. opts: { seed, gain } note: { dur (<= 2.6 s) } */
export class ReverseCymbal {
  constructor(opts = {}) { this.name = opts.name || 'reverse-cymbal'; this.opts = opts; this.sr = SR; this.tail = 0.01; this.midi = 52; this.crash = new DrumVoice('crash', { decay: 2.8 }, opts.seed ?? 'rev'); }
  render(note) {
    const [cl, cr] = this.crash.render({ vel: 0.95 });
    const n = Math.min(cl.length, Math.round((note.dur ?? 2) * this.sr));
    const L = new Float32Array(n), R = new Float32Array(n), g = (this.opts.gain ?? 1) * (note.vel ?? 0.9);
    for (let i = 0; i < n; i++) { L[i] = cl[n - 1 - i] * g; R[i] = cr[n - 1 - i] * g; }
    const f = Math.round(0.003 * this.sr); for (let i = 0; i < f; i++) { L[n - 1 - i] *= i / f; R[n - 1 - i] *= i / f; }
    return [L, R];
  }
}

/** Filtered noise sweep (whoosh). opts: { from=200, to=8000, q=2, seed, gain } (from > to = downward) note: { dur } */
export class Sweep {
  constructor(opts = {}) { this.name = opts.name || 'sweep'; this.opts = opts; this.sr = SR; this.tail = 0.02; this.midi = 90; }
  render(note) {
    const o = this.opts, sr = this.sr, n = Math.round(Math.max(0.1, note.dur ?? 1) * sr), L = new Float32Array(n), R = new Float32Array(n), cut = new Float32Array(n);
    const from = o.from ?? 200, to = o.to ?? 8000;
    for (let i = 0; i < n; i++) cut[i] = from * Math.pow(to / from, i / n);
    new Noise(`${o.seed ?? 'sw'}L`).render(L, 0, n, 1); new Noise(`${o.seed ?? 'sw'}R`).render(R, 0, n, 1);
    new SVF('bp', from, o.q ?? 2, sr).process(L, 0, n, cut); new SVF('bp', from, o.q ?? 2, sr).process(R, 0, n, cut);
    const g = (o.gain ?? 1) * 0.6 * (note.vel ?? 0.8);
    for (let i = 0; i < n; i++) { const e = Math.sin((Math.PI * i) / n) * g; L[i] *= e; R[i] *= e; }
    return [L, R];
  }
}

void Rng; void clamp;
