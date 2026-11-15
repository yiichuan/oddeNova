import { Mic, MicOff } from 'lucide-react';
import type { Ref } from 'react';
import { t } from '../../lib/i18n';

interface VoiceButtonProps {
  isListening: boolean;
  supported: boolean;
  disabled?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onToggle: () => void;
}

export default function VoiceButton({ isListening, supported, disabled = false, buttonRef, onToggle }: VoiceButtonProps) {
  if (!supported) {
    return (
      <button
        type="button"
        disabled
        aria-label={t('voiceNotSupported')}
        className="mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted opacity-50 cursor-not-allowed"
        title={t('voiceNotSupported')}
      >
        <MicOff size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      ref={buttonRef}
      disabled={disabled}
      aria-label={isListening ? t('voiceButtonRecording') : t('startVoiceInput')}
      aria-pressed={isListening}
      className={`mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        isListening
          ? 'bg-brand-accent/10 text-brand-accent'
          : 'text-text-muted hover:bg-text-primary/10 hover:text-text-primary'
      }`}
      title={isListening ? t('voiceButtonRecording') : t('startVoiceInput')}
    >
      <Mic size={20} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
