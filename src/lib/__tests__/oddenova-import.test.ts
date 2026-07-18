// @vitest-environment happy-dom
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

describe('parseOddeNovaImportHash', () => {
  it('decodes Unicode protocol version 1 payloads', () => {
    expect(parseOddeNovaImportHash(fragment(payload))).toEqual({ kind: 'payload', payload });
  });

  it('distinguishes absent, invalid, and unsupported imports', () => {
    expect(parseOddeNovaImportHash('')).toEqual({ kind: 'none' });
    expect(parseOddeNovaImportHash('#oddenova=%%%')).toEqual({ kind: 'error', reason: 'invalid' });
    expect(parseOddeNovaImportHash(fragment({ ...payload, protocolVersion: undefined })))
      .toEqual({ kind: 'error', reason: 'invalid' });
    expect(parseOddeNovaImportHash(fragment({ ...payload, protocolVersion: 2 })))
      .toEqual({ kind: 'error', reason: 'unsupported-version' });
    expect(parseOddeNovaImportHash(fragment({ ...payload, source: 'other' })))
      .toEqual({ kind: 'error', reason: 'invalid' });
  });
});

it('hashes only canonical title, code, and role/content messages', () => {
  const first = hashImportedContent(payload);
  expect(first).toBe(hashImportedContent({ ...payload, locale: 'en' }));
  expect(first).not.toBe(hashImportedContent({ ...payload, code: 'setcps(0.5)\nstack(s("bd"))' }));
});
