import './domain/graphicsMode'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { I18nProvider } from './i18n/I18nContext'
import './index.css'

// A single presentation language, including links saved with lang=pt and Portuguese browsers.
document.documentElement.lang = 'en-US'
function Root() {
  return <I18nProvider locale="en" language="en-US"><App /></I18nProvider>
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
