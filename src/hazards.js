// Live hazards and news pins (v5.6): tropical storms with their tracks, wildfires,
// and MTap's own near-live headline pins. Like live.js, nothing here is imported by
// game.js - live data never picks a place or touches a score.
//
// Every feed is keyless and CORS-open, so the static site calls them directly:
//  - NASA EONET (public domain): open severe storms (time-ordered fixes with wind in
//    knots) and US wildfires (area in acres).
//  - GDACS, the EC Joint Research Centre's disaster alert system: wildfires worldwide
//    (burned area in hectares) and tropical cyclones (current point only, wind km/h).
//  - live/headlines.json in MTap's own GitHub repo, written by a scheduled routine.
// All of it is untrusted input: every field is type-checked, range-checked and
// length-capped here, and the UI only ever sets textContent from it.

import { distanceKm, formatDistance } from './geo.js';
import { bearingWord } from './discovery.js';

export const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?category=severeStorms,wildfires&status=open&days=20';
export const GDACS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=WF;TC&alertlevel=Green;Orange;Red';
export const HEADLINES_URL = 'https://raw.githubusercontent.com/mitchliss/mtap/main/live/headlines.json';

export const STORM_RADIUS_KM = 1500;
export const FIRE_RADIUS_KM = 300;
export const NEWS_RADIUS_KM = 600;
const HAZARD_TTL_MS = 30 * 60 * 1000;
const NEWS_TTL_MS = 10 * 60 * 1000;
const HAZARD_KEY = 'marctap.hazards';
const NEWS_KEY = 'marctap.headlines';
const HOUR = 3600000, DAY = 24 * HOUR;
const STORM_MAX_AGE_MS = 4 * DAY;      // an "open" event whose last fix is older is stale
const FIRE_MAX_AGE_MS = 20 * DAY;
const NEWS_MAX_AGE_MS = 72 * HOUR;
const MAX_STORMS = 12, MAX_TRACK = 160, MAX_FIRES = 300, MAX_NEWS = 12;
const KTS_TO_KMH = 1.852, KTS_TO_MPH = 1.15078, ACRE_TO_HA = 0.404686;

export function withTimeout(fetchImpl, url, ms = 8000) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  return Promise.resolve().then(() => fetchImpl(url, ctrl ? { signal: ctrl.signal } : undefined))
    .finally(() => clearTimeout(timer));
}

// ---------- validation helpers ----------

const isLat = (v) => Number.isFinite(v) && v >= -90 && v <= 90;
const isLng = (v) => Number.isFinite(v) && v >= -180 && v <= 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A short plain string: control characters and markup brackets removed, whitespace
// collapsed, cut to `max`. Non-strings become ''.
export function cleanText(v, max = 60) {
  if (typeof v !== 'string') return '';
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// ISO time -> ms. Zone-less stamps (GDACS writes "2026-11-25T00:00:00") are UTC.
export function parseTime(v) {
  if (typeof v !== 'string' || v.length > 40 || !/^\d{4}-\d{2}-\d{2}/.test(v)) return NaN;
  const s = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v) ? `${v}Z` : v;
  return Date.parse(s);
}

// ---------- storms ----------

// Saffir-Simpson from sustained wind in knots: -1 depression, 0 tropical storm, 1-5.
export function stormCategory(kts) {
  if (!(kts >= 34)) return -1;
  if (kts < 64) return 0;
  if (kts < 83) return 1;
  if (kts < 96) return 2;
  if (kts < 113) return 3;
  if (kts < 137) return 4;
  return 5;
}

// The word for a full-strength storm by basin: typhoon in the northwest Pacific,
// hurricane in the North Atlantic and the northeast/central Pacific, cyclone elsewhere
// (Indian Ocean, South Pacific, Australia, the Mediterranean).
export function stormKind(lat, lng) {
  if (lat >= 0 && lng >= 100) return 'typhoon';
  if (lat >= 0 && lng < 0) return 'hurricane';
  return 'cyclone';
}

const KIND_WORD = { typhoon: 'Typhoon', hurricane: 'Hurricane', cyclone: 'Cyclone' };

// "Typhoon Xavier", "Tropical storm Xavier", "Tropical depression" (unnamed).
export function stormLabel(storm) {
  const word = storm.cat >= 1 ? KIND_WORD[storm.kind] || 'Cyclone' : storm.cat === 0 ? 'Tropical storm' : 'Tropical depression';
  return storm.name ? `${word} ${storm.name}` : word;
}

// "Tropical Cyclone Xavier" -> "Xavier"; codes ("03-20262027-27") -> '' (unnamed);
// a designator like "27W" survives.
export function stormName(title) {
  const t = cleanText(title, 80)
    .replace(/^(super\s+|severe\s+|very\s+severe\s+|intense\s+)*(post-?|sub)?(tropical\s+)?(cyclonic\s+)?(cyclone|storm|depression|typhoon|hurricane)\s*/i, '')
    .trim();
  if (/^[A-Za-z][A-Za-z'’ -]{1,24}$/.test(t)) {
    // GDACS shouts ("FUNG-WONG"); EONET's own casing is kept.
    return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : t;
  }
  if (/^\d{1,2}[A-Z]$/.test(t)) return t;
  return '';
}

function makeStorm(name, track) {
  const last = track[track.length - 1];
  const kts = last.kts;
  return {
    name, kind: stormKind(last.lat, last.lng), kts, cat: stormCategory(kts),
    track: track.map(({ lat, lng, t, kts: k }) => ({ lat, lng, t, kts: k })),
    lat: last.lat, lng: last.lng, t: last.t,
  };
}

// ---------- fires ----------

function makeFire(name, lat, lng, ha, country, t) {
  return { name, lat, lng, ha: Number.isFinite(ha) ? Math.round(clamp(ha, 0, 1e7)) : null, country, t };
}

// "Forest fires in Australia" carries no more than its country.
export function fireLabel(fire) {
  if (fire.name && !/^forest fires? in /i.test(fire.name)) return fire.name;
  return fire.country ? `Wildfire in ${fire.country}` : 'Wildfire';
}

// ---------- parsers ----------

// EONET -> { storms, fires }. Rows that fail any check are dropped, never repaired.
export function parseEonet(json, { now = Date.now() } = {}) {
  const storms = [], fires = [];
  const events = Array.isArray(json?.events) ? json.events.slice(0, 500) : [];
  for (const ev of events) {
    const cats = Array.isArray(ev?.categories) ? ev.categories.map((c) => c?.id) : [];
    const geoms = Array.isArray(ev?.geometry) ? ev.geometry : [];
    if (cats.includes('severeStorms')) {
      const track = [];
      for (const g of geoms) {
        if (g?.type !== 'Point' || !Array.isArray(g.coordinates)) continue;
        const [lng, lat] = g.coordinates, t = parseTime(g.date);
        if (!isLat(lat) || !isLng(lng) || !Number.isFinite(t) || t > now + DAY) continue;
        let kts = Number(g.magnitudeValue);
        if (g.magnitudeUnit !== 'kts' || !Number.isFinite(kts)) kts = NaN;
        track.push({ lat, lng, t, kts: Number.isFinite(kts) ? clamp(kts, 0, 250) : NaN });
      }
      track.sort((a, b) => a.t - b.t);
      // Carry the last known wind forward over fixes that lack one.
      let lastKts = NaN;
      for (const p of track) { if (Number.isFinite(p.kts)) lastKts = p.kts; else p.kts = lastKts; }
      const good = track.filter((p) => Number.isFinite(p.kts)).slice(-MAX_TRACK);
      if (!good.length || now - good[good.length - 1].t > STORM_MAX_AGE_MS) continue;
      storms.push(makeStorm(stormName(ev.title), good));
    } else if (cats.includes('wildfires')) {
      const title = cleanText(ev?.title, 60);
      if (/^prescribed/i.test(title)) continue; // a planned burn is not news
      const g = geoms.filter((x) => x?.type === 'Point' && Array.isArray(x.coordinates)).pop();
      if (!g) continue;
      const [lng, lat] = g.coordinates, t = parseTime(g.date);
      if (!isLat(lat) || !isLng(lng) || !Number.isFinite(t) || now - t > FIRE_MAX_AGE_MS) continue;
      const v = Number(g.magnitudeValue);
      const ha = !Number.isFinite(v) ? null : g.magnitudeUnit === 'acres' ? v * ACRE_TO_HA : g.magnitudeUnit === 'ha' ? v : null;
      fires.push(makeFire(title, lat, lng, ha, '', t));
    }
  }
  return { storms: storms.slice(0, MAX_STORMS), fires: fires.slice(0, MAX_FIRES) };
}

const truthy = (v) => v === true || v === 'true';

// GDACS GeoJSON -> { storms (current point only), fires }.
export function parseGdacs(json, { now = Date.now() } = {}) {
  const storms = [], fires = [];
  const feats = Array.isArray(json?.features) ? json.features.slice(0, 1000) : [];
  for (const f of feats) {
    const p = f?.properties;
    if (!p || f?.geometry?.type !== 'Point' || !Array.isArray(f.geometry.coordinates)) continue;
    const [lng, lat] = f.geometry.coordinates;
    if (!isLat(lat) || !isLng(lng) || !truthy(p.iscurrent)) continue;
    const t = parseTime(p.todate);
    const sev = Number(p.severitydata?.severity), unit = p.severitydata?.severityunit;
    if (p.eventtype === 'TC') {
      if (!Number.isFinite(t) || now - t > STORM_MAX_AGE_MS || unit !== 'km/h' || !Number.isFinite(sev)) continue;
      const kts = clamp(sev / KTS_TO_KMH, 0, 250);
      const name = stormName(typeof p.eventname === 'string' && /^[A-Za-z]/.test(p.eventname) ? p.eventname : p.name);
      storms.push(makeStorm(name, [{ lat, lng, t, kts }]));
    } else if (p.eventtype === 'WF') {
      if (!Number.isFinite(t) || now - t > FIRE_MAX_AGE_MS) continue;
      const ha = unit === 'ha' && Number.isFinite(sev) ? sev : null;
      fires.push(makeFire(cleanText(p.name, 60), lat, lng, ha, cleanText(p.country, 40).split(',')[0].trim(), t));
    }
  }
  return { storms: storms.slice(0, MAX_STORMS), fires: fires.slice(0, MAX_FIRES) };
}

// EONET first (tracks, US fire names); GDACS fills in what EONET lacks. A GDACS storm
// within 400 km of an EONET storm is the same storm; a fire within 25 km is the same
// fire (the bigger area wins, the more specific name is kept).
export function mergeHazards(a, b) {
  const storms = [...(a?.storms || [])];
  for (const s of b?.storms || []) {
    if (!storms.some((x) => distanceKm(x.lat, x.lng, s.lat, s.lng) < 400)) storms.push(s);
  }
  const fires = [...(a?.fires || [])].map((f) => ({ ...f }));
  for (const f of b?.fires || []) {
    const twin = fires.find((x) => distanceKm(x.lat, x.lng, f.lat, f.lng) < 25);
    if (!twin) { fires.push(f); continue; }
    if ((f.ha || 0) > (twin.ha || 0)) twin.ha = f.ha;
    if (!twin.country) twin.country = f.country;
  }
  storms.sort((x, y) => y.kts - x.kts);
  return { storms: storms.slice(0, MAX_STORMS), fires: fires.slice(0, MAX_FIRES) };
}

// Re-validates a cached/merged object (localStorage is as untrusted as the network).
export function sanitizeHazards(h) {
  const storms = [], fires = [];
  for (const s of Array.isArray(h?.storms) ? h.storms.slice(0, MAX_STORMS) : []) {
    const track = (Array.isArray(s?.track) ? s.track.slice(-MAX_TRACK) : [])
      .filter((p) => isLat(p?.lat) && isLng(p?.lng) && Number.isFinite(p?.t) && Number.isFinite(p?.kts))
      .map((p) => ({ lat: p.lat, lng: p.lng, t: p.t, kts: clamp(p.kts, 0, 250) }));
    if (!track.length) continue;
    storms.push(makeStorm(stormName(typeof s.name === 'string' ? s.name : ''), track));
  }
  for (const f of Array.isArray(h?.fires) ? h.fires.slice(0, MAX_FIRES) : []) {
    if (!isLat(f?.lat) || !isLng(f?.lng)) continue;
    fires.push(makeFire(cleanText(f.name, 60), f.lat, f.lng, f.ha == null ? null : Number(f.ha), cleanText(f.country, 40), Number.isFinite(f.t) ? f.t : null));
  }
  return { storms, fires };
}

// ---------- loading ----------

function storageGet(storage, key) { try { return storage?.getItem(key) ?? null; } catch { return null; } }
function storageSet(storage, key, value) { try { storage?.setItem(key, value); } catch { /* private mode / full */ } }
function readCache(storage, key, ttl, now) {
  try {
    const c = JSON.parse(storageGet(storage, key) || 'null');
    if (c && Number.isFinite(c.at) && now - c.at < ttl && now >= c.at) return c.data;
  } catch { /* corrupt */ }
  return null;
}
const getJson = (fetchImpl, url) => withTimeout(fetchImpl, url)
  .then((r) => { if (!r?.ok) throw new Error(`HTTP ${r?.status}`); return r.json(); });

const EMPTY = () => ({ storms: [], fires: [] });
let lastHazards = EMPTY();
let hazardCache = null; // { at, promise }

// { storms, fires }; never rejects. Either feed may fail alone.
export function loadHazards({ fetchImpl = globalThis.fetch, storage = globalThis.localStorage, now = Date.now() } = {}) {
  if (hazardCache && now - hazardCache.at < HAZARD_TTL_MS) return hazardCache.promise;
  const cached = readCache(storage, HAZARD_KEY, HAZARD_TTL_MS, now);
  let promise;
  if (cached) {
    promise = Promise.resolve(sanitizeHazards(cached));
  } else {
    promise = Promise.allSettled([getJson(fetchImpl, EONET_URL), getJson(fetchImpl, GDACS_URL)]).then(([e, g]) => {
      const merged = mergeHazards(
        e.status === 'fulfilled' ? parseEonet(e.value, { now }) : EMPTY(),
        g.status === 'fulfilled' ? parseGdacs(g.value, { now }) : EMPTY(),
      );
      // Cache only a complete answer, so a half-failed load is retried next time.
      if (e.status === 'fulfilled' && g.status === 'fulfilled') storageSet(storage, HAZARD_KEY, JSON.stringify({ at: now, data: merged }));
      if (e.status !== 'fulfilled' && g.status !== 'fulfilled') hazardCache = null;
      return merged;
    }).catch(() => { hazardCache = null; return EMPTY(); });
  }
  promise = promise.then((h) => { lastHazards = h; return h; });
  hazardCache = { at: now, promise };
  return promise;
}
export function _resetHazardCache() { hazardCache = null; lastHazards = EMPTY(); newsCache = null; lastNews = []; }
export function currentHazards() { return lastHazards; }

// Storms and fires within km of a point, nearest first, each with distanceKm.
// `data` defaults to the last loaded feeds.
export function hazardsNear(lat, lng, km, data = lastHazards) {
  const near = (list) => (list || [])
    .map((x) => ({ ...x, distanceKm: distanceKm(lat, lng, x.lat, x.lng) }))
    .filter((x) => x.distanceKm <= km)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  return { storms: near(data?.storms), fires: near(data?.fires) };
}

// ---------- answer-card sentences ----------

const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);
function windWords(kts, miles) {
  return miles ? `${round5(kts * KTS_TO_MPH)} mph` : `${round5(kts * KTS_TO_KMH)} km/h`;
}
function whereWords(point, thing, km, miles, closeKm) {
  return km < closeKm ? 'right over here' : `${formatDistance(km, miles)} ${bearingWord(point, thing)} of here`;
}
// 8,055 ha -> "about 8,100 hectares"; miles players get acres.
export function areaWords(ha, miles) {
  const v = miles ? ha / ACRE_TO_HA : ha;
  const digits = Math.max(0, Math.floor(Math.log10(Math.max(v, 1))) - 1);
  const r = Math.round(v / 10 ** digits) * 10 ** digits;
  return `about ${Math.max(1, r).toLocaleString('en-US')} ${miles ? 'acres' : 'hectares'}`;
}

export function describeStorm(data, point, { miles = false } = {}) {
  const s = hazardsNear(point.lat, point.lng, STORM_RADIUS_KM, data).storms
    .sort((a, b) => b.kts - a.kts)[0];
  if (!s) return null;
  const cat = s.cat >= 1 ? ` (Category ${s.cat})` : '';
  return `${stormLabel(s)}${cat} is ${whereWords(point, s, s.distanceKm, miles, 60)}, winds ${windWords(s.kts, miles)}.`;
}

export function describeFire(data, point, { miles = false } = {}) {
  const near = hazardsNear(point.lat, point.lng, FIRE_RADIUS_KM, data).fires;
  if (!near.length) return null;
  const f = near.reduce((a, b) => ((b.ha || 0) > (a.ha || 0) ? b : a));
  const size = f.ha ? `A wildfire burning ${areaWords(f.ha, miles)}` : 'A wildfire';
  const where = whereWords(point, f, f.distanceKm, miles, 10);
  const more = near.length > 1 ? ` — one of ${near.length} burning within ${formatDistance(FIRE_RADIUS_KM, miles)}` : '';
  return `${size} is ${where}${more}.`;
}

// ---------- news pins (live/headlines.json) ----------

export const NEWS_KINDS = ['military', 'conflict', 'disaster', 'politics', 'science', 'other'];

const okString = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
function httpsUrl(v) {
  if (typeof v !== 'string' || v.length > 500) return null;
  try { const u = new URL(v); return u.protocol === 'https:' && u.hostname ? u.href : null; } catch { return null; }
}

// Strict: a pin with any field missing, mistyped, too long, out of range, not https,
// older than 72 h, from the future, or a "sample-" placeholder is dropped whole.
// Freshest first, at most 12.
export function parseHeadlines(json, { now = Date.now() } = {}) {
  const pins = Array.isArray(json?.pins) ? json.pins.slice(0, 100) : [];
  const out = [], seen = new Set();
  for (const p of pins) {
    if (!p || typeof p !== 'object') continue;
    if (!okString(p.id, 40) || p.id.startsWith('sample-') || seen.has(p.id)) continue;
    if (!isLat(p.lat) || !isLng(p.lng)) continue;
    if (!okString(p.place, 60) || !okString(p.title, 90) || !(p.summary === undefined || (typeof p.summary === 'string' && p.summary.length <= 220))) continue;
    if (!NEWS_KINDS.includes(p.kind)) continue;
    const t = parseTime(p.time);
    if (!Number.isFinite(t) || now - t > NEWS_MAX_AGE_MS || t - now > HOUR) continue;
    const source = httpsUrl(p.source);
    if (!source) continue;
    seen.add(p.id);
    out.push({
      id: p.id, lat: p.lat, lng: p.lng, place: cleanText(p.place, 60), title: cleanText(p.title, 90),
      summary: cleanText(p.summary || '', 220), kind: p.kind, timeMs: t, source,
    });
  }
  return out.sort((a, b) => b.timeMs - a.timeMs).slice(0, MAX_NEWS);
}

let lastNews = [];
let newsCache = null;
export function loadHeadlines({ fetchImpl = globalThis.fetch, storage = globalThis.localStorage, now = Date.now() } = {}) {
  if (newsCache && now - newsCache.at < NEWS_TTL_MS) return newsCache.promise;
  const cached = readCache(storage, NEWS_KEY, NEWS_TTL_MS, now);
  const promise = (cached
    ? Promise.resolve(parseHeadlines(cached, { now }))
    : getJson(fetchImpl, `${HEADLINES_URL}?t=${Math.floor(now / 300000)}`).then((json) => {
      storageSet(storage, NEWS_KEY, JSON.stringify({ at: now, data: json }));
      return parseHeadlines(json, { now });
    }))
    .catch(() => { newsCache = null; return []; }) // 404 until the routine's first run: silent
    .then((pins) => { lastNews = pins; return pins; });
  newsCache = { at: now, promise };
  return promise;
}
export function currentHeadlines() { return lastNews; }

export function newsAgoWords(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${Math.max(1, min)} min ago`;
  const h = Math.round(min / 60);
  if (h < 36) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

// { text, url, host } for the freshest pin within 600 km, or null.
export function describeNews(pins, point, { now = Date.now() } = {}) {
  const near = (pins || []).filter((p) => distanceKm(point.lat, point.lng, p.lat, p.lng) <= NEWS_RADIUS_KM)
    .sort((a, b) => b.timeMs - a.timeMs);
  const p = near[0];
  if (!p) return null;
  let host = '';
  try { host = new URL(p.source).hostname.replace(/^www\./, ''); } catch { /* validated already */ }
  return { text: `📰 ${newsAgoWords(now - p.timeMs)} near ${p.place}: ${p.title}`, url: p.source, host };
}

// ---------- the opening-flight tour ----------

// Up to five notable things right now, most striking first: the strongest storm, a
// strong recent quake (M5.5+, last 3 days), the freshest news pin, the biggest fire,
// then a second storm and a second news pin.
export function pickTourStops({ storms = [], fires = [], quakes = [], news = [] } = {}, now = Date.now()) {
  const s = [...storms].sort((a, b) => b.kts - a.kts);
  const q = quakes.filter((x) => x.mag >= 5.5 && now - x.timeMs <= 3 * DAY && now >= x.timeMs - HOUR)
    .sort((a, b) => b.mag - a.mag)[0];
  const f = fires.filter((x) => x.ha > 0).sort((a, b) => b.ha - a.ha)[0];
  const n = [...news].sort((a, b) => b.timeMs - a.timeMs);
  const stops = [
    s[0] && { lat: s[0].lat, lng: s[0].lng, kind: 'storm', label: stormLabel(s[0]) },
    q && { lat: q.lat, lng: q.lng, kind: 'quake', label: `Magnitude ${q.mag.toFixed(1)} earthquake` },
    n[0] && { lat: n[0].lat, lng: n[0].lng, kind: 'news', label: n[0].place },
    f && { lat: f.lat, lng: f.lng, kind: 'fire', label: fireLabel(f) },
    s[1] && { lat: s[1].lat, lng: s[1].lng, kind: 'storm', label: stormLabel(s[1]) },
    n[1] && { lat: n[1].lat, lng: n[1].lng, kind: 'news', label: n[1].place },
  ];
  return stops.filter(Boolean).slice(0, 5);
}
