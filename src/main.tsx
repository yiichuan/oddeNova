import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import LearnPage, { LEARN_PATH_PREFIX } from './learn/LearnPage.tsx'
import { loadEditorPreferences } from './lib/editor-preferences'
import { initPersonaCache } from './lib/persona-storage'

const root = createRoot(document.getElementById('root')!)

if (window.location.pathname.startsWith(LEARN_PATH_PREFIX)) {
  // Standalone docs page — skip audio/session bootstrap entirely.
  root.render(<LearnPage />)
} else {
  // Restore user preferences before rendering to avoid layout shift
  loadEditorPreferences()

  void initPersonaCache().finally(() => {
    root.render(<App />)
  })
}
