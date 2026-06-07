import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadEditorPreferences } from './lib/editor-preferences'

// Restore user preferences before rendering to avoid layout shift
loadEditorPreferences()

createRoot(document.getElementById('root')!).render(<App />)
