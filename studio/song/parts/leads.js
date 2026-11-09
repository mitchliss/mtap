// Musician A - LEADS & SYNTH GLOSS + STRINGS (the gloss on top of the real-instrument body).
//   lead       9-voice supersaw lead (+ centre saw focus; drop3 adds a -14 dB square an octave down): breakdown
//              (soft, LP 1.5k), build3 (LP opening from 2 kHz), drop3/3b/3c (+12 with a 0-octave layer), tag
//   pluck      soft saw pluck: drop1 composite-lead layer (+12), drop2 attack transients under the chops (+12)
//   pluck_arp  drop3c 16th sparkle arpeggio (+24, LP ~4 kHz)
//   bells      FM bells: breakdown D6 "ice" pedal, drop3b/3c melody at +24, drop3c E6 pedal
//   chords     supersaw stabs in the builds + the drop3 supersaw wall + tag hits
//   pad        warm pad (intro swell + quarter-note breathing, verse1b, drop1) and the drop2 supersaw pad
//   strings    6-player string section: breakdown ice pedal + chords, build3 swells, drop3c E6 pedal, tag chords
//              (engine Strings) + CUT 2: the drop3/3b/3c and tag melody as ONE sustained legato line at +12 on the
//              long notes only (>= 4 sixteenths), portamento, no re-attack, never at -12 (instruments/a-strings.js)
//
// CUT 2 (SESSION-2 A1/A3/A5/A6/A8): thin builds (stab vel <= 0.75, cutoff <= 6 kHz), brighter drop synths (lead
// 9.5 kHz / env 0.7, wall 12 kHz, pluck 1.4 kHz), a noise-air layer on LEAD3, drop3 0-octave layer -10 dB, legato
// strings, full-length drop2 plucks, the drop1b pluck rests in bars 1-4, a D7 bell ping over the breakdown pedal.
import { upper, leadLine, jit, gateSilences, shapeStem, ev, clamp, pcAtOrAbove, arpPool } from '../instruments/a-kit.js';
import { LegatoStrings } from '../instruments/a-strings.js';

export const order = 40;

export default function leads(studio) {
  const E = studio.engine, T = E.theory;
  const S = (n) => studio.section(n);
  const chordAt = (t) => studio.chordAt(t);
  const ok = (t) => !studio.inSilence(t);
  const play = (stem, inst, note) => { if (ok(note.time) && note.dur > 0.005) stem.play(inst, note); };
  const st = { lead: studio.stem('lead'), pluck: studio.stem('pluck'), arp: studio.stem('pluck_arp'), bells: studio.stem('bells'),
    chords: studio.stem('chords'), pad: studio.stem('pad'), strings: studio.stem('strings') };

  // ---------------------------------------------------------------- instruments
  const leadOsc = [{ type: 'supersaw', voices: 9, detune: 0.42, mix: 0.78, spread: 0.6 }, { type: 'saw', level: 0.3 }];
  // cut 2: 9.5 kHz with filter envelope 0.7 (cut 1: 6.8 kHz / 0.55) - the drop lead carries its own top
  const leadBase = { filter: { type: 'lp', cutoff: 9500, res: 0.7, env: 0.7, keytrack: 0.15, slope: 12, a: 0.002, d: 0.25, s: 0.35, r: 0.2 },
    amp: { a: 0.004, d: 0.25, s: 0.85, r: 0.22 }, drive: 3, glide: 0.025, vibrato: { rate: 5.2, depth: 6, delay: 0.45 } };
  const LEAD = new E.inst.Synth({ osc: leadOsc, ...leadBase, seed: 'a-lead' }, { name: 'supersaw-lead' });
  const LEAD3 = new E.inst.Synth({ osc: [...leadOsc, { type: 'square', octave: -1, level: 0.2 }], ...leadBase, seed: 'a-lead3' }, { name: 'supersaw-lead-big' });
  // the big-room lead's shimmer: quiet noise HP 8 kHz gated by LEAD3's own amp envelope (played at -24 dB)
  const LEADAIR = new E.inst.Synth({ osc: [{ type: 'noise' }], filter: { type: 'hp', cutoff: 8000, env: 0, keytrack: 0, slope: 24, res: 0.6 },
    amp: { ...leadBase.amp }, drive: 0, seed: 'a-leadair' }, { name: 'lead-air' });
  const PLUCK = new E.inst.Synth({ osc: [{ type: 'saw', detune: 7, level: 0.6 }, { type: 'saw', detune: -7, level: 0.6 }, { type: 'square', octave: -1, level: 0.25 }],
    filter: { type: 'lp', cutoff: 1400, res: 0.9, env: 3.2, keytrack: 0.3, slope: 12, a: 0.001, d: 0.4, s: 0, r: 0.1 },
    amp: { a: 0.001, d: 1.2, s: 0, r: 0.12 }, drive: 1.5, seed: 'a-pluck' }, { name: 'pluck' });
  const BELL = new E.inst.Bell({ ratio: 3.5, index: 3.5, decay: 2.2, seed: 'a-bell' });
  const STAB = new E.inst.Synth('stab', { seed: 'a-stab', name: 'supersaw-stab' });
  const WALL = new E.inst.Synth({ osc: [{ type: 'supersaw', voices: 9, detune: 0.5, mix: 0.85, spread: 0.95 }],
    filter: { type: 'lp', cutoff: 12000, res: 0.6, env: 0.4, keytrack: 0, slope: 12, a: 0.003, d: 0.4, s: 0.6, r: 0.2 },
    amp: { a: 0.003, d: 0.3, s: 0.92, r: 0.18 }, drive: 2, seed: 'a-wall' }, { name: 'supersaw-wall' });
  const WALLHIT = new E.inst.Synth({ osc: [{ type: 'supersaw', voices: 9, detune: 0.5, mix: 0.85, spread: 0.95 }, { type: 'supersaw', octave: 1, voices: 7, detune: 0.35, level: 0.35, spread: 1 }],
    filter: { type: 'lp', cutoff: 7000, res: 0.6, env: 0.6, keytrack: 0, slope: 12, a: 0.003, d: 1.2, s: 0.45, r: 1.4 },
    amp: { a: 0.004, d: 0.6, s: 0.85, r: 1.4 }, drive: 2, seed: 'a-hit' }, { name: 'supersaw-hit' });
  const padCfg = (a, cut) => ({ osc: [{ type: 'supersaw', voices: 5, detune: 0.18, mix: 0.5, spread: 0.7 }, { type: 'wt:warm', level: 0.3, detune: 5 }],
    filter: { type: 'lp', cutoff: cut, res: 0.5, env: 0.3, keytrack: 0.1, slope: 24, a: 0.6, d: 1.5, s: 0.8, r: 1 },
    amp: { a, d: 0.5, s: 0.95, r: 1.2 }, drive: 0 });
  const PAD = new E.inst.Synth({ ...padCfg(0.4, 2200), seed: 'a-pad' }, { name: 'warm-pad' });
  const PADSWELL = new E.inst.Synth({ ...padCfg(1.5, 2200), seed: 'a-padsw' }, { name: 'warm-pad-swell' });
  const SAWPAD = new E.inst.Synth('supersaw-pad', { seed: 'a-sawpad', name: 'supersaw-pad', filter: { cutoff: 3500 } });
  const STR = new E.inst.Strings({ players: 6, seed: 'a-str', brightness: 0.66, width: 0.9 });
  const VLN = new E.inst.Strings({ players: 5, seed: 'a-vln', brightness: 0.5, width: 0.8, section: 'violins', vibrato: 0.8 });
  const LSTR = new LegatoStrings({ players: 6, seed: 'a-lstr', width: 0.9, glide: 0.05, swellFrom: 2000, swellTo: 6000, swellTime: 0.22 });

  const lfoCut = (base, t) => base * (1 + 0.15 * Math.sin(2 * Math.PI * 0.1 * t));
  const lowLayer = (c, sec) => { const r = pcAtOrAbove(c.root, 46 + sec.transpose); return [r, r + 7]; };
  // the build rule (brief section 4/6): a build stab never out-shines the drop
  const BUILD_VEL = 0.75, BUILD_CUT = 6000;
  const bv = (v) => clamp(v, 0, BUILD_VEL), bc = (f) => Math.min(BUILD_CUT, f);

  /**
   * The melody strings (brief section 9 "Strings"): only the notes of 4 or more sixteenths, at +12, and each run of
   * consecutive long notes is ONE phrase on one bow (portamento between pitches, bow changes on repeats, a 2 -> 6 kHz
   * brightness swell per note). On the supersaw grid: no timing jitter. Notes are logged one by one for the roll.
   */
  function stringLine(name, { until = Infinity, vel = 0.62, finalDur = null } = {}) {
    const all = leadLine(studio, name, { octave: 1 }).filter((n) => n.time < until - 0.01);
    const phrases = [];
    let cur = null;
    all.forEach((n, i) => {
      if (n.steps < 4 || !ok(n.time)) { cur = null; return; }
      const nn = { ...n, dur: finalDur && i === all.length - 1 ? finalDur : n.dur };
      if (cur && Math.abs(n.time - cur.end) < 0.02) { cur.notes.push(nn); cur.end = nn.time + nn.dur; }
      else { cur = { notes: [nn], end: nn.time + nn.dur }; phrases.push(cur); }
    });
    for (const ph of phrases) {
      const t0 = ph.notes[0].time, avg = ph.notes.reduce((a, x) => a + x.midi, 0) / ph.notes.length;
      const notes = ph.notes.map((x) => ({ t: x.time - t0, midi: x.midi, dur: x.dur, vel: clamp(0.94 + 0.1 * ((x.midi - avg) / 12) + (x.steps >= 8 ? 0.05 : 0), 0.8, 1.1) }));
      const dur = ph.end - t0 + 0.03;
      for (const x of ph.notes) studio.log({ stem: 'strings', time: x.time, dur: x.dur, midi: x.midi, vel });
      if (!studio.inRange(t0 - 0.5, t0 + dur + 1)) continue;
      st.strings.add(t0, LSTR.render({ time: t0, vel, dur, notes }));
    }
  }

  /** lead articulation: 90 % gate on 8ths, the call's repeated high notes at 87 % (re-strike), long notes legato,
   *  25 ms glide only on the call's octave leap */
  function leadNotes(name, { octave = 1, sd = 0 } = {}) {
    const out = [];
    for (const n of leadLine(studio, name, { octave, sd })) {
      let gate = 1;
      if (n.nextMidi === n.midi) gate = 0.87;
      else if (n.steps <= 2) gate = 0.9;
      const leap = n.prevMidi !== null && n.midi - n.prevMidi === 12 && n.gapBefore < 0.02;
      out.push({ n, time: n.time, midi: n.midi, dur: gate === 1 ? n.dur - 0.008 : n.dur * gate, glideFrom: leap ? n.prevMidi : undefined });
    }
    return out;
  }

  // ================================================================== INTRO: warm pad swell on Dm(add9), breathing in quarters
  {
    const sec = S('intro');
    for (const c of studio.chordsIn('intro')) {
      const first = c.halfBar === 0;
      if (c.halfBar === 1) continue;                         // Dm(add9) held through bar 1
      const d = first ? studio.chordsIn('intro')[1].end - c.start : c.end - c.start;
      for (const m of upper(c, sec).filter((m) => m <= 65)) play(st.pad, first ? PADSWELL : PAD, { time: c.start, midi: m, vel: 0.62, dur: d + 0.05, cutoff: 1800, db: -11 });
    }
    shapeStem(studio, st.pad, sec.start, sec.end + 0.4, (t) => {
      if (t >= sec.end) return 1;
      const b = studio.timeline.secToBeat(t), ph = b - Math.floor(b);
      return Math.pow(10, (-4 * Math.exp(-ph / 0.18) * Math.min(1, ph / 0.03 + 0.0)) / 20);   // -4 dB dip on every beat
    });
  }

  // ================================================================== VERSE 1b: warm pad enters
  for (const c of studio.chordsIn('verse1b')) for (const m of upper(c, S('verse1b')).filter((m) => m <= 65)) play(st.pad, PAD, { time: c.start, midi: m, vel: 0.5, dur: c.end - c.start + 0.03, cutoff: lfoCut(2200, c.start), db: -7 });

  // ================================================================== BUILD 1: Bb -> Csus4 -> C filtered supersaw 8th stabs (bars 3-4)
  {
    const sec = S('build1');
    for (let e = 16; e < 32; e++) {
      const t = sec.step(e * 2); if (!ok(t)) continue;
      const c = chordAt(t + 0.005), p = (e - 16) / 16;
      for (const m of [...upper(c, sec), ...lowLayer(c, sec)]) play(st.chords, STAB, { time: t, midi: m, vel: bv(0.62 + 0.13 * p), dur: studio.timeline.noteLen('1/8', t) * 0.62, cutoff: bc(1400 * Math.pow(4.3, p)) }); // cut 4
    }
  }

  // ================================================================== DROP 1 / 1b: soft pluck (+12) inside the composite lead; pumping pad
  for (const name of ['drop1', 'drop1b']) {
    // drop1b bars 1-4: the guitar sings alone; the pluck re-enters on refrain B's anticipated first note
    const sec = S(name), rest = name === 'drop1b' ? sec.step(4 * 16 - 1) - 0.01 : -Infinity;
    for (const n of leadLine(studio, name, { anticipate: true, sd: 0.003, octave: 1 })) {
      if (n.time < rest) continue;
      play(st.pluck, PLUCK, { time: n.time, midi: n.midi, vel: ev(sec, 0.62 + (n.steps >= 4 ? 0.06 : 0), 0.1), dur: Math.min(n.dur, 0.6) });
    }
    for (const c of studio.chordsIn(name)) for (const m of upper(c, sec)) play(st.pad, PAD, { time: c.start, midi: m, vel: 0.62, dur: c.end - c.start + 0.03, cutoff: lfoCut(3500, c.start), db: -3 });
  }

  // ================================================================== BUILD 2: filtered saw 8ths (bars 1-4), rising stabs (bars 5-8)
  {
    const sec = S('build2');
    for (let e = 0; e < 64; e++) {
      const t = sec.step(e * 2); if (!ok(t)) continue;
      let c = chordAt(t + 0.005);
      if (e >= 58) c = T.parseChord('A7');                   // A7sus4 -> A7 resolves on beat 2 of bar 8 (before the silence)
      const bar = Math.floor(e / 8), p = e / 64;
      // CUT 3 (SESSION-3 A3, brief section 6 "Build rise"): bars 5-8 CONTINUE the build-wide sweep instead of resetting.
      // Bar 4 ends at ~1.4 kHz; bars 5-8 run 1.6 kHz -> 6 kHz (cut 2 restarted at 900 Hz: bars 5-6 were a muffled
      // thud, 10 dB down in 0.8-3 kHz). Velocity 0.66 -> 0.75; the 6 kHz / 0.75 build caps still apply (bv / bc).
      const q = (e - 32) / 32;
      const v = bar < 4 ? 0.5 + 0.15 * (e / 32) : Math.min(0.75, 0.66 + 0.09 * q);
      const cut = bar < 4 ? 350 * Math.pow(4, e / 32) : Math.min(6000, 1600 * Math.pow(3.75, q));
      const notes = bar < 4 ? upper(c, sec) : [...upper(c, sec).map((m) => m + (bar >= 6 ? 12 : 0)), ...lowLayer(c, sec)];
      for (const m of notes) play(st.chords, STAB, { time: t, midi: m, vel: bv(v), dur: studio.timeline.noteLen('1/8', t) * (bar < 4 ? 0.8 : 0.6), cutoff: bc(cut) });
      void p;
    }
  }

  // ================================================================== DROP 2 / 2b: pluck transients under the chops; supersaw pad LP 3.5k
  for (const name of ['drop2', 'drop2b']) {
    const sec = S(name);
    // cut 2: the pluck carries the pitch under the chops (exposure rule): every note, natural decay up to 0.5 s
    for (const n of leadLine(studio, name, { anticipate: true, octave: 1 })) play(st.pluck, PLUCK, { time: n.time, midi: n.midi, vel: clamp(0.6 + (n.sectionStep % 4 === 0 ? 0.03 : 0) + jit(`pl2:${name}:${n.idx}`, 0.02), 0.5, 0.7), dur: Math.min(n.dur, 0.5) });
    for (const c of studio.chordsIn(name)) for (const m of upper(c, sec)) play(st.pad, SAWPAD, { time: c.start, midi: m, vel: 0.68, dur: c.end - c.start + 0.02, db: -4 });
  }

  // ================================================================== BREAKDOWN: ice pedal, strings, pad + soft supersaw (bars 5-8)
  {
    const sec = S('breakdown');
    const t4 = sec.at(4);
    play(st.strings, VLN, { time: sec.start, midi: 86, vel: 0.3, dur: t4 - sec.start + 0.6, articulation: 'sustain', attack: 1.4 });
    for (let b = 0; b < 4; b++) play(st.bells, BELL, { time: sec.at(b) + 0.002, midi: 86, vel: 0.28 + (b % 2 ? -0.04 : 0), dur: 2.5 });
    // cut 2: air above the pedal - a D7 ping at bars 1 and 3, ~6 dB under the D6 pedal, a hair after it (a second mallet)
    for (const b of [0, 2]) play(st.bells, BELL, { time: sec.at(b) + 0.03, midi: 98, vel: 0.14, dur: 2.2 });
    let prev;
    for (const c of studio.chordsIn('breakdown')) {
      const bar = Math.floor((c.halfBar - sec.startBar * 2) / 2);
      if (bar < 4) continue;
      prev = T.voiceLead(c, prev, { low: 50, high: 67, count: 3 });
      for (const m of prev) play(st.strings, STR, { time: c.start, midi: m, vel: 0.42, dur: c.end - c.start + 0.08, articulation: 'legato', db: -3 });
      for (const m of upper(c, sec).filter((m) => m <= 67)) play(st.pad, PAD, { time: c.start, midi: m, vel: 0.48, dur: c.end - c.start + 0.03, cutoff: 1800, db: -8 });
    }
    for (const x of leadNotes('breakdown')) {
      if (x.time < t4 - 0.01) continue;
      play(st.lead, LEAD, { time: x.time, midi: x.midi, vel: 0.5, dur: x.dur, glideFrom: x.glideFrom, cutoff: 1500, filterEnv: 0.25, db: -4 });
    }
  }

  // ================================================================== BUILD 3: lead opening from 2 kHz (bars 1-4); strings; huge stabs (5-8)
  {
    const sec = S('build3');
    const t4 = sec.at(4), t8 = sec.end;
    for (const x of leadNotes('build3')) {
      const p = clamp((x.time - sec.start) / (t4 - sec.start), 0, 1);
      play(st.lead, LEAD, { time: x.time, midi: x.midi, vel: 0.7 + 0.15 * p, dur: x.dur, glideFrom: x.glideFrom, cutoff: bc(2000 * Math.pow(4, p)), filterEnv: 0.4, db: -4 + 3 * p });
    }
    let prev;
    for (const c of studio.chordsIn('build3')) {
      const bar = Math.floor((c.halfBar - sec.startBar * 2) / 2);
      if (bar < 4) {
        prev = T.voiceLead(c, prev, { low: 50, high: 67, count: 3 });
        for (const m of prev) play(st.strings, STR, { time: c.start, midi: m, vel: 0.5, dur: c.end - c.start + 0.08, articulation: 'legato', db: -7 });
      }
    }
    // bars 5-8: string swells on the rising roots (Bb 2 bars, C 1 bar, D 2 beats)
    const swell = [[sec.at(4), sec.at(6), 'Bbadd9'], [sec.at(6), sec.at(7), 'Cadd9'], [sec.at(7), sec.at(7, 1), 'Dsus4'], [sec.at(7, 1), sec.at(7, 2), 'D']];
    swell.forEach(([a, b, sym], k) => {
      const ch = T.parseChord(sym), notes = k < 2 ? T.voiceLead(ch, null, { low: 53, high: 72, count: 4 }) : sym === 'D' ? [54, 57, 62, 66, 69] : [55, 57, 62, 67];
      for (const m of notes) play(st.strings, STR, { time: a, midi: m, vel: 0.55 + 0.15 * k, dur: b - a + (k === 3 ? 0 : 0.06), articulation: k < 2 ? 'swell' : 'legato', db: -3 });
    });
    // cut 3 (brief section 6 "Build rise"): the stabs no longer reset to a 1.2 kHz thud when the lead's melody (bar 4,
    // filter at ~6 kHz) hands over to them on the Bb rise. Bars 5-6 open from 2 kHz and meet the cut-2 curve
    // (1200 * 5^p = 2.7 kHz) at bar 7, which then runs unchanged, so bars 7-8 (the drop-delta ceiling window) are as
    // cut 2. Velocity holds at least 0.66 (cut 2 started at 0.6) and meets the cut-2 ramp at bar 7; caps 0.75 / 6 kHz.
    for (let e = 32; e < 64; e++) {
      const t = sec.step(e * 2); if (!ok(t)) continue;
      const bar = Math.floor(e / 8), p = (e - 32) / 32;
      let c = chordAt(t + 0.005);
      if (bar === 7 && e % 8 >= 2) c = T.parseChord('D');
      const notes = [...upper(c, sec), ...(bar >= 6 ? upper(c, sec).map((m) => m + 12).filter((m) => m <= 81) : []), ...lowLayer(c, sec)];
      const cut = p < 0.5 ? 2000 * Math.pow((1200 * Math.sqrt(5)) / 2000, p / 0.5) : 1200 * Math.pow(5, p);
      const vel = Math.max(0.66, 0.6 + 0.15 * p);
      for (const m of notes) play(st.chords, STAB, { time: t, midi: m, vel: bv(vel), dur: studio.timeline.noteLen('1/8', t) * 0.6, cutoff: bc(cut), db: -3 + 3 * p });
    }
    void t8;
  }

  // ================================================================== DROP 3 / 3b / 3c: the main stage
  for (const name of ['drop3', 'drop3b', 'drop3c']) {
    const sec = S(name);
    const deceptiveT = name === 'drop3c' ? sec.at(7, 2) : Infinity;
    // supersaw lead +12 (+ 0-octave layer in drop3)
    for (const x of leadNotes(name)) {
      play(st.lead, LEAD3, { time: x.time, midi: x.midi, vel: ev(sec, 0.92, 0.1), dur: x.dur, glideFrom: x.glideFrom });
      play(st.lead, LEADAIR, { time: x.time, midi: x.midi, vel: ev(sec, 0.92, 0.1), dur: x.dur, db: -24 });   // the shimmer
      if (name === 'drop3') play(st.lead, LEAD, { time: x.time, midi: x.midi - 12, vel: 0.75, dur: x.dur, db: -10 });   // cut 2: -6 -> -10
    }
    // supersaw wall: sustained half-bar chords, 2 octave layers, pumped by the kick sidechain
    for (const c of studio.chordsIn(name)) {
      if (c.start >= deceptiveT - 0.01) continue;
      const end = Math.min(c.end, deceptiveT);
      for (const m of [...upper(c, sec), ...lowLayer(c, sec)]) play(st.chords, WALL, { time: c.start, midi: m, vel: ev(sec, 0.84, 0.15), dur: end - c.start + 0.02, db: 1 });
    }
    // cut 2: the strings hold the anthem's long notes at +12 as one bowed legato line per phrase (never at -12)
    stringLine(name, { until: deceptiveT });
    if (name !== 'drop3') {   // bells at +24
      for (const n of leadLine(studio, name, { octave: 2 })) play(st.bells, BELL, { time: n.time, midi: n.midi, vel: n.steps >= 4 ? 0.5 : 0.34, dur: Math.max(0.3, n.dur) });
    }
    if (name === 'drop3c') {
      // E6 pedal on bells (every half-bar) and violins; the 16th sparkle arpeggio at +24
      play(st.strings, VLN, { time: sec.start, midi: 88, vel: 0.32, dur: deceptiveT - sec.start + 0.3, articulation: 'sustain', attack: 0.8 });
      for (const c of studio.chordsIn(name)) if (!c.pcs.includes(3) || c.pcs.includes(4)) play(st.bells, BELL, { time: c.start + 0.003, midi: 88, vel: 0.26, dur: 1.5 });   // no E over the D# of B7
      for (let s16 = 0; s16 < 7 * 16 + 8; s16++) {
        const t = sec.step(s16), c = chordAt(t + 0.005);
        const pool = arpPool(c, 76, 93, { ninth: false });
        const k = s16 % 8, idx = k < 5 ? k : 8 - k;           // up 5, down 3
        const m = pool[Math.min(pool.length - 1, idx)];
        play(st.arp, PLUCK, { time: t, midi: m, vel: s16 % 4 === 0 ? 0.5 : 0.36, dur: 0.1, cutoff: 1200, filterEnv: 3.2 });
      }
      // deceptive Cmaj7 hit on beat 3 of bar 8, sustained into the tag
      const c = chordAt(deceptiveT + 0.01), d = S('tag').start - deceptiveT;
      for (const m of [...upper(c, sec), ...lowLayer(c, sec)]) play(st.chords, WALLHIT, { time: deceptiveT, midi: m, vel: 0.85, dur: d * 0.9 });
      for (const m of T.voiceLead(c, null, { low: 52, high: 71, count: 4 })) play(st.strings, STR, { time: deceptiveT, midi: m, vel: 0.6, dur: d, articulation: 'legato' });
    }
  }

  // ================================================================== TAG: the broadening; one big hit per half-bar; FINAL HIT rings
  {
    const sec = S('tag');
    const fin = studio.cues.finalHit || { bar: 2, beat: 3 };
    const tFinal = sec.at(fin.bar - 1, fin.beat - 1);
    for (const x of leadNotes('tag')) {
      const isFinal = x.time >= tFinal - 0.01;
      play(st.lead, LEAD3, { time: x.time, midi: x.midi, vel: 0.9, dur: isFinal ? 2.2 : x.dur, glideFrom: x.glideFrom });
      play(st.lead, LEADAIR, { time: x.time, midi: x.midi, vel: 0.9, dur: isFinal ? 2.2 : x.dur, db: -24 });
    }
    // cut 2: the strings hold the tune's long notes at +12 (one bow per phrase), the last one rings with the final hit
    stringLine('tag', { vel: 0.66, finalDur: 3 });
    for (const c of studio.chordsIn('tag')) {
      const isFinal = c.start >= tFinal - 0.01;
      const d = isFinal ? 2.4 : c.end - c.start - 0.02;
      const notes = isFinal ? [52, 59, 66, 67, 71, 47] : [...upper(c, sec), ...lowLayer(c, sec)];
      for (const m of notes) play(st.chords, WALLHIT, { time: c.start, midi: m, vel: isFinal ? 0.92 : 0.82, dur: d });
      if (!isFinal) for (const m of upper(c, sec)) play(st.strings, STR, { time: c.start, midi: m, vel: 0.5, dur: d + 0.1, articulation: 'legato' });
      else for (const m of [47, 54, 59, 66]) play(st.strings, STR, { time: c.start, midi: m, vel: 0.62, dur: 3, articulation: 'legato' });
    }
  }

  gateSilences(studio);
  // safety: everything this part wrote is silent by the end of the ring-out
  const end = studio.songEnd;
  for (const s of Object.values(st)) shapeStem(studio, s, end - 2.2, end + 8, (t) => (t >= end - 0.2 ? 0 : Math.pow(clamp((end - 0.2 - t) / 2, 0, 1), 2)));
  void jit;
}
