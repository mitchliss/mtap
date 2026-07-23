// MarcTap 3D globe renderer built on three.js.
// Handles: painting an equirectangular land/ocean texture from GeoJSON, orbit controls,
// tap/double-tap picking, a draggable candidate pin, result markers, and great-circle arcs.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toRad, toDeg } from './geo.js';
import { mulberry32 } from './rng.js';

const GLOBE_RADIUS = 1;

// Matches three.js SphereGeometry UV layout for an equirectangular texture
// where the canvas is drawn with lon -180..180 left->right, lat 90..-90 top->bottom.
export function latLngToVec3(lat, lng, radius = GLOBE_RADIUS) {
  const la = toRad(lat);
  const lo = toRad(lng);
  return new THREE.Vector3(
    radius * Math.cos(la) * Math.cos(lo),
    radius * Math.sin(la),
    -radius * Math.cos(la) * Math.sin(lo)
  );
}

export function vec3ToLatLng(v) {
  const r = v.length();
  const lat = toDeg(Math.asin(v.y / r));
  const lng = toDeg(Math.atan2(-v.z, v.x));
  return { lat, lng };
}

// ---------- texture pipeline ----------
//
// v2: the globe uses real NASA Blue Marble imagery (topography + bathymetry, public
// domain) with country borders and a faint graticule composited on top. The painted
// polygon map from v1 is kept as an offline fallback.

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function strokeBoundaries(ctx, geojson, W, H, style) {
  const px = (lng) => ((lng + 180) / 360) * W;
  const py = (lat) => ((90 - lat) / 180) * H;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  for (const feature of geojson.features) {
    const geom = feature.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        ctx.beginPath();
        let prevX = null;
        ring.forEach(([lng, lat], i) => {
          const x = px(lng), y = py(lat);
          // Break the path across the antimeridian so borders don't streak across the map.
          if (i === 0 || (prevX !== null && Math.abs(x - prevX) > W / 2)) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          prevX = x;
        });
        ctx.stroke();
      }
    }
  }
}

async function buildEarthTexture(geojson, baseUrl) {
  const img = await loadImage(`${baseUrl}textures/earth-blue-marble.jpg`);
  const W = img.naturalWidth, H = img.naturalHeight; // 5400 x 2700
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Base imagery, gently brightened so the game reads clearly at all zoom levels.
  ctx.filter = 'brightness(1.35) saturate(1.15)';
  ctx.drawImage(img, 0, 0, W, H);
  ctx.filter = 'none';

  // Very faint graticule (helps open-ocean guessing without breaking realism).
  const px = (lng) => ((lng + 180) / 360) * W;
  const py = (lat) => ((90 - lat) / 180) * H;
  ctx.strokeStyle = 'rgba(180, 210, 255, 0.07)';
  ctx.lineWidth = 1;
  for (let lng = -180; lng <= 180; lng += 15) {
    ctx.beginPath(); ctx.moveTo(px(lng), 0); ctx.lineTo(px(lng), H); ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    ctx.beginPath(); ctx.moveTo(0, py(lat)); ctx.lineTo(W, py(lat)); ctx.stroke();
  }

  // Country borders: a soft dark underline + crisp light line reads on any terrain.
  strokeBoundaries(ctx, geojson, W, H, { color: 'rgba(0, 0, 0, 0.28)', width: 2.2 });
  strokeBoundaries(ctx, geojson, W, H, { color: 'rgba(255, 255, 255, 0.42)', width: 0.9 });

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Specular map: oceans glint in the sun, land stays matte.
function buildSpecularMap(geojson) {
  const W = 2048, H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#666666'; // water: moderate specular
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000'; // land: none
  for (const feature of geojson.features) {
    const geom = feature.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (const poly of polys) {
      ctx.beginPath();
      for (const ring of poly) {
        ring.forEach(([lng, lat], i) => {
          const x = ((lng + 180) / 360) * W;
          const y = ((90 - lat) / 180) * H;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }
  }
  return new THREE.CanvasTexture(canvas);
}

function drawGlobeTexture(geojson) {
  const W = 4096, H = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const px = (lng) => ((lng + 180) / 360) * W;
  const py = (lat) => ((90 - lat) / 180) * H;

  // Ocean: deep blue gradient, lighter at the equator.
  const ocean = ctx.createLinearGradient(0, 0, 0, H);
  ocean.addColorStop(0, '#0a1e3f');
  ocean.addColorStop(0.5, '#12386e');
  ocean.addColorStop(1, '#0a1e3f');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, W, H);

  // Faint graticule every 15 degrees.
  ctx.strokeStyle = 'rgba(140, 180, 255, 0.10)';
  ctx.lineWidth = 1.2;
  for (let lng = -180; lng <= 180; lng += 15) {
    ctx.beginPath(); ctx.moveTo(px(lng), 0); ctx.lineTo(px(lng), H); ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    ctx.beginPath(); ctx.moveTo(0, py(lat)); ctx.lineTo(W, py(lat)); ctx.stroke();
  }
  // Equator slightly brighter.
  ctx.strokeStyle = 'rgba(140, 190, 255, 0.20)';
  ctx.beginPath(); ctx.moveTo(0, py(0)); ctx.lineTo(W, py(0)); ctx.stroke();

  // Land: soft green-to-tan palette varied deterministically per country.
  const rng = mulberry32(1234);
  const palettes = [
    ['#3f7a4f', '#356b45'],
    ['#4a8256', '#3c6f49'],
    ['#578a58', '#47764b'],
    ['#6b8f56', '#5a7c49'],
    ['#7a9059', '#67804d'],
    ['#8a9a63', '#788a57'],
  ];

  const drawRing = (ring) => {
    ctx.beginPath();
    ring.forEach(([lng, lat], i) => {
      const x = px(lng), y = py(lat);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };

  for (const feature of geojson.features) {
    const [fillA] = palettes[Math.floor(rng() * palettes.length)];
    const geom = feature.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (const poly of polys) {
      // Outer ring + holes via evenodd fill.
      ctx.beginPath();
      for (const ring of poly) {
        ring.forEach(([lng, lat], i) => {
          const x = px(lng), y = py(lat);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fillStyle = fillA;
      ctx.fill('evenodd');
      // Country border / coastline stroke.
      ctx.strokeStyle = 'rgba(10, 26, 46, 0.55)';
      ctx.lineWidth = 1.6;
      for (const ring of poly) { drawRing(ring); ctx.stroke(); }
    }
  }

  // Subtle polar ice caps.
  ctx.fillStyle = 'rgba(225, 240, 255, 0.85)';
  ctx.fillRect(0, 0, W, py(83.5));
  ctx.fillStyle = 'rgba(215, 235, 255, 0.25)';
  ctx.fillRect(0, py(-78), W, H - py(-78));

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- pin sprite textures ----------

function makePinTexture(color, ringColor) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  // Classic map pin: circle head + tapered tail, tip at bottom center.
  ctx.save();
  ctx.translate(S / 2, 0);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.arc(0, 44, 32, Math.PI * 0.8, Math.PI * 0.2);
  ctx.quadraticCurveTo(14, 84, 0, 116);
  ctx.quadraticCurveTo(-14, 84, -Math.cos(Math.PI * 0.2) * 32, 44 + Math.sin(Math.PI * 0.8) * 32);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  // Head ring + inner dot.
  ctx.beginPath();
  ctx.arc(S / 2, 44, 30, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(S / 2, 44, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Numbered round badge for the post-game overview: colored circle + white number + tail.
function makeBadgeTexture(number, color) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  // tail
  ctx.beginPath();
  ctx.moveTo(S / 2 - 12, 78);
  ctx.quadraticCurveTo(S / 2, 92, S / 2, 116);
  ctx.quadraticCurveTo(S / 2, 92, S / 2 + 12, 78);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.arc(S / 2, 48, 36, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(S / 2, 48, 36, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 44px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), S / 2, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- main class ----------

export class Globe {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.cb = callbacks; // { onTap(lat,lng), onDoubleTap(lat,lng), onPinDragged(lat,lng) }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    this.camera.position.set(0, 0.55, 2.9);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x060a18);
    // touch-action must be on the CANVAS itself (it is not inherited): without it,
    // iOS hijacks vertical drags for scroll/pull-to-refresh, so the globe spins
    // horizontally but won't tilt on phones.
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    // Lights — mostly even (a geography game needs no dark side) with a gentle
    // key light for dimensionality and the ocean specular glint.
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.75));
    const sun = new THREE.DirectionalLight(0xfff6e6, 1.0);
    sun.position.set(3, 2, 2.5);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.25);
    fill.position.set(-3, -1, -2);
    this.scene.add(fill);

    // Star field
    this.scene.add(this._makeStars());

    // Globe sphere (texture applied after geojson loads)
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, 128, 96),
      new THREE.MeshPhongMaterial({ color: 0x12386e, shininess: 12, specular: 0x223a5e })
    );
    this.scene.add(this.sphere);

    // Atmosphere glow (backside shell)
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.045, 64, 48),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        uniforms: {},
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.76 - dot(vNormal, vec3(0.0, 0.0, -1.0)), 3.2);
            gl_FragColor = vec4(0.38, 0.62, 1.0, 1.0) * intensity;
          }`,
      })
    );
    this.scene.add(atmosphere);

    // Marker roots
    this.markerRoot = new THREE.Group();
    this.scene.add(this.markerRoot);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.15;
    this.controls.maxDistance = 4.2;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.9;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.4;

    // Pin state
    this.pin = null;           // candidate guess sprite
    this.pinDot = null;        // exact surface dot under the pin
    this.pinLatLng = null;
    this.draggingPin = false;
    this.interactive = false;  // taps place pins only when true

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this._resultObjects = [];  // cleared between rounds
    this._flights = [];        // camera fly animations
    this._pulses = [];         // pulsing marker animations
    this._overviewMarkers = []; // post-game numbered badges
    this.overviewActive = false;

    this._bindPointerEvents();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();

    this._clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._tick());
  }

  async init(geojson) {
    let tex;
    try {
      tex = await buildEarthTexture(geojson, import.meta.env.BASE_URL);
      this.sphere.material.specularMap = buildSpecularMap(geojson);
      this.sphere.material.specular = new THREE.Color(0x88aabb);
      this.sphere.material.shininess = 22;
    } catch (err) {
      console.warn('Satellite texture unavailable, using painted fallback', err);
      tex = drawGlobeTexture(geojson);
    }
    this.sphere.material.map = tex;
    this.sphere.material.color.set(0xffffff);
    this.sphere.material.needsUpdate = true;
    this.pinTexGuess = makePinTexture('#ff4d6d', '#ffd6de');
    this.pinTexAnswer = makePinTexture('#38d67a', '#d7ffe8');
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setAutoRotate(on) { this.controls.autoRotate = on; }
  setInteractive(on) { this.interactive = on; }

  // Zoom-aware rotation feel: slow the drag speed as you zoom in.
  _tuneControls() {
    const d = this.camera.position.length();
    const t = THREE.MathUtils.clamp((d - this.controls.minDistance) / (this.controls.maxDistance - this.controls.minDistance), 0, 1);
    this.controls.rotateSpeed = 0.06 + t * 0.6;
  }

  // ---------- picking ----------

  _setPointerFromEvent(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _globeHit(e) {
    this._setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.sphere, false);
    if (!hits.length) return null;
    return vec3ToLatLng(hits[0].point);
  }

  _pinHit(e) {
    if (!this.pin) return false;
    this._setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.pin, false);
    return hits.length > 0;
  }

  _bindPointerEvents() {
    const el = this.renderer.domElement;
    let downPos = null;
    let downTime = 0;
    let moved = false;
    let lastTapTime = 0;
    let lastTapPos = null;

    el.addEventListener('pointerdown', (e) => {
      downPos = { x: e.clientX, y: e.clientY };
      downTime = performance.now();
      moved = false;
      // Start dragging the existing pin if the press began on it.
      if (this.interactive && this._pinHit(e)) {
        this.draggingPin = true;
        this.controls.enabled = false;
        this.container.classList.add('dragging-pin');
        el.setPointerCapture(e.pointerId);
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (downPos && (Math.abs(e.clientX - downPos.x) > 6 || Math.abs(e.clientY - downPos.y) > 6)) {
        moved = true;
      }
      if (this.draggingPin) {
        const ll = this._globeHit(e);
        if (ll) {
          this._placePin(ll.lat, ll.lng);
          if (this.cb.onPinDragged) this.cb.onPinDragged(ll.lat, ll.lng);
        }
      }
    });

    const endDrag = (e) => {
      if (this.draggingPin) {
        this.draggingPin = false;
        this.controls.enabled = true;
        this.container.classList.remove('dragging-pin');
        try { el.releasePointerCapture(e.pointerId); } catch { /* ok */ }
        return true;
      }
      return false;
    };

    el.addEventListener('pointerup', (e) => {
      const wasPinPress = endDrag(e);
      if (!downPos) return;
      // A pin-press that actually moved was a drag — done. A stationary pin-press
      // falls through and counts as a tap, so double-tapping the pin confirms.
      if (wasPinPress && moved) { downPos = null; return; }
      const quick = performance.now() - downTime < 450;
      if (!moved && quick && this.overviewActive) {
        const idx = this._overviewHit(e);
        if (idx !== null && this.cb.onOverviewSelect) this.cb.onOverviewSelect(idx);
        downPos = null;
        return;
      }
      if (!moved && quick && this.interactive) {
        const ll = this._globeHit(e);
        if (ll) {
          const now = performance.now();
          const isDouble =
            now - lastTapTime < 380 &&
            lastTapPos &&
            Math.abs(e.clientX - lastTapPos.x) < 34 &&
            Math.abs(e.clientY - lastTapPos.y) < 34;
          if (isDouble) {
            lastTapTime = 0;
            this._placePin(ll.lat, ll.lng);
            if (this.cb.onDoubleTap) this.cb.onDoubleTap(ll.lat, ll.lng);
          } else {
            lastTapTime = now;
            lastTapPos = { x: e.clientX, y: e.clientY };
            this._placePin(ll.lat, ll.lng);
            if (this.cb.onTap) this.cb.onTap(ll.lat, ll.lng);
          }
        }
      }
      downPos = null;
    });

    el.addEventListener('pointercancel', endDrag);
  }

  // ---------- pin management ----------

  _spriteScaleForDistance() {
    const d = this.camera.position.length() - GLOBE_RADIUS;
    return THREE.MathUtils.clamp(d * 0.075, 0.028, 0.16);
  }

  _placePin(lat, lng) {
    this.pinLatLng = { lat, lng };
    const surface = latLngToVec3(lat, lng, GLOBE_RADIUS * 1.002);
    if (!this.pin) {
      const mat = new THREE.SpriteMaterial({ map: this.pinTexGuess, depthTest: true, sizeAttenuation: true });
      this.pin = new THREE.Sprite(mat);
      this.pin.center.set(0.5, 0.06); // anchor at the pin's tip
      this.markerRoot.add(this.pin);

      const dotGeo = new THREE.CircleGeometry(0.006, 24);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.9 });
      this.pinDot = new THREE.Mesh(dotGeo, dotMat);
      this.markerRoot.add(this.pinDot);
    }
    this.pin.position.copy(surface);
    const s = this._spriteScaleForDistance();
    this.pin.scale.set(s, s, 1);
    this.pinDot.position.copy(latLngToVec3(lat, lng, GLOBE_RADIUS * 1.004));
    this.pinDot.lookAt(this.pinDot.position.clone().multiplyScalar(2));
  }

  movePin(lat, lng) { this._placePin(lat, lng); }
  getPin() { return this.pinLatLng; }

  clearPin() {
    if (this.pin) {
      this.markerRoot.remove(this.pin);
      this.pin.material.dispose();
      this.pin = null;
    }
    if (this.pinDot) {
      this.markerRoot.remove(this.pinDot);
      this.pinDot.geometry.dispose();
      this.pinDot.material.dispose();
      this.pinDot = null;
    }
    this.pinLatLng = null;
  }

  // Nudge the pin by a fraction of a degree, scaled by zoom (finer when zoomed in).
  nudgePin(direction) {
    if (!this.pinLatLng) return null;
    const d = this.camera.position.length() - GLOBE_RADIUS;
    const step = THREE.MathUtils.clamp(d * 0.5, 0.05, 1.6);
    let { lat, lng } = this.pinLatLng;
    if (direction === 'up') lat = Math.min(89.5, lat + step);
    if (direction === 'down') lat = Math.max(-89.5, lat - step);
    const lonStep = step / Math.max(0.2, Math.cos(toRad(lat)));
    if (direction === 'left') lng -= lonStep;
    if (direction === 'right') lng += lonStep;
    if (lng > 180) lng -= 360;
    if (lng < -180) lng += 360;
    this._placePin(lat, lng);
    return { lat, lng };
  }

  // ---------- post-game overview ----------

  // items: [{ lat, lng, guess?: {lat,lng} }]. Shows numbered badges for all rounds,
  // faint arcs to each guess, and makes badges tappable (cb.onOverviewSelect(i)).
  showOverview(items) {
    this.clearOverview();
    this.overviewActive = true;
    items.forEach((item, i) => {
      const tex = makeBadgeTexture(i + 1, '#38d67a');
      const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, sizeAttenuation: true });
      const badge = new THREE.Sprite(mat);
      badge.center.set(0.5, 0.06);
      badge.position.copy(latLngToVec3(item.lat, item.lng, GLOBE_RADIUS * 1.002));
      const s0 = this._spriteScaleForDistance();
      badge.scale.set(s0, s0, 1);
      badge.userData.overviewIndex = i;
      this.markerRoot.add(badge);
      this._overviewMarkers.push(badge);

      if (item.guess) {
        const arc = this._buildArc(item.guess, item);
        arc.geo.setDrawRange(0, arc.segments + 1); // static, fully drawn
        arc.line.material.opacity = 0.3;
        this.markerRoot.add(arc.line);
        this._overviewMarkers.push(arc.line);

        const dotGeo = new THREE.CircleGeometry(0.005, 20);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.65 });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(latLngToVec3(item.guess.lat, item.guess.lng, GLOBE_RADIUS * 1.004));
        dot.lookAt(dot.position.clone().multiplyScalar(2));
        this.markerRoot.add(dot);
        this._overviewMarkers.push(dot);
      }
    });
  }

  // Emphasize the selected badge and fly the camera to it.
  selectOverview(i, flyDistance = 2.2) {
    this._selectedOverview = i;
    const badges = this._overviewMarkers.filter((o) => o.userData && o.userData.overviewIndex !== undefined);
    badges.forEach((b) => {
      b.userData.selected = b.userData.overviewIndex === i;
      b.material.color.set(b.userData.selected ? 0xffffff : 0xbbbbbb);
    });
    const badge = badges.find((b) => b.userData.overviewIndex === i);
    if (badge) {
      const ll = vec3ToLatLng(badge.position);
      this.flyTo(ll.lat, ll.lng, flyDistance);
    }
  }

  clearOverview() {
    for (const obj of this._overviewMarkers) {
      this.markerRoot.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    }
    this._overviewMarkers = [];
    this.overviewActive = false;
  }

  _overviewHit(e) {
    const badges = this._overviewMarkers.filter((o) => o.userData && o.userData.overviewIndex !== undefined);
    if (!badges.length) return null;
    this._setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(badges, false);
    return hits.length ? hits[0].object.userData.overviewIndex : null;
  }

  // ---------- result display ----------

  showAnswer(guess, answer) {
    // Answer pin
    const mat = new THREE.SpriteMaterial({ map: this.pinTexAnswer, depthTest: true, sizeAttenuation: true });
    const answerPin = new THREE.Sprite(mat);
    answerPin.center.set(0.5, 0.06);
    answerPin.position.copy(latLngToVec3(answer.lat, answer.lng, GLOBE_RADIUS * 1.002));
    const s = this._spriteScaleForDistance();
    answerPin.scale.set(s, s, 1);
    this.markerRoot.add(answerPin);
    this._resultObjects.push(answerPin);
    this._answerPin = answerPin;

    // Pulsing ring at the answer
    const ringGeo = new THREE.RingGeometry(0.012, 0.016, 40);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38d67a, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    const ringPos = latLngToVec3(answer.lat, answer.lng, GLOBE_RADIUS * 1.006);
    ring.position.copy(ringPos);
    ring.lookAt(ringPos.clone().multiplyScalar(2));
    this.markerRoot.add(ring);
    this._resultObjects.push(ring);
    this._pulses.push({ mesh: ring, t: 0 });

    // Great-circle arc between guess and answer, animated.
    if (guess) {
      const arc = this._buildArc(guess, answer);
      this.markerRoot.add(arc.line);
      this._resultObjects.push(arc.line);
      this._arcAnim = arc;
    }

    // Fly the camera to frame both points.
    const mid = this._midpointOnSphere(guess || answer, answer);
    const dist = guess ? this._angularDistance(guess, answer) : 0;
    const camDist = THREE.MathUtils.clamp(1.35 + dist * 1.9, 1.5, 4.0);
    this.flyTo(mid.lat, mid.lng, camDist);
  }

  _buildArc(a, b) {
    const va = latLngToVec3(a.lat, a.lng, 1);
    const vb = latLngToVec3(b.lat, b.lng, 1);
    const angle = va.angleTo(vb);
    const segments = 128;
    const lift = THREE.MathUtils.clamp(angle * 0.25, 0.015, 0.35);
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const v = new THREE.Vector3().copy(va).lerp(vb, t).normalize();
      // slerp-like via normalize of lerp is fine for display arcs
      const altitude = GLOBE_RADIUS * (1.003 + Math.sin(Math.PI * t) * lift);
      points.push(v.multiplyScalar(altitude));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    geo.setDrawRange(0, 0);
    return { line, geo, segments, progress: 0 };
  }

  _midpointOnSphere(a, b) {
    const va = latLngToVec3(a.lat, a.lng, 1);
    const vb = latLngToVec3(b.lat, b.lng, 1);
    const mid = va.add(vb);
    if (mid.lengthSq() < 1e-6) return { lat: a.lat, lng: a.lng }; // antipodal
    mid.normalize();
    return vec3ToLatLng(mid);
  }

  _angularDistance(a, b) {
    const va = latLngToVec3(a.lat, a.lng, 1);
    const vb = latLngToVec3(b.lat, b.lng, 1);
    return va.angleTo(vb);
  }

  clearResults() {
    for (const obj of this._resultObjects) {
      this.markerRoot.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
    this._resultObjects = [];
    this._pulses = [];
    this._arcAnim = null;
    this._answerPin = null;
  }

  // Smoothly move the camera so (lat, lng) faces the viewer at the given distance.
  flyTo(lat, lng, distance = 2.6, ms = 1100) {
    const targetDir = latLngToVec3(lat, lng, 1);
    const from = this.camera.position.clone();
    const fromDist = from.length();
    const fromDir = from.clone().normalize();
    const start = performance.now();
    this._flights = [{
      step: () => {
        const t = Math.min(1, (performance.now() - start) / ms);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
        const dir = fromDir.clone().lerp(targetDir, e).normalize();
        const d = fromDist + (distance - fromDist) * e;
        this.camera.position.copy(dir.multiplyScalar(d));
        this.camera.lookAt(0, 0, 0);
        return t >= 1;
      },
    }];
  }

  // ---------- background ----------

  _makeStars() {
    const rng = mulberry32(99);
    const count = 2200;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // random point on a big sphere
      const u = rng() * 2 - 1;
      const theta = rng() * Math.PI * 2;
      const r = 40 + rng() * 25;
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = r * s * Math.cos(theta);
      positions[i * 3 + 1] = r * u;
      positions[i * 3 + 2] = r * s * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xcfe0ff, size: 0.13, sizeAttenuation: true, transparent: true, opacity: 0.85 });
    return new THREE.Points(geo, mat);
  }

  // ---------- frame loop ----------

  _tick() {
    const dt = this._clock.getDelta();
    this._tuneControls();
    this.controls.update();

    // Camera flights override nothing else; they just move the camera.
    if (this._flights.length) {
      const done = this._flights[0].step();
      if (done) this._flights = [];
    }

    // Keep pin sprites a sane size while zooming.
    const s = this._spriteScaleForDistance();
    if (this.pin) this.pin.scale.set(s, s, 1);
    if (this._answerPin) this._answerPin.scale.set(s, s, 1);
    for (const o of this._overviewMarkers) {
      if (o.userData && o.userData.overviewIndex !== undefined) {
        const k = o.userData.selected ? s * 1.25 : s;
        o.scale.set(k, k, 1);
      }
    }

    // Arc draw animation.
    if (this._arcAnim) {
      this._arcAnim.progress = Math.min(1, this._arcAnim.progress + dt * 1.4);
      const n = Math.floor(this._arcAnim.progress * this._arcAnim.segments) + 1;
      this._arcAnim.geo.setDrawRange(0, n);
    }

    // Pulsing rings.
    for (const p of this._pulses) {
      p.t += dt;
      const k = 1 + 2.2 * (p.t % 1.4) / 1.4;
      p.mesh.scale.set(k, k, k);
      p.mesh.material.opacity = Math.max(0, 0.9 * (1 - (p.t % 1.4) / 1.4));
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }
}
