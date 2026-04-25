# 设计规格：移除硬编码 API Key，改为项目文本文件 + 首次弹窗

**日期：** 2026-04-25  
**状态：** 已审批  
**目标：** 将项目安全地开放为 GitHub public 仓库，同时保持对最终用户的正常可用性。

---

## 背景

`src/services/llm-config.ts` 中的 `MODELS` 对象硬编码了 API Key 和代理 Base URL。项目计划开源，不能将密钥提交到公开仓库。

现有的 `ApiKeyModal.tsx` 组件已经存在但从未被接入主流程，且其 localStorage key 名称与当前 Anthropic 客户端不匹配（仍使用旧 OpenAI 风格的 key 名）。

---

## 目标

- 删除代码中所有硬编码的 API Key
- 无配置时自动弹出弹窗，引导用户填写 API Key（+ 可选 Base URL）
- 有配置时不弹窗，正常启动
- **无 Sidebar 设置按钮**（用户后续可直接编辑配置文件或 localStorage 修改）
- 不侵入现有 UI 布局

---

## 配置存储机制

采用**双层读取**，优先级从高到低：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1 | `import.meta.env.VITE_API_KEY` / `VITE_BASE_URL` | 项目根目录 `.env.local` 文件，文本格式，可手动修改，已被 `.gitignore` 忽略（`*.local` 规则） |
| 2 | `localStorage['vibe_api_key']` / `['vibe_base_url']` | 弹窗填写后的运行时保存 |

**手动修改方式（无需重开弹窗）：**  
在项目根目录创建/编辑 `.env.local`：
```
VITE_API_KEY=sk-xxxx
VITE_BASE_URL=https://api.anthropic.com   # 可选
```
然后重启开发服务器即生效。

`.env.example` 同步更新为此格式，作为模板提交到仓库。

---

## 数据流

```
App 启动
  → hasApiKeyConfigured()
    → 检查 import.meta.env.VITE_API_KEY（非空）
    → 检查 localStorage['vibe_api_key']（非空）
  → 两者均空 → 自动弹出 ApiKeyModal
  → 任一非空 → 正常启动，不弹窗

用户提交 ApiKeyModal
  → 保存到 localStorage['vibe_api_key'] / ['vibe_base_url']
  → 清空 llm.ts 中的 Anthropic client 单例（resetClient）
  → 关闭弹窗（无需 reload）

下次 LLM 调用时
  → getClient() 发现 client === null → 重建
  → getActiveModelConfig() 按优先级读取 apiKey / baseURL
```

---

## 各文件改动说明

### 1. `src/services/llm-config.ts`

**改动：**

- `MODELS` 中删除 `apiKey` 字段（`model` 和默认 `baseURL` 保留）
- `getActiveModelConfig()` 改为运行时合并，按优先级读取：
  1. `import.meta.env.VITE_API_KEY` / `VITE_BASE_URL`
  2. `localStorage['vibe_api_key']` / `['vibe_base_url']`
  3. fallback：`baseURL` 使用 `MODELS[ACTIVE_MODEL].baseURL`（`https://timesniper.club`），`apiKey` 为空字符串
- 新增导出函数 `hasApiKeyConfigured(): boolean`，按同样优先级检查是否已配置

**localStorage key 规范：**

| key | 含义 |
|-----|------|
| `vibe_api_key` | API Key |
| `vibe_base_url` | 可选，自定义 Base URL |

### 2. `src/components/ApiKeyModal.tsx`

**改动：**

- localStorage key 名从 `openai_api_key` / `openai_base_url` 改为 `vibe_api_key` / `vibe_base_url`
- 删除"模型"输入字段
- 更新文案：描述改为"填入 Anthropic API Key（或兼容代理的 Key）。Key 保存在本地浏览器中，不会上传。也可在项目根目录创建 `.env.local` 文件手动配置。"
- Base URL 的 placeholder 改为 `https://api.anthropic.com`
- 保存后：不再调用 `window.location.reload()`，改为调用 `props.onSaved()` 回调然后 `onClose()`
- `ApiKeyModalProps` 增加 `onSaved?: () => void`
- `ApiKeyModalProps` 增加 `required?: boolean`：`true` 时隐藏"取消"按钮（首次无 Key 强制填写），默认 `false`

### 3. `src/services/llm.ts`

**改动：**

- 导出一个 `resetClient()` 函数，将模块内的 `client` 变量设为 `null`，供外部在保存新配置后调用

### 4. `src/App.tsx`

**改动：**

- 启动时用 `hasApiKeyConfigured()` 检查，若为 `false` 则将 `showApiKeyModal` state 初始化为 `true`
- 增加 `showApiKeyModal` state（boolean）
- 渲染 `<ApiKeyModal>` 时传入 `onSaved={resetClient}`、`onClose={() => setShowApiKeyModal(false)}`，以及 `required={!hasApiKeyConfigured()}` — 首次无 Key 时隐藏取消按钮，强制用户填写
- **不向 Sidebar 传递任何设置回调**（无设置按钮）

### 5. `.env.example`

**改动：**

- 更新为当前 Vite 变量名：
  ```
  VITE_API_KEY=sk-your-api-key-here
  VITE_BASE_URL=https://api.anthropic.com
  ```

---

## 不在范围内

- 不改模型切换逻辑（`ACTIVE_MODEL` 仍由代码常量控制）
- 不做云端配置同步
- 不做 API Key 有效性验证（输入框提交即保存，若 Key 无效则在实际调用时报错）
- 不修改 demo 模式逻辑
- 不添加 Sidebar 设置按钮

---

## 安全考量

- API Key 通过弹窗保存在 `localStorage` 或 `.env.local`（均不进入 git）
- 弹窗中 API Key 输入框使用 `type="password"` 遮蔽显示
- 代码仓库中不再包含任何真实密钥

---

## 验证标准

1. `git grep` 找不到任何 `sk-` 开头的字符串
2. 首次打开（无配置）自动弹出弹窗，无取消按钮
3. 填写 API Key 后关闭弹窗，下次发送消息时 LLM 正常工作（无需 reload）
4. 已有配置（localStorage 或 `.env.local`）时打开页面不弹窗，体验无变化
5. 手动在 `.env.local` 填写 `VITE_API_KEY` 后重启，正常使用无弹窗
