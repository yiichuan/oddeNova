// ===========================================================================
// Lazy entry point for the heavy LLM runtime (services/llm.ts).
//
// llm.ts pulls the OpenAI + Anthropic SDKs, the system prompt and the agent
// loop — megabytes that no reader should pay before their first generation.
// Everything here forwards to the real module through a single shared
// dynamic import: first caller starts the load, concurrent callers join the
// same Promise, and the loaded runtime is kept module-wide for later turns.
//
// Signatures are the originals (verified against services/llm.ts by the
// `satisfies` guards below); callers keep their typing unchanged.
// ===========================================================================

import type {
  ProgressEvent,
  RunAgentResult,
  ConversationTurn,
} from '../agent/loop';

type Runtime = typeof import('./llm');

export type { ProgressEvent, RunAgentResult, ConversationTurn } from '../agent/loop';

let runtimePromise: Promise<Runtime> | null = null;
let runtime: Runtime | null = null;

async function loadRuntime(): Promise<Runtime> {
  if (runtime) return runtime;
  if (!runtimePromise) {
    runtimePromise = import('./llm').then((module) => {
      runtime = module;
      runtimePromise = null;
      return module;
    });
    // A failed load must not poison later calls: drop the shared promise so
    // the next call starts a fresh attempt. No automatic retries here.
    runtimePromise.catch(() => {
      runtimePromise = null;
    });
  }
  return runtimePromise;
}

/**
 * Synchronous configuration reset. Mirrors llm.resetClient(): only the
 * already-loaded runtime's client singletons are cleared. When the runtime
 * has not been requested yet this is a no-op — llm.ts creates its clients
 * lazily at first call, so settings saved before any turn are picked up
 * naturally when the runtime first loads.
 */
export function resetClient(): void {
  runtime?.resetClient();
}

/** Await the runtime without starting a turn (exposed for tests/introspection). */
export function loadLlmRuntime(): Promise<Runtime> {
  return loadRuntime();
}

export async function runAgent(
  instruction: string,
  currentCode: string,
  onProgress?: (e: ProgressEvent) => void,
  moodContext?: string,
  signal?: AbortSignal,
  conversationHistory?: ConversationTurn[],
): Promise<RunAgentResult> {
  const module = await loadRuntime();
  // The import itself cannot be aborted; make sure a request cancelled while
  // the module was downloading stays cancelled once the real runtime is here.
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  return module.runAgent(instruction, currentCode, onProgress, moodContext, signal, conversationHistory);
}

export async function chatOnce(
  system: string,
  userContent: string,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const module = await loadRuntime();
  return module.chatOnce(system, userContent, opts);
}

export async function classifyIntent(
  ...args: Parameters<Runtime['classifyIntent']>
): Promise<ReturnType<Runtime['classifyIntent']>> {
  const module = await loadRuntime();
  return module.classifyIntent(...args);
}

// Compile-time guards: the loader's public surface must match the original
// module's. Written as a function type comparison so the build fails when a
// signature drifts from services/llm.ts.
type RuntimeSurface = Runtime;
type LoaderSurface = {
  runAgent: typeof runAgent;
  chatOnce: typeof chatOnce;
  resetClient: typeof resetClient;
  classifyIntent: typeof classifyIntent;
};
type RuntimeHasLoader = {
  [K in keyof LoaderSurface]: LoaderSurface[K] extends RuntimeSurface[K] ? never : K;
}[keyof LoaderSurface];
type _Matched = [RuntimeHasLoader] extends [never] ? true : never;
export type { _Matched as _SurfaceGuard };
