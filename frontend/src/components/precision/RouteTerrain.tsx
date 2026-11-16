import { ownRenderer, releaseRenderer } from '../rendererLifetime'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { regolithMaterial, SHADOW_FLOOR } from '../regolith'
import { routeGeometry } from './routeGeometry'
import type { RouteResponse } from './routeApi'
import { useI18n } from '../../i18n/I18nContext'

export function RouteTerrain({ answer, selected }: { answer: RouteResponse; selected: number }) {
  const host = useRef<HTMLDivElement>(null)
  const select = useRef<((index: number) => void) | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const { locale } = useI18n()
  useEffect(() => {
    const element = host.current
    if (!element) return
    const data = routeGeometry(answer)
    if (!data) { setUnavailable(true); return }
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); ownRenderer(renderer) }
    catch { setUnavailable(true); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor('#090b10')
    element.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1))
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    const material = regolithMaterial({ color: '#a5a19b', side: THREE.DoubleSide })
    scene.add(new THREE.Mesh(geometry, material))
    const centre = geometry.boundingBox!.getCenter(new THREE.Vector3())
    const span = Math.max(1, geometry.boundingBox!.getSize(new THREE.Vector3()).length())
    const light = new THREE.DirectionalLight(0xffffff, 2)
    light.position.copy(centre).add(new THREE.Vector3(span, span, span / 2))
    light.target.position.copy(centre)
    scene.add(light, light.target, new THREE.AmbientLight(0xffffff, SHADOW_FLOOR))
    const camera = new THREE.PerspectiveCamera(45, 1, Math.max(.01, span / 10000), span * 20)
    camera.position.copy(centre).add(new THREE.Vector3(span * .5, span * .8, span * .8))
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(centre)
    controls.minDistance = span / 20
    controls.maxDistance = span * 5
    controls.update()
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(data.route.map(p => new THREE.Vector3(...p)))
    const lineMaterial = new THREE.LineBasicMaterial({ color: '#ffdc52', depthTest: false })
    const line = new THREE.Line(lineGeometry, lineMaterial)
    line.renderOrder = 1
    scene.add(line)
    const markerGeometry = new THREE.SphereGeometry(span / 150, 12, 8)
    const markerMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false })
    const marker = new THREE.Mesh(markerGeometry, markerMaterial)
    marker.renderOrder = 2
    scene.add(marker)
    const render = () => renderer.render(scene, camera)
    select.current = index => {
      marker.visible = !!data.route[index]
      if (data.route[index]) marker.position.set(...data.route[index])
      render()
    }
    const resize = () => {
      const width = Math.max(1, element.clientWidth)
      renderer.setSize(width, 320)
      camera.aspect = width / 320
      camera.updateProjectionMatrix()
      render()
    }
    controls.addEventListener('change', render)
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    select.current(0)
    return () => {
      select.current = null
      observer.disconnect()
      controls.dispose()
      geometry.dispose(); material.dispose()
      lineGeometry.dispose(); lineMaterial.dispose()
      markerGeometry.dispose(); markerMaterial.dispose()
      releaseRenderer(renderer)
      renderer.domElement.remove()
    }
  }, [answer])
  useEffect(() => { select.current?.(selected) }, [selected, answer])
  return <>
    <p className="precision__limit">{locale === 'pt'
      ? 'Inspeção 3D: arraste para girar; use a roda para aproximar. Relevo em escala 1:1, material Lunar-Lambert B e luz fixa de inspeção. A luz desta vista não representa o Sol da janela. Branco = marcador da rota.'
      : '3D inspection: drag to orbit; scroll to zoom. Terrain at 1:1 scale, Lunar-Lambert B material and fixed inspection lighting. This light does not represent the Window’s Sun. White = route marker.'}</p>
    {unavailable && <p role="status">{locale === 'pt' ? 'WebGL indisponível. Use o mapa 2D acima.' : 'WebGL unavailable. Use the 2D map above.'}</p>}
    <div ref={host} className="route-terrain" aria-label="3D native terrain and route" hidden={unavailable} />
  </>
}
