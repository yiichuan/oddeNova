# 视觉组件位置速查

页面所有视觉组件，格式为 `名字：位置`。位置以屏幕区域描述（左/右/上/下/居中）。
布局分**桌面态**与**移动态**两套（`App.tsx` 中以 `isMobile` 分支）。

---

## 目录结构

`src/components/` 按界面区域分目录，目录名即这块界面：

```
components/
├── nav/            一级菜单（最左侧竖条）
│   └── PrimaryNav
├── conversation/   左栏：会话与输入
│   ├── Sidebar             左栏外壳（标题行 + 对话流 + 输入区）
│   ├── EditableSessionTitle / HistoryPanel
│   ├── ConversationView    对话流
│   │   └── CodeDiffView / ThinkingLottie
│   └── ChatInput           输入区
│       └── ThinkingLevelControl / ContextWindowIndicator* / VoiceButton*
├── studio/         右栏：工作室（代码 + 动画）
│   ├── TopActionBar        顶部操作栏（+ mobileTopActions）
│   ├── CodePanel           代码编辑器
│   │   └── ControlBarParticles / ControlHoverLabel / SessionSyncStatus
│   └── VizPlaceholder      动画面板
├── featured/       精选页（一级菜单进入后占满整个内容区，无左栏）
│   ├── FeaturedPage        壳：网格视图 / 详情视图 + 底部悬浮播放栏
│   ├── FeaturedCard        单个作品卡片（方形封面 / 悬停播放键 / 双署名）
│   ├── FeaturedDetail      详情视图（返回 / 封面 / 署名 / 代码 / 音乐说明）
│   ├── FeaturedGlow        详情页背景：取封面主色调的弥散渐变（+ featured-accent）
│   ├── FeaturedPlayerBar   底部悬浮播放栏
│   └── featured-cover      封面（有图用图，无图用 id 生成的配色）
├── settings/       设置页（一级菜单进入后替换左栏与右栏）
│   ├── SettingsSidebar     左栏：设置分区（模型 / 外观）
│   ├── ModelSettingsPanel  右栏：模型
│   │   └── ProviderTabs    顶部服务商标签栏
│   └── AppearanceSettingsPanel  右栏：外观
│       └── settings-previews    主题 / 动画预览线框图
├── overlays/       浮层：模态与全局提示
│   ├── AccountModal / ApiKeyModal（+ apiKeyModalUtils）
│   ├── PersonaModal*
│   └── OddeNovaImportNotice
└── icons.tsx       跨区域共用的图标
```

每个目录内的 `__tests__/` 只测本目录的组件。带 `*` 的组件当前没有被挂载到界面上
（`ContextWindowIndicator` 在 `ChatInput` 中被注释保留，`VoiceButton`、`PersonaModal`
只剩自身测试引用）。

---

## 桌面态（Desktop）

整体为左右两栏：左侧 `Sidebar`（对话 + 输入），右侧 `main`（代码编辑器 + 可视化），中间由拖拽分隔条分隔。

### 左栏 · Sidebar（`Sidebar.tsx`）

- Logo（oddeNova 品牌字）：左上
- 会话标题（可编辑，`EditableSessionTitle`）：左栏标题行 · 偏左
- 播放/重播按钮：左栏标题行 · 右
- 历史按钮：左栏标题行 · 右
- 新建会话按钮：左栏标题行 · 右
- 对话流（`ConversationView`）：左栏中部（主体区）
- 历史面板浮层（`HistoryPanel`）：左栏标题行下方展开
- 引导建议（`ChatInput` 占位符轮播，按 Tab 填入）：左栏输入框内
- 心情生成按钮（AirJelly，`/airjelly-icon.png`）：左栏输入框上方按钮行内
- 用户输入框（`ChatInput`）：左下
  - 发送 / 停止按钮：输入框右下
  - 上下文用量环（`ContextWindowIndicator`）：输入框左下
  - 重启引擎按钮：输入框左下

### 对话流内部 · ConversationView（`ConversationView.tsx`）

- 用户消息气泡：右侧（右对齐，最宽 85%）
- 回滚按钮（Lucide `Undo2`）：用户气泡右上（悬停/长按显示）
- 消息操作按钮（重试 / 分支）：每条 AI 回复左下

**AI 回复内容分类**（均左对齐，右缘铺满至用户气泡右边界）：

- 最终回复文本（assistant text）：AI 气泡主体
- Strudel 代码块（可展开）：AI 气泡内 · 最终文本下方
- 思考叙述文字（progress `thinking`，前带品牌 logo 图标）：信息流中，作为回复的中间叙述
- 编曲思路折叠窗口（progress `reasoning` · 编曲环节）：信息流中编曲步骤处，思考结束后收起保留（可展开）
- 实时滚动 reasoning 窗口（progress `reasoning` · 其它环节）：思考指示器下方，仅思考进行时显示，结束即消失
- 实时状态标签（progress `tool_call` / `commit`，如"编排段落…""准备播放…"）：思考指示器内，随工具执行短暂显示，不留存
- 警告提示（progress `warn`）：信息流中
- 思考动画（`ThinkingLottie`，flash01 Lottie）+ 状态文字：AI 回复上方的思考指示器，思考进行时显示

### 右栏 · main

- 顶部操作栏（`TopActionBar`）：右上
  - 分享按钮（`ShareIcon`）：顶栏
  - 导出 WAV 按钮（`DownloadIcon`）：顶栏
  - 学习按钮（`BookOpenIcon`）：顶栏
  - 设置按钮（`SettingsIcon`）：顶栏
- 代码编辑器（`CodePanel` / StrudelMirror）：右侧中部（主体）
  - 播放 / 停止按钮：编辑器左下
  - 音量滑块（Volume）：编辑器底部
  - 速度滑块（BPM）：编辑器底部
- 可视化画面（`VizPlaceholder`，galaxy iframe）：右下
- 横向拖拽分隔条（调左右栏宽）：左右栏之间
- 纵向拖拽分隔条（调编辑器/可视化高）：右栏编辑器与可视化之间

### 精选页（一级菜单 · 精选）

只保留最左侧 `PrimaryNav`，左栏与拖拽分隔条整体让位，内容区通栏。工作室与设置页
均保持挂载（音频引擎绑在 `CodePanel` 的编辑器上，卸载即断）。

**网格视图**

- 页面标题「精选」：内容区顶部 · 居中
- 作品网格（`FeaturedCard`）：标题下方，一行四张
  - 方形封面：卡片上部（图片放 `public/featured/`，缺图时由 id 生成配色）
  - 播放 / 停止按钮：封面右下角，悬停或键盘聚焦时浮出
  - 名称 / 原作者 / 代码作者：封面下方三行；点卡片进入详情，点右下角按钮才是播放
  - 预留位（虚线框 + 唱片图标）：补满第一行剩余格子

**详情视图（`FeaturedDetail`，点卡片进入）**

- 封面主色弥散光（`FeaturedGlow`）：铺满内容区 · 位于所有内容之下
- 返回按钮：内容区左上
- 方形封面（小尺寸 160px）：返回按钮下方 · 左
- 名称 / 原作者 / 代码作者 / 简介 / 原帖 · Strudel 源码链接：封面右侧
- 代码窗口（只读，可滚动）：封面下方 · 左
- 音乐说明窗口（风格 / 速度 / 音层清单）：封面下方 · 右
- 悬浮播放栏在两个视图中都在，播放不因进出详情而中断
- 悬浮播放栏（`FeaturedPlayerBar`）：内容区底部 · 浮于网格之上
  - 当前作品缩略图与署名：播放栏左侧
  - 播放 / 停止按钮：播放栏正中
  - 进度条与时间：播放按钮正下方（只读，拖动定位仍在工作室）
  - 原帖 / Strudel 源码 / 「在工作室打开」：播放栏右侧

试听借用工作室的引擎，离开精选页时自动停声并把原代码还回编辑器
（`useFeaturedPreview`）。

---

## 移动态（Mobile）

自上而下：上导航栏 → 对话流 → 代码抽屉 → 底部输入栏。

- 新建会话按钮：左上
- 历史按钮：左上（新建按钮右侧）
- Logo（oddeNova 品牌字）：顶部居中
- 顶部操作栏（`TopActionBar`）：右上
- 对话流（`ConversationView`）：中部（主体区）
- 代码抽屉（`CodePanel`）：下部（可收起/展开的抽屉）
- 代码抽屉开关药丸（查看/收起代码）：抽屉与底栏交界线上 · 居中
- 建议气泡（横向滚动）：底栏输入框上方
- 用户输入框（`ChatInput`）：左下 / 底部
  - 发送 / 停止按钮：输入框右下
  - 上下文用量环（`ContextWindowIndicator`）：输入框左下
- 历史下拉面板（`HistoryPanel`）：左上展开

---

## 浮层 / 全局（两套布局通用）

- API 密钥弹窗（`ApiKeyModal`）：屏幕居中（模态）
- 分享加载中 / 加载失败提示：全屏遮罩 · 居中
- WAV 导出进度 / 弹窗（`TopActionBar` 内）：屏幕居中（模态）
- 语音输入按钮（`VoiceButton`，按住说话）：随输入区（当前浏览器支持时）
