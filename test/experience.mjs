import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { bearingWord, guessRelationship, nearbyCities, shortStory } from '../src/discovery.js';
import { Globe, latLngToVec3 } from '../src/globe.js';

assert.equal(bearingWord({ lat: 0, lng: 0 }, { lat: 20, lng: 0 }), 'north');
assert.equal(bearingWord({ lat: 0, lng: 179 }, { lat: 0, lng: -179 }), 'east');
assert.equal(bearingWord({ lat: 0, lng: -179 }, { lat: 0, lng: 179 }), 'west');
assert.match(guessRelationship({ lat: -10, lng: -10 }, { lat: 0, lng: 0 }), /southwest/);
assert.match(guessRelationship({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), /within 1 km/);
assert.match(guessRelationship({ lat: 0, lng: 180 }, { lat: 0, lng: 0 }), /opposite/);
const data = JSON.parse(await readFile('public/data/cities.json', 'utf8'));
assert.ok(data.cities.length > 1000);
const paris = nearbyCities({ lat: 48.8584, lng: 2.2945 }, data.cities);
assert.equal(paris[0].name, 'Paris');
assert.ok(paris.every((c, i) => c.distance < 900 && (!i || c.distance >= paris[i - 1].distance)));
assert.equal(shortStory('First sentence. Second sentence. Third sentence.'), 'First sentence. Second sentence.');
assert.ok(shortStory('word '.repeat(150)).length <= 440);

for (const distance of [1.04, 1.5, 3]) {
  const globe = Object.create(Globe.prototype);
  globe.camera = new THREE.PerspectiveCamera(45, 390 / 664, 0.01, 100);
  globe.camera.position.copy(latLngToVec3(43, -72, distance));
  globe.camera.lookAt(0, 0, 0);
  globe.renderer = { domElement: { getBoundingClientRect: () => ({ width: 390, height: 664 }) } };
  globe.pin = new THREE.Sprite(); globe.pinDot = new THREE.Mesh();
  globe.setPrecisionMode(true);
  for (const [lat, lng] of [[43, -72], [-21, 178], [78, 50]]) {
    globe.camera.position.copy(latLngToVec3(lat, lng, distance)); globe.camera.lookAt(0, 0, 0);
    globe.updatePrecisionPin();
    const point = globe.screenPoint(globe.getPin().lat, globe.getPin().lng);
    assert.ok(Math.hypot(point.x - 195, point.y - 332) < 0.001);
    assert.equal(globe._pinHit({}), false, 'crosshair does not capture map drags');
    assert.equal(globe.pin.visible, false);
  }
  globe.setPrecisionMode(false);
  assert.equal(globe.pin.visible, true);
}
console.log('PASS discovery bearings, city context, story length and precision anchoring across zoom levels');

for (const aspect of [390 / 250, 375 / 180, 380 / 300]) {
  const globe = Object.create(Globe.prototype);
  globe.camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 100);
  globe.renderer = { domElement: { getBoundingClientRect: () => ({ width: aspect * 250, height: 250 }) } };
  globe.flyTo = (lat, lng, distance) => { globe.camera.position.copy(latLngToVec3(lat, lng, distance)); globe.camera.lookAt(0, 0, 0); };
  for (const [a, b] of [[{lat:40,lng:-74},{lat:48,lng:11}], [{lat:0,lng:-70},{lat:0,lng:70}], [{lat:40,lng:-74},{lat:40.1,lng:-74.1}]]) {
    globe.framePoints(a, b);
    assert.ok(globe.screenPoint(a.lat, a.lng), 'guess remains visible');
    assert.ok(globe.screenPoint(b.lat, b.lng), 'destination remains visible');
  }
  const munich = { lat: 48.137, lng: 11.576 };
  for (const guess of [munich, { lat: 48.17, lng: 11.62 }, { lat: 48.4, lng: 11.9 }]) {
    globe.framePoints(guess, munich);
    assert.ok(globe.camera.position.length() <= 1.041, 'Munich-area answers retain close zoom');
    assert.ok(globe.screenPoint(guess.lat, guess.lng), 'close guess remains visible');
    assert.ok(globe.screenPoint(munich.lat, munich.lng), 'Munich destination remains visible');
  }
}
console.log('PASS result framing keeps both pins in the visible globe area');
const transition = Object.create(Globe.prototype);
transition.cameraLatLng = () => ({ lat: 55.754, lng: 37.621 });
let flight;
transition.flyTo = (...args) => { flight = args; };
transition.resetRoundView();
assert.deepEqual(flight, [55.754, 37.621, 2.9, 850], 'next round zooms out without aiming at the next answer');
console.log('PASS round transition restores whole-Earth view');
