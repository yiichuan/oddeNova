import { readFile, readdir, writeFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimatedCost } from './budget.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, '.local/sample-annotations');
async function json(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}
async function update() {
  const inventory = await json(path.join(dir, 'inventory.json'));
  if (!inventory) throw Error('Inventory not generated');
  const lock = await json(path.join(dir, 'annotation.lock'));
  const folders = await readdir(path.join(dir, 'annotations'));
  const states = await Promise.all(folders.map(async folder => ({
    folder, modified: (await stat(path.join(dir, 'annotations', folder, 'config.json'))).mtimeMs,
  })));
  const fingerprint = lock?.fingerprint ?? states.sort((a, b) => b.modified - a.modified)[0]?.folder;
  if (!fingerprint) throw Error('Annotation run not found');
  const run = path.join(dir, 'annotations', fingerprint);
  const [config, ledger, downloads, names] = await Promise.all([
    json(path.join(run, 'config.json')), json(path.join(run, 'ledger.json')),
    Promise.all(inventory.map(file => json(path.join(dir, 'downloads', file.id + '.json')))),
    readdir(run),
  ]);
  const hashes = names.filter(name => /^[a-f0-9]{64}\.json$/.test(name));
  const annotations = new Map(await Promise.all(hashes.map(async name => [name.slice(0, -5), await json(path.join(run, name))])));
  const covered = downloads.filter(audio => audio?.sha256 && annotations.get(audio.sha256)?.status === 'valid').length;
  const downloaded = downloads.filter(audio => audio?.sha256).length;
  let running = false;
  if (lock) {
    try { process.kill(lock.pid, 0); running = true; }
    catch (error) { running = error.code === 'EPERM'; }
  }
  const snapshot = {
    updatedAt: new Date().toISOString(), running, fingerprint, concurrency: lock?.concurrency ?? config?.concurrency ?? null,
    references: inventory.length, downloadedReferences: downloaded,
    uniqueValidAnnotations: [...annotations.values()].filter(row => row?.status === 'valid').length,
    coveredReferences: covered, pendingOrReview: inventory.length - covered,
    estimatedCny: ledger ? estimatedCost(ledger) : null, budgetCny: config?.budget,
  };
  const date = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'medium',
  }).format(new Date());
  const percent = (covered / inventory.length * 100).toFixed(1);
  const text = [
    '# 全库采样标注进度', '', '更新于 '+date+'（新加坡时间）', '',
    '任务'+(running ? '运行中。' : '当前没有运行进程，需查看结束状态或续跑。'), '',
    '| 项目 | 当前值 |', '| --- | ---: |',
    '| 并发数 | '+(snapshot.concurrency ?? '未记录')+' |',
    '| 总文件引用 | '+inventory.length+' |',
    '| 已下载文件引用 | '+downloaded+' |',
    '| 获得有效标注的文件引用 | '+covered+'（'+percent+'%） |',
    '| 去重后的有效音频标注 | '+snapshot.uniqueValidAnnotations+' |',
    '| 待处理或待复核文件引用 | '+snapshot.pendingOrReview+' |',
    '| API 费用保守估算 | ¥'+(snapshot.estimatedCny ?? 0).toFixed(3)+' |',
    '| 预算上限 | ¥'+snapshot.budgetCny+' |', '',
    '费用估算含未返回用量请求的预留金额，实际结算以平台账单为准。',
    '有效标注指结构校验通过，听感仍待人工确认。',
    '此文件每 30 秒更新，打开的编辑器或预览可能需要刷新。', '',
  ].join('\n');
  for (const [name, value] of [['progress.json', JSON.stringify(snapshot, null, 2)], ['progress.md', text]]) {
    await writeFile(path.join(dir, name + '.tmp'), value);
    await rename(path.join(dir, name + '.tmp'), path.join(dir, name));
  }
  console.log(JSON.stringify(snapshot));
  return running;
}
if (process.argv.includes('--watch')) {
  // Keep watching across task restarts and brief lock-file gaps.
  while (true) {
    try { await update(); }
    catch (error) { console.error('Progress refresh failed; will retry:', error.message); }
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
} else await update();
