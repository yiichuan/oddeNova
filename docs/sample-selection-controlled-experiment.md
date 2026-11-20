# 第二轮：固定试听内容的选样实验

目的：检验六库采样的模型初标与检索，能否帮助 DeepSeek Flash 选择更贴合请求的采样。上一轮完整作品盲听同时改变了编曲，且部分实验组没有使用检索，无法隔离选样贡献。

- 10 类需求，各重复 3 次，共 30 组、60 次选样。
- 模型为 `deepseek-flash`，temperature 0.7，关闭 thinking。
- 对照组沿用 oddeNova v25 提示词，依据名称、已有目录知识直接选样。
- 实验组沿用 v26 提示词，API 强制先调用实际 `searchSamples` 工具 schema；使用运行时 `rankSamples` 检索冻结目录，再选择返回候选或其 alternatives 中的名称、变体。
- 为隔离标注的贡献，两边均限定当前六份音频索引。GM SoundFont 和合成器不纳入；这轮不能代表整个产品所有音源的选样表现。
- 实验是选样任务，提供专用 `selectSamples` 提交工具；不让模型重写音乐代码，不修改产品 agent 的提交规则。
- 两边使用相同的试听模板。固定速度 100 BPM、节奏、增益、声像、clip、无额外混响或延迟。旋律类使用重复 C4，以减少演奏方式的干扰。它不是原始创作需求的完整作品验收。
- 音高映射只保留离 C4 最近音区的文件级特征用于排序，遵循引擎的最近根音逻辑。编号表示该音区内的变体，不把琴键映射当作数组编号。
- 冻结完整目录、提示词哈希、原始响应、工具结果和选择理由。程序依据选择机械填充模板，检查全部变化仅来自采样选择。
- 渲染后只用恒定增益做成对响度匹配，不加压缩或其他音色处理。保留原始 WAV 和匹配后的 WAV。
- 每组独立随机化 A/B；听者分别判断音色符合度和个人偏好。相同选择的组保留，作为一致性参考。

结果目录为 `.local/sample-annotations/controlled-eval/`，与上一轮 `deepseek-eval` 分离。盲听文件在其 `blind/review/index.html`，答案保存在 `blind/answer-key.json`，盲听结束前不公开映射。

入口：`tests/sample-selection-controlled.eval.test.ts`（默认跳过；设置 `CONTROLLED_EVAL=1` 和私密环境中的 `DEEPSEEK_API_KEY` 才调用 API）。`audit-controlled.mjs` 核查所有完成结果、候选使用情况及完整配对数量。

可通过环境变量复用渲染和盲听构建：

```sh
EVAL_DIR=.local/sample-annotations/controlled-eval EVAL_CASES=scripts/sample-annotations/controlled-cases.json node scripts/sample-annotations/render-blind.mjs
CONTROLLED_EVAL=1 EVAL_DIR=.local/sample-annotations/controlled-eval EVAL_CASES=scripts/sample-annotations/controlled-cases.json python3 scripts/sample-annotations/build-blind.py
node scripts/sample-annotations/audit-controlled.mjs
```

局限：这是单模型、少量需求的受控测试；同音试听不覆盖旋律跨音区表现。检索结果来自模型初标，类别、奏法及听感的最终准确性仍需专家复核。即使实验组胜出，也不能据此直接推断完整创作或所有采样类别都有提升。
