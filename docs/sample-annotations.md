# 全库采样初标与按需检索

`searchSamples` 通过非空 `queries` 数组接受多组声部需求，每组包含本批唯一的 `id`、`query`，以及可选的 `category`、`features`、`limit`。不设查询组数、每组候选数或整批候选预算的硬上限。`limit` 为期望数量，默认3，模型按相关性决定实际返回数量。支持中文或英文类别，以及亮度、厚度、质感、起音、包络、尾音、混响等偏好。

主 Agent 按需调用工具，工具在同一次检索对话中处理整批需求，按 id 返回 `results`。检索器从 `/sample-annotations/catalog.json` 读取目录，返回独立文件候选及标注，`alternatives` 为空。演示模式不提供 `searchSamples`。旧评测通过显式注入使用关键词排序，历史批次的复跑使用记录的源码版本。

## 标注任务

在本地私密环境文件设置 `DASHSCOPE_API_KEY` 和 `DASHSCOPE_BASE_URL`。密钥由离线脚本使用。脚本需要 Node、FFprobe 和 curl。

```sh
node --import=tsx/esm scripts/sample-annotations/run.mjs inventory
node --import=tsx/esm scripts/sample-annotations/render-blind.mjs --timbres
node --env-file=.env.local --import=tsx/esm scripts/sample-annotations/run.mjs annotate
node --import=tsx/esm scripts/sample-annotations/build.mjs FINGERPRINT
```

清单包含六份采样索引、示例曲目《360》的两个外部采样、GM SoundFont 和内置合成器及噪声源。索引路径沿用播放端的修复逻辑。Dirt Samples 被同名音色覆盖的文件可通过 `dirt_` 名称检索和播放。示例音频以 `cover360_` 名称注册，曲目代码中的原有名称照常可用。

渲染命令使用本机 Chrome 和播放引擎，为每个 GM 预设、内置音色的默认设置和 Bytebeat 内置预设生成独立的干声试听片段。GM 的试听音高沿用浏览目录；这份标注描述所听音区，检索返回相同预设索引和示例音高。波形的短名称作为别名记录。自定义合成参数和用户曲目动态加载的任意外部音频需提供具体的试听素材后再标注。

音频渲染和模型标注都可续跑。用 `RENDER_LIBRARY=synths` 或 `RENDER_LIBRARY=gm` 单独渲染，用 `ANNOTATION_LIBRARIES=gm,synths,featured` 处理新增音色。缺少渲染文件的项目留在待处理清单。若两步并行，可加 `ANNOTATION_WATCH_RENDERS=1` 持续处理新生成的音频。用 `ANNOTATION_RETRY_INVALID=1` 重试已有的不合格标注。超过 30 秒的源文件提交前 30 秒供模型分析，完整原音仍可试听。

任务在 `.local/sample-annotations/` 保存清单、音频缓存、下载状态、按内容哈希去重的模型结果、逐次原始响应和费用账本。再次执行同一配置复用已有结果。网络请求失败最多补试三次，连续下载失败五次则停止，格式错误最多补跑一次。每次调用保守预留费用；用量未知的调用保留预留金额。默认总费用上限为 40 元，可通过 `ANNOTATION_BUDGET_CNY` 设置。预算按本次核实的北京价格估算，输入每百万 Token 0.8 元，输出 2.7 元；实际账单以平台为准，其他区域需要先调整价格。

已知类别由目录依据确定。模型使用不含 source 的 v2.1 结构，仅补听感。未知类别使用 v2.0 结构，来源候选留给复核。内容相同的文件复用初标，类别和播放映射仍以各自目录为准。构建选样目录时，来源类别为空的采样可用明确的浏览分组补齐，例如将 `909` 归为底鼓。人工修订优先，更多采样和鼓机杂项等兜底分组不参与补齐。

构建后，`summary.json` 报告覆盖率，`review-queue.json` 列出失败和待处理引用，`names.json` 保存名称级汇总。结构不合格的输出不会进入听感排序。原始音频和响应保存在 Git 忽略目录，公共目录发布结构化观察、播放映射及供人工复核的声音描述，供检索按需展开。

## 专家更新

可提供本地 `expert-releases.json`，以音频 SHA-256 为键，条目包含 `status: "expert_confirmed"`、正整数 `version` 和经 Schema 校验的 `features`（structure、timbre、envelope、space）。构建器采用合法专家版本覆盖模型听感，保留模型原始记录。目录类别保持独立。

## 提示词及评测

v26 中英文提示词指导创作模型在需要比较音色时查询候选，尊重用户指定的采样，按候选给出的数组或音高映射示例调用。查询失败或无匹配时使用原有名称参考。名称参考同时列出 VCSL 的 127 个名称和 Mridangam 的 13 个名称，覆盖检索可返回的全部内置名称。

`scripts/sample-annotations/eval-cases.json` 固定十条跨类型请求。评测应使用同一 DeepSeek Flash 模型及参数，对 v25 与 v26 各重复三次，共 60 次创作。分别记录合法调用、请求满足情况和试听评价。技术校验通过不代表音色描述已经得到专家确认。

## 浏览标注

直接访问 `/sample-library` 进行临时调试，网站内不提供导航入口。页面按需加载现有 `public/sample-annotations/catalog.json`，支持名称、别名、类别和中英文听感关键词搜索，空格分隔的关键词需要同时匹配同一个变体。可按标注状态筛选，并查看每个匹配变体的结构、音色、包络、空间感、根音、奏法及 Strudel 调用代码。

在本机 Vite 开发页面，选中带音频哈希的变体，点「编辑标注」。表单可对照 AI 原始值，列出共享该音频的全部目录引用。草稿和确认记录按音频 SHA-256 保存，类别和播放映射仍由各自目录决定。

「保存草稿」将修改写到 `.local/sample-annotations/expert-drafts/`，目录及检索继续使用当前生效值。「确认发布」需要已保存的草稿，确认记录写入 `expert-releases.json`，随后更新公共目录中的全部关联变体与摘要。请刷新已打开的工作室以加载新目录。若目录写入中断，在编辑区重新载入标注并重试发布。完整构建时会继续采用已确认的人工值。要让线上检索使用修改，需将更新的目录随代码发布。

确认后可在详情展开「查看 AI 原始标注」。公共目录对人工确认的变体额外保留结构化 AI 听感，检索只使用当前生效字段。声音描述与听感联想展示在详情页，并可通过本机「编辑标注」修改、清空、保存草稿及确认发布；确认状态独立于结构化特征，旧人工记录不会自动确认新增描述。听感联想仅表示相似声音，不作为真实声源类别。发布后共享音频哈希的引用同步更新，并保留 AI 原始描述。检索模型展开音色时读取生效的声音描述及联想。原始模型记录、用途建议和草稿仍保留在本地。线上页面仅供浏览。

标注详情显示当前目录类别。本机可打开「编辑标注」，在「目录类别」字段修改并保存该音色名称的类别，留空设为未分类，也可恢复来源类别。公共目录按音色名称保存人工修订及来源原值，完整构建会从现有公共目录继承修订。保存后音色库筛选即时更新，工作室刷新后检索使用新类别。

## 产品中的模型检索

真实创作入口为 `searchSamples` 注入独立模型检索器。主 Agent 自主决定配器，v26 中英文提示词引导它合并已确定的需求，单组或依赖前次结果的需求可后续补查。工具内部使用当前模型配置/凭据，开启全新的消息列表，先读取按类别分组的全库导览及整批 queries。导览每行包含音色名称和听感概览。模型通过 readSampleDetails 批量展开音色，读取文件级标注、声音描述、联想和播放示例。已读文件不会重复附加，候选必须来自本次已展开的文件。检索模型按查询 id 返回候选 variantId，工具解析出根音、变体、文件级标注和合法 playback；不把全库表格或子模型对话放入主上下文。不提前决定整首配器，不强制采用全部候选。

```json
{"queries":[{"id":"melody","query":"柔和圆润的钢琴","category":"piano","limit":3},{"id":"snare","query":"干声短尾军鼓","category":"snare","limit":3}]}
```

返回形状为 `{ok:true,results:[{id,ok:true,candidates:[...]},{id,ok:false,error:"..."}]}`，顺序按输入需求排列。每组独立校验已展开的真实文件、格式和组内去重；不同组可以选同一文件。漏组、重复组或该组候选无效时，只将对应组标记失败，保留其他有效结果；没有匹配时返回成功的空候选组及 notice。无法关联的未知 id、响应结构错误或整个模型请求失败作为工具失败返回，不暗中改用关键词排序。历史单查询参数 `query/category/features/limit` 仍兼容，保留默认5个及原 `candidates` 返回形状；新工具 schema 只展示 queries 接口。

固定顺序为「检索系统提示词 → 全库导览 → 本批查询」。指令、工具 schema、目录顺序和行号确定；查询 id、听感条件及 limit 只放在最后一个消息，不添加时间戳或随机前缀。DeepSeek/OpenAI 路径使用供应商的自动前缀缓存；Anthropic 在全库导览文本块末尾设置 ephemeral 缓存断点。缓存不减少上下文长度，也不保证必然命中。目录或提示词变化会改变前缀。

模型调用的 usage 会保留 cachedInputTokens 和 cacheCreationInputTokens；runAgent 返回的 retrievalUsage 单独累计检索输入、输出、缓存读取/写入和已收到用量的调用次数，不计入主上下文占用 tokenUsage。Anthropic 总输入包含普通输入、缓存读取和缓存创建，避免缓存命中时低估实际上下文。

每批检索最多等待180秒，包含目录加载和所有展开轮次，用户取消会传到模型请求。主 Agent 可保留有效组，仅调整失败需求或使用现有合法音源继续创作。`retrievalUsage` 累计每一轮实际模型请求的用量。首轮导览在 DeepSeek Flash 实验中约 4.3 万输入 token，后续轮次还携带检索历史。

`public/sample-annotations/guide.json` 保存离线生成的名称级听感概览。检索按当前目录组织类别并读取当前文件详情，新增音色在没有离线概览时使用其目录摘要。修改文件标注后应在下一次发布导览时更新受影响的概览。重新生成时可运行 `node --import=tsx/esm --env-file=.env.local scripts/sample-annotations/hierarchical-eval.ts`，核对实验目录生成的 `guide.json` 后替换公共导览。评测脚本仍保留全库结构化对照。
