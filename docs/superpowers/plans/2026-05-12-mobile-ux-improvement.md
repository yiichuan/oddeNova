# 移动端 UX 改进实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复移动端两个高优先级问题：软键盘遮挡底部输入区、代码抽屉缺少手势支持和滚动穿透。

**Architecture:** 新建 `useKeyboardHeight` hook 监听 `visualViewport`，在 `App.tsx` 移动端分支加键盘偏移 + 抽屉拖拽手势，桌面端代码不动。

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vite

---

## 文件改动范围

| 文件 | 变更 |
|------|------|
| `src/hooks/useKeyboardHeight.ts` | **新建** — 监听 visualViewport，返回键盘高度 px |
| `src/App.tsx` | **修改** — 移动端底部栏加键盘偏移 transform；抽屉加 handle + touch 手势 + body overflow 锁定 |

---

## Task 1：新建 `useKeyboardHeight` Hook

**Files:**
- Create: `src/hooks/useKeyboardHeight.ts`

- [ ] **Step 1：创建 hook 文件**

新建 `src/hooks/useKeyboardHeight.ts`，完整内容如下：

```ts
import { useEffect, useState } from 'react';

/**
 * 监听软键盘弹出高度（px）。
 * 使用 visualViewport API，iOS Safari / Android Chrome 均兼容。
 * 键盘收起时返回 0。
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // 键盘高度 = 窗口总高 - 可视视口高 - 视口顶部偏移
      const kh = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardHeight(Math.round(kh));
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return keyboardHeight;
}
```

- [ ] **Step 2：验证 TypeScript 无错误**

```bash
cd /Users/chaycao/workspace/oddeNova
npx tsc --noEmit 2>&1 | grep useKeyboardHeight
```

预期输出：空（无错误）

- [ ] **Step 3：提交**

```bash
git add src/hooks/useKeyboardHeight.ts
git commit -m "feat(mobile): add useKeyboardHeight hook via visualViewport API"
```

---

## Task 2：软键盘适配 — 底部栏上移

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1：引入 hook**

在 `src/App.tsx` 顶部 import 区，紧接 `useIsMobile` 的那行之后加一行：

```ts
import { useKeyboardHeight } from './hooks/useKeyboardHeight';
```

- [ ] **Step 2：调用 hook（仅移动端生效）**

在 `App.tsx` 中，找到：
```ts
  const isMobile = useIsMobile();
  const [historyOpen, setHistoryOpen] = useState(false);
```

在这两行之间插入：
```ts
  const keyboardHeight = useKeyboardHeight();
```

- [ ] **Step 3：给底部栏加键盘偏移 transform**

找到移动端底部栏 div（搜索 `relative shrink-0 px-3 pt-3 border-t border-border`），将其 `style` 属性从：

```tsx
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
```

改为：

```tsx
          style={{
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            transform: keyboardHeight > 0 ? `translateY(-${keyboardHeight}px)` : undefined,
            transition: 'transform 0.15s ease-out',
          }}
```

- [ ] **Step 4：验证 TypeScript 无错误**

```bash
npx tsc --noEmit 2>&1 | head -20
```

预期输出：空（无新增错误）

- [ ] **Step 5：手动验证**

```bash
npm run dev
```

用手机或 Chrome DevTools（切换到手机模拟器模式，尺寸 390×844）打开 `http://localhost:5173`，点击输入框调起软键盘，确认底部栏整体上移、输入框和发送按钮完全可见。

- [ ] **Step 6：提交**

```bash
git add src/App.tsx
git commit -m "feat(mobile): shift bottom bar up when keyboard is visible"
```

---

## Task 3：代码抽屉手势 + 滚动穿透锁定

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1：添加拖拽 ref 和动画状态**

在 `App.tsx` 中，找到：
```ts
  const hDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const vDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
```

在这两行之后插入：
```ts
  const drawerDragRef = useRef<{ startY: number; startOpen: boolean } | null>(null);
  const [drawerAnimating, setDrawerAnimating] = useState(true);
```

- [ ] **Step 2：替换代码抽屉 div**

找到移动端代码抽屉区块（从 `{/* ── Code Drawer ── */}` 开始），将整个抽屉 div 替换为以下内容：

```tsx
        {/* ── Code Drawer ── */}
        <div
          className="shrink-0 overflow-hidden border-t border-border"
          style={{
            height: drawerOpen ? '50dvh' : 0,
            transition: drawerAnimating ? 'height 0.3s cubic-bezier(0.4,0,0.2,1)' : 'none',
          }}
        >
          <div className="h-full flex flex-col">
            {/* Handle — 手势触发区，高度 44px 符合触摸目标规范 */}
            <div
              className="flex flex-col items-center justify-center shrink-0 cursor-grab active:cursor-grabbing"
              style={{ height: 44, borderBottom: '1px solid var(--color-border)' }}
              onTouchStart={(e) => {
                drawerDragRef.current = { startY: e.touches[0].clientY, startOpen: drawerOpen };
                setDrawerAnimating(false);
              }}
              onTouchMove={(e) => {
                if (!drawerDragRef.current) return;
                // 阻止事件穿透到对话区
                e.stopPropagation();
              }}
              onTouchEnd={(e) => {
                if (!drawerDragRef.current) return;
                const delta = e.changedTouches[0].clientY - drawerDragRef.current.startY;
                setDrawerAnimating(true);
                if (delta < -40) {
                  // 上滑 → 打开
                  setDrawerOpen(true);
                } else if (delta > 40) {
                  // 下滑 → 关闭
                  setDrawerOpen(false);
                }
                // delta 在 ±40 之间 → 回弹（恢复原状态，动画已恢复）
                drawerDragRef.current = null;
              }}
            >
              {/* Handle bar 指示条 */}
              <div className="w-8 h-1 rounded-full bg-border mb-1" />
              <span className="text-[10px] text-text-muted select-none">
                {drawerOpen ? '↓ 下滑关闭' : '↑ 上滑打开'}
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <CodePanel
                error={strudel.error}
                isPlaying={strudel.isPlaying}
                engineReady={strudel.engineReady}
                onMount={strudel.setRoot}
                onPlay={() => strudel.play()}
                onStop={strudel.stop}
              />
            </div>
          </div>
        </div>
```

- [ ] **Step 3：加滚动穿透锁定**

在 `App.tsx` 中，找到管理 `drawerOpen` 的现有 `useState`：
```ts
  const [drawerOpen, setDrawerOpen] = useState(false);
```

在此行之后插入 `useEffect`：
```ts
  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen, isMobile]);
```

- [ ] **Step 4：更新底部 pill 按钮文案保持一致**

找到 pill 按钮：
```tsx
              {drawerOpen ? '收起代码 ↓' : '查看代码 ↑'}
```

保持不变，pill 保留作备用操作入口，无需修改。

- [ ] **Step 5：验证 TypeScript 无错误**

```bash
npx tsc --noEmit 2>&1 | head -20
```

预期输出：空（无新增错误）

- [ ] **Step 6：手动验证**

```bash
npm run dev
```

用 Chrome DevTools 移动端模拟（390×844），验证：
1. 拖动 handle 条上滑 >40px → 抽屉打开（高度 50dvh），有弹簧动画
2. 拖动 handle 条下滑 >40px → 抽屉关闭，有动画
3. 拖动幅度 <40px → 回弹（保持原状态）
4. 抽屉打开时，对话区不可滚动（`body.style.overflow = 'hidden'`）
5. 抽屉关闭后，对话区恢复滚动
6. 点击底部 pill「查看代码 ↑」仍可正常开关抽屉

- [ ] **Step 7：提交**

```bash
git add src/App.tsx
git commit -m "feat(mobile): add swipe gesture and scroll-lock to code drawer"
```

---

## Task 4：最终验收

- [ ] **Step 1：全量 TypeScript 检查**

```bash
npx tsc --noEmit 2>&1
```

预期：无新增错误（存量错误参考 `ConversationView`/`strudel`/`soundfont` 中已有错误）

- [ ] **Step 2：桌面端回归验证**

```bash
npm run dev
```

在普通桌面浏览器（非移动模拟）打开 `http://localhost:5173`，确认：
- 布局与之前完全一致（sidebar + code panel + viz）
- `useKeyboardHeight` hook 在非移动端虽然调用，但 `visualViewport` 高度不变，始终返回 0，底部栏无偏移

- [ ] **Step 3：最终提交**

```bash
git add -A
git commit -m "feat(mobile): keyboard avoidance + drawer swipe gesture

- useKeyboardHeight: visualViewport resize/scroll 监听
- 底部栏 transform translateY 跟随键盘高度
- 代码抽屉 handle 上滑打开 / 下滑关闭（阈值 40px）
- 抽屉打开时 body overflow:hidden 防滚动穿透"
```
