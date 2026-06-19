import { useEffect, useId, useState } from 'react';
import {
  BUILTIN_PERSONA_ID,
  deletePersona,
  getActivePersonaId,
  getAllPersonas,
  putPersona,
  setActivePersonaId,
  type CustomPersona,
} from '../lib/persona-storage';
import { t } from '../lib/i18n';
import { CheckIcon, EditIcon, TrashIcon } from './icons';

interface PersonaModalProps {
  onClose: () => void;
}

type ViewState =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; persona: CustomPersona };

export default function PersonaModal({ onClose }: PersonaModalProps) {
  const titleId = useId();
  const [personas, setPersonas] = useState<CustomPersona[]>([]);
  const [activeId, setActiveId] = useState(BUILTIN_PERSONA_ID);
  const [view, setView] = useState<ViewState>({ kind: 'list' });
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');

  async function refresh() {
    const [all, active] = await Promise.all([getAllPersonas(), getActivePersonaId()]);
    setPersonas(all);
    setActiveId(active);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getAllPersonas(), getActivePersonaId()]).then(([all, active]) => {
      if (cancelled) return;
      setPersonas(all);
      setActiveId(active);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function startCreate() {
    setName('');
    setPrompt('');
    setView({ kind: 'create' });
  }

  function startEdit(persona: CustomPersona) {
    setName(persona.name);
    setPrompt(persona.prompt);
    setView({ kind: 'edit', persona });
  }

  async function selectPersona(id: string) {
    await setActivePersonaId(id);
    onClose();
  }

  async function savePersona() {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedName || !trimmedPrompt) return;

    const now = Date.now();
    const id = view.kind === 'edit' ? view.persona.id : crypto.randomUUID();
    const createdAt = view.kind === 'edit' ? view.persona.createdAt : now;

    await putPersona({
      id,
      name: trimmedName,
      prompt: trimmedPrompt,
      createdAt,
      updatedAt: now,
    });
    await refresh();
    setView({ kind: 'list' });
  }

  async function removePersona(id: string) {
    await deletePersona(id);
    await refresh();
    setView({ kind: 'list' });
  }

  const canSave = !!name.trim() && !!prompt.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-bg-secondary border border-border rounded-2xl p-6 w-[460px] max-w-[92vw] max-h-[88vh] overflow-y-auto shadow-2xl"
      >
        {view.kind === 'list' ? (
          <>
            <h2 id={titleId} className="text-lg font-semibold text-text-primary mb-5">{t('choosePersona')}</h2>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void selectPersona(BUILTIN_PERSONA_ID)}
                className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-primary px-3 py-3 text-left hover:border-accent/50 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text-primary">oddeNova</span>
                  <span className="mt-1 inline-flex text-[11px] text-text-muted border border-border rounded px-1.5 py-0.5">
                    {t('builtinLabel')}
                  </span>
                </span>
                {activeId === BUILTIN_PERSONA_ID && <CheckIcon size={18} className="text-accent shrink-0" />}
              </button>

              <div className="pt-3">
                <div className="text-xs text-text-muted mb-2">{t('customPersonas')}</div>
                {personas.length === 0 ? (
                  <p className="text-xs text-text-muted py-3">{t('noCustomPersonas')}</p>
                ) : (
                  <div className="space-y-2">
                    {personas.map((persona) => (
                      <div
                        key={persona.id}
                        className="group flex items-stretch gap-2 rounded-lg border border-border bg-bg-primary px-3 py-2 hover:border-accent/50 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => void selectPersona(persona.id)}
                          className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left"
                        >
                          <span className="truncate text-sm text-text-primary">{persona.name}</span>
                          {activeId === persona.id && <CheckIcon size={18} className="text-accent shrink-0" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(persona)}
                          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-text-muted hover:text-text-primary focus-visible:text-text-primary transition-opacity"
                          aria-label={`${t('edit')} ${persona.name}`}
                          title={t('edit')}
                        >
                          <EditIcon size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removePersona(persona.id)}
                          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-text-muted hover:text-error focus-visible:text-error transition-opacity"
                          aria-label={`${t('delete')} ${persona.name}`}
                          title={t('delete')}
                        >
                          <TrashIcon size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 text-sm text-text-secondary bg-bg-tertiary rounded-lg hover:bg-border transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={startCreate}
                className="flex-1 py-2.5 text-sm text-white bg-accent rounded-lg hover:bg-accent-light transition-colors"
              >
                {t('newPersona')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id={titleId} className="text-lg font-semibold text-text-primary mb-5">
              {view.kind === 'edit' ? t('editPersona') : t('newPersona')}
            </h2>
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs text-text-secondary mb-1 block">{t('personaName')}</span>
                <input
                  name="persona-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('personaNamePlaceholder')}
                  className="w-full bg-bg-primary text-text-primary text-base rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="text-xs text-text-secondary mb-1 block">{t('personaPrompt')}</span>
                <textarea
                  name="persona-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={t('personaPromptPlaceholder')}
                  rows={8}
                  className="w-full resize-none bg-bg-primary text-text-primary text-sm rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
                />
              </label>
            </div>

            {view.kind === 'edit' && (
              <button
                type="button"
                onClick={() => void removePersona(view.persona.id)}
                className="mt-4 text-xs text-text-muted hover:text-error transition-colors"
              >
                {t('deletePersona')}
              </button>
            )}

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setView({ kind: 'list' })}
                className="flex-1 py-2.5 text-sm text-text-secondary bg-bg-tertiary rounded-lg hover:bg-border transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => void savePersona()}
                disabled={!canSave}
                className="flex-1 py-2.5 text-sm text-white bg-accent rounded-lg hover:bg-accent-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('save')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
