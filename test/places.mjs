// States / provinces and nearby towns (v5.4), against the committed data packs.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import {
  decodeRing, regionAt, regionKind, relationWithRegions, pickNearbyTowns, nearbyTowns,
  describeNearbyTowns, formatPopulationShort, cityTileKey, tilesAround,
} from '../src/places.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); passed++; }
  catch (error) { console.error(`FAIL ${name}\n${error.stack || error}`); process.exitCode = 1; }
}
// The game fetches ./data/...; in Node read public/data/... from disk.
const diskFetch = async (url) => {
  try { const text = await readFile(`public/${String(url).replace(/^\.?\/?/, '')}`, 'utf8'); return { ok: true, json: async () => JSON.parse(text) }; }
  catch { return { ok: false, json: async () => null }; }
};

await test('delta-encoded rings decode to degrees', () => {
  assert.deepEqual(decodeRing([-106358, 31718, 149, -241], 3), [[-106.358, 31.718], [-106.209, 31.477]]);
});

await test('states and provinces resolve for the places the family plays', async () => {
  const cases = [
    [30.27, -97.74, 'US', 'Texas'], [43.65, -79.38, 'CA', 'Ontario'], [-33.87, 151.21, 'AU', 'New South Wales'],
    [19.08, 72.88, 'IN', 'Maharashtra'], [-23.55, -46.63, 'BR', 'São Paulo'], [31.78, 35.22, 'IL', null],
  ];
  for (const [lat, lng, iso, want] of cases) {
    const r = await regionAt(lat, lng, iso, diskFetch);
    if (want) assert.equal(r?.name, want, `${lat},${lng}`);
    else assert.ok(r === null || typeof r.name === 'string', 'Jerusalem resolves to something or nothing, never throws');
  }
  assert.equal(await regionAt(0, 0, 'XX', diskFetch), null, 'unknown country file');
  assert.equal(await regionAt(30.27, -97.74, undefined, diskFetch), null, 'no country (sea)');
});

await test('a region across the antimeridian (Chukotka) resolves on both sides', async () => {
  const west = await regionAt(66.0, 175.0, 'RU', diskFetch);
  const east = await regionAt(66.0, -173.0, 'RU', diskFetch);
  assert.ok(west && east, 'both sides found');
  assert.equal(west.name, east.name);
});

await test('region words: state / province / region, never an odd label', () => {
  assert.equal(regionKind('State'), 'state');
  assert.equal(regionKind('Province'), 'province');
  assert.equal(regionKind('Autonomous Community'), 'region');
  assert.equal(regionKind('Commune|Municipality'), 'region');
  assert.equal(regionKind(null), 'region');
});

await test('relation line names states when it helps, and stays out of the way otherwise', () => {
  const g = { lat: 30.27, lng: -97.74 }, t = { lat: 29.76, lng: -95.37 };
  const tx = { name: 'Texas', type: 'State' };
  assert.match(relationWithRegions({ guess: g, target: t, guessCountry: 'United States of America', targetCountry: 'United States of America', guessRegion: tx, targetRegion: tx }),
    /^Right country, and the right state too: Texas! Your pin was \d+ km west of the destination\.$/);
  assert.match(relationWithRegions({ guess: g, target: { lat: 35.47, lng: -97.52 }, guessCountry: 'United States of America', targetCountry: 'United States of America', guessRegion: tx, targetRegion: { name: 'Oklahoma', type: 'State' } }),
    /^Your pin landed in Texas; the destination is in Oklahoma\./);
  assert.match(relationWithRegions({ guess: { lat: 43.65, lng: -79.38 }, target: t, guessCountry: 'Canada', targetCountry: 'United States of America', guessRegion: { name: 'Ontario', type: 'Province' }, targetRegion: tx }),
    /^Your pin landed in Ontario, Canada, [\d,]+ km northeast of the destination\. The destination is in Texas, United States of America\.$/);
  assert.equal(relationWithRegions({ guess: { lat: 42.5, lng: 21.9 }, target: { name: 'Gjirokastër, Albania', lat: 40.08, lng: 20.14 }, guessCountry: 'Serbia', targetCountry: 'Albania', guessRegion: { name: 'Pčinja', type: 'District' }, targetRegion: { name: 'Gjirokastër', type: 'County' } }),
    'Your pin landed in Pčinja, Serbia, 307 km northeast of the destination.', 'no "destination is in Gjirokastër" echo');
  assert.equal(relationWithRegions({ guess: g, target: t, guessCountry: null, targetCountry: 'United States of America', guessRegion: null, targetRegion: tx }), null, 'pin at sea: keep the old line');
});

await test('nearby towns: the biggest close by first, population shown, real tiles', async () => {
  const rows = [['Village', 0.5, 0.5, 20000], ['Big City', 1.5, 1.5, 2500000], ['Town', 0.2, 0.2, 60000], ['Far City', 7, 7, 9000000]];
  const picked = pickNearbyTowns(rows, { lat: 0, lng: 0 });
  assert.deepEqual(picked.map((c) => c.name), ['Big City', 'Town', 'Village']);
  const austin = await nearbyTowns({ lat: 30.27, lng: -97.74 }, 3, diskFetch);
  assert.equal(austin.length, 3);
  assert.ok(austin.some((c) => /San Antonio|Houston/.test(c.name)), austin.map((c) => c.name).join());
  assert.match(describeNearbyTowns(austin, { lat: 30.27, lng: -97.74 }), /^Nearby: .+ \(pop\. [\d.]+[kM], [\d,]+ km \w+\)/);
  assert.equal(formatPopulationShort(1460000), '1.5M');
  assert.equal(formatPopulationShort(23000000), '23M');
  assert.equal(formatPopulationShort(48200), '48k');
});

await test('city tiles: every committed row sits in the tile its key names; poles and the date line are safe', async () => {
  for (const f of (await readdir('public/data/cities')).filter((x) => x.endsWith('.json'))) {
    for (const [name, lat, lng] of JSON.parse(await readFile(`public/data/cities/${f}`, 'utf8'))) {
      assert.equal(`${cityTileKey(lat, lng)}.json`, f, name);
    }
  }
  assert.ok(tilesAround(89.5, 179.9).length >= 3);
  assert.ok(tilesAround(-89.5, -179.9).every((k) => /^\d+_\d+$/.test(k)));
});

console.log(`\n${passed} place tests passed`);
