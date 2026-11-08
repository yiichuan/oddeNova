import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { repairPaths } from '../../src/lib/sample-index-hosts';
import { SAMPLE_ALLOWLIST } from '../../src/lib/sample-allowlist';

export const LIBRARIES = ['dirt-samples', 'tidal-drum-machines', 'piano', 'vcsl', 'mridangam', 'uzu-drumkit'];
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const roles: Record<string, string> = {
  bd: '底鼓 kick bass drum', sd: '军鼓 snare', hh: '闭镲 closed hi-hat', oh: '开镲 open hi-hat',
  lt: '低音通鼓 low tom', mt: '中音通鼓 mid tom', ht: '高音通鼓 high tom', cp: '拍手 clap',
  rim: '击边 rim', cb: '牛铃 cowbell', sh: '沙锤 shaker', cr: '碎音镲 crash', rd: '叮叮镲 ride',
  tb: '铃鼓 tambourine',
};
export interface FileReference {
  id: string; library: string; key: string; path: string; url: string;
  index: number; rootNote: string | null; active: boolean; aliases: string[];
  category: string | null; categoryEvidence: string | null;
  articulation: string | null;
}
export function categoryFor(library: string, key: string, file: string) {
  if (library === 'piano') return { category: '钢琴 piano', categoryEvidence: 'piano index', articulation: null };
  if (library === 'mridangam') return { category: 'Mridangam 手鼓 percussion', categoryEvidence: 'mridangam index', articulation: null };
  if (library === 'tidal-drum-machines' || library === 'uzu-drumkit') {
    const role = library === 'tidal-drum-machines' ? key.split('_').at(-1)! : key;
    return { category: roles[role] ?? null, categoryEvidence: roles[role] ? 'documented drum role: ' + role : null, articulation: null };
  }
  const decoded = decodeURIComponent(file.replace(/%(?![\da-f]{2})/gi, '%25'));
  if (library === 'vcsl') {
    const parts = decoded.split('/');
    const family = ({ Aerophones: '管乐 winds', Membranophones: '鼓 drum percussion', Chordophones: '弦乐 strings', Idiophones: '打击乐 percussion' } as Record<string, string>)[parts[0]];
    const instrument = parts.length > 3 ? parts[2] : null;
    const techniques = ['Staccato', 'Sustain', 'Vibrato', 'Pizzicato', 'Tremolo', 'Bowed', 'Plucked'];
    const articulation = techniques.find(value => parts.some(part => part.toLowerCase() === value.toLowerCase())) ?? null;
    return { category: family && instrument ? family + ' · ' + instrument : null,
      categoryEvidence: family && instrument ? 'VCSL directory: ' + parts.slice(0, 3).join('/') : null, articulation };
  }
  return { category: null, categoryEvidence: null, articulation: null };
}

export function buildInventory(root: string): FileReference[] {
  const records: FileReference[] = [];
  const owners = new Map<string, string>();
  for (const library of LIBRARIES) {
    const index = repairPaths(JSON.parse(readFileSync(root + '/public/sample-index/' + library + '.json', 'utf8')));
    const base = String(index._base);
    for (const [key, value] of Object.entries(index)) {
      if (key.startsWith('_')) continue;
      owners.set(key.toLowerCase(), library);
      const walk = (entry: unknown, note: string | null = null) => {
        if (Array.isArray(entry)) {
          entry.forEach((file, n) => add(String(file), n, note));
        } else if (typeof entry === 'string') add(entry, 0, note);
        else if (entry && typeof entry === 'object') {
          for (const [pitch, files] of Object.entries(entry)) walk(files, pitch);
        } else throw Error('Unsupported sample entry: ' + library + '/' + key);
      };
      const add = (file: string, n: number, note: string | null) => {
        // Preserve existing escapes and encode literal URL delimiters.
        const url = new URL(file.replaceAll(' ', '%20').replaceAll('#', '%23').replaceAll('?', '%3F'), base).href;
        records.push({ id: digest(JSON.stringify([library, key, note, n, file])),
          library, key, path: file, url, index: n, rootNote: note,
          active: false, aliases: [], ...categoryFor(library, key, file) });
      };
      walk(value);
    }
  }
  const aliases = JSON.parse(readFileSync(root + '/public/sample-index/tidal-drum-machines-alias.json', 'utf8'));
  for (const record of records) {
    record.active = owners.get(record.key.toLowerCase()) === record.library && SAMPLE_ALLOWLIST.has(record.key);
    if (record.library === 'tidal-drum-machines') {
      const split = record.key.indexOf('_');
      const alias = aliases[record.key.slice(0, split)];
      if (alias) record.aliases = [alias + record.key.slice(split)];
    }
  }
  return records;
}
