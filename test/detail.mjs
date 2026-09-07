import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TileDetail, detailFade } from '../src/tiledetail.js';

const context = () => ({ drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillRect() {},
  createLinearGradient: () => ({ addColorStop() {} }) });
const canvas = () => ({ width: 0, height: 0, getContext: () => context() });
globalThis.document = { createElement: canvas };
const region = { west: -8, east: 8, south: 38, north: 52 };
function fixture() {
  const detail = Object.create(TileDetail.prototype);
  const camera = new THREE.PerspectiveCamera(45, 390 / 664, 0.001, 100);
  camera.position.set(1.1, 0, 0); camera.lookAt(0, 0, 0);
  Object.assign(detail, {
    globe: { camera, scene: new THREE.Scene(), applySunShader() {}, renderer: {
      initTexture() {}, capabilities: { getMaxAnisotropy: () => 8 } } },
    geojson: { features: [] }, patchLevel: 0, generation: 1, timings: {},
    canvasPool: Array.from({ length: 3 }, () => ({ canvas: canvas(), owned: false })),
    enabled: true, mesh: null, prev: null, pendingFinal: null, building: false,
    lastCamPos: camera.position.clone(), stillFor: 1, builtAlt: null,
    lastBuildStarted: -Infinity, lastRegionKey: '', _retired: [], fadeT: 0,
    cache: new Map(), cacheBytes: 0, hostIdx: 0,
  });
  return detail;
}

// Real patch builder with controllable decodes: no network/GPU required.
const detail = fixture();
let active = 0, peak = 0;
detail._loadTile = async () => {
  active++; peak = Math.max(active, peak);
  await new Promise((resolve) => setTimeout(resolve, 1));
  active--; return {};
};
await detail._buildPatch(region, 1, { key: 'built', alt: 0.1 });
assert.equal(peak, 6, 'tile decode concurrency is bounded');
assert.equal(detail.lastRegionKey, '', 'uncommitted work must not suppress retries');
detail.gestureActive = true;
detail.pendingFinal(); detail.pendingFinal = null;
assert.ok(detail.mesh, 'ready detail installs during a pinch');
assert.equal(detail.lastRegionKey, 'built');
detail.enabled = null; // fade only; do not schedule another build
detail.update(0.1);
assert.ok(detail.mesh.material.opacity > 0 && detail.mesh.material.opacity < 0.2, 'first patch eases in');
detail.update(0.5);
assert.equal(detail.mesh.material.opacity, 1);
assert.equal(detailFade(0), 0); assert.equal(detailFade(1), 1);
assert.ok(detailFade(0.01) < 0.001, 'fade starts gently');
await detail._buildPatch(region, 1, { key: 'replacement', alt: 0.1 });
detail.update(0.1);
assert.equal(detail.meshCount(), 2, 'outgoing imagery stays underneath during fade');
assert.equal(detail.prev.material.opacity, 1);
detail.update(0.5);
assert.equal(detail.meshCount(), 1);
assert.equal(detail.canvasPool.filter((item) => item.owned).length, 1, 'old patch canvas is reclaimed');

// Repeated mid-resample cancellation used to exhaust all three canvases.
const canceled = fixture();
canceled._loadTile = async () => ({});
for (let i = 0; i < 5; i++) {
  for (const item of canceled.canvasPool) item.canvas.getContext = () => ({ ...context(), drawImage() { canceled.generation++; } });
  await assert.rejects(canceled._buildPatch(region, canceled.generation), /cancelled/);
  assert.equal(canceled.canvasPool.filter((item) => item.owned).length, 0);
}
const ready = fixture(); ready._loadTile = async () => ({});
await ready._buildPatch(region, 1);
ready.cancel();
assert.equal(ready.pendingFinal, null);
assert.equal(ready.canvasPool.filter((item) => item.owned).length, 0);

// Gesture start preserves useful work; update can build before fingers lift.
const moving = fixture();
moving.gestureStart();
assert.equal(moving.generation, 1);
moving._visibleRegion = () => region;
let builds = 0;
moving._buildPatch = async () => { builds++; };
moving.update(1 / 60);
assert.equal(builds, 1);
await new Promise((resolve) => setTimeout(resolve, 0));

// Failed fetches must not consume cache budget forever.
const failed = fixture();
globalThis.createImageBitmap = async () => ({});
globalThis.fetch = async () => { throw new Error('offline'); };
for (let i = 0; i < 3; i++) await assert.rejects(failed._loadTile(3, i, 1), /offline/);
assert.equal(failed.cacheBytes, 0); assert.equal(failed.cache.size, 0);
console.log('PASS detail streaming: six-worker fetch, progressive gesture upload, eased fade, cancellation recovery, failed-fetch cache accounting');
