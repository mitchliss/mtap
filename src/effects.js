// Reveal and marker effects: the glowing arc between guess and answer, soft
// pulse rings and ground glows. Presentation only; none of it is pickable.

import * as THREE from 'three';

const ARC_VERTEX = /* glsl */`
  attribute vec3 aTangent;
  attribute float aSide;
  attribute float aT;
  uniform vec2 uRes;      // drawing buffer size in pixels
  uniform float uWidth;   // half-width in pixels
  varying float vT;
  varying float vSide;
  void main() {
    vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec4 n = projectionMatrix * modelViewMatrix * vec4(position + aTangent * 0.01, 1.0);
    // Expand the centre line sideways in SCREEN space, so the ribbon keeps a
    // constant pixel width from whole-Earth view down to street level.
    vec2 dir = (n.xy / n.w - c.xy / c.w) * uRes;
    float len = length(dir);
    dir = len > 1e-5 ? dir / len : vec2(1.0, 0.0);
    c.xy += vec2(-dir.y, dir.x) * aSide * uWidth / uRes * 2.0 * c.w;
    gl_Position = c;
    vT = aT;
    vSide = aSide;
  }`;

const ARC_FRAGMENT = /* glsl */`
  precision highp float;
  uniform float uHead;    // 0..1: how far the comet has flown
  uniform float uFlight;  // 1 while flying, eases to 0 after landing
  uniform float uTime;
  uniform float uPulses;  // number of energy pulses along the arc
  uniform float uGain;
  varying float vT;
  varying float vSide;
  void main() {
    if (vT > uHead) discard;
    float across = 1.0 - abs(vSide);
    float core = smoothstep(0.62, 0.96, across);
    float glow = across * across;
    // The comet's wake: white-hot at the head, cooling to gold behind it.
    float wake = exp(-(uHead - vT) * 9.0) * uFlight;
    // After landing, slow pulses of light keep travelling guess -> answer.
    float pulse = pow(0.5 + 0.5 * sin((vT * uPulses - uTime * 0.55) * 6.2831853), 10.0) * (1.0 - uFlight);
    float ends = smoothstep(0.0, 0.03, vT) * mix(1.0, smoothstep(0.0, 0.03, 1.0 - vT), 1.0 - uFlight);
    vec3 gold = vec3(1.00, 0.78, 0.30);
    vec3 hot = vec3(1.00, 0.97, 0.88);
    vec3 col = gold * (core * 0.55 + glow * 0.20);
    col += mix(gold, hot, wake) * (core * 1.5 + glow * 0.9) * wake;
    col += hot * (core * 0.9 + glow * 0.45) * pulse;
    gl_FragColor = vec4(col * ends * uGain, 1.0);
  }`;

// points: THREE.Vector3[] along the arc. Returns a mesh whose material uniforms
// (uHead, uFlight, uTime, uRes) are driven by the globe's frame loop.
export function makeArcRibbon(points, angle = 1) {
  const n = points.length;
  const position = new Float32Array(n * 2 * 3);
  const tangent = new Float32Array(n * 2 * 3);
  const side = new Float32Array(n * 2);
  const along = new Float32Array(n * 2);
  const index = [];
  const tan = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    tan.copy(points[Math.min(n - 1, i + 1)]).sub(points[Math.max(0, i - 1)]).normalize();
    for (let s = 0; s < 2; s++) {
      const k = i * 2 + s;
      position.set([points[i].x, points[i].y, points[i].z], k * 3);
      tangent.set([tan.x, tan.y, tan.z], k * 3);
      side[k] = s ? 1 : -1;
      along[k] = i / (n - 1);
    }
    if (i < n - 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('aTangent', new THREE.BufferAttribute(tangent, 3));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aT', new THREE.BufferAttribute(along, 1));
  geo.setIndex(index);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) }, uWidth: { value: 7 }, uHead: { value: 0 },
      uFlight: { value: 1 }, uTime: { value: 0 }, uGain: { value: 1 },
      // Longer arcs carry more pulses, so their spacing looks alike on screen.
      uPulses: { value: THREE.MathUtils.clamp(Math.round(angle * 5), 1, 9) },
    },
    vertexShader: ARC_VERTEX, fragmentShader: ARC_FRAGMENT,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

function canvasTexture(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A soft-edged ring (white; tint it with the material colour).
export function softRingTexture() {
  return canvasTexture(256, (g, S) => {
    const h = S / 2;
    const grad = g.createRadialGradient(h, h, 0, h, h, h);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.58, 'rgba(255,255,255,0.02)');
    grad.addColorStop(0.74, 'rgba(255,255,255,0.30)');
    grad.addColorStop(0.84, 'rgba(255,255,255,1)');
    grad.addColorStop(0.91, 'rgba(255,255,255,0.30)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
  });
}

// A round pool of light for the foot of a beam.
export function glowDiscTexture() {
  return canvasTexture(128, (g, S) => {
    const h = S / 2;
    const grad = g.createRadialGradient(h, h, 0, h, h, h);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.16, 'rgba(255,255,255,0.62)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.16)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
  });
}
