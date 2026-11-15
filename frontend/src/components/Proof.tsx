import type { Meta, Validation } from '../api/client'
import { countByStatus, orderValidations } from '../domain/proof'
import { goToPage } from '../domain/query'
import { useValidations } from '../hooks/useValidations'
import { useI18n } from '../i18n/I18nContext'
import type { MessageKey } from '../i18n/messages'

const REASONS: Record<string, MessageKey> = { network: 'error.network', busy: 'error.busy' }

/** "How we know these numbers": every validation check from the latest run, failures first. */
export function Proof() {
  const { t } = useI18n()
  const { state, retry } = useValidations()

  return (
    <main className="proof">
      <p>
        <a
          className="proof__back"
          href="?"
          onClick={(event) => {
            event.preventDefault()
            goToPage('answer')
          }}
        >
          ← {t('proof.back')}
        </a>
      </p>
      <h1 className="proof__title">{t('proof.title')}</h1>

      {state.status === 'loading' && (
        <p className="status" role="status">
          {t('proof.loading')}
        </p>
      )}
      {state.status === 'error' && (
        <div className="status status--error" role="alert">
          <p>{t('proof.error', { reason: t(REASONS[state.code] ?? 'error.unknown') })}</p>
          <button type="button" className="status__retry" onClick={retry}>
            {t('error.retry')}
          </button>
        </div>
      )}
      {state.status === 'ready' && <Checks validations={state.validations} />}
      {state.status === 'ready' && state.meta && <Provenance meta={state.meta} />}
    </main>
  )
}

function Checks({ validations }: { validations: Validation[] }) {
  const { t } = useI18n()
  if (validations.length === 0) return <p className="proof__lead">{t('proof.empty')}</p>
  const counts = countByStatus(validations)
  return (
    <>
      <p className="proof__lead">
        {t('proof.summary', {
          total: String(validations.length),
          passed: String(counts.passed),
          failed: String(counts.failed),
          pending: String(counts.pending),
        })}
      </p>
      <p className="proof__note">{t('proof.order')}</p>
      <ol className="proof__list">
        {orderValidations(validations).map((validation) => (
          <Check key={validation.id} validation={validation} />
        ))}
      </ol>
    </>
  )
}

function Check({ validation }: { validation: Validation }) {
  const { t, locale, formatDateTime } = useI18n()
  const runAt = Date.parse(validation.run_at)
  const rows: [MessageKey, string, string?][] = [
    ['proof.reference', validation.reference],
    ['proof.tolerance', validation.tolerance[locale]],
    ['proof.result', validation.result[locale]],
    ['proof.notCovered', validation.not_covered[locale]],
    ['proof.script', validation.script_path, 'proof__mono'],
    ['proof.runAt', Number.isFinite(runAt) ? formatDateTime(runAt) : validation.run_at],
  ]
  return (
    <li className="proof__check" data-status={validation.status}>
      <h2 className="proof__name">
        {validation.title[locale]} <span className="proof__status">· {t(`proof.status.${validation.status}`)}</span>
      </h2>
      <dl>
        {rows.map(([label, value, className]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd className={className}>{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  )
}

function Provenance({ meta }: { meta: Meta }) {
  const { t, formatNumber } = useI18n()
  const dems = meta.dems.map((dem) => t('proof.dem', { product: dem.product, resolution: formatNumber(dem.resolution_m) }))
  return (
    <p className="proof__provenance">
      {t('proof.provenance', { engine: meta.engine_version, kernels: meta.kernels.join(', '), dems: dems.join('; ') })}
    </p>
  )
}
