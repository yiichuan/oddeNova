import { t } from '../lib/i18n';
import type { ExecutionReceipt } from '../services/llm';
import type { EditScope } from './session-scope';

export function formatExecutionReceipt(scope: EditScope, receipt: ExecutionReceipt): string {
  switch (receipt.status) {
    case 'scope_conflict': return t('agentRouterScopeConflict');
    case 'failed': return t('agentRouterExecutionFailed');
    case 'no_change': return t('agentRouterNoChange');
    case 'saved': return t({
      create: 'agentRouterCreated',
      rewrite: 'agentRevisionSaved',
      add_layers: 'agentRouterAddedLayers',
      remove_layers: 'agentRouterRemovedLayers',
      layers: 'agentRouterLayersSaved',
      section: 'agentRouterSectionSaved',
      parameter: 'agentRouterParameterSaved',
      tempo: 'agentRouterTempoSaved',
    }[scope.kind]);
  }
}
