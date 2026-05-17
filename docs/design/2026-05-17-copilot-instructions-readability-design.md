# 设计规格：copilot-instructions.md 可读性优化

**日期：** 2026-05-17  
**状态：** 已批准

---

## 背景与目标

`.github/copilot-instructions.md` 是三端（GitHub Copilot / Claude Code / Codex CLI）的唯一 AI 编码规则来源。随着规则积累，文件结构趋于扁平、原理性内容与操作规则混排，导致：

- 没有目录，AI 助手扫描时难以快速定位关键规则
- 禁止项（❌）埋在段落中，视觉上不突出
- 「superdough 为什么」一节篇幅过长，掩盖了操作规程
- 「通用模块导入原则」与「superdough 导入规范」是同一关注点却分属两节

目标：**只改可读性，不增删任何规则内容**。

---

## 方案选择

采用**方案 B：加目录 + 规则突出**。

- 方案 A（仅压缩 superdough 原理段）：改动最小，但整体结构仍扁平
- **方案 B（推荐）**：加顶部目录 + 规则前置 + ❌/✅ 标注 + 合并相关章节
- 方案 C（整体重构为「速查表 → 详情」两层）：对 AI 最友好，但改动量大且原理与规则分离后可能误用

---

## 设计细节

### 1. 顶部目录

在文件标题后、技术栈章节前插入简短目录：

```markdown
## 目录
- [技术栈](#技术栈)
- [导入规范](#导入规范)
- [AudioContext 管理](#audiocontext-管理)
- [代码质量门禁](#代码质量门禁)
- [Agent 测试维护](#agent-测试维护)
- [提示词版本管理](#提示词版本管理)
```

### 2. 导入规范章节（合并 + 重组）

将「superdough / strudel 包的导入规范」和「通用模块导入原则」合并为**导入规范**一节，内部结构调整为：

1. **核心规则**（❌/✅ 代码示例，已有，保持在最前）
2. **ESLint 说明**（一句话，已有）
3. **判断原则**（`let xxx; export function setXxx` 模式，从独立章节移入，加粗）
4. **WAV 导出时切换 AudioContext 的正确姿势**（从原理段中提出，作为独立操作规程小节）
5. **原理（debug 参考）**（原「为什么？」小节，重命名，内容压缩为一段 blockquote）

「为什么？」重命名为「原理（debug 参考）」，明示它是参考资料而非必读内容，内容精简为：

> superdough 的 `dist/index.mjs` 持有模块级单例。从子路径导入会载入独立模块图，其中的 audioContext 变量不会被 bundled setter 更新，最终导致 `InvalidAccessError: cannot connect to an AudioNode belonging to a different audio context`。症状：导出 WAV 缺失 delay/room 效果。

### 3. AudioContext 管理章节

禁止项加 ❌/✅ 前缀，改为列表格式：

- `❌ 不要` 直接 `new AudioContext()`
- `❌ 不要` 缓存实例到 React state
- `✅` 导出结束后调用 `rebuildMasterChain()`

### 4. 章节层级调整

「Agent 测试维护约定」和「提示词版本管理规范」从 `###`（嵌套在代码质量门禁下）升级为 `##` 顶级章节，反映其独立性，并与目录对应。

---

## 约束

- **不改动任何规则的实质内容**——每条规则的措辞、代码示例均原样保留
- **不新增规则**——本次只做结构和格式调整
- 改动后需通过 `npm run lint`（文件本身是 Markdown，lint 不涉及，但提交时 pre-commit 会跑 tsc + test，需确认不引入破坏）

---

## 成功标准

- 文件顶部有目录，可通过锚点直接跳转到各节
- 每个禁止项都有 ❌ 前缀，视觉上一眼可见
- superdough 原理段变为 blockquote，不再与操作规程混排
- 「通用模块导入原则」不再作为独立章节存在
- Agent 测试维护、提示词版本管理各占一个 `##` 章节
