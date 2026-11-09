// Singing voice + choir: Klatt-style source-filter synthesis.
//  source: band-limited glottal flow-derivative wavetable (Rosenberg pulse; pressed <-> breathy morph), jitter,
//          shimmer, natural vibrato with delayed onset, onset scoop, portamento, pulsed aspiration noise
//  tract:  5-formant cascade resonator bank (DC-normalised two-pole sections) with per-voice-type vowel tables,
//          smooth formant transitions and soprano F1 tuning
//  consonants: closures, bursts, aspiration, fricatives (parallel noise branch), nasals/liquids/glides
//  text:   a syllable like "kol", "tzi", "b'ar", "chof" is parsed into phonemes; onset consonants are placed
//          BEFORE the note time so the vowel lands on the beat (render returns a negative offset).
import { SR, Rng, midiToHz, clamp, panGains } from '../core/util.js';
import { Wavetable, renderWavetable } from '../core/osc.js';
import { Biquad, SVF } from '../core/filters.js';
import { vibrato } from '../core/mod.js';

// Formant tables [F1..F5], [BW1..BW5] (Csound/Peterson-Barney style values)
const VOWELS = {
  soprano: { a: [[800, 1150, 2900, 3900, 4950], [80, 90, 120, 130, 140]], e: [[350, 2000, 2800, 3600, 4950], [60, 100, 120, 150, 200]], i: [[270, 2140, 2950, 3900, 4950], [60, 90, 100, 120, 120]], o: [[450, 800, 2830, 3800, 4950], [70, 80, 100, 130, 135]], u: [[325, 700, 2700, 3800, 4950], [50, 60, 170, 180, 200]] },
  alto: { a: [[800, 1150, 2800, 3500, 4950], [80, 90, 120, 130, 140]], e: [[400, 1600, 2700, 3300, 4950], [60, 80, 120, 150, 200]], i: [[350, 1700, 2700, 3700, 4950], [50, 100, 120, 150, 200]], o: [[450, 800, 2830, 3500, 4950], [70, 80, 100, 130, 135]], u: [[325, 700, 2530, 3500, 4950], [50, 60, 170, 180, 200]] },
  tenor: { a: [[650, 1080, 2650, 2900, 3250], [80, 90, 120, 130, 140]], e: [[400, 1700, 2600, 3200, 3580], [70, 80, 100, 120, 120]], i: [[290, 1870, 2800, 3250, 3540], [40, 90, 100, 120, 120]], o: [[400, 800, 2600, 2800, 3000], [40, 80, 100, 120, 120]], u: [[350, 600, 2700, 2900, 3300], [40, 60, 100, 120, 120]] },
  bass: { a: [[600, 1040, 2250, 2450, 2750], [60, 70, 110, 120, 130]], e: [[400, 1620, 2400, 2800, 3100], [40, 80, 100, 120, 120]], i: [[250, 1750, 2600, 3050, 3340], [60, 90, 100, 120, 120]], o: [[400, 750, 2400, 2600, 2900], [40, 80, 100, 120, 120]], u: [[350, 600, 2400, 2675, 2950], [40, 80, 100, 120, 120]] },
};
for (const t of Object.values(VOWELS)) { // schwa
  t['@'] = [t.a[0].map((f, i) => Math.round((f + t.e[0][i] + t.o[0][i]) / 3) * (i === 0 ? 0.85 : 1)), t.a[1]];
}
const VOICE_TYPES = { soprano: 'soprano', alto: 'alto', tenor: 'tenor', bass: 'bass', female: 'alto', male: 'tenor' };

// consonant segment recipes. kind: stop (closure+burst+asp), fric, nasal, liquid, glide, h
const CONS = {
  k: { kind: 'stop', clo: 0.035, burst: [2200, 1.4, 0.5], asp: 0.035 },
  t: { kind: 'stop', clo: 0.03, burst: [4500, 1.2, 0.45], asp: 0.025 },
  p: { kind: 'stop', clo: 0.04, burst: [1100, 0.7, 0.3], asp: 0.025 },
  b: { kind: 'stop', clo: 0.04, burst: [900, 0.8, 0.12], asp: 0, voiced: true },
  d: { kind: 'stop', clo: 0.035, burst: [3500, 1, 0.15], asp: 0, voiced: true },
  g: { kind: 'stop', clo: 0.04, burst: [2000, 1, 0.15], asp: 0, voiced: true },
  s: { kind: 'fric', dur: 0.085, fric: [6800, 2.2, 0.32] },
  z: { kind: 'fric', dur: 0.07, fric: [6200, 2, 0.18], voice: 0.55 },
  sh: { kind: 'fric', dur: 0.095, fric: [3400, 1.3, 0.38] },
  ch: { kind: 'fric', dur: 0.09, fric: [1700, 1.0, 0.3], asp: 0.5 },
  f: { kind: 'fric', dur: 0.08, fric: [5200, 0.6, 0.14] },
  v: { kind: 'fric', dur: 0.06, fric: [4500, 0.6, 0.08], voice: 0.7, F: [[260, 1100, 2400, 3300, 4300], [70, 200, 200, 250, 300]] },
  h: { kind: 'h', dur: 0.06 },
  m: { kind: 'nasal', dur: 0.075, F: [[250, 1100, 2300, 3300, 4200], [80, 300, 300, 350, 400]], voice: 0.7 },
  n: { kind: 'nasal', dur: 0.065, F: [[250, 1500, 2600, 3400, 4300], [80, 250, 250, 300, 350]], voice: 0.72 },
  l: { kind: 'liquid', dur: 0.05, F: [[360, 1100, 2700, 3300, 4300], [60, 120, 150, 200, 250]], voice: 0.9 },
  r: { kind: 'liquid', dur: 0.045, F: [[450, 1250, 1650, 3000, 4200], [80, 150, 200, 250, 300]], voice: 0.8 },
  y: { kind: 'glide', dur: 0.045, vowel: 'i', voice: 0.9 },
  w: { kind: 'glide', dur: 0.045, vowel: 'u', voice: 0.9 },
};
CONS.kh = CONS.ch; CONS.c = CONS.k; CONS.q = CONS.k; CONS.j = CONS.y; CONS.x = CONS.ch;
CONS.tz = { kind: 'affr', parts: ['t', 's'] }; CONS.ts = CONS.tz;

/** parse a syllable ("kol", "b'ar", "tzi", "chof", "ah") -> { onset: [...], vowels: [...], coda: [...] } */
export function parseSyllable(text) {
  const s = String(text || 'a').toLowerCase().replace(/[^a-z'@]/g, '');
  const toks = [];
  for (let i = 0; i < s.length;) {
    const two = s.slice(i, i + 2);
    if (['sh', 'ch', 'kh', 'tz', 'ts'].includes(two)) { toks.push(two); i += 2; continue; }
    const c = s[i];
    toks.push(c === "'" ? '@' : c); i++;
  }
  const isV = (t) => 'aeiou@'.includes(t);
  // 'y' between consonant and end or before consonant acts as vowel i
  for (let i = 0; i < toks.length; i++) if (toks[i] === 'y' && !(i + 1 < toks.length && isV(toks[i + 1]))) toks[i] = 'i';
  const first = toks.findIndex(isV);
  if (first < 0) return { onset: toks.filter((t) => CONS[t]), vowels: ['@'], coda: [] };
  let last = first; while (last + 1 < toks.length && isV(toks[last + 1])) last++;
  return { onset: toks.slice(0, first).filter((t) => CONS[t]), vowels: toks.slice(first, last + 1), coda: toks.slice(last + 1).filter((t) => CONS[t]) };
}

const GLOTTAL = new Map();
function glottalTable() {
  if (GLOTTAL.has('t')) return GLOTTAL.get('t');
  const mk = (oq, skew) => {
    const N = 2048, flow = new Float64Array(N), d = new Float32Array(N);
    const Tp = oq * skew * N, Tn = oq * (1 - skew) * N;
    for (let i = 0; i < N; i++) flow[i] = i < Tp ? 0.5 * (1 - Math.cos((Math.PI * i) / Tp)) : i < Tp + Tn ? Math.cos((Math.PI * (i - Tp)) / (2 * Tn)) : 0;
    for (let i = 0; i < N; i++) d[i] = flow[(i + 1) % N] - flow[i];
    let pk = 0; for (const x of d) pk = Math.max(pk, Math.abs(x));
    for (let i = 0; i < N; i++) d[i] /= pk;
    return d;
  };
  // frame 0: pressed/bright (short open phase), frame 1: modal, frame 2: breathy (long, soft closure)
  const wt = Wavetable.fromWaves([mk(0.45, 0.72), mk(0.6, 0.66), mk(0.82, 0.6)]);
  GLOTTAL.set('t', wt);
  return wt;
}

// voice tone correction (see "presence/air shaping" in Voice.render)
const PRESENCE_DB = 13, AIR_DB = 13, AIR_BREATH = 0.08;

function vowelF(type, v) { const t = VOWELS[type]; return t[v] || t.a; }

/**
 * Solo singing voice.
 * opts: { type: 'soprano'|'alto'|'tenor'|'bass'|'female'|'male', breath=0.25, vibrato=1 (depth scale), vibratoRate=5.4,
 *         formantShift=1 (scale formants: <1 darker/bigger, >1 smaller/brighter), brightness=0.5, seed, gain=1 }
 * note: { midi, vel, dur, text: 'kol' | vowel: 'a', glideFrom (midi), glideTime=0.08, breath, vibrato }
 * returns { L, R, offset } (mono in both channels; offset < 0 when the syllable starts with consonants)
 */
export class Voice {
  constructor(opts = {}) { this.name = opts.name || 'voice'; this.opts = opts; this.sr = opts.sr || SR; this.tail = 0.25; this.count = 0; }
  render(note) {
    const sr = this.sr, o = this.opts, v = clamp(note.vel ?? 0.75, 0.02, 1);
    const type = VOICE_TYPES[o.type || 'alto'] || 'alto';
    const r = new Rng(`${o.seed ?? 'vox'}:${note.midi}:${this.count++}`);
    const syl = parseSyllable(note.text ?? note.vowel ?? 'a');
    const fs = (note.formantShift ?? o.formantShift ?? 1);
    const f0 = midiToHz(note.midi);
    const dur = Math.max(0.06, note.dur ?? 0.5);
    // ---- build segment list (time relative to vowel onset at 0)
    const segs = []; // { t0, t1, F, BW, voice, asp, fric:[f,q,amp]|null }
    const mainV = syl.vowels[0];
    const VF = vowelF(type, mainV);
    let pre = 0;
    const onsetSegs = [];
    const consSegs = (c, nextF, voicedNext) => {
      const C = CONS[c]; const out = [];
      if (!C) return out;
      if (C.kind === 'affr') { for (const p of C.parts) out.push(...consSegs(p, nextF, voicedNext)); return out; }
      if (C.kind === 'stop') {
        out.push({ d: C.clo, F: [[220, 900, 2300, 3300, 4300], [100, 200, 250, 300, 300]], voice: C.voiced ? 0.15 : 0, asp: 0, fric: null });
        out.push({ d: 0.012, F: nextF, voice: C.voiced ? 0.3 : 0, asp: 0.15, fric: C.burst });
        if (C.asp) out.push({ d: C.asp, F: nextF, voice: 0, asp: 0.55, fric: null });
      } else if (C.kind === 'fric') out.push({ d: C.dur, F: C.F || nextF, voice: C.voice || 0, asp: C.asp || 0, fric: C.fric });
      else if (C.kind === 'h') out.push({ d: C.dur, F: nextF, voice: 0, asp: 0.85, fric: null });
      else if (C.kind === 'glide') out.push({ d: C.dur, F: vowelF(type, C.vowel), voice: C.voice, asp: 0, fric: null });
      else out.push({ d: C.dur, F: C.F, voice: C.voice, asp: 0, fric: null, nasal: C.kind === 'nasal' });
      return out;
    };
    for (const c of syl.onset) onsetSegs.push(...consSegs(c, VF, true));
    pre = onsetSegs.reduce((a, s) => a + s.d, 0);
    let t = -pre;
    for (const s of onsetSegs) { segs.push({ ...s, t0: t, t1: t + s.d }); t += s.d; }
    const codaSegs = [];
    for (const c of syl.coda) codaSegs.push(...consSegs(c, VF, false));
    const codaDur = Math.min(dur * 0.45, codaSegs.reduce((a, s) => a + s.d, 0));
    const vEnd = dur - codaDur;
    if (syl.vowels.length > 1) {
      const split = vEnd * 0.65;
      segs.push({ t0: 0, t1: split, F: VF, voice: 1, asp: 0, fric: null });
      segs.push({ t0: split, t1: vEnd, F: vowelF(type, syl.vowels[1]), voice: 1, asp: 0, fric: null });
    } else segs.push({ t0: 0, t1: vEnd, F: VF, voice: 1, asp: 0, fric: null });
    t = vEnd;
    const cScale = codaSegs.length ? codaDur / codaSegs.reduce((a, s) => a + s.d, 0) : 1;
    for (const s of codaSegs) { segs.push({ ...s, t0: t, t1: t + s.d * cScale }); t += s.d * cScale; }
    const relT = 0.09 + (syl.coda.length ? 0.02 : 0.06);
    const total = pre + dur + relT;
    const n = Math.round(total * sr), off = Math.round(pre * sr);
    // ---- pitch track: portamento + scoop + vibrato + drift (+ jitter later)
    const base = new Float32Array(n);
    const gFrom = note.glideFrom !== undefined ? midiToHz(note.glideFrom) : null, gT = Math.max(1, (note.glideTime ?? 0.08) * sr);
    for (let i = 0; i < n; i++) {
      if (gFrom && i - off < gT) { const x = Math.max(0, (i - off) / gT); const s = x * x * (3 - 2 * x); base[i] = gFrom * Math.pow(f0 / gFrom, s); }
      else base[i] = f0;
    }
    const vibDepth = (note.vibrato ?? o.vibrato ?? 1) * (dur > 0.35 ? r.range(22, 38) : 8);
    const fr = vibrato(base, n, { rate: (o.vibratoRate ?? 5.4) * r.range(0.94, 1.06), depth: vibDepth, delay: Math.min(0.35, dur * 0.4) + pre, fade: 0.3, drift: 5, jitter: 0.1, seed: r.u32(), scoop: gFrom ? 0 : r.range(20, 45), scoopTime: 0.07 });
    // ---- source
    const src = new Float32Array(n);
    const breath = clamp(note.breath ?? o.breath ?? 0.25, 0, 1);
    const pos = clamp(0.5 - (v - 0.6) * 0.8 + breath * 0.6, 0, 1); // morph pressed..modal..breathy
    renderWavetable(glottalTable(), src, 0, n, fr, { phase: r.float(), position: pos, amp: 1 });
    // ---- amplitude, voicing & aspiration envelopes from segments (smoothed)
    const vEnv = new Float32Array(n), aEnv = new Float32Array(n);
    const fric = new Float32Array(n);
    const segAt = (tt) => { for (const s of segs) if (tt >= s.t0 && tt < s.t1) return s; return null; };
    // frication branch, rendered per segment
    let ns = r.u32() | 1;
    const noise = new Float32Array(n);
    for (let i = 0; i < n; i++) { ns ^= ns << 13; ns ^= ns >>> 17; ns ^= ns << 5; noise[i] = (ns >>> 0) / 2147483648 - 1; }
    for (const s of segs) {
      if (!s.fric) continue;
      const i0 = Math.max(0, Math.round((s.t0 + pre) * sr)), i1 = Math.min(n, Math.round((s.t1 + pre) * sr) + Math.round(0.01 * sr));
      const bp = new SVF('bpn', s.fric[0] * (fs > 0 ? Math.sqrt(fs) : 1), s.fric[1], sr);
      const seg = noise.slice(i0, i1); bp.process(seg);
      const L2 = i1 - i0, ramp = Math.max(1, Math.round(0.008 * sr));
      for (let k = 0; k < L2; k++) { const e = Math.min(1, k / ramp, (L2 - k) / ramp); fric[i0 + k] += seg[k] * s.fric[2] * e; }
    }
    const atk = Math.round(0.035 * sr), sm = Math.exp(-1 / (0.006 * sr));
    let ve = 0, ae = 0;
    const relStart = Math.round((pre + dur) * sr), kRel = Math.exp(-6.9 / (relT * sr));
    let rg = 1;
    let s = null;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) s = segAt(i / sr - pre);
      let tv = s ? s.voice : 0, ta = s ? s.asp : 0;
      if (i >= relStart) { rg *= kRel; tv = 1; ta = 0.05; }
      ve = sm * ve + (1 - sm) * tv; ae = sm * ae + (1 - sm) * ta;
      const onset = i < off + atk && (!s || s.voice >= 1) ? Math.min(1, Math.max(0, (i - off + atk * 0.3) / atk)) : 1;
      vEnv[i] = ve * onset * rg; aEnv[i] = ae * (i >= relStart ? rg : 1);
    }
    // shimmer: slow random amplitude wander
    let sh = 1, shT = 1, shK = Math.exp(-1 / (0.05 * sr));
    const exc = new Float32Array(n);
    const aspAmt = 0.08 + breath * 0.35;
    for (let i = 0; i < n; i++) {
      if ((i & 511) === 0) shT = 1 + r.range(-0.06, 0.06);
      sh = shK * sh + (1 - shK) * shT;
      const glot = src[i];
      // aspiration pulsed with the glottal cycle (louder when the folds are open)
      const asp = noise[n - 1 - i] * (0.55 + 0.45 * Math.max(0, -glot)) * (aspAmt * vEnv[i] + aEnv[i] * 0.9);
      exc[i] = glot * vEnv[i] * sh + asp;
    }
    // ---- cascade formant tract with interpolated targets (update every 32 samples)
    const out = new Float32Array(n);
    let y10 = 0, y11 = 0, y12 = 0, y13 = 0, y14 = 0, y20 = 0, y21 = 0, y22 = 0, y23 = 0, y24 = 0; // resonator states (locals: fast)
    const curF = Float64Array.from(VF[0]), curB = Float64Array.from(VF[1]);
    let first = true;
    const fK = Math.exp(-1 / (0.022 * sr / 32));
    const c1 = new Float64Array(5), c2 = new Float64Array(5), gn = new Float64Array(5);
    for (let i0 = 0; i0 < n; i0 += 32) {
      const s = segAt(i0 / sr - pre) || (i0 / sr - pre < 0 ? segs[0] : segs[segs.length - 1]);
      for (let k = 0; k < 5; k++) {
        let tf = s.F[0][k] * fs, tb = s.F[1][k];
        if (k === 0 && tf < fr[i0] * 1.12) tf = fr[i0] * 1.12; // F1 tuning on high notes
        if (s.nasal && k > 0) tb *= 1.5;
        if (first) { curF[k] = tf; curB[k] = tb; } else { curF[k] = fK * curF[k] + (1 - fK) * tf; curB[k] = fK * curB[k] + (1 - fK) * tb; }
        const rr = Math.exp((-Math.PI * curB[k]) / sr), th = (2 * Math.PI * Math.min(curF[k], sr * 0.45)) / sr;
        c1[k] = 2 * rr * Math.cos(th); c2[k] = -rr * rr; gn[k] = 1 - c1[k] - c2[k];
      }
      first = false;
      const e = Math.min(n, i0 + 32);
      const g0 = gn[0], g1 = gn[1], g2 = gn[2], g3 = gn[3], g4 = gn[4], a0 = c1[0], a1 = c1[1], a2 = c1[2], a3 = c1[3], a4 = c1[4];
      const b0 = c2[0], b1 = c2[1], b2 = c2[2], b3 = c2[3], b4 = c2[4];
      for (let i = i0; i < e; i++) {
        // 5-formant cascade, unrolled
        let y = g0 * exc[i] + a0 * y10 + b0 * y20; y20 = y10; y10 = y;
        y = g1 * y + a1 * y11 + b1 * y21; y21 = y11; y11 = y;
        y = g2 * y + a2 * y12 + b2 * y22; y22 = y12; y12 = y;
        y = g3 * y + a3 * y13 + b3 * y23; y23 = y13; y13 = y;
        y = g4 * y + a4 * y14 + b4 * y24; y24 = y14; y14 = y + 1e-18 - 1e-18;
        out[i] = y + fric[i];
      }
    }
    // presence/air shaping and level.
    // An all-pole 5-formant cascade rolls off far faster above F5 than a real voice (whose tract has more
    // formants up there). "Higher-pole correction": restore the singer's-formant/presence region and the top,
    // then add a parallel breath branch (aspiration noise riding the glottal cycle, 2-11 kHz) for natural air.
    const bright = o.brightness ?? 0.5;
    new Biquad('hp', 90, 0.7, 0, sr).process(out);
    new Biquad('peak', 2700 * Math.sqrt(fs), 0.55, PRESENCE_DB + (bright - 0.5) * 4, sr).process(out);
    new Biquad('hs', 5500, 0.6, AIR_DB + (bright - 0.5) * 8, sr).process(out);
    {
      const air = new Float32Array(n), airAmt = AIR_BREATH * (0.35 + breath) * (0.6 + 0.6 * v);
      for (let i = 0; i < n; i++) air[i] = noise[i] * (0.4 + 0.6 * Math.max(0, -src[i])) * (vEnv[i] + aEnv[i] * 0.5) * airAmt;
      new Biquad('hp', 2000, 0.6, 0, sr).process(air); new Biquad('hp', 2000, 0.6, 0, sr).process(air); new Biquad('lp', 11000, 0.7, 0, sr).process(air);
      // the air branch is scaled to the voiced level so it stays a fixed ratio below it
      let vp = 0; for (let i = off; i < Math.min(n, off + Math.round(0.3 * sr)); i++) vp = Math.max(vp, Math.abs(out[i]));
      for (let i = 0; i < n; i++) out[i] += air[i] * vp;
    }
    let pk = 0; for (let i = off; i < Math.min(n, off + Math.round(0.3 * sr)); i++) pk = Math.max(pk, Math.abs(out[i]));
    const g = (o.gain ?? 1) * 0.5 * Math.pow(v, 0.8) / Math.max(1e-4, pk);
    for (let i = 0; i < n; i++) out[i] *= g;
    const fe = Math.min(128, n); for (let i = 0; i < fe; i++) out[n - 1 - i] *= i / fe;
    return { L: out, R: out, offset: -pre };
  }
}

/**
 * Choir section: several Voice singers per note with natural spread (detune, timing, vibrato, formant size), panned.
 * opts: { type, singers=6, width=0.9, detune=10 (cents spread), timing=0.018 (s spread), breath=0.35, seed, gain=1, + Voice opts }
 * note: same as Voice (text/vowel, midi, dur, vel)
 */
export class Choir {
  constructor(opts = {}) {
    this.name = opts.name || 'choir'; this.opts = opts; this.sr = opts.sr || SR; this.tail = 0.3; this.count = 0;
    const N = opts.singers ?? 6;
    this.singers = Array.from({ length: N }, (_, k) => new Voice({ ...opts, breath: opts.breath ?? 0.35, seed: `${opts.seed ?? 'choir'}:${k}`, formantShift: (opts.formantShift ?? 1) * (0.95 + 0.1 * (k / Math.max(1, N - 1))), vibrato: (opts.vibrato ?? 0.8) * (0.7 + 0.6 * ((k * 7) % N) / N) }));
  }
  render(note) {
    const sr = this.sr, o = this.opts, N = this.singers.length, r = new Rng(`${o.seed ?? 'ch'}:${this.count++}`);
    const parts = this.singers.map((s, k) => {
      const dt = r.range(-1, 1) * (o.timing ?? 0.018), cents = (N === 1 ? 0 : ((k / (N - 1)) * 2 - 1) * (o.detune ?? 10) * 0.5) + r.gauss(0, 2);
      const res = s.render({ ...note, midi: note.midi + cents / 100, vel: (note.vel ?? 0.75) * r.range(0.85, 1), dur: Math.max(0.06, (note.dur ?? 0.5) - dt) });
      return { res, dt, pan: N === 1 ? 0 : ((k / (N - 1)) * 2 - 1) * (o.width ?? 0.9) * (k % 2 ? 1 : -1) };
    });
    const minOff = Math.min(...parts.map((p) => p.res.offset + p.dt));
    const len = Math.max(...parts.map((p) => Math.round((p.res.offset + p.dt - minOff) * sr) + p.res.L.length));
    const L = new Float32Array(len), R = new Float32Array(len);
    for (const p of parts) {
      const st = Math.round((p.res.offset + p.dt - minOff) * sr), [gl, gr] = panGains(p.pan);
      const x = p.res.L;
      for (let i = 0; i < x.length; i++) { L[st + i] += x[i] * gl; R[st + i] += x[i] * gr; }
    }
    const g = (o.gain ?? 1) / Math.sqrt(N) * 1.2;
    for (let i = 0; i < len; i++) { L[i] *= g; R[i] *= g; }
    return { L, R, offset: minOff };
  }
}

export { VOWELS };
