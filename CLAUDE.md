# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent instruction design

When editing prompts or agent-facing instructions, follow
`docs/ai/agent-instruction-design.md`.

Use the sequence `Goal -> Principles -> Knowledge -> Guidance -> Constraints -> Review`.
Prefer goals, principles, examples, and self-review over procedural workflows or
over-specific rules. Trust the model's reasoning; add hard constraints only when
they prevent concrete failures or define non-negotiable boundaries.

## Commands

```bash
npm run dev              # Vite dev server (localhost:5173)
npm run build            # tsc -b + vite build (type-check happens here)
npm run lint             # ESLint over the whole repo
npm test                 # Vitest, run once (--passWithNoTests)
npx vitest run <path>    # run a single test file
npx vitest <pattern>     # watch mode / filter by name
npx tsc --noEmit -p tsconfig.app.json   # strict type-check only
```

Pre-commit (husky + lint-staged) automatically runs `tsc --noEmit`, ESLint on
staged `*.ts/*.tsx` (`--max-warnings=0`), and the full test suite. A commit
that fails any of these did not happen — fix and re-commit, don't bypass with
`--no-verify`.

Eval harness (LLM-in-the-loop scoring of the agent prompts, requires API keys
in `scripts/eval/.env`):

```bash
npm run eval          # node --import=tsx/esm scripts/eval/runner.ts
npm run eval:report
```

## UI changes

Do not start the dev server or drive a browser to verify UI/frontend changes.
Type-check, lint, and the test suite are the bar for "done" — the developer
reviews visual results themselves.

## Architecture

oddeNova is a browser-only (no backend except a thin Vercel proxy) AI agent
that writes and plays [Strudel](https://strudel.cc/) live-coding music
patterns. One user instruction = one run of the agent loop, which ends by
emitting a complete Strudel script that gets executed via WebAudio.

```
ChatInput → App.tsx handleInstruction()
  → services/llm.ts runAgent()
    → agent/loop.ts runAgentLoop()        // up to 30 iterations
        → LLMCaller.chatWithTools()       // Anthropic or OpenAI-protocol call
        → agent/executor.ts dispatchToolCall()
            → agent/tools.ts TOOLS[name].handler()
                → throws CommitSignal(code) to end the loop
  → services/strudel.ts (play the committed code via superdough/WebAudio)
  → hooks/useSessions.ts (persist to IndexedDB)
```

Key modules:

- **`src/agent/`** — the agent itself, independent of any specific LLM SDK.
  - `tools.ts` — the 3 tools the model can call: `setCode` (write/replace the
    full Strudel script), `validate` (syntax + sandbox dry-run, catches
    hallucinated APIs like `by`/`sometimesBy`), `commit` (terminal — throws
    `CommitSignal`).
  - `loop.ts` — `runAgentLoop()`, the LLM-agnostic iteration loop. Accepts an
    injected `LLMCaller` so this module never imports the OpenAI/Anthropic
    SDKs directly. Handles both OpenAI tool-call format and Anthropic
    extended-thinking blocks (which must be echoed back verbatim on
    subsequent turns).
  - `executor.ts` — dispatches one tool call, retries on tool error
    (`maxRetries`), bubbles `CommitSignal` up to the loop.
  - `parser.ts` — structural parser for the generated code: recognises
    `setcps(N)` and `stack(...)`, and splits stack arguments into named
    layers via `/* @layer NAME */` comment markers (or auto-names
    `layer_0`, ...). This is what lets the agent edit one instrument layer
    without touching the others.
  - `__tests__/` — when you change any handler/behavior in `parser.ts` or
    `tools.ts`, update the matching test in the same commit (uses
    `getHandler` + `makeCtx` helpers from `tools.test.ts`). `validate` /
    `improvise` depend on browser AudioContext APIs and are **not**
    unit-tested.

- **`src/services/llm-config.ts`** — central provider routing. Six
  user-selectable providers (`deepseek`, `kimi`, `openai`, `anthropic`,
  `official`, `glm`) each map to a base URL, protocol (`anthropic` or
  `openai`), and model. `official` proxies through
  `api/official/v1/chat/completions.ts` (Vercel serverless / Vite dev
  middleware) using a server-side key; other providers use a
  `localStorage` key entered via `ApiKeyModal`.

- **`src/services/strudel.ts`** + **`src/hooks/useStrudel.ts`** — wraps the
  `superdough`/Strudel audio engine as a singleton. Components must go
  through `useStrudel()`, never import `strudelService` directly, and never
  construct `new AudioContext()` — context lifecycle is owned by superdough's
  `getAudioContext()`/`setAudioContext()`.

- **`src/prompts/`** — versioned system prompts. A completed prompt version is
  immutable history; the current in-progress prompt version for one product
  requirement may be edited repeatedly until that requirement is finished.
  `active.ts` is the pointer to the current version; `system-prompt.ts` is a
  forwarding shim and must never be edited directly. To change the prompt,
  follow `.github/prompts/edit-system-prompt.prompt.md` (create or reuse the
  requirement's working `v{N+1}`, update its header comment, point `active.ts`
  at it).

- **`src/hooks/useSessions.ts`** + **`src/lib/session-storage.ts`** — multi-
  session state, persisted to IndexedDB (falls back to in-memory if
  unavailable). Each session holds `messages` (chat + agent progress) and the
  last-committed `code`. `useReplay.ts` replays a session's history step by
  step; undo supports up to 50 steps.

- **`src/demo/`** — `?demo=true` runs a scripted `demo-llm.ts` in place of a
  real LLM call, replaying canned tool-call sequences from `demo-config.ts`,
  so the agent loop can be exercised without API keys.

## Import rules: superdough / @strudel/*

Only import from the package root — never deep-import into source files:

```ts
// correct
import { superdough, getAudioContext, setAudioContext } from 'superdough';

// wrong — fails silently at runtime
import { SuperdoughAudioController } from 'superdough/superdoughoutput.mjs';
import { clearNodePools } from 'superdough/nodePools.mjs';
```

`eslint.config.js` has a `no-restricted-imports` rule that turns any
`superdough/*` deep import into a lint error. Same applies to `@strudel/*`
packages. Reason: the npm package ships a bundled `dist/index.mjs` holding
module-level singletons (e.g. `audioContext`). Importing a source path loads
a *second* module graph whose own `audioContext` is never updated by the
bundled `setAudioContext`, causing `InvalidAccessError: cannot connect to an
AudioNode belonging to a different audio context` — symptom: exported WAVs
are missing delay/room effects that are audible in live playback. Rule of
thumb: if a module exposes a `let xxx; export function setXxx(v) { xxx = v }`
singleton setter, importing a subpath bypasses that setter — always go
through the package root. If you need an unexported internal symbol, request
an upstream export rather than reaching in.

## AudioContext management

- Never call `new AudioContext()` in a component or service — always go
  through superdough's `getAudioContext()` / `setAudioContext()`.
- Never cache an `AudioContext` instance in React state or a local variable;
  it's a singleton, fetch it from superdough each time.
- WAV export: close the live context, switch to the offline context via the
  bundled setter, then reset the controller so it lazily rebuilds against the
  new context (don't construct `new SuperdoughAudioController(offlineCtx)`
  from source):

  ```ts
  await liveCtx.close();
  setAudioContext(offlineCtx);
  setSuperdoughAudioController(null); // lazy-rebuild inside bundled module
  await initAudio({ maxPolyphony: 1024, multiChannelOrbits: false });
  ```

  After export, rebuild the live context (`rebuildMasterChain()`) and restore
  soundfonts.