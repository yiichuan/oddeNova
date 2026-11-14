import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPersonaBlock } from '../src/persona/oddenova.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw Error(`缺少参数 ${name}`);
  return args[index + 1];
}

const from = option('--from', 'v25');
const to = option('--to', 'v26');
if (!/^v[1-9]\d*$/.test(from) || !/^v[1-9]\d*$/.test(to)) throw Error('版本必须类似 v25');
const output = path.resolve(root, option('--out', `.local/prompt-diffs/${from}-${to}.html`));
const modules = await Promise.all([from, to].map(version => import(
  pathToFileURL(path.join(root, 'src/prompts/versions', `${version}.ts`)).href
)));
const temp = mkdtempSync(path.join(tmpdir(), 'oddenova-prompt-diff-'));

function diff(before, after) {
  const files = ['before.txt', 'after.txt'].map(name => path.join(temp, name));
  files.forEach((file, index) => writeFileSync(file, index ? after : before));
  try {
    return execFileSync('git', [
      'diff', '--no-index', '--no-ext-diff', '--no-color', '--unified=3', '--', ...files,
    ], { encoding: 'utf8' });
  } catch (error) {
    if (error.status === 1) return error.stdout;
    throw error;
  }
}

function render(module, lang) {
  const entry = module[lang === 'zh' ? 'AGENT_SYSTEM_PROMPT_OPENAI' : 'AGENT_SYSTEM_PROMPT_EN'];
  if (entry === undefined) return null;
  return typeof entry === 'function' ? entry(buildPersonaBlock(lang), 'oddeNova') : String(entry);
}

const content = {};
try {
  for (const lang of ['zh', 'en']) {
    const [before, after] = modules.map(module => render(module, lang));
    content[lang] = before === null || after === null
      ? null
      : { before, after, diff: diff(before, after) };
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const source = modules.map((_, index) => readFileSync(
  path.join(root, 'src/prompts/versions', `${index ? to : from}.ts`), 'utf8',
));
const payload = JSON.stringify({ from, to, content, source }).replaceAll('<', '\\u003c');

const page = readFileSync(path.join(root, 'scripts/prompt-diff-template.html'), 'utf8');

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, page.replace('/*PAYLOAD*/', () => payload));
for (const [lang, entry] of Object.entries(content)) {
  if (entry) writeFileSync(output.replace(/\.html$/, '') + `.${lang}.diff`, entry.diff);
}
console.log(output);
