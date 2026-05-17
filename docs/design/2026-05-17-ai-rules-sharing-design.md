# 设计规格：AI 编码规则跨工具共享

**日期：** 2026-05-17  
**状态：** 已批准

---

## 背景与目标

项目中的开发者使用不同的 AI 编码助手：
- **GitHub Copilot**（VS Code 插件）——读取 `.github/copilot-instructions.md`
- **Claude Code CLI**（终端）——读取项目根目录的 `CLAUDE.md`
- **Codex CLI**——读取项目根目录的 `AGENTS.md`

当前只有 `.github/copilot-instructions.md` 存在，其他工具无法获取项目规则。目标是让所有工具读到同一份规则，且只需维护一处。

---

## 决策

采用 **`@import` 引用方案**（方案 A）：

- `.github/copilot-instructions.md` 保持为唯一真相来源，不做任何改动。
- 新建 `CLAUDE.md` 和 `AGENTS.md` 于项目根目录，每个文件只含一行 `@import`。
- Claude Code 和 Codex 运行时自动将被引用文件的内容注入上下文。

---

## 实现细节

### 文件结构

```
oddeNova/
├── .github/
│   └── copilot-instructions.md   ← 唯一真相来源（不改动）
├── CLAUDE.md                     ← 新建
└── AGENTS.md                     ← 新建
```

### CLAUDE.md 内容

```
@.github/copilot-instructions.md
```

Claude Code CLI 在读取 `CLAUDE.md` 时遇到 `@filename` 语法，会将目标文件内容展开注入上下文，与直接写在 `CLAUDE.md` 里效果等同。

### AGENTS.md 内容

```
@.github/copilot-instructions.md
```

Codex CLI 同样支持此语法（若后续验证不支持，退路是将内容改为完整复制，或切换到脚本同步方案）。

---

## 后续维护

只需编辑 `.github/copilot-instructions.md`，三端自动同步。`CLAUDE.md` 和 `AGENTS.md` 创建后无需再碰。

---

## 未解决事项

- Codex CLI 对 `@filename` import 的支持需在首次使用时验证。若不支持，`AGENTS.md` 降级为手动复制内容，并在 README 中注明其为生成文件。
