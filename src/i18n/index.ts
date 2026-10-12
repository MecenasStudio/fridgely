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

export default i18n
