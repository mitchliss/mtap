import * as THREE from 'three';

export const GFX = {
  lighting: true,
  cityLights: true,
  atmosphere: true,
  oceanGlint: true,
  clouds: true,
  starTwinkle: true,
  toneMapping: true,
};

export const K_ROT = 1.1 * 2 * Math.tan(THREE.MathUtils.degToRad(45 / 2)) / (2 * Math.PI);
export const rotationSpeedForAltitude = (alt, k = K_ROT) => THREE.MathUtils.clamp(alt * k, 0.006, 0.7);
export const smoothingAlpha = (dt, tau) => 1 - Math.exp(-dt / tau);

export function selectTextureTier({ mobile, maxTextureSize, promoted = false, contextLosses = 0 }) {
  const high = !mobile || (promoted && contextLosses === 0);
  const cap = Math.max(1, maxTextureSize || 4096);
  const fit = (w, h) => {
    const scale = Math.min(1, cap / Math.max(w, h));
    return [Math.floor(w * scale), Math.floor(h * scale)];
  };
  return {
    name: high ? 'high' : 'low',
    base: fit(...(high ? [5400, 2700] : [4096, 2048])),
    night: fit(...(high ? [2700, 1350] : [2048, 1024])),
    clouds: fit(...(high ? [2048, 1024] : [1024, 512])),
  };
}

export function subsolarPoint(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000;
  const gamma = 2 * Math.PI / 365 * (day - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const eqMin = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  let lng = 180 - (utcMinutes + eqMin) / 4;
  while (lng > 180) lng -= 360;
  while (lng < -180) lng += 360;
  return { lat: THREE.MathUtils.radToDeg(decl), lng };
}

export function applySunShader(material, state) {
  material.userData.sunState = state;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = { value: state.sunDir };
    shader.uniforms.uNightMap = { value: state.nightTexture };
    shader.uniforms.uCityLights = { value: state.enabled && GFX.cityLights ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vSunWorld;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vSunWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uSunDir; uniform sampler2D uNightMap; uniform float uCityLights; varying vec3 vSunWorld;\nvoid main() {')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 wp = normalize(vSunWorld);
        float sunDot = dot(wp, normalize(uSunDir));
        vec2 nightUv = vec2(atan(-wp.z, wp.x) / (2.0 * PI) + 0.5, asin(wp.y) / PI + 0.5);
        vec3 city = texture2D(uNightMap, nightUv).rgb * smoothstep(0.10, -0.10, sunDot) * uCityLights;
        totalEmissiveRadiance += city * 1.25;
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.04, 0.93, 0.82), (1.0 - smoothstep(0.0, 0.16, abs(sunDot))) * 0.12);`);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => `sun-${state.enabled ? 1 : 0}-${GFX.cityLights ? 1 : 0}`;
  material.needsUpdate = true;
  return material;
}
