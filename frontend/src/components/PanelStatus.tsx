import { useI18n } from '../i18n/I18nContext'
import type { MessageKey } from '../i18n/messages'

const ERROR_KEYS: Record<string, MessageKey> = {
  network: 'error.network',
  busy: 'error.busy',
  outside_coverage: 'error.outside_coverage',
  window_out_of_range: 'error.window_out_of_range',
  missing_site: 'error.missing_site',
  invalid_parameter: 'error.invalid_parameter',
}

/** What a panel says while it computes, or when it could not. */
export function PanelStatus({ loading, code, onRetry }: { loading?: MessageKey; code?: string; onRetry: () => void }) {
  const { t } = useI18n()
  if (loading) {
    return (
      <p className="panel__status" role="status">
        {t(loading)}
      </p>
    )
  }
  return (
    <div className="panel__status" role="alert">
      <p>{t('panel.errorTitle')}</p>
      <p>{t(ERROR_KEYS[code ?? ''] ?? 'error.unknown')}</p>
      <button type="button" className="panel__retry" onClick={onRetry}>
        {t('error.retry')}
      </button>
    </div>
  )
}
