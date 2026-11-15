import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n/I18nContext'

const KEY = 'lunar.cover'

/** Whether this browser has already seen the cover. A browser without storage sees it every time. */
export function coverSeen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'seen'
  } catch {
    return false
  }
}

export function rememberCover(): void {
  try {
    window.localStorage.setItem(KEY, 'seen')
  } catch {
    // Private mode or blocked storage: the cover simply shows again next time.
  }
}

/**
 * The first thing a visitor of the plain address sees: what the app asks and two ways in.
 * It sits over the app; the App keeps what is behind it inert.
 */
export function Cover({
  onStart,
  onLanding,
  onClose,
}: {
  onStart: () => void
  onLanding: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const start = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    start.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="cover" role="dialog" aria-modal="true" aria-labelledby="cover-title">
      <div className="cover__text">
        <h1 id="cover-title" className="cover__title">
          {t('cover.title')}
        </h1>
        <p className="cover__lead">{t('cover.lead')}</p>
        <p className="cover__ways">
          <button type="button" className="cover__start" ref={start} onClick={onStart}>
            {t('cover.start')}
          </button>
          <button type="button" className="cover__landing" onClick={onLanding}>
            {t('cover.landing')}
          </button>
        </p>
      </div>
    </div>
  )
}
