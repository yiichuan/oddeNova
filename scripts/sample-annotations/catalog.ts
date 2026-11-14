import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DIRT_SAMPLE_ALIASES, FEATURED_SAMPLE_BASE, FEATURED_SAMPLE_FILES } from '../../src/lib/additional-sample-sources';
import { repairPaths, SAMPLE_LIBRARIES } from '../../src/lib/sample-index-hosts';
import { BUILTIN_SYNTHS, GM_NAME_ALIASES, SAMPLE_ALLOWLIST } from '../../src/lib/sample-allowlist';
import { SAMPLE_CATALOG } from '../../src/lib/sample-catalog';
import gm from '../../src/lib/gm-fonts.js';

export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const roles: Record<string, string> = {
  bd: '底鼓 kick bass drum', sd: '军鼓 snare', hh: '闭镲 closed hi-hat', oh: '开镲 open hi-hat',
  lt: '低音通鼓 low tom', mt: '中音通鼓 mid tom', ht: '高音通鼓 high tom', cp: '拍手 clap',
  rim: '击边 rim', cb: '牛铃 cowbell', sh: '沙锤 shaker', cr: '碎音镲 crash', rd: '叮叮镲 ride',
  tb: '铃鼓 tambourine',
};
// These presets only provide zones in the upper MIDI register.
const gmPreviewNotes: Record<string, string> = {
  '1041_GeneralUserGS_sf2_file': 'c8',
  '1051_GeneralUserGS_sf2_file': 'c8',
  '1061_GeneralUserGS_sf2_file': 'c8',
  '1071_GeneralUserGS_sf2_file': 'c7',
  '1072_GeneralUserGS_sf2_file': 'c8',
};

const browseGroupCategories = new Map([
  ['kit-kick', roles.bd],
  ['kit-snare', roles.sd],
  ['kit-clap', roles.cp],
  ['kit-kits', '鼓组采样 drum kit samples'],
]);
const browseCategories = new Map<string, { category: string; categoryEvidence: string }>();
for (const section of SAMPLE_CATALOG) {
  for (const group of section.groups) {
    // The extra kit pieces also include effects, so the shelf is too broad.
    if (group.id === 'fx-more' || group.id === 'kit-kit-parts') continue;
    for (const { name, label } of group.samples) {
      // A machine's name identifies the bank. Only its labeled roles describe the sound.
      if (section.id === 'machines' && !name.endsWith('_perc') && !name.endsWith('_fx')) continue;
      const category = section.id === 'machines' ? label?.join(' ') :
        browseGroupCategories.get(group.id) ?? group.title.join(' ');
      if (category && !browseCategories.has(name)) {
        browseCategories.set(name, { category, categoryEvidence: `browse directory: ${group.id}` });
      }
    }
  }
}

export function categoryFromBrowseDirectory(key: string) {
  return browseCategories.get(key);
}

export interface FileReference {
  id: string; library: string; key: string; path: string; url: string;
  index: number; rootNote: string | null; active: boolean; aliases: string[];
  category: string | null; categoryEvidence: string | null;
  articulation: string | null;
  catalogKey?: string;
  render?: { font?: string; variant?: number };
}
export function categoryFor(library: string, key: string, file: string) {
  if (library === 'piano') return { category: '钢琴 piano', categoryEvidence: 'piano index', articulation: null };
  if (library === 'mridangam') return { category: 'Mridangam 手鼓 percussion', categoryEvidence: 'mridangam index', articulation: null };
  if (library === 'dirt-samples' && DIRT_SAMPLE_ALIASES.some(([source]) => source === key)) {
    return { category: key === 'sax' ? '萨克斯 saxophone' : roles[key] ?? null,
      categoryEvidence: 'Dirt Samples index name', articulation: null };
  }
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
  for (const library of SAMPLE_LIBRARIES) {
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
    if (!record.active && record.library === 'dirt-samples') {
      record.catalogKey = DIRT_SAMPLE_ALIASES.find(([key]) => key === record.key)?.[1];
    }
    if (record.library === 'tidal-drum-machines') {
      const split = record.key.indexOf('_');
      const alias = aliases[record.key.slice(0, split)];
      if (alias) record.aliases = [alias + record.key.slice(split)];
    }
  }
  for (const [key, file] of Object.entries(FEATURED_SAMPLE_FILES)) {
    const library = 'featured';
    records.push({ id: digest(JSON.stringify([library, key, file])), library, key,
      path: file, url: new URL(file, FEATURED_SAMPLE_BASE).href, index: 0, rootNote: null, active: true, aliases: [],
      category: key === 'cover360_vocals' ? '人声 vocals' : '快门音效 camera shutter',
      categoryEvidence: 'featured track source', articulation: null });
  }
  const synthAliases = { sawtooth: ['saw'], sine: ['sin'], square: ['sqr'], triangle: ['tri'] };
  const waveformAliases = new Set(Object.values(synthAliases).flat());
  for (const section of SAMPLE_CATALOG.filter(section => section.id === 'gm' || section.id === 'synths')) {
    for (const group of section.groups) for (const { name: key } of group.samples) {
      if (waveformAliases.has(key)) continue;
      const fonts: string[] | undefined = gm[key as keyof typeof gm];
      if (!fonts && !BUILTIN_SYNTHS.has(key)) throw Error('Unregistered rendered timbre: ' + key);
      const aliases = fonts ? Object.keys(GM_NAME_ALIASES).filter(alias => GM_NAME_ALIASES[alias] === key)
        : synthAliases[key as keyof typeof synthAliases] ?? [];
      const library = fonts ? 'gm' : 'synths';
      const defaultNote = key === 'sbd' || group.id === 'synth-noise' ? null : group.note ?? 'c4';
      const presets = fonts ?? Array.from({ length: key === 'bytebeat' ? 16 : 1 }, () => undefined);
      presets.forEach((font, index) => {
        const rootNote = (font && gmPreviewNotes[font]) || defaultNote;
        const variant = fonts || key === 'bytebeat' ? index : undefined;
        const revision = key === 'supersaw' ? 2 : 1;
        const id = digest(JSON.stringify([library, key, font, index, rootNote, revision]));
        records.push({ id, library, key, path: id + '.wav', url: 'rendered:' + id, index, rootNote, active: true,
          aliases, category: group.title.join(' '), categoryEvidence: 'built-in timbre directory',
          articulation: null, render: { font, variant } });
      });
    }
  }
  return records;
}
