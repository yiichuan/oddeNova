# 设计：代码质量基线 — 纯函数单元测试

**日期：** 2026-05-16  
**子项目：** 1/4（生产化路线图第一步）  
**背景：** 项目由 vibe coding 产生，作者为后端开发者，希望持续迭代并推向生产。现有测试覆盖几乎为零（仅 1 个文件），需要在关键纯逻辑上建立安全网。

---

## 目标

- 覆盖最容易出问题、且完全可测的纯函数：parser + tool handlers
- 不引入新测试框架（继续用 Vitest）
- 测试文件对后端开发者可读：没有 DOM、没有 Mock LLM、没有浏览器 API

---

## 范围

### 纳入

| 文件 | 原因 |
|---|---|
| `src/agent/parser.ts` | `parseScore()` 是所有 agent 工具的基础，解析错误会导致 agent 静默地操作错误的 layer |
| `src/agent/tools.ts` | tool handlers（addLayer/removeLayer/replaceLayer/applyEffect/setTempo）是纯逻辑，只需注入 mock state，无需浏览器环境 |
| `src/lib/sample-allowlist.ts` | 已有 1 个测试，补充边界 case |

### 排除

| 文件 | 原因 |
|---|---|
| `src/agent/executor.ts` / `loop.ts` | 依赖 LLM 调用，非确定性，本次不测 |
| `src/services/strudel.ts` | 依赖浏览器 AudioContext，无法在 Node 环境运行 |
| `src/lib/session-storage.ts` | 依赖 IndexedDB |
| `src/components/**` | React 组件，不在方案 A 范围内 |

---

## 测试文件结构

```
src/agent/__tests__/
  parser.test.ts
  tools.test.ts
```

（与已有的 `src/lib/__tests__/` 保持一致的命名约定）

---

## parser.test.ts — 测试 case 清单

`parseScore()` 核心行为：

| Case | 描述 |
|---|---|
| 空字符串 | 返回 `hasStack: false`，`layers: []` |
| 只有 `setcps()` | 正确解析 cps 和 bpm，无 stack |
| 标准结构：setcps + stack + 2 层 | layers 数量为 2，name / source 正确 |
| `@layer NAME` 标记被识别 | name 取自标记，source 不含标记本身 |
| 无标记时自动命名 | 第一层 `layer_0`，第二层 `layer_1` |
| 嵌套括号不被误切 | `s("bd sd").lpf(note("c3 e3"))` 不被括号内逗号分割 |
| 字符串内逗号不被误切 | `s("bd, sd")` 整体为一个 layer |
| 注释内 `stack` 关键字不被识别 | `// stack(...)` 不触发 hasStack |
| `silence` 作为代码体 | layers 为空（isSilencePlaceholder 生效） |

`bpmToCps()` / `summariseScore()`：
- BPM → CPS 换算精度（120 BPM = 0.5 CPS）
- summariseScore 包含 layerCount 和各 layer 的 name

---

## tools.test.ts — 测试 case 清单

每个 handler 通过构造 `{ state: { code, finalCode: null }, improviseLLM: vi.fn() }` 的 ctx 调用。

**addLayer**
- 向空 code 添加第一层 → code 包含 `stack(` 和正确的 `@layer` 标记
- 向已有 stack 追加层 → layerCount 递增
- name 重复 → `ok: false`，code 不变
- name 或 code 为空字符串 → `ok: false`

**removeLayer**
- 移除存在的层 → 剩余层不受影响，layerCount 递减
- 移除最后一层 → code 变为 `silence`（不是 `stack()`）
- 移除不存在的层 → `ok: false`，code 不变

**replaceLayer**
- 替换内容正确写入，其他层不变
- 目标层不存在 → `ok: false`

**applyEffect**
- chain 以 `.` 开头 → 追加到目标层尾部
- chain 不以 `.` 开头 → `ok: false`
- 目标层不存在 → `ok: false`

**setTempo**
- 120 BPM → `setcps(0.5)` 出现在输出 code 中
- bpm ≤ 0 或非数字 → `ok: false`
- 替换已有 setcps（不出现两行 setcps）

**ensureStack（内部函数，通过 addLayer 间接测试）**
- 无 stack 的裸代码（如 `s("bd*4")`）被包装为 `main` 层
- `silence` 裸代码 → layers 为空

---

## 验收标准

- `npm test` 全部通过，零跳过
- `npx tsc --noEmit -p tsconfig.app.json` 无新增错误
- `npm run lint` 通过
- husky pre-commit hook 在提交时自动运行以上三项

---

## 不做的事

- 不追求覆盖率数字（不配置 coverage reporter）
- 不写快照测试（snapshot 对后端开发者不友好，维护成本高）
- 不测 UI 行为

---

## 后续（本次不包含）

- 子项目 2：GitHub Actions CI/CD 流水线（依赖本子项目的测试通过）
- 子项目 3：Sentry 错误监控
- 子项目 4：前端架构导览文档
