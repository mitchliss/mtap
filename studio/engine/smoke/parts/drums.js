// smoke: drum kit through the pattern helpers
export const order = 10;
export default function drums(studio) {
  const { engine: E } = studio;
  const kit = new E.inst.DrumKit({ seed: 'smoke', kick: { tune: 49, decay: 0.45 } });
  const kick = studio.stem('kick'), clap = studio.stem('clap'), hats = studio.stem('hats'), perc = studio.stem('perc'), cym = studio.stem('cymbals');
  const human = studio.rng('groove');
  const drop = studio.section('drop'), build = studio.section('build'), outro = studio.section('outro');
  for (let st = 0; st < drop.bars * 16; st++) {
    const t = drop.step(st), b = st % 16;
    if (b % 4 === 0) kick.play(kit.kick, { time: t, vel: 0.95 });
    if (b === 4 || b === 12) clap.play(kit.clap, { time: t + 0.004, vel: 0.9 });
    if (b % 4 === 2) hats.play(kit.openhat, { time: t, vel: 0.7, dur: studio.timeline.noteLen('1/16', t) * 1.6 });
    else hats.play(kit.hat, { time: t + human.gauss(0, 0.003), vel: E.groove.accent(b) * 0.75 });
    perc.play(kit.shaker, { time: t + (st % 2 ? 0.012 : 0), vel: st % 2 ? 0.5 : 0.75 });
  }
  cym.play(kit.crash, { time: drop.start, vel: 0.95 });
  // build: snare roll 8ths -> 16ths -> 32nds with rising velocity
  const roll = studio.stem('roll');
  for (let beat = 0; beat < build.bars * 4; beat++) {
    const div = beat < 4 ? 2 : beat < 6 ? 4 : 8;
    for (let k = 0; k < div; k++) {
      const pos = beat + k / div, t = build.beat(pos);
      roll.play(kit.snare, { time: t, vel: 0.35 + 0.6 * (pos / (build.bars * 4)) });
    }
  }
  for (let beat = 0; beat < 8; beat++) kick.play(kit.kick, { time: build.beat(beat), vel: 0.8 });
  // outro: one final hit
  kick.play(kit.kick, { time: outro.start, vel: 1 });
  cym.play(kit.crash, { time: outro.start, vel: 0.9 });
}
