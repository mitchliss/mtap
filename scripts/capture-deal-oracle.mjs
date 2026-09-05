import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dailyPicksFor } from '../src/game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Every fixture is immutable once captured: each one pins the deals that were
// live through its last puzzle, so any dealer change must reproduce ALL of them.
const FIXTURES = [43, 47];

function serialize(last) {
  const actual = Object.fromEntries(
    Array.from({ length: last }, (_, i) => {
      const pn = i + 1;
      return [pn, dailyPicksFor(pn).map((loc) => loc.name)];
    }),
  );
  return `${JSON.stringify(actual, null, 2)}\n`;
}

let failed = false;
for (const last of FIXTURES) {
  const fixturePath = path.join(root, 'test', 'fixtures', `deals-through-${last}.json`);
  const serialized = serialize(last);
  if (process.argv.includes('--check')) {
    const expected = await readFile(fixturePath, 'utf8');
    if (expected !== serialized) {
      console.error(`FAIL deal oracle differs: ${path.relative(root, fixturePath)}`);
      failed = true;
    } else {
      console.log(`PASS deal oracle: puzzles 1..${last} are byte-identical`);
    }
  } else {
    await mkdir(path.dirname(fixturePath), { recursive: true });
    await writeFile(fixturePath, serialized, 'utf8');
    console.log(`Captured ${path.relative(root, fixturePath)}`);
  }
}
if (failed) process.exitCode = 1;
