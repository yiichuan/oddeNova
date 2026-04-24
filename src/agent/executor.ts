// Tool dispatcher. Routes a single OpenAI-style tool_call to the matching
// ToolDef handler, with retry-on-error semantics. Bubbles CommitSignal up to
// the loop so it can terminate.

import { CommitSignal, findTool, type ToolContext, type ToolResult } from './tools';

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: string; // raw JSON string from the model
}

export interface ToolCallOutcome {
  id: string;
  name: string;
  result: ToolResult;
}

export async function dispatchToolCall(
  call: ToolCallRequest,
  ctx: ToolContext,
  maxRetries = 2
): Promise<ToolCallOutcome> {
  const tool = findTool(call.name);
  if (!tool) {
    return {
      id: call.id,
      name: call.name,
      result: { ok: false, error: `未知 tool: ${call.name}` },
    };
  }

  let parsedArgs: Record<string, unknown> = {};
  if (call.arguments && call.arguments.trim()) {
    try {
      const parsed = JSON.parse(call.arguments);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedArgs = parsed as Record<string, unknown>;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        id: call.id,
        name: call.name,
        result: {
          ok: false,
          error: `arguments JSON 解析失败: ${msg}`,
        },
      };
    }
  }

  let lastError: string | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.debug(`[executor] → tool "${call.name}" (attempt ${attempt})`, parsedArgs);
      const result = await tool.handler(parsedArgs, ctx);
      if (result.ok) {
        console.debug(`[executor] ✓ tool "${call.name}"`, result.data);
        return { id: call.id, name: call.name, result };
      }
      lastError = result.error;
      // Non-retryable errors: missing fields / unknown layer / etc. The model
      // benefits more from seeing the error than from us silently retrying.
      console.warn(`[executor] ✗ tool "${call.name}" ok=false:`, lastError);
      break;
    } catch (e: unknown) {
      if (e instanceof CommitSignal) throw e;
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`[executor] ✗ tool "${call.name}" threw (attempt ${attempt}):`, lastError);
    }
  }
  console.error(`[executor] ✗ tool "${call.name}" final failure:`, lastError || 'tool 执行失败');
  return {
    id: call.id,
    name: call.name,
    result: { ok: false, error: lastError || 'tool 执行失败' },
  };
}
