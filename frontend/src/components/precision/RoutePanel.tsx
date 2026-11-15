import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, type VisibilityResult } from '../../api/client'
import { useI18n } from '../../i18n/I18nContext'
import type { Vehicle } from '../vehiclePicker/vehicles'
import { RouteTerrain } from './RouteTerrain'
import { planRoute, type RouteRequest, type RouteResponse } from './routeApi'

function RouteMap({ answer, selected }: { answer: RouteResponse; selected: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const terrain = answer.terrain
  const size = terrain.size_px
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const raster = context.createImageData(size, size)
    terrain.heights.values.forEach((height, i) => {
      const shade = 35 + Math.round(height / 65535 * 180)
      raster.data.set([shade, shade, shade, 255], i * 4)
    })
    context.putImageData(raster, 0, 0)
  }, [terrain, size])
  const point = answer.points[selected]
  return <div className="route-map" role="img" aria-label="DEM elevation map with route; lighter pixels are higher. Map projection axes, not a compass.">
    <canvas ref={canvas} width={size} height={size} />
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <polyline points={answer.points.map(p => `${p.column + .5},${p.row + .5}`).join(' ')} fill="none" stroke="#ffdc52" strokeWidth={Math.max(.25, size / 180)} />
      {answer.points[0] && <circle cx={answer.points[0].column + .5} cy={answer.points[0].row + .5} r={size / 80} fill="#7bff9b" />}
      {point && <circle cx={point.column + .5} cy={point.row + .5} r={size / 65} fill="#fff" stroke="#111" strokeWidth={size / 300} />}
    </svg>
  </div>
}

export function RoutePanel({ result, vehicle }: { result: VisibilityResult; vehicle?: Vehicle | null }) {
  const { locale } = useI18n()
  const pt = locale === 'pt'
  const words = (en: string, portuguese: string) => pt ? portuguese : en
  const request = useRef<AbortController | null>(null)
  const [answer, setAnswer] = useState<RouteResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [motion, setMotion] = useState(false)
  const [selected, setSelected] = useState(0)
  const [sample, setSample] = useState(0)
  const [comparison, setComparison] = useState<RouteResponse | null>(null)
  const [playing, setPlaying] = useState(false)
  const [show3d, setShow3d] = useState(false)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (!playing || !answer?.samples.length) return
    const timer = window.setInterval(() => {
      setSample(current => (current + 1) % answer.samples.length)
    }, 500)
    return () => window.clearInterval(timer)
  }, [playing, answer])
  function invalidate() {
    request.current?.abort()
    setPlaying(false)
    setAnswer(null); setError(''); setBusy(false); setSelected(0); setSample(0)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const number = (key: string) => Number(form.get(key))
    const body: RouteRequest = {
      origin: { latitude_deg: result.query.site.latitude_deg, longitude_deg: result.query.site.longitude_deg },
      destination: { latitude_deg: number('latitude'), longitude_deg: number('longitude') },
      start: result.query.start, end: result.query.end, observer_height_m: result.query.observer_height_m,
      max_slope_deg: number('slope'), half_extent_m: number('extent'),
      minimum_resolution_m: number('resolution') as 20 | 80 | 240,
      motion: motion ? { speed_m_s: number('speed'), load_w: number('load'), battery_wh: number('battery'),
        panel_power_w: number('solar'), initial_charge_fraction: number('charge') / 100 } : null,
    }
    invalidate()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    try {
      const value = await planRoute(body, controller.signal)
      if (!controller.signal.aborted) setAnswer(value)
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof ApiError ? cause.code : 'unknown')
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  const errors: Record<string, string> = {
    outside_coverage: words('Destination or horizon outside available coverage. Try a closer destination or another native resolution.', 'Destino ou horizonte fora da cobertura disponível. Tente um destino mais próximo ou outra resolução nativa.'),
    busy: words('Another route is being calculated. Try again shortly.', 'Outra rota está em cálculo. Tente novamente em instantes.'),
    network: words('Could not reach the API. Check the connection and retry.', 'Não foi possível acessar a API. Verifique a conexão e tente novamente.'),
    invalid_parameter: words('Check coordinates, window and scenario parameters.', 'Confira coordenadas, janela e parâmetros do cenário.'),
  }
  const motionMessage: Record<RouteResponse['motion_status'], string> = {
    not_requested: words('Motion energy not requested.', 'Energia de movimento não solicitada.'),
    evaluated: words('Sampled movement scenario evaluated.', 'Cenário de movimento amostrado avaliado.'),
    outside_window: words('Travel exceeds this Window. Energy was not evaluated.', 'O percurso excede esta janela. Energia não avaliada.'),
    sample_limit: words('This route exceeds 64 motion samples. Choose a shorter route; energy was not evaluated.', 'Esta rota excede 64 amostras de movimento. Escolha uma rota menor; energia não avaliada.'),
    outside_coverage: words('A measured horizon is missing along the route. Energy was not evaluated.', 'Falta horizonte medido ao longo da rota. Energia não avaliada.'),
  }
  const activePoint = playing && answer?.samples[sample]
    ? answer.points.reduce((best, point, index) => Math.abs(point.distance_m - answer.samples[sample].distance_m) < Math.abs(answer.points[best].distance_m - answer.samples[sample].distance_m) ? index : best, 0)
    : selected
  const point = answer?.points[activePoint]
  const reading = answer?.samples[sample]
  return <section className="route-panel" aria-label={words('Rover route scenario', 'Cenário de rota do rover')}>
    <p>{words('Plan from this Site to a nearby coordinate on native terrain. The path joins pixel centres; hazards smaller than a pixel and lateral slopes are unresolved.', 'Planeje deste sítio até uma coordenada próxima sobre o relevo nativo. O caminho une centros dos pixels; perigos menores que um pixel e declives laterais não são resolvidos.')}</p>
    <form onSubmit={submit} onChange={event => {
      if ((event.target as HTMLInputElement).name !== 'resolution') setComparison(null)
      invalidate()
    }}>
      <div className="route-fields">
        <label>{words('Destination latitude (°)', 'Latitude do destino (°)')}<input name="latitude" type="number" step="any" min="-90" max="90" required /></label>
        <label>{words('Destination longitude (°)', 'Longitude do destino (°)')}<input name="longitude" type="number" step="any" min="-180" max="180" required /></label>
        <label>{words('Segment slope limit (°)', 'Limite de declive por segmento (°)')}<input name="slope" type="number" min="0.1" max="45" step="any" defaultValue={vehicle?.slopeLimitDeg ?? 15} required /></label>
        <label>{words('Requested half extent (m)', 'Meia extensão solicitada (m)')}<input name="extent" type="number" min="1000" max="3000" defaultValue="1000" required /></label>
        <label>{words('Native DEM minimum resolution', 'Resolução mínima do DEM nativo')}<select name="resolution" defaultValue="20"><option value="20">20 m+</option><option value="80">80 m+</option><option value="240">240 m+</option></select></label>
      </div>
      <p className="precision__limit">{words('Up to 129 × 129 native pixels. A coarser product may be used if finer coverage is unavailable; the actual product is reported below. Slope is an editable scenario limit, not a certified vehicle capability.', 'Até 129 × 129 pixels nativos. Um produto mais grosso pode ser usado se faltar cobertura fina; o produto real aparece abaixo. O declive é um limite editável do cenário, não uma capacidade certificada do veículo.')}</p>
      <label className="route-check"><input type="checkbox" checked={motion} onChange={e => setMotion(e.target.checked)} />{words('Evaluate movement and battery', 'Avaliar movimento e bateria')}</label>
      {motion && <fieldset><legend>{words('Explicit movement assumptions', 'Hipóteses explícitas de movimento')}</legend>
        <p>{words('Enter speed and total load while moving. These are your scenario inputs. Panels track the Sun; no thermal, ageing or traction model. Vehicle battery/solar values may be estimates.', 'Informe velocidade e consumo total durante movimento. São entradas do seu cenário. Painéis seguem o Sol; sem modelo térmico, envelhecimento ou tração. Valores de bateria/solar do veículo podem ser estimativas.')}</p>
        <div className="route-fields">
          <label>{words('Speed (m/s)', 'Velocidade (m/s)')}<input name="speed" type="number" min="0.0001" max="10" step="any" required /></label>
          <label>{words('Total moving load (W)', 'Consumo total em movimento (W)')}<input name="load" type="number" min="0.01" max="1000000" step="any" required /></label>
          <label>{words('Battery (Wh)', 'Bateria (Wh)')}<input name="battery" type="number" min="0.01" max="100000000" step="any" defaultValue={vehicle?.batteryWh} required /></label>
          <label>{words('Solar panels (W)', 'Painéis solares (W)')}<input name="solar" type="number" min="0" max="1000000" step="any" defaultValue={vehicle?.solarW ?? 0} required /></label>
          <label>{words('Initial charge (%)', 'Carga inicial (%)')}<input name="charge" type="number" min="0" max="100" step="any" defaultValue="100" required /></label>
        </div>
      </fieldset>}
      <button type="submit" disabled={busy}>{busy ? words('Calculating…', 'Calculando…') : words('Calculate route', 'Calcular rota')}</button>
      {busy && <button type="button" onClick={invalidate}>{words('Cancel', 'Cancelar')}</button>}
    </form>
    {error && <p role="alert">{errors[error] ?? words('The route could not be calculated. Retry or check backend availability.', 'Não foi possível calcular a rota. Tente novamente ou confira o backend.')}</p>}
    {answer && <div className="route-result" aria-live="polite">
      <p>{answer.status === 'found' ? words('Path found on this grid.', 'Caminho encontrado nesta grade.') : words('No path within this window and slope limit.', 'Sem caminho nesta janela e limite de declive.')}</p>
      <p>{answer.terrain.dem.product} · {answer.terrain.dem.resolution_m} m · {answer.terrain.size_px} × {answer.terrain.size_px} pixels</p>
      <p>{words('Endpoint snapping', 'Ajuste aos centros dos pixels')}: {answer.origin_snap_m.toFixed(1)} m / {answer.destination_snap_m.toFixed(1)} m</p>
      <RouteMap answer={answer} selected={activePoint} />
      <button type="button" aria-pressed={show3d} onClick={() => setShow3d(!show3d)}>{words('3D terrain', 'Relevo 3D')}</button>
      {show3d && <RouteTerrain answer={answer} selected={activePoint} />}
      <p className="precision__limit">{words('Lighter = higher terrain. Green = start; white = selected route point. Axes follow the DEM projection.', 'Mais claro = terreno mais alto. Verde = início; branco = ponto selecionado. Eixos seguem a projeção do DEM.')}</p>
      {point && <>
        <p>{words('Length', 'Comprimento')}: {answer.length_m?.toFixed(1)} m · {words('Maximum segment slope', 'Maior declive de segmento')}: {answer.max_segment_slope_deg?.toFixed(2)}°</p>
        <label>{words('Route point', 'Ponto da rota')}<input type="range" min="0" max={answer.points.length - 1} value={activePoint} onChange={e => { setPlaying(false); setSelected(Number(e.target.value)) }} /></label>
        <p>{point.latitude_deg.toFixed(6)}°, {point.longitude_deg.toFixed(6)}° · {point.elevation_m.toFixed(1)} m · {point.distance_m.toFixed(1)} m</p>
        <p>{motionMessage[answer.motion_status]} {answer.duration_seconds !== null && `${(answer.duration_seconds / 60).toFixed(1)} min`}</p>
        {reading && <>
          <button type="button" onClick={() => { if (playing) setSelected(activePoint); setPlaying(!playing) }}>{playing ? words('Pause samples', 'Pausar amostras') : words('Play samples (2/s)', 'Reproduzir amostras (2/s)')}</button>
          <label>{words('Movement sample', 'Amostra do movimento')}<input type="range" min="0" max={answer.samples.length - 1} value={sample} onChange={e => {
            setPlaying(false)
            const index = Number(e.target.value)
            setSample(index)
            setSelected(answer.points.reduce((best, point, i) => Math.abs(point.distance_m - answer.samples[index].distance_m) < Math.abs(answer.points[best].distance_m - answer.samples[index].distance_m) ? i : best, 0))
          }} /></label>
          <p>{reading.t} · {reading.latitude_deg.toFixed(6)}°, {reading.longitude_deg.toFixed(6)}°</p>
          <p>{words('Charge', 'Carga')}: {(reading.charge_fraction * 100).toFixed(1)}% · Sun: {(reading.sun_fraction * 100).toFixed(1)}% · Earth: {reading.earth_visible ? words('visible', 'visível') : words('hidden', 'oculta')}</p>
          <p>{words('Unserved energy', 'Energia não atendida')}: {answer.unmet_wh?.toFixed(2)} Wh</p>
          <p className="precision__limit">{answer.horizon_products.join(', ')} · {answer.kernels.join(', ')}</p>
        </>}
      </>}
      <button type="button" onClick={() => setComparison(answer)}>{words('Keep for resolution comparison', 'Guardar para comparar resolução')}</button>
      <p className="precision__limit">{words('Keep this result, change only the native resolution and calculate again. Other input changes clear the comparison.', 'Guarde este resultado, mude somente a resolução nativa e calcule novamente. Outras alterações limpam a comparação.')}</p>
      <p className="precision__limit">{words('Energy holds conditions constant from each sample to the next (at most 15 minutes). It may miss short shadows. This is not a safety assessment or a mission success probability.', 'Energia mantém as condições constantes entre amostras (no máximo 15 minutos). Pode perder sombras curtas. Não é avaliação de segurança nem probabilidade de sucesso da missão.')}</p>
    </div>}
    {comparison && <div className="route-comparison">
      <h3>{words('Native resolution comparison', 'Comparação de resoluções nativas')}</h3>
      <table><thead><tr><th>{words('Result', 'Resultado')}</th><th>DEM</th><th>{words('Resolution (m)', 'Resolução (m)')}</th><th>{words('Length (m)', 'Comprimento (m)')}</th><th>{words('Max. grade (°)', 'Declive máx. (°)')}</th><th>{words('Snapping (m)', 'Ajuste (m)')}</th><th>{words('Final charge', 'Carga final')}</th><th>{words('Unserved (Wh)', 'Não atendida (Wh)')}</th></tr></thead>
        <tbody>{[comparison, ...(answer && answer !== comparison ? [answer] : [])].map((entry, index) => <tr key={index}>
          <td>{index === 0 ? words('Saved', 'Guardado') : words('Current', 'Atual')}</td><td>{entry.terrain.dem.product}</td><td>{entry.terrain.dem.resolution_m}</td><td>{entry.length_m?.toFixed(1) ?? words('No path', 'Sem caminho')}</td><td>{entry.max_segment_slope_deg?.toFixed(2) ?? '—'}</td><td>{entry.origin_snap_m.toFixed(1)} / {entry.destination_snap_m.toFixed(1)}</td><td>{entry.motion_status === 'evaluated' ? `${(entry.samples[entry.samples.length - 1].charge_fraction * 100).toFixed(1)}%` : '—'}</td><td>{entry.unmet_wh?.toFixed(2) ?? '—'}</td>
        </tr>)}</tbody></table>
      {answer && answer !== comparison && answer.terrain.dem.product === comparison.terrain.dem.product && <p>{words('Both requests used the same DEM product. This is not a finer-resolution comparison.', 'Os dois pedidos usaram o mesmo DEM. Não é uma comparação com resolução mais fina.')}</p>}
      <p className="precision__limit">{words('Different native grids snap endpoints differently. Compare the reported offsets too; shorter does not mean safer.', 'Grades nativas diferentes ajustam os destinos a centros diferentes. Compare também os deslocamentos; menor não significa mais seguro.')}</p>
      <button type="button" onClick={() => setComparison(null)}>{words('Clear comparison', 'Limpar comparação')}</button>
    </div>}
  </section>
}
