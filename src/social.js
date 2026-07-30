// MTap social layer - serverless by design.
// Profiles, a mergeable leaderboard, challenge results, and the shared family
// places pack all live in localStorage; they travel between family members as
// compact base64 payloads in share-link URL hashes (#mt=...). Opening a link
// merges its payload into the local store - the family group chat is the network.
// Nothing is ever sent to a server and nothing personal lives in the public repo.

import { loadJSON, saveJSON } from './game.js';
import { countryAt } from './geo.js';

// ---------- payload encoding (URL-hash safe) ----------

function b64urlEncode(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64 + '==='.slice((b64.length + 3) % 4);
    return JSON.parse(decodeURIComponent(escape(atob(pad))));
  } catch {
    return null;
  }
}

export function encodePayload(obj) { return b64urlEncode(obj); }

export function readHashPayload() {
  const m = window.location.hash.match(/#mt=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const payload = b64urlDecode(m[1]);
  // Clean the hash so refreshes don't re-import.
  try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* ok */ }
  return payload;
}

export function shareBaseUrl() {
  return 'https://mitchliss.github.io/mtap/';
}

// ---------- profiles ----------

export function getActivePlayer() {
  return loadJSON('social.active', null);
}

export function setActivePlayer(name) {
  const clean = String(name || '').trim().slice(0, 24);
  if (!clean) return null;
  saveJSON('social.active', clean);
  const players = loadJSON('social.players', {});
  const key = clean.toLowerCase();
  if (!players[key]) players[key] = { name: clean, results: {}, isLocal: true };
  players[key].isLocal = true;
  saveJSON('social.players', players);
  return clean;
}

export function getPlayers() { return loadJSON('social.players', {}); }

// ---------- results / leaderboard ----------

// Record a finished daily for a player. Keeps the best total per puzzle.
export function recordPlayerResult(name, puzzleNumber, total, emojis, bonus) {
  if (!name) return;
  const players = getPlayers();
  const key = name.toLowerCase();
  if (!players[key]) players[key] = { name, results: {}, isLocal: false };
  const prev = players[key].results[puzzleNumber];
  if (!prev || total >= prev.t) {
    players[key].results[puzzleNumber] = { t: total, e: emojis, b: bonus || 0, d: new Date().toISOString().slice(0, 10) };
  }
  saveJSON('social.players', players);
}

export function importResultPayload(p) {
  // { t:'r', n:name, p:puzzle, s:score, e:emojis, b:bonus }
  if (!p || p.t !== 'r' || !p.n || typeof p.s !== 'number') return null;
  recordPlayerResult(String(p.n).slice(0, 24), p.p, p.s, String(p.e || '').slice(0, 24), p.b);
  return { name: p.n, puzzle: p.p, score: p.s };
}

export function buildResultPayload(name, puzzleNumber, total, emojis, bonus) {
  return { t: 'r', n: name, p: puzzleNumber, s: total, e: emojis, b: bonus || 0 };
}

function streakFor(results, todayPuzzle) {
  let streak = 0;
  let cursor = results[todayPuzzle] ? todayPuzzle : todayPuzzle - 1;
  while (results[cursor]) { streak++; cursor--; }
  return streak;
}

// Rows for the leaderboard screen, best-today first.
export function leaderboardRows(todayPuzzle) {
  const players = getPlayers();
  const rows = Object.values(players).map((pl) => {
    const totals = Object.values(pl.results).map((r) => r.t);
    const today = pl.results[todayPuzzle] || null;
    return {
      name: pl.name,
      isLocal: !!pl.isLocal,
      today: today ? today.t : null,
      todayEmojis: today ? today.e : '',
      bonus: today ? today.b || 0 : 0,
      best: totals.length ? Math.max(...totals) : 0,
      avg: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0,
      played: totals.length,
      streak: streakFor(pl.results, todayPuzzle),
    };
  });
  rows.sort((a, b) => {
    if ((b.today !== null) !== (a.today !== null)) return b.today !== null ? 1 : -1;
    if (b.today !== a.today) return (b.today || 0) - (a.today || 0);
    return b.best - a.best;
  });
  return rows;
}

// ---------- challenges ----------

export function setChallenge(fromName, puzzleNumber, score) {
  saveJSON('social.challenge', { n: fromName, p: puzzleNumber, s: score });
}

export function getChallenge(puzzleNumber) {
  const c = loadJSON('social.challenge', null);
  return c && c.p === puzzleNumber ? c : null;
}

// ---------- crew (friend group) ----------

export function getCrew() { return loadJSON('social.crew', { name: '', members: [] }); }
export function saveCrew(crew) { saveJSON('social.crew', crew); }

export function toggleCrewMember(name) {
  const crew = getCrew();
  const key = name.toLowerCase();
  const idx = crew.members.findIndex((m) => m.toLowerCase() === key);
  if (idx >= 0) crew.members.splice(idx, 1); else crew.members.push(name);
  saveCrew(crew);
  return crew;
}

export function isCrewMember(name) {
  if (!name) return false;
  const crew = getCrew();
  return crew.members.some((m) => m.toLowerCase() === name.toLowerCase());
}

export function buildCrewPayload() {
  const crew = getCrew();
  return { t: 'c', g: crew.name, m: crew.members };
}

export function importCrewPayload(p) {
  // { t:'c', g:name, m:[names] } -> union-merge into the local crew
  if (!p || p.t !== 'c' || !Array.isArray(p.m)) return null;
  const crew = getCrew();
  if (p.g && !crew.name) crew.name = String(p.g).slice(0, 24);
  for (const m of p.m.slice(0, 30)) {
    const name = String(m).slice(0, 24);
    if (name && !crew.members.some((x) => x.toLowerCase() === name.toLowerCase())) {
      crew.members.push(name);
    }
  }
  saveCrew(crew);
  return crew;
}

// ---------- family places pack ----------

export function getFamilyPlaces() { return loadJSON('social.places', []); }

export function addFamilyPlace(place) {
  // { name, lat, lng, fact, by, hint?, photo?, photoId?, date? }
  // -> stored with country/continent resolved locally. photo is a small
  // compressed dataURL (local cache); photoId points at the shared cloud copy.
  const places = getFamilyPlaces();
  const key = place.name.trim().toLowerCase();
  const existingIdx = places.findIndex((p) => p.name.trim().toLowerCase() === key);
  const country = countryAt(place.lat, place.lng);
  const full = {
    name: String(place.name).trim().slice(0, 60),
    lat: +place.lat,
    lng: +place.lng,
    fact: String(place.fact || '').slice(0, 200),
    by: String(place.by || '').slice(0, 24),
    hint: String(place.hint || '').slice(0, 120),
    photo: typeof place.photo === 'string' && place.photo.startsWith('data:image') ? place.photo : null,
    photoId: place.photoId ? String(place.photoId).slice(0, 40) : null,
    date: place.date ? String(place.date).slice(0, 10) : null,
    country: country ? country.name : null,
    continent: country ? country.continent : null,
  };
  if (existingIdx >= 0) places[existingIdx] = full; else places.push(full);
  saveJSON('social.places', places);
  return full;
}

export function buildPlacePayload(place) {
  // The photo itself never rides in the link (too big for SMS) - photoId lets
  // recipients pull the shared cloud copy.
  return {
    t: 'l', n: place.name, la: place.lat, lo: place.lng, f: place.fact, by: place.by,
    h: place.hint || undefined, d: place.date || undefined, pid: place.photoId || undefined,
  };
}

export function importPlacePayload(p) {
  if (!p || p.t !== 'l' || !p.n || typeof p.la !== 'number' || typeof p.lo !== 'number') return null;
  return addFamilyPlace({
    name: p.n, lat: p.la, lng: p.lo, fact: p.f, by: p.by,
    hint: p.h, date: p.d, photoId: p.pid,
  });
}

// Attach a lazily-fetched photo to an existing place (by name), cached locally.
export function attachPhotoToPlace(name, dataUrl) {
  const places = getFamilyPlaces();
  const p = places.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  if (p) { p.photo = dataUrl; saveJSON('social.places', places); }
}

// ---------- family-round rotation with per-device memory ----------
// The old pick was puzzleNumber % packSize with no memory: a small pack served
// the SAME place every day. Now each device remembers when it last played each
// place and always deals the least-recently-played one (never-played first),
// preferring photo challenges on ties so uploaded photos actually get used.
// The author of a place still never gets their own question.

export function notePlayedFamilyPlace(name, puzzleNumber) {
  const played = loadJSON('social.placesPlayed', {});
  played[String(name).toLowerCase()] = puzzleNumber;
  saveJSON('social.placesPlayed', played);
}

export function familyPlaceForPuzzle(puzzleNumber, excludeAuthor = null) {
  const places = getFamilyPlaces();
  if (!places.length) return null;
  const played = loadJSON('social.placesPlayed', {});
  const eligible = places.filter((p) =>
    !excludeAuthor || !p.by || p.by.toLowerCase() !== excludeAuthor.toLowerCase()
  );
  if (!eligible.length) return null;
  const lastPlayed = (p) => {
    const v = played[p.name.toLowerCase()];
    return typeof v === 'number' ? v : -1; // never played sorts first
  };
  const hasPhoto = (p) => (p.photo || p.photoId) ? 0 : 1;
  const sorted = eligible.slice().sort((a, b) =>
    lastPlayed(a) - lastPlayed(b) ||          // least recently played first
    hasPhoto(a) - hasPhoto(b) ||              // photo challenges preferred
    a.name.localeCompare(b.name)              // stable
  );
  return sorted[0];
}
