// Storms, wildfires and news pins on the globe (v5.6), owned by LiveLayer and shown
// under the same rule (only when no guess is being made, only with Live Earth on).
// Data comes from hazards.js; this file only draws.
//
// Draw calls stay flat however many events there are (the iPhone frame-time gate):
//  - one Points for every fire (flickering embers sized by burned area),
//  - one Points for every storm glyph AND every track fix (a spinning spiral at the
//    storm's latest position, coloured dots along where it has been),
//  - one LineSegments for every track,
//  - one Points for every news beacon,
//  - one small name sprite per storm (there are rarely more than three).
// Everything is sized in screen pixels, so it reads the same at every zoom.

import * as THREE from 'three';
import { latLngToVec3 } from './globe.js';
import { stormLabel, stormCategory as catOf } from './hazards.js';

const SURFACE_R = 1.003;
const NEWS_R = 1.0035;

// Saffir-Simpson colours: depression, tropical storm, categories 1-5.
const CAT_COLORS = ['#8fd3ff', '#4fe3d6', '#ffe45c', '#ffb340', '#ff7a33', '#ff3b3b', '#ff4fd8'];
export const catColor = (cat) => CAT_COLORS[Math.max(-1, Math.min(5, cat)) + 1];
const NEWS_COLORS = { military: '#ff4a2e', conflict: '#ff7a2e', disaster: '#ffb020' };
const newsColor = (kind) => NEWS_COLORS[kind] || '#4ea8ff';

// Burned area -> px: 100 ha is a 4 px speck, 10,000 ha ~9 px, 100,000+ ha caps at 13 px.
const firePx = (ha) => THREE.MathUtils.clamp(4 + 2.5 * Math.log10(Math.max(ha || 50, 1) / 100), 3.5, 13);
// A tropical depression is a 28 px glyph, a category 5 a 70 px one.
const stormPx = (cat) => (cat < 0 ? 28 : 34 + 7 * cat);

const FIRE_VERT = `
  attribute float size; attribute float phase;
  uniform float uTime; uniform float uPixelRatio;
  varying float vFlick;
  void main() {
    float t = uTime + phase * 7.0;
    vFlick = 0.5 + 0.5 * sin(t * 7.3) * sin(t * 3.1 + phase * 4.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uPixelRatio * 1.8 * (0.9 + 0.2 * vFlick);
  }`;
const FIRE_FRAG = `
  uniform float uOpacity;
  varying float vFlick;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    float core = 1.0 - smoothstep(0.05, 0.4, r);
    float glow = 1.0 - smoothstep(0.15, 1.0, r);
    vec3 col = mix(vec3(0.78, 0.1, 0.02), vec3(1.0, 0.52, 0.06), glow);
    col = mix(col, vec3(1.0, 0.95, 0.72), core);
    col = mix(col, vec3(0.16, 0.03, 0.0), smoothstep(0.5, 0.9, r) * 0.55); // dark rim: reads on bright land
    float a = max(core, glow * 0.85) * (0.75 + 0.25 * vFlick) * uOpacity;
    if (a < 0.02) discard;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

// mode 1: the storm glyph - two log-spiral cloud arms turning around a clear eye
// (anticlockwise north of the equator, clockwise south of it, as seen from above).
// mode 0: a track fix - a small dot with a dark rim, faded by age.
const STORM_VERT = `
  attribute vec3 color; attribute float size; attribute float mode; attribute float hemi; attribute float alpha;
  uniform float uPixelRatio;
  varying vec3 vColor; varying float vMode; varying float vHemi; varying float vAlpha;
  void main() {
    vColor = color; vMode = mode; vHemi = hemi; vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uPixelRatio;
  }`;
const STORM_FRAG = `
  uniform float uTime; uniform float uOpacity;
  varying vec3 vColor; varying float vMode; varying float vHemi; varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0; p.y = -p.y;
    float r = length(p);
    if (r > 1.0) discard;
    vec3 col; float a;
    if (vMode < 0.5) {
      a = (1.0 - smoothstep(0.7, 1.0, r)) * vAlpha;
      col = mix(vColor, vec3(0.06, 0.06, 0.1), smoothstep(0.45, 0.75, r));
    } else {
      float th = atan(p.y, p.x);
      float lr = log(max(r, 0.02));
      float spin = uTime * 1.1 * vHemi;
      float arm = 0.5 + 0.5 * cos(2.0 * (th - spin + vHemi * 2.2 * lr));
      float env = (1.0 - smoothstep(0.55, 1.0, r)) * smoothstep(0.1, 0.24, r);
      float arms = smoothstep(0.3, 0.95, arm) * env;
      float cdo = (1.0 - smoothstep(0.2, 0.42, r)) * smoothstep(0.08, 0.15, r); // dense core
      float eyewall = exp(-pow((r - 0.13) / 0.035, 2.0));
      float cloud = clamp(max(arms, cdo) + eyewall * 0.6, 0.0, 1.0);
      vec3 cloudCol = mix(vColor, vec3(1.0), 0.25 + 0.45 * cdo);
      cloudCol = mix(cloudCol, vColor * 1.2, eyewall * 0.7);
      float backing = (1.0 - smoothstep(0.62, 1.0, r)) * 0.38; // soft shadow disc
      a = cloud + backing * (1.0 - cloud);
      col = mix(vec3(0.03, 0.04, 0.09), cloudCol, cloud / max(a, 0.001));
      a *= vAlpha;
    }
    a *= uOpacity;
    if (a < 0.02) discard;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

// A news beacon: a solid dot with a dark rim and a ring that keeps rippling out.
const NEWS_VERT = `
  attribute vec3 color; attribute float phase;
  uniform float uTime; uniform float uPixelRatio;
  varying vec3 vColor; varying float vF;
  void main() {
    vColor = color;
    vF = fract((uTime + phase) / 1.9);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = 40.0 * uPixelRatio;
  }`;
const NEWS_FRAG = `
  uniform float uOpacity;
  varying vec3 vColor; varying float vF;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    float disc = 1.0 - smoothstep(0.24, 0.3, r);
    float rim = smoothstep(0.17, 0.24, r) * disc;
    float rr = 0.25 + 0.7 * vF;
    float ring = exp(-pow((r - rr) / 0.05, 2.0)) * (1.0 - vF);
    float halo = (1.0 - smoothstep(0.2, 0.5, r)) * 0.25;
    vec3 col = mix(vColor, vec3(0.08, 0.03, 0.02), rim * 0.7);
    col = mix(col, vec3(1.0, 0.97, 0.9), (1.0 - smoothstep(0.0, 0.09, r)) * 0.8);
    float a = max(max(disc, ring * 0.9), halo) * uOpacity;
    if (a < 0.02) discard;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

function pointsMaterial(uniforms, vertexShader, fragmentShader) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, toneMapped: false });
}

function stormLabelTexture(storm) {
  const w = 256, h = 72;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'top';
  g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = 'rgba(6,10,24,0.88)';
  g.font = '700 26px system-ui, -apple-system, Segoe UI, sans-serif';
  const name = stormLabel(storm);
  g.strokeText(name, w / 2, 4, w - 8); g.fillStyle = '#ffffff'; g.fillText(name, w / 2, 4, w - 8);
  if (storm.cat >= 1) {
    g.font = '600 20px system-ui, -apple-system, Segoe UI, sans-serif';
    const sub = `Category ${storm.cat}`;
    g.strokeText(sub, w / 2, 38); g.fillStyle = catColor(storm.cat); g.fillText(sub, w / 2, 38);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / h };
}

export class HazardLayer {
  constructor(globe, group) {
    this.globe = globe;
    this.group = group;
    this.uniforms = {
      uTime: { value: 0 }, uOpacity: { value: 1 },
      uPixelRatio: { value: globe.renderer.getPixelRatio?.() || 1 },
    };
    this.fires = null; this.storms = null; this.tracks = null; this.news = null;
    this.labels = []; // { sprite, pos, px, gap }
  }

  _drop(obj) {
    if (!obj) return;
    this.group.remove(obj);
    obj.geometry?.dispose();
    if (obj.material !== this._sharedFire && obj.material !== this._sharedStorm && obj.material !== this._sharedNews) {
      obj.material?.map?.dispose(); obj.material?.dispose();
    }
  }

  _points(attrs, material, renderOrder) {
    const geo = new THREE.BufferGeometry();
    for (const [name, arr, size] of attrs) geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
    const pts = new THREE.Points(geo, material);
    pts.renderOrder = renderOrder;
    pts.frustumCulled = false;
    this.group.add(pts);
    return pts;
  }

  setFires(fires) {
    this._drop(this.fires); this.fires = null;
    if (!fires?.length) return;
    // Small first, the biggest last so it sits on top.
    const list = [...fires].sort((a, b) => (a.ha || 0) - (b.ha || 0));
    const n = list.length;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), phase = new Float32Array(n);
    list.forEach((f, i) => {
      latLngToVec3(f.lat, f.lng, SURFACE_R).toArray(pos, i * 3);
      size[i] = firePx(f.ha); phase[i] = (i * 0.618) % 1;
    });
    this._sharedFire ||= pointsMaterial(this.uniforms, FIRE_VERT, FIRE_FRAG);
    this.fires = this._points([['position', pos, 3], ['size', size, 1], ['phase', phase, 1]], this._sharedFire, 6);
  }

  setStorms(storms) {
    this._drop(this.storms); this._drop(this.tracks);
    for (const l of this.labels) this._drop(l.sprite);
    this.storms = this.tracks = null; this.labels = [];
    if (!storms?.length) return;
    const c = new THREE.Color();
    // Track fixes (all but the last of each storm), then the glyphs on top.
    const dots = [], glyphs = [];
    const segPos = [], segCol = [];
    for (const s of storms) {
      const tr = s.track || [];
      const n = tr.length;
      const hemi = s.lat >= 0 ? 1 : -1;
      tr.forEach((p, i) => {
        const age = n > 1 ? i / (n - 1) : 1; // 0 oldest .. 1 latest
        if (i < n - 1) dots.push({ p, size: 6, mode: 0, hemi, alpha: 0.35 + 0.6 * age, cat: catOf(p.kts) });
        if (i > 0) {
          const a = latLngToVec3(tr[i - 1].lat, tr[i - 1].lng, SURFACE_R), b = latLngToVec3(p.lat, p.lng, SURFACE_R);
          // Subdivide along the great circle so a long 6-hour hop hugs the sphere.
          const steps = Math.max(1, Math.min(8, Math.ceil(a.angleTo(b) / 0.01)));
          c.set(catColor(catOf(tr[i - 1].kts)));
          const a0 = 0.15 + 0.75 * ((i - 1) / Math.max(1, n - 1)), a1 = 0.15 + 0.75 * (i / Math.max(1, n - 1));
          for (let k = 0; k < steps; k++) {
            const u0 = k / steps, u1 = (k + 1) / steps;
            for (const [u, al] of [[u0, a0 + (a1 - a0) * u0], [u1, a0 + (a1 - a0) * u1]]) {
              const v = a.clone().lerp(b, u).setLength(SURFACE_R);
              segPos.push(v.x, v.y, v.z); segCol.push(c.r, c.g, c.b, al);
            }
          }
        }
      });
      glyphs.push({ p: { lat: s.lat, lng: s.lng }, size: stormPx(s.cat), mode: 1, hemi, alpha: 1, cat: s.cat });
      this._addLabel(s);
    }
    const all = [...dots, ...glyphs];
    const N = all.length;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const size = new Float32Array(N), mode = new Float32Array(N), hemi = new Float32Array(N), alpha = new Float32Array(N);
    all.forEach((d, i) => {
      latLngToVec3(d.p.lat, d.p.lng, SURFACE_R + (d.mode ? 0.0005 : 0)).toArray(pos, i * 3);
      c.set(catColor(d.cat)).toArray(col, i * 3);
      size[i] = d.size; mode[i] = d.mode; hemi[i] = d.hemi; alpha[i] = d.alpha;
    });
    this._sharedStorm ||= pointsMaterial(this.uniforms, STORM_VERT, STORM_FRAG);
    this.storms = this._points([
      ['position', pos, 3], ['color', col, 3], ['size', size, 1], ['mode', mode, 1], ['hemi', hemi, 1], ['alpha', alpha, 1],
    ], this._sharedStorm, 7);
    if (segPos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(segPos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(segCol, 4)); // per-vertex alpha
      this.tracks = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
      }));
      this.tracks.renderOrder = 6;
      this.tracks.frustumCulled = false;
      this.group.add(this.tracks);
    }
  }

  _addLabel(storm) {
    const { tex, aspect } = stormLabelTexture(storm);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, depthTest: false, depthWrite: false, transparent: true, toneMapped: false, sizeAttenuation: false,
    }));
    sprite.renderOrder = 9;
    const pos = latLngToVec3(storm.lat, storm.lng, SURFACE_R);
    sprite.position.copy(pos);
    const px = 40; // label height in CSS px
    sprite.center.set(0.5, 1 + (stormPx(storm.cat) / 2 + 2) / px); // hang just under the glyph
    this.group.add(sprite);
    this.labels.push({ sprite, pos, px, aspect });
  }

  setNews(pins) {
    this._drop(this.news); this.news = null;
    if (!pins?.length) return;
    const n = pins.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), phase = new Float32Array(n);
    const c = new THREE.Color();
    pins.forEach((p, i) => {
      latLngToVec3(p.lat, p.lng, NEWS_R).toArray(pos, i * 3);
      c.set(newsColor(p.kind)).toArray(col, i * 3);
      phase[i] = (i * 0.37) % 1.9;
    });
    this._sharedNews ||= pointsMaterial(this.uniforms, NEWS_VERT, NEWS_FRAG);
    this.news = this._points([['position', pos, 3], ['color', col, 3], ['phase', phase, 1]], this._sharedNews, 8);
  }

  update(time) {
    const globe = this.globe;
    this.uniforms.uTime.value = time;
    this.uniforms.uPixelRatio.value = globe.renderer.getPixelRatio();
    if (!this.labels.length) return;
    // sizeAttenuation:false sprites are sized in clip space: scale 1 spans f/2 of the
    // viewport height (f = projection[1][1]), so px -> scale is 2px / (f * H).
    const cam = globe.camera;
    const f = cam.projectionMatrix.elements[5] || 1;
    const H = globe.renderer.domElement?.clientHeight || 800;
    const camPos = cam.position;
    for (const l of this.labels) {
      // Labels skip the depth test (so the globe never slices them); hide the far side by hand.
      const facing = l.pos.dot(camPos) - l.pos.lengthSq();
      const vis = THREE.MathUtils.smoothstep(facing, 0, 0.02);
      l.sprite.visible = vis > 0.01;
      l.sprite.material.opacity = vis;
      const sy = (2 * l.px) / (f * H);
      l.sprite.scale.set(sy * l.aspect, sy, 1);
    }
  }

  dispose() {
    this._drop(this.fires); this._drop(this.storms); this._drop(this.tracks); this._drop(this.news);
    for (const l of this.labels) this._drop(l.sprite);
    this._sharedFire?.dispose(); this._sharedStorm?.dispose(); this._sharedNews?.dispose();
  }
}
