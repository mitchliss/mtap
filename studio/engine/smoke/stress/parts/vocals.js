// stress: 6-singer choir chords in every non-intro section + sung chops on every melody note in drops
export default function vocals(studio) {
  const E = studio.engine;
  const choir = new E.inst.Choir({ type: 'alto', singers: 6, seed: 'st-ch' }), v = new E.inst.Voice({ type: 'soprano', seed: 'st-v' });
  for (const s of studio.sections) {
    if (s.role === 'intro') continue;
    for (const c of studio.chordsIn(s.name).filter((_, i) => i % 2 === 0)) {
      for (const m of E.theory.voicing(c, { low: 57, high: 72, voices: 3 })) studio.stem('choir').play(choir, { time: c.start, midi: m, vel: 0.6, dur: (c.end - c.start) * 2, text: 'ah' });
    }
  }
  const syl = ['od', 'lo', 'av', 'dah', 'tik', 'va', 'te', 'nu'];
  for (const s of studio.sectionsByRole('drop')) {
    studio.melody(s.name).forEach((n, i) => studio.stem('chops').play(v, { time: n.time, midi: n.midi + 12, vel: 0.8, dur: Math.min(0.4, n.dur), text: syl[i % syl.length] }));
  }
}
