# 移动同步弹窗、历史加载卡死与精选安全区修复方案

日期：2026-09-12

状态：待实施

本方案针对 2026-09-12 真机反馈，只落成文档，不在本次修改代码。范围包含移动端本机历史同步弹窗、登录后云端历史首次加载、进入精选页时的安全区颜色；不重做账号系统、历史数据模型或精选页面视觉。

## 一、移动端“本机历史正在同步／同步失败”弹窗

### 已确认原因

`src/App.tsx` 当前按 `isMobile` 使用两套布局：

- 桌面：`items-center justify-center`，有 `--color-overlay-backdrop` 和 `backdrop-blur-[2px]`；
- 手机：`items-end ... pb-20`，外层为 `pointer-events-none`，没有背景色和 blur。

“正在同步”和“同步失败”由同一个 `guestImportSessions` 容器渲染，只是内部文案和按钮不同。因此移动端两种状态都有同样的问题；失败弹窗也会位于底部且没有模糊背景。

### 修复方案

撤销同步弹窗的移动 toast 分支，手机和桌面都使用真正的模态结构：

```text
fixed inset-0 z-[300]
flex items-center justify-center
bg-[var(--color-overlay-backdrop)] backdrop-blur-[2px]
```

手机仍通过 `useVisualViewport` 读取当前视觉视口，在软键盘、地址栏伸缩时使用 `top + height` 定义模态覆盖区域；卡片在这个区域中垂直、水平居中。外层恢复 pointer events，卡片维持 `max-w-[90vw]`，手机使用现有 `p-4` 或统一为经视觉确认的间距。

同步中和同步失败必须共享同一个 `GuestHistorySyncDialog` 外壳，避免下一次只修其中一种状态。外壳负责：

- 全屏遮罩与模糊；
- 视觉视口居中；
- `role="dialog"`、`aria-modal="true"` 和可读标题关联；
- 层级和焦点边界。

内容区域负责进度指示或“稍后再说／重试”按钮。已有第二次失败自动退出逻辑保持不变。

安全区颜色同时将该同步模态视为 `auth` 类型的重遮罩。当前 App 的 `browserChromeOverlay` 只计算欢迎、账号和代码窗口，没有计算 `guestImportSessions`；实施时将其加入最高优先级的重遮罩条件，使上下安全区与模糊遮罩后的页面边缘连续。

## 二、登录后历史对话永久显示“加载中…”

### 已确认的状态机缺口

历史加载由 `useCloudSessionLibrary` 管理。当前有两个能够永久停在 `loading` 的路径。

#### 1. 请求没有超时

`src/services/cloud-session-repository.ts` 的 `requestJson()` 直接等待：

```ts
authHeaders(...) → fetch(...) → res.json()
```

虽然列表请求传入 `AbortController.signal`，但没有计时器。只要取 token、网络连接或响应体读取没有结束，`runCollectionRequest()` 就不会进入 success/error，历史状态会一直是 `loading`。

#### 2. scope 中止后留下孤立的 loading 状态

`useCloudSessionLibrary` 在 `enabled` 或 `ownerId` 变化时会：

- 增加 generation；
- abort 所有 controller；
- 清空 `requestsRef`。

但只有 `ownerId` 变化才 reset collection state。若同一个 owner 下 `enabled` 暂时变为 false，例如账号恢复、本地 sessions 重载或相关状态短暂切换，已有请求会被丢弃，`historyState.initialStatus` 仍是 `loading`。

重新启用后，`loadHistory()` 看到 `loading`，执行：

```ts
await requestsRef.current.get('history:initial');
return;
```

此时 Map 已被清空，等待 `undefined` 会立刻结束，但不会新建请求，也不会改状态，于是界面永久显示“加载中…”。这是确定的状态机冲突。

### Vercel Preview 多页面登录的判断

不同 Vercel Preview 域名属于不同 origin，浏览器的 localStorage、IndexedDB 和 Supabase 客户端登录状态默认彼此隔离。仅仅曾在多个 Preview 登录，不能直接导致当前页面的 `useCloudSessionLibrary` 卡在 loading。

仍需核对的情况是：

- 某个旧 Preview 是否使用过全局退出并撤销了服务端 refresh token；
- 当前 Preview 是否保存了失效 token；
- `/api/sessions` 是否返回 401/5xx 或根本没有结束；
- Supabase token 刷新是否长时间挂起。

这些情况应该最终进入明确的 error/重新登录状态，而不是无限 loading。修复应让状态机对它们都可恢复，无需依赖找出用户曾打开过哪些 Preview。

### 修复方案

#### A. 让 collection 状态与请求表保持一致

为 history 和 favorites 统一实现以下约束：

> `initialStatus === 'loading'` 时，必须存在属于当前 generation 的 initial request。

具体处理：

1. scope 被丢弃时，除了 abort 和清理 Map，还将仍处于 `loading` 的 initial/more 状态恢复为 `idle`；保留已经成功的 items 和 `ready` 状态。
2. `loadHistory()` / `ensureFavorites()` 遇到 `loading` 时先读取对应 Promise。存在则等待；不存在则把孤立状态恢复并立即发起新请求，不能直接 return。
3. 请求的 generation、ownerId 和 key 放入记录中，finally 只清理它自己登记的那一条，旧请求不能删除新请求。
4. `enabled=false` 时不显示“加载中”。App 的空状态区分“账号/本地初始化尚未完成”和“云端请求正在进行”；只有确实存在请求时才使用加载文案。

#### B. 为整个请求增加超时

在 repository 层提供统一的请求 signal 合并工具，将调用方取消 signal 与固定超时 signal 合并。超时应覆盖获取 access token、fetch 和读取响应体，而不是只包住 fetch 之后的一段。

建议首次列表请求超时 12–15 秒，详情和写请求使用同一基础设施但可独立配置。超时抛出可识别的 `SessionApiError` 或专用错误类型，例如 `code: 'timeout'`；UI 显示加载失败和重试，不再保持 spinner。

不通过 `Promise.race` 后丢下仍在运行的 fetch；超时必须真实 abort 底层请求，并在 finally 清理 controller 和 Map。

#### C. 处理登录凭证错误

- `/api/sessions` 返回 401：结束 loading，打开账号处理入口或提示重新登录；不要自动清空本地历史。
- token 获取为空或账号 ID 与 `expectedUserId` 不一致：归类为 auth error，不显示普通网络错误。
- 仅允许一次受控 session refresh 后重试；持续 401 停止自动循环。
- 登出继续使用当前 `scope: 'local'`，避免一个 Preview 的退出主动踢掉其他设备或 Preview。

#### D. 增加用户可恢复路径与诊断信息

首次加载超过超时后显示“历史加载失败”及重试按钮。重试必须从 error/孤立 loading 重新创建请求。日志记录 request key、generation、ownerId 的脱敏后缀、HTTP status、timeout/auth/network 分类；不记录 token、邮件地址或会话内容。

若本地 summary cache 有数据，先显示缓存行并在后台重试；失败提示不能覆盖已有历史。

## 三、进入精选页时安全区仍延迟或不切换

### 当前已经正确的部分

上一轮已完成：

- 移除手机根背景的 240ms CSS 过渡；
- `useBrowserChromeColor` 使用 layout effect；
- 一次更新 `theme-color`、CSS 变量、html background 和 body background；
- 收藏、对话、弹窗之间响应已由真机确认及时。

当前只有进入精选页仍复现，因此不应再次改写所有页面的颜色逻辑。

### 可能的剩余时序

进入精选由一次用户点击依次执行 `requestDeviceTilt()` 和 `handlePrimaryNavSelect('featured')`，页面状态在 React commit 后由 layout effect 写入精选色。对网页 canvas 这已在绘制前完成，但移动浏览器自己的顶部／底部工具栏可能在导航点击的同一帧先采样旧页面，之后不一定因一次 meta 内容修改立即重采样。

精选页还同时启动固定背景、WebGL 光场及封面 accent 读取。accent 异步到达会再次写色，但列表初始 base 色理应先立即生效。需要用真机日志确认：

- 点击进入后 `primaryNavItem` 是否立即为 featured；
- 四个输出是否立即变为 `#05070a` / `#DEDEE0`；
- 是网页根背景仍旧，还是仅浏览器系统栏仍旧。

如果四个输出已更新而系统栏仍旧，问题属于浏览器重采样时机；如果输出本身未更新，再查 React 状态路径。不能仅凭肉眼把两者合并为一个原因。

### 推荐修复：立即写入并在下一帧受控重申

将浏览器颜色控制点改成有序、可取消的两阶段提交：

1. page / overlay / theme / tint 改变时同步写入四个输出；
2. 取消上一次待执行 frame；
3. `requestAnimationFrame` 在下一帧重新应用同一个完整 context；
4. 下一帧执行前核对 context revision，旧导航的 frame 不得覆盖新页面。

现在已经有真机反馈证明“一次同步写入”对进入精选仍不足，因此可以启用上一份方案中预留的下一帧兼容路径。只重申一次，不使用循环、多个 `setTimeout` 或每帧采样 WebGL。

为了把第一次写入再提前，在 `handlePrimaryNavSelect('featured')` 的用户事件中先通知 browser chrome store 页面将切到 featured，再更新 React state；React layout effect随后用真实 tint/overlay context校正。这个入口应调用语义化的 `setBrowserChromePage('featured')`，不能在导航组件里直接操作 DOM 或硬编码色值。

精选 accent 的异步结果必须带页面/revision 检查：若用户已经离开精选，迟到的封面颜色不得重新写回精选安全区。

同时在 `pageshow` 和 `visibilitychange` 回到 visible 时重申最新 context，覆盖进入精选后切后台或浏览器工具栏折叠/展开带来的旧色恢复。

若真机日志证明网页根背景本身未在点击时更新，则优先实施导航事件中的提前通知；若只有系统栏滞后，保留 layout effect 并加入单次 rAF 即可。

## 四、实施文件

预计修改：

- `src/App.tsx`：统一同步弹窗模态布局；同步弹窗进入重遮罩条件；精选导航提前通知颜色 store；历史错误入口。
- 可选新增 `src/components/overlays/GuestHistorySyncDialog.tsx`：同步中／失败共用模态外壳。
- `src/hooks/useCloudSessionLibrary.ts`：scope 中止后的 loading 恢复、孤立请求自愈、请求 generation 约束。
- `src/services/cloud-session-repository.ts`：请求超时、signal 合并、稳定错误分类。
- `src/services/auth-service.ts`：只在诊断确认需要时增加受控 refresh；不改变 local sign-out。
- `src/hooks/useBrowserChromeColor.ts`、`src/lib/browser-chrome-color.ts`：revision、单次下一帧重申、页面提前通知和恢复事件。
- `src/lib/i18n.ts`：若现有历史加载错误文案不能表达超时/重新登录，补充中英文文案。
- 对应 App、cloud library、repository、browser chrome 和弹窗测试。

不修改数据库、Supabase session 策略、API 数据格式、历史内容合并规则或精选 WebGL 实现。

## 五、测试与验收

### 自动测试

1. 手机同步中和同步失败均渲染居中 modal，外层包含 overlay background、blur、正确 z-index 和视觉视口尺寸。
2. 同步中 spinner、失败按钮保持原行为；同步 dialog 打开时安全区使用 auth overlay 合成色，关闭后恢复当前页面色。
3. 请求在 loading 时被 disabled/owner scope 中止，再次 enabled 后会发起新请求并进入 ready/error。
4. `loading` 但 request Map 缺项时自动恢复，不会永远等待 undefined。
5. token、fetch、body 超时均 abort 并进入 error；点击 retry 创建新 controller 并可成功。
6. 401、网络失败、超时分别可识别；已有 cache 时仍显示历史行。
7. 进入 featured 同步写一次、下一帧重申一次；快速 featured → home 时旧 frame 不会写回 featured。
8. 迟到的 featured accent、pageshow、visibilitychange 都只能应用最新 context。

这次涉及共享请求状态机和 App 全局颜色控制，实施后运行相关定向测试、TypeScript、ESLint，并在提交前运行完整测试和生产构建。

### 真机验收

在 iOS Safari 与 Android Chrome、深浅主题各验证：

- 移动同步中和同步失败弹窗均处于当前视觉视口中心，背景压暗并模糊；键盘和地址栏伸缩后仍居中。
- 登录后历史在正常网络下出现；断网、失效登录、接口挂起时最迟在超时后给出错误和重试，不永久显示加载中。
- 当前 Preview 退出重登、从同账号其他 Preview 退出后重登、刷新及后台恢复均能加载。
- 对话／收藏 → 精选列表、精选 → 对话／收藏、精选列表 ↔ 详情快速往返；安全区无需刷新即可切换，迟到 accent 不污染其他页面。

验收时用调试日志同时记录 page context、四个颜色输出和请求状态。若四个颜色输出已经正确而某个系统栏仍保持旧色，记录设备、系统和浏览器版本；这属于平台工具栏能力边界，不继续用业务状态补偿。

## 六、实施顺序

1. 统一移动同步 modal，并覆盖同步失败状态。
2. 修复 cloud library 的孤立 loading，再加入端到端请求超时和错误分类。
3. 为精选进入加入 context revision、同步提前通知与单次下一帧重申。
4. 补自动测试，运行完整检查。
5. 按真机矩阵验证，并用日志区分网页输出与系统栏采样。
