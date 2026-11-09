// smoke: supersaw lead + pad, bass + sub, bell
export default function synths(studio) {
  const { engine: E } = studio;
  const drop = studio.section('drop');
  const lead = new E.inst.Synth('supersaw-lead', { seed: 'lead' });
  const ls = studio.stem('lead');
  for (const n of studio.melody('drop')) ls.play(lead, { time: n.time, midi: n.midi + 12, vel: 0.85, dur: n.dur * 0.92 });
  const pad = new E.inst.Synth('supersaw-pad', { seed: 'pad' });
  const ps = studio.stem('pad');
  let prev;
  for (const c of studio.chordsIn('drop')) {
    prev = E.theory.voicing(c, { prev, low: 57, high: 76, voices: 4 });
    for (const m of prev) ps.play(pad, { time: c.start, midi: m, vel: 0.7, dur: c.end - c.start });
  }
  const bass = new E.inst.Synth('saw-bass', { seed: 'bass' }), sub = new E.inst.Synth('sub', { seed: 'sub' });
  const bs = studio.stem('bass'), ss = studio.stem('sub');
  for (let s = 0; s < drop.bars * 16; s += 2) {
    const t = drop.step(s), c = studio.chordAt(t), root = E.theory.pcAtOrAbove(c.bass, 38); // D2..C#3
    if (s % 4 === 2) bs.play(bass, { time: t, midi: root, vel: 0.85, dur: studio.timeline.noteLen('1/8', t) * 0.9 });
    if (s % 4 === 0) ss.play(sub, { time: t, midi: root, vel: 0.9, dur: studio.timeline.noteLen('1/4', t) * 0.95 });
  }
  const bell = new E.inst.Bell({ seed: 'bell' }), bl = studio.stem('bells');
  for (const n of studio.melody('drop').filter((_, i) => i % 2 === 0)) bl.play(bell, { time: n.time, midi: n.midi + 24, vel: 0.5 });
}
