import type { Meta, Validation } from '../api/client'
import { countByStatus, orderValidations } from '../domain/proof'
import { ERROR_SOURCES, NOT_CHECKED, type Reference } from '../domain/proofCaveats'
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

      <ErrorSources />
      <NotChecked />

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

/** Where the size of each row comes from: a check, a file, a decision record or a paper. */
function References({ refs }: { refs: readonly Reference[] }) {
  return (
    <ul className="proof-summary__refs">
      {refs.map((ref) => (
        <li key={`${ref.kind}:${ref.value}`} className={ref.kind === 'paper' ? undefined : 'proof__mono'}>
          {ref.kind === 'adr' ? `ADR ${ref.value}` : ref.value}
        </li>
      ))}
    </ul>
  )
}

/** "Where a number can be wrong": each source of error, its size, its effect and where the size comes from. */
function ErrorSources() {
  const { t } = useI18n()
  const columns: MessageKey[] = [
    'proof.errors.col.source',
    'proof.errors.col.size',
    'proof.errors.col.effect',
    'proof.errors.col.from',
  ]
  return (
    <section className="proof-summary" aria-labelledby="proof-errors-title" data-testid="proof-errors">
      <h2 id="proof-errors-title" className="proof-summary__title">
        {t('proof.errors.title')}
      </h2>
      <p className="proof__note">{t('proof.errors.lead')}</p>
      <table className="proof-summary__table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {t(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ERROR_SOURCES.map((row) => (
            <tr key={row.id}>
              <th scope="row">{t(`proof.err.${row.id}.name`)}</th>
              <td data-label={t(columns[1])}>{t(`proof.err.${row.id}.size`)}</td>
              <td data-label={t(columns[2])}>{t(`proof.err.${row.id}.effect`)}</td>
              <td data-label={t(columns[3])}>
                <References refs={row.refs} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** "What we have not checked yet": gaps that belong to the whole page, not to one check. */
function NotChecked() {
  const { t } = useI18n()
  return (
    <section className="proof-summary" aria-labelledby="proof-todo-title" data-testid="proof-not-checked">
      <h2 id="proof-todo-title" className="proof-summary__title">
        {t('proof.todo.title')}
      </h2>
      <p className="proof__note">{t('proof.todo.lead')}</p>
      <ul className="proof-summary__todo">
        {NOT_CHECKED.map((row) => (
          <li key={row.id}>
            <p>{t(`proof.todo.${row.id}`)}</p>
            <References refs={row.refs} />
          </li>
        ))}
      </ul>
    </section>
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
