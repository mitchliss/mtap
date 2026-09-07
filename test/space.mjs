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
  const before = space.planets.map(({ item }) => item.getWorldPosition(new THREE.Vector3()));
  const projected = before.map((point) => point.clone().project(camera));
  const matrices = space.asteroids.instanceMatrix.array.slice();
  const cometPositions = space.comets.map((item) => item.position.clone());
  camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  camera.aspect *= 0.9; camera.updateProjectionMatrix();
  space.update(0, camera); scene.updateMatrixWorld(true);
  space.planets.forEach(({ item }, i) => {
    const world = item.getWorldPosition(new THREE.Vector3());
    assert.ok(world.distanceTo(before[i]) < 1e-9, 'orbit/resize cannot move a planet in world space');
    assert.ok(world.clone().project(camera).distanceTo(projected[i]) > 0.05,
      'spinning Earth must move planets across the screen');
    assert.ok(world.length() > 30 && world.length() < 60);
  });
  assert.deepEqual(space.asteroids.instanceMatrix.array, matrices, 'camera cannot drag the asteroid belt');
  space.comets.forEach((item, i) => assert.ok(item.position.equals(cometPositions[i]), 'camera cannot drag comets'));
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
console.log('PASS space visibility, world anchoring and orbit parallax across phone/landscape viewports, finite instances, reduced motion and disposal');
