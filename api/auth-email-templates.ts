export type AuthEmailLanguage = 'zh' | 'en';
export type AuthEmailType = 'confirmation' | 'recovery';

interface AuthEmailCopy {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  fallback: string;
}

const COPY: Record<AuthEmailLanguage, Record<AuthEmailType, AuthEmailCopy>> = {
  zh: {
    confirmation: {
      subject: '确认你的 oddeNova 邮箱',
      heading: '确认你的邮箱',
      body: '点击下方按钮，完成 oddeNova 注册。',
      cta: '确认邮箱',
      fallback: '如果按钮无法打开，请复制下方链接到浏览器：',
    },
    recovery: {
      subject: '重置你的 oddeNova 密码',
      heading: '重置你的密码',
      body: '点击下方按钮，为 oddeNova 设置新密码。',
      cta: '重置密码',
      fallback: '如果按钮无法打开，请复制下方链接到浏览器：',
    },
  },
  en: {
    confirmation: {
      subject: 'Confirm your oddeNova email',
      heading: 'Confirm your email',
      body: 'Use the button below to finish creating your oddeNova account.',
      cta: 'Confirm email address',
      fallback: 'If the button does not work, copy this link into your browser:',
    },
    recovery: {
      subject: 'Reset your oddeNova password',
      heading: 'Reset your password',
      body: 'Use the button below to set a new password for oddeNova.',
      cta: 'Reset password',
      fallback: 'If the button does not work, copy this link into your browser:',
    },
  },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] as string);
}

export function renderAuthEmail({
  type,
  language,
  actionLink,
  email,
}: {
  type: AuthEmailType;
  language: AuthEmailLanguage;
  actionLink: string;
  email: string;
}): { subject: string; html: string } {
  const copy = COPY[language][type];
  const href = escapeHtml(actionLink);
  const recipient = escapeHtml(email);
  const documentLanguage = language === 'zh' ? 'zh-CN' : 'en';

  return {
    subject: copy.subject,
    html: `<!doctype html>
<html lang="${documentLanguage}">
  <body style="margin:0; padding:0; background:#f4f7fb; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#14233a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px; background:#ffffff; border-radius:12px; overflow:hidden;">
          <tr><td style="padding:28px 32px; background:#172d57; color:#ffffff; font-size:24px; font-weight:800;">oddeNova</td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 16px; font-size:24px;">${copy.heading}</h1>
            <p style="margin:0 0 12px; line-height:1.6;">${copy.body}</p>
            <p style="margin:0 0 24px; line-height:1.6;">${recipient}</p>
            <a href="${href}" style="display:inline-block; padding:14px 22px; color:#ffffff; background:#2864d8; border-radius:6px; font-weight:800; text-decoration:none;">${copy.cta}</a>
            <p style="margin:28px 0 8px; color:#60708a; font-size:13px; line-height:1.6;">${copy.fallback}</p>
            <a href="${href}" style="color:#2864d8; font-size:13px; overflow-wrap:anywhere;">${href}</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
