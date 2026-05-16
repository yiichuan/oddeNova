# Code Quality Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立三层代码质量防线——TypeScript strict 模式、Vitest 单元测试、pre-commit hook——防止「运行时静默失败」类 bug（如 ADSR 包络参数传入 `undefined`）在 code review 前被发现。

**Architecture:** 防线一修改 `tsconfig.app.json` 启用 strict，让类型错误在 IDE 编写时即报错；防线二引入 Vitest 覆盖 `src/lib/` 中的纯逻辑文件；防线三通过 husky + lint-staged 在 `git commit` 时强制运行全部检查。

**Tech Stack:** TypeScript strict、Vitest 2.x、husky 9.x、lint-staged 15.x

---

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| Modify | `tsconfig.app.json` | 加 `"strict": true` |
| Create | `vitest.config.ts` | Vitest 配置（environment: node） |
| Modify | `package.json` | 加 `"test"` 脚本、`"prepare"` 脚本、`lint-staged` 配置；devDependencies 加 vitest/husky/lint-staged |
| Create | `src/lib/__tests__/sample-allowlist.test.ts` | `findUnknownSamples()` 单元测试 |
| Create | `src/lib/__tests__/session-storage.test.ts` | session-storage 内存 fallback 路径测试 |
| Create | `.husky/pre-commit` | pre-commit hook 脚本 |

---

## Task 1：启用 TypeScript strict 模式

**Files:**
- Modify: `tsconfig.app.json`

- [ ] **Step 1：修改 tsconfig.app.json**

在 `"noFallthroughCasesInSwitch": true` 之后加一行：

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "esnext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2：验证无新增错误**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

预期输出：无任何 `error TS` 行，命令以 exit code 0 退出。

- [ ] **Step 3：提交**

```bash
git add tsconfig.app.json
git commit -m "chore: enable TypeScript strict mode"
```

---

## Task 2：安装 Vitest 并配置

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1：安装 vitest**

```bash
npm install --save-dev vitest@^2
```

- [ ] **Step 2：创建 vitest.config.ts**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 3：在 package.json 的 scripts 中加入 test**

在 `"lint": "eslint ."` 之后加一行：

```json
"test": "vitest run"
```

完整 scripts 块应为：
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "test": "vitest run",
  "preview": "vite preview",
  "postinstall": "patch-package"
}
```

- [ ] **Step 4：验证 vitest 可运行（无测试文件时）**

```bash
npm test
```

预期输出：`No test files found` 或 `0 tests passed`，exit code 0（vitest run 在无文件时不报错）。

- [ ] **Step 5：提交**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest for unit testing"
```

---

## Task 3：为 sample-allowlist 编写测试

**Files:**
- Create: `src/lib/__tests__/sample-allowlist.test.ts`

`findUnknownSamples(code)` 解析 `s("...")` / `sound("...")` 中的 token，与内部 allowlist 比对，返回未知 token 列表。

- [ ] **Step 1：先跑一次确认没有该测试文件**

```bash
ls src/lib/__tests__/ 2>/dev/null || echo "目录不存在"
```

- [ ] **Step 2：创建测试文件**

```ts
// src/lib/__tests__/sample-allowlist.test.ts
import { describe, it, expect } from 'vitest';
import { findUnknownSamples } from '../sample-allowlist';

describe('findUnknownSamples', () => {
  it('合法 sample 不报错', () => {
    expect(findUnknownSamples('s("bd ~ sd ~")')).toEqual([]);
  });

  it('非法 sample 返回未知名称', () => {
    const result = findUnknownSamples('s("superpad violin")');
    expect(result).toContain('superpad');
    expect(result).toContain('violin');
  });

  it('GM soundfont 名合法', () => {
    expect(findUnknownSamples('s("gm_acoustic_grand_piano")')).toEqual([]);
  });

  it('合法 GM soundfont 混合非法 sample', () => {
    const result = findUnknownSamples('s("gm_acoustic_grand_piano rhodes")');
    expect(result).toContain('rhodes');
    expect(result).not.toContain('gm_acoustic_grand_piano');
  });

  it('内置合成器（sawtooth、sine 等）合法', () => {
    expect(findUnknownSamples('s("sawtooth")')).toEqual([]);
    expect(findUnknownSamples('s("sine")')).toEqual([]);
  });

  it('~ 静音符号不视为 sample', () => {
    expect(findUnknownSamples('s("bd ~ ~ sd")')).toEqual([]);
  });

  it('mini-notation 括号内的 token 正确解析', () => {
    const result = findUnknownSamples('s("[bd sd] ~ [hh <oh ch>]")');
    expect(result).toEqual([]);
  });

  it('不含 s() 调用的代码返回空数组', () => {
    expect(findUnknownSamples('note("c4 e4").gain(0.5)')).toEqual([]);
  });

  it('sound() 别名等同于 s()', () => {
    const result = findUnknownSamples('sound("fakesample")');
    expect(result).toContain('fakesample');
  });
});
```

- [ ] **Step 3：运行测试确认全部通过**

```bash
npm test
```

预期输出：`9 passed`，exit code 0。若有失败，检查 `findUnknownSamples` 的实际 allowlist 内容，调整测试中使用的 sample 名。

- [ ] **Step 4：提交**

```bash
git add src/lib/__tests__/sample-allowlist.test.ts
git commit -m "test: add unit tests for findUnknownSamples"
```

---

## Task 4：为 session-storage 编写测试

**Files:**
- Create: `src/lib/__tests__/session-storage.test.ts`

`session-storage.ts` 依赖 IndexedDB（浏览器 API），在 Node 环境下不可用，会触发内存 fallback（`memoryFallback = true`）。测试只覆盖 fallback 路径，不 mock IndexedDB。

- [ ] **Step 1：创建测试文件**

```ts
// src/lib/__tests__/session-storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('session-storage fallback 路径', () => {
  // 在 Node 环境中 IndexedDB 不存在，openDB() 会触发 fallback，
  // 之后所有写操作静默忽略，读操作返回空数组。

  beforeEach(async () => {
    // 每次测试重新 import，确保模块状态干净
    // vitest 默认不隔离模块，用 vi.resetModules 确保 memoryFallback 重置
    const { vi } = await import('vitest');
    vi.resetModules();
  });

  it('openDB 在 Node 环境下不抛错（触发 fallback）', async () => {
    const { openDB } = await import('../session-storage');
    await expect(openDB()).resolves.toBeUndefined();
  });

  it('openDB 后 getAllSessions 返回空数组', async () => {
    const { openDB, getAllSessions } = await import('../session-storage');
    await openDB();
    const sessions = await getAllSessions();
    expect(sessions).toEqual([]);
  });

  it('putSession 在 fallback 模式下静默忽略不抛错', async () => {
    const { openDB, putSession } = await import('../session-storage');
    await openDB();
    const fakeSession = {
      id: 'test-id',
      title: 'Test',
      messages: [],
      code: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await expect(putSession(fakeSession)).resolves.toBeUndefined();
  });

  it('deleteSession 在 fallback 模式下静默忽略不抛错', async () => {
    const { openDB, deleteSession } = await import('../session-storage');
    await openDB();
    await expect(deleteSession('nonexistent-id')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2：运行测试确认全部通过**

```bash
npm test
```

预期输出：`13 passed`（9 个 sample-allowlist + 4 个 session-storage），exit code 0。

若 `session-storage` 测试中 import 路径报错，检查 `src/lib/session-storage.ts` 是否导出了 `openDB`、`getAllSessions`、`putSession`、`deleteSession`。

- [ ] **Step 3：提交**

```bash
git add src/lib/__tests__/session-storage.test.ts
git commit -m "test: add unit tests for session-storage fallback paths"
```

---

## Task 5：安装 husky + lint-staged

**Files:**
- Modify: `package.json`

- [ ] **Step 1：安装 husky 和 lint-staged**

```bash
npm install --save-dev husky@^9 lint-staged@^15
```

- [ ] **Step 2：初始化 husky**

```bash
npx husky init
```

这会创建 `.husky/pre-commit`（内容为 `npm test`）并在 `package.json` 加入 `"prepare": "husky"`。

- [ ] **Step 3：验证 prepare 脚本已写入 package.json**

```bash
grep '"prepare"' package.json
```

预期输出：`"prepare": "husky"`

- [ ] **Step 4：在 package.json 加入 lint-staged 配置**

在 `package.json` 顶层（与 `"scripts"` 同级）加入：

```json
"lint-staged": {
  "*.{ts,tsx}": ["eslint --max-warnings=0"]
}
```

- [ ] **Step 5：提交（此时 hook 尚未配置完整，先 --no-verify）**

```bash
git add package.json package-lock.json .husky/
git commit --no-verify -m "chore: add husky and lint-staged"
```

---

## Task 6：配置 pre-commit hook

**Files:**
- Modify: `.husky/pre-commit`

- [ ] **Step 1：覆写 .husky/pre-commit**

将 `.husky/pre-commit` 的内容替换为：

```sh
#!/bin/sh
npx tsc --noEmit -p tsconfig.app.json
npx lint-staged
npm test
```

- [ ] **Step 2：确认文件有执行权限**

```bash
ls -la .husky/pre-commit
```

预期输出：权限位包含 `x`（如 `-rwxr-xr-x`）。若没有：

```bash
chmod +x .husky/pre-commit
```

- [ ] **Step 3：做一次空提交验证 hook 运行正常**

```bash
git commit --allow-empty -m "test: verify pre-commit hook"
```

预期：hook 运行 tsc、lint-staged、vitest，全部通过后提交成功。若 hook 失败，根据报错信息修复后重试。

- [ ] **Step 4：提交 hook 文件**

```bash
git add .husky/pre-commit
git commit -m "chore: configure pre-commit hook (tsc + lint-staged + vitest)"
```

---

## Task 7：更新 copilot-instructions.md 的代码质量门禁说明

**Files:**
- Modify: `.github/copilot-instructions.md`

- [ ] **Step 1：将代码质量门禁部分更新**

找到文件中「代码质量门禁」章节，将原内容：

```markdown
## 代码质量门禁

在提交或提 PR 前，以下命令必须全部通过：

```bash
npm run lint        # ESLint —— 包含 no-restricted-imports 等规则
npx tsc --noEmit -p tsconfig.app.json   # TypeScript 类型检查
```
```

替换为：

```markdown
## 代码质量门禁

以下检查已通过 husky pre-commit hook **自动强制**，每次 `git commit` 时运行：

```bash
npx tsc --noEmit -p tsconfig.app.json   # TypeScript 类型检查（strict 模式）
npm run lint                             # ESLint（仅变更文件）
npm test                                 # Vitest 单元测试
```

如需手动运行：
```bash
npm run lint && npx tsc --noEmit -p tsconfig.app.json && npm test
```
```

- [ ] **Step 2：提交**

```bash
git add .github/copilot-instructions.md
git commit -m "docs: update quality gate docs to reflect husky automation"
```

---

## 自检

**Spec 覆盖：**
- ✅ 防线一（strict）→ Task 1
- ✅ 防线二（Vitest + 测试文件）→ Task 2、3、4
- ✅ 防线三（husky + lint-staged）→ Task 5、6
- ✅ 文档同步 → Task 7

**Placeholder 扫描：** 无 TBD/TODO，所有步骤含完整命令和代码。

**类型一致性：** `Session` 类型在 Task 4 的 `putSession` 调用中手写了 inline 对象，与 `src/hooks/useSessions.ts` 中定义的结构一致（id/title/messages/code/createdAt/updatedAt）。若字段不匹配，TypeScript 会在测试编译时报错。
