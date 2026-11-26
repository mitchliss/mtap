// Nature rounds (v5.6): mountains, deserts, seas and straits as answers.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { FEATURES } from '../src/features.js';
import { FEATURE_LIST } from '../scripts/feature-list.mjs';
import { registerShape, shapeFor, nearestOnShape, insideShape, featureDistanceKm, loadFeatureShape } from '../src/featureshape.js';
import { dailyPicksFor, scoreGuess, FEATURE_START, FEATURE_WINDOW, GameSession, featureLoc } from '../src/game.js';
import { tagsFor } from '../src/themes.js';
import { LOCATIONS } from '../src/locations.js';
import { distanceKm, prepareCountries } from '../src/geo.js';
import { featureVerdict, featureResultLine, kindChip, theName, wikiTitleFor } from '../src/nature.js';
import { buildChallengePayload, importChallengePayload } from '../src/archive.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); passed++; }
  catch (error) { console.error(`FAIL ${name}\n${error.stack || error}`); process.exitCode = 1; }
}
prepareCountries(JSON.parse(await readFile('public/data/countries-50m.geojson', 'utf8')));
for (const f of FEATURES) registerShape(JSON.parse(await readFile(`public/data/features/${f.id}.json`, 'utf8')));
const byName = (n) => FEATURES.find((f) => f.name === n);

await test('every feature: a shape file, a label point inside its outline, sane fields', async () => {
  const files = (await readdir('public/data/features')).filter((f) => f.endsWith('.json'));
  assert.equal(files.length, FEATURES.length);
  const names = new Set(LOCATIONS.map((l) => l.name));
  for (const f of FEATURES) {
    const s = shapeFor(f.id);
    assert.ok(s, f.id);
    assert.ok(insideShape(s, f.lat, f.lng), `${f.name} label point inside`);
    assert.ok([1, 2, 3].includes(f.diff), f.name);
    assert.ok(f.fact && f.fact.length < 140, `${f.name} fact`);
    assert.ok(!names.has(f.name), `${f.name} is not also a point answer`);
  }
  assert.equal(new Set(FEATURES.map((f) => f.id)).size, FEATURES.length, 'unique ids');
  assert.ok(FEATURES.length >= 150);
  // Append-only: FEATURES keeps the list's order (challenge links carry the index).
  const listed = FEATURE_LIST.map((r) => r[1]);
  let last = -1;
  for (const f of FEATURES) { const i = listed.indexOf(f.name); assert.ok(i > last, `${f.name} in list order`); last = i; }
});

await test('inside is 0 km; outside is the distance to the nearest edge', () => {
  const sahara = shapeFor(byName('Sahara Desert').id);
  assert.equal(nearestOnShape(sahara, 23.4, 25.6).km, 0, 'middle of the Sahara');           // Western Desert, Egypt
  const zagros = shapeFor(byName('Zagros Mountains').id);
  assert.ok(insideShape(zagros, 33.0, 48.5), 'Lorestan is in the Zagros');
  const tehran = nearestOnShape(zagros, 35.69, 51.39);
  assert.ok(tehran.km > 30 && tehran.km < 400, `Tehran to the Zagros edge: ${Math.round(tehran.km)} km`);
  assert.ok(distanceKm(35.69, 51.39, tehran.lat, tehran.lng) - tehran.km < 1, 'the returned edge point is that far away');
  const med = shapeFor(byName('Mediterranean Sea').id);
  assert.ok(insideShape(med, 35.0, 18.0), 'Ionian middle is in the Med');
  assert.ok(nearestOnShape(med, 48.85, 2.35).km > 500, 'Paris is well away from the Med');
});

await test('shapes across the date line (Bering Sea) work on both sides', () => {
  const f = byName('Bering Sea');
  const s = shapeFor(f.id);
  assert.ok(insideShape(s, 58.0, 178.0) || insideShape(s, 58.0, -178.0), 'Bering Sea near 180');
  assert.ok(insideShape(s, 57.0, -175.0) && insideShape(s, 60.0, 179.0), 'both sides of 180');
  assert.equal(nearestOnShape(s, 57.0, 185.0 - 360).km, 0);
});

await test('scoring: anywhere inside is 100; the decay applies to the edge distance', () => {
  const t = featureLoc(byName('Gobi Desert'));
  const inside = scoreGuess(43.0, 105.0, t);
  assert.equal(inside.score, 100); assert.ok(inside.bullseye); assert.equal(inside.distanceKm, 0);
  const far = scoreGuess(-33.9, 18.4, t); // Cape Town
  assert.ok(far.score < 30, `Cape Town scores ${far.score}`);
  const fb = featureDistanceKm({ id: 'not-loaded', lat: 0, lng: 0, rKm: 100 }, 0, 3, distanceKm);
  assert.ok(Math.abs(fb - (distanceKm(0, 3, 0, 0) - 100)) < 1e-9, 'offline fallback: label distance less the radius');
  assert.equal(featureDistanceKm({ id: 'not-loaded', lat: 0, lng: 0, rKm: 900 }, 0, 3, distanceKm), 0);
});

await test(`daily deals: none before #${FEATURE_START}, exactly one a day after, never the news/heritage slot`, () => {
  for (let k = 100; k < FEATURE_START; k++) assert.ok(!dailyPicksFor(k).some((l) => l.isFeature), `#${k}`);
  const seen = new Map();
  for (let k = FEATURE_START; k < FEATURE_START + 400; k++) {
    const picks = dailyPicksFor(k);
    const f = picks.filter((l) => l.isFeature);
    assert.equal(f.length, 1, `#${k} has one nature round`);
    assert.equal(picks.length, 5);
    assert.ok(picks.some((l) => tagsFor(l).has('jewish')), `#${k} keeps its heritage place`);
    const [w, s, e, n] = f[0].bbox;
    for (const l of picks) if (!l.isFeature) {
      const inBox = l.lat >= s - 1 && l.lat <= n + 1 && [l.lng, l.lng + 360, l.lng - 360].some((x) => x >= w - 1 && x <= e + 1);
      assert.ok(!inBox, `#${k}: ${l.name} sits inside ${f[0].name}`);
    }
    if (seen.has(f[0].name)) assert.ok(k - seen.get(f[0].name) >= FEATURE_WINDOW, `${f[0].name} repeats after ${k - seen.get(f[0].name)} days`);
    seen.set(f[0].name, k);
  }
  assert.ok(seen.size > 150, `${seen.size} different nature rounds in 400 days`);
});

await test('practice games get a nature round too; challenge links carry it', () => {
  const s = new GameSession(12345, true, new Set());
  assert.equal(s.locations.filter((l) => l.isFeature).length, 1);
  const payload = buildChallengePayload('Tester', s);
  assert.ok(payload, 'payload built');
  const back = importChallengePayload(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(back.locations.map((l) => l.name), s.locations.map((l) => l.name));
  assert.ok(back.locations.find((l) => l.isFeature)?.bbox, 'the feature comes back as a feature');
});

await test('words: chip, verdicts, "the", Wikipedia title', () => {
  assert.equal(kindChip('desert'), '🏜️ Nature round · Desert');
  assert.equal(theName('The Alps'), 'the Alps');
  assert.equal(theName('Borneo'), 'Borneo');
  assert.match(featureVerdict({ target: { name: 'Zagros Mountains' }, distanceKm: 0, score: 100 }), /^🎯 Inside the Zagros Mountains/);
  assert.match(featureResultLine({ target: { name: 'Red Sea' }, distanceKm: 240, score: 95 }), /^Your pin was 240 km from the edge of the Red Sea\.$/);
  assert.equal(wikiTitleFor({ name: 'Lut Desert (Dasht-e Lut)' }), 'Lut Desert');
});

await test('loader fetches a shape once and never throws', async () => {
  let calls = 0;
  const fake = async () => { calls++; return { ok: true, json: async () => ({ id: 'tiny', rings: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }) }; };
  const [a, b] = await Promise.all([loadFeatureShape('tiny', fake), loadFeatureShape('tiny', fake)]);
  assert.equal(calls, 1); assert.equal(a, b);
  assert.equal(await loadFeatureShape('broken', async () => { throw new Error('offline'); }), null);
});

console.log(`\n${passed} nature tests passed`);
