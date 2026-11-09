# Hatikvah (MTap festival mix): Production Brief

Producer's pre-production brief. It goes with `studio/song/score.js`, which holds the timeline, chords,
per-section notes and a machine-readable `cues` export. `STUDIO.md` is the contract and it wins any
conflict with this brief. Musician A owns keys, guitars, bass, leads and vocals. Musician B owns drums,
groove, FX and the mix.

> **Revision: cut 3 (recut session 3).** The label returned cut 2 at 7.4/10 (club) and 7.5/10 (pop). Every
> cut-2 check passed, and both A&Rs agree the payoff now works. The form, keys, tempos and timeline are
> still unchanged (106 bars, 3:16.5). Cut 3 is about **the two places a listener judges "real" first**:
>
> 1. **The piano is the first sound of every game launch, and it still has no body.** Its realism work
>    (soundboard, three strings, damper noise) now belongs to Musician A in `instruments/a-piano.js` (§9).
> 2. **The low end must be in tune.** In drop 3 the big-room kick's held tail sat on B, a semitone under the
>    C bass and a fifth under every tonic bar. The kick tail is now tuned to the tonic (E1) and shortened.
>    The sub follows the 40–75 Hz rule in E minor (E1, not E2). See §7 "Low-end pitch".
>
> Cut 3 also fixes three things the cut-2 checks did not measure:
>
> - **Build 2 sags.** Each build must now rise bar by bar (§6 "Build rise").
> - **Drop 3 grows on a phone.** The phone ladder is in §14.
> - **The breakdown and tag are washed in hall.** Each wet return now sits under its dry carrier (§11).
>
> The new rules are in §6, §7 and §14 (cut-3 rows). Changed numbers are edited in place, so there is one
> number per thing. The label's notes and my decision on each are in `LABEL-NOTES.md` (Round 2). The work list
> is `SESSION-3.md`.
>
> **One gain change, one owner.** A level change is made once: Musician B on the fader or lane. Musician A
> changes source level only where a layer balance inside one part changes, for example a +24 chop layer
> against the +12 layer.

---

## 0. The record in one paragraph

*Hatikvah* means "The Hope". The record goes from a living-room piano to the main stage in three passes
of the anthem. Each pass is **faster** (126 → 128 → 131 → 134 BPM), gets a **longer build** (4 → 8 → 8
bars) and ends in a **harder drop**:

1. **Drop 1, the pop drop.** Chainsmokers-style and led by piano and guitar.
2. **Drop 2, the vocal-chop drop.** More bump: chopped voices, funk guitar and tresillo percussion.
3. **Drop 3, the main stage.** A Tiësto big-room supersaw anthem, a whole step up in **E minor**, built
   as a **double drop**. In its last 8 bars **drop 1's piano hook returns on top** as the callback that
   unites the three drops. The last 8 bars escalate from the **top** (shaker, ride, a crash every 2 bars, the
   +24 arp) and the **bottom** (a kick and sub tuned to the tonic E1), never from more midrange layers. Drop 3
   must also be **bigger than drop 2 on a phone**, not only on a PA (§14 phone ladder).

After drop 3 the anthem's last line broadens into one final hit. That hit rings out to silence at
**3:16.5**. The melody starts at **0:00.0**, and the verse arrives at 0:03.8.

### Non-negotiables

1. **The tune is the hook.** Every melodic section has Hatikvah in front, and the tune is recognisable
   within 2 seconds. Keep the pitch sequence intact. You may change rhythm feel, articulation and octave.
2. **Real instruments are the body:**
   - grand and felt piano
   - Rhodes
   - acoustic steel-string guitar
   - clean, muted and distorted electric guitars
   - a played-sounding drum kit
   - bass
   - choir

   Synths (supersaw, pluck, bells) are the gloss on top of that body, never a replacement for it.
3. **Everyone obeys the same silences** (`cues.silenceBeats`) and the same downbeat hits
   (`cues.downbeat`).
4. **Wordless vocals only.** Synthesized consonants are the number-one "cheap game" giveaway. These
   records live on choirs and chops anyway.
5. **Nothing sounds static.** Every played part needs:
   - velocity variation
   - humanised timing
   - an envelope on its filter
   - space (reverb or delay)
6. **The song ends on a ring-out to digital silence.** The game replays from the top.

---

## 1. Concept and reference sound

**Sound references.** Use these for production values only. Do not quote them.

| Reference | What we take from it |
|---|---|
| The Chainsmokers: *Something Just Like This*, *Closer*, *Roses*, *Don't Let Me Down* | Felt-piano and clean-guitar verses. Pluck and vocal-chop toplines. Warm pumped chords. Syncopated pop bass. A short, sharp first drop. |
| Tiësto: *Adagio for Strings*, *Red Lights*, *The Business*, *Wasted* | A classical melody in long notes over a pounding big-room beat. A supersaw wall. Trance-era rolling bass. Builds with snare rolls, kick rolls, risers and a hard silence. |
| Avicii: *Wake Me Up*, *Hey Brother* | Acoustic guitar strumming inside an EDM drop: the "real instruments" bridge the family asked for. |

**What makes it sound expensive** (check every part against this list):

- **Layering.** Every hook has 2 to 4 layers:
  - an attack layer (piano, pluck or guitar transient)
  - a body layer (supersaw, chop or guitar sustain)
  - an air layer (an octave up, quiet, wide)
  - sometimes a sub-octave layer
- **Movement.** Filter envelopes on every synth note. Vibrato on voices. Chorus on guitars and Rhodes.
  Velocity on everything.
- **Space.** Depth comes from different reverb amounts. Kick, bass and lead sit in the mono centre;
  chords, choir and guitars are wide.
- **Contrast.** Verses are small and close. Drops are huge. Silence comes before drops.
- **Transitions.** Every section boundary has an event: a crash, reverse cymbal, riser, fill,
  downlifter or impact. No bare cuts, except the planned silences.

**Avoid** (this is what "cheap game" sounds like):

- Square-wave leads.
- Dry, unfiltered oscillators.
- Machine-gun identical velocities.
- Everything in the mono centre.
- Notes that stop dead with no tail.
- Loops that never change.

---

## 2. Timeline

All times come from `score.js`, computed by Node. The numbers match whether the engine ramps tempo
linearly in beats or in time. **TOTAL 106 bars = 3:16.5.**

| # | Section | Role | Bars | BPM | Start | Key | Energy | Anthem bars (melody) |
|---|---|---|---|---|---|---|---|---|
| 1 | intro | intro | 2 | 126 | 0:00.0 | Dm | 0.30 | 8–9 (the "call" teaser) |
| 2 | verse1 | verse | 4 | 126 | 0:03.8 | Dm | 0.36 | 0–3 |
| 3 | verse1b | verse | 4 | 126 | 0:11.4 | Dm | 0.50 | 4–7 |
| 4 | build1 | build | 4 | 126→128 | 0:19.0 | Dm | 0.66 | 8–9, then 2 bars of pure build |
| 5 | **drop1** | drop | 8 | 128 | 0:26.6 | Dm | 0.76 | 8–15 |
| 6 | drop1b | drop | 8 | 128 | 0:41.6 | Dm | 0.80 | 8–15 (= 8–11 + 16–19) |
| 7 | verse2 | verse | 8 | 128 | 0:56.6 | Dm | 0.60 | 0–7 |
| 8 | build2 | build | 8 | 128→131 | 1:11.6 | Dm | 0.78 | 8–11, then 4 bars of pure build |
| 9 | **drop2** | drop | 8 | 131 | 1:26.4 | Dm | 0.86 | 8–15 |
| 10 | drop2b | drop | 8 | 131 | 1:41.1 | Dm | 0.90 | 8–15 |
| 11 | breakdown | breakdown | 8 | 131→134 | 1:55.7 | Dm | 0.42 | 8–15 |
| 12 | build3 | build | 8 | 134 | 2:10.2 | Dm → (D major) | 0.84 | 16–19, then 4 bars of pure build |
| 13 | **drop3** | drop | 8 | 134 | 2:24.6 | **Em (+2)** | 0.93 | 0–7 (verse as an anthem) |
| 14 | **drop3b** | drop | 8 | 134 | 2:38.9 | Em | 0.97 | 8–15 (the double drop) |
| 15 | drop3c | drop | 8 | 134 | 2:53.2 | Em | 1.00 | 8–15 (drop-1 piano callback) |
| 16 | tag | outro | 2 | 134→100 (rit.) | 3:07.6 | Em | 0.72 | 18–19 (final line, broadening) |
| 17 | outro | outro | 2 | 100 | 3:11.7 | Em | 0.20 | none: ring-out |
| | *end* | | | | *3:16.5* | | | |

**Silences**, where every stem is silent except reverb and delay tails:

| Section | Silence | Time |
|---|---|---|
| build1 | last 1 beat | 0:26.1–0:26.6 |
| build2 | last 2 beats | 1:25.5–1:26.4 |
| drop2 | last ½ beat | 1:40.9–1:41.1 |
| build3 | last 2 beats | 2:23.7–2:24.6 |
| drop3 | last 1 beat (double-drop gap) | 2:38.4–2:38.9 |

**Final hit:** tag bar 2 beat 3, at about **3:10.5**. It rings out until 3:16.5.

**Energy curve:**

```
1.0 |                                                         ___####
    |                                          ####         _/  drop3abc
0.8 |                      ####  build2  ####  drop2   build3/
    |          build1 ____ drop1     ___/                  /
0.6 |              _/            \_/verse2      \         /
    |      _______/                              \ bdown_/
0.4 | ____/ verse1                                \_____/
0.2 |/intro                                                        \_ ring
    +--0:00------0:30------1:00------1:30------2:00------2:30------3:00---3:16
```

---

## 3. The hook: who carries the tune, and how

The anthem register in the data runs from A3 to D5 (MIDI 57–74). "+12" means one octave up (D5–D6). The
front layer for each section is in `cues.melodyLead`.

| Section | Front (carries the tune) | Doubles |
|---|---|---|
| intro | grand piano 0 and +12 (octaves) | airy vocal chop "ah" +12, with delay throws |
| verse1 | felt piano 0 (RH) | none |
| verse1b | felt piano 0 | choir "oo" unison at 0, 10 dB under |
| build1 | vocal chop +12 through an opening low-pass | piano chords pump underneath |
| drop1 | **piano octaves +12/0 + clean lead guitar +12 + soft pluck +12** (one composite lead) | none. The hook sum sits 2–3 dB under the kick and above the bass bus (§11) |
| drop1b | bars 1–4: **clean lead guitar +12 alone**, with the piano answering an octave up in the long notes. Bars 5–8: the full composite returns | choir "oh" at 0 (−12 dB) in bars 5–8 only |
| verse2 | clean electric lead guitar 0 (neck pickup) | Rhodes 0 (soft); choir "oo" from bar 5 |
| build2 | vocal chops +12, filtered | supersaw chords underneath |
| drop2 | **vocal chops +12** | chop layers at +24 (**−16 dB**, cut 3) and at 0 ("oh", −6 dB); **pluck +12 doubles every melody note about 6 dB under the chops**, so pitch definition does not depend on the formant model |
| drop2b | **call and response:** chops sing each phrase head; the funk guitar answers in the held notes | as drop2; no re-chop stutters in drop2b |
| breakdown | **grand piano 0, octave-doubled on the high Ds, in front for all 8 bars** (cut 3: bars 5–8 at base velocity 0.62, was 0.44) | choir "ah" soprano doubles the tune in bars 5–8 **3 dB behind the grand** (exposure rule, §8); soft supersaw +12; **bell D7 ping and guitar harmonics above the D6 ice pedal** |
| build3 | **supersaw +12, filtered (opening 2 kHz → 6 kHz max)** | choir "ah" SATB **3 dB behind** the supersaw-and-piano front; piano 8ths |
| drop3 | **supersaw lead +12**, with a 0-octave layer at **−10 dB** | piano octaves; choir chords; **strings: one sustained legato line on the long notes only** (§9) |
| drop3b | supersaw +12 | chops answer in the long notes only, never in unison on short notes; bells +24 |
| drop3c | supersaw +12 + **drop 1's pop-piano octaves (the callback)** | chops as drop3b; bells +24; 16th pluck arpeggio +24 (sparkle above the wall). No lead guitar, no acoustic strums |
| tag | supersaw +12 + piano octaves | choir soprano **3 dB behind** them; all chords as hits |

**Doubles are one instrument.** Every layer that doubles the tune in drops 3/3b/3c (piano_pop, chops, strings,
bells) plays at the supersaw's grid time with **no timing jitter** (σ 0). Velocity may vary. Humanised
doubles flam the attack and smear the sustain into a chorus.

**The signature motif is "the call".** It is the opening of refrain A: low D, then the high D three
times. It appears in the intro teaser, in every build tease and in every drop.

- On supersaw and chops, play the three high Ds at **85–90 % length** so each one re-strikes as a stab.
- Give the big-room lead in drop 3 a **25 ms glide** from the low D up to the high D, the classic
  "lead jump".

**Articulation by carrier:**

- **Piano.** Legato, with the sustain pedal changing on each chord.
- **Lead guitar.** Add a 30–40 ms slide into notes reached by a step from below (C→D in refrain A).
  Use no bends wider than a semitone.
- **Vocal chops.** Long notes (≥ 8 sixteenths) may be **re-chopped** as 8th-note stutters on the same
  pitch ("ah-ah-ah"). That stutter is the vocal-chop-drop signature, and the pitch sequence stays intact.
  Gate short notes to 80 % of their length.
- **Supersaw lead.** 90 % gate on 8ths. Long notes sustain under the sidechain pump.

**Allowed rhythm feel.** In drops 1 and 2 you may **anticipate** a phrase-initial note by one 16th
(Chainsmokers push), for example the high C at the start of refrain B. Never move more than one note in
a bar.

---

## 4. Section-by-section arrangement

**A** = Musician A (keys, guitars, bass, leads, vocals). **B** = Musician B (drums, groove, FX, mix).
Groove pattern strings are in §10. Sound recipes are in §9.

### intro: 2 bars, 126, 0:00 (cold-open hook teaser)

- **A, keys.** Grand piano plays the call (anthem bars 8–9) in octaves (0 and +12) with the pedal down.
  Warm pad and choir "ah" swell in on Dm(add9) with a 1.5 s attack. They "breathe" in quarter notes
  through volume shaping (−4 dB dips on the beats), with no kick.
  - **Cut 3: this is the first sound of every game launch,** and the game replays from the top. The grand
    here, and the felt piano in verse 1, must have a body: soundboard bloom, three-string unison, and damper
    and key noise (§9 "Piano realism"). It is the record's single most important sound.
- **A, vocals.** An airy vocal-chop "ah" at +12 doubles the piano. Dotted-8th ping-pong throws on the
  held A.
- **A, harmony.** The bars run Dm(add9) → Gm7 → **A7 under the held A**, so the verse lands as V → i.
- **B.** No drums. A shaker fades in over bar 2. Bar 2 carries a reverse cymbal and a short noise riser
  that land on the verse1 downbeat, and a soft sub swell lands there too (`downbeat: soft`).

### verse1: 4 bars, 126, 0:03.8 (intimate)

- **A, piano.** Felt pop piano carries the melody (RH, original register). The LH plays the **lament
  bass** in octaves (D C Bb A G F | A D), with one or two soft chord tones under the tune (see §7).
  **Cut 2:** the LH's lowest note is at or above **E2** (`pcAtOrAbove(pc, 40)`), so the LH sits F2–D3 plus the
  octave above. The sub owns everything below 80 Hz. Inner tones stay at or above G3 (55). This applies to
  verse1, verse1b and verse2.
- **A, guitar.** Clean electric 8th-note arpeggio on chord tones plus the 9th, with a dotted-8th delay
  at 20 %, panned R 35 %.
- **A, choir.** "oo" chord pad, barely there (−18 dB under the piano).
- **A, bass.** Sub only: half notes following the lament bass. No pumping.
- **B.** A soft round kick on beats 1 and 3 only, with no click. Finger snaps on 2 and 4. Shaker 16ths
  with 56 % swing.

### verse1b: 4 bars, 126, 0:11.4 (verse lift)

- **B.** The kick goes four-on-the-floor but stays round. A soft clap joins the snap on 2 and 4.
  Offbeat closed hats come in. Bar 4 ends with a reverse cymbal into build1.
- **A, guitar.** Acoustic steel-string strums enter at L 35 % (pattern in §10).
- **A, bass.** 8th-note pulse on the lament bass.
- **A, choir.** "oo" doubles the melody in unison, 10 dB under the piano, to humanise it.
- **A, pad.** Warm pad enters with a 3 dB pump.

### build1: 4 bars, 126→128, 0:19.0 (short and sharp)

**Bars 1–2 (the call teased):**

- **A.** Vocal chop "ah" at +12 through a low-pass opening from 900 Hz to 6 kHz. Piano 8th-note chord
  pumps. Acoustic guitar 8ths.
- **B.** Kick four-on-the-floor, clap on 2 and 4, snare on quarters from bar 2.

**Bars 3–4 (pure build, no melody):**

- **B.**
  - **Kick out.**
  - Snare roll: 8ths in bar 3, 16ths in bar 4 (beats 1–3).
  - The snare's pitch rises +5 st and its high-pass climbs 200 → 1500 Hz across the roll.
  - Velocity rises 0.35 → 0.8.
  - A white-noise riser runs across all 4 bars, peaking about 14 dB under the kick.
- **A.**
  - **Bass out.**
  - Bb → Csus4 → C as filtered supersaw 8th stabs.
  - Vocal-chop roll on the high D ("oh"): 8ths → 16ths, pitch rising +12 st.

**Silence:** bar 4 beat 4 is dead silent for every stem. Only tails ring, and they decay (§6).

**All builds, cut 2.** The build is thin, bright noise and snare. It must not out-shine the drop:

- Supersaw build stabs have velocity ≤ 0.75 and cutoff ≤ 6 kHz.
- Chop rolls end at velocity ≤ 0.7.
- Snare rolls end at velocity 0.8.
- The riser stays about 14 dB under the kick (§9).
- The width narrows over the last 2 bars, so the drop is the moment the record opens up (§11).

### drop1: 8 bars, 128, 0:26.6 (THE POP DROP, Chainsmokers)

- **A, lead.** The composite lead: bright pop piano octaves (+12 and 0), clean electric lead guitar
  (+12, bridge pickup, chorus) and a soft saw pluck (+12). Mix them as **one** instrument.
- **A, chords.** Acoustic 16th strums **double-tracked: AC1 at L 60 % and AC2 at R 60 %** (a second
  performance; this is where drop 1's width comes from). Palm-muted electric 8ths at R 40 %. Pad pumping
  (8 dB). Piano offbeat chord stabs (pattern in §10) on **their own stem, `piano_stab`**, so the hook can be
  raised without raising the stabs.
- **A, bass.** Syncopated pop bass following the inversions: D D C A Bb Bb C A | F A G F G F A D.
- **This is the light pop drop.** It lands at 0:26.6, where a playlist listener decides to stay or skip. The
  hook is in front, and the bass is felt more than heard. Sub plus low band is at most 48 % of the energy, and
  mid plus presence is at least 33 %.
- **B.**
  - A warm, full kick with its tail at about 55 Hz.
  - Clap and snare layered on 2 and 4.
  - Offbeat closed hats, plus **an open hat on the "and" of 4 in every bar** (the lift into each bar).
  - Shaker 16ths at 54 % swing.
  - Ghost snares on the "a" of 2 and of 4.
  - **IMPACT and crash** on the downbeat. The crash is the drop's top-end payoff, so it must be audible on a
    phone (§11).
  - A 2-beat snare/tom fill in bar 8, with no gap.

### drop1b: 8 bars, 128, 0:41.6

The same hook, with a real variation and more life:

- **A.**
  - **Bars 1–4: the lead guitar sings it alone** at +12, Chainsmokers-guitar style. The pop piano stops
    doubling the tune and **answers an octave up inside the long notes**, a short fill on each held note of 4
    or more sixteenths. The pluck rests.
  - **Bars 5–8:** the full composite (piano + guitar + pluck) returns for refrain B.
  - Choir "oh" doubles the melody at 0 octave (wide, −12 dB), **bars 5–8 only**.
  - A high clean-guitar 16th arpeggio with delay at R 60 %.
- **B.**
  - Open hats replace the closed offbeats.
  - Tambourine on 2 and 4.
  - A crash on the downbeat.
  - Bar 8 ends with a downlifter and a reverb throw into verse2, with no gap.

### verse2: 8 bars, 128, 0:56.6 (the band verse)

The beat stays, with more bump than verse 1.

- **A, lead.** Clean electric **lead guitar** on the melody (neck pickup, warm, 90 ms slapback plus a
  dotted-8th delay). A soft Rhodes doubles it. From bar 5 the choir "oo" joins the melody.
- **A, accompaniment.** Rhodes comps syncopated chords (pattern in §10). Acoustic guitars are
  double-tracked L/R 80 % and strum 16ths.
- **A, bass.** House bass: sub on beat 1 plus offbeat 8ths, pumped 4 dB.
- **B.**
  - Four-on-the-floor at verse weight.
  - Clap on 2 and 4.
  - Offbeat closed hats and shaker.
  - Ghost snares.
  - A tom fill at the end of bar 8.
  - A crash on the downbeat.

### build2: 8 bars, 128→131, 1:11.6

**Bars 1–4 (the whole refrain-A hook teased):**

- **A.** Vocal chops at +12 through a low-pass opening from **1 kHz** (cut 3; was 700 Hz) to 5 kHz. Filtered
  supersaw chord 8ths underneath. Muted guitar 8th chugs.
- **B.** Kick four-on-the-floor, clap on 2 and 4, snare quarters from bar 3.

**Bars 5–8 (no melody):**

- **A.**
  - The harmony climbs **Gm7 → Bb → C → A7sus4 / A7** as rising supersaw 8th stabs. The A7 is the
    harmonic-minor dominant and pulls hard to Dm.
  - **Cut 3: the stab filter continues the build-wide sweep instead of resetting.** Cutoff
    `1600 · 3.75^((e − 32)/32)`, so it runs 1.6 kHz → 6 kHz across bars 5–8. Cut 2 restarted at 900 Hz, which
    left bars 5–6 as a muffled thud. Velocity rises 0.66 → 0.75. The 6 kHz and 0.75 caps stay.
  - Bass out after bar 6.
  - A chop roll on the high D. **Cut 3:** it starts in **8ths in bar 5** (it was quarters), v0 0.58 → v1 0.7.
- **B.**
  - **Kick roll:** quarters in bars 5–6, 8ths in bar 7, 16ths in bar 8 beats 1–2.
  - Snare: 8ths, then 16ths, then 32nds.
  - **Cut 3:** clap on 2 and 4 in bars 5–6, then on every beat in bar 7 (as build3 does in its bar 4).
  - **Cut 3:** chords lane −10 → −8 dB in bars 5–8. The stabs sat about 15 dB under the kick.
  - A noise riser across all 8 bars, plus a pitch riser in the last 4.
  - A **high-pass "bass suck"** on the music stems (all non-drum stems: bass, keys, guitars, pads,
    leads), 30 → 300 Hz across bars 7–8.

**Silence:** the last 2 beats of bar 8.

**Cut 3: build 2 must not sag.** In cut 2 it opened 2.4 LU under verse 2 (4.4 LU on a phone, because the chop
tease starts behind a 700 Hz low-pass). Bars 5–6 then fell 10 dB in the 0.8–3 kHz band. The fixes:

- The arrangement moves above.
- The chop tease's low-pass starts at 1 kHz (it was 700 Hz).
- The master lane `[[0,-1.6],[6,-2.2],[7.5,-3],[8,-3]]`.

The rules are in §6 "Build rise".

### drop2: 8 bars, 131, 1:26.4 (THE VOCAL-CHOP DROP, more bump)

- **A, lead.** Wordless chops ("ah", "oh", "ay") at +12. Add a layer at +24 (**−16 dB**, cut 3; at f0 up to 2.3 kHz
  the formants collapse into a whistle) and an "oh" layer at 0 (−6 dB). Use the re-chop stutter on the long
  notes (§3). Ping-pong throws on the held As. The chops are a round-robin sampler, not one cached slice
  (§8).
- **A, pluck double.** The pluck plays **every melody note at +12** with its natural decay (up to 0.5 s, not
  a 0.12 s tick). B sets it about 6 dB under the chops.
- **A, rhythm section.**
  - A funky muted **rhythm guitar** (chicken-scratch 16ths, centre-right).
  - Piano stabs on the tresillo.
  - A supersaw pad low-passed at 3.5 kHz that pumps hard (10 dB).
- **A, bass.** Bouncy offbeat 8ths with 16th pickups, over a sub root on beat 1.
- **B.**
  - Kick four-on-the-floor; clap and snare on 2 and 4.
  - **Open hats on the offbeats** plus accented 16th closed hats.
  - **Rim/clave tresillo.**
  - Shaker.
  - **IMPACT and crash** on the downbeat.
  - Bar 8: a 2-beat snare roll, then **silence for the last ½ beat**.

### drop2b: 8 bars, 131, 1:41.1

The bump doubles, and the hook turns into a conversation:

- **A, call and response.**
  - The chops sing each phrase head and every note shorter than 8 sixteenths, as in drop2.
  - On the **long notes** (8 or more sixteenths), the chop sings only the first 8th. The **funk guitar
    answers** in the rest of the note with a 16th lick on chord tones, ending on the held pitch.
  - This replaces drop2's re-chop stutters, which roughly halves the chop count.
- **A.** Choir "ah" chords, wide. The bass adds octave hops on the last 16th of each beat.
- **B.** Ride on the quarters. A crash on the downbeat.
- **Exit:** bar 8 ends with a big reverb throw on the last chop, a downlifter and a sub drop into the
  breakdown.

### breakdown: 8 bars, 131→134, 1:55.7 ("Od lo avdah tikvatenu", our hope is not yet lost)

- **Bars 1–4 (beatless):**
  - Grand piano solo with lush, pedalled voicings (§7), octave-doubled on the high Ds. **Brightness 0.7**
    (was 0.55). This is the emotional peak, and in cut 1 it was the darkest moment of the record.
  - Choir "oo" chords.
  - A soft high **D6 "ice" pedal** (choir soprano or bell harmonic) floats above everything.
  - **Air above the pedal:** a soft **bell ping on D7** every 2 bars, about 6 dB under the D6 pedal. Guitar
    natural harmonics on **D6 and A6** (12th- and 7th-fret nodes) with long delay. No breath or noise layer:
    it smears, and it exposes the formant voice.
- **Breakdown target:** soft but open. Presence is at least 4 % and air at least 1.5 % of the energy (cut 1:
  1.8 % and 0.6 %).
- **Bars 5–8:**
  - **The grand stays in front** (cut 3). Base velocity 0.62 (cut 2: 0.44), octave-doubled on the high Ds as
    in bars 1–4.
  - The choir moves to **"ah" and doubles the melody** (soprano), with alto and tenor harmony, **3 dB behind
    the grand** (choir_lead lane −6.5 dB, Musician B). In cut 2 the formant soprano carried the anthem almost
    alone at the record's emotional peak. That breaks the §8 exposure rule.
  - The bass **climbs F A Bb C** (bars 5–6).
  - A soft supersaw at +12 (low-pass 1.5 kHz) doubles the melody.
  - A slow clean-guitar arpeggio.
  - **B:** a half-time heartbeat kick (beats 1 and 3, low-passed 150 Hz) and a pad pulsing in 8ths
    (ghost sidechain).
- **Cut 3: dry it out enough to stay in front on a phone.** In cut 2 the hall return (−23.9 dBFS) was as loud
  as the piano carrying the tune (−24.2). Mid-band correlation was 0.20, and the section lost 1.5 LU in mono.
  - Hall sends: piano −9 → −13, strings −7 → −10, choir −3 → −6, choir_lead −5 → −8.
  - Hall return width 0.85 in the breakdown.
  - Bars 1–4: bells +4 dB and guitar harmonics +2 dB, so the music itself makes the top rather than the
    sweep (fx_sweep was 47 % of the breakdown's air).
  - It stays a lush, reverberant breakdown. The wet signal simply sits behind the dry one.
- **Tempo.** The tempo climbs 131 → 134 here, hidden by the missing beat.
- **FX.** A reverse cymbal into bar 5 and another into build3.

### build3: 8 bars, 134, 2:10.2 (the big one; sets up the key lift)

**Bars 1–4 ("Lihyot am chofshi…"):**

- **A.**
  - A supersaw lead at +12, its low-pass opening from 2 kHz **to at most 6 kHz**. This is the front.
  - The **full SATB choir "ah"**, melody in the soprano, **3 dB behind** the supersaw and piano.
  - Piano 8th chords.
  - Acoustic 8ths → 16ths.
- **B.**
  - The kick returns on quarters.
  - Claps on 2 and 4, then on every beat in bar 4.
  - Snare quarters from bar 3.

**Bars 5–8 (no melody, the lift):**

- **A.**
  - The bass **rises Bb (2 bars) → C → D major (Dsus4 → D)**, so the drop lands a whole step up in
    **E minor**.
  - Supersaw 8th stabs opening **to 6 kHz, not to full**, with velocity ≤ 0.75. The full-open saw is saved
    for the drop.
  - **Distorted power-chord guitars** on whole notes.
  - A chop roll rising an octave, ending at velocity ≤ 0.7.
- **B.**
  - **Kick roll:** 8ths in bars 6–7, 16ths in bar 8 beats 1–2.
  - Snare: 16ths, then 32nds.
  - A noise riser across all 8 bars.
  - The bass-suck high-pass in bars 7–8.

**Silence:** the last 2 beats of bar 8. A quiet vocal breath (inhale) at −24 dB is allowed in the gap.

### drop3: 8 bars, 134, E minor, 2:24.6 (THE MAIN STAGE, Tiësto)

"Kol od balevav" becomes a supersaw anthem: a classical tune in long notes over a pounding big-room beat.

- **A, lead.** A 9-voice supersaw lead at +12, plus a 0-octave layer at **−10 dB** (it is a low-mid layer
  the piano already covers), with piano octaves for attack. Brighter than cut 1 (§9), with a quiet noise-air
  layer, so drop 3 gains shimmer at the top instead of more mids.
- **A, strings.** One **sustained legato line** on the melody at +12, on the long notes only (≥ 4
  sixteenths, §9). **Never at −12**: that octave sits right on the bass harmonics.
- **A, choir.** "ah" chords, wide.
- **A, guitars.** Distorted power chords double-tracked L/R 100 %, sustained.
- **A, bass.** The lament bass **E D C B A G | B E** as a **rolling big-room bass** over a sub. **Cut 3:**
  the sub stem in drop3/3b/3c uses `pcAtOrAbove(pc, 28)`, so the tonic is on **E1 (41.2 Hz)**. Every other
  note is unchanged: D2, C2, B1, A1 and G1. The +12 mid layer stays on the old register, so phones still hear E3.
- **B.**
  - **The big-room kick, cut 3: tail tuned to the TONIC, E1 = 41.2 Hz** (cut 2: B1 = 61.7 Hz, the 5th).
    - Envelope: hold 0.12 → **0.03 s**, tau 0.27 → **0.13 s**. Keep the "tok", the click and the drive.
    - Reason: in cut 2 the held B1 tail was the strongest note under every chord. It sat a semitone under the
      C bass (beating at 3.7 Hz), a whole tone over A, and a fifth under every tonic bar. That made the
      60–65 Hz band a one-note boom 8.5 dB over 1 kHz.
    - Shortening alone moves the B1 component only about 2.6 dB (producer sim). Retuning fixes the rub
      itself: on tonic bars, the kick and the sub now play the same note, the classic big-room way.
  - Kick and sub levels follow the §14 sub-band rows (sub share 18–26 %), not fixed offsets. The final drop
    must be bigger at the bottom, not only in the mids.
  - Clap and snare on 2 and 4.
  - Offbeat open hats and 16th closed hats, **plus straight 16th shaker** (it was missing from drop 3 in
    cut 1).
  - Crash on bars 1 and 5.
  - **IMPACT, sub drop and crash** on the downbeat.

**Silence:** the last beat of bar 8. This is the double-drop gap, and the held E is cut there.

### drop3b: 8 bars, 134, 2:38.9 (THE DOUBLE DROP)

The call (E, then high E three times) with everything:

- **A.**
  - The supersaw lead, plus **drop 2's vocal chops at +12 as an answer, not a unison**. On the long notes
    (≥ 8 sixteenths) the chops stutter in 8ths **from the second 8th of the note**, under the held saw. They
    are silent on the short notes.
  - Choir.
  - **Bells at +24.**
  - Muted guitar 16th chugs.
  - The bass rolls with octave hops.
- **B.**
  - Ride on the quarters (+2 dB on cut 1).
  - Shaker 16ths, straight.
  - Crash every 4 bars.
  - **IMPACT** on the downbeat.
  - A 2-beat snare fill in bar 8, with no gap.

### drop3c: 8 bars, 134, 2:53.2 (THE DROPS UNITE THROUGH THE PIANO HOOK)

The three drops unite through **one** element: **drop 1's pop-piano octaves return at +12** on top of the
supersaw, with the same grid timing. The piano is the record's first voice, so it closes the circle. Drop3c
does not add midrange layers. It escalates from the **top** and the **bottom**:

- **A.**
  - **Drop 1's pop-piano octaves** at +12, σ 0 against the supersaw.
  - A high **16th pluck arpeggio at +24**, sparkling above the wall rather than inside it (§9).
  - A **high E6 pedal** on bells and choir.
  - **Out of drop3c:** the lead guitar and the acoustic strums. They become low-mid mush under the wall.
  - Chops: as drop3b (an answer in the long notes).
- **B.**
  - **Top:** shaker 16ths, ride, and a **crash every 2 bars**. The claps add the "and" of 4.
  - **Bottom:** kick and sub as drop3 (tonic-tuned, §7).
  - Short-term max ≤ −7.8 LUFS. Presence ≥ 9 % of the energy.
  - **Cut 3: the bottom is counted as sub + low.** Sub + low must be at least the mid share + 10 points, and
    the mid band ≤ 34 %.
    - Why the change: the tonic-tuned kick and the E1 sub move energy from the "low" band (60–250 Hz) into the
      "sub" band (< 60 Hz) on purpose, so "low ≥ mid" would punish the fix.
    - The kick boom was about 30 % of drop 3's energy. Shrinking it lifts every other band's *share* by about 4
      points without adding a midrange note, so the fatigue cap moves from 32 % to 34 %. That is still well
      under cut 1's stacked 37.6 %.
    - Cut 1 failed the old rule because the final drop got louder from mid density while its sub thinned. That
      remains the thing to avoid.
- **Final half-bar.** It is a **deceptive cadence**: B7 → **Cmaj7** under the held E (the score writes
  `Bbmaj7`, transposed +2). A crash lands on beat 3, then a reverse swell runs into the tag. **The drums
  stop after that beat-3 hit.**

### tag: 2 bars, 134→100 ritardando, 3:07.6

The last line again, **broadening**, as the anthem is traditionally sung.

- **No kick, hats or claps.** Each half-bar chord is **one big sustained hit**: supersaw chords, piano,
  choir "ah", strummed guitars, and a deep tom or timpani-like sub boom. The hits run Am7 → Em/G → B7.
- The **FINAL HIT** lands exactly on the melody's last note (bar 2 beat 3): Em(add9) with crash, impact
  and sub drop.
- The melody is on the supersaw lead +12 and piano octaves, with the choir soprano 3 dB behind them.
  The strings may hold the tune's long notes at +12 (never at −12) and voice the final chord.
- **Cut 3: the tag is broad, not swimming.** In cut 2 the hall return (−19.2 dBFS) was the loudest signal in
  the tag, above the lead (−21), and the tag lost 1.6 LU in mono.
  - Tag hall sends: piano −9 → −13, choir −3 → −6, choir_lead −5 → −8, strings −7 → −10, chords −10 → −14.
  - Hall width 0.85 in the tag.
  - The outro sends stay as they are, so the ring-out after the final hit is still lush.
  - Pass: the hall return is at least 4 dB under the lead stem, and mono loss is ≤ 1 LU.

### outro: 2 bars, 100, 3:11.7 (ring-out)

- No new attacks. The final Em(add9) sustains; do not retrigger it from `chordAt`.
- Every reverb and delay tail decays to digital silence by 3:16.5. The last 200 ms must be below
  −60 dBFS. A 50 ms fade on the final samples is fine as a safety.

---

## 5. Drop design summary

| | Drop 1: pop | Drop 2: vocal chop | Drop 3: main stage |
|---|---|---|---|
| Lead | piano + clean lead guitar + soft pluck (1b: guitar alone for 4 bars) | wordless round-robin chops (+12/+24/0) + pluck double; 2b: chops call, guitar answers | 9-voice supersaw +12 (0-octave −10 dB) + legato strings on long notes (+ chop answers + bells in 3b, + drop-1 piano callback in 3c) |
| Chords | acoustic strums, muted electric, warm pumped pad, piano offbeat stabs | supersaw pad LP 3.5 kHz pumping 10 dB, piano tresillo stabs, funk scratch guitar | supersaw wall (2 octaves, wide), distorted guitars L/R, choir |
| Harmony | `DROP_POP`: inversions, maj7 (melodic bass) | `DROP_CLUB`: root position + 7ths | `DROP_BIG`: plain triads + A7; E minor; deceptive ending |
| Bass | syncopated pop `x..x..x...x..x..` | bounce `..x...x...x..xx.` + sub on 1 | rolling `.xxx.xxx.xxx.xxx`, octave hops in 3b/c |
| Kick | warm, tail 55 Hz, tau 0.13 s (cut 3) | punchier, more click, tau 0.13 s (cut 3) | big-room: tok layer, distorted tail **tuned to the tonic E1 (41.2 Hz)**, hold 30 ms, tau 0.13 s (cut 3) |
| Hats/perc | closed offbeats + open hat on the "and" of 4, swung shaker, ghosts; open hats + tambourine in 1b | open offbeats, accented 16ths, rim tresillo; + ride in 2b | open offbeats, 16ths, **shaker 16ths**, ride, crash every 4 bars (every 2 bars in 3c) |
| Width | medium, from the hard-panned acoustic double | wide pad, centre chops | widest: L/R distorted doubles and natively spread supersaws. Nothing is widened past 1.1–1.3 by M/S (§11) |
| Target short-term loudness | −9.5 LUFS | −9.0 | −8.5 → −8.1 (3c ST max ≤ −7.8) |

---

## 6. Builds and the silence

| | build1 (4 bars) | build2 (8 bars) | build3 (8 bars) |
|---|---|---|---|
| Melodic tease | call, 2 bars (vocal chop +12, LP 900 Hz → 6 kHz) | refrain A, 4 bars (chops +12, LP 700 Hz → 5 kHz) | refrain B', 4 bars (full choir + supersaw) |
| Harmony to drop | Bb → Csus4 → C → **Dm** (Aeolian VI–VII–i) | Gm7 → Bb → C → A7sus4/A7 → **Dm** (dominant pull) | Bb → C → Dsus4/D → **Em** (rising whole steps = key lift) |
| Kick | 4/4 for bars 1–2, then out | 4/4 → roll: quarters, 8ths, 16ths | quarters → roll: 8ths, 16ths |
| Snare roll | quarters (bar 2) → 8ths → 16ths | quarters (bar 3) → 8ths → 16ths → 32nds | quarters (bar 3) → 8ths → 16ths → 32nds |
| Risers | noise 4 bars | noise 8 bars + pitch riser 4 bars | noise 8 bars + pitch riser 4 bars + choir crescendo |
| Riser peak (cut 2) | −30 → −16 dB (≈ −14 re kick), width ≤ 0.6 | same | same |
| Master gain lane (cut 3) | −3 → −3.5 dB at the gap (no crescendo; unchanged) | `[[0,-1.6],[6,-2.2],[7.5,-3],[8,-3]]`: starts near verse 2, last bar unchanged | `[[0,-4.2],[6,-3.2],[7.5,-3.5],[8,-3.5]]`: rises to bar 6, end-points unchanged |
| Bass suck (HP 30 → 300 Hz) | none | bars 7–8 | bars 7–8 |
| **Silence** | **1 beat** | **2 beats** | **2 beats** (+ optional breath) |
| Drop downbeat | impact + crash | impact + crash | impact + sub drop + crash, in the new key |

**Rules for the silence:**

- **Every stem stops dead** at the silence start, or with a fade of no more than 5 ms.
- Reverb and delay **tails decay; they do not swell**. A short tail in the first ~100 ms of the gap is the
  "air". After that, the gap must be close to silent, or the hard stop does not register. In cut 1 the build3
  gap opened at −15 dBFS in the file, a wash only ~8 dB under the drop.
- **Gap level, measured on the final WAV:** every 50 ms RMS in the **second half** of each window is at or
  below **−30 dBFS**. The exceptions are the build3 window (−28, for the breath) and the half-beat drop2
  window (−27, too short to decay fully). The report's "master max" column is measured before the master
  drive, so it reads about 5 dB quieter than the file. Use the file.
- Tools: the hall swell peaks at −24 / −22 / −22 dB (build1/2/3). The hall and plate returns duck 12 dB
  from the gap start to mid-gap, then come back on the drop downbeat. The hall is high-passed at 500 Hz
  inside the window.
- No riser plays through the gap.
- Nothing pre-empts the downbeat: no pickups, except the allowed breath.
- The drop downbeat then hits **everything at once**: kick, bass, lead, chords, crash and impact on the
  same sample.

### Drop delta (cut 2, hard rule)

Cut 1's builds ended 3–4 LU louder and 5–10 dB brighter than the drops they set up. Its loudest moment was
the end of build2, not a drop. From cut 2, every build-to-drop transition must pass these four checks:

| Check | Rule | Cut 1 (b1 / b2 / b3) |
|---|---|---|
| Build ceiling | build's last bar (the 4 beats before the gap), momentary max **≤ next drop's mean − 1 LU** | −6.0 / −4.9 / −5.0 vs drops −9.5 / −8.9 / −8.0 |
| Build floor | the same value **≥ drop mean − 4 LU**, so the build still rises | – |
| Drop lands | drop bar 1 mean momentary **≥ build last-bar mean + 1.5 LU** | −9.3 vs −8.2, −8.8 vs −5.9, −7.8 vs −5.9 |
| Gap | second half ≤ −30 dBFS (build3 −28) | −25.3 / −27.6 / −19.3 |
| Payoff on a phone | drop's first 4 s vs the build's last 2 s (L+R band level): **presence ≥ −2 dB, air ≥ −4 dB** | presence −7.9 / −8.2 / −5.3, air −10.0 / −9.1 / −9.7 |

Re-drops (drop2 → drop2b, drop3 → drop3b) need only the gap rule and "bar 1 ≥ the previous bar".

The song's **momentary and short-term maxima must fall in drop3b, drop3c or the tag's final hit.**

**How to get there** (Musician B leads; the numbers are in `SESSION-2.md`):

1. Remove the master crescendo into the gap.
2. Bring the riser down to about −14 dB re the kick and narrow it.
3. Cap the snare-roll, chop-roll and stab velocities, and cap the stab cutoff.
4. Narrow the music bus over the last 2 bars, then open it on the downbeat.
5. Put the top end into the drop (crash, hats, shaker, air) instead of the build.

Re-measure after steps 1–3, and stop cutting as soon as the build sits 1–2 LU under the drop.

### Build rise (cut 3, hard rule)

Cut 2 fixed the ceiling but left the window under it unused. Build 2 opened 2.4 LU under verse 2 and then sagged
in bars 5–6 (per bar: −13.1, −12.5, −12.3, −12.0, −13.3, −13.0, −11.8). Build 3, "the big one", was flat at
about −11.3 and no louder than the breakdown's last bar. A build that does not build is the opposite of the
family's "keeps building". Every row is measured per bar on the final WAV (`drop-check-3.mjs` §5):

| Build | Rule | Cut 2 |
|---|---|---|
| build2 | bar 1 mean ≥ verse 2 mean − 2 LU, and on the phone sim ≥ verse 2 − 3 LU | −2.4 LU / −4.4 LU |
| build2 | bar 7 ≥ bar 1 + 1.5 LU; no bar in 1–7 more than 0.3 LU under the bar before | +1.3 LU; bar 5 −1.3 |
| build2 | bars 5–6 mean 0.8–3 kHz band within 4 dB of bars 3–4 | 10 dB under |
| build3 | max(bar 5, bar 6) ≥ bar 1 + 1.5 LU; no bar in 1–6 more than 0.3 LU under the bar before | +0.7 LU |
| build3 | max(bar 5, bar 6) ≥ the breakdown's last bar + 0.5 LU | +0.1 LU |

Build 2's bar 8 and build 3's bars 7–8 carry the bass suck, so the low end drains out and the level may flatten
there.
The drop-delta ceiling, floor and "drop lands" rules above are unchanged.

**If the rules conflict, they rank in this order:**

1. The drop-delta ceiling and "drop lands".
2. The bars 5–6 mid band.
3. The rise.
4. The build-2 start level.

Do not buy the rise with a master crescendo into the gap. That is what made cut 1's builds louder than its drops.
The rise comes from the arrangement: the stabs opening, the chop roll in 8ths, the claps and the chords lane.

---

## 7. Harmony: reharmonisation, voicings, bass lines

The tune stays recognisably in D minor with the anthem's harmonic-minor V (A major, with its C#). The
reharm adds colour (add9, maj7, sus, inversions, pedals) without fighting the melody.

**Verification.** A Node check confirmed that every melody note on a strong beat is a chord tone or a
9/11/13 tension. The only non-chord tones are the anthem's own 8th-note passing tones:

- the Bb in "C D C Bb"
- the D and F in the cadence figure "E D E F"

### Chord plans (one symbol per half-bar, as in `score.js`)

**Verse** (bars 0–7) uses the **lament bass**: the upper structure stays around Dm while the bass walks
down.

```
| Dmadd9  Dm7/C | Bbmaj7  Dm/A | Gm7  Dm/F | A7sus4  Dm |      bass: D  C | Bb A | G F | A D
| Dmadd9  Dm7/C | Bbmaj7  Dm/A | Gm9  Dm/F | A7      Dmadd9 |  (second time: Gm9, and a real A7 with its C#)
```

`Bbmaj7` replaces the anthem's Gm; it is Gm9 without its root.

**Refrain, three flavours:**

```
POP  (drop1):    | Dmadd9 Dm | C F/A | Bbmaj7 Bbmaj7 | C F/A | F F/A | Gm7 F | Gm7 Dm/F | A7 Dm |
                   bass:  D D | C A | Bb Bb | C A | F A | G F | G F | A D
CLUB (drop2):    | Dm Dm | C F | Bbmaj7 Bbmaj7 | C F | F F | Gm7 F | Gm7 Dm | A7 Dm |
BIG  (drop3b/c): | Dm Dm | C F | Bb Bb | C F | F F | Gm F | Gm Dm | A7 Dm |   (drop3c ends A7 -> Bbmaj7, deceptive)
```

**Breakdown** (refrain A + B):

```
| Dmadd9 Dm7 | C F/A | Bbmaj7 Gm7 | C7sus4 F | Fadd9 F/A | Gm/Bb F/C | Gm7 Dm/F | A7 Dmadd9 |
  bass: D D | C A | Bb G | C F | F A | Bb C | G F | A D
```

Bars 5–6 climb F A Bb C under "Lihyot am chofshi". This is the emotional lift.

**Builds, intro and tag:**

| Section | Chords |
|---|---|
| intro | Dmadd9 Dmadd9 \| Gm7 A7 |
| build1 | Dm Dm \| C F \| Bb Bb \| Csus4 C |
| build2 | (refrain A) \| Gm7 Gm7 \| Bb Bb \| C C \| A7sus4 A7 |
| build3 | F F/A \| Gm/Bb F/C \| Gm7 Dm/F \| A7 Dm \| Bbadd9 ×4 \| Cadd9 Cadd9 \| Dsus4 D |
| tag (+2) | Am7 Em/G \| B7 **Em(add9)** |
| outro | Em(add9) held |

### Signature voicings

**Drop register.** The lead owns D5–D6, so chord stacks keep their top voice at A4 or below. MIDI
numbers, D minor; add 2 for E minor.

| Symbol | Pad / supersaw upper structure | Notes |
|---|---|---|
| Dm(add9) | A3 D4 **E4 F4** A4 (57 62 64 65 69) | The E–F cluster is the Chainsmokers/Coldplay colour. |
| Dm7/C | A3 C4 E4 F4 (57 60 64 65) | Dm9 shell over the C bass. |
| Bbmaj7 | A3 D4 F4 (57 62 65), Bb only in the bass | A Dm triad over Bb. Keep the line-cliché smooth. |
| Dm/A, Dm/F, Dm | A3 D4 F4 (57 62 65) | The upper structure does not move; only the bass walks. |
| Gm7 / Gm9 | Bb3 D4 F4 (A4) (58 62 65 69) | Voice it with A4 for Gm9. |
| A7sus4 → A7 | G3 D4 E4 → G3 **C#4** E4 (55 62 64 → 55 61 64) | Keep C# audible; it is the anthem's colour. Shell voicing; no high E on top. |
| C / Cadd9 | G3 C4 E4 G4 (+D4) | |
| F / F/A / Fadd9 | A3 C4 F4 (G4) A4 | |
| Bb / Bbadd9 | F3 Bb3 C4 D4 F4 | |
| C7sus4 | G3 Bb3 C4 F4 | |
| D (build3 end) | F#3 A3 D4 F#4 A4 | Bright, triumphant. The major third is the surprise. |

**Verses.** The piano's right hand plays the melody as the top voice and adds one or two upper-structure
tones *below* the current melody note (3rds and 6ths under it). The left hand plays the bass line in
octaves **from E2 up** (lowest LH note ≥ MIDI 40), never on the sub's own F1–D2 notes. The pad and choir sit
in A3–F4, low-passed and quiet.

**Guitar shapes** (concert-pitch MIDI, low to high). `theory.guitarVoicing()` may also be used.

| Chord | Shape | MIDI |
|---|---|---|
| Dm(add9) | xx0230 | 50 57 62 64 |
| Dm | xx0231 | 50 57 62 65 |
| Gm | 355333 | 43 50 55 58 62 67 |
| A7 | x02020 | 45 52 55 61 64 |
| C | x32010 | 48 52 55 60 64 |
| F | 133211 | 41 48 53 57 60 65 |
| Bb | x13331 | 46 53 58 62 65 |
| Bbmaj7 | x13231 | 46 53 57 62 65 |

In **E minor** the guitar opens up:

- **Em(add9):** 024000 = E2 B2 F#3 G3 B3 E4 (40 47 54 55 59 64). Use this for the final strum: open
  strings ring for seconds.
- **Em:** 022000.
- **Am7:** x02010.
- **B7:** x21202.
- **C:** x32010.
- **D:** xx0232.

### Bass register

- Keep sub fundamentals between **40 and 75 Hz**.
  - **D minor:** `pcAtOrAbove(pc, 29)` gives F1–E2. The lament's notes F1 (44 Hz) to D2 (73 Hz) all fall
    inside the range.
  - **E minor (drop3/3b/3c, cut 3):** `pcAtOrAbove(pc, 28)` gives E1–D#2. That puts the tonic on **E1
    (41.2 Hz)**; D2, C2, B1, A1 and G1 are unchanged.
  - Cut 2's brief said the E-minor lament "bottoms out at G1". That was true, but it hid that the tonic E sat at
    E2 (82.4 Hz), outside the range. So every tonic bar of the final drop had no sub fundamental except the
    kick's B1.
  - The tag already drops its final E an octave to E1.
  - `cues.subFloorMidi` records the floor per key.
- The mid or harmonic layer plays an octave above so phones hear the line. In E minor it stays on the old
  register (`pcAtOrAbove(pc, 29) + 12`, so E3).

### Low-end pitch (cut 3, hard rule)

The kick's tail is a pitched note, and it is the loudest one in the record. In cut 2 the drop 1–2 kick sat
on A (the 5th of D minor) and the drop 3 kick on B (the 5th of E minor). The 5th was my rule, and it was wrong
for progressions full of bVI chords: Bb in D minor and C in E minor sit a semitone above the 5th. Measured with
one 1.49 s FFT per bar on the cut-2 WAV:

- **Drop 3:** the B1 tail was the strongest component under 100 Hz in every bar. It sat 2–5 dB *over* the C2
  bass on C bars (beating at 3.7 Hz), and 6–12 dB over the E on tonic bars.
- **Drops 1–2:** the A1 tail sat over the Bb1 bass on Bb bars, and 11 dB over the D2 tonic in drop 2.

**Kick tuning, cut 3:**

| Kick | Tail | Envelope | Why |
|---|---|---|---|
| big-room (drop3/3b/3c) | **E1 = 41.2 Hz, the tonic** | hold 30 ms, tau 0.13 s; tok, click and drive kept | kick and sub share the tonic; no rub with any lament note (G1 is 3 st away, D2 10 st) |
| pop (drop1/1b, verse2) | A1 = 55 Hz (unchanged) | tau 0.17 → **0.13 s** | D1 (37 Hz) is below the range and D2 (73 Hz) is too high for a full kick |
| club (drop2/2b, builds) | A1 = 55 Hz (unchanged) | tau 0.20 → **0.13 s** | as pop |

In D minor the sub duck releases faster in the drops (0.12 → 0.09 s), so the sub is back by the 2nd 16th.

**Rules,** measured by `drop-check-3.mjs` §3 (one 65536-point Hann FFT of the Mid channel per drop bar):

| Drops | Rule |
|---|---|
| drop3 / 3b / 3c (E minor) | A kick-tail component within 2 semitones of the bar's sub note must sit **≥ 6 dB under** it. On tonic bars, the **tonic fundamental (E1 or E2) is the strongest component in 30–100 Hz**. |
| drop1 / 1b / 2 / 2b (D minor) | On Bb bars the 55 Hz component is **no louder than the Bb1 sub**. In drop2/2b, on Dm bars, **D2 is within 6 dB** of the 55 Hz component. Drop 1 is the light pop drop, so its Dm bars are reported only: the kick is its low end by design. |

**Sub band (drop 3).** The tonic-tuned kick moves energy from 60–65 Hz to 41 Hz, so watch the sub band:

- sub share 18–26 % in drop3/3b/3c
- sub band ≤ low band + 2 dB
- limiter max gain reduction ≤ 2 dB

**Fallback.** If those three cannot all hold with the kick lane at or above −11 dB, keep the B1 tuning instead
and make the kick short: hold 10 ms, tau 0.08 s, drive 2.4. Also set the D3 sub duck release to 0.08 s. The
rolling bass then carries the weight. My sim puts this about 1–2 dB short of the 6 dB rule on C bars, so it is
second choice, and it must still pass §3. Record which one shipped.

### Pedal points

- **High tonic "ice" pedal:** D6 in the breakdown (bars 1–4) and E6 in drop3c.
- **Dominant pedal:** A2 under build2 bars 7–8 (the bass is out; a quiet sub A under the riser is fine).

---

## 8. Vocal plan (all wordless)

**Why wordless?** Intelligible synthesized lyrics would expose formant synthesis in the most exposed
place, and they are the fastest route back to "cheap game". These records carry their vocals as
**choirs** (stacked, wide, reverbed, forgiving) and **chops** (short, pitched and processed, so they are
meant to sound unnatural). The anthem's words still hang over the record through the section *titles*
(the family knows them), not through sung text.

### 1. Choir ("ah", "oh", "oo"). Stem `choir`.

- **Parts.** SATB, 4 voices per part (16 voices):
  - soprano and alto use female formants
  - tenor uses male formants ×1.05
  - bass uses male formants ×0.95
- **Glottal source.** Band-limited saw or Rosenberg pulse with −12 dB/oct tilt, plus aspiration noise at
  −30 dB modulated at f0.
- **Vibrato.** 5.2–5.8 Hz, ±20–35 cents, fading in over 250 ms on long notes. Rate ±0.3 Hz random per
  voice.
- **Variation per voice.** Jitter 0.3 %, shimmer 3 %, detune ±10 cents, timing spread 0–25 ms.
- **Formants.** Three bandpass resonators (F1–F3), plus a "singer's formant" peak of +6 dB at 2.9 kHz
  so the choir cuts on phones.

| Vowel | Male F1/F2/F3 (Hz) | Female F1/F2/F3 (Hz) | Bandwidths |
|---|---|---|---|
| ah /a/ | 730 / 1090 / 2440 | 850 / 1220 / 2810 | 80 / 100 / 160 |
| oh /o/ | 570 / 840 / 2410 | 590 / 920 / 2710 | 80 / 100 / 160 |
| oo /u/ | 300 / 870 / 2240 | 370 / 950 / 2670 | 70 / 100 / 150 |
| ay /ɛ/ | 530 / 1840 / 2480 | 610 / 2330 / 2990 | 80 / 110 / 170 |

- **Formant tuning.** When f0 exceeds F1 (high soprano notes), raise F1 to about 1.1 × f0, as real
  sopranos do.
- **Envelope.** Attack 150–300 ms, release 400–600 ms. Vowel morphs (oo → ah) glide over 300 ms.
- **FX.** HP 180 Hz, hall 2.8 s at 35 % wet, sidechain 5 dB in drops.
- **Where it plays:**
  - pad: intro, verse1, verse1b
  - melody unison: verse1b, verse2 from bar 5
  - "oh" melody: drop1b
  - chords: drop2b, drop3 (all)
  - SATB with the melody in the soprano: breakdown bars 5–8, build3, tag

### 2. Vocal chops ("ah", "oh", "ay"). Stem `chops`.

- **Voices.** One voice, or two detuned ±6 cents, with female formants shifted **+3 semitones**
  (×1.19). This is the bright, pitched-up EDM chop colour.
- **Envelope.** Attack 4 ms. Decay to 70 % over 60 ms. Release 40 ms. Gate at 80 % of note length,
  except long notes.
- **A sampler, not a loop (cut 2).** Cut 1 sliced one cached sustained vowel per pitch at 0.10–0.16 s,
  before the vibrato starts. That gave about 135 near-identical steady formant tones per drop half: the
  talking-toy risk. From cut 2:
  - **3–4 round-robin sources** per (pitch, vowel), each with its own seed and a formant shift of ±3 %.
  - **Random slice offsets of 0.08–0.6 s**, so stutters and long notes catch the vibrato.
  - **±8 cents** of random tuning per chop.
  - A **vowel drift** on held chops: "ah" moves toward a schwa over about 200 ms.
  - A **soft "h" breath onset** on phrase-initial chops. No hard consonants.
  - The +24 layer at −16 dB (cut 3; it was −14).
- **Pitch.** A **scoop** from −70 cents to pitch over 30 ms on every chop: this is what makes it read as
  a voice. Add 5.5 Hz vibrato on notes longer than ½ beat.
- **Edge.** A 3 ms noise transient (BP 3 kHz) gives the "chopped" edge.
- **Syllables:**
  - the three high Ds of the call: "oh – ah – oh"
  - long notes: "ah" (stuttered in drop 2)
  - 8th-note runs: alternate "ay / ah"
  - cadence notes: "oh"
- **Chain:** tanh drive 1.5 → HP 300 Hz → +2 dB at 3 kHz → plate 1.3 s at 15 % → ping-pong dotted-8th
  delay at 20 % (feedback 35 %, HP 400 Hz, LP 6 kHz), sidechain 3 dB.
- **Where it plays:** intro (airy, quiet), build1, build2 (teases and rolls), **drop2 (lead, pluck
  double), drop2b (the call; the guitar answers)**, and drop3b / drop3c (answers inside the long notes only).

**Exposure rule (cut 2, widened in cut 3).** Nobody can hear whether the formant voices read as human or as a
vocoder, so **no synthesized voice carries a melody alone, anywhere in the record**:

- The drop2 chops are doubled by the pluck.
- In build3 and the tag, the choir soprano sits 3 dB behind the supersaw and piano.
- In drop1b, the choir "oh" plays only as a −12 dB double in bars 5–8.
- **In breakdown bars 5–8 (cut 3), the grand carries the tune and the choir soprano sits 3 dB behind it.**

**Chop treble (cut 3).** The treble boosts stacked up. The Voice engine already adds +13 dB at 2.7 kHz and a +13
dB shelf at 5.5 kHz. The chops strip, the leads bus and the exciters added about +6 dB more above 3 kHz, on a
soprano formant-shifted +3 st that is the loudest musical stem in drop 2. That is a whistle and talking-toy
risk. The fixes:

- Chop strip: the 7 kHz shelf goes +2.5 → +1 dB, and the exciter 0.18 → 0.1.
- The +24 layer goes −14 → **−16 dB**. If anything else has to give, it goes first.

**Visual check of the chops (cut 3).** Render `--only vocals --from drop2 --to drop2b` and read the spectrogram.
F2 and F3 should drift: round-robin formants ±3 %, vowel drift on held chops, and vibrato after about 0.25 s.
Ruler-straight formant lines across successive chops read as a vocoder. If you see them, Musician B lifts the
pluck double from about 5.3 dB to about 3 dB under the chops.

### 3. Breath (optional). Owner: A or B.

- **Sound.** Pink noise through BP 1.2 kHz (Q 0.8) plus BP 2.6 kHz. Attack 350 ms, release 80 ms, level
  −24 dB.
- **Where.** Only in the build3 silence.
- **Fallback.** If it looks like a noise smear on the spectrogram, drop it.

**No "hey!" shouts.** Synthesized gang shouts are a cheapness risk.

---

## 9. Sound-design recipes

These are starting numbers. Use the engine's DSP, for example `supersaw({ voices, detune, mix, spread })`,
the SVF, biquads, `adsr`, `lfo`, `vibrato` and `humanize`.

### Musician A

**Grand / pop piano** (stem `piano`). Additive or modal synthesis:

- **Partials.** 12–16 partials, up to 10 kHz. f_n = n·f0·√(1 + B·n²), where B ≈ 0.0002 at C4, doubling
  per octave up and ×0.6 per octave down.
- **Amplitudes.** a_n ∝ n^−1.1 · |sin(π·n·0.12)| (the hammer at 1/8 of the string notches partial 8).
- **Brightness.** Brightness by velocity: × e^(−(n−1)(0.35−0.25·vel)).
- **Two-stage decay** per partial, which gives the coupled-string "prompt then aftersound" shape:
  - τ_fast 0.6–1.2 s, then τ_slow 4–10 s (longer in the bass)
  - τ_n = τ/(1 + 0.25(n−1))
- **Strings.** 3 strings in the treble (0, +0.7, −0.5 cents), 2 in the mid, 1 in the bass.
- **Hammer.** An 8 ms noise thump (LP 1.5 kHz, −24 dB) plus a 90 Hz board thump of 30 ms.
- **Damper.** τ 80 ms; the pedal holds notes through the chord.
- **Pan.** Pan by pitch: (midi − 64)/48 × 0.5.
- **Variants:**
  - *Felt* (verse1): LP 2.5 kHz, attack 6 ms, +30 % hammer noise. **Cut 2:** pass `brightness: 0.6` to the
    felt Piano (the engine default for felt is 0.3). That lifts the hammer cutoff about 29 %, the same effect as
    raising the engine's felt multiplier from 0.38 to 0.49, without an engine change, so the verse melody keeps
    its definition on a phone. Mix: HP 90 Hz in the verses, −3 dB at 300 Hz (Q 1).
  - *Grand, breakdown bars 1–4:* brightness 0.7.
  - *Pop-bright* (drops): +3 dB shelf at 3 kHz, 4:1 fast compression, HP 180 Hz. The drop1 offbeat stabs
    play on their own stem, `piano_stab`.

**Piano realism (cut 3, P0, Musician A in `instruments/a-piano.js`).** The engine's modal `Piano` has these
gaps:

- two components per partial (prompt + aftersound) and no third string
- no soundboard
- no key-off or damper noise

The piano is the record's first voice: 0:00–0:19 is piano-led with nothing else within about 4 dB, and the
game replays from the top on every launch. It also carries the breakdown and half of the drop 1 and drop 3c
hooks. The family will judge "cheap game" here first.

The Engineer did not deliver this in round 2 (request E2), so Musician A builds it as a Musician-owned
instrument. If the Engineer ships the same model inside `engine/inst/keys.js` first, use that instead. **Never
stack both.** The spec:

1. **`APiano`:** a fork of the engine `Piano` with the same options and `render(note) → [L, R]`. Keep its
   inharmonicity, stretch tuning, hammer spectrum, damper and pedal. Every piano voice uses it: felt, grand,
   grandOpen and pop (so `piano`, `piano_pop` and `piano_stab`).
2. **Three strings in MIDI 45–88.** Each partial gets three damped sinusoids, one per string.
   - String detunes: {0, +d1, −d2} cents, with d1 and d2 drawn per note from 0.5–1.5 (seeded).
   - Each string's T60 is ×(1 ± 0.08).
   - Keep the prompt/aftersound split across the strings, so the beating and the two-stage decay come from
     the unison, as in a real piano.
   - Below MIDI 45, keep two strings. Above 88, use three, with no damper as now.
3. **Soundboard.** 28 modes, log-spaced from 60 Hz to 3 kHz with ±8 % seeded jitter, Q 15–40, T60 150–250 ms.
   - Precompute one 0.25 s stereo IR per register band, 6 bands: ≤ 44, 45–56, 57–68, 69–80, 81–92 and ≥ 93.
     Weight each band's modes towards that band's own register.
   - Convolve the first 250 ms of each note, including the hammer pulse, with its band's IR. Use the engine
     FFT; about 1,600 piano notes at 32,768 points is a few seconds.
   - Mix the result about 12 dB under the dry note (−15 dB on the pop piano, whose chain is already bright).
   - Equivalent and cheaper: render each band's notes into a band buffer with `bake` and run a 28-resonator
     bank over it. The body is linear, so per-band processing is the same filter.
4. **Key-off and damper noise.** At every damped note-off (not under the pedal, MIDI < 89), add 40–80 ms of
   band-passed noise at about **−35 dB re the note's peak**.
   - The centre runs from 300 Hz in the bass to 1.5 kHz in the treble, Q about 1.
   - Add a 15 ms felt "thup" (LP 400 Hz).
   - At each pedal change (the KeyBed's chord-end pedal), add one damper-release swish at about −38 dB re the
     chord.
5. **Hammer return.** A 20 ms LP 250 Hz thunk, 25–40 ms after the attack, at about −30 dB re the note. Use it
   on the felt tone, and at −36 dB on the grand.
6. **Gain-matched.** Each piano stem's per-section RMS stays within ±1 dB of cut 2, so the mix.js levels still
   hold.

**Acceptance:**

- `render --to verse1b --only keys`: the spectrogram shows a dense 100–2500 Hz bloom on every chord, decaying
  over about 200 ms.
- Verse low-mid ≤ 30 % still holds.
- The keys part runs in ≤ 45 s. Parts render in parallel: cut 2's keys took 23.5 s, while vocals at 60.3 s set
  the pace, so this costs no wall-clock time below that.
- No new mixer inserts or stems for it.

**Rhodes** (stem `rhodes`). FM:

- Carrier 1 : modulator 1, index 3.0 → 0.8 (τ 0.25 s, scaled by velocity).
- A tine partial at ratio 14 (−24 dB, 25 ms decay) for the "ding".
- Attack 2 ms, decay τ 1.5 s, release 120 ms.
- Tremolo/auto-pan at 4.8 Hz, ±30 %.
- tanh drive 1.3, then chorus.

**Warm pad** (stem `pad`):

- `supersaw` with 5 voices, detune 0.18, mix 0.5, spread 0.7.
- 24 dB low-pass at 2.2 kHz in verses and 3.5 kHz in drops, Q 0.5, with an LFO at 0.1 Hz (±15 %).
- Attack 400 ms, release 1.2 s. HP 200 Hz. Chorus.

**Supersaw lead** (stem `lead`):

- `supersaw` with 9 voices, detune 0.42, mix 0.78, spread 0.6, plus a plain centre saw for focus.
  Drop 3 adds a −14 dB square one octave below.
- **Air layer (LEAD3, cut 2).** Quiet noise at about −24 dB, HP 8 kHz, gated with each note's envelope.
  This is the shimmer on top of a big-room lead, and it gives drop 3 its top instead of more mids.
- **Envelope.** Attack 4 ms, decay 250 ms to sustain 0.85, release 220 ms.
- **Filter.** 12 dB low-pass. **Cut 2: cutoff 9.5 kHz with filter envelope 0.7** on LEAD and LEAD3 (cut 1
  was 6.8 kHz / 0.55). In builds, the cutoff stays at or below 6 kHz.
- **Saturation.** tanh 1.4.
- **FX.** HP **300 Hz** (cut 2; was 220), +2 dB at 3 kHz. Hall 2.2 s at 22 %. Dotted-8th delay at 12 %.
- **Glide.** 25 ms on the call's octave leap only.

**Supersaw chords** (stem `chords`):

- `supersaw` with 9 voices, detune 0.5, mix 0.85, spread 0.95.
- Two octave layers.
- HP 150 Hz, LP 11 kHz, cut −3 dB at 300 Hz and **−2.5 dB at 400 Hz (Q 0.9)**.
- Drop wall filter cutoff **12 kHz** (cut 1: 8.5 kHz).
- Attack 2 ms, release 150 ms.
- In builds, a low-pass sweep from 400 Hz **up to 6 kHz at most**, with velocity ≤ 0.75. Fully open is
  reserved for the drop.

**Strings** (stem `strings`, cut 2). Approved only as a **sustained high line**:

- Use them for the breakdown ice pedal and chords, the build3 swells, the drop 3 melody **at +12 on notes of 4
  or more sixteenths**, and the tag. **Never at −12.**
- A phrase is **one sustained voice**, with 40–60 ms portamento between notes and **no re-attack**. Cut 1
  re-attacked every 8th with a 90 ms swell, a string-machine "wah".
- Each note gets a **brightness swell**: cutoff from 2 kHz to 6 kHz over the attack.
- Mix: −2.5 dB at 400 Hz (Q 0.9). The strings sit at or under the supersaw wall, never above it.

**Pluck** (stem `pluck`):

- 2 saws at ±7 cents plus a square one octave down at −12 dB.
- SVF low-pass with an envelope from 5.5 kHz to **1.4 kHz** (τ 90 ms), Q 0.9. In code: cutoff 1400, env 3.2.
  Cut 1 closed to 600 Hz, which left drop 1 without 2–5 kHz bite.
- Attack 1 ms, decay τ 260 ms, no sustain.
- Dotted-8th delay at 25 %.
- The +24 arpeggio in drop3c: filter base 1.2 kHz, then in the mix **HP 1.2 kHz and LP 8 kHz**, at −16 dB.
  It sparkles above the wall, not inside it.

**Bells** (stem `bells`):

- FM at ratio 1 : 3.5, index 3.5 → 0.4 (τ 0.35 s), plus a 1 : 7 partial at −18 dB.
- Attack 1 ms, τ 1.4 s.
- HP 600 Hz. Reverb 3 s at 35 %.

**Clean electric guitar** (stems `gtr_clean` and lead): Karplus-Strong, built as:

- Fractional-delay allpass tuning.
- A one-zero loop filter: brightness 0.55 for the neck pickup, 0.75 for the bridge.
- T60 about 2.5 s at E3 and 1.2 s at E5.
- Pick-position comb at β 0.15. Pickup comb at 0.08 (bridge) or 0.25 (neck).
- Excitation: a 2–3 ms noise burst, LP 3–5 kHz by velocity.
- Amp and cab: tanh 1.2, HP 90 Hz, +3 dB at 2.2 kHz (Q 1), 12 dB LP at 5.5 kHz.
- Chorus: 2 voices, 0.7 Hz, 3 ms depth, 35 % mix.
- Delay: dotted 8th, 20 % (feedback 30 %).
- Humanise ±5 ms.

**Acoustic steel-string guitar** (stem `gtr_acoustic`):

- KS with brightness 0.85 and T60 about 3 s.
- Body peaks: 100 Hz (Q 4, +6 dB), 200 Hz (Q 3, +4), 420 Hz (Q 2, +2), 2.5 kHz (Q 1, +3).
- HP 80–120 Hz.
- **Strums.** 6 strings spread 9–14 ms. Downstrokes go low→high; upstrokes go high→low on the top 4
  strings and are 20 % softer. Each string gets its own pick noise.
- **Double-tracking.** Use a second performance (different seed, 15 ms later) panned opposite.

**Muted electric** (stem `gtr_muted`):

- KS with T60 0.12 s, LP 1.8 kHz, bridge pickup, a little drive.
- Plays root + 5th (+8ve) 8ths or 16ths.
- In drop 2 it plays scratches: `o` = a dead scratch (noise through the body filter); `X` = an accented
  chord chop.

**Distorted guitar** (stem `gtr_dist`):

- KS into pre-gain ×10, then an asymmetric clip: tanh(x + 0.1) − tanh(0.1).
- Cab: HP 100 Hz, +4 dB at 1.8 kHz, −4 dB at 450 Hz, 24 dB LP at 5 kHz.
- **Two takes** (different seeds, 10–14 ms apart, ±4 cents) panned hard L/R.
- Sustained power chords (root, 5th, octave).

**Guitar harmonics** (breakdown):

- KS excited at the 1/12 and 1/2 nodes so it sounds bell-like.
- LP 6 kHz. Quarter-note delay at 35 % (feedback 45 %). Hall.

**Bass** (stem `bass`):

- **Sub layer.** Sine plus 12 % soft-saturated 2nd harmonic. Attack 3 ms, release 60 ms. Mono.
- **Mid layer.** Saw into a 24 dB LP at 450–900 Hz, with a +600 Hz envelope on the attack (τ 60 ms).
  tanh 2.0 puts harmonics in the 150–600 Hz band, which is how **phones hear the bass**. HP this layer
  at 60 Hz.
- **Variants:**
  - *Pop bass* (drop1): square/saw blend, LP 700 Hz, 25 ms glide.
  - *Rolling bass* (drop3): each 16th has a 1 ms attack, τ 70 ms decay, and a cutoff falling from
    1.4 kHz to 500 Hz.

### Musician B

**Kicks** (stem `kick`). All mono.

- **Verse kick.** A 52 Hz sine with a +24 st → 0 pitch envelope (τ 30 ms), amplitude τ 180 ms,
  LP 1.8 kHz, no click, velocity 0.6.
- **Pop kick** (drop1, verse2). Sine 190 → 55 Hz (τ 25 ms), body **τ 130 ms** (cut 3; was 170), a 2 ms click
  (noise at BP 4 kHz, −14 dB), tanh 1.6.
- **Club kick** (drop2, builds). Sine 220 → 55 Hz (τ 22 ms), body **τ 130 ms** (cut 3; was 200), click −10 dB.
- **Big-room kick** (drop3+). Three layers, then saturated or soft-clipped:
  - **cut 3:** a sine 230 → **41.2 Hz = E1, the tonic** (τ 20 ms) with a short held tail: **hold 30 ms, then τ
    130 ms**. Cut 2 was 61.7 Hz (B1), hold 120 ms and τ 270 ms. See §7 "Low-end pitch".
  - a "tok": a 190 → 150 Hz sine over 35 ms, through drive ×6 and BP 1 kHz (unchanged)
  - a 3 ms click (unchanged)
  - The drive is unchanged. Its harmonics now land at 82 Hz (E2) and 124 Hz (B2), so the kick still
    translates to earbuds. Phones hear the tok and the click.
  - The kick strip's 52 Hz low shelf (−3 dB) now sits on the fundamental. Use it as the sub-band control knob
    before touching the lane.

**Clap and snare** (stems `clap`, `snare`):

- **Clap.** Noise bursts at 0, 8, 16 and 26 ms (τ 4 ms each; the last τ 130 ms). Parallel band-passes
  at 1.2 kHz (Q 1.0) and 2.6 kHz (Q 1.4). Plate 1.4 s at 25 %.
- **Big-room clap.** Two claps ±25 % pan, plus the snare.
- **Snare.** A 190–200 Hz sine (τ 40–60 ms) plus noise at HP 1.5 kHz (τ 90–160 ms).
- **Snap.** 2 bursts at 0 and 5 ms, BP 2.8 kHz, τ 30 ms, room.
- **Build rolls.** Pitch rises +5 to +7 st, the HP climbs 200 Hz → 1.5 kHz, and velocity rises
  0.35 → **0.8**.

**Hats, shaker and cymbals** (stems `hats`, `perc`, `cymbals`):

- **Closed hat.** Six square partials at 808 metal ratios (205, 304, 369, 522, 540, 800 Hz, scaled into
  the 6–12 kHz region) blended with noise at HP 8 kHz. τ 25–35 ms.
- **Open hat.** τ 180 ms, choked by the next closed hat.
- **Shaker.** Noise BP 6.5 kHz (Q 0.7), attack 6 ms, τ 45 ms.
- **Tambourine.** The shaker plus partials at 6.2, 8.1 and 9.7 kHz (τ 120 ms).
- **Ride.** Inharmonic partials (310, 470, 625, 820, 1170, 3300, 5400, 7900 Hz), τ 1.4 s, plus a
  "ping" at HP 5 kHz.
- **Crash.** Noise HP 3.5 kHz plus metallic partials, τ 1.2 s (T60 about 3 s), wide.
- **Rim/clave.** Sines at 1.7 and 2.5 kHz, τ 25 ms, plus a click.
- **Toms.** Sines 140→100 Hz and 105→75 Hz, pitch τ 25 ms, amplitude τ 200 ms, plus skin noise.
- **Sub boom** (tag). A 45 Hz sine with τ 600 ms plus a low tom.

**FX** (stem `fx`):

- **Noise riser.** Decorrelated L/R noise into a BP sweep from 400 Hz to 9 kHz (exponential, Q 1.5).
  **Gain rises −30 → −16 dB, about −14 dB relative to the kick at its peak.** Width grows **to 0.6 at most**
  (cut 1 went fully decorrelated). Its length is the build length.
- **Pitch riser.** A single supersaw note gliding +12 st over 4 bars, opening low-pass, −14 dB, velocity
  0.6.
- **Downlifter.** Noise LP from 8 kHz to 200 Hz over 2 bars, −18 dB.
- **Impact.** A sine 60 → **35 Hz** (τ 0.5 s) plus a 40 ms noise burst (LP 5 kHz), with hall 4 s at 30 %.
  HP the impact stem at 35 Hz.
- **Sub drop.** A sine gliding 55 → **36 Hz** over 1 s. Never below 35 Hz: phones and most PAs cannot play
  it, and it steals headroom from the kick and sub.
- **Reverse cymbal.** A rendered crash, reversed, 1 bar long, ending exactly on the downbeat.
- **Bass suck.** A high-pass 30 → 300 Hz on the music stems (see build2) in the last 2 bars of build2
  and build3.

---

## 10. Groove

Pattern strings use `engine/core/voices.js pattern()` syntax: `X` = accent, `x` = hit, `o` = ghost,
`.` = rest. Each string is 16 steps, one per 16th, for one bar.

| Section | Element | Pattern | Swing |
|---|---|---|---|
| verse1 | kick | `X.......x.......` | — |
| | snap | `....x.......x...` | — |
| | shaker | `xoXoxoXoxoXoxoXo` | 56 % |
| verse1b | kick | `X...x...x...x...` | — |
| | snap+clap | `....X.......X...` | — |
| | closed hat | `..x...x...x...x.` | 56 % |
| | acoustic strum | D . D U . U D U in 8ths → `x...x.o...o.x.o.` (x = down, o = up, 20 % softer) | 56 % |
| drop1 | kick | `X...x...x...x...` | — |
| | clap+snare | `....X.......X...` | — |
| | ghost snare | `.......o.......o` | 54 % |
| | closed hat (open in 1b) | `..x...x...x...x.` | 54 % |
| | open hat (drop1, cut 2) | `..............x.` (the "and" of 4, choked by the next downbeat) | 54 % |
| | shaker | `xoXoxoXoxoXoxoXo` | 54 % |
| | bass | `x..x..x...x..x..` | — |
| | piano stabs | `..x...x.o.x...x.` | 54 % |
| verse2 | kick / clap | as drop1, kick velocity 0.85 | — |
| | ghost snare | `.......o..o....o` | 54 % |
| | bass | `x.x...x...x...x.` | — |
| | Rhodes comp | `..x.....x.x...x.` (sustain each hit to the next) | 54 % |
| build2 (cut 3) | clap, bars 5–6 / bar 7 | `....X.......X...` / `X...X...X...X...` | — |
| drop2 | kick / clap+snare | `X...x...x...x...` / `....X.......X...` | — |
| | open hat | `..x...x...x...x.` | 52 % |
| | closed hat | `xo.oxo.oxo.oxo.o` | 52 % |
| | rim tresillo | `x..x..x.x..x..x.` | — |
| | bass | `..x...x...x..xx.` (+ sub on step 0) | — |
| | scratch guitar | `o.X.o.Xoo.X.o.Xo` | 52 % |
| | piano stabs | `x..x..x.x..x..x.` | — |
| drop2b | ride | `x...x...x...x...` | — |
| | bass hops | octave up on steps 3, 7, 11, 15 | — |
| drop3 | kick / clap+snare | `X...x...x...x...` / `....X.......X...` | straight |
| | open hat / closed hat | `..x...x...x...x.` / `xo.oxo.oxo.oxo.o` | straight |
| | bass (rolling) | `.xxx.xxx.xxx.xxx` (3b/3c: `.xxX.xxX.xxX.xxX`, with X an octave up) | straight |
| | shaker (cut 2) | `xoXoxoXoxoXoxoXo` | straight |
| drop3b/c | ride | `x...x...x...x...` | — |
| | crash | every 4 bars in 3b, **every 2 bars in 3c** | — |
| drop3c | clap | `....X.......X.x.` | — |

**Builds:**

- **Snare rolls:** `x...x...x...x...` → `x.x.x.x.x.x.x.x.` → `xxxxxxxxxxxxxxxx` → 32nds (two hits per
  step).
- **Kick roll:** the same progression.
- The crescendo comes from **density** (subdivision, pitch, the riser and the opening filter), **not from
  level**. Velocities end at 0.8, and the master lane does not ride up into the gap (§6 drop delta).
- The silence comes last (§6).

**Humanising** (`humanize()`):

| Part | Timing σ | Velocity σ |
|---|---|---|
| piano | 5 ms | 0.06 |
| guitars | 6 ms (plus the strum spread) | 0.08 |
| Rhodes | 5 ms | 0.06 |
| shaker / tambourine | 3 ms | 0.08 |

- Kick, clap, bass and supersaw stay **on the grid**: the machine-tight backbone against the human
  players is the modern pop-EDM feel.
- **Fills:** every 8th bar in drops 1 and 2, and every 4th bar in drop3b and drop3c. Use 2-beat
  snare/tom fills, never in a bar that ends in a planned silence.

---

## 11. Mix vision

### What is loud

In the drops the **kick and the hook lead** are the loudest elements. The bass is felt more than heard.
Everything else is the room around them. In the verses the **piano melody** is the loudest element, with
the kick at −6 dB relative to it.

Drop level hierarchy, relative to the kick (0 dB):

| Element | Level |
|---|---|
| clap | −3 |
| lead / chops (drop1: the composite hook, summed) | −4 to −5 (drop1: **−2 to −3**, and above the bass bus) |
| bass (bass + sub bus) | −5 (drop1: about −6, under the hook) |
| piano | −9 |
| supersaw chords | −10 |
| strings (drop 3) | −11, at or under the wall |
| guitars | −12 |
| choir | −12 |
| pad | −15 |
| hats | **−12** (cut 1 sat at −16 to −17) |
| shaker / ride | **−16** |
| crash (downbeat hit) | clearly audible on a phone: the drop's top-end payoff |
| risers (at their peak) | **−14** (cut 1's −8 made the builds louder than the drops) |
| impacts | −4 |

### What is wide

| Width | Elements |
|---|---|
| **Mono centre** | kick, sub and bass (everything below 150 Hz is mono), clap core, snare, lead core, chops |
| Moderate | piano (spread by pitch, ±30 %), Rhodes (auto-pan ±30 %) |
| Placed | hats R 15, shaker L 25, tambourine R 30, rim L 30, ride R 35, clean arpeggio R 35–60, muted electric R 40 |
| **Wide** | supersaw chords, pad, choir (±90), crash, reverb returns |
| **Hard L/R** | acoustic double (±80; drop1/1b ±60), distorted guitar double (±100) |

**Width rules (cut 2, mono phone fold-down).** In cut 1 the M/S widening stacked: pad and chords at 1.6, the
music bus at 1.4–1.45, and the returns at 1.1–1.2. In drops 1 and 2 that put the Side above the Mid in
presence and air (air correlation −0.13 to −0.16), so a phone speaker cancelled the drop's shimmer.

- **M/S width caps:** music bus 1.1 in drops; pad and chords 1.3; drums bus 1.0; cymbals 1.1; hats 1.0;
  reverb returns 1.0.
- **Real width comes from real doubles:** hard-panned guitar takes, natively spread supersaw voices,
  stereo crash and ride, and panned percussion.
- **Width is a dynamic, too.** Narrow the music bus to about 0.7 over the last 2 bars of each build, then
  open it to 1.1 on the drop downbeat. The ear hears the drop open up without any anti-phase.
- **Targets:** in every drop, presence-band correlation ≥ +0.3 and air-band correlation ≥ +0.15. Each drop's
  mid band (0.8–3 kHz) must be at least 1 dB wider (S−M) than the verse before it (drop1 vs verse1b, drop2
  vs verse2). Full-band correlation is dominated by the mono low end, so it is only a sanity range: 0.45–0.8
  in the drops.
- **Mono loss (cut 3)** is the stereo K-weighted mean minus the mono fold-down's.
  - Drop3/3b/3c ≤ 0.8 LU (cut 2: 0.9–1.0, the most of any drop). The fix is the supersaw wall's width
    1.3 → 1.15 in drop 3.
  - Breakdown and tag ≤ 1 LU (cut 2: 1.5 and 1.6). The fix there is the hall, below.
- **Drop 2 width (cut 3, nice).** Drop 2 is the narrowest drop (S/M −10.5 dB against −9.0 / −8.3 in drop1 /
  drop1b), and its supersaw pad sits 16 dB under the kick. Raise the pad lane −14 → −11.5 and chops_echo +3 dB.
  Target: S/M ≥ −9.0, with presence correlation still ≥ 0.3.

### What is deep

| Depth | Elements |
|---|---|
| Front (dry) | kick, bass, clap, lead or chops, verse piano |
| Middle | guitars, Rhodes, supersaw chords |
| Back (wet) | choir, pad, bells, breakdown piano |

Send levels:

- **Plate** 1.3 s, pre-delay 15 ms: clap, snare, chops, lead.
- **Hall** 2.8 s, pre-delay 30 ms, HP 300 Hz, LP 7 kHz (9.5 kHz in the breakdown; HP 500 Hz and −12 dB inside
  the silence windows): piano, choir, supersaw, bells. The sends are wetter in the breakdown and the tag,
  **but the wet never out-sings the dry (cut 3):**
  - **Breakdown:** the hall return is at least **6 dB under the piano stem**. Sends: piano −13, strings −10,
    choir −6, choir_lead −8. Return width 0.85. Mid-band correlation ≥ 0.4.
  - **Tag:** the hall return is at least **4 dB under the lead stem**. Sends: piano −13, choir −6,
    choir_lead −8, strings −10, chords −14. Return width 0.85.
  - **Outro:** the cut-2 sends stay, for the ring-out.
  - In cut 2 the hall was level with the breakdown piano and 1.8 dB over the tag's lead. Those two sections
    lost 1.5–1.6 LU in mono.
- **Room** 0.6 s: guitars and drum ambience.
- **Delays** are dotted-8th ping-pong, **re-synced to each section's tempo**, with HP 400 Hz and
  LP 6 kHz.

### Sidechain (kick-triggered)

| Target | Duck | Times |
|---|---|---|
| bass | 8 dB (10 dB in drop3) | attack 1 ms, release 110 ms. **Sub (cut 3): release 0.09 s in drops 1–2** (was 0.12), so the sub is back by the 2nd 16th |
| pad / supersaw chords | 10 dB | release 160 ms (the classic pump) |
| guitars | 4 dB | |
| choir | 5 dB | |
| lead | 3 dB | |
| reverb returns | 4 dB | |

- **verse1:** no pumping. **verse1b:** 3 dB on the pad.
- **Breakdown:** a silent 8th-note ghost trigger gives a 4 dB pulse.

### EQ

**High-pass filters:**

| Part | HP |
|---|---|
| pad | 200 Hz |
| choir | 180 Hz |
| supersaw chords | 150 Hz |
| lead | **300 Hz** |
| chops | 300 Hz |
| piano | **90 Hz** in verses, 180 Hz in drops |
| guitars | 100 Hz (acoustic 120 Hz) |
| hats | 6 kHz |
| crash | 450 Hz (no 4.2 kHz cut) |
| bells | 600 Hz |
| pluck_arp | 1.2 kHz (LP 8 kHz) |
| impacts / sub drops (`fx_hit`) | 35 Hz |

**Other moves:**

- Cut −2 to −3 dB at 250–400 Hz on the pad, supersaw and guitars to remove mud.
- **Cut 2:**
  - Static −2.5 dB at 400 Hz (Q 0.9) on the strings, chords and choir.
  - −3 dB at 300 Hz (Q 1) on the piano.
  - −2 dB at 350 Hz on the pad and choir.
  - Verse low-mid must be ≤ 30 % of the energy, with presence ≥ 6 % (cut 1: 38–40 % and 4–4.7 %).
- Add +2 dB at 3 kHz on the lead and chops.
- **Air (cut 2):** +1.5 dB high shelf at 10 kHz on the music bus. If the drops still miss the §14 air target,
  use a parallel "air" bus (HP 8 kHz, its gain lane open only in the drops).
- **Breakdown:** open the hall return's low-pass from 7 kHz to 9.5 kHz with an `lp` lane.
- The kick owns the low end on the hit, and its tail is a tuned note (§7 "Low-end pitch"): A1 in D minor, E1
  in drop 3. The bass sub fills in between the kicks via the sidechain.

### Busses and master

**Busses:**

- **DRUMS:** glue compressor 4:1, attack 10 ms, release 100 ms, 2–3 dB gain reduction, plus 30 %
  parallel crush.
- **BASS.**
- **MUSIC:** keys, guitars, chords, pad.
- **LEAD:** lead, chops, pluck, bells.
- **VOX:** choir.
- **FX.**

**Master chain:**

1. HP 25 Hz.
2. Gentle tilt EQ, +1.5 dB shelf at 10 kHz.
3. Glue compressor 2:1, attack 30 ms, release 150 ms, 1–2 dB gain reduction in the drops.
4. Soft clip about 1 dB.
5. True-peak limiter: lookahead 3 ms, release 60 ms, ceiling **−1.0 dBTP**.

**Target:** about **−9.5 LUFS integrated**.

### Short-term loudness targets (LUFS)

| Section | Target |
|---|---|
| intro | −16 |
| verse1 | −14.5 |
| verse1b | −12.5 |
| build1 | −11.5. Its last bar stays ≥ 1 LU under drop1 (§6) |
| drop1 | −9.5 |
| drop1b | −9.3 |
| verse2 | −11 |
| build2 | −11.5 → rising (§6 "Build rise": bar 1 ≥ verse2 − 2 LU, bar 7 ≥ bar 1 + 1.5). Its last bar stays ≥ 1 LU under drop2 |
| drop2 | −9.0 |
| drop2b | −8.8 |
| breakdown | −13.5 |
| build3 | −10.5, rising to bars 5–6 (§6 "Build rise"). Its last bar stays ≥ 1 LU under drop3 |
| drop3 | −8.5 |
| drop3b | −8.3 |
| drop3c | −8.1 (short-term max ≤ −7.8) |
| tag | −9.5 |
| outro | decays to silence |

Short-term max per section is measured only on 3 s windows that lie fully inside the section. Cut 1's
verse2 "−8.9" was drop1b carry-over.

---

## 12. Ending and loop

- drop3c ends on the deceptive Cmaj7 hit. The tag runs one line of ritardando chords. The **final hit**
  lands at about 3:10.5, and then **6 seconds of natural decay** follow.
- **No fade-out.** The tails decay naturally, with only a 50 ms safety fade on the last samples.
- The file ends at 3:16.5, silent. The game replays from 0:00, where the call is on the first beat at
  126 BPM, so the loop sounds like a deliberate restart.

---

## 13. Proposed stem names

**Musician A:**

- `piano`, `rhodes`, `pad`, `chords`
- `lead`, `pluck`, `bells`
- `gtr_clean`, `gtr_acoustic`, `gtr_muted`, `gtr_dist`
- `bass`
- `choir`, `chops`

**Musician B:**

- `kick`, `clap`, `snare`
- `hats`, `perc`, `cymbals`
- `fx`

Rename these freely if `API.md` dictates otherwise. Just keep them stable so `mix.js` can find them.

---

## 14. How the label review will judge the render

Nobody can listen, so the render is judged on these checks.

### `report.md`

- Integrated loudness between **−9 and −11 LUFS**. True peak at or below **−1 dBTP**. Zero clips.
- Per-section short-term loudness follows the energy curve (§11). Each drop must be louder than the one
  before it.
- **The §6 drop-delta table passes for all three builds.** The song's momentary and short-term maxima fall in
  drop3b, drop3c or the tag hit.
- **Crest factor in the drops is 7.5–9.5 dB.** Below 6 dB the drops are over-limited and flat.
- **Band balance in the drops:**
  - the sub band (< 60 Hz) does not exceed the low band (60–250 Hz) in drops 1–2. In drop 3 it may exceed it
    by up to 2 dB, because the kick and the sub share the tonic E1 there (§7).
  - presence (3–8 kHz) is within about 8 dB of the mids (0.8–3 kHz); this is phone translation
  - air (8 kHz+) is within about 14 dB of the mids
- **Stereo:**
  - the sub band's correlation is above 0.9, i.e. mono
  - overall correlation is between +0.3 and +0.8 (drops 0.45–0.8)
  - the drops are wider than the verses, judged in the mid band (§11)
- **Masking warnings** to watch: bass vs kick (low band); chops vs lead vs piano (mid band) in
  drop3b and drop3c.

### Cut-2 checks (added after the label's cut-1 review)

These are measured on the final WAV. Cut 1's values are in brackets.

| Where | Check |
|---|---|
| every drop | **Mid-channel** presence ≥ mid − 6 dB [−6.4 to −9.5], and Mid-channel air ≥ mid − 11 dB [−13.8 to −15.6] |
| every drop | presence-band correlation ≥ +0.3 [−0.04 to 0.37] and air-band correlation ≥ +0.15 [−0.16 to 0.27]. This is the mono phone fold-down: in no drop may the Side be louder than the Mid above 3 kHz |
| drop1 / drop1b | sub + low ≤ 48 % [56 % / 48 %]; mid + presence ≥ 33 % [28.6 % / 30.2 %]; summed hook 2–3 dB under the kick and above the bass bus |
| drop3c | **cut 3:** sub + low ≥ mid + 10 points [cut 2: 47.5 vs 27.1]; mid ≤ 34 % (was 32 %, see §4 drop3c); presence ≥ 9 % [7.5 %]; low-mid ≤ mid − 3 dB; short-term max ≤ −7.8 [−7.1] |
| verses | low-mid ≤ 30 % [38–40 %]; presence ≥ 6 % [4–5.7 %] |
| breakdown | presence ≥ 4 % [1.8 %]; air ≥ 1.5 % [0.6 %] |
| all gaps | second half ≤ −30 dBFS 50 ms RMS (build3 −28, drop2 −27) [−19.3 to −27.6] |
| tag | `fx_hit` no longer dominates the sub band [70 %]; nothing under 35 Hz |

### Cut-3 checks (added after the label's cut-2 review)

Measured on the final WAV. Cut 2's values are in brackets. Every cut-2 check above still applies.

| Where | Check |
|---|---|
| every drop bar | **Low-end pitch** (§7): in drop 3, no kick-tail component within 2 st of the bar's sub note at less than 6 dB under it [C bars: tail 2–5 dB *over* C2]; on tonic bars the tonic fundamental is the strongest component in 30–100 Hz [B1 strongest in every bar]. In drops 1–2: the 55 Hz tail no louder than Bb1 on Bb bars [0.8–3.3 dB over]; in drop2/2b, D2 within 6 dB of it on Dm bars [10.8–11.3 dB under] |
| drop3 / 3b / 3c | sub share 18–26 % [13.6–15.4 %]; sub band ≤ low band + 2 dB; limiter max GR ≤ 2 dB [1.1]; mono loss ≤ 0.8 LU [0.9–1.0] |
| phone ladder | phone sim (mono fold-down, HP 350 Hz 24 dB/oct, K-weighted section mean): drop3 ≥ drop2b + 0.4 LU [−0.4], drop3b ≥ drop3 + 0.3 [+0.3], drop3c ≥ drop3b + 0.3 [+0.2]. The full-band ladder (each drop above the one before) still holds, and integrated stays −9.5 to −10 |
| build2 / build3 | §6 "Build rise" [build2: bar 1 −2.4 LU under verse2, rise +1.3 LU with a 1.3 LU dip at bar 5, bars 5–6 mid band −10 dB; build3: rise +0.7, +0.1 over the breakdown's last bar] |
| breakdown | hall return ≤ piano stem − 6 dB [+0.3]; mid-band correlation ≥ 0.4 [0.20]; mono loss ≤ 1 LU [1.5]; fx_sweep < 30 % of the air band [47 %] |
| tag | hall return ≤ lead stem − 4 dB [+1.8]; mono loss ≤ 1 LU [1.6] |
| piano | intro/verse spectrogram shows the soundboard bloom on every chord (100–2500 Hz, ~200 ms); piano stems within ±1 dB of cut 2 per section |
| render | ≤ 240 s wall clock (aim ≤ 230 s) [219.6]; keys part ≤ 45 s [23.5] |

**The producer check, cut 3:** `drop-check-3.mjs`. It is read-only and prints the cut-2 tables plus every
cut-3 row above, with a FAIL list at the end. Its path is in `SESSION-3.md`, and a full copy is in that file's
appendix. Until the Engineer adds the same tables to `report.md`, it is the source of truth for §6, §7 and
§14.

### `spectrogram.png`

- **Dark vertical stripes** (the silences) at 0:26.1, 1:25.5, 1:40.9 (thin), 2:23.7 and 2:38.4.
- **The key lift is visible.** The harmonic lines step up by a whole tone at 2:24.6.
- The drops are visibly denser than the verses.
- The ending fades to black after 3:10.5.

### `stems.png`

The busses enter in this order:

1. keys + vocals
2. drums
3. guitars
4. leads
5. everything

The bass drops out in every build tail. All busses are silent in the silence windows.

### `pianoroll.png`

- Melody notes appear in every section except the pure-build halves and the outro.
- The final melody note falls at about 3:10.5.
- Chords change every half-bar, and the lament bass is visible as a descending staircase.

---

## 15. What I could not verify, and open requests

**Verified (Node), cut 3 (before the recut):**

- `score.js` imports, the form is unchanged (106 bars), and the song ends at **3:16.5** (inside 3:00–3:45).
  Every chord symbol still parses after transposing +2.
- **The label's cut-2 measurements reproduce** from `studio/out/cut-2/hatikvah.wav` with my own read-only
  scripts (per-bar FFT, phone sim, per-bar BS.1770):
  - The B1 kick tail is the strongest low component in every drop-3 bar. It sits 2–5 dB over C2 on C bars and
    6–12 dB over the E on tonic bars, and the E1 sub is essentially absent (−29 to −50 dB).
  - On the phone sim, drop3 (−11.4) is quieter than drop2b (−11.0), and drop 3 loses 0.9–1.0 LU in mono.
  - Build 2 per bar: −13.1, −12.5, −12.3, −12.0, −13.3, −13.0, −11.8. Its bars 5–6 mid band is 10 dB under
    bars 3–4.
  - Breakdown: hall −23.9 vs piano −24.2, mid correlation 0.20, mono loss 1.5. Tag: hall −19.2 vs lead −21.0.
  - The label's absolute numbers differ from mine by 0.1–0.3 dB (window placement), so the cut-3 phone rules
    are relative to drop2b. The orderings match exactly.
- **Kick sim** (the b-kit kick body, re-implemented read-only): the club A&R's envelope fix (hold 0.03, tau
  0.13) lowers the 61.7 Hz component by only 2.6 dB, because the drive holds the tail near full level through
  the 2nd 16th. Retuning to E1 with the same envelope puts the 61.7 Hz component 16.6 dB lower. That is why the
  kick is retuned, not only shortened (§7).

**Verified (Node), cut 2:**

- `score.js` imports, and every section matches the contract: unique names, valid roles,
  bars × 2 chords, valid melody spans.
- **All 25 chord symbols parse** with `studio/engine/theory.js` `parseChord`, including after
  transposing +2.
- The timeline is still **3:16.5** (106 bars). The first melody note is at **0:00.0**.
- No melody note on a strong beat clashes with my reharmonisation.
- **Every cut-1 measurement the label quoted reproduces** from `studio/out/cut-1/hatikvah.wav` with my own
  script:
  - build last-0.5 s momentary −6.0 / −4.9 / −5.0 LUFS against drop means −9.5 / −8.9 / −8.0
  - presence and air falling 5–10 dB into each drop
  - negative air-band correlation in drops 1 and 2
  - drop3c's sub thinning
- **New finding.** The report's silence-window "master max" is measured before the master drive. The file
  itself is about 5 dB hotter: the build3 gap opens at **−15 dBFS** in the WAV against −20.5 in the report.
  The gaps were worse than the label thought.

**Not verified:**

- **The sound.** Nobody can listen. The timbre of the choir and chops, the realism of the piano and Rhodes,
  and the groove feel are judged only from the code and the analysis. The cut-3 numbers in §6, §7, §11 and
  §14 are targets, not results.
- **The tonic-tuned kick.** I chose E1 (41.2 Hz) from a body-only sim. It ignores the kick strip's clipper,
  the drum-bus glue and the sub duck. The sub-band rows and the §7 fallback exist because this could overshoot
  the sub band. At 41 Hz the fundamental is weaker on earbuds than B1 was. The drive harmonics at 82 and 124 Hz
  carry it there; that is reasoned, not measured.
- **Piano realism** can be judged only as a spectrogram bloom and as code. Whether it sounds like a grand is
  the biggest remaining unknown, along with the voices.
- **Synthesized vocals** remain the biggest quality risk. Cut 2 reduces exposure: round-robin chops, the
  pluck double, the choir behind the front, and no choir solo in a drop. If the next review still flags
  them, fall back further:
  - fewer chop layers
  - plucks carrying more of drop 2
  - the choir further back

**Requests to the Engineer, cut 3** (I can't edit these files; priority order). Round 2 delivered none of the
cut-2 requests (`engine/inst/keys.js` is unchanged since before LABEL-NOTES round 1), so the musicians now
cover what they can inside their own files:

1. **Piano realism (E2):** reassigned to Musician A as `instruments/a-piano.js` (§9). If the Engineer ships it
   in `engine/inst/keys.js` first, Musician A switches to it and deletes the fork, so the body is never stacked
   twice.
2. **Report checks (E1/C15/P13):** `drop-check-3.mjs` prints them all except the drum lane in the piano roll.
   Still wanted in `report.md`, plus a per-section **phone-sim column** (mono, HP 350 Hz 24 dB/oct, K-weighted
   mean LUFS, and mono loss) and a **low-end pitch table** per drop bar.
3. **`Strings` glide and brightness envelope (E3):** still open. Musician A's `a-strings.js` covers it.
4. **A score path for render.mjs** (`--score <file>`), so a DJ extended mix could later be rendered from a
   separate score without touching the game master.

**Requests to the Engineer, cut 2** (kept for the record):

1. **Report checks.** Add to `report.md`:
   - the §6 drop-delta table, plus the payoff band and correlation rows
   - Mid-only band levels and Side-minus-Mid per band for each section
   - the mono fold-down loss (M-only vs L+R) per section, flagged above 2 dB in presence or air
   - section short-term max from windows fully inside the section
   - the silence table measured on the final file, after the master drive
   - drum stems in their own lane in `pianoroll.png`
2. **Piano realism.** The piano is the verse lead and half the drop 1 hook. Add:
   - a modal soundboard (about 25–30 modes, 60 Hz–3 kHz, Q 15–40, 150–250 ms)
   - 3 strings across MIDI 45–88 (±0.5–1.5 cents)
   - key-off / damper noise, 40–80 ms of band-passed noise at about −35 dB
   - hammer-return noise on the felt tone
3. The felt piano gets brighter through its public `brightness` option, set from `keys.js`, so no engine
   change is needed. Tell me if you would rather change the engine's felt multiplier instead.
4. (Done in cut 1, kept for the record) `cues` export, mix automation, tempo-synced delays, ramp maths,
   and silence markers on the PNGs.

**Requests to the Musicians:**

1. Honour `cues.silenceBeats`, `cues.downbeat` and `cues.finalHit` exactly.
2. In the `outro`, do not retrigger chords from `chordAt`.
3. Report back any section where the melody ended up behind other parts.
4. Work from `SESSION-3.md`, and run `drop-check-3.mjs` on your render before you report.
