# Plan: MTap v4.0 — News days, deep-zoom feel, day/night Earth
_Locked via claudex-loop — Claude (fable) + Mitch. Build: Codex (sol). MAX_ROUNDS=5. Research tier: web._

## Context

Mitch (owner; the family plays daily on iPhones) asked for three things: (1) at least 3 days each
week the daily puzzle should feature a location tied to current news ("Mudslide in Nepal/China
border", "Flash flood in Grand Canyon") to reward current-events knowledge; (2) the globe still
feels "jumpy" when zoomed in a lot; (3) make the graphics cooler than maptap.gg. Interrogation
locked: news = scheduled-agent pipeline; news round replaces one normal slot (total stays /1000);
graphics = full day/night Earth, perf-gated.

Repo: `C:\Users\mliss\Documents\marctap` — Vite static site, three.js r0.166, deployed to GitHub
Pages (mitchliss.github.io/mtap) on every push to `main`. Hard invariants: the daily deal is
deterministic and identical for every player (`dailyPicksFor` chain, `POOL_TIERS` pins past days to
pack-prefix lengths — **`src/locations.js` is append-only; deleting/reordering any row re-deals
played days**); no server, no accounts — state is localStorage + share-link payloads.

## Goal

Ship v4.0: a 📰 news round on ~40% of days (seeded deterministic roll — Mitch's random-gate
refinement) fed by committed data from a daily scheduled Claude routine
(never a client-side fetch — determinism); one-finger and pinch control that tracks the finger 1:1
at every altitude with no mid-gesture hitches; and a sun-lit Earth (real terminator, NASA city
lights, sun-relative atmosphere, ocean glint, drifting clouds) that holds 60fps on iPhone and never
hurts gameplay readability.

## Approach

### Workstream A — 📰 News days

1. **`src/news.js` (new, append-only):** `export const NEWS = [{ pn, slot, name, prompt, lat, lng,
   country, continent, diff, fact, force?, allowNear?, offshore? }]`. `pn` = the puzzle number the
   entry targets (future-only at commit time); `slot` (0–4) = which round it takes (editorial score
   weight); `prompt` = the headline shown during the round ("Flash flood in Grand Canyon"); `name`
   = the place revealed after; `force: true` = manual entry on a no-roll day; `allowNear: true` =
   documented override of the 100km recent-collision rule (justification string required);
   `offshore: true` + `country: null` = reviewed at-sea/no-country event (scoring floors skip, as
   the game already handles). Reuses the v3.10 clue mechanism (`loc.prompt`) — no new round
   machinery. Entries are never edited or removed once their day has been dealt (replays/archive
   depend on it).
2. **Injection in `src/game.js` `dailyPicksFor`:** for day `k >= NEWS_START` (a LITERAL puzzle
   number written once at build time and never advanced — committed entries must stay reachable by
   archive replays forever), if `NEWS` has an entry for `k`, replace the slot named by the entry's
   explicit `slot` field (0–4, editorial choice of score weight; validator-enforced) with the news
   location, flagged `isNews: true` — then **validate the resulting deal**: the replacement must
   not duplicate another slot's country, sit <100km from another slot, or REDUCE the deal's
   continent count below min(3, the base deal's count) — the "≥3 continents" contract stated at
   `game.js:23` is a comment the dealer never actually enforces (P-129-style stale claim; the
   build corrects the comment to describe reality and the injection stays non-degrading). On
   violation, deterministically try the other slots in fixed order before giving up (falling back
   to the unmodified deal). The news
   location then enters the 30-day no-repeat window and proximity exclusion for subsequent days
   (news overrides the exclusion for its own day by design — current events win). Cache exactly as
   picks are cached today. Days with no entry play completely normally. Injection requires
   `newsRollFor(k)` true OR the entry's explicit `force: true` (documented manual override) —
   stray data can't silently create off-schedule news days. (Practice-mode exclusions preview
   future deals; a next-day injection shifts that preview — harmless, exclusions are best-effort
   local hygiene, and the affected days are undealt.)
3. **UI:** `beginRound` shows a 📰 "In the news" chip (replacing the theme chip on that round) and
   label "Tap where this is happening…"; reveal shows `name` + `fact` as usual; share text gets a
   📰 marker on news days. End-screen row and overview work unchanged (they read `name`).
   **Theme coexistence:** on a themed day with news injected, the start-screen theme line appends
   "· 📰 plus one from this week's news" and the theme chip appears only on non-news rounds — the
   banner never claims five themed places when one is news.
3b. **Location-index consumers extended:** `archive.js`'s `indexByName` (used by `visitedPlaces`
   and `buildChallengePayload`) and `themes.js`'s index cover `LOCATIONS` ∪ `NEWS`; challenge
   payloads encode a news location as `100000 + newsIndex` (both arrays are append-only, so
   indices are stable; an older build decoding an unknown index already fails gracefully via the
   existing `importChallengePayload` null path). Visited-globe dots and replay shares therefore
   work on news places.
4. **`scripts/validate-news.mjs` (new, Node):** offline validator run before any commit of
   `news.js`. Prerequisite refactor: `geo.js` gains a pure `prepareCountries(geojson)` initializer
   (today `countryAt` reads module state populated only by the browser's `loadCountries(url)`
   fetch — a Node filesystem path can't feed it); the browser loader and the validator both call
   it, so there is ONE country-resolution implementation. Checks: country resolution **using the
   game's own `countryAt` from `src/geo.js`**
   (same semantics the reveal/scoring use, not an independent point-in-polygon; offshore/at-sea
   events allowed via an explicit `country: null` + reviewed-exception flag); duplicate-name check
   against `LOCATIONS` + `NEWS`; ≥5km from any static-pack pin (hard-dupe guard) AND ≥100km from
   anything dealt in the prior 30 days' chain unless the entry sets an explicit collision override
   (mirrors the game's real no-repeat policy); `pn` strictly greater than the current puzzle
   number computed by the `src/rng.js` epoch formula evaluated in ONE EXPLICIT scheduler timezone
   — `America/New_York`, the family's — passed as an explicit date, never ambient process-local
   time (players' puzzle numbers already roll at each device's local midnight by the game's
   existing design; the scheduler just needs its own fixed reference so "tomorrow" is unambiguous,
   and targeting tomorrow-in-ET keeps the entry ahead of every US player's rollover); `slot` in 0–4; schema/diff sanity; roll/force
   consistency (entry on a no-roll day requires `force`). (Lesson from v3.10: candidates are
   validated BEFORE committing, and nothing existing is ever touched.)
4b. **Immutable deal oracle:** before ANY selection-code change, capture a committed fixture of the
   dealt names for every puzzle 1..NEWS_START−1 (`test/fixtures/deals-through-<n>.json`); a
   regression script asserts byte-identity after the change and in every future news commit —
   "past days never change" becomes provable, not asserted.
5. **The news roll (Mitch's refinement, 2026-09-02):** whether a day is a news day is a seeded
   deterministic roll, not a fixed weekday: `newsRollFor(pn) = mulberry32(pn·17+3)() < 0.40` —
   exported from `news.js` so the routine, the validator, and any session compute the same verdict.
   ~40% of days ≈ 2.8 news days/week on average, unpredictable to players (same pattern as themed
   days). "No news" days are just 5 normal locations.
6. **Scheduled routine (created at the end of the build, with explicit user approval of the
   schedule):** a Claude scheduled task runs DAILY early morning and rolls `newsRollFor(tomorrow)`.
   On "no news" it exits. On "yes news": web-search the biggest news right now; pick ONE mappable,
   geographically interesting event (taste guardrail: prefer natural events, discoveries,
   expeditions, sports, science; avoid gruesome-attack sensationalism); write the entry targeting
   TOMORROW's puzzle (never today's — a same-day commit would give early players a different deal
   than late players); run the validator; build; commit (`news: #<pn> <headline>`); push. News is
   therefore at most ~a day old when played. A failed or missed run = that day falls back to the
   normal deal — silently graceful (the debug overlay records the reason). Manual injection stays
   possible anytime (any day — off-roll days need `force: true`) by editing `news.js` through the
   same validator. Routine hardening: idempotent (an existing entry for the target `pn` ⇒ exit);
   runs the validator AND the deal-oracle regression before pushing; commit message carries the
   headline + source URL; a push failure leaves no partial state. It commits straight to `main` —
   a PR-approval gate was considered and REJECTED: Mitch chose zero-touch, the blast radius is one
   validated data file, and rollback is `git revert`. NOTE: the 40% roll averages ~2.8 news
   days/week and some weeks will have fewer than 3 — Mitch's random-gate message (2026-09-02)
   supersedes the original "at least 3 each week"; if he wants a floor later, the roll becomes
   "seeded exactly-k-of-7" without touching anything else.

### Workstream B — Deep-zoom feel (diagnosed; line refs from recon)

Root causes measured: rotation is ~15× over-sensitive at `minDistance` (OrbitControls converts drag
pixels to an altitude-independent orbit angle — `OrbitControls.js:698-704` — while
`_tuneControls` at `globe.js:529-533` scales `rotateSpeed` only linearly in distance with a 0.08
floor); the Sentinel-2 patch build runs synchronously on the main thread mid-pinch
(`tiledetail.js:172-271`: ~2000 per-row blits, TWO full strokes of the 2.9MB world geojson with no
bbox culling, a 9,409-vertex geometry, a ~17MB mipmapped texture upload in one frame); and three of
the four smoothing filters are per-frame constants, so the feel differs between 60Hz and 120Hz and
lurches after any hitch.

1. **Altitude-proportional rotation:** replace `_tuneControls`'s curve with
   `rotateSpeed = clamp(alt * K_ROT, 0.006, 0.7)` where `K_ROT` is derived from the camera fov so a
   full-screen-height drag moves ≈1.1 screen-heights of ground at EVERY altitude
   (`K_ROT ≈ 1.1 · 2·tan(fov/2) / (2π)` ≈ 0.145; calibrate in the harness). This alone removes the
   15× divergence.
2. **dt-correct smoothing:** convert `GAP_EMA`/`AIM_EMA` to time-constant form
   (`1 − exp(−dt/τ)`, τ ≈ 0.045s to match current 60Hz feel), and normalize OrbitControls damping
   per frame (`controls.dampingFactor = 1 − exp(−dt/τ_damp)` before `update`, τ_damp ≈ 0.19s) so
   60Hz and 120Hz feel identical.
3. **Aim assist bounded by the screen, expressed per second:** the cap becomes a RATE —
   `maxStep = min(0.06, 0.5 · 2·alt·tan(fov/2)) · (dt/dtRef)` with `dtRef = 1/60` — so 120Hz and
   60Hz devices converge at the same speed; `AIM_LIVE_MS` drops 400→150ms so the settle stops
   driving rotation after fingers lift. All gesture filters (gap, aim midpoint) stay sampled once
   per `_tick` (they already are) in the dt-correct form — no per-pointer-event filtering.
4. **Tile pipeline off the critical path** (`tiledetail.js`):
   a. A build carries a **generation token**: a new gesture (pinch/drag start) aborts pending
      builds, and the final expensive steps — geometry creation, `CanvasTexture` creation, GPU
      upload, `_swapIn` — are DEFERRED to the first gesture-free frame, so a build started while
      still can never land its heavy tail mid-pinch. Level-jump rebuilds don't start during a
      gesture at all.
   b. Decode via full `fetch → blob → createImageBitmap` where the whole path feature-detects OK
      (CORS mode `cors`), keeping the current `Image` fallback; evicted bitmaps get
      `ImageBitmap.close()`.
   c. Bbox-cull the border stroke to the patch region before iterating rings (two full world passes
      → region-only).
   d. Time-slice the row-resample loop (≤6ms/frame chunks) AND instrument each build phase
      (mosaic, resample, borders, geometry, texture upload) with timings surfaced in the debug
      overlay (see B7) — the phases the slicing doesn't cover are exactly what the deferral in (a)
      keeps out of gestures.
   e. Patch texture KEEPS mipmaps (dropping them would shimmer on high-DPI phones); the upload cost
      is handled by (a)'s defer-to-idle. Patch canvases come from a POOL of three (current /
      outgoing-crossfade / building) recycled only after the owning texture is disposed — a
      `CanvasTexture` keeps its canvas as the live image source, so repainting a shared canvas
      would corrupt a patch mid-fade.
   e2. The shipping perf criterion applies to ALL visible frames, not just in-gesture ones — a
      post-release upload hitch is still a hitch. If the measured upload+mip time for a patch
      breaches the frame budget on-device, the builder drops to the next-lower patch resolution
      (1792 → 1280 → 896) and re-sharpens only after a quiet second.
   f. Tile cache: weighted LRU (bytes, not entries; ~32MB ceiling), bounded fetch concurrency (6),
      in-flight requests cancellable by the generation token.
7. **Debug/observability surface (`?debug=1`):** small overlay + `__marctap.debug()` dump — active
   GFX flags and quality tier, maxTextureSize, tile build phase timings + last failure, frame-time
   p50/p95 over the last 10s (visible-tab only), news decision for today (roll / entry / fallback
   reason), context-loss count. Failure paths stay player-silent but stop being diagnosis-silent.
5. **Micro-hitches:** cache the canvas rect (invalidate on resize) instead of per-frame
   `getBoundingClientRect` (`globe.js:549`); preallocate scratch `Vector3`/`Quaternion` for the aim
   path (`globe.js:1437-1444`); clamp polar angle to `[0.05, π−0.05]` so deep zoom near a pole
   can't whip.
6. **Proof harness:** extend `__marctap.zoom` with (a) `groundPerPixel(alt)` sweep asserting
   ground-motion-per-drag-pixel is constant ±15% across altitudes 0.04→1.5, and (b) a scripted
   pinch across a tile level-jump asserting no frame >30ms from the build path (drive `_tick`
   manually — the hidden pane runs no rAF). Record before/after numbers in the log.
   (Two-finger midpoint filtering inside OrbitControls is explicitly out of scope — item 1 reduces
   its amplification 15×; revisit only if the harness still shows midpoint-drift jitter.)

### Workstream C — Day/night Earth (each effect behind a `GFX` flag; perf-gated)

Texture budget rule (iOS Safari ceiling ~224-384MB canvas/WebGL): current spend is ~58MB (base
5400×2700 canvas) + ~17MB patch + sprites. New textures must fit: night ≤ 2700×1350 (~15MB),
clouds ≤ 2048×1024 grayscale-as-alpha (~8MB). No EffectComposer/bloom — additive sprites already
glow, and MSAA + composer would blow the budget (position to defend in review).

1. **Real sun:** compute the subsolar point from the date (standard solar declination + equation of
   time, ±1° is plenty); drive the existing `DirectionalLight` position from it each session (not
   per-frame), align `_makeSpaceScenery(sunPos)` and the sun glare to it. The Moon already takes
   scene lighting, so phases stay physically consistent for free.
2. **Terminator + city lights — one lighting model, no double-darkening:** the sun's darkness
   comes from Phong's own directional light ALONE (ambient lowered from 1.75 to the ~0.5 that
   yields a 0.35-luminance night side — the readability floor, never pitch black); the shader mod
   via `onBeforeCompile` adds only (a) an EMISSIVE city-lights term — Black Marble texture ×
   `smoothstep(0.10, −0.10, dot(worldNormal, sunDir))` so lights fade in across the terminator —
   and (b) a subtle warm tint in the terminator band. No second day/night multiply anywhere.
   r166 specifics pinned: the vertex shader declares a DEDICATED varying computed unconditionally
   — `vSunWorld = (modelMatrix * vec4(transformed, 1.0)).xyz` injected after
   `#include <begin_vertex>` (never rely on `worldPosition` from `<worldpos_vertex>`, which r166
   only declares when env-map/shadow/transmission paths are active); fragment injection after
   `#include <emissivemap_fragment>`; uniforms retained via closure + `material.userData`;
   `customProgramCacheKey` returns the GFX-flag variant; `material.needsUpdate` on flag flips.
   Night texture: NASA Black Marble 2016 (public domain, visibleearth.nasa.gov), shipped at
   2700×1350 in `public/textures/`. **The SAME shader mod + sun uniforms apply to the tile-detail
   patch material** via a shared `applySunShader(material)` helper — and the patch's city-lights
   lookup derives its equirectangular UV FROM THE WORLD POSITION
   (`uv = (atan(p.z,p.x)/2π + …, asin(p.y)/π + 0.5)` on the normalized varying), never the patch's
   local UVs (which span only the patch and would stretch the whole Black Marble across it).
   COORDINATE CONVENTION: this repo's `latLngToVec3` uses `z = −cos(lat)·sin(lng)`, so the
   world→equirect longitude is `atan(−p.z, p.x)` — the naive `atan(p.z, p.x)` mirrors east/west.
   A known-city alignment test (Tokyo's lights land on Tokyo) is part of C's verification.
2b. **Capability-based texture tier:** every texture (including today's 5400×2700 base composite,
   which already exceeds `MAX_TEXTURE_SIZE` 4096 on older iPhones) is resized on upload to
   `min(size, renderer.capabilities.maxTextureSize)`. Tier selection is CONSERVATIVE-FIRST on
   mobile: any touch/mobile device starts on the low tier (base 4096×2048, night 2048×1024, clouds
   1024×512 — `maxTextureSize` alone says nothing about available memory) and promotes to the high
   tier only after a clean first-session benchmark (frame-time p95 in budget, zero context losses,
   recorded in localStorage); any context loss demotes and pins low. Desktop starts high.
   The tier is chosen BEFORE any canvas or image target is allocated — the base composite canvas is
   created directly at the tier's dimensions (building 5400×2700 first and downscaling would incur
   exactly the peak backing-store pressure the tier exists to avoid).
   Peak-simultaneous-allocation inventory (canvas backing stores + decoded images + crossfade
   double-patch) recorded in the debug overlay.
3. **Atmosphere v2:** make the rim shader sun-relative — brighter blue scatter on the day limb,
   an orange-pink band where the rim crosses the terminator, `AdditiveBlending` (currently
   NormalBlending against a hardcoded view axis, `globe.js:411-432`).
4. **Ocean sun glint:** the Phong specular + existing synthetic specular map already do this once
   the light moves with the real sun — tune `shininess`/`specular` so the glint reads as a bright
   patch on oceans.
5. **Clouds:** one extra sphere (r=1.006), NASA Blue Marble cloud map as alpha, slow drift
   (~0.0015 rad/s), `depthWrite:false`, explicit `renderOrder` between globe and atmosphere.
   Opacity is EXACTLY 0 during any active-guess or reveal state and below camera distance 1.7;
   clouds exist only on the start screen, end screen, overview, and visited-globe views — a
   menu/post-game ornament, never an occluder while someone is aiming a pin.
6. **Star twinkle:** per-star phase attribute + tiny `onBeforeCompile` size/alpha flicker on the
   existing `PointsMaterial` (2200 pts) — no new geometry.
7. **Tone mapping (its own flag, LAST to land):** `ACESFilmicToneMapping`, exposure ≈1.15, after a
   full material inventory — every sprite/canvas-texture material audited for `toneMapped`, with
   before/after screenshots of each gameplay state (round, reveal, overview, end screen) as the
   regression check. If it muddies the canvas-drawn UI sprites, the flag ships OFF — it's polish,
   not load-bearing.
8. **iOS safety net (new, independent of flags):** one explicit render-loop lifecycle —
   `startLoop()`/`stopLoop()` owning `setAnimationLoop`, clock reset on resume, generation-token
   cancellation of in-flight tile work — driven by `visibilitychange` AND
   `webglcontextlost`/`webglcontextrestored`. Restore path = idempotent dispose/recreate of
   GPU resources (textures/geometries re-uploaded; scene graph and listeners NOT re-registered —
   built once, disposed/recreated by handle). Tested by driving `WEBGL_lose_context` twice in a
   row and backgrounding mid-reveal.
9. **Escape hatches:** all of C behind `GFX` flags; plus a Settings toggle "Realistic lighting"
   (default ON) that flips night-side/terminator off back to today's flat look — one tap if the
   family revolts, no redeploy.

### Delivery & sequencing (single build phase, three commits)

Commit 1: Workstream B (feel fix — pure win, no look change). Commit 2: Workstream C + version
bump v4.0 in `index.html` About line. Commit 3: Workstream A (news engine + validator; first news
entry targeting the next undealt day as a live smoke test). Push after local verification; poll
Pages; live-verify on production like the v3.10.1 emergency fix (drive `_tick` manually — hidden
pane rAF trap). Scheduled routine created LAST, after live verify, with explicit approval of the
exact schedule.

## Key decisions & tradeoffs

- **News via committed data + scheduled agent, never client-fetch** — Mitch floated "google at
  that moment" in-game; rejected because a static page can't search reliably (CORS, no API) and
  independent per-device fetches would give players DIFFERENT deals, breaking the shared daily +
  leaderboard. His random-gate idea is kept as the seeded 40% roll; the googling happens in the
  routine the day before, committed so everyone gets the identical round. A stale cached build
  differs only like existing pack-tier additions do (resolves on refresh).
- **News replaces a slot (stays /1000)** vs bonus round — comparability of family scores wins;
  news overrides the no-repeat exclusion for its own day by design.
- **`onBeforeCompile` on the existing Phong material** vs a from-scratch ShaderMaterial — keeps
  specular/fog/tile interplay and is the smallest diff; the custom-shader route is the fallback if
  the injection points fight back.
- **No post-processing/bloom** — iOS texture memory ceiling + MSAA already on; additive sprites
  supply the glow language.
- **Rotation fix = altitude-proportional rotateSpeed**, not a custom rotation controller — smallest
  change that kills the measured 15× divergence; midpoint filtering deferred.
- **Night side floored at 0.35 luminance + settings toggle** — realism never beats readability in a
  geography game.
- **Routine commits to `main`, no PR gate** (Codex R1 finding rejected) — solo-owner family repo,
  zero-touch was the chosen requirement, validator + deal-oracle run pre-push, revert is trivial.
- **40% Bernoulli roll, no ≥3/week floor** (Codex R1 finding resolved by user supersession) —
  Mitch's random-gate message replaces the original "at least 3"; a seeded exactly-k-of-7 variant
  is the documented upgrade path if he wants a floor.
- **Mipmaps stay on the tile patch** (Codex R1) — shimmer is worse than upload cost once uploads
  are deferred to gesture-free frames.

## Assumptions (confirmed by Mitch 2026-09-02)

1. Identical deal for every player is inviolable — news is committed data targeting future `pn`s.
2. News rounds reuse the `prompt` clue mechanism + 📰 chip; scored normally.
3. `news.js`/`locations.js` are append-only once dealt; past days never change (`POOL_TIERS`).
4. Jumpiness causes as measured by recon (rotateSpeed floor ~15× at minDistance; mid-pinch
   synchronous patch builds; per-frame-constant EMAs) — `globe.js`/`tiledetail.js` line refs above.
5. Graphics baseline as inventoried (no terminator/night-lights/clouds/tone-mapping/context-loss).
6. maptap.cc ≡ maptap.gg (surveyed 2026-08-23).
7. No domain skill packs on either bench — no Toolchain section.
8. Build = Codex (sol) full access; Claude reviews diff + runs proof (codex-build). Reviewer model:
   CLI default (unpinned), codex-cli 0.150.1.
9. NASA Black Marble 2016 + Blue Marble clouds are public domain (visibleearth.nasa.gov).
10. iOS Safari canvas/WebGL memory ceiling ~224-384MB → texture budget above (webkit.org bug
    219780, Apple dev forums threads 112218/687866).

## Risks / open questions

- iOS texture memory is close to the edge with night+clouds added — budget enforced above; if the
  device test shows pressure, first cut is the base composite 5400×2700 → 4096×2048.
- The look change is subjective — mitigated by the Settings toggle and per-effect flags.
- Scheduled routine runs daily and rolls the seeded gate — a missed run degrades
  gracefully to a normal day.
- News taste: the routine prompt carries the guardrail; Mitch can veto any entry before its day.
- OrbitControls damping normalization touches a vendored-library property per frame — harness must
  confirm no drift/oscillation at both 60 and 120Hz (dt override exists for this).
- Shader variant coverage: the shared sun shader must compile on both the globe Phong material and
  the patch material across every GFX-flag combination — smoke-compile each variant at boot in dev.

## Out of scope

Parked v4.0 ideas (speed round, picture clues, find-the-flag, family maps, country-hint option);
Versus/Elo; post-processing/bloom; any change to already-dealt days; client-side news fetching;
midpoint filtering inside OrbitControls (revisit on harness evidence).

## Verification

- **B:** harness `groundPerPixel` sweep constant ±15% across alt 0.04→1.5; scripted pinch across a
  level-jump with no >30ms frame from the build path; NaN heal still passes; 60 vs 120Hz feel via
  `setDt(1/60)` vs `setDt(1/120)` producing matching per-second convergence.
- **C:** screenshots (day limb / terminator / night city lights / clouds) at three zoom levels and
  per gameplay state (round/reveal/overview/end); performance measured in a VISIBLE tab with a real
  rAF benchmark — frame-time p50/p95 + long-task count via PerformanceObserver, recorded by the
  `?debug=1` overlay — desktop as smoke, **Mitch's iPhone as the shipping gate** (he runs one
  scripted 60s check from the debug overlay and reads out p95; **p95 ≤ 16.7ms passes** — the
  actual 60fps budget, not a 20ms approximation of it). The manual-`_tick`
  harness is used ONLY for logic gates (determinism, state machines), never as a perf claim.
  Context-loss via `WEBGL_lose_context` twice + backgrounding mid-reveal; texture tier verified by
  logging `maxTextureSize` and selected tier on both desktop and iPhone.
- **A:** `newsRollFor` deterministic and ≈40% over 1000 days; validator rejects: bad country, dupe
  name, <5km static neighbor, <100km recent-chain neighbor without `allowNear`, past `pn`, bad
  `slot`, off-roll entry without `force`; `dailyPicksFor(k)` with a news entry is deterministic
  (two calls byte-identical), places the entry at its declared `slot`, falls back through slots in
  the documented fixed order when the requested slot violates a deal invariant (country dupe /
  <100km sibling / continent-count degradation — each case unit-tested), leaves the round count and
  multiplier ladder unchanged, and downstream days exclude the news spot; a replay of a news day
  reproduces it; the committed deal-oracle fixture proves every past day byte-identical; share
  text carries 📰.
- **Live:** push → poll Pages → production smoke (manual `_tick` drive, one full round, console
  clean) — same protocol that caught nothing-wrong on v3.10.2.
