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
  instruction: string;
  durationMs: number;
  trace: AgentTraceEvent[];
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
  kind: 'debug' | 'compare';
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
