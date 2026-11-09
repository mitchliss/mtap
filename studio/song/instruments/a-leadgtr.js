// Musician A: lead electric guitar with a real left hand. Same physics as the engine's ElectricGuitar (plucked
// waveguide string, pick-position comb, magnetic pickup comb, amp + cab), but the string length can MOVE while it
// rings: fret slides into a note (30-40 ms), bend-up finger vibrato on held notes, and legato (hammer/slide) notes
// that are not re-picked. Mono out (pan in the stem; chorus/slapback baked by the part).
import { SR, Rng, midiToHz, clamp, tanhFast } from '../../engine/core/util.js';
import { Biquad, DCBlock, OnePole } from '../../engine/core/filters.js';

function designLoss(G0, Gh, w0, wh) {
  const mag = (p, w) => (1 - p) / Math.sqrt(1 - 2 * p * Math.cos(w) + p * p);
  const target = Gh / G0;
  let lo = 0, hi = 0.97;
  for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (mag(m, wh) / mag(m, w0) > target) lo = m; else hi = m; }
  const p = (lo + hi) / 2;
  return { p, g: Math.min(0.99995, G0 / mag(p, w0)) };
}
const lpDelay = (p, w) => Math.atan2(p * Math.sin(w), 1 - p * Math.cos(w)) / w;

/**
 * opts: { pickup: 'neck'|'middle'|'bridge', brightness=0.6, decay=1, drive=1.6, vibRate=5.4, seed, gain=1 }
 * note: { midi, vel, dur, slideFrom (midi), slideTime=0.035, vib (cents, peak bend-up; default 22 on notes > 0.45 s),
 *         vibDelay=0.2, legato (no new pick: soft re-excitation), pickPos=0.13 }
 */
export class LeadGuitar {
  constructor(opts = {}) {
    this.opts = opts; this.name = opts.name || 'lead-guitar'; this.tail = 0.3; this.count = 0; this.sr = SR;
    this.pickup = { neck: 0.25, middle: 0.17, bridge: 0.09 }[opts.pickup || 'neck'];
  }
  render(note) {
    const sr = this.sr, o = this.opts, vel = clamp(note.vel ?? 0.8, 0.05, 1), m = note.midi;
    const r = new Rng(`${o.seed ?? 'lg'}:${m}:${this.count++}`);
    const f0 = midiToHz(m), dur = Math.max(0.03, note.dur ?? 0.5);
    const n = Math.round((dur + 0.22) * sr);
    // ---- left hand: pitch track (period in samples), evaluated every 8 samples
    const P = new Float32Array(n);
    const sFrom = note.slideFrom, sN = Math.max(1, (note.slideTime ?? 0.035) * sr);
    const vib = note.vib ?? (dur > 0.45 ? 22 : 0), vRate = (o.vibRate ?? 5.4) * r.range(0.94, 1.06), vDel = (note.vibDelay ?? 0.2) * sr;
    const vw = (2 * Math.PI * vRate) / sr;
    for (let i0 = 0; i0 < n; i0 += 8) {
      let c = 0;
      if (sFrom !== undefined && sFrom !== null && i0 < sN) { const x = i0 / sN; c += (sFrom - m) * 100 * (1 - x * x * (3 - 2 * x)); }
      if (vib && i0 > vDel) { const fade = Math.min(1, (i0 - vDel) / (0.3 * sr)); c += vib * fade * (0.5 - 0.5 * Math.cos(vw * (i0 - vDel))); }
      P.fill(sr / (f0 * Math.pow(2, c / 1200)), i0, Math.min(n, i0 + 8));
    }
    // ---- string loss (T60 at f0 and at 4 kHz), release damping
    const bright = clamp(note.bright ?? o.brightness ?? 0.6, 0, 1);
    const t60 = clamp(7 * Math.pow(110 / f0, 0.5), 1.8, 9) * (o.decay ?? 1), t60hf = t60 * (0.05 + 0.16 * bright);
    const w0 = (2 * Math.PI * f0) / sr, wh = (2 * Math.PI * 4000) / sr;
    const L1 = designLoss(Math.pow(10, -3 / (t60 * f0)), Math.pow(10, -3 / (t60hf * f0)), w0, wh);
    const L2 = designLoss(Math.pow(10, -3 / (0.07 * f0)), Math.pow(10, -3 / (0.03 * f0)), w0, wh);
    const lpd = lpDelay(L1.p, w0);
    // ---- excitation: pick pulse (+ scrape), pick-position comb, hardness low-pass
    const legato = !!note.legato;
    const pw = (legato ? 0.0022 : 0.00035 + (1 - vel) * 0.0011), pn = Math.max(2, Math.round(pw * sr));
    const P0 = P[0], M = Math.max(1, Math.round((note.pickPos ?? 0.13) * P0));
    const E = pn + M + 96, exc = new Float32Array(E);
    for (let i = 0; i < pn; i++) exc[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / pn);
    if (!legato) for (let i = 0; i < 96; i++) exc[i] += r.bi() * 0.12 * Math.exp(-i / 12);
    for (let i = E - 1; i >= M; i--) exc[i] -= exc[i - M];
    new OnePole('lp', legato ? 1800 : 2500 + 9000 * vel * vel, sr).process(exc);
    // ---- the string: fractional delay line with a moving read point (hermite), one-pole loss
    const N = Math.ceil(Math.max(...[P0, sr / midiToHz(Math.min(m, sFrom ?? m) - 1)])) + 16;
    const buf = new Float32Array(N), y = new Float32Array(n);
    let w = 0, lp = 0;
    const rel = Math.round(dur * sr), rampN = Math.round(0.006 * sr);
    let pp = L1.p, gg = L1.g;
    for (let i = 0; i < n; i++) {
      if (i >= rel && i <= rel + rampN) { const x = (i - rel) / rampN; pp = L1.p + (L2.p - L1.p) * x; gg = L1.g + (L2.g - L1.g) * x; }
      let rp = w - (P[i] - lpd); if (rp < 0) rp += N;
      const i0 = Math.floor(rp), f = rp - i0;
      const im1 = i0 === 0 ? N - 1 : i0 - 1, i1 = i0 + 1 >= N ? i0 + 1 - N : i0 + 1, i2 = i1 + 1 >= N ? i1 + 1 - N : i1 + 1;
      const xm1 = buf[im1], x0 = buf[i0], x1 = buf[i1], x2 = buf[i2];
      const c = (x1 - xm1) * 0.5, v = x0 - x1, ww = c + v, a = ww + v + (x2 - x0) * 0.5, b = ww + a;
      const d = (((a * f) - b) * f + c) * f + x0;
      lp = (1 - pp) * d + pp * lp;
      const out = (i < E ? exc[i] : 0) + gg * lp;
      buf[w] = out; if (++w >= N) w = 0;
      y[i] = out;
    }
    // ---- magnetic pickup comb (follows the moving string length)
    const x = new Float32Array(n), pu = this.pickup;
    for (let i = 0; i < n; i++) { const Mp = Math.round(pu * P[i]); x[i] = y[i] - (i >= Mp ? y[i - Mp] : 0); }
    let pk = 0; for (let i = 0; i < Math.min(n, 4000); i++) pk = Math.max(pk, Math.abs(x[i]));
    const norm = pk > 0 ? 1 / pk : 0, drive = o.drive ?? 1.6, dn = Math.tanh(drive), lv = legato ? 0.75 : 1;
    for (let i = 0; i < n; i++) { const u = x[i] * norm * vel * lv; x[i] = tanhFast(u * drive + 0.06 * u * u) / dn; }
    new DCBlock(10, sr).process(x);
    // ---- amp + cab (brief: HP 90, +3 dB @ 2.2 kHz, 12 dB LP ~5.5 kHz; neck darker, bridge brighter)
    const lpF = { neck: 4800, middle: 5600, bridge: 6400 }[o.pickup || 'neck'];
    new Biquad('hp', 90, 0.7, 0, sr).process(x);
    new Biquad('peak', 380, 1.2, -2, sr).process(x);
    new Biquad('peak', 2200, 1, 3, sr).process(x);
    new Biquad('lp', lpF, 0.7, 0, sr).process(x);
    const g = (o.gain ?? 1) * 0.42 * Math.pow(vel, 0.5);
    for (let i = 0; i < n; i++) x[i] *= g;
    const fe = Math.min(256, n); for (let i = 0; i < fe; i++) x[n - 1 - i] *= i / fe;
    return x;
  }
}
