// Musician A: vocal-chop SAMPLER (brief section 8, SESSION-2 A2). Real EDM chops are slices of a sung take,
// re-pitched and hard-gated, and a good chop player never fires the same slice twice in a row. So:
//   - ROUND ROBIN: per (pitch, vowel) there are `rr` (default 4) sung source takes, each its own singer seed and a
//     formant shift of x(1 +- 0.03). Every chop takes two different takes (the double, +-6 cents, slightly L/R) and
//     never the take the previous chop on that (pitch, vowel) used in the same slot.
//   - RANDOM SLICE OFFSETS 0.08-0.6 s into the take, so stutters and long notes catch the vibrato and the drift of a
//     real held vowel instead of one steady pre-vibrato formant tone. The take is extended when offset + dur needs it.
//   - +-8 cents of random tuning per chop, on top of the -70 cent scoop into the note (30 ms).
//   - VOWEL DRIFT on held chops (note.drift): "ah" relaxes toward a schwa over ~200 ms. The schwa take is rendered
//     with the identical singer (same seed, pitch, length), so the excitation is sample-identical and the crossfade
//     is a true formant morph with no phasing.
//   - A SOFT "h" ONSET on phrase-initial chops (note.h): ~40 ms of breath noise through the vowel's own formants at
//     about -18 dB, before the vowel. No hard consonants.
//   - the slice envelope: 4 ms attack, decay to 70 % over 60 ms, 40 ms release, a 3 ms band-passed (3 kHz) noise
//     "cut" edge, gentle tanh drive.
import { Voice, VOWELS } from '../../engine/inst/voice.js';
import { SR, Rng, clamp, tanhFast } from '../../engine/core/util.js';
import { SVF, Biquad } from '../../engine/core/filters.js';

const VOW = { ah: 'a', oh: 'o', ay: 'e', ey: 'e', oo: 'u', a: 'a', o: 'o', e: 'e', u: 'u' };
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function hermite(buf, pos) {
  const i = Math.floor(pos), f = pos - i;
  const xm1 = buf[i - 1] ?? 0, x0 = buf[i] ?? 0, x1 = buf[i + 1] ?? 0, x2 = buf[i + 2] ?? 0;
  const c = (x1 - xm1) * 0.5, v = x0 - x1, w = c + v, a = w + v + (x2 - x0) * 0.5, b = w + a;
  return (((a * f) - b) * f + c) * f + x0;
}

/**
 * opts: { seed, type='soprano', formantShift=1.19, breath=0.15, doubles=2, detune=6 (cents), drive=1.5, brightness=0.6,
 *         rr=4 (takes per pitch/vowel), srcLen=1.2 (s, minimum take length), gain=1 }
 * note: { midi (fractional ok), vel, dur, vowel ('ah'|'oh'|'ay'|'oo'), gate=1 (fraction of dur), scoop=-70 (cents),
 *         scoopTime=0.03, slice (s into the take; default random 0.08-0.6), drift (bool: held-chop vowel drift),
 *         h (bool: soft breath onset), pan=0 }
 * returns { L, R, offset } (offset < 0 when the "h" sits before the beat)
 */
export class Chops {
  constructor(opts = {}) {
    this.opts = opts; this.name = opts.name || 'chops'; this.tail = 0.06; this.count = 0; this.sr = SR;
    this.rr = Math.max(2, opts.rr ?? 4);
    this.D = Math.max(1, Math.min(2, opts.doubles ?? 2));
    const fs = opts.formantShift ?? 1.19, sh = new Rng(`${opts.seed ?? 'chop'}:shifts`);
    // formant shifts spread evenly over +-3 %, in a seeded order
    this.shift = sh.shuffle(Array.from({ length: this.rr }, (_, k) => fs * (1 + (this.rr > 1 ? (k / (this.rr - 1)) * 2 - 1 : 0) * 0.03)));
    this.src = new Map();      // `${k}|${midi}|${vowel}` -> { buf, len }
    this.last = new Map();     // `${midi}|${vowel}` -> [take of slot 0, take of slot 1]
    this.renders = 0; this.renderSec = 0;
  }
  /** a fresh singer per take: identical excitation for the same (take, pitch, length) whatever the vowel */
  singer(k) {
    const o = this.opts;
    return new Voice({ type: o.type || 'soprano', formantShift: this.shift[k], breath: o.breath ?? 0.15, brightness: o.brightness ?? 0.6,
      vibrato: 0.75, seed: `${o.seed ?? 'chop'}:rr${k}` });
  }
  take(k, midi, vowel, need, len = 0) {
    const key = `${k}|${midi}|${vowel}`;
    let s = this.src.get(key);
    const want = len || Math.ceil(Math.max(this.opts.srcLen ?? 1.2, need) / 0.25 - 1e-9) * 0.25;
    if (!s || (len ? s.len !== len : s.len < need)) {
      const res = this.singer(k).render({ midi, vel: 0.9, dur: want + 0.1, vowel, glideFrom: midi });
      s = { buf: res.L, len: want };
      this.src.set(key, s);
      this.renders++; this.renderSec += want;
    }
    return s;
  }
  /** pick the round-robin takes for the doubles: never the previous chop's take in the same slot, never a duplicate */
  pickTakes(r, midi, vowel) {
    const key = `${midi}|${vowel}`, prev = this.last.get(key) || [-1, -1], out = [];
    for (let j = 0; j < this.D; j++) {
      const cand = []; for (let k = 0; k < this.rr; k++) if (k !== prev[j] && !out.includes(k)) cand.push(k);
      out.push(cand.length ? cand[Math.floor(r.float() * cand.length)] : (prev[j] + 1) % this.rr);
    }
    this.last.set(key, out);
    return out;
  }
  render(note) {
    const sr = this.sr, o = this.opts, v = clamp(note.vel ?? 0.8, 0.02, 1);
    const r = new Rng(`${o.seed ?? 'chop'}:${this.count++}`);
    const base = Math.round(note.midi), frac = note.midi - base;
    const vowel = VOW[note.vowel || 'ah'] || 'a';
    const gateDur = Math.max(0.025, (note.dur ?? 0.2) * (note.gate ?? 1));
    const rel = 0.04, nBody = Math.round((gateDur + rel) * sr);
    const hN = note.h ? Math.round(0.04 * sr) : 0, n = hN + nBody;
    const tune = frac * 100 + r.range(-8, 8);
    const scoop = note.scoop ?? -70, sN = Math.max(1, (note.scoopTime ?? 0.03) * sr);
    const drift = !!note.drift && vowel === 'a';
    const L = new Float32Array(n), R = new Float32Array(n);
    const D = this.D, takes = this.pickTakes(r, base, vowel), det = o.detune ?? 6;
    // cents track for the body (shared by the doubles: one performer, one scoop)
    const cents = new Float32Array(nBody);
    for (let i = 0; i < nBody; i++) { let c = tune; if (i < sN) { const x = i / sN; c += scoop * (1 - x * x * (3 - 2 * x)); } cents[i] = c; }
    for (let j = 0; j < D; j++) {
      const k = takes[j], dc = D > 1 ? (j ? det : -det) : 0;
      const slice = j === 0 && note.slice !== undefined ? note.slice : r.range(0.08, 0.6);
      const maxRate = Math.pow(2, (tune + dc + 8) / 1200);
      const need = slice + (gateDur + rel) * maxRate + 0.12;
      const A = this.take(k, base, vowel, need);
      const Sw = drift ? this.take(k, base, '@', 0, A.len) : null;    // the schwa twin, same singer, same length
      const pan = D > 1 ? (j ? 0.22 : -0.22) : 0;
      const gl = Math.cos((pan + 1) * Math.PI / 4) * 1.414, gr = Math.sin((pan + 1) * Math.PI / 4) * 1.414;
      let pos = slice * sr;
      const d0 = Math.round(0.03 * sr), dN = Math.round(0.2 * sr);
      for (let i = 0; i < nBody; i++) {
        let y = hermite(A.buf, pos);
        if (Sw) { const x = 0.65 * smooth((i - d0) / dN); if (x > 0) y = y * (1 - x) + hermite(Sw.buf, pos) * x; }
        L[hN + i] += y * gl; R[hN + i] += y * gr;
        pos += Math.pow(2, (cents[i] + dc) / 1200);
      }
    }
    // normalise the slice level, envelope, cut transient, drive
    let pk = 0; for (let i = hN; i < Math.min(n, hN + 0.06 * sr); i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    const norm = pk > 0 ? 0.7 / pk : 0;
    const nA = Math.round(0.004 * sr), nD = Math.round(0.06 * sr), nG = Math.round(gateDur * sr);
    const nz = new Float32Array(Math.round(0.004 * sr));
    for (let i = 0; i < nz.length; i++) nz[i] = r.bi() * Math.exp(-i / (0.0009 * sr));
    new SVF('bpn', 3000, 1.2, sr).process(nz);
    // the soft "h": breath noise through the vowel's own formants (F1-F3), ~-18 dB under the vowel, 40 ms
    let hb = null;
    if (hN) {
      hb = new Float32Array(hN + Math.round(0.01 * sr));
      const tab = (VOWELS[o.type || 'soprano'] || VOWELS.soprano)[vowel] || VOWELS.soprano.a, fs = this.shift[takes[0]];
      const raw = new Float32Array(hb.length); for (let i = 0; i < raw.length; i++) raw[i] = r.bi();
      for (let f = 0; f < 3; f++) {
        const y = raw.slice(); new Biquad('bp', tab[0][f] * fs, (tab[0][f] * fs) / (tab[1][f] * 1.6), 0, sr).process(y);
        const w = [1, 0.8, 0.5][f]; for (let i = 0; i < hb.length; i++) hb[i] += y[i] * w;
      }
      let hp = 0; for (const x of hb) hp = Math.max(hp, Math.abs(x));
      const lvl = 0.7 * Math.pow(10, -18 / 20) / Math.max(1e-6, hp) * 2.2;  // noise crest ~ 2.2: peak ~-18 dB re the vowel
      for (let i = 0; i < hb.length; i++) { const x = i / hN; hb[i] *= lvl * (i < hN ? smooth(x / 0.35) : Math.max(0, 1 - (i - hN) / (0.01 * sr))); }
    }
    const drive = o.drive ?? 1.5, dn = Math.tanh(drive);
    for (let i = 0; i < n; i++) {
      const b = i - hN;
      let e = 0;
      if (b >= 0) {
        if (b < nA) e = b / nA;
        else if (b < nA + nD) e = 1 - 0.3 * ((b - nA) / nD);
        else e = 0.7;
        if (b >= nG) e *= Math.max(0, 1 - (b - nG) / (rel * sr)) ** 2;
      }
      const t = b >= 0 && b < nz.length ? nz[b] * 0.35 : 0;
      const h = hb && i < hb.length ? hb[i] : 0;
      L[i] = tanhFast((L[i] * norm * e + t + h) * drive) / dn;
      R[i] = tanhFast((R[i] * norm * e + t + h) * drive) / dn;
    }
    const g = (o.gain ?? 1) * 0.55 * Math.pow(v, 0.85);
    for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
    return { L, R, offset: -hN / sr };
  }
}
