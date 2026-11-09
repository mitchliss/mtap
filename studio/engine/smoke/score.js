// Engineer's smoke-test song (~20 s). Not the real arrangement: it exercises every engine family end to end.
export default {
  title: 'Studio smoke test',
  key: 'D minor',
  tail: 6,
  sections: [
    { name: 'intro', bars: 2, bpm: 124, transpose: 0, energy: 0.3, role: 'intro', melody: { fromBar: 0 }, chords: null, notes: 'guitar strums, piano melody, EP chords' },
    { name: 'build', bars: 2, bpm: [124, 128], transpose: 0, energy: 0.6, role: 'build', melody: { fromBar: 2 }, chords: null, notes: 'snare roll, riser, choir ah, tempo ramp' },
    { name: 'drop', bars: 4, bpm: 128, transpose: 0, energy: 1, role: 'drop', melody: { fromBar: 8 }, chords: null, notes: 'full drums, supersaw lead + pad, bass, sung lead' },
    { name: 'outro', bars: 2, bpm: 128, transpose: 0, energy: 0.4, role: 'outro', melody: { fromBar: 18, bars: 1 }, chords: ['Dm'], notes: 'final chord rings out' },
  ],
};
