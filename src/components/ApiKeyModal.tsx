import { useState } from 'react';

interface ApiKeyModalProps {
  onClose: () => void;
  onSaved?: () => void;
  /** true 时隐藏"取消"按钮，强制用户填写（首次无配置场景）。 */
  required?: boolean;
}

export default function ApiKeyModal({ onClose, onSaved, required = false }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState(localStorage.getItem('vibe_api_key') || '');
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('vibe_base_url') || '');

  const handleSave = () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) return;
    localStorage.setItem('vibe_api_key', trimmedKey);
    if (baseUrl.trim()) {
      localStorage.setItem('vibe_base_url', baseUrl.trim());
    } else {
      localStorage.removeItem('vibe_base_url');
    }
    onSaved?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-secondary border border-border rounded-2xl p-6 w-[420px] max-w-[90vw] shadow-2xl">
        <h2 className="text-lg font-semibold text-text-primary mb-1">设置 API Key</h2>
        <p className="text-xs text-text-muted mb-4">
          填入 Anthropic API Key（或兼容代理的 Key）。Key 保存在本地浏览器中，不会上传。
          也可在项目根目录创建 <code className="text-accent">.env.local</code> 文件手动配置（重启后生效）。
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-secondary mb-1 block">API Key *</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="sk-..."
              className="w-full bg-bg-primary text-text-primary text-sm rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary mb-1 block">Base URL（可选，留空使用默认端点）</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.anthropic.com"
              className="w-full bg-bg-primary text-text-primary text-sm rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
            />
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
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="flex-1 py-2.5 text-sm text-white bg-accent rounded-lg hover:bg-accent-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
