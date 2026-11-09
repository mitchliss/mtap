// smoke: grand piano melody + EP chords + strings
export default function keys(studio) {
  const { engine: E } = studio;
  const pno = new E.inst.Piano({ seed: 'smoke-pno', brightness: 0.55 });
  const piano = studio.stem('piano');
  for (const n of studio.melody('intro')) piano.play(pno, { time: n.time, midi: n.midi + 12, vel: 0.6 + 0.15 * (n.steps >= 4), dur: n.dur });
  for (const c of studio.chordsIn('intro')) piano.play(pno, { time: c.start, midi: 48 + c.root - (c.root > 7 ? 12 : 0), vel: 0.5, dur: c.end - c.start });
  const ep = new E.inst.EPiano({ seed: 'smoke-ep' });
  const eps = studio.stem('epiano');
  let prev;
  for (const c of [...studio.chordsIn('intro'), ...studio.chordsIn('build')]) {
    prev = E.theory.voicing(c, { prev, low: 55, high: 74, voices: 4 });
    for (const m of prev) eps.play(ep, { time: c.start, midi: m, vel: 0.55, dur: (c.end - c.start) * 0.95 });
  }
  const str = new E.inst.Strings({ seed: 'smoke-str', players: 5 });
  const strings = studio.stem('strings');
  for (const c of studio.chordsIn('drop')) for (const m of E.theory.voicing(c, { low: 50, high: 67, voices: 3 })) strings.play(str, { time: c.start, midi: m, vel: 0.45, dur: c.end - c.start, articulation: 'legato' });
  const o = studio.section('outro');
  for (const m of [50, 57, 62, 65, 69]) strings.play(str, { time: o.start, midi: m, vel: 0.6, dur: o.dur + 1.5 });
}
