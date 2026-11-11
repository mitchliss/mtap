// Earth's atmosphere as seen from orbit: a shell around the globe shaded per
// pixel by how close that line of sight passes to the surface. It gives the
// bright thin limb, the wide blue falloff into space, warm twilight where day
// meets night, and the sunlit rim you get when the Sun is behind the planet.

import * as THREE from 'three';

const SHELL_RADIUS = 1.32;

const VERTEX = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const FRAGMENT = /* glsl */`
  precision highp float;
  varying vec3 vWorld;
  uniform vec3 uSunDir;
  uniform float uRealistic;   // 1 = real sun with a terminator, 0 = lit all round
  uniform float uGain;
  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - ro);
    // Closest approach of this line of sight to Earth's centre.
    float tca = max(-dot(ro, rd), 0.0);
    vec3 pc = ro + rd * tca;
    float h = max(length(pc) - 1.0, 0.0);      // altitude of that closest point

    // Three stacked scale heights: the razor limb, the blue body, the faint halo.
    float limb = exp(-h / 0.006);
    float body = exp(-h / 0.030);
    float halo = exp(-h / 0.110);

    vec3 n = normalize(pc);
    float sd = dot(n, normalize(uSunDir));
    float day = mix(1.0, smoothstep(-0.30, 0.22, sd), uRealistic);
    float dusk = exp(-pow((sd + 0.03) / 0.17, 2.0)) * uRealistic;

    vec3 rayleigh = vec3(0.24, 0.50, 1.00);
    vec3 pale = vec3(0.66, 0.86, 1.00);
    vec3 col = (pale * limb * 0.85 + rayleigh * body * 0.62 + rayleigh * halo * 0.13) * day;
    // Twilight: the low atmosphere goes amber, the high atmosphere rose.
    col += (vec3(1.00, 0.46, 0.16) * limb * 0.95 + vec3(0.95, 0.32, 0.30) * body * 0.30) * dusk;
    // Looking toward the Sun through the air: strong forward scattering.
    float mu = max(dot(rd, normalize(uSunDir)), 0.0);
    col += vec3(1.00, 0.80, 0.56) * (limb * 1.3 + body * 0.35) * pow(mu, 10.0) * uRealistic;
    // Night-side airglow so the dark limb never vanishes into space.
    col += vec3(0.05, 0.11, 0.24) * (limb * 0.55 + body * 0.20) * (1.0 - day);

    gl_FragColor = vec4(col * uGain, 1.0);
  }`;

export function createAtmosphere(sunDir) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uSunDir: { value: sunDir }, uRealistic: { value: 0 }, uGain: { value: 1 } },
    vertexShader: VERTEX, fragmentShader: FRAGMENT,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SHELL_RADIUS, 96, 64), material);
  mesh.name = 'Atmosphere';
  mesh.renderOrder = 2;
  return mesh;
}
