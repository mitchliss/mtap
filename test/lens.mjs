// Lenses (v5.2). Pure Node: no GPU, so the renderer is a stub that records calls.
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import * as THREE from 'three';
import { LENSES, lensById, lensMaterial, LensPass } from '../src/lens.js';
import { cardLayout, lensName, savedLens, lensChoice, lensOfDay, lensForChoice, pickRevealLens, lensLabel, resetAutoOff } from '../src/lensui.js';
import { Globe } from '../src/globe.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); passed++; }
  catch (error) { console.error(`FAIL ${name}\n${error.stack || error}`); process.exitCode = 1; }
}

await test('five lenses, family names, picker menu in step with the lens list', async () => {
  assert.deepEqual(LENSES.map((l) => l.id), ['nightowl', 'heatmap', 'retrotv', 'cartoon', 'noir']);
  for (const l of LENSES) assert.equal(lensName(l.id), l.name, `picker name for ${l.id}`);
  assert.equal(lensName(null), 'No lens');
  assert.equal(lensById('nope'), null);
  // No "surveillance" framing anywhere a player reads.
  const ui = await readFile('src/lensui.js', 'utf8') + await readFile('index.html', 'utf8');
  assert.doesNotMatch(ui, /surveillance|spy|FLIR/i);
});

await test('each lens material: GLSL3, declares the output GEV writes, every shader setting present', () => {
  for (const lens of LENSES) {
    const m = lensMaterial(lens.shader, lens.settings);
    assert.equal(m.glslVersion, THREE.GLSL3, lens.id);
    assert.ok(m.fragmentShader.startsWith('layout(location = 0) out highp vec4 out_FragColor;'), lens.id);
    assert.match(m.fragmentShader, /out_FragColor\s*=/, lens.id);
    for (const u of ['colorTexture', 'colorTextureDimensions', 'intensity', 'time']) assert.ok(u in m.uniforms, `${lens.id}.${u}`);
    for (const [name, spec] of Object.entries(lens.shader.uniforms)) {
      assert.ok(name in m.uniforms, `${lens.id}.${name}`);
      assert.equal(m.uniforms[name].value, lens.settings?.[name] ?? spec.default, `${lens.id}.${name} value`);
    }
    assert.equal(m.toneMapped, false, 'display colours in, display colours out');
  }
  assert.equal(lensMaterial(lensById('heatmap').shader, lensById('heatmap').settings).uniforms.palette.value, 1, 'Heat Map is in colour (Ironbow)');
});

await test('copied God\'s Eye View shaders are unchanged below the credit header', async () => {
  const vendor = 'vendor/gods-eye-view/src/styles';
  try { await access(vendor); } catch { console.log('  (submodule not checked out - skipped)'); return; }
  for (const f of ['surveillance', 'thermal', 'retro', 'anime', 'noir']) {
    const ours = (await readFile(`src/gev/styles/${f}.js`, 'utf8')).split('\n').slice(4).join('\n');
    assert.equal(ours, await readFile(`${vendor}/${f}.js`, 'utf8'), f);
  }
});

function stubRenderer({ compileFails = false } = {}) {
  const calls = [];
  return {
    calls,
    debug: { onShaderError: null },
    render: (scene) => calls.push(scene.isScene && scene.children[0]?.material?.isShaderMaterial ? 'lens' : 'scene'),
    copyFramebufferToTexture: () => calls.push('copy'),
    getDrawingBufferSize: (v) => v.set(750, 652),
    compile() { if (compileFails) this.debug.onShaderError?.({ getShaderInfoLog: () => 'bad', getProgramInfoLog: () => '' }, null, null, null); },
  };
}

await test('lens pass: scene, copy, lens draw; fades in; no lens = one plain draw', () => {
  const r = stubRenderer();
  const pass = new LensPass(r);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  pass.render(scene, camera, 1 / 60);
  assert.deepEqual(r.calls, ['scene'], 'no lens chosen');
  pass.setLens('retrotv');
  r.calls.length = 0;
  pass.render(scene, camera, 1 / 60);
  assert.deepEqual(r.calls, ['scene', 'copy', 'lens']);
  const u = pass.quad.material.uniforms;
  assert.ok(u.intensity.value > 0 && u.intensity.value < 0.1, 'starts faint');
  for (let i = 0; i < 30; i++) pass.render(scene, camera, 1 / 60);
  assert.equal(u.intensity.value, 1);
  assert.deepEqual(u.colorTextureDimensions.value.toArray(), [750, 652]);
});

await test('a lens this GPU cannot compile is skipped, never a black screen', () => {
  const r = stubRenderer({ compileFails: true });
  const warn = console.warn; console.warn = () => {};
  const pass = new LensPass(r);
  pass.setLens('noir');
  console.warn = warn;
  assert.equal(pass.lensId, null);
  assert.ok(pass.broken.has('noir'));
  pass.render(new THREE.Scene(), new THREE.PerspectiveCamera(), 1 / 60);
  assert.deepEqual(r.calls, ['scene'], 'frame drawn normally');
  pass.setLens('noir');
  assert.equal(pass.lensId, null, 'stays skipped');
});

await test('slow-device guard: switches a lens off only when frames stay slow', () => {
  const slow = [];
  const pass = new LensPass(stubRenderer(), { onSlow: (lens, p90) => slow.push([lens.id, p90]) });
  pass.setLens('heatmap');
  const s = new THREE.Scene(), c = new THREE.PerspectiveCamera();
  for (let i = 0; i < 90; i++) pass.render(s, c, 1 / 60, i % 15 === 0 ? 40 : 16); // occasional hitch
  assert.equal(slow.length, 0, 'a few hitches are fine');
  for (let i = 0; i < 90; i++) pass.render(s, c, 1 / 60, 30);
  assert.equal(slow.length, 1);
  assert.equal(slow[0][0], 'heatmap');
  pass.resetTiming();
  for (let i = 0; i < 89; i++) pass.render(s, c, 1 / 60, 30);
  assert.equal(slow.length, 1, 'no verdict before a full window after a pause');
});

await test('a lens never draws while a guess is being made; the lens of the day stays off the whole round', () => {
  const g = Object.create(Globe.prototype);
  g.lens = { lensId: null, setLens(id) { this.lensId = id; } }; g._lensId = 'nightowl'; g._lensScope = 'always';
  g.interactive = true;
  assert.equal(g._lensActive(), false);
  g.interactive = false;
  assert.equal(g._lensActive(), true);
  g._lensId = null;
  assert.equal(g._lensActive(), false);
  // Lens of the day: menus / end screen / Explore only - not on the answer card.
  g._lensId = 'heatmap'; g._lensScope = 'menus'; g.interactive = false;
  g._gameplayActive = true;
  assert.equal(g._lensActive(), false, 'answer card in a round');
  g._gameplayActive = false;
  assert.equal(g._lensActive(), true, 'menus, end screen, Explore');
  // v5.8 surprise lens: on the answer card in a round, never while guessing, not on the menus.
  g._roundLensId = 'retrotv'; g._gameplayActive = true;
  assert.equal(g._lensActive(), true, 'answer card gets the surprise lens');
  assert.equal(g.lens.lensId, 'retrotv');
  g.interactive = true;
  assert.equal(g._lensActive(), false, 'never while guessing');
  g.interactive = false; g._gameplayActive = false;
  assert.equal(g._lensActive(), true); assert.equal(g.lens.lensId, 'heatmap', 'menus go back to the lens of the day');
  g.lens = { lensId: null, setLens() { this.lensId = null; } }; g._gameplayActive = true; // a shader this phone rejects
  assert.equal(g._lensActive(), false, 'a broken lens draws the plain globe');
});

await test('share card keeps the view\'s shape: square on a phone, a band on desktop, never past the source', () => {
  const phone = cardLayout(750, 652);
  assert.equal(phone.W, 1080); assert.ok(phone.boxH > 900 && phone.boxH <= 1080, `phone box ${phone.boxH}`);
  assert.equal(phone.H, phone.boxH + 270);
  const desktop = cardLayout(2048, 600);
  assert.equal(desktop.boxH, 540, 'wide view floors at 540');
  const tall = cardLayout(750, 1624);
  assert.equal(tall.boxH, 1080, 'tall view caps at 1080');
  for (const L of [phone, desktop, tall]) {
    assert.ok(L.sx >= -1e-9 && L.sy >= -1e-9, 'crop starts inside the source');
    assert.ok(Math.abs(L.sw / L.sh - L.W / L.boxH) < 1e-9, 'crop keeps the box aspect');
  }
});

await test('remembered choice: lens of the day by default, "off" and picked lenses stick, junk is ignored', () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  assert.equal(lensChoice(), 'daily');
  mem.set('marctap.lens', 'retrotv'); assert.equal(lensChoice(), 'retrotv'); assert.equal(savedLens(), 'retrotv');
  mem.set('marctap.lens', 'off'); assert.equal(lensChoice(), 'off'); assert.equal(savedLens(), null);
  mem.set('marctap.lens', 'xray'); assert.equal(lensChoice(), 'daily');
  delete globalThis.localStorage;
  assert.equal(lensChoice(), 'daily', 'no storage (private mode) is fine');
});

await test('lens of the day: a different lens each day through all five, menus only', () => {
  const week = [127, 128, 129, 130, 131].map(lensOfDay);
  assert.equal(new Set(week).size, 5);
  for (const id of week) assert.ok(lensById(id), id);
  assert.equal(lensOfDay(127), lensOfDay(132), 'repeats every five days');
  assert.deepEqual(lensForChoice('daily', 127), [lensOfDay(127), 'menus']);
  assert.deepEqual(lensForChoice('off', 127), [null, 'always']);
  assert.deepEqual(lensForChoice('noir', 127), ['noir', 'always']);
});

await test('surprise lens on each reveal: a real lens, never the same twice running, all five turn up', () => {
  let last = null; const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const next = pickRevealLens(last);
    assert.ok(lensById(next), next);
    assert.notEqual(next, last, 'no repeat');
    seen.add(next); last = next;
  }
  assert.equal(seen.size, 5);
  assert.ok(lensById(pickRevealLens(null, () => 0.9999999)), 'top of the random range');
  assert.equal(lensLabel('nightowl'), '🦉 Night Owl lens');
  const skip = new Set(['nightowl', 'heatmap', 'retrotv', 'cartoon']);
  assert.equal(pickRevealLens('noir', Math.random, skip), 'noir', 'one left: it may repeat');
  skip.add('noir');
  assert.equal(pickRevealLens(null, Math.random, skip), null, 'all too slow: no lens');
});

await test('v5.8 clears an old automatic "off" once, then respects the choice', () => {
  const m = new Map([['marctap.lens', 'off']]);
  const store = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  resetAutoOff(store);
  assert.equal(store.getItem('marctap.lens'), null, 'surprise lenses come back');
  store.setItem('marctap.lens', 'off');
  resetAutoOff(store);
  assert.equal(store.getItem('marctap.lens'), 'off', 'a later "No lens" sticks');
  const picked = new Map([['marctap.lens', 'noir']]);
  resetAutoOff({ getItem: (k) => picked.get(k) ?? null, setItem: (k, v) => picked.set(k, v), removeItem: (k) => picked.delete(k) });
  assert.equal(picked.get('marctap.lens'), 'noir', 'a picked lens is left alone');
});

console.log(`\n${passed} lens tests passed`);
