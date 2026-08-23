// Themed days. MapTap's dailies became themed "story" days; ours draw at least
// three of the five places from one tag on themed puzzles, with Jewish
// holidays (and a few world days) pinned on the calendar. Tags are derived
// from each location's name/country plus the pack it shipped in, so the
// 400+ entries need no per-row edits.

import { LOCATIONS } from './locations.js';
import { mulberry32 } from './rng.js';

export const THEMES = {
  jewish:   { title: 'Jewish heritage',          emoji: '🕎', blurb: 'Five places from 3,000 years of Jewish history.' },
  water:    { title: 'Rivers, lakes & straits',  emoji: '🌊', blurb: 'Famous waterways — find them by the shape of the shore.' },
  wonder:   { title: 'Wonders of the world',     emoji: '🏛️', blurb: 'Five of the planet\'s great marvels, natural and built.' },
  ancient:  { title: 'The ancient world',        emoji: '🏺', blurb: 'Ruins and temples from the dawn of civilisation.' },
  island:   { title: 'Islands',                  emoji: '🏝️', blurb: 'Five specks of land surrounded by water. Good luck.' },
  mountain: { title: 'Mountains',                emoji: '⛰️', blurb: 'The high places — peaks, passes and ranges.' },
};

// Pack index ranges (locations.js is append-only, so these are stable).
const RANGES = {
  // EXPANSION 5 (historical sites) + EXPANSION 6 (famous lives). Bounded, not
  // open-ended: an open upper edge silently tags whatever ships next.
  jewish: [[256, 291], [379, 452]],
  water: [[332, 378]],
  wonder: [[292, 331]],
};
const RULES = {
  water: /Falls|Lake|Loch|Strait|Canal|Bay\b|Delta|River|Fjord|Sound|Lagoon|Reef|Gorge|Sea\b/i,
  wonder: /Pyramid|Great Wall|Machu|Petra|Taj Mahal|Colosseum|Christ the Redeemer|Chichen|Angkor|Stonehenge|Grand Canyon|Uluru|Niagara|Victoria Falls|Iguazu|Eiffel|Acropolis/i,
  ancient: /Ancient|Ruins|Temple|Roman|Tel |Pompeii|Acropolis|Pyramid|Petra|Angkor|Megiddo|Colosseum|Persepolis|Ephesus|Karnak|Luxor|Stonehenge|Machu|Chichen|Teotihuac|Tikal|Borobudur|Bagan|Masada|Caesarea|Beit She|Sardis|Qumran|Mosaic|Sepphoris/i,
  island: /Island|Isle|Bora Bora|Maldives|Santorini|Bali|Fiji|Tahiti|Azores|Gal[aá]pagos|Madeira|Capri|Skye|Lofoten|Jeju|Komodo|Djerba|Cura[cç]ao|Rhodes|Crete|Sicily|Iceland|Zanzibar|Hawaii|Easter/i,
  mountain: /Mount|Mt\.|Peak|Alps|Everest|Kilimanjaro|Matterhorn|Elbrus|Ararat|Aconcagua|Jungfrau|Annapurna|Denali|Fuji|Machtesh|Makhtesh|Simien|Crater|Table Mountain|Rockies|Andes|Himalaya|Caucasus|Golan|Dolomites|Pass\b/i,
};

const indexByName = new Map(LOCATIONS.map((l, i) => [l.name, i]));

export function tagsFor(loc) {
  const i = indexByName.get(loc.name);
  const tags = new Set();
  for (const [tag, ranges] of Object.entries(RANGES)) {
    if (i !== undefined && ranges.some(([a, b]) => i >= a && i <= b)) tags.add(tag);
  }
  if (loc.country === 'Israel') tags.add('jewish');
  for (const [tag, re] of Object.entries(RULES)) if (re.test(loc.name)) tags.add(tag);
  return tags;
}

// Calendar overrides (Gregorian dates of the holiday day itself).
const CALENDAR = {
  '2026-09-12': 'jewish', '2026-09-13': 'jewish', // Rosh Hashanah 5787
  '2026-09-21': 'jewish',                           // Yom Kippur
  '2026-09-26': 'jewish',                           // Sukkot
  '2026-10-04': 'jewish',                           // Simchat Torah
  '2026-12-05': 'jewish', '2026-12-12': 'jewish',   // Hanukkah, first + last day
  '2027-01-23': 'jewish',                           // Tu BiShvat
  '2027-03-23': 'jewish',                           // Purim
  '2027-04-22': 'jewish',                           // Pesach
  '2027-05-04': 'jewish',                           // Yom HaShoah
  '2027-05-12': 'jewish',                           // Yom HaAtzmaut
  '2027-06-11': 'jewish',                           // Shavuot
  '2027-04-22': 'jewish',
  '2026-09-22': 'water',                            // World Rivers Day (4th Sunday of Sep, approx.)
  '2027-03-22': 'water',                            // World Water Day
  '2027-04-22': 'wonder',                           // Earth Day
  '2026-12-11': 'mountain',                         // International Mountain Day
};
// Earth Day and Pesach collide in 2027 — the holiday wins.
CALENDAR['2027-04-22'] = 'jewish';

const THEME_START = 34; // puzzles before this were dealt untitled; never re-deal them
const EPOCH = new Date(2026, 6, 22);

export function dateForPuzzle(n) {
  const d = new Date(EPOCH);
  d.setDate(d.getDate() + (n - 1));
  return d;
}
function keyFor(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns { key, title, emoji, blurb, pinned } or null for a mixed day.
export function themeForPuzzle(n) {
  if (n < THEME_START) return null;
  const pinned = CALENDAR[keyFor(dateForPuzzle(n))];
  if (pinned) return { key: pinned, pinned: true, ...THEMES[pinned] };
  const rng = mulberry32(n * 31 + 7);
  if (rng() >= 0.36) return null; // roughly every third day is themed
  const keys = Object.keys(THEMES);
  const key = keys[Math.floor(rng() * keys.length)];
  return { key, pinned: false, ...THEMES[key] };
}
