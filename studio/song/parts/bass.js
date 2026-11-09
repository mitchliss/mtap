// Musician A - BASS. Two stems so the mix can treat them separately:
//   sub   pure sine (+12 % 2nd harmonic), mono, F1..E2 in D minor, E1..D#2 in E minor (41-78 Hz). Sidechain-friendly: short in the drops,
//         it fills BETWEEN the kicks (the rolling drop3 sub starts on the 2nd 16th of every beat).
//   bass  the mid/harmonic layer an octave above the sub (saw / square through a 24 dB low-pass with an
//         envelope, tanh drive) so phones hear the line. Pop (drop1), house (verse2), bounce (drop2),
//         rolling big-room (drop3) variants.
// Kick, clap and supersaw stay on the grid (brief): the bass is machine-tight on purpose.
// CUT 3 (SESSION-3 A2): in drop3/3b/3c the SUB stem uses the E-minor floor (cues.subFloorMidi 28), so the tonic is E1
// (41.2 Hz) under the E1-tuned big-room kick; the +12 mid layer keeps pcAtOrAbove(pc, 29) + 12 (E3) for phones.
import { subMidi, gateSilences, clamp, pcAtOrAbove } from '../instruments/a-kit.js';

export const order = 30;

export default function bass(studio) {
  const E = studio.engine;
  const S = (n) => studio.section(n);
  const sub = studio.stem('sub'), mid = studio.stem('bass');
  const SUB = new E.inst.Synth({ osc: [{ type: 'sine', level: 1 }, { type: 'sine', octave: 1, level: 0.12 }], filter: { cutoff: 20000 },
    amp: { a: 0.003, d: 0.1, s: 1, r: 0.06 }, drive: 2, mono: true, glide: 0.02, gain: 0.72, seed: 'a-sub' }, { name: 'sub' });
  const SUBLONG = new E.inst.Synth({ osc: [{ type: 'sine', level: 1 }, { type: 'sine', octave: 1, level: 0.1 }], filter: { cutoff: 20000 },
    amp: { a: 0.02, d: 0.1, s: 1, r: 0.6 }, drive: 1.5, mono: true, gain: 0.72, seed: 'a-sub2' }, { name: 'sub-long' });
  // house / verse mid layer: two saws, 24 dB LP 550 Hz + ~1.1 oct envelope (tau ~60 ms), tanh
  const HOUSE = new E.inst.Synth({ osc: [{ type: 'saw', level: 0.7 }, { type: 'saw', detune: 7, level: 0.5 }],
    filter: { cutoff: 520, res: 0.9, env: 1.15, keytrack: 0.25, slope: 24, a: 0.001, d: 0.28, s: 0.25, r: 0.08 },
    amp: { a: 0.002, d: 0.3, s: 0.8, r: 0.05 }, drive: 6, mono: true, glide: 0.025, gain: 1.5, seed: 'a-house' }, { name: 'house-bass' });
  // pop bass (drop1): square/saw blend, LP 700, 25 ms glide
  const POP = new E.inst.Synth({ osc: [{ type: 'saw', level: 0.6 }, { type: 'square', level: 0.45, detune: -4 }],
    filter: { cutoff: 700, res: 0.85, env: 0.9, keytrack: 0.25, slope: 24, a: 0.001, d: 0.25, s: 0.35, r: 0.08 },
    amp: { a: 0.002, d: 0.3, s: 0.85, r: 0.05 }, drive: 5, mono: true, glide: 0.025, gain: 1.5, seed: 'a-pop' }, { name: 'pop-bass' });
  // rolling big-room bass (drop3): 1 ms attack, tau 70 ms, cutoff falling 1.4 kHz -> 500 Hz per 16th
  const ROLL = new E.inst.Synth({ osc: [{ type: 'saw', level: 0.7 }, { type: 'saw', detune: 9, level: 0.45 }, { type: 'square', level: 0.25 }],
    filter: { cutoff: 500, res: 1.0, env: 1.5, keytrack: 0.2, slope: 24, a: 0.001, d: 0.24, s: 0, r: 0.05 },
    amp: { a: 0.001, d: 0.32, s: 0, r: 0.03 }, drive: 7, mono: true, gain: 1.7, seed: 'a-roll' }, { name: 'rolling-bass' });
  // soft sustained mid (verse1b, breakdown): darker, slower
  const SOFT = new E.inst.Synth({ osc: [{ type: 'saw', level: 0.6 }, { type: 'tri', level: 0.6 }],
    filter: { cutoff: 380, res: 0.7, env: 0.6, keytrack: 0.2, slope: 24, a: 0.01, d: 0.4, s: 0.5, r: 0.15 },
    amp: { a: 0.01, d: 0.3, s: 0.9, r: 0.12 }, drive: 4, mono: true, glide: 0.04, gain: 1.4, seed: 'a-soft' }, { name: 'soft-bass' });

  const chordAt = (t) => studio.chordAt(t);
  const ok = (t) => !studio.inSilence(t);
  const play = (stem, inst, note) => { if (ok(note.time)) stem.play(inst, note); };
  const L16 = (sec, st) => sec.step(st + 1) - sec.step(st);

  /** a 16-step pattern over a section. fn(t, step, chord) -> plays; returns nothing */
  function each(sec, patStr, fn, { from = 0, to = sec.bars } = {}) {
    const pat = E.groove.pattern(patStr, { vel: 0.85, accentVel: 1, ghostVel: 0.6 });
    for (let bar = from; bar < to; bar++) for (let k = 0; k < pat.length; k++) {
      const st = bar * 16 + pat[k].step;
      const nx = k + 1 < pat.length ? bar * 16 + pat[k + 1].step : (bar + 1) * 16;
      const t = sec.step(st);
      fn({ t, st, len: sec.step(nx) - t, vel: pat[k].vel, chord: chordAt(t + 0.005), sec, k });
    }
  }

  // ================================================================== VERSE 1: sub-only half notes on the lament bass
  for (const c of studio.chordsIn('verse1')) play(sub, SUBLONG, { time: c.start, midi: subMidi(c.bass), vel: 0.62, dur: (c.end - c.start) * 0.94 });

  // ================================================================== VERSE 1b: 8th pulse on the lament bass
  each(S('verse1b'), 'x.x.x.x.x.x.x.x.', ({ t, st, len, chord }) => {
    const v = st % 4 === 0 ? 0.8 : 0.64;
    play(sub, SUB, { time: t, midi: subMidi(chord.bass), vel: v, dur: len * 0.82 });
    play(mid, SOFT, { time: t, midi: subMidi(chord.bass) + 12, vel: v * 0.75, dur: len * 0.7 });
  });

  // ================================================================== BUILD 1: bars 1-2 8ths, then OUT
  each(S('build1'), 'x.x.x.x.x.x.x.x.', ({ t, st, len, chord }) => {
    const v = 0.7 + 0.2 * (st / 32);
    play(sub, SUB, { time: t, midi: subMidi(chord.bass), vel: v, dur: len * 0.8 });
    play(mid, HOUSE, { time: t, midi: subMidi(chord.bass) + 12, vel: v * 0.8, dur: len * 0.7 });
  }, { to: 2 });

  // ================================================================== DROP 1 / 1b: syncopated pop bass (follows the inversions)
  for (const name of ['drop1', 'drop1b']) {
    let prev = null;
    each(S(name), 'x..x..x...x..x..', ({ t, st, len, chord, sec }) => {
      const m = subMidi(chord.bass), v = st % 16 === 0 ? 1 : 0.88;
      if (st >= (sec.bars - 1) * 16 + 12) return;          // the fill: bass breathes on the last beat
      play(sub, SUB, { time: t, midi: m, vel: v, dur: len - 0.012 });
      play(mid, POP, { time: t, midi: m + 12, vel: v * 0.9, dur: len - 0.01, glideFrom: prev !== null && Math.abs(prev - m) <= 5 && prev !== m ? prev + 12 : undefined });
      prev = m;
    });
  }

  // ================================================================== VERSE 2: house bass, sub on 1 + offbeat 8ths
  each(S('verse2'), 'X.x...x...x...x.', ({ t, st, len, chord }) => {
    const m = subMidi(chord.bass);
    if (st % 16 === 0) { play(sub, SUB, { time: t, midi: m, vel: 0.9, dur: Math.min(len, 0.2) }); return; }
    play(sub, SUB, { time: t, midi: m, vel: 0.78, dur: Math.min(len * 0.6, 0.13) });
    play(mid, HOUSE, { time: t, midi: m + 12, vel: 0.82, dur: Math.min(len * 0.6, 0.13) });
  });

  // ================================================================== BUILD 2: offbeat 8ths (bars 1-4), driving 8ths (5-6), OUT after bar 6
  each(S('build2'), '..x...x...x...x.', ({ t, st, len, chord }) => {
    const m = subMidi(chord.bass), v = 0.72 + 0.14 * (st / 64);
    play(sub, SUB, { time: t, midi: m, vel: v, dur: Math.min(len * 0.6, 0.13) });
    play(mid, HOUSE, { time: t, midi: m + 12, vel: v, dur: Math.min(len * 0.6, 0.13) });
  }, { to: 4 });
  each(S('build2'), 'x.x.x.x.x.x.x.x.', ({ t, st, len, chord }) => {
    const m = subMidi(chord.bass), v = 0.8 + 0.15 * ((st - 64) / 32);
    play(sub, SUB, { time: t, midi: m, vel: v, dur: len * 0.75 });
    play(mid, HOUSE, { time: t, midi: m + 12, vel: v, dur: len * 0.7 });
  }, { from: 4, to: 6 });

  // ================================================================== DROP 2 / 2b: bounce ..x...x...x..xx. over a sub root on 1 (+ octave hops in 2b)
  for (const name of ['drop2', 'drop2b']) {
    const hops = name === 'drop2b';
    each(S(name), hops ? 'x.xx..xx..xx.xxx' : 'x.x...x...x..xx.', ({ t, st, len, chord }) => {
      const m = subMidi(chord.root), s = st % 16;
      if (s === 0) { play(sub, SUB, { time: t, midi: m, vel: 1, dur: L16(S(name), st) * 2 - 0.01 }); return; }
      const hop = hops && s % 4 === 3;
      play(sub, SUB, { time: t, midi: m, vel: hop ? 0.6 : 0.9, dur: Math.min(len, L16(S(name), st) * 1.6) - 0.008 });
      play(mid, HOUSE, { time: t, midi: m + 12 + (hop ? 12 : 0), vel: hop ? 0.8 : 0.92, dur: Math.min(len, L16(S(name), st) * 1.6) - 0.008 });
    });
  }

  // ================================================================== BREAKDOWN: bars 5-8 only - the climb F A Bb C (sustained)
  for (const c of studio.chordsIn('breakdown')) {
    const sec = S('breakdown'), bar = Math.floor((c.halfBar - sec.startBar * 2) / 2);
    if (bar < 4) continue;
    play(sub, SUBLONG, { time: c.start, midi: subMidi(c.bass), vel: 0.62, dur: (c.end - c.start) * 0.95 });
    play(mid, SOFT, { time: c.start, midi: subMidi(c.bass) + 12, vel: 0.55, dur: (c.end - c.start) * 0.95 });
  }

  // ================================================================== BUILD 3: 8th pulse, then the RISE Bb -> C -> D (key lift)
  {
    const sec = S('build3');
    each(sec, 'x.x.x.x.x.x.x.x.', ({ t, st, len, chord }) => {
      let m = subMidi(chord.bass);
      const bar = Math.floor(st / 16);
      if (bar >= 4) m = subMidi(chord.root);                // Bbadd9 / Cadd9 / Dsus4 / D: roots, rising whole steps
      const v = clamp(0.72 + 0.26 * (st / 128), 0, 1);
      play(sub, SUB, { time: t, midi: m, vel: v, dur: len * 0.8 });
      play(mid, HOUSE, { time: t, midi: m + 12, vel: v, dur: len * 0.72 });
    });
  }

  // ================================================================== DROP 3 / 3b / 3c: rolling big-room bass over a sub
  // CUT 3 (brief section 7 "Bass register", SESSION-3 A2): the SUB stem uses the E-minor floor (cues.subFloorMidi, 28),
  // so the tonic sits on E1 = 41.2 Hz under the E1-tuned kick (cut 2 left it on E2 = 82.4 Hz). D2, C2, B1, A1, G1
  // are unchanged. The +12 'bass' mid layer stays on subMidi(...) + 12 (E3) so phones still hear the line.
  const SUBFLOOR_E = studio.cues?.subFloorMidi?.['E minor'] ?? 28;
  for (const name of ['drop3', 'drop3b', 'drop3c']) {
    const sec = S(name), hops = name !== 'drop3';
    for (let st = 0; st < sec.bars * 16; st++) {
      const s = st % 4;
      if (s === 0 && !(st === 0 && name !== 'drop3c')) continue;   // the kick owns every beat (except the drop downbeat: everything hits)
      const t = sec.step(st), c = chordAt(t + 0.005);
      if (name === 'drop3c' && st >= 7 * 16 + 8) break;      // deceptive cadence half-bar handled below
      const pc = name === 'drop3' ? c.bass : c.root;
      const m = subMidi(pc);                                  // cut-2 register F1..E2: the mid layer plays it +12 (E3 for E)
      const mSub = pcAtOrAbove(pc, SUBFLOOR_E);               // sub register: E1..D#2
      if (s === 0) { play(mid, ROLL, { time: t, midi: subMidi(c.bass) + 12, vel: 1, dur: L16(sec, st) * 1.5 }); continue; }
      if (s === 1) play(sub, SUB, { time: t, midi: mSub, vel: 0.95, dur: sec.step(st + 3) - t - 0.012 });
      const up = hops && s === 3;
      play(mid, ROLL, { time: t, midi: m + 12 + (up ? 12 : 0), vel: up ? 0.92 : s === 1 ? 1 : 0.86, dur: L16(sec, st) * 0.9 });
    }
  }
  { // drop3c beat 3 of bar 8: the deceptive C, held into the reverse swell
    const sec = S('drop3c'), t = sec.at(7, 2), c = chordAt(t + 0.01);
    play(sub, SUBLONG, { time: t, midi: subMidi(c.root), vel: 0.9, dur: S('tag').start - t - 0.05 });
    play(mid, SOFT, { time: t, midi: subMidi(c.root) + 12, vel: 0.8, dur: S('tag').start - t - 0.08 });
  }

  // ================================================================== TAG: one sustained hit per half-bar, then the FINAL HIT rings
  {
    const sec = S('tag');
    const fin = studio.cues.finalHit || { bar: 2, beat: 3 };
    const tFinal = sec.at(fin.bar - 1, fin.beat - 1);
    for (const c of studio.chordsIn('tag')) {
      const isFinal = c.start >= tFinal - 0.01;
      const m = subMidi(c.bass);
      const d = isFinal ? 2.6 : c.end - c.start - 0.03;
      play(sub, SUBLONG, { time: c.start, midi: isFinal ? m - 12 >= 28 ? m - 12 : m : m, vel: isFinal ? 1 : 0.85, dur: d });
      play(mid, SOFT, { time: c.start, midi: m + (isFinal ? 0 : 12), vel: isFinal ? 0.85 : 0.75, dur: d });
    }
  }

  gateSilences(studio);
}
