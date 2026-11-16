import * as THREE from 'three'

/** Shared Earth phase shader for both surface views; independent of terrain occlusion. */
export function createEarthMaterial() {
  return new THREE.ShaderMaterial({
      uniforms: {
        sunDirection: { value: new THREE.Vector3(0, 1, 0) },
        colour: { value: new THREE.Color(0x9cc0ff) },
        map: { value: null as THREE.Texture | null },
        mapped: { value: 0 },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 facing;
        varying vec3 toEye;
        varying vec2 place;
        void main() {
          facing = normalize(mat3(modelMatrix) * normal);
          toEye = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz);
          place = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 sunDirection;
        uniform vec3 colour;
        uniform sampler2D map;
        uniform float mapped;
        varying vec3 facing;
        varying vec3 toEye;
        varying vec2 place;
        void main() {
          #include <logdepthbuf_fragment>
          vec3 out_ = normalize(facing);
          // Daylight fades over a few degrees at the terminator, as it does through the air.
          float lit = smoothstep(-0.06, 0.25, dot(out_, sunDirection));
          vec3 land = mix(colour, texture2D(map, place).rgb, mapped);
          // The night side keeps a little light, more than it has: enough to tell the continents apart.
          vec3 shade = land * (0.035 + 1.15 * lit);
          // The air: a thin blue edge, brightest where the limb is in daylight.
          float edge = pow(1.0 - max(dot(out_, normalize(toEye)), 0.0), 3.0);
          shade += vec3(0.35, 0.55, 1.0) * edge * (0.08 + 0.9 * lit);
          gl_FragColor = vec4(shade, 1.0);
          #include <colorspace_fragment>
        }`,
    })
}
