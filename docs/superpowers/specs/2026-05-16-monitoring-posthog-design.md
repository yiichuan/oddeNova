# 设计：生产监控与行为埋点

**日期：** 2026-05-16  
**子项目：** 3/4（生产化路线图）  
**背景：** 项目无任何监控，用户遇到 bug 时作者完全无感知。项目为 AGPL-3.0 开源，需考虑用户数据隐私。选定 PostHog Cloud（免费版：100 万事件/月），同时覆盖错误监控和行为分析，支持未来迁移到自托管。

---

## 目标

- JS 渲染层崩溃 → 自动捕获并上报，用户看到友好降级 UI
- Agent 核心流程（开始/成功/失败/中断）→ 手动埋点，可在 PostHog 看到转化漏斗
- WAV 导出成功 → 埋点，了解功能使用率
- 本地开发不上报（`VITE_POSTHOG_KEY` 未设置时静默禁用）

---

## 技术选型

**PostHog**（方案 C），理由：
- 错误追踪 + 行为分析一个平台
- 免费版 100 万事件/月，远超 Sentry 的 5,000 errors/月
- 支持自托管（AGPL 项目隐私友好）
- React SDK 提供 `<PostHogProvider>`，集成简单

---

## 新增文件

| 文件 | 职责 |
|---|---|
| `src/components/ErrorBoundary.tsx` | React Error Boundary：捕获渲染错误、上报 PostHog、展示降级 UI |
| `.env.production` | 存放 `VITE_POSTHOG_KEY` 和 `VITE_POSTHOG_HOST`（不提交到 git） |
| `.env.example` | 示例环境变量文件（提交到 git，供协作者参考） |

---

## 修改文件

| 文件 | 改动 |
|---|---|
| `src/main.tsx` | 初始化 PostHog，用 `<PostHogProvider>` 包裹根组件，`<ErrorBoundary>` 套在 `<App>` 外 |
| `src/App.tsx` | 在 `runAgent` 调用前后的 4 个位置加 `posthog.capture()` 埋点 |
| `src/components/ExportPopover.tsx` | 导出成功时加 `posthog.capture('export_wav_completed')` |
| `package.json` | 新增依赖 `posthog-js`、`posthog-react` |
| `.gitignore` | 确保 `.env.production` 已在忽略列表 |

---

## 初始化设计（main.tsx）

```tsx
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-react'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://app.posthog.com',
    autocapture: false,       // 关闭自动点击采集（噪音太多）
    capture_pageview: true,   // 保留页面访问统计
    persistence: 'localStorage',
  })
}

// 包裹方式：
// <PostHogProvider client={posthog}>
//   <ErrorBoundary>
//     <App />
//   </ErrorBoundary>
// </PostHogProvider>
```

`POSTHOG_KEY` 未设置时，`posthog.init()` 不调用，`posthog.capture()` 调用会静默忽略（PostHog SDK 的默认行为）。

---

## ErrorBoundary 设计

```tsx
// src/components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component {
  componentDidCatch(error, info) {
    posthog.captureException(error, { extra: { componentStack: info.componentStack } })
  }
  render() {
    if (this.state.hasError) {
      return <降级UI />   // "页面出错了，请刷新重试"
    }
    return this.props.children
  }
}
```

**触发条件：** 仅 React 组件 render 阶段的同步异常。异步错误（`runAgent` 等）已有 `try/catch` 覆盖，不受影响，ErrorBoundary 不会频繁触发。

---

## 手动埋点清单

在 `src/App.tsx` 中，`runAgent` 调用的四个分支各加一行：

| 事件名 | 触发位置 | 属性 |
|---|---|---|
| `agent_run_started` | `runAgent()` 调用前 | `session_id` |
| `agent_run_succeeded` | `result.code` 存在分支 | `session_id` |
| `agent_run_failed` | catch 块（非用户中断） | `session_id`, `error_message` |
| `agent_run_aborted` | `signal.aborted` 分支 | `session_id` |
| `session_created` | `useSessions` — 新建 session 时 | — |
| `export_wav_completed` | `ExportPopover.tsx` — `onExport` 返回 `true` 时 | — |

**不埋：**
- 具体代码内容（隐私）
- API Key 相关操作
- 页面滚动、鼠标移动
- Session Recording

---

## 环境配置

`.env.production`（**不提交 git**）：
```
VITE_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_POSTHOG_HOST=https://app.posthog.com
```

`.env.example`（**提交 git**）：
```
# PostHog 监控配置（可选，不填则本地开发不上报）
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://app.posthog.com
```

Vercel 部署时，在 Vercel Dashboard → Project Settings → Environment Variables 中填入真实值。

---

## 不做的事

- 不启用 Session Recording（用户创作内容隐私）
- 不识别用户身份（无账号体系，匿名 distinct_id）
- 不自动采集所有点击（`autocapture: false`）
- 不接入 Sentry（PostHog 已覆盖错误上报需求）

---

## 后续（本次不包含）

- 子项目 4：前端架构导览文档
- 未来：如隐私顾虑增加，迁移至自托管 PostHog（代码无需改动，仅换 `VITE_POSTHOG_HOST`）
