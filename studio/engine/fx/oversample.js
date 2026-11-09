// Polyphase FIR up/down-sampling (Kaiser-windowed sinc). Used by saturators, the clipper and true-peak metering.

function besselI0(x) { let s = 1, t = 1; for (let k = 1; k < 30; k++) { t *= (x / (2 * k)) ** 2; s += t; if (t < 1e-12 * s) break; } return s; }

/** Kaiser-windowed sinc lowpass. cutoff in cycles/sample (0..0.5) at the rate the filter runs. */
export function designLowpass(taps, cutoff, beta = 8) {
  const h = new Float64Array(taps), m = (taps - 1) / 2, i0b = besselI0(beta);
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - m;
    const s = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
    const w = besselI0(beta * Math.sqrt(Math.max(0, 1 - (x / m) ** 2))) / i0b;
    h[i] = s * w; sum += h[i];
  }
  for (let i = 0; i < taps; i++) h[i] /= sum;
  return h;
}

// Kernels are generated per (factor, taps, beta) with the coefficients as literals and the history held in locals:
// ~3x faster than generic loops in V8.
const KCACHE = new Map();
const lit = (v) => (Object.is(v, -0) || v === 0 ? '0' : v.toPrecision(17));

function upKernel(F, T, beta) {
  const key = 'u' + F + ',' + T + ',' + beta;
  if (KCACHE.has(key)) return KCACHE.get(key);
  const N = F * T, h = designLowpass(N, 0.5 / F * 0.92, beta);
  const B = Array.from({ length: T }, (_, k) => 'b' + k);
  const lines = [];
  lines.push('let ' + B.map((v, k) => v + ' = st[' + k + ']').join(', ') + ';');
  lines.push('for (let i = start, o = 0; i < end; i++, o += ' + F + ') {');
  let shift = '';
  for (let k = T - 1; k > 0; k--) shift += B[k] + ' = ' + B[k - 1] + '; ';
  lines.push(shift + 'b0 = x[i];');
  for (let p = 0; p < F; p++) {
    const terms = [];
    for (let k = 0; k < T; k++) { const c = h[p + k * F] * F; if (c !== 0) terms.push(lit(c) + ' * ' + B[k]); }
    lines.push('out[o + ' + p + '] = ' + (terms.join(' + ') || '0') + ';');
  }
  lines.push('}');
  lines.push(B.map((v, k) => 'st[' + k + '] = ' + v + ';').join(' '));
  const fn = new Function('x', 'start', 'end', 'out', 'st', lines.join(String.fromCharCode(10)));
  const sumAbs = Math.max(...Array.from({ length: F }, (_, p) => { let s = 0; for (let k = 0; k < T; k++) s += Math.abs(h[p + k * F] * F); return s; }));
  const r = { fn, h, sumAbs };
  KCACHE.set(key, r);
  return r;
}

function downKernel(F, N, beta) {
  const key = 'd' + F + ',' + N + ',' + beta;
  if (KCACHE.has(key)) return KCACHE.get(key);
  const h = designLowpass(N, 0.5 / F * 0.92, beta);
  // w = [history (N-1) | new samples]; out[start+i] = sum_k h[k] * w[N-1 + i*F + F-1 - k]
  const terms = [];
  for (let k = 0; k < N; k++) if (h[k] !== 0) terms.push(lit(h[k]) + ' * w[j - ' + k + ']');
  const src = 'for (let i = 0, j = ' + (N - 1 + F - 1) + '; i < n; i++, j += ' + F + ') { out[start + i] = ' + terms.join(' + ') + '; }';
  const r = { fn: new Function('w', 'n', 'out', 'start', src), h };
  KCACHE.set(key, r);
  return r;
}

/** Streaming polyphase interpolator by `factor` (Kaiser sinc, factor*tapsPerPhase taps). */
export class Upsampler {
  constructor(factor = 4, tapsPerPhase = 12, beta = 8) {
    this.F = factor; this.T = tapsPerPhase;
    const k = upKernel(factor, tapsPerPhase, beta);
    this.kernel = k.fn; this.sumAbs = k.sumAbs; // sumAbs: max over phases of sum |coef| (bound on output / input peak)
    this.st = new Float64Array(tapsPerPhase);
    this.delay = (factor * tapsPerPhase - 1) / 2 / factor; // in input samples
  }
  /** x[start..end) -> out (length (end-start)*F) */
  process(x, start, end, out) { this.kernel(x, start, end, out, this.st); return out; }
  reset() { this.st.fill(0); }
}

/** Streaming decimator by `factor` (lowpass then keep every F-th sample). */
export class Downsampler {
  constructor(factor = 4, taps = 48, beta = 8) {
    this.F = factor; this.N = taps;
    const k = downKernel(factor, taps, beta);
    this.kernel = k.fn; this.h = k.h;
    this.w = new Float64Array(taps - 1 + 4096 * factor);
  }
  /** xUp: n*F samples -> out[start..start+n) */
  process(xUp, n, out, start) {
    const F = this.F, H = this.N - 1, m = n * F;
    if (this.w.length < H + m) { const w2 = new Float64Array(H + m); w2.set(this.w.subarray(0, H)); this.w = w2; }
    const w = this.w;
    for (let i = 0; i < m; i++) w[H + i] = xUp[i];
    this.kernel(w, n, out, start);
    w.copyWithin(0, m, m + H); // keep the last N-1 samples as history
  }
}

/**
 * Apply a per-sample nonlinearity fn(x) at F-times oversampling to x[start..end) in place (mono).
 * Holds state across calls (create one per channel). If fn.block(buf, m) exists it is used to shape the whole
 * oversampled block in one call (much faster than a call per sample).
 */
export class OversampledShaper {
  constructor(fn, factor = 4) {
    this.block = typeof fn.block === 'function' ? fn.block : null;
    this.fn = fn; this.F = factor; this.up = new Upsampler(factor, 8, 7); this.down = new Downsampler(factor, factor * 8, 7);
    this.tmp = new Float64Array(0);
  }
  process(x, start, end) {
    const n = end - start, F = this.F;
    if (this.tmp.length < n * F) this.tmp = new Float64Array(n * F);
    const t = this.tmp, fn = this.fn;
    this.up.process(x, start, end, t);
    if (this.block) this.block(t, n * F); else for (let i = 0; i < n * F; i++) t[i] = fn(t[i]);
    this.down.process(t, n, x, start);
  }
}

/**
 * True-peak (4x oversampled, 48-tap) maximum absolute value of a whole buffer. Returns linear peak.
 * Blocks whose sample peak cannot produce an interpolated value above the running maximum are skipped (exact bound).
 */
export function truePeak(buf) {
  const up = new Upsampler(4, 12, 8), S = up.sumAbs, T = 12;
  const B = 1024, tmp = new Float64Array(B * 4), n = buf.length;
  let pk = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(buf[i]); if (a > pk) pk = a; }
  const st = up.st;
  for (let s = 0; s < n + 16; s += B) {
    const e = Math.min(n + 16, s + B);
    let wm = 0; // peak over the samples feeding this block's outputs
    for (let i = Math.max(0, s - T); i < Math.min(n, e); i++) { const a = Math.abs(buf[i]); if (a > wm) wm = a; }
    if (wm * S <= pk) continue;
    // rebuild history for this block (exact, so skipping earlier blocks is safe)
    for (let k = 0; k < T; k++) { const i = s - 1 - k; st[k] = i >= 0 && i < n ? buf[i] : 0; }
    const src = e <= n ? buf : padTo(buf, s, e);
    if (e <= n) up.process(src, s, e, tmp); else up.process(src, 0, e - s, tmp);
    for (let i = 0, m = (e - s) * 4; i < m; i++) { const a = Math.abs(tmp[i]); if (a > pk) pk = a; }
  }
  return pk;
}
function padTo(X, s, e) { const t = new Float32Array(e - s); for (let k = 0; k < e - s; k++) t[k] = s + k < X.length ? X[s + k] : 0; return t; }
