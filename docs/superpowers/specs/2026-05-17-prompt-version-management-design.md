# Prompt 版本管理设计

**日期**：2026-05-17  
**状态**：待实现  

## 背景

`src/prompts/system-prompt.ts` 包含三个核心 LLM 提示词常量（`AGENT_SYSTEM_PROMPT`、`AGENT_SYSTEM_PROMPT_OPENAI`、`IMPROVISE_SYSTEM_PROMPT`）。随着持续优化迭代，需要一套机制能在优化变差时快速回滚到历史版本，同时保留完整的版本变更历史。

## 目标

- 每个提示词版本独立文件，可对比历史、随时回滚
- 切换版本只改一行代码，无需修改任何消费方代码
- 零额外基础设施，与现有 TypeScript / Vite 生态完全兼容
- 版本历史可通过 git log 追踪

## 非目标

- 运行时动态切换（不需要 UI 控制面板）
- `styles.ts` 纳入版本管理（风格数据与 prompt 文字性质不同，独立演化）
- 版本间自动对比工具（git diff 已足够）

## 目录结构

```
src/prompts/
  versions/
    v1.ts          ← 基线版本（当前 system-prompt.ts 内容迁移）
    v2.ts          ← 后续每次优化前新建
    ...
  active.ts        ← 单行指针，指向当前激活版本
  system-prompt.ts ← 纯 re-export shim，从 active.ts 转发导出
  styles.ts        ← 不参与版本管理，保持原样
```

## 文件规范

### `versions/vN.ts`

每个版本文件必须满足：

1. **顶部元数据注释**，格式固定：

```ts
/**
 * @version vN
 * @date YYYY-MM-DD
 * @description 本版本改动的一句话描述
 */
```

2. **导出三个固定名称的常量**（与现有 `system-prompt.ts` 完全一致）：

```ts
export const AGENT_SYSTEM_PROMPT: string = ...;
export const AGENT_SYSTEM_PROMPT_OPENAI: string = ...;
export const IMPROVISE_SYSTEM_PROMPT: string = ...;
```

3. 内部辅助常量（`STRUDEL_CHEATSHEET_CONCISE`、`REFERENCE_COMPOSITION` 等）保留在文件内部，不导出。

### `active.ts`

全部内容只有一行：

```ts
export * from './versions/v1';  // 切换版本：改这一行
```

切换版本 = 把这里的版本号改为目标版本，其他文件不动。

### `system-prompt.ts`（改造后）

```ts
// 此文件仅做转发，内容不在此维护。
// 如需修改 prompt，在 src/prompts/versions/ 新建版本文件。
export {
  AGENT_SYSTEM_PROMPT,
  AGENT_SYSTEM_PROMPT_OPENAI,
  IMPROVISE_SYSTEM_PROMPT,
} from './active';
```

所有现有的 `import { AGENT_SYSTEM_PROMPT } from '../prompts/system-prompt'` 无需改动。

## 工作流

### 优化前备份（创建新版本）

```bash
# 1. 复制当前版本为新版本
cp src/prompts/versions/v1.ts src/prompts/versions/v2.ts

# 2. 修改 v2.ts 顶部 @version 和 @description
# 3. 编辑 v2.ts 中的 prompt 内容
# 4. 激活新版本
#    active.ts：export * from './versions/v2';

# 5. 提交
git add src/prompts/versions/v2.ts src/prompts/active.ts
git commit -m "prompts: activate v2 - <改动描述>"
```

### 回滚

```bash
# 修改 active.ts，改回旧版本号
#    export * from './versions/v1';

git add src/prompts/active.ts
git commit -m "prompts: rollback to v1"
```

### 查看版本历史

```bash
git log --oneline -- src/prompts/active.ts
git diff v1.ts v2.ts
```

## 类型安全保障

不额外定义 `PromptSet` interface。TypeScript 的结构类型系统通过以下链条保证：

```
versions/vN.ts  →  active.ts (export *)  →  system-prompt.ts (named re-export)  →  消费方
```

若某版本文件少导出任何一个常量，`system-prompt.ts` 的 named re-export 会立即产生编译错误，无需人工检查。

## 迁移步骤（实现时）

1. 新建 `src/prompts/versions/v1.ts`，把当前 `system-prompt.ts` 的所有内容（含内部辅助常量）完整迁入，添加元数据注释
2. 新建 `src/prompts/active.ts`，内容：`export * from './versions/v1';`
3. 将 `system-prompt.ts` 替换为纯 re-export shim
4. 运行 `npx tsc --noEmit -p tsconfig.app.json` 验证无类型错误
5. 运行 `npm test` 验证现有测试全部通过（prompt 内容不影响 agent 工具测试，但确保迁移无副作用）
6. 提交：`prompts: introduce active-pointer version management (baseline v1)`
