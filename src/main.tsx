import './index.css'
import { isLearnPath, isPromptLabPath } from './lib/routes';
import { mountEntryRoot, entryLoadingView, entryErrorView } from './lib/entry-view';

if (import.meta.env.MODE === 'lab' && isPromptLabPath()) {
  // The local prompt lab has its own entry and does not initialise app services.
  const root = mountEntryRoot();
  void import('./prompt-lab/PromptLabPage')
    .then((module) => root.render(<module.default />))
    .catch((error) => {
      console.error('[entry] failed to load the prompt lab.', error);
      root.render(entryErrorView(error));
    });
} else {
  const root = mountEntryRoot();
  root.render(entryLoadingView());

  // Keep the standalone lab entry free of the app's preferences, analytics,
  // persona storage and audio graph. The regular app and tutorial still restore
  // preferences before their first meaningful render.
  void Promise.all([
    import('./lib/editor-preferences'),
    import('./lib/appearance-preferences'),
    import('./lib/persona-storage'),
    import('./lib/analytics'),
    import('./lib/i18n'),
    import('./lib/oddenova-bridge'),
  ]).then(async ([editor, appearance, persona, analytics, i18n, bridge]) => {
    appearance.loadAppearancePreferences();
    editor.loadEditorPreferences();
    bridge.consumeOddeNovaBridgeBootstrapHash();
    analytics.initializeAnalytics(i18n.zh ? 'zh-CN' : 'en');

    if (isLearnPath()) {
      const page = await import('./learn/LearnPage');
      root.render(<page.default />);
      return;
    }

    // The app chunk download and persona initialisation run in parallel. Persona
    // storage failures are non-fatal and preserve the previous fallback path.
    const [appModule] = await Promise.all([
      import('./App'),
      persona.initPersonaCache().catch((error) => {
        console.error('[entry] persona initialisation failed; continuing with defaults.', error);
      }),
    ]);
    root.render(<appModule.default />);
  }).catch((error) => {
    console.error('[entry] failed to mount the app.', error);
    root.render(entryErrorView(error));
  });
}
