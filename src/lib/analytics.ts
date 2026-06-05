// src/lib/analytics.ts
import { track } from '@vercel/analytics';

export function trackAgentRun(props: {
  provider: string;
  model: string;
  iterations: number;
  durationMs: number;
  committed: boolean;
}): void {
  try { track('agent_run', props); } catch { /* fire-and-forget */ }
}

export function trackAgentError(props: {
  provider: string;
  model: string;
  error_type: string;
}): void {
  try { track('agent_error', props); } catch { /* fire-and-forget */ }
}

export function trackAgentAbort(): void {
  try { track('agent_abort'); } catch { /* fire-and-forget */ }
}

export function trackShare(): void {
  try { track('share'); } catch { /* fire-and-forget */ }
}

export function trackWavExport(): void {
  try { track('wav_export'); } catch { /* fire-and-forget */ }
}
