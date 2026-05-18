# 设计规格：AI 提示词修改指南

- **日期**：2026-05-17
- **状态**：已审批
- **关联功能**：NOVA-34 提示词版本管理

---

## 背景

NOVA-34 已落地提示词版本管理系统（`versions/v*.ts` + `active.ts` 指针 + `system-prompt.ts` shim）。
但 AI 编码助手在未经指引时，倾向直接修改 `system-prompt.ts` 或已有版本文件，破坏版本管理的不变量。

本规格定义两个新文件，使 AI 在修改提示词时有明确规程可循。

---

## 目标

1. 防止 AI 犯常见错误（直接改 shim / 改旧版本）
2. 提供完整、可操作的 SOP，涵盖创建新版本、切换、验证、回滚
3. 维护成本低：两个文件职责不重叠，几乎不需要同步

---

## 方案：双层结构（摘要 + 详细 SOP）

### 层一：`copilot-instructions.md` 追加摘要节

在现有项目规范末尾追加"## 提示词版本管理规范"节，内容为 3 条禁令 + 操作入口引导。

- 在每次对话中自动加载，起到"兜底防护"作用
- 不放操作细节，避免臃肿

**追加内容：**

```markdown
## 提示词版本管理规范

- **禁止**直接编辑 `src/prompts/system-prompt.ts`（这是转发 shim，不含实际内容）
- **禁止**修改已有版本文件 `src/prompts/versions/v*.ts`（版本只增不改）
- 修改提示词时，请使用 `@edit-system-prompt` 获取完整操作规程
```

---

### 层二：`.github/prompts/edit-system-prompt.prompt.md`

按需召唤（`@edit-system-prompt`）的详细操作规程，包含：

| 节 | 内容 |
|---|---|
| 背景 | 三文件架构说明（versions / active / shim） |
| 禁止事项 | 明确列出不得操作的文件 |
| 操作步骤 | 6 步：确认当前版本 → 创建新文件 → 修改内容 → 切换 active.ts → 验证 → 提交 |
| 回滚 | 改回 active.ts 路径 + 重新验证 + 提交 |

**验证步骤（步骤 5）必须包含：**

```bash
npx tsc --noEmit -p tsconfig.app.json   # 零错误
npm test -- --run                        # 所有测试通过
```

---

## 文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `.github/copilot-instructions.md` | 追加 | 新增"提示词版本管理规范"节（7 行） |
| `.github/prompts/edit-system-prompt.prompt.md` | 新建 | 完整 SOP，约 50 行 |

---

## 不在范围内

- 自动化版本号递增脚本
- 提示词效果评估机制
- CI 中对提示词格式的 lint 检查

---

## 验收标准

1. `copilot-instructions.md` 末尾包含"提示词版本管理规范"节
2. `.github/prompts/edit-system-prompt.prompt.md` 存在且可被 `@edit-system-prompt` 召唤
3. 按 SOP 操作一次（手动验证），tsc + npm test 均通过
