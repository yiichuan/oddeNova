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
