// Live Earth (v5.1): quakes + Space Station. Pure Node, no network - fetch is faked
// and the ISS uses the committed snapshot at a fixed instant near its epoch.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseQuakes, quakesNear, describeQuakes, loadQuakes, _resetQuakeCache, agoWords,
  satrecFromTle, loadIssSatrec, issPositionAt, issTrack, nextIssPass, describePass,
  darkWords, untilWords, altitudeToRadius,
} from '../src/live.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); passed++; }
  catch (error) { console.error(`FAIL ${name}\n${error.stack || error}`); process.exitCode = 1; }
}

const TLE = await readFile('public/data/iss-tle.txt', 'utf8');
const satrec = satrecFromTle(TLE);
// The snapshot's epoch, so propagation is exact regardless of today's date.
const EPOCH_MS = Date.UTC(2000 + satrec.epochyr, 0, 1) + (satrec.epochdays - 1) * 86400000;
const HOUR = 3600000, DAY = 24 * HOUR;

const feature = (lat, lng, mag, timeMs, place = 'somewhere') =>
  ({ type: 'Feature', properties: { mag, time: timeMs, place }, geometry: { type: 'Point', coordinates: [lng, lat, 10] } });
const NOW = Date.UTC(2026, 10, 25, 12);
const feed = { features: [
  feature(35.6, 139.7, 4.8, NOW - 2 * DAY, 'near Tokyo'),
  feature(36.5, 140.6, 3.1, NOW - 5 * HOUR),
  feature(-33.4, -70.6, 5.6, NOW - 30 * HOUR, 'near Santiago'),
  { type: 'Feature', properties: { mag: null, time: NOW }, geometry: { coordinates: [0, 0, 0] } }, // malformed
] };

await test('USGS rows parse; malformed rows are dropped', () => {
  const q = parseQuakes(feed);
  assert.equal(q.length, 3);
  assert.deepEqual(Object.keys(q[0]).sort(), ['depthKm', 'lat', 'lng', 'mag', 'place', 'timeMs']);
  assert.equal(parseQuakes(null).length, 0);
});

await test('quakes near a place: radius, nearest first, sentence names the largest', () => {
  const q = parseQuakes(feed);
  const tokyo = { lat: 35.68, lng: 139.69 };
  const near = quakesNear(q, tokyo);
  assert.equal(near.length, 2);
  assert.ok(near[0].distanceKm < near[1].distanceKm);
  const line = describeQuakes(q, tokyo, { now: NOW });
  assert.match(line, /^2 earthquakes within 500 km this week — largest magnitude 4\.8, 2 days ago, right here\.$/);
  assert.match(describeQuakes(q, tokyo, { now: NOW, miles: true }), /within 311 mi/);
  assert.match(describeQuakes(q, { lat: -34.6, lng: -58.4 }, { now: NOW }), /^No earthquakes .* 3 worldwide\.$/); // Buenos Aires
  assert.match(describeQuakes(q, { lat: -33.0, lng: -71.0 }, { now: NOW }), /^One earthquake .* magnitude 5\.6, yesterday, \d+ km southeast\.$/);
  assert.equal(describeQuakes([], tokyo), null, 'feed unavailable -> say nothing');
});

await test('quake loader: one fetch per 10 minutes, offline is an empty list not an error', async () => {
  _resetQuakeCache();
  let calls = 0;
  const ok = async () => { calls++; return { ok: true, json: async () => feed }; };
  assert.equal((await loadQuakes({ fetchImpl: ok, now: NOW })).length, 3);
  await loadQuakes({ fetchImpl: ok, now: NOW + 60000 });
  assert.equal(calls, 1);
  _resetQuakeCache();
  assert.deepEqual(await loadQuakes({ fetchImpl: async () => { throw new Error('offline'); }, now: NOW }), []);
  _resetQuakeCache();
  assert.deepEqual(await loadQuakes({ fetchImpl: async () => ({ ok: false, status: 503 }), now: NOW }), []);
  _resetQuakeCache();
});

await test('ago / until / part-of-day words', () => {
  assert.equal(agoWords(20 * 60000), 'within the hour');
  assert.equal(agoWords(1 * HOUR), '1 hour ago');
  assert.equal(agoWords(30 * HOUR), 'yesterday');
  assert.equal(agoWords(4 * DAY), '4 days ago');
  assert.equal(untilWords(42 * 60000), 'in 42 min');
  assert.equal(untilWords(3 * HOUR + 5 * 60000), 'in 3 h 5 min');
  assert.equal(untilWords(DAY + 6 * HOUR), 'in 1 day 6 h');
  assert.equal(darkWords(Date.UTC(2026, 0, 1, 0), 0), 'in the middle of the night');
  assert.equal(darkWords(Date.UTC(2026, 0, 1, 0), 180), 'after dark');   // midnight UTC is solar noon at 180°
  assert.equal(darkWords(Date.UTC(2026, 0, 1, 19), 0), 'after dark');
  assert.equal(darkWords(Date.UTC(2026, 0, 1, 5), 0), 'before dawn');
  assert.equal(darkWords(Date.UTC(2026, 0, 1, 5), -90), 'in the middle of the night'); // 23:00 solar
});

await test('TLE snapshot parses; garbage does not', () => {
  assert.ok(satrec && !satrec.error);
  assert.equal(satrecFromTle('hello'), null);
  assert.equal(satrecFromTle(''), null);
});

await test('ISS position is physical: |lat| <= 52° (51.6° orbit, geodetic), altitude 370-460 km, ~7.7 km/s', () => {
  for (let t = 0; t < DAY; t += 7 * 60000) {
    const p = issPositionAt(satrec, EPOCH_MS + t);
    assert.ok(p, 'propagates');
    assert.ok(Math.abs(p.lat) <= 52, `lat ${p.lat}`); // geodetic latitude runs ~0.2° past the inclination
    assert.ok(p.lng >= -180 && p.lng <= 180);
    assert.ok(p.altKm > 370 && p.altKm < 460, `alt ${p.altKm}`);
  }
  // Ground speed: one minute apart ~ 430-470 km along the ground (7.2-7.9 km/s).
  const a = issPositionAt(satrec, EPOCH_MS), b = issPositionAt(satrec, EPOCH_MS + 60000);
  const R = 6371, rad = Math.PI / 180;
  const d = R * Math.acos(Math.sin(a.lat * rad) * Math.sin(b.lat * rad) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad));
  assert.ok(d > 400 && d < 480, `ground km/min ${d}`);
  assert.ok(Math.abs(altitudeToRadius(420) - 1.0659) < 0.001);
});

await test('ISS track: continuous, ordered, covers the requested window', () => {
  const track = issTrack(satrec, EPOCH_MS);
  assert.equal(track[0].tMin, -45);
  assert.equal(track.at(-1).tMin, 50);
  for (let i = 1; i < track.length; i++) {
    const dLat = Math.abs(track[i].lat - track[i - 1].lat);
    assert.ok(dLat < 3, 'no jumps between 30 s samples');
  }
});

await test('next pass: found for mid-latitudes within 72 h, never near the poles, wording honest', () => {
  const t0 = performance.now();
  const chicago = { lat: 41.88, lng: -87.63 };
  const pass = nextIssPass(satrec, chicago, EPOCH_MS);
  const ms = performance.now() - t0;
  assert.ok(pass, 'Chicago gets a pass');
  assert.ok(pass.riseMs >= EPOCH_MS && pass.riseMs < EPOCH_MS + 72 * HOUR);
  assert.ok(pass.setMs > pass.riseMs && pass.maxElevDeg >= 10 && pass.maxElevDeg <= 90);
  const line = describePass(pass, chicago, { now: EPOCH_MS, locale: 'en-US' });
  assert.match(line, pass.visible
    ? /^Next time the Space Station can be seen here: in .+ your time\), (after dark|before dawn|in the middle of the night) there — a bright moving star climbing to \d+°/
    : /^No visible Space Station pass here for the next 3 days — the next flyover, .+, happens (in daylight|while the station is in Earth's shadow)\.$/);
  const unseen = { riseMs: EPOCH_MS + HOUR, setMs: EPOCH_MS + HOUR + 300000, maxElevDeg: 30, visible: false };
  assert.match(describePass({ ...unseen, observerDark: true }, chicago, { now: EPOCH_MS }), /in Earth's shadow\.$/);
  assert.match(describePass({ ...unseen, observerDark: false }, chicago, { now: EPOCH_MS }), /in daylight\.$/);
  assert.ok(ms < 1500, `pass search took ${ms.toFixed(0)} ms`);
  console.log(`  (pass search ${ms.toFixed(0)} ms in Node)`);

  const svalbard = { lat: 78.2, lng: 15.6 };
  assert.equal(nextIssPass(satrec, svalbard, EPOCH_MS), null);
  assert.match(describePass(null, svalbard), /never passes over here/);
  assert.equal(describePass(null, chicago), null, 'no pass found but reachable latitude -> say nothing');
});

await test('ISS loader: fresh cache, then CelesTrak, then stale cache, then the snapshot', async () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const net = async (url) => (String(url).includes('celestrak') ? { ok: true, text: async () => TLE } : { ok: false });
  let r = await loadIssSatrec({ fetchImpl: net, storage, now: NOW });
  assert.equal(r.source, 'celestrak');
  r = await loadIssSatrec({ fetchImpl: async () => { throw new Error('must not fetch'); }, storage, now: NOW + HOUR });
  assert.equal(r.source, 'cache');
  r = await loadIssSatrec({ fetchImpl: async () => { throw new Error('offline'); }, storage, now: NOW + 2 * DAY });
  assert.equal(r.source, 'stale-cache');
  const snap = async (url) => (String(url).endsWith('iss-tle.txt') ? { ok: true, text: async () => TLE } : { ok: false });
  r = await loadIssSatrec({ fetchImpl: snap, storage: null, now: NOW });
  assert.equal(r.source, 'snapshot');
  assert.equal(await loadIssSatrec({ fetchImpl: async () => { throw new Error('offline'); }, storage: null, now: NOW }), null);
});

await test('live data cannot touch the daily deal: game.js and the news/location data never import it', async () => {
  for (const f of ['src/game.js', 'src/news.js', 'src/locations.js', 'src/rng.js']) {
    assert.doesNotMatch(await readFile(f, 'utf8'), /live(layer)?\.js/, f);
  }
});

console.log(`\n${passed} live tests passed`);
