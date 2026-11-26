// Nature rounds (v5.6): the outline of a mountain range, desert, sea or strait, and
// how far a pin is from it. Pure (no three.js) so Node tests and the scorer share it.
//
// A shape file (public/data/features/<id>.json) is { id, rings: [[[lng, lat], ...]] }:
// outer rings only, each ring's longitudes made continuous (a ring over the date line
// may run past 180). Distance is measured on the sphere to the nearest edge; a pin
// inside any ring is 0 km away.

const R_KM = 6371;
const D2R = Math.PI / 180;

const shapes = new Map();   // id -> prepared shape
const pending = new Map();  // id -> Promise

function unit(lat, lng) {
  const la = lat * D2R, lo = lng * D2R;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l ? [a[0] / l, a[1] / l, a[2] / l] : null; };
const angle = (a, b) => Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));

export function prepareShape(data) {
  if (!data || !Array.isArray(data.rings)) return null;
  const rings = [];
  for (const ring of data.rings) {
    if (!Array.isArray(ring) || ring.length < 3) continue;
    const pts = ring.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[1]) <= 90);
    if (pts.length < 3) continue;
    let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
    for (const [x, y] of pts) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
    rings.push({ pts, vec: pts.map(([x, y]) => unit(y, x)), w, e, s, n });
  }
  return rings.length ? { id: data.id, rings } : null;
}

// Ray casting in (lng, lat), with the pin's longitude moved by ±360 to sit over the
// ring when the ring runs past the date line.
function inRing(lat, lng, r) {
  let x = lng;
  const mid = (r.w + r.e) / 2;
  while (x - mid > 180) x -= 360;
  while (mid - x > 180) x += 360;
  if (x < r.w || x > r.e || lat < r.s || lat > r.n) return false;
  let inside = false;
  const p = r.pts;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > lat) !== (yj > lat) && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function insideShape(shape, lat, lng) {
  return !!shape && shape.rings.some((r) => inRing(lat, lng, r));
}

// Great-circle distance (radians) from P to the arc A-B, and the nearest point.
function arcNearest(P, A, B) {
  const n = norm(cross(A, B));
  if (n) {
    const d = dot(n, P);
    const C = norm([P[0] - n[0] * d, P[1] - n[1] * d, P[2] - n[2] * d]);
    if (C && dot(cross(A, C), n) >= 0 && dot(cross(C, B), n) >= 0) return { a: angle(P, C), v: C };
  }
  const aa = angle(P, A), ab = angle(P, B);
  return aa <= ab ? { a: aa, v: A } : { a: ab, v: B };
}

// { km, lat, lng }: distance from the pin to the shape (0 inside) and the nearest
// point on the outline (the pin itself when inside).
export function nearestOnShape(shape, lat, lng) {
  if (!shape) return null;
  if (insideShape(shape, lat, lng)) return { km: 0, lat, lng, inside: true };
  const P = unit(lat, lng);
  let best = { a: Infinity, v: null };
  for (const r of shape.rings) {
    const v = r.vec;
    for (let i = 0; i < v.length; i++) {
      const hit = arcNearest(P, v[i], v[(i + 1) % v.length]);
      if (hit.a < best.a) best = hit;
    }
  }
  const [x, y, z] = best.v;
  return { km: best.a * R_KM, lat: Math.asin(Math.max(-1, Math.min(1, z))) / D2R, lng: Math.atan2(y, x) / D2R, inside: false };
}

export const shapeFor = (id) => shapes.get(id) || null;
export function registerShape(data) {
  const s = prepareShape(data);
  if (s && data.id) shapes.set(data.id, s);
  return s;
}

// Fetch a feature's outline once (the game prefetches every nature round's shape when
// a game starts). Resolves to the shape or null; never throws.
export function loadFeatureShape(id, fetchFn = (u) => fetch(u)) {
  if (shapes.has(id)) return Promise.resolve(shapes.get(id));
  if (pending.has(id)) return pending.get(id);
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './';
  const p = (async () => {
    try {
      const res = await fetchFn(`${base}data/features/${id}.json`);
      if (!res.ok) return null;
      return registerShape(await res.json());
    } catch { return null; } finally { pending.delete(id); }
  })();
  pending.set(id, p);
  return p;
}

// Distance used for scoring a nature round. With the outline loaded it is exact; if
// the file could not be fetched (offline), it falls back to the distance from the
// label point less the feature's equivalent radius - never a free 100.
export function featureDistanceKm(target, lat, lng, haversineKm) {
  const shape = shapeFor(target.id);
  if (shape) return nearestOnShape(shape, lat, lng).km;
  return Math.max(0, haversineKm(lat, lng, target.lat, target.lng) - (target.rKm || 0));
}
