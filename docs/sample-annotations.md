# 全库采样初标与按需检索

运行时的 `searchSamples` 从 `/sample-annotations/catalog.json` 按需加载静态目录，默认返回 5 个候选，上限 10 个。支持中文或英文类别，以及亮度、厚度、质感、起音、包络、尾音、混响等偏好。同等匹配优先专家确认结果，未知字段不参与听感评分。每个名称返回最匹配的变体与最多三个具有不同听感或奏法的替代变体。

## 标注任务

在本地私密环境文件设置 `DASHSCOPE_API_KEY` 和 `DASHSCOPE_BASE_URL`。密钥由离线脚本使用。脚本需要 Node、FFprobe 和 curl。

```sh
node --import=tsx/esm scripts/sample-annotations/run.mjs inventory
node --env-file=.env.local --import=tsx/esm scripts/sample-annotations/run.mjs annotate
node --import=tsx/esm scripts/sample-annotations/build.mjs FINGERPRINT
```

清单包含六份音频索引中的所有引用。路径使用运行时的修复逻辑，记录数组位置、音高映射、别名和加载顺序造成的重名覆盖。目录只输出白名单中实际可调用的名称。被覆盖文件仍保留文件级记录。

任务在 `.local/sample-annotations/` 保存清单、音频缓存、下载状态、按内容哈希去重的模型结果、逐次原始响应和费用账本。再次执行同一配置复用已有结果。网络请求失败最多补试三次，连续下载失败五次则停止，格式错误最多补跑一次。每次调用保守预留费用；用量未知的调用保留预留金额。默认总费用上限为 40 元，可通过 `ANNOTATION_BUDGET_CNY` 设置。预算按本次核实的北京价格估算，输入每百万 Token 0.8 元，输出 2.7 元；实际账单以平台为准，其他区域需要先调整价格。

已知类别由目录依据确定。模型使用不含 source 的 v2.1 结构，仅补听感。未知类别使用 v2.0 结构，来源候选留给复核。内容相同的文件复用初标，类别和播放映射仍以各自目录为准。

构建后，`summary.json` 报告覆盖率，`review-queue.json` 列出失败和待处理引用，`names.json` 保存名称级汇总。结构不合格的输出不会进入听感排序。原始音频和响应保存在 Git 忽略目录，运行时只发布结构化观察和播放映射。

## 专家更新

可提供本地 `expert-releases.json`，以音频 SHA-256 为键，条目包含 `status: "expert_confirmed"`、非空 `reviewer`、正整数 `version` 和经 Schema 校验的 `features`（structure、timbre、envelope、space）。构建器采用合法专家版本覆盖模型听感，保留模型原始记录。目录类别保持独立。

## 提示词及评测

v26 中英文提示词指导创作模型在需要比较音色时查询候选，尊重用户指定的采样，按候选给出的数组或音高映射示例调用。查询失败或无匹配时使用原有名称参考。

`scripts/sample-annotations/eval-cases.json` 固定十条跨类型请求。评测应使用同一 DeepSeek Flash 模型及参数，对 v25 与 v26 各重复三次，共 60 次创作。分别记录合法调用、请求满足情况和试听评价。技术校验通过不代表音色描述已经得到专家确认。
