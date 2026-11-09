// smoke: choir "ah" in the build, solo voice singing lyric syllables in the drop
export default function vocals(studio) {
  const { engine: E } = studio;
  const choir = new E.inst.Choir({ type: 'alto', singers: 4, seed: 'smoke-choir' });
  const cs = studio.stem('choir');
  for (const c of studio.chordsIn('build').filter((_, i) => i % 2 === 0)) {
    for (const m of E.theory.voicing(c, { low: 57, high: 72, voices: 3 })) cs.play(choir, { time: c.start, midi: m, vel: 0.6, dur: (c.end - c.start) * 2, text: 'ah' });
  }
  const v = new E.inst.Voice({ type: 'soprano', seed: 'smoke-vox', breath: 0.3 });
  const vs = studio.stem('vox');
  const words = ['od', 'lo', 'av', 'dah', 'tik', 'va', 'te', 'nu', 'ha', 'tik', 'vah', 'bat', 'shnot', 'al', 'pa', 'yim'];
  let prev = null;
  studio.melody('drop').forEach((n, i) => {
    vs.play(v, { time: n.time, midi: n.midi, vel: 0.8, dur: n.dur * 0.95, text: words[i % words.length], glideFrom: prev !== null && Math.abs(prev - n.midi) <= 2 ? prev : undefined });
    prev = n.midi;
  });
}
