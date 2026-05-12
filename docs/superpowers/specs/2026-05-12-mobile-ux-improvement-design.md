# 移动端 UX 改进设计规格

**日期：** 2026-05-12  
**范围：** 两个高优先级移动端交互问题  
**策略：** 方案 A — 各自独立修复，改动范围最小，不影响桌面端

---

## 问题一：软键盘遮挡底部输入区

### 背景

移动端底部栏（建议 chips + 输入框 + 发送按钮）使用 `height: 100dvh` 布局，没有监听软键盘弹出事件。当用户点击输入框调起软键盘时，键盘叠在底部栏上方，输入框和发送按钮被遮挡，用户无法看到正在输入的内容。

### 方案

使用 `visualViewport` API 监听键盘高度变化，将底部栏整体上移。

**新建：** `src/hooks/useKeyboardHeight.ts`

```ts
// 监听 visualViewport resize/scroll，返回键盘高度（px）
// 键盘收起时返回 0
export function useKeyboardHeight(): number
```

计算公式：
```
keyboardHeight = window.innerHeight - visualViewport.height - visualViewport.offsetTop
```

**修改：** `src/App.tsx` 移动端底部栏 div

```tsx
// 在底部栏的 style 中加入 transform
style={{
  paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
  transform: keyboardHeight > 0 ? `translateY(-${keyboardHeight}px)` : undefined,
  transition: 'transform 0.15s ease-out',
}}
```

### 约束

- 仅在移动端分支（`isMobile === true`）启用此 hook，桌面端不调用
- 代码抽屉打开时，键盘高度偏移仍正常工作（两者互不干扰，因为抽屉不涉及键盘输入）
- iOS Safari 和 Android Chrome 均兼容（`visualViewport` 支持率 >96%）

---

## 问题二：代码抽屉缺少手势支持 + 滚动穿透

### 背景

代码抽屉当前只能通过底部「查看代码 ↑」pill 按钮切换开/关，移动端用户无法通过手势操作。同时，抽屉打开时对话区仍可滚动（滚动穿透），容易误触。

### 方案

在抽屉顶部新增可拖拽的 handle 条，监听 touch 事件实现手势开关，同时锁定背景滚动。

#### 手势逻辑

**在 `App.tsx` 移动端抽屉 div 中加入：**

```
onTouchStart → 记录起始 Y 坐标（drawerDragRef）
onTouchMove  → 计算 deltaY，实时更新抽屉高度（无动画跟手）
onTouchEnd   → deltaY > +40px 关闭，deltaY < -40px 打开，否则回弹
```

- 手势触发区域：仅抽屉顶部 handle 区域（约 40px 高）
- 拖动中：`transition: none`（跟手）；松手：恢复 `transition: height 0.3s cubic-bezier(0.4,0,0.2,1)`
- 底部「查看代码 ↑/↓」pill 保留，作为无障碍备用操作入口

#### 滚动穿透锁定

```
抽屉打开时：document.body.style.overflow = 'hidden'
抽屉关闭时：document.body.style.overflow = ''
```

iOS 额外处理：对 `ConversationView` 容器加 `touch-action: none`（抽屉打开期间）。

### 约束

- 手势逻辑完全在 `App.tsx` 移动端分支内，不影响 `CodePanel` 组件本身
- 不新增 hook，用 `useRef` 存储拖拽状态（`drawerDragRef`）
- 抽屉打开高度维持现有 `50dvh`，不引入多挡位（YAGNI）

---

## 文件改动范围

| 文件 | 变更 |
|------|------|
| `src/hooks/useKeyboardHeight.ts` | 新建：visualViewport 键盘高度 hook |
| `src/App.tsx` | 移动端底部栏加键盘偏移；抽屉加 handle + touch 手势 + body overflow 锁定 |

桌面端代码（`isMobile === false` 分支）**不改动**。

---

## 不在本次范围内

- 语音按钮 onMouseDown → touch 事件修复（中优先级，独立问题）
- 输入框动态高度（中优先级）
- 历史 Bottom Sheet 手势（中优先级）
- CodeMirror 编辑器移动端 readOnly（低优先级）
