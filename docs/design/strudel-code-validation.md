# Strudel 代码校验流程

`validate` tool 在 LLM 调用时执行以下流程。所有步骤均**不触发音频**（无 AudioContext 依赖）。

---

## 流程总览

```
输入代码
  │
  ▼
[Step 1] fixMiniNotationIssues()   ← 自动修复，就地更新 ctx.state.code
  │
  ▼
[Step 2] validateCodeRuntime()     ← JS 语法检查（引擎未就绪）或
  │                                   Proxy dry-run + sample 白名单（引擎就绪），失败即返回
  ▼
[Step 3] validateCodeTranspiler()  ← Mini-notation parse 检查，失败即返回
  │
  ▼
通过 → { ok: true }
```

---

## Step 1 — Mini-notation 自动修复 (`fixMiniNotationIssues`)

**时机**：校验开始前，对原始代码执行。

**能发现并自动修复的问题**：

修复内容（当前支持 2 项）：

| 问题 | 示例 | 修复结果 |
|---|---|---|
| `<>` 内含 `;`（分号作和弦分隔符无效） | `note("<c4 eb4; g4 bb4>/4")` | `note("<[c4,eb4] [g4,bb4]>/4")` |
| `<>` 未闭合（缺少 `>`） | `note("<c4 eb4")` | 补全缺失的 `>` |

- 若有修复：`ctx.state.code` **就地更新**为修复后的代码，并在返回值 `data.autoFixed` 中列出修复描述。
- 后续校验步骤均使用修复后的代码。

---

## Step 2 — 运行时沙箱检查 (`validateCodeRuntime`)

入口统一执行 `normalizeCode(stripUIDecorations(code))`，然后根据引擎状态走不同路径：

### 引擎未就绪（`!strudelService.isReady`）— 退化为 JS 语法检查

**核心**：`new Function(clean)`

**能发现的问题**：

- JS 语法错误（括号不匹配、非法 token、`Unterminated string constant` 等）
- 空代码

预处理：
- `normalizeCode()`：折叠单/双引号字符串内的换行（LLM 常写多行字符串导致 `Unterminated string constant`），模板字面量（反引号）保持原样。
- `stripUIDecorations()`：剥掉 `._scope()`、`._pianoroll()` 等 UI 装饰方法。

失败返回：`{ ok: false, error: "语法错误: <SyntaxError message>", kind: "syntax" }`

### 引擎就绪 — Proxy dry-run + sample 白名单

**能发现的问题**：

- TidalCycles 专有 API 幻觉调用（如 `by`、`sometimesBy`、`someCyclesBy`、`within`）——这些在 Strudel 中不存在
- 任何未在全局注册的符号（strudel 未导出的函数名、拼写错误的 API 名等）
- 使用了不在白名单中的 sample 名（幻觉 sample）

**两层检查**：

#### 2a. Proxy dry-run（幻觉 API 检测）

用 `new Proxy` 拦截所有全局变量访问：
- 全局有定义的符号（strudel API、JS 内置等）→ 正常返回。
- 全局没有的符号 → 抛 `ReferenceError`。

预处理：在 normalized 代码基础上额外去掉顶层 `setcps()` 行以避免误报。

#### 2b. Sample 白名单检查 (`findUnknownSamples`)

dry-run 通过后，扫描所有 `s("…")` / `sound("…")` 调用中的 sample token：
- 对照 `SAMPLE_ALLOWLIST`（已知合法 sample 名）和 `BUILTIN_SYNTHS`（内置合成器名）。
- `.bank("BankName")` 与裸后缀组合时，额外验证 `BankName_suffix` 是否合法。
- 未知 token 全部收集后一次性报错。

失败返回：`{ ok: false, error: "运行时错误: <message>（请勿使用 TidalCycles 专有 API…）", kind: "runtime" }`

---

## Step 3 — Transpiler Mini-notation 解析检查 (`validateCodeTranspiler`)

**前置**：`cachedTranspiler` 在 `attach()` 时从 `@strudel/transpiler` 懒加载并缓存，首次调用前返回 `ok: true`（跳过）。

**能发现的问题**（Proxy dry-run 无法发现的 mini-notation 语法错误）：

- mini-notation 字符串内的未闭合方括号
- `|` 写在 `<>` 内（`<>` 只做交替，不支持随机选择符）
- 其他 `mini2ast` 解析器报出的语法错误

| 典型错误 | 示例 |
|---|---|
| 未闭合方括号 | `s("bd [sd")` |
| `\|` 在 `<>` 内（无效随机选择符） | `n("<0 2 \| 4 3>/2")` |

**仅上报带 `[mini]` 前缀的错误**（由 `mini2ast` 发出），其余 transpiler 错误（acorn JS parse、未注册插件等）视为误报放行，不影响校验结果。

失败返回：`{ ok: false, error: "Mini-notation 错误: [mini] parse error at line N: …" }`

---

## 注意事项

- **`|` in `<>` 的覆盖**：同时被 Step 3（transpiler）捕捉，但不自动修复——需 LLM 根据意图选择修复方式（`<[A B] [C D]>` 交替 vs `[A B | C D]` 随机选择）。
- **Step 2 引擎未就绪时退化**：若 strudel 引擎未完成初始化，只做 JS 语法检查，幻觉 API / sample 错误此时无法检测。
- **Step 3 依赖 transpiler 缓存**：首次 `attach()` 前调用时直接放行，mini-notation 语法错误此时无法检测。
