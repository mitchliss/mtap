import assert from 'node:assert/strict';
import { LOCATIONS } from '../src/locations.js';
import { LANDMARK_NAMES, landmarkBonus, precisionTotal, precisionMessage } from '../src/landmarks.js';
import { GameSession } from '../src/game.js';
import { formatDistance } from '../src/geo.js';
assert.equal(formatDistance(0.025, false), '25 m');
assert.equal(formatDistance(0.1, true), '328 ft');
const redSquare = LOCATIONS.find((place) => place.name === 'Red Square, Moscow');
assert.equal(landmarkBonus(redSquare, 19), 0, '19 km is outside landmark precision range');
assert.equal(landmarkBonus(redSquare, 0.019), 25, '19 metres earns the top bonus');
assert.match(precisionMessage(redSquare, 0), /within 100 m/);
for (const name of LANDMARK_NAMES) {
  const target = LOCATIONS.find((place) => place.name === name);
  assert.ok(target, `registered landmark exists: ${name}`);
  for (const [distance, expected] of [[0,25],[0.025,25],[0.025001,10],[0.1,10],[0.100001,0],[NaN,0]]) {
    assert.equal(landmarkBonus(target, distance), expected);
  }
  assert.equal(landmarkBonus({...target,isFamily:true},0),0);
  const game = new GameSession(1, true, null, { locations: [target] });
  const result = game.submitGuess(target.lat, target.lng);
  assert.equal(result.precisionBonus,25);
  assert.equal(game.totalScore, result.points, 'bonus stays outside daily score');
  assert.equal(game.bonusScore,0, 'precision never becomes family points');
  assert.equal(precisionTotal(JSON.parse(JSON.stringify(game.results))),25,'bonus survives saved rounds');
}
for (const name of ['Munich','Monument Valley','Cambridge, England','Big Bend National Park, Texas']) {
  assert.equal(landmarkBonus({name},0),0);
}
assert.equal(precisionTotal([{}, {precisionBonus:10}, {precisionBonus:25}]),35);
console.log(`PASS precision thresholds and separate persisted scoring for all ${LANDMARK_NAMES.size} landmarks`);
