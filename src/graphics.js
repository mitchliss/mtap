import * as THREE from 'three';

export const GFX = {
  lighting: true,
  cityLights: true,
  atmosphere: true,
  oceanGlint: true,
  clouds: true,
  starTwinkle: true,
  toneMapping: true,
  pinRipple: true,      // expanding ring where a tap drops the pin
  shootingStars: true,  // occasional meteors on menu/end screens (never mid-round)
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

// Shared by the globe and the streamed satellite tiles: city lights on the
// night side, a warm terminator, and aerial perspective (the blue haze that
// thickens toward the limb, where you look through the most air).
export function applySunShader(material, state) {
  material.userData.sunState = state;
  material.onBeforeCompile = (shader) => {
    const realistic = state.enabled ? 1 : 0;
    shader.uniforms.uSunDir = { value: state.sunDir };
    shader.uniforms.uNightMap = { value: state.nightTexture };
    shader.uniforms.uCityLights = { value: realistic && GFX.cityLights ? 1 : 0 };
    shader.uniforms.uRealistic = { value: realistic };
    shader.uniforms.uHaze = { value: GFX.atmosphere ? 1 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vSunWorld;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vSunWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uSunDir; uniform sampler2D uNightMap; uniform float uCityLights; uniform float uRealistic; uniform float uHaze; varying vec3 vSunWorld;\nvoid main() {')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 wp = normalize(vSunWorld);
        float sunDot = dot(wp, normalize(uSunDir));
        vec2 nightUv = vec2(atan(-wp.z, wp.x) / (2.0 * PI) + 0.5, asin(wp.y) / PI + 0.5);
        vec3 city = texture2D(uNightMap, nightUv).rgb * smoothstep(0.10, -0.10, sunDot) * uCityLights;
        totalEmissiveRadiance += city * vec3(1.45, 1.22, 0.92);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(1.06, 0.90, 0.76), (1.0 - smoothstep(0.0, 0.18, abs(sunDot))) * 0.20 * uRealistic);`)
      .replace('#include <opaque_fragment>', `
        {
          float hazeView = 1.0 - max(dot(wp, normalize(cameraPosition - vSunWorld)), 0.0);
          float hazeDay = mix(1.0, smoothstep(-0.22, 0.25, sunDot), uRealistic);
          float hazeDusk = exp(-pow((sunDot + 0.02) / 0.16, 2.0)) * uRealistic;
          float hazeAmount = (pow(hazeView, 5.0) * 0.82 + pow(hazeView, 1.7) * 0.06) * uHaze;
          vec3 hazeColor = mix(vec3(0.016, 0.034, 0.085), vec3(0.34, 0.60, 1.0), hazeDay);
          hazeColor = mix(hazeColor, vec3(0.95, 0.44, 0.20), hazeDusk * 0.55);
          outgoingLight = mix(outgoingLight, hazeColor, clamp(hazeAmount, 0.0, 1.0));
        }
        #include <opaque_fragment>`);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => `sun-${state.enabled ? 1 : 0}-${GFX.cityLights ? 1 : 0}-${GFX.atmosphere ? 1 : 0}`;
  material.needsUpdate = true;
  return material;
}
