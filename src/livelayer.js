// Live Earth layer for the globe (v5.1): this week's earthquakes as dots on the
// surface (rings on the recent strong ones) and the International Space Station
// flying its real orbit at its real altitude, with its track drawn ahead and behind.
//
// Shown only when no guess is being made (Globe passes `active` from !interactive),
// so it decorates the reveal, Explore and the menus and never the guessing view.
// Data comes from live.js; this file only draws.

import * as THREE from 'three';
import { latLngToVec3 } from './globe.js';
import { loadQuakes, loadIssSatrec, issPositionAt, issTrack, altitudeToRadius } from './live.js';

const QUAKE_R = 1.0025;          // just above the surface (and the tile patch)
const RING_MIN_MAG = 4.5;        // recent strong quakes get a slow pulsing ring
const RING_MAX_AGE_MS = 3 * 86400000;
const MAX_RINGS = 12;
const TRACK_REFRESH_S = 60;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The station: a small truss with two pairs of solar wings, and its name under it.
function issTexture() {
  return canvasTex(128, 96, (g, w) => {
    g.translate(w / 2, 30);
    g.shadowColor = 'rgba(255,214,120,0.9)'; g.shadowBlur = 10;
    g.fillStyle = '#ffd87a';
    g.fillRect(-26, -2, 52, 4);                         // truss
    for (const x of [-26, -16, 12, 22]) g.fillRect(x, -15, 6, 30); // solar wings
    g.fillStyle = '#ffffff'; g.fillRect(-5, -6, 10, 12); // modules
    g.shadowBlur = 0;
    g.font = '600 17px system-ui, -apple-system, Segoe UI, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.lineWidth = 4; g.strokeStyle = 'rgba(6,10,24,0.85)';
    g.strokeText('Space Station', 0, 24); g.fillStyle = '#fff2cf'; g.fillText('Space Station', 0, 24);
  });
}

// Fresh quakes are red, a few days old orange, a week old pale gold.
function quakeColor(ageMs, out) {
  const d = ageMs / 86400000;
  if (d < 1) return out.set('#ff4b3a');
  if (d < 3) return out.set('#ff9a3a');
  return out.set('#ffd27a');
}

// Screen-space quake markers: a round dot per quake, sized in CSS pixels by
// magnitude (legible at every zoom, no per-zoom relayout), with a dark rim so it
// reads on bright land; recent strong quakes add a slow expanding ring. Drawn in
// the fragment shader, so the edge is always round.
const QUAKE_VERT = `
  attribute vec3 color; attribute float size; attribute float ring; attribute float phase;
  uniform float uTime; uniform float uPixelRatio;
  varying vec3 vColor; varying float vRing; varying float vF;
  void main() {
    vColor = color; vRing = ring;
    vF = fract((uTime + phase) / 2.4);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size * uPixelRatio * (ring > 0.5 ? 1.4 + 3.0 * vF : 1.0);
  }`;
const QUAKE_FRAG = `
  uniform float uOpacity;
  varying vec3 vColor; varying float vRing; varying float vF;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    float a; vec3 col = vColor;
    if (vRing > 0.5) {
      a = smoothstep(0.62, 0.8, r) * (1.0 - smoothstep(0.86, 1.0, r)) * 0.85 * (1.0 - vF);
    } else {
      a = 1.0 - smoothstep(0.78, 1.0, r);
      col = mix(vColor, vec3(0.12, 0.05, 0.02), smoothstep(0.5, 0.72, r));
    }
    a *= uOpacity;
    if (a < 0.02) discard;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

// Magnitude 2.5 is a 4 px speck, 5 is ~9 px, 7+ caps at 15 px.
const quakePx = (mag) => THREE.MathUtils.clamp(4 + (mag - 2.5) * 2.2, 4, 15);

export class LiveLayer {
  constructor(globe) {
    this.globe = globe;
    this.group = new THREE.Group();
    this.group.visible = false;
    globe.scene.add(this.group);
    this.quakes = [];
    this.iss = null;      // { satrec, sprite, track, trackAge }
    this._loading = false;
    this._t = 0;
  }

  // First activation pulls the data; later ones only show/hide.
  _ensureLoaded() {
    if (this._loading) return;
    this._loading = true;
    loadQuakes().then((q) => this._setQuakes(q));
    loadIssSatrec().then((r) => { if (r) this._setIss(r.satrec); });
  }

  _setQuakes(quakes) {
    this.quakes = quakes;
    if (!quakes.length) return;
    const now = Date.now();
    const rings = quakes.filter((q) => q.mag >= RING_MIN_MAG && now - q.timeMs < RING_MAX_AGE_MS)
      .sort((a, b) => b.mag - a.mag).slice(0, MAX_RINGS);
    // Small dots first and the strongest last, so a big quake sits on top of the specks around it.
    const byMag = [...quakes].sort((a, b) => a.mag - b.mag);
    const all = [...rings.map((q) => ({ q, ring: 1 })), ...byMag.map((q) => ({ q, ring: 0 }))];
    const n = all.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const size = new Float32Array(n), ring = new Float32Array(n), phase = new Float32Array(n);
    const c = new THREE.Color();
    all.forEach(({ q, ring: isRing }, i) => {
      latLngToVec3(q.lat, q.lng, QUAKE_R).toArray(pos, i * 3);
      quakeColor(now - q.timeMs, c).toArray(col, i * 3);
      size[i] = quakePx(q.mag); ring[i] = isRing; phase[i] = (i * 0.618) % 2.4;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('ring', new THREE.BufferAttribute(ring, 1));
    geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    this.quakeUniforms = {
      uTime: { value: 0 }, uOpacity: { value: 1 },
      uPixelRatio: { value: this.globe.renderer.getPixelRatio?.() || 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.quakeUniforms, vertexShader: QUAKE_VERT, fragmentShader: QUAKE_FRAG,
      transparent: true, depthWrite: false, toneMapped: false,
    });
    this.quakePoints = new THREE.Points(geo, mat);
    this.quakePoints.renderOrder = 6;
    this.quakePoints.frustumCulled = false;
    this.group.add(this.quakePoints);
  }

  _setIss(satrec) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: issTexture(), depthWrite: false, transparent: true, toneMapped: false }));
    sprite.center.set(0.5, 0.69); // the station body, not the label, sits on the orbit
    sprite.renderOrder = 8;
    const track = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
    }));
    track.renderOrder = 7;
    this.group.add(track, sprite);
    this.iss = { satrec, sprite, track, trackAge: Infinity };
  }

  _rebuildTrack(now) {
    const pts = issTrack(this.iss.satrec, now);
    if (pts.length < 2) return;
    const pos = new Float32Array(pts.length * 3), col = new Float32Array(pts.length * 3);
    const past = new THREE.Color('#7f6a3a'), ahead = new THREE.Color('#ffd87a'), c = new THREE.Color();
    pts.forEach((p, i) => {
      latLngToVec3(p.lat, p.lng, altitudeToRadius(p.altKm)).toArray(pos, i * 3);
      // Behind the station: dim; ahead: bright, fading toward the end of the window.
      if (p.tMin < 0) c.copy(past).multiplyScalar(0.35 + 0.65 * (1 + p.tMin / 45));
      else c.copy(ahead).multiplyScalar(1 - 0.6 * (p.tMin / 50));
      c.toArray(col, i * 3);
    });
    const geo = this.iss.track.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    this.iss.trackAge = 0;
  }

  update(dt, active) {
    if (active) this._ensureLoaded();
    this.group.visible = !!active;
    if (!active) return;
    this._t += dt;
    const globe = this.globe;
    if (this.quakeUniforms) {
      this.quakeUniforms.uTime.value = this._t;
      this.quakeUniforms.uPixelRatio.value = globe.renderer.getPixelRatio();
    }
    if (this.iss) {
      // The station flies 420 km up: at street-level zoom its orbit line just
      // slices across the map, so it fades out below ~1,600 km camera altitude.
      const alt = globe.camera.position.length() - 1;
      const fade = THREE.MathUtils.smoothstep(alt, 0.12, 0.3);
      this.iss.sprite.visible = this.iss.track.visible = fade > 0.01;
      this.iss.sprite.material.opacity = fade;
      this.iss.track.material.opacity = 0.85 * fade;
      const now = Date.now();
      this.iss.trackAge += dt;
      if (this.iss.trackAge > TRACK_REFRESH_S) this._rebuildTrack(now);
      const p = issPositionAt(this.iss.satrec, now);
      if (p) {
        const pos = latLngToVec3(p.lat, p.lng, altitudeToRadius(p.altKm));
        this.iss.sprite.position.copy(pos);
        const k = globe._spriteScaleForDistance(pos) * 0.9;
        this.iss.sprite.scale.set(k * (128 / 96), k, 1);
      }
    }
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) { o.material.map?.dispose(); o.material.dispose(); }
    });
    this.globe.scene.remove(this.group);
  }
}
