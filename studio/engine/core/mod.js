// Modulation sources: LFOs, pitch glide/legato tracks, vibrato, random drift.
import { SR, Rng, midiToHz } from './util.js';
import { SIN, SIN_N } from './osc.js';

/**
 * LFO as a Float32Array of n samples.
 * p: { rate=1 Hz, shape='sine'|'tri'|'saw'|'ramp'|'square'|'sh'|'smooth', depth=1, offset=0,
 *      phase=0 (cycles), delay=0 s, fadeIn=0 s, seed }  -> offset + depth * wave (wave in -1..1)
 */
export function lfo(n, p = {}) {
  // evaluated at control rate (every 16 samples) and linearly interpolated: cheap, and square/S&H edges get a 0.36 ms ramp
  const sr = p.sr || SR, out = new Float32Array(n), rate = p.rate ?? 1, depth = p.depth ?? 1, off = p.offset ?? 0;
  const shape = p.shape || 'sine', rng = new Rng(p.seed ?? 'lfo');
  const SH = { sine: 0, tri: 1, saw: 2, ramp: 3, square: 4, sh: 5, smooth: 6 }[shape];
  if (SH === undefined) throw new Error(`lfo shape ${shape}?`);
  const dl = Math.round((p.delay || 0) * sr), fi = Math.round((p.fadeIn || 0) * sr);
  let ph = p.phase || 0, held = rng.bi(), prev = held, next = rng.bi();
  const K = 16, dt = rate / sr * K;
  const nk = Math.ceil(n / K) + 1, ctl = new Float64Array(nk);
  for (let k = 0; k < nk; k++) {
    let w;
    if (SH === 0) { const q = ph * SIN_N, j = q | 0; w = SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j); }
    else if (SH === 1) w = 4 * Math.abs(ph - 0.5) - 1;
    else if (SH === 2) w = 2 * ph - 1;
    else if (SH === 3) w = 1 - 2 * ph;
    else if (SH === 4) w = ph < 0.5 ? 1 : -1;
    else if (SH === 5) w = held;
    else { const x = ph * ph * (3 - 2 * ph); w = prev + (next - prev) * x; }
    ctl[k] = w;
    ph += dt;
    while (ph >= 1) { ph -= 1; held = rng.bi(); prev = next; next = rng.bi(); }
  }
  for (let i = 0; i < n; i++) {
    const k = Math.floor(i / K), f = (i - k * K) / K;
    const w = ctl[k] + (ctl[k + 1] - ctl[k]) * f;
    let g = 1;
    if (i < dl) g = 0; else if (i < dl + fi) g = (i - dl) / fi;
    out[i] = off + depth * w * g;
  }
  return out;
}

/** exponential (musical) glide from f0 to f1 Hz over `time` seconds, then hold; n samples */
export function glide(f0, f1, time, n, sr = SR) {
  const out = new Float32Array(n), m = Math.max(1, Math.round(time * sr)), r = Math.log(f1 / f0);
  for (let i = 0; i < n; i++) out[i] = i < m ? f0 * Math.exp((r * i) / m) : f1;
  return out;
}

/**
 * Monophonic legato pitch track (Hz per sample) from a note list.
 * notes: [{ t (seconds from buffer start), midi }] ascending. glide: portamento time constant (s).
 * mode 'exp' = constant-time exponential approach (analog-style) ; 'linear' = linear in pitch over glide time.
 */
export function pitchTrack(notes, n, { glide: gt = 0.05, mode = 'exp', sr = SR } = {}) {
  const out = new Float32Array(n);
  if (!notes.length) return out.fill(440);
  let idx = 0, cur = notes[0].midi, target = cur, startPitch = cur, startI = 0;
  const k = gt > 0 ? Math.exp(-1 / (gt * sr * 0.33)) : 0, m = Math.max(1, Math.round(gt * sr));
  for (let i = 0; i < n; i++) {
    while (idx < notes.length && notes[idx].t * sr <= i) { target = notes[idx].midi; startPitch = cur; startI = i; idx++; }
    if (gt <= 0) cur = target;
    else if (mode === 'linear') { const x = Math.min(1, (i - startI) / m); cur = startPitch + (target - startPitch) * x; }
    else cur = target + (cur - target) * k;
    out[i] = 440 * Math.pow(2, (cur - 69) / 12);
  }
  return out;
}

/**
 * Natural vibrato + drift applied to a base pitch.
 * base: Hz number or Float32Array. p: { rate=5.5, depth=25 cents, delay=0.25 s, fade=0.35 s, drift=6 cents,
 *        jitter=0.08 (rate wobble), scoop=0 cents (start flat, glides up), scoopTime=0.08 }
 */
export function vibrato(base, n, p = {}) {
  const sr = p.sr || SR, out = new Float32Array(n), rng = new Rng(p.seed ?? 'vib');
  const rate = p.rate ?? 5.5, depth = p.depth ?? 25, dl = (p.delay ?? 0.25) * sr, fd = Math.max(1, (p.fade ?? 0.35) * sr);
  const drift = p.drift ?? 6, jit = p.jitter ?? 0.08, scoop = p.scoop || 0, sct = Math.max(1, (p.scoopTime ?? 0.08) * sr);
  const arr = typeof base === 'number' ? null : base;
  // control rate: modulation computed every 16 samples, ratio linearly interpolated in between
  const CR = 16, LN2_1200 = Math.LN2 / 1200;
  let ph = rng.float(), dA = 0, dB = rng.bi(), dPh = 0, rA = 0, rB = rng.bi();
  const dInc = (0.7 * CR) / sr;
  let prevRatio = -1;
  for (let i0 = 0; i0 < n; i0 += CR) {
    const g = i0 < dl ? 0 : Math.min(1, (i0 - dl) / fd);
    const s = dPh * dPh * (3 - 2 * dPh), dr = dA + (dB - dA) * s, rr = rA + (rB - rA) * s;
    const q = ph * SIN_N, j = q | 0, w = SIN[j] + (SIN[j + 1] - SIN[j]) * (q - j);
    let cents = depth * g * w + drift * dr;
    if (scoop && i0 < sct) { const x = i0 / sct; cents -= scoop * (1 - x) * (1 - x); }
    const ratio = Math.exp(cents * LN2_1200);
    if (prevRatio < 0) prevRatio = ratio;
    const e = Math.min(n, i0 + CR);
    for (let i = i0; i < e; i++) { const x = (i - i0) / CR; out[i] = (arr ? arr[i] : base) * (prevRatio + (ratio - prevRatio) * x); }
    prevRatio = ratio;
    ph += (rate * (1 + jit * rr) * CR) / sr; if (ph >= 1) ph -= 1;
    dPh += dInc; if (dPh >= 1) { dPh -= 1; dA = dB; dB = rng.bi(); rA = rB; rB = rng.bi(); }
  }
  return out;
}

/** constant Hz array helper */
export function constFreq(midiOrHz, n, isMidi = true) { return new Float32Array(n).fill(isMidi ? midiToHz(midiOrHz) : midiOrHz); }

/** pitch envelope: semitone offset decaying from `amount` to 0 with time constant tau; returns Hz array */
export function pitchDrop(baseHz, n, amount = 12, tau = 0.02, sr = SR) {
  const out = new Float32Array(n), k = Math.exp(-1 / (tau * sr));
  let s = amount;
  for (let i = 0; i < n; i++) { out[i] = baseHz * Math.pow(2, s / 12); s *= k; }
  return out;
}
