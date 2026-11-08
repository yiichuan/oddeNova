import { readdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../.local/sample-annotations/deepseek-eval');
async function update() {
  const names=(await readdir(dir)).filter(name=>name.endsWith('.json')&&name!=='config.json');
  const rows=[];
  for(const name of names) {
    try {rows.push(JSON.parse(await readFile(path.join(dir,name),'utf8')));}
    catch(error) {if(!(error instanceof SyntaxError))throw error;}
  }
  const date=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'medium'}).format(new Date());
  const lines=['# DeepSeek 选样对照进度','','更新于 '+date+'（新加坡时间）','',
    '10 条请求 × 新旧两种方式 × 各重复 3 次，共 60 次创作。','',
    '| 条件 | 已保存 | 成功提交 | 代码校验通过 |','| --- | ---: | ---: | ---: |'];
  for(const condition of ['baseline','search']) {
    const group=rows.filter(row=>row.condition===condition);
    lines.push('| '+(condition==='baseline'?'v25 旧方式':'v26 采样检索')+' | '+group.length+'/30 | '+
      group.filter(row=>row.result.committed).length+' | '+group.filter(row=>row.validation.ok).length+' |');
  }
  lines.push('','已保存 '+rows.length+'/60。音色贴合度与最终听感待人工复核。','',
    '原始代码、调用记录和校验结果保存在本目录下的各 JSON 文件中。',
    '此进度每 30 秒更新，打开的预览可能需要刷新。');
  await writeFile(path.join(dir,'progress.md.tmp'),lines.join('\n'));
  await rename(path.join(dir,'progress.md.tmp'),path.join(dir,'progress.md'));
  console.log('DeepSeek evaluations saved:',rows.length,'/60');
  return rows.length;
}
do {
  if(await update()>=60 || !process.argv.includes('--watch')) break;
  await new Promise(resolve=>setTimeout(resolve,30000));
} while(true);
