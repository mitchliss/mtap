# Plan Review Log: MTap v4.0 (news days, deep-zoom feel, day/night Earth)
Phases 0-1 complete - plan locked with Mitch (research=web). MAX_ROUNDS=5. Reviewer: CLI default, codex-cli 0.150.1.

## Round 1 — Codex
- **The 40% Bernoulli roll does not satisfy “at least 3 days each week.”** It averages only 2.8 days/week and frequently produces 0–2 news days. — Fix: deterministically select exactly three days per puzzle-week, optionally adding a seeded fourth.

- **Injecting news after `pickLocations()` can violate the deal invariants.** Replacing the first matching-difficulty slot can duplicate a country, reduce the deal below three continents, or duplicate/proximity-collide with another location that same day. — Fix: choose a replaceable slot only after validating the complete resulting deal, with a deterministic fallback search over slots.

- **The stated difficulty replacement is underspecified.** Multiple slots share difficulties, so “first match” makes a news item’s score weight depend implicitly on array order rather than editorial intent. — Fix: give each news entry an explicit `slot` or multiplier tier and validate it.

- **News additions can retroactively change undealt chain results already exposed by practice mode.** `practiceExcludeSet()` exposes today plus two future deals, but an entry committed for tomorrow changes that previously previewed chain and potentially day +2. — Fix: target at least three puzzles ahead or stop exposing future daily picks through practice exclusions.

- **A news entry is injected whenever present, regardless of `newsRollFor(pn)`.** This creates two conflicting definitions of a news day and lets malformed/manual data silently bypass the advertised schedule. — Fix: make injection require the roll, or add an explicit validated `force` field and document that override.

- **`NEWS_START` “pinned at build time” is not a stable rule.** A developer can accidentally advance it in a later build and make already-committed entries disappear from archive replays. — Fix: set it once to a literal puzzle number and add regression fixtures for every committed news puzzle.

- **The validator’s “strictly greater than the current puzzle number” depends on the machine’s local date and timezone.** CI, the scheduler, and players can disagree near midnight or DST boundaries. — Fix: derive puzzle numbers from an explicit configured game timezone and pass the target/current date into validation.

- **Country polygon validation will reject legitimate offshore, border, waterway, and disputed-territory news or assign a different country label than the game.** A single point-in-polygon assertion is not a sufficient editorial check. — Fix: validate against the game’s `countryAt` semantics with a documented border tolerance and permit explicit reviewed exceptions.

- **The `<5 km from any existing pin` validator conflicts with current-event reuse of recognizable cities and is far narrower than the game’s 100 km repeat rule.** It neither enforces the actual exclusion policy nor permits intentionally revisiting a newsworthy place. — Fix: use the same 100 km rule for recent dealt locations and require an explicit override for deliberate collisions.

- **The cache-chain implementation has no immutable test oracle for past deals.** “Byte-identical to before” cannot be proven after implementation unless expected picks are captured beforehand. — Fix: commit a fixture of names for every puzzle through `NEWS_START - 1` before changing selection code.

- **The proposed aim bound remains frame-rate dependent.** `AIM_STEP_MAX` is still “per frame,” so 120 Hz devices can rotate twice as fast as 60 Hz devices. — Fix: express the limit in radians per second and multiply it by clamped `dt`.

- **Converting `AIM_EMA` with render-frame `dt` is wrong if midpoint smoothing remains pointer-event driven.** iOS coalescing and 60/120 Hz touch delivery will still produce different behavior. — Fix: sample raw pointer positions once in `_tick` and apply the time-constant filter there.

- **Gesture-start gating does not keep tile work off the critical path.** A build started after settling can continue through a new gesture and perform canvas allocation, geometry creation, texture upload, and `_swapIn()` mid-pinch. — Fix: use a build generation/abort token and defer final texture/geometry creation and swap until no gesture is active.

- **Time-slicing only the row loop does not cover the largest unavoidable stalls.** Canvas allocation, border strokes, `CanvasTexture` upload, mip initialization, and `SphereGeometry` construction remain synchronous. — Fix: instrument each phase, prebuild/reuse geometry, use an `OffscreenCanvas` worker where supported, and defer GPU upload to an idle post-gesture frame.

- **`createImageBitmap` does not automatically guarantee off-main-thread decoding on iOS Safari.** It also requires a fetch/blob path, correct CORS behavior, cleanup, and a tested fallback. — Fix: feature-detect the complete fetch→blob→bitmap path, retain the `Image` fallback, and call `ImageBitmap.close()` on eviction.

- **Reducing the cache to 120 entries does not impose a real memory bound.** Pending promises cannot be evicted effectively, deleted images remain referenced by active builds, and temporary tile mosaics plus old/new patches can dwarf the cache. — Fix: implement weighted LRU accounting, bounded fetch concurrency, cancellation, explicit bitmap cleanup, and a one-build memory ceiling.

- **Disabling mipmaps is likely to shimmer and alias during zoom.** `LinearFilter` on a large satellite patch is a visual regression, particularly on high-DPI phones. — Fix: benchmark a smaller power-of-two patch with mipmaps or use an explicit lower-resolution level during motion and sharpen only after settling.

- **The texture budget omits duplicate CPU/GPU storage and existing specular data.** Canvas backing stores, decoded images, upload copies, temporary mosaics, old/new crossfade patches, and the generated specular map make the quoted totals materially optimistic. — Fix: inventory peak simultaneous allocations and gate texture dimensions using `renderer.capabilities.maxTextureSize` plus device-memory/performance tests.

- **A 5400-pixel base texture exceeds the common 4096 `MAX_TEXTURE_SIZE` limit on older iPhones.** Adding more effects without capability-based resizing preserves an existing device-specific failure. — Fix: resize every texture to `min(assetSize, maxTextureSize)` before upload and provide a 2048/4096 low-memory tier.

- **The day/night shader design double-applies darkness.** `MeshPhongMaterial` already responds to the directional light; multiplying/blending again by `dot(worldNormal, sunDir)` can crush the night side and distort the terminator. — Fix: define the lighting model once—prefer an emissive city-light contribution gated by sun angle while leaving Phong’s direct-light calculation intact.

- **The `onBeforeCompile` plan is incomplete for three.js r166.** Shader chunk substitutions are version-sensitive, new uniforms must be retained, and program caching needs a stable variant key when flags change. — Fix: specify tested r166 chunk anchors, store uniforms via `material.userData`, set `customProgramCacheKey`, and mark `needsUpdate` when feature variants change.

- **The tile patch explicitly retaining different lighting will create a conspicuous moving rectangular seam at the terminator, not a minor edge artifact.** Its `MeshPhongMaterial` also overlays the modified globe exactly where players zoom closest. — Fix: apply the same sun/night uniforms and shader logic to the patch or fade it based on identical computed illumination.

- **Cloud fading only by camera distance does not prevent gameplay obstruction while zoomed out or near the threshold.** Transparent clouds can also sort badly against atmosphere, markers, and the crossfading patch. — Fix: define render order/depth behavior explicitly and fade clouds during all active guessing and reveal-marker states, not merely by altitude.

- **Changing tone mapping globally can alter every texture, CSS-backed canvas sprite, and color-managed asset.** Checking only beams is insufficient, and `toneMapped:false` is not uniformly meaningful for all material types. — Fix: inventory every scene material and add screenshot/color regression checks with exposure toggled on each gameplay state.

- **Context restoration cannot safely be described as simply “rebuild on restore.”** `init()` currently creates and registers resources/listeners with no documented idempotent teardown, so rebuilding risks duplicate meshes, loops, handlers, and tile requests. — Fix: implement one explicit renderer/resource lifecycle with idempotent dispose/recreate paths and test repeated loss/restore cycles.

- **Pausing `setAnimationLoop` on visibility changes can strand the app or produce stale timing state.** The plan does not specify listener cleanup, loop resumption, clock reset, in-flight tile cancellation, or behavior during a reveal/flight. — Fix: centralize `startLoop`/`stopLoop`, reset the clock on resume, cancel stale async work, and test backgrounding during every animation state.

- **The hidden-pane manual `_tick` harness cannot validate real frame stalls.** Manually advancing ticks does not measure browser scheduling, image decode, canvas rasterization, or GPU texture upload, and hidden canvases are often throttled. — Fix: run an actual visible `requestAnimationFrame` benchmark with `PerformanceObserver` long-task data and phase timings around tile construction/upload.

- **Desktop ≥55 FPS is not a meaningful iPhone gate.** The target explicitly concerns iOS Safari, yet the only real-device criterion is subjective and has no device matrix or captured metrics. — Fix: define representative iPhone/Safari models and record FPS percentiles, maximum frame time, peak texture sizes, and context-loss results on each.

- **Most failure paths remain intentionally silent, defeating diagnosis.** Tile failures, news fallback, shader compilation failure, memory-tier selection, context loss, and scheduler misses have no durable diagnostic surface. — Fix: add a bounded opt-in debug report exposing feature flags, selected quality tier, tile/build timings, failures, shader status, and news decision/entry state.

- **The scheduled routine is an unbounded production mutation path.** “Search, edit, commit, push” lacks branch protection, review, source provenance, retry/idempotency, and duplicate-run handling. — Fix: have it create a validated pull request containing citations and a unique `pn`, then require an explicit approval/merge policy before publication.

VERDICT: REVISE
### Claude's response (Round 1)
Accepted (plan revised): slot-explicit news entries + post-injection deal validation w/ deterministic slot fallback; roll-or-force injection gate; NEWS_START as a literal + committed deal-oracle fixture for all past days; validator reuses the game's countryAt + rng.js date formula + the real 100km/30-day policy w/ overrides; aim cap expressed per-second; build generation token + defer geometry/texture/swap to gesture-free frames; full fetch->blob->createImageBitmap path w/ close() + Image fallback; byte-weighted LRU cache + bounded concurrency; mipmaps KEPT on the patch; phase instrumentation + ?debug=1 observability overlay; capability-based texture tiers incl. resizing the existing 5400px base under maxTextureSize; single lighting model (Phong direct light + emissive city lights - no double-darken) with pinned r166 chunk anchors + customProgramCacheKey; same sun shader applied to the tile patch (no seam); clouds fade during guessing/reveal + explicit renderOrder; tone mapping demoted to last, flag-off-able, with per-state screenshot regression; idempotent context-loss/visibility lifecycle (startLoop/stopLoop); visible-tab rAF benchmark + iPhone p95 gate replaces the desktop-fps proxy; routine hardened (idempotency, pre-push oracle run, source citation in commit).
Rejected with reasons: (1) PR-approval gate on the news routine - solo-owner repo, zero-touch chosen by the user, one validated data file, git revert rollback. (2) '>=3 news days/week' floor - the user's own random-gate message supersedes it; exactly-k-of-7 documented as the upgrade path. (3) Practice-exclusion preview drift - accepted as harmless (local best-effort hygiene on undealt days), documented in-plan rather than changed.

## Round 2 — Codex
Most prior findings are addressed, and I accept the three documented decisions. Material issues remain:

- **News replacement still fails to preserve the three-continent invariant.** Trying alternate slots only checks country and proximity; replacing the sole representative of a continent can leave two continents. — Fix: validate all existing daily-deal invariants after each candidate replacement, including at least three continents.

- **The r166 shader insertion point can fail compilation.** In three.js r166, `worldPosition` inside `<worldpos_vertex>` is conditionally declared, so code injected after that chunk cannot safely reference it when no env map, shadows, transmission, or spot-light coordinates enable the block. — Fix: declare a dedicated varying and compute it unconditionally from `modelMatrix * vec4(transformed, 1.0)` at an unconditional vertex-shader anchor.

- **A shared sun shader cannot sample the global city-light texture using the tile patch’s ordinary UVs.** Patch UVs cover only the local patch, so using `vUv` would stretch the entire Black Marble map across every patch. — Fix: derive equirectangular night-map coordinates from normalized world position, or pass the patch’s global UV transform explicitly.

- **Canvas reuse conflicts with patch crossfading.** A `CanvasTexture` retains its canvas as the image source; repainting that canvas for the next build can corrupt the current or outgoing patch before the fade completes. — Fix: use a pool with at least one canvas per live/current, outgoing, and building patch, recycling only after texture disposal.

- **The timezone issue is not actually resolved.** “Same local-date formula” still means the scheduler/validator’s local timezone determines tomorrow, while deployment timing and players’ local dates may differ. — Fix: define one explicit scheduler timezone and calculate the target `pn` from an explicit date rather than ambient process-local time.

- **The schema description is stale.** The declared `NEWS` shape omits newly required `slot`, optional `force`, and collision/offshore override fields, making the authoritative format ambiguous. — Fix: update the schema declaration and document every override field and its required justification metadata.

- **Verification still tests the superseded selection rule.** It says the news entry “replaces exactly one slot with matching diff,” although the revised design uses an explicit slot and deterministic alternate-slot search. — Fix: test requested-slot placement, fallback order, unchanged round count, multiplier consequences, and full-deal invariants.

- **The performance assertion still overpromises what deferral proves.** Uploading on the “first gesture-free frame” can still create a >30 ms visible hitch immediately after release; it merely moves the hitch outside the gesture. — Fix: make the shipping criterion apply to all visible frames and reduce/defer patch resolution when measured upload time breaches the frame budget.

- **The low-memory tier is selected too late for context-loss prevention.** `maxTextureSize >= 8192` says nothing about available memory, so a modern iPhone may receive the high tier until it has already lost context. — Fix: default iOS/mobile devices to the conservative tier and promote only after an explicit benchmark or user opt-in.

- **The plan retains contradictory stale statements.** Risks still say the routine depends on “Mon/Wed/Fri,” and the tile seam is “accepted,” despite a daily routine and shared patch shader. — Fix: remove or reconcile these statements so implementation and review have one authoritative requirement.

VERDICT: REVISE
### Claude's response (Round 2)
Accepted all ten, with one correction of the reviewer's premise: the 'three-continent invariant' is a stale COMMENT at game.js:23 - pickLocations enforces country-dedupe only (verified by grep). Plan now treats it as a non-degradation constraint on injection (continent count never drops below min(3, base deal's)) and directs the build to correct the comment. Other revisions: dedicated unconditional world-position varying after begin_vertex (worldpos_vertex is conditionally populated in r166); patch city-light UVs derived from world position, never local patch UVs; 3-canvas pool (current/outgoing/building) recycled only after texture disposal; scheduler timezone pinned to America/New_York with explicit dates; NEWS schema updated (slot/force/allowNear/offshore); verification rewritten for slot placement + fallback order + invariant unit tests; perf criterion extended to ALL visible frames with adaptive patch resolution (1792->1280->896) on budget breach; mobile defaults to the conservative texture tier, promoting only after a clean measured first session, context loss demotes and pins; stale Mon/Wed/Fri and 'seam accepted' lines reconciled.

## Round 3 — Codex
The Round 2 findings are substantively addressed, including the continent non-degradation rule. New material issues:

- **The city-light longitude formula is mirrored relative to this repo’s coordinate convention.** `latLngToVec3()` uses `z = -cos(lat) * sin(lng)`, so `atan(p.z, p.x)` reverses east and west. — Fix: derive longitude with `atan(-p.z, p.x)` and add known-city alignment tests.

- **“Resize on upload” allocates the oversized source before applying the low-memory tier.** Building the 5400×2700 canvas first still incurs the peak CPU backing-store pressure the tier is intended to prevent. — Fix: select the tier before creating or painting any canvas/image target and allocate directly at the chosen dimensions.

- **The cloud requirements contradict themselves.** The plan says clouds fade to zero during an active guess and are “never an occluder,” but specifies active-game opacity around 0.35. — Fix: make active guessing and reveal opacity exactly zero, reserving clouds for menus and post-game views.

- **The iPhone gate does not demonstrate the stated 60 FPS goal.** A p95 frame time below 20 ms permits roughly 50 FPS and recurrent visible misses of the 16.7 ms frame budget. — Fix: require p95 ≤16.7 ms for a 60 FPS claim, or explicitly revise the shipping goal to stable 50+ FPS.

- **The validator cannot directly initialize `countryAt()` from the local GeoJSON using its current API.** `countryAt()` depends on module-global data populated by `loadCountries(url)`, which uses `fetch`; a Windows filesystem path is not a portable Node fetch URL. — Fix: refactor `geo.js` to export a pure `prepareCountries(geojson)` initializer used by both browser loading and the validator.

VERDICT: REVISE
### Claude's response (Round 3)
Accepted all five: longitude derived as atan(-p.z, p.x) per this repo's latLngToVec3 convention + Tokyo alignment test; texture tier selected BEFORE any canvas allocation (composite painted directly at tier size); clouds exactly 0 during guessing AND reveals (menu/post-game only - the 0.35 contradiction removed); iPhone gate tightened to p95 <= 16.7ms (real 60fps budget); geo.js refactored with a pure prepareCountries(geojson) initializer shared by browser loader and Node validator.

## Round 4 — Codex
The five Round 3 findings are addressed. Two integration gaps remain:

- **News locations are absent from `LOCATIONS`, breaking existing location-index consumers.** `visitedPlaces()` ignores history names not found in its `LOCATIONS` index, and `buildChallengePayload()` returns `null` when sharing a replay containing a news location. — Fix: index both `LOCATIONS` and `NEWS` for visited/reconstruction, and extend challenge payloads with a versioned news identifier or embedded validated location.

- **News injection can make the existing theme UI factually wrong.** `dailyThemeFor()` still reports the base theme and its blurb says “Five places,” although one slot may have been replaced by unrelated news. — Fix: either suppress the daily theme when news is injected or return combined metadata whose text accurately describes four themed locations plus one news round.

VERDICT: REVISE
### Claude's response (Round 4)
Accepted both: (1) name indexes in archive.js/themes.js extended to LOCATIONS union NEWS; challenge payloads carry news locations as 100000+newsIndex (append-only arrays keep indices stable; unknown-index decode already fails gracefully); (2) theme banner appends '+ one from this week's news' on themed news days and the news round shows the news chip instead of the theme chip - the banner never claims five themed places.

## Round 5 — Codex
All Round 4 findings are addressed. The plan now covers deterministic deal preservation, news-location serialization and indexing, truthful theme coexistence, iOS memory constraints, shader correctness, lifecycle recovery, performance measurement, and operational observability.

No remaining material blocker found. The earlier rejected and accepted-as-documented tradeoffs are explicit and internally consistent.

VERDICT: APPROVED
**Converged: APPROVED in 5 rounds.**
