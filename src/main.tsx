import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadEditorPreferences } from './lib/editor-preferences'
import { loadAppearancePreferences } from './lib/appearance-preferences'
import { initPersonaCache } from './lib/persona-storage'
import { initializeAnalytics } from './lib/analytics'
import { zh } from './lib/i18n'

// Restore user preferences before rendering to avoid layout shift
loadEditorPreferences()
loadAppearancePreferences()
initializeAnalytics(zh ? 'zh-CN' : 'en')

void initPersonaCache().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />)
})
