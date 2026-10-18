import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { uploadShare, type UploadShareInput } from '../../services/share';
import { nativeShare, shareUrl } from '../../services/share-target';
import { paperangPrinter, PrinterBridgeUnavailableError, PrinterConnectionError, PrinterProtocolError } from '../../services/printing/paperang-printer';
import { nextReceiptNumber, recordReceiptPrinted } from '../../services/printing/receipt-counter';
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
  const [printOpen, setPrintOpen] = useState(false);
  const renderGeneration = useRef(0);
  const receiptDetails = useRef({
    code: snapshot.code,
    createdAt: snapshot.messages.find(message => message.role === 'user')?.timestamp
      ?? snapshot.revisions?.[0]?.createdAt
      ?? Date.now(),
    locale: snapshot.locale,
    messages: snapshot.messages,
  });
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(true);
  const [uploadError, setUploadError] = useState(false);
  // The preview carries the number the next print will use; each print moves it on.
  const [receiptNumber, setReceiptNumber] = useState(() => nextReceiptNumber());
  const [receipt, setReceipt] = useState<(Awaited<ReturnType<typeof renderShareReceipt>> & { number: number }) | null>(null);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const [renderError, setRenderError] = useState(false);
  const receiptReady = !!receipt && !renderError;
  const [notice, setNotice] = useState('');
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeShareSupported = typeof navigator.share === 'function';
  const shareBusy = useRef(false);
  const printBusy = useRef(false);
  const request = useRef<Promise<string> | null>(null);
  const retryBusy = useRef(false);
  const alive = useRef(true);
  const dialog = useRef<HTMLDivElement>(null);
  const state = useSyncExternalStore(paperangPrinter.subscribe, paperangPrinter.getSnapshot);
  const supported = paperangPrinter.supported();
  const bridgeSupported = paperangPrinter.bridgeSupported();
  const title = snapshot.title !== t('newSessionTitle') ? snapshot.title : t('sharedMusicCreation');

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      alive.current = false;
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
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
    void renderReceipt(receiptNumber).then(result => {
      if (active && generation === renderGeneration.current) setReceipt(result);
    }).catch(() => { if (active && generation === renderGeneration.current) setRenderError(true); });
    return () => { active = false; };
    // renderReceipt reads only `url` and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, renderAttempt, receiptNumber]);

  async function renderReceipt(number: number) {
    const result = await renderShareReceipt(
      url,
      say('扫描二维码查看创作过程', 'SCAN QR TO VIEW THE PROCESS'),
      { ...receiptDetails.current, number },
    );
    return { ...result, number };
  }

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

  function saveImage() {
    if (!receipt || !receiptReady) return;
    const link = document.createElement('a');
    link.href = receipt.preview;
    link.download = 'oddeNova-card.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function share(system = false) {
    if (shareBusy.current || !url) return;
    shareBusy.current = true;
    setSharing(true);
    if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
    setCopied(false);
    setNotice('');
    try {
      const brandedTitle = zh ? `【oddeNova】${title}` : `[oddeNova] ${title}`;
      const result = system ? await nativeShare(url, brandedTitle) : await shareUrl(url, brandedTitle, true);
      if (result === 'cancelled') return;
      if (result === 'failed') throw new Error('Native sharing failed');
      trackShareCompleted({ share_method: result === 'shared' ? 'native' : result === 'shown' ? 'prompt' : 'clipboard' });
      if (alive.current) {
        if (result === 'copied') {
          setCopied(true);
          copiedTimer.current = setTimeout(() => {
            copiedTimer.current = null;
            setCopied(false);
          }, 2000);
        } else {
          setNotice(result === 'shared' ? t('shared') : say('请复制弹窗中的链接', 'Copy the link from the prompt'));
        }
      }
    } catch { if (alive.current) setNotice(t('shareFailedRetry')); }
    finally {
      shareBusy.current = false;
      if (alive.current) setSharing(false);
    }
  }

  const noProtocolNotice = () => say(
    '打印机在这个 BLE 通道上没有回应任何已知的 Paperang 协议（A5、经典 P1、gen2），所以网页不会发送打印数据。P1S 等较新的固件只通过经典蓝牙（SPP）接收打印数据，请断开后改用“连接 P1S”。',
    'The printer did not answer any known Paperang protocol (A5, classic P1, gen2) on this BLE channel, so no print data will be sent. Newer firmware such as P1S accepts print data only over Classic Bluetooth (SPP); disconnect and use "Connect P1S" instead.');
  async function connect(classic = false) {
    setNotice('');
    try {
      await (classic ? paperangPrinter.connectBridge() : paperangPrinter.connect());
      if (alive.current && paperangPrinter.getProtocol() === 'unknown') setNotice(noProtocolNotice());
    }
    catch (error) {
      const stage = error instanceof PrinterConnectionError ? error.stage : 'connection';
      const stages = { selection: say('选择设备', 'device selection'), connection: say('蓝牙连接', 'Bluetooth connection'), service: say('发现 P1 服务', 'P1 service discovery'), characteristic: say('发现打印通道', 'print characteristic discovery') };
      const cause = error instanceof PrinterConnectionError ? error.cause : error;
      const browserError = cause instanceof Error ? cause : undefined;
      let hint = say('请确认打印机已开机、未被其他应用连接，并允许 Chrome 使用蓝牙。', 'Turn on the printer, disconnect other apps, and allow Chrome Bluetooth access.');
      if (classic && browserError instanceof PrinterBridgeUnavailableError) {
        hint = say('没有找到本地打印桥。请在项目目录的终端运行 npm run printer:bridge，保持窗口开着，再重新连接。', 'The local printer bridge is not running. Run npm run printer:bridge in a terminal in the project folder, keep it open, then reconnect.');
      } else if (classic) {
        hint = say('请确认 P1S 已开机、已在系统蓝牙设置中配对，并且没有被网页的 BLE 连接或喵喵机 App 占用。', 'Make sure the P1S is on, paired in system Bluetooth settings, and not held by a BLE connection from this page or the Paperang app.');
      } else if (stage === 'connection' && browserError?.name === 'NetworkError' && browserError.message === 'Unsupported device.') {
        hint = say('浏览器无法通过网页蓝牙连接所选设备。如果是 P1S，请改用“连接 P1S”。', 'The browser cannot connect to this device over Web Bluetooth. For a P1S, use "Connect P1S" instead.');
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
    if (printBusy.current || !receipt || !receiptReady || paperangPrinter.getSnapshot() !== 'connected') return;
    printBusy.current = true;
    setNotice('');
    try {
      // Another tab may have printed, or the day may have turned, since the preview was drawn.
      const number = nextReceiptNumber();
      let job = receipt;
      if (job.number !== number) {
        try { job = await renderReceipt(number); } catch {
          if (alive.current) setRenderError(true);
          return;
        }
      }
      await printReceipt(job);
    } finally { printBusy.current = false; }
  }
  async function printReceipt(job: NonNullable<typeof receipt>) {
    try {
      const result = await paperangPrinter.print(job.raster);
      recordReceiptPrinted(job.number);
      if (alive.current) setReceiptNumber(nextReceiptNumber());
      if (result === 'sent') trackSharePrintFinished({ outcome: 'sent' });
      if (alive.current) setNotice(result === 'unconfirmed'
        ? say('打印数据已发送，但打印机没有确认任务完成。如未出纸，请提供设备回包信息。', 'The print data was sent, but the printer did not confirm the job. If no paper comes out, share the device reply.') + ` ${say('设备回包', 'Device reply')}: ${paperangPrinter.getLastDeviceReply() || say('无', 'none')}`
        : say('已发送至打印机', 'Sent to printer'));
    } catch (error) {
      if (error instanceof PrinterProtocolError) {
        if (alive.current) setNotice(noProtocolNotice());
        return;
      }
      trackSharePrintFinished({ outcome: 'failed' });
      const details = error instanceof Error ? ` ${say('发送详情', 'Sending details')}: ${error.message}` : '';
      if (alive.current) setNotice(say('发送中断，可能已部分出纸。请检查纸条后重连并手动补打。', 'Sending interrupted; some paper may have printed. Check the receipt, reconnect and reprint manually.') + details);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--color-overlay-backdrop)] p-4 backdrop-blur-sm" onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="share-dialog-title" tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-[400px] overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-[20px] border border-border bg-conversation-surface p-6 text-text-primary shadow-dialog-overlay"
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Escape') { event.preventDefault(); onClose(); }
          if (event.key !== 'Tab') return;
          const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]') ?? []);
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
        }}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="share-dialog-title" className="text-base font-medium">{say('分享作品', 'Share creation')}</h2>
          <div className="flex items-center gap-1">
            {nativeShareSupported && <button type="button" aria-label={say('系统分享', 'System share')}
              className="grid size-9 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              disabled={sharing || !url} onClick={() => void share(true)}><span aria-hidden="true" className="text-lg leading-none">⋯</span></button>}
            <button type="button" aria-label={say('关闭分享', 'Close sharing')} className="-mr-2 grid size-9 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary" onClick={onClose}><XIcon size={18} /></button>
          </div>
        </div>
        {uploading ? <p role="status" className="my-6 text-sm">{t('sharing')}</p> : uploadError ? (
          <div className="my-6"><p role="alert">{t('shareFailedRetry')}</p><button className={buttonClass} onClick={() => void retryUpload()}>{say('重试生成链接', 'Retry creating link')}</button></div>
        ) : (
          <>
            <div className="mt-4 border-t border-border pt-4">
              <figure>
                {receipt ? <img src={receipt.preview} width={384} alt={say('作品二维码打印预览', 'Share QR receipt preview')} className="mx-auto block h-auto w-48 max-w-full bg-white" />
                  : !renderError && <div className="py-6 text-center">
                    <p role="status" className="text-sm text-text-secondary">{say('正在生成打印预览…', 'Generating print preview…')}</p>
                  </div>}
                {renderError && <div className="py-6 text-center">
                    <p role="alert" className="text-sm text-text-secondary">{say('打印预览生成失败', 'Could not generate print preview')}</p>
                    <button className={`${buttonClass} mt-3`} onClick={() => { setRenderError(false); setRenderAttempt(value => value + 1); }}>{say('重试生成预览', 'Retry print preview')}</button>
                  </div>}
                <figcaption className="mt-2 text-center text-xs text-text-muted">{say('分享小票预览', 'Share receipt preview')}</figcaption>
              </figure>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <button className={`${buttonClass} min-w-0 border-transparent bg-text-primary font-medium text-bg-primary hover:bg-text-primary hover:opacity-80`} disabled={sharing} onClick={() => void share()}><span aria-live="polite">{sharing ? t('sharing') : copied ? say('✓ 已复制', '✓ Copied') : say('复制链接', 'Copy link')}</span></button>
              <button className={buttonClass} disabled={!receiptReady} onClick={saveImage}>{say('保存图片', 'Save image')}</button>
              <button className={buttonClass} aria-expanded={printOpen} aria-controls="share-printer" onClick={() => setPrintOpen(value => !value)}>{say('打印小票', 'Print receipt')}</button>
            </div>
            {printOpen && <div id="share-printer" className="mt-4 space-y-3 border-t border-border pt-4">
              <p role="status" className="text-xs text-text-muted [overflow-wrap:anywhere]">{paperangPrinter.getDeviceName() || say('打印机', 'Printer')} · {state === 'disconnected' ? say('未连接', 'Disconnected') : state === 'connecting' ? say('正在连接', 'Connecting') : state === 'printing' ? say('正在发送', 'Sending') : say('已连接', 'Connected')}</p>
              {!supported && !bridgeSupported ? <p className="w-full text-xs leading-relaxed text-text-secondary">{say('蓝牙打印需要在 macOS Chrome 中通过 HTTPS 打开，并允许蓝牙权限。', 'Bluetooth printing requires macOS Chrome over HTTPS with Bluetooth permission.')}</p>
                : state === 'disconnected' || state === 'connecting' ? <>
                  <div className="grid grid-cols-2 gap-2">
                    {supported && <button className={buttonClass} disabled={state === 'connecting'} onClick={() => void connect()}>{say('连接 P1', 'Connect P1')}</button>}
                    {bridgeSupported && <button className={buttonClass} disabled={state === 'connecting'} onClick={() => void connect(true)}>{say('连接 P1S', 'Connect P1S')}</button>}
                  </div>
                  <p className="text-xs leading-relaxed text-text-secondary">{say('连接前请先断开喵喵机 App。', 'Disconnect the Paperang app first.')}{bridgeSupported && say('P1S 需先在系统蓝牙设置中配对，并保持打印桥（npm run printer:bridge）运行。', ' P1S must be paired in system Bluetooth settings, with the printer bridge (npm run printer:bridge) running.')}</p>
                </> : <div className="grid grid-cols-2 gap-2">
                  <button className={buttonClass} disabled={!receiptReady || state === 'printing'} onClick={() => void print()}>{state === 'printing' ? say('正在发送…', 'Sending…') : say('打印小票', 'Print receipt')}</button>
                  <button className={buttonClass} disabled={state === 'printing'} onClick={() => paperangPrinter.disconnect()}>{say('断开连接', 'Disconnect')}</button>
                </div>}
            </div>}
          </>
        )}
        <p role="status" aria-live="polite" className={notice ? 'mt-3 break-words text-xs leading-relaxed text-text-secondary' : 'sr-only'}>{notice}</p>
      </div>
    </div>, document.body,
  );
}
