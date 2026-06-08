import type { StrudelState } from '../services/strudel';

export function getEngineUnavailableMessage(
  status: StrudelState['engineStatus'],
): string | null {
  if (status === 'failed') return '初始化失败，请点击重试按钮';
  if (status === 'initializing') return '音频引擎启动中，请稍后再试';
  return null;
}
