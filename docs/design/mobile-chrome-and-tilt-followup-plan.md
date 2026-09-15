# 登录同步、倾斜描边、系统装饰色与收藏弹窗按钮修改方案

状态：第二、四、五节及第三节的描边部分已实施；第三节的圆角小段仍未处理。基于提交 `3d3a6d6` 的代码检查。

实施结果、测试覆盖与两处主动偏离方案之处记录在文末新增的《七、实施记录》。文中区分**已在源码确认**与**仅为候选原因、需真机验证**两类结论；第二节已用自动化测试验证，第三节圆角小段与第四节的真机接缝仍需真机确认，不把推测写成结论。

## 一、范围

| # | 条目 | 端 | 性质 |
| --- | --- | --- | --- |
| 1 | 登录后「本机历史同步失败」弹窗卡死 | 两端 | 修复（可在源码内定位，确定） |
| 2 | 中心专辑倾斜时描边不出现，四个圆角反而多出小段描边 | 手机 | 前半确定，后半待真机验证 |
| 3 | 手机系统顶部/底部区域颜色不跟随页面 | 手机 | 机制部分确定，详情页与返回行为待验证 |
| 4 | 收藏代码弹窗按钮改为「左：播放+复制／右：关闭」，去掉「在工作室中打开」 | 手机 | 修改 |

沿用 460px 移动断点，不顺带改平板或桌面设计（第 4 条明确只改手机弹窗，见该节「影响面」）。

## 二、登录后「本机历史同步失败」卡死

### 已确认的原因

弹窗在 `src/App.tsx:643` 起，条件只有 `guestImportSessions` 非空，`z-[300]` 全屏遮罩，**没有任何退出路径**——失败态只画一个「重试」。三件事叠起来构成死锁：

1. **重试重跑的是同一条失败项。** `importGuestSessions()`（`src/lib/session-import.ts:30`）在第一条失败处直接 `return { remaining: [normalized, ...items.slice(index + 1)], error }`，失败项排在 `remaining` 最前；`importGuestHistory()` 用 `remaining` 覆盖 `guestImportSessions`，下次重试又从它开始。所以只要有一条是**必然失败**的（离线、被服务端拒绝的载荷），就是无限循环，后面的几十条也一条都进不去。
2. **不能只把弹窗关掉。** `cloudLibraryEnabled`（`src/App.tsx:212`）要求 `guestImportGateUserId === auth.user.id`，而这个 gate 只在导入成功或压根没有可导入内容时才打开。把 `guestImportSessions` 置空而不开 gate，app 是不卡了，但账号的云端历史与收藏都不会加载——换一个更难发现的故障。
3. **阻塞本身对瞬时失败是多余的。** `importSession(..., { awaitCloud: true })`（`src/hooks/useSessions.ts:1253`）先 `dbPutSession(session, ownerKey)` 把会话写进**账号**本地库，再 `checkpoint` + `flush`；失败的只是 flush。而 `flushOne` 失败时 cloud-sync 已经 `emitStatus(... 'retrying' | 'offline')` 并 `scheduleSaveRetry(id)`（`src/lib/session-cloud-sync.ts:340`）——普通同步队列已经接管这条会话了。数据没丢，用户却被按在一个弹窗里等。

另外确认两件让方案安全的事：guest 行只在 `importSession` 成功后才 `deleteGuestSession`；`payload.id` 复用 guest 的 uuid，所以重复导入是覆盖同一行而不是产生副本。

### 方案

1. **失败态给出第二个出口。** 弹窗失败时画两个键：「重试」与「稍后再说」。「稍后再说」必须同时做两件事——`setGuestImportSessions(null)` **和** `setGuestImportGateUserId(auth.user.id)`——否则就是上面第 2 条那个更隐蔽的故障。成功态不变（仍是不可取消的进度窗，那段时间很短）。
2. **逐条隔离，不再整批中止。** `importGuestSessions` 改为遍历完全部项：成功的删 guest 行，失败的收集进 `failed`，返回 `{ imported, failed, error }`。一条坏数据不再挡住其余全部。`remaining` 语义由「从失败项开始的尾巴」改为「确实没进去的那些」。
3. **重试有上限，然后自动让路。** 连续失败 2 次后不再让用户在同一个按钮上打转：自动转入「稍后再说」的非阻塞形态，剩下的交给既有 `SessionSyncStatus` 报告。计数存在 ref 里，成功一次就清零。
4. **区分离线与被拒。** `isOnline()` 已经有。离线：文案说明会自动重试，不必留在这里等。被服务端拒绝：说明这几条留在本机，下次登录会再试一次。目前两种都塞进同一句 `accountActionFailed`，用户无从判断该等还是该走。
5. **「稍后再说」之后仍然可恢复。** guest 行还在，下次登录 `collectImportableGuestSessions` 会重新发现；`importPromptUserRef` 在同一次登录内已设为 userId，所以本次登录不会再弹——这正是要的行为（不骚扰，但不丢）。

### 文件与验收

`src/App.tsx`（弹窗与 `importGuestHistory`）、`src/lib/session-import.ts`、`src/lib/i18n.ts`（新增「稍后再说」及离线／被拒两句说明）。

定向测试：`importGuestSessions` 在中间一条失败时仍导入其余并把失败项单独报回；连续失败达上限后 App 不再停在阻塞态；「稍后再说」同时开了 cloud gate（断言 `cloudLibraryEnabled` 依赖的那条路径，而不只是弹窗消失）；离线与被拒两种文案。人工验收：在账号里制造一条必然失败的导入（断网 / 打桩 500），确认 app 仍可用、云端列表仍加载、同步状态如实报告。

## 三、中心专辑的倾斜描边

### 已确认

描边由 `group-hover:ring-1` 驱动（`src/components/featured/MobileFeaturedPage.tsx:1200` 附近的 `data-featured-cover-ring` span）。**手机没有 hover，所以它永远不出现。** 这不是 bug 而是当初的设计意图，现有测试就是这么写的：`MobileFeaturedPage.test.tsx:222`「rings the sleeve in the middle under a cursor, and only that one」，注释写着「on a phone, which has no pointer, it never shows at all」。本次是要推翻这个意图，那条测试要一并改。

桌面上描边与倾斜同时出现，是因为两者都由光标触发；手机的倾斜由设备触发，描边没有对应的触发源。

### 方案（描边）

把描边接到倾斜自己的强度上，而不是接到 hover 上：

1. `FeaturedTiltSurface` 已经把 `--tilt-highlight-opacity`（= gloss × 0.16）写在 surface 上。再写一个语义独立的 `--tilt-edge`（0..1，直接是 gloss），避免描边被高光那个 0.16 的系数牵着走。
2. ring span 改用 `box-shadow: inset 0 0 0 1px`，颜色沿用 `--featured-cover-ring`，透明度乘 `--tilt-edge`。手机上倾斜越多描边越明显，手机端正时完全消失——和光泽、投影同一条曲线。
3. 桌面语义不变：hover 时把 `--tilt-edge` 视为满值（pointer 分支的 gloss 本来就是 1，所以这一条自动成立，不需要额外分叉）。
4. 只有居中那张响应，和现在一致。

### 圆角小段描边：候选原因与排查顺序

**未在真机确认，以下是候选而非结论。** 结构上有三处可疑：

- **(a) 双层 3D 变换的合成层缝。** slot 外层已经在做 `rotateX/rotateY/rotateZ/scale`（`MobileFeaturedPage.tsx:1081`），`FeaturedTiltSurface` 在里面再叠一层 `rotateX/rotateY`；sleeve 是 `overflow-hidden rounded-[2px]` 且自带 `bg-[#05070a]`。栅格化时直边裁得准、只有曲线部分对不齐，露出的正好是四个圆角的小段——和描述吻合。
- **(b) `boxShadow: var(--tilt-shadow)` 落在圆角盒上。** 阴影带偏移，圆角处可能露出一段边。
- **(c) 高光 span 是 sleeve 的兄弟节点**（在 `FeaturedTiltSurface` 里，z-5），不被 sleeve 的 `overflow-hidden` 裁剪，自己也带 `rounded-[2px]`；两个圆角在 3D 栅格化后不重合。

排查顺序（逐个排除，每步只改一处）：依次临时关掉高光 span、`--tilt-shadow`、内层 rotate，看小段是否消失 → 定位到层；再比对深色与浅色主题，能区分「露出的是父层 `#05070a`」还是「露出的是页面底色」。

可能的修法（取决于排查结果，不预先选定）：给 sleeve 稳定合成层（`transform: translateZ(0)` 或 `will-change: transform`）；或把圆角只留在最外一层、内层不圆角；或改用 `clip-path: inset(0 round 2px)` 代替 `overflow-hidden` + `border-radius`。

### 文件与验收

`src/components/featured/FeaturedTiltSurface.tsx`、`MobileFeaturedPage.tsx`、`src/index.css`、`MobileFeaturedPage.test.tsx`（改掉 hover-only 那条）。

自动测试只能覆盖「倾斜时 `--tilt-edge` 随之变化、端正时为 0、非居中不响应」。描边观感与圆角小段必须真机验收：iPhone Safari 与 Android Chrome，深浅两套，缓慢左右／前后倾斜，确认描边随倾斜出现且圆角无多余线段。

## 四、手机系统顶部/底部区域的颜色

### 已确认的机制

浏览器画的那两条（刘海／状态栏、底部工具栏）只由两件事决定，**目前两者都跟页面无关**：

1. **`theme-color`**（Android Chrome 上下栏取它）：`applyTheme()` 里写死为 `BROWSER_THEME_COLORS[resolved]`，只有 `#0D0D0D` / `#F7F7FA` 两个值（`src/lib/appearance-preferences.ts:43`、`:145`）。整个 app 只有主题两态，没有页面维度。
2. **document canvas**（iOS Safari 的安全区／越界区取它）：`src/index.css:495` 的 `@media (max-width: 460px)` 里 `html, body { background-color: var(--color-conversation-surface) }`，硬编码成**对话页**的颜色。

所以「切到精选页，上下两条还是对话页的颜色」是这两条直接推出来的，确定。

### 待验证的部分

「进详情页会变、返回对话页不变」目前只有候选解释：`.featured-glow`（`index.css:2980`）和 `.featured-space-background`（`:2866`）都是 `position: fixed; inset: 0`，会铺到可视视口之外从而染到那两条；前者只在 `openAlbum` 非空时挂载，正好对上「进详情才变」。返回后不恢复，可能是 Safari 对采样色的缓存，也可能是 fixed 层退出的时机——**未验证，不作为结论**。

不管这一段的真相是什么，方案都不依赖它：不再靠「哪个元素恰好漏到栏下面」，改成显式声明。

### 取哪个颜色：底色，且是固定值

精选页的地是一块 WebGL 光场，本来就是一片渐变——没有哪一个纯色能和它「对齐」，追求逐页取实际渲染色是在追一个不存在的目标。所以装饰色取**页面的底色**，并且**写成常量**，不实时采样、不随封面或光场变化。

底色本身已经在源码里各有名字，直接用：

| 页面 | 深色 | 浅色 | 出处 |
| --- | --- | --- | --- |
| 工作室 / 收藏 / 设置 | `#0D0D0D` | `#F7F7FA` | `--color-conversation-surface`（三个页面的根都是 `bg-conversation-surface`） |
| 精选（书架与详情同色） | `#05070a` | `#DEDEE0` | `.featured-space-background` 及其 `[data-variant='paper']` 覆盖 |

两点让这个选择站得住：

- 精选的那两个值**就是 shader 自己的地色**——CSS 里它们的身份是「WebGL 还没来、不支持、或上下文丢失时页面该是的颜色」。拿它当装饰色，等于让系统那两条显示这一页在没有光场时的样子，是这一页所有纯色里最接近的一个。
- 手机上只有这两组值。工作室、收藏、设置三个页面的根都是 `bg-conversation-surface`，而 `#0D0D0D` / `#F7F7FA` 正是现在 `BROWSER_THEME_COLORS` 里的两个值。**所以改动其实是：精选页换成它自己的地色，其余页面维持现状。**

固定值还去掉了一整类问题：不用读 canvas、不用等 WebGL 就绪、不用在封面换色时重算，也不会出现装饰色追着渐变跳动。

### 方案

给「当前页面的浏览器装饰色」一个单一控制点：

1. **新增 `src/lib/browser-chrome-color.ts`**：持有上表那张常量表，`setBrowserChromeColor(page, theme)` 一次同时写 `meta[name="theme-color"]` 和一个 `--browser-chrome-color` 变量；`index.css` 在 460px 断点下让 `html, body` 读这个变量，删掉硬编码的对话色。一处写、两个消费端，Android 的 theme-color 与 iOS 的 document canvas 不会再各走各的。
2. **新增 `usePageChromeColor(page)`**：页面组件在激活时声明自己是哪一页，失活／卸载时恢复上一层。**做成栈**而不是单值——移动端多个页面同时挂载（工作室常驻在画廊后面），单值会互相覆盖。声明的是页面身份而不是颜色，主题由控制点自己查表。
3. **App 按可见页面驱动**：home / favorites / settings → 对话面色；featured → 精选地色，书架与详情同一个值。详情页的 wash 盖在地色之上，装饰色仍取地色——那两条要的是一个不动的底，不是会随封面变的色。
4. **主题切换要重算**：`applyTheme()` 之后让控制点按当前页面重新查一次表，否则深浅切换会留下上一个主题的装饰色。这是现在没有的一条路径，得一起加。

### 残留的接缝

精选页顶部会有一道「纯色装饰条 → 渐变光场」的过渡，这是取纯色的必然代价，不打算消除。它比现在的状态好：现在那两条是**另一页**的颜色（对话面色），改完是**这一页没有光场时**的颜色。如果真机上这道缝仍然明显，退路是把精选的装饰色往光场顶部的实际色调一档——仍然是常量，只是换一个数，不引入采样。

### 文件与验收

新增 `src/lib/browser-chrome-color.ts`、`src/hooks/usePageChromeColor.ts`；改 `src/App.tsx`、`src/index.css`、`src/lib/appearance-preferences.ts`（`applyTheme` 交出 theme-color 的写入权，改为通知控制点重算）。

自动测试覆盖：常量表两组值、栈的推入／弹出与恢复顺序、两个消费端（meta 与变量）同步、主题切换后重算。真机验收（必须）：iOS Safari 与 Android Chrome，深浅两套，home ↔ 精选 ↔ 详情 ↔ 收藏 往返各一遍，含后台返回与旋转，确认两条装饰区始终跟着当前页面，且返回对话页不需要刷新就恢复。

## 五、收藏代码弹窗的按钮

### 现状与目标

现状（`MobileFavoritesPage.tsx:617` 起的 `-top-11` 行）：左 = 播放；右 = 复制 + 在工作室中打开。窗口只能点背景关闭。

目标：左 = 播放 + 复制；右 = 关闭；去掉「在工作室中打开」。

这正好落回工作室手机代码浮窗已有的约定（`App.tsx:1795` 的注释：能对内容做的事在左，出口在右），实现上照抄那一行的结构与 `XIcon size={19}`，两个浮窗读起来就是一对。

### 影响面（已核对）

- `onOpenInStudio` 在 `MobileFavoritesPage` 里**只有这一个用处**，删掉按钮后该 prop 在移动端即无人使用。
- 但同一个 prop 由 `FavoritesPage` 同时传给桌面与移动两个实现，**桌面仍在用**（`FavoritesPage.tsx:579` 的 `favorites-script-open-in-studio`）。所以只删移动端的按钮与 prop，`FavoritesPage` 层的 prop 与 `App` 的 `handleOpenFavoriteInStudio` 都保留。
- 测试：`MobileFavoritesPage.test.tsx` 现有用例断言 `favorites-mobile-script-open-in-studio` 被调用，要改成断言其不存在；新增关闭键关窗的用例（背景点击关窗的行为保留）。

### 一处待用户确认

「收藏页代码弹窗」指的应是手机那个浮窗——桌面收藏的代码是页内 `Panel`，不是弹窗，也没有关闭键。所以本条只改手机。顺带一提：桌面收藏的代码仍是 12px 的纯文本 `<pre>`（上一轮 §5 只对齐了手机），要不要一起换成只读 CodeMirror 由你定，本方案未包含。

## 六、建议顺序

1. 第二节（登录卡死）。影响面最广、且完全可在源码内判定，先做完能让其余几条在真机上更好验证。
2. 第五节（收藏弹窗按钮）。纯局部，无依赖。
3. 第三节的描边部分（接到 `--tilt-edge`），连同那条 hover-only 测试。
4. 第三节的圆角小段：按排查顺序在真机上定位，再选修法。
5. 第四节（装饰色）。改动面横跨 App 与全局 CSS，放在最后；但色值已经定死成两组常量，不再需要真机比色来决定取值，真机只用来确认往返与恢复。

第三节后半与第四节的结论都要等真机；在那之前不把它们当作已修复。

## 七、实施记录

### 各项实现

1. **登录后同步失败卡死（第二节）** — `session-import.ts` 的 `importGuestSessions` 改为遍历完全部项，失败的收集进 `remaining`（保留原始相对顺序）而不是在第一条失败处截断；`App.tsx` 新增 `guestImportFailureCountRef`，第一次失败展示带「重试」与「稍后再说」两个键的弹窗（区分 `isOnline()` 判断出的「离线」/「被拒」两种文案），第二次连续失败自动调用与「稍后再说」相同的 `dismissGuestImportBlock()`（清空 `guestImportSessions`、打开 `guestImportGateUserId` 这个 cloud gate），不再让用户对着同一个按钮无限重试。`isOnline()` 抽成 `src/lib/network-status.ts` 共享给 `session-cloud-sync.ts` 与 `App.tsx`，不再各自定义一份。
2. **收藏弹窗按钮（第五节）** — `MobileFavoritesPage.tsx` 的浮窗动作行改为左侧播放+复制、右侧关闭（复用工作室手机代码浮窗同款结构与 `XIcon`），去掉「在工作室中打开」按钮与 `onOpenInStudio` prop；`FavoritesPage.tsx` 桌面分支的 `onOpenInStudio` 与 `App.tsx` 的 `handleOpenFavoriteInStudio` 均未改动，桌面仍可用。
3. **倾斜描边——描边部分（第三节前半）** — `FeaturedTiltSurface.tsx` 新增 `--tilt-edge`（= gloss，与已有的 `--tilt-highlight-opacity` 是同一个数但不带 0.16 的顶）；`MobileFeaturedPage.tsx` 的 `data-featured-cover-ring` 改为 `box-shadow: inset 0 0 0 1px var(--featured-cover-ring)` 叠 `opacity: var(--tilt-edge)`，跟随倾斜显隐，去掉了从未在手机上生效的 `group-hover:ring-1`。
4. **系统装饰色（第四节）** — 新增 `src/lib/browser-chrome-color.ts`（`BROWSER_CHROME_COLORS` 常量表：`studio` 复用原 `#0D0D0D`/`#F7F7FA`，`featured` 取 `#05070a`/`#DEDEE0`）与 `src/hooks/useBrowserChromeColor.ts`；`App.tsx` 按 `onFeaturedPage ? 'featured' : 'studio'` 单值驱动（favorites/settings 与 home 一样落在 `studio` 桶）；`appearance-preferences.ts` 的 `applyTheme()` 改为委托 `applyBrowserChromeColor('studio', resolved)`（启动时页面身份未知，默认工作室，App 挂载后立即按实际页面重算）；`index.css` 新增 `--browser-chrome-color`（默认引用 `--color-conversation-surface`，两套主题各自解析，不需要单独的浅色覆盖）作为 460px 断点内 `html, body` 背景色的落点。

### 与方案的主动偏离，附理由

- **未把描边机制推广到桌面 `FeaturedCard.tsx`。** 方案原文第 3 点设想桌面 hover 时 `--tilt-edge` 自然等于 1（因为 pointer 分支的 gloss 本来就是 1），从而复用同一套机制、不用分叉。实现时发现一个方案没考虑到的问题：`FeaturedTiltSurface` 的整个动效 effect 在 `prefers-reduced-motion: reduce` 时整体提前 return（连指针事件监听都不注册），如果把桌面的描边也改接 `--tilt-edge`，会导致减弱动态效果的用户在桌面上悬停不再有任何描边反馈——而现状是纯 CSS 的 `group-hover:ring-1`，与减弱动态效果完全无关，一直都能正常显示。这是一个访问性上的实质倒退，不是方案本来想做的事。因此本次只改了移动端（`MobileFeaturedPage.tsx`）的描边实现，桌面 `FeaturedCard.tsx` 的 `group-hover:ring-1` 未动，两者不共享同一套机制，但都各自证实是正确行为。
- **`usePageChromeColor` 没有做成栈。** 方案第 4 节第 2 点设想每个页面组件各自调用一个栈式 hook 声明自己的身份。实现时发现移动端的 `primaryNavItem` 本身就是一个互斥的单值状态（home/featured/favorites 之间严格互斥，account 会转成 modal 不进入这个状态机，settings 在移动端根本没有路径进入），不存在「多个页面同时声明自己是前台页」的场景，栈的入栈/出栈顺序问题根本不会发生。于是简化为 `useBrowserChromeColor(page)` 一个不带栈的 hook，在 `App.tsx` 顶层调用一次，参数是 `onFeaturedPage ? 'featured' : 'studio'` 这个已有的派生值——比栈简单，且没有牺牲任何正确性。

### 未处理：圆角小段描边（第三节后半）

**没有尝试修复，也没有应用任何推测性改动。** 这是一个 3D 变换下的合成层接缝类问题，方案本身把它定性为需要在真机上逐项开关（高光 span、`--tilt-shadow`、内层 rotate）才能定位到层的诊断过程——这类视觉渲染问题必须真的在浏览器里看到实际栅格化结果才能判断，而不是读代码就能确定。本环境没有真机或可视化渲染手段来做这件事。曾考虑过几个「反正没坏处」式的预防性改动（给 sleeve 加稳定合成层、把高光 span 挪进 sleeve 的裁剪区域内），但每一个都有除三条候选原因之外的、未经验证的副作用面（不同浏览器的图层提升策略不同，稳定合成层可能引入次像素模糊；挪动高光 span 需要重构 `FeaturedTiltSurface` 的插槽结构，牵动桌面与移动两个调用点），在没有真机反馈的情况下应用这类改动等于是在赌，而不是在修复——所以没有做。

### 已执行的检查

- `npx tsc -b --noEmit`：通过。
- `npx eslint src tests shared server api --max-warnings=0`：通过。
- `npm test`：135 个文件、1632 个用例全部通过（较上一轮新增 16 个用例）。
- 新增测试文件：`src/lib/__tests__/browser-chrome-color.test.ts`、`src/hooks/__tests__/useBrowserChromeColor.test.tsx`；并在 `App.test.tsx`、`session-import.test.ts`、`MobileFavoritesPage.test.tsx`、`MobileFeaturedPage.test.tsx`、`FeaturedTiltSurface.test.tsx` 的现有测试中补充或改写了定向用例。
- 未启动开发服务器，未驱动浏览器，未跑生产构建。

### 尚未验证

- 第三节圆角小段的根因与修法：完全未处理，见上。
- 第三节描边、第四节装饰色的真机效果：均只在自动化测试层面验证了逻辑正确（数值随倾斜变化、按页面切色），实际观感——描边是否明显、精选页顶部纯色到光场的接缝是否刺眼——仍需 iPhone Safari 与 Android Chrome 真机核对。
- 第二节的「稍后再说」路径：自动化测试已覆盖状态流转，但用户真实感知（弹窗文案是否清楚、被拒后下次登录确实重新出现）建议真机走一遍。
