import { useState } from 'react';

interface ApiKeyModalProps {
  onClose: () => void;
}

export default function ApiKeyModal({ onClose }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState(localStorage.getItem('openai_api_key') || '');
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('openai_base_url') || '');
  const [model, setModel] = useState(localStorage.getItem('openai_model') || 'gpt-4o-mini');

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem('openai_api_key', apiKey.trim());
      if (baseUrl.trim()) {
        localStorage.setItem('openai_base_url', baseUrl.trim());
      } else {
        localStorage.removeItem('openai_base_url');
      }
      localStorage.setItem('openai_model', model.trim() || 'gpt-4o-mini');
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-secondary border border-border rounded-2xl p-6 w-[420px] max-w-[90vw] shadow-2xl">
        <h2 className="text-lg font-semibold text-text-primary mb-1">设置 API Key</h2>
        <p className="text-xs text-text-muted mb-4">
          需要 OpenAI API Key 来驱动 AI 音乐生成。Key 仅保存在本地浏览器中。
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-secondary mb-1 block">API Key *</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-bg-primary text-text-primary text-sm rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary mb-1 block">Base URL (可选，用于自定义端点)</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full bg-bg-primary text-text-primary text-sm rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary mb-1 block">模型</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full bg-bg-primary text-text-primary text-sm rounded-lg px-3 py-2.5 outline-none border border-border focus:border-accent/50"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm text-text-secondary bg-bg-tertiary rounded-lg hover:bg-border transition-colors"
          >
            取消
          </button>
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
