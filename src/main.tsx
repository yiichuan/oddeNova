import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadEditorPreferences } from './lib/editor-preferences'
import { initPersonaCache } from './lib/persona-storage'

// Restore user preferences before rendering to avoid layout shift
loadEditorPreferences()

void initPersonaCache().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />)
})
