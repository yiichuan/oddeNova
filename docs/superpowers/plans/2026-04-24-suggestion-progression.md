# Suggestion Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让"下一步建议"感知当前曲子的构图阶段和风格意图，引导用户逐步叠加层次、构建出一首完整的曲子。

**Architecture:** 在 `services/suggestions.ts` 中新增两个纯函数（`analyzeMusicState` / `extractStyleIntent`），将其结果注入提示词；`buildSuggestions` 新增 `messages` 参数；`useSuggestions` hook 和 `App.tsx` 跟随更新传参。

**Tech Stack:** TypeScript, React hooks, Anthropic SDK（已有）

---

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/services/suggestions.ts` | 修改 | 新增 `analyzeMusicState`、`extractStyleIntent`；修改 `buildSuggestions` 签名和提示词 |
| `src/hooks/useSuggestions.ts` | 修改 | 新增 `messages` 参数，传入 `buildSuggestions` |
| `src/App.tsx` | 修改 | 向 `useSuggestions` 传入 `messages` |

---

### Task 1：新增 `analyzeMusicState` 纯函数

**Files:**
- Modify: `src/services/suggestions.ts`

- [ ] **Step 1：在 `suggestions.ts` 的 `SUGGEST_SYSTEM` 常量之前，插入以下类型和函数**

在文件第 32 行（`const SUGGEST_SYSTEM` 之前）插入：

```ts
export type MusicStage = 'early' | 'developing' | 'full';

export interface MusicState {
  layers: string[];
  missing: string[];
  stage: MusicStage;
}

const ALL_LAYERS = ['drum', 'bass', 'melody', 'fx'] as const;

/**
 * Lightweight heuristic analysis of a Strudel code snippet.
 * Returns which layers are present, which are missing, and the overall stage.
 * Does NOT call LLM — pure string analysis.
 */
export function analyzeMusicState(code: string): MusicState {
  try {
    const c = code.toLowerCase();
    const layers: string[] = [];

    // Drum detection: common Strudel drum sample names
    if (/\b(bd|sd|hh|oh|cp|mt|lt|ht|rim|kick|snare|hat|clap)\b/.test(c)) {
      layers.push('drum');
    }
    // Bass detection
    if (/\b(bass|sub|sawtooth|saw|square)\b/.test(c)) {
      layers.push('bass');
    }
    // Melody detection: pitched synths
    if (/\b(note|sine|piano|pluck|chord|melody|lead|pad|string)\b/.test(c)) {
      layers.push('melody');
    }
    // FX detection
    if (/\b(room|reverb|delay|echo|crush|distort|filter|lpf|hpf|pan)\b/.test(c)) {
      layers.push('fx');
    }

    const missing = ALL_LAYERS.filter((l) => !layers.includes(l));
    let stage: MusicStage;
    if (layers.length <= 1) stage = 'early';
    else if (layers.length <= 3) stage = 'developing';
    else stage = 'full';

    return { layers, missing, stage };
  } catch {
    // Fallback: treat as empty slate
    return { layers: [], missing: [...ALL_LAYERS], stage: 'early' };
  }
}
```

- [ ] **Step 2：验证 TypeScript 编译无错误**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music
npx tsc --noEmit 2>&1 | head -30
```

期望：无输出（无错误）

- [ ] **Step 3：Commit**

```bash
git add src/services/suggestions.ts
git commit -m "feat(suggestions): add analyzeMusicState pure function"
```

---

### Task 2：新增 `extractStyleIntent` 纯函数

**Files:**
- Modify: `src/services/suggestions.ts`

- [ ] **Step 1：在 `analyzeMusicState` 函数之后插入**

```ts
const STYLE_ALIASES: Record<string, string> = {
  lofi: 'lo-fi',
  'lo fi': 'lo-fi',
  hiphop: 'hip-hop',
  'hip hop': 'hip-hop',
  dnb: 'drum and bass',
  'drum and bass': 'drum and bass',
};

const STYLE_KEYWORDS = [
  'lo-fi', 'lofi', 'house', 'techno', 'ambient', 'jazz', 'funk',
  'drum and bass', 'dnb', 'trance', 'minimal', 'classical',
  'hip hop', 'hiphop', 'trap', 'indie', 'folk', 'lo fi',
];

/**
 * Extract a style intent string from the first user message in the conversation.
 * Returns null if no known style keyword is found.
 */
export function extractStyleIntent(messages: { role: string; content: string }[]): string | null {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return null;
  const text = firstUser.content.toLowerCase();
  for (const kw of STYLE_KEYWORDS) {
    if (text.includes(kw)) {
      return STYLE_ALIASES[kw] ?? kw;
    }
  }
  return null;
}
```

- [ ] **Step 2：验证 TypeScript 编译无错误**

```bash
npx tsc --noEmit 2>&1 | head -30
```

期望：无输出

- [ ] **Step 3：Commit**

```bash
git add src/services/suggestions.ts
git commit -m "feat(suggestions): add extractStyleIntent pure function"
```

---

### Task 3：更新 `buildSuggestions` — 签名、提示词、调用

**Files:**
- Modify: `src/services/suggestions.ts`

- [ ] **Step 1：替换 `SUGGEST_SYSTEM` 常量和 `buildSuggestions` 函数**

将文件中现有的 `const SUGGEST_SYSTEM = ...` 整段替换为：

```ts
function buildSuggestSystem(state: MusicState, styleIntent: string | null): string {
  const layersStr = state.layers.length > 0 ? state.layers.join(', ') : '无';
  const missingStr = state.missing.length > 0 ? state.missing.join(', ') : '无';
  const styleStr = styleIntent ?? '未知';

  return `你是 Strudel 实时电子乐协作伙伴。

当前曲子状态：
- 已有声部：${layersStr}
- 缺少声部：${missingStr}
- 制作阶段：${state.stage}
- 风格方向：${styleStr}

基于以上状态，建议 2 个用户可以发出的"下一步"中文短指令。
规则：
- stage=early → 优先建议补 missing 里的声部（如"加入鼓点"、"铺一层低音"）
- stage=developing → 可以加层，也可以调质感/节奏/速度
- stage=full → 专注变奏、情绪变化，不要再建议加层
- 风格方向不为"未知"时，建议内容要符合该风格特征
- 每条 6-12 个字，自然口语，不要英文术语堆砌
- 输出 JSON：{"suggestions":["...","..."]}，不要任何额外文字`;
}
```

然后将 `buildSuggestions` 函数签名和函数体替换为：

```ts
/**
 * Build 2 short next-step suggestions based on the current code and conversation.
 * - Empty code → static defaults.
 * - Otherwise → LLM call with music state context; failure falls back to static.
 */
export async function buildSuggestions(
  currentCode: string,
  messages: { role: string; content: string }[],
): Promise<string[]> {
  if (!currentCode.trim()) {
    return pickStatic(2);
  }
  try {
    const state = analyzeMusicState(currentCode);
    const styleIntent = extractStyleIntent(messages);
    const system = buildSuggestSystem(state, styleIntent);

    const anthropic = getClient();
    const resp = await anthropic.messages.create({
      model: getActiveModelConfig().model,
      system,
      messages: [
        {
          role: 'user',
          content: `当前曲谱：\n${currentCode}\n\n请输出 2 条建议。`,
        },
      ],
      temperature: 0.8,
      max_tokens: 200,
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = parseSuggestions(text);
    if (parsed && parsed.length > 0) return parsed.slice(0, 2);
  } catch (e) {
    console.warn('[suggestions] upstream call failed, falling back to static', e);
  }
  return pickStatic(2);
}
```

- [ ] **Step 2：验证 TypeScript 编译无错误**

```bash
npx tsc --noEmit 2>&1 | head -30
```

期望：无输出（`useSuggestions.ts` 和 `App.tsx` 会报错，因为还未更新调用方——这是正常的，Task 4/5 会修复）

- [ ] **Step 3：Commit**

```bash
git add src/services/suggestions.ts
git commit -m "feat(suggestions): inject music state and style intent into prompt"
```

---

### Task 4：更新 `useSuggestions` hook

**Files:**
- Modify: `src/hooks/useSuggestions.ts`

- [ ] **Step 1：替换整个文件内容**

```ts
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from './useChat';
import { buildSuggestions, STATIC_SUGGESTIONS } from '../services/suggestions';

/**
 * Manages the "next-step" suggestion chips shown above the input box.
 *
 * Strategy (mixed):
 *   - When the conversation has no user messages yet → static defaults.
 *   - After each commit (i.e. currentCode changed and is non-empty) →
 *     fetch 2 fresh suggestions from the LLM with music state + style intent context.
 *
 * `key` is used to bust the cache when switching sessions, so we don't
 * carry the previous session's chips into the new one.
 */
export function useSuggestions(opts: {
  key: string;
  currentCode: string;
  hasUserMessages: boolean;
  messages: ChatMessage[];
}) {
  const { key, currentCode, hasUserMessages, messages } = opts;
  const [suggestions, setSuggestions] = useState<string[]>(() => STATIC_SUGGESTIONS.slice(0, 2));
  const [prevKey, setPrevKey] = useState(key);
  const reqIdRef = useRef(0);
  const lastCodeRef = useRef<string>('');

  // Reset when switching sessions.
  if (prevKey !== key) {
    setPrevKey(key);
    setSuggestions(STATIC_SUGGESTIONS.slice(0, 2));
  }

  // Reset lastCodeRef when key changes (safe to access refs inside effects).
  useEffect(() => {
    lastCodeRef.current = '';
  }, [key]);

  useEffect(() => {
    // No conversation yet → keep showing the static defaults.
    if (!hasUserMessages || !currentCode.trim()) {
      return;
    }
    // Avoid refetching for the same code (e.g. after re-render).
    if (lastCodeRef.current === currentCode) return;
    lastCodeRef.current = currentCode;

    const my = ++reqIdRef.current;
    buildSuggestions(currentCode, messages).then((chips) => {
      // Drop stale responses if the user moved on already.
      if (my !== reqIdRef.current) return;
      if (chips.length > 0) setSuggestions(chips);
    });
  }, [currentCode, hasUserMessages, messages]);

  return suggestions;
}
```

- [ ] **Step 2：验证 TypeScript 编译无错误**

```bash
npx tsc --noEmit 2>&1 | head -30
```

期望：只剩 `App.tsx` 报 `messages` 缺失的错误（正常，Task 5 修复）

- [ ] **Step 3：Commit**

```bash
git add src/hooks/useSuggestions.ts
git commit -m "feat(useSuggestions): pass messages to buildSuggestions"
```

---

### Task 5：更新 `App.tsx` 调用

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1：找到 `useSuggestions` 调用块，加入 `messages` 参数**

找到（约第 24-28 行）：

```ts
  const suggestions = useSuggestions({
    key: current?.id ?? '',
    currentCode,
    hasUserMessages,
  });
```

替换为：

```ts
  const suggestions = useSuggestions({
    key: current?.id ?? '',
    currentCode,
    hasUserMessages,
    messages,
  });
```

- [ ] **Step 2：验证 TypeScript 编译全部无错误**

```bash
npx tsc --noEmit 2>&1 | head -30
```

期望：无输出

- [ ] **Step 3：Commit**

```bash
git add src/App.tsx
git commit -m "feat(App): pass messages to useSuggestions for style intent"
```

---

### Task 6：手动验证

- [ ] **Step 1：启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2：验证场景 A — 有风格意图的渐进式构建**

1. 新建会话
2. 输入：`来段 lo-fi 节奏`
3. 等待 Agent 生成代码并播放
4. 观察建议词：应出现"加入贝斯"、"铺一层旋律"等针对 lo-fi 风格且与当前缺失层相关的建议
5. 点击建议，等待 Agent 执行
6. 再次观察建议：随着层数增加，建议应转向调质感/变奏，不再建议"加层"

- [ ] **Step 3：验证场景 B — 无风格意图的回退**

1. 新建会话
2. 输入：`来段循环`（无具体风格词）
3. 等待 Agent 生成
4. 观察建议：应仍有方向感（如"加入鼓点"），但不会锁定特定风格

- [ ] **Step 4：验证场景 C — 代码为空时不调用 LLM**

1. 打开浏览器 DevTools → Network
2. 新建会话（代码为空）
3. 观察：不应有对 LLM API 的网络请求（建议词来自静态池）
