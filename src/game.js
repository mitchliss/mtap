// MarcTap game logic: daily round selection, scoring, persistence, share text.

import { LOCATIONS } from './locations.js';
import { distanceKm, countryAt } from './geo.js';
import { mulberry32, seededShuffle, puzzleNumberForToday, todayKey } from './rng.js';

export const ROUNDS_PER_GAME = 5;
export const MAX_ROUND_SCORE = 100;
// MapTap-style round weighting: early rounds are easy and worth x1,
// round 3 is medium x2, rounds 4-5 are hard and worth TRIPLE.
export const ROUND_MULTIPLIERS = [1, 1, 2, 3, 3];
export const MAX_GAME_SCORE = ROUND_MULTIPLIERS.reduce((a, m) => a + m * MAX_ROUND_SCORE, 0); // 1000

// ---------- round selection ----------

// Bump this to re-deal every daily puzzle (e.g. after a scoring change, so the
// day can be retested with fresh locations). A stored daily result from an older
// generation no longer counts as "already played".
export const DAILY_GENERATION = 2;

// Deterministic daily pick: 5 locations, easy -> hard, no repeated country,
// at least 3 different continents. NEVER pass excludeNames for a daily pick -
// dailies must stay identical for every player; exclusion is a practice-only
// feature (avoids repeating recent games and spoiling upcoming dailies).
// Pool-expansion guard: growing the database changes every seeded deal, which
// would RE-DEAL the current day mid-day (non-comparable scores). Each tier pins
// the pool size that was live through that puzzle number; new locations join
// the rotation with the NEXT puzzle. Add a tier on every future expansion
// (upToPuzzle = today's puzzle number, size = pool length before adding).
const POOL_TIERS = [
  { upToPuzzle: 4, size: 205 }, // through Jul 25, 2026
  { upToPuzzle: 6, size: 276 }, // through Jul 27, 2026
];

function poolForPuzzle(seed) {
  for (const tier of POOL_TIERS) {
    if (seed <= tier.upToPuzzle) return LOCATIONS.slice(0, tier.size);
  }
  return LOCATIONS;
}

export function pickLocations(seed, excludeNames = null) {
  const rng = mulberry32((seed + DAILY_GENERATION * 1000003) * 7919 + 13);
  let pool = poolForPuzzle(seed);
  if (excludeNames && excludeNames.size) {
    const filtered = pool.filter((l) => !excludeNames.has(l.name));
    if (filtered.length >= 40) pool = filtered; // never over-constrain the pick
  }
  const shuffled = seededShuffle(pool, rng);
  const wantDiff = [1, 1, 2, 3, 3]; // ramp difficulty to match the x1/x1/x2/x3/x3 multipliers
  const picked = [];
  const usedCountries = new Set();

  for (const targetDiff of wantDiff) {
    let choice =
      shuffled.find(
        (l) => !picked.includes(l) && l.diff === targetDiff && !usedCountries.has(l.country || l.name)
      ) ||
      shuffled.find((l) => !picked.includes(l) && !usedCountries.has(l.country || l.name)) ||
      shuffled.find((l) => !picked.includes(l));
    picked.push(choice);
    usedCountries.add(choice.country || choice.name);
  }
  return picked;
}

export function dailySeed() { return puzzleNumberForToday(); }

// ---------- daily picks with a rolling 30-day no-repeat window ----------
// From NO_REPEAT_START onward, each daily excludes every location dealt in the
// previous 29 days. The chain is computed iteratively from the regime start, so
// it is fully deterministic - every player derives the identical sequence.
const NO_REPEAT_WINDOW = 30;      // days in the rolling window (incl. today)
const NO_REPEAT_START = 7;        // puzzle #7 = Jul 28, 2026 (earlier days stay as dealt)
const dailyPickCache = new Map(); // puzzle number -> picks (avoids re-walking the chain)

export function dailyPicksFor(n) {
  if (n < NO_REPEAT_START) return pickLocations(n);
  if (dailyPickCache.has(n)) return dailyPickCache.get(n);

  // Seed the window with the fixed pre-regime days that fall inside it.
  const window = [];
  for (let k = Math.max(1, NO_REPEAT_START - (NO_REPEAT_WINDOW - 1)); k < NO_REPEAT_START; k++) {
    window.push({ n: k, names: pickLocations(k).map((l) => l.name) });
  }
  let picks = null;
  for (let k = NO_REPEAT_START; k <= n; k++) {
    if (dailyPickCache.has(k)) {
      picks = dailyPickCache.get(k);
    } else {
      const exclude = new Set();
      for (const w of window) {
        if (w.n >= k - (NO_REPEAT_WINDOW - 1)) for (const nm of w.names) exclude.add(nm);
      }
      picks = pickLocations(k, exclude);
      dailyPickCache.set(k, picks);
    }
    window.push({ n: k, names: picks.map((l) => l.name) });
    if (window.length > NO_REPEAT_WINDOW) window.shift();
  }
  return picks;
}

export function practiceSeed() {
  return (Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9);
}

// Locations practice games must avoid: today's + the next two dailies
// (deterministic, so practice can never spoil an upcoming real game), plus
// anything this device has seen recently in any mode.
export function practiceExcludeSet() {
  const exclude = new Set();
  const today = puzzleNumberForToday();
  for (let n = today; n <= today + 2; n++) {
    for (const loc of dailyPicksFor(n)) exclude.add(loc.name);
  }
  for (const name of loadJSON('recentLocations', [])) exclude.add(name);
  return exclude;
}

// Remember what's been dealt on this device (any mode), most recent first.
export function noteLocationsSeen(names) {
  const recent = loadJSON('recentLocations', []);
  const merged = [...new Set([...names, ...recent])].slice(0, 60);
  saveJSON('recentLocations', merged);
}

// ---------- scoring ----------

// Calibrated 1:1 against maptap.gg (probed live 2026-07-23):
//   - accuracy = 100 * e^(-d/4643) -> the score halves every ~3,219 km (2,000 mi).
//     286 km away = 94, 1,000 km = 81, 2,800 km = 55, 5,000 km = 34.
//   - landing in the right country lifts low scores toward a floor of 25; the
//     right continent (on land) toward 10. The lift rescales accuracy into
//     [floor, 100] but is capped at 80 - and never LOWERS a good raw score.
const DECAY_KM = 4643;
const COUNTRY_FLOOR = 25;
const CONTINENT_FLOOR = 10;
const FLOOR_CAP = 80;

export function scoreGuess(guessLat, guessLng, target) {
  const d = distanceKm(guessLat, guessLng, target.lat, target.lng);
  const accuracy = Math.round(Math.max(0, Math.min(100, 100 * Math.exp(-d / DECAY_KM))));

  const guessCountry = countryAt(guessLat, guessLng);
  let floor = 0;
  let countryMatch = false;
  let continentMatch = false;
  if (guessCountry && target.country && guessCountry.name === target.country) {
    floor = COUNTRY_FLOOR;
    countryMatch = true;
  } else if (guessCountry && target.continent && guessCountry.continent === target.continent) {
    // guessCountry non-null = tap was on land; open-ocean taps get no continent bonus.
    floor = CONTINENT_FLOOR;
    continentMatch = true;
  }

  const boosted = floor + (accuracy / 100) * (100 - floor);
  const score = Math.round(Math.max(accuracy, Math.min(boosted, FLOOR_CAP)));
  const bullseye = accuracy >= 100; // within ~23 km rounds to a perfect 100

  return { distanceKm: d, score, bullseye, countryMatch, continentMatch, guessCountry };
}

export function emojiForScore(score) {
  if (score >= 100) return '🎯';
  if (score >= 90) return '🏆';
  if (score >= 80) return '⭐';
  if (score >= 70) return '🔥';
  if (score >= 55) return '😄';
  if (score >= 40) return '👍';
  if (score >= 25) return '😑';
  if (score >= 15) return '🥲';
  return '🌍';
}

// Always encouraging, always informative: names the country the pin actually
// landed in and how far off it was, so every miss teaches some geography.
export function verdictForResult(r, distText) {
  const pinned = r.guessCountry ? r.guessCountry.name : null;
  const d = distText || 'a stretch';
  if (r.bullseye) {
    return pinned ? `🎯 Dead on — right there in ${pinned}!` : '🎯 Dead on!';
  }
  if (r.score >= 85) {
    return pinned
      ? `🔥 So close! Your pin landed in ${pinned}, just ${d} from the spot.`
      : `🔥 So close — just ${d} from the spot!`;
  }
  if (r.countryMatch) {
    return `🗺️ Right country! Your pin was in ${pinned}, ${d} from the exact spot — nice.`;
  }
  if (r.continentMatch) {
    return `🌎 Getting warmer — you pinned ${pinned}, same continent, ${d} away.`;
  }
  if (!pinned) {
    return `⚓ Your pin landed in open water, ${d} from the answer — bold call, sailor!`;
  }
  if (r.score >= 40) {
    return `👍 Good instincts — ${pinned} is ${d} from the answer. You're circling it!`;
  }
  return `🌍 You pinned ${pinned}, ${d} away — now you'll never forget where this one is!`;
}

// ---------- persistence ----------

// Deliberately unchanged after the MTap rename - keeps existing streaks/history.
const LS_PREFIX = 'marctap.';

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch { /* private mode */ }
}

export function loadSettings() {
  const stored = loadJSON('settings', {});
  // v2 migration (2026-07-27): hold-to-place and double-tap-confirm were retired
  // in favor of tap+confirm with double-tap-to-zoom. Old keys are dropped so a
  // stale 'hold' preference can never resurrect a removed mode.
  if (!stored.v || stored.v < 2) {
    delete stored.guessMode;
    delete stored.doubleTap;
    stored.v = 2;
    saveJSON('settings', stored);
  }
  return Object.assign(
    { miles: false, sound: true, music: true, musicStyle: 'auto', autoRotate: true, v: 2 },
    stored
  );
}
export function saveSettings(s) { saveJSON('settings', s); }

export function loadHistory() { return loadJSON('history', {}); }

export function recordDailyResult(puzzleNumber, rounds, total) {
  const history = loadHistory();
  history[puzzleNumber] = { date: todayKey(), total, rounds, gen: DAILY_GENERATION };
  saveJSON('history', history);
  return history;
}

export function dailyAlreadyPlayed(puzzleNumber) {
  const history = loadHistory();
  const rec = history[puzzleNumber] || null;
  // A result recorded under an older generation doesn't block a replay
  // (the day was re-dealt with different locations).
  if (rec && (rec.gen || 1) !== DAILY_GENERATION) return null;
  return rec;
}

export function computeStreak() {
  const history = loadHistory();
  const nums = Object.keys(history).map(Number).sort((a, b) => b - a);
  if (!nums.length) return { streak: 0, played: 0, best: 0, average: 0 };
  const today = puzzleNumberForToday();
  let streak = 0;
  let cursor = history[today] ? today : today - 1;
  while (history[cursor]) { streak++; cursor--; }
  const totals = nums.map((n) => history[n].total);
  const best = Math.max(...totals);
  const average = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
  return { streak, played: nums.length, best, average };
}

// ---------- share ----------

export function buildShareText(puzzleNumber, rounds, total, isPractice) {
  const emojis = rounds.map((r) => emojiForScore(r.score)).join('');
  const title = isPractice ? 'MTap practice' : `MTap #${puzzleNumber}`;
  return `${title} 🌍 ${total}/${MAX_GAME_SCORE}\n${emojis}`;
}

// Multiplier for a given 0-based round index (shared by UI + reconstruction).
export function multiplierForRound(i) { return ROUND_MULTIPLIERS[i] || 1; }

// ---------- game state machine ----------

export const FAMILY_ROUND_MULTIPLIER = 2;

export class GameSession {
  constructor(seed, isPractice, excludeNames = null) {
    this.seed = seed;
    this.isPractice = isPractice;
    // Dailies use the deterministic 30-day no-repeat chain; practice uses the
    // raw pick with the caller's local exclusions.
    this.locations = isPractice ? pickLocations(seed, excludeNames) : dailyPicksFor(seed);
    this.roundIndex = 0;
    this.results = [];
  }

  // Adds a 6th "Family Round" from the shared family places pack. Its points are
  // a BONUS tracked separately so leaderboard totals stay comparable (/1000)
  // between family members with and without the pack.
  appendFamilyRound(place) {
    if (!place || this.locations.some((l) => l.isFamily)) return;
    this.locations.push({
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      country: place.country,
      continent: place.continent,
      fact: place.fact || '',
      by: place.by || '',
      hint: place.hint || '',
      photo: place.photo || null,
      photoId: place.photoId || null,
      date: place.date || null,
      isFamily: true,
    });
  }

  get currentLocation() { return this.locations[this.roundIndex]; }
  get currentMultiplier() {
    const loc = this.currentLocation;
    if (loc && loc.isFamily) return FAMILY_ROUND_MULTIPLIER;
    return ROUND_MULTIPLIERS[this.roundIndex] || 1;
  }
  get totalScore() { return this.results.filter((r) => !r.isBonus).reduce((a, r) => a + r.points, 0); }
  get bonusScore() { return this.results.filter((r) => r.isBonus).reduce((a, r) => a + r.points, 0); }
  get isOver() { return this.roundIndex >= this.locations.length; }

  submitGuess(lat, lng) {
    const target = this.currentLocation;
    const result = scoreGuess(lat, lng, target);
    result.target = target;
    result.guess = { lat, lng };
    // score = base accuracy 0-100; points = score x round multiplier (what totals up).
    result.multiplier = this.currentMultiplier;
    result.points = result.score * result.multiplier;
    result.isBonus = !!target.isFamily;
    this.results.push(result);
    return result;
  }

  nextRound() { this.roundIndex++; }
}
