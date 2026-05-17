# oddeNova — AI Coding Instructions

这份文件是给 GitHub Copilot、Claude、Cursor 等 AI 编码助手的项目级规范。
修改前请先读完本文件；提交代码前请确认改动符合以下所有约定。

## 目录

- [技术栈](#技术栈)
- [导入规范](#导入规范)
- [AudioContext 管理](#audiocontext-管理)
- [代码质量门禁](#代码质量门禁)
- [Agent 测试维护](#agent-测试维护)
- [提示词版本管理](#提示词版本管理)

---

## 技术栈

- **框架**：React 18 + TypeScript（严格模式）
- **构建**：Vite 8 / Electron
- **音频引擎**：[strudel](https://strudel.cc/) + [superdough](https://www.npmjs.com/package/superdough)
- **Lint**：ESLint（见 `eslint.config.js`）；所有改动必须通过 `npm run lint`

---

## 重要：superdough / strudel 包的导入规范

### 规则：只从包根导入，禁止深路径导入

```ts
// ✅ 正确
import { superdough, getAudioContext, setAudioContext } from 'superdough';

// ❌ 错误 —— 会在运行时静默失败
import { SuperdoughAudioController } from 'superdough/superdoughoutput.mjs';
import { clearNodePools } from 'superdough/nodePools.mjs';
```

ESLint 规则 `no-restricted-imports` 已在 `eslint.config.js` 中配置，任何 `superdough/*` 深路径导入都会 **lint error** 阻断。

### 为什么？

`superdough` 的 `main` 是预打包的 `dist/index.mjs`，其内部持有 **模块级单例**：

```js
let audioContext;             // audioContext.mjs
let controller;               // superdough.mjs
```

从 `'superdough'`（bundled）导入时，所有 `setAudioContext(ctx)` / `setSuperdoughAudioController(...)` 修改的是同一份单例。

从 `'superdough/superdoughoutput.mjs'`（源文件）导入时，会载入**另一份独立的模块图**，其中的 `audioContext` 变量永远不会被 bundled 的 setter 更新。当这份独立模块图里的代码（如 `effectSend → gainNode → getAudioContext()`）运行时，会 fallback 到 `new AudioContext()`，产生一个游离的 live AudioContext，再连接到 OfflineAudioContext 的节点上，抛出：

```
InvalidAccessError: cannot connect to an AudioNode belonging to a different audio context.
```

用户可见症状：导出的 WAV **缺失 delay/room 效果**，与实时播放听到的声音不一致。

### AudioContext 切换时的正确姿势（WAV 导出）

```ts
// 关闭 live ctx
await liveCtx.close();

// 切换到 offline ctx，走 bundled setter
setAudioContext(offlineCtx);

// 传 null 让 getSuperdoughAudioController() 在 bundled 内部懒构造
// 新 controller，而不是从源文件 new SuperdoughAudioController(offlineCtx)
setSuperdoughAudioController(null);

await initAudio({ maxPolyphony: 1024, multiChannelOrbits: false });
```

---

## 通用模块导入原则

- **对任何有模块级可变状态的 npm 包，都只从包根导入**。判断标准：包内如果有 `let xxx; export function setXxx(v) { xxx = v; }` 这类 setter，从子路径导入就会带出一份独立的模块状态，破坏单例假设。
- 需要一个包内部未导出的符号时，优先提 PR 请上游导出它，而不是绕过去深引。
- `@strudel/*` 系列包同理。

---

## AudioContext 管理约定

- **不要** 在组件或 service 里直接 `new AudioContext()`；统一走 `superdough` 提供的 `getAudioContext()` / `setAudioContext()`。
- **不要** 缓存 `AudioContext` 实例到 React state 或组件本地变量；它是单例，走 superdough 获取即可。
- WAV 导出结束后必须重建 live ctx（调用 `rebuildMasterChain()`）并恢复 soundfonts。

---

## 代码质量门禁

以下检查已通过 husky pre-commit hook **自动强制**，每次 `git commit` 时运行：

```bash
npx tsc --noEmit -p tsconfig.app.json   # TypeScript 类型检查（strict 模式）
npm run lint                             # ESLint（仅变更文件，via lint-staged）
npm test                                 # Vitest 单元测试
```

如需手动运行全量检查：

```bash
npm run lint && npx tsc --noEmit -p tsconfig.app.json && npm test
```

### Agent 测试维护约定

- 修改 `src/agent/parser.ts` 或 `tools.ts` 中任何函数 / handler 的行为，必须在**同一次提交**中同步更新 `src/agent/__tests__/` 下对应的测试
- `validate` / `improvise` tool 依赖浏览器 API（AudioContext），**不写单元测试**
- 测试写法参考现有文件，使用 `getHandler` + `makeCtx` 模式（见 `src/agent/__tests__/tools.test.ts`）

---

## 提示词版本管理规范

- **禁止**直接编辑 `src/prompts/system-prompt.ts`（这是转发 shim，不含实际内容）
- **禁止**修改已有版本文件 `src/prompts/versions/v*.ts`（版本只增不改）
- 修改提示词时，请使用 `@edit-system-prompt`（VS Code prompt 文件，位于 `.github/prompts/`）获取完整操作规程
