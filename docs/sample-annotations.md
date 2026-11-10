# 全库采样初标与按需检索

`searchSamples` 通过非空 `queries` 数组接受多组声部需求，每组包含本批唯一的 `id`、`query`，以及可选的 `category`、`features`、`limit`。不设查询组数、每组候选数或整批候选预算的硬上限。`limit` 为期望数量，默认3，模型按相关性决定实际返回数量。支持中文或英文类别，以及亮度、厚度、质感、起音、包络、尾音、混响等偏好。

真实创作入口一次模型请求处理整批需求，按 id 返回 `results`；演示模式及离线调用从 `/sample-annotations/catalog.json` 加载静态目录，逐组执行本地排序。本地排序同等匹配优先专家确认结果，未知字段不参与听感评分，每个名称返回最匹配的变体与最多三个替代变体。模型检索返回独立文件候选及选择理由，`alternatives` 为空。

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

## 浏览标注

直接访问 `/sample-library` 进行临时调试，网站内不提供导航入口。页面按需加载现有 `public/sample-annotations/catalog.json`，支持名称、别名、类别和中英文听感关键词搜索，空格分隔的关键词需要同时匹配同一个变体。可按标注状态筛选，并查看每个匹配变体的结构、音色、包络、空间感、根音、奏法及 Strudel 调用代码。

页面展示构建后的目录字段及对应 JSON；原始模型摘要、用途建议和复核证据仍保留在 `.local/sample-annotations/`，未通过此页面发布。模型初标不等于专家确认。重新构建目录后，刷新页面即可查看最新结果。

## 产品中的模型检索

真实创作入口为 `searchSamples` 注入独立模型检索器。主 Agent 自主决定配器，v28 中英文提示词引导它合并已确定的需求，单组或依赖前次结果的需求可后续补查。工具内部使用当前模型配置/凭据，开启全新的消息列表，读取一次紧凑全库标注及整批 queries，一次模型请求返回各组候选。候选包含根音、变体、文件级标注、合法 playback 与 selectionReason；不把全库表格或子模型对话放入主上下文。不提前决定整首配器，不强制采用全部候选。

```json
{"queries":[{"id":"melody","query":"柔和圆润的钢琴","category":"piano","limit":3},{"id":"snare","query":"干声短尾军鼓","category":"snare","limit":3}]}
```

返回形状为 `{ok:true,results:[{id,ok:true,candidates:[...]},{id,ok:false,error:"..."}]}`，顺序按输入需求排列。每组独立校验真实文件、格式、理由和组内去重；不同组可以选同一文件。漏组、重复组或该组候选无效时，只将对应组标记失败，保留其他有效结果；没有匹配时返回成功的空候选组及 notice。无法关联的未知 id、响应结构错误或整个模型请求失败作为工具失败返回，不暗中改用关键词排序。历史单查询参数 `query/category/features/limit` 仍兼容，保留默认5个及原 `candidates` 返回形状；新工具 schema 只展示 queries 接口。

固定顺序为「检索系统提示词 → 全库表格 → 本批查询」。指令、工具 schema、目录顺序和行号确定；查询 id、听感条件及 limit 只放在最后一个消息，不添加时间戳或随机前缀。DeepSeek/OpenAI 路径使用供应商的自动前缀缓存；Anthropic 在全库表格文本块末尾设置 ephemeral 缓存断点。缓存不减少上下文长度，也不保证必然命中。目录或提示词变化会改变前缀。

模型调用的 usage 会保留 cachedInputTokens 和 cacheCreationInputTokens；runAgent 返回的 retrievalUsage 单独累计检索输入、输出、缓存读取/写入和已收到用量的调用次数，不计入主上下文占用 tokenUsage。Anthropic 总输入包含普通输入、缓存读取和缓存创建，避免缓存命中时低估实际上下文。

每批检索最多等待180秒，用户取消会传到模型请求。主 Agent 可保留有效组，仅调整失败需求或使用现有合法音源继续创作。当前配置的模型需要容纳约28万Token目录；批量查询不会缩短目录，上下文不足或服务不支持时会返回检索失败。`retrievalUsage` 按实际模型请求累计，一批多组只产生一次检索调用。已有单查询实验的提示词、返回 schema 和候选映射导出保留，冻结实验记录不变。批量请求的真实耗时、费用和选样质量仍需实测，技术测试不代表试听结果。
