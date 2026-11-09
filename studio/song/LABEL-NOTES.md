# Label notes and producer decisions

The Producer keeps this log. Each round records the label's notes on a cut, and then the Producer's
decision on every note: **Accepted**, **Accepted, changed** (same goal, different numbers or method), or
**Pushed back** (with the reason). The brief (`brief.md`) and `score.js` carry the resulting rules. The work
list for the recut is `SESSION-N.md`.

---

## Round 1: cut 1 → recut session 2 (2026-11-08)

**Cut reviewed:** `studio/out/cut-1`. 3:17, −9.6 LUFS integrated, −1 dBTP, 0 clips.

**Verdicts:**

- **Club A&R 6/10, recut.** "The anthem concept is strong and the band is genuinely modelled, but every
  drop deflates."
- **Pop A&R 6.5/10, recut.** "The record is real and escalates the way the family asked, but each drop
  lands darker, narrower and quieter than the build before it. The first drop also buries its hook."

**Producer's own check before deciding.** I re-measured cut 1 from the WAV with my own script (BS.1770
momentary and short-term loudness, plus a Mid/Side FFT per band) and looked at the spectrogram, stems and
piano-roll PNGs. **Every number the label quoted reproduces.**

- The builds' last 0.5 s run −6.0 / −4.9 / −5.0 LUFS momentary. The drops average −9.5 / −8.9 / −8.0.
- Presence falls 5–8 dB at each drop, and air falls 9–10 dB.
- In drops 1 and 2 the air-band correlation is −0.12 to −0.17.
- The song's momentary maximum is at 85.5 s, the end of build2.
- **I found one more problem.** The report's silence-window "master max" is measured *before* the master
  drive, so the file is about 5 dB hotter than the report says. The build3 gap opens at −15 dBFS in the
  WAV, against −20.5 in the report. The gaps were worse than the label heard.
- **The spectrogram agrees with the numbers.** Every build ends in a bright fan of noise and riser up to
  10 kHz, and every drop below it is dark above about 4 kHz. The breakdown is black above about 3–4 kHz
  from 1:55 to 2:05. The stems PNG shows `fx_rise` at full colour into each gap.

**My overall call.** Both A&Rs are right about the main diagnosis, and it is my fault as much as Musician
B's:

- My own brief set the riser peak at −8 dB re the kick.
- I asked for a crescendo into every silence.
- I said "all three drops unite" in drop3c without saying *how*.

The form, the keys, the tempos and the melody plan passed both reviews, so **the form stays (106 bars,
3:16.5)**. This is a recut of the payoff, not a re-arrangement. The organising rule for cut 2: **the build
is thin, bright noise and snare; the drop brings the width, the lows and the hook.**

### Club A&R (6/10)

**C1. Musician B, must. Builds are bigger than the drops.**

*Note.* The last ~0.5 s before each gap reach −6.0 / −4.9 / −4.9 LUFS M. The drops average −9.6 / −8.8 /
−7.8. The song's momentary max is the end of build2 (85.1 s). Short-term: build2 −6.7 vs drop2 −7.5, build3
−6.6 vs drop3 −7.2.

The A&R's recipe:

1. Master lane: build1 [[0,−3],[2,−3],[3.75,−3.5]]; build2 [[4,−2.5],[7.5,−3]]; build3 → −3.5.
2. NoiseRiser endDb −8 → −16; PitchRiser velocity 1 → 0.6.
3. snareRoll v1 1.0 → 0.8, and the snare lane −10 → −13 over the last 2 bars.
4. HALL_SWELL peaks −14/−12 → −24/−22.

Targets: build last-bar momentary ≤ next drop mean − 1 LU; drop crest settles at 8–9 dB.

*Decision: **Accepted, changed.***

- **Master lanes** exactly as the A&R gave them.
- **Riser endDb −15:** between this note's −16 and the pop A&R's −14.
- **PitchRiser velocity 0.6** and **snare-roll v1 0.8**.
- **HALL_SWELL −24 / −22 / −22.**
- **The extra −3 dB snare lane is conditional.** It is step 3 of an ordered recipe, used only if the build
  is still over target after steps 1–2. Stacking every cut at once risks a limp build.
- **I added a floor:** the build's last bar must stay ≥ drop mean − 4 LU, so it still rises.
- **I added "drop lands":** drop bar 1 ≥ build last bar + 1.5 LU.
- The crest target is 7.5–9.5 dB.
- Recorded as brief §6 "Drop delta" and `cues.dropDelta`.

**C2. Musician B, must. The drop top end is dark and phasey, and it fails mono (phone) translation.**

*Note.* In the Mid channel, at each drop, presence falls 4–9 dB and air 10–12 dB against the build end.
In-drop presence sits ~9 dB under the mids, and air 15–16 dB under. In drops 1 and 2 the Side is louder than
the Mid in presence and air (air correlation −0.13 to −0.16). The cause is stacked width above 1.

The A&R's fix:

- Music bus width in drops 1.4–1.45 → 1.1; pad and chords 1.6 → 1.25; drums bus 1.15 → 1.0; cymbals 1.3 →
  1.1; hats 1.1 → 1.0.
- Hats in drops −5/−8 → −2.5/−5; ride +2 dB; an air shelf on the music bus (+2 dB at 10 kHz) in drops.
- The 16th shaker back in drop3/3b/3c at −8.

Targets: presence correlation ≥ +0.3, air ≥ +0.15; Mid presence ≥ mids − 6 dB, Mid air ≥ mids − 11 dB in
every drop.

*Decision: **Accepted.***

- **Widths:** music bus 1.1, drums 1.0, cymbals 1.1 and hats 1.0, as given. Pad and chords go to **1.3**,
  between this note's 1.25 and the pop A&R's 1.35. I also set the reverb returns to 1.0, because the same
  diagnosis applies to them.
- **Hats and ride:** hats +2.5 to +3 dB in every drop; ride +2 dB.
- **Air shelf, method changed:** the engine has no EQ automation lane. So it is a static +1.5 dB at 10 kHz
  on the music bus, which helps the verses too. If the drops still miss the air target, Musician B adds a
  parallel air bus (HP 8 kHz) with its gain lane open only in the drops.
- **Shaker** back in drop3/3b/3c, straight 16ths.
- **Targets** adopted as written (brief §14).

**C3. Musician B, must. The final drop shrinks at the bottom.**

*Note.* Sub share falls from 19.6 % (drop1) to 13.4 / 12.0 / 9.6 % (drop3/3b/3c). Mid share climbs to 37.6
% and passes the low band. The A&R's fix:

- Kick lane drop3–3c −10.5 → −9.5; sub lane −2 → 0.
- Strings lane −6 → −10.
- −2.5 dB at 400 Hz (Q 0.9) on strings, chords and choir.
- Lead HP 220 → 300 Hz.

Target: drop3c low ≥ mid, and low-mid ≤ mid − 3 dB.

*Decision: **Accepted** as written.*

- **The strings cut is made only on Musician B's lane.** Musician A deletes the −12 layer and fixes the
  articulation, but does not also cut the strings' source level (see C7). One gain change, one owner.

**C4. Musician B, should. The gaps are not quiet enough.**

*Note.* Inside the windows the master max is −20.5 (build3), −21.5 (drop3 gap), −24.2 (build2) and −26.7
(build1). The hall swell is the cause. The A&R's fix:

- Aim for ≤ −30 dBFS RMS by the second half of each gap.
- Duck or HP-500 the hall inside the window.
- Keep the build3 breath.

*Decision: **Accepted, and made stricter.***

- **Measured on the final WAV**, because the report column reads ~5 dB low (see my check above).
- **Second half of each gap ≤ −30 dBFS** (50 ms RMS). Build3 may reach −28 because of the breath. The
  half-beat drop2 gap may reach −27, because it is too short to decay.
- **Tools:**
  - the HALL_SWELL change (C1)
  - the hall and plate returns duck 12 dB from the gap start to mid-gap, restored on the downbeat
  - the hall return is high-passed at 500 Hz inside the window
- **The pop A&R's 150 ms duck at the end of the gap is too late.** The wash is loudest at the start of the
  gap, so the duck starts at the start.

**C5. Musician B, should. The verses are boxy and the breakdown is muffled.**

*Note.* Verse1/1b low-mid is 38–40 % of the energy and presence only 4–5 %. The breakdown has 1.8 %
presence and 0.6 % air. The A&R's fix:

- Piano: −3 dB at 300 Hz (Q 1), HP 70 → 90 in verse1/1b. Choir and pad: −2 dB at 350 Hz.
- Breakdown: open the hall LP 7k → 9.5k with a lane; +2 dB at 8 kHz on vox and keys.

Targets: verse low-mid ≤ 28 %, presence ≥ 6 %; breakdown presence ≥ 5 %.

*Decision: **Accepted, changed.***

- **The EQ moves** as given. The piano HP 90 applies in all three verses.
- **The hall LP lane** as given. The engine supports `lp` lanes on return strips.
- **The +2 dB at 8 kHz is done differently**, because there is no EQ lane. Musician A raises the grand's
  brightness and adds a D7 bell and guitar harmonics. A static +1.5 dB shelf on the choir is the fallback.
- **Pushed back on 28 %.** The target is **≤ 30 %**. A felt-piano verse should stay warm, and the pop A&R
  asked for 32 %.
- **Breakdown presence target ≥ 4 %, not 5 %.** It should stay soft. The air target is ≥ 1.5 %.

**C6. Musician B, should. Subsonic waste.**

*Note.* The impact sub falls to 28 Hz and the sub drops to 25–27 Hz. In the tag, `fx_hit` is 70 % of the sub
band. The A&R's fix: HP `fx_hit` 22 → 35 Hz, and end the SubDrops at 35–38 Hz.

*Decision: **Accepted.***

- `fx_hit` HP 35 Hz.
- SubDrops end at 36 Hz.
- The ImpactB sine ends at 35 Hz.
- The tag SubBoom stays at E1 (41 Hz).

**C7. Musician A, must. The strings are the cheapest-sounding element.**

*Note.* In drop3–tag the strings are louder than the supersaw wall. They are a static bowed-saw wavetable
played as a fresh legato note per melody note, even 8ths, with a 90 ms swell: a string-machine "wah". They
also double at −12, right on the bass harmonics. The A&R's fix:

- Delete the −12 layer.
- Strings only on notes ≥ 4 sixteenths, or one sustained voice per phrase with 40–60 ms portamento and no
  re-attack.
- A brightness swell, 2 → 6 kHz.
- Strings −4 dB.

*Decision: **Accepted, except the −4 dB at source.***

- **Level:** Musician B's lane makes the level change (C3).
- **Approved only as a sustained high line**, on notes of 4 or more sixteenths, merged into one voice per
  phrase with portamento, and never at −12.

**C8. Musician A, must. The vocal chops risk sounding like a talking toy.**

*Note.* `a-chops.js` slices one cached sustained vowel per (pitch, vowel) at 0.10–0.16 s, before the
vibrato. That gives about 135 near-identical steady tones per drop half. The A&R's fix:

- 3–4 round-robin sources, each with formant ±3 %.
- Slice offsets 0.08–0.6 s.
- ±8 cents per chop.
- Vowel drift on held chops.
- A soft "h" onset on phrase-initial chops.
- The +24 layer −10 → −14 dB.

*Decision: **Accepted** in full.*

- The +24 layer is a layer balance inside one part, so Musician A sets it.

**C9. Musician A, must. Help the drops out-shine the builds.**

*Note.* The A&R's fix:

- Build stabs: velocity ≤ 0.75, cutoff ≤ 6 kHz. Chop-roll v1 ≤ 0.7.
- Drop synths: LEAD/LEAD3 cutoff 6800 → 11000 Hz with env 0.55; WALL 8500 → 12000.
- A noise-air oscillator on LEAD3, about −24 dB, HP 8 kHz.

*Decision: **Accepted, changed on the lead filter.***

- **Lead filter: 9500 Hz with env 0.7.** This note asked for 11000 / 0.55 and the pop A&R for 9000 / 0.8. A
  saturated 9-voice saw at −8 LUFS above about 10 kHz turns harsh and fatiguing in a daily game, and the
  noise-air layer supplies the top anyway.
- **Everything else as given.**

**C10. Musician A, should. Verse low end.**

*Note.* `lhMidi` floor 29 puts the piano LH's bottom octave on exactly the sub's notes. The A&R's fix: use
`pcAtOrAbove(pc, 40)` in verse1/1b/verse2, and keep inner tones ≥ 55.

*Decision: **Accepted.***

**C11. Musician A, should. drop3c density.**

*Note.* Acoustic strums (−31) and gtr_lead (−26.8) under the wall add low-mid mush. The A&R's fix:

- Let piano_pop alone carry the drop 1 callback (or gtr_lead only in the last 4 bars at −4 dB).
- Take the drop3 0-octave LEAD layer from −6 to −10 dB.

*Decision: **Accepted.***

- gtr_lead and acoustic come **out** of drop3c.
- piano_pop alone carries the callback.
- The 0-octave layer goes to −10 dB.

**C12. Musician A, nice. Breakdown brightness.**

*Note.* Grand brightness 0.55 → 0.7 for bars 1–4. A clean-guitar harmonic or a bell an octave over the D6
pedal.

*Decision: **Accepted**, both.*

- A **D7 bell ping** every 2 bars, about 6 dB under the D6 pedal.
- **Guitar harmonics on D6 and A6.**

**C13. Producer, must. Hard targets in the brief.**

*Note.* The riser recipe "−30 to −8 dB" and the hierarchy "risers at peak −8" produce builds louder than the
drops. The A&R asked for:

- the riser at −30 → −16 dB, about −14 re the kick
- a drop-delta rule, with the gap ≤ −30
- drop3c re-scoped to unite through the drop 1 piano hook only
- escalation from the top and the bottom, not the mids

*Decision: **Accepted. Done in this round.***

- Brief §6 (drop delta), §9 (riser, impact, sub drop) and §11 (hierarchy: risers −14).
- §0 and §4 for drop3c.
- `score.js` drop3c notes, plus `cues.dropDelta` and `cues.gapMaxDb`.

**C14. Producer, should. New §14 checks.**

*Note.* The A&R asked for:

- In drops: Mid presence ≥ mids − 6 dB, Mid air ≥ mids − 11 dB, presence/air correlation ≥ +0.3 / +0.15.
- In verses: low-mid ≤ 28 %.
- The drop 3 string octave-doubling is not in the brief. Approve it only as a sustained high line, never at
  −12.

*Decision: **Accepted.***

- Verse low-mid is ≤ 30 % (see C5).
- **The strings are now in the brief** (§9 "Strings"), approved only as a sustained high line.

**C15. Engineer, should. New report tables.**

*Note.* The A&R asked for:

- a per-transition drop-delta table, plus gap RMS
- Mid-only band levels and S−M per band per section
- section short-term max from windows fully inside the section
- drum stems in their own piano-roll lane

*Decision: **Forwarded** (Engineer request #1, brief §15), with one addition:*

- The silence table must measure the final file.
- **Until then:** a read-only producer script prints these tables on any render (path in `SESSION-2.md`).

### Pop A&R (6.5/10)

**P1. Musician B, must. Drop payoff (the main reason this is not a single yet).**

*Note.* Presence falls at every drop: build1 −12.4 → drop1 −20.3, build2 −11.4 → −19.5, build3 −12.5 →
−17.8. Air falls 9–10 dB each time. Correlation jumps from 0.16 / 0.39 / 0.37 at the build tails to 0.76 /
0.78 / 0.69 in the drops. Cause: a NoiseRiser near full scale, band-passed to 9 kHz and fully decorrelated,
and fx_rise width 1.2. Meanwhile the drop's top end is thin: hats at −35.8, and the crash cut −2 dB at 4.2
kHz.

The A&R's fix:

- Riser endDb −14 and w cap 0.6; fx_rise width 0.8.
- Crash +5 dB on drop downbeats, with no 4.2 kHz cut and HP 500.
- Hats +3 in all drops.
- Open hats on the drop1 offbeats too.
- Shaker or tambourine 16ths back in drop3b/3c.

Pass: in each drop's first 4 s, presence ≥ build tail − 2 dB and air ≥ build tail − 4 dB, and correlation ≤
build tail + 0.15.

*Decision: **Accepted, with two changes.***

- **Riser** endDb −15 (see C1), w ≤ 0.6, fx_rise width 0.8.
- **Crash:** about +4 dB in the drops, the 4.2 kHz cut deleted, HP 450 Hz.
- **Hats** +3 dB. **Shaker** back in drop3, 3b and 3c.
- **Change 1, drop1 hats.** Drop1 gets an open hat on the **"and" of 4 in every bar** instead of on every
  offbeat. Drop1b keeps the full open offbeats as its lift, which also serves P11's variation request. If
  drop1's presence still fails, Musician B switches drop1 to full open offbeats.
- **Change 2, pushed back on the full-band correlation rule.** It compares a build tail with the bass sucked
  out against a drop full of mono kick and sub, so it fails by design, whatever the stereo image does.
  - **Replacement, a mix move:** the music bus narrows to about 0.7 over the last 2 bars of each build and
    opens to 1.1 on the downbeat. The drop really does get wider.
  - **Replacement checks:** band correlation in the drops (presence ≥ +0.3, air ≥ +0.15). The drop's mid
    band must be at least 1 dB wider (S−M) than the verse before it.
- **The presence and air payoff rule is adopted as written** (brief §6).

**P2. Musician B, must. The builds peak louder than the drops.**

*Note.* The 3 s ending at each gap: build2 −6.7 against drop2 −9.0, and build3 −6.6 against drop3 −7.9. The
A&R's fix:

- End build2 at −2.5 dB and build3 at −3 dB.
- HALL_SWELL −12 → −20.
- Snare v1 0.8.
- Chop-roll v1 0.75.

Pass: the 3 s ending at each gap at least 1 LU under the drop.

*Decision: **Accepted, merged with C1.***

- The master lanes use the club's slightly deeper numbers (build3 −3.5).
- HALL_SWELL −22.
- Chop-roll v1 **0.7**.
- The pass rule is replaced by the club's last-bar momentary rule, plus a floor and the "drop lands" rule.
  It is stricter, and it catches the last-beat spike that a 3 s window averages away.

**P3. Musician B, must. The drop 1 balance is inverted.**

*Note.* Bass plus sub (about −19.0) is level with the kick (−19.4). The hook layers sum to about −22.7,
roughly 4 dB under the bass. Sub plus low is 56 % of drop1, the heaviest of all seven drops, and drop1 is the
playlist decision point. The A&R's fix: in drop1/1b, bass −0.5 → −4, sub −3 → −5, gtr_lead +2, pluck +2.

Pass: sub + low ≤ 48 %, mid + presence ≥ 33 %, and the hook 2–3 dB under the kick and above the bass bus.

*Decision: **Accepted** as written.*

- It also matches the brief's intent: drop 1 is the light pop drop.

**P4. Musician A, should. Drop layers carry their own top.**

*Note.* The A&R's fix:

1. Move the drop1 piano stabs to their own stem, or drop their velocity to 0.45.
2. PLUCK cutoff 600 → 1400 with env 3.2; WALL 12000; lead 9000 / 0.8.
3. Chop-roll v1 0.75.

*Decision: **Accepted.***

- The stabs go to a new stem, `piano_stab`, which Musician B adds to `mix.js`.
- Pluck as given; WALL 12000.
- **Changed:** the lead is 9500 / 0.7 (see C9).
- Chop-roll v1 is 0.7.

**P5. Musician A, should. drop3c is over-stacked.**

*Note.* 24 stems, polyphony 51, mid band 37.6 %. Four sources play the identical +12 melody, each with its
own 2–3 ms jitter, so the attacks flam and the sustain chorus-smears. A 1–3 kHz pile-up at −7 LUFS means
listener fatigue in a daily game. The A&R's fix:

- Take gtr_lead out of drop3c.
- Timing σ 0 on the doubles.
- Chops as a rhythmic answer, not a unison.
- pluck_arp HP 2 kHz, LP 4.5 → 8 kHz.

Pass: mid ≤ 32 %, presence ≥ 9 %, short-term max ≤ −7.8.

*Decision: **Accepted, one change.***

- gtr_lead and acoustic out of drop3c.
- **Every tune double in drop 3 plays at σ 0** on the supersaw grid.
- **Chops:** 8th stutters from the second 8th of each long note, silent on short notes, in drop3b and drop3c.
- **Changed, pluck_arp HP 1.2 kHz, not 2 kHz.** The +24 arp's fundamentals sit at E6–B6 (1.3–2 kHz). An HP at
  2 kHz removes them and turns the arp into fizz. Musician A raises the arp's filter base 430 → 1200 Hz
  instead. LP 8 kHz as given.
- **The pass targets are adopted.**

**P6. Musician B, should. The pre-drop silences are reverb washes.**

*Note.* The A&R's fix: HALL_SWELL −20, plus a ~12 dB duck on the hall and plate across the last 150 ms of
each gap. Pass: each gap ≤ −30 dBFS, with the build3 breath excepted.

*Decision: **Accepted, merged with C4.***

- **Changed:** the duck starts at the gap start, not in the last 150 ms. The wash is loudest at the start.

**P7. Musician B, should. Mono phone translation of the top.**

*Note.* The A&R's fix:

- Music-bus width ≤ 1.2 in drops; pad and chords ≤ 1.35.
- Width from hard-panned doubles instead: an AC2 acoustic take on R in drop1/1b.

Pass: presence and air correlation ≥ +0.15; overall drop correlation 0.5–0.65; each drop wider than the
verse before it.

*Decision: **Accepted, changed.***

- **Widths:** the club's tighter numbers (C2).
- **AC2 on R60 in drop1/1b:** accepted (Musician A).
- **Pushed back on overall correlation 0.5–0.65.** Full-band correlation is dominated by the mono low end,
  and drop 1 is still about half low end. It becomes a sanity range of 0.45–0.8, and width is judged per
  band (see P1).

**P8. Engineer, should. Piano realism.**

*Note.* The modal piano has no soundboard, only 2 strings per note, and no key-off or damper noise, so it
risks a glassy, DX-like sound. The A&R's fix:

- a modal soundboard with 25–30 modes
- 3 strings in MIDI 45–88
- damper and key-off noise
- felt hammer-return noise

*Decision: **Forwarded, high priority** (Engineer request #2).*

- The piano is the verse lead and half the drop 1 hook. "Real instruments" is the family's main request.

**P9. Musician A, should. The verses are muddy on phones.**

*Note.* The A&R's fix:

- LH in octave 3 when the sub plays, or piano HP 110.
- −2.5 dB at 350 Hz.
- Felt multiplier 0.38 → 0.5 (with the Engineer's OK), or a +2 dB shelf at 4 kHz.

Pass: low-mid ≤ 32 %, presence ≥ 6 %.

*Decision: **Accepted, merged with C5 and C10.***

- **LH ≥ E2.**
- **HP 90:** the LH move takes the piano's fundamentals out from under the sub, so HP 110 is not needed.
- **−3 dB at 300 Hz.**
- **Felt brightness without an engine change:** Musician A passes the felt Piano's public option
  `brightness: 0.6`. Its default is 0.3, and the change lifts the hammer cutoff by about the same 29 % as a
  0.38 → 0.49 multiplier.
- **Low-mid target ≤ 30 %.**

**P10. Musician A, nice. The breakdown has almost no top.**

*Note.* The A&R's ideas: choir breath / "hh" air, a shimmer send on the piano's top notes, or a soft high
violin harmonic above D6. Pass: air ≥ 1.5 %, presence ≥ 4 %.

*Decision: **Accepted, changed.***

- **The method is C12's:** the bell D7, the guitar harmonics, the grand at 0.7 and the hall LP at 9.5k.
- **Declined: the choir breath / noise layer.** It is a noise-smear risk, and it adds formant exposure.
- **The targets are adopted.**

**P11. Producer, nice. Repetition fatigue.**

*Note.* The refrain plays in full 7 times in 3:17. Each second half (1b, 2b, 3c) only adds layers. The
A&R's ideas:

- drop1b: the choir takes the tune and the piano answers.
- drop2b: call and response between the chops and the funk guitar.
- Or cut drop2b to 4 bars and add a 4-bar post-drop vocal moment.

*Decision: **Accepted with my own variations. The form does not change.***

- **drop1b:** for bars 1–4, **the lead guitar sings the refrain alone**, and the piano answers an octave up
  inside the long notes. Bars 5–8 bring the composite back, with the choir "oh" double. I used the guitar,
  not the choir, because a formant choir carrying the tune in a drop is exactly the exposure P12 warns
  about.
- **drop2b:** call and response as suggested. The chops sing the phrase heads and short notes, and the funk
  guitar answers inside the long notes, replacing the stutters. That also halves the chop count (C8).
- **drop3c:** it is now re-scoped (C13), and it changes in the top and the bottom, not only by adding layers.
- **Declined:** cutting drop2b and adding a vocal moment. Both A&Rs passed the form, and every cue and the
  cut-1 comparison depend on the timeline. A 4-bar exposed vocal moment is the riskiest thing we could add
  while nobody can hear the voice model.

**P12. Musician A, nice. Synthesized-voice exposure risk.**

*Note.* The drop2 hook is formant chops (the loudest musical stem), and choir_lead carries the melody in
build3 and the tag. They could read as buzzy or "vocoder". The A&R's mitigations:

- Double the drop2 chops with the pluck or a soft supersaw at −6 dB.
- Keep choir_lead ≥ 3 dB under the strings and piano in build3 and the tag.

*Decision: **Accepted.***

- **Drop2:** the pluck plays every melody note with its natural decay. Musician B sets it about 6 dB under
  the chops.
- **build3 and tag:** the supersaw and piano are the front, and choir_lead sits 3 dB behind them (Musician B
  lanes).
- **The exposure rule** is now in brief §8.

**P13. Engineer, nice. Automatic report checks.**

*Note.* Two automatic checks: a drop-payoff table and a mono fold-down loss per section.

*Decision: **Forwarded, merged with C15.***

### What the label should hear in cut 2

**Will change:**

- Every drop is louder, brighter and wider than the build it ends.
- The gaps are close to silent.
- Drop 1 leads with its hook.
- Drop 3c is bigger at the bottom and the top, not in the mids.
- The strings and chops behave like players, not presets.
- The verses and breakdown are open on a phone.
- drop1b and drop2b each have a real variation.

**Will not change:** the form, keys, tempos, melody plan and ending.

---

## Round 2: cut 2 → recut session 3 (2026-11-08)

**Cut reviewed:** `studio/out/cut-2`. 3:16.5, −9.92 LUFS integrated, −2.9 dBTP, 0 clips, rendered in 219.6 s.

**Verdicts:**

- **Club A&R 7.4/10, recut.** "Cut 2 fixes the payoff. Every drop now lands." It is still not releasable for
  two reasons. The main-stage low end is out of tune: the big-room kick's held B1 tail sits a semitone under
  the C2 sub, and over a tonic whose sub plays at 82 Hz. And the round-1 piano realism (P8/E2) was never
  built.
- **Pop A&R 7.5/10, recut.** All 22 cut-2 checks pass on the final WAV. It is still not a single. The record
  opens on a solo piano that never got its realism work. The Tiësto drop 3 is no bigger than drop 2 on a phone.
  And build 2 sags below the verse before it.

**Producer's own check before deciding.** I re-measured cut 2 from the WAV with three new read-only scripts:

- a 65536-point FFT per drop bar
- a phone sim (mono, HP 350 Hz 24 dB/oct, K-weighted) per section and per bar
- per-bar BS.1770 loudness and band levels

I also read the three PNGs, re-read the kick code, and ran a body-only re-implementation of the b-kit kick
(`kicksim*.mjs`). **Every measurement the label quoted reproduces.** My absolute numbers differ from theirs by
0.1–0.3 dB (window placement), but the orderings match exactly:

- **Low end.** The B1 (61.7 Hz) kick tail is the strongest component under 100 Hz in every bar of drop 3.
  - C bars: tail −16.3 vs C2 −20.6 (drop3b bar 3).
  - Tonic bars: tail −16.8 vs E2 −22.5, and the E1 sub is absent (−29 to −50 dB).
  - The spectrogram shows a solid band at about 60 Hz from 2:24 to 3:07, with no sub dashes under it.
  - In D minor, the A1 (55 Hz) tail sits 0–3.3 dB over the Bb1 sub on Bb bars, and 11 dB over the D2 tonic in
    drop 2.
- **Phone sim.** drop1 −12.0, drop2 −11.2, drop2b −11.0, **drop3 −11.4**, drop3b −11.1, drop3c −10.9. Drop 3
  is quieter on a phone than the drop before it. Mono loss is 0.9–1.0 LU in drop 3, 1.5 in the breakdown and
  1.6 in the tag.
- **Build 2 per bar:** −13.1, −12.5, −12.3, −12.0, **−13.3, −13.0**, −11.8, against verse 2's −10.7.
  - Bars 5–6 sit 10 dB under bars 3–4 in the 0.8–3 kHz band.
  - On the phone sim, build 2's bar 1 is 4.4 LU under verse 2. The chop tease starts behind a 700 Hz
    low-pass.
- **Build 3** is flat: −11.5 … −10.8 against the breakdown's last bar at −10.9.
- **Breakdown:** hall −23.9 vs piano −24.2, mid-band correlation 0.20, fx_sweep 47 % of the air band.
  **Tag:** hall −19.2 vs lead −21.0.
- **Piano.** `engine/inst/keys.js` is unchanged since 18:06: two components per partial, no soundboard, no
  key-off noise. Confirmed.
- **New finding 1: the club's kick fix alone will not meet the club's own target.** In my sim, hold 0.03 / tau
  0.13 lowers the 61.7 Hz component by only 2.6 dB. The drive (×3.1 at full velocity) holds the tail near full
  level through the 2nd 16th. The C bars need about 10 dB. Retuning the tail to E1 with the same envelope puts
  the 61.7 Hz component 16.6 dB lower.
- **New finding 2: the render budget is not where the pop A&R put it.** Parts render in parallel worker threads.
  Cut 2's keys part took 23.5 s, while vocals (60.3 s) set the parts' wall clock, and the mix stage took 137 s
  of the 220 s. So piano realism inside the keys part costs almost no wall clock up to about 45 s. New
  *mixer inserts* are the real cost.

**My overall call.** Both A&Rs are right, and two of the faults are mine:

- I wrote the "kick tail on the 5th of the key" cue, and the 5th is a semitone under the bVI chords this
  progression leans on: Bb in D minor, C in E minor.
- I wrote "E minor bottoms out at G1", which hid that the tonic sat at E2.

The form, keys, tempos, melody plan and payoff passed both reviews, so **the form stays (106 bars, 3:16.5)**.
Cut 3 is about **the two places a listener judges "real" first: the first sound (the piano) and the bottom (a
low end in tune)**. It also adds the three checks cut 2 lacked: build rise, phone ladder, and wet-under-dry.

### Club A&R (7.4/10)

**C16. Musician B, must. The drop 3/3b/3c low end is out of tune, because of the big-room kick tail.**

*Note.* The 61.7 Hz tail sits over the C2 sub on C bars (beating at 3.7 Hz), over A1 on Am bars, and over the
E2 sub on Em bars, so the strongest low note under the tonic is the dominant B. The 60–65 Hz band runs 8.5 dB
over 1 kHz: a one-note boom. The A&R's fix: hold 0.12 → 0.03 s and tau 0.27 → 0.13 s, keeping the tok, click
and drive. If the drop loses weight, the D3 kick lane goes −8.5 → −7.5. Targets: on C and Am bars the 61.7 Hz
component is ≥ 6 dB under the sub note; on Em bars E is the strongest component below 100 Hz.

*Decision: **Accepted, changed. The envelope as given, plus a retune of the tail to the tonic, E1 = 41.2 Hz.***

- **Why the retune.** My sim shows the envelope alone moves the 61.7 Hz component about 2.6 dB, a quarter of
  what the C bars need.
- **The root cause is tuning.** A held tail on the 5th rubs against every bVI chord. With a rolling bass
  between the kicks, the big-room convention is a kick tuned to the root, sharing the tonic with the sub on
  tonic bars.
- **Targets adopted** and generalised into brief §7 "Low-end pitch" and `drop-check-3.mjs` §3. The rub window
  is 2 semitones, so the Am bars the note lists are caught too.
- **No blind +1 dB on the kick lane.** The retune moves the kick's energy below 60 Hz, so the kick lane is set
  by sub-band guardrails instead: sub share 18–26 %, sub ≤ low + 2 dB, limiter max GR ≤ 2 dB.
- **Fallback, documented in §7.** If those guardrails cannot hold with the kick lane at −11 dB or above, keep
  B1 with a short kick (hold 10 ms, tau 0.08 s, drive 2.4) and a 0.08 s sub release.
- `cues.kickTailHz` 'E minor' 61.7 → 41.2, and `cues.kickEnvelope` added.

**C17. Musician A, must. bass.js breaks brief §7 (sub fundamentals 40–75 Hz) in E minor.**

*Note.* `subMidi = pcAtOrAbove(pc, 29)` puts E on E2 (82.4 Hz). Drop3c's sub share is 13.6 %, against drop2's
21.6 %. The A&R's fix: the sub stem in drop3/3b/3c uses `pcAtOrAbove(pc, 28)`, and the +12 mid layer stays on
the old register, so phones still hear E3. Musician B re-checks: sub share 18–24 %, at least drop2's Mid-channel
sub level, and limiter GR ≤ 2 dB.

*Decision: **Accepted as written.***

- Brief §7 is fixed, and `cues.subFloorMidi` records the floor.
- **Sub share is changed to 18–26 %,** because the tonic-tuned kick (C16) also lands its fundamental in the sub
  band.
- The other two re-checks stand: Mid-channel sub ≥ drop2's, and limiter GR ≤ 2 dB.

**C18. Engineer, must. The piano realism of round-1 P8 / E2 was not done.**

*Note.* `engine/inst/keys.js` is unchanged: no soundboard, a 2-component prompt + aftersound pair, no damper
noise. The piano is the record's first voice, and the game replays from the top. The A&R's fallback if the
Engineer can't deliver: Musician A builds it in `instruments/a-piano-body.js`.

*Decision: **Accepted, P0, reassigned to Musician A*** as `instruments/a-piano.js`.

- `APiano` is a fork of the engine Piano. It adds:
  - three strings in MIDI 45–88
  - a 28-mode soundboard, as one IR per register band, convolved over each note's first 250 ms
  - key-off and pedal damper noise
  - hammer return
- The full spec, merged from both A&Rs, is in brief §9.
- The Engineer request stays open. If it lands first, Musician A uses it, so the body is never stacked twice.

**C19. Musician B, should. The same kick/sub overlap, milder, in drops 1–2.**

*Note.* On Bb bars the A1 tail sits 3.3–3.8 dB over the Bb1 sub. On Dm bars it is 6.8 dB (drop1) and 12 dB
(drop2) over the D2 tonic. The A&R's fix: pop and club tails tau → 0.13, *or* a sub duck release of 0.12 →
0.08. Target: D2 within 3 dB of 55 Hz on Dm bars.

*Decision: **Accepted, changed. Both moves, and different targets.***

- **The moves.** Pop and club kicks go to tau 0.13 s; my sim gives −2.6 / −4.8 dB at 55 Hz. The D1/D2 sub duck
  release goes to 0.09 s.
- **Tuning stays at A1.** D1 (37 Hz) is below the range, and D2 (73 Hz) is too high for a full kick.
- **Changed targets:**
  - On Bb bars, the 55 Hz component is **no louder than the Bb1 sub**. That is the real rub.
  - In drop2/2b, D2 is **within 6 dB** of 55 Hz on Dm bars.
- **Pushed back on 3 dB.** That needs about +5 dB of sub in drop 2, already at 21.6 % sub, or +5 dB in drop 1,
  whose light-pop balance (round-1 P3) deliberately makes the kick its low end. Drop 1's Dm bars are reported
  only.

**C20. Musician A, should. Build 2 sags in the middle.**

*Note.* Bars 5–6 lose 10 dB in the 0.8–3 kHz band, because the chop tease stops and the stabs restart at 900
Hz. The A&R's fix: stab cutoff `1400·4.3^((e−32)/32)`, velocity 0.66 → 0.75, and the chop roll in 8ths from
bar 5. Target: bars 1 → 7 rise by ≥ 2 LU, with the last-bar max ≤ −9.9.

*Decision: **Accepted, merged with P17.***

- **Cutoff `1600·3.75^((e−32)/32)`.** It runs 1.6 → 6 kHz and continues from bar 4's 1.4 kHz without a reset,
  as this note wants. It also starts inside the 1–3 kHz band P17 wants.
- **Velocity** 0.66 → 0.75.
- **Chop roll** in 8ths from bar 5, v0 0.58 (P17).
- **Rise target +1.5 LU** (brief §6 "Build rise"), not +2, for the joint-feasibility reason in P16.

**C21. Musician B, should. The master lanes make the builds flat or falling.**

*Note.* build2 `[[0,−3.5],[6,−2.5],[7.5,−3]]`; build3 `[[0,−4.2],[6,−3.2],[7.5,−3.5]]`. Re-run the drop-check.

*Decision: **build3 accepted as written. build2 pushed back.***

- Starting build 2 at −3.5 dB deepens the verse2 → build2 step-down (P16's complaint) from 2.4 to about 3.7 LU.
- build2 uses `[[0,−1.6],[6,−2.2],[7.5,−3],[8,−3]]` instead: near-flat in bars 1–6, and the last bar is
  unchanged. Its rise comes from the arrangement (C20, P17, P18), not from master gain.
- Build 3's start dip (about 0.7 LU under the breakdown's swell) is fine. The breakdown also gets drier (P19).

**C22. Musician A, should. Breakdown bars 5–8 bend the exposure rule.**

*Note.* The formant soprano carries the anthem almost alone at the emotional peak. The A&R's fix: grand base
velocity 0.44 → 0.62 with the octave on the high Ds, and the choir_lead lane −3.5 → −6.5, *or* a LegatoStrings
+12 double.

*Decision: **Accepted, the grand version.***

- The grand leads, and the choir doubles it 3 dB behind (choir_lead −6.5, Musician B).
- **Declined: the strings double.** The strings were cut 1's cheapest-sounding element, and the render budget
  goes to the piano first.
- The §8 exposure rule now covers the whole record, not only drops and builds.

**C23. Producer, should. Add a low-end pitch check, and fix brief §7.**

*Decision: **Accepted, done.***

- `drop-check-3.mjs` §3 runs one 65536-point Hann FFT of the Mid channel per drop bar. It tests the cue
  tuning *and* B1 61.7 Hz, so the rule bites whichever kick ships.
- It skips a candidate that is the bar's own bass note (Cmaj7 → Em/B is the bass moving, not a rub).
- Run on cut 2, it fails exactly the bars the A&R listed: all drop-3 tonic, C and Am bars, plus the D-minor Bb
  and drop-2 Dm bars.
- Brief §7 now has "Bass register" fixed and a new "Low-end pitch" table.

**C24. Musician A, nice. Verify the drop 2 chops visually.**

*Decision: **Accepted.***

- Musician A renders `--only vocals --from drop2 --to drop2b` and reads F2/F3 for drift.
- If the formant lines are ruler-straight, Musician B lifts the pluck double to about 3 dB under the chops.

**C25. Producer, nice. A club-servicing extended mix.**

*Decision: **Accepted in principle, deferred.***

- The game master is the deliverable, and it does not change for this.
- An extended mix needs a separate score file plus a `--score` option in `render.mjs` (new Engineer request 4).
- I will cut it once the game master is approved, with a 16-bar intro at 126 and a 16-bar outro at 134 as
  suggested.

### Pop A&R (7.5/10)

**P14. Engineer, must. The piano realism work was never delivered.**

*Note.* (1) A soundboard: 25–30 modes, 60 Hz–3 kHz, Q 15–40, 150–250 ms, driven by the hammer. (2) Three
strings in MIDI 45–88, ±0.5–1.5 cents, each with its own T60 (±8 %). (3) Key-off/damper noise at −35 dB on
every note end and pedal change. (4) A felt hammer-return thunk. The budget: one 0.25 s IR per register band
(6 bands), convolving only the first 250 ms. Acceptance: a dense 100–2500 Hz bloom decaying over about 200 ms;
verse low-mid ≤ 30 %.

*Decision: **Accepted, merged with C18, and assigned to Musician A.***

- The spec and the acceptance are adopted as written (brief §9).
- **Budget corrected.** Parts render in parallel, so the limit is the keys part at ≤ 45 s, not "+8 s overall".
  The real constraint is **no new mixer inserts or stems**: the mix stage is 137 s of the 220 s.
- Added: gain-match each piano stem within ±1 dB of cut 2, so the mix levels hold.

**P15. Musician B, must. Drop 3 does not grow on a phone.**

*Note.* On the phone sim, drop2b −11.3 → drop3 −11.6. The whole drop2b → drop3 gain is below 350 Hz (kick
+2.6, sub +5 dB), and drop 3 loses the most in mono. The A&R's recipe:

- kick D3 −8.5 → −9.3; sub D3 0 → −0.8
- the wall at −11.5 dB and width 1.15
- gtr_dist +1.5, lead +1 and choir +1 in D3
- re-trim the D3 master lanes

Targets: drop3 ≥ −10.9, 3b ≥ −10.7, 3c ≥ −10.5. The C3 rules and integrated −9.5 to −10 still pass.

*Decision: **Accepted, changed in three places.***

- **The phone-band moves** (wall, gtr_dist, lead, choir) are exactly as given.
- **Kick and sub lanes.** They start at −9.3 / −0.8, but the final values come from C16's sub-band guardrails.
  The kick retune changes the kick's energy far more than any lane move.
- **Targets made relative.** drop3 ≥ drop2b + 0.4 LU, 3b ≥ 3 + 0.3, 3c ≥ 3b + 0.3. That is equivalent to the
  absolute numbers, and robust to our 0.2–0.3 dB measurement offset. Mono loss in drop 3 must be ≤ 0.8 LU.
- **The C3 rule is reworded.** "drop3c low ≥ mid" becomes "sub + low ≥ mid + 10 points" with mid ≤ 34 %. The
  E1 kick and sub move the bottom into the sub band on purpose. Shrinking a boom that was about 30 % of drop 3's
  energy raises every other band's share by about 4 points with no midrange added. The cap is still well under
  cut 1's 37.6 %.

**P16. Producer, must. Build 2 sags, the opposite of "keep building".**

*Note.* New brief targets:

- bar 1 ≥ verse2 − 1.5 LU
- bars 1 → 7 rise every bar, by ≥ 1.5 LU in total
- bars 5–6 mid within 4 dB of bars 3–4
- last-bar max ≤ −9.9

The A&R's master lane: `[[0,−1.2],[4,−1.8],[6,−2.6],[7.5,−3],[8,−3]]`.

*Decision: **Accepted, changed.** The new brief §6 "Build rise" sets these:*

- bar 1 ≥ verse2 **− 2** LU, and on the phone sim ≥ verse2 − 3 LU (the 700 Hz chop tease cost 4.4 LU there)
- bar 7 ≥ bar 1 + 1.5 LU
- no bar more than **0.3 LU** under the one before it
- bars 5–6 mid within 4 dB of bars 3–4
- the ceiling unchanged
- build 3: its bars 5–6 rise ≥ 1.5 LU over its bar 1, and ≥ the breakdown's last bar + 0.5 LU
- a conflict order: ceiling → mid band → rise → start

*Why these numbers:*

- **The three original rules leave the build no margin.** The ceiling's momentary max runs about 0.8 LU over the
  last bar's mean. So with bar 1 at −12.2 and a +1.5 rise, bar 7 must reach −10.7. That is the most the last bar
  can average under a −9.9 ceiling.
- **"Every bar rises" is brittle.** Per-bar LUFS moves with fills and pickups, so dips up to 0.3 LU are allowed.
- **The A&R's lane falls 1.4 dB from bar 1 to bar 7.** I estimate it leaves under +1 LU of net rise. The
  flatter lane `[[0,−1.6],[6,−2.2],[7.5,−3],[8,−3]]` keeps the last bar exactly as it is.

**P17. Musician A, should. Build 2 bars 5–8: stab cutoff `2000·3^p`, chop roll in 8ths at bar 5 with v0 0.58.**

*Decision: **Accepted, merged with C20.*** The cutoff is `1600·3.75^p`, and v0 is 0.58.

**P18. Musician B, should. Build 2 drums and lanes.**

*Note.* Clap on 2 and 4 in bars 5–6, then every beat in bar 7. Chords lane in bars 5–8 −10 → −8. The new master
lane. Re-run the check.

*Decision: **Accepted*** (with P16's lane).

**P19. Musician B, should. The breakdown is wet and phasey on a phone.**

*Note.* Hall sends: piano −9 → −13, strings −7 → −10, choir −3 → −6, choir_lead −5 → −8. Hall width 0.85.
Bells +4 dB and gtr_clean harmonics +2 dB in bars 1–4. Pass: hall ≥ 6 dB under the piano, mid correlation
≥ 0.4, mono loss ≤ 1 LU, air ≥ 1.5 % with fx_sweep < 30 % of the air band.

*Decision: **Accepted as written.***

- Added: if fx_sweep is still ≥ 30 % of the air band, trim its breakdown lane (−2.5 → −5 dB in bars 3–8).
- With C22's louder grand in bars 5–8, the dry-over-wet margin comes from both ends.

**P20. Musician B, should. The tag is swimming.**

*Note.* Tag hall sends: piano −13, choir −6, strings −10, chords −14. Keep the outro sends. Pass: hall ≤ lead
− 4 dB, mono loss ≤ 1 LU.

*Decision: **Accepted, with two additions.***

- choir_lead's tag send −5 → −8 (the same rule as the breakdown).
- Hall width 0.85 in the tag, for the mono-loss target.

**P21. Engineer, should. The report tables (E1/C15/P13) and a per-section phone-sim column.**

*Decision: **Accepted.***

- `drop-check-3.mjs` prints all of them this round: drop delta, Mid/S−M bands, gaps on the final file, the
  phone sim, mono loss, low-end pitch, build rise and reverb balance.
- It does not do the drum lane in the piano roll.
- The `report.md` request stays open (brief §15).

**P22. Musician B, should. Synthesized chops pile up treble boosts.**

*Note.* Chop strip shelf at 7 kHz +2.5 → +1, exciter 0.18 → 0.1. Musician A: if it is still bright, the +24
layer goes −14 → −16.

*Decision: **Accepted. The +24 layer goes to −16 now.*** "Still bright" cannot be measured by ear here, and P25
puts the +24 layer first in line.

**P23. Musician B, nice. Drop 2 is the narrowest drop.**

*Note.* Pad lane −14 → −11.5, chops_echo +3 dB. Pass: S/M ≥ −9.0 and presence correlation ≥ 0.3.

*Decision: **Accepted, P2.***

**P24. Musician B, nice. Daily-repeat fatigue.**

*Note.* Drop2/2b hats −0.5 → −2.5 if air − mid stays ≥ −11 dB. Give piano_pop the `resonance` insert (mix
0.06).

*Decision: **Hats accepted, P2. The resonance insert is accepted only if the full render stays ≤ 230 s.*** It is
a mixer insert on a full-length stem, and the mix stage is the budget.

**P25. Producer, nice. What the A&R could not verify.**

*Note.* The A&R could not verify the timbre of the modal piano, the Klatt choir and chops, or the strings. Keep
the §8 exposure rule. If anything has to give, the +24 chop layer goes first. Budget E2 before anything else.

*Decision: **Accepted.***

- The exposure rule is widened to the whole record.
- The +24 layer is at −16 now.
- The piano is P0 for Musician A, and no other new cost is added before it.

### What the label should hear in cut 3

**Will change:**

- The opening piano has a body: soundboard bloom, three-string unison, damper noise.
- Drop 3's low end is in tune, with the kick and sub on the tonic E1.
- Drop 3 is bigger than drop 2 on a phone.
- Builds 2 and 3 rise bar by bar.
- The breakdown and the tag keep their dry carriers in front of the hall.
- The chops are less bright.

**Will not change:** the form, keys, tempos, melody plan, payoff and ending.
