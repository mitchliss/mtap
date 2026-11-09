// ITU-R BS.1770-4 / EBU R128 loudness: K-weighting, gated integrated loudness, short-term & momentary, LRA.
import { SR } from '../core/util.js';

function kCoefs(sr) {
  // pre-filter (high shelf) and RLB high-pass, recomputed for any rate (pyloudnorm parameterisation)
  const hs = (() => {
    const G = 3.999843853973347, Q = 0.7071752369554196, fc = 1681.974450955533;
    const A = Math.pow(10, G / 40), w0 = (2 * Math.PI * fc) / sr, alpha = Math.sin(w0) / (2 * Q), c = Math.cos(w0);
    const b0 = A * ((A + 1) + (A - 1) * c + 2 * Math.sqrt(A) * alpha), b1 = -2 * A * ((A - 1) + (A + 1) * c), b2 = A * ((A + 1) + (A - 1) * c - 2 * Math.sqrt(A) * alpha);
    const a0 = (A + 1) - (A - 1) * c + 2 * Math.sqrt(A) * alpha, a1 = 2 * ((A - 1) - (A + 1) * c), a2 = (A + 1) - (A - 1) * c - 2 * Math.sqrt(A) * alpha;
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  })();
  const hp = (() => {
    const Q = 0.5003270373238773, fc = 38.13547087602444, w0 = (2 * Math.PI * fc) / sr, alpha = Math.sin(w0) / (2 * Q), c = Math.cos(w0);
    const a0 = 1 + alpha;
    return [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - alpha) / a0];
  })();
  return [hs, hp];
}

/** squared K-weighted samples summed over channels, as Float64Array per 100 ms (4800 @48k) sub-block energy */
export function kWeightedPower(chans, sr = SR) {
  const [hs, hp] = kCoefs(sr);
  const n = chans[0].length, sub = Math.round(sr * 0.1), nSub = Math.ceil(n / sub);
  const pw = new Float64Array(nSub);
  for (const x of chans) {
    let z1 = 0, z2 = 0, w1 = 0, w2 = 0;
    const [b0, b1, b2, a1, a2] = hs, [c0, c1, c2, d1, d2] = hp, DN = 1e-18;
    for (let s0 = 0, blk = 0; s0 < n; s0 += sub, blk++) {
      const e = Math.min(n, s0 + sub);
      let acc = 0;
      for (let i = s0; i < e; i++) {
        const v = x[i];
        const y = b0 * v + z1; z1 = b1 * v - a1 * y + z2 + DN - DN; z2 = b2 * v - a2 * y + DN - DN;
        const yy = c0 * y + w1; w1 = c1 * y - d1 * yy + w2 + DN - DN; w2 = c2 * y - d2 * yy + DN - DN;
        acc += yy * yy;
      }
      pw[blk] += acc;
    }
  }
  return { pw, sub, n };
}

const toLufs = (ms) => -0.691 + 10 * Math.log10(Math.max(ms, 1e-20));

/** gated integrated loudness from 400 ms blocks (75% overlap) built from 100 ms sub-blocks */
export function integratedFromPower({ pw, sub }, from = 0, to = pw.length) {
  const blocks = [];
  for (let i = from; i + 4 <= to; i++) blocks.push((pw[i] + pw[i + 1] + pw[i + 2] + pw[i + 3]) / (4 * sub));
  const abs = blocks.filter((z) => toLufs(z) > -70);
  if (!abs.length) return -Infinity;
  const rel = toLufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter((z) => toLufs(z) > rel);
  if (!g.length) return -Infinity;
  return toLufs(g.reduce((a, b) => a + b, 0) / g.length);
}

/** short-term (3 s) loudness series at 100 ms hop: Float64Array (LUFS) aligned to sub-block index (window ending there) */
export function shortTermSeries({ pw, sub }) {
  const out = new Float64Array(pw.length).fill(-Infinity);
  let acc = 0;
  for (let i = 0; i < pw.length; i++) { acc += pw[i]; if (i >= 30) acc -= pw[i - 30]; if (i >= 29) out[i] = toLufs(acc / (30 * sub)); }
  return out;
}
export function momentaryMax({ pw, sub }) {
  let mx = -Infinity;
  for (let i = 3; i < pw.length; i++) mx = Math.max(mx, toLufs((pw[i] + pw[i - 1] + pw[i - 2] + pw[i - 3]) / (4 * sub)));
  return mx;
}
/** EBU loudness range from short-term values */
export function loudnessRange(st) {
  const v = Array.from(st).filter((x) => x > -70);
  if (v.length < 2) return 0;
  const mean = toLufs(v.map((l) => Math.pow(10, (l + 0.691) / 10)).reduce((a, b) => a + b, 0) / v.length);
  const g = v.filter((l) => l > mean - 20).sort((a, b) => a - b);
  if (g.length < 2) return 0;
  return g[Math.floor(0.95 * (g.length - 1))] - g[Math.floor(0.1 * (g.length - 1))];
}
/** convenience: integrated LUFS of [L, R] */
export function lufs(L, R, sr = SR) { return integratedFromPower(kWeightedPower([L, R], sr)); }
