// @vitest-environment happy-dom
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  hashImportedContent,
  parseOddeNovaImportHash,
  type OddeNovaImportPayload,
} from '../oddenova-import';

const payload: OddeNovaImportPayload = {
  protocolVersion: 1,
  source: 'oddenova-strudel-skill',
  projectId: 'project-1',
  title: '雨夜 Lo-fi',
  code: 'setcps(0.375)\nstack(s("bd"))',
  messages: [{ role: 'user', content: '做一段雨夜 lo-fi' }],
  locale: 'zh-CN',
};

function fragment(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return `#oddenova=${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
}

function compressedFragment(value: unknown): string {
  const compressed = deflateRawSync(Buffer.from(JSON.stringify(value), 'utf8'));
  return `#oddenova=z:${compressed.toString('base64url')}`;
}

describe('parseOddeNovaImportHash', () => {
  it('decodes legacy uncompressed Unicode payloads', async () => {
    await expect(parseOddeNovaImportHash(fragment(payload))).resolves.toEqual({ kind: 'payload', payload });
  });

  it('decodes deflate-raw compressed payloads behind the z: marker', async () => {
    await expect(parseOddeNovaImportHash(compressedFragment(payload)))
      .resolves.toEqual({ kind: 'payload', payload });
  });

  it('distinguishes absent, invalid, and unsupported imports', async () => {
    await expect(parseOddeNovaImportHash('')).resolves.toEqual({ kind: 'none' });
    await expect(parseOddeNovaImportHash('#oddenova=%%%')).resolves.toEqual({ kind: 'error', reason: 'invalid' });
    await expect(parseOddeNovaImportHash('#oddenova=z:%%%')).resolves.toEqual({ kind: 'error', reason: 'invalid' });
    await expect(parseOddeNovaImportHash(fragment({ ...payload, protocolVersion: undefined })))
      .resolves.toEqual({ kind: 'error', reason: 'invalid' });
    await expect(parseOddeNovaImportHash(fragment({ ...payload, protocolVersion: 2 })))
      .resolves.toEqual({ kind: 'error', reason: 'unsupported-version' });
    await expect(parseOddeNovaImportHash(fragment({ ...payload, source: 'other' })))
      .resolves.toEqual({ kind: 'error', reason: 'invalid' });
  });
});

it('hashes only canonical title, code, and role/content messages', () => {
  const first = hashImportedContent(payload);
  expect(first).toBe(hashImportedContent({ ...payload, locale: 'en' }));
  expect(first).not.toBe(hashImportedContent({ ...payload, code: 'setcps(0.5)\nstack(s("bd"))' }));
});
