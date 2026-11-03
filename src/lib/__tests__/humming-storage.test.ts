import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../hooks/useSessions';
import { hummingAttachment, hummingDraft } from './fixtures/humming';
import { clearHummingDraft, discardHummingDraft, deleteHummingDataForSession, getHummingAsset, getHummingDraft, replaceHummingDraftIfPersistent, saveHummingDraft } from '../humming-storage';

let db: IDBPDatabase;
let storageUnavailable = false;
vi.mock('../session-storage', () => ({
  openDB: async () => undefined,
  getStorageDb: () => storageUnavailable ? null : db,
  isSessionStoragePersistent: () => true,
  HUMMING_ASSET_STORE_NAME: 'assets', HUMMING_DRAFT_STORE_NAME: 'drafts', SESSION_STORE_NAME: 'sessions',
}));

function session(id: string, ownerKey = 'guest'): Session & { ownerKey: string } {
  return {
    id, ownerKey, title: id, code: '', createdAt: 1, updatedAt: 1,
    messages: [{ id: 'user-1', role: 'user', content: '', timestamp: 1, humming: hummingAttachment() }],
  };
}

describe('humming asset references', () => {
beforeEach(async () => {
  storageUnavailable = false;
    vi.stubGlobal('indexedDB', new IDBFactory());
    db = await openDB('humming-test', 1, {
      upgrade(database) {
        const assets = database.createObjectStore('assets', { keyPath: ['ownerKey', 'id'] });
        assets.createIndex('by-owner-session', ['ownerKey', 'sessionId']);
        database.createObjectStore('drafts', { keyPath: ['ownerKey', 'sessionId'] });
        database.createObjectStore('sessions', { keyPath: ['ownerKey', 'id'] });
      },
    });
  });
afterEach(() => { db?.close(); vi.unstubAllGlobals(); });

  it('keeps a branch recording after deleting its source, then removes it after the last branch', async () => {
    await saveHummingDraft(hummingDraft());
    await clearHummingDraft('guest', 'source');
    await db.put('sessions', session('branch'));
    await deleteHummingDataForSession('guest', 'source');
    const asset = await getHummingAsset('guest', hummingAttachment().id);
    expect(asset?.blob).toBeInstanceOf(Blob);
    expect(asset?.sessionId).toBe('branch');

    await db.delete('sessions', ['guest', 'branch']);
    await deleteHummingDataForSession('guest', 'branch');
    expect(await getHummingAsset('guest', hummingAttachment().id)).toBeNull();
  });

  it('discarding a restored draft keeps another branch recording', async () => {
    await db.put('sessions', session('branch'));
    await saveHummingDraft(hummingDraft());
    await discardHummingDraft('guest', 'source');
    expect((await getHummingAsset('guest', hummingAttachment().id))?.sessionId).toBe('branch');
    expect(await db.get('drafts', ['guest', 'source'])).toBeUndefined();
  });

  it('keeps an in-memory branch while its checkpoint is still pending', async () => {
    await saveHummingDraft(hummingDraft());
    await deleteHummingDataForSession('guest', 'source', [session('branch')]);
    expect((await getHummingAsset('guest', hummingAttachment().id))?.sessionId).toBe('branch');
  });

  it('does not use another account reference to retain the deleted recording', async () => {
    await saveHummingDraft(hummingDraft());
    await db.put('sessions', session('other-account-branch', 'user:other'));
    await deleteHummingDataForSession('guest', 'source');
    expect(await getHummingAsset('guest', hummingAttachment().id)).toBeNull();
  });

  it('keeps a recording referenced by another unsent draft', async () => {
    await saveHummingDraft(hummingDraft());
    await saveHummingDraft(hummingDraft('branch'));
    await deleteHummingDataForSession('guest', 'source');
    expect(await getHummingAsset('guest', hummingAttachment().id)).not.toBeNull();
    await deleteHummingDataForSession('guest', 'branch');
    expect(await getHummingAsset('guest', hummingAttachment().id)).toBeNull();
  });

  it('atomically replaces an unreferenced draft and removes its old local asset', async () => {
    const original = hummingDraft();
    const replacement = { ...hummingDraft(), id: '22222222-2222-4222-8222-222222222222', createdAt: 2 };
    await saveHummingDraft(original);

    expect(await replaceHummingDraftIfPersistent(replacement)).toEqual({ persistent: true });
    expect((await getHummingDraft('guest', 'source'))?.id).toBe(replacement.id);
    expect(await getHummingAsset('guest', original.id)).toBeNull();
    expect(await getHummingAsset('guest', replacement.id)).not.toBeNull();
  });

  it('keeps the prior asset when a message still references it', async () => {
    const original = hummingDraft();
    const replacement = { ...hummingDraft(), id: '33333333-3333-4333-8333-333333333333', createdAt: 2 };
    await saveHummingDraft(original);
    await db!.put('sessions', session('branch'));

    await replaceHummingDraftIfPersistent(replacement);

    expect((await getHummingDraft('guest', 'source'))?.id).toBe(replacement.id);
    expect(await getHummingAsset('guest', original.id)).not.toBeNull();
  });

  it('does not change the durable draft when storage is unavailable', async () => {
    const original = hummingDraft();
    const replacement = { ...hummingDraft(), id: '44444444-4444-4444-8444-444444444444', createdAt: 2 };
    await saveHummingDraft(original);
    storageUnavailable = true;

    expect(await replaceHummingDraftIfPersistent(replacement)).toEqual({ persistent: false });
    storageUnavailable = false;

    expect((await getHummingDraft('guest', 'source'))?.id).toBe(original.id);
    expect(await getHummingAsset('guest', replacement.id)).toBeNull();
  });

  it('does not change the durable draft when replacement is aborted', async () => {
    const original = hummingDraft();
    const replacement = { ...hummingDraft(), id: '55555555-5555-4555-8555-555555555555', createdAt: 2 };
    await saveHummingDraft(original);
    const controller = new AbortController();
    const pending = replaceHummingDraftIfPersistent(replacement, controller.signal);
    controller.abort();

    expect(await pending).toEqual({ persistent: false });
    expect((await getHummingDraft('guest', 'source'))?.id).toBe(original.id);
    expect(await getHummingAsset('guest', replacement.id)).toBeNull();
  });
});
