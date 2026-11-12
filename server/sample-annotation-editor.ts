import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';
import { applyExpertRelease, summarizeSample, validFeatures, validRelease, type ExpertRelease } from '../scripts/sample-annotations/listening-features';
import type { SearchCatalog } from '../src/lib/sample-search';
import type { AnnotationCommand, AnnotationDraft, AnnotationReview } from '../src/sample-library/annotation-editor-types';

class EditorError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

async function optionalJson<T>(file: string): Promise<T | null> {
  try {
    return await readJson<T>(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function replaceJson(file: string, value: unknown) {
  await mkdir(dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, JSON.stringify(value), { flag: 'wx' });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

const shaPattern = /^[a-f0-9]{64}$/;

export function createAnnotationEditor(root: string) {
  const data = join(root, '.local/sample-annotations');
  const catalogFile = join(root, 'public/sample-annotations/catalog.json');
  const releaseFile = join(data, 'expert-releases.json');
  let queue: Promise<unknown> = Promise.resolve();

  async function run(hash: string, command?: AnnotationCommand): Promise<AnnotationReview> {
    if (!shaPattern.test(hash)) throw new EditorError(400, '音频哈希无效。');
    const draftFile = join(data, 'expert-drafts', hash + '.json');
    const [catalog, releases, draft] = await Promise.all([
      readJson<SearchCatalog>(catalogFile),
      optionalJson<Record<string, ExpertRelease>>(releaseFile).then(value => value ?? {}),
      optionalJson<AnnotationDraft>(draftFile),
    ]);
    const variants = catalog.samples.flatMap(sample => sample.variants.filter(variant => variant.sha256 === hash));
    if (!variants.length) throw new EditorError(404, '该音频已不在目录中，请刷新页面。');
    const modelVariant = variants.find(variant => variant.annotationStatus === 'model_initial');
    const original = modelVariant?.features ?? variants.find(variant => variant.modelFeatures)?.modelFeatures;
    let modelFeatures = original ?? null;
    if (!modelFeatures && catalog.fingerprint && shaPattern.test(catalog.fingerprint)) {
      const raw = await optionalJson<{ status: string; annotation: Record<string, unknown> }>(
        join(data, 'annotations', catalog.fingerprint, hash + '.json'),
      );
      if (raw?.status === 'valid') {
        const { structure, timbre, envelope, space } = raw.annotation;
        const features = { structure, timbre, envelope, space };
        if (validFeatures(features)) modelFeatures = features;
      }
    }

    const release = releases[hash];
    function state(currentDraft: AnnotationDraft | null): AnnotationReview {
      const currentRelease = releases[hash];
      const revision = createHash('sha256').update(JSON.stringify([
        catalog.fingerprint, variants, currentRelease, currentDraft,
      ])).digest('hex');
      return {
        revision, draft: currentDraft, modelFeatures, effectiveFeatures: variants[0].features,
        pendingPublication: currentDraft !== null && validRelease(currentRelease) && currentRelease.draftRevision === currentDraft.revision,
      };
    }

    const current = state(draft);
    if (!command) return current;
    if (command.revision !== current.revision) throw new EditorError(409, '标注已更新，请重新载入后再操作。');
    if (current.pendingPublication && command.action !== 'publish') {
      throw new EditorError(409, '上次发布尚未完成，请先重试发布。');
    }
    if (command.action === 'save') {
      if (!validFeatures(command.features)) throw new EditorError(400, '听感字段不符合标注格式。');
      const next = { revision: randomUUID(), features: command.features };
      await replaceJson(draftFile, next);
      return state(next);
    }
    if (command.action === 'discard') {
      await rm(draftFile, { force: true });
      return state(null);
    }
    if (command.action !== 'publish') throw new EditorError(400, '不支持的操作。');
    if (!draft || !validFeatures(draft.features)) {
      throw new EditorError(400, '请先保存有效草稿。');
    }

    const confirmed: ExpertRelease = current.pendingPublication ? release : {
      status: 'expert_confirmed', features: draft.features,
      version: validRelease(release) ? release.version + 1 : 1,
      confirmedAt: new Date().toISOString(), draftRevision: draft.revision,
    };
    if (!current.pendingPublication) await replaceJson(releaseFile, { ...releases, [hash]: confirmed });
    try {
      for (const sample of catalog.samples) {
        if (!sample.variants.some(variant => variant.sha256 === hash)) continue;
        sample.variants = sample.variants.map(variant => variant.sha256 === hash
          ? applyExpertRelease({ ...variant, modelFeatures }, confirmed) : variant);
        sample.summary = summarizeSample(sample.variants);
      }
      await replaceJson(catalogFile, catalog);
    } catch {
      throw new EditorError(500, '确认记录已保存，目录尚未更新。请重试发布。');
    }
    try {
      await rm(draftFile, { force: true });
    } catch {
      throw new EditorError(500, '目录已更新，草稿清理失败。请重试发布。');
    }
    return run(hash);
  }

  return (hash: string, command?: AnnotationCommand) => {
    const result = queue.then(() => run(hash, command));
    queue = result.catch(() => undefined);
    return result;
  };
}

function isLocal(req: IncomingMessage) {
  const address = req.socket.remoteAddress ?? '';
  if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(address) || !req.headers.host) return false;
  const host = new URL('http://' + req.headers.host).hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return false;
  const origin = req.headers.origin;
  return req.method === 'GET'
    ? (!origin || origin === 'http://' + req.headers.host)
    : origin === 'http://' + req.headers.host;
}

async function readCommand(req: IncomingMessage): Promise<AnnotationCommand> {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw new EditorError(415, '请求必须使用 JSON。');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of req.iterator({ destroyOnReturn: false })) {
    const chunk = Buffer.from(part);
    size += chunk.length;
    if (size > 8192) {
      req.resume();
      throw new EditorError(413, '请求过大。');
    }
    chunks.push(chunk);
  }
  try {
    const command = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!command || typeof command.revision !== 'string') throw new Error();
    return command;
  } catch {
    throw new EditorError(400, '请求格式无效。');
  }
}

function respond(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

export function sampleAnnotationEditor(): Plugin {
  return {
    name: 'sample-annotation-editor',
    apply: 'serve',
    configureServer(server) {
      const edit = createAnnotationEditor(server.config.root);
      server.middlewares.use('/api/local/sample-annotations', async (req, res) => {
        try {
          if (!isLocal(req)) throw new EditorError(403, '仅本机开发页面可编辑标注。');
          if (req.method !== 'GET' && req.method !== 'POST') throw new EditorError(405, '不支持的请求方式。');
          const hash = (req.url ?? '').slice(1);
          const command = req.method === 'POST' ? await readCommand(req) : undefined;
          respond(res, 200, await edit(hash, command));
        } catch (error) {
          if (error instanceof EditorError) respond(res, error.status, { error: error.message });
          else {
            server.config.logger.error(String(error));
            respond(res, 500, { error: '标注读写失败，请重试。' });
          }
        }
      });
    },
  };
}
