import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Globe, latLngToVec3 } from '../src/globe.js';
import { trackViewport } from '../src/viewport.js';

// Exercise production picking and placement without requiring a GPU. The
// rendered tip must project back onto the finger, including after toolbar moves.
let checks = 0;
for (const [width, height, top] of [[390, 664, 0], [390, 844, 47], [375, 548, 80], [844, 390, 0]]) {
  for (const distance of [1.0001, 1.001, 1.04, 1.1, 2.9]) {
    for (const [lat, lng] of [[0, 0], [41, -87], [-33, 151], [78, 30]]) {
      const globe = Object.create(Globe.prototype);
      const rect = { left: 9, top, width, height };
      const canvas = new EventTarget();
      canvas.getBoundingClientRect = () => rect;
      canvas.setPointerCapture = canvas.releasePointerCapture = () => {};
      globe.renderer = { domElement: canvas };
      globe._rect = { left: 0, top: 0, width: 390, height: 844 }; // deliberately stale
      globe.camera = new THREE.PerspectiveCamera(45, width / height, 0.000001, 100);
      globe.camera.position.copy(latLngToVec3(lat, lng, distance));
      globe.camera.lookAt(0, 0, 0);
      globe.pointer = new THREE.Vector2();
      globe.raycaster = new THREE.Raycaster();
      globe.pin = new THREE.Sprite();
      globe.pinDot = new THREE.Mesh();
      globe.container = { classList: { add() {}, remove() {} } };
      globe._activePointers = new Map();
      globe.interactive = true;
      let tapped = null, dragged = null;
      globe.cb = { onTap: (lat, lng) => { tapped = { lat, lng }; },
        onPinDragged: (lat, lng) => { dragged = { lat, lng }; } };
      globe._bindPointerEvents();
      const touch = (type, fx, fy) => {
        const event = new Event(type);
        Object.assign(event, { pointerId: 1, pointerType: 'touch',
          clientX: rect.left + width * fx, clientY: top + height * fy });
        canvas.dispatchEvent(event);
      };
      touch('pointerdown', 0.5, 0.5);
      touch('pointerup', 0.5, 0.5);
      assert.ok(tapped, 'touch tap reaches game callback');
      assert.deepEqual(tapped, globe.getPin());
      globe.pin.updateMatrixWorld();
      touch('pointerdown', 0.5, 0.5);
      touch('pointermove', 0.55, 0.6);
      touch('pointerup', 0.55, 0.6);
      assert.ok(dragged, 'touch drag reaches game callback');
      assert.deepEqual(dragged, globe.getPin());
      for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.3], [0.7, 0.7], [0.4, 0.65]]) {
        const x = rect.left + width * fx, y = top + height * fy;
        const hit = globe._globeHitXY(x, y);
        if (!hit) { assert.ok(distance > 2, 'deep zoom must hit'); continue; }
        globe._placePin(hit.lat, hit.lng);
        for (const marker of [globe.pin, globe.pinDot]) {
          const p = marker.position.clone().project(globe.camera);
          const error = Math.hypot(rect.left + (p.x + 1) * width / 2 - x, top + (1 - p.y) * height / 2 - y);
          assert.ok(error < 0.01, `tap offset ${error}px at distance ${distance}`);
          checks++;
        }
        assert.ok(globe.pinDot.scale.x * 0.006 < globe.pin.scale.x * 0.1, 'contact dot stays small');
      }
    }
  }
}
const listeners = new Map(), values = new Map();
const viewport = { height: 664, offsetTop: 0,
  addEventListener: (event, fn) => listeners.set(event, fn),
  removeEventListener: (event) => listeners.delete(event) };
const cleanup = trackViewport({ visualViewport: viewport }, { style: { setProperty: (key, value) => values.set(key, value) } });
assert.equal(values.get('--viewport-height'), '664px');
viewport.height = 548; viewport.offsetTop = 80;
listeners.get('resize')();
assert.equal(values.get('--viewport-height'), '548px');
assert.equal(values.get('--viewport-top'), '80px');
viewport.offsetTop = 24;
listeners.get('scroll')();
assert.equal(values.get('--viewport-top'), '24px');
cleanup(); assert.equal(listeners.size, 0);
assert.doesNotThrow(() => trackViewport({}, {})());
console.log(`PASS ${checks} pin projections across zooms, latitudes and mobile viewports; viewport resize/scroll lifecycle`);
