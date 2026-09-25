// skylight.js, the sun doesn't reach the bottom of a hole. Sun and sky light fade with
// world depth on the ground's shaders; the headlamp (a point light) is left alone.
// With { earth: true } the ground also gets a solid (3D) noise texture: grain, clods and
// darker seams, the same wherever you cut it, so it never shows a seam or a stretch.
import * as THREE from 'three';

const chunk = THREE.ShaderChunk.lights_fragment_begin
  .replace('getDirectionalLightInfo( directionalLight, directLight );',
           'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= vSky;')
  .replace('irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );',
           'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ) * vSky;');

const EARTH = `
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float earth(vec3 p){
  float n = vn(p * 1.7) * .5 + vn(p * 4.3) * .3 + vn(p * 11.0) * .2;
  float grain = vn(p * 38.0);
  float clod = smoothstep(.62, .8, vn(p * 6.0 + 3.0));
  return (.8 + .32 * n) * (.9 + .16 * grain) * (1.0 - .12 * clod);
}`;

export function patchSkyLight(material, { earth = false } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSky;\nvarying vec3 vWorldP;')
      .replace('#include <project_vertex>',
        '#include <project_vertex>\n\tvec4 wp4 = modelMatrix * vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n\twp4 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);\n#endif\n\tvWorldP = wp4.xyz;\n\tvSky = clamp(exp(wp4.y / 5.0), 0.0, 1.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSky;\nvarying vec3 vWorldP;' + (earth ? EARTH : ''))
      .replace('#include <lights_fragment_begin>', chunk);
    if (earth) shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb *= earth(vWorldP);');
  };
  material.customProgramCacheKey = () => 'skylight' + (earth ? '-earth' : '');
}
