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

  it('drops every event outside the business event allowlist', () => {
    expect(sanitizePostHogEvent({
      event: '$pageview',
      properties: { $current_url: 'https://www.oddenova.com/private' },
    })).toBeNull();
  });
});

describe('PostHog business analytics', () => {
  it('counts accounts independently of browser identity and resets daily deduplication at UTC+8 midnight', async () => {
    let now = new Date('2026-11-15T15:59:59Z');
    const setupBrowser = () => {
      const client = makeClient();
      const analytics = createAnalytics({
        key: 'phc_public',
        loadClient: async () => client,
        storage: { getItem: () => null },
        now: () => now,
      });
      analytics.initialize({ surface: 'main', locale: 'en' });
      return {
        analytics,
        activity: () => client.capture.mock.calls
          .filter(([event]) => event === 'account_active')
          .map(([, properties]) => properties),
      };
    };
    const a = setupBrowser();
    const b = setupBrowser();
    await Promise.all([
      a.analytics.trackAccountActive('account-a'),
      a.analytics.trackAccountActive('account-a'),
      b.analytics.trackAccountActive('account-a'),
    ]);
    expect(a.activity()).toHaveLength(1);
    expect(a.activity()).toEqual(b.activity());
    const [first] = a.activity();
    expect(first).toMatchObject({
      activity_date: '2026-11-15',
      account_analytics_id: expect.stringMatching(/^account_v1_[a-f0-9]{64}$/),
    });
    expect(first).not.toHaveProperty('distinct_id');
    await a.analytics.trackAccountActive('account-b');
    expect(a.activity()[1].account_analytics_id).not.toBe(first.account_analytics_id);
    now = new Date('2026-11-15T16:00:00Z');
    await a.analytics.trackAccountActive('account-a');
    expect(a.activity()[2]).toEqual({ ...first, activity_date: '2026-11-16' });
    expect(sanitizePostHogEvent({
      event: 'account_active', properties: { ...first, email: 'private', account_id: 'account-a' },
    })?.properties).toEqual(first);
    expect(sanitizePostHogEvent({
      event: 'app_opened', properties: { account_analytics_id: first.account_analytics_id },
    })?.properties).toEqual({});
  });

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
    expect(client.capture).toHaveBeenCalledWith('app_opened', expect.objectContaining({
      schema_version: 2,
      surface: 'skill_import',
      locale: 'zh-CN',
      $geoip_disable: true,
      $process_person_profile: false,
      page: 'home', entry_surface: 'skill_import',
    }));
  });

  it('preserves existing business event fields with schema version 2', async () => {
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
      ['app_opened', expect.objectContaining({
        schema_version: 2,
        surface: 'main',
        locale: 'en',
        $geoip_disable: true,
        $process_person_profile: false,
      })],
      ['agent_turn_started', expect.objectContaining({
        schema_version: 2,
        surface: 'main',
        entry_point: 'suggestion',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        has_existing_code: true,
        has_history: false,
        $geoip_disable: true,
        $process_person_profile: false,
      })],
      ['agent_turn_finished', expect.objectContaining({
        schema_version: 2,
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
      })],
      ['share_completed', expect.objectContaining({
        schema_version: 2,
        share_method: 'native',
        $geoip_disable: true,
        $process_person_profile: false,
      })],
      ['wav_export_completed', expect.objectContaining({
        schema_version: 2,
        $geoip_disable: true,
        $process_person_profile: false,
      })],
    ]);
  });

  it('records print sending separately without transmitting receipt or device contents', async () => {
    const client = makeClient();
    const analytics = createAnalytics({ key: 'phc_public', loadClient: async () => client, storage: { getItem: () => null } });
    analytics.initialize({ surface: 'main', locale: 'en' });
    analytics.trackSharePrintFinished({ outcome: 'sent' });
    await vi.waitFor(() => expect(client.capture).toHaveBeenCalledTimes(2));
    expect(client.capture.mock.calls[1]).toEqual(['share_print_finished', expect.objectContaining({
      schema_version: 2, outcome: 'sent', $geoip_disable: true, $process_person_profile: false,
    })]);
    const sanitized = sanitizePostHogEvent({ event: 'share_print_finished', properties: {
      schema_version: 2, outcome: 'failed', title: 'secret', url: 'secret', device: 'secret',
    } });
    expect(sanitized?.properties).toEqual({ schema_version: 2, outcome: 'failed' });
  });

  it('captures the onboarding funnel with only its own schema, which survives sanitizing', async () => {
    const client = makeClient();
    const analytics = createAnalytics({
      key: 'phc_public',
      loadClient: async () => client,
      storage: { getItem: () => null },
    });

    analytics.initialize({ surface: 'main', locale: 'en' });
    analytics.trackOnboardingProgressed({ stage: 'skipped', step: 'compare', guide_version: 1, case_id: 'intro-piano-v1' });
    analytics.trackOnboardingProgressed({ stage: 'started', guide_version: 1, case_id: 'intro-piano-v1' });

    await vi.waitFor(() => expect(client.capture).toHaveBeenCalledTimes(3));
    const [, skipped, started] = client.capture.mock.calls;
    expect(skipped).toEqual(['onboarding_progressed', expect.objectContaining({
      schema_version: 2,
      surface: 'main',
      stage: 'skipped',
      step: 'compare',
      guide_version: 1,
      case_id: 'intro-piano-v1',
      $geoip_disable: true,
      $process_person_profile: false,
    })]);
    expect(started[1]).not.toHaveProperty('step');
    expect(sanitizePostHogEvent({ event: skipped[0], properties: { ...skipped[1], text: 'free input' } }))
      .toEqual({ event: 'onboarding_progressed', properties: skipped[1] });
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
