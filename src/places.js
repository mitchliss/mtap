// Place names after a guess (v5.4, the God's Eye View plan's option D):
//  - which state / province the pin and the destination are in (Natural Earth
//    admin-1, public domain), from a small per-country file loaded on demand;
//  - nearby towns WITH their population (Wikidata, CC0, 31,827 places of 15,000+),
//    from 10-degree tiles around the destination.
// Display only: nothing here touches scoring or the daily deal. The packs are built
// by scripts/build-geo-packs.mjs from vendor/gods-eye-view.

import { distanceKm, formatDistance } from './geo.js';
import { bearingWord } from './discovery.js';

const BASE = () => import.meta.env?.BASE_URL ?? './';
export const CITY_TILE_DEG = 10;
export const cityTileKey = (lat, lng) =>
  `${Math.floor((Math.min(89.999, Math.max(-90, lat)) + 90) / CITY_TILE_DEG)}_${Math.floor((((lng + 180) % 360 + 360) % 360) / CITY_TILE_DEG)}`;

// ---------- states and provinces ----------

export function decodeRing(encoded, decimals) {
  const factor = 10 ** decimals, ring = [];
  let x = 0, y = 0;
  for (let i = 0; i + 1 < encoded.length; i += 2) { x += encoded[i]; y += encoded[i + 1]; ring.push([x / factor, y / factor]); }
  return ring;
}
function inRing(ring, lat, lng) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// A ring crossing the antimeridian (Chukotka, Fiji...) is tested in its own frame.
function polygonsContain(polygons, lat, lng) {
  for (const [outer, ...holes] of polygons) {
    let x = lng;
    const crosses = outer.some((p, i) => i && Math.abs(p[0] - outer[i - 1][0]) > 180);
    const shift = (r) => r.map(([a, b]) => [a < 0 ? a + 360 : a, b]);
    const o = crosses ? shift(outer) : outer;
    if (crosses && x < 0) x += 360;
    if (!inRing(o, lat, x)) continue;
    if (!holes.some((h) => inRing(crosses ? shift(h) : h, lat, x))) return true;
  }
  return false;
}

export function prepareRegions(pack) {
  return pack.regions.map((r) => {
    const polygons = r.polygons.map((poly) => poly.map((ring) => decodeRing(ring, r.d ?? pack.decimals ?? 3)));
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [outer] of polygons) for (const [x, y] of outer) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
    return { name: r.name, type: r.type, polygons, bbox: [w, s, e, n], wide: e - w > 180 };
  });
}
export function regionIn(regions, lat, lng) {
  for (const r of regions) {
    const [w, s, e, n] = r.bbox;
    if (lat < s || lat > n || (!r.wide && (lng < w || lng > e))) continue;
    if (polygonsContain(r.polygons, lat, lng)) return { name: r.name, type: r.type };
  }
  return null;
}

const regionPacks = new Map(); // iso2 -> Promise<regions[] | null>
function loadRegions(iso2, fetchImpl = globalThis.fetch) {
  if (!/^[A-Z]{2}$/.test(iso2 || '')) return Promise.resolve(null);
  if (!regionPacks.has(iso2)) {
    regionPacks.set(iso2, fetchImpl(`${BASE()}data/admin1/${iso2}.json`)
      .then((r) => (r.ok ? r.json() : null)).then((p) => (p ? prepareRegions(p) : null)).catch(() => null));
  }
  return regionPacks.get(iso2);
}
export async function regionAt(lat, lng, iso2, fetchImpl) {
  const regions = await loadRegions(iso2, fetchImpl);
  return regions ? regionIn(regions, lat, lng) : null;
}

// "right state", "right province"... and "right region" for anything less familiar.
const KIND_WORDS = new Set(['state', 'province', 'region', 'county', 'department', 'prefecture', 'governorate', 'canton', 'territory', 'oblast', 'district', 'parish', 'municipality', 'emirate', 'island']);
export function regionKind(type) {
  const t = String(type || '').toLowerCase().split('|')[0].trim().split(' ').pop();
  return KIND_WORDS.has(t) ? t : 'region';
}

// The relation line, with state / province names when we have them.
// guessCountry / targetCountry: country names (or null at sea).
export function relationWithRegions({ guess, target, miles = false, guessCountry, targetCountry, guessRegion, targetRegion }) {
  const d = distanceKm(guess.lat, guess.lng, target.lat, target.lng);
  if (d < 1) return guessRegion ? `Your pin landed within 1 km of the destination, in ${guessRegion.name}.` : null;
  const where = `${formatDistance(d, miles)} ${bearingWord(target, guess)} of the destination`;
  const sameCountry = guessCountry && targetCountry && guessCountry === targetCountry;
  if (sameCountry && guessRegion && targetRegion) {
    if (guessRegion.name === targetRegion.name) {
      return `Right country, and the right ${regionKind(targetRegion.type)} too: ${targetRegion.name}! Your pin was ${where}.`;
    }
    return `Your pin landed in ${guessRegion.name}; the destination is in ${targetRegion.name}. Your pin was ${where}.`;
  }
  if (!sameCountry && guessCountry && guessRegion) {
    const there = targetRegion && targetCountry ? ` The destination is in ${targetRegion.name}, ${targetCountry}.` : '';
    return `Your pin landed in ${guessRegion.name}, ${guessCountry}, ${where}.${there}`;
  }
  return null; // nothing new to say: keep the existing line
}

// ---------- nearby towns with population ----------

const cityTiles = new Map(); // key -> Promise<rows>
function loadCityTile(key, fetchImpl = globalThis.fetch) {
  if (!cityTiles.has(key)) {
    cityTiles.set(key, fetchImpl(`${BASE()}data/cities/${key}.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []));
  }
  return cityTiles.get(key);
}
export function tilesAround(lat, lng) {
  const keys = new Set();
  for (const dLat of [-CITY_TILE_DEG, 0, CITY_TILE_DEG]) for (const dLng of [-CITY_TILE_DEG, 0, CITY_TILE_DEG]) {
    const la = lat + dLat;
    if (la < -90 || la > 90) continue;
    keys.add(cityTileKey(la, lng + dLng));
  }
  return [...keys];
}

// Up to `limit` towns: the BIGGEST within 300 km first (what a person would name),
// then the nearest out to 900 km if the area is empty. Each has distance + population.
export function pickNearbyTowns(rows, target, limit = 3) {
  const all = rows.map(([name, lat, lng, population]) => ({ name, lat, lng, population, distance: distanceKm(target.lat, target.lng, lat, lng) }))
    .filter((c) => c.distance > 3 && c.distance < 900);
  const close = all.filter((c) => c.distance <= 300).sort((a, b) => b.population - a.population).slice(0, limit);
  const rest = all.filter((c) => !close.includes(c)).sort((a, b) => a.distance - b.distance).slice(0, limit - close.length);
  return [...close, ...rest];
}
export async function nearbyTowns(target, limit = 3, fetchImpl) {
  const tiles = await Promise.all(tilesAround(target.lat, target.lng).map((k) => loadCityTile(k, fetchImpl)));
  return pickNearbyTowns(tiles.flat(), target, limit);
}

export function formatPopulationShort(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}
export function describeNearbyTowns(towns, target, miles = false) {
  if (!towns.length) return null;
  return 'Nearby: ' + towns.map((c) => `${c.name} (pop. ${formatPopulationShort(c.population)}, ${formatDistance(c.distance, miles)} ${bearingWord(target, c)})`).join(' · ');
}
