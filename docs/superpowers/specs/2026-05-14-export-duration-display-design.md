# 导出弹窗显示预计时长 — 设计规格

**日期**：2026-05-14  
**状态**：待实现

---

## 背景

导出 WAV 时，用户输入起始/结束 cycle，但无法直接感知这段 cycle 对应的实际音频时长。需要根据当前 BPM 实时计算并展示。

---

## 目标

在导出弹窗（`ExportPopover`）中，当用户修改 cycle 范围时，实时显示对应的预计音频时长。

---

## 时长计算

```
duration_seconds = (endCycle - beginCycle) × 240 / bpm
```

BPM 来源：`CodePanel` 的本地 state `bpm`，通过 prop 传入 `ExportPopover`。

---

## 时长格式化规则

| 时长范围 | 显示格式 | 示例 |
|---|---|---|
| `< 60 秒` | `XX.X 秒` | `12.5 秒` |
| `>= 60 秒` | `XX 分 XX 秒` | `1 分 30 秒` |

- 秒数 `>= 60` 时，分钟取整除，秒取模后取整（`Math.floor`）。
- 时长只在 `endCycle > beginCycle` 时显示（否则显示红色错误提示）。

---

## 数据流

```
CodePanel.bpm (state)
  └─► <ExportPopover bpm={bpm} ...>
        └─► duration = (endCycle - beginCycle) * 240 / bpm
              └─► 格式化后渲染在 cycle 输入行与采样率行之间
```

---

## UI 位置

在"结束 cycle"输入行下方、"采样率"选择框上方，新增一行：

```
预计时长   XX.X 秒
```

样式与其他字段一致（`text-[12px] text-white/50`），标签用 `Field` 组件包裹，值部分只读文本。

---

## 改动范围

### `src/components/ExportPopover.tsx`
- `ExportPopoverProps` 新增 `bpm: number`
- `ExportPopover` 解构接收 `bpm`
- body 中 cycle 行与采样率行之间插入时长展示行（使用 `useMemo` 计算）

### `src/components/CodePanel.tsx`
- `<ExportPopover>` 调用处新增 `bpm={bpm}`

---

## 不在范围内

- 在导出弹窗中修改 BPM
- 将 BPM 状态提升到 `useStrudel` hook
