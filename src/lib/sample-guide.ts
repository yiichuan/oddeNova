import type { SearchCatalog, SearchSample } from './sample-search';
import { serializeFullCatalog } from './sample-catalog-context';

const cell = (value: unknown) => String(value ?? '-')
  .replaceAll('|', '\\u007c').replaceAll('\r', '\\r').replaceAll('\n', '\\n');

let pending: Promise<ReadonlyMap<string, string>> | undefined;

export function loadSampleOverviews() {
  pending ??= fetch('/sample-annotations/guide.json', { cache: 'no-cache' }).then(async response => {
    if (!response.ok) throw Error(`Sample guide unavailable (HTTP ${response.status})`);
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid sample guide');
    const entries = Object.entries(data);
    if (!entries.length || entries.some(([, value]) => typeof value !== 'string' || !value.trim())) {
      throw Error('Invalid sample guide');
    }
    return new Map<string, string>(entries);
  }).catch(error => {
    pending = undefined;
    throw error;
  });
  return pending;
}

export function createSampleGuide(catalog: SearchCatalog, overviews: ReadonlyMap<string, string>) {
  const categories = new Map<string, SearchSample[]>();
  for (const sample of catalog.samples) {
    const category = sample.category ?? '未分类';
    const group = categories.get(category) ?? [];
    group.push(sample);
    categories.set(category, group);
  }
  const guide = ['目录列顺序：音色名称|听感概览'];
  for (const [category, samples] of categories) {
    guide.push(`@ ${cell(category)}（${samples.length} 个音色）`);
    for (const sample of samples) {
      guide.push([sample.key, overviews.get(sample.key) ?? (sample.summary || '听感标注待补充')].map(cell).join('|'));
    }
  }

  const { rows, legend, variantTexts } = serializeFullCatalog(catalog);
  const details = new Map<string, Array<{ id: string; row: (typeof rows)[string]; text: string }>>();
  for (const [id, row] of Object.entries(rows)) {
    const { sample, variant } = row;
    const group = details.get(sample.key) ?? [];
    group.push({
      id, row,
      text: [
        variantTexts.get(variant)!.split('\n').at(-1),
        cell(variant.soundDescription?.text), cell(variant.soundDescription?.associations.join('、')),
        cell(variant.playback),
      ].join('|'),
    });
    details.set(sample.key, group);
  }

  return {
    guide: guide.join('\n'),
    startLookup() {
      const loaded = new Set<string>();
      const allowed: typeof rows = Object.create(null);
      return {
        allowed,
        read(args: unknown) {
          const names = (args as { names?: unknown } | null)?.names;
          if (!Array.isArray(names) || !names.length || names.some(name => typeof name !== 'string')) {
            return 'names 必须是非空的准确音色名称数组。';
          }
          const lines: string[] = [];
          for (const name of new Set<string>(names)) {
            const group = details.get(name);
            if (!group?.length) lines.push(`未知音色名称或没有文件：${cell(name)}`);
            else if (loaded.has(name)) lines.push(`已展开：${cell(name)}。完整详情在此前工具消息中，请直接使用。`);
            else {
              if (!loaded.size) lines.push(legend.replace('tail|reverb', 'tail|reverb|声音描述|听感联想|播放示例'));
              lines.push(`@ ${cell(name)} | ${cell(group[0].row.sample.category)}`);
              for (const { id, row, text } of group) {
                allowed[id] = row;
                lines.push(text);
              }
              loaded.add(name);
            }
          }
          lines.push(`全部已读音色：${JSON.stringify([...loaded])}`);
          lines.push('已读详情保留在对话中。候选和证据充分时可直接返回；仍有具体需求缺口时可展开相关未读音色。');
          return lines.join('\n');
        },
      };
    },
  };
}
