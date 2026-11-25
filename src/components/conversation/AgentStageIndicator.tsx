import { lazy, Suspense } from 'react';
import { Disc3, Ear, Eye, Pen, Search } from 'lucide-react';
import type { RouterStage } from '../../agent/progress';
import type { ChatMessage } from '../../hooks/useChat';
import './agent-stage-indicator.css';

// Keep the existing animation and its player out of the initial app bundle.
const ThinkingLottie = lazy(() => import('./ThinkingLottie').then(module => ({ default: module.ThinkingLottie })));

const icons = { search: Search, humming: Ear, image: Eye, writing: Pen, playback: Disc3 };
type StageAnimation = keyof typeof icons | 'thinking';

const stageAnimation = {
  routing: 'thinking',
  search: 'search',
  humming: 'humming',
  image: 'image',
  analysis: 'thinking',
  composition: 'writing',
  structure: 'thinking',
  validation: 'thinking',
  repair: 'writing',
  reply: 'writing',
  playback: 'playback',
} as const satisfies Record<RouterStage, StageAnimation>;

const toolAnimation: Partial<Record<string, StageAnimation>> = {
  searchSamples: 'search',
  analyzeHummingWaveform: 'humming',
  setCode: 'writing',
};

export default function AgentStageIndicator({ stage, operation, status }: {
  stage?: RouterStage;
  operation?: string;
  status?: ChatMessage;
}) {
  const fallback = status?.progressKind === 'commit' ? 'playback' : toolAnimation[status?.toolName ?? ''];
  const animation = operation ? 'writing' : (stage ? stageAnimation[stage] : fallback) ?? 'thinking';
  const Icon = animation === 'thinking' ? null : icons[animation];
  return (
    <div aria-hidden="true" data-agent-stage-animation={animation}
      className="agent-stage-indicator inline-grid size-5 shrink-0 place-items-center text-text-secondary">
      {Icon
        ? <Icon size={16} strokeWidth={1.75} />
        : <Suspense fallback={null}><ThinkingLottie className="size-5" /></Suspense>}
    </div>
  );
}
