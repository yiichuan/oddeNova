import type { ConversationTurn, RunAgentResult } from '../agent/loop';
import type { PromptLocale, PromptTemplate } from '../prompts/lab/template';
import type { ModelConfig, ProviderType } from '../services/llm-config';
import type { AgentTraceEvent } from '../agent/loop';

export interface PromptLabCase {
  id: string;
  name: string;
  category: string;
  locale?: PromptLocale;
  initialCode?: string;
  turns: string[];
  initialHistory?: ConversationTurn[];
  turnCriteria?: string[][];
  turnChecks?: { mustContain?: string[]; mustNotContain?: string[]; expectedDelivery?: "commit" | "reply" | "either" }[];
  source?: { experimentId: string; caseId: string; trialIndex: number; turnIndex: number };
  mustContain?: string[];
  mustNotContain?: string[];
  reviewCriteria?: string[];
}

export interface PromptLabSuite {
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  cases: PromptLabCase[];
}

export type PromptLabResult = RunAgentResult & {
  trialIndex?: number;
  turnIndex?: number;
  inputSnapshot?: { code: string; history: ConversationTurn[] };
  usage?: { inputTokens: number; outputTokens: number; requestCount: number; measured: number; completeness: "complete" | "partial" | "unknown" };
  instruction: string;
  durationMs: number;
  trace: AgentTraceEvent[];
  traceId?: string;
  checks: { label: string; passed: boolean }[];
  rating?: number;
  ratingNote?: string;
  error?: string;
};

export interface PromptLabCaseResult {
  caseId: string;
  caseSnapshot: PromptLabCase;
  left: PromptLabResult[];
  right: PromptLabResult[];
}

export interface PromptLabExperiment {
  id: string;
  revision: number;
  schemaVersion?: 2;
  purpose?: string;
  changeNote?: string;
  provenance?: { commit: string | null; dirty: boolean; leftHash: string; rightHash?: string };
  kind: 'debug' | 'compare' | 'batch';
  historySources?: { left: PromptLabHistorySource; right: PromptLabHistorySource };
  unmatched?: string[];
  name: string;
  status: 'running' | 'completed' | 'cancelled' | 'interrupted' | 'failed';
  createdAt: string;
  updatedAt: string;
  suiteId?: string;
  suiteName?: string;
  config: Omit<ModelConfig, 'apiKey'> & { apiKey: '[redacted]' };
  thinkingLevel: 'low' | 'medium' | 'high';
  repeats: number;
  variables: Pick<PromptLabConfig, 'personaName' | 'personaPrompt' | 'moodContext'>;
  leftTemplate: PromptTemplate;
  rightTemplate?: PromptTemplate;
  leftSystemPrompt: string;
  rightSystemPrompt?: string;
  intentClassifierPrompt: string;
  suiteSnapshot?: PromptLabSuite;
  results: PromptLabCaseResult[];
  error?: string;
}

export interface PromptLabConfig {
  provider: ProviderType;
  model: string;
  apiKey: string;
  thinkingLevel: 'low' | 'medium' | 'high';
  personaName: string;
  personaPrompt: string;
  moodContext: string;
}

export interface PromptLabTurnState {
  code: string;
  history: ConversationTurn[];
}

export interface LabReview {
  id: string;
  revision: number;
  experimentId: string;
  caseId: string;
  trialIndex: number;
  preference?: 'left' | 'right' | 'tie' | 'unknown';
  note: string;
  swapped: boolean;
  revealed: boolean;
  mode: 'standard' | 'blind';
  dimensions?: Partial<Record<'left' | 'right', Record<string, number | undefined>>>;
  conclusion?: 'adopt' | 'reject' | 'undecided';
}

export interface PromptLabHistorySource {
  runId: string;
  revision: number;
  side: 'left' | 'right';
  snapshot: PromptLabExperiment;
}
