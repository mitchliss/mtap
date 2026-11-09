// Musician A - KEYS: grand / felt / pop-bright piano and Rhodes.
//   piano      grand + felt piano: intro call in octaves, verse ballad piano (melody RH + lament LH), build pumps,
//              beatless breakdown solo, build3 chords, tag + final hit
//   piano_pop  bright pop piano: drop1 octave lead + offbeat stabs, drop2 tresillo house stabs, drop3 / drop3c
//              octave attack layer, tag melody octaves
//   rhodes     verse2 suitcase Rhodes: syncopated comp + soft melody double (tremolo/auto-pan + chorus baked in)
//   piano_stab CUT 2: the drop1/1b offbeat chord stabs on their own stem, so the hook can be raised without them
//
// CUT 2 (SESSION-2 A4/A5/A6/A7/A8): felt brightness 0.6 and the verse LH from E2 up (inner tones >= G3); drop1b bars
// 1-4 the piano answers an octave up inside the long notes instead of doubling the tune; drop3/3c piano octaves on
// the supersaw grid (no jitter), drop3c = drop 1's piano octaves as the callback; breakdown bars 1-4 grand at 0.7.
//
// CUT 3 (SESSION-3 A1/A4): piano realism. The Engineer shipped the full spec inside engine/inst/keys.js `Piano` before
// this session (trichord unison in MIDI 45-88, a 28-mode soundboard as six register-band IRs convolved over each
// note's first 250 ms at -12 dB (-15 on 'bright'), damper / key-off noise, hammer return, gain-matched), so every piano
// here (felt, grand, grandOpen, pop -> piano, piano_pop, piano_stab) uses it with its defaults. Per SESSION-3 there is
// NO instruments/a-piano.js fork: never stack two soundboards. The KeyBed ends every pedalled note on the chord's
// pedal change, so the engine puts the damper noise there. Breakdown bars 5-8: the grand leads at base 0.62 (A4).
import { upper, lhMidi, leadLine, melVel, swingStep, jit, gateSilences, bake, ev, clamp, pcAtOrAbove } from '../instruments/a-kit.js';

export const order = 20;

/** a pianist's hands: notes are collected, a re-struck key cuts its previous ring, then everything is played */
class KeyBed {
  constructor(stem, inst) { this.stem = stem; this.inst = inst; this.notes = []; }
  add(n) { if (n.time >= 0 && n.dur > 0.01) this.notes.push({ ...n }); }
  flush(studio) {
    const ns = this.notes.sort((a, b) => a.time - b.time), last = new Map();
    for (const n of ns) {
      const p = last.get(n.midi);
      if (p && p.time + p.dur > n.time - 0.005) p.dur = Math.max(0.03, n.time - p.time - 0.004);
      last.set(n.midi, n);
    }
    for (const n of ns) if (!studio.inSilence(n.time)) this.stem.play(this.inst, n);
    this.notes = [];
  }
}

export default function keys(studio) {
  const E = studio.engine, T = E.theory;
  const S = (n) => studio.section(n);
  const rng = studio.rng('keys');
  const H = (sd) => rng.gauss(0, sd);
  const felt = new E.inst.Piano({ tone: 'felt', seed: 'a-felt', brightness: 0.6, width: 0.8, maxDur: 7 });   // cut 2: 0.3 -> 0.6, reads on a phone
  const grand = new E.inst.Piano({ tone: 'grand', seed: 'a-grand', brightness: 0.55, width: 0.7, maxDur: 8 });
  const grandOpen = new E.inst.Piano({ tone: 'grand', seed: 'a-grand-open', brightness: 0.7, width: 0.7, maxDur: 8 });   // breakdown bars 1-4
  const pop = new E.inst.Piano({ tone: 'bright', seed: 'a-pop', brightness: 0.82, width: 0.45, maxDur: 6 });
  const rhodes = new E.inst.EPiano({ tone: 'rhodes', seed: 'a-rhodes', bark: 1.1 });
  const pno = studio.stem('piano'), pp = studio.stem('piano_pop'), ps = studio.stem('piano_stab');
  const KF = new KeyBed(pno, felt), KG = new KeyBed(pno, grand), KGO = new KeyBed(pno, grandOpen), KP = new KeyBed(pp, pop), KS = new KeyBed(ps, pop);

  // chord sounding at t, with the sus->major resolutions moved inside the pre-drop silences (see report)
  const chordAt = (t) => studio.chordAt(t);
  const pedalEnd = (t) => chordAt(t).end + 0.035;              // the sustain pedal changes with every chord
  const melIn = (secName, c) => studio.melody(secName).filter((n) => n.time < c.end - 0.01 && n.end > c.start + 0.01);

  // ---------------------------------------------------------------- ballad comp (LH lament octaves + inner tones)
  // cut 2: the verse LH sits from E2 up (the sub owns everything under 80 Hz); inner tones stay at or above G3
  function balladComp(kb, secName, { lhVel = 0.5, innerVel = 0.36, hits = [0], inner = 2, lhRoll = 0.012, fifth = false, lhFloor = 40, innerFloor = 55 }) {
    const sec = S(secName);
    for (const c of studio.chordsIn(secName)) {
      const b = pcAtOrAbove(c.bass, lhFloor);
      const pe = c.end + 0.035;
      const t0 = c.start;
      kb.add({ time: Math.max(0, t0 - lhRoll), midi: b, vel: ev(sec, lhVel + H(0.03)), dur: pe - t0 + lhRoll });
      kb.add({ time: Math.max(0, t0 - lhRoll * 0.4), midi: b + 12, vel: ev(sec, lhVel * 0.85 + H(0.03)), dur: pe - t0 });
      if (fifth) kb.add({ time: t0 + 0.004, midi: b + 19, vel: ev(sec, lhVel * 0.6), dur: pe - t0 });
      const mel = melIn(secName, c);
      const ceil = mel.length ? Math.min(...mel.map((n) => n.midi)) - 2 : 67;
      const cand = [];
      for (let m = Math.min(ceil, 67); m >= innerFloor && cand.length < inner; m--) if (c.pcs.includes(m % 12) && m - (b + 12) > 2) cand.push(m);
      const half = (c.end - c.start) / 8; // 16th inside this half-bar
      hits.forEach((st, k) => {
        const t = t0 + st * half + (st ? H(0.005) : 0);
        for (const m of cand) kb.add({ time: t, midi: m, vel: ev(sec, innerVel * (k ? 0.82 : 1) + H(0.03)), dur: pe - t });
      });
    }
  }
  // ---------------------------------------------------------------- the tune on a piano
  function pianoMelody(kb, secName, { base = 0.66, span = 0.14, octaveUp = false, upVel = 0.72, legato = 0.1, octaveOnHighD = false, anticipate = false, sd = 0.005, oct = 0, pedal = false, from = 0, to = 99 } = {}) {
    const sec = S(secName);
    for (const n of leadLine(studio, secName, { anticipate, sd, octave: oct })) {
      const bar = Math.floor(n.sectionStep / 16);
      if (bar < from || bar >= to) continue;
      const v = ev(sec, melVel(n, base, span, 62 + 12 * oct, 74 + 12 * oct), 0.2);
      const d = pedal ? Math.max(n.dur + legato, pedalEnd(n.time) - n.time) : n.dur + legato;
      kb.add({ time: n.time, midi: n.midi, vel: v, dur: d });
      if (octaveUp || (octaveOnHighD && n.midi % 12 === (2 + sec.transpose) % 12 && n.midi >= 74 + sec.transpose))
        kb.add({ time: n.time + 0.006, midi: n.midi + 12, vel: v * upVel, dur: d });
    }
  }

  // ================================================================== INTRO: the call, grand piano in octaves, pedal down
  {
    const sec = S('intro');
    pianoMelody(KG, 'intro', { base: 0.6, span: 0.12, octaveUp: true, upVel: 0.78, pedal: true, sd: 0.004 });
    for (const c of studio.chordsIn('intro')) {
      const same = c.halfBar % 2 === 1 && c.symbol === studio.chords[c.halfBar - 1]?.symbol;
      if (same) continue;                                   // Dm(add9) is held through bar 1
      const b = lhMidi(c.bass), pe = (c.symbol === 'Dmadd9' ? c.end + (c.end - c.start) : c.end) + 0.035;
      KG.add({ time: Math.max(0, c.start - 0.01), midi: b, vel: 0.46, dur: pe - c.start });
      KG.add({ time: c.start, midi: b + 12, vel: 0.4, dur: pe - c.start });
      const inner = c.symbol === 'A7' ? [55, 61, 64] : c.symbol === 'Gm7' ? [58, 62, 65] : [57, 64, 65];
      inner.forEach((m, k) => KG.add({ time: c.start + 0.03 + k * 0.018, midi: m, vel: 0.3 + H(0.02), dur: pe - c.start }));
    }
    void sec;
  }

  // ================================================================== VERSE 1: felt piano, intimate
  pianoMelody(KF, 'verse1', { base: 0.64, span: 0.16, legato: 0.12 });
  balladComp(KF, 'verse1', { lhVel: 0.46, innerVel: 0.32, hits: [0, 6] });
  // ================================================================== VERSE 1b: lift - 3+3+2 inner pulse
  pianoMelody(KF, 'verse1b', { base: 0.7, span: 0.16, legato: 0.12 });
  balladComp(KF, 'verse1b', { lhVel: 0.52, innerVel: 0.34, hits: [0, 3, 6] });

  // ================================================================== BUILD 1: bars 1-2 piano 8th pumps
  {
    const sec = S('build1');
    let prev;
    for (let e = 0; e < 16; e++) {                           // 8ths over bars 1-2
      const t = sec.step(e * 2) + (e ? H(0.004) : 0), c = chordAt(sec.step(e * 2) + 0.01);
      prev = upper(c, sec);
      const pump = e % 2 ? 0.1 : 0;                         // offbeats lean in: the "pump" without a sidechain
      for (const m of prev) KG.add({ time: t, midi: m, vel: clamp(0.36 + 0.18 * (e / 16) + pump + H(0.025), 0.1, 1), dur: studio.timeline.noteLen('1/8', t) * 0.8 });
    }
  }

  // ================================================================== DROP 1 / 1b: pop piano octave lead + offbeat stabs
  for (const name of ['drop1', 'drop1b']) {
    const sec = S(name);
    // drop1b bars 1-4: the lead guitar sings the refrain alone; the piano comes back on refrain B's (anticipated) pickup
    const answerUntil = name === 'drop1b' ? sec.step(4 * 16 - 1) - 0.01 : -Infinity;
    const line = leadLine(studio, name, { anticipate: true, sd: 0.003 });
    for (const n of line) {
      const v = ev(sec, melVel(n, 0.8, 0.12), 0.15);
      if (n.time < answerUntil) { if (n.steps >= 4) answer(sec, n, v); continue; }
      const d = n.steps >= 4 ? n.dur * 0.97 : n.dur * 0.9;
      KP.add({ time: n.time, midi: n.midi + 12, vel: v, dur: d });
      KP.add({ time: n.time + 0.003, midi: n.midi, vel: v * 0.82, dur: d });
    }
    // the offbeat chord stabs: their own stem (piano_stab), velocity 0.6 as in cut 1
    const pat = E.groove.pattern('..x...x.o.x...x.', { vel: 0.6, ghostVel: 0.4 });
    for (let bar = 0; bar < sec.bars; bar++) for (const p of pat) {
      const tg = swingStep(sec, bar * 16 + p.step, 54), t = tg + H(0.004);
      if (bar === sec.bars - 1 && p.step >= 8) continue;       // leave the fill bar's back half to the drums
      const c = chordAt(tg + 0.01);
      for (const m of upper(c, sec)) KS.add({ time: t, midi: m, vel: ev(sec, p.vel + H(0.03), 0.2), dur: 0.13 });
    }
  }
  /**
   * drop1b's piano ANSWER (brief section 4): inside a held note of the guitar's refrain, a short right-hand fill an
   * octave up - chord tones that land on the held pitch +12 (the guitar's own note), in light octaves, starting on
   * the note's SECOND BEAT. Only notes of 2 beats or more have a second beat to answer in (the A's that end each
   * refrain line); the call's 1-beat notes are left to the guitar. Rhythm: 16th-16th-land ("ba-da-daa"), or
   * 16th-land when the note was shortened by the refrain-B push.
   */
  function answer(sec, n, v) {
    if (n.steps < 7) return;
    const L16 = (n.end - n.time) / n.steps, room = n.steps - 4;
    const target = n.midi + 12;
    const t0 = n.time + 4 * L16;
    const c = chordAt(t0 + 0.01);
    const pool = []; for (let m = target - 9; m <= target + 7; m++) if (m !== target && c.pcs.includes(((m % 12) + 12) % 12)) pool.push(m);
    const above = pool.filter((m) => m > target), below = pool.filter((m) => m < target).reverse();
    // a turn from above the first time, a scoop from below the second time, so the answers don't repeat verbatim
    const turn = n.anthemBar % 4 === 1 ? [above[1] ?? above[0], above[0]] : [below[1] ?? below[0], below[0]];
    const seq = room >= 4 ? [turn[0], turn[1], target] : [turn[1], target];
    seq.forEach((m, k) => {
      const t = t0 + k * L16 + (k ? H(0.004) : 0);
      const last = k === seq.length - 1;
      const d = last ? n.end - t - 0.02 : L16 * 0.92;
      const vv = clamp(v * (last ? 0.8 : 0.7) + H(0.025), 0.2, 0.9);
      KP.add({ time: t, midi: m, vel: vv, dur: d });
      KP.add({ time: t + 0.004, midi: m - 12, vel: vv * 0.7, dur: d });
    });
  }

  // ================================================================== VERSE 2: suitcase Rhodes (comp + soft melody double)
  {
    const sec = S('verse2');
    const plays = [];
    let prev;
    const pat = E.groove.pattern('..x.....x.x...x.', { vel: 0.6 });
    for (let bar = 0; bar < sec.bars; bar++) {
      const hits = [{ step: 0, vel: 0.5 }, ...pat];          // downbeat anchor + the syncopated comp
      hits.forEach((p, k) => {
        const st = bar * 16 + p.step, t = swingStep(sec, st, 54) + (st ? H(0.005) : 0);
        const nextStep = k + 1 < hits.length ? bar * 16 + hits[k + 1].step : (bar + 1) * 16;
        const c = chordAt(t + 0.01);
        prev = T.voiceLead(c, prev, { low: 50, high: 66, count: 4 });
        const d = swingStep(sec, nextStep, 54) - t - 0.02;   // sustain each hit to the next
        for (const m of prev) plays.push({ inst: rhodes, note: { time: t + (m - prev[0]) * 0.0015, midi: m, vel: clamp(p.vel + H(0.04), 0.2, 0.9), dur: d } });
      });
    }
    for (const n of leadLine(studio, 'verse2', { sd: 0.005 })) plays.push({ inst: rhodes, note: { time: n.time, midi: n.midi, vel: melVel(n, 0.48, 0.12), dur: n.dur + 0.05, db: -6 } });
    bake(studio, 'rhodes', plays, [
      { type: 'sat', shape: 'tanh', drive: 2.3, oversample: 2 },
      { type: 'autopan', rate: 4.8, depth: 0.3 },
      { type: 'chorus', rate: 0.6, depth: 2.2, delay: 9, mix: 0.3 },
    ]);
  }

  // ================================================================== BUILD 2: piano rests (chops + saws carry it)

  // ================================================================== DROP 2 / 2b: tresillo house-piano stabs
  for (const name of ['drop2', 'drop2b']) {
    const sec = S(name);
    const pat = E.groove.pattern('X..x..x.X..x..x.', { vel: 0.6, accentVel: 0.74 });
    let prev;
    for (let bar = 0; bar < sec.bars; bar++) for (let k = 0; k < pat.length; k++) {
      const p = pat[k], st = bar * 16 + p.step, t = sec.step(st);
      const nxt = k + 1 < pat.length ? pat[k + 1].step : 16;
      const c = chordAt(t + 0.01);
      prev = T.voiceLead(c, prev, { low: 55, high: 70, count: 4 });
      const d = Math.min(0.2, (nxt - p.step) * (sec.step(1) - sec.step(0)) * 0.75);
      const tt = t + H(0.003);
      for (const m of prev) KP.add({ time: tt, midi: m, vel: ev(sec, p.vel + H(0.03), 0.2), dur: d });
      KP.add({ time: tt, midi: pcAtOrAbove(c.root, 43), vel: ev(sec, p.vel * 0.6, 0.2), dur: d });   // LH root under the stab
    }
  }

  // ================================================================== BREAKDOWN: grand piano solo, lush and pedalled
  {
    const sec = S('breakdown');
    // cut 2: bars 1-4 on a brighter grand (0.7): the emotional peak must not be the darkest moment of the record
    pianoMelody(KGO, 'breakdown', { base: 0.62, span: 0.18, octaveOnHighD: true, upVel: 0.62, legato: 0.18, sd: 0.009, to: 4 });
    // cut 3 (SESSION-3 A4): the grand STAYS IN FRONT in bars 5-8 (cut 2: base 0.44, the formant soprano carried the
    // anthem almost alone). The choir "ah" soprano doubles it 3 dB behind (choir_lead lane, Musician B).
    pianoMelody(KG, 'breakdown', { base: 0.62, span: 0.14, octaveOnHighD: true, upVel: 0.62, legato: 0.14, sd: 0.007, from: 4 });
    for (const c of studio.chordsIn('breakdown')) {
      const b = lhMidi(c.bass), pe = c.end + 0.04;
      const pool = [b];                                      // LH broken chord: bass, then chord tones a 5th+ above
      for (let cur = b + 7; pool.length < 4;) { let m = cur; while (!c.pcs.includes(m % 12)) m++; pool.push(m); cur = m + 3; }
      const order = [0, 1, 2, 3];
      const bar = Math.floor((c.halfBar - sec.startBar * 2) / 2);
      for (let e = 0; e < 4; e++) {
        const t = c.start + (c.end - c.start) * e / 4 + (e ? H(0.008) : -0.01);
        (bar >= 4 ? KG : KGO).add({ time: Math.max(0, t), midi: pool[order[e]], vel: clamp((e ? 0.34 : 0.46) + (bar >= 4 ? 0.04 : 0) + H(0.03), 0.1, 1), dur: pe - t });
      }
      if (bar >= 4) {   // bars 5-8: RH quarter-note chord pulse under the choir
        const ch = upper(c, sec).filter((m) => m <= 67);
        for (let q = 0; q < 2; q++) { const t = c.start + (c.end - c.start) * q / 2 + H(0.006); for (const m of ch) KG.add({ time: t, midi: m, vel: 0.28 + H(0.02), dur: (c.end - c.start) / 2 + 0.02 }); }
      } else {
        const mel = melIn('breakdown', c), ceil = mel.length ? Math.min(...mel.map((n) => n.midi)) - 3 : 66;
        const inner = []; for (let m = ceil; m >= 55 && inner.length < 2; m--) if (c.pcs.includes(m % 12)) inner.push(m);
        for (const m of inner) KGO.add({ time: c.start + 0.02, midi: m, vel: 0.3 + H(0.02), dur: pe - c.start });
      }
    }
  }

  // ================================================================== BUILD 3: grand piano 8th chords (bars 1-6), then OUT
  // cut 2: the piano is the brief's "piano 8th chords" under "Lihyot am chofshi" (bars 1-4) and keeps pulsing 8ths on
  // the Bb rise (bars 5-6, an octave up, flat dynamic). It drops OUT for the last 2 bars: in the A-only render the
  // cut-1 16th crescendo (+12, up to vel 0.86) was the loudest thing in the build's last bar - 7 dB over the drop's piano.
  // The last 2 bars belong to the snare, the riser, the stabs and the chop roll; the piano comes back as drop 3's attack.
  {
    const sec = S('build3');
    for (let st = 0; st < 6 * 16; st += 2) {
      const bar = Math.floor(st / 16);
      const t = sec.step(st) + (st ? H(0.004) : 0);
      if (studio.inSilence(t)) continue;
      const c = chordAt(t + 0.005);
      const prog = Math.min(1, st / 64);
      const notes = upper(c, sec).filter((m) => m >= 53);
      const v = clamp(0.4 + 0.24 * prog + (st % 4 === 2 ? 0.05 : 0) + H(0.025), 0.1, 0.7);
      for (const m of notes) KG.add({ time: t, midi: m + (bar >= 4 ? 12 : 0), vel: v, dur: studio.timeline.noteLen('1/8', t) * 0.85 });
      if (st % 8 === 0) KG.add({ time: t, midi: lhMidi(c.bass) + 12, vel: v * 0.9, dur: studio.timeline.noteLen('1/4', t) });
    }
  }

  // ================================================================== DROP 3: pop piano octaves = the attack of the anthem
  // drop3c: drop 1's pop-piano octaves come back as THE callback that unites the three drops. Every tune double in
  // drop 3 sits on the supersaw grid: no timing jitter (velocity still breathes).
  for (const name of ['drop3', 'drop3c']) {
    const sec = S(name);
    for (const n of leadLine(studio, name, { sd: 0 })) {
      if (name === 'drop3c' && n.time >= sec.at(7, 2) - 0.01) continue;
      const v = ev(sec, melVel(n, 0.82, 0.1), 0.1);
      KP.add({ time: n.time, midi: n.midi + 12, vel: v, dur: n.dur * 0.95 });
      KP.add({ time: n.time + 0.003, midi: n.midi, vel: v * 0.85, dur: n.dur * 0.95 });
    }
  }
  // drop3c last half-bar: the deceptive Cmaj7 hit on beat 3, pedalled into the tag
  {
    const sec = S('drop3c'), t = sec.at(7, 2), c = chordAt(t + 0.01);
    for (const m of [pcAtOrAbove(c.root, 36), pcAtOrAbove(c.root, 36) + 12, ...upper(c, sec).map((m) => m + 12)]) KP.add({ time: t, midi: m, vel: 0.82, dur: S('tag').start - t + 0.05 });
    const mel = studio.melody('drop3c').filter((n) => n.time >= t - 0.01);
    for (const n of mel) KP.add({ time: n.time, midi: n.midi + 12, vel: 0.8, dur: n.dur });
  }

  // ================================================================== TAG: broadening hits + melody octaves; FINAL HIT
  {
    const sec = S('tag');
    const fin = studio.cues.finalHit || { bar: 2, beat: 3 };
    const tFinal = sec.at(fin.bar - 1, fin.beat - 1);
    for (const n of leadLine(studio, 'tag')) {
      const v = melVel(n, 0.84, 0.1, 64, 76);
      const d = n.time >= tFinal - 0.01 ? 4.2 : n.dur + 0.05;
      KP.add({ time: n.time, midi: n.midi + 12, vel: v, dur: d });
      KP.add({ time: n.time + 0.004, midi: n.midi, vel: v * 0.86, dur: d });
    }
    for (const c of studio.chordsIn('tag')) {
      const isFinal = c.start >= tFinal - 0.01;
      const b = lhMidi(c.bass), d = isFinal ? 4.2 : c.end - c.start + 0.04;
      const ch = isFinal ? [b - 12 >= 21 ? b - 12 : b, b, b + 7, 54 + 0, 55, 59, 66] : [b, b + 12, ...upper(c, sec)];
      ch.forEach((m, k) => KG.add({ time: c.start - 0.012 + k * 0.006, midi: m, vel: clamp((isFinal ? 0.86 : 0.74) - k * 0.02, 0.2, 1), dur: d }));
    }
  }

  KF.flush(studio); KG.flush(studio); KGO.flush(studio); KP.flush(studio); KS.flush(studio);
  gateSilences(studio);
}
