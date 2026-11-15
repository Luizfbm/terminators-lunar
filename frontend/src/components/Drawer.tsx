import { useEffect, useRef, type ReactNode } from 'react'
import { useI18n } from '../i18n/I18nContext'

/**
 * The drawer of details: a modal dialog over the globe, on the right of a wide screen and rising from the
 * bottom of a phone. The browser's own modal gives it the focus trap and Esc, and puts the focus back on
 * the button that opened it; a click on the dimmed globe outside it and the Close button close it too.
 * Its content stays mounted while it is closed, so a panel keeps what it has loaded.
 */
export function Drawer({
  open,
  onClose,
  stale = false,
  children,
}: {
  open: boolean
  onClose: () => void
  /** The last answer stays, dimmed, while the next one is asked for. */
  stale?: boolean
  children: ReactNode
}) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className="drawer"
      aria-label={t('details.label')}
      data-stale={stale}
      // Esc and close() both end here; a click on the backdrop lands on the dialog itself, never on its content.
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="drawer__sheet">
        <p className="drawer__bar">
          <button type="button" className="drawer__close" onClick={onClose}>
            {t('details.close')}
          </button>
        </p>
        <div className="drawer__body">{children}</div>
      </div>
    </dialog>
  )
}
