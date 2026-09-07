import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpaceScenery, spaceVisibility } from '../src/space.js';

// Canvas painting is inspected in the browser; exercise scene transforms,
// visibility and resource lifecycle here without a GPU.
const context = new Proxy({}, { get: (_, key) => key.startsWith('create')
  ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => context }) };
const scene = new THREE.Scene();
const space = new SpaceScenery(scene);
assert.equal(spaceVisibility(1.04), 0);
assert.equal(spaceVisibility(2.9), 0);
assert.equal(spaceVisibility(8.5), 1);
let previous = 0;
for (let d = 3.4; d < 8.5; d += 0.01) {
  const current = spaceVisibility(d);
  assert.ok(current >= previous && current <= 1); previous = current;
}
for (const aspect of [390 / 664, 664 / 390, 16 / 9]) {
  const camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 100);
  camera.position.set(2, 3, 4).setLength(8.5); camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  space.update(0.016, camera); scene.updateMatrixWorld(true);
  for (const { item } of space.planets) {
    const point = item.getWorldPosition(new THREE.Vector3()).project(camera);
    assert.ok(Math.abs(point.x) < 0.85 && Math.abs(point.y) < 0.85);
    assert.ok(point.z > 0 && point.z < 1, 'planet stays inside camera depth range');
  }
  for (let i = 0; i < space.asteroids.count; i++) {
    const matrix = new THREE.Matrix4(); space.asteroids.getMatrixAt(i, matrix);
    assert.ok(matrix.elements.every(Number.isFinite));
  }
  const time = space.time;
  space.reducedMotion = { matches: true }; space.update(1, camera);
  assert.equal(space.time, time, 'reduced motion freezes drifting objects');
  camera.position.setLength(1.04); space.update(0.016, camera);
  assert.equal(space.group.visible, false, 'close gameplay hides extra scenery');
}
let disposed = 0;
space.materials.forEach((mat) => mat.addEventListener('dispose', () => disposed++));
space.dispose();
assert.equal(disposed, space.materials.length);
assert.equal(scene.children.length, 0);
console.log('PASS space visibility, phone/landscape framing, finite instances, reduced motion and disposal');
