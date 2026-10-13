import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import pl from './pl.json'
import en from './en.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { pl: { translation: pl }, en: { translation: en } },
    fallbackLng: 'en',
    supportedLngs: ['pl', 'en'],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
  })

/**
 * Keep `<html lang>` in step with the interface language: screen readers and the
 * browser's own hyphenation pick their rules from it. Anything that is not Polish
 * falls back to English, the same choice the rest of the app makes.
 */
function applyDocumentLanguage(language: string | undefined): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = language?.startsWith('pl') ? 'pl' : 'en'
}

applyDocumentLanguage(i18n.resolvedLanguage)
i18n.on('languageChanged', applyDocumentLanguage)

export default i18n
