// Musician A: a legato string section that plays a whole PHRASE as one bowed line (brief section 9 "Strings",
// SESSION-2 A1). The engine Strings re-attacks every note; real players do not. Here every player is ONE continuous
// voice for the phrase:
//   - portamento between pitches (default 50 ms, centred on the grid time), never a new attack,
//   - repeated pitches are a bow change: a short, shallow dip with a breath of bow noise, not a re-attack,
//   - a brightness swell on every note: the low-pass opens from 2 kHz to 6 kHz over the note's attack (the bow
//     digging in), fully on the phrase's first note and partly on each shift, so long notes bloom instead of "wah",
//   - vibrato that fades out through a shift and blooms again 0.15-0.3 s into the new note (each player its own
//     rate, depth and drift), a few cents of slow intonation drift, per-player detune and seating across the stage,
//   - bow noise on the phrase attack, violin/viola body resonances, the same bowed-saw source and the same level
//     law as the engine Strings (so the stem level does not change: one gain change, one owner).
// Mono-safe: players are seated by equal-power pan, no M/S widening.
import { SR, Rng, midiToHz, clamp, panGains } from '../../engine/core/util.js';
import { Wavetable, renderWavetable, Noise } from '../../engine/core/osc.js';
import { Biquad, SVF } from '../../engine/core/filters.js';

let BOW = null;
function bowTable() {
  // the engine's bowed-string table (Helmholtz saw with a bow-position comb and a gentle roll-off)
  if (!BOW) BOW = Wavetable.fromFn((k) => (1 / k) * (0.45 + 0.55 * Math.abs(Math.sin((Math.PI * k) / 9.3))) / (1 + (k / 40) ** 2), 1, 300);
  return BOW;
}
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

const BODY = {
  violins: [[290, 1.6, 4], [470, 2, -2], [1050, 1.4, 3], [2700, 1.6, 4], [4300, 2, 1.5]],
  violas: [[230, 1.6, 4], [400, 2, -2], [900, 1.4, 3], [2300, 1.6, 3], [3800, 2, 1]],
};

/**
 * opts: { players=6, attack=0.12, release=0.4, vibrato=1, detune=6 (cents spread), width=0.9, glide=0.05,
 *         swellFrom=2000, swellTo=6000, swellTime=0.22, section: 'auto'|'violins'|'violas', seed, gain=1 }
 * note: { time, vel (phrase dynamic), dur (whole phrase), notes: [{ t (s from note.time), midi, dur, vel? }] }
 *   A note whose pitch equals the previous one is a bow change. Gaps inside a phrase are bridged (the bow keeps
 *   moving); split the phrase yourself where the line should breathe.
 * Returns [L, R].
 */
export class LegatoStrings {
  constructor(opts = {}) { this.opts = opts; this.name = opts.name || 'legato-strings'; this.sr = SR; this.tail = 0.6; this.count = 0; }
  render(note) {
    const sr = this.sr, o = this.opts, v = clamp(note.vel ?? 0.7, 0.02, 1);
    const ns = (note.notes && note.notes.length ? note.notes : [{ t: 0, midi: note.midi, dur: note.dur }]).map((x) => ({ ...x }));
    const r = new Rng(`${o.seed ?? 'lstr'}:${ns[0].midi}:${this.count++}`);
    const P = o.players ?? 6, rel = o.release ?? 0.4, att = note.attack ?? o.attack ?? 0.12;
    const glide = o.glide ?? 0.05, sw0 = o.swellFrom ?? 2000, sw1 = o.swellTo ?? 6000, swT = o.swellTime ?? 0.22;
    const dur = Math.max(0.05, note.dur ?? ns[ns.length - 1].t + ns[ns.length - 1].dur);
    const n = Math.round((dur + rel * 1.6) * sr);
    const hop = 8, nh = Math.ceil(n / hop) + 1;

    // ---- the line, evaluated every `hop` samples: pitch (midi), vibrato depth scale, dynamic, brightness depth
    const pitch = new Float32Array(nh), vibS = new Float32Array(nh), dyn = new Float32Array(nh), cut = new Float32Array(nh), bowc = new Float32Array(nh);
    const kinds = ns.map((x, k) => (k === 0 ? 'head' : x.midi === ns[k - 1].midi ? 'bow' : 'shift'));
    const bowTimes = ns.filter((x, k) => kinds[k] === 'bow').map((x) => x.t);
    for (let j = 0; j < nh; j++) {
      const t = (j * hop) / sr;
      // which note: the last one whose start is <= t (a shift starts its glide half a glide early)
      let k = 0; while (k + 1 < ns.length && ns[k + 1].t - (kinds[k + 1] === 'shift' ? glide / 2 : 0) <= t) k++;
      const nk = ns[k], kind = kinds[k];
      // pitch with portamento centred on the grid
      let m = nk.midi;
      if (kind === 'shift') { const x = (t - (nk.t - glide / 2)) / glide; m = ns[k - 1].midi + (nk.midi - ns[k - 1].midi) * smooth(x); }
      pitch[j] = m;
      const since = t - nk.t;
      // vibrato: phrase head blooms after 0.25 s; a shift kills it and it re-blooms; a bow change keeps it going
      let vs;
      if (kind === 'bow') { let kk = k; while (kk > 0 && kinds[kk] === 'bow') kk--; const s0 = t - ns[kk].t; vs = smooth((s0 - (kk === 0 ? 0.25 : 0.16)) / 0.35); }
      else vs = smooth((since - (kind === 'head' ? 0.25 : 0.16)) / 0.35);
      if (kind === 'shift' && since < glide / 2) vs = 0;
      vibS[j] = vs;
      // dynamic: per-note velocity (smoothed), a shallow lean into every new note, a bow-change dip
      const nv = clamp(nk.vel ?? 1, 0.2, 1.3);
      const pv = k > 0 ? clamp(ns[k - 1].vel ?? 1, 0.2, 1.3) : nv;
      const blend = smooth((since + 0.03) / 0.12);
      let d = pv + (nv - pv) * blend;
      if (kind === 'shift') d *= 1 - 0.1 * smooth((since + glide / 2) / glide) * (1 - smooth(since / 0.2));
      // bow changes: a symmetric dip around the change (the bow slows, turns, and digs in again)
      for (const tb of bowTimes) { const x = t - tb; if (x > -0.08 && x < 0.08) d *= 1 - 0.28 * Math.exp(-(x * x) / (2 * 0.016 ** 2)); }
      dyn[j] = d;
      // brightness swell 2k -> 6k: full on the head, partial on a shift, small on a bow change
      // (the dip on a shift / bow change eases in, so the cutoff never steps)
      const depth = kind === 'head' ? 1 : kind === 'shift' ? 0.55 : 0.35;
      const ramp = kind === 'head' ? 1 : kind === 'shift' ? smooth((since + glide / 2) / glide) : smooth(since / 0.02);
      cut[j] = sw1 * Math.pow(sw0 / sw1, depth * ramp * (1 - smooth(since / swT)));
      bowc[j] = kind === 'bow' && since >= 0 ? (1 - Math.exp(-since / 0.004)) * Math.exp(-since / 0.03) : 0;
    }
    // every control lane is slewed (no steps anywhere: a step in level or cutoff is a click, not a bow)
    const slew = (arr, tau) => { const a = Math.exp(-hop / (tau * sr)); let y = arr[0]; for (let j = 0; j < nh; j++) { y = a * y + (1 - a) * arr[j]; arr[j] = y; } };
    slew(dyn, 0.012); slew(cut, 0.02); slew(vibS, 0.05);
    const cutS = new Float32Array(n);
    for (let i = 0; i < n; i++) cutS[i] = cut[Math.min(nh - 1, (i / hop) | 0)] * (0.85 + 0.3 * v);

    const L = new Float32Array(n), R = new Float32Array(n), tmp = new Float32Array(n), fr = new Float32Array(n);
    const wt = bowTable(), spread = o.detune ?? 6, width = o.width ?? 0.9;
    const bowNoise = new Noise(r.u32(), 'white');
    const relStart = Math.round(dur * sr);
    for (let p = 0; p < P; p++) {
      tmp.fill(0);
      const cents0 = (P === 1 ? 0 : ((p / (P - 1)) * 2 - 1) * spread * 0.5) + r.gauss(0, spread * 0.15);
      const rate = r.range(4.7, 6.1), depth = r.range(8, 15) * (o.vibrato ?? 1), ph0 = r.float() * Math.PI * 2;
      const driftA = r.range(2, 4.5), driftR = r.range(0.07, 0.19), driftP = r.float() * Math.PI * 2;
      const scoop = r.range(0, 9);
      const w = (2 * Math.PI * rate) / sr;
      // frequency at the control rate (vibrato and glides are slow), linearly interpolated per sample
      let fPrev = 0;
      for (let j = 0; j < nh; j++) {
        const i = j * hop, t = i / sr;
        let c = cents0 + depth * vibS[j] * Math.sin(w * i + ph0) + driftA * Math.sin(2 * Math.PI * driftR * t + driftP);
        if (t < 0.07) c -= scoop * (1 - smooth(t / 0.07));
        const f = midiToHz(pitch[j] + c / 100);
        if (j > 0) { const i0 = i - hop; for (let q = 0; q < hop && i0 + q < n; q++) fr[i0 + q] = fPrev + ((f - fPrev) * q) / hop; }
        fPrev = f;
      }
      for (let i = (nh - 1) * hop; i < n; i++) fr[i] = fPrev;
      renderWavetable(wt, tmp, 0, n, fr, { phase: r.float(), amp: 1 });
      // envelope: a tight ensemble attack (players within ~8 ms: the doubles stay on the grid), dynamics, release
      const on = Math.round(r.range(0, 0.008) * sr), a = Math.max(1, Math.round(att * r.range(0.85, 1.2) * sr));
      const kr = Math.exp(-6.9 / (rel * sr));
      const bnN = Math.min(n, on + a + Math.round(0.05 * sr));
      const bn = new Float32Array(n);
      bowNoise.render(bn, on, bnN - on, 0.06 * (0.4 + v));
      // soft bow-change scrubs
      for (let k = 1; k < ns.length; k++) if (kinds[k] === 'bow') { const s = Math.round(ns[k].t * sr), e = Math.min(n, s + Math.round(0.04 * sr)); if (s < n) bowNoise.render(bn, s, e - s, 0.03 * (0.4 + v)); }
      new SVF('bp', r.range(2200, 3800), 0.9, sr).process(bn, 0, n);
      const pan = P === 1 ? 0 : ((p / (P - 1)) * 2 - 1) * width * (p % 2 ? 0.8 : 1);
      const [gl, gr] = panGains(pan);
      let env = 0;
      for (let i = 0; i < n; i++) {
        const j = (i / hop) | 0;
        if (i < on) continue;
        if (i < on + a) env = smooth((i - on) / a);
        else if (i < relStart) env = 1;
        else env *= kr;
        const d = i < relStart ? dyn[j] : dyn[Math.min(nh - 1, (relStart / hop) | 0)];
        const bnEnv = i < bnN ? Math.min(1, (bnN - i) / (0.03 * sr)) : bowc[j];
        const y = tmp[i] * env * d + bn[i] * bnEnv;
        L[i] += y * gl; R[i] += y * gr;
      }
    }
    // brightness swell (time-varying 12 dB low-pass), then the body
    let avg = 0; for (const x of ns) avg += x.midi; avg /= ns.length;
    const sec = o.section && o.section !== 'auto' ? o.section : avg >= 67 ? 'violins' : 'violas';
    for (const X of [L, R]) {
      new SVF('lp', 4000, 0.6, sr).process(X, 0, n, cutS);
      new Biquad('hp', 55, 0.7, 0, sr).process(X);
      for (const [bf, q, gdb] of BODY[sec]) new Biquad('peak', bf, q, gdb, sr).process(X);
    }
    const g = (o.gain ?? 1) * 0.32 * Math.pow(v, 0.8) / Math.sqrt(P);
    for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
    return [L, R];
  }
}
