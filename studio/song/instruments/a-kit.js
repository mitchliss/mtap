// Musician A shared toolkit: voicings, bass lines, the shared lead line (so every lead layer in every part file
// hits the same humanised timing), silence gating, in-part "baking" of player-owned effects, envelope wrappers.
// Pure helpers; every part file imports this in its own worker.
import { CHUNK, asStereo } from '../../engine/studio.js';
import { Rng, panGains, balanceGains, clamp } from '../../engine/core/util.js';
import { parseChord, transposeChord, voiceLead, pcAtOrAbove, guitarVoicing } from '../../engine/theory.js';

// ------------------------------------------------------------------ harmony
// Upper-structure voicings in D minor (brief section 7). Top voice <= A4 so the drop lead owns D5-D6.
// Indexed by the UNtransposed symbol; add the section's transpose.
export const UPPER = {
  Dmadd9: [57, 62, 64, 65, 69], 'Dm7/C': [57, 60, 64, 65], Bbmaj7: [57, 62, 65], 'Dm/A': [57, 62, 65],
  'Dm/F': [57, 62, 65], Dm: [57, 62, 65], Dm7: [57, 60, 62, 65], Gm7: [58, 62, 65], Gm9: [58, 62, 65, 69],
  Gm: [55, 58, 62], 'Gm/Bb': [55, 58, 62], A7sus4: [55, 62, 64], A7: [55, 61, 64], A: [57, 61, 64],
  C: [55, 60, 64], Cadd9: [55, 60, 62, 64], Csus4: [55, 60, 65], C7sus4: [55, 58, 60, 65], F: [57, 60, 65],
  'F/A': [57, 60, 65], Fadd9: [57, 60, 65, 67], 'F/C': [57, 60, 65], Bb: [53, 58, 62, 65], Bbadd9: [53, 58, 60, 62, 65],
  Dsus4: [55, 57, 62, 67], D: [54, 57, 62, 66, 69],
};
// Guitar shapes (concert midi, low E first, null = muted), D-minor symbols. Transposed sections shift by +transpose
// only when the shape has no open strings; otherwise theory.guitarVoicing finds a real shape in the new key.
export const GTR = {
  Dmadd9: [null, null, 50, 57, 62, 64], Dm: [null, null, 50, 57, 62, 65], 'Dm/A': [null, 45, 50, 57, 62, 65],
  'Dm/F': [null, null, 53, 57, 62, 65], 'Dm7/C': [null, 48, 50, 57, 60, 65], Dm7: [null, null, 50, 57, 60, 65],
  Gm: [43, 50, 55, 58, 62, 67], Gm7: [43, 50, 53, 58, 62, 67], Gm9: [43, 50, 53, 58, 62, 69], 'Gm/Bb': [null, 46, 50, 55, 62, 67],
  A7: [null, 45, 52, 55, 61, 64], A7sus4: [null, 45, 52, 55, 62, 64], A: [null, 45, 52, 57, 61, 64],
  C: [null, 48, 52, 55, 60, 64], Cadd9: [null, 48, 52, 55, 62, 64], Csus4: [null, 48, 53, 55, 60, 65], C7sus4: [null, 48, 53, 58, 60, 65],
  F: [41, 48, 53, 57, 60, 65], 'F/A': [null, 45, 53, 57, 60, 65], Fadd9: [null, null, 53, 57, 60, 67], 'F/C': [null, 48, 53, 57, 60, 65],
  Bb: [null, 46, 53, 58, 62, 65], Bbmaj7: [null, 46, 53, 57, 62, 65], Bbadd9: [null, 46, 53, 58, 60, 65],
  Dsus4: [null, null, 50, 57, 62, 67], D: [null, null, 50, 57, 62, 66],
};
// E minor (drop3+): open-string shapes from the brief, keyed by the TRANSPOSED symbol.
export const GTR_E = {
  Emadd9: [40, 47, 54, 55, 59, 64], Em: [40, 47, 52, 55, 59, 64], 'Em7/D': [null, null, 50, 55, 59, 64],
  Cmaj7: [null, 48, 52, 55, 59, 64], 'Em/B': [null, 47, 52, 55, 59, 64], Am7: [null, 45, 52, 55, 60, 64],
  Am9: [null, 45, 52, 55, 59, 64], 'Em/G': [43, 47, 52, 55, 59, 64], B7sus4: [null, 47, 54, 57, 64, 66],
  B7: [null, 47, 51, 57, 59, 66], D: [null, null, 50, 57, 62, 66], G: [43, 47, 50, 55, 59, 67], C: [null, 48, 52, 55, 60, 64],
  Am: [null, 45, 52, 57, 60, 64],
};

/** the chord symbol in the anthem key (D minor) for a resolved chord object */
export const baseSymbol = (chord, sec) => (sec.transpose ? transposeChord(chord.symbol, -sec.transpose) : chord.symbol);

/**
 * chordAt with the pre-drop resolutions moved forward: when a sus chord's resolution (A7sus4 -> A7, Dsus4 -> D) falls
 * entirely inside a cue silence, the resolution is played on the second beat of the sus half-bar instead, so it is heard.
 */
export function chordAtA(studio, t) {
  const c = studio.chordAt(t);
  const i = studio.chords.indexOf(c), nx = studio.chords[i + 1];
  if (!nx || nx.root !== c.root || !/sus/.test(c.quality) || !studio.inSilence(nx.start + 0.01)) return c;
  return t >= (c.start + c.end) / 2 - 1e-4 ? nx : c;
}

/** drop-register upper structure (midi[]), transposed for the section */
export function upper(chord, sec, { low = 53, high = 69 } = {}) {
  const b = baseSymbol(chord, sec);
  let v = UPPER[b];
  if (!v) v = voiceLead(parseChord(b), null, { low, high, count: 4 });
  return v.map((m) => m + sec.transpose);
}

/** guitar chord shape (6 strings) for a resolved chord */
export function gtrShape(chord, sec, prefer = 'open') {
  if (sec.transpose === 2 && GTR_E[chord.symbol]) return GTR_E[chord.symbol].slice();
  const b = baseSymbol(chord, sec);
  if (!sec.transpose && GTR[b]) return GTR[b].slice();
  return guitarVoicing(chord.symbol, { prefer });
}

/** lament/sub register: F1..E2 (midi 29..40), sub fundamentals 44-82 Hz */
export const subMidi = (pc) => pcAtOrAbove(pc, 29);
/** piano left-hand octave base (same staircase as the bass so the lament line descends) */
export const lhMidi = (pc) => pcAtOrAbove(pc, 29);

// ------------------------------------------------------------------ deterministic humanisation
/** gaussian jitter that is identical in every worker for the same key */
export function jit(key, sd) { return new Rng(`ajit:${key}`).gauss(0, sd); }

/**
 * The shared lead line for a section: the anthem notes (transposed), with
 *  - optional anticipation of refrain B's first note (anthem bar 12/16, "Chainsmokers push") by one 16th,
 *  - shared micro-timing (sd seconds) so piano / guitar / pluck / chops layers stay locked together.
 * Notes keep all melody fields; `idx` = position in the section; `next`/`prev` midi for articulation.
 */
export function leadLine(studio, secName, { anticipate = false, sd = 0, octave = 0 } = {}) {
  const sec = studio.section(secName);
  const notes = studio.melody(secName).map((n) => ({ ...n, midi: n.midi + 12 * octave }));
  if (anticipate) {
    for (let i = 1; i < notes.length; i++) {
      const n = notes[i];
      if ((n.anthemStep === 192 || n.anthemStep === 256) && n.sectionStep > 0) {
        const t = sec.step(n.sectionStep - 1), prev = notes[i - 1];
        prev.dur = t - prev.time; prev.end = t; prev.steps -= 1;
        n.dur = n.end - t; n.time = t; n.sectionStep -= 1; n.steps += 1; n.anticipated = true;
      }
    }
  }
  notes.forEach((n, i) => {
    n.idx = i; n.prevMidi = i > 0 ? notes[i - 1].midi : null; n.nextMidi = i + 1 < notes.length ? notes[i + 1].midi : null;
    n.gapBefore = i > 0 ? n.time - notes[i - 1].end : Infinity;
    if (sd > 0 && n.sectionStep > 0) n.time += jit(`${secName}:${n.anthemIndex}:${i}`, sd);
  });
  return notes;
}

/** phrase-shaped velocity for a melody note: rises with pitch, downbeats and long notes lean in */
export function melVel(n, base = 0.7, span = 0.16, lo = 62, hi = 74) {
  const p = clamp((n.midi - lo) / Math.max(1, hi - lo), -0.5, 1.5);
  const down = n.sectionStep % 4 === 0 ? 0.035 : n.sectionStep % 2 === 0 ? 0 : -0.035;
  const long = n.steps >= 8 ? 0.03 : n.steps <= 2 ? -0.02 : 0;
  return clamp(base + span * (p - 0.5) + down + long + jit(`mv:${n.section}:${n.idx}`, 0.025), 0.08, 1);
}

/** time of a 16th step inside a section with MPC swing (pct 50 = straight) */
export function swingStep(sec, step, pct = 50) {
  const off = step % 2 === 1 ? (2 * pct) / 100 - 1 : 0;
  return sec.step(step + off);
}

// ------------------------------------------------------------------ stem surgery
function writeFrames(stem, frame, L, R) {
  const n = L.length;
  let i = 0;
  while (i < n) {
    const f = frame + i, ci = Math.floor(f / CHUNK), off = f - ci * CHUNK, m = Math.min(n - i, CHUNK - off);
    let c = stem.chunks[ci];
    if (!c) {
      let nz = false;
      for (let k = 0; k < m; k++) if (L[i + k] !== 0 || R[i + k] !== 0) { nz = true; break; }
      if (!nz) { i += m; continue; }
      c = stem._chunk(ci);
    }
    c[0].set(L.subarray(i, i + m), off); c[1].set(R.subarray(i, i + m), off);
    i += m;
  }
}

/** read [t0, t1) of a stem, let fn(L, R, frame0) process it in place, write it back */
export function processStem(studio, stem, t0, t1, fn) {
  const sr = studio.sr, f0 = Math.max(0, Math.floor(t0 * sr)), f1 = Math.ceil(t1 * sr), n = f1 - f0;
  if (n <= 0 || !stem.hasData(f0, n)) return;
  const L = new Float32Array(n), R = new Float32Array(n);
  stem.read(f0, n, L, R);
  fn(L, R, f0);
  writeFrames(stem, f0, L, R);
}

/** multiply a stem by gain(t) over [t0, t1) */
export function shapeStem(studio, stem, t0, t1, gainAt) {
  const sr = studio.sr;
  processStem(studio, stem, t0, t1, (L, R, f0) => {
    for (let i = 0; i < L.length; i++) { const g = gainAt((f0 + i) / sr); L[i] *= g; R[i] *= g; }
  });
}

/**
 * Cue silences: every stem written by this part stops dead (4 ms fade) at each cues.silenceBeats window and stays
 * at digital zero until the drop downbeat. Reverb/delay tails live on the mixer returns, so they keep ringing.
 */
export function gateSilences(studio, stems, fade = 0.004) {
  const list = stems || [...studio.stems.values()].filter((s) => s.part === studio.partName);
  for (const st of list) for (const z of studio.silences) {
    // stop dead at the window start; a 3 ms release at the downbeat so notes that speak a hair early don't click
    shapeStem(studio, st, z.start - fade, z.end + 0.003, (t) => (t < z.start ? clamp((z.start - t) / fade, 0, 1) : t < z.end ? 0 : clamp((t - z.end) / 0.003, 0, 1)));
  }
}

/**
 * Bake player-owned effects (pedals, amp, filter sweeps) into a phrase: render plays into a local buffer, run fx,
 * mix into the stem. plays: [{ inst, note: { time, midi, vel, dur, pan, db, gain, ... } }]. fx: createFx configs or
 * { process } objects. Notes are logged for the piano roll.
 */
export function bake(studio, stemName, plays, fx = [], { tail = 2.5, log = true } = {}) {
  if (!plays.length) return;
  const E = studio.engine, sr = studio.sr;
  let t0 = Infinity, t1 = -Infinity;
  for (const p of plays) { t0 = Math.min(t0, p.note.time); t1 = Math.max(t1, p.note.time + (p.note.dur ?? 0.5) + (p.inst.tail ?? 0.5)); }
  if (log) for (const p of plays) studio.log({ stem: stemName, time: p.note.time, dur: p.note.dur ?? 0.2, midi: p.note.midi ?? 60, vel: p.note.vel ?? 0.8 });
  if (!studio.inRange(t0 - 0.5, t1 + tail)) return;
  const f0 = Math.max(0, Math.floor((t0 - 0.25) * sr)), n = Math.ceil((t1 + tail) * sr) - f0;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (const { inst, note } of plays) {
    const s = asStereo(inst.render(note)); if (!s) continue;
    const g = (note.gain ?? 1) * (note.db !== undefined ? Math.pow(10, note.db / 20) : 1);
    const [gl, gr] = s.mono ? panGains(note.pan ?? 0) : balanceGains(note.pan ?? 0);
    const at = Math.round((note.time + s.offset) * sr) - f0;
    for (let i = Math.max(0, -at); i < s.L.length && at + i < n; i++) { L[at + i] += s.L[i] * gl * g; R[at + i] += s.R[i] * gr * g; }
  }
  for (const cfg of fx) {
    const f = cfg.process && !cfg.type ? cfg : E.fx.createFx(cfg, { timeline: studio.timeline, sr, fast: studio.fast });
    f.process(L, R, 0, n, f0);
  }
  studio.stem(stemName).addFrames(f0, L, R, 1, 1);
}

/** wraps an instrument so notes get a custom attack swell and release fade (choir pads, swells) */
export class Shaped {
  constructor(inst, { attack = 0.2, release = 0.5 } = {}) { this.inst = inst; this.attack = attack; this.release = release; this.name = inst.name; this.tail = (inst.tail ?? 0.3) + release; this.opts = {}; }
  render(note) {
    const a = note.attack ?? this.attack, r = note.release ?? this.release, sr = 44100;
    const res = asStereo(this.inst.render({ ...note, dur: (note.dur ?? 1) + r }));
    const z = Math.round(-res.offset * sr), na = Math.max(1, Math.round(a * sr)), rs = z + Math.round((note.dur ?? 1) * sr), nr = Math.max(1, Math.round(r * sr));
    const chans = res.L === res.R ? [res.L] : [res.L, res.R];
    for (const X of chans) for (let i = 0; i < X.length; i++) {
      let g = 1;
      if (i < z + na) { const x = clamp((i - z + na * 0.15) / (na * 1.15), 0, 1); g = x * x * (3 - 2 * x); }
      if (i >= rs) { const x = clamp(1 - (i - rs) / nr, 0, 1); g *= x * x; }
      X[i] *= g;
    }
    return { L: res.L, R: res.R, offset: res.offset };
  }
}

/** simple deterministic chord-tone arpeggio pool: chord tones + 9th in [lo, hi] */
export function arpPool(chord, lo, hi, { ninth = true } = {}) {
  const pcs = new Set(chord.pcs);
  if (ninth && !chord.intervals.includes(1) && !chord.intervals.includes(13)) pcs.add((chord.root + 2) % 12);
  const out = [];
  for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) out.push(m);
  return out;
}

/** energy-scaled velocity */
export const ev = (sec, v, amt = 0.25) => clamp(v * (1 - amt + amt * (0.5 + sec.energy)), 0.05, 1);

export { parseChord, pcAtOrAbove, clamp };
