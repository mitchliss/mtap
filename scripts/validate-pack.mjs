// Validates a staged location pack (a module exporting PACK) against the live
// database before it is appended to src/locations.js. Usage:
//   node scripts/validate-pack.mjs <path-to-staging-module>
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import { LOCATIONS } from '../src/locations.js';
import { NEWS } from '../src/news.js';
import { countryAt, distanceKm, prepareCountries } from '../src/geo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stagingPath = process.argv[2];
if (!stagingPath) { console.error('usage: node scripts/validate-pack.mjs <staging.mjs>'); process.exit(2); }
const { PACK } = await import(pathToFileURL(path.resolve(stagingPath)).href);

const geojson = JSON.parse(await readFile(path.join(root, 'public', 'data', 'countries-50m.geojson'), 'utf8'));
prepareCountries(geojson);

const errors = [];
const names = new Map();
for (const l of [...LOCATIONS, ...NEWS]) names.set(l.name.toLowerCase().trim(), 'existing');
const pins = [...LOCATIONS, ...NEWS].map((l) => ({ lat: l.lat, lng: l.lng, name: l.name }));

for (const [i, e] of PACK.entries()) {
  const at = `PACK[${i}] ${e?.name || '?'}`;
  if (!e || typeof e !== 'object') { errors.push(`${at}: not an object`); continue; }
  for (const key of ['name', 'lat', 'lng', 'country', 'continent', 'diff', 'fact']) {
    if (e[key] === undefined || e[key] === null || e[key] === '') errors.push(`${at}: missing ${key}`);
  }
  const lname = String(e.name).toLowerCase().trim();
  if (names.has(lname)) errors.push(`${at}: duplicate name (${names.get(lname)})`);
  else names.set(lname, `PACK[${i}]`);
  if (![1, 2, 3].includes(e.diff)) errors.push(`${at}: diff must be 1|2|3`);
  if (typeof e.fact !== 'string' || e.fact.length < 15 || e.fact.length > 220) errors.push(`${at}: fact length`);
  if (!Number.isFinite(e.lat) || Math.abs(e.lat) > 90 || !Number.isFinite(e.lng) || Math.abs(e.lng) > 180) {
    errors.push(`${at}: bad coordinates`); continue;
  }
  const resolved = countryAt(e.lat, e.lng);
  if (!resolved) errors.push(`${at}: coordinates resolve to ocean`);
  else {
    if (resolved.name !== e.country) errors.push(`${at}: country mismatch (resolved '${resolved.name}')`);
    if (resolved.continent && resolved.continent !== e.continent) errors.push(`${at}: continent mismatch (resolved '${resolved.continent}')`);
  }
  for (const p of pins) {
    if (Math.abs(e.lat - p.lat) > 0.06) continue;
    if (distanceKm(e.lat, e.lng, p.lat, p.lng) < 5) { errors.push(`${at}: within 5km of '${p.name}'`); break; }
  }
  pins.push({ lat: e.lat, lng: e.lng, name: e.name });
}

if (errors.length) {
  for (const err of errors) console.error(`FAIL ${err}`);
  console.error(`${errors.length} error(s) across ${PACK.length} entries`);
  process.exit(1);
}
const diffMix = {}; const contMix = {};
for (const e of PACK) { diffMix[e.diff] = (diffMix[e.diff] || 0) + 1; contMix[e.continent] = (contMix[e.continent] || 0) + 1; }
console.log(`PASS pack: ${PACK.length} entries, diff mix ${JSON.stringify(diffMix)}, continents ${JSON.stringify(contMix)}`);
console.log(`pool after merge: ${LOCATIONS.length + PACK.length}`);
