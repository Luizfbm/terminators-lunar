import { createRoverStage, type RoverStage } from '../../src/components/vehiclePicker/rover3d'
let canvas = document.createElement('canvas')
canvas.style.width = '400px'
canvas.style.height = '300px'
document.body.append(canvas)
let stage: RoverStage | null = null
const start = document.createElement('button')
start.textContent = 'Create rover'
start.onclick = () => {
  const next = canvas.cloneNode() as HTMLCanvasElement
  canvas.replaceWith(next)
  canvas = next
  stage = createRoverStage(canvas, { reducedMotion: true }); stage?.show('viper') }
const stop = document.createElement('button')
stop.textContent = 'Dispose rover'
stop.onclick = () => { stage?.dispose(); stage = null }
document.body.append(start, stop)
