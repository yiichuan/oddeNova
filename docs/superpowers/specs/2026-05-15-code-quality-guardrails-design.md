# 代码质量防线设计

**日期**：2026-05-15  
**背景**：`soundfont-loader.ts` 中 `getParamADSR(node.gain, ...)` 使用了 `AudioNode.connect()` 的返回值（类型为 `AudioNode`）而非 `GainNode`，导致 ADSR 包络参数传入 `undefined`，GM 乐器音色无 Attack/Release 效果。该 bug 在 TypeScript 非 strict 模式下静默通过，没有任何报错或警告。

**目标**：建立三层防线，使同类型的「运行时静默失败」bug 在编写阶段或提交阶段被拦截，不再依赖 code review 发现。

---

## 防线一：TypeScript Strict 模式

### 改动
`tsconfig.app.json` 新增：
```json
"strict": true
```

### 效果
激活以下子选项：
- `strictNullChecks`：空值不能隐式赋给非空类型
- `noImplicitAny`：禁止隐式 `any`
- `strictFunctionTypes`：函数参数协变/逆变检查

对本次 bug 的直接覆盖：`AudioNode.connect()` 返回 `AudioNode`，`AudioNode` 没有 `.gain` 属性，strict 下编译器会报 `Property 'gain' does not exist on type 'AudioNode'`，IDE 实时标红。

### 迁移成本
实测当前 `src/` 在 strict 下新增 **0 个错误**，可直接开启，无需修改源码。

---

## 防线二：Vitest 单元测试

### 范围
只覆盖 `src/lib/` 下的纯逻辑文件（不依赖浏览器运行时）：

| 文件 | 测试内容 |
|------|----------|
| `sample-allowlist.ts` | `findUnknownSamples()` 对合法/非法 sample 名的判断 |
| `session-storage.ts` | `getAllSessions`/`saveSession`/`deleteSession` 的内存 fallback 路径；损坏 JSON 边界值 |

**不覆盖**：`soundfont-loader.ts`、`strudel.ts`、`speech.ts`——依赖 Web Audio API / 浏览器环境，不引入 mock，避免维护负担。

### 新增文件
- `vitest.config.ts`（environment: `node`）
- `src/lib/__tests__/sample-allowlist.test.ts`
- `src/lib/__tests__/session-storage.test.ts`

### package.json 改动
```json
"scripts": {
  "test": "vitest run"
}
```

```json
"devDependencies": {
  "vitest": "^2.x"
}
```

---

## 防线三：Pre-commit Hook（husky + lint-staged）

### 触发链
```
git commit
  └── husky pre-commit
        ├── tsc --noEmit -p tsconfig.app.json   ← 全量类型检查
        ├── eslint (lint-staged)                 ← 仅检查本次变更文件
        └── vitest run                           ← 全量测试
```

### 设计决策
- **lint-staged** 只扫 ESLint，不做增量 tsc（tsc 不支持增量 + noEmit 的可靠组合）
- `tsc` 和 `vitest` 全量跑，耗时在秒级，可接受
- 不提供 `--no-verify` 文档或捷径——hook 拦住说明有问题

### 新增文件
- `.husky/pre-commit`
- `package.json` 新增 `"prepare": "husky"` 和 `lint-staged` 配置块

### 配置示例
```json
// package.json
"lint-staged": {
  "*.{ts,tsx}": ["eslint --max-warnings=0"]
}
```

```sh
# .husky/pre-commit
npx tsc --noEmit -p tsconfig.app.json
npx lint-staged
npm test
```

---

## 与现有门禁的关系

当前 [copilot-instructions.md](../../.github/copilot-instructions.md) 已要求提交前运行：
```bash
npm run lint
npx tsc --noEmit -p tsconfig.app.json
```

本设计将这两条从「约定」升级为「自动强制」，并补充 `npm test`。

---

## 不在范围内

- Web Audio API 的 mock 测试（维护成本过高）
- CI/CD pipeline（项目当前无 GitHub Actions，可后续按需添加）
- pre-push hook（pre-commit 已足够，不做重复门禁）
