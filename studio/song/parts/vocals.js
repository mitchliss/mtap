// Musician A - VOCALS (wordless only: choirs and chops, per the brief).
//   choir       SATB choir pads / chords / harmony ("ah", "oh", "oo"): intro swell (breathing), verse pads,
//               drop2b chords, breakdown, build3 crescendo, drop3 chords, tag hits + final chord
//   choir_lead  the tune sung by a section: verse1b "oo" unison, drop1b "oh", verse2 bars 5-8 "oo",
//               breakdown bars 5-8 / build3 / tag sopranos "ah"
//   chops       pitched vocal chops (sliced sung vowels, see instruments/a-chops.js): intro airy double, build teases
//               (low-pass baked) and rolls, drop2 lead (+12, +24 air, 0 "oh", re-chop stutters), drop2b call (the
//               funk guitar answers), drop3b/3c answers inside the long notes
//   chops_echo  ping-pong dotted-8th throws on the held notes (wet only: a delay tail, so NOT gated in the silences)
import { upper, leadLine, gateSilences, bake, shapeStem, ev, clamp, pcAtOrAbove, Shaped } from '../instruments/a-kit.js';
import { Chops } from '../instruments/a-chops.js';

export const order = 60;

export default function vocals(studio) {
  const E = studio.engine, T = E.theory;
  const S = (n) => studio.section(n);
  const chordAt = (t) => studio.chordAt(t);
  const ok = (t) => !studio.inSilence(t);
  const stCh = studio.stem('choir'), stLd = studio.stem('choir_lead'), stCp = studio.stem('chops');

  const mk = (type, extra = {}) => new E.inst.Choir({ type, singers: 4, width: 0.9, detune: 12, timing: 0.016, breath: 0.4, brightness: 0.62, seed: `a-${type}`, ...extra });
  const SOP = mk('soprano'), ALT = mk('alto'), TEN = mk('tenor', { formantShift: 1.05 }), BAS = mk('bass', { singers: 3, formantShift: 0.95, width: 0.6 });
  const pad = (inst, a = 0.3, r = 0.55) => new Shaped(inst, { attack: a, release: r });
  const line = (inst) => new Shaped(inst, { attack: 0.07, release: 0.22 });
  // cut 2: a round-robin sampler, 4 sung takes per (pitch, vowel), random slice offsets (instruments/a-chops.js)
  const CHOP = new Chops({ seed: 'a-chop', formantShift: 1.19, breath: 0.15, doubles: 2, rr: 4 });
  const AIRY = new Chops({ seed: 'a-airy', formantShift: 1.22, breath: 0.45, doubles: 2, drive: 1.2, rr: 4 });

  const play = (stem, inst, note) => { if (ok(note.time) && note.dur > 0.02) stem.play(inst, note); };
  const voiceFor = (m) => (m >= 60 ? ALT : TEN);

  // ---------------------------------------------------------------- choir helpers
  function chordPad(secName, vowel, { vel = 0.5, attack = 0.3, release = 0.55, top = 67, max = 4, from = 0, to = 99, holdSame = true, db = 0 } = {}) {
    const sec = S(secName), cs = studio.chordsIn(secName);
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], bar = Math.floor((c.halfBar - sec.startBar * 2) / 2);
      if (bar < from || bar >= to) continue;
      if (holdSame && i > 0 && cs[i - 1].symbol === c.symbol && Math.floor((cs[i - 1].halfBar - sec.startBar * 2) / 2) >= from) continue;
      let end = c.end; for (let j = i + 1; holdSame && j < cs.length && cs[j].symbol === c.symbol; j++) end = cs[j].end;
      const notes = upper(c, sec).filter((m) => m <= top + sec.transpose).slice(-max);
      for (const m of notes) play(stCh, pad(voiceFor(m), attack, release), { time: c.start, midi: m, vel, dur: end - c.start + 0.02, vowel, db });
    }
  }
  /** the tune sung by a choir section: legato, small portamento into stepwise notes */
  function sungLine(secName, inst, vowel, { vel = 0.6, from = 0, to = 99, octave = 0, finalDur, db = 0, anticipate = false } = {}) {
    const sec = S(secName), notes = leadLine(studio, secName, { octave, anticipate });
    notes.forEach((n, i) => {
      const bar = Math.floor(n.sectionStep / 16);
      if (bar < from || bar >= to) return;
      const step = n.prevMidi !== null && Math.abs(n.midi - n.prevMidi) <= 2 && n.midi !== n.prevMidi && n.gapBefore < 0.02;
      const last = i === notes.length - 1;
      const v = clamp(vel + 0.08 * ((n.midi - 62 - sec.transpose) / 12) + (n.steps >= 8 ? 0.04 : 0), 0.1, 1);
      play(stLd, line(inst), { time: n.time, midi: n.midi, vel: ev(sec, v, 0.15), dur: last && finalDur ? finalDur : n.dur + 0.04, vowel, glideFrom: step ? n.prevMidi : undefined, glideTime: 0.07, db });
    });
  }
  /** alto / tenor (/ bass) harmony under a sung melody: one sustained chord tone per voice per half-bar */
  function harmony(secName, vowel, { vel = 0.55, from = 0, to = 99, bass = false, attack = 0.15, db = 0 } = {}) {
    const sec = S(secName);
    let pa = null, pt = null;
    for (const c of studio.chordsIn(secName)) {
      const bar = Math.floor((c.halfBar - sec.startBar * 2) / 2);
      if (bar < from || bar >= to) continue;
      const mel = studio.melody(secName).filter((n) => n.time < c.end - 0.01 && n.end > c.start + 0.01);
      const ceil = mel.length ? Math.min(...mel.map((n) => n.midi)) - 3 : 67;
      const tones = []; for (let m = Math.min(ceil, 69 + sec.transpose); m >= 47; m--) if (c.pcs.includes(m % 12)) tones.push(m);
      const near = (prev, lo, hi) => { const cand = tones.filter((m) => m >= lo && m <= hi); if (!cand.length) return null; if (prev === null) return cand[0]; return cand.reduce((a, b) => (Math.abs(b - prev) < Math.abs(a - prev) ? b : a)); };
      const a = near(pa, 55, 69 + sec.transpose); const t = a !== null ? near(pt, 48, a - 3) : null;
      if (a !== null) play(stCh, pad(ALT, attack, 0.4), { time: c.start, midi: a, vel, dur: c.end - c.start + 0.03, vowel, db });
      if (t !== null) play(stCh, pad(TEN, attack, 0.4), { time: c.start, midi: t, vel: vel * 0.95, dur: c.end - c.start + 0.03, vowel, db });
      if (bass) play(stCh, pad(BAS, attack, 0.4), { time: c.start, midi: pcAtOrAbove(c.bass, 40), vel: vel * 0.9, dur: c.end - c.start + 0.03, vowel, db });
      pa = a; pt = t;
    }
  }

  // ---------------------------------------------------------------- chop helpers
  const HIGH_D = (sec) => 74 + sec.transpose;
  function vowelFor(n, sec, k) {
    const inCall = n.midi === HIGH_D(sec) + 12 * k && n.steps === 4 && n.anthemBar % 2 === 0 && n.anthemBar >= 8 && n.anthemBar <= 11;
    if (inCall) return ['oh', 'ah', 'oh'][Math.max(0, Math.round((n.sectionStep % 16) / 4) - 1) % 3];
    if (n.steps >= 8) return 'ah';
    if ([3, 7, 15, 19].includes(n.anthemBar)) return 'oh';   // cadence figures
    if (n.steps <= 2) return n.idx % 2 ? 'ah' : 'ay';
    return 'ah';
  }
  /**
   * chop plays for a melodic span. layers: [{ octave, db, vowel? }]. Long notes (>= 8 sixteenths) by mode:
   *   'hold'    one chop, held (gate 0.97)                                  - intro, build teases
   *   'stutter' re-chopped as 8th stutters "ah-ah-ah" (the drop 2 signature) - drop2
   *   'call'    the chop sings only the note's first 8th; the funk guitar answers in the rest - drop2b
   *   'answer'  ONLY the long notes, as 8th stutters from the note's SECOND 8th; silent on short notes - drop3b/3c
   * Phrase heads get the soft "h" onset; chops held for a quarter note or more get the vowel drift (a-chops.js).
   */
  function chopPlays(secName, { inst = CHOP, layers = [{ octave: 1, db: 0 }], mode = 'hold', vel = 0.85, velTo = null, from = 0, to = 99, anticipate = false, throws = null } = {}) {
    const sec = S(secName), plays = [];
    const q = sec.step(4) - sec.step(0);
    const line = leadLine(studio, secName, { anticipate });
    line.forEach((n, i) => {
      const bar = Math.floor(n.sectionStep / 16);
      if (bar < from || bar >= to || !ok(n.time)) return;
      // drop2b call: the A that the refrain-B push shortens to 7 sixteenths is still a held note the guitar answers
      // (guitar.js uses the same rule, so call and response stay in step)
      const long = n.steps >= (mode === 'call' ? 7 : 8);
      if (mode === 'answer' && !long) return;
      // velTo: a crescendo across the span (vel at its first step -> velTo at its last), e.g. the build2 tease
      const span = Math.max(1, (Math.min(to, sec.bars) - from) * 16), vb = velTo === null ? vel : vel + (velTo - vel) * clamp((n.sectionStep - from * 16) / span, 0, 1);
      const v = clamp(vb + 0.06 * ((n.midi - 62 - sec.transpose) / 12) + (n.sectionStep % 4 === 0 ? 0.03 : 0), 0.1, 1);
      const L8 = n.dur / Math.max(1, n.steps / 2);
      let parts;
      if (long && mode === 'stutter') parts = Array.from({ length: Math.floor(n.steps / 2) }, (_, k) => ({ t: n.time + k * L8, d: L8, g: 0.72, v: v * (1 - 0.06 * k) }));
      else if (long && mode === 'answer') parts = Array.from({ length: Math.floor(n.steps / 2) - 1 }, (_, k) => ({ t: n.time + (k + 1) * L8, d: L8, g: 0.72, v: v * (1 - 0.05 * k) }));
      else if (long && mode === 'call') parts = [{ t: n.time, d: L8, g: 0.8, v }];
      else parts = [{ t: n.time, d: n.dur, g: long ? 0.97 : 0.8, v }];
      const prev = line[i - 1];
      const head = !prev || prev.steps >= 8 || n.gapBefore > 0.05 || mode === 'answer' || Math.floor(prev.sectionStep / 16) < from;
      layers.forEach((L, li) => {
        const m = n.midi + 12 * L.octave;
        const vow = L.vowel || vowelFor(n, sec, 0);
        parts.forEach((p, k) => {
          if (!ok(p.t)) return;
          const stut = parts.length > 1 || mode === 'answer';
          plays.push({ inst, note: { time: p.t, midi: m, vel: p.v, dur: p.d, gate: p.g, vowel: k && stut ? 'ah' : vow, db: L.db,
            h: head && k === 0 && li === 0, drift: p.d >= 0.95 * q } });   // held = a quarter note or longer
        });
        if (throws && L.octave === 1 && long) throws.push({ inst, note: { time: parts[0].t, midi: m, vel: v, dur: parts[0].d, gate: parts[0].g, vowel: vow, db: -3 } });
      });
    });
    return plays;
  }
  /** a chop roll: segments [{ from bar, to bar, div (16ths per hit), vowel? (overrides the roll's vowel) }], pitch rising
   *  semis over the roll.
   *  cut 2: the roll ends at velocity 0.7 (the build never out-shines the drop) */
  function chopRoll(secName, segs, { midi0, semis = 12, v0 = 0.45, v1 = 0.7, vowel = 'oh', inst = CHOP }) {
    const sec = S(secName), plays = [];
    const s0 = segs[0].from * 16, s1 = segs[segs.length - 1].to * 16;
    for (const sg of segs) for (let s = sg.from * 16; s < sg.to * 16; s += sg.div) {
      const t = sec.step(s); if (!ok(t)) continue;
      const p = (s - s0) / (s1 - s0);
      plays.push({ inst, note: { time: t, midi: midi0 + semis * p, vel: v0 + (v1 - v0) * p, dur: sec.step(s + sg.div) - t, gate: sg.div >= 4 ? 0.62 : 0.7, vowel: sg.vowel || vowel } });
    }
    return plays;
  }
  const lpSweep = (a, b, from, to) => ({ type: 'filter', mode: 'lp', freq: from, q: 0.9, slope: 24, sweep: { from, to, at: a, until: b } });
  const throwsFx = [{ type: 'delay', sync: '1/8d', feedback: 0.38, mix: 1, pingpong: true, hp: 400, lp: 6000 }];

  // ================================================================== INTRO: choir "ah" swell + breathing; airy chop double +12; throw on the held A
  {
    const sec = S('intro');
    chordPad('intro', 'a', { vel: 0.5, attack: 1.5, release: 0.6, top: 65, db: -10 });
    shapeStem(studio, stCh, sec.start, sec.end + 0.4, (t) => {
      if (t >= sec.end) return 1;
      const b = studio.timeline.secToBeat(t), ph = b - Math.floor(b);
      return Math.pow(10, (-4 * Math.exp(-ph / 0.18) * Math.min(1, ph / 0.03)) / 20);
    });
    const throws = [];
    const plays = chopPlays('intro', { inst: AIRY, vel: 0.45, throws, layers: [{ octave: 1, db: -5 }] });
    bake(studio, 'chops', plays, []);
    bake(studio, 'chops_echo', throws, throwsFx, { tail: 3, log: false });
  }

  // ================================================================== VERSE 1: choir "oo" pad, barely there
  chordPad('verse1', 'u', { vel: 0.42, attack: 0.35, top: 65, max: 3, db: -15 });
  // ================================================================== VERSE 1b: "oo" pad + the choir doubles the tune in unison
  chordPad('verse1b', 'u', { vel: 0.42, attack: 0.3, top: 65, max: 3, db: -13 });
  sungLine('verse1b', ALT, 'u', { vel: 0.6, db: -9 });

  // ================================================================== BUILD 1: the call teased (LP 900 -> 6k), then the "oh" roll D5 -> D6
  {
    const sec = S('build1');
    bake(studio, 'chops', chopPlays('build1', { vel: 0.8, to: 2 }), [lpSweep(sec.start, sec.at(2), 900, 6000)]);
    bake(studio, 'chops', chopRoll('build1', [{ from: 2, to: 3, div: 2 }, { from: 3, to: 4, div: 1 }], { midi0: 74, semis: 12, v0: 0.58, vowel: 'ah' }), []); // cut 4: 'ah' like build2 (label: build1 bar 3 mid hole)
  }

  // ================================================================== DROP 1b: choir "oh" doubles the tune at 0 (wide)
  // cut 2: bars 5-8 only (bars 1-4 belong to the lead guitar alone; exposure rule, brief section 8)
  sungLine('drop1b', ALT, 'o', { vel: 0.62, db: -4, anticipate: true, from: 4 });
  // ================================================================== VERSE 2: choir "oo" on the tune from bar 5
  sungLine('verse2', ALT, 'u', { vel: 0.56, from: 4, db: -7 });

  // ================================================================== BUILD 2: refrain-A hook on chops (LP 1k -> 5k), then the roll
  // CUT 3 (SESSION-3 A3, brief section 6 "Build rise"): the tease low-pass starts at 1 kHz (700 Hz cost 4.4 LU on a
  // phone in bar 1), and the roll starts in 8ths at bar 5 (cut 2: quarters) so bars 5-6 keep the 0.8-3 kHz band.
  // The build2 roll sings "ah", not build1's "oh": on D5-F5 the "oh" puts its energy on the fundamental (250-800 Hz)
  // and sits ~14 dB lower in 0.8-3 kHz than "ah" (measured on 8 chops at 74 / 77; equal above ~G#5). In cut 2 the
  // vocals' 0.8-3 kHz band fell 10-17 dB from the tease (bars 3-4, at +12) into the roll's first bars (an octave down).
  {
    const sec = S('build2');
    // the tease is sung as a crescendo (0.72 -> 0.86 across bars 1-4; cut 2: a flat 0.82) so the build starts a little
    // lower and grows (brief section 6 "Build rise": bar 7 >= bar 1 + 1.5 LU), as a singer would deliver the line
    bake(studio, 'chops', chopPlays('build2', { vel: 0.72, velTo: 0.86, to: 4 }), [lpSweep(sec.start, sec.at(4), 1000, 5000)]);
    bake(studio, 'chops', chopRoll('build2', [{ from: 4, to: 7, div: 2 }, { from: 7, to: 8, div: 1 }], { midi0: 74, semis: 12, v0: 0.58, vowel: 'ah' }), []);
  }

  // ================================================================== DROP 2 / 2b: THE VOCAL-CHOP DROP
  // drop2: the stutter drop. drop2b: CALL AND RESPONSE - the chops sing the phrase heads and the short notes, and on the
  // long notes only the first 8th; the funk guitar answers in the rest of the note (guitar.js). No throws in drop2b:
  // the answer lives where the echo would be. The +24 air layer sits at -16 dB (cut 3, brief section 8 "Chop treble";
  // cut 1: -10, cut 2: -14). At f0 up to 2.3 kHz the formants collapse into a whistle; if a voice has to give, it is this one.
  for (const name of ['drop2', 'drop2b']) {
    const throws = name === 'drop2' ? [] : null;
    const plays = chopPlays(name, { mode: name === 'drop2' ? 'stutter' : 'call', anticipate: true, throws,
      layers: [{ octave: 1, db: 0 }, { octave: 2, db: -16 }, { octave: 0, db: -6, vowel: 'oh' }] });
    bake(studio, 'chops', plays, []);
    if (throws) bake(studio, 'chops_echo', throws, throwsFx, { tail: 3, log: false });
  }
  chordPad('drop2b', 'a', { vel: 0.58, attack: 0.12, release: 0.35, holdSame: false, db: -2 });

  // ================================================================== BREAKDOWN: "oo" chords (1-4), SATB "ah" with the tune in the sopranos (5-8)
  chordPad('breakdown', 'u', { vel: 0.5, attack: 0.5, release: 0.7, to: 4, db: -7 });
  sungLine('breakdown', SOP, 'a', { vel: 0.66, from: 4, db: -3 });
  harmony('breakdown', 'a', { vel: 0.5, from: 4, attack: 0.25, db: -5 });

  // ================================================================== BUILD 3: full SATB (1-4), choir crescendo on the rise (5-8), chop roll
  {
    const sec = S('build3');
    sungLine('build3', SOP, 'a', { vel: 0.72, to: 4 });
    harmony('build3', 'a', { vel: 0.58, to: 4, bass: true, db: -4 });
    // cut 2: the choir crescendo tops out at 0.8 (cut 1: 0.92) - the build rises by density and pitch, not level
    const spans = [[sec.at(4), sec.at(6), 'Bbadd9', 0.5], [sec.at(6), sec.at(7), 'Cadd9', 0.62], [sec.at(7), sec.at(7, 1), 'Dsus4', 0.72], [sec.at(7, 1), sec.at(7, 2), 'D', 0.8]];
    for (const [a, b, sym, v] of spans) {
      const ch = T.parseChord(sym);
      const notes = sym === 'D' ? [50, 57, 62, 66, 69] : sym === 'Dsus4' ? [50, 57, 62, 67, 69] : [pcAtOrAbove(ch.root, 43), ...T.voiceLead(ch, null, { low: 55, high: 72, count: 4 })];
      for (const m of notes) play(stCh, pad(m < 52 ? BAS : m < 60 ? TEN : m < 67 ? ALT : SOP, sym === 'Bbadd9' ? 1.2 : 0.08, 0.3), { time: a, midi: m, vel: v, dur: b - a + 0.01, vowel: 'a', db: -3 });
    }
    // cut 3 (brief section 6 "Build rise"): the 8th-note half of the roll (bars 5-6, D5-F5) sings "ah" - on "oh" at that
    // pitch the chop's energy sits on its fundamental, ~14 dB lower in 0.8-3 kHz - and the 16th half (bars 7-8, the
    // drop-delta ceiling window) keeps cut 2's "oh", where the two vowels measure alike.
    bake(studio, 'chops', chopRoll('build3', [{ from: 4, to: 6, div: 2, vowel: 'ah' }, { from: 6, to: 8, div: 1 }], { midi0: 74, semis: 12, v0: 0.42, v1: 0.7 }), []);
  }

  // ================================================================== DROP 3 / 3b / 3c: choir "ah" chords; drop 2's chops return in 3b/3c
  for (const name of ['drop3', 'drop3b', 'drop3c']) {
    const sec = S(name), dec = name === 'drop3c' ? sec.at(7, 2) : Infinity;
    chordPad(name, 'a', { vel: 0.62, attack: 0.12, release: 0.35, holdSame: false, to: name === 'drop3c' ? 7 : 99 });
    if (name === 'drop3c') {
      for (const c of studio.chordsIn(name).filter((c) => Math.floor((c.halfBar - sec.startBar * 2) / 2) === 7)) {
        const d = c.start >= dec - 0.01 ? S('tag').start - c.start : c.end - c.start;
        for (const m of upper(c, sec)) play(stCh, pad(voiceFor(m), 0.08, 0.35), { time: c.start, midi: m, vel: 0.66, dur: d, vowel: 'a' });
      }
    }
    if (name !== 'drop3') {
      // cut 2: the chops ANSWER inside the long notes only (8th stutters from the note's second 8th, under the held
      // saw), never a unison with the short notes; on the supersaw grid (no jitter); +12 only (no low-mid "oh" layer)
      const throws = [];
      bake(studio, 'chops', chopPlays(name, { mode: 'answer', throws, vel: 0.84, layers: [{ octave: 1, db: 0 }] }).filter((p) => p.note.time < dec - 0.01), []);
      bake(studio, 'chops_echo', throws.filter((p) => p.note.time < dec - 0.01), throwsFx, { tail: 3, log: false });
    }
  }

  // ================================================================== TAG: SATB broadening; the FINAL chord rings out
  {
    const sec = S('tag');
    const fin = studio.cues.finalHit || { bar: 2, beat: 3 };
    const tFinal = sec.at(fin.bar - 1, fin.beat - 1);
    sungLine('tag', SOP, 'a', { vel: 0.78, finalDur: 2.8 });
    let pa = null;
    for (const c of studio.chordsIn('tag')) {
      if (c.start >= tFinal - 0.01) {
        for (const [m, inst] of [[52, BAS], [55, TEN], [59, TEN], [66, ALT], [71, SOP]]) play(stCh, pad(inst, 0.06, 1.2), { time: c.start, midi: m, vel: 0.8, dur: 2.8, vowel: 'a' });
        continue;
      }
      const ch = upper(c, sec);
      for (const m of ch) play(stCh, pad(voiceFor(m), 0.06, 0.3), { time: c.start, midi: m, vel: 0.74, dur: c.end - c.start + 0.02, vowel: 'a' });
      play(stCh, pad(BAS, 0.06, 0.3), { time: c.start, midi: pcAtOrAbove(c.bass, 40), vel: 0.7, dur: c.end - c.start + 0.02, vowel: 'a' });
      pa = ch;
    }
    void pa;
  }

  gateSilences(studio, [stCh, stLd, stCp, studio.stem('chops_echo')]);
  const end = studio.songEnd;
  for (const s of [stCh, stLd, stCp, studio.stem('chops_echo')]) shapeStem(studio, s, end - 2.2, end + 8, (t) => (t >= end - 0.2 ? 0 : Math.pow(clamp((end - 0.2 - t) / 2, 0, 1), 2)));
}
