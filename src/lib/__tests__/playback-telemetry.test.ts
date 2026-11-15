// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { PlaybackTelemetry } from '../playback-telemetry';

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('../analytics', () => ({ trackTelemetry: capture }));

describe('playback lifecycle events', () => {
  it('keeps replaced attempts paired and ignores a late result from an obsolete attempt', () => {
    const telemetry = new PlaybackTelemetry();
    const context = { page: 'home' as const, turn_id: 'turn' };
    const first = telemetry.request('agent', context)!;
    const second = telemetry.request('history', context)!;
    telemetry.start(first);
    telemetry.finish('startup_failed', first);
    telemetry.start(second);
    telemetry.finish('paused');
    const resumed = telemetry.request('history', context)!;
    telemetry.start(resumed);
    window.dispatchEvent(new Event('pagehide'));
    expect(capture.mock.calls.map(([event, fields]) => [event, fields.operation_id, fields.end_reason])).toEqual([
      ['playback_requested', first.operation_id, undefined],
      ['playback_finished', first.operation_id, 'replaced'],
      ['playback_requested', second.operation_id, undefined],
      ['playback_started', second.operation_id, undefined],
      ['playback_finished', second.operation_id, 'paused'],
      ['playback_requested', resumed.operation_id, undefined],
      ['playback_started', resumed.operation_id, undefined],
      ['playback_finished', resumed.operation_id, 'page_left'],
    ]);
  });
});
