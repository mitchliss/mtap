// stress: piano melody (2 octaves) + 4-note chords everywhere, rhodes chords everywhere, string pads everywhere
export default function keys(studio) {
  const E = studio.engine;
  const pno = new E.inst.Piano({ seed: 'st-pno' }), ep = new E.inst.EPiano({ seed: 'st-ep' }), str = new E.inst.Strings({ seed: 'st-str' });
  const piano = studio.stem('piano'), rhodes = studio.stem('rhodes'), strings = studio.stem('strings');
  for (const n of studio.melodyNotes) {
    piano.play(pno, { time: n.time, midi: n.midi + 12, vel: 0.7, dur: n.dur });
    piano.play(pno, { time: n.time, midi: n.midi, vel: 0.6, dur: n.dur });
  }
  let prev, prev2;
  for (const c of studio.chords) {
    prev = E.theory.voicing(c, { prev, low: 53, high: 72, voices: 4 });
    for (const m of prev) {
      piano.play(pno, { time: c.start, midi: m, vel: 0.5, dur: c.end - c.start });
      rhodes.play(ep, { time: c.start, midi: m, vel: 0.55, dur: (c.end - c.start) * 0.95 });
    }
    prev2 = E.theory.voicing(c, { prev: prev2, low: 50, high: 69, voices: 3 });
    for (const m of prev2) strings.play(str, { time: c.start, midi: m, vel: 0.5, dur: c.end - c.start, articulation: 'legato' });
  }
}
