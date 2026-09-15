# 工作室、移动端抽屉与精选交互修改方案

状态：已实施（第一～七节）。方案基于提交 `2a302a5` 的代码检查。

实施结果与偏差记录在文末《九、实施记录》。标题上限按方案建议取 60 个可见字符（字素簇），用户未另行指定。设备倾斜的真机验收尚未进行。

## 一、范围与现状

| 需求 | 适用端 | 已确认的实现情况 | 建议修改方向 |
| --- | --- | --- | --- |
| 工作室代码 widget 添加播放按钮 | 桌面 | 两种 widget 已支持播放，但 Sidebar 没有传递播放状态和回调 | 接通 App → Sidebar → ConversationView，复用手机组件 |
| 离开对话页后取消历史选中底色 | 手机 | MobileNavDrawer 始终接收 `sessions.currentId` | 根据当前页面计算展示用选中 ID |
| 会话标题最大长度 | 两端 | 自动标题截为 20 个 UTF-16 单元；重命名限制 60；导入和完整标题恢复没有统一限制 | 建立统一标题规范，并限制历史数据的展示 |
| 收藏代码窗口与 CodePanel 一致 | 手机 | 收藏使用 12px 的纯文本 pre；CodePanel 使用带行号、高亮和滚动状态的编辑器 | 独立只读代码视图，复用编辑器视觉与滚动规则 |
| 历史下方空白处长按选中文本 | 手机 | 禁止选中仅覆盖历史条目与菜单，没有覆盖抽屉空白区域 | 抽屉级禁止选中，输入框明确放行 |
| 中心专辑跟随设备倾斜 | 手机 | 已接入方向事件，但授权结果被忽略，首次失败被缓存，角度响应存在二次衰减 | 修正权限触发和状态处理，验证读数、激活条件及角度映射 |

这次桌面端允许改动第 1、3 项；其余交互限定在移动端。沿用项目现有 460px 移动布局边界，不顺带修改平板或其他页面设计。

## 二、桌面工作室代码 widget 播放按钮

### 现状与原因

- `src/components/conversation/ConversationView.tsx` 已支持 `isPlaying`、`playingCode`、`onPlayCode`、`onStopCode`。
- 有 revision 的消息使用 `CodeDiffView`，播放内容为 `revision.afterCode`；没有 revision 的旧消息使用普通代码 widget，播放内容为 `message.code`。
- 手机端 App 已传入 `strudel.activeCode` 和播放、停止回调。
- 桌面端通过 `Sidebar` 渲染 ConversationView，Sidebar 的接口和调用都缺少上述属性，因此共享组件的播放按钮不会显示。

### 修改方案

1. 在 Sidebar 增加并转发四个属性，App 的桌面分支传入与手机分支相同的数据和回调。
2. 共用现有 widget，不创建单独的桌面按钮。尺寸、图标、分隔缝、颜色、播放/停止切换均以手机工作室 widget 为准。
3. 更新 CodeDiffView 中“仅手机需要播放按钮”的过时注释。
4. 点击播放区域只执行播放；点击左侧区域仍展开/收起代码；复制按钮仍只复制。

### 播放语义

- 点击 V1 播放 V1 的完整代码；点击 V2 后播放 V2，V1 恢复播放图标。
- 判断正在播放哪个版本使用 `activeCode`，不使用尚未执行的编辑器草稿 `code`。
- 与现有手机行为一致：播放历史版本会把该版本放入工作室编辑器并执行。这不是一个独立、不会改变编辑器内容的预听功能。
- 停止只停止声音，不清空代码，不新增消息或 revision。
- 两个 widget 代码完全相同时，沿用已有的按代码内容匹配方式，不额外引入消息级播放器。
- 引擎未就绪、执行失败继续走现有播放错误反馈；不抢先把按钮设置为成功播放状态。
- 沿用 `useStrudel()` 的音频生命周期，不创建播放器、AudioContext 或绕过现有播放接口。

### 修改文件与验收

主要文件：`src/App.tsx`、`src/components/conversation/Sidebar.tsx`、`src/components/conversation/CodeDiffView.tsx`。ConversationView 原则上只在发现共享行为缺口时调整。

针对 Sidebar 属性转发、普通 widget 和 diff widget 的播放/停止增加定向测试；覆盖编辑器草稿不同于 activeCode、执行失败及复制/展开不误触发播放。手动比较桌面与手机 widget 的按钮样式。

## 三、移动端离开对话页面后取消历史选中

### 现状与原因

App 中 MobileNavDrawer 的 `history.currentId` 无条件来自 `sessions.currentId`。精选和收藏打开后，工作室保留在后台，会话 ID 也保留，历史列表因此继续为旧条目绘制选中底色。

### 修改方案

1. 只计算一个展示用 ID：当前可见页面是工作室时传 `sessions.currentId`，否则传 `null`。
2. 判断使用明确的工作室页面条件，例如 `primaryNavItem === 'home'`；当前 `onStudioPage` 是排除精选和收藏的写法，若未来出现其他移动页面，不能误当工作室。
3. 不把底层 `sessions.currentId` 清空，不调用 `switchTo(null)`，不删除会话或清空编辑器。页面高亮和会话保存归属分开处理。
4. 从抽屉点选历史条目时，先回工作室，再走已有切换流程；其选中状态随实际打开的会话更新。
5. 关闭“更多”抽屉本身不改变选中状态；在工作室打开代码窗口也不算离开对话页面。

主要修改位置：`src/App.tsx` 的 MobileNavDrawer 属性组装。除非有其他调用路径，不需要修改 HistoryPanel 内部选中规则。

验收：工作室 A → 收藏 → 更多，没有会话选中；工作室 A → 精选 → 更多，同样没有选中；再打开 A 后恢复高亮；整个过程 A 的代码和消息不变，后台生成结果仍写入原会话。桌面历史高亮行为保持原样。

## 四、两端统一会话标题长度

### 现状与本轮规则

目前 `deriveTitle()` 会写入“前 20 个字符 + …”，重命名输入框 `maxLength=60`，保存时又执行 `slice(0, 60)`。分享导入、外部导入、分支标题、云端详情和摘要没有统一规则。上一轮 `fullSessionTitle()` 将符合旧自动标题模式的标题恢复成整段首条用户消息，可能把很长的正文当成标题。

建议统一为：**最多 60 个用户可见字符，省略号包含在 60 个以内。超过上限时显示前 59 个字符加一个 `…`。**

“用户可见字符”按 Unicode 字素簇计数，中文、英文、组合字符和完整 emoji 均按一个可见单位处理。避免直接按 UTF-16 的 `length`/`slice` 截断 emoji。优先使用 `Intl.Segmenter`；实现时核对项目目标环境，缺少时使用明确的兼容分段策略，并记录降级限制。

### 统一处理过程

1. 去除标题首尾空白，把内部换行及连续空白整理为空格，使标题保持单行。
2. 空标题沿用已有“新会话”文案。
3. 对已确认属于旧自动截断的标题，先从第一条用户消息恢复，再应用 60 字上限。只有精确匹配旧派生规则时才恢复，不能把用户自己命名并带省略号的标题扩展成正文。
4. 所有标题写入和展示入口采用同一规范。建议新增 `shared/session-title.ts`，仅放无浏览器副作用的纯函数和长度常量；本地语言的空标题回退由调用端提供。
5. CSS 的宽度省略和业务长度限制各自负责不同问题：窄列表仍可用 CSS 截断；滚动标题可展示宽度上没放下的内容，但最多滚动规范化后的 60 字。

这会调整上一轮“恢复完整正文作为标题”的行为：保留对旧 20 字截断的恢复能力，最终内容仍受新上限约束。完整用户输入继续完整保存在消息正文中。

### 需要覆盖的入口

| 入口 | 文件或位置 | 处理方式 |
| --- | --- | --- |
| 第一条用户消息派生标题、编辑首条消息后派生 | `src/hooks/useSessions.ts` 的 deriveTitle 及调用点 | 使用统一 60 字规则 |
| 手动重命名 | useSessions、HistoryPanel、EditableSessionTitle、App 的云端摘要乐观更新 | 本地保存、云端保存和摘要显示使用相同结果 |
| 粘贴与中文输入法 | 两个重命名输入框 | 组合输入期间不截断，compositionend/保存时规范化；不再单独依赖 UTF-16 maxLength |
| 分享、外部导入、分支会话 | useSessions 的 importSession、importOddeNovaSession、branchFromMessage 等 | 新标题落库前统一处理，分支后缀在总预算内预留空间 |
| 收藏详情与列表 | `src/lib/full-session-title.ts`、`src/lib/session-favorites.ts`、App、FavoritesPage/FavoritesList | 先恢复旧自动标题，再截到上限；详情和摘要一致 |
| 云端数据与旧缓存展示 | `server/session-utils.ts`、`server/session-pagination.ts`、前端读取适配层 | 摘要和详情展示均兜底，不能只依赖本机已有完整消息 |
| 服务端新写入 | `api/sessions.ts` 的保存/派生写入入口 | 使用共享规范，阻止其他入口继续生成超长标题 |

仅有云端摘要、没有完整消息时，无法从省略号推断被省略的原文：先规范化摘要，详情到达后再按旧标题匹配规则恢复并规范化。不要为展开所有标题批量下载整个收藏库。

### 历史数据与一致性

- 不做一次性的全量数据库改写；历史超长标题先在读取/展示边界受限，用户主动改名或新建、导入时写入规范化标题。
- 只为标题展示截断时，不更新 updatedAt，不重新排序，不制造云端保存任务。
- 不修改历史消息正文和代码；导入内容哈希与保存结果使用一致的标题规范，避免下一次相同外部导入误判成用户编辑并产生分支。
- 标题不是唯一标识。相同前缀截断后的重复名字不合并，收藏、切换与删除继续使用会话 ID。

验收：0/1/59/60/61 字、长中文、长英文、emoji、组合字符、粘贴、中文组合输入、手动省略号、旧自动标题、导入标题和分支后缀；两端列表、底部标题和顶部标题结果一致；超过上限的消息正文保持完整；反复规范化不会追加多个省略号。

## 五、移动收藏代码窗口与 CodePanel 对齐

### 现状对照

| 项目 | 工作室 CodePanel | 当前移动收藏代码窗口 |
| --- | --- | --- |
| 代码视图 | CodeMirror，行号和语法高亮 | 纯文本 pre/code |
| 字体 | ABeeZee；触摸设备代码和行号 16px | ABeeZee，12px |
| 行高 / 字距 | 2.0 / 0.1em | 1.7 / 0.04em |
| 行号列 | 手机 44px | 无 |
| 长行 | 自动换行，续行悬挂缩进 3ch | 普通换行和 break-words |
| 滚动条 | 6px，静止透明；滚动后 2000ms 隐藏，200ms 颜色过渡 | 没有接入代码窗口的滚动显示状态 |
| 浮窗高度 | 88%，最大 700px | 76% |

这些数值是当前源码基准；实施时应复用规则来源，避免继续复制出两套不一致的常量。

### 推荐实现

1. 新增一个独立只读代码视图，例如 `src/components/common/ReadOnlyCodeView.tsx`。使用项目已有 CodeMirror/Lezer 依赖及 `oddenova-syntax-highlight.ts` 的高亮扩展。
2. 不把第二个完整 CodePanel 挂到收藏页。工作室编辑器绑定共享 Strudel 服务，重复挂载可能改变编辑器宿主和代码归属。只读视图只接收代码字符串，禁止编辑、自动执行和写回会话。
3. 复用现有编辑器主题 CSS 变量、字体、行号、换行缩进和顶部/底部渐隐。只读区域不能因点击唤起软键盘；仍允许用户选择代码文本和使用已有复制按钮。
4. 移动收藏浮窗的宽度边距、圆角、背景、外部操作栏间距、高度与工作室代码浮窗对齐；高度采用同一 88%/700px 基准。收藏自身的播放、复制和“在工作室打开”功能保留，不凭空新增编辑、保存、生成或可视化区域。
5. 把 CodePanel 的滚动状态处理提取为可复用 hook，例如 `useScrollActivity`：滚动时设置 `data-scrolling`，最后一次滚动后 2000ms 清除，关闭或卸载时清理计时器。对两个代码窗口使用同一份规则。
6. 优先复用 `.code-scroll-autohide .cm-scroller`；避免整个站点滚动条一起改动。沿用 Firefox 的 fallback 与减少动态效果设置。
7. 打开新版本时更新只读文档并回到顶部；播放/停止同一版本只更新图标，保持阅读位置。关闭再打开同一版本可保留滚动位置。主题变化不重建编辑器或重置滚动。
8. 隐藏状态按需初始化，避免工作室和收藏页常驻时无意义重建代码视图；展示前保证尺寸测量已更新。

主要文件：MobileFavoritesPage、CodePanel 的滚动 hook 接入点、`src/index.css`、新增只读视图和滚动 hook。现有 `src/lib/editor-preferences.ts`、`src/lib/oddenova-syntax-highlight.ts` 作为复用源；除非复用确有缺口，不改共享播放器。

验收：两窗口展示同一代码时排版、高亮、行号及滚动策略一致；静止无常亮滚动条，连续滚动不提前消失；短代码没有无意义滚动条；超长 token 不撑破浮窗；上千行代码可正常阅读；播放不重置滚动；打开收藏只读窗口不修改工作室代码；浅色/深色均可读。

## 六、更多抽屉空白区域禁止长按选中文本

### 现状与方案

HistoryPanel 仅给条目设置 `select-none` 和 `-webkit-touch-callout:none`。抽屉标题、分组和历史底部留白没有统一约束，长按空白仍可能被浏览器用于选择附近文本。

1. 给 MobileNavDrawer 的对话框容器增加专属 class，例如 `mobile-nav-no-select`。覆盖抽屉及普通后代的 `user-select:none`、`-webkit-user-select:none` 和 `-webkit-touch-callout:none`，包含搜索未开启时的标题和列表空白区。
2. 为搜索 input、标题编辑 input、textarea 和可编辑内容显式恢复 `user-select:text` 及系统编辑菜单。禁用规则不要波及真正的输入。
3. 在抽屉边界处理 contextmenu：来自非编辑内容时取消浏览器菜单；来自输入区域时放行。历史自定义长按菜单继续使用现有计时、灰底和缩放逻辑。
4. 不在整个抽屉的 touchstart/touchmove 中无条件 preventDefault，以免破坏上下滚动和上轮加入的左滑收起。
5. 如需清理已有选区，仅清理端点确实位于当前抽屉内的选区，不能全局清空用户在其他代码或输入框中的选择。

主要文件：MobileNavDrawer、`src/index.css`。只有发现历史菜单冒泡冲突时才修改 HistoryPanel。

验收：长按条目下方空白、分组标题、空列表均不产生文本选区；搜索词和重命名文本仍可选择/粘贴；长按条目仍显示灰底和菜单；左滑收起、纵向滚动均正常。

## 七、精选中心专辑的设备倾斜

### 已确认与待验证

现有链路是：MobileFeaturedPage 根节点 pointerdown → requestDeviceTilt → deviceorientation → FeaturedTiltSurface → CSS rotateX/rotateY。

已确认的代码问题或限制：

- `askedRef` 在请求发出前就变为 true；模块级 pending 又缓存整个请求。拒绝或异常后，同一页面生命周期不再尝试。
- 权限函数把异常统一压成 false，调用方忽略返回值，无法区分用户拒绝、调用时机错误、不支持和已授权但没有事件。
- 授权只在精选页面自身被触摸时触发。通过更多菜单进入精选后，如果只是转动手机，没有再次触摸精选页面，这条授权路径没有运行。
- 权限请求绑在 pointerdown。触摸事件是否满足当前浏览器的用户激活要求需要核对，不能仅因为回调来自触摸就认定授权有效。
- 角度渲染为 `方向 × 8° × strength`，而设备 strength 又由方向幅度产生；小角度发生二次衰减。比如单轴变化 2° 时归一化为 0.1，strength 为 0.15，最终只有约 0.12°，视觉上可能像没有响应。
- 在 reduced-motion 或 `active && centred && !snapping && !coverAway` 不满足时，组件会停用倾斜，这是现有设计。实际设备是否卡在某个停用条件，尚未验证。

还不能断言用户手机的唯一原因。没有获得用户的设备型号、浏览器版本、权限状态和事件读数。已检查的 vercel.json/vite.config.ts/index.html 中未发现显式陀螺仪权限策略配置，但这不证明实际响应头、嵌入容器或浏览器设置允许传感器。

### 权限与入口

浏览器标准将方向事件置于安全上下文，并规定需要提示授权时 requestPermission 必须满足短暂用户激活要求；实际支持以运行时能力检测为准。[W3C Device Orientation and Motion](https://www.w3.org/TR/orientation-event/#dom-deviceorientationevent-requestpermission)

建议实现：

1. 优先在手机用户点击“精选”入口的可信 click 回调内，同步启动权限请求，再进行页面导航；请求前不要 await 保存、动画或网络任务。该操作不等待权限结果才打开页面。
2. 对直接到达精选、恢复页面等没有入口点击的情况，在权限尚未决定时提供一次轻量的“开启倾斜效果”入口，点击后发起浏览器授权。不要假设无手势进入页面也能自动授权。
3. 用明确状态替换 askedRef 与永久 false 缓存：unsupported、prompt、requesting、granted、denied、retryable-error。请求进行中合并调用，授权成功可复用结果。
4. 用户明确拒绝后不自动重复弹窗；调用时机或临时异常可以在下一个明确点击中重试。拒绝后的用户主动重试能否成功由浏览器决定，需要必要时引导修改网站权限。
5. 没有 requestPermission 方法但支持方向事件的平台直接监听；非安全上下文或不支持时保持静态。权限通过但暂时没有数据单独处理，不把它标为“用户拒绝”。

### 读数与画面

1. 首个有效有限数值读数作为基准；拒绝 null、NaN、Infinity。
2. 继续只让中心专辑响应方向变化。滚动切换专辑或飞入详情过程中暂停；稳定后用当前姿态重新校准，避免重新激活时突然歪斜。
3. 保留约 20° 的设备操作范围和最大约 8° 的封面倾角。设备输入的角度改为一次线性映射；strength 继续控制光泽和阴影，不再二次压低几何角度。桌面鼠标分支保持原有映射。
4. 继续用 requestAnimationFrame 平滑处理并直接更新元素样式，不让传感器事件驱动整个 React 页面高频重渲染。
5. 根据屏幕方向映射 beta/gamma，并在方向切换、页面回到前台、重新激活中心专辑时校准基准。角度跨边界采用合理差值，避免跳变。
6. 精细指针设备的 pointermove 仅处理真正鼠标输入；混合设备收到触摸 pointermove 时，不应把设备倾斜目标重置到零。此项是防御性检查，不宣称是已复现的主因。
7. 监听、动画和 reduced-motion 的变更都要有清理路径。减少动态效果开启时维持静态；不要把尊重该设置视为 bug。

### 调试和验收

开发阶段按顺序确认：安全上下文 → 权限状态 → 是否收到有效事件 → 是否处于激活中心 → 目标角度 → CSS transform 是否改变。必要的观测仅放开发日志或测试探针，不展示给普通用户。

主要文件：`src/components/featured/featured-device-tilt.ts`、`FeaturedTiltSurface.tsx`、`MobileFeaturedPage.tsx`，以及 App/导航中明确的精选入口。只有实际验证响应头或嵌入策略阻断传感器时才调整部署配置。

自动测试覆盖权限成功、明确拒绝、异常后重试、并发合并、空读数、小角度输出、最大倾角、非中心停用、卸载清理、触摸不抢占陀螺仪、屏幕方向映射。

真机验收至少包含 HTTPS 下的 iPhone Safari 和 Android Chrome：首次授权后缓慢左右及前后倾斜 5–10°，中心封面应明显但平滑地响应；两侧专辑不倾斜；切换专辑、打开关闭详情、页面后台返回后仍工作；拒绝授权不影响正常浏览和播放；减少动态效果时保持静态。应用内浏览器/PWA 作为补充记录，不用模拟事件代替真机结论。

## 八、实施顺序与交付验证

建议顺序：

1. 完成抽屉选中状态和空白区选中限制，验证不会破坏原有长按与滑动。
2. 接通桌面 widget 播放，验证 activeCode 及会话归属。
3. 实施统一标题函数和入口适配，先覆盖老数据、Unicode 和外部导入一致性。
4. 新建只读代码视图、复用滚动 hook，完成移动收藏窗口样式对齐。
5. 修正倾斜授权状态和角度映射，最后进行真机验收。

实施后的自动检查：

- 针对 App、Sidebar、ConversationView、MobileNavDrawer、MobileFavoritesPage、CodePanel、useSessions、标题工具与传感器工具运行相应定向测试。
- 涉及组件属性、状态、数据入口和新增 hook 后，运行 TypeScript 检查及修改文件 ESLint。
- CSS 微调只检查差异和视觉结果，不为每次间距调整重复全套检查。
- 只有到请求提交/推送/发布、改动升级为广泛高风险，或其他明确要求时，再运行全量测试和生产构建。
- 遵循仓库要求，不由代理启动开发服务器或驱动浏览器验证 UI；手机上的输入、滚动、选择和实际陀螺仪响应由用户真机验收。

完成实施后应报告每项实现结果、实际执行的检查，以及尚未进行的真机验证。本方案不代表这些检查已经执行，也不把传感器根因假设写成已修复结论。

## 九、实施记录

本节记录实际改动与验证情况，覆盖第一～七节。

### 各项实现

1. **桌面工作室 widget 播放（第二节）** — `Sidebar` 增加并转发 `isPlaying`/`playingCode`/`onPlayCode`/`onStopCode`，App 桌面分支传入与手机相同的 `strudel.activeCode` 与播放、停止回调。复用共享 widget，未新建桌面按钮。`CodeDiffView` 与 `ConversationView` 中“仅手机需要播放按钮”的注释已改写。
2. **移动端离开对话页取消选中（第三节）** — App 新增 `historyHighlightId = primaryNavItem === 'home' ? sessions.currentId : null`，按方案采用显式工作室条件而非 `onStudioPage` 的排除写法；`onStudioPage` 仍只负责布局。未清空 `sessions.currentId`，未调用 `switchTo(null)`。`HistoryPanel` 行增加 `data-session-row` / `data-session-active`，供测试读取选中状态。
3. **统一标题长度（第四节）** — 新增 `shared/session-title.ts`（`SESSION_TITLE_LIMIT = 60`、字素簇计数、`normalizeSessionTitle`、`deriveSessionTitle`、`clampSessionTitleInput`、`titleWithSuffix`），`src/lib/session-title.ts` 为前端转发。覆盖入口：`deriveTitle`、`renameSession`、两个重命名输入框（改用 `useSessionTitleInput`，去掉 `maxLength`，组合输入期间不截断）、`importSession`、`importOddeNovaSession`、`branchFromMessage`、`fullSessionTitle`、`sessionAsFavorite`、`session-storage.normalizeSession`（读取边界，不改写数据库、不动 `updatedAt`）、`server/session-utils.ts`、`server/session-pagination.ts`、`api/sessions.ts` 的“继续收藏会话”写入。外部导入哈希改为按落库标题计算，修正了长标题重复导入被误判为用户编辑并产生分支的问题。分支后缀通过 `titleWithSuffix` 在总预算内预留空间。
4. **收藏代码窗口对齐 CodePanel（第五节）** — 新增 `src/lib/read-only-code-editor.ts` 与重写的 `ReadOnlyCodeView`：只读 CodeMirror 视图，按需动态 import，复用 `@lezer/javascript` 语法树与 `oddenova-syntax-highlight`，并通过 `.cm-editor` 继承既有字体、行号、行高、字距、换行悬挂缩进、上下渐隐与滚动条规则。`readOnly` 与 `editable: false` 同时使用，点击不唤起软键盘、仍可选择复制。浮窗高度改为 88% / 700px，与工作室代码浮窗一致。`useScrollActivity` 抽出滚动状态规则，`CodePanel`、只读视图、`ArchivedConversationView`、`MobileFeaturedDetail` 共用同一份（后两处此前各有一份 2000ms 副本，注释还指向已删除的常量）。
5. **抽屉空白区禁止长按选中（第六节）** — `MobileNavDrawer` 对话框容器加 `mobile-nav-no-select`（index.css 中覆盖抽屉及后代，输入类元素显式恢复），并在抽屉边界处理 `contextmenu`：非编辑目标取消浏览器菜单，输入区域放行。清理选区只在选区两端都位于抽屉内时执行。未对 touchstart/touchmove 做无条件 preventDefault。
6. **设备倾斜（第七节）** — `featured-device-tilt.ts` 以 `DeviceTiltState`（`unsupported`/`prompt`/`requesting`/`granted`/`denied`/`error`）替换 `askedRef` 与永久 `false` 缓存：并发请求合并，`granted`/`denied`/`unsupported` 复用，`default` 与异常记为可重试的 `error`。读数拒绝 null/NaN/Infinity；新增按屏幕方向映射 beta/gamma（`screenTiltReading`）与跨边界最短角差（beta 周期 360，gamma 不参与环绕）。`FeaturedTiltSurface` 把几何角度与光泽分开（`gloss`），设备输入改为一次线性映射，消除二次衰减；`pointermove` 仅处理真正鼠标输入；在 `visibilitychange` 与屏幕方向变化时重新校准基准，并清理全部监听。入口：手机抽屉“精选”行在可信 click 内同步发起授权再导航（不 await）；页面任意 pointerdown 仍可重试；权限未决且平台确有授权门时，shelf 上显示一次轻量的“开启倾斜效果”入口（`featuredEnableTilt`）。

### 已执行的检查

- `npx tsc -b --noEmit`：通过。
- `npx eslint src tests shared server api --max-warnings=0`：通过。
- `npm test`：133 个文件、1616 个用例全部通过。
- 新增测试：`src/lib/__tests__/session-title.test.ts`、`src/hooks/__tests__/useScrollActivity.test.tsx`、`src/components/common/__tests__/ReadOnlyCodeView.test.tsx`、`src/components/featured/__tests__/featured-device-tilt.test.ts`、`src/components/featured/__tests__/FeaturedTiltSurface.test.tsx`；并在 `Sidebar`、`MobileNavDrawer`、`MobileFeaturedPage`、`App`、`useSessions`、`session-storage`、`full-session-title`、`EditableSessionTitle`、`MobileFavoritesPage` 的现有测试中补充定向用例。
- 未启动开发服务器，未驱动浏览器；未运行生产构建。

### 尚未验证

- 第七节要求的真机验收（HTTPS 下 iPhone Safari 与 Android Chrome 的首次授权、5–10° 缓慢倾斜响应、切换专辑与详情往返、后台返回、拒绝授权后的正常浏览、减少动态效果时保持静态）全部未做。倾斜问题的根因仍未在真机上确认，本次改动是按方案修正已确认的代码缺陷，不代表已复现并修复用户报告的现象。
- 两端列表、顶部/底部标题、收藏浮窗排版与滚动条手感的视觉比对，以及手机上的长按、选择、滑动与滚动手感，均由开发者真机验收。
