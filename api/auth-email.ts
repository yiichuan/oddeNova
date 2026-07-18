import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  renderAuthEmail,
  type AuthEmailLanguage,
  type AuthEmailType,
} from './auth-email-templates';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AuthEmailRequest {
  type?: unknown;
  email?: unknown;
  password?: unknown;
  language?: unknown;
}

function isEmailType(value: unknown): value is AuthEmailType {
  return value === 'confirmation' || value === 'recovery';
}

function isLanguage(value: unknown): value is AuthEmailLanguage {
  return value === 'zh' || value === 'en';
}

function getRedirectTo(req: VercelRequest): string {
  const origin = req.headers.origin;
  return `${typeof origin === 'string' && origin ? origin : 'https://www.oddenova.com'}/`;
}

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured');
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function sendWithResend(email: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error('Email sender is not configured');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [email], subject, html }),
  });
  if (!response.ok) throw new Error('Email provider request failed');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = (req.body ?? {}) as AuthEmailRequest;
  const { type, email, password, language } = body;
  if (
    !isEmailType(type)
    || !isLanguage(language)
    || typeof email !== 'string'
    || !EMAIL_PATTERN.test(email)
    || (type === 'confirmation' && (typeof password !== 'string' || password.length < 8))
  ) {
    res.status(400).json({ error: 'Invalid email request' });
    return;
  }

  try {
    const admin = getAdminClient();
    const redirectTo = getRedirectTo(req);
    const { data, error } = type === 'confirmation'
      ? await admin.auth.admin.generateLink({ type: 'signup', email, password: password as string, options: { redirectTo } })
      : await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });

    if (type === 'recovery' && (error || !data.properties?.action_link)) {
      res.status(200).json({ ok: true });
      return;
    }
    if (error || !data.properties?.action_link) {
      res.status(400).json({ error: 'Unable to send confirmation email' });
      return;
    }

    const message = renderAuthEmail({ type, language, email, actionLink: data.properties.action_link });
    await sendWithResend(email, message.subject, message.html);
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Unable to send email' });
  }
}
