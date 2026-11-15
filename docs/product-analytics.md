# 产品埋点口径

PostHog 事件由浏览器主动发送，协议版本为 `schema_version: 2`。已有事件名称和 `outcome` 字段继续兼容历史报表。构建版本来自 Vercel 的提交 SHA 或构建变量 `VITE_APP_BUILD_VERSION`。分析生产数据时按 `environment = production` 过滤，可再按 `entry_surface` 和 `page` 区分入口和当前页面。

事件沿用匿名浏览器和访问会话标识。作品 ID 经浏览器本地盐散列后发送，在同一浏览器中关联 `workspace_session_id`。Agent、播放、导出分别可用 `turn_id` 和 `operation_id` 配对。只有本页观察到的轮次可以关联历史版本和消息。每日活跃登录用户数使用独立事件，见 [统计口径](./daily-active-accounts.md)。

| 事件 | 触发时机及分析口径 |
| --- | --- |
| `agent_turn_started` / `agent_turn_finished` | Agent 真正开始与结束。用 `turn_id` 配对。分别检查迭代、请求重试、工具失败、终止原因及错误阶段。正常文字回复、用户中止和业务异常分别统计。后台生成结束可成功但未自动播放。 |
| `playback_requested` / `playback_started` / `playback_finished` | 尝试播放、引擎确认启动、播放段关闭。启动率以请求为分母，结束原因包括停止、暂停、替换、异常和离页。前台时长按页面可见性计算。引擎状态与时长无法确认用户实际听见声音。 |
| `audio_export_started` / `audio_export_finished` | 导出尝试与结果。包含格式、采样率、区间周期数、总耗时及可用的渲染和编码耗时。成功表示已触发文件下载，图恢复结果单独记录。统一报表仅使用这组事件，`wav_export_completed` 保留给历史报表。 |
| `creation_action` | 原样重试、编辑重发、回退、历史版本试听和手动修改后运行。重试与回退成功表示目标有效且已进入本地修改流程，真正生成和保存的结果查对应事件。 |
| `session_save_finished` | 实际本地写入或云端保存请求的结果。内存模式单列，不能计入持久化成功。流式本地写入成功按作品在 30 秒内聚合，`write_count` 为实际写入次数，`duration_ms` 为耗时之和。 |
| `session_sync_changed` / `storage_degraded` | 云同步离线、重试和完成状态，以及 IndexedDB 降级。遇到故障后恢复时，耗时从首次进入故障状态开始计算。 |
| `engine_initialization_finished` / `feature_load_finished` / `app_error` | 引擎初始化及重初始化结果、功能模块加载失败及重试结果、未处理错误。窗口错误和未处理拒绝按来源、页面和错误码在当前页面内去重 60 秒。 |

没有结束事件的尝试归为结果未知。离页上报是尽力发送，不能假定一定入库。上线后可抽查正常和失败轮次、三种导出格式、离线恢复，并确认散列作品 ID 与轮次 ID 配对。事件只上报结构化字段，不含内容、原始 URL、原始错误、堆栈、文件名或账号资料。
