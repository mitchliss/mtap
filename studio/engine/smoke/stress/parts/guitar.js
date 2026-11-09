// stress: acoustic 8th strums everywhere, clean electric melody in drops, muted 16ths in drops
export default function guitar(studio) {
  const E = studio.engine;
  const ac = new E.inst.AcousticGuitar({ seed: 'st-ac' }), perf = ac.performance({ seed: 'st' });
  for (const s of studio.sections) for (let e = 0; e < s.bars * 8; e++) {
    const t = s.step(e * 2), ch = studio.chordAt(t);
    perf.strum({ time: t, chord: ch.symbol, dir: e % 2 ? 'up' : 'down', vel: e % 2 ? 0.6 : 0.85 });
  }
  perf.flush(studio.stem('gtr_acoustic'));
  const eg = new E.inst.ElectricGuitar({ seed: 'st-eg', tone: 'clean' }), mu = new E.inst.ElectricGuitar({ seed: 'st-mu', tone: 'mute' });
  for (const s of studio.sectionsByRole('drop')) {
    for (const n of studio.melody(s.name)) studio.stem('gtr_clean').play(eg, { time: n.time, midi: n.midi + 12, vel: 0.75, dur: n.dur });
    for (let i = 0; i < s.bars * 16; i++) {
      const t = s.step(i), c = studio.chordAt(t);
      studio.stem('gtr_muted').play(mu, { time: t, midi: E.theory.pcAtOrAbove(c.root, 50), vel: 0.6, dur: 0.1 });
    }
  }
}
