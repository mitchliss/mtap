// Live hazards (v5.6): storms, wildfires and news pins. Pure Node, no network -
// fixtures are trimmed real EONET / GDACS responses from 2026-11-25, fetch is faked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseEonet, parseGdacs, mergeHazards, sanitizeHazards, stormCategory, stormKind, stormLabel, stormName,
  fireLabel, hazardsNear, describeStorm, describeFire, areaWords, parseHeadlines, describeNews, newsAgoWords,
  pickTourStops, loadHazards, loadHeadlines, _resetHazardCache, currentHazards, cleanText, parseTime,
  EONET_URL, GDACS_URL, HEADLINES_URL,
} from '../src/hazards.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); passed++; }
  catch (error) { console.error(`FAIL ${name}\n${error.stack || error}`); process.exitCode = 1; }
}

const EONET = JSON.parse(await readFile('test/fixtures/eonet-events.json', 'utf8'));
const GDACS = JSON.parse(await readFile('test/fixtures/gdacs-events.json', 'utf8'));
const HOUR = 3600000, DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 25, 21);

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

await test('EONET: storm track parsed in time order, wildfires in hectares, planned burns dropped', () => {
  const { storms, fires } = parseEonet(EONET, { now: NOW });
  assert.equal(storms.length, 1);
  const x = storms[0];
  assert.equal(x.name, 'Xavier');
  assert.equal(x.kind, 'cyclone'); // South Pacific
  assert.ok(x.track.length >= 5);
  for (let i = 1; i < x.track.length; i++) assert.ok(x.track[i].t > x.track[i - 1].t);
  const last = x.track[x.track.length - 1];
  assert.deepEqual([x.lat, x.lng, x.kts], [last.lat, last.lng, last.kts]);
  assert.equal(x.cat, stormCategory(x.kts));
  assert.ok(x.track.some((p) => p.kts >= 113), 'the peak (category 4) is in the track');
  assert.equal(fires.length, 4);
  assert.ok(!fires.some((f) => /prescribed/i.test(f.name)));
  const ridge = fires.find((f) => /Little Ridge/.test(f.name));
  assert.equal(ridge.ha, Math.round(900 * 0.404686));
  assert.equal(fireLabel(ridge), 'Wildfire Little Ridge, Highland, Virginia');
});

await test('GDACS: current cyclone (point only) and worldwide fires with country', () => {
  const { storms, fires } = parseGdacs(GDACS, { now: NOW });
  assert.equal(storms.length, 1);
  assert.equal(storms[0].name, '', 'a code like 03-20262027-27 is not a name');
  assert.equal(storms[0].cat, 0);
  assert.equal(stormLabel(storms[0]), 'Tropical storm');
  assert.equal(storms[0].track.length, 1);
  assert.equal(fires.length, 6);
  const big = fires.reduce((a, b) => (b.ha > a.ha ? b : a));
  assert.equal(big.ha, 54932);
  assert.equal(big.country, 'Australia');
  assert.equal(fireLabel(big), 'Wildfire in Australia');
});

await test('stale events are dropped (open storm with an old last fix, old fires)', () => {
  const later = NOW + 30 * DAY;
  assert.equal(parseEonet(EONET, { now: later }).storms.length, 0);
  assert.equal(parseEonet(EONET, { now: later }).fires.length, 0);
  assert.equal(parseGdacs(GDACS, { now: later }).storms.length, 0);
  assert.equal(parseGdacs(GDACS, { now: later }).fires.length, 0);
});

await test('category, basin word and label', () => {
  assert.deepEqual([20, 34, 63, 64, 82, 83, 96, 113, 137, 180].map(stormCategory), [-1, 0, 0, 1, 1, 2, 3, 4, 5, 5]);
  assert.equal(stormCategory(NaN), -1);
  assert.equal(stormKind(25, 130), 'typhoon');
  assert.equal(stormKind(25, -75), 'hurricane');   // Atlantic
  assert.equal(stormKind(15, -120), 'hurricane');  // east Pacific
  assert.equal(stormKind(18, -160), 'hurricane');  // central Pacific
  assert.equal(stormKind(15, 88), 'cyclone');      // Bay of Bengal
  assert.equal(stormKind(-15, 150), 'cyclone');    // Australia
  const s = (kts, lat, lng, name = 'Xavier') => ({ name, kts, cat: stormCategory(kts), kind: stormKind(lat, lng) });
  assert.equal(stormLabel(s(100, 20, 135)), 'Typhoon Xavier');
  assert.equal(stormLabel(s(70, 25, -70)), 'Hurricane Xavier');
  assert.equal(stormLabel(s(70, -15, 160)), 'Cyclone Xavier');
  assert.equal(stormLabel(s(50, 20, 135)), 'Tropical storm Xavier');
  assert.equal(stormLabel(s(25, 20, 135, '')), 'Tropical depression');
  assert.equal(stormName('Tropical Cyclone Xavier'), 'Xavier');
  assert.equal(stormName('Super Typhoon Fung-wong'), 'Fung-wong');
  assert.equal(stormName('FUNG-WONG'), 'Fung-Wong');
  assert.equal(stormName('Hurricane Melissa'), 'Melissa');
  assert.equal(stormName('Tropical Depression 27W'), '27W');
  assert.equal(stormName('Tropical Cyclone 03-20262027-27'), '');
  assert.equal(stormName('<img src=x onerror=alert(1)>'), '');
});

await test('merge: GDACS fills in, the same storm / fire is not counted twice', () => {
  const e = parseEonet(EONET, { now: NOW }), g = parseGdacs(GDACS, { now: NOW });
  const m = mergeHazards(e, g);
  assert.equal(m.storms.length, 2);
  assert.ok(m.storms[0].kts >= m.storms[1].kts, 'strongest first');
  assert.equal(m.fires.length, 10);
  const twinStorm = { storms: [{ ...g.storms[0], lat: g.storms[0].lat + 1 }], fires: [] };
  assert.equal(mergeHazards(twinStorm, g).storms.length, 1);
  const twinFire = { storms: [], fires: [{ name: 'Wildfire Big Gully', lat: -19.2, lng: 122.3, ha: 100, country: '' }] };
  const mf = mergeHazards(twinFire, g);
  assert.equal(mf.fires.length, 6);
  const merged = mf.fires.find((f) => f.name === 'Wildfire Big Gully');
  assert.equal(merged.ha, 54932, 'the bigger area wins');
  assert.equal(merged.country, 'Australia');
});

await test('storm line: within 1,500 km, direction, wind in the player units', () => {
  const ty = { storms: [{ name: 'Xavier', kts: 95, cat: 2, kind: 'typhoon', lat: 25.5, lng: 136, track: [] }], fires: [] };
  const here = { lat: 20, lng: 130 };
  assert.match(describeStorm(ty, here), /^Typhoon Xavier \(Category 2\) is [\d,]+ km northeast of here, winds 175 km\/h\.$/);
  assert.match(describeStorm(ty, here, { miles: true }), /^Typhoon Xavier \(Category 2\) is [\d,]+ mi northeast of here, winds 110 mph\.$/);
  assert.match(describeStorm(ty, { lat: 25.6, lng: 136.1 }), /is right over here/);
  assert.equal(describeStorm(ty, { lat: 35, lng: 140 }) === null, false); // ~1,060 km
  assert.equal(describeStorm(ty, { lat: 40, lng: 145 }), null);         // ~1,830 km
  const ts = { storms: [{ name: '', kts: 40, cat: 0, kind: 'cyclone', lat: -10, lng: 80, track: [] }], fires: [] };
  assert.match(describeStorm(ts, { lat: -12, lng: 80 }), /^Tropical storm is [\d,]+ km north of here, winds 75 km\/h\.$/);
  assert.equal(describeStorm({ storms: [], fires: [] }, here), null);
});

await test('fire line: within 300 km, area rounded, the biggest of several', () => {
  const data = mergeHazards(parseEonet(EONET, { now: NOW }), parseGdacs(GDACS, { now: NOW }));
  assert.equal(areaWords(8055), 'about 8,100 hectares');
  assert.equal(areaWords(54932), 'about 55,000 hectares');
  assert.equal(areaWords(364), 'about 360 hectares');
  assert.equal(areaWords(8055, true), 'about 20,000 acres');
  // 1° south of the 54,932 ha fire; the 46,598 ha one is ~350 km away (outside).
  const line = describeFire(data, { lat: -20.14, lng: 122.29 });
  assert.match(line, /^A wildfire burning about 55,000 hectares is 111 km north of here\.$/);
  assert.equal(describeFire(data, { lat: -25, lng: 122 }), null);
  // Two Virginia fires ~55 km apart: the bigger one is named, the count is given.
  assert.match(describeFire(data, { lat: 38.1, lng: -79.8 }), /^A wildfire burning about 910 hectares is .* — one of 2 burning within 300 km\.$/);
  assert.equal(describeFire({ storms: [], fires: [{ lat: 0, lng: 0, ha: null }] }, { lat: 0, lng: 0.5 }), 'A wildfire is 56 km west of here.');
});

await test('hazardsNear: nearest first, defaults to the last load', async () => {
  const data = mergeHazards(parseEonet(EONET, { now: NOW }), parseGdacs(GDACS, { now: NOW }));
  const near = hazardsNear(37.8, -79.86, 300, data);
  assert.equal(near.fires.length, 2); // the two Virginia fires; Tennessee is ~310 km
  assert.ok(near.fires[0].distanceKm <= near.fires[1].distanceKm);
  assert.equal(near.storms.length, 0);
  _resetHazardCache();
  assert.deepEqual(hazardsNear(37.8, -79.86, 300), { storms: [], fires: [] }, 'nothing loaded -> nothing near');
});

const pin = (over = {}) => ({
  id: 'natanz-1', lat: 33.72, lng: 51.73, place: 'Natanz, Iran', title: 'Strike reported near the enrichment site',
  summary: 'Context.', kind: 'military', time: new Date(NOW - 3 * HOUR).toISOString(), source: 'https://www.example.com/a', ...over,
});

await test('headlines: strict validation, 72 h window, https only, freshest 12', () => {
  const pins = parseHeadlines({ updated: 'x', pins: [
    pin(),
    pin({ id: 'old', time: new Date(NOW - 73 * HOUR).toISOString() }),
    pin({ id: 'future', time: new Date(NOW + 3 * HOUR).toISOString() }),
    pin({ id: 'http', source: 'http://example.com/a' }),
    pin({ id: 'js', source: 'javascript:alert(1)' }),
    pin({ id: 'sample-x' }),
    pin({ id: 'kind', kind: 'gossip' }),
    pin({ id: 'long', title: 'x'.repeat(91) }),
    pin({ id: 'sum', summary: 'x'.repeat(221) }),
    pin({ id: 'lat', lat: 91 }),
    pin({ id: 'str', lat: '33.7' }),
    pin({ id: 'x'.repeat(41) }),
    pin({ id: 'noplace', place: '' }),
    pin({ id: 'badtime', time: 'yesterday' }),
    pin(), // duplicate id
    null, 'junk', 42,
  ] }, { now: NOW });
  assert.deepEqual(pins.map((p) => p.id), ['natanz-1']);
  assert.equal(pins[0].timeMs, NOW - 3 * HOUR);
  const many = Array.from({ length: 20 }, (_, i) => pin({ id: `p${i}`, time: new Date(NOW - i * HOUR).toISOString() }));
  const top = parseHeadlines({ pins: many }, { now: NOW });
  assert.equal(top.length, 12);
  assert.equal(top[0].id, 'p0');
  for (const junk of [null, undefined, 'x', 7, { pins: 'x' }, { pins: [[]] }]) assert.deepEqual(parseHeadlines(junk, { now: NOW }), []);
  // Feed text is cleaned of control characters and markup brackets.
  assert.equal(parseHeadlines({ pins: [pin({ title: 'A <b>bold</b>\u0007 claim' })] }, { now: NOW })[0].title, 'A b bold /b claim');
});

await test('the committed sample file is valid but never drawn', async () => {
  const sample = JSON.parse(await readFile('live/headlines.json', 'utf8'));
  const t = Date.parse(sample.pins[0].time) + HOUR;
  assert.deepEqual(parseHeadlines(sample, { now: t }), []);
  const renamed = { pins: sample.pins.map((p) => ({ ...p, id: p.id.replace(/^sample-/, 's-') })) };
  assert.equal(parseHeadlines(renamed, { now: t }).length, sample.pins.length, 'every sample pin passes validation');
});

await test('news line: freshest pin within 600 km, linked source', () => {
  const pins = parseHeadlines({ pins: [pin(), pin({ id: 'tehran', place: 'Tehran, Iran', lat: 35.69, lng: 51.39, title: 'Older', time: new Date(NOW - 20 * HOUR).toISOString() })] }, { now: NOW });
  const n = describeNews(pins, { lat: 32.65, lng: 51.67 }, { now: NOW }); // Isfahan
  assert.equal(n.text, '📰 3 h ago near Natanz, Iran: Strike reported near the enrichment site');
  assert.equal(n.url, 'https://www.example.com/a');
  assert.equal(n.host, 'example.com');
  assert.equal(describeNews(pins, { lat: 25.2, lng: 55.27 }, { now: NOW }), null); // Dubai, ~950 km from Natanz
  assert.equal(describeNews([], { lat: 33.7, lng: 51.7 }, { now: NOW }), null);
});

await test('news ago words', () => {
  assert.equal(newsAgoWords(20 * 1000), '1 min ago');
  assert.equal(newsAgoWords(45 * 60000), '45 min ago');
  assert.equal(newsAgoWords(3 * HOUR), '3 h ago');
  assert.equal(newsAgoWords(30 * HOUR), '30 h ago');
  assert.equal(newsAgoWords(60 * HOUR), '3 days ago');
});

await test('tour stops: strongest storm, big recent quake, freshest news, biggest fire, then seconds', () => {
  const data = mergeHazards(parseEonet(EONET, { now: NOW }), parseGdacs(GDACS, { now: NOW }));
  const quakes = [
    { lat: 1, lng: 2, mag: 6.2, timeMs: NOW - DAY },
    { lat: 3, lng: 4, mag: 7.0, timeMs: NOW - 5 * DAY }, // too old
    { lat: 5, lng: 6, mag: 5.0, timeMs: NOW - HOUR },    // too small
  ];
  const news = parseHeadlines({ pins: [pin(), pin({ id: 'b', place: 'Tehran, Iran', time: new Date(NOW - HOUR).toISOString() })] }, { now: NOW });
  const stops = pickTourStops({ ...data, quakes, news }, NOW);
  assert.deepEqual(stops.map((s) => s.kind), ['storm', 'quake', 'news', 'fire', 'storm']);
  assert.equal(stops[1].label, 'Magnitude 6.2 earthquake');
  assert.equal(stops[2].label, 'Tehran, Iran', 'freshest news first');
  assert.equal(stops[3].label, 'Wildfire in Australia');
  for (const s of stops) assert.ok(Number.isFinite(s.lat) && Number.isFinite(s.lng) && s.label);
  assert.deepEqual(pickTourStops({}, NOW), []);
  assert.deepEqual(pickTourStops({ quakes: [quakes[2]] }, NOW), []);
});

const fakeFetch = (routes, calls = []) => async (url) => {
  calls.push(url);
  for (const [prefix, body] of routes) {
    if (url.startsWith(prefix)) {
      if (body instanceof Error) throw body;
      if (typeof body === 'number') return { ok: false, status: body };
      return { ok: true, json: async () => body };
    }
  }
  return { ok: false, status: 404 };
};

await test('hazard loader: both feeds, 30-minute device cache, either feed may fail, offline is empty', async () => {
  _resetHazardCache();
  let calls = [];
  const storage = memStorage();
  const h = await loadHazards({ fetchImpl: fakeFetch([[EONET_URL, EONET], [GDACS_URL, GDACS]], calls), storage, now: NOW });
  assert.equal(h.storms.length, 2); assert.equal(h.fires.length, 10);
  assert.equal(calls.length, 2);
  assert.equal(currentHazards(), h);
  // Same tab: the memory cache. New tab (memory gone): the device cache, no fetch.
  await loadHazards({ fetchImpl: fakeFetch([], calls), storage, now: NOW + 60000 });
  _resetHazardCache();
  const fromDevice = await loadHazards({ fetchImpl: fakeFetch([], calls), storage, now: NOW + 10 * 60000 });
  assert.equal(calls.length, 2);
  assert.equal(fromDevice.storms.length, 2);
  // Expired device cache -> refetch.
  _resetHazardCache();
  await loadHazards({ fetchImpl: fakeFetch([], calls), storage, now: NOW + 31 * 60000 });
  assert.equal(calls.length, 4);
  // One feed down: what the other has, and nothing written to the device cache.
  _resetHazardCache();
  const s2 = memStorage();
  const half = await loadHazards({ fetchImpl: fakeFetch([[EONET_URL, new Error('offline')], [GDACS_URL, GDACS]]), storage: s2, now: NOW });
  assert.equal(half.fires.length, 6);
  assert.equal(s2.m.size, 0);
  _resetHazardCache();
  assert.deepEqual(await loadHazards({ fetchImpl: async () => { throw new Error('offline'); }, storage: memStorage(), now: NOW }), { storms: [], fires: [] });
  _resetHazardCache();
  assert.deepEqual(await loadHazards({ fetchImpl: fakeFetch([[EONET_URL, '<html>'], [GDACS_URL, 503]]), storage: memStorage(), now: NOW }), { storms: [], fires: [] });
  // A tampered device cache is re-validated, not trusted.
  _resetHazardCache();
  const bad = memStorage();
  bad.setItem('marctap.hazards', JSON.stringify({ at: NOW, data: { storms: [{ name: 'X', track: [{ lat: 999, lng: 0, t: NOW, kts: 50 }] }], fires: [{ lat: 'a', lng: 0 }, { lat: 1, lng: 2, ha: 1e12, name: 'y'.repeat(500) }] } }));
  const t = await loadHazards({ fetchImpl: fakeFetch([]), storage: bad, now: NOW + 1000 });
  assert.equal(t.storms.length, 0);
  assert.equal(t.fires.length, 1);
  assert.equal(t.fires[0].ha, 1e7);
  assert.ok(t.fires[0].name.length <= 60);
  bad.setItem('marctap.hazards', '{not json');
  _resetHazardCache();
  assert.equal((await loadHazards({ fetchImpl: fakeFetch([[EONET_URL, EONET], [GDACS_URL, GDACS]]), storage: bad, now: NOW })).storms.length, 2);
  _resetHazardCache();
});

await test('headline loader: cache-busted URL, 10-minute cache, a 404 is silent', async () => {
  _resetHazardCache();
  const calls = [];
  const storage = memStorage();
  const feed = { pins: [pin()] };
  const pins = await loadHeadlines({ fetchImpl: fakeFetch([[HEADLINES_URL, feed]], calls), storage, now: NOW });
  assert.equal(pins.length, 1);
  assert.equal(calls[0], `${HEADLINES_URL}?t=${Math.floor(NOW / 300000)}`);
  _resetHazardCache();
  await loadHeadlines({ fetchImpl: fakeFetch([], calls), storage, now: NOW + 9 * 60000 });
  assert.equal(calls.length, 1, 'device cache');
  _resetHazardCache();
  assert.deepEqual(await loadHeadlines({ fetchImpl: fakeFetch([], calls), storage: memStorage(), now: NOW }), []);
  _resetHazardCache();
  assert.deepEqual(await loadHeadlines({ fetchImpl: async () => { throw new Error('offline'); }, storage: memStorage(), now: NOW }), []);
  _resetHazardCache();
});

await test('junk input is rejected, never repaired', () => {
  for (const junk of [null, undefined, 'x', 7, [], { events: 'x' }, { events: [null, 1, { categories: 'x' }] }]) {
    assert.deepEqual(parseEonet(junk, { now: NOW }), { storms: [], fires: [] });
  }
  for (const junk of [null, 'x', { features: 'x' }, { features: [{}, { properties: {}, geometry: { type: 'Point', coordinates: ['1', '2'] } }] }]) {
    assert.deepEqual(parseGdacs(junk, { now: NOW }), { storms: [], fires: [] });
  }
  const ev = (over) => ({ events: [{ title: 'Typhoon Bad', categories: [{ id: 'severeStorms' }], geometry: [{ type: 'Point', date: '2026-11-25T00:00:00Z', magnitudeValue: 80, magnitudeUnit: 'kts', coordinates: [130, 20], ...over }] }] });
  assert.equal(parseEonet(ev({ coordinates: [200, 20] }), { now: NOW }).storms.length, 0);
  assert.equal(parseEonet(ev({ coordinates: [130, NaN] }), { now: NOW }).storms.length, 0);
  assert.equal(parseEonet(ev({ magnitudeUnit: 'mb' }), { now: NOW }).storms.length, 0, 'no wind, no storm');
  assert.equal(parseEonet(ev({ date: 'not a date' }), { now: NOW }).storms.length, 0);
  assert.equal(parseEonet(ev({ magnitudeValue: 99999 }), { now: NOW }).storms[0].kts, 250, 'clamped');
  const tc = (sev, unit = 'km/h') => ({ features: [{ geometry: { type: 'Point', coordinates: [130, 20] }, properties: { eventtype: 'TC', iscurrent: 'true', todate: '2026-11-25T00:00:00', name: 'x', severitydata: { severity: sev, severityunit: unit } } }] });
  assert.equal(parseGdacs(tc('fast'), { now: NOW }).storms.length, 0);
  assert.equal(parseGdacs(tc(150, 'm/s'), { now: NOW }).storms.length, 0);
  assert.equal(parseGdacs(tc(150), { now: NOW }).storms.length, 1);
  assert.deepEqual(sanitizeHazards(null), { storms: [], fires: [] });
  assert.equal(cleanText(42), '');
  assert.equal(cleanText('a'.repeat(100), 10).length, 10);
  assert.equal(parseTime('2026-11-25T00:00:00'), Date.UTC(2026, 10, 25));
  assert.ok(Number.isNaN(parseTime('soon')));
});

console.log(`\n${passed} hazard tests passed`);
