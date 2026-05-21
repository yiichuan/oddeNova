import { useState } from 'react';
import { type ProviderType, PROVIDER_PRESETS } from '../services/llm-config';
import qrCode from '../assets/oddeNova音乐制作社区二维码.png';

function getModelForProvider(p: ProviderType): string {
  if (p === 'anthropic') {
    const envModel = import.meta.env.VITE_LLM_MODEL as string | undefined;
    const legacyModels: Record<string, string> = { sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-6' };
    return (envModel ? (legacyModels[envModel] ?? envModel) : '') || legacyModels['sonnet'];
  }
  return PROVIDER_PRESETS[p].model;
}

interface ApiKeyModalProps {
  onClose: () => void;
  onSaved?: () => void;
  /** true 时隐藏"取消"按钮，强制用户填写（首次无配置场景）。 */
  required?: boolean;
}

const PROVIDER_ORDER: ProviderType[] = [
  'official', 'anthropic', 'deepseek', 'glm',
];

/** 按服务商分别读取已保存的 API Key。 */
function getProviderKey(p: ProviderType): string {
  return localStorage.getItem(`vibe_api_key_${p}`) || '';
}

export default function ApiKeyModal({ onClose, onSaved, required = false }: ApiKeyModalProps) {
  const rawProvider = localStorage.getItem('vibe_provider');
  const savedProvider: ProviderType =
    rawProvider && rawProvider in PROVIDER_PRESETS ? (rawProvider as ProviderType) : 'official';
  const savedKey = getProviderKey(savedProvider);

  const [provider, setProvider] = useState<ProviderType>(
    PROVIDER_ORDER.includes(savedProvider) ? savedProvider : 'official'
  );
  const [apiKey, setApiKey] = useState(getProviderKey(savedProvider));
  const [host, setHost] = useState(localStorage.getItem('vibe_base_url') || 'https://gw.claudeapi.com');

  const handleProviderChange = (p: ProviderType) => {
    if (apiKey.trim()) {
      localStorage.setItem(`vibe_api_key_${provider}`, apiKey.trim());
    }
    setProvider(p);
    setApiKey(getProviderKey(p));
  };

  const handleSave = () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) return;

    localStorage.setItem(`vibe_api_key_${provider}`, trimmedKey);
    localStorage.setItem('vibe_api_key', trimmedKey);
    localStorage.setItem('vibe_provider', provider);
    if (provider === 'anthropic') {
      const trimmedHost = host.trim() || 'https://gw.claudeapi.com';
      localStorage.setItem('vibe_base_url', trimmedHost);
    } else {
      localStorage.removeItem('vibe_base_url');
    }
    localStorage.removeItem('vibe_model');

    onSaved?.();
    onClose();
  };

  const canSave = !!apiKey.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
      <div className="bg-bg-secondary border border-border rounded-2xl p-6 w-[420px] max-w-[90vw] shadow-2xl">
        <h2 className="text-lg font-semibold text-text-primary mb-2">设置 API Key</h2>
        <p className="text-xs text-text-muted mb-7">
          选择服务商并填入对应的 API Key，即可开始使用。Key 仅保存在本地浏览器中。
        </p>

        {/* 当前生效状态 */}
        {savedKey && (
          <div className="flex items-center gap-2 mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 mt-px" />
            <span className="text-xs text-text-muted">当前使用</span>
            <span className="text-xs text-text-secondary font-medium">{PROVIDER_PRESETS[savedProvider].label}</span>
            {savedProvider !== 'official' && (
              <>
                <span className="text-text-muted/40 text-xs">·</span>
                <span className="text-xs text-text-muted font-mono">{getModelForProvider(savedProvider)}</span>
              </>
            )}
          </div>
        )}

        <div className="space-y-3">
          {/* 服务商选择 */}
          <div>
            <label className="text-xs text-text-secondary mb-1 block">服务商</label>
            <div className="relative">
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as ProviderType)}
                className="w-full appearance-none bg-bg-primary text-text-primary text-base rounded-lg px-3 py-2.5 pr-9 outline-none border border-border focus:border-accent/50 cursor-pointer"
              >
                {PROVIDER_ORDER.map((p) => (
                  <option key={p} value={p}>{PROVIDER_PRESETS[p].label}</option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                width="12" height="12" viewBox="0 0 12 12" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="2,4 6,8 10,4" />
              </svg>
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="text-xs text-text-secondary mb-1 block">API Key *</label>
            <ApiKeyInput
              value={apiKey}
              onChange={setApiKey}
              onEnter={handleSave}
              placeholder="sk-..."
            />
          </div>

          {/* Anthropic Host */}
          {provider === 'anthropic' && (
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Host</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="https://gw.claudeapi.com"
                className="w-full bg-bg-primary text-text-primary text-base rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
              />
            </div>
          )}
        </div>

        {/* QR code banner */}
        <div className="flex items-center gap-3 mt-5 pt-5 border-t border-border">
          <img src={qrCode} alt="扫码加入 oddeNova 用户群，免费领取体验 API Key" className="w-16 h-16 rounded-lg bg-white p-1 shrink-0 object-contain" />
          <div>
            <p className="text-sm font-medium text-text-secondary">扫码入群</p>
            <p className="text-xs text-text-muted mt-0.5">免费领体验 API Key</p>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          {!required && (
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm text-text-secondary bg-bg-tertiary rounded-lg hover:bg-border transition-colors"
            >
              取消
            </button>
          )}
          {required && (
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm text-text-secondary bg-bg-tertiary rounded-lg hover:bg-border transition-colors"
            >
              稍后设置
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 py-2.5 text-sm text-white bg-accent rounded-lg hover:bg-accent-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function ApiKeyInput({
  value, onChange, onEnter, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter()}
        placeholder={placeholder}
        className="w-full bg-bg-primary text-text-primary text-base rounded-lg px-3 py-2.5 pr-9 outline-none border border-border focus:border-accent/50"
        autoFocus
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
        tabIndex={-1}
      >
        {show ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
