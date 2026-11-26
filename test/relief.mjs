// Shaded relief (v5.7).
import assert from 'node:assert/strict';
import { hillshade } from '../src/relief.js';

let passed = 0;
function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); passed++; }
  catch (error) { console.error(`FAIL ${name}\n${error.stack || error}`); process.exitCode = 1; }
}
const W = 64, H = 32;
const grid = (f) => { const a = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = f(x, y); return a; };
const at = (img, x, y) => img[(y * W + x) * 4];

test('sea and flat ground stay neutral grey (overlay leaves them alone)', () => {
  assert.equal(at(hillshade(grid(() => 0), W, H), 10, 10), 128);
  assert.equal(at(hillshade(grid(() => 120), W, H), 10, 10), 128);
});
test('light from the north-west: a slope facing west is bright, facing east is dark', () => {
  const ridge = grid((x) => Math.max(1, 200 - Math.abs(x - 32) * 12));
  const img = hillshade(ridge, W, H, { exaggeration: 1500 }); // a 64-px world is ~600 km a pixel
  assert.ok(at(img, 28, 16) > 140, `west face ${at(img, 28, 16)}`);
  assert.ok(at(img, 36, 16) < 116, `east face ${at(img, 36, 16)}`);
});
test('wraps across the date line without a seam', () => {
  const img = hillshade(grid(() => 100), W, H);
  assert.equal(at(img, 0, 10), 128); assert.equal(at(img, W - 1, 10), 128);
});
test('a full 2048 x 1024 shade is quick enough to run at boot', () => {
  const big = new Uint8Array(2048 * 1024).map((_, i) => (i * 7919) % 256);
  const t = performance.now(); hillshade(big, 2048, 1024);
  const ms = performance.now() - t;
  assert.ok(ms < 400, `${Math.round(ms)} ms`);
  console.log(`  2048x1024 hillshade: ${Math.round(ms)} ms`);
});
console.log(`\n${passed} relief tests passed`);
