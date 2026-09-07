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

function planetTexture(kind) {
  return texture((g) => {
    const rng = mulberry32(kind.length * 179);
    const ring = (front) => {
      g.save(); g.translate(128, 128); g.rotate(-0.35);
      g.beginPath(); g.ellipse(0, 0, 119, 36, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      g.strokeStyle = '#ac9375'; g.lineWidth = 15; g.stroke();
      g.strokeStyle = '#e1d2ac'; g.lineWidth = 7; g.stroke(); g.restore();
    };
    if (kind === 'Saturn') ring(false);
    const r = kind === 'Saturn' ? 65 : 101;
    g.save(); g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = { Jupiter: '#be9674', Saturn: '#d7bf88', Mars: '#ba6240', Neptune: '#4a87c7' }[kind];
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 55; i++) {
      g.fillStyle = i % 2 ? `rgba(55,30,27,${0.05 + rng() * 0.17})` : `rgba(255,239,203,${rng() * 0.25})`;
      if (kind === 'Mars') {
        g.beginPath(); g.ellipse(rng() * 256, rng() * 256, 5 + rng() * 26, 3 + rng() * 16, rng() * 6, 0, Math.PI * 2); g.fill();
      } else {
        g.fillRect(0, rng() * 256, 256, 1 + rng() * 9);
      }
    }
    if (kind === 'Jupiter') {
      g.fillStyle = '#a9583c'; g.beginPath(); g.ellipse(160, 165, 25, 12, -0.1, 0, Math.PI * 2); g.fill();
    }
    const shade = g.createLinearGradient(128 - r, 128 - r, 128 + r, 128 + r);
    shade.addColorStop(0, 'rgba(255,246,216,0.22)');
    shade.addColorStop(0.5, 'rgba(0,5,17,0.1)');
    shade.addColorStop(1, 'rgba(0,5,17,0.92)');
    g.fillStyle = shade; g.fillRect(0, 0, 256, 256); g.restore();
    if (kind === 'Saturn') ring(true);
  });
}

export class SpaceScenery {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'Deep space';
    scene.add(this.group);
    this.time = 0;
    this.reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.materials = [];
    const sprite = (map, opacity = 1, additive = false) => {
      const material = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      material.userData.maxOpacity = opacity;
      this.materials.push(material);
      const item = new THREE.Sprite(material);
      this.group.add(item); return item;
    };
    this.planets = [
      ['Jupiter', -0.7, 0.42, 0.17], ['Saturn', 0.65, -0.42, 0.24],
      ['Mars', 0.76, 0.56, 0.075], ['Neptune', -0.68, -0.61, 0.09],
    ].map(([name, x, y, size]) => {
      const item = sprite(planetTexture(name)); item.name = name;
      return { item, x, y, size };
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
    this.comets = [sprite(cometMap, 0.85, true), sprite(cometMap, 0.65, true)];
    this.comets.forEach((item, i) => { item.name = 'Comet'; item.material.rotation = i ? -0.3 : 0.3; });
    // A single GPU instance batch for the entire scattered asteroid belt.
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshBasicMaterial({ color: '#9b8e7e', transparent: true, depthWrite: false, wireframe: false });
    mat.userData.maxOpacity = 0.7; this.materials.push(mat);
    this.asteroids = new THREE.InstancedMesh(geo, mat, 110);
    this.asteroids.name = 'Asteroid belt';
    this.group.add(this.asteroids);
    const rng = mulberry32(8721);
    this.rocks = Array.from({ length: 110 }, () => ({ x: rng() * 2.4 - 1.2,
      y: rng() * 0.18 - 0.09, size: 0.0015 + rng() ** 3 * 0.006,
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
    this.materials.forEach((mat) => { mat.opacity = opacity * mat.userData.maxOpacity; });
    // Camera-oriented scenery keeps planets in the margins on narrow phones.
    // Everything is 35 units behind Earth, so Earth always occludes the scenery.
    this.group.quaternion.copy(camera.quaternion);
    const h = (35 + camera.position.length()) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const w = h * camera.aspect;
    const unit = Math.min(w, h);
    this.planets.forEach(({ item, x, y, size }) => {
      item.position.set(x * w, y * h, -35); item.scale.setScalar(size * unit);
    });
    this.comets.forEach((item, i) => {
      const phase = ((this.time + i * 31) % 64) / 64;
      item.position.set((-1.25 + phase * 2.5) * w, (i ? -0.76 + phase * 0.2 : 0.64 + phase * 0.22) * h, -35);
      item.scale.set(0.32 * unit, 0.08 * unit, 1);
    });
    this.rocks.forEach((rock, i) => {
      const x = ((rock.x + this.time * 0.003 + 1.2) % 2.4) - 1.2;
      this.dummy.position.set(x * w, (-0.55 + 0.21 * x + rock.y) * h, -35);
      this.dummy.rotation.set(rock.rotation, rock.rotation + this.time * 0.025, rock.rotation);
      this.dummy.scale.set(rock.size * unit, rock.size * unit * 0.65, rock.size * unit * 0.8);
      this.dummy.updateMatrix(); this.asteroids.setMatrixAt(i, this.dummy.matrix);
    });
    this.asteroids.instanceMatrix.needsUpdate = true;
    // Instances move with viewport dimensions; do not reuse an old bound.
    this.asteroids.frustumCulled = false;
  }

  dispose() {
    const maps = new Set();
    this.group.traverse((object) => {
      object.geometry?.dispose();
      if (object.material?.map) maps.add(object.material.map);
    });
    maps.forEach((map) => map.dispose());
    this.materials.forEach((mat) => mat.dispose());
    this.group.removeFromParent();
  }
}
