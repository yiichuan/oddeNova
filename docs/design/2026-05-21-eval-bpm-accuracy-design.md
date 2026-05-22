# 评估器 BPM 准确性修正设计

**日期**: 2026-05-21  
**背景**: baseline 评测（20260519-baseline）中，LLM judge 系统性地使用 `cps × 60 = BPM` 的错误公式，导致 TC-008、TC-009、MT-B-001 等用例的 `parameter_accuracy` 维度出现 false negative——agent 实际上算对了 BPM（`setcps(0.5) = 120 BPM`），但 judge 却记为错误。

---

## 问题根因

Strudel 的 `setcps(x)` 表示每秒循环数（cycles per second）。在 4/4 拍下，一个循环等于一个小节（4 拍），因此：

$$\text{BPM} = x \times 4 \times 60 = x \times 240$$

Agent 工具 `setTempo({ bpm })` 使用正确公式 `cps = bpm / 240`。  
Judge LLM 错误地使用 `cps × 60 = BPM`，导致系统性误判。

---

## 方案选择

| 方案 | 描述 | 结论 |
|------|------|------|
| 只修 Judge prompt | 注入公式，让 LLM 自行换算 | 仍依赖 LLM，可能漂移 |
| **规则层 + Judge prompt 双修** | 确定性规则替代 LLM 判断 BPM，同时修正 judge | **选用** |
| 规则层 + Judge + 回测脚本 | 加历史数据对比报告 | 可后续补充，不耦合本次 |

---

## 设计

### 1. 规则层：`hasBpm` → `bpmAccuracy`（10 pt，总分上限保持 100）

**函数签名变更**：
```ts
export function scoreRules(code: string, prompts?: string[]): RuleScore
```

**规则逻辑**：

```
bpmAccuracy(code, prompts[]) →
  1. 从所有 prompts 提取目标 BPM（正则 /(\d+)\s*BPM|BPM\s*(\d+)/i，取第一个匹配）
  2. 若无目标 BPM → 降级为"有 setcps 即通过"（兼容无 BPM 约束的用例）
  3. 有目标 BPM → 从 code 提取 setcps(x)，计算 actualBpm = x * 240
     若无 setcps → fail，detail: "未设置 setcps"
     若 |actualBpm - targetBpm| ≤ 5 → pass（10pt）
     否则 → fail（0pt），detail: "期望 {target} BPM，实际 {actual} BPM"
```

**容差**：±5 BPM。理由：agent 做精确浮点换算，误差通常 < 0.5 BPM；±5 能抓住方向性错误（如 120 vs 30），又不会因浮点截断误报。

**多轮用例**：将所有轮的 `userMessage` 合并成数组传入，正则扫描任意一轮中的 BPM 指定即可。

### 2. Judge prompt 修正

在 `SINGLE_JUDGE_PROMPT` 和 `MULTI_JUDGE_PROMPT` 的 `parameter_accuracy` 维度描述前插入：

```
【重要】Strudel BPM 公式：setcps(x) 对应 x × 240 BPM。
例：setcps(0.5) = 120 BPM，setcps(0.375) = 90 BPM，setcps(0.2917) = 70 BPM。
评估 parameter_accuracy 中的 BPM 时，必须用此公式换算，不要用 x×60。
```

### 3. 调用方更新（`runner.ts`）

| 用例类型 | `prompts` 参数值 |
|----------|-----------------|
| 单轮 | `[tc.prompt]` |
| 多轮 | `tc.turns.map(t => t.userMessage)` |

---

## 文件改动清单

| 文件 | 改动描述 |
|------|----------|
| `scripts/eval/evaluator.ts` | `scoreRules()` 签名加 `prompts?: string[]`；`hasBpm` 规则逻辑升级为 `bpmAccuracy`；两个 judge prompt 常量注入 BPM 公式 |
| `scripts/eval/runner.ts` | 单轮/多轮调用 `scoreRules()` 时传入 prompts 数组 |
| `scripts/eval/types.ts` | 无需改动（`breakdown` 键名为字符串，兼容新 key） |

**不涉及**：`src/` 下所有产品代码均不触及。

---

## 预期效果

修正后，以下用例的规则分将从 80pt 提升至 90pt（`bpmAccuracy` 从 0 变 10）：
- **TC-008**（120 BPM）：`setcps(0.5)` → actualBpm=120，通过
- **TC-009**（70 BPM）：`setcps(0.2917)` → actualBpm=70，通过

Judge 误判的 false negative 同步消除（`parameter_accuracy` 维度不再扣分）。
