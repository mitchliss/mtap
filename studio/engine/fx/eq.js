// Parametric EQ (stereo, optional mid/side bands), stereo widener / bass mono, auto-filter.
import { SR } from '../core/util.js';
import { Biquad, ButterChain, SVFCascade, SVF } from '../core/filters.js';

/**
 * Parametric EQ. bands: [{ type: 'hp'|'lp'|'ls'|'hs'|'peak'|'notch'|'bp'|'tilt', freq, gain (dB), q, slope (hp/lp: 6..48),
 *   ms: 'mid'|'side' (optional; M/S bands run after the stereo bands) }]
 */
export class EQ {
  constructor(cfg = {}, sr = SR) {
    const bands = Array.isArray(cfg) ? cfg : cfg.bands || [];
    this.lr = []; this.ms = [];
    for (const b of bands) {
      const mk = () => {
        const t = b.type;
        if (t === 'hp' || t === 'lp') return new ButterChain(t, b.freq, b.slope ?? 12, sr);
        if (t === 'tilt') return { stages: [new Biquad('ls', b.freq ?? 1000, 0.5, -(b.gain ?? 0) / 2, sr), new Biquad('hs', b.freq ?? 1000, 0.5, (b.gain ?? 0) / 2, sr)], process(x, s, e) { for (const st of this.stages) st.process(x, s, e); } };
        const q = b.q ?? (t === 'ls' || t === 'hs' ? 0.7071 : 1);
        return new Biquad(t, b.freq, q, b.gain ?? 0, sr);
      };
      const entry = { b, f: [mk(), mk()] };
      (b.ms ? this.ms : this.lr).push(entry);
    }
    this.tmp = null;
  }
  process(L, R, start = 0, end = L.length) {
    for (const e of this.lr) { e.f[0].process(L, start, end); e.f[1].process(R, start, end); }
    if (this.ms.length) {
      for (let i = start; i < end; i++) { const m = (L[i] + R[i]) * 0.5, s = (L[i] - R[i]) * 0.5; L[i] = m; R[i] = s; }
      for (const e of this.ms) (e.b.ms === 'side' ? e.f[1].process(R, start, end) : e.f[0].process(L, start, end));
      for (let i = start; i < end; i++) { const m = L[i], s = R[i]; L[i] = m + s; R[i] = m - s; }
    }
  }
}

/**
 * Stereo width via mid/side. cfg: { width=1 (0 = mono, 1 = unchanged, 2 = double side), bassMono=0 (Hz; side high-passed below) }
 */
export class Widener {
  constructor(cfg = {}, sr = SR) {
    this.width = cfg.width ?? 1;
    this.hp = cfg.bassMono ? new ButterChain('hp', cfg.bassMono, 24, sr) : null;
    this.tmp = null;
  }
  process(L, R, start = 0, end = L.length, widthOverride) {
    const w = widthOverride ?? this.width;
    if (this.hp) {
      const n = end - start;
      if (!this.tmp || this.tmp.length < n) this.tmp = new Float32Array(n);
      const s = this.tmp;
      for (let i = 0; i < n; i++) s[i] = (L[start + i] - R[start + i]) * 0.5;
      this.hp.process(s, 0, n);
      for (let i = 0; i < n; i++) { const j = start + i, m = (L[j] + R[j]) * 0.5, sd = s[i] * w; L[j] = m + sd; R[j] = m - sd; }
    } else if (w !== 1) {
      for (let i = start; i < end; i++) { const m = (L[i] + R[i]) * 0.5, s = (L[i] - R[i]) * 0.5 * w; L[i] = m + s; R[i] = m - s; }
    }
  }
}

/**
 * Resonant sweepable filter for builds (stereo SVF cascade). cfg: { mode='lp'|'hp'|'bp' (or type, when not used as the
 * fx registry key), freq, q=0.707, slope=12|24 }. setFreq per block (mixer automation) or sweep: { from, to } Hz over
 * [at, until] seconds (log interpolation; needs frame0 in process()).
 */
export class AutoFilter {
  constructor(cfg = {}, sr = SR) {
    const slope = cfg.slope ?? 24;
    const mode = cfg.mode || (['lp', 'hp', 'bp'].includes(cfg.type) ? cfg.type : 'lp');
    this.f = [new SVFCascade(mode, cfg.freq ?? 20000, cfg.q ?? 0.7071, slope, sr), new SVFCascade(mode, cfg.freq ?? 20000, cfg.q ?? 0.7071, slope, sr)];
    this.freq = cfg.freq ?? (mode === 'hp' ? 10 : 20000); this.type = mode; this.sr = sr;
    this.sweep = cfg.sweep && cfg.sweep.from && cfg.sweep.to ? { ...cfg.sweep, at: cfg.sweep.at ?? 0, until: cfg.sweep.until ?? 1 } : null;
    this.setFreq(this.freq);
  }
  setFreq(f) {
    if (this.type === 'lp' && f >= 19500) f = 30000; // fully open (clamped to 0.49*sr inside the SVF)
    if (f !== this.freq) { this.freq = f; this.f[0].setFreq(f); this.f[1].setFreq(f); }
  }
  /** never bypassed: switching a running filter in/out clicks, so it always runs (fully open is transparent) */
  process(L, R, start = 0, end = L.length, frame0 = 0) {
    if (this.sweep) { // 128-frame sub-blocks so one big process() call still sweeps smoothly
      const w = this.sweep, span = Math.max(1e-6, w.until - w.at);
      for (let s0 = start; s0 < end; s0 += 128) {
        const e = Math.min(end, s0 + 128), t = (frame0 + (s0 - start) + (e - s0) / 2) / this.sr, x = Math.min(1, Math.max(0, (t - w.at) / span));
        this.setFreq(w.from * Math.pow(w.to / w.from, x));
        this.f[0].process(L, s0, e); this.f[1].process(R, s0, e);
      }
      return;
    }
    this.f[0].process(L, start, end); this.f[1].process(R, start, end);
  }
}

export { SVF };
