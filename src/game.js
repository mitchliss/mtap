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

// Deterministic daily pick: 5 locations, easy -> hard, no repeated country,
// at least 3 different continents.
export function pickLocations(seed) {
  const rng = mulberry32(seed * 7919 + 13);
  const shuffled = seededShuffle(LOCATIONS, rng);
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

export function practiceSeed() {
  return (Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9);
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
  if (score >= 70) return '🔥';
  if (score >= 40) return '👍';
  if (score >= 15) return '🤏';
  return '🌍';
}

export function verdictForResult(r) {
  if (r.bullseye) return '🎯 Bullseye! Incredible.';
  if (r.score >= 70) return '🔥 So close — great geography!';
  if (r.countryMatch) return '🗺️ Right country! Nice.';
  if (r.score >= 40) return '👍 Solid guess.';
  if (r.continentMatch) return '🌎 Right continent, at least!';
  if (r.score >= 15) return '🤏 In the neighborhood… sort of.';
  return '🌍 The world is a big place!';
}

// ---------- persistence ----------

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
  return Object.assign(
    { miles: false, doubleTap: true, sound: true, autoRotate: true },
    loadJSON('settings', {})
  );
}
export function saveSettings(s) { saveJSON('settings', s); }

export function loadHistory() { return loadJSON('history', {}); }

export function recordDailyResult(puzzleNumber, rounds, total) {
  const history = loadHistory();
  history[puzzleNumber] = { date: todayKey(), total, rounds };
  saveJSON('history', history);
  return history;
}

export function dailyAlreadyPlayed(puzzleNumber) {
  const history = loadHistory();
  return history[puzzleNumber] || null;
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
  const title = isPractice ? 'MarcTap practice' : `MarcTap #${puzzleNumber}`;
  return `${title} 🌍 ${total}/${MAX_GAME_SCORE}\n${emojis}`;
}

// Multiplier for a given 0-based round index (shared by UI + reconstruction).
export function multiplierForRound(i) { return ROUND_MULTIPLIERS[i] || 1; }

// ---------- game state machine ----------

export class GameSession {
  constructor(seed, isPractice) {
    this.seed = seed;
    this.isPractice = isPractice;
    this.locations = pickLocations(seed);
    this.roundIndex = 0;
    this.results = [];
  }

  get currentLocation() { return this.locations[this.roundIndex]; }
  get currentMultiplier() { return ROUND_MULTIPLIERS[this.roundIndex] || 1; }
  get totalScore() { return this.results.reduce((a, r) => a + r.points, 0); }
  get isOver() { return this.roundIndex >= this.locations.length; }

  submitGuess(lat, lng) {
    const target = this.currentLocation;
    const result = scoreGuess(lat, lng, target);
    result.target = target;
    result.guess = { lat, lng };
    // score = base accuracy 0-100; points = score x round multiplier (what totals up).
    result.multiplier = this.currentMultiplier;
    result.points = result.score * result.multiplier;
    this.results.push(result);
    return result;
  }

  nextRound() { this.roundIndex++; }
}
