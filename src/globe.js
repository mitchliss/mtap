// MarcTap 3D globe renderer built on three.js.
// Handles: painting an equirectangular land/ocean texture from GeoJSON, orbit controls,
// tap/double-tap picking, a draggable candidate pin, result markers, and great-circle arcs.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toRad, toDeg } from './geo.js';
import { mulberry32 } from './rng.js';
import { TileDetail } from './tiledetail.js';
import { SpaceScenery } from './space.js';
import { Sky } from './sky.js';
import { createAtmosphere } from './atmosphere.js';
import { glowDiscTexture, makeArcRibbon, softRingTexture } from './effects.js';
import { GFX, K_ROT, applySunShader, rotationSpeedForAltitude, selectTextureTier, smoothingAlpha, subsolarPoint } from './graphics.js';

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
const GESTURE_TAU = 0.045;
const DAMP_TAU = 0.19;
const AIM_GAIN = 1.5;      // aim assist: rotate by (altitude fraction consumed) * gain
const AIM_LIVE_MS = 150;
const WHEEL_C = 0.18;      // altitude *= exp(±C) per 100 px of wheel
const MIN_GAP_PX = 12;
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

async function loadTieredTexture(url, size) {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = size[0]; canvas.height = size[1];
  canvas.getContext('2d').drawImage(img, 0, 0, size[0], size[1]);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

async function buildEarthTexture(geojson, baseUrl, size = null) {
  const img = await loadImage(`${baseUrl}textures/earth-blue-marble.jpg`);
  const W = size ? size[0] : img.naturalWidth, H = size ? size[1] : img.naturalHeight;
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
  // Drawn in 128-unit space at 2x, so it stays crisp on high-DPI phones.
  const S = 256, U = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.scale(S / U, S / U);
  const base = new THREE.Color(color);
  const shade = (k) => base.clone().multiplyScalar(k).getStyle();
  // Classic map pin: circle head + tapered tail, tip at bottom center.
  const body = () => {
    ctx.beginPath();
    ctx.arc(0, 44, 32, Math.PI * 0.8, Math.PI * 0.2);
    ctx.quadraticCurveTo(14, 84, 0, 116);
    ctx.quadraticCurveTo(-14, 84, -Math.cos(Math.PI * 0.2) * 32, 44 + Math.sin(Math.PI * 0.8) * 32);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(U / 2, 0);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 3;
  body();
  const enamel = ctx.createLinearGradient(-26, 14, 24, 112);
  enamel.addColorStop(0, base.clone().lerp(new THREE.Color('#ffffff'), 0.38).getStyle());
  enamel.addColorStop(0.34, color);
  enamel.addColorStop(1, shade(0.5));
  ctx.fillStyle = enamel;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  // Dark keyline, then a light inner rim: reads on snow, sand and sea alike.
  ctx.lineJoin = 'round';
  ctx.strokeStyle = shade(0.34); ctx.lineWidth = 2.6; ctx.stroke();
  ctx.save(); body(); ctx.clip();
  // Gloss: a soft specular sweep across the upper-left of the head.
  const gloss = ctx.createRadialGradient(-12, 28, 1, -10, 32, 30);
  gloss.addColorStop(0, 'rgba(255,255,255,0.62)');
  gloss.addColorStop(0.5, 'rgba(255,255,255,0.14)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss; ctx.fillRect(-40, 0, 80, 80);
  // Core shadow down the right flank gives the body some roundness.
  const flank = ctx.createLinearGradient(-6, 0, 34, 0);
  flank.addColorStop(0, 'rgba(0,0,0,0)'); flank.addColorStop(1, 'rgba(0,0,0,0.26)');
  ctx.fillStyle = flank; ctx.fillRect(-40, 0, 80, 120);
  ctx.restore();
  // Head ring + inset dot.
  ctx.beginPath(); ctx.arc(0, 44, 28.5, 0, Math.PI * 2);
  ctx.strokeStyle = ringColor; ctx.lineWidth = 3.2; ctx.globalAlpha = 0.9; ctx.stroke(); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(0, 45.2, 12.4, 0, Math.PI * 2);
  ctx.fillStyle = shade(0.42); ctx.fill();
  const dot = ctx.createRadialGradient(-3, 40, 1, 0, 44, 12);
  dot.addColorStop(0, '#ffffff'); dot.addColorStop(1, '#e4e9f2');
  ctx.beginPath(); ctx.arc(0, 44, 11.6, 0, Math.PI * 2);
  ctx.fillStyle = dot; ctx.fill();
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Numbered round badge for the post-game overview: colored circle + white number + tail.
function makeBadgeTexture(number, color) {
  const S = 256, U = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.scale(S / U, S / U);
  const base = new THREE.Color(color);
  const fill = ctx.createLinearGradient(0, 12, 0, 116);
  fill.addColorStop(0, base.clone().lerp(new THREE.Color('#ffffff'), 0.28).getStyle());
  fill.addColorStop(0.45, color);
  fill.addColorStop(1, base.clone().multiplyScalar(0.58).getStyle());
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = fill;
  // tail
  ctx.beginPath();
  ctx.moveTo(U / 2 - 12, 78);
  ctx.quadraticCurveTo(U / 2, 92, U / 2, 116);
  ctx.quadraticCurveTo(U / 2, 92, U / 2 + 12, 78);
  ctx.closePath();
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.arc(U / 2, 48, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.arc(U / 2, 48, 36, 0, Math.PI * 2); ctx.clip();
  const gloss = ctx.createRadialGradient(U / 2 - 12, 26, 2, U / 2 - 8, 32, 40);
  gloss.addColorStop(0, 'rgba(255,255,255,0.42)'); gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss; ctx.fillRect(0, 0, U, 96);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(U / 2, 48, 35, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 3.4;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,40,20,0.55)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5;
  ctx.font = '800 44px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), U / 2, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
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
  // Logical size W x H, painted at 2x so the text stays sharp when the card
  // is drawn large on a high-DPI screen.
  const W = Math.ceil(w + pad * 2), H = lines.length * lineH + pad * 2 - 6;
  const c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  const r = 14;
  const panel = () => {
    g.beginPath();
    g.moveTo(r + 1, 1);
    g.arcTo(W - 1, 1, W - 1, H - 1, r);
    g.arcTo(W - 1, H - 1, 1, H - 1, r);
    g.arcTo(1, H - 1, 1, 1, r);
    g.arcTo(1, 1, W - 1, 1, r);
    g.closePath();
  };
  const glass = g.createLinearGradient(0, 0, 0, H);
  if (opts.neon) { glass.addColorStop(0, 'rgba(10, 34, 24, 0.90)'); glass.addColorStop(1, 'rgba(3, 14, 9, 0.88)'); }
  else { glass.addColorStop(0, 'rgba(18, 30, 58, 0.88)'); glass.addColorStop(1, 'rgba(6, 12, 28, 0.86)'); }
  panel(); g.fillStyle = glass; g.fill();
  if (opts.neon) {
    g.save();
    g.strokeStyle = 'rgba(125, 255, 181, 0.9)';
    g.lineWidth = 2;
    g.shadowColor = '#38d67a';
    g.shadowBlur = 10;
    g.stroke();
    g.restore();
  } else {
    g.strokeStyle = 'rgba(140, 180, 255, 0.42)';
    g.lineWidth = 1.5;
    g.stroke();
  }
  // A hairline highlight along the top edge, like light catching glass.
  g.save(); panel(); g.clip();
  const sheen = g.createLinearGradient(0, 0, 0, 16);
  sheen.addColorStop(0, 'rgba(255,255,255,0.13)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen; g.fillRect(0, 0, W, 16);
  g.restore();
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 3; g.shadowOffsetY = 1;
  lines.forEach((l, i) => {
    g.font = font(l.bold);
    g.fillStyle = l.color || '#e8eefc';
    g.fillText(l.text, pad, pad + 22 + i * lineH);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: W / H };
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
    this.renderer.toneMapping = GFX.toneMapping ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    const mobile = navigator.maxTouchPoints > 0 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const promoted = localStorage.getItem('marctap.gfxHigh') === '1';
    const pinnedLow = localStorage.getItem('marctap.gfxPinnedLow') === '1';
    this.textureTier = selectTextureTier({ mobile, maxTextureSize: this.renderer.capabilities.maxTextureSize, promoted: promoted && !pinnedLow });
    this.contextLossCount = 0;
    this._frameTimes = [];
    this.longTaskCount = 0;
    if (typeof PerformanceObserver !== 'undefined') {
      try { this._longTaskObserver = new PerformanceObserver((list) => { this.longTaskCount += list.getEntries().length; }); this._longTaskObserver.observe({ type: 'longtask', buffered: true }); } catch { /* unsupported */ }
    }
    this._rect = null;
    // touch-action must be on the CANVAS itself (it is not inherited): without it,
    // iOS hijacks vertical drags for scroll/pull-to-refresh, so the globe spins
    // horizontally but won't tilt on phones.
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    // Lights — a real sun at the computed subsolar point (v4.0 day/night), a
    // low ambient plus a cool fill so the night side stays readable, never black.
    this.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff6e6, 1.65);
    const subsolar = subsolarPoint();
    this.sun.position.copy(latLngToVec3(subsolar.lat, subsolar.lng, 5));
    this.sunDir = this.sun.position.clone().normalize();
    this._sunHome = this.sun.position.clone(); // subsolar anchor for realistic mode
    this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.25);
    fill.position.set(-3, -1, -2);
    this.scene.add(fill);

    // Sky (galaxy dome, stars, sun glare) + deep-space scenery (moon, planets)
    this.sky = new Sky(this.scene, this.renderer, { sunPos: this.sun.position, twinkle: GFX.starTwinkle, compact: this.textureTier.name === 'low' });
    this._makeSpaceScenery(this.sun.position);

    // Globe sphere (texture applied after geojson loads)
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, 128, 96),
      new THREE.MeshPhongMaterial({ color: 0x12386e, shininess: 30, specular: 0x8fb8cc })
    );
    this.scene.add(this.sphere);

    // Atmosphere: limb glow, twilight band and forward scattering (atmosphere.js)
    const atmosphere = createAtmosphere(this.sunDir);
    atmosphere.visible = GFX.atmosphere;
    this.atmosphere = atmosphere;
    this.scene.add(atmosphere);

    // Marker roots
    this.markerRoot = new THREE.Group();
    this.scene.add(this.markerRoot);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.0001; // ~637 m altitude for landmark placement
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
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = Math.PI - 0.05;

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
    this._scratchAim = new THREE.Vector3();
    this._scratchAxis = new THREE.Vector3();
    this._scratchQuat = new THREE.Quaternion();
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
    this._resizeObserver = new ResizeObserver(this._onResize);
    this._resizeObserver.observe(this.container);
    this.resize();

    this._clock = new THREE.Clock();
    this._onVisibility = () => document.hidden ? this.stopLoop() : this.startLoop();
    this._onContextLost = (e) => { e.preventDefault(); this.contextLossCount++; localStorage.setItem('marctap.gfxPinnedLow', '1'); this.stopLoop(); this.tileDetail?.cancel(); };
    this._onContextRestored = () => {
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.attributes.position.needsUpdate = true;
        const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of materials) { m.needsUpdate = true; if (m.map) m.map.needsUpdate = true; }
      });
      this.sky?.bake();
      this.tileDetail?.cancel(); this.startLoop();
    };
    document.addEventListener('visibilitychange', this._onVisibility);
    this.renderer.domElement.addEventListener('webglcontextlost', this._onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this._onContextRestored);
    this.startLoop();
  }

  async init(geojson) {
    let tex;
    try {
      tex = await buildEarthTexture(geojson, import.meta.env.BASE_URL, this.textureTier.base);
      this.sphere.material.specularMap = buildSpecularMap(geojson);
      this._tuneGlint(false);
    } catch (err) {
      console.warn('Satellite texture unavailable, using painted fallback', err);
      tex = drawGlobeTexture(geojson);
    }
    this.sphere.material.map = tex;
    this.sphere.material.color.set(0xffffff);
    this.sphere.material.needsUpdate = true;
    this.nightTexture = await loadTieredTexture(`${import.meta.env.BASE_URL}textures/earth-night.jpg`, this.textureTier.night);
    this._sunShaderState = { sunDir: this.sunDir, nightTexture: this.nightTexture, enabled: true };
    applySunShader(this.sphere.material, this._sunShaderState);
    if (GFX.clouds) {
      const cloudTex = await loadTieredTexture(`${import.meta.env.BASE_URL}textures/earth-clouds.jpg`, this.textureTier.clouds);
      const cloudMat = new THREE.MeshPhongMaterial({
        alphaMap: cloudTex, transparent: true, opacity: 0.5, depthWrite: false, color: 0xffffff, shininess: 4, specular: 0x222222,
      });
      // Clean white cloud tops: thin haze in the source map is dropped and the
      // dense cores firm up, instead of the whole layer reading as grey smudge.
      cloudMat.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>',
          'diffuseColor.a *= smoothstep(0.10, 0.80, texture2D(alphaMap, vAlphaMapUv).g);');
      };
      this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 96, 64), cloudMat);
      this.clouds.renderOrder = 3;
      this.scene.add(this.clouds);
    }
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
    this._rect = this.renderer.domElement.getBoundingClientRect();
  }

  setAutoRotate(on) { this.controls.autoRotate = on; }
  setInteractive(on) { this.interactive = on; }
  setPrecisionMode(on) {
    this.precisionMode = !!on;
    if (on) this.updatePrecisionPin();
    if (this.pin) this.pin.visible = !on;
    if (this.pinDot) this.pinDot.visible = !on;
  }
  updatePrecisionPin() {
    if (!this.precisionMode) return;
    const aim = this.cameraLatLng();
    if (aim) this._placePin(aim.lat, aim.lng);
    if (this.pin) this.pin.visible = false;
    if (this.pinDot) this.pinDot.visible = false;
  }
  screenPoint(lat, lng) {
    this.camera.updateMatrixWorld();
    const point = latLngToVec3(lat, lng);
    if (point.dot(this.camera.position) <= 1) return null;
    point.project(this.camera);
    if (point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: (point.x + 1) * rect.width / 2, y: (1 - point.y) * rect.height / 2 };
  }
  resetRoundView() {
    // Leave the answer comparison close until the player advances, then give
    // the next search a whole-Earth view without revealing its destination.
    const center = this.cameraLatLng() || { lat: 20, lng: 0 };
    this.flyTo(center.lat, center.lng, 2.9, 850);
  }
  framePoints(a, b) {
    const mid = this._midpointOnSphere(a, b);
    const halfAngle = this._angularDistance(a, b) / 2;
    const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    const field = Math.min(vertical, horizontal) * 0.7;
    // Fit the separation itself. A fixed 1.28 floor pulled city-level answers
    // back roughly 1,800 km above Earth even when the pins were neighbours.
    const d = Math.max(this.controls?.minDistance ?? 1.04,
      1.0005 / Math.max(0.01, Math.cos(halfAngle)),
      Math.cos(halfAngle) + Math.sin(halfAngle) / Math.tan(field));
    this.flyTo(mid.lat, mid.lng, Math.min(8, d), 850);
  }
  setGameplayActive(on) { this._gameplayActive = !!on; }
  setRealisticLighting(on) {
    this._sunShaderState.enabled = !!on;
    // Realistic: real subsolar sun, dim ambient. Off ("daytime everywhere"):
    // the sun RIDES THE CAMERA (see _tick) so whatever side you spin to is in
    // full daylight — a fixed sun left the anti-solar hemisphere visibly dim.
    this.ambient.intensity = on ? 0.5 : 1.45;
    this.sun.intensity = on ? 1.65 : 1.0;
    if (on) this.sun.position.copy(this._sunHome);
    this.atmosphere.material.uniforms.uRealistic.value = on ? 1 : 0;
    this._tuneGlint(!!on);
    this.sphere.material.needsUpdate = true;
    if (this.tileDetail) this.tileDetail.setLighting(!!on);
  }
  // Ocean glint. With the real sun it is a tight, bright sunglint; in
  // daytime-everywhere mode the light rides the camera, so the highlight sits
  // dead centre and is kept to a soft sheen instead of a white blot.
  _tuneGlint(realistic) {
    const m = this.sphere.material;
    if (!m.specularMap) return;
    if (!GFX.oceanGlint) { m.specular.set(0x111111); m.shininess = 8; return; }
    m.specular.set(realistic ? 0x9fb6c4 : 0x2c3d4c);
    m.shininess = realistic ? 46 : 22;
  }
  applySunShader(material) { return applySunShader(material, this._sunShaderState); }
  startLoop() { this._clock?.start(); this._clock?.getDelta(); this.renderer.setAnimationLoop(() => this._tick()); }
  stopLoop() { this.renderer.setAnimationLoop(null); this._clock?.stop(); this.tileDetail?.cancel(); }

  // rotateSpeed slows as you zoom in (fine control near the surface).
  _tuneControls() {
    this.controls.rotateSpeed = rotationSpeedForAltitude(Math.max(0, this.camera.position.length() - GLOBE_RADIUS), K_ROT);
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
    this._setPointerFromEvent({ clientX, clientY });
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Pick the geographic surface, not a triangle chord below it. At deep
    // zoom, normalizing a mesh hit moves the resulting pin away from the tap.
    const hit = this.raycaster.ray.intersectSphere(
      new THREE.Sphere(new THREE.Vector3(), GLOBE_RADIUS), new THREE.Vector3());
    return hit ? vec3ToLatLng(hit) : null;
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
    if (!this.pin || this.precisionMode) return false;
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
      this.tileDetail?.gestureStart();
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
      if (!this._activePointers.size) this.tileDetail?.gestureEnd();
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
              this._spawnPinRipple(ll.lat, ll.lng);
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
            if (this.interactive && !this.precisionMode) {
              // Snapshot the pin before moving it, so a double-tap can restore.
              this._prevPinSnapshot = this.pinLatLng ? { ...this.pinLatLng } : null;
              this._placePin(ll.lat, ll.lng);
              this._spawnPinRipple(ll.lat, ll.lng);
              if (this.cb.onTap) this.cb.onTap(ll.lat, ll.lng);
            }
          }
        }
      }
      downPos = null;
    });

    el.addEventListener('pointercancel', (e) => {
      this._activePointers.delete(e.pointerId);
      if (!this._activePointers.size) this.tileDetail?.gestureEnd();
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
    return THREE.MathUtils.clamp(d * k, 0.0000005, 0.16);
  }

  _placePin(lat, lng) {
    this.pinLatLng = { lat, lng };
    const surface = latLngToVec3(lat, lng);
    if (!this.pin) {
      // depthTest OFF + high renderOrder: the guess pin must NEVER hide behind
      // terrain/tile geometry, no matter how close the camera is.
      const mat = new THREE.SpriteMaterial({ map: this.pinTexGuess, depthTest: false, sizeAttenuation: true });
      this.pin = new THREE.Sprite(mat);
      this.pin.center.set(0.5, 12 / 128); // drawn tip is at y=116 of 128
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
    this.pinDot.position.copy(surface);
    this.pinDot.scale.setScalar(s * 0.08 / 0.006);
    this.pinDot.lookAt(this.pinDot.position.clone().multiplyScalar(2));
  }

  // A one-shot expanding ring where the tap landed — tactile feedback that the
  // pin registered. Sized off the pin-dot basis so it reads the same at every
  // zoom, and animated by the shared pulse loop (once: true = self-disposing).
  _spawnPinRipple(lat, lng) {
    if (!GFX.pinRipple) return;
    const pos = latLngToVec3(lat, lng, GLOBE_RADIUS * 1.004);
    const geo = new THREE.PlaneGeometry(0.025, 0.025);
    const mat = new THREE.MeshBasicMaterial({ map: this._softRing(), color: 0xff8fa8, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
    const ring = new THREE.Mesh(geo, mat);
    ring.renderOrder = 997;
    ring.position.copy(pos);
    ring.lookAt(pos.clone().multiplyScalar(2));
    const base = this._spriteScaleForDistance(pos) * 0.08 / 0.006; // same basis as the pin dot
    ring.scale.setScalar(base);
    this.markerRoot.add(ring);
    this._pulses.push({ mesh: ring, t: 0, once: true, dur: 0.55, base });
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
    const step = THREE.MathUtils.clamp(d * 0.5, 0.000025, 1.6);
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
        // Static and fully drawn: a quieter ribbon, still carrying slow pulses.
        const u = arc.mesh.material.uniforms;
        u.uHead.value = 1; u.uFlight.value = 0; u.uGain.value = 0.6;
        arc.mesh.userData.isArc = true;
        this.markerRoot.add(arc.mesh);
        this._overviewMarkers.push(arc.mesh);

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
    const coreGeo = new THREE.CapsuleGeometry(0.0048, 0.10, 6, 20);
    coreGeo.translate(0, 0.0555, 0); // base sits at local y=0
    const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: coreColor, toneMapped: false }));
    core.renderOrder = 4;
    group.add(core);
    // Nested additive shells fall off like a real glow instead of one hard halo.
    for (const [radius, opacity] of [[0.0095, 0.36], [0.017, 0.15], [0.029, 0.06]]) {
      const glowGeo = new THREE.CapsuleGeometry(radius, 0.104, 6, 20);
      glowGeo.translate(0, 0.0575, 0);
      const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
        color: glowColor, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.renderOrder = 5;
      group.add(glow);
    }
    // A pool of light on the ground where the beam is planted.
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({
      map: this._glowDisc(), color: glowColor, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.0042;
    pool.renderOrder = 3;
    group.add(pool);
    const surface = latLngToVec3(lat, lng, GLOBE_RADIUS * 0.9965); // embed the seam
    group.position.copy(surface);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), surface.clone().normalize());
    return group;
  }

  // Shared effect textures (created on first use; three re-uploads them if a
  // result clean-up disposes the GPU copy).
  _softRing() { return this._softRingTex || (this._softRingTex = softRingTexture()); }
  _glowDisc() { return this._glowDiscTex || (this._glowDiscTex = glowDiscTexture()); }

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
      this.markerRoot.add(arc.mesh);
      this._resultObjects.push(arc.mesh);
      const head = this._makeCometHead();
      head.visible = false;
      this.markerRoot.add(head);
      this._resultObjects.push(head);
      this._arcAnim = { ...arc, head, launched: false, landedAt: 0 };
    } else {
      this._arcAnim = null;
      this._revealAnswer(); // no guess (shouldn't happen in play) - show at once
    }

    // Fly the camera to frame both points, close enough for tile detail.
    this.framePoints(guess || answer, answer);
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

    const ringGeo = new THREE.PlaneGeometry(0.034, 0.034);
    const ringMat = new THREE.MeshBasicMaterial({ map: this._softRing(), color: 0x5dffa2, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
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
    return { mesh: makeArcRibbon(points, angle), segments, points };
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
    // One-shot ripples own their meshes (not in _resultObjects) — tidy them up.
    for (const p of this._pulses) if (p.once) {
      this.markerRoot.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
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
  // its approximate current position, a sun glare, and a Milky Way band.
  // Stylized planets, comets and asteroids fade in beyond the whole-Earth view.
  _makeSpaceScenery(sunPos) {
    const space = new THREE.Group();
    this.scene.add(space);

    this.spaceScenery = new SpaceScenery(this.scene, sunPos.clone().normalize());

    // --- The Moon: real size ratio, painted craters, positioned by today's
    //     mean orbital longitude, lit by the same sun so phases are right ---
    {
      const { map: moonTex, bump: moonBump } = this._paintMoonTexture();
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(0.273, 64, 48), // true Moon/Earth size ratio
        new THREE.MeshPhongMaterial({ map: moonTex, bumpMap: moonBump, bumpScale: 2.2, shininess: 1, specular: 0x111111 })
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

  // Paints an original Moon: mottled highlands, soft-edged maria on the
  // Earth-facing side, and a power-law crater field with lit rims, shadowed
  // floors and a few bright ray systems. A matching height map drives the
  // bump shading, so craters catch the sunlight along the terminator.
  _paintMoonTexture() {
    const W = 1024, H = 512;
    const make = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const colorCanvas = make(), bumpCanvas = make();
    const g = colorCanvas.getContext('2d'), b = bumpCanvas.getContext('2d');
    const rng = mulberry32(4242);
    g.fillStyle = '#b4b1a8'; g.fillRect(0, 0, W, H);
    b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);
    const blob = (ctx, x, y, rx, ry, rot, inner, outer) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, ry / rx);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, inner); grad.addColorStop(0.55, inner); grad.addColorStop(1, outer);
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    };
    // Highland mottling.
    for (let i = 0; i < 900; i++) {
      const light = rng() < 0.5, a = 0.02 + rng() * 0.05;
      blob(g, rng() * W, rng() * H, 6 + rng() * 34, 5 + rng() * 26, rng() * 3.1,
        light ? 'rgba(232,230,220,' + a + ')' : 'rgba(96,95,92,' + a + ')', light ? 'rgba(232,230,220,0)' : 'rgba(96,95,92,0)');
    }
    // Maria: dark basalt seas clustered on the near side (u = 0.25 faces Earth).
    for (let i = 0; i < 26; i++) {
      const x = W * (0.25 + (rng() + rng() - 1) * 0.17), y = H * (0.30 + rng() * 0.40);
      const rx = 26 + rng() * 62, ry = 18 + rng() * 44, rot = rng() * 3.1;
      blob(g, x, y, rx, ry, rot, 'rgba(84,86,92,' + (0.20 + rng() * 0.22) + ')', 'rgba(84,86,92,0)');
      blob(b, x, y, rx, ry, rot, 'rgba(96,96,96,0.35)', 'rgba(96,96,96,0)');
    }
    // Craters, smallest most numerous.
    for (let i = 0; i < 620; i++) {
      const x = rng() * W, y = H * (0.04 + rng() * 0.92);
      const r = 1.2 + Math.pow(rng(), 3.4) * 20;
      const stretch = 1 / Math.max(0.35, Math.sin((y / H) * Math.PI)); // equirect: widen toward the poles
      for (const [ctx, floor, rim, lit] of [[g, 'rgba(70,70,70,0.34)', 'rgba(236,234,226,0.42)', 'rgba(250,248,240,0.30)'], [b, 'rgba(38,38,38,0.85)', 'rgba(236,236,236,0.80)', null]]) {
        ctx.save(); ctx.translate(x, y); ctx.scale(stretch, 1);
        const bowl = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.28);
        bowl.addColorStop(0, floor); bowl.addColorStop(0.62, floor); bowl.addColorStop(0.80, rim); bowl.addColorStop(1, 'rgba(128,128,128,0)');
        ctx.fillStyle = bowl; ctx.beginPath(); ctx.arc(0, 0, r * 1.28, 0, Math.PI * 2); ctx.fill();
        if (lit && r > 2.5) { ctx.fillStyle = lit; ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.22, r * 0.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      // Young craters throw bright rays.
      if (r > 9 && rng() < 0.4) {
        g.save(); g.translate(x, y); g.scale(stretch, 1);
        for (let k = 0; k < 16; k++) {
          const len = r * (3 + rng() * 7), ang = rng() * Math.PI * 2;
          const ray = g.createLinearGradient(0, 0, Math.cos(ang) * len, Math.sin(ang) * len);
          ray.addColorStop(0, 'rgba(244,242,234,0.32)'); ray.addColorStop(1, 'rgba(244,242,234,0)');
          g.strokeStyle = ray; g.lineWidth = 1 + rng() * 2.2;
          g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(ang) * len, Math.sin(ang) * len); g.stroke();
        }
        g.restore();
      }
    }
    const map = new THREE.CanvasTexture(colorCanvas);
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    return { map, bump: new THREE.CanvasTexture(bumpCanvas) };
  }

  // One meteor: a short line streaking along a tangent of the star sphere,
  // spawned in the hemisphere the camera is facing so it is actually seen.
  _spawnMeteor() {
    const camDir = this.camera.position.clone().normalize();
    let p = new THREE.Vector3();
    do { p.randomDirection(); } while (p.dot(camDir) < 0.3);
    p.multiplyScalar(44 + Math.random() * 10);
    const dir = new THREE.Vector3().randomDirection().cross(p).normalize();
    const len = 2.2 + Math.random() * 1.4;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      dir.clone().multiplyScalar(-len),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xdcecff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.position.copy(p);
    this.scene.add(line);
    if (!this._meteors) this._meteors = [];
    this._meteors.push({ line, dir, t: 0, dur: 0.85 + Math.random() * 0.4, speed: 9 + Math.random() * 5 });
  }

  // ---------- frame loop ----------

  _tick() {
    const rawDt = this._clock.getDelta();
    // Daytime-everywhere mode: keep the sun behind the camera so the visible
    // hemisphere is always fully lit (specular/ocean glint stays alive).
    if (this._sunShaderState && this._sunShaderState.enabled === false) {
      this.sun.position.copy(this.camera.position).setLength(5);
    }
    // One shared sun direction drives the surface haze and the atmosphere shell.
    this.sunDir.copy(this.sun.position).normalize();
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
    this.controls.dampingFactor = smoothingAlpha(dt, DAMP_TAU);
    this.controls.update(dt); // dt makes autoRotate frame-rate independent

    // Sample the two-finger pair once per frame: smooth the gap, apply the
    // ratio against the gap last applied (ratios telescope exactly), and
    // smooth the midpoint for the aim assist.
    if (this._pinch && this._activePointers.size === 2 && !this._flights.length && !this.draggingPin) {
      const [pa, pb] = [...this._activePointers.values()];
      const gapNow = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      const gestureAlpha = smoothingAlpha(dt, GESTURE_TAU);
      this._pinch.gap += (gapNow - this._pinch.gap) * gestureAlpha;
      const { gap, appliedGap } = this._pinch;
      if (gap > MIN_GAP_PX && appliedGap > MIN_GAP_PX) this._zoomAltBy(Math.pow(appliedGap / gap, ZOOM_K));
      this._pinch.appliedGap = gap;
      const a = this._zoomAim;
      a.x += ((pa.x + pb.x) / 2 - a.x) * gestureAlpha;
      a.y += ((pa.y + pb.y) / 2 - a.y) * gestureAlpha;
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
        const camDir = this._scratchAim.copy(this.camera.position).normalize();
        const angle = camDir.angleTo(targetDir);
        const f = THREE.MathUtils.clamp(1 - (d - 1) / (prev - 1), 0, 0.5);
        const altitudeScreen = Math.max(d - 1, 0) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
        const maxStep = Math.min(0.06, altitudeScreen) * (dt / (1 / 60));
        const step = Math.min(angle * f * AIM_GAIN, maxStep);
        if (angle > 1e-4 && step > 1e-6) {
          const axis = this._scratchAxis.crossVectors(camDir, targetDir).normalize();
          if (axis.lengthSq() > 0.5) {
            this.camera.position.applyQuaternion(this._scratchQuat.setFromAxisAngle(axis, step));
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
    this.updatePrecisionPin();
    if (this.pin) {
      const s = this._spriteScaleForDistance(this.pin.position);
      this.pin.scale.set(s, s, 1);
      this.pinDot.scale.setScalar(s * 0.08 / 0.006);
    }
    if (this._answerPin) { const s = this._spriteScaleForDistance(this._answerPin.position); this._answerPin.scale.set(s, s, 1); }
    for (const o of this._overviewMarkers) {
      if (o.userData && o.userData.isArc) {
        const u = o.material.uniforms;
        this.renderer.getDrawingBufferSize(u.uRes.value);
        u.uWidth.value = 5 * this.renderer.getPixelRatio();
        u.uTime.value += dt;
      } else if (o.userData && o.userData.overviewIndex !== undefined) {
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
      const arc = this._arcAnim, u = arc.mesh.material.uniforms;
      this.renderer.getDrawingBufferSize(u.uRes.value);
      u.uWidth.value = 6.5 * this.renderer.getPixelRatio();
      u.uTime.value += dt;
      if (!arc.launched && elapsed >= 250) {
        arc.launched = true;
        arc.head.visible = true;
      }
      if (arc.launched && !arc.landedAt) {
        const t = Math.min(1, (elapsed - 250) / 700);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
        u.uHead.value = e;
        // Comet head rides the leading edge of the ribbon.
        const f = e * arc.segments, i0 = Math.min(arc.segments, Math.floor(f)), i1 = Math.min(arc.segments, i0 + 1);
        const p = arc.head.position.copy(arc.points[i0]).lerp(arc.points[i1], f - i0);
        const hk = this._spriteScaleForDistance(p) * 0.62 * (1 + 0.15 * Math.sin(nowMs / 60));
        arc.head.scale.set(hk, hk, 1);
        if (t >= 1) {
          arc.landedAt = nowMs;
          arc.head.visible = false;
          this._revealAnswer(); // landing: answer beam + ring + label
        }
      } else if (arc.landedAt) {
        // The comet's wake cools into the steady arc with travelling pulses.
        u.uFlight.value = Math.max(0, 1 - (nowMs - arc.landedAt) / 650);
      }
    }
    if (this._resultLabel) {
      const fade = Math.min(1, (nowMs - this._resultLabel.userData.fadeBorn) / 250);
      this._resultLabel.material.opacity = fade;
      const k = this._spriteScaleForDistance(this._resultLabel.position) * 1.1;
      this._resultLabel.scale.set(k * this._resultLabel.userData.aspect, k, 1);
    }

    // Zoom-detail tile streaming.
    // Keep normal globe depth precision while allowing a camera hundreds of
    // metres above a landmark without clipping away the ground.
    const near = THREE.MathUtils.clamp((this.camera.position.length() - 1) * 0.01, 0.000001, 0.01);
    if (this.camera.near !== near) { this.camera.near = near; this.camera.updateProjectionMatrix(); }
    // Close in, push the low-res base sphere back in depth so it can never
    // z-fight through the satellite patch where the two surfaces nearly touch
    // (around the base mesh's vertices).
    const lowAlt = this.camera.position.length() < 1.05;
    const sm = this.sphere.material;
    if (sm.polygonOffset !== lowAlt) { sm.polygonOffset = lowAlt; sm.polygonOffsetFactor = 1; sm.polygonOffsetUnits = 1000; }
    if (this.tileDetail) this.tileDetail.update(dt);
    if (this.clouds) {
      this.clouds.rotation.y += dt * 0.0015;
      this.clouds.material.opacity = GFX.clouds && !this._gameplayActive && this.camera.position.length() >= 1.7 ? 0.5 : 0;
    }
    this.spaceScenery?.update(dt, this.camera);
    this.sky?.update(dt, this.camera);

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

    // Pulsing rings. `once` entries (pin-drop ripples) run a single expanding
    // sweep then dispose themselves; the rest loop until cleared with results.
    this._pulses = this._pulses.filter((p) => {
      p.t += dt;
      if (p.once) {
        const f = Math.min(1, p.t / p.dur);
        const k = p.base * (1 + 3 * f);
        p.mesh.scale.set(k, k, k);
        p.mesh.material.opacity = 0.85 * (1 - f);
        if (f >= 1) {
          this.markerRoot.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
          return false;
        }
        return true;
      }
      const k = 1 + 2.2 * (p.t % 1.4) / 1.4;
      p.mesh.scale.set(k, k, k);
      p.mesh.material.opacity = Math.max(0, 0.9 * (1 - (p.t % 1.4) / 1.4));
      return true;
    });

    // Shooting stars: a brief additive streak across the far starfield every
    // so often — menu/end screens only (same rule as clouds), never mid-round.
    if (GFX.shootingStars) {
      const nowT = performance.now();
      if (!this._nextMeteorAt) this._nextMeteorAt = nowT + 4000 + Math.random() * 6000;
      if (!this._gameplayActive && nowT >= this._nextMeteorAt) {
        this._nextMeteorAt = nowT + 8000 + Math.random() * 10000;
        this._spawnMeteor();
      }
      if (this._meteors && this._meteors.length) {
        this._meteors = this._meteors.filter((m) => {
          m.t += dt;
          const f = m.t / m.dur;
          m.line.position.addScaledVector(m.dir, m.speed * dt);
          m.line.material.opacity = Math.max(0, Math.sin(Math.PI * Math.min(1, f)) * 0.85);
          if (f >= 1) {
            this.scene.remove(m.line);
            m.line.geometry.dispose();
            m.line.material.dispose();
            return false;
          }
          return true;
        });
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.cb.onFrame?.();
    this._frameTimes.push({ t: performance.now(), ms: (this._dtOverride ?? rawDt) * 1000 });
    while (this._frameTimes.length && this._frameTimes[0].t < performance.now() - 10000) this._frameTimes.shift();
    if (!this._tierBenchmarked && this._frameTimes.length > 120 && this._frameTimes.at(-1).t - this._frameTimes[0].t > 9000) {
      this._tierBenchmarked = true;
      const sorted = this._frameTimes.map((f) => f.ms).sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      if (this.contextLossCount === 0 && p95 <= 16.7) localStorage.setItem('marctap.gfxHigh', '1');
    }
  }

  debugInfo() {
    const values = this._frameTimes.map((f) => f.ms).sort((a, b) => a - b);
    const pct = (p) => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * p))] : 0;
    return {
      gfx: { ...GFX, realisticLighting: this._sunShaderState?.enabled !== false }, tier: this.textureTier,
      maxTextureSize: this.renderer.capabilities.maxTextureSize, frameP50: pct(0.5), frameP95: pct(0.95),
      longTaskCount: this.longTaskCount,
      tile: this.tileDetail?.debugInfo() || null, contextLossCount: this.contextLossCount,
      textureInventory: { base: this.textureTier.base, night: this.textureTier.night, clouds: this.textureTier.clouds, patchCanvases: 3 },
    };
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this._resizeObserver?.disconnect();
    document.removeEventListener('visibilitychange', this._onVisibility);
    this._longTaskObserver?.disconnect();
    this.stopLoop();
    this.spaceScenery?.dispose();
    this.renderer.dispose();
  }
}
