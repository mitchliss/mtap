# MTap 🌍 (formerly MarcTap)

A daily 3D-globe geography guessing game, inspired by the tap-the-map genre but built
from scratch with original code, data, and design.

Five places a day. Spin the globe, drop a pin, fine-tune it, confirm your guess.
The closer you are, the more points you score — up to 100 per round, 500 per game.

## The MTap twist: no accidental guesses

Unlike most tap-the-map games where one stray touch locks in your answer:

- **Tap** drops a *candidate* pin — nothing is submitted yet.
- **Drag the pin** anywhere, or use the **nudge pad** (or arrow keys) for metre-level precision.
- Press **Confirm** (or Enter) to lock it in — or **double-tap** to place-and-confirm in one go.
- **Clear** (or Esc) removes the pin so you can rethink.

## Scoring

Base accuracy per round — calibrated 1:1 against maptap.gg (probed live 2026-07-23):

| Result | Base points |
|---|---|
| Distance d | `round(100 · e^(−d/4643 km))` — halves every ~3,200 km |
| Within ~23 km | **100** (bullseye) |
| 300 km away | ≈**94** |
| 1,000 km away | ≈**81** |
| Right country | accuracy rescaled into [25, 100], boost capped at **80** |
| Right continent (on land) | same rescale with floor **10**, capped at **80** |

The country/continent boost never lowers a good raw distance score.

Rounds ramp in difficulty and the base score is multiplied MapTap-style:
rounds 1–2 (easy) **×1**, round 3 (medium) **×2**, rounds 4–5 (hard) **×3**.
Perfect game = **1000**.

Everyone in the world gets the same 5 places each day (deterministic date-seeded pick
from a curated database of ~180 locations). Practice mode deals a random game any time.
Results, streaks, and stats persist in `localStorage`. Share button copies an emoji
scorecard to the clipboard. After a game, **Explore the locations** puts numbered
markers on the globe — spin it, tap a marker (or use ‹ › / arrow keys), and read
about each place and how close you got.

## Desktop shortcut

`scripts\install-shortcut.ps1` creates an **MTap** icon on the Desktop. It launches
`scripts\launch-marctap.vbs`, which silently starts the local server (serving `dist/`)
if it isn't already running and opens the game in the default browser.
`scripts\make-icon.ps1` regenerates `assets\marctap.ico`.

## Run it locally

```
npm install
npm run dev
```

Open http://localhost:5210

## Move it to a hosted website

The game is a **fully static site** — no server, no database, no accounts. Any static
host works (Netlify, Vercel, GitHub Pages, Cloudflare Pages, an S3 bucket, or a plain
folder on any web server).

```
npm run build
```

Then upload the contents of `dist/` anywhere. That's it. The build uses relative paths
(`base: './'`), so it works from a domain root **or** a subdirectory. Three concurrent
users? It would shrug at three thousand — it's just files.

To test the production build locally first: `npm run preview`

## Tech

- [three.js](https://threejs.org/) — WebGL globe, pins, arcs, camera flights
- [Vite](https://vitejs.dev/) — dev server & bundler
- [NASA Blue Marble](https://visibleearth.nasa.gov/) topography + bathymetry imagery
  (public domain) — the globe surface, with country borders and a faint graticule
  composited on at load; oceans get a specular sun glint via a generated water mask
- [Natural Earth](https://www.naturalearthdata.com/) 1:50m country boundaries (public domain) —
  border overlay + point-in-polygon country detection (and a painted-map fallback if the
  imagery can't load)
- No other runtime dependencies; sounds are synthesized with WebAudio, icons are emoji

## Project layout

```
index.html            app shell (screens, modals, HUD)
src/main.js           boot + UI wiring
src/globe.js          three.js globe, picking, draggable pin, arcs, camera flights
src/game.js           rounds, scoring, persistence, share text
src/geo.js            haversine, point-in-polygon country lookup
src/locations.js      curated location database (edit me to add places!)
src/rng.js            seeded RNG + daily puzzle number
public/data/          Natural Earth countries GeoJSON
```

### Adding locations

Append to `src/locations.js`. `country` must match the Natural Earth `NAME` property
for the right-country bonus to trigger (check `public/data/countries-50m.geojson`).
`diff` is 1 (famous) to 3 (tricky); each day's game deals difficulties `[1,1,2,2,3]`.
