import { SAMPLE_CATALOG, type Bilingual } from '../lib/sample-catalog';

interface DirectoryPath {
  category: { id: string; title: Bilingual; order: number };
  group: { id: string; title: Bilingual; order: number };
  sampleOrder: number;
  searchText: string;
}

const paths = new Map<string, DirectoryPath>();
SAMPLE_CATALOG.forEach(({ id, title, groups }, order) => {
  const category = { id, title, order };
  groups.forEach((item, groupOrder) => {
    const group = { id: item.id, title: item.title, order: groupOrder };
    const searchText = [...title, ...item.title].join(' ').toLowerCase();
    item.samples.forEach(({ name }, sampleOrder) => {
      if (!paths.has(name)) paths.set(name, { category, group, sampleOrder, searchText });
    });
  });
});

const uncategorized: DirectoryPath = {
  category: { id: 'other', title: ['其他音色', 'Other sounds'], order: SAMPLE_CATALOG.length },
  group: { id: 'unclassified', title: ['未分类', 'Unclassified'], order: 0 },
  sampleOrder: 0,
  searchText: '其他音色 other sounds 未分类 unclassified',
};

export function directoryPath(key: string): DirectoryPath {
  return paths.get(key) ?? uncategorized;
}

export function groupDirectory<T extends { sample: { key: string } }>(results: readonly T[], ranked: boolean) {
  type Group = DirectoryPath['group'] & { entries: { result: T; order: number }[] };
  type Category = DirectoryPath['category'] & { count: number; groups: Map<string, Group> };
  const categories = new Map<string, Category>();
  for (const result of results) {
    const path = directoryPath(result.sample.key);
    let category = categories.get(path.category.id);
    if (!category) {
      category = { ...path.category, count: 0, groups: new Map() };
      categories.set(category.id, category);
    }
    let group = category.groups.get(path.group.id);
    if (!group) {
      group = { ...path.group, entries: [] };
      category.groups.set(group.id, group);
    }
    group.entries.push({ result, order: path.sampleOrder });
    category.count++;
  }
  return [...categories.values()].sort((a, b) => a.order - b.order).map(category => ({
    ...category,
    groups: [...category.groups.values()].sort((a, b) => a.order - b.order).map(({ entries, ...group }) => ({
      ...group,
      results: (ranked ? entries : entries.sort((a, b) => a.order - b.order)).map(entry => entry.result),
    })),
  }));
}
