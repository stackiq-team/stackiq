import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './router/router' 
import { LanguageProvider } from './i18n/LanguageContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
)
