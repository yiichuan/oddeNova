import { lazy, Suspense } from 'react';
import { Disc3, Glasses, Headphones, Pen, Search } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import type { RouterStage } from '../../agent/progress';
import type { ChatMessage } from '../../hooks/useChat';
import './agent-stage-indicator.css';

// Keep the existing animation and its player out of the initial app bundle.
const ThinkingLottie = lazy(() => import('./ThinkingLottie').then(module => ({ default: module.ThinkingLottie })));

const icons = { search: Search, humming: Headphones, image: Glasses, writing: Pen, drawing: Pen, playback: Disc3 };
type StageAnimation = keyof typeof icons | 'thinking';

// A single stroke keeps the pen tip and the revealed ink on the same curve.
const drawingPath = 'M3.8 12 C5.2 9.9 8 7.1 8.7 8.5 C10.1 9.9 7.3 14.8 8.7 15.5 C10.1 16.2 12.2 14.1 13.6 12.7';

const stageAnimation = {
  routing: 'thinking',
  search: 'search',
  humming: 'humming',
  image: 'image',
  analysis: 'thinking',
  composition: 'drawing',
  structure: 'thinking',
  validation: 'thinking',
  repair: 'writing',
  reply: 'writing',
  playback: 'playback',
} as const satisfies Record<RouterStage, StageAnimation>;

const toolAnimation: Partial<Record<string, StageAnimation>> = {
  searchSamples: 'search',
  analyzeHummingWaveform: 'humming',
  setCode: 'drawing',
};

export default function AgentStageIndicator({ stage, operation, status }: {
  stage?: RouterStage;
  operation?: string;
  status?: ChatMessage;
}) {
  const fallback = status?.progressKind === 'commit' ? 'playback' : toolAnimation[status?.toolName ?? ''];
  const animation = operation ? 'drawing' : (stage ? stageAnimation[stage] : fallback) ?? 'thinking';
  return (
    <div aria-hidden="true" data-agent-stage-animation={animation}
      className="agent-stage-indicator inline-grid size-5 shrink-0 place-items-center text-text-secondary">
      {animation === 'humming' && (
        <svg className="agent-stage-waves" viewBox="0 0 20 20" width="20" height="20">
          <path d="M3 11.5 Q1 13.7 3 15.9 M17 11.5 Q19 13.7 17 15.9" fill="none" stroke="currentColor" strokeLinecap="round" />
        </svg>
      )}
      {animation === 'drawing' && (
        <svg className="agent-stage-ink" viewBox="0 0 20 20" width="20" height="20">
          <path d={drawingPath} pathLength="1" fill="none" stroke="currentColor" strokeLinecap="round" />
        </svg>
      )}
      {animation === 'thinking'
        ? <Suspense fallback={null}><ThinkingLottie className="size-5" /></Suspense>
        : <MorphIcon
            className="agent-stage-morph"
            icon={icons[animation]}
            size={16}
            strokeWidth={1.75}
            reducedMotion="user"
            spring="smooth"
            style={animation === 'drawing' ? { offsetPath: `path("${drawingPath}")` } : undefined}
          />}
    </div>
  );
}
