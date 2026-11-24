# 全量标注选样试跑

沿用已确认的十个场景，各生成一次。先让 DeepSeek Flash 读取六库全部 1,049 个名称、6,377 个文件级标注，提交声部、variantId、演奏音区和选择理由，再将选中记录及合法播放方式传给独立创作上下文。创作使用 v27 的其余指令，替换开头的搜索指引，不提供 searchSamples。两阶段均关闭 thinking、temperature 0.7。

全量表保留类别、变体编号、根音、奏法、标注状态、structure/timbre/envelope/space 所有字段；省略哈希、冗余播放示例和重复字段名。唯一行号由工具解析成原始目录记录，避免模型凭空编造变体。GM 和合成器仍允许显式回退，并记录为无标注依据。

每个场景固定与上一轮 scene-eval 的 repeat 0 / search 作品对照。旧作品已被听过，这是探索性复听，不是新的独立盲测，也不能隔离两阶段创作与选样方式各自的贡献。旧实验不被修改。

## 执行

```sh
npx vitest run --no-cache tests/full-catalog.test.ts src/lib/__tests__/sample-search.test.ts
FULL_CATALOG_EVAL=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run --no-cache tests/sample-selection-full.eval.test.ts
EVAL_DIR=.local/sample-annotations/full-catalog-eval EVAL_CASES=scripts/sample-annotations/scene-cases.json EVAL_REPEATS=1 RENDER_SECONDS=30 node scripts/sample-annotations/render-blind.mjs
FULL_CATALOG_EVAL=1 SCENE_EVAL=1 EVAL_REPEATS=1 EVAL_DIR=.local/sample-annotations/full-catalog-eval EVAL_CASES=scripts/sample-annotations/scene-cases.json python3 scripts/sample-annotations/build-blind.py
```

输出位于 `.local/sample-annotations/full-catalog-eval/`，冻结目录、表格、提示词、工具 schema、源文件哈希与历史对照文件哈希。每次实际请求及原始响应、错误、耗时分别落盘；请求记录不包含密钥。不能覆盖已有成功或失败作品，不因听感不好重新生成。

选样最多允许一次结构/行号校验纠错；传输失败有限重试。后续代码修复由原有 agent 校验流程处理。最终音源和演奏音区仍应与选择记录核对，不把静态校验通过等同于所有音频都能播放。

`baseline` 输出槽位表示历史 v27 搜索作品；`search` 输出槽位表示新全量选样作品，仅为复用渲染器，实际方法记录在 config.json 中，不能沿用旧的 v25/v27 揭晓脚本。
