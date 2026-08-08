# Model Settings Workspace Design

Date: 2026-08-08

## Goal

Turn the desktop PrimaryNav settings action into a dedicated model-configuration workspace. The new workspace replaces the home conversation and music surfaces in place, while preserving the established navigation rail, split proportions, and the user's unfinished settings draft.

## Scope

This change covers the desktop settings workspace for five providers:

- oddeNova official service
- DeepSeek
- GLM
- Anthropic
- OpenAI

The existing first-run and missing-credential `ApiKeyModal` remains available. Mobile continues to use the existing modal in this iteration. Kimi remains supported by the configuration layer but is not exposed in the new settings workspace.

## Workspace Navigation

`PrimaryNav` remains the owner of top-level workspace selection.

- Selecting `settings` shows the model settings workspace.
- Selecting `home` restores the existing conversation Sidebar and the CodePanel/galaxy main area.
- Switching away from settings does not discard unsaved drafts.
- Returning to settings restores the selected provider and every provider's in-memory draft.
- Refreshing or closing the page discards unsaved changes because drafts are not persisted.

The settings button no longer opens `ApiKeyModal` on desktop. The modal continues to serve required first-run and missing-key flows. On mobile, the settings action retains the modal until a mobile settings workspace is designed separately.

## Layout and Visual Direction

The settings workspace preserves the current desktop shell and split ratio.

### Provider sidebar

The area normally occupied by `Sidebar` becomes `ProviderSidebar`. It lists the five in-scope providers in the same localized order used by the current modal. The selected provider uses a clear surface change and keyboard focus state.

Each row may show two distinct statuses:

- `Currently in use` reflects the persisted active provider.
- `Unsaved changes` reflects a draft that differs from persisted configuration.

These signals must remain distinguishable so browsing a provider is never confused with activating it.

### Settings panel

The area normally occupied by CodePanel and the galaxy visualization becomes `ModelSettingsPanel`. It is a restrained single-column form aligned to the project's dark, grid-led visual system. The panel includes:

- provider name and concise connection guidance;
- model version selection;
- API Key input where required;
- local-storage and credential-safety guidance;
- inline validation and status feedback;
- a single `Save settings` action.

The layout stays flat and avoids nested cards or a secondary modal. Workspace transitions use a short opacity/transform treatment with a static `prefers-reduced-motion` alternative.

## Draft Model

A dedicated `useModelSettingsDraft` hook, or an equivalently isolated state unit owned by `App`, manages settings state. It initializes once from persisted configuration and holds:

- the provider currently being inspected;
- a model draft for each provider;
- an API Key draft for each third-party provider;
- the persisted snapshot used for dirty comparisons;
- save status and inline validation state.

Provider switching changes only the inspected provider. It does not write to storage, reset the model client, or change the active provider. Drafts are retained independently for all five providers during the current page lifetime.

The UI derives dirty state by comparing each provider draft against the persisted snapshot. `Save settings` is emphasized and enabled only when the inspected provider has a valid change. It is disabled when there is no change or when a required API Key is empty.

## Provider Behavior

### Official service

The official service panel displays `deepseek-v4-flash` as the current managed model and explains that no API Key is required because credentials are hosted by the platform. Saving selects the official provider and preserves the same unified save interaction used by third-party providers.

### Third-party providers

DeepSeek, GLM, Anthropic, and OpenAI display:

- a model selector populated from `PROVIDER_PRESETS[provider].models`;
- a password-masked API Key field;
- a show/hide control with an accessible label;
- an explanation that the key is stored only in the local browser.

The saved key is loaded into the draft but remains masked by default. It is never rendered in summaries, status messages, analytics, or logs.

## Saving and Runtime Activation

Saving applies the inspected provider as one atomic user action.

For third-party providers, save writes:

- `vibe_provider`;
- `vibe_model_{provider}`;
- `vibe_api_key_{provider}`;
- the compatibility field `vibe_api_key`.

For the official provider, save writes `vibe_provider`, retains its managed model behavior, and removes the compatibility `vibe_api_key` value so stale third-party credentials are not treated as active.

Every save removes legacy `vibe_base_url` and `vibe_model` overrides, calls `resetClient()`, updates the persisted snapshot, clears dirty state for the saved provider, and shows a short inline `Settings saved` confirmation. The user remains in the settings workspace after save.

Saved credentials for non-active providers remain available in their provider-specific storage keys. Switching the active provider updates the compatibility key from the selected provider's saved draft.

## Validation and Error Handling

- Official service is always valid without a user key.
- A third-party provider cannot be saved with an empty or whitespace-only API Key.
- The selected model must be one of that provider's configured model options.
- Validation appears next to the relevant field and is announced to assistive technology.
- Storage or activation failures keep the draft intact and show an inline error; they do not close the workspace or silently report success.
- Save feedback is textual and does not rely on color alone.

## Accessibility

- Provider navigation is reachable and operable by keyboard.
- The selected provider and persisted active provider are exposed semantically.
- Model selection, API Key visibility, and save controls have explicit accessible names.
- Focus remains predictable when switching providers and after saving.
- Focus indicators meet readable contrast requirements.
- Motion respects `prefers-reduced-motion`.

## Component Boundaries

- `App`: selects the home or settings workspace and preserves draft state across workspace switches.
- `PrimaryNav`: emits workspace selection and visually reflects the active item; it does not own settings data.
- `ProviderSidebar`: renders provider navigation and active/dirty statuses.
- `ModelSettingsPanel`: renders the selected provider form and save feedback.
- `useModelSettingsDraft`: owns initialization, per-provider drafts, validation, dirty comparison, and save orchestration.
- `ApiKeyModal`: remains responsible for required first-run or missing-key flows and the mobile settings fallback.
- `llm-config`: remains the source of provider metadata and valid models; shared persistence helpers may be extracted here or into a focused settings-storage module to prevent the modal and workspace from drifting.

## Testing Strategy

Component and hook tests will cover:

1. PrimaryNav settings selection shows the settings workspace, and home restores the existing workspace.
2. Provider switching changes the visible form without activating or persisting the provider.
3. Unsaved drafts survive provider switches and home/settings workspace switches.
4. Unsaved drafts do not survive a page reload.
5. Only an explicit save writes storage and calls `resetClient()`.
6. Saving writes the provider-specific model and key plus required compatibility fields.
7. Official service requires no key; third-party providers reject an empty key.
8. Dirty, active, success, and error states are rendered accurately.
9. API Keys remain masked by default and do not appear in status text.
10. The existing first-run `ApiKeyModal` behavior remains intact.

The implementation must pass the repository's type check, lint, and test suite. Per repository guidance, browser-driven visual verification is not part of the completion bar for UI changes.

## Out of Scope

- A redesigned mobile settings workspace.
- Adding Kimi to the visible provider list.
- Custom provider URLs or arbitrary model names.
- Remote credential synchronization or server-side key storage.
- Live API credential testing or model availability probes.
- Removing the existing first-run `ApiKeyModal`.
