// Musician B - transition sound design. Every section boundary gets an event (brief section 1 "Transitions"),
// and nothing plays through a planned silence except the build3 breath:
//   fx_rise   noise risers (build length, width growing, ending exactly where the silence starts), pitch risers,
//             short uplifts into the second halves of drops
//   fx_sweep  reverse cymbals and downlifters
//   fx_hit    impacts, sub drops, sub swells ("soft" downbeats), tag sub booms
//   fx_breath the inhale in the build3 gap (-24 dB, the one sound the brief allows in a silence)
import { NoiseRiser, PitchRiser, ImpactB, SubDrop, SubSwell, SubBoom, Breath, gateSilences } from '../instruments/b-kit.js';

export const order = 80;

export default function fx(studio) {
  const E = studio.engine;
  const S = (n) => studio.section(n);
  const rise = studio.stem('fx_rise'), sweep = studio.stem('fx_sweep'), hit = studio.stem('fx_hit'), breath = studio.stem('fx_breath');
  const silenceStart = (name) => { const z = studio.silences.find((w) => w.section === name); return z ? z.start : S(name).end; };
  const bars = (sec, n) => sec.at(n) - sec.start; // seconds of the first n bars of a section (tempo-ramp safe)
  const lastBars = (sec, n) => sec.end - sec.at(sec.bars - n);

  const nr = new NoiseRiser({ seed: 'b:riser', endDb: -15 }); // cut 2: peaks ~-14 re the kick, width <= 0.6
  const nrShort = new NoiseRiser({ seed: 'b:uplift', from: 600, to: 10000, startDb: -36, endDb: -16 });
  const pr = new PitchRiser({ semis: 12 });
  const impact = new ImpactB();
  const subDrop = new SubDrop({ from: 55, to: 36 }); // cut 2: never below 35 Hz
  const swell = new SubSwell();
  const boom = new SubBoom();
  const rev = new E.sfx.ReverseCymbal({ seed: 'b:rev' });
  const down = new E.sfx.Downlifter({ from: 8000, to: 200, tone: 0.3, seed: 'b:down' });

  const revInto = (t, dur, vel = 0.9) => { const d = Math.min(2.55, dur); sweep.play(rev, { time: t - d, dur: d, vel }); };
  const riserTo = (t0, t1, vel = 1, inst = nr) => rise.play(inst, { time: t0, dur: t1 - t0, vel });

  // ---- pass 1
  const v1 = S('verse1'), intro = S('intro');
  revInto(v1.start, bars(intro, 1), 0.8);
  riserTo(intro.at(1), v1.start, 0.55, nrShort);
  hit.play(swell, { time: v1.start - (intro.at(2) - intro.at(1, 3)), pre: intro.at(2) - intro.at(1, 3), post: 1.4, midi: 38, vel: 0.75 });
  const v1b = S('verse1b');
  revInto(v1b.start, v1.end - v1.at(3, 2), 0.45);
  const b1 = S('build1');
  revInto(b1.start, bars(v1b, 1), 0.9);
  riserTo(b1.start, silenceStart('build1'));
  const d1 = S('drop1');
  hit.play(impact, { time: d1.start, vel: 1 });
  const d1b = S('drop1b');
  riserTo(d1.at(7), d1b.start, 0.7, nrShort);
  // drop1b -> verse2: downlifter from beat 3 of the last bar, falling across the verse's first bars
  const v2 = S('verse2');
  sweep.play(down, { time: d1b.at(7, 2), dur: v2.at(2) - d1b.at(7, 2), vel: 0.8 });

  // ---- pass 2
  const b2 = S('build2');
  riserTo(b2.start, silenceStart('build2'));
  rise.play(pr, { time: b2.at(4), dur: silenceStart('build2') - b2.at(4), midi: 57, vel: 0.6 });
  const d2 = S('drop2');
  hit.play(impact, { time: d2.start, vel: 1 });
  riserTo(d2.at(7), silenceStart('drop2'), 0.7, nrShort);
  const d2b = S('drop2b'), bd = S('breakdown');
  sweep.play(down, { time: d2b.at(7, 3), dur: bd.at(2) - d2b.at(7, 3), vel: 0.95 });
  hit.play(subDrop, { time: bd.start, dur: 1.2, vel: 0.9 });

  // ---- pass 3
  revInto(bd.at(4), bd.at(4) - bd.at(3), 0.75);
  const b3 = S('build3');
  revInto(b3.start, lastBars(bd, 1), 0.9);
  const sw = b3.at(0) - bd.at(7, 3);
  hit.play(swell, { time: b3.start - sw, pre: sw, post: 1.6, midi: 41, vel: 0.8 });
  riserTo(b3.start, silenceStart('build3'));
  rise.play(pr, { time: b3.at(4), dur: silenceStart('build3') - b3.at(4), midi: 50, vel: 0.6 });
  { // the inhale in the gap: starts a beat after the cut, ends ~0.1 s before the downbeat
    const z = studio.silences.find((w) => w.section === 'build3');
    if (z) { const t0 = z.start + 0.18, t1 = z.end - 0.09; breath.play(new Breath(), { time: t0, dur: t1 - t0, vel: 1 }); }
  }
  const d3 = S('drop3'), d3b = S('drop3b'), d3c = S('drop3c');
  hit.play(impact, { time: d3.start, vel: 1 });
  // cut 3: the main-stage sub drop falls an octave E2 -> E1 and lands on the tonic the kick and sub now share (cut 2
  // fell from B1, the old kick tail)
  hit.play(new SubDrop({ from: 82.4, to: 41.2 }), { time: d3.start, dur: 1.3, vel: 0.9 });
  riserTo(d3.at(7), silenceStart('drop3'), 0.75, nrShort);
  hit.play(impact, { time: d3b.start, vel: 0.95 });
  riserTo(d3b.at(7), d3c.start, 0.75, nrShort);
  // deceptive cadence: crash on beat 3 of drop3c bar 8, then a reverse swell into the tag
  const tag = S('tag');
  revInto(tag.start, tag.start - d3c.at(7, 2), 0.95);

  // ---- tag: a sub boom under every half-bar hit (Am7, Em/G, B7), then the final hit with impact + sub drop
  const hits = [[0, 33], [8, 31], [16, 35]];
  for (const [st, m] of hits) hit.play(boom, { time: tag.step(st), midi: m, vel: 0.8, tau: 0.5 });
  const fin = tag.step(24);
  hit.play(boom, { time: fin, midi: 28, vel: 1, tau: 0.9 });
  hit.play(impact, { time: fin, vel: 1 });
  hit.play(new SubDrop({ from: 82.4, to: 41.2 }), { time: fin, dur: 1.6, vel: 0.7 }); // cut 3: ends on E1, the final chord's root

  gateSilences(studio, [rise, sweep, hit]);
}
