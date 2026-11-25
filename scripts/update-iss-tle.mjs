// Refresh public/data/iss-tle.txt, the offline fallback for Live Earth's Space Station
// (the game normally fetches fresh elements from CelesTrak itself, at most every 12 h).
// Usage: node scripts/update-iss-tle.mjs
import { writeFile } from 'node:fs/promises';
import { ISS_TLE_URL, satrecFromTle } from '../src/live.js';

const text = (await (await fetch(ISS_TLE_URL)).text()).replace(/\r/g, '');
if (!satrecFromTle(text)) { console.error('CelesTrak did not return a valid ISS TLE:\n' + text); process.exit(1); }
await writeFile(new URL('../public/data/iss-tle.txt', import.meta.url), text.trimEnd() + '\n');
console.log('Updated public/data/iss-tle.txt\n' + text.trim());
