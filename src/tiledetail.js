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
const ENGAGE_DISTANCE = 2.1;   // start streaming below this camera distance
const FULL_DISTANCE = 1.55;    // fully opaque below this
const MERC_LAT_LIMIT = 85.05;
const SETTLE_MS = 350;         // camera must rest this long before a rebuild

const TILE_HOSTS = [
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g',
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g',
];

function mercY(lat) {
  // Latitude -> normalized web-mercator y in [0,1]
  const s = Math.sin(toRad(Math.max(-MERC_LAT_LIMIT, Math.min(MERC_LAT_LIMIT, lat))));
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

export class TileDetail {
  constructor(globe, geojson) {
    this.globe = globe;
    this.geojson = geojson;
    this.enabled = null;         // null = not probed yet
    this.hostIdx = 0;
    this.cache = new Map();      // "z/x/y" -> Promise<Image>
    this.mesh = null;
    this.building = false;
    this.lastCamPos = new THREE.Vector3();
    this.stillSince = 0;
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

  _loadTile(z, x, y, hostIdx = this.hostIdx) {
    const n = 1 << z;
    const xm = ((x % n) + n) % n; // wrap across the antimeridian
    if (y < 0 || y >= n) return Promise.reject(new Error('tile row out of range'));
    const key = `${hostIdx}:${z}/${xm}/${y}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // required or the WebGL upload is blocked
      const timer = setTimeout(() => { img.src = ''; reject(new Error('tile timeout')); }, 12000);
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); reject(new Error('tile error')); };
      img.src = `${TILE_HOSTS[hostIdx]}/${z}/${y}/${xm}.jpg`;
    });
    p.catch(() => this.cache.delete(key));
    this.cache.set(key, p);
    if (this.cache.size > 500) { // simple FIFO trim
      const first = this.cache.keys().next().value;
      this.cache.delete(first);
    }
    return p;
  }

  // Called every frame from the globe's tick.
  update(dt) {
    if (this.enabled === false) return;
    const cam = this.globe.camera;
    const d = cam.position.length();

    // Fade with zoom; drop the mesh entirely when far out.
    if (this.mesh) {
      const opacity = THREE.MathUtils.clamp((ENGAGE_DISTANCE - d) / (ENGAGE_DISTANCE - FULL_DISTANCE), 0, 1);
      this.mesh.material.opacity = opacity;
      this.mesh.visible = opacity > 0.02;
    }
    if (d > ENGAGE_DISTANCE || this.enabled === null) return;

    // Rebuild only after the camera has settled somewhere new.
    const moved = cam.position.distanceTo(this.lastCamPos) > 0.0004 * d;
    if (moved) {
      this.lastCamPos.copy(cam.position);
      this.stillSince = performance.now();
      return;
    }
    if (performance.now() - this.stillSince < SETTLE_MS || this.building) return;

    const region = this._visibleRegion();
    if (!region) return;
    const key = [region.west.toFixed(2), region.east.toFixed(2), region.south.toFixed(2), region.north.toFixed(2)].join('|');
    if (key === this.lastRegionKey) return;
    this.building = true;
    this._buildPatch(region)
      .then(() => { this.lastRegionKey = key; })
      .catch(() => { /* keep the old patch; retry on next settle */ })
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

  async _buildPatch(region) {
    const lonSpan = region.east - region.west;
    const latSpan = region.north - region.south;
    // Pick the zoom whose tile grid fits the budget; step down if the mercator
    // row stretch (high latitudes) blows it up.
    let z = THREE.MathUtils.clamp(Math.round(Math.log2((PATCH_W / TILE_SIZE) * 360 / lonSpan)), MIN_Z, MAX_Z);
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
      jobs.push(this._loadTile(z, x, y).then((img) => ({ x, y, img })).catch(() => null));
    }
    const tiles = (await Promise.all(jobs)).filter(Boolean);
    if (!tiles.length) throw new Error('no tiles');

    // 1) paste tiles onto a mercator-space canvas
    const mercCanvas = document.createElement('canvas');
    mercCanvas.width = (x1 - x0 + 1) * TILE_SIZE;
    mercCanvas.height = (y1 - y0 + 1) * TILE_SIZE;
    const mctx = mercCanvas.getContext('2d');
    for (const t of tiles) {
      mctx.drawImage(t.img, (t.x - x0) * TILE_SIZE, (t.y - y0) * TILE_SIZE);
    }

    // 2) resample rows into an equirectangular patch (linear in latitude)
    const patchH = Math.max(256, Math.round(PATCH_W * (latSpan / lonSpan)));
    const patch = document.createElement('canvas');
    patch.width = PATCH_W;
    patch.height = patchH;
    const pctx = patch.getContext('2d');
    const mercTop = y0 / n;                       // normalized merc y at canvas top
    const mercPxPerUnit = n * TILE_SIZE;          // merc canvas px per normalized unit
    const srcXOffset = (((region.west + 180) / 360) * n - x0) * TILE_SIZE;
    const srcWidth = (lonSpan / 360) * n * TILE_SIZE;
    for (let row = 0; row < patchH; row++) {
      const lat = region.north - (latSpan * (row + 0.5)) / patchH;
      const sy = (mercY(lat) - mercTop) * mercPxPerUnit;
      pctx.drawImage(mercCanvas, srcXOffset, sy - 0.5, srcWidth, 1, 0, row, PATCH_W, 1);
    }

    // 3) country borders, same style as the base texture
    const px = (lng) => ((lng - region.west) / lonSpan) * PATCH_W;
    const py = (lat) => ((region.north - lat) / latSpan) * patchH;
    const stroke = (color, width) => {
      pctx.strokeStyle = color;
      pctx.lineWidth = width;
      for (const feature of this.geojson.features) {
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
            if (prev === null || Math.abs(x - prev) > PATCH_W / 2) pctx.moveTo(x, y);
            else pctx.lineTo(x, y);
            prev = x;
          }
          pctx.stroke();
        }
      }
    };
    stroke('rgba(0, 0, 0, 0.3)', 2.4);
    stroke('rgba(255, 255, 255, 0.5)', 1.1);

    // 4) drape on a sphere segment matching the region exactly
    const tex = new THREE.CanvasTexture(patch);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const phiStart = toRad(region.west + 180);
    const phiLength = toRad(lonSpan);
    const thetaStart = toRad(90 - region.north);
    const thetaLength = toRad(latSpan);
    const geo = new THREE.SphereGeometry(1.0006, 96, 96, phiStart, phiLength, thetaStart, thetaLength);
    const mat = new THREE.MeshPhongMaterial({
      map: tex,
      transparent: true,
      opacity: this.mesh ? this.mesh.material.opacity : 0,
      shininess: 8,
      specular: new THREE.Color(0x222c3a),
      depthWrite: false, // sits just above the base sphere; avoid z-fighting
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;

    // Swap in atomically, dispose the old
    if (this.mesh) {
      this.globe.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      if (this.mesh.material.map) this.mesh.material.map.dispose();
      this.mesh.material.dispose();
    }
    this.mesh = mesh;
    this.globe.scene.add(mesh);
  }
}
