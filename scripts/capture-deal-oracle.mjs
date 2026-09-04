import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dailyPicksFor } from '../src/game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(root, 'test', 'fixtures', 'deals-through-43.json');
const actual = Object.fromEntries(
  Array.from({ length: 43 }, (_, i) => {
    const pn = i + 1;
    return [pn, dailyPicksFor(pn).map((loc) => loc.name)];
  }),
);
const serialized = `${JSON.stringify(actual, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const expected = await readFile(fixturePath, 'utf8');
  if (expected !== serialized) {
    console.error(`FAIL deal oracle differs: ${path.relative(root, fixturePath)}`);
    process.exitCode = 1;
  } else {
    console.log('PASS deal oracle: puzzles 1..43 are byte-identical');
  }
} else {
  await mkdir(path.dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, serialized, 'utf8');
  console.log(`Captured ${path.relative(root, fixturePath)}`);
}
