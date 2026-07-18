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
    expect(config).toContain('subject = "Confirm your oddeNova email"');
    expect(config).toContain('content_path = "./supabase/templates/confirmation.html"');
    expect(config).toContain('[auth.email.template.recovery]');
    expect(config).toContain('subject = "Reset your oddeNova password"');
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
});
