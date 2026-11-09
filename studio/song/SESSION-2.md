# Recut session 2: the work list

From the Producer, for Musician A and Musician B (and three requests to the Engineer). Read
`LABEL-NOTES.md` (Round 1) for what the label heard and why each decision went the way it did. The brief
(`brief.md`) has been edited in place: §6 "Drop delta" and §14 "Cut-2 checks" are the new hard rules.

## The one idea

Cut 1's builds were the loudest, brightest and widest moments of the record, so every drop sounded like it
deflated. On a phone, which plays almost no bass, each drop was literally duller and smaller than its build.

**From now on, the build is thin, bright noise and snare. The drop brings the width, the lows and the
hook.** Every direction below serves that idea or one of the label's sound-quality notes.

## What does not change

- **The form.** The timeline, sections, bars, tempos, keys, melody spans, chords and cues
  (`silenceBeats`, `downbeat`, `finalHit`) are identical to cut 1. It is still 106 bars and 3:16.5.
  `score.js` gains only new notes and informational `cues.dropDelta`, `cues.gapMaxDb`,
  `cues.widthIntoDrop` and `cues.checks`.
- **One gain change, one owner.** Levels are Musician B's. Musician A changes source level only for a layer
  balance inside one part (the +24 chop layer, the drop3 0-octave lead layer, the bell ping).

## Order of work and how to check

1. Musician A and Musician B work in parallel on their own files.
2. Musician B checks the build and drop numbers with partial renders. These are fine for *relative* checks
   (drop delta, band deltas). Absolute dBFS and LUFS shift in a partial render because the master
   normalises to the range rendered.

   ```
   node --max-old-space-size=4096 studio/render.mjs --out studio/out/s2-b2 --from build2 --to drop2
   ```

3. The final acceptance is a full render to `studio/out/cut-2`. The budget is 4 minutes; cut 1 took 2:25.

   ```
   node --max-old-space-size=4096 studio/render.mjs --out studio/out/cut-2
   ```

4. Run the producer check on it:

   ```
   node <check-script> studio/out/cut-2
   ```

   The script is read-only. It uses only the Engineer's analysis helpers and prints the brief §6 drop-delta
   table and the §14 cut-2 checks.
   - It is at
     `C:\Users\mliss\AppData\Local\Temp\claude\7687a6756ea81310\1cd8b79a-d72c-47b3-9428-607d5e84ea97\scratchpad\drop-check.mjs`.
   - If that path is gone, save the copy in the **Appendix** to your own scratchpad and run that.
   - Cut 1's output is in the Appendix too, as the "before".
5. In your final report, paste the check output and say which checks still fail and why.

**Priority:** **P0** = label "must", do it first. **P1** = "should". **P2** = "nice", do it if time and the
render budget allow.

---

## Musician B: drums, FX, mix and master

Your files: `mix.js`, `parts/drums.js`, `parts/fx.js`, `instruments/b-kit.js`.

### B1 (P0): builds under the drops (brief §6)

Do steps 1 and 2, render, measure, and only then do step 3 if needed.

**Step 1: the sources.**

- `b-kit.js` NoiseRiser:
  - The default `endDb` goes −8 → **−15**. Or pass `endDb: -15` to `nr` in `fx.js`.
  - The width growth `w = 0.15 + 0.85 * x` becomes **`w = 0.15 + 0.45 * x`**, a cap of 0.6.
- `fx.js` PitchRiser: `vel: 1` → **0.6** (build2 and build3).
- `drums.js` `snareRoll(...)`: **`v1: 0.8`** in build1, build2 and build3. The drop2 bar-8 roll goes 0.95 →
  0.85.
- `mix.js`:
  - `fx_rise` width 1.2 → **0.8**.
  - `HALL_SWELL` peaks: build1 `[3.75, -24]`, build2 `[7.5, -22]`, build3 `[7.5, -22]`.

**Step 2: no master crescendo into the gap.** Master `auto.gain`:

| Section | Lane |
|---|---|
| build1 | `[[0,-3],[2,-3],[3.75,-3.5],[4,-3.5]]` |
| build2 | `[[0,-2.2],[4,-2.5],[7.5,-3],[8,-3]]` |
| build3 | `[[0,-3.6],[4,-3.4],[7.5,-3.5],[8,-3.5]]` |

**Step 3: only if a build's last bar is still above the next drop's mean − 1 LU.**

- Snare lane −10 → −13 over the last 2 bars of that build.
- Then 2 dB more off the riser.

**Do not overshoot.** The last bar must stay **at or above the drop mean − 4 LU**, or the build goes limp.

**Pass:**

- All three build rows of the check pass: ceiling, floor, and "drop bar 1 ≥ build last bar + 1.5 LU".
- The song's momentary and short-term maxima land in drop3b, drop3c or the tag hit.

### B2 (P0): the gaps go quiet (brief §6)

- **The hall and plate returns duck 12 dB** inside each window, from the gap start to mid-gap, and come
  back instantly on the drop downbeat. With your `lane()` positions, for the hall (base 2), add these
  section points:

  | Section | Points |
  |---|---|
  | build1 | `[[0,2],[3.75,2],[3.875,-10],[4,-10]]` |
  | build2 / build3 | `[[0,2],[7.5,2],[7.75,-10],[8,-10]]` |
  | drop2 | `[[0,2],[7.875,2],[7.94,-10],[8,-10]]` |
  | drop3 | `[[0,2],[7.75,2],[7.875,-10],[8,-10]]` |

  Do the same on the plate (base 1.5).
- **The hall is high-passed at 500 Hz inside the windows.** Move its static `eq` HP/LP into
  `filter: { hp: 300, lp: 7000 }` and add `auto.hp` points that step to 500 at the gap start and back to
  300 at the downbeat.
- **Pass:** on the final WAV, the second half of each window is ≤ −30 dBFS (50 ms RMS). Build3 may reach
  −28 (the breath stays) and drop2 −27.
  - Cut 1: −25.3 / −27.6 / −24.6 / −19.3 / −19.6.
  - Ignore the report's "master max" column. It is pre-drive and reads about 5 dB low.

### B3 (P0): the drop's top end, in phase (brief §11 width rules, §14)

- **Widths:**

  | Strip | Cut 1 | Cut 2 |
  |---|---|---|
  | music bus, drops | 1.35–1.45 | **1.1** |
  | chords and pad, drops | 1.6 / 1.5 | **1.3** |
  | drums bus, drops | 1.15 | **1.0** |
  | cymbals | 1.3 | **1.1** |
  | hats | 1.1 | **1.0** |
  | plate / hall / room returns | 1.2 / 1.1 / 1.2 | **1.0** |

- **The build narrows, the drop opens.** The music bus width lane goes to about **0.7** over the last 2 bars
  of each build, then 1.1 on the drop downbeat:
  - build1 `[[0,1],[2,1],[3.75,0.7]]`
  - build2 `[[0,1],[6,1],[7.5,0.7]]`
  - build3 `[[0,1.1],[6,1],[7.5,0.7]]`
- **Hats lane:**

  | Section | Cut 1 | Cut 2 |
  |---|---|---|
  | drop1 | −5 | −2.5 |
  | drop1b | −9 (base) | −6 |
  | drop2 / drop2b | −5.5 | −2.5 |
  | drop3 / drop3b / drop3c | −8 | −5 |

  Ride gain −11 → −9.
- **Crash:**
  - Delete the 4.2 kHz cut.
  - HP 320 → 450 Hz.
  - A gain lane of about **+4 dB in the drops**: `lane(-5, each(DROPS, -1))`.
  - The downbeat crash is the payoff, so it must be audible on a phone.
- **Drums programming (`drums.js`):**
  - **drop1:** keep the closed offbeats. Add an **open hat on step 14 (the "and" of 4) in every bar**,
    choked by the next downbeat.
  - **drop3 / drop3b / drop3c:** add the **straight 16th shaker** `xoXoxoXoxoXoxoXo` (pan −0.25, about
    0.45 velocity). Set the perc lane to −8 there.
  - **drop3c:** add a **crash every 2 bars** (bars 1, 3, 5, 7). Keep the bar-8 beat-3 deceptive crash.
- **Air:** add a static `{ type: 'hs', freq: 10000, gain: 1.5 }` to the music bus. If the drops still miss
  the air target, add a parallel `air` bus (send from music, `filter: { hp: 8000 }`, a gain lane open only
  in the drops).
- **Pass, in every drop:**
  - presence correlation ≥ +0.3 and air correlation ≥ +0.15
  - Mid-channel presence ≥ mid − 6 dB and air ≥ mid − 11 dB
  - in the first 4 s, presence ≥ the build tail − 2 dB and air ≥ the build tail − 4 dB
  - drop1 and drop2 mid-band S−M ≥ the previous verse + 1 dB

### B4 (P0): drop 1 is the light pop drop, hook in front

Lanes in drop1 and drop1b:

| Strip | Cut 1 | Cut 2 |
|---|---|---|
| bass | −0.5 | **−4** |
| sub | −3 | **−5** |
| gtr_lead | −3 | **−1** |
| pluck | −2 | **0** |

**New stem `piano_stab`** (Musician A is moving the drop1/1b offbeat stabs onto it):

- Give it a strip with piano_pop's chain (HP 180, +3 dB shelf at 3 kHz, −3 dB at 450 Hz, fast comp).
- Width ≤ 1.2, a 3 dB pump in the drops, a starting gain of about −8.
- The stabs sit under the hook. Do not let it fall into the `'*'` default strip.

**Pass:**

- drop1 sub + low ≤ 48 % and mid + presence ≥ 33 %.
- The summed hook (piano_pop + gtr_lead + pluck) is 2–3 dB under the kick and above the bass bus.

### B5 (P0): drop 3 grows at the bottom, not in the mids

- Kick lane drop3 / drop3b / drop3c −10.5 → **−9.5**. Sub lane −2 → **0**.
- Strings lane drop3 / drop3b / drop3c −6 → **−10**, and build3 → −9. The tag stays −10. Musician A is not
  cutting the strings at the source, so this is the only strings cut.
- Static **−2.5 dB at 400 Hz (Q 0.9)** on strings, chords and choir, on top of their 300 Hz cuts. Watch that
  the choir does not go hollow.
- Lead HP 220 → **300 Hz**. pluck_arp: HP 400 → **1200 Hz**, LP 4500 → **8000 Hz**.
- **Pass in drop3c:**
  - low ≥ mid
  - mid ≤ 32 % and presence ≥ 9 %
  - low-mid ≤ mid − 3 dB
  - short-term max ≤ −7.8 LUFS, with each drop still louder than the one before it

### B6 (P1): voice exposure (brief §8)

- **choir_lead lane:** build3 −4 → **−7**, tag −6 → **−9**. The supersaw and piano are the front there.
- **pluck lane drop2 / drop2b: +2.** Musician A now plays full-length pluck notes. Target the pluck RMS
  5–7 dB under the chops in drop2 / drop2b.

### B7 (P1): verses and breakdown open on a phone

- **Piano:**
  - Replace −1.5 dB at 300 Hz with **−3 dB at 300 Hz (Q 1)**.
  - Move the HP into `filter: { hp: 70 }` with `auto.hp` = **90** in verse1, verse1b and verse2.
- **Choir:** −2 dB at 350 Hz (the pad already has it).
- **Breakdown:** an `lp` lane on the hall return, 7000 → **9500 Hz** across the breakdown. Fallback if the
  breakdown still misses: a static +1.5 dB shelf at 8 kHz on the choir.
- **Pass:**
  - verse low-mid ≤ 30 % and presence ≥ 6 %
  - breakdown presence ≥ 4 % and air ≥ 1.5 %

### B8 (P1): no subsonic waste

- `fx_hit` HP 22 → **35 Hz**.
- In `fx.js`, SubDrop `to:` 25 / 27 / 30 → **36**.
- In `b-kit.js` ImpactB, `f = 28 + 32 * exp(-t/0.5)` → **`f = 35 + 25 * exp(-t/0.5)`**.
- **Pass:** `fx_hit` no longer dominates the tag's sub band (cut 1: 70 %), and the masters' HP at 25 Hz
  sees nothing.

### B9 (P1): keep the master honest

- Integrated −9.5 ± 0.5 LUFS, ≤ −1 dBTP, 0 clips.
- Drop crest 7.5–9.5 dB.
- Each drop pair is louder than the last, using the §11 targets: drop1 −9.5, drop2 −9.0, drop3 −8.5 →
  drop3c −8.1.
- If drop1 loses too much after B4, ride its master lane up a few tenths. Do not put the bass back.

---

## Musician A: keys, guitars, bass, leads and vocals

Your files: `parts/keys.js`, `guitar.js`, `bass.js`, `leads.js`, `vocals.js`, and `instruments/a-*.js`.

### A1 (P0): strings that play like players (brief §9 "Strings")

- **Delete every `n.midi - 12` strings layer** (`leads.js`, drop3 / drop3b / drop3c and the tag). This is
  not negotiable: it sits on the bass harmonics.
- **The melody strings play only notes of 4 or more sixteenths, at +12.**
  - Merge each run of consecutive long notes into **one phrase with no re-attack**.
  - Cut 1 re-attacked every note, 8ths included, with a 90 ms swell.
- **Portamento and brightness swell.** The engine `Strings` has no `glideFrom` and a static filter. Either:
  - (a) build `instruments/a-strings.js`: one continuous voice per phrase with a 40–60 ms portamento
    between pitches and a cutoff swell from 2 kHz to 6 kHz over each note's attack; or
  - (b) the minimum fallback: render the long notes with `articulation: 'legato'`, overlapping 60 ms
    crossfades, and velocity shaped so the attack never pops.

  I've asked the Engineer for `glideFrom` and a brightness envelope on `Strings` (E3). Use them if they land
  first.
- **Do not change the strings' overall level.** Musician B does that.
- **The breakdown ice pedal, the build3 swells and the tag's final chord voicing stay as they are.**

### A2 (P0): chops, a sampler and not a loop (brief §8)

In `a-chops.js`:

- **Round robin:** 3–4 sources per (pitch, vowel). Each source gets its own seed and a formant shift of
  **×(1 ± 0.03)**. Cycle through them, never repeating the last one.
- **Slice offsets** chosen at random in **0.08–0.6 s**. Extend the source so offset + dur fits. Stutters and
  long notes then catch the vibrato.
- **±8 cents** of random tuning per chop, on top of the scoop.
- **Vowel drift on held chops** (≥ 1/4 note): "ah" moves toward a schwa over about 200 ms. Use the Voice's
  vowel morph if it has one; otherwise crossfade two sources.
- **A soft "h" onset** on phrase-initial chops: about 40 ms of breath noise through the vowel's formants at
  about −18 dB. No hard consonants.
- **Render budget.** Vocals took 56 s in cut 1. If round robin pushes the full render past about 3:30, drop
  to 3 sources and 1.2 s source length.

In `vocals.js`:

- The drop2 / drop2b **+24 layer: `db: -10` → `-14`.**
- `chopRoll` **v1 → 0.7** everywhere: the default 0.9, build3's 0.92, and the build1 and build2 calls.
- **drop2b, call and response.** On notes ≥ 8 sixteenths the chop sings only the first 8th; the guitar
  answers (A6). There are no re-chop stutters in drop2b. Phrase heads and short notes are as in drop2.
- **drop3b / drop3c:** chops **only on long notes** (≥ 8 sixteenths), as 8th stutters starting on the
  note's **second 8th**. They are silent on short notes and on time σ 0.
- **drop1b:** the choir "oh" double plays **bars 5–8 only**.

### A3 (P0): the build stays thin, the drop shines (`leads.js`)

**Build stabs:**

- Velocity capped at **0.75**, cutoff capped at **6000**.
- Line ~92 (build1): `0.55 + 0.4 * p` → `Math.min(0.75, …)`.
- Line ~114 (build2): clamp `v` to 0.75 and `cut` to 6000.
- Line ~174 (build3): `0.62 + 0.33 * p` → ≤ 0.75, and `1200 * 10 ** p` → ≤ 6000.

**Build3 lead:** `cutoff: 2000 * 4 ** p` → `Math.min(6000, …)`.

**Drop synths:**

- `leadBase.filter`: cutoff 6800 → **9500**, env 0.55 → **0.7**. This was a compromise between the two A&Rs.
- WALL cutoff 8500 → **12000**.
- PLUCK cutoff 600 → **1400** (env 3.2 stays).

**LEAD3 air layer:**

- Add a separate `LEADAIR = new E.inst.Synth({ osc: [{ type: 'noise' }], filter: { type: 'hp', cutoff: 8000,
  env: 0 }, amp: <LEAD3's amp> })`.
- Play it on the `lead` stem with every LEAD3 note at `db: -24` (drop3 / 3b / 3c and the tag).

**Drop3 0-octave LEAD layer:** `db: -6` → **`-10`**.

**pluck_arp (drop3c):** `cutoff: 430` → **1200** (Musician B moves its HP and LP).

### A4 (P1): drop 3c unites through the piano, nothing else

- **Out of drop3c:** the `gtr_lead` bake and the acoustic strums (`guitar.js`). The distorted doubles and
  the muted chugs stay.
- **The drop-1 pop-piano octaves at +12 carry the callback** (`keys.js`).
- **Every tune double on the supersaw grid** with timing σ 0 in drop3 / 3b / 3c: piano_pop, chops,
  strings and bells. Velocity may vary. Check `leadLine(..., { sd })` defaults and pass `sd: 0`.

### A5 (P1): drop 1, the hook in front and the width from real doubles

- **`keys.js`:** move the drop1 / drop1b offbeat stabs (`'..x...x.o.x...x.'`) onto a **new stem
  `piano_stab`**, as a second KeyBed. Keep the stab velocity at 0.6. Musician B sets the level.
- **`guitar.js`:** **AC2 at R 60** in drop1 / drop1b, mirroring AC1 at L 60. It is a second performance:
  its own seed, about 15 ms later, with upstrokes varied.
- **`leads.js` drop2 / drop2b pluck:** `dur: 0.12` → `Math.min(n.dur, 0.5)` and `vel` → about 0.6, so it
  carries pitch under the chops. Musician B sets the level.

### A6 (P1): the variations in drop1b and drop2b (brief §4)

**drop1b, bars 1–4:**

- `gtr_lead` sings the refrain alone, as now.
- **piano_pop does not double the tune.** Instead, inside each note ≥ 4 sixteenths, it plays a short
  **answer an octave up**: 2–3 8ths of chord tones landing on the held pitch +12, starting on the note's
  second beat.
- **The pluck rests.**
- **Bars 5–8:** the full composite as in drop1.

**drop2b:**

- The **funk guitar answers** inside the long notes (≥ 8 sixteenths), after the chop's first 8th.
- The lick is a 16th figure on chord tones, ending on the held pitch.
- Play it on `gtr_clean` (bridge, light palm mute, pan R 25), so Musician B can place it apart from the
  scratch guitar.

### A7 (P1): verses that read on a phone (`keys.js`)

- **The felt piano gets `brightness: 0.6`.** That uses the public option (the default for felt is 0.3).
  It lifts the hammer cutoff about 29 %, the label's "felt multiplier 0.38 → 0.5", without an engine change.
- **The verse LH goes from E2 up:** in verse1, verse1b and verse2 use `pcAtOrAbove(c.bass, 40)` instead of
  `lhMidi(c.bass)`.
  - The LH bottom is then F2–D3, plus the octave above.
  - Inner tones stay ≥ 55.
  - Leave `lhMidi` as it is for the intro, the breakdown and the tag.
- **The Rhodes LH in verse2:** the same floor of 40.

### A8 (P2): open the breakdown (brief §4)

- **Grand brightness 0.7** for breakdown bars 1–4. Use a second `Piano({ tone: 'grand', brightness: 0.7 })`
  KeyBed; the bars 5–8 grand stays at 0.55.
- **A bell ping on D7 (MIDI 98)** at the start of bars 1 and 3 (velocity about 0.14, about 6 dB under the
  D6 pedal's 0.28), in `leads.js`.
- **Guitar natural harmonics on D6 (86) and A6 (93)** in bars 1–4, with the long delay (`guitar.js`).
- **No breath or noise layer.**

---

## Requests to the Engineer

These are files I can't edit. In priority order:

- **E1. Report.**
  - Add the §6 drop-delta table, plus the presence/air/correlation payoff rows.
  - Add Mid-only band levels and S−M per band per section, and the mono fold-down loss (M-only vs L+R), with
    a flag above 2 dB in presence or air.
  - Compute section short-term max only from windows fully inside the section.
  - **Measure the silence table on the final file, after the master drive.** Today it reads about 5 dB low.
  - Draw the drum stems in their own piano-roll lane.
  - The producer check script in the Appendix shows the maths.
- **E2. Piano realism.** The piano is the verse lead and half the drop 1 hook. Add:
  - a modal soundboard (25–30 modes, 60 Hz–3 kHz, Q 15–40, 150–250 ms)
  - 3 strings across MIDI 45–88 (±0.5–1.5 cents)
  - key-off and damper noise (40–80 ms of band-passed noise at about −35 dB re the note)
  - hammer-return noise on the felt tone
- **E3. `Strings`.** Add a `glideFrom` / `glide` note option (portamento, like `Synth`) and a brightness
  envelope (cutoff from X to Y over the attack), so A1 can be done properly.

## What to report back

1. The check output for `studio/out/cut-2`.
2. Every P0 item: done, or not done and why.
3. The render time.
4. Anything you could not verify, plainly. We still cannot hear the record. The chop and choir timbre and
   the string realism are judged from code and spectra only.

---

## Appendix: the producer check script, and cut 1's results

Save the script as `drop-check.mjs` anywhere outside the repo. Run it from the repo root as
`node drop-check.mjs studio/out/cut-2`. It reads `<dir>/hatikvah.wav` and `<dir>/report.json` and imports
`studio/engine/{wav,analysis/loudness,core/fft}.js` relative to `<dir>/../..`.

Cut 1's results are reproduced below the script for comparison.

```js
// Producer's cut-2 acceptance check (read-only). Usage, from the repo root:
//   node <this file> studio/out/cut-2
// Reads <dir>/hatikvah.wav + <dir>/report.json and prints the brief's section 6 "drop delta" table and the
// section 14 cut-2 checks. Uses only the Engineer's analysis helpers (no writes anywhere).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = path.resolve(process.argv[2] || 'studio/out/cut-1');
const studioRoot = path.resolve(dir, '..', '..');
const imp = (p) => import(pathToFileURL(path.join(studioRoot, p)).href);
const { readWav } = await imp('engine/wav.js');
const { kWeightedPower } = await imp('engine/analysis/loudness.js');
const { powerSpectrum } = await imp('engine/core/fft.js');

const rep = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
const { sr, L, R } = readWav(path.join(dir, 'hatikvah.wav'));
const SEC = Object.fromEntries(rep.sections.map((s) => [s.name, s]));
const { pw, sub } = kWeightedPower([L, R], sr);
const toL = (ms) => -0.691 + 10 * Math.log10(Math.max(ms, 1e-20));
const blk = (t) => Math.floor((t * sr) / sub);
const mom = (i) => toL((pw[i] + pw[i - 1] + pw[i - 2] + pw[i - 3]) / (4 * sub));   // 400 ms window ending at block i
const stAt = (i) => { let a = 0; for (let k = 0; k < 30; k++) a += pw[i - k] || 0; return toL(a / (30 * sub)); };
const momMax = (t0, t1) => { let m = -Infinity; for (let i = blk(t0) + 3; i < blk(t1); i++) m = Math.max(m, mom(i)); return m; };
const meanL = (t0, t1) => { let a = 0, n = 0; for (let i = blk(t0); i < blk(t1); i++) { a += pw[i]; n++; } return toL(a / (n * sub)); };
const stMaxInside = (s) => { let m = -Infinity; for (let i = blk(s.start) + 30; i < blk(s.end); i++) m = Math.max(m, stAt(i)); return m; };
const rmsMax = (t0, t1, hop = 0.05) => {
  let m = -Infinity;
  for (let t = t0; t + hop <= t1 + 1e-9; t += hop) {
    const i0 = Math.round(t * sr), i1 = Math.round((t + hop) * sr); let a = 0;
    for (let i = i0; i < i1; i++) a += (L[i] * L[i] + R[i] * R[i]) / 2;
    m = Math.max(m, 10 * Math.log10(a / (i1 - i0) + 1e-20));
  }
  return m;
};
const BANDS = { sub: [20, 60], low: [60, 250], lowmid: [250, 800], mid: [800, 3000], pres: [3000, 8000], air: [8000, 20000] };
function bands(t0, t1) {
  const N = 4096, acc = { M: {}, S: {}, LR: {} };
  for (const b in BANDS) { acc.M[b] = 0; acc.S[b] = 0; acc.LR[b] = 0; }
  const m = new Float32Array(N), s = new Float32Array(N), l = new Float32Array(N), r = new Float32Array(N);
  const pm = new Float64Array(N / 2 + 1), ps = new Float64Array(N / 2 + 1), pl = new Float64Array(N / 2 + 1), pr = new Float64Array(N / 2 + 1);
  let frames = 0;
  for (let o = Math.round(t0 * sr); o + N <= Math.round(t1 * sr); o += N / 2) {
    for (let k = 0; k < N; k++) { const a = L[o + k], b = R[o + k]; m[k] = (a + b) / 2; s[k] = (a - b) / 2; l[k] = a; r[k] = b; }
    powerSpectrum(m, 0, N, pm); powerSpectrum(s, 0, N, ps); powerSpectrum(l, 0, N, pl); powerSpectrum(r, 0, N, pr);
    for (const b in BANDS) { const [f0, f1] = BANDS[b]; for (let k = Math.ceil((f0 * N) / sr); k < Math.min(N / 2, (f1 * N) / sr); k++) { acc.M[b] += pm[k]; acc.S[b] += ps[k]; acc.LR[b] += (pl[k] + pr[k]) / 2; } }
    frames++;
  }
  const out = {};
  for (const b in BANDS) {
    const M = acc.M[b], S = acc.S[b];
    out[b] = { M: 10 * Math.log10(M / frames + 1e-20), LR: 10 * Math.log10(acc.LR[b] / frames + 1e-20), SmM: 10 * Math.log10((S + 1e-20) / (M + 1e-20)), corr: (M - S) / (M + S + 1e-20) };
  }
  return out;
}
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');
const ok = (c) => (c ? 'ok' : '**FAIL**');
const endBpm = (s) => { const b = String(s.bpm).split('->').map(Number); return b[b.length - 1]; };

// ---------------------------------------------------------------- 1. drop delta (brief section 6)
console.log(`# Cut-2 producer check: ${dir}\n`);
console.log('## Drop delta (brief section 6)\n');
console.log('| into | build last bar M max | drop mean M | rule: <= drop-1, >= drop-4 | build last bar mean | drop bar 1 mean | rule: bar1 >= build+1.5 | gap 2nd-half max RMS dBFS | rule | pres d (L+R) | air d (L+R) | rule: >=-2 / >=-4 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
const PAIRS = [['build1', 'drop1'], ['build2', 'drop2'], ['drop2', 'drop2b'], ['build3', 'drop3'], ['drop3', 'drop3b']];
for (const [b, d] of PAIRS) {
  const g = rep.silences.find((x) => x.section === b), B = SEC[b], D = SEC[d];
  const gs = g ? g.start : B.end, bar = 240 / endBpm(B), dbar = 240 / endBpm(D);
  const isBuild = B.role === 'build';
  const lbMax = momMax(gs - bar, gs), lbMean = meanL(gs - bar, gs), dMean = meanL(D.start, D.end), d1 = meanL(D.start, D.start + dbar);
  const gapMax = g ? rmsMax((g.start + g.end) / 2, g.end - 0.005) : NaN, gapLimit = ({ build1: -30, build2: -30, drop2: -27, build3: -28, drop3: -30 })[b] ?? -30;
  const bt = bands(gs - 2, gs), dh = bands(D.start, D.start + 4);
  const dp = dh.pres.LR - bt.pres.LR, da = dh.air.LR - bt.air.LR;
  const ruleA = isBuild ? ok(lbMax <= dMean - 1 && lbMax >= dMean - 4) : 'n/a';
  const ruleB = isBuild ? ok(d1 >= lbMean + 1.5) : ok(d1 >= lbMean);   // re-drops: bar 1 >= the previous bar
  const ruleD = isBuild ? ok(dp >= -2 && da >= -4) : 'n/a';
  console.log(`| ${b} -> ${d} | ${f1(lbMax)} | ${f1(dMean)} | ${ruleA} | ${f1(lbMean)} | ${f1(d1)} | ${ruleB} | ${f1(gapMax)} | ${ok(gapMax <= gapLimit)} | ${f1(dp)} | ${f1(da)} | ${ruleD} |`);
}

// ---------------------------------------------------------------- 2. per-section Mid-channel bands, S-M, correlation
console.log('\n## Mid-channel band level dB (S-M dB) per section, band correlation, and the section 14 cut-2 checks\n');
console.log('| section | sub | low | lowmid | mid | pres | air | pres-mid | air-mid | pres corr | air corr | ST max (inside) | checks |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const s of rep.sections) {
  if (s.name.startsWith('(')) continue;
  const r = bands(s.start, s.end), sh = Object.fromEntries(Object.entries(s.bands).map(([k, v]) => [k, v.pct]));
  const pm = r.pres.M - r.mid.M, am = r.air.M - r.mid.M, checks = [];
  if (s.role === 'drop') {
    checks.push(`pres-mid>=-6 ${ok(pm >= -6)}`, `air-mid>=-11 ${ok(am >= -11)}`, `presCorr>=0.3 ${ok(r.pres.corr >= 0.3)}`, `airCorr>=0.15 ${ok(r.air.corr >= 0.15)}`, `crest 7.5-9.5 ${ok(s.crestDb >= 7.5 && s.crestDb <= 9.5)}`);
    if (s.name === 'drop1' || s.name === 'drop1b') checks.push(`sub+low<=48% ${ok(sh.sub + sh.low <= 48)}`, `mid+pres>=33% ${ok(sh.mid + sh.presence >= 33)}`);
    if (s.name === 'drop3c') checks.push(`STmax<=-7.8 ${ok(stMaxInside(s) <= -7.8)}`, `low>=mid ${ok(sh.low >= sh.mid)}`, `mid<=32% ${ok(sh.mid <= 32)}`, `pres>=9% ${ok(sh.presence >= 9)}`, `lowmid<=mid-3dB ${ok(r.lowmid.LR <= r.mid.LR - 3)}`);
  }
  const prevVerse = { drop1: 'verse1b', drop2: 'verse2' }[s.name];
  if (prevVerse) { const v = SEC[prevVerse], rv = bands(v.start, v.end); checks.push(`mid S-M >= ${prevVerse}+1dB ${ok(r.mid.SmM >= rv.mid.SmM + 1)}`); }
  if (s.role === 'verse') checks.push(`lowmid<=30% ${ok(sh.lowmid <= 30)}`, `pres>=6% ${ok(sh.presence >= 6)}`);
  if (s.role === 'breakdown') checks.push(`pres>=4% ${ok(sh.presence >= 4)}`, `air>=1.5% ${ok(sh.air >= 1.5)}`);
  const cell = (k) => `${f1(r[k].M)} (${f1(r[k].SmM)})`;
  console.log(`| ${s.name} | ${cell('sub')} | ${cell('low')} | ${cell('lowmid')} | ${cell('mid')} | ${cell('pres')} | ${cell('air')} | ${f1(pm)} | ${f1(am)} | ${f2(r.pres.corr)} | ${f2(r.air.corr)} | ${f1(stMaxInside(s))} | ${checks.join('; ')} |`);
}

// ---------------------------------------------------------------- 3. global
let mi = 3, mv = -Infinity; for (let i = 3; i < pw.length; i++) { const v = mom(i); if (v > mv) { mv = v; mi = i; } }
let si = 29, sv = -Infinity; for (let i = 29; i < pw.length; i++) { const v = stAt(i); if (v > sv) { sv = v; si = i; } }
const where = (i) => { const t = ((i + 1) * sub) / sr; const s = rep.sections.find((x) => t >= x.start && t < x.end); return `${t.toFixed(1)} s (${s ? s.name : '?'})`; };
const home = (i) => { const t = ((i + 1) * sub) / sr; const s = rep.sections.find((x) => t >= x.start && t < x.end); return s && ['drop3b', 'drop3c', 'tag'].includes(s.name); };
console.log(`\nMomentary max ${f1(mv)} LUFS at ${where(mi)}: ${ok(home(mi))} (must be in drop3b, drop3c or the tag hit)`);
console.log(`Short-term max ${f1(sv)} LUFS at ${where(si)}: ${ok(home(si))}`);
const drops = ['drop1', 'drop1b', 'drop2', 'drop2b', 'drop3', 'drop3b', 'drop3c'].map((n) => [n, SEC[n].lufs]);
console.log(`Drop LUFS: ${drops.map(([n, v]) => `${n} ${v}`).join(', ')}`);
console.log(`Integrated ${rep.loudness?.integratedLufs} LUFS, true peak ${rep.loudness?.truePeakDbtp} dBTP`);
```

### Cut 1 (studio/out/cut-1), the "before"

(producer check on cut 1)

#### Drop delta (brief section 6)

| into | build last bar M max | drop mean M | rule: <= drop-1, >= drop-4 | build last bar mean | drop bar 1 mean | rule: bar1 >= build+1.5 | gap 2nd-half max RMS dBFS | rule | pres d (L+R) | air d (L+R) | rule: >=-2 / >=-4 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| build1 -> drop1 | -6.0 | -9.5 | **FAIL** | -8.2 | -9.3 | **FAIL** | -25.3 | **FAIL** | -7.9 | -10.0 | **FAIL** |
| build2 -> drop2 | -4.9 | -8.9 | **FAIL** | -5.9 | -8.8 | **FAIL** | -27.6 | **FAIL** | -8.2 | -9.1 | **FAIL** |
| drop2 -> drop2b | -8.3 | -8.5 | n/a | -9.1 | -8.8 | ok | -24.6 | **FAIL** | -0.9 | -0.4 | n/a |
| build3 -> drop3 | -5.0 | -8.0 | **FAIL** | -5.9 | -7.8 | **FAIL** | -19.3 | **FAIL** | -5.3 | -9.7 | **FAIL** |
| drop3 -> drop3b | -7.5 | -7.8 | n/a | -8.1 | -7.8 | ok | -19.6 | **FAIL** | 0.4 | 1.4 | n/a |

#### Mid-channel band level dB (S-M dB) per section, band correlation, and the section 14 cut-2 checks

| section | sub | low | lowmid | mid | pres | air | pres-mid | air-mid | pres corr | air corr | ST max (inside) | checks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| intro | -39.5 (-68.4) | -23.1 (-16.9) | -21.0 (-10.0) | -19.4 (-4.7) | -29.8 (-0.5) | -33.0 (0.0) | -10.5 | -13.6 | 0.06 | -0.00 | -16.3 |  |
| verse1 | -22.9 (-80.1) | -18.3 (-19.9) | -17.2 (-12.5) | -21.3 (-6.8) | -28.4 (-1.7) | -34.2 (-1.5) | -7.0 | -12.9 | 0.19 | 0.17 | -14.9 | lowmid<=30% **FAIL**; pres>=6% **FAIL** |
| verse1b | -21.7 (-64.3) | -15.7 (-21.2) | -15.1 (-10.0) | -20.0 (-5.4) | -27.1 (-1.5) | -31.6 (-1.2) | -7.1 | -11.6 | 0.17 | 0.14 | -12.8 | lowmid<=30% **FAIL**; pres>=6% **FAIL** |
| build1 | -20.5 (-61.6) | -18.1 (-16.8) | -18.0 (-6.9) | -16.1 (-5.4) | -20.4 (0.0) | -24.6 (0.4) | -4.3 | -8.5 | -0.00 | -0.05 | -9.5 |  |
| drop1 | -14.1 (-52.4) | -11.5 (-19.2) | -16.2 (-7.6) | -14.7 (-4.1) | -23.2 (0.2) | -30.4 (1.1) | -8.5 | -15.6 | -0.02 | -0.12 | -9.2 | pres-mid>=-6 **FAIL**; air-mid>=-11 **FAIL**; presCorr>=0.3 **FAIL**; airCorr>=0.15 **FAIL**; crest 7.5-9.5 **FAIL**; sub+low<=48% **FAIL**; mid+pres>=33% **FAIL**; mid S-M >= verse1b+1dB ok |
| drop1b | -14.6 (-52.6) | -11.9 (-20.0) | -15.0 (-4.7) | -14.5 (-3.6) | -22.3 (0.4) | -28.6 (1.2) | -7.8 | -14.1 | -0.04 | -0.14 | -8.8 | pres-mid>=-6 **FAIL**; air-mid>=-11 **FAIL**; presCorr>=0.3 **FAIL**; airCorr>=0.15 **FAIL**; crest 7.5-9.5 **FAIL**; sub+low<=48% **FAIL**; mid+pres>=33% **FAIL** |
| verse2 | -18.4 (-65.0) | -14.3 (-18.3) | -16.4 (-7.5) | -16.6 (-5.4) | -23.7 (-2.6) | -29.6 (-2.0) | -7.1 | -13.0 | 0.29 | 0.23 | -11.3 | lowmid<=30% ok; pres>=6% **FAIL** |
| build2 | -16.8 (-51.9) | -14.8 (-20.8) | -18.4 (-5.4) | -16.0 (-4.8) | -20.6 (0.1) | -25.0 (0.2) | -4.6 | -9.0 | -0.01 | -0.02 | -6.7 |  |
| drop2 | -13.8 (-52.2) | -12.9 (-21.1) | -15.7 (-8.9) | -12.5 (-4.8) | -22.0 (-0.9) | -27.1 (1.4) | -9.5 | -14.6 | 0.10 | -0.16 | -8.6 | pres-mid>=-6 **FAIL**; air-mid>=-11 **FAIL**; presCorr>=0.3 **FAIL**; airCorr>=0.15 **FAIL**; crest 7.5-9.5 **FAIL**; mid S-M >= verse2+1dB **FAIL** |
| drop2b | -14.1 (-48.5) | -12.6 (-18.9) | -15.0 (-7.9) | -12.4 (-3.9) | -21.5 (-1.1) | -27.3 (1.3) | -9.2 | -14.9 | 0.12 | -0.15 | -8.2 | pres-mid>=-6 **FAIL**; air-mid>=-11 **FAIL**; presCorr>=0.3 **FAIL**; airCorr>=0.15 **FAIL**; crest 7.5-9.5 **FAIL** |
| breakdown | -20.8 (-72.7) | -18.0 (-13.7) | -17.3 (-3.4) | -18.6 (-1.5) | -31.3 (-1.0) | -36.9 (0.2) | -12.7 | -18.3 | 0.11 | -0.02 | -12.3 | pres>=4% **FAIL**; air>=1.5% **FAIL** |
| build3 | -17.7 (-47.1) | -14.6 (-15.4) | -15.7 (-4.1) | -15.2 (-2.6) | -21.2 (-0.3) | -26.2 (0.2) | -6.1 | -11.0 | 0.04 | -0.02 | -6.6 |  |
| drop3 | -14.6 (-46.3) | -11.0 (-16.3) | -14.5 (-3.2) | -13.7 (-1.5) | -20.1 (-1.9) | -28.1 (-0.4) | -6.4 | -14.4 | 0.21 | 0.05 | -7.8 | pres-mid>=-6 **FAIL**; air-mid>=-11 **FAIL**; presCorr>=0.3 **FAIL**; airCorr>=0.15 **FAIL**; crest 7.5-9.5 **FAIL** |
| drop3b | -14.9 (-45.8) | -11.0 (-16.2) | -15.0 (-4.0) | -12.7 (-2.2) | -19.3 (-3.4) | -26.5 (-2.4) | -6.6 | -13.8 | 0.37 | 0.27 | -7.6 | pres-mid>=-6 **FAIL**; air-mid>=-11 **FAIL**; presCorr>=0.3 ok; airCorr>=0.15 ok; crest 7.5-9.5 ok |
| drop3c | -15.7 (-43.9) | -11.3 (-16.7) | -15.1 (-3.5) | -11.9 (-2.1) | -19.0 (-2.0) | -26.4 (-1.4) | -7.0 | -14.4 | 0.23 | 0.16 | -7.1 | pres-mid>=-6 **FAIL**; air-mid>=-11 **FAIL**; presCorr>=0.3 **FAIL**; airCorr>=0.15 ok; crest 7.5-9.5 ok; STmax<=-7.8 **FAIL**; low>=mid **FAIL**; mid<=32% **FAIL**; pres>=9% **FAIL**; lowmid<=mid-3dB ok |
| tag | -15.4 (-51.1) | -15.3 (-13.3) | -13.8 (-1.9) | -15.2 (-1.1) | -23.4 (-2.5) | -32.3 (-0.0) | -8.2 | -17.1 | 0.28 | 0.00 | -9.4 |  |
| outro | -24.9 (-59.7) | -23.3 (-11.2) | -18.1 (-2.5) | -19.0 (-1.4) | -29.6 (-3.3) | -42.7 (-8.7) | -10.6 | -23.8 | 0.36 | 0.76 | -12.5 |  |

Momentary max -4.9 LUFS at 85.5 s (build2): **FAIL** (must be in drop3b, drop3c or the tag hit)
Short-term max -6.6 LUFS at 143.7 s (build3): **FAIL**
Drop LUFS: drop1 -9.5, drop1b -9, drop2 -8.9, drop2b -8.5, drop3 -8, drop3b -7.8, drop3c -7.3
Integrated -9.6 LUFS, true peak -1 dBTP
