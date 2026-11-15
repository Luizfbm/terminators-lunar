import { useId, useRef, useState } from 'react'
import type { Site } from '../api/client'
import { isCustomSite, type Coordinate } from '../domain/query'
import { readCoordinate, type CoordinateProblems } from '../domain/sites'
import { useI18n } from '../i18n/I18nContext'
import type { MessageKey } from '../i18n/messages'

const NO_PROBLEMS: CoordinateProblems = { latitude: null, longitude: null }

const LATITUDE_MESSAGE: Record<NonNullable<CoordinateProblems['latitude']>, MessageKey> = {
  missing: 'sites.custom.latitudeMissing',
  unreadable: 'sites.custom.latitudeUnreadable',
  north: 'sites.custom.latitudeNorth',
}

const LONGITUDE_MESSAGE: Record<NonNullable<CoordinateProblems['longitude']>, MessageKey> = {
  missing: 'sites.custom.longitudeMissing',
  unreadable: 'sites.custom.longitudeUnreadable',
}

/**
 * A custom Site (the requirement): a latitude and a longitude typed at the foot of the Site list. A point
 * north of the polar maps is refused here, before anything is asked. Each bad field is marked and
 * says its own cause, both at once when both are wrong (the requirement).
 */
export function CustomSiteForm({
  site,
  maxLatitudeDeg,
  onCoordinate,
}: {
  site: Site
  maxLatitudeDeg: number
  onCoordinate: (coordinate: Coordinate) => void
}) {
  const { t } = useI18n()
  const custom = isCustomSite(site)
  const [latitude, setLatitude] = useState(custom ? String(site.latitude_deg) : '')
  const [longitude, setLongitude] = useState(custom ? String(site.longitude_deg) : '')
  const [problems, setProblems] = useState<CoordinateProblems>(NO_PROBLEMS)
  const latitudeRef = useRef<HTMLInputElement>(null)
  const longitudeRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const latitudeProblemId = useId()
  const longitudeProblemId = useId()
  const any = problems.latitude !== null || problems.longitude !== null

  return (
    <form
      className="site-list__custom"
      aria-labelledby={titleId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        const reading = readCoordinate(latitude, longitude, maxLatitudeDeg)
        if (!reading.ok) {
          setProblems(reading.problems)
          ;(reading.problems.latitude ? latitudeRef : longitudeRef).current?.focus()
          return
        }
        setProblems(NO_PROBLEMS)
        onCoordinate(reading.coordinate)
      }}
    >
      <p id={titleId} className="site-list__note">
        {t('sites.custom.title')}
      </p>
      <div className="site-list__fields">
        <label className="site-list__field">
          <span>{t('sites.custom.latitude')}</span>
          <input
            ref={latitudeRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('sites.custom.latitudeExample')}
            aria-invalid={problems.latitude !== null}
            aria-describedby={problems.latitude ? latitudeProblemId : undefined}
            value={latitude}
            onChange={(event) => {
              setLatitude(event.target.value)
              setProblems((was) => ({ ...was, latitude: null }))
            }}
          />
        </label>
        <label className="site-list__field">
          <span>{t('sites.custom.longitude')}</span>
          <input
            ref={longitudeRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('sites.custom.longitudeExample')}
            aria-invalid={problems.longitude !== null}
            aria-describedby={problems.longitude ? longitudeProblemId : undefined}
            value={longitude}
            onChange={(event) => {
              setLongitude(event.target.value)
              setProblems((was) => ({ ...was, longitude: null }))
            }}
          />
        </label>
        <button type="submit" className="site-list__ask">
          {t('sites.custom.ask')}
        </button>
      </div>
      {any && (
        <div className="site-list__problems" role="alert">
          {problems.latitude && <p id={latitudeProblemId}>{t(LATITUDE_MESSAGE[problems.latitude])}</p>}
          {problems.longitude && <p id={longitudeProblemId}>{t(LONGITUDE_MESSAGE[problems.longitude])}</p>}
        </div>
      )}
    </form>
  )
}
