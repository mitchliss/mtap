// Earthquake rounds (v5.3): a news entry carrying the USGS numbers.
import assert from 'node:assert/strict';
import { quakeErrors, puzzleStartUtcMs } from '../scripts/validate-news.mjs';
import { describeQuakeRound, quakeRingSize, usgsEventUrl } from '../src/discovery.js';
import { injectNewsIntoDeal, dailyPicksFor } from '../src/game.js';
import { NEWS } from '../src/news.js';
import { PAST_QUAKES, quakeFor } from '../src/quakes.js';

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); passed++; }
  catch (error) { console.error(`FAIL ${name}\n${error.stack || error}`); process.exitCode = 1; }
}

const PN = 140;
const day = puzzleStartUtcMs(PN);
const quake = { mag: 6.6, depthKm: 10, time: new Date(day - 30 * 3600000).toISOString(), usgs: 'us7000qx12' };
const entry = { pn: PN, slot: 2, name: 'Test Quake', prompt: 'Strong quake', lat: -21.3, lng: 168.6, country: null, offshore: true, continent: 'Oceania', diff: 2, fact: 'x', quake };

test('puzzle day arithmetic matches the game (puzzle #1 = 2026-07-22)', () => {
  assert.equal(new Date(puzzleStartUtcMs(1)).toISOString(), '2026-07-22T00:00:00.000Z');
  assert.equal(new Date(puzzleStartUtcMs(127)).toISOString().slice(0, 10), '2026-11-25');
});

test('quake field: USGS numbers accepted; bad ones refused with a reason', () => {
  assert.deepEqual(quakeErrors(entry), []);
  const bad = (q) => quakeErrors({ ...entry, quake: { ...quake, ...q } });
  assert.match(bad({ mag: 3.2 }).join(), /mag/);
  assert.match(bad({ mag: 10.5 }).join(), /mag/);
  assert.match(bad({ depthKm: 900 }).join(), /depthKm/);
  assert.match(bad({ usgs: 'https://earthquake.usgs.gov/x' }).join(), /usgs/);
  assert.match(bad({ time: '2026-11-24 08:00' }).join(), /ISO UTC/);
  assert.match(bad({ time: new Date(day - 12 * 86400000).toISOString() }).join(), /week before/, 'old quake is history, not news');
  assert.match(bad({ time: new Date(day + 3 * 86400000).toISOString() }).join(), /week before/, 'cannot be after the round');
  assert.match(quakeErrors({ ...entry, quake: 'M6.6' }).join(), /object/);
});

test('answer-card line: magnitude, honest depth words, the player\'s clock', () => {
  const shallow = describeQuakeRound({ ...quake, time: '2026-11-24T08:15:00Z' }, 'en-US');
  assert.match(shallow, /^Magnitude 6\.6 earthquake, 10 km deep, shallow, so it was felt strongly\. It struck Nov 2[34], \d{1,2}:15 [AP]M your time\.$/);
  assert.match(describeQuakeRound({ ...quake, depthKm: 150 }, 'en-US'), /150 km deep\. It struck/);
  assert.match(describeQuakeRound({ ...quake, depthKm: 580 }, 'en-US'), /very deep, so it was felt gently over a wide area/);
  assert.equal(usgsEventUrl(quake), 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000qx12');
});

test('ring size grows with magnitude and stays on the map', () => {
  assert.ok(quakeRingSize(5) < quakeRingSize(6) && quakeRingSize(6) < quakeRingSize(7));
  assert.equal(quakeRingSize(4), 0.03);
  assert.equal(quakeRingSize(9.5), 0.16);
});

test('the quake numbers ride into the deal with the news entry', () => {
  const { picks, slot } = injectNewsIntoDeal(dailyPicksFor(120), entry);
  assert.notEqual(slot, null);
  assert.deepEqual(picks[slot].quake, quake);
  assert.equal(picks[slot].isNews, true);
});

test('replays of past earthquake days play as earthquake rounds (overlay, NEWS untouched)', () => {
  for (const [name, { pn, quake: q }] of Object.entries(PAST_QUAKES)) {
    const entry = NEWS.find((n) => n.name === name);
    assert.ok(entry, `${name} is a real news entry`);
    assert.equal(entry.pn, pn, name);
    assert.equal(entry.quake, undefined, 'the append-only entry itself is not edited');
    assert.deepEqual(quakeErrors({ ...entry, quake: q }), [], name);
    const dealt = dailyPicksFor(pn).find((l) => l.name === name);
    assert.ok(dealt, `#${pn}'s replay deals ${name}`);
    assert.deepEqual(quakeFor(dealt), q, 'the replayed round carries the USGS numbers');
  }
  assert.equal(quakeFor({ name: 'Sola, Vanuatu', isNews: false }), null, 'only a news round of that name');
  assert.equal(quakeFor(null), null);
  assert.deepEqual(quakeFor({ quake }), quake, 'a v5.3+ entry uses its own field');
});

console.log(`\n${passed} quake tests passed`);
