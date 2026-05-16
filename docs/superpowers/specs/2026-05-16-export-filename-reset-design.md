# 设计文档：导出弹窗文件名每次打开重置

**日期**：2026-05-16  
**状态**：已批准

## 问题

`ExportPopover` 组件用 `if (!open) return null` 隐藏而非卸载，导致：

1. 用户手动输入的文件名在关闭后保留，下次打开弹窗时仍显示旧值。
2. `filenamePlaceholder`（时间戳）在首次挂载后不再更新，再次打开时显示的是旧时间戳。

## 目标行为

每次打开导出弹窗时：
- 文件名输入框清空（空字符串）
- placeholder 更新为当前时间戳（`oddeNova_YYYYMMDD_HHmmss`）
- `beginCycle`、`endCycle`、`sampleRate` 保留上次值（用户复用方便）

## 方案

**方案 2（useEffect 监听 open）**，仅改动 `src/components/ExportPopover.tsx`：

1. 将 `filenamePlaceholder` 从惰性初始化改为普通 `useState('')`。
2. 新增 `useEffect`，在 `open` 变为 `true` 时重置：
   ```ts
   useEffect(() => {
     if (open) {
       setFilename('');
       setFilenamePlaceholder(defaultFilename());
     }
   }, [open]);
   ```

## 不改动范围

- `defaultFilename()` 函数逻辑不变
- 父组件接口不变
- `beginCycle`、`endCycle`、`sampleRate` 不重置
- 无新依赖，无新文件
