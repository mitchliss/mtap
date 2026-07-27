// MarcTap 3D globe renderer built on three.js.
// Handles: painting an equirectangular land/ocean texture from GeoJSON, orbit controls,
// tap/double-tap picking, a draggable candidate pin, result markers, and great-circle arcs.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toRad, toDeg } from './geo.js';
import { mulberry32 } from './rng.js';
import { TileDetail } from './tiledetail.js';

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

// Floating info card for the post-game overview: a translucent panel with
// colored text lines (name / score+distance / fact), rendered to a texture.
function makeLabelTexture(lines, opts = {}) {
  const pad = 16;
  const lineH = 34;
  const font = (bold) => `${bold ? 700 : 500} 26px "Segoe UI", system-ui, sans-serif`;
  const measure = document.createElement('canvas').getContext('2d');
  let w = 0;
  for (const l of lines) {
    measure.font = font(l.bold);
    w = Math.max(w, measure.measureText(l.text).width);
  }
  const c = document.createElement('canvas');
  c.width = Math.ceil(w + pad * 2);
  c.height = lines.length * lineH + pad * 2 - 6;
  const g = c.getContext('2d');
  g.fillStyle = opts.neon ? 'rgba(4, 16, 10, 0.82)' : 'rgba(6, 12, 28, 0.78)';
  g.beginPath();
  const r = 14;
  g.moveTo(r, 0);
  g.arcTo(c.width, 0, c.width, c.height, r);
  g.arcTo(c.width, c.height, 0, c.height, r);
  g.arcTo(0, c.height, 0, 0, r);
  g.arcTo(0, 0, c.width, 0, r);
  g.closePath();
  g.fill();
  if (opts.neon) {
    g.save();
    g.strokeStyle = 'rgba(125, 255, 181, 0.85)';
    g.lineWidth = 2.5;
    g.shadowColor = '#38d67a';
    g.shadowBlur = 14;
    g.stroke();
    g.restore();
  } else {
    g.strokeStyle = 'rgba(120, 160, 255, 0.35)';
    g.lineWidth = 2;
    g.stroke();
  }
  lines.forEach((l, i) => {
    g.font = font(l.bold);
    g.fillStyle = l.color || '#e8eefc';
    g.fillText(l.text, pad, pad + 22 + i * lineH);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: c.width / c.height };
}

// ---------- main class ----------

export class Globe {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.cb = callbacks; // { onTap(lat,lng), onDoubleTap(lat,lng), onPinDragged(lat,lng) }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    // Start deep in space; cinematicIntro() swoops down to play distance on boot.
    this.camera.position.set(0, 2.2, 8.4);

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
    this.controls.minDistance = 1.04; // ~255 km altitude; tile streaming keeps it sharp
    // Starts loose so the intro can begin in deep space; cinematicIntro()
    // tightens it to the play range (4.2) when the swoop lands.
    this.controls.maxDistance = 9;
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
    this._activePointers = new Map(); // pointerId -> {x, y} (pinch-midpoint tracking)
    this._zoomAim = null;      // { x, y, t } screen point the user is zooming toward
    this._prevPinSnapshot = undefined; // pin state before the last single tap (double-tap restore)

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
    // Zoom-detail satellite tile streaming (self-disables if tiles unreachable).
    this.tileDetail = new TileDetail(this, geojson);
  }

  // Lat/lng of the point on the globe the camera is looking at.
  cameraLatLng() {
    const v = this.camera.position;
    const r = v.length();
    if (r === 0) return null;
    return { lat: toDeg(Math.asin(v.y / r)), lng: toDeg(Math.atan2(-v.z, v.x)) };
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

  // Zoom-aware feel, retuned every frame:
  // - rotateSpeed slows as you zoom in (fine control near the surface)
  // - zoomSpeed scales with ALTITUDE so each pinch consumes a roughly constant
  //   fraction of your height above the surface (the MapTap/Mapbox feel) instead
  //   of a fraction of distance-to-center, which slams into the floor up close.
  _tuneControls() {
    const d = this.camera.position.length();
    const t = THREE.MathUtils.clamp((d - this.controls.minDistance) / (this.controls.maxDistance - this.controls.minDistance), 0, 1);
    this.controls.rotateSpeed = 0.06 + t * 0.6;
    const alt = Math.max(d - GLOBE_RADIUS, 0.02); // floor the altitude, not the output
    this.controls.zoomSpeed = THREE.MathUtils.clamp(1.6 * alt / d, 0.06, 1.35);
  }

  // ---------- picking ----------

  _setPointerFromEvent(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _globeHitXY(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.sphere, false);
    if (!hits.length) return null;
    return vec3ToLatLng(hits[0].point);
  }

  _globeHit(e) { return this._globeHitXY(e.clientX, e.clientY); }

  // Fly partway toward a tapped surface point (double-tap zoom). Altitude-based:
  // never a bare distance multiplier, which could put the camera inside the globe.
  flyToward(lat, lng, factor = 0.55, ms = 480) {
    const d = this.camera.position.length();
    const newD = Math.max(this.controls.minDistance, 1 + (d - 1) * factor);
    const camDir = this.camera.position.clone().normalize();
    const tapDir = latLngToVec3(lat, lng, 1).normalize();
    const dir = camDir.lerp(tapDir, 0.7).normalize();
    const ll = vec3ToLatLng(dir);
    this.flyTo(ll.lat, ll.lng, newD, ms);
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

    // Pinch-midpoint / cursor tracking feeds the zoom aim assist in _tick.
    const noteAim = () => {
      if (this._activePointers.size === 2) {
        const [a, b] = [...this._activePointers.values()];
        this._zoomAim = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: performance.now() };
      }
    };

    el.addEventListener('pointerdown', (e) => {
      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      noteAim();
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
      if (this._activePointers.has(e.pointerId)) {
        this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        noteAim();
      }
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

    // Wheel zooms aim at the cursor too (OrbitControls handles the dolly itself).
    el.addEventListener('wheel', (e) => {
      if (e.deltaY < 0) this._zoomAim = { x: e.clientX, y: e.clientY, t: performance.now() };
    }, { passive: true });

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
      this._activePointers.delete(e.pointerId);
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
      // Double-tap on the bare map = zoom toward the point (not a guess). When
      // not in a round, double-tap still zooms (overview/menu browsing).
      if (!moved && quick) {
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
            if (this.interactive && wasPinPress) {
              // Double-tap ON the pin = fast confirm (the taught gesture).
              this._placePin(ll.lat, ll.lng);
              if (this.cb.onPinDoubleTap) this.cb.onPinDoubleTap(ll.lat, ll.lng);
            } else {
              // Map navigation: undo the pin move that tap 1 caused, then zoom.
              if (this.interactive && this._prevPinSnapshot !== undefined) {
                if (this._prevPinSnapshot) this._placePin(this._prevPinSnapshot.lat, this._prevPinSnapshot.lng);
                else this.clearPin();
              }
              this.flyToward(ll.lat, ll.lng);
              if (this.cb.onDoubleTapZoom) this.cb.onDoubleTapZoom();
            }
            this._prevPinSnapshot = undefined;
          } else {
            lastTapTime = now;
            lastTapPos = { x: e.clientX, y: e.clientY };
            if (this.interactive) {
              // Snapshot the pin before moving it, so a double-tap can restore.
              this._prevPinSnapshot = this.pinLatLng ? { ...this.pinLatLng } : null;
              this._placePin(ll.lat, ll.lng);
              if (this.cb.onTap) this.cb.onTap(ll.lat, ll.lng);
            }
          }
        }
      }
      downPos = null;
    });

    el.addEventListener('pointercancel', (e) => {
      this._activePointers.delete(e.pointerId);
      endDrag(e);
    });
  }

  // ---------- pin management ----------

  _spriteScaleForDistance() {
    // Proportional to camera height above the surface with NO floor worth naming:
    // zoomed close, the pin shrinks with the terrain instead of towering over it.
    const d = this.camera.position.length() - GLOBE_RADIUS;
    return THREE.MathUtils.clamp(d * 0.062, 0.003, 0.16);
  }

  _placePin(lat, lng) {
    this.pinLatLng = { lat, lng };
    const surface = latLngToVec3(lat, lng, GLOBE_RADIUS * 1.002);
    if (!this.pin) {
      // depthTest OFF + high renderOrder: the guess pin must NEVER hide behind
      // terrain/tile geometry, no matter how close the camera is.
      const mat = new THREE.SpriteMaterial({ map: this.pinTexGuess, depthTest: false, sizeAttenuation: true });
      this.pin = new THREE.Sprite(mat);
      this.pin.center.set(0.5, 0.06); // anchor at the pin's tip
      this.pin.renderOrder = 999;
      this.markerRoot.add(this.pin);

      const dotGeo = new THREE.CircleGeometry(0.006, 24);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.9, depthTest: false });
      this.pinDot = new THREE.Mesh(dotGeo, dotMat);
      this.pinDot.renderOrder = 998;
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
      const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true });
      const badge = new THREE.Sprite(mat);
      badge.center.set(0.5, 0.06);
      badge.renderOrder = 999;
      badge.position.copy(latLngToVec3(item.lat, item.lng, GLOBE_RADIUS * 1.002));
      const s0 = this._spriteScaleForDistance();
      badge.scale.set(s0, s0, 1);
      badge.userData.overviewIndex = i;
      this.markerRoot.add(badge);
      this._overviewMarkers.push(badge);

      // Floating info card next to the badge (name / score+distance / fact),
      // camera-facing so it stays readable while the globe spins.
      if (item.lines && item.lines.length) {
        const { tex: labelTex, aspect } = makeLabelTexture(item.lines);
        const labelMat = new THREE.SpriteMaterial({ map: labelTex, depthTest: false, sizeAttenuation: true });
        const label = new THREE.Sprite(labelMat);
        label.center.set(0.5, 1.45); // hang below the badge point
        label.position.copy(latLngToVec3(item.lat, item.lng, GLOBE_RADIUS * 1.004));
        label.userData.isLabel = true;
        label.userData.aspect = aspect;
        this.markerRoot.add(label);
        this._overviewMarkers.push(label);
      }

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

  // A glowing "light saber" beam planted in the globe (guess = silver, answer =
  // green) - readable at any zoom, visibly 3D as the globe spins.
  _makeBeam(coreColor, glowColor, lat, lng) {
    const group = new THREE.Group();
    const coreGeo = new THREE.CapsuleGeometry(0.0055, 0.10, 6, 20);
    coreGeo.translate(0, 0.0555, 0); // base sits at local y=0
    const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: coreColor, toneMapped: false }));
    core.renderOrder = 4;
    group.add(core);
    const glowGeo = new THREE.CapsuleGeometry(0.011, 0.104, 6, 20);
    glowGeo.translate(0, 0.0575, 0);
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
      color: glowColor, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.renderOrder = 5;
    group.add(glow);
    const surface = latLngToVec3(lat, lng, GLOBE_RADIUS * 0.9965); // embed the seam
    group.position.copy(surface);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), surface.clone().normalize());
    return group;
  }

  _makeCometHead() {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,220,140,0.6)');
    grad.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({
      map: tex, blending: THREE.AdditiveBlending, depthTest: false, transparent: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 6;
    return sprite;
  }

  // The graded reveal, MapTap-style: guess beam pops, a comet streaks the arc,
  // the answer beam + pulse + neon label land where the truth is.
  showAnswer(guess, answer, labelLines = null) {
    const now = performance.now();
    this._reveal = { start: now, answerShown: false, answer, labelLines };

    // Guess beam (immediately)
    if (guess) {
      const gb = this._makeBeam(0xf3f6ff, 0xaab8d8, guess.lat, guess.lng);
      gb.userData.beamBorn = now;
      this.markerRoot.add(gb);
      this._resultObjects.push(gb);
      this._beams = [gb];
    } else {
      this._beams = [];
    }

    // Comet arc (launches at +250ms inside _tick)
    if (guess) {
      const arc = this._buildArc(guess, answer);
      this.markerRoot.add(arc.line);
      this._resultObjects.push(arc.line);
      // Additive trail: same points, per-vertex colors; black = invisible under
      // additive blending, so ramping colors behind the head is per-vertex alpha
      // without a shader.
      const trailGeo = new THREE.BufferGeometry().setFromPoints(arc.points);
      const colors = new Float32Array((arc.segments + 1) * 3);
      trailGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      trailGeo.setDrawRange(0, 0);
      const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      trail.renderOrder = 5;
      this.markerRoot.add(trail);
      this._resultObjects.push(trail);
      const head = this._makeCometHead();
      head.visible = false;
      this.markerRoot.add(head);
      this._resultObjects.push(head);
      this._arcAnim = { ...arc, trail, trailGeo, head, launched: false };
    } else {
      this._arcAnim = null;
      this._revealAnswer(); // no guess (shouldn't happen in play) - show at once
    }

    // Fly the camera to frame both points, close enough for tile detail.
    const mid = this._midpointOnSphere(guess || answer, answer);
    const dist = guess ? this._angularDistance(guess, answer) : 0;
    const camDist = THREE.MathUtils.clamp(1.18 + dist * 1.7, 1.28, 3.6);
    this.flyTo(mid.lat, mid.lng, camDist);
  }

  // Second act of the reveal: answer beam + pulsing ring + neon label.
  _revealAnswer() {
    if (!this._reveal || this._reveal.answerShown) return;
    this._reveal.answerShown = true;
    const { answer, labelLines } = this._reveal;

    const ab = this._makeBeam(0x7dffb5, 0x38d67a, answer.lat, answer.lng);
    ab.userData.beamBorn = performance.now();
    this.markerRoot.add(ab);
    this._resultObjects.push(ab);
    this._beams.push(ab);

    const ringGeo = new THREE.RingGeometry(0.012, 0.016, 40);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38d67a, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    const ringPos = latLngToVec3(answer.lat, answer.lng, GLOBE_RADIUS * 1.006);
    ring.position.copy(ringPos);
    ring.lookAt(ringPos.clone().multiplyScalar(2));
    this.markerRoot.add(ring);
    this._resultObjects.push(ring);
    this._pulses.push({ mesh: ring, t: 0 });

    if (labelLines && labelLines.length) {
      const { tex, aspect } = makeLabelTexture(labelLines, { neon: true });
      const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true, transparent: true, opacity: 0 });
      const label = new THREE.Sprite(mat);
      label.center.set(0.5, -0.55); // float above the beam tip
      label.position.copy(latLngToVec3(answer.lat, answer.lng, GLOBE_RADIUS * 1.004));
      label.userData.isLabel = true;
      label.userData.aspect = aspect;
      label.userData.fadeBorn = performance.now();
      label.renderOrder = 7;
      this.markerRoot.add(label);
      this._resultObjects.push(label);
      this._resultLabel = label;
    }
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
    const mat = new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.35 });
    const line = new THREE.Line(geo, mat);
    geo.setDrawRange(0, 0);
    return { line, geo, segments, points, progress: 0 };
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
      obj.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }
    this._resultObjects = [];
    this._pulses = [];
    this._arcAnim = null;
    this._answerPin = null;
    this._beams = [];
    this._reveal = null;
    this._resultLabel = null;
  }

  // Boot cinematic: swoop from deep space down to play distance with a decaying
  // spin around the planet - the "arriving at Earth" opening.
  cinematicIntro(ms = 2600, endDistance = 2.9) {
    const startPos = this.camera.position.clone();
    const startDist = startPos.length();
    const startDir = startPos.clone().normalize();
    const spinTotal = Math.PI * 1.3;
    const yAxis = new THREE.Vector3(0, 1, 0);
    const endY = 0.19; // settle at a gentle tilt
    const start = performance.now();
    this._flights = [{
      step: () => {
        const t = Math.min(1, (performance.now() - start) / ms);
        const e = 1 - Math.pow(1 - t, 3); // easeOutCubic - fast arrival, soft landing
        const dir = startDir.clone().applyAxisAngle(yAxis, spinTotal * e);
        dir.y += (endY - startDir.y) * e;
        dir.normalize();
        const d = startDist + (endDistance - startDist) * e;
        this.camera.position.copy(dir.multiplyScalar(d));
        this.camera.lookAt(0, 0, 0);
        if (t >= 1) this.controls.maxDistance = 4.2; // back to normal play range
        return t >= 1;
      },
    }];
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
    // Self-healing: if anything ever corrupts the camera (NaN), snap back to a
    // sane view instead of freezing the globe forever.
    if (!isFinite(this.camera.position.x) || !isFinite(this.camera.position.y) || !isFinite(this.camera.position.z)) {
      this.camera.position.set(0, 0.5, 2.9);
      this.camera.lookAt(0, 0, 0);
      this._lastTickD = 2.9;
    }
    this._tuneControls();
    this.controls.update();

    // Zoom aim assist: as the user zooms IN, drift the point under their
    // fingers/cursor toward screen center by the same fraction of altitude they
    // consumed this frame. Target stays (0,0,0); OrbitControls re-derives its
    // spherical from camera.position each update, so this composes cleanly.
    {
      const d = this.camera.position.length();
      const prev = this._lastTickD !== undefined ? this._lastTickD : d;
      this._lastTickD = d;
      if (
        d < prev - 1e-7 && prev > 1 &&
        this._zoomAim && performance.now() - this._zoomAim.t < 250 &&
        !this._flights.length && !this.draggingPin
      ) {
        const ll = this._globeHitXY(this._zoomAim.x, this._zoomAim.y);
        if (ll) { // limb miss -> skip the frame
          const targetDir = latLngToVec3(ll.lat, ll.lng, 1);
          const camDir = this.camera.position.clone().normalize();
          const angle = camDir.angleTo(targetDir);
          const f = THREE.MathUtils.clamp(1 - (d - 1) / (prev - 1), 0, 0.5);
          const step = Math.min(angle * f * 1.5, 0.15);
          if (angle > 1e-4 && step > 1e-5) {
            const axis = new THREE.Vector3().crossVectors(camDir, targetDir).normalize();
            this.camera.position.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, step));
            this.camera.lookAt(0, 0, 0);
          }
        }
      }
    }

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
      } else if (o.userData && o.userData.isLabel) {
        const k = s * 1.05; // card height tracks the badge size
        o.scale.set(k * o.userData.aspect, k, 1);
      }
    }

    // Reveal choreography: beam pops, comet flight, label fade.
    const nowMs = performance.now();
    if (this._beams && this._beams.length) {
      // Beams keep a legible size while zooming and pop in with easeOutBack.
      const kBase = THREE.MathUtils.clamp((this.camera.position.length() - 1) / 1.6, 0.16, 1);
      for (const beam of this._beams) {
        const age = (nowMs - beam.userData.beamBorn) / 350;
        const tt = Math.min(1, age);
        const c1 = 1.70158, c3 = c1 + 1;
        const pop = 1 + c3 * Math.pow(tt - 1, 3) + c1 * Math.pow(tt - 1, 2); // easeOutBack
        beam.scale.set(kBase, kBase * Math.max(0.001, pop), kBase);
      }
    }
    if (this._arcAnim && this._reveal) {
      const elapsed = nowMs - this._reveal.start;
      if (!this._arcAnim.launched && elapsed >= 250) {
        this._arcAnim.launched = true;
        this._arcAnim.head.visible = true;
      }
      if (this._arcAnim.launched) {
        const t = Math.min(1, (elapsed - 250) / 700);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
        const headIdx = Math.floor(e * this._arcAnim.segments);
        this._arcAnim.geo.setDrawRange(0, headIdx + 1);
        // Trail: additive colors ramp black -> gold -> white toward the head.
        const TRAIL = 22;
        const colors = this._arcAnim.trailGeo.getAttribute('color');
        for (let i = 0; i <= this._arcAnim.segments; i++) {
          const back = headIdx - i;
          let r = 0, g = 0, b = 0;
          if (back >= 0 && back <= TRAIL) {
            const w = 1 - back / TRAIL;
            r = 0.25 + 0.75 * w; g = 0.2 + 0.66 * w; b = 0.55 * w * w;
          }
          colors.setXYZ(i, r, g, b);
        }
        colors.needsUpdate = true;
        this._arcAnim.trailGeo.setDrawRange(Math.max(0, headIdx - TRAIL), Math.min(TRAIL, headIdx) + 1);
        // Head position + pulse
        const p = this._arcAnim.points[Math.min(headIdx, this._arcAnim.segments)];
        this._arcAnim.head.position.copy(p);
        const hk = s * 0.5 * (1 + 0.15 * Math.sin(nowMs / 60));
        this._arcAnim.head.scale.set(hk, hk, 1);
        if (t >= 1) {
          this._arcAnim.head.visible = false;
          this._revealAnswer(); // landing: answer beam + ring + label
        }
      }
    }
    if (this._resultLabel) {
      const fade = Math.min(1, (nowMs - this._resultLabel.userData.fadeBorn) / 250);
      this._resultLabel.material.opacity = fade;
      const k = s * 1.1;
      this._resultLabel.scale.set(k * this._resultLabel.userData.aspect, k, 1);
    }

    // Zoom-detail tile streaming.
    if (this.tileDetail) this.tileDetail.update(dt);

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
