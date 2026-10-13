import { useTranslation } from 'react-i18next'

type Props = {
  /** True when the last load failed. */
  error?: boolean
  /** Retries the failing load. */
  onRetry?: () => void
}

/**
 * The one place that reports a failed data load: an alert plus a retry button.
 *
 * Views render it above their content, so whatever was already on screen stays visible —
 * a failed refresh must never look like an empty list.
 */
export function LoadError({ error = false, onRetry }: Props) {
  const { t } = useTranslation()
  if (!error) return null

  return (
    <p role="alert">
      {t('common.loadFailed')}{' '}
      {onRetry && (
        <button type="button" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </p>
  )
}
