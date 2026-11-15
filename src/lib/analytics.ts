import { analyticsContext, type AnalyticsContext } from './analytics-context';
import { ODDENOVA_IMPORT_HASH_PREFIX } from './oddenova-import';

export const ANALYTICS_DISABLED_STORAGE_KEY = 'oddenova_analytics_disabled';
export const ANALYTICS_SCHEMA_VERSION = 2 as const;

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
/**
 * The first-run guide's funnel. `preset_sent` is the practice's canned turn and
 * is deliberately its own stage — it never counts toward the agent's success
 * rate, which only `agent_turn_*` measures. `first_real_instruction` is the
 * first genuine turn after the practice. No free-typed text is ever sent.
 */
export type OnboardingStage =
  | 'invite_shown'
  | 'started'
  | 'original_heard'
  | 'preset_sent'
  | 'adapted_heard'
  /** Desktop first-creation guide: one preset turn written; `step` is `turn-n`. */
  | 'turn_delivered'
  | 'completed'
  | 'skipped'
  | 'postponed'
  | 'error'
  | 'first_real_instruction';

export interface OnboardingProgressedProperties {
  stage: OnboardingStage;
  /** Where the guide was — for `skipped` and `error`, the step it happened at. */
  step?: string;
  guide_version: number;
  case_id: string;
}

export interface AgentTurnBaseProperties {
  entry_point: AgentEntryPoint;
  provider: string;
  model: string;
  has_existing_code: boolean;
  has_history: boolean;
  context?: AnalyticsContext;
  input_mode?: 'create' | 'revise';
  image_count?: number;
}

export interface AgentTurnFinishedProperties extends AgentTurnBaseProperties {
  outcome: AgentTurnOutcome;
  duration_ms: number;
  iterations: number;
  request_retry_count?: number;
  tool_failure_count?: number;
  termination_reason?: string;
  failure_stage?: string;
  error_code?: string;
  http_status?: number;
}

interface AnalyticsLocation {
  pathname: string;
  search: string;
  hash: string;
}

interface PostHogClient {
  init: (key: string, config: Record<string, unknown>) => unknown;
  capture: (event: string, properties?: Record<string, unknown>, options?: { transport: 'sendBeacon'; send_instantly: boolean }) => unknown;
}

interface AnalyticsStorage {
  getItem: (key: string) => string | null;
}

interface AnalyticsDependencies {
  key: string;
  loadClient: () => Promise<PostHogClient>;
  storage: AnalyticsStorage;
  now?: () => Date;
}

interface AnalyticsInitialization {
  page?: AnalyticsContext['page'];
  surface: AppSurface;
  locale: AnalyticsLocale;
}

const TELEMETRY_FIELDS = {
  playback_requested: ['source', 'operation_id'],
  playback_started: ['source', 'operation_id', 'duration_ms'],
  playback_finished: ['source', 'operation_id', 'outcome', 'duration_ms', 'foreground_ms', 'end_reason', 'error_code', 'failure_stage'],
  audio_export_started: ['operation_id', 'format', 'sample_rate', 'cycle_length'],
  audio_export_finished: ['operation_id', 'format', 'sample_rate', 'cycle_length', 'duration_ms', 'render_ms', 'encode_ms', 'outcome', 'failure_stage', 'error_code', 'recovery_outcome'],
  creation_action: ['action', 'outcome'],
  session_save_finished: ['operation_id', 'target', 'outcome', 'duration_ms', 'retry_count', 'write_count', 'error_code', 'http_status'],
  session_sync_changed: ['state', 'previous_state', 'duration_ms', 'outcome'],
  storage_degraded: ['error_code'],
  engine_initialization_finished: ['source', 'outcome', 'duration_ms', 'error_code'],
  feature_load_finished: ['feature', 'source', 'outcome', 'duration_ms', 'error_code'],
  app_error: ['source', 'error_code'],
} as const;

export type TelemetryEvent = keyof typeof TELEMETRY_FIELDS;
export type TelemetryProperties<E extends TelemetryEvent> = Partial<Record<
  typeof TELEMETRY_FIELDS[E][number], string | number | boolean
>>;
const COMMON_FIELDS = new Set([
  'schema_version', 'app_version', 'environment', 'entry_surface', 'page', 'workspace_session_id', 'turn_id',
]);

export interface BusinessAnalytics {
  trackTelemetry: <E extends TelemetryEvent>(event: E, properties: TelemetryProperties<E>, context?: AnalyticsContext) => void;
  initialize: (input: AnalyticsInitialization) => void;
  trackAgentTurnStarted: (properties: AgentTurnBaseProperties) => void;
  trackAgentTurnFinished: (properties: AgentTurnFinishedProperties) => void;
  trackShareCompleted: (properties: { share_method: ShareMethod }) => void;
  trackSharePrintFinished: (properties: { outcome: 'sent' | 'failed' }) => void;
  trackWavExportCompleted: () => void;
  trackOnboardingProgressed: (properties: OnboardingProgressedProperties) => void;
  trackAccountActive: (accountId: string) => Promise<void>;
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
  ...Object.fromEntries(Object.entries(TELEMETRY_FIELDS).map(([event, keys]) => [event, new Set(keys)])),
  account_active: new Set(['schema_version', 'account_analytics_id', 'activity_date', 'activity_timezone']),
  app_opened: new Set(['schema_version', 'surface', 'locale']),
  agent_turn_started: new Set([
    'schema_version',
    'surface',
    'entry_point',
    'provider',
    'model',
    'has_existing_code',
    'has_history',
    'input_mode', 'image_count',
  ]),
  agent_turn_finished: new Set([
    'schema_version',
    'surface',
    'entry_point',
    'provider',
    'model',
    'has_existing_code',
    'has_history',
    'input_mode', 'image_count',
    'outcome',
    'duration_ms',
    'iterations',
    'request_retry_count', 'tool_failure_count', 'termination_reason', 'failure_stage', 'error_code', 'http_status',
  ]),
  share_completed: new Set(['schema_version', 'share_method']),
  share_print_finished: new Set(['schema_version', 'outcome']),
  wav_export_completed: new Set(['schema_version']),
  onboarding_progressed: new Set(['schema_version', 'surface', 'stage', 'step', 'guide_version', 'case_id']),
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
  const eventAllowlist = Object.hasOwn(EVENT_PROPERTY_ALLOWLIST, event.event)
    ? EVENT_PROPERTY_ALLOWLIST[event.event] : undefined;
  if (!eventAllowlist) return null;

  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event.properties ?? {})) {
    if (SYSTEM_PROPERTY_ALLOWLIST.has(key) || eventAllowlist.has(key)
      || (COMMON_FIELDS.has(key) && (event.event !== 'account_active' || (key !== 'workspace_session_id' && key !== 'turn_id')))) {
      if (value !== undefined && (
        typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
      )) properties[key] = value;
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
    ...(properties.input_mode ? { input_mode: properties.input_mode } : {}),
    ...(properties.image_count !== undefined ? { image_count: properties.image_count } : {}),
    ...PRIVACY_CONTROL_PROPERTIES,
  };
}

export function createAnalytics(dependencies: AnalyticsDependencies): BusinessAnalytics {
  let initialized = false;
  let surface: AppSurface = 'main';
  let clientPromise: Promise<PostHogClient | null> | null = null;
  let activityDate = '';
  const activeAccounts = new Set<string>();

  const common = (context?: AnalyticsContext) => ({
    schema_version: ANALYTICS_SCHEMA_VERSION,
    entry_surface: surface,
    page: context?.page ?? analyticsContext(null).page,
    app_version: import.meta.env.VITE_APP_BUILD_VERSION || 'unknown',
    environment: import.meta.env.VITE_APP_ENVIRONMENT || 'development',
    ...(context?.turn_id ? { turn_id: context.turn_id } : {}),
    ...PRIVACY_CONTROL_PROPERTIES,
  });
  const capture = (event: string, properties: Record<string, unknown>, context?: AnalyticsContext): void => {
    const pendingClient = clientPromise;
    if (!pendingClient || safeAnalyticsDisabled(dependencies.storage)) return;
    const metadata = common(context);
    void pendingClient
      .then(async (client) => {
        if (!client) return;
        const workspace = context?.workspace ? await context.workspace : undefined;
        if (safeAnalyticsDisabled(dependencies.storage)) return;
        try {
          const payload = { ...properties, ...metadata, ...(workspace ? { workspace_session_id: workspace } : {}) };
          if (event === 'playback_finished' && properties.end_reason === 'page_left') {
            client.capture(event, payload, { transport: 'sendBeacon', send_instantly: true });
          } else {
            client.capture(event, payload);
          }
        } catch {
          // Analytics must never affect product behavior.
        }
      })
      .catch(() => {
        // SDK loading failures are a terminal no-op for this app load.
      });
  };

  return {
    trackTelemetry(event, properties, context) {
      capture(event, properties, context);
    },
    async trackAccountActive(accountId) {
      const pendingClient = clientPromise;
      if (!accountId || !pendingClient || safeAnalyticsDisabled(dependencies.storage)) return;
      try {
        // A fixed UTC+8 reporting day, independent of the device's timezone.
        const date = new Date((dependencies.now?.() ?? new Date()).getTime() + 8 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
        if (date !== activityDate) {
          activityDate = date;
          activeAccounts.clear();
        }
        // No device salt: the same account must have the same key across devices.
        // This is pseudonymization, not anonymization. Never identify()/alias()
        // the SDK: its distinct_id must continue to represent a browser.
        const bytes = await globalThis.crypto.subtle.digest(
          'SHA-256', new TextEncoder().encode(`oddenova:account-analytics:v1:${accountId}`),
        );
        const id = `account_v1_${Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')}`;
        const client = await pendingClient;
        if (!client || safeAnalyticsDisabled(dependencies.storage)) return;
        const key = `${date}:${id}`;
        if (activeAccounts.has(key)) return;
        // Reserve before capture so concurrent visibility/auth callbacks deduplicate.
        activeAccounts.add(key);
        try {
          client.capture('account_active', {
            ...common(),
            account_analytics_id: id,
            activity_date: date,
            activity_timezone: 'Asia/Singapore',
            ...PRIVACY_CONTROL_PROPERTIES,
          });
        } catch {
          activeAccounts.delete(key);
        }
      } catch {
        // Crypto, clock, SDK and storage failures must not affect authentication.
      }
    },

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
            client.capture('app_opened', { ...appOpenedProperties(input), ...common({ page: input.page }) });
          } catch {
            // Analytics must never affect product behavior.
          }
          return client;
        })
        .catch(() => null);
    },

    trackAgentTurnStarted(properties) {
      capture('agent_turn_started', agentTurnBaseProperties(properties, surface), properties.context);
    },

    trackAgentTurnFinished(properties) {
      capture('agent_turn_finished', {
        ...agentTurnBaseProperties(properties, surface),
        outcome: properties.outcome,
        duration_ms: properties.duration_ms,
        iterations: properties.iterations,
        ...Object.fromEntries(Object.entries({
          request_retry_count: properties.request_retry_count,
          tool_failure_count: properties.tool_failure_count,
          termination_reason: properties.termination_reason,
          failure_stage: properties.failure_stage,
          error_code: properties.error_code,
          http_status: properties.http_status,
        }).filter(([, value]) => value !== undefined)),
      }, properties.context);
    },

    trackShareCompleted(properties) {
      capture('share_completed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        share_method: properties.share_method,
        ...PRIVACY_CONTROL_PROPERTIES,
      });
    },

    trackSharePrintFinished(properties) {
      capture('share_print_finished', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        outcome: properties.outcome,
        ...PRIVACY_CONTROL_PROPERTIES,
      });
    },

    trackWavExportCompleted() {
      capture('wav_export_completed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        ...PRIVACY_CONTROL_PROPERTIES,
      });
    },

    trackOnboardingProgressed(properties) {
      capture('onboarding_progressed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        surface,
        stage: properties.stage,
        ...(properties.step !== undefined ? { step: properties.step } : {}),
        guide_version: properties.guide_version,
        case_id: properties.case_id,
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
    page: /^\/learn(?:\/|$)/.test(window.location.pathname) ? 'learn' : 'home',
  });
}

export const trackAgentTurnStarted = defaultAnalytics.trackAgentTurnStarted;
export const trackAgentTurnFinished = defaultAnalytics.trackAgentTurnFinished;
export const trackShareCompleted = defaultAnalytics.trackShareCompleted;
export const trackSharePrintFinished = defaultAnalytics.trackSharePrintFinished;
export const trackWavExportCompleted = defaultAnalytics.trackWavExportCompleted;
export const trackOnboardingProgressed = defaultAnalytics.trackOnboardingProgressed;
export const trackAccountActive = defaultAnalytics.trackAccountActive;

export const trackTelemetry = defaultAnalytics.trackTelemetry;
