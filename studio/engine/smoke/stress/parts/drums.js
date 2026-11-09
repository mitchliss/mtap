// stress: full-song drums at drop density everywhere except intro/outro
export default function drums(studio) {
  const E = studio.engine, kit = new E.inst.DrumKit({ seed: 'stress' });
  const st = (n) => studio.stem(n);
  for (const s of studio.sections) {
    if (s.role === 'intro' || s.role === 'outro') continue;
    for (let i = 0; i < s.bars * 16; i++) {
      const t = s.step(i), b = i % 16;
      if (b % 4 === 0) st('kick').play(kit.kick, { time: t, vel: 0.95 });
      if (b === 4 || b === 12) { st('clap').play(kit.clap, { time: t, vel: 0.9 }); st('snare').play(kit.snare, { time: t, vel: 0.7 }); }
      if (b % 4 === 2) st('hats').play(kit.openhat, { time: t, vel: 0.7, dur: 0.12 }); else st('hats').play(kit.hat, { time: t, vel: E.groove.accent(b) * 0.8 });
      st('perc').play(kit.shaker, { time: t, vel: i % 2 ? 0.5 : 0.7 });
      if (s.role === 'build') st('snare').play(kit.snare, { time: t, vel: 0.3 + (0.6 * i) / (s.bars * 16) });
    }
    st('cymbals').play(kit.crash, { time: s.start, vel: 0.9 });
  }
}
