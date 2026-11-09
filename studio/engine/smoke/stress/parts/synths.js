// stress: supersaw lead + pad + pluck arps + bass + sub in every drop and build
export default function synths(studio) {
  const E = studio.engine;
  const lead = new E.inst.Synth('supersaw-lead', { seed: 'st-lead' }), pad = new E.inst.Synth('supersaw-pad', { seed: 'st-pad' });
  const pluck = new E.inst.Synth('pluck', { seed: 'st-pl' }), bass = new E.inst.Synth('saw-bass', { seed: 'st-b' }), sub = new E.inst.Synth('sub', { seed: 'st-s' });
  for (const s of studio.sections.filter((x) => x.role === 'drop' || x.role === 'build')) {
    for (const n of studio.melody(s.name)) studio.stem('lead').play(lead, { time: n.time, midi: n.midi + 12, vel: 0.85, dur: n.dur * 0.95 });
    let prev;
    for (const c of studio.chordsIn(s.name)) {
      const len = c.end - c.start;
      prev = E.theory.voicing(c, { prev, low: 57, high: 76, voices: 4 });
      for (const m of prev) studio.stem('pad').play(pad, { time: c.start, midi: m, vel: 0.7, dur: len });
      const arp = E.theory.arpeggio(prev, 'updown', 8, { octaves: 2 });
      for (let k = 0; k < 8; k++) studio.stem('pluck').play(pluck, { time: c.start + (len * k) / 8, midi: arp[k] + 12, vel: 0.7, dur: 0.12 });
      const root = E.theory.pcAtOrAbove(c.bass, 38);
      for (let k = 0; k < 4; k++) {
        const t = c.start + (len * k) / 4;
        studio.stem('bass').play(bass, { time: t + len / 8, midi: root, vel: 0.8, dur: 0.12 });
        studio.stem('sub').play(sub, { time: t, midi: root, vel: 0.9, dur: 0.2 });
      }
    }
  }
}
