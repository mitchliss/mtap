// Envelopes. All return Float32Array gain curves (sample-accurate).
import { SR } from './util.js';

/**
 * Analog-style ADSR.
 * p: { a=0.005, d=0.2, s=0.7, r=0.25, aCurve=0 (0 linear, >0 convex/"snappy", <0 concave), peak=1 }
 * gate: seconds the key is held. Returns gate+release long array.
 * Decay/release are exponential: d is the time to fall ~99% of the way, r likewise (to -40 dB of the level).
 */
export function adsr(p, gate, sr = SR) {
  const a = Math.max(0, p.a ?? 0.005), d = Math.max(1e-4, p.d ?? 0.2), s = p.s ?? 0.7, r = Math.max(1e-4, p.r ?? 0.25);
  const peak = p.peak ?? 1, curve = p.aCurve ?? 0;
  const nGate = Math.max(1, Math.round(gate * sr)), nRel = Math.round(r * sr * 1.6);
  const out = new Float32Array(nGate + nRel);
  const nA = Math.round(a * sr);
  const kd = Math.exp(-4.6 / (d * sr)), kr = Math.exp(-4.6 / (r * sr));
  let v = 0;
  for (let i = 0; i < nGate; i++) {
    if (i < nA) {
      const x = i / nA;
      v = peak * (curve > 0 ? 1 - Math.pow(1 - x, 1 + curve * 3) : curve < 0 ? Math.pow(x, 1 - curve * 3) : x);
    } else v = s * peak + (v - s * peak) * kd;
    out[i] = v;
  }
  for (let i = 0; i < nRel; i++) { v *= kr; out[nGate + i] = v; }
  // final short fade to exact zero
  const f = Math.min(64, nRel);
  for (let i = 0; i < f; i++) out[out.length - f + i] *= 1 - (i + 1) / f;
  return out;
}

/**
 * Breakpoint envelope. points: [[t, v], [t, v, curve], ...] (t in seconds, ascending).
 * curve per segment: 0 = linear, >0 = exponential-ish fast-then-slow, <0 = slow-then-fast. 'exp' = true exponential (both v>0).
 * length: seconds (defaults to last point). Holds last value.
 */
export function curve(points, length, sr = SR) {
  const total = Math.max(1, Math.round((length ?? points[points.length - 1][0]) * sr));
  const out = new Float32Array(total);
  let seg = 0;
  for (let i = 0; i < total; i++) {
    const t = i / sr;
    while (seg < points.length - 1 && t >= points[seg + 1][0]) seg++;
    if (seg >= points.length - 1 || t < points[0][0]) { out[i] = t < points[0][0] ? points[0][1] : points[points.length - 1][1]; continue; }
    const [t0, v0] = points[seg], [t1, v1, c = 0] = points[seg + 1];
    let x = (t - t0) / Math.max(1e-9, t1 - t0);
    if (c === 'exp' && v0 > 0 && v1 > 0) { out[i] = v0 * Math.pow(v1 / v0, x); continue; }
    if (c > 0) x = 1 - Math.pow(1 - x, 1 + c);
    else if (c < 0) x = Math.pow(x, 1 - c);
    out[i] = v0 + (v1 - v0) * x;
  }
  return out;
}

/** exponential decay from 1 reaching -60 dB at t60 seconds; n samples */
export function decay(t60, n, sr = SR) {
  const out = new Float32Array(n), k = Math.exp(-6.9078 / (t60 * sr));
  let v = 1;
  for (let i = 0; i < n; i++) { out[i] = v; v *= k; }
  return out;
}

/** attack (linear or sine-shaped) then exponential decay. Handy for percussive layers. */
export function ad(attack, t60, n, sr = SR) {
  const out = new Float32Array(n), nA = Math.max(1, Math.round(attack * sr)), k = Math.exp(-6.9078 / (t60 * sr));
  let v = 1;
  for (let i = 0; i < n; i++) {
    if (i < nA) out[i] = Math.sin((i / nA) * Math.PI / 2);
    else { out[i] = v; v *= k; }
  }
  return out;
}

/** linear ramp array from a to b over n samples */
export function ramp(a, b, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = a + ((b - a) * i) / Math.max(1, n - 1);
  return out;
}
/** exponential ramp (a,b > 0), e.g. for frequency sweeps */
export function expRamp(a, b, n) {
  const out = new Float32Array(n), r = Math.log(b / a);
  for (let i = 0; i < n; i++) out[i] = a * Math.exp((r * i) / Math.max(1, n - 1));
  return out;
}
