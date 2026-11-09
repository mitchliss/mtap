// Keyboards: FM electric piano (Rhodes-style tine/bark) and a modal grand piano (trichord unison, soundboard body,
// damper / key-off / hammer-return mechanics).
import { SR, Rng, midiToHz, clamp, panGains, balanceGains } from '../core/util.js';
import { SIN, SIN_N } from '../core/osc.js';
import { DCBlock, OnePole, SVF, Biquad, biquadCoefs } from '../core/filters.js';
import { FFT } from '../core/fft.js';

/**
 * FM electric piano after the DX7 "E.PIANO 1" topology: three carrier/modulator pairs.
 *  - body pair (1:1) whose index rises with velocity -> the Rhodes "bark"
 *  - tine pair (carrier 1 : modulator 14) with a fast-decaying index -> the metallic tine attack
 *  - chorus pair (1:1, detuned) -> width and movement
 * plus an asymmetric pickup nonlinearity. Mono output: add autopan/tremolo + chorus in the mix for the suitcase sound.
 * opts: { tone: 'rhodes'|'dx'|'soft', decay=1, bark=1, tine=1, seed, gain=1 }
 * note: { midi, vel, dur }
 */
export class EPiano {
  constructor(opts = {}) { this.name = opts.name || 'epiano'; this.opts = opts; this.sr = opts.sr || SR; this.tail = 0.35; this.count = 0; }
  render(note) {
    const sr = this.sr, o = this.opts, v = clamp(note.vel ?? 0.75, 0.02, 1), m = note.midi, f = midiToHz(m);
    const tone = o.tone || 'rhodes';
    const r = new Rng(`${o.seed ?? 'ep'}:${m}:${this.count++}`);
    const ks = clamp(1 - (m - 60) / 60, 0.25, 1.4); // key scaling of indices
    const dScale = Math.pow(2, -(m - 60) / 26) * (o.decay ?? 1);
    const t1 = 0.55 * dScale, t2 = 3.2 * dScale; // amp decay time-constants (s)
    const dur = Math.max(0.03, note.dur ?? 1);
    const relT = 0.11 + 0.08 * clamp((72 - m) / 36, 0, 1);
    const natural = Math.min(t2 * 4.5, 10);
    const len = Math.min(natural, dur + relT * 5);
    const n = Math.round(len * sr);
    const out = new Float32Array(n);
    const bark = (o.bark ?? 1) * (tone === 'soft' ? 0.4 : tone === 'dx' ? 0.7 : 1);
    const tineAmt = (o.tine ?? 1) * (tone === 'dx' ? 1.6 : tone === 'soft' ? 0.5 : 1);
    const IA0 = (0.25 + 2.3 * v * v) * ks * bark, IA1 = 0.12 * ks;
    const IB0 = (1.2 + 3.2 * v) * ks * tineAmt;
    const tineLvl = (0.18 + 0.3 * v) * tineAmt * clamp(1.2 - (m - 48) / 80, 0.5, 1.2);
    const det = 1 + r.range(0.0012, 0.0022);
    const kA = Math.exp(-1 / (0.42 * sr)), kB = Math.exp(-1 / ((0.035 + 0.03 * (1 - v)) * sr)), kBamp = Math.exp(-1 / (0.28 * dScale * sr));
    const k1 = Math.exp(-1 / (t1 * sr)), k2 = Math.exp(-1 / (t2 * sr));
    const nRel = Math.round(dur * sr), kR = Math.exp(-1 / (relT * sr / 4.6 * 1.0));
    let phC = r.float(), phM = r.float(), phT = r.float(), phTM = r.float(), phX = r.float(), phXM = r.float();
    const dC = f / sr, dT = f / sr, dTM = (f * 14) / sr, dX = (f * det) / sr;
    let eA = 1, eB = 1, eBa = 1, a1 = 0.62, a2 = 0.38, rel = 1;
    const nAtt = Math.round(0.0015 * sr);
    for (let i = 0; i < n; i++) {
      // modulators
      let q = phM * SIN_N, j = q | 0; const mA = SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j);
      q = phTM * SIN_N; j = q | 0; const mB = SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j);
      q = phXM * SIN_N; j = q | 0; const mX = SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j);
      const IA = IA0 * eA + IA1;
      // carriers (phase modulation, index in radians -> cycles)
      let pc = phC + (IA * mA) / 6.2832; pc -= Math.floor(pc); q = pc * SIN_N; j = q | 0; const cA = SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j);
      let pt = phT + (IB0 * eB * mB) / 6.2832; pt -= Math.floor(pt); q = pt * SIN_N; j = q | 0; const cB = SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j);
      let px = phX + (0.35 * IA * mX) / 6.2832; px -= Math.floor(px); q = px * SIN_N; j = q | 0; const cX = SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j);
      const amp = a1 + a2;
      let y = (cA * 0.62 + cX * 0.38) * amp + cB * tineLvl * eBa;
      if (i < nAtt) y *= i / nAtt;
      if (i >= nRel) { rel *= kR; y *= rel; }
      out[i] = y;
      phM += dC; if (phM >= 1) phM -= 1; phC += dC; if (phC >= 1) phC -= 1;
      phTM += dTM; if (phTM >= 1) phTM -= 1; phT += dT; if (phT >= 1) phT -= 1;
      phXM += dX; if (phXM >= 1) phXM -= 1; phX += dX; if (phX >= 1) phX -= 1;
      eA *= kA; eB *= kB; eBa *= kBamp; a1 *= k1; a2 *= k2;
    }
    // pickup: asymmetric soft nonlinearity grows with velocity (bark), then DC block and gentle top roll-off
    const asym = 0.18 + 0.35 * v * bark, drive = 1 + 0.8 * v * bark;
    for (let i = 0; i < n; i++) { const x = out[i] * 0.5 * drive; out[i] = (x + asym * x * x) / (1 + Math.abs(x) * 0.25 * drive); }
    new DCBlock(8, sr).process(out);
    // the pickup's even-order term also rectifies the envelope into a sub-fundamental thump: keep only a hint of it
    new Biquad('hp', Math.max(28, f * 0.5), 0.6, 0, sr).process(out);
    new OnePole('lp', 9000, sr).process(out);
    const g = (o.gain ?? 1) * 0.55 * Math.pow(v, 0.9);
    for (let i = 0; i < n; i++) out[i] *= g;
    const f2 = Math.min(64, n); for (let i = 0; i < f2; i++) out[n - 1 - i] *= i / f2;
    return out;
  }
}

// ------------------------------------------------------------------------------------------------ piano soundboard
// One physical board per piano type ('grand', or 'upright' for the felt tone), shared by every note: 28 modes, log-spaced
// 60 Hz-3 kHz with +-8 % seeded jitter, Q 15-40 and T60 150-250 ms (a mode is damped to whichever of the two is shorter,
// so the low modes ring 150-250 ms and the top modes 30-90 ms instead of turning into discrete "pings"), plus a dense
// diffuse field (three decaying noise bands at 200 / 800 / 2200 Hz, T60 240 / 200 / 140 ms) that gives the 100 Hz-2.5 kHz
// bloom its density: 28 modes alone are a sparse comb above ~500 Hz. Six register-band impulse responses (<= 44, 45-56,
// 57-68, 69-80, 81-92, >= 93) differ only in how strongly the bridge couples into each mode: bass strings drive the low
// modes, treble strings the high ones. L and R hear each mode with different phases (two mics over the board). Each IR
// is 0.25 s, kept as a 32768-point spectrum normalised to unit mean power over 100-2500 Hz, so `board: -12` means the
// body sits on average 12 dB under the dry partials in that range. Spectra are built lazily and cached per worker.
const BOARD_N = 32768, BOARD_IR = 0.25, BOARD_HEAD = 0.25, BOARD_MODES = 28;
const BOARD_FC = [110, 220, 440, 880, 1600, 2600];
const BOARD_PULSE = 0.25; // hammer force pulse into the bridge, re the note's attack peak
const BOARD_NOISE = 8;     // rough hammer-contact noise into the bridge, re the note's attack peak (the bloom's density)
const PIANO_TRIM = { grand: 1, felt: 1.035, bright: 1 }; // gain-match: per-section stem RMS within +-0.5 dB of cut 2
const boardBand = (m) => (m <= 44 ? 0 : m <= 56 ? 1 : m <= 68 ? 2 : m <= 80 ? 3 : m <= 92 ? 4 : 5);
const boardCache = new Map();
let boardScratch = null;

function boardSpectrum(kind, band, sr) {
  const key = `${kind}:${band}:${sr}`;
  const hit = boardCache.get(key);
  if (hit) return hit;
  const up = kind === 'upright';
  const r = new Rng(`board:${kind}`); // identical draws for every band: one board, six couplings
  const nIR = Math.round(BOARD_IR * sr), N = BOARD_N;
  const fc = BOARD_FC[band] * (up ? 1.15 : 1);
  const couple = (f) => 0.22 + Math.exp(-0.5 * (Math.log2(f / fc) / 1.5) ** 2);
  const modal = [new Float64Array(nIR), new Float64Array(nIR)], diff = [new Float64Array(nIR), new Float64Array(nIR)];
  for (let k = 0; k < BOARD_MODES; k++) {
    const f = 60 * Math.pow(50, k / (BOARD_MODES - 1)) * (1 + r.range(-0.08, 0.08)) * (up ? 1.18 : 1);
    const q = r.range(15, 40), t60 = Math.min(r.range(0.15, 0.25) * (up ? 0.85 : 1), (6.9078 * q) / (Math.PI * f));
    const a = r.range(0.6, 1.4) * Math.pow(f / 250, -0.15) * couple(f);
    // L/R phase offset grows with frequency: the low modes stay mono-compatible, the upper ones give the width
    const phL = r.range(0, 2 * Math.PI), phR = phL + r.range(Math.PI / 3, Math.PI) * clamp(f / 900, 0.12, 1), gl = r.range(0.75, 1.25), gr = r.range(0.75, 1.25);
    const w = (2 * Math.PI * f) / sr, rr = Math.exp(-6.9078 / (t60 * sr)), c = rr * Math.cos(w), s = rr * Math.sin(w);
    for (const [buf, ph, g] of [[modal[0], phL, gl], [modal[1], phR, gr]]) {
      let re = a * g * Math.cos(ph), im = a * g * Math.sin(ph);
      for (let i = 0; i < nIR; i++) { const nr = re * c - im * s; im = re * s + im * c; re = nr; buf[i] += im; }
    }
  }
  const nz = r.fork('diffuse');
  // centre Hz, Q, T60 s, L/R common share (inter-channel correlation = share^2: 0.81 / 0.49 / 0.30)
  for (const [fb, qb, tb, cw] of [[200, 0.6, 0.24, 0.9], [800, 0.7, 0.2, 0.7], [2200, 0.8, 0.14, 0.55]]) {
    const bl = new Float64Array(nIR), br = new Float64Array(nIR), iw = Math.sqrt(1 - cw * cw);
    for (let i = 0; i < nIR; i++) { const cm = nz.bi(); bl[i] = cw * cm + iw * nz.bi(); br[i] = cw * cm + iw * nz.bi(); }
    new Biquad('bp', fb, qb, 0, sr).process(bl); new Biquad('bp', fb, qb, 0, sr).process(br);
    const kd = Math.exp(-6.9078 / (tb * (up ? 0.85 : 1) * sr)), ka = Math.exp(-1 / (0.002 * sr)), g = couple(fb);
    let e = 1, att = 1;
    for (let i = 0; i < nIR; i++) { const env = g * e * (1 - att); diff[0][i] += bl[i] * env; diff[1][i] += br[i] * env; e *= kd; att *= ka; }
  }
  const energy = (p) => { let s = 0; for (const b of p) for (let i = 0; i < nIR; i++) s += b[i] * b[i]; return s / 2 || 1; };
  const gm = 0.78 / Math.sqrt(energy(modal)), gd = 0.62 / Math.sqrt(energy(diff));
  const fade = Math.round(0.02 * sr);
  const f = FFT.get(N), H = [];
  for (let ch = 0; ch < 2; ch++) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < nIR; i++) re[i] = (modal[ch][i] * gm + diff[ch][i] * gd) * (i >= nIR - fade ? 0.5 + 0.5 * Math.cos((Math.PI * (i - nIR + fade)) / fade) : 1);
    f.transform(re, im);
    H.push({ re: re.slice(0, N / 2 + 1), im: im.slice(0, N / 2 + 1) });
  }
  // unit mean power over 100-2500 Hz (both channels), so the `board` dB option reads as "body re dry partials"
  let p = 0, cnt = 0;
  for (let k = Math.ceil((100 * N) / sr); k <= Math.floor((2500 * N) / sr); k++, cnt++) for (const h of H) p += (h.re[k] * h.re[k] + h.im[k] * h.im[k]) / 2;
  const sc = 1 / Math.sqrt(p / cnt);
  for (const h of H) for (let k = 0; k <= N / 2; k++) { h.re[k] *= sc; h.im[k] *= sc; }
  const spec = { N, nIR, Lr: H[0].re, Li: H[0].im, Rr: H[1].re, Ri: H[1].im };
  boardCache.set(key, spec);
  return spec;
}

/**
 * Linear convolution of a real mono signal x[0..nx) (nx <= N/2) with a board's stereo IR. Returns { L, R } views of
 * length nx + nIR - 1, valid until the next call. Forward: one N/2-point complex FFT (real-input split); inverse: one
 * N-point FFT carrying L in the real part and R in the imaginary part. About 5 ms per note.
 */
function boardConvolve(x, nx, spec) {
  const N = spec.N, H = N / 2;
  if (!boardScratch) boardScratch = { zr: new Float64Array(H), zi: new Float64Array(H), re: new Float64Array(N), im: new Float64Array(N) };
  const { zr, zi, re, im } = boardScratch, fh = FFT.get(H), fN = FFT.get(N), cs = fN.cos, sn = fN.sin;
  for (let i = 0; i < H; i++) { const a = 2 * i, b = a + 1; zr[i] = a < nx ? x[a] : 0; zi[i] = b < nx ? x[b] : 0; }
  fh.transform(zr, zi);
  const { Lr, Li, Rr, Ri } = spec;
  for (let k = 0; k <= H; k++) {
    const k1 = k === H ? 0 : k, k2 = k === 0 ? 0 : H - k;
    const ar = zr[k1], ai = zi[k1], br = zr[k2], bi = -zi[k2]; // Z[k] and conj(Z[H-k])
    const er = (ar + br) / 2, ei = (ai + bi) / 2, or = (ai - bi) / 2, oi = -(ar - br) / 2;
    const c = k < H ? cs[k] : -1, s = k < H ? sn[k] : 0; // W^k = e^{-j 2 pi k / N}
    const xr = er + or * c + oi * s, xi = ei + oi * c - or * s;
    const ylr = xr * Lr[k] - xi * Li[k], yli = xr * Li[k] + xi * Lr[k], yrr = xr * Rr[k] - xi * Ri[k], yri = xr * Ri[k] + xi * Rr[k];
    re[k] = ylr - yri; im[k] = yli + yrr;
    if (k > 0 && k < H) { re[N - k] = ylr + yri; im[N - k] = yrr - yli; }
  }
  fN.transform(re, im, true);
  const len = Math.min(N, nx + spec.nIR - 1), inv = 1 / N;
  for (let i = 0; i < len; i++) { re[i] *= inv; im[i] *= inv; }
  return { L: re.subarray(0, len), R: im.subarray(0, len) };
}

/** short noise burst through a filter, peak-normalised to `peakAmp`, added into out (Float64Array) at sample `at` */
function addBurst(out, at, len, filt, env, peakAmp, rng) {
  if (!(peakAmp > 0) || at >= out.length || len < 2) return;
  const tmp = new Float64Array(len);
  let pk = 0;
  for (let i = 0; i < len; i++) { const y = filt.tick(rng.bi()) * env(i / len); tmp[i] = y; const a = Math.abs(y); if (a > pk) pk = a; }
  if (pk <= 0) return;
  const g = peakAmp / pk, e = Math.min(out.length, at + len);
  for (let i = Math.max(0, at); i < e; i++) out[i] += tmp[i - at] * g;
}

/**
 * Grand piano, modal synthesis.
 *  - Strings: stiff-string inharmonicity f_k = k f0 sqrt(1 + B k^2) with register-dependent B, Railsback stretch tuning,
 *    hammer-hardness spectrum (velocity-dependent brightness), striking-point comb, frequency-dependent decay.
 *  - Unison: THREE strings per note from MIDI 45 up, detuned {0, +d1, -d2} cents (d1, d2 drawn per note from 0.5-1.5),
 *    each string's T60 x(1 +- 8 %). The in-phase "prompt" energy (78 %) decays fast on the centre string and the
 *    "aftersound" (22 %) is split across the two detuned strings, so the beating and the two-stage decay come from the
 *    unison itself. Below MIDI 45 the cut-2 two-component bichord model is kept unchanged.
 *  - Soundboard: the first 250 ms of every note (strings + hammer thump + the hammer's force pulse into the bridge) is
 *    convolved with its register band's 0.25 s board IR (see boardSpectrum) and added `board` dB under the dry note.
 *  - Mechanics: hammer thump + board knock at the strike; a hammer-return thunk (20 ms, LP 250 Hz) 25-40 ms later; at
 *    every damped note-off (not under `pedal`, MIDI < 89) 40-80 ms of band-passed damper noise (centre 300 Hz in the bass
 *    to 1.5 kHz in the treble, Q 1) at -35 dB re the note's attack peak, plus a 15 ms felt key "thup" (LP 400 Hz) at
 *    -38 dB. Dampers: none in the top octave and a half.
 * For the sympathetic-resonance halo add the 'resonance' insert on the stem.
 * opts: { tone: 'grand'|'felt'|'bright' (default grand), brightness=0.5, decay=1, width=0.6 (pitch-panned stereo),
 *         hammer=1 (noise level), seed, gain=1, maxDur=8,
 *         strings=3 (2 = the cut-2 bichord everywhere), board=-12 dB (-15 for 'bright'; false = no soundboard),
 *         boardType='grand' ('upright' is the default for felt), keyNoise=0 (dB offset on the damper / key-off noise;
 *         false = off), hammerReturn=dB re the note's attack peak (felt -30, else -36; false = off) }
 *   'felt' = felt-dampened upright/"una corda" pop-ballad piano: very soft hammer spectrum, slower 5 ms attack,
 *            louder low mechanical thump, shorter sustain, upright board. 'bright' = harder hammers for pop/dance riffs.
 * note: { midi, vel, dur, pedal (true = ignore dur and ring up to maxDur; no damper noise), keyNoise (false = no damper
 *         noise on this note) }
 * piano.pedalNoise({ vel, midi }) -> [L, R]: one damper-release swish (all dampers landing) for a pedal-up, about -38 dB re
 *   a chord at that velocity. Only for pedal-ups that the notes do not already mark with their own `dur`.
 */
export class Piano {
  constructor(opts = {}) { this.name = opts.name || 'piano'; this.opts = opts; this.sr = opts.sr || SR; this.tail = 0.5; this.count = 0; this.pedals = 0; }
  render(note) {
    const sr = this.sr, o = this.opts, v = clamp(note.vel ?? 0.7, 0.02, 1), m = note.midi, idx = this.count++;
    const r = new Rng(`${o.seed ?? 'pno'}:${m}:${idx}`);
    const rx = new Rng(`${o.seed ?? 'pno'}:${m}:${idx}:x`); // the realism layers draw from their own stream
    const st = m > 69 ? 4e-4 * (m - 69) ** 3 : 2e-4 * (m - 69) ** 3; // Railsback stretch (cents)
    const f0 = midiToHz(m) * Math.pow(2, clamp(st, -30, 35) / 1200);
    const B = 0.00012 + 0.02 * Math.exp(0.09 * (m - 108));
    const tone = o.tone || 'grand', felt = tone === 'felt';
    const bright = o.brightness ?? (felt ? 0.3 : tone === 'bright' ? 0.75 : 0.5);
    const fh = (450 + 7500 * Math.pow(v, 1.7)) * (0.6 + 0.8 * bright) * Math.pow(2, (m - 60) / 40) * (felt ? 0.38 : tone === 'bright' ? 1.35 : 1);
    const T1 = clamp(5 * Math.pow(2, -(m - 45) / 16), 0.25, 9) * (o.decay ?? 1) * (felt ? 0.7 : 1);
    const T2 = clamp(T1 * 3.2, 1, 28);
    const maxDur = o.maxDur ?? 8;
    const hasDamper = m < 89;
    const dur = Math.max(0.04, note.dur ?? 1);
    const damperT = 0.06 + 0.32 * clamp((60 - m) / 40, 0, 1);
    const ringT = note.pedal || !hasDamper ? maxDur : dur + damperT * 4;
    const n = Math.round(Math.min(maxDur, ringT, T2 * 1.2 + 0.5) * sr);
    // realism layers
    const boardDb = o.board === false || o.board === null ? null : (o.board ?? (tone === 'bright' ? -15 : -12));
    const keyDb = o.keyNoise === false || note.keyNoise === false ? null : (o.keyNoise ?? 0);
    const keyOff = hasDamper && !note.pedal && keyDb !== null;
    const hrDb = o.hammerReturn === false || o.hammerReturn === null ? null : (o.hammerReturn ?? (felt ? -30 : -36));
    const kAt = Math.round(dur * sr), kLen = Math.round(rx.range(0.04, 0.08) * sr);
    const nHead = Math.min(n, Math.round(BOARD_HEAD * sr));
    const nOut = Math.max(n, keyOff ? kAt + kLen + 32 : 0, boardDb !== null ? nHead + Math.round(BOARD_IR * sr) : 0);
    const out = new Float64Array(nOut);
    const beta = 1 / (7.5 + r.range(-0.5, 0.5));
    const maxF = Math.min(sr * 0.45, 18000);
    let norm = 0;
    const partials = [];
    for (let k = 1; k <= 70; k++) {
      const fk = k * f0 * Math.sqrt(1 + B * k * k);
      if (fk > maxF) break;
      let a = Math.pow(k, -0.75) / (1 + Math.pow(fk / fh, 2.2));
      a *= 0.3 + 0.7 * Math.abs(Math.sin(Math.PI * k * beta));
      if (a < 1e-4) continue;
      const hf = 1 + 0.05 * (k - 1) + Math.pow(fk / 2200, 1.6);
      partials.push({ fk, a, t1: T1 / hf, t2: T2 / hf });
      norm += a;
    }
    // cull partials more than ~54 dB below the strongest one, and stop each at -80 dB re the note's total level
    let aMax = 0; for (const p of partials) if (p.a > aMax) aMax = p.a;
    const thr = 1e-4 * norm, cull = aMax * 2e-3;
    const pw = 0.78; // prompt weight
    const ring = (fk, amp, t60, cents, ph) => {
      const w = (2 * Math.PI * fk * Math.pow(2, cents / 1200)) / sr;
      const rr = Math.exp(-6.9078 / (t60 * sr));
      const len = Math.min(n, Math.ceil(Math.log(thr / amp) / Math.log(rr)));
      const c = rr * Math.cos(w), sn = rr * Math.sin(w);
      let re = amp * Math.cos(ph), im = amp * Math.sin(ph);
      for (let i = 0; i < len; i++) { const nr = re * c - im * sn; im = re * sn + im * c; re = nr; out[i] += im; }
    };
    if ((o.strings ?? 3) >= 3 && m >= 45) {
      // trichord: the centre string carries the prompt, the two detuned strings share the aftersound
      const d1 = rx.range(0.5, 1.5), d2 = rx.range(0.5, 1.5), wA = rx.range(0.36, 0.64);
      const ts = [1 + rx.range(-0.08, 0.08), 1 + rx.range(-0.08, 0.08), 1 + rx.range(-0.08, 0.08)];
      for (const p of partials) {
        if (p.a < cull) continue;
        const comps = [[p.a * pw, p.t1 * ts[0], 0], [p.a * (1 - pw) * wA, p.t2 * ts[1], d1], [p.a * (1 - pw) * (1 - wA), p.t2 * ts[2], -d2]];
        for (const [amp, t60, cents] of comps) {
          if (amp < thr) continue;
          ring(p.fk, amp, t60, cents + rx.range(-0.15, 0.15), r.range(0, 0.3));
        }
      }
    } else {
      for (const p of partials) {
        if (p.a < cull) continue;
        for (let s = 0; s < 2; s++) {
          const amp = p.a * (s ? 1 - pw : pw);
          if (amp < thr) continue;
          const cents = s ? r.range(-1.2, 1.2) : r.range(-0.4, 0.4);
          ring(p.fk, amp, s ? p.t2 : p.t1, cents, r.range(0, 0.3));
        }
      }
    }
    // hammer thump (filtered noise) + soundboard knock
    const hn = Math.round(0.03 * sr), hamm = (o.hammer ?? 1) * 0.05 * v * norm * (felt ? 1.8 : 1);
    const hf = new SVF('lp', felt ? 350 + 900 * v : 700 + 3500 * v, 0.7, sr), knock = (2 * Math.PI * (felt ? 55 + 20 * r.float() : 70 + 25 * r.float())) / sr;
    let s = r.u32() | 1;
    for (let i = 0; i < hn && i < n; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const e = Math.exp(-i / (0.004 * sr));
      out[i] += hf.tick(((s >>> 0) / 2147483648 - 1) * e) * hamm + Math.sin(knock * i) * Math.exp(-i / (0.035 * sr)) * hamm * 0.6;
    }
    // damper
    if (hasDamper && !note.pedal) {
      const start = Math.round(dur * sr), k = Math.exp(-6.9 / (damperT * sr));
      let g = 1;
      for (let i = start; i < n; i++) { g *= k; out[i] *= g; }
    }
    // attack de-click, fade the string's end
    const na = Math.round((felt ? 0.005 : 0.0008) * sr); for (let i = 0; i < na && i < n; i++) { const x = i / na; out[i] *= felt ? x * x * (3 - 2 * x) : x; }
    const fe = Math.min(256, n); for (let i = 0; i < fe; i++) out[n - 1 - i] *= i / fe;
    // the note's attack peak: the reference level for the mechanical noises and the bridge pulse
    let pk = 0; for (let i = 0, e = Math.min(n, Math.round(0.08 * sr)); i < e; i++) { const a = Math.abs(out[i]); if (a > pk) pk = a; }
    // hammer return: a 20 ms LP 250 Hz thunk, 25-40 ms after the strike
    if (hrDb !== null) addBurst(out, Math.round(rx.range(0.025, 0.04) * sr), Math.round(0.02 * sr), new SVF('lp', 250, 0.8, sr), (x) => Math.sin(Math.PI * x) ** 2, pk * Math.pow(10, hrDb / 20) * (0.6 + 0.5 * v), rx);
    // key-off: the damper felt landing on the strings (band-passed swish) + the key's felt "thup"
    if (keyOff) {
      const fcK = 300 * Math.pow(5, clamp((m - 21) / 67, 0, 1));
      addBurst(out, kAt, kLen, new SVF('bp', fcK, 1, sr), (x) => (1 - Math.exp(-x * 25)) * Math.exp(-x * 3.6), pk * Math.pow(10, (-35 + keyDb) / 20), rx);
      addBurst(out, kAt, Math.round(0.015 * sr), new SVF('lp', 400, 0.7, sr), (x) => Math.sin(Math.PI * x), pk * Math.pow(10, (-38 + keyDb) / 20), rx);
    }
    // soundboard: the first 250 ms (strings + thump + the hammer's force pulse into the bridge) through the band's IR
    let wet = null;
    if (boardDb !== null) {
      const spec = boardSpectrum(o.boardType || (felt ? 'upright' : 'grand'), boardBand(m), sr);
      const head = new Float64Array(nHead), tap = Math.min(nHead, Math.round(0.06 * sr));
      for (let i = 0; i < nHead; i++) head[i] = out[i] * (i >= nHead - tap ? 0.5 + 0.5 * Math.cos((Math.PI * (i - nHead + tap)) / tap) : 1);
      // the bridge drive: a raised-cosine force pulse (4.5 ms soft -> 1.5 ms hard; felt 6 ms) plus the rough, multi-bounce
      // part of the hammer contact as a few ms of low-passed noise. Neither is heard dry: only through the board.
      // register: the bass strings' heavy hammers knock harder (the bass note's own energy hides it otherwise), the top less
      const reg = m < 55 ? 1 + (55 - m) / 28 : m > 75 ? Math.max(0.8, 1 - (m - 75) / 50) : 1;
      const th = felt ? 0.006 : 0.0045 - 0.003 * v, nth = Math.max(8, Math.round(th * sr)), hk = (o.hammer ?? 1) * (felt ? 1.2 : 1) * reg;
      const fp = pk * (o.boardPulse ?? BOARD_PULSE) * hk, fnz = pk * (o.boardNoise ?? BOARD_NOISE) * hk * (0.5 + 0.7 * v), lpN = new SVF('lp', felt ? 1200 + 1500 * v : 2000 + 4000 * v, 0.7, sr);
      const kn = Math.exp(-1 / ((felt ? 0.004 : 0.0025) * sr));
      for (let i = 0, e = 1, ne = Math.min(nHead, Math.round(0.03 * sr)); i < ne; i++, e *= kn) head[i] += lpN.tick(rx.bi()) * fnz * e + (i < nth ? fp * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nth)) : 0);
      wet = boardConvolve(head, nHead, spec);
      // safety: no single note's body may come within 8 dB of its dry note (a partial sitting on a strong mode)
      let ew = 0, ed = 0;
      for (let i = 0; i < nHead; i++) { ew += (wet.L[i] * wet.L[i] + wet.R[i] * wet.R[i]) / 2; ed += out[i] * out[i]; }
      const lim = ed * Math.pow(10, (-8 - boardDb) / 10);
      if (ew > lim && ew > 0) { const sc = Math.sqrt(lim / ew); for (let i = 0; i < wet.L.length; i++) { wet.L[i] *= sc; wet.R[i] *= sc; } }
    }
    const g = ((o.gain ?? 1) * 0.6 * Math.pow(v, 1.25)) / Math.max(1e-6, norm) * 1.6 * (PIANO_TRIM[tone] ?? 1);
    const pan = clamp(((m - 64) / 40) * (o.width ?? 0.6), -1, 1);
    const [gl, gr] = panGains(pan);
    const L = new Float32Array(nOut), R = new Float32Array(nOut);
    // small inter-channel delay by pitch (spaced-pair feel). Cut 3: it is applied below ~800 Hz only (the far channel
    // gets x + LP(x)[n - d] - LP(x)[n]), so the mono fold-down no longer combs the presence band (the cut-2 delay put a
    // null at 2.9 kHz for the top notes: -4.7 dB presence mono loss on a solo-piano pattern).
    const dly = Math.round(Math.abs((m - 64) / 40) * 0.0004 * sr * (o.width ?? 0.6));
    const [b0, b1, b2, a1, a2] = biquadCoefs('lp', 800, 0.7071, 0, sr), dl = new Float64Array(dly + 1);
    let z1 = 0, z2 = 0;
    for (let i = 0; i < nOut; i++) {
      const v0 = out[i], x = v0 * g;
      let far = x;
      if (dly > 0) {
        const y = b0 * v0 + z1; z1 = b1 * v0 - a1 * y + z2; z2 = b2 * v0 - a2 * y;
        const j = i % (dly + 1), old = i >= dly ? dl[(i - dly) % (dly + 1)] : 0;
        dl[j] = y; far = (v0 + old - y) * g;
      }
      if (m >= 64) { L[i] = far * gl * 1.2; R[i] = x * gr * 1.2; }
      else { L[i] = x * gl * 1.2; R[i] = far * gr * 1.2; }
    }
    if (wet) {
      const [bl, br] = balanceGains(pan * 0.4), gw = g * Math.pow(10, boardDb / 20) * 0.85;
      const e = Math.min(nOut, wet.L.length);
      for (let i = 0; i < e; i++) { L[i] += wet.L[i] * gw * bl; R[i] += wet.R[i] * gw * br; }
    }
    const fz = Math.min(64, nOut); for (let i = 0; i < fz; i++) { L[nOut - 1 - i] *= i / fz; R[nOut - 1 - i] *= i / fz; }
    return [L, R];
  }
  /** one damper-release swish for a pedal-up (all dampers landing at once), about -38 dB re a chord at `vel` */
  pedalNoise({ vel = 0.6, midi = 60 } = {}) {
    const sr = this.sr, o = this.opts, v = clamp(vel, 0.02, 1), rx = new Rng(`${o.seed ?? 'pno'}:pedal:${this.pedals++}`);
    const len = Math.round(rx.range(0.09, 0.14) * sr), out = new Float64Array(len + 32);
    const ref = (o.gain ?? 1) * 0.96 * Math.pow(v, 1.25) * (PIANO_TRIM[o.tone || 'grand'] ?? 1) * 2; // about a 4-note chord's attack peak
    addBurst(out, 0, len, new SVF('bp', 300 * Math.pow(5, clamp((midi - 21) / 67, 0, 1)), 0.7, sr), (x) => (1 - Math.exp(-x * 18)) * Math.exp(-x * 3.2), ref * Math.pow(10, -38 / 20), rx);
    addBurst(out, 0, Math.round(0.02 * sr), new SVF('lp', 300, 0.7, sr), (x) => Math.sin(Math.PI * x), ref * Math.pow(10, -40 / 20), rx);
    return [Float32Array.from(out, (x) => x * 0.85), Float32Array.from(out, (x) => x * 0.85)];
  }
}
