// Live Earth (v5.1, the God's Eye View plan's option A): real earthquakes and the
// International Space Station, shown ONLY after a guess (the reveal, Explore and the
// menus). Nothing here is imported by game.js: live data never picks a place or
// touches a score, so the daily deal stays identical for everyone.
//
// Sources are keyless and CORS-open, so the static site can call them directly:
//  - USGS earthquake feed (public domain), M2.5+ over the past 7 days, ~33 KB gzipped.
//  - CelesTrak ISS orbital elements (TLE), refreshed at most every 12 h per device
//    (CelesTrak asks clients not to poll), with public/data/iss-tle.txt as the
//    offline fallback (refresh it with scripts/update-iss-tle.mjs).

import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLat, degreesLong } from 'satellite.js';
import { findNextSatellitePass } from './gev/satellitePass.js';
import { distanceKm, formatDistance } from './geo.js';
import { bearingWord } from './discovery.js';

export const QUAKE_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson';
export const ISS_TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE';
export const QUAKE_RADIUS_KM = 500;
const QUAKE_TTL_MS = 10 * 60 * 1000;
const TLE_TTL_MS = 12 * 3600 * 1000;
const TLE_KEY = 'marctap.issTle';
const EARTH_RADIUS_KM = 6371;
const DAY_MS = 86400000;

function withTimeout(fetchImpl, url, ms = 8000) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  return fetchImpl(url, ctrl ? { signal: ctrl.signal } : undefined).finally(() => clearTimeout(timer));
}

// ---------- earthquakes ----------

// USGS GeoJSON -> [{ lat, lng, mag, timeMs, place, depthKm }], dropping malformed rows.
export function parseQuakes(geojson) {
  const out = [];
  for (const f of geojson?.features || []) {
    const [lng, lat, depthKm] = f?.geometry?.coordinates || [];
    const mag = f?.properties?.mag, timeMs = f?.properties?.time;
    if (![lat, lng, mag, timeMs].every(Number.isFinite)) continue;
    out.push({ lat, lng, mag, timeMs, depthKm: Number.isFinite(depthKm) ? depthKm : null, place: f.properties.place || '' });
  }
  return out;
}

let quakeCache = null; // { at, promise }
export function loadQuakes({ fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (quakeCache && now - quakeCache.at < QUAKE_TTL_MS) return quakeCache.promise;
  const promise = withTimeout(fetchImpl, QUAKE_FEED)
    .then((r) => { if (!r.ok) throw new Error(`USGS ${r.status}`); return r.json(); })
    .then(parseQuakes)
    .catch(() => { quakeCache = null; return []; }); // offline: the layer just stays empty
  quakeCache = { at: now, promise };
  return promise;
}
export function _resetQuakeCache() { quakeCache = null; }

// Quakes within radiusKm of a point, nearest first, each with distanceKm.
export function quakesNear(quakes, point, radiusKm = QUAKE_RADIUS_KM) {
  return quakes
    .map((q) => ({ ...q, distanceKm: distanceKm(point.lat, point.lng, q.lat, q.lng) }))
    .filter((q) => q.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function agoWords(ms) {
  const h = ms / 3600000;
  if (h < 1) return 'within the hour';
  if (h < 24) return `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

// One plain-English line for the discovery panel.
export function describeQuakes(quakes, point, { miles = false, now = Date.now() } = {}) {
  if (!quakes.length) return null; // feed unavailable - say nothing rather than "no quakes"
  const near = quakesNear(quakes, point);
  const radius = formatDistance(QUAKE_RADIUS_KM, miles);
  if (!near.length) return `No earthquakes (magnitude 2.5+) within ${radius} this week · ${quakes.length.toLocaleString()} worldwide.`;
  const big = near.reduce((a, b) => (b.mag > a.mag ? b : a));
  const where = big.distanceKm < 10 ? 'right here' : `${formatDistance(big.distanceKm, miles)} ${bearingWord(point, big)}`;
  const count = near.length === 1 ? 'One earthquake' : `${near.length} earthquakes`;
  const largest = near.length === 1 ? 'magnitude' : 'largest magnitude';
  return `${count} within ${radius} this week — ${largest} ${big.mag.toFixed(1)}, ${agoWords(now - big.timeMs)}, ${where}.`;
}

// ---------- the International Space Station ----------

// Parse "name\nline1\nline2" (or just the two lines) into a satrec, or null.
export function satrecFromTle(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const l1 = lines.find((l) => l.startsWith('1 ')), l2 = lines.find((l) => l.startsWith('2 '));
  if (!l1 || !l2) return null;
  try {
    const rec = twoline2satrec(l1, l2);
    return rec && !rec.error ? rec : null;
  } catch { return null; }
}

function storageGet(storage, key) { try { return storage?.getItem(key) ?? null; } catch { return null; } }
function storageSet(storage, key, value) { try { storage?.setItem(key, value); } catch { /* private mode */ } }

// Fresh device cache -> CelesTrak -> stale cache -> the snapshot shipped with the site.
export async function loadIssSatrec({
  fetchImpl = globalThis.fetch, storage = globalThis.localStorage, now = Date.now(),
  fallbackUrl = `${import.meta.env?.BASE_URL ?? './'}data/iss-tle.txt`,
} = {}) {
  let cached = null;
  try { cached = JSON.parse(storageGet(storage, TLE_KEY) || 'null'); } catch { cached = null; }
  if (cached && now - cached.at < TLE_TTL_MS) {
    const rec = satrecFromTle(cached.tle);
    if (rec) return { satrec: rec, source: 'cache' };
  }
  try {
    const text = await withTimeout(fetchImpl, ISS_TLE_URL).then((r) => (r.ok ? r.text() : ''));
    const rec = satrecFromTle(text);
    if (rec) { storageSet(storage, TLE_KEY, JSON.stringify({ at: now, tle: text })); return { satrec: rec, source: 'celestrak' }; }
  } catch { /* fall through */ }
  if (cached) { const rec = satrecFromTle(cached.tle); if (rec) return { satrec: rec, source: 'stale-cache' }; }
  try {
    const rec = satrecFromTle(await fetchImpl(fallbackUrl).then((r) => (r.ok ? r.text() : '')));
    if (rec) return { satrec: rec, source: 'snapshot' };
  } catch { /* offline and no snapshot */ }
  return null;
}

// Sub-satellite point and altitude at an instant, or null if SGP4 fails.
export function issPositionAt(satrec, ms) {
  const date = new Date(ms);
  let pv;
  try { pv = propagate(satrec, date); } catch { return null; }
  const pos = pv?.position;
  if (!pos || typeof pos === 'boolean' || ![pos.x, pos.y, pos.z].every(Number.isFinite)) return null;
  const geo = eciToGeodetic(pos, gstime(date));
  return { lat: degreesLat(geo.latitude), lng: degreesLong(geo.longitude), altKm: geo.height };
}

// Points along the orbit from `fromMin` to `toMin` minutes around `ms`.
export function issTrack(satrec, ms, fromMin = -45, toMin = 50, stepSec = 30) {
  const out = [];
  for (let t = fromMin * 60; t <= toMin * 60; t += stepSec) {
    const p = issPositionAt(satrec, ms + t * 1000);
    if (p) out.push({ ...p, tMin: t / 60 });
  }
  return out;
}

export const altitudeToRadius = (altKm) => 1 + altKm / EARTH_RADIUS_KM;

// Next pass worth looking up for (visible to the naked eye), else the next pass at all.
export function nextIssPass(satrec, point, fromMs = Date.now()) {
  const args = { satrec, latDeg: point.lat, lonDeg: point.lng, fromMs, horizonHours: 72, minElevDeg: 10 };
  return findNextSatellitePass({ ...args, requireVisible: true }) || findNextSatellitePass(args);
}

// Time zones aren't known for an arbitrary point, so the destination's clock is told
// in words from LOCAL SOLAR time (honest to within the hour), and the exact moment in
// the PLAYER's own clock. A visible pass is always in the dark, so it is "after dark"
// (solar afternoon/evening), "in the middle of the night" or "before dawn".
export function solarHour(ms, lng) {
  const d = new Date(ms);
  return (((d.getUTCHours() + d.getUTCMinutes() / 60 + lng / 15) % 24) + 24) % 24;
}
export function darkWords(ms, lng) {
  const h = solarHour(ms, lng);
  if (h >= 12 && h < 21) return 'after dark';
  if (h >= 3 && h < 12) return 'before dawn';
  return 'in the middle of the night';
}

export function untilWords(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return m ? `in ${h} h ${m} min` : `in ${h} h`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `in ${d} day${d === 1 ? '' : 's'} ${hh} h` : `in ${d} day${d === 1 ? '' : 's'}`;
}

export function yourClock(ms, locale) {
  return new Date(ms).toLocaleString(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

export function describePass(pass, point, { now = Date.now(), locale } = {}) {
  // The ISS orbit is tilted 51.6°; it is seen up to ~10° beyond that, never near the poles.
  if (!pass) {
    return Math.abs(point.lat) > 58
      ? 'The Space Station never passes over here — its orbit stays between about 52° north and south.'
      : null;
  }
  const when = `${untilWords(pass.riseMs - now)} (${yourClock(pass.riseMs, locale)} your time)`;
  if (pass.visible) {
    return `Next time the Space Station can be seen here: ${when}, ${darkWords(pass.riseMs, point.lng)} there — a bright moving star climbing to ${Math.round(pass.maxElevDeg)}° above the horizon.`;
  }
  // nextIssPass only falls back to an unseen pass when none is visible within 3 days.
  const why = pass.observerDark ? "while the station is in Earth's shadow" : 'in daylight';
  return `No visible Space Station pass here for the next 3 days — the next flyover, ${when}, happens ${why}.`;
}

// ---------- the two discovery-panel lines ----------

let issOnce = null;
export function issSatrecOnce(opts) {
  if (!issOnce) issOnce = loadIssSatrec(opts).then((r) => r?.satrec || null).catch(() => null);
  return issOnce;
}

const passMemo = new Map(); // "lat,lng,hour" -> pass (a pass search is ~10-40 ms; Explore revisits places)
function memoPass(satrec, point, now) {
  const key = `${point.lat.toFixed(2)},${point.lng.toFixed(2)},${Math.floor(now / 3600000)}`;
  if (!passMemo.has(key)) {
    if (passMemo.size > 40) passMemo.clear();
    passMemo.set(key, nextIssPass(satrec, point, now));
  }
  return passMemo.get(key);
}

// { quake, iss } sentences for a place; either is null when there's nothing honest to say.
export async function liveLinesFor(point, { miles = false, locale } = {}) {
  const [quakes, satrec] = await Promise.all([loadQuakes(), issSatrecOnce()]);
  const now = Date.now();
  return {
    quake: describeQuakes(quakes, point, { miles, now }),
    iss: satrec ? describePass(memoPass(satrec, point, now), point, { now, locale }) : null,
  };
}
