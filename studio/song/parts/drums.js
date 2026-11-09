// Musician B - drums & groove. Every hit is synthesized (b-kit kicks/hats/tambourine/timpani + the engine kit's
// snare, claps, snaps, shaker, ride, crashes, toms). Grooves follow brief section 10; the kit escalates pass by pass:
//   verse kick (round) -> pop kick (warm) -> club kick (punch) -> big-room kick (tok + a driven tail tuned to the
//   tonic E1, cut 3).
// Kick, clap and snare stay on the grid (the machine backbone); hats, shaker, tambourine and snaps are humanised.
// Stems: kick, snare, clap, snap, hats, perc, ride, cymbals, toms. Trigger lists for the mixer:
//   'pump'   = the four-on-the-floor kicks (+ 8th-grid kick-roll hits) that drive every sidechain pump,
//   'ghost8' = the silent 8th-note ghost trigger that makes the breakdown pad pulse.
import { kickVoice, hatVoice, tambVoice, timpaniVoice, RollVoice, swingT, pat, gateSilences } from '../instruments/b-kit.js';

export const order = 70;

export default function drums(studio) {
  const E = studio.engine, I = E.inst, clamp = E.clamp;
  const R = studio.rng('groove');
  const S = (n) => studio.section(n);

  // ------------------------------------------------------------------------------------------- the kit
  const K = { verse: kickVoice('verse', 'b:kv'), pop: kickVoice('pop', 'b:kp'), club: kickVoice('club', 'b:kc'), big: kickVoice('bigroom', 'b:kb') };
  const heart = new RollVoice(K.verse); // breakdown heartbeat: the verse kick low-passed at 150 Hz
  const snare = new I.DrumVoice('snare', { tune: 1.0, decay: 0.2, body: 0.8, wires: 0.85, crack: 0.55, room: 0.16, tone: 4600 }, 'b:snpop');
  const snareBig = new I.DrumVoice('snare', { tune: 1.12, decay: 0.26, body: 0.6, wires: 1.1, crack: 0.85, room: 0.1, tone: 5400 }, 'b:snbig');
  const ghost = new I.DrumVoice('snare', { tune: 1.04, decay: 0.14, body: 0.55, wires: 0.8, crack: 0.35, room: 0.12 }, 'b:sngh');
  const roll = new RollVoice(new I.DrumVoice('snare', { tune: 1.05, decay: 0.16, body: 0.55, wires: 1, crack: 0.7, room: 0.08, tone: 5200 }, 'b:snroll'));
  const clap = new I.DrumVoice('clap', { tone: 1150, decay: 0.16, room: 0.3, bursts: 4 }, 'b:clA');
  const clapB = new I.DrumVoice('clap', { tone: 1380, decay: 0.2, room: 0.24, bursts: 4 }, 'b:clB');
  const snap = new I.DrumVoice('snap', { tone: 1900, room: 0.45 }, 'b:snap');
  const rim = new I.DrumVoice('rim', {}, 'b:rim');
  const shaker = new I.DrumVoice('shaker', { decay: 0.075, tone: 6500 }, 'b:shk');
  const ride = new I.DrumVoice('ride', { decay: 2.2, bell: 0.6 }, 'b:ride');
  const crash = new I.DrumVoice('crash', { decay: 2.6 }, 'b:crA');
  const crash2 = new I.DrumVoice('crash', { decay: 2.1, tone: 1.12 }, 'b:crB');
  const tom = new I.DrumVoice('tom', { decay: 0.6 }, 'b:tom');
  const hat = hatVoice(false, { seed: 1 }, 'b:hat'), ohat = hatVoice(true, { seed: 1 }, 'b:ohat');
  const tamb = tambVoice('b:tamb'), timp = timpaniVoice({}, 'b:timp');

  // ------------------------------------------------------------------------------------------- sequencing helpers
  const H = [];
  const put = (stem, v, t, vel, o = {}) => { if (vel < 0.02 || studio.inSilence(t)) return; H.push({ stem, v, t: Math.max(0, t), vel: clamp(vel, 0.03, 1), ...o }); };
  const hum = (t, sd) => t + clamp(R.gauss(0, sd), -2.5 * sd, 2.5 * sd);
  const hv = (v, sd = 0.08) => clamp(v * (1 + R.gauss(0, sd)), 0.03, 1);
  /** run a 1-bar pattern over bars [b0, b1) of section s: fn(globalStepInSection, accent, bar) */
  const loop = (s, b0, b1, str, fn) => { const p = pat(str); for (let b = b0; b < b1; b++) for (const { step, acc } of p) fn(b * 16 + step, acc, b); };
  const toms = (key) => (key === 'E' ? [55, 52, 47, 43, 40] : [53, 50, 45, 41, 38]); // hi .. floor, in the key
  /** build roll: snare hits on the given section steps, pitch rising `semis`, HP 200 -> hp1, velocity v0 -> v1 (by time) */
  function snareRoll(s, steps, { semis = 5, hp0 = 200, hp1 = 1500, v0 = 0.35, v1 = 1 } = {}) {
    const a = steps[0], b = steps[steps.length - 1];
    for (const st of steps) {
      const x = b > a ? (st - a) / (b - a) : 1;
      put('snare', roll, s.step(st), v0 + (v1 - v0) * Math.pow(x, 1.3), { semis: semis * x, hp: hp0 * Math.pow(hp1 / hp0, x) });
    }
  }
  /** two-beat fill starting at section step st0 (beats 3-4 of a bar): snare 16ths then toms high -> low */
  function fill(s, st0, key, { v = 0.85, kind = 'tom' } = {}) {
    const T = toms(key);
    if (kind === 'snare') { for (let k = 0; k < 8; k++) put('snare', snare, s.step(st0 + k), v * (0.45 + 0.07 * k)); return; }
    for (let k = 0; k < 4; k++) put('snare', snare, s.step(st0 + k), v * (0.5 + 0.1 * k));
    const seq = [T[0], T[0], T[1], T[2], T[2], T[3], T[4], T[4]];
    for (let k = 0; k < 4; k++) put('toms', tom, s.step(st0 + 4 + k), v * (0.8 + 0.06 * k), { midi: seq[k * 2 + 1], pan: [0.35, 0.15, -0.15, -0.35][k] });
  }
  const crashAt = (t, vel, which = 0) => put('cymbals', which ? crash2 : crash, t, vel, { pan: which ? -0.3 : 0.3 });

  // ------------------------------------------------------------------------------------------- pass 1
  { // intro: no drums; a shaker fades in over bar 2
    const s = S('intro');
    loop(s, 1, 2, 'xoXoxoXoxoXoxoXo', (st, a) => put('perc', shaker, hum(swingT(s, st, 56), 0.003), hv(a * 0.5 * (0.12 + 0.88 * ((st - 16) / 16) ** 1.5)), { pan: -0.25 }));
  }
  { // verse1: soft round kick on 1 and 3, finger snaps on 2 and 4, shaker 16ths at 56 % swing
    const s = S('verse1');
    loop(s, 0, 4, 'X.......x.......', (st, a) => put('kick', K.verse, s.step(st), a === 1 ? 0.62 : 0.56, { pump: true }));
    loop(s, 0, 4, '....x.......x...', (st) => put('snap', snap, hum(s.step(st), 0.004), hv(0.75, 0.06), { pan: 0.08 }));
    loop(s, 0, 4, 'xoXoxoXoxoXoxoXo', (st, a) => put('perc', shaker, hum(swingT(s, st, 56), 0.003), hv(a * 0.55), { pan: -0.25 }));
    put('kick', K.verse, s.step(3 * 16 + 14), 0.4); // the "and" of 4 pushes into verse1b
  }
  { // verse1b: four-on-the-floor (still round), snap + soft clap on 2 and 4, offbeat hats, shaker
    const s = S('verse1b');
    loop(s, 0, 4, 'X...x...x...x...', (st, a) => put('kick', K.verse, s.step(st), a === 1 ? 0.7 : 0.65, { pump: true }));
    loop(s, 0, 4, '....X.......X...', (st) => { put('snap', snap, hum(s.step(st), 0.004), hv(0.75, 0.06), { pan: 0.08 }); put('clap', clap, s.step(st), hv(0.48, 0.04)); });
    loop(s, 0, 4, '..x...x...x...x.', (st) => put('hats', hat, hum(s.step(st), 0.003), hv(0.62), { pan: 0.15 }));
    loop(s, 0, 4, '...o.......o.o..', (st) => put('hats', hat, hum(swingT(s, st, 56), 0.003), hv(0.3), { pan: 0.15 }));
    loop(s, 0, 4, 'xoXoxoXoxoXoxoXo', (st, a) => put('perc', shaker, hum(swingT(s, st, 56), 0.003), hv(a * 0.5), { pan: -0.25 }));
    for (let k = 0; k < 3; k++) put('snare', ghost, s.step(3 * 16 + 13 + k), 0.2 + 0.12 * k); // pickup into build1
  }
  { // build1: 4/4 + clap, snare quarters from bar 2; bars 3-4 kick OUT, snare roll 8ths -> 16ths rising +5 st
    const s = S('build1');
    crashAt(s.start, 0.6);
    loop(s, 0, 2, 'X...x...x...x...', (st, a) => put('kick', K.club, s.step(st), a === 1 ? 0.88 : 0.82, { pump: true }));
    loop(s, 0, 2, '....X.......X...', (st) => put('clap', clap, s.step(st), 0.72));
    loop(s, 2, 3, 'X...X...X...X...', (st) => put('clap', clap, s.step(st), 0.74)); // cut 4: backbeat holds under the roll
    loop(s, 1, 2, 'x...x...x...x...', (st) => put('snare', snare, s.step(st), 0.5));
    loop(s, 0, 2, '..x...x...x...x.', (st) => put('hats', ohat, hum(s.step(st), 0.003), hv(0.5), { pan: 0.15, dur: s.step(st + 2) - s.step(st) }));
    loop(s, 0, 2, 'xoxoxoxoxoxoxoxo', (st, a) => put('perc', shaker, hum(swingT(s, st, 54), 0.003), hv(a * 0.5), { pan: -0.25 }));
    const steps = []; for (let st = 32; st < 48; st += 2) steps.push(st); for (let st = 48; st < 60; st++) steps.push(st);
    snareRoll(s, steps, { semis: 5, hp0: 200, hp1: 1500, v0: 0.35, v1: 0.8 });
  }
  { // drop1 - the pop drop: warm kick, clap+snare 2/4, ghost snares on the "a" of 2 and 4, offbeat hats, swung shaker
    const s = S('drop1');
    crashAt(s.start, 1);
    loop(s, 0, 8, 'X...x...x...x...', (st, a) => put('kick', K.pop, s.step(st), a === 1 ? 0.95 : 0.9, { pump: true }));
    loop(s, 0, 8, '....X.......X...', (st, a, b) => { if (b === 7 && st % 16 === 12) return; put('clap', clap, s.step(st), 0.85); put('snare', snare, s.step(st), 0.62); });
    loop(s, 0, 7, '.......o.......o', (st) => put('snare', ghost, hum(swingT(s, st, 54), 0.004), hv(0.22, 0.12)));
    loop(s, 0, 8, '..x...x...x...x.', (st) => { if (st % 16 === 14) put('hats', ohat, hum(s.step(st), 0.002), hv(0.7, 0.05), { pan: 0.15, dur: s.step(st + 2) - s.step(st) }); else put('hats', hat, hum(s.step(st), 0.003), hv(0.66), { pan: 0.15 }); });
    loop(s, 0, 8, 'xoXoxoXoxoXoxoXo', (st, a) => put('perc', shaker, hum(swingT(s, st, 54), 0.003), hv(a * 0.48), { pan: -0.25 }));
    crashAt(s.at(4), 0.5, 1);
    fill(s, 7 * 16 + 8, 'D', { v: 0.85 });
  }
  { // drop1b - more life: open hats on the offbeats, tambourine on 2 and 4
    const s = S('drop1b');
    crashAt(s.start, 0.9, 1);
    loop(s, 0, 8, 'X...x...x...x...', (st, a) => put('kick', K.pop, s.step(st), a === 1 ? 0.95 : 0.9, { pump: true }));
    loop(s, 0, 8, '....X.......X...', (st) => { put('clap', clap, s.step(st), 0.86); put('snare', snare, s.step(st), 0.64); });
    loop(s, 0, 8, '.......o.......o', (st, a, b) => { if (b === 7 && st % 16 === 15) return; put('snare', ghost, hum(swingT(s, st, 54), 0.004), hv(0.24, 0.12)); });
    loop(s, 0, 8, '..x...x...x...x.', (st) => put('hats', ohat, hum(s.step(st), 0.003), hv(0.62), { pan: 0.15, dur: s.step(st + 1.6) - s.step(st) }));
    loop(s, 0, 8, '....x.......x...', (st) => put('perc', tamb, hum(s.step(st), 0.003), hv(0.62), { pan: 0.3 }));
    loop(s, 0, 8, 'xoXoxoXoxoXoxoXo', (st, a) => put('perc', shaker, hum(swingT(s, st, 54), 0.003), hv(a * 0.45), { pan: -0.25 }));
    crashAt(s.at(4), 0.55);
    for (let k = 0; k < 4; k++) put('snare', snare, s.step(7 * 16 + 12 + k), 0.35 + 0.15 * k); // pickup into verse2
  }
  // ------------------------------------------------------------------------------------------- pass 2
  { // verse2 - the band verse: four-on-the-floor at verse weight, clap 2/4, ghosts, hats, shaker; tom fill at the end
    const s = S('verse2');
    crashAt(s.start, 0.85);
    loop(s, 0, 8, 'X...x...x...x...', (st, a) => put('kick', K.pop, s.step(st), a === 1 ? 0.85 : 0.8, { pump: true }));
    loop(s, 0, 8, '....X.......X...', (st, a, b) => { if (b === 7 && st % 16 === 12) return; put('clap', clap, s.step(st), 0.72); put('snap', snap, hum(s.step(st), 0.003), hv(0.5, 0.06), { pan: 0.08 }); });
    loop(s, 0, 7, '.......o..o....o', (st) => put('snare', ghost, hum(swingT(s, st, 54), 0.004), hv(0.22, 0.12)));
    loop(s, 0, 8, '..x...x...x...x.', (st, a, b) => { if (b % 4 === 3 && st % 16 === 14) put('hats', ohat, s.step(st), 0.62, { pan: 0.15, dur: s.step(st + 2) - s.step(st) }); else put('hats', hat, hum(s.step(st), 0.003), hv(0.62), { pan: 0.15 }); });
    loop(s, 0, 8, '...o.......o.o..', (st) => put('hats', hat, hum(swingT(s, st, 54), 0.003), hv(0.28), { pan: 0.15 }));
    loop(s, 0, 8, 'xoXoxoXoxoXoxoXo', (st, a) => put('perc', shaker, hum(swingT(s, st, 54), 0.003), hv(a * 0.46), { pan: -0.25 }));
    fill(s, 7 * 16 + 8, 'D', { v: 0.75 });
  }
  { // build2: 4/4 + clap, snare quarters from bar 3; bars 5-8 kick roll 4ths -> 8ths -> 16ths, snare 8ths -> 16ths -> 32nds
    // cut 3 (brief section 6 "Build rise"): the clap keeps 2 and 4 through bars 5-6 and goes to every beat in bar 7
    // (as build3 does in its bar 4), so the backbeat never drops out under the roll; bar 8 has no clap (roll + silence)
    const s = S('build2');
    crashAt(s.start, 0.75);
    loop(s, 0, 4, 'X...x...x...x...', (st, a) => put('kick', K.club, s.step(st), a === 1 ? 0.9 : 0.85, { pump: true }));
    loop(s, 0, 6, '....X.......X...', (st, a, b) => put('clap', clap, s.step(st), b < 4 ? 0.78 : 0.8));
    loop(s, 6, 7, 'X...X...X...X...', (st) => put('clap', clap, s.step(st), 0.8 + 0.02 * ((st % 16) / 4)));
    loop(s, 2, 4, 'x...x...x...x...', (st) => put('snare', snare, s.step(st), 0.5));
    loop(s, 0, 6, '..x...x...x...x.', (st) => put('hats', ohat, hum(s.step(st), 0.003), hv(0.5), { pan: 0.15, dur: s.step(st + 2) - s.step(st) }));
    loop(s, 0, 4, 'xoxoxoxoxoxoxoxo', (st, a) => put('perc', shaker, hum(swingT(s, st, 54), 0.003), hv(a * 0.45), { pan: -0.25 }));
    const kr = []; for (let st = 64; st < 96; st += 4) kr.push(st); for (let st = 96; st < 112; st += 2) kr.push(st); for (let st = 112; st < 120; st++) kr.push(st);
    kr.forEach((st, i) => put('kick', K.club, s.step(st), 0.8 + 0.05 * (i / (kr.length - 1)), { pump: st % 2 === 0 }));
    const sr = []; for (let st = 64; st < 96; st += 2) sr.push(st); for (let st = 96; st < 112; st++) sr.push(st); for (let st = 112; st < 120; st += 0.5) sr.push(st);
    snareRoll(s, sr, { semis: 7, hp0: 200, hp1: 1500, v0: 0.35, v1: 0.8 });
  }
  { // drop2 - the vocal-chop drop: punchier kick, open hats on the offbeats choked by accented 16th closed hats,
    // rim tresillo, shaker; bar 8: 2-beat snare roll, then the last half-beat is silent
    const s = S('drop2');
    crashAt(s.start, 1);
    drop2Groove(s, { ridePart: false });
    crashAt(s.at(4), 0.55, 1);
    const sr = []; for (let st = 120; st < 124; st++) sr.push(st); for (let st = 124; st < 126; st += 0.5) sr.push(st);
    snareRoll(s, sr, { semis: 3, hp0: 220, hp1: 900, v0: 0.5, v1: 0.85 });
  }
  { // drop2b - the bump doubles: + ride on the quarters; bar 8 tom fill into the breakdown
    const s = S('drop2b');
    crashAt(s.start, 0.95, 1);
    drop2Groove(s, { ridePart: true });
    crashAt(s.at(4), 0.6);
    fill(s, 7 * 16 + 8, 'D', { v: 0.9 });
  }
  function drop2Groove(s, { ridePart }) {
    loop(s, 0, 8, 'X...x...x...x...', (st, a) => put('kick', K.club, s.step(st), a === 1 ? 0.97 : 0.92, { pump: true }));
    loop(s, 0, 8, '....X.......X...', (st, a, b) => { if (b === 7 && st % 16 === 12) return; put('clap', clapB, s.step(st), 0.9); put('snare', snare, s.step(st), 0.66); });
    loop(s, 0, 8, '..x...x...x...x.', (st) => put('hats', ohat, hum(s.step(st), 0.002), hv(0.6), { pan: 0.15 }));
    loop(s, 0, 8, 'xo.oxo.oxo.oxo.o', (st, a, b) => { if (!ridePart && b === 7 && st % 16 >= 8) return; put('hats', hat, hum(swingT(s, st, 52), 0.003), hv(a === 0.8 ? 0.62 : 0.32), { pan: 0.12 }); });
    loop(s, 0, 8, 'x..x..x.x..x..x.', (st, a, b) => { if (b === 7 && st % 16 >= 8) return; put('perc', rim, s.step(st), hv(st % 16 === 0 ? 0.62 : 0.52, 0.05), { pan: -0.3 }); });
    loop(s, 0, 8, 'xoXoxoXoxoXoxoXo', (st, a) => put('perc', shaker, hum(swingT(s, st, 52), 0.003), hv(a * 0.42), { pan: -0.25 }));
    if (ridePart) loop(s, 0, 8, 'x...x...x...x...', (st, a, b) => { if (b === 7 && st % 16 >= 8) return; put('ride', ride, hum(s.step(st), 0.002), hv(0.5, 0.05), { pan: 0.35 }); });
  }
  // ------------------------------------------------------------------------------------------- pass 3
  { // breakdown: beatless bars 1-4 (crash exit hit on the downbeat); bars 5-8 half-time heartbeat kick LP 150 Hz,
    // ghost 8ths for the pad pulse, a shaker fading in; a soft timpani roll swells into build3
    const s = S('breakdown');
    crashAt(s.start, 0.85, 1);
    loop(s, 4, 8, 'X.......x.......', (st, a) => put('kick', heart, s.step(st), a === 1 ? 0.62 : 0.5, { lp: 150 }));
    for (let st = 64; st < 128; st += 2) studio.trigger('ghost8', s.step(st));
    const tr = []; for (let st = 120; st < 128; st += 0.5) tr.push(st);
    tr.forEach((st, i) => put('toms', timp, s.step(st) + R.gauss(0, 0.003), 0.12 + 0.45 * (i / (tr.length - 1)) ** 1.6, { midi: 45 }));
    // cut 2: a soft swung shaker creeps in under the heartbeat (bars 5-8) - the breakdown's only top end, and the first
    // sign that the beat is coming back; it fades up from almost nothing, like the intro's
    loop(s, 4, 8, 'xoxoxoxoxoxoxoxo', (st, a) => { const x = (st - 64) / 64; put('perc', shaker, hum(swingT(s, st, 56), 0.004), hv(a * (0.1 + 0.42 * x ** 1.3)), { pan: -0.25 }); });
  }
  { // build3 - the big one: kick quarters, claps 2/4 then every beat in bar 4, snare quarters from bar 3;
    // bars 5-8 kick 8ths (6-7) -> 16ths (8), snare 8ths -> 16ths -> 32nds; crash where the lift starts (bar 5)
    const s = S('build3');
    loop(s, 0, 5, 'X...x...x...x...', (st, a) => put('kick', K.club, s.step(st), a === 1 ? 0.92 : 0.86, { pump: true }));
    loop(s, 0, 3, '....X.......X...', (st) => put('clap', clapB, s.step(st), 0.8));
    loop(s, 3, 4, 'X...X...X...X...', (st) => put('clap', clapB, s.step(st), 0.82));
    loop(s, 2, 4, 'x...x...x...x...', (st) => put('snare', snare, s.step(st), 0.52));
    loop(s, 0, 4, '..x...x...x...x.', (st) => put('hats', hat, hum(s.step(st), 0.003), hv(0.62), { pan: 0.15 }));
    loop(s, 2, 4, 'o.o.o.o.o.o.o.o.', (st) => put('hats', hat, hum(s.step(st + 1), 0.003), hv(0.3), { pan: 0.15 }));
    crashAt(s.at(4), 0.75);
    const kr = []; for (let st = 80; st < 112; st += 2) kr.push(st); for (let st = 112; st < 120; st++) kr.push(st);
    kr.forEach((st, i) => put('kick', K.club, s.step(st), 0.82 + 0.03 * (i / (kr.length - 1)), { pump: st % 2 === 0 }));
    const sr = []; for (let st = 64; st < 80; st += 2) sr.push(st); for (let st = 80; st < 112; st++) sr.push(st); for (let st = 112; st < 120; st += 0.5) sr.push(st);
    snareRoll(s, sr, { semis: 7, hp0: 200, hp1: 1500, v0: 0.4, v1: 0.8 });
  }
  function bigGroove(s, { ridePart, clapAnd4 = false, stopAfter = Infinity, fills = [] }) {
    const ok = (st) => st <= stopAfter;
    loop(s, 0, 8, 'X...x...x...x...', (st, a) => ok(st) && put('kick', K.big, s.step(st), a === 1 ? 1 : 0.95, { pump: true }));
    loop(s, 0, 8, clapAnd4 ? '....X.......X.x.' : '....X.......X...', (st, a, b) => {
      if (!ok(st) || fills.some((f) => st >= f && st < f + 8)) return;
      const v = a === 1 ? 0.92 : 0.7;
      put('clap', clap, s.step(st), v, { pan: -0.25 }); put('clap', clapB, s.step(st), v, { pan: 0.25 });
      if (a === 1) put('snare', snareBig, s.step(st), 0.7);
    });
    loop(s, 0, 8, '..x...x...x...x.', (st) => ok(st) && put('hats', ohat, hum(s.step(st), 0.002), hv(0.62), { pan: 0.15 }));
    loop(s, 0, 8, 'xo.oxo.oxo.oxo.o', (st, a) => ok(st) && put('hats', hat, hum(s.step(st), 0.002), hv(a === 0.8 ? 0.66 : 0.34), { pan: 0.12 }));
    if (ridePart) loop(s, 0, 8, 'x...x...x...x...', (st) => ok(st) && put('ride', ride, hum(s.step(st), 0.002), hv(0.52, 0.05), { pan: 0.35 }));
    loop(s, 0, 8, 'xoXoxoXoxoXoxoXo', (st, a) => ok(st) && put('perc', shaker, hum(s.step(st), 0.003), hv(a * 0.45), { pan: -0.25 })); // straight 16ths (cut 2)
    for (const f of fills) fill(s, f, 'E', { v: 0.95, kind: f === 7 * 16 + 8 ? 'tom' : 'snare' });
  }
  { // drop3 - main stage, E minor: big-room kick, double clap + snare, open/closed hats, crash bars 1 and 5;
    // the last beat is the double-drop gap
    const s = S('drop3');
    crashAt(s.start, 1); crashAt(s.start, 0.8, 1);
    bigGroove(s, { ridePart: false });
    crashAt(s.at(4), 0.75, 1);
  }
  { // drop3b - the double drop: + ride, crash every 4 bars, 2-beat fills in bars 4 and 8
    const s = S('drop3b');
    crashAt(s.start, 1); crashAt(s.start, 0.8, 1);
    bigGroove(s, { ridePart: true, fills: [3 * 16 + 8, 7 * 16 + 8] });
    crashAt(s.at(4), 0.8, 1);
  }
  { // drop3c - all three drops unite: claps add the "and" of 4; bar 8 beat 3 = the deceptive-cadence crash, then
    // the drums stop
    const s = S('drop3c');
    crashAt(s.start, 0.95, 1); crashAt(s.start, 0.75);
    bigGroove(s, { ridePart: true, clapAnd4: true, stopAfter: 7 * 16 + 8, fills: [3 * 16 + 8] });
    crashAt(s.at(2), 0.78, 1); crashAt(s.at(4), 0.85); crashAt(s.at(6), 0.8, 1); // crash every 2 bars (cut 2)
    const t = s.step(7 * 16 + 8);
    crashAt(t, 1); crashAt(t, 0.85, 1);
    put('snare', snareBig, t, 0.85); put('clap', clap, t, 0.9, { pan: -0.25 }); put('clap', clapB, t, 0.9, { pan: 0.25 });
    put('toms', tom, t, 0.9, { midi: 40 });
  }
  { // tag (ritardando): no kick or hats; one timpani hit per half-bar chord (Am7, Em/G, B7), a crescendo roll on B,
    // then the FINAL HIT (Em add9) with both crashes
    const s = S('tag');
    put('toms', timp, s.step(0), 0.85, { midi: 45 }); crashAt(s.step(0), 0.7);
    put('toms', timp, s.step(8), 0.8, { midi: 43 });
    put('toms', timp, s.step(16), 0.85, { midi: 47 });
    const tr = []; for (let st = 16.5; st < 24; st += 0.5) tr.push(st);
    tr.forEach((st, i) => put('toms', timp, s.step(st) + R.gauss(0, 0.002), 0.25 + 0.55 * (i / (tr.length - 1)) ** 1.5, { midi: 47 }));
    const fin = s.step(24);
    put('toms', timp, fin, 1, { midi: 40 }); put('toms', tom, fin, 0.95, { midi: 38 });
    crashAt(fin, 1); crashAt(fin, 0.9, 1);
    put('snare', snareBig, fin, 0.75);
  }

  // ------------------------------------------------------------------------------------------- render
  H.sort((a, b) => a.t - b.t);
  // chokes: each kick cuts the previous kick's tail (mono sampler); open hats are choked by the next hat
  const lastBy = new Map();
  for (const h of H) {
    if (h.stem === 'kick' || h.stem === 'hats') {
      const p = lastBy.get(h.stem);
      if (p && (p.stem === 'kick' || p.v === ohat)) { const gap = h.t - p.t; if (gap > 0) p.dur = Math.min(p.dur ?? Infinity, gap, 1); } // (<= 1 s: longer than any kick/open-hat sample, so the audio is unchanged; the piano roll stops drawing a kick 'drone' across beatless bars)
      lastBy.set(h.stem, h);
    }
  }
  for (const h of H) {
    const note = { time: h.t, vel: h.vel, pan: h.pan ?? 0 };
    for (const k of ['dur', 'midi', 'semis', 'hp', 'lp', 'gain']) if (h[k] !== undefined && Number.isFinite(h[k])) note[k] = h[k];
    studio.stem(h.stem).play(h.v, note);
    if (h.pump) studio.trigger('pump', h.t);
  }
  gateSilences(studio, ['kick', 'snare', 'clap', 'snap', 'hats', 'perc', 'ride', 'cymbals', 'toms'].filter((n) => studio.stems.has(n)).map((n) => studio.stem(n)));
}
