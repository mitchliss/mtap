// The Grand Tour: the once-a-day opening flight. A pure path builder (no DOM,
// no renderer) so it can be tested in Node - globe.js plays it.
//
// Shape of the flight, as one continuous curve:
//   far out (Moon / planets / stars)  ->  a fast dive onto the night side
//   ->  a low sweep toward the sun, so it rises over the limb (sunrise) and the
//       camera crosses the terminator, optionally passing 1-3 live events
//   ->  a pull-up that lands exactly on the normal play view (looking at the
//       centre, world-up), so OrbitControls takes over without a jump.
//
// The ground track (unit directions) and the altitude are splined separately:
// a Cartesian spline between two low points cuts through the planet, this
// never can. Orientation is built from the track (look ahead, pitched so the
// limb sits in the upper third) and slerped into the play view at the end.

import * as THREE from 'three';

const DEG = Math.PI / 180;
const EARTH_KM = 6371;
export const TOUR_CLEAR_KM = 800;     // spoiler buffer around today's places
export const TOUR_END_DISTANCE = 2.9; // the normal play view
const START_R = 12;                   // beyond the Moon (scene Moon orbits at 7)
const SWEEP_ALT = 0.3;                // ~1900 km: low enough to see the limb curve
const LIMB_ABOVE = 10 * DEG;          // limb sits this far above frame centre
const CHECK_BELOW_R = 2.3;            // spoiler check applies below this radius

// ---------- small geometry helpers (same lat/lng convention as globe.js) ----------

export function dirFromLatLng(lat, lng) {
  const la = lat * DEG, lo = lng * DEG;
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}

export function latLngFromDir(v) {
  const n = v.clone().normalize();
  return { lat: Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) / DEG, lng: Math.atan2(-n.z, n.x) / DEG };
}

export function kmBetween(a, b) {
  return dirFromLatLng(a.lat, a.lng).angleTo(dirFromLatLng(b.lat, b.lng)) * EARTH_KM;
}

const okLL = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90;

function slerpDir(a, b, f) {
  const ang = a.angleTo(b);
  if (ang < 1e-6) return a.clone();
  const s = Math.sin(ang);
  return a.clone().multiplyScalar(Math.sin((1 - f) * ang) / s).add(b.clone().multiplyScalar(Math.sin(f * ang) / s)).normalize();
}

// Point `ang` radians from `a` along the great circle that heads toward `b`
// (negative = away from b). Falls back to any perpendicular when b is (anti)parallel.
function along(a, b, ang) {
  let t = b.clone().sub(a.clone().multiplyScalar(a.dot(b)));
  if (t.lengthSq() < 1e-10) t = new THREE.Vector3(0, 1, 0).cross(a);
  if (t.lengthSq() < 1e-10) t = new THREE.Vector3(1, 0, 0).cross(a);
  t.normalize();
  return a.clone().multiplyScalar(Math.cos(ang)).add(t.multiplyScalar(Math.sin(ang))).normalize();
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Local north / east tangents at R (east is undefined at the poles - nudge).
function northEast(R) {
  const N = new THREE.Vector3(0, 1, 0).addScaledVector(R, -R.y);
  if (N.lengthSq() < 1e-8) N.set(1, 0, 0).addScaledVector(R, -R.x);
  N.normalize();
  return { N, E: N.clone().cross(R).normalize() };
}
// Compass heading (radians, 0 = north, +90 = east) of the great circle from R toward B.
function headingOf(R, B) {
  const { N, E } = northEast(R);
  const T = B.clone().addScaledVector(R, -R.dot(B));
  return Math.atan2(T.dot(E), T.dot(N));
}
// Point `ang` radians from R on compass heading h (negative = behind).
function onHeading(R, h, ang) {
  const { N, E } = northEast(R);
  const T = N.multiplyScalar(Math.cos(h)).addScaledVector(E, Math.sin(h));
  return R.clone().multiplyScalar(Math.cos(ang)).addScaledVector(T, Math.sin(ang)).normalize();
}

/** Live stops that are safe to show: valid, and nowhere near today's answers. */
export function filterTourStops(stops, avoid = [], km = TOUR_CLEAR_KM) {
  const av = (avoid || []).filter(okLL);
  return (Array.isArray(stops) ? stops : [])
    .filter((s) => okLL(s) && !av.some((a) => kmBetween(s, a) < km));
}

// ---------- splines ----------

// Fritsch-Carlson monotone cubic: no overshoot between keys, so an altitude
// that is positive at every key stays positive in between.
function monotone(ts, ys, endSlopeZero = true) {
  const n = ts.length;
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (ts[i + 1] - ts[i]));
  m[0] = d[0];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  if (endSlopeZero) m[n - 1] = 0; else m[n - 1] = d[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (t) => {
    if (t <= ts[0]) return ys[0];
    if (t >= ts[n - 1]) return ys[n - 1];
    let i = 0; while (t > ts[i + 1]) i++;
    const h = ts[i + 1] - ts[i], u = (t - ts[i]) / h;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i]
      + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1];
  };
}

// Time-parametrised Catmull-Rom (cardinal Hermite) over unit vectors,
// renormalised. Long legs are subdivided along the great circle first so the
// chord never sags toward the centre. The last key gets a zero tangent: the
// flight lands, it doesn't stop dead.
function track(keys) {
  const k = [keys[0]];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    const parts = Math.ceil(a.dir.angleTo(b.dir) / (30 * DEG));
    for (let j = 1; j < parts; j++) k.push({ t: a.t + (b.t - a.t) * j / parts, dir: slerpDir(a.dir, b.dir, j / parts) });
    k.push(b);
  }
  const n = k.length;
  const tan = k.map((_, i) => {
    if (i === n - 1) return new THREE.Vector3();
    const p = k[Math.max(0, i - 1)], q = k[Math.min(n - 1, i + 1)];
    return q.dir.clone().sub(p.dir).divideScalar(q.t - p.t);
  });
  return (t) => {
    if (t <= k[0].t) return k[0].dir.clone();
    if (t >= k[n - 1].t) return k[n - 1].dir.clone();
    let i = 0; while (t > k[i + 1].t) i++;
    const h = k[i + 1].t - k[i].t, u = (t - k[i].t) / h;
    const u2 = u * u, u3 = u2 * u;
    return k[i].dir.clone().multiplyScalar(2 * u3 - 3 * u2 + 1)
      .addScaledVector(tan[i], (u3 - 2 * u2 + u) * h)
      .addScaledVector(k[i + 1].dir, -2 * u3 + 3 * u2)
      .addScaledVector(tan[i + 1], (u3 - u2) * h)
      .normalize();
  };
}

const smoother = (x) => { const u = THREE.MathUtils.clamp(x, 0, 1); return u * u * u * (u * (u * 6 - 15) + 10); };
const ramp = (t, a, b) => smoother((t - a) / (b - a));

// ---------- route choice ----------

function clearOf(dirs, avoidDirs, km) {
  const lim = km / EARTH_KM;
  return dirs.every((d) => avoidDirs.every((a) => d.angleTo(a) >= lim));
}

// A sweep through 1-3 live stops: legs 12-80 degrees apart, at most ~150 total.
function stopSequences(stops) {
  const pool = stops.slice(0, 8).map((s) => ({ ...s, dir: dirFromLatLng(s.lat, s.lng) }));
  const seqs = [];
  const okLeg = (a, b) => { const g = a.dir.angleTo(b.dir); return g >= 12 * DEG && g <= 80 * DEG; };
  for (let i = 0; i < pool.length; i++) {
    seqs.push([pool[i]]);
    for (let j = 0; j < pool.length; j++) {
      if (j === i || !okLeg(pool[i], pool[j])) continue;
      seqs.push([pool[i], pool[j]]);
      for (let k = 0; k < pool.length; k++) {
        if (k === i || k === j || !okLeg(pool[j], pool[k])) continue;
        const total = pool[i].dir.angleTo(pool[j].dir) + pool[j].dir.angleTo(pool[k].dir);
        // A gentle bend at the middle stop, never a zigzag (the camera banks
        // through it; a hairpin would whip the picture round).
        const bend = Math.abs(wrap(headingOf(pool[j].dir, pool[k].dir) - (headingOf(pool[j].dir, pool[i].dir) + Math.PI)));
        if (total <= 150 * DEG && bend <= 40 * DEG) seqs.push([pool[i], pool[j], pool[k]]);
      }
    }
  }
  const score = (s) => s.length * 10 + new Set(s.map((x) => x.kind)).size * 3;
  return seqs.sort((a, b) => score(b) - score(a));
}

/**
 * Build the Grand Tour.
 * @param {object} o
 * @param {{lat,lng}} o.sun          subsolar point (drives the sunrise)
 * @param {number[]|THREE.Vector3} [o.moon]  Moon position in scene units (framed at the start)
 * @param {Array<{lat,lng,kind,label}>} [o.stops]  live events to pass (optional)
 * @param {Array<{lat,lng}>} [o.avoid]  today's places - never routed over or captioned
 * @param {number} [o.seed]  varies the scenic route day to day
 * @param {number} [o.endDistance]
 * @returns {{duration, sample(t), groundAt(t), stops, sunriseAt, titleAt, uiAt, endPose}}
 */
export function buildTourPath(o = {}) {
  const endDistance = o.endDistance ?? TOUR_END_DISTANCE;
  const sunLL = okLL(o.sun) ? o.sun : { lat: 0, lng: 0 };
  const S = dirFromLatLng(sunLL.lat, sunLL.lng);
  const avoidDirs = (o.avoid || []).filter(okLL).map((a) => dirFromLatLng(a.lat, a.lng));
  const stops = filterTourStops(o.stops, o.avoid);
  const seed = Number.isFinite(o.seed) ? o.seed : 0;

  // Sweep waypoints: [{dir, stop?}] from the entry (night side) to the exit.
  const candidates = [];
  for (const seq of stopSequences(stops)) {
    // Orient so the flight ends nearer the sun (sunrise when it straddles the terminator).
    // The reverse direction is kept as a second choice (see the heading rule below).
    const fwd = seq[0].dir.dot(S) > seq[seq.length - 1].dir.dot(S) ? seq.slice().reverse() : seq;
    if (seq.length === 1) {
      // One stop: fly through it on a heading as close to the sun's as the
      // north-landing rule allows (headings tried nearest-first).
      const R = seq[0].dir;
      const toSun = headingOf(R, S);
      const hs = [];
      for (let h = -100; h <= 100; h += 20) hs.push(h * DEG);
      hs.sort((a, b) => Math.abs(wrap(a - toSun)) - Math.abs(wrap(b - toSun)));
      for (const h of hs) {
        candidates.push({ pts: [{ dir: onHeading(R, h, -40 * DEG) }, { dir: R, stop: seq[0] }], exit: onHeading(R, h, 35 * DEG) });
      }
      continue;
    }
    for (const s of [fwd, fwd.slice().reverse()]) {
      const first = s[0].dir, last = s[s.length - 1].dir;
      const entry = along(first, s[1].dir, -35 * DEG);
      const exit = along(last, s[s.length - 2].dir, -30 * DEG);
      candidates.push({ pts: [{ dir: entry }, ...s.map((x) => ({ dir: x.dir, stop: x }))], exit });
    }
  }
  // Generic scenic sweeps: a great circle through a terminator point, flown
  // toward the sun - night side, sunrise over the limb, into the day. No
  // landmarks; the azimuth rotates with the day.
  const e1 = along(S, new THREE.Vector3(0, 1, 0), 90 * DEG); // a terminator point
  const e2 = S.clone().cross(e1).normalize();
  for (let i = 0; i < 24; i++) {
    const beta = ((seed * 47 + i * 15) % 360) * DEG;
    const X = e1.clone().multiplyScalar(Math.cos(beta)).addScaledVector(e2, Math.sin(beta)).normalize();
    const at = (phi) => X.clone().multiplyScalar(Math.cos(phi)).addScaledVector(S, Math.sin(phi)).normalize();
    candidates.push({ pts: [-55, -25, 5, 25].map((p) => ({ dir: at(p * DEG) })), exit: at(42 * DEG), generic: true });
  }

  // Pick the best candidate that keeps the spoiler rule. Preference tiers:
  // more live stops, then any stops over scenery; landing heading roughly north (the play view is
  // north-up, so otherwise the landing ends in a long twirl); for scenery, a
  // start beyond the Moon (it fills the first shot).
  let plan = null, bestTier = Infinity;
  for (const c of candidates) {
    const p = assemble(c, { S, endDistance, moon: o.moon });
    const grade = landingGrade(p), north = grade === 0;
    const nStops = c.pts.filter((x) => x.stop).length;
    const tier = (grade === 2 ? 20 : 0)
      + (c.generic ? (north && (!o.moon || p.fromMoon) ? 6 : north ? 7 : 8) : (3 - nStops) * 2 + (north ? 0 : 1));
    if (tier >= bestTier) continue;
    // Spoiler rule: nothing low on the track within the buffer of today's places.
    const low = [];
    for (let t = 0; t <= p.duration; t += 0.025) if (p.radius(t) < CHECK_BELOW_R) low.push(p.dir(t));
    if (!clearOf(low, avoidDirs, TOUR_CLEAR_KM + 50)) continue; // + margin between samples
    plan = p; bestTier = tier;
    if (tier === 0) break;
  }
  // Every candidate crossed a daily place (vanishingly unlikely): fly the
  // scenic shape but stay high - nothing on the ground is legible from there.
  if (!plan) plan = assemble(candidates[candidates.length - 1], { S, endDistance, moon: o.moon, high: true });
  return finish(plan, { S, endDistance });
}

// How the landing goes: 0 = heading roughly north (the play view is
// north-up, so it settles without rolling), 1 = needs a twirl, 2 = the landing
// skirts a pole, where the heading swings so fast the twirl would whip.
function landingGrade(p) {
  const Y = new THREE.Vector3(0, 1, 0);
  let grade = 0;
  for (let t = p.T_EXIT - 0.2; t <= p.duration; t += 0.1) {
    const R = p.dir(t);
    if (Math.abs(R.y) > Math.sin(62 * DEG)) return 2;
    const F = p.dir(Math.min(p.duration, t + 0.3)).sub(p.dir(Math.max(0, t - 0.3)));
    F.addScaledVector(R, -R.dot(F));
    const N = Y.clone().addScaledVector(R, -R.y);
    if (F.lengthSq() < 1e-12) return 2;
    if (F.normalize().dot(N.normalize()) < Math.cos(125 * DEG)) grade = 1;
  }
  return grade;
}

// Turn a sweep (waypoints + exit) into timed track/altitude splines.
function assemble(c, { S, endDistance, moon, high = false }) {
  const pts = c.pts;
  const T_ENTRY = 3.1;
  let sweepAng = 0;
  for (let i = 1; i < pts.length; i++) sweepAng += pts[i - 1].dir.angleTo(pts[i].dir);
  sweepAng += pts[pts.length - 1].dir.angleTo(c.exit);
  const sweepDur = THREE.MathUtils.clamp(sweepAng / (24 * DEG), 3.4, 4.6);
  const T_EXIT = T_ENTRY + sweepDur;
  const D = T_EXIT + 2.5;

  // Approach: come in along the flight line, from beyond the Moon when it is
  // roughly that way (start 9 degrees off it so it slides past, never through).
  const entry = pts[0].dir;
  const headIn = pts.length > 1 ? pts[1].dir : c.exit;
  let p0 = along(entry, headIn, -45 * DEG), fromMoon = false;
  const moonV = moon ? new THREE.Vector3().fromArray(Array.isArray(moon) ? moon : [moon.x, moon.y, moon.z]) : null;
  if (moonV && moonV.lengthSq() > 0) {
    const md = moonV.clone().normalize();
    const viaMoon = along(md, entry, 9 * DEG);
    // Only when coming from the Moon lines up with the sweep (no hairpin at the entry).
    const inHead = entry.clone().sub(viaMoon).addScaledVector(entry, -entry.dot(entry.clone().sub(viaMoon))).normalize();
    const outHead = headIn.clone().addScaledVector(entry, -entry.dot(headIn)).normalize();
    if (md.angleTo(entry) < 95 * DEG && md.angleTo(entry) > 20 * DEG && inHead.dot(outHead) > Math.cos(45 * DEG)) { p0 = viaMoon; fromMoon = true; }
  }

  // Final view: carry on past the exit, bending (never more than 80 degrees,
  // so the track never doubles back) to land at a gentle tilt (lat -12..28),
  // preferring a landing that heads north (the play view is north-up).
  const hExit = headingOf(c.exit, along(c.exit, pts[pts.length - 1].dir, -10 * DEG));
  let finalDir = null, bestCost = Infinity;
  for (const dist of [24, 32, 42, 52]) {
    for (let dh = -80; dh <= 80; dh += 10) {
      const h = hExit + dh * DEG;
      const cand = onHeading(c.exit, h, dist * DEG);
      const lat = latLngFromDir(cand).lat;
      const miss = Math.max(0, lat - 28, -12 - lat);
      const cost = miss * 10 + Math.abs(dh) + 0.4 * Math.abs(wrap(h)) / DEG + (dist - 24) * 0.8;
      if (cost < bestCost) { bestCost = cost; finalDir = cand; }
    }
  }

  const keys = [{ t: 0, dir: p0 }, { t: 1.7, dir: slerpDir(p0, entry, 0.62) }];
  let acc = 0;
  pts.forEach((p, i) => {
    if (i) acc += pts[i - 1].dir.angleTo(p.dir);
    p.t = T_ENTRY + sweepDur * (acc / sweepAng);
    keys.push({ t: p.t, dir: p.dir });
  });
  keys.push({ t: T_EXIT, dir: c.exit }, { t: D, dir: finalDir });
  const dir = track(keys);

  const sweep = high ? 1.6 : SWEEP_ALT;
  const altKeys = [
    [0, START_R - 1], [1.5, 3.0], [2.55, Math.max(sweep, 0.62)], [T_ENTRY, sweep],
    [T_ENTRY + sweepDur * 0.5, sweep * 0.88], [T_EXIT, sweep],
    [T_EXIT + 1.1, Math.max(sweep, 0.95)], [D, endDistance - 1],
  ];
  const logAlt = monotone(altKeys.map((k) => k[0]), altKeys.map((k) => Math.log(k[1])));
  const radius = (t) => 1 + Math.exp(logAlt(t));
  return { duration: D, dir, radius, finalDir, T_ENTRY, T_EXIT, stops: pts.filter((p) => p.stop), generic: !!c.generic, fromMoon };
}

function finish(p, { S, endDistance }) {
  const D = p.duration;
  const clampT = (t) => THREE.MathUtils.clamp(t, 0, D);
  const Y = new THREE.Vector3(0, 1, 0);
  const ORIGIN = new THREE.Vector3();
  const m = new THREE.Matrix4();

  // Direction of travel over the ground (windowed, so it stays defined while
  // the flight lands and is continuous everywhere).
  const forward = (t, h = 0.4) => {
    const R = p.dir(t);
    const d = p.dir(clampT(t + h)).sub(p.dir(clampT(t - h)));
    d.addScaledVector(R, -R.dot(d));
    if (d.lengthSq() < 1e-14) return along(R, Y, 90 * DEG).sub(R).normalize(); // never in practice
    return d.normalize();
  };
  const lookW = (t) => ramp(t, 1.6, p.T_ENTRY + 0.4) * (1 - ramp(t, p.T_EXIT - 0.1, D - 0.5)); // 0 = centre, 1 = horizon
  const settle = (t) => ramp(t, p.T_EXIT + 0.3, D);                                          // blend into play pose

  // Signed angle about R that turns the travel direction F into local north.
  const Z = new THREE.Vector3(0, 0, 1);
  const rollRaw = (t) => {
    const R = p.dir(t), F = forward(t);
    const N = Y.clone().addScaledVector(R, -R.y);
    if (N.lengthSq() < 1e-10) return null;
    N.normalize();
    return Math.atan2(F.clone().cross(N).dot(R), F.dot(N));
  };
  const T0 = p.T_EXIT + 0.3, STEP = 1 / 240;
  const rollTable = [];
  let prevRoll = null;
  for (let t = T0; t <= D + STEP; t += STEP) {
    let r = rollRaw(Math.min(t, D));
    if (r === null) r = prevRoll ?? 0;
    if (prevRoll !== null) r = prevRoll + Math.atan2(Math.sin(r - prevRoll), Math.cos(r - prevRoll));
    rollTable.push(r); prevRoll = r;
  }
  const rollAt = (t) => {
    const x = Math.max(0, (t - T0) / STEP), i = Math.min(rollTable.length - 2, Math.floor(x)), f = Math.min(1, x - i);
    return rollTable[i] + (rollTable[i + 1] - rollTable[i]) * f;
  };

  const endPos = p.finalDir.clone().multiplyScalar(endDistance);
  const endQuat = new THREE.Quaternion().setFromRotationMatrix(m.lookAt(endPos, ORIGIN, Y));

  const sample = (tIn) => {
    const t = clampT(tIn);
    const R = p.dir(t);
    const r = p.radius(t);
    const pos = R.clone().multiplyScalar(r);
    const F = forward(t);
    const w = lookW(t);
    const pitch = THREE.MathUtils.lerp(90 * DEG, Math.acos(1 / Math.max(r, 1.0001)) + LIMB_ABOVE, w);
    const view = F.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(R, -Math.sin(pitch));
    const up = R.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(F, Math.sin(pitch));
    // Bank into turns (only while skimming the surface).
    const F1 = forward(clampT(t - 0.4)), F2 = forward(clampT(t + 0.4));
    const turn = Math.asin(THREE.MathUtils.clamp(F1.clone().cross(F2).dot(R), -1, 1)) / 0.8;
    const bank = THREE.MathUtils.clamp(-0.5 * turn, -0.3, 0.3) * w;
    if (bank) up.applyAxisAngle(view, bank);
    const q = new THREE.Quaternion().setFromRotationMatrix(m.lookAt(ORIGIN, view, up));
    // Landing: roll about the view axis into north-up (exact at the end, where
    // the view is already the centre). An unwrapped table keeps the roll
    // continuous even when the landing heads south (a half-turn twirl).
    const e = settle(t);
    if (e > 0) q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, rollAt(t) * e));
    if (t >= D) { pos.copy(endPos); q.copy(endQuat); }
    return { pos, quat: q };
  };

  // Sunrise: first moment in the sweep the sun (lit at 5 scene units) clears the limb.
  const sunPt = S.clone().multiplyScalar(5);
  const sunVisible = (pos) => {
    const dir = sunPt.clone().sub(pos); const len = dir.length(); dir.divideScalar(len);
    const b = pos.dot(dir), c = pos.lengthSq() - 1, disc = b * b - c;
    if (disc < 0) return true;
    const hit = -b - Math.sqrt(disc);
    return !(hit > 0 && hit < len);
  };
  let sunriseAt = null, hiddenSeen = false;
  for (let t = p.T_ENTRY - 0.6; t <= p.T_EXIT; t += 0.02) {
    const vis = sunVisible(p.dir(t).multiplyScalar(p.radius(t)));
    if (!vis) hiddenSeen = true;
    else if (hiddenSeen) { sunriseAt = t; break; }
  }

  return {
    duration: D,
    sample,
    groundAt: (t) => latLngFromDir(p.dir(clampT(t))),
    radiusAt: (t) => p.radius(clampT(t)),
    stops: p.stops.map((s) => ({ lat: s.stop.lat, lng: s.stop.lng, kind: s.stop.kind, label: s.stop.label, at: s.t })),
    generic: p.generic,
    fromMoon: p.fromMoon,
    sunriseAt,
    titleAt: D - 2.7,   // wordmark fades in during the pull-up
    uiAt: D - 0.7,      // the menu comes back while the camera settles
    endPose: { pos: endPos.clone(), quat: endQuat.clone() },
  };
}
