// MarcTap 3D globe renderer built on three.js.
// Handles: painting an equirectangular land/ocean texture from GeoJSON, orbit controls,
// tap/double-tap picking, a draggable candidate pin, result markers, and great-circle arcs.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toRad, toDeg } from './geo.js';
import { mulberry32 } from './rng.js';
import { TileDetail } from './tiledetail.js';

const GLOBE_RADIUS = 1;

// Marker sprite sizing (see _spriteScaleForDistance). K is roughly "world units
// of sprite per world unit of camera distance"; with a 45deg fov, K = 0.062 is
// ~7.5% of the viewport height and K = 0.030 is ~3.6%.
const SPRITE_K_FAR = 0.062;   // wide / whole-globe view
const SPRITE_K_NEAR = 0.030;  // fully zoomed in, where precision matters
const SPRITE_NEAR_ALT = 0.10; // ~640 km up: below this the pin is at its smallest
const SPRITE_FAR_ALT = 1.10;  // above this it is back to the wide-view size
const PIN_TAP_RADIUS_PX = 30; // forgiveness around the pin tip for double-tap-to-confirm

// Pinch-zoom feel. The dolly is OURS (OrbitControls' is undamped and applied
// per pointer event, which on a 120 Hz iPhone lands several full steps per
// frame); every gesture event only moves a TARGET distance, and _tick eases
// the camera toward it, so finger noise can never reverse or spike the zoom.
const ZOOM_K = 1.0;        // altitude ∝ (gap0/gap)^K
const ZOOM_TAU = 0.08;     // s — exponential approach of d -> targetD
const GAP_EMA = 0.35;      // per-frame smoothing of the finger gap
const AIM_EMA = 0.35;      // per-event smoothing of the pinch midpoint
const AIM_GAIN = 1.5;      // aim assist: rotate by (altitude fraction consumed) * gain
const AIM_STEP_MAX = 0.06; // rad per frame (~3.4°; was 0.15 = 8.6°, the "jump")
const AIM_LIVE_MS = 400;   // aim stays live this long after the last zoom event (the smoothed dolly is still settling)
const WHEEL_C = 0.18;      // altitude *= exp(±C) per 100 px of wheel
const MIN_GAP_PX = 12;
const ROTATE_MIN = 0.08;   // rotateSpeed floor near the surface
const DT_MIN = 1 / 240, DT_MAX = 1 / 20;

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

    // Star field + deep-space scenery (moon, planets, sun glare, Milky Way)
    this.scene.add(this._makeStars());
    this._makeSpaceScenery(sun.position);

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
    // The dolly is ours (see ZOOM_* above). DOLLY_ROTATE is REQUIRED with
    // enableZoom=false: with the default DOLLY_PAN + enablePan=false,
    // OrbitControls' two-finger start returns early and leaves finger-1's
    // rotateStart live, so the first two-finger move lurches by half the gap.
    // DOLLY_ROTATE anchors on the midpoint and gives damped two-finger drift.
    this.controls.enableZoom = false;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.4;

    // Pin state
    this.pin = null;           // candidate guess sprite
    this.pinDot = null;        // exact surface dot under the pin
    this.pinLatLng = null;
    this.draggingPin = false;
    this.interactive = false;  // taps place pins only when true
    this._activePointers = new Map(); // pointerId -> {x, y} (pinch-midpoint tracking)
    this._zoomAim = null;      // { x, y, t, src } screen point the user is zooming toward
    this._targetD = this.camera.position.length(); // smoothed-dolly target distance
    this._pinch = null;        // { gap } EMA'd finger gap of the live two-finger gesture
    this._dtOverride = null;   // test harness: deterministic frame time
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

  // rotateSpeed slows as you zoom in (fine control near the surface).
  _tuneControls() {
    const d = this.camera.position.length();
    const t = THREE.MathUtils.clamp((d - this.controls.minDistance) / (this.controls.maxDistance - this.controls.minDistance), 0, 1);
    this.controls.rotateSpeed = ROTATE_MIN + t * 0.6;
  }

  _setTargetD(d) {
    this._targetD = THREE.MathUtils.clamp(d, this.controls.minDistance, this.controls.maxDistance);
  }

  // Scale the target ALTITUDE (not distance-to-center), so a pinch consumes a
  // constant fraction of your height at every zoom level.
  _zoomAltBy(factor) {
    const alt = Math.max(this._targetD - GLOBE_RADIUS, 1e-4);
    this._setTargetD(GLOBE_RADIUS + alt * factor);
  }

  // Analytic ray/sphere aim point (never the faceted mesh, never null): a miss
  // projects the ray's closest approach onto the sphere inside the visible cap.
  _aimDirAnalytic(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return this.camera.position.clone().normalize();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.camera.updateMatrixWorld();
    const o = this.camera.position;
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(this.camera).sub(o).normalize();
    const b = o.dot(v), c = o.lengthSq() - 1, disc = b * b - c;
    if (disc >= 0) return o.clone().addScaledVector(v, -b - Math.sqrt(disc)).normalize();
    const p = o.clone().addScaledVector(v, -b).normalize();
    const camDir = o.clone().normalize();
    const cap = Math.acos(1 / o.length());
    if (camDir.angleTo(p) <= cap) return p;
    const axis = new THREE.Vector3().crossVectors(camDir, p).normalize();
    return camDir.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, cap * 0.98));
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

  // Double-tapping the pin confirms the guess; double-tapping bare map ZOOMS,
  // so a near-miss is not a no-op, it does the wrong thing. Now that the pin
  // draws small at deep zoom, the sprite's own geometry is too tight a target
  // (~29 px tall on a phone), so a fixed PIXEL radius around the pin's tip
  // counts as a hit too. Falls back to the geometric test when the canvas has
  // no measurable size (headless/hidden pane), where the projection is unsafe.
  _pinHit(e) {
    if (!this.pin) return false;
    this._setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.intersectObject(this.pin, false).length > 0) return true;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.height || !rect.width) return false;
    const ndc = this.pin.position.clone().project(this.camera);
    if (ndc.z > 1) return false; // behind the camera
    const dxPx = (ndc.x - this.pointer.x) * rect.width * 0.5;
    const dyPx = (ndc.y - this.pointer.y) * rect.height * 0.5;
    return Math.hypot(dxPx, dyPx) <= PIN_TAP_RADIUS_PX;
  }

  _bindPointerEvents() {
    const el = this.renderer.domElement;
    let downPos = null;
    let downTime = 0;
    let moved = false;
    let lastTapTime = 0;
    let lastTapPos = null;

    // Two-finger gesture: the gap drives the smoothed dolly target, the
    // (filtered) midpoint feeds the aim assist in _tick.
    const pinchPair = () => {
      const [a, b] = [...this._activePointers.values()];
      return { gap: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    };
    // Events only record the finger positions; the pair is SAMPLED once per
    // frame in _tick. Each finger's move arrives as its own event, so a
    // per-event read sees a momentarily diagonal pair — a transient that is
    // always positive and therefore biases any smoothing into a slow creep.
    const startPinch = () => {
      const p = pinchPair();
      this._pinch = { gap: p.gap, appliedGap: p.gap, moved: false };
      this._zoomAim = { x: p.mx, y: p.my, t: performance.now() };
    };
    const movePinch = () => {
      if (!this._pinch) return;
      this._pinch.moved = true;
      this._zoomAim.t = performance.now();
    };
    // The aim is kept (recency-gated) so the assist rides the dolly's settle.
    const endPinch = () => { this._pinch = null; };

    el.addEventListener('pointerdown', (e) => {
      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._activePointers.size === 2) startPinch();
      else this._pinch = null; // a third finger cancels the pinch
      downPos = { x: e.clientX, y: e.clientY };
      downTime = performance.now();
      moved = false;
      // Start dragging the existing pin if the press began on it.
      if (this.interactive && this._pinHit(e)) {
        this.draggingPin = true; // controls.enabled is derived per frame in _tick
        this.container.classList.add('dragging-pin');
        el.setPointerCapture(e.pointerId);
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (this._activePointers.has(e.pointerId)) {
        this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._activePointers.size === 2) movePinch();
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

    // Wheel: our smoothed dolly (OrbitControls' zoom is off, so we also own
    // preventDefault — otherwise the page scrolls).
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this._flights.length) return;
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
      this._zoomAltBy(Math.exp(THREE.MathUtils.clamp(px, -200, 200) / 100 * WHEEL_C));
      if (e.deltaY < 0) this._zoomAim = { x: e.clientX, y: e.clientY, t: performance.now() };
    }, { passive: false });
    // iOS Safari page-zoom fallback (touch-action:none already covers most cases).
    el.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

    const endDrag = (e) => {
      if (this.draggingPin) {
        this.draggingPin = false;
        this.container.classList.remove('dragging-pin');
        try { el.releasePointerCapture(e.pointerId); } catch { /* ok */ }
        return true;
      }
      return false;
    };

    el.addEventListener('pointerup', (e) => {
      this._activePointers.delete(e.pointerId);
      endPinch();
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
      endPinch();
      endDrag(e);
    });
  }

  // ---------- pin management ----------

  // A sprite's SCREEN size is its world scale divided by its distance from the
  // camera, so scaling by that distance is what holds it steady while zooming.
  // Two corrections on top of that, both from real complaints:
  //  - the old version scaled by camera ALTITUDE and floored at 0.003, so past
  //    ~300 km up the pin stopped shrinking and grew on screen instead: at full
  //    zoom it covered ~9% of the viewport, hiding the very thing being pinned.
  //  - it also used altitude for every sprite, so a pin near the horizon (much
  //    further from the camera than the ground directly below it) drew small.
  // The target screen fraction now EASES DOWN as you zoom in - a pin sized for
  // the whole-globe view is far too heavy over a single street.
  _spriteScaleForDistance(worldPos = null) {
    const alt = this.camera.position.length() - GLOBE_RADIUS;
    const t = THREE.MathUtils.smoothstep(alt, SPRITE_NEAR_ALT, SPRITE_FAR_ALT);
    const k = THREE.MathUtils.lerp(SPRITE_K_NEAR, SPRITE_K_FAR, t);
    const d = worldPos ? this.camera.position.distanceTo(worldPos) : alt;
    return THREE.MathUtils.clamp(d * k, 0.0004, 0.16);
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
    const s = this._spriteScaleForDistance(surface);
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
      const s0 = this._spriteScaleForDistance(badge.position);
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
  // Visited globe: one small dot per place ever played, tinted by best score.
  // Reuses the overview marker list so clearOverview() removes them.
  showVisited(dots) {
    this.clearOverview();
    const geo = new THREE.CircleGeometry(0.0085, 16);
    for (const d of dots) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(d.color || '#38d67a'), transparent: true, opacity: 0.9, depthTest: true });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(latLngToVec3(d.lat, d.lng, GLOBE_RADIUS * 1.004));
      m.lookAt(m.position.clone().multiplyScalar(2));
      this.markerRoot.add(m);
      this._overviewMarkers.push(m);
    }
  }

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
        if (t >= 1) {
          this.controls.maxDistance = 8.5; // play range incl. deep-space view
          this._setTargetD(this.camera.position.length());
        }
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
        if (t >= 1) this._setTargetD(distance);
        return t >= 1;
      },
    }];
  }

  // ---------- background ----------

  // Deep-space scenery, visible when fully zoomed out: the Moon at (roughly)
  // its real current position with sun-lit phases, bright planet sprites along
  // the ecliptic, a sun glare, and a Milky Way band. All painted procedurally.
  _makeSpaceScenery(sunPos) {
    const space = new THREE.Group();
    this.scene.add(space);

    // --- Milky Way: a dense band of faint stars on a tilted plane ---
    {
      const rng = mulberry32(777);
      const count = 3200;
      const positions = new Float32Array(count * 3);
      const tilt = 1.05; // radians - band crosses the sky diagonally
      for (let i = 0; i < count; i++) {
        const theta = rng() * Math.PI * 2;
        const spread = (rng() + rng() + rng() - 1.5) * 0.16; // gaussian-ish thin band
        const r = 55 + rng() * 25;
        const x = r * Math.cos(theta);
        const z = r * Math.sin(theta);
        const y = r * spread;
        // tilt the band
        positions[i * 3] = x;
        positions[i * 3 + 1] = y * Math.cos(tilt) - z * Math.sin(tilt) * 0.35;
        positions[i * 3 + 2] = z * Math.cos(tilt) + y * Math.sin(tilt);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      space.add(new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xd8e4ff, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.5,
      })));
    }

    // --- Sun glare in the light's direction ---
    {
      const S = 128;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
      grad.addColorStop(0, 'rgba(255,252,240,1)');
      grad.addColorStop(0.18, 'rgba(255,244,200,0.9)');
      grad.addColorStop(0.5, 'rgba(255,225,150,0.25)');
      grad.addColorStop(1, 'rgba(255,225,150,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
      const mat = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true,
      });
      const sunSprite = new THREE.Sprite(mat);
      sunSprite.position.copy(sunPos.clone().normalize().multiplyScalar(70));
      sunSprite.scale.set(14, 14, 1);
      space.add(sunSprite);
    }

    // --- Planets: bright tinted dots along the ecliptic (Saturn gets a ring) ---
    {
      const planets = [
        { name: 'Venus', color: '#fff3d6', lonDeg: 55, size: 0.55, dist: 46 },
        { name: 'Mars', color: '#ff9d7a', lonDeg: 130, size: 0.4, dist: 50 },
        { name: 'Jupiter', color: '#ffd9a8', lonDeg: 235, size: 0.7, dist: 54 },
        { name: 'Saturn', color: '#f2e0b8', lonDeg: 310, size: 0.55, dist: 58 },
      ];
      const dot = (color) => {
        const S = 64;
        const c = document.createElement('canvas');
        c.width = S; c.height = S;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, S, S);
        return new THREE.CanvasTexture(c);
      };
      for (const p of planets) {
        const mat = new THREE.SpriteMaterial({
          map: dot(p.color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
        });
        const s = new THREE.Sprite(mat);
        const lon = (p.lonDeg * Math.PI) / 180;
        s.position.set(p.dist * Math.cos(lon), p.dist * 0.08 * Math.sin(lon * 2), p.dist * Math.sin(lon));
        s.scale.set(p.size, p.size, 1);
        space.add(s);
        if (p.name === 'Saturn') {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.5, 0.85, 32),
            new THREE.MeshBasicMaterial({ color: 0xd8c9a0, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
          );
          ring.position.copy(s.position);
          ring.lookAt(0, 0, 0);
          ring.rotateX(0.5);
          space.add(ring);
        }
      }
    }

    // --- The Moon: real size ratio, painted craters, positioned by today's
    //     mean orbital longitude, lit by the same sun so phases are right ---
    {
      const moonTex = this._paintMoonTexture();
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(0.273, 48, 32), // true Moon/Earth size ratio
        new THREE.MeshPhongMaterial({ map: moonTex, shininess: 2 })
      );
      // Mean ecliptic longitude of the Moon (low-precision, plenty for scenery):
      // L = 218.316° + 13.176396°/day since J2000.
      const daysSinceJ2000 = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 86400000;
      const lonDeg = ((218.316 + 13.176396 * daysSinceJ2000) % 360 + 360) % 360;
      const lon = (lonDeg * Math.PI) / 180;
      const MOON_DIST = 7; // stylized (true 60 earth-radii won't fit the scene)
      const incl = 0.18; // slight tilt so it doesn't sit exactly on the equator
      moon.position.set(
        MOON_DIST * Math.cos(lon),
        MOON_DIST * Math.sin(lon) * Math.sin(incl),
        MOON_DIST * Math.sin(lon) * Math.cos(incl)
      );
      moon.lookAt(0, 0, 0); // tidally locked - same face toward Earth
      space.add(moon);
      this._moon = moon;
      this._moonLon = lon;
    }
  }

  // Paints an original moon texture: grey base, darker maria blobs, craters.
  _paintMoonTexture() {
    const W = 512, H = 256;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const rng = mulberry32(4242);
    g.fillStyle = '#b9b7ae';
    g.fillRect(0, 0, W, H);
    // maria (dark plains)
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(110, 110, 108, ${0.25 + rng() * 0.3})`;
      g.beginPath();
      g.ellipse(rng() * W, H * 0.2 + rng() * H * 0.6, 20 + rng() * 55, 14 + rng() * 34, rng() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    // craters
    for (let i = 0; i < 160; i++) {
      const x = rng() * W, y = rng() * H, r = 1 + rng() * 6;
      g.fillStyle = `rgba(90, 90, 88, ${0.25 + rng() * 0.35})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(215, 214, 205, ${0.2 + rng() * 0.3})`;
      g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

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
    const rawDt = this._clock.getDelta();
    // Clamped so a tab switch can't teleport; the harness may pin it.
    const dt = this._dtOverride ?? THREE.MathUtils.clamp(rawDt, DT_MIN, DT_MAX);
    // Self-healing: if anything ever corrupts the camera (NaN), snap back to a
    // sane view instead of freezing the globe forever.
    if (!isFinite(this.camera.position.x) || !isFinite(this.camera.position.y) || !isFinite(this.camera.position.z)) {
      // Flush OrbitControls' internal deltas too: with damping on, a NaN in
      // sphericalDelta survives every update and re-corrupts the camera each
      // frame. The damping-off branch of update() zeroes it.
      this.controls.enableDamping = false;
      this.controls.update();
      this.controls.enableDamping = true;
      this.camera.position.set(0, 0.5, 2.9);
      this.camera.lookAt(0, 0, 0);
      this._lastTickD = 2.9;
      this._targetD = 2.9;
      this._pinch = null;
      this._zoomAim = null;
    }
    // Input is ignored while a flight owns the camera or the pin is being
    // dragged — otherwise a drag accumulates inside OrbitControls and is
    // released as a lurch the moment the flight ends.
    this.controls.enabled = !this.draggingPin && !this._flights.length;
    this._tuneControls();
    this.controls.update(dt); // dt makes autoRotate frame-rate independent

    // Sample the two-finger pair once per frame: smooth the gap, apply the
    // ratio against the gap last applied (ratios telescope exactly), and
    // smooth the midpoint for the aim assist.
    if (this._pinch && this._activePointers.size === 2 && !this._flights.length && !this.draggingPin) {
      const [pa, pb] = [...this._activePointers.values()];
      const gapNow = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      this._pinch.gap += (gapNow - this._pinch.gap) * GAP_EMA;
      const { gap, appliedGap } = this._pinch;
      if (gap > MIN_GAP_PX && appliedGap > MIN_GAP_PX) this._zoomAltBy(Math.pow(appliedGap / gap, ZOOM_K));
      this._pinch.appliedGap = gap;
      const a = this._zoomAim;
      a.x += ((pa.x + pb.x) / 2 - a.x) * AIM_EMA;
      a.y += ((pa.y + pb.y) / 2 - a.y) * AIM_EMA;
    }
    // Smoothed dolly: ease toward the gesture's target distance. All the
    // pointer events that landed since the last frame have already folded
    // into _targetD, so a 120 Hz finger stream can't spike or reverse this.
    if (!this._flights.length) {
      const d = this.camera.position.length();
      const k = 1 - Math.exp(-dt / ZOOM_TAU);
      const nd = Math.abs(this._targetD - d) < 1e-6 ? this._targetD : d + (this._targetD - d) * k;
      if (nd !== d) {
        this.camera.position.setLength(nd);
        this.camera.lookAt(0, 0, 0);
      }
    }

    // Zoom aim assist: as the user zooms IN, drift the point under their
    // fingers/cursor toward screen center by the fraction of altitude they
    // consumed this frame (now small and continuous, because the dolly above
    // is smoothed). Target stays (0,0,0); OrbitControls re-derives its
    // spherical from camera.position each update, so this composes cleanly.
    {
      const d = this.camera.position.length();
      const prev = this._lastTickD !== undefined ? this._lastTickD : d;
      this._lastTickD = d;
      const aim = this._zoomAim;
      const live = aim && performance.now() - aim.t < AIM_LIVE_MS;
      if (d < prev - 1e-7 && prev > 1 && live && !this._flights.length && !this.draggingPin) {
        const targetDir = this._aimDirAnalytic(aim.x, aim.y);
        const camDir = this.camera.position.clone().normalize();
        const angle = camDir.angleTo(targetDir);
        const f = THREE.MathUtils.clamp(1 - (d - 1) / (prev - 1), 0, 0.5);
        const step = Math.min(angle * f * AIM_GAIN, AIM_STEP_MAX);
        if (angle > 1e-4 && step > 1e-6) {
          const axis = new THREE.Vector3().crossVectors(camDir, targetDir).normalize();
          if (axis.lengthSq() > 0.5) {
            this.camera.position.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, step));
            this.camera.lookAt(0, 0, 0);
          }
        }
      }
    }

    // Camera flights own the camera; keep the dolly target glued to them so
    // the smoothing above never fights a flight or snaps back afterwards.
    if (this._flights.length) {
      const done = this._flights[0].step();
      this._targetD = this.camera.position.length();
      this._lastTickD = this._targetD;
      if (done) { this._flights = []; this._pinch = null; }
    }

    // Keep marker sprites a steady SCREEN size while zooming - each measured
    // from its own position, so a marker near the horizon doesn't shrink away.
    if (this.pin) { const s = this._spriteScaleForDistance(this.pin.position); this.pin.scale.set(s, s, 1); }
    if (this._answerPin) { const s = this._spriteScaleForDistance(this._answerPin.position); this._answerPin.scale.set(s, s, 1); }
    for (const o of this._overviewMarkers) {
      if (o.userData && o.userData.overviewIndex !== undefined) {
        const s = this._spriteScaleForDistance(o.position);
        const k = o.userData.selected ? s * 1.25 : s;
        o.scale.set(k, k, 1);
      } else if (o.userData && o.userData.isLabel) {
        const k = this._spriteScaleForDistance(o.position) * 1.05; // card height tracks the badge
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
        const hk = this._spriteScaleForDistance(p) * 0.5 * (1 + 0.15 * Math.sin(nowMs / 60));
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
      const k = this._spriteScaleForDistance(this._resultLabel.position) * 1.1;
      this._resultLabel.scale.set(k * this._resultLabel.userData.aspect, k, 1);
    }

    // Zoom-detail tile streaming.
    if (this.tileDetail) this.tileDetail.update(dt);

    // The Moon creeps along its orbit in real time (13.18°/day - correct, and
    // just barely perceptible across a long session).
    if (this._moon) {
      this._moonLon += dt * (13.176396 / 86400) * (Math.PI / 180);
      const MOON_DIST = 7, incl = 0.18;
      this._moon.position.set(
        MOON_DIST * Math.cos(this._moonLon),
        MOON_DIST * Math.sin(this._moonLon) * Math.sin(incl),
        MOON_DIST * Math.sin(this._moonLon) * Math.cos(incl)
      );
      this._moon.lookAt(0, 0, 0);
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
