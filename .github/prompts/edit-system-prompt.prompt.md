---
description: 修改 oddeNova 系统提示词的完整操作规程
---

# 修改系统提示词

## 背景

提示词通过版本文件管理，三个核心文件各司其职：

| 文件 | 职责 |
|---|---|
| `src/prompts/versions/v{N}.ts` | 存放实际提示词内容；已完成版本只读，当前需求的工作版本可继续迭代 |
| `src/prompts/active.ts` | 版本指针，修改此文件切换版本 |
| `src/prompts/system-prompt.ts` | 转发 shim，消费方 import 路径，**禁止直接编辑** |

## 版本原则

- **一个需求只对应一个新版本。** 开始一个新的 prompt 需求时创建 `v{N+1}`；同一个需求内的多次试验、评测和微调都继续修改这个工作版本，不再继续创建 `v{N+2}`、`v{N+3}`。
- **完成后冻结。** 当该需求通过验证并提交/合并后，这个版本成为历史版本，后续新需求必须从当前 active 版本再创建新的 `v{N+1}`。
- **历史可回滚。** 回滚仍然通过修改 `active.ts` 指向旧版本完成，不直接改旧版本文件。

## 禁止事项

- **不得**修改 `src/prompts/system-prompt.ts`
- **不得**修改已完成/已发布的 `versions/v*.ts`（历史版本只读）
- **不得**为同一个需求的每次微调连续创建多个 prompt 版本

## 操作步骤

### 1. 确认当前工作版本

```bash
cat src/prompts/active.ts
```

输出示例（`v1` 即当前版本号）：

```ts
export { AGENT_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT_OPENAI, IMPROVISE_SYSTEM_PROMPT } from './versions/v1';
```

如果当前 active 版本已经是本需求创建的工作版本，继续编辑该版本文件，跳到 Step 3。

### 2. 为新需求创建版本文件

如果这是一个新需求，将 Step 1 读取到的当前版本号 +1（例如当前为 v1 则新建 v2）：

```bash
# 将 v{N} 替换为 Step 1 读取到的实际版本号，v{N+1} 替换为新版本号
cp src/prompts/versions/v{N}.ts src/prompts/versions/v{N+1}.ts
# 示例（当前为 v1）：cp src/prompts/versions/v1.ts src/prompts/versions/v2.ts
```

### 3. 更新新版本文件元数据

编辑 `src/prompts/versions/v{N+1}.ts` 顶部注释，更新三个字段（`v{N+1}` 即 Step 2 中创建的新版本号）：

```ts
/**
 * @version v{N+1}
 * @date YYYY-MM-DD
 * @description 简要描述本需求
 */
```

同一个需求后续微调时，可以更新 `@description` 让它概括最终需求，但不要仅因为微调再创建新版本。

### 4. 修改提示词内容

只编辑本需求的工作版本文件 `src/prompts/versions/v{N+1}.ts`，修改对应的导出常量：

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
git add src/prompts/versions/v{N+1}.ts src/prompts/active.ts
git commit -m "prompts: strengthen music style guidance"  # 根据实际改动替换引号内的描述
```

提交/合并后，`v{N+1}` 即成为历史版本。后续另一个需求再从当前 active 版本创建下一个版本。

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
git commit -m "prompts: revert to v{N}"  # v{N} 为回滚后的目标版本号
```
