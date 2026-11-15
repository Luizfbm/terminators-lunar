import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { VisibilityResult } from '../../api/client'
import { isCustomSite } from '../../domain/query'
import { sampleAt } from '../../domain/sky'
import { useI18n } from '../../i18n/I18nContext'
import { HazardInspector } from '../hazard/inspector'
import { RoverPicker } from '../rover/RoverPicker'
import type { Coverage } from '../rover/types'
import { useRoute } from '../route/compare/api'
import { RouteCompare } from '../route/compare/RouteCompare'
import type { Navigation } from '../route/compare/types'
import { errorKey, walkText } from '../route/walk/strings'
import { RouteWalk } from '../route/walk/RouteWalk'
import { DRIVE_SCREENS, type DriveScreen, type DriveState } from './driveLink'
import { driveText, type DriveKey } from './strings'
import { useDrive } from './useDrive'
import './drive.css'

export interface DriveSheetProps {
  /** The answer on screen: its Site is the one the Hazard grid, the simulation and the walk belong to. */
  result: VisibilityResult
  /** What the engine covers, so the picker can say when a mission's Window is outside it. */
  coverage: Coverage
  cursorMs: number
}

/** What the Sun is doing at the Cursor the sheet was opened at, for the route's panels and the walk's light. */
interface SunAtOpen {
  fraction: number
  azimuthDeg: number
  elevationDeg: number
}

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * The way to Eduardo's screens: one button in the foot of the stage, in the default layout and in the classic
 * one, that opens a sheet with the Rover choice, the Hazard inspector, the Normal navigation x Multiresolution
 * simulation and the walk. The screen open, the Rover, the mission and the plan accepted are in the link. The
 * screens draw what the API returns; nothing is computed here (ADR 0002).
 */
export function DriveSheet({ result, coverage, cursorMs }: DriveSheetProps) {
  const { locale } = useI18n()
  const text = (key: DriveKey, params?: Record<string, string>) => driveText(locale, key, params)
  const [drive, setDrive] = useDrive()
  const open = drive.screen !== null
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const sheet = dialog.current
    if (!sheet) return
    if (open && !sheet.open) sheet.showModal()
    if (!open && sheet.open) sheet.close()
  }, [open])

  return (
    <>
      <button type="button" className="drive-open" aria-haspopup="dialog" onClick={() => setDrive({ screen: drive.screen ?? 'rover' })}>
        {text('drive.open')}
      </button>
      <dialog
        ref={dialog}
        className="drive-sheet"
        aria-label={text('drive.title')}
        onClose={() => setDrive({ screen: null })}
        // A click on the backdrop lands on the dialog itself, outside its content: it closes the sheet.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
      >
        <div className="drive-sheet__body">
          <button type="button" className="drive-sheet__close" onClick={() => dialog.current?.close()}>
            {text('drive.close')}
          </button>
          {drive.screen !== null && <DriveScreens result={result} coverage={coverage} cursorMs={cursorMs} drive={drive} screen={drive.screen} setDrive={setDrive} />}
        </div>
      </dialog>
    </>
  )
}

interface ScreensProps extends DriveSheetProps {
  drive: DriveState
  screen: DriveScreen
  setDrive: (change: Partial<DriveState>) => void
}

/** The tabs and the screen under the one chosen. Mounted only while the sheet is open, so nothing is asked before. */
function DriveScreens({ result, coverage, cursorMs, drive, screen, setDrive }: ScreensProps) {
  const { locale } = useI18n()
  const text = (key: DriveKey, params?: Record<string, string>) => driveText(locale, key, params)
  const ids = useId()
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({})
  const { site } = result.query
  // The Sun as it was when the sheet opened: the Cursor may still be playing behind it, and a request that
  // changed with every frame would plan the route again and again.
  const [sun] = useState<SunAtOpen | null>(() => {
    const sample = sampleAt(result.timeline.samples, cursorMs)
    return sample ? { fraction: round2(sample.sun.fraction), azimuthDeg: round2(sample.sun.azimuth_deg), elevationDeg: round2(sample.sun.elevation_deg) } : null
  })
  // The Hazard grid, the simulation and the walk belong to a Curated Site: a typed coordinate has no hazard answer.
  const needsCurated = screen !== 'rover' && isCustomSite(site)

  const move = (event: KeyboardEvent) => {
    const by = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (by === undefined) return
    event.preventDefault()
    const next = DRIVE_SCREENS[(DRIVE_SCREENS.indexOf(screen) + by + DRIVE_SCREENS.length) % DRIVE_SCREENS.length]!
    setDrive({ screen: next })
    tabs.current[next]?.focus()
  }

  const rover = drive.roverId ? { id: drive.roverId } : undefined
  const accepted: Navigation = drive.plan ?? 'multiresolution'

  let body
  if (needsCurated) {
    body = (
      <p className="drive__note" role="status">
        {text('drive.needsSite', { site: site.name })}
      </p>
    )
  } else if (screen === 'rover') {
    body = (
      <RoverPicker
        initialRoverId={drive.roverId ?? undefined}
        initialMission={{
          ...(drive.year !== null ? { year: drive.year } : {}),
          ...(drive.days !== null ? { days: drive.days } : {}),
          ...(drive.requireDte !== null ? { requireDte: drive.requireDte } : {}),
        }}
        lcspHours={result.metrics.lcsp_hours}
        coverage={coverage}
        onChange={(choice) =>
          setDrive({ roverId: choice.rover.id, year: choice.mission.year, days: choice.mission.days, requireDte: choice.mission.requireDte })
        }
      />
    )
  } else if (screen === 'hazard') {
    body = <HazardInspector siteId={site.id} locale={locale} />
  } else if (screen === 'simulation') {
    body = (
      <>
        <RouteCompare
          siteId={site.id}
          rover={rover}
          sunFraction={sun?.fraction}
          sunAzimuthDeg={sun?.azimuthDeg}
          onAccept={(navigation) => setDrive({ plan: navigation })}
        />
        {drive.plan !== null && (
          <p className="drive__accepted">
            <span>{text('drive.accepted', { plan: text(`drive.nav.${drive.plan}`) })}</span>{' '}
            <button type="button" className="drive__button" onClick={() => setDrive({ screen: 'walk' })}>
              {text('drive.toWalk')}
            </button>
          </p>
        )}
      </>
    )
  } else {
    body = (
      <Walk
        siteId={site.id}
        siteName={site.name}
        rover={rover}
        sun={sun}
        accepted={accepted}
        onPlan={(navigation) => setDrive({ plan: navigation })}
      />
    )
  }

  return (
    <>
      <div className="drive__tabs" role="tablist" aria-label={text('drive.tabs')}>
        {DRIVE_SCREENS.map((name) => (
          <button
            key={name}
            ref={(element) => {
              tabs.current[name] = element
            }}
            type="button"
            role="tab"
            id={`${ids}-tab-${name}`}
            aria-selected={screen === name}
            aria-controls={`${ids}-panel`}
            tabIndex={screen === name ? 0 : -1}
            className="drive__tab"
            onClick={() => setDrive({ screen: name })}
            onKeyDown={move}
          >
            {text(`drive.tab.${name}`)}
          </button>
        ))}
      </div>
      <div className="drive__panel" role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${screen}`}>
        {body}
      </div>
    </>
  )
}

interface WalkProps {
  siteId: string
  siteName: string
  rover: { id: string } | undefined
  sun: SunAtOpen | null
  accepted: Navigation
  onPlan: (navigation: Navigation) => void
}

/** The walk needs the two plans the simulation draws: the same request, asked once the walk is opened. */
function Walk({ siteId, siteName, rover, sun, accepted, onPlan }: WalkProps) {
  const { locale } = useI18n()
  const text = (key: DriveKey) => driveText(locale, key)
  const walk = walkText(locale)
  const route = useRoute({ siteId, rover, sunFraction: sun?.fraction, sunAzimuthDeg: sun?.azimuthDeg, coarseM: 60 })
  if (route.state.status === 'ready') {
    return (
      <RouteWalk
        siteId={siteId}
        siteName={siteName}
        route={route.state.data}
        accepted={accepted}
        sun={sun ? { azimuthDeg: sun.azimuthDeg, elevationDeg: sun.elevationDeg } : null}
        onPlanChange={onPlan}
      />
    )
  }
  if (route.state.status === 'error') {
    return (
      <div className="drive__note" role="alert">
        <p>{walk('walk.error.title')}</p>
        <p>{walk(errorKey(route.state.code))}</p>
        {route.state.code === 'no_hazard_grid' ? null : (
          <button type="button" className="drive__button" onClick={route.retry}>
            {walk('walk.retry')}
          </button>
        )}
      </div>
    )
  }
  return (
    <p className="drive__note" role="status">
      {text('drive.planning')}
    </p>
  )
}
