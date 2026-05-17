---
description: 修改 oddeNova 系统提示词的完整操作规程
---

# 修改系统提示词

## 背景

提示词通过版本文件管理，三个核心文件各司其职：

| 文件 | 职责 |
|---|---|
| `src/prompts/versions/v{N}.ts` | 存放实际提示词内容（历史版本，只读） |
| `src/prompts/active.ts` | 版本指针，修改此文件切换版本 |
| `src/prompts/system-prompt.ts` | 转发 shim，消费方 import 路径，**禁止直接编辑** |

## 禁止事项

- **不得**修改 `src/prompts/system-prompt.ts`
- **不得**修改任何已有的 `versions/v*.ts`（历史版本只读）

## 操作步骤

### 1. 确认当前版本

```bash
cat src/prompts/active.ts
```

输出示例（`v1` 即当前版本号）：

```ts
export { AGENT_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT_OPENAI, IMPROVISE_SYSTEM_PROMPT } from './versions/v1';
```

### 2. 创建新版本文件

将当前版本号 +1（例如 v1 → v2）：

```bash
cp src/prompts/versions/v1.ts src/prompts/versions/v2.ts
```

### 3. 更新新版本文件元数据

编辑 `src/prompts/versions/v2.ts` 顶部注释，更新三个字段：

```ts
/**
 * @version v2
 * @date YYYY-MM-DD
 * @description 简要描述本次改动
 */
```

### 4. 修改提示词内容

只编辑 `src/prompts/versions/v2.ts`，修改对应的导出常量：

- `AGENT_SYSTEM_PROMPT` — Anthropic 系模型的系统提示词
- `AGENT_SYSTEM_PROMPT_OPENAI` — OpenAI 系模型的系统提示词
- `IMPROVISE_SYSTEM_PROMPT` — 即兴演奏（improvise）模式的系统提示词

### 5. 切换 active.ts 指向新版本

编辑 `src/prompts/active.ts`，将路径从旧版本改为新版本：

```ts
// 改前
export { AGENT_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT_OPENAI, IMPROVISE_SYSTEM_PROMPT } from './versions/v1';

// 改后
export { AGENT_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT_OPENAI, IMPROVISE_SYSTEM_PROMPT } from './versions/v2';
```

> **注意**：若新版本新增或删除了导出名，需同步更新 `{}` 列表。

### 6. 验证

```bash
npx tsc --noEmit -p tsconfig.app.json   # 必须零错误
npm test -- --run                        # 必须所有测试通过
```

### 7. 提交

```bash
git add src/prompts/versions/v2.ts src/prompts/active.ts
git commit -m "prompts: <简述本次改动，例如：strengthen music style guidance>"
```

## 回滚

如果新版本效果变差，将 `active.ts` 改回旧版本路径即可（旧文件仍在）：

```ts
// 改回
export { AGENT_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT_OPENAI, IMPROVISE_SYSTEM_PROMPT } from './versions/v1';
```

然后重新验证并提交：

```bash
npx tsc --noEmit -p tsconfig.app.json && npm test -- --run
git add src/prompts/active.ts
git commit -m "prompts: revert to v1"
```
