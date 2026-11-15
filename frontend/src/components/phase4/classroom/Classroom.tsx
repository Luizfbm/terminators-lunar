import { useId, useMemo } from 'react'
import { HILL_AZIMUTH_DEG, HILL_DEG, HILL_SLOPE_DEG, HILL_TOP_HALF_DEG, TILT_DEG, dayHours, highestSunDeg, hillAt, sunPath } from './model'
import { useI18n } from '../../../i18n/I18nContext'
import './classroom.css'

const HOUR_MS = 3_600_000
const W = 480
const H = 220
const LEFT = 40
const RIGHT = 10
const TOP = 14
const BOTTOM = 26
const PRESETS = [30, 80, 88, 90]
/**
 * The sentence rounds the tilt: the model's 1.54° is the mean, and the engine's largest sub-solar
 * latitude over 2024 to 2032 is 1.588°, so "about 1.5°" is true of both.
 */
const SENTENCE_TILT_DEG = 1.5

/** A round top for the elevation axis, so its ticks fall on plain numbers. */
function axisTop(highest: number): { top: number; step: number } {
  const want = Math.max(3, highest * 1.12)
  for (const step of [0.5, 1, 2, 5, 10, 20]) {
    if (want / step <= 4) return { top: Math.ceil(want / step) * step, step }
  }
  return { top: 100, step: 20 }
}

/** Polyline strings for the path, cut where the azimuth wraps from one side of the panorama to the other. */
function pieces(points: { x: number; y: number; az: number }[]): string[] {
  const out: string[][] = [[]]
  points.forEach((point, index) => {
    if (index > 0 && Math.abs(point.az - points[index - 1].az) > 180) out.push([])
    out[out.length - 1].push(`${point.x.toFixed(1)},${point.y.toFixed(1)}`)
  })
  return out.filter((piece) => piece.length > 1).map((piece) => piece.join(' '))
}

/**
 * The Classroom figure: one sentence and the Sun's path over a lunar day at a latitude the reader
 * drags. Near the pole the path flattens onto the horizon and a 300 m hill stands above it. It is a
 * teaching model, labelled as such; it never answers a Query.
 */
export function Classroom({ latitude, onLatitude }: { latitude: number; onLatitude: (latitude: number) => void }) {
  const { t, formatNumber, formatSpan } = useI18n()
  const control = useId()
  const clip = `clip${control.replace(/[^\w-]/g, '')}`
  const deg = (value: number) => `${formatNumber(Math.round(value * 100) / 100)}°`
  const latText = latitude >= 90 ? t('class.pole') : t('class.latitudeValue', { value: formatNumber(latitude) })

  const drawing = useMemo(() => {
    const highest = highestSunDeg(latitude)
    const { top, step } = axisTop(highest)
    const bottom = -top * 0.3
    const x = (az: number) => LEFT + ((az + 180) / 360) * (W - LEFT - RIGHT)
    const y = (elevation: number) => TOP + ((top - elevation) / (top - bottom)) * (H - TOP - BOTTOM)
    const toPlot = (path: ReturnType<typeof sunPath>) =>
      // Below the drawing the path is held just under its edge, where the clip hides it.
      path.map((point) => ({ x: x(point.azimuthDeg), y: y(Math.max(bottom - 1, point.elevationDeg)), az: point.azimuthDeg }))
    const summer = pieces(toPlot(sunPath(-latitude, -TILT_DEG, 0.5)))
    const winter = pieces(toPlot(sunPath(-latitude, TILT_DEG, 0.5)))
    const from = HILL_AZIMUTH_DEG - HILL_TOP_HALF_DEG - HILL_SLOPE_DEG
    const to = HILL_AZIMUTH_DEG + HILL_TOP_HALF_DEG + HILL_SLOPE_DEG
    const hill: string[] = [`${x(from).toFixed(1)},${y(0).toFixed(1)}`]
    for (let az = from; az <= to; az += 0.5) hill.push(`${x(az).toFixed(1)},${y(hillAt(az)).toFixed(1)}`)
    hill.push(`${x(to).toFixed(1)},${y(0).toFixed(1)}`)
    const ticks: number[] = []
    for (let value = 0; value <= top + 1e-9; value += step) ticks.push(value)
    const noon = { x: x(0), y: y(highest) }
    return { highest, top, bottom, x, y, summer, winter, hill: hill.join(' '), ticks, noon, hours: dayHours(-latitude, -TILT_DEG) }
  }, [latitude])

  const { x, y } = drawing
  return (
    <section className="classroom">
      <h2 className="classroom__title">{t('class.title')}</h2>
      <p className="classroom__say">{t('class.say', { hill: deg(HILL_DEG), tilt: deg(SENTENCE_TILT_DEG) })}</p>
      <p className="classroom__model">
        <span className="classroom__tag">{t('class.model')}</span> {t('class.modelNote')}
      </p>

      <svg className="classroom__figure" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('class.figure', { lat: latText })}>
        <defs>
          <clipPath id={clip}>
            <rect x={LEFT} y={TOP} width={W - LEFT - RIGHT} height={H - TOP - BOTTOM} />
          </clipPath>
        </defs>
        {drawing.ticks.map((tick) => (
          <g key={tick}>
            <line className="classroom__grid" x1={LEFT} x2={W - RIGHT} y1={y(tick)} y2={y(tick)} />
            <text className="classroom__tick" x={LEFT - 6} y={y(tick) + 4} textAnchor="end">
              {deg(tick)}
            </text>
          </g>
        ))}
        <g clipPath={`url(#${clip})`}>
          {drawing.winter.map((points, index) => (
            <polyline key={`w${index}`} className="classroom__path classroom__path--winter" points={points} />
          ))}
          {drawing.summer.map((points, index) => (
            <polyline key={`s${index}`} className="classroom__path" points={points} />
          ))}
          {/* The ground and the hill come after the paths: the Sun goes behind them. */}
          <rect className="classroom__ground" x={LEFT} y={y(0)} width={W - LEFT - RIGHT} height={y(drawing.bottom) - y(0)} />
          <polygon className="classroom__hill" points={drawing.hill} />
          <line className="classroom__horizon" x1={LEFT} x2={W - RIGHT} y1={y(0)} y2={y(0)} />
          <circle className="classroom__sun" cx={drawing.noon.x} cy={drawing.noon.y} r={5} />
        </g>
        <text className="classroom__hillLabel" x={x(HILL_AZIMUTH_DEG)} y={y(0) + 16} textAnchor="middle">
          {t('class.hillLabel')}
        </text>
        {(
          [
            [-180, 'class.S'],
            [-90, 'class.W'],
            [0, 'class.N'],
            [90, 'class.E'],
            [180, 'class.S'],
          ] as const
        ).map(([az, key], index) => (
          <text key={index} className="classroom__tick" x={x(az)} y={H - 8} textAnchor={index === 0 ? 'start' : index === 4 ? 'end' : 'middle'}>
            {t(key)}
          </text>
        ))}
      </svg>

      <p className="classroom__legend">
        <span className="classroom__pair">
          <span className="classroom__key" aria-hidden="true" /> {t('class.summer')}
        </span>{' '}
        <span className="classroom__pair">
          <span className="classroom__key classroom__key--winter" aria-hidden="true" /> {t('class.winter')}
        </span>
      </p>

      <div className="classroom__control">
        <label htmlFor={control}>{t('class.latitude')}</label>
        <input
          id={control}
          type="range"
          min={0}
          max={90}
          step={0.1}
          value={latitude}
          aria-valuetext={latText}
          onChange={(event) => onLatitude(Number(event.target.value))}
        />
        <output htmlFor={control}>{latText}</output>
      </div>
      <p className="classroom__presets">
        {PRESETS.map((value) => (
          <button key={value} type="button" aria-pressed={latitude === value} onClick={() => onLatitude(value)}>
            {value >= 90 ? t('class.pole') : t('class.latitudeValue', { value: formatNumber(value) })}
          </button>
        ))}
      </p>

      <table className="metrics classroom__numbers">
        <tbody>
          <tr>
            <th scope="row">{t('class.highest')}</th>
            <td>{deg(drawing.highest)}</td>
          </tr>
          <tr>
            <th scope="row">{t('class.hill')}</th>
            <td>{deg(HILL_DEG)}</td>
          </tr>
        </tbody>
      </table>
      <p className="classroom__hidden">{t('class.hidden', { span: formatSpan(drawing.hours.behindHill * HOUR_MS) })}</p>
    </section>
  )
}
