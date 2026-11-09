// Saturation: waveshapers (optionally oversampled), tape emulation, harmonic exciter.
import { SR, dbToGain, Rng, tanhFast } from '../core/util.js';
import { Biquad, DCBlock, OnePole } from '../core/filters.js';
import { OversampledShaper } from './oversample.js';

/**
 * shaper functions with unity small-signal gain. The returned fn(x) also has fn.block(buf, m) which shapes
 * buf[0..m) in place (used by the oversampler; each loop is its own function so the math inlines).
 */
export function shaper(type, drive, bias = 0) {
  const g = Math.max(drive, 1e-3), ig = 1 / g;
  let fn, block;
  switch (type) {
    case 'tanh':
      fn = (x) => tanhFast(g * x) * ig;
      block = (t, m) => { for (let i = 0; i < m; i++) { let u = g * t[i]; if (u > 4.97) u = 1; else if (u < -4.97) u = -1; else { const u2 = u * u; u = u * (135135 + u2 * (17325 + u2 * (378 + u2))) / (135135 + u2 * (62370 + u2 * (3150 + u2 * 28))); } t[i] = u * ig; } };
      break;
    case 'soft':
      fn = (x) => { const u = g * x; return (u >= 1.5 ? 1 : u <= -1.5 ? -1 : u - (4 / 27) * u * u * u) * ig; };
      block = (t, m) => { for (let i = 0; i < m; i++) { const u = g * t[i]; t[i] = (u >= 1.5 ? 1 : u <= -1.5 ? -1 : u - 0.14814814814814814 * u * u * u) * ig; } };
      break;
    case 'hard':
      fn = (x) => { const u = g * x; return (u > 1 ? 1 : u < -1 ? -1 : u) * ig; };
      block = (t, m) => { for (let i = 0; i < m; i++) { const u = g * t[i]; t[i] = (u > 1 ? 1 : u < -1 ? -1 : u) * ig; } };
      break;
    case 'tube': {
      const tb = Math.tanh(g * bias), k = 1 / (g * (1 - tb * tb) || g);
      fn = (x) => (tanhFast(g * (x + bias)) - tb) * k;
      block = (t, m) => { for (let i = 0; i < m; i++) { let u = g * (t[i] + bias); if (u > 4.97) u = 1; else if (u < -4.97) u = -1; else { const u2 = u * u; u = u * (135135 + u2 * (17325 + u2 * (378 + u2))) / (135135 + u2 * (62370 + u2 * (3150 + u2 * 28))); } t[i] = (u - tb) * k; } };
      break;
    }
    case 'fold':
      fn = (x) => Math.sin(g * x * Math.PI / 2) * ig;
      block = (t, m) => { const w = g * Math.PI / 2; for (let i = 0; i < m; i++) t[i] = Math.sin(w * t[i]) * ig; };
      break;
    default: throw new Error(`shaper ${type}?`);
  }
  fn.block = block;
  return fn;
}

/**
 * Saturator insert. cfg: { shape='tanh'|'soft'|'hard'|'tube'|'fold', drive=6 (dB), bias=0.1 (tube), mix=1, output=0 dB,
 *   tone=0 (dB tilt after: + brighter), oversample=2 (1,2,4), lowcut=0 (Hz: saturate only above, keeps sub clean) }
 */
export class Saturator {
  constructor(cfg = {}, sr = SR) {
    this.drive = dbToGain(cfg.drive ?? 6); this.mix = cfg.mix ?? 1; this.out = dbToGain(cfg.output ?? 0);
    const SHAPES = ['tanh', 'soft', 'hard', 'tube', 'fold'];
    const shape = cfg.shape || (SHAPES.includes(cfg.type) ? cfg.type : 'tanh');
    const fn = shaper(shape, this.drive, cfg.bias ?? 0.1);
    const os = cfg.oversample ?? 2;
    this.fn = fn;
    this.os = os > 1 ? [new OversampledShaper(fn, os), new OversampledShaper(fn, os)] : null;
    this.dc = shape === 'tube' ? [new DCBlock(10, sr), new DCBlock(10, sr)] : null;
    this.tone = cfg.tone ? [new Biquad('hs', 2500, 0.6, cfg.tone, sr), new Biquad('hs', 2500, 0.6, cfg.tone, sr)] : null;
    this.lowcut = cfg.lowcut ? [new Biquad('hp', cfg.lowcut, 0.7071, 0, sr), new Biquad('hp', cfg.lowcut, 0.7071, 0, sr), new Biquad('lp', cfg.lowcut, 0.7071, 0, sr), new Biquad('lp', cfg.lowcut, 0.7071, 0, sr)] : null;
    this.dry = null; this.low = null;
  }
  process(L, R, start = 0, end = L.length) {
    const n = end - start;
    const needDry = this.mix < 1, needLow = !!this.lowcut;
    if ((needDry || needLow) && (!this.dry || this.dry[0].length < n)) { this.dry = [new Float32Array(n), new Float32Array(n)]; this.low = [new Float32Array(n), new Float32Array(n)]; }
    [L, R].forEach((X, c) => {
      if (needDry) for (let i = 0; i < n; i++) this.dry[c][i] = X[start + i];
      if (needLow) {
        const lo = this.low[c];
        for (let i = 0; i < n; i++) lo[i] = X[start + i];
        this.lowcut[2 + c].process(lo, 0, n); this.lowcut[c].process(X, start, end);
      }
      if (this.os) this.os[c].process(X, start, end); else if (start === 0) this.fn.block(X, end); else { const f = this.fn; for (let i = start; i < end; i++) X[i] = f(X[i]); }
      if (this.dc) this.dc[c].process(X, start, end);
      if (this.tone) this.tone[c].process(X, start, end);
      if (needLow) { const lo = this.low[c]; for (let i = 0; i < n; i++) X[start + i] += lo[i]; }
      const o = this.out, m = this.mix;
      if (needDry) { const d = this.dry[c]; for (let i = 0; i < n; i++) X[start + i] = (X[start + i] * m + d[i] * (1 - m)) * o; }
      else if (o !== 1) for (let i = start; i < end; i++) X[i] *= o;
    });
  }
}

/**
 * Tape: saturation + head bump + HF loss + wow/flutter.
 * cfg: { drive=3 dB, bump=1.5 dB @ 70 Hz, hf=16000 Hz, wow=0.15 (ms depth), flutter=0.03 (ms), seed, mix=1 }
 */
export class Tape {
  constructor(cfg = {}, sr = SR) {
    this.sr = sr; this.sat = new Saturator({ shape: 'tube', drive: cfg.drive ?? 3, bias: 0.05, oversample: 2 }, sr);
    this.bump = [new Biquad('peak', cfg.bumpFreq ?? 70, 1.0, cfg.bump ?? 1.5, sr), new Biquad('peak', cfg.bumpFreq ?? 70, 1.0, cfg.bump ?? 1.5, sr)];
    this.hf = [new Biquad('lp', cfg.hf ?? 16000, 0.6, 0, sr), new Biquad('lp', cfg.hf ?? 16000, 0.6, 0, sr)];
    this.wow = (cfg.wow ?? 0.15) / 1000 * sr; this.flut = (cfg.flutter ?? 0.03) / 1000 * sr;
    this.N = 2048; this.buf = [new Float32Array(this.N), new Float32Array(this.N)]; this.w = 0;
    const r = new Rng(cfg.seed ?? 'tape'); this.ph1 = r.float(); this.ph2 = r.float();
    this.base = 4 + this.wow + this.flut + 2;
  }
  process(L, R, start = 0, end = L.length) {
    this.sat.process(L, R, start, end);
    for (let c = 0; c < 2; c++) { this.bump[c].process(c ? R : L, start, end); this.hf[c].process(c ? R : L, start, end); }
    if (this.wow <= 0 && this.flut <= 0) return;
    const N = this.N, [bL, bR] = this.buf, sr = this.sr;
    for (let i = start; i < end; i++) {
      bL[this.w] = L[i]; bR[this.w] = R[i];
      const d = this.base + this.wow * Math.sin(2 * Math.PI * this.ph1) + this.flut * Math.sin(2 * Math.PI * this.ph2);
      this.ph1 += 0.55 / sr; this.ph2 += 6.3 / sr; if (this.ph1 > 1) this.ph1 -= 1; if (this.ph2 > 1) this.ph2 -= 1;
      let rp = this.w - d; while (rp < 0) rp += N;
      const j = rp | 0, f = rp - j, j1 = (j + 1) % N;
      L[i] = bL[j] + (bL[j1] - bL[j]) * f; R[i] = bR[j] + (bR[j1] - bR[j]) * f;
      this.w = (this.w + 1) % N;
    }
  }
}

/**
 * Harmonic exciter: generates upper harmonics from the band above `freq` and blends them in. Great for phone translation.
 * cfg: { freq=3000, drive=12 dB, amount=0.15 (0..1) }
 */
export class Exciter {
  constructor(cfg = {}, sr = SR) {
    this.amt = cfg.amount ?? 0.15;
    const f = cfg.freq ?? 3000;
    this.hp1 = [new Biquad('hp', f, 0.7071, 0, sr), new Biquad('hp', f, 0.7071, 0, sr)];
    this.hp2 = [new Biquad('hp', f * 1.5, 0.7071, 0, sr), new Biquad('hp', f * 1.5, 0.7071, 0, sr)];
    this.fn = shaper('tube', dbToGain(cfg.drive ?? 12), 0.2);
    this.dc = [new OnePole('hp', 20, sr), new OnePole('hp', 20, sr)];
    this.tmp = null;
  }
  process(L, R, start = 0, end = L.length) {
    const n = end - start;
    if (!this.tmp || this.tmp.length < n) this.tmp = new Float32Array(n);
    const t = this.tmp, fn = this.fn, a = this.amt;
    [L, R].forEach((X, c) => {
      for (let i = 0; i < n; i++) t[i] = X[start + i];
      this.hp1[c].process(t, 0, n);
      for (let i = 0; i < n; i++) t[i] = (fn(t[i]) - t[i]) * 4; // distortion products only
      this.hp2[c].process(t, 0, n); this.dc[c].process(t, 0, n);
      for (let i = 0; i < n; i++) X[start + i] += t[i] * a;
    });
  }
}
