// Master post-chain (offline, whole buffer): drive -> soft clipper (4x oversampled) -> true-peak look-ahead limiter,
// with iterative loudness normalisation to a target integrated LUFS. Then tail trim + fade.
import { dbToGain, gainToDb, tanhFast } from '../core/util.js';
import { makeClipFn } from '../fx/dynamics.js';
import { OversampledShaper, Upsampler, truePeak } from '../fx/oversample.js';
import { lufs } from '../analysis/loudness.js';

/**
 * Offline look-ahead limiter (exactly latency-compensated). Gain = moving average (W) of a release-smoothed forward minimum,
 * which guarantees the ceiling is never exceeded at sample (or, with truePeak, 4x-interpolated) peaks.
 * opts: { ceiling (dB)=-1, release=0.08 s, lookahead=0.0015 s, truePeak=true }. Returns { grMax, grMean (dB) }
 */
export function limitBuffers(L, R, opts = {}, sr = 44100) {
  const n = L.length, c = dbToGain(opts.ceiling ?? -1), W = Math.max(1, Math.round((opts.lookahead ?? 0.0015) * sr));
  const relK = Math.exp(-1 / ((opts.release ?? 0.08) * sr));
  const req = new Float32Array(n);
  if (opts.truePeak !== false) {
    // detector: per input sample, the max |x| of its 4 interpolated points (4x polyphase FIR), aligned for the FIR delay,
    // then a 3-sample max so every inter-sample peak protects both neighbouring samples.
    // Blocks whose window peak * sum|coef| cannot exceed the ceiling are skipped (exact bound), so quiet passages cost nothing.
    const det = new Float32Array(n), B = 512, tmp = new Float64Array(B * 4), T = 12;
    for (const X of [L, R]) {
      for (let i = 0; i < n; i++) { const a = Math.abs(X[i]); if (a > det[i]) det[i] = a; }
      const u = new Upsampler(4, T, 8), D = Math.floor(u.delay), S = u.sumAbs, st = u.st; // output k*4+p ~ input time k - 5.875 + p/4
      for (let s = 0; s < n + 16; s += B) {
        const e = Math.min(n + 16, s + B), cnt = e - s;
        let wm = 0;
        for (let i = Math.max(0, s - T); i < Math.min(n, e); i++) { const a = Math.abs(X[i]); if (a > wm) wm = a; }
        if (wm * S <= c) continue;
        for (let k = 0; k < T; k++) { const i = s - 1 - k; st[k] = i >= 0 && i < n ? X[i] : 0; }
        if (e <= n) u.process(X, s, e, tmp); else u.process(padTail(X, s, cnt), 0, cnt, tmp);
        for (let k = 0; k < cnt; k++) {
          const o = k * 4;
          let mx = Math.abs(tmp[o]); const a1 = Math.abs(tmp[o + 1]), a2 = Math.abs(tmp[o + 2]), a3 = Math.abs(tmp[o + 3]);
          if (a1 > mx) mx = a1; if (a2 > mx) mx = a2; if (a3 > mx) mx = a3;
          const i = s + k - D - 1;
          if (i >= 0 && i < n && mx > det[i]) det[i] = mx;
        }
      }
    }
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const cur = det[i], next = i + 1 < n ? det[i + 1] : 0;
      let m3 = cur; if (prev > m3) m3 = prev; if (next > m3) m3 = next;
      prev = cur;
      req[i] = m3 > c ? c / m3 : 1;
    }
  } else for (let i = 0; i < n; i++) { const m = Math.max(Math.abs(L[i]), Math.abs(R[i])); req[i] = m > c ? c / m : 1; }
  // forward min over [i, i+W) via monotonic deque (computed backwards)
  const h = new Float32Array(n), dq = new Int32Array(n); let qh = 0, qt = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (qt > qh && req[dq[qt - 1]] >= req[i]) qt--;
    dq[qt++] = i;
    while (dq[qh] >= i + W) qh++;
    h[i] = req[dq[qh]];
  }
  // release smoothing (instant attack because h already looks ahead), then box average of W
  // the history before sample 0 is seeded with h[0] (= min req over the first W samples), so a render that starts
  // loud (e.g. --from a drop) is limited from its very first sample
  const h0 = n ? h[0] : 1;
  let e = h0, acc = 0, gMin = 1, gSum = 0;
  const ring = new Float32Array(W).fill(h0); acc = W * h0;
  const kr = 1 - relK, invW = 1 / W;
  for (let i = 0, ri = 0; i < n; i++) {
    const hi = h[i];
    e = hi < e ? hi : e + (hi - e) * kr;
    acc += e - ring[ri]; ring[ri] = e; if (++ri === W) ri = 0;
    let g = acc * invW; if (g > 1) g = 1;
    L[i] *= g; R[i] *= g;
    gSum += g; if (g < gMin) gMin = g;
  }
  return { grMax: -20 * Math.log10(gMin), grMean: -20 * Math.log10(gSum / n) };
}
function padTail(X, s, cnt) { const t = new Float32Array(cnt); for (let k = 0; k < cnt; k++) t[k] = s + k < X.length ? X[s + k] : 0; return t; }

/** apply drive + clip (optionally oversampled) into the given output buffers (reused across passes) */
function driveClip(L, R, driveDb, clip, oversample, oL, oR) {
  const g = dbToGain(driveDb), n = L.length;
  if (!clip) { for (let i = 0; i < n; i++) { oL[i] = L[i] * g; oR[i] = R[i] * g; } return [oL, oR]; }
  if (oversample) {
    for (let i = 0; i < n; i++) { oL[i] = L[i] * g; oR[i] = R[i] * g; }
    const fn = makeClipFn(clip.ceiling ?? 0.5, clip.knee ?? 2, !!clip.hard);
    const lat = 8; // OversampledShaper latency (~7.75 samples): shift back
    for (const X of [oL, oR]) {
      const sh = new OversampledShaper(fn, 4), B = 8192;
      const tmp = new Float32Array(n + lat);
      tmp.set(X);
      for (let s = 0; s < n + lat; s += B) sh.process(tmp, s, Math.min(n + lat, s + B));
      for (let i = 0; i < n; i++) X[i] = tmp[i + lat];
    }
    return [oL, oR];
  }
  // inline soft clip (same curve as makeClipFn)
  const cc = dbToGain(clip.ceiling ?? 0.5), t = dbToGain((clip.ceiling ?? 0.5) - (clip.knee ?? 2)), w = cc - t, hard = !!clip.hard;
  for (let ch = 0; ch < 2; ch++) {
    const X = ch ? R : L, O = ch ? oR : oL;
    for (let i = 0; i < n; i++) {
      const x = X[i] * g, a = x < 0 ? -x : x;
      if (a <= t) { O[i] = x; continue; }
      const y = hard ? (a > cc ? cc : a) : t + w * tanhFast((a - t) / w);
      O[i] = x < 0 ? -y : y;
    }
  }
  return [oL, oR];
}

/**
 * Master: cfg { targetLufs=-10, clip: {ceiling=+0.5 dB, knee=2} | false, limiter: {ceiling=-1, release=0.08, lookahead=0.0015},
 *               normalize=true, drive=0 (dB, used when normalize=false), fadeOut=0.05 s, trimDb=-80 }
 * Returns { L, R, report }
 */
export function masterPost(L, R, cfg = {}, sr = 44100, log = () => {}) {
  const target = cfg.targetLufs ?? -10;
  const clip = cfg.clip === false ? null : { ceiling: 0.5, knee: 2, ...(cfg.clip || {}) };
  const lim = { ceiling: -1, release: 0.08, lookahead: 0.0015, ...(cfg.limiter || {}) };
  const pre = lufs(L, R, sr);
  const prePeak = Math.max(peakOf(L), peakOf(R));
  const report = { preLufs: pre, prePeakDb: gainToDb(prePeak), target, iterations: [] };
  if (!isFinite(pre)) { report.note = 'silent mix: master chain skipped'; return { L, R, report }; }
  let drive = cfg.normalize === false ? cfg.drive ?? 0 : target - pre;
  let out, res;
  const bufA = new Float32Array(L.length), bufB = new Float32Array(L.length);
  const run = (d, final) => {
    const [a, b] = driveClip(L, R, d, clip, final, bufA, bufB);
    const r = limitBuffers(a, b, { ...lim, truePeak: final }, sr);
    return { a, b, r, l: lufs(a, b, sr) };
  };
  if (cfg.normalize !== false) {
    let prev = null;
    for (let it = 0; it < 6; it++) {
      res = run(drive, false);
      report.iterations.push({ drive: +drive.toFixed(2), lufs: +res.l.toFixed(2), grMax: +res.r.grMax.toFixed(2) });
      log(`  master pass ${it + 1}: drive ${drive.toFixed(2)} dB -> ${res.l.toFixed(2)} LUFS (limiter max GR ${res.r.grMax.toFixed(1)} dB)`);
      const err = target - res.l;
      if (Math.abs(err) < 0.05) break;
      let step = err;
      if (prev && Math.abs(res.l - prev.l) > 1e-3) { const slope = (res.l - prev.l) / (drive - prev.drive); if (slope > 0.05) step = err / slope; }
      prev = { drive, l: res.l };
      drive += Math.max(-12, Math.min(12, step));
    }
  }
  res = run(drive, true);
  // final correction if the oversampled/true-peak pass moved loudness
  if (cfg.normalize !== false && Math.abs(target - res.l) > 0.12) { drive += (target - res.l) * 1.05; res = run(drive, true); }
  out = [res.a, res.b];
  let tp = Math.max(truePeak(out[0]), truePeak(out[1]));
  let tpDb = gainToDb(tp);
  if (tpDb > lim.ceiling + 0.02) {
    // rare: interpolation overshoot -> re-limit with a lower ceiling
    const over = tpDb - lim.ceiling + 0.05;
    limitBuffers(out[0], out[1], { ...lim, ceiling: lim.ceiling - over, truePeak: true }, sr);
    tp = Math.max(truePeak(out[0]), truePeak(out[1])); tpDb = gainToDb(tp);
  }
  report.drive = drive; report.limiterGrMax = res.r.grMax; report.limiterGrMean = res.r.grMean;
  report.postLufs = lufs(out[0], out[1], sr); report.truePeakDb = tpDb;
  // tail: trim trailing near-silence, then a short fade so the file ends on digital silence
  const thr = dbToGain(cfg.trimDb ?? -80);
  let end = out[0].length;
  while (end > sr && Math.abs(out[0][end - 1]) < thr && Math.abs(out[1][end - 1]) < thr) end--;
  end = Math.min(out[0].length, end + Math.round(0.05 * sr));
  const Lf = out[0].slice(0, end), Rf = out[1].slice(0, end);
  const fade = Math.min(end, Math.round((cfg.fadeOut ?? 0.05) * sr));
  for (let i = 0; i < fade; i++) { const g = Math.cos(((i + 1) / fade) * Math.PI / 2) ** 2; Lf[end - fade + i] *= g; Rf[end - fade + i] *= g; }
  // head: 3 ms raised-cosine fade-in so every game launch/replay starts on zero (cut 4, label note)
  const fin = Math.min(end, Math.round(0.003 * sr));
  for (let i = 0; i < fin; i++) { const g = Math.sin(((i + 0.5) / fin) * Math.PI / 2) ** 2; Lf[i] *= g; Rf[i] *= g; }
  report.trimmedTo = end / sr;
  return { L: Lf, R: Rf, report };
}

function peakOf(x) { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; }
