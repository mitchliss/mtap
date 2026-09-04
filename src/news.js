// Append-only scheduled news locations. Entries are committed before their day.
import { mulberry32 } from './rng.js';

export const NEWS_START = 44;
export const NEWS = [];

export function newsRollFor(pn) {
  return mulberry32(pn * 17 + 3)() < 0.40;
}
