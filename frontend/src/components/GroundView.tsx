import { lazy, Suspense, useId, useMemo, useState } from 'react'
import type { VisibilityResult } from '../api/client'
import { sampleAt } from '../domain/sky'
import { groundCaption, stretchFor, type GroundSpacing } from '../domain/skyScene'
import { useI18n } from '../i18n/I18nContext'
import { Ground, type GroundMark } from './Ground'
import { CursorSun } from './cursorSun/CursorSun'
import { prepareWith } from '../domain/prepare'
import { loadGround } from './groundData'
import { StageLoading } from './StageLoading'
import { canDraw } from './webgl'
import { SafetyCircle } from './hazard/safety/SafetyCircle'

type SkyModule = typeof import('./Sky')

// The 3D sky is fetched once. Once it has arrived it is drawn straight from here, so a view that
// mounts after prepareGround() never shows the loading mark, not even for a frame.
let skyModule: SkyModule | null = null
let skyAsked: Promise<SkyModule> | null = null
const askSky = () => {
  skyAsked ??= import('./Sky').then((module) => {
    skyModule = module
    return module
  })
  return skyAsked
}
const LazySky = lazy(() => askSky().then((module) => ({ default: module.Sky })))

/**
 * Fetches the view from the ground ahead of the click (the requirement): its code and the ground near
 * the pole, the same file the view asks for on any device. Resolves when the code is in, or failed:
 * that is all the move waits for. The ground's heights are a PNG to decode, slow on a busy machine,
 * and the view draws its silhouette until they are in, so the dive never holds for them.
 */
export function prepareGround(): Promise<void> {
  return prepareWith(askSky, loadGround)
}

/** The 3D sky's code has arrived. */
export const groundPrepared = () => skyModule !== null

/**
 * The view from the ground (the requirement): the sky in 3D, to turn in. In the classic layout the
 * horizon unrolled sits under it, to see the Sun's whole path at once; Larissa's layout (the default)
 * leaves it out (Luiz, 15/11/2026) and the arrows in the sky point to the Sun and the Earth until they
 * are in view. A browser that cannot draw 3D gets the unrolled horizon alone, as before.
 */
export function GroundView({
  result,
  cursorMs,
  mark = null,
  pose = 'stay',
  classic = false,
}: {
  result: VisibilityResult
  cursorMs: number
  mark?: GroundMark | null
  /** How the sky moves on its way in from the globe, or out to it. */
  pose?: 'arrive' | 'leave' | 'stay'
  /** `layout=classic`: the unrolled horizon stays under the sky, as before Larissa's layout. */
  classic?: boolean
}) {
  const { t, formatNumber } = useI18n()
  const [supported, setSupported] = useState(canDraw)
  // Chosen once per mount: switching from the lazy component to the loaded one would rebuild the scene.
  const [ready] = useState(() => skyModule)
  // How finely the real ground is measured and drawn, once it is on screen; null while it is the silhouette.
  const [groundStep, setGroundStep] = useState<GroundSpacing | null>(null)
  // Over the sky only the one-line hint; what the ground is and how it is drawn waits behind a button (the requirement).
  const [aboutOpen, setAboutOpen] = useState(false)
  const aboutId = useId()
  const stretch = useMemo(
    () =>
      stretchFor([
        ...result.horizon.samples.map((point) => point.elevation_deg),
        ...result.timeline.samples.map((sample) => sample.sun.elevation_deg),
        // The Earth climbs higher than the Sun near the pole: it has to fit in the view too.
        ...result.timeline.samples.map((sample) => sample.earth.elevation_deg),
      ]),
    [result],
  )
  const sunFraction = sampleAt(result.timeline.samples, cursorMs)?.sun.fraction ?? null
  if (!supported) return <Ground result={result} cursorMs={cursorMs} mark={mark} />
  const about = [...groundCaption(groundStep, { t, formatNumber }), stretch > 1 && t('sky.caption.stretched', { times: formatNumber(Math.round(stretch * 10) / 10) })]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classic ? 'ground-view' : 'ground-view ground-view--bare'}>
      <div className="ground-view__sky">
        {ready ? (
          <ready.Sky result={result} cursorMs={cursorMs} stretch={stretch} mark={mark} pose={pose} onGround={setGroundStep} onFailed={() => setSupported(false)} />
        ) : (
          <Suspense fallback={<StageLoading />}>
            <LazySky result={result} cursorMs={cursorMs} stretch={stretch} mark={mark} pose={pose} onGround={setGroundStep} onFailed={() => setSupported(false)} />
          </Suspense>
        )}
        <div className="stage__caption ground-view__caption">
          <p>
            {t('sky.caption')}
            {about && (
              <>
                {' '}
                <button type="button" className="ground-view__about" aria-expanded={aboutOpen} aria-controls={aboutId} onClick={() => setAboutOpen((open) => !open)}>
                  {t('sky.about')}
                </button>
              </>
            )}
          </p>
          {/* Under the hint, never above it: the hint stays the first line over the sky. */}
          <p>
            <CursorSun fraction={sunFraction} className="cursor-sun--ground" />
          </p>
          <p className="ground-view__note" id={aboutId} hidden={!aboutOpen || !about}>
            {about}
          </p>
        </div>
        <SafetyCircle result={result} />
      </div>
      {classic && (
        <div className="ground-view__strip">
          <Ground result={result} cursorMs={cursorMs} mark={mark} compact />
        </div>
      )}
    </div>
  )
}
