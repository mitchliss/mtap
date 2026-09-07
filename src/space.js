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
      ['Jupiter', 215, 38, 3.0], ['Saturn', 290, 46, 4.2],
      ['Mars', 35, 34, 1.3], ['Neptune', 125, 55, 1.8],
    ].map(([name, longitude, radius, size]) => {
      const item = sprite(planetTexture(name)); item.name = name;
      const angle = THREE.MathUtils.degToRad(longitude);
      item.position.set(radius * Math.cos(angle), radius * Math.sin(angle) * Math.sin(0.41),
        radius * Math.sin(angle) * Math.cos(0.41));
      item.scale.setScalar(size);
      return { item };
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
    const mat = new THREE.MeshBasicMaterial({ color: '#9b8e7e', transparent: true, depthWrite: false, wireframe: false });
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
    this.materials.forEach((mat) => { mat.opacity = opacity * mat.userData.maxOpacity; });
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
    this.materials.forEach((mat) => mat.dispose());
    this.group.removeFromParent();
  }
}
