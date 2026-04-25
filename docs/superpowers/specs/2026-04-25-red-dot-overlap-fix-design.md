# 红点遮挡输入文字修复设计

**日期：** 2026-04-25  
**文件：** `src/components/ChatInput.tsx`

## 问题

`ChatInput` 底部的状态指示区（红点 + "未初始化" + 重启按钮）以 `position: absolute` 叠放在 textarea 之上。即使引擎已就绪，红点仍然渲染在 DOM 中，当用户输入较多文字时，底部文字会被红点遮挡。

## 根因

状态 `<div>` 始终渲染，仅通过 `style={{ pointerEvents: engineReady ? 'none' : 'auto' }}` 来禁用就绪后的点击，但视觉遮挡问题未处理。

## 解决方案

用 `{!engineReady && <div>...</div>}` 将整个状态区条件化渲染：

- 引擎**未就绪**：渲染红点 + "未初始化" + 重启按钮，行为与现在一致
- 引擎**已就绪**：整个 `<div>` 从 DOM 移除，不占空间，不遮挡任何文字

同时移除 `style={{ pointerEvents: ... }}`（元素不存在时无需禁用指针事件）。

## 改动范围

- 文件：`src/components/ChatInput.tsx`
- 改动量：约 2 行（加条件包裹、删 style 属性）
- 无副作用，无接口变更
