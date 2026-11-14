import { useEffect, useState, type FormEvent } from 'react';
import './local-tools.css';

type PromptVersions = { versions: string[]; active: string | null };

function comparisonUrl(from: string, to: string) {
  return `/api/local/prompts/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&refresh=${Date.now()}`;
}

const tools = [
  {
    title: '采样库',
    description: '浏览、试听采样，管理类别与听感标注。',
    href: '/sample-library',
  },
  {
    title: '提示词版本比较',
    description: '对照提示词版本，查看展开内容与源码。',
    href: '/local-tools/prompt-compare',
  },
];

export default function LocalToolsPage() {
  const isCompare = window.location.pathname.startsWith('/local-tools/prompt-compare');
  const [versions, setVersions] = useState<PromptVersions | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [src, setSrc] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!isCompare) return;
    let cancelled = false;
    fetch('/api/local/prompts/versions')
      .then(async response => {
        if (!response.ok) throw new Error('读取提示词版本失败。');
        return response.json() as Promise<PromptVersions>;
      })
      .then(data => {
        if (cancelled) return;
        setVersions(data);
        const activeIndex = Math.max(0, data.versions.indexOf(data.active ?? ''));
        const current = data.versions[activeIndex] ?? '';
        const previous = data.versions[Math.max(0, activeIndex - 1)] ?? current;
        setTo(current);
        setFrom(previous);
        if (current) {
          setStatus('正在生成比较…');
          setSrc(comparisonUrl(previous, current));
        } else {
          setStatus('未找到提示词版本。');
        }
      })
      .catch(error => { if (!cancelled) setStatus(error.message); });
    return () => { cancelled = true; };
  }, [isCompare]);

  function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('正在生成比较…');
    setSrc(comparisonUrl(from, to));
  }

  function swapVersions() {
    setFrom(to);
    setTo(from);
  }

  return (
    <main className={`local-tools ${isCompare ? 'local-tools--compare' : 'local-tools--home'}`}>
      {isCompare ? (
        <header className="local-tools__masthead">
          <a className="local-tools__eyebrow" href="/local-tools">ODDENOVA <span>/</span> 本地工具</a>
          <h1>提示词比较</h1>
          <a className="local-tools__back" href="/local-tools">返回工具 <span aria-hidden="true">↗</span></a>
        </header>
      ) : (
        <header className="local-tools__header">
          <a className="local-tools__eyebrow" href="/local-tools">oddeNova <span>/</span> 本地工具</a>
          <h1>本地调试工具</h1>
          <p>选择一个工具，开始工作。</p>
        </header>
      )}

      {isCompare ? (
        <section className="local-tools__compare">
          <form onSubmit={compare}>
            <label>旧版本
              <select required value={from} onChange={event => setFrom(event.target.value)} disabled={!versions}>
                {(versions?.versions ?? []).map(version => <option key={version} value={version}>{version}</option>)}
              </select>
            </label>
            <span className="local-tools__arrow" aria-hidden="true">→</span>
            <button
              className="local-tools__swap"
              type="button"
              aria-label="交换版本顺序"
              onClick={swapVersions}
              disabled={!versions || !from || !to}
            >
              ⇄
            </button>
            <label>新版本
              <select required value={to} onChange={event => setTo(event.target.value)} disabled={!versions}>
                {(versions?.versions ?? []).map(version => <option key={version} value={version}>
                  {version}{version === versions?.active ? '（当前）' : ''}
                </option>)}
              </select>
            </label>
            <button className="local-tools__submit" type="submit" disabled={!versions || !from || !to}>开始比较</button>
          </form>
          <p className="local-tools__status" role="status" aria-live="polite">{status}</p>
          {src && <iframe key={src} className="local-tools__frame" title="提示词比较结果" src={src} onLoad={() => setStatus('比较已加载。')} />}
        </section>
      ) : (
        <nav className="local-tools__grid" aria-label="本地调试工具">
          {tools.map(tool => (
            <a className="local-tools__card" href={tool.href} key={tool.href}>
              <h2>{tool.title}<span aria-hidden="true">↗</span></h2>
              <p>{tool.description}</p>
            </a>
          ))}
        </nav>
      )}
    </main>
  );
}
