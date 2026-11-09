# MTap Studio engine API

Everything a part author or mixer needs, without reading engine source. `STUDIO.md` is the contract; this file
documents the tools. All code is plain ES modules, Node 24 built-ins only, and fully deterministic.

Contents:

1. Quick start
2. Rendering (`render.mjs`) and its outputs
3. Part modules
4. The `studio` object (sections, timeline, melody, chords, stems, cues)
5. Stems and notes
6. Instruments (`engine.inst`, `engine.sfx`)
7. DSP building blocks (`engine.osc`, `env`, `filter`, `mod`, `groove`, `theory`, `util`)
8. Effects (`engine.fx`), for `mix.js` and inside parts
9. `mix.js`: stems, buses, returns, sends, sidechain, automation, master
10. Reading the analysis
11. Recipes
12. Gotchas

---

## 1. Quick start

```
studio/song/score.js          Producer: sections, tempo, keys (score.example.js is the fallback)
studio/song/parts/*.js        one module per part; each runs in its own worker thread
studio/song/instruments/*.js  optional shared instrument code (a-*.js Musician A, b-*.js Musician B)
studio/song/mix.js            mixer config (object, or a function of studio that returns one)
studio/out/<dir>/             render outputs (git-ignored)
```

A complete part:

```js
// studio/song/parts/keys.js
export default function keys(studio) {
  const E = studio.engine;
  const piano = new E.inst.Piano({ seed: 'pno', tone: 'felt' });
  const st = studio.stem('piano');                      // stereo write target, routed by mix.js
  for (const n of studio.melody('verse1')) {            // anthem notes, absolute seconds, transposed
    st.play(piano, { time: n.time, midi: n.midi, vel: 0.7, dur: n.dur * 0.95 });
  }
  let prev;
  for (const c of studio.chordsIn('verse1')) {          // one chord per half-bar
    prev = E.theory.voicing(c, { prev, low: 48, high: 67, voices: 4 });
    for (const m of prev) st.play(piano, { time: c.start, midi: m, vel: 0.45, dur: c.end - c.start, pedal: true });
  }
}
```

Render it:

```
node --max-old-space-size=4096 studio/render.mjs --only keys --from verse1 --to verse1b --out studio/out/keys-test
```

Then read `studio/out/keys-test/report.md` and view the PNGs with the Read tool.

## 2. Rendering

```
node --max-old-space-size=4096 studio/render.mjs [options]
  --out <dir>        output folder (default studio/out/latest, or a name derived from --only/--from/--to)
  --only a,b         run only these part files (other parts are silent)
  --from <section>   start the render at this section
  --to <section>     end after this section (+2 s of tail)
  --fast             cheaper reverbs (8 lines, decay capped at 1.5 s); parts may read studio.fast
  --song <dir>       song folder (default studio/song)
  --score <file>     render this score module instead of <song>/score.js (e.g. a DJ extended-mix score). Parts,
                     instruments and mix.js still come from --song; parts that import a score themselves bypass it
  --bits 16|24       WAV depth (default 24; 16 adds TPDF dither)
  --tail <s>         seconds rendered after the last section (default score.tail ?? 8)
  --raw              skip the master post-chain (clip, limiter, loudness). mix.js master inserts still run
  --serial           run parts in-process, in order (clearer stack traces)
  --jobs N           max parallel part workers (default min(8, cores - 2))
  --cache            also save the rendered stems to <out>/.cache
  --remix            skip the parts and re-mix <out>/.cache (same --out, --from, --to). Warns if the score,
                     a part or an instrument file changed since the cache was written
```

**Iterating on the mix:** render once with `--cache`, then edit `mix.js` and run with `--remix`. A full-song
remix takes about a third of a full render. With `--from`/`--to`, the parts still see the whole song, but audio
outside the range is dropped. Expensive parts can skip work with `studio.inRange(t0, t1)`.

**Outputs** in `--out`:

| file | contents |
|---|---|
| `hatikvah.wav` | stereo 44.1 kHz, 24-bit (or 16-bit). Mastered, trailing silence trimmed, 50 ms end fade |
| `report.md` / `report.json` | loudness, per-section bands/stereo/crest, the **label checks** measured on the final file (drop delta, phone sim and mono loss, Mid-channel bands with S−M, short-term max inside each section, builds per bar, low-end pitch per drop bar; section 10), per-stem and per-bus levels, compressor gain reduction, masking warnings, cue silence windows (on the file and pre-drive), flags, warnings, timing (including the most expensive mixer strips) |
| `spectrogram.png` | master (mid channel), log frequency 30 Hz to 20 kHz, colour in dBFS per bin, section markers, blue bands = cue silence windows |
| `stems.png` | 50 ms RMS per stem, bus and return over time, grouped by bus |
| `pianoroll.png` | every logged note per pitched stem. Drum stems (routed to a `drums`/`perc` bus, named like a drum, or played only by DrumKit voices) and fx stems (an `fx` bus or an `fx_` name) get one lane each below the roll, one tick per hit |
| `sections.txt` | per section: stems playing, note counts, notes/s, max polyphony |

**Render budget:** a full song must finish in 4 minutes or less. Parts run in parallel (one worker each), so the
slowest part sets the pace, followed by mix (~35%), master (~8%) and analysis (~3%). Split very heavy parts into
two files. The cost table in section 6 shows what each instrument costs.

## 3. Part modules

```js
export const order = 10;          // optional: merge order (lower first; default 100). Affects nothing audible.
export const after = ['drums'];   // optional: wait for these parts and see their triggers/logs (not their audio)
export default function part(studio) { ... }   // may be async
```

- Each part file runs in its own **worker thread** with its own `studio`. Parts cannot share module state.
  A part with `after` sees the `studio.trigger()` lists, the auto-triggers (note times per stem) and the
  `studio.log()` events of those parts. It does not see their audio.
- A part may write any number of stems. Two parts may even write the same stem; the audio is summed.
- Shared instrument code goes in `studio/song/instruments/*.js`. Import it with
  `import { ... } from '../instruments/a-foo.js'`.
- **Determinism:** never call `Math.random()`. Use `studio.rng(seed)` or the instruments' `seed` options.
- If a part throws, the render continues without it. The error is printed and listed under warnings, and the
  process exits with code 1.

## 4. The `studio` object

| member | meaning |
|---|---|
| `engine` | the DSP library (sections 6 to 8). Usually `const E = studio.engine` |
| `sr` | 44100 |
| `score`, `title`, `key` | the raw score object |
| `cues` | the score module's named export `cues` (or `score.cues`), else `{}` |
| `silences` | `[{ section, beats, start, end }]` from `cues.silenceBeats` (the last N beats of each named section) |
| `inSilence(t, t1 = t)` | true if `t` (or the span `[t, t1]`) touches a cue silence window. Use it to skip notes |
| `sections` | resolved sections, in order (fields below) |
| `section(name)` | section by name (throws if missing) |
| `sectionAt(t)` | section containing time `t`, or null |
| `sectionsByRole(role)` | e.g. `studio.sectionsByRole('drop')` |
| `timeline` | the tempo map (below) |
| `t(bar, beat = 0)` | seconds of a global bar (0-based from song start) plus beats |
| `melodyNotes` | every anthem note the score places (fields below) |
| `melody(name)` | melody notes of one section (all of them if `name` is omitted) |
| `chords` | every half-bar chord (fields below) |
| `chordsIn(name)` | chords of one section |
| `chordAt(t)` | chord sounding at time `t` |
| `stem(name)` | get or create a stem (`[a-z0-9_-]+`) |
| `play(stemName, inst, note)` | shortcut for `studio.stem(stemName).play(inst, note)` |
| `rng(seed)` | seeded RNG, namespaced by part name (methods in section 7) |
| `log(ev)` | add an event to the piano roll: `{ stem, time, dur, midi, vel }` (`stem.play` logs automatically) |
| `trigger(name, t)` | add `t` to a named trigger list (sidechain ducking, other parts' `after`) |
| `triggerTimes(name)` | sorted times: the explicit `trigger()` list `name`, else the note times played on stem `name` |
| `inRange(t0, t1 = t0)` | true if `[t0, t1]` overlaps the render range |
| `range` | `{ start, end }` render range in seconds. `songEnd` / `duration` = end of the last section |
| `fast` | true with `--fast` |
| `partName` | name of the running part |

**Section** fields: `name, index, role, energy, notes, transpose, bars, bpm0, bpm1` (equal when there is no
ramp), `melody` (`{ fromBar, bars, octave }` or null), `chords` (symbols per half-bar, already transposed),
`startBar, endBar, startBeat, endBeat, startStep, endStep` (global, 0-based; a step is a 16th), `start, end,
dur` (seconds), `extra` (the raw score entry, including any custom fields). Methods:
`at(bar, beat = 0)` gives seconds of a bar+beat inside the section (fractions are fine), `step(n)` gives seconds of
the n-th 16th, `beat(n)` gives seconds of the n-th beat, and `contains(t)` tests a time.

**Timeline:** `beatToSec(b)`, `secToBeat(t)`, `bpmAt(t)`, `barToSec(bar)`, `stepToSec(step)`, `secToStep(t)`,
`noteLen(value, t = 0)` gives the duration in seconds of `'1/8'`, `'1/8d'` (dotted), `'1/8t'` (triplet), `'1/4.'`, or a
number of beats, starting at `t` and following tempo ramps. Positions before 0 or after the end extrapolate at
the first or last tempo.

**Tempo ramps** (`bpm: [a, b]`) are linear in **beats**, like DAW tempo automation drawn across the section.
Beat `x` of a ramped section of `B` beats has tempo `a + (b - a)·x/B`, and its time is
`(60/k)·ln(1 + k·x/a)` with `k = (b - a)/B`. Every beat, step and `noteLen` follows this, as do delays,
gates and auto-pan synced through the timeline.

**Melody note:** `{ midi, time, end, dur, step, steps, sectionStep, section, sectionIndex, anthemBar,
anthemIndex, anthemStep, vel: 1 }`. `midi` already includes the section's `transpose` and `octave`. `anthemIndex`
identifies the note within the anthem (0..), which is useful for lyric syllables. A note is cut at the end of
its melody span.

**Chord:** `{ symbol, root, bass, quality, intervals, pcs, minor, start, end, section, sectionIndex, halfBar,
bar }`. `root`/`bass`/`pcs` are pitch classes (0 = C). Chord arrays in the score are written in the anthem
key; the section's `transpose` is applied on top.

## 5. Stems and notes

```js
const st = studio.stem('lead');
st.play(inst, { time, midi, vel = 0.8, dur, pan, gain, db, cache, ...instrument fields });
st.add(time, data, { gain = 1, db, pan = 0 });   // raw audio
```

- `play` renders the note with `inst.render(note)`, mixes it in at `time`, logs it for the piano roll, and
  records the time as an auto-trigger for that stem name. It returns the instrument's raw result. Notes whose
  `[time - 1, time + dur + inst.tail]` window lies outside the render range are skipped (they are still logged).
- `data` for `add` (and every instrument's return value) is a `Float32Array` (mono), `[L, R]`, or
  `{ L, R, offset }`. `offset` is in seconds and may be negative: the voice uses it to start consonants before the
  beat.
- `pan` is equal-power for mono sources and balance for stereo ones. `gain` is linear and `db` is in decibels;
  both apply.
- `cache: true` (on the note or in the instrument's opts) memoises identical notes. Use it for repeated
  one-shots such as chops or stabs. `DrumVoice` caches by itself.
- Audio before t = 0 is dropped. The song's first downbeat is t = 0, so a pickup must start at t ≥ 0.
- Stems live in 0.74 s chunks that are allocated lazily, so a sparse stem costs little memory.
- Times are seconds from the song start. Use `section.step(n)`, `section.at(bar, beat)` or
  `timeline.beatToSec()` so tempo ramps are respected.

## 6. Instruments

Every instrument has `render(note)`, `name` and `tail` (seconds of ring after `dur`). Construct it once per
part and reuse it. Each one draws on an internal note counter for round-robin variation, deterministically.

Typical peak level at `vel 0.8` (before mix gain) and CPU cost per second of note (single core, warm):

| instrument | peak | cost |
|---|---|---|
| AcousticGuitar (one string) | −10 dBFS | 10 ms |
| ElectricGuitar clean / crunch | −7 / −3 | 6 ms |
| EPiano | −5 | 8 ms |
| Piano (mid / low register) | −8 | 17 / 60 ms, plus about 6 ms per note for the soundboard |
| Strings (6 players) | −8 | 35 ms |
| Voice | −7 | 18 ms |
| Choir (6 singers) | −6 | 60 ms |
| Synth supersaw-lead / pad | −12 / −6 | 45 / 60 ms |
| Synth bass / pluck | −13 / −15 | 15 ms |
| Drums | −1 to −5 | ~0 (cached after the first hit of each layer) |

### AcousticGuitar (steel-string, waveguide)

Commuted waveguide synthesis. The pick pulse is convolved with a modal dreadnought body impulse response, then
shaped by pick position and hardness and fed into a tuned, fractionally delayed string loop with
frequency-dependent loss. Two detuned loops with different "mic" body IRs give stereo.

```js
const gtr = new E.inst.AcousticGuitar({ seed, decay = 1, brightness = 0.55, body = 1 /* >1 boomier */,
  pickPos = 0.15, width = 0.85, noise = 0.12 /* pick noise */, gain = 1 });
// note: { midi, vel, dur, mute: false | 'palm' | 'dead', cut, pickPos, bright }
```

For strums, use a **GuitarPerformance**. It voices chords on six strings, spreads the strings in time, and lets
a new pluck on a string cut the previous one, like a real guitar:

```js
const perf = gtr.performance({ seed: 'strum', humanize: true });
perf.strum({ time, chord: 'Dm' /* or voicing: [midi|null x6, low E first] */, dir: 'down' | 'up', vel: 0.8,
  spread /* s for the whole strum, default 0.012-0.03 by vel */, strings: 'all' | 'bass' | 'treble' | 'top4' | 'top3' | [lo, hi],
  mute: false | 'palm' | 'dead', dur: 4 /* max ring */, prefer: 'open' | 'barre' | 'high' });
perf.pick({ time, midi /* or string + fret */, string, vel, dur, mute });
perf.flush(studio.stem('gtr_acoustic'));   // renders everything (notes are logged)
```

Up-strums default to the top four strings. Use `mute: 'dead'` for the percussive "chk", and alternate
`'down'`/`'up'` on 8ths or 16ths.

### ElectricGuitar

```js
new E.inst.ElectricGuitar({ tone: 'clean' | 'crunch' | 'mute', pickup: 'neck' | 'middle' | 'bridge', decay = 1, brightness = 0.6, seed, gain });
// note: { midi, vel, dur, mute: false | 'palm' | 'dead', cut, pickPos }
```

The output is a mono amp+cab signal. For the "clean chorus" pop sound, put `{ type: 'chorus' }` or
`{ type: 'ensemble' }` on the stem in mix.js and send it to the echo. `.performance()` works here too.

### EPiano (Rhodes-style FM)

```js
new E.inst.EPiano({ tone: 'rhodes' | 'dx' | 'soft', decay = 1, bark = 1, tine = 1, seed, gain });
// note: { midi, vel, dur }
```

Velocity drives the bark: hard notes growl, soft notes are round. The output is mono. For the suitcase sound,
add `{ type: 'autopan', rate: 4.5, depth: 0.35 }` and a little chorus in mix.js.

### Piano (modal grand)

```js
new E.inst.Piano({ tone: 'grand' | 'felt' | 'bright', brightness /* default 0.5, felt 0.3, bright 0.75 */, decay = 1,
  width = 0.6, hammer = 1, seed, gain, maxDur = 8,
  strings = 3, board = -12 /* dB; 'bright' -15; false = off */, boardType /* 'grand' | 'upright' (felt default) */,
  keyNoise = 0 /* dB offset; false = off */, hammerReturn /* dB re attack peak: felt -30, else -36; false = off */ });
// note: { midi, vel, dur, pedal: true /* ignore dur and ring naturally (up to maxDur) */, keyNoise: false /* this note */ }
piano.pedalNoise({ vel, midi })   // -> [L, R]: one damper-release swish for a pedal-up, about -38 dB re a chord at vel
```

Each partial has inharmonicity and stretch tuning, a velocity-dependent hammer spectrum and a striking-point comb.
Cut 3 adds the realism layers the label asked for (round-1 P8 / E2). They are all **on by default**:

- **Three strings per note from MIDI 45 up**, detuned {0, +d1, −d2} cents (d1 and d2 drawn per note from 0.5–1.5),
  each string's T60 ×(1 ± 8 %). The prompt (78 %) decays fast on the centre string and the aftersound (22 %) is split
  over the two detuned strings, so the beating and the two-stage decay come from the unison. Below MIDI 45 the cut-2
  bichord model is unchanged. `strings: 2` restores the bichord everywhere.
- **Soundboard.** One board per piano type (`grand`, or `upright` for felt): 28 modes log-spaced 60 Hz–3 kHz (±8 %
  jitter, Q 15–40 and T60 150–250 ms, whichever decays first) plus a dense diffuse field (noise bands at 200 / 800 /
  2200 Hz, T60 240 / 200 / 140 ms). It is stored as six 0.25 s stereo IRs, one per register band (≤ 44, 45–56, 57–68,
  69–80, 81–92, ≥ 93), each weighted towards its own register. The first 250 ms of every note (strings, hammer thump
  and the hammer's force pulse into the bridge) is convolved with its band's IR and added `board` dB under the dry
  note. Measured: the body sits 11–19 dB under the dry note over its first 250 ms, and the hammer-driven "knock" alone
  sits 20–30 dB under it and decays over about 200 ms. No note's body may come within 8 dB of its dry note.
- **Mechanics.** At every damped note-off (not under `pedal`, MIDI < 89) there is 40–80 ms of band-passed damper noise
  (300 Hz in the bass to 1.5 kHz in the treble, Q 1) at −35 dB re the note's attack peak, plus a 15 ms felt key
  "thup" (LP 400 Hz) at −38 dB. A hammer-return thunk (20 ms, LP 250 Hz) follows 25–40 ms after the strike, at −30 dB
  (felt) or −36 dB. Notes whose `dur` ends on a pedal change (the KeyBed style) get their damper noise there
  automatically, so `pedalNoise()` is only for pedal-ups that no note marks.
- **Stereo.** Pitch panning (`width`) works as before, but the spaced-pair inter-channel delay now acts below ~800 Hz
  only. The cut-2 delay combed the mono fold-down: a null near 2.9 kHz on the top notes, and −4.7 dB of presence
  loss on a solo-piano pattern. The presence mono loss is now about 0.3 dB.
- **Gain-matched:** per-section piano stem RMS stays within ±0.3 dB of cut 2 (felt is trimmed +0.3 dB).

Dampers stop notes at `dur`, except in the top octave and a half and when `pedal` is set. `felt` is the intimate
ballad or "una corda" sound. For the pedal halo, add `{ type: 'resonance', mix: 0.1 }` in mix.js. **Do not wrap this
Piano in a second soundboard** (an `instruments/a-piano.js` fork or a body bank): the body is already in the engine.
To hear the cut-2 model, pass `{ strings: 2, board: false, keyNoise: false, hammerReturn: false }` (the stereo
delay change stays).

### Strings (ensemble)

```js
new E.inst.Strings({ players = 6, attack = 0.16, release = 0.4, brightness = 0.6, vibrato = 1, detune = 6 /* cents */,
  width = 0.9, section: 'auto' | 'violins' | 'violas' | 'cellos' | 'basses', seed, gain });
// note: { midi, vel (dynamic), dur, articulation: 'sustain' | 'legato' | 'staccato' | 'spiccato' | 'pizz' | 'swell', attack, players }
```

### Voice and Choir (formant singing)

```js
const v = new E.inst.Voice({ type: 'soprano' | 'alto' | 'tenor' | 'bass' | 'female' | 'male', breath = 0.25,
  vibrato = 1, vibratoRate = 5.4, formantShift = 1, brightness = 0.5, seed, gain });
// note: { midi, vel, dur, text: 'kol' | vowel: 'a', glideFrom /* midi */, glideTime = 0.08, breath, vibrato, formantShift }
const choir = new E.inst.Choir({ type, singers = 6, width = 0.9, detune = 10, timing = 0.018, breath = 0.35, ...Voice opts });
```

- The source is a glottal pulse (pressed, modal and breathy shapes morph with velocity and breath) with jitter,
  shimmer, a scoop into the note, and delayed natural vibrato. It feeds a five-formant vocal tract with smooth
  vowel transitions and soprano F1 tuning.
- `text` is one syllable in simple Latin transliteration, parsed into onset consonants, vowel(s) and coda.
  - Vowels: `a e i o u` and `'` (schwa: `b'ar`).
  - Consonants: `k t p b d g s z sh ch/kh/x (Hebrew chet/khaf) f v h m n l r y w tz/ts`.
- Onset consonants are placed **before** the note time, so the vowel lands on the beat.
- Lyrics, one syllable per note: "Kol od ba-le-vav p'-ni-mah, ne-fesh y'-hu-di ho-mi-yah…" and
  "Od lo av-dah tik-va-te-nu, ha-tik-vah bat sh'-not al-pa-yim, lih-yot am chof-shi b'-ar-tze-nu, e-retz tzi-yon
  vi-ru-sha-la-yim".
- Vocal chops: short notes (0.1–0.25 s) on open vowels (`ah`, `oh`, `ey`). Use `cache: true` and `glideFrom`
  for pitch slides. Add delay and plate sends and a trance gate in mix.js.
- Honest limit: this is a synthesized voice. It sounds best doubled, under reverb, as a choir pad, or as
  short chops. Exposed long solo lines are the riskiest use.

### DrumKit and DrumVoice (synthesized multisampled kit)

```js
const kit = new E.inst.DrumKit({ seed, kick: { ...params }, snare: {...}, clap, hat, openhat, ride, crash, tom, shaker, snap, rim });
st.play(kit.kick, { time, vel });   // kit.<kind> is a DrumVoice instrument
new E.inst.DrumVoice(kind, params, seed);
```

Each voice renders 5 velocity layers × 4 round-robin variants on first use and caches them. Note fields are
`{ vel, dur /* chokes openhat, crash and ride */, midi /* tom pitch */, rr /* force a variant */, gain }`.
Parameters:

| kind | params (defaults) |
|---|---|
| `kick` | `tune` 50 Hz (body pitch; set to the key, e.g. 55 = A1), `sweep` 4.5 (start pitch × tune), `punch` 0.026 s (pitch-drop time), `decay` 0.42 s, `click` 0.35, `drive` 2.2, `sub` 0.5, `length` 0.55 s |
| `snare` | `tune` 1 (= 190 Hz head), `decay` 0.24 (wires), `body` 0.6 (membrane modes), `wires` 1, `crack` 0.5 (stick), `room` 0.18, `tone` 5000 Hz (wire peak) |
| `clap` | `tone` 1150 Hz, `decay` 0.16, `room` 0.35, `bursts` 4 |
| `hat` / `openhat` | `tune` 1.55, `decay` 0.065 / 0.45, `tone` 9000 Hz |
| `ride` | `decay` 2.2, `bell` 0.5 |
| `crash` | `decay` 2.4, `tone` 1 |
| `tom` | `decay` 0.5 (pitch from `note.midi`, default 45) |
| `shaker` | `decay` 0.07, `tone` 7000 |
| `snap` | `tone` 1900, `room` 0.4 |
| `rim` | (none) |

`E.inst.DRUM_MIDI` gives the GM numbers used on the piano roll.

### Synth (subtractive / supersaw) and Bell

```js
new E.inst.Synth(preset, overrides);   // E.inst.Synth.presets() lists them
```

Presets: `supersaw-lead`, `supersaw-pad`, `stab`, `pluck`, `arp`, `brass`, `warm-pad`, `vox-pad`, `saw-bass`,
`reese`, `sub`, `808`, `piano-house`. A full configuration (any field overrides the preset):

```js
{ osc: [{ type: 'supersaw' | 'saw' | 'square' | 'pulse' | 'tri' | 'sine' | 'noise' | 'wt:saw' | 'wt:square' | 'wt:tri' | 'wt:sine' | 'wt:organ' | 'wt:warm' | 'wt:hollow' | 'wt:vox' | 'wt:glass' | 'wt:morph',
          octave, semi, detune /* cents; for supersaw 0..1 knob */, level, pan, pw, voices, mix, spread }],
  filter: { type: 'lp' | 'hp' | 'bp', cutoff, res /* Q */, env /* octaves of sweep */, keytrack /* 0..1 */, slope: 12 | 24, a, d, s, r },
  amp: { a, d, s, r }, drive /* dB, tanh */, glide /* s, used when note.glideFrom is set */, mono, width,
  vibrato: { rate, depth /* cents */, delay }, pitchEnv: { semis, time }, gain, seed }
// note: { midi, vel, dur, glideFrom, cutoff /* override */, filterEnv /* override octaves */ }
```

`supersaw` is the JP-8000 model (Szabo): 7+ voices, non-linear detune curve, centre and side mix law, random
free-running phases, stereo spread, and a high-pass at the fundamental. Velocity opens the filter envelope.

`new E.inst.Bell({ ratio = 3.5, index = 3, decay = 2.5, bright = 1, gain, seed })` is a 2-op FM bell or mallet.

### Transition FX (`engine.sfx`)

All are instruments; `dur` is the effect length:

- `Riser({ noise = 1, saw = 0.5, from = 400, to = 9000, fromMidi = 50, semis = 12, curve = 2, q = 1.2 })` ends
  exactly at `time + dur`.
- `Downlifter({ from = 9000, to = 150, tone = 0.4 })`.
- `Impact({ sub = 1, noise = 0.6, tail = 0.6 })`: sub boom, crack and a huge reverb tail. Put it on the drop
  downbeat.
- `ReverseCymbal()` ends at `time + dur` (2.6 s or less).
- `Sweep({ from = 200, to = 8000, q = 2 })`: a whoosh, downward when `from > to`.

## 7. DSP building blocks

Buffers are `Float32Array`; stereo is `[L, R]`. "ADDS" means the function mixes into `out`.

**`engine` (top level):** `SR`, `midiToHz`, `hzToMidi`, `dbToGain`, `gainToDb`, `noteToMidi('F#3')`, `clamp`,
`lerp`, `rng(seed)`, `Rng`, `panGains(pan)`, `mono(n)`, `stereo(n)`, `mixInto(dst, src, offset, gain)`,
`toStereo(m, pan, gain)`, `varispeed(buf, rate | fn)`, `reverse`, `fadeIn(buf, n)`, `fadeOut(buf, n)`,
`normalize(buf, peak)`, `peak`, `rms`, `tanh` (fast).

**`engine.util`:** all of the above, plus `scale`, `applyEnv(buf, env)`, `trimTail`, `hermite(buf, x)`,
`noteValueBeats('1/8d')`, `sanitize`, `balanceGains`, `centsToRatio`, `framesOf(sec)`, `TAU`, `NYQ`.

**`Rng`** (from `studio.rng(seed)`): `float()` returns [0,1), `bi()` returns [-1,1), `range(lo, hi)`,
`int(lo, hi)` (inclusive), `pick(arr)`, `chance(p)`, `gauss(mean, sd)`, `shuffle(arr)`, `fork(tag)`.

**`engine.osc`:**

- `renderOsc(type, out, start, n, freq, { phase, amp, pw, sr })` ADDS a band-limited `sine | saw | square |
  pulse | tri` (polyBLEP/BLAMP). `freq` is Hz or a per-sample Float32Array. Returns the end phase.
- `new Osc(type, freq)` with `.render(out, start, n, amp, freqArr)`.
- `osc(type, freq, n, opts)` returns a new buffer.
- `supersaw({ freq, n, voices = 7, detune = 0.3, mix = 0.7, spread = 0.85, seed, hpf = true, amp })` returns `[L, R]`.
- `Wavetable.preset('saw' | 'square' | 'tri' | 'sine' | 'organ' | 'warm' | 'hollow' | 'vox' | 'glass' | 'morph')`,
  `Wavetable.fromFn((k, pos) => amp | [amp, phase], frames, harmonics)`, and `Wavetable.fromWaves([cycle...])`.
  These are mipmapped and alias-free.
- `renderWavetable(wt, out, start, n, freq, { phase, amp, position /* 0..1 or array: frame morph */ })` ADDS.
- `new Noise(seed, 'white' | 'pink' | 'brown').render(out, start, n, amp)` ADDS.
- `noise(n, seed, type, amp)` returns a buffer.

**`engine.env`:**

- `adsr({ a, d, s, r, aCurve, peak }, gateSeconds)` returns a gain curve of gate+release length. Decay and
  release are exponential, with `d`/`r` the time to about −40 dB.
- `curve([[t, v], [t, v, curve | 'exp'], ...], lengthSec)` is a breakpoint envelope.
- `decay(t60, n)`, `ad(attack, t60, n)`, `ramp(a, b, n)`, `expRamp(a, b, n)`.

**`engine.filter`** (all process in place, `process(buf, start, end)`):

- `new SVF(type, freq, q)` where type is `lp | hp | bp | bpn | notch | peak | ap`. It is a zero-delay-feedback
  filter that stays stable under modulation: `process(buf, start, end, freqArr, qArr)` (the arrays are read every
  8 samples, indexed from 0 at `start`). There is also `tick(x)`.
- `new SVFCascade(type, freq, q, slope 12 | 24 | 36 | 48)`.
- `new Biquad(type, freq, q, gainDb)` where type is `lp | hp | bp | notch | peak | ls | hs | ap`. It has
  `.set(...)`, `.mag(f)` and `.tick(x)`.
- `new ButterChain('lp' | 'hp', freq, slope 6..48)`, `new OnePole('lp' | 'hp', freq)`, `new DCBlock(freq)`,
  `new Allpass1(a)`.
- `filtered(buf, type, freq, q, gain)` returns a filtered copy.

**`engine.mod`:**

- `lfo(n, { rate, shape: 'sine' | 'tri' | 'saw' | 'ramp' | 'square' | 'sh' | 'smooth', depth, offset, phase,
  delay, fadeIn, seed })`.
- `glide(f0, f1, time, n)`.
- `pitchTrack([{ t, midi }], n, { glide, mode: 'exp' | 'linear' })` builds a mono legato line in Hz per sample.
- `vibrato(baseHz | array, n, { rate, depth /* cents */, delay, fade, drift, jitter, scoop, scoopTime, seed })`.
- `constFreq(midi, n)`, `pitchDrop(baseHz, n, semis, tau)`.

**`engine.groove`** (also `engine.voices`):

- `pattern('X..x..o.')` returns `[{ step, vel }]`. `X` is an accent, `x` a hit, `o` a ghost; spaces and `|`
  are ignored.
- `humanize(notes, { timing = 0.006, velocity = 0.06, late = 0, maxShift = 0.02, seed })`.
- `swingOffset(step, pct)` gives the delay in steps for odd 16ths: 50 is straight, 54–58 a pop shuffle.
- `accent(step, { beat, eighth, sixteenth })`.
- `limitPolyphony(notes, max, release)`, `monoLegato(notes, gap)`, and `new VoicePool(count).assign(notes)`.

**`engine.theory`:**

- `parseChord('Bbmaj7/D')`.
- `transposeChord(sym, semis)`.
- `chordNotes(chord, octave)`.
- `voicing(chord, { style: 'close' | 'drop2' | 'open' | 'spread' | 'pad' | 'stab' | 'power', low = 55, high = 79,
  voices, prev, bass: octave | false, center })` voice-leads from `prev` when it is given.
- `voiceLead(chord, prev, { low, high, count })`.
- `guitarVoicing(chord, { prefer: 'open' | 'barre' | 'high', capo, maxFret })` returns 6 strings, low E first,
  `null` = muted.
- `scale(root, mode)` with modes `major | minor | harmonicMinor | melodicMinor | dorian | phrygian | lydian |
  mixolydian | pentMinor | pentMajor | blues | freygish`.
- `snap(midi, pcs)`, `pcAtOrAbove(pc, lowMidi)`, `pcName(pc)`.
- `arpeggio(notes, 'up' | 'down' | 'updown' | 'downup' | 'converge' | 'random' | [indices], steps, { octaves })`.
- `GUITAR_TUNING`, `SCALES`, `QUALITIES`.

Chord qualities: `'' maj M m min - 5 dim aug + sus2 sus4 sus 6 m6 7 maj7 M7 m7 min7 mmaj7 m7b5 dim7 7sus4 7sus2
add9 madd9 add2 madd2 add4 9 m9 maj9 7b9 11 m11 13 69 m69`, with an optional `/bass`.

**`engine.analysis`:** `lufs(L, R)` gives integrated BS.1770 loudness; `truePeak(buf)` gives a linear 4×
oversampled peak.

## 8. Effects (`engine.fx`)

Every effect is `fx.process(L, R, start, end, frame0)` in place, where `frame0` is the absolute frame of
`L[start]`, needed for tempo sync and trigger ducking. Inside a part, use
`E.fx.createFx({ type, ...params }, { timeline: studio.timeline })` or the classes. In mix.js, list them as
`inserts`. Parameters (defaults):

| type | params |
|---|---|
| `eq` | `bands: [{ type: 'hp' \| 'lp' \| 'ls' \| 'hs' \| 'peak' \| 'notch' \| 'bp' \| 'tilt', freq, gain, q, slope /* hp/lp 6..48 */, ms: 'mid' \| 'side' }]` |
| `comp` | `threshold -18, ratio 4 ('inf'), attack 0.01, release 0.12, knee 6, makeup 0, detector 'peak' \| 'rms', rmsTime, scHpf 0, mix 1, lookahead 0, autoRelease false, key: '<stem name>'` (external sidechain = that stem's raw audio) |
| `duck` | trigger-list volume shaper. In mix.js use the strip `duck` field instead (section 9) |
| `sat` | `shape 'tanh' \| 'soft' \| 'hard' \| 'tube' \| 'fold', drive 6 dB, bias 0.1, mix 1, output 0, tone 0 dB, oversample 2, lowcut 0 Hz` (only above `lowcut` is saturated) |
| `tape` | `drive 3, bump 1.5 dB @ bumpFreq 70, hf 16000, wow 0.15 ms, flutter 0.03 ms` |
| `exciter` | `freq 3000, drive 12, amount 0.15`: adds upper harmonics for phone translation |
| `transient` | `attack 0 dB, sustain 0 dB (-12..12), fast, slow, release` |
| `chorus` | `rate 0.5, depth 2.5 ms, delay 11 ms, voices 2, mix 0.4, feedback 0` |
| `ensemble` | `mix 0.5, depth 1, rate 1` (Solina/Juno 3-tap) |
| `flanger` | `rate 0.15, depth 2 ms, delay 1 ms, feedback 0.5, mix 0.5` |
| `phaser` | `stages 6, rate 0.3, min 250, max 3500, feedback 0.4, mix 0.5, stereo 0.25` |
| `tremolo` / `autopan` | `rate 4 \| sync '1/8', depth 0.5, shape 'sine' \| 'square'` |
| `delay` | `time 0.375 \| sync '1/8d', syncR, feedback 0.35, mix 1, dry, pingpong false, hp 300, lp 6000, mod 0.08 ms, drive 0, width 1, spread 0 ms`. Synced times follow the tempo map, including ramps |
| `reverb` | `preset 'plate' \| 'vocal' \| 'hall' \| 'huge' \| 'room' \| 'chamber' \| 'drum'` + `decay, predelay, size, hfRatio, diffusion, mod, er, lowcut, highcut, width, mix 1, lines 16`. A 16-line modulated FDN with early reflections, calibrated so that wet ≈ dry level |
| `widener` | `width 1, bassMono 0 Hz` |
| `filter` | `mode 'lp' \| 'hp' \| 'bp', freq, q 0.707, slope 12 \| 24, sweep: { from, to, at, until }` (Hz over song seconds, log). In mix.js prefer the strip `filter` field plus `auto` lanes |
| `gate` / `trancegate` | `pattern 'x.x.xx.x' (16th steps), depth 1, attack 0.003, release 0.03, step 0.25 beats` |
| `ott` | `depth 0.4, lowX 120, highX 2500, up 0.6, down 1, time 0.5, gains [l, m, h], threshold -24, floor -40` |
| `limiter` | `ceiling -1, release 0.06, lookahead 0.001` (streaming, for buses) |
| `clipper` | `ceiling -0.3, knee 1.5, oversample 4, drive 0, hard false` |
| `resonance` | `notes [midi...], decay 2.5, damp 0.35, mix 0.12`: sympathetic strings (piano pedal halo) |
| `fn` | `{ type: 'fn', process(L, R, start, end, frame0) { ... } }`: your own code |

## 9. `mix.js`

`export default` an object, or a function `(studio) => object`. A function can route by stem name and derive
automation from the score. The shipped default does both.

```js
export default (studio) => ({
  stems:   { '*': { ...defaults for every stem }, kick: { ...strip }, ... },
  buses:   { drums: { ...strip }, music: { ...strip, out: 'mixbus' }, mixbus: { ...strip } },
  returns: { plate: { type: 'reverb', preset: 'plate', ...fx params, ...strip }, echo: { type: 'delay', sync: '1/8d', ... } },
  master:  { ...strip, targetLufs: -10, clip: { ceiling: 0.5, knee: 2 }, limiter: { ceiling: -1, release: 0.08, lookahead: 0.0015 } },
});
```

**Strip fields** (stems, buses, returns and master):

| field | meaning |
|---|---|
| `bus` / `out` | destination bus name (default: `stems['*'].bus`, else `music` if that bus exists, else `master`). Buses and returns go to `master` unless `out` says otherwise. Buses may nest; cycles are an error |
| `gain` | fader, dB |
| `trim` | input gain, dB (before the inserts) |
| `pan` | −1..1 (balance) |
| `width` | 0 = mono, 1 = as is, >1 wider (M/S) |
| `bassMono` | Hz: side is high-passed below this |
| `mute`, `solo` | solo mutes every stem that isn't soloed |
| `filter` | `{ hp, lp, q, slope }`: automatable filters at the top of the strip |
| `eq`, `sat`, `comp`, `glue` | shorthand inserts, run in that order: `eq: [bands]`, `sat: {...}`, `comp: {...}` (`key` for sidechain) |
| `inserts` | explicit insert list `[{ type, ... }]`. When present, it replaces the eq/sat/comp/glue shorthand |
| `sends` | `{ returnName: dB }` or `{ returnName: { db, pre: true } }` (pre = before pan, duck and fader). Sends may also target a bus |
| `duck` | trigger sidechain (below) |
| `auto` | automation lanes (below) |

Signal flow inside a strip: return effect (returns only) → trim → `filter.hp` → `filter.lp` → inserts (or
eq → sat → comp → glue) → width/bassMono → pan → duck → [pre sends] → fader (gain plus the `gain` lane) →
post sends and output.

**Sidechain ducking** (Kickstart / LFO-Tool style volume shaping from a trigger list):

```js
duck: { trigger: 'kick' /* trigger list or stem name (its note times), or an array of seconds */,
        depth: 0.6 /* fraction removed */ | depthDb: 8, attack: 0.002, hold: 0.01,
        release: 0.2 /* s */ | '1/8' /* note value, tempo-following */, shape: 'smooth' | 'exp' | 'linear', curve: 1,
        sections: ['drop1', ...], from: 'drop1', to: 'drop1>' /* limit where it acts */ }
```

For compressor-style sidechain from audio, use `comp: { key: 'kick', ... }`.

**Automation** with `auto: { lane: [[position, value], ...] }`. Lanes are `gain` (dB), `pan`, `width`, `hp`
and `lp` (Hz, interpolated in log frequency), and `'send:<return>'` (dB). Values are linear between points
and held before the first and after the last point. Positions:

- a number of seconds,
- `'drop1'` (section start), `'drop1>'` (section end), `'drop1@0.5'` (fraction of the section),
  `'drop1+6'` (6 bars into the section, fractions allowed),
- `{ section: 'drop1', bar: 6 }` or `{ section, at: 0.5 }`.

A filter lane opens or jumps instantly when two points share a time (e.g. `['build2>', 650], ['drop2', 20]`).

**Master:** the strip part (`eq`, `glue`/`comp`, `inserts`, `bassMono`, `width`, `gain`) runs in the mixer.
Then the offline post-chain runs: drive → soft clipper (4× oversampled, `clip: { ceiling: +0.5 dB, knee: 2,
hard: false }` or `false`) → look-ahead true-peak limiter (`limiter: { ceiling: -1, release: 0.08,
lookahead: 0.0015 }`, exact, 4× interpolated detection). Loudness is normalised iteratively to `targetLufs`
(default −10), or disable that with `normalize: false` and `drive` (dB). After that the trailing silence is
trimmed (`trimDb` −80) and a `fadeOut` (0.05 s) is applied. The limiter guarantees ≤ −1 dBTP. **If it is
working hard (GR max > 3 dB in the report), the mix is too dense or too peaky; fix it in the mix.**

## 10. Reading the analysis

- **Loudness:** integrated LUFS (BS.1770-4 gated), true peak (4× oversampled), sample peak, momentary and
  short-term max, LRA, and a phone check: integrated loudness through a crude small-speaker curve (HP 350 Hz
  24 dB/oct + LP 12 kHz). A drop of more than about 5 dB means the mix lives in the low end.
- **Sections:** LUFS, short-term max, crest (peak − RMS, dB; drops 7–9 is healthy, < 6 is over-limited), and band
  shares: sub <60, low 60–250, low-mid 250–800, mid 0.8–3k, presence 3–8k, air 8k+. These are percent of
  section energy; a pop/EDM master is bottom-heavy by nature, so compare the dB distances between bands. Also
  correlation and side/mid dB, overall and per band (sub should be ≈ 1.0 / below −20 dB).
- **Stems/buses:** post-fader RMS dBFS per section, with compressor gain reduction (avg/max dB) where inserts
  report it.
- **Masking:** two stems that each carry ≥ 22% of a band's energy in a section, within 4.5 dB of each other.
  Fix it with EQ carving, octave choices, sidechain or arrangement.
- **Cue silence windows:** what is still sounding in each `cues.silenceBeats` window. **file max** and **file 2nd
  half** are measured on the final WAV (after the master drive, clipper and limiter). The mix, stem and bus columns
  are pre-drive: add the reported master drive to read them as in the file.
- **Label checks** (`report.checks` in the JSON) are all measured on the final file, with the same maths as the
  producer's drop-check script (agreement about 0.1 dB):
  - *Drop delta,* for every transition into a drop that ends a build or a gap: the last bar's momentary max against
    the drop mean (ceiling −1 LU, floor −4 LU), drop bar 1 against the last bar (+1.5 LU after a build), the gap's
    2nd-half 50 ms RMS (`cues.gapMaxDb[section]`, default −30 dBFS), and the presence / air payoff (≥ −2 / −4 dB).
    `cues.checks.dropDelta = { ceiling, floor, land, presence, air, gap }` overrides the thresholds.
  - *Phone sim per section:* mono fold-down, Butterworth HP 350 Hz 24 dB/oct, K-weighted, ungated section mean. Next
    to it: the stereo mean, the mono loss (stereo minus mono, LU), and the short-term max from 3 s windows fully
    inside the section.
  - *Mid-channel band levels* (dB) with Side minus Mid per band, pres − mid, air − mid, and the mono fold-down loss
    per band. A presence or air mono loss above 2 dB is flagged.
  - *Builds per bar:* mean LUFS, phone, momentary max and the 0.8–3 kHz band, plus the section before the build.
  - *Low-end pitch per drop bar:* one 65536-point (1.49 s) Hann FFT of the Mid channel, centred on the bar. It lists
    the strongest component in 30–100 Hz, the kick tail (`cues.kickTailHz[key]`, e.g. `{ 'E minor': 41.2 }`) and
    the bar's sub notes (root and bass at or above `cues.subFloorMidi[key]`, default E1 = 28). Flags: a kick tail
    within 2 semitones of a sub note and less than 6 dB under it; a strongest component that is not a sub note or
    a chord fifth and sits within 2 semitones of a weaker sub note (catches a mistuned kick whatever the cue says);
    and a tonic bar whose tonic is not the strongest component. Flags are information: the brief's pass/fail rules
    (for example the relaxed D-minor rules) stay in the producer's check script. The key is the score's `key` plus the section's `transpose`.
- **Spectrogram:** look for mud (a bright band at 200–500 Hz across everything), missing presence (dark
  3–8 kHz in drops), harmonic lines that show the key change, and the drop/verse density contrast.

**Instrument probe** (check one sound without a song render, in about a second):

```
node studio/engine/tools/probe.mjs "new I.Piano({ tone: 'felt' })" --notes 48,60,72 --vel 0.7
node studio/engine/tools/probe.mjs "new I.Voice()" --notes 64 --text la --png out/voice.png
node studio/engine/tools/probe.mjs "new (await import('../../song/instruments/my-inst.js')).MyInst()" --chord --notes 60,64,67
```

The expression runs with `E` = engine and `I` = `engine.inst`; relative imports resolve from
`studio/engine/tools/`. Flags: `--notes`, `--vel` (lists), `--dur` (s), `--text`, `--chord` (one render of all
notes), `--wav`, `--png` (spectrogram), `--json`. Per note it prints peak/RMS, the octave-band spectrum of the
attack (first 0.19 s) and the body (0.3–0.8 s) in dB relative to the loudest octave, the spectral centroid, the
time to −40 dB, and DC/NaN flags. Reference attack spectra: bright steel-string pluck ≈ 4k −14 / 8k −25;
grand piano mf ≈ 4k −15 / 8k −25; pop vocal "ah" ≈ 4k −20..−25 / 8k −35. A sound whose 4k/8k octaves sit
at −40 or below will read as dull or muffled in a mix.

## 11. Recipes

**Pumping sidechain:** put `duck: { trigger: 'kick', depth: 0.5, release: '1/8' }` on the music bus or on pads,
`0.85` on sub/bass, and `0.3–0.45` on the reverb returns. Make sure the kick part actually plays on stem
`kick`, or call `studio.trigger('kick', t)` for a ghost trigger in sections with no audible kick.

**Build:** use a snare roll in 8ths, then 16ths, then 32nds with velocity rising (`section.beat(x)`), a Riser
ending on the drop, and an `hp` lane on the music bus (20 → 200 → 600 Hz) plus a `send:hall` swell. Use a
silence window just before the drop (`studio.inSilence`) and an Impact on the downbeat.

**Big-room lead:** layer `Synth('supersaw-lead')` at +12 with a `Synth('pluck')` at +12 and a `Piano`
(`tone: 'bright'`) at 0. Send to plate and 1/8d echo. Add `ott` (`depth 0.3`) and `exciter` on the lead stem,
and keep it mono below 200 Hz with `eq hp 200`.

**Pop strum:** 16th grid, down on 8ths and up on the off-16ths, `vel` 0.85/0.6, `mute: 'dead'` ghosts on 2 and 4,
`humanize` on, a `transient` attack +3 dB in mix.js, and `hp 110`.

**Baking an effect inside a part** (e.g. a filtered piano that only exists in the build):

```js
const n = Math.ceil(sec.dur * E.SR) + E.SR, [L, R] = E.stereo(n);
for (const note of notes) { const r = inst.render(note); const s = Array.isArray(r) ? r : [r, r];
  E.mixInto(L, s[0], Math.round((note.time - sec.start) * E.SR)); E.mixInto(R, s[1], Math.round((note.time - sec.start) * E.SR)); }
const f = E.fx.createFx({ type: 'filter', mode: 'lp', freq: 300, q: 1.2, sweep: { from: 300, to: 12000, at: sec.start, until: sec.end } });
f.process(L, R, 0, n, Math.round(sec.start * E.SR));   // frame0 = absolute frame of L[0]; sweep times are song seconds
studio.stem('piano_fx').add(sec.start, [L, R]);
for (const note of notes) studio.log({ stem: 'piano_fx', ...note });   // piano roll
```

**Vocal chop phrase:** render `Voice` notes with `text` syllables on the melody rhythm. Use `glideFrom` the
previous note for scoops, `vel` 0.9 with `breath` 0.15 for a pressed pop tone, and `formantShift` 1.1 for a
younger, brighter colour. Pair with `trancegate` and a 1/8d echo in mix.js.

## 12. Gotchas

- t = 0 is the first downbeat. Audio written before 0 is dropped.
- Tempo ramps: never compute times as `bar * 60 / bpm * 4`. Use `section.at()`, `section.step()` or the
  timeline.
- Chord arrays in the score are written in the anthem key (D minor). The section `transpose` shifts them
  (and the melody). `studio.chords` / `chordAt` are already transposed.
- Stem names may only contain letters, digits, `_` and `-`. mix.js entries for stems that no part wrote are
  warned about, and so are stems with no mix entry (they get the `'*'` defaults).
- Instruments hold per-note counters and caches, so construct them once per part, not per note.
- Levels: instruments peak roughly between −15 and −1 dBFS at `vel 0.8`. Set balance with stem `gain` in
  mix.js, not by hitting velocities, because velocity also changes timbre.
- The master normalises loudness, so "louder" in mix.js only changes balance and limiter work. Watch the
  limiter GR and the crest factor.
- Workers: a part file's top-level code runs in its worker. Don't rely on globals set by another part.
