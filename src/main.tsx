import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadEditorPreferences } from './lib/editor-preferences'

// 在 React 渲染前加载持久化的编辑器偏好，确保首屏使用用户保存的默认设置。
loadEditorPreferences()

// 根容器由 Vite 入口 HTML 提供；缺失时直接失败，避免渲染到未定义目标。
createRoot(document.getElementById('root')!).render(<App />)
