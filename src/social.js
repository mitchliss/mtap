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

// ---------- family places pack ----------

export function getFamilyPlaces() { return loadJSON('social.places', []); }

export function addFamilyPlace(place) {
  // { name, lat, lng, fact, by } -> stored with country/continent resolved locally
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
    country: country ? country.name : null,
    continent: country ? country.continent : null,
  };
  if (existingIdx >= 0) places[existingIdx] = full; else places.push(full);
  saveJSON('social.places', places);
  return full;
}

export function buildPlacePayload(place) {
  return { t: 'l', n: place.name, la: place.lat, lo: place.lng, f: place.fact, by: place.by };
}

export function importPlacePayload(p) {
  if (!p || p.t !== 'l' || !p.n || typeof p.la !== 'number' || typeof p.lo !== 'number') return null;
  return addFamilyPlace({ name: p.n, lat: p.la, lng: p.lo, fact: p.f, by: p.by });
}

// Deterministic family-round pick: same place for everyone on a given day
// (as long as their packs match - links keep packs in sync).
export function familyPlaceForPuzzle(puzzleNumber) {
  const places = getFamilyPlaces();
  if (!places.length) return null;
  const sorted = places.slice().sort((a, b) => a.name.localeCompare(b.name));
  return sorted[puzzleNumber % sorted.length];
}
