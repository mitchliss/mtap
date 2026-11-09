// String ensemble: N players per note (bandlimited bowed-saw sources, individual detune, delayed vibrato,
// drift, bow noise), violin-family body resonances, stereo seating. Also pizzicato via the waveguide string.
import { SR, Rng, midiToHz, clamp, panGains } from '../core/util.js';
import { Wavetable, renderWavetable, Noise } from '../core/osc.js';
import { Biquad, SVF } from '../core/filters.js';
import { vibrato } from '../core/mod.js';
import { stringLoop } from './guitar.js';

let BOW_WT = null;
function bowTable() {
  // bowed string ~ Helmholtz motion (sawtooth) with a slight bow-position comb and gentle roll-off
  if (!BOW_WT) BOW_WT = Wavetable.fromFn((k) => (1 / k) * (0.45 + 0.55 * Math.abs(Math.sin((Math.PI * k) / 9.3))) / (1 + (k / 40) ** 2), 1, 300);
  return BOW_WT;
}

/**
 * opts: { players=6, attack=0.16, release=0.4, brightness=0.6, vibrato=1 (depth scale), detune=6 (cents spread), width=0.9,
 *         section: 'auto'|'violins'|'violas'|'cellos'|'basses', seed, gain=1 }
 * note: { midi, vel (dynamic, 0..1), dur, articulation: 'sustain'|'legato'|'staccato'|'spiccato'|'pizz'|'swell', attack }
 */
export class Strings {
  constructor(opts = {}) { this.name = opts.name || 'strings'; this.opts = opts; this.sr = opts.sr || SR; this.tail = 0.6; this.count = 0; }
  render(note) {
    const sr = this.sr, o = this.opts, v = clamp(note.vel ?? 0.7, 0.02, 1), m = note.midi, f = midiToHz(m);
    const art = note.articulation || 'sustain';
    if (art === 'pizz') return this.pizz(note);
    const r = new Rng(`${o.seed ?? 'str'}:${m}:${this.count++}`);
    const P = note.players ?? o.players ?? 6;
    const short = art === 'staccato' || art === 'spiccato';
    const att = note.attack ?? (short ? 0.012 : art === 'swell' ? Math.max(0.3, (note.dur ?? 1) * 0.7) : art === 'legato' ? 0.09 : o.attack ?? 0.16);
    const rel = short ? 0.09 : o.release ?? 0.4;
    const dur = Math.max(0.03, short ? Math.min(note.dur ?? 0.15, art === 'spiccato' ? 0.08 : 0.2) : note.dur ?? 1);
    const n = Math.round((dur + rel * 1.6) * sr);
    const L = new Float32Array(n), R = new Float32Array(n), tmp = new Float32Array(n);
    const wt = bowTable(), spread = o.detune ?? 6, width = o.width ?? 0.9;
    const bowNoise = new Noise(r.u32(), 'white');
    for (let p = 0; p < P; p++) {
      tmp.fill(0);
      const cents = (P === 1 ? 0 : ((p / (P - 1)) * 2 - 1) * spread * 0.5) + r.gauss(0, spread * 0.15);
      const fr = vibrato(f * Math.pow(2, cents / 1200), n, {
        rate: r.range(4.6, 6.2), depth: (short ? 4 : r.range(7, 15)) * (o.vibrato ?? 1), delay: short ? 0 : r.range(0.12, 0.35),
        fade: 0.4, drift: r.range(2, 5), seed: r.u32(), scoop: short ? 0 : r.range(0, 10), scoopTime: 0.06,
      });
      renderWavetable(wt, tmp, 0, n, fr, { phase: r.float(), amp: 1 });
      // per-player envelope (slightly different onsets), bow noise on the attack, pan -- one pass
      const on = Math.round(r.range(0, short ? 0.006 : 0.025) * sr), a = Math.max(1, Math.round(att * r.range(0.8, 1.25) * sr));
      const off = Math.min(n, Math.round(dur * sr) + on), kr = Math.exp(-6.9 / (rel * sr));
      const bnN = Math.min(n, on + a + Math.round(0.05 * sr));
      const bn = new Float32Array(bnN); bowNoise.render(bn, on, bnN - on, 0.06 * (0.4 + v));
      new SVF('bp', r.range(2200, 3800), 0.9, sr).process(bn, on, bnN);
      const pan = P === 1 ? 0 : ((p / (P - 1)) * 2 - 1) * width * (p % 2 ? 0.8 : 1);
      const [gl, gr] = panGains(pan);
      const bnFade = 1 / (0.03 * sr), ia = 1 / a, aEnd = Math.min(n, on + a);
      let env = 0;
      for (let i = on; i < aEnd; i++) { const x = (i - on) * ia; env = short ? x : x * x * (3 - 2 * x); const y = tmp[i] * env + (i < bnN ? bn[i] * Math.min(1, (bnN - i) * bnFade) : 0); L[i] += y * gl; R[i] += y * gr; }
      for (let i = aEnd; i < off; i++) { if (short) env = Math.max(0.55, env * 0.99985); else env = 1; const y = tmp[i] * env + (i < bnN ? bn[i] * Math.min(1, (bnN - i) * bnFade) : 0); L[i] += y * gl; R[i] += y * gr; }
      for (let i = Math.max(off, aEnd); i < n; i++) { env *= kr; const y = tmp[i] * env; L[i] += y * gl; R[i] += y * gr; }
    }
    // body resonances by section
    const sec = o.section && o.section !== 'auto' ? o.section : m >= 67 ? 'violins' : m >= 55 ? 'violas' : m >= 40 ? 'cellos' : 'basses';
    const BODY = {
      violins: [[290, 1.6, 4], [470, 2, -2], [1050, 1.4, 3], [2700, 1.6, 4], [4300, 2, 1.5]],
      violas: [[230, 1.6, 4], [400, 2, -2], [900, 1.4, 3], [2300, 1.6, 3], [3800, 2, 1]],
      cellos: [[110, 1.4, 3], [220, 1.6, 3], [600, 1.6, 2], [1500, 1.6, 2], [3000, 2, 1]],
      basses: [[70, 1.4, 3], [140, 1.6, 2], [400, 1.6, 1.5], [1200, 1.6, 1], [2500, 2, -2]],
    }[sec];
    const bright = clamp((o.brightness ?? 0.6) * (0.55 + 0.6 * v), 0.05, 1.3);
    for (const X of [L, R]) {
      new Biquad('hp', sec === 'basses' ? 30 : 55, 0.7, 0, sr).process(X);
      for (const [bf, q, gdb] of BODY) new Biquad('peak', bf, q, gdb, sr).process(X);
      new Biquad('lp', 2500 + 8000 * bright, 0.6, 0, sr).process(X);
    }
    const g = (o.gain ?? 1) * 0.32 * Math.pow(v, 0.8) / Math.sqrt(P);
    for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
    return [L, R];
  }
  pizz(note) {
    const sr = this.sr, o = this.opts, v = clamp(note.vel ?? 0.7, 0.02, 1), f = midiToHz(note.midi);
    const n = Math.round(Math.min(2.5, 1.2 * Math.pow(220 / f, 0.5) + 0.3) * sr);
    const e = new Float32Array(200); for (let i = 0; i < 60; i++) e[i] = Math.sin((Math.PI * i) / 60) * (1 - 0.5 * (1 - v));
    const y = stringLoop(e, n, { f0: f, t60: clamp(1.4 * Math.pow(220 / f, 0.5), 0.4, 2.5), t60hf: 0.08, sr });
    new Biquad('peak', 300, 1.4, 4, sr).process(y); new Biquad('lp', 3500, 0.7, 0, sr).process(y);
    let pk = 0; for (let i = 0; i < Math.min(n, 4000); i++) pk = Math.max(pk, Math.abs(y[i]));
    const g = (o.gain ?? 1) * 0.45 * v / Math.max(1e-6, pk);
    for (let i = 0; i < n; i++) y[i] *= g;
    return y;
  }
}
