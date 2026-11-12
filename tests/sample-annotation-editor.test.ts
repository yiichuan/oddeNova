import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createAnnotationEditor } from '../server/sample-annotation-editor';
import type { ListeningFeatures, SearchCatalog } from '../src/lib/sample-search';
import { serializeFullCatalog } from '../src/lib/sample-catalog-context';

const sha = 'a'.repeat(64);
const model: ListeningFeatures = {
  structure: { event_form: 'single_event', pitchedness: 'unknown' },
  timbre: { brightness: 'dark', body: 'unknown', texture_tags: [], distortion: 'unknown' },
  envelope: { attack: 'unknown', shape: 'unknown', tail: 'unknown' },
  space: { reverb: 'unknown' },
};
const edited = { ...model, timbre: { ...model.timbre, brightness: 'bright' } };

let root: string;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

async function fixture() {
  root = await mkdtemp(join(tmpdir(), 'sample-annotation-editor-'));
  const catalogPath = join(root, 'public/sample-annotations/catalog.json');
  const releasesPath = join(root, '.local/sample-annotations/expert-releases.json');
  const catalog: SearchCatalog = {
    schemaVersion: 1, fingerprint: 'f'.repeat(64),
    samples: ['808', 'RolandTR808_cb'].map((key, index) => ({
      key, aliases: [], category: 'percussion', summary: '偏暗 dark',
      variants: [{
        id: String(index), sha256: sha, index, rootNote: null, articulation: null,
        features: model, annotationStatus: 'model_initial', playback: `s("${key}:${index}")`,
      }],
    })),
  };
  await mkdir(dirname(catalogPath), { recursive: true });
  await writeFile(catalogPath, JSON.stringify(catalog));
  return {
    catalog, releasesPath, catalogPath,
    edit: createAnnotationEditor(root),
    readCatalog: async () => JSON.parse(await readFile(catalogPath, 'utf8')) as SearchCatalog,
  };
}

it('persists shared drafts without changing retrieval, then publishes every reference and preserves the model values', async () => {
  const { catalog, edit, readCatalog, releasesPath } = await fixture();
  const initial = await edit(sha);
  const draft = await edit(sha, { action: 'save', revision: initial.revision, features: edited });
  expect(serializeFullCatalog(await readCatalog()).text).toBe(serializeFullCatalog(catalog).text);

  const reopened = createAnnotationEditor(root);
  expect(await reopened(sha)).toEqual(draft);
  await expect(reopened(sha, { action: 'discard', revision: initial.revision })).rejects.toMatchObject({ status: 409 });
  const published = await reopened(sha, { action: 'publish', revision: draft.revision });
  expect(published).toMatchObject({ draft: null, modelFeatures: model, pendingPublication: false });
  const updated = await readCatalog();
  expect(updated.samples.map(sample => sample.summary)).toEqual(['明亮 bright', '明亮 bright']);
  for (const [index, sample] of updated.samples.entries()) {
    expect(sample.variants[0]).toEqual({
      ...catalog.samples[index].variants[0], features: edited, modelFeatures: model, annotationStatus: 'expert_confirmed',
    });
  }
  expect(serializeFullCatalog(updated).text).not.toContain('|dark|');
  const second = await reopened(sha, { action: 'save', revision: published.revision, features: model });
  await reopened(sha, { action: 'publish', revision: second.revision });
  expect((await readCatalog()).samples[0].variants[0].modelFeatures).toEqual(model);
  const release = JSON.parse(await readFile(releasesPath, 'utf8'))[sha];
  expect(release.version).toBe(2);
  expect(release).not.toHaveProperty('reviewer');
});

it('validates editable fields and catalog membership, and discards only the draft', async () => {
  const { catalog, edit, readCatalog } = await fixture();
  const state = await edit(sha);
  await expect(edit('b'.repeat(64))).rejects.toMatchObject({ status: 404 });
  await expect(edit('../catalog')).rejects.toMatchObject({ status: 400 });
  await expect(edit(sha, {
    action: 'save', revision: state.revision,
    features: { ...edited, timbre: { ...edited.timbre, texture_tags: ['airy', 'airy'] } },
  })).rejects.toMatchObject({ status: 400 });
  await expect(edit(sha, { action: 'publish', revision: state.revision })).rejects.toMatchObject({ status: 400 });
  const saved = await edit(sha, { action: 'save', revision: state.revision, features: edited });
  expect((await edit(sha, { action: 'discard', revision: saved.revision })).draft).toBeNull();
  expect(await readCatalog()).toEqual(catalog);
});

it('resumes an interrupted publication without allocating a second confirmation version', async () => {
  const { edit, releasesPath, readCatalog } = await fixture();
  const state = await edit(sha);
  const saved = await edit(sha, { action: 'save', revision: state.revision, features: edited });
  const release = {
    status: 'expert_confirmed', reviewer: 'Reviewer', version: 1,
    features: edited, draftRevision: saved.draft?.revision,
  };
  await writeFile(releasesPath, JSON.stringify({ [sha]: release }));
  const pending = await edit(sha);
  expect(pending.pendingPublication).toBe(true);
  expect((await readCatalog()).samples[0].variants[0].features).toEqual(model);
  await expect(edit(sha, { action: 'discard', revision: pending.revision })).rejects.toMatchObject({ status: 409 });
  await edit(sha, { action: 'publish', revision: pending.revision });
  expect(JSON.parse(await readFile(releasesPath, 'utf8'))[sha]).toEqual(release);
  expect((await readCatalog()).samples[0].variants[0].features).toEqual(edited);
});
