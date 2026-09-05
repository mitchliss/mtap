// Append-only scheduled news locations. Entries are committed before their day.
import { mulberry32 } from './rng.js';

export const NEWS_START = 44;
export const NEWS = [
  {
    pn: 47,
    slot: 2,
    name: 'Mount Sinabung',
    prompt: 'Volcano erupts for the first time in five years in North Sumatra',
    lat: 3.1696,
    lng: 98.3930,
    country: 'Indonesia',
    continent: 'Asia',
    diff: 2,
    fact: 'Mount Sinabung sent an ash column roughly 3,500 meters above its summit after lying quiet for five years, prompting the evacuation of hundreds of nearby residents.',
  },
];

export function newsRollFor(pn) {
  return mulberry32(pn * 17 + 3)() < 0.40;
}
