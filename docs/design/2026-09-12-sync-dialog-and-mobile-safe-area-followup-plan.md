# 本机历史同步弹窗与移动端安全区颜色修复方案

日期：2026-09-12

状态：待实施
范围：只修复本轮反馈，不调整历史同步的数据流程、弹窗文案、页面视觉设计或其他弹窗。

## 一、现象与已经确认的原因

### 1. 电脑端本机历史同步弹窗

当前 `src/App.tsx` 中同步弹窗外层为：

```text
pointer-events-none fixed inset-0 ... flex items-end ... pb-20
```

并且上一版删掉了外层的 `bg-[var(--color-overlay-backdrop)] backdrop-blur-[2px]`。这直接造成：

- 弹窗从页面中央移动到底部；
- 页面背景不再压暗和模糊；
- 外层变为 `pointer-events-none`，只保留卡片自身响应。

这是明确的代码回归，不需要再做浏览器归因。

### 2. 欢迎／登录弹窗的安全区颜色

`src/App.tsx` 已把欢迎／账号弹窗状态以 `overlay: 'auth'` 传给 `useBrowserChromeColor()`，但 `src/hooks/useBrowserChromeColor.ts` 只解构了 `tint` 和 `dimmed`，随后调用时也只传回这两个字段：

```ts
const { tint = null, dimmed = false } = options;
applyBrowserChromeColor(page, theme, { tint, dimmed });
```

因此 `overlay` 被丢弃，登录遮罩分支从未生效。这是欢迎／登录弹窗安全区不响应的直接原因。

### 3. 精选与收藏／对话页面切换

页面身份由 `primaryNavItem` 同步派生，`useBrowserChromeColor` 已使用 `useLayoutEffect`，理论上会在浏览器绘制前更新。但目前仍有两个明确的不利因素：

1. `src/index.css` 对手机 `html, body` 的背景设置了 `background-color 240ms ease-out`。因此 document canvas 故意在 240ms 内保留并混合旧色，和“切换后立即匹配”目标冲突。
2. 当前只写 `meta[name="theme-color"]` 和 `<html>` 上的 CSS 变量。移动 Safari 的顶部／底部区域主要受 document canvas 与浏览器自身采样时机影响；一次状态写入并不保证已展开的浏览器控制栏立即重新取色。

第一项是确定的延迟来源；第二项需要真机验证，不能仅凭源码认定为唯一根因。

### 4. 收藏／对话代码弹窗

工作室代码弹窗直接由 `codeSheetOpen` 驱动，收藏代码弹窗通过 `MobileFavoritesPage` 的普通 `useEffect` 才把 `codeOpen` 回传为 `favoritesCodeOpen`。两者最终进入 `dimmed`，但：

- 收藏弹窗比自身显示晚一个 effect 才通知 App；
- 根背景仍执行 240ms 过渡；
- 安全区只能显示一个平面色，无法真的复制页面上的 `backdrop-filter: blur(6px)`。它应显示“遮罩作用于当前页面后在边缘形成的代表色”，而不是尝试在系统栏中实现模糊。

## 二、修复方案

### A. 恢复桌面同步弹窗

同步弹窗继续保留现有同步逻辑与按钮，仅恢复桌面表现：

- 外层：`fixed inset-0 z-[300] flex items-center justify-center`；
- 恢复 `bg-[var(--color-overlay-backdrop)] backdrop-blur-[2px]`；
- 恢复正常 pointer events，让遮罩完整接管该模态状态；
- 卡片恢复原来的 `p-6`、居中尺寸和阴影；
- 不在卡片自身重复设置 `z-[300]`，层级由外层统一负责。

移动端不沿用桌面模态布局。若仍保留上一版“同步不阻塞使用”的产品决定，使用明确的 `isMobile` 分支渲染底部状态卡；不要再用同一个 DOM 容器同时承担桌面模态框和移动状态卡。建议提取 `GuestHistorySyncNotice`，接收 `variant: 'modal' | 'toast'`，共享标题、说明、进度和按钮，分别拥有各自布局。

本轮反馈只明确要求恢复电脑端；移动端继续非阻塞，不重新引入全屏同步遮罩。

### B. 将安全区状态收敛为完整的可见层模型

将当前 `dimmed + overlay` 两条并行布尔路径收敛为一个明确字段：

```ts
type BrowserChromeOverlay = 'none' | 'code' | 'auth';
```

App 在一个位置根据实际可见层计算：

1. 欢迎／账号弹窗可见 → `auth`；
2. 否则收藏或对话代码弹窗可见 → `code`；
3. 否则 → `none`。

优先级与实际 z-index 一致。这样不会发生 `dimmed=true` 和 `overlay='auth'` 被重复合成，也不会继续出现调用方传了字段、hook 静默丢弃的问题。

`useBrowserChromeColor` 必须完整解构并把 `overlay` 放入：

- `applyBrowserChromeColor` 的参数；
- `useLayoutEffect` 依赖数组；
- 模块保存的 `lastContext`。

为避免未来再漏字段，推荐 hook 直接以稳定的原始值构造完整 context，或把 `BrowserChromeContext` 作为单一参数；不要手工挑选部分 options 转发。

### C. 安全区颜色与遮罩样式使用同一组来源

`browser-chrome-color.ts` 不应借用代码遮罩常量再乘一个临时 alpha 来模拟登录遮罩。建立明确的遮罩表：

| overlay | 深色 | 浅色 | 来源 |
| --- | --- | --- | --- |
| `none` | 无叠加 | 无叠加 | 页面底色 |
| `code` | `rgba(26,26,26,0.44)` | `rgba(72,73,86,0.20)` | `.code-window-scrim` |
| `auth` | `--color-overlay-backdrop` 深色值 | `--color-overlay-backdrop` 浅色值 | Welcome / Account modal |

实现时把这些值整理为 TypeScript 与 CSS 可核对的一组命名常量，并用测试锁定；不要让 auth 继续依赖 `CODE_WINDOW_SCRIM`。颜色按“当前页面底色／精选边缘染色 → 当前最上层遮罩”合成一次。

模糊本身无法在安全区平面色中重现。对话／收藏页底色接近均匀，alpha 合成值就是合适代表色；精选若将来打开这些弹窗，继续以当前精选边缘色作为 base 再合成遮罩。验收目标是视觉连续，不要求系统栏呈现可辨识的模糊图像。

### D. 消除页面切换的已知延迟

删除手机 `html, body` 的 240ms `background-color` 过渡及其 reduced-motion 特例。页面内精选光场、代码遮罩仍保留各自动画；安全区根 canvas 和 `theme-color` 直接到达目标色。

`applyBrowserChromeColor()` 在一次调用内完成：

1. 更新 `<html>` 的 `--browser-chrome-color`；
2. 同步设置 `html` 与 `body` 的实际背景颜色，避免浏览器在变量重新计算前采到旧值；
3. 更新 `theme-color`；
4. 缓存最终 context，而不是只缓存已经混合后的颜色。

不要通过读取布局或加任意毫秒延迟来“等浏览器”。首次先实现确定性的同步写入。

若真机确认 Safari 在页面切换后仍偶发保留旧工具栏颜色，增加一次受控的下一帧重申：仅在 page 或 overlay 变化时 `requestAnimationFrame` 再应用同一 context；清理前一个 frame，避免快速导航乱序。该步骤作为有真机证据后的兼容分支，不默认循环写入、不 remove/recreate meta、不使用多重 `setTimeout`。

同时在 `pageshow`（包含 back-forward cache 恢复）与 `visibilitychange` 回到 visible 时重申当前 context，覆盖从后台回到页面仍显示旧色的场景。监听器由单一模块注册一次并可在测试中清理。

### E. 让代码弹窗的可见状态在同一提交中生效

工作室代码弹窗继续直接使用 `codeSheetOpen`。

收藏代码弹窗不要依赖子组件普通 `useEffect` 晚一拍上报。可选方案：

- 推荐：把 `favoritesCodeOpen` 提升到 App，`MobileFavoritesPage` 改为受控 `codeOpen/onCodeOpenChange`；弹窗和安全区读取同一个状态。
- 较小改动：将 `onCodeWindowChange` 的通知改为 `useLayoutEffect`。这仍保留两份状态，后续容易漂移，只作为低风险临时修法。

采用受控状态后，离开收藏页时同步关闭代码弹窗，防止隐藏页面残留 `code` overlay；工作室弹窗关闭的 240ms 视觉退场期间，安全区也应按同一可见性时长保持遮罩色，直到 scrim opacity 归零再切回页面色。建议把“正在显示”和“正在退出”合并成一个 `codeOverlayVisible` 状态或复用现有 visibility 生命周期，而不是在点击关闭瞬间先恢复安全区底色。

## 三、文件范围

预计修改：

- `src/App.tsx`：恢复桌面同步模态布局；分离移动提示；集中计算 chrome overlay；控制收藏代码弹窗状态。
- `src/hooks/useBrowserChromeColor.ts`：完整转发 overlay/context，处理依赖与可选重申。
- `src/lib/browser-chrome-color.ts`：显式 overlay 模型、准确遮罩表、同步写入根背景、恢复重申入口。
- `src/lib/appearance-preferences.ts`：主题变化继续复用完整当前 context，不重置页面或 overlay。
- `src/index.css`：移除根背景颜色延迟；保持页面内遮罩动画。
- `src/components/favorites/MobileFavoritesPage.tsx`：将代码弹窗改为受控状态。
- 可选新增 `src/components/overlays/GuestHistorySyncNotice.tsx`：明确区分桌面 modal 和移动 toast。
- 对应测试：`src/__tests__/App.test.tsx`、`src/hooks/__tests__/useBrowserChromeColor.test.tsx`、`src/lib/__tests__/browser-chrome-color.test.ts`、`MobileFavoritesPage` 相关测试。

不修改云端同步协议、IndexedDB schema、认证配置、精选光场算法或桌面代码 widget。

## 四、测试与真机验收

### 自动化测试

1. 桌面同步中／失败状态均位于居中全屏遮罩，遮罩包含背景色和 blur；重试、稍后再说仍可点击。
2. 手机同步提示保持非阻塞，且不会误触发 auth overlay 安全区颜色。
3. hook 对 `none/code/auth` 的每次变化都重算，主题变化保留 page、tint、overlay。
4. 对话 ↔ 收藏 ↔ 精选切换后，meta、CSS 变量、html 背景和 body 背景四者立即一致。
5. 欢迎、账号、对话代码、收藏代码弹窗打开和关闭时使用各自遮罩合成值；auth 覆盖 code 时只合成最上层一次。
6. 收藏代码弹窗打开、退出动画和离开收藏页期间，App 与子组件状态一致。
7. `pageshow` / visible 恢复会重申最新 context，旧事件和已取消的 animation frame 不会覆盖新页面。

运行上述定向测试、相关 ESLint 和 TypeScript 检查。由于修改共享页面状态和全局浏览器颜色控制，提交前按仓库钩子运行完整测试。

### 真机矩阵

在 iOS Safari 和 Android Chrome 各验证深色、浅色：

- 对话 → 精选列表 → 精选详情 → 精选列表 → 收藏 → 对话，快速切换与停留切换各一轮；
- 欢迎弹窗、账号登录弹窗开启／关闭及登录成功后的页面恢复；
- 对话代码弹窗、收藏代码弹窗开启、关闭动画、点遮罩关闭；
- 浏览器顶部／底部控制栏展开和收起、键盘开关、横竖屏、切后台后恢复。

通过标准：页面切换无需刷新即可恢复正确安全区颜色；弹窗出现期间安全区与页面被遮罩后的边缘观感连续；弹窗退出动画完成后恢复当前页面色；桌面同步弹窗稳定居中且背景模糊。若应用四个颜色输出已一致而某一浏览器版本的系统栏仍未更新，单独记录浏览器版本和录屏，再启用 D 节的兼容性重申，不继续改变业务状态流。

## 五、实施顺序

1. 先恢复桌面同步弹窗，隔离 modal/toast 布局。
2. 修复 hook 丢失 overlay，并用新 overlay 类型替换 `dimmed`。
3. 移除根背景过渡，统一四个颜色输出。
4. 将收藏代码弹窗状态改为受控并对齐退出时机。
5. 补测试并真机验收；只有真机仍复现时才加入下一帧及页面恢复重申。
