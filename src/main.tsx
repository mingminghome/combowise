import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installGtm } from './core/analytics/gtm'
import './index.css'
import App from './App.tsx'
import { ThemeService } from './core/services/themeService'

// Apply saved theme before first paint of React tree
ThemeService.init()
// GTM/GA only when VITE_GTM_ID is set at build time
installGtm()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
