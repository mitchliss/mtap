// Deep-sky backdrop: a GPU-baked Milky Way / nebula dome, a star field with
// real magnitude and colour variety, and the Sun's glare. Pure scenery: nothing
// here is pickable or changes the camera, and it all sits behind the globe.

import * as THREE from 'three';
import { mulberry32 } from './rng.js';

// The Milky Way's plane (matches the resolved star band below) and the
// direction of its bright core, both in fixed world space.
const GALAXY_NORMAL = new THREE.Vector3(0, 0.8537, 0.5208).normalize();
const GALAXY_CORE = new THREE.Vector3(1, 0, 0).cross(GALAXY_NORMAL).normalize();
const SKY_RADIUS = 86;
const SCRATCH = new THREE.Vector3();

const NOISE_GLSL = /* glsl */`
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
                   mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
                   mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = p * 2.03 + 17.7; a *= 0.5; }
    return s;
  }`;

// Painted once into an equirectangular target; the dome then costs one texture
// fetch per background pixel instead of ~20 noise evaluations every frame.
const BAKE_FRAGMENT = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform vec3 uNormal;
  uniform vec3 uCore;
  ${NOISE_GLSL}
  void main() {
    float lon = (vUv.x - 0.5) * 6.28318530718;
    float lat = (vUv.y - 0.5) * 3.14159265359;
    vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));

    float h = dot(d, uNormal);                 // signed height off the galactic plane
    float core = max(dot(d, uCore), 0.0);
    float warp = fbm(d * 3.0) - 0.5;
    float hw = h + warp * 0.07;
    float band = exp(-hw * hw / 0.026);        // the broad disc
    float bulge = exp(-hw * hw / 0.085) * pow(core, 5.0);

    // Billowing star clouds, cut by dark dust lanes hugging the midplane.
    float clouds = fbm(d * 5.5 + 3.1);
    float fine = fbm(d * 17.0 + 9.4);
    float lanes = smoothstep(0.44, 0.66, fbm(d * 8.0 + vec3(4.0, 1.0, 7.0)));
    float dust = lanes * exp(-hw * hw / 0.0045);

    float glow = band * (0.30 + 0.95 * clouds) * (0.55 + 0.75 * fine) + bulge * 1.5;
    glow *= mix(0.42, 1.0, pow(core, 1.6) * 0.75 + 0.25);
    glow *= 1.0 - 0.86 * dust;

    vec3 armCol = vec3(0.50, 0.62, 1.00);
    vec3 coreCol = vec3(1.00, 0.84, 0.62);
    vec3 col = mix(armCol, coreCol, clamp(bulge * 1.5 + pow(core, 3.0) * 0.55, 0.0, 1.0)) * glow * 0.40;
    // Rust-coloured dust where the lanes thin out, a touch of emission pink.
    col += vec3(0.50, 0.22, 0.12) * dust * band * 0.045;
    col += vec3(0.85, 0.25, 0.42) * band * smoothstep(0.62, 0.80, fbm(d * 11.0 + 21.0)) * 0.07;

    // Very faint high-latitude nebulosity so the rest of the sky is not flat.
    float wisps = smoothstep(0.50, 0.85, fbm(d * 2.2 + 40.0));
    float tint = fbm(d * 1.3 + 80.0);
    col += mix(vec3(0.10, 0.20, 0.55), vec3(0.42, 0.14, 0.50), tint) * wisps * 0.050;

    // Deep-space base: near black with a cold blue cast.
    col += vec3(0.010, 0.016, 0.040) + vec3(0.006, 0.010, 0.022) * fbm(d * 1.7);
    gl_FragColor = vec4(col, 1.0);
  }`;

const DOME_FRAGMENT = /* glsl */`
  precision highp float;
  varying vec3 vDir;
  uniform sampler2D uSky;
  uniform float uGain;
  void main() {
    vec3 d = normalize(vDir);
    vec2 uv = vec2(atan(d.z, d.x) / 6.28318530718 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265359 + 0.5);
    vec3 col = texture2D(uSky, uv).rgb;
    // Keep the base tone steady; only the galaxy's glow follows the gain.
    vec3 base = vec3(0.012, 0.019, 0.046);
    gl_FragColor = vec4(base + max(col - base, 0.0) * uGain, 1.0);
  }`;

const STAR_VERTEX = /* glsl */`
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixel;
  uniform float uTwinkle;
  varying vec3 vColor;
  varying float vBig;
  void main() {
    float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (1.1 + fract(aPhase) * 1.6) + aPhase));
    vColor = aColor * tw;
    vBig = smoothstep(2.2, 4.0, aSize);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * uPixel * mix(1.0, 2.6, vBig));
  }`;

const STAR_FRAGMENT = /* glsl */`
  precision highp float;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vBig;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    // Small stars: a soft disc. Bright ones: a tight core, a halo, and the
    // four diffraction spikes a telescope would give them.
    float small = exp(-r2 * 3.2);
    float core = exp(-r2 * 46.0);
    float halo = exp(-r2 * 7.0) * 0.30;
    float spikes = (exp(-abs(p.x) * 26.0) * exp(-abs(p.y) * 3.4) + exp(-abs(p.y) * 26.0) * exp(-abs(p.x) * 3.4)) * 0.55;
    float a = mix(small, core + halo + spikes, vBig) * (1.0 - r2 * r2);
    gl_FragColor = vec4(vColor * a * uOpacity, 1.0);
  }`;

// Blackbody-ish palette: most stars are white, a few are distinctly blue,
// yellow or orange, which is what makes a field read as real.
const STAR_TINTS = [
  [0.68, 0.78, 1.00], [0.80, 0.87, 1.00], [1.00, 1.00, 1.00], [1.00, 1.00, 1.00],
  [1.00, 0.96, 0.86], [1.00, 0.88, 0.68], [1.00, 0.76, 0.52],
];

function starPoints(count, seed, place, { size = 1, bright = 0.012, dim = 1 } = {}) {
  const rng = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    place(rng, v);
    positions.set([v.x, v.y, v.z], i * 3);
    // Steep magnitude curve: lots of faint stars, a handful of bright ones.
    const m = rng();
    const big = rng() < bright;
    const s = big ? 2.6 + rng() * 1.6 : 0.75 + Math.pow(m, 5) * 1.5;
    sizes[i] = s * size;
    const tint = STAR_TINTS[Math.floor(rng() * STAR_TINTS.length)];
    const lum = (big ? 1 : 0.34 + 0.66 * Math.pow(m, 2.2)) * dim;
    colors.set([tint[0] * lum, tint[1] * lum, tint[2] * lum], i * 3);
    phases[i] = rng() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  return geo;
}

function paintSun() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const h = S / 2;
  const radial = (stops, r = h) => {
    const grad = g.createRadialGradient(h, h, 0, h, h, r);
    stops.forEach(([at, col]) => grad.addColorStop(at, col));
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
  };
  g.globalCompositeOperation = 'lighter';
  // Wide corona, then a tighter warm halo, then the white-hot disc.
  radial([[0, 'rgba(255,214,150,0.42)'], [0.22, 'rgba(255,190,120,0.16)'], [0.55, 'rgba(255,170,110,0.04)'], [1, 'rgba(255,170,110,0)']]);
  radial([[0, 'rgba(255,244,214,0.95)'], [0.3, 'rgba(255,220,160,0.35)'], [1, 'rgba(255,200,130,0)']], h * 0.34);
  // Diffraction streaks: long and thin on the axes, shorter on the diagonals.
  const rng = mulberry32(31);
  g.translate(h, h);
  for (let i = 0; i < 12; i++) {
    const major = i % 3 === 0, mid = i % 3 === 1;
    const len = h * (major ? 0.78 : mid ? 0.42 : 0.26 + rng() * 0.1);
    const grad = g.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, `rgba(255,240,210,${major ? 0.34 : mid ? 0.2 : 0.12})`);
    grad.addColorStop(1, 'rgba(255,225,180,0)');
    g.fillStyle = grad;
    g.save(); g.rotate((i / 12) * Math.PI * 2 + 0.26);
    g.beginPath(); g.moveTo(0, -(major ? 3.2 : 2)); g.lineTo(len, 0); g.lineTo(0, major ? 3.2 : 2); g.closePath(); g.fill();
    g.restore();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  radial([[0, '#ffffff'], [0.55, 'rgba(255,252,240,1)'], [1, 'rgba(255,240,205,0)']], h * 0.085);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Sky {
  constructor(scene, renderer, { sunPos, twinkle = true, compact = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'Sky';
    scene.add(this.group);
    this.uniforms = {
      uTime: { value: 0 }, uPixel: { value: 1.7 * renderer.getPixelRatio() },
      uTwinkle: { value: twinkle ? 0.34 : 0 }, uOpacity: { value: 1 },
    };
    const starMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    });
    this.starMaterial = starMat;

    // The general field: uniformly scattered over the celestial sphere.
    const field = new THREE.Points(starPoints(7200, 99, (rng, v) => {
      const u = rng() * 2 - 1, theta = rng() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      v.set(s * Math.cos(theta), u, s * Math.sin(theta)).multiplyScalar(60);
    }), starMat);
    // The Milky Way's resolved stars: a dense, thin band in the galactic plane,
    // thicker and richer toward the core.
    const basisA = GALAXY_CORE.clone();
    const basisB = new THREE.Vector3().crossVectors(GALAXY_NORMAL, basisA).normalize();
    const band = new THREE.Points(starPoints(7600, 777, (rng, v) => {
      // Bias longitudes toward the core without emptying the far side.
      const t = rng() < 0.45 ? (rng() + rng() + rng() - 1.5) * 1.5 : rng() * Math.PI * 2;
      const spread = (rng() + rng() + rng() - 1.5) * (0.10 + 0.07 * Math.max(0, Math.cos(t)));
      v.copy(basisA).multiplyScalar(Math.cos(t)).addScaledVector(basisB, Math.sin(t))
        .addScaledVector(GALAXY_NORMAL, spread).normalize().multiplyScalar(64);
    }, { size: 0.8, bright: 0.002, dim: 0.72 }), starMat);
    field.frustumCulled = band.frustumCulled = false;
    field.renderOrder = band.renderOrder = -8;
    this.group.add(field, band);

    // Nebula dome (baked on the GPU; skipped silently if the bake fails).
    this.renderer = renderer;
    this.domeUniforms = { uSky: { value: null }, uGain: { value: 1 } };
    try {
      // Phones get a half-size nebula: a quarter of the memory, visually the same.
      this.target = new THREE.WebGLRenderTarget(compact ? 1024 : 2048, compact ? 512 : 1024, {
        depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping,
      });
      this.bake();
      this.domeUniforms.uSky.value = this.target.texture;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), new THREE.ShaderMaterial({
        uniforms: this.domeUniforms, side: THREE.BackSide, depthWrite: false, depthTest: false,
        vertexShader: 'varying vec3 vDir;\nvoid main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: DOME_FRAGMENT,
      }));
      dome.renderOrder = -10; dome.frustumCulled = false;
      this.group.add(dome);
      this.dome = dome;
    } catch (err) {
      console.warn('Sky dome unavailable; using plain star field', err);
      this.target?.dispose(); this.target = null;
    }

    // The Sun: a small white-hot disc with a wide corona and diffraction rays.
    if (sunPos) {
      const mat = new THREE.SpriteMaterial({ map: paintSun(), blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true, toneMapped: false });
      this.sun = new THREE.Sprite(mat);
      this.sun.position.copy(sunPos).normalize().multiplyScalar(70);
      this.sun.scale.set(34, 34, 1);
      this.sun.renderOrder = -6;
      this.group.add(this.sun);
    }
  }

  // (Re)paint the nebula. Called at start-up and after a WebGL context restore,
  // which empties render targets.
  bake() {
    if (!this.target) return;
    const renderer = this.renderer;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = new THREE.ShaderMaterial({
      uniforms: { uNormal: { value: GALAXY_NORMAL }, uCore: { value: GALAXY_CORE } },
      vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: BAKE_FRAGMENT, depthTest: false, depthWrite: false, toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    scene.add(quad);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(prev);
    quad.geometry.dispose(); material.dispose();
  }

  // distance: camera distance from Earth's centre. Close to the surface the sky
  // stays quiet; pulling back into space brings the galaxy up.
  update(dt, camera) {
    const distance = camera.position.length();
    this.uniforms.uTime.value += dt;
    if (this.sun) {
      // Sunrise over the limb: the glare (rays included) fades as the disc
      // slips behind Earth, instead of its rays poking out from a hidden core.
      const toSun = SCRATCH.copy(this.sun.position).sub(camera.position).normalize();
      const sep = Math.acos(THREE.MathUtils.clamp(-toSun.dot(camera.position) / distance, -1, 1));
      const limb = Math.asin(Math.min(1, 1 / distance));
      const seen = THREE.MathUtils.smoothstep(sep, limb - 0.012, limb + 0.05);
      this.sun.material.opacity = seen;
      this.sun.visible = seen > 0.002;
    }
    const t = THREE.MathUtils.clamp((distance - 2.9) / 4, 0, 1);
    this.uniforms.uOpacity.value = 0.62 + 0.38 * t;
    this.domeUniforms.uGain.value = 0.7 + 0.9 * t;
  }

  setPixelRatio(ratio) { this.uniforms.uPixel.value = 1.7 * ratio; }

  dispose() {
    this.group.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
    this.target?.dispose();
    this.group.removeFromParent();
  }
}
