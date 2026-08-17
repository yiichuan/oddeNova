import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');
const configPath = resolve(repoRoot, 'supabase/config.toml');

function readTemplate(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Supabase auth email templates', () => {
  test('configures branded confirmation and recovery templates', () => {
    const config = readFileSync(configPath, 'utf8');

    expect(config).toContain('[auth.email.template.confirmation]');
    expect(config).toContain('subject = "{{ if eq .Data.language \\"zh\\" }}确认你的 oddeNova 邮箱{{ else }}Confirm your oddeNova email{{ end }}"');
    expect(config).toContain('content_path = "./supabase/templates/confirmation.html"');
    expect(config).toContain('[auth.email.template.recovery]');
    expect(config).toContain('subject = "{{ if eq .Data.language \\"zh\\" }}重置你的 oddeNova 密码{{ else }}Reset your oddeNova password{{ end }}"');
    expect(config).toContain('content_path = "./supabase/templates/recovery.html"');
  });

  test('requires passwords of at least eight characters without composition rules', () => {
    const config = readFileSync(configPath, 'utf8');

    expect(config).toContain('minimum_password_length = 8');
    expect(config).toContain('password_requirements = ""');
  });

  test('documents the configured weak-password rule in both UI languages', () => {
    const translations = readTemplate('./src/lib/i18n.ts');

    expect(translations).toContain("authErrorWeakPassword:['密码至少需要 8 个字符。', 'Your password must be at least 8 characters.']");
  });

  test.each([
    ['confirmation', './supabase/templates/confirmation.html', 'Confirm email address'],
    ['recovery', './supabase/templates/recovery.html', 'Reset password'],
  ])('%s template includes the required action link and fallback URL', (_name, templatePath, ctaText) => {
    const html = readTemplate(templatePath);

    expect(html).toContain('oddeNova');
    expect(html).toContain(ctaText);
    expect(html).toContain('href="{{ .ConfirmationURL }}"');
    expect(html).toContain('{{ .ConfirmationURL }}');
    expect(html).toContain('{{ .Email }}');
  });

  test.each([
    ['./supabase/templates/confirmation.html', '确认邮箱', 'Confirm email address'],
    ['./supabase/templates/recovery.html', '重置密码', 'Reset password'],
  ])('uses metadata language to choose the localized copy in %s', (templatePath, chineseCta, englishCta) => {
    const html = readTemplate(templatePath);

    expect(html).toContain('{{ if eq .Data.language "zh" }}');
    expect(html).toContain(chineseCta);
    expect(html).toContain(englishCta);
  });
});
