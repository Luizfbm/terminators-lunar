import * as THREE from 'three'

/** The Sun's gold and the Earth's blue, the colours every view gives them. */
export const SUN = 0xf5bd3a
export const EARTH = 0x9cc0ff
/** The map of the Earth, served beside the page: NASA's Blue Marble, without clouds. */
export const EARTH_MAP = `${import.meta.env.BASE_URL}earth_2k.jpg`

/** A soft halo for the Sun, drawn once into a small canvas. */
export function glowTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(245, 189, 58, 0.55)')
    gradient.addColorStop(0.35, 'rgba(245, 189, 58, 0.16)')
    gradient.addColorStop(1, 'rgba(245, 189, 58, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  return new THREE.CanvasTexture(canvas)
}

/**
 * The material of the Earth: a ball lit from where the Sun is, so it shows the phase it has from
 * where it is seen. Its own small shader: the Earth is in sunlight whatever the terrain hides
 * from a Site, while the lights of a scene dim with the Sun's disc and are for the ground. Set
 * `uniforms.sunDirection` to the direction of the Sun. Without a map it is its plain blue.
 */
export function earthMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      colour: { value: new THREE.Color(EARTH) },
      map: { value: null as THREE.Texture | null },
      mapped: { value: 0 },
    },
    // The logarithmic depth chunks are empty where the renderer has no such buffer.
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

/**
 * The map arrives after the first frames; until then, and without it, the Earth is its plain
 * blue. `gone` says the view was torn down meanwhile; `loaded` gets the texture, to dispose of later.
 */
export function loadEarthMap(
  material: THREE.ShaderMaterial,
  anisotropy: number,
  gone: () => boolean,
  loaded: (texture: THREE.Texture) => void,
): void {
  new THREE.TextureLoader().load(EARTH_MAP, (texture) => {
    if (gone()) {
      texture.dispose()
      return
    }
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = anisotropy
    material.uniforms.map.value = texture
    material.uniforms.mapped.value = 1
    loaded(texture)
  })
}
