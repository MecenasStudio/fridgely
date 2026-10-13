import { describe, it, expect, afterAll } from 'vitest'
import i18n from './index'

// The imported module already applied the initial language, so the first assertion
// also proves that path works.
afterAll(async () => {
  await i18n.changeLanguage('en')
})

describe('document language', () => {
  it('follows the interface language', async () => {
    await i18n.changeLanguage('pl')
    expect(document.documentElement.lang).toBe('pl')

    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
  })

  it('treats a regional Polish tag as Polish and anything else as English', async () => {
    await i18n.changeLanguage('pl-PL')
    expect(document.documentElement.lang).toBe('pl')

    await i18n.changeLanguage('de')
    expect(document.documentElement.lang).toBe('en')
  })
})
