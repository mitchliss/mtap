import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { NEWS, NEWS_START, newsRollFor } from '../src/news.js';
import { LOCATIONS } from '../src/locations.js';
import { dailyPicksFor, injectNewsIntoDeal, MAX_GAME_SCORE, ROUND_MULTIPLIERS } from '../src/game.js';
import { countryAt, distanceKm, prepareCountries } from '../src/geo.js';
import { K_ROT, rotationSpeedForAltitude, selectTextureTier, smoothingAlpha, subsolarPoint } from '../src/graphics.js';
import { validateNewsEntries } from '../scripts/validate-news.mjs';

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); passed++; }
  catch (error) { console.error(`FAIL ${name}\n${error.stack || error}`); process.exitCode = 1; }
}

const geojson = JSON.parse(await readFile(path.resolve('public/data/countries-50m.geojson'), 'utf8'));
prepareCountries(geojson);

test('news roll is deterministic and approximately 40% over 1000 days', () => {
  const a = Array.from({ length: 1000 }, (_, i) => newsRollFor(i + 1));
  const b = Array.from({ length: 1000 }, (_, i) => newsRollFor(i + 1));
  assert.deepEqual(a, b);
  const rate = a.filter(Boolean).length / a.length;
  assert.ok(rate > 0.36 && rate < 0.44, `rate=${rate}`);
});

let validPn = NEWS_START;
while (!newsRollFor(validPn)) validPn++;
let land = null;
for (let lat = -70; lat <= 70 && !land; lat += 7) for (let lng = -175; lng <= 175; lng += 11) {
  const country = countryAt(lat, lng);
  if (country && LOCATIONS.every((l) => distanceKm(lat, lng, l.lat, l.lng) >= 5)) { land = { lat, lng, country }; break; }
}
const entry = {
  pn: validPn, slot: 2, name: 'Validator Test Place', prompt: 'A test event', lat: land.lat, lng: land.lng,
  country: land.country.name, continent: land.country.continent, diff: 2, fact: 'Test fact.', allowNear: true, justification: 'Unit fixture.',
};

test('validator accepts a valid future entry', () => assert.deepEqual(validateNewsEntries([entry], { currentPuzzle: 43 }), []));
for (const [name, mutate, expected] of [
  ['bad country', (e) => { e.country = 'Atlantis'; }, 'country mismatch'],
  ['duplicate name', (e) => { e.name = LOCATIONS[0].name; }, 'duplicate name'],
  ['static neighbor under 5km', (e) => Object.assign(e, { lat: LOCATIONS[0].lat, lng: LOCATIONS[0].lng, country: LOCATIONS[0].country }), 'within 5km'],
  ['past puzzle number', (e) => { e.pn = 43; e.force = true; }, 'pn must be after'],
  ['bad slot', (e) => { e.slot = 5; }, 'slot must be 0..4'],
]) test(`validator rejects ${name}`, () => {
  const bad = structuredClone(entry); mutate(bad);
  assert.ok(validateNewsEntries([bad], { currentPuzzle: 43 }).some((x) => x.includes(expected)));
});

test('validator rejects off-roll without force', () => {
  const bad = structuredClone(entry); while (newsRollFor(++bad.pn));
  assert.ok(validateNewsEntries([bad], { currentPuzzle: 43 }).some((x) => x.includes('off-roll')));
});
test('validator rejects a recent-chain neighbor under 100km', () => {
  const bad = structuredClone(entry); bad.allowNear = false; delete bad.justification;
  const recent = dailyPicksFor(bad.pn - 1)[0]; Object.assign(bad, { lat: recent.lat, lng: recent.lng, country: recent.country, continent: recent.continent });
  assert.ok(validateNewsEntries([bad], { currentPuzzle: 43 }).some((x) => x.includes('within 100km')));
});

const base = [
  { name: 'a', country: 'A', continent: 'X', lat: 0, lng: 0 }, { name: 'b', country: 'B', continent: 'Y', lat: 20, lng: 20 },
  { name: 'c', country: 'C', continent: 'Z', lat: -20, lng: 40 }, { name: 'd', country: 'D', continent: 'X', lat: 40, lng: -60 },
  { name: 'e', country: 'E', continent: 'Y', lat: -40, lng: -100 },
];
test('slot fallback order handles country duplicate', () => {
  const r = injectNewsIntoDeal(base, { ...entry, slot: 0, country: 'B', continent: 'Y', lat: 65, lng: 120 });
  assert.equal(r.slot, 1);
});
test('slot fallback order handles under-100km sibling', () => {
  const r = injectNewsIntoDeal(base, { ...entry, slot: 0, country: 'N', continent: 'X', lat: 20, lng: 20.1 });
  assert.equal(r.slot, 1);
});
test('slot fallback order handles continent degradation', () => {
  const r = injectNewsIntoDeal(base, { ...entry, slot: 2, country: 'N', continent: 'X', lat: 65, lng: 120 });
  assert.equal(r.slot, 0);
});
test('injection is deterministic and preserves five rounds / 1000-point ladder', () => {
  assert.deepEqual(injectNewsIntoDeal(base, entry), injectNewsIntoDeal(base, entry));
  assert.equal(injectNewsIntoDeal(base, entry).picks.length, 5);
  assert.deepEqual(ROUND_MULTIPLIERS, [1, 1, 2, 3, 3]); assert.equal(MAX_GAME_SCORE, 1000);
});

test('K_ROT follows the fov derivation and is altitude proportional', () => {
  const expected = 1.1 * 2 * Math.tan(45 * Math.PI / 360) / (2 * Math.PI);
  assert.ok(Math.abs(K_ROT - expected) < 1e-12);
  assert.ok(Math.abs(rotationSpeedForAltitude(1) / rotationSpeedForAltitude(0.5) - 2) < 1e-12);
});
test('dt-correct smoothing has matching per-second convergence', () => {
  const remain = (dt) => Math.pow(1 - smoothingAlpha(dt, 0.045), Math.round(1 / dt));
  assert.ok(Math.abs(remain(1 / 60) - remain(1 / 120)) < 1e-12);
});
test('texture tiers are conservative on mobile and capped by hardware', () => {
  assert.deepEqual(selectTextureTier({ mobile: true, maxTextureSize: 4096 }).base, [4096, 2048]);
  assert.equal(selectTextureTier({ mobile: true, maxTextureSize: 8192, promoted: true }).name, 'high');
  assert.deepEqual(selectTextureTier({ mobile: false, maxTextureSize: 2048 }).night, [2048, 1024]);
});
test('subsolar calculation is finite and bounded', () => {
  const sun = subsolarPoint(new Date('2026-09-02T12:00:00Z'));
  assert.ok(Number.isFinite(sun.lat) && Number.isFinite(sun.lng)); assert.ok(Math.abs(sun.lat) <= 23.5 && Math.abs(sun.lng) <= 180);
});
test('pool is large enough for the 365-day no-repeat window', () => {
  // 5 slots/day * 365-day window + margin for the country/diff filters.
  assert.ok(LOCATIONS.length >= 5 * 365 + 45, `pool=${LOCATIONS.length}`);
});
test('no location repeats within any 365-day span from puzzle 48 onward', function () {
  const lastSeen = new Map();
  for (let k = 1; k <= 448; k++) {
    for (const p of dailyPicksFor(k)) {
      const prev = lastSeen.get(p.name);
      if (prev !== undefined && k >= 48) {
        assert.ok(k - prev > 365, `${p.name} dealt at #${prev} and again at #${k} (${k - prev} days)`);
      }
      lastSeen.set(p.name, k);
    }
  }
});
test('year-window deals stay deterministic and well-formed', () => {
  for (const k of [48, 100, 250, 448]) {
    const a = dailyPicksFor(k), b = dailyPicksFor(k);
    assert.deepEqual(a.map((p) => p.name), b.map((p) => p.name));
    assert.equal(a.length, 5);
    assert.equal(new Set(a.map((p) => p.country)).size, 5, `country dupe on #${k}`);
  }
});
test('immutable deal oracle remains byte-identical through puzzle 43', () => {
  const out = execFileSync(process.execPath, ['scripts/capture-deal-oracle.mjs', '--check'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.match(out, /PASS deal oracle/);
});

if (!process.exitCode) console.log(`PASS all ${passed} Node gates`);
