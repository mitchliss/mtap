// Filters: TPT state-variable filter (modulatable), RBJ biquads, Butterworth cascades,
// one-pole, DC blocker. All process Float32Array regions in place.
import { SR } from './util.js';

const PI = Math.PI;

/**
 * Zero-delay-feedback state-variable filter (Simper/Zavalishin). Stable under fast modulation.
 * type: 'lp' | 'hp' | 'bp' (constant skirt) | 'bpn' (unity peak) | 'notch' | 'peak' | 'ap'
 */
export class SVF {
  constructor(type = 'lp', freq = 1000, q = 0.7071, sr = SR) {
    this.type = type; this.sr = sr; this.q = q; this.ic1 = 0; this.ic2 = 0;
    this.mode = { lp: 0, hp: 1, bp: 2, bpn: 3, notch: 4, peak: 5, ap: 6 }[type];
    if (this.mode === undefined) throw new Error(`SVF type ${type}?`);
    this.setFreq(freq);
  }
  setFreq(f) {
    this.freq = f;
    const g = Math.tan(PI * Math.min(Math.max(f, 5), this.sr * 0.49) / this.sr), k = 1 / this.q;
    this.k = k; this.a1 = 1 / (1 + g * (g + k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
    this._mix(k);
  }
  /** every SVF response is m0*v0 + m1*v1 + m2*v2 (input, band, low) -> no per-sample branching */
  _mix(k) {
    switch (this.mode) {
      case 0: this.m0 = 0; this.m1 = 0; this.m2 = 1; break; // lp
      case 1: this.m0 = 1; this.m1 = -k; this.m2 = -1; break; // hp
      case 2: this.m0 = 0; this.m1 = 1; this.m2 = 0; break; // bp
      case 3: this.m0 = 0; this.m1 = k; this.m2 = 0; break; // bpn
      case 4: this.m0 = 1; this.m1 = -k; this.m2 = 0; break; // notch
      case 5: this.m0 = -1; this.m1 = k; this.m2 = 2; break; // peak
      default: this.m0 = 1; this.m1 = -2 * k; this.m2 = 0; // ap
    }
  }
  setQ(q) { this.q = q; this.setFreq(this.freq); }
  reset() { this.ic1 = this.ic2 = 0; }
  /** in-place. freqArr (optional): per-sample cutoff Hz indexed from 0 => buf[start] (coefficients update every 8 samples). qArr optional too. */
  process(buf, start = 0, end = buf.length, freqArr = null, qArr = null) {
    let ic1 = this.ic1, ic2 = this.ic2, a1 = this.a1, a2 = this.a2, a3 = this.a3, k = this.k, m0 = this.m0, m1 = this.m1, m2 = this.m2;
    const sr = this.sr, maxF = sr * 0.49, DN = 1e-18;
    if (!freqArr && !qArr) {
      for (let i = start; i < end; i++) {
        const v0 = buf[i], v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1 + DN - DN; ic2 = 2 * v2 - ic2 + DN - DN;
        buf[i] = m0 * v0 + m1 * v1 + m2 * v2;
      }
    } else {
      // coefficients are recomputed every 8 samples (sub-block loop: no per-sample branch)
      const f0 = this.freq;
      for (let i0 = start, j = 0; i0 < end; i0 += 8, j += 8) {
        const f = freqArr ? freqArr[j] : f0;
        const g = Math.tan(PI * (f < 5 ? 5 : f > maxF ? maxF : f) / sr);
        if (qArr) { k = 1 / qArr[j]; this._mix(k); m0 = this.m0; m1 = this.m1; m2 = this.m2; }
        a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
        const e = i0 + 8 < end ? i0 + 8 : end;
        for (let i = i0; i < e; i++) {
          const v0 = buf[i], v3 = v0 - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
          ic1 = 2 * v1 - ic1 + DN - DN; ic2 = 2 * v2 - ic2 + DN - DN;
          buf[i] = m0 * v0 + m1 * v1 + m2 * v2;
        }
      }
      this.a1 = a1; this.a2 = a2; this.a3 = a3; this.k = k;
    }
    this.ic1 = ic1; this.ic2 = ic2;
    return buf;
  }
  /** single sample (slow path) */
  tick(v0) {
    const v3 = v0 - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    switch (this.mode) { case 0: return v2; case 1: return v0 - this.k * v1 - v2; case 2: return v1; case 3: return this.k * v1; case 4: return v0 - this.k * v1; case 5: return 2 * v2 - v0 + this.k * v1; default: return v0 - 2 * this.k * v1; }
  }
}

/** Cascade of SVFs for steeper slopes (12 dB per stage). slope: 12|24|36|48 */
export class SVFCascade {
  constructor(type, freq, q = 0.7071, slope = 24, sr = SR) {
    const n = Math.max(1, Math.round(slope / 12));
    const qs = n === 1 ? [q] : butterQs(n * 2).map((bq, i) => (i === n - 1 ? bq * (q / 0.7071) : bq));
    this.stages = qs.map((qq) => new SVF(type, freq, qq, sr));
  }
  setFreq(f) { for (const s of this.stages) s.setFreq(f); }
  process(buf, start = 0, end = buf.length, freqArr = null) { for (const s of this.stages) s.process(buf, start, end, freqArr); return buf; }
  reset() { for (const s of this.stages) s.reset(); }
}

/** Butterworth section Qs for an even order N */
export function butterQs(N) {
  const qs = [];
  for (let k = 1; k <= N / 2; k++) qs.push(-1 / (2 * Math.cos((PI * (2 * k + N - 1)) / (2 * N))));
  return qs.sort((a, b) => a - b);
}

/**
 * RBJ cookbook biquad (transposed direct form II, float64 state).
 * type: 'lp','hp','bp','notch','peak','ls','hs','ap'. gain in dB for peak/shelves.
 */
export class Biquad {
  constructor(type = 'peak', freq = 1000, q = 0.7071, gain = 0, sr = SR) {
    this.sr = sr; this.z1 = 0; this.z2 = 0;
    this.set(type, freq, q, gain);
  }
  set(type, freq, q = this.q, gain = this.gain ?? 0) {
    this.type = type; this.freq = freq; this.q = q; this.gain = gain;
    const c = biquadCoefs(type, freq, q, gain, this.sr);
    this.b0 = c[0]; this.b1 = c[1]; this.b2 = c[2]; this.a1 = c[3]; this.a2 = c[4];
    return this;
  }
  reset() { this.z1 = this.z2 = 0; }
  process(buf, start = 0, end = buf.length) {
    let z1 = this.z1, z2 = this.z2;
    const b0 = this.b0, b1 = this.b1, b2 = this.b2, a1 = this.a1, a2 = this.a2;
    const DN = 1e-18; // flush-to-zero: values below ~1e-34 vanish (avoids denormal slowdowns in silence)
    for (let i = start; i < end; i++) {
      const x = buf[i], y = b0 * x + z1;
      z1 = b1 * x - a1 * y + z2 + DN - DN; z2 = b2 * x - a2 * y + DN - DN;
      buf[i] = y;
    }
    // denormal guard
    this.z1 = Math.abs(z1) < 1e-25 ? 0 : z1; this.z2 = Math.abs(z2) < 1e-25 ? 0 : z2;
    return buf;
  }
  tick(x) { const y = this.b0 * x + this.z1; this.z1 = this.b1 * x - this.a1 * y + this.z2; this.z2 = this.b2 * x - this.a2 * y; return y; }
  /** magnitude response (linear) at f */
  mag(f) {
    const w = (2 * PI * f) / this.sr, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = this.b0 + this.b1 * c1 + this.b2 * c2, ni = -(this.b1 * s1 + this.b2 * s2);
    const dr = 1 + this.a1 * c1 + this.a2 * c2, di = -(this.a1 * s1 + this.a2 * s2);
    return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  }
}

export function biquadCoefs(type, f, q, gainDb, sr = SR) {
  f = Math.min(Math.max(f, 1), sr * 0.49);
  const A = Math.pow(10, gainDb / 40), w = (2 * PI * f) / sr, cw = Math.cos(w), sw = Math.sin(w);
  const alpha = sw / (2 * Math.max(q, 1e-4));
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'ap': b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'ls': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    case 'hs': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    default: throw new Error(`biquad type ${type}?`);
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** Butterworth HP/LP of given slope (6..48 dB/oct) as a chain. order 1 uses a one-pole. */
export class ButterChain {
  constructor(type, freq, slope = 24, sr = SR) {
    this.type = type; this.sr = sr; this.slope = slope;
    const order = Math.max(1, Math.round(slope / 6));
    this.stages = [];
    if (order % 2) this.stages.push(new OnePole(type, freq, sr));
    for (const q of order >= 2 ? butterQs(order - (order % 2)) : []) this.stages.push(new Biquad(type, freq, q, 0, sr));
  }
  setFreq(f) { for (const s of this.stages) (s instanceof OnePole ? s.setFreq(f) : s.set(s.type, f, s.q, 0)); }
  process(buf, start = 0, end = buf.length) { for (const s of this.stages) s.process(buf, start, end); return buf; }
  reset() { for (const s of this.stages) s.reset(); }
}

/** One-pole low/high-pass (6 dB/oct), matched pole. */
export class OnePole {
  constructor(type = 'lp', freq = 1000, sr = SR) { this.type = type; this.sr = sr; this.z = 0; this.setFreq(freq); }
  setFreq(f) { this.freq = f; this.p = Math.exp((-2 * PI * Math.min(f, this.sr * 0.49)) / this.sr); }
  reset() { this.z = 0; }
  process(buf, start = 0, end = buf.length) {
    let z = this.z; const p = this.p, hp = this.type === 'hp';
    const DN = 1e-18, q = 1 - p;
    if (hp) for (let i = start; i < end; i++) { z = buf[i] * q + z * p + DN - DN; buf[i] -= z; }
    else for (let i = start; i < end; i++) { z = buf[i] * q + z * p + DN - DN; buf[i] = z; }
    this.z = z; return buf;
  }
  tick(x) { this.z = x * (1 - this.p) + this.z * this.p; return this.type === 'hp' ? x - this.z : this.z; }
}

/** DC blocker (~5 Hz) */
export class DCBlock {
  constructor(freq = 5, sr = SR) { this.r = Math.exp((-2 * PI * freq) / sr); this.x1 = 0; this.y1 = 0; }
  process(buf, start = 0, end = buf.length) {
    let x1 = this.x1, y1 = this.y1; const r = this.r;
    for (let i = start; i < end; i++) { const x = buf[i], y = x - x1 + r * y1 + 1e-18 - 1e-18; x1 = x; y1 = y; buf[i] = y; }
    this.x1 = x1; this.y1 = y1; return buf;
  }
}

/** First-order allpass y = a*x + x1 - a*y1 */
export class Allpass1 {
  constructor(a = 0) { this.a = a; this.x1 = 0; this.y1 = 0; }
  tick(x) { const y = this.a * x + this.x1 - this.a * this.y1; this.x1 = x; this.y1 = y; return y; }
}

/** Convenience: filter a whole buffer (copy) with a one-off filter. type as SVF types or 'ls'/'hs' biquads. */
export function filtered(buf, type, freq, q = 0.7071, gain = 0) {
  const out = Float32Array.from(buf);
  if (type === 'ls' || type === 'hs') new Biquad(type, freq, q, gain).process(out);
  else new SVF(type, freq, q).process(out);
  return out;
}
