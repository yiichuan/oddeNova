import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { uploadShare, type UploadShareInput } from '../../services/share';
import { nativeShare, shareUrl } from '../../services/share-target';
import { paperangPrinter, PrinterConnectionError } from '../../services/printing/paperang-printer';
import { renderShareReceipt } from '../../services/printing/share-receipt';
import { trackShareCompleted, trackSharePrintFinished } from '../../lib/analytics';
import { t, zh } from '../../lib/i18n';
import { XIcon } from '../icons';

export interface ShareDialogProps {
  snapshot: UploadShareInput;
  onClose: () => void;
}
const buttonClass = 'rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary disabled:cursor-not-allowed disabled:opacity-40';
const say = (cn: string, en: string) => zh ? cn : en;

export default function ShareDialog({ snapshot, onClose }: ShareDialogProps) {
  const defaultCardTitle = snapshot.title === 'oddeNova beta 1.0 默认印象' ? '默认印象'
    : snapshot.title === 'oddeNova beta 1.0 Default Impression' ? 'Default Impression'
    : !snapshot.title.trim() || ['新会话', 'New session'].includes(snapshot.title) ? say('我的音乐作品', 'My music creation') : snapshot.title;
  const [cardTitle, setCardTitle] = useState(defaultCardTitle);
  const [draftTitle, setDraftTitle] = useState(defaultCardTitle);
  const [printOpen, setPrintOpen] = useState(false);
  const [connectFailed, setConnectFailed] = useState(false);
  const renderGeneration = useRef(0);
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(true);
  const [uploadError, setUploadError] = useState(false);
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof renderShareReceipt>> | null>(null);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const [renderError, setRenderError] = useState(false);
  const [notice, setNotice] = useState('');
  const [sharing, setSharing] = useState(false);
  const shareBusy = useRef(false);
  const request = useRef<Promise<string> | null>(null);
  const retryBusy = useRef(false);
  const alive = useRef(true);
  const dialog = useRef<HTMLDivElement>(null);
  const state = useSyncExternalStore(paperangPrinter.subscribe, paperangPrinter.getSnapshot);
  const supported = paperangPrinter.supported();
  const title = snapshot.title !== t('newSessionTitle') ? snapshot.title : t('sharedMusicCreation');

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      alive.current = false;
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    // Reuse the same upload during StrictMode effect replay.
    request.current ??= uploadShare(snapshot);
    void request.current.then(id => {
      if (active) setUrl(`${window.location.origin}/s/${id}`);
    }).catch(() => { if (active) setUploadError(true); })
      .finally(() => { if (active) setUploading(false); });
    return () => { active = false; };
  }, [snapshot]);

  useEffect(() => {
    if (!url) return;
    let active = true;
    const generation = ++renderGeneration.current;
    void renderShareReceipt(url, cardTitle, say('扫码听听这段音乐', 'Scan to hear this music')).then(result => {
      if (active && generation === renderGeneration.current) setReceipt(result);
    }).catch(() => { if (active && generation === renderGeneration.current) setRenderError(true); });
    return () => { active = false; };
  }, [url, cardTitle, renderAttempt]);

  async function retryUpload() {
    if (retryBusy.current) return;
    retryBusy.current = true;
    setUploadError(false);
    setUploading(true);
    try {
      const id = await uploadShare(snapshot);
      if (alive.current) setUrl(`${window.location.origin}/s/${id}`);
    } catch { if (alive.current) setUploadError(true); }
    finally {
      retryBusy.current = false;
      if (alive.current) setUploading(false);
    }
  }

  function applyTitle() {
    const next = draftTitle.trim() || defaultCardTitle;
    setDraftTitle(next);
    if (next === cardTitle) return;
    renderGeneration.current++;
    setReceipt(null);
    setRenderError(false);
    setCardTitle(next);
  }

  function saveImage() {
    if (!receipt) return;
    const link = document.createElement('a');
    link.href = receipt.preview;
    const filename = Array.from(cardTitle, char => char.charCodeAt(0) < 32 ? '_' : char).join('')
      .replace(/[<>:"/\\|?*]/g, '_').replace(/[. ]+$/g, '') || 'oddeNova';
    link.download = `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice(say('已开始下载图片', 'Image download started'));
  }

  async function share(system = false) {
    if (shareBusy.current || !url) return;
    shareBusy.current = true;
    setSharing(true);
    setNotice('');
    try {
      const brandedTitle = zh ? `【oddeNova】${title}` : `[oddeNova] ${title}`;
      const result = system ? await nativeShare(url, brandedTitle) : await shareUrl(url, brandedTitle, true);
      if (result === 'cancelled') return;
      if (result === 'failed') throw new Error('Native sharing failed');
      trackShareCompleted({ share_method: result === 'shared' ? 'native' : result === 'shown' ? 'prompt' : 'clipboard' });
      if (alive.current) setNotice(result === 'shared' ? t('shared') : result === 'shown' ? say('请复制弹窗中的链接', 'Copy the link from the prompt') : t('shareDetailsCopied'));
    } catch { if (alive.current) setNotice(t('shareFailedRetry')); }
    finally {
      shareBusy.current = false;
      if (alive.current) setSharing(false);
    }
  }

  async function connect() {
    setNotice('');
    setConnectFailed(false);
    try { await paperangPrinter.connect(); }
    catch (error) {
      if (alive.current) setConnectFailed(true);
      const stage = error instanceof PrinterConnectionError ? error.stage : 'connection';
      const stages = { selection: say('选择设备', 'device selection'), connection: say('蓝牙连接', 'Bluetooth connection'), service: say('发现 P1 服务', 'P1 service discovery'), characteristic: say('发现打印通道', 'print characteristic discovery') };
      const cause = error instanceof PrinterConnectionError ? error.cause : error;
      const browserError = cause instanceof Error ? cause : undefined;
      let hint = say('请确认 P1 已开机、未被其他应用连接，并允许 Chrome 使用蓝牙。', 'Turn on P1, disconnect other apps, and allow Chrome Bluetooth access.');
      if (stage === 'connection' && browserError?.name === 'NetworkError' && browserError.message === 'Unsupported device.') {
        hint = say('当前浏览器不支持所选设备的 GATT 连接。macOS 上的经典蓝牙设备会出现此错误；若打印机有独立的 BLE 入口，请重新选择该入口。经典蓝牙打印需要本地桥接程序，当前页面尚不支持。', 'The current browser cannot establish a GATT connection to this device. Classic Bluetooth devices on macOS produce this error. If the printer has a separate BLE entry, select it instead. Classic Bluetooth printing requires a local bridge, which this page does not support yet.');
      } else if (browserError?.name === 'NotFoundError' && stage === 'service') {
        hint = say('蓝牙已连接，但所选设备未提供当前支持的 P1 打印服务。请确认打印机型号；若确为 P1，请提供下方浏览器详情以核对协议。', 'Bluetooth connected, but the selected device does not expose the supported P1 print service. Check the printer model; if it is a P1, provide the browser details below so we can check its protocol.');
      } else if (browserError?.name === 'NotFoundError' && stage === 'characteristic') {
        hint = say('已找到 P1 服务，但缺少当前支持的打印通道。请提供下方浏览器详情以核对硬件或固件版本。', 'The P1 service was found, but the supported print channel is missing. Provide the browser details below so we can check the hardware or firmware version.');
      } else if (browserError?.name === 'SecurityError' || browserError?.name === 'NotAllowedError') {
        hint = say('浏览器拒绝了蓝牙访问。请重新选择设备并允许页面访问蓝牙服务。', 'The browser denied Bluetooth access. Select the device again and allow this page to access its Bluetooth services.');
      }
      const details = browserError ? ` ${say('浏览器详情', 'Browser details')}: ${browserError.name}: ${browserError.message}` : '';
      if (alive.current) setNotice(`${say('连接失败', 'Connection failed')} (${stages[stage]})。${hint}${details}`);
    }
  }
  async function print() {
    if (!receipt || paperangPrinter.getSnapshot() !== 'connected') return;
    setNotice('');
    try {
      await paperangPrinter.print(receipt.raster);
      trackSharePrintFinished({ outcome: 'sent' });
      if (alive.current) setNotice(say('已发送至打印机', 'Sent to printer'));
    } catch (error) {
      trackSharePrintFinished({ outcome: 'failed' });
      const details = error instanceof Error ? ` ${say('发送详情', 'Sending details')}: ${error.message}` : '';
      if (alive.current) setNotice(say('发送中断，可能已部分出纸。请检查纸条后重连并手动补打。', 'Sending interrupted; some paper may have printed. Check the receipt, reconnect and reprint manually.') + details);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--color-overlay-backdrop)] p-4 backdrop-blur-sm" onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="share-dialog-title" tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-[400px] overflow-y-auto rounded-[20px] border border-border bg-conversation-surface p-6 text-text-primary shadow-dialog-overlay"
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
          if (event.key !== 'Tab') return;
          const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]') ?? []);
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
        }}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="share-dialog-title" className="text-base font-medium">{say('分享作品', 'Share creation')}</h2>
          <button type="button" aria-label={say('关闭分享', 'Close sharing')} className="-mr-2 grid size-9 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary" onClick={onClose}><XIcon size={18} /></button>
        </div>
        {uploading ? <p role="status" className="my-6 text-sm">{t('sharing')}</p> : uploadError ? (
          <div className="my-6"><p role="alert">{t('shareFailedRetry')}</p><button className={buttonClass} onClick={() => void retryUpload()}>{say('重试生成链接', 'Retry creating link')}</button></div>
        ) : (
          <>
            <div className="mt-4 border-t border-border pt-4">
              <label htmlFor="share-card-title" className="mb-2 block text-xs text-text-secondary">{say('小卡标题', 'Card title')}</label>
              <input id="share-card-title" value={draftTitle} onChange={event => setDraftTitle(event.target.value)} onBlur={applyTitle}
                onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); applyTitle(); } }}
                className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-text-primary" />
              <figure className="mt-4">
                {receipt ? <img src={receipt.preview} width={384} alt={say('作品二维码打印预览', 'Share QR receipt preview')} className="mx-auto block h-auto w-48 max-w-full bg-white" />
                  : <div className="py-6 text-center">
                    <p role={renderError ? 'alert' : 'status'} className="text-sm text-text-secondary">{renderError ? say('打印预览生成失败', 'Could not generate print preview') : say('正在生成打印预览…', 'Generating print preview…')}</p>
                    {renderError && <button className={`${buttonClass} mt-3`} onClick={() => { setRenderError(false); setRenderAttempt(value => value + 1); }}>{say('重试生成预览', 'Retry print preview')}</button>}
                  </div>}
                <figcaption className="mt-2 text-center text-xs text-text-muted">{say('分享小卡预览', 'Share card preview')}</figcaption>
              </figure>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <button className={`${buttonClass} border-transparent bg-text-primary font-medium text-bg-primary hover:opacity-80 hover:bg-text-primary`} disabled={sharing} onClick={() => void share()}>{sharing ? t('sharing') : say('复制链接', 'Copy link')}</button>
              <button className={buttonClass} disabled={!receipt} onClick={saveImage}>{say('保存图片', 'Save image')}</button>
              <button className={buttonClass} aria-expanded={printOpen} aria-controls="share-printer" onClick={() => setPrintOpen(value => !value)}>{say('打印小卡', 'Print card')}</button>
            </div>
            {typeof navigator.share === 'function' && <button className="mt-2 rounded-lg px-2 py-2 text-xs text-text-secondary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-text-primary disabled:opacity-40" disabled={sharing} onClick={() => void share(true)}>{say('系统分享', 'System share')}</button>}
            {printOpen && <div id="share-printer" className="mt-4 space-y-3 border-t border-border pt-4">
              <p role="status" className="text-xs text-text-muted">{say('喵喵机 P1', 'Paperang P1')} · {state === 'disconnected' ? say('未连接', 'Disconnected') : state === 'connecting' ? say('正在连接', 'Connecting') : state === 'printing' ? say('正在发送', 'Sending') : say('已连接', 'Connected')}</p>
              {!supported ? <p className="w-full text-xs leading-relaxed text-text-secondary">{say('蓝牙打印需要在 macOS Chrome 中通过 HTTPS 打开，并允许蓝牙权限。', 'Bluetooth printing requires macOS Chrome over HTTPS with Bluetooth permission.')}</p> : (
                <div className="flex flex-wrap items-center gap-2">
                  {state === 'disconnected' || state === 'connecting'
                    ? <button className={buttonClass} disabled={state === 'connecting'} onClick={() => void connect()}>{state === 'connecting' ? say('正在连接…', 'Connecting…') : connectFailed ? say('重新连接', 'Reconnect') : say('连接打印机', 'Connect printer')}</button>
                    : <><button className={buttonClass} disabled={!receipt || state === 'printing'} onClick={() => void print()}>{state === 'printing' ? say('正在发送…', 'Sending…') : say('打印小卡', 'Print card')}</button><button className="rounded-lg px-2 py-2 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary disabled:cursor-not-allowed disabled:opacity-40" disabled={state === 'printing'} onClick={() => paperangPrinter.disconnect()}>{say('断开连接', 'Disconnect')}</button></>}
                </div>
              )}
            </div>}
          </>
        )}
        <p role="status" aria-live="polite" className={notice ? 'mt-3 break-words text-xs leading-relaxed text-text-secondary' : 'sr-only'}>{notice}</p>
      </div>
    </div>, document.body,
  );
}
