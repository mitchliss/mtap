import { landmarkBonus } from './landmarks.js';
// MarcTap game logic: daily round selection, scoring, persistence, share text.

import { LOCATIONS } from './locations.js';
import { distanceKm, countryAt } from './geo.js';
import { mulberry32, seededShuffle, puzzleNumberForToday, todayKey } from './rng.js';
import { themeForPuzzle, tagsFor } from './themes.js';
import { NEWS, NEWS_START, newsRollFor } from './news.js';

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

// Deterministic daily pick: 5 locations, easy -> hard, deduplicating countries
// except for the explicit themed-day allowance. NEVER pass excludeNames for a daily pick -
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
  { upToPuzzle: 33, size: 332 }, // through Aug 23, 2026 (waterways pack lands on #34)
  // (the v3.8 waterways and v3.9 Jewish packs both shipped on #33 — one tier covers both)
  { upToPuzzle: 47, size: 453 }, // through Sep 6, 2026 (v4.1 world pack lands on #48)
  { upToPuzzle: 109, size: 1891 }, // through Nov 7, 2026 (v4.3 heritage pack lands on #110)
];

function poolForPuzzle(seed) {
  for (const tier of POOL_TIERS) {
    if (seed <= tier.upToPuzzle) return LOCATIONS.slice(0, tier.size);
  }
  return LOCATIONS;
}

// opts.preferTag: on a themed day, fill slots from that tag first (same
// difficulty ladder and no-same-country rule); untagged places fill whatever
// the tag pool cannot, so a thin tag never breaks the deal.
export function pickLocations(seed, excludeNames = null, opts = {}) {
  const rng = mulberry32((seed + DAILY_GENERATION * 1000003) * 7919 + 13);
  let pool = poolForPuzzle(seed);
  if (excludeNames && excludeNames.size) {
    const filtered = pool.filter((l) => !excludeNames.has(l.name));
    if (filtered.length >= 40) pool = filtered; // never over-constrain the pick
  }
  const shuffled = seededShuffle(pool, rng);
  const wantDiff = [1, 1, 2, 3, 3]; // ramp difficulty to match the x1/x1/x2/x3/x3 multipliers
  const picked = [];
  const balanced = !!opts.balanced;
  const waterCount = () => picked.filter((l) => tagsFor(l).has('water')).length;
  const allowed = (l) => !balanced || !tagsFor(l).has('water') || waterCount() < 2;
  const usedCountries = new Set();
  const tag = opts.preferTag || null;
  const hasTag = (l) => tag && tagsFor(l).has(tag);
  // Themed days may take up to THEME_MAX_PER_COUNTRY tagged places from one
  // country (most Jewish-heritage sites are in Israel); mixed days keep the
  // strict one-per-country rule.
  const countryCount = new Map();
  const countOf = (l) => countryCount.get(l.country || l.name) || 0;
  const okMixed = (l, d) => !picked.includes(l) && allowed(l) && (d === null || l.diff === d) && countOf(l) === 0;
  const okTag = (l, d) => !picked.includes(l) && allowed(l) && (d === null || l.diff === d) && hasTag(l) && countOf(l) < THEME_MAX_PER_COUNTRY;

  // opts.reserved (v4.3 heritage days): a pre-chosen place that takes the slot
  // matching its difficulty; its country is claimed before the others fill.
  const reserved = opts.reserved || null;
  const reservedSlot = reserved ? Math.max(0, wantDiff.indexOf(reserved.diff)) : -1;
  if (reserved) countryCount.set(reserved.country || reserved.name, 1);
  for (const [slot, targetDiff] of wantDiff.entries()) {
    if (slot === reservedSlot) { picked.push(reserved); continue; }
    // Reserve a heritage place before the other slots consume its country
    // (the pre-v4.3 every-day rule; scheduled days pass `reserved` instead).
    const heritage = balanced && !opts.scheduled && picked.length === 0
      ? shuffled.find((l) => tagsFor(l).has('jewish') && allowed(l)) : null;
    let choice = heritage ||
      (tag && (shuffled.find((l) => okTag(l, targetDiff)) || shuffled.find((l) => okTag(l, null)))) ||
      shuffled.find((l) => okMixed(l, targetDiff)) ||
      shuffled.find((l) => okMixed(l, null)) ||
      shuffled.find((l) => !picked.includes(l) && allowed(l));
    picked.push(choice);
    countryCount.set(choice.country || choice.name, countOf(choice) + 1);
  }
  return picked;
}
const THEME_MAX_PER_COUNTRY = 3;
const THEME_MIN_POOL = 10; // a thin tag (after the no-repeat exclusions) means a mixed day instead

const dailyThemeCache = new Map();
// The theme a daily ACTUALLY used (null = mixed). Computed by dailyPicksFor.
export function dailyThemeFor(n) {
  if (!dailyThemeCache.has(n)) dailyPicksFor(n);
  return dailyThemeCache.get(n) || null;
}

export function dailySeed() { return puzzleNumberForToday(); }

// ---------- daily picks with a rolling 30-day no-repeat window ----------
// From NO_REPEAT_START onward, each daily excludes every location dealt in the
// previous 29 days. The chain is computed iteratively from the regime start, so
// it is fully deterministic - every player derives the identical sequence.
const NO_REPEAT_WINDOW = 30;      // days in the rolling window (incl. today)
const NO_REPEAT_START = 7;        // puzzle #7 = Jul 28, 2026 (earlier days stay as dealt)
// v4.1 (feedback: "Pyramids of Giza three times"): from #48 the window is a full
// year. That only works with a pool comfortably above 5*365 names — the
// year-window Node gate asserts the margin on every run. Gated by puzzle number
// so no already-dealt day changes.
const YEAR_WINDOW = 365;
const YEAR_WINDOW_START = 48;     // puzzle #48 = Sep 7, 2026
// The exclusion pass covers (days - 1) prior deals, so the year regime passes
// YEAR_WINDOW + 1 to exclude a full 365 previous days (min repeat gap: 366).
const windowDaysFor = (k) => (k >= YEAR_WINDOW_START ? YEAR_WINDOW + 1 : NO_REPEAT_WINDOW);
const dailyPickCache = new Map(); // puzzle number -> picks (avoids re-walking the chain)

// v4.3 (family request: "at least 3 Jewish-related locations each week"). The
// old rule reserved one heritage place EVERY day, which drained the pool under
// the year-long no-repeat window (none were dealt from #86 on). From #110 a
// fixed schedule deals exactly one on Sunday, Tuesday and Friday — any 7
// consecutive puzzles cover each weekday once, so every rolling week gets 3.
// Puzzle #1 (Jul 22, 2026) was a Wednesday: pn % 7 → 5 = Sun, 0 = Tue, 3 = Fri.
export const HERITAGE_SCHEDULE_START = 110; // Nov 8, 2026
const HERITAGE_WEEKDAYS = new Set([5, 0, 3]);
// v4.6 (family: 'still not seeing so many Jewish places'): from #111 EVERY day
// deals one. 267 heritage places can't fill a full no-repeat year at one a day,
// so heritage places get their own shorter window: never repeated within
// HERITAGE_WINDOW days (the rest of the pool keeps the 365-day rule).
export const DAILY_HERITAGE_START = 111; // Nov 9, 2026
export const HERITAGE_WINDOW = 240;
export const isHeritageDay = (k) => k >= DAILY_HERITAGE_START || (k >= HERITAGE_SCHEDULE_START && HERITAGE_WEEKDAYS.has(k % 7));

// The heritage place for day k: never one dealt inside the no-repeat year
// (by name — the 100km proximity rule is skipped here, since most heritage
// sites cluster in Israel), preferring one not near anything from the last
// 30 days. Seeded, so every player gets the same place.
function pickHeritage(k, pool, window) {
  const days = k >= DAILY_HERITAGE_START ? HERITAGE_WINDOW : windowDaysFor(k);
  const blocked = new Set();
  const recent = [];
  for (const w of window) {
    if (w.n < k - (days - 1)) continue;
    for (const l of w.picks) blocked.add(l.name);
    if (w.n >= k - 29) recent.push(...w.picks);
  }
  const open = pool.filter((l) => tagsFor(l).has('jewish') && !blocked.has(l.name));
  if (!open.length) return null;
  const fresh = open.filter((l) => !nearAny(l, recent));
  const from = fresh.length ? fresh : open;
  return from[Math.floor(mulberry32(k * 7907 + 101)() * from.length)];
}

// From puzzle #34 the window also excludes anything within NEAR_KM of a recent
// pick: "Bosporus Strait" and "Istanbul" are different names for the same spot
// on the globe, and a player experiences that as a repeat. Gated by puzzle
// number so no already-dealt day changes.
const PROXIMITY_START = 34;
const NEAR_KM = 100;

function nearAny(loc, picks) {
  for (const q of picks) {
    if (Math.abs(loc.lat - q.lat) > 0.91) continue; // > ~101km of latitude alone: can't be near
    if (distanceKm(loc.lat, loc.lng, q.lat, q.lng) < NEAR_KM) return true;
  }
  return false;
}

function continentCount(picks) {
  return new Set(picks.map((l) => l.continent).filter(Boolean)).size;
}

export function injectNewsIntoDeal(base, entry) {
  if (!entry) return { picks: base, slot: null, reason: 'no-entry' };
  const order = [entry.slot, 0, 1, 2, 3, 4].filter((slot, i, a) => Number.isInteger(slot) && slot >= 0 && slot < 5 && a.indexOf(slot) === i);
  const minContinents = Math.min(3, continentCount(base));
  for (const slot of order) {
    const others = base.filter((_, i) => i !== slot);
    if (entry.country && others.some((l) => l.country === entry.country)) continue;
    if (others.some((l) => distanceKm(entry.lat, entry.lng, l.lat, l.lng) < NEAR_KM)) continue;
    const candidate = base.slice();
    candidate[slot] = { ...entry, isNews: true };
    if (continentCount(candidate) < minContinents) continue;
    return { picks: candidate, slot, reason: slot === entry.slot ? 'injected' : 'slot-fallback' };
  }
  return { picks: base, slot: null, reason: 'deal-invariant' };
}

export function dailyPicksFor(n) {
  if (n < NO_REPEAT_START) return pickLocations(n);
  if (dailyPickCache.has(n)) return dailyPickCache.get(n);

  // Seed the window with the fixed pre-regime days that fall inside it.
  const window = [];
  for (let k = Math.max(1, NO_REPEAT_START - (NO_REPEAT_WINDOW - 1)); k < NO_REPEAT_START; k++) {
    window.push({ n: k, picks: pickLocations(k) });
  }
  let picks = null;
  for (let k = NO_REPEAT_START; k <= n; k++) {
    if (dailyPickCache.has(k)) {
      picks = dailyPickCache.get(k);
    } else {
      const days = windowDaysFor(k);
      const exclude = new Set();
      const recent = [];
      for (const w of window) {
        if (w.n >= k - (days - 1)) for (const l of w.picks) { exclude.add(l.name); recent.push(l); }
      }
      // Heritage places leave the general pool (they are dealt only through the
      // schedule below). This must happen BEFORE the proximity starvation guard,
      // or the guard undercounts and pickLocations drops every exclusion.
      if (k >= HERITAGE_SCHEDULE_START) {
        for (const l of poolForPuzzle(k)) if (tagsFor(l).has('jewish')) exclude.add(l.name);
      }
      if (k >= PROXIMITY_START && k < YEAR_WINDOW_START) {
        for (const l of poolForPuzzle(k)) if (!exclude.has(l.name) && nearAny(l, recent)) exclude.add(l.name);
      } else if (k >= YEAR_WINDOW_START) {
        // Name exclusions are the hard no-repeat contract; the proximity pass is
        // best-effort on top and is skipped (or discarded) whenever it would
        // starve pickLocations into dropping the whole exclusion set.
        const pool = poolForPuzzle(k);
        if (pool.length - exclude.size >= 140) {
          const withProx = new Set(exclude);
          for (const l of pool) if (!withProx.has(l.name) && nearAny(l, recent)) withProx.add(l.name);
          if (pool.length - withProx.size >= 40) for (const name of withProx) exclude.add(name);
        }
      }
      // Starts Sep 12, 2026: preserve today's already-dealt game and history.
      const balanced = k >= 53;
      let theme = balanced ? null : themeForPuzzle(k);
      if (theme) {
        const avail = poolForPuzzle(k).filter((l) => !exclude.has(l.name) && tagsFor(l).has(theme.key)).length;
        if (avail < THEME_MIN_POOL) theme = null;
      }
      let opts = balanced ? { balanced: true } : theme ? { preferTag: theme.key } : {};
      if (k >= HERITAGE_SCHEDULE_START) {
        // Heritage places are dealt ONLY through the schedule, so the pool lasts
        // the full no-repeat year instead of draining one-a-day.
        const reserved = isHeritageDay(k) ? pickHeritage(k, poolForPuzzle(k), window) : null;
        opts = { ...opts, scheduled: true, reserved };
      }
      picks = pickLocations(k, exclude, opts);
      const news = k >= NEWS_START ? NEWS.find((entry) => entry.pn === k) : null;
      if (news && (news.force || newsRollFor(k))) {
        const keepsHeritage = (c) => !picks.some((l) => tagsFor(l).has('jewish')) || c.some((l) => tagsFor(l).has('jewish'));
        let candidate = injectNewsIntoDeal(picks, news).picks;
        // A heritage day keeps its heritage slot: steer the news round into
        // another slot rather than dropping the news (or the heritage place).
        if (k >= HERITAGE_SCHEDULE_START && !keepsHeritage(candidate)) {
          candidate = picks;
          for (const slot of [news.slot, 0, 1, 2, 3, 4]) {
            const r = injectNewsIntoDeal(picks, { ...news, slot });
            if (r.slot !== null && keepsHeritage(r.picks)) { candidate = r.picks; break; }
          }
        }
        if (!balanced || (candidate.filter((l) => tagsFor(l).has('water')).length <= 2 && keepsHeritage(candidate))) picks = candidate;
      }
      dailyPickCache.set(k, picks);
      dailyThemeCache.set(k, theme);
    }
    window.push({ n: k, picks });
    while (window.length > YEAR_WINDOW) window.shift();
  }
  return picks;
}

export function newsDecisionFor(n) {
  const entry = n >= NEWS_START ? NEWS.find((item) => item.pn === n) : null;
  const roll = newsRollFor(n);
  if (!entry) return { pn: n, roll, entry: false, injected: false, reason: 'no-entry' };
  if (!roll && !entry.force) return { pn: n, roll, entry: true, injected: false, reason: 'off-roll' };
  const pick = dailyPicksFor(n).find((loc) => loc.isNews && loc.name === entry.name);
  return { pn: n, roll, entry: true, injected: !!pick, reason: pick ? 'injected' : 'deal-invariant' };
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
  // v3 migration (2026-09-05): the family voted day/night lighting off. Wipe the
  // value once so devices that stored the old ON default flip back to daytime;
  // anyone who re-enables it afterward saves v3 and keeps their choice.
  if (stored.v < 3) {
    delete stored.realisticLighting;
    stored.v = 3;
    saveJSON('settings', stored);
  }
  // v4 migration (2026-11-07): the family asked for Hatikvah as the game music.
  // Clear any old genre pick once so every device switches; a later manual
  // pick saves v4 and sticks.
  if (stored.v < 4) {
    delete stored.musicStyle;
    stored.v = 4;
    saveJSON('settings', stored);
  }
  return Object.assign(
    { miles: false, sound: true, music: true, musicStyle: 'hatikvah', autoRotate: true, realisticLighting: false, v: 4 },
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
  const news = rounds.some((r) => r.isNews || r.target?.isNews) ? ' 📰' : '';
  return `${title}${news} 🌍 ${total}/${MAX_GAME_SCORE}\n${emojis}`;
}

// Multiplier for a given 0-based round index (shared by UI + reconstruction).
export function multiplierForRound(i) { return ROUND_MULTIPLIERS[i] || 1; }

// ---------- game state machine ----------

export const FAMILY_ROUND_MULTIPLIER = 2;

export class GameSession {
  // opts.locations: an explicit deal (a replayed prior day, or the five places
  // carried in a head-to-head link). opts.replayOf / opts.challenge are labels
  // the UI reads; a session with either is always isPractice (never recorded).
  constructor(seed, isPractice, excludeNames = null, opts = {}) {
    this.seed = seed;
    this.isPractice = isPractice;
    this.replayOf = opts.replayOf || null;
    this.challenge = opts.challenge || null;
    // Dailies use the deterministic 30-day no-repeat chain; practice uses the
    // raw pick with the caller's local exclusions.
    this.locations = opts.locations ? opts.locations.slice() : (isPractice ? pickLocations(seed, excludeNames) : dailyPicksFor(seed));
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
    result.precisionBonus = landmarkBonus(target, result.distanceKm);
    this.results.push(result);
    return result;
  }

  nextRound() { this.roundIndex++; }
}
