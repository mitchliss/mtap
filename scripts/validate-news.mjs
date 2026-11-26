import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCATIONS } from '../src/locations.js';
import { NEWS, newsRollFor } from '../src/news.js';
import { dailyPicksFor } from '../src/game.js';
import { countryAt, distanceKm, prepareCountries } from '../src/geo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function puzzleNumberInTimeZone(date, timeZone = 'America/New_York') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
  const day = Date.UTC(parts.year, parts.month - 1, parts.day);
  return Math.max(1, Math.round((day - Date.UTC(2026, 6, 22)) / 86400000) + 1);
}

// Earthquake rounds (v5.3): the numbers come straight from the USGS event.
// { mag, depthKm, time: ISO UTC, usgs: event id } - the quake must have struck in
// the week before the puzzle's day (an earthquake round is news, not history).
export function puzzleStartUtcMs(pn) { return Date.UTC(2026, 6, 22) + (pn - 1) * 86400000; }
export function quakeErrors(entry) {
  const q = entry.quake, errors = [];
  if (!q || typeof q !== 'object') return ['quake must be an object'];
  if (!Number.isFinite(q.mag) || q.mag < 4 || q.mag >= 10) errors.push('quake.mag must be 4.0-9.9');
  if (!Number.isFinite(q.depthKm) || q.depthKm < -5 || q.depthKm > 800) errors.push('quake.depthKm must be -5..800');
  if (typeof q.usgs !== 'string' || !/^[a-z0-9]{6,24}$/.test(q.usgs)) errors.push('quake.usgs must be the USGS event id (e.g. us7000abcd)');
  const t = typeof q.time === 'string' && /Z$/.test(q.time) ? Date.parse(q.time) : NaN;
  if (!Number.isFinite(t)) errors.push('quake.time must be an ISO UTC time ending in Z');
  else if (Number.isInteger(entry.pn)) {
    const day = puzzleStartUtcMs(entry.pn);
    if (t > day + 86400000 || t < day - 8 * 86400000) errors.push('quake.time must be within the week before the puzzle');
  }
  return errors;
}

export function validateNewsEntries(entries, { now = new Date(), currentPuzzle = null } = {}) {
  const errors = [];
  const current = currentPuzzle ?? puzzleNumberInTimeZone(now);
  const names = new Set(LOCATIONS.map((l) => l.name));
  const seenPn = new Set();
  // Only the most recently appended entry needs to land in the future: once a day passes,
  // its already-committed entry is expected to be historical, not a validation failure.
  const maxPn = Math.max(-Infinity, ...entries.map((e) => (e && Number.isInteger(e.pn) ? e.pn : -Infinity)));
  for (const [i, entry] of entries.entries()) {
    const at = `NEWS[${i}]`;
    if (!entry || typeof entry !== 'object') { errors.push(`${at}: entry must be an object`); continue; }
    for (const key of ['pn', 'slot', 'name', 'prompt', 'lat', 'lng', 'continent', 'diff', 'fact']) {
      if (entry[key] === undefined || entry[key] === null || entry[key] === '') errors.push(`${at}: missing ${key}`);
    }
    if (!Number.isInteger(entry.pn) || (entry.pn === maxPn && entry.pn <= current)) errors.push(`${at}: pn must be after #${current}`);
    if (seenPn.has(entry.pn)) errors.push(`${at}: duplicate pn`); else seenPn.add(entry.pn);
    if (!Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot > 4) errors.push(`${at}: slot must be 0..4`);
    if (![1, 2, 3].includes(entry.diff)) errors.push(`${at}: diff must be 1, 2, or 3`);
    if (!Number.isFinite(entry.lat) || entry.lat < -90 || entry.lat > 90 || !Number.isFinite(entry.lng) || entry.lng < -180 || entry.lng > 180) errors.push(`${at}: invalid coordinates`);
    if (names.has(entry.name)) errors.push(`${at}: duplicate name`); else names.add(entry.name);
    if (!newsRollFor(entry.pn) && !entry.force) errors.push(`${at}: off-roll entry requires force`);
    if (entry.allowNear && typeof entry.justification !== 'string') errors.push(`${at}: allowNear requires justification`);
    if (entry.quake !== undefined) for (const e of quakeErrors(entry)) errors.push(`${at}: ${e}`);
    const resolved = Number.isFinite(entry.lat) && Number.isFinite(entry.lng) ? countryAt(entry.lat, entry.lng) : null;
    if (entry.offshore) {
      if (entry.country !== null) errors.push(`${at}: offshore entry must have country null`);
    } else if (!resolved || resolved.name !== entry.country) {
      errors.push(`${at}: country mismatch (resolved ${resolved?.name || 'ocean'})`);
    }
    if (Number.isFinite(entry.lat) && Number.isFinite(entry.lng)) {
      if (LOCATIONS.some((l) => distanceKm(entry.lat, entry.lng, l.lat, l.lng) < 5)) errors.push(`${at}: within 5km of static location`);
      if (!entry.allowNear && Number.isInteger(entry.pn)) {
        outer: for (let pn = Math.max(1, entry.pn - 30); pn < entry.pn; pn++) {
          for (const l of dailyPicksFor(pn)) if (distanceKm(entry.lat, entry.lng, l.lat, l.lng) < 100) {
            errors.push(`${at}: within 100km of recent deal #${pn}`); break outer;
          }
        }
      }
    }
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const geojson = JSON.parse(await readFile(path.join(root, 'public', 'data', 'countries-50m.geojson'), 'utf8'));
  prepareCountries(geojson);
  const errors = validateNewsEntries(NEWS);
  if (errors.length) {
    for (const error of errors) console.error(`FAIL ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS news validator: ${NEWS.length} entr${NEWS.length === 1 ? 'y' : 'ies'}`);
  }
}
