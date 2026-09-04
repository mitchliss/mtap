// Prior-days archive, head-to-head challenges and the visited globe (v3.9).
// All of it is derived from data that already exists: the deterministic daily
// deal (dailyPicksFor), the local history, and the append-only LOCATIONS list
// (so a location can be shipped in a link as a stable index).

import { LOCATIONS } from './locations.js';
import { NEWS } from './news.js';
import { dailyPicksFor, dailyThemeFor, loadHistory, DAILY_GENERATION, emojiForScore } from './game.js';
import { dateForPuzzle } from './themes.js';
import { puzzleNumberForToday } from './rng.js';

const NEWS_INDEX_BASE = 100000;
const allByName = new Map([
  ...LOCATIONS.map((l, i) => [l.name, { loc: l, index: i }]),
  ...NEWS.map((l, i) => [l.name, { loc: l, index: NEWS_INDEX_BASE + i }]),
]);

export function shortDate(n) {
  return dateForPuzzle(n).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Newest first: every puzzle before today, with the stored result if any.
// The deal itself is not computed here (that walks the whole no-repeat chain);
// it is only needed when a day is actually replayed.
export function archiveEntries() {
  const history = loadHistory();
  const today = puzzleNumberForToday();
  const out = [];
  for (let n = today - 1; n >= 1; n--) {
    const rec = history[n] && (history[n].gen || 1) === DAILY_GENERATION ? history[n] : null;
    out.push({
      n,
      date: shortDate(n),
      theme: dailyThemeFor(n),
      total: rec ? rec.total : null,
      emojis: rec ? (rec.rounds || []).filter((r) => !r.b).map((r) => emojiForScore(r.score)).join('') : '',
    });
  }
  return out;
}

export function replayLocations(n) {
  return dailyPicksFor(n);
}

// ---------- head-to-head ("beat my score") ----------
// The link carries the five places as indices (practice deals depend on the
// sender's local exclusions, so a seed alone would not reproduce them).

export function buildChallengePayload(name, session) {
  const idx = session.locations.filter((l) => !l.isFamily).map((l) => allByName.get(l.name)?.index);
  if (idx.some((i) => i === undefined)) return null;
  const rounds = session.results.filter((r) => !r.isBonus).map((r) => r.score);
  return { t: 'v', n: String(name).slice(0, 24), i: idx, s: session.totalScore, r: rounds, p: session.isPractice ? 0 : session.seed };
}

export function importChallengePayload(p) {
  if (!p || p.t !== 'v' || !Array.isArray(p.i) || !p.i.length) return null;
  const locs = p.i.map((i) => i >= NEWS_INDEX_BASE ? NEWS[i - NEWS_INDEX_BASE] : LOCATIONS[i]).filter(Boolean);
  if (locs.length !== p.i.length) return null; // a link from a newer build than this one
  return { name: String(p.n || 'A friend').slice(0, 24), locations: locs, score: Number(p.s) || 0, rounds: Array.isArray(p.r) ? p.r.map(Number) : [], puzzle: Number(p.p) || 0 };
}

// ---------- visited globe ----------

export function visitedPlaces() {
  const history = loadHistory();
  const best = new Map(); // name -> best score
  for (const rec of Object.values(history)) {
    for (const r of rec.rounds || []) {
      if (r.b || !allByName.has(r.name)) continue;
      if (!best.has(r.name) || best.get(r.name) < r.score) best.set(r.name, r.score);
    }
  }
  const dots = [];
  const countries = new Set();
  for (const [name, score] of best) {
    const l = allByName.get(name).loc;
    dots.push({ lat: l.lat, lng: l.lng, name, score, color: tierColor(score) });
    if (l.country) countries.add(l.country);
  }
  return { dots, pinned: dots.length, total: LOCATIONS.length + NEWS.length, countries: countries.size };
}

export function tierColor(score) {
  if (score >= 90) return '#38d67a';
  if (score >= 70) return '#ffd166';
  if (score >= 40) return '#ff9f43';
  return '#ff4d6d';
}
