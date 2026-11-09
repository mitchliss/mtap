// Musician A - GUITARS (all physically modelled strings, every strum voiced on six real strings).
//   gtr_acoustic  steel-string strums: verse1b (L35), build1, drop1/1b 16ths double-tracked AC1 L60 / AC2 R60,
//                 verse2 double-tracked (L/R 80), build3 8ths -> 16ths, tag hits + the final open Em(add9)
//   gtr_clean     clean electric: verse1 8th arpeggio (R35), drop1b high 16th arpeggio (R60), drop2b funk ANSWER
//                 licks (R25, light palm mute), breakdown natural harmonics incl. D6/A6 (echo baked) + slow arpeggio
//   gtr_lead      lead guitar on the tune (own model with real slides + finger vibrato): drop1/1b (+12 bridge),
//                 verse2 (0, neck, 90 ms slapback). Chorus pedal baked in. (Out of drop3c in cut 2.)
//   gtr_muted     palm-muted electric: drop1 8ths (R40), build2 chugs, drop2 funk scratch (R25), drop3b/c dist chugs
//   gtr_dist      distorted power chords, two takes hard L/R: build3 bars 5-8, drop3/3b/3c, tag
import { chordAtA, gtrShape, leadLine, melVel, swingStep, gateSilences, bake, ev, clamp, pcAtOrAbove, arpPool, shapeStem } from '../instruments/a-kit.js';
import { LeadGuitar } from '../instruments/a-leadgtr.js';

export const order = 50;

export default function guitar(studio) {
  const E = studio.engine, T = E.theory;
  const S = (n) => studio.section(n);
  const rng = studio.rng('gtr');
  const H = (sd) => rng.gauss(0, sd);
  const chordAt = (t) => chordAtA(studio, t);
  const ok = (t) => !studio.inSilence(t);
  const stA = studio.stem('gtr_acoustic'), stC = studio.stem('gtr_clean'), stM = studio.stem('gtr_muted');

  const AC1 = new E.inst.AcousticGuitar({ seed: 'a-ac1', brightness: 0.74, body: 1, noise: 0.14 });
  const AC2 = new E.inst.AcousticGuitar({ seed: 'a-ac2', brightness: 0.78, body: 1.05, noise: 0.13 });
  const CLEAN = new E.inst.ElectricGuitar({ tone: 'clean', pickup: 'middle', seed: 'a-cln', brightness: 0.75 });
  const NECK = new E.inst.ElectricGuitar({ tone: 'clean', pickup: 'neck', seed: 'a-neck', brightness: 0.5 });
  const MUTE = new E.inst.ElectricGuitar({ tone: 'mute', pickup: 'bridge', seed: 'a-mut', brightness: 0.6 });
  const FUNK = new E.inst.ElectricGuitar({ tone: 'clean', pickup: 'middle', seed: 'a-funk', brightness: 0.8 });
  const DA = new E.inst.ElectricGuitar({ tone: 'clean', pickup: 'bridge', seed: 'a-distA', brightness: 0.85 });
  const DB = new E.inst.ElectricGuitar({ tone: 'clean', pickup: 'bridge', seed: 'a-distB', brightness: 0.8 });
  const LEADB = new LeadGuitar({ pickup: 'bridge', seed: 'a-leadB', brightness: 0.7, drive: 1.8 });
  const LEADN = new LeadGuitar({ pickup: 'neck', seed: 'a-leadN', brightness: 0.5, drive: 1.5 });

  // a hard-ish rock rig: tighten, push mids, ~26 dB of asymmetric tube clip (4x oversampled), 4x12 cab curve
  const DIST = [
    { type: 'eq', bands: [{ type: 'hp', freq: 120, slope: 12 }, { type: 'peak', freq: 900, gain: 4, q: 0.7 }] },
    { type: 'sat', shape: 'tube', drive: 26, bias: 0.005, oversample: 4, output: 14 },
    { type: 'eq', bands: [{ type: 'hp', freq: 100, slope: 12 }, { type: 'peak', freq: 450, gain: -4, q: 1 }, { type: 'peak', freq: 1800, gain: 4, q: 1 }, { type: 'lp', freq: 5000, slope: 24 }] },
  ];
  const CHORUS = { type: 'chorus', rate: 0.7, depth: 3, delay: 10, voices: 2, mix: 0.35 };

  // ---------------------------------------------------------------- strumming
  /**
   * pattern: 16 chars per bar. D/U = down/up strum, d/u = soft, C = dead-muted "chk" (down), . = rest.
   */
  function strums(perf, secName, pat, { swing = 50, from = 0, to, vel = 0.8, up = 0.62, cres = 0, half = false, sd = 0.006, cap = 1 } = {}) {
    const sec = S(secName);
    to = to ?? sec.bars;
    for (let bar = from; bar < to; bar++) for (let s = 0; s < 16; s++) {
      const ch = pat[s % pat.length]; if (ch === '.') continue;
      const step = bar * 16 + s, tg = swingStep(sec, step, swing), t = tg + (step ? H(sd) : 0);
      if (!ok(t) || t < 0) continue;
      const c = chordAt(tg + 0.01);
      const dir = 'DdC'.includes(ch) ? 'down' : 'up';
      const p = (step - from * 16) / Math.max(1, (to - from) * 16);
      let v = ch === 'D' ? vel : ch === 'U' ? up : ch === 'C' ? vel * 0.45 : ch === 'd' ? vel * 0.72 : up * 0.75;
      v = clamp(ev(sec, v * (1 + cres * (p - 0.5)) + H(0.04), 0.15), 0.08, cap);
      perf.strum({ time: t, voicing: gtrShape(c, sec), dir, vel: v, mute: ch === 'C' ? 'dead' : false, strings: dir === 'up' ? (half ? 'top3' : 'top4') : 'all', dur: 3 });
    }
  }

  // ---------------------------------------------------------------- lead guitar on the tune
  function leadPlays(secName, inst, { octave = 0, anticipate = false, base = 0.8, from = 0 } = {}) {
    const sec = S(secName), plays = [];
    const notes = leadLine(studio, secName, { anticipate, sd: 0.003, octave });
    notes.forEach((n, i) => {
      if (n.time < from) return;
      const next = notes[i + 1];
      const up = n.prevMidi !== null && n.midi - n.prevMidi > 0 && n.midi - n.prevMidi <= 2 && n.gapBefore < 0.02;
      const step = up && (n.steps >= 4 || n.midi % 12 === (2 + sec.transpose) % 12);
      const hammer = up && !step && i % 2 === 1;
      const same = next && next.midi === n.midi;
      const dur = same ? n.dur * 0.9 : next && next.time - n.end < 0.02 ? n.dur - 0.004 : n.dur;
      const vib = n.dur > 0.5 ? (n.steps >= 8 ? 26 : 20) : 0;
      plays.push({ inst, note: { time: n.time, midi: n.midi, vel: ev(sec, melVel(n, base, 0.12, 62 + 12 * octave, 74 + 12 * octave), 0.15), dur,
        slideFrom: step ? n.prevMidi : undefined, slideTime: 0.035, legato: step || hammer, vib, pan: 0.08 } });
    });
    return plays;
  }

  // ---------------------------------------------------------------- distorted power chords (two takes, hard L/R)
  function powerChords(spans, { vel = 0.85, tag = '' } = {}) {
    const pa = [], pb = [];
    for (const { t, d, pc } of spans) {
      const r = pcAtOrAbove(pc, 40);
      [r, r + 7, r + 12].forEach((m, k) => {
        pa.push({ inst: DA, note: { time: t + k * 0.004, midi: m - 0.04, vel: vel - k * 0.05, dur: d, pickPos: 0.1, pan: -1 } });
        pb.push({ inst: DB, note: { time: t + 0.012 + k * 0.005, midi: m + 0.04, vel: vel - k * 0.05 - 0.03, dur: d, pickPos: 0.11, pan: 1 } });
      });
    }
    bake(studio, 'gtr_dist', pa, DIST, { tail: 1 });
    bake(studio, 'gtr_dist', pb, DIST, { tail: 1, log: false });
    void tag;
  }

  // ================================================================== VERSE 1: clean 8th arpeggio (chord tones + 9th), R 35
  function cleanArp(secName, { vel = 0.56, pan = 0.35, inst = CLEAN, lo = 57, hi = 76, from = 0, to } = {}) {
    const sec = S(secName), perf = inst.performance({ seed: `arp-${secName}`, humanize: true });
    for (const c of studio.chordsIn(secName)) {
      const bar = Math.floor((c.halfBar - sec.startBar * 2) / 2);
      if (bar < from || (to !== undefined && bar >= to)) continue;
      const pool = arpPool(c, lo, hi);
      const pick = [pool[0], pool[Math.round(pool.length / 3)], pool[Math.round((2 * pool.length) / 3)], pool[pool.length - 1]];
      const seq = c.halfBar % 2 ? [0, 2, 3, 2] : [0, 2, 1, 3];
      seq.forEach((ix, e) => {
        const t = c.start + ((c.end - c.start) * e) / 4 + H(0.005);
        perf.pick({ time: t, midi: pick[ix], vel: clamp(vel * (e === 0 ? 1.08 : e === 2 ? 0.95 : 0.85) + H(0.05), 0.1, 1), dur: c.end - t + 0.04 });
      });
    }
    perf.flush(stC, { pan });
  }
  cleanArp('verse1', { pan: 0.45 });
  cleanArp('verse1b', { vel: 0.46, pan: 0.5 });

  // ================================================================== VERSE 1b: acoustic strums enter, L 35  (D . D U . U D U)
  {
    const perf = AC1.performance({ seed: 'v1b' });
    strums(perf, 'verse1b', 'D...D.U...U.D.U.', { swing: 56, vel: 0.7, up: 0.55 });
    perf.flush(stA, { pan: -0.35 });
  }
  // ================================================================== BUILD 1: acoustic 8ths (bars 1-2) -> 16ths (bars 3-4), crescendo
  {
    const perf = AC1.performance({ seed: 'b1' });
    strums(perf, 'build1', 'D.U.D.U.D.U.D.U.', { to: 2, vel: 0.72, up: 0.6, cres: 0.3 });
    // cut 2: a build crescendo comes from density, not level - the strums top out at 0.82 (brief section 10)
    strums(perf, 'build1', 'DUDUDUDUDUDUDUDU', { from: 2, to: 4, vel: 0.76, up: 0.62, cres: 0.3, cap: 0.82 });
    perf.flush(stA, { pan: -0.45 });
  }

  // ================================================================== DROP 1 / 1b: acoustic 16ths L60, palm-muted 8ths R40, lead guitar +12
  for (const name of ['drop1', 'drop1b']) {
    const sec = S(name);
    const perf = AC1.performance({ seed: `${name}-ac` });
    strums(perf, name, 'D.DUC.DUD.DUC.DU', { swing: 54, vel: 0.82, up: 0.6 });
    perf.flush(stA, { pan: -0.6 });
    // cut 2: AC2, a second PERFORMANCE at R 60 (its own guitar, seed and hands; ~15 ms behind; the upstrokes vary:
    // soft ghost ups where AC1 digs in, an extra up on the "e" of 4 and top-3 upstrokes every other bar) - drop 1's
    // width comes from this real double, not from M/S widening
    const perf2 = AC2.performance({ seed: `${name}-ac2` });
    for (let bar = 0; bar < sec.bars; bar++) {
      strums(perf2, name, bar % 2 ? 'D.DUC.DuD.DUCUDU' : 'D.DuC.DUD.DUC.Du', { swing: 54, vel: 0.8, up: 0.58, sd: 0.007, from: bar, to: bar + 1, half: bar % 2 === 1 });
    }
    for (const e of perf2.events) e.time += 0.015;
    perf2.flush(stA, { pan: 0.6 });
    for (let st8 = 0; st8 < sec.bars * 8; st8++) {
      const tg = swingStep(sec, st8 * 2, 54), t = tg + (st8 ? H(0.005) : 0);
      if (!ok(t)) continue;
      const c = chordAt(tg + 0.01), r = pcAtOrAbove(c.root, 40);   // the chord of the grid position, not of the jitter
      const v = clamp((st8 % 2 ? 0.62 : 0.78) + H(0.05), 0.1, 1);
      for (const m of st8 % 8 === 0 ? [r, r + 7, r + 12] : [r, r + 7]) stM.play(MUTE, { time: t, midi: m, vel: v, dur: 0.16, pan: 0.4 });
    }
    bake(studio, 'gtr_lead', leadPlays(name, LEADB, { octave: 1, anticipate: true, base: 0.82 }), [CHORUS], { tail: 1 });
  }
  // drop1b: high clean 16th arpeggio, R 60
  {
    const sec = S('drop1b'), perf = CLEAN.performance({ seed: 'd1b-arp' });
    for (let s16 = 0; s16 < sec.bars * 16; s16++) {
      const t = swingStep(sec, s16, 54) + (s16 ? H(0.004) : 0), c = chordAt(swingStep(sec, s16, 54) + 0.005);
      const pool = arpPool(c, 69, 86), k = s16 % 6, idx = [0, 1, 2, 3, 2, 1][k];
      const pick = [pool[0], pool[Math.round(pool.length / 3)], pool[Math.round((2 * pool.length) / 3)], pool[pool.length - 1]];
      perf.pick({ time: t, midi: pick[idx], vel: clamp((s16 % 4 === 0 ? 0.5 : 0.38) + H(0.04), 0.1, 1), dur: 0.35 });
    }
    perf.flush(stC, { pan: 0.6 });
  }

  // ================================================================== VERSE 2: the band verse - lead guitar (neck, slapback), acoustics L/R 80
  {
    const slap = { type: 'delay', time: 0.09, feedback: 0.1, mix: 0.22, dry: 1, hp: 250, lp: 4500, mod: 0.05 };
    bake(studio, 'gtr_lead', leadPlays('verse2', LEADN, { octave: 0, base: 0.78 }), [CHORUS, slap], { tail: 1 });
    const pL = AC1.performance({ seed: 'v2L' }), pR = AC2.performance({ seed: 'v2R' });
    strums(pL, 'verse2', 'D.DU.UDUD.DU.UDU', { swing: 54, vel: 0.64, up: 0.5 });
    strums(pR, 'verse2', 'D.DU.UDUD.DU.UDU', { swing: 54, vel: 0.62, up: 0.48, sd: 0.007 });
    pL.flush(stA, { pan: -0.8 });
    // the second take sits ~15 ms later, like a real double-track
    for (const e of pR.events) e.time += 0.015;
    pR.flush(stA, { pan: 0.8 });
  }

  // ================================================================== BUILD 2: palm-muted chugs, 8ths -> 16ths (bars 7-8)
  {
    const sec = S('build2');
    for (let s16 = 0; s16 < sec.bars * 16; s16++) {
      const bar = Math.floor(s16 / 16), div = bar >= 6 ? 1 : 2;
      if (s16 % div) continue;
      const t = sec.step(s16) + (s16 ? H(0.004) : 0); if (!ok(t)) continue;
      let c = chordAt(t + 0.01);
      if (bar === 7 && s16 % 16 >= 4) c = T.parseChord('A7');
      const r = pcAtOrAbove(c.root, 40), p = s16 / 128;
      const v = clamp(0.55 + 0.22 * p + (s16 % 4 === 0 ? 0.06 : 0) + H(0.04), 0.1, 0.82);   // cut 2: density, not level
      for (const m of [r, r + 7]) stM.play(MUTE, { time: t, midi: m, vel: v, dur: div === 2 ? 0.17 : 0.09, pan: 0.3 });
    }
  }

  // ================================================================== DROP 2 / 2b: funky chicken-scratch 16ths (centre-right)
  for (const name of ['drop2', 'drop2b']) {
    const sec = S(name), perf = FUNK.performance({ seed: `${name}-funk` });
    const pat = 'o.X.o.Xoo.X.o.Xo';
    for (let bar = 0; bar < sec.bars; bar++) for (let s = 0; s < 16; s++) {
      const ch = pat[s]; if (ch === '.') continue;
      const step = bar * 16 + s, t = swingStep(sec, step, 52) + (step ? H(0.004) : 0);
      if (!ok(t)) continue;
      const c = chordAt(t + 0.01), shape = T.guitarVoicing(c.symbol, { prefer: 'high' });
      const dir = s % 2 ? 'up' : 'down';
      if (ch === 'o') perf.strum({ time: t, voicing: shape, dir, vel: clamp(0.45 + H(0.06), 0.1, 1), mute: 'dead', strings: [2, 5], spread: 0.008 });
      else perf.strum({ time: t, voicing: shape, dir, vel: clamp(0.86 + H(0.05), 0.1, 1), strings: [2, 5], spread: 0.01, dur: 0.11 });
    }
    perf.flush(stM, { pan: 0.25 });
  }

  // ================================================================== DROP 2b: the funk guitar ANSWERS the chops (call and response)
  // In each long note (>= 8 sixteenths; 7 for the A that the refrain-B push shortens - vocals.js uses the same rule) the
  // chop sings only the first 8th; this guitar answers in the rest of the note: a 16th lick on chord tones that lands
  // on the held pitch (anthem octave, a real guitar register) and holds it with a little finger vibrato. Clean bridge
  // pickup, light palm mute (short string decay), centre-right, on its own stem position so B can place it apart from
  // the scratch rhythm.
  {
    const sec = S('drop2b'), plays = [];
    // source gain +6 dB: palm-muted 16ths have a fraction of a sustained chop's energy, and an answer has to be heard
    const FL = new LeadGuitar({ pickup: 'bridge', seed: 'a-funk-lick', brightness: 0.62, decay: 0.16, drive: 1.4, gain: 2 });
    const FH = new LeadGuitar({ pickup: 'bridge', seed: 'a-funk-land', brightness: 0.6, decay: 0.42, drive: 1.4, gain: 2 });
    // [step from the note start, 'a1'|'a2'|'b1'|'b2'|'t', articulation]; the last entry is the landing
    const LICKS = [
      [[2, 'a1'], [3, 't'], [4, 'b1'], [6, 't', 'slide']],
      [[2, 'b2'], [3, 'b1'], [4, 't', 'hammer'], [6, 'a1'], [7, 't', 'pull']],
      [[3, 'a2'], [4, 'a1'], [5, 't'], [6, 'b1'], [7, 't', 'slide']],
    ];
    let li = 0;
    for (const n of leadLine(studio, 'drop2b', { anticipate: true })) {
      if (n.steps < 7 || !ok(n.time)) continue;
      const l16 = (n.end - n.time) / n.steps, tgt = n.midi;
      const c = chordAt(n.time + 2 * l16 + 0.01);
      const pool = []; for (let m = tgt - 10; m <= tgt + 9; m++) if (m !== tgt && c.pcs.includes(((m % 12) + 12) % 12)) pool.push(m);
      const ab = pool.filter((m) => m > tgt), be = pool.filter((m) => m < tgt).reverse();
      const pitch = { t: tgt, a1: ab[0], a2: ab[1] ?? ab[0] + 12, b1: be[0], b2: be[1] ?? be[0] - 12 };
      const lick = LICKS[li++ % LICKS.length].filter(([s]) => s < n.steps - 1);
      if (lick[lick.length - 1][1] !== 't') lick.push([lick[lick.length - 1][0] + 1, 't', 'slide']);   // always land home
      let prevM = null;
      lick.forEach(([s, k, art], j) => {
        const m = pitch[k], land = j === lick.length - 1;
        const t = n.time + s * l16 + H(0.004);
        const dur = land ? Math.max(0.08, n.end - t - 0.03) : l16 * 0.85;
        const legato = art === 'hammer' || art === 'pull' || art === 'slide';
        plays.push({ inst: land ? FH : FL, note: { time: t, midi: m, vel: clamp((land ? 0.8 : s % 4 === 0 ? 0.78 : 0.64) + H(0.04), 0.3, 1), dur,
          slideFrom: art === 'slide' && prevM !== null ? prevM : undefined, slideTime: 0.03, legato, vib: land && dur > 0.25 ? 18 : 0, vibDelay: 0.12, pan: 0.25 } });
        prevM = m;
      });
    }
    bake(studio, 'gtr_clean', plays, [], { tail: 0.8 });
  }

  // ================================================================== BREAKDOWN: natural harmonics + long echo (1-4), slow arpeggio (5-8)
  {
    const sec = S('breakdown');
    const HARM = [62, 64, 67, 69, 74, 76, 79, 81];
    const plays = [];
    for (const c of studio.chordsIn('breakdown')) {
      const bar = Math.floor((c.halfBar - sec.startBar * 2) / 2);
      if (bar >= 4) continue;
      const pcs = new Set([...c.pcs, (c.root + 2) % 12]);
      const hs = HARM.filter((m) => pcs.has(m % 12));
      const k = c.halfBar % 2;
      const a = hs[hs.length - 1 - k] ?? hs[0], b = hs[Math.max(0, hs.length - 3 - k)] ?? hs[0];
      plays.push({ inst: NECK, note: { time: c.start + 0.004, midi: a, vel: 0.5, dur: 2.5, pickPos: 0.5 } });
      plays.push({ inst: NECK, note: { time: c.start + (c.end - c.start) * 0.75 + H(0.006), midi: b, vel: 0.4, dur: 2, pickPos: 0.5 } });
    }
    // cut 2: air above the D6 ice pedal - chimed harmonics on D6 and A6 (bar 1 D6, bar 2 beat 3 A6, bar 3 D6,
    // bar 4 beat 3 A6; every one a chord tone: Dm(add9), F/A, Bbmaj7, F), left to ring into the long echo
    for (const [bar, beat, m] of [[0, 0, 86], [1, 2, 93], [2, 0, 86], [3, 2, 93]]) {
      plays.push({ inst: NECK, note: { time: sec.at(bar, beat) + 0.012 + H(0.004), midi: m, vel: 0.44, dur: 3, pickPos: 0.5 } });
    }
    bake(studio, 'gtr_clean', plays.map((p) => ({ ...p, note: { ...p.note, pan: 0.3 } })), [
      { type: 'eq', bands: [{ type: 'lp', freq: 6000, slope: 12 }, { type: 'hp', freq: 200, slope: 12 }] },
      { type: 'delay', sync: '1/4', feedback: 0.45, mix: 0.35, dry: 1, pingpong: true, hp: 400, lp: 5000 },
    ], { tail: 4 });
    cleanArp('breakdown', { vel: 0.4, pan: -0.3, inst: NECK, lo: 55, hi: 74, from: 4 });
  }

  // ================================================================== BUILD 3: acoustic 8ths -> 16ths; distorted whole notes on the rise
  {
    const sec = S('build3'), perf = AC2.performance({ seed: 'b3' });
    strums(perf, 'build3', 'D.U.D.U.D.U.D.U.', { to: 2, vel: 0.74, up: 0.6 });
    strums(perf, 'build3', 'D.DUD.DUD.DUD.DU', { from: 2, to: 4, vel: 0.78, up: 0.62 });
    // cut 2: 16ths on the Bb rise (bars 5-6), then OUT for the last 2 bars: the build thins to snare, riser, stabs
    // and the distorted whole notes, and the strums' top end is saved for the drop
    strums(perf, 'build3', 'DUDUDUDUDUDUDUDU', { from: 4, to: 6, vel: 0.78, up: 0.64, cres: 0.25, cap: 0.82 });
    perf.flush(stA, { pan: -0.5 });
    const rootAt = (b) => T.parseChord(sec.chords[b * 2]).root;   // chords are already transposed
    powerChords([
      { t: sec.at(4), d: sec.at(6) - sec.at(4) - 0.02, pc: rootAt(4) },
      { t: sec.at(6), d: sec.at(7) - sec.at(6) - 0.02, pc: rootAt(6) },
      { t: sec.at(7), d: sec.at(7, 2) - sec.at(7), pc: rootAt(7) },
    ], { vel: 0.85 });
  }

  // ================================================================== DROP 3 / 3b / 3c: the wall - dist L/R, chugs, lead layer, acoustic
  for (const name of ['drop3', 'drop3b', 'drop3c']) {
    const sec = S(name), dec = name === 'drop3c' ? sec.at(7, 2) : Infinity;
    const spans = [];
    for (const c of studio.chordsIn(name)) {
      if (c.start >= dec - 0.01) continue;
      spans.push({ t: c.start, d: Math.min(c.end, dec) - c.start - 0.015, pc: c.root });
    }
    // merge repeated chords into one sustained strike
    const merged = [];
    for (const s of spans) { const p = merged[merged.length - 1]; if (p && p.pc === s.pc && Math.abs(p.t + p.d + 0.015 - s.t) < 0.02) p.d += s.d + 0.015; else merged.push({ ...s }); }
    powerChords(merged, { vel: ev(sec, 0.85, 0.1) });
    if (name !== 'drop3') {   // palm-muted 16th chugs through the same rig, centre
      const plays = [];
      for (let s16 = 0; s16 < sec.bars * 16; s16++) {
        const t = sec.step(s16); if (!ok(t) || t >= dec - 0.01) continue;
        const c = chordAt(t + 0.01), r = pcAtOrAbove(c.root, 40);
        const v = clamp((s16 % 4 === 0 ? 0.8 : s16 % 2 ? 0.55 : 0.66) + H(0.04), 0.1, 1);
        for (const m of [r, r + 7]) plays.push({ inst: MUTE, note: { time: t + H(0.003), midi: m, vel: v, dur: 0.1, pan: 0.1 } });
      }
      bake(studio, 'gtr_muted', plays, DIST, { tail: 0.6 });
    }
    if (name === 'drop3c') {
      // cut 2 (SESSION-2 A4, label C11/P5): NO lead guitar and NO acoustic strums in drop3c - under the wall they were
      // low-mid mush. The three drops unite through the piano callback alone. The distorted doubles and the chugs stay;
      // the deceptive Cmaj7 on beat 3 of bar 8 is the dist double's last strike, rung into the tag.
      powerChords([{ t: dec, d: S('tag').start - dec - 0.02, pc: chordAt(dec + 0.01).root }], { vel: 0.9 });
    }
  }

  // ================================================================== TAG: big strummed hits; the FINAL open Em(add9) rings
  {
    const sec = S('tag');
    const fin = studio.cues.finalHit || { bar: 2, beat: 3 };
    const tFinal = sec.at(fin.bar - 1, fin.beat - 1);
    const perf = AC1.performance({ seed: 'tag' }), perf2 = AC2.performance({ seed: 'tag2' });
    const spans = [];
    for (const c of studio.chordsIn('tag')) {
      const isFinal = c.start >= tFinal - 0.01, d = isFinal ? 4.2 : c.end - c.start;
      perf.strum({ time: c.start - 0.01, voicing: gtrShape(c, sec), dir: 'down', vel: 0.95, spread: 0.035, dur: d });
      perf2.strum({ time: c.start + 0.006, voicing: gtrShape(c, sec), dir: 'down', vel: 0.9, spread: 0.04, dur: d });
      spans.push({ t: c.start, d: isFinal ? 2.8 : d - 0.02, pc: c.root });
    }
    perf.flush(stA, { pan: -0.7 }); perf2.flush(stA, { pan: 0.7 });
    powerChords(spans, { vel: 0.9 });
  }

  gateSilences(studio);
  const end = studio.songEnd;
  for (const s of [...studio.stems.values()].filter((x) => x.part === studio.partName)) shapeStem(studio, s, end - 2.2, end + 8, (t) => (t >= end - 0.2 ? 0 : Math.pow(clamp((end - 0.2 - t) / 2, 0, 1), 2)));
}
