// stress: risers on builds, impacts + reverse cymbals into drops, downlifters at drop ends
export default function fx(studio) {
  const E = studio.engine, st = studio.stem('fx');
  for (const s of studio.sectionsByRole('build')) st.play(new E.sfx.Riser({ seed: s.name }), { time: s.start, dur: s.dur, vel: 0.9 });
  for (const s of studio.sectionsByRole('drop')) {
    st.play(new E.sfx.Impact({ seed: s.name }), { time: s.start, dur: 3, vel: 0.8 });
    st.play(new E.sfx.ReverseCymbal({ seed: s.name }), { time: s.start - 1.8, dur: 1.8, vel: 0.7 });
    st.play(new E.sfx.Downlifter({ seed: s.name }), { time: s.end - 2, dur: 2, vel: 0.5 });
  }
}
