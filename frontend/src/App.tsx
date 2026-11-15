import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Answer, occluderLabel } from './components/Answer'
import { Assistant } from './components/phase4/assistant/Assistant'
import { StageLoading } from './components/StageLoading'
import { Cover, coverSeen, rememberCover } from './components/Cover'
import { Guide } from './components/Guide'
import type { GroundMark } from './components/Ground'
import { GroundView, prepareGround } from './components/GroundView'
import type { GlobeSite } from './components/Globe'
import { ClassroomSheet } from './components/phase4/classroom/Sheet'
import { Proof } from './components/Proof'
import { TimeStrip } from './components/TimeStrip'
import { siteName } from './components/siteName'
import { Where } from './components/Where'
import {
  clampCursor,
  initialCursor,
  isCoordinate,
  isCustomSite,
  linkWithoutLayout,
  readLink,
  writeLink,
  type Choice,
  type Page,
  type SiteRef,
  type View,
} from './domain/query'
import { IM2_LANDING } from './domain/landing'
import { DIVE_MS, fadeMs, scenesOf, startStage, stepStage } from './domain/stageMove'
import { chosenGlobeSite } from './domain/chosenSite'
import { levelOfView } from './domain/globeLevels'
import { sampleAt, subPointsAt, type LatLon } from './domain/sky'
import { isUp, statement, type Body } from './domain/statement'
import { useAnswer, useSites, type Answer as Answered } from './hooks/useAnswer'
import { useI18n } from './i18n/I18nContext'
import type { I18n } from './i18n/i18n'
import type { Locale, MessageKey } from './i18n/messages'

/** A screen worked with a finger: the map's hint names the touch gestures. */
const touchScreen = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

// three.js is most of the bundle; the answer in words does not wait for it.
const Globe = lazy(() => import('./components/Globe').then((module) => ({ default: module.Globe })))

const ERROR_KEYS: Record<string, MessageKey> = {
  network: 'error.network',
  busy: 'error.busy',
  outside_coverage: 'error.outside_coverage',
  window_out_of_range: 'error.window_out_of_range',
  ambiguous_site: 'error.ambiguous_site',
  missing_site: 'error.missing_site',
  invalid_parameter: 'error.invalid_parameter',
}

/** The answer with the Site named for the screen: the API gives every custom Site one English name. */
function named(answer: Answered, i18n: I18n): Answered {
  const { site } = answer.result.query
  if (!isCustomSite(site)) return answer
  const query = { ...answer.result.query, site: { ...site, name: siteName(site, i18n) } }
  return { ...answer, result: { ...answer.result, query } }
}

/** The whole Window passes in this long while playing. */
const PLAY_MS = 24_000

export function App({ locale, onLocale }: { locale: Locale; onLocale: (locale: Locale) => void }) {
  const i18n = useI18n()
  const { t } = i18n
  const link = useMemo(() => readLink(window.location.search), [])
  // A Curated Site by its code, a custom Site by its coordinate, or null for the default Site.
  const [siteRef, setSiteRef] = useState<SiteRef | null>(link.site)
  const [choice, setChoice] = useState<Choice>({ startDay: link.startDay, hours: link.hours, heightM: link.heightM })
  // The view asked for, and the move between the globe and the ground towards it (the requirement).
  const [stage, move] = useReducer(stepStage, link.view, (start: View) =>
    startStage(start, window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  )
  const view = stage.wanted
  const setView = useCallback((next: View) => move({ type: 'want', view: next }), [])
  const scenes = scenesOf(stage)
  // The globe is mounted once it has been on screen, and then waits under the ground view. A link
  // opened on the ground does not load it (and its images, 22 MB on a phone) until it is asked for.
  const [globeSeen, setGlobeSeen] = useState(scenes.globeShown)
  if (scenes.globeShown && !globeSeen) setGlobeSeen(true)
  const globeMounted = globeSeen || scenes.globeShown
  const [page, setPage] = useState<Page>(link.page)
  const [stats, setStats] = useState(link.stats)
  // The cover is for the plain address, once per browser: a link with a Query goes to its answer.
  // The plain address opens the cover. `layout=classic` says only which layout, not which Query, so it does not count as a link.
  const [cover, setCover] = useState(() => linkWithoutLayout(window.location.search) === '' && !coverSeen())
  const [guideStep, setGuideStep] = useState<number | null>(null)
  const closeCover = useCallback(() => {
    rememberCover()
    setCover(false)
  }, [])
  const closeGuide = useCallback(() => setGuideStep(null), [])
  // While the cover is up the app waits behind it, out of reach of the mouse and the keyboard.
  const coverOpen = cover && page === 'answer'
  useEffect(() => {
    const follow = () => setPage(readLink(window.location.search).page)
    window.addEventListener('popstate', follow)
    return () => window.removeEventListener('popstate', follow)
  }, [])
  // null until the visitor moves it: then the Cursor sits at now, or at the Window start.
  const [movedCursor, setMovedCursor] = useState(link.cursorMs)
  const [playing, setPlaying] = useState(false)
  // Whose Occluder is marked on the horizon: set by clicking the reason under a statement.
  const [marked, setMarked] = useState<Body | null>(null)
  // The language goes in the link once the visitor picks one, or when the link already had it.
  const [linkLanguage, setLinkLanguage] = useState(link.language)
  const [openedAt] = useState(() => Date.now())
  const sites = useSites()
  const { state, retry } = useAnswer(siteRef, choice)

  const answered = state.status === 'ready' ? state.answer : state.last
  // Right after the first answer the view from the ground is fetched in the background, so a
  // click on it never waits in the middle of the dive. Not before the page has loaded, though: the
  // fetch preloads three.js, which held the load event long enough for the globe to start its 8k
  // images, and then the page kept loading until they were in (or for ever, on a stalled network).
  // A visitor who asks for the ground first does not wait for the load event.
  const hasAnswer = answered !== null
  const wantsGround = stage.wanted === 'ground'
  useEffect(() => {
    if (!hasAnswer) return
    let gone = false
    const start = () => {
      void prepareGround().then(() => {
        if (!gone) move({ type: 'ready' })
      })
    }
    if (wantsGround || document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })
    return () => {
      gone = true
      window.removeEventListener('load', start)
    }
  }, [hasAnswer, wantsGround])
  // The fades and the pull back run on their own clocks. The dive ends when the globe says so,
  // or a little after its time: a globe that cannot draw must not keep the ground waiting.
  const { phase, still } = stage
  useEffect(() => {
    const after = (ms: number, event: 'faded' | 'pulled' | 'dived') => {
      const timer = window.setTimeout(() => move({ type: event }), ms)
      return () => window.clearTimeout(timer)
    }
    if (phase === 'fading-in' || phase === 'fading-out') return after(fadeMs(still), 'faded')
    if (phase === 'pulling-back') return after(DIVE_MS, 'pulled')
    if (phase === 'diving') return after(DIVE_MS + 150, 'dived')
  }, [phase, still])
  const answer = useMemo(() => (answered ? named(answered, i18n) : null), [answered, i18n])
  const result = answer?.result ?? null
  const startMs = result ? Date.parse(result.query.start) : 0
  const endMs = result ? Date.parse(result.query.end) : 0
  const cursorMs = result
    ? movedCursor === null
      ? initialCursor(startMs, endMs, openedAt)
      : clampCursor(movedCursor, startMs, endMs)
    : 0

  const cursorNow = useRef(cursorMs)
  useEffect(() => {
    cursorNow.current = cursorMs
  })

  useEffect(() => {
    if (!playing || endMs <= startMs) return
    let handle = 0
    let last = performance.now()
    let position = cursorNow.current
    const tick = (now: number) => {
      position += ((now - last) / PLAY_MS) * (endMs - startMs)
      last = now
      if (position >= endMs) {
        setMovedCursor(endMs)
        setPlaying(false)
        return
      }
      setMovedCursor(position)
      handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [playing, startMs, endMs])

  // The link follows the screen. Not while playing: a browser throttles that many history writes.
  useEffect(() => {
    if (playing) return
    const timer = window.setTimeout(() => {
      // What the App does not own (a panel's own setting) passes through from the current link.
      const query = writeLink({ ...readLink(window.location.search), site: siteRef, cursorMs: movedCursor, language: linkLanguage, view, ...choice, page, stats }, window.location.search)
      window.history.replaceState(null, '', `${window.location.pathname}${query}`)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [playing, siteRef, movedCursor, linkLanguage, view, choice, page, stats])

  const play = () => {
    if (!playing && result && cursorMs >= endMs) setMovedCursor(startMs)
    setPlaying(!playing)
  }

  const site = result?.query.site ?? null
  // The Site asked for moves the ring and the camera at once; the answer for it follows (the requirement).
  // A custom Site is not among the dots: it joins them as the chosen one, under a key of its own so
  // the globe flies again when another point is typed.
  const globeSite: GlobeSite | null = site
    ? chosenGlobeSite(
        siteRef,
        sites,
        answer?.meta.defaults.site_id ?? null,
        site,
        isCustomSite(site),
        (point) => siteName({ ...site, ...point, source: 'custom' }, i18n),
        state.status === 'loading',
      )
    : null
  const globeSites = useMemo(
    () => (globeSite && globeSite.id.startsWith('custom:') ? [...sites, globeSite] : sites),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sites, globeSite?.id],
  )
  const sky = result ? sampleAt(result.timeline.samples, cursorMs) : null
  const overhead = result?.sub_points ? subPointsAt(result.sub_points.samples, cursorMs) : null
  const sunUp = result ? isUp('sun', result.periods, result.events, cursorMs) : false
  const earthUp = result ? isUp('earth', result.periods, result.events, cursorMs) : false

  // The marked Occluder is the one the statement names at the Cursor, so the mark follows the Cursor.
  let mark: GroundMark | null = null
  if (result && marked) {
    const said = statement(marked, result.periods, result.events, cursorMs, endMs)
    if (said.kind === 'sets' || said.kind === 'rises') {
      const { occluder } = said.event
      mark = { body: marked, azimuthDeg: occluder.azimuth_deg, label: occluderLabel(i18n, occluder) }
    }
  }
  // The same Occluder on the globe and the map: where it is, in its body's colour.
  let markOnMoon: (LatLon & { body: Body }) | null = null
  if (result && marked) {
    const said = statement(marked, result.periods, result.events, cursorMs, endMs)
    if (said.kind === 'sets' || said.kind === 'rises') {
      const { occluder } = said.event
      markOnMoon = { body: marked, latitude_deg: occluder.latitude_deg, longitude_deg: occluder.longitude_deg }
    }
  }
  // From orbit the reason opens the horizon; on the map and the horizon it marks the Occluder where you are.
  const onMark = (body: Body) => {
    const showing = marked === body
    setMarked(showing ? null : body)
    if (!showing && view === 'orbit') setView('ground')
  }

  // A link can carry a point north of the polar maps: say so, and offer the way back.
  const customOutside = state.status === 'error' && state.code === 'outside_coverage' && isCoordinate(siteRef)

  return (
    <div className="screen" data-layout={link.classic ? 'classic' : undefined}>
      {/* Larissa's layout is the default: no header, no answer column (the stylesheet hides them). `?layout=classic` shows both. */}
      <header className="bar">
        <p>
          <strong>{t('app.name')}</strong> · {t('app.place')}
        </p>
        <p className="bar__nav">
          <button
            type="button"
            onClick={() => {
              closeCover()
              setPage('answer')
              setGuideStep(0)
            }}
          >
            {t('bar.guide')}
          </button>
          <button
            type="button"
            onClick={() => {
              setGuideStep(null)
              setPage('answer')
              setCover(true)
            }}
          >
            {t('bar.about')}
          </button>
          <Assistant result={result} />
        </p>
        <p className="bar__lang">
          {(['pt', 'en'] as const).map((code) => (
            <button key={code} type="button" lang={code} aria-pressed={locale === code} aria-label={`${code.toUpperCase()} ${t(`lang.${code}`)}`}
              onClick={() => {
                setLinkLanguage(code)
                onLocale(code)
              }}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </p>
      </header>

      {page === 'proof' && <Proof />}

      <section className="stage" hidden={page === 'proof'} inert={coverOpen}>
        {result && site && globeSite && globeMounted && (
          // Under the view from the ground the globe waits, hidden and paused, for the way back up.
          <div className="stage__globe" hidden={!scenes.globeShown}>
          <Suspense fallback={<StageLoading />}>
            <Globe
              sites={globeSites}
              site={globeSite}
              sun={overhead?.sun ?? null}
              earth={overhead?.earth ?? null}
              cursorMs={cursorMs}
              sunAzimuthDeg={sky?.sun.azimuth_deg ?? null}
              earthAzimuthDeg={sky?.earth.azimuth_deg ?? null}
              sunUp={sunUp}
              earthUp={earthUp}
              label={t('globe.label', { site: site.name, state: t(sunUp ? 'globe.lit' : 'globe.dark') })}
              unavailable={t('globe.unavailable')}
              onSelect={setSiteRef}
              mode={stage.globeMode}
              level={levelOfView(view)}
              onLevel={setView}
              dive={scenes.globeDived}
              paused={!scenes.globeShown}
              onDive={(atSite) => {
                if (atSite) move({ type: 'dived' })
              }}
              occluder={markOnMoon}
              onPoint={(point) => setSiteRef({ latitudeDeg: point.latitude_deg, longitudeDeg: point.longitude_deg })}
              meridianLabels={[
                '0°',
                `90°\u00a0${t('sites.hemisphere.E')}`,
                '180°',
                `90°\u00a0${t('sites.hemisphere.W')}`,
              ]}
            />
          </Suspense>
          </div>
        )}
        {!result && state.status === 'loading' && <StageLoading />}
        {stage.shown === 'map' && stage.phase === 'idle' && <p className="stage__caption">{t(touchScreen() ? 'map.caption.touch' : 'map.caption')}</p>}
        {result && scenes.groundMounted && (
          <div className="stage__ground" data-fade={scenes.groundFade ?? undefined} style={{ animationDuration: `${fadeMs(still)}ms` }}>
            <GroundView result={result} cursorMs={cursorMs} mark={mark} pose={scenes.skyPose} />
          </div>
        )}
        {/* Under 900 px wide the foot sits below the picture, never on it (the requirement). */}
        <div className="stage__foot">
          <p className="views">
            {(['orbit', 'map', 'ground'] as const).map((name) => (
              <button key={name} type="button" aria-pressed={view === name} onClick={() => setView(name)}>
                {t(`view.${name}`)}
              </button>
            ))}
          </p>
          {result && stage.shown === 'ground' && stage.phase === 'idle' && <ClassroomSheet />}
        </div>
      </section>

      {/* While the next Site is asked for, the last answer stays, dimmed: never a blank column. */}
      <main className="answer" hidden={page === 'proof'} inert={coverOpen} data-stale={state.status === 'loading' && answer !== null} aria-busy={state.status === 'loading'}>
        {result?.provenance.synthetic && <p className="demo">{t('demo')}</p>}
        {state.status === 'loading' && (
          <p className="status" role="status">
            {t(isCoordinate(siteRef) ? 'sites.custom.loading' : 'status.loading')}
          </p>
        )}
        {state.status === 'error' && (
          <div className="status status--error" role="alert">
            <p className="status__title">{t('error.title')}</p>
            {customOutside ? (
              <>
                <p>{t('sites.custom.outside')}</p>
                <button type="button" className="status__retry" onClick={() => setSiteRef(null)}>
                  {t('sites.custom.backToDefault')}
                </button>
              </>
            ) : (
              <>
                <p>{t(ERROR_KEYS[state.code] ?? 'error.unknown')}</p>
                <button type="button" className="status__retry" onClick={retry}>
                  {t('error.retry')}
                </button>
              </>
            )}
          </div>
        )}
        {result && answer && (
          <Answer
            result={result}
            cursorMs={cursorMs}
            where={
              <Where result={result} meta={answer.meta} sites={sites} choice={choice} onSite={setSiteRef} onCoordinate={setSiteRef} onChoice={setChoice} />
            }
            // A Window starts on a whole UTC day in the Query, so a best Window opens from its first day.
            marked={marked}
            onMark={onMark}
            onWindow={(best) => setChoice({ ...choice, startDay: best.start.slice(0, 10), hours: best.durationHours })}
            stats={stats}
            onStats={setStats}
            landing={{
              href: writeLink({ site: IM2_LANDING.site, cursorMs: null, language: linkLanguage, view, ...IM2_LANDING.choice, page: 'answer', stats, classic: link.classic }),
              open: () => {
                setSiteRef(IM2_LANDING.site)
                setChoice(IM2_LANDING.choice)
                // The Cursor goes back to the start of the new Window.
                setMovedCursor(null)
                // The link sits under the numbers; the new answer is read from its first line.
                document.querySelector('main.answer')?.scrollTo({ top: 0 })
                window.scrollTo({ top: 0 })
              },
            }}
          />
        )}
      </main>

      {result && answer && page === 'answer' && (
        <TimeStrip
          inert={coverOpen}
          result={result}
          cursorMs={cursorMs}
          playing={playing}
          shortShadowMaxHours={answer.meta.short_shadow_max_hours}
          onCursor={(ms) => {
            setPlaying(false)
            setMovedCursor(clampCursor(ms, startMs, endMs))
          }}
          onPlay={play}
        />
      )}
      {coverOpen && (
        <Cover
          onStart={() => {
            closeCover()
            setGuideStep(0)
          }}
          onLanding={() => {
            closeCover()
            setSiteRef(IM2_LANDING.site)
            setChoice(IM2_LANDING.choice)
            setMovedCursor(null)
          }}
          onClose={closeCover}
        />
      )}
      {guideStep !== null && !cover && result && page === 'answer' && <Guide step={guideStep} onStep={setGuideStep} onClose={closeGuide} />}
    </div>
  )
}
