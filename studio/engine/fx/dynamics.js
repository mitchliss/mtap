// Dynamics: compressor (with external sidechain), trigger ducker (volume-shaper), transient shaper,
// streaming look-ahead limiter, clipper, multiband "OTT"-style compressor, trance gate.
import { SR, dbToGain, clamp, tanhFast } from '../core/util.js';
import { Biquad } from '../core/filters.js';
import { Upsampler, OversampledShaper } from './oversample.js';

const LOG10_20 = 20 / Math.LN10;
const tc = (sec, sr) => (sec <= 0 ? 0 : Math.exp(-1 / (sec * sr)));

/**
 * Feed-forward compressor, stereo-linked, soft knee, log-domain smoothing.
 * cfg: { threshold=-18 dB, ratio=4, attack=0.01 s, release=0.12 s, knee=6 dB, makeup=0 dB, detector='peak'|'rms',
 *        rmsTime=0.01, scHpf=0 Hz (sidechain high-pass on the detector), mix=1 (parallel), lookahead=0 s,
 *        autoRelease=false (program-dependent: release slows on sustained reduction), key: (set by mixer) }
 * Stats: this.stats = { grSum, grMax, n } (gain reduction dB, positive numbers)
 */
export class Compressor {
  constructor(cfg = {}, sr = SR) {
    this.sr = sr;
    this.T = cfg.threshold ?? -18; this.R = cfg.ratio === 'inf' ? 1000 : cfg.ratio ?? 4; this.W = cfg.knee ?? 6;
    this.att = tc(cfg.attack ?? 0.01, sr); this.rel = tc(cfg.release ?? 0.12, sr); this.relSlow = tc((cfg.release ?? 0.12) * 4, sr);
    this.autoRel = !!cfg.autoRelease;
    this.makeup = dbToGain(cfg.makeup ?? 0); this.mix = cfg.mix ?? 1;
    this.rms = cfg.detector === 'rms'; this.rmsK = tc(cfg.rmsTime ?? 0.01, sr);
    this.hp = cfg.scHpf ? [new Biquad('hp', cfg.scHpf, 0.7071, 0, sr)] : null;
    this.la = Math.round((cfg.lookahead || 0) * sr);
    if (this.la) { this.dl = [new Float32Array(this.la + 1), new Float32Array(this.la + 1)]; this.dp = 0; }
    this.env = 0; this.ms = 0; this.slow = 0; this.keyL = null; this.keyR = null;
    this.stats = { grSum: 0, grMax: 0, n: 0 };
  }
  /** external sidechain key for the next process() call (arrays aligned with L/R indices) */
  setKey(L, R) { this.keyL = L; this.keyR = R || L; }
  gainComputer(x) {
    const T = this.T, R = this.R, W = this.W, d = x - T;
    if (2 * d < -W) return 0;
    if (W > 0 && 2 * Math.abs(d) <= W) return ((1 / R - 1) * (d + W / 2) ** 2) / (2 * W);
    return (1 / R - 1) * d;
  }
  process(L, R, start = 0, end = L.length) {
    const kL = this.keyL || L, kR = this.keyR || R;
    let env = this.env, ms = this.ms, slow = this.slow;
    const att = this.att, rel = this.rel, relSlow = this.relSlow, rmsK = this.rmsK, mk = this.makeup, mix = this.mix;
    const T = this.T, W = this.W, slope = 1 / this.R - 1, halfW = W / 2, inv2W = W > 0 ? 1 / (2 * W) : 0;
    const below = Math.pow(10, (T - halfW) / 20); // detector levels at or below this need no gain computation
    const useRms = this.rms, autoRel = this.autoRel, la = this.la, hp = this.hp ? this.hp[0] : null;
    const dl0 = la ? this.dl[0] : null, dl1 = la ? this.dl[1] : null;
    let dp = this.dp || 0;
    let grSum = 0, grMax = this.stats.grMax;
    for (let i = start; i < end; i++) {
      let a;
      if (hp) { a = hp.tick((kL[i] + kR[i]) * 0.5); a = (a < 0 ? -a : a) * 1.4; }
      else { const p = kL[i], q = kR[i]; const ap = p < 0 ? -p : p, aq = q < 0 ? -q : q; a = ap > aq ? ap : aq; }
      let lvl;
      if (useRms) { ms = rmsK * ms + (1 - rmsK) * a * a + 1e-18 - 1e-18; lvl = Math.sqrt(ms) * 1.4142; } else lvl = a;
      // gain computer (soft knee), skipped in the linear domain while the level is under the knee
      let g = 0;
      if (lvl > below) {
        const dd = LOG10_20 * Math.log(lvl) - T;
        if (W > 0 && 2 * (dd < 0 ? -dd : dd) <= W) { const u = dd + halfW; g = slope * u * u * inv2W; }
        else if (2 * dd >= -W) g = slope * dd;
      }
      if (g < env) env = att * env + (1 - att) * g;
      else {
        let r = rel;
        if (autoRel) { slow = relSlow * slow + (1 - relSlow) * g + 1e-18 - 1e-18; r = slow < -3 ? relSlow : rel; }
        env = r * env + (1 - r) * g;
      }
      env = env + 1e-18 - 1e-18;
      const gain = env > -1e-6 ? mk : Math.exp(env / LOG10_20) * mk;
      let l, rr;
      if (la) { l = dl0[dp]; rr = dl1[dp]; dl0[dp] = L[i]; dl1[dp] = R[i]; if (++dp > la) dp = 0; }
      else { l = L[i]; rr = R[i]; }
      if (mix >= 1) { L[i] = l * gain; R[i] = rr * gain; }
      else { const gg = 1 - mix + mix * gain; L[i] = l * gg; R[i] = rr * gg; }
      grSum -= env; if (-env > grMax) grMax = -env;
    }
    this.env = env; this.ms = ms; this.slow = slow; this.dp = dp; this.keyL = this.keyR = null;
    this.stats.grSum += grSum; this.stats.grMax = grMax; this.stats.n += end - start;
  }
}

/**
 * Trigger-list ducker ("volume shaper" / Kickstart style sidechain).
 * cfg: { times: [sec...] (sorted), depth=0.6 (0..1 fraction of gain removed) or depthDb, attack=0.002, hold=0.01,
 *        release=0.2 s (time to recover), shape='smooth'|'exp'|'linear', curve=1 (exponent on recovery) }
 * process(L, R, start, end, frame0) where frame0 = absolute frame of L[start].
 */
export class Ducker {
  constructor(cfg = {}, sr = SR) {
    this.sr = sr;
    this.frames = Float64Array.from((cfg.times || []).slice().sort((a, b) => a - b).map((t) => t * sr));
    this.depth = cfg.depthDb !== undefined ? 1 - dbToGain(-Math.abs(cfg.depthDb)) : cfg.depth ?? 0.6;
    this.att = Math.max(1, (cfg.attack ?? 0.002) * sr); this.hold = (cfg.hold ?? 0.01) * sr;
    this.relFn = typeof cfg.release === 'function' ? cfg.release : null;
    this.rel = Math.max(1, (typeof cfg.release === 'number' ? cfg.release : 0.2) * sr);
    this.shape = cfg.shape || 'smooth'; this.curve = cfg.curve ?? 1;
    this.idx = 0; this.g0 = 1; this.cur = -1; this.relCur = this.rel;
  }
  curveAt(tau) {
    // gain for time tau (frames) since trigger, starting from g0
    const d = this.depth, gmin = 1 - d;
    if (tau < this.att) { const x = tau / this.att; return this.g0 + (gmin - this.g0) * (x * x * (3 - 2 * x)); }
    tau -= this.att;
    if (tau < this.hold) return gmin;
    let x = (tau - this.hold) / this.relCur;
    if (x >= 1) return 1;
    if (this.curve !== 1) x = Math.pow(x, this.curve);
    if (this.shape === 'linear') return gmin + d * x;
    if (this.shape === 'exp') return 1 - d * Math.exp(-5 * x) * (1 - x);
    return gmin + d * x * x * (3 - 2 * x);
  }
  process(L, R, start, end, frame0 = 0) {
    const fr = this.frames;
    for (let i = start; i < end; i++) {
      const f = frame0 + (i - start);
      while (this.idx < fr.length && fr[this.idx] <= f) {
        const g0 = this.cur >= 0 ? this.curveAt(fr[this.idx] - this.cur) : 1;
        this.g0 = Math.min(1, g0); this.cur = fr[this.idx];
        this.relCur = this.relFn ? Math.max(1, this.relFn(this.cur / this.sr) * this.sr) : this.rel;
        this.idx++;
      }
      if (this.cur < 0) continue;
      const g = this.curveAt(f - this.cur);
      L[i] *= g; R[i] *= g;
    }
  }
}

/**
 * Transient shaper (SPL-style): fast vs slow envelope difference.
 * cfg: { attack=0 (dB of transient boost/cut, -12..12), sustain=0 (dB), fast=0.001, slow=0.03, release=0.15 }
 */
export class TransientShaper {
  constructor(cfg = {}, sr = SR) {
    this.a = cfg.attack ?? 0; this.s = cfg.sustain ?? 0;
    this.fA = tc(cfg.fast ?? 0.0008, sr); this.sA = tc(cfg.slow ?? 0.03, sr); this.rel = tc(cfg.release ?? 0.15, sr);
    this.ef = 0; this.es = 0;
  }
  process(L, R, start = 0, end = L.length) {
    let ef = this.ef, es = this.es; const fA = this.fA, sA = this.sA, rel = this.rel, a = this.a / 6, s = this.s / 6;
    for (let i = start; i < end; i++) {
      const x = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      ef = (x > ef ? fA * ef + (1 - fA) * x : rel * ef + (1 - rel) * x) + 1e-18 - 1e-18;
      es = (x > es ? sA * es + (1 - sA) * x : rel * es + (1 - rel) * x) + 1e-18 - 1e-18;
      const d = LOG10_20 * Math.log((ef + 1e-6) / (es + 1e-6)); // >0 on attacks
      const gdb = clamp(d > 0 ? a * d : -s * d, -18, 18);
      const g = Math.exp(gdb / LOG10_20);
      L[i] *= g; R[i] *= g;
    }
    this.ef = ef; this.es = es;
  }
}

/**
 * Streaming look-ahead peak limiter for buses (adds `lookahead` latency).
 * cfg: { ceiling=-1 dB, release=0.06, lookahead=0.001 }
 */
export class Limiter {
  constructor(cfg = {}, sr = SR) {
    this.c = dbToGain(cfg.ceiling ?? -1); this.W = Math.max(1, Math.round((cfg.lookahead ?? 0.001) * sr));
    this.relK = tc(cfg.release ?? 0.06, sr);
    const N = this.W + 1;
    this.dL = new Float32Array(N); this.dR = new Float32Array(N); this.dp = 0;
    this.req = new Float64Array(this.W); this.rp = 0; this.env = 1;
    this.box = new Float64Array(this.W).fill(1); this.bp = 0; this.bsum = this.W;
    this.stats = { grSum: 0, grMax: 0, n: 0 };
  }
  process(L, R, start = 0, end = L.length) {
    const W = this.W, c = this.c, relK = this.relK, req = this.req, box = this.box;
    for (let i = start; i < end; i++) {
      const pk = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      req[this.rp] = pk > c ? c / pk : 1; this.rp = (this.rp + 1) % W;
      let m = 1; for (let k = 0; k < W; k++) if (req[k] < m) m = req[k];
      this.env = m < this.env ? m : this.env + (m - this.env) * (1 - relK);
      this.bsum += this.env - box[this.bp]; box[this.bp] = this.env; this.bp = (this.bp + 1) % W;
      const g = Math.min(this.bsum / W, 1);
      const dp = this.dp, N = W + 1;
      const l = this.dL[dp], r = this.dR[dp];
      this.dL[dp] = L[i]; this.dR[dp] = R[i]; this.dp = (dp + 1) % N;
      const o = Math.min(1, g);
      L[i] = l * o; R[i] = r * o;
      const gr = -20 * Math.log10(o); this.stats.grSum += gr; if (gr > this.stats.grMax) this.stats.grMax = gr;
    }
    this.stats.n += end - start;
  }
}

/** soft clip curve: linear below (ceiling - knee), smooth to ceiling (never exceeds). */
export function makeClipFn(ceilingDb = 0, kneeDb = 2, hard = false) {
  const c = dbToGain(ceilingDb), t = dbToGain(ceilingDb - kneeDb), w = c - t;
  if (hard) {
    const f = (x) => (x > c ? c : x < -c ? -c : x);
    f.block = (b, m) => { for (let i = 0; i < m; i++) { const x = b[i]; b[i] = x > c ? c : x < -c ? -c : x; } };
    return f;
  }
  const iw = 1 / w;
  const f = (x) => {
    const a = Math.abs(x);
    if (a <= t) return x;
    const y = t + w * tanhFast((a - t) * iw);
    return x < 0 ? -y : y;
  };
  f.block = (b, m) => {
    for (let i = 0; i < m; i++) {
      const x = b[i], a = x < 0 ? -x : x;
      if (a <= t) continue;
      let u = (a - t) * iw;
      if (u > 4.97) u = 1; else { const u2 = u * u; u = u * (135135 + u2 * (17325 + u2 * (378 + u2))) / (135135 + u2 * (62370 + u2 * (3150 + u2 * 28))); }
      const y = t + w * u;
      b[i] = x < 0 ? -y : y;
    }
  };
  return f;
}

/** Clipper insert. cfg: { ceiling=-0.3 dB, knee=1.5 dB, oversample=4 (1 = off), drive=0 dB, hard=false } */
export class Clipper {
  constructor(cfg = {}, sr = SR) {
    void sr;
    this.drive = dbToGain(cfg.drive ?? 0);
    const fn = makeClipFn(cfg.ceiling ?? -0.3, cfg.knee ?? 1.5, !!cfg.hard);
    this.fn = fn; this.os = (cfg.oversample ?? 4) > 1 ? [new OversampledShaper(fn, cfg.oversample ?? 4), new OversampledShaper(fn, cfg.oversample ?? 4)] : null;
    this.count = 0;
  }
  process(L, R, start = 0, end = L.length) {
    if (this.drive !== 1) for (let i = start; i < end; i++) { L[i] *= this.drive; R[i] *= this.drive; }
    if (this.os) { this.os[0].process(L, start, end); this.os[1].process(R, start, end); }
    else for (let i = start; i < end; i++) { L[i] = this.fn(L[i]); R[i] = this.fn(R[i]); }
  }
}

/**
 * 3-band upward+downward compressor in the spirit of "OTT" (Linkwitz-Riley 4th-order crossovers).
 * cfg: { depth=0.4 (0..1 wet), lowX=120, highX=2500, up=0.6 (upward amount 0..1), down=1 (downward 0..1),
 *        time=0.5 (attack/release scale), gains: [lowDb, midDb, highDb], threshold=-24 (down), floor=-40 (up) }
 */
export class OTT {
  constructor(cfg = {}, sr = SR) {
    this.sr = sr; this.depth = cfg.depth ?? 0.4;
    const lx = cfg.lowX ?? 120, hx = cfg.highX ?? 2500;
    const mk = (t, f) => [new Biquad(t, f, 0.7071, 0, sr), new Biquad(t, f, 0.7071, 0, sr)];
    this.ch = [0, 1].map(() => ({ lpA: mk('lp', lx), hpA: mk('hp', lx), lpB: mk('lp', hx), hpB: mk('hp', hx), apLow: mk('ap', hx) }));
    const ts = cfg.time ?? 0.5;
    this.bands = [0, 1, 2].map((b) => ({
      env: 0, att: tc([0.012, 0.006, 0.003][b] * ts * 2, sr), rel: tc([0.25, 0.15, 0.1][b] * ts * 2, sr),
      g: dbToGain((cfg.gains || [0, 0, 0])[b]),
    }));
    this.T = cfg.threshold ?? -24; this.F = cfg.floor ?? -40; this.up = cfg.up ?? 0.6; this.down = cfg.down ?? 1;
    this.tmp = null;
  }
  process(L, R, start = 0, end = L.length) {
    const n = end - start;
    if (!this.tmp || this.tmp[0].length < n) this.tmp = Array.from({ length: 6 }, () => new Float32Array(n));
    const [lL, lR, mL, mR, hL, hR] = this.tmp;
    // split
    for (let c = 0; c < 2; c++) {
      const src = c ? R : L, lo = c ? lR : lL, mid = c ? mR : mL, hi = c ? hR : hL, s = this.ch[c];
      for (let i = 0; i < n; i++) { lo[i] = src[start + i]; mid[i] = src[start + i]; }
      s.lpA[0].process(lo, 0, n); s.lpA[1].process(lo, 0, n);
      s.hpA[0].process(mid, 0, n); s.hpA[1].process(mid, 0, n);
      // allpass-compensate the low band for the second crossover's phase
      s.apLow[0].process(lo, 0, n);
      for (let i = 0; i < n; i++) hi[i] = mid[i];
      s.lpB[0].process(mid, 0, n); s.lpB[1].process(mid, 0, n);
      s.hpB[0].process(hi, 0, n); s.hpB[1].process(hi, 0, n);
    }
    const bandsL = [lL, mL, hL], bandsR = [lR, mR, hR];
    const T = this.T, F = this.F, up = this.up, down = this.down, depth = this.depth;
    for (let b = 0; b < 3; b++) {
      const st = this.bands[b], BL = bandsL[b], BR = bandsR[b];
      let env = st.env;
      for (let i = 0; i < n; i++) {
        const a = Math.max(Math.abs(BL[i]), Math.abs(BR[i]));
        env = a > env ? st.att * env + (1 - st.att) * a : st.rel * env + (1 - st.rel) * a;
        const x = env > 1e-7 ? LOG10_20 * Math.log(env) : -140;
        let gdb = 0;
        if (x > T) gdb = -(x - T) * (1 - 1 / 8) * down;
        else if (x > F - 30) {
          // upward: lift quiet detail towards the threshold (1.5:1), fading out below the floor so silence stays silent
          let gu = (T - Math.max(x, F)) * 0.33 * up;
          if (x < F) gu *= Math.max(0, 1 - (F - x) / 30);
          gdb = Math.min(18, gu);
        }
        const g = Math.exp(gdb / LOG10_20) * st.g;
        BL[i] *= g; BR[i] *= g;
      }
      st.env = env;
    }
    for (let i = 0; i < n; i++) {
      const j = start + i;
      const wl = lL[i] + mL[i] + hL[i], wr = lR[i] + mR[i] + hR[i];
      L[j] = L[j] * (1 - depth) + wl * depth;
      R[j] = R[j] * (1 - depth) + wr * depth;
    }
  }
}

/**
 * Tempo-synced rhythmic gate (trance gate). cfg: { pattern='x.x.xx.x' (16th steps), depth=1, attack=0.004, release=0.03,
 *   timeline (set by factory) } -- uses the song timeline so it follows tempo ramps. process(L,R,start,end,frame0)
 */
export class TranceGate {
  constructor(cfg = {}, sr = SR) {
    this.sr = sr; this.pat = (cfg.pattern || 'x.x.xx.xx.x.xx.x').replace(/[\s|]/g, '');
    this.depth = cfg.depth ?? 1; this.tl = cfg.timeline;
    this.aK = tc(cfg.attack ?? 0.003, sr); this.rK = tc(cfg.release ?? 0.03, sr); this.g = 1;
    this.stepLen = cfg.step ?? 0.25; // beats per step (16th)
  }
  process(L, R, start, end, frame0 = 0) {
    const sr = this.sr, P = this.pat.length;
    for (let i = start; i < end; i++) {
      const t = (frame0 + i - start) / sr;
      const beat = this.tl ? this.tl.secToBeat(t) : t * 2;
      const step = Math.floor(beat / this.stepLen);
      const on = this.pat[((step % P) + P) % P] !== '.';
      const target = on ? 1 : 1 - this.depth;
      const k = target > this.g ? this.aK : this.rK;
      this.g = k * this.g + (1 - k) * target;
      L[i] *= this.g; R[i] *= this.g;
    }
  }
}

export { Upsampler };
