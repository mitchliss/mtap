# MTap Studio: "Hatikvah" (festival/pop-EDM production)

This is the offline production studio for MTap's Hatikvah track. MTap is a family geography
game. The family asked for Hatikvah as its music, and the old track was synthesized live in
the browser. Their latest feedback was that it sounds like a cheap game. They want a real
production in the vein of a Tiësto / Chainsmokers record:

- Rich and deep, with real-sounding instruments: separate drums, guitar and keyboards.
- Pop polish, with real builds and drops.
- Vocals are welcome.

Earlier rounds of family feedback still stand:

- Upbeat. The first stately anthem version was too slow.
- Get into the actual song fast. One version "took a while to get into the actual song".
- Keep building: more beats and drops as it goes, getting more bumping, and the tempo picks
  up as the song goes on.
- Melody-first: it must be unmistakably Hatikvah.

Hatikvah's melody and lyrics are public domain (Imber 1878; melody arranged by Cohen 1888).

The studio renders OFFLINE in Node to a stereo 44.1 kHz WAV. The WAV is later encoded to AAC
and streamed by the game, which replays the file from the top when it ends. The song must have
a real ending, not a loop seam.

## Hard rules (everyone)

- **Pure JavaScript, Node 24 built-ins only** (`zlib` for PNG is fine).
  - No npm installs and no network downloads.
  - No sample files from anywhere. Every sound is synthesized or physically modelled in code:
    Karplus-Strong / waveguide guitar, FM or modal electric piano, additive/modal piano,
    oscillator and noise drums, formant/glottal vocals, and so on.
- **Edit only inside `studio/`**, and only the files your role owns (see Ownership). Never
  touch `src/`, `test/`, `public/`, `index.html`, `package*.json`, or git (no commits).
- **Deterministic:** all randomness comes from seeded RNGs, so the same code gives the same
  render.
- **Render budget:** a full song render runs in **≤ 4 min wall-clock** with `node --max-old-space-size=4096`.
  Mix stems into busses rather than holding dozens of full-length stereo buffers.
- **Nobody can listen.** Agents can't hear audio. Judge with the analysis outputs: loudness,
  spectral balance, stereo, density, spectrogram/piano-roll PNGs you can view with the Read
  tool. Also use deep knowledge of how these records are built: arrangement, voicing,
  sound-design recipes, and mix numbers. Say plainly what you could and couldn't verify.
- **Melody fidelity:** the Hatikvah tune (below) is the hook. You may change octave, rhythm
  feel (light syncopation, pickups, anticipations), reharmonize, and chop it for vocal-chop
  drops. A listener who knows the anthem must recognise it within seconds of every melodic
  section.

## The anthem data

`import { HATIKVAH_SCORE } from '../../src/music.js'` (from `studio/song/` or `studio/engine/`,
adjust the path). Importing it from Node is safe.

- `HATIKVAH_SCORE.melody`: `[midi, lengthInSixteenths][]`. The melody is in D minor. It is
  20 bars of 4/4 at 16 sixteenths per bar, 320 steps total, and starts on step 0.
  - Bars 0–3: verse line A ("Kol od balevav penimah…"), ending in cadence 1.
  - Bars 4–7: verse line A again, ending in cadence 2.
  - Bars 8–11: refrain A ("Od lo avdah tikvatenu…"), the high D repeated notes.
  - Bars 12–15: refrain B ("Lihyot am chofshi b'artzenu…").
  - Bars 16–19: refrain B repeated (the final line).
- `HATIKVAH_SCORE.chords`: 40 chord names, one per half-bar, from
  `Dm, Gm, A, C, F, Bb` (A = A major, the harmonic-minor V).

## Ownership

| Path | Owner |
|---|---|
| `studio/engine/**`, `studio/render.mjs`, `studio/engine/API.md` | **Engineer** (studio tech: DSP core, effects, mix/master chain, render + analysis tooling) |
| `studio/song/brief.md`, `studio/song/score.js` | **Producer** |
| `studio/song/parts/keys.js`, `guitar.js`, `bass.js`, `leads.js`, `vocals.js` (and any `studio/song/instruments/a-*.js`) | **Musician A** (keys / guitar / bass / topline & vocals) |
| `studio/song/parts/drums.js`, `fx.js`, `studio/song/mix.js` (and any `studio/song/instruments/b-*.js`) | **Musician B** (drums / groove / sound design / mix & master) |
| `studio/song/LABEL-NOTES.md` | Producer (records each round of label notes at the recut) |
| `studio/out/**` | render output (git-ignored) |

If you need a change in a file you don't own, write the request in your final report. Don't
edit that file.

## Contracts

### `studio/song/score.js` (Producer)
```js
export default {
  title: 'Hatikvah (MTap festival mix)',
  key: 'D minor',
  sections: [
    // in order; bars are 4/4
    {
      name: 'intro',            // unique
      bars: 4,
      bpm: 126,                 // number, or [startBpm, endBpm] for a linear ramp across the section
      transpose: 0,             // semitones applied to melody + chords in this section
      energy: 0.3,              // 0..1 arrangement intensity (a hint to the musicians)
      role: 'intro',            // intro | verse | prechorus | build | drop | breakdown | bridge | outro
      melody: { fromBar: 0 },   // play anthem bars fromBar.. for this section's length; or null for no melody
      chords: null,             // null = anthem chords for those bars; or an array of chord symbols, one per half-bar
                                //   (symbols: root + optional quality, e.g. 'Dm','Gm7','Bbmaj7','A7','Csus4','F/A')
      notes: 'free text for the musicians: who plays what, drop design, fills, vocal plan',
    },
  ],
};
```
`melody.fromBar` + the section length picks the anthem bars, wrapping mod 20. A section may set
`melody: { fromBar: 8, bars: 4 }` to play only part of its length (silence after). A section
may also set `melody: { fromBar, octave: +1 }`.

### `studio/render.mjs` (Engineer)
`node --max-old-space-size=4096 studio/render.mjs [--out studio/out/<dir>] [--only part1,part2] [--from <section>] [--to <section>] [--fast]`
It loads `score.js` (falling back to the engineer's `score.example.js`), resolves the timeline,
runs every part module, mixes with `studio/song/mix.js`, masters, and writes:

- `hatikvah.wav`: 16-bit or 24-bit stereo, 44.1 kHz.
- `report.json` + `report.md`:
  - integrated LUFS (BS.1770 K-weighted) and true-peak estimate.
  - per-section short-term loudness, crest factor, and band balance (sub <60, low 60–250,
    low-mid 250–800, mid 0.8–3k, presence 3–8k, air 8k+).
  - stereo correlation and width per band, and per-stem RMS per section.
  - masking warnings (stems fighting in the same band in the same section), clipping
    count, render time.
- `spectrogram.png`: the whole master, log-frequency, with section markers.
- `stems.png`: per-bus energy over time.
- `pianoroll.png`: logged note events per stem, with section markers.
- `sections.txt`: per section, which stems play, note counts, and density.

`--fast` renders at lower quality for quick iteration, for example a shorter reverb.

### Part modules: `studio/song/parts/*.js`
```js
export default function part(studio) { /* write audio into stems */ }
```
`studio` is documented by the Engineer in `studio/engine/API.md`. At minimum it exposes:

- the resolved `sections` (absolute start/end seconds, bpm(s), transpose, etc.) and a
  `timeline` (bar/step ↔ seconds, tempo ramps).
- `melodyNotes` (absolute-time anthem notes per the score, transposed) and
  `chordAt(seconds)` / per-half-bar chords.
- `stem(name)`: a stereo write target routed to the mixer.
- `rng(seed)`, `log(event)` for the piano roll, and `engine` (DSP library: oscillators,
  filters, envelopes, delays, reverb, chorus, saturation, compressor, etc.).

### `studio/song/mix.js` (Musician B)
Per-stem gain, pan, EQ, compression, reverb/delay sends, sidechain (duck from a kick trigger
list), bus groups, and master chain settings. The format is documented in `API.md`. The
Engineer ships a sensible default `mix.js` that Musician B then owns.

## Delivery target

- 3:00–3:45 long, stereo.
- Master at about −9 to −11 LUFS integrated, true peak ≤ −1 dBTP.
- Full-sounding on phone speakers AND headphones: keep sub energy controlled, and keep enough
  2–5 kHz presence to translate on phones.
- Clean ending: the final hit or chord rings out to silence.
