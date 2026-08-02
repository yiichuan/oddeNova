import { describe, expect, it, vi } from 'vitest';

import {
  ANALYTICS_DISABLED_STORAGE_KEY,
  createAnalytics,
  resolveAppSurface,
  sanitizePostHogEvent,
} from '../analytics';

function makeClient() {
  return {
    init: vi.fn(),
    capture: vi.fn(),
  };
}

describe('resolveAppSurface', () => {
  it.each([
    [
      { pathname: '/', search: '', hash: '#oddenova=secret-score' },
      'skill_import',
    ],
    [
      { pathname: '/s/share-secret', search: '', hash: '' },
      'shared_session',
    ],
    [
      { pathname: '/', search: '?demo=true&prompt=secret', hash: '' },
      'demo',
    ],
    [
      { pathname: '/anything', search: '?prompt=secret', hash: '#private' },
      'main',
    ],
  ] as const)('classifies a location without returning its raw URL: %o', (location, expected) => {
    expect(resolveAppSurface(location)).toBe(expected);
  });
});

describe('sanitizePostHogEvent', () => {
  it('keeps only the approved system and event properties', () => {
    const sanitized = sanitizePostHogEvent({
      event: 'agent_turn_finished',
      timestamp: '2026-07-29T12:00:00.000Z',
      properties: {
        token: 'phc_public',
        distinct_id: 'anonymous-device',
        $device_id: 'anonymous-device',
        $session_id: 'anonymous-session',
        $browser: 'Chrome',
        $os: 'Mac OS X',
        $device_type: 'Desktop',
        $lib: 'web',
        $lib_version: '1.0.0',
        $geoip_disable: true,
        $process_person_profile: false,
        time: 123,
        schema_version: 1,
        surface: 'demo',
        entry_point: 'text',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        has_existing_code: true,
        has_history: false,
        outcome: 'played',
        duration_ms: 900,
        iterations: 2,
        $current_url: 'https://www.oddenova.com/?prompt=secret#private',
        $pathname: '/s/share-secret',
        $referrer: 'https://private.example/path',
        $raw_user_agent: 'fingerprint',
        prompt: 'make private music',
        code: 'note("private")',
        project_id: 'private-project',
        share_id: 'private-share',
        unknown: 'drop-me',
      },
    });

    expect(sanitized).toEqual({
      event: 'agent_turn_finished',
      timestamp: '2026-07-29T12:00:00.000Z',
      properties: {
        token: 'phc_public',
        distinct_id: 'anonymous-device',
        $device_id: 'anonymous-device',
        $session_id: 'anonymous-session',
        $browser: 'Chrome',
        $os: 'Mac OS X',
        $device_type: 'Desktop',
        $lib: 'web',
        $lib_version: '1.0.0',
        $geoip_disable: true,
        $process_person_profile: false,
        time: 123,
        schema_version: 1,
        surface: 'demo',
        entry_point: 'text',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        has_existing_code: true,
        has_history: false,
        outcome: 'played',
        duration_ms: 900,
        iterations: 2,
      },
    });
  });

  it('drops properties that belong to a different approved event', () => {
    expect(sanitizePostHogEvent({
      event: 'app_opened',
      properties: {
        schema_version: 1,
        surface: 'main',
        locale: 'en',
        outcome: 'played',
        provider: 'private-provider',
      },
    })).toEqual({
      event: 'app_opened',
      properties: {
        schema_version: 1,
        surface: 'main',
        locale: 'en',
      },
    });
  });

  it('drops every event outside the five-event business contract', () => {
    expect(sanitizePostHogEvent({
      event: '$pageview',
      properties: { $current_url: 'https://www.oddenova.com/private' },
    })).toBeNull();
  });
});

describe('PostHog business analytics', () => {
  it('is a complete no-op when the project key is missing', async () => {
    const client = makeClient();
    const loadClient = vi.fn(async () => client);
    const analytics = createAnalytics({
      key: '',
      loadClient,
      storage: { getItem: vi.fn(() => null) },
    });

    analytics.initialize({ surface: 'main', locale: 'en' });
    analytics.trackAgentTurnStarted({
      entry_point: 'text',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      has_existing_code: false,
      has_history: false,
    });
    await Promise.resolve();

    expect(loadClient).not.toHaveBeenCalled();
  });

  it('is a complete no-op when the internal production switch is enabled', async () => {
    const client = makeClient();
    const loadClient = vi.fn(async () => client);
    const getItem = vi.fn((key: string) => key === ANALYTICS_DISABLED_STORAGE_KEY ? '1' : null);
    const analytics = createAnalytics({
      key: 'phc_public',
      loadClient,
      storage: { getItem },
    });

    analytics.initialize({ surface: 'main', locale: 'en' });
    await Promise.resolve();

    expect(getItem).toHaveBeenCalledWith(ANALYTICS_DISABLED_STORAGE_KEY);
    expect(loadClient).not.toHaveBeenCalled();
  });

  it('fails closed when localStorage is unavailable', async () => {
    const client = makeClient();
    const loadClient = vi.fn(async () => client);
    const analytics = createAnalytics({
      key: 'phc_public',
      loadClient,
      storage: {
        getItem: () => { throw new Error('storage blocked'); },
      },
    });

    analytics.initialize({ surface: 'main', locale: 'en' });
    await Promise.resolve();

    expect(loadClient).not.toHaveBeenCalled();
  });

  it('initializes the minimal manual-only SDK once through the Vercel proxy', async () => {
    const client = makeClient();
    const analytics = createAnalytics({
      key: 'phc_public',
      loadClient: async () => client,
      storage: { getItem: () => null },
    });

    analytics.initialize({ surface: 'skill_import', locale: 'zh-CN' });
    analytics.initialize({ surface: 'main', locale: 'en' });

    await vi.waitFor(() => expect(client.init).toHaveBeenCalledOnce());
    expect(client.init).toHaveBeenCalledWith('phc_public', expect.objectContaining({
      api_host: '/_nova',
      ui_host: 'https://us.posthog.com',
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_heatmaps: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_flags: true,
      persistence: 'localStorage',
      person_profiles: 'never',
    }));
    await vi.waitFor(() => expect(client.capture).toHaveBeenCalledOnce());
    expect(client.capture).toHaveBeenCalledWith('app_opened', {
      schema_version: 1,
      surface: 'skill_import',
      locale: 'zh-CN',
      $geoip_disable: true,
      $process_person_profile: false,
    });
  });

  it('captures exactly the five approved events with schema version 1', async () => {
    const client = makeClient();
    const analytics = createAnalytics({
      key: 'phc_public',
      loadClient: async () => client,
      storage: { getItem: () => null },
    });

    analytics.initialize({ surface: 'main', locale: 'en' });
    analytics.trackAgentTurnStarted({
      entry_point: 'suggestion',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      has_existing_code: true,
      has_history: false,
    });
    analytics.trackAgentTurnFinished({
      entry_point: 'suggestion',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      has_existing_code: true,
      has_history: false,
      outcome: 'played',
      duration_ms: 1200,
      iterations: 3,
    });
    analytics.trackShareCompleted({ share_method: 'native' });
    analytics.trackWavExportCompleted();

    await vi.waitFor(() => expect(client.capture).toHaveBeenCalledTimes(5));
    expect(client.capture.mock.calls).toEqual([
      ['app_opened', {
        schema_version: 1,
        surface: 'main',
        locale: 'en',
        $geoip_disable: true,
        $process_person_profile: false,
      }],
      ['agent_turn_started', {
        schema_version: 1,
        surface: 'main',
        entry_point: 'suggestion',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        has_existing_code: true,
        has_history: false,
        $geoip_disable: true,
        $process_person_profile: false,
      }],
      ['agent_turn_finished', {
        schema_version: 1,
        surface: 'main',
        entry_point: 'suggestion',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        has_existing_code: true,
        has_history: false,
        outcome: 'played',
        duration_ms: 1200,
        iterations: 3,
        $geoip_disable: true,
        $process_person_profile: false,
      }],
      ['share_completed', {
        schema_version: 1,
        share_method: 'native',
        $geoip_disable: true,
        $process_person_profile: false,
      }],
      ['wav_export_completed', {
        schema_version: 1,
        $geoip_disable: true,
        $process_person_profile: false,
      }],
    ]);
  });

  it('never throws or creates an unhandled retry path when SDK loading or capture fails', async () => {
    const analyticsWithLoadFailure = createAnalytics({
      key: 'phc_public',
      loadClient: async () => { throw new Error('load failed'); },
      storage: { getItem: () => null },
    });

    expect(() => analyticsWithLoadFailure.initialize({ surface: 'main', locale: 'en' })).not.toThrow();
    expect(() => analyticsWithLoadFailure.trackWavExportCompleted()).not.toThrow();
    await Promise.resolve();

    const client = makeClient();
    client.capture.mockImplementation(() => { throw new Error('capture failed'); });
    const analyticsWithCaptureFailure = createAnalytics({
      key: 'phc_public',
      loadClient: async () => client,
      storage: { getItem: () => null },
    });

    expect(() => analyticsWithCaptureFailure.initialize({ surface: 'main', locale: 'en' })).not.toThrow();
    expect(() => analyticsWithCaptureFailure.trackWavExportCompleted()).not.toThrow();
    await vi.waitFor(() => expect(client.capture).toHaveBeenCalled());
  });
});
