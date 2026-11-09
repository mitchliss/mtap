// Engineer's EXAMPLE score (fallback only). render.mjs uses studio/song/score.js when it exists and this file
// otherwise. It follows the STUDIO.md contract and is a complete, valid ~3:20 festival-pop arrangement used to
// test the studio end to end. The real arrangement is the Producer's score.js.
//
// Section fields: name (unique), bars, bpm (number | [start, end] = linear ramp in beats across the section),
// transpose (semitones), energy (0..1 hint), role (intro|verse|prechorus|build|drop|breakdown|bridge|outro),
// melody ({ fromBar, bars?, octave? } | null), chords (null = anthem chords for those bars | array of symbols,
// one per half-bar, cycled; written in the ANTHEM key, the section's transpose is applied on top), notes (free text).
export default {
  title: 'Hatikvah (studio example score)',
  key: 'D minor',
  tail: 8, // seconds rendered after the last section so the final chord can ring out
  sections: [
    { name: 'intro', bars: 2, bpm: 124, transpose: 0, energy: 0.25, role: 'intro', melody: { fromBar: 8, bars: 2 }, chords: null, notes: 'piano alone states the refrain call' },
    { name: 'verse1', bars: 8, bpm: 124, transpose: 0, energy: 0.4, role: 'verse', melody: { fromBar: 0 }, chords: null, notes: 'acoustic strum + piano melody, snaps on 2 and 4' },
    { name: 'build1', bars: 4, bpm: [124, 128], transpose: 0, energy: 0.65, role: 'build', melody: { fromBar: 8, bars: 2 }, chords: ['Dm', 'Dm', 'Bb', 'Bb', 'C', 'C', 'A', 'A'], notes: 'snare roll 8ths -> 16ths -> 32nds, riser, HP sweep on the music bus' },
    { name: 'drop1', bars: 16, bpm: 128, transpose: 0, energy: 0.8, role: 'drop', melody: { fromBar: 8 }, chords: null, notes: 'four on the floor, pluck + piano lead, sidechained pads (bars 8-19 of the anthem, then 0-3)' },
    { name: 'verse2', bars: 8, bpm: 128, transpose: 0, energy: 0.55, role: 'verse', melody: { fromBar: 0 }, chords: null, notes: 'Rhodes + clean guitar, half-time drums' },
    { name: 'build2', bars: 8, bpm: [128, 132], transpose: 0, energy: 0.75, role: 'build', melody: { fromBar: 8, bars: 4 }, chords: null, notes: 'longer build, choir pad swells' },
    { name: 'drop2', bars: 16, bpm: 132, transpose: 0, energy: 0.92, role: 'drop', melody: { fromBar: 8, octave: 1 }, chords: null, notes: 'supersaw lead an octave up, vocal chops answer' },
    { name: 'breakdown', bars: 8, bpm: 132, transpose: 0, energy: 0.45, role: 'breakdown', melody: { fromBar: 16, bars: 4 }, chords: ['Bb', 'F', 'Gm', 'A', 'Bb', 'F', 'Gm', 'A'], notes: 'piano + strings + choir, no kick' },
    { name: 'bridge', bars: 8, bpm: 132, transpose: 0, energy: 0.6, role: 'bridge', melody: { fromBar: 4 }, chords: null, notes: 'half-time groove, guitar + Rhodes carry the verse line' },
    { name: 'build3', bars: 4, bpm: [132, 134], transpose: 0, energy: 0.8, role: 'build', melody: null, chords: ['Gm', 'Gm', 'A', 'A'], notes: 'pure build, 1 beat of silence at the end' },
    { name: 'drop3', bars: 16, bpm: 134, transpose: 2, energy: 1, role: 'drop', melody: { fromBar: 8 }, chords: null, notes: 'key lift to E minor, everything plays' },
    { name: 'tag', bars: 4, bpm: 134, transpose: 2, energy: 0.85, role: 'drop', melody: { fromBar: 16, bars: 4 }, chords: null, notes: 'last line once more, full band' },
    { name: 'outro', bars: 4, bpm: [134, 110], transpose: 2, energy: 0.3, role: 'outro', melody: { fromBar: 18, bars: 2 }, chords: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Dm', 'Dm', 'Dm'], notes: 'ritardando (chords written in D minor, sounding in E minor), final chord rings out' },
  ],
};

// Optional named export: arrangement cues for the parts (studio.cues). The studio itself understands
// silenceBeats (studio.silences / studio.inSilence(t) and the blue bands on the analysis PNGs).
export const cues = {
  silenceBeats: { build3: 1 },
};
