import type { OddeNovaBridgeStatus } from '../../hooks/useOddeNovaBridge';

export default function OddeNovaBridgeNotice({ status }: { status: OddeNovaBridgeStatus }) {
  let copy: string | null = null;
  let error = false;
  if (status.status === 'connecting') copy = '正在连接本机 skill…';
  else if (status.status === 'connected') copy = '已连接本机 skill，等待更新';
  else if (status.status === 'queued') copy = `第 ${status.revision} 版已排队，当前操作完成后应用`;
  else if (status.status === 'applied') {
    copy = status.outcome === 'branched'
      ? `网页修改已保留，第 ${status.revision} 版已导入为新分支`
      : `已应用第 ${status.revision} 版${status.persistent ? '' : '，但当前仅保存在内存'}`;
  } else if (status.status === 'occupied') { copy = '此作品已有一个接收页面'; error = true; }
  else if (status.status === 'owner-changed') { copy = '账号已改变，本机 skill 连接已暂停，请显式重新连接'; error = true; }
  else if (status.status === 'error') { copy = status.message; error = true; }
  if (!copy) return null;
  return (
    <div
      className={`fixed top-4 left-1/2 z-[61] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border px-4 py-3 text-center text-sm shadow-lg ${
        error ? 'border-red-400/30 bg-bg-primary text-red-400' : 'border-border bg-bg-secondary text-text-primary'
      }`}
      role={error ? 'alert' : 'status'}
    >
      {copy}
    </div>
  );
}
