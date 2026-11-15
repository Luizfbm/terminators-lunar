import type { Page } from '../domain/query'
import { useI18n } from '../i18n/I18nContext'
import type { Locale } from '../i18n/messages'

export interface AppNavProps {
  page: Page
  locale: Locale
  /** Whether the assistant's sheet is open. */
  askOpen: boolean
  onGuide: () => void
  onAbout: () => void
  onAsk: () => void
  onProof: () => void
  onLocale: (locale: Locale) => void
  /** Told after any choice, so a menu folded on a phone can fold again. */
  onDone?: () => void
}

/**
 * What the top bar used to hold, as items at the foot of the globe's menu: the Guide, the assistant, About,
 * the Proof and the two languages. The words are English on purpose, like the rest of the menu; the
 * language switch is the one that changes the words of the rest of the app.
 */
export function AppNav({ page, locale, askOpen, onGuide, onAbout, onAsk, onProof, onLocale, onDone }: AppNavProps) {
  const { t } = useI18n()
  const act = (action: () => void) => () => {
    action()
    onDone?.()
  }
  return (
    <>
      <hr className="globe-menu__rule" />
      <button type="button" className="globe-menu__button" onClick={act(onGuide)}>
        <span>Guide</span>
      </button>
      <button type="button" className="globe-menu__button" aria-haspopup="dialog" aria-expanded={askOpen} onClick={act(onAsk)}>
        <span>Ask</span>
      </button>
      <button type="button" className="globe-menu__button" onClick={act(onAbout)}>
        <span>About</span>
      </button>
      <button type="button" className="globe-menu__button" aria-pressed={page === 'proof'} onClick={act(onProof)}>
        <span>Proof</span>
      </button>
      <div className="globe-menu__langs" role="group" aria-label="Language">
        {(['pt', 'en'] as const).map((code) => (
          <button
            key={code}
            type="button"
            lang={code}
            className="globe-menu__button"
            aria-pressed={locale === code}
            aria-label={`${code.toUpperCase()} ${t(`lang.${code}`)}`}
            onClick={act(() => onLocale(code))}
          >
            <span>{code.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </>
  )
}
