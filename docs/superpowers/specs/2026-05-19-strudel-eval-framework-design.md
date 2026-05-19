# Strudel 代码生成效果评测框架 — 设计文档

**日期**: 2026-05-19  
**状态**: 已批准，待实现

---

## 背景与目标

现有的 `scripts/run-agent-testcases.ts` 能批量跑 18 个测试用例并把生成代码存入 markdown，但没有打分机制——只能人工阅读输出，无法量化"prompt/agent 升级后效果是否改善"。

本框架目标：
1. 对每次运行的生成结果自动打分（客观规则分 + 主观 LLM judge 分）
2. 将结果存入历史快照，支持跨版本趋势追踪
3. 覆盖单轮用例（18 个）和多轮对话用例（9 个）

---

## 目录结构

```
scripts/eval/
  runner.ts              # CLI 入口
  evaluator.ts           # 混合评分引擎
  report.ts              # 历史对比报告
  test-cases/
    single-turn.ts       # 18 个单轮用例
    multi-turn.ts        # 9 个多轮对话用例
  history/               # git 追踪的历史快照（不应被 .gitignore 忽略）
    .gitkeep
```

---

## 数据模型

### 测试用例

```ts
// 单轮用例（与现有 18 条兼容）
interface SingleTurnCase {
  id: string;                   // "TC-001"
  name: string;
  category: string;             // "风格/情绪类" | "技术细节类" | ...
  prompt: string;
  expectedDimensions: string[]; // 人工标注的期望维度，供 judge 参考
}

// 多轮用例
interface MultiTurnCase {
  id: string;           // "MT-A-001"
  name: string;
  type: 'progressive' | 'style-transfer' | 'fuzzy-feedback';
  turns: Array<{
    userMessage: string;
    checkpoints?: string[]; // 可选：本轮的期望行为描述（供 judge 使用）
  }>;
}
```

### 运行结果

```ts
// 单次完整运行的快照，写入 history/YYYY-MM-DD-<label>.json
interface EvalSnapshot {
  label: string;         // "v2"
  timestamp: string;     // ISO 8601
  promptVersion: string; // 从 src/prompts/active.ts 读取
  results: CaseResult[];
  summary: {
    totalCases: number;
    avgRuleScore: number;   // 0-100
    avgJudgeScore: number;  // 0-10
    syntaxPassRate: number; // 0-1
  };
}

interface CaseResult {
  caseId: string;
  caseName: string;
  caseType: 'single' | 'multi';
  turns: TurnResult[];     // 单轮用例只有 1 个元素
  ruleScore: RuleScore;
  judgeScore: JudgeScore;
}

interface TurnResult {
  userMessage: string;
  generatedCode: string;
  explanation: string;
  durationMs: number;
}
```

---

## 评分系统

### 规则层（RuleScore，0-100 分，客观、确定性）

静态分析最终生成代码，每项检查独立计分：

| 检查项 | 分值 | 检测方法 |
|--------|------|----------|
| JS 语法通过 | 20 | `new Function(code)` 不抛出 |
| 有 setcps / BPM 设置 | 10 | 正则查找 `setcps(...)` |
| 层数 ≥ 2 | 10 | `parseScore()` 统计层数 |
| bass 层有 `.lpf(≤500)` | 10 | 提取 bass 层代码，检查 lpf 数值 |
| pad/atmosphere 层有 `.room` 或 `.delay` | 10 | 检查 pad 层代码 |
| hh/fx 层 `.gain ≤ 0.5` | 10 | 提取 gain 数值 |
| ≥4 层时有呼吸空间（含 mask/struct/sometimes） | 10 | 关键词扫描 |
| 无 Tidal-only API（sometimesBy/within 等） | 10 | 黑名单扫描 |
| 无 setcps 出现在层代码内部 | 10 | 层内代码扫描 |

满分 100。

**多轮用例额外规则检查**（叠加到每轮的规则分）：
- 每轮检查：未被用户提及的层是否在下一轮输出中仍然存在（防止 agent 无故清空）

```ts
interface RuleScore {
  total: number;           // 0-100
  breakdown: Record<string, { pass: boolean; score: number; detail?: string }>;
  // 多轮专属
  layerPreservationScore?: number; // 0-10，每轮保留未提及层的比例
}
```

### LLM Judge 层（JudgeScore，0-10 分，主观）

将 `[用户 prompt, 最终生成代码]` 发给独立的 judge LLM（使用与 agent 相同的 Anthropic 客户端），按 5 个维度各给 0-2 分：

| 维度 | 描述 |
|------|------|
| **风格匹配** | 生成结果是否贴合 prompt 描述的音乐风格/情绪 |
| **层次完整性** | 是否有合理的鼓/律动骨架，而非全由 pad 堆砌 |
| **音乐多样性** | 各层在密度、节奏、频率区间上是否有对比和差异 |
| **参数精确性** | 用户明确指定的参数（BPM、和弦、乐器）是否准确落地 |
| **创意表达** | 是否有让音乐"活"起来的调制（perlin/sine/mask/off 等） |

Judge 返回严格 JSON：
```json
{
  "style_match": { "score": 2, "reason": "..." },
  "layer_completeness": { "score": 1, "reason": "..." },
  "musical_diversity": { "score": 2, "reason": "..." },
  "parameter_accuracy": { "score": 2, "reason": "..." },
  "creative_expression": { "score": 1, "reason": "..." },
  "total": 8
}
```

**多轮用例的 judge** 额外读取完整对话历史，评估两个额外维度（各 0-2 分，纳入 total）：
- **修改精准性**：是否只改了用户要求的地方，未提及的层保持不变
- **意图理解**：对模糊反馈（"太吵了"/"旋律太平"）的理解是否合理

```ts
interface JudgeScore {
  total: number;         // 0-10（多轮原始最高 14，归一化公式：Math.round(rawTotal / 14 * 100) / 10）
  breakdown: Record<string, { score: number; reason: string }>;
  rawResponse: string;   // 原始 judge 输出，便于 debug
}
```

---

## 多轮用例集（共 9 个）

### A. 渐进式编辑（progressive）

```
MT-A-001: 基础生成 → 加旋律层 → 换鼓音色
  turn1: "来一段 lofi 风格的音乐"
  turn2: "加一条飘的旋律层"
  turn3: "把鼓换成 909 音色"
  checkpoints: [
    null,
    "旋律层应当被添加，其余层保留",
    "鼓层音色应变为 909，旋律层和贝斯层应保留"
  ]

MT-A-002: 基础生成 → 降 BPM → 给 pad 加混响
  turn1: "来一段 house 风格的音乐"
  turn2: "BPM 降到 100"
  turn3: "给 pad 层加更多混响"

MT-A-003: 基础生成 → 移除旋律层 → 调整鼓的音量
  turn1: "做一段四层的 techno：鼓、hh、贝斯、旋律"
  turn2: "把旋律层去掉"
  turn3: "鼓的音量再大一点"
```

### B. 风格迁移（style-transfer）

```
MT-B-001: lofi → techno
  turn1: "来一段 lofi 风格的音乐"
  turn2: "改成 techno 感觉"

MT-B-002: ambient → house
  turn1: "做一段安静的 ambient 音乐"
  turn2: "改成 house 风格，加入四四拍鼓"

MT-B-003: jazz → trap
  turn1: "做一段 jazz 风格的音乐，有钢琴和贝斯"
  turn2: "改成 trap 风格，保留贝斯但换成 808"
```

### C. 模糊反馈（fuzzy-feedback）

```
MT-C-001: 音量/密度问题
  turn1: "来一段电子音乐"
  turn2: "感觉太吵了，能安静一点吗"

MT-C-002: 旋律缺乏变化
  turn1: "来一段带旋律的 lofi 音乐"
  turn2: "旋律太平了，缺少变化"

MT-C-003: 低音过重
  turn1: "做一段有厚重低音的音乐"
  turn2: "低音太重了，压住其他层了"
```

---

## Runner CLI

```bash
# 全量评测，打 label 存快照到 scripts/eval/history/
npx tsx scripts/eval/runner.ts --label v2

# 只跑单轮用例（快速验证，不跑多轮）
npx tsx scripts/eval/runner.ts --label v2 --only single

# 只跑多轮用例
npx tsx scripts/eval/runner.ts --label v2 --only multi

# 只跑指定用例
npx tsx scripts/eval/runner.ts --label v2 --case TC-001,MT-A-001

# 跳过 LLM judge（只出规则分，省 token）
npx tsx scripts/eval/runner.ts --label v2 --no-judge

# 对比两个历史快照，输出 diff 报告
npx tsx scripts/eval/report.ts --compare v1 v2
```

**report 输出示例**：
```
版本对比: v1 → v2
─────────────────────────────────
规则分:    72.3 → 78.1  (+5.8 ↑)
Judge分:   6.2  → 7.0   (+0.8 ↑)
语法通过率: 94%  → 100%  (+6%  ↑)
─────────────────────────────────
退步用例 (2):
  TC-009 场景-千与千寻  judge: 7→5  (-2)
    "风格匹配": 2→1 — "生成结果偏向 ambient 而非轻音乐意象"
  MT-B-002 风格迁移-ambient→house  rule: 80→70 (-10)
    "pad层缺少 .room" 检查失败

进步用例 (5):
  MT-C-002 模糊反馈-旋律  rule: 60→90 (+30)
  TC-013 技术-Minimal Techno  judge: 5→8 (+3)
  ...
```

---

## 依赖与约束

- **运行环境**：Node.js，`npx tsx` 执行，与现有 runner 保持一致
- **LLM 客户端**：复用项目已有的 Anthropic 配置（`VITE_API_KEY` / `VITE_BASE_URL`）
- **历史文件**：`scripts/eval/history/*.json` 加入 git 追踪，不加入 `.gitignore`
- **不修改现有文件**：`scripts/run-agent-testcases.ts` 保持不动；评测框架完全独立
- **agent 逻辑复用**：`parseScore`/`summariseScore` 等纯函数直接从 `src/agent/parser.ts` 导入（无浏览器依赖）；agent loop 逻辑参照现有 `scripts/run-agent-testcases.ts` 的内联模式，不引用 `src/agent/loop.ts`（后者依赖浏览器端的 `validateCodeRuntime`）

---

## 不在本次范围内

- CI/CD 集成（后续可按需添加）
- Web 可视化趋势图
- 并行跑用例（当前串行，避免 rate limit）
