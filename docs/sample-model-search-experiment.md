# 主 Agent 按需调用模型检索实验

十个场景各一次，主 Agent 使用原有 v27 完整提示词与工具定义。只在 Vitest 实验中注入 searchSamples 实现，产品代码不变。没有预先选样或额外配器方案。

主 Agent 的每次 query/category/features/limit 被交给一个新的 DeepSeek Flash 上下文；其消息只有检索指令、全库紧凑标注和本次查询。子调用返回 variantId 与匹配理由，程序核对真实文件行号、数量与去重后，补齐名称、编号、根音、标注、播放方式，返回主 Agent。没有合适候选可以返回空数组，错误原样记录并通过原有工具失败路径返回，不偷偷使用关键词排序。

两种模型调用均 temperature 0.7、关闭 thinking。独立检索不接收主对话历史、不拥有代码工具，主流程消息也不包含全库表格；返回结果只包含少量候选。相同需求的工具结果复用沿用现有 agent 行为。检索模型未提供 GM/合成器目录，主 Agent 可按原提示词使用这些音源回退。

结果在 `.local/sample-annotations/model-search-eval/`；历史对照固定为 scene-eval 的 v27 repeat 0。用户已听过历史作品，因此为探索性对照，不视为独立盲测。目录、源文件、提示词、工具定义、历史作品哈希、主请求与子请求/响应全部冻结。

```sh
npx vitest run --no-cache tests/model-search.test.ts
MODEL_SEARCH_EVAL=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run --no-cache tests/sample-selection-model-search.eval.test.ts
EVAL_DIR=.local/sample-annotations/model-search-eval EVAL_CASES=scripts/sample-annotations/scene-cases.json EVAL_REPEATS=1 RENDER_SECONDS=30 node scripts/sample-annotations/render-blind.mjs
node scripts/sample-annotations/audit-model-search.mjs
MODEL_SEARCH_EVAL=1 FULL_CATALOG_EVAL=1 SCENE_EVAL=1 EVAL_REPEATS=1 EVAL_DIR=.local/sample-annotations/model-search-eval EVAL_CASES=scripts/sample-annotations/scene-cases.json python3 scripts/sample-annotations/build-blind.py
```

默认候选上限5，可由主 Agent 指定至10。返回的 alternatives 为空，子模型选择的各文件/音区直接作为候选，避免加入未经模型比较的替代项。最终试听30秒，仅用恒定增益匹配响度。audit.json 分开报告主流程与子检索 Token，并检查主消息未携带全库表格；候选命中不等于实际演奏音区匹配，需结合 rootNote 与作品判断。
