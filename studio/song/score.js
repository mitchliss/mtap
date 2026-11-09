// Hatikvah (MTap festival mix) - Producer's score.
// Read studio/song/brief.md first: this file is the timeline; the brief is how to play it.
//
// Shape: verse -> build -> DROP, three times, each pass faster, longer-built and harder:
//   pass 1  126 -> 128  DROP 1 "the pop drop"        (Chainsmokers: piano + guitar-led)
//   pass 2  128 -> 131  DROP 2 "the vocal-chop drop" (more bump: chops, funk guitar, tresillo perc)
//   pass 3  131 -> 134  DROP 3 "the main stage"      (Tiesto big-room supersaw, KEY LIFT to E minor,
//                                                     a double drop, then all three drops unite)
// then the anthem's last line broadens (ritardando) into one final hit that rings to silence.
// The melody is on beat one of bar one; the verse starts at 0:03.8.
//
// CUT 2 (recut session 2): same form, keys, tempos and timeline (106 bars, 3:16.5). What changed is the PAYOFF:
// the build is thin, bright noise and snare; the DROP brings the width, the lows and the hook. Hard rules:
// brief section 6 "Drop delta" and the section 14 cut-2 checks (also exported below as cues.dropDelta / cues.checks).
// Work list: studio/song/SESSION-2.md. Label notes + decisions: studio/song/LABEL-NOTES.md.
//
// CUT 3 (recut session 3): same form again (106 bars, 3:16.5). The label passed the payoff (7.4 / 7.5) and sent
// it back for the two things a listener judges "real" first: the PIANO (the first sound of every game launch has
// no soundboard, single-ish strings, no damper noise -> Musician A's instruments/a-piano.js, brief section 9) and an
// OUT-OF-TUNE LOW END (drop 3's big-room kick held B1 under C2 / A1 / the tonic -> the kick tail is tuned to the
// TONIC E1 and shortened, the E-minor sub moves to E1; brief section 7 "Low-end pitch"). Also: build 2 must rise
// (brief section 6 "Build rise"), drop 3 must grow on a phone (section 14 phone ladder), and the breakdown / tag
// hall sits under its dry carrier. Work list: SESSION-3.md. Check: drop-check-3.mjs (path in SESSION-3.md).

// ---- chord plans (one symbol per half-bar; all parse with studio/engine/theory.js) ----

// Verse A x2 (anthem bars 0-7). Reharm over a descending "lament" bass D C Bb A G F | A D.
// Bbmaj7 stands in for Gm (it is Gm9 without the root) so the bass can walk down.
const VERSE = [
  'Dmadd9', 'Dm7/C', 'Bbmaj7', 'Dm/A', 'Gm7', 'Dm/F', 'A7sus4', 'Dm',
  'Dmadd9', 'Dm7/C', 'Bbmaj7', 'Dm/A', 'Gm9', 'Dm/F', 'A7', 'Dmadd9',
];

// Refrain A + B (anthem bars 8-15 == 8-11 + 16-19), three drop flavours:
// POP: inversions and maj7 colour so the bass sings (D D C A Bb Bb C A | F A G F G F A D).
const DROP_POP = [
  'Dmadd9', 'Dm', 'C', 'F/A', 'Bbmaj7', 'Bbmaj7', 'C', 'F/A',
  'F', 'F/A', 'Gm7', 'F', 'Gm7', 'Dm/F', 'A7', 'Dm',
];
// CLUB: root position with sevenths - the bass bounces on roots.
const DROP_CLUB = [
  'Dm', 'Dm', 'C', 'F', 'Bbmaj7', 'Bbmaj7', 'C', 'F',
  'F', 'F', 'Gm7', 'F', 'Gm7', 'Dm', 'A7', 'Dm',
];
// BIG ROOM: plain root-position triads (supersaw stacks stay clean) + A7 for the harmonic-minor bite.
const DROP_BIG = [
  'Dm', 'Dm', 'C', 'F', 'Bb', 'Bb', 'C', 'F',
  'F', 'F', 'Gm', 'F', 'Gm', 'Dm', 'A7', 'Dm',
];
// Last drop ends on a deceptive cadence (A7 -> Bbmaj7, i.e. B7 -> Cmaj7 after the lift) so the tag resolves it.
const DROP_BIG_DECEPTIVE = [...DROP_BIG.slice(0, 15), 'Bbmaj7'];

// Breakdown (refrain A + B, beatless): pedalled, lush; the bass climbs F A Bb C under "Lihyot am chofshi".
const BREAKDOWN = [
  'Dmadd9', 'Dm7', 'C', 'F/A', 'Bbmaj7', 'Gm7', 'C7sus4', 'F',
  'Fadd9', 'F/A', 'Gm/Bb', 'F/C', 'Gm7', 'Dm/F', 'A7', 'Dmadd9',
];

export default {
  title: 'Hatikvah (MTap festival mix)',
  key: 'D minor',
  sections: [
    // ======================= PASS 1 =======================
    {
      name: 'intro',
      bars: 2,
      bpm: 126,
      transpose: 0,
      energy: 0.3,
      role: 'intro',
      melody: { fromBar: 8 },
      chords: ['Dmadd9', 'Dmadd9', 'Gm7', 'A7'],
      notes:
        'COLD-OPEN HOOK TEASER. Melody from 0:00: the refrain call (D, high D-D-D | C D C Bb A). ' +
        'Grand piano plays it in octaves (0 and +12, sustain pedal); an airy vocal-chop "ah" at +12 doubles it with ' +
        'dotted-8th ping-pong throws. Choir "ah" + warm pad swell in on Dm(add9) (attack 1.5 s) and breathe in quarter ' +
        'notes (volume shaping, no kick). No drums; a shaker fades in over bar 2. Bar 2: reverse cymbal + short noise ' +
        'riser landing on the verse1 downbeat. A7 sits under the held A so the verse lands as V -> i. ' +
        'CUT 3: this grand is the FIRST SOUND OF EVERY GAME LAUNCH - it plays through APiano (instruments/a-piano.js): ' +
        'three-string unison, a 28-mode soundboard bloom on every chord, damper/key noise (brief section 9).',
    },
    {
      name: 'verse1',
      bars: 4,
      bpm: 126,
      transpose: 0,
      energy: 0.36,
      role: 'verse',
      melody: { fromBar: 0 },
      chords: VERSE.slice(0, 8),
      notes:
        'INTIMATE VERSE ("Kol od balevav"). Felt pop piano carries the melody in the original register (D4-D5), ' +
        'felt brightness 0.6 so it reads on a phone; LH plays the lament bass in octaves (D C Bb A G F | A D) FROM E2 ' +
        'UP (pcAtOrAbove(pc, 40); the sub owns everything under 80 Hz) with soft shells >= G3 under the tune. ' +
        'Clean electric guitar: 8th-note arpeggio of chord tones + 9th, dotted-8th delay, panned R 35%. ' +
        'Choir "oo" chord pad barely there (-18 dB under the piano). Drums: soft round kick on beats 1 and 3 only ' +
        '(no click), finger snaps on 2 and 4, shaker 16ths with 56% swing. Bass: sub-only half notes on the lament ' +
        'bass. No sidechain pumping yet. Downbeat: soft sub swell where the intro riser lands.',
    },
    {
      name: 'verse1b',
      bars: 4,
      bpm: 126,
      transpose: 0,
      energy: 0.5,
      role: 'verse',
      melody: { fromBar: 4 },
      chords: VERSE.slice(8, 16),
      notes:
        'VERSE LIFT (verse line again, cadence 2). Kick goes four-on-the-floor (still round), a soft clap joins the ' +
        'snap on 2 and 4, offbeat closed hats. Bass: 8th-note pulse on the lament bass. Acoustic steel-string guitar ' +
        'strums enter L 35% (D . D U . U D U). Choir "oo" doubles the melody in unison 10 dB under the piano. ' +
        'Warm pad enters with a light 3 dB pump. Bar 4: reverse cymbal into build1. Piano LH from E2 up (as verse1). ' +
        'Target: low-mid <= 30 % of the energy, presence >= 6 % (cut 1: 40 % / 4 %).',
    },
    {
      name: 'build1',
      bars: 4,
      bpm: [126, 128],
      transpose: 0,
      energy: 0.66,
      role: 'build',
      melody: { fromBar: 8, bars: 2 },
      chords: ['Dm', 'Dm', 'C', 'F', 'Bb', 'Bb', 'Csus4', 'C'],
      notes:
        'BUILD 1 (short and sharp). Bars 1-2: the hook teased - vocal-chop "ah" at +12 through a low-pass opening ' +
        '900 Hz -> 6 kHz, piano 8th-note chord pumps, kick four-on-the-floor, snare on quarters from bar 2. ' +
        'Bars 3-4 (no melody): kick OUT, bass OUT, snare roll 8ths (bar 3) -> 16ths (bar 4) rising +5 st with its ' +
        'high-pass climbing 200 -> 1500 Hz; vocal-chop roll on the high D ("oh") 8ths -> 16ths, pitch rising +12 st; ' +
        'Bb -> Csus4 -> C as filtered supersaw 8th stabs; white-noise riser across all 4 bars. ' +
        'SILENCE: the last beat (bar 4 beat 4) is dead silent for every stem - only reverb tails, which DECAY. ' +
        'CUT 2 - THIN BUILD: stabs vel <= 0.75 and cutoff <= 6 kHz, chop roll ends at vel 0.7, snare roll ends at 0.8, ' +
        'riser peaks ~14 dB under the kick (width <= 0.6), no master crescendo into the gap, music bus narrows to ~0.7 ' +
        'over bars 3-4. Its last bar must sit >= 1 LU under drop1 (cues.dropDelta).',
    },
    {
      name: 'drop1',
      bars: 8,
      bpm: 128,
      transpose: 0,
      energy: 0.76,
      role: 'drop',
      melody: { fromBar: 8 },
      chords: DROP_POP,
      notes:
        'DROP 1 - THE POP DROP (Chainsmokers, piano/guitar-led). One composite hook: bright pop piano octaves ' +
        '(+12 and 0) + clean electric lead guitar (+12, bridge pickup, chorus) + soft saw-pluck (+12, cutoff 1.4k so it ' +
        'bites at 2-5 kHz). The HOOK IS IN FRONT: summed hook 2-3 dB under the kick and above the bass bus; this is the ' +
        'LIGHT drop (sub+low <= 48 %, mid+presence >= 33 %). Chords: acoustic 16th strums DOUBLE-TRACKED AC1 L60 / ' +
        'AC2 R60 (the width), palm-muted electric 8ths R, pad pumping (8 dB sidechain), piano offbeat chord stabs on ' +
        'their own stem piano_stab. Bass: syncopated pop bass x..x..x...x..x.. following the inversions (D D C A Bb Bb ' +
        'C A | F A G F G F A D). Drums: full but warm kick (tail ~55 Hz), clap+snare on 2 and 4, offbeat closed hats ' +
        '+3 dB plus an open hat on the "and" of 4 every bar, shaker 16ths (54% swing), ghost snares on the "a" of 2 ' +
        'and 4. Downbeat: IMPACT + crash (the top-end payoff - audible on a phone). Bar 8: 2-beat snare/tom fill, no gap.',
    },
    {
      name: 'drop1b',
      bars: 8,
      bpm: 128,
      transpose: 0,
      energy: 0.8,
      role: 'drop',
      melody: { fromBar: 8 },
      chords: DROP_POP,
      notes:
        'DROP 1, second half - a real VARIATION, not just more layers. Bars 1-4: the clean LEAD GUITAR sings the ' +
        'refrain alone at +12; the pop piano stops doubling and ANSWERS an octave up inside each long note (>= 4 ' +
        'sixteenths); the pluck rests. Bars 5-8: the full composite returns, choir "oh" doubles at 0 octave (wide, ' +
        '-12 dB, bars 5-8 only). Open hats replace the closed offbeats, tambourine on 2 and 4, a high clean-guitar 16th ' +
        'arpeggio with delay (R 60%). Crash on the downbeat. Bar 8: downlifter + reverb throw into verse2 (no gap).',
    },

    // ======================= PASS 2 =======================
    {
      name: 'verse2',
      bars: 8,
      bpm: 128,
      transpose: 0,
      energy: 0.6,
      role: 'verse',
      melody: { fromBar: 0 },
      chords: VERSE,
      notes:
        'VERSE 2 - THE BAND VERSE (the beat stays; more bump than verse 1). Melody on clean electric guitar lead ' +
        '(neck pickup, warm, 90 ms slapback + dotted-8th delay), doubled softly by Rhodes; from bar 5 the choir ' +
        '"oo" joins the melody. Rhodes comps syncopated chords; acoustic guitars double-tracked L/R strumming 16ths. ' +
        'Drums: four-on-the-floor at verse weight, clap 2 and 4, offbeat closed hats, shaker, ghost snares; tom ' +
        'fill at the end of bar 8. Bass: house bass, sub on 1 + offbeat 8ths (x.x...x...x...x.), 4 dB pump. ' +
        'Downbeat: crash. Piano/Rhodes LH from E2 up.',
    },
    {
      name: 'build2',
      bars: 8,
      bpm: [128, 131],
      transpose: 0,
      energy: 0.78,
      role: 'build',
      melody: { fromBar: 8, bars: 4 },
      chords: ['Dm', 'Dm', 'C', 'F', 'Bb', 'Bb', 'C', 'F', 'Gm7', 'Gm7', 'Bb', 'Bb', 'C', 'C', 'A7sus4', 'A7'],
      notes:
        'BUILD 2 (8 bars, tempo pushes 128 -> 131). Bars 1-4: the whole refrain-A hook teased on vocal chops at +12 ' +
        '(low-pass 700 Hz -> 5 kHz), filtered supersaw chord 8ths underneath, kick four-on-the-floor, clap 2 and 4, ' +
        'snare quarters from bar 3, muted guitar 8th chugs. Bars 5-8 (no melody): Gm7 -> Bb -> C -> A7sus4/A7 as ' +
        'rising supersaw 8th stabs (the A7 pulls hard to Dm); KICK ROLL quarters (bars 5-6) -> 8ths (bar 7) -> ' +
        '16ths (bar 8 beats 1-2); snare 8ths -> 16ths -> 32nds; chop roll on the high D; noise riser 8 bars + pitch ' +
        'riser last 4; high-pass "bass suck" on the music 30 -> 300 Hz across bars 7-8. ' +
        'SILENCE: the last 2 beats of bar 8 (tails decay; second half of the gap <= -30 dBFS). ' +
        'CUT 2 - THIN BUILD: this was the loudest moment of cut 1 (-4.9 LUFS momentary). Stabs vel <= 0.75, cutoff ' +
        '<= 6 kHz; chop roll ends 0.7; snare roll ends 0.8; riser ~14 dB under the kick; pitch riser vel 0.6; master ' +
        'lane falls -2.5 -> -3 dB into the gap; music bus narrows to ~0.7 over bars 7-8. Last bar >= 1 LU under drop2. ' +
        'CUT 3 - IT MUST BUILD (cut 2 opened 2.4 LU under verse2 and sagged in bars 5-6, mid band -10 dB): chop tease LP ' +
        'starts at 1 kHz (not 700 Hz); bars 5-8 stab cutoff 1600 * 3.75^p (1.6 -> 6 kHz, continuing the sweep, no reset), ' +
        'velocity 0.66 -> 0.75; chop roll in 8ths from bar 5 (v0 0.58 -> v1 0.7); clap 2 and 4 in bars 5-6, every beat in ' +
        'bar 7; chords lane -8 in bars 5-8; master lane [[0,-1.6],[6,-2.2],[7.5,-3],[8,-3]]. Rules: brief section 6 ' +
        '"Build rise" (bar 1 >= verse2 - 2 LU; bar 7 >= bar 1 + 1.5 LU; bars 5-6 mid within 4 dB of bars 3-4).',
    },
    {
      name: 'drop2',
      bars: 8,
      bpm: 131,
      transpose: 0,
      energy: 0.86,
      role: 'drop',
      melody: { fromBar: 8 },
      chords: DROP_CLUB,
      notes:
        'DROP 2 - THE VOCAL-CHOP DROP (more bump). Lead = wordless vocal chops ("ah / oh / ay", 30 ms pitch scoop, ' +
        'formants +3 st) at +12, a +24 layer at -14 dB and an "oh" layer at 0 octave -6 dB; ping-pong dotted-8th ' +
        'throws on the long notes. CUT 2: the chops are a ROUND-ROBIN sampler (3-4 sources per pitch/vowel, slice ' +
        'offsets 0.08-0.6 s, +-8 cents, vowel drift on held chops, soft "h" onset on phrase heads) - never the same ' +
        'slice twice in a row - and the PLUCK doubles every melody note at +12 ~6 dB under them. Groove: kick ' +
        'four-on-the-floor, clap+snare 2 and 4, OPEN hats on the offbeats (+3 dB on cut 1), ' +
        'accented 16th closed hats, rim/clave tresillo x..x..x.x..x..x., shaker. Funky muted rhythm guitar on ' +
        'offbeat 16ths (chicken-scratch), piano stabs on the tresillo, supersaw pad low-passed at 3.5 kHz pumping ' +
        'hard (10 dB). Bass: bouncy offbeat 8ths with 16th pickups (..x...x...x..xx.) over a sub root. ' +
        'Downbeat: IMPACT + crash. Bar 8: 2-beat snare roll, then the last half-beat is silent.',
    },
    {
      name: 'drop2b',
      bars: 8,
      bpm: 131,
      transpose: 0,
      energy: 0.9,
      role: 'drop',
      melody: { fromBar: 8 },
      chords: DROP_CLUB,
      notes:
        'DROP 2, second half - the bump doubles and the hook becomes a CONVERSATION: the chops sing each phrase head ' +
        'and every short note; on the LONG notes (>= 8 sixteenths) the chop sings only the first 8th and the FUNK ' +
        'GUITAR ANSWERS in the rest of the note (a 16th lick on chord tones landing on the held pitch) - this replaces ' +
        'the re-chop stutters. + choir "ah" chords wide, + ride on the quarter notes, bass adds octave hops on the last ' +
        '16th of each beat. Crash on the downbeat. Bar 8: big reverb throw on the last chop, downlifter and sub drop ' +
        '(ending at 36 Hz, not 25) into the breakdown.',
    },

    // ======================= PASS 3 =======================
    {
      name: 'breakdown',
      bars: 8,
      bpm: [131, 134],
      transpose: 0,
      energy: 0.42,
      role: 'breakdown',
      melody: { fromBar: 8 },
      chords: BREAKDOWN,
      notes:
        'BREAKDOWN - "Od lo avdah tikvatenu" (our hope is not yet lost). Beatless for bars 1-4. Grand piano plays ' +
        'the refrain (original register, octave-doubled on the high Ds) with pedalled lush voicings; the bass climbs ' +
        'F A Bb C in bars 5-6. Choir "oo" chords in bars 1-4, then the choir "ah" takes the melody (soprano) with ' +
        'alto/tenor harmony in bars 5-8. Guitar natural harmonics + a slow clean arpeggio with long delay. A soft ' +
        'high D6 "ice" pedal (choir/bell harmonic) floats over bars 1-4. Bars 5-8: a soft half-time heartbeat kick ' +
        '(beats 1 and 3, low-passed 150 Hz), pad pulsing in 8ths, a soft +12 supersaw (low-pass 1.5 kHz) doubling ' +
        'the melody. The tempo climbs 131 -> 134 here, hidden by the missing beat. Reverse cymbal into bar 5 and ' +
        'into build3. CUT 2 - OPEN THE TOP (cut 1 was the darkest moment of the record at its emotional peak): grand ' +
        'brightness 0.7 in bars 1-4, a soft bell ping on D7 every 2 bars ~6 dB under the D6 pedal, guitar harmonics on ' +
        'D6/A6, hall return low-pass opened 7k -> 9.5k. No breath/noise layer. Target presence >= 4 %, air >= 1.5 %. ' +
        'CUT 3 - THE GRAND STAYS IN FRONT, THE HALL STAYS BEHIND: bars 5-8 grand at base velocity 0.62 (was 0.44) with the ' +
        'octave on the high Ds; the choir "ah" soprano DOUBLES it 3 dB behind (exposure rule). Hall sends piano -13, ' +
        'strings -10, choir -6, choir_lead -8, return width 0.85; bells +4 dB and guitar harmonics +2 dB in bars 1-4 so ' +
        'the music (not the sweep) makes the air. Hall return >= 6 dB under the piano; mono loss <= 1 LU.',
    },
    {
      name: 'build3',
      bars: 8,
      bpm: 134,
      transpose: 0,
      energy: 0.84,
      role: 'build',
      melody: { fromBar: 16, bars: 4 },
      chords: ['F', 'F/A', 'Gm/Bb', 'F/C', 'Gm7', 'Dm/F', 'A7', 'Dm', 'Bbadd9', 'Bbadd9', 'Bbadd9', 'Bbadd9', 'Cadd9', 'Cadd9', 'Dsus4', 'D'],
      notes:
        'BUILD 3 - THE BIG ONE, sets up the KEY LIFT. Bars 1-4: "Lihyot am chofshi..." on the supersaw lead at +12 ' +
        '(low-pass opening from 2 kHz to AT MOST 6 kHz) = the front, with the full choir "ah" (melody in the soprano) ' +
        '3 dB BEHIND it and the piano 8th chords; kick back on quarters, claps 2 and 4 then every beat in bar 4, snare ' +
        'quarters from bar 3. Bars 5-8 (no melody): the bass RISES Bb (2 bars) -> C -> D MAJOR (Dsus4 -> D) so the drop ' +
        'lands a whole step up in E minor; supersaw 8th stabs opening to 6 kHz (NOT full; vel <= 0.75), distorted ' +
        'power-chord guitars on whole notes, kick roll 8ths (bars 6-7) -> 16ths (bar 8 beats 1-2), snare 16ths -> 32nds ' +
        '(ending vel 0.8), chop roll rising an octave (ending vel 0.7), noise riser all 8 bars (~14 dB under the kick, ' +
        'width <= 0.6), bass-suck high-pass in bars 7-8, music bus narrowing to ~0.7, master lane flat at -3.5 dB. ' +
        'SILENCE: the last 2 beats of bar 8 - a quiet vocal breath is allowed, but the gap peaks <= -28 dBFS ' +
        '(cut 1: -15 dBFS hall wash). Last bar >= 1 LU under drop3.',
    },
    {
      name: 'drop3',
      bars: 8,
      bpm: 134,
      transpose: 2,
      energy: 0.93,
      role: 'drop',
      melody: { fromBar: 0 },
      chords: VERSE,
      notes:
        'DROP 3A - THE MAIN STAGE, in E MINOR (+2): "Kol od balevav" as a Tiesto supersaw anthem (classical tune, ' +
        'long notes over a pounding big-room beat). Lead = 9-voice supersaw at +12 (cutoff 9.5k, env 0.7, quiet ' +
        'noise-air layer HP 8k) with a 0-octave layer at -10 dB, piano octaves for attack (same grid timing), choir ' +
        '"ah" chords wide. STRINGS: one sustained legato line at +12 on the long notes only (>= 4 sixteenths), ' +
        'portamento, no re-attack, never at -12. Supersaw wall cutoff 12k. Lament bass E D C B A G | B E as a ROLLING ' +
        'big-room bass (.xxx.xxx.xxx.xxx) over a sub. Drums: big-room kick with the "tok" layer, clap+snare 2 and 4, ' +
        'offbeat open hats, 16th hats, STRAIGHT 16th SHAKER, crash on bars 1 and 5. Distorted power-chord guitars ' +
        'double-tracked L/R. Downbeat: IMPACT + sub drop (ending 36 Hz) + crash. SILENCE: the last beat of bar 8 ' +
        '(double-drop gap; second half <= -30 dBFS). ' +
        'CUT 3 - THE LOW END IN TUNE (brief section 7): the big-room kick tail is the TONIC E1 = 41.2 Hz (was B1 61.7, ' +
        'a semitone under the C bass and the strongest note under every tonic bar), hold 0.03 s / tau 0.13 s, tok + ' +
        'click + drive kept; the SUB stem plays pcAtOrAbove(pc, 28) in drop3/3b/3c so E sits on E1 (the +12 mid layer ' +
        'stays on E3). Sub share 18-26 %, sub <= low + 2 dB, limiter GR <= 2 dB. THE PHONE LADDER: drop 3 must beat ' +
        'drop2b on a phone by >= 0.4 LU - wall chords -11.5 dB at width 1.15, gtr_dist +1.5, lead +1, choir +1 in D3.',
    },
    {
      name: 'drop3b',
      bars: 8,
      bpm: 134,
      transpose: 2,
      energy: 0.97,
      role: 'drop',
      melody: { fromBar: 8 },
      chords: DROP_BIG,
      notes:
        'DROP 3B - THE DOUBLE DROP: the refrain hook (E, high E-E-E) with everything. Supersaw lead + drop 2\'s vocal ' +
        'chops as an ANSWER (8th stutters from the second 8th of each long note, silent on short notes - never a ' +
        'unison), choir, bells at +24, strings on the long notes, ride on the quarters (+2 dB), straight 16th shaker, ' +
        'crash every 4 bars, muted guitar 16th chugs, bass rolling with octave hops. All tune doubles on the ' +
        'supersaw grid (timing sigma 0). Downbeat: IMPACT + crash. Bar 8: 2-beat snare fill, no gap.',
    },
    {
      name: 'drop3c',
      bars: 8,
      bpm: 134,
      transpose: 2,
      energy: 1,
      role: 'drop',
      melody: { fromBar: 8 },
      chords: DROP_BIG_DECEPTIVE,
      notes:
        'DROP 3C - THE DROPS UNITE THROUGH THE PIANO HOOK. Drop 3B continues + drop 1\'s POP-PIANO OCTAVES back at ' +
        '+12 on the supersaw grid (the callback; the piano was the record\'s first voice). NO lead guitar, NO acoustic ' +
        'strums here (low-mid mush under the wall). Escalate from the TOP - straight 16th shaker, ride, crash EVERY 2 ' +
        'BARS, the +24 16th pluck arpeggio sparkling above the wall (HP 1.2k / LP 8k), a high E6 pedal on bells/choir, ' +
        'claps add the "and" of 4 - and from the BOTTOM (kick/sub as drop3, tonic-tuned). Never from more midrange. ' +
        'Targets (cut 3): short-term max <= -7.8 LUFS, sub + low >= mid + 10 points, mid <= 34 %, presence >= 9 %, phone ' +
        'sim >= drop3b + 0.3 LU. ' +
        'The final half-bar is a DECEPTIVE cadence (B7 -> Cmaj7 under the held E): crash + reverse swell into the ' +
        'tag; drums stop after beat 3 of bar 8.',
    },
    {
      name: 'tag',
      bars: 2,
      bpm: [134, 100],
      transpose: 2,
      energy: 0.72,
      role: 'outro',
      melody: { fromBar: 18 },
      chords: ['Gm7', 'Dm/F', 'A7', 'Dmadd9'],
      notes:
        'TAG - the last line again, BROADENING (ritardando, as the anthem is traditionally sung). No kick or hats: ' +
        'each half-bar chord is ONE big sustained hit - supersaw chords + piano + choir "ah" + strummed guitars + a ' +
        'deep tom/sub boom: Am7, Em/G, B7, then the FINAL HIT exactly on the melody\'s last note (bar 2 beat 3) = ' +
        'Em(add9) + crash + impact + sub drop. Melody on supersaw lead +12 + piano octaves, choir soprano 3 dB ' +
        'BEHIND them; strings may hold the long notes at +12 (never -12) and voice the final chord. Impact and sub ' +
        'booms stay above 35 Hz (cut 1: fx_hit was 70 % of the sub band here). CUT 3 - BROAD, NOT SWIMMING: the hall ' +
        'was the loudest signal in the tag (-19.2 vs the lead -21). Tag hall sends piano -13, choir -6, choir_lead -8, ' +
        'strings -10, chords -14, return width 0.85; outro sends unchanged so the ring-out stays lush. Hall <= lead - 4 dB.',
    },
    {
      name: 'outro',
      bars: 2,
      bpm: 100,
      transpose: 2,
      energy: 0.2,
      role: 'outro',
      melody: null,
      chords: ['Dmadd9', 'Dmadd9', 'Dmadd9', 'Dmadd9'],
      notes:
        'RING-OUT. No new attacks: the final Em(add9) hit from the tag (sustain, do not retrigger) and every ' +
        'reverb/delay tail decay to digital silence by the end of bar 2 (last 200 ms below -60 dBFS). The game ' +
        'replays from the top (intro teaser, 126 BPM).',
    },
  ],
};

// Machine-readable cues so every part agrees on the same moments. Bars/beats are 1-based within a section.
export const cues = {
  // beats of TOTAL silence at the very end of these sections (every stem stops; reverb/delay tails may ring)
  silenceBeats: { build1: 1, build2: 2, drop2: 0.5, build3: 2, drop3: 1 },
  // what lands on the section's downbeat: 'impact' = sub boom + noise hit + crash; 'crash' = crash only;
  // 'soft' = quiet sub swell, no cymbal
  downbeat: {
    verse1: 'soft', drop1: 'impact', drop1b: 'crash', verse2: 'crash', drop2: 'impact', drop2b: 'crash',
    build3: 'soft', drop3: 'impact', drop3b: 'impact', drop3c: 'crash',
  },
  // the last attack of the song: the melody's final note in 'tag'; everything rings out from here
  finalHit: { section: 'tag', bar: 2, beat: 3 },
  // kick tail tuning (Hz) by key. CUT 3 (brief section 7 "Low-end pitch"): the drop-3 big-room kick is tuned to the
  // TONIC, E1 = 41.2 Hz (cut 2 used the 5th, B1 61.7 Hz, a semitone under the C bass and the strongest note under
  // every tonic bar). D minor keeps A1 = 55 Hz (D1 is below 40 Hz, D2 too high for a full kick) with shorter tails.
  kickTailHz: { 'D minor': 55, 'E minor': 41.2 },
  // kick envelopes (s) the tunings assume (Musician B's b-kit KICKS): shorter tails so the bass owns the 2nd 16th
  kickEnvelope: { pop: { hold: 0.008, tau: 0.13 }, club: { hold: 0.01, tau: 0.13 }, bigroom: { hold: 0.03, tau: 0.13 } },
  // sub-stem register floor (MIDI) by key: pcAtOrAbove(pc, floor). E minor 28 puts the tonic on E1 (41.2 Hz), so every
  // sub fundamental is inside 40-75 Hz (cut 2 used 29 everywhere, which left E on E2 = 82.4 Hz). Applies to the SUB
  // stem in drop3 / drop3b / drop3c; the +12 'bass' mid layer stays on pcAtOrAbove(pc, 29) + 12 (E3) for phones.
  subFloorMidi: { 'D minor': 29, 'E minor': 28 },
  // who carries the tune (the front-most melody layer) per section; octaves relative to the anthem register
  melodyLead: {
    intro: 'grand piano 0/+12 + vocal chop +12',
    verse1: 'felt piano 0',
    verse1b: 'felt piano 0 + choir "oo" 0',
    build1: 'vocal chop +12 (filtered)',
    drop1: 'piano +12/0 + clean lead guitar +12 + pluck +12 (one composite, in front of the bass)',
    drop1b: 'bars 1-4 clean lead guitar +12 alone (piano answers +12 in the long notes); bars 5-8 as drop1 + choir "oh" 0',
    verse2: 'clean electric lead guitar 0 + Rhodes',
    build2: 'vocal chop +12 (filtered)',
    drop2: 'vocal chops +12 (round-robin; +24 at -16 dB (cut 3), 0 "oh") + pluck +12 double',
    drop2b: 'vocal chops +12 call, funk guitar answers in the long notes',
    breakdown: 'grand piano 0 (+12 on high Ds) in front all 8 bars; choir "ah" soprano doubles bars 5-8, 3 dB behind (cut 3)',
    build3: 'supersaw +12 (filtered, <= 6 kHz); choir "ah" soprano 3 dB behind',
    drop3: 'supersaw +12 (0-octave layer -10 dB) + piano octaves; strings legato +12 on long notes',
    drop3b: 'supersaw +12 + bells +24; chops answer in the long notes',
    drop3c: 'supersaw +12 + drop-1 pop-piano octaves +12 (callback) + bells +24; chops answer',
    tag: 'supersaw +12 + piano octaves; choir soprano 3 dB behind',
  },

  // ---------------- CUT 2 (recut session 2) targets: brief section 6 + section 14. Informational for the parts. ----------------
  // DROP DELTA: for each build -> drop, measured on the final WAV (momentary = 400 ms BS.1770 windows):
  //   buildLastBarMomMax <= dropMeanMomentary - ceilingLU  and  >= dropMeanMomentary - floorLU
  //   dropBar1Mean >= buildLastBarMean + landLU;  drop first 4 s vs build last 2 s: presence >= -2 dB, air >= -4 dB
  dropDelta: {
    pairs: [['build1', 'drop1'], ['build2', 'drop2'], ['build3', 'drop3']],
    ceilingLU: 1, floorLU: 4, landLU: 1.5, payoffPresenceDb: -2, payoffAirDb: -4,
  },
  // the second half of each silence window, 50 ms RMS on the final WAV (dBFS); tails decay, they do not swell
  gapMaxDb: { build1: -30, build2: -30, drop2: -27, build3: -28, drop3: -30 },
  // the build narrows, the drop opens: music-bus width over the last 2 bars of each build -> on the drop downbeat
  widthIntoDrop: { buildEnd: 0.7, drop: 1.1 },
  checks: {
    drops: { presenceMinusMidDb: -6, airMinusMidDb: -11, presenceCorr: 0.3, airCorr: 0.15, crestDb: [7.5, 9.5] },
    drop1: { subPlusLowMaxPct: 48, midPlusPresenceMinPct: 33, hookUnderKickDb: [2, 3] },
    // cut 3: the bottom counts sub + low (the tonic-tuned kick and E1 sub move energy below 60 Hz on purpose);
    // the fatigue cap moves 32 -> 34 % because shrinking the kick boom lifts every other band's share
    drop3c: { stMaxLufs: -7.8, midMaxPct: 34, presenceMinPct: 9, subPlusLowMinusMidMinPts: 10 },
    verses: { lowmidMaxPct: 30, presenceMinPct: 6 },
    breakdown: { presenceMinPct: 4, airMinPct: 1.5, hallUnderPianoDb: 6, midCorrMin: 0.4, monoLossMaxLu: 1, fxSweepAirMaxPct: 30 },
    subsonicFloorHz: 35,
    loudestMoment: ['drop3b', 'drop3c', 'tag'],
    // ---------------- CUT 3 (recut session 3) rows: brief sections 6 "Build rise", 7 "Low-end pitch", 14 cut-3 checks
    lowEndPitch: {
      fftPoints: 65536,                                       // one 1.49 s Hann FFT of the Mid channel per drop bar
      eMinor: { rubSemitones: 2, tailUnderSubDb: 6, tonicStrongestBelowHz: 100 },
      dMinor: { tailMaxOverBbDb: 0, drop2TonicWithinDb: 6 },  // drop1/1b tonic bars: report only (light pop drop)
    },
    drop3Sub: { subPctRange: [18, 26], subOverLowMaxDb: 2, limiterGrMaxDb: 2, monoLossMaxLu: 0.8 },
    // phone sim = mono fold-down, HP 350 Hz 24 dB/oct, K-weighted section mean; each value = min LU over the previous
    phoneLadder: [['drop2b', 'drop3', 0.4], ['drop3', 'drop3b', 0.3], ['drop3b', 'drop3c', 0.3]],
    buildRise: {
      build2: { bar1VsPrevSectionLu: -2, bar1PhoneVsPrevSectionLu: -3, riseLu: 1.5, riseToBar: 7, maxDipLu: 0.3, midBars56VsBars34Db: -4 },
      build3: { riseLu: 1.5, riseToBars: [5, 6], maxDipLu: 0.3, overBreakdownLastBarLu: 0.5 },
    },
    tag: { hallUnderLeadDb: 4, monoLossMaxLu: 1 },
    render: { maxSec: 240, aimSec: 230, keysPartMaxSec: 45 },
  },
};
