import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import i18n from '../../i18n'
import { ErrorBoundary } from './ErrorBoundary'

/** A child that throws while rendering, with a switch to let it recover on retry. */
function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom: secret stack detail')
  return <p>recovered</p>
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  // React prints the caught error; the test output stays readable without it.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('shows a message and a retry button instead of an empty page', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert').textContent).toBe('Something went wrong.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    // Neither the message nor the stack may leak into the DOM.
    expect(document.body.textContent).not.toContain('boom')
    expect(document.body.textContent).not.toContain('secret stack detail')
  })

  it('renders the children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('fine')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('retries and shows the children again once they stop throwing', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    )

    // The retry only resets the boundary, so the same (still broken) child throws again …
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('alert')).toBeTruthy()

    // … and once the child is fixed, the next retry shows it.
    rerender(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('recovered')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('resets by itself when the boundary is remounted with another key', () => {
    // This is how `App` wraps the tabs: `key={tab}`, so switching tabs clears a crash.
    const { rerender } = render(
      <ErrorBoundary key="fridge">
        <Boom shouldThrow />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()

    rerender(
      <ErrorBoundary key="recipes">
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('recovered')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
