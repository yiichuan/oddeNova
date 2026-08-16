# 视觉组件位置速查

页面所有视觉组件，格式为 `名字：位置`。位置以屏幕区域描述（左/右/上/下/居中）。
布局分**桌面态**与**移动态**两套（`App.tsx` 中以 `isMobile` 分支）。

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
