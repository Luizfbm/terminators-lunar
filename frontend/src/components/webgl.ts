/** Whether this browser can open a WebGL context at all, asked once before a 3D stage is built. */
export function canDraw(): boolean {
  try {
    const probe = document.createElement('canvas')
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'))
  } catch {
    return false
  }
}
