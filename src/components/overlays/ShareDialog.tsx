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
const buttonClass = 'rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40';
const say = (cn: string, en: string) => zh ? cn : en;

export default function ShareDialog({ snapshot, onClose }: ShareDialogProps) {
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
    void renderShareReceipt(url, title).then(result => {
      if (active) setReceipt(result);
    }).catch(() => { if (active) setRenderError(true); });
    return () => { active = false; };
  }, [url, title, renderAttempt]);

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

  async function share(system: boolean) {
    if (shareBusy.current || !url) return;
    shareBusy.current = true;
    setSharing(true);
    setNotice('');
    try {
      const brandedTitle = zh ? `【oddeNova】${title}` : `[oddeNova] ${title}`;
      const result = await (system ? nativeShare(url, brandedTitle) : shareUrl(url, brandedTitle, true));
      if (result === 'failed') throw new Error('Share target unavailable');
      if (result === 'cancelled') return;
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
    try { await paperangPrinter.connect(); }
    catch (error) {
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
        className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-region border border-border bg-bg-primary p-5 text-text-primary shadow-menu-overlay"
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
          if (event.key !== 'Tab') return;
          const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? []);
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
        }}>
        <div className="flex items-center justify-between gap-4">
          <h2 id="share-dialog-title" className="text-lg">{t('share')}</h2>
          <button type="button" aria-label={say('关闭分享', 'Close sharing')} className="p-2" onClick={onClose}><XIcon size={18} /></button>
        </div>
        <p className="mt-2 break-words text-sm text-text-secondary">{title}</p>
        {uploading ? <p role="status" className="my-6 text-sm">{t('sharing')}</p> : uploadError ? (
          <div className="my-6"><p role="alert">{t('shareFailedRetry')}</p><button className={buttonClass} onClick={() => void retryUpload()}>{say('重试生成链接', 'Retry creating link')}</button></div>
        ) : (
          <>
            {receipt ? <img src={receipt.preview} width={384} alt={say('作品二维码打印预览', 'Share QR receipt preview')} className="mx-auto my-4 w-56 max-w-full bg-white" />
              : <p role="status" className="my-4 text-sm">{renderError ? say('二维码生成失败', 'Could not generate QR code') : say('正在生成二维码…', 'Generating QR code…')}</p>}
            {renderError && <button className={buttonClass} onClick={() => { setRenderError(false); setRenderAttempt(value => value + 1); }}>{say('重试生成二维码', 'Retry QR code')}</button>}
            <p className="break-all text-xs text-text-secondary">{url}</p>
            <p className="mt-2 text-xs text-text-muted">{say('分享链接有效期为 30 天', 'Share links expire after 30 days')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={buttonClass} disabled={sharing} onClick={() => void share(false)}>{say('复制链接', 'Copy link')}</button>
              {typeof navigator.share === 'function' && <button className={buttonClass} disabled={sharing} onClick={() => void share(true)}>{say('系统分享', 'System share')}</button>}
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-3 text-sm">{say('喵喵机 P1', 'Paperang P1')}</p>
              {!supported ? <p className="text-xs text-text-secondary">{say('蓝牙打印需要在 macOS Chrome 中通过 HTTPS 打开，并允许蓝牙权限。', 'Bluetooth printing requires macOS Chrome over HTTPS with Bluetooth permission.')}</p> : (
                <div className="flex flex-wrap gap-2">
                  {state === 'disconnected' || state === 'connecting'
                    ? <button className={buttonClass} disabled={state === 'connecting'} onClick={() => void connect()}>{state === 'connecting' ? say('正在连接…', 'Connecting…') : say('连接打印机', 'Connect printer')}</button>
                    : <><button className={buttonClass} disabled={!receipt || state === 'printing'} onClick={() => void print()}>{state === 'printing' ? say('正在发送…', 'Sending…') : say('打印一份', 'Print one copy')}</button><button className={buttonClass} disabled={state === 'printing'} onClick={() => paperangPrinter.disconnect()}>{say('断开连接', 'Disconnect')}</button></>}
                </div>
              )}
            </div>
          </>
        )}
        <p role="status" aria-live="polite" className="mt-3 text-sm text-text-secondary">{notice}</p>
      </div>
    </div>, document.body,
  );
}
