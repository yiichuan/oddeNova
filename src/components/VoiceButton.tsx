interface VoiceButtonProps {
  isListening: boolean;
  supported: boolean;
  onToggle: () => void;
}

export default function VoiceButton({ isListening, supported, onToggle }: VoiceButtonProps) {
  if (!supported) {
    return (
      <button
        disabled
        className="w-12 h-12 rounded-full bg-bg-tertiary text-text-muted flex items-center justify-center cursor-not-allowed"
        title="浏览器不支持语音识别，请使用 Chrome"
      >
        <MicOffIcon />
      </button>
    );
  }

  return (
    <button
      onMouseDown={onToggle}
      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
        isListening
          ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] scale-110 animate-pulse'
          : 'bg-gradient-to-br from-accent to-accent-light hover:shadow-[0_0_20px_var(--color-accent-glow)] hover:scale-105'
      }`}
      title={isListening ? '松开停止' : '按住说话'}
    >
      {isListening ? <MicOnIcon /> : <MicIcon />}
    </button>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MicOnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
