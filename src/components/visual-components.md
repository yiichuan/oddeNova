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
│   ├── FeaturedPage        壳：循环轮播 / 详情视图 + 底部悬浮播放栏
│   ├── FeaturedCarousel    横向循环轨道（滚轮 / 拖动 / 吸附 / 强透视）
│   ├── FeaturedCard        单个作品卡片（方形封面 / 悬停播放键 / 双署名）
│   │   └── FeaturedTiltSurface 中央文字与命中层的 3D 倾斜同步
│   ├── FeaturedWebglLightField 精选轮播的石墨银 WebGL 背景光场
│   ├── VinylLabPage        Three.js 唱片包装实验页（展示、控制与诊断）
│   └── VinylPackageScene   单一 WebGL 实体包装渲染器
│   ├── FeaturedDetail      详情视图（返回 / 封面 / 署名 / 代码 / 音乐说明）
│   ├── FeaturedGlow        详情页背景：取封面主色调的弥散渐变（+ featured-accent）
│   ├── FeaturedPlayerBar   底部悬浮播放栏
│   ├── FeaturedTitleWheel  右上角标题列（点选 / 拖动 / 吸附；专辑曲目列与收藏页复用）
│   ├── featured-wheel      标题列共用：标题去后缀 + 无轮播时的位移与吸附
│   └── featured-cover      封面（有图用图，无图用 id 生成的配色）
├── favorites/      收藏页（一级菜单进入后占满整个内容区，无左栏）
│   └── FavoritesPage       壳：标题 + 右上收藏列表 + 左对话 / 右每版代码一栏
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

**轮播视图**

- 页面标题「精选」：内容区左上
- 循环轨道（`FeaturedCarousel`）：页面中部偏下（约舞台高度 5%，最多 36px），六张唱片排成一个环，360 初始居中
  - 一格 = 一张唱片，不是一首曲子：同一张专辑的曲目合成一格（`featuredAlbums`）。
    只有一首时用曲名当格子标题，多首时用专辑名；封面取专辑第一首的封面，
    署名把这张唱片上所有原作者 / 代码作者各列一次
  - 横向展示层覆盖完整页面宽度，中央封面相对于整个页面居中，PrimaryNav 浮在轨道上方
  - 滚轮与触控拖动映射为横向移动，停止后最近条目吸附到中央
  - 整块舞台（含封面本身）都能抓着拖，光标全程是抓手；拖动超过 6px 后松手的那一下不算点击
  - 轨道无首尾，一直转下去；作品数少于屏上格数时，两侧最远一格会绕回到已在屏上的作品
  - 封面沿同一水平中线排列且互不重叠
  - 中央条目显示完整信息；两侧统一缩小至 0.72、转向并隐藏封面下方信息
  - 相邻封面之间留同样宽的空气：舞台宽度的 4.8%，夹在 40–76px 之间
  - 屏上每一格（含两侧）都可交互：悬停有倾斜按压、浮出播放按钮，点击进入详情
  - 从侧边打开的作品，封面从被点的那一格起飞；退出详情时该作品已回到中央
  - 场景光（`featured-cover-light.ts`）：一盏顶灯，封面上到下自带明暗；转出中央的封面
    朝前的那条边吃光、朝后的那条边入影，越靠边转得越多、明暗差越大
  - 卡片使用普通 DOM 封面；精选页不挂载 Three.js 渲染器
  - 方形封面：卡片上部（图片放 `public/featured/`，缺图时由 id 生成配色）
  - 播放 / 停止按钮：封面右下角，悬停或键盘聚焦时浮出
  - 名称 / 原作者 / 代码作者：封面下方三行；点卡片进入详情，点右下角按钮才是播放
  - 键盘只在中央一格上停留，两侧格子随环整体朗读（`aria-hidden`）
- 标题列（`FeaturedTitleWheel`）：内容区右上，与轮播共用同一个位置，一行一张唱片
  - 当前作品在最上一行、压在橙色标记下，后面的作品依次向下排，越往下越淡
  - 点标题跳到那一格，拖列可连续滚动，松手吸附；悬停未选中的行会预演标记的颜色
  - 每张唱片只占一行：滚出顶部的那一行绕回列尾，列表转多久都不会出现重复条目
  - 淡出按列长铺开（不足七行就按自己的行数），绕回点落在「顶端剩余亮度 =
    列尾进入亮度」的那一处：标题从标记里往上走时一路变淡，淡到七分之一左右、
    只剩被列顶切掉后的一线时才换到列尾，所以绕回这一下看不出来

**详情视图（`FeaturedDetail`，点卡片进入）**

- 封面主色弥散光（`FeaturedGlow`）：铺满内容区 · 位于所有内容之下
- 返回按钮：内容区左上
- 曲目列（多于一首时才出，与精选页标题列同一个控件、同一个位置、同一套点选 /
  拖动 / 吸附交互）：内容区右上。列停在哪一行，这一页就是哪一首——标题 / 署名 /
  来源链接 / 代码窗口 / 音乐说明整页跟着换，封面与列本身不动；
  切换不打断正在播放的声音
- 方形封面（小尺寸 160px）：返回按钮下方 · 左
- 名称 / 原作者 / 代码作者 / 「专辑《X》」/ 来源 · 收录仓库链接：封面右侧
  （署名下面那行统一说明这首曲子出自哪张专辑，单曲与专辑曲目写法一致，取
  `FeaturedPiece.album`；来源链接的图标与文案按域名判断：X 原帖、GitHub
  源码仓库、Instagram 原帖）
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

### 收藏页（一级菜单 · 收藏）

与精选页同一套通栏布局与背景（复用 `FeaturedWebglLightField` 石墨银光场），
左栏与拖拽分隔条同样让位。

- 页面标题「收藏」：内容区左上（紧邻 `PrimaryNav` 右侧）
- 当前对话名 + 收藏时间 / 消息数 / 代码段数：标题下方
- 收藏列表（复用 `FeaturedTitleWheel`）：内容区右上，每行「对话标题 · 收藏日期」，
  点选 / 拖动 / 吸附的交互与精选页完全一致
- 对话窗口（`favoritesConversation`）：页面中部 · 左，一栏，用户气泡右对齐、
  AI 回复左对齐；产出过代码的回复下方带一枚定位药丸，点它把右侧对应那栏滚进视野
  并高亮（悬停即预览高亮）
- 代码窗口：页面中部 · 右，对话里每一个 Strudel widget 各占一栏，栏间留 24px 间距，
  栏数多于屏宽时整排横向滚动；每栏标题为「第 N 版」，右上角为复制按钮
- 没有收藏内容时：页面中部居中的空态文案，右上不出列表

收藏数据目前是 `src/lib/favorite-conversations.ts` 里的 mock：工作室还没有「收藏」
这个动作，接上真实会话时只改这一个模块。

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
- 历史下拉面板（`HistoryPanel`）：左上展开

---

## 浮层 / 全局（两套布局通用）

- API 密钥弹窗（`ApiKeyModal`）：屏幕居中（模态）
- 分享加载中 / 加载失败提示：全屏遮罩 · 居中
- WAV 导出进度 / 弹窗（`TopActionBar` 内）：屏幕居中（模态）
- 语音输入按钮（`VoiceButton`，按住说话）：随输入区（当前浏览器支持时）
