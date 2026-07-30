import { ODDENOVA_IMPORT_HASH_PREFIX } from './oddenova-import';

export const ANALYTICS_DISABLED_STORAGE_KEY = 'oddenova_analytics_disabled';
export const ANALYTICS_SCHEMA_VERSION = 1 as const;

export type AppSurface = 'main' | 'shared_session' | 'demo' | 'skill_import';
export type AnalyticsLocale = 'zh-CN' | 'en';
export type AgentEntryPoint = 'text' | 'suggestion' | 'mood' | 'retry';
export type AgentTurnOutcome =
  | 'played'
  | 'generated'
  | 'playback_failed'
  | 'not_committed'
  | 'agent_failed'
  | 'aborted';
export type ShareMethod = 'native' | 'clipboard' | 'prompt';

export interface AgentTurnBaseProperties {
  entry_point: AgentEntryPoint;
  provider: string;
  model: string;
  has_existing_code: boolean;
  has_history: boolean;
}

export interface AgentTurnFinishedProperties extends AgentTurnBaseProperties {
  outcome: AgentTurnOutcome;
  duration_ms: number;
  iterations: number;
}

interface AnalyticsLocation {
  pathname: string;
  search: string;
  hash: string;
}

interface PostHogClient {
  init: (key: string, config: Record<string, unknown>) => unknown;
  capture: (event: string, properties?: Record<string, unknown>) => unknown;
}

interface AnalyticsStorage {
  getItem: (key: string) => string | null;
}

interface AnalyticsDependencies {
  key: string;
  loadClient: () => Promise<PostHogClient>;
  storage: AnalyticsStorage;
}

interface AnalyticsInitialization {
  surface: AppSurface;
  locale: AnalyticsLocale;
}

export interface BusinessAnalytics {
  initialize: (input: AnalyticsInitialization) => void;
  trackAgentTurnStarted: (properties: AgentTurnBaseProperties) => void;
  trackAgentTurnFinished: (properties: AgentTurnFinishedProperties) => void;
  trackShareCompleted: (properties: { share_method: ShareMethod }) => void;
  trackWavExportCompleted: () => void;
}

interface SanitizableEvent {
  event: string;
  uuid?: unknown;
  timestamp?: unknown;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

const SYSTEM_PROPERTY_ALLOWLIST = new Set([
  'token',
  'distinct_id',
  '$device_id',
  '$session_id',
  '$browser',
  '$os',
  '$device_type',
  '$lib',
  '$lib_version',
  '$geoip_disable',
  '$process_person_profile',
  'time',
  '$time',
  '$insert_id',
]);

const EVENT_PROPERTY_ALLOWLIST: Record<string, ReadonlySet<string>> = {
  app_opened: new Set(['schema_version', 'surface', 'locale']),
  agent_turn_started: new Set([
    'schema_version',
    'surface',
    'entry_point',
    'provider',
    'model',
    'has_existing_code',
    'has_history',
  ]),
  agent_turn_finished: new Set([
    'schema_version',
    'surface',
    'entry_point',
    'provider',
    'model',
    'has_existing_code',
    'has_history',
    'outcome',
    'duration_ms',
    'iterations',
  ]),
  share_completed: new Set(['schema_version', 'share_method']),
  wav_export_completed: new Set(['schema_version']),
};

const PRIVACY_CONTROL_PROPERTIES = {
  $geoip_disable: true,
  $process_person_profile: false,
} as const;

export function resolveAppSurface(location: AnalyticsLocation): AppSurface {
  if (location.hash.startsWith(ODDENOVA_IMPORT_HASH_PREFIX)) return 'skill_import';
  if (/^\/s\/[^/]+/.test(location.pathname)) return 'shared_session';
  try {
    if (new URLSearchParams(location.search).get('demo') === 'true') return 'demo';
  } catch {
    // A malformed query is still the main surface and is never sent to PostHog.
  }
  return 'main';
}

/**
 * Final outbound privacy boundary. Unknown events are dropped, while approved
 * events retain only ingestion/session fields plus that event's business schema.
 */
export function sanitizePostHogEvent(event: SanitizableEvent | null): SanitizableEvent | null {
  if (!event) return null;
  const eventAllowlist = EVENT_PROPERTY_ALLOWLIST[event.event];
  if (!eventAllowlist) return null;

  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event.properties ?? {})) {
    if (SYSTEM_PROPERTY_ALLOWLIST.has(key) || eventAllowlist.has(key)) {
      properties[key] = value;
    }
  }

  const sanitized: SanitizableEvent = {
    event: event.event,
    properties,
  };
  if (event.uuid !== undefined) sanitized.uuid = event.uuid;
  if (event.timestamp !== undefined) sanitized.timestamp = event.timestamp;
  return sanitized;
}

function safeAnalyticsDisabled(storage: AnalyticsStorage): boolean {
  try {
    return storage.getItem(ANALYTICS_DISABLED_STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

function appOpenedProperties(input: AnalyticsInitialization): Record<string, unknown> {
  return {
    schema_version: ANALYTICS_SCHEMA_VERSION,
    surface: input.surface,
    locale: input.locale,
    ...PRIVACY_CONTROL_PROPERTIES,
  };
}

function agentTurnBaseProperties(
  properties: AgentTurnBaseProperties,
  surface: AppSurface,
): Record<string, unknown> {
  return {
    schema_version: ANALYTICS_SCHEMA_VERSION,
    surface,
    entry_point: properties.entry_point,
    provider: properties.provider,
    model: properties.model,
    has_existing_code: properties.has_existing_code,
    has_history: properties.has_history,
    ...PRIVACY_CONTROL_PROPERTIES,
  };
}

export function createAnalytics(dependencies: AnalyticsDependencies): BusinessAnalytics {
  let initialized = false;
  let surface: AppSurface = 'main';
  let clientPromise: Promise<PostHogClient | null> | null = null;

  const capture = (event: string, properties: Record<string, unknown>): void => {
    const pendingClient = clientPromise;
    if (!pendingClient) return;
    void pendingClient
      .then((client) => {
        if (!client) return;
        try {
          client.capture(event, properties);
        } catch {
          // Analytics must never affect product behavior.
        }
      })
      .catch(() => {
        // SDK loading failures are a terminal no-op for this app load.
      });
  };

  return {
    initialize(input) {
      if (initialized) return;
      initialized = true;
      surface = input.surface;

      const key = dependencies.key.trim();
      if (!key || safeAnalyticsDisabled(dependencies.storage)) return;

      clientPromise = Promise.resolve()
        .then(() => dependencies.loadClient())
        .then((client) => {
          client.init(key, {
            api_host: '/_nova',
            ui_host: 'https://us.posthog.com',
            autocapture: false,
            rageclick: false,
            capture_pageview: false,
            capture_pageleave: false,
            capture_dead_clicks: false,
            capture_exceptions: false,
            capture_heatmaps: false,
            capture_performance: false,
            disable_session_recording: true,
            disable_surveys: true,
            advanced_disable_flags: true,
            persistence: 'localStorage',
            person_profiles: 'never',
            save_referrer: false,
            save_campaign_params: false,
            disable_capture_url_hashes: true,
            disable_scroll_properties: true,
            disableDeviceModel: true,
            before_send: sanitizePostHogEvent,
          });
          try {
            client.capture('app_opened', appOpenedProperties(input));
          } catch {
            // Analytics must never affect product behavior.
          }
          return client;
        })
        .catch(() => null);
    },

    trackAgentTurnStarted(properties) {
      capture('agent_turn_started', agentTurnBaseProperties(properties, surface));
    },

    trackAgentTurnFinished(properties) {
      capture('agent_turn_finished', {
        ...agentTurnBaseProperties(properties, surface),
        outcome: properties.outcome,
        duration_ms: properties.duration_ms,
        iterations: properties.iterations,
      });
    },

    trackShareCompleted(properties) {
      capture('share_completed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        share_method: properties.share_method,
        ...PRIVACY_CONTROL_PROPERTIES,
      });
    },

    trackWavExportCompleted() {
      capture('wav_export_completed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        ...PRIVACY_CONTROL_PROPERTIES,
      });
    },
  };
}

const browserStorage: AnalyticsStorage = {
  getItem(key) {
    return window.localStorage.getItem(key);
  },
};

const defaultAnalytics = createAnalytics({
  key: import.meta.env.VITE_POSTHOG_KEY ?? '',
  storage: browserStorage,
  loadClient: async () => {
    const { default: posthog } = await import('posthog-js/dist/module.no-external');
    return posthog;
  },
});

export function initializeAnalytics(locale: AnalyticsLocale): void {
  defaultAnalytics.initialize({
    surface: resolveAppSurface(window.location),
    locale,
  });
}

export const trackAgentTurnStarted = defaultAnalytics.trackAgentTurnStarted;
export const trackAgentTurnFinished = defaultAnalytics.trackAgentTurnFinished;
export const trackShareCompleted = defaultAnalytics.trackShareCompleted;
export const trackWavExportCompleted = defaultAnalytics.trackWavExportCompleted;
