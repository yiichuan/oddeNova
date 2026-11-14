# 场景配乐盲听

十个冻结场景见 `scripts/sample-annotations/scene-cases.json`。每个场景重复三次，对照 v25（无搜索）与 v27（正常提供搜索，不强制调用），两组完整自由创作，不限制到已标注六库。DeepSeek Flash，temperature 0.7，关闭 thinking，新上下文，交替执行。

结果独立保存在 `.local/sample-annotations/scene-eval/`。配置检查提示词、搜索实现、工具定义与目录指纹；成功或失败文件均不会自动覆盖，不能因作品不好听而重跑。模型调用通过现有 agent 的有限请求重试处理传输失败。密钥仅从私密环境文件读取，不写入输出。

```sh
SCENE_EVAL=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run --no-cache tests/sample-selection-scene.eval.test.ts
EVAL_DIR=.local/sample-annotations/scene-eval EVAL_CASES=scripts/sample-annotations/scene-cases.json RENDER_SECONDS=30 node scripts/sample-annotations/render-blind.mjs
node --import=tsx/esm scripts/sample-annotations/audit-scene.mjs
SCENE_EVAL=1 EVAL_DIR=.local/sample-annotations/scene-eval EVAL_CASES=scripts/sample-annotations/scene-cases.json python3 scripts/sample-annotations/build-blind.py
node scripts/sample-annotations/score-scene.mjs /absolute/path/to/oddenova-scene-ratings.json
```

渲染使用独立无头音频页面，不启动产品开发服务器。每首从开头截取 30 秒，原始 WAV 保留；匹配响度仅施加恒定增益。A/B 随机映射固定保存，答案不包含在盲听目录及 ZIP 中。

评分分别为场景贴合度、乐器音色贴切度与个人偏好，支持平局及无法判断。只有三个维度均填写才计为完整评分。收到导出评分后按场景聚合三次重复，不能据此宣称大样本显著提升。此实验同时改变提示词与创作结果，不能把听感差异单独归因于标注。

技术报告及 audit.json 包含查询回放、显式标注匹配、实际渲染音源、候选命中、Token 用量和缺失配对。自然语言音色和类别语义需要结合具体候选审阅；标注匹配不替代试听。
