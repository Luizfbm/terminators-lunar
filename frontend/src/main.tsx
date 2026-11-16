import './domain/graphicsMode'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { I18nProvider } from './i18n/I18nContext'
import { pickLocale } from './i18n/i18n'
import type { Locale } from './i18n/messages'
// Orbitron is Larissa's face (her menu); the rest of the app takes its small labels from it too.
import '@fontsource/orbitron/latin-500.css'
import '@fontsource/orbitron/latin-600.css'
import './index.css'

const TAGS: Record<Locale, string> = { en: 'en-US', pt: 'pt-BR' }

/** The language comes from the link when it names one, otherwise from the browser; the switch changes it. */
function Root() {
  // English only, US dates, whatever the browser speaks (Luiz, 15/11/2026, issue #147).
  const [locale, setLocale] = useState<Locale>(() => pickLocale('en-US'))
  useEffect(() => {
    document.documentElement.lang = TAGS[locale]
  }, [locale])
  return (
    <I18nProvider locale={locale} language="en-US">
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
