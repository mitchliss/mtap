// MTap zoom-detail streaming.
// When the camera gets close, this streams web-mercator satellite tiles
// (EOX Sentinel-2 cloudless - free with attribution) for the visible region,
// resamples them into an equirectangular patch canvas (with country borders
// redrawn), and drapes it on a thin sphere segment above the base globe.
// Zoomed out the patch fades away and the NASA base texture carries the scene.
// Everything is defensive: if tiles are unreachable (offline/CORS), the feature
// silently stays off and the game looks exactly like v2.8.

import * as THREE from 'three';
import { toRad, toDeg } from './geo.js';

const TILE_SIZE = 256;
const MAX_Z = 12;
const MIN_Z = 3;
const PATCH_W = 1792;          // patch canvas width (px)
const PATCH_LEVELS = [1792, 1280, 896];
const CACHE_BYTES = 32 * 1024 * 1024;
const ENGAGE_DISTANCE = 2.1;   // start streaming below this camera distance
const FULL_DISTANCE = 1.55;    // fully opaque below this
const MERC_LAT_LIMIT = 85.05;
const SETTLE_S = 0.12;         // camera must rest this long before a rebuild (s, frame-time based)
const FADE_S = 0.25;           // a new patch crossfades in over the old one
const REBUILD_ALT_RATIO = 2;   // ...or rebuild mid-motion once altitude halves/doubles (one zoom level)

const TILE_HOSTS = [
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g',
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g',
];

function mercY(lat) {
  // Latitude -> normalized web-mercator y in [0,1]
  const s = Math.sin(toRad(Math.max(-MERC_LAT_LIMIT, Math.min(MERC_LAT_LIMIT, lat))));
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

function geometryBBox(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      minX = Math.min(minX, coords[0]); maxX = Math.max(maxX, coords[0]);
      minY = Math.min(minY, coords[1]); maxY = Math.max(maxY, coords[1]);
    } else for (const child of coords) visit(child);
  };
  visit(geometry.coordinates);
  return [minX, minY, maxX, maxY];
}

export class TileDetail {
  constructor(globe, geojson) {
    this.globe = globe;
    this.geojson = geojson;
    for (const feature of geojson.features) feature.bbox ||= geometryBBox(feature.geometry);
    this.enabled = null;         // null = not probed yet
    this.hostIdx = 0;
    this.cache = new Map();      // "z/x/y" -> Promise<Image>
    this.cacheBytes = 0;
    this._retired = [];          // evicted bitmap promises awaiting a safe close
    this.generation = 0;
    this.gestureActive = false;
    this.pendingFinal = null;
    this.timings = {};
    this.lastFailure = null;
    this.patchLevel = 0;
    this.canvasPool = Array.from({ length: 3 }, () => ({ canvas: document.createElement('canvas'), owned: false }));
    this.mesh = null;
    this.building = false;
    this.lastCamPos = new THREE.Vector3();
    this.stillFor = 0;         // seconds the camera has been still
    this.prev = null;          // the outgoing patch while a crossfade runs
    this.fadeT = 0;
    this.builtAlt = null;      // altitude the current patch was built for
    this.lastRegionKey = '';
    this._probe();
  }

  async _probe() {
    for (let i = 0; i < TILE_HOSTS.length; i++) {
      try {
        await this._loadTile(2, 1, 1, i);
        this.hostIdx = i;
        this.enabled = true;
        return;
      } catch { /* try next host */ }
    }
    this.enabled = false;
  }

  _loadTile(z, x, y, hostIdx = this.hostIdx, signal = null) {
    const n = 1 << z;
    const xm = ((x % n) + n) % n; // wrap across the antimeridian
    if (y < 0 || y >= n) return Promise.reject(new Error('tile row out of range'));
    const key = `${hostIdx}:${z}/${xm}/${y}`;
    if (this.cache.has(key)) {
      // Touch on hit: Map iteration is insertion order, so re-inserting makes
      // eviction true-LRU instead of FIFO (a FIFO evicts the very tiles the
      // in-flight build is about to draw).
      const hit = this.cache.get(key);
      this.cache.delete(key); this.cache.set(key, hit);
      return hit;
    }
    const p = (typeof createImageBitmap === 'function' && typeof fetch === 'function' ?
      fetch(`${TILE_HOSTS[hostIdx]}/${z}/${y}/${xm}.jpg`, { mode: 'cors', signal }).then((r) => {
        if (!r.ok) throw new Error(`tile ${r.status}`);
        return r.blob();
      }).then(createImageBitmap) : new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // required or the WebGL upload is blocked
      const timer = setTimeout(() => { img.src = ''; reject(new Error('tile timeout')); }, 12000);
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); reject(new Error('tile error')); };
      img.src = `${TILE_HOSTS[hostIdx]}/${z}/${y}/${xm}.jpg`;
    }));
    p.catch(() => this.cache.delete(key));
    this.cache.set(key, p);
    this.cacheBytes += TILE_SIZE * TILE_SIZE * 4;
    while (this.cacheBytes > CACHE_BYTES) {
      const first = this.cache.keys().next().value;
      const old = this.cache.get(first);
      this.cache.delete(first); this.cacheBytes -= TILE_SIZE * TILE_SIZE * 4;
      // Never close() an evicted bitmap immediately — a build in progress may
      // still hold its promise and draw it (detached-source drawImage error).
      // Park it; the drain runs when no build can be mid-draw.
      this._retired.push(old);
    }
    return p;
  }

  _drainRetired() {
    for (const p of this._retired.splice(0)) p?.then((img) => img.close?.()).catch(() => {});
  }

  gestureStart() { this.gestureActive = true; this.cancel(); }
  gestureEnd() { this.gestureActive = false; }
  cancel() { this.generation++; this._abortController?.abort(); this._abortController = null; this.building = false; this.pendingFinal?.release?.(); this.pendingFinal = null; }
  setLighting(on) { if (this.mesh) this.globe.applySunShader(this.mesh.material); if (this.prev) this.globe.applySunShader(this.prev.material); }
  debugInfo() { return { timings: this.timings, lastFailure: this.lastFailure, generation: this.generation, cacheBytes: this.cacheBytes, patchWidth: PATCH_LEVELS[this.patchLevel] }; }

  // Called every frame from the globe's tick.
  update(dt) {
    if (this.enabled === false) return;
    if (!this.gestureActive && this.pendingFinal) {
      const finish = this.pendingFinal; this.pendingFinal = null;
      const t = performance.now();
      finish();
      this.timings.upload = performance.now() - t;
      if (this.timings.upload > 16.7 && this.patchLevel < PATCH_LEVELS.length - 1) this.patchLevel++;
    }
    const cam = this.globe.camera;
    const d = cam.position.length();

    // Fade with zoom; drop the mesh entirely when far out. A freshly built
    // patch crossfades in ON TOP of the old one (which stays at full strength
    // underneath), so replacing detail never dips or pops.
    const zoomOp = THREE.MathUtils.clamp((ENGAGE_DISTANCE - d) / (ENGAGE_DISTANCE - FULL_DISTANCE), 0, 1);
    if (this.mesh) {
      if (this.prev) {
        this.fadeT += dt;
        const a = Math.min(1, this.fadeT / FADE_S);
        this.mesh.material.opacity = zoomOp * a;
        this.prev.material.opacity = zoomOp;
        this.prev.visible = zoomOp > 0.02;
        if (a >= 1) { this._dispose(this.prev); this.prev = null; this.mesh.renderOrder = 1; }
      } else {
        this.mesh.material.opacity = zoomOp;
      }
      this.mesh.visible = this.mesh.material.opacity > 0.02;
    }
    if (d > ENGAGE_DISTANCE || this.enabled === null) return;

    // Rebuild after the camera settles — or mid-motion once the altitude has
    // halved/doubled since the last build, so detail arrives progressively
    // during a long pinch instead of all at once when it ends.
    const moved = cam.position.distanceTo(this.lastCamPos) > 0.0004 * d;
    if (moved) { this.lastCamPos.copy(cam.position); this.stillFor = 0; } else this.stillFor += dt;
    const alt = Math.max(d - 1, 1e-4);
    const levelJump = this.builtAlt !== null &&
      Math.max(alt / this.builtAlt, this.builtAlt / alt) >= REBUILD_ALT_RATIO;
    if (this.gestureActive || this.building || (this.stillFor < SETTLE_S && !levelJump)) return;

    const region = this._visibleRegion();
    if (!region) return;
    const key = [region.west.toFixed(2), region.east.toFixed(2), region.south.toFixed(2), region.north.toFixed(2)].join('|');
    if (key === this.lastRegionKey) return;
    this.building = true;
    this.builtAlt = alt;
    this._drainRetired(); // no build is mid-draw right here, so closing is safe
    const token = ++this.generation;
    this._abortController = new AbortController();
    this._buildPatch(region, token)
      .then(() => { this.lastRegionKey = key; })
      .catch((err) => { if (err.message !== 'cancelled') this.lastFailure = err.message; })
      .finally(() => { this.building = false; });
  }

  // Lat/lng bounds of what the camera can see, via boundary raycasts
  // (falls back to the horizon cap for rays that miss the globe).
  _visibleRegion() {
    const cam = this.globe.camera;
    const d = cam.position.length();
    const center = this.globe.cameraLatLng();
    if (!center) return null;
    const capDeg = toDeg(Math.acos(1 / d)); // angular radius of the visible cap
    const ray = new THREE.Raycaster();
    const pts = [];
    for (const [nx, ny] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
      ray.setFromCamera({ x: nx, y: ny }, cam);
      const hits = ray.intersectObject(this.globe.sphere, false);
      if (hits.length) {
        const v = hits[0].point;
        const lat = toDeg(Math.asin(v.y / v.length()));
        const lng = toDeg(Math.atan2(-v.z, v.x));
        pts.push({ lat, lng });
      }
    }
    let latHalf, lngHalf;
    if (pts.length === 8) {
      latHalf = Math.max(...pts.map((p) => Math.abs(p.lat - center.lat)));
      const lngDiff = (a, b) => { let x = a - b; while (x > 180) x -= 360; while (x < -180) x += 360; return Math.abs(x); };
      lngHalf = Math.max(...pts.map((p) => lngDiff(p.lng, center.lng)));
    } else {
      latHalf = capDeg;
      lngHalf = Math.min(120, capDeg / Math.max(0.2, Math.cos(toRad(center.lat))));
    }
    latHalf = Math.min(latHalf * 1.15 + 0.5, capDeg + 1);      // margin
    lngHalf = Math.min(lngHalf * 1.15 + 0.5, 150);
    const north = Math.min(MERC_LAT_LIMIT, center.lat + latHalf);
    const south = Math.max(-MERC_LAT_LIMIT, center.lat - latHalf);
    if (north - south < 0.05) return null;
    return { west: center.lng - lngHalf, east: center.lng + lngHalf, south, north };
  }

  async _buildPatch(region, token) {
    const phase = async (name, fn) => { const t = performance.now(); const value = await fn(); this.timings[name] = performance.now() - t; return value; };
    const check = () => { if (token !== this.generation) throw new Error('cancelled'); };
    const patchW = PATCH_LEVELS[this.patchLevel];
    const lonSpan = region.east - region.west;
    const latSpan = region.north - region.south;
    // Pick the zoom whose tile grid fits the budget; step down if the mercator
    // row stretch (high latitudes) blows it up.
    let z = THREE.MathUtils.clamp(Math.round(Math.log2((patchW / TILE_SIZE) * 360 / lonSpan)), MIN_Z, MAX_Z);
    let n, x0, x1, y0, y1;
    for (;;) {
      n = 1 << z;
      // x continuous across the antimeridian, wrapped at load time
      x0 = Math.floor(((region.west + 180) / 360) * n);
      x1 = Math.floor(((region.east + 180) / 360) * n);
      y0 = Math.max(0, Math.floor(mercY(region.north) * n));
      y1 = Math.min(n - 1, Math.floor(mercY(region.south) * n));
      if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 120 || z <= MIN_Z) break;
      z--;
    }

    // Fetch everything (tolerate a few gaps)
    const jobs = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      jobs.push(this._loadTile(z, x, y, this.hostIdx, this._abortController?.signal).then((img) => ({ x, y, img })).catch(() => null));
    }
    const tiles = [];
    await phase('mosaic', async () => {
      for (let i = 0; i < jobs.length; i += 6) { check(); tiles.push(...(await Promise.all(jobs.slice(i, i + 6))).filter(Boolean)); }
    });
    if (!tiles.length) throw new Error('no tiles');
    check(); // a cancel during the last fetch chunk must not reach the paste



    // 1) paste tiles onto a mercator-space canvas
    const mercCanvas = document.createElement('canvas');
    mercCanvas.width = (x1 - x0 + 1) * TILE_SIZE;
    mercCanvas.height = (y1 - y0 + 1) * TILE_SIZE;
    const mctx = mercCanvas.getContext('2d');
    for (const t of tiles) {
      mctx.drawImage(t.img, (t.x - x0) * TILE_SIZE, (t.y - y0) * TILE_SIZE);
    }

    // 2) resample rows into an equirectangular patch (linear in latitude)
    const patchH = Math.max(256, Math.round(patchW * (latSpan / lonSpan)));
    const poolItem = this.canvasPool.find((item) => !item.owned);
    if (!poolItem) throw new Error('canvas pool busy');
    poolItem.owned = true;
    const patch = poolItem.canvas;
    patch.width = patchW;
    patch.height = patchH;
    const pctx = patch.getContext('2d');
    const mercTop = y0 / n;                       // normalized merc y at canvas top
    const mercPxPerUnit = n * TILE_SIZE;          // merc canvas px per normalized unit
    const srcXOffset = (((region.west + 180) / 360) * n - x0) * TILE_SIZE;
    const srcWidth = (lonSpan / 360) * n * TILE_SIZE;
    let sliceStart = performance.now();
    const resampleStart = sliceStart;
    for (let row = 0; row < patchH; row++) {
      check();
      const lat = region.north - (latSpan * (row + 0.5)) / patchH;
      const sy = (mercY(lat) - mercTop) * mercPxPerUnit;
      pctx.drawImage(mercCanvas, srcXOffset, sy - 0.5, srcWidth, 1, 0, row, patchW, 1);
      if (performance.now() - sliceStart >= 6) { await new Promise(requestAnimationFrame); sliceStart = performance.now(); }
    }
    this.timings.resample = performance.now() - resampleStart;

    // 3) country borders, same style as the base texture
    const px = (lng) => ((lng - region.west) / lonSpan) * patchW;
    const py = (lat) => ((region.north - lat) / latSpan) * patchH;
    const stroke = (color, width) => {
      pctx.strokeStyle = color;
      pctx.lineWidth = width;
      for (const feature of this.geojson.features) {
        const b = feature.bbox;
        if (b && (b[2] < region.west || b[0] > region.east || b[3] < region.south || b[1] > region.north)) continue;
        const geom = feature.geometry;
        const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
        for (const poly of polys) for (const ring of poly) {
          pctx.beginPath();
          let prev = null;
          for (const [lng0, lat0] of ring) {
            // unwrap ring longitudes into the (possibly >180) region frame
            let lng = lng0;
            while (lng < region.west - 180) lng += 360;
            while (lng > region.west + 180 + lonSpan) lng -= 360;
            const x = px(lng), y = py(lat0);
            if (prev === null || Math.abs(x - prev) > patchW / 2) pctx.moveTo(x, y);
            else pctx.lineTo(x, y);
            prev = x;
          }
          pctx.stroke();
        }
      }
    };
    const borderStart = performance.now();
    stroke('rgba(0, 0, 0, 0.3)', 2.4);
    stroke('rgba(255, 255, 255, 0.5)', 1.1);
    this.timings.borders = performance.now() - borderStart;

    // 4) drape on a sphere segment matching the region exactly
    this.pendingFinal = () => {
      if (token !== this.generation || this.gestureActive) { poolItem.owned = false; return; }
      const geoStart = performance.now();
      const tex = new THREE.CanvasTexture(patch);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const geo = new THREE.SphereGeometry(1.0006, 96, 96, toRad(region.west + 180), toRad(lonSpan), toRad(90 - region.north), toRad(latSpan));
      this.timings.geometry = performance.now() - geoStart;
      const mat = new THREE.MeshPhongMaterial({ map: tex, transparent: true, opacity: 0, shininess: 8, specular: new THREE.Color(0x222c3a), depthWrite: false });
      this.globe.applySunShader(mat);
      const mesh = new THREE.Mesh(geo, mat); mesh.userData.poolItem = poolItem;
      this._swapIn(mesh);
    };
    this.pendingFinal.release = () => { poolItem.owned = false; };
  }

  // The new patch draws above the old one (renderOrder 2) while it fades in;
  // the old is disposed when the fade completes (see update).
  _swapIn(mesh) {
    if (this.prev) this._dispose(this.prev); // a fade still running: drop the oldest
    this.prev = this.mesh;
    this.mesh = mesh;
    this.fadeT = 0;
    mesh.renderOrder = this.prev ? 2 : 1;
    this.globe.scene.add(mesh);
  }

  _dispose(m) {
    this.globe.scene.remove(m);
    m.geometry.dispose();
    if (m.material.map) m.material.map.dispose();
    m.material.dispose();
    if (m.userData.poolItem) m.userData.poolItem.owned = false;
  }

  meshCount() { return (this.mesh ? 1 : 0) + (this.prev ? 1 : 0); }
}
