# 设计文档：评测规则 `hasMusic` 级联门

**日期**: 2026-05-19  
**范围**: `scripts/eval/evaluator.ts`  
**状态**: 待实现

---

## 背景与问题

当前规则分存在一个明显的失真：当 agent 未能生成任何有效音乐层（输出为 `setcps(...)\nsilence` 或仅 `silence`）时，代码仍可通过以下旁路规则拿到 70 分：

| 规则 | 得分原因 |
|------|---------|
| `syntax` | silence 是合法 JS，通过 |
| `hasBpm` | setcps(...) 存在，通过 |
| `hhGain` | 无 hh 层时**默认通过**，获 10 分 |
| `breathingSpace` | 层数 < 4 时**跳过检查**，获 10 分 |
| `noTidalOnly` | 无 Tidal API，通过 |
| `noSetcpsInLayers` | 层内无 setcps，通过 |

**合计 70 分**，而 LLM Judge 评分是 0/10。规则分对 silence 输出严重虚高，失去了衡量生成质量的意义。

在 20260519-baseline 评测中，共 6/11 个用例输出了 silence，规则均分虚高为 83.1，掩盖了真实问题。

---

## 目标

让 silence 类输出在规则分中得到如实反映：仅保留语法得分（20 分），其余全部为 0。

---

## 设计

### 新增规则：`hasMusic`（0 分，纯级联门）

在 `scoreRules()` 中，紧接 `syntax` 通过之后、`hasBpm` 之前插入一个 0 分门控：

```
syntax(20) → hasMusic(0, gate) → hasBpm(10) → layerCount(10) → ...
```

**通过条件**：`layers.length > 0`（`parseScore` 解析后存在至少一个非 silence 的音乐层）

**失败行为**：
1. 将 `hasBpm`、`layerCount`、`bassLpf`、`padRoom`、`hhGain`、`breathingSpace`、`noTidalOnly`、`noSetcpsInLayers` 全部标记为 `pass: false, score: 0, detail: '无音乐层，跳过'`
2. 提前 `return { total, breakdown }`，此时 `total` 仅包含 `syntax` 的 20 分

**分数对比（silence 代码）**：

| 场景 | 改动前 | 改动后 |
|------|--------|--------|
| `setcps(...)\nsilence` | 70 | 20 |
| 仅 `silence` | 60 | 20 |
| 有效 2 层代码 | 不变 | 不变 |

### 实现位置

`scripts/eval/evaluator.ts` → `scoreRules()` 函数，在以下位置插入：

```ts
// 插入点：syntax 通过后，hasBpm 之前
if (!syntaxPass) { ... }  // 已有

const parsed = parseScore(code);  // 已有
const layers = parsed.layers;      // 已有

// ↓ 新增
const hasMusicPass = layers.length > 0;
breakdown['hasMusic'] = {
  pass: hasMusicPass,
  score: 0,
  detail: hasMusicPass ? undefined : '无实际音乐层（silence），后续规则全部跳过',
};
if (!hasMusicPass) {
  for (const key of ['hasBpm', 'layerCount', 'bassLpf', 'padRoom', 'hhGain', 'breathingSpace', 'noTidalOnly', 'noSetcpsInLayers']) {
    breakdown[key] = { pass: false, score: 0, detail: '无音乐层，跳过' };
  }
  return { total, breakdown };
}
// ↑ 新增结束
```

---

## 影响范围

- **仅改一个文件**：`scripts/eval/evaluator.ts`，约 10 行
- **不改任何规则分值权重**：总分上限 100 不变
- **不影响多轮层保留分**：`scoreLayerPreservation()` 独立计算，不受影响
- **历史快照对比**：silence 用例的规则分会从 70→20，需要在跑新基线时注意版本标注

---

## 验收标准

1. `setcps(0.375)\nsilence` 输入 → `scoreRules()` 返回 `total: 20`，`hasMusic.pass: false`
2. 有效 2 层代码输入 → 行为与改动前完全一致
3. `npm run lint && npx tsc --noEmit -p tsconfig.app.json` 无错误
