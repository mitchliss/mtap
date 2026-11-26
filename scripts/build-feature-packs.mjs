// Build the v5.6 nature-round packs from scripts/feature-list.mjs and the vendored
// Natural Earth shapes (run after `git submodule update --init vendor/gods-eye-view`;
// the outputs are committed, so the game and CI never need the submodule):
//
//   src/features.js                 the dealable list: id, name, kind, difficulty,
//                                    label point, bounds, equivalent radius, fact
//   public/data/features/<id>.json  each outline, simplified, loaded when dealt
//
// Usage: node scripts/build-feature-packs.mjs
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURE_LIST } from './feature-list.mjs';
import { prepareShape, insideShape } from '../src/featureshape.js';
import { prepareCountries, countryAt } from '../src/geo.js';
import { LOCATIONS } from '../src/locations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ne = path.join(root, 'vendor/gods-eye-view/src/data/local_data/natural_earth');

export const featureId = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const KIND = (cla) => {
  const c = cla.toLowerCase();
  if (/range|mtn|foothills/.test(c)) return 'mountains';
  if (/desert/.test(c)) return 'desert';
  if (/pen|cape|isthmus/.test(c)) return 'peninsula';
  if (/island/.test(c)) return 'island';
  if (/strait|channel|sound|fjord|bosporus/.test(c)) return 'strait';
  if (/sea|ocean|gulf|bay|lagoon|inlet|reef/.test(c)) return /reef/.test(c) ? 'reef' : /gulf|bay|inlet/.test(c) ? 'gulf' : 'sea';
  if (/delta/.test(c)) return 'delta';
  if (/plateau/.test(c)) return 'plateau';
  if (/basin|depression|valley|gorge|lowland|plain|wetlands|lake|tundra/.test(c)) return /lake/.test(c) ? 'lakes' : /valley|gorge/.test(c) ? 'valley' : /wetland/.test(c) ? 'wetland' : 'region';
  return 'region';
};
const WATER = new Set(['sea', 'gulf', 'strait', 'reef']);

// Make a ring's longitudes continuous (no 360-degree jumps across the date line).
function unwrap(ring) {
  const out = [ring[0].slice()];
  for (let i = 1; i < ring.length; i++) {
    let x = ring[i][0];
    const prev = out[i - 1][0];
    while (x - prev > 180) x -= 360;
    while (prev - x > 180) x += 360;
    out.push([x, ring[i][1]]);
  }
  return out;
}

// Douglas-Peucker in degrees (lng scaled by cos(lat)).
function simplify(pts, tol) {
  if (pts.length < 8) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const k = Math.cos(((ay + by) / 2) * Math.PI / 180);
    let max = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const dx = (bx - ax) * k, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1e-12;
      const d = Math.abs(dx * (ay - py) - dy * (ax - px) * k) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// Spherical-ish area (km²) of a lng/lat ring, and its centroid.
function ringStats(ring) {
  let a = 0, cx = 0, cy = 0;
  const k = 111.32;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j], [x2, y2] = ring[i];
    const c = Math.cos(((y1 + y2) / 2) * Math.PI / 180);
    const f = (x1 * c * k) * (y2 * k) - (x2 * c * k) * (y1 * k);
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  a /= 2;
  return { area: Math.abs(a), cx: a ? cx / (6 * a) : ring[0][0], cy: a ? cy / (6 * a) : ring[0][1] };
}

// A label point inside the shape: the centroid of the largest ring, or (for crescent
// shapes) the inside grid point farthest from the edge.
function labelPoint(shape, rings) {
  const big = rings.map((r) => ({ r, ...ringStats(r) })).sort((x, y) => y.area - x.area)[0];
  if (insideShape(shape, big.cy, big.cx)) return { lat: big.cy, lng: big.cx };
  const xs = big.r.map((p) => p[0]), ys = big.r.map((p) => p[1]);
  const [w, e, s, n] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = null;
  for (let i = 1; i < 40; i++) for (let j = 1; j < 40; j++) {
    const lng = w + (e - w) * i / 40, lat = s + (n - s) * j / 40;
    if (!insideShape(shape, lat, lng)) continue;
    let dmin = Infinity;
    for (const [x, y] of big.r) dmin = Math.min(dmin, Math.hypot((x - lng) * Math.cos(lat * Math.PI / 180), y - lat));
    if (!best || dmin > best.d) best = { lat, lng, d: dmin };
  }
  return best ? { lat: best.lat, lng: best.lng } : { lat: big.cy, lng: big.cx };
}

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const r3 = (v) => Math.round(v * 1e3) / 1e3;

async function main() {
  const regions = JSON.parse(await readFile(path.join(ne, 'regions.json'), 'utf8')).features;
  const marine = JSON.parse(await readFile(path.join(ne, 'marine.json'), 'utf8')).features;
  const all = [...regions, ...marine];
  const countries = JSON.parse(await readFile(path.join(root, 'public/data/countries-50m.geojson'), 'utf8'));
  prepareCountries(countries);

  const outDir = path.join(root, 'public/data/features');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const out = [], missing = [], ids = new Set();
  let bytes = 0;
  for (const [neName, name, diff, fact] of FEATURE_LIST) {
    const matches = all.filter((f) => f.name === neName);
    if (!matches.length) { missing.push(neName); continue; }
    // Some names repeat (two "Great Rift Valley" parts): merge all their rings.
    if (LOCATIONS.some((l) => l.name === name)) throw new Error(`"${name}" is already a point answer in locations.js`);
    // The display name wins where Natural Earth's class is odd (Iberia is filed as a plateau).
    const kind = /Peninsula/.test(name) ? 'peninsula' : /Desert|Sands/.test(name) ? 'desert' : /Mountains|Range|Alps/.test(name) ? 'mountains' : KIND(matches[0].featurecla);
    const raw = matches.flatMap((f) => f.polygons); // outer rings only, one per part
    const total = raw.reduce((a, r) => a + ringStats(unwrap(r)).area, 0);
    const tol = total > 2e6 ? 0.08 : total > 3e5 ? 0.04 : total > 5e4 ? 0.02 : 0.01;
    let rings = raw.map(unwrap).map((r) => { const t = simplify(r, tol); return t.length >= 4 ? t : r; }).filter((r) => r.length >= 3);
    // Drop slivers under 1% of the feature (tiny islands of a big group) to keep files small.
    const areas = rings.map((r) => ringStats(r).area);
    const biggest = Math.max(...areas);
    rings = rings.filter((_, i) => areas[i] >= total * 0.01 || areas[i] === biggest || rings.length <= 3);
    rings = rings.map((r) => r.map(([x, y]) => [r3(x), r3(y)]));
    const id = featureId(name);
    if (ids.has(id)) throw new Error(`duplicate id ${id}`);
    ids.add(id);
    const shape = prepareShape({ id, rings });
    const label = labelPoint(shape, rings);
    let lng = label.lng; while (lng > 180) lng -= 360; while (lng < -180) lng += 360;
    const xs = rings.flat().map((p) => p[0]), ys = rings.flat().map((p) => p[1]);
    const land = WATER.has(kind) ? null : countryAt(label.lat, lng);
    const json = JSON.stringify({ id, rings });
    bytes += json.length;
    await writeFile(path.join(outDir, `${id}.json`), json);
    out.push({
      id, name, kind, diff,
      lat: r4(label.lat), lng: r4(lng),
      bbox: [r3(Math.min(...xs)), r3(Math.min(...ys)), r3(Math.max(...xs)), r3(Math.max(...ys))],
      rKm: Math.round(Math.sqrt(total / Math.PI)),
      continent: land?.continent || null,
      fact,
    });
  }
  if (missing.length) console.warn('Not in Natural Earth (skipped):', missing.join(', '));

  const src = `// GENERATED by scripts/build-feature-packs.mjs from scripts/feature-list.mjs - do not edit.
// Nature rounds (v5.6): big natural places dealt as answers. Outlines (Natural Earth,
// public domain, via gods-eye-view) are in public/data/features/<id>.json.
// lat/lng is a point inside the shape (the label); rKm the radius of a circle of the
// same area; bbox [west, south, east, north] (east may pass 180 over the date line).
export const FEATURES = [
${out.map((f) => `  ${JSON.stringify(f)},`).join('\n')}
];
`;
  await writeFile(path.join(root, 'src/features.js'), src);
  console.log({ features: out.length, missing: missing.length, bytes, largest: Math.max(...out.map((f) => f.rKm)) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
