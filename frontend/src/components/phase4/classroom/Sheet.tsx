import { useEffect, useRef } from 'react'
import { useLinkParam } from '../../../hooks/useLinkParam'
import { useI18n } from '../../../i18n/I18nContext'
import { Classroom } from './Classroom'
import './classroom.css'

/** The link parameter: present while the sheet is open, holding the latitude on the control. */
export const CLASSROOM_PARAM = 'classroom'
/** The sheet opens at the pole, where the sentence is. */
const OPENING_LATITUDE = 90

/** The latitude in the link, or null when the sheet is closed. A bad value opens at the pole. */
export function latitudeOf(param: string | null): number | null {
  if (param === null) return null
  const value = Number(param)
  return param.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 90 ? value : OPENING_LATITUDE
}

/**
 * The way to the Classroom figure from the view from the ground: a link under the sky that opens
 * the figure in a sheet. It sits beside the real horizon, never in the answer column, so nobody
 * reads it as an answer (ADR 0005).
 */
export function ClassroomSheet() {
  const { t } = useI18n()
  const [param, setParam] = useLinkParam(CLASSROOM_PARAM)
  const latitude = latitudeOf(param)
  const open = latitude !== null
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const sheet = dialog.current
    if (!sheet) return
    if (open && !sheet.open) sheet.showModal()
    if (!open && sheet.open) sheet.close()
  }, [open])

  return (
    <>
      <button type="button" className="classroom-open" aria-haspopup="dialog" onClick={() => setParam(String(OPENING_LATITUDE))}>
        {t('class.title')}
      </button>
      <dialog
        ref={dialog}
        className="classroom-sheet"
        aria-label={t('class.title')}
        onClose={() => setParam(null)}
        // A click on the backdrop lands on the dialog itself, outside its content: it closes the sheet.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
      >
        <div className="classroom-sheet__body">
          <button type="button" className="classroom-sheet__close" onClick={() => dialog.current?.close()}>
            {t('class.close')}
          </button>
          {open && <Classroom latitude={latitude} onLatitude={(value) => setParam(String(Math.round(value * 10) / 10))} />}
        </div>
      </dialog>
    </>
  )
}
