import React from 'react'
import ReactDOM from 'react-dom/client'
import './i18n'
import './styles.css'
import App from './App'
import { applyTheme, readStoredTheme } from './lib/theme'

// Apply the saved theme before the first render, so the app never flashes the wrong one.
applyTheme(readStoredTheme())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
