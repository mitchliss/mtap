# MTap × God's Eye View — plan and options

Status: **proposal, nothing built.** Written 2026-11-25. God's Eye View (GEV) is vendored at
`vendor/gods-eye-view` (pinned 7646568a, see `vendor/README.md`).

## The short version

GEV is a CesiumJS app with a server of 54 key-holding proxies. MTap is plain three.js on
GitHub Pages with no server. So we can't merge the two apps, but four kinds of parts lift
cleanly, and they are the parts that make GEV look the way it does:

1. **Five camera "looks"**: night vision, thermal, CRT, cel-shaded, noir. Each one is plain
   GLSL with no Cesium-specific code (`src/styles/*.js`, 59-342 lines each).
2. **Real sky and orbit math**: sun and moon positions (`src/geo/celestial.js`) and satellite
   passes (`src/data/satellitePass.js`, which needs only `satellite.js`).
3. **Models and sky art**: the ISS (NASA, public domain), 35 aircraft and ships (MIT), and
   ESO's Milky Way cube map with the Yale bright-star catalogue (308 KB).
4. **Keyless and public-domain data**: USGS earthquakes (one CORS-open URL), NASA GIBS
   imagery, Natural Earth places and provinces, and Wikidata cities (CC0, 31,827 cities).

Everything else stays in `vendor/`: Google 3D tiles (billed key), live flights, ships and
fires (key or server), and all CCTV, military and person-tracking features (not for a
family game).

## Rules any option must keep (from PLAN.md)

- **The daily deal stays identical for everyone.** Live data may decorate a reveal, but it
  never chooses a place or changes a score. Anything that drives a round is frozen into
  `news.js` (append-only), as the news rounds are today.
- **No server, no keys.** Only keyless, CORS-open sources, or snapshots committed to the repo.
- **iPhone first.** p95 frame time ≤ 16.7 ms, the texture budget holds, every effect sits
  behind a `GFX` flag plus a Settings off-switch, and the game survives WebGL context loss.
- **Readability beats realism.** Nothing changes how the globe looks *while you are guessing*.
- **Licences.** Copied code keeps the MIT line (`Portions (c) 2026 Bilawal Sidhu, MIT`).
  Data comes only from the public-domain, CC0 or CC BY rows of GEV's `DATA_SOURCES.md`, and
  the CC BY ones get a credit line on the About screen. Non-commercial and share-alike data
  is never used.
- **Family framing.** No "surveillance" language. The looks get friendly names.

## Options

### A. "Eye in the sky" reveal layer: live data after you guess (recommended first)

When a round is revealed, and in "Explore the locations", the globe gains a few real-world layers:
- **Earthquakes** from the past day (USGS, keyless). A ring for each quake, sized by magnitude,
  plus a line in the discovery panel: "3 earthquakes within 500 km today."
- **The ISS**, using the GEV model, flying its real orbit. The orbit comes from a TLE snapshot
  committed weekly, so nothing is fetched live. The panel says "Next ISS pass over Cusco:
  Thu 19:42, visible", using `findNextSatellitePass`.
- **A sharper Moon**: MTap places the Moon by its mean longitude only, which can be several
  degrees off. `celestial.js` gives its true position and phase. This is a small, optional
  polish.

Where it plugs in: `experience.reveal()` and `enterOverview()` in `main.js`, plus a
`liveRoot` group in `globe.js` beside `markerRoot`, hidden by `_gameplayActive`. New
dependency: `satellite.js` (MIT, about 40 KB gzipped).
Cost: about 2-3 days. Risk: low, because gameplay doesn't change and a fetch failure only hides the layer.

### B. "Lenses": GEV's looks as a reward and a toy

The five shaders are ported to three.js as optional lenses: Night Owl (night vision), Heat Map
(thermal), Retro TV (CRT), Cartoon (cel) and Film Noir. They apply to:
- the reveal fly-in and Explore mode (a lens button);
- the **share card**: your result as a thermal or night-vision still. This is the feature
  people would post.
- unlocks: e.g. Retro TV after a 7-day streak and Heat Map after a 900+ game, which gives the
  streak something to win.

PLAN.md rules out post-processing for gameplay because of iOS memory. This option keeps to
that by rendering through an offscreen target **only while a lens is on and never during a
guess**. With the lens off, the frame path is unchanged and costs nothing. It needs an iPhone
p95 check, and the lens falls back to "off" on the low texture tier.
Cost: about 3-4 days (each shader takes about half a day to port and tune). Risk: medium, on iPhone performance.

### C. New round types built on GEV data (deterministic, via the news pipeline)

Each becomes a `news.js` entry, or a sibling list with the same append-only rules, written by
the existing daily news job, so the deal stays identical for everyone:
- **Quake round**: "A magnitude 6.8 earthquake struck here yesterday." Taken from USGS and
  frozen into the entry. The reveal shows the shaking rings. This is close to zero engine work,
  because it is a news round with a new chip and a ring effect.
- **From orbit** (weekly special): the clue is a satellite image of the place (MTap already
  streams Sentinel-2 tiles, and NASA GIBS adds true- and false-colour views), shown through the
  Heat Map or Night Owl lens. You guess where it is. This one is new for MTap and the hardest.
- **Follow the ISS**: "Where was the space station at 12:00 UTC today?" It is computed from the
  committed TLE, so everyone gets the same answer. Scored on distance like any other round.

Cost: the quake round takes about 1 day; From orbit and Follow the ISS take about 2-3 days
each. Risk: medium, because the difficulty needs play-testing and From orbit needs a curated
image per place.

### D. Better data under the existing game (invisible but useful)

- Natural Earth **states and provinces** (public domain) add a "right state/province" partial
  credit tier between "right country" and distance. Big countries (US, Russia, Brazil, China)
  currently get no credit for a near-miss in the right state.
- **Wikidata cities** (CC0, 31,827 cities) replace the 66 KB `cities.json` in the discovery
  panel's "nearby cities", loaded in 5° tiles so the download stays small.
- The **ESO Milky Way and bright stars** replace the procedurally baked sky. This needs a side-by-side look first, because the current sky may read better at game zoom.

Cost: about 2 days. Risk: the province tier changes scores, so it needs an oracle test proving
past deals and scores are untouched (apply it from a start puzzle number, as heritage does).

### E. Full merge into a Cesium + Google 3D-tiles game (not recommended)

This would give photorealistic cities, but it needs a billed Google key and a server, which
breaks static hosting and the "no keys" rule. It also doubles the iPhone memory load and
throws away MTap's tuned globe. It is listed only so the choice is explicit.

## Recommended path

| Phase | What | Why first |
|---|---|---|
| 1 | **A** (reveal layer) + **Quake round** from C | Visible and new, with no gameplay risk; reuses the news pipeline |
| 2 | **B** (lenses + share cards + streak unlocks) | The most "God's Eye" feel; gated behind a perf check |
| 3 | **D** (province credit, richer cities) | Fairer scoring; needs the oracle test |
| 4 | **From orbit** and **Follow the ISS** from C | The new modes, built once the lenses exist to dress them |

Each phase goes through the same loop as v4.0: written plan, Codex review, one atomic
commit, `npm test` plus an iPhone p95 check before it reaches `main` (pushing to `main`
deploys).

## Decisions for Mitch

1. Which options, and in what order? The recommendation is A + Quake → B → D → From orbit / ISS.
2. Lenses: free toys, or **unlocks** earned by streaks and scores?
3. Province partial credit (D): yes or no? It changes future scores, never past ones.
4. Is "Follow the ISS" a regular Sunday round or a one-off special?

## Housekeeping found while doing this

- `npm test` fails on `main` today (`test/mobile.mjs` "touch tap reaches game callback",
  `test/detail.mjs` `this.missing` undefined). This failure was already there before this
  branch. CI only builds and does not run the tests, so it hasn't been noticed. Fix it before
  phase 1.
