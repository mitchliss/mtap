// MarcTap game logic: daily round selection, scoring, persistence, share text.

import { LOCATIONS } from './locations.js';
import { distanceKm, countryAt } from './geo.js';
import { mulberry32, seededShuffle, puzzleNumberForToday, todayKey } from './rng.js';

export const ROUNDS_PER_GAME = 5;
export const MAX_ROUND_SCORE = 100;
export const MAX_GAME_SCORE = ROUNDS_PER_GAME * MAX_ROUND_SCORE;

// ---------- round selection ----------

// Deterministic daily pick: 5 locations, easy -> hard, no repeated country,
// at least 3 different continents.
export function pickLocations(seed) {
  const rng = mulberry32(seed * 7919 + 13);
  const shuffled = seededShuffle(LOCATIONS, rng);
  const wantDiff = [1, 1, 2, 2, 3]; // ramp difficulty across the game
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

// Within 50 km -> perfect 100.  Beyond that an exponential decay capped at 80,
// with floors for landing in the right country (30) or continent (10).
export function scoreGuess(guessLat, guessLng, target) {
  const d = distanceKm(guessLat, guessLng, target.lat, target.lng);
  let score;
  let bullseye = false;
  if (d <= 50) {
    score = MAX_ROUND_SCORE;
    bullseye = true;
  } else {
    score = Math.round(80 * Math.exp(-(d - 50) / 1250));
  }

  const guessCountry = countryAt(guessLat, guessLng);
  let countryMatch = false;
  let continentMatch = false;
  if (!bullseye && guessCountry) {
    if (target.country && guessCountry.name === target.country) {
      countryMatch = true;
      score = Math.max(score, 30);
    } else if (target.continent && guessCountry.continent === target.continent) {
      continentMatch = true;
      score = Math.max(score, 10);
    }
  }

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
  get totalScore() { return this.results.reduce((a, r) => a + r.score, 0); }
  get isOver() { return this.roundIndex >= this.locations.length; }

  submitGuess(lat, lng) {
    const target = this.currentLocation;
    const result = scoreGuess(lat, lng, target);
    result.target = target;
    result.guess = { lat, lng };
    this.results.push(result);
    return result;
  }

  nextRound() { this.roundIndex++; }
}
