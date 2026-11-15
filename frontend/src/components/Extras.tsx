import type { VisibilityResult } from '../api/client'
import { goToPage, readLink, writeLink } from '../domain/query'
import { useI18n } from '../i18n/I18nContext'

/** The way to the Proof page, at the foot of the answer. */
export function Extras({ result }: { result: VisibilityResult }) {
  const { t } = useI18n()
  return (
    <div className="extras" data-site={result.query.site.id}>
      <p className="extras__proof">
        <a
          href={writeLink({ ...readLink(window.location.search), page: 'proof' }) || '?page=proof'}
          onClick={(event) => {
            event.preventDefault()
            goToPage('proof')
          }}
        >
          {t('proof.open')}
        </a>
      </p>
    </div>
  )
}
