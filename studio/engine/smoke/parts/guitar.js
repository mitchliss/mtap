// smoke: acoustic guitar strumming + electric picking
export default function guitar(studio) {
  const { engine: E } = studio;
  const gtr = new E.inst.AcousticGuitar({ seed: 'smoke-ac', brightness: 0.6 });
  const perf = gtr.performance({ seed: 'strum' });
  // 8th-note pattern: D . D(mute) U . U D U
  const pattern = [['down', 0], ['down', 2], ['up', 3], ['up', 5], ['down', 6], ['up', 7]];
  for (const name of ['intro', 'build']) {
    const sec = studio.section(name);
    for (let bar = 0; bar < sec.bars; bar++) for (const [dir, e8] of pattern) {
      const t = sec.at(bar, e8 / 2), ch = studio.chordAt(t);
      perf.strum({ time: t, chord: ch.symbol, dir, vel: dir === 'down' ? 0.85 : 0.6, mute: e8 === 2 ? 'dead' : false });
    }
  }
  perf.flush(studio.stem('acoustic'));
  const eg = new E.inst.ElectricGuitar({ seed: 'smoke-eg', tone: 'clean', pickup: 'neck' });
  const drop = studio.section('drop'), st = studio.stem('electric');
  for (let s = 0; s < drop.bars * 16; s += 2) {
    const t = drop.step(s), ch = studio.chordAt(t);
    const notes = E.theory.voicing(ch, { low: 62, high: 79, voices: 3 });
    st.play(eg, { time: t, midi: notes[(s / 2) % 3], vel: 0.6 + 0.2 * ((s / 2) % 2), dur: 0.2 });
  }
}
