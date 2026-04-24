# 设计：防止 LLM 生成不支持的采样名

**日期**：2026-04-24  
**状态**：待实施

---

## 问题

LLM 有时会"幻觉"出 Strudel 中不存在的采样名，例如 `superpad`、`rhodes`、`strings`、`violin` 等。Strudel 遇到不存在的采样会静默失败（无声），用户无法感知，也不会收到报错。

当前 `validate` 工具通过 Proxy 沙箱检测未定义的 **JS 标识符**，但采样名是字符串参数（如 `s("superpad")`），无法被现有验证捕获。

---

## 目标

- 在 Agent 循环内部自动拦截并修正非法采样名，用户无感知
- 覆盖全量采样白名单（Dirt-Samples + tidal-drum-machines + 旋律采样）

---

## 方案

两道防线：

1. **Prompt 层（预防）**：在 system-prompt.ts 的 `Before you commit` 质量门里新增一条采样名检查规则，让 LLM 在 commit 前主动自查
2. **validate 工具层（兜底）**：在 `validateCodeRuntime` 执行后，追加采样名白名单检查；发现非法名时返回 `{ ok: false, error: '...' }`，Agent 收到后重新生成

---

## 白名单构成

白名单保存在 `src/lib/sample-allowlist.ts`，导出 `SAMPLE_ALLOWLIST: Set<string>`，包含三类采样名：

1. **旋律采样**（system prompt 规定）：`piano arpy bass moog juno sax gtr pluck sitar stab`
2. **Dirt-Samples 鼓组**（从 `sample_library/strudel.md` `##` 标题提取，约 200 个）
3. **tidal-drum-machines 鼓机**（从 `sample_library/tidal-drum-machines.md` `##` 标题提取，约 500 个，格式如 `RolandTR808_bd`）

合成音源（`sawtooth`、`sine`、`square`、`triangle`）由 Strudel 内建，**不需要**在白名单里，validate 时单独跳过。

---

## 采样名提取逻辑（在 validate 工具中）

从 Strudel 代码里提取 `s("...")` / `sound("...")` 参数中的所有采样名，分三步：

**第一步**：用正则提取所有 `s(...)` / `sound(...)` 的字符串参数内容：
```
/\bs\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g
/\bsound\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g
```

**第二步**：对每个参数字符串剥离 mini-notation 符号：
- 删除 `*N`、`(N,M)`、`:N`、`!N`、`[`、`]`、`<`、`>`、`{`、`}`、`@N`、`?`
- 按空白分词
- 过滤掉 `~`（休止符）和空字符串

**第三步**：对剩余每个 token 做白名单 Set 查找：
- 在白名单中 → 合法，跳过
- 是合成音源（`sawtooth`、`sine`、`square`、`triangle`、`supersaw`）→ 跳过
- 不在白名单中 → 记录为非法名

若发现任何非法名，返回：
```
{ ok: false, error: 'Unknown sample name(s): "superpad". Only use samples from the approved list.' }
```

---

## Prompt 层改动

在 `AGENT_SYSTEM_PROMPT` 的 `## Before you commit (quality gate)` 区块末尾增加一条：

> `- **sample names**: every `s("...")` must use only approved names. Synths (`sawtooth`, `sine`, `square`, `triangle`) are fine. Melodic: `piano arpy bass moog juno sax gtr pluck sitar stab`. Drums: `bd sd hh oh cy cp cb cr` etc. NEVER invent names like "superpad", "rhodes", "strings".`

同时在 `IMPROVISE_SYSTEM_PROMPT` 的约束区块里增加相同提示（因为 improvise 子 LLM 也可能生成幻觉采样）。

---

## 涉及文件

| 文件 | 改动内容 |
|------|---------|
| `src/lib/sample-allowlist.ts` | 新建，导出 `SAMPLE_ALLOWLIST: Set<string>` |
| `src/services/strudel.ts` | `validateCodeRuntime` 函数末尾调用采样名检查逻辑 |
| `src/prompts/system-prompt.ts` | `AGENT_SYSTEM_PROMPT` 的 quality gate 新增一条；`IMPROVISE_SYSTEM_PROMPT` 同步新增 |

`src/agent/tools.ts` 中的 `validate` 工具本身无需改动——它直接调用 `validateCodeRuntime`，返回结果透传给 Agent。

---

## 错误信息格式

```
Unknown sample name(s): "superpad", "rhodes". Only use approved sample names (piano, arpy, bass, bd, sd, hh ...). See the quality gate in your system prompt.
```

错误文本控制在一行内，明确列出非法名，让 Agent 能精准定位并修正。

---

## 不在本设计范围内

- `.bank("...")` 的参数（如 `.bank("RolandTR808")`）不校验，因为 bank 名不是采样名
- Strudel Pattern 方法链里 `.n(...)` / `.note(...)` 的内容不校验
- 含 Strudel 变量或插值（如模板字符串）的 `s(...)` 调用跳过检查
