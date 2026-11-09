// smoke: transition FX
export default function fx(studio) {
  const { engine: E } = studio;
  const build = studio.section('build'), drop = studio.section('drop'), outro = studio.section('outro');
  const st = studio.stem('fx');
  st.play(new E.sfx.Riser({ seed: 'r1' }), { time: build.start, dur: build.dur, vel: 0.9 });
  st.play(new E.sfx.ReverseCymbal({ seed: 'rc' }), { time: drop.start - 1.5, dur: 1.5, vel: 0.8 });
  st.play(new E.sfx.Impact({ seed: 'im' }), { time: drop.start, dur: 3, vel: 0.8 });
  st.play(new E.sfx.Downlifter({ seed: 'dl' }), { time: outro.start, dur: 2, vel: 0.6 });
}
