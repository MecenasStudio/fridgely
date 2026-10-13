import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { THEME_STORAGE_KEY, applyTheme, readStoredTheme, setTheme, storeTheme } from './theme'

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('readStoredTheme', () => {
  it('defaults to system when nothing is saved', () => {
    expect(readStoredTheme()).toBe('system')
  })

  it('reads every valid choice', () => {
    for (const theme of ['system', 'light', 'dark'] as const) {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
      expect(readStoredTheme()).toBe(theme)
    }
  })

  it('ignores a value it does not understand', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon')
    expect(readStoredTheme()).toBe('system')
  })

  it('survives a storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStoredTheme()).toBe('system')
  })
})

describe('storeTheme', () => {
  it('writes the choice and ignores a failing write', () => {
    storeTheme('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => storeTheme('light')).not.toThrow()
  })
})

describe('applyTheme', () => {
  it('mirrors the choice onto the document element', () => {
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('hands the choice back to the system by removing the attribute', () => {
    applyTheme('dark')
    applyTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})

describe('setTheme', () => {
  it('applies and remembers in one step', () => {
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(readStoredTheme()).toBe('dark')

    setTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(readStoredTheme()).toBe('system')
  })

  it('still applies the theme when storage refuses to remember it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => setTheme('light')).not.toThrow()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
