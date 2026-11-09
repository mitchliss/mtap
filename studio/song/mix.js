// Hatikvah (MTap festival mix) - Musician B's mix & master. CUT 3 (recut session 3, SESSION-3.md B1-B10).
// The one idea: the build is thin, bright noise and snare; the DROP brings the width, the lows and the hook.
// Cut 3 adds: a low end in tune (drop 3's kick and sub share the tonic E1; drops 1-2 kick tails get out of the Bb1 /
// D2 sub's way with a faster sub release), drop 3 grows on a phone (the wall, dist guitars, lead and choir come up in
// D3, the wall narrows), builds 2 and 3 rise bar by bar, and the breakdown / tag halls sit UNDER their dry carriers.
// Signal flow (API.md section 9):
//   drum stems -> drums bus (glue 4:1, tape sat, 4x soft clip; parallel "crush" bus fed by kick/snare/clap/tom sends) -> master
//   sub + bass -> bass bus (mono < 150 Hz, tube harmonics for phones, build "bass suck")                           -> master
//   keys / gtrs / synths / leads / vox sub-buses -> music bus (2:1 glue, air shelf, bass suck, hall swell, width ride) -> master
//   music bus -> parallel "air" bus (HP 8 kHz, narrow, open only in the drops)                                      -> master
//   fx stems -> fx bus                                                                                              -> master
//   returns: plate 1.3 s, hall 2.8 s, room 0.6 s, echo 1/8d ping-pong (tempo-following)                             -> master
// Sidechain: trigger-list volume shaping from the drum part's 'pump' list (the four-on-the-floor kicks), with a depth
// per section, and the 'ghost8' list for the breakdown pad pulse.
// Faders are per-stem constants plus per-section rides (gain lanes): one engineer riding the desk, not a loop.
// Cut 2 master: no crescendo into any silence (the builds sit UNDER the drops), every reverb return ducks 12 dB and the
// hall high-passes at 500 Hz inside each silence window, the music bus narrows to 0.7 over each build's last 2 bars and
// opens to 1.1 on the downbeat, and no M/S widening stacks past ~1.3 anywhere (mono phone fold-down).
// Post-chain: soft clip (4x) -> true-peak limiter -1 dBTP, normalised to -9.5 LUFS integrated.

export default function mix(studio) {
  const SEC = studio.sections, S = (n) => studio.section(n), tl = studio.timeline;
  const PUMP = studio.triggerTimes('pump'), GHOST = studio.triggerTimes('ghost8'), KICK = studio.triggerTimes('kick');
  const DROPS = ['drop1', 'drop1b', 'drop2', 'drop2b', 'drop3', 'drop3b', 'drop3c'];
  const D1 = ['drop1', 'drop1b'], D2 = ['drop2', 'drop2b'], D3 = ['drop3', 'drop3b', 'drop3c'];
  const has = (n) => studio.stems.has(n);

  // ------------------------------------------------------------------------------------------- helpers
  const inSecs = (times, names) => { const ss = names.map(S); return times.filter((t) => ss.some((s) => t >= s.start - 1e-6 && t < s.end - 1e-6)); };
  const rel = (r) => (typeof r === 'string' ? (t) => tl.noteLen(r, t) : r);
  /** volume-shaper sidechain inserts: depth (dB) per section name, one Ducker per depth */
  function pump(depthBySec, { list = PUMP, release = '1/8', attack = 0.002, hold = 0.008, shape = 'smooth', curve = 1 } = {}) {
    const g = new Map();
    for (const [sec, d] of Object.entries(depthBySec)) if (d > 0) { if (!g.has(d)) g.set(d, []); g.get(d).push(sec); }
    return [...g].map(([d, secs]) => ({ type: 'duck', times: inSecs(list, secs), depthDb: d, attack, hold, release: rel(release), shape, curve })).filter((x) => x.times.length);
  }
  const each = (names, v) => Object.fromEntries(names.map((n) => [n, v]));
  /** automation lane over the whole song: `base` everywhere, overridden per section by a value or by [[bar, value], ...] */
  function lane(base, map = {}) {
    const pts = [];
    for (const s of SEC) {
      const v = map[s.name];
      if (Array.isArray(v)) for (const [bar, x] of v) pts.push([s.at(bar), x]);
      else { const x = v ?? base; pts.push([s.start, x], [s.end, x]); }
    }
    return pts;
  }
  const eq = (...bands) => ({ type: 'eq', bands });
  /** kick HP lane for a D-minor drop: `base` Hz, raised to 66 Hz across bar 3 (Bbmaj7, the bVI): the A1 tail steps out
   *  of the Bb1 sub's way for that one bar (~-5 dB at 55 Hz), the 80-120 Hz punch is untouched (cut 3, brief section 7). drop2b's Bb1 is short offbeat 8ths, so 72 Hz there */
  const bbBar = (base, hz = 66) => [[0, base], [1.98, base], [2.0, hz], [2.98, hz], [3.0, base], [8, base]];
  const comp = (threshold, ratio, attack, release, o = {}) => ({ type: 'comp', threshold, ratio, attack, release, knee: 6, ...o });

  // ---- the silence windows (cues.silenceBeats): [section, gapStartBar, midGapBar] in that section's bars
  const GAPS = { build1: [3.75, 3.875], build2: [7.5, 7.75], build3: [7.5, 7.75], drop2: [7.875, 7.94], drop3: [7.75, 7.875] };
  /** a return's gain lane: `base` dB, ducked by `depth` from each gap start to mid-gap, back on the downbeat (B2) */
  const gapDuck = (base, map = {}, depth = 12) => lane(base, { ...map, ...Object.fromEntries(Object.entries(GAPS).map(([s, [g0, g1]]) => {
    const b = typeof map[s] === 'number' ? map[s] : base;
    return [s, [[0, b], [g0, b], [g1, b - depth], [S(s).bars, b - depth]]];
  })) });
  /** the hall's high-pass: steps to 500 Hz at each gap start, back to 300 on the downbeat (B2) */
  const gapHp = (base, inGap) => lane(base, Object.fromEntries(Object.entries(GAPS).map(([s, [g0]]) => [s, [[0, base], [g0 - 0.001, base], [g0, inGap], [S(s).bars, inGap]]])));

  // build "bass suck": high-pass on everything that is not drums, 30 -> 300 Hz across bars 7-8 of build2/build3
  const SUCK = lane(18, {
    build1: [[0, 18], [2, 18], [3.75, 140], [4, 140]],
    build2: [[0, 18], [6, 30], [7.5, 300], [8, 300]],
    build3: [[0, 18], [6, 30], [7.5, 300], [8, 300]],
    // pre-gap thinning: the low end drains out of the music over the last beats before the drop2 half-beat gap and
    // the drop3 double-drop gap, so the next downbeat lands on an empty floor
    drop2: [[0, 18], [7.375, 18], [7.875, 220], [8, 220]],
    drop3: [[0, 18], [7.25, 18], [7.75, 320], [8, 320]],
  });
  // music bus hall swell into each silence (the "air" in the gap). Cut 2: peaks -24 / -22 / -22 (was -14 / -12 / -12)
  const HALL_SWELL = lane(-70, {
    build1: [[0, -70], [2, -40], [3.75, -24], [4, -70]],
    build2: [[0, -70], [4, -40], [7.5, -22], [8, -70]],
    build3: [[0, -70], [4, -40], [7.5, -22], [8, -70]],
  });
  // last beat of drop1b: throw the hooks into the hall
  const throwAt = (sec, fromBar, base, peak) => lane(base, { [sec]: [[0, base], [fromBar - 0.01, base], [fromBar, peak], [8, peak]], [SEC[S(sec).index + 1].name]: [[0, peak], [0.5, base], [1, base]] });
  // cut 2 width law: the drops open to 1.1 on the downbeat, each build narrows to 0.7 over its last 2 bars
  const MUSIC_WIDTH = lane(0.6, {
    intro: 0.85,
    build1: [[0, 1], [2, 1], [3.75, 0.7], [4, 0.7]],
    build2: [[0, 1], [6, 1], [7.5, 0.7], [8, 0.7]],
    build3: [[0, 1.1], [6, 1], [7.5, 0.7], [8, 0.7]],
    // cut 3: the breakdown and the tag lost 1.4-1.5 LU in mono; their width comes from the (now drier) hall and the
    // natively stereo choir / piano, not from M/S on the whole music bus
    // drop 3: 1.0 (its width is the native L/R guitars and spread supersaws; mono loss <= 0.8 LU)
    breakdown: 0.95, ...each(DROPS, 1.1), ...each(D3, 0.95), tag: 0.95, outro: 1,
  });

  // send level (dB) from the music bus into the parallel air bus, per section (-120 = off)
  // (fed by the keys, guitars and synths sub-buses, NOT the synthesized voices: chops, choir and lead keep their own top)
  const AIR = lane(-120, { intro: -8, verse1: -4, verse1b: -3, verse2: -6, ...each(D1, -3), ...each(D2, -4), ...each(D3, -10), breakdown: 7, tag: -8, outro: -10 });
  // the drums' own top (hats, shaker, crash, clap/snare crack) into the same air bus: the drops' sparkle, in the Mid channel
  const DRUM_AIR = lane(-120, { verse1b: -10, verse2: -9, ...each(D1, -6), ...each(D2, -11), ...each(D3, -12) });

  // ------------------------------------------------------------------------------------------- stems
  const stems = {
    // ===== drums =====
    kick: {
      // cut 3 (B1): drop 3's big-room kick is now tuned to E1 with a short tail; its D3 lane is set by the sub-band rows
      // (sub share 18-26 %, sub <= low + 2 dB, limiter GR <= 2), not by a blind offset: the E1 kick carries ~4.5 dB less
      // K-weighted energy than cut 2's held B1, so it comes UP to -7.6 (range -11 .. -7.5). B3: a 50-52 Hz HP in drops
      // 1-2 takes ~2 dB off the A1 tail so the D2 sub speaks over it, and on the Bb bars it rises to 66 Hz (bbBar)
      bus: 'drums', gain: -9,
      auto: {
        gain: lane(-8, { verse1: -13.5, verse1b: -12.5, build1: -10, verse2: -12.5, build2: -10.5, breakdown: -8, build3: -11, drop1: -9.5, drop1b: -9.5, drop2: -9.5, drop2b: -9.5, ...each(D3, -7.6) }),
        hp: lane(22, { ...each(D1, bbBar(52)), drop2: bbBar(50), drop2b: bbBar(50, 72), build2: [[0, 22], [6, 22], [7.5, 90], [8, 90]], build3: [[0, 22], [6, 22], [7.5, 90], [8, 90]] }),
      },
      inserts: [eq({ type: 'hp', freq: 30, slope: 24 }, { type: 'ls', freq: 52, gain: -3, q: 0.7 }, { type: 'peak', freq: 105, gain: 2, q: 1.1 }, { type: 'peak', freq: 330, gain: -3, q: 1.4 }, { type: 'peak', freq: 3800, gain: 2.5, q: 0.9 }),
        { type: 'clipper', ceiling: -2.5, knee: 2, oversample: 4 }],
      sends: { crush: -4, room: -24 },
    },
    snare: {
      bus: 'drums', gain: -9,
      auto: { gain: lane(-9, { build1: -8.5, build2: -10, build3: -10 }) },
      inserts: [eq({ type: 'hp', freq: 120, slope: 24 }, { type: 'peak', freq: 200, gain: 1.5, q: 1.2 }, { type: 'peak', freq: 900, gain: -1.5, q: 1 }, { type: 'hs', freq: 6000, gain: 2 })],
      sends: { plate: -10, crush: -3, room: -16 },
    },
    clap: {
      bus: 'drums', gain: -3,
      auto: { gain: lane(-3, { verse1b: -5, verse2: -6 }) },
      inserts: [eq({ type: 'hp', freq: 250, slope: 24 }, { type: 'peak', freq: 1150, gain: 1, q: 1 }, { type: 'peak', freq: 2600, gain: 1.5, q: 1.2 }, { type: 'hs', freq: 8000, gain: 2 })],
      sends: { plate: -9, crush: -7 },
    },
    snap: {
      bus: 'drums', gain: -2,
      inserts: [eq({ type: 'hp', freq: 400, slope: 24 }, { type: 'hs', freq: 5000, gain: 2 })],
      sends: { room: -8, plate: -16 },
    },
    hats: {
      // cut 2: +2.5 to +3.5 dB in every drop (the drop's top end lives here, not in the build), no M/S widening
      bus: 'drums', gain: -9,
      // the kit's hats are rendered decorrelated L/R; width 0.35 folds them to a placed point source (R 15) so their top
      // lands in the Mid channel (mono phone fold-down), +2 dB restores the per-channel level
      // cut 3 (B9, daily-repeat fatigue): drop2/2b -0.5 -> -1.5 (-2.5 cost drop 2 its pres - mid >= -6 dB row)
      auto: { gain: lane(-7, { verse1b: -4, build1: -5, drop1: -0.5, drop1b: -4, verse2: -4, drop2: -1.5, drop2b: -1.5, build3: -4, ...each(D3, -3) }) },
      inserts: [eq({ type: 'hp', freq: 600, slope: 24 }, { type: 'hs', freq: 10000, gain: 1.5 })],
      width: 0.35, sends: { room: -20 },
    },
    perc: {
      bus: 'drums', gain: -10,
      auto: { gain: lane(-8.5, { intro: -5.5, verse1: -3, verse1b: -4, verse2: -5.5, drop2: -7, drop2b: -7, breakdown: -5, ...each(D3, -6.5) }) }, // cut 3: the breakdown shaker (bars 5-8) up 3.5 dB: real air, not the sweep
      inserts: [eq({ type: 'hp', freq: 400, slope: 24 }, { type: 'hs', freq: 9000, gain: 1 })],
      width: 0.45, sends: { room: -16, plate: -24 },
    },
    ride: { bus: 'drums', gain: -8.5, width: 0.6, inserts: [eq({ type: 'hp', freq: 350, slope: 24 }, { type: 'peak', freq: 5000, gain: -1, q: 1 })], sends: { hall: -22 } },
    cymbals: {
      // cut 2: the downbeat crash is the payoff, so it must read on a phone: no 4.2 kHz cut, HP 450, +4 dB in the drops
      bus: 'drums', gain: -5,
      auto: { gain: lane(-5, { ...each(DROPS, -1), breakdown: 0 }) },
      inserts: [eq({ type: 'hp', freq: 450, slope: 24 }, { type: 'hs', freq: 12000, gain: 1 })],
      width: 1.1, sends: { hall: -18 },
    },
    toms: {
      bus: 'drums', gain: -4,
      auto: { gain: lane(-4, { drop2b: -7, breakdown: -11, tag: -18, outro: -18 }), 'send:hall': lane(-22, { breakdown: -16, tag: -15, outro: -10 }) }, // cut 3: the timpani rolls a little drier (hall under the dry carriers)
      inserts: [eq({ type: 'hp', freq: 40, slope: 24 }, { type: 'peak', freq: 300, gain: -2, q: 1.2 }, { type: 'peak', freq: 4000, gain: 2, q: 1 })],
      sends: { plate: -14, room: -12, crush: -8, hall: -22 },
    },

    // ===== bass =====
    sub: {
      // cut 2: drop 1 is the light pop drop, drop 3 grows at the bottom. Cut 3: the drop 3 sub sits on E1 with the kick
      // (B1: set by the sub-band rows: share 18-26 %, and with the low band the bottom >= mid + 10 points in drop3c). B3: in the D-minor drops the kick duck releases in 0.09 s (was
      // 0.12), so the sub is back by the 2nd 16th and the Bb1 / D2 notes sound over the kick's A1 tail; drop 3 keeps 0.12
      bus: 'bass', gain: -2, width: 0,
      auto: { gain: lane(-2, { verse1: -5, verse1b: -4.5, drop1: -5.2, drop1b: -5.2, drop2: -1.8, drop2b: 1.0, drop3: 1.5, drop3b: 1.2, drop3c: 2.5, tag: -3.5, outro: -5 }) },
      inserts: [eq({ type: 'hp', freq: 28, slope: 24 }, { type: 'lp', freq: 115, slope: 24 }),
        ...pump({ verse1: 3, verse1b: 6, build1: 8, verse2: 8, build2: 9, build3: 10 }, { release: 0.12, attack: 0.001, hold: 0.012 }),
        ...pump({ breakdown: 4 }, { list: KICK, release: 0.15 }),
        ...pump(each([...D1, ...D2], 12), { release: 0.09, attack: 0.001, hold: 0.012 }),
        ...pump(each(D3, 12), { release: 0.12, attack: 0.001, hold: 0.012 })],
    },
    bass: {
      bus: 'bass', gain: -1.5,
      auto: { gain: lane(-1.5, { ...each(D1, -6), ...each(D2, -0.5), drop3: 0.8, drop3b: 0.8, drop3c: -0.3 }) }, // cut 3: the rolling E-minor bass is drop 3's 60-250 Hz now that the kick boom is gone
      inserts: [eq({ type: 'hp', freq: 60, slope: 24 }, { type: 'peak', freq: 250, gain: -2.5, q: 1.1 }, { type: 'peak', freq: 900, gain: 1.5, q: 1 }),
        comp(-16, 3, 0.005, 0.08),
        ...pump({ verse1b: 3, build1: 5, verse2: 5, build2: 6, build3: 6 }, { release: 0.11, attack: 0.001 })],
      duck: { trigger: inSecs(PUMP, DROPS), depthDb: 8, attack: 0.001, hold: 0.008, release: 0.11 },
    },

    // ===== keys =====
    piano: {
      // cut 2 (B7): -3 dB at 300 Hz, HP 90 Hz in the verses (the LH now sits at E2 and up), a little 3.5 kHz for phones
      bus: 'keys', gain: 0, filter: { hp: 70, slope: 24 },
      auto: { gain: lane(0, { breakdown: -1, build3: -3, tag: -2, outro: -2 }), hp: lane(70, { verse1: 90, verse1b: 90, verse2: 90 }), 'send:hall': lane(-15, { breakdown: -13, tag: -13, outro: -9 }) }, // cut 3: the hall sits under the dry piano (B6/B7)
      inserts: [eq({ type: 'peak', freq: 300, gain: -4, q: 1 }, { type: 'peak', freq: 520, gain: -2, q: 1.4 }, { type: 'peak', freq: 3500, gain: 2, q: 0.9 }, { type: 'hs', freq: 9000, gain: 2 }),
        comp(-16, 2.5, 0.01, 0.15),
        { type: 'resonance', notes: [38, 45, 50, 52, 55, 57, 60, 62, 64, 67, 69, 74], decay: 2.5, mix: 0.1 }],
      sends: { plate: -20, hall: -15, echo: -28 },
    },
    piano_pop: {
      bus: 'keys', gain: -4, width: 1.1,
      auto: { 'send:hall': throwAt('drop1b', 7.75, -18, -4), width: lane(1.1, each(D3, 0.8)) }, // cut 3: the drop3c callback sits in the centre
      inserts: [eq({ type: 'hp', freq: 180, slope: 24 }, { type: 'hs', freq: 3000, gain: 3 }, { type: 'peak', freq: 450, gain: -3, q: 1 }),
        comp(-14, 4, 0.002, 0.06), { type: 'exciter', freq: 3000, amount: 0.15 },
        { type: 'clipper', ceiling: -11, knee: 3, oversample: 4 }, // shave the hammer spikes, keep the tone
        // cut 3 (B9): a light sympathetic-string halo (the engine Piano now has its own soundboard, so this is the open
        // strings ringing, not a second body). Pitches common to D minor and E minor: E A D G C
        { type: 'resonance', notes: [40, 45, 50, 52, 55, 57, 60, 62, 64, 67, 69], decay: 2, mix: 0.06 },
        ...pump(each(DROPS, 2))],
      sends: { plate: -16, hall: -18, echo: -24 },
    },
    piano_stab: {
      // cut 2 (B4): the drop1/1b offbeat stabs on their own strip: piano_pop's chain, tight, under the hook, 3 dB pump
      bus: 'keys', gain: -8, width: 1.1,
      inserts: [eq({ type: 'hp', freq: 180, slope: 24 }, { type: 'hs', freq: 3000, gain: 3 }, { type: 'peak', freq: 450, gain: -3, q: 1 }),
        comp(-14, 4, 0.002, 0.06), { type: 'clipper', ceiling: -14, knee: 3, oversample: 4 }, ...pump(each(D1, 3))],
      sends: { plate: -20, room: -18 },
    },
    rhodes: {
      bus: 'keys', gain: -7,
      inserts: [eq({ type: 'hp', freq: 80, slope: 24 }, { type: 'peak', freq: 300, gain: -1.5, q: 1 }, { type: 'peak', freq: 2500, gain: 1, q: 1 }), comp(-17, 2, 0.01, 0.15)],
      sends: { plate: -16, echo: -24 },
    },

    // ===== guitars =====
    gtr_acoustic: {
      bus: 'gtrs', gain: -11.5,
      auto: { gain: lane(-10.5, { verse1b: -10, verse2: -9.5, tag: -12, outro: -12 }) },
      inserts: [eq({ type: 'hp', freq: 120, slope: 24 }, { type: 'peak', freq: 220, gain: -2.5, q: 1 }, { type: 'peak', freq: 2500, gain: 1.5, q: 1 }, { type: 'hs', freq: 9000, gain: 2 }),
        comp(-13, 3, 0.005, 0.1), { type: 'exciter', freq: 3500, amount: 0.12 },
        ...pump(each(DROPS, 4))],
      sends: { room: -12, plate: -22 },
    },
    gtr_clean: {
      // cut 2: the drop2b funk answer licks come up ~5.5 dB so they answer the chops instead of hiding under them
      bus: 'gtrs', gain: -5,
      // cut 3 (B6): breakdown bars 1-4 +2 dB (the D6 / A6 harmonics make the top), and width 0.7 there: their baked
      // ping-pong echo is mostly Side, which is what cost the breakdown its mono fold-down
      auto: { gain: lane(-5, { drop2b: 0.5, breakdown: [[0, -3], [4, -3], [4.5, -5], [8, -5]] }), 'send:echo': lane(-12, { breakdown: -40 }), width: lane(1.1, { breakdown: 0.7 }) },
      inserts: [eq({ type: 'hp', freq: 110, slope: 24 }, { type: 'peak', freq: 350, gain: -2, q: 1 }, { type: 'peak', freq: 2200, gain: 1.5, q: 1 }), comp(-19, 2.5, 0.006, 0.12),
        { type: 'chorus', rate: 0.7, depth: 3, delay: 11, voices: 2, mix: 0.35 }, ...pump(each(DROPS, 3))],
      width: 1.1, sends: { echo: -12, plate: -18 },
    },
    gtr_lead: {
      bus: 'gtrs', gain: -4.5,
      auto: { gain: lane(-3, { verse2: -2, drop1: -1.5, drop1b: -0.5 }), 'send:hall': throwAt('drop1b', 7.75, -20, -5) },
      inserts: [eq({ type: 'hp', freq: 130, slope: 24 }, { type: 'peak', freq: 400, gain: -1, q: 1 }, { type: 'peak', freq: 2500, gain: 1.5, q: 1 }), comp(-16, 3, 0.004, 0.1), { type: 'clipper', ceiling: -12, knee: 3, oversample: 4 }, ...pump(each(DROPS, 2))],
      sends: { plate: -16, echo: -16, hall: -20 },
    },
    gtr_muted: {
      bus: 'gtrs', gain: -9.5,
      auto: { gain: lane(-9.5, { drop1: -6, drop1b: -6, build2: -8 }) },
      inserts: [eq({ type: 'hp', freq: 120, slope: 24 }, { type: 'peak', freq: 250, gain: -2, q: 1 }, { type: 'peak', freq: 1600, gain: 1.5, q: 1 }), comp(-15, 3, 0.003, 0.08), ...pump(each(DROPS, 4))],
      sends: { room: -13 },
    },
    gtr_dist: {
      // cut 3 (B2): +1.5 dB in drop 3 (the phone band: the L/R power chords carry 1-4 kHz)
      bus: 'gtrs', gain: -13,
      auto: { gain: lane(-13, { drop3: -11.5, drop3b: -11.5, drop3c: -11.8 }) }, // the dist gtr is mid-heavy (raw 250-800 Hz sits 4 dB under its 0.8-3 kHz)
      inserts: [eq({ type: 'hp', freq: 100, slope: 24 }, { type: 'peak', freq: 300, gain: -2.5, q: 1 }, { type: 'peak', freq: 2000, gain: 1, q: 1 }), ...pump(each([...D3, 'build3', 'tag'], 4))],
      width: 0.9, sends: { room: -20 }, // cut 3: the doubles are already hard L/R; no extra M/S on top (mono loss)
    },

    // ===== synths / orchestra =====
    chords: {
      bus: 'synths', gain: -13,
      // cut 3: build2 stabs +2 dB from bar 5 (B4: they sat ~15 dB under the kick); the drop 3 wall -11.5 at width 1.15
      // (B2: 1.15; 1.0 measured, for the drop 3 mono loss); tag hall send -14 (B7), the outro keeps -10 for the ring-out
      auto: { gain: lane(-13, { build1: [[0, -10], [2, -10], [2.01, -7], [3, -7], [3.01, -6.5], [4, -6.5]], build2: [[0, -10], [4, -10], [4.01, -8], [8, -8]], build3: -11, drop3: -11.5, drop3b: -11.5, drop3c: -12.5, tag: -12 }), width: lane(1.25, { ...each(DROPS, 1.3), ...each(D3, 1) }), 'send:hall': lane(-16, { tag: -14, outro: -10 }) },
      inserts: [eq({ type: 'hp', freq: 150, slope: 24 }, { type: 'peak', freq: 300, gain: -3, q: 1 }, { type: 'peak', freq: 400, gain: -2.5, q: 0.9 }, { type: 'lp', freq: 11000, slope: 12 }),
        ...pump({ build1: 6, build2: 6, build3: 6, drop3: 8, drop3b: 8, drop3c: 8 })],
      width: 1.25, sends: { hall: -16 },
    },
    pad: {
      bus: 'synths', gain: -16,
      // cut 3 (B9): drop 2 was the narrowest drop; its pumping saw pad comes up -14 -> -12.5 (-11.5 cost the pres - mid row)
      auto: { gain: lane(-16, { drop1: -15, drop1b: -15, drop2: -12.5, drop2b: -12.5 }), width: lane(1.3, each(DROPS, 1.3)) },
      inserts: [eq({ type: 'hp', freq: 200, slope: 24 }, { type: 'peak', freq: 350, gain: -2.5, q: 1 }),
        ...pump({ verse1b: 3, build1: 6, drop1: 8, drop1b: 8, verse2: 4, build2: 6, drop2: 10, drop2b: 10, build3: 6 }),
        ...pump({ breakdown: 4 }, { list: GHOST, release: '1/8' })],
      width: 1.3, sends: { hall: -12 },
    },
    strings: {
      // cut 2, re-measured (Musician A's request): the legato arrangement already plays 2.6-4.9 dB quieter than cut 1, so
      // each drop3 lane is set to put the strings AT or just under the supersaw wall (chords), not at a blind -10:
      // drop3 -7, drop3b -7.5, drop3c -10 (net -5.8 to -7 dB vs cut 1). Build3 -9 tames the swells. The tag stays -10.
      // Cut 3: drop3c -9.5 with the wall at -12.5 and the choir at -11.5 there: the lead's own 250-800 Hz sits right at the
      // check's "low-mid 3 dB under the mids" line, so the 0.8-3 kHz strings and the less low-mid choir move it, not the hook
      bus: 'synths', gain: -6,
      auto: { gain: lane(-6, { breakdown: -9, build3: -9, drop3: -7, drop3b: -7.5, drop3c: -9.5, tag: -10, outro: -10 }), 'send:hall': lane(-12, { breakdown: -10, tag: -10, outro: -7 }) }, // cut 3: breakdown / tag hall -10 (B6/B7)
      inserts: [eq({ type: 'hp', freq: 110, slope: 24 }, { type: 'peak', freq: 300, gain: -2, q: 1 }, { type: 'peak', freq: 400, gain: -2.5, q: 0.9 }, { type: 'peak', freq: 3000, gain: 1, q: 1 }), ...pump(each(DROPS, 3))],
      width: 1.1, sends: { hall: -12 },
    },

    // ===== leads =====
    lead: {
      // cut 3 (B2): +1 dB in drop 3 (the hook carries the phone ladder). B7: the tag's lead is the dry carrier, so its
      // own hall send comes down -7 -> -11 (the breakdown's soft +12 double -7 -> -11 too); the outro keeps -7
      bus: 'leads', gain: 1.5,
      auto: { gain: lane(1.5, each(D3, 2.5)), 'send:hall': lane(-12, { breakdown: -11, tag: -11, outro: -7 }) },
      inserts: [eq({ type: 'hp', freq: 300, slope: 24 }, { type: 'peak', freq: 3000, gain: 2, q: 0.9 }), { type: 'ott', depth: 0.2, time: 0.6 }, ...pump(each([...DROPS, 'tag'], 3))],
      width: 0.9, sends: { plate: -14, hall: -12, echo: -18 },
    },
    pluck: {
      // cut 2: drop 1 hook layer up 1-2 dB (the summed hook sits 2-3 dB under the kick); drop 2 pluck double 5-7 dB under the chops
      bus: 'leads', gain: -2,
      auto: { gain: lane(-2, { drop1: -1, drop1b: 0, drop2: -0.7, drop2b: -1.1 }), 'send:hall': throwAt('drop1b', 7.75, -20, -6) },
      inserts: [eq({ type: 'hp', freq: 200, slope: 24 }, { type: 'peak', freq: 3000, gain: 1.5, q: 1 }), ...pump(each(DROPS, 2))],
      sends: { echo: -12, plate: -18, hall: -20 },
    },
    pluck_arp: {
      bus: 'leads', gain: -7, auto: { width: lane(1.2, each(D3, 1)) }, // cut 3: drop3c mono loss
      inserts: [eq({ type: 'hp', freq: 1200, slope: 24 }, { type: 'lp', freq: 8000, slope: 12 })],
      width: 1.2, sends: { echo: -14, hall: -16 },
    },
    bells: {
      bus: 'leads', gain: -3,
      // cut 3 (B6): the breakdown's D6 pedal + D7 pings (bars 1-4 only) +4 dB, so the music makes the top, not the sweep
      auto: { gain: lane(-3, { breakdown: 1.5 }), 'send:hall': lane(-9, { breakdown: -5 }), width: lane(1.1, each(D3, 0.9)) },
      inserts: [eq({ type: 'hp', freq: 600, slope: 24 }, { type: 'hs', freq: 8000, gain: 2 })],
      width: 1.1, sends: { hall: -9 },
    },
    chops: {
      bus: 'leads', gain: -5.5,
      auto: {
        gain: lane(-5.5, { build1: -7.5, build2: -7.5, build3: -7, drop3b: -9.5, drop3c: -9.5 }),
        'send:hall': lane(-20, { drop2b: [[0, -20], [7.5, -20], [7.51, -5], [8, -5]], breakdown: [[0, -5], [1, -20], [8, -20]] }),
        'send:echo': lane(-14, { drop2b: [[0, -14], [7.5, -14], [7.51, -6], [8, -6]], breakdown: [[0, -6], [1, -14], [8, -14]] }),
      },
      inserts: [eq({ type: 'hp', freq: 300, slope: 24 }, { type: 'peak', freq: 550, gain: -1.5, q: 1 }, { type: 'peak', freq: 1500, gain: -2, q: 1.2 }, { type: 'peak', freq: 3200, gain: 2.5, q: 1 }, { type: 'hs', freq: 7000, gain: 1 }), { type: 'exciter', freq: 3500, amount: 0.1 }, ...pump(each(DROPS, 3))], // cut 3 (B8): less treble stacking
      sends: { plate: -15, echo: -14, hall: -20 },
    },
    chops_echo: {
      bus: 'leads', gain: 0,
      auto: { gain: lane(0, each(D2, 3)), width: lane(1.1, each(D3, 0.85)) }, // cut 3 (B9): drop 2 width; drop 3 mono loss
      inserts: [eq({ type: 'hp', freq: 400, slope: 24 }, { type: 'lp', freq: 8000, slope: 12 })],
      width: 1.1, sends: { plate: -14, hall: -12 },
    },

    // ===== vox =====
    choir: {
      // cut 2: -2.5 dB at 400 Hz (B5) on top of the 300 Hz cut; together they give the ~-4 dB at 350 Hz B7 asks for
      bus: 'vox', gain: -12,
      // cut 3: +1 dB in drop 3 (B2); breakdown / tag hall sends -3 -> -6 (B6/B7), the outro keeps -3
      auto: { gain: lane(-12, { breakdown: -9, drop3: -11, drop3b: -11, drop3c: -11.5, tag: -11 }), 'send:hall': lane(-6, { breakdown: -6, tag: -6, outro: -3 }), width: lane(1.2, each(D3, 0.9)) },
      inserts: [eq({ type: 'hp', freq: 180, slope: 24 }, { type: 'peak', freq: 300, gain: -2, q: 1.2 }, { type: 'peak', freq: 400, gain: -2.5, q: 0.9 }, { type: 'peak', freq: 2900, gain: 2, q: 1 }, { type: 'hs', freq: 8000, gain: 2 }),
        comp(-13, 2.5, 0.01, 0.15), ...pump(each(DROPS, 5))],
      width: 1.2, sends: { hall: -6, plate: -20 },
    },
    choir_lead: {
      bus: 'vox', gain: -3.5,
      // cut 3 (B6): the grand leads breakdown bars 5-8 and the choir soprano doubles it 3 dB behind: -6.5; hall sends
      // -5 -> -8 in the breakdown and the tag (the outro keeps -5)
      auto: { gain: lane(-3.5, { verse1b: -5.5, drop1b: -8, verse2: -5.5, breakdown: -6.5, build3: -9.5, tag: -10.5, outro: [[0, -10.5], [2, -13]] }), 'send:hall': lane(-8, { breakdown: -8, tag: -8, outro: -8 }) }, // cut 4: no +5.5 dB jump at the outro
      inserts: [eq({ type: 'hp', freq: 160, slope: 24 }, { type: 'peak', freq: 300, gain: -2, q: 1 }, { type: 'peak', freq: 3000, gain: 2, q: 1 }, { type: 'hs', freq: 10000, gain: 2 }),
        comp(-15, 3, 0.006, 0.12), ...pump(each(DROPS, 4))],
      width: 1.1, sends: { hall: -8, plate: -14, echo: -22 },
    },

    // ===== fx =====
    fx_rise: { bus: 'fx', gain: -9, inserts: [eq({ type: 'hp', freq: 150, slope: 12 })], width: 0.8, sends: { hall: -16 } },
    fx_sweep: { bus: 'fx', gain: -6, auto: { gain: lane(-6, { drop1b: -10, verse2: -10, drop2b: -10, breakdown: [[0, -10], [2, -10], [2.5, -6.5], [8, -6.5]] }) } /* cut 3 (B6): the reverse cymbals were 47 % of the breakdown's air */, inserts: [eq({ type: 'hp', freq: 150, slope: 12 })], sends: { hall: -16 } },
    fx_hit: { bus: 'fx', gain: -5.5, bassMono: 150, auto: { gain: lane(-5.5, { intro: -10, verse1: -10, drop1: -10.5, breakdown: -7, build3: -8, drop3: -9, tag: -14.5, outro: -14.5 }) }, inserts: [eq({ type: 'hp', freq: 35, slope: 24 }, { type: 'peak', freq: 110, gain: 1.5, q: 1 })] },
    fx_breath: { bus: 'fx', gain: -19, inserts: [eq({ type: 'hp', freq: 500, slope: 12 })], sends: { plate: -10 } },
  };
  for (const k of Object.keys(stems)) if (!has(k)) delete stems[k];

  // ------------------------------------------------------------------------------------------- buses & returns
  const buses = {
    // drums: glue 4:1, 10 ms / 100 ms, ~2-3 dB GR, a little tape-style saturation. Cut 2: no M/S widening in the drops
    // Cut 3 (B1): a narrow 64 Hz notch (Q 12: -0.7 dB at the pop kick's 55 Hz, -0.1 at 41 Hz) AFTER the bus clipper. The kit carves 62.5 Hz on the E1 kick, but the bus sat and
    // clipper rebuild the kick's beat-rate partials there, and they land phase-locked on the C2 / B1 sub notes'
    // sidebands (drop3b bar 3 measured 5.9 dB under C2 with the bus as it was, 6.4 with the notch; the 41 Hz boom and the
    // 80-120 Hz punch are untouched)
    drums: { gain: 0, auto: { width: lane(1, { intro: 0.75, verse1: 0.7, verse1b: 0.75, verse2: 0.7, ...each(DROPS, 1) }), 'send:air': DRUM_AIR }, sends: { air: -120 }, bassMono: 120, inserts: [comp(-15, 4, 0.01, 0.1, { knee: 4 }), { type: 'sat', shape: 'tanh', drive: 2.5, mix: 0.3 }, { type: 'clipper', ceiling: -12, knee: 2.5, oversample: 4 }, eq({ type: 'peak', freq: 64, gain: -9, q: 12 })] },
    // parallel crush (fed by kick/snare/clap/tom sends): slammed, saturated, high-passed so the sub is not doubled
    crush: { out: 'drums', gain: -10, inserts: [eq({ type: 'hp', freq: 90, slope: 24 }, { type: 'peak', freq: 3000, gain: 2, q: 0.8 }), comp(-32, 10, 0.001, 0.05, { knee: 3, makeup: 14 }), { type: 'sat', shape: 'tanh', drive: 6, mix: 1 }] },
    bass: {
      gain: 0, bassMono: 150, auto: { hp: SUCK },
      // cut 3: tube harmonics for phones split higher (90 -> 110 Hz) and a touch lighter (0.35 -> 0.3): with the E1 sub the
      // old split let C2 / B1 leak into the saturator, where it intermodulated with the pumped bass and smeared a beat-rate
      // sideband into 60-64 Hz; the comp is lighter too (-18 -> -14), so the sub is not pumped twice
      inserts: [{ type: 'sat', shape: 'tube', drive: 4, mix: 0.3, lowcut: 110 }, comp(-14, 2, 0.01, 0.12)],
    },
    keys: { out: 'music', gain: 0, sends: { air: -120 }, auto: { 'send:air': AIR } },
    gtrs: { out: 'music', gain: 0, inserts: [comp(-20, 2, 0.01, 0.15)], sends: { air: -120 }, auto: { 'send:air': AIR } },
    synths: { out: 'music', gain: 0, sends: { air: -120 }, auto: { 'send:air': AIR } },
    leads: { out: 'music', gain: 0, inserts: [comp(-18, 2, 0.008, 0.12), eq({ type: 'peak', freq: 4500, gain: 1.5, q: 0.8 }), { type: 'exciter', freq: 4500, amount: 0.08 }] },
    vox: { out: 'music', gain: 0, sends: { air: -120 }, auto: { 'send:air': lane(-120, { breakdown: -2 }) }, inserts: [comp(-18, 2, 0.01, 0.15), { type: 'exciter', freq: 4000, amount: 0.1 }] },
    music: {
      gain: 0, auto: { hp: SUCK, 'send:hall': HALL_SWELL, width: MUSIC_WIDTH }, sends: { hall: -70 }, bassMono: 160,
      inserts: [comp(-16, 2, 0.02, 0.2, { knee: 8 }), eq({ type: 'hs', freq: 10000, gain: 1.5 })],
    },
    // parallel air bus (B3 fallback, B7): an HP'd copy of the music bus = a section-automated high shelf. Open in the drops,
    // verses and breakdown, shut in the builds so the top end arrives WITH the drop. Narrow, so it lands in the Mid channel.
    air: { gain: 0, filter: { hp: 3200, slope: 12 }, width: 0.6, inserts: [comp(-24, 4, 0.0005, 0.04)] }, // fast comp on the spikes only: sizzle, not extra transient peaks
    fx: { gain: 0 },
  };
  // the verses stay intimate; the drops open up. Cut 3: drop 3's returns 0.85 (the wash is mostly Side: mono loss)
  const VERB_W = lane(1, { verse1: 0.75, verse1b: 0.75, verse2: 0.65, ...each(D3, 0.85) });
  // cut 3 (B6/B7): the hall gets its own width lane, 0.85 in the breakdown and the tag (wet behind dry, mono-safe)
  const HALL_W = lane(1, { verse1: 0.75, verse1b: 0.75, verse2: 0.65, breakdown: 0.85, ...each(D3, 0.85), tag: 0.85 });
  const returns = {
    plate: { type: 'reverb', preset: 'plate', decay: 1.3, predelay: 0.015, width: 1, gain: 1.5, auto: { gain: gapDuck(1.5, { verse1: 0, verse1b: 0, verse2: 0.5 }), width: VERB_W }, eq: [{ type: 'hp', freq: 300 }, { type: 'lp', freq: 9000 }], duck: { trigger: inSecs(PUMP, DROPS), depthDb: 3, release: rel('1/8') } },
    hall: {
      type: 'reverb', preset: 'hall', decay: 2.8, predelay: 0.03, width: 1, gain: 2,
      filter: { hp: 300, lp: 7000 },
      // the breakdown opens the hall's top 7 -> 9.5 kHz (B7); inside each silence window it ducks 12 dB and HPs at 500 (B2)
      // cut 3: return -2 dB in the breakdown and -2.5 in the tag (on top of the drier sends) so the dry piano / lead
      // lead; it comes back to 0 over the outro's first bar, so the final hit's ring-out is as lush as cut 2's
      auto: { gain: gapDuck(2, { verse1: -1.5, verse1b: -1.5, verse2: -0.5, breakdown: 0, tag: -2.5, outro: [[0, -2.5], [1, 0], [2, 0]] }), width: HALL_W, 'send:air': lane(-120, { breakdown: 0 }), hp: gapHp(300, 500), lp: lane(7000, { breakdown: [[0, 8000], [6, 11000], [8, 11000]], build3: [[0, 11000], [1, 7000], [8, 7000]] }) },
      duck: { trigger: inSecs(PUMP, DROPS), depthDb: 3.5, release: rel('1/4') },
      sends: { air: -120 }, // the breakdown's wet piano / choir is most of its sound: open its top too
    },
    room: { type: 'reverb', preset: 'room', decay: 0.6, width: 1, gain: 1, auto: { gain: gapDuck(1), width: VERB_W }, eq: [{ type: 'hp', freq: 200 }, { type: 'lp', freq: 9000 }] },
    echo: { type: 'delay', sync: '1/8d', feedback: 0.35, pingpong: true, hp: 400, lp: 6000, gain: -1, auto: { gain: gapDuck(-1) }, sends: { hall: -14 }, duck: { trigger: inSecs(PUMP, DROPS), depthDb: 3, release: rel('1/8') } },
  };

  return {
    stems: { '*': { bus: 'music', gain: -6, eq: [{ type: 'hp', freq: 100 }] }, ...stems },
    buses, returns,
    master: {
      // cut 2: no master crescendo into any silence (brief section 6 drop delta)
      auto: { gain: lane(0, {
        intro: -4, verse1: -3.2, verse1b: -2.6,
        build1: [[0, -3], [2, -3], [3.75, -3], [4, -3]],
        verse2: -0.4,
        // cut 3 (B4, brief section 6 "Build rise"): near-flat through bar 7's first half so the arrangement's rise (stabs
        // opening, chop roll in 8ths, claps 2/4 -> every beat, chords lane) reads bar by bar, +0.2 dB where the second half
        // starts (bar 5: the melody stops, the stabs and the clap take over); it falls to -3 by bar 7.5,
        // so the ceiling window (the 4 beats before the gap) is exactly where cut 2 had it. No crescendo into the gap.
        build2: [[0, -2.45], [4, -2.2], [4.01, -2.0], [6, -2.0], [6.5, -2.3], [7, -3.15], [8, -3.15]],
        breakdown: [[0, -3.5], [7, -3.5], [8, -3.6]],
        // cut 3 (B5): rises to bar 6, end-point as cut 2. It starts 0.6 under the producer's -4.2 and climbs fastest over
        // bars 1-2, because bar 1 still carries the breakdown's hall tail and the sub swell (it measured 0.4 LU over bar 2)
        build3: [[0, -4.8], [2, -3.95], [6, -3.1], [7.5, -3.5], [8, -3.5]],
        // cut 3 (B2): drop 3 re-trimmed after the E1 kick (less K-weighted kick energy) so both ladders rise
        drop1: -0.45, drop1b: -0.55, drop2: -0.95, drop2b: -1.15, drop3: -1.5, drop3b: -1.4, drop3c: -1.3,
        // the tag's final hit (step 24) is the record's biggest single moment, then it rings out
        tag: [[0, -2.4], [1.45, -2.4], [1.5, -0.6], [2, -2.2]], outro: -2.4,
      }) },
      eq: [{ type: 'hp', freq: 25, slope: 24 }, { type: 'peak', freq: 250, gain: -0.5, q: 0.8 }, { type: 'peak', freq: 3200, gain: 1.2, q: 0.7 }, { type: 'hs', freq: 9000, gain: 2.5 }],
      glue: { threshold: -14, ratio: 2, attack: 0.03, release: 0.15, knee: 6, autoRelease: true },
      bassMono: 120,
      targetLufs: -9.95, // cut 3: -9.5 .. -10 (B10); a hair under -9.9 keeps drop3c's short-term max <= -7.8
      // soft clip shaves the transients, the true-peak limiter catches the clipper's overshoot: drop crest 8-9.5 dB
      clip: { ceiling: -3.2, knee: 2.6 },
      limiter: { ceiling: -2.9, release: 0.06, lookahead: 0.003 },
    },
  };
}
