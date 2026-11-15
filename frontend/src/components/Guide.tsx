import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n/I18nContext'
import type { MessageKey } from '../i18n/messages'

/** What each tip points at: the way to the Site (the Details button), the time strip with its Cursor, the three views. */
const TARGETS = ['.card__details', 'footer.strip', '.views'] as const
export const GUIDE_STEPS = TARGETS.length

/**
 * Three short tips, one at a time, each with a ring around the part of the screen it talks about.
 * The app stays usable under it: a visitor can try the thing the tip names.
 */
export function Guide({ step, onStep, onClose }: { step: number; onStep: (step: number) => void; onClose: () => void }) {
  const { t } = useI18n()
  const next = useRef<HTMLButtonElement>(null)
  const last = step === GUIDE_STEPS - 1

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(TARGETS[step])
    target?.setAttribute('data-guide', 'true')
    target?.scrollIntoView({ block: 'nearest' })
    next.current?.focus({ preventScroll: true })
    return () => target?.removeAttribute('data-guide')
  }, [step])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="guide" role="dialog" aria-label={t('guide.label')}>
      <p className="guide__count">{t('guide.count', { step: String(step + 1), total: String(GUIDE_STEPS) })}</p>
      <p className="guide__tip" aria-live="polite">
        {t(`guide.${step + 1}` as MessageKey)}
      </p>
      <p className="guide__ways">
        {!last && (
          <button type="button" className="guide__skip" onClick={onClose}>
            {t('guide.skip')}
          </button>
        )}
        <button type="button" className="guide__next" ref={next} onClick={() => (last ? onClose() : onStep(step + 1))}>
          {t(last ? 'guide.done' : 'guide.next')}
        </button>
      </p>
    </div>
  )
}
