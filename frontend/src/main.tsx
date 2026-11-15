import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { readLink } from './domain/query'
import { I18nProvider } from './i18n/I18nContext'
import { pickLocale } from './i18n/i18n'
import type { Locale } from './i18n/messages'
import './index.css'

const TAGS: Record<Locale, string> = { en: 'en-GB', pt: 'pt-BR' }

/** The language comes from the link when it names one, otherwise from the browser; the switch changes it. */
function Root() {
  const [locale, setLocale] = useState<Locale>(() => readLink(window.location.search).language ?? pickLocale(navigator.language))
  useEffect(() => {
    document.documentElement.lang = TAGS[locale]
  }, [locale])
  return (
    <I18nProvider locale={locale} language={navigator.language}>
      <App locale={locale} onLocale={setLocale} />
    </I18nProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
