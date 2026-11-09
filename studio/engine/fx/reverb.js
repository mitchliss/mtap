// Algorithmic stereo reverb: pre-delay -> early reflections -> input diffusion (allpass chain)
// -> 16-line feedback delay network (Hadamard matrix, Jot two-band absorption, modulated lines) -> output EQ.
import { SR, Rng } from '../core/util.js';
import { Biquad } from '../core/filters.js';
import { SIN, SIN_N } from '../core/osc.js';

export const REVERB_PRESETS = {
  plate: { decay: 1.9, predelay: 0.01, size: 0.55, hfRatio: 0.45, diffusion: 0.78, mod: 0.3, er: 0, lowcut: 200, highcut: 9500, width: 1 },
  vocal: { decay: 2.3, predelay: 0.035, size: 0.6, hfRatio: 0.5, diffusion: 0.75, mod: 0.35, er: 0, lowcut: 250, highcut: 9000, width: 1 },
  hall: { decay: 2.8, predelay: 0.022, size: 1.0, hfRatio: 0.42, diffusion: 0.7, mod: 0.45, er: 0.35, lowcut: 160, highcut: 7500, width: 1 },
  huge: { decay: 5.0, predelay: 0.03, size: 1.35, hfRatio: 0.4, diffusion: 0.78, mod: 0.6, er: 0.2, lowcut: 220, highcut: 6500, width: 1.1 },
  room: { decay: 0.8, predelay: 0.004, size: 0.32, hfRatio: 0.5, diffusion: 0.6, mod: 0.15, er: 0.6, lowcut: 120, highcut: 9000, width: 0.9 },
  chamber: { decay: 1.4, predelay: 0.012, size: 0.5, hfRatio: 0.55, diffusion: 0.7, mod: 0.25, er: 0.4, lowcut: 150, highcut: 8500, width: 1 },
  drum: { decay: 0.65, predelay: 0.002, size: 0.3, hfRatio: 0.6, diffusion: 0.72, mod: 0.1, er: 0.5, lowcut: 300, highcut: 10000, width: 1 },
};

const BASE_MS = [29.7, 33.1, 37.1, 41.1, 43.7, 47.9, 53.3, 57.1, 61.7, 67.3, 71.9, 75.7, 79.3, 83.9, 89.1, 97.3];
const DIFF_MS = [[4.77, 3.59, 12.73, 9.31], [4.97, 3.71, 12.41, 9.73]];

// unrolled fast Walsh-Hadamard transforms (generated once)
function makeHad(N) {
  const lines = [];
  for (let i = 0; i < N; i++) lines.push(`let x${i} = f[${i}];`);
  for (let h = 1; h < N; h <<= 1) for (let i = 0; i < N; i += h << 1) for (let j = i; j < i + h; j++) lines.push(`{ const a = x${j}, b = x${j + h}; x${j} = a + b; x${j + h} = a - b; }`);
  for (let i = 0; i < N; i++) lines.push(`f[${i}] = x${i};`);
  return new Function('f', lines.join(' '));
}
const had16 = makeHad(16), had8 = makeHad(8);

function nextPrime(n) { n = Math.max(2, Math.round(n)); for (;; n++) { let p = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { p = false; break; } if (p) return n; } }

/**
 * Reverb. cfg: preset name + overrides { preset='plate', decay (s, T60 low/mid), hfRatio (T60 high / low), size, predelay (s),
 *   diffusion (0..0.85), mod (0..1), er (early reflection level), lowcut, highcut (Hz on the wet), width, mix=1 (wet only),
 *   dry (default 0 when mix=1), lines=16 (8 in fast mode), fast=false, seed }
 */
export class Reverb {
  constructor(cfg = {}, sr = SR) {
    const p = { ...REVERB_PRESETS[cfg.preset || 'plate'], ...cfg };
    this.sr = sr; this.p = p;
    const fast = !!cfg.fast;
    const decay = fast ? Math.min(p.decay, 1.5) : p.decay;
    const nL = fast ? 8 : cfg.lines ?? 16;
    this.nL = nL;
    const rng = new Rng(cfg.seed ?? 'reverb');
    // delay lines
    this.len = new Int32Array(nL); this.buf = []; this.mask = new Int32Array(nL);
    this.g = new Float64Array(nL); this.b = new Float64Array(nL); this.z = new Float64Array(nL);
    this.modDepth = new Float64Array(nL); this.modPh = new Float64Array(nL); this.modInc = new Float64Array(nL);
    const alpha = Math.max(0.05, Math.min(1, p.hfRatio));
    for (let i = 0; i < nL; i++) {
      const ms = BASE_MS[fast ? i * 2 : i] * p.size;
      const L = nextPrime((ms / 1000) * sr);
      this.len[i] = L;
      const md = i % 3 === 0 ? p.mod * (7 + 11 * rng.float()) * (sr / 44100) : 0;
      this.modDepth[i] = md; this.modPh[i] = rng.float(); this.modInc[i] = (0.15 + 0.9 * rng.float()) / sr;
      let size = 1; while (size < L + 2 * md + 8) size <<= 1;
      this.buf.push(new Float32Array(size)); this.mask[i] = size - 1;
      // Jot absorption: per-line DC gain g, one-pole coefficient b giving T60(nyquist) = alpha * T60(0)
      const g = Math.pow(10, (-3 * L) / (decay * sr));
      this.g[i] = g;
      this.b[i] = (Math.LN10 / 4) * Math.log10(g) * (1 - 1 / (alpha * alpha));
    }
    this.w = 0;
    // flatten all lines into one buffer (better locality, no array-of-arrays indirection)
    this.base = new Int32Array(nL); let tot = 0;
    for (let i = 0; i < nL; i++) { this.base[i] = tot; tot += this.buf[i].length; }
    this.big = new Float32Array(tot); this.buf = null;
    this.a1 = new Float64Array(nL); for (let i = 0; i < nL; i++) this.a1[i] = this.g[i] * (1 - this.b[i]);
    this.modIdx = Int32Array.from([...Array(nL).keys()].filter((i) => this.modDepth[i] > 0));
    // output sign patterns (orthogonal-ish) for decorrelated L/R
    this.cL = new Float64Array(nL); this.cR = new Float64Array(nL); this.inL = new Float64Array(nL); this.inR = new Float64Array(nL);
    for (let i = 0; i < nL; i++) {
      this.cL[i] = (i % 2 ? -1 : 1) * (i % 4 < 2 ? 1 : 0.85); this.cR[i] = ((i >> 1) % 2 ? -1 : 1) * (i % 3 ? 1 : 0.9);
      this.inL[i] = i % 2 === 0 ? ((i >> 1) % 2 ? -1 : 1) : 0; this.inR[i] = i % 2 === 1 ? ((i >> 2) % 2 ? -1 : 1) : 0;
    }
    // calibrated so steady pink noise gives wet ~ dry level (0 dB) regardless of decay/size
    this.outGain = 0.62 / Math.sqrt(nL / 8) / Math.sqrt(Math.max(0.3, decay) / Math.max(0.3, p.size)) / (1 + 0.35 * (p.er ?? 0));
    // predelay
    this.pdN = Math.max(1, Math.round((p.predelay ?? 0.01) * sr));
    let pds = 1; while (pds < this.pdN + 2 + Math.round(0.09 * sr * p.size)) pds <<= 1;
    this.pd = [new Float32Array(pds), new Float32Array(pds)]; this.pdMask = pds - 1; this.pw = 0;
    // early reflections (taps relative to predelayed input)
    this.er = p.er ?? 0;
    this.erT = [new Int32Array(8), new Int32Array(8)]; this.erG = [new Float64Array(8), new Float64Array(8)];
    if (this.er > 0) {
      for (let c = 0; c < 2; c++) for (let k = 0; k < 8; k++) {
        const t = (0.006 + 0.075 * Math.pow((k + rng.float() * 0.6) / 8, 1.3)) * p.size;
        this.erT[c][k] = Math.round(t * sr); this.erG[c][k] = (k % 2 ? -1 : 1) * Math.pow(0.82, k) * (0.9 + 0.2 * rng.float()) * 0.45 * this.er;
      }
    }
    // input diffusers
    const dg = Math.min(0.85, p.diffusion ?? 0.7);
    // 8 allpass diffusers (0-3 left, 4-7 right) in one flat buffer
    this.dLen = new Int32Array(8); this.dBase = new Int32Array(8); this.dIdx = new Int32Array(8); this.dG = new Float64Array(8);
    let dt = 0;
    for (let c = 0; c < 2; c++) DIFF_MS[c].forEach((ms, k) => {
      const j = c * 4 + k, L = nextPrime((ms / 1000) * sr * Math.max(0.6, p.size));
      this.dLen[j] = L; this.dBase[j] = dt; dt += L; this.dG[j] = k < 2 ? dg : dg * 0.83;
    });
    this.dBuf = new Float32Array(dt);
    // wet EQ
    this.eq = [0, 1].map(() => [new Biquad('hp', p.lowcut ?? 150, 0.6, 0, sr), new Biquad('lp', p.highcut ?? 8000, 0.6, 0, sr)]);
    this.mix = cfg.mix ?? 1; this.dry = cfg.dry ?? (this.mix >= 1 ? 0 : 1 - this.mix); this.width = p.width ?? 1;
    this.f = new Float64Array(nL); this.tmp = null;
  }

  process(L, R, start = 0, end = L.length) {
    // block-wise FDN: every delay line is longer than the block, so each block's reads only touch past samples
    if (!this.B) {
      let minLen = Infinity; for (let i = 0; i < this.nL; i++) minLen = Math.min(minLen, this.len[i]);
      this.B = Math.max(16, Math.min(256, minLen - 2));
      const B = this.B;
      this.Y = new Float64Array(this.nL * B); this.xl = new Float64Array(B); this.xr = new Float64Array(B);
      this.eLb = new Float64Array(B); this.eRb = new Float64Array(B);
      this.tmp = [new Float32Array(B), new Float32Array(B)];
    }
    for (let s0 = start; s0 < end; s0 += this.B) this._block(L, R, s0, Math.min(end, s0 + this.B));
  }
  _block(L, R, start, end) {
    const n = end - start, B = this.B;
    const [wL, wR] = this.tmp;
    const nL = this.nL, len = this.len, big = this.big, base = this.base, mask = this.mask, a1 = this.a1, bb = this.b, z = this.z;
    const md = this.modDepth, mph = this.modPh, minc = this.modInc;
    const cL = this.cL, cR = this.cR, inL = this.inL, inR = this.inR, Y = this.Y, xl = this.xl, xr = this.xr, eL = this.eLb, eR = this.eRb;
    const pd0 = this.pd[0], pd1 = this.pd[1], pdMask = this.pdMask, pdN = this.pdN, er = this.er;
    const dBuf = this.dBuf, dLen = this.dLen, dBase = this.dBase, dIdx = this.dIdx, dG = this.dG;
    let w = this.w, pw = this.pw;
    // predelay (write the block first, then read: correct even when predelay < block)
    for (let s = 0; s < n; s++) { pd0[(pw + s) & pdMask] = L[start + s]; pd1[(pw + s) & pdMask] = R[start + s]; }
    for (let s = 0; s < n; s++) { const rp = (pw + s - pdN) & pdMask; xl[s] = pd0[rp]; xr[s] = pd1[rp]; }
    if (er > 0) {
      eL.fill(0); eR.fill(0);
      for (let c = 0; c < 2; c++) {
        const T = this.erT[c], G = this.erG[c], P = c ? pd1 : pd0, E = c ? eR : eL;
        for (let k = 0; k < 8; k++) { const off = pw - pdN - T[k], g = G[k]; for (let s = 0; s < n; s++) E[s] += P[(off + s) & pdMask] * g; }
      }
    }
    this.pw = (pw + n) & pdMask;
    // input diffusion: each allpass stage over the whole block
    for (let k = 0; k < 8; k++) {
      const X = k < 4 ? xl : xr, g = dG[k], bs = dBase[k], Ln = dLen[k];
      let idx = dIdx[k];
      for (let s = 0; s < n; s++) { const j = bs + idx, v = dBuf[j], u = X[s] + g * v + 1e-18 - 1e-18; X[s] = v - g * u; dBuf[j] = u; if (++idx >= Ln) idx = 0; }
      dIdx[k] = idx;
    }
    // line reads + absorption
    for (let i = 0; i < nL; i++) {
      const o = i * B, bs = base[i], mk = mask[i], A = a1[i], Bc = bb[i];
      let zz = z[i];
      if (md[i] > 0) {
        // the delay modulation is slow (< 1.1 Hz): evaluate it at the block ends and interpolate linearly inside
        const ph0 = mph[i], inc = minc[i], d0 = len[i], dm = md[i];
        let ph1 = ph0 + inc * n; if (ph1 >= 1) ph1 -= 1;
        let q = ph0 * SIN_N, j = q | 0;
        const dA = d0 + dm * (1 + SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j));
        q = ph1 * SIN_N; j = q | 0;
        const dB = d0 + dm * (1 + SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j));
        const dd = (dB - dA) / n;
        let rpos = w - dA + 4 * (mk + 1); // offset by whole buffer lengths keeps rpos positive (mask wraps)
        const step = 1 - dd;
        for (let s = 0; s < n; s++) {
          const ri = rpos | 0, fr = rpos - ri;
          const v0 = big[bs + (ri & mk)];
          zz = A * (v0 + (big[bs + ((ri + 1) & mk)] - v0) * fr) + Bc * zz + 1e-18 - 1e-18;
          Y[o + s] = zz;
          rpos += step;
        }
        mph[i] = ph1;
      } else {
        const off = w - len[i];
        for (let s = 0; s < n; s++) { zz = A * big[bs + ((off + s) & mk)] + Bc * zz + 1e-18 - 1e-18; Y[o + s] = zz; }
      }
      z[i] = zz;
    }
    // outputs
    for (let s = 0; s < n; s++) { wL[s] = er > 0 ? eL[s] : 0; wR[s] = er > 0 ? eR[s] : 0; }
    for (let i = 0; i < nL; i++) { const o = i * B, gl = cL[i], gr = cR[i]; for (let s = 0; s < n; s++) { const v = Y[o + s]; wL[s] += v * gl; wR[s] += v * gr; } }
    // Hadamard mixing as block butterflies
    for (let h = 1; h < nL; h <<= 1) for (let i = 0; i < nL; i += h << 1) for (let j = i; j < i + h; j++) {
      const oa = j * B, ob = (j + h) * B;
      for (let s = 0; s < n; s++) { const a = Y[oa + s], b = Y[ob + s]; Y[oa + s] = a + b; Y[ob + s] = a - b; }
    }
    // write back with input injection
    const scale = nL === 16 ? 0.25 : 1 / Math.sqrt(8);
    for (let i = 0; i < nL; i++) {
      const o = i * B, bs = base[i], mk = mask[i], gl = inL[i], gr = inR[i];
      for (let s = 0; s < n; s++) big[bs + ((w + s) & mk)] = Y[o + s] * scale + xl[s] * gl + xr[s] * gr;
    }
    this.w = (w + n) & 0x3fffffff;
    // wet EQ, width, mix
    for (let c = 0; c < 2; c++) { const W = c ? wR : wL; this.eq[c][0].process(W, 0, n); this.eq[c][1].process(W, 0, n); }
    const og = this.outGain, mix = this.mix, dry = this.dry, wd = this.width;
    for (let s = 0; s < n; s++) {
      let l = wL[s] * og, r = wR[s] * og;
      if (wd !== 1) { const m = (l + r) * 0.5, sd = (l - r) * 0.5 * wd; l = m + sd; r = m - sd; }
      L[start + s] = L[start + s] * dry + l * mix; R[start + s] = R[start + s] * dry + r * mix;
    }
  }
}
