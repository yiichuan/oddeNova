# Design: 移除 improvise，主 agent 直接生成层代码

**日期:** 2026-05-22  
**状态:** 已批准

## 背景

improvise tool 调用子 LLM 生成代码片段，但子 LLM 只收到结构化参数（role/style/currentCode），缺乏完整对话历史。主 agent 拥有全部对话上下文，在识别 improvise 返回错误后频繁绕过它自己写更好的代码——造成一次额外 LLM 调用被浪费，且最终代码质量更不稳定。

## 解决方案

移除 `improvise` tool，将 IMPROVISE_SYSTEM_PROMPT 中的音乐生成专业知识（频段互补规则、调性对齐、gain 范围、few-shot 示例）合并进主 agent system prompt（新版本 v3）。主 agent 在调用 `addLayer`/`replaceLayer` 时直接生成代码，利用完整对话历史获得更好的音乐意图理解。

## 架构变化

**当前**：主 agent → improvise(role,style) → 子 LLM → 代码片段 → 主 agent → addLayer(code)

**新**：主 agent → addLayer(code) ← 利用完整对话上下文直接生成

## 文件改动

- `src/prompts/versions/v3.ts`: 新建，在 AGENT_SYSTEM_PROMPT 末尾添加「Layer Code Generation」段落
- `src/prompts/active.ts`: 指向 v3
- `src/agent/tools.ts`: 移除 improvise ToolDef，更新 addLayer/replaceLayer 描述
- `src/agent/__tests__/tools.test.ts`: 无专用 improvise 测试，不需改动

## 不在范围

- 不删除 `ImproviseRequest` 类型（demo 场景引用）
- 不删除 `IMPROVISE_SYSTEM_PROMPT` 导出（标注 deprecated，保留回滚参考）
- 不修改 validate、executor、loop、parser

## 验证

运行 multi-turn eval case MT-A-004 / MT-A-006 / MT-C-002，对比调性一致性 checkpoint 通过率。
