# 七牛云 AI API 接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ApiKeyModal 服务商列表中新增"官方体验"选项，接入七牛云 `https://api.qnaigc.com/v1`，默认模型 `z-ai/glm-5`。

**Architecture:** 纯配置扩展，复用现有 OpenAI-compat 路径（`resolveOpenAICompatConfig`）。新增 `'qiniu'` 到 `ProviderType` 联合类型和 `PROVIDER_PRESETS`，在 `ApiKeyModal` 的 `PROVIDER_ORDER` 中加入该选项。不新增任何协议分支或业务逻辑。

**Tech Stack:** TypeScript strict、React 18、Vite；测试用 `npm run lint && npx tsc --noEmit -p tsconfig.app.json`

---

## 文件改动一览

| 文件 | 操作 |
|------|------|
| `src/services/llm-config.ts` | 修改：扩展 `ProviderType`、`PROVIDER_PRESETS`、`resolveOpenAICompatConfig` 参数类型 |
| `src/components/ApiKeyModal.tsx` | 修改：`PROVIDER_ORDER` 增加 `'qiniu'` |

---

### Task 1：扩展 `llm-config.ts`

**Files:**
- Modify: `src/services/llm-config.ts`

- [ ] **Step 1: 扩展 `ProviderType` 联合类型**

在 `src/services/llm-config.ts` 中找到：

```ts
export type ProviderType =
  | 'deepseek'
  | 'kimi'
  | 'openai'
  | 'anthropic';
```

替换为：

```ts
export type ProviderType =
  | 'deepseek'
  | 'kimi'
  | 'openai'
  | 'anthropic'
  | 'qiniu';
```

- [ ] **Step 2: 在 `PROVIDER_PRESETS` 中新增 `qiniu` 条目**

在 `src/services/llm-config.ts` 中找到 `PROVIDER_PRESETS` 对象，在 `anthropic` 条目后追加：

```ts
  qiniu: {
    label: '官方体验',
    baseURL: 'https://api.qnaigc.com/v1',
    model: 'z-ai/glm-5',
    protocol: 'openai',
  },
```

完整对象结构变为：

```ts
export const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  deepseek: { ... },
  kimi:     { ... },
  openai:   { ... },
  anthropic: { ... },
  qiniu: {
    label: '官方体验',
    baseURL: 'https://api.qnaigc.com/v1',
    model: 'z-ai/glm-5',
    protocol: 'openai',
  },
};
```

- [ ] **Step 3: 扩展 `resolveOpenAICompatConfig` 参数类型**

在 `src/services/llm-config.ts` 中找到：

```ts
function resolveOpenAICompatConfig(
  provider: 'deepseek' | 'kimi' | 'openai',
  apiKey: string,
): ModelConfig {
```

替换为：

```ts
function resolveOpenAICompatConfig(
  provider: 'deepseek' | 'kimi' | 'openai' | 'qiniu',
  apiKey: string,
): ModelConfig {
```

- [ ] **Step 4: 确认 `getActiveModelConfig` 调用路径**

在 `src/services/llm-config.ts` 中找到 `getActiveModelConfig` 函数内的 `if (provider === 'anthropic')` 分支，确认 else 分支如下（无需修改，仅核对）：

```ts
// 其他 provider 使用用户在 Modal 里填的 Key
const userApiKey = localStorage.getItem('vibe_api_key') || '';

// deepseek | kimi | openai
return resolveOpenAICompatConfig(provider, userApiKey);
```

将注释更新为包含 `qiniu`：

```ts
// deepseek | kimi | openai | qiniu
return resolveOpenAICompatConfig(provider, userApiKey);
```

- [ ] **Step 5: 类型检查**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

预期：无错误输出。

---

### Task 2：更新 `ApiKeyModal.tsx`

**Files:**
- Modify: `src/components/ApiKeyModal.tsx`

- [ ] **Step 1: 在 `PROVIDER_ORDER` 中加入 `'qiniu'`**

在 `src/components/ApiKeyModal.tsx` 中找到：

```ts
const PROVIDER_ORDER: ProviderType[] = [
  'anthropic', 'deepseek',
];
```

替换为：

```ts
const PROVIDER_ORDER: ProviderType[] = [
  'anthropic', 'deepseek', 'qiniu',
];
```

- [ ] **Step 2: 类型检查 + Lint**

```bash
npx tsc --noEmit -p tsconfig.app.json && npm run lint
```

预期：无错误，无警告。

- [ ] **Step 3: 提交**

```bash
git add src/services/llm-config.ts src/components/ApiKeyModal.tsx
git commit -m "feat: add qiniu AI provider ('官方体验') with z-ai/glm-5 model"
```

---

## 手动验证清单

完成提交后，在浏览器中验证：

1. 打开 ApiKeyModal，下拉列表出现 **"官方体验"** 选项
2. 选择"官方体验"，填写七牛云 API Key 并保存
3. 打开浏览器 DevTools → Application → Local Storage，确认：
   - `vibe_provider` = `qiniu`
   - `vibe_api_key_qiniu` = 你填写的 Key
   - `vibe_api_key` = 同上
4. 发送一条消息，DevTools → Network 确认请求发往 `api.qnaigc.com`
