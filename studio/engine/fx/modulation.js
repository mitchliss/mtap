// Modulation effects: chorus, string ensemble, phaser, flanger, tremolo/auto-pan.
import { SR, Rng, noteValueBeats } from '../core/util.js';
import { SIN, SIN_N } from '../core/osc.js';

const sinp = (ph) => { ph -= Math.floor(ph); const q = ph * SIN_N, j = q | 0; return SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j); };
function hermiteRead(buf, N, pos) {
  // pos: fractional read index (already wrapped to [0,N))
  const i = Math.floor(pos), f = pos - i;
  let im1 = i - 1; if (im1 < 0) im1 += N;
  let i1 = i + 1; if (i1 >= N) i1 -= N;
  let i2 = i1 + 1; if (i2 >= N) i2 -= N;
  const xm1 = buf[im1], x0 = buf[i], x1 = buf[i1], x2 = buf[i2];
  const c = (x1 - xm1) * 0.5, v = x0 - x1, w = c + v, a = w + v + (x2 - x0) * 0.5, b = w + a;
  return (((a * f) - b) * f + c) * f + x0;
}

/** Modulated multi-tap delay core shared by chorus/ensemble/flanger. */
class ModDelay {
  constructor(sr, maxMs = 60) { this.sr = sr; this.N = Math.ceil((maxMs / 1000) * sr) + 8; this.buf = [new Float32Array(this.N), new Float32Array(this.N)]; this.w = 0; }
}

/**
 * Chorus. cfg: { rate=0.5 Hz, depth=2.5 ms, delay=11 ms, voices=2 (per side), mix=0.4, feedback=0, seed }
 */
export class Chorus extends ModDelay {
  constructor(cfg = {}, sr = SR) {
    super(sr, (cfg.delay ?? 11) + (cfg.depth ?? 2.5) * 2 + 10);
    const r = new Rng(cfg.seed ?? 'chorus');
    this.rate = cfg.rate ?? 0.5; this.depth = ((cfg.depth ?? 2.5) / 1000) * sr; this.base = ((cfg.delay ?? 11) / 1000) * sr;
    this.voices = cfg.voices ?? 2; this.mix = cfg.mix ?? 0.4; this.fb = cfg.feedback ?? 0;
    this.ph = r.float();
    this.rates = Array.from({ length: this.voices }, (_, v) => this.rate * (1 + v * 0.13));
    this.phs = Float64Array.from({ length: this.voices }, (_, v) => (this.ph + v / this.voices) % 1);
    this.lastL = 0; this.lastR = 0;
  }
  process(L, R, start = 0, end = L.length) {
    const N = this.N, [bL, bR] = this.buf, V = this.voices, sr = this.sr, mix = this.mix, fb = this.fb;
    const g = 1 / Math.sqrt(V), base = this.base, depth = this.depth, phs = this.phs, inc = this.rates.map((r) => r / sr);
    let w = this.w, lastL = this.lastL, lastR = this.lastR;
    for (let i = start; i < end; i++) {
      bL[w] = L[i] + lastL * fb; bR[w] = R[i] + lastR * fb;
      let oL = 0, oR = 0;
      for (let v = 0; v < V; v++) {
        const p = phs[v];
        const dL = base + depth * (1 + sinp(p));
        const dR = base + depth * (1 + sinp(p + 0.25));
        let rL = w - dL; if (rL < 0) rL += N; let rR = w - dR; if (rR < 0) rR += N;
        oL += hermiteRead(bL, N, rL); oR += hermiteRead(bR, N, rR);
        let q = p + inc[v]; if (q >= 1) q -= 1; phs[v] = q;
      }
      oL *= g; oR *= g; lastL = oL + 1e-18 - 1e-18; lastR = oR + 1e-18 - 1e-18;
      L[i] = L[i] * (1 - mix * 0.5) + oL * mix; R[i] = R[i] * (1 - mix * 0.5) + oR * mix;
      if (++w === N) w = 0;
    }
    this.w = w; this.lastL = lastL; this.lastR = lastR;
  }
}

/** Solina/Juno-style ensemble: 3 taps/side, slow+fast LFOs at 120 degrees. cfg: { mix=0.5, depth=1 (scale), rate=1 (scale) } */
export class Ensemble extends ModDelay {
  constructor(cfg = {}, sr = SR) {
    super(sr, 40);
    this.mix = cfg.mix ?? 0.5; this.d = cfg.depth ?? 1; this.rs = cfg.rate ?? 1;
    this.ph1 = 0; this.ph2 = 0; this.base = 0.009 * sr; this.a1 = 0.0022 * sr * this.d; this.a2 = 0.00035 * sr * this.d;
  }
  process(L, R, start = 0, end = L.length) {
    const N = this.N, [bL, bR] = this.buf, sr = this.sr, mix = this.mix;
    const base = this.base, a1 = this.a1, a2 = this.a2, i1 = (0.62 * this.rs) / sr, i2 = (5.8 * this.rs) / sr, wet = 0.45 * mix * 1.3;
    let w = this.w, ph1 = this.ph1, ph2 = this.ph2;
    for (let i = start; i < end; i++) {
      bL[w] = L[i]; bR[w] = R[i];
      let oL = 0, oR = 0;
      for (let v = 0; v < 3; v++) {
        const o = v / 3;
        const dL = base + a1 * (1 + sinp(ph1 + o)) + a2 * (1 + sinp(ph2 + o));
        const dR = base + a1 * (1 + sinp(ph1 + o + 0.5)) + a2 * (1 + sinp(ph2 + o + 0.5));
        let rL = w - dL; if (rL < 0) rL += N; let rR = w - dR; if (rR < 0) rR += N;
        oL += hermiteRead(bL, N, rL); oR += hermiteRead(bR, N, rR);
      }
      L[i] = L[i] * (1 - mix) + oL * wet; R[i] = R[i] * (1 - mix) + oR * wet;
      ph1 += i1; ph2 += i2;
      if (ph1 >= 1) ph1 -= 1; if (ph2 >= 1) ph2 -= 1;
      if (++w === N) w = 0;
    }
    this.w = w; this.ph1 = ph1; this.ph2 = ph2;
  }
}

/** Flanger. cfg: { rate=0.15, depth=2 ms, delay=1 ms, feedback=0.5, mix=0.5 } */
export class Flanger extends ModDelay {
  constructor(cfg = {}, sr = SR) {
    super(sr, 20);
    this.rate = cfg.rate ?? 0.15; this.depth = ((cfg.depth ?? 2) / 1000) * sr; this.base = ((cfg.delay ?? 1) / 1000) * sr;
    this.fb = cfg.feedback ?? 0.5; this.mix = cfg.mix ?? 0.5; this.ph = 0; this.lL = 0; this.lR = 0;
  }
  process(L, R, start = 0, end = L.length) {
    const N = this.N, [bL, bR] = this.buf;
    for (let i = start; i < end; i++) {
      bL[this.w] = L[i] + this.lL * this.fb; bR[this.w] = R[i] + this.lR * this.fb;
      const dL = this.base + this.depth * (1 + sinp(this.ph)) * 0.5, dR = this.base + this.depth * (1 + sinp(this.ph + 0.25)) * 0.5;
      let rL = this.w - dL; if (rL < 0) rL += N; let rR = this.w - dR; if (rR < 0) rR += N;
      const oL = hermiteRead(bL, N, rL), oR = hermiteRead(bR, N, rR);
      this.lL = oL + 1e-18 - 1e-18; this.lR = oR + 1e-18 - 1e-18;
      L[i] = L[i] * (1 - this.mix) + oL * this.mix; R[i] = R[i] * (1 - this.mix) + oR * this.mix;
      this.ph += this.rate / this.sr; if (this.ph >= 1) this.ph -= 1;
      this.w = (this.w + 1) % N;
    }
  }
}

/** Phaser. cfg: { stages=6, rate=0.3, min=250, max=3500 (Hz), feedback=0.4, mix=0.5, stereo=0.25 (LFO offset, cycles) } */
export class Phaser {
  constructor(cfg = {}, sr = SR) {
    this.sr = sr; this.S = cfg.stages ?? 6; this.rate = cfg.rate ?? 0.3; this.min = cfg.min ?? 250; this.max = cfg.max ?? 3500;
    this.fb = cfg.feedback ?? 0.4; this.mix = cfg.mix ?? 0.5; this.off = cfg.stereo ?? 0.25; this.ph = 0;
    this.x1 = [new Float64Array(this.S), new Float64Array(this.S)]; this.y1 = [new Float64Array(this.S), new Float64Array(this.S)]; this.last = [0, 0];
  }
  process(L, R, start = 0, end = L.length) {
    const S = this.S, sr = this.sr, lr = Math.log(this.max / this.min), fb = this.fb, mix = this.mix, inc = this.rate / sr;
    for (let c = 0; c < 2; c++) {
      const X = c ? R : L, x1 = this.x1[c], y1 = this.y1[c];
      let ph = this.ph, last = this.last[c], a = 0;
      for (let i = start, k16 = 0; i < end; i++, k16++) {
        if ((k16 & 15) === 0) { // allpass coefficient at control rate (every 16 samples)
          const lfo = (1 + sinp(ph + c * this.off)) * 0.5;
          const f = this.min * Math.exp(lr * lfo), t = Math.tan((Math.PI * f) / sr); a = (t - 1) / (t + 1);
        }
        let s = X[i] + last * fb;
        for (let k = 0; k < S; k++) { const y = a * s + x1[k] - a * y1[k] + 1e-18 - 1e-18; x1[k] = s; y1[k] = y; s = y; }
        last = s;
        X[i] = X[i] * (1 - mix) + s * mix;
        ph += inc; if (ph >= 1) ph -= 1;
      }
      this.last[c] = last;
      if (c === 1) this.ph = ph;
    }
  }
}

/**
 * Tremolo / auto-pan. cfg: { rate=4 Hz or sync='1/8' (needs timeline), depth=0.5, pan=false (auto-pan), shape='sine'|'square' }
 */
export class Tremolo {
  constructor(cfg = {}, sr = SR) {
    this.sr = sr; this.depth = cfg.depth ?? 0.5; this.pan = !!cfg.pan; this.shape = cfg.shape || 'sine';
    this.rate = cfg.rate ?? 4; this.sync = cfg.sync ? noteValueBeats(cfg.sync) : 0; this.tl = cfg.timeline; this.ph = 0;
  }
  process(L, R, start, end, frame0 = 0) {
    const sr = this.sr, d = this.depth;
    for (let i = start; i < end; i++) {
      let ph;
      if (this.sync && this.tl) ph = this.tl.secToBeat((frame0 + i - start) / sr) / this.sync;
      else { ph = this.ph; this.ph += this.rate / sr; }
      let w = sinp(ph);
      if (this.shape === 'square') w = Math.tanh(w * 6);
      if (this.pan) { const p = w * d; L[i] *= Math.min(1, 1 - p); R[i] *= Math.min(1, 1 + p); }
      else { const g = 1 - d * (0.5 + 0.5 * w); L[i] *= g; R[i] *= g; }
    }
  }
}
