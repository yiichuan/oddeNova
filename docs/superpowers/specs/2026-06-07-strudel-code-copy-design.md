# 聊天框 Strudel 代码一键复制 — 设计

- 日期：2026-06-07
- 关联分支：`feature/NOVA-82-strudel-code-copy`
- 涉及文件：`src/components/ConversationView.tsx`

## 背景

助手回复中携带的 Strudel 代码以折叠的代码块形式展示（`ConversationView.tsx:269-289`），代码块标题栏只有"展开/折叠"按钮。用户想要复制代码时，必须先展开代码块，再手动选中文本复制，容易选漏或多选空白。

对照之下，用户消息已经有一键复制按钮（`:234-246`）：点击后调用 `navigator.clipboard.writeText`，并通过 `copiedId` 状态把 `CopyIcon` 临时切换为 `CheckIcon`（2 秒后还原）。本设计把同样的体验补到 Strudel 代码块上。

## 目标

- 在不展开代码块的前提下，一键把 Strudel 代码复制到剪贴板
- 复制交互（触发方式、视觉反馈）与现有用户消息复制按钮保持一致，降低认知成本与实现成本
- 桌面端、移动端都可用（不依赖 hover）

## 非目标

- 不改动代码块的展开/折叠逻辑本身
- 不引入 toast/全局提示组件
- 不为剪贴板写入失败添加 fallback 或错误提示 UI

## 设计

### 1. 组件结构：标题栏拆分为并排双按钮

当前标题栏是单个 `<button onClick={() => toggleCode(msg.id)}>`，包裹了"▶ 图标 + Strudel 代码 + · N 行"整个区域。

调整为一个 `<div>` 容器，内部并排放两个独立的兄弟 `<button>`：

- **左侧（`flex-1`）**：原展开/折叠按钮，保留 `▶` 图标 + "Strudel 代码" + "· N 行"，点击切换 `expandedCode`（行为不变）
- **右侧**：新增图标按钮，内容为 `CopyIcon`/`CheckIcon`，点击复制代码

两者是平级的兄弟按钮，不存在嵌套按钮的 HTML 合法性问题，点击复制按钮自然不会触发展开/折叠的副作用，无需 `stopPropagation`。整体仍包裹在现有标题栏容器的视觉样式内（`bg-bg-primary/60`、`text-[11px]` 等）。

折叠状态下右侧复制按钮依然可见可用——这是与"先展开再复制"方案的关键区别，也是用户确认的核心诉求。

### 2. 交互与状态：复用 `copiedId`

不新增 state，复用 `ConversationView.tsx:49` 已有的 `copiedId: string | null`：

```ts
onClick={() => {
  navigator.clipboard.writeText(msg.code).then(() => {
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  });
}}
```

图标根据 `copiedId === msg.id` 在 `CopyIcon` ↔ `CheckIcon` 间切换，2 秒后还原——与用户消息复制按钮（`:236-245`）逐字一致的模式。

复用是安全的：用户消息与助手消息的 `msg.id` 取自不同的消息集合，不会互相串扰；同一条助手消息也不会同时出现"复制正文"与"复制代码"两个按钮去竞争同一个 `copiedId`（助手消息气泡本身没有复制正文按钮）。

复制内容为原始的 `msg.code` 字符串，不附加 ``` 代码围栏或任何 Markdown 格式——即编辑器会接收到的内容，可直接粘贴到 Strudel 编辑器中使用。

### 3. 错误处理

保持与现有用户消息复制按钮一致的极简策略：直接调用 `navigator.clipboard.writeText`，不加 fallback、不处理 rejection、不展示 loading/error 状态。Clipboard API 需要安全上下文（https/localhost），这是项目里已有的既定假设。

### 4. 测试

`src/components/__tests__/` 目前没有 `ConversationView` 的测试文件，现有的用户消息复制按钮也未被单测覆盖。本次改动是镜像同一文件内已验证的交互模式，因此不新增测试文件，改为在浏览器中手动验证：

1. 启动 dev server，触发一条带 Strudel 代码的助手回复
2. 折叠状态下点击复制按钮：确认剪贴板内容为原始代码字符串，图标 2 秒内变为对钩、随后还原
3. 展开状态下重复上述验证，并确认点击复制按钮不会触发折叠/展开
4. 在移动端视口下重复验证，确认按钮始终可见可点击（不依赖 hover）

## 影响范围

仅修改 `src/components/ConversationView.tsx` 中助手消息的代码块标题栏渲染逻辑（约 `:273-289` 区域），不涉及数据结构、状态管理或其他组件。
