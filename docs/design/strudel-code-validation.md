# Strudel 代码校验流程

`validate` tool 在 LLM 调用时执行以下流程。所有步骤均**不触发音频**（无 AudioContext 依赖）。

---

## 流程总览

```
输入代码
  │
  ▼
[Step 1] validateCodeRuntime()     ← Proxy dry-run + sample 白名单，失败即返回
  │
  ▼
[Step 2] validateCodeTranspiler()  ← Mini-notation parse 检查，失败即返回
  │
  ▼
通过 → { ok: true }
```

---

## Step 1 — 运行时沙箱检查 (`validateCodeRuntime`)

入口执行 `normalizeCode(stripUIDecorations(code))`，然后进行 Proxy dry-run + sample 白名单检查。

> 前提：调用方（`App.tsx` `handleInstruction`）已通过 `engineReady` guard，保证引擎就绪。

预处理：
- `normalizeCode()`：折叠单/双引号字符串内的换行（LLM 常写多行字符串导致 `Unterminated string constant`），模板字面量（反引号）保持原样。
- `stripUIDecorations()`：剥掉 `._scope()`、`._pianoroll()` 等 UI 装饰方法。

### Proxy dry-run + sample 白名单

**能发现的问题**：

- TidalCycles 专有 API 幻觉调用（如 `by`、`sometimesBy`、`someCyclesBy`、`within`）——这些在 Strudel 中不存在
- 任何未在全局注册的符号（strudel 未导出的函数名、拼写错误的 API 名等）
- 使用了不在白名单中的 sample 名（幻觉 sample）

**两层检查**：

#### 1a. Proxy dry-run（幻觉 API 检测）

用 `new Proxy` 拦截所有全局变量访问：
- 全局有定义的符号（strudel API、JS 内置等）→ 正常返回。
- 全局没有的符号 → 抛 `ReferenceError`。

预处理：在 normalized 代码基础上额外去掉顶层 `setcps()` 行以避免误报。

#### 1b. Sample 白名单检查 (`findUnknownSamples`)

dry-run 通过后，扫描所有 `s("…")` / `sound("…")` 调用中的 sample token：
- 对照 `SAMPLE_ALLOWLIST`（已知合法 sample 名）和 `BUILTIN_SYNTHS`（内置合成器名）。
- `.bank("BankName")` 与裸后缀组合时，额外验证 `BankName_suffix` 是否合法。
- 未知 token 全部收集后一次性报错。

失败返回：`{ ok: false, error: "运行时错误: <message>（请勿使用 TidalCycles 专有 API…）", kind: "runtime" }`

---

## Step 2 — Transpiler Mini-notation 解析检查 (`validateCodeTranspiler`)

**前置**：`cachedTranspiler` 在 `attach()` 时从 `@strudel/transpiler` 懒加载并缓存，首次调用前返回 `ok: true`（跳过）。

**能发现的问题**（Proxy dry-run 无法发现的 mini-notation 语法错误）：

- mini-notation 字符串内的未闭合方括号
- `;` 写在 `<>` 内（分号不是合法迷你记谱法）
- `|` 写在 `<>` 内（`<>` 只做交替，不支持随机选择符）
- 其他 `mini2ast` 解析器报出的语法错误

| 典型错误 | 示例 |
|---|---|
| 未闭合方括号 | `s("bd [sd")` |
| `;` 在 `<>` 内（无效分隔符） | `note("<c4 eb4; g4 bb4>/4")` |
| `\|` 在 `<>` 内（无效随机选择符） | `n("<0 2 \| 4 3>/2")` |

**仅上报带 `[mini]` 前缀的错误**（由 `mini2ast` 发出），其余 transpiler 错误（acorn JS parse、未注册插件等）视为误报放行，不影响校验结果。

失败返回：`{ ok: false, error: "Mini-notation 错误: [mini] parse error at line N: …" }`

---

## validate 结果的后续处理（Agent Loop）

`validate` 的返回值被 agent loop（`src/agent/loop.ts`）统一处理，流程如下：

### 成功（`ok: true`）

tool 结果以 `{ ok: true, valid: true }` 序列化写入 `messages`，交给下一轮 LLM 推理。ChatPanel 显示 ✓ "语法校验通过"（`tool_result` + `ok: true` + name 为 `validate` 时才显示）。

### 失败（`ok: false`）

1. Loop 将错误以 `{ ok: false, error: "..." }` 写入 `messages`，同时在 `console.error` 中打印当前 `ctx.state.code`（便于调试定位是哪段代码触发了错误）。
2. ChatPanel 显示 ✗ "{validate} 失败: {error}"。
3. LLM 收到失败结果后，**自主决定下一步**：通常会修改代码（`replaceLayer` / 直接改写）并再次调用 `validate`，直到通过或达到 `max_iter=8` 安全上限退出。
4. `;` in `<>` 、`|` in `<>` 等需要语义判断的错误**不会自动修复**，由 LLM 根据报错信息和创作意图自行选择修复方式。

### 重要约束

- **不触发 commit**：`validate` 失败不会自动终止 loop，也不会回退 `ctx.state.code`；代码状态保持失败前最后一次编辑的结果，LLM 可在此基础上修复。
- **重试上限**：单个 tool 调用异常时最多重试 2 次（executor 层），但 `validate` 本身不抛异常，其失败属于正常工具返回，不消耗重试次数，LLM 可多次调用。

---

## 注意事项

- **`|` in `<>` 的处理**：被 Step 2（transpiler）捕捉，不自动修复——需 LLM 根据意图选择修复方式（`<[A B] [C D]>` 交替 vs `[A B | C D]` 随机选择）。
- **`;` in `<>` 的处理**：被 Step 2（transpiler）捕捉，不自动修复——需 LLM 将 `<c4 eb4; g4 bb4>` 改写为 `<[c4,eb4] [g4,bb4]>` 等正确形式。
- **Step 2 依赖 transpiler 缓存**：首次 `attach()` 前调用时直接放行，mini-notation 语法错误此时无法检测。
