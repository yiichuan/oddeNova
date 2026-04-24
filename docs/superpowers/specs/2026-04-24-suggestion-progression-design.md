# 设计规格：建议词渐进式构建（Suggestion Progression）

日期：2026-04-24

## 问题

当前"下一步建议"只将 `currentCode` 传给 LLM，缺乏两个关键信息：

1. **当前曲子处于什么阶段**（空 / 初步 / 发展中 / 完整）
2. **用户最初想做什么风格**（lo-fi、house、ambient 等）

导致建议是无方向的随机发散，用户连续点击后没有"层层叠加、越来越完整"的积累感。

## 目标

用户从零开始，连续点击建议，能感受到音乐从简单骨架逐渐丰满为一首完整曲子，且风格一致。

## 设计

### 核心思路

给建议 AI 额外注入两个信息：

1. **构图分析**（`analyzeMusicState`）：轻量解析 Strudel 代码，判断现有声部和缺失声部
2. **风格意图**（`extractStyleIntent`）：从对话历史第一条用户消息提取风格关键词

### 数据流

```
currentCode + messages
        ↓
analyzeMusicState(currentCode)
  → { layers: string[], missing: string[], stage: 'empty'|'early'|'developing'|'full' }

extractStyleIntent(messages)
  → string | null   // e.g. "lo-fi" 或 null

        ↓
buildSuggestions(currentCode, messages)
  → 注入动态上下文的提示词 → LLM → 2 条建议
```

### `analyzeMusicState` — 纯函数，无 LLM

用正则解析 Strudel 代码中的 `stack(...)` 结构和常见声部关键词（`bd`、`sd`、`hh` 代表鼓；`bass`、`sine`、`saw` 代表贝斯/旋律；`room`、`delay`、`reverb` 代表效果）。

输出：

| 字段 | 类型 | 说明 |
|------|------|------|
| `layers` | `string[]` | 检测到的声部，如 `['drum', 'bass']` |
| `missing` | `string[]` | 尚未出现的声部，固定集合为 `drum / bass / melody / fx` |
| `stage` | `string` | `empty`（代码为空）/ `early`（1层）/ `developing`（2-3层）/ `full`（4层） |

解析失败时退化：`stage = 'early'`，`missing = ['drum','bass','melody','fx']`。

### `extractStyleIntent` — 纯函数，无 LLM

从 `messages` 中取第一条 `role === 'user'` 的 `content`，匹配关键词表：

```
lo-fi, lofi, house, techno, ambient, jazz, funk,
drum and bass, dnb, trance, minimal, classical,
hip hop, hiphop, trap, indie, folk
```

匹配成功返回规范化字符串（如 `"lo-fi"`），失败返回 `null`。

### `buildSuggestions` 接口变更

```ts
// Before
buildSuggestions(currentCode: string): Promise<string[]>

// After
buildSuggestions(currentCode: string, messages: ChatMessage[]): Promise<string[]>
```

### 提示词模板

```
你是 Strudel 实时电子乐协作伙伴。

当前曲子状态：
- 已有声部：{layers.join(', ') || '无'}
- 缺少声部：{missing.join(', ') || '无'}
- 制作阶段：{stage}
- 风格方向：{styleIntent ?? '未知'}

基于以上状态，建议 2 个用户可以发出的"下一步"中文短指令。
规则：
- stage=empty 或 early → 优先建议补 missing 里的声部（"加入鼓点"、"铺一层低音"）
- stage=developing → 可以加层，也可以调质感/节奏/速度
- stage=full → 专注变奏、情绪变化，不要再建议加层
- styleIntent 不为"未知"时，建议内容要符合该风格特征
- 每条 6-12 个字，自然口语，不要英文术语堆砌
- 输出 JSON：{"suggestions":["...","..."]}，不要额外文字
```

### `useSuggestions` hook 变更

```ts
// 新增 messages 参数
export function useSuggestions(opts: {
  key: string;
  currentCode: string;
  hasUserMessages: boolean;
  messages: ChatMessage[];   // ← 新增
})
```

在调用 `buildSuggestions` 时传入 `messages`。

### 边界情况

| 情况 | 处理 |
|------|------|
| 代码为空 | 回退静态默认词，不调用 LLM（现有逻辑不变） |
| 代码无法解析 | `stage='early'`，`missing` 为全集 |
| 无用户消息 | `styleIntent = null`，提示词写"未知" |
| 风格关键词未匹配 | 同上 |
| LLM 调用失败 | fallback 静态词（现有逻辑不变） |

## 改动范围

| 文件 | 改动 |
|------|------|
| `src/services/suggestions.ts` | 新增 `analyzeMusicState`、`extractStyleIntent`；修改 `buildSuggestions` 签名和提示词 |
| `src/hooks/useSuggestions.ts` | 新增 `messages` 参数，传入 `buildSuggestions` |
| `src/App.tsx` | 向 `useSuggestions` 传入 `messages` |

不涉及 UI、Agent、音频引擎等其他模块。
