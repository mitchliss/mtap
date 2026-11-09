// Effect registry + sympathetic resonance. Every effect: new X(cfg, sr); x.process(L, R, start, end, frame0) in place.
import { SR, midiToHz } from '../core/util.js';
import { OnePole } from '../core/filters.js';
import { EQ, Widener, AutoFilter } from './eq.js';
import { Compressor, Ducker, TransientShaper, Limiter, Clipper, OTT, TranceGate } from './dynamics.js';
import { Saturator, Tape, Exciter } from './saturation.js';
import { Chorus, Ensemble, Flanger, Phaser, Tremolo } from './modulation.js';
import { Delay } from './delay.js';
import { Reverb, REVERB_PRESETS } from './reverb.js';

/**
 * Sympathetic string resonance (piano pedal halo / guitar body ring): a bank of damped comb filters tuned to
 * `notes` (midi) fed by the mono input. cfg: { notes=[D minor-ish set], decay=2.5 s, damp=0.35, mix=0.12 }
 */
export class Resonance {
  constructor(cfg = {}, sr = SR) {
    const notes = cfg.notes || [38, 45, 50, 53, 57, 62, 65, 69, 74, 50 - 12 + 7, 58, 60];
    this.mix = cfg.mix ?? 0.12;
    const decay = cfg.decay ?? 2.5;
    this.combs = notes.map((m, k) => {
      const P = sr / midiToHz(m), D = Math.floor(P), fr = P - D;
      const g = Math.pow(10, -3 / (decay * midiToHz(m)));
      return { buf: new Float32Array(D + 2), D, fr, i: 0, g, lp: 0, damp: cfg.damp ?? 0.35, side: k % 2 };
    });
    this.hp = [new OnePole('hp', 60, sr), new OnePole('hp', 60, sr)];
  }
  process(L, R, start = 0, end = L.length) {
    const mix = this.mix, cs = this.combs, nC = cs.length, g0 = 1 / Math.sqrt(nC);
    for (let i = start; i < end; i++) {
      const x = (L[i] + R[i]) * 0.5 * 0.05;
      let oL = 0, oR = 0;
      for (let k = 0; k < nC; k++) {
        const c = cs[k], B = c.buf, N = c.D + 2;
        let j = c.i - c.D; if (j < 0) j += N; let j2 = j - 1; if (j2 < 0) j2 += N;
        const d = B[j] * (1 - c.fr) + B[j2] * c.fr;
        c.lp = d * (1 - c.damp) + c.lp * c.damp;
        const y = x + c.lp * c.g;
        B[c.i] = y; c.i = c.i + 1 >= N ? 0 : c.i + 1;
        if (c.side) oR += y; else oL += y;
      }
      L[i] += oL * mix * g0 * 2; R[i] += oR * mix * g0 * 2;
    }
  }
}

const REG = {
  eq: EQ, comp: Compressor, compressor: Compressor, sat: Saturator, saturator: Saturator, tape: Tape, exciter: Exciter,
  transient: TransientShaper, chorus: Chorus, ensemble: Ensemble, flanger: Flanger, phaser: Phaser, tremolo: Tremolo,
  delay: Delay, reverb: Reverb, widener: Widener, width: Widener, limiter: Limiter, clipper: Clipper, ott: OTT,
  gate: TranceGate, trancegate: TranceGate, filter: AutoFilter, resonance: Resonance, duck: Ducker,
};

/**
 * Create an effect from a config object { type, ...params }. ctx: { sr, timeline, fast }.
 * type 'fn': { type:'fn', process(L, R, start, end, frame0) } is passed through.
 * 'autopan' = tremolo with pan:true.
 */
export function createFx(cfg, ctx = {}) {
  if (!cfg || typeof cfg !== 'object') throw new Error(`bad fx config ${cfg}`);
  const sr = ctx.sr || SR;
  if (cfg.type === 'fn') return { process: cfg.process, stats: null };
  if (cfg.type === 'autopan') return new Tremolo({ ...cfg, pan: true, timeline: ctx.timeline }, sr);
  const C = REG[cfg.type];
  if (!C) throw new Error(`unknown fx type "${cfg.type}". Known: ${Object.keys(REG).join(', ')}, fn, autopan`);
  return new C({ ...cfg, timeline: cfg.timeline || ctx.timeline, fast: cfg.fast ?? ctx.fast }, sr);
}

export const FX_TYPES = Object.keys(REG).concat(['fn', 'autopan']);
export {
  EQ, Widener, AutoFilter, Compressor, Ducker, TransientShaper, Limiter, Clipper, OTT, TranceGate,
  Saturator, Tape, Exciter, Chorus, Ensemble, Flanger, Phaser, Tremolo, Delay, Reverb, REVERB_PRESETS,
};
