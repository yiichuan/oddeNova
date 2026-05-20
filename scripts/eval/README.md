# Strudel 代码生成质量评测框架

用于衡量 oddeNova Agent 在 Strudel 音乐代码生成任务上的质量，支持跨 prompt 版本的横向对比，以及人工评审分数的收集与合并。

## 架构概览

```
scripts/eval/
├── runner.ts          # 主 CLI：运行用例 → 评分 → 写快照与审阅文档
├── report.ts          # 报告 CLI：版本对比 / 导入人工评分
├── evaluator.ts       # 评分引擎：规则打分 + LLM Judge
├── agent-runner.ts    # Agent 循环封装（无浏览器依赖）
├── types.ts           # 共享 TypeScript 接口
├── test-cases/
│   ├── single-turn.ts # 18 个单轮测试用例（TC-001 ~ TC-018）
│   └── multi-turn.ts  # 9 个多轮测试用例（MT-A/B/C 各 3 个）
├── history/           # 评测快照 JSON（按 label 保存）
└── review/            # 人工审阅 Markdown（按 label 保存）
```

## 评分体系

### 规则分（0–100）

| 规则 | 分值 | 说明 |
|------|------|------|
| `syntax` | 20 | JavaScript 语法合法，失败则后续全部级联为 0 |
| `hasBpm` | 10 | 包含 `setcps(...)` |
| `layerCount` | 10 | ≥2 层 |
| `bassLpf` | 10 | bass 层有 `.lpf(N≤500)` |
| `padRoom` | 10 | pad/atmo/chord 层有 `.room()` 或 `.delay()` |
| `hhGain` | 10 | hh/hihat 层 `.gain(N≤0.5)` |
| `breathingSpace` | 10 | ≥4 层时，至少一层有 `.mask(` / `.struct(` / `.sometimes(` 等 |
| `noTidalOnly` | 10 | 不使用仅 Tidal 有的 API（如 `sometimesBy`） |
| `noSetcpsInLayers` | 10 | 层内不调用 `setcps` |

### LLM Judge 分（0–10）

调用 Claude 模型对生成代码进行评审：

- **单轮**（5 个维度，各 0–2 分）：`style_match`、`layer_completeness`、`musical_diversity`、`parameter_accuracy`、`creative_expression`
- **多轮**（7 个维度）：以上 5 个 + `edit_precision`、`intent_understanding`，原始分 14 分，归一化为 10 分制

### 层保留分（多轮专属，0–10）

衡量多轮对话中各轮之间 layer 名称的保留程度。

## 快速开始

### 环境配置

在 `scripts/eval/` 目录下创建 `.env` 文件（runner 启动时自动加载，无需手动 export）：

```bash
VITE_API_KEY=sk-ant-xxxxx              # 必填
VITE_BASE_URL=https://timesniper.club  # 可选，默认值
VITE_LLM_MODEL=claude-sonnet-4-6       # 可选，默认值；会被记录在快照的 model 字段中
```

> `.env` 已加入 `.gitignore`，不会提交到仓库。

### 运行评测

```bash
# 运行全部用例（含 LLM Judge）
npm run eval -- --label v2

# 只跑单轮用例，跳过 LLM Judge（快速验证）
npm run eval -- --label v2 --only single --no-judge

# 指定特定用例
npm run eval -- --label v2 --case TC-001,MT-A-001

# 只跑多轮用例
npm run eval -- --label v2 --only multi
```

运行结束后自动生成：
- `scripts/eval/history/<label>.json` — 完整结构化快照
- `scripts/eval/review/<label>.md` — 供人工审阅的 Markdown 文档

### 版本对比

```bash
npm run eval:report -- --compare v1 v2
```

输出规则分、Judge 分、语法通过率的对比，并列出退步用例（规则分下降 >5 或 Judge 分下降 >1）和进步用例。

### 导入人工评分

1. 打开 `scripts/eval/review/<label>.md`
2. 在每个用例的 `**人工评分**: （待填写，1-10）` 处填入数字
3. 运行导入命令：

```bash
npm run eval:report -- --import-human-scores scripts/eval/review/v2.md
```

人工评分将被合并回对应的 `history/<label>.json` 中，字段为 `humanScore.score` 和 `humanScore.note`。

## 测试用例

### 单轮用例（TC-001 ~ TC-018）

| 分类 | 数量 | 用例 |
|------|------|------|
| 自然表达版 | 3 | TC-001 ~ TC-003 |
| 风格/情绪类 | 5 | TC-004 ~ TC-008 |
| 参考场景类 | 4 | TC-009 ~ TC-012 |
| 技术细节类 | 3 | TC-013 ~ TC-015 |
| 极简挑战类 | 3 | TC-016 ~ TC-018 |

### 多轮用例（MT-A/B/C 各 3 个，共 9 个）

| 类型 | 用例 | 说明 |
|------|------|------|
| `progressive`（渐进式编辑） | MT-A-001 ~ MT-A-003 | 3 轮对话，逐步修改音乐层 |
| `style-transfer`（风格迁移） | MT-B-001 ~ MT-B-003 | 2 轮，第 2 轮切换风格 |
| `fuzzy-feedback`（模糊反馈） | MT-C-001 ~ MT-C-003 | 2 轮，第 2 轮用口语化指令微调 |

## 典型工作流

```
1. 修改提示词（src/prompts/versions/）→ 更新 active.ts
2. 运行基线评测：npm run eval -- --label v1 --no-judge
3. 修改提示词 → 运行：npm run eval -- --label v2 --no-judge
4. 对比：npm run eval:report -- --compare v1 v2
5. 有需要时开启 LLM Judge 做更细粒度分析
6. 填写人工评分后导入，持久化到 history JSON
```

> [!NOTE]
> 快照文件（`history/*.json`）应纳入 Git 版本管理，以便跨会话追踪质量趋势。

## 单元测试

```bash
npx vitest run src/agent/__tests__/eval-evaluator.test.ts
```

测试覆盖 `scoreRules` 的 8 个场景：高分合法代码、语法错误级联、无 BPM、bassLpf、padRoom、hhGain、breathingSpace、noTidalOnly。
