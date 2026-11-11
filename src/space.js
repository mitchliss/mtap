import * as THREE from 'three';
import { mulberry32 } from './rng.js';

// A stylized backdrop, not an astronomical scale model. Reveal it only after
// the normal whole-Earth view, with zero extra draw calls during close play.
export function spaceVisibility(distance) {
  const t = THREE.MathUtils.clamp((distance - 3.4) / 3.6, 0, 1);
  return t * t * (3 - 2 * t);
}

function texture(paint, width = 256, height = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

// Equirectangular surface maps (512 x 256) painted on a canvas: banded gas
// giants, a cratered rust-red Mars and a streaked ice giant. Wrapped on real
// spheres, so they turn, show true phases and keep their limb when you orbit.
const BANDS = {
  Jupiter: ['#c9b08e', '#8e5f42', '#e8d9bd', '#a8714d', '#efe2c8', '#9c6646', '#d9c3a0', '#7d5a45', '#cdb592', '#a98463'],
  Saturn: ['#d9c48f', '#c2a56f', '#e9dbaf', '#cdb37d', '#efe3bd', '#c8ac76', '#dccb98', '#b99c68'],
  Neptune: ['#2c5fb8', '#3a78d0', '#2a56ac', '#4388dc', '#2f66c0', '#27509f'],
};

function planetTexture(kind) {
  return texture((g, W, H) => {
    const rng = mulberry32(kind.length * 179 + 7);
    if (kind === 'Mars') {
      g.fillStyle = '#b8603c'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 260; i++) {        // mottled albedo: dark basalt plains, bright dust
        const dark = rng() < 0.45;
        g.fillStyle = dark ? `rgba(74,38,28,${0.05 + rng() * 0.12})` : `rgba(236,170,120,${0.04 + rng() * 0.10})`;
        g.beginPath(); g.ellipse(rng() * W, H * (0.12 + rng() * 0.76), 8 + rng() * 46, 5 + rng() * 22, rng() * 3.1, 0, Math.PI * 2); g.fill();
      }
      for (const [y0, y1] of [[0, 20], [H - 15, H]]) {  // polar caps
        const cap = g.createLinearGradient(0, y0, 0, y1);
        cap.addColorStop(y0 === 0 ? 0 : 1, 'rgba(250,246,240,0.95)'); cap.addColorStop(y0 === 0 ? 1 : 0, 'rgba(250,246,240,0)');
        g.fillStyle = cap; g.fillRect(0, y0, W, y1 - y0);
      }
      return;
    }
    const bands = BANDS[kind];
    const grad = g.createLinearGradient(0, 0, 0, H);
    bands.forEach((c, i) => grad.addColorStop(i / (bands.length - 1), c));
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // Turbulence: long thin streaks sheared along the bands.
    for (let i = 0; i < 420; i++) {
      const light = rng() < 0.5, a = 0.03 + rng() * (kind === 'Neptune' ? 0.07 : 0.10);
      g.fillStyle = light ? `rgba(255,246,226,${a})` : `rgba(60,34,26,${a})`;
      g.beginPath(); g.ellipse(rng() * W, rng() * H, 14 + rng() * 90, 0.8 + rng() * 3.2, 0, 0, Math.PI * 2); g.fill();
    }
    if (kind === 'Jupiter') {                 // the Great Red Spot, with its pale collar
      g.fillStyle = 'rgba(244,226,196,0.55)'; g.beginPath(); g.ellipse(330, 163, 37, 17, 0, 0, Math.PI * 2); g.fill();
      const spot = g.createRadialGradient(330, 163, 2, 330, 163, 30);
      spot.addColorStop(0, '#b8553a'); spot.addColorStop(0.7, '#a3482f'); spot.addColorStop(1, 'rgba(163,72,47,0)');
      g.fillStyle = spot; g.beginPath(); g.ellipse(330, 163, 30, 13, 0, 0, Math.PI * 2); g.fill();
    }
    if (kind === 'Neptune') {                 // bright methane-ice cloud streaks
      for (let i = 0; i < 14; i++) {
        g.fillStyle = `rgba(226,240,255,${0.10 + rng() * 0.16})`;
        g.beginPath(); g.ellipse(rng() * W, H * (0.25 + rng() * 0.5), 12 + rng() * 34, 1 + rng() * 1.6, 0, 0, Math.PI * 2); g.fill();
      }
    }
  }, 512, 256);
}

// Saturn's rings as a radial strip: C ring, B ring, Cassini division, A ring.
function ringTexture() {
  return texture((g, W, H) => {
    const grad = g.createLinearGradient(0, 0, W, 0);
    [[0, 'rgba(150,130,100,0)'], [0.04, 'rgba(150,130,100,0.22)'], [0.22, 'rgba(176,154,118,0.35)'],
      [0.25, 'rgba(226,208,168,0.92)'], [0.56, 'rgba(238,224,186,0.98)'], [0.60, 'rgba(206,186,146,0.9)'],
      [0.615, 'rgba(40,30,20,0.06)'], [0.66, 'rgba(40,30,20,0.06)'], [0.675, 'rgba(214,196,158,0.85)'],
      [0.93, 'rgba(196,178,142,0.75)'], [0.97, 'rgba(180,162,128,0.3)'], [1, 'rgba(180,162,128,0)']]
      .forEach(([at, c]) => grad.addColorStop(at, c));
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const rng = mulberry32(606);
    for (let i = 0; i < 90; i++) {            // fine ringlets
      g.fillStyle = rng() < 0.5 ? `rgba(255,246,220,${rng() * 0.16})` : `rgba(30,22,14,${rng() * 0.18})`;
      g.fillRect(W * (0.05 + rng() * 0.9), 0, 1 + rng() * 2.5, H);
    }
  }, 256, 4);
}

const PLANET_VERTEX = `
  varying vec3 vNormalW; varying vec3 vWorld; varying vec2 vUv;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

// Self-lit by the real Sun direction (not the game's lighting mode), so every
// planet shows the phase that matches where the Sun actually sits in the sky.
const PLANET_FRAGMENT = `
  precision highp float;
  uniform sampler2D uMap; uniform vec3 uSunDir; uniform vec3 uRim; uniform float uOpacity;
  varying vec3 vNormalW; varying vec3 vWorld; varying vec2 vUv;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorld);
    // Mostly sunlit from wherever you stand (a stylised backdrop should not go
    // black at new phase), with the real Sun still shaping the terminator.
    float l = dot(n, normalize(normalize(uSunDir) * 0.62 + v * 0.78));
    float lit = smoothstep(-0.25, 0.80, l);
    float facing = max(dot(n, v), 0.0);
    vec3 col = texture2D(uMap, vUv).rgb * (0.05 + 1.25 * lit) * mix(0.50, 1.0, pow(facing, 0.5));
    col += uRim * pow(1.0 - facing, 2.6) * (0.10 + 0.9 * lit);
    gl_FragColor = vec4(col, uOpacity);
    #include <colorspace_fragment>
  }`;

const RING_FRAGMENT = `
  precision highp float;
  uniform sampler2D uMap; uniform vec3 uSunDir; uniform vec3 uCenter; uniform float uBody; uniform float uOpacity;
  varying vec3 vWorld; varying vec2 vUv; varying vec3 vNormalW;
  void main() {
    float r = length(vUv - 0.5) * 2.0;                    // 0 at the centre, 1 at the outer edge
    vec4 ring = texture2D(uMap, vec2((r - 0.52) / 0.48, 0.5));
    if (r < 0.52 || r > 1.0) discard;
    // The planet's shadow falling across the far side of the rings.
    vec3 p = vWorld - uCenter;
    vec3 s = normalize(uSunDir);
    float along = dot(p, s);
    float shadow = along < 0.0 ? smoothstep(uBody * 0.96, uBody * 1.04, length(p - s * along)) : 1.0;
    float lit = 0.62 + 0.48 * abs(dot(normalize(vNormalW), s));
    gl_FragColor = vec4(ring.rgb * lit * mix(0.07, 1.0, shadow), ring.a * uOpacity);
    #include <colorspace_fragment>
  }`;

export class SpaceScenery {
  constructor(scene, sunDir = new THREE.Vector3(0.8, 0.2, 0.56).normalize()) {
    this.group = new THREE.Group();
    this.group.name = 'Deep space';
    scene.add(this.group);
    this.time = 0;
    this.reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.materials = [];
    this.textures = [];
    const shaded = (fragmentShader, uniforms, extra = {}) => {
      const material = new THREE.ShaderMaterial({ vertexShader: PLANET_VERTEX, fragmentShader,
        uniforms: { uSunDir: { value: sunDir }, uOpacity: { value: 0 }, ...uniforms }, transparent: true, ...extra });
      material.userData.maxOpacity = 1;
      this.materials.push(material);
      return material;
    };
    const ball = new THREE.SphereGeometry(0.5, 48, 32);
    // name, ecliptic longitude, distance, diameter, axial tilt, rim (atmosphere) colour, spin
    this.planets = [
      ['Jupiter', 215, 38, 3.0, 0.05, [0.95, 0.80, 0.62], 0.020], ['Saturn', 290, 46, 2.4, 0.47, [0.95, 0.86, 0.62], 0.018],
      ['Mars', 35, 34, 1.3, 0.44, [0.95, 0.50, 0.32], 0.010], ['Neptune', 125, 55, 1.8, 0.49, [0.45, 0.68, 1.00], 0.014],
    ].map(([name, longitude, radius, size, tilt, rim, spin]) => {
      const item = new THREE.Group(); item.name = name;
      const map = planetTexture(name); this.textures.push(map);
      const body = new THREE.Mesh(ball, shaded(PLANET_FRAGMENT, { uMap: { value: map }, uRim: { value: new THREE.Vector3(...rim) } }));
      item.add(body);
      const angle = THREE.MathUtils.degToRad(longitude);
      item.position.set(radius * Math.cos(angle), radius * Math.sin(angle) * Math.sin(0.41),
        radius * Math.sin(angle) * Math.cos(0.41));
      item.scale.setScalar(size);
      item.rotation.set(tilt, 0, tilt * 0.6);
      if (name === 'Saturn') {
        const ringMap = ringTexture(); this.textures.push(ringMap);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 1.2, 96, 1), shaded(RING_FRAGMENT,
          { uMap: { value: ringMap }, uCenter: { value: item.position }, uBody: { value: size * 0.5 } },
          { side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = Math.PI / 2;
        item.add(ring);
      }
      this.group.add(item);
      return { item, body, spin };
    });
    const cometMap = texture((g, w, h) => {
      const tail = g.createLinearGradient(0, 0, w, 0);
      tail.addColorStop(0, 'rgba(83,150,245,0)');
      tail.addColorStop(0.75, 'rgba(138,213,255,0.28)');
      tail.addColorStop(1, 'rgba(222,246,255,0.95)');
      g.fillStyle = tail; g.beginPath(); g.moveTo(0, 3); g.quadraticCurveTo(w * 0.6, h * 0.15, w - 15, h / 2);
      g.quadraticCurveTo(w * 0.6, h * 0.7, 0, h - 3); g.fill();
      const glow = g.createRadialGradient(w - 17, h / 2, 0, w - 17, h / 2, 16);
      glow.addColorStop(0, '#fff'); glow.addColorStop(0.2, '#d4f5ff'); glow.addColorStop(1, 'rgba(116,200,255,0)');
      g.fillStyle = glow; g.fillRect(w - 34, 0, 34, h);
    }, 256, 64);
    this.comets = [0.85, 0.65].map((opacity) => {
      const material = new THREE.MeshBasicMaterial({ map: cometMap, transparent: true,
        depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      material.userData.maxOpacity = opacity; this.materials.push(material);
      const item = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), material);
      item.name = 'Comet'; this.group.add(item); return item;
    });
    // A single GPU instance batch for the entire scattered asteroid belt.
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshLambertMaterial({ color: '#b9ab98', transparent: true, depthWrite: false, flatShading: true });
    mat.userData.maxOpacity = 0.7; this.materials.push(mat);
    this.asteroids = new THREE.InstancedMesh(geo, mat, 110);
    this.asteroids.name = 'Asteroid belt';
    this.group.add(this.asteroids);
    const rng = mulberry32(8721);
    this.rocks = Array.from({ length: 110 }, () => ({ angle: rng() * Math.PI * 2, radius: 39 + rng() * 7,
      y: rng() * 2 - 1, size: 0.035 + rng() ** 3 * 0.13,
      rotation: rng() * 6.28, color: new THREE.Color().setHSL(0.09, 0.12, 0.24 + rng() * 0.3) }));
    this.dummy = new THREE.Object3D();
    this.rocks.forEach((rock, i) => this.asteroids.setColorAt(i, rock.color));
    this.group.visible = false;
  }

  update(dt, camera) {
    const opacity = spaceVisibility(camera.position.length());
    this.group.visible = opacity > 0;
    if (!this.group.visible) return;
    if (!this.reducedMotion?.matches) this.time += dt;
    this.materials.forEach((mat) => {
      mat.opacity = opacity * mat.userData.maxOpacity;
      if (mat.uniforms?.uOpacity) mat.uniforms.uOpacity.value = mat.opacity;
    });
    this.planets.forEach(({ body, spin }) => { body.rotation.y = this.time * spin; });
    // Fixed Earth-centered world coordinates, shared with the star field and
    // Moon. Orbiting the camera reveals different parts of the surrounding sky.
    this.comets.forEach((item, i) => {
      const angle = this.time * 0.006 + i * Math.PI + 0.8;
      const radius = 48 + i * 8;
      item.position.set(radius * Math.cos(angle), radius * Math.sin(angle) * Math.sin(0.65),
        radius * Math.sin(angle) * Math.cos(0.65));
      // The tail follows the orbit's tangent in the same fixed orbital plane.
      item.rotation.set(Math.PI / 2 - 0.65, 0, angle + Math.PI / 2);
    });
    this.rocks.forEach((rock, i) => {
      const angle = rock.angle + this.time * 0.0008;
      this.dummy.position.set(rock.radius * Math.cos(angle),
        rock.radius * Math.sin(angle) * Math.sin(0.41) + rock.y,
        rock.radius * Math.sin(angle) * Math.cos(0.41));
      this.dummy.rotation.set(rock.rotation, rock.rotation + this.time * 0.025, rock.rotation);
      this.dummy.scale.set(rock.size, rock.size * 0.65, rock.size * 0.8);
      this.dummy.updateMatrix(); this.asteroids.setMatrixAt(i, this.dummy.matrix);
    });
    this.asteroids.instanceMatrix.needsUpdate = true;
    // The belt slowly orbits; do not reuse an old instance bound.
    this.asteroids.frustumCulled = false;
  }

  dispose() {
    const maps = new Set();
    this.group.traverse((object) => {
      object.geometry?.dispose();
      if (object.material?.map) maps.add(object.material.map);
    });
    maps.forEach((map) => map.dispose());
    this.textures.forEach((map) => map.dispose());
    this.materials.forEach((mat) => mat.dispose());
    this.group.removeFromParent();
  }
}
