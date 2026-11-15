import { useEffect } from 'react'
import { useI18n } from '../i18n/I18nContext'
import { watchEarthrise } from './earthrise/handover'

/**
 * What the stage shows while the Moon is on its way: the 3D code, the images, the first answer.
 * A small Earth in orbit, of the family of the Earthrise the page opens with, and one line of text.
 */
export function StageLoading() {
  const { t } = useI18n()
  // The app shows this from its first render, so this is where the Earthrise learns the code runs.
  useEffect(watchEarthrise, [])
  return (
    // Not a status: the answer column already announces "Loading the answer…", and two at once
    // would be read twice.
    <p className="stage__loading">
      <span className="stage__orbit" aria-hidden="true" />
      {t('stage.loading')}
    </p>
  )
}
