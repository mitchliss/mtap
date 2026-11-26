// Lenses (v5.2, the God's Eye View plan's option B): five full-screen looks from
// God's Eye View - night vision, thermal, old TV, cartoon, film noir - as toys for
// the reveal, Explore and the menus. Never while a guess is being made: Globe only
// calls render() here when no pin can be placed.
//
// How it runs without a post-processing chain (PLAN.md rules that out for gameplay):
// the frame is drawn exactly as normal, copied into ONE texture, and drawn again
// through the look's shader. Colours are already tone-mapped display colours at that
// point - the same input God's Eye View's shaders get from Cesium - so the shaders run
// unchanged. With no lens selected none of this exists and the frame path is as before.

import * as THREE from 'three';
import { nightVisionShader } from './gev/styles/surveillance.js';
import { thermalShader } from './gev/styles/thermal.js';
import { retroShader } from './gev/styles/retro.js';
import { animeShader } from './gev/styles/anime.js';
import { noirShader } from './gev/styles/noir.js';

// Family names for the looks (no "surveillance" framing), in menu order.
export const LENSES = [
  { id: 'nightowl', name: 'Night Owl', emoji: '🦉', blurb: 'Green night-vision goggles', shader: nightVisionShader },
  // Heat Map uses the shader's Ironbow colour ramp, not grey military white-hot.
  { id: 'heatmap', name: 'Heat Map', emoji: '🔥', blurb: 'A thermal camera: warm glows, cool fades', shader: thermalShader, settings: { palette: 1.0 } },
  { id: 'retrotv', name: 'Retro TV', emoji: '📺', blurb: 'An old tube TV with wobbly scanlines', shader: retroShader },
  { id: 'cartoon', name: 'Cartoon', emoji: '🎨', blurb: 'Bold colours and inked outlines', shader: animeShader },
  { id: 'noir', name: 'Film Noir', emoji: '🎞️', blurb: 'A black-and-white detective movie', shader: noirShader },
];
export const lensById = (id) => LENSES.find((l) => l.id === id) || null;

const VERT = /* glsl */ `
  out vec2 v_textureCoordinates;
  void main() {
    v_textureCoordinates = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

// God's Eye View writes out_FragColor (Cesium's name); three r166 declares no fragment
// output for a GLSL3 ShaderMaterial, so the shader gets that declaration up front.
export function lensMaterial(shader, settings = {}) {
  const uniforms = {
    colorTexture: { value: null },
    colorTextureDimensions: { value: new THREE.Vector2(1, 1) },
    intensity: { value: 0 },
    time: { value: 0 },
  };
  for (const [name, spec] of Object.entries(shader.uniforms || {})) uniforms[name] = { value: settings[name] ?? spec.default };
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms,
    vertexShader: VERT,
    fragmentShader: 'layout(location = 0) out highp vec4 out_FragColor;\n' + shader.fragmentShader,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
}

const FADE_S = 0.35;      // lens fades in rather than snapping
const SLOW_MS = 24;       // a lens that keeps frames above this (p90) is switched off
const SLOW_WINDOW = 90;   // frames sampled before judging

export class LensPass {
  constructor(renderer, { onSlow } = {}) {
    this.renderer = renderer;
    this.onSlow = onSlow;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.size = new THREE.Vector2();
    this.materials = new Map(); // lens id -> material (compiled once, kept)
    this.broken = new Set();     // lens ids whose shader failed to compile on this device
    this.lensId = null;
    this.fade = 0;
    this.t = 0;
    this._frames = [];
  }

  setLens(id) {
    if (id === this.lensId) return;
    this.lensId = id;
    this.fade = 0;
    this._frames = [];
    const lens = lensById(id);
    if (!lens || this.broken.has(id)) { this.lensId = null; return; }
    if (!this.materials.has(id)) {
      this.materials.set(id, lensMaterial(lens.shader, lens.settings));
      this.quad.material = this.materials.get(id);
      // Compile now, not mid-frame: a shader this GPU rejects must never black out
      // the globe - the lens is dropped and the frame draws as normal.
      if (!this._compiles()) {
        console.warn(`Lens "${lens.name}" did not compile on this device; skipping it`);
        this.materials.get(id).dispose(); this.materials.delete(id);
        this.broken.add(id); this.lensId = null;
        return;
      }
    }
    this.quad.material = this.materials.get(id);
  }

  _compiles() {
    const debug = this.renderer.debug;
    const prev = debug.onShaderError;
    let ok = true;
    debug.onShaderError = (gl, program, vs, fs) => {
      ok = false;
      console.warn(gl.getShaderInfoLog(fs) || gl.getProgramInfoLog(program));
    };
    try { this.renderer.compile(this.scene, this.camera); } catch { ok = false; } finally { debug.onShaderError = prev; }
    return ok;
  }

  _ensureTexture() {
    this.renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x)), h = Math.max(1, Math.floor(this.size.y));
    if (!this.tex || this.tex.image.width !== w || this.tex.image.height !== h) {
      this.tex?.dispose();
      this.tex = new THREE.FramebufferTexture(w, h);
      this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    }
    return this.tex;
  }

  // Draw the scene normally, then through the lens. dtMs feeds the slow-device guard.
  render(scene, camera, dt, dtMs = dt * 1000) {
    const lens = lensById(this.lensId);
    this.renderer.render(scene, camera);
    if (!lens) return;
    const tex = this._ensureTexture();
    this.renderer.copyFramebufferToTexture(tex);
    this.t += dt;
    this.fade = Math.min(1, this.fade + dt / FADE_S);
    const u = this.quad.material.uniforms;
    u.colorTexture.value = tex;
    u.colorTextureDimensions.value.set(tex.image.width, tex.image.height);
    u.intensity.value = this.fade * this.fade * (3 - 2 * this.fade);
    u.time.value = this.t;
    this.renderer.render(this.scene, this.camera);

    // A phone that can't hold the frame rate with a lens gets its lens switched off,
    // once, with a note - smoothness beats looks (PLAN.md's p95 gate).
    this._frames.push(dtMs);
    if (this._frames.length >= SLOW_WINDOW) {
      const sorted = [...this._frames].sort((a, b) => a - b);
      const p90 = sorted[Math.floor(sorted.length * 0.9)];
      this._frames = [];
      if (p90 > SLOW_MS) this.onSlow?.(lens, p90);
    }
  }

  // Frame timing is meaningless across a pause (tab hidden, loop stopped).
  resetTiming() { this._frames = []; }

  dispose() {
    this.tex?.dispose(); this.tex = null;
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    this.quad.geometry.dispose();
  }
}
