import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildTourPath, filterTourStops, kmBetween, dirFromLatLng, TOUR_END_DISTANCE } from '../src/tour.js';

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); passed++; }
  catch (error) { console.error(`FAIL ${name}\n${error.stack || error}`); process.exitCode = 1; }
}

const FPS = 60;
const playQuat = (pos) => new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().lookAt(pos, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)));

// Walk the whole flight at 60 fps and check the movie-camera invariants.
function checkFlight(path, label) {
  const D = path.duration;
  assert.ok(D >= 8 && D <= 11, `${label}: duration ${D.toFixed(2)} s`);
  const first = path.sample(0);
  assert.ok(first.pos.length() > 8, `${label}: starts far out (${first.pos.length().toFixed(2)})`);
  let prev = first, prevStep = null, minR = Infinity;
  for (let i = 1; i <= Math.ceil(D * FPS); i++) {
    const t = Math.min(D, i / FPS);
    const s = path.sample(t);
    for (const v of [s.pos.x, s.pos.y, s.pos.z, s.quat.x, s.quat.w]) assert.ok(Number.isFinite(v), `${label}: finite at ${t}`);
    const r = s.pos.length();
    minR = Math.min(minR, r);
    assert.ok(r > 1.02, `${label}: above the surface at t=${t.toFixed(2)} (r=${r.toFixed(4)})`);
    const step = s.pos.distanceTo(prev.pos);
    assert.ok(step < 0.25, `${label}: no position jump at t=${t.toFixed(2)} (${step.toFixed(3)})`);
    // Speed may change, but never abruptly (no stops / jerks between frames).
    if (prevStep !== null) assert.ok(Math.abs(step - prevStep) < 0.02, `${label}: smooth speed at t=${t.toFixed(2)} (${prevStep.toFixed(4)} -> ${step.toFixed(4)})`);
    const turn = s.quat.angleTo(prev.quat) / Math.PI * 180;
    assert.ok(turn < 3, `${label}: no orientation snap at t=${t.toFixed(2)} (${turn.toFixed(2)} deg/frame)`);
    prev = s; prevStep = step;
  }
  assert.ok(minR < 1.45, `${label}: the sweep actually skims the planet (min r ${minR.toFixed(3)})`);
  const end = path.sample(D);
  assert.ok(Math.abs(end.pos.length() - TOUR_END_DISTANCE) < 1e-9, `${label}: lands at play distance`);
  assert.ok(end.quat.angleTo(playQuat(end.pos)) < 1e-6, `${label}: lands looking at the centre, world-up (OrbitControls pose)`);
  const lat = Math.asin(end.pos.y / end.pos.length()) * 180 / Math.PI;
  assert.ok(lat > -35 && lat < 40, `${label}: gentle final tilt (lat ${lat.toFixed(1)})`);
  // Landing is soft: the last frames barely move.
  assert.ok(path.sample(D - 1 / FPS).pos.distanceTo(end.pos) < 0.003, `${label}: soft landing`);
}

// Low part of the ground track, in km from a place.
function lowClearance(path, place) {
  let min = Infinity;
  for (let t = 0; t <= path.duration; t += 0.02) {
    if (path.radiusAt(t) < 2.3) min = Math.min(min, kmBetween(path.groundAt(t), place));
  }
  return min;
}

const suns = [{ lat: -20.6, lng: 40 }, { lat: 23.4, lng: -120 }, { lat: 0, lng: 179 }, { lat: -23.4, lng: -60 }, { lat: 10, lng: 0 }];
const moon = [7 * Math.cos(1), 7 * Math.sin(1) * Math.sin(0.18), 7 * Math.sin(1) * Math.cos(0.18)];

test('scenic tour (no live stops): far start, low sweep, lands on the play view', () => {
  for (const [i, sun] of suns.entries()) {
    for (const seed of [1, 37, 126, 200]) {
      const path = buildTourPath({ sun, seed, moon });
      assert.equal(path.stops.length, 0);
      assert.ok(path.generic);
      checkFlight(path, `sun#${i} seed ${seed}`);
    }
  }
});

test('scenic tour flies toward the sun: the sun rises over the limb mid-sweep', () => {
  for (const sun of suns) {
    const path = buildTourPath({ sun, seed: 5 });
    assert.ok(path.sunriseAt !== null, 'a sunrise moment exists');
    assert.ok(path.sunriseAt > 2.5 && path.sunriseAt < path.duration - 2, `sunrise at ${path.sunriseAt}`);
  }
});

test('works with no options at all, and with an empty / junk stop list', () => {
  checkFlight(buildTourPath(), 'defaults');
  checkFlight(buildTourPath({ stops: [], avoid: [] }), 'empty');
  const p = buildTourPath({ stops: [null, { lat: 'x' }, { lat: 200, lng: 0 }], avoid: [null] });
  assert.equal(p.stops.length, 0);
  checkFlight(p, 'junk');
});

test('the Moon is framed at the start but never flown through', () => {
  for (const sun of suns) {
    const path = buildTourPath({ sun, moon, seed: 3 });
    const mv = new THREE.Vector3(...moon);
    for (let t = 0; t <= path.duration; t += 1 / FPS) assert.ok(path.sample(t).pos.distanceTo(mv) > 0.5, 'clear of the Moon');
  }
});

const STOPS = [
  { lat: 15, lng: 135, kind: 'storm', label: 'Typhoon Xavier' },
  { lat: -6, lng: 151, kind: 'quake', label: 'M6.1 earthquake, New Britain' },
  { lat: 37, lng: -120, kind: 'fire', label: 'Creek Fire' },
  { lat: 25, lng: -75, kind: 'storm', label: 'Tropical Storm Ana' },
];

test('live stops: route passes 1-3 of them, in time order, with smooth flight', () => {
  for (const [i, sun] of suns.entries()) {
    const path = buildTourPath({ sun, stops: STOPS, seed: 9, moon });
    assert.ok(path.stops.length >= 1 && path.stops.length <= 3, `sun#${i}: ${path.stops.length} stops`);
    assert.ok(!path.generic);
    let last = 0;
    for (const s of path.stops) {
      assert.ok(s.at > last && s.at < path.duration - 2, 'captions land mid-flight, in order');
      last = s.at;
      assert.ok(kmBetween(path.groundAt(s.at), s) < 60, `camera is over ${s.label} at its caption time`);
      assert.ok(path.radiusAt(s.at) < 1.5, 'and low');
    }
    checkFlight(path, `stops sun#${i}`);
  }
});

test('single live stop works', () => {
  const path = buildTourPath({ sun: suns[0], stops: [STOPS[2]] });
  assert.equal(path.stops.length, 1);
  assert.equal(path.stops[0].label, 'Creek Fire');
  checkFlight(path, 'single stop');
});

test('spoiler rule: stops near today\'s places are never captioned', () => {
  const avoid = [{ lat: 15.5, lng: 134 }, { lat: 37.5, lng: -119 }]; // next to the typhoon + the fire
  assert.deepEqual(filterTourStops(STOPS, avoid).map((s) => s.label), ['M6.1 earthquake, New Britain', 'Tropical Storm Ana']);
  const path = buildTourPath({ sun: suns[1], stops: STOPS, avoid, seed: 4 });
  for (const s of path.stops) for (const a of avoid) assert.ok(kmBetween(s, a) >= 800);
  checkFlight(path, 'filtered stops');
});

test('spoiler rule: the low track stays 800+ km from every daily place', () => {
  // Real-looking daily picks spread around the world, plus places dropped
  // right onto where the scenic route would otherwise go.
  const daily = [
    { lat: 48.86, lng: 2.29 }, { lat: -33.86, lng: 151.21 }, { lat: 40.69, lng: -74.04 },
    { lat: 27.17, lng: 78.04 }, { lat: -13.16, lng: -72.55 },
  ];
  for (const sun of suns) {
    for (const seed of [0, 11, 77]) {
      const free = buildTourPath({ sun, seed });
      // Put a daily place exactly under the free route's sweep midpoint.
      const mid = free.groundAt((free.duration) / 2);
      const avoid = [...daily, mid, free.groundAt(3.4)];
      const path = buildTourPath({ sun, seed, avoid, stops: STOPS });
      for (const a of avoid) assert.ok(lowClearance(path, a) >= 800, `clear of ${JSON.stringify(a)} (${lowClearance(path, a).toFixed(0)} km)`);
      checkFlight(path, 'avoid');
    }
  }
});

test('robust across 300 random days (sun, Moon, live stops, daily places)', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 300; k++) {
    const lon = rnd() * Math.PI * 2;
    const moonK = [7 * Math.cos(lon), 7 * Math.sin(lon) * Math.sin(0.18), 7 * Math.sin(lon) * Math.cos(0.18)];
    const stops = Array.from({ length: Math.floor(rnd() * 5) }, () => ({ lat: rnd() * 120 - 60, lng: rnd() * 360 - 180, kind: 'quake', label: 'x' }));
    const avoid = Array.from({ length: 5 }, () => ({ lat: rnd() * 140 - 70, lng: rnd() * 360 - 180 }));
    const path = buildTourPath({ sun: { lat: rnd() * 47 - 23.5, lng: rnd() * 360 - 180 }, moon: moonK, seed: k, stops, avoid });
    checkFlight(path, `random #${k}`);
    for (const a of avoid) assert.ok(lowClearance(path, a) >= 800, `random #${k}: spoiler buffer`);
    for (const s of path.stops) for (const a of avoid) assert.ok(kmBetween(s, a) >= 800);
  }
});

test('lat/lng helper matches globe.js convention', () => {
  const v = dirFromLatLng(0, 90);
  assert.ok(Math.abs(v.z + 1) < 1e-12 && Math.abs(v.x) < 1e-12);
});

console.log(`\n${passed} tour tests passed`);
