import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useOnline } from './useOnline'

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

beforeEach(() => {
  setNavigatorOnline(true)
})

afterEach(() => {
  setNavigatorOnline(true)
})

describe('useOnline', () => {
  it('starts from navigator.onLine', () => {
    setNavigatorOnline(false)
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(false)
  })

  it('follows the online and offline events', () => {
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })

  it('stops listening after unmount', () => {
    const { result, unmount } = renderHook(() => useOnline())
    unmount()

    // No state update happens and nothing throws.
    window.dispatchEvent(new Event('offline'))
    expect(result.current).toBe(true)
  })

  it('treats a missing navigator.onLine as online', () => {
    Object.defineProperty(navigator, 'onLine', { value: undefined, configurable: true })
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(true)
  })
})
