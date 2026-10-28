import './index.css'
import { isLearnPath } from './lib/routes';
import { loadEditorPreferences } from './lib/editor-preferences';
import { loadAppearancePreferences } from './lib/appearance-preferences';
import { initPersonaCache } from './lib/persona-storage';
import { initializeAnalytics } from './lib/analytics';
import { zh } from './lib/i18n';
import { consumeOddeNovaBridgeBootstrapHash } from './lib/oddenova-bridge';
import { mountEntryRoot, entryLoadingView, entryErrorView } from './lib/entry-view';

// Restore user preferences before rendering to avoid layout shift. Appearance
// goes first: it paints the app theme the editor falls back to when the user
// has never picked an editor theme of their own.
loadAppearancePreferences()
loadEditorPreferences()
consumeOddeNovaBridgeBootstrapHash()
initializeAnalytics(zh ? 'zh-CN' : 'en')

if (isLearnPath()) {
  // Standalone docs page — skip audio/session bootstrap entirely.
  const root = mountEntryRoot();
  void import('./learn/LearnPage')
    .then((module) => {
      root.render(<module.default />)
    })
    .catch((error) => {
      console.error('[entry] failed to load the tutorial.', error);
      root.render(entryErrorView(error));
    })
} else {
  const root = mountEntryRoot();
  root.render(entryLoadingView());
  // The App chunk download and persona (IndexedDB) initialisation run side by
  // side — neither waits on the slowest — while the render itself still waits
  // for both, keeping the persona-ready-before-first-render contract.
  // initPersonaCache is settled into a status instead of awaited raw: the old
  // .finally contract renders the app even when persona init fails.
  const appReady = import('./App');
  const personaReady = initPersonaCache().catch((error) => {
    console.error('[entry] persona initialisation failed; continuing with defaults.', error);
    return undefined as unknown as void;
  });
  void Promise.all([personaReady, appReady])
    .then(([, appModule]) => {
      root.render(<appModule.default />)
    })
    .catch((error) => {
      console.error('[entry] failed to mount the app.', error);
      root.render(entryErrorView(error));
    });
}
