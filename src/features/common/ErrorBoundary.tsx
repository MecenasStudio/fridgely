import { Component, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/** Small wrapper so the class below can use the translation hook. */
function BoundaryFallback({ onRetry }: { onRetry(): void }) {
  const { t } = useTranslation()
  return (
    <div>
      <p role="alert">{t('common.crashed')}</p>
      <button type="button" onClick={onRetry}>
        {t('common.retry')}
      </button>
    </div>
  )
}

type Props = { children: ReactNode }
type State = { failed: boolean }

/**
 * Keeps one broken screen from taking the whole app down: a render error in a tab shows a
 * short message and a retry button instead of an empty page.
 *
 * The error itself is deliberately neither stored nor displayed — no message, no stack —
 * because a stack trace can contain user data and is noise for the user.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  reset = (): void => {
    this.setState({ failed: false })
  }

  render(): ReactNode {
    if (this.state.failed) return <BoundaryFallback onRetry={this.reset} />
    return this.props.children
  }
}
