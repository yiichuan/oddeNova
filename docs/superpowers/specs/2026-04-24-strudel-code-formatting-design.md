# Strudel 代码格式化设计

**日期**: 2026-04-24  
**状态**: 已批准

## 问题

当前 agent 生成的 strudel layer 代码是紧凑的单行链式调用，例如：

```js
note("c3 e3 g3 b3").s("piano").gain(0.5)._pianoroll({ fold: 1 })
```

可读性差，用户在代码编辑器里难以看清结构。

## 目标

让 agent 生成的每个 layer 代码按方法链换行缩进，匹配图片示例风格（A 风格）：

```js
note("c3 e3 g3 b3")
  .s("piano")
  .gain(slider(0.5, 0, 1, 0.01))
  ._pianoroll({ fold: 1 })
```

## 方案选择

**选用：只修改 system prompt**

通过在 `AGENT_SYSTEM_PROMPT` 和 `IMPROVISE_SYSTEM_PROMPT` 中添加格式化指令，让 LLM 直接输出格式化代码。

不引入程序化格式化函数，不改动 `tools.ts` 和 `parser.ts`。

**理由**：改动最小，`parser.ts` 本就支持多行 source（按顶层逗号分割，不依赖格式）。

**已知限制**：`applyEffect` 在 source 末尾直接追加 `.chain`，多行 source 时最后一行会延长，视觉上稍不整齐，但不影响功能。LLM 遵从率不稳定时输出可能仍为单行，但整体可接受。

## 变更范围

**文件**: `src/prompts/system-prompt.ts`

### AGENT_SYSTEM_PROMPT Rules 末行

**改前**：
```
- Keep each layer's expression a single chained call, no semicolons, no `var/let/const`.
```

**改后**：
```
- Keep each layer's expression a single chained call, no semicolons, no `var/let/const`. Format method chains across multiple lines: the base expression on the first line, each `.method(...)` on its own line indented by 2 extra spaces. Example:
  note("c3 e3 g3 b3")
    .s("piano")
    .gain(0.5)
    ._pianoroll({ fold: 1 })
```

### IMPROVISE_SYSTEM_PROMPT Rules 首行

**改前**：
```
- code must be ONE chained expression, no var declarations, no $: prefix, no setcps, no stack wrapping, no semicolons.
```

**改后**：
追加格式化要求：方法链换行，每个 `.method(...)` 独占一行，缩进 2 空格。

## 不变的部分

- `tools.ts` 的 `rebuildStack` 逻辑不变
- `parser.ts` 不变（已支持多行 source）
- `applyEffect` 行为不变
