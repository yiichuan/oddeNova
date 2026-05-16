# 设计规格：接入七牛云 AI API

**日期**：2026-05-16  
**状态**：已批准，待实现

---

## 背景

oddeNova 目前支持 4 个 LLM 服务商（anthropic、deepseek、kimi、openai）。用户希望新增七牛云（Qiniu Cloud）作为可选服务商，对外以"官方体验"品牌展示。

七牛云 AI API（`https://api.qnaigc.com/v1`）是 OpenAI Chat Completions 兼容接口，支持 function calling，无需新增协议分支。

---

## 目标

- 在 ApiKeyModal 服务商下拉列表中新增"官方体验"选项
- 用户填写七牛云 API Key 后，即可使用 `z-ai/glm-5` 模型进行对话
- Key 独立存储（`vibe_api_key_qiniu`），不影响其他服务商

## 非目标

- 不新增协议分支（直接复用 `openai` 协议路径）
- 不修改任何 agent/loop/tools 逻辑
- 不支持自定义模型名称（固定为 `z-ai/glm-5`）

---

## 技术设计

### 1. `src/services/llm-config.ts`

**改动 1**：`ProviderType` 新增 `'qiniu'`

```ts
export type ProviderType =
  | 'deepseek'
  | 'kimi'
  | 'openai'
  | 'anthropic'
  | 'qiniu';          // 新增
```

**改动 2**：`PROVIDER_PRESETS` 新增 `qiniu` 条目

```ts
qiniu: {
  label: '官方体验',
  baseURL: 'https://api.qnaigc.com/v1',
  model: 'z-ai/glm-5',
  protocol: 'openai',
},
```

`normalizeProvider` 函数无需修改——它已有 `if (raw in PROVIDER_PRESETS)` 兜底逻辑，新 provider 自动覆盖。

`resolveOpenAICompatConfig` 函数无需修改——`qiniu` 属于 OpenAI-compat 路径，函数签名已支持任意 provider（通过 `PROVIDER_PRESETS[provider]` 查找 preset）。

> 注意：`resolveOpenAICompatConfig` 目前的参数类型是 `'deepseek' | 'kimi' | 'openai'`，需要同步扩展为包含 `'qiniu'`。

### 2. `src/components/ApiKeyModal.tsx`

**改动 1**：`PROVIDER_ORDER` 新增 `'qiniu'`

```ts
const PROVIDER_ORDER: ProviderType[] = [
  'anthropic', 'deepseek', 'qiniu',
];
```

其余逻辑无需修改：
- Key 存储：`handleSave` 已用 `vibe_api_key_${provider}` 作为 key，自动生成 `vibe_api_key_qiniu`
- Host 字段：已有 `provider === 'anthropic'` 条件判断，七牛云不显示自定义 Host 输入框
- 当前状态展示：复用现有 `PROVIDER_PRESETS[savedProvider].label` 逻辑，显示"官方体验"

---

## 数据流

```
用户选择"官方体验" → 填写 API Key → handleSave()
  → localStorage.setItem('vibe_api_key_qiniu', key)
  → localStorage.setItem('vibe_api_key', key)
  → localStorage.setItem('vibe_provider', 'qiniu')

getActiveModelConfig()
  → normalizeProvider('qiniu') → 'qiniu'
  → resolveOpenAICompatConfig('qiniu', key)
  → { baseURL: 'https://api.qnaigc.com/v1', model: 'z-ai/glm-5', protocol: 'openai' }

llm.ts → isOpenAIProvider() = true → 走 OpenAI SDK 路径
```

---

## 影响范围

| 文件 | 改动 |
|------|------|
| `src/services/llm-config.ts` | +1 类型值，+5 行 preset，函数签名扩展 |
| `src/components/ApiKeyModal.tsx` | +1 项 PROVIDER_ORDER |
| 其他所有文件 | 不改动 |

---

## 测试

无需新增单元测试（纯配置扩展，无新逻辑分支）。手动验证：
1. 打开 ApiKeyModal，下拉列表出现"官方体验"
2. 填写七牛云 Key 并保存，确认 localStorage 写入正确
3. 发送一条消息，确认走 `api.qnaigc.com` 请求路径
