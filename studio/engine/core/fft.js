// Radix-2 complex FFT with cached twiddles. Used by analysis and wavetable generation.

const cache = new Map();

export class FFT {
  constructor(n) {
    if (n & (n - 1)) throw new Error('FFT size must be a power of 2');
    this.n = n;
    this.levels = Math.log2(n) | 0;
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos(2 * Math.PI * i / n); this.sin[i] = Math.sin(2 * Math.PI * i / n); }
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let x = i, r = 0;
      for (let b = 0; b < this.levels; b++) { r = (r << 1) | (x & 1); x >>>= 1; }
      this.rev[i] = r;
    }
  }
  static get(n) { let f = cache.get(n); if (!f) { f = new FFT(n); cache.set(n, f); } return f; }
  /** in-place forward transform (inverse=true for inverse, unnormalised) */
  transform(re, im, inverse = false) {
    const n = this.n, rev = this.rev, cs = this.cos, sn = this.sin;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    const sgn = inverse ? 1 : -1;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >>> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tre = re[l] * cs[k] - sgn * im[l] * sn[k];
          const tim = sgn * re[l] * sn[k] + im[l] * cs[k];
          re[l] = re[j] - tre; im[l] = im[j] - tim;
          re[j] += tre; im[j] += tim;
        }
      }
    }
  }
}

const winCache = new Map();
/** periodic Hann window */
export function hann(n) {
  let w = winCache.get(n);
  if (!w) { w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); winCache.set(n, w); }
  return w;
}

/**
 * Power spectrum of a real frame. src read from src[off..off+n) (zero outside).
 * Returns Float64Array(n/2+1) of |X|^2 normalised so a full-scale sine ~ 1 at its bin (Hann corrected).
 */
export function powerSpectrum(src, off, n, out, scratch) {
  const f = FFT.get(n), w = hann(n);
  const re = scratch?.re || new Float64Array(n), im = scratch?.im || new Float64Array(n);
  for (let i = 0; i < n; i++) { const j = off + i; re[i] = (j >= 0 && j < src.length ? src[j] : 0) * w[i]; im[i] = 0; }
  f.transform(re, im);
  const o = out || new Float64Array(n / 2 + 1);
  const norm = 4 / (n * n * 0.25); // Hann coherent gain 0.5
  for (let k = 0; k <= n / 2; k++) o[k] = (re[k] * re[k] + im[k] * im[k]) * norm;
  return o;
}
