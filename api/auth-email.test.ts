import { describe, expect, it } from 'vitest';
import { renderAuthEmail } from './auth-email-templates';

describe('renderAuthEmail', () => {
  it.each([
    ['confirmation', 'zh', '确认你的 oddeNova 邮箱', '确认邮箱'],
    ['confirmation', 'en', 'Confirm your oddeNova email', 'Confirm email address'],
    ['recovery', 'zh', '重置你的 oddeNova 密码', '重置密码'],
    ['recovery', 'en', 'Reset your oddeNova password', 'Reset password'],
  ] as const)('renders %s in %s', (type, language, subject, cta) => {
    const result = renderAuthEmail({
      type,
      language,
      actionLink: 'https://auth.example/link',
      email: 'user@example.com',
    });

    expect(result.subject).toBe(subject);
    expect(result.html).toContain(`<html lang="${language === 'zh' ? 'zh-CN' : 'en'}">`);
    expect(result.html).toContain(cta);
    expect(result.html).toContain('href="https://auth.example/link"');
    expect(result.html).toContain('https://auth.example/link');
    expect(result.html).toContain('user@example.com');
  });
});
