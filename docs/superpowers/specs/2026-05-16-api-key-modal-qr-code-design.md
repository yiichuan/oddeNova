# 设计规格：ApiKeyModal 二维码展示

**日期**：2026-05-16  
**状态**：已批准  

---

## 背景与目标

用户首次打开 oddeNova 时需要填写 API Key 才能使用 AI 功能。部分用户可能没有现成的 API Key，增加一个引导性的二维码可以帮助他们快速入群领取免费体验 Key，降低使用门槛。

## 改动范围

仅修改 `src/components/ApiKeyModal.tsx`，不新增文件。使用已存在的图片资源：

```
src/assets/oddeNova音乐制作社区二维码.png
```

## 布局设计

### 位置

在表单区域（`<div className="space-y-3">`）闭合之后、操作按钮（`<div className="flex gap-3 mt-5">`）之前插入横排 QR 码条带。

### 视觉结构

```
┌──────────────────────────────────────────┐
│  [QR图片 64×64]  扫码入群               │
│                  免费领体验 API Key      │
└──────────────────────────────────────────┘
```

### 样式规格

| 元素 | 样式 |
|------|------|
| 容器 | `flex items-center gap-3 mt-5 pt-5 border-t border-border` |
| QR 图片 | `w-16 h-16 rounded-lg bg-white p-1 shrink-0` |
| 主文字 | `text-sm font-medium text-text-secondary`，内容：「扫码入群」 |
| 副文字 | `text-xs text-text-muted mt-0.5`，内容：「免费领体验 API Key」 |

### 展示条件

**无条件展示**：无论用户是否已有 API Key，始终显示此区域。理由：鼓励所有用户加群，社区氛围对新老用户都有价值。

## 实现约束

- 不引入新的依赖（无需 QR 码生成库，直接使用静态图片）
- 图片使用 Vite 静态资源导入（`import qrCode from '../assets/oddeNova音乐制作社区二维码.png'`）
- 改动应通过 `npm run lint` 和 `npx tsc --noEmit` 检查

## 验收标准

1. 打开 ApiKeyModal，在表单下方、保存按钮上方可见 QR 码条带
2. QR 码图片正确显示，白色背景圆角
3. 文字「扫码入群」与「免费领体验 API Key」分两行显示
4. 弹框整体布局不变形，不出现横向滚动条
5. 深色主题下视觉正常
