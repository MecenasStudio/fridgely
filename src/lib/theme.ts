// Theme choice: light, dark or follow the system.
//
// The choice lives in `localStorage` and is mirrored onto `<html data-theme="...">`, which
// `styles.css` reads. Everything here is wrapped in `try/catch`: a browser that blocks
// storage (private mode, embedded webview) must still get a working app.

export type Theme = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'fridgely.theme'

function isTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark'
}

/** The saved choice, or `system` when there is none or storage is unavailable. */
export function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

/** Saves the choice. A failing storage is ignored on purpose. */
export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore: the theme still applies for this session
  }
}

/**
 * Applies the theme to the document. `system` removes the attribute, which hands the choice
 * back to the `prefers-color-scheme` rules in the stylesheet.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
}

/** Applies and remembers a choice in one step. */
export function setTheme(theme: Theme): void {
  applyTheme(theme)
  storeTheme(theme)
}
