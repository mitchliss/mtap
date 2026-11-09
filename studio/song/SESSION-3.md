# Recut session 3: the work list

From the Producer, for Musician A and Musician B, with four requests to the Engineer. Read `LABEL-NOTES.md`
(Round 2) for what the label heard and why each decision went the way it did. The brief (`brief.md`) has been
edited in place. The new hard rules are §6 "Build rise", §7 "Low-end pitch" and the §14 cut-3 rows. Machine
values are in `score.js` `cues`: `kickTailHz`, `kickEnvelope`, `subFloorMidi`, and the `checks.*` cut-3 rows.

## The one idea

Cut 2 fixed the payoff: every drop now lands. Both A&Rs scored it 7.4–7.5 and sent it back for **the two places
a listener judges "real" first**:

1. **The first sound.** Every game launch opens on a solo piano that has no soundboard, no proper unison and no
   damper noise. That is where "cheap game" gets judged.
2. **The bottom.** Drop 3's kick held a B under a C bass, and the tonic E had no sub. The main-stage low end was
   out of tune.

So: **a real piano, and a low end in tune.** Then three things the cut-2 checks never measured: build 2 sags,
drop 3 does not grow on a phone, and the breakdown and tag are washed in hall.

## What does not change

- **The form:** timeline, sections, bars, tempos, keys, melody spans, chords and the cues `silenceBeats`,
  `downbeat` and `finalHit`. It is still 106 bars and 3:16.5 (verified: `score.js` imports, ends at 196.48 s,
  and every chord parses).
- **Everything that passed in cut 2** must still pass: drop delta, gaps, the payoff on a phone, band
  correlations, drop1 balance, verses and crest.
- **One gain change, one owner.** Levels are Musician B's. Musician A changes source level only for a layer
  balance inside one part, such as the +24 chop layer or the breakdown grand's velocity.
- **No new stems and no new mixer inserts,** except the P2 `resonance` insert on piano_pop, and only if the
  render budget allows it (see "Budget").

## Order of work and how to check

1. **Musician A does A2 (the E1 sub, a three-line change) first,** then tells Musician B. B1's low-end targets
   cannot be judged without it. Everything else runs in parallel on each musician's own files.
2. **Partial renders for relative checks.** A partial render normalises to the range rendered, so judge only the
   relative rows (deltas, ladders, per-bar rise, low-end dB differences):

   ```
   node --max-old-space-size=4096 studio/render.mjs --out studio/out/s3-b-d3 --from drop2b --to drop3c      # low end, phone ladder, drop3c
   node --max-old-space-size=4096 studio/render.mjs --out studio/out/s3-b-b2 --from verse2 --to drop2       # build 2 rise + drop delta
   node --max-old-space-size=4096 studio/render.mjs --out studio/out/s3-b-bd --from drop2b --to drop3       # breakdown + build 3
   node --max-old-space-size=4096 studio/render.mjs --out studio/out/s3-b-tag --from drop3c --to outro      # tag hall
   node --max-old-space-size=4096 studio/render.mjs --out studio/out/s3-a-pno --to verse1b --only keys      # piano bloom (spectrogram)
   node --max-old-space-size=4096 studio/render.mjs --out studio/out/s3-a-chops --from drop2 --to drop2b --only vocals
   ```

3. **Final acceptance is a full render to `studio/out/cut-3`.** Musician B runs it once Musician A reports done.
   The budget is 4 minutes. Cut 2 took 219.6 s; aim for ≤ 230 s.

   ```
   node --max-old-space-size=4096 studio/render.mjs --out studio/out/cut-3
   ```

4. **Run the producer check:**

   ```
   node C:\Users\mliss\AppData\Local\Temp\claude\7687a6756ea81310\1cd8b79a-d72c-47b3-9428-607d5e84ea97\scratchpad\drop-check-3.mjs studio/out/cut-3
   ```

   - It is read-only and uses only the Engineer's helpers plus `score.js` and `src/music.js`.
   - It prints: §1 drop delta, §2 bands, phone sim and mono loss per section, §3 low-end pitch per drop bar,
     §4 phone ladder, §5 build per-bar rise, §6 reverb balance, §7 globals, and a **FAIL list** at the end.
   - If that path is gone, save the copy in the **Appendix** anywhere outside the repo and run that.
   - Cut 2 under the cut-3 rules is in the Appendix too, as the "before". Everything it fails is something the
     label flagged.

5. In your final report, paste the check's FAIL line (or "ALL PASS") and say which checks still fail and why.

**Budget.** Parts render in parallel worker threads. In cut 2, keys took 23.5 s while vocals (60.3 s) and leads
(51.6 s) set the parts' wall clock. The **mix stage took 137 s** of the 220 s. So:

- Musician A's piano work is nearly free in wall clock as long as the keys part stays ≤ 45 s.
- Every new **mixer insert or stem** costs real time.

**Priority:** **P0** = label "must", do it first. **P1** = "should". **P2** = "nice", only if the time and render
budget allow.

---

## Musician A: keys, guitars, bass, leads and vocals

Your files: `parts/keys.js`, `guitar.js`, `bass.js`, `leads.js`, `vocals.js`, and `instruments/a-*.js`.

### A1 (P0): a real piano, `instruments/a-piano.js` (brief §9 "Piano realism")

The Engineer did not deliver E2 in round 2, and both A&Rs called it a must. The piano is the record's first
voice, 0:00–0:19 is piano-led, and the game replays from the top. So you build it as your own instrument:

1. **`export class APiano`.** Fork `engine/inst/keys.js` `Piano` into your file, with the same constructor
   options and `render(note) → [L, R]`. Keep everything it already does: inharmonicity, stretch tuning, hammer
   spectrum, striking-point comb, damper, pedal and pitch-panning.
2. **Three strings in MIDI 45–88.** Each partial gets three damped sinusoids, one per string.
   - Detunes are {0, +d1, −d2} cents, with d1 and d2 drawn per note from 0.5–1.5 using the note's seeded `Rng`.
   - Each string's T60 is ×(1 ± 0.08).
   - Split the prompt (0.78) and aftersound (0.22) weights across the strings, so the beating and the two-stage
     decay come from the unison.
   - Below 45, keep the current two components. Above 88, use three strings and no damper, as now.
3. **Soundboard.** 28 modes, log-spaced 60 Hz–3 kHz, with ±8 % seeded jitter, Q 15–40 and T60 150–250 ms.
   - Precompute **one 0.25 s stereo IR per register band**, 6 bands: ≤ 44, 45–56, 57–68, 69–80, 81–92, ≥ 93.
     Give L and R different mode phases. Weight each band's modes towards that register: bass strings drive the
     low modes, treble strings the high ones.
   - Convolve the **first 250 ms of each note**, including the hammer pulse, with its band's IR (engine
     `core/fft.js` `FFT`, 32768 points). Mix it about **12 dB under** the dry note, and −15 dB on the pop piano.
   - Cut 2 has about 1,600 piano notes, so this is seconds of work. The equivalent cheaper route: `bake` each
     band's notes into a band buffer and run a 28-resonator bank over it. The body is linear, so per-band
     processing is the same filter.
4. **Key-off and damper noise.** At every damped note-off (not under the pedal, MIDI < 89), add 40–80 ms of
   band-passed noise at about **−35 dB re the note's peak**.
   - The centre runs from 300 Hz in the bass to 1.5 kHz in the treble, Q about 1.
   - Add a 15 ms felt "thup" (LP 400 Hz).
   - At each **pedal change** (your KeyBed `pedalEnd` per chord), add one damper-release swish at about −38 dB
     re the chord.
5. **Hammer return.** A 20 ms LP 250 Hz thunk, 25–40 ms after the attack, at about −30 dB re the note on the
   felt tone and −36 dB on the grand.
6. **Use it everywhere** in `keys.js`: felt, grand, grandOpen and pop. That covers `piano`, `piano_pop` and
   `piano_stab`. The engine `EPiano` (Rhodes) stays.
7. **Gain-match.** Each piano stem's per-section RMS stays within ±1 dB of cut 2 (see the report's stems
   table), so Musician B's levels still hold.

**Pass:**

- In `studio/out/s3-a-pno/spectrogram.png`, every intro and verse chord shows a dense 100–2500 Hz bloom
  decaying over about 200 ms. Read the PNG and describe it in your report.
- Verse low-mid ≤ 30 % and presence ≥ 6 % still hold.
- The keys part is ≤ 45 s.

**If the Engineer ships the same model into `engine/inst/keys.js` before you finish,** switch to it and delete
the fork. Never stack two soundboards.

### A2 (P0, do it first): the E-minor sub on E1 (`bass.js`, brief §7 "Bass register")

- In the drop3 / drop3b / drop3c loop, the **sub stem** plays `pcAtOrAbove(pc, 28)`. Read
  `studio.cues.subFloorMidi['E minor']` if it is present.
  - That puts E on E1 (41.2 Hz). D2, C2, B1, A1 and G1 are unchanged.
- The **+12 'bass' mid layer stays on `subMidi(...) + 12`**, so phones still hear E3. Today `m` feeds both, so
  split it into a sub note and a mid note.
- The drop3c deceptive C and the tag are already correct; leave them.
- Tell Musician B as soon as this lands.

### A3 (P1): build 2 builds (`leads.js`, `vocals.js`, brief §4 build2 and §6 "Build rise")

- **`leads.js` build2 stabs, bars 5–8 (`e ≥ 32`):**
  - `cut = Math.min(6000, 1600 * Math.pow(3.75, (e - 32) / 32))`. Cut 2 restarted at `900 * 6.6^p`, and bars
    5–6 became a muffled thud.
  - `v = Math.min(0.75, 0.66 + 0.09 * ((e - 32) / 32))`.
  - The 6 kHz and 0.75 caps stay.
- **`vocals.js` build2:**
  - The chop tease low-pass starts at **1000 Hz**: `lpSweep(sec.start, sec.at(4), 1000, 5000)`. 700 Hz cost
    4.4 LU on a phone in bar 1.
  - The chop roll starts in **8ths at bar 5**: `[{ from: 4, to: 7, div: 2 }, { from: 7, to: 8, div: 1 }]` with
    `v0: 0.58`. v1 stays 0.7.
- **Pass** (together with B4): build2 bars 5–6 mid band within 4 dB of bars 3–4, and the §6 rise rows.

### A4 (P1): the breakdown grand stays in front (`keys.js`, brief §4 breakdown)

- Bars 5–8: `pianoMelody(KG, 'breakdown', { base: 0.44, ... from: 4 })` → **`base: 0.62`, with
  `octaveOnHighD: true`** (and an `upVel` like bars 1–4).
- The choir "ah" soprano now doubles the grand 3 dB behind it. Musician B sets the choir_lead lane.

### A5 (P1): the +24 chop layer −14 → −16 dB (`vocals.js` line ~191, brief §8 "Chop treble")

`{ octave: 2, db: -16 }`. Fix the comment too. If anything else has to give in the voices, this layer goes first.

### A6 (P2): look at the chops (brief §8 "Visual check")

- Render `studio/out/s3-a-chops` (the command is above) and read its spectrogram.
- F2 and F3 should drift from chop to chop: round-robin formants ±3 %, vowel drift on held chops, and vibrato
  after about 0.25 s.
- If the formant lines are ruler-straight across successive chops, say so. Musician B then lifts the pluck
  double to about 3 dB under the chops.

---

## Musician B: drums, FX, mix and master

Your files: `mix.js`, `parts/drums.js`, `parts/fx.js`, `instruments/b-kit.js`.

### B1 (P0): drop 3's low end in tune (brief §7 "Low-end pitch", §9 kicks)

**`b-kit.js` `KICKS.bigroom`:**

- `tail: 61.7` → **`41.2`** (E1, the tonic).
- `hold: 0.12` → **`0.03`**; `tau: 0.27` → **`0.13`**.
- Keep `tok`, `click` and `drive`. `start: 230` may come down to about 200 if the sweep's punch moves too low;
  your call.
- **Why not the envelope alone:** a body-only sim shows the shorter envelope moves the B1 component only about
  2.6 dB, because the drive holds the tail near full level through the 2nd 16th. The C bars need about 10 dB.
  Retuned, the B1 component falls about 16.6 dB.

**`mix.js`, levels.** Start the D3 lanes at the pop A&R's values:

- kick −8.5 → **−9.3**
- sub 0 → **−0.8**

Then set the final values from the guardrails below, keeping the kick lane within −11 … −7.5. The kick strip's
52 Hz low shelf now sits on the fundamental. It is your first sub-band knob.

**Pass** (`drop-check-3.mjs` §2 and §3, on drop3 / drop3b / drop3c, after A2 has landed):

- **Low-end pitch:**
  - no kick-tail component within 2 st of a bar's sub note at less than 6 dB under it (B1 61.7 Hz is tested
    too)
  - on tonic bars, E1 or E2 is the strongest component in 30–100 Hz
- **Sub band:**
  - sub share 18–26 %
  - sub ≤ low + 2 dB
  - the Mid-channel sub level at least drop2's
  - limiter max GR ≤ 2 dB
- **drop3c:** sub + low ≥ mid + 10 points, mid ≤ 34 %, presence ≥ 9 %, ST max ≤ −7.8.

**Fallback (brief §7).** If the sub-band rows cannot hold with the kick lane at −11 or above:

- keep `tail: 61.7` with `hold: 0.01, tau: 0.08, drive: 2.4`
- set the D3 sub duck release to 0.08 s
- re-check

Report which kick shipped. The check tests both tunings.

### B2 (P0): drop 3 grows on a phone (brief §14 phone ladder)

**D3 lanes in `mix.js`:**

| Strip | Cut 2 | Cut 3 |
|---|---|---|
| chords (the wall) gain | −13 | **−11.5** |
| chords width | 1.3 | **1.15** |
| gtr_dist | −13 (no lane) | **−11.5** |
| lead | 1.5 (no lane) | **2.5** |
| choir | −12 | **−11** |

Then **re-trim the D3 master lanes** (cut 2: −1.4 / −1.4 / −1.5) so the full-band ladder still rises:
drop2b < drop3 < drop3b < drop3c, each by at least 0.1 LU.

**Pass:**

- **Phone sim:** drop3 ≥ drop2b + 0.4 LU; drop3b ≥ drop3 + 0.3; drop3c ≥ drop3b + 0.3. Cut 2: −11.0 → −11.4
  → −11.1 → −10.9.
- Mono loss ≤ 0.8 LU in drop3/3b/3c (cut 2: 0.9–1.0).
- Integrated −9.5 to −10 LUFS (`targetLufs` −9.9 is fine). Every cut-2 drop check still passes.

### B3 (P1): drops 1–2, the kick tails off the Bb (brief §7)

- **`b-kit.js`:** `KICKS.pop.tau` 0.17 → **0.13**; `KICKS.club.tau` 0.20 → **0.13**. The tuning stays at 55 Hz.
- **`mix.js`:** the sub's drop duck release goes 0.12 → **0.09 s in drop1/1b/2/2b**. Drop 3 keeps 0.12, unless
  you used the B1 fallback. Split the single `duck` into per-section duck or `pump()` entries.
- **Pass (§3):** on Bb bars, the 55 Hz component is no louder than the Bb1 sub. In drop2/2b, D2 is within 6 dB
  of it on Dm bars. Drop 1's Dm bars are report-only.
- The shorter kicks lose about 1–1.7 dB of body. Re-check the drop1/drop2 drop-delta rows and the full-band
  ladder, and ride the master lanes a few tenths if needed.

### B4 (P0): build 2 builds (brief §6 "Build rise")

- **Master lane** build2 → **`[[0,-1.6],[6,-2.2],[7.5,-3],[8,-3]]`**. Cut 2 started at −2.2, a 1.8 dB step
  down from verse 2's −0.4. The last bar is unchanged.
- **`drums.js` build2 clap:** keep `....X.......X...` in bars 1–4; add it in bars 5–6, and `X...X...X...X...`
  in bar 7. Bar 8 has no clap; the roll and the silence carry it.
- **Chords lane** build2: −10 → **`[[0,-10],[4,-10],[4.01,-8],[8,-8]]`**. The stabs sat about 15 dB under the
  kick.
- **Pass:**
  - bar 1 ≥ verse2 − 2 LU, and ≥ verse2 − 3 LU on the phone sim
  - bar 7 ≥ bar 1 + 1.5 LU, with no dip over 0.3 LU through bars 1–7
  - bars 5–6 mid band within 4 dB of bars 3–4
  - the build2 → drop2 ceiling still holds (last bar momentary max ≤ drop2 mean − 1 LU; cut 2 had 0.3 LU of
    margin)
- **If the ceiling and the rise conflict, the ceiling wins.** Pull bar 7's second half down in the lane rather
  than adding a crescendo into the gap.

### B5 (P1): build 3 rises

- **Master lane** build3 → **`[[0,-4.2],[6,-3.2],[7.5,-3.5],[8,-3.5]]`**. The end-points are unchanged.
- **Pass:** max(bar 5, bar 6) ≥ bar 1 + 1.5 LU and ≥ the breakdown's last bar + 0.5 LU. The build3 → drop3
  drop-delta row still passes; re-run it after B1/B2, because drop 3's level moves.

### B6 (P1): the breakdown, dry carrier in front (brief §4 breakdown, §11)

- **Hall sends** in the breakdown:

  | Strip | Cut 2 | Cut 3 |
  |---|---|---|
  | piano | −9 | **−13** |
  | strings | −7 | **−10** |
  | choir | −3 | **−6** |
  | choir_lead | −5 | **−8** |

- **Hall return width 0.85 in the breakdown.** Give the hall its own width lane instead of the shared `VERB_W`.
- **choir_lead gain lane, breakdown: −6.5** (was the −3.5 base). The grand now leads bars 5–8 (A4), and the
  choir doubles it 3 dB behind.
- **Bars 1–4: bells +4 dB, gtr_clean +2 dB** (the harmonics), so the music makes the top.
- If fx_sweep is still ≥ 30 % of the breakdown's air band, take its breakdown lane −2.5 → −5 in bars 3–8.
- **Pass:**
  - hall return ≤ piano stem − 6 dB (cut 2: +0.3)
  - mid-band correlation ≥ 0.4 (0.20)
  - mono loss ≤ 1 LU (1.5)
  - air ≥ 1.5 % with fx_sweep < 30 % of it (47 %)
  - presence ≥ 4 %

### B7 (P1): the tag, broad and not swimming (brief §4 tag)

- **Tag hall sends:**

  | Strip | Cut 2 | Cut 3 |
  |---|---|---|
  | piano | −9 | **−13** |
  | choir | −3 | **−6** |
  | choir_lead | −5 | **−8** |
  | strings | −7 | **−10** |
  | chords | −10 | **−14** |

- Hall width 0.85 in the tag. **The outro sends stay as they are,** so the ring-out stays lush.
- **Pass:** hall return ≤ lead stem − 4 dB (cut 2: +1.8), and mono loss ≤ 1 LU (1.6). The final hit is still
  the song's momentary max, or the max lands in drop3b/3c.

### B8 (P1): chop treble (brief §8)

- Chops strip: `{ type: 'hs', freq: 7000, gain: 2.5 }` → **gain 1**, and the exciter 0.18 → **0.1**.
- If A6 reports ruler-straight formants, the pluck lane in drop2/2b comes up about 2 dB, to about 3 dB under the
  chops.

### B9 (P2): only if the full render stays ≤ 230 s

- **Drop 2 width:** pad lane drop2/2b −14 → **−11.5**; chops_echo **+3 dB** in drop2/2b. Pass: drop2 S/M ≥ −9.0
  with presence correlation ≥ 0.3.
- **Daily-repeat fatigue:** hats lane drop2/2b −0.5 → **−2.5**, as long as air − mid stays ≥ −11 dB (cut 2: −8.7).
- **piano_pop `resonance` insert** (mix 0.06), the only new insert allowed. Skip it if the render goes over
  230 s.

### B10: keep the master honest

- Integrated −9.5 to −10 LUFS, ≤ −1 dBTP, 0 clips, limiter max GR ≤ 2 dB.
- The song's momentary and short-term maxima land in drop3b, drop3c or the tag hit.
- Every cut-2 row (drop delta, gaps, correlations, crest, drop1 balance, verses) still passes.

---

## Requests to the Engineer

These are files I can't edit. In priority order (brief §15):

- **E2, piano realism:** now Musician A's `a-piano.js`. If you ship it in `engine/inst/keys.js` first, say so,
  and A switches.
- **E1, report:** the §6 drop-delta table, the Mid/S−M bands, gaps measured after the master drive, the drum
  lane in `pianoroll.png`, plus **a per-section phone-sim column** (mono, HP 350 Hz 24 dB/oct, K-weighted mean
  LUFS, and mono loss) and **a low-end pitch table** per drop bar. `drop-check-3.mjs` shows the maths.
- **E3:** `Strings` glide and a brightness envelope.
- **E4:** `render.mjs --score <file>`, for a later DJ extended mix that does not touch the game master.

## What to report back

1. The `drop-check-3.mjs` FAIL line for `studio/out/cut-3` (and for your partial renders while you iterate).
2. Every P0 item: done, or not done and why. Musician B: which kick shipped (E1 or the B1 fallback) and the
   final D3 kick and sub lanes.
3. The render time, and the keys part time.
4. Musician A: what the piano spectrogram shows (the bloom), and the chop formant check.
5. Anything you could not verify, plainly. We still cannot hear the record. The piano, the voices and the
   kick's character are judged from code and spectra only.

---

## Appendix A: cut 2 under the cut-3 rules (the "before")

`drop-check-3.mjs studio/out/cut-2`. Every drop-delta and cut-2 row passes. The **39 FAILs** are exactly the
label's round-2 notes:

- **Low-end pitch:**
  - drop 3, all tonic bars ("tonic strongest"), and the 61.7 Hz tail over A1 / C2 on Am and C bars
  - drops 1–2, the tail over Bb1 on Bb bars, and drop2/2b D2 more than 6 dB under the tail
- **Drop 3 sub share** 13.6–15.4 % (needs 18–26 %), and drop 3 mono loss 0.9–1.0 LU.
- **Phone ladder:** drop3 −11.4 vs drop2b −11.0, and drop3c only +0.2 over drop3b.
- **Build 2:** bar 1 −2.4 LU under verse2 (−4.4 on the phone), rise +1.3 with a dip at bar 5, bars 5–6 mid band
  −10 dB.
- **Build 3:** rise +0.7, and only +0.1 over the breakdown's last bar.
- **Breakdown:** hall +0.3 over the piano, mid correlation 0.20, mono loss 1.5, fx_sweep 47 % of the air band.
- **Tag:** hall +1.8 over the lead, mono loss 1.6.

Key per-bar numbers, cut 2:

| | values |
|---|---|
| build2 LUFS per bar | −13.1, −12.5, −12.3, −12.0, −13.3, −13.0, −11.8, −13.1 (verse2 mean −10.7) |
| build2 0.8–3 kHz per bar (dB) | −17.7, −13.9, −13.7, −14.0, −24.0, −22.6, −16.1, −17.5 |
| build3 LUFS per bar | −11.5, −11.9, −11.6, −11.1, −11.2, −10.8, −11.3, −12.7 (breakdown bar 8: −10.9) |
| phone sim per drop | drop1 −12.0, drop1b −11.6, drop2 −11.2, drop2b −11.0, drop3 −11.4, drop3b −11.1, drop3c −10.9 |
| drop3b bar 3 (C C) | 61.7 Hz tail −16.3 dB vs C2 −20.6 |
| drop3b bar 1 (Em Em) | strongest 62.6 Hz −16.8 vs E2 −22.5, E1 −29.1 |

## Appendix B: the producer check script, `drop-check-3.mjs`

Save it anywhere outside the repo. Run it from the repo root as `node drop-check-3.mjs studio/out/cut-3`. It
reads `<dir>/hatikvah.wav` and `<dir>/report.json`, and imports `studio/engine/*`, `studio/song/score.js` and
`src/music.js` relative to `<dir>/../..`. It also works on partial renders: rows for sections outside the
rendered range are skipped.

```js
// Producer's cut-3 acceptance check (read-only). Usage, from the repo root:
//   node <this file> studio/out/cut-3
// Reads <dir>/hatikvah.wav + <dir>/report.json (+ studio/song/score.js and src/music.js for the timeline and cues) and
// prints: 1 the brief section 6 drop-delta table, 2 the per-section band / stereo checks (section 14, cut-3 rules),
// 3 the LOW-END PITCH check per drop bar (new), 4 the PHONE SIM per section + ladder (new), 5 the build per-bar rise
// (new), 6 the breakdown / tag reverb balance (new), 7 the globals. Uses only the Engineer's helpers; writes nothing.
// Works on partial renders too (rows for sections outside the rendered range are skipped).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = path.resolve(process.argv[2] || 'studio/out/cut-3');
const studioRoot = path.resolve(dir, '..', '..');
const repoRoot = path.resolve(studioRoot, '..');
const imp = (p) => import(pathToFileURL(path.join(studioRoot, p)).href);
const { readWav } = await imp('engine/wav.js');
const { kWeightedPower } = await imp('engine/analysis/loudness.js');
const { powerSpectrum } = await imp('engine/core/fft.js');
const { ButterChain } = await imp('engine/core/filters.js');
const { resolveScore } = await imp('engine/timeline.js');
const { pcAtOrAbove } = await imp('engine/theory.js');
const scoreMod = await imp('song/score.js');
const cues = scoreMod.cues || {};
const { HATIKVAH_SCORE } = await import(pathToFileURL(path.join(repoRoot, 'src/music.js')).href);
const TL = resolveScore(scoreMod.default, HATIKVAH_SCORE);
const TSEC = Object.fromEntries(TL.sections.map((s) => [s.name, s]));

const rep = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
const { sr, L, R } = readWav(path.join(dir, 'hatikvah.wav'));
const off = rep.range?.start || 0;                       // partial renders start at a section boundary
const SEC = Object.fromEntries(rep.sections.map((s) => [s.name, s]));
const inFile = (t0, t1) => t0 - off >= 0 && (t1 - off) * sr <= L.length;
const M = new Float32Array(L.length); for (let i = 0; i < L.length; i++) M[i] = (L[i] + R[i]) / 2;
const Mp = Float32Array.from(M); new ButterChain('hp', 350, 24, sr).process(Mp);
const kS = kWeightedPower([L, R], sr), kM = kWeightedPower([M, M], sr), kP = kWeightedPower([Mp, Mp], sr);
const { pw, sub } = kS;
const toL = (ms) => -0.691 + 10 * Math.log10(Math.max(ms, 1e-20));
const blk = (t) => Math.floor(((t - off) * sr) / sub);
const mom = (i) => toL((pw[i] + pw[i - 1] + pw[i - 2] + pw[i - 3]) / (4 * sub));
const stAt = (i) => { let a = 0; for (let k = 0; k < 30; k++) a += pw[i - k] || 0; return toL(a / (30 * sub)); };
const momMax = (t0, t1) => { let m = -Infinity; for (let i = blk(t0) + 3; i < blk(t1); i++) m = Math.max(m, mom(i)); return m; };
const meanK = (k, t0, t1) => { let a = 0, n = 0; for (let i = blk(t0); i < blk(t1); i++) { a += k.pw[i] || 0; n++; } return toL(a / (n * k.sub)); };
const meanL = (t0, t1) => meanK(kS, t0, t1);
const stMaxInside = (s) => { let m = -Infinity; for (let i = blk(s.start) + 30; i < blk(s.end); i++) m = Math.max(m, stAt(i)); return m; };
const rmsMax = (t0, t1, hop = 0.05) => {
  let m = -Infinity;
  for (let t = t0; t + hop <= t1 + 1e-9; t += hop) {
    const i0 = Math.round((t - off) * sr), i1 = Math.round((t + hop - off) * sr); let a = 0;
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
  for (let o = Math.round((t0 - off) * sr); o + N <= Math.round((t1 - off) * sr); o += N / 2) {
    for (let k = 0; k < N; k++) { const a = L[o + k], b = R[o + k]; m[k] = (a + b) / 2; s[k] = (a - b) / 2; l[k] = a; r[k] = b; }
    powerSpectrum(m, 0, N, pm); powerSpectrum(s, 0, N, ps); powerSpectrum(l, 0, N, pl); powerSpectrum(r, 0, N, pr);
    for (const b in BANDS) { const [f0, f1] = BANDS[b]; for (let k = Math.ceil((f0 * N) / sr); k < Math.min(N / 2, (f1 * N) / sr); k++) { acc.M[b] += pm[k]; acc.S[b] += ps[k]; acc.LR[b] += (pl[k] + pr[k]) / 2; } }
    frames++;
  }
  const out = {};
  for (const b in BANDS) {
    const Mm = acc.M[b], S = acc.S[b];
    out[b] = { M: 10 * Math.log10(Mm / frames + 1e-20), LR: 10 * Math.log10(acc.LR[b] / frames + 1e-20), SmM: 10 * Math.log10((S + 1e-20) / (Mm + 1e-20)), corr: (Mm - S) / (Mm + S + 1e-20) };
  }
  return out;
}
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');
const ok = (c) => (c ? 'ok' : '**FAIL**');
const endBpm = (s) => { const b = String(s.bpm).split('->').map(Number); return b[b.length - 1]; };
const fails = [];
const chk = (label, cond) => { if (!cond) fails.push(label); return `${label} ${ok(cond)}`; };
const keyOf = (s) => (s.transpose === 2 ? 'E minor' : 'D minor');

console.log(`# Cut-3 producer check: ${dir}\n`);

// ---------------------------------------------------------------- 1. drop delta (brief section 6)
console.log('## 1. Drop delta (brief section 6)\n');
console.log('| into | build last bar M max | drop mean M | rule: <= drop-1, >= drop-4 | build last bar mean | drop bar 1 mean | rule: bar1 >= build+1.5 | gap 2nd-half max RMS dBFS | rule | pres d (L+R) | air d (L+R) | rule: >=-2 / >=-4 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
const PAIRS = [['build1', 'drop1'], ['build2', 'drop2'], ['drop2', 'drop2b'], ['build3', 'drop3'], ['drop3', 'drop3b']];
const GAPLIM = cues.gapMaxDb || { build1: -30, build2: -30, drop2: -27, build3: -28, drop3: -30 };
for (const [b, d] of PAIRS) {
  const B = SEC[b], D = SEC[d]; if (!B || !D || !inFile(B.start, D.end)) continue;
  const g = rep.silences.find((x) => x.section === b);
  const gs = g ? g.start : B.end, bar = 240 / endBpm(B), dbar = 240 / endBpm(D);
  const isBuild = B.role === 'build';
  const lbMax = momMax(gs - bar, gs), lbMean = meanL(gs - bar, gs), dMean = meanL(D.start, D.end), d1 = meanL(D.start, D.start + dbar);
  const gapMax = g ? rmsMax((g.start + g.end) / 2, g.end - 0.005) : NaN, gapLimit = GAPLIM[b] ?? -30;
  const bt = bands(gs - 2, gs), dh = bands(D.start, D.start + 4);
  const dp = dh.pres.LR - bt.pres.LR, da = dh.air.LR - bt.air.LR;
  const rA = isBuild ? ok(lbMax <= dMean - 1 && lbMax >= dMean - 4) : 'n/a';
  const rB = isBuild ? ok(d1 >= lbMean + 1.5) : ok(d1 >= lbMean);
  const rD = isBuild ? ok(dp >= -2 && da >= -4) : 'n/a';
  if (rA.includes('FAIL') || rB.includes('FAIL') || rD.includes('FAIL') || !(gapMax <= gapLimit)) fails.push(`drop delta ${b}->${d}`);
  console.log(`| ${b} -> ${d} | ${f1(lbMax)} | ${f1(dMean)} | ${rA} | ${f1(lbMean)} | ${f1(d1)} | ${rB} | ${f1(gapMax)} | ${ok(gapMax <= gapLimit)} | ${f1(dp)} | ${f1(da)} | ${rD} |`);
}

// ---------------------------------------------------------------- 2. per-section bands + section 14 checks (cut-3 rules)
console.log('\n## 2. Mid-channel band level dB (S-M dB), band correlation, phone sim, and the section 14 checks\n');
console.log('| section | sub | low | lowmid | mid | pres | air | pres-mid | air-mid | mid corr | pres corr | air corr | ST max (inside) | phone LUFS | mono loss LU | checks |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const PHONE = {}, MONO = {}, LUFS = {};
for (const s of rep.sections) {
  if (s.name.startsWith('(') || !inFile(s.start, s.end)) continue;
  const r = bands(s.start, s.end), sh = Object.fromEntries(Object.entries(s.bands).map(([k, v]) => [k, v.pct])), bd = Object.fromEntries(Object.entries(s.bands).map(([k, v]) => [k, v.db]));
  const pm = r.pres.M - r.mid.M, am = r.air.M - r.mid.M, c = [];
  PHONE[s.name] = meanK(kP, s.start, s.end); MONO[s.name] = meanK(kS, s.start, s.end) - meanK(kM, s.start, s.end); LUFS[s.name] = meanL(s.start, s.end);
  if (s.role === 'drop') {
    c.push(chk(`${s.name} pres-mid>=-6`, pm >= -6), chk(`${s.name} air-mid>=-11`, am >= -11), chk(`${s.name} presCorr>=0.3`, r.pres.corr >= 0.3), chk(`${s.name} airCorr>=0.15`, r.air.corr >= 0.15), chk(`${s.name} crest 7.5-9.5`, s.crestDb >= 7.5 && s.crestDb <= 9.5));
    if (s.name === 'drop1' || s.name === 'drop1b') c.push(chk(`${s.name} sub+low<=48%`, sh.sub + sh.low <= 48), chk(`${s.name} mid+pres>=33%`, sh.mid + sh.presence >= 33));
    if (['drop3', 'drop3b', 'drop3c'].includes(s.name)) c.push(chk(`${s.name} sub 18-26%`, sh.sub >= 18 && sh.sub <= 26), chk(`${s.name} sub<=low+2dB`, bd.sub <= bd.low + 2), chk(`${s.name} monoLoss<=0.8`, MONO[s.name] <= 0.8));
    else c.push(chk(`${s.name} sub<=low`, bd.sub <= bd.low));
    if (s.name === 'drop3c') c.push(chk('drop3c STmax<=-7.8', stMaxInside(s) <= -7.8), chk('drop3c sub+low>=mid+10pts', sh.sub + sh.low >= sh.mid + 10), chk('drop3c mid<=34%', sh.mid <= 34), chk('drop3c pres>=9%', sh.presence >= 9), chk('drop3c lowmid<=mid-3dB', r.lowmid.LR <= r.mid.LR - 3));
  }
  const prevVerse = { drop1: 'verse1b', drop2: 'verse2' }[s.name];
  if (prevVerse && SEC[prevVerse] && inFile(SEC[prevVerse].start, SEC[prevVerse].end)) { const v = SEC[prevVerse], rv = bands(v.start, v.end); c.push(chk(`${s.name} mid S-M >= ${prevVerse}+1dB`, r.mid.SmM >= rv.mid.SmM + 1)); }
  if (s.role === 'verse') c.push(chk(`${s.name} lowmid<=30%`, sh.lowmid <= 30), chk(`${s.name} pres>=6%`, sh.presence >= 6));
  if (s.role === 'breakdown') c.push(chk('breakdown pres>=4%', sh.presence >= 4), chk('breakdown air>=1.5%', sh.air >= 1.5), chk('breakdown midCorr>=0.4', r.mid.corr >= 0.4), chk('breakdown monoLoss<=1', MONO[s.name] <= 1));
  if (s.name === 'tag') c.push(chk('tag monoLoss<=1', MONO[s.name] <= 1));
  const cell = (k) => `${f1(r[k].M)} (${f1(r[k].SmM)})`;
  console.log(`| ${s.name} | ${cell('sub')} | ${cell('low')} | ${cell('lowmid')} | ${cell('mid')} | ${cell('pres')} | ${cell('air')} | ${f1(pm)} | ${f1(am)} | ${f2(r.mid.corr)} | ${f2(r.pres.corr)} | ${f2(r.air.corr)} | ${f1(stMaxInside(s))} | ${f1(PHONE[s.name])} | ${f1(MONO[s.name])} | ${c.join('; ')} |`);
}

// ---------------------------------------------------------------- 3. low-end pitch per drop bar (new, label round 2 C16 / C19 / C23)
console.log('\n## 3. Low-end pitch per drop bar (one 65536-pt / 1.49 s Hann FFT of the Mid channel, centred on the bar)\n');
console.log('Kick tail and sub floor come from score.js cues (kickTailHz, subFloorMidi). Rules (brief section 7 "Low-end pitch"):');
console.log('- E minor drops: a kick-tail component within 2 st of a bar sub note (not the same pitch) must sit >= 6 dB under it; on tonic bars the tonic fundamental is the strongest component in 30-100 Hz (0.5 dB tolerance).');
console.log('- D minor drops: on Bb bars the kick-tail component is no louder than the Bb1 sub; in drop2/2b the D2 tonic on Dm bars is within 6 dB of the kick-tail component. Drop1/1b tonic bars are reported only (light pop drop).\n');
const N = 65536, spec = new Float64Array(N / 2 + 1);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nm = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
const binDb = (f, tol = 0.025) => { let m = 0; for (let k = Math.floor((f * (1 - tol) * N) / sr); k <= Math.ceil((f * (1 + tol) * N) / sr); k++) m = Math.max(m, spec[k]); return 10 * Math.log10(m + 1e-20); };
const strongest = (fLo, fHi) => { let bk = 0, bv = 0; for (let k = Math.ceil((fLo * N) / sr); k < (fHi * N) / sr; k++) if (spec[k] > bv) { bv = spec[k]; bk = k; } return { f: (bk * sr) / N, db: 10 * Math.log10(bv + 1e-20) }; };
const SUBPC = { drop1: 'bass', drop1b: 'bass', drop2: 'root', drop2b: 'root', drop3: 'bass', drop3b: 'root', drop3c: 'root' };   // what bass.js puts on the sub
for (const s of TL.sections.filter((x) => x.role === 'drop')) {
  if (!inFile(s.start, s.end)) continue;
  const key = keyOf(s), tail = (cues.kickTailHz || {})[key] ?? (key === 'E minor' ? 61.7 : 55);
  const floor = (cues.subFloorMidi || {})[key] ?? 29, tonicPc = key === 'E minor' ? 4 : 2, tailMidi = 69 + 12 * Math.log2(tail / 440);
  console.log(`### ${s.name} (${key}, kick tail ${tail} Hz, sub floor ${nm(floor)})\n\n| bar | chords | kick tail dB | sub notes dB | strongest 30-100 Hz | rule |\n|---|---|---|---|---|---|`);
  for (let b = 0; b < s.bars; b++) {
    const t0 = s.at(b), t1 = s.at(b + 1), mid = (t0 + t1) / 2;
    powerSpectrum(M, Math.round((mid - off) * sr) - N / 2, N, spec);
    const cs = TL.chords.filter((c) => c.section === s.name && c.start >= t0 - 1e-3 && c.start < t1 - 1e-3);
    const subs = [...new Set(cs.map((c) => pcAtOrAbove(c[SUBPC[s.name]], floor)))];
    const tailDb = binDb(tail), st = strongest(30, 100), res = [];
    // E minor: test the cue tuning AND the cut-2 / fallback tuning (B1 61.7 Hz), so the rule bites whichever kick shipped
    const tails = key === 'E minor' ? [...new Set([tail, 61.7])] : [tail];
    for (const m of subs) {
      const sDb = binDb(hz(m));
      for (const tf of tails) {
        const tm = 69 + 12 * Math.log2(tf / 440), d = Math.abs(m - tm);
        // a candidate that IS one of this bar's own sub notes (e.g. the B1 of Em/B after Cmaj7) is the bass line moving, not a rub
        if (subs.some((x) => Math.abs(x - tm) <= 0.25)) continue;
        if (key === 'E minor' && d > 0.25 && d <= 2.05) res.push(chk(`${s.name} b${b + 1} ${tf}Hz<=${nm(m)}-6`, binDb(tf) <= sDb - 6));
      }
      if (key === 'D minor' && m % 12 === 10) res.push(chk(`${s.name} b${b + 1} tail<=Bb`, tailDb <= sDb));
    }
    void tailMidi;
    const tonicBar = cs.length && pcAtOrAbove(cs[0][SUBPC[s.name]], floor) % 12 === tonicPc && cs.every((c) => c.root === tonicPc);
    if (tonicBar) {
      const tLo = pcAtOrAbove(tonicPc, floor), tdb = Math.max(binDb(hz(tLo)), binDb(hz(tLo + 12)));
      if (key === 'E minor') res.push(chk(`${s.name} b${b + 1} tonic strongest`, tdb >= st.db - 0.5));
      else if (s.name.startsWith('drop2')) res.push(chk(`${s.name} b${b + 1} D2>=tail-6`, binDb(hz(tLo)) >= tailDb - 6));
      else res.push(`tonic ${f1(tdb - tailDb)} dB re tail (report only)`);
    }
    console.log(`| ${b + 1} | ${cs.map((c) => c.symbol).join(' ')} | ${f1(tailDb)} | ${subs.map((m) => `${nm(m)} ${f1(binDb(hz(m)))}`).join(', ')} | ${st.f.toFixed(1)} Hz ${f1(st.db)} | ${res.join('; ')} |`);
  }
  console.log('');
}

// ---------------------------------------------------------------- 4. phone ladder (new, label round 2 P15)
console.log('## 4. Phone ladder (mono fold-down, HP 350 Hz 24 dB/oct, K-weighted section mean)\n');
const ladder = [['drop2b', 'drop3', 0.4], ['drop3', 'drop3b', 0.3], ['drop3b', 'drop3c', 0.3]];
for (const [a, b, d] of ladder) if (PHONE[a] !== undefined && PHONE[b] !== undefined) console.log(`- ${b} ${f1(PHONE[b])} vs ${a} ${f1(PHONE[a])}: ${chk(`phone ${b}>=${a}+${d}`, PHONE[b] >= PHONE[a] + d)}`);
const full = ['drop1', 'drop1b', 'drop2', 'drop2b', 'drop3', 'drop3b', 'drop3c'].filter((n) => LUFS[n] !== undefined);
for (let i = 1; i < full.length; i++) console.log(`- full band ${full[i]} ${f1(LUFS[full[i]])} vs ${full[i - 1]} ${f1(LUFS[full[i - 1]])}: ${chk(`full ${full[i]}>${full[i - 1]}`, LUFS[full[i]] >= LUFS[full[i - 1]] + 0.1)}`);

// ---------------------------------------------------------------- 5. build per-bar rise (new, label round 2 C20 / C21 / P16)
console.log('\n## 5. Builds, per bar: mean loudness (LUFS), phone, 0.8-3 kHz band (L+R dB)\n');
const bandLR = (t0, t1, fa, fb) => { const n = 4096, sp = new Float64Array(n / 2 + 1); let acc = 0, fr = 0; for (let o = Math.round((t0 - off) * sr); o + n <= Math.round((t1 - off) * sr); o += n / 2) { for (const ch of [L, R]) { powerSpectrum(ch, o, n, sp); for (let k = Math.ceil((fa * n) / sr); k < (fb * n) / sr; k++) acc += sp[k] / 2; } fr++; } return 10 * Math.log10(acc / fr + 1e-20); };
const perBar = (name) => { const s = TSEC[name]; return Array.from({ length: s.bars }, (_, b) => { const t0 = s.at(b), t1 = s.at(b + 1); return { lufs: meanL(t0, t1), phone: meanK(kP, t0, t1), mid: bandLR(t0, t1, 800, 3000) }; }); };
for (const name of ['build2', 'build3']) {
  const s = TSEC[name]; if (!inFile(s.start, s.end)) continue;
  const B = perBar(name);
  console.log(`### ${name}\n\n| bar | LUFS | phone | mid 0.8-3k |\n|---|---|---|---|`);
  B.forEach((x, i) => console.log(`| ${i + 1} | ${f1(x.lufs)} | ${f1(x.phone)} | ${f1(x.mid)} |`));
  const lastRise = name === 'build2' ? 7 : 6;   // build3 bars 7-8 are the bass suck: they may level off
  const peak = name === 'build2' ? B[6].lufs : Math.max(B[4].lufs, B[5].lufs);
  const mono = B.slice(1, lastRise).every((x, i) => x.lufs >= B[i].lufs - 0.3);
  const out = [chk(`${name} rise>=1.5LU (bar1 -> ${name === 'build2' ? 'bar7' : 'max bar5-6'})`, peak - B[0].lufs >= 1.5), chk(`${name} no dip >0.3LU bars 1-${lastRise}`, mono)];
  if (name === 'build2') {
    const v = TSEC.verse2; if (inFile(v.start, v.end)) out.push(chk('build2 bar1>=verse2-2LU', B[0].lufs >= meanL(v.start, v.end) - 2), chk('build2 bar1 phone>=verse2 phone-3LU', B[0].phone >= meanK(kP, v.start, v.end) - 3));
    out.push(chk('build2 bars5-6 mid within 4dB of bars3-4', (B[4].mid + B[5].mid) / 2 >= (B[2].mid + B[3].mid) / 2 - 4));
  } else {
    const bd = TSEC.breakdown; if (inFile(bd.start, bd.end)) { const lb = meanL(bd.at(7), bd.at(8)); out.push(chk('build3 max(bar5-6)>=breakdown bar8+0.5', peak >= lb + 0.5)); }
  }
  console.log(`\n${out.join('; ')}\n`);
}

// ---------------------------------------------------------------- 6. reverb balance (new, label round 2 P19 / P20 / C22)
console.log('## 6. Reverb and exposure balance (post-fader stem / return RMS from report.json)\n');
const stemDb = (n, s) => rep.stems.find((x) => x.name === n)?.perSection?.[s]?.rmsDb ?? NaN;
const busDb = (n, s) => rep.buses.find((x) => x.name === n)?.perSection?.[s]?.rmsDb ?? NaN;
if (SEC.breakdown && inFile(SEC.breakdown.start, SEC.breakdown.end)) {
  console.log(`- breakdown: hall ${f1(busDb('hall', 'breakdown'))} vs piano ${f1(stemDb('piano', 'breakdown'))}: ${chk('breakdown hall<=piano-6', busDb('hall', 'breakdown') <= stemDb('piano', 'breakdown') - 6)}`);
  const ms = rep.masking.filter((x) => x.section === 'breakdown' && x.band === 'air' && (x.a === 'fx_sweep' || x.b === 'fx_sweep'));
  const sw = ms.length ? (ms[0].a === 'fx_sweep' ? ms[0].aPct : ms[0].bPct) : NaN;
  console.log(`- breakdown: fx_sweep share of the air band ${Number.isFinite(sw) ? `${f1(sw)} %` : 'not in masking table (ok)'}: ${chk('breakdown fx_sweep<30% of air', !(sw >= 30))}`);
}
if (SEC.tag && inFile(SEC.tag.start, SEC.tag.end)) console.log(`- tag: hall ${f1(busDb('hall', 'tag'))} vs lead ${f1(stemDb('lead', 'tag'))}: ${chk('tag hall<=lead-4', busDb('hall', 'tag') <= stemDb('lead', 'tag') - 4)}`);

// ---------------------------------------------------------------- 7. global
console.log('\n## 7. Global\n');
let mi = 3, mv = -Infinity; for (let i = 3; i < pw.length; i++) { const v = mom(i); if (v > mv) { mv = v; mi = i; } }
let si = 29, sv = -Infinity; for (let i = 29; i < pw.length; i++) { const v = stAt(i); if (v > sv) { sv = v; si = i; } }
const where = (i) => { const t = off + ((i + 1) * sub) / sr; const s = rep.sections.find((x) => t >= x.start && t < x.end); return [t, s ? s.name : '?']; };
const [mt, ms_] = where(mi), [stt, sts] = where(si), HOME = cues.checks?.loudestMoment || ['drop3b', 'drop3c', 'tag'];
console.log(`- Momentary max ${f1(mv)} LUFS at ${mt.toFixed(1)} s (${ms_}): ${chk('momentary max home', HOME.includes(ms_))}`);
console.log(`- Short-term max ${f1(sv)} LUFS at ${stt.toFixed(1)} s (${sts}): ${chk('short-term max home', HOME.includes(sts))}`);
console.log(`- Drop LUFS (report): ${['drop1', 'drop1b', 'drop2', 'drop2b', 'drop3', 'drop3b', 'drop3c'].filter((n) => SEC[n]).map((n) => `${n} ${SEC[n].lufs}`).join(', ')}`);
const I = rep.loudness?.integratedLufs, TP = rep.loudness?.truePeakDbtp, GR = rep.master?.limiterGrMax, T = (rep.timing?.totalMs || 0) / 1000, KEYS = (rep.timing?.parts?.keys || 0) / 1000;
console.log(`- Integrated ${I} LUFS, true peak ${TP} dBTP: ${chk('integrated -11..-9', I <= -9 && I >= -11)}; ${chk('TP<=-1', TP <= -1)}`);
console.log(`- Limiter GR max ${f2(GR)} dB: ${chk('limiter GR<=2', GR <= 2)}`);
console.log(`- Render ${f1(T)} s (budget 240; aim <= 230), keys part ${f1(KEYS)} s (aim <= 45): ${chk('render<=240', T <= 240)}`);
console.log(`\n**${fails.length ? `${fails.length} FAIL: ${fails.join(' | ')}` : 'ALL PASS'}** (partial renders: absolute LUFS/dBFS shift; judge relative rows)`);
```
