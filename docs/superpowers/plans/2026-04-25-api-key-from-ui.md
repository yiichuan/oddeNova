# API Key UI 配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将硬编码在 `llm-config.ts` 中的 API Key 移除，改为运行时从环境变量或 localStorage 读取；首次无配置时弹窗引导用户填写。

**Architecture:** `llm-config.ts` 改为运行时合并配置（优先 `import.meta.env.VITE_API_KEY`，其次 localStorage），`ApiKeyModal.tsx` 改造后接入 `App.tsx`，`llm.ts` 新增 `resetClient()` 供弹窗关闭时清空 client 单例。

**Tech Stack:** React, TypeScript, Vite（`import.meta.env`），localStorage

---

## 文件改动地图

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/llm-config.ts` | 修改 | 删硬编码 key，改为运行时读取，新增 `hasApiKeyConfigured()` |
| `src/services/llm.ts` | 修改 | 新增导出 `resetClient()` |
| `src/components/ApiKeyModal.tsx` | 修改 | 改 localStorage key 名、删模型字段、去 reload、加 onSaved/required prop |
| `src/App.tsx` | 修改 | 加 `showApiKeyModal` state，启动时检查，渲染 `<ApiKeyModal>` |
| `.env.example` | 修改 | 更新变量名为 `VITE_API_KEY` / `VITE_BASE_URL` |

---

### Task 1：改造 `llm-config.ts`

**Files:**
- Modify: `src/services/llm-config.ts`

- [ ] **Step 1：删除硬编码 apiKey，改写 `getActiveModelConfig()`**

将文件全部内容替换为：

```typescript
// ===========================================================================
// LLM 配置文件 —— 集中管理可切换的模型与 API 凭据。
//
// 切换模型的方式：把下面的 ACTIVE_MODEL 改成 MODELS 中任意一个 key。
// 例如：
//   export const ACTIVE_MODEL: ModelKey = 'sonnet';   // 用 claude-sonnet-4-6
//   export const ACTIVE_MODEL: ModelKey = 'opus';     // 用 claude-opus-4-6
//
// 也可以通过 Vite 环境变量 VITE_LLM_MODEL 覆盖（可选）。
//
// API Key 配置优先级（从高到低）：
//   1. 项目根目录 .env.local 中的 VITE_API_KEY（不提交 git）
//   2. localStorage['vibe_api_key']（弹窗填写后保存）
// ===========================================================================

export interface ModelConfig {
  /** 上游模型名（透传给 Anthropic 接口的 model 字段） */
  model: string;
  /** 接口 base URL */
  baseURL: string;
  /** API Key */
  apiKey: string;
}

const DEFAULT_BASE_URL = 'https://timesniper.club';

export const MODELS = {
  sonnet: {
    model: 'claude-sonnet-4-6',
    baseURL: DEFAULT_BASE_URL,
  },
  opus: {
    model: 'claude-opus-4-6',
    baseURL: DEFAULT_BASE_URL,
  },
} as const satisfies Record<string, { model: string; baseURL: string }>;

export type ModelKey = keyof typeof MODELS;

// 默认使用的模型 —— 改这里就能切换全局模型。
const DEFAULT_MODEL: ModelKey = 'opus';

// 允许通过 Vite 环境变量覆盖（如 .env.local 里 VITE_LLM_MODEL=opus）。
function resolveActiveKey(): ModelKey {
  const envKey = (import.meta as unknown as { env?: Record<string, string> })?.env
    ?.VITE_LLM_MODEL as ModelKey | undefined;
  if (envKey && envKey in MODELS) return envKey;
  return DEFAULT_MODEL;
}

export const ACTIVE_MODEL: ModelKey = resolveActiveKey();

/** 从环境变量或 localStorage 读取运行时配置，合并到模型静态配置中。 */
export function getActiveModelConfig(): ModelConfig {
  const env = (import.meta as unknown as { env?: Record<string, string> })?.env ?? {};
  const base = MODELS[ACTIVE_MODEL];

  const apiKey =
    env['VITE_API_KEY'] ||
    localStorage.getItem('vibe_api_key') ||
    '';

  const baseURL =
    env['VITE_BASE_URL'] ||
    localStorage.getItem('vibe_base_url') ||
    base.baseURL;

  return { model: base.model, baseURL, apiKey };
}

/** 是否已有 API Key 配置（环境变量或 localStorage 任一非空即视为已配置）。 */
export function hasApiKeyConfigured(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string> })?.env ?? {};
  return !!(
    env['VITE_API_KEY'] ||
    localStorage.getItem('vibe_api_key')
  );
}
```

- [ ] **Step 2：验证 TypeScript 无报错**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music && npx tsc --noEmit
```

Expected：无错误输出（或仅有与本次修改无关的已有错误）。

- [ ] **Step 3：Commit**

```bash
git add src/services/llm-config.ts
git commit -m "feat: remove hardcoded API key from llm-config, read from env/localStorage"
```

---

### Task 2：`llm.ts` 新增 `resetClient()`

**Files:**
- Modify: `src/services/llm.ts`（约第 31 行，`let client` 声明之后）

- [ ] **Step 1：在 `getClient()` 函数之后新增导出函数**

找到文件中：
```typescript
function getModel(): string {
  return getActiveModelConfig().model;
}
```

在此之前插入：
```typescript
/** 清空 Anthropic client 单例，下次调用 getClient() 时使用最新配置重建。 */
export function resetClient(): void {
  client = null;
}

```

- [ ] **Step 2：验证 TypeScript 无报错**

```bash
npx tsc --noEmit
```

Expected：无新增错误。

- [ ] **Step 3：Commit**

```bash
git add src/services/llm.ts
git commit -m "feat: export resetClient() to allow config hot-reload"
```

---

### Task 3：改造 `ApiKeyModal.tsx`

**Files:**
- Modify: `src/components/ApiKeyModal.tsx`

- [ ] **Step 1：将文件全部内容替换为**

```typescript
import { useState } from 'react';

interface ApiKeyModalProps {
  onClose: () => void;
  onSaved?: () => void;
  /** true 时隐藏"取消"按钮，强制用户填写（首次无配置场景）。 */
  required?: boolean;
}

export default function ApiKeyModal({ onClose, onSaved, required = false }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState(localStorage.getItem('vibe_api_key') || '');
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('vibe_base_url') || '');

  const handleSave = () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) return;
    localStorage.setItem('vibe_api_key', trimmedKey);
    if (baseUrl.trim()) {
      localStorage.setItem('vibe_base_url', baseUrl.trim());
    } else {
      localStorage.removeItem('vibe_base_url');
    }
    onSaved?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-secondary border border-border rounded-2xl p-6 w-[420px] max-w-[90vw] shadow-2xl">
        <h2 className="text-lg font-semibold text-text-primary mb-1">设置 API Key</h2>
        <p className="text-xs text-text-muted mb-4">
          填入 Anthropic API Key（或兼容代理的 Key）。Key 保存在本地浏览器中，不会上传。
          也可在项目根目录创建 <code className="text-accent">.env.local</code> 文件手动配置（重启后生效）。
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-secondary mb-1 block">API Key *</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="sk-..."
              className="w-full bg-bg-primary text-text-primary text-sm rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary mb-1 block">Base URL（可选，留空使用默认端点）</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.anthropic.com"
              className="w-full bg-bg-primary text-text-primary text-sm rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          {!required && (
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm text-text-secondary bg-bg-tertiary rounded-lg hover:bg-border transition-colors"
            >
              取消
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="flex-1 py-2.5 text-sm text-white bg-accent rounded-lg hover:bg-accent-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2：验证 TypeScript 无报错**

```bash
npx tsc --noEmit
```

Expected：无新增错误。

- [ ] **Step 3：Commit**

```bash
git add src/components/ApiKeyModal.tsx
git commit -m "feat: refactor ApiKeyModal to use vibe_api_key localStorage key, remove model field"
```

---

### Task 4：在 `App.tsx` 接入弹窗

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1：添加 import**

在文件顶部的 import 块中，找到：
```typescript
import { isDemoMode, getActiveDemoSet, DEMO_SCENARIO_2 } from './demo/demo-config';
```

在其后添加：
```typescript
import ApiKeyModal from './components/ApiKeyModal';
import { hasApiKeyConfigured } from './services/llm-config';
import { resetClient } from './services/llm';
```

- [ ] **Step 2：添加 `showApiKeyModal` state**

找到：
```typescript
  const [isLoading, setIsLoading] = useState(false);
  const [isMoodLoading, setIsMoodLoading] = useState(false);
  const [demoPrefill, setDemoPrefill] = useState('');
  const [demoStep, setDemoStep] = useState(0);
```

在其后添加：
```typescript
  const [showApiKeyModal, setShowApiKeyModal] = useState(() => !hasApiKeyConfigured());
```

- [ ] **Step 3：在 JSX 中渲染弹窗**

找到 `return (` 语句内，`<div className="flex h-screen...">` 的开头（即最外层 div 内的第一个子元素之前），插入弹窗渲染：

找到：
```typescript
    <div className="flex h-screen w-screen bg-bg-primary overflow-hidden">
      <Sidebar
```

替换为：
```typescript
    <div className="flex h-screen w-screen bg-bg-primary overflow-hidden">
      {showApiKeyModal && (
        <ApiKeyModal
          onClose={() => setShowApiKeyModal(false)}
          onSaved={resetClient}
          required={!hasApiKeyConfigured()}
        />
      )}
      <Sidebar
```

- [ ] **Step 4：验证 TypeScript 无报错**

```bash
npx tsc --noEmit
```

Expected：无新增错误。

- [ ] **Step 5：Commit**

```bash
git add src/App.tsx
git commit -m "feat: show ApiKeyModal on startup when no API key configured"
```

---

### Task 5：更新 `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1：替换文件内容**

将 `.env.example` 内容替换为：

```
# 将此文件复制为 .env.local 并填入你的配置（.env.local 已被 .gitignore 忽略）
VITE_API_KEY=sk-your-api-key-here
# VITE_BASE_URL=https://api.anthropic.com   # 可选，留空则使用默认端点
# VITE_LLM_MODEL=opus                       # 可选，sonnet 或 opus
```

- [ ] **Step 2：Commit**

```bash
git add .env.example
git commit -m "docs: update .env.example with correct Vite variable names"
```

---

### Task 6：验证 git 中无密钥残留

- [ ] **Step 1：扫描 git 历史中是否有 sk- 开头字符串**

```bash
git log --all -p | grep -c 'sk-bQJ3'
```

Expected：输出 `0`（如果之前有提交过，需要用 `git filter-repo` 清理历史，但这属于额外操作，不在本次范围）。

- [ ] **Step 2：扫描当前工作树**

```bash
git grep 'sk-' -- '*.ts' '*.tsx' '*.js' '*.env*'
```

Expected：无输出。

- [ ] **Step 3：确认 `.env.local` 在 `.gitignore` 中**

```bash
grep '\.local' .gitignore
```

Expected：输出包含 `*.local`。

---

### Task 7：手动集成验证

- [ ] **Step 1：启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2：验证首次打开弹窗**

在浏览器中打开应用，打开 DevTools → Application → Local Storage，删除 `vibe_api_key` key（如有），刷新页面。

Expected：弹窗自动弹出，无"取消"按钮，API Key 输入框自动聚焦。

- [ ] **Step 3：填写 API Key 并验证正常工作**

在弹窗中填入真实的 API Key，点击"保存"。

Expected：弹窗关闭，页面无 reload，正常进入主界面。发送一条音乐指令，LLM 正常响应。

- [ ] **Step 4：验证已配置时不弹窗**

刷新页面。

Expected：弹窗不再出现（localStorage 已有 `vibe_api_key`）。

- [ ] **Step 5：验证 `.env.local` 方式**

在项目根目录创建 `.env.local`，写入 `VITE_API_KEY=sk-test`（用假 key 测试弹窗不弹即可），重启开发服务器，在 DevTools 中删除 localStorage 的 `vibe_api_key`，刷新。

Expected：弹窗不出现（env var 优先）。
